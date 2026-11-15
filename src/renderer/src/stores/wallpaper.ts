import { create } from 'zustand'
import type { WallpaperConfig, WallpaperScope, WallpaperUpdate } from '@shared/types'

interface WallpaperState {
  config: WallpaperConfig
  load(): Promise<void>
  addUrl(input: { url: string; label?: string }): Promise<void>
  addFile(): Promise<boolean>
  addSystem(): Promise<void>
  addEngine(id: string): Promise<void>
  remove(id: string): Promise<void>
  setActive(id: string | null): Promise<void>
  updateConfig(input: WallpaperUpdate): Promise<void>
  clear(): Promise<void>
}

const createWallpaperStore = (scope: WallpaperScope) => create<WallpaperState>(set => ({
  config: { items: [], activeId: null, carousel: false, interval: 60, overlay: 0.22 },
  load: async () => { set({ config: await window.api.wallpaper.get(scope) }) },
  addUrl: async input => { set({ config: await window.api.wallpaper.addUrl(input, scope) }) },
  addFile: async () => {
    const config = await window.api.wallpaper.addFile(scope)
    if (config) set({ config })
    return config !== null
  },
  addSystem: async () => { set({ config: await window.api.wallpaper.addSystem(scope) }) },
  addEngine: async id => { set({ config: await window.api.wallpaper.addEngine(id, scope) }) },
  remove: async id => { set({ config: await window.api.wallpaper.remove(id, scope) }) },
  setActive: async id => { set({ config: await window.api.wallpaper.setActive(id, scope) }) },
  updateConfig: async input => { set({ config: await window.api.wallpaper.updateConfig(input, scope) }) },
  clear: async () => { set({ config: await window.api.wallpaper.clear(scope) }) }
}))

export const useWallpaper = createWallpaperStore('workspace')
export const useImmersiveWallpaper = createWallpaperStore('immersive')

export const selectActiveWallpaper = (state: WallpaperState) => state.config.items.find(item => item.id === state.config.activeId) ?? null
