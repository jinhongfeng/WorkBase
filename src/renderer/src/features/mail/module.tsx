import { Mail } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

function MailPage() {
  return <div className="page"><h1>邮件</h1></div>
}

export default defineModule({
  id: 'mail', name: '邮件', group: '外部数据', icon: Mail, order: 30,
  defaultPinned: false, requires: 'mailAccount', hidden: true,
  page: MailPage
})
