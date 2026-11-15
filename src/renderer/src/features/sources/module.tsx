import { Database } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function SourcesPage() {
  return <div className="page"><h1>数据源</h1></div>
}

export default defineModule({
  id: 'sources', name: '数据源', group: '外部数据', icon: Database, order: 50,
  defaultPinned: false, hidden: true,
  page: SourcesPage
})
