import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { clamp } from '../../lib/utils'
import './panel-resize.css'

export function usePanelLayoutWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function usePanelWidth(key: string, min: number, max: number) {
  const [preferred, setPreferred] = useState(() => {
    const width = Number(localStorage.getItem(key))
    return Number.isInteger(width) && width >= min && width <= max ? width : null
  })
  const [preview, setPreview] = useState<number | null>(null)
  const commit = (width: number): void => {
    setPreferred(width)
    localStorage.setItem(key, String(width))
  }
  return { preferred, preview, setPreview, commit }
}

type PanelResizeProps = {
  side: 'left' | 'right'
  controls: string
  label: string
  width: number
  min: number
  max: number
  onPreview: (width: number | null) => void
  onCommit: (width: number) => void
}

const WIDTH_STEP = 16

export function PanelResizeHandle({ side, controls, label, width, min, max, onPreview, onCommit }: PanelResizeProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const adjustable = max > min
  const direction = side === 'left' ? 1 : -1
  const targetWidth = (event: PointerEvent<HTMLDivElement>, start: NonNullable<typeof drag.current>): number =>
    clamp(Math.round(start.startWidth + (event.clientX - start.startX) * direction), min, max)

  return (
    <div
      className="panel-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      aria-disabled={!adjustable}
      tabIndex={adjustable ? 0 : -1}
      title={`${label}，可拖动或使用左右方向键`}
      onPointerDown={event => {
        if (!adjustable || !event.isPrimary || event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (start?.pointerId === event.pointerId) onPreview(targetWidth(event, start))
      }}
      onPointerUp={event => {
        const start = drag.current
        if (start?.pointerId !== event.pointerId) return
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
        if (!adjustable || drag.current || event.altKey || event.ctrlKey || event.metaKey) return
        const targets: Record<string, number> = {
          ArrowLeft: width - WIDTH_STEP * direction,
          ArrowRight: width + WIDTH_STEP * direction,
          Home: min,
          End: max
        }
        if (!Object.hasOwn(targets, event.key)) return
        event.preventDefault()
        const target = clamp(targets[event.key], min, max)
        if (target !== width) onCommit(target)
      }}
    />
  )
}
