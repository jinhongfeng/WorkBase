import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { clamp } from '../../lib/utils'
import './height-handle.css'

const HEIGHT_STEP = 12

interface HeightHandleProps {
  label: string
  height: number
  min: number
  max: number
  onPreview(height: number | null): void
  onCommit(height: number): void
  style?: CSSProperties
}

/** 边缘高度手柄：向上拖动增大高度，聚焦后按上下方向键步进。 */
export function HeightHandle({ label, height, min, max, onPreview, onCommit, style }: HeightHandleProps) {
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const targetHeight = (event: ReactPointerEvent<HTMLDivElement>, start: NonNullable<typeof drag.current>): number => {
    return clamp(start.startHeight + (start.startY - event.clientY), min, max)
  }

  return (
    <div
      className="height-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={height}
      aria-valuetext={`${height} 像素`}
      tabIndex={0}
      style={style}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        onPreview(targetHeight(event, start))
      }}
      onPointerUp={event => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        drag.current = null
        onPreview(null)
        const target = targetHeight(event, start)
        if (target !== start.startHeight) onCommit(target)
      }}
      onLostPointerCapture={event => {
        if (drag.current?.pointerId !== event.pointerId) return
        drag.current = null
        onPreview(null)
      }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        const target = clamp(height + (event.key === 'ArrowUp' ? HEIGHT_STEP : -HEIGHT_STEP), min, max)
        if (target !== height) onCommit(target)
      }}
    />
  )
}
