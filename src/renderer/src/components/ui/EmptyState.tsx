import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
export function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><Icon size={24} strokeWidth={1.5}/><h3>{title}</h3><p>{description}</p>{children && <div className="actions">{children}</div>}</div>
}
