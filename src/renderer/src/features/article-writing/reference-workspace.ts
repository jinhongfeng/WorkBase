import { create } from 'zustand'
import { articleCategories, type ArticleCategory } from '@shared/article-writing'
import {
  REFERENCE_LIMIT, rankingPlatforms, type RankedReference, type RankingPlatform, type RankingQuery, type ReferenceAnalysis, type ReferenceAngle,
  type ReferenceContent, type ReferenceMaterial, type ReferenceRanking, type VideoPlan
} from '@shared/article-references'
import { humanError } from '../../lib/utils'

export type SourceMaterial = ReferenceMaterial & { id: string; url?: string; platform?: string }
type Status = 'analyze' | 'create' | null
type RankingKey = RankingPlatform | ArticleCategory
type RankingState = { data?: ReferenceRanking; loading: boolean; error: string }
type SelectedAngle = ReferenceAngle & { index: number }
interface StudioResult { content: ReferenceContent; category: ArticleCategory; sourceUrls: string[] }

interface Workspace {
  category: ArticleCategory
  platform: RankingPlatform
  bilibiliBoard: 'knowledge' | 'all'
  rankingCategory: ArticleCategory
  rankings: Partial<Record<RankingKey, RankingState>>
  sources: SourceMaterial[]
  manualInput: { title: string; text: string }
  perspective: string
  analysis: ReferenceAnalysis | null
  angle: SelectedAngle | null
  format: ReferenceContent['format']
  seconds: number
  pending: Status
  error: { stage: NonNullable<Status>; message: string } | null
  result: StudioResult | null
  saved: { result: StudioResult; noteId: string } | null
  saving: boolean
  setCategory(category: ArticleCategory): void
  setPlatform(platform: RankingPlatform): void
  setBilibiliBoard(board: Workspace['bilibiliBoard']): void
  setRankingCategory(category: ArticleCategory): void
  setManualInput(input: Workspace['manualInput']): void
  setPerspective(perspective: string): void
  setAngle(angle: SelectedAngle): void
  setFormat(format: Workspace['format']): void
  setSeconds(seconds: number): void
  addSource(source: SourceMaterial): void
  editSource(id: string, text: string): void
  removeSource(id: string): void
  discover(query: RankingQuery): Promise<void>
  analyze(): Promise<void>
  generate(): Promise<void>
  save(): Promise<void>
  editArticle(field: 'title' | 'lead' | 'body' | 'summary', value: string): void
}

export function rankingKey(query: RankingQuery): RankingKey {
  return query.platform === 'bilibili' && query.category && query.category !== 'all' ? query.category : query.platform
}

export function rankedSource(item: RankedReference, platform: RankingPlatform): SourceMaterial {
  return { id: item.id, title: item.title, description: item.description, text: '', url: item.url, platform: rankingPlatforms[platform].name }
}

export function formatVideoPlan(plan: VideoPlan): string {
  const duration = plan.shots.reduce((total, shot) => total + shot.seconds, 0)
  const shots = plan.shots.map((shot, index) => [
    `### 镜头 ${index + 1} · ${shot.seconds} 秒`, `画面：${shot.visual}`,
    shot.narration && `口播：${shot.narration}`, shot.subtitle && `字幕：${shot.subtitle}`, `制作：${shot.production}`
  ].filter(Boolean).join('\n\n')).join('\n\n')
  return [
    `预计成片 ${duration} 秒`, `## 制作方式\n\n${plan.method}`,
    `## 素材清单\n\n${plan.materials.map(item => `- ${item}`).join('\n')}`, `## 分镜\n\n${shots}`
  ].join('\n\n')
}

export const useReferenceWorkspace = create<Workspace>((set, get) => ({
  category: 'humanities', platform: 'bilibili', bilibiliBoard: 'all', rankingCategory: 'humanities', rankings: {}, sources: [],
  manualInput: { title: '', text: '' }, perspective: '', analysis: null, angle: null,
  format: 'article', seconds: 60, pending: null, error: null, result: null, saved: null, saving: false,
  setCategory: category => set({ category, analysis: null, angle: null, error: null }),
  setPlatform: platform => set({ platform }),
  setBilibiliBoard: bilibiliBoard => set({ bilibiliBoard }),
  setRankingCategory: rankingCategory => set({ rankingCategory }),
  setManualInput: manualInput => set({ manualInput }),
  setPerspective: perspective => set({ perspective }),
  setAngle: angle => set({ angle }),
  setFormat: format => set({ format }),
  setSeconds: seconds => set({ seconds }),
  addSource: source => set(state => {
    if (state.pending || state.sources.length >= REFERENCE_LIMIT || state.sources.some(item => item.id === source.id)) return state
    return { sources: [...state.sources, source], analysis: null, angle: null }
  }),
  editSource: (id, text) => set(state => ({
    sources: state.sources.map(source => source.id === id ? { ...source, text } : source), analysis: null, angle: null
  })),
  removeSource: id => set(state => ({ sources: state.sources.filter(source => source.id !== id), analysis: null, angle: null })),
  discover: async query => {
    const key = rankingKey(query)
    const previous = get().rankings[key]
    if (previous?.loading) return
    const update = (ranking: RankingState): void => set(state => ({ rankings: { ...state.rankings, [key]: ranking } }))
    update({ data: previous?.data, loading: true, error: '' })
    try { update({ data: await window.api.articleReferences.discover(query), loading: false, error: '' }) }
    catch (error) { update({ data: previous?.data, loading: false, error: humanError(error) }) }
  },
  analyze: async () => {
    const { category, sources, perspective, pending } = get()
    if (pending || !sources.length || sources.some(source => !source.url && !source.text.trim())) return
    set({ pending: 'analyze', error: null })
    try {
      const references = sources.map(({ title, description, text }) => ({ title, description, text }))
      set({ analysis: await window.api.articleReferences.analyze({ category, references, perspective }), angle: null })
    } catch (error) { set({ error: { stage: 'analyze', message: humanError(error) } }) }
    finally { set({ pending: null }) }
  },
  generate: async () => {
    const { category, sources, perspective, analysis, angle, format, seconds, pending } = get()
    if (pending || get().saving || !analysis || !angle?.title.trim() || !angle.stance.trim() || !perspective.trim()) return
    set({ pending: 'create', error: null })
    try {
      const brief = {
        category, perspective, angle: { title: angle.title, stance: angle.stance }, techniques: analysis.sources.map(source => source.technique)
      }
      const content = await window.api.articleReferences.create(format === 'video' ? { ...brief, format, seconds } : { ...brief, format })
      const sourceUrls = sources.flatMap(source => source.url ? [source.url] : [])
      set({ result: { content, category, sourceUrls }, saved: null })
    } catch (error) { set({ error: { stage: 'create', message: humanError(error) } }) }
    finally { set({ pending: null }) }
  },
  save: async () => {
    const { result, saved, saving, pending } = get()
    if (!result || result === saved?.result || saving || pending) return
    const { content, category, sourceUrls } = result
    const title = (content.format === 'article' ? content.draft.title : content.plan.title).trim()
    if (!title) return
    const body = content.format === 'article'
      ? [content.draft.lead.trim(), content.draft.body.trim(), content.draft.summary.trim() && `## 发布摘要\n\n${content.draft.summary.trim()}`].filter(Boolean).join('\n\n')
      : formatVideoPlan(content.plan)
    const checks = content.format === 'article' ? content.draft.factChecks : content.plan.factChecks
    const sourceLinks = sourceUrls.map(url => `- ${url}`).join('\n')
    const noteBody = [
      body,
      checks.length && `## 待核实事项\n\n${checks.map(check => `- ${check}`).join('\n')}`,
      sourceLinks && `## 参考来源\n\n${sourceLinks}`
    ].filter(Boolean).join('\n\n')
    set({ saving: true })
    try {
      const note = await window.api.notes.save({
        title, content: noteBody, tags: ['自媒体', articleCategories[category], content.format === 'article' ? '文章' : '视频分镜'], kind: 'note'
      })
      set({ saved: { result, noteId: note.id } })
      window.toast.success('已保存到笔记')
    } catch (error) { window.toast.error(humanError(error)) }
    finally { set({ saving: false }) }
  },
  editArticle: (field, value) => set(state => {
    const result = state.result
    if (result?.content.format !== 'article') return state
    return { result: { ...result, content: { format: 'article', draft: { ...result.content.draft, [field]: value } } } }
  })
}))
