import { useEffect, useState } from 'react'
import { ImageIcon, Link2, Trash2, Upload, Video } from 'lucide-react'
import type { SkillDetail } from '@shared/types'
import { Dialog } from '../../components/ui/Dialog'
import { humanError } from '../../lib/utils'

interface CoverDialogProps {
  open: boolean
  skill: SkillDetail
  onClose(): void
  onUpdated(skill: SkillDetail): void
}

export function CoverDialog({ open, skill, onClose, onUpdated }: CoverDialogProps) {
  const [kind, setKind] = useState<'image' | 'video'>('image')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'file' | 'url' | 'clear' | null>(null)

  useEffect(() => {
    if (!open) return
    setKind(skill.coverKind === 'video' ? 'video' : 'image')
    setUrl('')
    setBusy(null)
  }, [open, skill.coverKind])

  const chooseFile = async (): Promise<void> => {
    setBusy('file')
    try {
      const updated = await window.api.skills.chooseCover(skill.id, kind)
      if (updated) {
        onUpdated(updated)
        window.toast.success('封面已更新')
        onClose()
      }
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const applyUrl = async (): Promise<void> => {
    const trimmed = url.trim()
    if (!trimmed || busy) return
    setBusy('url')
    try {
      const updated = await window.api.skills.setCoverUrl(skill.id, { url: trimmed, kind })
      onUpdated(updated)
      window.toast.success('封面已下载到本地并设置')
      onClose()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy('clear')
    try {
      const updated = await window.api.skills.clearCover(skill.id)
      onUpdated(updated)
      window.toast.success('封面已移除')
      onClose()
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} title="设置封面" onClose={onClose}>
      <div className="cover-dialog">
        <div className="segmented" style={{ width: '100%' }}>
          <button aria-pressed={kind === 'image'} disabled={busy !== null} onClick={() => setKind('image')}>
            <ImageIcon size={13} />图片
          </button>
          <button aria-pressed={kind === 'video'} disabled={busy !== null} onClick={() => setKind('video')}>
            <Video size={13} />视频
          </button>
        </div>

        <button className="cover-pick" disabled={busy !== null} onClick={() => void chooseFile()}>
          <Upload size={16} strokeWidth={1.6} />
          <span>
            <b>{busy === 'file' ? '正在复制…' : `上传本地${kind === 'image' ? '图片' : '视频'}`}</b>
            <small>{kind === 'image' ? 'PNG / JPG / WebP / GIF / AVIF，最大 12MB' : '推荐 MP4（H.264）或 WebM，最大 200MB'}</small>
          </span>
        </button>

        <div className="cover-divider"><span>或使用外部链接</span></div>

        <div className="field">
          <label htmlFor="cover-url">图片 / 视频直链</label>
          <div className="input-group">
            <input
              id="cover-url"
              className="input"
              value={url}
              placeholder={kind === 'image' ? 'https://example.com/cover.jpg' : 'https://example.com/cover.mp4'}
              disabled={busy !== null}
              onChange={event => setUrl(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void applyUrl() }}
            />
            <button className="button secondary" disabled={busy !== null || !url.trim()} onClick={() => void applyUrl()}>
              <Link2 size={13} />{busy === 'url' ? '下载中…' : '设为封面'}
            </button>
          </div>
          <p className="input-hint">链接内容会下载到本地，之后离线也能显示。{kind === 'image' ? '图片最大 12MB。' : '视频最大 30MB。'}</p>
        </div>

        <div className="actions">
          {skill.coverKind !== 'none' && (
            <button className="button danger" disabled={busy !== null} onClick={() => void clear()} style={{ marginRight: 'auto' }}>
              <Trash2 size={13} />{busy === 'clear' ? '移除中…' : '移除封面'}
            </button>
          )}
          <button className="button secondary" onClick={onClose} disabled={busy !== null}>关闭</button>
        </div>
      </div>
    </Dialog>
  )
}
