export const MEMORY_PAGE_SIZE = 30
export const MEMORY_MAX_IMAGES = 9
export const MEMORY_MAX_IMAGE_BYTES = 12 * 1024 * 1024
export const MEMORY_MAX_CONTENT_LENGTH = 20_000
export const MEMORY_IMAGE_NAME = /^[0-9a-f-]{36}\.(?:png|jpg|webp|gif|avif)$/

export interface MemoryEntry {
  id: string
  date: string
  time: string | null
  content: string
  imageFiles: string[]
}

export interface MemoryInput {
  id?: string
  date: string
  time: string | null
  content: string
  keepImages: string[]
  images: ArrayBuffer[]
}

export interface MemoryPage {
  items: MemoryEntry[]
  total: number
  page: number
  year: string | null
  years: { year: string; count: number }[]

  /** 本次请求使用的搜索关键字。 */
  query: string
  /** 全库照片总数与有记录的日期数，用于页面统计条，不随筛选变化。 */
  photos: number
  days: number
}
