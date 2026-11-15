import { useEffect, useRef } from 'react'

/** 单段上限 2 小时：系统睡眠等异常丢事件时防止单段虚高。 */
const MAX_SEGMENT_SECONDS = 7200

let current: { page: string; start: number } | null = null

/** 结算当前片段并上报；少于 1 秒的片段不计。供切页、失焦、隐藏与关窗前调用。 */
export function flushPageTime(): Promise<void> | undefined {
  if (!current) return undefined
  const { page, start } = current
  current = null
  const seconds = Math.min(MAX_SEGMENT_SECONDS, Math.round((Date.now() - start) / 1000))
  if (seconds < 1) return undefined
  return window.api.pageTime.track({ page, seconds }).catch((reason: unknown) => {
    console.warn('page time track failed:', reason)
  })
}

function start(page: string): void {
  if (current?.page === page) return
  void flushPageTime()
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    current = { page, start: Date.now() }
  }
}

/**
 * 页面停留追踪：窗口聚焦且页面可见时计时，切页 / 失焦 / 隐藏即结算上报。
 * 挂在 Router 上，page 为当前模块 id；无模块（加载中）不计时。
 */
export function usePageTimeTracking(page: string | undefined): void {
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => {
    const resume = (): void => { if (pageRef.current) start(pageRef.current) }
    const pause = (): void => { void flushPageTime() }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') resume()
      else pause()
    }
    if (page) start(page)
    document.addEventListener('visibilitychange', onVisibility)
    addEventListener('focus', resume)
    addEventListener('blur', pause)
    return () => {
      pause()
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('focus', resume)
      removeEventListener('blur', pause)
    }
  }, [page])
}
