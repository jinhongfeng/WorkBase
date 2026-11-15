import { app, net, powerMonitor } from 'electron'
import { DomUtils, getFeed, parseDocument } from 'htmlparser2'
import { SOURCE_MAX_ENTRIES_PER_FEED } from '@shared/sources'
import type { SourceFeedEntry } from '../db/repo/sources'
import { getSourceRow, listEnabledSourceIds, markSourceError, saveSourceEntries, saveSourceEntryCover, sourceEntriesWithCover } from '../db/repo/sources'
import { logMain } from '../log'
import { fetchSourceCover } from './rss-web'
import { articleFromFeed } from './rss-article'

const CHECK_INTERVAL = 60 * 60 * 1000
const FETCH_TIMEOUT = 15_000
const MAX_FEED_BYTES = 5 * 1024 * 1024
const USER_AGENT = 'WorkBase RSS Reader'
const MAX_COVERS_PER_SYNC = 12

/** 校验用户输入的订阅地址：HTTP/HTTPS、无用户名密码。 */
export function validateSourceUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw.trim()) }
  catch { throw new Error('请输入有效的订阅地址。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('订阅地址须使用 HTTP / HTTPS，并且不能包含用户名、密码或片段。')
  }
  return url.href
}

async function fetchFeed(url: string): Promise<string> {
  const response = await net.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'User-Agent': USER_AGENT }
  }).catch(() => {
    throw new Error('无法连接订阅地址，请检查网络或稍后重试。')
  })
  const body = response.body
  if (!response.ok || !body) {
    await body?.cancel()
    throw new Error(`订阅源返回了错误状态（HTTP ${response.status}）。`)
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read().catch(() => { throw new Error('接收订阅内容中断，请重试。') })
      if (done) break
      size += value.byteLength
      if (size > MAX_FEED_BYTES) {
        await reader.cancel()
        throw new Error('订阅内容超过 5MB 限制。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}

function plainText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

type FeedElement = NonNullable<ReturnType<typeof DomUtils.findOne>>

function sourceImage(node: FeedElement, feedUrl: string): URL | null {
  const thumbnail = DomUtils.findOne(element => element.name === 'media:thumbnail' && Boolean(element.attribs.url), node.children)
  const attachment = DomUtils.findOne(element =>
    (element.name === 'media:content' || element.name === 'enclosure' || element.name === 'link') &&
    (element.attribs.medium === 'image' || Boolean(element.attribs.type?.startsWith('image/'))) &&
    (element.name !== 'link' || element.attribs.rel === 'enclosure'), node.children)
  const toUrl = (raw?: string, base = feedUrl): URL | null => {
    const value = raw?.trim()
    const url = value && URL.parse(value, base)
    return url && url.protocol === 'https:' && !url.username && !url.password ? url : null
  }
  const declared = toUrl(thumbnail?.attribs.url) ?? toUrl(attachment?.attribs.url ?? attachment?.attribs.href)
  if (declared) return declared

  const isImage = (element: FeedElement): boolean => element.name === 'img' && Boolean(element.attribs.src)
  const bodies = DomUtils.findAll(element => element.parent === node &&
    ['content', 'content:encoded', 'description', 'summary'].includes(element.name), node.children)
  for (const body of bodies) {
    const img = DomUtils.findOne(isImage, body.children) ??
      DomUtils.findOne(isImage, parseDocument(DomUtils.textContent(body)).children)
    const base = URL.parse(body.attribs['xml:base'] ?? feedUrl, feedUrl)?.href ?? feedUrl
    const url = toUrl(img?.attribs.src, base)
    if (url) return url
  }
  return null
}

type ParsedSourceEntry = SourceFeedEntry & { image: URL | null }

/** RSS 2.0 与 Atom 共用 htmlparser2 的条目解析；封面只从同一个条目读取。 */
function parseEntries(text: string, feedUrl: string): ParsedSourceEntry[] {
  const document = parseDocument(text, { xmlMode: true })
  const root = DomUtils.findOne(node => ['feed', 'rss', 'rdf:RDF'].includes(node.name), document.children)
  const feed = root && getFeed([root])
  if (!root || !feed) return []
  const nodes = DomUtils.getElementsByTagName(feed.type === 'atom' ? 'entry' : 'item', root.children)
  const entries = new Map<string, ParsedSourceEntry>()
  for (const [index, item] of feed.items.entries()) {
    const title = plainText(item.title)
    const link = typeof item.link === 'string' ? item.link : ''
    const guid = plainText(item.id) || link || title
    if (!guid || !title) continue
    let publishedAt: number | null = null
    // parseFeed 已把 pubDate / updated 解析成 Date。
    if (item.pubDate instanceof Date && Number.isFinite(item.pubDate.getTime())) publishedAt = item.pubDate.getTime()
    const node = nodes[index]
    entries.set(guid, {
      guid, title, link, publishedAt, summary: plainText(item.description),
      image: node ? sourceImage(node, feedUrl) : null,
      body: node ? articleFromFeed(node, URL.parse(link || feedUrl, feedUrl)?.href ?? feedUrl) : null
    })
    if (entries.size >= SOURCE_MAX_ENTRIES_PER_FEED) break
  }
  return [...entries.values()]
}

/** 抓取单个订阅源并落库；错误写回源记录，不中断其它源。 */
async function refreshSource(sourceId: string, url: string): Promise<{ added: number; error: string | null }> {
  try {
    const entries = parseEntries(await fetchFeed(url), url)
    if (!entries.length) throw new Error('订阅源没有可读取的条目。')
    const { added } = saveSourceEntries(sourceId, entries)
    const withCover = sourceEntriesWithCover(sourceId)
    const pending = entries.filter(entry => entry.image && !withCover.has(entry.guid)).slice(0, MAX_COVERS_PER_SYNC)
    const downloads = new Map<string, Promise<string | null>>()
    await Promise.all(pending.map(async ({ guid, image }) => {
      if (!image) return
      image.hash = ''
      let download = downloads.get(image.href)
      if (!download) {
        download = fetchSourceCover(image)
        downloads.set(image.href, download)
      }
      const cover = await download
      if (cover) saveSourceEntryCover(sourceId, guid, cover)
    }))
    return { added, error: null }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    markSourceError(sourceId, message)
    return { added: 0, error: message }
  }
}

const pendingRefreshes = new Map<string, ReturnType<typeof refreshSource>>()

function refreshSourceOnce(id: string, url: string): ReturnType<typeof refreshSource> {
  const pending = pendingRefreshes.get(id)
  if (pending) return pending
  const refresh = refreshSource(id, url).finally(() => pendingRefreshes.delete(id))
  pendingRefreshes.set(id, refresh)
  return refresh
}

/** 刷新一批订阅源；id 为 null 时刷新全部启用源。 */
export async function refreshSources(id: string | null): Promise<{ sourceId: string; name: string; ok: boolean; added: number; error: string | null }[]> {
  const ids = id === null ? listEnabledSourceIds() : [id]
  const results: { sourceId: string; name: string; ok: boolean; added: number; error: string | null }[] = []
  for (const sourceId of ids) {
    const row = getSourceRow(sourceId)
    if (!row) {
      results.push({ sourceId, name: '', ok: false, added: 0, error: '这条订阅已被删除。' })
      continue
    }
    const outcome = await refreshSourceOnce(row.id, row.url)
    results.push({ sourceId: row.id, name: row.name, ok: outcome.error === null, added: outcome.added, error: outcome.error })
  }
  return results
}

let schedulerStarted = false

/** 启动时延迟 10 秒补一次抓取，之后每小时刷新启用的源；休眠恢复超过一小时则补查。 */
export function startSourceScheduler(): void {
  if (schedulerStarted) return
  schedulerStarted = true
  let lastRunAt = 0
  const run = async (): Promise<void> => {
    lastRunAt = Date.now()
    try { await refreshSources(null) }
    catch (error) { logMain(`RSS scheduler failed: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const schedule = (): void => { setTimeout(() => { void run() }, 10_000) }
  app.whenReady().then(schedule).catch(() => undefined)
  setInterval(() => { if (Date.now() - lastRunAt >= CHECK_INTERVAL) void run() }, CHECK_INTERVAL)
  powerMonitor.on('resume', () => { if (Date.now() - lastRunAt >= CHECK_INTERVAL) void run() })
  app.once('will-quit', () => { schedulerStarted = false })
}
