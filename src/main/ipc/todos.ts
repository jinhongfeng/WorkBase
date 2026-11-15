import { ipcMain } from 'electron'
import { z } from 'zod'
import type { TodoInput } from '@shared/types'
import { channels } from '@shared/ipc-contract'
import { clearDoneTodos, listTodos, removeTodo, reorderTodos, saveTodo, todoStats, toggleTodo } from '../db/repo/todos'
import { validate } from './validation'

const saveSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(4000).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
})

const idSchema = z.tuple([z.string().min(1).max(64)])

export function registerTodosIPC(): void {
  ipcMain.handle(channels.todosList, () => listTodos())
  ipcMain.handle(channels.todosStats, (_event, ...args: unknown[]) => {
    validate(z.tuple([]), args)
    return todoStats()
  })
  ipcMain.handle(channels.todosSave, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([saveSchema]), args)
    return saveTodo(input as TodoInput)
  })
  ipcMain.handle(channels.todosToggle, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    return toggleTodo(id)
  })
  ipcMain.handle(channels.todosRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(idSchema, args)
    removeTodo(id)
  })
  ipcMain.handle(channels.todosReorder, (_event, ...args: unknown[]) => {
    const [ids] = validate(z.tuple([z.array(z.string().min(1).max(64)).max(500)]), args)
    reorderTodos([...new Set(ids)])
  })
  ipcMain.handle(channels.todosClearDone, () => clearDoneTodos())
}
