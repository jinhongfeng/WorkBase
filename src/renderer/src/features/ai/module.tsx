import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { ArrowUp, ArrowUpRight, BookmarkPlus, Copy, Pencil, Plus, RefreshCw, Square, Sparkles, Trash2, X } from 'lucide-react'
import type { AIConfig, AIThread } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { ActionPopover } from '../../components/ui/ActionPopover'
import { Alert } from '../../components/ui/Alert'
import { SearchField } from '../../components/ui/SearchField'
import { PanelResizeHandle, usePanelLayoutWidth, usePanelWidth } from '../../components/ui/PanelResizeHandle'
import { WidthHandle } from '../../components/ui/WidthHandle'
import { HeightHandle } from '../../components/ui/HeightHandle'
import { defineModule } from '../../modules/defineModule'
import { useNavigation } from '../../stores/navigation'
import { markdownToHtml } from '../../lib/markdown'
import { clamp, humanError } from '../../lib/utils'
import { useAssistant } from '../../stores/ai'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import './assistant.css'

const QUICK = [
  '把今天要做的事排个优先级',
  '帮我把这段话改得更简洁',
  '给我 3 个提升专注力的具体方法'
]

const DEFAULT_THREADS_WIDTH = 208
const MIN_THREADS_WIDTH = 168
const MAX_THREADS_WIDTH = 420
const MIN_CHAT_WIDTH = 520
const MAX_CHAT_WIDTH = 960
const DEFAULT_CHAT_WIDTH = 624
const MIN_COMPOSE_HEIGHT = 34
const MAX_COMPOSE_HEIGHT = 220
const DEFAULT_COMPOSE_HEIGHT = 34
const MENU_SIZE = { width: 148, height: 88 }

/** 在代码块外包一层容器并内置复制按钮，点击由聊天区的事件委托统一处理。 */
function withCodeCopy(html: string): string {
  return html
    .replaceAll('<pre>', '<div class="md-code"><button type="button" class="md-code-copy">复制</button><pre>')
    .replaceAll('</pre>', '</pre></div>')
}

function AssistantPage() {
  const navigate = useNavigation(state => state.navigate)
  const closePage = useNavigation(state => state.closePage)
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const { threads, activeId, messages, input, requestId, loading, setInput, load, open, create, rename, remove, send, regenerate, stop } = useAssistant()
  const streaming = requestId !== null
  const [renameTarget, setRenameTarget] = useState<AIThread | null>(null)
  const [threadTitle, setThreadTitle] = useState('')
  const [threadQuery, setThreadQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AIThread | null>(null)
  const [menu, setMenu] = useState<{ thread: AIThread; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [layout, availableWidth] = usePanelLayoutWidth()
  const threadsSize = usePanelWidth('ui.ai.threadsWidth', MIN_THREADS_WIDTH, MAX_THREADS_WIDTH)
  const chatSize = usePanelWidth('ui.ai.chatWidth', MIN_CHAT_WIDTH, MAX_CHAT_WIDTH)
  const composeSize = usePanelWidth('ui.ai.composeHeight', MIN_COMPOSE_HEIGHT, MAX_COMPOSE_HEIGHT)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.ai.config().then(setConfig).catch(() => setConfig(null)).finally(() => setLoadingConfig(false))
    void load()
  }, [load])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // 右键菜单：点击菜单外、按 Esc 或窗口失焦时关闭。
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenu(null) }
    const onBlur = (): void => setMenu(null)
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [menu])

  /** 会话列表宽度跟随本机记忆，窗口过窄时为聊天区让位。 */
  const availableForThreads = Math.max(MIN_THREADS_WIDTH, availableWidth - MIN_CHAT_WIDTH)
  const maxThreadsWidth = Math.min(MAX_THREADS_WIDTH, availableForThreads)
  const threadsWidth = clamp(threadsSize.preview ?? threadsSize.preferred ?? DEFAULT_THREADS_WIDTH, MIN_THREADS_WIDTH, maxThreadsWidth)
  /** 聊天区宽度：左右边缘手柄拖动，本机记忆；窗口变窄时相应收缩。 */
  const chatAreaWidth = Math.max(MIN_CHAT_WIDTH, availableWidth - (threads.length > 0 ? threadsWidth : 0))
  const maxChatWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, chatAreaWidth - 24))
  const chatWidth = clamp(chatSize.preview ?? chatSize.preferred ?? DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, maxChatWidth)
  const chatGap = Math.max(0, (chatAreaWidth - chatWidth) / 2)
  /** 输入框高度：上缘手柄上下拖动，本机记忆；单行 34px，拖高后多行显示。 */
  const composeHeight = clamp(composeSize.preview ?? composeSize.preferred ?? DEFAULT_COMPOSE_HEIGHT, MIN_COMPOSE_HEIGHT, MAX_COMPOSE_HEIGHT)

  function openThreadMenu(event: MouseEvent, thread: AIThread): void {
    event.preventDefault()
    setMenu({ thread, x: event.clientX, y: event.clientY })
  }

  const copyMessage = (content: string): void => {
    void navigator.clipboard.writeText(content).then(() => window.toast.success('已复制'))
  }

  /** 事件委托：代码块的「复制」按钮统一在这里写入剪贴板。 */
  function handleChatClick(event: MouseEvent<HTMLDivElement>): void {
    const button = (event.target as HTMLElement).closest('.md-code-copy')
    if (!button) return
    const code = button.parentElement?.querySelector('pre')?.textContent ?? ''
    copyMessage(code.replace(/\n$/, ''))
  }

  const saveToNotes = async (): Promise<void> => {
    if (!messages.length) return
    const markdown = messages.map(message => `${message.role === 'user' ? '## 我' : '## 助手'}\n\n${message.content}`).join('\n\n')
    try {
      const note = await window.api.notes.save({ title: `与助手的对话 ${new Date().toLocaleDateString('zh-CN')}`, content: markdown, tags: ['AI'], kind: 'note' })
      window.toast.success('已保存到笔记')
      void note
    } catch (error) {
      window.toast.error(humanError(error))
    }
  }

  const ready = Boolean(config?.configured)
  const activeThread = threads.find(thread => thread.id === activeId)
  const term = threadQuery.trim().toLowerCase()
  const visibleThreads = threads.filter(thread => thread.title.toLowerCase().includes(term))
  const settingsButton = <Button variant="primary" onClick={() => navigate('/settings')}>前往 AI 设置</Button>
  const setupHint = '填写接口地址和模型后即可开始对话。API 密钥按服务要求填写。'
  const configNotice = !ready && (loadingConfig
    ? <p role="status" className="muted">正在读取 AI 配置…</p>
    : !config || messages.length > 0
      ? <Alert tone={config ? 'info' : 'warn'} title={config ? '连接 AI 服务' : '无法读取 AI 配置'} action={settingsButton}>
        <p>{config ? setupHint : '打开 AI 设置检查配置，或重新打开智能助手再试。'}</p>
      </Alert>
      : <EmptyState title="连接 AI 服务" description={setupHint}>{settingsButton}</EmptyState>)

  return (
    <div className={`assistant-layout${threads.length === 0 ? ' no-threads' : ''}`} ref={layout}
      style={threads.length > 0 ? { gridTemplateColumns: `${threadsWidth}px 0 minmax(0, 1fr)` } : undefined}>
      {threads.length > 0 && <aside className="chat-threads" id="chat-threads-panel" aria-label="会话列表"
        onContextMenu={event => {
          const target = (event.target as HTMLElement).closest('[data-thread-id]')
          const thread = threads.find(item => item.id === target?.getAttribute('data-thread-id'))
          if (thread) openThreadMenu(event, thread)
        }}>
        {ready && <Button disabled={loading || streaming} onClick={() => { setThreadQuery(''); void create() }}><Plus size={15} />新建会话</Button>}
        {(threads.length > 1 || threadQuery) && <SearchField label="搜索会话" placeholder="搜索会话标题…" value={threadQuery} onValueChange={setThreadQuery} />}
        {loading && <p className="small muted" role="status">正在读取会话…</p>}
        {!loading && !visibleThreads.length && <p className="empty-state-region small muted" role="status">没有匹配的会话</p>}
        {visibleThreads.map(thread => (
          <button className="chat-thread" key={thread.id} data-thread-id={thread.id} aria-current={activeId === thread.id ? 'true' : undefined} disabled={loading || streaming} onClick={() => void open(thread.id)} title={thread.title}>{thread.title}</button>
        ))}
      </aside>}
      {threads.length > 0 && <PanelResizeHandle side="left" controls="chat-threads-panel" label="调整会话列表宽度"
        width={threadsWidth} min={MIN_THREADS_WIDTH} max={maxThreadsWidth}
        onPreview={threadsSize.setPreview} onCommit={threadsSize.commit} />}
    <div className="chat-shell" style={{ '--chat-width': `${chatWidth}px` } as CSSProperties}>
      <WidthHandle edge="left" label="调整聊天区左侧边界" width={chatWidth} min={MIN_CHAT_WIDTH} max={maxChatWidth}
        onPreview={chatSize.setPreview} onCommit={chatSize.commit} style={{ left: chatGap }} />
      <WidthHandle edge="right" label="调整聊天区右侧边界" width={chatWidth} min={MIN_CHAT_WIDTH} max={maxChatWidth}
        onPreview={chatSize.setPreview} onCommit={chatSize.commit} style={{ right: chatGap }} />
      <div className="chat-top chat-inner">
        <PageHeader
          title={
            <span className="chat-head-title">
              智能助手
              {ready && config?.model && <span className="badge">{config.model}</span>}
            </span>
          }
          actions={
            <>
              {messages.length > 0 &&
                <Button variant="ghost" className="icon" disabled={streaming} aria-label="保存到笔记" title="保存到笔记" onClick={() => void saveToNotes()}><BookmarkPlus size={18} aria-hidden="true" /></Button>
              }
              {activeThread && <ActionPopover label="会话操作" disabled={loading || streaming} actions={[
                { label: '重命名会话', icon: <Pencil size={15} />, onSelect: () => { setThreadTitle(activeThread.title); setRenameTarget(activeThread) } },
                { label: '删除会话', icon: <Trash2 size={15} />, onSelect: () => setDeleteTarget(activeThread), danger: true }
              ]} />}
              <Button type="button" variant="ghost" className="icon" aria-label="关闭智能助手" title="关闭智能助手" onClick={closePage}><X size={18} aria-hidden="true" /></Button>
            </>
          }
        />
        {configNotice && messages.length > 0 && <div className="chat-config">{configNotice}</div>}
      </div>
      <div className="chat-scroll" ref={scrollRef} onClick={handleChatClick}>
        <div className="chat-inner">
          {configNotice && messages.length === 0 && <div className="chat-config-empty">{configNotice}</div>}
          {ready && messages.length === 0 && (
            <section className="chat-start">
              <h2>开始一段对话</h2>
              {threads.length === 0 && <Button className="sm" disabled={loading || streaming} onClick={() => void create()}><Plus size={15} />新建会话</Button>}
              <div className="chat-quick">
                {QUICK.map(item => (
                  <button key={item} className="card chat-quick-card" disabled={loading || streaming} onClick={() => void send(item)}>
                    <span>{item}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {messages.map((message, index) => (
            <div className={`chat-msg ${message.role}`} key={index}>
              <span className="who">{message.role === 'user' ? '我' : <><Sparkles size={12} aria-hidden="true" />助手</>}</span>
              <div className="bubble prose">
                {message.role === 'assistant' && !message.content
                  ? <span className="chat-typing" role="status" aria-label="正在生成回复"><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /></span>
                  : message.role === 'assistant'
                    ? <div dangerouslySetInnerHTML={{ __html: withCodeCopy(markdownToHtml(message.content)) }} />
                    : message.content}
              </div>
              <div className="chat-msg-actions">
                <button type="button" className="icon-action" title="复制" aria-label={`复制${message.role === 'user' ? '我' : '助手'}的消息`} onClick={() => copyMessage(message.content)}><Copy size={13} /></button>
                {message.role === 'assistant' && index === messages.length - 1 && !streaming &&
                  <button type="button" className="icon-action" title="重新生成" aria-label="重新生成这条回复" onClick={() => void regenerate()}><RefreshCw size={13} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {ready && <div className="chat-compose">
        <HeightHandle label="调整输入框高度" height={composeHeight} min={MIN_COMPOSE_HEIGHT} max={MAX_COMPOSE_HEIGHT}
          onPreview={composeSize.setPreview} onCommit={composeSize.commit} style={{ top: -7 }} />
        <div className="chat-inner">
          <div className="chat-box">
            <textarea
              rows={1}
              maxLength={20000}
              value={input}
              placeholder="输入问题"
              disabled={loading || streaming}
              style={{ height: `${composeHeight}px` }}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input) }
              }}
              aria-label="对话输入"
            />
            {streaming ? <Button onClick={() => void stop()} aria-label="停止生成" title="停止生成"><Square size={14} aria-hidden="true" /></Button> :
              <Button variant="primary" disabled={!input.trim() || loading} onClick={() => void send(input)} aria-label="发送" title="发送"><ArrowUp size={15} aria-hidden="true" /></Button>}
          </div>
        </div>
      </div>}
    </div>
      <Dialog open={renameTarget !== null} title="重命名会话" onClose={() => setRenameTarget(null)}>
        <form onSubmit={event => { event.preventDefault(); if (renameTarget && threadTitle.trim() && !loading) void rename(renameTarget.id, threadTitle).then(() => setRenameTarget(null)) }}>
          <input className="input" aria-label="会话名称" maxLength={120} value={threadTitle} onChange={event => setThreadTitle(event.target.value)} data-dialog-autofocus />
          <div className="actions"><Button type="submit" disabled={!threadTitle.trim() || loading}>保存名称</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={deleteTarget !== null} title="删除会话" confirmLabel="删除会话" description={`「${deleteTarget?.title ?? ''}」及其中的消息将从本机删除。`} loading={loading} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void remove(deleteTarget.id).then(() => setDeleteTarget(null)) }} />
      {menu && (() => {
        const x = Math.min(menu.x, window.innerWidth - MENU_SIZE.width - 8)
        const y = Math.min(menu.y, window.innerHeight - MENU_SIZE.height - 8)
        return <div className="chat-thread-menu" role="menu" aria-label={`会话「${menu.thread.title}」操作`} ref={menuRef} style={{ left: x, top: y }}>
          <button type="button" role="menuitem" onClick={() => { setThreadTitle(menu.thread.title); setRenameTarget(menu.thread); setMenu(null) }}>
            <Pencil size={14} aria-hidden="true" />重命名
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => { setDeleteTarget(menu.thread); setMenu(null) }}>
            <Trash2 size={14} aria-hidden="true" />删除
          </button>
        </div>
      })()}
    </div>
  )
}

export default defineModule({
  id: 'ai',
  role: 'assistant',
  name: '智能助手',
  group: '工具',
  icon: Sparkles,
  order: 60,
  defaultPinned: false,
  requires: 'aiConfig',
  keywords: ['ai', 'chat', '助手', 'gpt', 'deepseek'],
  page: AssistantPage
})
