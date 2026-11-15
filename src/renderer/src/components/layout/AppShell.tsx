import { useEffect, useLayoutEffect, useRef } from 'react'
import { registry } from '../../modules/registry'
import { useNavigation, visiblePinned } from '../../stores/navigation'
import { Router } from '../../router'
import { TitleBar } from './TitleBar'
import { Wallpaper } from './Wallpaper'
import { Splash } from './Splash'
import { Sidebar } from './Sidebar'
import { MorePanel } from './MorePanel'
import { CommandPanel } from './CommandPanel'
import { Toast } from '../ui/Toast'
import { Spinner } from '../ui/Spinner'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { FocusRoom } from '../../features/focus/FocusRoom'
import { useFocus } from '../../stores/focus'
import { useShortcuts } from '../../stores/shortcuts'
import { useImmersiveWallpaper, useWallpaper } from '../../stores/wallpaper'
import { humanError } from '../../lib/utils'

export function AppShell() {
  const ready = useNavigation(state => state.ready)
  const error = useNavigation(state => state.error)
  const path = useNavigation(state => state.path)
  const more = useNavigation(state => state.more)
  const initialize = useNavigation(state => state.initialize)
  const immersive = useFocus(state => state.immersive)
  const content = useRef<HTMLElement>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const previousPage = useRef({ more, path })

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    const report = (error: unknown): void => window.toast.error(humanError(error))
    void useWallpaper.getState().load().catch(report)
    void useImmersiveWallpaper.getState().load().catch(report)
  }, [])
  useLayoutEffect(() => { content.current?.scrollTo({ top: 0, left: 0 }) }, [path, immersive])
  useLayoutEffect(() => {
    const previous = previousPage.current
    previousPage.current = { more, path }
    if (!previous.more || more || immersive) return
    const destination = path === previous.path ? moreTrigger.current : content.current
    destination?.focus({ preventScroll: true })
  }, [more, path, immersive])

  useEffect(() => { void useShortcuts.getState().load() }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || useFocus.getState().immersive) return
      const state = useNavigation.getState()
      if (event.key === 'Escape' && state.more) { state.setMore(false); return }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      // 命令面板与模块跳转的组合键可在「设置 → 关于与快捷键」自定义。
      const commandKey = useShortcuts.getState().map['command'] ?? 'f'
      if (key === commandKey && state.command) { event.preventDefault(); state.setCommand(false); return }
      if (document.querySelector('dialog:modal')) return
      if (key === commandKey) { event.preventDefault(); state.setCommand(true); return }
      const shortcuts = useShortcuts.getState().map
      const shortcut = registry.find(module => (shortcuts[module.id] ?? module.shortcutKey) === key)
      if (shortcut?.path) { event.preventDefault(); state.navigate(shortcut.path); return }
      const number = /^[0-9]$/.test(event.key) ? Number(event.key) : -1
      if (number >= 0 && number <= 9) {
        event.preventDefault()
        const module = number === 0
          ? registry.find(item => item.role === 'assistant')
          : number === 1
            ? registry.find(item => item.role === 'home')
            : visiblePinned(state.pinned)[number - 2]
        if (module?.path) state.navigate(module.path)
      }
    }
    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      {immersive ? <FocusRoom /> : <>
        <Wallpaper />
        <div inert={more}>
          <TitleBar />
          <div className="app-shell">
            <Sidebar moreTrigger={moreTrigger} />
            <main ref={content} className="main-content" tabIndex={-1}>
              {!ready ? <div className="page-loading"><Spinner /></div>
                : error ? <div className="page"><p role="alert">{error}</p></div>
                  : <ErrorBoundary key={path}><Router /></ErrorBoundary>}
            </main>
          </div>
        </div>
        <MorePanel />
        <CommandPanel />
        <Toast />
      </>}
      <Splash />
    </>
  )
}
