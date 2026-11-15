import { useRef, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './Input'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type' | 'value' | 'onChange' | 'aria-label'> {
  label: string
  value: string
  onValueChange(value: string): void
  className?: string
}

export function SearchField({ label, value, onValueChange, className, ...inputProps }: Props) {
  const field = useRef<HTMLDivElement>(null)

  return <div className={`search-field${className ? ` ${className}` : ''}`} ref={field}>
    <Search size={15} aria-hidden="true" />
    <Input {...inputProps} value={value} aria-label={label} onChange={event => onValueChange(event.target.value)} />
    {value && <button type="button" className="search-clear" aria-label={`清空：${label}`} disabled={inputProps.disabled}
      onClick={() => {
        field.current?.querySelector('input')?.focus()
        onValueChange('')
      }}><X size={13} aria-hidden="true" /></button>}
  </div>
}
