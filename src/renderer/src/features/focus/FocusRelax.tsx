import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'

/** 放松场景：呼吸练习（多节奏）、正念冥想与护眼休息，全部纯本地、不打断专注计时。 */

type PhaseKind = 'in' | 'hold' | 'out'

interface BreathPattern {
  id: string
  label: string
  phases: { kind: PhaseKind; seconds: number }[]
}

const BREATH_PATTERNS: BreathPattern[] = [
  { id: 'calm', label: '放松呼吸', phases: [{ kind: 'in', seconds: 4 }, { kind: 'out', seconds: 6 }] },
  { id: '478', label: '4-7-8 呼吸', phases: [{ kind: 'in', seconds: 4 }, { kind: 'hold', seconds: 7 }, { kind: 'out', seconds: 8 }] },
  { id: 'box', label: '箱式呼吸', phases: [{ kind: 'in', seconds: 4 }, { kind: 'hold', seconds: 4 }, { kind: 'out', seconds: 4 }, { kind: 'hold', seconds: 4 }] }
]

const PHASE_TEXT: Record<PhaseKind, (seconds: number) => string> = {
  in: seconds => `吸气 · ${seconds} 秒`,
  hold: seconds => `屏住 · ${seconds} 秒`,
  out: seconds => `呼气 · ${seconds} 秒`
}

const MEDITATION_OPTIONS = [1, 3, 5]
const EYE_REST_SECONDS = 20

function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function BreathMode() {
  const [patternId, setPatternId] = useState(BREATH_PATTERNS[0].id)
  const pattern = BREATH_PATTERNS.find(item => item.id === patternId) ?? BREATH_PATTERNS[0]
  const [step, setStep] = useState(0)
  const [rounds, setRounds] = useState(0)
  const phase = pattern.phases[Math.min(step, pattern.phases.length - 1)]
  // hold 阶段圆盘保持上一个非 hold 相位的终态：吸气后停在扩张，呼气后停在收缩。
  const expanded = (() => {
    if (phase.kind !== 'hold') return phase.kind === 'in'
    for (let index = step; index >= 0; index -= 1) {
      const kind = pattern.phases[index]?.kind
      if (kind === 'in') return true
      if (kind === 'out') return false
    }
    return true
  })()

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = step + 1
      if (next >= pattern.phases.length) {
        setRounds(value => value + 1)
        setStep(0)
      } else {
        setStep(next)
      }
    }, phase.seconds * 1000)
    return () => clearTimeout(timer)
  }, [pattern, phase.seconds, step])

  return <>
    <div className="focus-breath-dial" aria-hidden="true">
      <div className="focus-breath-circle" data-phase={expanded ? 'in' : 'out'}
        style={{ transitionDuration: `${phase.seconds}s` }} />
    </div>
    <h1 aria-live="polite">{PHASE_TEXT[phase.kind](phase.seconds)}</h1>
    {rounds > 0 && <p className="focus-relax-note" role="status">已完成 {rounds} 轮 · 顺其自然，不用数</p>}
    <div className="focus-relax-patterns" role="group" aria-label="呼吸节奏">
      {BREATH_PATTERNS.map(item => (
        <Button key={item.id} className="sm" variant="ghost" aria-pressed={item.id === patternId}
          onClick={() => { setPatternId(item.id); setStep(0); setRounds(0) }}>{item.label}</Button>
      ))}
    </div>
  </>
}

function MeditationMode() {
  const [minutes, setMinutes] = useState(3)
  const [left, setLeft] = useState<number | null>(null)
  const done = left === 0

  useEffect(() => {
    if (left === null || left <= 0) return
    const timer = setTimeout(() => setLeft(value => Math.max(0, (value ?? 1) - 1)), 1000)
    return () => clearTimeout(timer)
  }, [left])

  return <>
    <div className="focus-breath-dial focus-relax-dial" aria-hidden="true">
      <span className="focus-relax-count num">{left === null ? `${minutes}:00` : clock(left)}</span>
    </div>
    <h1 aria-live="polite">{done ? '冥想完成，慢慢回到当下。' : left === null ? '静坐片刻，把注意力放回呼吸。' : '跟随呼吸，什么都不用做。'}</h1>
    <div className="focus-relax-patterns" role="group" aria-label="冥想时长">
      {left === null ? <>
        {MEDITATION_OPTIONS.map(value => (
          <Button key={value} className="sm" variant="ghost" aria-pressed={value === minutes}
            onClick={() => setMinutes(value)}>{value} 分钟</Button>
        ))}
        <Button className="sm" variant="primary" onClick={() => setLeft(minutes * 60)}>开始</Button>
      </> : <Button className="sm" variant="ghost" onClick={() => setLeft(null)}>结束</Button>}
    </div>
  </>
}

function EyeRestMode() {
  const [left, setLeft] = useState<number | null>(null)
  const done = left === 0

  useEffect(() => {
    if (left === null || left <= 0) return
    const timer = setTimeout(() => setLeft(value => Math.max(0, (value ?? 1) - 1)), 1000)
    return () => clearTimeout(timer)
  }, [left])

  return <>
    <div className="focus-breath-dial focus-relax-dial" aria-hidden="true">
      <span className="focus-relax-count num">{left === null ? `${EYE_REST_SECONDS}s` : `${left}s`}</span>
    </div>
    <h1 aria-live="polite">{done ? '休息结束，记得每 20 分钟远眺一次。' : left === null ? '每 20 分钟，望向 6 米外 20 秒。' : '望向远处，让眼睛放松。'}</h1>
    <div className="focus-relax-patterns">
      {left === null
        ? <Button className="sm" variant="primary" onClick={() => setLeft(EYE_REST_SECONDS)}>开始 {EYE_REST_SECONDS} 秒</Button>
        : <Button className="sm" variant="ghost" onClick={() => setLeft(null)}>结束</Button>}
    </div>
  </>
}

const MODES = [
  { id: 'breath', label: '呼吸' },
  { id: 'meditate', label: '冥想' },
  { id: 'eyes', label: '护眼' }
] as const

export function FocusRelax() {
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('breath')
  return <section className="focus-room-quiet focus-relax" aria-label="放松">
    <div className="focus-relax-modes" role="group" aria-label="放松方式">
      {MODES.map(item => (
        <Button key={item.id} className="sm" variant="ghost" aria-pressed={mode === item.id}
          onClick={() => setMode(item.id)}>{item.label}</Button>
      ))}
    </div>
    {mode === 'breath' ? <BreathMode /> : mode === 'meditate' ? <MeditationMode /> : <EyeRestMode />}
  </section>
}
