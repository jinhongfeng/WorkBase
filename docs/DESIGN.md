# WorkBase 桌面工作台 — 设计规范

> 本文件是实现的唯一事实来源。codex 不得自行更改架构、依赖或数据模型；如需变更，先改本文件并在提交说明里给出理由。

## 1. 目标与边界

**目标**：一个纯本地、离线的个人工作台桌面应用。记录一切（笔记/待办）、聚合外部数据（邮箱邮件 + 支付宝账单 + 网络数据源）、用 AI 加工这些内容、用图表呈现。

**硬约束**

- 数据只落本地磁盘，不经过任何自建服务器；唯一的外部请求是用户自己配置的 AI 接口、IMAP 服务器、数据源 URL。
- 单机单用户，无账号体系、无云同步、无遥测。
- 产物是 Windows x64 安装包（NSIS `.exe`）与免安装版。
- 冷启动 < 2s（SSD），空库内存占用 < 300MB，1 万条笔记列表滚动不掉帧。
- 新增一个功能模块的成本必须是「加一份注册项 + 一个页面 + 可选的数据通道」，不改导航代码。

**非目标（V1 明确不做）**：多端同步、移动端、团队协作、插件市场、AI 训练/微调、邮件发送（只读同步）、账单编辑（只读导入与统计）。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 壳 | Electron（最新稳定版，装好后把实际版本写入 `docs/STACK.md`） | 邮件同步依赖 Node 生态（imapflow / mailparser）、SQLite 用 better-sqlite3 同步 API、AI 流式请求走主进程。Tauri 需要把这三件事全部用 Rust 重写，出错面大、返工成本高。体积约 100–150MB，对本地工作台不构成问题。 |
| 构建 | electron-vite + electron-builder | 官方推荐组合；`externalizeDepsPlugin` 能正确处理原生模块与 IMAP 依赖 |
| 渲染 | React 19 + TypeScript 5 + Vite | 生态与可维护性 |
| 样式 | Tailwind CSS 4 + CSS 变量 | token 集中管理，主题切换成本低 |
| 状态 | Zustand（按域拆分 store） | 轻量，无 Provider 嵌套 |
| 图表 | Recharts | 声明式，契合 React，样式可控 |
| 图标/动效 | lucide-react + motion | 线性图标风格统一 |
| 存储 | SQLite（better-sqlite3）+ WAL + FTS5 | 单文件、事务、全文检索 |
| 邮件 | imapflow + mailparser | 只读 IMAP + 解析，成熟稳定 |
| 账单解析 | adm-zip + iconv-lite + csv-parse | 支付宝导出为 GBK 编码 ZIP 内 CSV，含引号内逗号与前置说明行；三者均为纯 JS，无原生编译 |
| 打包 | electron-builder → NSIS | 出 `.exe` 安装包 |

**禁止引入**：electron-forge（与 electron-vite 冲突）、TypeORM/Prisma（重）、Ant Design/MUI（视觉不可控）、drag-and-drop 类库（用原生 HTML5 draggable 即可）、图表二次封装库、任何远程日志/埋点 SDK、任何需要在线激活的库。

## 3. 进程架构与安全边界

```
main (Node)          preload (isolated)        renderer (React)
├─ SQLite 仓储        contextBridge 白名单      ├─ UI / 交互
├─ IMAP 同步调度  ←→  window.api.<domain>.*  ←→ ├─ Zustand
├─ 账单解析           (仅暴露函数，不暴露 ipcRenderer)  ├─ 模块注册表
├─ AI 请求代理                                  └─ Recharts
├─ 数据源抓取
└─ safeStorage 加解密
```

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`。
- 渲染进程**不得**直接访问 fs / net / child_process / ipcRenderer。
- 所有外发请求（AI、数据源）在主进程发起，避免 CORS 与密钥暴露。
- 渲染进程加载内容统一 `setWindowOpenHandler` 拦截外链 → 交给系统浏览器；禁止 `window.open` 新窗口。
- 所有 `ipcMain.handle` 入参做 zod 校验（或手写校验函数），非法入参抛结构化错误。
- ZIP 解压必须防路径穿越（拒绝含 `..`、绝对路径、盘符的条目）与 zip bomb（解压总量上限 50MB、单文件 20MB、条目数上限 200）。

## 4. 目录结构

```
workbase/
├─ AGENTS.md                  # codex 项目级规则
├─ docs/                      # 设计、阶段计划、提示词
├─ resources/                 # 图标等打包资源
├─ temp/                      # 中间产物、截图、codex 输出日志（不入库）
├─ src/
│  ├─ main/
│  │  ├─ index.ts             # app 生命周期、窗口、快捷键
│  │  ├─ window.ts
│  │  ├─ db/
│  │  │  ├─ index.ts          # 连接、WAL、迁移执行
│  │  │  ├─ migrations/001_init.sql, 002_mail.sql, 003_bills.sql, 004_ai.sql, 005_sources.sql
│  │  │  └─ repo/{notes,todos,mails,bills,settings,sources,ai}.ts
│  │  ├─ services/
│  │  │  ├─ imap.ts           # 连接、同步、增量、附件下载
│  │  │  ├─ bills.ts          # 支付宝账单：定位表头、编码探测、解析、去重入库
│  │  │  ├─ ai.ts             # OpenAI 兼容流式
│  │  │  ├─ sources.ts        # RSS / JSON 数据源
│  │  │  ├─ secret.ts         # safeStorage 封装
│  │  │  └─ export.ts         # 备份导出
│  │  └─ ipc/                 # 按域注册 handler
│  ├─ preload/index.ts
│  ├─ shared/
│  │  ├─ types.ts             # 跨进程共享类型（单一来源）
│  │  └─ ipc-contract.ts      # 通道名常量 + 入参/返回类型
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx, App.tsx, router.tsx
│        ├─ styles/tokens.css, index.css
│        ├─ modules/registry.ts       # glob 自动扫描 features/*/module.tsx
│        ├─ modules/defineModule.ts   # 模块定义、类型约束与默认值
│        ├─ modules/groups.ts         # 侧栏与更多面板的分组顺序
│        ├─ components/{layout,ui,charts}/
│        │   └─ layout/               # Sidebar / MorePanel / TitleBar / AppShell
│        ├─ features/<id>/module.tsx  # 模块入口：新增功能只需新增这一个文件
│        ├─ features/<id>/            # 该模块的页面组件、hooks 与同目录资源
│        └─ stores/
└─ electron.vite.config.ts, electron-builder.yml, package.json, tsconfig*.json
```

## 5. 数据层

**位置**：`app.getPath('userData')/data/workbench.db`，附件/原始邮件存 `userData/files/`。设置页可显示路径并提供"打开目录"（`shell.openPath`）与"导出备份"。

**加密**：IMAP 密码、AI API Key 用 `safeStorage.encryptString()` 加密后以 BLOB 存库；`safeStorage.isEncryptionAvailable()` 为 false 时拒绝保存明文并向用户报错，不得降级为明文。

**迁移归属（唯一口径，按阶段落地，禁止把后续阶段的表提前塞进 001）**

| 文件 | 阶段 | 内容 |
|---|---|---|
| `001_init.sql` | P0 | settings、notes、notes_fts、todos |
| `002_mail.sql` | P2 | mail_accounts、mails |
| `003_bills.sql` | P3 | bill_imports、bill_txns |
| `004_ai.sql` | P4 | ai_threads、ai_messages |
| `005_sources.sql` | P4 | sources、data_points |

**Schema**

`001_init.sql`

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE notes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',        -- 逗号分隔，前置逗号便于 LIKE 匹配
  pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content='notes', content_rowid='rowid', tokenize='unicode61');

CREATE TABLE todos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2,  -- 1 高 2 中 3 低
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
```

`002_mail.sql`

```sql
CREATE TABLE mail_accounts (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL,
  secure INTEGER NOT NULL DEFAULT 1, username TEXT NOT NULL,
  secret BLOB NOT NULL,                 -- safeStorage 密文
  mailbox TEXT NOT NULL DEFAULT 'INBOX', sync_days INTEGER NOT NULL DEFAULT 30,
  enabled INTEGER NOT NULL DEFAULT 1, last_sync_at INTEGER, last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE mails (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  uid INTEGER NOT NULL, folder TEXT NOT NULL DEFAULT 'INBOX',
  message_id TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '', to_addrs TEXT NOT NULL DEFAULT '',
  sent_at INTEGER NOT NULL, snippet TEXT NOT NULL DEFAULT '', text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT, size INTEGER NOT NULL DEFAULT 0, has_attachment INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0, fetched_at INTEGER NOT NULL,
  UNIQUE(account_id, folder, uid)
);
CREATE INDEX idx_mails_sent ON mails(sent_at DESC);
CREATE INDEX idx_mails_from ON mails(from_addr);
```

`003_bills.sql`

```sql
CREATE TABLE bill_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                 -- 'email' | 'file'
  file_name TEXT NOT NULL,
  mail_id TEXT, account_id TEXT,        -- 来源邮件/账户，可为空
  period_start INTEGER, period_end INTEGER,
  encoding TEXT NOT NULL DEFAULT 'utf-8',
  total_rows INTEGER NOT NULL DEFAULT 0, new_rows INTEGER NOT NULL DEFAULT 0,
  dup_rows INTEGER NOT NULL DEFAULT 0, skipped_rows INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE bill_txns (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES bill_imports(id) ON DELETE CASCADE,
  trade_no TEXT NOT NULL DEFAULT '',    -- 交易订单号，空串表示缺失
  ts INTEGER NOT NULL,                  -- 交易时间（毫秒）
  category TEXT NOT NULL DEFAULT '', counterparty TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL,              -- 'expense' | 'income' | 'neutral'
  amount_cents INTEGER NOT NULL,        -- 正整数（分）
  pay_method TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL,            -- 无订单号时的兜底去重键
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_bill_trade_no ON bill_txns(trade_no) WHERE trade_no <> '';
CREATE UNIQUE INDEX ux_bill_fp ON bill_txns(fingerprint);
CREATE INDEX idx_bill_ts ON bill_txns(ts DESC);
CREATE INDEX idx_bill_cat ON bill_txns(category);
```

`004_ai.sql`

```sql
CREATE TABLE ai_threads (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE ai_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_ai_msg ON ai_messages(thread_id, created_at);
```

`005_sources.sql`

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL,   -- 'rss' | 'json'
  name TEXT NOT NULL, url TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1, last_fetch_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE data_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', value REAL NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_points ON data_points(source_id, ts);
```

**settings 约定键**

| key | 值 | 说明 |
|---|---|---|
| `ui.pinned_modules` | JSON 数组，如 `["notes","todos","mail","bills"]` | 侧栏与首页的常用模块，顺序即展示顺序 |
| `ui.theme` | `light` / `dark` / `system` | 外观 |
| `ai.config` | JSON（apiKey 字段存密文引用，不明文） | AI 配置 |
| `bills.autoFetchDays` | 数字字符串，默认 `90` | 一键获取时回溯天数 |

**规则**

- 迁移：`migrations/` 下按序号递增的 `.sql`，`user_version` 记录版本，启动时顺序执行、包在事务里。禁止修改已执行过的迁移文件，需求变化一律新增文件。
- 时间统一存 Unix 毫秒（INTEGER），展示层转换。
- ID 用 `crypto.randomUUID()`。
- 仓储层只暴露语义化方法（`listNotes({q, tag, limit})`），**禁止**把 SQL 字符串从渲染进程传进来。
- 统计图表所需的聚合查询放仓储层（`statsByMonth` / `statsByCategory`），不允许把全量明细拉到前端再算。

## 6. IPC 契约

通道名集中定义在 `src/shared/ipc-contract.ts`，命名 `<domain>:<action>`。preload 暴露为 `window.api`：

```
api.notes    list / get / create / update / remove / togglePin
api.todos    list / create / update / remove / toggle / reorder
api.mail     accounts.list / accounts.save / accounts.remove / accounts.test
             sync(accountId) / list({accountId,q,page}) / get(id) / stats({range}) / onSyncProgress(cb)
api.bills    accounts()                                     # 可选的账单来源账户
             fetchFromMail({accountId, sinceDays})          # 一键：搜索邮件→取附件→解析→入库
             importFile()                                   # 兜底：手动选文件
             imports.list() / imports.remove(id)            # 批次与撤销
             txns.list({month,category,direction,q,page,pageSize})
             txns.categories()
             stats.summary({from,to}) / stats.byMonth({from,to})
             stats.byCategory({from,to,direction}) / stats.byMerchant({from,to,limit})
             onFetchProgress(cb)
api.sources  list / save / remove / fetch(id) / points({id,range})
api.ai       getConfig / saveConfig / testConfig / chat({threadId,messages,stream:true})
             threads.list / threads.remove / onDelta(cb) / abort()
api.settings getAll / set / setPinnedModules(ids)
api.app      getPaths / openDataDir / exportBackup / getVersion
api.search   searchAll(q)      # 跨笔记/待办/邮件/账单
```

- 流式：主进程 `webContents.send('ai:delta', {threadId, delta})`，结束发 `ai:done`；preload 转成回调并返回取消函数。回调用 `ipcRenderer.on` 后必须在组件卸载时 `removeListener`。
- 长任务（邮件同步、账单获取）通过 `<domain>:progress` 上报 `{phase, done, total}`，`phase` 为中文可读阶段名。
- 错误：统一抛 `{ code: 'IMAP_AUTH_FAILED' | 'BILL_NOT_FOUND' | 'BILL_PARSE_FAILED' | 'AI_NOT_CONFIGURED' | 'DB_ERROR' | ... , message }`，渲染层用 toast 呈现中文可读文案。

## 7. 视觉与交互规范

**气质**：克制的浅色、大量留白、细边框、无渐变噪点、动效短而轻。参考 Linear / Raycast 的秩序感，不参考仪表盘大屏的密集卡片。

**Token（`styles/tokens.css`，必须用 CSS 变量，不许散落硬编码色值）**

```
浅色: --bg #FAFAF9  --surface #FFFFFF  --surface-2 #F5F5F4
      --border #E7E5E4  --border-strong #D6D3D1
      --text #1C1917   --text-2 #78716C  --text-3 #A8A29E
      --accent #4F46E5 --accent-soft #EEF2FF  --danger #DC2626  --success #16A34A
深色: --bg #0C0A09  --surface #171614  --surface-2 #1F1D1B
      --border #292524  --text #FAFAF9  --text-2 #A8A29E  --accent #818CF8
圆角: --r-sm 6px --r-md 10px --r-lg 14px --r-xl 18px
间距: 4 的倍数；内容区最大宽度 1100px
字体: UI = Inter var, "PingFang SC", "Microsoft YaHei UI"; 代码/数字 = "JetBrains Mono"
阴影: --shadow-1 0 1px 2px rgba(28,25,23,.06); --shadow-2 0 8px 24px rgba(28,25,23,.08)
```

**窗口与布局**

- 窗口默认 1360×860，最小 1080×700，可记忆上次尺寸与位置。
- 自定义标题栏（`titleBarStyle: 'hidden'` + `titleBarOverlay`），高度 40px，右侧系统按钮区域避让；拖拽区用 `-webkit-app-region: drag`，交互元素必须 `no-drag`。
- 三段式：左侧 64px 图标轨 → 中间 260px 列表面板（仅笔记/待办/邮件/账单这类需要列表的视图显示，首页与设置不需要）→ 右侧主内容区。列表与主区之间 1px 分割线，无卡片套卡片。
- 字号：正文 14px/1.65，标题 15–22px，辅助 12px。行高宽松，列表行高 40px。

**导航模型（本次重点，必须按此实现）**

侧栏不再硬编码入口，改为「固定区 + 常用区 + 更多 + 底部」四段：

```
[首页]  (固定，不可移除)
──────────
[常用 1..6]        ← 用户在首页选定的模块，存在 settings.ui.pinned_modules
──────────
[更多 ⋯]           ← 打开全部功能面板
──────────
[AI]  [设置]       ← 贴底固定
```

- 常用区最多 6 项。超出 6 项时按数组顺序取前 6，其余自动落回"更多"，并在更多面板里提示"侧栏已满，可在首页调整"。
- 选中态：图标变 `--accent`、背景 `--accent-soft`、圆角 `--r-sm`、左侧 2px 竖条；未选中为 `--text-2`。悬停显示 tooltip（模块名 + 快捷键）。
- **更多面板**：从侧栏右侧浮出，宽 320px，`--surface` 底 + `--shadow-2` + `--r-lg`，左侧 64px 对齐。内容为搜索框 + 按 `group` 分组的模块行（图标 + 名称 + 行尾图钉）。点击行切换选中；点击图钉切换是否加入常用（已有则取消）。Esc 或点击遮罩关闭。底部固定一行提示："新增的功能会自动出现在这里。"
- **首页常用区**：问候语下方、快速记录之上，横向卡片行（最多 6 张，4 列网格，卡片高 76px）。卡片 = 图标 + 名称 + 一行摘要（如"3 项待进行"、"本周 12 封"、"本月支出 ¥2,340"）。未满 6 张时末尾显示虚线边框的"添加常用"卡片。右上角"编辑"进入编辑态：卡片出现移除按钮、下方出现"从更多添加"按钮，卡片可拖拽排序（原生 HTML5 draggable，`dragend` 时写回 `ui.pinned_modules`）。
- 摘要取不到或模块依赖未配置（无邮箱账户 / 无 AI 配置）时，卡片摘要显示灰色提示文案（"未配置账户"），点击直达配置，不得报错。
- 快捷键：`Ctrl/Cmd+1` 首页，`Ctrl/Cmd+2..7` 按侧栏常用顺序，`Ctrl/Cmd+K` 命令面板（可搜索全部模块，含未 pin 的）。

**模块自动发现（`features/<id>/module.tsx`）**

导航不维护手工清单。`modules/registry.ts` 用 Vite 的 `import.meta.glob` 在编译期扫描模块文件，**新增一个功能 = 新增一个文件**，其余全部自动生效。

```ts
// modules/defineModule.ts —— 只做类型约束与默认值填充
export interface ModuleDefinition {
  id: string;                      // 同时作为路由 '/<id>' 与去重键，必须唯一
  name: string;                    // 侧栏、卡片、命令面板显示名
  icon: LucideIcon;
  group: string;                   // '记录' | '外部数据' | '工具'，新分组自动排到末尾
  order?: number;                  // 同组内排序，默认 100
  path?: string;                   // 默认 `/${id}`，一般不用写
  pinnable?: boolean;              // 默认 true；首页固定 false
  defaultPinned?: boolean;
  hasListPanel?: boolean;          // 是否要 260px 列表面板，默认 false
  requires?: 'mailAccount' | 'aiConfig';
  summary?: () => Promise<string>; // 首页卡片摘要，抛错时展示占位文案
  page: ComponentType | (() => Promise<{ default: ComponentType }>);
}

// modules/registry.ts
const found = import.meta.glob('../features/*/module.tsx', { eager: true });
export const registry: ModuleDefinition[] = Object.values(found)
  .map((m: any) => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
```

规则：

- **glob 模式必须是字面量、必须是相对路径**，不能用变量拼接，否则 Vite 静态分析失败、模块静默消失且不报错。
- 模块文件只允许 `export default defineModule({...})`，顶层不得有副作用（不发请求、不读写 localStorage），否则进入首页即执行。
- 路由由 registry 生成：`router.tsx` 遍历 registry 产出 `<Route path={m.path ?? '/' + m.id} element={<ModuleHost module={m} />} />`；`ModuleHost` 兼容 `page` 为组件或返回 Promise 的函数两种形态，后者用 `React.lazy` 包裹。
- 侧栏、更多面板、首页卡片、"从更多添加"列表、命令面板、快捷键映射、列表面板开关，全部只读 registry；布局组件内不得出现任何模块 id 字面量。
- 分组顺序由 `modules/groups.ts` 常量数组决定，未登记的新分组自动排末尾，不报错。
- 新增模块的完整动作：在 `features/<新 id>/module.tsx` 写一个文件 → 重启一次 dev server（Vite 对新增文件不会自动重跑 glob）→ 它立刻出现在更多面板、命令面板、首页"从更多添加"里，可 pin 到侧栏与首页。
- 只有需要后端能力的模块（读写库、访问网络）才额外写 repo 与 IPC；纯前端模块零主进程改动。
- `docs/ADDING-A-MODULE.md` 保存 30 行以内的最小示例，新增功能照抄改字段即可。

**交互**

- 全局快捷键：`Ctrl/Cmd+K` 命令面板（操作 + 搜索）、`Ctrl/Cmd+Shift+Space` 全局速记浮窗、`Ctrl/Cmd+N` 新建当前视图条目、`Esc` 关闭浮层。
- 所有异步操作有 loading / 空状态 / 错误三态；空状态给一句引导文案 + 主操作按钮，不用插画大图。
- 列表项 hover 才显示次要操作，避免常驻按钮噪声。
- 动效 ≤ 180ms，`ease-out`；列表进入用 8px 位移淡入，不做弹跳。
- 破坏性操作（删除账户/撤销导入/清空数据）二次确认，文案写清后果。

## 8. 模块与功能点

**Dashboard**：问候 + 日期；常用功能卡片行（见第 7 节）；快速记录输入（回车即存笔记，`#tag` 自动识别）；今日待办（可勾选）；最近 5 条笔记；近 30 天邮件量迷你折线 + 今日邮件数；本月账单摘要（支出/收入/结余 + 最近 3 笔）；数据源最新值。

**笔记**：左列表（置顶优先、按更新时间）+ 右侧 Markdown 编辑/预览双栏（可切纯编辑）；标签筛选；FTS5 全文搜索高亮；自动保存（防抖 500ms）；支持 `[[笔记标题]]` 双链跳转。

**待办**：今日/本周/全部/已完成；优先级色点；新增支持自然日期（`明天 10:00` 解析，失败则忽略不报错）；拖拽排序写回 `sort`。

**邮件**：账户管理（IMAP 主机/端口/SSL/账号/授权码，含 QQ/163/Gmail/Outlook 一键预填模板）；手动同步 + 启动后每 15 分钟增量同步（按 UID 最大值增量，失败指数退避并记录 `last_error`）；邮件列表（发件人、主题、摘要、时间、附件标记）+ 详情（HTML 用 DOMPurify 清洗后渲染，禁外部图片自动加载）；图表：每日邮件量趋势（近 7/30/90 天）、Top 10 发件人、24 小时接收分布、带附件占比。

**账单（支付宝）**：这是本次新增的核心模块，目标是"一键把邮箱里的支付宝导出账单变成可看的统计"。

- 数据入口两个，主路径是邮箱：
  1. **一键获取**：选择已配置的 IMAP 账户 → 在 INBOX 与"已删除"以外的文件夹中搜索最近 `bills.autoFetchDays`（默认 90）天的邮件，筛选条件为发件人含 `alipay` 或主题含"账单"/"交易明细"/"支付宝" → 遍历 `bodyStructure` 找 `.zip` / `.csv` 附件 → 下载到 `temp/imports/<时间戳>/` → 解压（校验路径穿越与体积）→ 解析 → 去重入库。全程通过 `bills:progress` 上报阶段（"检索邮件 / 下载附件 / 解析 N 条 / 写入"）。
  2. **手动导入**：`importFile()` 打开文件选择框，支持 `.zip` / `.csv`，走同一套解析器。用于邮箱搜索不到时的兜底。
- 解析规则（支付宝导出文件的既有格式，必须容错）：
  - 编码：先按 UTF-8 解码，出现替换字符 `\uFFFD` 则按 GB18030 重解（`iconv-lite`），把实际编码写入 `bill_imports.encoding`。剥离 BOM。
  - 表头定位：逐行扫描，取第一行同时包含"交易时间"与"金额"的行作为表头；表头之前的"导出信息"说明、"支付宝账户"等全部丢弃；表头之后遇到"导出时间"或全分隔线行即结束。
  - 列映射：按表头名匹配，不依赖列序。必需列：交易时间、金额、收/支；可选列：交易分类、交易对方、商品说明、收/付款方式、交易状态、交易订单号、商家订单号、备注。缺失的可选列填空串。
  - 金额：去掉 `¥`、`￥`、`元`、千分位逗号与空格，`parseFloat` 后四舍五入乘 100 存 `amount_cents`。解析失败的行计入 `skipped_rows` 继续，不中断整批。
  - 收支：`支出` → `expense`，`收入` → `income`，其余（`不计收支`、空）→ `neutral`；`neutral` 不参与支出/收入统计，但保留在明细里。
  - 时间：`2026-01-05 12:30:45` 这类格式按本地时区解析为毫秒；只有日期的补 `00:00:00`。
  - 去重：有交易订单号则以订单号为键（部分唯一索引），无订单号则用 `sha1(交易时间|金额|收/支|交易对方|商品说明)` 作为 `fingerprint`。冲突计入 `dup_rows`，用 `INSERT OR IGNORE` 保证不重复。
  - 跳过：分隔线行、空行、字段数少于 3 的行、"导出时间"尾行。
- 入库后返回摘要并直接展示（不要求二次确认，一键即可看到结果）：文件名、解析区间、总行数 / 新增 / 重复 / 跳过、实际编码。若新增为 0 且全部重复，提示"该账单此前已导入"。提供"撤销本次导入"（删批次，级联删明细，二次确认）。
- 账单页布局：顶部区间选择（本月/近 3 月/近 12 月/自定义）+ "一键获取"+"导入文件"两个主按钮 + 上次获取时间。下方为四张指标卡（本期支出 / 本期收入 / 结余 / 笔数，数字用等宽字体，支出为 `--text`、收入为 `--success`）、月度收支柱线组合图、分类占比环形图（中心显示支出总额）、分类支出 Top 10 横向条形图、交易明细表（日期/分类/对方/说明/金额/支付方式，支持搜索、按收支与分类筛选、按金额与时间排序、分页 50 条、点击行看详情抽屉）。
- 失败处理：未找到附件 → `BILL_NOT_FOUND`（提示"未在最近 N 天邮件中找到支付宝账单附件，可用手动导入"）；CSV 无表头 → `BILL_PARSE_FAILED`（提示"文件不是支付宝账单格式"）；加密 ZIP → 明确提示"该压缩包有密码，请手动解压后导入 CSV"。
- **首次使用与依赖缺失的引导**（禁止出现空表格、空图表或报错堆栈），按四种状态分别呈现：
  1. **未配置任何邮箱账户**（`mail_accounts` 为空）：整页替换为引导卡片。标题"先连接一个邮箱"，正文说明"支付宝每月会把账单文件发到你的邮箱，连接后可一键导入并统计"，主按钮"去设置添加邮箱"（跳转设置页 IMAP 区块并聚焦第一个输入框），次按钮"手动导入文件"保持可用。此时"一键获取"按钮降为次要样式，点击同样打开该引导，**不得**抛 `BILL_NOT_FOUND` 或任何错误。
  2. **已配置账户但从未导入过**（`bill_imports` 为空）：引导卡片标题"获取第一份账单"，正文写明将要做什么（"搜索最近 90 天来自支付宝的邮件，读取附件中的账单文件"），含账户下拉（默认第一个启用账户）+ 主按钮"一键获取" + 次按钮"手动导入文件" + 一行浅色说明"搜不到时可以手动导入导出的 ZIP 或 CSV"。
  3. **已有历史数据但本次未找到**：保留已有图表与明细不动，用内联提示条展示 `BILL_NOT_FOUND` 文案并给"手动导入"入口，不清空数据、不弹模态。
  4. **账户认证失败**：提示条写明"该邮箱授权码失效或被服务器拒绝"，附"去设置修正"按钮，服务器原文折叠显示。
  以上引导统一用 `EmptyState` 组件（图标 + 标题 + 说明 + 主次按钮），不用插画大图；处于状态 1 或 2 时，侧栏该模块图标不显示红点或错误标记，避免用户误以为出错。
- 首页账单卡片在未配置邮箱时摘要显示"未配置邮箱"，点击直达设置页邮箱配置区块；配置完成返回后摘要自动刷新为"暂无账单，去获取"。

**数据源**：RSS/Atom 与 JSON（配置 `itemsPath` + `tsField` + `valueField`）两类；抓取后归一化写入 `data_points`；图表按数据源类型自动选择折线/柱状；失败展示上次成功时间与错误原因。

**AI**：OpenAI 兼容配置（baseURL / apiKey / model / temperature / maxTokens），`/models` 不保证可用时以手动输入模型名为准；对话抽屉（右侧滑入 380px），流式输出，支持停止；上下文动作：选中笔记→"总结/提取待办/续写"，选中邮件→"摘要/判断是否需要回复"，账单页→"本月消费分析与异常提醒"，待办列表→"今日安排建议"；会话历史落库。

**设置**：数据目录与占用、AI 配置与连通性测试、IMAP 账户、账单获取偏好（回溯天数）、导出全量备份（JSON + db 副本到用户选择目录）、外观（浅色/深色/跟随系统）、版本与开源许可。

## 9. 非功能要求

- 数据库连接单例，启动时执行迁移；所有写操作走事务；`better-sqlite3` 必须 `electron-rebuild` 后运行（ABI 不匹配会直接崩）。
- 主进程不得在 `app.ready` 前创建窗口；所有 service 懒初始化，IMAP 同步不阻塞首屏。
- 主进程在进行 IMAP 同步与账单解析时不得阻塞渲染，进度必须可见；单账户同一时刻只允许一个同步任务。
- 日志：写 `userData/logs/main.log`（简单轮转，单文件 2MB），只在主进程；不打印任何密钥、邮件正文、账单原文。
- 崩溃隔离：任一 IPC handler 抛错不得导致窗口白屏，渲染层统一 ErrorBoundary。
- 打包：`pnpm build` 产出 `dist/`，`pnpm dist` 产出 `dist/WorkBase-Setup-<version>.exe`；`asar` 开启，原生模块与 imapflow 依赖 `asarUnpack`。

## 10. 验收标准（由审批方逐项核对）

1. `pnpm typecheck` 0 error，`pnpm lint` 0 error，`pnpm build` 成功。
2. 主进程窗口配置满足第 3 节安全项（逐项读 `window.ts` 核对）。
3. 首次启动自动建库，重启后数据仍在；删除 `workbench.db` 可干净重建。
4. 笔记/待办 CRUD、搜索、重启持久化可用。
5. 导航：侧栏、更多面板、首页卡片、命令面板、快捷键全部由 `registry.ts` 派生；`rg -n "'notes'|'todos'|'mail'|'bills'|'sources'" src/renderer/src/components/layout/` 不得出现模块 id 字面量。
6. 导航：pin 4 个模块后重启仍生效；pin 超过 6 个时侧栏只显示前 6 且更多面板有提示；取消 pin 后侧栏立即消失。
7. IMAP 用真实账户同步成功（至少 1 个账户），图表有数据；错误密码给出中文可读报错且不崩溃。
8. 账单：用真实支付宝导出 ZIP（GBK 编码、含前置说明行）通过"一键获取"从邮箱导入成功，去重正确（同一文件导入两次，第二次新增 0、重复 N）；四张图有数据；撤销导入后明细清空。
9. 账单：非支付宝 CSV（如普通表格）导入时给出 `BILL_PARSE_FAILED` 中文提示且不写脏数据；含 `../` 路径的恶意 ZIP 被拒绝解压。
10. AI 配置后流式对话可用，未配置时给出明确引导而非报错堆栈。
11. 打包出的 `.exe` 在无开发环境的路径下能启动、能建库、能同步。
12. 界面在 1360×860 与 1080×700 两档下无溢出、无重叠、无滚动条双重嵌套（含更多面板展开态）。
13. 无 `console.log` 残留调试输出，无硬编码密钥，无 TODO 占位实现。
14. `git diff` 范围与阶段任务一致，未擅自改动设计文档与已完成的模块。
15. 账单首启引导：清空 `mail_accounts` 后进入账单页，显示"先连接一个邮箱"引导卡片（含"去设置添加邮箱"与可用的"手动导入文件"），无空表格、无空图表、无报错；点击"一键获取"同样进入引导而非抛错。已配置账户但库中无账单时，显示"获取第一份账单"引导并预选账户。首页账单卡片在未配置邮箱时显示"未配置邮箱"，点击直达设置。
16. 模块可插拔（关键验收，必须实测）：在 `features/` 下新建一个测试模块的 `module.tsx`，**不改其它任何文件**，重启 dev server 后它自动出现在更多面板、命令面板与首页"从更多添加"中，能 pin 到侧栏、能从路由直达、能打开页面；删除该文件并重启后，其入口、路由与 pin 记录自动消失且应用不报错。
