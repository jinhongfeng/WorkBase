import { Sparkles } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function AiPage() {
  return <div className="page"><h1>智能助手</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'ai', role: 'assistant', name: '智能助手', group: '工具', icon: Sparkles, order: 60,
  defaultPinned: false, requires: 'aiConfig',
  page: AiPage
})
