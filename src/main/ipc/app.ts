import { app, BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { dataDirectory, databasePath, filesPath } from '../storage'
import { setWindowTheme, setWallpaperContrast } from '../window'
import { noArgs, validate } from './validation'
export function registerAppIPC(): void {
  ipcMain.handle(channels.appSetWallpaperContrast, (event, ...args: unknown[]) => {
    // 参数仍做类型校验以保持契约；壁纸明暗已不影响 chrome 配色，故不落地。
    validate(z.tuple([z.boolean()]), args)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) setWallpaperContrast(window)
  })
  ipcMain.handle(channels.getPaths, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return {
      userData: app.getPath('userData'),
      dataDirectory: dataDirectory(),
      database: databasePath(),
      files: filesPath()
    }
  })
  ipcMain.handle(channels.getVersion, (_event, ...args: unknown[]) => { validate(noArgs, args); return app.getVersion() })
  ipcMain.handle(channels.setWindowTheme, (event, ...args: unknown[]) => {
    const [theme] = validate(z.tuple([z.enum(['light', 'dark'])]), args)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) setWindowTheme(window, theme === 'dark')
  })
  ipcMain.handle(channels.appGetLoginItem, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle(channels.appSetLoginItem, (_event, ...args: unknown[]) => {
    const [enabled] = validate(z.tuple([z.boolean()]), args)
    try { app.setLoginItemSettings({ openAtLogin: enabled }) } catch { /* 系统拒绝时按当前状态返回 */ }
    return app.getLoginItemSettings().openAtLogin
  })
}
