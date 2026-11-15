import { useEffect, useState } from 'react'
import { ImageOff, Play, ZoomIn } from 'lucide-react'
import type { SkillSummary } from '@shared/types'
import { Dialog } from '../../components/ui/Dialog'

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'S'
}

/** 列表缩略图：视频不挂 video 元素，避免一屏几十个解码器。 */
export function SkillThumb({ skill }: { skill: SkillSummary }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [skill.coverUrl])

  if (skill.coverKind === 'image' && skill.coverUrl && !failed) {
    return (
      <div className="skill-thumb">
        <img src={skill.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      </div>
    )
  }
  if (skill.coverKind === 'video' && skill.coverUrl) {
    return (
      <div className="skill-thumb video" aria-hidden="true">
        <Play size={13} strokeWidth={2.2} />
      </div>
    )
  }
  return <div className="skill-thumb empty" aria-hidden="true"><span>{initial(skill.name)}</span></div>
}

/** 详情横幅：图片可点击放大，视频使用带控件的原生播放器。 */
export function SkillCoverBanner({ skill }: { skill: SkillSummary }) {
  const [failed, setFailed] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { coverUrl, coverKind, name } = skill

  if (failed) return <p className="skill-banner-fallback"><ImageOff size={16} />封面加载失败。可在上方重新选择文件。</p>
  if (!coverUrl || coverKind === 'none') return null

  return (
    <div className="skill-banner">
      {coverKind === 'image' ? (
        <>
          <button type="button" className="skill-cover-zoom" aria-label={`放大查看 ${name} 的封面`} aria-haspopup="dialog"
            onClick={() => setPreviewOpen(true)}>
            <img src={coverUrl} alt="" onError={() => setFailed(true)} />
            <ZoomIn size={24} aria-hidden="true" />
          </button>
          <Dialog open={previewOpen} title="封面预览" className="skill-cover-preview" onClose={() => setPreviewOpen(false)}>
            {previewOpen && <img src={coverUrl} alt={`${name} 封面`} onError={() => setFailed(true)} />}
          </Dialog>
        </>
      ) : (
        <video
          src={coverUrl}
          controls
          preload="metadata"
          playsInline
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
