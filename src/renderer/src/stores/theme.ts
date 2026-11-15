import { create } from 'zustand'
export type Theme = 'system' | 'light' | 'dark'
export type WorkspaceStyle = 'standard' | 'paper' | 'neumorphism' | 'apple'

const WORKSPACE_STYLE_KEY = 'ui.workspaceStyle'
/** standard 之外的合法取值；初始化时用于过滤旧数据或非法值。 */
const WORKSPACE_STYLE_VALUES: WorkspaceStyle[] = ['paper', 'neumorphism', 'apple']

/** 主题色预设：token 取值在 tokens.css 的 --accent-chip-* 与 html[data-accent] 块。 */
export const ACCENTS = [
  { id: 'moss', name: '苔绿' },
  { id: 'teal', name: '青' },
  { id: 'sky', name: '天青' },
  { id: 'indigo', name: '靛蓝' },
  { id: 'plum', name: '紫' },
  { id: 'rust', name: '赭红' },
  { id: 'amber', name: '琥珀' },
  { id: 'rose', name: '玫红' }
] as const
export type Accent = (typeof ACCENTS)[number]['id'] | 'default'
const ACCENT_KEY = 'ui.accent'
const ACCENT_IDS: readonly string[] = ACCENTS.map(item => item.id)

export function applyAccent(accent: Accent): void {
  if (accent === 'default') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = accent
}

export const useTheme = create<{
  theme: Theme
  setTheme(theme: Theme): void
  workspaceStyle: WorkspaceStyle
  setWorkspaceStyle(workspaceStyle: WorkspaceStyle): void
  accent: Accent
  setAccent(accent: Accent): void
}>(set => ({
  theme: 'system',
  setTheme: theme => {
    localStorage.setItem('ui.theme', theme)
    set({ theme })
    applyTheme(theme)
  },
  workspaceStyle: 'standard',
  setWorkspaceStyle: workspaceStyle => {
    localStorage.setItem(WORKSPACE_STYLE_KEY, workspaceStyle)
    document.documentElement.dataset.workspaceStyle = workspaceStyle
    set({ workspaceStyle })
  },
  accent: 'default',
  setAccent: accent => {
    localStorage.setItem(ACCENT_KEY, accent)
    set({ accent })
    applyAccent(accent)
  }
}))
export function applyTheme(theme: Theme): void {
  const effective = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : theme
  document.documentElement.dataset.theme = effective
  void window.api.app.setWindowTheme(effective)
}
export function initializeTheme(): void {
  const saved = localStorage.getItem('ui.theme')
  const theme: Theme = saved === 'light' || saved === 'dark' ? saved : 'system'
  const savedStyle = localStorage.getItem(WORKSPACE_STYLE_KEY) as WorkspaceStyle | null
  const workspaceStyle = savedStyle && WORKSPACE_STYLE_VALUES.includes(savedStyle) ? savedStyle : 'standard'
  const savedAccent = localStorage.getItem(ACCENT_KEY) as Accent | null
  const accent: Accent = savedAccent && (savedAccent === 'default' || ACCENT_IDS.includes(savedAccent)) ? savedAccent : 'default'
  document.documentElement.dataset.workspaceStyle = workspaceStyle
  applyAccent(accent)
  useTheme.setState({ theme, workspaceStyle, accent })
  applyTheme(theme)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useTheme.getState().theme))
}
