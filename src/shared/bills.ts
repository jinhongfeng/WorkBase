export interface BillAccount {
  email: string
}

export interface BillImportResult {
  added: number
  duplicates: number
  excluded: number
  failures: { fileName: string; message: string }[]
}

export interface LockedBillFile { id: string; fileName: string }
export type BillFileSelection = { result: BillImportResult } | { lockedFile: LockedBillFile }

export interface BillAmount {
  label: string
  amountCents: number
}

export type BillRange = 'all' | '3m' | '6m' | '12m' | 'thisYear' | 'lastYear'
export type BillDirection = 'income' | 'expense'

export interface BillSummary {
  totalExpenseCents: number
  totalIncomeCents: number
  balanceCents: number
  txnCount: number
  expenseCount: number
  avgExpenseCents: number
  maxExpenseCents: number
}

export interface BillMonthlyPoint { label: string; expenseCents: number; incomeCents: number }
export interface BillCategoryStat { label: string; amountCents: number; count: number }
export interface BillTxnRow {
  timestamp: number
  category: string
  direction: BillDirection
  counterparty: string
  amountCents: number
}

export interface BillOverview {
  hasTransactions: boolean
  currentMonth: BillMonthlyPoint & { lastMonthExpenseCents: number }
  summary: BillSummary
  monthly: BillMonthlyPoint[]
  categories: BillCategoryStat[]
  counterparties: BillAmount[]
  rowCount: number
  rows: BillTxnRow[]
}

/** 交易明细的独立过滤：只作用于明细列表，不影响图表统计。 */
export interface BillRowsPage {
  rows: BillTxnRow[]
  total: number
}

/** 分类规则：交易对方包含 pattern（区分大小写的子串）时归类到 category。 */
export interface BillRule {
  id: string
  pattern: string
  category: string
  createdAt: number
}

/** 自然月预算（北京时间）：budgetCents 为 null 表示未设置。 */
export interface BillBudgetOverview {
  month: string
  budgetCents: number | null
  spentCents: number
  incomeCents: number
  txnCount: number
}

export interface BillsAPI {
  account(): Promise<BillAccount | null>
  saveAccount(input: { email: string; authorizationCode: string }): Promise<BillAccount>
  importFile(): Promise<BillFileSelection | null>
  unlockFile(input: { id: string; password: string }): Promise<BillImportResult>
  cancelFileImport(id: string): Promise<void>
  fetchFromMail(input: { password: string; sinceDays: number }): Promise<BillImportResult>
  overview(input: { range: BillRange; page: number }): Promise<BillOverview>
  rows(input: { range: BillRange; page: number; query?: string; direction?: BillDirection }): Promise<BillRowsPage>
  budget(input: { month: string }): Promise<BillBudgetOverview>
  setBudget(input: { month: string; amountCents: number | null }): Promise<void>
  rules(): Promise<BillRule[]>
  saveRule(input: { id?: string; pattern: string; category: string }): Promise<BillRule[]>
  removeRule(id: string): Promise<BillRule[]>
  applyRules(): Promise<{ updated: number }>
}
