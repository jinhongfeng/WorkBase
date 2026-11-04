import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
export interface LazyPage { __lazy: true; load: () => Promise<{ default: ComponentType }> }
export function lazyPage(load: () => Promise<{ default: ComponentType }>): LazyPage { return { __lazy: true, load } }
export interface ModuleDefinition {
  id: string
  name: string
  icon: LucideIcon
  group: string
  order?: number
  path?: string
  role?: 'home' | 'assistant'
  pinnable?: boolean
  defaultPinned?: boolean
  hasListPanel?: boolean
  requires?: 'mailAccount' | 'aiConfig'
  summary?: () => Promise<string>
  page: ComponentType | LazyPage
}
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return { path: '/' + definition.id, pinnable: true, hasListPanel: false, order: 100, ...definition }
}
