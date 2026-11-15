import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flame, Plus, Sprout, Trash2 } from 'lucide-react'
import type { HabitWithLogs } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Meter } from '../../components/ui/Meter'
import { EmptyState } from '../../components/ui/EmptyState'
import { humanError, todayKey } from '../../lib/utils'
import './habits.css'

const EMOJIS = [
  { icon: '🌱', label: '幼苗' },
  { icon: '📖', label: '阅读' },
  { icon: '🏃', label: '跑步' },
  { icon: '🧘', label: '冥想' },
  { icon: '💧', label: '喝水' },
  { icon: '✍️', label: '写字' },
  { icon: '🌙', label: '月亮' }
]

const HABIT_COLORS: { key: string; label: string }[] = [
  { key: 'accent', label: '青绿' },
  { key: 'accent-2', label: '琥珀' },
  { key: 'accent-3', label: '紫' },
  { key: 'success', label: '绿' },
  { key: 'danger', label: '红' }
]

function lastDays(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - index))
    return todayKey(date)
  })
}

function HabitsPage() {
  const [habits, setHabits] = useState<HabitWithLogs[]>([])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0].icon)
  const [target, setTarget] = useState(1)
  const [color, setColor] = useState(HABIT_COLORS[0].key)
  const [deleting, setDeleting] = useState<HabitWithLogs | null>(null)
  const [removing, setRemoving] = useState(false)
  const [checkBurst, setCheckBurst] = useState<{ id: string; date: string } | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const days = useMemo(() => lastDays(14), [])

  const load = useCallback(async () => {
    try { setHabits(await window.api.habits.list()) }
    catch (error) { window.toast.error(humanError(error)) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (habits.length === 0) nameInput.current?.focus()
  }, [habits.length])
  useEffect(() => {
    if (!checkBurst) return
    const timer = window.setTimeout(() => setCheckBurst(null), 180)
    return () => window.clearTimeout(timer)
  }, [checkBurst])

  const add = async (): Promise<void> => {
    if (!name.trim()) return
    try {
      setHabits(await window.api.habits.create({ name: name.trim(), icon: emoji, color, target }))
      setName('')
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  /** 目标为 1 时点击在打卡/取消间切换；大于 1 时点击累加次数，达到目标后再次点击清零。 */
  const toggle = async (habit: HabitWithLogs, date: string): Promise<void> => {
    try {
      const count = habit.logs[date] ?? 0
      const updated = habit.target > 1
        ? await window.api.habits.setCount({ id: habit.id, date, count: count >= habit.target ? 0 : count + 1 })
        : await window.api.habits.toggle({ id: habit.id, date })
      setHabits(updated)
      const completed = (updated.find(item => item.id === habit.id)?.logs[date] ?? 0) >= habit.target
      const animate = completed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setCheckBurst(animate ? { id: habit.id, date } : null)
    } catch (error) { window.toast.error(humanError(error)) }
  }

  const remove = async (): Promise<void> => {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await window.api.habits.remove(deleting.id)
      setHabits(current => current.filter(habit => habit.id !== deleting.id))
      setDeleting(null)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setRemoving(false)
    }
  }

  const today = todayKey()
  const bestStreak = Math.max(0, ...habits.map(habit => habit.streak))
  const doneToday = habits.filter(habit => habit.doneToday >= habit.target).length
  const checks14 = habits.reduce(
    (sum, habit) => sum + days.filter(day => (habit.logs[day] ?? 0) >= habit.target).length,
    0
  )

  return (
    <div className="page habits-page">
      <PageHeader
        title="习惯"
      />

      <div className="stat-grid stagger-in">
        <article className="stat-card">
          <span className="stat-label">今日完成</span>
          <strong className="stat-value">{doneToday}<small>/ {habits.length} 项</small></strong>
          <Meter
            value={doneToday}
            max={Math.max(1, habits.length)}
            ariaLabel="今日打卡进度"
            valueText={`今日打卡 ${doneToday} 项，共 ${habits.length} 项`}
          />
        </article>
        <StatCard label="最长连续" value={bestStreak} unit="天" />
        <StatCard label="近 14 天打卡" value={checks14} unit="次" />
      </div>

      <section className="card habit-compose-card">
        <div className="card-head">
          <span className="card-title">新建习惯</span>
        </div>
        <div className="card-body">
          <div className="habit-compose">
            <div className="field habit-name-field">
              <label htmlFor="habit-name">新习惯</label>
              <input
                id="habit-name"
                ref={nameInput}
                className="input"
                placeholder="例如读 20 页书"
                value={name}
                maxLength={40}
                onChange={event => setName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void add() }}
              />
            </div>
            <fieldset className="habit-icon-field">
              <legend>图标</legend>
              <div className="habit-icon-grid">
                {EMOJIS.map(item => (
                  <label className="habit-icon-option" key={item.icon} title={item.label}>
                    <input type="radio" name="habit-icon" value={item.icon} checked={emoji === item.icon}
                      aria-label={item.label} onChange={() => setEmoji(item.icon)} />
                    <span aria-hidden="true">{item.icon}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field habit-target-field">
              <label htmlFor="habit-target">每日目标</label>
              <input id="habit-target" className="input num" type="number" min={1} max={20} value={target}
                onChange={event => setTarget(Math.max(1, Math.min(20, event.target.valueAsNumber || 1)))} />
            </div>
            <fieldset className="habit-color-field">
              <legend>颜色</legend>
              <div className="habit-color-row">
                {HABIT_COLORS.map(item => (
                  <label key={item.key} className="habit-color-option" title={item.label}>
                    <input type="radio" name="habit-color" checked={color === item.key}
                      aria-label={item.label} onChange={() => setColor(item.key)} />
                    <span data-color={item.key} aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="button primary habit-add" disabled={!name.trim()} onClick={() => void add()}><Plus size={13} />添加</button>
          </div>
          <span className="kbd-hint habit-kbd"><kbd>Enter</kbd> 添加</span>
        </div>
      </section>

      {habits.length === 0 ? (
        <EmptyState icon={Sprout} title="还没有习惯" description="在上方命名一个习惯，开始每日打卡。" />
      ) : (
        <section className="card habits-log" aria-label="打卡记录">
          <div className="card-head">
            <span className="card-title">最近 14 天</span>
            <span className="card-meta">点日期打卡或取消</span>
          </div>
          <div className="card-body tight">
            <div className="habit-date-heading" aria-hidden="true">
              <span>习惯</span>
              <div className="habit-grid">{days.map(day => <span key={day} className={day === today ? 'today' : undefined}>
                {day === today ? '今天' : `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`}
              </span>)}</div>
              <span>连续打卡</span>
            </div>
            {habits.map(habit => (
              <div className="habit-row" key={habit.id} data-habit-color={habit.color}>
                <div className="habit-name">
                  <span className="habit-emoji">{habit.icon || '🌱'}</span>
                  <strong>{habit.name}</strong>
                </div>
                <div className="habit-grid">
                  {days.map(day => {
                    const count = habit.logs[day] ?? 0
                    const completed = count >= habit.target
                    const partial = !completed && count > 0
                    const dayLabel = `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`
                    return (
                      <button
                        key={day}
                        className={`habit-cell ${completed ? 'on' : ''} ${day === today ? 'today' : ''}`}
                        data-partial={partial || undefined}
                        aria-label={`${habit.name} ${dayLabel}${day === today ? '（今天）' : ''}${habit.target > 1 ? ` · ${count}/${habit.target}` : ''}`}
                        aria-pressed={completed}
                        title={`${dayLabel} · ${habit.target > 1 ? `${count}/${habit.target}` : completed ? '已打卡' : '未打卡'}`}
                        onClick={() => void toggle(habit, day)}
                      >
                        {completed
                          ? <Check size={13} aria-hidden="true" />
                          : partial ? <span aria-hidden="true">{count}</span>
                            : day === today ? <span className="habit-today-dot" aria-hidden="true" /> : null}
                        {completed && checkBurst?.id === habit.id && checkBurst.date === day && (
                          <span className="habit-check-burst" aria-hidden="true"><i /><i /><i /><i /></span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="habit-actions">
                  {habit.streak > 0 && <span className="habit-streak"><Flame size={11} />{habit.streak} 天</span>}
                  <button className="icon-action danger" title="删除习惯" aria-label={`删除 ${habit.name}`} onClick={() => setDeleting(habit)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <ConfirmDialog open={deleting !== null} title="删除习惯？" confirmLabel="删除习惯"
        description={`「${deleting?.name ?? ''}」和它的打卡记录将一并删除。`}
        loading={removing} onClose={() => { if (!removing) setDeleting(null) }} onConfirm={() => void remove()} />
    </div>
  )
}

export default defineModule({
  id: 'habits',
  name: '习惯',
  group: '工具',
  icon: Sprout,
  order: 58,
  defaultPinned: false,
  keywords: ['habit', '习惯', '打卡', 'streak'],
  page: HabitsPage
})
