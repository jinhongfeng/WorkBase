# P0 实施与验收记录

日期：2026-11-04。状态：实现已落盘，验收尚未完成，不能标记 P0 通过。
只做 P0；没有实现笔记、待办、邮件、账单、AI 业务，没有增加 002 及之后的迁移。
AGENTS.md、DESIGN.md、CODEX-PLAN.md 和 .gitignore 均未修改。

## 文件变更

### 根目录与构建

- `package.json`：依赖、Corepack/pnpm 版本、dev/build/typecheck/lint/dist 和原生重建脚本。
- `pnpm-lock.yaml`：实际解析版本锁定。
- `pnpm-workspace.yaml`：hoisted 安装、项目内缓存和依赖构建脚本白名单。
- `.npmrc`：与项目缓存一致的安装设置。
- `electron.vite.config.ts`：main/preload/renderer 构建、external、别名和 Tailwind 插件。
- `electron-builder.yml`：NSIS/portable、x64、asar、原生绑定解包、迁移文件和本地 Electron 运行时。
- `tsconfig.json`：双端类型配置入口。
- `tsconfig.node.json`：主进程与 preload 的 strict 类型配置。
- `tsconfig.web.json`：React 渲染端的 strict 类型配置。
- `eslint.config.js`：ESLint 9 flat config 与 TypeScript 最小规则。
- `scripts/build-assets.mjs`：把原始 token 复制到生产输出，供主进程读取标题栏颜色。
- `resources/icon.ico`：指定 Python + 临时 Pillow 环境生成的多尺寸 W 图标。

### 主进程与共享层

- `src/main/index.ts`：单实例、AppUserModelId、菜单、外链拦截、启动及退出流程。
- `src/main/window.ts`：安全窗口、标题栏 token、ready-to-show 和窗口状态持久化。
- `src/main/log.ts`：主进程日志与 2MB 轮转。
- `src/main/db/index.ts`：SQLite 单例、WAL、外键、按 user_version 顺序事务迁移。
- `src/main/db/migrations/001_init.sql`：逐字复制 DESIGN 的 001 SQL，四张逻辑表。
- `src/main/db/repo/settings.ts`：设置读取与事务写入。
- `src/main/ipc/app.ts`：getPaths/getVersion 通道。
- `src/main/ipc/settings.ts`：getAll/set/setPinnedModules 通道，不截断存储中的 pin 数组。
- `src/main/ipc/validation.ts`：IPC 参数验证与参数错误信息。
- `src/preload/index.ts`：仅暴露 app/settings 白名单，导出共享类型。
- `src/shared/types.ts`：API、设置和路径类型。
- `src/shared/ipc-contract.ts`：通道常量及对应参数/返回类型。

### 渲染入口、模块与状态

- `src/renderer/index.html`：离线页面入口、CSP 和中文语言标记。
- `src/renderer/src/main.tsx`：主题、Toast 和 React 启动。
- `src/renderer/src/App.tsx`：应用外壳与错误边界。
- `src/renderer/src/env.d.ts`：window.api/window.toast 类型。
- `src/renderer/src/router.tsx`：由 registry 生成 Route 的轻量 hash 路由，支持同步组件与 Promise 页面。
- `src/renderer/src/modules/defineModule.ts`：模块契约及四项默认值。
- `src/renderer/src/modules/registry.ts`：字面量 eager glob 自动发现、过滤与排序，没有模块 id 数组。
- `src/renderer/src/modules/groups.ts`：分组顺序，新分组排末尾。
- `src/renderer/src/stores/navigation.ts`：加载设置、pin 存储、显示过滤、六项上限与浮层状态。
- `src/renderer/src/stores/theme.ts`：系统/浅色/深色主题及 localStorage 持久化。
- `src/renderer/src/features/dashboard/module.tsx`：首页注册与首页组件，包括常用编辑/拖拽、快速暂存和三个说明区。
- `src/renderer/src/features/notes/module.tsx`：笔记注册与说明页。
- `src/renderer/src/features/todos/module.tsx`：待办注册与说明页。
- `src/renderer/src/features/mail/module.tsx`：邮件注册与说明页。
- `src/renderer/src/features/bills/module.tsx`：账单注册与说明页。
- `src/renderer/src/features/sources/module.tsx`：数据源注册与说明页。
- `src/renderer/src/features/ai/module.tsx`：智能助手注册与说明页。
- `src/renderer/src/features/demo/module.tsx`：单文件自动发现演示页。

### 布局、UI 与样式

- `components/layout/TitleBar.tsx`：40px 拖拽标题栏和 no-drag 搜索入口。
- `components/layout/AppShell.tsx`：三段式外壳、列表面板开关、数字快捷键和 Esc/Ctrl+K。
- `components/layout/Sidebar.tsx`：注册表驱动的首页、常用、更多、AI 与设置。
- `components/layout/MorePanel.tsx`：320px 分组搜索、图钉、满额提示、遮罩和键盘焦点约束。
- `components/layout/CommandPanel.tsx`：只搜索 registry，支持方向键与回车。
- `components/layout/SettingsPage.tsx`：外观、本地数据库位置和版本信息。
- `components/ui/Button.tsx`：四种按钮和 loading。
- `components/ui/Input.tsx`：token 输入框。
- `components/ui/Textarea.tsx`：多行输入。
- `components/ui/Select.tsx`：原生下拉选择。
- `components/ui/Dialog.tsx`：原生模态及确认型对话框。
- `components/ui/Toast.tsx`：命令式 success/error 提示。
- `components/ui/EmptyState.tsx`：图标、标题、说明及操作区。
- `components/ui/Spinner.tsx`：加载状态。
- `components/ui/Tooltip.tsx`：hover/focus 提示。
- `components/ui/ScrollArea.tsx`：单一可滚动区域。
- `components/ui/ErrorBoundary.tsx`：页面异常恢复入口。
- `styles/tokens.css`：完整浅/深主题变量、离线字体栈、阴影和圆角。
- `index.css`：布局、组件、交互状态和减少动效支持。

以上 components/styles 路径均相对于 `src/renderer/src/`。

### 文档

- `docs/STACK.md`：从 node_modules 读取的实际版本与本机构建说明。
- `docs/ADDING-A-MODULE.md`：30 行以内的最小模块示例及三步接入说明。
- `docs/PRODUCT.md`：从既有 DESIGN 提取的产品上下文，不替代设计规范。
- `docs/P0-REPORT.md`：本次改动、验证证据和未通过项。
- `temp/blocker.md`：保留原已解决记录，追加本次环境阻塞。

## 验证结果

本机 PATH 没有 pnpm，以下命令通过 `corepack pnpm` 执行，使用 pnpm 11.24.0。

| 命令/检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0，双端 tsc，0 error |
| `pnpm lint` | exit 0，0 error |
| `pnpm build` | exit 0，main 10、preload 3、renderer 2907 modules transformed |
| `electron-builder install-app-deps` | 成功，better-sqlite3 x64 重建完成 |
| Electron Node 运行时执行 `temp/p0-native-check.cjs write/read` | 两个独立进程均 exit 0，真实原生绑定可加载，四个 pin 跨进程读回 |
| SQLite 检查 | user_version=1，journal_mode=wal，foreign_keys=1；notes/todos 均 0 行 |
| 001 原文比对 | 与 DESIGN 001 SQL 块逐字相同 |
| 布局目录模块 id 检索 | 无 notes/todos/mail/bills/sources 字面量 |
| TODO/FIXME/console.log 检索 | src 无匹配 |
| .gitignore 差异 | 无 |
| `pnpm dist` | exit 1；安装包已生成，最后删除临时 uninstaller 时被平台保护拦截 |
| `electron-builder --prepackaged dist/win-unpacked --win portable --x64` | exit 1；便携包已生成，最后删除临时 7z 时被同一保护拦截 |

构建摘要：main 7.28kB，preload 0.71kB，renderer CSS 19.57kB / JS 717.25kB。
Lucide 的 `use client` 指令有打包警告，不影响上述构建成功。

已生成但尚未做安装/正常桌面启动验收的产物：

- `dist/WorkBase-Setup-0.1.0.exe`：138,569,016 bytes。
- `dist/WorkBase-Portable-0.1.0.exe`：138,343,668 bytes。
- `dist/win-unpacked/WorkBase.exe`：解包目录中的程序。
- `app.asar.unpacked` 中包含 better-sqlite3 的真实 `.node` 文件，迁移位于 resources/migrations。

## 已知问题与未完成项

1. 受限执行环境中的 Electron 图形子进程退出 `-1073741515`，随后 `GPU process isn't usable`；已补全下载运行时目录的沙箱读取权限，但图形进程仍退出。未关闭 sandbox/contextIsolation/webSecurity，也未使用 mock。
2. CDP 能短暂发现页面，但在页面渲染前连接关闭。因此没有生成要求的五张截图，也没有借用 temp 内已有旧图代替。1360×860、1080×700、更多面板和深色视觉验收尚未完成。
3. 4 pin 重启、空 pin、7 pin 的完整 UI 自测未完成；目前仅确认数据库四 pin 跨进程读写。单文件 demo2 的增加/删除、更多/命令面板入口及残留 pin 过滤实测尚未完成。`features/demo2` 不存在。
4. computer-use 尝试选择文件资源管理器被工具拒绝，原文：`Computer Use was not approved to use Windows Software Development Kit`。没有通过其他界面绕过此拒绝。
5. 打包最后清理触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（本轮累计 50 次删除阈值）；dist 命令不是成功状态。原始日志保留在 temp，不能将生成 exe 等同于完整打包验收通过。
6. 自动打包临时文件及一部分构建临时文件因上述删除保护仍保留；根目录的 Vite 临时配置已移动至 temp，未混入 src。构建缓存、图标环境和复验脚本也保留在 temp 供续验。
7. 未签名，未实测安装目录变更和安装后启动。未开展 P1–P5。

## 待恢复环境后执行的验收步骤

在能正常启动 Electron 图形进程的桌面会话运行 `pnpm dev`；或执行 `node temp/p0-selftest.mjs`。
脚本使用独立的 `temp/p0-user-data`，访问 `http://127.0.0.1:9222/json`，轮询侧栏和卡片渲染，调用 Emulation.setDeviceMetricsOverride/Page.captureScreenshot；包含 pin 重启/空值/上限和 demo2 添加/移除步骤。
要求生成的文件是 `temp/p0-dashboard.png`、`temp/p0-more-panel.png`、`temp/p0-1080x700.png`、`temp/p0-module-added.png`、`temp/p0-module-removed.png`。
此脚本尚未完成一次成功运行，恢复后需审看截图并修复实际暴露的问题，不能直接宣布验收通过。
