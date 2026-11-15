import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Languages } from 'lucide-react'
import type { IeltsItem } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { humanError } from '../../lib/utils'
import { useFocus } from '../../stores/focus'
import { useNavigation } from '../../stores/navigation'
import { EnglishArticles } from '../ielts/EnglishArticles'
import { buildReviewQueue, ReviewCard } from '../ielts/ReviewCard'
import { useStudyTime } from '../ielts/useStudyTime'

interface Round { title: string; queue: IeltsItem[] }

export function FocusEnglish({ setId, onBack }: { setId: string | null; onBack(): void }) {
  const [round, setRound] = useState<Round | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [view, setView] = useState<'review' | 'articles'>('review')
  const heading = useRef<HTMLHeadingElement>(null)
  const current = round?.queue[cursor]
  useStudyTime(view === 'review' && Boolean(current))

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const packs = setId ? await window.api.ielts.sets() : []
        const pack = packs.find(item => item.id === setId && item.itemCount > 0)
        const items = await window.api.ielts.items(pack?.id)
        if (active) setRound({ title: pack?.title ?? '全部学习包', queue: buildReviewQueue(items) })
      } catch (error) {
        if (active) setLoadError(humanError(error))
      }
    }
    void load()
    return () => { active = false }
  }, [setId, attempt])

  useEffect(() => {
    heading.current?.focus()
    return () => window.speechSynthesis?.cancel()
  }, [])

  function reload(): void {
    setRound(null)
    setCursor(0)
    setFlipped(false)
    setLoadError('')
    setAttempt(value => value + 1)
  }

  async function review(known: boolean): Promise<void> {
    if (!current || busy) return
    setBusy(true)
    setReviewError('')
    try {
      await window.api.ielts.review({ id: current.id, known })
      setFlipped(false)
      setCursor(value => value + 1)
    } catch (error) {
      setReviewError(humanError(error))
    } finally {
      setBusy(false)
    }
  }

  return <section className="focus-room-library focus-english" aria-label="学习英语">
    <header className="focus-room-library-head">
      <div className="focus-english-heading">
        <h1 ref={heading} tabIndex={-1}>学习英语</h1>
        {view === 'review' && round && <p className="muted small">{round.title}</p>}
      </div>
      <Button variant="ghost" onClick={onBack}><ArrowLeft size={16} />回到学习</Button>
    </header>
    <div className="segmented focus-english-tabs" role="group" aria-label="英语学习方式">
      <button type="button" aria-pressed={view === 'review'} onClick={() => setView('review')}>词句复习</button>
      <button type="button" aria-pressed={view === 'articles'} onClick={() => {
        window.speechSynthesis?.cancel()
        setView('articles')
      }}>报道阅读</button>
    </div>
    {view === 'articles' ? <EnglishArticles /> : loadError ? <div className="focus-room-empty">
      <p role="alert">无法读取英语学习内容。{loadError}</p>
      <Button onClick={reload}>重试</Button>
    </div> : !round ? <p className="focus-room-empty" role="status">正在读取学习内容…</p>
      : current ? <div className="focus-english-review">
        <ReviewCard item={current} position={cursor + 1} total={round.queue.length} flipped={flipped} busy={busy}
          onFlip={() => setFlipped(value => !value)} onReview={known => void review(known)} />
        {reviewError && <p className="focus-english-error" role="alert">无法保存这条复习结果。{reviewError}</p>}
      </div> : round.queue.length ? <div className="focus-room-empty">
        <p role="status">这一轮复习完成，共 {round.queue.length} 条。</p>
        <Button onClick={reload}>再来一轮</Button>
      </div> : <div className="focus-room-empty">
        <Languages size={24} aria-hidden="true" />
        <p>还没有词句可复习，可以先在「英语」生成学习包。</p>
        <Button onClick={() => {
          useNavigation.getState().navigate('/ielts')
          useFocus.getState().leave()
        }}>前往英语页</Button>
      </div>}
  </section>
}
