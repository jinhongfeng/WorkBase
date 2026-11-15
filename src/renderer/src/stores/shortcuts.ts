import { create } from 'zustand'
import { humanError } from '../lib/utils'

export const SHORTCUTS_SETTING = 'ui.shortcuts'

/** 可自定义的快捷键 = Ctrl/⌘ 加单个字母或数字。 */
const SHORTCUT_KEY = /^[a-z0-9]$/

interface ShortcutsState {
  map: Record<string, string>
  load(): Promise<void>
}

function parseShortcuts(raw?: string): Record<string, string> {
  if (!raw) return {}
  try {
    const saved: unknown = JSON.parse(raw)
    const map: Record<string, string> = {}
    if (saved && typeof saved === 'object') {
      for (const [id, value] of Object.entries(saved as Record<string, unknown>)) {
        if (typeof value === 'string' && SHORTCUT_KEY.test(value)) map[id] = value
      }
    }
    return map
  } catch { return {} }
}

/** 快捷键映射：key 为模块 id 或 'command'（命令面板），value 为组合里的字母/数字。只读，历史保存的自定义仍生效。 */
export const useShortcuts = create<ShortcutsState>(set => ({
  map: {},
  load: async () => {
    try {
      const saved = await window.api.settings.getAll()
      set({ map: parseShortcuts(saved[SHORTCUTS_SETTING]) })
    } catch (error) { window.toast.error(humanError(error)) }
  }
}))
