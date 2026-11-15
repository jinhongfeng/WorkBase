import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { fetchBillMail, readBillAccount, saveBillAccount } from '../bill-mail'
import { importBill, MAX_BILL_FILE_BYTES } from '../bill-import'
import { applyBillRules, listBillRules, readBillBudget, readBillOverview, readBillRows, removeBillRule, saveBillRule, writeBillBudget } from '../db/repo/bills'
import { AppError, fail } from './errors'
import { noArgs, validate } from './validation'

const passwordSchema = z.string().max(256)
const accountSchema = z.object({
  email: z.email().max(120).regex(/@qq\.com$/i),
  authorizationCode: z.string().trim().min(1).max(128)
})
const fetchSchema = z.object({ password: passwordSchema.min(1), sinceDays: z.number().int().min(1).max(365) })

export function registerBillsIPC(): void {
  let importing = false
  let lockedFile: { id: string; owner: number; fileName: string; bytes: Buffer } | undefined
  async function exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (importing) fail('BILL_BUSY', '账单正在获取或导入，请稍候。')
    importing = true
    try { return await task() } finally { importing = false }
  }

  ipcMain.handle(channels.billAccount, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return readBillAccount()
  })
  ipcMain.handle(channels.billSaveAccount, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([accountSchema]), args)
    return exclusive(() => saveBillAccount(input.email, input.authorizationCode))
  })
  ipcMain.handle(channels.billOverview, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      range: z.enum(['all', '3m', '6m', '12m', 'thisYear', 'lastYear']),
      page: z.number().int().min(0).max(100000)
    })]), args)
    return readBillOverview(input.range, input.page)
  })
  ipcMain.handle(channels.billRows, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      range: z.enum(['all', '3m', '6m', '12m', 'thisYear', 'lastYear']),
      page: z.number().int().min(0).max(100000),
      query: z.string().trim().max(100).optional(),
      direction: z.enum(['income', 'expense']).optional()
    })]), args)
    return readBillRows(input.range, input.page, input.query, input.direction)
  })
  ipcMain.handle(channels.billFetchMail, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([fetchSchema]), args)
    return exclusive(() => fetchBillMail(input.password, input.sinceDays))
  })
  ipcMain.handle(channels.billImportFile, ({ sender }, ...args: unknown[]) => {
    validate(noArgs, args)
    return exclusive(async () => {
      lockedFile = undefined
      const window = BrowserWindow.fromWebContents(sender)
      if (!window) fail('BILL_IMPORT_UNAVAILABLE', '无法打开文件选择器，请重新打开账单页。')
      const result = await dialog.showOpenDialog(window, {
        title: '选择支付宝账单',
        properties: ['openFile'],
        filters: [{ name: '支付宝账单', extensions: ['csv', 'zip'] }]
      })
      if (result.canceled || !result.filePaths[0]) return null
      const path = result.filePaths[0]
      if (!/\.(csv|zip)$/i.test(path)) fail('BILL_PARSE_FAILED', '请选择支付宝 ZIP 或 CSV。')
      const file = await open(path, 'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > MAX_BILL_FILE_BYTES) fail('BILL_TOO_LARGE', '请选择 20 MB 以内的账单文件。')
        const chunks: Buffer[] = []
        for await (const chunk of file.createReadStream({ autoClose: false, end: MAX_BILL_FILE_BYTES })) chunks.push(Buffer.from(chunk))
        const bytes = Buffer.concat(chunks)
        const fileName = basename(path)
        try {
          return { result: await importBill(bytes, fileName, 'file', '') }
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== 'BILL_PASSWORD_REQUIRED') throw error
          const id = randomUUID()
          lockedFile = { id, owner: sender.id, fileName, bytes }
          return { lockedFile: { id, fileName } }
        }
      } finally { await file.close() }
    })
  })
  ipcMain.handle(channels.billUnlockFile, ({ sender }, ...args: unknown[]) => {
    const [{ id, password }] = validate(z.tuple([z.object({ id: z.uuid(), password: passwordSchema.min(1) })]), args)
    return exclusive(async () => {
      const file = lockedFile
      if (!file || file.id !== id || file.owner !== sender.id) fail('BILL_FILE_EXPIRED', '请重新选择要导入的账单文件。')
      const result = await importBill(file.bytes, file.fileName, 'file', password)
      lockedFile = undefined
      return result
    })
  })
  ipcMain.handle(channels.billCancelFileImport, ({ sender }, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.uuid()]), args)
    if (lockedFile?.id === id && lockedFile.owner === sender.id) lockedFile = undefined
  })
  const monthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
  ipcMain.handle(channels.billBudget, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ month: monthSchema })]), args)
    return readBillBudget(input.month)
  })
  ipcMain.handle(channels.billSetBudget, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      month: monthSchema,
      amountCents: z.number().int().min(0).max(10_000_000_000).nullable()
    })]), args)
    writeBillBudget(input.month, input.amountCents)
  })
  ipcMain.handle(channels.billRules, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return listBillRules()
  })
  ipcMain.handle(channels.billSaveRule, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64).optional(),
      pattern: z.string().trim().min(1).max(80),
      category: z.string().trim().min(1).max(40)
    })]), args)
    return saveBillRule(input)
  })
  ipcMain.handle(channels.billRemoveRule, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    return removeBillRule(id)
  })
  ipcMain.handle(channels.billApplyRules, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return applyBillRules()
  })
}
