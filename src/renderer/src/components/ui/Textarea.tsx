import type { TextareaHTMLAttributes } from 'react'
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input textarea ${props.className || ''}`} /> }
