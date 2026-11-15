import { Puzzle } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function DemoPage() {
  return <div className="page"><h1>演示模块</h1></div>
}

export default defineModule({
  id: 'demo', name: '演示模块', group: '工具', icon: Puzzle, order: 900,
  defaultPinned: false, hidden: true,
  page: DemoPage
})
