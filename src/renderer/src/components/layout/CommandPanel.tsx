import { useEffect, useState } from 'react'
import { registry } from '../../modules/registry'
import { useNavigation } from '../../stores/navigation'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
export function CommandPanel() {
  const { command, setCommand, navigate } = useNavigation()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  useEffect(() => { if (command) { setQuery(''); setIndex(0) } }, [command])
  const matches = registry.filter(module => module.name.toLowerCase().includes(query.toLowerCase()) || module.id.toLowerCase().includes(query.toLowerCase()))
  return <Dialog open={command} title="切换功能" onClose={() => setCommand(false)}><Input autoFocus aria-label="搜索全部模块" placeholder="输入功能名称…" value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }} onKeyDown={event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(value => Math.min(value + 1, matches.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(value => Math.max(value - 1, 0)) }
    if (event.key === 'Enter' && matches[index]) navigate(matches[index].path || '/' + matches[index].id)
  }}/><div className="command-results">{matches.map((module, position) => <button key={module.id} className={`command-row ${position === index ? 'highlighted' : ''}`} onClick={() => navigate(module.path || '/' + module.id)}><module.icon size={18}/><span>{module.name}</span><small>{module.group}</small></button>)}{!matches.length && <p>没有匹配的功能</p>}</div><small className="muted">↑ ↓ 选择 · Enter 打开 · Esc 关闭</small></Dialog>
}
