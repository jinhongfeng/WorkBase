import { ipcMain } from 'electron'
import { z } from 'zod'
import type { NoteQuery, NoteSaveInput } from '@shared/types'
import { channels } from '@shared/ipc-contract'
import { archiveNote, getJournalByDate, getNote, listNotePage, listNotes, listTrashNotes, noteStats, removeNote, restoreNote, saveNote, toggleNotePin } from '../db/repo/notes'
import { noArgs, validate } from './validation'

const querySchema = z.object({
  query: z.string().max(200).optional(),
  kind: z.enum(['note', 'journal', 'all']).optional(),
  pinnedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional()
}).default({})

const saveSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().max(200),
  content: z.string().max(2_000_000),
  tags: z.array(z.string().min(1).max(40)).max(20),
  kind: z.enum(['note', 'journal']),
  journalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
})

const idSchema = z.tuple([z.string().min(1).max(64)])
const dateSchema = z.tuple([z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])

export function registerNotesIPC(): void {
  ipcMain.handle(channels.notesList, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([querySchema]), args)
    return listNotes(query as NoteQuery)
  })
  ipcMain.handle(channels.notesListPage, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([querySchema]), args)
    return listNotePage(query)
  })
  ipcMain.handle(channels.notesGet, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    return getNote(id)
  })
  ipcMain.handle(channels.notesGetJournal, (_event, ...args: unknown[]) => {
    const [date] = validate(dateSchema, args)
    return getJournalByDate(date)
  })
  ipcMain.handle(channels.notesSave, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([saveSchema]), args)
    return saveNote(input as NoteSaveInput)
  })
  ipcMain.handle(channels.notesRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    removeNote(id)
  })
  ipcMain.handle(channels.notesPin, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    toggleNotePin(id)
  })
  ipcMain.handle(channels.notesStats, () => noteStats())
  ipcMain.handle(channels.notesTrash, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return listTrashNotes()
  })
  ipcMain.handle(channels.notesArchive, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    archiveNote(id)
  })
  ipcMain.handle(channels.notesRestore, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    restoreNote(id)
  })
}
