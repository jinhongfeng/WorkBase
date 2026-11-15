import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { WallpaperItem } from '@shared/types'
import { selectActiveWallpaper, useWallpaper } from '../../stores/wallpaper'
import { humanError } from '../../lib/utils'

function isVideo(item: WallpaperItem): boolean {
  return (item.kind ?? (/\.(mp4|webm|mov|m4v|ogv)$/i.test(item.url) ? 'video' : 'image')) === 'video'
}

function WallpaperMedia({ item, preserveEngineImageSize, onReady, style }: {
  item: WallpaperItem
  preserveEngineImageSize: boolean
  onReady(): void
  style: CSSProperties
}) {
  const video = useRef<HTMLVideoElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const canFill = viewport.width > 0 && viewport.height > 0 &&
    size.width >= viewport.width && size.height >= viewport.height
  const showWholeImage = size.height > size.width || (preserveEngineImageSize && !canFill)
  useEffect(() => {
    const element = image.current
    if (!preserveEngineImageSize || !element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setViewport({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [preserveEngineImageSize])
  useEffect(() => {
    const element = video.current
    return () => {
      if (!element) return
      // 卸载后立即释放视频解码器与协议流，不保留仅暂停的旧元素。
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
  }, [])
  const onError = (): void => window.toast.error('壁纸素材无法显示，请移除后重新添加。')
  const updateVideoSize = (element: HTMLVideoElement): void => {
    setSize({ width: element.videoWidth, height: element.videoHeight })
  }
  const fitAttribute = showWholeImage ? '' : undefined
  return isVideo(item)
    ? <video ref={video} src={item.url} muted autoPlay loop playsInline preload="auto" data-fit-whole={fitAttribute}
      onResize={event => updateVideoSize(event.currentTarget)} onLoadedData={event => {
        updateVideoSize(event.currentTarget)
        onReady()
      }} onError={onError} style={style} />
    : <img ref={image} src={item.url} alt="" data-fit-whole={fitAttribute} onLoad={event => {
      const { naturalWidth, naturalHeight } = event.currentTarget
      setSize({ width: naturalWidth, height: naturalHeight })
      onReady()
    }} onError={onError} style={style} />
}

export function Wallpaper({ useStore = useWallpaper, immersive = false, clear }: {
  useStore?: typeof useWallpaper
  immersive?: boolean
  clear?: boolean
}) {
  const config = useStore(state => state.config)
  const isClear = clear ?? config.clear
  const active = useStore(selectActiveWallpaper)
  const [previous, setPrevious] = useState<WallpaperItem | null>(null)
  const previousUrl = previous?.url ?? ''
  const [readyUrl, setReadyUrl] = useState('')
  const activeUrl = active?.url ?? ''

  // 等待实际媒体加载；按 URL 去重，保留动图和视频的播放实例。
  // 新层淡入后卸载旧层，避免隐藏媒体继续解码。
  useEffect(() => {
    if (!active) { setPrevious(null); setReadyUrl(''); return }
    if (readyUrl !== activeUrl) return
    const timer = setTimeout(() => setPrevious(active), 180)
    return () => clearTimeout(timer)
  }, [active, activeUrl, readyUrl])

  // 工作台蒙层叠加在磨砂面之上（见 layout.css），变量挂到根节点供其读取；
  // 沉浸蒙层仍在壁纸层内，用下方行内变量。两种背景同一时刻只挂载一个。
  useEffect(() => {
    if (immersive) return
    const root = document.documentElement
    root.style.setProperty('--wp-overlay', String(config.overlay))
    return () => { root.style.removeProperty('--wp-overlay') }
  }, [immersive, config.overlay])

  useEffect(() => {
    if (!config.carousel || config.items.length < 2) return
    let switching = false
    const timer = setInterval(() => {
      if (switching) return
      const { config: current, setActive } = useStore.getState()
      if (!current.carousel || current.items.length < 2) return
      const index = current.items.findIndex(item => item.id === current.activeId)
      switching = true
      void setActive(current.items[(index + 1) % current.items.length].id)
        .catch(error => window.toast.error(humanError(error)))
        .finally(() => { switching = false })
    }, config.interval * 1000)
    return () => clearInterval(timer)
  }, [useStore, config.carousel, config.interval, config.items.length, config.activeId])

  if (!active) return null
  return (
    <div className={immersive ? 'wallpaper' : 'wallpaper wallpaper--workspace'}
      data-fit={immersive ? undefined : config.fit ?? 'cover'}
      data-clear={isClear ? 'true' : undefined} aria-hidden="true"
      style={{ '--wp-overlay': config.overlay } as CSSProperties}>
      {[...new Map([previous, active].filter((item): item is WallpaperItem => item !== null).map(item => [item.url, item])).values()].map(item => <WallpaperMedia key={item.url} item={item}
        preserveEngineImageSize={!immersive && item.source === 'engine' && !isVideo(item)}
        onReady={() => { if (item.url === activeUrl) setReadyUrl(item.url) }}
        style={{ opacity: item.url === previousUrl || item.url === readyUrl ? 1 : 0, zIndex: item.url === activeUrl ? 1 : 0 }} />)}
      {!isClear && immersive && <div className="wallpaper-scrim" />}
    </div>
  )
}
