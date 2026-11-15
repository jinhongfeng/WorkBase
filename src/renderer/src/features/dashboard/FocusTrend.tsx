import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FocusStats } from '@shared/types'

function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

function FocusTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; minutes: number } }> }) {
  const day = active ? payload?.[0]?.payload : undefined
  if (!day) return null
  return <div className="home-chart-tip">{day.date} · {day.minutes} 分钟</div>
}

export default function FocusTrend({ stats, loading }: { stats: FocusStats | null; loading: boolean }) {
  const [range, setRange] = useState<7 | 30>(30)
  const days = stats ? (range === 7 ? stats.days : stats.year.slice(-30)) : []
  const total = days.reduce((sum, day) => sum + day.minutes, 0)
  const max = Math.max(0, ...days.map(day => day.minutes))
  const step = Math.max(5, Math.ceil(max / 20) * 5)
  const ticks = [0, step, step * 2, step * 3, step * 4]
  const dates = (range === 7 ? [0, 2, 4, 6] : [0, 7, 14, 21, 29]).map(index => days[index]?.date).filter(Boolean)

  return (
    <section className="home-panel home-focus">
      <div className="home-panel-head">
        <h2>专注趋势</h2>
        <div className="home-range" role="group" aria-label="专注统计范围">
          <button type="button" aria-pressed={range === 7} onClick={() => setRange(7)}>7 天</button>
          <button type="button" aria-pressed={range === 30} onClick={() => setRange(30)}>30 天</button>
        </div>
      </div>
      {stats && (
        <>
          <div className="home-focus-summary">
            <p><strong>{total.toLocaleString('zh-CN')}</strong><span>分钟</span></p>
            <span className="home-subtle">近 {range} 天累计 · 今日 {stats.todayMinutes} 分钟</span>
          </div>
          <div className="home-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" ticks={dates} interval={0} tickFormatter={shortDate} tick={{ fill: 'var(--text-2)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis domain={[0, step * 4]} ticks={ticks} interval={0} allowDecimals={false} tick={{ fill: 'var(--text-2)', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<FocusTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="minutes" name="专注分钟" fill="var(--home-chart-fill)" maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {!stats && <p className="home-subtle home-section-message">{loading ? '正在读取专注记录…' : '无法读取专注记录。'}</p>}
    </section>
  )
}
