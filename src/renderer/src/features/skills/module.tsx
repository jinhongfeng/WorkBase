import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Layers, Plus, Upload } from 'lucide-react'
import type { SkillDetail, SkillSummary } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { LibraryFolderList } from '../../components/ui/LibraryFolderList'
import { COLLAPSED_LIST_WIDTH, ListSidebar, useListSidebar } from '../../components/ui/ListSidebar'
import { PageHeader } from '../../components/ui/PageHeader'
import { PanelResizeHandle, usePanelLayoutWidth, usePanelWidth } from '../../components/ui/PanelResizeHandle'
import { SearchField } from '../../components/ui/SearchField'
import { clamp, humanError, relativeTime } from '../../lib/utils'
import { SkillDetailPanel } from './SkillDetail'
import { ImportDialog, importDroppedSkill } from './ImportDialog'
import { SkillThumb } from './SkillCover'
import { SOURCE_LABEL } from './skillMeta'
import './skills.css'

type SourceFilter = 'all' | 'imported' | 'manual'

const DEFAULT_LIST_WIDTH = 288
const MIN_LIST_WIDTH = 240
const MAX_LIST_WIDTH = 520
const MIN_DETAIL_WIDTH = 520

const FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'imported', label: '已导入' },
  { id: 'manual', label: '自建' }
]

function SkillsPage() {
  const [layout, availableWidth] = usePanelLayoutWidth()
  const { collapsed, toggle } = useListSidebar('ui.skills.listCollapsed')
  const listSize = usePanelWidth('ui.skills.listWidth', MIN_LIST_WIDTH, MAX_LIST_WIDTH)
  const maxListWidth = clamp(availableWidth - MIN_DETAIL_WIDTH, MIN_LIST_WIDTH, MAX_LIST_WIDTH)
  const listWidth = Math.min(listSize.preview ?? listSize.preferred ?? DEFAULT_LIST_WIDTH, maxListWidth)
  const [items, setItems] = useState<SkillSummary[]>([])
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dirtyRef = useRef(false)

  const canLeaveEdit = (): boolean => {
    if (!dirtyRef.current) return true
    window.toast.error('请先保存或取消当前编辑。')
    return false
  }

  const showImport = (): void => {
    if (canLeaveEdit()) setImportOpen(true)
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 180)
    return () => clearTimeout(timer)
  }, [query])

  const refresh = useCallback(async (): Promise<SkillSummary[]> => {
    try {
      const rows = await window.api.skills.list({ q: debounced || undefined })
      setItems(rows)
      return rows
    } catch (error) {
      window.toast.error(humanError(error))
      return []
    }
  }, [debounced])

  useEffect(() => { void refresh() }, [refresh])

  const open = useCallback(async (id: string): Promise<void> => {
    try {
      const loaded = await window.api.skills.get(id)
      dirtyRef.current = false
      if (!loaded) {
        setActiveId(null)
        setDetail(null)
        return
      }
      setActiveId(loaded.id)
      setDetail(loaded)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }, [])

  useEffect(() => {
    if (activeId && detail) return
    if (items.length === 0) {
      setActiveId(null)
      setDetail(null)
      return
    }
    void open(items[0].id)
  }, [activeId, detail, items, open])

  const visible = useMemo(() => items.filter(item => {
    if (filter === 'manual') return item.source === 'manual' || item.source === 'duplicate'
    if (filter === 'imported') return item.source !== 'manual' && item.source !== 'duplicate'
    return true
  }), [filter, items])

  const select = (id: string): void => {
    if (id === activeId) return
    if (dirtyRef.current) { setPendingSelect(id); return }
    void open(id)
  }

  const createBlank = async (): Promise<void> => {
    if (!canLeaveEdit()) return
    try {
      const created = await window.api.skills.create()
      await refresh()
      setImportOpen(false)
      setActiveId(created.id)
      setDetail(created)
      window.toast.success('已新建 skill，可以直接开始编辑')
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const duplicate = async (): Promise<void> => {
    const current = detail
    if (!current || !canLeaveEdit()) return
    try {
      const copy = await window.api.skills.create({ fromId: current.id })
      await refresh()
      dirtyRef.current = false
      setActiveId(copy.id)
      setDetail(copy)
      window.toast.success(`已复制为「${copy.name}」`)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const togglePin = async (): Promise<void> => {
    const current = detail
    if (!current) return
    try {
      await window.api.skills.togglePin(current.id)
      await refresh()
      setDetail(await window.api.skills.get(current.id))
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const reveal = async (): Promise<void> => {
    const current = detail
    if (!current) return
    try {
      await window.api.skills.reveal(current.id)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const remove = async (): Promise<void> => {
    const current = detail
    if (!current) return
    setRemoving(true)
    try {
      await window.api.skills.remove(current.id)
      dirtyRef.current = false
      setConfirmRemove(false)
      setActiveId(null)
      setDetail(null)
      await refresh()
      window.toast.success('已从列表移除，包文件仍保留在数据目录')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setRemoving(false)
    }
  }

  const onSaved = (saved: SkillDetail): void => {
    setDetail(current => current?.id === saved.id ? saved : current)
    void refresh()
  }

  const onImported = (skill: SkillSummary): void => {
    void refresh().then(() => open(skill.id))
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragOver(false)
    if (importOpen || !canLeaveEdit()) return
    const dropped = event.dataTransfer.files[0]
    if (!dropped) return
    try {
      const result = await importDroppedSkill(dropped)
      if (!result.skill) return
      await refresh()
      dirtyRef.current = false
      setActiveId(result.skill.id)
      setDetail(await window.api.skills.get(result.skill.id))
      window.toast.success(`已导入「${result.skill.name}」`)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  return (
    <div
      className="skills-app"
      ref={layout}
      style={{ gridTemplateColumns: `${collapsed ? COLLAPSED_LIST_WIDTH : listWidth}px ${collapsed ? '' : '0 '}minmax(0, 1fr)` }}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        if (!importOpen) setDragOver(true)
      }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragOver(false) }}
      onDrop={event => { void onDrop(event) }}
    >
      <ListSidebar id="skills-list-panel" className="skills-side" label="Skill 列表" collapsed={collapsed}
        onToggle={() => { listSize.setPreview(null); toggle() }}>
        <div className="skills-side-head">
          <PageHeader
            size="panel"
            title="Skill 库"
            meta={<span className="badge">{items.length} 项</span>}
            actions={
              <div className="skills-actions">
                <button className="button primary sm" onClick={showImport}><Upload size={12} />导入</button>
                <button className="button secondary sm" onClick={() => void createBlank()}><Plus size={12} />新建</button>
              </div>
            }
          />
          <SearchField label="搜索 Skill" placeholder="搜索名称、描述或正文…" value={query} onValueChange={setQuery} />
          <div className="segmented" role="group" aria-label="按来源筛选">
            {FILTERS.map(item => (
              <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>

        <LibraryFolderList library="skills" items={visible} className="skills-list" edgeBlur
          query={debounced} filtering={Boolean(debounced) || filter !== 'all'} onChanged={() => { void refresh() }}
          renderItem={item => (
            <button
              className="skill-card workspace-sidebar-row"
              aria-current={item.id === activeId}
              onClick={() => select(item.id)}
            >
              <SkillThumb skill={item} />
              <div className="skill-card-body">
                <div className="skill-card-top">
                  <h3 title={item.name}>{item.name}</h3>
                  {item.pinned ? <span className="skill-pin" aria-label="已置顶">★</span> : null}
                </div>
                {item.description && <p>{item.description}</p>}
                <div className="skill-card-foot">
                  <span>{SOURCE_LABEL[item.source]}</span>
                  {item.layout === 'file' && <span>单文件</span>}
                  {item.coverKind === 'video' && <span>视频</span>}
                  <span className="skill-card-time">{relativeTime(item.updatedAt)}</span>
                </div>
              </div>
            </button>
          )}>
          {visible.length === 0 && (query.trim() || items.length > 0) && (
            <p className="skills-empty-hint">
              没有匹配的 Skill。试试更换关键词或筛选条件。
            </p>
          )}
        </LibraryFolderList>
      </ListSidebar>

      {!collapsed && <PanelResizeHandle side="left" controls="skills-list-panel" label="调整 Skill 列表宽度"
        width={listWidth} min={MIN_LIST_WIDTH} max={maxListWidth}
        onPreview={listSize.setPreview} onCommit={listSize.commit} />}

      <section className="skills-main">
        {detail ? (
          <SkillDetailPanel
            key={detail.id}
            skill={detail}
            onSaved={onSaved}
            onDirtyChange={dirty => { dirtyRef.current = dirty }}
            onRemove={() => setConfirmRemove(true)}
            onDuplicate={() => void duplicate()}
            onReveal={() => void reveal()}
            onTogglePin={() => void togglePin()}
          />
        ) : (
          <div className="library-empty">
            <EmptyState compact icon={Layers} title={items.length ? '从左侧选择一个 Skill' : '还没有 Skill'} />
            {!items.length && <p className="small muted">拖入 ZIP、目录或 Markdown 即可导入。</p>}
          </div>
        )}
      </section>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="从库中移除这个 skill？"
        confirmLabel="从库中移除"
        description="移除后，列表里将不再显示这条记录。包文件仍保留在数据目录，封面文件也会保留。"
        loading={removing}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />

      <ConfirmDialog
        open={pendingSelect !== null}
        title="放弃未保存的修改？"
        confirmLabel="放弃修改"
        description="当前 skill 的编辑内容还没有保存，切换后会丢失这些修改。"
        onClose={() => setPendingSelect(null)}
        onConfirm={() => {
          const id = pendingSelect
          setPendingSelect(null)
          dirtyRef.current = false
          if (id) void open(id)
        }}
      />

      {!importOpen && dragOver && (
        <div className="skills-drop">
          <Upload size={22} strokeWidth={1.6} />
          <span>松开即可导入 ZIP / 目录 / Markdown</span>
        </div>
      )}
    </div>
  )
}

export default defineModule({
  id: 'skills',
  name: 'Skill 库',
  group: '工具',
  icon: Layers,
  order: 20,
  keywords: ['skill', '技能', '技能库', 'prompt', 'import'],
  summary: async () => {
    const items = await window.api.skills.list({})
    return items.length ? `${items.length} 个 skill` : '还没有 skill'
  },
  page: SkillsPage
})
