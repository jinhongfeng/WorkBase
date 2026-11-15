import { useEffect, useId, useState, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BillOverview } from '@shared/bills'
import { useNavigation } from '../../stores/navigation'

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const formatMoney = (cents: number) => money.format(cents / 100)
const tick = { fill: 'var(--text-2)', fontSize: 11 }
const tooltip = { background: 'var(--surface)', borderColor: 'var(--border-strong)', borderRadius: 'var(--r-xs)' }
const colors = ['var(--accent)', 'var(--accent-3)', 'var(--accent-2)', 'var(--gold)', 'var(--text-3)']

let pendingOverview: Promise<BillOverview> | undefined

function readOverview(): Promise<BillOverview> {
  pendingOverview ??= window.api.bills.overview({ range: 'all', page: 0 }).finally(() => { pendingOverview = undefined })
  return pendingOverview
}

function BillCard({ title, children, showLink = false }: { title: string; children: (overview: BillOverview) => ReactNode; showLink?: boolean }) {
  const heading = useId()
  const navigate = useNavigation(state => state.navigate)
  const [result, setResult] = useState<BillOverview | 'error' | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const load = (): void => {
      void readOverview().then(value => { if (active) setResult(value) }, () => { if (active) setResult('error') })
    }
    load()
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [attempt])

  return (
    <section className="home-panel home-insight" aria-labelledby={heading}>
      <div className="home-panel-head">
        <h2 id={heading}>{title}</h2>
        {showLink && <button className="home-link" type="button" onClick={() => navigate('/bills')}>查看账单 <ArrowUpRight size={13} aria-hidden="true" /></button>}
      </div>
      {result === null && <p className="home-insight-status" role="status">正在读取账单…</p>}
      {result === 'error' && (
        <p className="home-insight-status" role="status">无法读取账单。 <button className="home-link" type="button" onClick={() => { setResult(null); setAttempt(value => value + 1) }}>重试</button></p>
      )}
      {result && result !== 'error' && (result.rowCount ? children(result) : <p className="home-insight-status">导入支付宝账单后显示统计。</p>)}
    </section>
  )
}

function MonthlyPlot({ monthly }: Pick<BillOverview, 'monthly'>) {
  const last = monthly.at(-1)
  if (!last) return <p className="home-insight-status">暂无月度收支记录。</p>

  const [year, month] = last.label.split('-').map(Number)
  const byMonth = new Map(monthly.map(point => [point.label, point]))
  const points = Array.from({ length: 6 }, (_, index) => {
    const label = new Date(Date.UTC(year, month - 6 + index, 1)).toISOString().slice(0, 7)
    return byMonth.get(label) ?? { label, expenseCents: 0, incomeCents: 0 }
  })

  return (
    <>
      <div className="home-insight-meta">
        <span>{points[0].label} 至 {last.label}</span>
        <div className="home-plot-key"><span><i />支出</span><span><i />收入</span></div>
      </div>
      <div className="home-insight-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border-strong)" strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={tick} tickFormatter={label => `${Number(label.slice(-2))}月`} axisLine={false} tickLine={false} />
            <YAxis tick={tick} tickFormatter={value => compact.format(value / 100)} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={tooltip} itemStyle={{ color: 'var(--text)' }} cursor={{ fill: 'var(--surface-2)' }} formatter={(value, name) => [formatMoney(Number(value)), name]} />
            <Bar dataKey="expenseCents" name="支出" fill="var(--accent)" maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line dataKey="incomeCents" name="收入" stroke="var(--accent-3)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function CategoryPlot({ categories, summary }: BillOverview) {
  const total = summary.totalExpenseCents
  if (total <= 0) return <p className="home-insight-status">已导入账单中暂无支出。</p>

  const slices = categories.filter(item => item.amountCents > 0)
  const groups = slices.slice(0, 4).map(({ label, amountCents }) => ({ label, amountCents }))
  if (slices.length > 4) {
    groups.push({ label: '其余类别', amountCents: slices.slice(4).reduce((sum, item) => sum + item.amountCents, 0) })
  }

  return (
    <>
      <p className="home-insight-context">全部已导入账单</p>
      <div className="home-donut-layout">
        <div className="home-donut" aria-hidden="true">
          <PieChart width={132} height={132} accessibilityLayer={false}>
            <Pie data={groups} dataKey="amountCents" nameKey="label" innerRadius={46} outerRadius={64} stroke="var(--surface)" isAnimationActive={false}>
              {groups.map((_, index) => <Cell key={index} fill={colors[index]} />)}
            </Pie>
          </PieChart>
          <span>总支出<strong>{total < 1_000_000 ? formatMoney(total) : `${compact.format(total / 100)} 元`}</strong></span>
        </div>
        <div>
          <span className="sr-only">总支出 {formatMoney(total)}</span>
          <ul className="home-donut-key" aria-label="各类支出及占比">
            {groups.map((group, index) => (
              <li key={index} title={`${group.label} ${formatMoney(group.amountCents)}`}>
                <i style={{ background: colors[index] }} aria-hidden="true" />
                <span>{group.label}<span className="sr-only"> {formatMoney(group.amountCents)}</span></span>
                <strong>{(group.amountCents / total * 100).toFixed(1)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function CounterpartyList({ counterparties }: BillOverview) {
  const top = counterparties.filter(item => item.amountCents > 0).slice(0, 5)
  if (!top.length) return <p className="home-insight-status">暂无带交易对方的支出记录。</p>

  return (
    <>
      <p className="home-insight-context">全部账单 · 按支出金额排序</p>
      <ol className="home-ranking">
        {top.map((item, index) => (
          <li key={item.label}>
            <span className="home-ranking-index" aria-hidden="true">{index + 1}</span>
            <span className="home-ranking-label" title={item.label}>{item.label}</span>
            <strong>{formatMoney(item.amountCents)}</strong>
            <span className="home-ranking-bar" aria-hidden="true"><i style={{ width: `${item.amountCents / top[0].amountCents * 100}%` }} /></span>
          </li>
        ))}
      </ol>
    </>
  )
}

export function MonthlyCashflowCard() {
  return <BillCard title="月度收支">{overview => <MonthlyPlot monthly={overview.monthly} />}</BillCard>
}

export function SpendingBreakdownCard() {
  return <BillCard title="支出分类">{overview => <CategoryPlot {...overview} />}</BillCard>
}

export function CounterpartyRankingCard() {
  return <BillCard title="交易对方排行">{overview => <CounterpartyList {...overview} />}</BillCard>
}
