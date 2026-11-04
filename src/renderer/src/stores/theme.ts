import { create } from 'zustand'
export type Theme = 'system' | 'light' | 'dark'
export const useTheme = create<{ theme: Theme; setTheme(theme: Theme): void }>(set => ({
  theme: 'system', setTheme: theme => { localStorage.setItem('ui.theme', theme); set({ theme }); applyTheme(theme) }
}))
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : theme
}
export function initializeTheme(): void {
  const saved = localStorage.getItem('ui.theme')
  const theme: Theme = saved === 'light' || saved === 'dark' ? saved : 'system'
  useTheme.setState({ theme }); applyTheme(theme)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useTheme.getState().theme))
}
