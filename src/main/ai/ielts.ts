import { z } from 'zod'
import type { IeltsGenerateInput, IeltsGenerateResult, IeltsReading } from '@shared/types'
import { buildIeltsPrompt } from './prompts'
import { chatComplete, extractJson } from './client'
import { createSet, listSets } from '../db/repo/ielts'
import { fail } from '../ipc/errors'

const itemSchema = z.object({
  kind: z.string().optional(),
  term: z.string().min(1),
  phonetic: z.string().optional(),
  pos: z.string().optional(),
  meaning: z.string().min(1),
  example: z.string().optional(),
  translation: z.string().optional(),
  collocation: z.string().optional(),
  band: z.string().optional(),
  wordFamily: z.string().optional()
})

const responseSchema = z.object({ title: z.string().optional(), items: z.array(itemSchema).min(1) })
const text = (max: number) => z.string().trim().min(1).max(max)
const readingResponseSchema = responseSchema.extend({
  items: z.array(itemSchema.extend({
    term: text(400),
    phonetic: text(120),
    pos: text(40),
    meaning: text(600),
    example: text(800),
    translation: text(800),
    collocation: text(400)
  })).min(1).max(8),
  reading: z.object({
    passage: z.string().trim().max(8000).optional(),
    summary: text(1200),
    sentences: z.array(z.object({
      original: text(2000),
      structure: z.array(text(500)).min(1).max(8),
      translation: text(1200),
      imitation: text(1200),
      imitationTranslation: text(1200)
    })).min(1).max(2),
    substitutions: z.array(z.object({ original: text(300), replacement: text(500) })).min(1).max(6),
    patterns: z.array(text(500)).min(1).max(2)
  })
})

const clean = (value: string | undefined, max: number): string => (value ?? '').trim().slice(0, max)
const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ')

export async function generateIeltsSet(input: IeltsGenerateInput): Promise<IeltsGenerateResult> {
  const { system, user } = buildIeltsPrompt(input)
  const raw = await chatComplete([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], input.kind === 'reading' ? 0.4 : 0.85)

  let reading: IeltsReading | undefined
  const json = extractJson(raw)
  const parsed = input.kind === 'reading'
    ? readingResponseSchema.safeParse(json)
    : responseSchema.transform(data => ({ ...data, reading: undefined })).safeParse(json)
  if (!parsed.success) fail('AI_BAD_SHAPE', 'AI 返回的学习内容结构不完整，请重试一次。')

  if (input.kind === 'reading' && parsed.data.reading) {
    const passage = input.passage || parsed.data.reading.passage
    if (!passage) fail('AI_BAD_SHAPE', 'AI 没有返回英文短文，请重试。')
    const source = normalizeWhitespace(passage)
    if (parsed.data.reading.sentences.some(sentence => !source.includes(normalizeWhitespace(sentence.original)))) {
      fail('AI_BAD_SHAPE', 'AI 引用的句子和原文不一致，请重试。')
    }
    reading = { ...parsed.data.reading, passage }
  }

  const itemLimit = input.kind === 'reading' ? 8 : Math.max(input.count * 2, 12)
  const items = parsed.data.items.slice(0, itemLimit).map(item => ({
    kind: input.kind === 'reading' ? 'word' as const
      : input.kind === 'mixed' ? (item.kind === 'sentence' ? 'sentence' as const : 'word' as const) : input.kind,
    term: clean(item.term, 400),
    phonetic: clean(item.phonetic, 120),
    pos: clean(item.pos, 40),
    meaning: clean(item.meaning, 600),
    example: clean(item.example, 800),
    translation: clean(item.translation, 800),
    collocation: clean(item.collocation, 400),
    wordFamily: clean(item.wordFamily, 600),
    band: clean(item.band, 20)
  })).filter(item => item.term && item.meaning)

  if (!items.length) fail('AI_BAD_SHAPE', 'AI 没有返回可用的学习内容，请重试。')

  const title = clean(parsed.data.title, 80) || `${input.topic || '短文精读'} · ${input.level}`
  const { setId, items: saved } = createSet(title, input.topic, input.level, items, reading)
  const set = listSets().find(candidate => candidate.id === setId)
  if (!set) fail('IELTS_SET_MISSING', '学习包写入失败，请重试。')
  return { set, items: saved }
}
