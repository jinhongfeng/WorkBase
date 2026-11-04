import { lazy, Suspense, useMemo, useEffect, type ReactNode } from 'react'
import { registry } from './modules/registry'
import type { ModuleDefinition } from './modules/defineModule'
import { useNavigation } from './stores/navigation'
import { Spinner } from './components/ui/Spinner'
import { SettingsPage } from './features/settings/SettingsPage'

// A tiny hash router keeps file:// navigation offline without adding a routing dependency.
function Route({ path, element }: { path: string; element: ReactNode }) {
  const current = useNavigation(state => state.path)
  return current === path ? element : null
}
function ModuleHost({ module }: { module: ModuleDefinition }) {
  const Page = useMemo(() => {
    const page = module.page
    return '__lazy' in page ? lazy(page.load) : page
  }, [module.page])
  return <Suspense fallback={<div className="page-loading"><Spinner/></div>}><Page/></Suspense>
}
export function Router() {
  const navigate = useNavigation(state => state.navigate)
  const path = useNavigation(state => state.path)
  useEffect(() => {
    const update = () => useNavigation.setState({ path: location.hash.slice(1) || '/dashboard' })
    addEventListener('hashchange', update)
    return () => removeEventListener('hashchange', update)
  }, [])
  useEffect(() => { if (path !== '/settings' && !registry.some(module => module.path === path)) navigate(registry.find(module => module.role === 'home')?.path || '/') }, [path, navigate])
  return <>{registry.map(module => <Route key={module.id} path={module.path ?? '/' + module.id} element={<ModuleHost module={module} />}/>)}<Route path="/settings" element={<SettingsPage/>}/></>
}
