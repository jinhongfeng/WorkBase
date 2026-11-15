import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigation } from '../../stores/navigation'
import {
  createSplashParticles, SPLASH_CONVERGE_MS, SPLASH_FADE_MS, type SplashParticles
} from './splash-particles'

const MAX_SPLASH_MS = 1200
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export function Splash() {
  const ready = useNavigation(state => state.ready)
  const startedAt = useRef(0)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)
  const particles = useRef<SplashParticles | null>(null)
  const [phase, setPhase] = useState<'enter' | 'leave' | 'done'>(
    () => matchMedia(REDUCED_MOTION).matches ? 'done' : 'enter'
  )
  const active = phase !== 'done'

  useEffect(() => {
    if (phase !== 'enter') return
    // 为退场预留时间，即使导航尚未就绪也在总时限内交还界面。
    const leaveAt = ready ? SPLASH_CONVERGE_MS : MAX_SPLASH_MS - SPLASH_FADE_MS
    const remaining = Math.max(0, startedAt.current + leaveAt - performance.now())
    const timer = window.setTimeout(
      () => setPhase(current => current === 'enter' ? 'leave' : current),
      remaining
    )
    return () => window.clearTimeout(timer)
  }, [phase, ready])

  useLayoutEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    const host = hostRef.current
    const mark = markRef.current
    if (!canvas || !host || !mark) return

    const motion = matchMedia(REDUCED_MOTION)
    if (motion.matches) {
      setPhase('done')
      return
    }
    startedAt.current = performance.now()
    const engine = createSplashParticles({ canvas, host, mark, startedAt: startedAt.current })
    particles.current = engine
    const deadline = window.setTimeout(
      () => setPhase('done'),
      Math.max(0, startedAt.current + MAX_SPLASH_MS - performance.now())
    )
    const skipMotion = (event: MediaQueryListEvent): void => {
      if (event.matches) setPhase('done')
    }
    motion.addEventListener('change', skipMotion)
    return () => {
      engine?.destroy()
      particles.current = null
      window.clearTimeout(deadline)
      motion.removeEventListener('change', skipMotion)
    }
  }, [active])

  useLayoutEffect(() => {
    if (phase !== 'leave') return
    particles.current?.dissipate()
    const timer = window.setTimeout(() => setPhase('done'), SPLASH_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'done') return null

  return (
    <div className="splash" data-phase={phase} aria-hidden="true">
      <div className="splash-haze" />
      <canvas ref={canvasRef} className="splash-particles" />
      <div className="splash-core">
        <div ref={hostRef} className="splash-emblem">
          <span className="splash-halo" />
          <svg className="splash-traces" viewBox="0 0 320 128" fill="none">
            <path className="splash-trace" pathLength="1" d="M30 32H58Q66 32 72 38L92 58Q98 64 105 64H130" />
            <path className="splash-trace" pathLength="1" d="M290 96H262Q254 96 248 90L228 70Q222 64 215 64H190" />
            <circle className="splash-pulse" cx="30" cy="32" r="3" />
            <circle className="splash-pulse" cx="290" cy="96" r="3" />
            <circle className="splash-ripple" cx="160" cy="64" r="30" pathLength="1" />
          </svg>
          <span ref={markRef} className="splash-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <path className="splash-letter" pathLength="1" d="M5 8l5 16 6-11 6 11 5-16" />
            </svg>
          </span>
        </div>
        <span className="splash-word">WorkBase</span>
        <span className="splash-tag">本地离线工作台</span>
      </div>
    </div>
  )
}
