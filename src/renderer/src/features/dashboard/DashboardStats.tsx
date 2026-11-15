import { ListTodo, NotebookPen, PenLine, Timer } from 'lucide-react'
import type { FocusStats, NoteStats, TodoStats } from '@shared/types'
import { NumberTicker } from '../../components/ui/NumberTicker'
import { Sparkline } from '../../components/ui/Sparkline'
import { StatCard } from '../../components/ui/StatCard'
import { todayKey } from '../../lib/utils'

interface Props {
  focus: FocusStats | null
  todos: TodoStats | null
  notes: NoteStats | null
  clock: Date
  loading: boolean
}

const number = new Intl.NumberFormat('zh-CN')

export default function DashboardStats({ focus, todos, notes, clock, loading }: Props) {
  const today = todayKey(clock)
  const { pending, overdue, dueToday } = todos ?? { pending: 0, overdue: 0, dueToday: 0 }
  const later = pending - overdue - dueToday
  const taskSegments = [
    { tone: 'overdue', label: '逾期', count: overdue },
    { tone: 'today', label: '今日到期', count: dueToday },
    { tone: 'later', label: '其余待办', count: later }
  ]
  const taskSummary = taskSegments.map(({ label, count }) => `${label} ${count} 项`).join('，')
  const journalDays = new Set(notes?.journalDays)
  const monthLength = new Date(clock.getFullYear(), clock.getMonth() + 1, 0).getDate()
  const month = today.slice(0, 7)
  const writingMax = Math.max(1, ...(notes?.writingDays.map(day => day.words) ?? []))
  const unavailable = loading ? '读取中…' : '暂无数据'

  return (
    <div className="home-stats" aria-label="首页概览" role="group" aria-busy={loading}>
      <StatCard
        label="今日专注"
        value={focus ? <NumberTicker value={number.format(focus.todayMinutes)} /> : '—'}
        unit="分钟"
        icon={Timer}
        hint={focus ? `近 7 天共 ${number.format(focus.weekMinutes)} 分钟` : unavailable}
      >
        {focus && (
          <div className="home-stat-visual">
            <Sparkline values={focus.days.map(day => day.minutes)} width={112} height={20} label="近 7 天专注趋势" />
          </div>
        )}
      </StatCard>
      <StatCard
        label="未完成待办"
        value={todos ? <NumberTicker value={number.format(pending)} /> : '—'}
        unit="项"
        icon={ListTodo}
        hint={todos ? `逾期 ${number.format(overdue)} · 今日到期 ${number.format(dueToday)}` : unavailable}
      >
        {todos && (
          <div className="home-stat-visual">
            <div className="home-task-strip" role="img" aria-label={taskSummary} title={taskSummary}>
              {taskSegments.filter(segment => segment.count > 0).map(segment => (
                <span key={segment.tone} data-tone={segment.tone} style={{ flexGrow: segment.count }} />
              ))}
            </div>
          </div>
        )}
      </StatCard>
      <StatCard
        label="本月日记"
        value={notes ? <NumberTicker value={String(journalDays.size)} /> : '—'}
        unit="篇"
        icon={NotebookPen}
        hint={notes ? `已记录 ${journalDays.size} / ${monthLength} 天` : unavailable}
      >
        {notes && (
          <div className="home-stat-visual">
            <div className="home-journal-dots" role="img" aria-label={notes.journalDays.length
              ? `有日记的日期：${notes.journalDays.map(date => Number(date.slice(-2))).join('、')} 日`
              : '本月暂无日记'}>
              {Array.from({ length: monthLength }, (_, index) => {
                const day = index + 1
                const recorded = journalDays.has(`${month}-${String(day).padStart(2, '0')}`)
                return <span key={day} data-recorded={recorded} title={`${day} 日${recorded ? '有日记' : '无日记'}`} />
              })}
            </div>
          </div>
        )}
      </StatCard>
      <StatCard
        label="累计写作"
        value={notes ? <NumberTicker value={number.format(notes.words)} /> : '—'}
        unit="字"
        icon={PenLine}
        hint={notes ? `今日 ${number.format(notes.todayWords)} 字` : unavailable}
      >
        {notes && (
          <div className="home-stat-visual">
            <div className="home-writing-bars" role="img" aria-label={notes.writingDays
              .map(day => `${day.date.slice(5)} ${number.format(day.words)} 字`).join('，')}>
              {notes.writingDays.map(day => (
                <span
                  key={day.date}
                  data-today={day.date === today}
                  data-empty={day.words === 0}
                  style={{ height: `${day.words / writingMax * 100}%` }}
                  title={`${day.date.slice(5)} · ${number.format(day.words)} 字`}
                />
              ))}
            </div>
            <span className="home-stat-period">近 7 天</span>
          </div>
        )}
      </StatCard>
    </div>
  )
}
