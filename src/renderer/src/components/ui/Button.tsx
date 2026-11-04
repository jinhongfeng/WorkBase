import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }
export function Button({ variant = 'secondary', loading = false, children, disabled, className = '', ...props }: Props) {
  return <button {...props} disabled={disabled || loading} aria-busy={loading} className={`button ${variant} ${className}`}>{loading && <Spinner />}{children}</button>
}
