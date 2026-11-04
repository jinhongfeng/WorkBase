# 实际技术栈

2026-11-04 使用 pnpm 安装并由本机 node_modules 读取。

| 包 | 实际版本 |
|---|---|
| electron | 45.2.1 |
| react | 19.3.1 |
| react-dom | 19.3.1 |
| better-sqlite3 | 13.0.3 |
| electron-vite | 6.0.0 |
| electron-builder | 26.18.0 |
| vite | 8.3.5 |
| typescript | 5.9.3 |
| tailwindcss | 4.3.4 |
| eslint | 9.39.5 |
| pnpm | 11.24.0 |

Electron 内置 Node 24.22.1，NODE_MODULE_VERSION 150；better-sqlite3 内置 SQLite 3.53.4。
已执行 electron-builder install-app-deps，并在 Electron 的 Node 运行时加载真实原生绑定验证通过。

本机 PATH 无 pnpm，使用 Corepack 的 pnpm 11.24.0（命令前缀 corepack pnpm）。
原生重建时将 USERPROFILE 临时指向项目 temp/build-user，避免向不可写的默认缓存目录写入。
Electron 二进制通过 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ 下载。
postinstall 先执行 install-electron，再执行 electron-builder install-app-deps，确保全新安装后可直接打包。
Pillow 13.0.0 仅装在 temp/icon-venv，用于生成 resources/icon.ico，未安装到全局 Python。

构建与打包的临时缓存放在 temp/。打包直接使用 node_modules/electron/dist 的已下载运行时。
无业务表迁移、无后续阶段依赖。
