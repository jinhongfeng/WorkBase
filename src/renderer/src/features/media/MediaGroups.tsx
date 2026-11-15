import { useState } from 'react'
import { ArrowUpRight, Images } from 'lucide-react'
import type { MediaGroup } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { humanError } from '../../lib/utils'

export function MediaGroupCard({ group, disabled, onOpen }: {
  group: MediaGroup
  disabled: boolean
  onOpen(id: string): void
}) {
  return <button type="button" className="media-group-card" disabled={disabled}
    aria-label={`打开分组 ${group.name}`} aria-describedby={group.description ? `media-group-${group.id}` : undefined}
    onClick={() => onOpen(group.id)}>
    <span className="media-group-cover" aria-hidden="true">
      <Images size={32} strokeWidth={1.5} />
      {group.coverUrl && <img key={group.coverUrl} src={group.coverUrl} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true }} />}
    </span>
    <span className="media-group-panel">
      <span className="media-group-title"><span title={group.name}>{group.name}</span><ArrowUpRight size={16} aria-hidden="true" /></span>
      {group.description && <span className="media-group-description" id={`media-group-${group.id}`}>{group.description}</span>}
    </span>
  </button>
}

export function MediaGroupEditor({ group, onClose, onSave }: {
  group: MediaGroup | null
  onClose(): void
  onSave(group: MediaGroup): void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const saved = await window.api.media.saveGroup({ id: group?.id, name: name.trim(), description: description.trim() })
      onSave(saved)
    } catch (reason) {
      setError(humanError(reason))
      setSaving(false)
    }
  }

  return <Dialog open title={group ? '编辑分组' : '新建分组'} onClose={() => { if (!saving) onClose() }}>
    <form className="media-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="media-group-name">组名</label>
      <input id="media-group-name" className="input" required maxLength={40} value={name} data-dialog-autofocus
        disabled={saving} onChange={event => setName(event.target.value)} />
      <label htmlFor="media-group-description">简介（选填）</label>
      <textarea id="media-group-description" className="input" rows={3} maxLength={160} value={description}
        disabled={saving} onChange={event => setDescription(event.target.value)} />
      <p>封面自动使用组内最近导入的图片。</p>
      {error && <p className="media-form-error" role="alert">{error}</p>}
      <div className="media-actions">
        <Button type="button" disabled={saving} onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()}>{group ? '保存修改' : '创建分组'}</Button>
      </div>
    </form>
  </Dialog>
}
