import type { HTMLAttributes } from 'react'

export type CardColumn = 'left' | 'right'

/** DOM 顺序决定卡片顺序；CSS 按尺寸与列归属放入等高网格。 */
export default function DashboardBoard(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />
}
