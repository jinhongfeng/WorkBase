import { create } from 'zustand'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'
interface ToastItem { id: number; message: string; kind: 'success' | 'error' }
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }))
let sequence = 0
export function initializeToast(): void {
  const push = (kind: ToastItem['kind'], message: string): void => {
    const id = ++sequence
    useToasts.setState(state => ({ items: [...state.items, { id, kind, message }] }))
    setTimeout(() => dismiss(id), 4500)
  }
  window.toast = { success: message => push('success', message), error: message => push('error', message) }
}
function dismiss(id: number): void { useToasts.setState(state => ({ items: state.items.filter(item => item.id !== id) })) }
export function Toast() {
  const items = useToasts(state => state.items)
  return <div className="toasts" aria-live="polite">{items.map(item => <div className={`toast ${item.kind}`} key={item.id}>{item.kind === 'success' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}<span>{item.message}</span><button aria-label="关闭提示" onClick={() => dismiss(item.id)}><X size={16}/></button></div>)}</div>
}
