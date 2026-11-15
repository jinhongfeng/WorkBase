本阶段已由审批方授权执行。收到后立即动手，不要复述计划、不要等待确认、不要只分析不落地。

读 docs/DESIGN.md（尤其第 4、5、6 节的媒体段与第 8 节「媒体资源库」小节）、AGENTS.md，以及现有 assets 与 skills 实现，然后只完成「媒体资源库（media）」这一个模块。只新增 media 域 + 对 `assets.ts` 做最小扩展，不碰 mail / bills / notes / skills / dashboard 等其它模块，不重构已完成代码。

## 目标

新增独立「媒体库」模块：保存与管理图片、视频两类媒体资源，两类均支持「本地文件保存」与「URL 地址保存」两种来源，点击后均可本地预览。复用 `wb-asset://` 协议与 `assets.ts` 的落盘/下载/流式服务能力，不引入新依赖、不修改已执行迁移。

## 现状（先读这些文件，勿改无关系文件）

- `src/main/assets.ts`：已有 `ASSET_SCHEME`、`IMAGE_EXTENSIONS`、`VIDEO_EXTENSIONS`、`MIME_BY_EXTENSION`、`filesRoot()`、`imagesDir()`、`coversDir()`、`saveImageDataUrl`、`saveCoverFile`（本地文件→`skill-covers/`）、`fetchCoverFromUrl`（URL 下载→`skill-covers/`）、`coverExtension`（magic bytes 嗅探，私有）、`resolveAssetPath`（目前只认 hostname `images` 与 `skill-covers`）、`serveAssetFile`（支持 Range，视频可 seek）、`discardUnassignedCover`。
- `src/main/index.ts`：`protocol.handle(ASSET_SCHEME)` → `resolveAssetPath(url.hostname, url.pathname)` → `serveAssetFile`；`registerXxxIPC()` 显式逐个注册（需新增 `registerMediaIPC()` 调用）。
- `src/main/db/migrations/`：最新序号 `009_bills_v2.sql`，本次新增 `010_media.sql`。
- `src/main/db/repo/skills.ts`：语义化仓储 + snake_case→camelCase 映射的参考。
- `src/main/ipc/skills.ts`：zod 校验、`dialog.showOpenDialog`、`fail(code,message)`、`shell.openPath` 的参考。
- `src/shared/ipc-contract.ts`、`src/shared/types.ts`（含 `WorkBaseAPI`）、`src/preload/index.ts`。
- `src/renderer/src/features/skills/`（`module.tsx` 的 defineModule 写法、`SkillCover.tsx` 的缩略图/视频播放写法）、`src/renderer/src/features/demo/module.tsx`（最小模块）。
- `src/renderer/src/modules/defineModule.ts`、`modules/groups.ts`（分组顺序 `['记录','外部数据','工具']`）。

## 1. 数据模型（新增迁移 010_media.sql）

新建 `src/main/db/migrations/010_media.sql`，逐字落地：

```sql
CREATE TABLE media_items (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('image', 'video')),
  source        TEXT NOT NULL CHECK (source IN ('local', 'url')),
  name          TEXT NOT NULL DEFAULT '',
  file_name     TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  original_url  TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_media_created ON media_items(created_at DESC);
CREATE INDEX idx_media_type ON media_items(type);
```

- `type`：image | video；`source`：local | url。
- `file_name`：`files/media/` 下的文件名（`<uuid>.<ext>`），入库存文件名而非全路径（与 skills 的 `cover_path` 一致）。
- `original_name`：本地源文件的原始文件名（URL 源为空）。
- `original_url`：URL 源的原始地址（local 源为空），仅留档。
- 时间统一 Unix 毫秒，ID 用 `crypto.randomUUID()`。

## 2. 主进程媒体能力（扩展 src/main/assets.ts）

在 `assets.ts` 内新增（同文件可直接复用私有 `coverExtension`、`filesRoot` 与各常量），不改 skills 封面现有行为与文案：

- `mediaDir()`：`join(filesRoot(), 'media')`。
- `sniffMediaKind(bytes): 'image' | 'video'`：先用图片 magic bytes 判断（PNG/JPG/WebP/GIF/AVIF），再用视频（ftyp MP4/MOV、WebM、OggS），都不匹配抛 `MEDIA_INVALID`「内容无法识别为受支持的图片或视频」。用于 URL 下载后的自动识别。
- `saveMediaFile(sourcePath, kind): { fileName, size, mime }`：扩展名白名单校验（图片 PNG/JPG/JPEG/WebP/GIF/AVIF，视频 MP4/WebM/MOV/M4V/OGV）→ 非空文件与大小校验（图片 ≤ 12MB、视频 ≤ 200MB）→ `copyFile` 到 `mediaDir()`，文件名 `<uuid><ext>`；返回文件名、字节数、`MIME_BY_EXTENSION` 的 mime。非法扩展名/读不到/超限分别抛 `MEDIA_INVALID` / `MEDIA_TOO_LARGE`。
- `fetchMediaFromUrl(rawUrl): { fileName, kind, size, mime, originalUrl }`：仅接受不含用户名密码的 http/https；`net.fetch`（超时 15s、跟随重定向）；读 body 并按字节数限制（图片 ≤ 12MB、视频 ≤ 30MB），下载失败抛 `MEDIA_FETCH_FAILED`，超限抛 `MEDIA_TOO_LARGE`；用 `sniffMediaKind` 判定类型与扩展名，写 `mediaDir()`；返回文件名、类型、字节数、mime、原始 URL。下载后文件写入失败要清理临时文件。
- 在 `resolveAssetPath` 增加 `media` hostname 分支：`if (hostname === 'media') { ... }`，沿用既有 `/^\/[0-9a-f-]{36}\.[a-z0-9]+$/i` 校验，返回 `join(filesRoot(), 'media', name)`（文件不存在返回 `legacyFilesPath` 兜底，与现有一致）。
- `removeMediaFile(fileName)`：`rm(join(mediaDir(), fileName), { force: true })`，供删除时清理。

`saveImageDataUrl`、`saveCoverFile`、`fetchCoverFromUrl`、`discardUnassignedCover` 及其错误码保持原样，不要动。

## 3. 仓储层（新增 src/main/db/repo/media.ts）

只暴露语义化方法，SQL 不出仓库：

- `listMedia(query: { type?: 'all'|'image'|'video'; q?: string; page?: number; pageSize?: number }): { items: MediaItem[]; total: number }`：按 `type` 过滤（缺省 all）、`q` 模糊匹配 `name` 或 `original_name`（LIKE `%q%`），`created_at DESC` 排序，`LIMIT/OFFSET` 分页（pageSize 默认 60、上限 200），同时 `COUNT(*)` 返回总数。返回项含 `url`（`wb-asset://media/<file_name>`，`encodeURIComponent`）。
- `insertMedia(record): MediaItem`：插入一行并返回 `getMedia(id)`。
- `getMedia(id): MediaItem | null`。
- `removeMedia(id): void`：删记录（文件删除由 IPC 层先取 `file_name` 再调 `removeMediaFile` 完成，避免删除后无法定位文件）。

行→对象的 snake_case→camelCase 映射照 `repo/skills.ts` 的 `toSummary` 风格。

## 4. 类型与 IPC 契约

`src/shared/types.ts` 新增并纳入 `WorkBaseAPI`：

```ts
export type MediaType = 'image' | 'video'
export type MediaSource = 'local' | 'url'
export interface MediaItem {
  id: string
  type: MediaType
  source: MediaSource
  name: string
  fileName: string
  originalName: string
  originalUrl: string
  mime: string
  size: number
  url: string        // wb-asset://media/<fileName>
  createdAt: number
}
export interface MediaQuery { type?: 'all' | MediaType; q?: string; page?: number; pageSize?: number }
export interface MediaListResult { items: MediaItem[]; total: number }
export interface MediaAPI {
  list(query: MediaQuery): Promise<MediaListResult>
  saveLocalFiles(): Promise<MediaItem[]>
  saveFromUrl(input: { url: string }): Promise<MediaItem>
  remove(id: string): Promise<void>
  reveal(id: string): Promise<void>
  openExternal(id: string): Promise<void>
}
```

`src/shared/ipc-contract.ts`：新增 `media` 通道常量并纳入 `IPCContract`：

```ts
mediaList: 'media:list', mediaSaveLocal: 'media:saveLocalFiles', mediaSaveUrl: 'media:saveFromUrl',
mediaRemove: 'media:remove', mediaReveal: 'media:reveal', mediaOpenExternal: 'media:openExternal'
```

```ts
'media:list': { args: [query: MediaQuery]; result: MediaListResult }
'media:saveLocalFiles': { args: []; result: MediaItem[] }
'media:saveFromUrl': { args: [input: { url: string }]; result: MediaItem }
'media:remove': { args: [id: string]; result: void }
'media:reveal': { args: [id: string]; result: void }
'media:openExternal': { args: [id: string]; result: void }
```

## 5. IPC 层（新增 src/main/ipc/media.ts）

`registerMediaIPC()`，每个 handler 用 `validate(z.tuple([...]))` 校验入参：

- `media:list`：zod 校验 `{ type: z.enum(['all','image','video']).optional(), q: z.string().max(100).optional(), page: z.number().int().min(0).max(100000).optional(), pageSize: z.number().int().min(1).max(200).optional() }`（默认 `{}`）。
- `media:saveLocalFiles`：`dialog.showOpenDialog({ properties: ['openFile','multiSelections'], filters: [{ name: '图片或视频', extensions: ['png','jpg','jpeg','webp','gif','avif','mp4','webm','mov','m4v','ogv'] }] })`；取消返回 `[]`；对每个选中文件按扩展名判定 kind（图片扩展名→image、视频→video），调 `saveMediaFile` → `insertMedia`（`name` 默认取 `basename` 去掉扩展名，`original_name` 取原文件名），逐个入库；单个文件失败不影响其余，返回成功入库的 `MediaItem[]`。
- `media:saveFromUrl`：zod 校验 `{ url: z.string().min(8).max(2048) }`；调 `fetchMediaFromUrl` → `insertMedia`（`name` 默认从 URL 路径末段取文件名、失败则留空；`original_url` 存原 URL）；下载失败后不留孤儿文件。
- `media:remove`：先 `getMedia` 取 `fileName`，`removeMedia` 删记录，再 `removeMediaFile(fileName)` 删文件；记录不存在抛 `MEDIA_NOT_FOUND`。
- `media:reveal`：`shell.showItemInFolder(join(mediaDir(), fileName))`（先确认文件存在，否则 `MEDIA_NOT_FOUND`）。
- `media:openExternal`：`shell.openPath(join(mediaDir(), fileName))`，返回错误则 `MEDIA_NOT_FOUND`。

在 `src/main/index.ts` 的 IPC 注册区新增 `import { registerMediaIPC } from './ipc/media'` 与 `registerMediaIPC()` 调用（与其余 `registerXxxIPC()` 并列）。

`src/preload/index.ts`：按 `MediaAPI` 暴露 `api.media`（`ipcRenderer.invoke` 逐项）。

## 6. 前端（新增 src/renderer/src/features/media/）

`module.tsx`：`defineModule({ id: 'media', name: '媒体库', group: '工具', icon: Images（lucide-react）, order: 30, keywords: ['media','媒体','图片','视频','image','video'], summary: async () => { const r = await window.api.media.list({ pageSize: 1 }); return r.total ? \`${r.total} 个媒体\` : '还没有媒体' }, page: MediaPage })`。

页面（组件与交互，样式走 token，动效 ≤180ms，三态 loading/空态/错误）：

1. **顶部操作区**：标题「媒体库」+ 计数；按钮「添加本地文件」（`window.api.media.saveLocalFiles()`，多选）与「添加 URL」（弹出输入框，确认后 `saveFromUrl`）；类型分段筛选「全部/图片/视频」；名称搜索框（180ms 防抖）。
2. **栅格卡片列表**：图片显示懒加载缩略图（`<img loading="lazy">`，`onError` 兜底占位）；视频卡片用播放图标占位（**不挂 video 元素**，避免一屏几十个解码器，照 `SkillThumb` 的做法）。卡片 hover 出现「删除」与「打开所在位置」次要操作。
3. **点击预览**：
   - 图片 → lightbox 全屏遮罩（`--surface` 底 / `--shadow-2`），居中大图 + 右上关闭 + `Esc` 关闭 + 左右切换（上下一条记录），点击遮罩关闭。
   - 视频 → 内置播放器浮层：`<video key={url} src={url} controls autoplay playsInline>`（依赖 `wb-asset` 的 Range 支持 seek）。
4. **删除**：`ConfirmDialog` 二次确认，文案写清「将同时删除本地文件、不可恢复」，确认后 `remove` 并刷新列表。
5. **空态**：引导文案 + 「添加本地文件 / 添加 URL」主操作；错误用 `window.toast.error(humanError(error))`（`humanError` 在 `lib/utils`）。

`media.css` 同目录，class 前缀 `media-`，全部走 CSS 变量，深浅色可读。

## 7. DESIGN 文档同步

`docs/DESIGN.md` 已由审批方更新完毕（迁移表 010、IPC 表 api.media、第 8 节「媒体资源库」小节）。**不要重复改 DESIGN.md**；若实现中发现设计与现实冲突（如某常量/函数名不存在），按 AGENTS.md 在 `temp/blocker.md` 写清冲突点并停下，不要自行改设计。

## 验证并在报告里贴出

- `pnpm typecheck`（0 error）、`pnpm lint`（0 error）、`pnpm build`（成功）的输出摘要。
- 在 `temp/` 写一个临时验收脚本（**不进 src、不打包**）：用 Pillow 生成一张真实 PNG 到 `temp/`，再起一个本地 `http` 服务返回该 PNG；脚本 `import` 主进程的 `saveMediaFile` / `fetchMediaFromUrl` 与 `repo/media`，验证：本地图片入库记录正确、URL 下载自动识别为 image 并入库、`listMedia` 分页与 type 过滤正确、`removeMedia`+`removeMediaFile` 后库与磁盘均清空。脚本仅验收用。
- CDP 截图（`pnpm dev` 后访问 `http://127.0.0.1:9222/json` 取 ws，`Emulation.setDeviceMetricsOverride` 1360×860，`Page.captureScreenshot`），保存：`temp/p6-media-empty.png`（空态）、`temp/p6-media-grid.png`（含图片与视频的列表，先用临时脚本往 `media_items` 插 3 条记录 + 放对应文件到 `files/media/` 再截图）、`temp/p6-media-lightbox.png`（图片 lightbox 展开）、`temp/p6-media-video.png`（视频播放浮层）。截图前轮询确认目标选择器已渲染（不要拍到 loading 帧）。
- 报告里贴出改动文件清单（按目录分组）。

## 边界（不要做）

- 不要改 `001`~`009` 任何已执行迁移，不要碰 `008_activity.sql` 及 activity 相关文件。
- 不要改 skills 封面、notes 图片粘贴等既有 assets 行为与错误文案。
- 不要引入新依赖（lucide-react、zod 已在）。
- 不要做媒体编辑、转码、外部分享、云同步。
- 不要在 src/ 里留 TODO / FIXME / console.log / 假数据占位。

完成后按 AGENTS.md「交付时必须报告」四项写报告，不要输出大段代码。
