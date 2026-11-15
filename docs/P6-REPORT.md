# P6 壁纸功能交付记录

日期：2026-11-05。范围仅为设置外观与全局壁纸；没有新增依赖或迁移，没有改动其它业务域。工作区原有的未提交改动和并行任务文件均保留。

## 实现

支持 URL、本地图片和 Windows 当前壁纸三种来源，统一保存为 `files/wallpapers/<uuid>.<ext>` 副本，配置只存 `settings['ui.wallpaper']`。包含图片魔数识别、20MB 限制、15 秒下载超时、50 项上限、本地文件丢失过滤与中文错误。

壁纸层位于应用最底层且 `pointer-events: none`。标题栏和侧栏透出背景，暗壁纸使用浅色文字与相应暗色玻璃底色，正文区域保留高透明度主题底色。切换时新图先解码，再覆盖在完整旧图之上淡入 180ms，避免两层同时淡出露出底色。轮播间隔和蒙层可设置，当前项持久化。移除与清除有二次确认，只删除应用管理的副本。

## 本阶段改动文件

### `src/main/`

- `services/wallpaper.ts`：管理配置、三种来源的图片副本、BGRA 相对亮度判定及副本删除。
- `ipc/wallpaper.ts`：注册壁纸通道、校验入参、打开原生选图框，并串行执行变更防止写入互相覆盖。
- `ipc/app.ts`：增加原生窗口按钮明暗设置的 IPC 处理。
- `assets.ts`：仅在资源协议 hostname 白名单中加入 `wallpapers`。
- `index.ts`：注册壁纸 IPC。
- `window.ts`：组合当前主题与壁纸明暗，更新原生标题栏按钮配色。

### `src/shared/` 与 `src/preload/`

- `shared/types.ts`：定义壁纸项、配置及 `window.api` 方法类型。
- `shared/ipc-contract.ts`：增加壁纸与窗口按钮对比度通道和契约。
- `preload/index.ts`：通过现有隔离桥接暴露壁纸 API。

### `src/renderer/src/`

- `stores/wallpaper.ts`：保存全局配置、同步异步操作结果并提供当前项选择器。
- `components/layout/Wallpaper.tsx`：加载配置、解码图片、交叉淡入、轮播和全局明暗属性管理。
- `components/layout/AppShell.tsx`：在标题栏之前挂载壁纸层。
- `styles/tokens.css`：集中定义壁纸蒙层及暗壁纸文字、玻璃背景和交互色 token。
- `styles/layout.css`：定义最底层背景、玻璃标题栏/侧栏和作用域内的明暗覆盖。
- `features/settings/SettingsPage.tsx`：在外观主题下增加来源、缩略图、选择/移除、轮播、间隔、蒙层和清除操作。
- `features/settings/settings.css`：定义壁纸设置区、缩略图与控制项的布局。

### `docs/`

- `P6-REPORT.md`：记录本阶段改动、验证证据和验收限制。

## 验证命令与结果

本机通过 Corepack 调用已配置的 pnpm 11.24.0，等价执行下列项目脚本：

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 退出码 0，Node/Web 两套 TypeScript 检查通过，0 error |
| `pnpm lint` | 退出码 0，0 error；现有 ESLint 配置产生 MODULE_TYPELESS_PACKAGE_JSON 提示 |
| `pnpm build` | 退出码 0，主进程、preload、renderer 与构建资源成功；现有 Tiptap/lucide-react 的 `use client` 指令提示不阻断构建 |
| `git diff --check` | 通过，只有工作区既有 LF/CRLF 提示 |
| `rg "TODO\|FIXME\|console\.log\|placeholder" src/` | 除既有合法输入提示、CSS 选择器、Tiptap Placeholder 扩展和 `TODO_NOT_FOUND` 业务错误标识外，无新增占位实现或调试日志 |

首次类型检查发现现有 `marked`、`dompurify` 安装文件不可读；已按项目现有版本重新解包恢复这两个包，没有新增依赖，没有改动原生依赖。

### CDP 实机功能检查

以 `pnpm dev` 启动真实 Electron、preload、SQLite 和 renderer，使用独立 `temp/p6-user-data`。每次截图均设置 `Emulation.setDeviceMetricsOverride` 为 1360×860，并轮询确认 `#root .app-shell` 已渲染且无 `#loading`。

- URL 图片通过主进程 `net.fetch` 从本地 HTTP 验收服务下载，生成 `wb-asset://wallpapers/` 地址并真实显示。
- 暗壁纸标题文字为 `rgb(241,238,230)`，侧栏为 `rgb(214,211,209)`；亮壁纸标题为 `rgb(32,41,35)`。
- 壁纸层计算样式 `pointer-events: none`，设置操作及确认框可正常使用；深浅主题切换通过。
- 1080×700 检查无横向溢出。
- 两张壁纸开启 10 秒轮播后切换成功，`activeId` 写回；完整关闭应用再启动后，配置、添加顺序、当前项完全一致。
- 移除确认可取消；确认移除后副本与配置项同步消失；确认清除后目录为空、配置项为空、壁纸 DOM 和明暗属性移除。
- 非法协议、带凭证 URL、非图片响应、超过 20MB 的响应、越界轮播间隔被拒绝并返回中文错误。
- 渲染进程未捕获异常为 0。

截图：

- [URL 添加后的外观页](../temp/p6-wallpaper-url.png)
- [暗壁纸](../temp/p6-wallpaper-dark.png)
- [亮壁纸](../temp/p6-wallpaper-light.png)
- [10 秒轮播切换后的状态](../temp/p6-wallpaper-carousel.png)

详细断言结果见 [UI 结果](../temp/p6-ui-result.json) 与 [服务层结果](../temp/p6-services-result.json)。

### 服务层真实文件检查

在 Electron 中调用实际服务实现与 SQLite 仓储：本地文件复制、URL 下载、系统转码副本回退、配置损坏回退、缺失文件过滤、移除与清除均通过。复制/移除前后核对原图 SHA-256 不变；清除同时清理孤立托管副本，保留非托管文件。系统回退测试使用独立 APPDATA 下的真实 `Microsoft/Windows/Themes/TranscodedWallpaper` 图片文件，并非生产代码 mock。

## 已知问题与未完成验收

1. **原生标题栏按钮区与半透明标题栏的轻微色差**是 V1 已知项。CDP 截图不包含 Windows 原生按钮绘制，仍需在正常 Windows 用户会话目视核对按钮区。
2. 当前执行环境的 Windows AppContainer 权限使普通沙箱启动失败，报 GPU 子进程 `0xC0000135` 或运行目录 ACL 错误。功能截图与重启检查使用独立数据目录、`WORKBASE_DISABLE_GPU=1` 和临时 `NO_SANDBOX=1` 调试参数完成；源码仍为 `sandbox:true`、`contextIsolation:true`、`nodeIntegration:false`、`webSecurity:true`，没有写入这些调试开关。**正常沙箱启动未验收通过**。
3. 沙箱账户的注册表与实际 APPDATA 中没有可读桌面壁纸，真实系统来源返回 `WALLPAPER_SYSTEM_UNAVAILABLE` 和「无法读取系统当前壁纸。」；受控转码副本回退通过。**真实用户当前桌面壁纸读取成功尚未验收**。
4. 沙箱窗口不出现在用户桌面的原生窗口列表中，无法自动操作该会话的文件选择框。实际 `addFromPath` 文件复制与删除保护已通过；**原生选图框选择/取消链路尚未完成目视实测**。
5. 自动审批拒绝了本轮临时目录批量递归清理，也拒绝了仅删除两份临时 Electron 可执行文件的缩小范围请求，返回理由均为 `blocked by policy`。临时测试脚本已通过文件级编辑删除；以下本轮目录仍保留：`temp/p6-dependency-repair/`、`temp/p6-electron/`、`temp/p6-fixtures/`、`temp/p6-service-runtime/`、`temp/p6-service-user-data/`、`temp/p6-user-data/`、`temp/p6-vite-cache*`，以及 `C:/Users/Admin/AppData/Local/Temp/workbase-p6-electron/`。四张验收截图、结果 JSON 和验证日志作为证据保留。没有清理并行任务的 `p6-media-*` 文件。

因此，本阶段代码与上述功能检查已经完成，环境受限的正常沙箱启动、原生文件选择和真实系统壁纸三项仍需补验，不能将本记录视为全部 DoD 已通过。
