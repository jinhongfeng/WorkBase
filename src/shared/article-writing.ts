export const articleCategories = {
  humanities: '人文',
  science: '科学',
  history: '历史'
} as const

export type ArticleCategory = keyof typeof articleCategories

export interface ArticleGenerateInput {
  category: ArticleCategory
  topic: string
}

export interface ArticleDraft {
  title: string
  lead: string
  body: string
  summary: string
  factChecks: string[]
}
