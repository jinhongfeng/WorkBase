import { dialog, ipcMain, shell } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import type { SkillImportResult, SkillQuery } from '@shared/types'
import { getSkill, getSkillRecord, listSkills, removeSkill, setSkillCover, toggleSkillPin } from '../db/repo/skills'
import {
  createBlankSkill, createSkillFromPackage, duplicateSkill, packagePath, readDirectoryPackage,
  readMarkdownPackage, readZipPackage, saveSkillEntry
} from '../skills'
import { discardUnassignedCover, fetchCoverFromUrl, saveCoverFile } from '../assets'
import { fail } from './errors'
import { validate } from './validation'

const MAX_ZIP_BYTES = 40 * 1024 * 1024
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024

const idSchema = z.string().min(1).max(64)
const pathSchema = z.string().min(2).max(4096)

const listSchema = z.object({
  q: z.string().max(200).optional(),
  source: z.enum(['manual', 'import_zip', 'import_dir', 'import_md', 'duplicate', 'all']).optional(),
  tag: z.string().max(40).optional()
}).default({})

const saveSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  description: z.string().max(400),
  content: z.string().max(2_000_000),
  tags: z.array(z.string().min(1).max(40)).max(12)
})

const coverKindSchema = z.enum(['image', 'video'])

function requireSkill(id: string): void {
  if (!getSkillRecord(id)) fail('SKILL_NOT_FOUND', '这个 skill 已不存在，请刷新列表。')
}

async function attachCover(id: string, kind: 'image' | 'video', path: string, remote = '') {
  try {
    requireSkill(id)
    return setSkillCover(id, { kind, path, remote })
  } catch (error) {
    await discardUnassignedCover(path)
    throw error
  }
}

async function importZipFile(file: string): Promise<SkillImportResult> {
  let size = 0
  try {
    size = statSync(file).size
  } catch {
    fail('SKILL_ARCHIVE_FAILED', '读取不到这个压缩包。')
  }
  if (size > MAX_ZIP_BYTES) fail('SKILL_ARCHIVE_UNSAFE', '压缩包不能超过 40MB。')
  const files = await readZipPackage(readFileSync(file))
  return { canceled: false, skill: createSkillFromPackage(files, 'import_zip', basename(file)) }
}

function importDirectoryPath(directory: string): SkillImportResult {
  const files = readDirectoryPackage(directory)
  return { canceled: false, skill: createSkillFromPackage(files, 'import_dir', basename(directory)) }
}

function importMarkdownFile(file: string): SkillImportResult {
  let size = 0
  try {
    size = statSync(file).size
  } catch {
    fail('SKILL_NOT_FOUND', '读取不到这个文件。')
  }
  if (size > MAX_MARKDOWN_BYTES) fail('SKILL_NOT_FOUND', '单个 Markdown 文件不能超过 2MB。')
  const files = readMarkdownPackage(basename(file), readFileSync(file))
  return { canceled: false, skill: createSkillFromPackage(files, 'import_md', basename(file)) }
}

export function registerSkillsIPC(): void {
  ipcMain.handle(channels.skillsList, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([listSchema]), args)
    return listSkills(query as SkillQuery)
  })

  ipcMain.handle(channels.skillsGet, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    return getSkill(id)
  })

  ipcMain.handle(channels.skillsSave, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([saveSchema]), args)
    return saveSkillEntry(input)
  })

  ipcMain.handle(channels.skillsCreate, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ fromId: z.string().min(1).max(64).optional() }).optional()]), args)
    return input?.fromId ? duplicateSkill(input.fromId) : createBlankSkill()
  })

  ipcMain.handle(channels.skillsRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    // 只删数据库记录，磁盘包目录保留，避免误删他人分享的内容。
    removeSkill(id)
  })

  ipcMain.handle(channels.skillsPin, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    toggleSkillPin(id)
  })

  ipcMain.handle(channels.skillsImportZip, async (): Promise<SkillImportResult> => {
    const picked = await dialog.showOpenDialog({
      title: '导入 skill 压缩包',
      properties: ['openFile'],
      filters: [{ name: 'Skill 压缩包', extensions: ['zip'] }]
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return { canceled: true, skill: null }
    return importZipFile(file)
  })

  ipcMain.handle(channels.skillsImportDir, async (): Promise<SkillImportResult> => {
    const picked = await dialog.showOpenDialog({
      title: '导入 skill 目录（目录内需有 SKILL.md）',
      properties: ['openDirectory']
    })
    const directory = picked.filePaths[0]
    if (picked.canceled || !directory) return { canceled: true, skill: null }
    return importDirectoryPath(directory)
  })

  ipcMain.handle(channels.skillsImportMd, async (): Promise<SkillImportResult> => {
    const picked = await dialog.showOpenDialog({
      title: '导入单文件 skill',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return { canceled: true, skill: null }
    return importMarkdownFile(file)
  })

  // 拖拽导入与系统文件选择器共用同一套导入校验。
  ipcMain.handle(channels.skillsImportPath, (_event, ...args: unknown[]) => {
    const [path] = validate(z.tuple([pathSchema]), args)
    let info
    try {
      info = statSync(path)
    } catch {
      fail('SKILL_NOT_FOUND', '这个路径不存在或无法访问。')
    }
    if (info.isDirectory()) return importDirectoryPath(path)
    const extension = extname(path).toLowerCase()
    if (extension === '.zip') return importZipFile(path)
    if (extension === '.md' || extension === '.markdown') return importMarkdownFile(path)
    fail('SKILL_UNSUPPORTED', '只支持 ZIP 压缩包、目录或 Markdown 文件。')
  })

  ipcMain.handle(channels.skillsChooseCover, async (_event, ...args: unknown[]) => {
    const [id, kind] = validate(z.tuple([idSchema, coverKindSchema]), args)
    requireSkill(id)
    const picked = await dialog.showOpenDialog({
      title: kind === 'image' ? '选择封面图片' : '选择封面视频',
      properties: ['openFile'],
      filters: kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
        : [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'] }]
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return null
    return attachCover(id, kind, await saveCoverFile(file, kind))
  })

  ipcMain.handle(channels.skillsSetCoverUrl, async (_event, ...args: unknown[]) => {
    const [id, input] = validate(z.tuple([
      idSchema,
      z.object({ url: z.string().min(8).max(2048), kind: coverKindSchema })
    ]), args)
    requireSkill(id)
    return attachCover(id, input.kind, await fetchCoverFromUrl(input.url, input.kind), input.url.trim())
  })

  ipcMain.handle(channels.skillsClearCover, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    requireSkill(id)
    return setSkillCover(id, { kind: 'none', path: '', remote: '' })
  })

  ipcMain.handle(channels.skillsReveal, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    const record = getSkillRecord(id)
    if (!record) fail('SKILL_NOT_FOUND', '这个 skill 已不存在。')
    const error = await shell.openPath(packagePath(record.slug))
    if (error) fail('SKILL_NOT_FOUND', '无法打开包目录，请检查本地文件是否仍在。')
  })
}
