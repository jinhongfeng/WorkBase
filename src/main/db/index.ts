import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let connection: Database.Database | undefined
export function getDatabase(): Database.Database {
  if (connection) return connection
  const directory = join(app.getPath('userData'), 'data')
  mkdirSync(directory, { recursive: true })
  const db = new Database(join(directory, 'workbench.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const directoryMigrations = app.isPackaged ? join(process.resourcesPath, 'migrations') : join(app.getAppPath(), 'src/main/db/migrations')
  let version = db.pragma('user_version', { simple: true }) as number
  for (const name of readdirSync(directoryMigrations).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const next = Number(name.split('_')[0])
    if (next <= version) continue
    if (next !== version + 1) throw new Error(`DB_ERROR: 缺少迁移 ${version + 1}`)
    db.transaction(() => {
      db.exec(readFileSync(join(directoryMigrations, name), 'utf8'))
      db.pragma(`user_version = ${next}`)
    })()
    version = next
  }
  connection = db
  return db
}
export function closeDatabase(): void { connection?.close(); connection = undefined }
