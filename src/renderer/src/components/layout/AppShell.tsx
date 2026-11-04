import { useEffect } from 'react'
import { registry } from '../../modules/registry'
import { useNavigation, visiblePinned } from '../../stores/navigation'
import { Router } from '../../router'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { MorePanel } from './MorePanel'
import { CommandPanel } from './CommandPanel'
import { Toast } from '../ui/Toast'
import { Spinner } from '../ui/Spinner'
import { ErrorBoundary } from '../ui/ErrorBoundary'
export function AppShell() {
  const { ready, error, path, initialize } = useNavigation()
  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = useNavigation.getState()
      if (event.key === 'Escape') { state.setMore(false); state.setCommand(false) }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); state.setCommand(!state.command) }
      const number = Number(event.key)
      if (number >= 1 && number <= 7) {
        event.preventDefault()
        const module = number === 1 ? registry.find(module => module.role === 'home') : visiblePinned(state.pinned)[number - 2]
        if (module?.path) state.navigate(module.path)
      }
    }
    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [])
  const current = registry.find(module => module.path === path)
  return <><TitleBar/><div className="app-shell"><Sidebar/>{current?.hasListPanel && <aside className="list-panel" aria-label={`${current.name}列表`}><h2>{current.name}</h2><p className="muted">此阶段仅提供导航入口。</p></aside>}<main className="main-content">{!ready ? <div className="page-loading"><Spinner/></div> : error ? <p role="alert">{error}</p> : <ErrorBoundary key={path}><Router/></ErrorBoundary>}</main></div><MorePanel/><CommandPanel/><Toast/></>
}
