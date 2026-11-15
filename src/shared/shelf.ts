export type ShelfKind = 'book' | 'movie' | 'tv'
export type ShelfStatus = 'wish' | 'doing' | 'done'

export const SHELF_COVER_NAME = /^[0-9a-f-]{36}\.(?:png|jpg|webp|gif|avif)$/
export const SHELF_MAX_COVER_BYTES = 12 * 1024 * 1024
export const SHELF_MAX_TITLE = 120
export const SHELF_MAX_CREATOR = 80
export const SHELF_MAX_COMMENT = 2_000
export const SHELF_LIMIT = 500

export interface ShelfItem {
  id: string
  kind: ShelfKind
  title: string
  creator: string
  status: ShelfStatus
  rating: number | null
  comment: string
  coverUrl: string | null
  startDate: string | null
  finishDate: string | null
  createdAt: number
  updatedAt: number
}

export interface ShelfInput {
  id?: string
  kind: ShelfKind
  title: string
  creator?: string
  status: ShelfStatus
  rating?: number | null
  comment?: string
  startDate?: string | null
  finishDate?: string | null
  /** 本条保留的旧封面文件名；null 表示移除封面。 */
  keepCover: string | null
  /** 本次新增的封面图片字节。 */
  cover?: ArrayBuffer
}

export interface ShelfQuery {
  kind?: ShelfKind | 'all'
  status?: ShelfStatus | 'all'
  q?: string
}

export interface ShelfStats {
  total: number
  wish: number
  doing: number
  done: number
}
