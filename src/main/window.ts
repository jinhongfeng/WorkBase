import { BrowserWindow, app, nativeTheme } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface WindowState { width: number; height: number; x?: number; y?: number; maximized: boolean }
export function createWindow(): BrowserWindow {
  const statePath = join(app.getPath('userData'), 'window-state.json')
  let state: WindowState = { width: 1360, height: 860, maximized: false }
  if (existsSync(statePath)) {
    try {
      const saved = JSON.parse(readFileSync(statePath, 'utf8')) as WindowState
      if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) state = { ...saved, width: Math.max(1080, saved.width), height: Math.max(700, saved.height) }
    } catch { /* Corrupt window preferences do not affect user data. */ }
  }
  const tokens = readFileSync(join(app.getAppPath(), app.isPackaged ? 'dist/renderer/tokens.css' : 'src/renderer/src/styles/tokens.css'), 'utf8')
  const color = (key: string): string => {
    const block = nativeTheme.shouldUseDarkColors ? tokens.split('[data-theme="dark"]')[1] : tokens
    const match = block.match(new RegExp(`--${key}:\\s*([^;]+)`))
    if (!match) throw new Error(`Missing token ${key}`)
    return match[1].trim()
  }
  const window = new BrowserWindow({
    ...state, minWidth: 1080, minHeight: 700, show: false,
    title: 'WorkBase', icon: join(app.getAppPath(), 'resources/icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: color('surface'), symbolColor: color('text'), height: 40 },
    backgroundColor: color('bg'),
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  })
  window.once('ready-to-show', () => { if (state.maximized) window.maximize(); window.show() })
  window.on('close', () => writeFileSync(statePath, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() })))
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}
