import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardList, ClipboardPaste, Pause, Pin, PinOff, Play, Trash2 } from 'lucide-react'
import type { ClipboardItem, ClipboardPage } from '@shared/types'
import { defineModule } from '../../modules/defineModule'
import { ActionPopover } from '../../components/ui/ActionPopover'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pager } from '../../components/ui/Pager'
import { SearchField } from '../../components/ui/SearchField'
import { formatDate, humanError } from '../../lib/utils'
import './clipboard.css'

const PAGE_SIZE = 50

function ClipboardPageView() {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [enabled, setEnabled] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(query); setOffset(0) }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async (nextOffset: number): Promise<void> => {
    setStatus('loading')
    try {
      const page: ClipboardPage = await window.api.clipboard.list({ q: debounced || undefined, limit: PAGE_SIZE, offset: nextOffset })
      setItems(page.items)
      setTotal(page.total)
      setOffset(page.offset)
      setStatus('ready')
    } catch (error) {
      setStatus('failed')
      window.toast.error(humanError(error))
    }
  }, [debounced])

  useEffect(() => { void load(offset) }, [load, offset])
  useEffect(() => {
    void window.api.settings.getAll().then(settings => setEnabled(settings['clipboard.enabled'] !== '0')).catch(() => undefined)
  }, [])

  const copy = async (item: ClipboardItem): Promise<void> => {
    try {
      const ok = await window.api.clipboard.copy(item.id)
      if (!ok) return
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(current => current === item.id ? null : current), 1500)
      void load(offset)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const togglePin = async (item: ClipboardItem): Promise<void> => {
    try {
      const updated = await window.api.clipboard.togglePin(item.id)
      if (updated) void load(offset)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const remove = async (item: ClipboardItem): Promise<void> => {
    try {
      await window.api.clipboard.remove(item.id)
      void load(offset)
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const toggleCapture = async (): Promise<void> => {
    const next = !enabled
    setEnabled(next)
    try { await window.api.clipboard.setEnabled(next) }
    catch {
      setEnabled(!next)
      window.toast.error('未能保存设置，请重试')
    }
  }

  const clear = async (): Promise<void> => {
    if (clearing) return
    setClearing(true)
    try {
      await window.api.clipboard.clear()
      setConfirmingClear(false)
      void load(0)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setClearing(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page clipboard-page">
      <PageHeader
        title="剪贴板"
        meta={<>
          <span className="clipboard-capture-state" data-on={enabled}>
            {enabled ? '正在记录文本' : '记录已暂停'}
          </span>
          <button className="button ghost sm" onClick={() => void toggleCapture()}>
            {enabled ? <><Pause size={13} />暂停记录</> : <><Play size={13} />恢复记录</>}
          </button>
        </>}
      />

      <div className="clipboard-toolbar">
        <SearchField label="搜索剪贴板" value={query} onValueChange={setQuery} placeholder="搜索复制过的内容" />
        <ActionPopover label="更多操作" actions={[
          { label: '清空未置顶', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirmingClear(true) }
        ]} />
      </div>

      {status === 'loading' ? (
        <p className="clipboard-status" role="status">正在读取剪贴板历史…</p>
      ) : status === 'failed' && !items.length ? (
        <div className="clipboard-status" role="status">
          无法读取剪贴板历史。
          <button className="button ghost sm" type="button" onClick={() => void load(offset)}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={debounced ? '没有匹配的记录' : '还没有剪贴板历史'}
          description={debounced ? '换个关键字试试。' : '复制的文本会自动记录在这里，点击条目即可再次复制。'}
        />
      ) : (
        <ul className="list clipboard-list">
          {items.map(item => (
            <li
              className="card clipboard-row"
              key={item.id}
              data-pinned={item.pinned === 1 || undefined}
              onClick={() => void copy(item)}
            >
              <p className="clipboard-content">{item.content}</p>
              <div className="clipboard-foot">
                <span className="clipboard-time">
                  <ClipboardPaste size={12} aria-hidden="true" />
                  <time dateTime={String(item.updatedAt)}>{formatDate(item.updatedAt, 'M月d日 HH:mm')}</time>
                </span>
                <span className="clipboard-actions">
                  {copiedId === item.id && <span className="clipboard-copied"><Check size={12} />已复制</span>}
                  <button className="icon-action" title={item.pinned === 1 ? '取消置顶' : '置顶'}
                    aria-label={item.pinned === 1 ? `取消置顶该记录` : '置顶该记录'}
                    onClick={event => { event.stopPropagation(); void togglePin(item) }}>
                    {item.pinned === 1 ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button className="icon-action danger" title="删除记录" aria-label="删除该记录"
                    onClick={event => { event.stopPropagation(); void remove(item) }}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE && (
        <Pager page={Math.floor(offset / PAGE_SIZE)} pages={pages} disabled={status === 'loading'}
          info={`共 ${total} 条 · 每页 ${PAGE_SIZE} 条`} onChange={page => setOffset(page * PAGE_SIZE)} />
      )}

      <ConfirmDialog
        open={confirmingClear}
        title="清空剪贴板历史？"
        confirmLabel="清空未置顶"
        description="未置顶的复制记录会全部删除，置顶的条目保留。"
        loading={clearing}
        onClose={() => setConfirmingClear(false)}
        onConfirm={() => void clear()}
      />
    </div>
  )
}

export default defineModule({
  id: 'clipboard',
  name: '剪贴板',
  group: '工具',
  icon: ClipboardList,
  order: 45,
  keywords: ['clipboard', '粘贴', '复制历史'],
  page: ClipboardPageView
})
