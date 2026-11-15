import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { MEMORY_MAX_CONTENT_LENGTH, MEMORY_MAX_IMAGE_BYTES, MEMORY_MAX_IMAGES, type MemoryEntry } from '@shared/memories'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { humanError, todayKey } from '../../lib/utils'

interface DraftImage {
  url: string
  name: string
  file?: File
}

export function memoryImageUrl(name: string): string {
  return `wb-asset://memories/${name}`
}

export function MemoryEditor({ entry, onClose, onSaved }: {
  entry: MemoryEntry | null
  onClose(): void
  onSaved(entry: MemoryEntry): void
}) {
  const [date, setDate] = useState(entry?.date ?? todayKey())
  const [time, setTime] = useState(entry?.time ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [images, setImages] = useState<DraftImage[]>(() => (entry?.imageFiles ?? [])
    .map(name => ({ name, url: memoryImageUrl(name) })))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const objectUrls = useRef(new Set<string>())

  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [])

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (files.length + images.length > MEMORY_MAX_IMAGES) {
      setError(`每条记录最多添加 ${MEMORY_MAX_IMAGES} 张照片。`)
      return
    }
    if (files.some(file => !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name) || file.size === 0 || file.size > MEMORY_MAX_IMAGE_BYTES)) {
      setError('请选择有效的 PNG、JPG、WebP、GIF 或 AVIF 图片，单张最多 12MB。')
      return
    }
    const added = files.map(file => {
      const url = URL.createObjectURL(file)
      objectUrls.current.add(url)
      return { name: file.name, file, url }
    })
    setImages([...images, ...added])
    setError('')
  }

  function removeImage(image: DraftImage) {
    if (objectUrls.current.delete(image.url)) URL.revokeObjectURL(image.url)
    setImages(images.filter(item => item !== image))
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !content.trim()) return
    setSaving(true)
    setError('')
    try {
      const files = images.flatMap(image => image.file ? [image.file] : [])
      const saved = await window.api.memories.save({
        id: entry?.id, date, time: time || null, content,
        keepImages: images.filter(image => !image.file).map(image => image.name),
        images: await Promise.all(files.map(file => file.arrayBuffer()))
      })
      onSaved(saved)
    } catch (cause) {
      setError(humanError(cause))
    } finally {
      setSaving(false)
    }
  }

  const close = () => { if (!saving) onClose() }
  return <Dialog open title={entry ? '编辑纪念记录' : '新增纪念记录'} className="memory-editor" onClose={close}>
    <form onSubmit={event => void save(event)}>
      <fieldset disabled={saving}>
        <div className="memory-editor-when">
          <label>日期<input className="input" type="date" value={date} min="0001-01-01" max="9999-12-31" required onChange={event => setDate(event.target.value)} /></label>
          <label>时间（选填）<input className="input" type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
        </div>
        <label>正文<textarea className="textarea" rows={5} value={content} maxLength={MEMORY_MAX_CONTENT_LENGTH} required
          data-dialog-autofocus placeholder="那天发生了什么？" onChange={event => setContent(event.target.value)} /></label>
        <div className="memory-editor-photos">
          <Button type="button" disabled={images.length >= MEMORY_MAX_IMAGES} onClick={() => picker.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />添加照片
          </Button>
          <span className="muted">{images.length} / {MEMORY_MAX_IMAGES} 张</span>
          <input ref={picker} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif" multiple hidden onChange={addImages} />
        </div>
        {images.length > 0 && <ul className="memory-draft-images">
          {images.map((image, index) => <li key={image.url}>
            <img src={image.url} alt={`照片 ${index + 1}`} />
            <Button type="button" className="icon sm" aria-label={`移除照片 ${index + 1}`} onClick={() => removeImage(image)}><X size={14} /></Button>
          </li>)}
        </ul>}
      </fieldset>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="actions">
        <Button type="button" disabled={saving} onClick={close}>取消</Button>
        <Button type="submit" variant="primary" disabled={!date || !content.trim()} loading={saving}>保存记录</Button>
      </div>
    </form>
  </Dialog>
}
