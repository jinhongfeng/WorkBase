import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { getReading, ieltsStats, listItems, listSets, removeSet, reviewItem } from '../db/repo/ielts'
import { generateIeltsSet } from '../ai/ielts'
import { validate } from './validation'
import { recordIeltsStudy } from '../db/repo/activity'

const level = z.enum(['6.0', '6.5', '7.0+'])
const generateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['word', 'sentence', 'mixed']),
    topic: z.string().min(1).max(80),
    level,
    count: z.number().int().min(3).max(24)
  }),
  z.object({
    kind: z.literal('reading'),
    topic: z.string().trim().max(80),
    level,
    passage: z.string().trim().max(8000).optional()
  }).refine(input => input.topic || input.passage, { message: '请输入学习主题或英文原文。' })
])

export function registerIeltsIPC(): void {
  const sessions = new Map<number, { sessionId: string; active: boolean; at: number }>()
  ipcMain.handle(channels.ieltsStudyPulse, (event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ sessionId: z.string().uuid(), active: z.boolean() })]), args)
    const now = Date.now()
    const previous = sessions.get(event.sender.id)
    if (!previous) event.sender.once('destroyed', () => sessions.delete(event.sender.id))
    if (previous?.sessionId === input.sessionId && previous.active) {
      // 后台节流、挂起或漏报不把整个间隔算作学习时间。
      const elapsed = Math.max(0, Math.min(now - previous.at, 15000))
      if (elapsed) recordIeltsStudy(now - elapsed, now)
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    sessions.set(event.sender.id, { ...input, active: input.active && Boolean(window?.isFocused() && window.isVisible() && !window.isMinimized()), at: now })
  })
  ipcMain.handle(channels.ieltsSets, () => listSets())
  ipcMain.handle(channels.ieltsReading, (_event, ...args: unknown[]) => {
    const [setId] = validate(z.tuple([z.string().min(1).max(64)]), args)
    return getReading(setId)
  })
  ipcMain.handle(channels.ieltsItems, (_event, ...args: unknown[]) => {
    const [setId] = validate(z.tuple([z.string().min(1).max(64).optional()]), args)
    return listItems(setId)
  })
  ipcMain.handle(channels.ieltsGenerate, async (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([generateSchema]), args)
    return generateIeltsSet(input)
  })
  ipcMain.handle(channels.ieltsReview, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ id: z.string().min(1).max(64), known: z.boolean() })]), args)
    return reviewItem(input.id, input.known)
  })
  ipcMain.handle(channels.ieltsRemoveSet, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    removeSet(id)
  })
  ipcMain.handle(channels.ieltsStats, () => ieltsStats())
}
