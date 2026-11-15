import { create } from 'zustand'
import type { AIThread, ChatMessage } from '@shared/types'
import { humanError, uid } from '../lib/utils'

interface AssistantState {
  threads: AIThread[]
  activeId: string | null
  messages: ChatMessage[]
  input: string
  requestId: string | null
  loading: boolean
  setInput(input: string): void
  load(): Promise<void>
  open(id: string): Promise<void>
  create(): Promise<void>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
  send(text: string): Promise<void>
  regenerate(): Promise<void>
  stop(): Promise<void>
}

export const useAssistant = create<AssistantState>((set, get) => ({
  threads: [], activeId: null, messages: [], input: '', requestId: null, loading: false,
  setInput: input => set({ input }),
  load: async () => {
    if (get().loading || get().requestId) return
    set({ loading: true })
    try {
      const threads = await window.api.ai.threads.list()
      const activeId = threads.find(thread => thread.id === get().activeId)?.id ?? threads[0]?.id ?? null
      const messages = activeId ? await window.api.ai.threads.messages(activeId) : []
      set({ threads, activeId, messages })
    } catch (error) { window.toast.error(humanError(error)) }
    finally { set({ loading: false }) }
  },
  open: async id => {
    if (get().loading || get().requestId || get().activeId === id) return
    set({ loading: true })
    try { set({ activeId: id, messages: await window.api.ai.threads.messages(id), input: '' }) }
    catch (error) { window.toast.error(humanError(error)) }
    finally { set({ loading: false }) }
  },
  create: async () => {
    if (get().loading || get().requestId) return
    set({ loading: true })
    try {
      const thread = await window.api.ai.threads.create()
      set({ threads: [thread, ...get().threads], activeId: thread.id, messages: [], input: '' })
    } catch (error) { window.toast.error(humanError(error)) }
    finally { set({ loading: false }) }
  },
  rename: async (id, title) => {
    if (get().loading || get().requestId) return
    set({ loading: true })
    try {
      await window.api.ai.threads.rename(id, title.trim())
      set({ threads: await window.api.ai.threads.list() })
    } catch (error) { window.toast.error(humanError(error)) }
    finally { set({ loading: false }) }
  },
  remove: async id => {
    if (get().loading || get().requestId) return
    set({ loading: true })
    try {
      await window.api.ai.threads.remove(id)
      if (id === get().activeId) set({ activeId: null, messages: [], input: '' })
    } catch (error) { window.toast.error(humanError(error)) }
    finally { set({ loading: false }) }
    await get().load()
  },
  send: async text => {
    const content = text.trim()
    if (!content || get().loading || get().requestId) return
    if (!get().activeId) await get().create()
    const state = get()
    if (!state.activeId || state.requestId || state.loading) return
    const requestId = uid('chat')
    const history = state.messages
    const user: ChatMessage = { role: 'user', content }
    const next = [...history, user]
    set({ requestId, messages: [...next, { role: 'assistant', content: '' }], input: '' })
    const unsubscribe = window.api.ai.onDelta((id, delta) => {
      if (id !== get().requestId) return
      set({ messages: get().messages.map((message, index, all) => index === all.length - 1 ? { ...message, content: message.content + delta } : message) })
    })
    try {
      const result = await window.api.ai.chat({ requestId, threadId: state.activeId, messages: [user] })
      set({ messages: [...next, { role: 'assistant', content: result.content }] })
    } catch (error) {
      set({ messages: history, input: get().input || content })
      window.toast.error(humanError(error))
    } finally {
      unsubscribe()
      set({ requestId: null })
    }
    await get().load()
  },
  stop: async () => {
    const id = get().requestId
    if (!id) return
    try { await window.api.ai.abort(id) }
    catch (error) { window.toast.error(humanError(error)) }
  },
  /** 重新生成最后一条回复：主进程裁掉末尾 assistant 消息后按原上下文重发。 */
  regenerate: async () => {
    if (get().loading || get().requestId || !get().activeId) return
    const messages = get().messages
    if (!messages.length || messages[messages.length - 1].role !== 'assistant' || !messages.some(message => message.role === 'user')) return
    const requestId = uid('chat')
    const previous = messages
    set({ requestId, messages: [...messages.slice(0, -1), { role: 'assistant', content: '' }] })
    const unsubscribe = window.api.ai.onDelta((id, delta) => {
      if (id !== get().requestId) return
      set({ messages: get().messages.map((message, index, all) => index === all.length - 1 ? { ...message, content: message.content + delta } : message) })
    })
    try {
      const result = await window.api.ai.regenerate({ requestId, threadId: get().activeId as string })
      set({ messages: [...previous.slice(0, -1), { role: 'assistant', content: result.content }] })
    } catch (error) {
      set({ messages: previous })
      window.toast.error(humanError(error))
    } finally {
      unsubscribe()
      set({ requestId: null })
    }
    await get().load()
  }
}))
