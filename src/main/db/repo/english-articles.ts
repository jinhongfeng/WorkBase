import type { EnglishArticle, EnglishArticleImage, EnglishArticleSummary } from '@shared/english-articles'
import { getDatabase } from '../index'

export function listEnglishArticles(): EnglishArticleSummary[] {
  return getDatabase().prepare(`
    SELECT id, title, url, published_at AS publishedAt
    FROM english_articles ORDER BY saved_at DESC, id DESC
  `).all() as EnglishArticleSummary[]
}

export function getEnglishArticle(id: string): EnglishArticle | null {
  const row = getDatabase().prepare(`
    SELECT id, title, url, published_at AS publishedAt, paragraphs, images
    FROM english_articles WHERE id = ?
  `).get(id) as (EnglishArticleSummary & { paragraphs: string; images: string | null }) | undefined
  return row ? {
    ...row,
    paragraphs: JSON.parse(row.paragraphs) as string[],
    images: row.images === null ? null : JSON.parse(row.images) as EnglishArticleImage[]
  } : null
}

export function saveEnglishArticle(article: EnglishArticle): void {
  getDatabase().prepare(`
    INSERT INTO english_articles (id, title, url, published_at, paragraphs, images, saved_at)
    VALUES (@id, @title, @url, @publishedAt, @paragraphs, @images, @savedAt)
    ON CONFLICT(id) DO NOTHING
  `).run({ ...article, paragraphs: JSON.stringify(article.paragraphs), images: serializeImages(article.images), savedAt: Date.now() })
}

function serializeImages(images: EnglishArticle['images']): string | null {
  return images === null ? null : JSON.stringify(images)
}

export function updateEnglishArticleImages(article: EnglishArticle): void {
  // Paragraph positions belong to the same source snapshot. Leave the saved timestamp intact.
  getDatabase().prepare(`
    UPDATE english_articles
    SET title = @title, url = @url, published_at = @publishedAt, paragraphs = @paragraphs, images = @images
    WHERE id = @id AND images IS NULL
  `).run({ ...article, paragraphs: JSON.stringify(article.paragraphs), images: serializeImages(article.images) })
}

export function removeEnglishArticle(id: string): void {
  getDatabase().prepare('DELETE FROM english_articles WHERE id = ?').run(id)
}
