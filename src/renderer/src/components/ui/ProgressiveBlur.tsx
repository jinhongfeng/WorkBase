import type { ReactNode } from 'react'

interface Props {
  /** 覆盖边缘：顶部 / 底部 / 上下同时（占满高度，遮罩只留在两端）。 */
  position?: 'top' | 'bottom' | 'both'
  /** 单边覆盖高度；position 为 both 时忽略。 */
  height?: string
  /** 由边缘向内的模糊阶梯（px），层数越多过渡越细腻、合成开销越大。 */
  blurLevels?: number[]
  children?: ReactNode
}

/** position 为 both 时所有层共用的整体遮罩：两端实、中间透。 */
const BOTH_MASK = 'linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,1) 5%, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%)'

/** 渐进模糊层：多层 backdrop-filter 配合渐变遮罩，让滚动列表边缘内容逐级虚化（搬运 Magic UI progressive-blur）。
 *  最外层（贴边）模糊最强，向内容方向逐层减弱；父容器需 position: relative。 */
export function ProgressiveBlur({ position = 'bottom', height = '32px', blurLevels = [1, 2, 4, 8, 16, 32], children }: Props) {
  const count = blurLevels.length
  const segment = 100 / count
  const vertical = position === 'both'
  const layers = blurLevels.map((blur, index) => {
    // 每层遮罩在自己的段内「透明→实→实→透明」，与相邻层衔接成连续渐变；末层直接压满边缘。
    const isLast = index === count - 1
    const mask = vertical
      ? BOTH_MASK
      : isLast
        ? `linear-gradient(to ${position}, rgba(0,0,0,0) ${(count - 1) * segment}%, rgba(0,0,0,1) 100%)`
        : `linear-gradient(to ${position}, rgba(0,0,0,0) ${index * segment}%, rgba(0,0,0,1) ${(index + 1) * segment}%, rgba(0,0,0,1) ${(index + 2) * segment}%, rgba(0,0,0,0) ${(index + 3) * segment}%)`
    return <div key={index} style={{
      position: 'absolute',
      inset: 0,
      zIndex: index + 1,
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      maskImage: mask,
      WebkitMaskImage: mask,
    }} />
  })
  return (
    <div className="progressive-blur" aria-hidden="true" style={{ height: vertical ? '100%' : height }}>
      {layers}
      {children}
    </div>
  )
}
