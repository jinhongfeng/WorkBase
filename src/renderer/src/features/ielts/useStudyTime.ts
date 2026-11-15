import { useEffect } from 'react'
import { humanError } from '../../lib/utils'

/** 前台学习时每 10 秒落盘；一分钟无操作后暂停，切页和失焦时结算。 */
export function useStudyTime(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const sessionId = crypto.randomUUID()
    let lastInput = performance.now()
    let failed = false
    const pulse = (active: boolean): void => {
      void window.api.ielts.studyPulse({ sessionId, active }).then(() => { failed = false }).catch(error => {
        if (!failed) window.toast.error(`学习时长未能保存：${humanError(error)}`)
        failed = true
      })
    }
    const isActive = (): boolean => document.visibilityState === 'visible' && document.hasFocus() && performance.now() - lastInput < 60000
    const tick = (): void => pulse(isActive())
    const input = (): void => {
      const wasIdle = performance.now() - lastInput >= 60000
      lastInput = performance.now()
      if (wasIdle) tick()
    }
    const resume = (): void => { lastInput = performance.now(); tick() }
    const pause = (): void => pulse(false)
    const visibility = (): void => { if (document.visibilityState === 'visible') resume(); else pause() }
    document.addEventListener('pointerdown', input)
    document.addEventListener('keydown', input)
    document.addEventListener('wheel', input, { passive: true })
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', resume)
    window.addEventListener('blur', pause)
    tick()
    const timer = setInterval(tick, 10000)
    return () => {
      clearInterval(timer)
      document.removeEventListener('pointerdown', input)
      document.removeEventListener('keydown', input)
      document.removeEventListener('wheel', input)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', resume)
      window.removeEventListener('blur', pause)
      pause()
    }
  }, [enabled])
}
