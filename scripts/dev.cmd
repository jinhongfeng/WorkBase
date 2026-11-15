@echo off
rem WorkBase 开发模式启动器：桌面快捷方式指向本文件。
rem 关闭本控制台窗口会一并退出应用；开发版与安装版共用同一份数据，不能同时开。
cd /d "%~dp0.."
call pnpm dev
