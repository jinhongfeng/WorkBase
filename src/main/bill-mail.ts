import { safeStorage } from 'electron'
import { ImapFlow, type MessageStructureObject } from 'imapflow'
import type { BillAccount, BillImportResult } from '@shared/bills'
import { getDatabase } from './db'
import { importBill, MAX_BILL_FILE_BYTES } from './bill-import'
import { AppError, fail } from './ipc/errors'

const ACCOUNT_ID = 'qq-bills'
const HOST = 'imap.qq.com'
const PORT = 993
interface StoredAccount { username: string; secret: Buffer }

function account(): StoredAccount | undefined {
  return getDatabase().prepare('SELECT username, secret FROM mail_accounts WHERE id = ?').get(ACCOUNT_ID) as StoredAccount | undefined
}

export function readBillAccount(): BillAccount | null {
  const row = account()
  return row ? { email: row.username } : null
}

function connectClient(email: string, authorizationCode: string): ImapFlow {
  const client = new ImapFlow({
    host: HOST, port: PORT, secure: true, auth: { user: email, pass: authorizationCode },
    logger: false, disableAutoIdle: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000
  })
  client.on('error', () => client.close())
  return client
}

async function connect(client: ImapFlow): Promise<void> {
  try {
    await client.connect()
  } catch (error) {
    if (typeof error === 'object' && error && ('authenticationFailed' in error && error.authenticationFailed ||
      'responseStatus' in error && error.responseStatus === 'NO')) {
      fail('IMAP_AUTH_FAILED', 'QQ 邮箱拒绝了连接。请核对邮箱地址、IMAP 开关及邮箱授权码。')
    }
    fail('IMAP_CONNECTION_FAILED', '无法连接 QQ 邮箱，请检查网络与邮箱 IMAP 设置。')
  }
}

export async function saveBillAccount(email: string, authorizationCode: string): Promise<BillAccount> {
  if (!safeStorage.isEncryptionAvailable()) fail('SECRET_UNAVAILABLE', '当前系统无法加密保存邮箱授权码。')
  const client = connectClient(email, authorizationCode)
  try { await connect(client) } finally { client.close() }
  const secret = safeStorage.encryptString(authorizationCode)
  const db = getDatabase()
  db.transaction(() => db.prepare(`
    INSERT INTO mail_accounts(id,label,host,port,username,secret,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, secret=excluded.secret
  `).run(ACCOUNT_ID, 'QQ 支付宝账单', HOST, PORT, email, secret, Date.now()))()
  return { email }
}

function* attachmentParts(node: MessageStructureObject | undefined): Generator<{ part: string; name: string }> {
  if (!node) return
  const name = node.dispositionParameters?.filename || node.parameters?.name
  if (node.part && name && /\.(zip|csv)$/i.test(name)) yield { part: node.part, name }
  for (const child of node.childNodes ?? []) yield* attachmentParts(child)
}

export async function fetchBillMail(password: string, sinceDays: number): Promise<BillImportResult> {
  const row = account()
  if (!row) fail('IMAP_NOT_CONFIGURED', '请先在账单页连接 QQ 邮箱。')
  let authorizationCode: string
  try { authorizationCode = safeStorage.decryptString(row.secret) }
  catch { fail('IMAP_AUTH_FAILED', '邮箱授权码无法解密，请重新连接 QQ 邮箱。') }
  const client = connectClient(row.username, authorizationCode)
  const result: BillImportResult = { added: 0, duplicates: 0, excluded: 0, failures: [] }
  let found = 0
  try {
    await connect(client)
    const folders = await client.list()
    const since = new Date(Date.now() - sinceDays * 86400000)
    for (const folder of folders) {
      if (folder.flags.has('\\Noselect') || ['\\Trash', '\\Junk', '\\Sent', '\\Drafts'].includes(folder.specialUse ?? '') ||
        /已删除|垃圾|草稿|已发送/.test(folder.path)) continue
      const lock = await client.getMailboxLock(folder.path, { readOnly: true })
      try {
        const uids = await client.search({ since, from: 'alipay.com' }, { uid: true })
        if (!uids) fail('IMAP_SEARCH_FAILED', 'QQ 邮箱未能完成账单检索，请稍后重试。')
        if (!uids.length) continue
        const messages = await client.fetchAll(uids.slice(-100), { envelope: true, bodyStructure: true }, { uid: true })
        if (uids.length > 100) result.failures.push({ fileName: folder.path, message: '本次只检查最新 100 封匹配邮件，可缩短回溯天数后再试。' })
        for (const mail of messages) {
          if (!mail.envelope?.from?.some(item => /@(?:[a-z0-9-]+\.)*alipay\.com$/i.test(item.address ?? ''))) continue
          for (const part of attachmentParts(mail.bodyStructure)) {
            found++
            try {
              const { content } = await client.download(String(mail.uid), part.part, { uid: true, maxBytes: MAX_BILL_FILE_BYTES + 1 })
              if (!content) fail('IMAP_DOWNLOAD_FAILED', '附件内容无法读取。')
              const chunks: Buffer[] = []
              let size = 0
              for await (const chunk of content) {
                const bytes = Buffer.from(chunk)
                size += bytes.length
                if (size > MAX_BILL_FILE_BYTES) fail('BILL_TOO_LARGE', '单个账单文件不能超过 20 MB。')
                chunks.push(bytes)
              }
              const imported = await importBill(Buffer.concat(chunks, size), part.name, 'email', password)
              result.added += imported.added
              result.duplicates += imported.duplicates
              result.excluded += imported.excluded
            } catch (error) {
              result.failures.push({ fileName: part.name, message: error instanceof AppError ? JSON.parse(error.message).message : '未能读取或导入此附件。' })
            }
          }
        }
      } finally { lock.release() }
    }
    if (!found) fail('BILL_NOT_FOUND', '最近 ' + sinceDays + ' 天未找到支付宝 ZIP 或 CSV 附件，可手动导入。')
    return result
  } catch (error) {
    if (error instanceof AppError) throw error
    if (found) {
      result.failures.push({ fileName: 'QQ 邮箱', message: '连接中断，可重新获取。已导入的记录已保存。' })
      return result
    }
    fail('IMAP_READ_FAILED', '读取 QQ 邮箱失败，请检查网络或重新连接邮箱。')
  } finally { client.close() }
}
