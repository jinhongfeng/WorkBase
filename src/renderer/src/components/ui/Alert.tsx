import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

type Tone = 'info' | 'success' | 'warn' | 'danger'
const ICONS = { info: Info, success: CircleCheck, warn: TriangleAlert, danger: CircleAlert }

interface Props {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  /** 行内操作（重试、去配置等）。 */
  action?: ReactNode
  onClose?: () => void
  className?: string
}

/** 内联提示条：需要停留阅读的错误与状态用它，不用会消失的 toast。 */
export function Alert({ tone = 'info', title, children, action, onClose, className = '' }: Props) {
  const Icon = ICONS[tone]
  return (
    <div className={`alert ${className}`.trim()} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
      <div className="alert-body">
        {title && <span className="alert-title">{title}</span>}
        {children}
        {action && <div className="alert-actions">{action}</div>}
      </div>
      {onClose && <button className="alert-close" type="button" aria-label="关闭提示" onClick={onClose}><X size={14} /></button>}
    </div>
  )
}
