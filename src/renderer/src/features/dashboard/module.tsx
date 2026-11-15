import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, House, LayoutGrid, Plus, Timer } from 'lucide-react'
import { create } from 'zustand'
import type { ActivitySource, FocusStats, Note, NoteStats, NoteSummary, Todo, TodoStats } from '@shared/types'
import { defineModule, type CardSize, type DashboardCardDefinition, type ModuleDefinition } from '../../modules/defineModule'
import { registry } from '../../modules/registry'
import { useNavigation } from '../../stores/navigation'
import { cn, formatDate, greeting, humanError, todayKey } from '../../lib/utils'
import ActivityCalendar from './ActivityCalendar'
import FocusTrend from './FocusTrend'
import Favorites, { FavoritePicker } from './Favorites'
import QuickCapture from './QuickCapture'
import CardShell from './CardShell'
import DashboardBoard, { type CardColumn } from './DashboardBoard'
import { TodoOverview, TodoCompletion } from './TodoCharts'
import { focusClock, useFocus } from '../../stores/focus'
import DashboardStats from './DashboardStats'
import './dashboard.css'

interface DashboardData {
  focus: FocusStats | null
  todos: Todo[] | null
  todoStats: TodoStats | null
  journal: Note | null
  journals: NoteSummary[]
  noteStats: NoteStats | null
}

type DashboardCard = DashboardCardDefinition & { key: string; module: ModuleDefinition }

const CARD_SETTING = 'ui.dashboard_cards'
const CARD_SIZE_SETTING = 'ui.dashboard_card_sizes'
const CARD_COL_SETTING = 'ui.dashboard_card_cols'
const NAME_SETTING = 'ui.user_name'
const NAME_MAX = 16
const EMPTY_DATA: DashboardData = { focus: null, todos: null, todoStats: null, journal: null, journals: [], noteStats: null }

// 首页路由卸载后仍保留当前会话中的草稿。
const useJournalDraft = create<{
  draft: { date: string; content: string } | null
  saving: boolean
}>(() => ({ draft: null, saving: false }))

function availableCards(): DashboardCard[] {
  return registry.flatMap(module => (module.dashboardCards ?? []).map(card => ({
    ...card,
    key: `${module.id}/${card.id}`,
    module
  })))
}

/** 缺失列归属时按窄卡累计张数分配；同数放左，不写回旧设置。 */
function assignColumns(cards: DashboardCard[], sizes: Record<string, CardSize>, saved: Record<string, CardColumn>): Record<string, CardColumn> {
  const columns = { ...saved }
  const counts = { left: 0, right: 0 }
  for (const card of cards) {
    const column = columns[card.key] ?? (counts.left <= counts.right ? 'left' : 'right')
    columns[card.key] = column
    if ((sizes[card.key] ?? card.defaultSize ?? 'm') === 'm') counts[column] += 1
  }
  return columns
}

function Dashboard() {
  const focusRunning = useFocus(state => state.running)
  const focusRemaining = useFocus(state => state.remaining)
  const navigate = useNavigation(state => state.navigate)
  const openNote = useNavigation(state => state.openNote)
  const setPinned = useNavigation(state => state.setPinned)
  const scrollRef = useRef<HTMLElement>(null)
  const [editMode, setEditMode] = useState<'favorites' | 'cards' | null>(null)
  const editingFavorites = editMode === 'favorites'
  const editing = editMode === 'cards'
  const [savingFavorites, setSavingFavorites] = useState(false)
  const cards = useMemo(availableCards, [])
  const defaultCards = useMemo(() => cards
    .filter(card => card.defaultVisible)
    .sort((a, b) => (a.defaultOrder ?? 100) - (b.defaultOrder ?? 100))
    .map(card => card.key), [cards])
  const [shown, setShown] = useState<string[] | null>(null)
  const [sizes, setSizes] = useState<Record<string, CardSize>>({})
  const [columns, setColumns] = useState<Record<string, CardColumn>>({})
  const [cardDraft, setCardDraft] = useState<string[] | null>(null)
  const [sizeDraft, setSizeDraft] = useState<Record<string, CardSize> | null>(null)
  const [columnDraft, setColumnDraft] = useState<Record<string, CardColumn> | null>(null)
  const [savingCards, setSavingCards] = useState(false)
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData>(EMPTY_DATA)
  const [journalReady, setJournalReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [clock, setClock] = useState(() => new Date())
  const [name, setName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  // Escape 放弃编辑时，input 卸载前可能仍触发一次 blur，用它避免把草稿写回设置。
  const cancelName = useRef(false)
  const [activityRevision, setActivityRevision] = useState(0)
  const activitySources = useMemo(() => (['notes', 'ielts', 'todos', 'habits'] as ActivitySource[])
    .filter(id => registry.some(module => module.id === id)), [])
  const draft = useJournalDraft(state => state.draft)
  const saving = useJournalDraft(state => state.saving)
  const [pendingTodos, setPendingTodos] = useState(new Set<string>())
  const revision = useRef(0)
  const today = todayKey(clock)
  const visibleCards = cards.filter(card => (editing ? cardDraft : shown)?.includes(card.key))
  const journalCard = visibleCards.find(card => !card.component && card.id === 'today-journal')
  const tasks = visibleCards.find(card => !card.component && card.id === 'today-todos')
  const focusPath = registry.find(module => module.id === 'focus')?.path
  const todosPath = registry.find(module => module.id === 'todos')?.path
  const notesEnabled = registry.some(module => module.id === 'notes')
  const calendar = visibleCards.some(card => !card.component && card.id === 'month-calendar')
  const readFocus = Boolean(focusPath)
  const focusRevision = useFocus(state => readFocus ? state.revision : 0)
  const readTodoStats = Boolean(todosPath)
  const readTodos = Boolean(tasks || (calendar && todosPath)) || visibleCards.some(card => !card.component && (card.id === 'todo-overview' || card.id === 'todo-completion'))
  const readJournal = Boolean(journalCard)
  const readJournalDates = calendar && notesEnabled

  // 按顺序解析卡片（顺序即展示顺序），编辑态用草稿顺序，展示态用已保存顺序。
  const orderedCards = useMemo(
    () => (shown ?? []).flatMap(key => cards.filter(card => card.key === key)),
    [shown, cards]
  )
  const editCards = useMemo(
    () => (cardDraft ?? []).flatMap(key => cards.filter(card => card.key === key)),
    [cardDraft, cards]
  )
  const hiddenCards = useMemo(() => cards.filter(card => !cardDraft?.includes(card.key)), [cards, cardDraft])
  const resolveSize = (card: DashboardCard): CardSize => (sizeDraft ?? sizes)[card.key] ?? card.defaultSize ?? 'm'
  const resolveColumn = (card: DashboardCard): CardColumn => (columnDraft ?? columns)[card.key] ?? 'left'

  useEffect(() => {
    let active = true
    void window.api.settings.getAll().then(settings => {
      // 名字与卡片设置互不影响：先读名字，卡片设置解析失败也不会丢。
      const savedName = settings[NAME_SETTING]
      if (active) setName(typeof savedName === 'string' ? savedName : '')
      const raw = settings[CARD_SETTING]
      const saved: unknown = raw === undefined ? defaultCards : JSON.parse(raw)
      if (!Array.isArray(saved) || !saved.every(id => typeof id === 'string')) throw new Error('Invalid dashboard cards')
      const compatible = saved.map(id => id === 'focus/focus-heatmap' ? 'dashboard/activity-heatmap' : id)
      // 按用户保存的顺序重建，而非按注册表顺序，否则拖拽排序在刷新后会被重置。
      const nextShown = [...new Set(compatible)].filter(key => cards.some(card => card.key === key))

      const rawSizes = settings[CARD_SIZE_SETTING]
      const parsedSizes: unknown = rawSizes === undefined ? {} : JSON.parse(rawSizes)
      const nextSizes: Record<string, CardSize> = {}
      if (parsedSizes && typeof parsedSizes === 'object' && !Array.isArray(parsedSizes)) {
        for (const [key, value] of Object.entries(parsedSizes as Record<string, unknown>)) {
          if ((value === 'm' || value === 'l') && cards.some(card => card.key === key)) nextSizes[key] = value
        }
      }

      const nextColumns: Record<string, CardColumn> = {}
      // 列设置损坏时独立回落，不丢弃原有的顺序和尺寸。
      try {
        const parsed: unknown = JSON.parse(settings[CARD_COL_SETTING] ?? '{}')
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            if ((value === 'left' || value === 'right') && cards.some(card => card.key === key)) nextColumns[key] = value
          }
        }
      } catch { /* 按确定的默认规则分配列。 */ }
      const ordered = nextShown.flatMap(key => cards.filter(card => card.key === key))
      if (active) {
        setShown(nextShown)
        setSizes(nextSizes)
        setColumns(assignColumns(ordered, nextSizes, nextColumns))
      }
    }).catch(() => {
      if (!active) return
      setShown(defaultCards)
      setColumns(assignColumns(defaultCards.flatMap(key => cards.filter(card => card.key === key)), {}, {}))
      window.toast.error('无法读取首页卡片设置，已显示默认卡片')
    })
    return () => { active = false }
  }, [cards, defaultCards])

  const toggleFavorites = (): void => {
    if (editing) return
    if (!editingFavorites) scrollRef.current?.scrollTo({ top: 0 })
    setEditMode(editingFavorites ? null : 'favorites')
  }

  const saveFavorites = async (next: string[]): Promise<void> => {
    setSavingFavorites(true)
    try { await setPinned(next) } finally { setSavingFavorites(false) }
  }

  const enterEdit = (): void => {
    if (shown === null || editMode !== null) return
    scrollRef.current?.scrollTo({ top: 0 })
    setCardDraft([...shown])
    setSizeDraft({ ...sizes })
    setColumnDraft({ ...columns })
    setDraggedKey(null)
    setEditMode('cards')
  }

  const cancelEdit = (): void => {
    if (savingCards) return
    setCardDraft(null)
    setSizeDraft(null)
    setColumnDraft(null)
    setDraggedKey(null)
    setEditMode(null)
  }

  const saveCards = async (): Promise<void> => {
    if (cardDraft === null || savingCards) return
    setSavingCards(true)
    try {
      // 按草稿顺序保存，同时过滤掉已下线/失效的卡片 key。
      const next = cardDraft.filter(key => cards.some(card => card.key === key))
      const sizePayload = sizeDraft ?? sizes
      const columnPayload = columnDraft ?? columns
      await Promise.all([
        window.api.settings.set(CARD_SETTING, JSON.stringify(next)),
        window.api.settings.set(CARD_SIZE_SETTING, JSON.stringify(sizePayload)),
        window.api.settings.set(CARD_COL_SETTING, JSON.stringify(columnPayload))
      ])
      setShown(next)
      setSizes(sizePayload)
      setColumns(columnPayload)
      setCardDraft(null)
      setSizeDraft(null)
      setColumnDraft(null)
      setDraggedKey(null)
      setEditMode(null)
    } catch {
      window.toast.error('未能保存首页卡片，请重试')
    } finally {
      setSavingCards(false)
    }
  }

  const moveCard = (key: string, targetKey: string): void => {
    setCardDraft(current => {
      if (!current || key === targetKey) return current
      const targetIndex = current.indexOf(targetKey)
      if (!current.includes(key) || targetIndex < 0) return current
      const next = current.filter(item => item !== key)
      next.splice(targetIndex, 0, key)
      return next
    })
  }

  const moveCardBy = (key: string, direction: -1 | 1): void => {
    if (savingCards) return
    const index = editCards.findIndex(card => card.key === key)
    const targetIndex = index + direction
    const card = editCards[index]
    const target = editCards[targetIndex]
    if (!card || !target) return

    const next = editCards.map(item => item.key)
    next[index] = target.key
    next[targetIndex] = key
    setCardDraft(next)

    // 两张窄卡交换顺序时也交换列归属，否则同排卡片仍会留在原位。
    if (resolveSize(card) === 'm' && resolveSize(target) === 'm') {
      setColumnDraft(current => ({ ...current, [key]: resolveColumn(target), [target.key]: resolveColumn(card) }))
    }
  }

  const removeCard = (key: string): void => {
    setCardDraft(current => (current ? current.filter(item => item !== key) : current))
  }

  const addCard = (key: string): void => {
    const card = cards.find(card => card.key === key)
    if (card) setColumnDraft(current => assignColumns([...editCards, card], sizeDraft ?? sizes, current ?? columns))
    setCardDraft(current => (current && !current.includes(key) ? [...current, key] : current))
  }

  const updateSize = (key: string, size: CardSize): void => {
    setSizeDraft(current => (current ? { ...current, [key]: size } : current))
  }

  const handleDrop = (targetKey: string): void => {
    if (draggedKey && !savingCards) {
      const target = editCards.find(card => card.key === targetKey)
      if (target && resolveSize(target) === 'm') {
        setColumnDraft(current => ({ ...current, [draggedKey]: resolveColumn(target) }))
      }
      moveCard(draggedKey, targetKey)
    }
    setDraggedKey(null)
  }

  const handleBoardDrop = (): void => {
    if (draggedKey && !savingCards) {
      setCardDraft(current => current ? [...current.filter(key => key !== draggedKey), draggedKey] : current)
    }
    setDraggedKey(null)
  }

  const load = useCallback(async () => {
    const requested = ++revision.current
    setLoading(true)
    setLoadError('')
    const [focus, todos, todoStats, notes, noteStats] = await Promise.allSettled([
      readFocus ? window.api.focus.stats() : null,
      readTodos ? window.api.todos.list() : null,
      readTodoStats ? window.api.todos.stats() : null,
      (async () => {
        const [journal, journals] = await Promise.all([
          readJournal ? window.api.notes.getJournal(today) : null,
          readJournalDates ? window.api.notes.list({ kind: 'journal', limit: 60 }) : []
        ])
        return { journal, journals }
      })(),
      notesEnabled ? window.api.notes.stats() : null
    ])
    if (revision.current !== requested) return
    setActivityRevision(value => value + 1)
    setData(current => ({
      focus: focus.status === 'fulfilled' ? focus.value : current.focus,
      todos: todos.status === 'fulfilled' ? todos.value : current.todos,
      todoStats: todoStats.status === 'fulfilled' ? todoStats.value : current.todoStats,
      journal: notes.status === 'fulfilled' ? notes.value.journal : current.journal,
      journals: notes.status === 'fulfilled' ? notes.value.journals : current.journals,
      noteStats: noteStats.status === 'fulfilled' ? noteStats.value : current.noteStats
    }))
    setJournalReady(readJournal && notes.status === 'fulfilled')
    const failure = [focus, todos, todoStats, notes, noteStats].find(result => result.status === 'rejected')
    if (failure) setLoadError(humanError(failure.reason))
    setLoading(false)
  }, [readFocus, readTodos, readTodoStats, readJournal, readJournalDates, notesEnabled, today])

  useEffect(() => {
    if (!saving) void load()
    const timer = setInterval(() => setClock(new Date()), 30000)
    const onFocus = (): void => { setClock(new Date()); void load() }
    addEventListener('focus', onFocus)
    return () => {
      revision.current += 1
      clearInterval(timer)
      removeEventListener('focus', onFocus)
    }
  }, [load, saving, focusRevision])

  const editName = (): void => {
    cancelName.current = false
    setNameDraft(name)
    setEditingName(true)
  }

  const focusNameInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return
    input.focus()
    input.select()
  }, [])

  // 点击名字外部即失焦保存；值为空时按「清除名字」处理，回到占位提示。
  const commitName = (): void => {
    if (cancelName.current) { cancelName.current = false; setEditingName(false); return }
    setEditingName(false)
    const next = nameDraft.trim().slice(0, NAME_MAX)
    if (next === name) return
    const previous = name
    setName(next)
    void window.api.settings.set(NAME_SETTING, next).catch(() => {
      setName(previous)
      window.toast.error('没能保存名字，请重试')
    })
  }

  const currentJournal = data.journal?.journalDate === today ? data.journal : null
  const journal = draft?.date === today ? draft.content : (currentJournal?.content ?? '')
  const journalDates = useMemo(() => {
    const dates = new Set(data.journals.flatMap(item => item.journalDate ?? []))
    if (currentJournal) dates.add(today)
    return dates
  }, [currentJournal, data.journals, today])
  const dueTodos = data.todos?.filter(todo => todo.done === 0 && todo.dueDate !== null && todo.dueDate <= today) ?? []

  const saveJournal = async (): Promise<void> => {
    if (!journalReady || loading || !journal.trim() || useJournalDraft.getState().saving) return
    useJournalDraft.setState({ saving: true })
    try {
      const saved = await window.api.notes.save({
        kind: 'journal',
        journalDate: today,
        title: currentJournal?.title ?? formatDate(clock.getTime(), 'yyyy年M月d日'),
        content: journal.trim(),
        tags: currentJournal ? currentJournal.tags.split(',').filter(Boolean) : ['日记']
      })
      setData(current => ({ ...current, journal: saved }))
      setActivityRevision(value => value + 1)
      if (useJournalDraft.getState().draft === draft) useJournalDraft.setState({ draft: null })
      window.toast.success('今天的日记已保存')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      useJournalDraft.setState({ saving: false })
    }
  }

  const completeTodo = async (id: string): Promise<void> => {
    setPendingTodos(current => new Set(current).add(id))
    try {
      const updated = await window.api.todos.toggle(id)
      setData(current => ({
        ...current,
        todos: current.todos?.map(todo => todo.id === id ? updated : todo) ?? null
      }))
      void load()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setPendingTodos(current => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const renderCard = (card: DashboardCard): ReactNode => {
    if (card.component) return <card.component />
    switch (card.id) {
      case 'quick-capture':
        return <QuickCapture onSaved={() => void load()} />
      case 'focus-trend':
        return <FocusTrend stats={data.focus} loading={loading} />
      case 'todo-overview':
        return <TodoOverview todos={data.todos} today={today} loading={loading} />
      case 'todo-completion':
        return <TodoCompletion todos={data.todos} today={today} loading={loading} />
      case 'today-todos':
        return (
          <section className="home-panel home-tasks" data-empty={Boolean(data.todos && !dueTodos.length)}>
            <div className="home-panel-head">
              <h2>今日待办 {dueTodos.length > 0 && <span className="home-task-count num">{dueTodos.length}</span>}</h2>
              <button className="home-link" type="button" onClick={() => navigate(card.module.path ?? '/')}>全部待办 <ArrowUpRight size={13} /></button>
            </div>
            {dueTodos.length > 0 && (
              <ul className="home-task-list">
                {dueTodos.slice(0, 4).map(todo => (
                  <li key={todo.id}>
                    <label>
                      <input type="checkbox" checked={pendingTodos.has(todo.id)} disabled={pendingTodos.has(todo.id)} onChange={() => void completeTodo(todo.id)} />
                      <span className="truncate">{todo.title}</span>
                      {todo.dueDate && todo.dueDate < today && <time dateTime={todo.dueDate}>{todo.dueDate.slice(5)} 逾期</time>}
                      {todo.dueDate === today && <time dateTime={todo.dueDate}>今天</time>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {data.todos && !dueTodos.length && <p className="home-subtle home-section-message">今天没有到期的待办。</p>}
            {!data.todos && <p className="home-subtle home-section-message">{loading ? '正在读取待办…' : '无法读取待办。'}</p>}
          </section>
        )
      case 'month-calendar':
        return <ActivityCalendar
          today={clock}
          showMonth
          showHeatmap={false}
          journalDates={journalDates}
          sources={activitySources}
          refreshKey={activityRevision}
          editing={editing}
          showJournal={notesEnabled}
          todoDetails={todosPath ? { items: data.todos, loading } : undefined}
        />
      case 'activity-heatmap':
        return <ActivityCalendar today={clock} showMonth={false} showHeatmap journalDates={journalDates} sources={activitySources} refreshKey={activityRevision} editing={editing} />
      case 'today-journal':
        return (
          <section className="home-panel home-journal">
            <div className="home-panel-head">
              <h2><label htmlFor="home-journal-content">今日一记</label></h2>
              <button className="home-link" type="button" disabled={!journalReady || loading || saving} onClick={() => openNote(currentJournal ? { id: currentJournal.id } : { todayJournal: true })}>
                {currentJournal ? '打开今日日记' : '写今日日记'} <ArrowUpRight size={13} />
              </button>
            </div>
            <textarea
              id="home-journal-content"
              className="home-journal-input"
              placeholder="记下今天发生的事…"
              value={journal}
              onChange={event => useJournalDraft.setState({ draft: { date: today, content: event.target.value } })}
              onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void saveJournal() }}
            />
            <div className="home-journal-foot">
              <span className="kbd-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 保存到日记{journal.trim() && <span className="home-journal-count num">{journal.trim().length} 字</span>}</span>
              <button className="button primary sm" type="button" disabled={!journalReady || loading || !journal.trim() || saving} onClick={() => void saveJournal()}>
                {saving ? '保存中…' : '保存日记'}
              </button>
            </div>
          </section>
        )
      default:
        return null
    }
  }

  const renderCards = editing ? editCards : orderedCards
  const defaultColumns = assignColumns(orderedCards, {}, {})
  const compactDaily = !editing && Boolean(tasks && data.todos && !dueTodos.length && calendar && journalCard)
    && Object.keys(sizes).length === 0 && orderedCards.length === defaultCards.length
    && orderedCards.every((card, index) => card.key === defaultCards[index] && columns[card.key] === defaultColumns[card.key])

  return (
    <div className="page dashboard" data-testid="dashboard">
      <div className="home-top">
        <div className="home-top-inner home-frame">
          <header className="home-header">
            <div className="home-head-copy">
              <h1 className="home-greeting">
                <span>{greeting(clock.getHours())}</span>
                <span className="home-greeting-sep" aria-hidden="true">，</span>
                {editingName ? (
                  <input
                    ref={focusNameInput}
                    className="home-name-input"
                    aria-label="你的名字"
                    placeholder="你的名字"
                    value={nameDraft}
                    maxLength={NAME_MAX}
                    onChange={event => setNameDraft(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={event => {
                      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                      if (event.key === 'Escape') { event.preventDefault(); cancelName.current = true; event.currentTarget.blur() }
                    }}
                  />
                ) : (
                  <button
                    className={cn('home-name', !name && 'home-name-empty')}
                    type="button"
                    title={name ? '点击修改名字' : '点击设置你的名字'}
                    aria-label={name ? `修改名字：${name}` : '设置你的名字'}
                    onClick={editName}
                  >
                    {name || '你的名字'}
                  </button>
                )}
              </h1>
            </div>
            <div className="home-header-actions">
              {editing ? (
                <>
                  <button className="button secondary" type="button" disabled={savingCards} onClick={cancelEdit}>取消</button>
                  <button className="button primary" type="button" disabled={savingCards} onClick={() => void saveCards()}>
                    {savingCards ? '保存中…' : '保存卡片'}
                  </button>
                </>
              ) : !editingFavorites && (
                <>
                  {focusPath && <button className={cn('button', focusRunning ? 'primary' : 'secondary')} type="button" onClick={() => {
                    navigate(focusPath)
                    useFocus.getState().enter()
                  }}>
                    <Timer size={16} aria-hidden="true" />{focusRunning ? `专注中 ${focusClock(focusRemaining)}` : '开始专注'}
                  </button>}
                  <button className="button ghost" type="button" disabled={shown === null} onClick={enterEdit}>
                    <LayoutGrid size={16} aria-hidden="true" />管理卡片
                  </button>
                </>
              )}
            </div>
          </header>

          <Favorites editing={editingFavorites} saving={savingFavorites} save={saveFavorites} onEdit={editing ? undefined : toggleFavorites} />
        </div>
      </div>

      <section className="home-scroll" aria-label="首页内容" tabIndex={0} ref={scrollRef}>
        <div className="home-work home-frame">
          {editingFavorites && <FavoritePicker saving={savingFavorites} save={saveFavorites} />}
          {(data.focus || data.todoStats || data.noteStats) && !editing && (
            <DashboardStats focus={data.focus} todos={data.todoStats} notes={data.noteStats} clock={clock} loading={loading} />
          )}

          {loadError && (
            <div className="home-load-error" role="status">
              <span>首页数据读取失败。{loadError}</span>
              <button className="home-link" type="button" onClick={() => void load()}>重试</button>
            </div>
          )}

          {!editing && shown !== null && orderedCards.length === 0 && (
            <p className="home-subtle home-cards-empty" role="status">首页暂无内容卡片。可在「管理卡片」中添加。</p>
          )}

          {editing && (
            <section className="home-card-pool" aria-label="添加卡片">
              <div className="home-panel-head">
                <h2>添加卡片</h2>
                <span className="home-subtle num">{hiddenCards.length ? `${editCards.length} 张已显示` : '所有卡片均已显示'}</span>
              </div>
              {hiddenCards.length > 0 && (
                <div className="home-card-pool-list">
                  {hiddenCards.map(card => (
                    <button type="button" key={card.key} className="home-card-pool-item" disabled={savingCards} onClick={() => addCard(card.key)}>
                      <Plus size={13} aria-hidden="true" />
                      <span>{card.name}</span>
                      <span className="home-subtle">{card.module.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <DashboardBoard
            className={cn('home-board', editing && 'is-editing')}
            data-compact-daily={compactDaily}
            onDragOver={event => { if (editing && draggedKey && !savingCards) event.preventDefault() }}
            onDrop={event => {
              if (!editing || !draggedKey) return
              event.preventDefault()
              handleBoardDrop()
            }}
          >
            {renderCards.map(card => (
              <CardShell
                key={card.key}
                cardKey={card.key}
                size={resolveSize(card)}
                column={resolveColumn(card)}
                editing={editing}
                dragging={draggedKey !== null}
                onDragStart={setDraggedKey}
                onDragEnd={() => setDraggedKey(null)}
                onDrop={handleDrop}
                onMove={moveCardBy}
                onResize={size => updateSize(card.key, size)}
                onColumnChange={column => setColumnDraft(current => ({ ...current, [card.key]: column }))}
                onRemove={() => removeCard(card.key)}
              >
                {renderCard(card)}
              </CardShell>
            ))}
          </DashboardBoard>
        </div>
      </section>
    </div>
  )
}

export default defineModule({
  id: 'dashboard',
  role: 'home',
  name: '首页',
  icon: House,
  group: '工具',
  order: 0,
  pinnable: false,
  dashboardCards: [
    { id: 'month-calendar', name: '月历', defaultVisible: true, defaultOrder: 30 },
    { id: 'activity-heatmap', name: '年度活动', defaultVisible: true, defaultOrder: 50 }
  ],
  keywords: ['home', '首页', '概览'],
  page: Dashboard
})
