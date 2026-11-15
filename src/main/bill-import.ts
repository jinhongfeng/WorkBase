import { parse } from 'csv-parse/sync'
import { ZipReader, Uint8ArrayReader, ERR_INVALID_PASSWORD, ERR_UNSAFE_FILENAME } from '@zip.js/zip.js'
import type { BillImportResult } from '@shared/bills'
import { saveBill, type BillRow } from './db/repo/bills'
import { AppError, fail } from './ipc/errors'

export const MAX_BILL_FILE_BYTES = 20 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024

function parseCsv(bytes: Uint8Array): { rows: BillRow[]; excluded: number } {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { text = new TextDecoder('gb18030').decode(bytes) }
  const header = [...text.matchAll(/^[^\r\n]+/gm)].find(([line]) =>
    line.includes(',') && ['交易时间', '交易分类', '交易状态', '金额'].every(column => line.includes(column)))
  if (!header) fail('BILL_PARSE_FAILED', '文件缺少支付宝交易明细表头。')
  let records: string[][]
  try {
    records = parse(text.slice(header.index), { bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 65536 })
  } catch {
    fail('BILL_PARSE_FAILED', '无法读取支付宝 CSV，请检查附件是否完整。')
  }
  const columns = records.shift() ?? []
  const time = columns.indexOf('交易时间')
  const category = columns.indexOf('交易分类')
  const status = columns.indexOf('交易状态')
  const amount = columns.findIndex(column => /^(金额|金额[（(]元[）)])$/.test(column))
  const order = columns.indexOf('交易订单号')
  const direction = columns.findIndex(column => column === '收/支' || column === '收支')
  const counterparty = columns.indexOf('交易对方')
  if ([time, category, status, amount].includes(-1)) fail('BILL_PARSE_FAILED', 'CSV 必须包含交易时间、交易分类、交易状态与金额。')
  const rows: BillRow[] = []
  let excluded = 0
  for (const record of records) {
    if (record.length <= Math.max(time, category, status, amount)) continue
    const date = record[time]
    if (record[status] !== '交易成功') {
      if (/^\d{4}-\d{2}-\d{2}/.test(date)) excluded++
      continue
    }
    const dateMatch = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?$/.exec(date)
    const clock = dateMatch?.[2] ?? '00:00:00'
    const timestamp = dateMatch ? Date.parse(dateMatch[1] + 'T' + clock + '+08:00') : NaN
    const money = /^(\d+)(?:\.(\d{1,2}))?$/.exec(record[amount].replace(/[¥￥,元\s]/g, ''))
    const amountCents = money ? Number(money[1]) * 100 + Number((money[2] ?? '').padEnd(2, '0')) : NaN
    if (!Number.isFinite(timestamp) || new Date(timestamp + 8 * 3600000).toISOString().slice(0, 19) !== dateMatch?.[1] + 'T' + clock || !Number.isSafeInteger(amountCents)) {
      fail('BILL_PARSE_FAILED', '发现交易成功记录的时间或金额格式无效，已停止导入此文件。')
    }
    rows.push({
      timestamp, category: record[category] || '未分类', amountCents, order: record[order] ?? '',
      // Normalize here instead of rebuilding the legacy table to add a CHECK constraint.
      direction: record[direction] === '收入' ? 'income' : 'expense',
      counterparty: record[counterparty] ?? ''
    })
  }
  return { rows, excluded }
}

async function readArchive(bytes: Uint8Array, password: string): Promise<Uint8Array[]> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false })
  try {
    const csvs: Uint8Array[] = []
    let count = 0
    let declaredBytes = 0
    let actualBytes = 0
    for await (const entry of reader.getEntriesGenerator()) {
      const path = entry.filename.replace(/\\/g, '/')
      declaredBytes += entry.uncompressedSize
      if (++count > 200 || entry.uncompressedSize > MAX_BILL_FILE_BYTES || declaredBytes > MAX_ARCHIVE_BYTES ||
        path.startsWith('/') || path.includes(':') || path.includes('\0') || path.split('/').includes('..')) {
        fail('BILL_ZIP_UNSAFE', '压缩包包含不安全的路径或超过解压上限。')
      }
      if (entry.directory || !path.toLowerCase().endsWith('.csv')) continue
      if (entry.encrypted && !password) fail('BILL_PASSWORD_REQUIRED', '请先输入支付宝发送的 ZIP 解压密码。')
      let size = 0
      const chunks: Uint8Array[] = []
      const output = new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.length
          actualBytes += chunk.length
          if (size > MAX_BILL_FILE_BYTES || actualBytes > MAX_ARCHIVE_BYTES) {
            fail('BILL_ZIP_UNSAFE', '压缩包超过解压上限。')
          }
          chunks.push(chunk)
        }
      })
      await entry.getData(output, { password: password || undefined, checkSignature: true })
      csvs.push(Buffer.concat(chunks, size))
    }
    if (!csvs.length) fail('BILL_PARSE_FAILED', '压缩包中没有 CSV 文件。')
    return csvs
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.message === ERR_INVALID_PASSWORD) fail('BILL_BAD_PASSWORD', '解压密码不正确，请核对支付宝服务消息。')
    if (error instanceof Error && error.message === ERR_UNSAFE_FILENAME) fail('BILL_ZIP_UNSAFE', '压缩包包含不安全的路径。')
    fail('BILL_ZIP_FAILED', '无法解压此 ZIP，请检查密码和附件是否完整。')
  } finally {
    await reader.close()
  }
}

export async function importBill(bytes: Uint8Array, fileName: string, source: 'email' | 'file', password: string): Promise<BillImportResult> {
  if (bytes.length > MAX_BILL_FILE_BYTES) fail('BILL_TOO_LARGE', '单个账单文件不能超过 20 MB。')
  const csvs = /\.zip$/i.test(fileName) ? await readArchive(bytes, password) : [bytes]
  const rows: BillRow[] = []
  let excluded = 0
  for (const csv of csvs) {
    const result = parseCsv(csv)
    for (const row of result.rows) rows.push(row)
    excluded += result.excluded
  }
  return saveBill(fileName, source, rows, excluded)
}
