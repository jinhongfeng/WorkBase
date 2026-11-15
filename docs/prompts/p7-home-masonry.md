读 docs/DESIGN.md、AGENTS.md 与 docs/CODEX-PLAN.md 第 2 节「已知陷阱」，然后完成本次定向改造。这是一次独立优化任务（不属于任何 P 阶段），只动首页布局相关代码，不要顺手重构其它模块。

## 背景

首页（src/renderer/src/features/dashboard/）卡片目前用 `.home-board` 两列 CSS Grid 按保存顺序自动排布：m 卡占 1 列、l 卡跨双列（见 dashboard.css 的 .home-card-m / .home-card-l）。问题：同一行的卡片行高强制对齐，矮卡片下方留下大片空白——用户截图 temp/p7-home-before.png 中「今日待办」右侧、「今日一记」下方有明显空洞。用户诉求：**可以自由配置各卡片的位置，且卡片之间不出现这类空隙**。

## 目标布局（双列瀑布流）

1. `.home-board` 改为双列 masonry：左、右两列各自独立堆叠，每张卡片紧贴同列上一张卡片，彻底消除行对齐产生的空隙。
2. 尺寸语义保留：m = 半宽（进入左列或右列），l = 跨双列全宽。l 卡按保存顺序出现在流中：它之前的窄卡片按列归属渲染成一段双列区，l 卡为全宽块，之后继续。
3. 窄卡片的列归属（左/右列）由用户决定：
   - 新增 settings key `ui.dashboard_card_cols`，值为 Record<cardKey, 'left' | 'right'>。
   - 读取旧数据（该 key 不存在）时的默认分配必须确定且视觉均衡：按保存顺序依次把窄卡片放入「当前累计张数更少的一列」，同数放左。
4. 编辑态（管理卡片）交互升级：
   - 保留现有拖拽排序、grip 上左右方向键移动、右下角缩放角标、移除按钮、底部「添加卡片」池，行为不回退。
   - 拖拽落点在某张窄卡片上 = 插入到该卡片之前，同时把被拖卡片的列归属改为目标卡片所在列；拖到 l 卡或空白区域 = 只调顺序、列归属不变。若实现中发现更自然的方案可自行斟酌，但硬性要求：用户能把任意窄卡片放到左列或右列，且结果持久化、重启后保持。
   - 编辑态的布局与保存后的展示态完全一致（所见即所得）。
5. 持久化与兼容：
   - `ui.dashboard_cards`（全局顺序数组）与 `ui.dashboard_card_sizes` 含义不变；`ui.dashboard_card_cols` 独立存储，三者一起在「完成」时保存。
   - 已下线/失效卡片的脏 key 静默过滤，沿用现有做法，不抛错、不自动改写存储。
   - 不修改任何 IPC 契约与主进程；settings:getAll / settings:set 已够用。
6. 各种组合下不溢出、不重叠：只有窄卡、只有 l 卡、单张卡、某列为空等；窗口 1080x700 与 1360x860 两档正常；≤800px 单列断点保留（窄卡片按顺序单列堆叠，忽略列归属）。
7. 浅色/深色主题下均正常；卡片高度动态变化（日记输入框拉伸、图表异步加载完成）时列堆叠自适应，不得出现重叠或错位。

## 实现提示

- 推荐两种方案任选：① 左右两个独立列栈（flex/grid）+ 全宽块顺序拼接；② CSS Grid 显式 gridRow span（用 ResizeObserver 量高换算行数）。不要引入新依赖，不要用第三方 masonry 库。
- 现有拖拽排序基于顺序数组插值（module.tsx 的 moveCard / moveCardBy），改造时保持键盘可达性与 data-testid="dashboard"。
- 注意 docs/CODEX-PLAN.md 陷阱 13：eager glob 下模块顶层不要有副作用；本任务只动 dashboard，不新增模块文件。

## 允许改动的文件

- src/renderer/src/features/dashboard/（module.tsx、CardShell.tsx、dashboard.css，必要时可新增 dashboard 目录内的子组件文件）
- src/renderer/src/modules/defineModule.ts（如需扩展类型）
- 其它文件一律不碰；不改迁移、不改主进程、不加依赖。

## 验证并在报告里贴出

1. pnpm typecheck、pnpm lint、pnpm build 输出摘要（必须 0 error）。
2. pnpm dev 启动后 CDP 截图（轮询确认卡片已渲染再拍，用 Emulation.setDeviceMetricsOverride 设画幅）：
   - temp/p7-dashboard.png（1360x860 展示态，无空隙）
   - temp/p7-dashboard-edit.png（编辑态）
3. 自测并描述结果：把「今日待办」拖到右列 → 完成 → 重启 → 位置与列保持；删掉 settings 里 ui.dashboard_card_cols 后重启 → 默认分配不报错且无空隙。
4. `rg "TODO|FIXME|console\.log|mock|placeholder" src/` 无新增命中。
