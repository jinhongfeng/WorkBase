# WorkBase 桌面工作台 — 设计规范

> 本文件是实现的唯一事实来源，必须与代码同步。改动架构、依赖、数据模型或对外契约时，先改本文件再改代码；发现文档与代码不一致，以「修好两者之一」为准，不允许只改一边。

## 1. 目标与边界

**目标**：一个纯本地、离线的个人工作台桌面应用。记录一切（笔记/日记/待办/习惯/专注）、聚合外部数据（邮箱邮件、支付宝账单）、用 AI 加工这些内容、用图表呈现。

**硬约束**

- 数据只落本地磁盘，不经过任何自建服务器。外部请求限于用户自己配置的 AI 接口、IMAP 服务器、图片/壁纸直链、用户主动获取英文报道时对指定来源的 HTTPS 请求、AI 每日简报对 `https://aihot.tech/feed/daily.xml` 和 `https://aihot.tech/zh/daily/` 的 HTTPS 请求、用户主动查看素材榜单时对第 3 节所列平台的 HTTPS 请求，以及 RSS 订阅对用户自行添加的 HTTP/HTTPS 源、源内配图和用户主动加载的公开 HTTPS 原文的请求（见第 8 节「RSS 订阅」）。
- 单机单用户，无账号体系、无云同步、无遥测。
- 产物是 Windows x64 安装包（NSIS `.exe`）与免安装版。
- 冷启动 < 2s（SSD），空库内存占用 < 300MB，1 万条笔记列表滚动不掉帧。
- 新增一个功能模块的成本必须是「加一份注册项 + 一个页面 + 可选的数据通道」，不改导航代码。

**非目标（V1 明确不做）**：多端同步、移动端、团队协作、插件市场、AI 训练/微调、邮件发送（只读同步）、账单编辑（只读导入与统计）、Wallpaper Engine `scene.pkg` 解包与场景渲染。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 壳 | Electron 45.2.1 | 邮件同步依赖 Node 生态（imapflow）、SQLite 用 better-sqlite3 同步 API、AI 流式请求走主进程。Tauri 需要把这三件事全部用 Rust 重写，出错面大、返工成本高。 |
| 构建 | electron-vite 6 + electron-builder 26 | 官方推荐组合；`externalizeDepsPlugin` 能正确处理原生模块与 IMAP 依赖 |
| 渲染 | React 19.3 + TypeScript 5.9 + Vite 8.3 | 生态与可维护性 |
| 样式 | Tailwind CSS 4（`index.css` 内 `@import "tailwindcss"`）+ CSS 变量 + 手写 CSS | token 集中管理，主题切换成本低。**实际组件样式以 `styles/*.css` 手写类为主**，Tailwind 仅提供工具类入口，不承担组件样式 |
| 富文本 | TipTap 3（starter-kit + table / task-list / image / link / placeholder） | 所见即所得编辑表格、任务列表、图片；对外仍以 Markdown 存取 |
| Markdown | marked（渲染）+ turndown（HTML→MD）+ 自写 `lib/markdown.ts` | 编辑器内部 HTML 与存储 Markdown 互转 |
| 状态 | Zustand 5（按域拆分 store） | 轻量，无 Provider 嵌套 |
| 图表 | Recharts 3 | 声明式，契合 React，样式可控 |
| 图标/动效 | lucide-react + motion | 线性图标风格统一 |
| 校验 | zod 4 | IPC 入参统一校验 |
| 存储 | SQLite（better-sqlite3 13）+ WAL | 单文件、事务、同步 API。笔记全文检索走 `notes_fts`（trigram 分词、触发器同步），见第 5 节说明 |
| 邮件 | imapflow + mailparser | 只读 IMAP + 解析 |
| 账单解析 | @zip.js/zip.js + TextDecoder + csv-parse | 支付宝导出为 GBK 编码 ZIP 内 CSV，含引号内逗号与前置说明行；支持 ZipCrypto/AES 加密 ZIP 与 GB18030 CSV，无需原生编译 |
| HTML 清洗 | dompurify | 邮件 HTML 渲染前清洗 |
| 资讯解析 | htmlparser2 | 在主进程解析官方 RSS 与网页，提取文本、来源链接和英文报道配图 |
| 日期 | date-fns 4 | 自然日、自然月切分 |
| 打包 | electron-builder → NSIS + portable | `.exe` 安装包与免安装版 |

实际版本号以 `docs/STACK.md` 为准，升级依赖后同步更新该文件。

**禁止引入**：electron-forge（与 electron-vite 冲突）、TypeORM/Prisma（重）、Ant Design/MUI（视觉不可控）、drag-and-drop 类库（用原生 HTML5 draggable 即可）、图表二次封装库、任何远程日志/埋点 SDK、任何需要在线激活的库。

## 3. 进程架构与安全边界

```
main (Node)          preload (isolated)        renderer (React)
├─ SQLite 仓储        contextBridge 白名单      ├─ UI / 交互
├─ IMAP 同步      ←→  window.api.<domain>.*  ←→ ├─ Zustand
├─ 账单解析           (仅暴露函数，不暴露 ipcRenderer)  ├─ 模块注册表
├─ AI 请求代理                                  └─ Recharts
├─ 壁纸/媒体资产管理
└─ safeStorage 加解密
```

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`、`backgroundThrottling: false`（失焦或最小化时壁纸动画与专注计时不得被节流）。
- 渲染进程**不得**直接访问 fs / net / child_process / ipcRenderer。
- 素材榜单由主进程按平台和榜单类型访问下列固定公开 HTTPS 地址，拒绝重定向，限制响应大小和时间，不发送凭据或创作内容。快手从网页内嵌 JSON 读取榜单，其他平台返回 JSON。无需执行网页脚本或下载任何媒体、字幕、图片或子资源。
  - B 站 `https://api.bilibili.com/x/web-interface/ranking/v2?rid=36&type=all`（知识区）或 `https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all`（全站）。
  - 抖音 `https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/`，快手 `https://www.kuaishou.com/brilliant`。
  - 微博 `https://weibo.com/ajax/side/hotSearch`，知乎 `https://api.zhihu.com/topstory/hot-lists/total`。
  - 百度 `https://top.baidu.com/api/board?platform=pc&tab=realtime`，今日头条 `https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc`。
- 所有外发请求（AI、IMAP、壁纸/媒体/封面直链、英文报道、AI 每日简报）在主进程发起，避免 CORS 与密钥暴露。英文报道访问 `learningenglish.voanews.com` 的指定 RSS 和文章路径，拒绝跨站跳转。配图仅在主动联网打开报道或补图时从 VOA 的 `gdb.voanews.com` 图片地址下载，拒绝跳转，按图片格式和大小校验后交给阅读器显示。报道请求不发送凭据，不加载网页脚本、播放器或其他资源。AI 每日简报只访问固定的 RSS 和中文简报地址，拒绝跳转，不发送凭据，不加载网页脚本或子资源。
- 渲染进程加载内容统一 `setWindowOpenHandler` 拦截外链 → 交给系统浏览器；禁止 `window.open` 新窗口。
- 所有 `ipcMain.handle` 入参用 zod 校验，非法入参抛结构化错误 `{code, message}`。
- CSP（`src/renderer/index.html`）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: wb-asset:; font-src 'self' data:; media-src 'self' blob: wb-asset:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; frame-src wb-plugin:`。新增资源来源必须同步改这里，否则图片/视频会被静默拦截。
- 外部插件在沙箱 iframe 中通过 `wb-plugin://<插件 ID>/` 运行。各插件使用独立来源，只能加载同一插件目录中的普通文件。主进程验证路径与实际位置，插件页面的 CSP 限制外部网络、内嵌页面和表单提交。插件子页面没有 `window.api`，禁止跳出插件来源或打开新窗口。
- 本地资源统一走自定义协议 `wb-asset://`，`protocol.handle` 转发 Range，视频可 seek。hostname 白名单：
  - `images` / `wallpapers` / `immersive-wallpapers` / `skill-covers` / `shelf-covers` / `media` / `memories`：`<uuid>.<ext>` 形式的文件名，`resolveAssetPath` 校验；
  - `wallpaper-engine`：`/<64 位十六进制项目 id>`，由扫描登记表映射到项目预览图，不开放任意本地路径。
- ZIP 解压必须防路径穿越（拒绝路径段含 `..`、绝对路径、盘符的条目）与 zip bomb（解压总量上限 50MB、单文件 20MB、条目数上限 200）。

## 4. 目录结构

```
workbase/
├─ AGENTS.md                  # 项目级规则
├─ docs/                      # 设计、阶段计划、审计与提示词
├─ resources/                 # 图标等打包资源
├─ scripts/build-assets.mjs   # 构建期资源处理
├─ temp/                      # 中间产物、截图、验证日志（不入库）
├─ src/
│  ├─ main/
│  │  ├─ index.ts             # app 生命周期、协议注册、窗口创建
│  │  ├─ window.ts            # 窗口状态记忆、标题栏覆盖层配色
│  │  ├─ tray.ts              # 托盘与关闭行为
│  │  ├─ storage.ts           # 数据目录定位、data-location.json 指针
│  │  ├─ assets.ts            # wb-asset 落盘/下载/流式服务、媒体与封面常量
│  │  ├─ bill-import.ts       # 支付宝 ZIP/CSV 解析
│  │  ├─ bill-mail.ts         # QQ 邮箱检索账单附件
│  │  ├─ skills.ts            # SKILL.md 解析与包导入
│  │  ├─ log.ts               # 主进程日志
│  │  ├─ ai/
│  │  │  ├─ client.ts         # OpenAI 兼容流式、配置读写
│  │  │  ├─ prompts.ts        # 各场景提示词
│  │  │  └─ ielts.ts          # 学习包生成
│  │  ├─ security/secrets.ts  # safeStorage 加密读写
│  │  ├─ db/
│  │  │  ├─ index.ts          # 连接、WAL、迁移执行
│  │  │  ├─ migrations/       # 按序增量迁移，见第 5 节
│  │  │  └─ repo/             # activity ai bills growth ielts media memories notes settings skills todos
│  │  ├─ services/
│  │  │  ├─ wallpaper.ts      # 壁纸资产、配置、明暗判定
│  │  │  ├─ wallpaper-engine.ts # Steam 库发现与项目扫描
│  │  │  └─ backup.ts         # 备份导出
│  │  └─ ipc/                 # ai app assets bills errors growth ielts media memories notes settings skills storage todos validation wallpaper
│  ├─ preload/index.ts        # contextBridge 白名单，暴露 window.api
│  ├─ shared/
│  │  ├─ types.ts             # 跨进程共享类型（单一来源）
│  │  ├─ ipc-contract.ts      # 通道名常量
│  │  └─ bills.ts             # 账单类型
│  └─ renderer/
│     ├─ index.html           # 含 CSP
│     └─ src/
│        ├─ main.tsx, App.tsx, router.tsx
│        ├─ styles/tokens.css, base.css, layout.css, ui.css, components.css, features.css, appearance.css, splash.css, index.css
│        ├─ modules/registry.ts       # glob 自动扫描 features/*/module.tsx
│        ├─ modules/defineModule.ts   # 模块定义、类型约束与默认值
│        ├─ modules/groups.ts         # 分组顺序
│        ├─ lib/                      # markdown、utils 等纯函数
│        ├─ components/layout/        # AppShell / Sidebar / TitleBar / MorePanel / CommandPanel / Wallpaper / Splash + splash-particles
│        ├─ components/ui/            # Button / Dialog / EmptyState / ErrorBoundary / Input / ScrollArea / Select / Spinner / Textarea / Toast / Tooltip
│        ├─ features/<id>/module.tsx  # 模块入口：新增功能只需新增这一个文件
│        ├─ features/<id>/            # 该模块页面组件、hooks 与同目录样式
│        └─ stores/                   # ai focus navigation theme wallpaper
└─ electron.vite.config.ts, electron-builder.yml, package.json, tsconfig*.json
```

## 5. 数据层

**位置**：默认 `app.getPath('userData')/data/workbench.db`，资产落 `data/files/`（`images` / `media` / `memories` / `shelf-covers` / `wallpapers` / `immersive-wallpapers` / `skill-covers` / `skills`）。

**数据目录可迁移**：当前目录记录在 `userData/data-location.json`（唯一指针文件，与数据本体分离）。更改保存位置时复制现有数据、保留原目录、写新指针并自动重启；指针缺失或损坏时回落到默认目录，不阻断启动。设置页提供「更改保存位置 / 用回默认位置 / 打开数据目录 / 导出备份」。

**外部插件位置**：当前数据目录下的 `files/plugins/`。该目录随附件一起迁移和备份。

**加密**：AI API Key 等敏感值经 `safeStorage.encryptString()` 加密为 base64 存 `secrets` 表；`safeStorage.isEncryptionAvailable()` 为 false 时拒绝保存明文并报错，不得降级。

**迁移归属（唯一口径，禁止修改已执行文件，禁止把后续阶段的表塞进 001）**

| 文件 | 内容 |
|---|---|
| `001_init.sql` | settings、notes、notes_fts、todos |
| `002_notes_secrets.sql` | notes 增加 `kind`（note/journal）与 `journal_date`（唯一索引）、`secrets` 表 |
| `003_ielts.sql` | ielts_sets、ielts_items、ielts_reviews |
| `004_growth.sql` | habits、habit_logs、focus_sessions |
| `005_mail.sql` | mail_accounts、mails |
| `006_bills.sql` | bill_imports、bill_txns |
| `007_skills.sql` | skills、skill_files |
| `008_activity.sql` | activity_tracking、note_writing_daily、ielts_study_daily，以及 `todos(done_at)`、`habit_logs(date)` 索引 |
| `009_bills_v2.sql` | bill_txns 增加 `direction`、`counterparty`（仅加列） |
| `010_media.sql` | media_items |
| `011_ai.sql` | ai_threads、ai_messages |
| `012_media_groups.sql` | media_groups、media_items 增加可空的 group_id |
| `013_media_hash.sql` | media_items 增加字节与图片位图去重指纹 |
| `014_memories.sql` | memories，保存纪念记录与其照片文件名 |
| `015_vault.sql` | password_vault，保存密码库盐值与加密数据 |
| `016_english_articles.sql` | english_articles，按来源文章标识保存标题、原文链接、发布日期、正文和保存时间 |
| `017_daily_briefs.sql` | daily_briefs，按来源期号日期保存标题、摘要与同步时间 |
| `018_daily_brief_stories.sql` | daily_briefs 增加可空的 `stories`，保存中文标题、摘要、详情链接的 JSON 数组 |
| `019_daily_brief_dismissals.sql` | daily_brief_dismissals，保存用户删除的期号及其最近同步时间 |
| `020_library_folders.sql` | note_folders、skill_folders，笔记和 Skill 增加可空的 folder_id。升级时用旧 Skill 标签建立同名文件夹，每个 Skill 归入首个非空标签对应的文件夹 |
| `021_ielts_reading.sql` | ielts_sets 增加可空的 reading，ielts_items 增加 word_family |
| `022_english_article_images.sql` | english_articles 增加可空的 images，保存配图数据、图注及正文位置 |
| `023_notes_fts.sql` | 重建 notes_fts 为 trigram 分词，补 insert/delete/update 触发器并 rebuild 回填 |
| `024_clipboard.sql` | clipboard_items，保存文本剪贴板历史与置顶标记 |
| `025_shelf.sql` | shelf_items，书影音收藏（类型/状态/评分/短评/封面/起止日期） |
| `026_bills_budget.sql` | bill_budgets（按月预算）与 bill_rules（交易对方分类规则） |
| `027_sources.sql` | sources 与 source_entries，RSS 订阅源与条目缓存 |
| `028_source_covers.sql` | source_entries 增加可空的 `cover`，缓存文章卡片配图 |
| `029_source_article_body.sql` | source_entries 增加可空的 `body`，缓存工作台内阅读的正文 |
| `030_page_time.sql` | page_time（页面 × 本地自然日累计停留秒数），供统计页「页面停留」卡 |

新增迁移从 `024` 起继续递增，不复用序号。

**Schema（关键列，省略默认值与索引细节的以迁移文件为准）**

`001_init.sql`

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE notes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',        -- 逗号分隔，前置逗号便于 LIKE 精确匹配
  pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content='notes', content_rowid='rowid', tokenize='unicode61');
-- 注意：001 建表时未触发器同步且一直未使用。023 迁移将其重建为 trigram 分词
-- （unicode61 不切分中文），补 insert/delete/update 触发器并 rebuild 回填。
-- 仓储检索：标题与正文在查询 ≥3 字符时走 notes_fts MATCH（trigram 子串匹配），
-- 更短的查询与标签、文件夹名匹配保留 LIKE。

CREATE TABLE todos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2,  -- 1 高 2 中 3 低
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
```

`002` 起追加/新增的表：

```sql
-- 002：笔记区分为笔记与日记，日记按日期唯一
ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE notes ADD COLUMN journal_date TEXT;
CREATE UNIQUE INDEX idx_notes_journal_date ON notes(journal_date) WHERE journal_date IS NOT NULL;
CREATE TABLE secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

-- 003：雅思
ielts_sets(id, title, topic, level, created_at)
ielts_items(id, set_id→ielts_sets, kind word|sentence, term, phonetic, pos, meaning,
            example, translation, collocation, band, mastery 0-5, wrong, review_at, created_at)
ielts_reviews(id, item_id→ielts_items, known, reviewed_at)
-- 021：reading 保存精读原文、中文大意、句子拆解、同义替换和写作句型的 JSON 对象。
-- word_family 保存单词词族，旧词条默认空字符串，旧学习包的 reading 为空。

-- 004：习惯与专注
habits(id, name, icon, color, target, sort, created_at)
habit_logs(habit_id→habits, date, count, PRIMARY KEY(habit_id, date))
focus_sessions(id, minutes, label, started_at)

-- 005：邮件
mail_accounts(id, label, host, port, secure, username, secret BLOB, mailbox, sync_days,
              enabled, last_sync_at, last_error, created_at)
mails(id, account_id→mail_accounts ON DELETE CASCADE, uid, folder, message_id, subject,
      from_name, from_addr, to_addrs, sent_at, snippet, text_body, html_body, size,
      has_attachment, read, fetched_at, UNIQUE(account_id, folder, uid))

-- 006 + 009：账单（009 仅追加两列，不重建表）
bill_imports(id, source email|file, file_name, created_at)
bill_txns(fingerprint PK, import_id→bill_imports, ts, category,
          amount_cents CHECK(amount_cents >= 0), direction income|expense, counterparty)

-- 007：Skill 库
skills(id, name, slug UNIQUE, description, content, frontmatter, tags, source, source_ref,
       layout dir|file, cover_kind none|image|video, cover_path, cover_remote, pinned,
       created_at, updated_at)
skill_files(id, skill_id→skills, path, size, UNIQUE(skill_id, path))

-- 008：年度活动统计
activity_tracking(id CHECK(id = 1), started_at)          -- 记录起点，不回填历史
note_writing_daily(date, note_id, baseline_words, peak_words, PRIMARY KEY(date, note_id))
ielts_study_daily(date PK, milliseconds CHECK(milliseconds >= 0))

-- 010：媒体库
media_items(id, type image|video CHECK, source local|url CHECK, name, file_name,
            original_name, original_url, mime, size, created_at)

-- 011：AI 会话
ai_threads(id, title, created_at, updated_at)
ai_messages(id, thread_id→ai_threads ON DELETE CASCADE, role, content, created_at)

-- 012：媒体分组
media_groups(id, name UNIQUE, description)
media_items.group_id → media_groups ON DELETE SET NULL

-- 014：纪念时间线
memories(id, event_date, event_time, content, image_files, created_at, updated_at)
-- event_date 是 YYYY-MM-DD，event_time 可空或为 HH:mm，保留录入时的日期与钟点。
-- image_files 是专属照片文件名的 JSON 数组，按选择顺序保存。
```

账单方向说明：迁移只加列不加列级 CHECK，方向由解析层规范为 income / expense；旧记录按支出且交易对方为空，无法回填原始方向。

**预算与分类规则（叠加层，不改原始交易数据语义）**

- `bill_budgets` 按北京时间自然月保存预算金额；账单页「本月预算」卡显示本月已支出/预算/剩余，超支时进度条与文案转警示色。预算以元输入、以分保存，清空输入后保存即移除该月预算。
- `bill_rules` 保存「交易对方包含关键字 → 分类」规则。导入时在落库前按规则改写分类（先创建的规则优先），订单号判重口径不受影响（无订单号交易的旧签名仍按导入时的原始分类计算）；「分类规则」弹窗可增删规则并对已有账单执行「应用到已有账单」（逐条 UPDATE，返回更新行数）。规则改写的是统计口径中的分类，交易原始文本不保存修改记录。

**settings 约定键**

| key | 值 | 说明 |
|---|---|---|
| `ui.pinned_modules` | JSON 字符串数组 | 侧栏与首页的常用模块，顺序即展示顺序 |
| `ui.dashboard_cards` | JSON 字符串数组 | 首页卡片的显示列表与顺序；空数组表示全部隐藏，未设置时用卡片默认值 |
| `ui.dashboard_card_sizes` | JSON 对象，如 `{"notes/today-journal":"l"}` | 卡片尺寸覆盖，`m` 单列 / `l` 跨满两列；只记非默认值 |
| `ui.dashboard_card_cols` | JSON 对象，如 `{"notes/quick-capture":"left"}` | 卡片在两列网格中的归属，值为 `left` / `right`；未记录时按左右计数均衡分配 |
| `ui.wallpaper` | JSON（`WallpaperConfig`） | 壁纸清单、当前选中、轮播开关、间隔、蒙层 |
| `ui.immersive_wallpaper` | JSON（`WallpaperConfig`） | 沉浸背景模式与独立壁纸配置，素材存入 `data/files/immersive-wallpapers/` |
| `ui.immersive_study` | JSON（`{ notes: boolean, english: boolean, englishSetId: string \| null }`） | 沉浸学习入口和默认英语学习包，两项入口默认开启，`null` 表示全部学习包 |
| `ui.immersive_scenes` | JSON（`{ items: string[] }`） | 沉浸控制面板中的场景选项与顺序，取值 `study` / `study-notes` / `study-english` / `video` / `image` / `relax`；空或非法时回退默认（学习、阅读笔记、视频、图片、放松） |
| `ui.immersive_ambience` | JSON（`{ effect, track, volume }`） | 沉浸氛围的特效、纯音乐曲目与音量。默认无特效，音乐每次进入由用户启动 |
| `ui.focus_target` | 数字字符串 | 专注页今日目标分钟数，5–480，默认 25 |
| `ui.shortcuts` | JSON（`Record<string, string>`） | 历史自定义快捷键映射：key 为模块 id 或 `command`（命令面板），value 为 Ctrl/⌘ 组合里的字母或数字。启动时读取并继续生效，当前版本不提供修改入口 |
| `ui.wallpaper_engine_directories` | JSON 路径数组 | 手动指定的 Wallpaper Engine 安装目录/壁纸库 |
| `app.close_action` | `tray` / `quit` | 勾选「记住我的选择」后保存的关闭操作 |
| `notify.todos` / `notify.habits` / `notify.memories` | `'1'` / `'0'` | 本地系统提醒开关，默认开。主进程每分钟巡检：待办当日到期或逾期每日提醒一次；习惯在 20:00–22:00 提醒一次当日未完成项；纪念日为时间线中同月日（跨年份）的记录当天提醒 |
| `clipboard.enabled` | `'1'` / `'0'` | 剪贴板文本记录开关，默认开；关闭后主进程暂停轮询，历史保留 |
| `ai.baseUrl` / `ai.model` / `ai.temperature` / `ai.maxTokens` | 字符串/数字字符串 | AI 配置；密钥单独存 `secrets` 表，不进 settings |

**规则**

- 迁移：按序号递增的 `.sql`，`user_version` 记录版本，启动时顺序执行、包在事务里。
- 绝对时间统一存 Unix 毫秒（INTEGER），展示层转换；「自然日」按本地时区计算，账单的月/年按北京时间。纪念记录的日期和可选钟点按录入值存储，切换系统时区时仍按原值展示。
- 应用新建记录的 ID 用 `crypto.randomUUID()`。SQL 迁移为旧 Skill 标签生成的文件夹 ID 使用 SQLite 的随机字节。
- 仓储层只暴露语义化方法（`listNotes({q, tag, limit})`），**禁止**把 SQL 字符串从渲染进程传进来。
- 统计图表所需的聚合查询放仓储层（`statsByMonth` / `statsByCategory` / 年度活动逐日聚合），不允许把全量明细拉到前端再算。

## 6. IPC 契约

通道名集中定义在 `src/shared/ipc-contract.ts`，命名 `<domain>:<action>`。preload 暴露为 `window.api`：

```
api.plugins   list() → [{id,name,entryUrl}] / onChanged(cb) → 取消函数 / openDirectory()
api.notes     list({query,kind,pinnedOnly,limit,offset}) / listPage(同参数，返回 items,total,offset)
              / get / getJournal(date) / save / remove / togglePin / stats
              / trash() → 已归档笔记列表 / archive(id) 移入回收站 / restore(id) 恢复
              / export({id,format:'md'|'html'|'pdf'}) → {path} | null  # 导出已保存版本，取消时为 null
              / wikiTarget(title) → {id} | null  # 双链目标：按标题精确匹配
              / backlinks({title,excludeId?}) → NoteSummary[]  # 反向链接，最近更新优先，最多 20 条
api.memories  list(page, year?, query?) → {items,total,page,year,years,query,photos,days} / save({id?,date,time,content,keepImages,images}) / remove(id)
              # images 为本次新增的图片字节，keepImages 为同一记录保留的文件名
              # total 为当前筛选（年份+关键字）的记录数，years 为全部年份与各自的记录数
              # photos/days 为全库照片总数与有记录的日期数（不随筛选变化）
api.shelf     list({kind,status,q}) → ShelfItem[] / stats() → {total,wish,doing,done}
              / save({id?,kind,title,creator?,status,rating?,comment?,startDate?,finishDate?,keepCover,cover?}) → ShelfItem
              # keepCover 为保留的旧封面文件名，null 表示移除；cover 为本次新增的图片字节
              / remove(id)  # 封面文件随记录删除
api.sources   list() → Source[]（含 unread） / entries({sourceId,q?,unreadOnly?,page}) → 分页条目
              / add({name,url}) / update({id,name?,enabled?}) / remove(id) → Source[]
              / refresh({id|null}) → {results:[{sourceId,name,ok,added,error}]}  # null 为全部启用源
              / setRead({id,read}) / openEntry(id) → 系统浏览器打开原文链接
api.todos     list / save / toggle / remove / clearDone / reorder(ids)  # 分组内拖拽后按顺序重写 sort
api.clipboard list({q,limit,offset}) → {items,total,offset} / copy(id) → 写回系统剪贴板并提升历史位置
              / togglePin(id) → 置顶后的条目 / remove(id) / clear()  # 只清未置顶 / setEnabled(enabled)
api.ielts     sets（含 hasReading） / items(setId) / reading(setId) → 精读内容或 null
              / generate({topic,level,kind,count} 或 {topic,level,kind:'reading',passage?}) / review({id,known})
              / removeSet(id) / stats / studyPulse({sessionId,active})
api.englishArticles  discover(topic) / fetch(url) / list() / get(id) / save(article) / refreshImages(id) / remove(id)
api.dailyBriefs list() → {items,lastSyncedAt,syncing,error} / refresh() / remove(date) / onChanged(cb) → 取消函数
              # items 中的 syncedAt 为每期最近成功获取的时间（Unix 毫秒）
api.habits    list / create({name,icon,color?,target?}) / remove / toggle({id,date})
              / setCount({id,date,count}) → 计数型打卡写次数，0 清除，超出目标截断
api.focus     add({minutes,label}) / stats
api.mail      （模块当前 hidden，通道未启用；账户与同步逻辑保留在 005 与 bill-mail）
api.bills     account / saveAccount({email,authorizationCode})
              fetchFromMail({password,sinceDays}) / importFile() / unlockFile({id,password}) / cancelFileImport(id)
              overview({range,page})   # 独立的本月收支、范围内收支与分析，明细每页 50 条
              rows({range,page,query?,direction?}) → {rows,total}  # 交易明细独立查询，关键字匹配交易对方/分类，筛选只影响明细不影响图表
              budget({month}) → {month,budgetCents,spentCents,incomeCents,txnCount}  # budgetCents 为 null 表示未设置
              setBudget({month,amountCents|null}) / rules() / saveRule({id?,pattern,category}) / removeRule(id) / applyRules() → {updated}
api.ai        config / saveConfig({baseUrl,model,temperature,maxTokens,apiKey?}) / test
              chat({requestId,threadId,messages}) / regenerate({requestId,threadId}) / abort(requestId) / onDelta(cb) → 取消函数
              # regenerate 裁掉末尾 assistant 回复后按原上下文重发，成功后只补写 assistant 消息
              threads.list / threads.create / threads.messages / threads.rename / threads.remove
              generateArticle({category,topic}) → {title,lead,body,summary,factChecks}
              # category 为 humanities、science 或 history。topic 可留空，留空由 AI 选题
              dailyReport({date?}) → {content}  # 汇总当日本地记录生成回顾，不落会话
api.articleReferences discover({platform,category?}) → {items,fetchedAt}
              # 仅 B 站接受 category（all 或内容领域）；原 discover(category) 仍可用于 B 站知识区
              / analyze({category,references,perspective}) → {sources,angles}
              / create({category,perspective,angle,techniques,format,seconds?}) → 文章草稿或视频策划
api.skills    list({q,source}) / get / save / create({fromId?}) / remove / togglePin
              importZip() / importDirectory() / importMarkdown() / importPath(path)
              chooseCover(id,kind) / setCoverUrl(id,{url,kind}) / clearCover(id) / reveal(id)
api.libraryFolders  list(library) / save(library,{id?,name}) / moveItem(library,itemId,folderId|null) / remove(library,id)
              # library 为 notes 或 skills。条目摘要通过 folderId 标记归属，null 表示顶层
api.media     list({type,q,page,pageSize,groupId?}) / saveLocalFiles(groupId?) / saveLocalPaths(paths,groupId?)
              / saveBuffers(inputs,groupId?) / saveFromUrl({url,groupId?}) / remove(id) / reveal(id) / openExternal(id)
              / listGroups() / saveGroup({id?,name,description}) / removeGroup(id) / moveToGroup(id,groupId|null)
api.wallpaper get(scope?) / addUrl({url,label},scope?) / addFile(scope?) / addSystem(scope?) / listEngine()
              / chooseEngineDirectory() / addEngine(id,scope?) / remove(id,scope?) / setActive(id|null,scope?)
              / updateConfig({carousel?,interval?,overlay?,mode?,fit?},scope?) / clear(scope?)
api.activity  year({year,sources})
api.settings  getAll / set(key,value) / setPinnedModules(ids)
api.assets    saveImage(dataUrl)
api.data      export() / reveal() / storage() / chooseDirectory() / relocateDefault()
api.app       getPaths / getVersion / setWindowTheme(light|dark) / setWallpaperContrast(dark)
              / relaunch / getFilePath(file) / getLoginItem() / setLoginItem(enabled) → 返回实际生效的开机自启状态
              / hideQuickCapture()  # 速记浮窗请求隐藏
```

- 流式：主进程 `webContents.send('ai:delta', {requestId, delta})`，结束发 `ai:done`；preload 转成回调并返回取消函数。`ipcRenderer.on` 必须在组件卸载时 `removeListener`。
- 退出保存：`api.app.onBeforeClose(save)` 注册保存回调，preload 在 `app:closeReady` 登记后响应主进程的 `app:flushNotes` 请求，并以 `app:flushNotesResult(requestId,saved)` 返回结果。迁移数据目录前复用该握手。
- 长任务（邮件同步、账单获取）通过 `<domain>:progress` 上报 `{phase, done, total}`，`phase` 为中文可读阶段名。
- 错误：统一抛 `{ code: 'IMAP_AUTH_FAILED' | 'BILL_NOT_FOUND' | 'BILL_PARSE_FAILED' | 'AI_NOT_CONFIGURED' | 'WALLPAPER_TOO_LARGE' | 'ASSET_TOO_LARGE' | 'DB_ERROR' | ... , message }`，渲染层用 toast 呈现中文可读文案。
- `setWallpaperContrast(dark)` 保留导出与 IPC 契约以兼容既有调用，但壁纸明暗**不再参与** chrome 配色（见第 7 节），调用只重新应用一次与主题一致的配置。

## 7. 视觉与交互规范

**气质**：克制的浅色、大量留白、细边框、无渐变噪点、动效短而轻。参考 Linear / Raycast 的秩序感，不参考仪表盘大屏的密集卡片。

**Token（`styles/tokens.css`，必须用 CSS 变量，不许散落硬编码色值）**

```
浅色: --bg #EFF3F0  --surface #FFFFFF  --surface-2 #F6F8F6
      --border #E1E8E3  --border-strong #DBE3DE
      --text #202923   --text-2 #4F5D54  --text-3 #5D6B63
      --accent #2C5F52 --accent-soft #E3EFE9  --danger #B4442F  --success #3F7A55
深色: --bg #0B0E0D  --surface #141A18  --surface-2 #19211E
      --border #26302C  --text #F1EEE6  --text-2 #A5AEA8  --accent #8CD3B8
圆角: --r-xs 6px --r-sm 8px --r-md 10px --r-lg 14px --r-xl 16px
尺寸: --titlebar 46px  --sidebar 64px（窄）/ 152px（宽）
间距: 2px 基数，优先 4 的倍数，小控件允许 3/5/7 等奇数微调（1px 仅用于线宽）；内容区最大宽度 1100px
字体: UI = "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei UI"; 代码/数字 = "JetBrains Mono"
阴影: --shadow-1 `0 0 0 1px rgba(255,255,255,.45)` + `0 1px 2px rgba(27,25,21,.022)`
      --shadow-2 `0 0 0 1px rgba(255,255,255,.4)` + `0 8px 24px -16px rgba(27,25,21,.14)`
      --shadow-3 `0 24px 50px -28px rgba(27,25,21,.28)`
壁纸: --wp-content-tint 浅色 85% / 深色 86%，苹果 70%
      --wp-content-tint-clear 55%，苹果 52%（清晰背景）
      标题栏与侧栏共用 --wp-sidebar-tint（浅色 80% / 深色 82%）和 --wp-sidebar-blur（10px）
      --wp-sidebar-clear-background 用 45% --surface-2 混合透明色，苹果直接使用 --surface-2
      --wp-panel-tint 52%，苹果 48%；--wp-toolbar-tint 30%，苹果 28%
      --wp-chrome-tint 89% 用于沉浸场景的文字底板
```

**外观一致性约束（硬性，改任何外观前先读）**

1. 边框与阴影只有一套取值，由 `tokens.css` 的主题块决定，**不允许**再按壁纸状态、页面、模块写第二套。`layout.css` 只允许壁纸相关规则修改背景层（底色透明度与背景模糊），不许改 `--border`、`--border-strong`、`--shadow-*`。
2. 壁纸明暗不改变 chrome 配色体系。内容区、标题栏和侧栏叠加当前主题底色，保证首页问候、常用区及导航文字在壁纸模式下可读。主进程的窗口按钮图标色只跟随主题。
3. 禁止散落硬编码色值。新增外观一律走 token；确需固定色（如代码块深底）要在注释里说明为什么不能用 token。
4. 改 token 必须同步改本节列出的值，并检查文档与代码的漂移。文档写错的值会被后续实现当成基准，是「只改一处」的主要来源。
5. 验收方式：同一主题下切换「无壁纸 / 浅色壁纸 / 深色壁纸」，同一元素的计算样式必须逐字段相同（背景层透明度与背景模糊除外）。

**可选外观「界面风格」**

- 「主题」与「界面风格」独立选择。渲染端在本机分别记住 `ui.theme`（`light` / `dark` / `system`）和 `ui.workspaceStyle`（`standard` / `paper` / `neumorphism` / `apple`）。初始为标准，切换即时生效。
- 「主题色」独立于主题与界面风格。渲染端在本机记住 `ui.accent`（`default` 或下方预设 id），写入 `html[data-accent]`；`default` 时不挂属性，沿用当前界面风格自带的强调色。预设取值在 `tokens.css` 的 `--accent-chip-*`（浅色/深色成对给出），覆盖块位于风格块之后，将 `--accent`、`--accent-ink` 与 `--accent-soft`（强调色与当前表面色 16% 混合推导）作用于全部界面；选中态、主操作、focus ring 等 `--action-*` 派生色随 `--accent` 自动跟随，四套风格与浅深色都适配。笔记正文的 `--note-accent` 是刻意的砖红，不随主题色。设置 → 外观提供「主题色」色板，即时生效。主题色预设（`--accent-chip-*`，浅色 / 深色）：moss 苔绿 #3F7351 / #8FCBAA · teal 青 #2F6D68 / #7ED0C4 · sky 天青 #33659B / #85B7E8 · indigo 靛蓝 #4C5C9E / #9FADEF · plum 紫 #7D5292 / #C39BDF · rust 赭红 #A34B33 / #E29B7E · amber 琥珀 #8F6623 / #DFB566 · rose 玫红 #A05066 / #E39FB1。设置页「风格默认」色板取 `--accent-default-swatch`，始终指向当前界面风格自带的强调色。
- 四种界面风格的颜色 token 均作用于全部界面（切换页面不跳变），并跟随当前浅色 / 深色主题；纸面风格的装饰元素（横线、胶带、回形针等结构性规则）仍只出现在首页、笔记和待办。
- 两种新风格的 token 覆盖统一定义在 `tokens.css` 的风格块，通用结构性规则（拟态的内凹 / 凸起、苹果的毛玻璃）在 `styles/appearance.css`；功能页的风格化规则跟随纸面先例放在对应功能样式（如笔记 Markdown 排版在 `notes.css`），颜色一律走 token。不允许在功能样式里为风格再写第二套 token 取值，边框与阴影仍只有一套取值（外观一致性约束第 1 条）。
- 主操作按钮、侧栏当前入口和首页日期选中态使用同一组 `--action-*` token。底色将标准绿 12%、纸面赭红 10%、拟态雾蓝 7%、苹果蓝 14% 混入各自的表面色，顶端叠加一层逐渐淡出的表面色。苹果使用不透明的 `--surface-solid` 作为底色，边框与文字分别从现有强调色、边框色和文字色推导。悬停、按下时依次加深强调色，拟态的主操作与选中入口按下时由凸起变为内凹。
- 分段控件的底槽和笔记当前文档标签使用 `--control-track`，由表面色混入 5% 正文色。分段选中项和工具栏开启态使用 `--selection-fill`，由 74% 主操作底色与表面色混合，文字与主操作共用 `--action-ink`。未选中文字使用 `--text-2`。
- 功能页沿用 Skill 库的壁纸层级。正文区使用工作台底色，有壁纸时透出壁纸和现有蒙层。独立卡片、统计卡与功能页侧栏使用 `--workspace-panel`，由 `--surface-2` 按 `--wp-panel-tint` 叠在工作台背景上，无壁纸时回到主题表面色。列表行悬停使用 `--surface-2`，选中使用 `--accent-soft`。输入控件、弹窗及覆盖图片的操作层保留各自的主题底色。设置页使用统一实底。
- 笔记文档栏、格式工具栏和状态栏使用 `--workspace-toolbar`，按现有工具栏透明度叠在工作台上。笔记顶部次要文字由 60% 次要文字色与正文色混合。富文本、Markdown 和空态共用工作台画布，纸面风格保留独立的主题纸面轮廓。
- **笔记页 Markdown 排版按界面风格分化**。样式定义在 `features/notes/notes.css`，选择器同时覆盖工作台编辑器（`.notes-app .prose`）与沉浸阅读正文（`.focus-room-note`，正文挂通用 `prose` 类取基础排版），跟随现有浅色和深色主题。沉浸阅读复用笔记页排版并随界面风格切换（沉浸空间保持深色主题，颜色 token 按深色取值）；AI、Skill 沿用各自的 Markdown 排版。
  - 标准采用紧凑的无衬线文档排版，砖红通栏标题线、细边引用、方角代码块和完整网格表格。
  - 纸面采用楷体正文与首行缩进、居中双线大标题、红铅笔点状下划线、带纸胶带的虚线便签引用、有横线的任务清单和账本表格。
  - 拟态采用等宽正文与凹槽标题线，引用、任务清单和代码块使用内凹容器，行内代码使用凸起键帽，表格使用圆角托盘。
  - 苹果采用无衬线大标题和宽松留白、蓝色圆角引用块、紫色行内代码、深色代码块和具有宽松行距的发丝线表格。代码块的深底和浅字跨明暗主题固定，使用本节允许的固定色豁免。
  - 「Markdown」源码模式使用等宽字体，按风格调整行距、留白和输入区轮廓。富文本中显示标题、引用等渲染效果。两种模式沿用原有正文边距设置。
- **拟态**：浅色为雾蓝石面，深色为蓝灰石面，强调色、文字和阴影都采用同一冷色系。凸起靠双向柔和阴影（右下深、左上亮）表达，边框退为同色系浅槽，圆角整体加大。输入、分段容器与快捷键提示内凹，主操作等带底色按钮与选中导航胶囊轻微凸起。
- **苹果**：卡片、弹窗、浮层、列表面板与设置外壳使用 `backdrop-filter: blur(24px) saturate(1.7)`，壁纸态的标题栏与全局侧栏共用壁纸磨砂设置。采用发丝分割线、大面积圆角、系统蓝强调色与系统语义色。输入、描边按钮和设置面板用 `--surface-solid` 保持完整底色。
- 首页使用纸面卡片、日记横线和胶带、待办清单和回形针、月历日期圈记。笔记在原有编辑宽度外显示纸边，富文本与 Markdown 共用纸面。待办保留现有分组、独立卡片和勾选区。装饰不接收鼠标或键盘事件，控件与布局行为沿用标准外观。
- **纸面工作台**：浅色采用暖白纸与赭红墨，深色用暖炭灰衬托稍亮的灰纸，正文用柔和的米白，日期标记与选中态用低饱和的浅赭色。工作区、设置面板、侧栏、边框与文字共用纸面色阶。工作台壁纸沿用现有的蒙层和清晰背景控制，笔记纸面跟随功能页的主题分区底色。

```
纸面浅色 / 深色（暖纸与赭墨）
--bg                  #EFE3D3 / #23211F   --bg-2              #E9D9C7 / #292624
--surface             #FBF4E7 / #302D2A   --surface-2         #F3E8D8 / #272523
--surface-3           #EBDDCB / #3B3733   --border-base       #DCCBB7 / #49443E
--border-strong-base  #BA9D86 / #666059   --text              #32251D / #F1EBE2
--text-2              #594236 / #CDC4B9   --text-3            #695147 / #B4AA9E
--accent              #9C462F / #DFA891   --accent-soft       #F2E1D2 / #473731
--accent-ink          #FFF8EF / #241C18   --paper-date        var(--accent)
--paper-tape          #E8DCB8 / #554B3A   --glass             92% 表面色
--r-lg 4px   --shadow-1 0 2px 4px (#51352926 / #00000055)
--shadow-2 0 3px 7px (#51352938 / #00000070)

拟态浅色 / 深色（雾蓝石面）
--bg / --bg-2 / --surface  #E5EBF4 / #252E40
--surface-2           #DCE4F0 / #1E2636   --surface-3         #D1DBEA / #303C52
--border-base         #D3DEED / #303B52   --border-strong-base #B9C8DD / #465776
--text                #202B3F / #E8EDF8   --text-2            #485970 / #C0CBE0
--text-3              #52647E / #A5B5D0   --accent            #465C82 / #AEC3EC
--accent-soft         #D7E1F1 / #35455F   --accent-ink        #F5F8FF / #182032
--glass               92% 表面色
--r-xs..--r-xl        8 / 10 / 12 / 16 / 20 px
--shadow-1 4px 4px 8px 深(rgba(157,172,197,.48) / rgba(10,14,24,.6))
           -4px -4px 8px 亮(rgba(255,255,255,.9) / rgba(117,136,170,.2))
--shadow-2 10px 12px 26px 同向加深   --shadow-3 20px 26px 52px
--neu-inset inset 2px 2px 5px 深(rgba(157,172,197,.55) / rgba(10,14,24,.7))
            inset -2px -2px 5px 亮(rgba(255,255,255,.9) / rgba(117,136,170,.24))
--neu-highlight 凹槽亮侧 token：rgba(255,255,255,.9) / rgba(117,136,170,.24)

苹果浅色 / 深色
--bg                  #F5F5F7 / #1B1B1D   --surface           rgba(255,255,255,.78) / rgba(40,40,45,.72)
--surface-2           rgba(255,255,255,.58) / rgba(54,54,60,.6)
--surface-3           rgba(255,255,255,.95) / rgba(70,70,78,.85)
--surface-solid       #FFFFFF / #2C2C30   --border-base       rgba(0,0,0,.08) / rgba(255,255,255,.09)
--border-strong-base  rgba(0,0,0,.16) / rgba(255,255,255,.17)
--text                #1D1D1F / #F5F5F7   --text-2            #515154 / #A1A1A8
--text-3              #6E6E73 / #87878D   --accent            #0071E3 / #0A84FF
--accent-ink          #FFFFFF / #0A1411
--accent-2            #AD5700 / #FF9F0A   --accent-3          #7D3CB5 / #BF5AF2
--danger              #D70015 / #FF453A   --success           #248A3D / #30D158
--r-xs..--r-xl        8 / 10 / 13 / 18 / 22 px
--overlay             rgba(0,0,0,.28) / rgba(0,0,0,.5)
--wp-content-tint 70%（clear 40%）  --wp-sidebar-tint 60%  --wp-sidebar-blur 18px
--wp-sidebar-clear-background var(--surface-2)（苹果风格半透明底色）
```

**窗口与布局**

- 窗口默认 1360×860，最小 1080×700，记忆上次尺寸与位置（记忆值小于最小值时抬到最小值）。上次位置所在的屏幕已断开、标题栏不可见时，窗口回到主屏幕。
- 系统托盘：启动后显示 WorkBase 图标，悬浮提示为「WorkBase」。点击主窗口关闭按钮（含 Alt+F4）时，未记住操作则弹出原生提示，提供「最小化到托盘」「彻底退出」「取消」，默认收起到托盘，Esc 取消。提示包含默认不勾选的「记住我的选择」复选框；勾选后确认托盘或退出，将操作存入 `app.close_action`，以后关闭直接执行该操作，重启后仍生效；取消不保存选择。收起后保留窗口与应用运行，首次收起给出托盘提示。点击/双击托盘图标或再次启动应用恢复并聚焦主窗口；右键菜单提供「打开 WorkBase」「彻底退出」。显式退出、重启与系统关机不重复询问；退出时销毁托盘并关闭数据库。
- **全局速记浮窗**：`Ctrl/Cmd+Shift+Space` 全局唤出（主窗口失焦也可用），480×220 无边框置顶小窗，居中于主屏偏上。浮窗加载同一份渲染入口（hash 带 `bare=1`，不渲染工作台外壳），Enter 保存为笔记（沿用 `#标签` 提取约定）、Shift+Enter 换行、Esc 关闭、失焦自动隐藏；隐藏不销毁窗口，未保存内容保留。快捷键注册失败只记日志，不影响主窗口；速记保存走 `api.notes.save`，隐藏经 `api.app.hideQuickCapture()`。
- 自定义标题栏（`titleBarStyle: 'hidden'` + `titleBarOverlay`），高度 46px（`--titlebar` 与主进程 overlay 的 `height` 一致）。左侧品牌与导航图标对齐，右侧搜索按钮紧邻最小化、最大化和关闭区域的左侧，按系统提供的标题栏可用范围避让。品牌和中间留白组成拖动区，搜索按钮独立接收点击并打开命令面板。overlay 背景透明，实际底色由渲染层 `.titlebar` 绘制。
- 侧栏随窗口宽度自适应：`≥1200px` 为宽态（`--sidebar` 152px，导航为图标 + 中文横向排列），否则为 64px 图标轨（顶部品牌只显示图标）。通过 `html[data-sidebar]` 切换，不写用户设置。顶部栏、侧栏与内容区通过细线分隔。
- 三段式：左侧图标轨/宽侧栏 → 中间列表面板（`hasListPanel` 的视图才显示）→ 右侧主内容区。列表与主区之间 1px 分割线，无卡片套卡片。宽度断点 1180px、980px 各自收窄内边距。
- 字号阶梯：标注 11、辅助 12（`.small` 12.5）、控件 13、正文 14px/1.65、区块标题 17、页题 25–26（`.tiny/.small/.h1/.h2/.h3` 与基础阶梯对应）；模块内的统计大数字、阅读正文与沉浸标题等主视觉可用 16–30px，不占文字阶梯。行高宽松，列表行高 40px。
- 页面标题上方不显示分类或日期小字，下方不设说明小字。空态、错误和配置提示放在各自的功能区域。
- 界面文字默认不可拖选。输入框、编辑器和笔记、报道、聊天及 Skill 等正文阅读区支持选取和复制。

**导航模型**

标题栏搜索入口打开命令面板，按钮与快捷键标记使用透明底色，快捷键提示跟随历史自定义映射。侧栏沿用模块注册表，依次展示固定入口、常用、更多和底部入口，固定入口与常用模块之间以留白分组。

```
[品牌 WorkBase]                         [搜索 Ctrl F] [系统窗口按钮]
──────────
[首页]  (固定，不可移除)
──────────
[常用 1..8]        ← 用户在首页选定的模块，存在 settings.ui.pinned_modules
──────────
[更多 ⋯]           ← 打开全部功能面板
──────────
[AI]  [设置]       ← 贴底固定（role: assistant / settings 由 registry 决定）
```

- 常用区最多 8 项，与首页固定入口合计 9 个模块位。超出 8 项时按数组顺序取前 8，其余自动落回「更多」，并在更多面板里提示「侧栏已满，可在首页调整」。
- 选中态：`--accent` 实底胶囊、圆角 `--r-sm`，图标与文字用 `--accent-ink`；未选中为 `--text-2`，悬停背景 `--surface-3`。悬停显示 tooltip（模块名 + 快捷键）。
- **更多面板**：从侧栏右侧浮出，宽 320px，`top` 距标题栏 12px、`left` 距侧栏右缘 12px，`--surface` 底 + `--shadow-2` + `--r-lg`。内容为搜索框 + 按 `group` 分组的模块行（图标 + 名称 + 行尾图钉）。点击行切换选中；点击图钉切换是否加入常用，满 8 项时图钉禁用并提示「侧栏已满，先在首页『常用 / 编辑』移除一项」。Esc 或点击遮罩关闭。底部提供「打开插件文件夹」，满 8 项时显示「侧栏已满，可在首页调整」。
- **首页常用区**：问候语下方、快速记录之上，横向排列最多 8 个快捷入口，仅显示图标与名称。空列表也可编辑。移除、添加和排序即时写回 `ui.pinned_modules`；编辑区说明自动保存，支持搜索按分组排列的可添加功能，满 8 项时提示先移除。常用和卡片一次只编辑一处。
- **首页内容卡片**：可见模块通过 `dashboardCards` 声明可用卡片。「管理卡片」进入页面内编辑态：可移除/添加卡片、拖拽排序（原生 HTML5 draggable，仅拖拽手柄生效）、拖动右下角手柄调整尺寸（`m` 单列 / `l` 跨满两列）。顺序存 `ui.dashboard_cards`，尺寸覆盖存 `ui.dashboard_card_sizes`，两列归属存 `ui.dashboard_card_cols`。网格固定两列（`repeat(2, minmax(0, 1fr))`），窄屏塌成单列。隐藏卡片只改变首页展示；模块被隐藏或移除后，它提供的卡片不再显示或读取数据。编辑态实时预览，点「保存卡片」保存、「取消」丢弃（不落库）。
- 模块依赖未配置（无 AI 配置等）时，由功能页面提供配置引导，不得报错。
- 设置与智能助手的页头右上角提供关闭按钮，页头在滚动时保持可见（粘性），任意时刻都能关闭。关闭后返回打开该页的来源页；从智能助手打开设置时，先关闭设置回到智能助手，再关闭智能助手回到它的来源页。直接进入且没有来源页时，关闭后回到首页。
- **弹窗与浮层**：基于 `<dialog>` 的模态弹窗（表单、确认、媒体预览）只允许关闭按钮、取消按钮或 `Esc` 关闭，点击弹窗外部一律不关闭，避免误触丢失未保存内容。非模态浮层（命令面板、更多面板、「添加素材」菜单、沉浸控制面板）保持原生 popover 行为，点击外部或 `Esc` 收起。
- 快捷键：`Ctrl/Cmd+1` 首页，`Ctrl/Cmd+2..9` 按侧栏常用顺序，`Ctrl/Cmd+0` 智能助手，`Ctrl/Cmd+F` 命令面板（可搜索全部可见模块、模块贡献的快速动作与笔记，含未 pin 的；子序列模糊匹配，动作排在最前），`Ctrl/Cmd+J` 打开笔记，`Ctrl/Cmd+S` 保存当前笔记，`Ctrl/Cmd+Shift+Space` 全局速记浮窗（主进程注册，主窗口失焦也可用），`Esc` 关闭浮层。命令面板与模块跳转的组合键（Ctrl+F、Ctrl+J 等）在「设置 → 关于与快捷键」只读展示；历史保存的 `ui.shortcuts` 自定义映射启动时读取并继续生效，当前版本不提供修改入口。数字位、Ctrl+S 与 Esc 保持固定。沉浸专注期间全局快捷键监听整体短路，不响应任何模块跳转。侧栏常用图标显示模块提供的角标读数（如待办到期数、英语待复习数）。

**模块自动发现（`features/<id>/module.tsx`）**

导航不维护手工清单。`modules/registry.ts` 用 Vite 的 `import.meta.glob` 在编译期扫描内置模块文件。运行时发现的外部插件合入同一套导航。

```ts
// modules/defineModule.ts —— 只做类型约束与默认值填充
export interface ModuleDefinition {
  id: string;                      // 同时作为路由 '/<id>' 与去重键，必须唯一
  name: string;                    // 侧栏、卡片、命令面板显示名
  icon: LucideIcon;
  group: string;                   // '记录' | '外部数据' | '工具'，新分组自动排到末尾
  order?: number;                  // 同组内排序，默认 100
  path?: string;                   // 默认 `/${id}`
  role?: 'home' | 'assistant' | 'settings'; // 首页入口 / 贴底助手与设置入口
  shortcutKey?: string;           // 模块声明 Ctrl/Cmd 加小写字母的快捷键
  pinnable?: boolean;              // 默认 true；首页、设置等固定入口为 false
  defaultPinned?: boolean;
  hasListPanel?: boolean;          // 是否要 260px 列表面板，默认 false
  requires?: 'mailAccount' | 'aiConfig';
  hidden?: boolean;                // 只作为机制示例或内部页面，不出现在导航与命令面板
  keywords?: string[];             // 命令面板与搜索的额外匹配词
  summary?: () => Promise<string>; // 首页卡片摘要，抛错时展示占位文案
  badge?: () => Promise<number | string>; // 侧栏角标读数（如待办到期数），0 或空串不显示，侧栏周期与聚焦时刷新
  commandActions?: CommandActionDefinition[]; // 模块贡献的命令面板快速动作（如新建待办、开始专注）
  dashboardCards?: DashboardCardDefinition[]; // 功能提供的首页内容卡片
  page: ComponentType | LazyPage;  // LazyPage 由 lazyPage(loader) 构造
}
```

规则：

- **glob 模式必须是字面量、必须是相对路径**，不能用变量拼接，否则 Vite 静态分析失败、模块静默消失且不报错。
- `registry` 是 `allModules` 过滤掉 `hidden` 的结果。命令面板、侧栏、更多面板、首页常用和快捷键使用包含外部插件的实时注册表。首页内容卡片由可见的内置模块提供。`hidden` 模块只能通过直接路由访问，用于机制示例（`demo`）或未启用的功能。
- 模块文件只允许 `export default defineModule({...})`，顶层不得有副作用（不发请求、不读写 localStorage）。
- `router.tsx` 按当前路径查找模块；`ModuleHost` 兼容 `page` 为组件或 `LazyPage` 两种形态。
- 布局组件内不得出现任何模块 id 字面量。
- 分组顺序由 `modules/groups.ts` 常量数组决定，未登记的新分组自动排末尾，不报错。
- 新增模块的完整动作：写一个 `features/<新 id>/module.tsx` → 重启一次 dev server（Vite 对新增文件不会自动重跑 glob）→ 它立刻出现在更多面板、命令面板、首页「编辑」里，可 pin 到侧栏与首页。
- `docs/ADDING-A-MODULE.md` 保存最小示例。

**交互**

- 所有异步操作有 loading / 空状态 / 错误三态；空状态给一句引导文案 + 主操作按钮，不用插画大图。空状态居中于所属页面、列表栏或卡片的可用内容区。页头、筛选和其他已显示内容保留在原位。
- 列表项 hover 才显示次要操作，避免常驻按钮噪声。
- 动效 ≤ 180ms，`ease-out`；列表进入用 8px 位移淡入，不做弹跳。壁纸切换为 180ms 淡入后再卸载旧层。
- 可清空的搜索框共用输入区、清除按钮与清空后的焦点返回行为。命令面板的键盘选中行即时切换，背景色轻过渡；方向键在结果间循环移动（末行回绕到首行），`Home` / `End` 跳到首行与末行。更多面板内方向键在功能行之间循环移动焦点，从搜索框按下时进入首行 / 末行。拖放高亮只在文件进入投放区时显示。
- 启动层是唯一的整屏叙事动画，不受上面 180ms 约束，但总时长仍受 1.2 秒上限约束。时序：两侧线条 60–380ms 绘出；标志 180–520ms 落位、W 字母 300–600ms 描出；粒子 300–820ms 从两条线条与外围云团沿同向弧线汇聚到标志外缘，形成一圈收束的光晕；字标 380–820ms 位移 + 轻微模糊浮出。导航就绪后 300ms 内淡出，粒子同时带阻尼向外消散。粒子由 `components/layout/splash-particles.ts` 绘制在单张 canvas 上（DPR 上限 2，粒子数按视口面积自适应，消散结束即停帧），线条几何从 SVG 路径实时测量，标志尺寸变化时自动重算光环半径。整段动画随窗口尺寸缩放（`clamp` + 断点），系统开启「减少动态效果」时不播放动效、不等待动画时长，也不初始化粒子画布。
- 破坏性操作（删除账户/撤销导入/清空数据/移除壁纸）二次确认，文案写清后果。

## 8. 模块与功能点

### 外部插件

- 每个插件为 `files/plugins/` 下的一个文件夹，文件夹内的 `plugin.json` 声明唯一 `id`（小写英文字母开头，允许数字和短横线）、`name` 和相对的 HTML `entry`，省略入口时使用 `index.html`。命名以点开头的目录不参与扫描。
- 主进程启动时扫描目录，运行时合并文件事件并重新检查，低频扫描补偿漏报。清单变更会刷新「更多」中的「插件」分组、命令面板和首页常用。插件路由使用 `/plugins/<id>`，固定项沿用现有设置。缺少插件时隐藏对应的固定项，恢复同一 ID 后恢复显示。
- 插件文件变化时重新加载正在显示的插件，移除正在显示的插件时回到首页。推荐先在目录外准备完整文件夹，再移入插件目录。首版支持自带 HTML、CSS、JavaScript 与本地资源的独立页面。

### 模块清单（由 registry 派生）

| group | 模块 | id | 说明 |
|---|---|---|---|
| 工具 | 首页 | `dashboard` | `role: 'home'`，固定入口，不可 pin；更多面板按工具组展示（order 0） |
| 记录 | 笔记 | `notes` | 默认 pin，提供「快速记录」「今日一记」卡片 |
| 记录 | 时间线 | `memories` | 纯文字或图文记录，按发生日期浏览 |
| 记录 | 书影音 | `shelf` | 书籍/电影/剧集收藏，评分与短评，封面落 `files/shelf-covers/` |
| 记录 | 英语 | `ielts` | 默认 pin，生成学习包需要配置 AI |
| 记录 | 待办 | `todos` | 默认 pin，提供「今日待办」卡片 |
| 外部数据 | 账单 | `bills` | 支付宝账单的独立账户与导入流程 |
| 外部数据 | RSS 订阅 | `sources` | 用户自行添加的 RSS/Atom 订阅，本地缓存条目与未读 |
| 工具 | 智能助手 | `ai` | `role: 'assistant'`，贴底 |
| 工具 | 热点追踪 | `article-writing` | 从更多或命令面板进入，默认查看平台热点，页内提供每日简报与自媒体写作 |
| 工具 | 专注 | `focus` | 提供「专注趋势」卡片 |
| 工具 | 剪贴板 | `clipboard` | 文本剪贴板历史，点击再复制，支持置顶与搜索 |
| 工具 | 统计 | `stats` | 年度写作/待办/英语/习惯汇总与月度图表，专注按近 12 个月 |
| 工具 | 习惯 | `habits` | 打卡与连续天数 |
| 工具 | Skill 库 | `skills` | 本地 Skill 包管理 |
| 工具 | 密码库 | `vault` | 默认 pin，支持网站账号本地保存与浏览器填充 |
| 工具 | 媒体库 | `media` | 图片/视频资源 |
| 工具 | 设置 | `settings` | `role: 'settings'`，固定入口，四个页签 |
| — | 邮件 / 演示模块 | `mail` / `demo` | `hidden: true`，不进入导航与命令面板；`demo` 用于验证模块可插拔 |

`mail` 的页面与部分主进程代码仍在，但当前标记为隐藏，不对外暴露入口；恢复前必须先补全数据通路。`sources` 已恢复为「RSS 订阅」可见模块（见第 8 节）。

### 桌面壁纸（四种来源）

- **入口**：设置 → 外观 → 工作台壁纸。支持「从 Wallpaper Engine 选择」「从链接添加」「添加本地文件」「获取系统壁纸」四种添加方式，共用同一套持久化、激活、轮播、移除与清除逻辑。
- **来源与存储**：`WallpaperSource` 为 `url` / `file` / `system` / `engine`。所有来源最终都由主进程 `addCopy()` 写成应用管理目录下的 `<uuid>.<ext>`（`data/files/wallpapers/`），原始文件只读、不被修改或移动；渲染层只看到 `wb-asset://wallpapers/<uuid>.<ext>`，不暴露本地路径。URL 来源要求 HTTP/HTTPS、禁止含用户名密码、15 秒超时、拒绝 206 分段响应；系统壁纸先查注册表 `HKCU\Control Panel\Desktop\WallPaper`，失败回退到 `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper`，两者都不可用时报「无法读取系统当前壁纸」。
- **格式识别**：按文件头（magic bytes）判定扩展名，不信任用户扩展名，支持 PNG / JPG / WebP / GIF / AVIF 与 MP4 / WebM / MOV / M4V / OGV。判定失败抛 `WALLPAPER_INVALID_IMAGE` / `WALLPAPER_INVALID_VIDEO`。
- **上限**：单张图片 ≤ 20MB，视频 ≤ 600MB，清单最多 50 张（超限抛 `WALLPAPER_LIMIT`）。视频复制走 `copyFile` 而非 `readFile`，避免大文件进内存。
- **添加去重**：工作台和沉浸背景分别检查各自清单，四种来源共用文件字节 SHA-256 判重。命中时提示已添加并清理此次暂存文件。同一个 Wallpaper Engine 项目仍可直接切换到已有壁纸，升级旧预览时也检查新素材是否与清单中的其他条目重复。已有重复记录由用户管理。
- **动画**：GIF / 动态 WebP / 动态 AVIF **按源格式原样保存字节**，不做 PNG 或 canvas 重编码（重编码只保留首帧，会让动图静止）。视频以 `<video muted autoPlay loop playsInline preload="auto">` 播放。渲染层用单个媒体实例 + URL 去重，新层淡入 180ms 后卸载旧层并释放解码器；`backgroundThrottling: false` 保证失焦/最小化不冻结。
- **几何**：工作台提供「自动适配」「铺满窗口」「完整显示」。自动适配时，横向和方形素材居中等比铺满整个窗口（`object-fit: cover`），竖向素材和尺寸不足以铺满窗口的 Wallpaper Engine 图片自动完整显示。铺满窗口时，所有图片和视频均等比铺满，覆盖侧栏、标题栏、原生窗口按钮下方与底部，比例与窗口不同时裁切超出的边缘。完整显示时，所有图片和视频均居中完整显示（`object-fit: scale-down`），能放下时保持原尺寸，超出窗口时等比缩小，空余区域使用当前主题底色。侧栏及其上方的品牌区默认叠加磨砂背景。沉浸背景仍居中等比铺满窗口或全屏画面，延伸至顶部拖动区和底部控制区，超出边缘的部分裁切。
- **明暗判定**：主进程把图片缩到 16×16 采样线性亮度，均值 < 0.45 判为 `dark`，保留在 `WallpaperItem.dark` 中。渲染层按当前主题绘制界面。
- **配置**：`WallpaperConfig { items, activeId, carousel, interval, overlay, fit?, mode?, clear? }`。工作台的 `fit` 为 `cover`（自动适配，默认值）、`fill-window`（铺满窗口）或 `scale-down`（完整显示）。沉浸背景使用独立的 `mode`。`interval` 取值 10–86400 秒（默认 60），`overlay` 为 0–0.6 的暗色蒙层（默认 0.22）。`clear` 开启时移除对应背景的暗色蒙层，工作台同时取消壁纸磨砂并降低内容区底色。`clear` 开启时蒙层滑块停用并给出说明，避免调整一个不生效的值。轮播仅在开关打开且清单 ≥ 2 张时按顺序循环切换，切换期间不并发。
- **蒙层层级**：顶部栏（含原生窗口按钮下方）与侧栏使用同一张连续铺设的工作台壁纸，并共用底色、模糊和暗色蒙层。开启「清晰背景」时，两处一起移除模糊和暗色蒙层，保留半透明主题底色。沉浸空间的蒙层仍叠加在壁纸层内。设置页的原图/加蒙层对照预览按工作台真实层级绘制（壁纸 → 内容底色 → 蒙层）。
- **Wallpaper Engine 发现**：主进程从 Steam 注册表、`libraryfolders.vdf` 与 Wallpaper Engine 安装清单发现创意工坊、`projects/myprojects`、`projects/defaultprojects`；也可通过原生目录选择器指定目录，保存到 `ui.wallpaper_engine_directories`。只读已下载文件，不启动或控制 Wallpaper Engine，不下载订阅，不解包 `scene.pkg`，不执行壁纸脚本。
- **WE 项目分类**：读取 `project.json` 的 `title` / `preview` / `file` / `type`，按 `kind` 分三类：
  - `video`：项目根目录的 mp4/webm 直接作为壁纸播放（`animated: true`）；
  - 预览图是 GIF / 动态 WebP / 动态 AVIF：按源格式播放（`animated: true`）；
  - 静态封面：只显示封面（`animated: false`）。`scene` 类项目的动效在私有 `scene.pkg` 内，本项目不解包，因此不动；`web` 类只显示预览图。
  选择器区分「原视频」「动图预览」「静态预览」，图像预览显示解码后的宽高。静态类项目在添加时会在项目根目录寻找更大的 jpg/png 作为壁纸素材（不递归、不解析 `scene.pkg`），找不到时沿用预览图；扫描阶段只读元数据，不做图片解码。
- **扫描限制**：单个元数据 ≤ 1MB，预览图 ≤ 20MB，扫描上限 5000 个项目，列表最多 1000 张；无效项目跳过并显示数量，达到上限提示缩小目录范围。保留未安装、空库、加载、失败与重新扫描状态。
- **IPC**：`wallpaper:get / addUrl / addFile / addSystem / engineList / engineChooseDirectory / addEngine / remove / setActive / updateConfig / clear`。`engineList` 返回 `{items:[{id,title,previewUrl,type,kind,animated}], directories, skipped, truncated}`，主进程只接受本次扫描登记的项目 id。不新增依赖或数据库迁移。

### 沉浸专注

- 首页的「启动专注」和专注页的启动按钮直接进入沉浸空间，复用现有时长、专注主题和计时状态。沉浸时收起工作台导航和模块快捷键，左上角显示「返回工作台」按钮（保留计时，与 Esc、控制面板入口等效；进入全屏时随标题栏行一起隐藏），左下角显示倒计时和进度。右下角「控制」只分「计时」「场景」「空间」三组，分别用于暂停或继续计时、选择或自定义场景、设置背景或全屏及返回工作台。面板默认收起，按 Esc 或点击面板外可关闭。
- 「设置 → 外观 → 沉浸背景」与「控制 → 背景设置」共用一套设置，实时应用，计时照常运行。沉浸背景可选纯色（默认）、沿用工作台壁纸、单独设置。单独设置支持全部四种来源及独立清单、轮播、间隔和蒙层。壁纸 IPC 的 `scope` 可选 `workspace`（默认）或 `immersive`，背景 `mode` 仅对 `immersive` 生效，取值为 `solid` / `workspace` / `custom`。沿用模式共享工作台选中项、轮播和蒙层设置，单独设置的素材与清除操作按用途隔离。沿用工作台壁纸时，背景设置弹窗内直接列出工作台壁纸清单（点击即切换工作台当前壁纸）并提供工作台蒙层滑块；添加、移除或轮播仍到「设置 → 外观 → 工作台壁纸」。沉浸空间沿用深色界面。
- 沉浸页面任意位置右键即从当前背景的已有壁纸清单中随机切换到另一张（不含当前这张）：单独设置切换沉浸清单选中项，沿用工作台壁纸则同步切换工作台当前壁纸。纯色背景不响应；清单不足两张时提示并不切换；右键落在弹窗或控制面板内部时不响应。
- 沉浸背景设置弹窗只滚动内容区，标题栏和右上角关闭按钮始终可见。
- 沉浸壁纸提供独立保存的「清晰背景」开关。开启时移除暗色蒙层，关闭时使用所选蒙层，蒙层设为 0% 时按原色显示。沿用工作台壁纸且尚未设置开关时，继承工作台的清晰设置。沉浸背景连续铺到窗口右上角的原生窗口按钮下方，按钮区使用透明底色。使用壁纸时，放松引导靠下显示，文字与沉浸控制按钮使用局部深色底板保持可读。
- 「控制 → 空间 → 氛围效果」提供极光、风雪、樱花、月夜流云、秋叶、萤火虫六种循环背景。纯色模式使用内置夜景，有壁纸时将特效叠加在其上。特效用单张低分辨率 Canvas 绘制，最多 30 帧/秒，系统减少动态效果时只绘制静帧，页面不可见时暂停绘制，退出沉浸时释放。内置两首离线纯音乐，可选曲、播放、暂停和调音量，退出沉浸时停止。切换特效或场景不影响计时与背景音乐。
- 默认进入「学习」，内容区留给沉浸背景，屏幕右侧垂直居中显示阅读笔记、学习英语和学习设置。已填写的专注主题仍用于记录。打开笔记后，正文居中，大纲位于正文左侧，点击可跳到文内标题。无标题的笔记不显示大纲。可用宽度较小时，学习工具与大纲移到正文上方。「放松」提供三种方式：呼吸练习（放松呼吸 4-6、4-7-8、箱式 4-4-4-4 三种节奏，显示轮数）、正念冥想（1/3/5 分钟静坐倒计时）与护眼休息（20 秒远眺倒计时），场景内切换不打断专注计时，动效尊重减少动态效果设置。
- **场景选择**：「控制 → 场景」按 `ui.immersive_scenes` 排列快选项，点击即切换且不重置计时。「阅读笔记」「学习英语」也可作为独立场景直接进入，返回按钮回到「学习」。「自定义场景」支持添加、移除、上下调整顺序和恢复默认。
- **图片与视频**：入口显示媒体库的分组和当前类型的未分组素材，点击分组后只显示该组内的同类型素材。播放列表取当前浏览位置的素材（上限 200 条，超出部分在媒体库中打开），可再叠加一个本地打开的临时文件，本地预览不复制到媒体库。左右箭头与键盘 `←` / `→` 循环切换，视频播完自动下一条，图片停留 5 秒自动下一张，播放器头部可暂停连播。视频进度通过控件滑块调整，返回播放列表后保留分组位置。
- 「学习设置」可显示或隐藏右侧工具栏的「阅读笔记」「学习英语」，并选择默认英语学习包。独立场景入口由「自定义场景」管理。英语复习复用本地英语学习库和闪卡，按复习时间优先，每轮最多 20 条。默认包被删除时使用全部学习包。已有学习包可离线复习，复习结果和有效学习时长与「英语」页共用。没有词句时可前往「英语」生成学习包，专注计时继续。
- 「学习英语」提供「词句复习」和「报道阅读」。报道阅读与「英语」页共用，默认显示已保存的文章，可按栏目获取 VOA Learning English 的文字报道，也可粘贴同站文章链接。点击列表条目可阅读正文，页面显示来源、发布日期和原文链接。主动保存后可离线打开，重复保存按报道标识去重，删除前确认。获取失败可重试，已保存的报道仍可阅读。打开正文时沿用英语学习有效时长统计。
- 切换场景或退出沉浸不会重置计时，离开图片/视频场景时停止播放。倒计时结束后用原有专注记录接口（`api.focus.add`）保存一次，保留当前场景，可在原地开始下一轮。场景配置复用 `settings`。

### 首页

问候；常用功能卡片行；内容卡片两列网格：「快速记录」「今日待办」「月历」「今日一记」「年度活动」「专注趋势」。卡片由模块通过 `dashboardCards` 声明，可增删、排序、调尺寸与左右归属。

问候、常用入口与顶部操作按钮固定在首页上方，沿用工作台内容区底色。下方有独立滚动区，包含统计、内容卡片、可添加常用列表与卡片管理内容。名字显示在问候语右侧，点击就地编辑、失焦即保存，存 `ui.user_name`（空值回到「你的名字」占位提示）。

滚动区顶部为四张等宽概览卡。今日专注用近 7 天折线，未完成待办用分段条区分逾期、今日到期和其余待办，本月日记用点阵标记有日记的日期，累计写作用近 7 天柱状图并同时显示今日字数。空间不足时先改为两列，再改为单列。

`api.todos.stats()` 按本地自然日返回未完成、已逾期和今日到期的待办数量。待办明细由需要显示明细的内容卡片另行读取。

写作字数沿用年度活动的本地自然日净增口径，涵盖笔记与日记正文。累计值从开始记录写作活动起算，删除笔记保留历史写作记录，早于记录起点的输入不回填。`api.notes.stats()` 返回累计字数 `words`、今日字数 `todayWords`、近 7 天逐日字数 `writingDays` 和本月有效日记的日期 `journalDays`，均在仓储层查询。

没有到期任务时，「今日待办」以紧凑样式保留入口。默认双列布局把「今日一记」放在空待办下方，与月历并排；卡片设置和编辑位置不变。「今日一记」按本地日期定位当天日记，没有当天条目时可直接进入笔记创建。

月历的日期详情在鼠标悬停或键盘聚焦时以浮层显示，移开或按 Esc 收起。浮层展示当天日记标题和到期待办，日历下方保持紧凑。方向键可跨月移动焦点。

「管理卡片」还可选配待办模块的「待办概览」「待办完成趋势」，以及支付宝账单模块的「月度收支」「支出分类」「交易对方排行」。这些卡片默认隐藏，使用本地真实数据。待办概览显示未完成、今日到期、已逾期和今日完成数量，完成趋势按本地自然日展示最近 7 或 30 天当前仍为已完成的待办。月度收支以最近有账单的北京时间自然月为终点，显示连续六个月，未导入记录的月份按零计；支出分类与交易对方排行统计全部已导入账单，分别展示支出前四类与其余类别合计、已记录的交易对方前五名。

### 首页年度活动

- 月历下方为「年度活动」，不统计专注分钟。12 个月 × 每月最多 5 个周段，每格为 1–7、8–14、15–21、22–28、29–月末；悬停或键盘聚焦显示周段内每天的明细。颜色按活跃天数（0、1–2、3–4、5–7 天）分级，有笔记新增、英语学习、复习、待办完成或习惯打卡即算活跃。
- 每日记录：笔记正文净增字数（中文逐字、英文按词；每篇每天以首次保存前的字数为基线、当日最高字数减基线，重复保存、改标题、删后重写不累加）、英语学习时长及复习次数、已完成待办数（按 `done_at`）、习惯打卡项数（按日期）。待办取消完成或删除、习惯取消或删除后，其历史统计随现有记录更新。
- 英语学习有学习内容且没有等待生成时，页面可见、窗口有焦点且最近一分钟有点击/键盘/滚动操作才计时。每 10 秒发送心跳，切页/失焦结算，单段最多 15 秒；主进程按本地自然日切分跨午夜记录。
- 新增 `008_activity.sql`（不修改已执行迁移）。笔记写作记录随保存事务提交，删除笔记不删写作记录。开始记录前的字数/学习时长标记未记录，不从全文或复习次数推算。
- `api.activity.year({year,sources})` → `{year, trackingSince, sources, days}`；`sources` 只接受 notes/ielts/todos/habits，由可见模块注册表筛选，隐藏或移除的模块不查询。逐日聚合在主进程仓储完成。`api.ielts.studyPulse({sessionId,active})` 记录心跳。
- `api.pageTime.track({page,seconds})` 上报一段页面停留（seconds 1–7200 整数，主进程 upsert 累加）；`api.pageTime.stats(year)` → `{year, pages, months}`，pages 按秒数降序、months 按两位月号升序。

### 笔记

- 左列表（置顶优先、按更新时间，可按全部/笔记/日记筛选；日记按 `journal_date` 唯一）+ 右侧所见即所得编辑器（TipTap），支持标题、表格、任务列表、图片、链接、代码块；**存储格式是 Markdown**，编辑器内部 HTML 与 Markdown 由 `lib/markdown.ts` 互转，粘贴富文本自动降级为 Markdown，纯文本 GFM 表格直接转成真表格。笔记中用 `- [ ]` 与 `- [x]` 书写的无序任务，切换到富文本时显示为可勾选的任务项。
- 笔记页采用连续的编辑区和紧凑文件树。文档的可编辑标题位于画布内，页顶保留模式切换和文档操作，底栏显示保存状态、字数及预计阅读时间。富文本直接渲染标题层级、加粗、列表等格式，Markdown 源码可直接编辑。两种模式跟随第 7 节的界面风格。沉浸阅读复用同一套 Markdown 排版并跟随界面风格。
- 新建笔记和今日日记位于左列表顶部，空间足够时与「笔记」标题同一行。下方的「全部 / 笔记 / 日记」等宽排列，当前选项用短下划线标示。左列表每页显示 100 条，可前后翻页或直接输入页码。搜索及筛选从第一页开始，翻页时保留打开的笔记。
- 笔记和 Skill 库的左列表分别默认宽 260px 和 288px。拖动列表右侧的分隔线，或聚焦后按左右方向键可调宽度。点击列表顶部按钮可收起为只留展开按钮的窄栏，主内容占用腾出的空间，再次展开时恢复原有列表宽度。两个列表分别在本机记忆宽度和收起状态，窗口变窄时为主内容预留空间。
- 笔记与 Skill 的左列表按顶层条目和一层文件夹排列。右键列表可新建文件夹，右键文件夹可重命名或删除。删除前显示文件夹名并请求确认，删除后其中的条目移回顶层。条目可拖到文件夹或拖回顶层，也可右键选择移动位置。文件夹默认折叠。笔记条目单行显示标题，悬停可查看摘要、更新时间和字数。搜索时匹配的文件夹默认展开，笔记文件夹内的条目仍受列表分页约束。文件夹名称在各库内唯一，首尾去空格后最长 80 字。
- 每条笔记和 Skill 最多归入一个文件夹。移动只更新本地数据库的归属，编辑、保存、置顶和查看仍沿用原有流程。旧笔记和新建笔记默认位于顶层。
- 右键顶层或文件夹内的笔记可删除该条笔记。确认框显示目标标题，删除其他笔记时保留当前编辑。
- 笔记编辑区默认居中。左右边缘可分别拖动，也可聚焦后按方向键调整。标题、标签和正文共用边界，富文本和 Markdown 共用保存在本机的边距偏好。窗口变窄时自动缩减边距，为正文留出空间。
- 富文本模式下，右侧大纲默认展开，可用页顶按钮收起，也可从大纲返回笔记开头。切到 Markdown 时收起大纲并释放正文宽度，返回富文本后恢复此前的展开状态。可拖动大纲与编辑区之间的分隔线，或聚焦分隔线后按左右方向键调整宽度。宽度偏好保存在本机，窗口变窄时为编辑区预留空间。大纲长标题自动换行。
- 标签以可单独移除的标签组编辑，输入后按回车确认，新加标签总数上限为 12 个。标签随笔记保存，与标题、正文一起参与搜索匹配。
- 自动保存（900ms 防抖）+ `Ctrl/Cmd+S` 立即保存；搜索走 `api.notes.list({query})`：标题与正文 ≥3 字符时用 trigram 全文索引（支持中文子串），更短查询与标签、文件夹名用 LIKE；插入图片走 `api.assets.saveImage` 落 `files/images/`。
- **双链 `[[标题]]`**：Markdown 源码与富文本共用同一语法，存储保持 `[[标题]]` 原文。渲染（marked 扩展）与富文本 schema（TipTap `wikiLink` mark，`data-wiki` 属性）互通，turndown 转回原文。点击笔记页内的双链：`api.notes.wikiTarget(title)` 命中标题即打开该笔记；未命中时按该标题新建普通笔记并打开（toast 提示）。右侧大纲面板下方有「反向链接」组，经 `api.notes.backlinks` 列出正文中含 `[[本篇标题]]` 的其他笔记（最近更新优先，最多 20 条，不含自身），点击跳转；随打开笔记与标题变化自动刷新。
- 回收站：删除把笔记移入回收站（`archived = 1`），toast 提供撤销；左列表头部回收站入口切换到回收站视图，逐条恢复或彻底删除（彻底删除前确认）。回收站里的日记占用唯一日期，恢复前同日期日记不可新建（报「该日期的日记在回收站中」）。
- **单篇导出**：文档操作区「导出」按钮提供 Markdown / HTML / PDF 三种格式，走 `api.notes.export` 导出**已保存**的版本，经系统保存对话框选择位置。HTML 与 PDF 由主进程用 marked 渲染为独立页面（固定样式的阅读排版，注释声明 token 豁免），`wb-asset://` 图片内联为 data URI，离线可读；PDF 经隐藏窗口 `printToPDF`（A4、打印背景）生成。导出失败报 `EXPORT_FAILED`。
- 富文本中选中单张图片后，可拖右下角或输入像素宽度，图片按原比例缩放，显示宽度受可用空间约束。拖到另一张单独图片所在行的左半边或右半边（含图片两侧及上下的行间空白，指针压在正文段落等其他块上时不触发并排），出现并排提示后松开即可组成双列并决定顺序。两张图平分可用宽度，列间距 4px，按平均宽高比居中裁切成等高画框。图片未加载或加载失败时统一使用 4:3。双列内隐藏单图尺寸控件，拆开或删除一张后恢复单图原有宽度设置。Markdown 中用带宽度的 HTML 图片和 `data-note-image-row` 容器保存排版，旧的 Markdown 图片仍可编辑。沉浸阅读沿用同一套等宽等高排版。
- 正常退出或重启前等待当前编辑及进行中的笔记保存。保存失败或超时会弹出提示，用户可返回处理或明确选择继续退出。

### 时间线

- 时间线居中排布，按发生日期倒序排列并按年分组。年份索引显示各年记录数，可切换到指定年份或查看全部。同一天允许多条，精确到分钟的记录先按时间倒序展示，仅有日期的记录放在当日末尾。
- 页头下方为统计条与搜索：统计条显示记录总数、照片总数、有记录的日期数和年份数（全库口径，不随筛选变化）；搜索按正文关键字 LIKE 匹配，可与年份筛选叠加，搜索时 `total` 为匹配数，无匹配时空态提示清除搜索。
- 条目正文与照片放在带边框的卡片内，悬停时显示浅阴影；日期列、圆点与竖线保持原布局。
- 新增和编辑时选填具体时间，正文为必填纯文本。每条可附最多 9 张本地图片，编辑预览与时间线均每行最多显示 3 张。支持 PNG、JPG、WebP、GIF、AVIF，单张最多 12MB，点击可查看大图。
- 记录与照片保存在本地，照片由记录独占，随数据目录迁移和备份。移除照片或删除记录后清理对应的附件。

### 书影音

- 本地手动录入的书籍/电影/剧集收藏（`shelf` 模块，`shelf_items` 表），不联网抓取元数据。条目含类型、标题、作者/导演、状态（待开始/进行中/已完成）、0–5 星评分、短评与可选封面。
- 封面走 `api.shelf.save` 的图片字节通路，按文件头识别格式，落 `files/shelf-covers/`，单张 ≤12MB；`keepCover` 语义与时间线照片一致，替换或移除后清理旧文件，删除记录时一并清理封面。
- 页面为类型（全部/书籍/电影/剧集）与状态筛选 + 搜索（标题、作者/导演），卡片网格展示封面（缺省用类型图标占位）、标题、作者、星级、短评（两行截断）与状态徽标。统计条显示待开始/进行中/已完成数量。
- 收藏卡片沿用媒体库分组的斜角信息区，使用 4:3 预览区完整展示封面。鼠标悬浮或键盘聚焦时，斜角面板上滑，短评最多展开至四行，卡片尺寸和页脚位置固定。系统启用「减少动态效果」时立即切换。点击整张卡片可编辑，删除操作悬浮或键盘聚焦时出现，触屏常显。新增和编辑弹窗左侧显示封面预览与更换操作，右侧填写资料，窄窗改为单列，保存操作固定在底部。
- 标记「已完成」时自动补当天为完成日期（可手动改）。每库上限 500 条，按更新时间倒序。

### 统计

- 独立「统计」模块（`stats`）：写作/待办/英语（学习时长与复习次数）/习惯活跃天经 `api.activity.year` 在仓储层聚合；专注分钟用 `api.focus.stats()` 的近 365 天逐日数据按选中年份的月份聚合，早于记录窗口的月份不显示数据并给出行内说明；页面停留用 `api.pageTime.stats(year)` 的仓储层聚合。
- 页头右侧切换年份（不能超过当前年份），统计条显示「记录起点」。顶部五张汇总卡（写作净增、完成待办、英语学习小时、复习次数、习惯活跃天），下方两列图表，形式错开：写作净增（柱 + 累计折线双轴组合，按月）、英语学习时长（渐变面积，按月）、完成待办（横向条形，按月）、一周节奏（雷达：周一至周日按写作/待办/英语/复习四系列，各系列按自身最大值归一，悬停显示原始值）、专注分钟（折线，近 12 个月口径）、年度活跃格（12 行 × 31 列热力格，按当日活跃类别数 0–4 分五级着色，悬停在下方的提示行显示当日明细，不存在的日期留空）与页面停留（跨两列：左侧 BarList 停留排行 Top 8 + 其余合并「其他」，右侧月度停留分钟柱状；无记录年份显示空态文案）。图表配色走 token。
- 页面停留口径：Router 层按当前模块 id 追踪，窗口聚焦且页面可见时计时；切页、窗口失焦、页面隐藏即结算上报，少于 1 秒的片段不计，单段最多按 2 小时计（防系统睡眠等异常丢事件导致虚高）。主进程按本地自然日 upsert 到 `page_time`（页面 × 日累计秒数）。页面名从模块注册表映射，卸载的插件显示原始 id。

### 待办

今天与逾期 / 之后 / 待安排 / 已完成四段；优先级色点。未完成的三个分组内按用户手动顺序（`sort`）排列，新建待办插入到未完成列表顶部（`sort` 取当前最小值减一）；每个未完成卡片悬停时出现拖动手柄，只允许在分组内拖拽排序，松手后按新顺序调用 `api.todos.reorder(ids)` 重写 `sort`；已完成分组不可拖拽，按完成时间倒序。拖动中的卡片半透明，插入位置用卡片上/下沿的强调色横线提示。

页头右侧以行内文字显示未完成和近 7 天完成数量。新建区下方可按「全部 / 今日与逾期 / 已完成」筛选，当前筛选以短下划线标示。每项待办是一张独立卡片，分组标题与数量单独显示。全部视图同时有未完成与已完成时，未完成任务占左侧宽栏，已完成任务占右侧窄栏并弱化显示。只显示一类时，卡片每行两列，单张卡片占一列。任务卡片等高，标题、优先级和截止日期同行对齐，逾期状态与截止日期合并显示，只有被截断的标题会在悬停时用气泡显示全文。窄窗口改为单栏。

新建区将标题、截止日期、优先级和添加按钮排在同一行，空间不足时换行。在标题框按回车可添加。截止日期默认是本地当天，标题以可识别的自然日期开头（如 `明天 10:00`）时自动更新。手动指定或清空日期后，以手动选择为准。添加后，下一条恢复当天和中优先级。

完成与取消完成使用行首 34×34 px 点击区。逐项编辑与删除位于行尾，在鼠标悬停或键盘进入该行时显示；点击卡片其余区域或编辑按钮打开编辑弹窗，可修改标题、详情、截止日期与优先级，详情保存于 `todos.detail`，卡片上不展示。删除确认时标明待办名称。清除已完成保留在对应分组的标题行。

### 英语

- 按主题（环境与可持续、教育与学习、科技与 AI、健康与生活方式、城市化、工作与职业）与雅思参考难度生成学习包，条目为单词或句型（`kind`），含音标、词性、释义、例句、翻译、搭配、band。页面名称使用「英语」，沿用 `ielts` 模块标识、路由和本地数据。
- 页头可切换「学习库」「复习」「报道阅读」。报道阅读与沉浸空间共用文章列表和本地存档，可按栏目获取 VOA 英文报道、粘贴文章链接、保存后离线阅读或删除。头图和文中配图按原文顺序显示，保留图注，每篇最多 8 张、单张不超过 1 MiB。图片下载失败时正文仍可阅读，已成功获取的图片随报道保存。旧存档和配图全部获取失败的存档可主动联网补图，离线照常打开原来的正文。报道阅读无需配置 AI，打开正文时按英语学习规则累计有效时长。
- 页头提供「生成学习包」入口。主题、常用主题、内容类型、参考难度与数量集中在一个弹窗里。未配置 AI 时，弹窗提示配置方式。生成失败的原因显示在表单内，保留参数供重试。
- 复习：逐条标记认识/不认识，`mastery` 0–5 与 `wrong` 累计，`review_at` 决定待复习队列；记录写入 `ielts_reviews`。统计「已掌握 / 待复习」，学习时长通过 `studyPulse` 心跳累计到 `ielts_study_daily`。
- 学习库首屏依次显示一行学习统计、一组靠左的学习包和词条筛选、词条卡片。选中单个学习包时，下拉框旁提供删除按钮，确认框显示包名。朗读按钮在词条卡片上常驻。
- 生成学习包支持「短文精读」。可按主题生成短文，也可粘贴英文原文，由已配置的 AI 生成中文大意、语境生词、长难句拆解（含翻译与双语仿写）、同义替换及雅思写作句型。粘贴的原文保存在本地，生成的解析与词卡随包一次写入。
- 选择精读包后，单栏横跨学习库词卡网格的区域，先显示英文原文，点击「查看大意」后依次显示中文大意、生词卡、长难句、同义替换和写作句型。包内词卡沿用现有复习记录和发音，正面显示单词，背面显示音标、词性、释义、词族、搭配及例句。已生成的精读包可离线阅读、复习和删除。

### 习惯

习惯增删（名称 + 图标 + 每日目标次数 1–20 + 五种主题色）、按日期打卡（可补记最近 14 天）、连续天数（streak）统计；`habit_logs` 按 `(habit_id, date)` 唯一，取消打卡后年度活动随之更新。目标为 1 时点击在打卡/取消间切换；目标大于 1 时点击累加次数，达到目标后再次点击清零，未达标的格显示已记次数，打卡行颜色由所选习惯色驱动。

新增习惯先填写名称，图标用支持方向键的单选网格，颜色与每日目标同排填写。宽度足够时，习惯名、14 天打卡和连续天数同行，共用日期表头。宽度不足时将日期移到下一行。打卡成功后在当前格内短暂显示四个散开的光点，系统开启减少动态效果时只显示静态完成标记。「今日完成」与「近 14 天完成」按当日次数达到目标统计。

### 专注

- 专注记录写入 `focus_sessions`（分钟、标签、开始时间），提供「专注趋势」卡片。
- 专注页统计区复用紧凑统计卡，展示今日、近 7 天与累计数据。近 7 天从今天往前数 6 天，有记录时在趋势图标题旁显示日均分钟数。连续专注天数 ≥ 2 时在卡片标题右侧显示「连续 N 天」（今天尚未专注不中断计数）。
- 今日目标可在统计卡内通过步进按钮或数字输入调整（5–480 分钟，存 `ui.focus_target`），进度条与「已达成」读数跟随目标。
- 专注页采用双列布局。左列为计时器和「最近专注」列表（最近 5 轮的主题、分钟与开始时间），右列为统计卡，卡内依次展示汇总数据、今日目标、最近 7 天柱状图和「年度专注」格子（最近 12 个月 × 每月最多 5 个周段，按当段有专注的天数分四级着色，悬停在格子下方的提示行即时显示该周段的天数与分钟）。窗口较矮时收紧间距和图表高度，最小窗口 1080×700 也可一屏看全。
- 「最近专注」每行悬停或键盘聚焦时显示「重命名」「删除」动作：重命名走弹窗改主题，清空保存即回到「未命名专注」；删除经确认后移除该条记录，今日/趋势/年度/累计统计同步减少。改动通过专注 store 的 revision 通知专注页与工作台「专注趋势」卡片统一重读统计。
- 沉浸空间见上文「沉浸专注」。

### 剪贴板

- 主进程每 1.5s 轮询系统剪贴板，只记录文本（单条上限 20000 字符），连续相同内容去重；与历史中已有条目相同时提升其时间而不重复落行。未置顶条目容量 500，超出淘汰最旧；`clipboard.enabled` 设为 `'0'` 时暂停轮询且不清空历史，剪贴板页头可切换。
- 页面为搜索框 + 分页列表（每页 50 条），条目显示文本预览（最多 4 行）与最近一次复制时间；点击条目写回系统剪贴板并提示「已复制」，该内容同时提升到历史最新位置。条目悬停显示置顶/删除；「更多操作 → 清空未置顶」经确认后清空，置顶条目保留，置顶条目以强调色边框标示。

### Skill 库

- 管理本地 Skill 包：导入 ZIP / 目录 / 单文件 Markdown / 指定路径，也支持把 ZIP、目录或 Markdown 拖进页面或导入弹窗的投放区。投放区可点击选择 ZIP，弹窗下方分别保留目录和 Markdown 入口。
- 解析 `SKILL.md` 的 frontmatter 与正文，未知字段逐行保留在 `frontmatter` 中以便回写；`slug` 唯一，**重复导入不覆盖已有记录**；详情页提供「复制为新 skill」（生成 `source: 'duplicate'` 的新条目）。
- 封面支持本地图片/视频与外链 URL（图片 ≤ 12MB、本地视频 ≤ 200MB、远程文件 ≤ 30MB），落 `files/skill-covers/`；列表可搜索（名称/描述/正文）、可置顶、可按来源筛选；移除只删记录，包文件与封面保留在数据目录。
- 点击详情页的图片封面可在弹窗中等比放大查看，使用关闭按钮或 `Esc` 返回详情。Skill 左列表标题保持单行。
- 左列表以文件夹取代标签筛选条，操作与笔记库相同。升级时的归类只执行一次，原有标签、导入与新建时的标签编辑和包文件保持原样。新建和导入的 Skill 默认位于顶层。两个库的搜索也匹配文件夹名。

### 媒体资源库

- 独立「媒体库」模块，管理图片与视频，两类均支持「本地文件保存」与「URL 地址保存」，点击后本地预览。复用 `wb-asset://` 协议与 `assets.ts` 的落盘/下载/流式能力。
- **数据模型**：`010_media.sql` 建立 `media_items`；`012_media_groups.sql` 新增 `media_groups` 以及索引化的可空 `group_id`；`013_media_hash.sql` 新增 `content_hash` / `visual_hash` 及索引，供导入去重使用。一组可同时包含图片和视频，每个素材最多归属一组。旧素材和在媒体库首页导入的素材默认未分组。
- **导入去重**：入库前先算指纹再落盘。`content_hash` 为文件字节的 SHA-256（图片与视频通用），`visual_hash` 为图片解码成 RGBA 位图后的 SHA-256，用于识别换了容器或无损重存的同一张图，解码失败时留空。按目标分组判重，「未分组」单独计算，同一素材可在不同分组及未分组各存一份。命中即跳过，返回已有素材名与所在分组（`MediaImportResult.duplicates`）。不做感知哈希，同图不同尺寸或有损重压缩不判重。升级前的旧记录在启动后由主进程分批回填指纹，导入和归属变更等待回填完成；算不出（文件缺失、格式不支持）的记录写入 `-` 标记避免反复重试。已有重复记录由用户管理。
- **分组操作**：创建、编辑和删除分组，组名去除首尾空白、最长 40 字，同名不可重复，简介最长 160 字。媒体库首页把分组卡片与未分组素材放在同一栅格，分组卡片排在前面。分组自动使用组内最近导入的图片作为封面，无图片时使用默认封面。斜角信息面板默认显示组名和简介预览，悬浮或键盘聚焦时上移显示完整简介，点击卡片进入分组。分组筛选可与类型、搜索条件叠加。
- **素材归属**：媒体库首页普通浏览展示分组与未分组素材。输入名称或原文件名时检索整个媒体库，结果区显示素材和所属分组，类型筛选仍可叠加。在分组内搜索时只查询本组。`list` 的 `groupId` 省略时查全部，为 `null` 时查未分组。导入和拖放保存到当前选中的组，媒体卡片可移动到其他组或「未分组」，目标位置已有同一素材时保留原归属。删除组后，组内媒体及本地文件保留并归入「未分组」。如果删除分组会在未分组中产生重复素材，提示先处理重复项，分组及素材保留原状。
- **批量管理**：入口与类型筛选、名称搜索共用素材工具栏。进入后只显示可勾选的素材，可逐项勾选或全选本页。选中素材后显示移动与删除，点「完成」退出。切换分组、筛选或分页时清空勾选。批量移动可作用于不同分组的搜索结果，目标位置已包含的条目无需移动。批量删除共确认一次，逐项复用单条删除和文件清理逻辑。部分失败时报告结果，仍在本页的失败项保留勾选供重试。
- **存储**：落 `files/media/<uuid>.<ext>`。本地文件经扩展名白名单（图片 PNG/JPG/WebP/GIF/AVIF，视频 MP4/WebM/MOV/M4V/OGV）校验并先算指纹，未命中重复才复制入库；URL 经 HTTP/HTTPS 下载（超时 15s、禁止用户名密码、主进程 `net.fetch`）并按 magic bytes 嗅探扩展名，命中重复时只在内存中丢弃、不落盘。大小限制：图片 ≤ 12MB、本地视频 ≤ 200MB、远程视频 ≤ 30MB，超限或无法识别抛结构化错误。
- **协议**：`wb-asset://media/<uuid>.<ext>`；`resolveAssetPath` 的 `media` 分支沿用 UUID.ext 校验，`protocol.handle` 已转发 Range，视频可 seek。
- **界面**：页头右侧统一由「添加素材」选择本地文件或链接。首页同排提供「新建分组」，组内同排提供「分组操作」菜单。组内页头上方左侧单独放置「返回媒体库」按钮，高度 44px，点击返回首页。栅格卡片列表中图片懒加载缩略图，视频用播放图标占位，不挂 video 元素。点击卡片后在 `<dialog>` 浮层预览，图片支持 `←` / `→` 循环切换，视频的方向键保留给原生播放器。Esc 或右上角关闭按钮关闭，点击遮罩不再关闭，两种类型都可「用系统应用打开」。预览失败显示中文提示。删除二次确认并写明「将同时删除本地文件、不可恢复」。

### 密码库

- 从侧栏或首页「常用」打开，也可在「更多 → 工具」找到。创建和解锁共用居中卡片，使用单独的主密码。主进程用随机盐和 scrypt 派生密钥，以 AES-256-GCM 加密网站地址、用户名、密码和自动填充选项。数据库只保存盐值和密文。解锁 15 分钟后，或锁屏、休眠、退出时，销毁内存密钥并锁定密码库。
- 支持手动添加、编辑、删除网站账号。`api.vault` 提供状态、解锁、锁定、账号管理和浏览器连接，账号列表不返回密码。改绑网站时必须重新输入网站密码。添加/编辑弹窗提供本地随机密码生成（crypto 随机源，长度 4–64，可勾选大写/数字/符号，启用中的每类字符至少出现一个），密码框下方按字符集 × 长度的熵值实时显示四档强度提示。
- Chrome / Edge 扩展通过 Native Messaging 和 Windows 本地命名管道连接 WorkBase。用户显式启用连接后才登记本地主机，管道凭证每次运行重新生成。扩展逐站请求访问权限，按完整 HTTPS 来源匹配账号（协议、主机名和端口一致）。WorkBase 收起到托盘且密码库已解锁时仍可填充。
- 识别顶层页面中同源提交的常见用户名和密码表单，支持普通 POST 和由网页脚本拦截原生提交的表单。识别后显示「存」角标，并在同源页面短暂提示。待保存数据在浏览器内存中保留两分钟，用户确认后才写入密码库。已有相同账号的密码改变时可以确认更新。可填充普通同源 POST 表单，或未指定提交方式和地址、账号及密码字段无名称且密码明确标为当前密码的表单。默认选中账号后填充，同源只有一条已存账号且启用自动填充时可在打开登录页后直接填入。填充不触发表单提交。

### 账单

- 账单页配置一个 QQ 邮箱，连接 imap.qq.com:993，授权码经 safeStorage 加密保存。按回溯天数只读检索支付宝邮件附件；用户输入本次解压密码后发起获取。
- ZIP 在内存中解压，限制条目数、输入与实际解压体积，支持 ZipCrypto 与 AES；CSV 用 csv-parse 与 TextDecoder 解析。手动导入先选文件，CSV 和无需密码的 ZIP 直接导入，加密 ZIP 才弹出密码框。同一文件可重试密码，取消即释放暂存内容。不同附件单独处理并报告失败。
- 只纳入状态为「交易成功」的交易，保存交易时间、分类、整数分金额、不可逆去重键与导入来源，并解析「收/支」（兼容「收支」）与「交易对方」。收入映射为 income，其余或缺列默认 expense。订单号去重口径不变，无订单号的签名包含方向，交易对方不参与去重。重导早期版本已保存的无订单号账单时，按旧签名和条目出现次数去重，保留已导入记录。
- 分析支持全部、近 3/6/12 个自然月、今年、去年，统一以北京时间划定自然月和自然年。「本月收支」独立显示本月收入、支出及环比，上月支出为零时不显示环比百分比。时间筛选只影响范围内收入、支出、结余、笔数、图表和明细。已有导入记录时，加载中或所选范围无交易，时间筛选栏仍可操作。
- 账单页顶部为一张「收支概览」横幅卡：卡头左侧显示「本月收支 · 月份」（当月无交易时显示「收支概览」），右侧为时间范围筛选；卡体内本月支出（含环比）、本月收入在左，中灰竖分隔线后为范围收入、范围支出、范围结余，均用无壳统计块排布。概览卡下方是「本月预算」卡：显示本月预算进度条与剩余金额，行内输入以元为单位设置或清除预算。月度收支趋势与支出分类按 2∶1 同行排列；趋势卡在图表上方给出月均支出、单月峰值与范围结余摘要（不足两个月时不显示摘要与图表）。支出分类卡上方以环形占比图总览前六类及「其余分类」，环形切片与横向条形排行按同一组分类色一一对应，条形排行每行显示当前筛选范围内的金额和占总支出比例。收支概览的范围收入与范围支出统计块右侧带各月迷你走势线（随当前时间范围变化）。页头提供「分类规则」入口：弹窗内添加/删除「交易对方包含关键字 → 分类」规则（分类输入带已有分类的候选列表），并可对已有账单执行「应用到已有账单」。导入失败在原弹窗内显示原因，部分成功时在页内报告结果。交易明细位于图表下方，默认折叠为一行标题（显示总笔数），点击展开后提供关键字搜索（匹配交易对方与分类）和收/支筛选，走独立的 `api.bills.rows` 查询：筛选只作用于明细列表与它的计数、分页，不改变图表统计。展开的表格展示北京时间、收/支、分类、交易对方及带正负号的金额，每页 50 条。

### 智能助手

OpenAI 兼容配置（baseURL / model / temperature / maxTokens，可选 `apiKey` 存 `secrets`），`/models` 不保证可用时以手动输入模型名为准；独立对话页，流式输出，支持停止；上下文动作：笔记→总结/提取待办/续写，邮件→摘要/判断是否需要回复，账单→本月消费分析与异常提醒，待办→今日安排建议；会话历史落 `ai_threads` / `ai_messages`，可重命名与删除。未配置时给引导而非报错。

左侧会话列表宽度可拖动分隔线或聚焦后按左右方向键调整（168–420px），聊天内容区宽度由内容区左右边缘的手柄或方向键调整（520–960px），输入框高度由输入区上缘手柄上下拖动或聚焦后按上下方向键调整（34–220px，超出单行后滚动显示），三者偏好均保存在本机，窗口过窄时相应收缩。在列表条目上右键弹出菜单，可直接对任意会话重命名或删除（删除需确认）；选中会话的页头操作菜单保留。

`api.ai.config()` 用 `configured` 表示能否发起连接，用 `hasKey` 表示已保存密钥。保存接口地址和模型后，无需密钥的服务可直接使用。保存配置时省略 `apiKey` 保留原密钥，明确传空字符串移除原密钥。

未配置时，页头下方以普通提示引导前往设置的「AI 接口」页签，配置读取失败时显示警告。配置就绪后显示新建会话、示例和输入框，空白对话区仅保留标题、操作和示例，输入区保留快捷键提示。已有本地会话仍可浏览和管理，有多条会话时可按标题搜索。

消息悬停显示「复制」（写入原始 Markdown）；最后一条助手回复悬停时额外提供「重新生成」，走 `api.ai.regenerate`：主进程裁掉末尾回复后按原上下文重发，流式替换旧回复。代码块容器悬停显示右上角「复制」按钮，由聊天区事件委托写入剪贴板。

**今日回顾**：页头「生成今日回顾」弹窗按日期汇总本地记录（当天完成待办、当前待办统计、专注分钟、写作净增字数、习惯打卡、日记摘录前 160 字、纪念记录前 5 条）作为上下文，经已配置的 AI 接口一次性生成 ≤400 字 Markdown 回顾，包含总述与「完成」「专注与习惯」「值得跟进」三节。可切换日期、重新生成、复制或保存为带「AI日报」标签的普通笔记；结果不写入 AI 会话。日记摘录会随上下文发送给用户自己配置的 AI 接口。

### 热点追踪

入口和页头显示「热点追踪」。沿用 `article-writing` 模块标识与 `/article-writing` 路径，以保留已有常用入口。打开页面默认进入「平台热点」，首次显示 B 站全站榜。页内切换「每日简报」和「自媒体写作」；「自媒体写作」提供「直接写文章」和「参考爆款创作」。把榜单条目加入参考后可继续浏览，进入写作时直接显示已选素材。写作区可返回平台热点选材，切换期间保留本次会话中的创作输入。

「平台热点」可切换查看 B 站、抖音、快手、微博、知乎、百度和今日头条的公开榜单。选择平台时加载对应榜单，显示获取时间，并可手动刷新。各榜独立保留最近一次成功结果，刷新失败时提示并保留旧结果。名次和指标按各平台的原始口径展示。

B 站提供全站榜及知识区榜。知识区按独立的榜单领域筛选，科学用科学科普子区，历史用人文历史子区，人文用人文历史及社科与设计相关子区，保留原榜名次。其他平台展示综合热榜。榜单条目可跳转到平台作品、话题或搜索页，也可选为参考素材。

「每日简报」页签展示 AI Hot 中文要闻的本地存档（同步与存储沿用 `daily-briefs` 主进程通路）。按期号倒序列出存档，每期默认折叠，显示 RSS 期号与按本地时区计算的最近获取日期。点击期号行可单独展开或收起。展开后可查看中文要闻的标题、摘要和详情链接，以及原始 RSS 摘要。页签显示上次成功同步时间，可立即刷新或打开中文简报首页。

- **自动同步**：WorkBase 启动后在后台检查，运行期间每小时检查一次，留在托盘时继续。系统从休眠恢复且距上次检查已满一小时则补查。请求超时 15 秒，同一时刻只允许一次同步。失败时保留历史并显示原因。
- **本地历史**：以 RSS 识别期号，同步时保存中文简报页面上已有中文标题和摘要的条目。按期号日期去重，同一期可更新，已有英文摘要可回看，最新一期在同步后补齐中文内容。摘要以纯文本显示，详情由系统浏览器打开。
- **逐期删除**：每期卡片提供删除入口，确认后清除该期内容，只保留期号和最近同步时间以避免重复导入。同一期重新出现在 RSS 时跳过内容保存，后续新期照常同步。

选择人文、科学或历史，输入题目或由 AI 选题。一次生成中文标题、导语、正文、发布摘要和待核实的事实清单。请求通过现有 AI 配置在主进程发出，结果经结构校验后交给页面，不写入 AI 会话。草稿在本次应用会话内可继续编辑。重新生成时保留现有草稿，直到新稿成功返回；替换未保存的草稿前提示确认。

稿件开头给出一个明确、可论证的判断。正文用具体事例、可观察的现象或史料支撑判断，交代依据如何导向结论，并说明影响结论的条件或争议。正文约 500–800 字，论证完整即可收尾。模型在同一次请求内按这些要求审读成稿，去除套话、重复和空泛总结。

「复制文章」复制标题、导语和正文，「复制摘要」单独复制发布摘要。手动保存会在笔记里创建带「自媒体」与类别标签的普通笔记，并收录摘要与待核实事项。保存后的版本可直接打开。当前版本只调用已配置的模型，事实清单供人工复核，发布由用户在目标平台完成。

「参考爆款创作」支持粘贴文章正文、视频字幕或口播稿，也可使用在「平台热点」选中的条目。一次可选至多三条素材。榜单条目自动带入标题及平台提供的简介，可手动补入正文或字幕以分析实际结构。

先按各素材实际提供的内容拆解标题、开场和推进方式，再给可选的原创角度。用户补充自己的观点或素材，确认角度后生成可编辑文章或视频制作方案。视频方案包括推荐制作方式、素材清单及逐镜时长、画面、口播或字幕和制作动作。用户可复制或保存到笔记，应用不进行渲染或发布。

### RSS 订阅

- `sources` 模块（「RSS 订阅」，外部数据组）：用户自行添加 RSS / Atom 订阅地址（HTTP/HTTPS、禁止用户名密码与片段、去重）。主进程 `net.fetch` 抓取，15 秒超时、拒绝重定向、不发送凭据、响应上限 5MB、固定 UA、每次每源最多 200 条。由 htmlparser2 解析 RSS 2.0 与 Atom，保留纯文本摘要（≤1200 字）。同步时为缺配图的条目从订阅内容提取封面，优先使用媒体缩略图，其次使用图片附件或订阅正文里的首张图片。主进程只下载源内标注的公开 HTTPS 图片，拒绝重定向和非公网地址，不发送凭据。单图上限 256 KB，每次每源最多尝试 12 张。通过格式识别的图片进入本地缓存，下载失败时仍可阅读条目。应用不为配图打开原文网页，也不加载网页脚本。
- 同步时机：添加后立即抓取一次；应用启动 10 秒后与每小时刷新全部启用源，休眠恢复超过一小时补查；错误写入源记录的 `last_error` 并在列表标出，不影响其它源。条目按 `(source_id, guid)` 去重，只增不改已读状态；删除源时级联删除条目。
- RSS 页左侧列出订阅源和未读数，右侧是文章工具栏、自适应卡片网格与空状态。卡片上方以 5:4 显示配图，缺图时显示文章图标，下方显示标题、来源、日期、未读标记和原文入口。工具栏支持当前源搜索标题/摘要、未读/全部筛选和订阅源操作，每页 50 条。源支持暂停/启用、单独同步与删除（删除前确认）。
- RSS 页铺满工作区，页头和工具栏使用共享工具栏底色，订阅源侧栏与文章卡片使用共享分区底色。订阅源列表与文章网格各自纵向滚动，超出区域时显示自己的滚动条。文章工具栏固定在右栏顶部，切换订阅源、筛选或分页时文章区回到顶部。
- 点击卡片在工作台的阅读抽屉内打开文章。点击抽屉外部、关闭按钮或按 Esc 收起。同步时缓存订阅附带的完整正文。有摘要而无正文时，可在阅读面板主动加载条目的公开 HTTPS 原文（包含 HTTP 链接的 HTTPS 版本），仅提取正文的文字、基本排版和链接，保存后可离线阅读。请求限定为公开 HTTPS 地址、至多三次公开 HTTPS 重定向，响应最多 2 MB，不发送凭据，不执行脚本或加载网页子资源。仍可选择用系统浏览器打开原文。

### 设置

设置页的标题、左侧导航和正文共用同一块不透明的主题底色。页头保留粘性关闭按钮，左侧导航随内容宽度收窄移到页头下方。

1. **AI 接口**：接口地址、模型和密钥集中显示，温度和最大 token 归入「生成参数」，宽度足够时同排对齐。测试与保存集中在表单末尾。
2. **外观**：主题提供浅色、深色、跟随系统，界面风格提供标准、纸面工作台、拟态和苹果。工作台壁纸与沉浸背景用 Tab 栏分割，两者均提供「清晰背景」开关（降低蒙层以显示更多壁纸）。素材为空时可展开「轮播与蒙层」设置预设，有素材时直接显示相关设置。轮播开启后可直接输入间隔秒数或用步进按钮调整。当前壁纸是可用图片且蒙层适用时，显示可拖动的原图与蒙层对比。
3. **数据与备份**：目录操作紧贴当前路径和迁移说明，备份操作独立成组。导出内容包含数据库和 `files/` 全部资产。更改位置会复制现有数据、保留原目录并自动重启。
4. **关于与快捷键**：快捷键只读列表（Ctrl F / Ctrl J / Ctrl 1–9 / Ctrl 0 / Ctrl S / Ctrl Shift Space / Esc），宽度足够时两列排布。「应用行为」组提供开机自启开关（写入 Windows 登录项，保存后读回实际状态）。「本地提醒」组提供待办到期、习惯晚间与纪念日三类系统通知开关（写 `notify.*`，即时生效）。版本和数据目录列在「应用信息」。当前页面没有开源许可清单，验收时不得以此为由判缺。

## 9. 非功能要求

- 数据库连接单例，启动时执行迁移；所有写操作走事务；`better-sqlite3` 必须 `electron-rebuild` 后运行（ABI 不匹配会直接崩）。
- 主进程不得在 `app.ready` 前创建窗口；所有 service 懒初始化，IMAP 同步、壁纸扫描不阻塞首屏。
- 主进程在进行邮件同步与账单解析时不得阻塞渲染，进度必须可见；单账户同一时刻只允许一个同步任务。
- 日志：写 `userData/logs/main.log`（简单轮转，单文件 2MB），只在主进程；不打印任何密钥、邮件正文、账单原文。
- 崩溃隔离：任一 IPC handler 抛错不得导致窗口白屏，渲染层统一 ErrorBoundary 与 toast。
- 打包：`pnpm build` 重新生成 `dist/`，`pnpm dist` 在 `release/` 生成 `WorkBase-Setup-<version>.exe` 和 `WorkBase-Portable-<version>.exe`。`asar` 开启，原生模块与 imapflow 依赖 `asarUnpack`。渲染层依赖合并到前端资源，发行包仅携带主进程的运行依赖。

## 10. 验收标准（由审批方逐项核对）

1. `pnpm typecheck` 0 error，`pnpm lint` 0 error，`pnpm build` 成功。
2. 主进程窗口配置满足第 3 节安全项（逐项读 `window.ts`，含 `backgroundThrottling: false` 与 CSP）。
3. 首次启动自动建库，重启后数据仍在；删除 `workbench.db` 可干净重建；迁移只追加不修改。
4. 笔记（含日记）/待办/习惯/英语学习/专注 CRUD 与搜索可用，重启后持久化。
5. 导航：侧栏、更多面板、首页卡片、命令面板、快捷键全部由 `registry.ts` 派生；`grep -rnE "'(notes|todos|bills|mail|ielts)'" src/renderer/src/components/` 在布局组件中不得命中模块 id 字面量。
6. 导航：pin 4 个模块后重启仍生效；pin 超过 8 个时侧栏只显示前 8 且更多面板有提示；取消 pin 后侧栏立即消失。
7. 壁纸：URL / 本地 / 系统 / Wallpaper Engine 四种来源共用整窗背景层。自动适配时横向和方形素材等比铺满，竖向素材和尺寸不足以铺满窗口的 Wallpaper Engine 图片完整显示。铺满窗口模式下，所有素材等比覆盖窗口四边。完整显示模式下，所有素材均完整显示，能放下时保持原尺寸，超出窗口时等比缩小。重启后保留显示方式。GIF 与视频壁纸在失焦、最小化还原后仍在播放；选择器区分原视频、动图与静态预览，并显示已加载的预览图尺寸。
8. 壁纸：切换「无壁纸 / 浅色壁纸 / 深色壁纸」时，同一主题下同一元素的计算样式逐字段相同（背景层透明度与背景模糊除外）；画面延伸到标题栏及原生窗口按钮下方时能透出壁纸，图标在浅色和深色主题下可见。
9. 沉浸专注四种场景可用，倒计时不因切换场景或退出沉浸而重置，结束只保存一次记录并计入年度活动。控制面板只显示计时、场景、空间三组，左上角「返回工作台」按钮可保留计时返回（全屏下隐藏）。学习工具在右侧垂直居中，放松进入即开始呼吸引导。沉浸壁纸可切换清晰模式。图片和视频可进入分组查看组内素材，播放时支持 `←` / `→` 循环切换，视频播完与图片每 5 秒自动接续。
10. 账单：从已连接的 QQ 邮箱检索真实支付宝账单附件，输入正确 ZIP 密码后导入成功；同一文件再次导入只计重复。仅「交易成功」交易进入统计。
11. 账单：非支付宝 CSV 与不安全 ZIP 给出中文提示且不写库。缺少或输入错误 ZIP 密码时拒绝解压。
12. AI 配置后流式对话可用，未配置时给出明确引导而非报错堆栈。
13. 媒体库：本地与 URL 两种来源的图片/视频都能入库并本地预览，删除时同步删除文件；同一内容允许在不同分组和未分组各存一份，在同一位置再次导入会跳过并提示；弹窗点击外部不关闭。Skill 库：ZIP / 目录 / Markdown 三种导入均可用，封面与置顶生效。
14. 数据目录：更改保存位置后数据完整迁移、应用自动重启且数据仍在；「用回默认位置」可复原；导出备份包含数据库与全部 `files/` 资产。
15. 打包出的 `.exe` 在无开发环境的路径下能启动、能建库。
16. 界面在 1360×860 与 1080×700 两档下无溢出、无重叠、无滚动条双重嵌套（含更多面板展开态）；侧栏在 ≥1200px 为宽态、以下为图标轨。
17. 无 `console.log` 残留调试输出，无硬编码密钥，无 TODO 占位实现。
18. 内置模块可插拔（关键验收，必须实测）：在 `features/` 下新建一个测试模块的 `module.tsx`，**不改其它任何文件**，重启 dev server 后它自动出现在更多面板、命令面板与首页常用「编辑」的添加列表中，能 pin 到侧栏、能从路由直达、能打开页面；删除该文件并重启后，其入口、路由与 pin 记录自动消失且应用不报错。`hidden: true` 的模块不出现在导航与命令面板，但可通过直接路由访问。
19. 外部插件热加载：成品应用保持打开时，把完整插件文件夹放入指定目录。入口自动出现，能固定、搜索和打开。修改插件资源后当前插件页面重载，移走文件夹后入口消失，打开的插件页返回首页。
