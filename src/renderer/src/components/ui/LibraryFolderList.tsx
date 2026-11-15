import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode, type Ref } from 'react'
import { ChevronRight, Folder, FolderOpen, FolderPlus, Move, Pencil, Trash2 } from 'lucide-react'
import type { FolderLibrary, LibraryFolder } from '@shared/types'
import { humanError } from '../../lib/utils'
import { Button } from './Button'
import { ConfirmDialog, Dialog } from './Dialog'
import { ProgressiveBlur } from './ProgressiveBlur'
import './library-folders.css'

interface FolderItem { id: string; folderId: string | null }
type MenuTarget<T extends FolderItem> = { kind: 'folder'; folder: LibraryFolder } | { kind: 'item'; item: T }
type Edit = { kind: 'folder'; id?: string } | { kind: 'move'; item: FolderItem }

interface Props<T extends FolderItem> {
  library: FolderLibrary
  items: T[]
  filtering: boolean
  query: string
  className: string
  busy?: boolean
  scrollRef?: Ref<HTMLDivElement>
  /** 在列表上下边缘叠加渐进模糊，内容溢出出现滚动时自动显示。 */
  edgeBlur?: boolean
  renderItem(item: T): ReactNode
  onDeleteNote?(item: T): void
  onChanged(): void
  children?: ReactNode
}

export function LibraryFolderList<T extends FolderItem>({
  library, items, filtering, query, className, busy, scrollRef, edgeBlur, renderItem, onDeleteNote, onChanged, children
}: Props<T>) {
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<FolderItem | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; target?: MenuTarget<T> } | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [folderToRemove, setFolderToRemove] = useState<LibraryFolder | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const popover = useRef<HTMLDivElement>(null)
  const scrollEl = useRef<HTMLDivElement | null>(null)
  const dragType = `application/x-workbase-${library}-item`
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), [folders])
  const itemsByFolder = useMemo(() => {
    const groups = new Map<string | null, T[]>()
    for (const item of items) {
      const group = groups.get(item.folderId)
      if (group) group.push(item)
      else groups.set(item.folderId, [item])
    }
    return groups
  }, [items])
  const searchText = query.trim().toLowerCase()

  // 渐进模糊只在内容真正溢出且滚离对应边缘时显示。
  const updateEdges = useCallback((): void => {
    const el = scrollEl.current
    if (!el) return
    const top = el.scrollTop > 2
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2
    setEdges(previous => (previous.top === top && previous.bottom === bottom ? previous : { top, bottom }))
  }, [])

  useEffect(() => {
    if (!edgeBlur) return
    const el = scrollEl.current
    if (!el) return
    updateEdges()
    // 跟踪滚动容器与内容子元素：面板拖宽、条目增删改变可滚动状态时重新评估。
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [edgeBlur, folders, items, updateEdges])

  const setScrollRef = (el: HTMLDivElement | null): void => {
    scrollEl.current = el
    if (typeof scrollRef === 'function') scrollRef(el)
    else if (scrollRef) scrollRef.current = el
  }

  useEffect(() => {
    let current = true
    void window.api.libraryFolders.list(library).then(result => {
      if (current) setFolders(result)
    }).catch(error => { if (current) window.toast.error(humanError(error)) })
    return () => { current = false }
  }, [library])

  useLayoutEffect(() => {
    const panel = popover.current
    if (!menu || !panel) return
    panel.showPopover()
    panel.style.left = `${Math.max(4, Math.min(menu.x, window.innerWidth - panel.offsetWidth - 4))}px`
    panel.style.top = `${Math.max(4, Math.min(menu.y, window.innerHeight - panel.offsetHeight - 4))}px`
    panel.querySelector('button')?.focus()
  }, [menu])

  const openMenu = (event: MouseEvent, target?: MenuTarget<T>): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, target })
  }

  const beginEdit = (next: Edit, initialValue: string): void => {
    popover.current?.hidePopover()
    setError('')
    setValue(initialValue)
    setEdit(next)
  }

  const expansionKey = (id: string): string => `${filtering}:${id}`

  const move = async (item: FolderItem, folderId: string | null): Promise<void> => {
    if (item.folderId === folderId) return
    await window.api.libraryFolders.moveItem(library, item.id, folderId)
    if (folderId) setExpanded(previous => ({ ...previous, [expansionKey(folderId)]: true }))
    onChanged()
  }

  const submit = async (): Promise<void> => {
    if (!edit || saving) return
    setSaving(true)
    setError('')
    try {
      if (edit.kind === 'move') {
        await move(edit.item, value || null)
      } else {
        const folder = await window.api.libraryFolders.save(library, { id: edit.id, name: value.trim() })
        setFolders(previous => [...previous.filter(item => item.id !== folder.id), folder])
        if (edit.id) onChanged()
      }
      setEdit(null)
    } catch (error) {
      setError(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  const removeFolder = async (): Promise<void> => {
    if (!folderToRemove || saving) return
    setSaving(true)
    try {
      await window.api.libraryFolders.remove(library, folderToRemove.id)
      setFolders(previous => previous.filter(folder => folder.id !== folderToRemove.id))
      setFolderToRemove(null)
      onChanged()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  const endDrag = (): void => {
    setDragging(null)
    setDropTarget(null)
  }

  const dropProps = (folderId: string | null) => {
    const key = folderId ?? ''
    return {
      'data-drop-target': dropTarget === key || undefined,
      onDragOver: (event: DragEvent) => {
        if (!dragging || dragging.folderId === folderId || !event.dataTransfer.types.includes(dragType)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDropTarget(key)
      },
      onDragLeave: (event: DragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setDropTarget(previous => previous === key ? null : previous)
      },
      onDrop: (event: DragEvent) => {
        if (!dragging || event.dataTransfer.getData(dragType) !== dragging.id) return
        event.preventDefault()
        event.stopPropagation()
        endDrag()
        void move(dragging, folderId).catch(error => window.toast.error(humanError(error)))
      }
    }
  }

  const renderRow = (item: T) => (
    <div key={item.id} className="library-folder-item" draggable
      onContextMenu={event => openMenu(event, { kind: 'item', item })}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(dragType, item.id)
        setDragging(item)
      }}
      onDragEnd={endDrag}>
      {renderItem(item)}
    </div>
  )

  const target = menu?.target
  const moving = edit?.kind === 'move'
  const dialogTitle = moving ? '移动到文件夹' : edit?.id ? '重命名文件夹' : '新建文件夹'

  return <>
    <div className="library-list-shell">
      <div ref={setScrollRef} className={className} tabIndex={0} aria-busy={busy} onContextMenu={openMenu}
        onScroll={updateEdges}>
        {dragging?.folderId && <div className="library-folder-root" {...dropProps(null)}>拖到这里移回顶层</div>}
        {sortedFolders.map(folder => {
          const group = itemsByFolder.get(folder.id)
          if (!group && !dragging && !folder.name.toLowerCase().includes(searchText)) return null
          const key = expansionKey(folder.id)
          const open = expanded[key] ?? (filtering && Boolean(group))
          const Icon = open ? FolderOpen : Folder
          return <div key={folder.id} className="library-folder">
            <button type="button" className="library-folder-row workspace-sidebar-row" aria-expanded={open} title={folder.name}
              onClick={() => setExpanded(previous => ({ ...previous, [key]: !open }))}
              onContextMenu={event => openMenu(event, { kind: 'folder', folder })}
              {...dropProps(folder.id)}>
              <ChevronRight className="library-folder-chevron" size={14} aria-hidden="true" />
              <Icon size={15} aria-hidden="true" />
              <span>{folder.name}</span>
            </button>
            {/* 始终渲染内容，配合 grid 行 0fr→1fr 做手风琴展开；收起时 inert 挡住焦点与读屏。 */}
            <div className="library-folder-collapse" data-open={open || undefined} inert={!open}>
              <div className="library-folder-items">
                {group?.length ? group.map(renderRow) : <p className="library-folder-empty">当前列表无条目</p>}
              </div>
            </div>
          </div>
        })}
        {itemsByFolder.get(null)?.map(renderRow)}
        {children}
      </div>
      {edgeBlur && edges.top && <ProgressiveBlur position="top" />}
      {edgeBlur && edges.bottom && <ProgressiveBlur position="bottom" />}
    </div>

    <div ref={popover} popover="auto" className="action-popover library-folder-menu" role="group"
      aria-label={target?.kind === 'item' && onDeleteNote ? '笔记操作' : '文件夹操作'}>
      {target?.kind === 'folder' && <Button variant="ghost" type="button"
        onClick={() => beginEdit({ kind: 'folder', id: target.folder.id }, target.folder.name)}>
        <Pencil size={14} />重命名文件夹
      </Button>}
      {target?.kind === 'item' && folders.length > 0 && <Button variant="ghost" type="button"
        onClick={() => beginEdit({ kind: 'move', item: target.item }, target.item.folderId ?? '')}>
        <Move size={14} />移动到文件夹
      </Button>}
      <Button variant="ghost" type="button" onClick={() => beginEdit({ kind: 'folder' }, '')}>
        <FolderPlus size={14} />新建文件夹
      </Button>
      {target?.kind === 'item' && onDeleteNote && <Button variant="danger" type="button" onClick={() => {
        popover.current?.hidePopover()
        onDeleteNote(target.item)
      }}>
        <Trash2 size={14} />删除笔记
      </Button>}
      {target?.kind === 'folder' && <Button variant="danger" type="button" onClick={() => {
        popover.current?.hidePopover()
        setFolderToRemove(target.folder)
      }}>
        <Trash2 size={14} />删除文件夹
      </Button>}
    </div>

    <Dialog open={edit !== null} title={dialogTitle} onClose={() => { if (!saving) setEdit(null) }}>
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        {moving ? <label className="field">
          <span>目标位置</span>
          <select className="input" value={value} disabled={saving} data-dialog-autofocus
            onChange={event => setValue(event.target.value)}>
            <option value="">顶层</option>
            {sortedFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label> : <label className="field">
          <span>文件夹名称</span>
          <input className="input" value={value} maxLength={80} required disabled={saving} data-dialog-autofocus
            onChange={event => { setValue(event.target.value); setError('') }} />
        </label>}
        {error && <p className="library-folder-error" role="alert">{error}</p>}
        <div className="actions">
          <Button type="button" disabled={saving} onClick={() => setEdit(null)}>取消</Button>
          <Button variant="primary" type="submit" loading={saving}
            disabled={moving ? (value || null) === edit.item.folderId : !value.trim()}>
            {moving ? '移动' : edit?.id ? '保存名称' : '创建文件夹'}
          </Button>
        </div>
      </form>
    </Dialog>
    <ConfirmDialog
      open={folderToRemove !== null}
      title={`删除「${folderToRemove?.name ?? ''}」？`}
      description={`文件夹中的${library === 'notes' ? '笔记' : ' Skill '}将移回顶层。`}
      confirmLabel="删除文件夹"
      loading={saving}
      onClose={() => { if (!saving) setFolderToRemove(null) }}
      onConfirm={() => void removeFolder()}
    />
  </>
}
