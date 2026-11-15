import { z } from 'zod'
import type { ArticleCategory } from '@shared/article-writing'
import { rankingPlatforms, type RankedReference, type RankingPlatform, type RankingQuery, type ReferenceRanking } from '@shared/article-references'
import { fail } from '../ipc/errors'

const endpoints: Record<RankingPlatform, string> = {
  bilibili: 'https://api.bilibili.com/x/web-interface/ranking/v2?rid=36&type=all',
  douyin: 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/',
  kuaishou: 'https://www.kuaishou.com/brilliant',
  weibo: 'https://weibo.com/ajax/side/hotSearch',
  zhihu: 'https://api.zhihu.com/topstory/hot-lists/total',
  baidu: 'https://top.baidu.com/api/board?platform=pc&tab=realtime',
  toutiao: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc'
}
const bilibiliAll = 'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all'
const MAX_BYTES = 2 * 1024 * 1024
const sections: Record<ArticleCategory, ReadonlySet<number>> = {
  humanities: new Set([124, 228, 229]),
  history: new Set([228]),
  science: new Set([201])
}

const count = z.number().int().nonnegative().nullish().catch(null)
const title = z.string().trim().min(1).max(200)
const description = z.string().trim().transform(value => value.slice(0, 1600)).catch('')
const rows = z.array(z.unknown()).max(200)
const heat = z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+(?:\.\d+)?\s*[万亿]?$/)]).nullish().catch(null)
const bilibiliRow = z.object({
  bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/),
  tid: z.number().int(),
  tname: z.string().trim().min(1).max(100),
  title,
  desc: description,
  owner: z.object({ name: z.string().trim().min(1).max(120) }),
  stat: z.object({ view: count, like: count, favorite: count }).catch({})
})
const bilibiliBoard = z.object({ code: z.literal(0), data: z.object({ list: rows }) })
const douyinBoard = z.object({ status_code: z.literal(0), word_list: rows })
const douyinRow = z.object({ word: title, hot_value: heat })
const weiboBoard = z.object({ ok: z.literal(1), data: z.object({ realtime: rows }) })
const weiboRow = z.object({ word: title, word_scheme: description, realpos: count, num: heat, is_ad: z.number().optional() })
const zhihuBoard = z.object({ data: rows })
const zhihuRow = z.object({
  target: z.object({ title, excerpt: description, url: z.string().regex(/^https:\/\/api\.zhihu\.com\/questions\/\d{1,24}\/?$/) }),
  detail_text: description
})
const baiduBoard = z.object({ success: z.literal(true), data: z.object({ cards: z.array(z.object({ content: rows })).max(8) }) })
const baiduRow = z.object({ word: title, query: description, desc: description, index: count, hotScore: heat })
const toutiaoBoard = z.object({ status: z.literal('success'), data: rows })
const toutiaoRow = z.object({ Title: title, ClusterIdStr: z.string().regex(/^\d{1,24}$/), HotValue: heat })
const kuaishouBoard = z.object({ defaultClient: z.record(z.string(), z.unknown()) })
const kuaishouLinks = z.object({ result: z.literal(1), items: z.array(z.object({ id: z.string().max(250) })).max(200) })
const kuaishouRow = z.object({ name: title, rank: z.number().int().positive(), hotValue: heat })

async function readBoard(query: RankingQuery): Promise<string> {
  const url = query.platform === 'bilibili' && (!query.category || query.category === 'all') ? bilibiliAll : endpoints[query.platform]
  const headers = new Headers({ Accept: query.platform === 'kuaishou' ? 'text/html' : 'application/json' })
  if (query.platform === 'weibo') headers.set('Referer', 'https://weibo.com/')
  const response = await fetch(url, { headers, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(12_000) })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel()
    throw new Error('Ranking response unavailable')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_BYTES) throw new Error('Ranking response too large')
      body += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return body + decoder.decode()
}

function parseRows<T>(rows: unknown[], schema: z.ZodType<T>, makeItem: (row: T, rank: number) => RankedReference | null): RankedReference[] {
  const seen = new Set<string>()
  const items: RankedReference[] = []
  for (const [index, raw] of rows.entries()) {
    const row = schema.safeParse(raw)
    if (!row.success) continue
    const item = makeItem(row.data, index + 1)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  return items
}

function metrics(...pairs: [RankedReference['metrics'][number]['label'], string | number | null | undefined][]): RankedReference['metrics'] {
  return pairs.flatMap(([label, value]) => value == null ? [] : [{ label, value: typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value }])
}

function topic(rank: number, title: string, url: string, hot?: string | number | null, description = ''): RankedReference {
  return { id: url, rank, title, url, creator: '', section: '', description, metrics: metrics(['热度', hot]) }
}

function parseRanking(query: RankingQuery, body: string): RankedReference[] {
  if (query.platform === 'kuaishou') {
    const embedded = /<script\b[^>]*>\s*window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\(function|<\/script>)/i.exec(body)?.[1]
    const { defaultClient } = kuaishouBoard.parse(JSON.parse(embedded ?? 'null'))
    const key = '$ROOT_QUERY.visionHotRank({"page":"brilliant"})'
    const { items } = kuaishouLinks.parse(defaultClient[key])
    return parseRows(items.map(link => defaultClient[link.id]), kuaishouRow, row =>
      topic(row.rank, row.name, `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(row.name)}`, row.hotValue))
  }

  const data: unknown = JSON.parse(body)
  switch (query.platform) {
    case 'bilibili': {
      const category = query.category ?? 'all'
      const { list } = bilibiliBoard.parse(data).data
      return parseRows(list, bilibiliRow, (row, rank) => {
        if (category !== 'all' && !sections[category].has(row.tid)) return null
        return {
          id: row.bvid, rank, title: row.title, url: `https://www.bilibili.com/video/${row.bvid}/`,
          creator: row.owner.name, section: row.tname, description: row.desc,
          metrics: metrics(['播放', row.stat.view], ['点赞', row.stat.like], ['收藏', row.stat.favorite])
        }
      })
    }
    case 'douyin':
      return parseRows(douyinBoard.parse(data).word_list, douyinRow, (row, rank) =>
        topic(rank, row.word, `https://www.douyin.com/search/${encodeURIComponent(row.word)}`, row.hot_value))
    case 'weibo':
      return parseRows(weiboBoard.parse(data).data.realtime, weiboRow, (row, rank) => row.is_ad ? null :
        topic(row.realpos || rank, row.word, `https://s.weibo.com/weibo?q=${encodeURIComponent(row.word_scheme || row.word)}`, row.num))
    case 'zhihu':
      return parseRows(zhihuBoard.parse(data).data, zhihuRow, (row, rank) => {
        const id = row.target.url.split('/').filter(Boolean).at(-1)
        const value = /^(\d+(?:\.\d+)?\s*[万亿]?)\s*热度$/.exec(row.detail_text)?.[1]
        return topic(rank, row.target.title, `https://www.zhihu.com/question/${id}`, value, row.target.excerpt)
      })
    case 'baidu':
      return parseRows(baiduBoard.parse(data).data.cards.flatMap(card => card.content), baiduRow, (row, rank) =>
        topic(row.index == null ? rank : row.index + 1, row.word, `https://www.baidu.com/s?wd=${encodeURIComponent(row.query || row.word)}`, row.hotScore, row.desc))
    case 'toutiao':
      return parseRows(toutiaoBoard.parse(data).data, toutiaoRow, (row, rank) =>
        topic(rank, row.Title, `https://www.toutiao.com/trending/${row.ClusterIdStr}/`, row.HotValue))
  }
}

export async function discoverReferenceRanking(query: RankingQuery): Promise<ReferenceRanking> {
  const { name } = rankingPlatforms[query.platform]
  let body: string
  try { body = await readBoard(query) }
  catch { fail('REFERENCE_RANKING_UNAVAILABLE', `暂时无法读取${name}榜单，请稍后重试。`) }
  let items: RankedReference[]
  try { items = parseRanking(query, body) }
  catch { fail('REFERENCE_RANKING_INVALID', `${name}暂未返回可读取的榜单。`) }
  return { items, fetchedAt: Date.now() }
}
