import { randomUUID } from 'node:crypto'
import type { Note, NotePage, NoteQuery, NoteSaveInput, NoteStats, NoteSummary } from '@shared/types'
import { fail } from '../../ipc/errors'
import { getDatabase } from '../index'
import { dayKey, noteWritingStats, recordNoteWriting } from './activity'

interface NoteRow {
  id: string
  title: string
  content: string
  tags: string
  pinned: number
  archived: number
  kind: string
  journal_date: string | null
  folder_id: string | null
  created_at: number
  updated_at: number
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    pinned: row.pinned,
    archived: row.archived,
    kind: row.kind === 'journal' ? 'journal' : 'note',
    journalDate: row.journal_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function excerpt(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 96 ? `${plain.slice(0, 96)}…` : plain
}

function wordCount(content: string): number {
  const plain = content.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
  const cjk = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = plain.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9']+/g)?.length ?? 0
  return cjk + latin
}

function deriveTitle(content: string): string {
  const line = content.split('\n').map(item => item.replace(/^#+\s*/, '').replace(/<\/?(?:img|div)\b[^>]*>/gi, '').trim()).find(Boolean)
  return (line ?? '').slice(0, 60) || '无标题笔记'
}

function noteFilters(query: NoteQuery): { clause: string; params: unknown[] } {
  const conditions = ['archived = 0']
  const params: unknown[] = []
  if (query.kind && query.kind !== 'all') { conditions.push('kind = ?'); params.push(query.kind) }
  if (query.pinnedOnly) conditions.push('pinned = 1')
  if (query.query?.trim()) {
    const like = `%${query.query.trim()}%`
    conditions.push('(title LIKE ? OR content LIKE ? OR tags LIKE ? OR folder_id IN (SELECT id FROM note_folders WHERE name LIKE ?))')
    params.push(like, like, like, like)
  }
  return { clause: conditions.join(' AND '), params }
}

function queryLimit(query: NoteQuery): number {
  return Math.min(Math.max(query.limit ?? 300, 1), 1000)
}

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title || deriveTitle(row.content),
    excerpt: excerpt(row.content),
    tags: row.tags,
    pinned: row.pinned,
    kind: row.kind === 'journal' ? 'journal' : 'note',
    journalDate: row.journal_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    words: wordCount(row.content)
  }
}

export function listNotes(query: NoteQuery): NoteSummary[] {
  const { clause, params } = noteFilters(query)
  const rows = getDatabase()
    .prepare(`SELECT * FROM notes WHERE ${clause} ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, queryLimit(query), query.offset ?? 0) as NoteRow[]
  return rows.map(toSummary)
}

/** 回收站：只列已归档笔记，标题与时间倒序，上限 500 条。 */
export function listTrashNotes(): NoteSummary[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM notes WHERE archived = 1 ORDER BY updated_at DESC LIMIT 500')
    .all() as NoteRow[]
  return rows.map(toSummary)
}

export function listNotePage(query: NoteQuery): NotePage {
  const { clause, params } = noteFilters(query)
  const { total } = getDatabase().prepare(`SELECT COUNT(*) AS total FROM notes WHERE ${clause}`).get(...params) as { total: number }
  const limit = queryLimit(query)
  const lastOffset = Math.max(0, Math.floor((total - 1) / limit) * limit)
  const offset = Math.min(query.offset ?? 0, lastOffset)
  return { items: listNotes({ ...query, offset }), total, offset }
}

export function getNote(id: string): Note | null {
  const row = getDatabase().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
  return row ? toNote(row) : null
}

export function getJournalByDate(date: string): Note | null {
  const row = getDatabase().prepare('SELECT * FROM notes WHERE journal_date = ? AND archived = 0').get(date) as NoteRow | undefined
  return row ? toNote(row) : null
}

export function saveNote(input: NoteSaveInput): Note {
  const db = getDatabase()
  const now = Date.now()
  const title = input.title.trim() || deriveTitle(input.content)
  const tags = input.tags.join(',')
  const existing = input.id
    ? getNote(input.id)
    : input.kind === 'journal' && input.journalDate
      ? getJournalByDate(input.journalDate)
      : null

  if (input.id && !existing) fail('NOTE_NOT_FOUND', '这条笔记已被删除。')
  if (existing) {
    // 打开今日日记时，空白的新建请求不能覆盖已经写入的日记。
    if (!input.id && !input.content) return existing
    db.transaction(() => {
      db.prepare('UPDATE notes SET title = ?, content = ?, tags = ?, kind = ?, journal_date = ?, updated_at = ? WHERE id = ?')
        .run(title, input.content, tags, input.kind, input.kind === 'journal' ? input.journalDate ?? existing.journalDate : null, now, existing.id)
      recordNoteWriting(existing.id, wordCount(existing.content), wordCount(input.content), now)
    })()
    return getNote(existing.id) as Note
  }

  const id = randomUUID()
  // 日记按日期唯一：同日期的日记在回收站里时阻止新建，避免唯一索引报错。
  if (input.kind === 'journal' && input.journalDate
    && getDatabase().prepare('SELECT 1 FROM notes WHERE journal_date = ? AND archived = 1').pluck().get(input.journalDate)) {
    fail('NOTE_JOURNAL_IN_TRASH', '该日期的日记在回收站中，请先恢复后再写。')
  }
  db.transaction(() => {
    db.prepare('INSERT INTO notes(id, title, content, tags, pinned, archived, kind, journal_date, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)')
      .run(id, title, input.content, tags, input.kind, input.kind === 'journal' ? input.journalDate ?? null : null, now, now)
    recordNoteWriting(id, 0, wordCount(input.content), now)
  })()
  return getNote(id) as Note
}

export function removeNote(id: string): void {
  getDatabase().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function archiveNote(id: string): void {
  getDatabase().prepare('UPDATE notes SET archived = 1, updated_at = ? WHERE id = ? AND archived = 0').run(Date.now(), id)
}

export function restoreNote(id: string): void {
  getDatabase().prepare('UPDATE notes SET archived = 0, updated_at = ? WHERE id = ? AND archived = 1').run(Date.now(), id)
}

export function toggleNotePin(id: string): void {
  getDatabase().prepare('UPDATE notes SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function noteStats(): NoteStats {
  const db = getDatabase()
  const now = new Date()
  const totals = db.prepare("SELECT COUNT(*) AS total, SUM(kind = 'journal') AS journals FROM notes WHERE archived = 0")
    .get() as { total: number; journals: number | null }
  const monthStart = dayKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const monthEnd = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  const journalDays = db.prepare(`
    SELECT journal_date FROM notes
    WHERE kind = 'journal' AND archived = 0 AND journal_date >= ? AND journal_date < ?
    ORDER BY journal_date
  `).pluck().all(monthStart, monthEnd) as string[]
  return {
    total: totals.total,
    journals: totals.journals ?? 0,
    ...noteWritingStats(now),
    journalDays
  }
}
