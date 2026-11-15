import { create } from 'zustand'
import { humanError } from '../lib/utils'

interface FocusState {
  immersive: boolean
  minutes: number
  label: string
  running: boolean
  started: boolean
  endAt: number | null
  pausedRemaining: number
  remaining: number
  finishing: boolean
  revision: number
  choose(minutes: number): void
  setLabel(label: string): void
  enter(): void
  leave(): void
  toggle(): void
  reset(): void
  tick(): Promise<void>
}

export const useFocus = create<FocusState>((set, get) => ({
  immersive: false, minutes: 25, label: '', running: false, started: false, endAt: null,
  pausedRemaining: 1500, remaining: 1500, finishing: false, revision: 0,
  choose: minutes => {
    if (get().finishing || get().running) return
    set({ minutes, remaining: minutes * 60, pausedRemaining: minutes * 60, endAt: null, running: false, started: false })
  },
  setLabel: label => set({ label }),
  enter: () => {
    const state = get()
    set({ immersive: true })
    if (!state.running && !state.finishing) state.toggle()
  },
  leave: () => set({ immersive: false }),
  toggle: () => {
    const state = get()
    if (state.finishing) return
    if (state.running) {
      const remaining = Math.max(0, Math.ceil(((state.endAt ?? Date.now()) - Date.now()) / 1000))
      if (remaining === 0) { void state.tick(); return }
      set({ running: false, endAt: null, remaining, pausedRemaining: remaining })
    } else {
      set({ running: true, started: true, endAt: Date.now() + state.pausedRemaining * 1000 })
    }
  },
  reset: () => {
    if (get().finishing) return
    const remaining = get().minutes * 60
    set({ running: false, started: false, endAt: null, remaining, pausedRemaining: remaining })
  },
  tick: async () => {
    const state = get()
    if (!state.running || state.endAt === null || state.finishing) return
    const remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000))
    set({ remaining })
    if (remaining > 0) return
    set({ running: false, finishing: true, endAt: null })
    try {
      await window.api.focus.add({ minutes: state.minutes, label: state.label.trim() })
      window.toast.success(`完成 ${state.minutes} 分钟专注，休息一下`)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      set({ finishing: false, started: false, remaining: state.minutes * 60, pausedRemaining: state.minutes * 60, revision: get().revision + 1 })
    }
  }
}))

export function focusClock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
