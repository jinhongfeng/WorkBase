import { clipboard } from 'electron'
import { getAllSettings } from '../db/repo/settings'
import { captureClipboardText } from '../db/repo/clipboard'
import { logMain } from '../log'

const POLL_MS = 1500
const MAX_TEXT_LENGTH = 20_000

let lastSeen = ''

async function tick(): Promise<void> {
  try {
    // 关闭记录时不读剪贴板，也不清历史。
    if (getAllSettings()['clipboard.enabled'] === '0') {
      lastSeen = ''
      return
    }
    const text = await clipboard.readText()
    if (!text || text.length > MAX_TEXT_LENGTH) return
    if (text === lastSeen) return
    lastSeen = text
    captureClipboardText(text)
  } catch (error) {
    logMain(`Clipboard watcher failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 启动本地剪贴板轮询：仅记录文本，1.5s 一次，去重连续相同内容，容量 500 条（置顶除外）。 */
export function setupClipboardWatcher(): void {
  setInterval(tick, POLL_MS)
}
