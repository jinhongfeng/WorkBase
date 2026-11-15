import type { ActivityDay, ActivitySource, ActivityYear, NoteStats } from '@shared/types'
import { getDatabase } from '../index'

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 同一天按正文最高字数相对于首次保存前的净增长计数，重复保存和删后重写不累加。 */
export function recordNoteWriting(id: string, before: number, after: number, now: number): void {
  getDatabase().prepare(`
    INSERT INTO note_writing_daily(date, note_id, baseline_words, peak_words) VALUES (?, ?, ?, ?)
    ON CONFLICT(date, note_id) DO UPDATE SET peak_words = MAX(peak_words, excluded.peak_words)
  `).run(dayKey(new Date(now)), id, before, Math.max(before, after))
}

export function noteWritingStats(now: Date): Pick<NoteStats, 'words' | 'todayWords' | 'writingDays'> {
  const db = getDatabase()
  const dates = Array.from({ length: 7 }, (_, index) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index)))
  const today = dates[6]
  const { words } = db.prepare('SELECT COALESCE(SUM(peak_words - baseline_words), 0) AS words FROM note_writing_daily')
    .get() as { words: number }
  const rows = db.prepare(`
    SELECT date, SUM(peak_words - baseline_words) AS words FROM note_writing_daily
    WHERE date BETWEEN ? AND ? GROUP BY date
  `).all(dates[0], today) as NoteStats['writingDays']
  const byDate = new Map(rows.map(row => [row.date, row.words]))
  return {
    words,
    todayWords: byDate.get(today) ?? 0,
    writingDays: dates.map(date => ({ date, words: byDate.get(date) ?? 0 }))
  }
}

/** 按本地自然日切分跨午夜学习片段。 */
export function recordIeltsStudy(start: number, end: number): void {
  const db = getDatabase()
  const insert = db.prepare(`INSERT INTO ielts_study_daily(date, milliseconds) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET milliseconds = milliseconds + excluded.milliseconds`)
  db.transaction(() => {
    let cursor = start
    while (cursor < end) {
      const date = new Date(cursor)
      const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
      const until = Math.min(end, boundary)
      insert.run(dayKey(date), until - cursor)
      cursor = until
    }
  })()
}

export function activityYear(year: number, sources: ActivitySource[]): ActivityYear {
  const db = getDatabase()
  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)
  const first = dayKey(start)
  const last = dayKey(end)
  const days = new Map<string, ActivityDay>()
  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const date = dayKey(cursor)
    days.set(date, { date, noteWords: 0, ieltsMilliseconds: 0, ieltsReviews: 0, todosCompleted: 0, habitCheckins: 0 })
  }
  type TotalRow = { date: string; value: number }
  const merge = (sql: string, params: (number | string)[], field: keyof Omit<ActivityDay, 'date'>): void => {
    for (const row of db.prepare(sql).all(...params) as TotalRow[]) {
      const day = days.get(row.date)
      if (day) day[field] = row.value
    }
  }
  if (sources.includes('notes')) merge(`SELECT date, SUM(peak_words - baseline_words) AS value
    FROM note_writing_daily WHERE date >= ? AND date < ? GROUP BY date`, [first, last], 'noteWords')
  if (sources.includes('ielts')) {
    merge('SELECT date, milliseconds AS value FROM ielts_study_daily WHERE date >= ? AND date < ?', [first, last], 'ieltsMilliseconds')
    merge(`SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS date, COUNT(*) AS value
      FROM ielts_reviews WHERE reviewed_at >= ? AND reviewed_at < ? GROUP BY date`, [start.getTime(), end.getTime()], 'ieltsReviews')
  }
  if (sources.includes('todos')) merge(`SELECT date(done_at / 1000, 'unixepoch', 'localtime') AS date, COUNT(*) AS value
    FROM todos WHERE done = 1 AND done_at >= ? AND done_at < ? GROUP BY date`, [start.getTime(), end.getTime()], 'todosCompleted')
  if (sources.includes('habits')) merge(`SELECT date, COUNT(*) AS value FROM habit_logs
    WHERE date >= ? AND date < ? AND count > 0 GROUP BY date`, [first, last], 'habitCheckins')
  const tracking = db.prepare('SELECT started_at FROM activity_tracking WHERE id = 1').get() as { started_at: number }
  return { year, trackingSince: dayKey(new Date(tracking.started_at)), sources, days: [...days.values()] }
}
