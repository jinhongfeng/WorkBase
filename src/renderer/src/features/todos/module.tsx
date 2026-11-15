import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEventHandler } from 'react'
import { createPortal } from 'react-dom'
import { Check, Flag, GripVertical, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Todo } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { useNavigation } from '../../stores/navigation'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate, humanError, todayKey } from '../../lib/utils'
import './todos.css'

const PRIORITY_LABEL: Record<number, string> = { 1: '高', 2: '中', 3: '低' }
const WEEKDAYS = '日一二三四五六'
const FILTERS = [
  { key: 'all', label: '全部', empty: '还没有待办', hint: '在上方新建区输入任务，按回车即可添加。' },
  { key: 'today', label: '今日与逾期', empty: '没有今日或逾期的待办', hint: '今天到期和已逾期的未完成任务会显示在这里。' },
  { key: 'done', label: '已完成', empty: '还没有已完成的待办', hint: '勾选完成的任务会显示在这里。' }
] as const
type TodoFilter = (typeof FILTERS)[number]['key']

function suggestDueDate(title: string): string {
  const match = /^(?:(今天|明天|后天)|(\d{1,3})天后|周([日天一二三四五六]))(?=$|[\s，,：:]|\d{1,2}:)/.exec(title)
  const date = new Date()
  if (!match) return todayKey(date)
  const [, relativeDay, days, weekday] = match
  const offset = weekday
    ? (WEEKDAYS.indexOf(weekday === '天' ? '日' : weekday) - date.getDay() + 7) % 7
    : days !== undefined ? Number(days) : ['今天', '明天', '后天'].indexOf(relativeDay)
  date.setDate(date.getDate() + offset)
  return todayKey(date)
}

function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string>()
  const [priority, setPriority] = useState(2)
  const [saving, setSaving] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [deleting, setDeleting] = useState<Todo | null>(null)
  const [removing, setRemoving] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDetail, setEditDetail] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editPriority, setEditPriority] = useState(2)
  const [savingEdit, setSavingEdit] = useState(false)
  const [titleTip, setTitleTip] = useState<{ anchor: HTMLSpanElement; title: string } | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  // 分组内拖拽排序：handle 触发拖动，drop 落在分组内某张卡片的上/下半沿。
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ groupKey: string; index: number } | null>(null)
  const dragSource = useRef<{ id: string; groupKey: string } | null>(null)

  useLayoutEffect(() => {
    const tip = tooltip.current
    if (!titleTip || !tip) return
    const close = (): void => setTitleTip(null)
    const { anchor } = titleTip
    if (!anchor.isConnected || anchor.scrollWidth <= anchor.clientWidth) {
      close()
      return
    }
    const rect = anchor.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8))
    const top = rect.top >= tip.offsetHeight + 8 ? rect.top - tip.offsetHeight : rect.bottom
    tip.style.left = `${left}px`
    tip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - tip.offsetHeight - 8))}px`

    const onEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onEscape)
    }
  }, [titleTip, filter, todos])

  const load = useCallback(async () => {
    try {
      setTodos(await window.api.todos.list())
      setLoadStatus('ready')
    } catch (error) {
      setLoadStatus('failed')
      window.toast.error(humanError(error))
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (todos.length === 0 && !confirmingClear) titleInput.current?.focus()
  }, [todos.length, confirmingClear])
  // 从命令面板「新建待办」进入时聚焦标题输入框。
  const pendingTodo = useNavigation(state => state.pendingTodo)
  const consumePendingTodo = useNavigation(state => state.consumePendingTodo)
  useEffect(() => {
    if (pendingTodo && consumePendingTodo()) titleInput.current?.focus()
  }, [pendingTodo, consumePendingTodo])

  const clearDone = async (): Promise<void> => {
    if (clearing) return
    setClearing(true)
    try {
      await window.api.todos.clearDone()
      await load()
      setConfirmingClear(false)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setClearing(false)
    }
  }

  const add = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const selectedDate = dueDate ?? suggestDueDate(trimmed)
      await window.api.todos.save({ title: trimmed, priority, dueDate: selectedDate || null })
      setTitle(current => current === title ? '' : current)
      setDueDate(current => current === dueDate ? undefined : current)
      setPriority(current => current === priority ? 2 : current)
      await load()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (id: string): Promise<void> => {
    try { await window.api.todos.toggle(id); await load() }
    catch (error) { window.toast.error(humanError(error)) }
  }

  const remove = async (): Promise<void> => {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await window.api.todos.remove(deleting.id)
      await load()
      setDeleting(null)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setRemoving(false)
    }
  }

  const openEdit = (todo: Todo): void => {
    setEditing(todo)
    setEditTitle(todo.title)
    setEditDetail(todo.detail)
    setEditDate(todo.dueDate ?? '')
    setEditPriority(todo.priority)
  }

  const saveEdit = async (): Promise<void> => {
    if (!editing || savingEdit || !editTitle.trim()) return
    setSavingEdit(true)
    try {
      await window.api.todos.save({
        id: editing.id,
        title: editTitle.trim(),
        detail: editDetail.trim(),
        priority: editPriority,
        dueDate: editDate || null
      })
      setEditing(null)
      await load()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSavingEdit(false)
    }
  }

  const startDrag = (todo: Todo, groupKey: string): DragEventHandler => event => {
    dragSource.current = { id: todo.id, groupKey }
    setDraggingId(todo.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', todo.id)
  }

  const hoverRow = (groupKey: string, index: number): DragEventHandler => event => {
    const source = dragSource.current
    if (!source || source.groupKey !== groupKey) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropHint({ groupKey, index: event.clientY > rect.top + rect.height / 2 ? index + 1 : index })
  }

  const finishDrag = (): void => {
    dragSource.current = null
    setDraggingId(null)
    setDropHint(null)
  }

  const commitReorder = (groupKey: string, index: number): void => {
    const source = dragSource.current
    finishDrag()
    if (!source || source.groupKey !== groupKey) return
    const group = groups.find(item => item.key === groupKey)
    if (!group) return
    const ids = group.rows.map(row => row.id)
    const from = ids.indexOf(source.id)
    if (from < 0) return
    ids.splice(from, 1)
    const target = Math.max(0, Math.min(ids.length, index > from ? index - 1 : index))
    ids.splice(target, 0, source.id)
    void window.api.todos.reorder(ids).then(load).catch(error => window.toast.error(humanError(error)))
  }

  const today = todayKey()
  const groups = useMemo(() => {
    const open = todos.filter(todo => todo.done === 0)
    return [
      { key: 'today', label: '今天与逾期', rows: open.filter(todo => todo.dueDate !== null && todo.dueDate <= today) },
      { key: 'later', label: '之后', rows: open.filter(todo => todo.dueDate !== null && todo.dueDate > today) },
      { key: 'someday', label: '待安排', rows: open.filter(todo => todo.dueDate === null) },
      { key: 'done', label: '已完成', rows: todos.filter(todo => todo.done === 1) }
    ].filter(group => group.rows.length > 0)
  }, [todos, today])
  const visibleGroups = filter === 'all' ? groups : groups.filter(group => group.key === filter)
  const columns = [
    { key: 'open', groups: visibleGroups.filter(group => group.key !== 'done') },
    { key: 'done', groups: visibleGroups.filter(group => group.key === 'done') }
  ].filter(column => column.groups.length > 0)
  const activeFilter = FILTERS.find(option => option.key === filter) ?? FILTERS[0]

  const openCount = todos.filter(todo => todo.done === 0).length
  const weekAgo = Date.now() - 7 * 86400000
  const done7 = todos.filter(todo => todo.done === 1 && todo.doneAt !== null && todo.doneAt >= weekAgo).length

  return (
    <div className="page todos-page">
      <PageHeader
        title="待办"
        meta={loadStatus === 'ready' && <>
          <span className="todo-summary-item">未完成 <strong>{openCount}</strong></span>
          <span className="todo-summary-item">近 7 天完成 <strong>{done7}</strong></span>
        </>}
      />

      <section className="card todo-compose" aria-label="新建待办">
        <input
          ref={titleInput}
          className="input todo-title-input"
          aria-label="待办标题"
          placeholder="输入待办标题"
          title="可用日期开头，例如：明天 10:00 提交报告"
          value={title}
          maxLength={200}
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void add() }}
        />
        <input
          className="input todo-date-input"
          type="date"
          aria-label="截止日期"
          title="截止日期"
          value={dueDate ?? suggestDueDate(title.trim())}
          onChange={event => setDueDate(event.target.value)}
        />
        <div className="todo-priority-field">
          <Flag size={14} aria-hidden="true" />
          <select className="input" aria-label="优先级" value={priority} onChange={event => setPriority(Number(event.target.value))}>
            <option value={1}>高优先级</option>
            <option value={2}>中优先级</option>
            <option value={3}>低优先级</option>
          </select>
        </div>
        <button className="button primary todo-add" disabled={!title.trim() || saving} onClick={() => void add()}><Plus size={16} aria-hidden="true" />添加</button>
      </section>

      <div className="todo-filters" role="group" aria-label="筛选待办">
        {FILTERS.map(option => <button
          key={option.key}
          type="button"
          aria-pressed={filter === option.key}
          onClick={() => setFilter(option.key)}
        >{option.label}</button>)}
      </div>

      {loadStatus === 'loading' ? (
        <p className="todo-list-status" role="status">正在读取待办…</p>
      ) : loadStatus === 'failed' && !visibleGroups.length ? (
        <div className="todo-list-status" role="status">
          无法读取待办。
          <button className="button ghost sm" type="button" onClick={() => { setLoadStatus('loading'); void load() }}>重试</button>
        </div>
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={activeFilter.empty}
          description={activeFilter.hint}
        />
      ) : (
        <div className="todo-columns">
          {columns.map(column => (
            <div className="todo-column" key={column.key}>
              {column.groups.map(group => (
                <section className="todo-group" key={group.key}>
                  <div className="todo-group-head">
                    <h2>{group.label}</h2>
                    <span className="todo-group-count">{group.rows.length}</span>
                    {group.key === 'done' && <button className="button ghost sm todo-clear" onClick={() => setConfirmingClear(true)}>清除已完成</button>}
                  </div>
                  <ul className="list todo-card-grid">
                    {group.rows.map((todo, index) => {
                      const done = todo.done === 1
                      const overdue = !done && todo.dueDate !== null && todo.dueDate < today
                      const dateLabel = todo.dueDate
                        ? formatDate(`${todo.dueDate}T00:00:00`, 'M月d日')
                        : '无日期'
                      const droppable = !done && draggingId !== null && dragSource.current?.groupKey === group.key
                      const hint = dropHint?.groupKey === group.key && draggingId !== null
                        ? (dropHint.index === index ? 'above' : dropHint.index === index + 1 ? 'below' : null)
                        : null
                      return (
                        <li
                          className="card list-row todo-task-card"
                          key={todo.id}
                          data-done={done}
                          data-dragging={draggingId === todo.id || undefined}
                          data-drop-above={droppable && hint === 'above' || undefined}
                          data-drop-below={droppable && hint === 'below' || undefined}
                          onDragOver={droppable ? hoverRow(group.key, index) : undefined}
                          onDrop={droppable ? event => { event.preventDefault(); commitReorder(group.key, dropHint?.groupKey === group.key ? dropHint.index : index) } : undefined}
                          onClick={event => {
                            if ((event.target as HTMLElement).closest('button')) return
                            openEdit(todo)
                          }}
                        >
                          {!done && (
                            <button
                              className="icon-action todo-drag-handle"
                              draggable
                              title="拖动调整顺序"
                              aria-label={`拖动调整「${todo.title}」的顺序`}
                              onDragStart={startDrag(todo, group.key)}
                              onDragEnd={finishDrag}
                              onClick={event => event.stopPropagation()}
                            >
                              <GripVertical size={14} />
                            </button>
                          )}
                          <button
                            className="check"
                            aria-label={`${done ? '取消完成' : '完成'} ${todo.title}`}
                            onClick={() => void toggle(todo.id)}
                          >
                            <span className="todo-check-mark" aria-hidden="true">{done && <Check size={12} />}</span>
                          </button>
                          <div className="list-row-main">
                            <span className="list-row-title"
                              onMouseEnter={event => {
                                const label = event.currentTarget
                                if (label.scrollWidth > label.clientWidth) setTitleTip({ anchor: label, title: todo.title })
                              }}
                              onMouseLeave={event => {
                                if (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget)) return
                                setTitleTip(null)
                              }}>{todo.title}</span>
                            <span className="todo-priority" data-priority={todo.priority} aria-label={`${PRIORITY_LABEL[todo.priority]}优先级`}>
                              {PRIORITY_LABEL[todo.priority]}
                            </span>
                            <span className="todo-due" data-overdue={overdue}>
                              {todo.dueDate ? (
                                <>{overdue && '逾期 '}<time dateTime={todo.dueDate}>{!done && todo.dueDate === today ? '今天' : dateLabel}</time></>
                              ) : dateLabel}
                            </span>
                          </div>
                          <div className="list-row-actions">
                            <button className="icon-action" title="编辑待办" aria-label={`编辑 ${todo.title}`} onClick={() => openEdit(todo)}><Pencil size={13} /></button>
                            <button className="icon-action danger" title="删除待办" aria-label={`删除 ${todo.title}`} onClick={() => setDeleting(todo)}><Trash2 size={13} /></button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </div>
      )}
      {titleTip && createPortal(
        <div className="todo-title-tip" role="tooltip" ref={tooltip} onMouseLeave={() => setTitleTip(null)}>{titleTip.title}</div>,
        document.body
      )}

      <Dialog open={editing !== null} title="编辑待办" onClose={() => { if (!savingEdit) setEditing(null) }}>
        <form className="form-stack" onSubmit={event => { event.preventDefault(); void saveEdit() }}>
          <label className="field">
            标题
            <input
              className="input"
              data-dialog-autofocus
              required
              maxLength={200}
              value={editTitle}
              onChange={event => setEditTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }}
            />
          </label>
          <label className="field">
            详情（可选）
            <textarea
              className="input textarea"
              maxLength={4000}
              placeholder="补充说明、链接或想法"
              value={editDetail}
              onChange={event => setEditDetail(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              截止日期
              <input className="input" type="date" value={editDate} onChange={event => setEditDate(event.target.value)} />
            </label>
            <label className="field">
              优先级
              <select className="input" value={editPriority} onChange={event => setEditPriority(Number(event.target.value))}>
                <option value={1}>高优先级</option>
                <option value={2}>中优先级</option>
                <option value={3}>低优先级</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <Button type="button" variant="ghost" disabled={savingEdit} onClick={() => setEditing(null)}>取消</Button>
            <Button type="submit" variant="primary" loading={savingEdit} disabled={!editTitle.trim()}>保存</Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title="删除待办？"
        confirmLabel="删除待办"
        description={`「${deleting?.title ?? ''}」将被永久删除。`}
        loading={removing}
        onClose={() => { if (!removing) setDeleting(null) }}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={confirmingClear}
        title="清除已完成的待办？"
        confirmLabel="清除已完成"
        description="已完成的待办会被永久删除，无法恢复。"
        loading={clearing}
        onClose={() => setConfirmingClear(false)}
        onConfirm={() => void clearDone()}
      />
    </div>
  )
}

export default defineModule({
  id: 'todos',
  name: '待办',
  group: '记录',
  icon: ListTodo,
  order: 20,
  defaultPinned: true,
  badge: async () => {
    const stats = await window.api.todos.stats()
    return stats.overdue + stats.dueToday
  },
  commandActions: [
    { id: 'new', name: '新建待办', icon: Plus, keywords: ['add', 'task'], run: () => useNavigation.getState().openTodos() }
  ],
  dashboardCards: [
    { id: 'today-todos', name: '今日待办', defaultVisible: true, defaultOrder: 20 },
    { id: 'todo-overview', name: '待办概览', defaultSize: 'l' },
    { id: 'todo-completion', name: '待办完成趋势' }
  ],
  keywords: ['todo', 'task', '任务', '清单'],
  page: TodosPage
})
