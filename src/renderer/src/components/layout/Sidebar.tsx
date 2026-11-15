import { useEffect, useLayoutEffect, useState, type Ref } from 'react'
import { Ellipsis } from 'lucide-react'
import { registry, useModuleRegistry } from '../../modules/registry'
import { useNavigation, visiblePinned } from '../../stores/navigation'
import { Tooltip } from '../ui/Tooltip'
import type { LucideIcon } from 'lucide-react'

/** 宽屏在图标右侧显示中文，窄屏使用图标和气泡。 */
const WIDE_QUERY = '(min-width: 1200px)'

function useWideSidebar(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY)
    const update = (): void => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.sidebar = wide ? 'wide' : 'rail'
    return () => { delete document.documentElement.dataset.sidebar }
  }, [wide])
  return wide
}

function NavButton({ icon: Icon, name, shortcut = '', path, onClick, expanded, wide, badge, buttonRef }: {
  icon: LucideIcon; name: string; shortcut?: string; path?: string; onClick?(): void; expanded?: boolean; wide: boolean; badge?: string | number; buttonRef?: Ref<HTMLButtonElement>
}) {
  const current = useNavigation(state => state.path)
  const selected = Boolean(expanded) || path === current
  const hasBadge = badge !== undefined && badge !== '' && badge !== 0
  const button = (
    <button
      ref={buttonRef}
      aria-label={name}
      aria-current={path === current ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? 'dialog' : undefined}
      className={`nav-button ${selected ? 'selected' : ''}`}
      onClick={onClick || (() => path && useNavigation.getState().navigate(path))}
    >
      <Icon size={18} strokeWidth={1.75} />
      {wide && <span className="nav-label">{name}</span>}
      {hasBadge && <span className="nav-badge" aria-hidden="true">{badge}</span>}
    </button>
  )
  if (wide) return button
  return <Tooltip label={`${name}${shortcut ? ' · ' + shortcut : ''}${hasBadge ? ` · ${badge}` : ''}`}>{button}</Tooltip>
}

export function Sidebar({ moreTrigger }: { moreTrigger: Ref<HTMLButtonElement> }) {
  const { pinned, more, setMore } = useNavigation()
  const modules = useModuleRegistry(state => state.modules)
  const wide = useWideSidebar()
  const pinnedModules = visiblePinned(pinned, modules)
  const [badges, setBadges] = useState<Record<string, string | number>>({})
  const home = registry.find(module => module.role === 'home')
  const assistant = registry.find(module => module.role === 'assistant')
  const settings = registry.find(module => module.role === 'settings')

  // 模块角标：由模块按需提供读数（如待办到期数），常用区变化、窗口聚焦与周期轮询时刷新。
  useEffect(() => {
    let active = true
    const load = (): void => {
      void Promise.all(visiblePinned(pinned, modules).map(async module => {
        if (!module.badge) return null
        try { return [module.id, await module.badge()] as const }
        catch { return null }
      })).then(entries => {
        if (active) setBadges(Object.fromEntries(entries.filter((entry): entry is readonly [string, string | number] => entry !== null)))
      })
    }
    load()
    const timer = window.setInterval(load, 60000)
    window.addEventListener('focus', load)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [pinned, modules])

  return (
    <nav className="sidebar" data-mode={wide ? 'wide' : 'rail'} aria-label="主导航">
      {home && <NavButton wide={wide} icon={home.icon} name={home.name} path={home.path} shortcut="Ctrl+1" />}
      {pinnedModules.length > 0 && (
        <div className="pinned-nav" data-testid="pinned-nav" role="group" aria-label="常用">
          {pinnedModules.map((module, index) => (
            <NavButton
              key={module.id}
              wide={wide}
              icon={module.icon}
              name={module.name}
              path={module.path}
              shortcut={`Ctrl+${index + 2}`}
              badge={badges[module.id]}
            />
          ))}
        </div>
      )}
      <NavButton wide={wide} icon={Ellipsis} name="更多" expanded={more} buttonRef={moreTrigger} onClick={() => setMore(!more)} />
      <div className="nav-bottom">
        {assistant && <NavButton wide={wide} icon={assistant.icon} name={assistant.name} path={assistant.path} shortcut="Ctrl+0" />}
        {settings && <NavButton wide={wide} icon={settings.icon} name={settings.name} path={settings.path} />}
      </div>
    </nav>
  )
}
