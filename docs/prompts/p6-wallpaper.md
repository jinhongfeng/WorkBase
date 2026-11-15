# P6 — 壁纸功能（设置-外观）

本阶段已由审批方授权执行。收到后立即动手，不要复述计划、不要等待确认、不要只分析不落地。

先读 docs/DESIGN.md（第 3、4、5、6、7 节）、AGENTS.md，以及下方「现状」列出的文件，然后**只完成壁纸功能**。不新增迁移文件、不改已执行迁移、不碰 notes/todos/mail/bills/ai/sources/ielts/habits/skills/activity 等其它域。

## 目标

在「设置-外观」新增全局壁纸，满足四点：

1. 三种来源：输入 URL 加载 / 本地文件上传 / 按钮一键获取「电脑端当前桌面壁纸」。
2. 壁纸是全局最底层背景，位于标题栏与侧栏之下，`pointer-events: none`，绝不遮挡任何可交互内容或影响操作。
3. 配置全局生效：标题栏与侧栏「包含并适配」该背景（玻璃化透出 + 明暗自适应文字与图标）。
4. 支持轮播：可开关，自定义间隔（秒）自动切换下一张。

## 现状（先读这些文件，勿改无关文件）

- `src/main/assets.ts`：已有自定义协议 `wb-asset://`（`registerSchemesAsPrivileged` 见 `src/main/index.ts`），`resolveAssetPath` 目前只放行 `images` / `skill-covers` 两个 hostname；`fetchCoverFromUrl` / `saveCoverFile` 是下载 URL、落盘、按魔数识别扩展名的现成范式，壁纸直接复用其思路。
- `src/main/index.ts`：`protocol.handle(ASSET_SCHEME, ...)` 分发到 `resolveAssetPath` + `serveAssetFile`；各域 `registerXxxIPC()` 在此注册。
- `src/main/window.ts`：`setWindowTheme(window, dark)` 用 `setTitleBarOverlay(windowColors(dark))` 控制原生窗口按钮（`--bg` 做底色、`--text` 做符号色）。标题栏是 `titleBarStyle:'hidden'` + `titleBarOverlay`，右侧原生按钮区在 HTML 里用 `padding-right` 避让。
- `src/shared/ipc-contract.ts` / `src/shared/types.ts` / `src/preload/index.ts`：通道名、契约类型、`window.api` 的单一来源。
- `src/main/ipc/validation.ts`：`validate(schema, args)` 入参校验范式；`src/main/db/repo/settings.ts` 提供 `getAllSettings()` / `setSetting(key, value)`。
- `src/renderer/src/components/layout/AppShell.tsx`：渲染 `<TitleBar/>` → `<div class="app-shell">`(Sidebar+main) → MorePanel/CommandPanel/Toast。
- `src/renderer/src/components/layout/TitleBar.tsx`、`Sidebar.tsx`、`src/renderer/src/styles/layout.css`、`tokens.css`、`base.css`。
- `src/renderer/src/features/settings/SettingsPage.tsx` + `settings.css`：外观 tab 现有主题切换。

## 1. 数据模型（settings 键 `ui.wallpaper`，无迁移）

壁纸配置存 `settings` 表 `ui.wallpaper` 键，值为 JSON 字符串。**不新增任何迁移文件。**

`src/shared/types.ts` 新增：

```ts
export type WallpaperSource = 'url' | 'file' | 'system'
export interface WallpaperItem {
  id: string          // crypto.randomUUID()
  source: WallpaperSource
  label: string       // 展示名：URL 用 hostname+文件名、file 用原文件名、system 固定「系统壁纸」
  url: string         // wb-asset://wallpapers/<id>.<ext>，始终指向本地留档副本
  dark: boolean       // 平均相对亮度 < 0.45 判为暗，用于反转文字图标
}
export interface WallpaperConfig {
  items: WallpaperItem[]
  activeId: string | null   // 当前展示项；null=无壁纸
  carousel: boolean         // 轮播开关
  interval: number          // 秒，默认 60，范围 [10, 86400]
  overlay: number           // 暗色蒙层 0..0.6，默认 0.22
}
```

zod 校验（放在 service 或共享处）：

```ts
const WallpaperItemSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(['url', 'file', 'system']),
  label: z.string().max(100),
  url: z.string().max(500),
  dark: z.boolean()
})
const WallpaperConfigSchema = z.object({
  items: z.array(WallpaperItemSchema).max(50),
  activeId: z.string().uuid().nullable(),
  carousel: z.boolean(),
  interval: z.number().int().min(10).max(86400),
  overlay: z.number().min(0).max(0.6)
})
```

## 2. 主进程

### 2.1 `src/main/services/wallpaper.ts`（新建）

职责：目录管理、读写配置、三种来源落盘、亮度计算、移除。所有外发请求在主进程。

- `wallpapersDir()` = `resolve(filesPath()) + '/wallpapers'`，用 `mkdirSync(recursive)` 保证存在。
- `loadConfig(): WallpaperConfig`：读 `getAllSettings()['ui.wallpaper']`，`JSON.parse` + `WallpaperConfigSchema` 校验；解析失败或不存在则返回默认值 `{ items: [], activeId: null, carousel: false, interval: 60, overlay: 0.22 }`。校验后再过滤掉「文件已不存在」的 item，`activeId` 若不在 items 中则置 null。
- `persist(config)`：`setSetting('ui.wallpaper', JSON.stringify(config))`。
- `addFromUrl(rawUrl, label?)`：复用 `fetchCoverFromUrl` 的思路——仅 `http:`/`https:`、URL 不得含用户名密码、`net.fetch` 超时 15s、体积 ≤ 20MB、按魔数（png/jpg/webp/gif/avif，参考 `assets.ts` 的 `coverExtension`）识别扩展名；落盘到 `wallpapersDir()/<uuid>.<ext>`。返回 `{ config, added: WallpaperItem }`。失败抛 `{ code: 'WALLPAPER_*', message }`（中文可读）。
- `addFromPath(sourcePath)`：文件必须存在且 ≤ 20MB，扩展名白名单同上，`copyFile` 到 `wallpapersDir()/<uuid>.<ext>`（**只复制，绝不动原始文件**）。
- `addFromSystem()`：读取 Windows 当前桌面壁纸并复制进来。流程：
  1. `execFileSync('reg.exe', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'], { encoding: 'utf8' })`，从输出末行取 `REG_SZ` 值得到路径；若该路径存在且是图片，用之。
  2. 否则回退 `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper`（Windows 维护的当前壁纸转码副本，通常为 jpg）。
  3. 两者都不可得，抛 `{ code: 'WALLPAPER_SYSTEM_UNAVAILABLE', message: '无法读取系统当前壁纸。' }`。
  - 用 `process.env.APPDATA` 取 `%APPDATA%`；reg 路径里的 `\\` 与空格要正确处理。
- `computeDark(file): boolean`：用 `nativeImage.createFromPath(file).resize({ width: 16, height: 16 }).toBitmap()`（注意 toBitmap 返回 **BGRA** 顺序），逐像素按 sRGB 线性化后取相对亮度加权平均（0.2126 R + 0.7152 G + 0.0722 B），均值 < 0.45 返回 true。`img.isEmpty()` 或解码失败时**不报错**，返回 false（亮度判定是尽力而为）。
- `remove(id)`：删除配置项 + 删除 `wallpapersDir()/<filename>`（从 url 解析文件名；只删应用自己管理的副本）。
- 所有变更操作结束后 `persist` 并返回最新的 `WallpaperConfig`。

### 2.2 `src/main/ipc/wallpaper.ts`（新建）

用 `validate` 范式。通道（见第 3 节）：

- `wallpaper:get` → `loadConfig()`
- `wallpaper:addUrl`：入参 `z.tuple([z.object({ url: z.string().min(1).max(2000), label: z.string().max(100).optional() })])`
- `wallpaper:addFile`：`dialog.showOpenDialog`（图片过滤 png/jpg/jpeg/webp/gif/avif），取消返回 `null`，否则 `addFromPath`。
- `wallpaper:addSystem` → `addFromSystem()`
- `wallpaper:remove`：入参 `z.tuple([z.string().uuid()])`
- `wallpaper:setActive`：入参 `z.tuple([z.string().uuid().nullable()])`，校验 id 存在于 items，写回 `activeId`
- `wallpaper:updateConfig`：入参 `z.tuple([z.object({ carousel: z.boolean().optional(), interval: z.number().int().min(10).max(86400).optional(), overlay: z.number().min(0).max(0.6).optional() })])`，合并写回
- `wallpaper:clear`：清空 items 并 `activeId=null`，删除全部本地副本文件

错误统一 `{ code, message }`，渲染层 `humanError` 呈现中文。

### 2.3 `src/main/assets.ts`（改）

`resolveAssetPath` 放行 `'wallpapers'` hostname（与 `images`/`skill-covers` 并列）。其余不动。

### 2.4 `src/main/index.ts`（改）

注册 `registerWallpaperIPC()`（在 `registerAssetIPC()` 附近）。

### 2.5 `src/main/window.ts`（改）—— 原生窗口按钮可读性

新增 `setWallpaperContrast(window, dark)`：记录 `wallpaperDark` 状态，重新 `setTitleBarOverlay`，使 `symbolColor` 在壁纸为暗时用浅色（取深色 token 的 `--text` 值）、为亮时用当前主题 `--text`；`color`（底色）保持当前主题 `--bg`。需让 `window.ts` 记住当前主题深浅（`setWindowTheme` 里已传入 `dark`，加一个模块级变量存下），以便组合计算。目标是：**暗壁纸下原生最小化/最大化/关闭按钮仍清晰可见**。原生按钮区与半透明 HTML 标题栏之间允许存在轻微色差（V1 已知项）。

## 3. shared 与 preload

`src/shared/ipc-contract.ts` 的 `channels` 新增：

```ts
wallpaperGet: 'wallpaper:get', wallpaperAddUrl: 'wallpaper:addUrl',
wallpaperAddFile: 'wallpaper:addFile', wallpaperAddSystem: 'wallpaper:addSystem',
wallpaperRemove: 'wallpaper:remove', wallpaperSetActive: 'wallpaper:setActive',
wallpaperUpdateConfig: 'wallpaper:updateConfig', wallpaperClear: 'wallpaper:clear',
appSetWallpaperContrast: 'app:setWallpaperContrast'
```

`IPCContract` 新增（`app:setWallpaperContrast` 放在 `app` 段附近）：

```ts
'wallpaper:get': { args: []; result: WallpaperConfig }
'wallpaper:addUrl': { args: [input: { url: string; label?: string }]; result: WallpaperConfig }
'wallpaper:addFile': { args: []; result: WallpaperConfig | null }
'wallpaper:addSystem': { args: []; result: WallpaperConfig }
'wallpaper:remove': { args: [id: string]; result: WallpaperConfig }
'wallpaper:setActive': { args: [id: string | null]; result: WallpaperConfig }
'wallpaper:updateConfig': { args: [input: { carousel?: boolean; interval?: number; overlay?: number }]; result: WallpaperConfig }
'wallpaper:clear': { args: []; result: WallpaperConfig }
'app:setWallpaperContrast': { args: [dark: boolean]; result: void }
```

`src/shared/types.ts` 的 `WorkBaseAPI` 新增：

```ts
wallpaper: {
  get(): Promise<WallpaperConfig>
  addUrl(input: { url: string; label?: string }): Promise<WallpaperConfig>
  addFile(): Promise<WallpaperConfig | null>
  addSystem(): Promise<WallpaperConfig>
  remove(id: string): Promise<WallpaperConfig>
  setActive(id: string | null): Promise<WallpaperConfig>
  updateConfig(input: { carousel?: boolean; interval?: number; overlay?: number }): Promise<WallpaperConfig>
  clear(): Promise<WallpaperConfig>
}
```

`app` 里加 `setWallpaperContrast(dark: boolean): Promise<void>`。

`src/preload/index.ts`：按上述契约接线（`ipcRenderer.invoke`）。

## 4. 渲染层

### 4.1 `src/renderer/src/stores/wallpaper.ts`（新建，zustand）

状态 `{ config: WallpaperConfig }` + 动作：`load()`（调 `wallpaper:get`）、`addUrl/addFile/addSystem/remove/setActive/updateConfig/clear`（每个动作把返回的新 config 写回 state）。派生一个 `active` 选择器：`config.items.find(i => i.id === config.activeId) ?? null`。

### 4.2 `src/renderer/src/components/layout/Wallpaper.tsx`（新建）

- 挂载时 `load()`。
- 渲染最底层背景（见 CSS）。无 active 项时渲染空，并清除 `data-wallpaper-*` 属性。
- 轮播：当 `config.carousel && items.length > 1` 时，`setInterval(config.interval * 1000)` 推进到下一张；用两张叠放的 `<img>` 交叉淡入（180ms）实现无闪烁切换。`activeId` 前进时经 `setActive` 写回（保持重启续播顺序）。组件卸载清理定时器。
- 明暗自适应：`useEffect` 依据 `active.dark` 设置 `document.documentElement.dataset.wallpaper = active.dark ? 'dark' : 'light'`、`data-wallpaper-active = 'true'`，并调用 `window.api.app.setWallpaperContrast(active.dark)`；卸载时清属性并复位 `setWallpaperContrast(false)`。
- 蒙层强度取 `config.overlay`，通过 CSS 变量 `--wp-overlay` 注入。

### 4.3 `AppShell.tsx`（改）

`<Wallpaper />` 作为返回片段**第一个**子元素（在 `<TitleBar />` 之前），保证其在最底层。

### 4.4 CSS（改 `layout.css` / `base.css`，走 token，不散落硬编码）

```css
.wallpaper { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.wallpaper img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity .18s ease; }
.wallpaper-scrim { position: absolute; inset: 0; background: rgba(10, 12, 11, var(--wp-overlay, .22)); }

/* 壁纸激活：标题栏/侧栏玻璃化透出 */
html[data-wallpaper-active="true"] .titlebar { background: color-mix(in srgb, var(--bg) 72%, transparent); backdrop-filter: blur(10px); }
html[data-wallpaper-active="true"] .sidebar { background: color-mix(in srgb, var(--surface-2) 74%, transparent); backdrop-filter: blur(10px); }
/* 内容区给一层高透明度底色，保证正文可读同时隐约透出壁纸 */
html[data-wallpaper-active="true"] .main-content { background: color-mix(in srgb, var(--bg) 86%, transparent); }

/* 暗壁纸 → 反转标题栏/侧栏文字与图标为浅色（在 .titlebar/.sidebar 作用域内覆盖变量） */
html[data-wallpaper="dark"] .titlebar { --text: #F1EEE6; --text-2: #D6D3D1; --text-3: #A8A29E; }
html[data-wallpaper="dark"] .sidebar { --text: #F1EEE6; --text-2: #D6D3D1; --text-3: #A8A29E; }
html[data-wallpaper="dark"] .titlebar .title-search { background: rgba(255,255,255,.09); color: #F1EEE6; }
html[data-wallpaper="dark"] .sidebar .nav-button { color: #D6D3D1; }
html[data-wallpaper="dark"] .sidebar .nav-button:hover { color: #FFFFFF; background: rgba(255,255,255,.10); }
html[data-wallpaper="dark"] .sidebar .nav-button.selected { color: var(--accent); }
```

深浅主题都要正确（`color-mix` 与 `backdrop-filter` 在 Electron 45 可用；`data-wallpaper` 作用域变量覆盖必须压过 `:root` 与 `[data-theme]`）。若 `backdrop-filter` 在验收机上有 GPU 兼容问题，允许降级为「去掉 blur 只留半透明」，但要保证可读性，并在报告说明。

## 5. 设置页 UI（改 `SettingsPage.tsx` + `settings.css`）

外观 tab 主题选择下方新增「壁纸」区块（`h3` 分组）：

1. 三个来源按钮（一排）：「输入 URL」「上传本地文件」「获取系统壁纸」。
   - 「输入 URL」：展开一个内联输入框 + 「加载」按钮；空/非法 URL 给 `humanError` 提示；成功后 toast「壁纸已添加」。
   - 「上传本地文件」：调 `wallpaper:addFile`。
   - 「获取系统壁纸」：调 `wallpaper:addSystem`，失败 toast 中文错误。
2. 壁纸缩略图网格：每项显示缩略图（`<img src=item.url>`）+ 名称；点击设为当前（`setActive`），当前项有高亮边框 + 「使用中」角标；每项右上角「移除」按钮（`remove`，需二次确认，文案写清「删除后不可恢复」）。
3. 轮播：开关（`updateConfig({ carousel })`）；间隔数字输入（秒，min 10，`updateConfig({ interval })`），仅轮播开启时可编辑。
4. 蒙层：滑块 0–0.6（`updateConfig({ overlay })`），提示「增强壁纸上的文字可读性」。
5. 「清除壁纸」按钮（`clear`，二次确认）。

所有按钮/输入复用现有 `Button`/`Input`/组件与 token；loading/空态/错误三态齐全；空列表时给一句引导文案。

## 6. 约束与安全（必须满足）

- 渲染进程不直接访问 fs/net；URL 下载在主进程，仅 http/https、无凭证、超时、体积上限、魔数校验。
- 不引入 DESIGN 第 2 节「禁止引入」清单里的库；不新增依赖。
- 不改已执行迁移、不新建迁移；配置只走 `settings` 表。
- 不写占位实现（TODO/假数据/空函数）；无 `console.log` 残留；无硬编码密钥。
- 「移除/清除」只删应用自己管理的 `wallpapers/` 副本，绝不删用户原始文件。
- 壁纸层 `pointer-events: none`，不得遮挡任何交互。

## 7. 验证与 DoD

必须跑并在报告贴出结果：

- `pnpm typecheck`（0 error）、`pnpm lint`（0 error）、`pnpm build`（成功）。
- `pnpm dev` 启动 → CDP 截图（`Emulation.setDeviceMetricsOverride` 1360x860；截图前轮询确认 `#root` 已渲染且无 `#loading`）：
  - `temp/p6-wallpaper-url.png`：URL 加载一张壁纸后的外观页 + 全局背景
  - `temp/p6-wallpaper-dark.png`：加载一张暗色壁纸，标题栏/侧栏文字图标变浅
  - `temp/p6-wallpaper-light.png`：加载一张亮色壁纸，标题栏/侧栏文字图标保持深色
  - `temp/p6-wallpaper-carousel.png`：两张壁纸 + 轮播开启 + 短间隔，截取切换后状态
- 自测路径：三种来源各添加一次成功；重启应用后壁纸仍在且顺序正确；轮播按间隔切换；移除/清除后文件与配置都消失；`rg "TODO|FIXME|console\.log|placeholder" src/` 为空（不含既有合法处）。
- 报告列出改动文件清单（按目录分组一句话说明），并注明「原生标题栏按钮区与半透明标题栏的轻微色差」为 V1 已知项。
