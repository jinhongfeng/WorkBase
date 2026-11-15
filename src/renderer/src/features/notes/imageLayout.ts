import Image from '@tiptap/extension-image'
import { Node as TiptapNode, ReactNodeViewRenderer } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { Fragment, Slice, type Node as DocNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'
import { noteImageWidth } from '../../lib/markdown'
import { NoteImage } from './NoteImage'

const IMAGE_DRAG = 'application/x-workbase-note-image'
const ROW = 'noteImageRow'

/**
 * 双列行按飞书文档式统一宽高：两张图各占一半宽度，再按平均宽高比写入
 * `--note-row-ratio`，由 CSS 居中裁切成同一高度。图片未加载时由 CSS 提供初始比例。
 */
export function syncImageRowRatio(row: HTMLElement): void {
  const ratios = Array.from(row.querySelectorAll('img')).flatMap(image =>
    image.naturalWidth && image.naturalHeight ? [image.naturalWidth / image.naturalHeight] : [])
  const ratio = ratios.length === 2 ? ((ratios[0] + ratios[1]) / 2).toFixed(4) : ''
  if (row.style.getPropertyValue('--note-row-ratio') === ratio) return
  if (ratio) row.style.setProperty('--note-row-ratio', ratio)
  else row.style.removeProperty('--note-row-ratio')
}

function imageAt(view: EditorView, target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>('[data-note-image]')
  if (!element || !view.dom.contains(element)) return null
  const position = view.posAtDOM(element, 0)
  const node = view.state.doc.nodeAt(position)
  return node?.type.name === 'image' ? { element, position, node } : null
}

/**
 * 指针没有压在图片上时的并排目标兜底：允许落在某张顶层单独图片所在行的
 * 上下空白（块间距）里，避免「想并排却差几像素落到了行间，结果被当成
 * 普通移动插回一行」。行内图片不参与（行不能再扩），被拖动的图片本身跳过。
 */
const NEAR_BAND = 24

function imageLineNear(view: EditorView, event: DragEvent, from: number) {
  const { doc } = view.state
  let best: { element: HTMLElement; position: number; node: DocNode; distance: number } | null = null
  doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || pos === from) return
    if (doc.resolve(pos).depth !== 0) return
    const dom = view.nodeDOM(pos)
    const element = dom instanceof HTMLElement ? dom.querySelector<HTMLElement>('[data-note-image]') : null
    if (!element) return
    const box = element.getBoundingClientRect()
    if (!box.width) return
    const distance = event.clientY < box.top
      ? box.top - event.clientY
      : event.clientY > box.bottom ? event.clientY - box.bottom : 0
    if (distance > NEAR_BAND) return
    // 空白带里若压着段落等其他块，说明用户在往正文里放图，不并排
    if (distance > 0) {
      const at = document.elementFromPoint(event.clientX, event.clientY)
      if (at && at.closest('p, h1, h2, h3, h4, li, blockquote, pre, table')) return
    }
    if (!best || distance < best.distance) best = { element, position: pos, node, distance }
  })
  return best
}

function pairTarget(view: EditorView, event: DragEvent, from: number) {
  const target = imageAt(view, event.target) ?? imageLineNear(view, event, from)
  if (!target || target.position === from) return null
  const doc = view.state.doc
  const position = doc.resolve(target.position)
  const index = position.index()
  const sameRow = position.parent.type.name === ROW && doc.resolve(from).parent === position.parent
  if (!sameRow && !position.parent.canReplaceWith(index, index + 1, view.state.schema.nodes[ROW])) return null
  const box = target.element.getBoundingClientRect()
  return { ...target, side: event.clientX < (box.left + box.right) / 2 ? 'left' : 'right' }
}

export const NoteImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, parseHTML: element => noteImageWidth(element.getAttribute('width')) },
      height: { default: null, rendered: false }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImage, {
      stopEvent: ({ event }) => {
        const target = event.target
        return !event.type.startsWith('drag') && event.type !== 'drop' &&
          target instanceof Element && Boolean(target.closest('input, button'))
      }
    })
  }
})

export const NoteImageRow = TiptapNode.create({
  name: ROW,
  group: 'block',
  content: 'image{1,2}',
  parseHTML: () => [{ tag: 'div[data-note-image-row]' }],
  renderHTML: () => ['div', { 'data-note-image-row': '' }, 0],

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.setAttribute('data-note-image-row', '')
      let frame = 0
      const measure = () => {
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          syncImageRowRatio(dom)
        })
      }

      dom.addEventListener('load', measure, true)
      dom.addEventListener('error', measure, true)
      measure()
      return {
        dom,
        contentDOM: dom,
        update(next) {
          if (next.type !== node.type) return false
          measure()
          return true
        },
        // 这是展示样式，不能让编辑器把它当成正文 DOM 变更反复解析。
        ignoreMutation: mutation => mutation.type === 'attributes' && mutation.target === dom && mutation.attributeName === 'style',
        destroy() {
          cancelAnimationFrame(frame)
          dom.removeEventListener('load', measure, true)
          dom.removeEventListener('error', measure, true)
        }
      }
    }
  },

  addProseMirrorPlugins() {
    let source: { position: number; node: DocNode } | null = null
    let highlighted: HTMLElement | undefined

    function highlight(element?: HTMLElement, side?: string) {
      if (highlighted && highlighted !== element) delete highlighted.dataset.noteImageDrop
      if (element && side) element.dataset.noteImageDrop = side
      highlighted = element
    }

    return [new Plugin({
      appendTransaction(transactions, _, state) {
        if (!transactions.some(transaction => transaction.docChanged)) return null
        const row = state.schema.nodes[ROW]
        const tr = state.tr
        state.doc.descendants((node, pos) => {
          if (node.type !== row || node.childCount !== 1) return
          tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), node.content)
        })
        return tr.docChanged ? tr : null
      },
      props: {
        handleDOMEvents: {
          dragstart(view, event) {
            const image = imageAt(view, event.target)
            if (!image || !event.dataTransfer) return false
            source = image
            event.dataTransfer.setData(IMAGE_DRAG, 'move')
            event.dataTransfer.effectAllowed = 'move'
            return true
          },
          dragover(view, event) {
            if (!source || !event.dataTransfer?.types.includes(IMAGE_DRAG)) return false
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const target = pairTarget(view, event, source.position)
            highlight(target?.element, target?.side)
            return true
          },
          dragleave(view, event) {
            if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) highlight()
            return false
          },
          dragend() {
            source = null
            highlight()
            return false
          },
          drop(view, event) {
            if (!source || !event.dataTransfer?.types.includes(IMAGE_DRAG)) return false
            const { position, node } = source
            source = null
            highlight()
            event.preventDefault()
            const { doc, schema } = view.state
            if (doc.nodeAt(position) !== node || imageAt(view, event.target)?.position === position) return true
            const target = pairTarget(view, event, position)
            const original = doc.resolve(position)
            const tr = view.state.tr
            const row = schema.nodes[ROW]
            if (target && original.parent.type === row && doc.resolve(target.position).parent === original.parent) {
              const images = target.side === 'left' ? [node, target.node] : [target.node, node]
              const updated = row.create(null, images)
              if (updated.eq(original.parent)) return true
              const start = original.before()
              tr.replaceWith(start, original.after(), updated)
              tr.setSelection(NodeSelection.create(tr.doc, start + 1 + (target.side === 'right' ? target.node.nodeSize : 0)))
            } else {
              if (original.parent.type === row) {
                const remaining = original.parent.maybeChild(1 - original.index())
                tr.replaceWith(original.before(), original.after(), Fragment.from(remaining))
              } else {
                tr.delete(position, position + node.nodeSize)
              }
              if (target) {
                const at = tr.mapping.map(target.position)
                if (tr.doc.nodeAt(at) !== target.node) return true
                const images = target.side === 'left' ? [node, target.node] : [target.node, node]
                tr.replaceWith(at, at + target.node.nodeSize, row.create(null, images))
                tr.setSelection(NodeSelection.create(tr.doc, at + 1 + (target.side === 'right' ? target.node.nodeSize : 0)))
              } else {
                const destination = view.posAtCoords({ left: event.clientX, top: event.clientY })
                if (!destination) return true
                const at = dropPoint(tr.doc, tr.mapping.map(destination.pos), new Slice(Fragment.from(node), 0, 0))
                if (at === null || tr.doc.resolve(at).parent.type === row) return true
                tr.insert(at, node)
                if (tr.doc.nodeAt(at) !== node) return true
                tr.setSelection(NodeSelection.create(tr.doc, at))
              }
            }
            view.dispatch(closeHistory(tr).scrollIntoView())
            view.focus()
            return true
          }
        }
      }
    })]
  }
})
