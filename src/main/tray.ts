import { app, BrowserWindow, dialog, Menu, Tray } from 'electron'
import { join } from 'node:path'
import { logMain } from './log'
import { getAllSettings, setSetting } from './db/repo/settings'
import { isQuitApproved } from './quit'

const CLOSE_ACTION_KEY = 'app.close_action'

export function showMainWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function setupTray(window: BrowserWindow): void {
  const tray = new Tray(join(app.getAppPath(), 'resources/icon.ico'))
  let endingSession = false
  let prompting = false
  let notified = false

  tray.setToolTip('WorkBase')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 WorkBase', click: () => showMainWindow(window) },
    { type: 'separator' },
    { label: '彻底退出', click: () => app.quit() }
  ]))
  tray.on('click', () => showMainWindow(window))
  tray.on('double-click', () => showMainWindow(window))
  tray.on('balloon-click', () => showMainWindow(window))

  window.on('query-session-end', () => { endingSession = true })
  app.on('will-quit', () => tray.destroy())

  const performCloseAction = (action: 'tray' | 'quit'): void => {
    if (action === 'quit') {
      app.quit()
      return
    }
    window.hide()
    if (!notified && process.platform === 'win32') {
      notified = true
      tray.displayBalloon({ title: 'WorkBase 已收起到托盘', content: '点击托盘图标重新打开，右键可彻底退出。', iconType: 'info' })
    }
  }

  window.on('close', (event) => {
    if (isQuitApproved() || endingSession) return
    event.preventDefault()
    if (prompting) return
    const rememberedAction = getAllSettings()[CLOSE_ACTION_KEY]
    if (rememberedAction === 'tray' || rememberedAction === 'quit') {
      performCloseAction(rememberedAction)
      return
    }
    prompting = true
    void dialog.showMessageBox(window, {
      type: 'question',
      title: '关闭 WorkBase',
      message: '要将 WorkBase 收起到托盘，还是彻底退出？',
      detail: '最小化到托盘后，应用会继续运行。点击任务栏右下角的 WorkBase 图标即可重新打开；也可以右键托盘图标选择“彻底退出”。',
      buttons: ['最小化到托盘', '彻底退出', '取消'],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: '记住我的选择',
      checkboxChecked: false,
      noLink: true
    }).then(({ response, checkboxChecked }) => {
      if (isQuitApproved() || endingSession || window.isDestroyed()) return
      if (response !== 0 && response !== 1) return
      const action = response === 0 ? 'tray' : 'quit'
      if (checkboxChecked) setSetting(CLOSE_ACTION_KEY, action)
      performCloseAction(action)
    }).catch((error: unknown) => {
      logMain(`Close prompt failed: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => { prompting = false })
  })
}
