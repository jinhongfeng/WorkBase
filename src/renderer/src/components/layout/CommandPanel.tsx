import { useEffect, useId, useLayoutEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import type { NoteSummary } from '@shared/types'
import { useModuleRegistry } from '../../modules/registry'
import { useNavigation } from '../../stores/navigation'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'

interface Row { key: string; label: string; sub: string; onOpen(): void; icon: React.ComponentType<{ size?: number }> }

/** 子序列模糊匹配：连续命中与起始位置加分，未命中返回 -1。 */
function fuzzyScore(text: string, term: string): number {
  const source = text.toLowerCase()
  const query = term.toLowerCase()
  let score = 0
  let cursor = 0
  let streak = 0
  for (const char of query) {
    const index = source.indexOf(char, cursor)
    if (index < 0) return -1
    streak = index === cursor ? streak + 1 : 1
    score += 1 + streak + (index === 0 ? 2 : 0)
    cursor = index + 1
  }
  return score
}

function bestScore(texts: string[], term: string): number {
  let best = -1
  for (const text of texts) best = Math.max(best, fuzzyScore(text, term))
  return best
}

export function CommandPanel() {
  const modules = useModuleRegistry(state => state.modules)
  const command = useNavigation(state => state.command)
  const setCommand = useNavigation(state => state.setCommand)
  const navigate = useNavigation(state => state.navigate)
  const openNote = useNavigation(state => state.openNote)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'error'>('idle')
  const resultsId = useId()
  const term = query.trim()

  useLayoutEffect(() => { if (!command) { setQuery(''); setIndex(0); setNotes([]); setSearchStatus('idle') } }, [command])

  useEffect(() => {
    if (!command) return
    if (!term) return
    let active = true
    const timer = setTimeout(() => {
      void window.api.notes.list({ query: term, limit: 5 })
        .then(rows => { if (active) { setNotes(rows); setSearchStatus('idle') } })
        .catch(() => { if (active) setSearchStatus('error') })
    }, 150)
    return () => { active = false; clearTimeout(timer) }
  }, [term, command])

  // 模块贡献的快速动作（新建笔记、开始专注等）排在最前，与模块、笔记一样参与模糊匹配。
  const actionRows = useMemo<Row[]>(() => {
    const rows: { row: Row; score: number }[] = []
    for (const module of modules) {
      for (const action of module.commandActions ?? []) {
        const score = !term ? 0 : bestScore([action.name, ...(action.keywords ?? [])], term)
        if (score < 0) continue
        rows.push({
          row: {
            key: `action-${module.id}-${action.id}`,
            label: action.name,
            sub: `动作 · ${module.name}`,
            icon: action.icon,
            onOpen: () => { void action.run() }
          },
          score
        })
      }
    }
    return rows.sort((a, b) => b.score - a.score).map(item => item.row)
  }, [modules, term])

  const moduleRows = useMemo<Row[]>(() => {
    const rows: { row: Row; score: number }[] = []
    for (const module of modules) {
      const score = !term ? 0 : bestScore([module.name, module.id, ...(module.keywords ?? [])], term)
      if (score < 0) continue
      rows.push({
        row: {
          key: `module-${module.id}`,
          label: module.name,
          sub: module.group,
          icon: module.icon,
          onOpen: () => navigate(module.path || '/' + module.id)
        },
        score
      })
    }
    return rows.sort((a, b) => b.score - a.score).map(item => item.row)
  }, [modules, navigate, term])

  const noteRows = useMemo<Row[]>(() => notes.map(note => ({
    key: `note-${note.id}`,
    label: note.title,
    sub: note.kind === 'journal' ? `日记 · ${note.journalDate ?? ''}` : '笔记',
    icon: FileText,
    onOpen: () => openNote({ id: note.id })
  })), [notes, openNote])

  const rows = [...actionRows, ...moduleRows, ...noteRows]
  const selectedIndex = Math.min(index, rows.length - 1)
  const selected = rows[selectedIndex]
  const optionId = (row: Row): string => `${resultsId}-${row.key}`
  const searchMessage = searchStatus === 'searching' ? '正在搜索笔记…'
    : searchStatus === 'error' ? '无法搜索笔记，请重新输入关键词。'
      : !rows.length ? '没有匹配的动作、功能或笔记' : null

  return (
    <Dialog open={command} title="快速跳转" onClose={() => setCommand(false)}>
      <Input
        data-dialog-autofocus
        role="combobox"
        aria-label="搜索功能或笔记"
        aria-autocomplete="list"
        aria-controls={resultsId}
        aria-expanded={rows.length > 0}
        aria-activedescendant={selected ? optionId(selected) : undefined}
        placeholder="搜索动作、功能、笔记内容…"
        value={query}
        onChange={event => {
          const value = event.target.value
          setQuery(value)
          if (value.trim() === term) return
          setIndex(0)
          setNotes([])
          setSearchStatus(value.trim() ? 'searching' : 'idle')
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!rows.length) return
            // 循环导航：末行往下回到首行、首行往上到末行（对齐 coss ui listbox 行为）。
            const offset = event.key === 'ArrowDown' ? 1 : -1
            const next = (selectedIndex + offset + rows.length) % rows.length
            setIndex(next)
            document.getElementById(optionId(rows[next]))?.scrollIntoView({ block: 'nearest' })
          }
          if ((event.key === 'Home' || event.key === 'End') && rows.length) {
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : rows.length - 1
            setIndex(next)
            document.getElementById(optionId(rows[next]))?.scrollIntoView({ block: 'nearest' })
          }
          if (event.key === 'Enter') selected?.onOpen()
        }}
      />
      <div className="command-results" role="listbox" id={resultsId} aria-label="搜索结果">
        {rows.map((row, position) => (
          <button key={row.key} id={optionId(row)} type="button" role="option" tabIndex={-1}
            aria-selected={position === selectedIndex} className={`command-row ${position === selectedIndex ? 'highlighted' : ''}`}
            onMouseEnter={() => setIndex(position)} onClick={row.onOpen}>
            <row.icon size={17} aria-hidden="true" />
            <span className="truncate">{row.label}</span>
            <small>{row.sub}</small>
          </button>
        ))}
      </div>
      {searchMessage && <p role="status" className="no-results">{searchMessage}</p>}
      <small className="muted">↑ ↓ 选择 · Enter 打开 · Esc 关闭</small>
    </Dialog>
  )
}
