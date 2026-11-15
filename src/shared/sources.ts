export const SOURCE_MAX_NAME = 60
export const SOURCE_MAX_URL = 2_000
export const SOURCE_MAX_SUMMARY = 1_200
export const SOURCE_MAX_ENTRIES_PER_FEED = 200
export const SOURCE_ENTRY_PAGE_SIZE = 50

export interface Source {
  id: string
  name: string
  url: string
  enabled: number
  lastFetchAt: number | null
  lastError: string | null
  unread: number
  createdAt: number
}

export interface SourceEntry {
  id: string
  sourceId: string
  guid: string
  title: string
  link: string
  publishedAt: number | null
  summary: string
  coverUrl: string | null
  fetchedAt: number
  read: number
}

export interface SourceEntryPage {
  items: SourceEntry[]
  total: number
  offset: number
}

export interface SourceRefreshResult {
  sourceId: string
  name: string
  ok: boolean
  added: number
  error: string | null
}

export interface SourcesAPI {
  list(): Promise<Source[]>
  entries(input: { sourceId: string; q?: string; unreadOnly?: boolean; page: number }): Promise<SourceEntryPage>
  add(input: { name: string; url: string }): Promise<Source[]>
  update(input: { id: string; name?: string; enabled?: boolean }): Promise<Source[]>
  remove(id: string): Promise<Source[]>
  refresh(id: string | null): Promise<{ results: SourceRefreshResult[] }>
  setRead(input: { id: string; read: boolean }): Promise<void>
  readEntry(input: { id: string; download?: boolean }): Promise<string | null>
  openEntry(id: string): Promise<void>
}
