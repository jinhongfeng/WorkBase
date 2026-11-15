import { useEffect, useLayoutEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { useFocus } from './stores/focus'
import { flushPendingNotes } from './features/notes/pendingSaves'
import { flushPageTime } from './lib/pageTime'
import { subscribeToPlugins } from './modules/registry'
import QuickCapturePage from './features/quick-capture/QuickCapturePage'

// 全局速记浮窗用独立窗口加载同一份渲染入口，hash 带 bare=1 时不渲染工作台外壳。
const bareQuickCapture = new URLSearchParams(location.hash.split('?')[1] ?? '').get('bare') === '1'

export function App() {
  useLayoutEffect(() => window.api.app.onBeforeClose(async () => {
    await flushPageTime()
    return flushPendingNotes()
  }), [])
  useEffect(subscribeToPlugins, [])
  useEffect(() => {
    const tick = (): void => { void useFocus.getState().tick() }
    tick()
    const timer = setInterval(tick, 1000)
    addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return <ErrorBoundary>{bareQuickCapture ? <QuickCapturePage /> : <AppShell />}</ErrorBoundary>
}
