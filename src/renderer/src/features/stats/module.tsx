import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { ActivityDay, PageTimeStats } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { BarList, type BarItem } from '../../components/ui/BarList'
import { useModuleRegistry } from '../../modules/registry'
import { humanError } from '../../lib/utils'
import './stats.css'

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)'
}

const axisTick = { fontSize: 11, fill: 'var(--text-3)' }

interface MonthPoint {
  label: string
  writing: number
  todos: number
  englishHours: number
  reviews: number
  habitDays: number
}

interface WeekPoint {
  label: string
  writing: number
  todos: number
  englishHours: number
  reviews: number
  writingN: number
  todosN: number
  englishN: number
  reviewsN: number
}

interface HeatCell {
  date: string
  /** -1 表示该日期不存在（如 2 月 30 日），0–4 为当日活跃类别数分级。 */
  level: number
  day?: ActivityDay
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const WEEKS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} 小时`
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`
}

function monthlyPoints(days: ActivityDay[]): MonthPoint[] {
  const map = new Map<string, MonthPoint>()
  for (let month = 1; month <= 12; month += 1) {
    map.set(String(month).padStart(2, '0'), { label: MONTHS[month - 1], writing: 0, todos: 0, englishHours: 0, reviews: 0, habitDays: 0 })
  }
  for (const day of days) {
    const bucket = map.get(day.date.slice(5, 7))
    if (!bucket) continue
    bucket.writing += day.noteWords
    bucket.todos += day.todosCompleted
    bucket.englishHours += day.ieltsMilliseconds / 3_600_000
    bucket.reviews += day.ieltsReviews
    bucket.habitDays += day.habitCheckins > 0 ? 1 : 0
  }
  return [...map.values()]
}

function activeLevel(day: ActivityDay): number {
  const dims =
    (day.noteWords > 0 ? 1 : 0) +
    (day.todosCompleted > 0 ? 1 : 0) +
    (day.ieltsMilliseconds > 0 ? 1 : 0) +
    (day.ieltsReviews > 0 ? 1 : 0) +
    (day.habitCheckins > 0 ? 1 : 0)
  return Math.min(4, dims)
}

function heatRows(year: number, days: ActivityDay[]): { label: string; cells: HeatCell[] }[] {
  const byDate = new Map(days.map(day => [day.date, day]))
  const rows: { label: string; cells: HeatCell[] }[] = []
  for (let month = 1; month <= 12; month += 1) {
    const monthLength = new Date(year, month, 0).getDate()
    const cells: HeatCell[] = []
    for (let day = 1; day <= 31; day += 1) {
      if (day > monthLength) {
        cells.push({ date: '', level: -1 })
        continue
      }
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const record = byDate.get(date)
      if (!record) {
        cells.push({ date, level: -1 })
        continue
      }
      cells.push({ date, level: activeLevel(record), day: record })
    }
    rows.push({ label: MONTHS[month - 1], cells })
  }
  return rows
}

function weekPoints(days: ActivityDay[]): WeekPoint[] {
  const raw = WEEKS.map(label => ({ label, writing: 0, todos: 0, englishHours: 0, reviews: 0 }))
  for (const day of days) {
    const parsed = new Date(`${day.date}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) continue
    const point = raw[(parsed.getDay() + 6) % 7]
    point.writing += day.noteWords
    point.todos += day.todosCompleted
    point.englishHours += day.ieltsMilliseconds / 3_600_000
    point.reviews += day.ieltsReviews
  }
  const peak = {
    writing: Math.max(...raw.map(item => item.writing)),
    todos: Math.max(...raw.map(item => item.todos)),
    englishHours: Math.max(...raw.map(item => item.englishHours)),
    reviews: Math.max(...raw.map(item => item.reviews))
  }
  return raw.map(item => ({
    ...item,
    writingN: peak.writing > 0 ? item.writing / peak.writing : 0,
    todosN: peak.todos > 0 ? item.todos / peak.todos : 0,
    englishN: peak.englishHours > 0 ? item.englishHours / peak.englishHours : 0,
    reviewsN: peak.reviews > 0 ? item.reviews / peak.reviews : 0
  }))
}

function StatsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [days, setDays] = useState<ActivityDay[]>([])
  const [trackingSince, setTrackingSince] = useState('')
  const [focusYear, setFocusYear] = useState<{ date: string; minutes: number }[]>([])
  const [pageTime, setPageTime] = useState<PageTimeStats | null>(null)
  const [pageTimeError, setPageTimeError] = useState('')
  const [heatTip, setHeatTip] = useState<{ date: string; text: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState('')
  const modules = useModuleRegistry(state => state.modules)

  const load = useCallback(async (target: number): Promise<void> => {
    setState('loading')
    setError('')
    try {
      const [activity, focus] = await Promise.all([
        window.api.activity.year({
          year: target,
          sources: ['notes', 'ielts', 'todos', 'habits']
        }),
        window.api.focus.stats()
      ])
      // 页面停留失败只降级该卡，不拖垮整页统计。
      let pages: PageTimeStats
      try {
        pages = await window.api.pageTime.stats(target)
        setPageTimeError('')
      } catch (reason) {
        pages = { year: target, pages: [], months: [] }
        setPageTimeError(humanError(reason))
      }
      setDays(activity.days)
      setTrackingSince(activity.trackingSince)
      setFocusYear(focus.year)
      setPageTime(pages)
      setState('ready')
    } catch (reason) {
      setState('failed')
      setError(humanError(reason))
    }
  }, [])

  useEffect(() => { void load(year) }, [load, year])

  const months = useMemo(() => monthlyPoints(days), [days])
  const cumMonths = useMemo(() => {
    let total = 0
    return months.map(month => {
      total += month.writing
      return { ...month, cumulative: total }
    })
  }, [months])
  const weeks = useMemo(() => weekPoints(days), [days])
  const heat = useMemo(() => heatRows(year, days), [year, days])

  const totals = useMemo(() => ({
    writing: months.reduce((sum, month) => sum + month.writing, 0),
    todos: months.reduce((sum, month) => sum + month.todos, 0),
    englishHours: months.reduce((sum, month) => sum + month.englishHours, 0),
    reviews: months.reduce((sum, month) => sum + month.reviews, 0),
    habitDays: months.reduce((sum, month) => sum + month.habitDays, 0)
  }), [months])
  const focusMonths = useMemo(() => {
    // focus.year 是近 365 天逐日分钟；按选中年份的月份聚合，早于窗口的月份无数据。
    const map = new Map<string, number>()
    for (let month = 1; month <= 12; month += 1) map.set(String(month).padStart(2, '0'), 0)
    let covered = 0
    for (const day of focusYear) {
      if (!day.date.startsWith(String(year))) continue
      const bucket = map.get(day.date.slice(5, 7))
      if (bucket === undefined) continue
      map.set(day.date.slice(5, 7), bucket + day.minutes)
      covered += 1
    }
    return { points: [...map.entries()].map(([month, minutes]) => ({ label: MONTHS[Number(month) - 1], minutes })), covered }
  }, [focusYear, year])
  const pageItems = useMemo<BarItem[]>(() => {
    if (!pageTime || pageTime.pages.length === 0) return []
    const total = pageTime.pages.reduce((sum, item) => sum + item.seconds, 0)
    const build = (item: { page: string; seconds: number }): BarItem => ({
      label: modules.find(module => module.id === item.page)?.name ?? item.page,
      value: item.seconds,
      display: formatDuration(item.seconds),
      note: total > 0 ? `${Math.round((item.seconds / total) * 100)}%` : undefined
    })
    const items = pageTime.pages.slice(0, 8).map(build)
    const rest = pageTime.pages.slice(8)
    if (rest.length > 0) {
      const seconds = rest.reduce((sum, item) => sum + item.seconds, 0)
      items.push({
        label: `其他 ${rest.length} 页`,
        value: seconds,
        display: formatDuration(seconds),
        note: total > 0 ? `${Math.round((seconds / total) * 100)}%` : undefined,
        tone: 'muted'
      })
    }
    return items
  }, [pageTime, modules])
  const pageMonths = useMemo(() => {
    const points = MONTHS.map(label => ({ label, minutes: 0 }))
    for (const row of pageTime?.months ?? []) {
      const index = Number(row.month) - 1
      if (index >= 0 && index < 12) points[index].minutes = Math.round(row.seconds / 60)
    }
    return points
  }, [pageTime])

  const showHeatDay = (cell: HeatCell): void => {
    const record = cell.day
    if (!record) {
      setHeatTip(null)
      return
    }
    const parts = [
      record.noteWords > 0 ? `写作 +${record.noteWords.toLocaleString('zh-CN')} 字` : '',
      record.todosCompleted > 0 ? `待办 ${record.todosCompleted} 项` : '',
      record.ieltsMilliseconds > 0 ? `英语 ${(record.ieltsMilliseconds / 3_600_000).toFixed(1)} 小时` : '',
      record.ieltsReviews > 0 ? `复习 ${record.ieltsReviews} 次` : '',
      record.habitCheckins > 0 ? `习惯 ${record.habitCheckins} 项` : ''
    ].filter(Boolean)
    setHeatTip({ date: cell.date, text: parts.length > 0 ? parts.join(' · ') : '无记录' })
  }

  const summary = [
    { label: '写作净增', value: `${totals.writing.toLocaleString('zh-CN')} 字` },
    { label: '完成待办', value: `${totals.todos} 项` },
    { label: '英语学习', value: `${totals.englishHours.toFixed(1)} 小时` },
    { label: '复习词句', value: `${totals.reviews} 次` },
    { label: '习惯活跃天', value: `${totals.habitDays} 天` }
  ]

  return (
    <div className="page stats-page">
      <PageHeader
        title="统计"
        meta={state === 'ready' && trackingSince ? <span className="stats-since">记录起点 {trackingSince}</span> : undefined}
        actions={
          <div className="stats-year-switch" role="group" aria-label="切换年份">
            <Button variant="ghost" className="icon" aria-label="上一年" onClick={() => setYear(value => value - 1)}><ChevronLeft size={16} /></Button>
            <span className="stats-year">{year}</span>
            <Button variant="ghost" className="icon" aria-label="下一年" disabled={year >= now.getFullYear()} onClick={() => setYear(value => value + 1)}><ChevronRight size={16} /></Button>
          </div>
        }
      />

      {state === 'loading' ? (
        <p className="stats-status" role="status">正在读取年度统计…</p>
      ) : state === 'failed' ? (
        <div className="stats-status" role="status">
          无法读取统计数据：{error}
          <Button variant="ghost" className="sm" onClick={() => void load(year)}>重试</Button>
        </div>
      ) : (
        <>
          <div className="stats-summary">
            {summary.map(item => (
              <div className="stats-summary-item" key={item.label}>
                <span className="stats-summary-value">{item.value}</span>
                <span className="stats-summary-label">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="stats-charts">
            <section className="card stats-chart">
              <div className="card-head">
                <span className="card-title">写作净增字数（{year}）</span>
                <span className="card-meta">柱为当月，线为累计</span>
              </div>
              <div className="card-body stats-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={cumMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis yAxisId="month" tickLine={false} axisLine={false} width={44} tick={axisTick} />
                    <YAxis yAxisId="cum" orientation="right" tickLine={false} axisLine={false} width={44} tick={axisTick} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'var(--surface-2)' }}
                      formatter={(value, name) => [`${Number(value).toLocaleString('zh-CN')} 字`, name === 'cumulative' ? '累计' : '当月']}
                    />
                    <Bar yAxisId="month" dataKey="writing" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="cum" dataKey="cumulative" stroke="var(--accent-2)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card stats-chart">
              <div className="card-head"><span className="card-title">英语学习时长（{year}）</span></div>
              <div className="card-body stats-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="stats-english-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-3)" stopOpacity={0.42} />
                        <stop offset="100%" stopColor="var(--accent-3)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis tickLine={false} axisLine={false} width={44} tick={axisTick} />
                    <Tooltip contentStyle={tooltipStyle} formatter={value => [`${Number(value).toFixed(1)} 小时`, '学习']} />
                    <Area dataKey="englishHours" stroke="var(--accent-3)" strokeWidth={2} fill="url(#stats-english-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card stats-chart">
              <div className="card-head"><span className="card-title">完成待办（{year}）</span></div>
              <div className="card-body stats-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart layout="vertical" data={months} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis type="category" dataKey="label" width={38} tickLine={false} axisLine={false} tick={axisTick} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} formatter={value => [`${value} 项`, '完成']} />
                    <Bar dataKey="todos" fill="var(--accent-2)" radius={[0, 3, 3, 0]} barSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card stats-chart">
              <div className="card-head">
                <span className="card-title">一周节奏（{year}）</span>
                <span className="stats-radar-legend">
                  <span><i style={{ background: 'var(--accent)' }} />写作</span>
                  <span><i style={{ background: 'var(--accent-2)' }} />待办</span>
                  <span><i style={{ background: 'var(--accent-3)' }} />英语</span>
                  <span><i style={{ background: 'var(--danger)' }} />复习</span>
                </span>
              </div>
              <div className="card-body stats-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={weeks} outerRadius="72%">
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="label" tick={axisTick} />
                    <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const point = payload[0]?.payload as WeekPoint | undefined
                        if (!point) return null
                        return (
                          <div className="stats-week-tip">
                            <strong>{label}</strong>
                            <span>写作 {point.writing.toLocaleString('zh-CN')} 字</span>
                            <span>待办 {point.todos} 项</span>
                            <span>英语 {point.englishHours.toFixed(1)} 小时</span>
                            <span>复习 {point.reviews} 次</span>
                          </div>
                        )
                      }}
                    />
                    <Radar dataKey="writingN" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.16} strokeWidth={2} />
                    <Radar dataKey="todosN" stroke="var(--accent-2)" fill="var(--accent-2)" fillOpacity={0.12} strokeWidth={2} />
                    <Radar dataKey="englishN" stroke="var(--accent-3)" fill="var(--accent-3)" fillOpacity={0.12} strokeWidth={2} />
                    <Radar dataKey="reviewsN" stroke="var(--danger)" fill="var(--danger)" fillOpacity={0.1} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
                <p className="stats-radar-note">各系列按周一至周日该项最大值归一，悬停看原始值。</p>
              </div>
            </section>
            <section className="card stats-chart">
              <div className="card-head">
                <span className="card-title">专注分钟（近 12 个月）</span>
                {focusMonths.covered === 0 && <span className="card-meta">该年份早于记录窗口，仅显示有数据的月份</span>}
              </div>
              <div className="card-body stats-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={focusMonths.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis tickLine={false} axisLine={false} width={44} tick={axisTick} />
                    <Tooltip contentStyle={tooltipStyle} formatter={value => [`${value} 分钟`, '专注']} />
                    <Line type="monotone" dataKey="minutes" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card stats-chart">
              <div className="card-head">
                <span className="card-title">年度活跃格（{year}）</span>
                <span className="card-meta">按当日活跃类别数分级：写作 / 待办 / 英语 / 复习 / 习惯</span>
              </div>
              <div className="card-body stats-chart-body">
                <div className="stats-heat" onMouseLeave={() => setHeatTip(null)}>
                  {heat.map(row => (
                    <div className="stats-heat-row" key={row.label}>
                      <span className="stats-heat-month">{row.label}</span>
                      <div className="stats-heat-cells">
                        {row.cells.map((cell, index) => (
                          <i
                            key={index}
                            className={`stats-heat-cell ${cell.level < 0 ? 'lvl-off' : `lvl-${cell.level}`}`}
                            onMouseEnter={() => showHeatDay(cell)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="stats-heat-tip" role="status">
                  {heatTip ? (
                    <>{heatTip.date} · {heatTip.text}</>
                  ) : (
                    <span className="stats-heat-legend">
                      少
                      <i className="stats-heat-cell lvl-0" />
                      <i className="stats-heat-cell lvl-1" />
                      <i className="stats-heat-cell lvl-2" />
                      <i className="stats-heat-cell lvl-3" />
                      <i className="stats-heat-cell lvl-4" />
                      多
                    </span>
                  )}
                </p>
              </div>
            </section>
            <section className="card stats-chart stats-page-time">
              <div className="card-head">
                <span className="card-title">页面停留（{year}）</span>
                {pageTimeError ? (
                  <span className="card-meta">停留记录读取失败：{pageTimeError}</span>
                ) : pageTime && pageTime.pages.length === 0 ? (
                  <span className="card-meta">从今天开始按页面累计</span>
                ) : null}
              </div>
              <div className="card-body stats-page-time-body">
                {pageItems.length > 0 ? (
                  <>
                    <BarList items={pageItems} compact label="页面停留排行" />
                    <div className="stats-page-time-monthly">
                      <span className="stats-page-time-sub">月度停留分钟</span>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pageMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                          <YAxis tickLine={false} axisLine={false} width={40} tick={axisTick} />
                          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} formatter={value => [`${value} 分钟`, '停留']} />
                          <Bar dataKey="minutes" fill="var(--accent-3)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <p className="stats-page-time-empty">暂无停留记录，日常使用工作台后这里会按页面累计停留时长。</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export default defineModule({
  id: 'stats',
  name: '统计',
  group: '工具',
  icon: TrendingUp,
  order: 55,
  keywords: ['统计', '报表', '趋势', '年度', 'stats'],
  page: StatsPage
})
