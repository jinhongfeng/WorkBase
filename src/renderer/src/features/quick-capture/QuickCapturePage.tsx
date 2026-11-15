import { useEffect, useRef, useState } from 'react'
import { humanError } from '../../lib/utils'
import './quick-capture.css'

/** 全局速记浮窗：Ctrl/Cmd+Shift+Space 唤出，失焦或 Esc 隐藏，Enter 存为笔记。 */
export default function QuickCapturePage() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const save = async (): Promise<void> => {
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      // 与首页快速记录同一套 #标签 提取约定，正文原样保留。
      const hashtags = Array.from(content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu), match => match[1])
      const tags = [...new Set(hashtags.filter(tag => tag.length <= 40))].slice(0, 20)
      await window.api.notes.save({ kind: 'note', title: '', content, tags })
      setText('')
      setError('')
      window.api.app.hideQuickCapture()
    } catch (cause) {
      setError(humanError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="quick-capture" role="form" aria-label="速记浮窗">
      <div className="quick-capture-head">
        <span className="quick-capture-title">速记</span>
        <span className="quick-capture-hint">Enter 保存 · Shift+Enter 换行 · Esc 关闭</span>
      </div>
      <textarea
        ref={input}
        className="quick-capture-input"
        placeholder="记点什么…（#标签 可直接标注）"
        value={text}
        readOnly={saving}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void save()
          }
          if (event.key === 'Escape') window.api.app.hideQuickCapture()
        }}
      />
      {error && <p className="quick-capture-error" role="alert">{error}</p>}
    </div>
  )
}
