import { useEffect, useState } from 'react'
import type { IeltsItem, IeltsReading, IeltsSet } from '@shared/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { humanError } from '../../lib/utils'
import { CardAnswer } from './ReviewCard'

interface Props {
  pack: IeltsSet
  revealed: boolean
  onReveal(revealed: boolean): void
  onReview(items: IeltsItem[]): void
}

export function ReadingPack({ pack, revealed, onReveal, onReview }: Props) {
  const [material, setMaterial] = useState<{ reading: IeltsReading; words: IeltsItem[] } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([window.api.ielts.reading(pack.id), window.api.ielts.items(pack.id)])
      .then(([reading, words]) => {
        if (!active) return
        if (reading) setMaterial({ reading, words })
        else setError('这份精读内容已不存在。')
      })
      .catch(cause => { if (active) setError(humanError(cause)) })
    return () => { active = false }
  }, [pack.id, attempt])

  if (error) return <Alert tone="danger" title="无法打开精读包"
    action={<Button onClick={() => { setError(''); setAttempt(value => value + 1) }}>重新加载</Button>}>
    {error}
  </Alert>
  if (!material) return <p role="status" className="muted">正在打开精读包…</p>

  const { reading, words } = material
  return <article className="ielts-reading" aria-label={pack.title}>
    <section className="ielts-reading-section">
      <h2>{pack.title}</h2>
      <p className="ielts-reading-instruction">先读一遍，不查词，只抓大意。</p>
      <div className="ielts-reading-passage" lang="en">
        {reading.passage.split(/\r?\n\s*\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      <Button type="button" variant={revealed ? 'secondary' : 'primary'} aria-expanded={revealed}
        onClick={() => onReveal(!revealed)}>
        {revealed ? '收起解析' : '查看大意'}
      </Button>
    </section>

    {revealed && <>
      <section className="ielts-reading-section">
        <h3>中文大意</h3>
        <p>{reading.summary}</p>
      </section>
      <section className="ielts-reading-section">
        <div className="ielts-reading-heading">
          <h3>重点生词</h3>
          <Button type="button" onClick={() => onReview(words)}>复习本包词卡</Button>
        </div>
        <div className="ielts-reading-words">
          {words.map(item => <details key={item.id} className="ielts-reading-word">
            <summary><span lang="en">{item.term}</span></summary>
            <CardAnswer item={item} />
          </details>)}
        </div>
      </section>
      <section className="ielts-reading-section">
        <h3>长难句拆解</h3>
        {reading.sentences.map((sentence, index) => <article className="ielts-reading-sentence" key={index}>
          <h4 lang="en">{sentence.original}</h4>
          <ul>{sentence.structure.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul>
          <dl className="ielts-reading-examples">
            <div><dt>翻译</dt><dd>{sentence.translation}</dd></div>
            <div>
              <dt>仿写</dt>
              <dd><span lang="en">{sentence.imitation}</span><span>{sentence.imitationTranslation}</span></dd>
            </div>
          </dl>
        </article>)}
      </section>
      <section className="ielts-reading-section">
        <h3>同义替换</h3>
        <dl className="ielts-reading-substitutions" lang="en">
          {reading.substitutions.map((pair, index) => <div key={index}>
            <dt>{pair.original}</dt><dd><span aria-hidden="true">→ </span>{pair.replacement}</dd>
          </div>)}
        </dl>
      </section>
      <section className="ielts-reading-section">
        <h3>雅思写作常用句型</h3>
        <ul className="ielts-reading-patterns" lang="en">{reading.patterns.map((pattern, index) => <li key={index}>{pattern}</li>)}</ul>
      </section>
    </>}
  </article>
}
