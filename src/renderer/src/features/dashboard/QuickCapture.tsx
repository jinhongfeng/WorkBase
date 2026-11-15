import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { humanError } from '../../lib/utils'

export default function QuickCapture({ onSaved }: { onSaved(): void }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      const hashtags = Array.from(content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu), match => match[1])
      const tags = [...new Set(hashtags.filter(tag => tag.length <= 40))].slice(0, 20)
      await window.api.notes.save({ kind: 'note', title: '', content, tags })
      setText('')
      onSaved()
      window.toast.success('已保存到笔记')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="home-capture" onSubmit={event => { event.preventDefault(); void save() }}>
      <span className="home-capture-icon" aria-hidden="true"><PenLine size={14} /></span>
      <input
        aria-label="快速记录"
        placeholder="快速记录，回车存为笔记"
        value={text}
        readOnly={saving}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }}
      />
      <kbd className="kbd">Enter</kbd>
    </form>
  )
}
