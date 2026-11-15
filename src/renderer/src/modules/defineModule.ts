import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface LazyPage { __lazy: true; load: () => Promise<{ default: ComponentType }> }
export function lazyPage(load: () => Promise<{ default: ComponentType }>): LazyPage { return { __lazy: true, load } }

/** 首页卡片尺寸：m = 单列（默认），l = 跨满两列。 */
export type CardSize = 'm' | 'l'

export type DashboardCardDefinition = {
  name: string
  defaultVisible?: boolean
  /** 首页初始顺序，默认 100；不写入用户设置。 */
  defaultOrder?: number
  /** 卡片默认尺寸，用户可在编辑态拖动覆盖，覆盖值存 ui.dashboard_card_sizes。 */
  defaultSize?: CardSize
} & (
  | { id: 'quick-capture' | 'today-journal' | 'today-todos' | 'todo-overview' | 'todo-completion' | 'focus-trend' | 'activity-heatmap' | 'month-calendar'; component?: never }
  | { id: string; component: ComponentType }
)

/** 模块贡献的命令面板快速动作：run 触发的导航会自行关闭面板。 */
export interface CommandActionDefinition {
  id: string
  name: string
  icon: LucideIcon
  keywords?: string[]
  run(): void | Promise<void>
}

interface ModuleMetadata {
  id: string
  name: string
  icon: LucideIcon
  group: string
  order?: number
  path?: string
  role?: 'home' | 'assistant' | 'settings'
  /** 小写字母，用于 Ctrl/Cmd 模块快捷键。 */
  shortcutKey?: string
  pinnable?: boolean
  defaultPinned?: boolean
  hasListPanel?: boolean
  requires?: 'mailAccount' | 'aiConfig'
  /** 只作为机制示例或内部页面存在，不出现在导航与命令面板。 */
  hidden?: boolean
  keywords?: string[]
  summary?: () => Promise<string>
  /** 侧栏角标读数（如待办到期数），返回 0 或空串时不显示；侧栏定期与窗口聚焦时刷新。 */
  badge?: () => Promise<number | string>
  commandActions?: CommandActionDefinition[]
  dashboardCards?: DashboardCardDefinition[]
}

export type ModuleDefinition = ModuleMetadata & (
  | { page: ComponentType | LazyPage; pluginUrl?: never }
  | { pluginUrl: string; page?: never }
)

/** 新建 features/<id>/module.tsx 并默认导出本函数即可自动出现在导航中。 */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return { path: '/' + definition.id, pinnable: true, hasListPanel: false, order: 100, ...definition }
}
