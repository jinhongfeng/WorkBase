import { DomUtils, parseDocument } from 'htmlparser2'
import { fetchSourceArticle } from './rss-web'

type Node = ReturnType<typeof parseDocument>['children'][number]
type Element = NonNullable<ReturnType<typeof DomUtils.findOne>>

const MAX_ARTICLE_LENGTH = 256 * 1024
const ARTICLE_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 's', 'del', 'sub', 'sup', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd'
])
const OMIT_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'img', 'video', 'audio', 'picture', 'canvas', 'aside', 'nav', 'footer'
])
const ARTICLE_SECTION = /(?:^|\s)(?:article-body|article-content|entry-body|entry-content|post-body|post-content|story-body|story-content|main-content)(?:\s|$)/i
const PAGE_CHROME = /(?:^|\s)(?:comments?|comment-list|trackback|share-buttons|related-posts|newsletter-signup|social-links|site-header|site-footer)(?:\s|$)/i

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function serialize(node: Node, baseUrl: string, depth: number): string {
  if (depth > 48) return ''
  if (node.type === 'text') return escapeHtml(node.data)
  if (!('attribs' in node)) return ''
  const tag = node.name.toLowerCase()
  if (OMIT_TAGS.has(tag) || PAGE_CHROME.test(`${node.attribs.id ?? ''} ${node.attribs.class ?? ''}`)) return ''
  if (tag === 'br' || tag === 'hr') return `<${tag}>`
  const inner = node.children.map(child => serialize(child, baseUrl, depth + 1)).join('')
  if (tag === 'a') {
    const url = node.attribs.href && URL.parse(node.attribs.href, baseUrl)
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return inner
    return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
  }
  return ARTICLE_TAGS.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
}

function cleanArticle(nodes: Node[], baseUrl: string): string | null {
  const html = nodes.map(node => serialize(node, baseUrl, 0)).join('').trim()
  if (!html || html.length > MAX_ARTICLE_LENGTH) return null
  return DomUtils.textContent(parseDocument(html).children).trim() ? html : null
}

export function articleFromFeed(entry: Element, baseUrl: string): string | null {
  const explicit = DomUtils.findOne(node => node.parent === entry && ['content', 'content:encoded'].includes(node.name), entry.children)
  const description = DomUtils.findOne(node => node.parent === entry && node.name === 'description', entry.children)
  const content = explicit ?? (description && DomUtils.textContent(description).length > 1_200 ? description : null)
  if (!content || content.attribs.src) return null
  const base = URL.parse(content.attribs['xml:base'] ?? baseUrl, baseUrl)?.href ?? baseUrl
  if (DomUtils.findOne(() => true, content.children)) return cleanArticle(content.children, base)
  const text = DomUtils.textContent(content)
  if (content.attribs.type === 'text') return text.trim() ? `<p>${escapeHtml(text).slice(0, MAX_ARTICLE_LENGTH - 7)}</p>` : null
  return cleanArticle(parseDocument(text).children, base)
}

function sectionScore(element: Element): number {
  const paragraphs = DomUtils.findAll(node => node.name === 'p' || node.name === 'pre', element.children)
  return paragraphs.reduce((sum, paragraph) => {
    const text = DomUtils.textContent(paragraph).trim()
    return text.length >= 24 ? sum + text.length : sum
  }, 0)
}

/** 先找发布方标出的正文，再使用 article 或 main。 */
export async function readSourceArticle(url: URL): Promise<string | null> {
  const resource = await fetchSourceArticle(url)
  if (!resource) return null
  const encoding = /charset\s*=\s*["']?([\w-]+)/i.exec(resource.contentType)?.[1]
  let text: string
  try { text = new TextDecoder(encoding).decode(resource.bytes) }
  catch { text = resource.bytes.toString('utf8') }
  const document = parseDocument(text)
  const declared = DomUtils.findAll(node => node.attribs.itemprop === 'articleBody' ||
    ARTICLE_SECTION.test(`${node.attribs.id ?? ''} ${node.attribs.class ?? ''}`), document.children)
  const semantic = DomUtils.findAll(node => node.name === 'article', document.children)
  const main = DomUtils.findAll(node => node.name === 'main' || node.attribs.role === 'main', document.children)
  for (const candidates of [declared, semantic, main]) {
    const ranked = candidates.map(node => ({ node, score: sectionScore(node) })).sort((left, right) => right.score - left.score)
    for (const { node, score } of ranked) {
      if (score < 120) break
      const article = cleanArticle(node.children, resource.url.href)
      if (article) return article
    }
  }
  return null
}
