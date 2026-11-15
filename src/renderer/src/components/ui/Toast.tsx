import { create } from 'zustand'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'
interface ToastItem { id: number; message: string; kind: 'success' | 'error'; action?: { label: string; onClick(): void }; leaving?: boolean }
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }))
let sequence = 0
export function initializeToast(): void {
  const push = (kind: ToastItem['kind'], message: string, action?: { label: string; onClick(): void }): void => {
    const id = ++sequence
    useToasts.setState(state => ({ items: [...state.items, { id, kind, message, action }] }))
    setTimeout(() => dismiss(id), 4500)
  }
  window.toast = { success: (message, action) => push('success', message, action), error: message => push('error', message) }
}
function dismiss(id: number): void {
  const leaving = useToasts.getState().items.some(item => item.id === id && item.leaving)
  if (leaving) return
  // 先标记 leaving 播放离场动画，动画结束后再移除；动作回调仍同步执行。
  useToasts.setState(state => ({ items: state.items.map(item => item.id === id ? { ...item, leaving: true } : item) }))
  setTimeout(() => useToasts.setState(state => ({ items: state.items.filter(item => item.id !== id) })), 150)
}
export function Toast() {
  const items = useToasts(state => state.items)
  return <div className="toasts" aria-live="polite">{items.map(item => <div className={`toast ${item.kind}${item.leaving ? ' leaving' : ''}`} key={item.id}>{item.kind === 'success' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}<span>{item.message}</span>{item.action && <button className="toast-action" disabled={item.leaving} onClick={() => { dismiss(item.id); item.action?.onClick() }}>{item.action.label}</button>}<button aria-label="关闭提示" disabled={item.leaving} onClick={() => dismiss(item.id)}><X size={16}/></button></div>)}</div>
}
