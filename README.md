# WorkBase

WorkBase 是 Windows x64 个人工作台。笔记、日记、待办和学习记录保存在本机 SQLite 数据库，附件与媒体保存在同一数据目录。配置的 AI 接口、QQ 邮箱账单获取以及用户添加的媒体或壁纸链接需要网络。

## 功能

| 模块 | 说明 |
| --- | --- |
| 首页 | 可调整常用入口和首页卡片，查看待办、日记、月历、年度活动和统计 |
| 笔记 | Tiptap 富文本编辑，按 Markdown 保存，支持图片、大纲、自动保存、置顶、关键词搜索和按日期记录日记 |
| 雅思学习 | 按主题调用 AI 生成单词/句型卡，间隔复习（认识/不认识），发音朗读，掌握度与连续天数统计 |
| 待办 | 优先级、截止日期、逾期提示、分组展示、一键清理已完成 |
| 专注 | 25/45/60 分钟番茄钟，完成自动入库，最近 7 天趋势 |
| 习惯 | 14 天打卡网格、连续天数、常用图标 |
| 智能助手 | OpenAI 兼容接口，流式输出，可把整轮对话存为笔记 |
| 支付宝账单 | 导入支付宝 CSV 或 ZIP，也可通过 QQ 邮箱授权码获取附件，自动去重并统计收支 |
| Skill 库 | 从 ZIP、目录或 Markdown 导入，支持搜索、置顶、编辑和设置封面 |
| 媒体库 | 保存并预览本地文件或链接中的图片和视频 |
| 设置 | AI 接口、主题、壁纸、数据位置与完整备份 |

## 技术栈

- Electron 45 + electron-vite 6（主进程 CJS，渲染层 React 19）
- TypeScript 严格模式、Zod 校验所有 IPC 入参
- better-sqlite3（WAL）+ 顺序 SQL 迁移
- Tiptap 3（富文本）、marked + DOMPurify（渲染）、turndown（回写 Markdown）
- 原生 CSS 设计令牌，无 UI 框架依赖

## 开发

使用 Node.js 24 和项目锁定的 pnpm 版本。渲染层依赖在构建时合并到前端资源中，安装包仅携带主进程运行所需的依赖。

```bash
pnpm install
pnpm dev          # 开发模式
pnpm typecheck    # 主进程 + 渲染层类型检查
pnpm lint
pnpm build        # 产出 dist/
pnpm dist         # 在 release/ 生成 NSIS 安装包与免安装版
```

> Windows 下若在无 GPU 的虚拟机/远程桌面运行崩溃，可设置 `WORKBASE_DISABLE_GPU=1` 启动。

## 网站密码库

1. 从 WorkBase 侧栏或首页「常用」打开「密码库」，设置主密码，再点击「连接浏览器」打开扩展文件夹。也可在「更多 → 工具」找到密码库。
2. 在 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions` 打开「开发者模式」，点击「加载解压缩的扩展」，选择刚打开的文件夹。
3. 打开 HTTPS 网站登录页，点击 WorkBase 扩展的「允许此网站」。登录后，看到网页提示或「存」角标时打开扩展并确认保存。下次登录时在扩展中选择账号，或在 WorkBase 为该网站的单个账号开启自动填充。

更新已加载的扩展后，在扩展管理页点击 WorkBase 的「重新加载」，再刷新登录页。

WorkBase 收起到托盘后仍可使用扩展。密码库锁定后需要回到 WorkBase 解锁。当前覆盖常见的同源 HTTPS 登录表单，Windows 应用填充、跨域登录框和多步登录暂未接入。

## 数据位置

```
%APPDATA%\WorkBase\data\workbench.db      # SQLite 主库
%APPDATA%\WorkBase\data\files\            # 图片附件、媒体、壁纸和 Skill 包
```

可在「设置 → 数据与备份」打开数据目录、迁移数据或导出备份。备份目录包含 `workbench.db` 和 `files/`。QQ 邮箱授权码与 AI 密钥使用 Windows DPAPI 加密，迁移到其他 Windows 用户时需要重新配置。

## 新增一个功能

在 `src/renderer/src/features/<id>/module.tsx` 新建一个文件并默认导出 `defineModule({...})`，侧栏、更多面板、首页常用、命令面板、快捷键与路由会自动派生出新入口，无需修改任何布局文件。

```tsx
export default defineModule({
  id: 'water',
  name: '喝水记录',
  icon: Droplets,
  group: '记录',
  order: 70,
  summary: async () => '今天 3 杯',
  page: WaterPage
})
```

需要读写数据库时，再补 `db/migrations`、`db/repo` 与 `ipc` 三处；渲染层被 `sandbox: true` 与 `contextIsolation` 隔离，不允许直接访问文件系统。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl F` | 快速跳转（功能 + 笔记搜索） |
| `Ctrl J` | 打开笔记 |
| `Ctrl 1` – `Ctrl 7` | 首页 / 常用功能 |
| `Ctrl 8` | 智能助手 |
| `Ctrl S` | 保存当前笔记 |
| `Esc` | 关闭浮层 |

## 常见问题

- QQ 邮箱获取账单使用开启 IMAP 后生成的授权码。加密 ZIP 还需要本次支付宝账单的解压密码。
- 从支付宝导出的原始 CSV 或 ZIP 可直接在账单页导入，统计只计入「交易成功」的记录。
- 使用 AI 功能前，在设置里填写 OpenAI 兼容接口地址和模型名称，并测试连通性。
- 开发环境出现 SQLite 原生模块版本不匹配时，执行 `pnpm exec electron-rebuild -f -w better-sqlite3`。

通用邮件和数据源仍处于内部开发阶段，当前可用的邮箱功能位于「支付宝账单」。
