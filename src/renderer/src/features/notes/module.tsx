import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArchiveRestore, BookText, ChevronLeft, ChevronRight, FileText, ListTree, NotebookPen, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { NoteKind, NoteSummary } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { useNavigation } from '../../stores/navigation'
import { NoteCanvas } from './NoteCanvas'
import { NoteEditor } from './NoteEditor'
import { NoteTags, parseNoteTags } from './NoteTags'
import { NotesLayout } from './NotesLayout'
import { attachNoteSaver, recoverDetachedNote, type NoteForm } from './pendingSaves'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { LibraryFolderList } from '../../components/ui/LibraryFolderList'
import { SearchField } from '../../components/ui/SearchField'
import { countWords, markdownToHtml, outlineOf } from '../../lib/markdown'
import { formatDate, humanError, todayKey } from '../../lib/utils'
import './notes.css'

type Filter = 'all' | 'note' | 'journal'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'note', label: '笔记' },
  { id: 'journal', label: '日记' }
]
const EMPTY_FORM: NoteForm = { title: '', content: '', tags: '', kind: 'note', journalDate: null }
const PAGE_SIZE = 100
let lastBrowse: { query: string; filter: Filter; page: number; activeId: string | null } = {
  query: '', filter: 'all', page: 1, activeId: null
}

function NotesPage() {
  const pendingNote = useNavigation(state => state.pendingNote)
  const consumePendingNote = useNavigation(state => state.consumePendingNote)
  const [items, setItems] = useState<NoteSummary[]>([])
  const [query, setQuery] = useState(lastBrowse.query)
  const [filter, setFilter] = useState<Filter>(lastBrowse.filter)
  const [page, setPage] = useState(lastBrowse.page)
  const [total, setTotal] = useState(0)
  const [listRevision, refreshList] = useState(0)
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pinnedActive, setPinnedActive] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const { title, content, tags, kind, journalDate } = form
  const [createdAt, setCreatedAt] = useState(Date.now())
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [epoch, setEpoch] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashItems, setTrashItems] = useState<NoteSummary[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<NoteSummary | null>(null)
  const [purging, setPurging] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const dirty = useRef(false)
  const savingRef = useRef<Promise<boolean> | null>(null)
  const removingRef = useRef<string | null>(null)
  const mounted = useRef(false)
  const opening = useRef(0)
  const activeRef = useRef<string | null>(null)
  const preferredNote = useRef(lastBrowse.activeId)
  const formRef = useRef(form)
  const list = useRef<HTMLDivElement>(null)
  const editorSection = useRef<HTMLElement>(null)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    lastBrowse = { query, filter, page, activeId: activeId ?? preferredNote.current }
  }, [query, filter, page, activeId])

  useLayoutEffect(() => { list.current?.scrollTo({ top: 0 }) }, [query, filter, page])

  const changeField = (field: 'title' | 'content' | 'tags', value: string): void => {
    formRef.current = { ...formRef.current, [field]: value }
    dirty.current = true
    setForm(formRef.current)
    if (!savingRef.current) setStatus('idle')
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return savingRef.current
    const id = activeRef.current
    if (!id || !dirty.current) return true
    if (removingRef.current === id) return false
    setStatus('saving')
    const pending = (async (): Promise<boolean> => {
      try {
        // 离开页面时也继续写入，避免进行中的请求只保存了较早的内容。
        while (activeRef.current === id && dirty.current && removingRef.current !== id) {
          const form = formRef.current
          await window.api.notes.save({ id, ...form, tags: parseNoteTags(form.tags) })
          if (form !== formRef.current) continue
          dirty.current = false
          setStatus('saved')
          refreshList(value => value + 1)
        }
        return !dirty.current
      } catch (error) {
        setStatus('idle')
        window.toast.error(`当前编辑未保存，已保留内容。${humanError(error)}`)
        return false
      }
    })()
    savingRef.current = pending
    try { return await pending }
    finally { if (savingRef.current === pending) savingRef.current = null }
  }, [])

  const open = useCallback(async (id: string, fromSearch = false): Promise<void> => {
    if (!mounted.current || removingRef.current) return
    const request = ++opening.current
    if (!await save() || request !== opening.current) return
    const previousId = activeRef.current
    try {
      const recover = await recoverDetachedNote(id)
      const note = await window.api.notes.get(id)
      if (!note || request !== opening.current || activeRef.current !== previousId) return
      if (dirty.current) {
        window.toast.error('当前编辑未保存，请保存后再切换笔记。')
        return
      }
      const recovered = recover?.()
      activeRef.current = note.id
      preferredNote.current = note.id
      formRef.current = recovered ?? { title: note.title, content: note.content, tags: note.tags, kind: note.kind, journalDate: note.journalDate }
      setActiveId(note.id)
      setPinnedActive(note.pinned === 1)
      if (fromSearch) {
        setQuery('')
        setFilter('all')
        setPage(1)
      }
      setForm(formRef.current)
      setCreatedAt(note.createdAt)
      dirty.current = Boolean(recovered)
      setStatus('idle')
      setEpoch(value => value + 1)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }, [save])

  useEffect(() => {
    let active = true
    setListLoading(true)
    setListError('')
    const timer = setTimeout(() => {
      const request = opening.current
      void window.api.notes.listPage({ query: query.trim(), kind: filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then(result => {
        if (!active) return
        setItems(result.items)
        setTotal(result.total)
        setPage(Math.floor(result.offset / PAGE_SIZE) + 1)
        if (request !== opening.current || activeRef.current || !result.items.length) return
        void open(preferredNote.current ?? result.items[0].id)
      }).catch(error => {
        if (active) setListError(humanError(error))
      }).finally(() => {
        if (active) setListLoading(false)
      })
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [open, query, filter, page, listRevision])

  useLayoutEffect(() => {
    mounted.current = true
    const detach = attachNoteSaver(save, () => {
      const id = activeRef.current
      return id && dirty.current ? { id, form: formRef.current } : null
    })
    return () => {
      mounted.current = false
      opening.current += 1
      detach()
    }
  }, [save])

  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => { void save() }, 900)
    return () => clearTimeout(timer)
  }, [title, content, tags, epoch, save])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
    }
    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [save])

  const create = useCallback(async (nextKind: NoteKind): Promise<void> => {
    if (!await save()) return
    try {
      const date = nextKind === 'journal' ? todayKey() : null
      if (date) {
        const journal = await window.api.notes.getJournal(date)
        if (journal) {
          setQuery('')
          setFilter('journal')
          setPage(1)
          await open(journal.id)
          return
        }
      }
      const note = await window.api.notes.save({
        title: date ? formatDate(`${date}T00:00:00`, 'yyyy年M月d日') : '',
        content: '',
        tags: nextKind === 'journal' ? ['日记'] : [],
        kind: nextKind,
        journalDate: date
      })
      await open(note.id)
      const nextFilter = nextKind === 'journal' || filter !== 'all' ? nextKind : 'all'
      setQuery('')
      setFilter(nextFilter)
      setPage(1)
      refreshList(value => value + 1)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }, [filter, open, save])

  useEffect(() => {
    if (!pendingNote) return
    const target = consumePendingNote()
    if (!target) return
    if ('id' in target) void open(target.id, true)
    else if ('newNote' in target) void create('note')
    else void create('journal')
  }, [pendingNote, consumePendingNote, open, create])

  const remove = async (): Promise<void> => {
    if (!deleteTarget || removingRef.current) return
    const { id } = deleteTarget
    const removingActive = activeRef.current === id
    removingRef.current = id
    setRemoving(true)
    opening.current += 1
    try {
      if (removingActive) await savingRef.current
      const discardDetached = removingActive ? null : await recoverDetachedNote(id)
      await window.api.notes.archive(id)
      discardDetached?.()
      if (preferredNote.current === id) preferredNote.current = null
      if (removingActive) {
        dirty.current = false
        activeRef.current = null
        setActiveId(null)
      }
      setDeleteTarget(null)
      refreshList(value => value + 1)
      // 可恢复的删除：toast 提供撤销，恢复后列表随之刷新。
      window.toast.success('已移入回收站', { label: '撤销', onClick: () => {
        void window.api.notes.restore(id).then(() => refreshList(value => value + 1))
          .catch(() => window.toast.error('撤销失败，笔记仍在回收站中。'))
      } })
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      removingRef.current = null
      setRemoving(false)
    }
  }

  const loadTrash = useCallback(async (): Promise<void> => {
    setTrashLoading(true)
    try { setTrashItems(await window.api.notes.trash()) }
    catch (error) { window.toast.error(humanError(error)) }
    finally { setTrashLoading(false) }
  }, [])

  useEffect(() => { if (trashOpen) void loadTrash() }, [trashOpen, loadTrash, listRevision])

  const restore = async (id: string): Promise<void> => {
    try {
      await window.api.notes.restore(id)
      setTrashItems(items => items.filter(item => item.id !== id))
      refreshList(value => value + 1)
      window.toast.success('笔记已恢复')
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const purge = async (): Promise<void> => {
    if (!purgeTarget || purging) return
    const target = purgeTarget
    setPurging(true)
    try {
      const discardDetached = await recoverDetachedNote(target.id)
      await window.api.notes.remove(target.id)
      discardDetached?.()
      if (preferredNote.current === target.id) preferredNote.current = null
      setTrashItems(items => items.filter(item => item.id !== target.id))
      setPurgeTarget(null)
      refreshList(value => value + 1)
      window.toast.success('笔记已彻底删除')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setPurging(false)
    }
  }

  const togglePin = async (): Promise<void> => {
    if (!activeId) return
    try {
      await window.api.notes.togglePin(activeId)
      if (activeRef.current === activeId) setPinnedActive(value => !value)
      refreshList(value => value + 1)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const showOutline = mode === 'rich' && outlineOpen
  const outline = useMemo(() => showOutline ? outlineOf(content) : [], [content, showOutline])
  const words = useMemo(() => countWords(content), [content])
  const documentTitle = title || (kind === 'journal' ? formatDate(createdAt, 'yyyy年M月d日') : '无标题笔记')
  const dateLabel = formatDate(journalDate ? `${journalDate}T00:00:00` : createdAt, 'yyyy-MM-dd')
  const searching = Boolean(query.trim())
  const emptyList = !items.length && !listError && !listLoading

  const header = (
    <div>
      <div className="notes-document-path"><span>{kind === 'journal' ? '日记' : '笔记'}</span><span aria-hidden="true">/</span><span>{dateLabel}</span></div>
      <input
        className="notes-title"
        aria-label="笔记标题"
        value={title}
        maxLength={200}
        placeholder={documentTitle}
        onChange={event => changeField('title', event.target.value)}
      />
      <div className="notes-meta">
        <NoteTags key={activeId} value={tags} onChange={value => changeField('tags', value)} />
      </div>
    </div>
  )

  const documentBar = (
    <div className="notes-document-bar">
      <div className="segmented notes-mode" role="group" aria-label="编辑模式">
        <button aria-pressed={mode === 'rich'} onClick={() => setMode('rich')}>富文本</button>
        <button aria-pressed={mode === 'source'} onClick={() => setMode('source')}>Markdown</button>
      </div>
      <div className="notes-document-actions">
        {mode === 'rich' && <button className="button ghost sm" aria-pressed={showOutline} aria-controls={showOutline ? 'notes-outline' : undefined} onClick={() => setOutlineOpen(value => !value)}>
          <ListTree size={14} />大纲
        </button>}
        <button className="button ghost sm" title={pinnedActive ? '取消置顶' : '置顶'} aria-label="置顶笔记" aria-pressed={pinnedActive} onClick={() => void togglePin()}>
          {pinnedActive ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button className="button ghost sm notes-document-delete" title="删除笔记" aria-label="删除笔记"
          onClick={() => { if (activeId) setDeleteTarget({ id: activeId, title: documentTitle }) }}><Trash2 size={14} /></button>
      </div>
    </div>
  )

  const outlinePanel = activeId && showOutline ? (
    <aside id="notes-outline" className="notes-outline" aria-label="大纲与信息">
      <div className="outline-group">
        <h3>大纲</h3>
        <button className="outline-link" onClick={() => {
          editorSection.current?.querySelector('.notes-canvas')?.scrollTo({ top: 0 })
        }}>回到开头</button>
        {outline.length ? outline.map((item, position) => (
          <button
            key={`${item.index}-${item.text}`}
            className={`outline-link lv${item.level}`}
            onClick={() => {
              const headings = editorSection.current?.querySelectorAll('.prose > :is(h1, h2, h3, h4)')
              headings?.[position]?.scrollIntoView({ block: 'center' })
            }}
          >
            {item.text}
          </button>
        )) : <p className="tiny muted">笔记里的标题会列在这里。</p>}
      </div>
      <div className="outline-group">
        <h3>信息</h3>
        <div className="meta-block">
          <div className="meta-row"><span>类型</span><span>{kind === 'journal' ? '日记' : '笔记'}</span></div>
          <div className="meta-row"><span>创建</span><span>{formatDate(createdAt, 'yyyy-MM-dd')}</span></div>
        </div>
      </div>
    </aside>
  ) : null

  const trashPanel = (
    <>
      <div className="notes-side-head">
        <div className="notes-list-heading">
          <h1>回收站</h1>
          <div className="notes-list-actions">
            <button className="button secondary sm" onClick={() => setTrashOpen(false)}>返回笔记</button>
          </div>
        </div>
        <p className="tiny muted notes-trash-hint">已删除的笔记保留在此，可恢复或彻底删除。</p>
      </div>
      <div className="notes-list" aria-label="已删除笔记">
        {trashLoading && <p className="notes-list-empty" role="status">正在读取回收站…</p>}
        {!trashLoading && !trashItems.length && <div className="notes-list-empty"><p role="status">回收站是空的。</p></div>}
        {trashItems.map(item => (
          <div className="note-item notes-trash-item" key={item.id}>
            <div className="note-item-top">
              {item.kind === 'journal' ? <BookText size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
              <h3>{item.title || '无标题笔记'}</h3>
            </div>
            <p>{item.excerpt || '还没有内容'}</p>
            <div className="note-item-foot">
              <span>{formatDate(item.updatedAt, 'M月d日 HH:mm')} 删除</span>
              <span className="notes-trash-actions">
                <button className="icon-action" title="恢复笔记" aria-label={`恢复 ${item.title || '无标题笔记'}`} onClick={() => void restore(item.id)}><ArchiveRestore size={13} /></button>
                <button className="icon-action danger" title="彻底删除" aria-label={`彻底删除 ${item.title || '无标题笔记'}`} onClick={() => setPurgeTarget(item)}><Trash2 size={13} /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )

  const listPanel = (
    <>
      <div className="notes-side-head">
        <div className="notes-list-heading">
          <h1>笔记</h1>
          <div className="notes-list-actions">
            <button className="button ghost sm icon" aria-pressed={trashOpen} title="回收站" aria-label="回收站" onClick={() => setTrashOpen(value => !value)}>
              <Trash2 size={14} />
            </button>
            <button className="button ghost sm" onClick={() => void create('journal')}><BookText size={14} />今日日记</button>
            <button className={activeId ? 'button primary sm' : 'button secondary sm'} onClick={() => void create('note')} aria-label="新建笔记"><Plus size={14} />新建</button>
          </div>
        </div>
        <div className="notes-filters" role="group" aria-label="筛选笔记">
          {FILTERS.map(item => (
            <button key={item.id} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPage(1) }}>{item.label}</button>
          ))}
        </div>
        <SearchField label="搜索笔记" placeholder="搜索笔记…" value={query} maxLength={200}
          onValueChange={value => { setQuery(value); setPage(1) }} />
      </div>
      <LibraryFolderList library="notes" items={items} className="notes-list" scrollRef={list} edgeBlur
        query={query} filtering={searching || filter !== 'all'} busy={listLoading}
        onChanged={() => refreshList(value => value + 1)}
        onDeleteNote={note => setDeleteTarget({ id: note.id, title: note.id === activeId ? documentTitle : note.title })}
        renderItem={item => (
          <button className="note-item" aria-current={item.id === activeId} onClick={() => void open(item.id)}
            title={[item.title || '无标题笔记', item.excerpt, `更新于 ${formatDate(item.updatedAt, 'M月d日 HH:mm')} · ${item.words} 字`].filter(Boolean).join('\n')}>
            {item.kind === 'journal' ? <BookText size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
            <span>{item.title || '无标题笔记'}</span>
            {item.pinned === 1 && <Pin size={11} className="note-pin" aria-label="已置顶" />}
          </button>
        )}>
        {listError && <div className="notes-list-empty" role="status">
          <p>无法读取笔记。{listError}</p>
          <button className="button secondary sm" onClick={() => refreshList(value => value + 1)}>重试</button>
        </div>}
        {emptyList && activeId && (
          <div className="notes-list-empty">
            <p role="status">{searching ? '没有匹配的笔记' : filter === 'journal' ? '还没有日记' : '还没有笔记'}</p>
            {searching && <button className="button secondary sm" onClick={() => { setQuery(''); setPage(1) }}>清除搜索</button>}
          </div>
        )}
      </LibraryFolderList>
      {pageCount > 1 && <nav className="notes-pagination" aria-label="笔记分页">
        <button className="button ghost sm icon" aria-label="上一页" title="上一页" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft size={15} />
        </button>
        <form onSubmit={event => {
          event.preventDefault()
          const field = event.currentTarget.elements.namedItem('page') as HTMLInputElement
          if (field.valueAsNumber >= 1 && field.valueAsNumber <= pageCount) setPage(field.valueAsNumber)
        }}>
          <input className="input num" key={page} type="number" name="page" min={1} max={pageCount} defaultValue={page}
            aria-label="要跳转的页码" title="输入页码后按回车" required />
          <span className="num muted" role="status" aria-label={`第 ${page} 页，共 ${pageCount} 页`}>/ {pageCount}</span>
          <button className="button ghost sm" type="submit">跳转</button>
        </form>
        <button className="button ghost sm icon" aria-label="下一页" title="下一页" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          <ChevronRight size={15} />
        </button>
      </nav>}
    </>
  )

  return (
    <NotesLayout list={trashOpen ? trashPanel : listPanel} listLabel={trashOpen ? '回收站列表' : '笔记列表'} outline={outlinePanel}>
      {trashOpen ? (
        <div className="empty-state-region notes-empty" role="status">
          <EmptyState compact title="正在浏览回收站" description="左侧的已删除笔记可以恢复，或彻底删除。" />
        </div>
      ) : (
      <section className="notes-editor" ref={editorSection} aria-label="笔记编辑区">
        {activeId && documentBar}
        {!activeId ? (
          emptyList && (
            <div className="empty-state-region notes-empty">
              {searching ? (
                <EmptyState compact title="没有匹配的笔记" description="试试其他关键词，或清除搜索。">
                  <button className="button secondary" onClick={() => { setQuery(''); setPage(1) }}>清除搜索</button>
                </EmptyState>
              ) : filter === 'journal' ? (
                <EmptyState compact title="还没有日记" description="写下今天想记住的事。">
                  <button className="button primary" onClick={() => void create('journal')}><BookText size={14} />写今日日记</button>
                </EmptyState>
              ) : (
                <EmptyState compact title="还没有笔记" description="新建一条笔记，记下想法或粘贴截图。">
                  <button className="button primary" onClick={() => void create('note')}><Plus size={14} />新建笔记</button>
                </EmptyState>
              )}
            </div>
          )
        ) : mode === 'rich' ? (
          <NoteEditor
            key={`${activeId}-rich-${epoch}`}
            initialHtml={markdownToHtml(content, 'note')}
            header={header}
            onChange={markdown => changeField('content', markdown)}
          />
        ) : (
          <NoteCanvas>
            {header}
            <textarea
              className="source-area"
              aria-label="Markdown 正文"
              value={content}
              spellCheck={false}
              placeholder="# 标题&#10;&#10;正文…"
              onChange={event => changeField('content', event.target.value)}
            />
          </NoteCanvas>
        )}
        {activeId && (
          <div className="notes-status">
            <span role="status">{status === 'saving' ? '保存中…' : dirty.current ? '有未保存的修改' : '已保存到本地'}</span>
            <span className="notes-status-shortcut"><kbd>Ctrl</kbd> + <kbd>S</kbd> 保存</span>
            <span className="notes-status-count">{words} 字{words > 0 && ` · ${Math.max(1, Math.round(words / 320))} 分钟阅读`}</span>
          </div>
        )}
      </section>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        confirmLabel="移入回收站"
        title={`删除「${deleteTarget?.title ?? ''}」？`}
        description="笔记将移入回收站，可随时恢复；图片附件仍保留在本地文件目录。"
        loading={removing}
        onClose={() => { if (!removing) setDeleteTarget(null) }}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={purgeTarget !== null}
        confirmLabel="彻底删除"
        title={`彻底删除「${purgeTarget?.title ?? ''}」？`}
        description="将从本机永久删除，无法恢复。"
        loading={purging}
        onClose={() => { if (!purging) setPurgeTarget(null) }}
        onConfirm={() => void purge()}
      />
    </NotesLayout>
  )
}

export default defineModule({
  id: 'notes',
  name: '笔记',
  group: '记录',
  icon: NotebookPen,
  order: 10,
  defaultPinned: true,
  shortcutKey: 'j',
  commandActions: [
    { id: 'new-note', name: '新建笔记', icon: Plus, keywords: ['write'], run: () => useNavigation.getState().openNote({ newNote: true }) },
    { id: 'today-journal', name: '写今日日记', icon: BookText, keywords: ['journal', '日记'], run: () => useNavigation.getState().openNote({ todayJournal: true }) }
  ],
  dashboardCards: [
    { id: 'quick-capture', name: '快速记录', defaultVisible: true, defaultOrder: 10, defaultSize: 'l' },
    { id: 'today-journal', name: '今日一记', defaultVisible: true, defaultOrder: 40, defaultSize: 'l' }
  ],
  keywords: ['note', 'markdown', '日记', 'journal', '写作'],
  page: NotesPage
})
