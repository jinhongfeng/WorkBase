import { Wallet } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function BillsPage() {
  return <div className="page"><h1>账单</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'bills', name: '账单', group: '外部数据', icon: Wallet, order: 40,
  defaultPinned: true, requires: 'mailAccount',
  page: BillsPage
})
