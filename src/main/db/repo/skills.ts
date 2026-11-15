import { randomUUID } from 'node:crypto'
import type {
  SkillCoverKind, SkillDetail, SkillFileEntry, SkillLayout, SkillQuery, SkillSource, SkillSummary
} from '@shared/types'
import { getDatabase } from '../index'

interface SkillRow {
  id: string
  name: string
  slug: string
  description: string
  content: string
  frontmatter: string
  tags: string
  source: string
  source_ref: string
  layout: string
  cover_kind: string
  cover_path: string
  cover_remote: string
  pinned: number
  folder_id: string | null
  created_at: number
  updated_at: number
  file_count?: number
}

export interface SkillRecord {
  id: string
  slug: string
  frontmatter: string
  coverKind: SkillCoverKind
  coverPath: string
}

export interface NewSkillInput {
  name: string
  description: string
  slug: string
  content: string
  frontmatter: string
  source: SkillSource
  sourceRef: string
  layout: SkillLayout
  tags?: string
}

const SELECT_WITH_COUNT = `
  SELECT s.*, (SELECT COUNT(*) FROM skill_files f WHERE f.skill_id = s.id) AS file_count
  FROM skills s`

function toTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}

function coverUrl(row: SkillRow): string | null {
  if (row.cover_kind === 'none' || !row.cover_path) return null
  return `wb-asset://skill-covers/${encodeURIComponent(row.cover_path)}`
}

function toSummary(row: SkillRow): SkillSummary {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description,
    tags: toTags(row.tags),
    source: row.source as SkillSource,
    sourceRef: row.source_ref,
    layout: row.layout === 'file' ? 'file' : 'dir',
    coverKind: row.cover_kind === 'image' || row.cover_kind === 'video' ? row.cover_kind : 'none',
    coverUrl: coverUrl(row),
    pinned: row.pinned,
    fileCount: row.file_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listSkills(query: SkillQuery = {}): SkillSummary[] {
  const conditions: string[] = []
  const params: unknown[] = []
  const keyword = query.q?.trim()
  if (keyword) {
    const like = `%${keyword}%`
    conditions.push('(s.name LIKE ? OR s.description LIKE ? OR s.content LIKE ? OR s.tags LIKE ? OR s.folder_id IN (SELECT id FROM skill_folders WHERE name LIKE ?))')
    params.push(like, like, like, like, like)
  }
  if (query.source && query.source !== 'all') {
    conditions.push('s.source = ?')
    params.push(query.source)
  }
  if (query.tag?.trim()) {
    conditions.push('s.tags LIKE ?')
    params.push(`%,${query.tag.trim()},%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDatabase()
    .prepare(`${SELECT_WITH_COUNT} ${where} ORDER BY s.pinned DESC, s.updated_at DESC`)
    .all(...params) as SkillRow[]
  return rows.map(toSummary)
}

export function getSkill(id: string): SkillDetail | null {
  const db = getDatabase()
  const row = db.prepare(`${SELECT_WITH_COUNT} WHERE s.id = ?`).get(id) as SkillRow | undefined
  if (!row) return null
  const files = db.prepare('SELECT path, size FROM skill_files WHERE skill_id = ? ORDER BY path').all(id) as SkillFileEntry[]
  return { ...toSummary(row), slug: row.slug, content: row.content, files }
}

export function getSkillRecord(id: string): SkillRecord | null {
  const row = getDatabase()
    .prepare('SELECT id, slug, frontmatter, cover_kind, cover_path FROM skills WHERE id = ?')
    .get(id) as { id: string; slug: string; frontmatter: string; cover_kind: string; cover_path: string } | undefined
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    frontmatter: row.frontmatter,
    coverKind: row.cover_kind === 'image' || row.cover_kind === 'video' ? row.cover_kind : 'none',
    coverPath: row.cover_path
  }
}

export function insertSkill(input: NewSkillInput, files: SkillFileEntry[]): SkillDetail {
  const db = getDatabase()
  const id = randomUUID()
  const now = Date.now()
  db.transaction(() => {
    db.prepare(`
      INSERT INTO skills(id, name, slug, description, content, frontmatter, tags, source, source_ref,
        layout, cover_kind, cover_path, cover_remote, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', '', '', 0, ?, ?)
    `).run(id, input.name, input.slug, input.description, input.content, input.frontmatter,
      input.tags ?? '', input.source, input.sourceRef, input.layout, now, now)
    const statement = db.prepare('INSERT OR REPLACE INTO skill_files(skill_id, path, size) VALUES (?, ?, ?)')
    for (const file of files) statement.run(id, file.path, file.size)
  })()
  return getSkill(id) as SkillDetail
}

export function updateSkill(id: string, patch: { name: string; description: string; content: string; frontmatter: string; tags: string }, entrySize: number): SkillDetail {
  const db = getDatabase()
  db.prepare('UPDATE skills SET name = ?, description = ?, content = ?, frontmatter = ?, tags = ?, updated_at = ? WHERE id = ?')
    .run(patch.name, patch.description, patch.content, patch.frontmatter, patch.tags, Date.now(), id)
  db.prepare(`INSERT INTO skill_files (skill_id, path, size) VALUES (?, 'SKILL.md', ?)
    ON CONFLICT (skill_id, path) DO UPDATE SET size = excluded.size`).run(id, entrySize)
  return getSkill(id) as SkillDetail
}

export function removeSkill(id: string): void {
  getDatabase().prepare('DELETE FROM skills WHERE id = ?').run(id)
}

export function toggleSkillPin(id: string): void {
  getDatabase()
    .prepare('UPDATE skills SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id = ?')
    .run(id)
}

export function setSkillCover(id: string, cover: { kind: SkillCoverKind; path: string; remote: string }): SkillDetail {
  getDatabase()
    .prepare('UPDATE skills SET cover_kind = ?, cover_path = ?, cover_remote = ?, updated_at = ? WHERE id = ?')
    .run(cover.kind, cover.path, cover.remote, Date.now(), id)
  return getSkill(id) as SkillDetail
}

export function skillTags(): { tag: string; count: number }[] {
  const rows = getDatabase().prepare('SELECT tags FROM skills').all() as { tags: string }[]
  const counter = new Map<string, number>()
  for (const row of rows) {
    for (const tag of toTags(row.tags)) counter.set(tag, (counter.get(tag) ?? 0) + 1)
  }
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function slugExists(slug: string): boolean {
  const row = getDatabase().prepare('SELECT 1 AS ok FROM skills WHERE slug = ?').get(slug)
  return row !== undefined
}
