import type { CSSProperties, ReactNode } from 'react'

interface Props {
  value: number
  max?: number
  min?: number
  /** 渲染直径（px）；缺省时尺寸交给外部 CSS（可随断点变化）。SVG viewBox 固定 0 0 100 100，等比缩放。 */
  size?: number
  /** 描边宽（viewBox 单位，占直径百分比）。248px 直径上 8px 描边传 3.2。 */
  stroke?: number
  tone?: 'accent' | 'success' | 'warn' | 'danger' | 'muted'
  /** 读屏文本，默认「已完成 N%」。 */
  valueText?: string
  /** 没有可见标题时给读屏一个名称。 */
  ariaLabel?: string
  className?: string
  /** 环心内容（读数、图标等），绝对定位铺满环内。 */
  children?: ReactNode
}

/** 主弧与轨道之间固定让出的缺口（百分比），视觉特征来自 Magic UI animated-circular-progress-bar。 */
const GAP_PERCENT = 5

/** 语义化环形进度：role=meter + aria-valuetext，读屏可读。
 *  几何沿用 Magic UI animated-circular-progress-bar 的双弧结构——主弧从 12 点顺时针，
 *  轨道补足剩余弧长，两者之间固定留 GAP_PERCENT 缺口；颜色与时长走项目 token。 */
export function CircularMeter({ value, max = 100, min = 0, size = 128, stroke = 10, tone = 'accent', valueText, ariaLabel, className, children }: Props) {
  const safeMax = max > min ? max : min + 1
  const ratio = Math.max(0, Math.min(1, (value - min) / (safeMax - min)))
  const percent = ratio * 100
  const circumference = 2 * Math.PI * 45
  const percentToPx = circumference / 100
  const readout = valueText ?? `已完成 ${Math.round(percent)}%`
  return (
    <div
      className={`circular-meter${className ? ` ${className}` : ''}`}
      data-tone={tone}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(value, safeMax)}
      aria-valuetext={readout}
      aria-label={ariaLabel}
      style={(
        size
          ? { width: size, height: size }
          : undefined
      ) as CSSProperties}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        {/* 轨道：主弧超过 90% 时不画，避免与缺口重叠。 */}
        {percent <= 90 && (
          <circle
            className="circular-meter-track"
            cx="50" cy="50" r="45"
            strokeWidth={stroke}
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={`${(90 - percent) * percentToPx} ${circumference}`}
            transform={`rotate(${90 + GAP_PERCENT * 3.6} 50 50) scale(1 -1)`}
          />
        )}
        <circle
          className="circular-meter-value"
          cx="50" cy="50" r="45"
          strokeWidth={stroke}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={`${percent * percentToPx} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      {children && <div className="circular-meter-center">{children}</div>}
    </div>
  )
}
