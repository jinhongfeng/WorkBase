import { ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { listLibraryFolders, moveLibraryItem, removeLibraryFolder, saveLibraryFolder } from '../db/repo/library-folders'
import { validate } from './validation'

const librarySchema = z.enum(['notes', 'skills'])
const idSchema = z.string().min(1).max(64)
const folderSchema = z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(80) })

export function registerLibraryFoldersIPC(): void {
  ipcMain.handle(channels.libraryFoldersList, (_event, ...args: unknown[]) => {
    const [library] = validate(z.tuple([librarySchema]), args)
    return listLibraryFolders(library)
  })
  ipcMain.handle(channels.libraryFoldersSave, (_event, ...args: unknown[]) => {
    const [library, input] = validate(z.tuple([librarySchema, folderSchema]), args)
    return saveLibraryFolder(library, input)
  })
  ipcMain.handle(channels.libraryFoldersMove, (_event, ...args: unknown[]) => {
    const [library, itemId, folderId] = validate(z.tuple([librarySchema, idSchema, idSchema.nullable()]), args)
    moveLibraryItem(library, itemId, folderId)
  })
  ipcMain.handle(channels.libraryFoldersRemove, (_event, ...args: unknown[]) => {
    const [library, id] = validate(z.tuple([librarySchema, idSchema]), args)
    removeLibraryFolder(library, id)
  })
}
