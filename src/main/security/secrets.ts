import { safeStorage } from 'electron'
import { getDatabase } from '../db'
import { fail } from '../ipc/errors'

/** 密钥只以 safeStorage(Windows DPAPI) 加密后的 base64 落库，绝不明文降级。 */
export function saveSecret(name: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) fail('SECRET_UNAVAILABLE', '当前系统不支持加密存储，无法保存密钥。')
  const encrypted = safeStorage.encryptString(value).toString('base64')
  const db = getDatabase()
  db.prepare('INSERT INTO secrets(name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(name, encrypted, Date.now())
}

export function readSecret(name: string): string {
  const row = getDatabase().prepare('SELECT value FROM secrets WHERE name = ?').get(name) as { value: string } | undefined
  if (!row) return ''
  try {
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'))
  } catch {
    return ''
  }
}

export function hasSecret(name: string): boolean {
  return readSecret(name).length > 0
}

export function clearSecret(name: string): void {
  getDatabase().prepare('DELETE FROM secrets WHERE name = ?').run(name)
}
