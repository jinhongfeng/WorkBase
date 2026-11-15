import { useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import './list-sidebar.css'

export const COLLAPSED_LIST_WIDTH = 46

export function useListSidebar(key: string) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(key) === 'true')

  function toggle(): void {
    setCollapsed(!collapsed)
    localStorage.setItem(key, String(!collapsed))
  }

  return { collapsed, toggle }
}

type Props = {
  id: string
  className: string
  label: string
  collapsed: boolean
  onToggle(): void
  children: ReactNode
}

export function ListSidebar({ id, className, label, collapsed, onToggle, children }: Props) {
  const action = `${collapsed ? '展开' : '收起'}${label}`
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside className={`list-sidebar ${className}`} aria-label={label} data-collapsed={collapsed}>
      <button type="button" className="button ghost list-sidebar-toggle" aria-label={action} title={action}
        aria-controls={id} aria-expanded={!collapsed} onClick={onToggle}>
        <Icon size={16} aria-hidden="true" />
      </button>
      <div id={id} className="list-sidebar-content" hidden={collapsed}>
        {children}
      </div>
    </aside>
  )
}
