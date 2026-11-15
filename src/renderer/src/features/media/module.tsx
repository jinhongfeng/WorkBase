import { Images } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'
import { MediaPage } from './MediaPage'

export default defineModule({
  id: 'media', name: '媒体库', group: '工具', icon: Images, order: 30,
  keywords: ['media', '媒体', '图片', '视频', 'image', 'video'],
  summary: async () => {
    const r = await window.api.media.list({ pageSize: 1 })
    return r.total ? `${r.total} 个媒体` : '还没有媒体'
  },
  page: MediaPage
})
