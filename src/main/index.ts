import { app, BrowserWindow, Menu, shell, dialog, protocol } from 'electron'
import { createWindow } from './window'
import { setupTray, showMainWindow } from './tray'
import { getDatabase, closeDatabase } from './db'
import { registerAppIPC } from './ipc/app'
import { registerBillsIPC } from './ipc/bills'
import { registerSettingsIPC } from './ipc/settings'
import { registerNotesIPC } from './ipc/notes'
import { registerLibraryFoldersIPC } from './ipc/library-folders'
import { registerMemoriesIPC } from './ipc/memories'
import { registerVaultIPC } from './ipc/vault'
import { registerTodosIPC } from './ipc/todos'
import { registerIeltsIPC } from './ipc/ielts'
import { registerEnglishArticlesIPC } from './ipc/english-articles'
import { registerDailyBriefIPC } from './ipc/daily-briefs'
import { registerPluginIPC } from './ipc/plugins'
import { registerGrowthIPC } from './ipc/growth'
import { registerAiIPC } from './ipc/ai'
import { registerArticleReferenceIPC } from './ipc/article-references'
import { registerAssetIPC } from './ipc/assets'
import { registerWallpaperIPC } from './ipc/wallpaper'
import { enginePreview } from './services/wallpaper-engine'
import { registerStorageIPC } from './ipc/storage'
import { registerSkillsIPC } from './ipc/skills'
import { registerMediaIPC } from './ipc/media'
import { backfillMediaFingerprints } from './media-dedupe'
import { ASSET_SCHEME, resolveAssetPath, serveAssetFile } from './assets'
import { logMain } from './log'
import { registerQuitCoordinator } from './quit'
import { PLUGIN_SCHEME } from '@shared/plugins'

protocol.registerSchemesAsPrivileged([{
  scheme: ASSET_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}, {
  scheme: PLUGIN_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}])

if (process.env.WORKBASE_USER_DATA) app.setPath('userData', process.env.WORKBASE_USER_DATA)
// 无 GPU 的虚拟机/远程桌面下可用该开关规避 GPU 进程崩溃（仅调试与验收使用）。
if (process.env.WORKBASE_DISABLE_GPU) app.disableHardwareAcceleration()
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '9222')
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) showMainWindow(window)
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) { event.preventDefault(); if (/^https?:\/\//i.test(url)) void shell.openExternal(url) }
    })
    contents.on('will-frame-navigate', event => {
      if (event.isMainFrame) return
      const target = new URL(event.url)
      const source = event.initiator?.url ?? event.frame?.url
      if (target.protocol !== `${PLUGIN_SCHEME}:` || (source?.startsWith(`${PLUGIN_SCHEME}://`) && target.host !== new URL(source).host)) {
        event.preventDefault()
      }
    })
  })
  void app.whenReady().then(() => {
    app.setAppUserModelId('com.workbase.app')
    Menu.setApplicationMenu(null)
    getDatabase()

    protocol.handle(ASSET_SCHEME, async request => {
      const url = new URL(request.url)
      const file = url.hostname === 'wallpaper-engine' && /^\/[a-f0-9]{64}$/.test(url.pathname)
        ? await enginePreview(url.pathname.slice(1)) : resolveAssetPath(url.hostname, url.pathname)
      if (!file) return new Response('Not found', { status: 404 })
      // 显式转发 Range，视频封面才能 seek；net.fetch(file://) 会吞掉 Range 头。
      return serveAssetFile(file, request.headers.get('range'))
    })

    registerAppIPC(); registerSettingsIPC(); registerNotesIPC(); registerTodosIPC()
    registerLibraryFoldersIPC()
    registerIeltsIPC(); registerEnglishArticlesIPC(); registerGrowthIPC(); registerAiIPC(); registerAssetIPC(); registerStorageIPC()
    registerArticleReferenceIPC()
    registerWallpaperIPC(); registerBillsIPC(); registerSkillsIPC()
    registerMediaIPC(); registerMemoriesIPC(); registerVaultIPC()
    registerDailyBriefIPC()
    registerPluginIPC()
    registerQuitCoordinator()
    setupTray(createWindow())
    void backfillMediaFingerprints()
      .catch(error => logMain(`Media fingerprint backfill failed: ${error instanceof Error ? error.message : String(error)}`))
    logMain('Application ready; local database opened')
    app.on('activate', () => {
      const window = BrowserWindow.getAllWindows()[0]
      if (window) showMainWindow(window)
      else setupTray(createWindow())
    })
  }).catch((error: unknown) => {
    logMain(`Startup failed: ${error instanceof Error ? error.message : String(error)}`)
    dialog.showErrorBox('WorkBase 启动失败', '无法初始化本地工作台，请检查数据目录与原生依赖。详细原因已写入 main.log。')
    app.exit(1)
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', closeDatabase)
}
