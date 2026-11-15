import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Clapperboard, ImagePlus, Pencil, Plus, Star, Trash2, TvMinimal } from 'lucide-react'
import type { ShelfItem, ShelfKind, ShelfStatus } from '@shared/shelf'
import { SHELF_MAX_COMMENT, SHELF_MAX_COVER_BYTES, SHELF_MAX_CREATOR, SHELF_MAX_TITLE } from '@shared/shelf'
import { defineModule } from '../../modules/defineModule'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { SearchField } from '../../components/ui/SearchField'
import { Select } from '../../components/ui/Select'
import { humanError } from '../../lib/utils'
import './shelf.css'

const KINDS: { key: ShelfKind | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'book', label: '书籍' },
  { key: 'movie', label: '电影' },
  { key: 'tv', label: '剧集' }
]
const STATUSES: { key: ShelfStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'wish', label: '待开始' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' }
]
const KIND_ICONS: Record<ShelfKind, typeof BookOpen> = { book: BookOpen, movie: Clapperboard, tv: TvMinimal }
const KIND_LABELS: Record<ShelfKind, string> = { book: '书籍', movie: '电影', tv: '剧集' }
const STATUS_LABELS: Record<ShelfStatus, string> = { wish: '待开始', doing: '进行中', done: '已完成' }
const RATING_STARS = [1, 2, 3, 4, 5]

interface FormState {
  id?: string
  kind: ShelfKind
  title: string
  creator: string
  status: ShelfStatus
  rating: number
  comment: string
  startDate: string
  finishDate: string
  coverUrl: string | null
  cover: File | null
}

const EMPTY_FORM: FormState = {
  kind: 'book', title: '', creator: '', status: 'wish', rating: 0,
  comment: '', startDate: '', finishDate: '', coverUrl: null, cover: null
}

function ShelfCover({ kind, url, lazy }: { kind: ShelfKind; url: string | null; lazy?: boolean }) {
  const Icon = KIND_ICONS[kind]
  return (
    <div className="shelf-cover" aria-hidden="true">
      <Icon className="shelf-cover-placeholder" size={32} strokeWidth={1.5} />
      {url && <img key={url} src={url} alt="" loading={lazy ? 'lazy' : undefined}
        onError={event => { event.currentTarget.hidden = true }} />}
    </div>
  )
}

function ShelfCard({ item, onEdit, onDelete }: { item: ShelfItem; onEdit(): void; onDelete(): void }) {
  const rating = item.rating ?? 0
  return (
    <li className="shelf-card">
      <ShelfCover kind={item.kind} url={item.coverUrl} lazy />
      <span className="shelf-kind">{KIND_LABELS[item.kind]}</span>
      <div className="shelf-info">
        <div className="shelf-info-copy">
          <h2><span>{item.title}</span><Pencil size={15} aria-hidden="true" /></h2>
          {item.creator && <p className="shelf-creator">{item.creator}</p>}
          {item.comment && <div className="shelf-comment-preview"><p className="shelf-comment">{item.comment}</p></div>}
        </div>
        <div className="shelf-card-foot">
          <span className="shelf-status-chip" data-status={item.status}>{STATUS_LABELS[item.status]}</span>
          {rating > 0 && <span className="shelf-stars" role="img" aria-label={`评分 ${rating} 星`}>
            {RATING_STARS.map(star => <Star key={star} size={13} className={star <= rating ? 'active' : undefined} aria-hidden="true" />)}
          </span>}
          {item.status === 'done' && item.finishDate && (
            <time dateTime={item.finishDate} title={`完成日期 ${item.finishDate}`}>{item.finishDate}</time>
          )}
        </div>
      </div>
      <button type="button" className="shelf-card-open" onClick={onEdit} aria-label={`编辑 ${item.title}`} title={`编辑：${item.title}`} />
      <div className="shelf-card-actions">
        <Button type="button" variant="ghost" className="icon shelf-delete" title="删除收藏" aria-label={`删除 ${item.title}`} onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}

function ShelfPage() {
  const [items, setItems] = useState<ShelfItem[]>([])
  const [stats, setStats] = useState({ total: 0, wish: 0, doing: 0, done: 0 })
  const [kind, setKind] = useState<ShelfKind | 'all'>('all')
  const [status, setStatus] = useState<ShelfStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [form, setForm] = useState<FormState | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<ShelfItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const cover = form?.cover

  useEffect(() => {
    if (!cover) {
      setCoverPreview(null)
      return
    }
    const preview = URL.createObjectURL(cover)
    setCoverPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [cover])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const [list, counts] = await Promise.all([
        window.api.shelf.list({ kind, status, q: debounced || undefined }),
        window.api.shelf.stats()
      ])
      setItems(list)
      setStats(counts)
      setLoadState('ready')
    } catch (error) {
      setLoadState('failed')
      window.toast.error(humanError(error))
    }
  }, [kind, status, debounced])

  useEffect(() => { void load() }, [load])

  const openCreate = (): void => {
    setForm({ ...EMPTY_FORM })
  }

  const openEdit = (item: ShelfItem): void => {
    setForm({
      id: item.id, kind: item.kind, title: item.title, creator: item.creator, status: item.status,
      rating: item.rating ?? 0, comment: item.comment, startDate: item.startDate ?? '',
      finishDate: item.finishDate ?? '', coverUrl: item.coverUrl, cover: null
    })
  }

  const pickCover = (file: File | null): void => {
    if (!file) return
    if (file.size > SHELF_MAX_COVER_BYTES) {
      window.toast.error('封面不能超过 12 MB')
      return
    }
    setForm(current => current && { ...current, cover: file })
  }

  const closeForm = (): void => { if (!saving) setForm(null) }

  const save = async (): Promise<void> => {
    if (!form || saving || !form.title.trim()) return
    setSaving(true)
    try {
      await window.api.shelf.save({
        id: form.id,
        kind: form.kind,
        title: form.title.trim(),
        creator: form.creator.trim() || undefined,
        status: form.status,
        rating: form.rating > 0 ? form.rating : null,
        comment: form.comment.trim() || undefined,
        startDate: form.startDate || null,
        finishDate: form.finishDate || null,
        keepCover: form.cover ? null : form.coverUrl?.split('/').pop() ?? null,
        cover: form.cover ? await form.cover.arrayBuffer() : undefined
      })
      setForm(null)
      void load()
      window.toast.success('已保存')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleting || removing) return
    setRemoving(true)
    try {
      await window.api.shelf.remove(deleting.id)
      setDeleting(null)
      void load()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setRemoving(false)
    }
  }

  const meta = `共 ${stats.total} · 待开始 ${stats.wish} · 进行中 ${stats.doing} · 已完成 ${stats.done}`
  const filtered = kind !== 'all' || status !== 'all' || Boolean(debounced.trim())

  return (
    <div className="page shelf-page">
      <PageHeader
        title="书影音"
        meta={loadState === 'ready' ? <span className="shelf-meta">{meta}</span> : undefined}
        actions={<Button type="button" variant="primary" onClick={openCreate}><Plus size={16} aria-hidden="true" />添加收藏</Button>}
      />

      <div className="toolbar shelf-filters">
        <div className="segmented" role="group" aria-label="按类型筛选">
          {KINDS.map(option => (
            <button key={option.key} type="button" aria-pressed={kind === option.key} onClick={() => setKind(option.key)}>{option.label}</button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="按状态筛选">
          {STATUSES.map(option => (
            <button key={option.key} type="button" aria-pressed={status === option.key} onClick={() => setStatus(option.key)}>{option.label}</button>
          ))}
        </div>
        <SearchField className="shelf-search" label="搜索书影音" value={query} onValueChange={setQuery} placeholder="搜索标题或作者/导演" />
      </div>

      {loadState === 'loading' ? (
        <p className="shelf-status" role="status">正在读取收藏…</p>
      ) : loadState === 'failed' && !items.length ? (
        <div className="shelf-status" role="status">
          无法读取收藏。
          <button className="button ghost sm" type="button" onClick={() => void load()}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtered ? '没有匹配的收藏' : '还没有收藏'}
          description={filtered ? '换个关键字或调整筛选条件。' : undefined}
        >
          {filtered ? <Button type="button" onClick={() => { setKind('all'); setStatus('all'); setQuery(''); setDebounced('') }}>清除筛选</Button>
            : <Button type="button" onClick={openCreate}>添加收藏</Button>}
        </EmptyState>
      ) : (
        <ul className="shelf-grid">
          {items.map(item => <ShelfCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => setDeleting(item)} />)}
        </ul>
      )}

      <Dialog open={form !== null} title={form?.id ? '编辑收藏' : '添加收藏'} className="shelf-editor" onClose={closeForm}>
        {form && (
          <form className="shelf-form" onSubmit={event => { event.preventDefault(); void save() }}>
            <div className="shelf-form-scroll">
              <fieldset className="shelf-form-body" disabled={saving} aria-label="收藏资料">
                <div className="shelf-form-fields">
                  <label className="field shelf-form-wide">
                    标题
                    <input className="input" data-dialog-autofocus required maxLength={SHELF_MAX_TITLE}
                      value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
                  </label>
                  <label className="field">
                    类型
                    <Select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as ShelfKind })}>
                      {Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </Select>
                  </label>
                  <label className="field">
                    {form.kind === 'book' ? '作者' : '导演'}（选填）
                    <input className="input" maxLength={SHELF_MAX_CREATOR}
                      value={form.creator} onChange={event => setForm({ ...form, creator: event.target.value })} />
                  </label>
                  <label className="field">
                    状态
                    <Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as ShelfStatus })}>
                      {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </Select>
                  </label>
                  <label className="field">
                    完成日期（选填）
                    <input className="input" type="date" value={form.finishDate}
                      onChange={event => setForm({ ...form, finishDate: event.target.value })} />
                  </label>
                  <div className="field shelf-form-wide">
                    <span id="shelf-rating">评分</span>
                    <div className="shelf-stars shelf-stars-input" role="group" aria-labelledby="shelf-rating">
                      {RATING_STARS.map(star => (
                        <button key={star} type="button" aria-label={`${star} 星`} aria-pressed={form.rating === star}
                          className={star <= form.rating ? 'active' : undefined}
                          onClick={() => setForm({ ...form, rating: form.rating === star ? 0 : star })}>
                          <Star size={19} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="field shelf-form-wide">
                    短评（选填）
                    <textarea className="input textarea" rows={3} maxLength={SHELF_MAX_COMMENT} placeholder="写点感受"
                      value={form.comment} onChange={event => setForm({ ...form, comment: event.target.value })} />
                  </label>
                </div>
                <div className="shelf-cover-field">
                  <span>封面（选填）</span>
                  <ShelfCover kind={form.kind} url={form.cover ? coverPreview : form.coverUrl} />
                  <input
                    ref={coverInput}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={event => {
                      pickCover(event.target.files?.[0] ?? null)
                      event.target.value = ''
                    }}
                  />
                  <Button type="button" onClick={() => coverInput.current?.click()} aria-describedby="shelf-cover-limit">
                    <ImagePlus size={16} aria-hidden="true" />{form.cover || form.coverUrl ? '更换封面' : '选择封面'}
                  </Button>
                  <span className="shelf-cover-limit" id="shelf-cover-limit">图片最大 12 MB</span>
                  {(form.cover || form.coverUrl) && (
                    <Button type="button" variant="ghost" onClick={() => setForm({ ...form, coverUrl: null, cover: null })}>移除封面</Button>
                  )}
                </div>
              </fieldset>
            </div>
            <div className="shelf-form-actions">
              <Button type="button" variant="ghost" disabled={saving} onClick={closeForm}>取消</Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!form.title.trim()}>保存收藏</Button>
            </div>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="删除收藏？"
        confirmLabel="删除"
        description={`「${deleting?.title ?? ''}」将被永久删除，封面文件一并清理。`}
        loading={removing}
        onClose={() => { if (!removing) setDeleting(null) }}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

export default defineModule({
  id: 'shelf',
  name: '书影音',
  group: '记录',
  icon: BookOpen,
  order: 25,
  keywords: ['书影音', '读书', '电影', '剧集', '书单', '影单', '收藏'],
  page: ShelfPage
})
