# 新增功能模块

1. 新建 `src/renderer/src/features/example/module.tsx`，只需这一个文件：

```tsx
import { Lightbulb } from 'lucide-react'
import { defineModule, lazyPage } from '../../modules/defineModule'

function ExamplePage() {
  return <div className="page"><h1>示例功能</h1></div>
}

export default defineModule({
  id: 'example',
  name: '示例功能',
  icon: Lightbulb,
  group: '工具',
  page: ExamplePage
})
```

2. 重启 dev server（`pnpm dev`），让 Vite 重新扫描 glob。
3. 模块自动出现在更多面板与命令面板，可 pin 到侧栏与首页。

默认路径为 `/example`，默认可 pin，不显示列表面板，排序值为 100。
页面也可写成 `page: lazyPage(() => import('./Page'))`，由 React.lazy 加载。
模块顶层不得发请求或读写存储。新分组会自动排在已有分组后。
删除模块文件并重启，残留 pin id 会静默忽略，不改写存储。
