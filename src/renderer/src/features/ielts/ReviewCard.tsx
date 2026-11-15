import { Check, Volume2, X } from 'lucide-react'
import type { IeltsItem } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Meter } from '../../components/ui/Meter'
import './ielts.css'

export function buildReviewQueue(items: IeltsItem[]): IeltsItem[] {
  return [...items].sort((a, b) => a.reviewAt - b.reviewAt).slice(0, 20)
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.92
  window.speechSynthesis.speak(utterance)
}

export function CardAnswer({ item }: { item: IeltsItem }) {
  return <span className="ielts-card-answer">
    {(item.phonetic || (item.pos && item.kind === 'word')) && <span className="ielts-card-pronunciation">
      {item.phonetic && <span className="word-phonetic">{item.phonetic}</span>}
      {item.pos && item.kind === 'word' && <span>{item.pos}</span>}
    </span>}
    <span className="word-meaning">{item.meaning}</span>
    {item.wordFamily && <span className="small"><strong>词族</strong> {item.wordFamily}</span>}
    {item.example && <span className="word-example" lang="en">{item.example}</span>}
    {item.translation && <span className="small muted">{item.translation}</span>}
    {item.collocation && <span className="small"><strong>{item.kind === 'word' ? '搭配' : '可替换表达'}</strong> <span lang="en">{item.collocation}</span></span>}
  </span>
}

interface Props {
  item: IeltsItem
  position: number
  total: number
  flipped: boolean
  busy?: boolean
  onFlip(): void
  onReview(known: boolean): void
}

export function ReviewCard({ item, position, total, flipped, busy = false, onFlip, onReview }: Props) {
  return <div className="ielts-review-card">
    <Meter label="复习进度" value={position} max={total} readout={`${position} / ${total}`}
      valueText={`第 ${position} 条，共 ${total} 条`} />
    <button type="button" className="flashcard" onClick={onFlip} aria-expanded={flipped}>
      <span className="fc-hint">{item.kind === 'word' ? '单词' : '高分句型'}</span>
      <span className="fc-term" lang="en">{item.term}</span>
      {flipped ? <CardAnswer item={item} /> : <span className="fc-hint">点击卡片查看释义</span>}
    </button>
    <div className="review-actions">
      <Button disabled={busy} onClick={() => onReview(false)}><X size={14} />不认识</Button>
      <Button variant="ghost" onClick={() => speak(item.term)}><Volume2 size={14} />发音</Button>
      <Button variant="primary" disabled={busy} onClick={() => onReview(true)}><Check size={14} />认识</Button>
    </div>
  </div>
}
