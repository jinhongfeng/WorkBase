import type { ReactNode } from 'react'

export interface BarItem {
  label: string
  value: number
  /** 显示文本，默认由 value 转换；含金额/百分比时由调用方格式化。 */
  display?: ReactNode
  /** 次要说明，如占比。 */
  note?: ReactNode
  tone?: 'accent' | 'clay' | 'iris' | 'muted'
  /** 覆盖条形的填充色，用于与其他图（如环形占比）的切片一一对应。 */
  color?: string
}

/** 横向排行条：无坐标轴，按最大值归一，读小占比比环形图准（借鉴 boardui Bar List Card）。 */
export function BarList({ items, max, compact = false, label }: { items: BarItem[]; max?: number; compact?: boolean; label?: string }) {
  const peak = max ?? Math.max(1, ...items.map(item => item.value))
  return (
    <ul className={`bar-list${compact ? ' compact' : ''}`} aria-label={label}>
      {items.map((item, index) => (
        <li className="bar-row" key={`${item.label}-${index}`} data-tone={item.tone ?? 'accent'}>
          <span className="bar-label">
            <span className="bar-rank num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span>{item.label}</span>
          </span>
          <span className="bar-value">
            {item.display ?? item.value}
            {item.note && <small>{item.note}</small>}
          </span>
          <span className="bar-track" aria-hidden="true">
            <i className="bar-fill" style={{ width: `${Math.max(2, Math.min(100, (item.value / peak) * 100))}%`, background: item.color }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
