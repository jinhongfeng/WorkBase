import { randomUUID } from 'node:crypto'
import type { AIMessage, AIThread, ChatMessage } from '@shared/types'
import { getDatabase } from '../index'
import { fail } from '../../ipc/errors'

export function listThreads(): AIThread[] {
  return getDatabase().prepare('SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_threads ORDER BY updated_at DESC, rowid DESC').all() as AIThread[]
}

export function getMessages(threadId: string): AIMessage[] {
  requireThread(threadId)
  return getDatabase().prepare('SELECT id, thread_id AS threadId, role, content, created_at AS createdAt FROM ai_messages WHERE thread_id = ? ORDER BY created_at, rowid').all(threadId) as AIMessage[]
}

export function getRecentMessages(threadId: string, limit: number): ChatMessage[] {
  requireThread(threadId)
  const messages = getDatabase().prepare('SELECT role, content FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
    .all(threadId, limit) as ChatMessage[]
  return messages.reverse()
}

export function createThread(): AIThread {
  const thread = { id: randomUUID(), title: '新会话', createdAt: Date.now(), updatedAt: Date.now() }
  getDatabase().prepare('INSERT INTO ai_threads(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(thread.id, thread.title, thread.createdAt, thread.updatedAt)
  return thread
}

function requireThread(id: string): void {
  if (!getDatabase().prepare('SELECT id FROM ai_threads WHERE id = ?').get(id)) fail('AI_THREAD_NOT_FOUND', '会话已被删除，请新建会话后重试。')
}

export function renameThread(id: string, title: string): void {
  requireThread(id)
  getDatabase().prepare('UPDATE ai_threads SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id)
}

export function removeThread(id: string): void {
  getDatabase().prepare('DELETE FROM ai_threads WHERE id = ?').run(id)
}

export function appendMessage(threadId: string, role: ChatMessage['role'], content: string): void {
  const db = getDatabase()
  db.transaction(() => {
    requireThread(threadId)
    const now = Date.now()
    db.prepare('INSERT INTO ai_messages(id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), threadId, role, content, now)
    db.prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?').run(now, threadId)
  })()
}

export function appendTurn(threadId: string, user: string, assistant: string): void {
  getDatabase().transaction(() => {
    appendMessage(threadId, 'user', user)
    appendMessage(threadId, 'assistant', assistant)
  })()
}

/** 重新生成：删掉末尾的 assistant 回复，返回最后一条用户消息；没有可重发内容时返回 null。 */
export function trimForRegenerate(threadId: string): string | null {
  const db = getDatabase()
  return db.transaction(() => {
    requireThread(threadId)
    const last = db.prepare('SELECT id, role FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get(threadId) as { id: string; role: string } | undefined
    if (!last || last.role !== 'assistant') return null
    db.prepare('DELETE FROM ai_messages WHERE id = ?').run(last.id)
    const user = db.prepare("SELECT content FROM ai_messages WHERE thread_id = ? AND role = 'user' ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .pluck().get(threadId) as string | undefined
    return user ?? null
  })()
}
