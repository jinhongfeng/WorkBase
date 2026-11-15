import { clipboard, ipcMain } from 'electron'
import { z } from 'zod'
import type { ClipboardQuery } from '@shared/types'
import { channels } from '@shared/ipc-contract'
import { captureClipboardText, clearClipboard, copyClipboardText, listClipboard, removeClipboardItem, toggleClipboardPin } from '../db/repo/clipboard'
import { setSetting } from '../db/repo/settings'
import { noArgs, validate } from './validation'

const querySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional()
}).default({})
const idSchema = z.tuple([z.string().min(1).max(64)])

export function registerClipboardIPC(): void {
  ipcMain.handle(channels.clipboardList, (_event, ...args: unknown[]) => {
    const [query] = validate(z.tuple([querySchema]), args)
    return listClipboard(query as ClipboardQuery)
  })
  ipcMain.handle(channels.clipboardCopy, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    const content = copyClipboardText(id)
    if (content === null) return false
    clipboard.writeText(content)
    // 写回系统剪贴板的内容同样进入历史并置顶位置。
    captureClipboardText(content)
    return true
  })
  ipcMain.handle(channels.clipboardPin, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    return toggleClipboardPin(id)
  })
  ipcMain.handle(channels.clipboardRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    removeClipboardItem(id)
  })
  ipcMain.handle(channels.clipboardClear, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    clearClipboard()
  })
  ipcMain.handle(channels.clipboardSetEnabled, (_event, ...args: unknown[]) => {
    const [enabled] = validate(z.tuple([z.boolean()]), args)
    setSetting('clipboard.enabled', enabled ? '1' : '0')
  })
}
