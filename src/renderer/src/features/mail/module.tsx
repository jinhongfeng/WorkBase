import { Mail } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function MailPage() {
  return <div className="page"><h1>邮件</h1><p className="page-description">此阶段仅提供导航入口，功能将在后续阶段开放。</p></div>
}

export default defineModule({
  id: 'mail', name: '邮件', group: '外部数据', icon: Mail, order: 30,
  defaultPinned: true, requires: 'mailAccount',
  page: MailPage
})
