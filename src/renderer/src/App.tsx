import { useEffect, useLayoutEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { useFocus } from './stores/focus'
import { flushPendingNotes } from './features/notes/pendingSaves'
import { subscribeToPlugins } from './modules/registry'

export function App() {
  useLayoutEffect(() => window.api.app.onBeforeClose(flushPendingNotes), [])
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
  return <ErrorBoundary><AppShell/></ErrorBoundary>
}
