import { nativeImage, net } from 'electron'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { copyFile, open, rename, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { WALLPAPER_FITS, type WallpaperConfig, type WallpaperItem, type WallpaperScope, type WallpaperSource, type WallpaperUpdate } from '@shared/types'
import { detectAssetFormat, digestFile, resolveAssetPath } from '../assets'
import { getAllSettings, setSetting } from '../db/repo/settings'
import { AppError, fail } from '../ipc/errors'
import { filesPath } from '../storage'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 600 * 1024 * 1024
const HEADER_BYTES = 4096
const MANAGED_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i
const settingsKey = { workspace: 'ui.wallpaper', immersive: 'ui.immersive_wallpaper' } as const
const assetHost = { workspace: 'wallpapers', immersive: 'immersive-wallpapers' } as const
const WallpaperItemSchema = z.object({
  id: z.string().uuid(), source: z.enum(['url', 'file', 'system', 'engine']), engineId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  kind: z.enum(['image', 'video']).optional(),
  label: z.string().max(100), url: z.string().max(500), dark: z.boolean()
})
const WallpaperConfigSchema = z.object({
  items: z.array(WallpaperItemSchema).max(50), activeId: z.string().uuid().nullable(),
  carousel: z.boolean(), interval: z.number().int().min(10).max(86400),
  overlay: z.number().min(0).max(0.6),
  fit: z.enum(WALLPAPER_FITS).optional(),
  mode: z.enum(['solid', 'workspace', 'custom']).optional(),
  clear: z.boolean().optional()
})

function wallpapersDir(scope: WallpaperScope): string {
  const directory = join(resolve(filesPath()), assetHost[scope])
  mkdirSync(directory, { recursive: true })
  return directory
}

function managedPath(scope: WallpaperScope, item: WallpaperItem): string | null {
  try {
    const url = new URL(item.url)
    const name = url.pathname.slice(1)
    if (url.protocol !== 'wb-asset:' || url.hostname !== assetHost[scope] || url.search || url.hash ||
      url.username || url.password || !MANAGED_NAME.test(name) || !name.startsWith(`${item.id}.`)) return null
    return resolveAssetPath(assetHost[scope], url.pathname)
  } catch { return null }
}

function isFile(file: string): boolean {
  try { return lstatSync(file).isFile() } catch { return false }
}

export function loadConfig(scope: WallpaperScope): WallpaperConfig {
  const defaults: WallpaperConfig = { items: [], activeId: null, carousel: false, interval: 60, overlay: 0.22 }
  const raw = getAllSettings()[settingsKey[scope]]
  if (!raw) return defaults
  let config: WallpaperConfig
  try { config = WallpaperConfigSchema.parse(JSON.parse(raw)) } catch { return defaults }
  config.items = config.items.map(item => ({ ...item, kind: item.kind ?? (/\.(mp4|webm|mov|m4v|ogv)$/i.test(item.url) ? 'video' : 'image') }))
  config.items = config.items.filter(item => {
    const path = managedPath(scope, item)
    return path !== null && isFile(path)
  })
  if (!config.items.some(item => item.id === config.activeId)) config.activeId = null
  return config
}

function persist(scope: WallpaperScope, config: WallpaperConfig): WallpaperConfig {
  const checked = WallpaperConfigSchema.parse(config)
  setSetting(settingsKey[scope], JSON.stringify(checked))
  return checked
}

function wallpaperFormat(bytes: Buffer, kind?: 'image' | 'video'): NonNullable<ReturnType<typeof detectAssetFormat>> {
  const format = detectAssetFormat(bytes)
  if (format && (!kind || format.kind === kind)) return format
  if (kind === 'image') fail('WALLPAPER_INVALID_IMAGE', '内容无法识别为 PNG / JPG / WebP / GIF / AVIF 图片。')
  if (kind === 'video') fail('WALLPAPER_INVALID_VIDEO', '内容无法识别为 MP4 / WebM / MOV / M4V / OGV 视频。')
  fail('WALLPAPER_INVALID_IMAGE', '内容无法识别为支持的图片或视频。')
}

function checkSize(size: number, kind: 'image' | 'video'): void {
  if (size > (kind === 'video' ? MAX_VIDEO_BYTES : MAX_BYTES)) {
    fail('WALLPAPER_TOO_LARGE', kind === 'video' ? '壁纸视频不能超过 600MB。' : '壁纸图片不能超过 20MB。')
  }
}

async function inspectFile(path: string, kind?: 'image' | 'video'): Promise<NonNullable<ReturnType<typeof detectAssetFormat>>> {
  if (!isFile(path)) fail('WALLPAPER_FILE_UNAVAILABLE', '读取不到壁纸素材，请重新选择。')
  const file = await open(path, 'r').catch(() => fail('WALLPAPER_FILE_UNAVAILABLE', '读取不到壁纸素材，请重新选择。'))
  try {
    const { size } = await file.stat()
    checkSize(size, kind ?? 'video')
    const header = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await file.read(header)
    const format = wallpaperFormat(header.subarray(0, bytesRead), kind)
    checkSize(size, format.kind)
    return format
  } finally { await file.close() }
}

export function computeDark(file: string): boolean {
  try {
    // 仅采样亮度，不回写图片；无法解码时沿用浅色判定，不影响 Chromium 播放。
    const image = nativeImage.createFromPath(file)
    if (image.isEmpty()) return false
    const pixels = image.resize({ width: 16, height: 16 }).toBitmap()
    const linear = (value: number): number => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    }
    let luminance = 0
    for (let i = 0; i < pixels.length; i += 4) {
      luminance += 0.2126 * linear(pixels[i + 2]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i])
    }
    return pixels.length > 0 && luminance / (pixels.length / 4) < 0.45
  } catch { return false }
}

async function requireDistinctWallpaper(scope: WallpaperScope, config: WallpaperConfig, file: string, size: number, excludedId?: string): Promise<void> {
  let fingerprint: string | undefined
  for (const item of config.items) {
    if (item.id === excludedId) continue
    const saved = managedPath(scope, item)
    if (!saved || lstatSync(saved, { throwIfNoEntry: false })?.size !== size) continue
    fingerprint ??= await digestFile(file)
    if (await digestFile(saved) === fingerprint) {
      fail('WALLPAPER_DUPLICATE', `已添加「${item.label}」，未重复保存。`)
    }
  }
}

async function addCopy(scope: WallpaperScope, source: WallpaperSource, label: string, extension: string, save: (file: string) => Promise<void>, kind: 'image' | 'video' = 'image', engineId?: string): Promise<WallpaperConfig> {
  if (loadConfig(scope).items.length >= 50) fail('WALLPAPER_LIMIT', '最多保存 50 张壁纸，请先移除一些。')
  const id = randomUUID()
  const name = `${id}${extension}`
  const file = join(wallpapersDir(scope), name)
  try {
    await save(file)
    const { size } = lstatSync(file)
    checkSize(size, kind)
    const config = loadConfig(scope)
    if (config.items.length >= 50) fail('WALLPAPER_LIMIT', '最多保存 50 张壁纸，请先移除一些。')
    await requireDistinctWallpaper(scope, config, file, size)
    const added: WallpaperItem = { id, source, kind, engineId, label: label.slice(0, 100), url: `wb-asset://${assetHost[scope]}/${name}`, dark: kind === 'image' && computeDark(file) }
    return persist(scope, { ...config, items: [...config.items, added], activeId: id })
  } catch (error) {
    await rm(file, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function addFromUrl(scope: WallpaperScope, rawUrl: string, label?: string): Promise<WallpaperConfig> {
  let url: URL
  try { url = new URL(rawUrl.trim()) } catch { fail('WALLPAPER_INVALID_URL', '壁纸链接格式不正确。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('WALLPAPER_INVALID_URL', '请输入不含用户名或密码的 HTTP / HTTPS 图片或视频直链。')
  }
  let displayName = `${url.hostname}${url.pathname === '/' ? '' : '/' + basename(url.pathname)}`
  try { displayName = decodeURIComponent(displayName) } catch { /* 保留合法的原始 URL 展示名。 */ }
  if (loadConfig(scope).items.length >= 50) fail('WALLPAPER_LIMIT', '最多保存 50 张壁纸，请先移除一些。')
  const pending = join(wallpapersDir(scope), `${randomUUID()}.download`)
  try {
    const response = await net.fetch(url.href, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    const reader = response.body?.getReader() ?? fail('WALLPAPER_FETCH_FAILED', '壁纸链接返回了空内容。')
    const header = Buffer.alloc(HEADER_BYTES)
    let headerLength = 0
    let format: ReturnType<typeof detectAssetFormat> = null
    let size = 0
    try {
      if (!response.ok || response.status === 206) fail('WALLPAPER_FETCH_FAILED', `下载壁纸失败（HTTP ${response.status}）。`)
      const expectedSize = Number(response.headers.get('content-length'))
      checkSize(expectedSize, 'video')
      async function* chunks(): AsyncGenerator<Uint8Array> {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (!format) {
            const part = value.subarray(0, HEADER_BYTES - headerLength)
            header.set(part, headerLength)
            headerLength += part.byteLength
            if (headerLength === HEADER_BYTES) format = wallpaperFormat(header)
          }
          checkSize(Math.max(size, expectedSize || 0), format?.kind ?? 'video')
          yield value
        }
      }
      await pipeline(chunks(), createWriteStream(pending, { flags: 'wx' }))
    } finally { await reader.cancel().catch(() => undefined) }
    const { extension, kind } = format ?? wallpaperFormat(header.subarray(0, headerLength))
    checkSize(size, kind)
    return await addCopy(scope, 'url', label?.trim() || displayName, extension, file => rename(pending, file), kind)
  } catch (error) {
    if (error instanceof AppError) throw error
    fail('WALLPAPER_FETCH_FAILED', '无法下载或保存壁纸，请检查网络、直链和数据目录后重试。')
  } finally { await rm(pending, { force: true }).catch(() => undefined) }
}

export async function addEngineAsset(scope: WallpaperScope, file: string, label: string, engineId: string, kind: 'image' | 'video'): Promise<WallpaperConfig> {
  const { extension } = await inspectFile(file, kind)
  const save = (path: string): Promise<void> => copyFile(file, path)
  const current = loadConfig(scope)
  const existing = current.items.find(item => item.engineId === engineId)
  if (existing) {
    if (existing.kind === kind && existing.url.endsWith(extension)) return setActive(scope, existing.id)
    await requireDistinctWallpaper(scope, current, file, lstatSync(file).size, existing.id)
    // 同 id 升级旧预览记录，保留列表顺序和旧文件。
    const name = `${existing.id}${extension}`
    const path = join(wallpapersDir(scope), name)
    try {
      await save(path)
      checkSize(lstatSync(path).size, kind)
      const updated = { ...existing, kind, url: `wb-asset://${assetHost[scope]}/${name}`, dark: kind === 'image' && computeDark(path) }
      return persist(scope, { ...current, activeId: existing.id, items: current.items.map(item => item.id === existing.id ? updated : item) })
    } catch (error) {
      await rm(path, { force: true }).catch(() => undefined)
      throw error
    }
  }
  return addCopy(scope, 'engine', label, extension, save, kind, engineId)
}

export async function addFromPath(scope: WallpaperScope, sourcePath: string, source: 'file' | 'system' = 'file'): Promise<WallpaperConfig> {
  const { extension, kind } = await inspectFile(sourcePath, source === 'system' ? 'image' : undefined)
  return addCopy(scope, source, source === 'system' ? '系统壁纸' : basename(sourcePath), extension, file => copyFile(sourcePath, file), kind)
}

export async function addFromSystem(scope: WallpaperScope): Promise<WallpaperConfig> {
  let registered = ''
  try {
    const output = execFileSync('reg.exe', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
    registered = output.match(/WallPaper\s+REG_SZ\s+(.+)$/im)?.[1].trim() ?? ''
  } catch { /* 注册表不可用时尝试 Windows 维护的转码副本。 */ }
  const fallback = process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper') : ''
  for (const path of [registered, fallback]) {
    if (!path || !existsSync(path)) continue
    try { return await addFromPath(scope, path, 'system') }
    catch (error) {
      if (!(error instanceof AppError) || !['WALLPAPER_FILE_UNAVAILABLE', 'WALLPAPER_INVALID_IMAGE', 'WALLPAPER_TOO_LARGE'].includes(error.code)) throw error
    }
  }
  fail('WALLPAPER_SYSTEM_UNAVAILABLE', '无法读取系统当前壁纸。')
}

export function remove(scope: WallpaperScope, id: string): WallpaperConfig {
  const config = loadConfig(scope)
  const item = config.items.find(item => item.id === id)
  if (item) {
    const path = managedPath(scope, item)
    if (path && isFile(path)) unlinkSync(path)
  }
  return persist(scope, { ...config, items: config.items.filter(item => item.id !== id), activeId: config.activeId === id ? null : config.activeId })
}

export function setActive(scope: WallpaperScope, id: string | null): WallpaperConfig {
  const config = loadConfig(scope)
  if (id !== null && !config.items.some(item => item.id === id)) fail('WALLPAPER_NOT_FOUND', '这张壁纸已不存在，请重新选择。')
  return persist(scope, { ...config, activeId: id })
}

export function updateConfig(scope: WallpaperScope, input: WallpaperUpdate): WallpaperConfig {
  return persist(scope, { ...loadConfig(scope), ...input })
}

export function clear(scope: WallpaperScope): WallpaperConfig {
  const config = loadConfig(scope)
  for (const item of config.items) {
    const path = managedPath(scope, item)
    if (path && isFile(path)) unlinkSync(path)
  }
  const directory = wallpapersDir(scope)
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    if (MANAGED_NAME.test(name) && isFile(file)) unlinkSync(file)
  }
  return persist(scope, { ...config, items: [], activeId: null })
}
