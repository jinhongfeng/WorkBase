import { lookup } from 'node:dns'
import { get } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { detectAssetFormat } from '../assets'

const MAX_COVER_BYTES = 256 * 1024
const COVER_TIMEOUT = 5_000
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'
}
const nonPublic = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
] as const) nonPublic.addSubnet(address, prefix)

interface WebResponse {
  url: URL
  bytes: Buffer
  contentType: string
}

interface WebRequest {
  accept: string
  acceptsType(contentType: string): boolean
  maxBytes: number
  signal: AbortSignal
}

/** 订阅提供的地址可能来自第三方，连接时固定使用经过验证的公网地址。 */
function fetchPublicSource(url: URL, options: WebRequest, redirects: number): Promise<WebResponse | null> {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname) || !url.hostname.includes('.')) {
    return Promise.resolve(null)
  }
  return new Promise(resolve => {
    const request = get(url, {
      signal: options.signal,
      family: 4,
      agent: false,
      headers: { Accept: options.accept, 'Accept-Encoding': 'identity' },
      lookup: (hostname, _options, done) => {
        lookup(hostname, { family: 4 }, (error, address, family) => {
          if (error || nonPublic.check(address)) {
            done(error ?? new Error('Non-public address'), '', 4)
            return
          }
          done(null, address, family)
        })
      }
    }, response => {
      const status = response.statusCode ?? 0
      if (redirects > 0 && [301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        const next = URL.parse(response.headers.location, url)
        response.destroy()
        resolve(next ? fetchPublicSource(next, options, redirects - 1) : null)
        return
      }
      const contentType = response.headers['content-type'] ?? ''
      const mime = contentType.toLowerCase().split(';')[0].trim()
      if (status !== 200 || !options.acceptsType(mime) || Number(response.headers['content-length']) > options.maxBytes) {
        response.destroy()
        resolve(null)
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > options.maxBytes) {
          response.destroy()
          resolve(null)
        } else {
          chunks.push(chunk)
        }
      })
      response.on('error', () => resolve(null))
      response.on('aborted', () => resolve(null))
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType, url }))
    })
    request.on('error', () => resolve(null))
  })
}

export async function fetchSourceCover(url: URL): Promise<string | null> {
  const response = await fetchPublicSource(url, {
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
    acceptsType: mime => mime.startsWith('image/'),
    maxBytes: MAX_COVER_BYTES,
    signal: AbortSignal.timeout(COVER_TIMEOUT)
  }, 0)
  if (!response) return null
  const format = detectAssetFormat(response.bytes)
  const mime = format?.kind === 'image' ? MIME[format.extension] : undefined
  return mime ? `data:${mime};base64,${response.bytes.toString('base64')}` : null
}

export function fetchSourceArticle(url: URL): Promise<WebResponse | null> {
  const secureUrl = new URL(url)
  if (secureUrl.protocol === 'http:' && !secureUrl.port) secureUrl.protocol = 'https:'
  return fetchPublicSource(secureUrl, {
    accept: 'text/html,application/xhtml+xml',
    acceptsType: mime => mime === 'text/html' || mime === 'application/xhtml+xml',
    maxBytes: 2 * 1024 * 1024,
    signal: AbortSignal.timeout(12_000)
  }, 3)
}
