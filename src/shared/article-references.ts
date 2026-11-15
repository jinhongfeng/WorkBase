import type { ArticleCategory, ArticleDraft } from './article-writing'

export const REFERENCE_LIMIT = 3
export const REFERENCE_TEXT_LIMIT = 8000
export const PERSPECTIVE_LIMIT = 3000

export const rankingPlatformIds = ['bilibili', 'douyin', 'kuaishou', 'weibo', 'zhihu', 'baidu', 'toutiao'] as const
export type RankingPlatform = typeof rankingPlatformIds[number]

export const rankingPlatforms: Record<RankingPlatform, { name: string; board: string; url: string }> = {
  bilibili: { name: 'B 站', board: '排行榜', url: 'https://www.bilibili.com/v/popular/rank/all/' },
  douyin: { name: '抖音', board: '热榜', url: 'https://www.douyin.com/hot' },
  kuaishou: { name: '快手', board: '短视频热榜', url: 'https://www.kuaishou.com/brilliant' },
  weibo: { name: '微博', board: '热搜榜', url: 'https://s.weibo.com/top/summary?cate=realtimehot' },
  zhihu: { name: '知乎', board: '热榜', url: 'https://www.zhihu.com/hot' },
  baidu: { name: '百度', board: '热搜榜', url: 'https://top.baidu.com/board?tab=realtime' },
  toutiao: { name: '今日头条', board: '热榜', url: 'https://www.toutiao.com/' }
}

export type RankingQuery = { platform: RankingPlatform; category?: ArticleCategory | 'all' }

export interface RankedReference {
  id: string
  rank: number
  title: string
  url: string
  creator: string
  section: string
  description: string
  metrics: { label: '热度' | '播放' | '点赞' | '收藏'; value: number | string }[]
}

export interface ReferenceRanking { items: RankedReference[]; fetchedAt: number }

export interface ReferenceMaterial {
  title: string
  description: string
  text: string
}

export interface ReferenceAngle { title: string; stance: string }

export interface AnalyzeReferencesInput {
  category: ArticleCategory
  references: ReferenceMaterial[]
  perspective: string
}

export interface ReferenceAnalysis {
  sources: { hook: string; structure: string; excerpt: string; technique: string }[]
  angles: ReferenceAngle[]
}

export interface VideoPlan {
  title: string
  method: string
  materials: string[]
  shots: { seconds: number; visual: string; narration: string; subtitle: string; production: string }[]
  factChecks: string[]
}

export type CreateReferenceContentInput = {
  category: ArticleCategory
  perspective: string
  angle: ReferenceAngle
  techniques: string[]
} & ({ format: 'article' } | { format: 'video'; seconds: number })

export type ReferenceContent = { format: 'article'; draft: ArticleDraft } | { format: 'video'; plan: VideoPlan }
