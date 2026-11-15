import { useLayoutEffect, useRef, useState } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { useModuleRegistry } from '../../modules/registry'
import { compareGroups } from '../../modules/groups'
import { PINNED_LIMIT, useNavigation, validPinned } from '../../stores/navigation'
import { SearchField } from '../ui/SearchField'
import { Button } from '../ui/Button'
import { ScrollArea } from '../ui/ScrollArea'
export function MorePanel() {
  const { more, pinned, setMore, togglePin, navigate } = useNavigation()
  const modules = useModuleRegistry(state => state.modules)
  const [query, setQuery] = useState('')
  const panel = useRef<HTMLElement>(null)
  const saving = useRef(false)
  useLayoutEffect(() => {
    if (!more) return
    setQuery('')
    panel.current?.querySelector('input')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // 方向键在功能行之间循环移动焦点；从搜索框按下时进入首行 / 末行。
        const links = Array.from(panel.current?.querySelectorAll<HTMLElement>('.module-link') || [])
        if (!links.length) return
        event.preventDefault()
        const active = document.activeElement
        const position = active instanceof HTMLElement ? links.indexOf(active) : -1
        const offset = event.key === 'ArrowDown' ? 1 : -1
        const next = position < 0 ? (offset > 0 ? 0 : links.length - 1) : (position + offset + links.length) % links.length
        links[next]?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') || [])
      const first = controls[0]
      const last = controls.at(-1)
      const active = document.activeElement
      const boundary = event.shiftKey ? first : last
      if (active === boundary || !panel.current?.contains(active)) {
        event.preventDefault()
        const destination = event.shiftKey ? last : first
        destination?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [more])
  if (!more) return null
  const pinnedIds = new Set(validPinned(pinned, modules).map(module => module.id))
  const full = pinnedIds.size >= PINNED_LIMIT
  const term = query.trim().toLowerCase()
  const filtered = modules.filter(module => module.name.toLowerCase().includes(term))
  const groups = [...new Set(filtered.map(module => module.group))].sort(compareGroups)

  const changePin = async (id: string): Promise<void> => {
    if (saving.current) return
    saving.current = true
    try { await togglePin(id) } finally { saving.current = false }
  }

  return <>
    <div className="panel-overlay" onClick={() => setMore(false)} aria-hidden="true" />
    <aside ref={panel} className="more-panel" role="dialog" aria-modal="true" aria-label="全部功能">
      <header>
        <div className="section-heading">
          <div>
            <h2>全部功能</h2>
            <p className="small muted">点击名称打开，点图钉加入常用</p>
          </div>
          <Button variant="ghost" className="icon" aria-label="关闭全部功能" onClick={() => setMore(false)}><X size={16} /></Button>
        </div>
        <SearchField label="搜索功能" placeholder="搜索功能…" value={query} onValueChange={setQuery} />
      </header>
      <ScrollArea>
        {groups.map(group => <section className="module-group" key={group}>
          <h3>{group}</h3>
          {filtered.filter(module => module.group === group).map(module => {
            const isPinned = pinnedIds.has(module.id)
            const disabled = full && !isPinned
            return <div className="module-row" key={module.id}>
              <button className="module-link" onClick={() => navigate(module.path || '/' + module.id)}>
                <module.icon size={18} /><span>{module.name}</span>
              </button>
              {module.pinnable && <button
                aria-label={`${isPinned ? '取消常用' : '添加常用'} ${module.name}`}
                aria-pressed={isPinned}
                disabled={disabled}
                title={disabled ? '侧栏已满，先在首页「常用 / 编辑」移除一项' : undefined}
                aria-describedby={disabled ? 'more-panel-full-hint' : undefined}
                className={`pin-button ${isPinned ? 'is-pinned' : ''}`}
                onClick={() => void changePin(module.id)}
              >{isPinned ? <PinOff size={15} /> : <Pin size={15} />}</button>}
            </div>
          })}
        </section>)}
        {!filtered.length && <p role="status" className="no-results">没有匹配的功能</p>}
      </ScrollArea>
      <footer>
        {full && <p className="full-hint" id="more-panel-full-hint">侧栏已满，可在首页调整</p>}
        <Button variant="ghost" onClick={() => void window.api.plugins.openDirectory()
          .catch(() => window.toast.error('无法打开插件文件夹，请检查数据目录权限。'))}>打开插件文件夹</Button>
      </footer>
    </aside>
  </>
}
