# WorkBase 外部 UI 资源调研（2026-11-07）

仅调研与列举，未修改任何现有功能与代码。

## 0. 口径说明

「本功能」按 WorkBase 已交付的完整界面理解：三段式外壳（标题栏 46px / 侧栏 64–152px / 260px 列表面板 / 主内容区）+ 11 个可见模块。判定基准取 `docs/DESIGN.md` 第 7 节与 `styles/tokens.css` 实际值：雾白 `#EFF3F0`、松墨 `#0B0E0D`、边框 `#F0F4F2`、强调 `#2C5F52`、圆角 6–16px、动效 ≤180ms、无渐变噪点、组件样式以手写 CSS 为主。

匹配度分级：
- **A**：可直接用现有 token 复刻，不改架构。
- **B**：形态可用，需裁剪或改组件 API。
- **C**：与现有视觉规范冲突，仅保留原则或需要实验。

---

## 1. 主表：可借鉴组件

### 1.1 数据呈现

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| Stat Cards | boardui.com | 主数字 + 环比箭头 + 迷你折线，卡片内不再分层 | 首页「年度活动」「专注趋势」卡头 | 把散落的笔记数/学习时长/打卡数聚成一眼可读的一行 | A |
| Contributions | boardui.com | 7×N 小方块、5 级色阶、悬停出明细 | 首页年度活动（12 月 × 5 周段） | 比 12×5 自绘表格更贴近「逐日活跃」语义 | B |
| Bar List Card | boardui.com | 横向排行条 + 百分比 + 计数，无坐标轴 | 账单支出分类 Top10、交易对方 Top10 | 同类数值比较比环形图更准，呼应「聚合在仓储层完成」 | A |
| Data Table | boardui.com | 行高 40px、单线分隔、无斑马纹、列汇总行、状态徽标 | 账单明细（每页 50 条） | 汇总行与收支徽标直接表达方向与合计 | B |
| Combo Chart Card | boardui.com | 细线、无网格底纹、hover 十字准线 | 账单月度收支（支出柱 + 收入线） | 强化「连续六个月、缺月按零」的口径 | B |
| Activity Rings | boardui.com | 多环同心、环间留白、单色系 | 习惯连续天数、专注目标达成 | 单值目标比进度条更省横向空间 | B |
| Calendar | boardui.com | 月网格 + 事件点 + 今日描边 | 首页月历卡片、日记按日定位 | 事件点对应「当天有日记 / 有到期待办」 | A |
| Meter | heroui.com | 语义化 meter，`aria-valuetext`，阈值变色 | AI 上下文用量、账单导入进度 | 让「进度」对读屏可读，呼应长任务可见要求 | A |

### 1.2 列表与检索

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| SearchField | heroui.com | React Aria 行为层，内建清除、Esc 清空、快捷键提示位 | 命令面板、笔记搜索框 | 呼应「Ctrl K 覆盖全部可见模块」 | A |
| Kbd | heroui.com | 键帽、等宽字体、细边框 | 命令面板行尾、关于页快捷键表 | 把快捷键体系变成可扫读的视觉语言 | A |
| Pagination | heroui.com / ui.watermelon.sh | 页码 + 省略 + 首末页跳转 | 笔记列表（每页 100 条，可输入页码） | 万条笔记下的定位能力 | A |
| TagGroup | heroui.com | 可删除标签组，键盘可遍历 | 笔记标签（最多 12 个） | 把「逗号分隔文本」表达为可视化标签 | B |
| Hover List | scrolltide.co | 悬停项提亮、其余降透明 | 笔记/待办列表行 | 直接呼应「hover 才显示次要操作，减少常驻按钮噪声」 | A |
| Checklist | bencho.dev | 勾选 + 删除线 + 逐项过渡 | 待办完成态 | 保留 34×34 点击区，只改完成瞬间过渡 | B |
| Focus Reveal | scrolltide.co | 聚焦项背景压暗、内容提起 | 命令面板选中行、沉浸专注 | 呼应「同一时刻只做一件事」的专注叙事 | B |
| Rolling Counter | bencho.dev | 数字滚动到位 | 统计卡数值变化 | 让「数据刷新」被看见，需压到 180ms 内 | B |

### 1.3 表单与设置

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| Label Input | bencho.dev | 标签内联、聚焦上浮、错误占位预留 | AI 接口配置表单 | 比「label 上方一行」更省纵向空间，利于温度/最大 token 同行 | B |
| NumberField | heroui.com | 步进器 + 长按加速 + 范围钳制 | 轮播间隔（10–86400 秒）、蒙层（0–0.6） | 边界值直接可见，减少非法输入 | A |
| ColorSwatchPicker | heroui.com | 色板阵列 + 当前值描边 | 习惯图标颜色 | 替代单选下拉，呼应「图标 + 名称」 | B |
| Disclosure | heroui.com | 单项折叠 + 高度动画 | 设置「轮播与蒙层」预设展开 | 与「素材为空时可展开预设」一致 | A |
| Switch / Checkbox | ui.watermelon.sh | 状态明确、focus ring 可见 | 设置开关（轮播、跟随系统） | 呼应「开关仅在开启时显示下游设置」 | A |
| Segmented / Tabs | ui.watermelon.sh | 选中态用底色不用下划线 | 设置四页签、账单时间范围 | 与现有 `.segmented` 一致，可补 focus-visible | A |

### 1.4 反馈与状态

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| Toast / Toast Stack | heroui.com / bencho.dev | 右下堆叠、逐条消退、不遮主操作 | 现有 `.toasts` 升级 | 邮件同步、账单解析多阶段提示不互相覆盖 | A |
| Alert | heroui.com | 内联条，四态色 + 图标 + 可关闭 | 设置与账单页的持久提示（密钥缺失、ZIP 加密） | 比 toast 更适合需要停留阅读的错误 | A |
| ProgressCircle / Skeleton | heroui.com | 环 + 骨架微光 | 首屏卡片加载、AI 生成等待 | 现有 `.skeleton` 已接近，可统一微光周期 | A |
| Thinking Orbs | libraries.dev | 有机浮动球体，低饱和 | 仅 AI 等待态 | 比转圈更能表达「正在思考」，须压成单色否则与无渐变冲突 | C |

### 1.5 导航与浮层

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| Drawer / Sheet | heroui.com | 侧滑 + 焦点陷阱 + Esc 关闭 + 遮罩 | 更多面板（320px 浮层） | 现有浮层缺焦点陷阱与 `aria-modal`，行为层可直接借 | A |
| Morph Navbar | scrolltide.co | 选中标记在项间连续滑动 | 侧栏选中态（2px 竖条 + accent-soft） | 让「当前在哪个模块」在切换时连续可见 | B |
| Navbar 分组 + 搜索（Velt / Cloudflare / Browserbase 案例） | navbar.gallery | 分组标题、搜索置顶、当前项指示 | 更多面板的分组结构 | 呼应「分组顺序由 groups.ts 决定，未知分组排末尾」 | B |
| Breadcrumbs | heroui.com | 层级路径 | 设置子分区 | 桌面端非必需，价值低 | C |

### 1.6 媒体、导入与营销区块迁移

| 组件名称 | 来源 | 风格特征 | 适用场景 | 衬托的功能特点 | 匹配度 |
|---|---|---|---|---|---|
| Upload Dropzone | bencho.dev | 拖拽高亮 + 类型/大小提示 | Skill 导入、媒体库添加 | 直接表达「ZIP / 目录 / Markdown 三种导入 + 拖拽」 | A |
| Image Compare | bencho.dev | 拖动分割对比 | 壁纸预览（原图 vs 蒙层后） | 让 0–0.6 蒙层的效果可被看见 | B |
| Media Gallery | scrolltide.co | 网格 + 懒加载 + 视频占位 | 媒体库栅格 | 现有实现已接近，可借视频占位与加载顺序 | B |
| Footer（Tactile UI / Nothin' / Decimals） | footer.design | 单行极简、字号降一级、无分隔线 | 设置「关于与快捷键」页底部 | 版本号 + 数据目录路径的低调收尾 | B |
| CTA（单一主操作 + 次级文字链） | cta.gallery | 一主一次、按钮等高 34px | 空状态主操作、未配置 AI 的引导区 | 强化「空状态一句文案 + 一个主按钮」 | A（作原则） |
| Border beam / Liquid Metal / Gooey | libraries.dev | 发光描边、液体金属、粘连变形 | 无 | 与「无渐变噪点、细边框、克制」直接冲突 | C |
| Mesh / Swirl / Halftone Shaders | scrolltide.co | GPU 全屏渐变 | 无（壁纸已覆盖背景层） | 违反无渐变约束，不采用 | C |

---

## 2. 来源站点评估

| 站点 | 实测规模 | 定位 | 匹配度 | 用法建议 |
|---|---|---|---|---|
| boardui.com | 96 组件（首页标 103，含 19 图表）+ 400+ token | 仪表盘设计系统 | 高 | 抄卡片切分、行高、列汇总与 token 命名，不引依赖 |
| bencho.dev | 约 40 个微交互块 | 交互块库 | 中高 | 只取 Toast Stack、Dropzone、Label Input、Checklist、Stacked Bars |
| heroui.com | 80+ 组件，React Aria + Tailwind v4 | 无障碍原语 | 高（行为层） | 借 aria 契约与状态机，不换样式体系 |
| pro.beui.dev | 358 块（226 动画 / 48 页面 / 40 插图 / 33 组件 / 11 模板），付费 | 营销页块 | 中低 | 只取动效方法论：共享 easing、transform-only、reduced-motion |
| libraries.dev | 5 个库（Beam / Orbs / Gooey / Metal / Image） | 视觉效果库 | 低 | 仅 Thinking Orbs 可作 AI 等待态实验 |
| ui.watermelon.sh | 600+ 组件 / 30 类 | 基础组件 copy-paste | 中 | 取 Tabs、Switch、Number Input 的状态样式 |
| scrolltide.co | 140 模板 + 75 组件 + 55 shader + 22 区块 | 滚动驱动营销站 | 低—中 | 取 Hover List / Focus Reveal 的动效曲线 |
| navbar.gallery | 550+ 案例 | 导航画廊 | 低 | 取信息架构，不取视觉 |
| footer.design | 编辑精选，可按类型/风格排序 | 页脚画廊 | 低 | 仅用于「关于」页收尾 |
| cta.gallery | 按行业筛选 | CTA 画廊 | 中（原则） | 单一主操作原则用于空状态 |
| styles.refero.design | 2000+ 可读 DESIGN.md 设计系统 | 真实产品风格 | 高 | 读 Superhuman / Ramp / Reflect / Steep / Vercel，对照本文档 token |

数据核对：需求里写 scrolltide「600+ 设计提示、200+ 组件」，站点实际为 140 模板 / 75 组件 / 55 shader / 22 区块，合计 292 项。boardui 首页称 103 组件，组件页实列 96。

---

## 3. 落地建议

### 3.1 界面（视觉语言）

1. 数字排版统一 `font-variant-numeric: tabular-nums`，单位降一级字号与 `--text-3`；现有 `.num` 只用在局部，建议推广到所有统计与账单金额。
2. 图表去网格线与描边，只留一条基线；颜色收敛为 `--accent` / `--accent-2` / `--accent-3` + 灰阶，与 token 一一对应。
3. 卡片头部固定为「12.5px 600 标题 + 右侧单值/环比 + 18px 内边距」，说明文字降到 11.5px `--text-3`，避免同一卡内三种字号混排。
4. 空态维持「一句文案 + 一个主按钮 + 一个文字链」，取 cta.gallery 的一主一次结构，不加插画。
5. 不引入任何新的发光、渐变、毛玻璃元素；壁纸相关模糊只发生在 `layout.css` 的背景层。

### 3.2 组件缺口

按现有 `components/ui/` 只有 12 个组件盘点，缺以下六项，优先级从高到低：

| 缺口 | 依据 | 建议来源 |
|---|---|---|
| Alert 内联提示条 | 现有错误只能进 toast，停留阅读场景缺失 | heroui Alert |
| Toast 队列（上限 + 去重） | 现 `.toasts` 无上限，邮件同步多阶段会堆叠溢出 | bencho Toast Stack |
| Meter 语义进度 | 进度只有 spinner 与进度环，无读屏文本 | heroui Meter |
| NumberField 步进 | 间隔/蒙层靠手输数字，非法值靠校验兜底 | heroui NumberField |
| Kbd 键帽 | 快捷键目前是纯文本 | heroui Kbd |
| 浮层焦点陷阱 | 更多面板/对话框的键盘约束需逐项确认 | heroui Drawer 行为契约 |

### 3.3 布局

1. 账单明细：40px 行高、数字右对齐、汇总行贴底、收支徽标占一列，避免金额带正负号时对齐漂移。
2. 首页统计卡：内部按「主数字左上 / 迷你图右下」1:1 分区，不做卡片套卡片。
3. 设置页：分组之间用 `hairline` 分隔而非卡片，「关于」页底部用 footer.design 的单行收尾。
4. 更多面板：搜索置顶 + 分组标题，保持 320px 与现有 12px 偏移不变。
5. 列表：hover 显出次要操作（已实现），补 `focus-visible` 与键盘可达，不新增常驻按钮。

### 3.4 硬约束（调研结论中的否决项）

1. **不引入任何新依赖**。HeroUI、Watermelon、beUI 都会替换「手写 CSS 为主」的样式体系，且 HeroUI 依赖 Tailwind v4 运行时约定；boardui 的 19 种图表属「图表二次封装库」，在禁止清单内。所有借鉴限于形态、间距、状态机与 token 命名。
2. 所有新增样式必须走 `tokens.css`，禁止硬编码色值。
3. 动效一律 ≤180ms `ease-out`，beui 的 spring physics 不采用。
4. 若要做标签组并落库，需新增 `012_*.sql`，不得改动已执行迁移。

---

## 4. 若「本功能」特指账单页（当前迭代对象）

按 `features/bills` 现状（收支概览 + 分类环形图 + 交易对方 Top10 + 明细表 50 条/页 + 邮箱获取/手动导入）裁剪的短表：

| 组件 | 来源 | 用法 | 对账单页的作用 |
|---|---|---|---|
| Bar List Card | boardui.com | 与现有环形图并置，右侧按金额降序 | 小占比类别在环形图里不可读，条形列表可读可排 |
| Data Table + 列汇总 | boardui.com | 明细表贴底汇总行、数字列右对齐 | 让「范围内支出合计」不必回到概览区 |
| Segmented | ui.watermelon.sh | 时间范围（全部/3·6·12 月/今年/去年） | 与现有 `.segmented` 一致，仅补 focus-visible，不改成日期选择器 |
| Meter + 阶段名 | heroui.com | 导入/同步进度条 + `phase` 中文阶段名 | 复用已有 `<domain>:progress`，把「解压/解析/去重」显性化 |
| Alert | heroui.com | ZIP 加密、密码错误、非支付宝 CSV | 这三类错误需要停留阅读并重试，toast 会消失 |
| Upload Dropzone | bencho.dev | 手动导入区（CSV / ZIP） | 与「先选文件再要密码」的流程对齐，拖拽与点选同入口 |
| Stat Cards | boardui.com | 本月收入 / 本月支出 / 环比 | 三项并列，环比在右，缺上月时不显示百分比 |

账单页的三条优先动作：

1. 环形图旁补条形排行，解决小占比不可读（改动限于 `bills.css` 与图表容器）。
2. 明细表加汇总行与收支徽标列，金额统一 `tabular-nums` 右对齐。
3. 导入三段进度用 Meter 替换纯文字，错误从 toast 换成内联 Alert。

## 5. 本次范围外

未修改 `src/`、`docs/`、迁移文件与依赖；未运行构建与打包。以上为纯调研结论。
