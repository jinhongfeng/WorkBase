import { randomUUID } from 'node:crypto'
import type { Todo, TodoInput, TodoStats } from '@shared/types'
import { getDatabase } from '../index'

interface TodoRow {
  id: string
  title: string
  detail: string
  priority: number
  due_date: string | null
  done: number
  done_at: number | null
  created_at: number
  updated_at: number
  sort: number
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    priority: row.priority,
    dueDate: row.due_date,
    done: row.done,
    doneAt: row.done_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sort: row.sort
  }
}

export function listTodos(): Todo[] {
  // 未完成按用户手动排序（sort）展示，拖拽结果即时生效；已完成按完成时间倒序。
  const rows = getDatabase()
    .prepare(`SELECT * FROM todos ORDER BY done ASC,
      CASE WHEN done = 0 THEN sort ELSE 2147483647 END ASC,
      CASE WHEN done = 1 THEN done_at ELSE 0 END DESC,
      created_at DESC`)
    .all() as TodoRow[]
  return rows.map(toTodo)
}

export function todoStats(): TodoStats {
  return getDatabase().prepare(`
    SELECT COUNT(*) AS pending,
           COALESCE(SUM(due_date < date('now', 'localtime')), 0) AS overdue,
           COALESCE(SUM(due_date = date('now', 'localtime')), 0) AS dueToday
    FROM todos WHERE done = 0
  `).get() as TodoStats
}

export function getTodo(id: string): Todo {
  const row = getDatabase().prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined
  if (!row) throw new Error('TODO_NOT_FOUND')
  return toTodo(row)
}

export function saveTodo(input: TodoInput): Todo {
  const db = getDatabase()
  const now = Date.now()
  if (input.id) {
    db.prepare('UPDATE todos SET title = ?, detail = ?, priority = ?, due_date = ?, updated_at = ? WHERE id = ?')
      .run(input.title.trim(), input.detail ?? '', input.priority ?? 2, input.dueDate ?? null, now, input.id)
    return getTodo(input.id)
  }
  const id = randomUUID()
  // 新待办插入未完成列表顶部：sort 取当前最小值减一，保持「最新在上」的视觉顺序。
  const min = db.prepare('SELECT COALESCE(MIN(sort), 1) AS value FROM todos').get() as { value: number }
  db.prepare('INSERT INTO todos(id, title, detail, priority, due_date, done, created_at, updated_at, sort) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .run(id, input.title.trim(), input.detail ?? '', input.priority ?? 2, input.dueDate ?? null, now, now, min.value - 1)
  return getTodo(id)
}

export function toggleTodo(id: string): Todo {
  const db = getDatabase()
  const current = getTodo(id)
  const done = current.done === 1 ? 0 : 1
  db.prepare('UPDATE todos SET done = ?, done_at = ?, updated_at = ? WHERE id = ?')
    .run(done, done ? Date.now() : null, Date.now(), id)
  return getTodo(id)
}

export function removeTodo(id: string): void {
  getDatabase().prepare('DELETE FROM todos WHERE id = ?').run(id)
}

/** 分组内拖拽排序：按传入顺序重写 sort，只更新列表里出现的待办。 */
export function reorderTodos(ids: string[]): void {
  const db = getDatabase()
  db.transaction(() => {
    for (const [index, id] of ids.entries()) {
      db.prepare('UPDATE todos SET sort = ? WHERE id = ?').run(index + 1, id)
    }
  })()
}

export function clearDoneTodos(): void {
  getDatabase().prepare('DELETE FROM todos WHERE done = 1').run()
}
