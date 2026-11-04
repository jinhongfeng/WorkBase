import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <header className="section-heading"><h2>{title}</h2><Button variant="ghost" aria-label="关闭" onClick={onClose}><X size={18}/></Button></header>{children}
  </dialog>
}
export function ConfirmDialog({ open, title, description, onClose, onConfirm, loading = false }: { open: boolean; title: string; description: string; onClose(): void; onConfirm(): void; loading?: boolean }) {
  return <Dialog open={open} title={title} onClose={onClose}><p>{description}</p><div className="actions"><Button onClick={onClose}>取消</Button><Button variant="danger" loading={loading} onClick={onConfirm}>确认操作</Button></div></Dialog>
}
