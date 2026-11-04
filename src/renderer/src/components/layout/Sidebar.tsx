import { Ellipsis, Settings } from 'lucide-react'
import { registry } from '../../modules/registry'
import { useNavigation, visiblePinned } from '../../stores/navigation'
import { Tooltip } from '../ui/Tooltip'
import type { LucideIcon } from 'lucide-react'
function NavButton({ icon: Icon, name, shortcut = '', path, onClick, active }: { icon: LucideIcon; name: string; shortcut?: string; path?: string; onClick?(): void; active?: boolean }) {
  const current = useNavigation(state => state.path)
  return <Tooltip label={`${name}${shortcut ? ' · ' + shortcut : ''}`}><button aria-label={name} aria-current={path === current ? 'page' : undefined} className={`nav-button ${active || path === current ? 'selected' : ''}`} onClick={onClick || (() => path && useNavigation.getState().navigate(path))}><Icon size={21} strokeWidth={1.7}/></button></Tooltip>
}
export function Sidebar() {
  const { pinned, more, setMore } = useNavigation()
  const home = registry.find(module => module.role === 'home')
  const assistant = registry.find(module => module.role === 'assistant')
  return <nav className="sidebar" aria-label="主导航">
    {home && <NavButton icon={home.icon} name={home.name} path={home.path} shortcut="Ctrl+1"/>}
    <div className="nav-divider"/>
    <div className="pinned-nav" data-testid="pinned-nav">{visiblePinned(pinned).map((module, index) => <NavButton key={module.id} icon={module.icon} name={module.name} path={module.path} shortcut={`Ctrl+${index + 2}`}/>)}</div>
    <NavButton icon={Ellipsis} name="更多" active={more} onClick={() => setMore(!more)}/>
    <div className="nav-bottom">{assistant && <NavButton icon={assistant.icon} name={assistant.name} path={assistant.path}/>}<NavButton icon={Settings} name="设置" path="/settings"/></div>
  </nav>
}
