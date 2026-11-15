import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Sparkline } from './Sparkline'

interface Props {
  label: ReactNode
  value: ReactNode
  unit?: string
  icon?: LucideIcon
  /** 环比/对比说明，如「环比 +12.4%」；tone 决定颜色语义。 */
  delta?: ReactNode
  tone?: 'up' | 'down' | 'flat'
  accent?: boolean
  spark?: number[]
  sparkLabel?: string
  hint?: ReactNode
  children?: ReactNode
}

/** 统计卡：主数字左上、迷你折线右下，卡片内不再分层（DESIGN 借鉴 boardui Stat Cards）。 */
export function StatCard({ label, value, unit, icon: Icon, delta, tone = 'flat', accent, spark, sparkLabel, hint, children }: Props) {
  const showSpark = Boolean(spark && spark.length > 1)
  return (
    <article className={`stat-card${accent ? ' accent' : ''}${showSpark ? ' has-spark' : ''}`}>
      <span className="stat-label">{Icon && <Icon size={13} strokeWidth={1.8} aria-hidden="true" />}{label}</span>
      <strong className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </strong>
      {delta && <span className="stat-delta" data-tone={tone}>{delta}</span>}
      {!delta && hint && <span className="stat-delta">{hint}</span>}
      {showSpark && <Sparkline values={spark!} label={sparkLabel} />}
      {children}
    </article>
  )
}
