export const SPLASH_CONVERGE_MS = 820
export const SPLASH_FADE_MS = 300

const EMIT_MS = 300
const MAX_DPR = 2
const MAX_SPARKS = 224
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

interface Spark {
  angle: number
  spread: number
  traceOffset: number
  turn: number
  start: number
  arrival: number
  ringOffset: number
  speed: number
  scatter: number
  size: number
  brightness: number
  tone: number
  dust: boolean
  fromAngle: number
  fromRadius: number
  ringRadius: number
}

export interface SplashParticles {
  dissipate: () => void
  destroy: () => void
}

interface Options {
  canvas: HTMLCanvasElement
  host: HTMLElement
  mark: HTMLElement
  startedAt: number
}

const unit = (value: number): number => Math.min(1, Math.max(0, value))
const random = (min: number, max: number): number => min + Math.random() * (max - min)
const ease = (value: number): number => value * value * (3 - 2 * value)

/** canvas 只接受具体颜色值；custom property 读出的是原始 token 流（如 light-dark()），
    先挂到探针元素上按当前 color-scheme 解析成 rgb()，无效值降级为 transparent 不绘制。 */
function resolveCanvasColor(raw: string): string {
  const probe = document.createElement('span')
  probe.style.color = raw
  if (!probe.style.color) return 'transparent'
  document.body.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved
}

/** 解析后的 rgb() 转 rgba()：渐变两档透明度直接算好，不依赖 canvas 侧的 color-mix() 解析。 */
function withAlpha(color: string, alpha: number): string {
  const parts = color.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return color
  const [r, g, b] = parts.map(Number)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function makeSpark(index: number): Spark {
  const dust = index % 5 === 0
  return {
    angle: index * GOLDEN_ANGLE + random(-0.24, 0.24),
    spread: Math.random(),
    traceOffset: random(0.05, 0.62),
    turn: random(0.65, 1.65),
    start: EMIT_MS + random(0, 112),
    arrival: SPLASH_CONVERGE_MS - random(24, 124),
    ringOffset: random(0, 1),
    speed: random(110, 290),
    scatter: random(-0.14, 0.28),
    size: dust ? random(3, 5) : random(6, 12),
    brightness: dust ? random(0.22, 0.44) : random(0.55, 0.94),
    tone: Math.random() < 0.16 ? 1 : 0,
    dust,
    fromAngle: 0,
    fromRadius: 0,
    ringRadius: 0
  }
}

/** 预绘光斑与内核，每帧只贴图。 */
function makeSprite(color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 48
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite

  const gradient = ctx.createRadialGradient(24, 24, 0, 24, 24, 24)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.16, color)
  gradient.addColorStop(0.28, withAlpha(color, .45))
  gradient.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 48, 48)
  return sprite
}

export function createSplashParticles({ canvas, host, mark, startedAt }: Options): SplashParticles | null {
  const context = canvas.getContext('2d')
  if (!context) return null
  const ctx = context
  const styles = getComputedStyle(host)
  const palette = [
    resolveCanvasColor(styles.getPropertyValue('--accent').trim()),
    resolveCanvasColor(styles.getPropertyValue('--accent-2').trim())
  ]
  const sprites = palette.map(makeSprite)
  const paths = [...host.querySelectorAll<SVGPathElement>('.splash-trace')]
  const sparks = Array.from({ length: MAX_SPARKS }, (_, index) => makeSpark(index))

  let width = 0
  let height = 0
  let dpr = 0
  let centerX = 0
  let centerY = 0
  let markWidth = 0
  let count = 0
  let raf = 0
  let exitAt: number | undefined
  let stopped = false

  const pixelRatio = (): number => Math.min(window.devicePixelRatio || 1, MAX_DPR)

  function resize(): boolean {
    const bounds = canvas.getBoundingClientRect()
    const emblem = host.getBoundingClientRect()
    const nextDpr = pixelRatio()
    const x = emblem.left - bounds.left + emblem.width / 2
    const y = emblem.top - bounds.top + emblem.height / 2
    // offsetWidth 取标志落位后的尺寸，不受入场缩放影响。
    const nextMarkWidth = mark.offsetWidth
    if (
      bounds.width === width && bounds.height === height && nextDpr === dpr &&
      x === centerX && y === centerY && nextMarkWidth === markWidth
    ) return false

    width = bounds.width
    height = bounds.height
    dpr = nextDpr
    centerX = x
    centerY = y
    markWidth = nextMarkWidth
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    count = Math.round(Math.min(MAX_SPARKS, Math.max(92, width * height / 6600)))

    const traces = paths.map(path => ({ path, length: path.getTotalLength(), matrix: path.getScreenCTM() }))
    const reach = Math.min(width * 0.38, height * 0.43, 310)
    let traceIndex = 0
    for (let index = 0; index < count; index += 1) {
      const spark = sparks[index]
      // 保留每颗粒子的采样参数，窗口变化时只重算几何，继续原来的进度。
      spark.ringRadius = markWidth * 0.68 + 4 + spark.ringOffset * 14
      const distance = spark.ringRadius + (0.24 + spark.spread * 0.76) * reach
      let dx = Math.cos(spark.angle) * distance
      let dy = Math.sin(spark.angle) * distance * 0.76
      if (index % 3 === 1 && traces.length > 0) {
        const trace = traces[traceIndex % traces.length]
        traceIndex += 1
        if (trace.matrix) {
          const point = trace.path.getPointAtLength(trace.length * spark.traceOffset).matrixTransform(trace.matrix)
          dx = point.x - bounds.left - centerX
          dy = point.y - bounds.top - centerY
        }
      }
      spark.fromAngle = Math.atan2(dy, dx)
      spark.fromRadius = Math.hypot(dx, dy)
    }
    return true
  }

  function drawSpark(spark: Spark, time: number, exit: number): void {
    if (time <= spark.start) return
    const duration = spark.arrival - spark.start
    const flight = unit((time - spark.start) / duration)
    const curve = ease(flight)
    // 径向距离只减不增，角度沿同一旋向增长，汇聚轨迹不会穿过标志。
    let radius = spark.fromRadius + (spark.ringRadius - spark.fromRadius) * curve
    let angle = spark.fromAngle + spark.turn * curve
    angle += Math.max(0, time - spark.arrival) * 0.00145

    const fadeIn = ease(unit(flight * 7))
    const settled = ease(unit((flight - 0.72) / 0.28))
    let alpha = spark.brightness * fadeIn * (1 - 0.48 * settled)
    if (exit > 0) {
      const seconds = exit * SPLASH_FADE_MS / 1000
      radius += spark.speed * -Math.expm1(-6 * seconds) / 6
      angle += spark.scatter * ease(exit)
      alpha *= (1 - exit) ** 1.5
    }
    if (alpha < 0.01) return

    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    if (exit === 0 && !spark.dust && flight < 1) {
      // 同一条弧上的短拖尾随速度自然缩短，落环时收干净。
      const tail = ease(Math.max(0, flight - 25 / duration))
      const tailRadius = spark.fromRadius + (spark.ringRadius - spark.fromRadius) * tail
      const tailAngle = spark.fromAngle + spark.turn * tail
      ctx.globalAlpha = alpha * (1 - settled) * 0.42
      ctx.strokeStyle = palette[spark.tone]
      ctx.lineWidth = spark.size / 11
      ctx.beginPath()
      ctx.moveTo(centerX + Math.cos(tailAngle) * tailRadius, centerY + Math.sin(tailAngle) * tailRadius)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
    const size = spark.size * (1 - 0.22 * exit)
    ctx.drawImage(sprites[spark.tone], x - size / 2, y - size / 2, size, size)
  }

  function render(now: number): void {
    ctx.clearRect(0, 0, width, height)
    const time = (exitAt ?? now) - startedAt
    const exit = exitAt === undefined ? 0 : unit((now - exitAt) / SPLASH_FADE_MS)
    for (let index = 0; index < count; index += 1) drawSpark(sparks[index], time, exit)
    ctx.globalAlpha = 1
  }

  const observer = new ResizeObserver(() => {
    if (!stopped && resize()) render(performance.now())
  })

  function destroy(): void {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    observer.disconnect()
  }

  function frame(now: number): void {
    if (pixelRatio() !== dpr) resize()
    if (now - startedAt >= EMIT_MS) render(now)
    if (exitAt !== undefined && now - exitAt >= SPLASH_FADE_MS) destroy()
    else raf = requestAnimationFrame(frame)
  }

  resize()
  observer.observe(canvas)
  observer.observe(mark)
  raf = requestAnimationFrame(frame)

  return {
    dissipate(): void {
      if (!stopped) exitAt ??= performance.now()
    },
    destroy
  }
}
