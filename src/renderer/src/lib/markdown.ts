import { Marked, marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'

marked.setOptions({ gfm: true, breaks: true })

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** [[双链]]：按标题链接到另一条笔记，存取都是 `[[标题]]` 原文。 */
const wikilinkExtension = {
  name: 'wikilink',
  level: 'inline' as const,
  start(src: string): number | undefined {
    const index = src.indexOf('[[')
    return index < 0 ? undefined : index
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^\[\[([^\][\n]{1,120})\]\]/.exec(src)
    if (!match) return undefined
    const title = match[1].trim()
    if (!title) return undefined
    return { type: 'wikilink', raw: match[0], title, tokens: [] }
  },
  renderer(token: Tokens.Generic): string {
    const title = String(token['title'] ?? '')
    return `<a data-wiki="${escapeHtml(title)}">${escapeHtml(title)}</a>`
  }
}

// 展示（首页、AI 等正文渲染）与编辑器互转都要识别双链。
marked.use({ extensions: [wikilinkExtension] })

// TipTap 的任务列表只接受任务项。把混排的普通列表项与任务项按原顺序分组。
const noteMarkdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    list(list) {
      if (list.ordered || !list.items.some(item => item.task)) return false

      let html = ''
      let inTaskList: boolean | undefined
      for (const item of list.items) {
        if (item.task !== inTaskList) {
          if (inTaskList !== undefined) html += '</ul>\n'
          html += item.task ? '<ul data-type="taskList">\n' : '<ul>\n'
          inTaskList = item.task
        }
        html += item.task
          ? `<li data-type="taskItem" data-checked="${Boolean(item.checked)}">${this.parser.parse(item.tokens)}</li>\n`
          : this.listitem(item)
      }
      return `${html}</ul>\n`
    },
    // 勾选状态已经放在任务项上，实际控件由编辑器生成。
    checkbox() { return '' }
  }
})

noteMarkdown.use({ extensions: [wikilinkExtension] })

/** 允许本地资源协议，其余协议交给默认白名单。 */
const ALLOWED_URI = /^(?:(?:https?|mailto|tel|data|wb-asset|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export function noteImageWidth(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d{1,5}$/.test(value))) return null
  const width = Number(value)
  return Number.isInteger(width) && width >= 1 && width <= 16384 ? width : null
}

export function markdownToHtml(markdown: string, target: 'display' | 'note' = 'display'): string {
  const raw = (target === 'note' ? noteMarkdown : marked).parse(markdown, { async: false })
  return DOMPurify.sanitize(typeof raw === 'string' ? raw : '', {
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    // 表格单元格的 colspan/rowspan/align 必须显式保留，否则编辑器拿不到合并与对齐信息
    ADD_ATTR: ['target', 'rel', 'colspan', 'rowspan', 'align', 'width', 'data-note-image-row'],
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input']
  })
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  hr: '---'
})

turndown.addRule('taskItem', {
  filter: node => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
    return `- [${checked ? 'x' : ' '}] ${content.trim().replace(/\n/g, '\n  ')}${node.nextSibling ? '\n' : ''}`
  }
})

turndown.addRule('wikilink', {
  filter: node => node.nodeName === 'A' && node.hasAttribute('data-wiki'),
  replacement: (_, node) => `[[${(node as HTMLElement).getAttribute('data-wiki')}]]`
})

turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: content => `~~${content}~~`
})

turndown.addRule('sizedImage', {
  filter: node => node.nodeName === 'IMG' && node.hasAttribute('width'),
  replacement: (_, node) => (node as Element).outerHTML
})

turndown.addRule('imageRow', {
  filter: node => node.nodeName === 'DIV' && node.hasAttribute('data-note-image-row'),
  replacement: (_, node) => `\n\n${(node as Element).outerHTML}\n\n`
})

interface CellMarkdown { text: string; align: string | null }

function cellAlign(cell: Element): string | null {
  const raw = cell.getAttribute('align') ?? (cell as HTMLElement).style?.textAlign ?? ''
  const align = raw.trim().toLowerCase()
  return align === 'left' || align === 'right' || align === 'center' ? align : null
}

/** 单元格内容交给 turndown 处理以保留粗体/代码等行内格式，再压成单行。 */
function cellMarkdown(cell: Element): string {
  const html = cell.innerHTML.replace(/<br\s*\/?>/gi, ' ')
  return turndown.turndown(html).replace(/\s*\n+\s*/g, ' ').trim().replace(/\|/g, '\\|')
}

function rowCells(row: Element): CellMarkdown[] {
  return Array.from(row.children).flatMap(cell => {
    const span = Math.max(1, Number.parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1)
    const first: CellMarkdown = { text: cellMarkdown(cell), align: cellAlign(cell) }
    // GFM 不支持合并单元格，横向合并按占位空格展开，避免列数错位
    return [first, ...Array.from({ length: span - 1 }, () => ({ text: '', align: first.align }))]
  })
}

function alignMarker(align: string | null): string {
  if (align === 'left') return ':---'
  if (align === 'right') return '---:'
  if (align === 'center') return ':---:'
  return '---'
}

turndown.addRule('gfmTable', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from((node as Element).querySelectorAll('tr'))
      .map(rowCells)
      .filter(cells => cells.length > 0)
    if (!rows.length) return '\n\n'
    const columns = Math.max(...rows.map(cells => cells.length))
    const padded = rows.map(cells => [
      ...cells,
      ...Array.from({ length: columns - cells.length }, (): CellMarkdown => ({ text: '', align: null }))
    ])
    const [header, ...body] = padded
    const line = (cells: CellMarkdown[]): string => `| ${cells.map(cell => cell.text).join(' | ')} |`
    const lines = [
      line(header),
      `| ${header.map(cell => alignMarker(cell.align)).join(' | ')} |`,
      ...body.map(line)
    ]
    return `\n\n${lines.join('\n')}\n\n`
  }
})

export function htmlToMarkdown(html: string): string {
  const markdown = turndown.turndown(html)
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

/** GFM 表格分隔行，例如 `| :--- | ---: |` 或 `--- | ---`。 */
const TABLE_DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/

/**
 * 判断粘贴进来的纯文本是否包含 GFM 表格。
 * 用于富文本编辑器的纯文本粘贴：只有带分隔行的表格才转成真表格，避免把普通文本误当 Markdown 渲染。
 */
export function looksLikeMarkdownTable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  return lines.some((line, index) => index > 0 && lines[index - 1].includes('|') && TABLE_DELIMITER.test(line))
}

export interface OutlineItem { level: number; text: string; index: number }

export function outlineOf(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false
  markdown.split('\n').forEach((line, index) => {
    if (/^```/.test(line.trim())) { inFence = !inFence; return }
    if (inFence) return
    const match = /^(#{1,4})\s+(.+)$/.exec(line)
    if (match) items.push({ level: match[1].length, text: match[2].replace(/[*_`]/g, '').trim(), index })
  })
  return items.slice(0, 40)
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    // 表格：去掉分隔行与竖线，让列表摘要读起来是正常句子
    .replace(/^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(markdown: string): number {
  const text = markdown.replace(/!\[[^\]]*]\([^)]*\)|<[^>]*>/g, ' ')
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9']+/g)?.length ?? 0
  return cjk + latin
}
