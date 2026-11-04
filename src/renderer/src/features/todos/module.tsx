import { ListTodo } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function TodosPage() {
  return <div className="page"><h1>待办</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'todos', name: '待办', group: '记录', icon: ListTodo, order: 20,
  defaultPinned: true,
  page: TodosPage
})
