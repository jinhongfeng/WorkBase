import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, extname } from 'node:path'
import { promisify } from 'node:util'
import { nativeImage } from 'electron'
import type { WallpaperEngineLibrary } from '@shared/types'
import { getAllSettings, setSetting } from '../db/repo/settings'

const exec = promisify(execFile)
const KEY = 'ui.wallpaper_engine_directories'
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
// 静态类项目升级素材时只在根目录找这些静图；gif/webp/avif 可能是动画，不自动替换预览。
const STATIC_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv'])
// gif 必然带帧动画；webp / avif 多数为动图，按动态标注，避免把真动画说成静态。
const ANIMATED_EXTENSIONS = new Set(['.gif', '.webp', '.avif'])
const MAX_VIDEO_BYTES = 600 * 1024 * 1024
interface EngineEntry { id: string; title: string; preview: string; asset: string; kind: 'image' | 'video'; animated: boolean; directory: string; type: string }
let entries = new Map<string, EngineEntry>()

function inside(directory: string, file: string): boolean {
  const path = relative(directory, file)
  return path !== '' && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../') && !isAbsolute(path)
}

async function smallText(file: string): Promise<string> {
  if ((await stat(file)).size > 1024 * 1024) throw Error('Metadata too large')
  return (await readFile(file, 'utf8')).replace(/^\uFEFF/, '')
}

function customDirectories(): string[] {
  try {
    const value: unknown = JSON.parse(getAllSettings()[KEY] || '[]')
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string' && p.length < 2000 && isAbsolute(p)).slice(-12) : []
  } catch { return [] }
}

export function rememberEngineDirectory(directory: string): void {
  setSetting(KEY, JSON.stringify([...new Set([...customDirectories(), resolve(directory)])].slice(-12)))
}

async function steamDirectories(): Promise<string[]> {
  const roots = new Set<string>()
  if (process.env['ProgramFiles(x86)']) roots.add(join(process.env['ProgramFiles(x86)'], 'Steam'))
  if (process.env.ProgramFiles) roots.add(join(process.env.ProgramFiles, 'Steam'))
  // 某些桌面环境会同步拒绝创建注册表进程，仍须继续扫描手动选择的目录。
  const registry = await Promise.allSettled([
    Promise.resolve().then(() => exec('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 3000 })),
    Promise.resolve().then(() => exec('reg.exe', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath'], { windowsHide: true, timeout: 3000 }))
  ])
  for (const result of registry) {
    if (result.status !== 'fulfilled') continue
    const path = result.value.stdout.match(/(?:SteamPath|InstallPath)\s+REG_SZ\s+(.+)$/im)?.[1].trim()
    if (path) roots.add(resolve(path))
  }
  for (const root of [...roots]) {
    try {
      const text = await smallText(join(root, 'steamapps', 'libraryfolders.vdf'))
      for (const match of text.matchAll(/"path"\s+"((?:\\.|[^"\\])*)"/g)) {
        const path = match[1].replace(/\\\\/g, '\\')
        if (isAbsolute(path)) roots.add(resolve(path))
      }
    } catch { /* 非 Steam 安装目录或不可用的库不阻止其它库扫描。 */ }
  }
  return [...roots]
}

function candidates(root: string): string[] {
  return [root, join(root, 'steamapps/workshop/content/431960'), join(root, 'workshop/content/431960'),
    join(root, 'content/431960'), join(root, '431960'),
    ...['projects/myprojects', 'projects/defaultprojects', 'myprojects', 'defaultprojects'].map(p => join(root, p))]
}

async function project(directory: string): Promise<EngineEntry | null> {
  const data: unknown = JSON.parse(await smallText(join(directory, 'project.json')))
  if (!data || typeof data !== 'object') throw Error('Invalid project')
  const meta = data as Record<string, unknown>
  const type = typeof meta.type === 'string' ? meta.type.toLowerCase().slice(0, 30) : 'unknown'
  if (meta.category === 'Asset' || type === 'application') return null
  if (typeof meta.preview !== 'string' || !IMAGE_EXTENSIONS.has(extname(meta.preview).toLowerCase())) throw Error('No image preview')
  const preview = await realpath(resolve(directory, meta.preview))
  if (!inside(directory, preview)) throw Error('Preview outside project')
  const info = await stat(preview)
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw Error('Preview unavailable')
  let asset = preview
  let kind: 'image' | 'video' = 'image'
  if (type === 'video' && typeof meta.file === 'string') {
    try {
      const video = await realpath(resolve(directory, meta.file))
      const info = await stat(video)
      if (inside(directory, video) && info.isFile() && VIDEO_EXTENSIONS.has(extname(video).toLowerCase()) && info.size <= MAX_VIDEO_BYTES) {
        asset = video
        kind = 'video'
      }
    } catch { /* 视频缺失或不可读时保留可用预览，不跳过整个项目。 */ }
  }
  const id = createHash('sha256').update(directory.toLowerCase()).digest('hex')
  const animated = kind === 'video' || ANIMATED_EXTENSIONS.has(extname(preview).toLowerCase())
  return { id, directory, preview, asset, kind, animated, title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim().slice(0, 100) : directory.split(/[\\/]/).pop() || '未命名壁纸', type }
}

export async function listEngineWallpapers(): Promise<WallpaperEngineLibrary> {
  const roots = new Set<string>()
  for (const steam of await steamDirectories()) {
    roots.add(join(steam, 'steamapps/workshop/content/431960'))
    let install = 'wallpaper_engine'
    try { install = (await smallText(join(steam, 'steamapps/appmanifest_431960.acf'))).match(/"installdir"\s+"([^"\\/]+)"/)?.[1] || install } catch { /* 仍探测默认安装目录。 */ }
    const base = join(steam, 'steamapps/common', install, 'projects')
    roots.add(join(base, 'myprojects')); roots.add(join(base, 'defaultprojects'))
  }
  for (const root of customDirectories()) for (const candidate of candidates(root)) roots.add(candidate)
  const found = new Map<string, EngineEntry>(), visited = new Set<string>(), directories = new Set<string>()
  let skipped = 0, scanned = 0, truncated = false
  const add = async (directory: string): Promise<void> => {
    if (visited.has(directory)) return
    visited.add(directory)
    if (++scanned > 5000 || found.size >= 1000) { truncated = true; return }
    try { await stat(join(directory, 'project.json')) } catch { return }
    try {
      const entry = await project(directory)
      if (entry) found.set(entry.id, entry)
    } catch { skipped++ }
  }
  for (const path of roots) {
    if (truncated) break
    let root: string
    try { root = await realpath(path); if (!(await stat(root)).isDirectory()) continue } catch { continue }
    if (directories.has(root)) continue
    directories.add(root)
    await add(root)
    try {
      for (const item of await readdir(root, { withFileTypes: true })) {
        if (truncated) break
        if (item.isDirectory()) await add(await realpath(join(root, item.name)))
      }
    } catch { skipped++ }
  }
  entries = found
  return {
    items: [...found.values()].map(({ id, title, type, kind, animated }) => ({ id, title, type, kind, animated, previewUrl: `wb-asset://wallpaper-engine/${id}` })).sort((a,b) => a.title.localeCompare(b.title, 'zh-CN')),
    directories: [...directories], skipped, truncated
  }
}

/** 只允许读取本次扫描登记且仍在原项目内的预览图。 */
export function engineEntry(id: string): EngineEntry | null { return entries.get(id) ?? null }

export async function enginePreview(id: string): Promise<string | null> {
  const entry = entries.get(id)
  if (!entry) return null
  try {
    const preview = await realpath(entry.preview)
    const info = await stat(preview)
    return inside(entry.directory, preview) && info.isFile() && info.size <= 20 * 1024 * 1024 ? preview : null
  } catch { return null }
}

/** 重新校验扫描登记的素材，视频仍受项目目录与体积限制。 */
export async function engineAsset(id: string): Promise<{ file: string; kind: 'image' | 'video' } | null> {
  const entry = entries.get(id)
  if (!entry) return null
  // 静态类项目只登记了预览图，添加时在项目根目录找一张更大的静图当素材（仍不解析 scene.pkg）。
  if (entry.kind === 'image' && !entry.animated) {
    const upgraded = await largerStaticAsset(entry)
    if (upgraded) {
      try {
        const file = await realpath(upgraded)
        const info = await stat(file)
        if (inside(entry.directory, file) && info.isFile() && info.size <= 20 * 1024 * 1024) {
          entry.asset = file
          return { file, kind: 'image' }
        }
      } catch { /* 找到又失效的候选直接回落预览图。 */ }
    }
  }
  try {
    const file = await realpath(entry.asset)
    const info = await stat(file)
    const limit = entry.kind === 'video' ? MAX_VIDEO_BYTES : 20 * 1024 * 1024
    if (!inside(entry.directory, file) || !info.isFile() || info.size > limit) return null
    if (entry.kind === 'video' && !VIDEO_EXTENSIONS.has(extname(file).toLowerCase())) return null
    return { file, kind: entry.kind }
  } catch { return null }
}

function imageSize(file: string): { width: number; height: number } {
  try {
    const image = nativeImage.createFromPath(file)
    if (image.isEmpty()) return { width: 0, height: 0 }
    return image.getSize()
  } catch { return { width: 0, height: 0 } }
}

/**
 * 静态项目的 project.json 预览通常是作者上传的小图，直接当壁纸放大后会模糊。
 * 这里只扫描项目根目录的 jpg/png（不递归、不碰 scene.pkg），按体积取前 3 个候选量尺寸，
 * 选面积大于预览的做素材；找不到时保持预览不变。
 */
async function largerStaticAsset(entry: EngineEntry): Promise<string | null> {
  const previewSize = imageSize(entry.preview)
  if (!previewSize.width || !previewSize.height) return null
  let files: string[]
  try {
    const items = await readdir(entry.directory, { withFileTypes: true })
    const candidates: { file: string; size: number }[] = []
    for (const item of items) {
      if (!item.isFile()) continue
      if (!STATIC_IMAGE_EXTENSIONS.has(extname(item.name).toLowerCase())) continue
      const file = join(entry.directory, item.name)
      // Windows 路径大小写不敏感，比较统一转小写，避免把预览图自己当成候选。
      if (resolve(file).toLowerCase() === resolve(entry.preview).toLowerCase()) continue
      try {
        const info = await stat(file)
        if (info.isFile() && info.size <= 20 * 1024 * 1024) candidates.push({ file, size: info.size })
      } catch { /* 单个候选不可读就跳过。 */ }
    }
    files = candidates.sort((a, b) => b.size - a.size).slice(0, 3).map(item => item.file)
  } catch { return null }
  let best: { file: string; area: number } | null = null
  for (const file of files) {
    const { width, height } = imageSize(file)
    const area = width * height
    if (area > previewSize.width * previewSize.height && width >= previewSize.width &&
      (!best || area > best.area)) best = { file, area }
  }
  return best?.file ?? null
}
