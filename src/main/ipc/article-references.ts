import { ipcMain } from 'electron'
import { z } from 'zod'
import { REFERENCE_LIMIT, REFERENCE_TEXT_LIMIT, PERSPECTIVE_LIMIT, rankingPlatformIds } from '@shared/article-references'
import { channels } from '@shared/ipc-contract'
import { analyzeReferences, createReferenceContent } from '../ai/article-references'
import { discoverReferenceRanking } from '../services/reference-rankings'
import { validate } from './validation'

const category = z.enum(['humanities', 'science', 'history'])
const rankingQuery = z.union([category, z.object({
  platform: z.enum(rankingPlatformIds), category: z.union([category, z.literal('all')]).optional()
})])
const referenceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1600),
  text: z.string().trim().max(REFERENCE_TEXT_LIMIT)
})
const analysisSchema = z.object({
  category,
  references: z.array(referenceSchema).min(1).max(REFERENCE_LIMIT),
  perspective: z.string().trim().max(PERSPECTIVE_LIMIT)
})
const createBrief = z.object({
  category,
  perspective: z.string().trim().min(1).max(PERSPECTIVE_LIMIT),
  angle: z.object({ title: z.string().trim().min(1).max(120), stance: z.string().trim().min(1).max(400) }),
  techniques: z.array(z.string().trim().min(1).max(240)).min(1).max(REFERENCE_LIMIT)
})
const createSchema = z.discriminatedUnion('format', [
  createBrief.extend({ format: z.literal('article') }),
  createBrief.extend({ format: z.literal('video'), seconds: z.number().int().min(30).max(180) })
])

export function registerArticleReferenceIPC(): void {
  ipcMain.handle(channels.articleReferencesDiscover, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([rankingQuery]), args)
    return discoverReferenceRanking(typeof query === 'string' ? { platform: 'bilibili', category: query } : query)
  })
  ipcMain.handle(channels.articleReferencesAnalyze, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([analysisSchema]), args)
    return analyzeReferences(input)
  })
  ipcMain.handle(channels.articleReferencesCreate, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([createSchema]), args)
    return createReferenceContent(input)
  })
}
