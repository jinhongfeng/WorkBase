import { create } from 'zustand'
import { registry, useModuleRegistry } from '../modules/registry'
import type { ModuleDefinition } from '../modules/defineModule'

type NoteTarget = { id: string } | { todayJournal: true } | { newNote: true }

interface NavigationState {
  pinned: string[]
  ready: boolean
  error: string
  more: boolean
  command: boolean
  path: string
  pendingNote: NoteTarget | null
  pendingTodo: boolean
  initialize(): Promise<void>
  setPinned(ids: string[]): Promise<void>
  togglePin(id: string): Promise<void>
  navigate(path: string): void
  closePage(): void
  openNote(target: NoteTarget): void
  consumePendingNote(): NoteTarget | null
  openTodos(): void
  consumePendingTodo(): boolean
  setMore(open: boolean): void
  setCommand(open: boolean): void
}

export const useNavigation = create<NavigationState>((set, get) => ({
  pinned: [],
  ready: false,
  error: '',
  more: false,
  command: false,
  path: location.hash.slice(1) || '/dashboard',
  pendingNote: null,
  pendingTodo: false,
  initialize: async () => {
    try {
      const settings = await window.api.settings.getAll()
      const raw = settings['ui.pinned_modules']
      const saved: unknown = raw === undefined ? undefined : JSON.parse(raw)
      const pinned = saved === undefined
        ? registry.filter(module => module.defaultPinned).map(module => module.id)
        : Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
      if (saved === undefined) await window.api.settings.setPinnedModules(pinned)
      set({ pinned, ready: true, error: '' })
    } catch {
      set({ ready: true, error: '无法读取本地设置，请重新启动应用。' })
    }
  },
  setPinned: async ids => {
    try { await window.api.settings.setPinnedModules(ids); set({ pinned: ids }) }
    catch { window.toast.error('未能保存常用功能，请重试') }
  },
  togglePin: async id => {
    const ids = get().pinned
    await get().setPinned(ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])
  },
  navigate: path => {
    if (location.hash !== '#' + path) {
      const role = registry.find(module => module.path === path)?.role
      const isClosable = role === 'settings' || role === 'assistant'
      if (isClosable) history.pushState({ openedFromPage: true }, '', '#' + path)
      else location.hash = path
    }
    set({ path, more: false, command: false })
  },
  closePage: () => {
    if (history.state?.openedFromPage === true) history.back()
    else get().navigate(registry.find(module => module.role === 'home')?.path ?? '/dashboard')
  },
  openNote: target => { location.hash = '/notes'; set({ path: '/notes', pendingNote: target, more: false, command: false }) },
  consumePendingNote: () => {
    const target = get().pendingNote
    if (target) set({ pendingNote: null })
    return target
  },
  openTodos: () => { location.hash = '/todos'; set({ path: '/todos', pendingTodo: true, more: false, command: false }) },
  consumePendingTodo: () => {
    const pending = get().pendingTodo
    if (pending) set({ pendingTodo: false })
    return pending
  },
  setMore: more => set({ more, command: false }),
  setCommand: command => set({ command, more: false })
}))

export function validPinned(ids: string[], modules: ModuleDefinition[]) {
  return [...new Set(ids)]
    .map(id => modules.find(module => module.id === id && module.pinnable))
    .filter((module): module is ModuleDefinition => module !== undefined)
}

/** 侧栏常用区容量：首页 1 个固定入口 + 8 个常用 = 9 个模块位。 */
export const PINNED_LIMIT = 8

export function visiblePinned(ids: string[], modules = useModuleRegistry.getState().modules) {
  return validPinned(ids, modules).slice(0, PINNED_LIMIT)
}
