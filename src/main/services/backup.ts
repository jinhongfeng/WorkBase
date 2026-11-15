import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { BackupResult } from '@shared/types'
import { getDatabase } from '../db'
import { filesPath, legacyFilesPath } from '../storage'
import { fail } from '../ipc/errors'

function directorySize(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(path) : statSync(path).size)
  }, 0)
}

export function exportBackup(parent: string): BackupResult {
  let destination: string
  try { destination = realpathSync.native(parent) }
  catch { fail('BACKUP_INVALID_PATH', '无法访问备份目标目录，请重新选择。') }
  for (const root of [filesPath(), legacyFilesPath()]) {
    if (!existsSync(root)) continue
    const inside = relative(realpathSync.native(root), destination)
    if (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`)) {
      fail('BACKUP_INVALID_PATH', '请选择附件目录以外的位置保存备份。')
    }
  }
  const now = new Date()
  const part = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`
  const base = join(destination, `WorkBase-备份-${stamp}`)
  let path = base
  for (let suffix = 1; existsSync(path); suffix++) path = `${base}-${suffix}`
  let created = false
  try {
    mkdirSync(path)
    created = true
    getDatabase().prepare('VACUUM INTO ?').run(join(path, 'workbench.db'))
    const target = join(path, 'files')
    mkdirSync(target)
    // 先合并旧附件，再由当前文件覆盖同名项，与读取附件的优先级一致。
    for (const source of [legacyFilesPath(), filesPath()]) {
      if (existsSync(source)) cpSync(source, target, { recursive: true, force: true })
    }
    return { path, size: directorySize(path) }
  } catch {
    if (created) {
      try { rmSync(path, { recursive: true, force: true }) }
      catch { fail('BACKUP_FAILED', `备份未完成，无法清理不完整目录：${path}。请检查写入权限和可用空间。`) }
    }
    fail('BACKUP_FAILED', '备份未完成，请检查目标目录的写入权限和可用空间。')
  }
}
