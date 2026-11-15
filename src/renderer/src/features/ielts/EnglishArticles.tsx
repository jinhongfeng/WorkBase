import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Download, ExternalLink, Trash2 } from 'lucide-react'
import {
  ENGLISH_ARTICLE_SOURCE, ENGLISH_ARTICLE_TOPICS,
  type EnglishArticle, type EnglishArticleImage, type EnglishArticleSummary, type EnglishArticleTopic
} from '@shared/english-articles'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Select'
import { humanError } from '../../lib/utils'
import { useStudyTime } from './useStudyTime'
import './english-articles.css'

const TOPIC_LABELS: Record<EnglishArticleTopic, string> = { general: '综合报道', science: '科学与技术', health: '健康与生活' }
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'UTC' })

function Source({ publishedAt }: { publishedAt: number | null }) {
  return <span className="english-article-source">
    {ENGLISH_ARTICLE_SOURCE}{publishedAt !== null && <> · <time dateTime={new Date(publishedAt).toISOString()}>{dateFormat.format(publishedAt)}</time></>}
  </span>
}

function ArticleImage({ image }: { image: EnglishArticleImage }) {
  return <figure className="english-article-image">
    <img src={`data:${image.mime};base64,${image.base64}`} alt={image.alt === image.caption ? '' : image.alt} />
    {image.caption && <figcaption>{image.caption}</figcaption>}
  </figure>
}

export function EnglishArticles() {
  const [view, setView] = useState<'saved' | 'online'>('saved')
  const [topic, setTopic] = useState<EnglishArticleTopic>('general')
  const [saved, setSaved] = useState<EnglishArticleSummary[]>([])
  const [online, setOnline] = useState<EnglishArticleSummary[] | null>(null)
  const [article, setArticle] = useState<EnglishArticle | null>(null)
  const [link, setLink] = useState('')
  const [deleting, setDeleting] = useState<EnglishArticleSummary | null>(null)
  const [busy, setBusy] = useState<'list' | 'discover' | 'open' | 'save' | 'images' | 'delete' | null>('list')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const isSaved = saved.some(item => item.id === article?.id)
  useStudyTime(Boolean(article))

  useEffect(() => {
    let active = true
    void window.api.englishArticles.list().then(items => {
      if (active) setSaved(items)
    }).catch(reason => {
      if (active) setError(humanError(reason))
    }).finally(() => {
      if (active) setBusy(null)
    })
    return () => { active = false }
  }, [attempt])

  useEffect(() => { if (article) heading.current?.focus() }, [article])

  async function discover(): Promise<void> {
    setBusy('discover')
    setError('')
    try { setOnline(await window.api.englishArticles.discover(topic)) }
    catch (reason) { setError(humanError(reason)) }
    finally { setBusy(null) }
  }

  async function openArticle(url: string, id?: string): Promise<void> {
    setBusy('open')
    setError('')
    try {
      const item = id && saved.some(item => item.id === id)
        ? await window.api.englishArticles.get(id)
        : await window.api.englishArticles.fetch(url)
      if (!item) throw new Error('这篇本地报道已找不到，请重新获取。')
      setArticle(item)
    } catch (reason) { setError(humanError(reason)) }
    finally { setBusy(null) }
  }

  async function refreshImages(): Promise<void> {
    if (!article) return
    setBusy('images')
    setError('')
    try {
      const updated = isSaved ? await window.api.englishArticles.refreshImages(article.id) : await window.api.englishArticles.fetch(article.url)
      if (updated.images === null) throw new Error('暂时无法获取原文图片，请稍后重试。')
      setArticle(updated)
      if (isSaved) {
        const { id, title, url, publishedAt } = updated
        setSaved(items => items.map(item => item.id === id ? { id, title, url, publishedAt } : item))
      }
    } catch (reason) { setError(humanError(reason)) }
    finally { setBusy(null) }
  }

  async function saveArticle(): Promise<void> {
    if (!article) return
    setBusy('save')
    setError('')
    try {
      await window.api.englishArticles.save(article)
      const { id, title, url, publishedAt } = article
      setSaved(items => [{ id, title, url, publishedAt }, ...items.filter(item => item.id !== id)])
    } catch (reason) { setError(humanError(reason)) }
    finally { setBusy(null) }
  }

  function closeArticle(): void {
    setArticle(null)
    setError('')
    requestAnimationFrame(() => listHeading.current?.focus())
  }

  async function deleteArticle(): Promise<void> {
    if (!deleting) return
    setBusy('delete')
    setError('')
    try {
      await window.api.englishArticles.remove(deleting.id)
      setSaved(items => items.filter(item => item.id !== deleting.id))
      if (article?.id === deleting.id) closeArticle()
      setDeleting(null)
    } catch (reason) {
      setDeleting(null)
      setError(humanError(reason))
    } finally { setBusy(null) }
  }

  const items = view === 'saved' ? saved : online
  return <section className="english-articles" aria-label="报道阅读">
    {article ? <>
      <div className="english-article-toolbar">
        <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={closeArticle}><ArrowLeft size={16} />返回报道列表</Button>
        <div className="english-article-actions">
          {article.images === null && <Button type="button" disabled={Boolean(busy)} loading={busy === 'images'} onClick={() => void refreshImages()}>
            <Download size={16} />获取原文图片
          </Button>}
          {isSaved
            ? <Button type="button" variant="danger" disabled={Boolean(busy)} onClick={() => setDeleting(article)}><Trash2 size={16} />删除本地文章</Button>
            : <Button type="button" disabled={Boolean(busy)} loading={busy === 'save'} onClick={() => void saveArticle()}><Bookmark size={16} />保存到本地</Button>}
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <article className="english-article-reader" lang="en">
        <h2 ref={heading} tabIndex={-1}>{article.title}</h2>
        <div className="english-article-details" lang="zh-CN">
          <Source publishedAt={article.publishedAt} />
          {isSaved && <span className="chip accent" role="status">已保存</span>}
          <a href={article.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={13} aria-hidden="true" /></a>
        </div>
        <div className="english-article-body">
          {article.paragraphs.map((text, index) => <Fragment key={index}>
            {article.images?.map((image, imageIndex) => image.beforeParagraph === index && <ArticleImage key={imageIndex} image={image} />)}
            <p>{text}</p>
          </Fragment>)}
          {article.images?.map((image, index) => image.beforeParagraph === article.paragraphs.length && <ArticleImage key={index} image={image} />)}
        </div>
      </article>
    </> : <>
      <div className="english-article-toolbar">
        <h2 ref={listHeading} tabIndex={-1}>报道</h2>
        <div className="segmented" role="group" aria-label="报道来源">
          <button type="button" disabled={Boolean(busy)} aria-pressed={view === 'saved'} onClick={() => { setView('saved'); setError('') }}>已保存</button>
          <button type="button" disabled={Boolean(busy)} aria-pressed={view === 'online'} onClick={() => { setView('online'); setError('') }}>在线报道</button>
        </div>
      </div>
      {view === 'online' && <>
        <div className="english-article-actions">
          <Select aria-label="报道栏目" value={topic} disabled={Boolean(busy)} onChange={event => {
            setTopic(event.target.value as EnglishArticleTopic)
            setOnline(null)
            setError('')
          }}>
            {ENGLISH_ARTICLE_TOPICS.map(value => <option key={value} value={value}>{TOPIC_LABELS[value]}</option>)}
          </Select>
          <Button type="button" variant="primary" disabled={Boolean(busy)} loading={busy === 'discover'} onClick={() => void discover()}><Download size={16} />获取报道</Button>
        </div>
        <form className="english-article-link" onSubmit={event => { event.preventDefault(); if (!busy && link.trim()) void openArticle(link.trim()) }}>
          <input className="input" type="url" aria-label="VOA 英文报道链接" placeholder="粘贴 VOA Learning English 文章链接"
            value={link} maxLength={1200} disabled={Boolean(busy)} onChange={event => setLink(event.target.value)} />
          <Button type="submit" disabled={Boolean(busy) || !link.trim()}>打开链接</Button>
        </form>
      </>}
      {error && <Alert tone="danger" action={view === 'saved' && !saved.length ? <Button onClick={() => {
        setError('')
        setBusy('list')
        setAttempt(value => value + 1)
      }}>重试读取</Button> : undefined}>{error}</Alert>}
      {(busy === 'list' || busy === 'open') && <p className="muted" role="status">{busy === 'open' ? '正在打开报道…' : '正在读取已保存的报道…'}</p>}
      {items?.length ? <ul className="english-article-list">
        {items.map(item => <li key={item.id}>
          <button type="button" className="english-article-row" disabled={Boolean(busy)} onClick={() => void openArticle(item.url, item.id)}>
            <span className="english-article-title" lang="en">{item.title}</span>
            <Source publishedAt={item.publishedAt} />
          </button>
          {view === 'saved' && <Button type="button" variant="ghost" className="icon" disabled={Boolean(busy)}
            aria-label={`删除 ${item.title}`} title="删除本地文章" onClick={() => setDeleting(item)}><Trash2 size={16} /></Button>}
        </li>)}
      </ul> : !busy && !error && <div className="english-article-empty">
        <p>{view === 'saved' ? '还没有保存的报道。' : online ? '这个栏目暂时没有文字报道。' : '选择栏目获取报道，或打开一篇文章链接。'}</p>
        {view === 'saved' && <Button type="button" onClick={() => setView('online')}>浏览在线报道</Button>}
      </div>}
    </>}
    <ConfirmDialog open={Boolean(deleting)} title="删除本地报道？" confirmLabel="删除报道"
      description={`「${deleting?.title ?? ''}」将从本机移除。`}
      loading={busy === 'delete'} onClose={() => { if (!busy) setDeleting(null) }} onConfirm={() => void deleteArticle()} />
  </section>
}
