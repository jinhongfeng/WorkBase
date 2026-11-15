import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { noArgs, validate } from './ipc/validation'
import { logMain } from './log'

interface FlushRequest {
  id: string
  result: Promise<boolean>
  complete(saved: boolean): void
}

const ready = new WeakSet<WebContents>()
const pending = new Map<WebContents, FlushRequest>()
let quitApproved = false
let checkingQuit = false
let restartRequested = false

export function flushNotes(contents: WebContents): Promise<boolean> {
  if (contents.isDestroyed() || !ready.has(contents)) return Promise.resolve(true)
  const existing = pending.get(contents)
  if (existing) return existing.result

  const id = randomUUID()
  let finish!: (saved: boolean) => void
  const result = new Promise<boolean>(resolve => { finish = resolve })
  const onDestroyed = (): void => complete(false)
  const timeout = setTimeout(() => complete(false), 5000)
  function complete(saved: boolean): void {
    clearTimeout(timeout)
    contents.removeListener('destroyed', onDestroyed)
    pending.delete(contents)
    finish(saved)
  }
  pending.set(contents, { id, result, complete })
  contents.once('destroyed', onDestroyed)
  try { contents.send(channels.appFlushNotes, id) }
  catch { complete(false) }
  return result
}

export function isQuitApproved(): boolean {
  return quitApproved
}

export function requestRelaunch(): void {
  restartRequested = true
  setImmediate(() => app.quit())
}

function approveQuit(): void {
  if (restartRequested) app.relaunch()
  quitApproved = true
}

async function checkQuit(window: BrowserWindow): Promise<void> {
  window.setEnabled(false)
  const saved = await flushNotes(window.webContents).finally(() => {
    if (!window.isDestroyed()) window.setEnabled(true)
  })
  if (!saved && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '笔记尚未保存',
      message: '还有笔记未能保存。',
      detail: '返回编辑可以重试保存。继续退出会放弃尚未写入本机的修改。',
      buttons: ['返回编辑', '仍然退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (response !== 1) return
  }
  approveQuit()
  app.quit()
}

export function registerQuitCoordinator(): void {
  ipcMain.handle(channels.appCloseReady, (event, ...args: unknown[]) => {
    validate(noArgs, args)
    if (event.senderFrame !== event.sender.mainFrame || ready.has(event.sender)) return
    const contents = event.sender
    ready.add(contents)
    contents.once('render-process-gone', () => ready.delete(contents))
  })
  ipcMain.handle(channels.appFlushNotesResult, (event, ...args: unknown[]) => {
    const [id, saved] = validate(z.tuple([z.uuid(), z.boolean()]), args)
    if (event.senderFrame !== event.sender.mainFrame) return
    const request = pending.get(event.sender)
    if (request?.id === id) request.complete(saved)
  })
  app.on('before-quit', event => {
    if (quitApproved) return
    const window = BrowserWindow.getAllWindows().find(item => ready.has(item.webContents))
    if (!window) { approveQuit(); return }
    event.preventDefault()
    if (checkingQuit) return
    checkingQuit = true
    void checkQuit(window).catch((error: unknown) => {
      logMain(`Exit preparation failed: ${error instanceof Error ? error.message : String(error)}`)
      dialog.showErrorBox('无法安全退出', 'WorkBase 仍在运行。请保存笔记后重试。')
    }).finally(() => {
      checkingQuit = false
      restartRequested = false
    })
  })
}
