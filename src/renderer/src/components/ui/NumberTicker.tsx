import { useEffect, useRef, useState } from 'react'

interface State { value: string; prev: string | null; seq: number; dir: 'up' | 'down' }

function toNumber(value: string): number | null {
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 数位滚动（样式参考 21st.dev 的 Number Ticker，按本项目动效规范重新实现）：
 * 数值变化时只给发生变化的字符做 180ms 位移淡入，方向跟随数值增减；
 * 位数对不上（进位、加载占位「—」切换）时整体滚动。
 * 字体继承宿主 .stat-value 的 tabular-nums，滚动期间宽度稳定。
 */
export function NumberTicker({ value }: { value: string }) {
  const [state, setState] = useState<State>({ value, prev: null, seq: 0, dir: 'up' })
  const previous = useRef(value)

  useEffect(() => {
    if (value === previous.current) return
    const before = previous.current
    previous.current = value
    setState(current => {
      const now = toNumber(value)
      const then = toNumber(before)
      const dir = now !== null && then !== null && now < then ? 'down' : 'up'
      return { value, prev: before, seq: current.seq + 1, dir }
    })
  }, [value])

  const chars = [...state.value]
  const prevChars = state.prev === null ? [] : [...state.prev]
  const aligned = state.prev !== null && prevChars.length === chars.length
  return (
    <span className="num-ticker" key={state.seq}>
      {chars.map((char, index) => (
        <span key={index} data-roll={aligned && prevChars[index] !== char ? state.dir : undefined}>{char}</span>
      ))}
    </span>
  )
}
