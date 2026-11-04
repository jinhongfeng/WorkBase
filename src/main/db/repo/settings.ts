import { getDatabase } from '../index'
import type { Settings } from '@shared/types'
export function getAllSettings(): Settings {
  const rows = getDatabase().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(row => [row.key, row.value]))
}
export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  db.transaction(() => db.prepare('INSERT INTO settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(key, value, Date.now()))()
}
