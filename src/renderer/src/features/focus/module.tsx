import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flame, Minus, Pencil, Play, Plus, RotateCcw, Timer, Trash2, TrendingUp } from 'lucide-react'
import type { FocusDay, FocusSession, FocusStats } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { useNavigation } from '../../stores/navigation'
import { PageHeader } from '../../components/ui/PageHeader'
import { CircularMeter } from '../../components/ui/CircularMeter'
import { Meter } from '../../components/ui/Meter'
import { StatCard } from '../../components/ui/StatCard'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { LeafSprig, WaveLines } from '../dashboard/illustrations'
import { clamp, formatDate, humanError, todayKey } from '../../lib/utils'
import { focusClock, useFocus } from '../../stores/focus'
import './focus.css'

const PRESETS = [25, 45, 60]
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const TARGET_SETTING = 'ui.focus_target'
const DEFAULT_TARGET_MINUTES = 25
const MIN_TARGET_MINUTES = 5
const MAX_TARGET_MINUTES = 480
const TARGET_STEP = 5
const SEGMENTS = [0, 1, 2, 3, 4]
const EMPTY: FocusStats = { todayMinutes: 0, weekMinutes: 0, totalSessions: 0, days: [], year: [], recent: [] }

/** 年度专注格子：最近 12 个月 × 每月最多 5 个周段，按当段有专注的天数分级；悬停即时显示明细。 */
function FocusYearGrid({ year }: { year: FocusDay[] }) {
  const [hint, setHint] = useState<string | null>(null)
  const monthKeys = useMemo(() => {
    const keys: string[] = []
    for (const day of year) {
      const key = day.date.slice(0, 7)
      if (!keys.includes(key)) keys.push(key)
    }
    return keys.slice(-12)
  }, [year])
  const buckets = useMemo(() => {
    const buckets = new Map<string, { days: number; minutes: number }>()
    for (const day of year) {
      if (day.minutes <= 0) continue
      const dayOfMonth = Number(day.date.slice(8, 10))
      const segment = Math.min(4, Math.floor((dayOfMonth - 1) / 7))
      const key = `${day.date.slice(0, 7)}#${segment}`
      const bucket = buckets.get(key) ?? { days: 0, minutes: 0 }
      bucket.days += 1
      bucket.minutes += day.minutes
      buckets.set(key, bucket)
    }
    return buckets
  }, [year])
  const cellText = (key: string, segment: number, bucket?: { days: number; minutes: number }): string => {
    const days = `${segment * 7 + 1}–${segment === 4 ? '月末' : segment * 7 + 7} 日`
    return bucket
      ? `${Number(key.slice(5, 7))}月 ${days}：专注 ${bucket.days} 天 · ${bucket.minutes} 分钟`
      : `${Number(key.slice(5, 7))}月 ${days}：无专注`
  }

  if (!monthKeys.length) return null
  return <div className="focus-year">
    <div className="focus-year-grid" role="img" aria-label="最近 12 个月的专注分布格子图" aria-describedby="focus-year-hint">
      {monthKeys.map(key => SEGMENTS.map(segment => {
        const bucket = buckets.get(`${key}#${segment}`)
        const level = !bucket ? 0 : bucket.days >= 5 ? 3 : bucket.days >= 3 ? 2 : 1
        const text = cellText(key, segment, bucket)
        return <i key={`${key}#${segment}`} data-level={level} title={text}
          onMouseEnter={() => setHint(text)} onMouseLeave={() => setHint(null)} />
      }))}
    </div>
    <div className="focus-year-labels" aria-hidden="true">
      {monthKeys.map(key => <span key={key}>{Number(key.slice(5, 7))}月</span>)}
    </div>
    <p className="focus-year-hint" id="focus-year-hint" aria-live="polite">{hint ?? '悬停格子查看该周段的专注明细'}</p>
  </div>
}

function FocusPage() {
  const { minutes, remaining, running, started, label, finishing, revision, choose, setLabel, enter, reset, refresh } = useFocus()
  const [stats, setStats] = useState<FocusStats>(EMPTY)
  const [target, setTarget] = useState(DEFAULT_TARGET_MINUTES)
  const [targetDraft, setTargetDraft] = useState(String(DEFAULT_TARGET_MINUTES))
  const [renaming, setRenaming] = useState<FocusSession | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleting, setDeleting] = useState<FocusSession | null>(null)
  const [mutating, setMutating] = useState(false)

  const load = useCallback(async () => {
    try { setStats(await window.api.focus.stats()) }
    catch (error) { window.toast.error(humanError(error)) }
  }, [])

  useEffect(() => { void load() }, [load, revision])

  useEffect(() => {
    void window.api.settings.getAll().then(saved => {
      const value = Number(saved[TARGET_SETTING])
      if (Number.isInteger(value) && value >= MIN_TARGET_MINUTES && value <= MAX_TARGET_MINUTES) setTarget(value)
    }).catch(() => undefined)
  }, [])

  useEffect(() => { setTargetDraft(String(target)) }, [target])

  const saveTarget = (value: number): void => {
    const next = clamp(Math.round(value), MIN_TARGET_MINUTES, MAX_TARGET_MINUTES)
    if (next === target) return
    setTarget(next)
    void window.api.settings.set(TARGET_SETTING, String(next)).catch(error => window.toast.error(humanError(error)))
  }
  const commitTarget = (): void => {
    const value = Number(targetDraft)
    if (!Number.isInteger(value) || value < MIN_TARGET_MINUTES || value > MAX_TARGET_MINUTES) {
      setTargetDraft(String(target))
      return
    }
    saveTarget(value)
  }

  // 专注记录改名或删除后统一走 store 的 refresh：专注页与工作台「专注趋势」卡片都会重读统计。
  const commitRename = (): void => {
    if (!renaming || mutating) return
    const next = renameDraft.trim().slice(0, 80)
    if (next === renaming.label) { setRenaming(null); return }
    setMutating(true)
    window.api.focus.rename({ id: renaming.id, label: next })
      .then(() => { setRenaming(null); refresh() })
      .catch(error => window.toast.error(humanError(error)))
      .finally(() => setMutating(false))
  }
  const removeRecent = (): void => {
    if (!deleting || mutating) return
    setMutating(true)
    window.api.focus.remove(deleting.id)
      .then(() => { setDeleting(null); refresh() })
      .catch(error => window.toast.error(humanError(error)))
      .finally(() => setMutating(false))
  }

  const progress = 1 - remaining / (minutes * 60)
  const clock = focusClock(remaining)
  const today = todayKey()
  const weekMax = useMemo(() => Math.max(TARGET_STEP, ...stats.days.map(day => day.minutes)), [stats.days])
  const hasWeekRecords = stats.days.some(day => day.minutes > 0)
  // 连续专注天数：从今天往回数有记录的天数，今天还没专注不算中断。
  const streak = useMemo(() => {
    let count = 0
    for (let index = stats.year.length - 1; index >= 0; index -= 1) {
      if (stats.year[index].minutes > 0) count += 1
      else if (index === stats.year.length - 1) continue
      else break
    }
    return count
  }, [stats.year])

  return (
    <div className="page focus-page">
      <PageHeader title="专注" />

      <div className="focus-layout">
        <section className="card focus-stage" aria-label="专注计时器">
          <LeafSprig className="focus-stage-art focus-stage-art-leaf" />
          <WaveLines className="focus-stage-art focus-stage-art-waves" />
          <div className="focus-clock">
            <CircularMeter value={minutes * 60 - remaining} max={minutes * 60} stroke={3.2}
              tone="accent" ariaLabel="本轮进度" valueText={`本轮已完成 ${Math.round(progress * 100)}%`}>
              <div className="focus-clock-readout">
                <span className="focus-time num" role="timer">{clock}</span>
                <span className="focus-label" role="status">{running ? '专注中' : started ? '已暂停' : '准备开始'}</span>
              </div>
            </CircularMeter>
          </div>
          <div className="focus-presets segmented fitted" role="group" aria-label="专注时长">
            {PRESETS.map(value => (
              <button className="num" key={value} aria-pressed={minutes === value} disabled={running || finishing} onClick={() => choose(value)}>
                {value} 分钟
              </button>
            ))}
          </div>
          <input className="input focus-topic" placeholder="这轮想做什么？（可选）" value={label} maxLength={80} onChange={event => setLabel(event.target.value)} aria-label="专注主题" />
          <div className="focus-actions">
            <button className="button primary" disabled={finishing} onClick={enter}>
              <Play size={14} />{running ? '返回沉浸' : started ? '继续专注' : '启动专注'}
            </button>
            <button className="button ghost" disabled={(!running && !started) || finishing} onClick={reset}><RotateCcw size={14} />重置</button>
          </div>
        </section>

        <section className="card focus-stats-card" aria-labelledby="focus-stats-title">
          <div className="card-head">
            <h2 className="card-title" id="focus-stats-title"><TrendingUp size={14} strokeWidth={1.8} aria-hidden="true" />专注统计</h2>
            {streak >= 2 && <span className="focus-streak"><Flame size={13} aria-hidden="true" />连续 {streak} 天</span>}
          </div>
          <div className="card-body">
            <div className="focus-stats">
              <StatCard label="今日" value={stats.todayMinutes} unit="分钟" accent />
              <StatCard label="近 7 天" value={stats.weekMinutes} unit="分钟" />
              <StatCard label="累计" value={stats.totalSessions} unit="次" />
            </div>
            <Meter
              label={`今日目标 ${target} 分钟`}
              value={Math.min(stats.todayMinutes, target)}
              max={target}
              tone={stats.todayMinutes >= target ? 'success' : 'accent'}
              readout={stats.todayMinutes >= target ? `已达成 · ${stats.todayMinutes} 分钟` : `${stats.todayMinutes} / ${target} 分钟`}
              valueText={`今日已专注 ${stats.todayMinutes} 分钟，目标 ${target} 分钟`}
            />
            <div className="focus-target">
              <span className="focus-summary-heading">调整今日目标</span>
              <div className="focus-target-stepper">
                <button type="button" className="button ghost icon sm" aria-label="减少今日目标 5 分钟"
                  disabled={target <= MIN_TARGET_MINUTES} onClick={() => saveTarget(target - TARGET_STEP)}><Minus size={13} aria-hidden="true" /></button>
                <input className="input num" type="number" min={MIN_TARGET_MINUTES} max={MAX_TARGET_MINUTES} step={TARGET_STEP}
                  value={targetDraft} aria-label="今日目标（分钟）"
                  onChange={event => setTargetDraft(event.target.value)}
                  onBlur={commitTarget}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitTarget() } }} />
                <button type="button" className="button ghost icon sm" aria-label="增加今日目标 5 分钟"
                  disabled={target >= MAX_TARGET_MINUTES} onClick={() => saveTarget(target + TARGET_STEP)}><Plus size={13} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="focus-week-heading">
              <span className="focus-summary-heading">近 7 天趋势</span>
              {hasWeekRecords && <span className="small muted">日均 {(stats.weekMinutes / 7).toFixed(1)} 分钟</span>}
            </div>
            {hasWeekRecords ? (
              <div className="focus-week">
                {stats.days.map(day => {
                  const isToday = day.date === today
                  return (
                    <div className="focus-bar" key={day.date} title={`${day.date} · ${day.minutes} 分钟`}>
                      <i className={isToday ? 'today' : ''} style={{ height: `${Math.max(4, (day.minutes / weekMax) * 100)}%` }} />
                      <span className={isToday ? 'today' : undefined}>{WEEKDAYS[new Date(`${day.date}T12:00:00`).getDay()]}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="focus-week-empty small muted">近 7 天还没有专注记录。</p>
            )}
            <div className="focus-summary-heading">年度专注</div>
            <FocusYearGrid year={stats.year} />
          </div>
        </section>

        <section className="card focus-recent-card" aria-labelledby="focus-recent-title">
          <div className="card-head">
            <h2 className="card-title" id="focus-recent-title">最近专注</h2>
          </div>
          <div className="card-body">
            {stats.recent.length ? <ul className="focus-recent">
              {stats.recent.map(item => {
                const name = item.label || '未命名专注'
                return (
                  <li key={item.id}>
                    <span className="focus-recent-label" title={item.label || undefined}>{name}</span>
                    <span className="focus-recent-meta">{item.minutes} 分钟 · {formatDate(item.startedAt, 'M月d日 HH:mm')}</span>
                    <span className="focus-recent-actions">
                      <button type="button" className="icon-action" title="重命名专注" aria-label={`重命名「${name}」`}
                        onClick={() => { setRenaming(item); setRenameDraft(item.label) }}><Pencil size={12} aria-hidden="true" /></button>
                      <button type="button" className="icon-action danger" title="删除专注记录" aria-label={`删除「${name}」的记录`}
                        onClick={() => setDeleting(item)}><Trash2 size={12} aria-hidden="true" /></button>
                    </span>
                  </li>
                )
              })}
            </ul> : <p className="small muted">最近没有专注记录。</p>}
          </div>
        </section>
      </div>

      <Dialog open={renaming !== null} title="重命名专注" onClose={() => { if (!mutating) setRenaming(null) }}>
        <form onSubmit={event => { event.preventDefault(); commitRename() }}>
          <input className="input" aria-label="专注主题" placeholder="留空保存为未命名专注" maxLength={80}
            value={renameDraft} onChange={event => setRenameDraft(event.target.value)} data-dialog-autofocus />
          <div className="actions"><Button type="submit" loading={mutating}>保存主题</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={deleting !== null} title="删除专注记录？" confirmLabel="删除记录"
        description={`「${deleting?.label || '未命名专注'}」（${deleting?.minutes ?? 0} 分钟 · ${deleting ? formatDate(deleting.startedAt, 'M月d日 HH:mm') : ''}）将从本机删除，统计随之减少。`}
        loading={mutating} onClose={() => { if (!mutating) setDeleting(null) }} onConfirm={removeRecent} />
    </div>
  )
}

export default defineModule({
  id: 'focus',
  name: '专注',
  group: '工具',
  icon: Timer,
  order: 55,
  defaultPinned: false,
  commandActions: [
    {
      id: 'start',
      name: '开始专注',
      icon: Timer,
      keywords: ['focus', 'timer', '计时'],
      run: () => {
        useNavigation.getState().navigate('/focus')
        useFocus.getState().enter()
      }
    }
  ],
  dashboardCards: [
    { id: 'focus-trend', name: '专注趋势', defaultVisible: true, defaultOrder: 60 }
  ],
  keywords: ['focus', 'pomodoro', '番茄钟', '计时'],
  page: FocusPage
})
