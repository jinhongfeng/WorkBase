import { randomUUID } from 'node:crypto'
import { MEMORY_PAGE_SIZE, type MemoryEntry, type MemoryInput, type MemoryPage } from '@shared/memories'
import { getDatabase } from '..'
import { fail } from '../../ipc/errors'

interface MemoryRow {
  id: string
  event_date: string
  event_time: string | null
  content: string
  image_files: string
}

function toMemory(row: MemoryRow): MemoryEntry {
  return { id: row.id, date: row.event_date, time: row.event_time, content: row.content, imageFiles: JSON.parse(row.image_files) as string[] }
}

export function listMemories(requestedPage: number, requestedYear?: string | null, requestedQuery?: string | null): MemoryPage {
  const db = getDatabase()
  const years = db.prepare(`SELECT substr(event_date, 1, 4) AS year, COUNT(*) AS count
    FROM memories GROUP BY year ORDER BY year DESC`).all() as MemoryPage['years']
  const selected = years.find(item => item.year === requestedYear)
  const year = selected?.year ?? null
  const query = (requestedQuery ?? '').trim()
  const conditions: string[] = []
  const params: string[] = []
  if (year) {
    conditions.push('event_date BETWEEN ? AND ?')
    params.push(`${year}-01-01`, `${year}-12-31`)
  }
  if (query) {
    // LIKE 通配符转义后按字面匹配，避免关键字里的 % 和 _ 被当通配符。
    conditions.push(`content LIKE ? ESCAPE '\\'`)
    params.push(`%${query.replace(/[\\%_]/g, matched => `\\${matched}`)}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM memories ${where}`).get(...params) as { count: number }).count
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(total / MEMORY_PAGE_SIZE) - 1))
  const rows = db.prepare(`SELECT * FROM memories ${where}
    ORDER BY event_date DESC, event_time DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, MEMORY_PAGE_SIZE, page * MEMORY_PAGE_SIZE) as MemoryRow[]
  const stat = db.prepare(`SELECT COALESCE(SUM(json_array_length(image_files)), 0) AS photos,
    COUNT(DISTINCT event_date) AS days FROM memories`).get() as { photos: number; days: number }
  return { items: rows.map(toMemory), total, page, year, years, query, photos: stat.photos, days: stat.days }
}

export function saveMemory(input: Omit<MemoryInput, 'images'>, newImages: string[]): { entry: MemoryEntry; removedImages: string[] } {
  const db = getDatabase()
  return db.transaction(() => {
    const previous = input.id
      ? db.prepare('SELECT * FROM memories WHERE id = ?').get(input.id) as MemoryRow | undefined
      : undefined
    if (input.id && !previous) fail('MEMORY_NOT_FOUND', '这条纪念记录已被删除。')
    const oldImages = previous ? toMemory(previous).imageFiles : []
    if (input.keepImages.some(name => !oldImages.includes(name))) {
      fail('MEMORY_IMAGE_CHANGED', '记录中的照片已变化，请重新打开这条记录再编辑。')
    }

    const id = previous?.id ?? randomUUID()
    const now = Date.now()
    const imageFiles = [...input.keepImages, ...newImages]
    const fields = [input.date, input.time, input.content, JSON.stringify(imageFiles)]
    if (previous) {
      db.prepare('UPDATE memories SET event_date = ?, event_time = ?, content = ?, image_files = ?, updated_at = ? WHERE id = ?')
        .run(...fields, now, id)
    } else {
      db.prepare('INSERT INTO memories(id, event_date, event_time, content, image_files, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, ...fields, now, now)
    }
    return {
      entry: { id, date: input.date, time: input.time, content: input.content, imageFiles },
      removedImages: oldImages.filter(name => !input.keepImages.includes(name))
    }
  })()
}

export function removeMemory(id: string): string[] {
  const db = getDatabase()
  const row = db.transaction(() => db.prepare('DELETE FROM memories WHERE id = ? RETURNING image_files').get(id))() as Pick<MemoryRow, 'image_files'> | undefined
  return row ? JSON.parse(row.image_files) as string[] : []
}
