import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CalendarHeart, Pencil, Plus, Trash2 } from 'lucide-react'
import { MEMORY_PAGE_SIZE, type MemoryEntry, type MemoryPage } from '@shared/memories'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/Pager'
import { SearchField } from '../../components/ui/SearchField'
import { humanError } from '../../lib/utils'
import { MemoryEditor, memoryImageUrl } from './MemoryEditor'
import './memories.css'

export default function MemoriesPage() {
  const [request, setRequest] = useState<{ page: number; year: string | null; query: string }>({ page: 0, year: null, query: '' })
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState<MemoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ entry: MemoryEntry | null } | null>(null)
  const [deleting, setDeleting] = useState<MemoryEntry | null>(null)
  const [removing, setRemoving] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const heading = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true
    void window.api.memories.list(request.page, request.year, request.query).then(result => {
      if (current) setPage(result)
    }).catch(cause => {
      if (current) setError(humanError(cause))
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [request])

  // 搜索防抖：停顿后再请求，且总是回到第一页。
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = searchDraft.trim()
      setRequest(current => current.query === query && current.page === 0
        ? current
        : { page: 0, year: current.year, query })
    }, 200)
    return () => clearTimeout(timer)
  }, [searchDraft])

  function load(target: number, year = page?.year ?? null) {
    setLoading(true)
    setError('')
    setRequest(current => ({ page: target, year, query: current.query }))
  }

  async function remove() {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await window.api.memories.remove(deleting.id)
      setDeleting(null)
      load(page?.page ?? 0)
      window.toast.success('已删除纪念记录')
    } catch (cause) {
      setDeleting(null)
      window.toast.error(humanError(cause))
    } finally {
      setRemoving(false)
    }
  }

  const add = () => setEditor({ entry: null })
  const addButton = <Button variant="primary" onClick={add}><Plus size={16} aria-hidden="true" />新增记录</Button>
  const archive = page?.years ?? []
  const searching = Boolean(page?.query)
  const total = archive.reduce((sum, item) => sum + item.count, 0)
  const years = new Map<string, MemoryEntry[]>()
  for (const entry of page?.items ?? []) {
    const year = entry.date.slice(0, 4)
    const group = years.get(year)
    if (group) group.push(entry)
    else years.set(year, [entry])
  }

  return <div className="page memories-page" aria-busy={loading}>
    <div className="memory-header" ref={heading}><PageHeader title="时间线" actions={addButton} /></div>
    {error && <Alert tone="danger" title="读取纪念记录失败" action={<Button className="sm" onClick={() => load(request.page, request.year)}>重试</Button>}>{error}</Alert>}
    {loading && !page && <div className="memory-loading" role="status" aria-label="正在读取纪念记录">
      <div className="skeleton" /><div className="skeleton" />
    </div>}
    {!loading && !error && page?.total === 0 && <EmptyState icon={CalendarHeart}
      title={searching ? '没有找到匹配的记录' : '还没有纪念记录'}
      description={searching ? '换个关键字试试，或清除搜索查看全部。' : '选一个想记住的日子，写下当时的事，也可以加几张照片。'}>{searching
      ? <Button variant="secondary" onClick={() => setSearchDraft('')}>清除搜索</Button>
      : addButton}</EmptyState>}

    {page && archive.length > 0 && <div className="memory-toolbar">
      <div className="memory-stats" role="status" aria-label="纪念记录统计">
        <span><strong>{page.total}</strong> 条记录</span>
        <span><strong>{page.photos}</strong> 张照片</span>
        <span><strong>{page.days}</strong> 个日子</span>
        <span><strong>{page.years.length}</strong> 个年份</span>
      </div>
      <SearchField className="memory-search" label="搜索纪念记录" placeholder="搜索正文…" value={searchDraft}
        maxLength={200} onValueChange={setSearchDraft} />
    </div>}

    {page && archive.length > 0 && <div className="memory-layout">
      <nav className="memory-archive" aria-label="按年份查看">
        <h2><CalendarDays size={16} aria-hidden="true" />年份索引</h2>
        <ul>
          <li><Button variant="ghost" aria-pressed={page.year === null} onClick={() => load(0, null)}>
            全部年份<span>{total}<span className="memory-count-unit"> 条</span></span>
          </Button></li>
          {archive.map(({ year, count }) => <li key={year}>
            <Button variant="ghost" aria-pressed={page.year === year} onClick={() => load(0, year)}>
              {year} 年<span>{count}<span className="memory-count-unit"> 条</span></span>
            </Button>
          </li>)}
        </ul>
      </nav>

      <div className="memory-entries">
        {[...years].map(([year, entries]) => <section className="memory-year" key={year} aria-label={`${year} 年`}>
          <h2>{year}<span>年</span></h2>
          <ol className="memory-timeline">
            {entries.map(entry => {
              const [, month, day] = entry.date.split('-')
              return <li key={entry.id} className="memory-entry">
                <div>
                  <time className="memory-date" dateTime={entry.time ? `${entry.date}T${entry.time}` : entry.date}>
                    <span>{Number(month)}月{Number(day)}日</span>
                    {entry.time && <span className="memory-time">{entry.time}</span>}
                  </time>
                  <div className="memory-entry-actions">
                    <Button variant="ghost" className="icon sm" title="编辑" aria-label="编辑纪念记录" onClick={() => setEditor({ entry })}><Pencil size={15} /></Button>
                    <Button variant="ghost" className="icon sm" title="删除" aria-label="删除纪念记录" onClick={() => setDeleting(entry)}><Trash2 size={15} /></Button>
                  </div>
                </div>
                <div className="memory-body">
                  <p>{entry.content}</p>
                  {entry.imageFiles.length > 0 && <div className="memory-photos">
                    {entry.imageFiles.map((name, index) => <button key={name} type="button" aria-label={`查看照片 ${index + 1}`} onClick={() => setPreview(name)}>
                      <img src={memoryImageUrl(name)} alt={`纪念照片 ${index + 1}`} loading="lazy" />
                    </button>)}
                  </div>}
                </div>
              </li>
            })}
          </ol>
        </section>)}

        {page.total > MEMORY_PAGE_SIZE && <Pager page={page.page} pages={Math.ceil(page.total / MEMORY_PAGE_SIZE)}
          disabled={loading} info={`共 ${page.total} 条记录`} onChange={target => {
            load(target)
            heading.current?.scrollIntoView({ block: 'start' })
          }} />}
      </div>
    </div>}

    {editor && <MemoryEditor entry={editor.entry} onClose={() => setEditor(null)} onSaved={saved => {
      setEditor(null)
      const year = page?.year ? saved.date.slice(0, 4) : null
      load(editor.entry && year === page?.year ? page.page : 0, year)
      window.toast.success('已保存纪念记录')
    }} />}
    <ConfirmDialog open={deleting !== null} title="删除这条纪念记录？" description="正文和附带的照片都会删除。" confirmLabel="删除记录"
      loading={removing} onClose={() => { if (!removing) setDeleting(null) }} onConfirm={() => void remove()} />
    <Dialog open={preview !== null} title="纪念照片" className="memory-photo-preview" onClose={() => setPreview(null)}>
      {preview && <img src={memoryImageUrl(preview)} alt="纪念照片大图" />}
    </Dialog>
  </div>
}
