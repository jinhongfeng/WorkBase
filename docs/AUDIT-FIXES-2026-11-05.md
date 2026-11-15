# 2026-11-05 审计修复交付

本轮仅处理派单中的五项。`docs/DESIGN.md`、迁移 `001`–`010` 与开工时的 SHA256 一致；未修改依赖、构建配置或本轮排除的 P2 功能。工作树开工前已有的修改均保留。

## 修复落点

1. **专注计时**：新增纯内存 Zustand store，保存 `endAt`、`pausedRemaining`、运行态和主题。常驻 `App` 的 effect 每秒以及窗口恢复焦点/可见性时按时间戳校准，页面卸载不销毁状态。完成记录有互斥保护，调用原 `focus.add` 后复位；首页原「开始专注」按钮在运行时显示倒计时。
2. **首页排序**：核实 `saveCards` 保存草稿数组、读取时按保存顺序过滤有效卡片、`orderedCards` 按数组重建，取消编辑不写设置；CSS 未使用 dense，也未发现改变视觉排列顺序的配置。本轮未改排序业务逻辑，仅清理误导性 dense 注释。界面操作验收的限制见下文。
3. **完整备份**：选择目标文件夹后创建带日期和秒数的独立备份目录，使用参数化 `VACUUM INTO ?` 生成 `workbench.db`。先复制旧附件，再复制当前 `files/` 覆盖同名文件，与实际附件读取优先级一致。返回目录路径和递归累计字节数；设置页说明备份范围、显示进行状态与完成路径、KB/MB/GB 体积。取消选择返回 `null`，失败清理本次创建的不完整目录并返回中文结构化错误。
4. **AI 生命周期**：新增 `011_ai.sql`，逐字采用设计中的三条 AI schema；仓储支持会话 CRUD 和消息追加，一轮 user/assistant 消息在事务中共同提交。主进程用 `requestId` 管理取消，校验请求归属，窗口销毁也会取消。超时覆盖响应头、错误响应体、SSE 和非流式 JSON 的整个读取过程，取消/超时统一 `AI_ABORTED`。增加 `maxTokens`（默认 4096）与请求字段 `max_tokens`。页面增加会话列表、新建、切换、重命名、删除和停止；内存 store 在切页期间保留进行中的请求，历史从数据库恢复。停止或失败的一轮不写入历史，问题保留在输入框便于重试。
5. **笔记保存保护**：保存返回成功与否，失败立即阻断打开其他笔记/新建；保留 dirty、表单和明确提示。保存串行化，使用请求快照和返回的 `updatedAt` 检查版本；保存期间的新输入不会被旧响应确认成已保存，也不会被列表摘要覆盖，并安排下一次自动保存。读取另一篇笔记期间出现新编辑，同样阻止覆盖。

## 本轮改动文件

### `src/main/`

- `ai/client.ts`：完整请求生命周期的超时/取消、SSE 收尾、maxTokens 配置和请求体。
- `db/migrations/011_ai.sql`：新增会话表、消息表及索引。
- `db/repo/ai.ts`：会话语义仓储和整轮消息事务。
- `ipc/ai.ts`：新增会话 CRUD、消息读取、按 requestId 停止，统一参数校验及会话仓储错误。
- `ipc/assets.ts`：备份从单 DB 保存对话框改为目录选择，调用完整备份服务。
- `services/backup.ts`：数据库快照、当前/旧附件合并、时间戳目录、体积统计和失败清理。

### `src/shared/` 与 `src/preload/`

- `src/shared/types.ts`：会话/消息/备份结果类型、threadId、maxTokens 与 API 定义。
- `src/shared/ipc-contract.ts`：新增 AI 通道与签名，备份返回改为 `{ path, size } | null`。
- `src/preload/index.ts`：白名单暴露会话管理和停止接口；备份返回随共享 API 类型同步。

### `src/renderer/src/`

- `App.tsx`：通过组件 effect 注册和清理常驻计时驱动。
- `stores/focus.ts`：全局专注状态及时间戳计时、暂停、继续、完成互斥。
- `stores/ai.ts`：会话状态、历史恢复、流式订阅、停止及错误恢复。
- `features/focus/module.tsx`：改用全局计时状态，保留原统计和页面操作。
- `features/dashboard/module.tsx`：首页原专注入口显示剩余时间。
- `features/dashboard/dashboard.css`：纠正 dense 注释，未改布局规则。
- `features/ai/module.tsx`：会话列表、重命名/删除对话框和停止按钮。
- `features/ai/assistant.css`：为会话列表提供必要的布局和选中态，使用现有 token。
- `features/settings/SettingsPage.tsx`：maxTokens 输入，以及完整备份范围、状态、路径和体积反馈。
- `features/notes/module.tsx`：保存失败阻断、请求快照/版本保护、串行保存和读取竞态保护。

### `docs/`

- `AUDIT-FIXES-2026-11-05.md`：本报告。

## 验证命令与结果

终端未将 pnpm 加入 PATH，且 PowerShell 禁止执行 `.ps1`；使用项目已有的 `temp/bin/pnpm.cmd`，未改变系统执行策略或安装依赖。

| 命令 | 结果 |
| --- | --- |
| `temp\bin\pnpm.cmd typecheck` | 退出码 0，双端 TypeScript 检查通过，0 error |
| `temp\bin\pnpm.cmd lint` | 退出码 0，0 error；保留既有 ESLint 配置 module type 警告 |
| `temp\bin\pnpm.cmd build` | 退出码 0，main/preload/renderer 均成功；保留依赖的 `use client` 指令警告 |
| `git diff --check` | 退出码 0；既有 LF/CRLF 提示未通过改配置消除 |
| DESIGN 与旧迁移 SHA256 对照 | 全部与开工记录一致 |
| 本轮新增核心文件占位/调试输出扫描 | 未发现 TODO、FIXME 或 console.log |

日志保存在 `temp/audit-fixes/{typecheck,lint,build}.log`。复验脚本和结果保留在同目录。收尾时，自动审批以 `blocked by policy` 拒绝清理本轮创建的临时测试目录，没有提供更具体原因；操作未执行，测试数据、浏览器缓存和尝试脚本仍留在 `temp/audit-fixes/`，没有绕过拒绝继续删除。

## 针对性代码级验证

运行 `node temp/audit-fixes/code-check.cjs`，配合隔离 Electron 主进程中的生产处理器、真实 SQLite/附件文件，以及本机可控 HTTP 服务。测试桥接传输不等于原生 preload/IPC 的端到端验收。

- 专注 store：验证跨调用保留同一实例、时间戳差值、暂停不扣时、继续重建结束时间、时间跳变后只完成一次并复位。
- 会话处理器：创建、列表、重命名、删除、消息读取、非法 ID/空名称校验通过；`011` 实际执行成功。
- AI store/client：SSE 完成、`[DONE]` 收尾、`max_tokens=321` 请求字段、整轮消息落库和重新加载历史通过。
- AI 停止：收到流片段后取消成功，订阅清理、运行态复位、未完成一轮不落库、输入可重试均通过。
- AI 超时：测试中缩短定时器以验证响应头前、SSE 响应体和非流式 JSON 响应体挂起，均返回 `AI_ABORTED`；生产超时仍为 120 秒。
- 备份：实际导出含图片笔记、媒体和 Skill 的数据，验证旧附件补入、同名当前附件优先、完整目录及总字节数一致。本次测试备份为 **287205 字节**。
- 笔记：以最小 React hook 宿主执行生产 `NotesPage` 回调；真实 `PRAGMA query_only` 触发 SQLite 写入失败，打开/新建被阻断，dirty 和内容保留。延迟保存结果期间继续输入，旧响应不会清除 dirty，下一次保存写入最新正文；正常保存及打开正常。该项没有声称经过真实 DOM 操作。

再启动独立 Electron 进程执行 `restart-restore.cjs`：

- 重新打开原测试数据库，验证保存的卡片顺序、AI 会话/消息及笔记最新内容留存。
- 将备份整体复制为另一数据目录，重新通过生产数据库入口打开；SQLite `quick_check=ok`、`foreign_key_check=[]`，图片笔记、媒体、Skill、AI 历史和附件总字节数符合备份。

## 已知问题与未完成验收

- 当前受限运行环境中，Electron 与备用 Chrome 测试实例的页面加载均未完成，CDP 页面命令超时。主进程和数据库可运行，但**未完成原生窗口中的跨页/命令面板操作、方向键/拖拽排序、混合尺寸视觉顺序、设置页备份反馈及两档窗口视觉验收**。排序仅确认源码路径与设置的跨进程留存，不将其描述为完整界面验收通过。
- 目录选择器在测试中注入隔离目标路径，未手工操作 Windows 原生文件夹选择器。
- 没有配置或调用真实 AI 服务；流式、停止和超时均为本机服务的代码级验证。
- 本轮临时测试数据的清理被自动审批拒绝，目录仍保留；具体返回信息见上文。
- 未实现派单明确排除的抽屉、AI 上下文动作、P2 功能及视觉收敛；未生成安装包或执行发布验收。

未发现上述代码级检查中的剩余失败；上述原生界面验收边界仍需在可正常加载渲染进程的环境复验。
