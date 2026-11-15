import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, ListFilter, Mail, Trash2, Wallet } from 'lucide-react'
import { Bar, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BillAccount, BillBudgetOverview, BillImportResult, BillOverview, BillRange, BillRule, BillRowsPage, LockedBillFile } from '@shared/bills'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Alert } from '../../components/ui/Alert'
import { BarList } from '../../components/ui/BarList'
import { Pager } from '../../components/ui/Pager'
import { SearchField } from '../../components/ui/SearchField'
import { humanError } from '../../lib/utils'
import { defineModule } from '../../modules/defineModule'
import { CounterpartyRankingCard, MonthlyCashflowCard, SpendingBreakdownCard } from './DashboardCards'
import './bills.css'

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })
const formatMoney = (cents: number) => money.format(cents / 100)
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23'
})

const CATEGORY_LIMIT = 6
/** 分类用系列色：与首页支出分类卡同一组 token，环形切片与条形排行按序一一对应。 */
const CATEGORY_COLORS = ['var(--accent)', 'var(--accent-3)', 'var(--accent-2)', 'var(--gold)', 'var(--success)', 'var(--danger)']
const OTHER_CATEGORY_COLOR = 'var(--text-3)'
const categoryColor = (index: number) => index < CATEGORY_LIMIT ? CATEGORY_COLORS[index] : OTHER_CATEGORY_COLOR
const RANGES: { value: BillRange; label: string }[] = [
  { value: 'all', label: '全部' }, { value: '3m', label: '近3月' }, { value: '6m', label: '近6月' },
  { value: '12m', label: '近12月' }, { value: 'thisYear', label: '今年' }, { value: 'lastYear', label: '去年' }
]
const DIRECTIONS: { value: 'all' | 'income' | 'expense'; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'income', label: '收入' }, { value: 'expense', label: '支出' }
]
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text)', fontSize: 12, padding: '5px 8px' }
const tickStyle = { fill: 'var(--text-2)', fontSize: 12 }
const yuan = (cents: number) => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
const PAGE_SIZE = 50
const CHART_HEIGHT = 280

function BillAnalysis({ overview }: { overview: BillOverview }) {
  const { summary, monthly, categories } = overview
  const total = summary.totalExpenseCents
  const spending = categories.filter(item => item.amountCents > 0)
  const otherAmount = spending.slice(CATEGORY_LIMIT).reduce((sum, item) => sum + item.amountCents, 0)
  const categoryRows = spending.slice(0, CATEGORY_LIMIT).map(({ label, amountCents }) => ({ label, amountCents }))
  if (otherAmount > 0) categoryRows.push({ label: '其余分类', amountCents: otherAmount })
  // 趋势摘要：月均与峰值需要至少两个月的数据才有意义。
  const peak = monthly.length >= 2
    ? monthly.reduce((best, point) => (point.expenseCents > best.expenseCents ? point : best), monthly[0])
    : null
  return <div className="bills-charts">
    <section className="card bills-chart" aria-labelledby="bills-trend-title">
      <div className="card-head"><span className="card-title" id="bills-trend-title">月度收支趋势</span><span className="card-meta">单位：元</span></div>
      <div className="card-body">
        {peak && <p className="bills-trend-meta">
          <span>月均支出 <strong className="num">{formatMoney(Math.round(summary.totalExpenseCents / monthly.length))}</strong></span>
          <span>单月峰值 <strong className="num">{formatMoney(peak.expenseCents)}</strong>（{Number(peak.label.slice(5))} 月）</span>
          <span>范围结余 <strong className="num">{formatMoney(summary.balanceCents)}</strong></span>
        </p>}
        {monthly.length < 2 ? <p className="bills-chart-empty">数据不足，导入更多账单后可见趋势</p> :
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={monthly} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={tickStyle} tickFormatter={yuan} axisLine={false} tickLine={false} width={64} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text)' }} cursor={{ fill: 'var(--surface-2)' }} formatter={(value, name) => [formatMoney(Number(value)), name]} />
              <Legend />
              <Bar dataKey="expenseCents" name="支出" fill="var(--accent)" maxBarSize={36} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line dataKey="incomeCents" name="收入" type="linear" stroke="var(--success)" strokeWidth={1.6} dot={{ r: 2.5 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>}
      </div>
    </section>
    <section className="card bills-chart bills-category-chart" aria-labelledby="bills-category-title">
      <div className="card-head">
        <span className="card-title" id="bills-category-title">支出分类</span>
        {otherAmount > 0 && <span className="card-meta">前 {CATEGORY_LIMIT} 类及其他</span>}
      </div>
      <div className="card-body">
        {total > 0 && categoryRows.length > 0 ? <>
          {/* 环形占比总览：切片色与下方条形排行一一对应，图形作装饰、数据读数由 BarList 承担。 */}
          <div className="bills-donut" aria-hidden="true">
            <PieChart width={132} height={132} accessibilityLayer={false}>
              <Pie data={categoryRows} dataKey="amountCents" nameKey="label" innerRadius={46} outerRadius={64}
                stroke="var(--surface)" isAnimationActive={false}>
                {categoryRows.map((row, index) => <Cell key={row.label} fill={categoryColor(index)} />)}
              </Pie>
            </PieChart>
            <span>总支出<strong>{formatMoney(total)}</strong></span>
          </div>
          <BarList
            compact
            label="各类支出金额及占比"
            max={total}
            items={categoryRows.map(({ label, amountCents }, index) => ({
              label,
              value: amountCents,
              display: formatMoney(amountCents),
              note: percent.format(amountCents / total),
              tone: index === CATEGORY_LIMIT ? 'muted' : 'accent',
              color: categoryColor(index)
            }))}
          />
        </> : <p className="bills-chart-empty">暂无可分析的支出金额</p>}
      </div>
    </section>
  </div>
}

function BillsPage() {
  const [account, setAccount] = useState<BillAccount | null>(null)
  const [overview, setOverview] = useState<BillOverview | null>(null)
  const [page, setPage] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [rowsQuery, setRowsQuery] = useState('')
  const [rowsDirection, setRowsDirection] = useState<'all' | 'income' | 'expense'>('all')
  const [rowsData, setRowsData] = useState<BillRowsPage | null>(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [range, setRange] = useState<BillRange>('all')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [accountOpen, setAccountOpen] = useState(false)
  const [emailImportOpen, setEmailImportOpen] = useState(false)
  const [lockedFile, setLockedFile] = useState<LockedBillFile | null>(null)
  const [email, setEmail] = useState('')
  const [authorizationCode, setAuthorizationCode] = useState('')
  const [password, setPassword] = useState('')
  const [sinceDays, setSinceDays] = useState(90)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [budget, setBudget] = useState<BillBudgetOverview | null>(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rules, setRules] = useState<BillRule[]>([])
  const [rulePattern, setRulePattern] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleBusy, setRuleBusy] = useState(false)
  const [applyingRules, setApplyingRules] = useState(false)
  const [formError, setFormError] = useState<{ message: string; failures?: BillImportResult['failures'] } | null>(null)
  const [result, setResult] = useState<BillImportResult | null>(null)
  const mounted = useRef(false)
  const importMode = lockedFile ? 'file' : emailImportOpen ? 'email' : null

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!lockedFile) return
    return () => { void window.api.bills.cancelFileImport(lockedFile.id).catch(() => {}) }
  }, [lockedFile])

  useEffect(() => {
    let active = true
    void window.api.bills.account().then(value => { if (active) setAccount(value) })
      .catch(reason => { if (active) setPageError(humanError(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setPageError('')
    void window.api.bills.overview({ range, page }).then(value => { if (active) setOverview(value) })
      .catch(reason => {
        if (active) { setOverview(null); setPageError(humanError(reason)); window.toast.error(humanError(reason)) }
      }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range, page, refresh])

  // 本月预算跟随收支概览的当前月份；导入、设置预算后随 refresh 重读。
  const budgetMonth = overview?.currentMonth.label
  useEffect(() => {
    if (!budgetMonth) return
    let active = true
    void window.api.bills.budget({ month: budgetMonth }).then(value => {
      if (!active) return
      setBudget(value)
      setBudgetInput(value.budgetCents === null ? '' : String(value.budgetCents / 100))
    }).catch(() => undefined)
    return () => { active = false }
  }, [budgetMonth, refresh])

  // 交易明细独立加载：搜索与收/支筛选只作用于明细，不影响图表统计。
  useEffect(() => {
    if (!detailsOpen) return
    let active = true
    const timer = setTimeout(() => {
      setRowsLoading(true)
      void window.api.bills.rows({
        range, page,
        query: rowsQuery.trim() || undefined,
        direction: rowsDirection === 'all' ? undefined : rowsDirection
      }).then(value => { if (active) setRowsData(value) })
        .catch(reason => { if (active) { setRowsData(null); window.toast.error(humanError(reason)) } })
        .finally(() => { if (active) setRowsLoading(false) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [detailsOpen, range, page, rowsQuery, rowsDirection, refresh])

  function openAccount() {
    setEmail(account?.email ?? '')
    setAuthorizationCode('')
    setPageError('')
    setFormError(null)
    setAccountOpen(true)
  }

  /** 预算按元输入、以分保存；输入为空即清除该月预算。 */
  async function saveBudget() {
    if (!budgetMonth) return
    const yuan = budgetInput.trim()
    const value = yuan ? Math.round(Number(yuan) * 100) : null
    if (yuan && (!Number.isFinite(value) || (value ?? 0) < 0)) {
      window.toast.error('预算金额格式不正确')
      return
    }
    setBusy(true)
    try {
      await window.api.bills.setBudget({ month: budgetMonth, amountCents: value })
      setRefresh(value => value + 1)
      window.toast.success(value === null ? '已清除本月预算' : '本月预算已保存')
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function openRules() {
    setRulePattern(''); setRuleCategory('')
    setRulesOpen(true)
    try { setRules(await window.api.bills.rules()) }
    catch (reason) { window.toast.error(humanError(reason)) }
  }

  async function saveRule() {
    if (!rulePattern.trim() || !ruleCategory.trim() || ruleBusy) return
    setRuleBusy(true)
    try {
      setRules(await window.api.bills.saveRule({ pattern: rulePattern, category: ruleCategory }))
      setRulePattern(''); setRuleCategory('')
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setRuleBusy(false)
    }
  }

  async function removeRule(rule: BillRule) {
    try { setRules(await window.api.bills.removeRule(rule.id)) }
    catch (reason) { window.toast.error(humanError(reason)) }
  }

  async function applyRules() {
    if (applyingRules) return
    setApplyingRules(true)
    try {
      const { updated } = await window.api.bills.applyRules()
      setRefresh(value => value + 1)
      window.toast.success(`已按规则重新归类 ${updated} 笔交易`)
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setApplyingRules(false)
    }
  }

  async function saveAccount() {
    setBusy(true)
    setFormError(null)
    try {
      setAccount(await window.api.bills.saveAccount({ email: email.trim(), authorizationCode }))
      setAccountOpen(false)
      window.toast.success('QQ 邮箱已连接')
    } catch (reason) {
      setFormError({ message: humanError(reason) })
    } finally {
      setAuthorizationCode('')
      setBusy(false)
    }
  }

  function openMailImport() {
    setPassword('')
    setPageError('')
    setFormError(null)
    setResult(null)
    setEmailImportOpen(true)
  }

  function finishImport(next: BillImportResult) {
    setResult(next)
    setPage(0)
    setRefresh(value => value + 1)
  }

  async function chooseFile() {
    setBusy(true)
    setPassword('')
    setPageError('')
    setFormError(null)
    setResult(null)
    try {
      const selected = await window.api.bills.importFile()
      if (!selected) return
      if ('lockedFile' in selected) {
        if (mounted.current) setLockedFile(selected.lockedFile)
        else await window.api.bills.cancelFileImport(selected.lockedFile.id)
      } else if (mounted.current) finishImport(selected.result)
    } catch (reason) {
      if (mounted.current) setPageError(humanError(reason))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  async function runImport() {
    setBusy(true)
    setFormError(null)
    try {
      const next = lockedFile
        ? await window.api.bills.unlockFile({ id: lockedFile.id, password })
        : await window.api.bills.fetchFromMail({ password, sinceDays })
      if (next.failures.length && !next.added && !next.duplicates && !next.excluded) {
        setFormError({ message: '未导入账单记录', failures: next.failures })
        return
      }
      finishImport(next)
      setLockedFile(null)
      setEmailImportOpen(false)
    } catch (reason) {
      setFormError({ message: humanError(reason) })
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  const summary = overview?.summary
  const currentMonth = overview?.currentMonth
  const pageTotals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const row of rowsData?.rows ?? []) {
      if (row.direction === 'income') income += row.amountCents
      else expense += row.amountCents
    }
    return { income, expense, balance: income - expense }
  }, [rowsData])
  const change = currentMonth?.lastMonthExpenseCents
    ? (currentMonth.expenseCents - currentMonth.lastMonthExpenseCents) / currentMonth.lastMonthExpenseCents * 100 : null
  // 迷你走势随当前时间范围走（overview.monthly 已按 range 过滤）。
  const expenseSeries = overview?.monthly.map(point => point.expenseCents) ?? []
  const incomeSeries = overview?.monthly.map(point => point.incomeCents) ?? []
  const showHeadActions = loading || Boolean(overview?.hasTransactions)

  return <div className="page bills-page">
    <PageHeader
      title="账单"
      actions={<>
        <Button variant="secondary" disabled={busy} title={account?.email} onClick={() => (account ? openMailImport() : openAccount())}><Mail size={15} />{account ? '从邮箱获取' : '连接邮箱'}</Button>
        {showHeadActions && <Button variant="primary" disabled={busy} onClick={() => void chooseFile()}><Download size={15} />导入文件</Button>}
        {showHeadActions && <Button variant="ghost" disabled={busy} onClick={() => void openRules()}><ListFilter size={15} />分类规则</Button>}
      </>}
    />
    {pageError && <Alert tone="danger">{pageError}</Alert>}
    {result && <Alert tone={result.failures.length ? 'warn' : 'success'} title={result.failures.length ? '导入完成，请查看处理提示' : '导入完成'}>
      新增 {result.added} 笔，重复 {result.duplicates} 笔，其他状态 {result.excluded} 笔。
      {!!result.failures.length && <ul>{result.failures.map((failure, index) =>
        <li key={index}>{failure.fileName} · {failure.message}</li>)}</ul>}
    </Alert>}
    {overview?.hasTransactions && <section className="card bills-overview" aria-label="收支概览">
      <div className="card-head bills-overview-head">
        <span className="card-title">{currentMonth ? `本月收支 · ${currentMonth.label}` : '收支概览'}</span>
        <div className="segmented" role="group" aria-label="账单时间范围">
          {RANGES.map(item => <button key={item.value} type="button" aria-pressed={range === item.value} disabled={busy} onClick={() => { setRange(item.value); setPage(0) }}>{item.label}</button>)}
        </div>
      </div>
      <div className="card-body bills-overview-body">
        {currentMonth && <>
          <StatCard
            label="本月支出"
            value={formatMoney(currentMonth.expenseCents)}
            delta={change !== null ? `环比 ${change > 0 ? '↑' : change < 0 ? '↓' : ''} ${Math.abs(change).toFixed(1)}%` : undefined}
            tone={change !== null ? (change > 0 ? 'down' : 'up') : 'flat'}
            hint={change === null ? '上月无支出' : undefined}
          />
          <StatCard label="本月收入" value={formatMoney(currentMonth.incomeCents)} />
        </>}
        {!loading && summary && overview.rowCount > 0 && <>
          <div className="bills-overview-divider" aria-hidden="true" />
          <StatCard label="范围收入" value={formatMoney(summary.totalIncomeCents)}
            spark={incomeSeries} sparkLabel="范围内各月收入走势" />
          <StatCard label="范围支出" value={formatMoney(summary.totalExpenseCents)}
            spark={expenseSeries} sparkLabel="范围内各月支出走势" />
          <StatCard label="范围结余" value={formatMoney(summary.balanceCents)} tone={summary.balanceCents < 0 ? 'down' : 'flat'} />
        </>}
      </div>
    </section>}
    {overview?.hasTransactions && budgetMonth && budget && <section className="card bills-budget" aria-label="本月预算">
      <div className="card-head">
        <span className="card-title">本月预算 · {budget.month}</span>
        {budget.budgetCents !== null && (
          <span className="card-meta">
            已支出 {formatMoney(budget.spentCents)} / 预算 {formatMoney(budget.budgetCents)} ·
            剩余 {formatMoney(Math.max(0, budget.budgetCents - budget.spentCents))}{budget.spentCents > budget.budgetCents ? '（已超支）' : ''}
          </span>
        )}
      </div>
      <div className="card-body bills-budget-body">
        <div className="bills-budget-bar" role="progressbar" aria-label="本月预算使用进度"
          aria-valuemin={0} aria-valuemax={budget.budgetCents ?? undefined} aria-valuenow={budget.budgetCents === null ? undefined : budget.spentCents}>
          <span style={{ width: `${budget.budgetCents ? Math.min(100, Math.round(budget.spentCents / budget.budgetCents * 100)) : 0}%` }}
            data-over={budget.budgetCents !== null && budget.spentCents > budget.budgetCents || undefined} />
        </div>
        <div className="bills-budget-edit">
          <input className="input" type="number" min="0" step="0.01" placeholder="设置本月预算（元），清空后保存即移除"
            aria-label="本月预算金额（元）"
            value={budgetInput} onChange={event => setBudgetInput(event.target.value)} />
          <Button variant="secondary" disabled={busy} onClick={() => void saveBudget()}>保存预算</Button>
        </div>
      </div>
    </section>}
    {loading && <div className="bills-loading" aria-live="polite"><Spinner /><span>正在读取本地账单…</span></div>}
    {!loading && overview && !overview.rowCount && <EmptyState icon={Wallet} title={range === 'all' ? '暂无交易记录' : '此时间范围暂无交易记录'} description={range === 'all' ? '导入支付宝导出的 ZIP、CSV 文件。' : '可切换上方时间范围查看其他账单。'}>
      {range !== 'all'
        ? <Button variant="primary" disabled={busy} onClick={() => { setRange('all'); setPage(0) }}>查看全部范围</Button>
        : <Button variant="primary" disabled={busy} onClick={() => void chooseFile()}><Download size={15} />导入文件</Button>}
    </EmptyState>}
    {!loading && overview && overview.rowCount > 0 && <>
      <BillAnalysis overview={overview} />
      <section className="bills-details">
        <button type="button" className="bills-details-toggle" aria-expanded={detailsOpen} aria-controls="bills-details-body"
          onClick={() => setDetailsOpen(value => !value)}>
          <ChevronDown size={15} className="bills-details-chevron" aria-hidden="true" />
          <span className="card-title">交易明细</span>
          <span className="card-meta">{detailsOpen && rowsData ? `${rowsData.total} 笔匹配` : `共 ${overview.rowCount} 笔`} · 每页 {PAGE_SIZE} 笔</span>
        </button>
        {detailsOpen && <div id="bills-details-body" className="bills-details-body">
          <div className="bills-details-filters">
            <SearchField label="搜索交易" placeholder="搜索交易对方或分类…" value={rowsQuery} maxLength={100}
              onValueChange={value => { setRowsQuery(value); setPage(0) }} />
            <div className="segmented" role="group" aria-label="收/支筛选">
              {DIRECTIONS.map(item => <button key={item.value} type="button" aria-pressed={rowsDirection === item.value}
                onClick={() => { setRowsDirection(item.value); setPage(0) }}>{item.label}</button>)}
            </div>
          </div>
          {rowsLoading ? <div className="bills-loading" aria-live="polite"><Spinner /><span>正在读取明细…</span></div>
            : rowsData && rowsData.rows.length ? <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th scope="col">时间（北京时间）</th><th scope="col">收/支</th><th scope="col">交易分类</th><th scope="col">交易对方</th><th scope="col" className="num">金额</th></tr></thead>
                  <tbody>{rowsData.rows.map((row, index) => <tr key={index}>
                    <td>{dateTime.format(row.timestamp)}</td>
                    <td><span className={`badge ${row.direction === 'income' ? 'success' : ''}`}>{row.direction === 'income' ? '收入' : '支出'}</span></td>
                    <td>{row.category}</td>
                    <td>{row.counterparty || '—'}</td>
                    <td className={`num ${row.direction === 'income' ? 'bills-income' : ''}`}>{row.direction === 'income' ? '+' : '−'}{formatMoney(row.amountCents)}</td>
                  </tr>)}</tbody>
                  <tfoot><tr>
                    <td>本页小计</td><td></td><td></td><td></td>
                    <td className="num">收入 {formatMoney(pageTotals.income)} · 支出 {formatMoney(pageTotals.expense)} · 净额 {formatMoney(pageTotals.balance)}</td>
                  </tr></tfoot>
                </table>
              </div>
              <Pager
                page={page}
                pages={Math.max(1, Math.ceil(rowsData.total / PAGE_SIZE))}
                onChange={setPage}
                info={`共 ${rowsData.total} 笔 · 每页 ${PAGE_SIZE} 笔`}
                disabled={busy}
              />
            </>
              : <p className="bills-chart-empty">没有匹配的交易记录。可调整关键字、收/支筛选或时间范围。</p>}
        </div>}
      </section>
      <p className="bills-data-note">旧版导入记录缺少收支方向与交易对方，按支出统计，交易对方留空。</p>
    </>}
    <Dialog open={rulesOpen} title="分类规则" onClose={() => { if (!ruleBusy && !applyingRules) setRulesOpen(false) }}>
      <div className="bills-rules">
        <p className="muted">交易对方包含关键字时，导入和「应用到已有账单」会把分类改写为规则分类；先创建的规则优先。</p>
        <form className="bills-rules-add" onSubmit={event => { event.preventDefault(); void saveRule() }}>
          <input className="input" data-dialog-autofocus placeholder="交易对方包含…" aria-label="交易对方关键字"
            value={rulePattern} maxLength={80} onChange={event => setRulePattern(event.target.value)} />
          <input className="input" placeholder="归类到…" aria-label="规则分类" list="bills-category-options"
            value={ruleCategory} maxLength={40} onChange={event => setRuleCategory(event.target.value)} />
          <datalist id="bills-category-options">
            {(overview?.categories ?? []).map(category => <option key={category.label} value={category.label} />)}
          </datalist>
          <Button type="submit" variant="primary" loading={ruleBusy} disabled={!rulePattern.trim() || !ruleCategory.trim()}>添加规则</Button>
        </form>
        <ul className="bills-rules-list">
          {rules.length === 0 ? <p className="bills-chart-empty">还没有规则，添加后新导入的账单会自动按规则归类。</p> : rules.map(rule => (
            <li key={rule.id}>
              <span className="bills-rule-pattern">{rule.pattern}</span>
              <span className="bills-rule-arrow" aria-hidden="true">→</span>
              <span className="bills-rule-category">{rule.category}</span>
              <button className="icon-action danger" aria-label={`删除规则 ${rule.pattern}`} onClick={() => void removeRule(rule)}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
        <div className="actions">
          <Button variant="secondary" loading={applyingRules} disabled={!rules.length} onClick={() => void applyRules()}>应用到已有账单</Button>
        </div>
      </div>
    </Dialog>
    <Dialog open={accountOpen} title="连接 QQ 邮箱" onClose={() => { if (!busy) { setAccountOpen(false); setAuthorizationCode(''); setFormError(null) } }}>
      <form className="bills-form" onSubmit={event => { event.preventDefault(); void saveAccount() }}>
        <p className="muted">先在 QQ 邮箱开启 IMAP 服务，再填写邮箱地址和邮箱授权码。</p>
        <label className="field">QQ 邮箱地址<input className="input" type="email" data-dialog-autofocus value={email} onChange={event => setEmail(event.target.value)} required pattern=".+@[qQ][qQ]\.[cC][oO][mM]" maxLength={120} /></label>
        <label className="field">邮箱授权码<input className="input" type="password" value={authorizationCode} onChange={event => setAuthorizationCode(event.target.value)} required maxLength={128} autoComplete="off" /></label>
        {accountOpen && formError && <Alert tone="danger">{formError.message}</Alert>}
        <Button type="submit" variant="primary" loading={busy}>验证并保存</Button>
      </form>
    </Dialog>
    <Dialog open={importMode !== null} title={importMode === 'email' ? '从 QQ 邮箱获取账单' : '输入账单解压密码'} onClose={() => {
      if (!busy) { setLockedFile(null); setEmailImportOpen(false); setPassword(''); setFormError(null) }
    }}>
      <form className="bills-form" onSubmit={event => { event.preventDefault(); void runImport() }}>
        {importMode === 'email' && <>
          <p className="muted">从已连接的 {account?.email ?? 'QQ 邮箱'} 检索支付宝账单附件。</p>
          <label className="field">搜索最近多少天<input className="input" type="number" min={1} max={365} required disabled={busy} value={sinceDays} onChange={event => setSinceDays(event.target.valueAsNumber)} /></label>
        </>}
        {lockedFile && <p className="bills-file-name">{lockedFile.fileName}</p>}
        <label className="field">ZIP 解压密码<input className="input" type="password" data-dialog-autofocus value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} maxLength={256} autoComplete="off" /></label>
        <p className="muted">填写支付宝服务消息里的解压密码，仅用于本次导入。</p>
        {importMode && formError && <Alert tone="danger" title={formError.failures ? formError.message : undefined}>
          {formError.failures ? <ul>{formError.failures.map((failure, index) =>
            <li key={index}>{failure.fileName} · {failure.message}</li>)}</ul> : formError.message}
        </Alert>}
        <div className="bills-form-actions">
          {importMode === 'email' && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEmailImportOpen(false); setPassword(''); openAccount() }}>更改邮箱</Button>}
          <Button type="submit" variant="primary" loading={busy}>{importMode === 'email' ? '获取并导入' : '解压并导入'}</Button>
        </div>
      </form>
    </Dialog>
  </div>
}

export default defineModule({
  id: 'bills', name: '账单', group: '外部数据', icon: Wallet, order: 40,
  dashboardCards: [
    { id: 'monthly-cashflow', name: '月度收支', component: MonthlyCashflowCard },
    { id: 'spending-breakdown', name: '支出分类', component: SpendingBreakdownCard },
    { id: 'counterparty-ranking', name: '交易对方排行', component: CounterpartyRankingCard }
  ],
  keywords: ['支付宝账单', 'QQ邮箱'], page: BillsPage
})
