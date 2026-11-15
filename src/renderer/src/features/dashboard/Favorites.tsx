import { useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Search, X } from 'lucide-react'
import { Input } from '../../components/ui/Input'
import { useModuleRegistry } from '../../modules/registry'
import { compareGroups } from '../../modules/groups'
import { PINNED_LIMIT, useNavigation, visiblePinned } from '../../stores/navigation'

type SaveProps = { saving: boolean; save(next: string[]): Promise<void> }

export default function Favorites({ editing, saving, save, onEdit }: SaveProps & { editing: boolean; onEdit?(): void }) {
  const navigate = useNavigation(state => state.navigate)
  const pinned = useNavigation(state => state.pinned)
  const modules = useModuleRegistry(state => state.modules)
  const [dragged, setDragged] = useState<string | null>(null)
  const cards = visiblePinned(pinned, modules)

  const move = (id: string, targetId: string): void => {
    if (saving || id === targetId) return
    const targetIndex = pinned.indexOf(targetId)
    if (targetIndex < 0) return
    const next = pinned.filter(item => item !== id)
    next.splice(targetIndex, 0, id)
    void save(next)
  }

  const editButton = onEdit && (
    <button className="home-link home-edit" type="button" aria-expanded={editing} aria-controls={editing ? 'home-favorites-editor' : undefined} disabled={saving} onClick={onEdit}>
      {editing ? '完成编辑' : '编辑常用'}
    </button>
  )

  return (
    <section className="home-favorites" aria-labelledby="home-favorites-title">
      <h2 id="home-favorites-title">常用</h2>
      <div className="home-shortcuts">
        {!cards.length && <div className="home-shortcut-end"><span className="home-subtle">尚未添加常用功能</span>{editButton}</div>}
        {cards.map((module, index) => (
          <div className="home-shortcut-end" key={module.id}>
            <div
              className="home-shortcut-wrap"
              draggable={editing && !saving}
              onDragStart={event => {
                setDragged(module.id)
                event.dataTransfer.setData('text/plain', module.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={event => { if (editing && dragged && !saving) event.preventDefault() }}
              onDragEnd={() => setDragged(null)}
              onDrop={event => {
                event.preventDefault()
                if (dragged) move(dragged, module.id)
                setDragged(null)
              }}
            >
              <button className="home-shortcut" type="button" onClick={() => navigate(module.path || '/' + module.id)}>
                <module.icon size={16} strokeWidth={1.75} />
                <span className="truncate">{module.name}</span>
              </button>
              {editing && (
                <div className="home-favorite-actions">
                  <button type="button" aria-label={`前移${module.name}`} disabled={!index || saving} onClick={() => move(module.id, cards[index - 1].id)}>
                    <ArrowLeft size={13} />
                  </button>
                  <button type="button" aria-label={`后移${module.name}`} disabled={index === cards.length - 1 || saving} onClick={() => move(module.id, cards[index + 1].id)}>
                    <ArrowRight size={13} />
                  </button>
                  <button type="button" aria-label={`移除${module.name}`} disabled={saving} onClick={() => {
                    const previous = pinned
                    void save(pinned.filter(id => id !== module.id))
                    window.toast.success(`已移除「${module.name}」`, { label: '撤销', onClick: () => void save(previous) })
                  }}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            {index === cards.length - 1 && editButton}
          </div>
        ))}
      </div>
    </section>
  )
}

export function FavoritePicker({ saving, save }: SaveProps) {
  const pinned = useNavigation(state => state.pinned)
  const modules = useModuleRegistry(state => state.modules)
  const [query, setQuery] = useState('')
  const count = visiblePinned(pinned, modules).length
  const available = modules.filter(module => module.pinnable && !pinned.includes(module.id)
    && module.name.toLowerCase().includes(query.trim().toLowerCase()))
  const groups = [...new Set(available.map(module => module.group))].sort(compareGroups)

  return (
    <div className="home-favorites-editor" id="home-favorites-editor">
      <div className="home-panel-head">
        <h3>添加常用</h3>
        <span className="home-subtle">改动自动保存 · <span className="num">{count}/{PINNED_LIMIT}</span>{count >= PINNED_LIMIT ? '，移除后可添加' : ''}</span>
      </div>
      <div className="search-field">
        <Search size={16} />
        <Input aria-label="搜索常用功能" placeholder="搜索功能…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      {groups.map(group => (
        <div className="home-favorites-group" key={group}>
          <h4>{group}</h4>
          <div className="home-shortcuts">
            {available.filter(module => module.group === group).map(module => (
              <button className="home-shortcut" type="button" key={module.id} aria-label={`添加常用 ${module.name}`} disabled={saving || count >= PINNED_LIMIT} onClick={() => void save([...pinned, module.id])}>
                <module.icon size={16} strokeWidth={1.75} />
                <span>{module.name}</span>
                <Plus size={13} />
              </button>
            ))}
          </div>
        </div>
      ))}
      {!available.length && <p className="home-subtle home-favorites-empty">{query.trim() ? '没有匹配的功能' : '所有可用功能均已加入常用'}</p>}
    </div>
  )
}
