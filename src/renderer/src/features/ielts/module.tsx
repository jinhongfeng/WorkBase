import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BookOpenCheck, Check, Plus, RotateCcw, Trash2, Volume2
} from 'lucide-react'
import type { IeltsGenerateInput, IeltsItem, IeltsSet, IeltsStats } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { useNavigation } from '../../stores/navigation'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Select'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { humanError } from '../../lib/utils'
import { buildReviewQueue, ReviewCard, speak } from './ReviewCard'
import { EnglishArticles } from './EnglishArticles'
import { ReadingPack } from './ReadingPack'
import { useStudyTime } from './useStudyTime'

const TOPICS = ['环境与可持续', '教育与学习', '科技与 AI', '健康与生活方式', '城市化', '工作与职业']
const LEVELS = ['6.0', '6.5', '7.0+']

function Highlight({ text, word }: { text: string; word: string }) {
  if (!word) return <>{text}</>
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${safe})`, 'ig'))
  return <>{parts.map((part, index) => part.toLowerCase() === word.toLowerCase()
    ? <b key={index}>{part}</b>
    : <span key={index}>{part}</span>)}</>
}

function Mastery({ level }: { level: number }) {
  return <span className="mastery-dots" aria-label={`熟练度 ${level}`}>{[0, 1, 2, 3, 4, 5].map(index => <i key={index} className={index < level ? 'on' : ''} />)}</span>
}

function IeltsPage() {
  const navigate = useNavigation(state => state.navigate)
  const [sets, setSets] = useState<IeltsSet[]>([])
  const [items, setItems] = useState<IeltsItem[]>([])
  const [stats, setStats] = useState<IeltsStats>({ total: 0, mastered: 0, due: 0, streak: 0, todayReviewed: 0 })
  const [aiReady, setAiReady] = useState(false)
  const [setId, setSetId] = useState('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'word' | 'sentence' | 'due'>('all')
  const [tab, setTab] = useState<'library' | 'review' | 'articles'>('library')
  const [topic, setTopic] = useState(TOPICS[0])
  const [level, setLevel] = useState('6.5')
  const [count, setCount] = useState(8)
  const [kind, setKind] = useState<IeltsGenerateInput['kind']>('mixed')
  const [passage, setPassage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [queue, setQueue] = useState<IeltsItem[]>([])
  const [reviewSetId, setReviewSetId] = useState('all')
  const [revealedSetId, setRevealedSetId] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [confirmSet, setConfirmSet] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genError, setGenError] = useState('')
  useStudyTime(tab !== 'articles' && items.length > 0 && !generating)

  const load = useCallback(async () => {
    try {
      const [setRows, itemRows, statRow, config] = await Promise.all([
        window.api.ielts.sets(),
        window.api.ielts.items(),
        window.api.ielts.stats(),
        window.api.ai.config().catch(() => null)
      ])
      setSets(setRows)
      setItems(itemRows)
      setStats(statRow)
      setAiReady(Boolean(config?.configured))
      return itemRows
    } catch (error) {
      window.toast.error(humanError(error))
      return []
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const now = Date.now()
    return items.filter(item => {
      if (setId !== 'all' && item.setId !== setId) return false
      if (kindFilter === 'due') return item.reviewAt <= now
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false
      return true
    })
  }, [items, setId, kindFilter])

  const openReview = (source: IeltsItem[]): void => {
    setQueue(buildReviewQueue(source))
    setReviewSetId(setId)
    setCursor(0)
    setFlipped(false)
    setTab('review')
  }

  const startReview = async (): Promise<void> => {
    if (setId === 'all') {
      openReview(items)
      return
    }
    setReviewing(true)
    try {
      openReview(await window.api.ielts.items(setId))
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setReviewing(false)
    }
  }

  const source = kind === 'reading' ? passage.trim() : ''
  const canGenerate = Boolean(topic.trim() || source)
  const generate = async (): Promise<void> => {
    if (generating || !canGenerate || !aiReady) return
    setGenError('')
    setGenerating(true)
    try {
      const result = await window.api.ielts.generate(kind === 'reading'
        ? { topic: source ? '' : topic.trim(), level, kind, passage: source || undefined }
        : { topic: topic.trim(), level, count, kind })
      await load()
      setSetId(result.set.id)
      setTab('library')
      setKindFilter('all')
      setRevealedSetId(null)
      setGenOpen(false)
      window.toast.success(`已生成「${result.set.title}」，共 ${result.items.length} 条`)
    } catch (error) {
      setGenError(humanError(error))
    } finally {
      setGenerating(false)
    }
  }

  const review = async (known: boolean): Promise<void> => {
    const item = queue[cursor]
    if (!item || reviewing) return
    setReviewing(true)
    try {
      const updated = await window.api.ielts.review({ id: item.id, known })
      setItems(currentItems => currentItems.map(entry => entry.id === updated.id ? updated : entry))
      setFlipped(false)
      setCursor(value => value + 1)
      const [nextStats, nextSets] = await Promise.all([window.api.ielts.stats(), window.api.ielts.sets()])
      setStats(nextStats)
      setSets(nextSets)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setReviewing(false)
    }
  }

  const removeSet = async (): Promise<void> => {
    if (setId === 'all') return
    try {
      await window.api.ielts.removeSet(setId)
      setSetId('all')
      setConfirmSet(false)
      await load()
      window.toast.success('学习包已删除')
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const activeSet = sets.find(set => set.id === setId)
  const current = queue[cursor]
  const masteryRate = stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0

  return (
    <div className="page ielts-page">
      <PageHeader
        title="英语"
        actions={
          <>
            <div className="segmented" role="group" aria-label="学习视图">
              <button aria-pressed={tab === 'library'} disabled={reviewing} onClick={() => setTab('library')}>学习库</button>
              <button aria-pressed={tab === 'review'} disabled={reviewing} onClick={() => {
                if (reviewSetId === setId && queue.length > 0 && cursor < queue.length) setTab('review')
                else void startReview()
              }}>复习</button>
              <button type="button" aria-pressed={tab === 'articles'} disabled={reviewing} onClick={() => {
                window.speechSynthesis?.cancel()
                setTab('articles')
              }}>报道阅读</button>
            </div>
            {tab === 'library' && <Button type="button" aria-haspopup="dialog" onClick={() => { setGenError(''); setGenOpen(true) }}>
              <Plus size={15} aria-hidden="true" />生成学习包
            </Button>}
          </>
        }
      />

      {tab === 'library' && items.length > 0 && (
        <dl className="ielts-summary" aria-label="全部学习统计">
          <div><dt>词条</dt><dd>{stats.total} 条</dd></div>
          <div><dt>已掌握</dt><dd>{stats.mastered} 条 <span>（{masteryRate}%）</span></dd></div>
          <div><dt>待复习</dt><dd>{stats.due} 条</dd></div>
          <div><dt>连续学习</dt><dd>{stats.streak} 天</dd></div>
        </dl>
      )}

      <Dialog open={genOpen} title="生成学习包" className="ielts-gen" onClose={() => { if (!generating) setGenOpen(false) }}>
        {genOpen && (aiReady ? <form onSubmit={event => {
          event.preventDefault()
          void generate()
        }}>
          <div className="field">
            <label htmlFor="ielts-topic">学习主题</label>
            <input id="ielts-topic" className="input" data-dialog-autofocus value={topic} maxLength={40} disabled={generating} onChange={event => setTopic(event.target.value)} placeholder="例如：环境与可持续" />
          </div>
          <div className="topic-chips" role="group" aria-labelledby="ielts-common-topics">
            <span id="ielts-common-topics" className="small muted">常用主题</span>
            {TOPICS.map(item => (
              <button key={item} type="button" className="chip clickable" aria-pressed={topic === item} disabled={generating} onClick={() => setTopic(item)}>{item}</button>
            ))}
          </div>
          <div className={kind === 'reading' ? 'ielts-gen-fields reading' : 'ielts-gen-fields'}>
            <div className="field">
              <label htmlFor="ielts-content-type">内容类型</label>
              <Select id="ielts-content-type" value={kind} disabled={generating} onChange={event => setKind(event.target.value as typeof kind)}>
                <option value="mixed">单词和句型</option>
                <option value="word">单词</option>
                <option value="sentence">句型</option>
                <option value="reading">短文精读</option>
              </Select>
            </div>
            <div className="field">
              <label htmlFor="ielts-level">雅思参考难度</label>
              <Select id="ielts-level" className="num" value={level} disabled={generating} onChange={event => setLevel(event.target.value)}>
                {LEVELS.map(item => <option key={item} value={item}>{item} 分</option>)}
              </Select>
            </div>
            {kind !== 'reading' && <div className="field">
              <label htmlFor="ielts-count">数量</label>
              <Select id="ielts-count" className="num" value={count} disabled={generating} onChange={event => setCount(Number(event.target.value))}>
                {[6, 8, 12, 16].map(item => <option key={item} value={item}>{item} 条</option>)}
              </Select>
            </div>}
          </div>
          {kind === 'reading' && <div className="field">
            <label htmlFor="ielts-passage">英文原文（可选）</label>
            <textarea id="ielts-passage" className="input ielts-passage-input" lang="en" value={passage} maxLength={8000}
              disabled={generating} onChange={event => setPassage(event.target.value)}
              placeholder="粘贴英文短文，或留空按主题生成" />
          </div>}
          {genError && <Alert tone="danger" title="学习包生成失败">{genError}</Alert>}
          <div className="actions">
            <Button type="button" disabled={generating} onClick={() => setGenOpen(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={generating} disabled={!canGenerate}>
              {generating ? '正在生成…' : genError ? '重试生成' : '生成学习包'}
            </Button>
          </div>
        </form> : <>
          <p className="muted">生成学习包需要先在设置中填写 AI 接口地址和模型。</p>
          <div className="actions">
            <Button type="button" onClick={() => setGenOpen(false)}>取消</Button>
            <Button type="button" variant="primary" onClick={() => navigate('/settings')}>配置 AI<ArrowRight size={14} aria-hidden="true" /></Button>
          </div>
        </>)}
      </Dialog>

      {tab === 'articles' ? <EnglishArticles /> : tab === 'library' ? (
        <>
          {items.length > 0 && <div className="ielts-library-bar">
            <div className="field ielts-set-field">
              <div className="ielts-set-controls">
                <Select aria-label="学习包" value={setId} disabled={reviewing} onChange={event => {
                  setSetId(event.target.value)
                  setRevealedSetId(null)
                }}>
                  <option value="all">全部学习包</option>
                  {sets.map(set => <option key={set.id} value={set.id}>{set.title}</option>)}
                </Select>
                {activeSet && <button type="button" className="button icon danger" aria-label="删除学习包" title="删除学习包" disabled={reviewing} onClick={() => setConfirmSet(true)}><Trash2 size={16} /></button>}
              </div>
            </div>
            {!activeSet?.hasReading && <div className="segmented" role="group" aria-label="词条筛选">
              {(['all', 'word', 'sentence', 'due'] as const).map(item => (
                <button key={item} aria-pressed={kindFilter === item} onClick={() => setKindFilter(item)}>
                  {item === 'all' ? '全部' : item === 'word' ? '单词' : item === 'sentence' ? '句型' : '待复习'}
                </button>
              ))}
            </div>}
            {activeSet && <p className="ielts-set-summary small muted">参考难度 {activeSet.level} 分 · 已掌握 {activeSet.mastered}/{activeSet.itemCount} 条</p>}
          </div>}

          {activeSet?.hasReading ? (
            <ReadingPack key={activeSet.id} pack={activeSet} revealed={revealedSetId === activeSet.id}
              onReveal={revealed => setRevealedSetId(revealed ? activeSet.id : null)} onReview={openReview} />
          ) : filtered.length ? (
            <div className="word-grid">
              {filtered.map(item => (
                <article className={`word-card ${item.kind === 'sentence' ? 'sentence' : ''}`} key={item.id} data-mastery={item.mastery}>
                  <div className="word-head">
                    <div className="word-top">
                      <span className="word-term">{item.term}</span>
                      {item.band && <span className="chip accent">{item.band}</span>}
                      <button className="icon-btn" type="button" title="朗读" aria-label={`朗读 ${item.term}`} onClick={() => speak(item.term)}><Volume2 size={15} aria-hidden="true" /></button>
                    </div>
                    {(item.phonetic || (item.pos && item.pos !== 'sentence')) && (
                      <div className="word-sub">
                        {item.phonetic && item.kind === 'word' && <span className="word-phonetic">{item.phonetic}</span>}
                        {item.pos && item.pos !== 'sentence' && <span className="word-pos">{item.pos}</span>}
                      </div>
                    )}
                  </div>
                  <p className="word-meaning">{item.meaning}</p>
                  {item.example && (
                    <div className="word-example">
                      <Highlight text={item.example} word={item.kind === 'word' ? item.term : ''} />
                      {item.translation && <span className="translation">{item.translation}</span>}
                    </div>
                  )}
                  <div className="word-foot">
                    {item.collocation.split(/[｜|]/).filter(Boolean).slice(0, 2).map(part => <span className="chip clay" key={part}>{part.trim()}</span>)}
                    <span className="spacer" />
                    <Mastery level={item.mastery} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={BookOpenCheck} title={items.length ? '没有匹配的词条' : '还没有学习内容'} description={items.length ? '换一个学习包或筛选条件。' : '点击右上角的「生成学习包」，选择一个想学的主题。'}>
              {items.length > 0 && <button className="button secondary" onClick={() => { setSetId('all'); setKindFilter('all') }}>清除筛选</button>}
            </EmptyState>
          )}
        </>
      ) : (
        <section className={current ? 'review-stage' : 'review-stage empty-state-region'}>
          {!current ? (
            <EmptyState
              icon={stats.due ? RotateCcw : Check}
              title={cursor >= queue.length && queue.length ? '这一轮复习完成' : '暂时没有需要复习的内容'}
              description={cursor >= queue.length && queue.length ? '记忆需要间隔，稍后再来一轮。' : '先去生成或浏览学习库，积累一些词条。'}
            >
              {items.length > 0 && <button className="button primary" disabled={reviewing} onClick={() => void startReview()}><RotateCcw size={14} />再来一轮</button>}
            </EmptyState>
          ) : (
            <ReviewCard item={current} position={cursor + 1} total={queue.length} flipped={flipped} busy={reviewing}
              onFlip={() => setFlipped(value => !value)} onReview={known => void review(known)} />
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmSet}
        title="删除这个学习包？"
        confirmLabel="删除学习包"
        description={`「${activeSet?.title ?? ''}」和其中的词条将一并删除，已产生的复习记录也会清空。`}
        onClose={() => setConfirmSet(false)}
        onConfirm={() => void removeSet()}
      />
    </div>
  )
}

export default defineModule({
  id: 'ielts',
  name: '英语',
  group: '记录',
  icon: BookOpenCheck,
  order: 15,
  defaultPinned: true,
  badge: async () => {
    const stats = await window.api.ielts.stats()
    return stats.due
  },
  keywords: ['ielts', '雅思', '单词', 'vocabulary', '英语学习', '报道阅读'],
  page: IeltsPage
})
