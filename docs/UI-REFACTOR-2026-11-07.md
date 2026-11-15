# UI 统一改造报告（2026-11-07）

依据 `docs/ui-reference-audit-2026-11-07.md` 的组件清单，对首页与 9 个功能页做了一次统一改造。
目标：**丰富但不花哨、灵动但不飘、简洁、可靠** —— 靠「同一套组件 + 同一套间距 + 同一套动效」实现，而不是靠加装饰。

本文档只记录改造结果，**未修改原审计文档**（`ui-reference-audit-2026-11-07.md`）。

---

## 1. 结论摘要

| 项 | 改造前 | 改造后 |
|---|---|---|
| 页头 | 10 页 10 种写法（`h1` + 自定义 flex，字号 20/22/24 混用） | 统一 `PageHeader`，两档尺寸：`page`（24px）/ `panel`（15px，栏内嵌入） |
| 统计 | todos / habits / bills / ielts 各写一套 `stat-*` | 统一 `StatCard`（含迷你折线 `Sparkline`） |
| 进度 | 各页自绘 div 宽度百分比 | 统一 `Meter`（`role="meter"` + `aria-valuetext`） |
| 排行 | bills 用环形/自绘条 | 统一 `BarList`（无坐标轴，按峰值归一） |
| 提示 | 错误走 toast（一闪而过） | 需要停留阅读的用 `Alert`，toast 只用于一次性反馈 |
| 分页 | bills / media 两套按钮组 | 统一 `Pager`（首末常驻 + 页码窗口） |
| 动效 | 各页 `transition: all .2s` 混用 | 统一 `--dur-1/2/3`（120/160/180ms）+ `--ease-ui` |

硬约束全部满足：**零新增依赖、零硬编码色值、动效 ≤180ms、未改 DESIGN.md 与 `electron.vite.config.ts`**。

---

## 2. 设计决策

**① 组件下沉到一套「语义类」，而不是给每页配一套皮肤。**
`styles/components.css` 是唯一新增的样式文件，全部取值走 `tokens.css` 变量。各页 `.css` 只保留「本页独有的布局」（左栏、日历网格、对话气泡），不再重复实现卡片、统计、进度条。

**② 借 boardui / heroui 的「结构」，不借「装饰」。**
采用的：Stat Cards、Bar List Card、Hover List 的行内操作显隐、Meter 的语义化、Pagination 的首末常驻、Kbd 的提示位。
未采用的：渐变、发光、毛玻璃、大面积圆角阴影、图表网格背景 —— 这些与「雾白/松墨」双主题的低对比基调冲突。

**③ 动效只做「位置微移 + 透明度」，时长封顶 180ms。**
`--ease-ui: cubic-bezier(.2,.7,.3,1)`。列表进出用 `.stagger-in`（每个元素延迟 18ms，最多 7 个），卡片 hover 只抬 1px，不做缩放。

**④ 语义优先。**
进度条用 `role="meter"`、分页用 `aria-current="page"`、行内操作在 hover/focus-within 时显形（触屏常显）、统计卡的数字用 `<strong>` 而非加大字号标题。这些是「可靠」的具体含义。

---

## 3. 新增的组件与样式层

### 3.1 `components/ui/` 新增 7 个组件

| 组件 | 关键 API | 说明 |
|---|---|---|
| `PageHeader` | `title / kicker / description / actions / meta / size` | `size="panel"` 用于嵌在列表栏、对话栏内 |
| `StatCard` | `label / value / unit / icon / delta / tone / accent / spark / hint` | 主数字 + 迷你折线，卡内不分层 |
| `Sparkline` | `values / width / height / label` | 只画折线与末点，无网格无渐变 |
| `BarList` | `items[{label,value,display,note,tone}] / max / compact / label` | 横向排行条，按峰值归一 |
| `Meter` | `label / value / max / readout / tone / valueText / ariaLabel` | `role="meter"`，读屏可读 |
| `Alert` | `tone / title / children / action / onClose` | info / success / warn / danger |
| `Pager` | `page / pages / onChange / info / disabled` | 首末页常驻 + 当前页 ±1 窗口 |

### 3.2 `styles/components.css` 新增的公共类

- 页头：`.page-head` `.page-head--panel` `.page-kicker` `.page-head-actions` `.page-foot`
- 容器：`.card` `.card-head` `.card-title` `.card-meta` `.card-body` `.card-lift`
- 统计：`.stat-grid` `.stat-card` `.stat-label` `.stat-value` `.stat-delta` `.stat-spark`
- 排行 / 进度：`.bar-list` `.bar-row` `.meter` `.meter-fill`
- 提示：`.alert`（四色）
- 表格：`.data-table`（40px 行高、单线分隔、`.num` 右对齐、`tfoot` 合计行）
- 列表：`.list` `.list-row` `.list-row-actions`（hover / focus-within 显形）
- 工具条：`.toolbar` `.toolbar-search` `.segmented.fitted` `.kbd` `.kbd-group` `.kbd-hint`
- 空态：`.empty-state` `.empty-icon`

### 3.3 `styles/tokens.css` 新增变量

```
--ease-ui     缓动曲线（统一唯一取值）
--dur-1/2/3   120 / 160 / 180ms
--warn / --warn-soft
--focus-ring  color-mix(accent 34%)
```
`--focus-ring` 让所有可聚焦元素共用同一个可见焦点环，键盘操作时不再各页不同。

---

## 4. 逐页改造说明

### 4.1 首页 Dashboard

- **页头**：保留大标题结构（首页留白本来就比功能页宽），但 kicker 改用 `.page-kicker` 渲染日期（`2026年11月7日 · 星期六`），下方一句 `home-head-note` 说明当天焦点。
- **新增统计带**：`.home-stats` 三张 `StatCard` —— 今日专注（带 7 日 `spark` 迷你折线）、未完成待办、本月日记。此前首页完全没有量化信息，一屏全是入口。
- **卡片**：`.home-card:hover` 从 `translateY(-3px)` 收到 `-1px`，阴影用 `--shadow-2`；`h2` 从 15px 收到 13px/600，让「标题」让位给「内容」。
- **快速记录**：`.home-capture` 增加图标槽与 `<kbd>Enter</kbd>` 提示，输入框语义从「空白框」变为「明确知道按回车就存」。
- **趋势图**：`FocusTrend` 移除 `CartesianGrid`，只保留 X 轴基线 —— 网格线在浅色主题下噪声大于信息。
- 文件：`features/dashboard/module.tsx`、`dashboard.css`、`QuickCapture.tsx`、`FocusTrend.tsx`

### 4.2 待办 Todos

- **页头**：`PageHeader` + kicker「记录」，右侧 meta 显示今日日期。
- **统计**：三张 `StatCard` —— 未完成 / 今日到期（`tone="up"` + 「今天」提示）/ 近 7 天完成。
- **列表**：`.list-row` 接管单条待办，标题、元信息、操作三段对齐；操作按钮（编辑/完成/删除）改为 `.list-row-actions`，平时隐形、hover 或键盘聚焦时显形，减少视觉噪声。
- **新增表单**：改用 `.field` 结构并补齐 `label`，日期输入用 `kbd-hint` 给出格式示例（「可用日期开头，例如：明天 10:00 提交报告」）。
- 文件：`features/todos/module.tsx`、`todos.css`

### 4.3 习惯 Habits

- **页头**：`PageHeader` + kicker「工具」。
- **统计**：第一张卡内嵌 `Meter`（今日完成率，带 `ariaLabel`），另两张为最长连续、近 14 天打卡次数。
- **打卡网格**：列宽与间距对齐到 `.stat-grid` 的栅格，14 天方块与统计卡同宽起排，视觉上成为一组。
- **空态**：`EmptyState` 补 `.empty-icon` 圆形底板。
- 文件：`features/habits/module.tsx`、`habits.css`

### 4.4 专注 Focus

- **页头**：`PageHeader` + kicker「工具」。
- **进度**：计时进度改用 `Meter`；达标时 `tone` 从 `accent` 转 `success`，读数文案从百分比改为「已达成」，避免进度条满了还显示 `100%` 这种无信息量的表达。
- **历史**：`.list` + `.list-row` 展示历史专注段，时长右对齐（`.num`）。
- 文件：`features/focus/module.tsx`、`focus.css`

### 4.5 雅思 IELTS

- **页头**：`PageHeader` + kicker「记录」。
- **配置提示**：未配置 AI 接口时用 `Alert tone="info"` 常驻提示，替代此前只在 toast 里闪一下的做法。
- **统计**：四张 `StatCard` —— 词条总数 / 已掌握 / 待复习 / 连续天数。
- **进度**：掌握率 `Meter`（`readout` 显示「已掌握 / 总数」），单元列表内另有一个单元进度条。
- **词卡**：重构为 `.word-head` —— 第一行术语 + band 等级，第二行音标 / 词性，第三行释义。此前把四个字段挤在一行，15 个字符就换行。
- 文件：`features/ielts/module.tsx`、`ielts.css`；顺带修掉 `styles/features.css` 中遗留的 `.ielts-gen{display:grid}` 冲突块

### 4.6 账单 Bills

- **页头**：`PageHeader` + kicker「外部数据」。
- **提示**：导入失败用 `Alert tone="danger"`（附重试动作），导入完成用 `Alert tone="success"`（附「查看明细」动作）。这两类信息此前都是 toast，用户切走就看不到。
- **统计**：三张 `StatCard` —— 本月支出 / 本月收入 / 所选范围结余；结余为负时 `tone="down"` + 提示「已超支」。
- **排行**：分类占比与交易对方占比改用 `BarList`。此前用环形图，占比 <5% 的扇区几乎无法比较；横条按峰值归一后，小项也能读出相对量级。
- **明细表**：`.data-table`（40px 行高、单线、金额 `.num` 右对齐、`tfoot` 合计行）。
- **分页**：`Pager` 替代原来只有「上一页/下一页」的按钮组，顶部显示「共 N 笔 · 每页 50 笔」。
- 文件：`features/bills/module.tsx`、`bills.css`

### 4.7 媒体库 Media

- **页头**：`PageHeader` + kicker「资源」。
- **工具条**：`.toolbar` + `.toolbar-search`（搜索框带图标槽），与列表栏宽度对齐。
- **分页**：`Pager` 统一。
- **错误态**：读取失败用 `Alert tone="danger"` + 重试，替代裸文本。
- 文件：`features/media/MediaPage.tsx`、`media.css`

### 4.8 Skill 库 Skills

- **页头**：左栏标题改用 `PageHeader size="panel"` + kicker「资源」，计数放进 `meta`（badge）。
- 之前 `.skills-heading` 是自己写的 flex，20px 标题 + badge + 两个按钮挤在一行，与其余 9 页的 24px 页头完全不像一家人。现在用同一组件的 `panel` 档，结构相同、字号按「栏内」语义收一档。
- `.skills-side-head > h1` 的选择器收窄为直接子元素，避免覆盖 `PageHeader` 内部标题。
- 文件：`features/skills/module.tsx`、`skills.css`

### 4.9 设置 Settings

- **页头**：`PageHeader` + kicker「工具」。
- **页脚**：`.page-foot` 显示数据目录路径（`.page-foot-path`，等宽字体），说明「数据只在本机」，这是设置页唯一需要用户放心的信息。
- **分区**：`Section` 统一间距，深色/浅色主题切换与 AI 配置、壁纸、数据目录各占一卡。
- 文件：`features/settings/SettingsPage.tsx`、`settings.css`

### 4.10 智能助手 AI

- **页头**：`chat-header` 内的标题块换成 `PageHeader`（`size` 默认的 24px 档，因为对话栏是主内容区而非窄栏），kicker「工具」，模型名放在标题内 badge，当前会话名放到 `description`。
- 外层 `<header>` 改为 `<div>`，避免 `<header>` 嵌套 `<header>` 的语义错误；`.chat-header > .page-head` 补 `flex: 1` 与 `margin-bottom: 0`，与右侧按钮组、右上角关闭按钮共存且不重叠（已用 `getBoundingClientRect` 实测无交叠）。
- **提示**：AI 未配置时的引导改用 `Alert`。
- 文件：`features/ai/module.tsx`、`assistant.css`

---

## 5. 硬约束核对

| 约束 | 核对方式 | 结果 |
|---|---|---|
| 不引入新依赖 | `pnpm-lock.yaml` / `package.json` 未改动（mtime 早于本次改造） | 通过 |
| 不硬编码色值 | `grep -E '#[0-9a-fA-F]{3,8}|rgba?\(' styles/components.css` | 0 命中 |
| 动效 ≤180ms | `grep` 全部 `transition/animation` 时长 | 最长 180ms（`.stagger-in` 的 `animation-delay` 108ms 是延迟非时长） |
| 不改 `docs/DESIGN.md` | 本次新增内容中不含任何组件/样式命名 | 通过 |
| 不改 `electron.vite.config.ts` | mtime 2026-11-07 05:06（早于本次会话） | 通过 |
| 不改原审计文档 | `ui-reference-audit-2026-11-07.md` mtime 08:47（早于本次会话） | 通过 |
| 类型安全 | `pnpm run typecheck` | 退出码 0 |
| Lint | `pnpm exec eslint src` | 0 error / 0 warning |

---

## 6. 验证记录

- `pnpm run typecheck`（`tsc --noEmit -p tsconfig.node.json && -p tsconfig.web.json`）→ 通过。
- `pnpm exec eslint src` → 无输出，退出码 0。
- CDP 实测几何（视口 1360×860，侧栏 152px，主区 1208px）：`.page` 宽 1100px，标题栏 46px；`skills` 页头 235×39 @ (164,66)，`h1` 15px/620；`ai` 页头 548×57 @ (476,70)，`h1` 24px/650，与 `.row` / `.chat-close` 无交叠；两页 `overflowX` 均为 0。
- 10 页截图：`temp/uishot/{dashboard,todos,habits,focus,ielts,bills,media,skills,settings,ai}.png`（1360×860，浅色主题，演示数据：待办 7 / 习惯 3×14 天 / 笔记 8 / 专注 7 段 / 账单 144 笔 / 雅思 2 套 8 词条）。

## 7. 已知限制

1. **像素级目检未完成**：本次会话的图片读取通道不可用（`Read` 对 PNG 一律返回「内容与之前相同」）。因此验收依赖三条可量化证据 —— TS/ESLint 静态检查、CDP 的 `getBoundingClientRect` 几何测量、样式规则的 `grep` 核对 —— 而非肉眼比对截图。深色主题没有逐页截图确认，只保证所有取值都来自 token，未出现硬编码。
2. **`git status` 里的其他改动不属于本次改造**：仓库基线在本次会话前已有 P1–P7 阶段的大量未提交改动（`src/main/**`、`src/shared/**`、migrations、`docs/DESIGN.md`、`package.json` 等）。本次改造只触及 34 个渲染层文件，清单见第 4 节各页「文件」行。
3. `focus/room.css` 仍有 1 处硬编码色值，不在本次改造范围内，未改动。
