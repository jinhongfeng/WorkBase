import { createHash, randomUUID } from 'node:crypto'
import type { BillBudgetOverview, BillDirection, BillImportResult, BillOverview, BillRange, BillRowsPage, BillRule, BillSummary } from '@shared/bills'
import { getDatabase } from '..'
import { fail } from '../../ipc/errors'

export interface BillRow {
  order: string
  timestamp: number
  category: string
  amountCents: number
  direction: BillDirection
  counterparty: string
}

function fingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function nextOccurrence(occurrences: Map<string, number>, signature: string): number {
  const occurrence = (occurrences.get(signature) ?? 0) + 1
  occurrences.set(signature, occurrence)
  return occurrence
}

export function saveBill(fileName: string, source: 'email' | 'file', rows: BillRow[], excluded: number): BillImportResult {
  const result: BillImportResult = { added: 0, duplicates: 0, excluded, failures: [] }
  if (!rows.length) return result
  const db = getDatabase()
  // 导入时按分类规则改写分类：交易对方包含关键字即命中，先创建的规则优先。
  const rules = listBillRules()
  const applied = rows.map(row => {
    const rule = rules.find(item => item.pattern && row.counterparty.includes(item.pattern))
    return rule ? { ...row, category: rule.category } : row
  })
  const id = randomUUID()
  const insert = db.prepare(`INSERT INTO bill_txns
    (fingerprint, import_id, ts, category, amount_cents, direction, counterparty)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO NOTHING`)
  const exists = db.prepare('SELECT 1 FROM bill_txns WHERE fingerprint = ?')
  const occurrences = new Map<string, number>()
  const legacyOccurrences = new Map<string, number>()
  return db.transaction(() => {
    db.prepare('INSERT INTO bill_imports VALUES (?, ?, ?, ?)').run(id, source, fileName, Date.now())
    for (const [index, row] of applied.entries()) {
      let key = `order:${row.order}`
      if (!row.order) {
        // 旧签名按导入时的原始分类计算：规则改写分类后重复导入仍按原口径判重。
        const original = rows[index]
        const fields = [original.timestamp, original.category, original.amountCents]
        const signature = JSON.stringify([...fields, row.direction])
        key = `row:${signature}:${nextOccurrence(occurrences, signature)}`
        // Before migration 009, the fallback key could not distinguish income and expense.
        const legacy = JSON.stringify(fields)
        if (exists.get(fingerprint(`row:${legacy}:${nextOccurrence(legacyOccurrences, legacy)}`))) {
          result.duplicates++
          continue
        }
      }
      const { changes } = insert.run(fingerprint(key), id, row.timestamp, row.category, row.amountCents, row.direction, row.counterparty)
      result.added += changes
      result.duplicates += 1 - changes
    }
    if (!result.added) db.prepare('DELETE FROM bill_imports WHERE id = ?').run(id)
    return result
  })()
}

// ---------------------------------------------------------------------------
// 预算与分类规则

/** 按北京时间自然月解析 'YYYY-MM' 为 [start, end) 毫秒区间。 */
function monthRange(month: string): { start: number; end: number } {
  const [year, monthIndex] = month.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    fail('BILL_MONTH_INVALID', '月份格式应为 YYYY-MM。')
  }
  const offset = 8 * 3600000
  return {
    start: Date.UTC(year, monthIndex - 1, 1) - offset,
    end: Date.UTC(year, monthIndex, 1) - offset
  }
}

export function readBillBudget(month: string): BillBudgetOverview {
  const db = getDatabase()
  const { start, end } = monthRange(month)
  const budget = db.prepare('SELECT amount_cents FROM bill_budgets WHERE month = ?').pluck().get(month) as number | undefined
  const spend = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_cents END), 0) AS spentCents,
      COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_cents END), 0) AS incomeCents,
      COUNT(*) AS txnCount
    FROM bill_txns WHERE ts >= ? AND ts < ?
  `).get(start, end) as { spentCents: number; incomeCents: number; txnCount: number }
  return { month, budgetCents: budget ?? null, spentCents: spend.spentCents, incomeCents: spend.incomeCents, txnCount: spend.txnCount }
}

export function writeBillBudget(month: string, amountCents: number | null): void {
  const db = getDatabase()
  db.transaction(() => {
    if (amountCents === null) db.prepare('DELETE FROM bill_budgets WHERE month = ?').run(month)
    else db.prepare(`INSERT INTO bill_budgets(month, amount_cents, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET amount_cents = excluded.amount_cents, updated_at = excluded.updated_at`)
      .run(month, amountCents, Date.now())
  })()
}

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`
}

export function listBillRules(): BillRule[] {
  return getDatabase().prepare('SELECT id, pattern, category, created_at AS createdAt FROM bill_rules ORDER BY created_at ASC, id ASC')
    .all() as BillRule[]
}

export function saveBillRule(input: { id?: string; pattern: string; category: string }): BillRule[] {
  const db = getDatabase()
  const pattern = input.pattern.trim()
  if (!pattern) fail('BILL_RULE_EMPTY', '规则关键字不能为空。')
  try {
    if (input.id) {
      db.prepare('UPDATE bill_rules SET pattern = ?, category = ? WHERE id = ?').run(pattern, input.category.trim(), input.id)
    } else {
      db.prepare('INSERT INTO bill_rules(id, pattern, category, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), pattern, input.category.trim(), Date.now())
    }
  } catch (error) {
    // UNIQUE 冲突：同一关键字已存在规则时提示合并而非报错堆栈。
    if (error instanceof Error && /UNIQUE/i.test(error.message)) fail('BILL_RULE_EXISTS', '已存在相同关键字的规则，请直接编辑那条规则。')
    throw error
  }
  return listBillRules()
}

export function removeBillRule(id: string): BillRule[] {
  getDatabase().prepare('DELETE FROM bill_rules WHERE id = ?').run(id)
  return listBillRules()
}

/** 把规则重灌到已有账单：命中关键字的交易分类改写为规则分类，返回更新的行数。 */
export function applyBillRules(): { updated: number } {
  const db = getDatabase()
  const rules = listBillRules()
  if (!rules.length) return { updated: 0 }
  let updated = 0
  db.transaction(() => {
    for (const rule of rules) {
      const { changes } = db.prepare(`UPDATE bill_txns SET category = ? WHERE counterparty LIKE ? ESCAPE '\\'`)
        .run(rule.category, likePattern(rule.pattern))
      updated += changes
    }
  })()
  return { updated }
}

/** 时间范围 → WHERE 条件与参数（北京时间口径）；收支概览与明细列表共用。 */
function billRangeConditions(range: BillRange): { conditions: string[]; params: unknown[] } {
  const beijingOffset = 8 * 3600000
  const now = new Date(Date.now() + beijingOffset)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const yearStart = Date.UTC(year, 0, 1) - beijingOffset
  const conditions: string[] = []
  const params: number[] = []
  if (range === 'thisYear' || range === 'lastYear') {
    conditions.push('ts >= ? AND ts < ?')
    params.push(range === 'thisYear' ? yearStart : Date.UTC(year - 1, 0, 1) - beijingOffset,
      range === 'thisYear' ? Date.UTC(year + 1, 0, 1) - beijingOffset : yearStart)
  } else if (range !== 'all') {
    // Subtract calendar months in Beijing, clamping the day at the destination month end.
    const start = new Date(now)
    start.setUTCDate(1)
    start.setUTCMonth(month - Number(range.slice(0, -1)))
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    start.setUTCDate(Math.min(now.getUTCDate(), lastDay))
    conditions.push('ts >= ?')
    params.push(start.getTime() - beijingOffset)
  }
  return { conditions, params }
}

/** 交易明细的独立查询：支持关键字（交易对方/分类）与收/支筛选，图表统计不受影响。 */
export function readBillRows(range: BillRange, page: number, query?: string, direction?: BillDirection): BillRowsPage {
  const db = getDatabase()
  const { conditions, params } = billRangeConditions(range)
  if (direction) { conditions.push('direction = ?'); params.push(direction) }
  const term = query?.trim()
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`
    conditions.push(`(counterparty LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')`)
    params.push(like, like)
  }
  const where = conditions.length ? conditions.join(' AND ') : '1 = 1'
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bill_txns WHERE ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`
    SELECT ts AS timestamp, category, direction, counterparty, amount_cents AS amountCents
    FROM bill_txns WHERE ${where} ORDER BY ts DESC, fingerprint LIMIT 50 OFFSET ?
  `).all(...params, Math.max(0, page) * 50) as BillRowsPage['rows']
  return { rows, total }
}

export function readBillOverview(range: BillRange, page: number): BillOverview {
  const db = getDatabase()
  const beijingOffset = 8 * 3600000
  const now = new Date(Date.now() + beijingOffset)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const monthStart = (offset: number) => Date.UTC(year, month + offset, 1) - beijingOffset
  const { conditions, params } = billRangeConditions(range)
  const where = conditions.length ? conditions.join(' AND ') : '1 = 1'
  const totals = db.prepare(`
    WITH filtered AS (SELECT * FROM bill_txns WHERE ${where})
    SELECT COUNT(*) AS txnCount,
      COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_cents ELSE 0 END), 0) AS totalExpenseCents,
      COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_cents ELSE 0 END), 0) AS totalIncomeCents,
      COALESCE(SUM(CASE WHEN direction = 'expense' THEN 1 ELSE 0 END), 0) AS expenseCount,
      COALESCE(MAX(CASE WHEN direction = 'expense' THEN amount_cents ELSE 0 END), 0) AS maxExpenseCents
    FROM filtered
  `).get(...params) as Omit<BillSummary, 'balanceCents' | 'avgExpenseCents'>
  const currentMonth = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN ts >= @start AND direction = 'expense' THEN amount_cents END), 0) AS expenseCents,
      COALESCE(SUM(CASE WHEN ts >= @start AND direction = 'income' THEN amount_cents END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN ts < @start AND direction = 'expense' THEN amount_cents END), 0) AS lastMonthExpenseCents
    FROM bill_txns WHERE ts >= @previous AND ts < @next
  `).get({ start: monthStart(0), previous: monthStart(-1), next: monthStart(1) }) as Omit<BillOverview['currentMonth'], 'label'>
  const hasTransactions = Boolean(db.prepare('SELECT 1 FROM bill_txns LIMIT 1').pluck().get())
  const summary: BillSummary = {
    ...totals,
    balanceCents: totals.totalIncomeCents - totals.totalExpenseCents,
    avgExpenseCents: totals.expenseCount ? Math.round(totals.totalExpenseCents / totals.expenseCount) : 0
  }
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', ts / 1000, 'unixepoch', '+8 hours') AS label,
      SUM(CASE WHEN direction = 'expense' THEN amount_cents ELSE 0 END) AS expenseCents,
      SUM(CASE WHEN direction = 'income' THEN amount_cents ELSE 0 END) AS incomeCents
    FROM bill_txns WHERE ${where} GROUP BY label ORDER BY label
  `).all(...params) as BillOverview['monthly']
  const categories = db.prepare(`
    SELECT category AS label, SUM(amount_cents) AS amountCents, COUNT(*) AS count
    FROM bill_txns WHERE ${where} AND direction = 'expense'
    GROUP BY category ORDER BY amountCents DESC, category
  `).all(...params) as BillOverview['categories']
  const counterparties = db.prepare(`
    SELECT counterparty AS label, SUM(amount_cents) AS amountCents
    FROM bill_txns WHERE ${where} AND direction = 'expense' AND counterparty <> ''
    GROUP BY counterparty ORDER BY amountCents DESC, counterparty LIMIT 10
  `).all(...params) as BillOverview['counterparties']
  const rows = db.prepare(`
    SELECT ts AS timestamp, category, direction, counterparty, amount_cents AS amountCents
    FROM bill_txns WHERE ${where} ORDER BY ts DESC, fingerprint LIMIT 50 OFFSET ?
  `).all(...params, page * 50) as BillOverview['rows']
  const label = `${year}-${String(month + 1).padStart(2, '0')}`
  return { hasTransactions, currentMonth: { ...currentMonth, label }, summary, monthly, categories, counterparties, rowCount: totals.txnCount, rows }
}
