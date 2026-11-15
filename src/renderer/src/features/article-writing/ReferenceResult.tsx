import { BookmarkPlus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useNavigation } from '../../stores/navigation'
import { CopyButton } from './CopyButton'
import { formatVideoPlan, useReferenceWorkspace } from './reference-workspace'

const articleFields = [
  { key: 'title', label: '标题', limit: 200 },
  { key: 'lead', label: '导语', limit: 600 },
  { key: 'body', label: '正文', limit: 6000 },
  { key: 'summary', label: '发布摘要', limit: 400 }
] as const

export function ReferenceResult() {
  const { result, pending, saved, saving, save, editArticle } = useReferenceWorkspace()
  const openNote = useNavigation(state => state.openNote)
  if (!result) return null
  const { content } = result
  const isArticle = content.format === 'article'
  const checks = isArticle ? content.draft.factChecks : content.plan.factChecks
  const duration = isArticle ? null : content.plan.shots.reduce((total, shot) => total + shot.seconds, 0)
  const valid = isArticle ? Boolean(content.draft.title.trim() && content.draft.body.trim()) : true
  return <section className="reference-panel reference-result card" aria-labelledby="reference-result-title">
    <header className="reference-inline reference-panel-head">
      <h2 id="reference-result-title">{isArticle ? '文章草稿' : '视频制作方案'}</h2>
      <div className="reference-inline">
        {saved && <Button variant="ghost" onClick={() => openNote({ id: saved.noteId })}>打开笔记</Button>}
        <CopyButton
          disabled={!valid || !!pending}
          label={isArticle ? '复制文章' : '复制方案'}
          text={isArticle
            ? [content.draft.title.trim(), content.draft.lead.trim(), content.draft.body.trim()].filter(Boolean).join('\n\n')
            : `${content.plan.title}\n\n${formatVideoPlan(content.plan)}`}
        />
        <Button variant="primary" loading={saving} disabled={!valid || !!pending || saved?.result === result} onClick={() => void save()}>
          {!saving && <BookmarkPlus size={15} aria-hidden="true" />}{saved?.result === result ? '已保存' : saved ? '另存为笔记' : '保存到笔记'}
        </Button>
      </div>
    </header>
    {isArticle ? <div className="article-writing-editor">
      {articleFields.map(({ key, label, limit }) => {
        const props = {
          id: `reference-draft-${key}`, value: content.draft[key], maxLength: limit, disabled: pending === 'create',
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => editArticle(key, event.currentTarget.value)
        }
        return <div className="field" key={key}>
          <label htmlFor={props.id} className={key === 'title' ? 'sr-only' : undefined}>{label}</label>
          {key === 'title' ? <Input className="article-writing-title" {...props} />
            : <Textarea className={key === 'body' ? 'article-writing-body' : key === 'lead' ? 'article-writing-lead' : undefined} {...props} />}
        </div>
      })}
      <CopyButton variant="ghost" disabled={!content.draft.summary.trim()} text={content.draft.summary.trim()} label="复制摘要" />
    </div> : <div className="reference-stack">
      <div><h3>{content.plan.title}</h3><p className="muted reference-meta">预计成片 {duration} 秒</p></div>
      <section className="reference-stack"><h3>制作方式</h3><p>{content.plan.method}</p></section>
      <section className="reference-stack"><h3>素材清单</h3><ul className="reference-bullets">{content.plan.materials.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
      <section className="reference-stack"><h3>分镜</h3>
        <ol className="reference-shots">{content.plan.shots.map((shot, index) => <li key={index}>
          <h4>镜头 {index + 1} <span className="muted reference-meta">{shot.seconds} 秒</span></h4>
          <dl>
            <dt>画面</dt><dd>{shot.visual}</dd>
            {shot.narration && <><dt>口播</dt><dd>{shot.narration}</dd></>}
            {shot.subtitle && <><dt>字幕</dt><dd>{shot.subtitle}</dd></>}
            <dt>制作</dt><dd>{shot.production}</dd>
          </dl>
        </li>)}</ol>
      </section>
    </div>}
    {checks.length > 0 && <div className="article-writing-checks">
      <h3>待核实事项</h3>
      <ul>{checks.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>}
  </section>
}
