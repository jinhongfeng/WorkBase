import { KeyRound } from 'lucide-react'
import { defineModule, lazyPage } from '../../modules/defineModule'

export default defineModule({
  id: 'vault',
  name: '密码库',
  group: '工具',
  icon: KeyRound,
  defaultPinned: true,
  keywords: ['账号', '密码', '登录', '自动填充'],
  page: lazyPage(() => import('./VaultPage'))
})
