export const ENGLISH_ARTICLE_SOURCE = 'VOA Learning English'
export const ENGLISH_ARTICLE_TOPICS = ['general', 'science', 'health'] as const
export type EnglishArticleTopic = (typeof ENGLISH_ARTICLE_TOPICS)[number]
export const ENGLISH_ARTICLE_IMAGE_MIME = {
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'
} as const
export const ENGLISH_ARTICLE_IMAGE_LIMIT = 8
export const ENGLISH_ARTICLE_IMAGE_MAX_BYTES = 1024 * 1024

export interface EnglishArticleImage {
  beforeParagraph: number
  alt: string
  caption: string
  mime: (typeof ENGLISH_ARTICLE_IMAGE_MIME)[keyof typeof ENGLISH_ARTICLE_IMAGE_MIME]
  base64: string
}

export interface EnglishArticleSummary {
  id: string
  title: string
  url: string
  publishedAt: number | null
}

export interface EnglishArticle extends EnglishArticleSummary {
  paragraphs: string[]
  /** null indicates an older text-only copy or a failed image download. */
  images: EnglishArticleImage[] | null
}
