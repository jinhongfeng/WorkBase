import { ipcMain } from 'electron'
import { z } from 'zod'
import type { HabitInput } from '@shared/types'
import { channels } from '@shared/ipc-contract'
import { addFocusSession, createHabit, focusStats, listHabits, removeFocusSession, removeHabit, renameFocusSession, setHabitCount, toggleHabit } from '../db/repo/growth'
import { validate } from './validation'
import { activityYear } from '../db/repo/activity'

const habitSchema = z.object({
  name: z.string().min(1).max(60),
  icon: z.string().max(8).optional(),
  color: z.string().max(20).optional(),
  target: z.number().int().min(1).max(20).optional()
})

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function registerGrowthIPC(): void {
  ipcMain.handle(channels.activityYear, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      year: z.number().int().min(1970).max(9998),
      sources: z.array(z.enum(['notes', 'ielts', 'todos', 'habits'])).max(4)
    })]), args)
    return activityYear(input.year, [...new Set(input.sources)])
  })
  ipcMain.handle(channels.habitsList, () => listHabits())
  ipcMain.handle(channels.habitsCreate, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([habitSchema]), args)
    createHabit(input as HabitInput)
    return listHabits()
  })
  ipcMain.handle(channels.habitsRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    removeHabit(id)
  })
  ipcMain.handle(channels.habitsToggle, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ id: z.string().min(1).max(64), date: dateSchema })]), args)
    toggleHabit(input.id, input.date)
    return listHabits()
  })
  ipcMain.handle(channels.habitsSetCount, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({
      id: z.string().min(1).max(64),
      date: dateSchema,
      count: z.number().int().min(0).max(99)
    })]), args)
    setHabitCount(input.id, input.date, input.count)
    return listHabits()
  })
  ipcMain.handle(channels.focusAdd, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ minutes: z.number().int().min(1).max(600), label: z.string().max(80).optional() })]), args)
    return addFocusSession(input.minutes, input.label ?? '')
  })
  ipcMain.handle(channels.focusStats, () => focusStats())
  ipcMain.handle(channels.focusRename, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([z.object({ id: z.string().min(1).max(64), label: z.string().max(80) })]), args)
    return renameFocusSession(input.id, input.label.trim())
  })
  ipcMain.handle(channels.focusRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.string().min(1).max(64)]), args)
    return removeFocusSession(id)
  })
}
