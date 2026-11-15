import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Select'
import { AMBIENCE_EFFECTS, createAmbiencePainter, type AmbienceEffect } from './ambience-art'
import './ambience.css'

const tracks = [
  { id: 'window-light', name: '窗边微光 · 电钢琴', url: new URL('./music/window-light.ogg', import.meta.url).href },
  { id: 'night-drift', name: '夜色缓行 · 氛围铃音', url: new URL('./music/night-drift.ogg', import.meta.url).href }
] as const

export const AMBIENCE_SETTING = 'ui.immersive_ambience'

export interface AmbienceSettings {
  effect: AmbienceEffect | null
  track: (typeof tracks)[number]['id']
  volume: number
}

const defaults: AmbienceSettings = { effect: null, track: 'window-light', volume: 25 }

export function parseAmbience(raw?: string): AmbienceSettings {
  if (!raw) return defaults
  try {
    const saved = JSON.parse(raw) as Partial<AmbienceSettings> | null
    return {
      effect: AMBIENCE_EFFECTS.find(item => item.id === saved?.effect)?.id ?? defaults.effect,
      track: tracks.find(item => item.id === saved?.track)?.id ?? defaults.track,
      volume: typeof saved?.volume === 'number' && saved.volume >= 0 && saved.volume <= 100 ? saved.volume : defaults.volume
    }
  } catch {
    return defaults
  }
}

function AmbienceCanvas({ effect, preview = false, overlay = false }: {
  effect: AmbienceEffect
  preview?: boolean
  overlay?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const paint = createAmbiencePainter(context, effect, overlay)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let last = 0
    let time = preview ? 5 : 0

    function resize(): void {
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return
      const scale = preview ? 1.2 : Math.max(3, canvas.clientWidth / 700, canvas.clientHeight / 420)
      canvas.width = Math.ceil(canvas.clientWidth / scale)
      canvas.height = Math.ceil(canvas.clientHeight / scale)
      paint(time)
    }

    function draw(now: number): void {
      // 允许高刷新率屏幕跳过中间帧，恢复时从停下的位置继续。
      if (!last) last = now
      if (now - last >= 1000 / 30) {
        time += Math.min(now - last, 80) / 1000
        paint(time)
        last = now
      }
      frame = requestAnimationFrame(draw)
    }

    function syncMotion(): void {
      cancelAnimationFrame(frame)
      last = 0
      if (!preview && !reduced.matches && !document.hidden) frame = requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    syncMotion()
    if (!preview) {
      reduced.addEventListener('change', syncMotion)
      document.addEventListener('visibilitychange', syncMotion)
    }
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      reduced.removeEventListener('change', syncMotion)
      document.removeEventListener('visibilitychange', syncMotion)
    }
  }, [effect, overlay, preview])

  return <canvas ref={ref} className={preview ? 'focus-ambience-preview' : 'focus-ambience-canvas'}
    data-effect={effect} aria-hidden="true" />
}

export function FocusAmbience({ open, overlay, settings, onChange, onClose }: {
  open: boolean
  overlay: boolean
  settings: AmbienceSettings | null
  onChange(next: AmbienceSettings): void
  onClose(): void
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [musicError, setMusicError] = useState('')
  const trackId = useId()
  const volumeId = useId()
  const track = tracks.find(item => item.id === settings?.track) ?? tracks[0]
  const volume = settings?.volume ?? defaults.volume

  useEffect(() => {
    const element = audio.current
    return () => element?.pause()
  }, [])

  useEffect(() => {
    if (audio.current) audio.current.volume = volume / 100
  }, [volume])

  function toggleMusic(): void {
    const element = audio.current
    if (!element) return
    setMusicError('')
    if (!element.paused) { element.pause(); return }
    if (element.error) element.load()
    void element.play().catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMusicError('无法播放这首音乐，请重试或换一首。')
    })
  }

  return <>
    {settings?.effect && <AmbienceCanvas effect={settings.effect} overlay={overlay} />}
    <audio ref={audio} src={track.url} loop preload="none" hidden
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => {
        setPlaying(false)
        setMusicError('无法读取这首音乐，请换一首。')
      }} />
    <Dialog open={open} title="氛围效果" className="focus-ambience-dialog" onClose={onClose}>
      {open && (settings ? <>
        <section aria-label="动态特效" className="focus-ambience-section">
          <div className="focus-ambience-heading">
            <h3>动态特效</h3>
            <Button variant="ghost" className="sm" disabled={!settings.effect}
              onClick={() => onChange({ ...settings, effect: null })}>关闭特效</Button>
          </div>
          <div className="focus-ambience-grid">
            {AMBIENCE_EFFECTS.map(item => <button type="button" key={item.id} className="focus-ambience-option"
              aria-pressed={settings.effect === item.id} onClick={() => onChange({ ...settings, effect: item.id })}>
              <AmbienceCanvas effect={item.id} preview />
              <span>{item.name}</span>
            </button>)}
          </div>
        </section>
        <section aria-labelledby={trackId} className="focus-ambience-section">
          <div className="focus-ambience-heading"><h3 id={trackId}>背景音乐</h3></div>
          <div className="focus-ambience-player">
            <Select aria-labelledby={trackId} value={settings.track} onChange={event => {
              const next = tracks.find(item => item.id === event.target.value)
              if (!next) return
              audio.current?.pause()
              setMusicError('')
              onChange({ ...settings, track: next.id })
            }}>
              {tracks.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </Select>
            <Button variant="primary" onClick={toggleMusic}>
              {playing ? <Pause size={16} /> : <Play size={16} />}{playing ? '暂停音乐' : '播放音乐'}
            </Button>
            <label className="focus-ambience-volume" htmlFor={volumeId}>音量 <span>{volume}%</span>
              <input id={volumeId} type="range" min="0" max="100" step="5" value={volume} aria-valuetext={`${volume}%`}
                onChange={event => onChange({ ...settings, volume: event.target.valueAsNumber })} />
            </label>
          </div>
          {musicError && <p className="focus-ambience-error" role="alert">{musicError}</p>}
        </section>
      </> : <p role="status">正在读取氛围设置…</p>)}
    </Dialog>
  </>
}
