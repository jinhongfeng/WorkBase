/** 迷你折线：只画折线与末点，不加网格与渐变，符合「图表去装饰」的约束。
    values 少于 2 个时不渲染，由调用方决定是否展示。 */
export function Sparkline({ values, width = 74, height = 28, label }: {
  values: number[]
  width?: number
  height?: number
  label?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - 2 - ((value - min) / span) * (height - 5)
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const
  })
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const area = `${path} L${width} ${height} L0 ${height} Z`
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg
      className="stat-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      focusable="false"
    >
      <path d={area} fill="currentColor" opacity=".10" stroke="none" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  )
}
