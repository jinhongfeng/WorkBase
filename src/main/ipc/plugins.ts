import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { channels } from '@shared/ipc-contract'
import { PLUGIN_SCHEME } from '@shared/plugins'
import { startPluginLibrary } from '../services/plugins'
import { filesPath } from '../storage'
import { fail } from './errors'
import { noArgs, validate } from './validation'

export function registerPluginIPC(): void {
  const directory = join(filesPath(), 'plugins')
  const library = startPluginLibrary(directory, () => {
    for (const { webContents } of BrowserWindow.getAllWindows()) {
      if (!webContents.isDestroyed()) webContents.send(channels.pluginsChanged)
    }
  })
  protocol.handle(PLUGIN_SCHEME, library.serve)
  app.once('will-quit', library.close)

  ipcMain.handle(channels.pluginsList, async (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    await library.ready
    return library.list()
  })
  ipcMain.handle(channels.pluginsOpenDirectory, async (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    try {
      await mkdir(directory, { recursive: true })
      if (!(await shell.openPath(directory))) return
    } catch { /* Report a directory that cannot be opened. */ }
    fail('PLUGINS_DIRECTORY_ERROR', '无法打开插件文件夹，请检查数据目录权限。')
  })
}
