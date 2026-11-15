import { ipcMain } from 'electron'
import { z } from 'zod'
import type { AIConfigInput, ChatRequest } from '@shared/types'
import { channels } from '@shared/ipc-contract'
import { generateArticle } from '../ai/article-writing'
import { generateDailyReport } from '../ai/daily-report'
import { chatStream, readAiConfig, saveAiConfig, testConnection } from '../ai/client'
import * as repository from '../db/repo/ai'
import { dayKey } from '../db/repo/activity'
import { AppError, fail } from './errors'
import { noArgs, validate } from './validation'

const configSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  model: z.string().trim().min(1).max(120),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(131072),
  apiKey: z.string().max(400).optional()
})

const chatSchema = z.object({
  requestId: z.string().min(1).max(64),
  threadId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(20000)
  })).min(1).max(40),
  temperature: z.number().min(0).max(2).optional()
})

function databaseAction<T>(run: () => T): T {
  try { return run() }
  catch (error) {
    if (error instanceof AppError) throw error
    fail('DB_ERROR', '无法读取或保存 AI 会话，请检查数据目录。')
  }
}

export function registerAiIPC(): void {
  const requests = new Map<string, { controller: AbortController; senderId: number; threadId: string }>()
  ipcMain.handle(channels.aiConfig, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return readAiConfig()
  })
  ipcMain.handle(channels.aiSaveConfig, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([configSchema]), args)
    return saveAiConfig(input as AIConfigInput)
  })
  ipcMain.handle(channels.aiTest, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return testConnection()
  })
  ipcMain.handle(channels.aiGenerateArticle, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      category: z.enum(['humanities', 'science', 'history']),
      topic: z.string().trim().max(120)
    })]), args)
    return generateArticle(input)
  })
  ipcMain.handle(channels.aiDailyReport, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })]), args)
    return generateDailyReport(input.date ?? dayKey(new Date()))
  })
  ipcMain.handle(channels.aiThreadsList, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return databaseAction(repository.listThreads)
  })
  ipcMain.handle(channels.aiThreadsCreate, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return databaseAction(repository.createThread)
  })
  ipcMain.handle(channels.aiThreadsMessages, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().uuid()]), args)
    return databaseAction(() => repository.getMessages(id))
  })
  ipcMain.handle(channels.aiThreadsRename, (_event, ...args: unknown[]) => {
    const [id, title] = validate(z.tuple([z.string().uuid(), z.string().trim().min(1).max(120)]), args)
    return databaseAction(() => repository.renameThread(id, title))
  })
  ipcMain.handle(channels.aiThreadsRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().uuid()]), args)
    if ([...requests.values()].some(request => request.threadId === id)) fail('AI_BUSY', '请先停止生成，再删除会话。')
    return databaseAction(() => repository.removeThread(id))
  })
  ipcMain.handle(channels.aiAbort, (event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    const active = requests.get(id)
    if (active?.senderId === event.sender.id) active.controller.abort()
  })
  ipcMain.handle(channels.aiChat, async (event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([chatSchema]), args)
    if (requests.has(input.requestId) || [...requests.values()].some(request => request.threadId === input.threadId)) fail('AI_BUSY', '这个会话正在生成，请稍候或停止生成。')
    const user = input.messages.at(-1)
    if (user?.role !== 'user') fail('INVALID_ARGUMENT', '请提供要发送的用户消息。')
    const history = databaseAction(() => repository.getRecentMessages(input.threadId, 38))
    const controller = new AbortController()
    requests.set(input.requestId, { controller, senderId: event.sender.id, threadId: input.threadId })
    const onDestroyed = (): void => controller.abort()
    event.sender.once('destroyed', onDestroyed)
    try {
      const content = await chatStream({ ...input, messages: [...history, user] } as ChatRequest, text => {
        if (!event.sender.isDestroyed()) event.sender.send(channels.aiDelta, input.requestId, text)
      }, controller.signal)
      databaseAction(() => repository.appendTurn(input.threadId, user.content, content))
      return { content }
    } finally {
      requests.delete(input.requestId)
      event.sender.removeListener('destroyed', onDestroyed)
    }
  })
  // 重新生成：裁掉末尾回复后，以上下文（含最后一条用户消息）直接请求，成功后只补写 assistant 消息。
  ipcMain.handle(channels.aiRegenerate, async (event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      requestId: z.string().min(1).max(64),
      threadId: z.string().uuid()
    })]), args)
    if (requests.has(input.requestId) || [...requests.values()].some(request => request.threadId === input.threadId)) fail('AI_BUSY', '这个会话正在生成，请稍候或停止生成。')
    const user = databaseAction(() => repository.trimForRegenerate(input.threadId))
    if (user === null) fail('AI_NOTHING_TO_REGENERATE', '没有可重新生成的回复。')
    const history = databaseAction(() => repository.getRecentMessages(input.threadId, 38))
    const controller = new AbortController()
    requests.set(input.requestId, { controller, senderId: event.sender.id, threadId: input.threadId })
    const onDestroyed = (): void => controller.abort()
    event.sender.once('destroyed', onDestroyed)
    try {
      const content = await chatStream({ ...input, messages: history } as ChatRequest, text => {
        if (!event.sender.isDestroyed()) event.sender.send(channels.aiDelta, input.requestId, text)
      }, controller.signal)
      databaseAction(() => repository.appendMessage(input.threadId, 'assistant', content))
      return { content }
    } finally {
      requests.delete(input.requestId)
      event.sender.removeListener('destroyed', onDestroyed)
    }
  })
}
