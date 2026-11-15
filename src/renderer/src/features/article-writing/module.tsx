import { TrendingUp } from 'lucide-react'
import { defineModule, lazyPage } from '../../modules/defineModule'

export default defineModule({
  id: 'article-writing',
  name: '热点追踪',
  icon: TrendingUp,
  group: '工具',
  order: 85,
  keywords: ['平台热点', '自媒体写作', '推文', '文章', '人文', '科学', '历史', 'AI 写作', '爆款', '热榜', '热搜', 'B 站', '视频分镜', '每日简报', 'AI Hot', 'AI热点', 'RSS', '新闻', '资讯', '日报', '简报'],
  page: lazyPage(() => import('./ArticleWritingPage'))
})
