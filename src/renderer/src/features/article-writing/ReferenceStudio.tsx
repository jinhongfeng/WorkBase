import { useEffect, useState, type FormEvent } from 'react'
import { Check, Plus, TrendingUp, X } from 'lucide-react'
import { articleCategories, type ArticleCategory } from '@shared/article-writing'
import { PERSPECTIVE_LIMIT, REFERENCE_LIMIT, REFERENCE_TEXT_LIMIT } from '@shared/article-references'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { useNavigation } from '../../stores/navigation'
import { ReferenceResult } from './ReferenceResult'
import { WritingSkeleton } from './WritingSkeleton'
import { useReferenceWorkspace } from './reference-workspace'
import './reference-studio.css'

const categories = Object.keys(articleCategories) as ArticleCategory[]
const timings = [30, 45, 60, 90, 120, 180]

function MaterialPicker({ onOpenRankings }: { onOpenRankings(): void }) {
  const { sources, pending, manualInput, setManualInput, addSource } = useReferenceWorkspace()
  const { title, text } = manualInput
  const full = sources.length >= REFERENCE_LIMIT

  function addManual(event: FormEvent): void {
    event.preventDefault()
    if (!text.trim() || pending || full) return
    addSource({ id: crypto.randomUUID(), title: title.trim() || '手动粘贴素材', description: '', text: text.trim() })
    setManualInput({ title: '', text: '' })
  }

  return <div className="reference-picker">
    <div className="reference-inline reference-panel-head">
      <h3>手动粘贴</h3>
      <Button type="button" variant="ghost" onClick={onOpenRankings}><TrendingUp size={15} aria-hidden="true" />去平台热点选素材</Button>
    </div>
    <form className="reference-stack" onSubmit={addManual}>
      <div className="field"><label htmlFor="reference-title">素材标题（可选）</label>
        <Input id="reference-title" maxLength={200} disabled={!!pending || full} value={title}
          onChange={event => setManualInput({ title: event.currentTarget.value, text })} />
      </div>
      <div className="field"><label htmlFor="reference-input">正文、字幕或口播稿</label>
        <Textarea id="reference-input" rows={4} maxLength={REFERENCE_TEXT_LIMIT} disabled={!!pending || full} value={text}
          onChange={event => setManualInput({ title, text: event.currentTarget.value })} />
      </div>
      <Button type="submit" disabled={!!pending || full || !text.trim()}><Plus size={15} aria-hidden="true" />添加素材</Button>
    </form>
  </div>
}

function SelectedSources() {
  const { sources, pending, editSource, removeSource } = useReferenceWorkspace()
  if (!sources.length) return null
  return <div className="reference-selected">
    <h3>已选素材 <span className="muted reference-meta">{sources.length} / {REFERENCE_LIMIT}</span></h3>
    <ul className="reference-stack">
      {sources.map((source, index) => <li key={source.id}>
        <div className="reference-inline reference-selected-head">
          <span className="reference-source-name">{source.title}{source.platform && <span className="muted reference-meta"> · {source.platform}</span>}</span>
          <Button type="button" variant="ghost" className="icon" disabled={!!pending} aria-label={`移除素材 ${index + 1}`} onClick={() => removeSource(source.id)}><X size={15} aria-hidden="true" /></Button>
        </div>
        {source.url && <p className="muted reference-meta">{source.text.trim() ? '分析会使用补充的内容。' : `已获取${source.description ? '标题与简介' : '标题'}，可补充正文、字幕或笔记。`}</p>}
        <Textarea aria-label={`${source.url ? '补充原文或字幕' : '编辑文本'} ${index + 1}`} placeholder={source.url ? '粘贴正文、字幕、口播稿或笔记' : undefined}
          rows={2} maxLength={REFERENCE_TEXT_LIMIT} disabled={!!pending} value={source.text} onChange={event => editSource(source.id, event.currentTarget.value)} />
      </li>)}
    </ul>
  </div>
}

export function ReferenceStudio({ onOpenRankings }: { onOpenRankings(): void }) {
  const workspace = useReferenceWorkspace()
  const { category, sources, perspective, analysis, angle, format, seconds, pending, error, result, saving } = workspace
  const [config, setConfig] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [confirm, setConfirm] = useState(false)
  const navigate = useNavigation(state => state.navigate)

  useEffect(() => {
    let active = true
    void window.api.ai.config().then(
      reply => { if (active) setConfig(reply.configured ? 'ready' : 'missing') },
      () => { if (active) setConfig('error') }
    )
    return () => { active = false }
  }, [])

  const canAnalyze = config === 'ready' && !pending && sources.length > 0 && sources.every(source => source.url || source.text.trim())
  const canGenerate = config === 'ready' && !pending && !saving && angle?.title.trim() && angle.stance.trim() && perspective.trim()

  return <div className="reference-studio">
    <section className="reference-panel card" aria-labelledby="reference-materials">
      <header className="reference-inline reference-panel-head">
        <h2 id="reference-materials">参考素材</h2>
        <div className="segmented" role="group" aria-label="素材领域">
          {categories.map(item => <button key={item} type="button" aria-pressed={category === item} disabled={!!pending}
            onClick={() => { if (category !== item) workspace.setCategory(item) }}>{articleCategories[item]}</button>)}
        </div>
      </header>
      <SelectedSources />
      <MaterialPicker onOpenRankings={onOpenRankings} />
    </section>

    <section className="reference-panel card" aria-labelledby="reference-analysis">
      <h2 id="reference-analysis">拆解与定角度</h2>
      {(config === 'missing' || config === 'error') && <Alert tone={config === 'error' ? 'danger' : 'info'}
        title={config === 'error' ? '无法读取 AI 配置' : '拆解与创作需要先配置 AI'}
        action={<Button type="button" onClick={() => navigate('/settings')}>前往 AI 设置</Button>} />}
      <div className="field">
        <label htmlFor="reference-perspective">你的观点或素材</label>
        <Textarea id="reference-perspective" rows={3} maxLength={PERSPECTIVE_LIMIT} value={perspective} disabled={!!pending}
          placeholder="你想说什么？可以写下你的判断、案例、经历或手头的资料。"
          onChange={event => workspace.setPerspective(event.currentTarget.value)} />
        <p className="muted reference-meta">可先拆解参考，出稿前请在这里补充自己的观点或素材。</p>
      </div>
      <Button type="button" variant={analysis ? 'secondary' : 'primary'} disabled={!canAnalyze} loading={pending === 'analyze'} onClick={() => void workspace.analyze()}>
        {pending === 'analyze' ? '正在拆解…' : analysis ? '重新拆解并给出角度' : '拆解参考并给出角度'}
      </Button>
      {/* 禁用原因直接写在按钮下，避免灰按钮让用户猜条件。 */}
      {!sources.length && <p className="muted reference-meta">先在上方添加素材，或从平台榜单选取，再拆解。</p>}
      {sources.length > 0 && !sources.every(source => source.url || source.text.trim()) && <p className="muted reference-meta">每条素材要有链接或正文，补全后才能拆解。</p>}
      {error?.stage === 'analyze' && <Alert tone="danger">{error.message}</Alert>}
      {analysis && <>
        <div className="reference-findings">
          {analysis.sources.map((finding, index) => <section key={sources[index].id}>
            <h3>{sources[index].title}</h3>
            <dl>
              <dt>{sources[index].text.trim() ? '标题与开场' : sources[index].description ? '标题与简介' : '标题'}</dt><dd>{finding.hook}</dd>
              {finding.structure && <><dt>内容怎么推进</dt><dd>{finding.structure}</dd></>}
              {finding.excerpt && <><dt>素材短摘</dt><dd>「{finding.excerpt}」</dd></>}
              <dt>可借鉴的手法</dt><dd>{finding.technique}</dd>
            </dl>
          </section>)}
        </div>
        <h3>选择创作角度</h3>
        <div className="reference-angle-list" role="group" aria-label="创作角度">
          {analysis.angles.map((idea, index) => <Button variant="ghost" type="button" key={index} aria-pressed={angle?.index === index}
            disabled={!!pending} onClick={() => { if (angle?.index !== index) workspace.setAngle({ ...idea, index }) }}>
            <strong>{idea.title}</strong><span>{idea.stance}</span>
            {angle?.index === index && <Check size={14} aria-hidden="true" />}
          </Button>)}
        </div>
        {angle && <>
          <div className="field"><label htmlFor="reference-angle-title">确认题目</label><Input id="reference-angle-title" maxLength={120} value={angle.title}
            disabled={!!pending} onChange={event => workspace.setAngle({ ...angle, title: event.currentTarget.value })} /></div>
          <div className="field"><label htmlFor="reference-angle-stance">确认核心判断</label><Textarea id="reference-angle-stance" rows={2} maxLength={400}
            value={angle.stance} disabled={!!pending} onChange={event => workspace.setAngle({ ...angle, stance: event.currentTarget.value })} /></div>
          <div className="reference-inline reference-output-controls">
            <div className="segmented" role="group" aria-label="交付形式">
              <button type="button" disabled={!!pending} aria-pressed={format === 'article'} onClick={() => workspace.setFormat('article')}>文章</button>
              <button type="button" disabled={!!pending} aria-pressed={format === 'video'} onClick={() => workspace.setFormat('video')}>视频方案</button>
            </div>
            {format === 'video' && <label className="reference-inline reference-meta">目标时长
              <Select value={seconds} disabled={!!pending} onChange={event => workspace.setSeconds(Number(event.currentTarget.value))}>
                {timings.map(value => <option key={value} value={value}>{value} 秒</option>)}
              </Select>
            </label>}
            <Button type="button" variant="primary" loading={pending === 'create'} disabled={!canGenerate}
              onClick={() => { if (result) setConfirm(true); else void workspace.generate() }}>
              {pending === 'create' ? '正在起草…' : format === 'article' ? '按此角度写文章' : '按此角度做分镜'}
            </Button>
          </div>
        </>}
      </>}
      {error?.stage === 'create' && <Alert tone="danger">{error.message}</Alert>}
    </section>

    {result ? <ReferenceResult /> : pending === 'create' && (
      <section className="reference-panel card" aria-label="正在生成内容">
        <WritingSkeleton label={`正在按角度生成${format === 'article' ? '文章' : '视频方案'}…`} />
      </section>
    )}
    <ConfirmDialog title="生成新方案" open={confirm} description="新内容完成后会替换当前结果。想保留当前版本，可以先保存到笔记。"
      confirmLabel="生成新内容" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void workspace.generate() }} />
  </div>
}
