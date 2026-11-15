import { dialog, ipcMain } from 'electron'
import {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync
} from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { channels } from '@shared/ipc-contract'
import { closeDatabase, getDatabase } from '../db'
import { flushNotes, requestRelaunch } from '../quit'
import {
  dataDirectory, databasePath, defaultDataDirectory, filesPath, isDefaultDirectory, legacyFilesPath, pointerPath
} from '../storage'
import { fail } from './errors'
import { noArgs, validate } from './validation'

function relocate(targetInput: string): string {
  const requested = resolve(targetInput)
  mkdirSync(requested, { recursive: true })
  const target = realpathSync.native(requested)
  const current = realpathSync.native(dataDirectory())
  const [from, to] = [current, target].map(path => process.platform === 'win32' ? path.toLowerCase() : path)
  if (to === from) fail('DATA_DIR_SAME', '新位置与当前数据目录相同，无需更改。')
  const prefix = (path: string): string => path.endsWith(sep) ? path : path + sep
  if (to.startsWith(prefix(from)) || from.startsWith(prefix(to))) {
    fail('DATA_DIR_NESTED', '新位置不能位于当前数据目录内，也不能包含当前数据目录。')
  }

  const db = getDatabase()
  const [checkpoint] = db.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[]
  if (checkpoint.busy) fail('DATA_DIR_LOCKED', '当前数据库正在被占用，请稍后重试。')

  const staging = mkdtempSync(join(target, 'workbase-backup-'))
  const incoming = join(staging, 'incoming')
  const pointer = pointerPath()
  const pendingPointer = `${pointer}.tmp`
  const saved: string[] = []
  const installed: string[] = []
  let keepStaging = false
  try {
    mkdirSync(incoming)
    copyFileSync(databasePath(), join(incoming, 'workbench.db'))
    const sourceFiles = filesPath()
    const legacyFiles = legacyFilesPath()
    if (existsSync(legacyFiles)) cpSync(legacyFiles, join(incoming, 'files'), { recursive: true })
    if (existsSync(sourceFiles)) cpSync(sourceFiles, join(incoming, 'files'), { recursive: true })
    writeFileSync(pendingPointer, `${JSON.stringify({ directory: requested }, null, 2)}\n`, 'utf8')

    for (const name of ['workbench.db', 'workbench.db-wal', 'workbench.db-shm', 'files']) {
      const destination = join(target, name)
      if (existsSync(destination)) {
        renameSync(destination, join(staging, name))
        saved.push(name)
      }
      const replacement = join(incoming, name)
      if (existsSync(replacement)) {
        renameSync(replacement, destination)
        installed.push(name)
      }
    }
    closeDatabase()
    renameSync(pendingPointer, pointer)
  } catch (error) {
    try {
      for (const name of installed.reverse()) renameSync(join(target, name), join(incoming, name))
      for (const name of saved.reverse()) renameSync(join(staging, name), join(target, name))
      saved.length = 0
    } catch {
      keepStaging = true
      fail('DATA_MOVE_FAILED', `复制数据失败，目标目录未能完全还原。请保留恢复目录：${staging}`)
    }
    fail('DATA_MOVE_FAILED', `复制数据失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    try { rmSync(pendingPointer, { force: true }) } catch { /* 清理失败不改变迁移结果。 */ }
    if (!keepStaging) {
      try { rmSync(saved.length ? incoming : staging, { force: true, recursive: true }) } catch { /* 留下暂存目录供恢复。 */ }
    }
  }
  return requested
}

export function registerStorageIPC(): void {
  ipcMain.handle(channels.dataStorage, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return {
      directory: dataDirectory(),
      database: databasePath(),
      files: filesPath(),
      defaultDirectory: defaultDataDirectory(),
      isDefault: isDefaultDirectory()
    }
  })

  ipcMain.handle(channels.dataChooseDirectory, async (event, ...args: unknown[]) => {
    validate(noArgs, args)
    const result = await dialog.showOpenDialog({
      title: '选择数据保存位置',
      buttonLabel: '使用此目录',
      defaultPath: dataDirectory(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    if (!await flushNotes(event.sender)) fail('DATA_MOVE_UNSAVED', '还有笔记未保存，请保存后再更改数据目录。')
    return relocate(result.filePaths[0])
  })

  ipcMain.handle(channels.dataRelocateDefault, async (event, ...args: unknown[]) => {
    validate(noArgs, args)
    if (!await flushNotes(event.sender)) fail('DATA_MOVE_UNSAVED', '还有笔记未保存，请保存后再更改数据目录。')
    return relocate(defaultDataDirectory())
  })

  ipcMain.handle(channels.appRelaunch, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    requestRelaunch()
  })
}
