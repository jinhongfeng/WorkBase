import { lazy, Suspense, useMemo, useEffect } from 'react'
import { useModuleRegistry } from './modules/registry'
import type { ModuleDefinition } from './modules/defineModule'
import { useNavigation } from './stores/navigation'
import { Spinner } from './components/ui/Spinner'

// A tiny hash router keeps file:// navigation offline without adding a routing dependency.
function ModuleHost({ page }: { page: NonNullable<ModuleDefinition['page']> }) {
  const Page = useMemo(() => {
    return '__lazy' in page ? lazy(page.load) : page
  }, [page])
  return <Suspense fallback={<div className="page-loading"><Spinner/></div>}><Page/></Suspense>
}
export function Router() {
  const navigate = useNavigation(state => state.navigate)
  const path = useNavigation(state => state.path)
  const modules = useModuleRegistry(state => state.modules)
  const pluginsReady = useModuleRegistry(state => state.pluginsReady)
  const module = modules.find(module => module.path === path)
  const waitingForPlugin = !pluginsReady && path.startsWith('/plugins/')
  useEffect(() => {
    const update = () => useNavigation.setState({ path: location.hash.slice(1) || '/dashboard' })
    addEventListener('hashchange', update)
    return () => removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    if (!module && !waitingForPlugin) navigate(modules.find(module => module.role === 'home')?.path || '/')
  }, [module, modules, navigate, waitingForPlugin])
  if (module?.pluginUrl) return <iframe key={module.pluginUrl} className="plugin-frame" title={module.name}
    src={module.pluginUrl} sandbox="allow-scripts allow-same-origin" />
  if (module?.page) return <ModuleHost key={module.id} page={module.page} />
  return waitingForPlugin ? <div className="page-loading"><Spinner /></div> : null
}
