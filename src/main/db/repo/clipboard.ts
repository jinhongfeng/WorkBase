import { randomUUID } from 'node:crypto'
import type { ClipboardItem, ClipboardPage, ClipboardQuery } from '@shared/types'
import { getDatabase } from '../index'

const KEEP_UNPINNED = 500

interface ClipboardRow {
  id: string
  content: string
  pinned: number
  created_at: number
  updated_at: number
}

function toItem(row: ClipboardRow): ClipboardItem {
  return { id: row.id, content: row.content, pinned: row.pinned, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function listClipboard(query: ClipboardQuery): ClipboardPage {
  const db = getDatabase()
  const conditions: string[] = []
  const params: string[] = []
  const keyword = query.q?.trim()
  if (keyword) {
    // LIKE 通配符转义后按字面匹配。
    conditions.push(`content LIKE ? ESCAPE '\\'`)
    params.push(`%${keyword.replace(/[\\%_]/g, matched => `\\${matched}`)}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = (db.prepare(`SELECT COUNT(*) AS total FROM clipboard_items ${where}`).get(...params) as { total: number }).total
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const lastOffset = Math.max(0, Math.floor((total - 1) / limit) * limit)
  const offset = Math.min(query.offset ?? 0, lastOffset)
  const rows = db.prepare(`SELECT * FROM clipboard_items ${where}
    ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as ClipboardRow[]
  return { items: rows.map(toItem), total, offset }
}

/** 记录一次剪贴板文本：与已有条目重复时提升到最新位置，不重复落行。 */
export function captureClipboardText(content: string): void {
  const db = getDatabase()
  const now = Date.now()
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM clipboard_items WHERE content = ? ORDER BY updated_at DESC LIMIT 1')
      .get(content) as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE clipboard_items SET updated_at = ? WHERE id = ?').run(now, existing.id)
    } else {
      db.prepare('INSERT INTO clipboard_items(id, content, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
        .run(randomUUID(), content, now, now)
    }
    db.prepare(`
      DELETE FROM clipboard_items WHERE pinned = 0 AND id IN (
        SELECT id FROM clipboard_items WHERE pinned = 0 ORDER BY updated_at DESC LIMIT -1 OFFSET ?
      )
    `).run(KEEP_UNPINNED)
  })()
}

export function copyClipboardText(id: string): string | null {
  const row = getDatabase().prepare('SELECT content FROM clipboard_items WHERE id = ?').get(id) as { content: string } | undefined
  return row?.content ?? null
}

export function toggleClipboardPin(id: string): ClipboardItem | null {
  const db = getDatabase()
  const row = db.prepare('UPDATE clipboard_items SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id = ? RETURNING *')
    .get(id) as ClipboardRow | undefined
  return row ? toItem(row) : null
}

export function removeClipboardItem(id: string): void {
  getDatabase().prepare('DELETE FROM clipboard_items WHERE id = ?').run(id)
}

/** 清空未置顶的历史；置顶条目保留。 */
export function clearClipboard(): void {
  getDatabase().prepare('DELETE FROM clipboard_items WHERE pinned = 0').run()
}
