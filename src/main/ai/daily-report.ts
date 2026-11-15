import type { ChatMessage } from '@shared/types'
import { getDatabase } from '../db'
import { getJournalByDate } from '../db/repo/notes'
import { todoStats } from '../db/repo/todos'
import { chatComplete } from './client'

const MAX_ITEMS = 15

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 汇总指定本地日期的本地数据，交给已配置的 AI 生成一份回顾。 */
export async function generateDailyReport(date: string): Promise<string> {
  const db = getDatabase()
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const dayEnd = dayStart + 86_400_000
  const todosDone = db.prepare(
    'SELECT title FROM todos WHERE done = 1 AND done_at >= ? AND done_at < ? ORDER BY done_at ASC LIMIT ?'
  ).all(dayStart, dayEnd, MAX_ITEMS) as { title: string }[]
  const pending = todoStats()
  const focus = db.prepare(
    'SELECT COALESCE(SUM(minutes), 0) AS minutes FROM focus_sessions WHERE started_at >= ? AND started_at < ?'
  ).get(dayStart, dayEnd) as { minutes: number }
  const writing = db.prepare(
    'SELECT COALESCE(SUM(peak_words - baseline_words), 0) AS words FROM note_writing_daily WHERE date = ?'
  ).get(date) as { words: number }
  const habitRows = db.prepare(`
    SELECT h.name AS name, h.target AS target, COALESCE(l.count, 0) AS count
    FROM habits h LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = ?
    ORDER BY h.sort ASC`).all(date) as { name: string; target: number; count: number }[]
  const memories = db.prepare(
    'SELECT content FROM memories WHERE event_date = ? ORDER BY event_time DESC LIMIT 5'
  ).all(date) as { content: string }[]
  const journal = getJournalByDate(date)

  const lines: string[] = [`日期：${date}`]
  lines.push(todosDone.length
    ? `当天完成的待办：${todosDone.map(row => row.title).join('；')}`
    : '当天完成的待办：无')
  lines.push(`当前未完成待办 ${pending.pending} 项（逾期 ${pending.overdue}，今日到期 ${pending.dueToday}）`)
  lines.push(`专注时长：${focus.minutes} 分钟`)
  lines.push(`笔记与日记净增字数：${writing.words}`)
  if (habitRows.length) {
    const done = habitRows.filter(row => row.count >= row.target)
    const missed = habitRows.filter(row => row.count < row.target)
    lines.push(`习惯打卡：${done.length}/${habitRows.length} 达标${missed.length ? `，未达标：${missed.map(row => row.name).join('、')}` : ''}`)
  }
  if (journal?.content.trim()) lines.push(`当天日记摘录：${clip(journal.content.replace(/\s+/g, ' ').trim(), 160)}`)
  if (memories.length) lines.push(`当天纪念记录：${memories.map(row => clip(row.content.replace(/\s+/g, ' ').trim(), 40)).join('；')}`)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        '你是 WorkBase 的日报助手，根据用户给出的当日本地记录写一份简短的中文回顾。',
        '要求：Markdown 格式；先写一段两三句的总述，再分「完成」「专注与习惯」「值得跟进」三个小节，每节 1–3 条要点；',
        '只使用给定事实，不要编造；没有数据的方面直接省略，不要写套话和空洞的鼓励；全文不超过 400 字。'
      ].join('')
    },
    { role: 'user', content: lines.join('\n') }
  ]
  return chatComplete(messages, 0.4)
}
