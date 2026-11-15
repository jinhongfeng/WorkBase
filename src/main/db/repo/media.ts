import { randomUUID } from 'node:crypto'
import type { MediaGroup, MediaGroupInput, MediaItem, MediaListResult, MediaQuery, MediaSource, MediaType } from '@shared/types'
import { getDatabase } from '../index'
import { fail } from '../../ipc/errors'

interface MediaRow {
  id: string
  type: MediaType
  source: MediaSource
  name: string
  file_name: string
  original_name: string
  original_url: string
  mime: string
  size: number
  created_at: number
  group_id: string | null
  content_hash: string
  visual_hash: string
}

/** 回填时无法算出指纹（文件缺失或格式不支持）的记录使用该标记，避免反复重试。 */
export const MEDIA_HASH_UNKNOWN = '-'

export interface MediaRecord {
  type: MediaType
  source: MediaSource
  name: string
  fileName: string
  originalName: string
  originalUrl: string
  mime: string
  size: number
  groupId: string | null
  contentHash: string
  visualHash: string
}

export interface MediaDuplicateHit {
  id: string
  name: string
  originalName: string
  groupId: string | null
  groupName: string | null
}

interface MediaGroupRow {
  id: string
  name: string
  description: string
  cover_file_name: string | null
}

const groupSelect = `SELECT g.id, g.name, g.description,
  (SELECT file_name FROM media_items WHERE group_id = g.id AND type = 'image'
   ORDER BY created_at DESC, id DESC LIMIT 1) AS cover_file_name
  FROM media_groups g`

function assetUrl(fileName: string): string {
  return `wb-asset://media/${encodeURIComponent(fileName)}`
}

function toGroup(row: MediaGroupRow): MediaGroup {
  return { id: row.id, name: row.name, description: row.description, coverUrl: row.cover_file_name ? assetUrl(row.cover_file_name) : null }
}

function toItem(row: MediaRow): MediaItem {
  return {
    id: row.id, type: row.type, source: row.source, name: row.name,
    fileName: row.file_name, originalName: row.original_name, originalUrl: row.original_url,
    mime: row.mime, size: row.size, createdAt: row.created_at,
    groupId: row.group_id, url: assetUrl(row.file_name)
  }
}

export function listMedia(query: MediaQuery = {}): MediaListResult {
  const conditions: string[] = []
  const params: unknown[] = []
  if (query.type && query.type !== 'all') {
    conditions.push('type = ?')
    params.push(query.type)
  }
  if (query.q?.trim()) {
    conditions.push('(name LIKE ? OR original_name LIKE ?)')
    params.push(`%${query.q.trim()}%`, `%${query.q.trim()}%`)
  }
  if (query.groupId === null) {
    conditions.push('group_id IS NULL')
  } else if (query.groupId !== undefined) {
    conditions.push('group_id = ?')
    params.push(query.groupId)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const page = Math.max(0, Math.floor(query.page ?? 0))
  const pageSize = Math.min(200, Math.max(1, Math.floor(query.pageSize ?? 60)))
  const db = getDatabase()
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM media_items ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`SELECT * FROM media_items ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, page * pageSize) as MediaRow[]
  return { items: rows.map(toItem), total }
}

export function insertMedia(record: MediaRecord): MediaItem {
  const id = randomUUID()
  if (record.groupId !== null) requireMediaGroup(record.groupId)
  getDatabase().prepare(`INSERT INTO media_items
    (id, type, source, name, file_name, original_name, original_url, mime, size, created_at, group_id, content_hash, visual_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, record.type, record.source, record.name, record.fileName, record.originalName,
    record.originalUrl, record.mime, record.size, Date.now(), record.groupId,
    record.contentHash, record.visualHash
  )
  return getMedia(id) as MediaItem
}

/**
 * 按指纹查目标分组中的素材。groupId 为 null 时只查未分组。
 * 内容或图片位图指纹命中时，返回最早入库的一条。
 */
export function findMediaByFingerprint(contentHash: string, visualHash: string, groupId: string | null): MediaDuplicateHit | null {
  if (!contentHash || contentHash === MEDIA_HASH_UNKNOWN) return null
  const conditions = ['m.content_hash = ?']
  const params: unknown[] = [contentHash]
  if (visualHash) {
    conditions.push('m.visual_hash = ?')
    params.push(visualHash)
  }
  const row = getDatabase().prepare(`SELECT m.id, m.name, m.original_name, m.group_id, g.name AS group_name
    FROM media_items m LEFT JOIN media_groups g ON g.id = m.group_id
    WHERE m.group_id IS ? AND (${conditions.join(' OR ')})
    ORDER BY m.created_at, m.id LIMIT 1`).get(groupId, ...params) as
    | { id: string; name: string; original_name: string; group_id: string | null; group_name: string | null }
    | undefined
  return row ? {
    id: row.id, name: row.name, originalName: row.original_name,
    groupId: row.group_id, groupName: row.group_name
  } : null
}

export interface MediaHashTask { id: string; fileName: string }

/** 取一批还没有指纹的旧记录，用于启动后的后台回填。 */
export function listMediaPendingHashes(limit: number): MediaHashTask[] {
  return getDatabase().prepare(`SELECT id, file_name AS fileName FROM media_items
    WHERE content_hash = '' ORDER BY created_at, id LIMIT ?`).all(limit) as MediaHashTask[]
}

export function setMediaFingerprint(id: string, contentHash: string, visualHash: string): void {
  getDatabase().prepare('UPDATE media_items SET content_hash = ?, visual_hash = ? WHERE id = ?')
    .run(contentHash, visualHash, id)
}

export function getMedia(id: string): MediaItem | null {
  const row = getDatabase().prepare('SELECT * FROM media_items WHERE id = ?').get(id) as MediaRow | undefined
  return row ? toItem(row) : null
}

export function removeMedia(id: string): void {
  getDatabase().prepare('DELETE FROM media_items WHERE id = ?').run(id)
}

export function requireMediaGroup(id: string): void {
  if (!getDatabase().prepare('SELECT 1 FROM media_groups WHERE id = ?').get(id)) {
    fail('MEDIA_GROUP_NOT_FOUND', '这个分组已不存在。')
  }
}

export function listMediaGroups(): MediaGroup[] {
  const rows = getDatabase().prepare(`${groupSelect} ORDER BY g.name COLLATE NOCASE, g.id`).all() as MediaGroupRow[]
  return rows.map(toGroup)
}

export function saveMediaGroup(input: MediaGroupInput): MediaGroup {
  const db = getDatabase()
  const id = input.id ?? randomUUID()
  if (input.id) requireMediaGroup(id)
  if (db.prepare('SELECT 1 FROM media_groups WHERE name = ? AND id <> ?').get(input.name, id)) {
    fail('MEDIA_GROUP_EXISTS', '已有同名分组，请换一个名称。')
  }
  if (input.id) {
    db.prepare('UPDATE media_groups SET name = ?, description = ? WHERE id = ?').run(input.name, input.description, id)
  } else {
    db.prepare('INSERT INTO media_groups (id, name, description) VALUES (?, ?, ?)').run(id, input.name, input.description)
  }
  return toGroup(db.prepare(`${groupSelect} WHERE g.id = ?`).get(id) as MediaGroupRow)
}

export function removeMediaGroup(id: string): void {
  const db = getDatabase()
  db.transaction(() => {
    const items = db.prepare('SELECT id FROM media_items WHERE group_id = ?').all(id) as { id: string }[]
    for (const item of items) {
      moveMediaToGroup(item.id, null, '未分组中会出现重复素材，请先处理组内重复项再删除分组。')
    }
    db.prepare('DELETE FROM media_groups WHERE id = ?').run(id)
  })()
}

export function moveMediaToGroup(id: string, groupId: string | null, duplicateMessage?: string): void {
  if (groupId !== null) requireMediaGroup(groupId)
  const db = getDatabase()
  const item = db.prepare('SELECT group_id, content_hash, visual_hash FROM media_items WHERE id = ?').get(id) as
    Pick<MediaRow, 'group_id' | 'content_hash' | 'visual_hash'> | undefined
  if (!item) fail('MEDIA_NOT_FOUND', '这个媒体已不存在，请刷新列表。')
  if (item.group_id === groupId) return
  const hit = findMediaByFingerprint(item.content_hash, item.visual_hash, groupId)
  if (hit) {
    const target = hit.groupName ? `「${hit.groupName}」` : '未分组'
    fail('MEDIA_DUPLICATE', duplicateMessage ?? `${target}已有相同素材，已保留在原位置。`)
  }
  db.prepare('UPDATE media_items SET group_id = ? WHERE id = ?').run(groupId, id)
}
