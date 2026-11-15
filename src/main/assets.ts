import { nativeImage, net } from 'electron'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { copyFile, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { fail } from './ipc/errors'
import { filesPath, legacyFilesPath } from './storage'
import { MEMORY_IMAGE_NAME } from '@shared/memories'

export const ASSET_SCHEME = 'wb-asset'

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv'])

const MAX_COVER_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_COVER_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_REMOTE_COVER_BYTES = 30 * 1024 * 1024
const REMOTE_TIMEOUT_MS = 15_000

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8'
}

function filesRoot(): string {
  return resolve(filesPath())
}

function imagesDir(): string {
  return join(filesRoot(), 'images')
}

function coversDir(): string {
  return join(filesRoot(), 'skill-covers')
}

/** 保存粘贴/拖入的图片，返回可直接放进 Markdown 的本地地址。 */
export function saveImageDataUrl(dataUrl: string): { url: string } {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim())
  if (!match) fail('ASSET_INVALID', '只支持 PNG / JPG / WebP / GIF 格式的图片。')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 12 * 1024 * 1024) fail('ASSET_TOO_LARGE', '图片超过 12MB，请压缩后再插入。')
  mkdirSync(imagesDir(), { recursive: true })
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  const name = `${randomUUID()}.${extension}`
  writeFileSync(join(imagesDir(), name), buffer)
  return { url: `${ASSET_SCHEME}://images/${name}` }
}

/** 只公开应用管理的资产目录。 */
export function resolveAssetPath(hostname: string, pathname: string): string | null {
  if (hostname === 'memories') {
    const name = pathname.slice(1)
    if (!pathname.startsWith('/') || !MEMORY_IMAGE_NAME.test(name)) return null
    return join(filesRoot(), hostname, name)
  }
  if (hostname === 'media') {
    if (!/^\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(pathname)) return null
    const name = pathname.slice(1)
    const file = join(filesRoot(), 'media', name)
    return existsSync(file) ? file : join(legacyFilesPath(), 'media', name)
  }
  if (hostname !== 'images' && hostname !== 'skill-covers' && hostname !== 'wallpapers' && hostname !== 'immersive-wallpapers') return null
  if (!/^\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(pathname)) return null
  const name = pathname.slice(1)
  const file = join(filesRoot(), hostname, name)
  if (hostname === 'immersive-wallpapers') return file
  return existsSync(file) ? file : join(legacyFilesPath(), hostname, name)
}

export function contentTypeFor(file: string): string {
  return MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

type ResponseBody = ConstructorParameters<typeof Response>[0]

/**
 * 以流方式响应本地文件，并显式支持 Range。
 * 视频封面要能拖进度条就必须返回 206，`net.fetch(file://)` 会吞掉 Range 头。
 */
export function serveAssetFile(file: string, range: string | null): Response {
  let size: number
  try {
    const stat = statSync(file)
    if (!stat.isFile()) return new Response('Not found', { status: 404 })
    size = stat.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const type = contentTypeFor(file)

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    const suffix = !match?.[1] && match?.[2]
    const start = suffix ? Math.max(0, size - Number(suffix)) : Number(match?.[1] || 0)
    const end = match?.[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (!match || (!match[1] && !match[2]) || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ResponseBody
    return new Response(stream, {
      status: 206,
      headers: {
        'content-type': type,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-cache'
      }
    })
  }

  const stream = Readable.toWeb(createReadStream(file)) as unknown as ResponseBody
  return new Response(stream, {
    headers: {
      'content-type': type,
      'content-length': String(size),
      'accept-ranges': 'bytes',
      'cache-control': 'no-cache'
    }
  })
}

type CoverKind = 'image' | 'video'

export function detectAssetFormat(bytes: Buffer): { kind: CoverKind; extension: string } | null {
  const ascii = (start: number, end: number): string => bytes.toString('ascii', start, end)
  const isoMedia = ascii(4, 8) === 'ftyp'
  const boxEnd = isoMedia ? Math.min(bytes.readUInt32BE(0), bytes.length) : 0
  const brands = ascii(8, boxEnd)
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { kind: 'image', extension: '.png' }
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return { kind: 'image', extension: '.jpg' }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { kind: 'image', extension: '.webp' }
  if (/^GIF8[79]a$/.test(ascii(0, 6))) return { kind: 'image', extension: '.gif' }
  if (isoMedia && /avif|avis/.test(brands)) return { kind: 'image', extension: '.avif' }
  if (isoMedia && /isom|iso[2-9]|mp4[12]|avc1|M4V |qt {2}|dash/.test(brands)) {
    const majorBrand = ascii(8, 12)
    const extension = majorBrand === 'qt  ' ? '.mov' : majorBrand === 'M4V ' ? '.m4v' : '.mp4'
    return { kind: 'video', extension }
  }
  if (bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && bytes.includes('webm')) return { kind: 'video', extension: '.webm' }
  if (ascii(0, 4) === 'OggS' && bytes.includes('theora')) return { kind: 'video', extension: '.ogv' }
  return null
}

function coverExtension(bytes: Buffer, kind: CoverKind): string {
  const format = detectAssetFormat(bytes)
  if (format?.kind === kind) return format.extension
  fail('SKILL_COVER_INVALID', kind === 'image' ? '内容无法识别为受支持的图片。' : '内容无法识别为受支持的视频，建议使用 MP4 或 WebM。')
}

/** 把本地选中的图片/视频复制成 skill 封面，返回文件名（存库用）。 */
export async function saveCoverFile(sourcePath: string, kind: CoverKind): Promise<string> {
  const extension = extname(sourcePath).toLowerCase()
  const allowed = kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS
  if (!allowed.has(extension)) {
    fail('SKILL_COVER_INVALID', kind === 'image'
      ? '封面图片只支持 PNG / JPG / WebP / GIF / AVIF。'
      : '封面视频只支持 MP4 / WebM / MOV / M4V / OGV。')
  }
  const source = await open(sourcePath, 'r').catch(() => fail('SKILL_COVER_INVALID', '读取不到这个文件，请重新选择。'))
  let header: Buffer
  try {
    const info = await source.stat()
    if (!info.isFile() || info.size === 0) fail('SKILL_COVER_INVALID', '请选择一个非空的媒体文件。')
    const limit = kind === 'image' ? MAX_COVER_IMAGE_BYTES : MAX_COVER_VIDEO_BYTES
    if (info.size > limit) fail('SKILL_COVER_TOO_LARGE', `封面${kind === 'image' ? '图片不能超过 12MB' : '视频不能超过 200MB'}。`)
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await source.read(buffer)
    header = buffer.subarray(0, bytesRead)
  } finally {
    await source.close()
  }
  mkdirSync(coversDir(), { recursive: true })
  const name = `${randomUUID()}${coverExtension(header, kind)}`
  await copyFile(sourcePath, join(coversDir(), name))
  return name
}

/** 下载外链封面并在本地留档，返回文件名。只接受 http/https。 */
export async function fetchCoverFromUrl(rawUrl: string, kind: CoverKind): Promise<string> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    fail('SKILL_COVER_INVALID', '封面链接格式不正确。')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('SKILL_COVER_INVALID', '请输入不含用户名或密码的 HTTP / HTTPS 媒体直链。')
  }

  let response: Response
  try {
    response = await net.fetch(url.toString(), { redirect: 'follow', signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) })
  } catch {
    fail('SKILL_COVER_FETCH_FAILED', '无法下载这个链接，请检查网络或换一个直链地址。')
  }
  const reader = response.body?.getReader()
  if (!reader) fail('SKILL_COVER_FETCH_FAILED', '这个链接返回了空内容。')
  const limit = kind === 'image' ? MAX_COVER_IMAGE_BYTES : MAX_REMOTE_COVER_BYTES
  const tooLarge = `链接封面超过 ${limit / 1024 / 1024}MB，请换一个更小的文件。`
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    if (!response.ok || response.status === 206) fail('SKILL_COVER_FETCH_FAILED', `下载封面失败（HTTP ${response.status}）。`)
    if (Number(response.headers.get('content-length')) > limit) fail('SKILL_COVER_TOO_LARGE', tooLarge)
    while (true) {
      const { done, value } = await reader.read().catch(() => {
        fail('SKILL_COVER_FETCH_FAILED', '下载封面时连接中断，请重试。')
      })
      if (done) break
      size += value.byteLength
      if (size > limit) fail('SKILL_COVER_TOO_LARGE', tooLarge)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  const buffer = Buffer.concat(chunks, size)
  const extension = coverExtension(buffer.subarray(0, 4096), kind)
  mkdirSync(coversDir(), { recursive: true })
  const name = `${randomUUID()}${extension}`
  await writeFile(join(coversDir(), name), buffer, { flag: 'wx' })
  return name
}

export async function discardUnassignedCover(name: string): Promise<void> {
  await rm(join(coversDir(), name), { force: true })
}

export function mediaDir(): string {
  return join(filesRoot(), 'media')
}

export function sniffMediaKind(bytes: Buffer): 'image' | 'video' {
  const format = detectAssetFormat(bytes)
  if (format) return format.kind
  fail('MEDIA_INVALID', '内容无法识别为受支持的图片或视频。')
}

export type MediaKind = 'image' | 'video'

/** 去重指纹：contentHash 为文件字节的 SHA-256，visualHash 为图片解码后位图的 SHA-256。 */
export interface MediaFingerprint {
  contentHash: string
  visualHash: string
}

function digestBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 图片额外算一次“解码后位图”指纹，用于识别换了容器或无损重存的同一张图；解码不了时返回空串。 */
function visualFingerprint(bytes: Buffer, kind: MediaKind): string {
  if (kind !== 'image') return ''
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) return ''
  const { width, height } = image.getSize()
  if (!width || !height) return ''
  const hash = createHash('sha256')
  hash.update(`${width}x${height}:`)
  hash.update(image.toBitmap())
  return hash.digest('hex')
}

export async function digestFile(sourcePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolveDone, reject) => {
    const stream = createReadStream(sourcePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolveDone())
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

function requireMediaSize(size: number, kind: MediaKind): void {
  if (!size) fail('MEDIA_INVALID', '请选择一个非空的媒体文件。')
  if (size > (kind === 'image' ? MAX_COVER_IMAGE_BYTES : MAX_COVER_VIDEO_BYTES)) {
    fail('MEDIA_TOO_LARGE', kind === 'image' ? '图片不能超过 12MB。' : '本地视频不能超过 200MB。')
  }
}

/** 校验本地媒体文件并算出指纹，不落盘。去重命中时不会产生多余的文件复制。 */
export async function probeMediaFile(sourcePath: string, kind: MediaKind): Promise<MediaFingerprint & { size: number }> {
  const extension = extname(sourcePath).toLowerCase()
  if (!(kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS).has(extension)) {
    fail('MEDIA_INVALID', '请选择受支持的图片或视频文件。')
  }
  const info = await stat(sourcePath).catch(() => fail('MEDIA_INVALID', '读取不到这个文件，请重新选择。'))
  if (!info.isFile()) fail('MEDIA_INVALID', '读取不到这个文件，请重新选择。')
  requireMediaSize(info.size, kind)
  const unreadable = (): never => fail('MEDIA_INVALID', '无法读取这个文件，请检查文件权限。')
  if (kind === 'image') {
    const bytes = await readFile(sourcePath).catch(unreadable)
    return { size: info.size, contentHash: digestBytes(bytes), visualHash: visualFingerprint(bytes, kind) }
  }
  const contentHash = await digestFile(sourcePath).catch(unreadable)
  return { size: info.size, contentHash, visualHash: '' }
}

/** 把已校验的本地文件复制进媒体库目录，返回入库文件名。 */
export async function storeMediaFile(sourcePath: string, kind: MediaKind): Promise<{ fileName: string; size: number; mime: string }> {
  const extension = extname(sourcePath).toLowerCase()
  if (!(kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS).has(extension)) {
    fail('MEDIA_INVALID', '请选择受支持的图片或视频文件。')
  }
  const info = await stat(sourcePath).catch(() => fail('MEDIA_INVALID', '读取不到这个文件，请重新选择。'))
  if (!info.isFile()) fail('MEDIA_INVALID', '读取不到这个文件，请重新选择。')
  requireMediaSize(info.size, kind)
  const fileName = `${randomUUID()}${extension}`
  try {
    mkdirSync(mediaDir(), { recursive: true })
    await copyFile(sourcePath, join(mediaDir(), fileName))
  } catch {
    await removeMediaFile(fileName)
    fail('MEDIA_INVALID', '无法读取或保存这个文件，请检查文件和数据目录。')
  }
  return { fileName, size: info.size, mime: MIME_BY_EXTENSION[extension] }
}

/** 校验内存中的文件字节并算出指纹，不落盘（用于浏览器/聊天窗拖入、URL 下载）。 */
export function probeMediaBuffer(bytes: Buffer): MediaFingerprint & {
  kind: MediaKind; extension: string; size: number; mime: string
} {
  if (!bytes.length) fail('MEDIA_INVALID', '内容为空，无法保存。')
  const header = bytes.subarray(0, 4096)
  const kind = sniffMediaKind(header)
  const limit = kind === 'image' ? MAX_COVER_IMAGE_BYTES : MAX_COVER_VIDEO_BYTES
  if (bytes.length > limit) fail('MEDIA_TOO_LARGE', kind === 'image' ? '图片不能超过 12MB。' : '视频不能超过 200MB。')
  const extension = coverExtension(header, kind)
  return {
    kind, extension, size: bytes.length, mime: MIME_BY_EXTENSION[extension],
    contentHash: digestBytes(bytes), visualHash: visualFingerprint(bytes, kind)
  }
}

/** 把已校验的字节写入媒体库目录，返回入库文件名。 */
export async function storeMediaBuffer(bytes: Buffer, extension: string): Promise<{ fileName: string; size: number; mime: string }> {
  const fileName = `${randomUUID()}${extension}`
  try {
    mkdirSync(mediaDir(), { recursive: true })
    await writeFile(join(mediaDir(), fileName), bytes, { flag: 'wx' })
  } catch {
    await removeMediaFile(fileName)
    fail('MEDIA_INVALID', '无法保存这个文件，请检查数据目录。')
  }
  return { fileName, size: bytes.length, mime: MIME_BY_EXTENSION[extension] ?? '' }
}

/** 下载外链媒体到内存并算出指纹，落盘由调用方在去重判定后决定。 */
export async function downloadMediaFromUrl(rawUrl: string): Promise<MediaFingerprint & {
  buffer: Buffer; kind: MediaKind; extension: string; size: number; mime: string; originalUrl: string
}> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    fail('MEDIA_INVALID', '媒体链接格式不正确。')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('MEDIA_INVALID', '请输入不含用户名或密码的 HTTP / HTTPS 媒体直链。')
  }
  let response: Response
  try {
    response = await net.fetch(url.toString(), { redirect: 'follow', signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) })
  } catch {
    fail('MEDIA_FETCH_FAILED', '无法下载这个链接，请检查网络或换一个直链地址。')
  }
  const reader = response.body?.getReader()
  if (!reader) fail('MEDIA_FETCH_FAILED', '这个链接返回了空内容。')
  const chunks: Uint8Array[] = []
  let size = 0
  let kind: 'image' | 'video' | undefined
  try {
    if (!response.ok || response.status === 206) fail('MEDIA_FETCH_FAILED', `下载媒体失败（HTTP ${response.status}）。`)
    if (Number(response.headers.get('content-length')) > MAX_REMOTE_COVER_BYTES) fail('MEDIA_TOO_LARGE', '链接媒体不能超过 30MB。')
    while (true) {
      const { done, value } = await reader.read().catch(() => fail('MEDIA_FETCH_FAILED', '下载媒体时连接中断或超时，请重试。'))
      if (done) break
      size += value.byteLength
      chunks.push(value)
      if (size > MAX_REMOTE_COVER_BYTES) fail('MEDIA_TOO_LARGE', '链接视频不能超过 30MB。')
      // 收齐文件头后即可确定图片的更小上限，不依赖远端 Content-Type。
      if (!kind && size >= 4096) kind = sniffMediaKind(Buffer.concat(chunks, size).subarray(0, 4096))
      if (kind === 'image' && size > MAX_COVER_IMAGE_BYTES) fail('MEDIA_TOO_LARGE', '链接图片不能超过 12MB。')
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const buffer = Buffer.concat(chunks, size)
  kind ??= sniffMediaKind(buffer.subarray(0, 4096))
  if (kind === 'image' && size > MAX_COVER_IMAGE_BYTES) fail('MEDIA_TOO_LARGE', '链接图片不能超过 12MB。')
  const extension = coverExtension(buffer.subarray(0, 4096), kind)
  return {
    buffer, kind, extension, size, mime: MIME_BY_EXTENSION[extension], originalUrl: rawUrl.trim(),
    contentHash: digestBytes(buffer), visualHash: visualFingerprint(buffer, kind)
  }
}

export async function removeMediaFile(fileName: string): Promise<void> {
  await rm(join(mediaDir(), fileName), { force: true })
}
