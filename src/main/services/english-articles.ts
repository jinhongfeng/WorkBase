import { net } from 'electron'
import { DomUtils, parseDocument, parseFeed } from 'htmlparser2'
import {
  ENGLISH_ARTICLE_IMAGE_LIMIT, ENGLISH_ARTICLE_IMAGE_MAX_BYTES, ENGLISH_ARTICLE_IMAGE_MIME,
  type EnglishArticle, type EnglishArticleImage, type EnglishArticleSummary, type EnglishArticleTopic
} from '@shared/english-articles'
import { detectAssetFormat } from '../assets'
import { AppError, fail } from '../ipc/errors'

const ORIGIN = 'https://learningenglish.voanews.com'
const IMAGE_ORIGIN = 'https://gdb.voanews.com'
const FEEDS: Record<EnglishArticleTopic, string> = {
  general: '/api/zkm-ql-vomx-tpej-rqi',
  science: '/api/zmg_pl-vomx-tpeymtm',
  health: '/api/zmmpql-vomx-tpey-_q'
}
const ARTICLE_PATH = /^\/a\/(?:(?<slug>[a-z0-9-]+)\/)?(?<id>\d{5,12})\.html$/i
const MAX_RESPONSE = 2 * 1024 * 1024

function parseArticleUrl(value: string): { id: string; url: string; hasSlug: boolean } | null {
  const url = URL.parse(value)
  if (!url || url.origin !== ORIGIN || url.username || url.password) return null
  const groups = ARTICLE_PATH.exec(url.pathname)?.groups
  return groups ? { id: groups.id, url: `${ORIGIN}${url.pathname}`, hasSlug: Boolean(groups.slug) } : null
}

export function requireArticleUrl(value: string): { id: string; url: string } {
  const link = parseArticleUrl(value) ?? fail('ARTICLE_URL', '请输入 VOA Learning English 的文章链接。')
  return { id: link.id, url: link.url }
}

function requestContent(url: string, format: 'xml' | 'html' | 'image/', articleId?: string): Promise<{ url: string; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, credentials: 'omit', redirect: 'manual', cache: 'no-store' })
    const abort = (code: string, message: string): void => {
      clearTimeout(timer)
      reject(new AppError(code, message))
      request.abort()
    }
    const networkError = (): void => abort('ARTICLE_NETWORK', '连接报道来源失败，请检查网络后重试。')
    const isImage = format === 'image/'
    const timer = setTimeout(networkError, isImage ? 5000 : 12_000)
    const maxBytes = isImage ? ENGLISH_ARTICLE_IMAGE_MAX_BYTES : MAX_RESPONSE
    let redirects = 0
    request.once('error', networkError)
    request.on('redirect', (_status, _method, target) => {
      const link = parseArticleUrl(target)
      if (!articleId || link?.id !== articleId || link.url !== target || redirects >= 2) {
        abort('ARTICLE_REDIRECT', '报道链接跳转到不支持的位置。')
        return
      }
      redirects++
      url = link.url
      request.followRedirect()
    })
    request.once('response', response => {
      response.once('error', networkError)
      if (response.statusCode < 200 || response.statusCode >= 300) {
        abort('ARTICLE_HTTP', `报道来源暂时无法访问（HTTP ${response.statusCode}）。`)
        return
      }
      const type = String(response.headers['content-type'] ?? '').toLowerCase()
      if (!(isImage ? type.startsWith(format) : type.includes(format))) {
        abort('ARTICLE_FORMAT', '报道来源返回了无法读取的内容。')
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > maxBytes) abort('ARTICLE_SIZE', '报道来源返回的内容过大。')
        else chunks.push(chunk)
      })
      response.once('end', () => {
        clearTimeout(timer)
        resolve({ url, bytes: Buffer.concat(chunks) })
      })
    })
    request.end()
  })
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function timestamp(value: string | Date | undefined): number | null {
  const time = value instanceof Date ? value.getTime() : Date.parse(value ?? '')
  return Number.isFinite(time) ? time : null
}

type SourceImage = Omit<EnglishArticleImage, 'mime' | 'base64'> & { url: string; key: string }
type HtmlElement = NonNullable<ReturnType<typeof DomUtils.findOne>>

function hasClass(node: HtmlElement, name: string): boolean {
  return node.attribs.class?.split(/\s+/).includes(name) ?? false
}

function imageUrl(src: string | undefined): { url: string; key: string } | null {
  const url = URL.parse(src ?? '', IMAGE_ORIGIN)
  if (!url || url.origin !== IMAGE_ORIGIN || url.username || url.password) return null
  const match = /^\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})(?:_[\da-z_-]+)?\.(?:jpe?g|png|webp|gif|avif)$/i.exec(url.pathname)
  return match ? { url: `${IMAGE_ORIGIN}${url.pathname}`, key: match[1].toLowerCase() } : null
}

function readFigure(figure: HtmlElement, beforeParagraph: number): SourceImage | null {
  const img = DomUtils.findOne(node => node.name === 'img', figure.children)
  const source = imageUrl(img?.attribs['data-src']) ?? imageUrl(img?.attribs.src)
  if (!source) return null
  const caption = DomUtils.findOne(node => node.name === 'figcaption', figure.children)
  return {
    ...source, beforeParagraph,
    alt: cleanText(img?.attribs.alt ?? '').slice(0, 1200),
    caption: cleanText(caption ? DomUtils.textContent(caption) : '').slice(0, 1200)
  }
}

export function articleImageMime(bytes: Buffer): EnglishArticleImage['mime'] | undefined {
  const format = detectAssetFormat(bytes)
  if (format?.kind === 'image') return ENGLISH_ARTICLE_IMAGE_MIME[format.extension as keyof typeof ENGLISH_ARTICLE_IMAGE_MIME]
}

async function downloadImage(source: SourceImage): Promise<EnglishArticleImage | null> {
  const { url, beforeParagraph, alt, caption } = source
  // VOA's article markup uses 250px thumbnails. Request the same photograph at reading width.
  const wider = url.replace(/_w250(_r\d+)_s\./i, '_w960$1.')
  const load = async (image: string): Promise<EnglishArticleImage | null> => {
    try {
      const { bytes } = await requestContent(image, 'image/')
      const mime = articleImageMime(bytes)
      return mime ? { beforeParagraph, alt, caption, mime, base64: bytes.toString('base64') } : null
    } catch { return null }
  }
  return await load(wider) ?? (wider !== url ? await load(url) : null)
}

export async function discoverEnglishArticles(topic: EnglishArticleTopic): Promise<EnglishArticleSummary[]> {
  const { bytes } = await requestContent(`${ORIGIN}${FEEDS[topic]}`, 'xml')
  const feed = parseFeed(bytes.toString('utf8'), { xmlMode: true })
  if (!feed) fail('ARTICLE_FORMAT', '无法读取报道列表，请稍后重试。')
  const articles = new Map<string, EnglishArticleSummary>()
  for (const item of feed.items) {
    const link = parseArticleUrl(item.link ?? '')
    const title = cleanText(item.title ?? '')
    // 此来源的订阅同时发布媒体页，正文条目使用带标题路径的链接。
    if (!link?.hasSlug || !title || title.length > 400) continue
    if (!articles.has(link.id)) articles.set(link.id, { id: link.id, url: link.url, title, publishedAt: timestamp(item.pubDate) })
  }
  return [...articles.values()].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

export async function fetchEnglishArticle(value: string): Promise<EnglishArticle> {
  const link = requireArticleUrl(value)
  const { url, bytes } = await requestContent(link.url, 'html', link.id)
  const doc = parseDocument(bytes.toString('utf8'))
  const title = cleanText(DomUtils.findOne(node => node.name === 'meta' && node.attribs.property === 'og:title', doc.children)?.attribs.content ?? '')
  const published = DomUtils.findOne(node => node.name === 'time' && 'pubdate' in node.attribs, doc.children)
  const article = DomUtils.getElementById('article-content', doc.children)
  const body = article && DomUtils.findOne(node => hasClass(node, 'wsw'), article.children)
  const cover = DomUtils.findOne(node => hasClass(node, 'cover-media'), doc.children)
  const coverFigure = cover && DomUtils.findOne(node => node.name === 'figure' && hasClass(node, 'media-image'), cover.children)
  const paragraphs: string[] = []
  const photos = new Map<string, SourceImage>()
  const addFigure = (figure: HtmlElement): void => {
    const image = readFigure(figure, paragraphs.length)
    if (image && !photos.has(image.key) && photos.size < ENGLISH_ARTICLE_IMAGE_LIMIT) photos.set(image.key, image)
  }
  if (coverFigure) addFigure(coverFigure)
  if (body) {
    const blocks = DomUtils.findAll(node => /^(p|h[2-6]|li|figure)$/.test(node.name), body.children)
    for (const node of blocks) {
      const photo = node.name === 'figure' && hasClass(node, 'media-image')
      if (node.name === 'figure' && !photo) continue
      let parent = node.parent
      while (parent && parent !== body) {
        if ('attribs' in parent && (/^(figure|figcaption|aside)$/.test(parent.name) || (!photo && hasClass(parent, 'wsw__embed')))) break
        parent = parent.parent
      }
      if (parent !== body) continue
      if (photo) addFigure(node)
      else {
        const text = cleanText(DomUtils.textContent(node))
        if (text) paragraphs.push(text)
      }
    }
  }
  if (!title || !paragraphs.some(text => text.length >= 40)) {
    fail('ARTICLE_NO_TEXT', '这篇报道没有可读取的正文，请选择另一篇。')
  }
  const images = (await Promise.all([...photos.values()].map(downloadImage))).filter(image => image !== null)
  return { id: link.id, url, title, publishedAt: timestamp(published?.attribs.datetime), paragraphs, images: photos.size && !images.length ? null : images }
}
