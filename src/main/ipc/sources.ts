import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { SOURCE_MAX_NAME, SOURCE_MAX_URL } from '@shared/sources'
import { addSource, getEntry, getSourceEntryBody, getSourceUrl, listSourceEntries, listSources, removeSource, saveSourceEntryBody, setEntryRead, updateSource } from '../db/repo/sources'
import { readSourceArticle } from '../services/rss-article'
import { refreshSources, validateSourceUrl } from '../services/rss'
import { fail } from './errors'
import { noArgs, validate } from './validation'

const listSchema = z.tuple([z.object({
  sourceId: z.string().min(1).max(64),
  q: z.string().max(200).optional(),
  unreadOnly: z.boolean().optional(),
  page: z.number().int().min(0).max(10_000)
})])

function sourceEntryLink(id: string): URL {
  const entry = getEntry(id)
  if (!entry?.link) fail('SOURCE_ENTRY_NO_LINK', '这条文章没有原文链接。')
  const url = URL.parse(entry.link, getSourceUrl(entry.sourceId) ?? undefined)
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('SOURCE_ENTRY_INVALID_LINK', '原文链接无效，须使用 HTTP 或 HTTPS。')
  }
  return url
}

export function registerSourcesIPC(): void {
  ipcMain.handle(channels.sourcesList, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return listSources()
  })
  ipcMain.handle(channels.sourcesEntries, (_event, ...args: unknown[]) => {
    const [input] = validate(listSchema, args)
    return listSourceEntries(input.sourceId, { q: input.q, unreadOnly: input.unreadOnly, page: input.page })
  })
  ipcMain.handle(channels.sourcesAdd, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      name: z.string().trim().min(1).max(SOURCE_MAX_NAME),
      url: z.string().trim().min(1).max(SOURCE_MAX_URL)
    })]), args)
    const url = validateSourceUrl(input.url)
    return addSource(input.name, url)
  })
  ipcMain.handle(channels.sourcesUpdate, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64),
      name: z.string().trim().min(1).max(SOURCE_MAX_NAME).optional(),
      enabled: z.boolean().optional()
    })]), args)
    return updateSource(input)
  })
  ipcMain.handle(channels.sourcesRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    return removeSource(id)
  })
  ipcMain.handle(channels.sourcesRefresh, async (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64).nullable()
    })]), args)
    return { results: await refreshSources(input.id) }
  })
  ipcMain.handle(channels.sourcesSetRead, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64),
      read: z.boolean()
    })]), args)
    setEntryRead(input.id, input.read)
  })
  ipcMain.handle(channels.sourcesReadEntry, async (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64),
      download: z.boolean().optional()
    })]), args)
    const cached = getSourceEntryBody(input.id)
    if (cached || !input.download) return cached
    const body = await readSourceArticle(sourceEntryLink(input.id))
    if (!body) fail('SOURCE_ARTICLE_UNAVAILABLE', '这个网页暂时无法提取正文，可用浏览器打开原文。')
    saveSourceEntryBody(input.id, body)
    return getSourceEntryBody(input.id)
  })
  ipcMain.handle(channels.sourcesOpenEntry, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    await shell.openExternal(sourceEntryLink(id).href)
  })
}
