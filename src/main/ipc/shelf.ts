import { mkdir, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { SHELF_COVER_NAME, SHELF_MAX_COVER_BYTES, SHELF_MAX_COMMENT, SHELF_MAX_CREATOR, SHELF_MAX_TITLE } from '@shared/shelf'
import { detectAssetFormat } from '../assets'
import { listShelf, removeShelf, saveShelf, shelfStats } from '../db/repo/shelf'
import { logMain } from '../log'
import { filesPath } from '../storage'
import { fail } from './errors'
import { validate } from './validation'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
const saveSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  kind: z.enum(['book', 'movie', 'tv']),
  title: z.string().trim().min(1).max(SHELF_MAX_TITLE),
  creator: z.string().max(SHELF_MAX_CREATOR).optional(),
  status: z.enum(['wish', 'doing', 'done']),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  comment: z.string().max(SHELF_MAX_COMMENT).optional(),
  startDate: date.optional(),
  finishDate: date.optional(),
  keepCover: z.string().regex(SHELF_COVER_NAME).nullable(),
  cover: z.instanceof(ArrayBuffer).optional()
})

const querySchema = z.object({
  kind: z.enum(['book', 'movie', 'tv', 'all']).optional(),
  status: z.enum(['wish', 'doing', 'done', 'all']).optional(),
  q: z.string().max(200).optional()
}).default({})

function coversDirectory(): string {
  return join(filesPath(), 'shelf-covers')
}

async function discardCover(name: string | null): Promise<void> {
  if (!name) return
  if (!SHELF_COVER_NAME.test(name)) return
  try { await rm(join(coversDirectory(), name), { force: true }) }
  catch { try { logMain('[shelf] 无法清理未引用的封面文件。') } catch { /* 日志失败不影响结果 */ } }
}

export function registerShelfIPC(): void {
  ipcMain.handle(channels.shelfList, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([querySchema]), args)
    return listShelf(query)
  })
  ipcMain.handle(channels.shelfStats, (_event, ...args: unknown[]) => {
    validate(z.tuple([]), args)
    return shelfStats()
  })
  ipcMain.handle(channels.shelfSave, async (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([saveSchema]), args)
    let newCover: string | null = null
    if (input.cover) {
      if (input.cover.byteLength > SHELF_MAX_COVER_BYTES) fail('SHELF_COVER_TOO_LARGE', '封面不能超过 12MB。')
      const bytes = Buffer.from(input.cover)
      const format = detectAssetFormat(bytes.subarray(0, 4096))
      if (format?.kind !== 'image') fail('SHELF_COVER_INVALID', '封面请选择 PNG、JPG、WebP、GIF 或 AVIF 图片。')
      newCover = `${randomUUID()}${format.extension}`
      try {
        await mkdir(coversDirectory(), { recursive: true })
        const file = await open(join(coversDirectory(), newCover), 'wx')
        try { await file.writeFile(bytes) } finally { await file.close() }
      } catch (error) {
        newCover = null
        fail('SHELF_COVER_WRITE_FAILED', `封面保存失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    try {
      const { item, removedCover } = saveShelf({ ...input, newCover })
      await discardCover(removedCover)
      return item
    } catch (error) {
      await discardCover(newCover)
      throw error
    }
  })
  ipcMain.handle(channels.shelfRemove, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    await discardCover(removeShelf(id))
  })
}
