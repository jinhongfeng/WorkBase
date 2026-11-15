import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { humanError } from '../../lib/utils'

interface Props {
  text: string
  label: string
  variant?: 'secondary' | 'ghost'
  disabled?: boolean
  className?: string
}

/** 复制按钮：成功时按钮内切换「已复制」约 1.8 秒（参考 Emil Kowalski 的内联反馈手法），
    不再叠加全局 toast；失败仍然 toast 中文错误。 */
export function CopyButton({ text, label, variant = 'secondary', disabled, className = '' }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      // 剪贴板被系统或无焦点状态拒绝时，浏览器原文对用户没有可读性，给出固定中文文案。
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      window.toast.error(denied ? '无法访问剪贴板，请重试一次。' : humanError(error))
    }
  }

  return (
    <Button type="button" variant={variant} disabled={disabled} className={className} onClick={() => void copy()}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? '已复制' : label}
    </Button>
  )
}
