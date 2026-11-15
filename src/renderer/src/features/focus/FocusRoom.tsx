import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { ArrowLeft, Image, Maximize, Minimize, Pause, Play, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Wallpaper } from '../../components/layout/Wallpaper'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { Toast } from '../../components/ui/Toast'
import { humanError } from '../../lib/utils'
import { focusClock, useFocus } from '../../stores/focus'
import { selectActiveWallpaper, useImmersiveWallpaper, useWallpaper } from '../../stores/wallpaper'
import { WallpaperSettings } from '../settings/WallpaperSettings'
import { AMBIENCE_SETTING, FocusAmbience, parseAmbience, type AmbienceSettings } from './FocusAmbience'
import { FocusEnglish } from './FocusEnglish'
import { FocusMedia } from './FocusMedia'
import { FocusRelax } from './FocusRelax'
import { FocusNotes, FocusStudy } from './FocusStudy'
import { FocusSceneSettings } from './FocusSceneSettings'
import {
  DEFAULT_SCENES, SCENE_SETTING, parseSceneSettings, sceneOption, serializeScenes, type SceneId
} from './scene-config'
import './room.css'

function SessionReadout() {
  const { running, started, finishing, remaining, minutes } = useFocus()
  return <div className="focus-room-readout">
    <div className="focus-room-session">
      {(started || finishing) && <span className="focus-room-timer" role="timer">{focusClock(remaining)}</span>}
      <span role="status">{finishing ? '保存中' : running ? '' : started ? '已暂停' : '本轮结束'}</span>
    </div>
    <progress className="focus-room-progress" aria-label="本轮进度" max={minutes * 60}
      value={started || finishing ? minutes * 60 - remaining : minutes * 60} />
  </div>
}

function SessionAction({ closeControls }: { closeControls(): void }) {
  const running = useFocus(state => state.running)
  const started = useFocus(state => state.started)
  const finishing = useFocus(state => state.finishing)
  const toggle = useFocus(state => state.toggle)
  return <Button variant="ghost" disabled={finishing} onClick={() => { closeControls(); toggle() }}>
    {running ? <Pause size={16} /> : <Play size={16} />}
    {running ? '暂停计时' : started ? '继续计时' : '开始下一轮'}
  </Button>
}

export function FocusRoom() {
  const [scenes, setScenes] = useState<SceneId[]>(DEFAULT_SCENES)
  const [scene, setScene] = useState<SceneId>('study')
  const [fullscreen, setFullscreen] = useState(false)
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false)
  const [ambienceOpen, setAmbienceOpen] = useState(false)
  const [ambience, setAmbience] = useState<AmbienceSettings | null>(null)
  const backgroundMode = useImmersiveWallpaper(state => state.config.mode ?? 'solid')
  const backgroundClear = useImmersiveWallpaper(state => state.config.clear)
  const customWallpaper = useImmersiveWallpaper(selectActiveWallpaper)
  const workspaceWallpaper = useWallpaper(selectActiveWallpaper)
  const hasWallpaper = Boolean(backgroundMode === 'custom' ? customWallpaper : backgroundMode === 'workspace' && workspaceWallpaper)
  const room = useRef<HTMLElement>(null)
  const controlButton = useRef<HTMLButtonElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const controlsId = useId()
  const leave = useFocus(state => state.leave)
  const switchingWallpaper = useRef(false)

  useEffect(() => {
    let active = true
    void window.api.settings.getAll().then(saved => {
      if (!active) return
      const next = parseSceneSettings(saved[SCENE_SETTING])
      setScenes(next)
      setScene(current => next.includes(current) ? current : next[0])
      setAmbience(parseAmbience(saved[AMBIENCE_SETTING]))
    }).catch(() => { if (active) setAmbience(parseAmbience()) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    room.current?.focus()
    void window.api.app.setWindowTheme('dark').catch(() => undefined)
    const onFullscreen = (): void => setFullscreen(document.fullscreenElement === room.current)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement &&
        !controls.current?.matches(':popover-open') && !room.current?.querySelector('dialog[open]')) leave()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      removeEventListener('keydown', onKey)
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      void window.api.app.setWindowTheme(theme).catch(() => undefined)
    }
  }, [leave])

  function closeControls(): void {
    controls.current?.hidePopover()
    controlButton.current?.focus({ preventScroll: true })
  }

  function switchScene(next: SceneId): void {
    if (controls.current?.matches(':popover-open')) closeControls()
    setScene(next)
  }

  async function saveScenes(next: SceneId[]): Promise<void> {
    setScenes(next)
    setSceneSettingsOpen(false)
    setScene(current => next.includes(current) ? current : next[0])
    try { await window.api.settings.set(SCENE_SETTING, serializeScenes(next)) }
    catch (error) { window.toast.error(humanError(error)) }
  }

  function saveAmbience(next: AmbienceSettings): void {
    setAmbience(next)
    void window.api.settings.set(AMBIENCE_SETTING, JSON.stringify(next)).catch(error => window.toast.error(humanError(error)))
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await room.current?.requestFullscreen()
    } catch {
      window.toast.error('无法切换全屏，请继续使用窗口模式。')
    }
  }

  // 右键在当前背景的已有壁纸中随机切换：单独设置与沿用模式分别作用于
  // 沉浸清单与工作台当前壁纸。弹窗与控制面板内部不响应，切换期间不并发。
  function randomizeWallpaper(event: MouseEvent): void {
    event.preventDefault()
    if (backgroundMode === 'solid' || switchingWallpaper.current) return
    if ((event.target as HTMLElement).closest('dialog, [popover]')) return
    const store = backgroundMode === 'custom' ? useImmersiveWallpaper : useWallpaper
    const { config, setActive } = store.getState()
    if (config.items.length < 2) {
      window.toast.error('已有壁纸不足两张，无法随机切换。')
      return
    }
    const candidates = config.items.filter(item => item.id !== config.activeId)
    if (!candidates.length) return
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    switchingWallpaper.current = true
    void setActive(next.id)
      .then(() => window.toast.success(`已随机切换壁纸「${next.label}」`))
      .catch(error => window.toast.error(humanError(error)))
      .finally(() => { switchingWallpaper.current = false })
  }

  return <main className="focus-room" data-theme="dark" ref={room} tabIndex={-1} aria-label="沉浸空间"
    onContextMenu={randomizeWallpaper}>
    {backgroundMode !== 'solid' && <Wallpaper key={backgroundMode} immersive clear={backgroundClear}
      useStore={backgroundMode === 'custom' ? useImmersiveWallpaper : useWallpaper} />}
    <FocusAmbience open={ambienceOpen} overlay={hasWallpaper} settings={ambience}
      onChange={saveAmbience} onClose={() => setAmbienceOpen(false)} />
    <header className="focus-room-top">
      <Button variant="ghost" className="focus-room-back" title="保留当前计时" onClick={leave}>
        <ArrowLeft size={16} />返回工作台
      </Button>
      <div className="focus-room-drag" aria-hidden="true" />
    </header>
    <div className="focus-room-stage" key={scene}><ErrorBoundary>
      {scene === 'study' && <FocusStudy />}
      {scene === 'study-notes' && <FocusNotes onBack={() => switchScene('study')} />}
      {scene === 'study-english' && <FocusEnglish setId={null} onBack={() => switchScene('study')} />}
      {scene === 'video' && <FocusMedia type="video" />}
      {scene === 'image' && <FocusMedia type="image" />}
      {scene === 'relax' && <FocusRelax />}
    </ErrorBoundary></div>
    <footer className="focus-room-footer">
      <SessionReadout />
      <button type="button" className="button ghost focus-room-control" ref={controlButton} popoverTarget={controlsId}>
        <SlidersHorizontal size={16} />控制
      </button>
      <div id={controlsId} ref={controls} popover="auto" role="group" aria-label="沉浸控制" className="focus-room-popover">
        <div className="focus-room-group">
          <h2>计时</h2>
          <SessionAction closeControls={closeControls} />
        </div>
        <div className="focus-room-group">
          <h2>场景</h2>
          <div className="focus-room-scenes" role="group" aria-label="沉浸场景">
            {scenes.map(id => {
              const option = sceneOption(id)
              const Icon = option.icon
              return <Button key={id} variant="ghost" aria-pressed={scene === id} title={option.hint}
                onClick={() => switchScene(id)}>
                <Icon size={16} />{option.label}
              </Button>
            })}
            <Button variant="ghost" aria-haspopup="dialog" onClick={() => { closeControls(); setSceneSettingsOpen(true) }}>
              <Settings2 size={16} />自定义场景
            </Button>
          </div>
        </div>
        <div className="focus-room-group">
          <h2>空间</h2>
          <Button variant="ghost" aria-haspopup="dialog" onClick={() => { closeControls(); setBackgroundOpen(true) }}>
            <Image size={16} />背景设置
          </Button>
          <Button variant="ghost" aria-haspopup="dialog" onClick={() => { closeControls(); setAmbienceOpen(true) }}>
            <Sparkles size={16} />氛围效果
          </Button>
          <Button variant="ghost" onClick={() => { closeControls(); void toggleFullscreen() }}>
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}{fullscreen ? '退出全屏' : '进入全屏'}
          </Button>
          <Button variant="ghost" title="保留当前计时" onClick={leave}>
            <ArrowLeft size={16} />返回工作台
          </Button>
        </div>
      </div>
    </footer>
    <Dialog open={backgroundOpen} title="背景设置" className="focus-background-dialog" onClose={() => setBackgroundOpen(false)}>
      {backgroundOpen && <div className="focus-background-content"><WallpaperSettings scope="immersive" /></div>}
    </Dialog>
    {sceneSettingsOpen && <FocusSceneSettings scenes={scenes} onClose={() => setSceneSettingsOpen(false)} onSave={next => void saveScenes(next)} />}
    <Toast />
  </main>
}
