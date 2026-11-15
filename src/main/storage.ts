import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 数据位置指针放在 userData 根目录，与数据本体分离：
 * 移动数据目录后仍能通过指针定位，无需复制数据库里的设置。
 */
export const POINTER_FILE = 'data-location.json'

export function defaultDataDirectory(): string {
  return join(app.getPath('userData'), 'data')
}

export function pointerPath(): string {
  return join(app.getPath('userData'), POINTER_FILE)
}

/** 当前数据目录；指针缺失或损坏时回落到默认目录，不阻断启动。 */
export function dataDirectory(): string {
  const file = pointerPath()
  if (!existsSync(file)) return defaultDataDirectory()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { directory?: unknown }
    if (typeof parsed.directory === 'string' && parsed.directory.trim()) return resolve(parsed.directory)
  } catch {
    /* 指针损坏按默认目录处理 */
  }
  return defaultDataDirectory()
}

export function databasePath(): string {
  return join(dataDirectory(), 'workbench.db')
}

export function filesPath(): string {
  return join(dataDirectory(), 'files')
}

export function legacyFilesPath(): string {
  return join(app.getPath('userData'), 'files')
}

export function isDefaultDirectory(): boolean {
  return dataDirectory() === resolve(defaultDataDirectory())
}
