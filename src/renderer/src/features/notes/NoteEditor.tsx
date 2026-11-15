import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import {
  Bold, Code2, Italic, List, ListChecks, ListOrdered, Plus, Quote, Redo2,
  Strikethrough, Underline as UnderlineIcon, Undo2
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { htmlToMarkdown, looksLikeMarkdownTable, markdownToHtml } from '../../lib/markdown'
import { humanError } from '../../lib/utils'
import { noteExtensions } from './extensions'
import { NoteCanvas } from './NoteCanvas'

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export interface NoteEditorProps {
  initialHtml: string
  onChange(markdown: string): void
  onEditor?(editor: Editor | null): void
  header?: ReactNode
}

type ToolButton =
  | { key: string; select: true }
  | { key: string; icon: LucideIcon; label: string; active: boolean; disabled?: boolean; run(): void }

export function NoteEditor({ initialHtml, onChange, onEditor, header }: NoteEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editorRef = useRef<Editor | null>(null)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  const insertImageFile = useCallback(async (editor: Editor, file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file)
      const { url } = await window.api.assets.saveImage(dataUrl)
      editor.chain().focus().setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, '') }).run()
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }, [])

  const editor = useEditor({
    extensions: noteExtensions,
    content: initialHtml,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'false', role: 'textbox', 'aria-label': '笔记正文', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => {
        const editor = editorRef.current
        if (!editor) return false
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (files.length) {
          event.preventDefault()
          for (const file of files) void insertImageFile(editor, file)
          return true
        }
        // 纯文本粘贴的 GFM 表格直接转成真表格；带 text/html 的粘贴交给 Tiptap 默认处理
        const htmlData = event.clipboardData?.getData('text/html') ?? ''
        const textData = event.clipboardData?.getData('text/plain') ?? ''
        if (!htmlData && textData && looksLikeMarkdownTable(textData)) {
          event.preventDefault()
          editor.commands.insertContent(markdownToHtml(textData, 'note'))
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const dropped = (event as DragEvent).dataTransfer
        const files = Array.from(dropped?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (!files.length || !editorRef.current) return false
        event.preventDefault()
        for (const file of files) void insertImageFile(editorRef.current, file)
        return true
      }
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(htmlToMarkdown(instance.getHTML()))
    }
  })

  useEffect(() => {
    editorRef.current = editor
    onEditor?.(editor)
  }, [editor, onEditor])

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive('bold') ?? false,
      italic: instance?.isActive('italic') ?? false,
      strike: instance?.isActive('strike') ?? false,
      underline: instance?.isActive('underline') ?? false,
      code: instance?.isActive('code') ?? false,
      h1: instance?.isActive('heading', { level: 1 }) ?? false,
      h2: instance?.isActive('heading', { level: 2 }) ?? false,
      h3: instance?.isActive('heading', { level: 3 }) ?? false,
      h4: instance?.isActive('heading', { level: 4 }) ?? false,
      quote: instance?.isActive('blockquote') ?? false,
      bullet: instance?.isActive('bulletList') ?? false,
      ordered: instance?.isActive('orderedList') ?? false,
      task: instance?.isActive('taskList') ?? false,
      inTable: instance?.isActive('table') ?? false,
      canDeleteRow: instance?.can().deleteRow() ?? false,
      canDeleteColumn: instance?.can().deleteColumn() ?? false,
      canMerge: instance?.can().mergeCells() ?? false,
      canSplit: instance?.can().splitCell() ?? false,
      canUndo: instance?.can().undo() ?? false,
      canRedo: instance?.can().redo() ?? false
    })
  })

  const pickImage = (): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file && editor) void insertImageFile(editor, file)
    }
    input.click()
  }

  if (!editor) return <div className="skeleton" style={{ height: 320, marginTop: 24 }} />

  const buttons: ToolButton[] = [
    { key: 'bold', icon: Bold, label: '加粗', active: state?.bold ?? false, run: () => { editor.chain().focus().toggleBold().run() } },
    { key: 'italic', icon: Italic, label: '斜体', active: state?.italic ?? false, run: () => { editor.chain().focus().toggleItalic().run() } },
    { key: 'strike', icon: Strikethrough, label: '删除线', active: state?.strike ?? false, run: () => { editor.chain().focus().toggleStrike().run() } },
    { key: 'underline', icon: UnderlineIcon, label: '下划线', active: state?.underline ?? false, run: () => { editor.chain().focus().toggleUnderline().run() } },
    { key: 'code', icon: Code2, label: '行内代码', active: state?.code ?? false, run: () => { editor.chain().focus().toggleCode().run() } },
    { key: 'paragraph', select: true },
    { key: 'quote', icon: Quote, label: '引用', active: state?.quote ?? false, run: () => { editor.chain().focus().toggleBlockquote().run() } },
    { key: 'bullet', icon: List, label: '无序列表', active: state?.bullet ?? false, run: () => { editor.chain().focus().toggleBulletList().run() } },
    { key: 'ordered', icon: ListOrdered, label: '有序列表', active: state?.ordered ?? false, run: () => { editor.chain().focus().toggleOrderedList().run() } },
    { key: 'task', icon: ListChecks, label: '任务清单', active: state?.task ?? false, run: () => { editor.chain().focus().toggleTaskList().run() } },
    { key: 'undo', icon: Undo2, label: '撤销', active: false, disabled: !state?.canUndo, run: () => { editor.chain().focus().undo().run() } },
    { key: 'redo', icon: Redo2, label: '重做', active: false, disabled: !state?.canRedo, run: () => { editor.chain().focus().redo().run() } }
  ]

  const insertActions = [
    { key: 'hr', label: '分隔线', run: () => { editor.chain().focus().setHorizontalRule().run() } },
    { key: 'table', label: '表格', disabled: state?.inTable, run: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },
    { key: 'image', label: '图片', run: pickImage }
  ]

  const tableActions: { key: string; label: string; disabled?: boolean; run(): void }[] = [
    { key: 'row-before', label: '上方插入行', run: () => { editor.chain().focus().addRowBefore().run() } },
    { key: 'row-after', label: '下方插入行', run: () => { editor.chain().focus().addRowAfter().run() } },
    { key: 'col-before', label: '左侧插入列', run: () => { editor.chain().focus().addColumnBefore().run() } },
    { key: 'col-after', label: '右侧插入列', run: () => { editor.chain().focus().addColumnAfter().run() } },
    { key: 'row-delete', label: '删除行', disabled: !state?.canDeleteRow, run: () => { editor.chain().focus().deleteRow().run() } },
    { key: 'col-delete', label: '删除列', disabled: !state?.canDeleteColumn, run: () => { editor.chain().focus().deleteColumn().run() } },
    { key: 'cell-merge', label: '合并单元格', disabled: !state?.canMerge, run: () => { editor.chain().focus().mergeCells().run() } },
    { key: 'cell-split', label: '拆分单元格', disabled: !state?.canSplit, run: () => { editor.chain().focus().splitCell().run() } },
    { key: 'table-delete', label: '删除表格', run: () => { editor.chain().focus().deleteTable().run() } }
  ]

  return (
    <>
      <div className="notes-toolbar" role="toolbar" aria-label="格式工具">
        {[{ key: 'formatting', items: buttons.slice(0, 6) }, { key: 'structure', items: buttons.slice(6, 10) }, { key: 'history', items: buttons.slice(10) }].map(group => (
          <div className="tb-group" key={group.key}>
            {group.items.map(item => ('select' in item ? (
                <select
                  key={item.key}
                  className="tb-select"
                  aria-label="段落样式"
                  value={state?.h1 ? '1' : state?.h2 ? '2' : state?.h3 ? '3' : state?.h4 ? '4' : '0'}
                  onChange={event => {
                    const level = Number(event.target.value) as 0 | 1 | 2 | 3 | 4
                    if (level === 0) editor.chain().focus().setParagraph().run()
                    else editor.chain().focus().toggleHeading({ level }).run()
                  }}
                >
                  <option value="0">正文</option>
                  <option value="1">一级标题</option>
                  <option value="2">二级标题</option>
                  <option value="3">三级标题</option>
                  <option value="4">四级标题</option>
                </select>
                )
              : (
                <button
                  key={item.key}
                  type="button"
                  className="tb"
                  title={item.label}
                  aria-label={item.label}
                  data-active={item.active ? 'true' : 'false'}
                  disabled={item.disabled}
                  onMouseDown={event => event.preventDefault()}
                  onClick={item.run}
                >
                  <item.icon size={15} strokeWidth={1.9} />
                </button>
                )))}
          </div>
        ))}
        <details className="tb-menu" ref={detailsRef} onKeyDown={event => {
          if (event.key === 'Escape') {
            detailsRef.current?.removeAttribute('open')
            detailsRef.current?.querySelector('summary')?.focus()
          }
        }}>
          <summary className="tb"><Plus size={15} strokeWidth={1.9} aria-hidden="true" />插入</summary>
          <div className="tb-menu-panel">
            {insertActions.map(item => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  detailsRef.current?.removeAttribute('open')
                  item.run()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </details>
      </div>
      {state?.inTable && (
        <div className="notes-tablebar" role="toolbar" aria-label="表格工具">
          <span className="tiny dim">表格</span>
          {tableActions.map(item => (
            <button
              key={item.key}
              type="button"
              className={item.key === 'table-delete' ? 'button danger sm' : 'button ghost sm'}
              disabled={item.disabled}
              onMouseDown={event => event.preventDefault()}
              onClick={item.run}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <NoteCanvas>
        {header}
        <EditorContent editor={editor} />
      </NoteCanvas>
    </>
  )
}
