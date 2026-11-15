import { Search } from 'lucide-react'
import appIcon from '../../../../../resources/icon.ico'
import { useNavigation } from '../../stores/navigation'
import { useShortcuts } from '../../stores/shortcuts'

export function TitleBar() {
  const commandKey = useShortcuts(state => state.map.command ?? 'f').toUpperCase()
  const setCommand = useNavigation(state => state.setCommand)

  return (
    <header className="titlebar">
      <div className="titlebar-inner">
        <div className="titlebar-drag">
          <div className="titlebar-brand">
            <img className="brand-mark" src={appIcon} alt="WorkBase" draggable={false} width={24} height={24} />
            <span className="brand-name" aria-hidden="true">WorkBase</span>
          </div>
        </div>
        <button
          className="titlebar-search"
          type="button"
          aria-label="搜索功能与笔记"
          aria-haspopup="dialog"
          aria-keyshortcuts={`Control+${commandKey}`}
          onClick={() => setCommand(true)}
        >
          <Search size={16} aria-hidden="true" />
          <span>搜索</span>
          <kbd aria-hidden="true">Ctrl {commandKey}</kbd>
        </button>
      </div>
    </header>
  )
}
