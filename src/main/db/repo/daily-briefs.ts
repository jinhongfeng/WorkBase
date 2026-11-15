import type { DailyBrief, DailyBriefStatus, DailyBriefStory, SavedDailyBrief } from '@shared/daily-briefs'
import { getDatabase } from '../index'

export function readDailyBriefs(): Pick<DailyBriefStatus, 'items' | 'lastSyncedAt'> {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT issue_date AS date, title, summary, stories, synced_at AS syncedAt
    FROM daily_briefs ORDER BY issue_date DESC
  `).all() as (Omit<SavedDailyBrief, 'stories'> & { stories: string | null })[]
  const items = rows.map(({ stories, ...item }) => ({
    ...item, stories: stories ? JSON.parse(stories) as DailyBriefStory[] : []
  }))
  const { lastSyncedAt } = db.prepare(`
    SELECT MAX(synced_at) AS lastSyncedAt FROM (
      SELECT MAX(synced_at) AS synced_at FROM daily_briefs
      UNION ALL
      SELECT MAX(synced_at) FROM daily_brief_dismissals
    )
  `).get() as { lastSyncedAt: number | null }
  return { items, lastSyncedAt }
}

export function saveDailyBriefs(items: DailyBrief[]): void {
  const db = getDatabase()
  const upsert = db.prepare(`
    INSERT INTO daily_briefs (issue_date, title, summary, synced_at, stories)
    VALUES (@date, @title, @summary, @syncedAt, @stories)
    ON CONFLICT(issue_date) DO UPDATE SET
      title = excluded.title, summary = excluded.summary, synced_at = excluded.synced_at,
      stories = COALESCE(excluded.stories, daily_briefs.stories)
  `)
  const markDismissedSynced = db.prepare('UPDATE daily_brief_dismissals SET synced_at = ? WHERE issue_date = ?')
  const syncedAt = Date.now()
  db.transaction(() => {
    for (const item of items) {
      if (markDismissedSynced.run(syncedAt, item.date).changes) continue
      upsert.run({ ...item, syncedAt, stories: item.stories.length ? JSON.stringify(item.stories) : null })
    }
  })()
}

export function removeDailyBrief(date: string): void {
  const db = getDatabase()
  db.transaction(() => {
    db.prepare(`
      INSERT INTO daily_brief_dismissals (issue_date, synced_at)
      SELECT issue_date, synced_at FROM daily_briefs WHERE issue_date = ?
    `).run(date)
    db.prepare('DELETE FROM daily_briefs WHERE issue_date = ?').run(date)
  })()
}
