import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderOpen, Link, Minus, Monitor, Play, Plus, Trash2, Upload } from 'lucide-react'
import { WALLPAPER_FITS, type ImmersiveWallpaperMode, type WallpaperConfig, type WallpaperItem, type WallpaperScope } from '@shared/types'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { humanError } from '../../lib/utils'
import { useImmersiveWallpaper, useWallpaper } from '../../stores/wallpaper'
import { WallpaperEnginePicker } from './WallpaperEnginePicker'
import './settings.css'

const modes: { id: ImmersiveWallpaperMode; label: string }[] = [
  { id: 'solid', label: '纯色' },
  { id: 'workspace', label: '沿用工作台壁纸' },
  { id: 'custom', label: '单独设置' }
]

const fitOptions = {
  cover: { label: '自动适配', hint: '横图和方图可裁边铺满，竖图和尺寸较小的 Wallpaper Engine 图片完整显示。' },
  'fill-window': { label: '铺满窗口', hint: '等比铺满整个窗口，比例不同时会裁掉部分边缘。小图放大后可能发虚。' },
  'scale-down': { label: '完整显示', hint: '保留整个画面，空间有余时留边。' }
} satisfies Record<NonNullable<WallpaperConfig['fit']>, { label: string; hint: string }>

const MIN_INTERVAL = 10
const MAX_INTERVAL = 86400

function isVideo(item: WallpaperItem): boolean {
  return item.kind ? item.kind === 'video' : /\.(mp4|webm|mov|m4v|ogv)$/i.test(item.url)
}

function OverlayComparison({ item, overlay, tinted }: { item: WallpaperItem; overlay: number; tinted?: boolean }) {
  const [split, setSplit] = useState(50)
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div className="wallpaper-comparison">
      <div className="wallpaper-comparison-image" aria-hidden="true">
        <img src={item.url} alt="" loading="lazy" onError={() => setFailed(true)} />
        {/* 工作台蒙层叠在内容底色之上，预览按真实层级插入底色层；沉浸蒙层直接盖在壁纸上。 */}
        {tinted && <span className="wallpaper-comparison-tint" />}
        <span className="wallpaper-comparison-scrim" style={{ opacity: overlay, clipPath: `inset(0 0 0 ${split}%)` }} />
        {split > 0 && split < 100 && <span className="wallpaper-comparison-divider" style={{ left: `${split}%` }} />}
      </div>
      <div className="wallpaper-comparison-labels" aria-hidden="true"><span>无蒙层</span><span>加蒙层</span></div>
      <input type="range" min={0} max={100} step={1} value={split}
        aria-label="原图和加蒙层对照" aria-valuetext={`原图占 ${split}%`}
        onChange={event => setSplit(Number(event.currentTarget.value))} />
    </div>
  )
}

/** 沉浸背景「沿用工作台壁纸」时，在背景设置弹窗内直接切换工作台壁纸与蒙层。 */
function WorkspaceWallpaperMirror() {
  const { config, load, setActive, updateConfig } = useWallpaper()
  const [loading, setLoading] = useState(true)
  const [overlay, setOverlay] = useState(config.overlay)
  const saving = useRef(false)

  useEffect(() => {
    void load().catch(() => undefined).finally(() => setLoading(false))
  }, [load])
  useEffect(() => { setOverlay(config.overlay) }, [config.overlay])

  const saveOverlay = (): void => {
    if (saving.current || overlay === config.overlay) return
    saving.current = true
    void updateConfig({ overlay }).catch(error => {
      setOverlay(config.overlay)
      window.toast.error(humanError(error))
    }).finally(() => { saving.current = false })
  }

  const workspaceClear = Boolean(config.clear)
  const active = config.items.find(item => item.id === config.activeId)

  return <div className="wallpaper-mirror" aria-busy={loading || saving.current}>
    <div className="section-heading">
      <h3>工作台壁纸</h3>
      <span className="muted small">{config.items.length} / 50</span>
    </div>
    {loading ? <p className="wallpaper-empty" role="status">正在读取工作台壁纸…</p>
      : config.items.length === 0 ? <p className="wallpaper-empty">工作台还没有壁纸，先到 设置 → 外观 → 工作台壁纸 添加。</p>
        : <div className="wallpaper-grid" aria-label="工作台壁纸">
          {config.items.map(item => (
            <div key={item.id} className={`wallpaper-card ${config.activeId === item.id ? 'is-active' : ''}`}>
              <button className="wallpaper-select" aria-pressed={config.activeId === item.id}
                aria-label={`使用工作台壁纸：${item.label}`}
                onClick={() => { if (config.activeId !== item.id) void setActive(item.id).catch(error => window.toast.error(humanError(error))) }}>
                {isVideo(item)
                  ? <span className="wallpaper-video-preview"><Play size={24} aria-hidden="true" />视频壁纸</span>
                  : <img src={item.url} alt={item.label} loading="lazy" />}
                <span className="wallpaper-label" title={item.label}>{item.label}</span>
                {config.activeId === item.id && <span className="wallpaper-badge"><Check size={12} />使用中</span>}
              </button>
            </div>
          ))}
        </div>}
    {config.items.length > 0 && <div className="wallpaper-overlay-options">
      <div className="wallpaper-overlay">
        <label htmlFor="workspace-mirror-overlay">工作台暗色蒙层 <span className="muted">{Math.round(overlay * 100)}%</span></label>
        <input id="workspace-mirror-overlay" type="range" min={0} max={0.6} step={0.01} value={overlay}
          disabled={workspaceClear} aria-valuetext={`${Math.round(overlay * 100)}%`}
          onChange={event => setOverlay(Number(event.target.value))}
          onPointerUp={saveOverlay} onKeyUp={saveOverlay} onBlur={saveOverlay} />
        <p className="input-hint">{workspaceClear
          ? '工作台已开启清晰背景，暗色蒙层不生效。'
          : `沉浸背景沿用此蒙层。当前使用：${active?.label ?? '未选择壁纸'}`}</p>
      </div>
    </div>}
    <p className="input-hint">添加、移除工作台壁纸或开启轮播，请到 设置 → 外观 → 工作台壁纸。</p>
  </div>
}

export function WallpaperSettings({ scope }: { scope: WallpaperScope }) {
  const immersive = scope === 'immersive'
  const useStore = immersive ? useImmersiveWallpaper : useWallpaper
  const { config, load, addUrl, addFile, addSystem, addEngine, setActive, remove, clear, updateConfig } = useStore()
  const mode = config.mode ?? 'solid'
  const fit = config.fit ?? 'cover'
  const workspaceClear = useWallpaper(state => state.config.clear)
  const clearBackground = config.clear ?? (immersive && mode === 'workspace' && Boolean(workspaceClear))
  const editable = !immersive || mode === 'custom'
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [showEngine, setShowEngine] = useState(false)
  const [url, setUrl] = useState('')
  const [interval, setIntervalValue] = useState(String(config.interval))
  const actionPending = useRef(false)
  const [overlay, setOverlay] = useState(config.overlay)
  const [confirmation, setConfirmation] = useState<{ id?: string; label?: string } | null>(null)

  useEffect(() => {
    void load().catch(error => setError(humanError(error))).finally(() => setLoading(false))
  }, [load])
  useEffect(() => { setIntervalValue(String(config.interval)) }, [config.interval])
  useEffect(() => { setOverlay(config.overlay) }, [config.overlay])

  const run = async (name: string, action: () => Promise<unknown>, message?: string): Promise<void> => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(name)
    setError('')
    try {
      const result = await action()
      if (message && result !== false) window.toast.success(message)
    } catch (error) {
      const message = humanError(error)
      setError(message)
      window.toast.error(message)
    } finally {
      actionPending.current = false
      setBusy('')
    }
  }

  const submitUrl = async (): Promise<void> => {
    await run('url', async () => {
      if (!url.trim()) throw new Error('请先输入图片或视频直链。')
      // 最终 URL、安全限制和下载均由主进程执行。
      await addUrl({ url: url.trim() })
      setUrl('')
      setShowUrl(false)
    }, '壁纸已添加')
  }

  const saveInterval = (value: number): void => {
    if (actionPending.current) return
    if (!Number.isInteger(value) || value < MIN_INTERVAL || value > MAX_INTERVAL) {
      const message = `轮播间隔请输入 ${MIN_INTERVAL}–${MAX_INTERVAL} 之间的整数秒。`
      setError(message)
      window.toast.error(message)
      setIntervalValue(String(config.interval))
      return
    }
    setIntervalValue(String(value))
    if (value === config.interval) return
    void run('interval', async () => {
      try { await updateConfig({ interval: value }) }
      catch (error) { setIntervalValue(String(config.interval)); throw error }
    })
  }
  const saveOverlay = (): void => {
    if (clearBackground) return
    if (overlay !== config.overlay) void run('overlay', () => updateConfig({ overlay }))
  }
  const disabled = loading || Boolean(busy)
  const overlayDisabled = disabled || Boolean(clearBackground)
  const intervalDisabled = loading || Boolean(busy && busy !== 'interval')
  const intervalNumber = Number(interval)
  const stepBase = Number.isInteger(intervalNumber) && intervalNumber >= MIN_INTERVAL && intervalNumber <= MAX_INTERVAL
    ? intervalNumber : config.interval
  const stepInterval = (direction: -1 | 1): void => {
    const value = stepBase + direction
    if (!disabled && value >= MIN_INTERVAL && value <= MAX_INTERVAL) saveInterval(value)
  }
  const itemCount = config.items.length
  const atLimit = itemCount >= 50
  const active = config.items.find(item => item.id === config.activeId)
  const sample = active && !isVideo(active) && !clearBackground ? active : undefined
  const options = (
    <div className="wallpaper-options">
      <div className="wallpaper-carousel">
        <label className="wallpaper-toggle"><input type="checkbox" role="switch" checked={config.carousel} disabled={disabled} onChange={event => void run('carousel', () => updateConfig({ carousel: event.target.checked }))} />自动轮播</label>
        {config.carousel && <div className="field">
          <label htmlFor={`${scope}-wallpaper-interval`}>轮播间隔（秒）</label>
          <div className="wallpaper-stepper" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) saveInterval(intervalNumber)
          }}>
            <Button className="icon" type="button" aria-label="减少轮播间隔 1 秒" disabled={intervalDisabled}
              aria-disabled={disabled || stepBase <= MIN_INTERVAL} onClick={() => stepInterval(-1)}><Minus size={14} aria-hidden="true" /></Button>
            <Input id={`${scope}-wallpaper-interval`} type="number" min={MIN_INTERVAL} max={MAX_INTERVAL} step={1}
              value={interval} disabled={intervalDisabled} readOnly={busy === 'interval'} onChange={event => setIntervalValue(event.currentTarget.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveInterval(intervalNumber) } }} />
            <Button className="icon" type="button" aria-label="增加轮播间隔 1 秒" disabled={intervalDisabled}
              aria-disabled={disabled || stepBase >= MAX_INTERVAL} onClick={() => stepInterval(1)}><Plus size={14} aria-hidden="true" /></Button>
          </div>
        </div>}
      </div>
      {config.carousel && itemCount < 2 && <p className="input-hint">添加至少两张壁纸后开始轮播。</p>}
      <div className="wallpaper-overlay-options">
        <div className="wallpaper-overlay">
          <label htmlFor={`${scope}-wallpaper-overlay`}>暗色蒙层 <span className="muted">{Math.round(overlay * 100)}%</span></label>
          <input id={`${scope}-wallpaper-overlay`} type="range" min={0} max={0.6} step={0.01} value={overlay} disabled={overlayDisabled}
            aria-valuetext={`${Math.round(overlay * 100)}%`} onChange={event => setOverlay(Number(event.target.value))} onPointerUp={saveOverlay} onKeyUp={saveOverlay} onBlur={saveOverlay} />
          <p className="input-hint">{clearBackground ? '已开启清晰背景，暗色蒙层不生效；关闭后可再调节。' : '增强壁纸上的文字可读性'}</p>
        </div>
        {sample && <OverlayComparison key={sample.url} item={sample} overlay={overlay} tinted={!immersive} />}
      </div>
    </div>
  )

  return (
    <section className="wallpaper-settings" aria-labelledby={`${scope}-wallpaper-heading`} aria-busy={loading || Boolean(busy)}>
      <div className="section-heading">
        <h3 id={`${scope}-wallpaper-heading`}>{immersive ? '沉浸背景' : '工作台壁纸'}</h3>
        {editable && <div className="row">
          <span className="muted small">{itemCount} / 50</span>
          {itemCount > 0 && <Button variant="ghost" className="sm" disabled={disabled} onClick={() => setConfirmation({})}>清除全部</Button>}
        </div>}
      </div>
      {!immersive && <div className="field wallpaper-display">
        <label htmlFor="workspace-wallpaper-fit">显示方式</label>
        <Select id="workspace-wallpaper-fit" value={fit} disabled={disabled}
          aria-describedby="workspace-wallpaper-fit-hint" onChange={event => {
            const value = event.currentTarget.value
            const selected = WALLPAPER_FITS.find(option => option === value)
            if (selected) void run('fit', () => updateConfig({ fit: selected }))
          }}>
          {WALLPAPER_FITS.map(option => <option key={option} value={option}>{fitOptions[option].label}</option>)}
        </Select>
        <p id="workspace-wallpaper-fit-hint" className="input-hint">{fitOptions[fit].hint}</p>
      </div>}
      {immersive && <div className="wallpaper-mode">
        <div className="wallpaper-sources" role="group" aria-label="沉浸背景模式">
          {modes.map(item => <Button key={item.id} aria-pressed={mode === item.id}
            variant={mode === item.id ? 'primary' : undefined} disabled={disabled}
            onClick={() => void run('mode', () => updateConfig({ mode: item.id }))}>{item.label}</Button>)}
        </div>
        {mode === 'workspace' && <p className="input-hint">使用工作台当前的壁纸、轮播和蒙层设置。</p>}
      </div>}
      {(!immersive || mode !== 'solid') && <div className="wallpaper-clear">
        <label className="wallpaper-toggle">
          <input type="checkbox" role="switch" checked={clearBackground} disabled={disabled}
            onChange={event => void run('clear', () => updateConfig({ clear: event.target.checked }))} />
          清晰背景
        </label>
        <p className="input-hint">{immersive ? '开启后移除沉浸背景的暗色蒙层。' : '开启后减弱内容区底色，并去掉侧栏磨砂和暗色蒙层。'}</p>
      </div>}
      {immersive && mode === 'workspace' && <WorkspaceWallpaperMirror />}
      {!editable && error && <div className="wallpaper-error" role="alert">{error}<Button variant="ghost" disabled={disabled} onClick={() => void run('reload', load)}>重新读取</Button></div>}
      {editable && <>
        <div className="wallpaper-sources">
          <Button disabled={disabled} aria-expanded={showEngine} onClick={() => setShowEngine(!showEngine)}><FolderOpen size={14} />从 Wallpaper Engine 选择</Button>
          <Button disabled={disabled || atLimit} aria-expanded={showUrl} onClick={() => setShowUrl(!showUrl)}><Link size={14} />从链接添加</Button>
          <Button disabled={disabled || atLimit} loading={busy === 'file'} onClick={() => void run('file', addFile, '壁纸已添加')}><Upload size={14} />添加本地文件</Button>
          <Button disabled={disabled || atLimit} loading={busy === 'system'} onClick={() => void run('system', addSystem, '壁纸已添加')}><Monitor size={14} />获取系统壁纸</Button>
        </div>
        {showEngine && <WallpaperEnginePicker config={config} disabled={disabled} onSelect={id => run('engine', () => addEngine(id), 'Wallpaper 壁纸已应用')} />}
        {showUrl && (
          <form className="wallpaper-url form-stack" onSubmit={event => { event.preventDefault(); void submitUrl() }}>
            <div className="field">
              <label htmlFor={`${scope}-wallpaper-url`}>HTTP / HTTPS 直链（图片最大 20 MB，视频最大 600 MB）</label>
              <div className="row">
                <Input id={`${scope}-wallpaper-url`} type="text" inputMode="url" autoFocus value={url} disabled={disabled} onChange={event => setUrl(event.target.value)} />
                <Button type="submit" loading={busy === 'url'} disabled={disabled || !url.trim()} variant="primary">添加壁纸</Button>
              </div>
            </div>
          </form>
        )}
        {error && <div className="wallpaper-error" role="alert">{error}{loading ? null : <Button variant="ghost" disabled={disabled} onClick={() => void run('reload', load)}>重新读取</Button>}</div>}
        {loading ? <p className="wallpaper-empty" role="status">正在读取壁纸…</p>
          : itemCount === 0 ? <p className="wallpaper-empty">还没有壁纸，从上方任选一种方式添加。</p>
            : <div className="wallpaper-grid" aria-label="已保存的壁纸">
              {config.items.map(item => (
                <div key={item.id} className={`wallpaper-card ${config.activeId === item.id ? 'is-active' : ''}`}>
                  <button className="wallpaper-select" disabled={disabled} aria-pressed={config.activeId === item.id} aria-label={`使用壁纸：${item.label}`} onClick={() => void run(item.id, () => setActive(item.id))}>
                      {isVideo(item)
                        ? <span className="wallpaper-video-preview"><Play size={24} aria-hidden="true" />视频壁纸</span>
                        : <img src={item.url} alt={item.label} loading="lazy" />}
                    <span className="wallpaper-label" title={item.label}>{item.label}</span>
                    {config.activeId === item.id && <span className="wallpaper-badge"><Check size={12} />使用中</span>}
                  </button>
                  <Button className="wallpaper-remove" disabled={disabled} aria-label={`移除壁纸：${item.label}`} title="移除" onClick={() => setConfirmation({ id: item.id, label: item.label })}><Trash2 size={13} /></Button>
                </div>
              ))}
            </div>}
        {itemCount > 0 ? options : <details className="wallpaper-presets">
          <summary className="button ghost"><ChevronDown size={14} aria-hidden="true" />轮播与蒙层</summary>
          {options}
        </details>}
        <ConfirmDialog open={confirmation !== null} title={confirmation?.id ? '移除壁纸' : '清除全部壁纸'}
          confirmLabel={confirmation?.id ? '移除壁纸' : '清除全部壁纸'}
          description={confirmation?.id ? `移除「${confirmation.label}」的本地副本，删除后不可恢复。原始文件不受影响。` : '删除全部壁纸的本地副本并关闭当前背景，删除后不可恢复。原始文件不受影响。'}
          loading={busy === 'delete'} onClose={() => { if (busy !== 'delete') setConfirmation(null) }}
          onConfirm={() => void run('delete', async () => {
            if (confirmation?.id) await remove(confirmation.id)
            else await clear()
            setConfirmation(null)
          }, confirmation?.id ? '壁纸已移除' : '壁纸已清除')} />
      </>}
    </section>
  )
}
