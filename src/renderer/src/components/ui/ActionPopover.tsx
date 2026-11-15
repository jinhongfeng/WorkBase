import { useId, useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from './Button'

interface Action {
  label: string
  icon: ReactNode
  onSelect(): void
  danger?: boolean
}

export function ActionPopover({ label, actions, disabled, variant = 'ghost' }: {
  label: string
  actions: Action[]
  disabled?: boolean
  variant?: 'ghost' | 'secondary' | 'primary'
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)

  return <>
    <Button type="button" variant={variant} popoverTarget={id} disabled={disabled}>
      {label}<ChevronDown size={13} aria-hidden="true" />
    </Button>
    <div id={id} ref={panel} popover="auto" role="group" aria-label={label} className="action-popover">
      {actions.map(action => (
        <Button key={action.label} type="button" variant={action.danger ? 'danger' : 'ghost'}
          onClick={() => { panel.current?.hidePopover(); action.onSelect() }}>
          {action.icon}{action.label}
        </Button>
      ))}
    </div>
  </>
}
