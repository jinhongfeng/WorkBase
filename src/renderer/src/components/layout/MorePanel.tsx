import { useEffect, useRef, useState } from 'react'
import { Pin, PinOff, Search } from 'lucide-react'
import { registry } from '../../modules/registry'
import { compareGroups } from '../../modules/groups'
import { useNavigation } from '../../stores/navigation'
import { Input } from '../ui/Input'
import { ScrollArea } from '../ui/ScrollArea'
export function MorePanel() {
  const { more, pinned, setMore, togglePin, navigate } = useNavigation()
  const [query, setQuery] = useState('')
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!more) return
    setQuery('')
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector('input')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') || [])
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); previous?.focus() }
  }, [more])
  if (!more) return null
  const filtered = registry.filter(module => module.name.toLowerCase().includes(query.toLowerCase()))
  const groups = [...new Set(filtered.map(module => module.group))].sort(compareGroups)
  return <><div className="panel-overlay" onClick={() => setMore(false)} aria-hidden="true"/><aside ref={panel} className="more-panel" role="dialog" aria-modal="true" aria-label="全部功能">
    <header><h2>全部功能</h2><div className="search-field"><Search size={16}/><Input aria-label="搜索功能" placeholder="搜索功能…" value={query} onChange={event => setQuery(event.target.value)}/></div></header>
    <ScrollArea>{groups.map(group => <section className="module-group" key={group}><h3>{group}</h3>{filtered.filter(module => module.group === group).map(module => <div className="module-row" key={module.id}><button className="module-link" onClick={() => navigate(module.path || '/' + module.id)}><module.icon size={18}/><span>{module.name}</span></button>{module.pinnable && <button aria-label={`${pinned.includes(module.id) ? '取消常用' : '添加常用'} ${module.name}`} aria-pressed={pinned.includes(module.id)} className={`pin-button ${pinned.includes(module.id) ? 'is-pinned' : ''}`} onClick={() => void togglePin(module.id)}>{pinned.includes(module.id) ? <PinOff size={15}/> : <Pin size={15}/>}</button>}</div>)}</section>)}{!filtered.length && <p className="no-results">没有匹配的功能</p>}</ScrollArea>
    <footer>{pinned.length > 6 && <p className="full-hint">侧栏已满，可在首页调整</p>}<p>新增的功能会自动出现在这里</p></footer>
  </aside></>
}
