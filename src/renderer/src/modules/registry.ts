import { Puzzle } from 'lucide-react'
import { create } from 'zustand'
import type { InstalledPlugin } from '@shared/plugins'
import { defineModule, type ModuleDefinition } from './defineModule'

/**
 * 编译期扫描 features/<id>/module.tsx，新增一个模块文件即自动注册。
 * glob 必须是字面量相对路径；漏掉 eager 会拿到加载函数而非模块对象。
 */
const found = import.meta.glob('../features/*/module.tsx', { eager: true })

export const allModules: ModuleDefinition[] = Object.values(found)
  .map(module => (module as { default?: ModuleDefinition }).default)
  .filter((module): module is ModuleDefinition => Boolean(module))
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

/** 导航、命令面板、首页卡片使用的可见模块。 */
export const registry: ModuleDefinition[] = allModules.filter(module => !module.hidden)

export const useModuleRegistry = create(() => ({ modules: registry, pluginsReady: false }))

export function subscribeToPlugins(): () => void {
  let currentRequest = 0
  const refresh = (): void => {
    const request = ++currentRequest
    void window.api.plugins.list().then(update, () => update([]))

    function update(plugins: InstalledPlugin[]): void {
      if (request !== currentRequest) return
      const modules = plugins.map(plugin => defineModule({
        id: `plugin/${plugin.id}`,
        path: `/plugins/${plugin.id}`,
        name: plugin.name,
        icon: Puzzle,
        group: '插件',
        keywords: [plugin.id],
        pluginUrl: plugin.entryUrl
      }))
      useModuleRegistry.setState({ modules: [...registry, ...modules], pluginsReady: true })
    }
  }

  const unsubscribe = window.api.plugins.onChanged(refresh)
  refresh()
  return () => { currentRequest++; unsubscribe() }
}
