import { useRef, useState } from 'react'
import { X } from 'lucide-react'

const MAX_TAGS = 12

export function parseNoteTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}

export function NoteTags({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const tags = parseNoteTags(value)
  const atLimit = tags.length >= MAX_TAGS

  function commit() {
    const additions = [...new Set(draft.split(/[,，\s]+/).filter(Boolean))].filter(tag => !tags.includes(tag))
    if (additions.some(tag => tag.length > 40)) { setError('每个标签最多 40 个字符'); return }
    if (additions.length && tags.length + additions.length > MAX_TAGS) {
      setError(`最多添加 ${MAX_TAGS} 个标签`)
      return
    }
    if (additions.length) onChange([...tags, ...additions].join(','))
    setError('')
    setDraft('')
  }

  return <div className="note-tags" role="group" aria-label="笔记标签">
    {tags.map((tag, index) => <button type="button" key={`${tag}-${index}`} className="note-tag"
      aria-label={`移除标签 ${tag}`} onClick={() => {
        onChange(tags.filter((_, position) => position !== index).join(','))
        input.current?.focus()
      }}>
      <span>{tag}</span><X size={11} aria-hidden="true" />
    </button>)}
    <input className="tag-input" ref={input} value={draft} maxLength={500} readOnly={atLimit}
      aria-label={atLimit ? '标签已达上限' : '添加标签，按回车确认'} aria-invalid={Boolean(error)}
      placeholder={atLimit ? '已达上限' : '+ 标签'}
      onChange={event => { setDraft(event.target.value); setError('') }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
          event.preventDefault()
          commit()
        }
        if (event.key === 'Escape') { setDraft(''); setError('') }
      }} />
    {error && <span className="note-tag-error" role="status">{error}</span>}
  </div>
}
