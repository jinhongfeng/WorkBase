import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, BookmarkPlus, FilePenLine, Sparkles } from 'lucide-react'
import { articleCategories, type ArticleCategory } from '@shared/article-writing'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Textarea } from '../../components/ui/Textarea'
import { useNavigation } from '../../stores/navigation'
import { CopyButton } from './CopyButton'
import { useWriting } from './writing'
import { WritingSkeleton } from './WritingSkeleton'
import { ReferenceStudio } from './ReferenceStudio'
import { PlatformRankings } from './PlatformRankings'
import { DailyBriefPanel } from './DailyBriefPanel'
import { useReferenceWorkspace } from './reference-workspace'
import './article-writing.css'

const categories = Object.keys(articleCategories) as ArticleCategory[]
const examples: Record<ArticleCategory, string> = {
  humanities: '我们为什么喜欢在旧书上写批注？',
  science: '雨后的空气为什么有特殊的气味？',
  history: '古代的书是怎么流传到今天的？'
}

function QuickArticle() {
  const { input, draft, draftCategory, savedDraft, savedNoteId, generating, saving, error, setInput, edit, generate, save } = useWriting()
  const navigate = useNavigation(state => state.navigate)
  const openNote = useNavigation(state => state.openNote)
  const [config, setConfig] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [confirm, setConfirm] = useState(false)
  const busy = generating || saving
  const complete = Boolean(draft?.title.trim() && draft.body.trim())

  useEffect(() => {
    let active = true
    void window.api.ai.config().then(
      result => { if (active) setConfig(result.configured ? 'ready' : 'missing') },
      () => { if (active) setConfig('error') }
    )
    return () => { active = false }
  }, [])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (config !== 'ready' || busy) return
    if (draft && draft !== savedDraft) setConfirm(true)
    else void generate()
  }

  return (
    <>
      <div className="article-writing-layout">
        <form className="article-writing-form card" aria-labelledby="article-setup" onSubmit={submit}>
          <h2 id="article-setup">选题</h2>
          <div className="field">
            <span id="article-category" className="article-writing-label">内容类别</span>
            <div className="segmented" role="group" aria-labelledby="article-category">
              {categories.map(category => (
                <button type="button" key={category} aria-pressed={input.category === category} disabled={busy} onClick={() => setInput({ category })}>
                  {articleCategories[category]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="article-topic">文章题目 <span className="muted">（选填）</span></label>
            <Input id="article-topic" value={input.topic} onChange={event => setInput({ topic: event.currentTarget.value })}
              placeholder={examples[input.category]} maxLength={120} disabled={busy} aria-describedby="article-topic-hint" />
            <p className="muted article-writing-hint" id="article-topic-hint">留空时由 AI 选题。</p>
          </div>
          {config === 'loading' && <p className="muted" role="status">正在读取 AI 配置…</p>}
          {(config === 'missing' || config === 'error') && <Alert tone={config === 'error' ? 'danger' : 'info'}
            title={config === 'error' ? '无法读取 AI 配置' : '生成前请配置 AI 接口'}
            action={<Button type="button" onClick={() => navigate('/settings')}>前往 AI 设置</Button>} />}
          <Button type="submit" variant="primary" loading={generating} disabled={config !== 'ready' || busy}>
            {!generating && <Sparkles size={16} aria-hidden="true" />}{generating ? '正在生成文章…' : draft ? '生成新稿' : '一键生成'}
          </Button>
          {error && <Alert tone="danger" title="生成失败"><p>{error}</p></Alert>}
        </form>
        <section className="article-writing-draft card" aria-labelledby="article-draft" aria-busy={generating}>
          <header className="article-writing-draft-head">
            <div>
              <h2 id="article-draft">文章草稿</h2>
              {draft && <p className="muted article-writing-hint">{articleCategories[draftCategory]} · {draft === savedDraft ? '已保存' : '未保存'}</p>}
            </div>
            {draft && <div className="article-writing-actions">
              {savedNoteId && <Button variant="ghost" onClick={() => openNote({ id: savedNoteId })}><BookOpen size={15} aria-hidden="true" />打开笔记</Button>}
              <CopyButton
                disabled={!complete || busy}
                text={[draft.title, draft.lead, draft.body].map(text => text.trim()).filter(Boolean).join('\n\n')}
                label="复制文章"
              />
              <Button variant="primary" loading={saving} disabled={!complete || busy || draft === savedDraft} onClick={() => void save()}>
                {!saving && <BookmarkPlus size={15} aria-hidden="true" />}{savedNoteId && draft !== savedDraft ? '另存为笔记' : '保存到笔记'}
              </Button>
            </div>}
          </header>
          {draft ? (
            <div className="article-writing-editor">
              <div className="field">
                {/* 标题以 21px 文档字呈现，label 只保留给屏幕阅读器。 */}
                <label htmlFor="article-title" className="sr-only">标题</label>
                <Input className="article-writing-title" id="article-title" maxLength={200} value={draft.title} disabled={generating} onChange={event => edit('title', event.currentTarget.value)} />
              </div>
              <div className="field">
                <label htmlFor="article-lead">导语</label>
                <Textarea className="article-writing-lead" id="article-lead" rows={2} maxLength={600} value={draft.lead} disabled={generating} onChange={event => edit('lead', event.currentTarget.value)} />
              </div>
              <div className="field">
                <label htmlFor="article-body">正文</label>
                <Textarea className="article-writing-body" id="article-body" maxLength={6000} value={draft.body} disabled={generating} onChange={event => edit('body', event.currentTarget.value)} />
              </div>
              <div className="field article-writing-summary">
                <label htmlFor="article-summary">发布摘要</label>
                <CopyButton variant="ghost" className="sm" disabled={!draft.summary.trim() || generating} text={draft.summary.trim()} label="复制摘要" />
                <Textarea id="article-summary" rows={2} maxLength={400} value={draft.summary} disabled={generating} onChange={event => edit('summary', event.currentTarget.value)} />
              </div>
              <section className="article-writing-checks" aria-labelledby="article-checks">
                <h3 id="article-checks">待核实事项</h3>
                <p className="muted">{draft.factChecks.length ? 'AI 标出了以下内容，请在发布前核对。' : 'AI 未列出具体事项。发布前仍请核对稿件中的事实。'}</p>
                {draft.factChecks.length > 0 && <ul>{draft.factChecks.map((item, index) => <li key={index}>{item}</li>)}</ul>}
              </section>
            </div>
          ) : generating ? (
            <WritingSkeleton />
          ) : <EmptyState icon={FilePenLine} title="还没有草稿"
            description="生成后可在这里编辑文章、复制摘要或保存为笔记。" />}
        </section>
      </div>
      <ConfirmDialog open={confirm} title="生成新稿" description="新稿生成成功后会替换当前未保存的草稿。"
        confirmLabel="生成新稿" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void generate() }} />
    </>
  )
}

export default function HotspotTrackingPage() {
  const [view, setView] = useState<'rankings' | 'brief' | 'writing'>('rankings')
  const [referenceMode, setReferenceMode] = useState(() => useReferenceWorkspace.getState().sources.length > 0)
  const sourceCount = useReferenceWorkspace(state => state.sources.length)
  const rankingsTab = useRef<HTMLButtonElement>(null)

  function openRankings(): void {
    setView('rankings')
    rankingsTab.current?.focus()
  }

  return (
    <div className="page article-writing">
      <PageHeader title="热点追踪" />
      <div className="segmented article-writing-mode" role="group" aria-label="热点追踪功能">
        <button ref={rankingsTab} type="button" aria-pressed={view === 'rankings'} onClick={openRankings}>平台热点</button>
        <button type="button" aria-pressed={view === 'brief'} onClick={() => setView('brief')}>每日简报</button>
        <button type="button" aria-pressed={view === 'writing'} onClick={() => setView('writing')}>
          自媒体写作{sourceCount > 0 && view !== 'writing' && <span className="hotspot-source-count" aria-label={`${sourceCount} 条参考素材`}>{sourceCount}</span>}
        </button>
      </div>
      {view === 'rankings' ? <div className="reference-panel card hotspot-board">
        <PlatformRankings onReferenceAdded={() => setReferenceMode(true)} />
      </div> : view === 'brief' ? <DailyBriefPanel /> : <section aria-label="自媒体写作">
        <div className="segmented article-writing-mode" role="group" aria-label="创作方式">
          <button type="button" aria-pressed={!referenceMode} onClick={() => setReferenceMode(false)}>直接写文章</button>
          <button type="button" aria-pressed={referenceMode} onClick={() => setReferenceMode(true)}>参考爆款创作</button>
        </div>
        {referenceMode ? <ReferenceStudio onOpenRankings={openRankings} /> : <QuickArticle />}
      </section>}
    </div>
  )
}
