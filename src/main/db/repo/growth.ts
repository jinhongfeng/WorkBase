import { randomUUID } from 'node:crypto'
import type { FocusStats, Habit, HabitInput, HabitWithLogs } from '@shared/types'
import { getDatabase } from '../index'

function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayKey(): string {
  return dayKey(Date.now())
}

interface HabitRow {
  id: string
  name: string
  icon: string
  color: string
  target: number
  sort: number
  created_at: number
}

export function listHabits(): HabitWithLogs[] {
  const db = getDatabase()
  const habits = db.prepare('SELECT * FROM habits ORDER BY sort ASC, created_at ASC').all() as HabitRow[]
  const since = Date.now() - 120 * 86400000
  const logs = db.prepare('SELECT habit_id, date, count FROM habit_logs WHERE date >= ?').all(dayKey(since)) as { habit_id: string; date: string; count: number }[]
  const grouped = new Map<string, Record<string, number>>()
  for (const log of logs) {
    const bucket = grouped.get(log.habit_id) ?? {}
    bucket[log.date] = log.count
    grouped.set(log.habit_id, bucket)
  }
  const today = todayKey()
  return habits.map(habit => {
    const map = grouped.get(habit.id) ?? {}
    const cursor = new Date()
    if (!map[dayKey(cursor.getTime())]) cursor.setDate(cursor.getDate() - 1)
    let streak = 0
    while (map[dayKey(cursor.getTime())] >= habit.target) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return {
      id: habit.id,
      name: habit.name,
      icon: habit.icon,
      color: habit.color,
      target: habit.target,
      sort: habit.sort,
      createdAt: habit.created_at,
      logs: map,
      streak,
      doneToday: map[today] ?? 0
    }
  })
}

export function createHabit(input: HabitInput): void {
  const db = getDatabase()
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS value FROM habits').get() as { value: number }
  db.prepare('INSERT INTO habits(id, name, icon, color, target, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), input.name.trim(), input.icon ?? '🌱', input.color ?? 'accent', input.target ?? 1, max.value + 1, Date.now())
}

export function removeHabit(id: string): void {
  getDatabase().prepare('DELETE FROM habits WHERE id = ?').run(id)
}

export function toggleHabit(id: string, date: string): void {
  const db = getDatabase()
  const row = db.prepare('SELECT count FROM habit_logs WHERE habit_id = ? AND date = ?').get(id, date) as { count: number } | undefined
  if (row && row.count > 0) db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(id, date)
  else db.prepare('INSERT INTO habit_logs(habit_id, date, count) VALUES (?, ?, 1) ON CONFLICT(habit_id, date) DO UPDATE SET count = 1').run(id, date)
}

/** 计数型打卡：写入指定次数，0 表示清除；超出目标次数的部分截断。 */
export function setHabitCount(id: string, date: string, count: number): void {
  const db = getDatabase()
  const habit = db.prepare('SELECT target FROM habits WHERE id = ?').get(id) as { target: number } | undefined
  if (!habit) return
  const clamped = Math.max(0, Math.min(habit.target, Math.floor(count)))
  if (clamped === 0) {
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(id, date)
    return
  }
  db.prepare('INSERT INTO habit_logs(habit_id, date, count) VALUES (?, ?, ?) ON CONFLICT(habit_id, date) DO UPDATE SET count = excluded.count')
    .run(id, date, clamped)
}

export function addFocusSession(minutes: number, label: string): FocusStats {
  getDatabase().prepare('INSERT INTO focus_sessions(id, minutes, label, started_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), minutes, label, Date.now())
  return focusStats()
}

/** 重命名一轮专注的主题；清空表示回到「未命名专注」。 */
export function renameFocusSession(id: string, label: string): FocusStats {
  getDatabase().prepare('UPDATE focus_sessions SET label = ? WHERE id = ?').run(label, id)
  return focusStats()
}

export function removeFocusSession(id: string): FocusStats {
  getDatabase().prepare('DELETE FROM focus_sessions WHERE id = ?').run(id)
  return focusStats()
}

export function focusStats(): FocusStats {
  const db = getDatabase()
  const days: FocusStats['days'] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    date.setHours(0, 0, 0, 0)
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    const row = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS minutes FROM focus_sessions WHERE started_at >= ? AND started_at < ?')
      .get(date.getTime(), next.getTime()) as { minutes: number }
    days.push({ date: dayKey(date.getTime()), minutes: row.minutes })
  }
  const total = db.prepare('SELECT COUNT(*) AS sessions, COALESCE(SUM(minutes), 0) AS minutes FROM focus_sessions').get() as { sessions: number; minutes: number }
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const today = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS minutes FROM focus_sessions WHERE started_at >= ?')
    .get(todayStart.getTime()) as { minutes: number }
  // 近 365 天：单次区间查询 + JS 按自然日聚合，避免逐日查询
  const yearStart = new Date(todayStart)
  yearStart.setDate(yearStart.getDate() - 364)
  const rows = db.prepare('SELECT started_at, minutes FROM focus_sessions WHERE started_at >= ?')
    .all(yearStart.getTime()) as { started_at: number; minutes: number }[]
  const buckets = new Map<string, number>()
  for (const row of rows) {
    const key = dayKey(row.started_at)
    buckets.set(key, (buckets.get(key) ?? 0) + row.minutes)
  }
  const year: FocusStats['year'] = []
  for (let offset = 364; offset >= 0; offset -= 1) {
    const time = todayStart.getTime() - offset * 86400000
    const key = dayKey(time)
    year.push({ date: key, minutes: buckets.get(key) ?? 0 })
  }
  const recentRows = db.prepare('SELECT id, label, minutes, started_at FROM focus_sessions ORDER BY started_at DESC LIMIT 5')
    .all() as { id: string; label: string; minutes: number; started_at: number }[]
  return {
    todayMinutes: today.minutes,
    weekMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
    totalSessions: total.sessions,
    days,
    year,
    recent: recentRows.map(row => ({ id: row.id, minutes: row.minutes, label: row.label, startedAt: row.started_at }))
  }
}

export type { Habit }
