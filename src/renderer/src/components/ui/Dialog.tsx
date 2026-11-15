import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
export function Dialog({ open, title, children, onClose, className = '', closeOnBackdrop = false }: {
  open: boolean; title: string; children: ReactNode; onClose(): void; className?: string; closeOnBackdrop?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus()
    } else {
      dialog.close()
    }
  }, [open])
  // 阅读面板可以点击外部关闭，编辑和确认弹窗默认仍需明确关闭。
  return <dialog ref={ref} className={`dialog ${className}`.trim()} aria-label={title}
    closedby={closeOnBackdrop ? 'any' : undefined}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="section-heading"><h2>{title}</h2><Button variant="ghost" className="icon" aria-label="关闭" onClick={onClose}><X size={18}/></Button></header>{children}
  </dialog>
}
export function ConfirmDialog({ open, title, description, onClose, onConfirm, loading = false, confirmLabel = '确认操作' }: { open: boolean; title: string; description: string; onClose(): void; onConfirm(): void; loading?: boolean; confirmLabel?: string }) {
  return <Dialog open={open} title={title} onClose={onClose}><p>{description}</p><div className="actions"><Button onClick={onClose}>取消</Button><Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div></Dialog>
}
