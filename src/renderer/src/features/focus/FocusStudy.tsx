import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Languages, Search, Settings2 } from 'lucide-react'
import type { Note, NoteSummary } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { markdownToHtml } from '../../lib/markdown'
import { humanError } from '../../lib/utils'
import { syncImageRowRatio } from '../notes/imageLayout'
import { FocusEnglish } from './FocusEnglish'
import { FocusStudySettings, parseStudySettings, STUDY_SETTING, type StudySettings } from './FocusStudySettings'

/** 阅读笔记可从学习工具或场景菜单进入。 */
export function FocusNotes({ onBack }: { onBack(): void }) {
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<NoteSummary[] | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  const article = useRef<HTMLElement>(null)
  const html = useMemo(() => note ? markdownToHtml(note.content) : '', [note])

  useEffect(() => {
    if (note) return
    let active = true
    const timer = setTimeout(() => {
      void window.api.notes.list({ query: search.trim(), limit: 30 }).then(result => {
        if (active) setNotes(result)
      }).catch(reason => {
        if (active) setError(humanError(reason))
      })
    }, search ? 180 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [note, search])

  useEffect(() => { if (note) heading.current?.focus() }, [note])

  // 双列图片行的统一高度（--note-row-ratio）在图片加载后写入，load 事件不冒泡所以用捕获监听。
  useEffect(() => {
    const element = article.current
    if (!note || !element) return
    for (const row of element.querySelectorAll<HTMLElement>('[data-note-image-row]')) syncImageRowRatio(row)
    const onLoad = (event: Event): void => {
      const row = (event.target instanceof Element ? event.target.closest('[data-note-image-row]') : null)
      if (row instanceof HTMLElement) syncImageRowRatio(row)
    }
    element.addEventListener('load', onLoad, true)
    return () => element.removeEventListener('load', onLoad, true)
  }, [note, html])

  // 大纲从渲染后的正文读取，与标题元素一一对应，点击滚动到所在位置。
  useEffect(() => {
    const element = article.current
    if (!note || !element) { setOutline([]); return }
    setOutline(Array.from(element.querySelectorAll('h1, h2, h3, h4')).map(item => ({
      level: Number(item.tagName.charAt(1)),
      text: (item.textContent ?? '').trim()
    })))
  }, [note, html])

  function jumpToHeading(position: number): void {
    const target = article.current?.querySelectorAll('h1, h2, h3, h4')[position]
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  async function openNote(id: string): Promise<void> {
    setError('')
    setOpening(true)
    try {
      const result = await window.api.notes.get(id)
      if (result) setNote(result)
      else setError('这篇笔记已找不到，请选择另一篇。')
    } catch (reason) {
      setError(humanError(reason))
    } finally {
      setOpening(false)
    }
  }

  if (note) return <div className="focus-room-reading">
    {outline.length > 0 && <aside className="focus-room-outline" aria-label="笔记大纲">
      <h2>大纲</h2>
      <div className="outline-group">
        {outline.map((item, position) => (
          <button key={`${position}-${item.text}`} type="button" className={`outline-link lv${item.level}`}
            onClick={() => jumpToHeading(position)}>{item.text}</button>
        ))}
      </div>
    </aside>}
    <section className="focus-room-reader" aria-label="阅读笔记">
      <Button variant="ghost" onClick={() => setNote(null)}><ArrowLeft size={16} />返回笔记列表</Button>
      <h1 ref={heading} tabIndex={-1}>{note.title || '未命名笔记'}</h1>
      {note.content.trim() ? <article className="focus-room-note prose" ref={article} dangerouslySetInnerHTML={{ __html: html }} />
        : <p className="focus-room-empty">这篇笔记还没有正文。</p>}
    </section>
  </div>

  return <section className="focus-room-library focus-room-notes" aria-label="选择笔记">
    <header className="focus-room-library-head">
      <h1>选择笔记</h1>
      <Button variant="ghost" disabled={opening} onClick={onBack}><ArrowLeft size={16} />回到学习</Button>
    </header>
    <label className="focus-room-search"><Search size={16} />
      <input className="input" type="search" autoFocus aria-label="搜索笔记" placeholder="搜索标题或正文"
        value={search} maxLength={200} disabled={opening} onChange={event => {
          setSearch(event.target.value)
          setNotes(null)
          setError('')
        }} />
    </label>
    {error && <p className="focus-room-empty" role="alert">{error}</p>}
    {notes ? notes.length > 0 ? <div className="focus-room-file-list">
      {notes.map(item => <button type="button" key={item.id} disabled={opening} onClick={() => void openNote(item.id)}>
        <BookOpen size={16} /><span className="truncate">{item.title || '未命名笔记'}</span>
      </button>)}
    </div> : <p className="focus-room-empty">{search.trim() ? '没有找到匹配的笔记。' : '还没有笔记，可以返回继续当前任务。'}</p>
      : !error && <p className="focus-room-empty" role="status">正在读取笔记…</p>}
  </section>
}

export function FocusStudy() {
  const [view, setView] = useState<'notes' | 'english' | null>(null)
  const [settings, setSettings] = useState<StudySettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void window.api.settings.getAll().then(saved => {
      if (active) setSettings(parseStudySettings(saved[STUDY_SETTING]))
    }).catch(error => {
      if (active) setError(humanError(error))
    })
    return () => { active = false }
  }, [loadAttempt])

  function returnToStudy(): void {
    setView(null)
  }

  return <>
    {view === 'notes' && settings?.notes ? <FocusNotes onBack={returnToStudy} />
      : view === 'english' && settings?.english ? <FocusEnglish key={settings.englishSetId} setId={settings.englishSetId} onBack={returnToStudy} />
        : null}
    <aside className="focus-study-tools" aria-label="学习工具">
      <h2>学习工具</h2>
      {settings?.notes && <Button variant="ghost" aria-pressed={view === 'notes'} onClick={() => setView('notes')}>
        <BookOpen size={16} />阅读笔记
      </Button>}
      {settings?.english && <Button variant="ghost" aria-pressed={view === 'english'} onClick={() => setView('english')}>
        <Languages size={16} />学习英语
      </Button>}
      {settings && <Button variant="ghost" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
        <Settings2 size={16} />学习设置
      </Button>}
      {error && <Button variant="ghost" onClick={() => {
        setError('')
        setLoadAttempt(attempt => attempt + 1)
      }}>重试读取设置</Button>}
      {error && <p role="alert">无法读取学习设置。{error}</p>}
      {!settings && !error && <p role="status">正在读取学习设置…</p>}
    </aside>
    {settingsOpen && settings && <FocusStudySettings settings={settings} onClose={() => setSettingsOpen(false)}
      onSave={next => {
        if (view && !next[view]) setView(null)
        setSettings(next)
        setSettingsOpen(false)
      }} />}
  </>
}
