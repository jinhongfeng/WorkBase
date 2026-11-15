import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js'
import type { SkillDetail, SkillFileEntry, SkillLayout, SkillSource } from '@shared/types'
import { AppError, fail } from './ipc/errors'
import { filesPath } from './storage'
import { getSkill, getSkillRecord, insertSkill, slugExists, updateSkill } from './db/repo/skills'
import { getDatabase } from './db'

/** 单个 skill 包的硬上限，与账单 ZIP 的安全口径保持一致。 */
const MAX_ENTRIES = 200
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const IGNORED = /(^|\/)(__MACOSX|\.git)(\/|$)|(^|\/)\.DS_Store$|(^|\/)Thumbs\.db$/i
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i
const MARKDOWN = /\.(?:md|markdown)$/i

export interface PackageFile {
  path: string
  data: Buffer
}

interface LocatedSkill {
  root: string
  entryPath: string
  layout: SkillLayout
}

function skillsRoot(): string {
  return join(filesPath(), 'skills')
}

export function packagePath(slug: string): string {
  return join(skillsRoot(), slug)
}

/** 拒绝绝对路径、盘符、.. 与控制字符，返回规范化的相对路径。 */
export function safeRelativePath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!normalized || normalized.includes('\0')) return null
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null
  const parts = normalized.split('/')
  if (parts.some(part => !part || /[. ]$/.test(part) || /[<>:"|?*\p{Cc}]/u.test(part) || WINDOWS_DEVICE.test(part))) return null
  return parts.join('/')
}

function decodeText(data: Uint8Array): string {
  return new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '')
}

/* ---------------- frontmatter ---------------- */

export interface SplitMarkdown {
  frontmatter: string
  body: string
}

export function splitFrontmatter(text: string): SplitMarkdown {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { frontmatter: '', body: normalized }
  let close = -1
  for (let index = 1; index < lines.length; index++) {
    if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[index])) { close = index; break }
  }
  if (close === -1) return { frontmatter: '', body: normalized }
  return {
    frontmatter: lines.slice(1, close).join('\n').trim(),
    body: lines.slice(close + 1).join('\n').replace(/^\n/, '')
  }
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quoted = /^(?:"(?:\\.|[^"\\])*"|'(?:''|[^'])*')(?=\s*(?:#|$))/.exec(trimmed)?.[0]
  if (quoted?.startsWith('"')) {
    try { return JSON.parse(quoted) as string } catch { /* YAML 还支持 JSON 之外的转义。 */ }
  }
  const scalar = quoted ?? trimmed
  if (scalar.startsWith('"') && scalar.endsWith('"')) {
    return scalar.slice(1, -1)
  }
  if (scalar.startsWith("'") && scalar.endsWith("'")) {
    return scalar.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed.replace(/\s+#.*$/, '').trim()
}

/** 只解析顶层 name/description 这类简单键，包括 | 与 > 块标量。 */
export function frontmatterValue(frontmatter: string, key: string): string {
  if (!frontmatter) return ''
  const lines = frontmatter.split('\n')
  const pattern = new RegExp(`^${key}\\s*:\\s*(.*)$`)
  for (let index = 0; index < lines.length; index++) {
    const match = pattern.exec(lines[index])
    if (!match) continue
    const rest = match[1].trim()
    if (/^[|>](?:[1-9][-+]?|[-+][1-9]?)?(?:\s+#.*)?$/.test(rest)) {
      const block: string[] = []
      for (let cursor = index + 1; cursor < lines.length; cursor++) {
        if (lines[cursor].trim() === '') { block.push(''); continue }
        if (!/^\s/.test(lines[cursor])) break
        block.push(lines[cursor])
      }
      const indent = block.reduce((minimum, line) => {
        const offset = line.search(/\S/)
        return offset < 0 ? minimum : Math.min(minimum, offset)
      }, Infinity)
      const joined = block.map(line => line.slice(indent)).join('\n').trim()
      return rest.startsWith('>') ? joined.replace(/\n+/g, ' ') : joined
    }
    return unquote(rest)
  }
  return ''
}

function serializeYamlValue(value: string): string {
  return JSON.stringify(value)
}

/** 只覆盖给定键，其余行（含未知字段、注释、顺序）原样保留。 */
export function withFrontmatter(frontmatter: string, fields: Record<string, string>): string {
  const lines = frontmatter ? frontmatter.split('\n') : []
  const missing: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    const pattern = new RegExp(`^${key}\\s*:`)
    const index = lines.findIndex(line => pattern.test(line))
    const rendered = `${key}: ${serializeYamlValue(value)}`
    if (index < 0) { missing.push(rendered); continue }
    let end = index + 1
    while (end < lines.length && (/^\s/.test(lines[end]) || lines[end].trim() === '')) end++
    lines.splice(index, end - index, rendered)
  }
  if (missing.length) lines.unshift(...missing)
  return lines.join('\n').trim()
}

function buildSkillMarkdown(frontmatter: string, content: string): string {
  const body = content && !content.endsWith('\n') ? `${content}\n` : content
  return `---\n${frontmatter}\n---\n\n${body}`
}

/** 正文里没有 frontmatter 时，从首个标题与首段推导 name / description。 */
function deriveFromBody(body: string, fallbackName: string): { name: string; description: string } {
  const lines = body.split('\n')
  const heading = lines.find(line => /^#{1,6}\s+/.test(line))?.replace(/^#{1,6}\s+/, '').trim()
  const paragraph = lines
    .filter(line => {
      const trimmed = line.trim()
      return trimmed !== '' && !/^#{1,6}\s/.test(trimmed) && !/^[-*+]\s/.test(trimmed) && !/^>/.test(trimmed) &&
        !/^```/.test(trimmed) && !/^\|/.test(trimmed) && !/^\d+\.\s/.test(trimmed)
    })
    .join(' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    name: (heading ?? '').slice(0, 80) || fallbackName,
    description: paragraph.length > 200 ? `${paragraph.slice(0, 200)}…` : paragraph
  }
}

/* ---------------- 包结构识别 ---------------- */

function locateSkillMarkdown(files: PackageFile[], fallbackName: string): LocatedSkill {
  const rootEntry = files.find(file => file.path.toLowerCase() === 'skill.md')
  if (rootEntry) return { root: '', entryPath: rootEntry.path, layout: 'dir' }

  const nested = files.filter(file => /(^|\/)skill\.md$/i.test(file.path))
  if (nested.length === 1) {
    const root = nested[0].path.split('/').slice(0, -1).join('/')
    return { root, entryPath: nested[0].path, layout: 'dir' }
  }
  if (nested.length > 1) {
    const roots = [...new Set(nested.map(file => file.path.split('/').slice(0, -1).join('/')))]
    fail('SKILL_AMBIGUOUS', `压缩包里有多份 SKILL.md（${roots.slice(0, 3).join('、') || '根目录'}），一次只能导入一个 skill。`)
  }

  const markdown = files.filter(file => MARKDOWN.test(file.path))
  if (markdown.length === 1) {
    return { root: markdown[0].path.split('/').slice(0, -1).join('/'), entryPath: markdown[0].path, layout: 'file' }
  }
  if (markdown.length === 0) fail('SKILL_NOT_FOUND', `没有在「${fallbackName}」里找到 SKILL.md 或 Markdown 文件。`)
  fail('SKILL_AMBIGUOUS', '这里有多个 Markdown 文件但没有 SKILL.md，无法判断哪一份是 skill 定义。')
}

function liftRoot(files: PackageFile[], root: string): PackageFile[] {
  if (!root) return files
  const prefix = `${root}/`
  return files
    .filter(file => file.path.startsWith(prefix))
    .map(file => ({ path: file.path.slice(prefix.length), data: file.data }))
}

/* ---------------- 读取来源 ---------------- */

export async function readZipPackage(bytes: Uint8Array): Promise<PackageFile[]> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false })
  try {
    const files: PackageFile[] = []
    let entries = 0
    let declared = 0
    let actual = 0
    for await (const entry of reader.getEntriesGenerator()) {
      if (++entries > MAX_ENTRIES) fail('SKILL_ARCHIVE_UNSAFE', '压缩包条目超过 200 个，请精简后再导入。')
      const path = safeRelativePath(entry.filename)
      if (!path) fail('SKILL_ARCHIVE_UNSAFE', '压缩包里包含不安全或 Windows 无法保存的路径。')
      if (IGNORED.test(path) || entry.directory) continue
      declared += entry.uncompressedSize
      if (entry.uncompressedSize > MAX_FILE_BYTES || declared > MAX_TOTAL_BYTES) {
        fail('SKILL_ARCHIVE_UNSAFE', '压缩包解压后超过上限（单文件 20MB，总计 50MB）。')
      }
      const chunks: Uint8Array[] = []
      let size = 0
      const output = new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.length
          actual += chunk.length
          if (size > MAX_FILE_BYTES || actual > MAX_TOTAL_BYTES) fail('SKILL_ARCHIVE_UNSAFE', '压缩包解压后超过上限。')
          chunks.push(chunk)
        }
      })
      await entry.getData(output)
      files.push({ path, data: Buffer.concat(chunks, size) })
    }
    if (files.length === 0) fail('SKILL_NOT_FOUND', '压缩包里没有可用文件。')
    return files
  } catch (error) {
    if (error instanceof AppError) throw error
    fail('SKILL_ARCHIVE_FAILED', '无法解压这个压缩包，请确认文件完整、未加密。')
  } finally {
    await reader.close()
  }
}

export function readDirectoryPackage(directory: string): PackageFile[] {
  const root = resolve(directory)
  const files: PackageFile[] = []
  let total = 0
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      const relativePath = safeRelativePath(relative(root, absolute).split(sep).join('/'))
      if (!relativePath) fail('SKILL_ARCHIVE_UNSAFE', '目录内有 Windows 无法保存的文件名。')
      if (IGNORED.test(relativePath)) continue
      if (entry.isDirectory()) { walk(absolute); continue }
      // 符号链接不跟随，避免越出导入目录
      if (!entry.isFile()) continue
      if (files.length >= MAX_ENTRIES) fail('SKILL_ARCHIVE_UNSAFE', '目录内文件超过 200 个，请精简后再导入。')
      const size = statSync(absolute).size
      total += size
      if (size > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) {
        fail('SKILL_ARCHIVE_UNSAFE', '目录内容超过上限（单文件 20MB，总计 50MB）。')
      }
      files.push({ path: relativePath, data: readFileSync(absolute) })
    }
  }
  walk(root)
  if (files.length === 0) fail('SKILL_NOT_FOUND', '这个目录是空的。')
  return files
}

export function readMarkdownPackage(name: string, data: Uint8Array): PackageFile[] {
  const safeName = safeRelativePath(basename(name)) ?? 'SKILL.md'
  return [{ path: safeName, data: Buffer.from(data) }]
}

/* ---------------- 落盘与建库 ---------------- */

function slugify(name: string): string {
  const cleaned = [...name]
    .map(char => (char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[. ]+$/, '')
  return WINDOWS_DEVICE.test(cleaned) ? `skill-${cleaned}` : cleaned || 'skill'
}

export function uniqueSlug(name: string): string {
  const base = slugify(name)
  let candidate = base
  let index = 2
  while (slugExists(candidate) || existsSync(packagePath(candidate))) candidate = `${base}-${index++}`
  return candidate
}

function writePackage(root: string, files: PackageFile[]): void {
  for (const file of files) {
    const target = resolve(root, file.path)
    if (!target.startsWith(root + sep)) fail('SKILL_ARCHIVE_UNSAFE', '文件路径越界。')
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, file.data, { flag: 'wx' })
  }
}

function writeMarkdownAtomically(path: string, data: string | Buffer): void {
  const staged = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(staged, data, { flag: 'wx' })
    renameSync(staged, path)
  } finally {
    rmSync(staged, { force: true })
  }
}

function persistPackage(input: Parameters<typeof insertSkill>[0], write: (root: string) => void): SkillDetail {
  mkdirSync(skillsRoot(), { recursive: true })
  const root = resolve(packagePath(input.slug))
  mkdirSync(root)
  try {
    write(root)
    return insertSkill(input, listPackageFiles(input.slug))
  } catch (error) {
    // 只清理本次操作刚建立的副本。库中的包由用户保留。
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}

/** 以磁盘实际内容为准生成文件清单，避免记错大小。 */
function listPackageFiles(slug: string): SkillFileEntry[] {
  const root = resolve(packagePath(slug))
  const entries: SkillFileEntry[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) { walk(absolute); continue }
      if (!entry.isFile()) continue
      entries.push({ path: relative(root, absolute).split(sep).join('/'), size: statSync(absolute).size })
    }
  }
  walk(root)
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

export function createSkillFromPackage(files: PackageFile[], source: SkillSource, sourceRef: string): SkillDetail {
  const fallback = (sourceRef ? basename(sourceRef, extname(sourceRef)) : '').trim() || '未命名 skill'
  const located = locateSkillMarkdown(files, fallback)
  const lifted = liftRoot(files, located.root)
  const names = new Set(lifted.map(file => file.path.toLowerCase()))
  if (names.size !== lifted.length) fail('SKILL_ARCHIVE_UNSAFE', '包内有 Windows 无法区分的重名文件。')
  const entryRelative = located.root ? located.entryPath.slice(located.root.length + 1) : located.entryPath
  const entry = lifted.find(file => file.path === entryRelative)
  if (!entry) fail('SKILL_NOT_FOUND', '无法读取 skill 定义文件。')

  const text = decodeText(entry.data)
  const { frontmatter, body } = splitFrontmatter(text)
  const derived = deriveFromBody(body, fallback)
  const name = (frontmatterValue(frontmatter, 'name') || derived.name).slice(0, 80)
  const description = (frontmatterValue(frontmatter, 'description') || derived.description).slice(0, 400)

  const outline: PackageFile[] = [
    { path: 'SKILL.md', data: entry.data },
    ...lifted.filter(file => file.path !== entryRelative).map(file => ({ path: file.path, data: file.data }))
  ]

  const slug = uniqueSlug(name)
  return persistPackage({
    name,
    description,
    slug,
    content: body,
    frontmatter,
    source,
    sourceRef,
    layout: source === 'import_dir' || lifted.length > 1 ? 'dir' : 'file'
  }, root => writePackage(root, outline))
}

export function createBlankSkill(): SkillDetail {
  const name = '新建 Skill'
  const description = ''
  const content = [
    '# 新建 Skill',
    '',
    '写清楚三件事：这个 skill 解决什么问题、什么时候该用、按什么步骤执行。',
    '',
    '## 使用场景',
    '',
    '## 执行步骤',
    '',
    '1. '
  ].join('\n')
  const slug = uniqueSlug(name)
  const frontmatter = withFrontmatter('', { name, description })
  return persistPackage({
    name, description, slug, content, frontmatter, source: 'manual', sourceRef: '', layout: 'file'
  }, root => writeFileSync(join(root, 'SKILL.md'), buildSkillMarkdown(frontmatter, content)))
}

export function duplicateSkill(id: string): SkillDetail {
  const detail = getSkill(id)
  const record = getSkillRecord(id)
  if (!detail || !record) fail('SKILL_NOT_FOUND', '这个 skill 已不存在，请刷新列表。')
  const name = `${detail.name.slice(0, 77)} 副本`
  const slug = uniqueSlug(name)
  const source = packagePath(record.slug)
  const frontmatter = withFrontmatter(record.frontmatter, { name, description: detail.description })
  return persistPackage({
    name,
    description: detail.description,
    slug,
    content: detail.content,
    frontmatter,
    source: 'duplicate',
    sourceRef: detail.name,
    layout: detail.layout,
    tags: normalizeTags(detail.tags)
  }, root => {
    cpSync(source, root, { recursive: true })
    writeMarkdownAtomically(join(root, 'SKILL.md'), buildSkillMarkdown(frontmatter, detail.content))
  })
}

export function saveSkillEntry(input: { id?: string; name: string; description: string; content: string; tags: string[] }): SkillDetail {
  const id = input.id ?? ''
  const record = getSkillRecord(id)
  const detail = getSkill(id)
  if (!record || !detail) fail('SKILL_NOT_FOUND', '这个 skill 已不存在，请刷新列表。')
  const name = input.name.trim().slice(0, 80) || detail.name
  const description = input.description.trim().slice(0, 400)
  const tags = normalizeTags(input.tags)
  const frontmatter = withFrontmatter(record.frontmatter, { name, description })
  const path = join(packagePath(record.slug), 'SKILL.md')
  const previous = readFileSync(path)
  const markdown = buildSkillMarkdown(frontmatter, input.content)
  let written = false
  try {
    return getDatabase().transaction(() => {
      const saved = updateSkill(id, { name, description, content: input.content, frontmatter, tags }, Buffer.byteLength(markdown))
      writeMarkdownAtomically(path, markdown)
      written = true
      return saved
    })()
  } catch (error) {
    if (written) writeMarkdownAtomically(path, previous)
    throw error
  }
}

export function normalizeTags(tags: string[]): string {
  const unique = [...new Set(tags.map(tag => tag.trim()).filter(Boolean).slice(0, 12))]
  return unique.length ? `,${unique.join(',')},` : ''
}
