import { randomUUID } from 'node:crypto'
import type { Source, SourceEntry, SourceEntryPage } from '@shared/sources'
import { SOURCE_ENTRY_PAGE_SIZE, SOURCE_MAX_SUMMARY } from '@shared/sources'
import { getDatabase } from '../index'
import { fail } from '../../ipc/errors'

interface SourceRow {
  id: string
  name: string
  url: string
  enabled: number
  last_fetch_at: number | null
  last_error: string | null
  created_at: number
}

const ENTRY_COLUMNS = 'id, source_id, guid, title, link, published_at, summary, cover, fetched_at, read'

function toSource(row: SourceRow): Source {
  const unread = getDatabase()
    .prepare('SELECT COUNT(*) AS unread FROM source_entries WHERE source_id = ? AND read = 0')
    .pluck().get(row.id) as number
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    lastFetchAt: row.last_fetch_at,
    lastError: row.last_error,
    unread,
    createdAt: row.created_at
  }
}

export function listSources(): Source[] {
  const rows = getDatabase().prepare('SELECT * FROM sources ORDER BY created_at ASC, id ASC').all() as SourceRow[]
  return rows.map(toSource)
}

export function listEnabledSourceIds(): string[] {
  return getDatabase().prepare('SELECT id FROM sources WHERE enabled = 1 ORDER BY created_at ASC').pluck().all() as string[]
}

export function getSourceRow(id: string): SourceRow | undefined {
  return getDatabase().prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined
}

export function getSourceUrl(id: string): string | null {
  const row = getSourceRow(id)
  return row?.url ?? null
}

export function addSource(name: string, url: string): Source[] {
  const db = getDatabase()
  try {
    db.prepare('INSERT INTO sources(id, name, url, enabled, created_at) VALUES (?, ?, ?, 1, ?)')
      .run(randomUUID(), name.trim(), url.trim(), Date.now())
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) fail('SOURCE_EXISTS', '这个订阅地址已存在。')
    throw error
  }
  return listSources()
}

export function updateSource(input: { id: string; name?: string; enabled?: boolean }): Source[] {
  const db = getDatabase()
  const row = getSourceRow(input.id)
  if (!row) fail('SOURCE_NOT_FOUND', '这条订阅已被删除。')
  db.transaction(() => {
    if (input.name !== undefined) db.prepare('UPDATE sources SET name = ? WHERE id = ?').run(input.name.trim(), input.id)
    if (input.enabled !== undefined) {
      db.prepare('UPDATE sources SET enabled = ?, last_error = NULL WHERE id = ?').run(input.enabled ? 1 : 0, input.id)
    }
  })()
  return listSources()
}

export function removeSource(id: string): Source[] {
  getDatabase().prepare('DELETE FROM sources WHERE id = ?').run(id)
  return listSources()
}

export interface SourceFeedEntry {
  guid: string
  title: string
  link: string
  publishedAt: number | null
  summary: string
  body: string | null
}

export function saveSourceEntries(sourceId: string, entries: SourceFeedEntry[]): { added: number } {
  const db = getDatabase()
  const now = Date.now()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO source_entries(id, source_id, guid, title, link, published_at, summary, fetched_at, read, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `)
  const fillBody = db.prepare('UPDATE source_entries SET body = ? WHERE source_id = ? AND guid = ? AND body IS NULL')
  return db.transaction(() => {
    let added = 0
    for (const entry of entries) {
      const { changes } = insert.run(
        randomUUID(), sourceId, entry.guid, entry.title, entry.link, entry.publishedAt,
        entry.summary.slice(0, SOURCE_MAX_SUMMARY), now, entry.body
      )
      added += changes
      if (!changes && entry.body) fillBody.run(entry.body, sourceId, entry.guid)
    }
    db.prepare('UPDATE sources SET last_fetch_at = ?, last_error = NULL WHERE id = ?').run(now, sourceId)
    return { added }
  })()
}

export function markSourceError(sourceId: string, message: string): void {
  getDatabase().prepare('UPDATE sources SET last_fetch_at = ?, last_error = ? WHERE id = ?')
    .run(Date.now(), message.slice(0, 300), sourceId)
}

export function sourceEntriesWithCover(sourceId: string): Set<string> {
  const rows = getDatabase()
    .prepare('SELECT guid FROM source_entries WHERE source_id = ? AND cover IS NOT NULL')
    .pluck().all(sourceId) as string[]
  return new Set(rows)
}

export function saveSourceEntryCover(sourceId: string, guid: string, cover: string): void {
  getDatabase().prepare('UPDATE source_entries SET cover = ? WHERE source_id = ? AND guid = ? AND cover IS NULL')
    .run(cover, sourceId, guid)
}

export function getSourceEntryBody(id: string): string | null {
  const row = getDatabase().prepare('SELECT body FROM source_entries WHERE id = ?').pluck().get(id) as string | null | undefined
  return row ?? null
}

export function saveSourceEntryBody(id: string, body: string): void {
  getDatabase().prepare('UPDATE source_entries SET body = ? WHERE id = ? AND body IS NULL').run(body, id)
}

export function listSourceEntries(
  sourceId: string,
  options: { q?: string; unreadOnly?: boolean; page: number }
): SourceEntryPage {
  const db = getDatabase()
  const conditions = ['source_id = ?']
  const params: unknown[] = [sourceId]
  const keyword = options.q?.trim()
  if (keyword) {
    conditions.push(`(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')`)
    const like = `%${keyword.replace(/[\\%_]/g, ch => `\\${ch}`)}%`
    params.push(like, like)
  }
  if (options.unreadOnly) conditions.push('read = 0')
  const where = conditions.join(' AND ')
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM source_entries WHERE ${where}`).get(...params) as { total: number }
  const offset = Math.max(0, options.page) * SOURCE_ENTRY_PAGE_SIZE
  const rows = db.prepare(`SELECT ${ENTRY_COLUMNS} FROM source_entries WHERE ${where}
    ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ? OFFSET ?`)
    .all(...params, SOURCE_ENTRY_PAGE_SIZE, offset) as Record<string, unknown>[]
  return { items: rows.map(toEntry), total, offset }
}

function toEntry(row: Record<string, unknown>): SourceEntry {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    guid: row.guid as string,
    title: row.title as string,
    link: row.link as string,
    publishedAt: row.published_at as number | null,
    summary: row.summary as string,
    coverUrl: row.cover as string | null,
    fetchedAt: row.fetched_at as number,
    read: row.read as number
  }
}

export function getEntry(id: string): SourceEntry | null {
  const row = getDatabase().prepare(`SELECT ${ENTRY_COLUMNS} FROM source_entries WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  return row ? toEntry(row) : null
}

export function setEntryRead(id: string, read: boolean): void {
  getDatabase().prepare('UPDATE source_entries SET read = ? WHERE id = ?').run(read ? 1 : 0, id)
}
