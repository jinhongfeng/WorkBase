import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActivityDay, ActivitySource, ActivityYear, Note, Todo } from '@shared/types'
import { cn, formatDate, humanError, todayKey } from '../../lib/utils'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = Array.from({ length: 12 }, (_, month) => month)
const ACTIVITY_RANGES = ['0 天活跃', '1–2 天活跃', '3–4 天活跃', '5–7 天活跃']
const DAY_OFFSETS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

type JournalResult = { date: string; note: Note | null } | { date: string; failed: true }
type DateAnchor = { date: Date; button: HTMLButtonElement }

function placeCalendarTip(tip: HTMLDivElement, anchor: Element, gap: number): void {
  const rect = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8))
  const top = rect.top >= tip.offsetHeight + gap + 8
    ? rect.top - tip.offsetHeight - gap
    : Math.min(rect.bottom + gap, window.innerHeight - tip.offsetHeight - 8)
  tip.style.left = `${left}px`
  tip.style.top = `${Math.max(8, top)}px`
}

function heatLevel(activeDays: number): number {
  if (activeDays >= 5) return 3
  if (activeDays >= 3) return 2
  return activeDays > 0 ? 1 : 0
}

function hasActivity(day: ActivityDay): boolean {
  return day.noteWords > 0 || day.ieltsMilliseconds > 0 || day.ieltsReviews > 0 || day.todosCompleted > 0 || day.habitCheckins > 0
}

function studyTime(milliseconds: number): string {
  if (!milliseconds) return '0 分'
  if (milliseconds < 60000) return '<1 分'
  return `${Math.floor(milliseconds / 60000)} 分`
}

function YearHeatmap({ data, year, today, loading, error, retry }: {
  data: ActivityYear | null; year: number; today: string; loading: boolean; error: string; retry(): void
}) {
  const sources = data?.sources ?? []
  const since = data?.trackingSince ?? ''
  const cells = useMemo(() => {
    const activityByDate = new Map(data?.days.map(day => [day.date, day]) ?? [])
    return MONTHS.flatMap(month => {
      const lastDay = new Date(year, month + 1, 0).getDate()
      return Array.from({ length: 5 }, (_, index) => {
        const startDay = index * 7 + 1
        const endDay = Math.min(startDay + 6, lastDay)
        const dates = Array.from({ length: Math.max(0, endDay - startDay + 1) }, (_, offset) =>
          todayKey(new Date(year, month, startDay + offset))
        ).filter(date => date <= today)
        const daily = dates.flatMap(date => activityByDate.get(date) ?? [])
        const activeDays = daily.filter(hasActivity).length
        const available = daily.length > 0
        const range = `${month + 1}月${startDay}–${startDay + daily.length - 1}日`
        const details = daily.map(day => {
          const parts = [day.date]
          if (data?.sources.includes('notes')) parts.push(day.date < data.trackingSince ? '笔记字数未记录' : `笔记 ${day.noteWords} 字`)
          if (data?.sources.includes('ielts')) parts.push(`${day.date < data.trackingSince ? '学习时长未记录' : `英语 ${studyTime(day.ieltsMilliseconds)}`}，复习 ${day.ieltsReviews} 次`)
          if (data?.sources.includes('todos')) parts.push(`完成待办 ${day.todosCompleted} 件`)
          if (data?.sources.includes('habits')) parts.push(`习惯打卡 ${day.habitCheckins} 项`)
          return parts.join('，')
        }).join('；')
        return {
          key: `${year}-${month + 1}-${index + 1}`,
          column: month + 1,
          row: index + 1,
          endDate: dates.at(-1),
          daily, activeDays, available, range,
          label: `${range}，${activeDays} 天活跃。${details}`
        }
      })
    })
  }, [data, today, year])
  const [focusedWeek, setFocusedWeek] = useState<string | null>(null)
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null)
  const [keyboardWeek, setKeyboardWeek] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const defaultWeek = [...cells].reverse().find(cell => cell.available)?.key
  const tabWeek = cells.some(cell => cell.key === focusedWeek && cell.available) ? focusedWeek : defaultWeek
  const active = cells.find(cell => cell.key === (hoveredWeek ?? keyboardWeek))

  useLayoutEffect(() => {
    if (!active) return
    const tip = tipRef.current
    const anchor = gridRef.current?.querySelector(`[data-week="${active.key}"]`)
    if (!tip || !anchor) return
    placeCalendarTip(tip, anchor, 8)
    const close = (): void => { setHoveredWeek(null); setKeyboardWeek(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [active])

  const move = (event: KeyboardEvent<HTMLButtonElement>, column: number, row: number): void => {
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (!Object.hasOwn(offsets, event.key)) return
    event.preventDefault()
    const [dx, dy] = offsets[event.key as keyof typeof offsets]
    let nextColumn = column + dx
    let nextRow = row + dy
    while (nextColumn >= 1 && nextColumn <= 12 && nextRow >= 1 && nextRow <= 5) {
      const target = cells[(nextColumn - 1) * 5 + nextRow - 1]
      if (target.available) {
        setHoveredWeek(null)
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-week="${target.key}"]`)?.focus()
        return
      }
      nextColumn += dx
      nextRow += dy
    }
  }

  return (
    <div className="home-heat">
      <div className="home-heat-heading">
        <h3>{year} 年活动</h3>
        <div className="home-heat-legend" aria-label="每周活跃天数由浅到深">
          <span>少</span>
          {ACTIVITY_RANGES.map((range, index) => <i key={range} data-level={index} title={range} />)}
          <span>多</span>
        </div>
      </div>
      <div className="home-heat-matrix">
        <div className="home-heat-months" aria-hidden="true">
          {MONTHS.map(month => <span key={month}>{month + 1}</span>)}
        </div>
        <div className="home-heat-grid" role="group" aria-label={`${year} 年活动，按周汇总，使用方向键查看每日明细`} ref={gridRef} aria-busy={loading}>
          {cells.map(cell => {
            const position = { gridColumn: cell.column, gridRow: cell.row }
            if (!cell.available) {
              return <span key={cell.key} className="home-heat-cell home-heat-unavailable" style={position} aria-hidden="true" />
            }
            return (
              <button
                key={cell.key}
                type="button"
                className="home-heat-cell"
                style={position}
                data-level={heatLevel(cell.activeDays)}
                data-date={cell.endDate}
                data-week={cell.key}
                aria-label={cell.label}
                tabIndex={tabWeek === cell.key ? 0 : -1}
                onMouseEnter={() => setHoveredWeek(cell.key)}
                onMouseLeave={() => setHoveredWeek(null)}
                onFocus={() => { setHoveredWeek(null); setFocusedWeek(cell.key); setKeyboardWeek(cell.key) }}
                onBlur={() => setKeyboardWeek(null)}
                onKeyDown={event => {
                  if (event.key === 'Escape') { setHoveredWeek(null); setKeyboardWeek(null) }
                  else move(event, cell.column, cell.row)
                }}
              />
            )
          })}
        </div>
      </div>
      {active && createPortal(<div className="home-activity-tip" ref={tipRef} aria-hidden="true">
        <strong>{active.range} · {active.activeDays} 天活跃</strong>
        <table>
          <thead><tr><th>日期</th>
            {sources.includes('notes') && <th>笔记字数</th>}
            {sources.includes('ielts') && <th>英语 / 复习</th>}
            {sources.includes('todos') && <th>待办</th>}
            {sources.includes('habits') && <th>打卡</th>}
          </tr></thead>
          <tbody>{active.daily.map(day => <tr key={day.date}>
            <th>{day.date.slice(5).replace('-', '/')}</th>
            {sources.includes('notes') && <td>{day.date < since ? '—' : day.noteWords}</td>}
            {sources.includes('ielts') && <td>{day.date < since ? '—' : studyTime(day.ieltsMilliseconds)} / {day.ieltsReviews}次</td>}
            {sources.includes('todos') && <td>{day.todosCompleted}件</td>}
            {sources.includes('habits') && <td>{day.habitCheckins}项</td>}
          </tr>)}</tbody>
        </table>
        {active.daily.some(day => day.date < since) && <p>— 表示当时尚未记录字数或学习时长</p>}
      </div>, document.body)}
      <p className="home-subtle home-heat-empty" data-empty={!error && !loading && (!defaultWeek || !sources.length)} role="status">
        {error ? <>活动读取失败。<button className="home-link" onClick={retry}>重试</button></> : loading ? '正在读取活动…' :
          !defaultWeek ? '此年暂无活动记录。' : !sources.length ? '添加笔记、英语、待办或习惯模块以记录活动。' : '按周汇总 · 悬停或聚焦查看每天'}
      </p>
    </div>
  )
}

export default function ActivityCalendar({
  today,
  showMonth,
  showHeatmap,
  journalDates,
  sources,
  refreshKey,
  editing,
  showJournal,
  todoDetails
}: {
  today: Date
  showMonth: boolean
  showHeatmap: boolean
  journalDates: Set<string>
  sources: ActivitySource[]
  refreshKey: number
  editing: boolean
  showJournal?: boolean
  todoDetails?: { items: Todo[] | null; loading: boolean }
}) {
  const [selected, setSelected] = useState(today)
  const year = selected.getFullYear()
  const monthIndex = selected.getMonth()
  const selectedDate = todayKey(selected)
  const selectedButton = useRef<HTMLButtonElement>(null)
  const focusSelection = useRef(false)
  const [hoveredDay, setHoveredDay] = useState<DateAnchor | null>(null)
  const [focusedDay, setFocusedDay] = useState<DateAnchor | null>(null)
  const dayTip = useRef<HTMLDivElement>(null)
  const dayTipId = useId()
  const activeDay = showMonth && !editing && (showJournal || todoDetails) ? hoveredDay ?? focusedDay : null
  const activeDate = activeDay ? todayKey(activeDay.date) : null
  const [journalResult, setJournalResult] = useState<JournalResult | null>(null)
  const [activity, setActivity] = useState<ActivityYear | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!showJournal || !activeDate) return
    let alive = true
    void window.api.notes.getJournal(activeDate).then(note => {
      if (alive) setJournalResult({ date: activeDate, note })
    }).catch(() => {
      if (alive) setJournalResult({ date: activeDate, failed: true })
    })
    return () => { alive = false }
  }, [showJournal, activeDate, refreshKey])

  useLayoutEffect(() => {
    const tip = dayTip.current
    if (!activeDay || !tip) return
    placeCalendarTip(tip, activeDay.button, 0)
    const close = () => { setHoveredDay(null); setFocusedDay(null) }
    const onScroll = (event: Event) => { if (event.target !== tip) close() }
    const onEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onEscape)
    }
  }, [activeDay, journalResult, todoDetails])

  useLayoutEffect(() => {
    if (!focusSelection.current) return
    focusSelection.current = false
    selectedButton.current?.focus()
  }, [selectedDate])

  useEffect(() => {
    if (!showHeatmap) return
    let alive = true
    setLoading(true)
    setError('')
    void window.api.activity.year({ year, sources }).then(value => {
      if (alive) setActivity(value)
    }).catch(reason => {
      if (alive) setError(humanError(reason))
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, sources, showHeatmap, refreshKey, retry])
  const todayDate = todayKey(today)
  const monthTitle = `${year}年${monthIndex + 1}月`
  const lead = new Date(year, monthIndex, 1).getDay()
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const dueTodos = activeDate ? todoDetails?.items?.filter(todo => todo.dueDate === activeDate) : undefined
  const journal = journalResult?.date === activeDate ? journalResult : null

  const move = (offset: number): void => {
    setHoveredDay(null)
    setFocusedDay(null)
    setSelected(current => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1)
      return next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next
    })
  }

  const moveDay = (event: KeyboardEvent<HTMLButtonElement>, day: number): void => {
    if (!Object.hasOwn(DAY_OFFSETS, event.key) || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    setHoveredDay(null)
    focusSelection.current = true
    setSelected(new Date(year, monthIndex, day + DAY_OFFSETS[event.key]))
  }

  return (
    <section className="home-panel home-calendar" aria-label={showMonth && showHeatmap ? '月历与年度活动' : showMonth ? '月历' : '年度活动'} inert={editing}>
      {showMonth ? <div className="home-month">
        <div className="home-month-heading">
          <button type="button" aria-label="上个月" onClick={() => move(-1)}><ChevronLeft size={17} /></button>
          <h2 aria-live="polite">{monthTitle}</h2>
          <button type="button" aria-label="下个月" onClick={() => move(1)}><ChevronRight size={17} /></button>
        </div>
        <div className="home-month-grid" role="group" aria-label="月历，悬停或聚焦查看当天内容，可用方向键移动">
          {WEEKDAYS.map(day => <span key={day} className="home-weekday" aria-label={`星期${day}`}>{day}</span>)}
          {Array.from({ length: 42 }, (_, index) => {
            const day = index - lead + 1
            if (day < 1 || day > dayCount) return <span key={index} aria-hidden="true" />
            const dayValue = new Date(year, monthIndex, day)
            const date = todayKey(dayValue)
            const isSelected = date === selectedDate
            const hasJournal = date === activeDate && journal && 'note' in journal ? Boolean(journal.note) : journalDates.has(date)
            return (
              <button
                key={date}
                ref={isSelected ? selectedButton : undefined}
                type="button"
                tabIndex={isSelected ? 0 : -1}
                aria-current={date === todayDate ? 'date' : undefined}
                aria-pressed={isSelected}
                aria-label={`${monthTitle}${day}日${hasJournal ? '，已有日记' : ''}`}
                aria-describedby={date === activeDate ? dayTipId : undefined}
                className={cn('home-date', hasJournal && 'has-journal')}
                onMouseEnter={event => setHoveredDay({ date: dayValue, button: event.currentTarget })}
                onMouseLeave={event => {
                  if (event.relatedTarget instanceof Node && dayTip.current?.contains(event.relatedTarget)) return
                  setHoveredDay(null)
                }}
                onFocus={event => {
                  if (event.currentTarget.matches(':focus-visible')) setFocusedDay({ date: dayValue, button: event.currentTarget })
                }}
                onBlur={() => setFocusedDay(null)}
                onClick={event => {
                  setSelected(dayValue)
                  if (event.detail === 0 || (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch')) {
                    setFocusedDay({ date: dayValue, button: event.currentTarget })
                  }
                }}
                onKeyDown={event => moveDay(event, day)}
              >
                <time dateTime={date}>{day}</time>
              </button>
            )
          })}
        </div>
      </div> : <div className="home-month home-month-heading">
        <button type="button" aria-label="上一年" onClick={() => move(-12)}><ChevronLeft size={17} /></button>
        <h2>年度活动</h2>
        <button type="button" aria-label="下一年" onClick={() => move(12)}><ChevronRight size={17} /></button>
      </div>}
      {showHeatmap && <YearHeatmap data={activity?.year === year ? activity : null} year={year} today={todayDate}
        loading={loading} error={error} retry={() => setRetry(value => value + 1)} />}
      {activeDay && activeDate && createPortal(<div className="home-day-tip" id={dayTipId} role="tooltip" ref={dayTip}
        onMouseLeave={() => setHoveredDay(null)}>
        <strong><time dateTime={activeDate}>{formatDate(activeDay.date.getTime(), 'M月d日 · EEEE')}</time></strong>
        {showJournal && <div className="home-day-row">
          <span className="home-day-label">日记</span>
          <span>{!journal ? '正在读取…' : 'failed' in journal ? '读取失败' : journal.note?.title || (journal.note ? '无标题日记' : '暂无日记')}</span>
        </div>}
        {todoDetails && <div className="home-day-row">
          <span className="home-day-label">待办</span>
          {dueTodos?.length ? <ul className="home-day-tasks" aria-label="当天到期的待办">
            {dueTodos.map(todo => <li key={todo.id} data-done={Boolean(todo.done)}>
              {todo.done ? <Check size={12} aria-hidden="true" /> : <i aria-hidden="true" />}
              <span>{todo.title}</span>
              {todo.done === 1 && <span className="sr-only">已完成</span>}
            </li>)}
          </ul> : <span>{dueTodos ? '当天没有到期待办' : todoDetails.loading ? '正在读取…' : '读取失败'}</span>}
        </div>}
      </div>, document.body)}
    </section>
  )
}
