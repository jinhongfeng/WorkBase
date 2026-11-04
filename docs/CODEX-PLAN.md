# codex 协作计划与阶段提示词

分工：**codex 只写实现，审批方（我）只写规范、执行审批、起草返工指令**。任何一方都不越过 `docs/DESIGN.md`。

## 0. 协作机制

### 执行命令模板

```bash
cd /e/vibecoding/workbase
codex exec -C "E:/vibecoding/workbase" -s workspace-write --skip-git-repo-check \
  -o "temp/codex-p<N>-last.txt" "$(cat docs/prompts/p<N>.md)"
```

- `-s workspace-write`：允许在项目目录内读写与执行命令，不放开全盘。
- `-o`：把 codex 的最终报告落盘，便于逐条核对。
- 单阶段超时或中断 → 用 `codex exec resume --last` 续跑，不要从头重发提示词。

### 审批闭环

```
提示词 → codex 实现 → 审批（6 项）→ 通过：commit + 打 tag + 下一阶段
                              └→ 不通过：原因写进 temp/rework-pN.md → codex 定向返工（≤2 轮）→ 仍不过：人工介入
```

### 审批 6 项（每阶段都跑）

| # | 检查 | 手段 |
|---|---|---|
| 1 | 编译与类型 | `pnpm typecheck && pnpm lint && pnpm build` |
| 2 | 安全边界 | 读 `src/main/window.ts`，核对 DESIGN 第 3 节四项；`rg "nodeIntegration\|contextIsolation\|sandbox"` |
| 3 | 契约一致性 | 读 `src/shared/ipc-contract.ts` 与仓库实现，核对通道名/入参是否与 DESIGN 第 6 节一致 |
| 4 | 越界改动 | `git diff --stat`，对照本阶段允许的文件清单，文件数明显超出即打回 |
| 5 | 真实运行 | 启动应用 → CDP 截图 → 按阶段 DoD 手测路径 |
| 6 | 脏东西 | `rg "TODO\|FIXME\|console\.log\|mock\|placeholder" src/`，以及硬编码密钥 |

### 返工模板（`temp/rework-pN.md`）

```
上一轮未通过验收，只修下列问题，不要改动其它文件，不要顺手重构。

问题 1：<现象一句话>
- 复现：<命令或点击路径>
- 期望：<DESIGN.md 第 X 节的具体要求>
- 实际：<报错原文 / 文件:行号 / 截图路径>
- 定位建议：<我读代码后的判断，例如 src/main/db/index.ts:42 未开 WAL>

问题 2：...

修完必须重跑：pnpm typecheck && pnpm build，并在报告里贴出结果与改动文件清单。
```

## 1. 阶段划分

| 阶段 | 交付 | 迁移文件 | 通过后 |
|---|---|---|---|
| P0 骨架与导航 | 可运行外壳、模块注册表、常用/更多导航、设计系统、能出 exe | `001_init.sql` | tag `p0` |
| P1 笔记与待办 | 记录核心 + 全局搜索 | 无（复用 001） | tag `p1` |
| P2 邮件 | IMAP 同步 + 列表详情 + 四组图表 | `002_mail.sql` | tag `p2` |
| P3 支付宝账单 | 邮箱一键获取 + 解析去重 + 账单统计 | `003_bills.sql` | tag `p3` |
| P4 AI 与数据源 | 流式对话 + 上下文动作 + RSS/JSON | `004_ai.sql`、`005_sources.sql` | tag `p4` |
| P5 打磨与发布 | 快捷键、空态、暗色、备份、安装包 | 无 | tag `v1.0.0` |

**迁移归属已成定稿**：每阶段只新增本阶段的文件，禁止把后续阶段的表提前塞进 `001_init.sql`，也禁止修改已执行过的迁移。

每个阶段结束我只验收当阶段，**不做跨阶段提前优化**。

---

## P0 — 骨架、模块注册表与导航

```markdown
读 docs/DESIGN.md 全文（尤其第 4、5、7 节）与 AGENTS.md，然后只完成 P0。

目标：能启动、能建库、能打包的干净骨架；导航由模块注册表驱动，常用与更多两种入口可用；不实现业务功能。

1. 工程初始化
- pnpm init；.gitignore（node_modules, dist, out, temp, *.db, .env, logs）
- git init 并提交初始 commit
- 安装依赖（pnpm，不要 npm）：electron、electron-vite、electron-builder、vite、
  react、react-dom、typescript、@types/react、@types/react-dom、@types/node、
  tailwindcss、@tailwindcss/vite、zustand、recharts、lucide-react、motion、date-fns、
  better-sqlite3、@types/better-sqlite3、zod
- 超时则设镜像重试：
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
- 安装完执行 electron-builder install-app-deps（确保 better-sqlite3 ABI 匹配 electron），
  把实际解析到的 electron / react / better-sqlite3 版本写进 docs/STACK.md

2. 构建配置
- electron.vite.config.ts：main / preload / renderer 三端；main 与 preload 用 externalizeDepsPlugin，
  把 better-sqlite3、electron 置为 external
- tsconfig.json + tsconfig.node.json + tsconfig.web.json，strict 全开，路径别名 @shared、@renderer
- scripts：dev、build、typecheck（双端 tsc --noEmit）、lint（最小 eslint 9 flat config）、
  dist（electron-builder --win nsis）
- 依赖不得超出上面清单

3. 主进程
- src/main/window.ts：BrowserWindow 1360x860，minWidth 1080 minHeight 700，
  nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true,
  titleBarStyle:'hidden', titleBarOverlay 配色取自 token，show:false + ready-to-show，
  最大化状态与窗口尺寸持久化到 userData/window-state.json
- src/main/index.ts：单实例锁、AppUserModelId、隐藏菜单、
  setWindowOpenHandler 外链走 shell.openExternal
- src/main/db/index.ts：打开 userData/data/workbench.db，PRAGMA journal_mode=WAL、foreign_keys=ON，
  读 user_version 顺序执行 src/main/db/migrations/*.sql（事务包裹）
- src/main/db/migrations/001_init.sql：**只建 settings、notes、notes_fts、todos 四张表**，
  逐字使用 DESIGN 第 5 节 001 段。邮件/账单/AI/数据源的表属于后续阶段，绝不提前建。
- src/main/ipc/app.ts 与 settings.ts：app:getPaths、app:getVersion、settings:getAll、
  settings:set、settings:setPinnedModules（写 settings 表 key=ui.pinned_modules，值为 JSON 数组）
- src/preload/index.ts：contextBridge 暴露 window.api.app.* 与 window.api.settings.*，导出 shared 类型

4. 模块自动发现（P0 的核心，验收标准是「加一个文件就多一个功能」）
- src/renderer/src/modules/defineModule.ts：定义 ModuleDefinition 与 defineModule()，
  字段与默认值严格按 DESIGN 第 7 节：path 默认 '/'+id、pinnable 默认 true、
  hasListPanel 默认 false、order 默认 100
- src/renderer/src/modules/registry.ts：
  `const found = import.meta.glob('../features/*/module.tsx', { eager: true })`，
  取 default 导出、过滤空值、按 order 排序后导出 registry。
  glob 模式必须是字面量字符串，不得用变量拼接；本文件不得出现任何模块 id 的硬编码数组
- src/renderer/src/modules/groups.ts：导出分组顺序常量 ['记录','外部数据','工具']，
  未登记的新分组自动排末尾
- 建 7 个模块，每个模块只写 features/<id>/module.tsx 一个文件，
  内部用 defineModule 同时给出元信息与页面组件（页面暂为「标题 + 一句占位说明」）：
  dashboard(首页，pinnable:false，工具) / notes(笔记，记录) / todos(待办，记录) /
  mail(邮件，外部数据) / bills(账单，外部数据) / sources(数据源，外部数据) /
  ai(智能助手，工具)。defaultPinned 取 notes、todos、mail、bills。icon 用 lucide-react
- 另加演示模块 features/demo/module.tsx（group 工具，order 900，pinnable:true，不 defaultPinned），
  页面只显示一段说明文字，用于证明「只加一个文件就出现在更多面板」
- 路由：router.tsx 遍历 registry 生成 Route，ModuleHost 兼容 page 为组件或返回 Promise 的函数
  （后者用 React.lazy）。不要手写多条 Route
- 侧栏 Sidebar 从 registry 派生，禁止硬编码模块数组：
  顶部固定首页 → 常用区（读取 ui.pinned_modules，过滤非法 id，最多 6 个）→ 「更多」→
  贴底 AI 与设置。图标 44x44 命中区，选中态 = 左侧 2px 竖条 + --accent 图标 + --accent-soft 底，
  未选中 --text-2，hover 显示 tooltip（名称 + 快捷键）
- MorePanel：点击「更多」从侧栏右侧浮出 320px 面板（left:64px，--surface + --shadow-2 + --r-lg），
  内容 = 搜索框 + 按 group 分组的模块行（图标 + 名称 + 行尾图钉）；
  点击行切换模块，点击图钉切换是否加入常用；Esc / 点遮罩关闭；
  底部固定提示「新增的功能会自动出现在这里」；侧栏已满 6 个时在提示上方加一行「侧栏已满，可在首页调整」
- 首页 Dashboard：问候 + 日期 → 常用功能卡片行（最多 6 张，4 列网格，卡片高 76px，
  图标 + 名称 + 摘要占位文案）→ 快速记录输入（P0 只做输入框，回车暂存到 settings 不算业务）
  → 今日待办 / 邮件概览 / 账单摘要三个占位区块。卡片行右上「编辑」进入编辑态：
  出现移除按钮与「从更多添加」按钮，支持 HTML5 draggable 拖拽排序，drop 后写回 ui.pinned_modules。
  未满 6 张时末尾显示虚线边框「添加常用」卡片
- 快捷键：Ctrl/Cmd+1 首页，Ctrl/Cmd+2..7 按侧栏常用顺序切换（上限 6 个 pin 正好对应 2–7），
  Esc 关浮层，Ctrl/Cmd+K 命令面板（数据来源只有 registry，含未 pin 的模块）
- docs/ADDING-A-MODULE.md：30 行以内最小示例 + 三步说明（新建 module.tsx、
  重启 dev server、自动出现在更多面板并可 pin）

5. 设计系统
- styles/tokens.css 完整落地 DESIGN 第 7 节全部变量（浅色 + 深色），index.css 引入 Tailwind，
  字体用系统栈（不外链 Google Fonts，离线可用）
- components/ui：Button（primary/secondary/ghost/danger + loading）、Input、Textarea、Select、
  Dialog（含确认型）、Toast（命令式 window.toast.success/error）、EmptyState、Spinner、Tooltip、
  ScrollArea。全部走 token，不写死颜色
- components/layout：TitleBar（40px，拖拽区 + no-drag 交互区）、AppShell（三段式布局）、
  Sidebar、MorePanel
- 主题：跟随系统 + 手动切换（localStorage），深色下所有组件可读

6. 打包
- electron-builder.yml：appId com.workbase.app，productName WorkBase，
  win target nsis + portable，x64，asar 开启，
  asarUnpack 含 better-sqlite3 的 .node，nsis 允许改安装目录
- resources/icon.ico：用 python/Pillow 画一个 256x256 简洁图标（深色圆角方块 + 白色 W），
  多尺寸写入 ico
- 跑一次 pnpm dist，确认 dist/ 下生成 .exe

验证并在报告里贴出：
- pnpm typecheck（0 error）、pnpm build、pnpm dist 的输出摘要
- 启动后 CDP 截图（pnpm dev 后访问 http://127.0.0.1:9222/json 取 ws 地址，
  用 node 脚本 Page.captureScreenshot），保存：
  temp/p0-dashboard.png（1360x860）、temp/p0-more-panel.png（更多面板展开态）、
  temp/p0-1080x700.png。截图前轮询确认侧栏图标与 Dashboard 卡片已渲染
- 自测：pin 4 个 → 重启应用 → 侧栏仍为 4 个；pin 改成空数组 → 侧栏只剩首页/更多/AI/设置；
  pin 7 个 → 侧栏只显示前 6 且有满额提示
- 自测（可插拔）：复制 features/demo/module.tsx 成 features/demo2/module.tsx，只改 id 与 name，
  重启 dev server → 更多面板与命令面板里出现「demo2」且无需改任何其它文件；
  再删掉 demo2 目录并重启 → 入口消失、无报错、pin 记录里残留的 id 被静默忽略。
  报告里贴出这两步的截图：temp/p0-module-added.png、temp/p0-module-removed.png

不要实现笔记/待办/邮件/账单/AI 的任何业务逻辑，不要建 001 以外的表。
```

**P0 DoD**：窗口能开；侧栏、更多面板、首页卡片、命令面板、快捷键全部由 registry 派生；**新增一个 `module.tsx` 不改其它文件即可在更多面板出现，删除后自动消失**；pin 持久化与上限行为正确；深浅色正常；两档尺寸（含面板展开）无溢出；exe 能装能启；`docs/STACK.md` 有版本。

---

## P1 — 笔记与待办（记录核心）

```markdown
前提：P0 已通过。只做 P1，不要碰 mail / bills / ai / sources。
001_init.sql 已由 P0 落地，本阶段**不新增迁移文件**，只写仓储与界面。

1. 数据层
- src/main/db/repo/notes.ts、todos.ts：只暴露语义化方法，SQL 不出仓库层
- notes 写入时同步维护 notes_fts（用触发器或显式 insert/delete，二选一并注释说明）；
  搜索用 fts5 MATCH + snippet() 返回高亮片段
- src/main/ipc/notes.ts、todos.ts：入参 zod 校验，错误统一 {code,message}

2. 笔记界面
- 左列表：置顶分组 + 其余按 updated_at 倒序，行高 40px，hover 出现置顶/删除，
  支持标签筛选 chips、FTS 搜索框（300ms 防抖）
- 右编辑区：标题输入 + Markdown 编辑/预览双栏，可切单栏。
  react-markdown + remark-gfm 渲染，代码块用一次性 CSS 方案，不引入重型高亮库
- 自动保存：停止输入 500ms 写库，状态区显示「保存中 / 已保存 hh:mm」
- 快速记录：列表顶部一行输入框，回车建笔记，结尾 #tag 自动提取为标签
- [[双链]]：点击跳到标题匹配的笔记，找不到则按标题新建

3. 待办界面
- 今日/本周/全部/已完成 四个筛选；优先级 1/2/3 用 6px 圆点（高=--danger 中=--accent 低=--text-3）
- 新增支持自然日期解析（「明天 10:00」「周五」「3天后」），失败不报错、不猜，due_date 留空
- 勾选完成 180ms 划线动效；拖拽排序写回 sort

4. 全局搜索与命令面板
- ipc: search:searchAll(q) 跨 notes / todos（mails、bills 表此时不存在，代码里用可选查询，
  不要为此建表或写死空数组占位）
- Ctrl/Cmd+K 命令面板：搜索 + 快捷命令（新建笔记/新建待办/切主题/去设置）

5. 主进程快捷键：Ctrl/Cmd+Shift+Space 唤出全局速记浮窗（480x220，失焦自动隐藏），
   回车存为笔记后隐藏

6. 首页联动：Dashboard 的「最近 5 条笔记」「今日待办」两个区块接真实数据，
   笔记与待办的常用卡片摘要改为真实计数（「3 项待进行」等）

验证：新建 20 条笔记、10 条待办，重启数据仍在；中文关键词搜索命中并高亮；
截图 temp/p1-notes.png、temp/p1-todos.png、temp/p1-dashboard-live.png。
```

**P1 DoD**：CRUD 全通、中文全文搜索准、重启不丢数据、速记浮窗可用、首页卡片摘要是真实数据、无 console 报错。

---

## P2 — 邮件同步与图表

```markdown
前提：P0/P1 已通过。只做邮件域。

1. 账户管理
- 新增 migrations/002_mail.sql（mail_accounts、mails 两表，逐字用 DESIGN 第 5 节 002 段）
- services/secret.ts：safeStorage 加密 IMAP 密码；不可用时抛 SECRET_UNAVAILABLE，禁止明文落库
- 账户表单提供 QQ邮箱/163/Gmail/Outlook/自定义 模板一键填充（host/port/secure 预填，
  中文提示「QQ/163 需使用授权码而非登录密码」）
- ipc: mail:accounts:test 用 imapflow 做一次 connect + logout，返回中文结果

2. 同步
- services/imap.ts：IMAP over TLS，按 last_sync_at 与 UID 最大值做增量；
  默认只同步最近 sync_days 天、单次上限 500 封；同一账户同时只允许一个同步任务
- 解析用 mailparser：subject/from/to/date/text/html/snippet（text 或 html 去标签后前 160 字）
- 入库用事务，ON CONFLICT(account_id,folder,uid) DO UPDATE
- 进度通过 mail:syncProgress 推给渲染层（阶段名 + 已处理/总数）；失败写 last_error 并指数退避，
  连续失败 3 次暂停该账户并给中文提示
- 启动后首次同步延迟 10s；之后每 15 分钟增量；设置页可手动「立即同步」

3. 界面
- 邮件页三段：账户切换 + 列表（分页 50 条）+ 详情
- 详情：subject/from/date/附件列表；HTML 用 DOMPurify 清洗后渲染，
  默认不加载外部图片（提示「已阻止外部图片」+ 一键加载）；纯文本兜底
- 图表（Recharts，走 token 配色）：每日邮件量趋势（7/30/90 天，面积图）、
  Top10 发件人（横向条形）、24 小时接收分布（柱状）、带附件占比（环形 + 中心数字）
- 所有图表有 loading 骨架、空态文案、hover tooltip；数据不足 7 天时趋势图给提示

4. 空态与错误
- 未配置账户：引导卡片 + 「添加账户」按钮，首页邮件卡片摘要显示「未配置账户」并直达这里
- 认证失败：明确「授权码/密码错误或被服务器拒绝」，附服务器原文

验证：用 1 个真实 IMAP 账户同步至少 200 封，四张图有数据；故意填错密码确认报错文案且不崩溃；
重启后邮件仍在且不重复入库；截图 temp/p2-mail-list.png、temp/p2-mail-charts.png。
```

**P2 DoD**：真实账户同步成功、增量不重复、四图有数据、HTML 安全渲染、错误可读。

---

## P3 — 支付宝账单：一键从邮箱获取

```markdown
前提：P2 已通过（IMAP 服务可复用）。只做账单域。

1. 数据与解析
- 新增 migrations/003_bills.sql（bill_imports、bill_txns，逐字用 DESIGN 第 5 节 003 段，
  含两个唯一索引与两个普通索引）
- 依赖新增：adm-zip、iconv-lite、csv-parse（只这三个，不要引入其它解析库）
- src/main/services/bills/ 下拆四个文件：
  encoding.ts   编码探测：UTF-8 解码出现 \uFFFD 则用 iconv-lite 按 gb18030 重解，剥离 BOM，返回 {text, encoding}
  locate.ts     表头定位：逐行扫描，取第一行同时包含「交易时间」与「金额」者为表头；
                表头前的导出信息全部丢弃；遇到含「导出时间」的行结束
  parse.ts      列映射与归一化：按表头名匹配（不依赖列序），必需列缺失则抛 BILL_PARSE_FAILED；
                金额去 ¥/￥/元/千分位后转分；收支映射 expense/income/neutral；
                时间按本地时区转毫秒；生成 fingerprint；跳过分隔线/空行/字段不足 3 列/尾行
  import.ts     入库：单事务内建 bill_imports 记录，逐行 INSERT OR IGNORE 写 bill_txns，
                统计 total/new/dup/skipped 后回写批次；返回摘要对象
- 解压安全：拒绝含 `..`、绝对路径、盘符的条目；解压总量 > 50MB、单文件 > 20MB、条目 > 200 时中止；
  加密 ZIP 抛 BILL_ENCRYPTED，提示「请手动解压后导入 CSV」

2. 一键获取（主路径）
- ipc: bills:fetchFromMail({accountId, sinceDays})：
  imapflow 连接后 search({since}) → 拉 envelope → 过滤（发件地址含 alipay 或主题含
  「账单」「交易明细」「支付宝」）→ fetch bodyStructure 找 .zip/.csv 附件 →
  download 到 temp/imports/<时间戳>/ → 解压 → 按编码/表头解析 → 入库
- 逐封邮件处理，全部邮件处理完再返回；任一附件解析失败不中断其余邮件，汇总到 failures 数组
- 全程 bills:progress 上报 {phase,done,total}，phase 为中文（「检索邮件」「下载附件」「解析」「写入」）
- 一封都没找到 → BILL_NOT_FOUND，提示「未在最近 N 天邮件中找到支付宝账单附件，可用手动导入」
- 同一文件重复导入：新增 0、重复 N，提示「该账单此前已导入」

3. 手动导入（兜底）
- ipc: bills:importFile()：dialog 选 .zip/.csv，走同一解析器；用户取消返回 {cancelled:true}

4. 界面（features/bills/）
- 顶部：区间选择（本月/近 3 月/近 12 月/自定义）+ 「一键获取」主按钮（带账户下拉）+
  「导入文件」次按钮 + 上次获取时间
- 四张指标卡：本期支出 / 本期收入 / 结余 / 笔数（数字等宽字体，收入 --success）
- 图表：月度收支柱线组合图、分类占比环形图（中心显示支出总额）、分类支出 Top10 横向条形
- 明细表：日期/分类/对方/说明/金额/支付方式；搜索、按收支与分类筛选、按金额与时间排序、
  分页 50 条、点击行开详情抽屉
- 导入结果以 toast + 结果条呈现：文件名、区间、总/新增/重复/跳过、编码，附「撤销本次导入」
  （二次确认后删批次，级联删明细）
- 空态与首启引导：严格按 DESIGN 第 8 节账单的四态实现，用 EmptyState 组件，不要写空表格或空图表。
  1) 无邮箱账户 → "先连接一个邮箱"引导，主按钮跳设置页并聚焦邮箱输入，次按钮"手动导入文件"可用，
     "一键获取"降为次要样式且点击只打开引导、不抛错；
  2) 有账户但无账单 → "获取第一份账单"引导，预选第一个启用账户，说明将搜索最近 90 天支付宝邮件；
  3) 有数据但本次没搜到 → 保留图表，内联提示 + 手动导入入口，不弹模态、不清空；
  4) 认证失败 → 提示条 + "去设置修正" + 折叠的服务器原文。
  处于 1/2 态时侧栏账单图标不得出现红点或错误标记。

5. 首页与设置联动
- Dashboard 账单卡片：本月支出/收入/结余 + 最近 3 笔，摘要文案如「本月支出 ¥2,340」
- 设置页新增「账单获取偏好」：回溯天数（默认 90），写 settings 键 bills.autoFetchDays

6. 自测（必须做，不依赖真实邮箱）
- 用 node 或 python 在 temp/ 下构造测试文件：
  a) GBK 编码、带 5 行导出信息前置、含「¥1,234.00」与「不计收支」行、末尾有导出时间行的 csv
  b) 同内容 zip 包
  c) 一个含 ../evil.csv 条目的恶意 zip
  d) 一个普通表格 csv（无支付宝表头）
- 验证：a/b 解析出正确条数与金额（金额以分为单位核对）；重复导入新增 0；c 被拒绝；
  d 抛 BILL_PARSE_FAILED 且不写库
- 首启引导验证（用临时库或直接 SQL 操作 mail_accounts 表，测完恢复）：
  e) 清空 mail_accounts → 进入账单页必须出现"先连接一个邮箱"引导，截图；点"一键获取"仍进引导、无报错
  f) 有账户但清空 bill_imports → 出现"获取第一份账单"引导且预选账户，截图
  g) 有数据时手动制造一次 BILL_NOT_FOUND（如把账户 mailbox 指向不存在文件夹）→ 图表仍在、只出内联提示
- 测试文件与脚本放 temp/，不要提交到 src/

真实账户验证由审批方提供邮箱后执行，本阶段报告里写明「待真实邮箱验证」。
截图 temp/p3-bills.png、temp/p3-bills-empty.png、temp/p3-bills-first-run.png。
```

**P3 DoD**：自测四类文件行为正确；解析条数/金额/去重/编码全部对得上；四张图有数据；撤销导入干净；首页卡片摘要真实；三种引导态（无账户/无账单/未搜到）文案与按钮正确且无报错。

---

## P4 — AI 与数据源

```markdown
前提：P3 已通过。只做 AI 与数据源。

1. AI
- migrations/004_ai.sql：ai_threads / ai_messages
- services/ai.ts：OpenAI 兼容 /chat/completions 流式（SSE），主进程 fetch，逐块解析 data:，
  webContents.send('ai:delta')，结束发 ai:done；支持 abort
- 配置：baseURL / apiKey（safeStorage 加密）/ model / temperature / maxTokens；
  ipc: ai:testConfig 发一条极短消息验证连通性，返回中文结果
- 界面：右侧滑入 380px 抽屉，Ctrl/Cmd+J 唤起；按角色区分气泡；流式时显示光标与「停止」；
  会话列表可切换、重命名、删除
- 上下文动作（选中内容后浮动工具条或详情页按钮）：
  笔记 → 总结要点 / 提取待办（返回 JSON 数组，确认后批量写入 todos）/ 续写
  邮件 → 三句话摘要 / 是否需要回复 / 提取待办
  账单 → 本月消费分析与异常提醒（把聚合结果作为上下文，不要传全量明细）
- 提示词模板集中放 services/prompts.ts，中文，要求纯文本或严格 JSON
- 未配置时点击 AI 入口显示配置引导，不发请求

2. 数据源
- migrations/005_sources.sql：sources / data_points
- kind=rss：解析 RSS/Atom，按 item 时间与数值字段（无则计数 +1）写入 data_points
- kind=json：config 里 itemsPath（点路径）、tsField、valueField、labelField
- 抓取超时 15s、UA 固定、失败记录 last_error 不做重试轰炸；手动「立即抓取」+ 每 60 分钟
- 界面：数据源列表（名称/类型/状态/上次抓取）+ 新增表单（含示例说明）+
  选中后折线/柱状图 + 最近 20 条数据点表格

3. 首页联动：数据源卡片显示最新值与更新时间

验证：AI 用真实 key 完成一次流式对话并落库；错误 baseURL 确认报错可读；
用 2 个公开 RSS 源抓取成功并出图；截图 temp/p4-ai.png、temp/p4-sources.png。
```

**P4 DoD**：流式稳定不卡界面、会话持久化、上下文动作产出可直接用的结果、数据源失败可诊断。

---

## P5 — 打磨与发布

```markdown
前提：P4 已通过。只做打磨，不加新功能。

1. 视觉与交互收敛
- 逐页核对 DESIGN 第 7 节：字号、行高、圆角、边框、间距、hover 态、focus ring；
  统一列表行高与内边距；清掉未使用 token 的硬编码色值
- 空态补齐（每页文案 + 主操作）；错误文案统一口径
- 动效统一 ≤180ms ease-out；页面切换 8px 淡入
- 1080x700 与 1360x860 两档逐页截图核对，含更多面板展开态、AI 抽屉展开态

2. 系统集成
- 快捷键：Ctrl/Cmd+K 命令面板、Ctrl/Cmd+Shift+Space 速记、Ctrl/Cmd+J AI、
  Ctrl/Cmd+1..7 按侧栏顺序切视图、Ctrl/Cmd+, 设置
- 托盘（可选）：关闭到托盘、托盘菜单（显示/速记/退出），设置项可关闭
- 单实例：第二次启动聚焦已有窗口

3. 数据安全
- app:exportBackup：把 workbench.db（VACUUM INTO 快照）+ 文件目录打包到用户选择目录，
  文件名带时间戳；导出后给出路径与体积
- 设置页显示数据目录、数据库体积、各表记录数、打开目录按钮
- 清空数据：二次确认 + 输入「确认清空」才执行，先自动备份

4. 发布
- 版本 1.0.0，图标、产品名、公司名、版权信息补齐
- pnpm dist 出 nsis 安装包与 portable；安装到默认路径后启动验证：
  首启建库、添加账户、发一条笔记、关闭再开数据仍在
- README.md：功能概览、开发命令、打包命令、数据存放位置、常见问题（授权码、账单格式、ABI、镜像）
- 清理 temp/ 临时文件（保留最终验收截图），`rg "console\.log|TODO|FIXME" src/` 为空

验证：给出安装包路径与体积、全新路径安装启动的截图、DESIGN 第 10 节 15 条逐条自查结果。
```

**P5 DoD**：DESIGN 第 10 节 15 条全过，安装包在干净环境可装可用。

---

## 2. 已知陷阱（提示词未覆盖时由我口头补充给 codex）

1. **better-sqlite3 ABI**：`pnpm dev` 报 `NODE_MODULE_VERSION mismatch` → `npx electron-rebuild -f -w better-sqlite3`，不要改用 sql.js 或 JSON 存库。
2. **imapflow / adm-zip 打包**：必须列在 electron.vite 的 external，且 `electron-builder.yml` 的 `asarUnpack` 加上 `node_modules/imapflow/**`、`node_modules/adm-zip/**`，否则安装后运行时找不到模块。
3. **Tailwind 4**：用 `@tailwindcss/vite` 插件 + `@import "tailwindcss";`，不要装 postcss 或 tailwind.config.js 老方案。
4. **CDP 截图**：必须 `Emulation.setDeviceMetricsOverride`，否则默认 800x600；截面板展开态要先 dispatch 点击或直接改 store 初始值。
5. **IMAP 中文主题**：部分服务器返回 encoded-word，mailparser 会解码，入库前确保 UTF-8 而非 latin1。
6. **同步风暴**：增量同步以 `MAX(uid)` 为下界，不要每次按日期全量重扫。
7. **支付宝 CSV**：GBK 编码，`交易时间` 前缀有 5 行以上导出信息，末尾有「导出时间」行，金额可能带 `¥` 与千分位；表头列数可能与数据行不一致（备注列为空时少列），按索引取不到就补空串，不要整行丢弃。
8. **部分唯一索引**：`CREATE UNIQUE INDEX ... WHERE trade_no <> ''` 需要 SQLite 3.8+，better-sqlite3 自带版本满足，但 `INSERT OR IGNORE` 遇到空串订单号时必须靠 fingerprint 唯一索引兜底，两个索引都要建。
9. **导航硬编码**：最容易犯的错是在 Sidebar 里写死模块数组。审批会跑 `rg` 检查 layout 目录里是否出现模块 id 字面量。
10. **侧栏上限**：pin 数量超过 6 时不能报错、不能截断数据，只在展示层取前 6，`ui.pinned_modules` 保留完整顺序。
11. **import.meta.glob 三不要**：不要用变量拼接模式；不要用绝对路径（必须是 `../features/*/module.tsx` 这种相对路径）；不要漏 `eager: true`——漏了拿到的是加载函数而非模块对象，`m.default` 为 undefined，模块全部静默消失，表现为「侧栏空了但不报错」，是最难查的一类。
12. **新增文件后 glob 不刷新**：Vite dev 下对新增文件不可靠，必须重启 dev server；打包是新进程，不受影响。
13. **模块顶层副作用**：eager glob 会在启动时 import 全部模块文件，顶层写请求或 localStorage 会在启动瞬间执行，初始化一律放进组件 `useEffect`。
14. **pin 里的脏 id**：模块被删除后 `ui.pinned_modules` 会残留其 id，渲染时必须 filter 掉（按 registry 现存 id 求交集），不要抛错也不要自动改写存储。
