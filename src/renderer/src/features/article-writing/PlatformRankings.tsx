import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { articleCategories } from '@shared/article-writing'
import { REFERENCE_LIMIT, rankingPlatformIds, rankingPlatforms, type RankingQuery } from '@shared/article-references'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { rankedSource, rankingKey, useReferenceWorkspace } from './reference-workspace'

const number = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const timestamp = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const PAGE_SIZE = 10
const categories = Object.keys(articleCategories) as (keyof typeof articleCategories)[]

function RankingList({ query, onReferenceAdded }: { query: RankingQuery; onReferenceAdded(): void }) {
  const key = rankingKey(query)
  const ranking = useReferenceWorkspace(state => state.rankings[key])
  const { sources, pending, discover, addSource } = useReferenceWorkspace()
  const [shown, setShown] = useState(PAGE_SIZE)
  const { name, board, url } = rankingPlatforms[query.platform]
  const category = query.platform === 'bilibili' && query.category !== 'all' ? query.category : undefined
  const boardName = query.platform === 'bilibili' ? (category ? `知识区排行榜 · ${articleCategories[category]}` : '全站排行榜') : board
  const boardUrl = category ? 'https://www.bilibili.com/v/popular/rank/36' : url
  const data = ranking?.data
  const full = sources.length >= REFERENCE_LIMIT

  useEffect(() => {
    if (!useReferenceWorkspace.getState().rankings[key]) void discover(query)
  }, [discover, key, query])

  return <section className="reference-stack" aria-labelledby="platform-board-title" aria-busy={ranking?.loading}>
    <div className="reference-inline reference-board-heading">
      <div>
        <h2 id="platform-board-title">{name}{boardName}</h2>
        {data && <p className="muted reference-meta">获取于 {timestamp.format(data.fetchedAt)}</p>}
      </div>
      <div className="reference-inline">
        <a className="reference-link reference-meta" href={boardUrl} target="_blank" rel="noreferrer">平台原榜<ArrowUpRight size={13} aria-hidden="true" /></a>
        <Button type="button" loading={ranking?.loading} onClick={() => void discover(query)}>
          {!ranking?.loading && <RefreshCw size={14} aria-hidden="true" />}{ranking?.loading ? '正在读取' : '刷新榜单'}
        </Button>
      </div>
    </div>
    {ranking?.error && <Alert tone="danger">{ranking.error}{data && ' 下方保留上次获取的结果。'}</Alert>}
    {!data && !ranking?.error && <p className="muted reference-meta" role="status">正在获取{name}榜单…</p>}
    {data && (data.items.length ? <>
      <ol className="reference-ranking" aria-label={`${name}${boardName}`}>
        {data.items.slice(0, shown).map(item => {
          const added = sources.some(source => source.id === item.id)
          const meta = [item.creator, item.section, ...item.metrics.map(({ label, value }) => `${typeof value === 'number' ? number.format(value) : value} ${label}`)].filter(Boolean).join(' · ')
          return <li key={item.id}>
            <span className="reference-rank" aria-label={`榜单第 ${item.rank} 名`}>{item.rank}</span>
            <div className="reference-ranking-copy">
              <a className="reference-link" href={item.url} target="_blank" rel="noreferrer">{item.title}<ArrowUpRight size={13} aria-hidden="true" /></a>
              {meta && <p className="muted reference-meta">{meta}</p>}
            </div>
            <Button type="button" disabled={!!pending || full || added} aria-label={`${added ? '已选' : '参考'} ${item.title}`}
              onClick={() => { addSource(rankedSource(item, query.platform)); onReferenceAdded() }}>{added ? '已选' : '参考'}</Button>
          </li>
        })}
      </ol>
      {shown < data.items.length && <Button type="button" variant="ghost" onClick={() => setShown(shown + PAGE_SIZE)}>显示更多</Button>}
    </> : <p className="muted" role="status">{category ? '该领域暂无上榜作品，可以切换全站榜。' : '当前暂无榜单条目，可以稍后刷新。'}</p>)}
  </section>
}

export function PlatformRankings({ onReferenceAdded }: { onReferenceAdded(): void }) {
  const { rankingCategory, platform, bilibiliBoard, setPlatform, setBilibiliBoard, setRankingCategory } = useReferenceWorkspace()
  const boardCategory = platform === 'bilibili' ? (bilibiliBoard === 'knowledge' ? rankingCategory : 'all') : undefined
  const query = useMemo<RankingQuery>(() => ({ platform, category: boardCategory }), [platform, boardCategory])

  return <div className="reference-stack">
    <div className="segmented reference-platforms" role="group" aria-label="榜单平台">
      {rankingPlatformIds.map(id => <button key={id} type="button" aria-pressed={platform === id} onClick={() => setPlatform(id)}>{rankingPlatforms[id].name}</button>)}
    </div>
    {platform === 'bilibili' && <div className="reference-inline">
      <div className="segmented reference-platforms" role="group" aria-label="B 站榜单范围">
        <button type="button" aria-pressed={bilibiliBoard === 'all'} onClick={() => setBilibiliBoard('all')}>全站</button>
        <button type="button" aria-pressed={bilibiliBoard === 'knowledge'} onClick={() => setBilibiliBoard('knowledge')}>知识区</button>
      </div>
      {bilibiliBoard === 'knowledge' && <div className="segmented reference-platforms" role="group" aria-label="知识区榜单领域">
        {categories.map(category => <button key={category} type="button" aria-pressed={rankingCategory === category}
          onClick={() => setRankingCategory(category)}>{articleCategories[category]}</button>)}
      </div>}
    </div>}
    <RankingList key={rankingKey(query)} query={query} onReferenceAdded={onReferenceAdded} />
  </div>
}
