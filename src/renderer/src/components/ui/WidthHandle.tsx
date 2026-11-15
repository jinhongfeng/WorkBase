import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { clamp } from '../../lib/utils'
import './width-handle.css'

const WIDTH_STEP = 16

interface WidthHandleProps {
  /** 贴在内容区的哪一侧；向外拖动增大宽度。 */
  edge: 'left' | 'right'
  label: string
  width: number
  min: number
  max: number
  onPreview(width: number | null): void
  onCommit(width: number): void
  style?: CSSProperties
}

/** 内容区左右边缘的宽度手柄：可拖动，聚焦后按左右方向键步进。 */
export function WidthHandle({ edge, label, width, min, max, onPreview, onCommit, style }: WidthHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const targetWidth = (event: ReactPointerEvent<HTMLDivElement>, start: NonNullable<typeof drag.current>): number => {
    const delta = (event.clientX - start.startX) * (edge === 'right' ? 1 : -1)
    return clamp(start.startWidth + delta, min, max)
  }

  return (
    <div
      className="width-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      tabIndex={0}
      data-edge={edge}
      style={style}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        onPreview(targetWidth(event, start))
      }}
      onPointerUp={event => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        drag.current = null
        onPreview(null)
        const target = targetWidth(event, start)
        if (target !== start.startWidth) onCommit(target)
      }}
      onLostPointerCapture={event => {
        if (drag.current?.pointerId !== event.pointerId) return
        drag.current = null
        onPreview(null)
      }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const outward = edge === 'right' ? 'ArrowRight' : 'ArrowLeft'
        const inward = edge === 'right' ? 'ArrowLeft' : 'ArrowRight'
        if (event.key !== outward && event.key !== inward) return
        event.preventDefault()
        const target = clamp(width + (event.key === outward ? WIDTH_STEP : -WIDTH_STEP), min, max)
        if (target !== width) onCommit(target)
      }}
    />
  )
}
