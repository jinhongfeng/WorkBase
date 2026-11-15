import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { removeDailyBrief } from '../db/repo/daily-briefs'
import { startDailyBriefSync } from '../services/daily-briefs'
import { noArgs, validate } from './validation'

export function registerDailyBriefIPC(): void {
  const notifyChanged = (): void => {
    for (const { webContents } of BrowserWindow.getAllWindows()) {
      if (!webContents.isDestroyed()) webContents.send(channels.dailyBriefsChanged)
    }
  }
  const sync = startDailyBriefSync(notifyChanged)
  ipcMain.handle(channels.dailyBriefsList, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return sync.list()
  })
  ipcMain.handle(channels.dailyBriefsRefresh, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return sync.refresh()
  })
  ipcMain.handle(channels.dailyBriefsRemove, (_event, ...args: unknown[]) => {
    const [date] = validate(z.tuple([z.iso.date()]), args)
    removeDailyBrief(date)
    notifyChanged()
  })
}
