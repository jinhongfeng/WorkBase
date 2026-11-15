import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { clamp } from '../../lib/utils'

const DEFAULT_WIDTH = 680
const MIN_WIDTH = 360
const EDGE_STEP = 16
const INSETS_KEY = 'ui.notes.editorInsets'

type Edge = 'left' | 'right'
type Insets = Record<Edge, number>
type Drag = { pointerId: number; startX: number; startPosition: number; position: number; insets?: Insets }

function readInsets(): Insets | null {
  const saved = localStorage.getItem(INSETS_KEY)
  if (!saved || !/^\d{1,4},\d{1,4}$/.test(saved)) return null
  const [left, right] = saved.split(',').map(Number)
  return { left, right }
}

function saveInsets({ left, right }: Insets): void {
  localStorage.setItem(INSETS_KEY, `${left},${right}`)
}

export function NoteCanvas({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [width, setWidth] = useState(0)
  const [insets, setInsets] = useState(readInsets)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => setWidth(track.clientWidth)
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const defaultInset = Math.max(0, Math.floor((width - DEFAULT_WIDTH) / 2))
  const preferred = insets ?? { left: defaultInset, right: defaultInset }
  const room = Math.max(0, width - MIN_WIDTH)
  const total = preferred.left + preferred.right
  const scale = total > room ? room / total : 1
  const left = Math.round(preferred.left * scale)
  const right = Math.min(room - left, Math.round(preferred.right * scale))
  const edges = [
    { side: 'left' as const, label: '调整笔记左边界', position: left, min: 0, max: room - right },
    { side: 'right' as const, label: '调整笔记右边界', position: width - right, min: width - room + left, max: width }
  ]

  return (
    <div className="notes-canvas">
      <div className="notes-track" ref={trackRef}>
        <div className="notes-paper" style={{ marginLeft: left, marginRight: right }}>
          {edges.map(({ side, label, position, min, max }) => {
            const adjustable = max > min
            const move = (target: number): Insets => {
              const updated = side === 'left' ? { left: target, right } : { left, right: width - target }
              setInsets(updated)
              return updated
            }
            const movePointer = (event: PointerEvent<HTMLDivElement>): void => {
              const current = drag.current
              if (!current || current.pointerId !== event.pointerId) return
              const target = clamp(Math.round(current.startPosition + event.clientX - current.startX), min, max)
              if (target === current.position) return
              current.position = target
              current.insets = move(target)
            }

            return (
              <div
                key={side}
                className="notes-width-handle"
                data-edge={side}
                role="slider"
                aria-label={label}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={position}
                aria-valuetext={`正文宽 ${width - left - right} 像素`}
                aria-disabled={!adjustable}
                tabIndex={adjustable ? 0 : -1}
                title={adjustable ? `${label}，拖动或按方向键` : label}
                onPointerDown={event => {
                  if (!adjustable || event.button !== 0 || drag.current) return
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag.current = { pointerId: event.pointerId, startX: event.clientX, startPosition: position, position }
                }}
                onPointerMove={movePointer}
                onPointerUp={movePointer}
                onLostPointerCapture={event => {
                  const current = drag.current
                  if (!current || current.pointerId !== event.pointerId) return
                  drag.current = null
                  if (current.insets) saveInsets(current.insets)
                }}
                onKeyDown={event => {
                  if (!adjustable || drag.current || event.altKey || event.ctrlKey || event.metaKey) return
                  const targets: Record<string, number> = {
                    ArrowLeft: position - EDGE_STEP,
                    ArrowDown: position - EDGE_STEP,
                    ArrowRight: position + EDGE_STEP,
                    ArrowUp: position + EDGE_STEP,
                    Home: min,
                    End: max
                  }
                  if (!Object.hasOwn(targets, event.key)) return
                  event.preventDefault()
                  const target = clamp(targets[event.key], min, max)
                  if (target !== position) saveInsets(move(target))
                }}
              />
            )
          })}
          {children}
        </div>
      </div>
    </div>
  )
}
