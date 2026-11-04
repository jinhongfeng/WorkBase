import { useEffect, useState } from 'react'
import { House, Plus, X, ArrowUpRight, CheckSquare, Mail, Wallet, ArrowDownLeft } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { defineModule, type ModuleDefinition } from '../../modules/defineModule'
import { useNavigation, visiblePinned } from '../../stores/navigation'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

function FeatureCard({ module }: { module: ModuleDefinition }) {
  const [summary, setSummary] = useState('功能将在后续阶段开放')
  useEffect(() => {
    let active = true
    const fallback = module.requires === 'mailAccount' ? '未配置邮箱' : module.requires === 'aiConfig' ? '未配置 AI' : '功能将在后续阶段开放'
    setSummary(fallback)
    if (module.summary) void module.summary().then(text => { if (active) setSummary(text) }).catch(() => { if (active) setSummary(fallback) })
    return () => { active = false }
  }, [module])
  return <button className="feature-card" onClick={() => useNavigation.getState().navigate(module.requires ? '/settings' : module.path || '/' + module.id)}><span className="feature-icon"><module.icon size={21} strokeWidth={1.6}/></span><span className="feature-copy"><strong>{module.name}</strong><small>{summary}</small></span><ArrowUpRight className="card-arrow" size={14}/></button>
}
function Dashboard() {
  const { pinned, setPinned, togglePin, setMore } = useNavigation()
  const [editing, setEditing] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const cards = visiblePinned(pinned)
  const now = new Date()
  const greeting = now.getHours() < 12 ? '上午好' : now.getHours() < 18 ? '下午好' : '晚上好'
  const saveDraft = async () => {
    if (!draft.trim() || saving) return
    setSaving(true)
    try { await window.api.settings.set('ui.quick_draft', draft); setDraft(''); window.toast.success('已暂存到本地设置') }
    catch { window.toast.error('暂存失败，请重试') }
    finally { setSaving(false) }
  }
  return <div className="page dashboard" data-testid="dashboard"><div className="greeting"><div><p className="eyebrow">你的工作台</p><h1>{greeting}，从这里开始。</h1><p className="page-description">留一点空间，给今天重要的事。</p></div><div className="date-block"><strong>{format(now, 'M月d日')}</strong><span>{format(now, 'EEEE', { locale: zhCN })}</span></div></div>
    <section className="favorites"><div className="section-heading"><h2>常用功能 <span className="count">{cards.length} / 6</span></h2><Button variant="ghost" onClick={() => setEditing(!editing)}>{editing ? '完成' : '编辑'}</Button></div><div className="feature-grid">{cards.map(module => <div className={`feature-wrapper ${dragged === module.id ? 'dragging' : ''}`} key={module.id} draggable={editing} onDragStart={event => { setDragged(module.id); event.dataTransfer.setData('text/plain', module.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDragged(null)} onDragOver={event => { if (editing) event.preventDefault() }} onDrop={event => {
      event.preventDefault()
      const source = event.dataTransfer.getData('text/plain')
      if (!editing || !source || source === module.id || !pinned.includes(source)) return
      const next = pinned.filter(id => id !== source)
      next.splice(next.indexOf(module.id), 0, source)
      void setPinned(next); setDragged(null)
    }}><FeatureCard module={module}/>{editing && <button className="remove-pin" aria-label={`移除 ${module.name}`} onClick={() => void togglePin(module.id)}><X size={13}/></button>}</div>)}{cards.length < 6 && <button className="add-card" onClick={() => setMore(true)}><Plus size={20}/><span>添加常用</span></button>}</div>{editing && <div className="edit-toolbar"><span>拖动卡片调整顺序</span><Button variant="ghost" onClick={() => setMore(true)}><Plus size={15}/>从更多添加</Button></div>}</section>
    <section className="quick-note"><div className="section-heading"><h2>快速记录</h2><span className="muted">先把想法留下来</span></div><div className="quick-input"><Plus size={19}/><Input aria-label="快速记录" placeholder="有什么想记下来的？" disabled={saving} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void saveDraft() }}/><button disabled={!draft.trim() || saving} aria-label="暂存记录" onClick={() => void saveDraft()}><ArrowDownLeft size={17}/></button></div><p className="input-hint">Enter 暂存到本地 · 记录功能将在后续阶段开放</p></section>
    <div className="overview-grid"><section className="overview"><div className="section-heading"><h2><CheckSquare size={17}/>今日待办</h2><span className="muted">待开放</span></div><div className="overview-body"><span className="empty-symbol"><CheckSquare size={24} strokeWidth={1.3}/></span><h3>给今天一个清晰的安排</h3><p>这里将展示今天需要完成的事。</p></div></section><section className="overview"><div className="section-heading"><h2><Mail size={17}/>邮件概览</h2><span className="muted">待开放</span></div><div className="overview-body"><span className="empty-symbol"><Mail size={24} strokeWidth={1.3}/></span><h3>重要邮件，集中查看</h3><p>连接邮箱后，在这里查看概览。</p></div></section><section className="overview"><div className="section-heading"><h2><Wallet size={17}/>账单摘要</h2><span className="muted">待开放</span></div><div className="overview-body"><span className="empty-symbol"><Wallet size={24} strokeWidth={1.3}/></span><h3>收支去向，一目了然</h3><p>这里将呈现本月的账单摘要。</p></div></section></div>
    <footer className="dashboard-footer"><span className="local-dot"/>数据保存在本机<span className="footer-shortcut">Ctrl K <span>快速切换功能</span></span></footer>
  </div>
}
export default defineModule({ id: 'dashboard', role: 'home', name: '首页', icon: House, group: '工具', order: 0, pinnable: false, page: Dashboard })
