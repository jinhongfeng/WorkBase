import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  ENGLISH_ARTICLE_IMAGE_LIMIT, ENGLISH_ARTICLE_IMAGE_MAX_BYTES, ENGLISH_ARTICLE_IMAGE_MIME, ENGLISH_ARTICLE_TOPICS
} from '@shared/english-articles'
import { channels } from '@shared/ipc-contract'
import { getEnglishArticle, listEnglishArticles, removeEnglishArticle, saveEnglishArticle, updateEnglishArticleImages } from '../db/repo/english-articles'
import { articleImageMime, discoverEnglishArticles, fetchEnglishArticle, requireArticleUrl } from '../services/english-articles'
import { fail } from './errors'
import { noArgs, validate } from './validation'

const articleId = z.string().regex(/^\d{5,12}$/)
const articleUrl = z.string().trim().min(1).max(1200)
const imageSchema = z.object({
  beforeParagraph: z.number().int().min(0).max(300),
  alt: z.string().max(1200),
  caption: z.string().max(1200),
  mime: z.enum(Object.values(ENGLISH_ARTICLE_IMAGE_MIME)),
  base64: z.base64().max(Math.ceil(ENGLISH_ARTICLE_IMAGE_MAX_BYTES / 3) * 4)
}).refine(image => {
  const bytes = Buffer.from(image.base64, 'base64')
  return bytes.length <= ENGLISH_ARTICLE_IMAGE_MAX_BYTES && articleImageMime(bytes) === image.mime
})
const articleSchema = z.object({
  title: z.string().trim().min(1).max(400),
  url: articleUrl,
  publishedAt: z.number().int().min(0).max(8.64e15).nullable(),
  paragraphs: z.array(z.string().trim().min(1).max(12000)).min(1).max(300)
    .refine(paragraphs => paragraphs.reduce((total, text) => total + text.length, 0) <= 200_000),
  images: z.array(imageSchema).max(ENGLISH_ARTICLE_IMAGE_LIMIT).nullable().default(null)
}).refine(article => article.images?.every(image => image.beforeParagraph <= article.paragraphs.length) ?? true)

export function registerEnglishArticlesIPC(): void {
  ipcMain.handle(channels.englishArticlesDiscover, (_event, ...args: unknown[]) => {
    const [topic] = validate(z.tuple([z.enum(ENGLISH_ARTICLE_TOPICS)]), args)
    return discoverEnglishArticles(topic)
  })
  ipcMain.handle(channels.englishArticlesFetch, (_event, ...args: unknown[]) => {
    const [url] = validate(z.tuple([articleUrl]), args)
    return fetchEnglishArticle(url)
  })
  ipcMain.handle(channels.englishArticlesList, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return listEnglishArticles()
  })
  ipcMain.handle(channels.englishArticlesGet, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([articleId]), args)
    return getEnglishArticle(id)
  })
  ipcMain.handle(channels.englishArticlesSave, (_event, ...args: unknown[]) => {
    const [article] = validate(z.tuple([articleSchema]), args)
    saveEnglishArticle({ ...article, ...requireArticleUrl(article.url) })
  })
  ipcMain.handle(channels.englishArticlesRefreshImages, async (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([articleId]), args)
    const original = getEnglishArticle(id) ?? fail('ARTICLE_NOT_FOUND', '这篇报道已从本地移除。')
    if (original.images !== null) return original
    const source = await fetchEnglishArticle(original.url)
    if (source.images === null) fail('ARTICLE_IMAGES_UNAVAILABLE', '暂时无法获取原文图片，请稍后重试。')
    updateEnglishArticleImages(source.images.length ? source : { ...original, images: [] })
    return getEnglishArticle(id) ?? fail('ARTICLE_NOT_FOUND', '这篇报道已从本地移除。')
  })
  ipcMain.handle(channels.englishArticlesRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([articleId]), args)
    removeEnglishArticle(id)
  })
}
