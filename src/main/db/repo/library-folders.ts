import { randomUUID } from 'node:crypto'
import type { LibraryFolder, LibraryFolderInput, FolderLibrary } from '@shared/types'
import { fail } from '../../ipc/errors'
import { getDatabase } from '../index'

const folderTables = { notes: 'note_folders', skills: 'skill_folders' } as const

export function listLibraryFolders(library: FolderLibrary): LibraryFolder[] {
  return getDatabase().prepare(`SELECT id, name FROM ${folderTables[library]} ORDER BY name`).all() as LibraryFolder[]
}

export function saveLibraryFolder(library: FolderLibrary, { id, name }: LibraryFolderInput): LibraryFolder {
  const db = getDatabase()
  const table = folderTables[library]
  return db.transaction(() => {
    const duplicate = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: string } | undefined
    if (duplicate && duplicate.id !== id) fail('FOLDER_NAME_EXISTS', '已有同名文件夹。')
    if (id) {
      const result = db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, id)
      if (!result.changes) fail('FOLDER_NOT_FOUND', '这个文件夹已不存在。')
      return { id, name }
    }
    const newId = randomUUID()
    db.prepare(`INSERT INTO ${table} (id, name) VALUES (?, ?)`).run(newId, name)
    return { id: newId, name }
  })()
}

export function moveLibraryItem(library: FolderLibrary, itemId: string, folderId: string | null): void {
  const db = getDatabase()
  db.transaction(() => {
    if (folderId && !db.prepare(`SELECT 1 FROM ${folderTables[library]} WHERE id = ?`).get(folderId)) {
      fail('FOLDER_NOT_FOUND', '这个文件夹已不存在。')
    }
    const result = db.prepare(`UPDATE ${library} SET folder_id = ? WHERE id = ?`).run(folderId, itemId)
    if (!result.changes) fail('ITEM_NOT_FOUND', '这条记录已不存在。')
  })()
}

export function removeLibraryFolder(library: FolderLibrary, id: string): void {
  // ON DELETE SET NULL 同步将其中的条目移回顶层。
  getDatabase().prepare(`DELETE FROM ${folderTables[library]} WHERE id = ?`).run(id)
}
