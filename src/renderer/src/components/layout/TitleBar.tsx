import { Search } from 'lucide-react'
import { useNavigation } from '../../stores/navigation'
export function TitleBar() {
  return <header className="titlebar"><div className="wordmark"><span className="brand-mark">W</span><span>WorkBase</span></div><button className="title-search" onClick={() => useNavigation.getState().setCommand(true)}><Search size={14}/><span>搜索功能</span><kbd>Ctrl K</kbd></button><span className="local-label">本地工作台</span></header>
}
