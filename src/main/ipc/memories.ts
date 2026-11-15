import { randomUUID } from 'node:crypto'
import { mkdir, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { MEMORY_IMAGE_NAME, MEMORY_MAX_CONTENT_LENGTH, MEMORY_MAX_IMAGE_BYTES, MEMORY_MAX_IMAGES } from '@shared/memories'
import { detectAssetFormat } from '../assets'
import { listMemories, removeMemory, saveMemory } from '../db/repo/memories'
import { logMain } from '../log'
import { filesPath } from '../storage'
import { fail } from './errors'
import { validate } from './validation'

const id = z.uuid()
const listSchema = z.tuple([
  z.number().int().min(0),
  z.string().regex(/^(?!0000)\d{4}$/).nullish(),
  z.string().max(200).nullish()
])
const saveSchema = z.object({
  id: id.optional(),
  date: z.iso.date().refine(value => !value.startsWith('0000')),
  time: z.iso.time({ precision: -1 }).nullable(),
  content: z.string().trim().min(1).max(MEMORY_MAX_CONTENT_LENGTH),
  keepImages: z.array(z.string().regex(MEMORY_IMAGE_NAME)).max(MEMORY_MAX_IMAGES),
  images: z.array(z.instanceof(ArrayBuffer)).max(MEMORY_MAX_IMAGES)
}).refine(input => input.keepImages.length + input.images.length <= MEMORY_MAX_IMAGES &&
  new Set(input.keepImages).size === input.keepImages.length)

async function discardImages(directory: string, names: string[]): Promise<void> {
  const results = await Promise.allSettled(names.filter(name => MEMORY_IMAGE_NAME.test(name))
    .map(name => rm(join(directory, name), { force: true })))
  if (results.some(result => result.status === 'rejected')) {
    try { logMain('[memories] 无法清理部分未引用的照片文件。') }
    catch { /* 日志写入失败不改变已提交的数据库结果。 */ }
  }
}

export function registerMemoriesIPC(): void {
  ipcMain.handle(channels.memoriesList, (_event, ...args: unknown[]) => {
    const [page, year, query] = validate(listSchema, args)
    return listMemories(page, year, query)
  })
  ipcMain.handle(channels.memoriesSave, async (_event, ...args: unknown[]) => {
    const [{ images, ...input }] = validate(z.tuple([saveSchema]), args)
    const directory = join(filesPath(), 'memories')
    const photos = images.map(data => {
      if (data.byteLength > MEMORY_MAX_IMAGE_BYTES) fail('MEMORY_IMAGE_TOO_LARGE', '单张照片不能超过 12MB。')
      const bytes = Buffer.from(data)
      const format = detectAssetFormat(bytes.subarray(0, 4096))
      if (format?.kind !== 'image') fail('MEMORY_IMAGE_INVALID', '请选择有效的 PNG、JPG、WebP、GIF 或 AVIF 图片。')
      return { bytes, name: `${randomUUID()}${format.extension}` }
    })
    const written: string[] = []
    let result: ReturnType<typeof saveMemory>
    try {
      if (photos.length) await mkdir(directory, { recursive: true })
      for (const photo of photos) {
        const file = await open(join(directory, photo.name), 'wx')
        written.push(photo.name)
        try { await file.writeFile(photo.bytes) }
        finally { await file.close() }
      }
      if (directory !== join(filesPath(), 'memories')) {
        fail('MEMORY_STORAGE_CHANGED', '数据保存位置已变化，请重新保存这条记录。')
      }
      result = saveMemory(input, written)
    } catch (error) {
      await discardImages(directory, written)
      throw error
    }
    await discardImages(directory, result.removedImages)
    return result.entry
  })
  ipcMain.handle(channels.memoriesRemove, async (_event, ...args: unknown[]) => {
    const [entryId] = validate(z.tuple([id]), args)
    const directory = join(filesPath(), 'memories')
    await discardImages(directory, removeMemory(entryId))
  })
}
