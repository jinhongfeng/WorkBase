import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { DEFAULT_SCENES, SCENE_OPTIONS, sceneOption, type SceneId } from './scene-config'

interface Props {
  scenes: SceneId[]
  onClose(): void
  onSave(scenes: SceneId[]): void
}

/** 自定义控制面板里的场景和顺序。 */
export function FocusSceneSettings({ scenes, onClose, onSave }: Props) {
  const [items, setItems] = useState<SceneId[]>(scenes)
  const available = SCENE_OPTIONS.filter(option => !items.includes(option.id))

  function add(id: SceneId): void {
    setItems(current => current.includes(id) ? current : [...current, id])
  }

  function remove(id: SceneId): void {
    setItems(current => current.filter(item => item !== id))
  }

  function move(id: SceneId, delta: number): void {
    setItems(current => {
      const index = current.indexOf(id)
      const next = index + delta
      if (index < 0 || next < 0 || next >= current.length) return current
      const copy = [...current]
      copy[index] = current[next]
      copy[next] = id
      return copy
    })
  }

  return <Dialog open title="自定义场景" className="focus-scene-settings" onClose={onClose}>
    <form className="form-stack" onSubmit={event => { event.preventDefault(); onSave(items) }}>
      <p className="input-hint">「控制 → 场景」按下列顺序显示已添加的场景。</p>
      <section className="focus-scene-block" aria-label="已添加的场景">
        <h3>已添加（{items.length} 个）</h3>
        {items.length === 0
          ? <p className="focus-scene-empty">还没有场景，先从下面添加一个。</p>
          : <ol className="focus-scene-list">
            {items.map((id, index) => {
              const option = sceneOption(id)
              const Icon = option.icon
              return <li key={id}>
                <span className="focus-scene-name"><Icon size={16} aria-hidden="true" />{option.label}</span>
                <span className="focus-scene-actions">
                  <Button type="button" variant="ghost" className="icon" aria-label={`上移${option.label}`}
                    disabled={index === 0} onClick={() => move(id, -1)}><ChevronUp size={16} /></Button>
                  <Button type="button" variant="ghost" className="icon" aria-label={`下移${option.label}`}
                    disabled={index === items.length - 1} onClick={() => move(id, 1)}><ChevronDown size={16} /></Button>
                  <Button type="button" variant="ghost" className="icon" aria-label={`移除${option.label}`}
                    onClick={() => remove(id)}><X size={16} /></Button>
                </span>
              </li>
            })}
          </ol>}
      </section>
      <section className="focus-scene-block" aria-label="可添加的场景">
        <h3>可添加</h3>
        {available.length === 0
          ? <p className="focus-scene-empty">所有场景都已添加。</p>
          : <div className="focus-scene-add">{available.map(option => {
            const Icon = option.icon
            return <Button type="button" key={option.id} variant="ghost" title={option.hint} onClick={() => add(option.id)}>
              <Plus size={14} aria-hidden="true" /><Icon size={16} aria-hidden="true" />{option.label}
            </Button>
          })}</div>}
      </section>
      <div className="actions">
        <Button type="button" variant="ghost" onClick={() => setItems(DEFAULT_SCENES)}><RotateCcw size={14} />恢复默认</Button>
        <Button type="button" onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" disabled={items.length === 0}>保存场景</Button>
      </div>
    </form>
  </Dialog>
}
