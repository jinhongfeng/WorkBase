import { app, BrowserWindow, Menu, shell, dialog } from 'electron'
import { createWindow } from './window'
import { getDatabase, closeDatabase } from './db'
import { registerAppIPC } from './ipc/app'
import { registerSettingsIPC } from './ipc/settings'
import { logMain } from './log'

if (process.env.WORKBASE_USER_DATA) app.setPath('userData', process.env.WORKBASE_USER_DATA)
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '9222')
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) { event.preventDefault(); if (/^https?:\/\//i.test(url)) void shell.openExternal(url) }
    })
  })
  void app.whenReady().then(() => {
    app.setAppUserModelId('com.workbase.app')
    Menu.setApplicationMenu(null)
    getDatabase()
    registerAppIPC(); registerSettingsIPC(); createWindow()
    logMain('Application ready; local database opened')
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
  }).catch((error: unknown) => {
    logMain(`Startup failed: ${error instanceof Error ? error.message : String(error)}`)
    dialog.showErrorBox('WorkBase 启动失败', '无法初始化本地工作台，请检查数据目录与原生依赖。详细原因已写入 main.log。')
    app.exit(1)
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', closeDatabase)
}
