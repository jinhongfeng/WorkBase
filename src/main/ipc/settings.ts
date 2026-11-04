import { ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { getAllSettings, setSetting } from '../db/repo/settings'
import { noArgs, validate } from './validation'
export function registerSettingsIPC(): void {
  ipcMain.handle(channels.getAll, (_event, ...args: unknown[]) => { validate(noArgs, args); return getAllSettings() })
  ipcMain.handle(channels.set, (_event, ...args: unknown[]) => {
    const [key, value] = validate(z.tuple([z.string().min(1).max(200), z.string().max(1000000)]), args)
    if (key === 'ui.pinned_modules') validate(z.array(z.string().min(1)), JSON.parse(value))
    setSetting(key, value)
  })
  ipcMain.handle(channels.setPinnedModules, (_event, ...args: unknown[]) => {
    const [ids] = validate(z.tuple([z.array(z.string().min(1).max(200)).max(1000)]), args)
    setSetting('ui.pinned_modules', JSON.stringify(ids))
  })
}
