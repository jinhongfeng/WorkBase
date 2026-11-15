import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Columns2, GripVertical, Maximize2, X } from 'lucide-react'
import type { CardSize } from '../../modules/defineModule'
import type { CardColumn } from './DashboardBoard'
import { cn } from '../../lib/utils'

/** 缩放判定阈值：向右拖过该距离放大，向左拖过该距离缩小（单位 px）。 */
const RESIZE_THRESHOLD = 40

interface CardShellProps {
  cardKey: string
  size: CardSize
  column: CardColumn
  editing: boolean
  /** 当前是否有卡片正在被拖拽（用于决定是否允许 drop）。 */
  dragging: boolean
  onDragStart(key: string): void
  onDragEnd(): void
  onDrop(key: string): void
  /** 键盘方向键移动（无障碍替代），direction = -1 前移 / 1 后移。 */
  onMove(key: string, direction: -1 | 1): void
  onResize(size: CardSize): void
  onColumnChange(column: CardColumn): void
  onRemove(): void
  children: ReactNode
}

/** 首页卡片外壳：编辑态下提供拖拽排序手柄、缩放角标与移除按钮。 */
export default function CardShell({
  cardKey,
  size,
  column,
  editing,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
  onResize,
  onColumnChange,
  onRemove,
  children
}: CardShellProps) {
  const [previewSize, setPreviewSize] = useState<CardSize | null>(null)
  const latestSize = useRef<CardSize>(size)
  const effectiveSize = previewSize ?? size
  const resizeLabel = size === 'l' ? '缩小卡片' : '放大卡片'

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startSize = size
    latestSize.current = startSize
    setPreviewSize(startSize)

    const handleMove = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX
      const next: CardSize = startSize === 'l' ? (dx < -RESIZE_THRESHOLD ? 'm' : 'l') : (dx > RESIZE_THRESHOLD ? 'l' : 'm')
      latestSize.current = next
      setPreviewSize(next)
    }
    const handleUp = (): void => {
      onResize(latestSize.current)
      setPreviewSize(null)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  return (
    <div
      className={cn('home-card', effectiveSize === 'l' ? 'home-card-l' : 'home-card-m', editing && 'is-editing', previewSize !== null && 'is-resizing')}
      data-card-key={cardKey}
      data-card-size={effectiveSize}
      data-card-col={column}
      onDragOver={event => { if (editing && dragging) event.preventDefault() }}
      onDrop={event => {
        if (!editing) return
        event.preventDefault()
        event.stopPropagation()
        onDrop(cardKey)
      }}
    >
      {children}
      {editing && (
        <>
          <div className="home-card-tools">
            {effectiveSize === 'm' && (
              <button
                type="button"
                className="home-card-column"
                title={`移到${column === 'left' ? '右' : '左'}列`}
                aria-label={`移到${column === 'left' ? '右' : '左'}列`}
                onClick={() => onColumnChange(column === 'left' ? 'right' : 'left')}
              >
                <Columns2 size={14} /><span>{column === 'left' ? '移到右列' : '移到左列'}</span>
              </button>
            )}
            <button
              type="button"
              className="home-card-grip"
              draggable
              title="拖拽排序，或按左右方向键移动"
              aria-label="拖拽排序"
              onDragStart={event => {
                onDragStart(cardKey)
                event.dataTransfer.setData('text/plain', cardKey)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={onDragEnd}
              onKeyDown={event => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); onMove(cardKey, -1) }
                if (event.key === 'ArrowRight') { event.preventDefault(); onMove(cardKey, 1) }
              }}
            >
              <GripVertical size={16} />
            </button>
            <button type="button" className="home-card-remove" title="移除卡片" aria-label="移除卡片" onClick={onRemove}>
              <X size={14} />
            </button>
          </div>
          <button type="button" className="home-card-resize"
            title={`拖动调整大小，也可按回车或空格${resizeLabel}`}
            aria-label={resizeLabel}
            onPointerDown={handleResizeStart}
            onClick={event => { if (event.detail === 0) onResize(size === 'l' ? 'm' : 'l') }}
          >
            <Maximize2 size={12} />
          </button>
        </>
      )}
    </div>
  )
}
