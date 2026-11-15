import type { ReactNode } from 'react'

interface Props {
  label?: ReactNode
  /** 当前值（0–max）。 */
  value: number
  max?: number
  /** 右侧读数，默认百分比；传入字符串可显示「3 / 8」。 */
  readout?: ReactNode
  tone?: 'accent' | 'success' | 'warn' | 'danger' | 'muted'
  /** 读屏文本，默认「已完成 62%」。 */
  valueText?: string
  /** 没有可见标题时用它给读屏一个名称。 */
  ariaLabel?: string
}

/** 语义化进度条：role=meter + aria-valuetext，读屏可读（借鉴 heroui Meter）。 */
export function Meter({ label, value, max = 100, readout, tone = 'accent', valueText, ariaLabel }: Props) {
  const safeMax = max > 0 ? max : 1
  const ratio = Math.max(0, Math.min(1, value / safeMax))
  const percent = Math.round(ratio * 100)
  return (
    <div
      className="meter"
      data-tone={tone}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(value, safeMax)}
      aria-valuetext={valueText ?? `已完成 ${percent}%`}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
    >
      {(label || readout) && (
        <span className="meter-head">
          <span>{label}</span>
          <strong>{readout ?? `${percent}%`}</strong>
        </span>
      )}
      <span className="meter-track" aria-hidden="true">
        <i className="meter-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  )
}
