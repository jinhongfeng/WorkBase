import { useState } from 'react'
import { CalendarClock, CheckCircle2, CircleAlert, ListTodo } from 'lucide-react'
import { addDays } from 'date-fns'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Todo } from '@shared/types'
import { todayKey } from '../../lib/utils'

interface TodoChartProps {
  todos: Todo[] | null
  today: string
  loading: boolean
}

const tick = { fill: 'var(--text-2)', fontSize: 11 }

export function TodoOverview({ todos, today, loading }: TodoChartProps) {
  const pending = todos?.filter(todo => !todo.done) ?? []
  const metrics = [
    { label: '未完成', value: pending.length, icon: ListTodo, tone: 'accent' },
    { label: '今日到期', value: pending.filter(todo => todo.dueDate === today).length, icon: CalendarClock, tone: 'accent-3' },
    { label: '已逾期', value: pending.filter(todo => todo.dueDate && todo.dueDate < today).length, icon: CircleAlert, tone: 'danger' },
    { label: '今日完成', value: todos?.filter(todo => todo.done && todo.doneAt !== null && todayKey(new Date(todo.doneAt)) === today).length ?? 0, icon: CheckCircle2, tone: 'success' }
  ]

  return (
    <section className="home-panel home-insight">
      <div className="home-panel-head"><h2>待办概览</h2></div>
      {todos ? (
        <dl className="home-metrics">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="home-metric" data-tone={tone}>
              <dt><Icon size={15} aria-hidden="true" />{label}</dt>
              <dd>{value.toLocaleString('zh-CN')}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="home-insight-status" role="status">{loading ? '正在读取待办…' : '无法读取待办。'}</p>}
    </section>
  )
}

export function TodoCompletion({ todos, today, loading }: TodoChartProps) {
  const [range, setRange] = useState<7 | 30>(7)
  const days = Array.from({ length: range }, (_, index) => ({
    date: todayKey(addDays(new Date(`${today}T12:00:00`), index - range + 1)), count: 0
  }))
  const byDate = new Map(days.map(day => [day.date, day]))
  let total = 0
  for (const todo of todos ?? []) {
    if (!todo.done || todo.doneAt === null) continue
    const day = byDate.get(todayKey(new Date(todo.doneAt)))
    if (day) {
      day.count += 1
      total += 1
    }
  }

  return (
    <section className="home-panel home-insight">
      <div className="home-panel-head">
        <h2>待办完成趋势</h2>
        <div className="home-range" role="group" aria-label="待办完成统计范围">
          <button type="button" aria-pressed={range === 7} onClick={() => setRange(7)}>7 天</button>
          <button type="button" aria-pressed={range === 30} onClick={() => setRange(30)}>30 天</button>
        </div>
      </div>
      {total > 0 ? (
        <>
          <p className="home-insight-context">近 {range} 天累计完成 <strong>{total.toLocaleString('zh-CN')}</strong> 项</p>
          <div className="home-insight-plot">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 8, right: 20, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border-strong)" strokeDasharray="3 4" />
                <XAxis dataKey="date" tick={tick} tickFormatter={date => date.slice(5).replace('-', '/')} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis tick={tick} domain={[0, 'dataMax + 1']} allowDecimals={false} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }} itemStyle={{ color: 'var(--text)' }} formatter={value => [`${value} 项`, '完成']} />
                <Area type="linear" dataKey="count" stroke="var(--accent)" strokeWidth={2} fill="var(--accent-soft)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="home-insight-status" role="status">
          {todos ? `近 ${range} 天暂无已完成的待办。` : loading ? '正在读取待办…' : '无法读取待办。'}
        </p>
      )}
    </section>
  )
}
