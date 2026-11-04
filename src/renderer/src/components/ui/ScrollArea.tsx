import type { HTMLAttributes } from 'react'
export function ScrollArea(props: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`scroll-area ${props.className || ''}`} /> }
