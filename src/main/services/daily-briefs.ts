import { app, net, powerMonitor } from 'electron'
import { DomUtils, parseDocument, parseFeed } from 'htmlparser2'
import { DAILY_BRIEF_SITE, type DailyBrief, type DailyBriefStatus, type DailyBriefStory } from '@shared/daily-briefs'
import { readDailyBriefs, saveDailyBriefs } from '../db/repo/daily-briefs'

const FEED_URL = 'https://aihot.tech/feed/daily.xml'
const CHECK_INTERVAL = 60 * 60 * 1000
const HAN = /\p{Script=Han}/u

async function fetchSource(url: string, format: 'xml' | 'html', signal: AbortSignal): Promise<string> {
  const maxResponseSize = format === 'xml' ? 512 * 1024 : 2 * 1024 * 1024
  const response = await net.fetch(url, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    headers: { Accept: format === 'xml' ? 'application/rss+xml, application/xml, text/xml' : 'text/html' }
  }).catch(() => {
    throw new Error('无法连接 AI Hot，请检查网络后重试。')
  })
  const body = response.body
  if (!response.ok || !body || !response.headers.get('content-type')?.includes(format)) {
    await body?.cancel()
    throw new Error(response.ok ? 'AI Hot 返回了无法读取的简报。' : `AI Hot 暂时无法访问（HTTP ${response.status}）。`)
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read().catch(() => {
        throw new Error('接收 AI Hot 简报中断，请重试。')
      })
      if (done) return Buffer.concat(chunks).toString('utf8')
      size += value.byteLength
      if (size > maxResponseSize) {
        await reader.cancel()
        throw new Error('AI Hot 返回的简报超过大小限制。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

function plainText(value = ''): string {
  return DomUtils.innerText(parseDocument(value).children).replace(/\s+/g, ' ').trim()
}

function parseBriefs(text: string): Omit<DailyBrief, 'stories'>[] {
  const feed = parseFeed(text, { xmlMode: true })
  const items = new Map<string, Omit<DailyBrief, 'stories'>>()
  for (const item of feed?.items ?? []) {
    // The source reuses the same link every day. Its GUID identifies the edition.
    const date = /^aihot-daily-(\d{4}-\d{2}-\d{2})$/.exec(item.id ?? '')?.[1]
    if (!date || items.has(date)) continue
    const title = plainText(item.title)
    const summary = plainText(item.description)
    if (title && summary) items.set(date, { date, title, summary })
  }
  if (!items.size) throw new Error('AI Hot 的 RSS 暂无可读取的简报。')
  return [...items.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function parseChineseStories(html: string): DailyBriefStory[] {
  const doc = parseDocument(html)
  const main = DomUtils.findOne(node => node.name === 'main', doc.children)
  const cards = DomUtils.findAll(node => node.name === 'article' &&
    node.attribs.class?.split(/\s+/).includes('lp-news-card') === true, main?.children ?? [])
  const stories = new Map<string, DailyBriefStory>()
  for (const card of cards) {
    const heading = DomUtils.findOne(node => node.name === 'h3', card.children)
    if (!heading) continue
    const link = DomUtils.findOne(node => node.name === 'a', heading.children)
    const path = link?.attribs.href ?? ''
    if (!/^\/zh\/story\/[a-z0-9-]{1,240}\/$/.test(path)) continue
    const description = DomUtils.findOne(node => node.name === 'p' &&
      node.attribs.class?.split(/\s+/).includes('line-clamp-3') === true, card.children)
    if (!description) continue
    const title = DomUtils.textContent(heading).trim()
    const summary = DomUtils.textContent(description).trim()
    if (!HAN.test(title) || !HAN.test(summary)) continue
    const url = new URL(path, DAILY_BRIEF_SITE).href
    stories.set(url, { title, summary, url })
  }
  if (!stories.size) throw new Error('AI Hot 中文简报暂时没有可读取的中文条目。')
  return [...stories.values()]
}

export function startDailyBriefSync(onChanged: () => void): {
  list: () => DailyBriefStatus
  refresh: () => Promise<void>
} {
  const lifetime = new AbortController()
  let inFlight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastAttemptAt = 0
  let error: string | null = null

  async function sync(): Promise<void> {
    const timeout = AbortSignal.timeout(15_000)
    const signal = AbortSignal.any([lifetime.signal, timeout])
    let items: DailyBrief[]
    try {
      const editions = parseBriefs(await fetchSource(FEED_URL, 'xml', signal))
      const stories = parseChineseStories(await fetchSource(DAILY_BRIEF_SITE, 'html', signal))
      items = editions.map((edition, index) => ({ ...edition, stories: index === 0 ? stories : [] }))
    } catch (cause) {
      error = timeout.aborted ? '获取 AI Hot 简报超时，请稍后重试。'
        : cause instanceof Error ? cause.message : '获取 AI Hot 简报失败，请稍后重试。'
      return
    }
    if (lifetime.signal.aborted) return
    try {
      saveDailyBriefs(items)
    } catch {
      error = '无法保存简报，请检查本地数据目录后重试。'
    }
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight
    clearTimeout(timer)
    lastAttemptAt = Date.now()
    error = null
    inFlight = sync().finally(() => {
      inFlight = null
      if (lifetime.signal.aborted) return
      timer = setTimeout(() => { void refresh() }, CHECK_INTERVAL)
      onChanged()
    })
    onChanged()
    return inFlight
  }

  const onResume = (): void => {
    if (Date.now() - lastAttemptAt >= CHECK_INTERVAL) void refresh()
  }
  powerMonitor.on('resume', onResume)
  app.once('will-quit', () => {
    lifetime.abort()
    clearTimeout(timer)
    powerMonitor.removeListener('resume', onResume)
  })
  void refresh()

  return {
    list: () => ({ ...readDailyBriefs(), syncing: inFlight !== null, error }),
    refresh
  }
}
