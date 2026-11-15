import { Settings } from 'lucide-react'
import { defineModule, lazyPage } from '../../modules/defineModule'

export default defineModule({
  id: 'settings',
  name: '设置',
  icon: Settings,
  group: '工具',
  role: 'settings',
  pinnable: false,
  keywords: ['外观', '壁纸', '主题', '备份', '快捷键', 'AI 接口'],
  page: lazyPage(async () => ({ default: (await import('./SettingsPage')).SettingsPage }))
})
