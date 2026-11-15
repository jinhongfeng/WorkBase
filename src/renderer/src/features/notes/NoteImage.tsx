import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { ArrowDownUp, GripVertical, RotateCcw } from 'lucide-react'
import { noteImageWidth } from '../../lib/markdown'

export function NoteImage({ node, editor, getPos, selected, updateAttributes }: ReactNodeViewProps) {
  const frame = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ startX: number; width: number; max: number; preview: number } | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const storedWidth = noteImageWidth(node.attrs.width)
  const displayedWidth = preview ?? storedWidth
  const imageStyle = displayedWidth === null ? undefined : { '--note-image-width': `${displayedWidth}px` } as CSSProperties
  const position = selected ? getPos() : undefined
  const paired = position !== undefined && editor.state.doc.resolve(position).parent.type.name === 'noteImageRow'

  function resize(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !drag.current) return
    const { startX, width, max } = drag.current
    const minimum = Math.min(48, width)
    drag.current.preview = Math.round(Math.max(minimum, Math.min(max, width + event.clientX - startX)))
    setPreview(drag.current.preview)
  }

  return (
    <NodeViewWrapper className="note-image-view" contentEditable={false}
      data-note-image="" data-selected={selected || undefined}>
      <div className="note-image-drop-preview" aria-hidden="true"><span>并排到左侧</span><span>并排到右侧</span></div>
      <div className="note-image-frame" ref={frame} style={imageStyle}>
        <img ref={image} src={node.attrs.src} alt={node.attrs.alt ?? ''} title={node.attrs.title ?? undefined}
          draggable="true" />
        <div className="note-image-controls">
          <span className="note-image-grip" draggable="true" title="拖到另一张图片所在行的左侧或右侧并排">
            <GripVertical size={14} aria-hidden="true" />
          </span>
          <label className="note-image-size" title="图片宽度（像素）">
            <input key={storedWidth} type="number" min="1" max="16384" defaultValue={storedWidth ?? ''}
              aria-label="图片宽度（像素）" placeholder="自动"
              onBlur={event => {
                const field = event.currentTarget
                const width = noteImageWidth(field.value)
                if (field.validity.badInput || (field.value && width === null)) {
                  field.value = storedWidth?.toString() ?? ''
                  return
                }
                if (width !== storedWidth) updateAttributes({ width })
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                if (event.key === 'Escape') {
                  event.currentTarget.value = storedWidth?.toString() ?? ''
                  event.currentTarget.blur()
                }
              }} />
            <span aria-hidden="true">px</span>
          </label>
          <button type="button" className="button ghost sm icon note-image-reset" aria-label="恢复自动宽度" title="恢复自动宽度"
            disabled={storedWidth === null} onClick={() => updateAttributes({ width: null })}>
            <RotateCcw size={13} />
          </button>
          {paired && (
            <button type="button" className="button ghost sm icon" aria-label="拆成两行" title="拆成两行"
              onClick={() => {
                const pos = getPos()
                if (pos === undefined) return
                const parent = editor.state.doc.resolve(pos)
                if (parent.parent.type.name !== 'noteImageRow') return
                editor.view.dispatch(closeHistory(editor.state.tr.replaceWith(parent.before(), parent.after(), parent.parent.content)))
                editor.view.focus()
              }}>
              <ArrowDownUp size={14} />
            </button>
          )}
        </div>
        <button type="button" className="note-image-resize" tabIndex={-1} aria-label="拖动调整图片宽度" title="拖动调整图片宽度"
          onPointerDown={event => {
            const available = frame.current?.parentElement?.clientWidth
            if (event.button !== 0 || !available || !image.current) return
            event.preventDefault()
            const width = image.current.getBoundingClientRect().width
            if (!width) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { startX: event.clientX, width, max: available, preview: width }
          }}
          onPointerMove={resize}
          onPointerUp={event => {
            const start = drag.current
            if (!start) return
            if (Math.abs(event.clientX - start.startX) >= 2) {
              resize(event)
              updateAttributes({ width: start.preview })
            }
            drag.current = null
            setPreview(null)
          }}
          onLostPointerCapture={() => { drag.current = null; setPreview(null) }}
        />
      </div>
    </NodeViewWrapper>
  )
}
