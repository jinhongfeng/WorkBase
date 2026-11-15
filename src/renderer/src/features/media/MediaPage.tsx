import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowLeft, Check, FolderInput, FolderOpen, FolderPlus, ImageOff, Images, Link, ListChecks, Pencil, Play, Trash2, Upload } from 'lucide-react'
import type { MediaGroup, MediaImportResult, MediaItem, MediaQuery } from '@shared/types'
import { ActionPopover } from '../../components/ui/ActionPopover'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/Pager'
import { SearchField } from '../../components/ui/SearchField'
import { Select } from '../../components/ui/Select'
import { humanError } from '../../lib/utils'
import { MediaGroupCard, MediaGroupEditor } from './MediaGroups'
import { MediaPreview } from './MediaPreview'
import './media.css'

const PAGE_SIZE = 60
const FILTERS = [{ id: 'all', label: '全部' }, { id: 'image', label: '图片' }, { id: 'video', label: '视频' }] as const

function fileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

function MediaThumb({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false)
  if (item.type === 'video') return <div className="media-thumb media-thumb-video"><Play size={32} strokeWidth={1.5} aria-hidden="true" /></div>
  return <div className="media-thumb">{failed ? <div className="media-thumb-error"><ImageOff size={28} /><span>图片无法加载</span></div>
    : <img src={item.url} alt="" loading="lazy" onError={() => setFailed(true)} />}</div>
}

export function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [groups, setGroups] = useState<MediaGroup[]>([])
  const [groupError, setGroupError] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<MediaGroup | null>()
  const [deletingGroup, setDeletingGroup] = useState<MediaGroup | null>(null)
  const [moving, setMoving] = useState<MediaItem[] | null>(null)
  const [destination, setDestination] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<MediaQuery['type']>('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [preview, setPreview] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<MediaItem[] | null>(null)
  const [removing, setRemoving] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const generation = useRef(0)
  const dragDepth = useRef(0)
  const activeGroup = groups.find(group => group.id === groupId)
  const importGroupId = groupId ?? undefined
  const home = groupId === null
  const globalSearch = home && Boolean(q)
  const groupNames = new Map(groups.map(group => [group.id, group.name]))
  const selectedItems = items.filter(item => selectedIds.includes(item.id))
  const allSelected = items.length > 0 && selectedItems.length === items.length

  useEffect(() => {
    const next = search.trim()
    if (next === q) return
    const timer = setTimeout(() => { setQ(next); setPage(0); setSelectedIds([]) }, 180)
    return () => clearTimeout(timer)
  }, [search, q])

  useEffect(() => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    setPreview(null)
    void window.api.media.list({ type: filter, q, page, pageSize: PAGE_SIZE, groupId: globalSearch ? undefined : groupId }).then(result => {
      if (request !== generation.current) return
      const lastPage = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      setItems(result.items)
      setTotal(result.total)
    }).catch(reason => {
      if (request !== generation.current) return
      const message = humanError(reason)
      setError(message)
      window.toast.error(message)
    }).finally(() => { if (request === generation.current) setLoading(false) })
    return () => { generation.current++ }
  }, [filter, q, page, revision, groupId, globalSearch])

  useEffect(() => {
    let active = true
    void window.api.media.listGroups().then(result => {
      if (!active) return
      setGroups(result)
      setGroupError('')
    }).catch(reason => { if (active) setGroupError(humanError(reason)) })
    return () => { active = false }
  }, [revision])

  const showGroup = (id: string | null): void => {
    setGroupId(id)
    setPage(0)
    setPreview(null)
    setSelecting(false)
    setSelectedIds([])
  }
  const refresh = (): void => { setPage(0); setSelectedIds([]); setRevision(value => value + 1) }
  /** 导入结果的统一反馈：重复素材已在库中，只提示位置，不再重复入库。 */
  const reportImport = (result: MediaImportResult): void => {
    const added = result.items.length
    const skipped = result.duplicates.length
    if (added) refresh()
    if (added) {
      window.toast.success(`已添加 ${added} 个媒体${skipped ? `，跳过 ${skipped} 个重复素材` : ''}`)
      return
    }
    if (!skipped) { window.toast.error('没有可添加的媒体，仅支持图片或视频。'); return }
    const first = result.duplicates[0]
    const where = first.groupName ? `「${first.groupName}」` : '未分组'
    window.toast.error(skipped > 1
      ? `${skipped} 个素材已在媒体库中，未重复添加（「${first.name || '未命名媒体'}」等位于${where}）`
      : `「${first.name || '未命名媒体'}」已在媒体库中，位于${where}，未重复添加`)
  }
  const changePage = (next: number): void => { setPage(next); setSelectedIds([]) }
  const toggleSelection = (id: string): void => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const openMove = (targets: MediaItem[]): void => {
    const source = targets[0]?.groupId ?? null
    setMoving(targets)
    setDestination(targets.every(item => item.groupId === source) ? source ?? '' : null)
  }
  const groupSaved = (group: MediaGroup): void => {
    setGroups(current => [...current.filter(item => item.id !== group.id), group])
    setEditingGroup(undefined)
    showGroup(group.id)
    refresh()
    window.toast.success(editingGroup ? '已保存分组' : '已创建分组')
  }
  const removeGroup = async (): Promise<void> => {
    if (!deletingGroup) return
    setRemoving(true)
    try {
      await window.api.media.removeGroup(deletingGroup.id)
      setGroups(current => current.filter(group => group.id !== deletingGroup.id))
      setDeletingGroup(null)
      showGroup(null)
      refresh()
      window.toast.success('已删除分组，组内素材已归入未分组')
    } catch (reason) { window.toast.error(humanError(reason)) }
    finally { setRemoving(false) }
  }
  const applyMediaAction = async (targets: MediaItem[], action: '移动' | '删除', run: (id: string) => Promise<void>): Promise<void> => {
    const results = await Promise.allSettled(targets.map(async item => run(item.id)))
    const succeeded = new Set(targets.filter((_, index) => results[index].status === 'fulfilled').map(item => item.id))
    const failure = results.find(result => result.status === 'rejected')
    setSelectedIds(current => current.filter(id => !succeeded.has(id)))
    setRevision(value => value + 1)
    if (failure) window.toast.error(`已${action} ${succeeded.size} 个，${targets.length - succeeded.size} 个失败。${humanError(failure.reason)}`)
    else window.toast.success(`已${action} ${succeeded.size} 个媒体`)
  }
  const destinationGroup = destination || null
  const moveTargets = destination === null ? [] : moving?.filter(item => item.groupId !== destinationGroup) ?? []
  const moveToGroup = async (): Promise<void> => {
    if (!moving || busy || !moveTargets.length) return
    setBusy(true)
    try {
      const alreadyThere = new Set(moving.filter(item => item.groupId === destinationGroup).map(item => item.id))
      setSelectedIds(current => current.filter(id => !alreadyThere.has(id)))
      await applyMediaAction(moveTargets, '移动', id => window.api.media.moveToGroup(id, destinationGroup))
      setMoving(null)
    } finally { setBusy(false) }
  }
  const addLocal = async (): Promise<void> => {
    setBusy(true)
    try { reportImport(await window.api.media.saveLocalFiles(importGroupId)) }
    catch (reason) { window.toast.error(humanError(reason)) }
    finally { setBusy(false) }
  }
  const addUrl = async (): Promise<void> => {
    setBusy(true)
    setUrlError('')
    try {
      const result = await window.api.media.saveFromUrl({ url: url.trim(), groupId: importGroupId })
      if (!result.items.length) {
        // 重复链接不重复保存，直接把已存在的位置留在对话框里，避免用户以为保存失败。
        const first = result.duplicates[0]
        const where = first?.groupName ? `「${first.groupName}」` : '未分组'
        const message = `这个链接的内容已在媒体库中（${where}），未重复保存。`
        setUrlError(message)
        window.toast.error(message)
        return
      }
      setUrlOpen(false)
      setUrl('')
      reportImport(result)
    } catch (reason) { const message = humanError(reason); setUrlError(message); window.toast.error(message) }
    finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await applyMediaAction(deleting, '删除', id => window.api.media.remove(id))
      setDeleting(null)
    } finally { setRemoving(false) }
  }
  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
    event.preventDefault()
    if (busy || removing || editingGroup !== undefined || moving || urlOpen || preview !== null || deletingGroup || deleting) return
    dragDepth.current += 1
    setDragging(true)
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }
  const handleDragEnd = (): void => { dragDepth.current = 0; setDragging(false) }
  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const handleDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    handleDragEnd()
    if (busy || removing || editingGroup !== undefined || moving || urlOpen || preview !== null || deletingGroup || deleting) return
    // 拖入网页链接（非文件）时，尝试按 URL 保存。
    const files = Array.from(event.dataTransfer?.files ?? [])
    const uriList = (event.dataTransfer?.getData('text/uri-list') ?? '').split(/\r?\n/).map(line => line.trim()).find(line => /^https?:\/\//i.test(line))
    const droppedUrl = files.length === 0 ? (uriList ?? event.dataTransfer?.getData('text/plain').trim() ?? '') : ''
    if (!files.length && !/^https?:\/\//i.test(droppedUrl)) {
      window.toast.error('拖入的内容无法识别，请拖入本地图片/视频文件或图片链接。')
      return
    }
    setBusy(true)
    try {
      const paths: string[] = []
      const buffers: { name: string; data: ArrayBuffer }[] = []
      for (const file of files) {
        const path = window.api.app.getFilePath(file)
        if (path) paths.push(path)
        else buffers.push({ name: file.name || '未命名媒体', data: await file.arrayBuffer() })
      }
      const merged: MediaImportResult = { items: [], duplicates: [] }
      const merge = (result: MediaImportResult): void => {
        merged.items.push(...result.items)
        merged.duplicates.push(...result.duplicates)
      }
      if (paths.length) merge(await window.api.media.saveLocalPaths(paths, importGroupId))
      if (buffers.length) merge(await window.api.media.saveBuffers(buffers, importGroupId))
      if (droppedUrl) merge(await window.api.media.saveFromUrl({ url: droppedUrl, groupId: importGroupId }))
      reportImport(merged)
    } catch (reason) { window.toast.error(humanError(reason)); setRevision(value => value + 1) }
    finally { setBusy(false) }
  }
  const filtered = !!q || filter !== 'all'
  const hasGroups = home && !globalSearch && !selecting && groups.length > 0
  const showEmpty = !loading && !error && items.length === 0 && (filtered || !hasGroups)
  const emptyTitle = selecting ? '没有可管理的素材' : home ? '还没有素材' : '分组里还没有素材'
  const mutating = busy || removing
  const movingItem = moving?.[0]
  const movingName = movingItem?.name || movingItem?.originalName || '未命名媒体'
  const deleteCount = deleting?.length ?? 0

  return <div className="page media-page" onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDragEnd={handleDragEnd} onDrop={event => void handleDrop(event)}>
    {!home && <Button type="button" className="media-back" disabled={mutating} onClick={() => showGroup(null)}>
      <ArrowLeft size={16} aria-hidden="true" />返回媒体库
    </Button>}
    <PageHeader
      title={activeGroup?.name ?? '媒体库'}
      actions={<>
        {home
          ? <Button type="button" disabled={mutating} onClick={() => setEditingGroup(null)}><FolderPlus size={16} aria-hidden="true" />新建分组</Button>
          : activeGroup && <ActionPopover label="分组操作" variant="secondary" disabled={mutating} actions={[
            { label: '编辑分组', icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => setEditingGroup(activeGroup) },
            { label: '删除分组', icon: <Trash2 size={16} aria-hidden="true" />, onSelect: () => setDeletingGroup(activeGroup), danger: true }
          ]} />}
        {(selecting || (items.length > 0 && !error)) && (
          <Button type="button" variant={selecting ? 'ghost' : 'secondary'} disabled={mutating || (!selecting && loading)} onClick={() => { setSelecting(!selecting); setSelectedIds([]) }}>
            {selecting ? '完成' : <><ListChecks size={16} aria-hidden="true" />批量管理</>}
          </Button>
        )}
        <ActionPopover label="添加素材" variant="primary" disabled={mutating} actions={[
          { label: '添加本地文件', icon: <Upload size={16} aria-hidden="true" />, onSelect: () => void addLocal() },
          { label: '从链接添加', icon: <Link size={16} aria-hidden="true" />, onSelect: () => { setUrlError(''); setUrlOpen(true) } }
        ]} />
      </>}
    />
    {activeGroup?.description && <p className="media-active-group-description">{activeGroup.description}</p>}
    <div className={`toolbar media-toolbar${selecting ? ' is-selecting' : ''}`}>
      {selecting ? (
        <div className="media-selection-actions" role="group" aria-label="素材管理">
          <span role="status">已选 {selectedItems.length} 个</span>
          <Button type="button" variant="ghost" disabled={loading || mutating || !!error || items.length === 0}
            onClick={() => setSelectedIds(allSelected ? [] : items.map(item => item.id))}>{allSelected ? '取消全选' : '全选本页'}</Button>
          {selectedItems.length > 0 && <>
            <Button type="button" disabled={loading || mutating || !!error || (home && !groups.length)}
              title={home && !groups.length ? '请先新建分组' : undefined} onClick={() => openMove(selectedItems)}>移动到分组</Button>
            <Button type="button" variant="danger" disabled={loading || mutating || !!error}
              onClick={() => setDeleting(selectedItems)}>删除</Button>
          </>}
          {/* 退出批量模式由页头的「完成」按钮承担，工具栏不再重复放一个 */}
        </div>
      ) : (
        <div className="media-filters">
          <div className="segmented" role="group" aria-label="媒体类型">{FILTERS.map(option => <button key={option.id} aria-pressed={filter === option.id} disabled={mutating} onClick={() => { setFilter(option.id); changePage(0) }}>{option.label}</button>)}</div>
          <SearchField className="toolbar-search" label={home ? '搜索整个媒体库' : '搜索当前分组'} placeholder={home ? '搜索整个媒体库…' : '搜索当前分组…'}
            value={search} maxLength={100} disabled={mutating} onValueChange={setSearch} />
        </div>
      )}
    </div>
    {home && groupError && <div className="media-actions media-group-error" role="alert">{groupError}<Button onClick={refresh}>重新加载分组</Button></div>}
    <section className="media-content" aria-label={globalSearch ? '整个媒体库的搜索结果' : home ? '分组和素材' : '组内素材'} aria-busy={loading}>
      {(hasGroups || loading || (!error && items.length > 0)) && <div className="media-grid">
        {hasGroups && groups.map(group => <MediaGroupCard key={group.id} group={group} disabled={mutating} onOpen={showGroup} />)}
        {loading ? <>
          <span className="sr-only" role="status">正在读取媒体</span>
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton" style={{ height: 220 }} aria-hidden="true" />)}
        </> : !error && items.map((item, index) => {
          const name = item.name || item.originalName || '未命名媒体'
          const location = item.groupId ? groupNames.get(item.groupId) ?? '分组名称暂不可用' : '未分组'
          return <article className="media-card" key={item.id}>
            <button type="button" className="media-card-open" role={selecting ? 'checkbox' : undefined}
              aria-checked={selecting ? selectedIds.includes(item.id) : undefined}
              aria-label={`${selecting ? '选择' : '预览'} ${name}`} aria-describedby={globalSearch ? `media-location-${item.id}` : undefined}
              disabled={selecting && mutating}
              onClick={() => { if (selecting) toggleSelection(item.id); else setPreview(index) }}>
              {selecting && <span className="media-card-check" aria-hidden="true"><Check size={16} /></span>}
              <MediaThumb item={item} />
              <div className="media-card-info">
                <h2 title={name}>{name}</h2>
                <p><span>{item.type === 'image' ? '图片' : '视频'} · {fileSize(item.size)}</span><span>{item.source === 'local' ? '本地文件' : 'URL 保存'}</span></p>
                {globalSearch && <p className="media-card-location" id={`media-location-${item.id}`} title={location}>
                  {item.groupId && '分组 · '}{location}
                </p>}
              </div>
            </button>
            {!selecting && <div className="media-card-actions"><Button variant="ghost" className="icon" aria-label={`打开所在位置：${name}`} title="打开所在位置" onClick={() => void window.api.media.reveal(item.id).catch(reason => window.toast.error(humanError(reason)))}><FolderOpen size={16} /></Button>
              <Button variant="ghost" className="icon" disabled={mutating || (home && !item.groupId && groups.length === 0)} aria-label={`移动分组：${name}`} title="移动分组"
                onClick={() => openMove([item])}><FolderInput size={16} /></Button>
              <Button variant="ghost" className="icon media-delete" disabled={mutating} aria-label={`删除：${name}`} title="删除" onClick={() => setDeleting([item])}><Trash2 size={16} /></Button></div>}
          </article>
        })}
      </div>}
      {!loading && error && <div className="empty-state-region" role="alert"><EmptyState compact title="媒体库读取失败" description={error}><Button onClick={refresh}>重新加载</Button></EmptyState></div>}
      {showEmpty && <div className="library-empty">
        <EmptyState compact icon={Images} title={filtered ? '没有匹配的素材' : emptyTitle}
          description={filtered ? '试试其他名称，或切换媒体类型。' : undefined}>
          {filtered && <Button onClick={() => { setSearch(''); setQ(''); setFilter('all'); changePage(0) }}>清除筛选</Button>}
        </EmptyState>
        {!filtered && !selecting && <button type="button" className="dropzone" disabled={mutating} onClick={() => void addLocal()}>
          <strong>拖入图片或视频，或点击选择文件</strong>
        </button>}
      </div>}
      {!loading && !error && total > PAGE_SIZE && <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} onChange={changePage} info={`共 ${total} 个媒体 · 每页 ${PAGE_SIZE} 个`} disabled={mutating} />}
    </section>
    {editingGroup !== undefined && <MediaGroupEditor group={editingGroup} onClose={() => setEditingGroup(undefined)} onSave={groupSaved} />}
    <ConfirmDialog open={deletingGroup !== null} title="删除这个分组？" confirmLabel="删除分组"
      description={`「${deletingGroup?.name ?? ''}」内的媒体会移到「未分组」，本地文件会保留。`}
      loading={removing} onClose={() => { if (!removing) setDeletingGroup(null) }} onConfirm={() => void removeGroup()} />
    <Dialog open={moving !== null} title="移动到分组" onClose={() => { if (!busy) setMoving(null) }}>
      <form className="media-form" onSubmit={event => { event.preventDefault(); void moveToGroup() }}>
        <label htmlFor="media-destination">{moving && moving.length > 1 ? `为 ${moving.length} 个媒体选择分组` : `为「${movingName}」选择分组`}</label>
        <Select id="media-destination" value={destination ?? 'choose'} disabled={busy} data-dialog-autofocus onChange={event => setDestination(event.target.value)}>
          {destination === null && <option value="choose" disabled>选择目标分组</option>}
          <option value="">未分组</option>
          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </Select>
        <div className="media-actions">
          <Button type="button" disabled={busy} onClick={() => setMoving(null)}>取消</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!moveTargets.length}>移动媒体</Button>
        </div>
      </form>
    </Dialog>
    <Dialog open={urlOpen} title="添加媒体 URL" onClose={() => { if (!busy) setUrlOpen(false) }}>
      <form className="media-form" onSubmit={event => { event.preventDefault(); void addUrl() }}>
        <label htmlFor="media-url">图片或视频直链</label><input id="media-url" className="input" type="url" required minLength={8} maxLength={2048} data-dialog-autofocus placeholder="https://example.com/image.png" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} />
        <p>自动识别类型并下载到本地。图片最多 12MB，链接视频最多 30MB。</p>
        {urlError && <p className="media-form-error" role="alert">{urlError}</p>}
        <div className="media-actions"><Button type="button" disabled={busy} onClick={() => setUrlOpen(false)}>取消</Button><Button type="submit" variant="primary" loading={busy} disabled={!url.trim()}>{busy ? '正在下载' : '下载并保存'}</Button></div>
      </form>
    </Dialog>
    <ConfirmDialog open={deleting !== null} title={deleteCount > 1 ? `删除这 ${deleteCount} 个媒体？` : '删除这个媒体？'} confirmLabel="删除媒体"
      description={`将同时删除本地文件、不可恢复。${deleteCount === 1 && deleting?.[0].name ? `「${deleting[0].name}」将从媒体库移除。` : ''}`}
      loading={removing} onClose={() => { if (!removing) setDeleting(null) }} onConfirm={() => void remove()} />
    {preview !== null && items[preview] && <MediaPreview items={items} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />}
    {dragging && <div className="media-drag-overlay" role="status"><Upload size={40} /><span>{activeGroup ? `松开以添加到「${activeGroup.name}」` : '松开以添加图片或视频'}</span></div>}
  </div>
}
