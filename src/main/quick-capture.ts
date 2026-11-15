import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { channels } from '@shared/ipc-contract'
import { logMain } from './log'

const QUICK_SHORTCUT = 'CommandOrControl+Shift+Space'
const SIZE = { width: 480, height: 220 }
let captureWindow: BrowserWindow | null = null

function createCaptureWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...SIZE, show: false, frame: false, resizable: false, fullscreenable: false,
    minimizable: false, maximizable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: true, title: 'WorkBase 速记',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  // 与主窗口共用渲染入口；hash 带 bare=1 时 App 只渲染速记页，不带工作台外壳。
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/quick-capture?bare=1`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'quick-capture?bare=1' })
  }
  window.on('blur', () => { if (window.isVisible()) window.hide() })
  window.on('closed', () => { if (captureWindow === window) captureWindow = null })
  return window
}

function toggleCaptureWindow(): void {
  if (!captureWindow) captureWindow = createCaptureWindow()
  if (captureWindow.isVisible()) {
    captureWindow.hide()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  captureWindow.setPosition(
    Math.round(workArea.x + (workArea.width - SIZE.width) / 2),
    Math.round(workArea.y + (workArea.height - SIZE.height) / 3)
  )
  captureWindow.show()
  captureWindow.focus()
}

/** 判断窗口是否为速记浮窗；通知点击回主窗口时用它排除浮窗。 */
export function isCaptureWindow(window: BrowserWindow): boolean {
  return window === captureWindow
}

/** 注册全局速记快捷键与浮窗；注册失败只记日志，不影响主窗口。 */
export function setupQuickCapture(): void {
  ipcMain.on(channels.quickCaptureHide, () => { captureWindow?.hide() })
  try {
    globalShortcut.register(QUICK_SHORTCUT, toggleCaptureWindow)
  } catch (error) {
    logMain(`Quick capture shortcut failed: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  app.on('will-quit', () => { globalShortcut.unregister(QUICK_SHORTCUT) })
}
