import { Puzzle } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function DemoPage() {
  return <div className="page"><h1>演示模块</h1><p className="page-description">这个入口仅由一个 module.tsx 文件自动发现，可在更多面板中加入常用。</p></div>
}

export default defineModule({
  id: 'demo', name: '演示模块', group: '工具', icon: Puzzle, order: 900,
  defaultPinned: false,
  page: DemoPage
})
