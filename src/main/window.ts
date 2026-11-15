import { BrowserWindow, app, nativeTheme, screen } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface WindowState { width: number; height: number; x?: number; y?: number; maximized: boolean }
const MIN_WIDTH = 1080
const MIN_HEIGHT = 700
const TITLE_BAR_HEIGHT = 46

function readWindowState(path: string): WindowState {
  const fallback: WindowState = { width: 1360, height: 860, maximized: false }
  if (!existsSync(path)) return fallback
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as WindowState
    if (!Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return fallback

    const width = Math.max(MIN_WIDTH, Math.round(saved.width))
    const height = Math.max(MIN_HEIGHT, Math.round(saved.height))
    const maximized = saved.maximized === true
    const { x, y } = saved
    if (typeof x === 'number' && typeof y === 'number' && Number.isInteger(x) && Number.isInteger(y)) {
      const titleIsVisible = screen.getAllDisplays().some(({ workArea }) => {
        const visibleWidth = Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x)
        const visibleHeight = Math.min(y + TITLE_BAR_HEIGHT, workArea.y + workArea.height) - Math.max(y, workArea.y)
        return visibleWidth >= 120 && visibleHeight >= 24
      })
      if (titleIsVisible) return { width, height, x, y, maximized }
    }

    // A removed monitor may leave saved coordinates with no visible title bar.
    const { workArea } = screen.getPrimaryDisplay()
    return {
      width: Math.max(MIN_WIDTH, Math.min(width, workArea.width)),
      height: Math.max(MIN_HEIGHT, Math.min(height, workArea.height)),
      maximized
    }
  } catch {
    return fallback
  }
}

function windowColors(dark: boolean): { color: string; symbolColor: string; height: number } {
  const tokens = readFileSync(join(app.getAppPath(), app.isPackaged ? 'dist/renderer/tokens.css' : 'src/renderer/src/styles/tokens.css'), 'utf8')
  const block = dark ? tokens.split('[data-theme="dark"]')[1] : tokens
  const color = (key: string): string => {
    const match = block.match(new RegExp(`--${key}:\\s*([^;]+)`))
    if (!match) throw new Error(`Missing token ${key}`)
    return match[1].trim()
  }
  return { color: color('bg'), symbolColor: color('text'), height: TITLE_BAR_HEIGHT }
}

let themeDark = false

// 按钮区透明，显示渲染层的工作台标题栏或沉浸背景。
// 图标色只跟随主题，不跟随壁纸明暗：壁纸不再改变 chrome 配色，
// 否则深色壁纸会拿到浅色图标，而实际背景是浅色，图标直接看不见。
function titleBarOverlayColors(): { color: string; symbolColor: string; height: number } {
  const colors = windowColors(themeDark)
  return { color: '#00000000', symbolColor: colors.symbolColor, height: colors.height }
}

function applyWindowColors(window: BrowserWindow): void {
  window.setTitleBarOverlay(titleBarOverlayColors())
}

export function setWindowTheme(window: BrowserWindow, dark: boolean): void {
  themeDark = dark
  applyWindowColors(window)
}

// 壁纸明暗不再参与 chrome 配色。保留导出让既有调用链继续工作，
// 收到通知后只重新应用一次与主题一致的覆盖层。
export function setWallpaperContrast(window: BrowserWindow): void {
  applyWindowColors(window)
}

export function createWindow(): BrowserWindow {
  const statePath = join(app.getPath('userData'), 'window-state.json')
  const state = readWindowState(statePath)
  themeDark = nativeTheme.shouldUseDarkColors
  const overlay = titleBarOverlayColors()
  const window = new BrowserWindow({
    ...state, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, show: false,
    title: 'WorkBase', icon: join(app.getAppPath(), 'resources/icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: overlay,
    backgroundColor: windowColors(themeDark).color,
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false }
  })
  window.once('ready-to-show', () => { if (state.maximized) window.maximize(); window.show() })
  window.on('close', () => writeFileSync(statePath, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() })))
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}
