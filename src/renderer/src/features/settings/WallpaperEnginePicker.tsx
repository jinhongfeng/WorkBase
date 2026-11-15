import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, FolderOpen, RefreshCw, Search } from 'lucide-react'
import type { WallpaperConfig, WallpaperEngineLibrary } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { humanError } from '../../lib/utils'

export function WallpaperEnginePicker({ config, disabled, onSelect }: {
  config: WallpaperConfig; disabled: boolean; onSelect(id: string): Promise<void>
}) {
  const [library, setLibrary] = useState<WallpaperEngineLibrary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(new Map())
  const section = useRef<HTMLElement>(null)
  const scan = useCallback(async (choose = false) => {
    setBusy(true); setError('')
    try {
      const result = await (choose ? window.api.wallpaper.chooseEngineDirectory() : window.api.wallpaper.listEngine())
      if (result) { setLibrary(result); setFailed(new Set()) }
    } catch (error) { setError(humanError(error)) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { void scan() }, [scan])
  useEffect(() => { if (library) section.current?.scrollIntoView({ block: 'nearest' }) }, [library])
  const items = library?.items.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  const active = config.items.find(item => item.id === config.activeId)?.engineId
  const blocked = disabled || busy

  return <section ref={section} className="engine-library" aria-label="本地 Wallpaper Engine 壁纸" aria-busy={busy}>
    <div className="engine-library-head">
      <div><h4>选择 Wallpaper 壁纸</h4><p className="input-hint">读取本机 Wallpaper Engine 壁纸库，支持原视频壁纸与动态预览图。</p></div>
      <div className="row">
        <Button variant="ghost" disabled={blocked} loading={busy} onClick={() => void scan()}><RefreshCw size={14} />重新扫描</Button>
        <Button disabled={blocked} onClick={() => void scan(true)}><FolderOpen size={14} />选择壁纸目录</Button>
      </div>
    </div>
    <label className="search-field engine-search"><Search size={14} /><Input aria-label="搜索本地壁纸" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索壁纸名称…" /></label>
    {error && <p className="wallpaper-error" role="alert">{error}，可刷新或重新选择目录。</p>}
    {busy && <p className="input-hint" role="status">正在读取本地壁纸…</p>}
    {!busy && library && <p className="input-hint" role="status">已发现 {library.items.length} 张壁纸{query.trim() ? `，匹配 ${items.length} 张` : ''}。</p>}
    {!busy && library && !library.items.length && <p className="wallpaper-empty">未找到可用的本地壁纸。可选择 Wallpaper Engine 安装目录、431960 壁纸库或单个壁纸项目目录。</p>}
    {!!library?.items.length && !items.length && <p className="wallpaper-empty">没有匹配的壁纸，请换个名称搜索。</p>}
    {!!items.length && <div className="wallpaper-grid engine-grid" aria-label="可选的 Wallpaper 壁纸">
      {items.map(item => {
        const saved = config.items.some(saved => saved.engineId === item.id)
        const dim = item.kind === 'image' ? dims.get(item.id) : undefined
        const assetLabel = item.kind === 'video' ? '原视频' : item.animated ? '动图预览' : '静态预览'
        const assetInfo = dim ? `${assetLabel} · ${dim.width}×${dim.height}` : assetLabel
        return <button type="button" key={item.id} className={`wallpaper-card wallpaper-select${active === item.id ? ' is-active' : ''}`}
          disabled={blocked || failed.has(item.id) || (config.items.length >= 50 && !saved)} aria-pressed={active === item.id}
          aria-label={`使用 Wallpaper 壁纸：${item.title}`}
          aria-describedby={failed.has(item.id) ? undefined : `engine-asset-${item.id}`} onClick={() => void onSelect(item.id)}>
          <img src={item.previewUrl} alt="" loading="lazy" onError={() => setFailed(current => new Set(current).add(item.id))}
            onLoad={event => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (!naturalWidth) return
              setDims(current => new Map(current).set(item.id, { width: naturalWidth, height: naturalHeight }))
            }} />
          <span className="wallpaper-label" title={item.title}>{item.title}</span>
          <span className="engine-asset-info" id={`engine-asset-${item.id}`}>
            {failed.has(item.id) ? '预览不可用，请刷新' : assetInfo}
          </span>
          {active === item.id && <span className="wallpaper-badge"><Check size={12} />使用中</span>}
        </button>
      })}
    </div>}
    {!!library?.skipped && <p className="input-hint">{library.skipped} 个项目无法读取或没有可用的预览图，已跳过。</p>}
    {library?.truncated && <p className="input-hint">壁纸较多，已达到扫描上限。可选择更具体的目录。</p>}
    {config.items.length >= 50 && <p className="input-hint">已保存 50 张壁纸，可切换已有壁纸；添加新壁纸前请先移除一些。</p>}
    <p className="input-hint">场景和网页壁纸使用预览素材，画质取决于预览图的尺寸。导入静态壁纸时，如果项目目录有更大的图片，会优先使用该图片。</p>
  </section>
}
