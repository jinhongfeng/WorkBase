import { NotebookPen } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function NotesPage() {
  return <div className="page"><h1>笔记</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'notes', name: '笔记', group: '记录', icon: NotebookPen, order: 10,
  defaultPinned: true,
  page: NotesPage
})
