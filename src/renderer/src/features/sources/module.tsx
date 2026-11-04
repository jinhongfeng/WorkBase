import { Database } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function SourcesPage() {
  return <div className="page"><h1>数据源</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'sources', name: '数据源', group: '外部数据', icon: Database, order: 50,
  defaultPinned: false,
  page: SourcesPage
})
