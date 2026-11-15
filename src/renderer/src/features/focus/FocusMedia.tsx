import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Film, Folder, FolderOpen, Images, Pause, Play } from 'lucide-react'
import type { MediaGroup, MediaListResult, MediaType } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { humanError } from '../../lib/utils'

/** 播放列表一次取满，避免循环切换时跨页加载。 */
const PLAYLIST_SIZE = 200
/** 图片连续播放的停留时间。 */
const SLIDE_MS = 5000

interface Entry { id: string; name: string; url: string; type: MediaType }

export function FocusMedia({ type }: { type: MediaType }) {
  const video = type === 'video'
  const Icon = video ? Film : Images
  const picker = useRef<HTMLInputElement>(null)
  const localUrl = useRef('')
  const heading = useRef<HTMLHeadingElement>(null)
  const [group, setGroup] = useState<MediaGroup | null>(null)
  const [groups, setGroups] = useState<MediaGroup[]>([])
  const [retry, setRetry] = useState(0)
  const [list, setList] = useState<MediaListResult | null>(null)
  const [listError, setListError] = useState('')
  const [local, setLocal] = useState<{ name: string; url: string } | null>(null)
  // 用素材 id 而不是下标记录当前位置：媒体库异步返回后列表会变长，下标会失准。
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    let active = true
    void Promise.all([
      window.api.media.list({ type, groupId: group?.id ?? null, page: 0, pageSize: PLAYLIST_SIZE }),
      group ? Promise.resolve([]) : window.api.media.listGroups()
    ]).then(([result, groups]) => {
      if (active) {
        setList(result)
        setGroups(groups)
      }
    }).catch(error => {
      if (active) setListError(humanError(error))
    })
    return () => { active = false }
  }, [type, group, retry])

  useEffect(() => () => {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
  }, [])

  const entries: Entry[] = useMemo(() => {
    const base: Entry[] = (list?.items ?? []).map(item => ({
      id: item.id, name: item.name || item.originalName || '未命名媒体', url: item.url, type: item.type
    }))
    return local ? [...base, { id: 'local', name: local.name, url: local.url, type }] : base
  }, [list, local, type])

  const currentIndex = currentId ? entries.findIndex(entry => entry.id === currentId) : -1
  const current = currentIndex >= 0 ? entries[currentIndex] : null

  const step = useCallback((delta: number) => {
    setFailed(false)
    setCurrentId(id => {
      if (entries.length === 0) return id
      const from = id ? entries.findIndex(entry => entry.id === id) : -1
      if (from < 0) return id
      return entries[(from + delta + entries.length) % entries.length].id
    })
  }, [entries])

  // 播放器内用 ← → 切换素材。打开面板时让方向键交给表单控件。
  useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (document.querySelector('.focus-room :is(dialog[open], :popover-open)')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [current, step])

  // 图片按固定间隔连续播放，视频靠 onEnded 接续。
  useEffect(() => {
    if (!current || current.type !== 'image' || !playing) return
    const timer = setTimeout(() => step(1), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [current, playing, step])

  function selectFile(selected: File): void {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
    localUrl.current = URL.createObjectURL(selected)
    setFailed(false)
    setLocal({ name: selected.name, url: localUrl.current })
    setCurrentId('local')
  }

  function closePlayer(): void {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
    localUrl.current = ''
    setLocal(null)
    setFailed(false)
    setCurrentId(null)
    requestAnimationFrame(() => heading.current?.focus())
  }

  function openGroup(next: MediaGroup | null): void {
    setList(null)
    setListError('')
    setGroup(next)
    requestAnimationFrame(() => heading.current?.focus())
  }

  const title = video ? '视频' : '图片'

  if (current) {
    return <section className="focus-room-media-view" aria-label={`${title}播放`}>
      <header className="focus-room-view-header">
        <Button variant="ghost" onClick={closePlayer}><ArrowLeft size={16} />{group ? '返回分组' : '返回选择'}</Button>
        <div className="focus-room-view-meta">
          <h1 className="truncate" title={current.name}>{current.name}</h1>
          <span>{currentIndex + 1} / {entries.length}</span>
        </div>
        <Button variant="ghost" aria-pressed={playing} title={playing ? '暂停自动切换' : '继续自动切换'}
          onClick={() => setPlaying(value => !value)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}{playing ? '暂停连播' : '连续播放'}
        </Button>
      </header>
      <div className="focus-room-media-frame">
        <Button className="focus-room-media-nav prev" variant="ghost" aria-label={video ? '上一条' : '上一张'}
          disabled={entries.length < 2} onClick={() => step(-1)}><ChevronLeft size={24} /></Button>
        {failed ? <p role="alert">无法打开此{video ? '视频' : '图片'}，请检查文件或选择其他格式。</p>
          : current.type === 'video'
            ? <video key={current.url} src={current.url} controls autoPlay playsInline aria-label={current.name}
              onEnded={() => { if (playing) step(1) }} onError={() => setFailed(true)} />
            : <img key={current.url} src={current.url} alt={current.name} onError={() => setFailed(true)} />}
        <Button className="focus-room-media-nav next" variant="ghost" aria-label={video ? '下一条' : '下一张'}
          disabled={entries.length < 2} onClick={() => step(1)}><ChevronRight size={24} /></Button>
      </div>
      <p className="focus-room-media-hint">
        ← → 循环切换 · {current.type === 'video' ? '播完自动下一条' : '5 秒自动下一张'} · 共 {entries.length} 个
      </p>
    </section>
  }

  return <section className="focus-room-library" aria-label={title}>
    <header className="focus-room-library-head">
      <div className="focus-room-library-title">
        {group && <Button variant="ghost" onClick={() => openGroup(null)}><ArrowLeft size={16} />返回媒体库</Button>}
        <h1 className="truncate" ref={heading} tabIndex={-1} title={group?.name}>{group?.name ?? `${title}媒体库`}</h1>
      </div>
      <Button variant="primary" onClick={() => picker.current?.click()}>
        <FolderOpen size={16} />打开本地{title}
      </Button>
      <input ref={picker} hidden type="file" aria-label={video ? '选择本地视频' : '选择本地图片'}
        accept={video ? 'video/*,.m4v,.mkv,.ogv' : 'image/*'} onChange={event => {
          const selected = event.currentTarget.files?.[0]
          if (selected) selectFile(selected)
          event.currentTarget.value = ''
        }} />
    </header>
    {!group && groups.length > 0 && list && <section aria-label="分组">
      <div className="focus-room-library-label"><h2>分组</h2></div>
      <div className="focus-room-file-list">
        {groups.map(item => <button type="button" key={item.id} aria-label={`打开分组 ${item.name}`}
          title={item.description || item.name} onClick={() => openGroup(item)}>
          <Folder size={16} aria-hidden="true" /><span className="truncate">{item.name}</span>
        </button>)}
      </div>
    </section>}
    <div className="focus-room-library-label">
      <h2>{group ? `组内${title}` : `未分组${title}`}</h2>
      {list && <span>{list.total} 个{title}</span>}
    </div>
    {listError ? <div className="focus-room-empty" role="alert"><p>{listError}</p>
      <Button onClick={() => { setListError(''); setRetry(value => value + 1) }}>重新读取</Button></div>
      : !list ? <p className="focus-room-empty" role="status">正在读取媒体库…</p>
        : list.total === 0 ? <div className="focus-room-empty"><Icon size={27} strokeWidth={1.4} />
          <p>{group ? `这个分组里还没有${title}。` : `还没有未分组的${title}。`}</p></div>
          : <div className={video ? 'focus-room-file-list' : 'focus-room-gallery'}>
            {list.items.map(item => <button type="button" key={item.id} title={item.name}
              onClick={() => { setFailed(false); setCurrentId(item.id) }}>
              {video ? <Play size={16} /> : <img src={item.url} alt="" loading="lazy" />}
              <span className="truncate">{item.name}</span>
            </button>)}
          </div>}
    {list && list.total > PLAYLIST_SIZE && <p className="focus-room-media-hint">播放列表只加载最近 {PLAYLIST_SIZE} 个，其余可在媒体库中打开。</p>}
  </section>
}
