interface Props {
  /** 0 基页码。 */
  page: number
  pages: number
  onChange: (page: number) => void
  /** 左侧说明，如「共 128 笔 · 每页 50 笔」。 */
  info?: string
  disabled?: boolean
}

/** 统一分页：上一页/下一页 + 页码窗口，首末页常驻（借鉴 heroui Pagination）。 */
export function Pager({ page, pages, onChange, info, disabled }: Props) {
  const total = Math.max(1, pages)
  const window = new Set<number>([0, total - 1, page - 1, page, page + 1])
  const visible = [...window].filter(index => index >= 0 && index < total).sort((a, b) => a - b)
  return (
    <nav className="pager" aria-label="分页">
      {info && <span className="pager-info">{info}</span>}
      <button type="button" disabled={disabled || page <= 0} onClick={() => onChange(page - 1)}>上一页</button>
      {visible.map((index, position) => {
        const previous = visible[position - 1]
        return (
          <span key={index} className="pager-slot">
            {previous !== undefined && index - previous > 1 && <span className="pager-gap" aria-hidden="true">…</span>}
            <button
              type="button"
              aria-current={index === page ? 'page' : undefined}
              aria-label={`第 ${index + 1} 页`}
              disabled={disabled}
              onClick={() => onChange(index)}
            >{index + 1}</button>
          </span>
        )
      })}
      <button type="button" disabled={disabled || page >= total - 1} onClick={() => onChange(page + 1)}>下一页</button>
    </nav>
  )
}
