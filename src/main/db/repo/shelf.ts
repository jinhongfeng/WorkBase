import { randomUUID } from 'node:crypto'
import type { ShelfItem, ShelfKind, ShelfQuery, ShelfStats, ShelfStatus } from '@shared/shelf'
import { SHELF_LIMIT } from '@shared/shelf'
import { getDatabase } from '../index'
import { dayKey } from './activity'

interface ShelfRow {
  id: string
  kind: string
  title: string
  creator: string
  status: string
  rating: number | null
  comment: string
  cover_file: string | null
  start_date: string | null
  finish_date: string | null
  created_at: number
  updated_at: number
}

function toItem(row: ShelfRow): ShelfItem {
  return {
    id: row.id,
    kind: row.kind as ShelfKind,
    title: row.title,
    creator: row.creator,
    status: row.status as ShelfStatus,
    rating: row.rating,
    comment: row.comment,
    coverUrl: row.cover_file ? `wb-asset://shelf-covers/${row.cover_file}` : null,
    startDate: row.start_date,
    finishDate: row.finish_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const KINDS = new Set<ShelfKind>(['book', 'movie', 'tv'])
const STATUSES = new Set<ShelfStatus>(['wish', 'doing', 'done'])

export function listShelf(query: ShelfQuery): ShelfItem[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: string[] = []
  if (query.kind && query.kind !== 'all' && KINDS.has(query.kind)) {
    conditions.push('kind = ?')
    params.push(query.kind)
  }
  if (query.status && query.status !== 'all' && STATUSES.has(query.status)) {
    conditions.push('status = ?')
    params.push(query.status)
  }
  const keyword = query.q?.trim()
  if (keyword) {
    conditions.push(`(title LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\')`)
    const like = `%${keyword.replace(/[\\%_]/g, matched => `\\${matched}`)}%`
    params.push(like, like)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM shelf_items ${where}
    ORDER BY updated_at DESC LIMIT ?`).all(...params, SHELF_LIMIT) as ShelfRow[]
  return rows.map(toItem)
}

export function shelfStats(): ShelfStats {
  const row = getDatabase().prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(status = 'wish'), 0) AS wish,
           COALESCE(SUM(status = 'doing'), 0) AS doing,
           COALESCE(SUM(status = 'done'), 0) AS done
    FROM shelf_items
  `).get() as ShelfStats
  return row
}

function getShelfRow(id: string): ShelfRow | undefined {
  return getDatabase().prepare('SELECT * FROM shelf_items WHERE id = ?').get(id) as ShelfRow | undefined
}

export function saveShelf(input: {
  id?: string
  kind: ShelfKind
  title: string
  creator?: string
  status: ShelfStatus
  rating?: number | null
  comment?: string
  startDate?: string | null
  finishDate?: string | null
  keepCover: string | null
  newCover?: string | null
}): { item: ShelfItem; removedCover: string | null } {
  const db = getDatabase()
  const previous = input.id ? getShelfRow(input.id) : undefined
  if (input.id && !previous) throw new Error('SHELF_NOT_FOUND')
  // keepCover 必须仍属于本条，防止并发编辑串条。
  if (input.keepCover && previous?.cover_file !== input.keepCover) throw new Error('SHELF_COVER_CHANGED')
  const now = Date.now()
  const id = previous?.id ?? randomUUID()
  const oldCover = previous?.cover_file ?? null
  const coverFile = input.newCover ?? (input.keepCover ? previous?.cover_file ?? null : null)
  // 标记为已完成时自动补完成日期；已手填的不覆盖。
  const finishDate = input.status === 'done'
    ? input.finishDate ?? previous?.finish_date ?? dayKey(new Date(now))
    : input.finishDate ?? previous?.finish_date ?? null
  const startDate = input.startDate ?? previous?.start_date ?? null
  db.transaction(() => {
    if (previous) {
      db.prepare(`UPDATE shelf_items SET kind = ?, title = ?, creator = ?, status = ?, rating = ?, comment = ?,
        cover_file = ?, start_date = ?, finish_date = ?, updated_at = ? WHERE id = ?`)
        .run(input.kind, input.title, input.creator ?? '', input.status, input.rating ?? null, input.comment ?? '',
          coverFile, startDate, finishDate, now, id)
    } else {
      db.prepare(`INSERT INTO shelf_items(id, kind, title, creator, status, rating, comment, cover_file,
        start_date, finish_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.kind, input.title, input.creator ?? '', input.status, input.rating ?? null, input.comment ?? '',
          coverFile, startDate, finishDate, now, now)
    }
  })()
  const removedCover = oldCover && coverFile !== oldCover ? oldCover : null
  const row = getShelfRow(id)
  return { item: toItem(row as ShelfRow), removedCover }
}

export function removeShelf(id: string): string | null {
  const db = getDatabase()
  const row = db.transaction(() => db.prepare('DELETE FROM shelf_items WHERE id = ? RETURNING cover_file').get(id))() as Pick<ShelfRow, 'cover_file'> | undefined
  return row?.cover_file ?? null
}
