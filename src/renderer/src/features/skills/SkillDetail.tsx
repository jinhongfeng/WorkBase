import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Copy, FolderOpen, ImageIcon, Save, Star, StarOff, Trash2 } from 'lucide-react'
import type { SkillDetail } from '@shared/types'
import { ActionPopover } from '../../components/ui/ActionPopover'
import { Button } from '../../components/ui/Button'
import { usePanelLayoutWidth, usePanelWidth } from '../../components/ui/PanelResizeHandle'
import { WidthHandle } from '../../components/ui/WidthHandle'
import { markdownToHtml } from '../../lib/markdown'
import { clamp, formatDate, humanError } from '../../lib/utils'
import { SkillCoverBanner } from './SkillCover'
import { CoverDialog } from './CoverDialog'
import { SOURCE_LABEL, formatSize, splitTags } from './skillMeta'

type Tab = 'preview' | 'edit' | 'files'

const DEFAULT_DETAIL_WIDTH = 900
const MIN_DETAIL_WIDTH = 560
const MAX_DETAIL_WIDTH = 1100

interface SkillDetailPanelProps {
  skill: SkillDetail
  onSaved(skill: SkillDetail): void
  onDirtyChange(dirty: boolean): void
  onRemove(): void
  onDuplicate(): void
  onReveal(): void
  onTogglePin(): void
}

export function SkillDetailPanel({
  skill, onSaved, onDirtyChange, onRemove, onDuplicate, onReveal, onTogglePin
}: SkillDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('preview')
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [tagsText, setTagsText] = useState(skill.tags.join(', '))
  const [content, setContent] = useState(skill.content)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)

  useEffect(() => {
    setTab('preview')
    setName(skill.name)
    setDescription(skill.description)
    setTagsText(skill.tags.join(', '))
    setContent(skill.content)
    setDirty(false)
    setSaving(false)
    setCoverOpen(false)
    onDirtyChange(false)
  }, [skill.id])

  const markDirty = (): void => {
    if (dirty) return
    setDirty(true)
    onDirtyChange(true)
  }

  const save = useCallback(async (): Promise<void> => {
    if (saving || !dirty) return
    setSaving(true)
    try {
      const saved = await window.api.skills.save({
        id: skill.id,
        name: name.trim() || skill.name,
        description: description.trim(),
        content,
        tags: splitTags(tagsText)
      })
      setDirty(false)
      setName(saved.name)
      setDescription(saved.description)
      setTagsText(saved.tags.join(', '))
      onDirtyChange(false)
      onSaved(saved)
      setTab('preview')
      window.toast.success('已保存，SKILL.md 同步写回本地')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }, [content, description, dirty, name, onDirtyChange, onSaved, saving, skill.id, skill.name, tagsText])

  const discard = (): void => {
    setName(skill.name)
    setDescription(skill.description)
    setTagsText(skill.tags.join(', '))
    setContent(skill.content)
    setDirty(false)
    onDirtyChange(false)
    setTab('preview')
  }

  useEffect(() => {
    if (tab !== 'edit') return
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [save, tab])

  const totalSize = skill.files.reduce((sum, file) => sum + file.size, 0)
  // 详情内容宽度：左右边缘手柄拖动，本机记忆；窗口过窄时收缩。
  const [detailRef, detailAreaWidth] = usePanelLayoutWidth()
  const detailSize = usePanelWidth('ui.skills.detailWidth', MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH)
  const maxDetailWidth = Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, detailAreaWidth - 24))
  const detailWidth = clamp(detailSize.preview ?? detailSize.preferred ?? DEFAULT_DETAIL_WIDTH, MIN_DETAIL_WIDTH, maxDetailWidth)
  const detailGap = Math.max(0, (detailAreaWidth - detailWidth) / 2)
  return (
    <div className="skill-detail" ref={detailRef} style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}>
      <div className="skill-detail-handles">
        <WidthHandle edge="left" label="调整内容宽度" width={detailWidth} min={MIN_DETAIL_WIDTH} max={maxDetailWidth}
          onPreview={detailSize.setPreview} onCommit={detailSize.commit} style={{ left: detailGap }} />
        <WidthHandle edge="right" label="调整内容宽度" width={detailWidth} min={MIN_DETAIL_WIDTH} max={maxDetailWidth}
          onPreview={detailSize.setPreview} onCommit={detailSize.commit} style={{ right: detailGap }} />
      </div>
      <div className="skill-detail-inner">
        <header className="skill-detail-head">
          <div className="skill-title-row">
            <h2>{skill.name}</h2>
            <div className="skill-head-actions">
              <Button variant="ghost" aria-pressed={Boolean(skill.pinned)} onClick={onTogglePin}>
                {skill.pinned ? <Star size={15} /> : <StarOff size={15} />}置顶
              </Button>
              <ActionPopover label="更多操作" actions={[
                { label: '复制为新 Skill', icon: <Copy size={15} />, onSelect: onDuplicate },
                { label: '打开包目录', icon: <FolderOpen size={15} />, onSelect: onReveal },
                { label: '从库中移除', icon: <Trash2 size={15} />, onSelect: onRemove, danger: true }
              ]} />
            </div>
          </div>
          {skill.description && <p className="skill-desc">{skill.description}</p>}
          <div className="skill-meta">
            <span className="skill-meta-text">{SOURCE_LABEL[skill.source]} · {skill.layout === 'file' ? '单文件' : '目录包'}</span>
            <span className="skill-meta-text">更新于 {formatDate(skill.updatedAt, 'yyyy年M月d日 HH:mm')}</span>
            {skill.tags.map(tag => <span className="chip accent" key={tag}>{tag}</span>)}
          </div>
        </header>

        <div className="skill-view-bar">
          <div className="skill-tabs" role="group" aria-label="Skill 详情视图">
            <button aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>预览</button>
            <button aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>
              编辑{dirty ? <i className="skill-dirty-dot" aria-label="有未保存修改" /> : null}
            </button>
            <button aria-pressed={tab === 'files'} onClick={() => setTab('files')}>文件 <span className="badge">{skill.fileCount}</span></button>
          </div>
          {tab === 'preview' && <Button variant="ghost" className="sm" onClick={() => setCoverOpen(true)}>
            <ImageIcon size={14} />{skill.coverKind === 'none' ? '添加封面' : '更换封面'}
          </Button>}
        </div>

        {tab === 'preview' && <>
          {skill.coverUrl && <SkillCoverBanner key={`${skill.id}:${skill.coverUrl}`} skill={skill} />}
          {skill.content.trim()
            ? <article className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(skill.content) }} />
            : <p className="skill-preview-empty muted">暂无正文。切换到「编辑」即可添加。</p>}
        </>}

        {tab === 'edit' && (
          <form className="skill-form" onSubmit={event => { event.preventDefault(); void save() }}>
            <div className="skill-form-grid">
              <div className="field">
                <label htmlFor="skill-name">名称</label>
                <input
                  id="skill-name"
                  className="input"
                  value={name}
                  maxLength={80}
                  disabled={saving}
                  onChange={event => { setName(event.target.value); markDirty() }}
                />
              </div>
              <div className="field">
                <label htmlFor="skill-tags">标签（逗号分隔）</label>
                <input
                  id="skill-tags"
                  className="input"
                  value={tagsText}
                  maxLength={200}
                  disabled={saving}
                  placeholder="写作, 翻译"
                  onChange={event => { setTagsText(event.target.value); markDirty() }}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="skill-description">描述</label>
              <textarea
                id="skill-description"
                className="input textarea"
                style={{ minHeight: 72 }}
                value={description}
                maxLength={400}
                disabled={saving}
                placeholder="说明这个 Skill 的用途"
                onChange={event => { setDescription(event.target.value); markDirty() }}
              />
            </div>
            <div className="field">
              <label htmlFor="skill-content">SKILL.md 正文</label>
              <textarea
                id="skill-content"
                className="input textarea skill-source-area"
                value={content}
                spellCheck={false}
                disabled={saving}
                onChange={event => { setContent(event.target.value); markDirty() }}
              />
              <p className="input-hint">保存时会写回包目录里的 SKILL.md，frontmatter 的其它字段原样保留。</p>
            </div>
            <div className="skill-form-actions">
              <button type="submit" className="button primary" disabled={saving || !dirty}>
                <Save size={14} />{saving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="button secondary" disabled={saving} onClick={discard}>取消编辑</button>
              {dirty && <span className="tiny dim">有未保存的修改 · Ctrl+S 保存</span>}
            </div>
          </form>
        )}

        {tab === 'files' && (
          <div className="skill-files-wrap">
            <div className="skill-files">
              {skill.files.map(file => (
                <div className="skill-file-row" key={file.path}>
                  <span>{file.path}</span>
                  <span>{formatSize(file.size)}</span>
                </div>
              ))}
              {!skill.files.length && <div className="skill-file-row"><span>SKILL.md</span><span>—</span></div>}
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              共 {skill.files.length} 个文件，占用 {formatSize(totalSize)}。可通过「更多操作」打开包目录。
            </p>
          </div>
        )}
      </div>

      <CoverDialog
        open={coverOpen}
        skill={skill}
        onClose={() => setCoverOpen(false)}
        onUpdated={onSaved}
      />
    </div>
  )
}
