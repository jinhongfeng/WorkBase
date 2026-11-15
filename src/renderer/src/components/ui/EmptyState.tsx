import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
export function EmptyState({ icon: Icon, title, description, children, compact = false }: {
  icon?: LucideIcon; title: string; description?: string; children?: ReactNode; compact?: boolean
}) {
  return <div className={compact ? 'empty-state empty-state--compact' : 'empty-state'}>
    {Icon && <span className="empty-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.5} /></span>}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {children && <div className="actions">{children}</div>}
  </div>
}
