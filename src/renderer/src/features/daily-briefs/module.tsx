import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronRight, Newspaper, RefreshCw, Trash2 } from 'lucide-react'
import { DAILY_BRIEF_SITE, type DailyBriefStatus } from '@shared/daily-briefs'
import { Alert } from '../../components/ui/Alert'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Spinner } from '../../components/ui/Spinner'
import { formatDate, humanError } from '../../lib/utils'
import { defineModule } from '../../modules/defineModule'
import './daily-briefs.css'

function DailyBriefsPage() {
  const [status, setStatus] = useState<DailyBriefStatus | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [deletingDate, setDeletingDate] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const next = await window.api.dailyBriefs.list()
        if (active) {
          setStatus(next)
          setReadError(null)
        }
      } catch (error) {
        if (active) setReadError(humanError(error))
      }
    }
    const unsubscribe = window.api.dailyBriefs.onChanged(() => { void load() })
    void load()
    return () => { active = false; unsubscribe() }
  }, [])

  const refresh = (): void => {
    void window.api.dailyBriefs.refresh().catch(error => window.toast.error(humanError(error)))
  }

  async function remove(): Promise<void> {
    if (!deletingDate || removing) return
    setRemoving(true)
    try {
      await window.api.dailyBriefs.remove(deletingDate)
      setDeletingDate(null)
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setRemoving(false)
    }
  }

  const items = status?.items ?? []
  const lastSyncedAt = status?.lastSyncedAt
  const error = readError ?? status?.error
  const loading = !error && (!status || (status.syncing && items.length === 0))

  return (
    <div className="page daily-briefs-page">
      <PageHeader title="每日简报" actions={(
        <button type="button" className="button primary" disabled={status?.syncing} onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />{status?.syncing ? '正在刷新' : '立即刷新'}
        </button>
      )} />
      <div className="daily-briefs-source">
        <span role="status">
          {lastSyncedAt != null ? `上次同步 ${formatDate(lastSyncedAt, 'yyyy-MM-dd HH:mm')}` : '来源 · AI Hot 中文版'}
        </span>
        <a className="button ghost sm" href={DAILY_BRIEF_SITE} target="_blank" rel="noreferrer">
          打开 AI Hot 中文简报 <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      {error && <Alert tone="danger" title="简报暂未更新">{error}</Alert>}
      {loading ? <div className="page-loading"><Spinner /></div> : items.length === 0 ? (
        <EmptyState icon={Newspaper} title="暂无已保存的简报" description="有新简报时会自动保存到这里。" />
      ) : (
        <section className="daily-briefs-list" aria-label="简报列表">
          {items.map(item => {
            const syncedDate = formatDate(item.syncedAt, 'yyyy-MM-dd')
            return (
              <article className="card daily-brief" key={item.date}>
                <details className="daily-brief-edition">
                  <summary className="daily-brief-summary">
                    <ChevronRight size={16} aria-hidden="true" />
                    <span className="daily-brief-summary-labels">
                      <span className="daily-brief-issue"><time dateTime={item.date}>{item.date}</time> 期</span>
                      <span className="daily-brief-synced">最近获取 <time dateTime={syncedDate}>{syncedDate}</time></span>
                    </span>
                  </summary>
                  <div className="card-body">
                    <h2>{item.stories.length ? '中文要闻' : '简报存档'}</h2>
                    {item.stories.length > 0 && (
                      <ul className="daily-brief-stories">
                        {item.stories.map(story => (
                          <li key={story.url}>
                            <h3>
                              <a href={story.url} target="_blank" rel="noreferrer">
                                {story.title} <ArrowUpRight size={14} aria-hidden="true" />
                              </a>
                            </h3>
                            <p>{story.summary}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="daily-brief-original">
                      <summary>原始 RSS 摘要（英文）</summary>
                      <div lang="en">
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                      </div>
                    </details>
                  </div>
                </details>
                <button type="button" className="icon-action danger daily-brief-delete" title="删除这期简报"
                  aria-label={`删除 ${item.date} 期简报`} onClick={() => setDeletingDate(item.date)}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </article>
            )
          })}
        </section>
      )}
      <ConfirmDialog open={deletingDate !== null} title={`删除 ${deletingDate ?? ''} 期简报？`}
        description="这期的要闻和摘要会从本地删除。以后同步时会跳过这期。"
        confirmLabel="删除简报" loading={removing}
        onClose={() => { if (!removing) setDeletingDate(null) }} onConfirm={() => void remove()} />
    </div>
  )
}

export default defineModule({
  id: 'daily-briefs',
  name: '每日简报',
  group: '外部数据',
  icon: Newspaper,
  order: 49,
  keywords: ['AI 每日简报', 'AI每日简报', 'AI Hot', 'RSS', '新闻', '资讯', '日报'],
  page: DailyBriefsPage
})
