import { dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import type { MediaDuplicate, MediaImportResult, MediaItem } from '@shared/types'
import {
  IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, downloadMediaFromUrl, probeMediaBuffer, probeMediaFile,
  removeMediaFile, resolveAssetPath, storeMediaBuffer, storeMediaFile, type MediaKind
} from '../assets'
import {
  getMedia, insertMedia, listMedia, listMediaGroups, moveMediaToGroup, removeMedia,
  removeMediaGroup, requireMediaGroup, saveMediaGroup, findMediaByFingerprint, type MediaRecord
} from '../db/repo/media'
import { logMain } from '../log'
import { backfillMediaFingerprints } from '../media-dedupe'
import { fail } from './errors'
import { noArgs, validate } from './validation'

const idSchema = z.string().uuid()
const optionalGroupId = idSchema.optional()
const querySchema = z.object({
  type: z.enum(['all', 'image', 'video']).optional(),
  q: z.string().max(100).optional(),
  page: z.number().int().min(0).max(100000).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
  groupId: idSchema.nullish()
}).default({})
const pathsSchema = z.array(z.string().min(1).max(4096)).max(500)

function requireMedia(id: string): MediaItem {
  const item = getMedia(id)
  if (!item) fail('MEDIA_NOT_FOUND', '这个媒体已不存在，请刷新列表。')
  return item
}

function kindOfPath(path: string): MediaKind {
  const extension = extname(path).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  fail('MEDIA_INVALID', '请选择受支持的图片或视频文件。')
}

function newOutcome(): MediaImportResult {
  return { items: [], duplicates: [] }
}

async function saveMedia(
  outcome: MediaImportResult,
  record: Omit<MediaRecord, 'fileName' | 'size' | 'mime'>,
  store: () => Promise<Pick<MediaRecord, 'fileName' | 'size' | 'mime'>>
): Promise<void> {
  const alreadyInGroup = (): boolean => {
    if (record.groupId !== null) requireMediaGroup(record.groupId)
    const hit = findMediaByFingerprint(record.contentHash, record.visualHash, record.groupId)
    if (!hit) return false
    const duplicate: MediaDuplicate = {
      name: record.originalName || record.name || record.originalUrl,
      existingName: hit.name || hit.originalName || '未命名媒体',
      groupId: hit.groupId,
      groupName: hit.groupName
    }
    outcome.duplicates.push(duplicate)
    return true
  }
  if (alreadyInGroup()) return
  const saved = await store()
  let inserted = false
  try {
    // 复制期间可能有其他导入或移动写入目标组。复查和入库之间不让出主进程。
    if (alreadyInGroup()) return
    outcome.items.push(insertMedia({ ...record, ...saved }))
    inserted = true
  } finally {
    if (!inserted) await removeMediaFile(saved.fileName)
  }
}

/** 批量导入本地路径，跳过失败文件，重复素材只回报不重复入库。 */
async function importLocalPaths(paths: string[], groupId: string | null): Promise<MediaImportResult> {
  await backfillMediaFingerprints()
  if (groupId) requireMediaGroup(groupId)
  const outcome = newOutcome()
  for (const path of paths) {
    try {
      const kind = kindOfPath(path)
      const { contentHash, visualHash } = await probeMediaFile(path, kind)
      await saveMedia(outcome, {
        type: kind, source: 'local', name: basename(path, extname(path)),
        originalName: basename(path), originalUrl: '', groupId, contentHash, visualHash
      }, () => storeMediaFile(path, kind))
    } catch { if (groupId) requireMediaGroup(groupId) } // 跳过失败文件，目标组已删除时停止导入。
  }
  return outcome
}

async function requireFile(id: string): Promise<string> {
  const file = resolveAssetPath('media', `/${requireMedia(id).fileName}`)
  if (!file) fail('MEDIA_NOT_FOUND', '本地媒体文件不存在。')
  const info = await stat(file).catch(() => fail('MEDIA_NOT_FOUND', '本地媒体文件不存在或无法访问。'))
  if (!info.isFile()) fail('MEDIA_NOT_FOUND', '本地媒体文件不存在。')
  return file
}

function deleteMedia(id: string): void {
  const file = resolveAssetPath('media', `/${requireMedia(id).fileName}`)
  if (!file || !existsSync(file)) { removeMedia(id); return }
  const pending = `${file}.${randomUUID()}.deleting`
  try { renameSync(file, pending) }
  catch { fail('MEDIA_REMOVE_FAILED', '无法移除媒体文件，请关闭正在使用该文件的应用后重试。') }
  try { removeMedia(id) }
  catch (error) { renameSync(pending, file); throw error }
  try { rmSync(pending, { force: true }) }
  catch { logMain('Could not remove a staged media file') }
}

export function registerMediaIPC(): void {
  ipcMain.handle(channels.mediaList, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([querySchema]), args)
    return listMedia(query)
  })
  ipcMain.handle(channels.mediaListGroups, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return listMediaGroups()
  })
  ipcMain.handle(channels.mediaSaveGroup, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: idSchema.optional(),
      name: z.string().trim().min(1).max(40),
      description: z.string().trim().max(160)
    })]), args)
    return saveMediaGroup(input)
  })
  ipcMain.handle(channels.mediaRemoveGroup, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    await backfillMediaFingerprints()
    removeMediaGroup(id)
  })
  ipcMain.handle(channels.mediaMoveToGroup, async (_event, ...args: unknown[]) => {
    const [id, groupId] = validate(z.tuple([idSchema, idSchema.nullable()]), args)
    await backfillMediaFingerprints()
    moveMediaToGroup(id, groupId)
  })
  ipcMain.handle(channels.mediaSaveLocal, async (_event, ...args: unknown[]) => {
    const [groupId] = validate(z.tuple([optionalGroupId]), args)
    const picked = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片或视频', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp4', 'webm', 'mov', 'm4v', 'ogv'] }]
    })
    if (picked.canceled) return newOutcome()
    return importLocalPaths(picked.filePaths, groupId ?? null)
  })
  ipcMain.handle(channels.mediaSaveLocalPaths, async (_event, ...args: unknown[]) => {
    const [paths, groupId] = validate(z.tuple([pathsSchema, optionalGroupId]), args)
    return importLocalPaths(paths, groupId ?? null)
  })
  ipcMain.handle(channels.mediaSaveBuffers, async (_event, ...args: unknown[]) => {
    const [inputs, groupId] = validate(z.tuple([
      z.array(z.object({ name: z.string().min(1).max(255), data: z.instanceof(ArrayBuffer) })).max(50),
      optionalGroupId
    ]), args)
    await backfillMediaFingerprints()
    if (groupId) requireMediaGroup(groupId)
    const outcome = newOutcome()
    for (const input of inputs) {
      try {
        const bytes = Buffer.from(input.data)
        const probe = probeMediaBuffer(bytes)
        await saveMedia(outcome, {
          type: probe.kind, source: 'local', name: basename(input.name, extname(input.name)),
          originalName: input.name, originalUrl: '', groupId: groupId ?? null,
          contentHash: probe.contentHash, visualHash: probe.visualHash
        }, () => storeMediaBuffer(bytes, probe.extension))
      } catch { if (groupId) requireMediaGroup(groupId) }
    }
    return outcome
  })
  ipcMain.handle(channels.mediaSaveUrl, async (_event, ...args: unknown[]): Promise<MediaImportResult> => {
    const [input] = validate(z.tuple([z.object({ url: z.string().min(8).max(2048), groupId: optionalGroupId })]), args)
    if (input.groupId) requireMediaGroup(input.groupId)
    const downloaded = await downloadMediaFromUrl(input.url)
    let name = ''
    try { name = decodeURIComponent(new URL(downloaded.originalUrl).pathname.split('/').pop() ?? '') } catch { /* 地址没有可用名称时留空。 */ }
    await backfillMediaFingerprints()
    const outcome = newOutcome()
    await saveMedia(outcome, {
      type: downloaded.kind, source: 'url', name, originalName: '',
      originalUrl: downloaded.originalUrl, groupId: input.groupId ?? null,
      contentHash: downloaded.contentHash, visualHash: downloaded.visualHash
    }, () => storeMediaBuffer(downloaded.buffer, downloaded.extension))
    return outcome
  })
  ipcMain.handle(channels.mediaRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    deleteMedia(id)
  })
  ipcMain.handle(channels.mediaReveal, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    shell.showItemInFolder(await requireFile(id))
  })
  ipcMain.handle(channels.mediaOpenExternal, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([idSchema]), args)
    const error = await shell.openPath(await requireFile(id))
    if (error) fail('MEDIA_NOT_FOUND', '无法打开媒体，请检查本地文件与默认应用。')
  })
}
