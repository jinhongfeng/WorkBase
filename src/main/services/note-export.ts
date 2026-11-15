import { BrowserWindow, dialog, type FileFilter } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { marked } from 'marked'
import { contentTypeFor, resolveAssetPath } from '../assets'
import { getNote } from '../db/repo/notes'
import { fail } from '../ipc/errors'

export type NoteExportFormat = 'md' | 'html' | 'pdf'

// 导出产物脱离应用运行，无法引用 tokens.css；以下固定色为阅读/打印优化的静态值（外观一致性约束第 3 条豁免）。
const EXPORT_CSS = `
  body { font-family: "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei UI", sans-serif;
         color: #202923; max-width: 760px; margin: 40px auto; padding: 0 24px; line-height: 1.7; font-size: 15px; }
  h1, h2, h3, h4 { line-height: 1.3; margin: 1.4em 0 .6em; }
  h1 { font-size: 26px; } h2 { font-size: 20px; } h3 { font-size: 17px; }
  img { max-width: 100%; }
  pre { background: #141A18; color: #F1EEE6; padding: 12px 14px; border-radius: 8px; overflow: auto;
        font-family: "JetBrains Mono", Consolas, monospace; font-size: 13px; }
  code { font-family: "JetBrains Mono", Consolas, monospace; font-size: .9em; background: #F6F8F6;
         padding: 2px 4px; border-radius: 4px; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #E1E8E3; padding: 6px 10px; text-align: left; }
  blockquote { margin: 1em 0; padding: 4px 16px; border-left: 3px solid #2C5F52; background: #F6F8F6; color: #4F5D54; }
  a { color: #2C5F52; }
  hr { border: 0; border-top: 1px solid #E1E8E3; }
  .doc-title { font-size: 26px; font-weight: 700; margin: 0 0 24px; }
`

/** 把 wb-asset 本地资源内联为 data URI，导出的 HTML/PDF 离线可见图片。 */
function inlineAssetUrls(markdown: string): string {
  return markdown.replace(/wb-asset:\/\/([a-z-]+)\/([0-9a-f-]{36}\.[a-z0-9]+)/gi, (match, hostname: string, name: string) => {
    const file = resolveAssetPath(hostname, `/${name}`)
    if (!file || !existsSync(file)) return match
    try {
      return `data:${contentTypeFor(file)};base64,${readFileSync(file).toString('base64')}`
    } catch {
      return match
    }
  })
}

function buildStandaloneHtml(title: string, markdown: string): string {
  const body = marked.parse(inlineAssetUrls(markdown), { async: false }) as string
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<h1 class="doc-title">${title}</h1>
${body}
</body>
</html>`
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned || '笔记'
}

async function printToPdf(html: string): Promise<Buffer> {
  const tempFile = join(tmpdir(), `workbase-export-${randomUUID()}.html`)
  writeFileSync(tempFile, html)
  const window = new BrowserWindow({
    show: false, webPreferences: {
      preload: undefined, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
    }
  })
  try {
    await window.loadFile(tempFile)
    return Buffer.from(await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }))
  } finally {
    window.destroy()
    try { rmSync(tempFile, { force: true }) } catch { /* 临时文件清理失败不影响导出结果 */ }
  }
}

/** 导出已保存的笔记：md 原文、html 独立页面（图片内联）、pdf 打印版。返回写入路径，用户取消时为 null。 */
export async function exportNote(input: { id: string; format: NoteExportFormat }): Promise<{ path: string } | null> {
  const note = getNote(input.id)
  if (!note) fail('NOTE_NOT_FOUND', '这条笔记已被删除。')
  const title = (note.title || '无标题笔记').trim()
  const fileName = safeFileName(title)

  const extension = input.format
  const filters: FileFilter[] = input.format === 'md'
    ? [{ name: 'Markdown', extensions: ['md'] }]
    : input.format === 'html'
      ? [{ name: 'HTML 页面', extensions: ['html'] }]
      : [{ name: 'PDF 文档', extensions: ['pdf'] }]
  const target = await dialog.showSaveDialog({
    title: '导出笔记',
    defaultPath: `${fileName}.${extension}`,
    filters
  })
  if (target.canceled || !target.filePath) return null

  try {
    if (input.format === 'md') {
      writeFileSync(target.filePath, note.content, 'utf8')
    } else if (input.format === 'html') {
      writeFileSync(target.filePath, buildStandaloneHtml(title, note.content), 'utf8')
    } else {
      writeFileSync(target.filePath, await printToPdf(buildStandaloneHtml(title, note.content)))
    }
  } catch (error) {
    fail('EXPORT_FAILED', `导出失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return { path: target.filePath }
}
