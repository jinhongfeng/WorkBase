import { randomUUID } from 'node:crypto'
import type { IeltsItem, IeltsReading, IeltsSet, IeltsStats } from '@shared/types'
import { getDatabase } from '../index'
import { fail } from '../../ipc/errors'

const DAY = 86400000
const INTERVALS = [0.25, 0.5, 1, 2, 4, 8, 16]

interface ItemRow {
  id: string
  set_id: string
  kind: string
  term: string
  phonetic: string
  pos: string
  meaning: string
  example: string
  translation: string
  collocation: string
  word_family: string
  band: string
  mastery: number
  wrong: number
  review_at: number
  created_at: number
}

function toItem(row: ItemRow): IeltsItem {
  return {
    id: row.id,
    setId: row.set_id,
    kind: row.kind === 'sentence' ? 'sentence' : 'word',
    term: row.term,
    phonetic: row.phonetic,
    pos: row.pos,
    meaning: row.meaning,
    example: row.example,
    translation: row.translation,
    collocation: row.collocation,
    wordFamily: row.word_family,
    band: row.band,
    mastery: row.mastery,
    wrong: row.wrong,
    reviewAt: row.review_at,
    createdAt: row.created_at
  }
}

export function listSets(): IeltsSet[] {
  const rows = getDatabase().prepare(`
    SELECT s.id, s.title, s.topic, s.level, s.created_at, s.reading IS NOT NULL AS has_reading,
           COUNT(i.id) AS item_count, SUM(CASE WHEN i.mastery >= 4 THEN 1 ELSE 0 END) AS mastered
    FROM ielts_sets s LEFT JOIN ielts_items i ON i.set_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC
  `).all() as { id: string; title: string; topic: string; level: string; created_at: number; item_count: number; mastered: number | null; has_reading: number }[]
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    topic: row.topic,
    level: row.level,
    createdAt: row.created_at,
    itemCount: row.item_count,
    mastered: row.mastered ?? 0,
    hasReading: Boolean(row.has_reading)
  }))
}

export function getReading(setId: string): IeltsReading | null {
  const row = getDatabase().prepare('SELECT reading FROM ielts_sets WHERE id = ?')
    .get(setId) as { reading: string | null } | undefined
  return row?.reading ? JSON.parse(row.reading) as IeltsReading : null
}

export function listItems(setId?: string): IeltsItem[] {
  const db = getDatabase()
  const rows = setId
    ? db.prepare('SELECT * FROM ielts_items WHERE set_id = ? ORDER BY created_at ASC').all(setId)
    : db.prepare('SELECT * FROM ielts_items ORDER BY review_at ASC, created_at DESC LIMIT 500').all()
  return (rows as ItemRow[]).map(toItem)
}

export function getItem(id: string): IeltsItem {
  const row = getDatabase().prepare('SELECT * FROM ielts_items WHERE id = ?').get(id) as ItemRow | undefined
  if (!row) fail('IELTS_ITEM_MISSING', '这条学习内容已不存在，请刷新后重试。')
  return toItem(row)
}

export interface NewItemInput {
  kind: 'word' | 'sentence'
  term: string
  phonetic: string
  pos: string
  meaning: string
  example: string
  translation: string
  collocation: string
  wordFamily?: string
  band: string
}

export function createSet(title: string, topic: string, level: string, items: NewItemInput[], reading?: IeltsReading): { setId: string; items: IeltsItem[] } {
  const db = getDatabase()
  const setId = randomUUID()
  const now = Date.now()
  const insert = db.prepare(`
    INSERT INTO ielts_items(id, set_id, kind, term, phonetic, pos, meaning, example, translation, collocation, band, word_family, mastery, wrong, review_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `)
  db.transaction(() => {
    db.prepare('INSERT INTO ielts_sets(id, title, topic, level, created_at, reading) VALUES (?, ?, ?, ?, ?, ?)')
      .run(setId, title, topic, level, now, reading ? JSON.stringify(reading) : null)
    for (const item of items) {
      insert.run(randomUUID(), setId, item.kind, item.term, item.phonetic, item.pos, item.meaning, item.example, item.translation, item.collocation, item.band, item.wordFamily ?? '', now, now)
    }
  })()
  return { setId, items: listItems(setId) }
}

export function reviewItem(id: string, known: boolean): IeltsItem {
  const db = getDatabase()
  const item = getItem(id)
  const mastery = known ? Math.min(6, item.mastery + 1) : Math.max(0, item.mastery - 1)
  const nextAt = Date.now() + INTERVALS[Math.min(mastery, INTERVALS.length - 1)] * DAY
  db.transaction(() => {
    db.prepare('UPDATE ielts_items SET mastery = ?, wrong = wrong + ?, review_at = ? WHERE id = ?')
      .run(mastery, known ? 0 : 1, nextAt, id)
    db.prepare('INSERT INTO ielts_reviews(item_id, known, reviewed_at) VALUES (?, ?, ?)').run(id, known ? 1 : 0, Date.now())
  })()
  return getItem(id)
}

export function removeSet(id: string): void {
  getDatabase().prepare('DELETE FROM ielts_sets WHERE id = ?').run(id)
}

function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function ieltsStats(): IeltsStats {
  const db = getDatabase()
  const now = Date.now()
  const totals = db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN mastery >= 4 THEN 1 ELSE 0 END) AS mastered, SUM(CASE WHEN review_at <= ? THEN 1 ELSE 0 END) AS due FROM ielts_items').get(now) as { total: number; mastered: number | null; due: number | null }
  const reviewedDays = new Set(
    (db.prepare('SELECT reviewed_at FROM ielts_reviews ORDER BY reviewed_at DESC LIMIT 5000').all() as { reviewed_at: number }[])
      .map(row => dayKey(row.reviewed_at))
  )
  let streak = 0
  const cursor = new Date()
  if (!reviewedDays.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (reviewedDays.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  const todayStart = new Date()

  todayStart.setHours(0, 0, 0, 0)
  const todayReviewed = db.prepare('SELECT COUNT(*) AS value FROM ielts_reviews WHERE reviewed_at >= ?')
    .get(todayStart.getTime()) as { value: number }
  return {
    total: totals.total,
    mastered: totals.mastered ?? 0,
    due: totals.due ?? 0,
    streak,
    todayReviewed: todayReviewed.value
  }
}
