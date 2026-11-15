import { BrowserWindow, Notification, app } from 'electron'
import { join } from 'node:path'
import { listHabits } from '../db/repo/growth'
import { listMemoriesByDayOfYear } from '../db/repo/memories'
import { getAllSettings } from '../db/repo/settings'
import { todoStats } from '../db/repo/todos'
import { isCaptureWindow } from '../quick-capture'
import { logMain } from '../log'

const HABIT_REMINDER_START = 20 // 晚间习惯提醒窗口起点（含）
const HABIT_REMINDER_END = 22  // 窗口终点（不含）

function todayKey(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function notify(title: string, body: string): void {
  try {
    const notification = new Notification({ title, body, icon: join(app.getAppPath(), 'resources/icon.ico') })
    notification.on('click', () => {
      const window = BrowserWindow.getAllWindows().find(item => !isCaptureWindow(item))
      if (window) {
        window.show()
        window.focus()
      }
    })
    notification.show()
  } catch (error) {
    logMain(`Notification failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function settingEnabled(settings: Record<string, string>, key: string): boolean {
  return settings[key] !== '0'
}

/** 每分钟巡检一次的本地提醒：待办到期、习惯晚间未打卡、纪念日，均为本地系统通知。 */
function checkOnce(sentDates: { todos: string; habits: string; memories: string }): void {
  const settings = getAllSettings()
  const today = todayKey()
  const now = new Date()

  if (settingEnabled(settings, 'notify.todos') && sentDates.todos !== today) {
    sentDates.todos = today
    const stats = todoStats()
    if (stats.dueToday > 0 || stats.overdue > 0) {
      const parts: string[] = []
      if (stats.dueToday > 0) parts.push(`今日到期 ${stats.dueToday} 项`)
      if (stats.overdue > 0) parts.push(`已逾期 ${stats.overdue} 项`)
      notify('待办提醒', `${parts.join('，')}，打开 WorkBase 查看。`)
    }
  }

  if (settingEnabled(settings, 'notify.habits') && sentDates.habits !== today
    && now.getHours() >= HABIT_REMINDER_START && now.getHours() < HABIT_REMINDER_END) {
    sentDates.habits = today
    const habits = listHabits()
    const pending = habits.filter(habit => habit.doneToday < habit.target)
    if (habits.length > 0 && pending.length > 0) {
      notify('习惯提醒', `还有 ${pending.length} 个习惯今日未完成：${pending.slice(0, 3).map(habit => habit.name).join('、')}${pending.length > 3 ? ' 等' : ''}。`)
    }
  }

  if (settingEnabled(settings, 'notify.memories') && sentDates.memories !== today) {
    sentDates.memories = today
    const monthDay = today.slice(5)
    const rows = listMemoriesByDayOfYear(monthDay)
    if (rows.length > 0) {
      const body = rows.slice(0, 3)
        .map(row => `${row.date.slice(0, 4)} 年 · ${row.content.length > 40 ? `${row.content.slice(0, 40)}…` : row.content}`)
        .join('\n')
      notify('纪念日提醒', body)
    }
  }
}

/** 应用就绪后启动巡检；日期切换后按当日去重，每类提醒一天最多一次。 */
export function setupNotifications(): void {
  const sentDates = { todos: '', habits: '', memories: '' }
  const tick = (): void => { try { checkOnce(sentDates) } catch (error) { logMain(`Notification check failed: ${error instanceof Error ? error.message : String(error)}`) } }
  tick()
  setInterval(tick, 60_000)
}
