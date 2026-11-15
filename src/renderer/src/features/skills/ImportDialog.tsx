import { useRef, useState } from 'react'
import { FileText, FolderOpen, Upload } from 'lucide-react'
import type { SkillImportResult, SkillSummary } from '@shared/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { humanError } from '../../lib/utils'

interface ImportDialogProps {
  open: boolean
  onClose(): void
  onImported(skill: SkillSummary): void
}

export async function importDroppedSkill(file: File): Promise<SkillImportResult> {
  const path = window.api.app.getFilePath(file)
  if (!path) throw new Error('无法读取文件路径，请从导入弹窗选择文件。')
  return window.api.skills.importPath(path)
}

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)

  const run = async (importSkill: () => Promise<SkillImportResult>): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      const result = await importSkill()
      if (result.canceled || !result.skill) return
      onImported(result.skill)
      window.toast.success(`已导入「${result.skill.name}」`)
      onClose()
    } catch (error) {
      setError(humanError(error))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} title="添加 Skill" onClose={() => {
      if (running.current) return
      setDragging(false)
      setError('')
      onClose()
    }}>
      <div className="import-dialog">
        <button type="button" className={`dropzone${dragging ? ' is-active' : ''}`} disabled={busy} data-dialog-autofocus
          onClick={() => void run(window.api.skills.importZip)}
          onDragOver={event => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={event => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
          }}
          onDrop={event => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) void run(() => importDroppedSkill(file))
          }}>
          <Upload size={20} aria-hidden="true" />
          <strong>{busy ? '正在导入…' : '拖入文件或目录'}</strong>
          <span className="small muted">支持 ZIP、目录和 Markdown · 点击选择 ZIP</span>
        </button>
        <div className="skill-import-actions">
          <Button variant="secondary" disabled={busy} onClick={() => void run(window.api.skills.importDirectory)}><FolderOpen size={15} aria-hidden="true" />选择目录</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(window.api.skills.importMarkdown)}><FileText size={15} aria-hidden="true" />选择 Markdown</Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  )
}
