import { CalendarHeart } from 'lucide-react'
import { defineModule, lazyPage } from '../../modules/defineModule'

export default defineModule({
  id: 'memories',
  name: '时间线',
  group: '记录',
  icon: CalendarHeart,
  order: 15,
  keywords: ['纪念时间线', '纪念日', '回忆', '照片', 'timeline'],
  page: lazyPage(() => import('./MemoriesPage'))
})
