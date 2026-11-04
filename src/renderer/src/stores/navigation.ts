import { create } from 'zustand'
import { registry } from '../modules/registry'
interface NavigationState {
  pinned: string[]; ready: boolean; error: string; more: boolean; command: boolean; path: string
  initialize(): Promise<void>
  setPinned(ids: string[]): Promise<void>
  togglePin(id: string): Promise<void>
  navigate(path: string): void
  setMore(open: boolean): void
  setCommand(open: boolean): void
}
export const useNavigation = create<NavigationState>((set, get) => ({
  pinned: [], ready: false, error: '', more: false, command: false, path: location.hash.slice(1) || '/dashboard',
  initialize: async () => {
    try {
      const settings = await window.api.settings.getAll()
      const saved: unknown = settings['ui.pinned_modules'] === undefined ? undefined : JSON.parse(settings['ui.pinned_modules'])
      const pinned = saved === undefined ? registry.filter(module => module.defaultPinned).map(module => module.id) : Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
      if (saved === undefined) await window.api.settings.setPinnedModules(pinned)
      set({ pinned, ready: true, error: '' })
    } catch { set({ ready: true, error: '无法读取本地设置，请重新启动应用。' }) }
  },
  setPinned: async ids => {
    try { await window.api.settings.setPinnedModules(ids); set({ pinned: ids }) }
    catch { window.toast.error('未能保存常用功能，请重试') }
  },
  togglePin: async id => {
    const ids = get().pinned
    await get().setPinned(ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])
  },
  navigate: path => { location.hash = path; set({ path, more: false, command: false }) },
  setMore: more => set({ more, command: false }), setCommand: command => set({ command, more: false })
}))
export function validPinned(ids: string[]) { return [...new Set(ids)].map(id => registry.find(module => module.id === id && module.pinnable)).filter(module => module !== undefined) }
export function visiblePinned(ids: string[]) { return validPinned(ids).slice(0, 6) }
