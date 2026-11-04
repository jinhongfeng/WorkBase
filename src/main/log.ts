import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
export function logMain(message: string): void {
  const directory = join(app.getPath('userData'), 'logs')
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'main.log')
  const previous = join(directory, 'main.previous.log')
  if (existsSync(file) && statSync(file).size >= 2 * 1024 * 1024) {
    if (existsSync(previous)) unlinkSync(previous)
    renameSync(file, previous)
  }
  appendFileSync(file, `${new Date().toISOString()} ${message}\n`)
}
