import { ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { addPageTime, pageTimeStats } from '../db/repo/pages'
import { validate } from './validation'

export function registerPagesIPC(): void {
  ipcMain.handle(channels.pageTimeTrack, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      page: z.string().min(1).max(64),
      seconds: z.number().int().min(1).max(7200)
    })]), args)
    addPageTime(input.page, input.seconds, Date.now())
  })
  ipcMain.handle(channels.pageTimeStats, (_event, ...args: unknown[]) => {
    const [year] = validate(z.tuple([z.number().int().min(2000).max(2200)]), args)
    return pageTimeStats(year)
  })
}
