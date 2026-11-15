import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, ExternalLink, FileText, Pause, Play, RefreshCw, Rss, Plus, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import type { Source, SourceEntry } from '@shared/sources'
import { SOURCE_ENTRY_PAGE_SIZE } from '@shared/sources'
import { defineModule } from '../../modules/defineModule'
import { ActionPopover } from '../../components/ui/ActionPopover'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/Pager'
import { SearchField } from '../../components/ui/SearchField'
import { formatDate, humanError, relativeTime } from '../../lib/utils'
import './sources.css'

function SourceArticleCard({ entry, sourceName, onRead, onOpen }: {
  entry: SourceEntry; sourceName: string; onRead(): void; onOpen(): void
}) {
  return (
    <li className="sources-entry" data-read={entry.read === 1 || undefined}>
      <button type="button" className="sources-entry-main" aria-label={`阅读 ${entry.title}`} onClick={onRead}>
        <span className="sources-entry-cover" aria-hidden="true">
          <FileText size={28} strokeWidth={1.4} />
          {entry.coverUrl && <img src={entry.coverUrl} alt="" loading="lazy" decoding="async"
            onError={event => { event.currentTarget.hidden = true }} />}
        </span>
        <span className="sources-entry-copy">
          <span className="sources-entry-title" title={entry.title}>{entry.title}</span>
          <span className="sources-entry-source" title={sourceName}>{sourceName}</span>
        </span>
      </button>
      <div className="sources-entry-footer">
        <span className="sources-entry-meta">
          {entry.publishedAt ? (
            <time dateTime={new Date(entry.publishedAt).toISOString()} title={formatDate(entry.publishedAt, 'yyyy-MM-dd HH:mm')}>
              {formatDate(entry.publishedAt, 'MM-dd')}
            </time>
          ) : '日期未知'}
        </span>
        <span className="sources-entry-dot" role="img" aria-label={entry.read === 1 ? '已读' : '未读'}
          title={entry.read === 1 ? '已读' : '未读'} />
        {entry.link && <Button type="button" variant="ghost" className="icon sources-entry-link"
          title="打开原文" aria-label={`打开原文：${entry.title}`} onClick={onOpen}>
          <ExternalLink size={14} aria-hidden="true" />
        </Button>}
      </div>
    </li>
  )
}

function SourceReader({ entry, sourceName, openOriginal }: { entry: SourceEntry; sourceName?: string; openOriginal(): void }) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const html = useMemo(() => body ? DOMPurify.sanitize(body, {
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    FORBID_TAGS: ['img', 'video', 'audio', 'source', 'style', 'iframe', 'object', 'embed', 'form']
  }) : '', [body])

  useEffect(() => {
    let active = true
    void window.api.sources.readEntry({ id: entry.id }).then(value => {
      if (active) setBody(value)
    }).catch(reason => {
      if (active) setError(humanError(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [entry.id])

  const loadArticle = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setBody(await window.api.sources.readEntry({ id: entry.id, download: true }))
    } catch (reason) {
      setError(humanError(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="sources-reader">
      <h2>{entry.title}</h2>
      <p className="sources-reader-meta">
        {[sourceName, entry.publishedAt ? formatDate(entry.publishedAt, 'yyyy-MM-dd HH:mm') : null].filter(Boolean).join(' · ')}
      </p>
      {entry.link && <div className="sources-reader-actions">
        {!html && <Button type="button" variant="primary" loading={loading} onClick={() => void loadArticle()}>
          {!loading && <FileText size={15} aria-hidden="true" />}加载正文
        </Button>}
        <Button type="button" variant="ghost" onClick={openOriginal}><ExternalLink size={15} aria-hidden="true" />用浏览器打开</Button>
      </div>}
      {error && <p className="sources-reader-error" role="alert">{error}</p>}
      {entry.coverUrl && <img className="sources-reader-cover" src={entry.coverUrl} alt=""
        onError={event => { event.currentTarget.hidden = true }} />}
      {html ? <div className="sources-reader-body sources-reader-article" dangerouslySetInnerHTML={{ __html: html }} />
        : entry.summary ? <div className="sources-reader-body">
          {entry.summary.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div> : !loading && <p className="sources-reader-meta">此订阅未提供摘要。</p>}
    </article>
  )
}

function SourcesPage() {
  const articleScroll = useRef<HTMLDivElement>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [entries, setEntries] = useState<SourceEntry[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [entriesRevision, setEntriesRevision] = useState(0)
  const [page, setPage] = useState(0)
  const [entryQuery, setEntryQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [activeEntry, setActiveEntry] = useState<SourceEntry | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [entriesError, setEntriesError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [savingSource, setSavingSource] = useState(false)
  const [deletingSource, setDeletingSource] = useState<Source | null>(null)
  const [removing, setRemoving] = useState(false)

  const loadSources = useCallback(async (): Promise<Source[]> => {
    const list = await window.api.sources.list()
    setSources(list)
    return list
  }, [])

  const loadSourceList = useCallback((): void => {
    setLoadState('loading')
    void loadSources().then(list => {
      setActiveId(current => list.some(source => source.id === current) ? current : list[0]?.id ?? null)
      setLoadState('ready')
    }).catch(reason => {
      setLoadState('failed')
      window.toast.error(humanError(reason))
    })
  }, [loadSources])

  useEffect(loadSourceList, [loadSourceList])

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(entryQuery.trim()); setPage(0) }, 300)
    return () => clearTimeout(timer)
  }, [entryQuery])

  useEffect(() => {
    articleScroll.current?.scrollTo(0, 0)
  }, [activeId, debouncedQuery, unreadOnly, page])

  useEffect(() => {
    if (!activeId) { setEntries([]); setEntriesTotal(0); return }
    let active = true
    setEntriesLoading(true)
    setEntriesError('')
    void window.api.sources.entries({ sourceId: activeId, q: debouncedQuery || undefined, unreadOnly, page })
      .then(result => {
        if (!active) return
        setEntries(result.items)
        setEntriesTotal(result.total)
        setActiveEntry(current => current && current.sourceId === activeId ? current : null)
      })
      .catch(reason => { if (active) setEntriesError(humanError(reason)) })
      .finally(() => { if (active) setEntriesLoading(false) })
    return () => { active = false }
  }, [activeId, debouncedQuery, entriesRevision, unreadOnly, page])

  const selectSource = (id: string): void => {
    setActiveId(id)
    setPage(0)
    setActiveEntry(null)
    setEntryQuery('')
    setDebouncedQuery('')
  }

  const openEntry = (entry: SourceEntry): void => {
    setActiveEntry(entry)
    if (entry.read === 0) {
      void window.api.sources.setRead({ id: entry.id, read: true }).then(loadSources)
        .catch(() => undefined)
      setEntries(current => current.map(item => item.id === entry.id ? { ...item, read: 1 } : item))
    }
  }

  const openOriginal = (id: string): void => {
    void window.api.sources.openEntry(id).catch(reason => window.toast.error(humanError(reason)))
  }

  const refresh = async (id: string | null): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const { results } = await window.api.sources.refresh(id)
      const failed = results.filter(result => !result.ok)
      if (results.length === 1) {
        const result = results[0]
        if (result.ok) window.toast.success(`已同步「${result.name}」，新增 ${result.added} 条`)
        else window.toast.error(`同步「${result.name}」失败：${result.error}`)
      } else if (failed.length) {
        window.toast.error(`${failed.length} 个订阅源同步失败，已在源列表显示原因`)
      } else {
        window.toast.success('全部订阅源已同步')
      }
      setPage(0)
      setEntriesRevision(value => value + 1)
      await loadSources()
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const addSource = async (): Promise<void> => {
    if (!newName.trim() || !newUrl.trim() || savingSource || refreshing) return
    setSavingSource(true)
    try {
      const url = new URL(newUrl.trim()).href
      const list = await window.api.sources.add({ name: newName.trim(), url })
      setSources(list)
      const created = list.find(item => item.url === url)
      setAddOpen(false)
      setNewName(''); setNewUrl('')
      if (created) {
        selectSource(created.id)
        setUnreadOnly(false)
        await refresh(created.id)
      }
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setSavingSource(false)
    }
  }

  const toggleEnabled = async (source: Source): Promise<void> => {
    try {
      setSources(await window.api.sources.update({ id: source.id, enabled: source.enabled !== 1 }))
    } catch (reason) {
      window.toast.error(humanError(reason))
    }
  }

  const remove = async (): Promise<void> => {
    if (!deletingSource || removing) return
    setRemoving(true)
    try {
      const list = await window.api.sources.remove(deletingSource.id)
      setSources(list)
      setActiveId(current => current === deletingSource.id ? list[0]?.id ?? null : current)
      setActiveEntry(null)
      setDeletingSource(null)
    } catch (reason) {
      window.toast.error(humanError(reason))
    } finally {
      setRemoving(false)
    }
  }

  const activeSource = sources.find(source => source.id === activeId) ?? null
  const pages = Math.max(1, Math.ceil(entriesTotal / SOURCE_ENTRY_PAGE_SIZE))
  const filtered = Boolean(debouncedQuery) || unreadOnly
  const clearFilters = (): void => {
    setUnreadOnly(false)
    setEntryQuery('')
    setDebouncedQuery('')
    setPage(0)
  }

  return (
    <div className="page sources-page">
      <PageHeader
        title="RSS 订阅"
        meta={loadState === 'ready' && sources.length > 0 ? <span className="sources-meta">共 {sources.length} 个订阅源</span> : undefined}
        actions={<>
          <Button variant="ghost" disabled={refreshing || !sources.length} onClick={() => void refresh(null)}><RefreshCw size={15} />全部同步</Button>
          <Button variant="primary" disabled={refreshing} onClick={() => setAddOpen(true)}><Plus size={15} />添加订阅</Button>
        </>}
      />
      <div className="sources-layout" aria-busy={loadState === 'loading'}>
        <nav className="sources-side workspace-sidebar" aria-label="订阅源列表">
          <h2 className="sources-side-heading">订阅源</h2>
          <div className="scroll-area sources-source-list" tabIndex={0} role="group" aria-label="订阅源">
            {sources.map(source => (
              <button type="button" key={source.id} className="sources-item workspace-sidebar-row"
                aria-current={source.id === activeId ? 'true' : undefined}
                onClick={() => selectSource(source.id)}>
                <Rss size={15} aria-hidden="true" />
                <span className="sources-item-name" title={source.name}>{source.name}</span>
                {source.lastError && <span className="sources-item-error" title={source.lastError} aria-label="同步失败">
                  <CircleAlert size={14} aria-hidden="true" />
                </span>}
                {source.unread > 0 && <span className="sources-unread" aria-label={`${source.unread} 条未读`}>{source.unread}</span>}
              </button>
            ))}
          </div>
        </nav>

        <section className="sources-main" aria-label="订阅文章" aria-busy={entriesLoading}>
          <header className="sources-feed-head">
            <div className="sources-feed-heading">
              <h2>{activeSource?.name ?? '文章'}</h2>
              {activeSource && <span>
                {activeSource.enabled !== 1 ? '已暂停'
                  : activeSource.lastError ? '同步失败'
                  : activeSource.lastFetchAt ? `${relativeTime(activeSource.lastFetchAt)}同步` : '尚未同步'}
              </span>}
            </div>
            {activeSource && <div className="sources-feed-actions">
              <Button type="button" variant="ghost" loading={refreshing} disabled={activeSource.enabled !== 1}
                onClick={() => void refresh(activeSource.id)}>
                {!refreshing && <RefreshCw size={15} aria-hidden="true" />}同步
              </Button>
              <ActionPopover label="订阅操作" disabled={refreshing || removing} actions={[
                {
                  label: activeSource.enabled === 1 ? '暂停订阅' : '启用订阅',
                  icon: activeSource.enabled === 1 ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />,
                  onSelect: () => void toggleEnabled(activeSource)
                },
                { label: '删除订阅', icon: <Trash2 size={15} aria-hidden="true" />, onSelect: () => setDeletingSource(activeSource), danger: true }
              ]} />
            </div>}
            {activeSource && <div className="sources-toolbar">
              <div className="segmented" role="group" aria-label="文章状态">
                <button type="button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(0) }}>
                  {activeSource.unread > 0 ? `未读 ${activeSource.unread}` : '未读'}
                </button>
                <button type="button" aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(0) }}>全部文章</button>
              </div>
              <SearchField label="搜索当前订阅的文章" value={entryQuery} onValueChange={setEntryQuery} maxLength={200} placeholder="搜索标题或摘要" />
            </div>}
          </header>

          <div ref={articleScroll} className="scroll-area sources-feed-scroll" tabIndex={0} role="region" aria-label="文章内容列表">
            {activeSource?.lastError && <p className="sources-error" role="status">
              <CircleAlert size={16} aria-hidden="true" />上次同步失败：{activeSource.lastError}
            </p>}

            {loadState === 'loading' || entriesLoading ? (
              <p className="sources-status" role="status">正在读取文章…</p>
            ) : loadState === 'failed' || entriesError ? (
              <div className="sources-empty">
                <EmptyState compact icon={CircleAlert} title="读取失败" description={entriesError || '无法读取订阅源。'}>
                  <Button type="button" onClick={() => loadState === 'failed' ? loadSourceList() : setEntriesRevision(value => value + 1)}>重试</Button>
                </EmptyState>
              </div>
            ) : entries.length ? (
              <ul className="sources-entries" aria-label="文章列表">
                {entries.map(entry => <SourceArticleCard key={entry.id} entry={entry} sourceName={activeSource?.name ?? ''}
                  onRead={() => openEntry(entry)} onOpen={() => openOriginal(entry.id)} />)}
              </ul>
            ) : refreshing ? (
              <p className="sources-status" role="status">正在同步订阅…</p>
            ) : (
              <div className="sources-empty">
                <EmptyState compact icon={activeSource ? FileText : Rss}
                  title={filtered ? '没有匹配的文章' : activeSource ? '还没有文章' : '还没有订阅源'}
                  description={filtered ? '试试其他关键词，或切换到全部文章。'
                    : activeSource?.enabled === 1 ? '同步后，文章会显示在这里。'
                    : activeSource ? '启用后可继续同步。' : '添加 RSS 或 Atom 地址，开始接收文章。'}>
                  {filtered ? <Button type="button" onClick={clearFilters}>清除筛选</Button>
                    : activeSource?.enabled === 1 ? <Button type="button" variant="primary" onClick={() => void refresh(activeSource.id)}>同步订阅</Button>
                    : activeSource ? <Button type="button" onClick={() => void toggleEnabled(activeSource)}>启用订阅</Button>
                    : <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>添加订阅</Button>}
                </EmptyState>
              </div>
            )}
            {!entriesLoading && !entriesError && entriesTotal > SOURCE_ENTRY_PAGE_SIZE && (
              <Pager page={page} pages={pages} info={`共 ${entriesTotal} 篇 · 每页 ${SOURCE_ENTRY_PAGE_SIZE} 篇`} onChange={setPage} />
            )}
          </div>
        </section>
      </div>

      <Dialog open={activeEntry !== null} title="阅读文章" className="sources-reader-dialog" closeOnBackdrop
        onClose={() => setActiveEntry(null)}>
        {activeEntry && <SourceReader key={activeEntry.id} entry={activeEntry} sourceName={activeSource?.name}
          openOriginal={() => openOriginal(activeEntry.id)} />}
      </Dialog>

      <Dialog open={addOpen} title="添加订阅" onClose={() => { if (!savingSource) { setAddOpen(false); setNewName(''); setNewUrl('') } }}>
        <form className="form-stack" onSubmit={event => { event.preventDefault(); void addSource() }}>
          <label className="field">
            名称
            <input className="input" data-dialog-autofocus required maxLength={60} placeholder="例如：阮一峰的网络日志"
              value={newName} onChange={event => setNewName(event.target.value)} />
          </label>
          <label className="field">
            订阅地址（RSS / Atom）
            <input className="input" required type="url" maxLength={2000} placeholder="https://example.com/feed.xml"
              value={newUrl} onChange={event => setNewUrl(event.target.value.replace(/\\([:/.])/g, '$1'))} />
          </label>
          <p className="input-hint">仅支持 HTTP / HTTPS 地址，不带登录凭据。WorkBase 启动后与每小时各同步一次启用的订阅。</p>
          <div className="actions">
            <Button type="button" variant="ghost" disabled={savingSource} onClick={() => { setAddOpen(false); setNewName(''); setNewUrl('') }}>取消</Button>
            <Button type="submit" variant="primary" loading={savingSource} disabled={refreshing || !newName.trim() || !newUrl.trim()}>添加并同步</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deletingSource !== null}
        title="删除订阅？"
        confirmLabel="删除订阅"
        description={`「${deletingSource?.name ?? ''}」及其缓存的全部条目将一并删除。`}
        loading={removing}
        onClose={() => { if (!removing) setDeletingSource(null) }}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

export default defineModule({
  id: 'sources',
  name: 'RSS 订阅',
  group: '外部数据',
  icon: Rss,
  order: 55,
  keywords: ['rss', '订阅', '阅读器', 'feed', 'atom'],
  page: SourcesPage
})
