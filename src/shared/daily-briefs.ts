export const DAILY_BRIEF_SITE = 'https://aihot.tech/zh/daily/'

export interface DailyBriefStory {
  title: string
  summary: string
  url: string
}

export interface DailyBrief {
  date: string
  title: string
  summary: string
  stories: DailyBriefStory[]
}

export interface SavedDailyBrief extends DailyBrief {
  syncedAt: number
}

export interface DailyBriefStatus {
  items: SavedDailyBrief[]
  lastSyncedAt: number | null
  syncing: boolean
  error: string | null
}
