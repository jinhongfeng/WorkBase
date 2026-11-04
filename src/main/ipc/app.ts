import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { channels } from '@shared/ipc-contract'
import { noArgs, validate } from './validation'
export function registerAppIPC(): void {
  ipcMain.handle(channels.getPaths, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    const userData = app.getPath('userData')
    return { userData, database: join(userData, 'data/workbench.db'), files: join(userData, 'files') }
  })
  ipcMain.handle(channels.getVersion, (_event, ...args: unknown[]) => { validate(noArgs, args); return app.getVersion() })
}
