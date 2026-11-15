interface Props { label?: string }

/** 生成中的骨架占位：形状贴近最终版面（标题 / 导语 / 正文 / 摘要），
    直接写文章与参考爆款两种模式共用；复用全局 .skeleton 的 shimmer。 */
export function WritingSkeleton({ label = '正在生成文章草稿' }: Props) {
  return (
    <div className="article-writing-skeleton" role="status" aria-label={label}>
      <div className="skeleton article-writing-sk-title" />
      <div className="skeleton article-writing-sk-lead" />
      <div className="skeleton article-writing-sk-body" />
      <div className="skeleton article-writing-sk-summary" />
    </div>
  )
}
