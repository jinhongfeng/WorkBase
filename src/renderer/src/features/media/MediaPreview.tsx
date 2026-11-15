import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { humanError } from '../../lib/utils'

export function MediaPreview({ items, index, onIndex, onClose }: {
  items: MediaItem[]; index: number; onIndex(index: number): void; onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const item = items[index]
  const [failedUrl, setFailedUrl] = useState('')
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])
  if (!item) return null
  const total = items.length
  const cycle = (delta: number): void => {
    if (total < 2) return
    onIndex((index + delta + total) % total)
  }
  const failed = failedUrl === item.url
  const failedMedia = (): void => {
    setFailedUrl(item.url)
    window.toast.error('媒体无法预览，请检查本地文件或使用系统应用打开。')
  }
  // 关闭只走关闭按钮或 Esc；点击预览外部不再关闭。
  return <dialog ref={dialog} className="media-preview" aria-label={`预览：${item.name || '未命名媒体'}`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      // 视频的方向键保留给原生播放器调节进度和音量。
      if (item.type !== 'image') return
      if (event.key === 'ArrowLeft') { event.preventDefault(); cycle(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); cycle(1) }
    }}>
    <header className="media-preview-head">
      <div><h2>{item.name || '未命名媒体'}</h2><span>{index + 1} / {total} · {item.type === 'image' ? '图片' : '视频'}</span></div>
      <div className="media-actions">
        <Button onClick={() => void window.api.media.openExternal(item.id).catch(error => window.toast.error(humanError(error)))}>用系统应用打开</Button>
        <Button className="icon" variant="ghost" aria-label="关闭预览" onClick={onClose}><X size={20} /></Button>
      </div>
    </header>
    <Button className="media-prev icon" variant="ghost" aria-label="上一条媒体" disabled={total < 2} onClick={() => cycle(-1)}><ChevronLeft size={24} /></Button>
    {failed ? <div className="media-preview-error" role="status"><ImageOff size={32} /><p>无法预览这个文件</p><p>可使用系统应用打开，或检查文件是否仍在。</p></div>
      : item.type === 'image' ? <img className="media-preview-image" key={item.url} src={item.url} alt={item.name || '媒体图片'} onError={failedMedia} />
        : <video className="media-preview-video" key={item.url} src={item.url} controls autoPlay playsInline onError={failedMedia} />}
    <Button className="media-next icon" variant="ghost" aria-label="下一条媒体" disabled={total < 2} onClick={() => cycle(1)}><ChevronRight size={24} /></Button>
    <p className="media-preview-hint">{item.type === 'image' ? '← → 循环切换 · ' : ''}Esc 关闭</p>
  </dialog>
}
