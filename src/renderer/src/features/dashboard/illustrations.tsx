import type { CSSProperties } from 'react'

interface IllustrationProps {
  className?: string
  style?: CSSProperties
}

/** 抽象植物枝叶：低饱和描边，置于内容下层。 */
export function LeafSprig({ className, style }: IllustrationProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 220 200" fill="none" aria-hidden="true">
      <path d="M40 196 C60 150 70 110 96 70 C112 46 138 34 176 30" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path d="M96 70 C86 64 72 66 62 78 C74 86 90 84 96 70Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9" />
      <path d="M120 48 C110 38 94 38 84 50 C98 60 116 58 120 48Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9" />
      <path d="M150 36 C142 24 126 22 116 34 C130 44 146 42 150 36Z" fill="var(--accent-2-soft)" stroke="var(--accent-2)" strokeWidth="1.5" opacity="0.9" />
      <path d="M70 120 C62 114 50 116 44 126 C56 134 68 132 70 120Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" opacity="0.85" />
      <circle cx="176" cy="30" r="4" fill="var(--accent)" opacity="0.5" />
    </svg>
  )
}

/** 柔和波浪线。 */
export function WaveLines({ className, style }: IllustrationProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 320 120" fill="none" aria-hidden="true">
      <path d="M0 80 C50 50 90 110 150 80 C210 50 260 110 320 80" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.18" />
      <path d="M0 96 C60 70 100 122 160 96 C220 70 270 122 320 96" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round" opacity="0.16" />
      <path d="M0 64 C40 40 80 96 140 64 C200 40 250 96 320 64" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.12" />
    </svg>
  )
}

/** 日历纸纹涂鸦：圆角方块 + 横线，呼应月历卡片。 */
export function CalendarDoodle({ className, style }: IllustrationProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <rect x="30" y="36" width="100" height="104" rx="14" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
      <rect x="30" y="36" width="100" height="24" rx="12" fill="var(--accent)" opacity="0.22" />
      <path d="M44 30 v14 M116 30 v14" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path d="M44 78 h72 M44 98 h52 M44 118 h60" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.28" />
      <circle cx="120" cy="104" r="16" fill="var(--accent-2-soft)" stroke="var(--accent-2)" strokeWidth="2" opacity="0.7" />
    </svg>
  )
}
