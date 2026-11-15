import { format, formatDistanceToNowStrict } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Electron IPC 抛出的错误会把业务 JSON 塞进 message，这里取回人类可读文案。 */
export function humanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { message?: string; code?: string }
      if (parsed.message) return parsed.message
    } catch { /* 非业务错误，退回原文 */ }
  }
  return raw.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '')
}

export function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDate(value: number | string, pattern = 'M月d日'): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, pattern, { locale: zhCN })
}

export function relativeTime(value: number): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true, locale: zhCN })
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 320))
}

export function uid(prefix = 'r'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
