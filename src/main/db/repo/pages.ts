import type { PageTimeStats } from '@shared/types'
import { getDatabase } from '../index'
import { dayKey } from './activity'

/** 前端切页/失焦/隐藏时结算的一段停留时长，按本地自然日 upsert 累加。 */
export function addPageTime(page: string, seconds: number, now: number): void {
  getDatabase().prepare(`
    INSERT INTO page_time(page, day, seconds) VALUES (?, ?, ?)
    ON CONFLICT(page, day) DO UPDATE SET seconds = seconds + excluded.seconds
  `).run(page, dayKey(new Date(now)), seconds)
}

/** 指定年份的页面停留排行与月度趋势，聚合在仓储层完成。 */
export function pageTimeStats(year: number): PageTimeStats {
  const db = getDatabase()
  const first = `${year}-01-01`
  const last = `${year + 1}-01-01`
  const pages = db.prepare(`
    SELECT page, SUM(seconds) AS seconds FROM page_time
    WHERE day >= ? AND day < ? GROUP BY page ORDER BY seconds DESC
  `).all(first, last) as PageTimeStats['pages']
  const months = db.prepare(`
    SELECT substr(day, 6, 2) AS month, SUM(seconds) AS seconds FROM page_time
    WHERE day >= ? AND day < ? GROUP BY month ORDER BY month
  `).all(first, last) as PageTimeStats['months']
  return { year, pages, months }
}
