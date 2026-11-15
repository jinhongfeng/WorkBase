# 新增功能模块

1. 新建 `src/renderer/src/features/example/module.tsx`，只需这一个文件：

```tsx
import { Lightbulb } from 'lucide-react'
import { defineModule } from '../../modules/defineModule'

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
3. 模块自动出现在更多面板、命令面板与首页常用编辑区。固定后同时显示在侧栏与首页常用。

默认路径为 `/example`，默认可 pin，不显示列表面板，排序值为 100。
页面也可用 `lazyPage(() => import('./Page'))` 延迟加载。从 `defineModule.ts` 导入该函数，并在 `Page.tsx` 默认导出页面组件。
模块顶层不得发请求或读写存储。新分组会自动排在已有分组后。
删除模块文件并重启，残留 pin id 会静默忽略，不改写存储。

## 安装外部插件

在 WorkBase 中打开「更多 → 打开插件文件夹」。该路径位于当前数据目录的 `files/plugins/`。在其它位置准备好插件文件夹，然后整个移入，应用会自动发现。更新时替换文件夹或修改其中的文件，移除时把文件夹移出。复制大型插件时也可以先用以 `.` 开头的目录名，复制完成后再改名。

每个插件文件夹需要一个 `plugin.json`。例如 `{"id":"my-tool","name":"我的工具","entry":"index.html"}`。`id` 最长 63 位，以小写英文字母开头，后续可用小写字母、数字和短横线。不同插件须使用不同 ID。`entry` 可省略，默认 `index.html`，也可使用 `pages/index.html` 一类相对路径。

最小可运行的 `index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <meta charset="utf-8">
  <title>我的工具</title>
  <h1>我的工具</h1>
  <button type="button" onclick="this.textContent = '运行成功'">试一下</button>
</html>
```

插件会出现在「更多 → 插件」、命令面板和首页常用的可添加列表，可按现有规则固定到侧栏。入口 HTML 可以加载同一文件夹内的脚本、样式、图片及其它网页资源。插件在独立页面中离线运行，只能使用自己的网页存储和本地插件资源。
