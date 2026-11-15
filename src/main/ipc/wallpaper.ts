import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { WALLPAPER_FITS } from '@shared/types'
import * as wallpaper from '../services/wallpaper'
import { engineEntry, engineAsset, listEngineWallpapers, rememberEngineDirectory } from '../services/wallpaper-engine'
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../assets'
import { AppError, fail } from './errors'
import { noArgs, validate } from './validation'

const scopeArg = z.enum(['workspace', 'immersive']).default('workspace')
const updateArg = z.object({
  carousel: z.boolean().optional(),
  interval: z.number().int().min(10).max(86400).optional(),
  overlay: z.number().min(0).max(0.6).optional(),
  fit: z.enum(WALLPAPER_FITS).optional(),
  mode: z.enum(['solid', 'workspace', 'custom']).optional(),
  clear: z.boolean().optional()
})

// 下载、对话框与配置写入按请求顺序执行，避免轮播和删除互相覆盖。
let pending: Promise<unknown> = Promise.resolve()
function serial<T>(action: () => T | Promise<T>): Promise<T> {
  const result = pending.then(action).catch((error: unknown) => {
    if (error instanceof AppError) throw error
    fail('WALLPAPER_OPERATION_FAILED', '壁纸操作失败，请检查图片文件和数据目录是否可读写。')
  })
  pending = result.catch(() => undefined)
  return result
}

export function registerWallpaperIPC(): void {
  ipcMain.handle(channels.wallpaperEngineList, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return serial(listEngineWallpapers)
  })
  ipcMain.handle(channels.wallpaperEngineChooseDirectory, (event, ...args: unknown[]) => {
    validate(noArgs, args)
    return serial(async () => {
      const options = { title: '选择 Wallpaper Engine 安装目录或壁纸库', properties: ['openDirectory'] as ['openDirectory'] }
      const window = BrowserWindow.fromWebContents(event.sender)
      const selected = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
      if (selected.canceled || !selected.filePaths[0]) return null
      rememberEngineDirectory(selected.filePaths[0])
      return listEngineWallpapers()
    })
  })
  ipcMain.handle(channels.wallpaperAddEngine, (_event, ...args: unknown[]) => {
    const [id, scope] = validate(z.tuple([z.string().regex(/^[a-f0-9]{64}$/), scopeArg]), args)
    return serial(async () => {
      const entry = engineEntry(id)
      const asset = await engineAsset(id)
      if (!entry || !asset) fail('WALLPAPER_ENGINE_NOT_FOUND', '这张本地壁纸已不可用，请刷新列表后重试。')
      return wallpaper.addEngineAsset(scope, asset.file, entry.title, id, asset.kind)
    })
  })
  ipcMain.handle(channels.wallpaperGet, (_event, ...args: unknown[]) => {
    const [scope] = validate(z.tuple([scopeArg]), args)
    return serial(() => wallpaper.loadConfig(scope))
  })
  ipcMain.handle(channels.wallpaperAddUrl, (_event, ...args: unknown[]) => {
    const [input, scope] = validate(z.tuple([z.object({ url: z.string().min(1).max(2000), label: z.string().max(100).optional() }), scopeArg]), args)
    return serial(() => wallpaper.addFromUrl(scope, input.url, input.label))
  })
  ipcMain.handle(channels.wallpaperAddFile, (event, ...args: unknown[]) => {
    const [scope] = validate(z.tuple([scopeArg]), args)
    return serial(async () => {
      const options = {
        title: '选择壁纸', properties: ['openFile'] as ['openFile'],
        filters: [{ name: '图片和视频', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map(extension => extension.slice(1)) }]
      }
      const window = BrowserWindow.fromWebContents(event.sender)
      const selected = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
      if (selected.canceled || !selected.filePaths[0]) return null
      return wallpaper.addFromPath(scope, selected.filePaths[0])
    })
  })
  ipcMain.handle(channels.wallpaperAddSystem, (_event, ...args: unknown[]) => {
    const [scope] = validate(z.tuple([scopeArg]), args)
    return serial(() => wallpaper.addFromSystem(scope))
  })
  ipcMain.handle(channels.wallpaperRemove, (_event, ...args: unknown[]) => {
    const [id, scope] = validate(z.tuple([z.string().uuid(), scopeArg]), args)
    return serial(() => wallpaper.remove(scope, id))
  })
  ipcMain.handle(channels.wallpaperSetActive, (_event, ...args: unknown[]) => {
    const [id, scope] = validate(z.tuple([z.string().uuid().nullable(), scopeArg]), args)
    return serial(() => wallpaper.setActive(scope, id))
  })
  ipcMain.handle(channels.wallpaperUpdateConfig, (_event, ...args: unknown[]) => {
    const [input, scope] = validate(z.tuple([updateArg, scopeArg]), args)
    if (scope === 'workspace' && input.mode !== undefined) fail('INVALID_ARGUMENT', '只有沉浸背景支持切换模式。')
    if (scope === 'immersive' && input.fit !== undefined) fail('INVALID_ARGUMENT', '只有工作台壁纸支持切换显示方式。')
    return serial(() => wallpaper.updateConfig(scope, input))
  })
  ipcMain.handle(channels.wallpaperClear, (_event, ...args: unknown[]) => {
    const [scope] = validate(z.tuple([scopeArg]), args)
    return serial(() => wallpaper.clear(scope))
  })
}
