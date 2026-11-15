import { useEffect, useState, type FormEvent } from 'react'
import type { IeltsSet } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Select'
import { humanError } from '../../lib/utils'

export const STUDY_SETTING = 'ui.immersive_study'

export interface StudySettings {
  notes: boolean
  english: boolean
  englishSetId: string | null
}

export function parseStudySettings(raw?: string): StudySettings {
  const defaults = { notes: true, english: true, englishSetId: null }
  if (!raw) return defaults
  try {
    const saved = JSON.parse(raw) as Partial<StudySettings> | null
    return {
      notes: saved?.notes !== false,
      english: saved?.english !== false,
      englishSetId: typeof saved?.englishSetId === 'string' ? saved.englishSetId : null
    }
  } catch {
    return defaults
  }
}

interface Props {
  settings: StudySettings
  onClose(): void
  onSave(settings: StudySettings): void
}

export function FocusStudySettings({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings)
  const [packs, setPacks] = useState<IeltsSet[] | null>(null)
  const [packError, setPackError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const selectedId = packs?.some(pack => pack.id === draft.englishSetId) ? draft.englishSetId : null

  useEffect(() => {
    let active = true
    void window.api.ielts.sets().then(rows => {
      if (active) setPacks(rows.filter(pack => pack.itemCount > 0))
    }).catch(error => {
      if (active) setPackError(humanError(error))
    })
    return () => { active = false }
  }, [loadAttempt])

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (saving) return
    const next = { ...draft, englishSetId: packs ? selectedId : draft.englishSetId }
    setSaving(true)
    setSaveError('')
    try {
      await window.api.settings.set(STUDY_SETTING, JSON.stringify(next))
      onSave(next)
    } catch (error) {
      setSaveError(humanError(error))
      setSaving(false)
    }
  }

  return <Dialog open title="学习设置" className="focus-study-settings" onClose={() => { if (!saving) onClose() }}>
    <form className="form-stack" onSubmit={event => void save(event)}>
      <fieldset className="focus-study-options" disabled={saving}>
        <legend>显示的学习入口</legend>
        <label><input type="checkbox" checked={draft.notes}
          onChange={event => setDraft({ ...draft, notes: event.target.checked })} />阅读笔记</label>
        <label><input type="checkbox" checked={draft.english}
          onChange={event => setDraft({ ...draft, english: event.target.checked })} />学习英语</label>
      </fieldset>
      {draft.english && <div className="field">
        <label htmlFor="focus-english-pack">默认英语学习包</label>
        <Select id="focus-english-pack" value={selectedId ?? ''} disabled={saving || !packs}
          onChange={event => setDraft({ ...draft, englishSetId: event.target.value || null })}>
          <option value="">全部学习包</option>
          {packs?.map(pack => <option value={pack.id} key={pack.id}>{pack.title}</option>)}
        </Select>
        {packs?.length === 0 && <p className="input-hint">可在「英语」生成词句学习包，再回这里选择。</p>}
        {!packs && !packError && <p className="input-hint" role="status">正在读取学习包…</p>}
        {packError && <div className="row">
          <p role="alert">无法读取学习包。{packError}</p>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => {
            setPackError('')
            setLoadAttempt(attempt => attempt + 1)
          }}>重试</Button>
        </div>}
      </div>}
      {saveError && <p role="alert">无法保存学习设置。{saveError}</p>}
      <div className="actions">
        <Button type="button" disabled={saving} onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" loading={saving}>保存设置</Button>
      </div>
    </form>
  </Dialog>
}
