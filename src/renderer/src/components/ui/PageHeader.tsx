import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

interface Props {
  title: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  /** 返回入口：显示在标题左侧 */
  back?: { label: string; onClick(): void; disabled?: boolean }
  /** page：占满内容区的页头（默认）；panel：嵌在栏内（列表栏、对话栏）的小一号页头 */
  size?: 'page' | 'panel'
}

/** 统一页头：标题 + 右侧操作。
    所有功能页共用同一份间距与字号，避免各页自己写 header。 */
export function PageHeader({ title, actions, meta, back, size = 'page' }: Props) {
  return (
    <header className={size === 'panel' ? 'page-head page-head--panel' : 'page-head'}>
      <div className="page-head-copy">
        {back && <button type="button" className="page-back" disabled={back.disabled} onClick={back.onClick}><ArrowLeft size={14} aria-hidden="true" />{back.label}</button>}
        <h1>{title}</h1>
      </div>
      {(actions || meta) && (
        <div className="page-head-actions">
          {meta && <span className="page-head-meta">{meta}</span>}
          {actions}
        </div>
      )}
    </header>
  )
}
