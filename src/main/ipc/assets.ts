import { app, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { saveImageDataUrl } from '../assets'
import { dataDirectory } from '../storage'
import { exportBackup } from '../services/backup'
import { noArgs, validate } from './validation'

export function registerAssetIPC(): void {
  ipcMain.handle(channels.assetsSaveImage, (_event, ...args: unknown[]) => {
    const [dataUrl] = validate(z.tuple([z.string().min(24).max(20_000_000)]), args)
    return saveImageDataUrl(dataUrl)
  })

  ipcMain.handle(channels.dataExport, async (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    const result = await dialog.showOpenDialog({
      title: '选择备份保存位置',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return exportBackup(result.filePaths[0])
  })

  ipcMain.handle(channels.dataReveal, async () => {
    await shell.openPath(dataDirectory())
  })
}
