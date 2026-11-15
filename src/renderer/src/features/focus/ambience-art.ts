export const AMBIENCE_EFFECTS = [
  { id: 'aurora', name: '极光' },
  { id: 'snow', name: '风雪' },
  { id: 'blossoms', name: '樱花' },
  { id: 'clouds', name: '月夜流云' },
  { id: 'leaves', name: '秋叶' },
  { id: 'fireflies', name: '萤火虫' }
] as const

export type AmbienceEffect = (typeof AMBIENCE_EFFECTS)[number]['id']
type Paint = (context: CanvasRenderingContext2D, width: number, height: number, time: number) => void

// 这些颜色属于像素插画。控件继续使用应用的主题色。
const skies: Record<AmbienceEffect, [string, string]> = {
  aurora: ['#080d21', '#17152b'],
  snow: ['#10192d', '#303a58'],
  blossoms: ['#130c21', '#322035'],
  clouds: ['#0d1024', '#262541'],
  leaves: ['#160e1c', '#32232b'],
  fireflies: ['#080f17', '#122521']
}

const wrap = (value: number) => value - Math.floor(value)
const wave = (value: number) => (1 + Math.sin(value)) / 2

function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function points(count: number, seed: number) {
  const random = randomSequence(seed)
  return Array.from({ length: count }, () => ({ x: random(), y: random(), size: random(), phase: random() }))
}

function sprite(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) paint(context)
  return canvas
}

function paintAurora(): Paint {
  const beams = [
    ['#63bdfa00', '#74aef83b', '#77bafbd9'],
    ['#437efc00', '#7571ee55', '#94c2faad'],
    ['#45a3ae00', '#48cfaa53', '#81ffd5f5']
  ].map(colors => sprite(4, 64, ctx => {
    const light = ctx.createLinearGradient(0, 0, 0, 64)
    light.addColorStop(0, colors[0])
    light.addColorStop(.68, colors[1])
    light.addColorStop(.91, colors[2])
    light.addColorStop(1, colors[0])
    ctx.fillStyle = light
    ctx.fillRect(0, 0, 4, 64)
  }))
  // 远景一整幅极微弱的绿幕底光，让光柱像落在夜空里而不是悬在黑底上。
  const wash = sprite(4, 64, ctx => {
    const light = ctx.createLinearGradient(0, 0, 0, 64)
    light.addColorStop(0, '#3ee6a500')
    light.addColorStop(.45, '#3ee6a51e')
    light.addColorStop(.8, '#57f2c412')
    light.addColorStop(1, '#3ee6a500')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, 4, 64)
  })

  return (ctx, w, h, t) => {
    ctx.globalCompositeOperation = 'screen'
    // 底光整幅横扫并缓慢呼吸，起伏与光柱的褶皱同频。
    const washTop = h * (.24 + wave(t * .11) * .05)
    for (let x = 0; x < w; x += 4) {
      const u = x / w
      ctx.globalAlpha = .5
      ctx.drawImage(wash, x, Math.round(washTop + Math.sin(u * 5 + t * .09) * h * .04), 4, Math.round(h * .5))
    }
    beams.forEach((beam, band) => {
      for (let x = 0; x < w; x += 2) {
        const u = x / w
        const fold = Math.sin(u * 8 + band * 1.65 + t * .13)
        const ripples = Math.sin(u * 17 - t * .18 + band) * .05
        const base = h * (.33 + band * .07 + fold * .09 + ripples)
        const glint = wave(u * 181 + band + t * .95)
        const height = h * (.11 + .16 * wave(u * 22 - t * .34) + glint * .11)
        // 幕帘细痕：高频横向波动在光柱内再叠一层明暗条纹。
        const striate = .75 + .25 * wave(u * 53 + t * .7 + band * 2)
        ctx.globalAlpha = (.19 + glint * .48) * (.2 + .8 * wave(u * 6 - 1 + band)) * striate
        ctx.drawImage(beam, x, Math.round(base - height), 2, Math.round(height))
      }
    })
    ctx.globalCompositeOperation = 'source-over'
  }
}

function paintSnow(): Paint {
  const flakes = points(260, 16)
  // 前景几朵虚化大雪片，与 1px 远景雪点拉开层次。
  const near = sprite(14, 14, ctx => {
    const glow = ctx.createRadialGradient(7, 7, 1, 7, 7, 7)
    glow.addColorStop(0, '#e8f3ffcc')
    glow.addColorStop(.55, '#dcecff66')
    glow.addColorStop(1, '#dcecff00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 14, 14)
  })
  const nearFlakes = points(9, 423)
  return (ctx, w, h, t) => {
    // 远近雪脊与风的走向保持一致，亮度随距离增加。
    const banks = ['#839cbb44', '#92acc677', '#a3bdd3aa', '#c7dcf0']
    banks.forEach((color, row) => {
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.beginPath()
      const height = h * (.69 + row * .096)
      ctx.moveTo(0, h)
      for (let x = 0; x <= w + 3; x += 3) {
        const u = x / w
        ctx.lineTo(x, Math.round(height + h * (.022 * Math.sin(u * 15 + row * 2) + .012 * Math.cos(u * 31 - row))))
      }
      ctx.lineTo(w, h)
      ctx.fill()
    })
    for (const flake of flakes) {
      // 阵风：一股缓慢起伏的风扫过画面，位移按雪片深度加权。
      const gust = Math.sin(t * .21 + flake.y * 9) * (.012 + flake.size * .02)
      const x = wrap(flake.x + t * (.032 + flake.size * .13) + gust) * w
      const y = wrap(flake.y + t * (.013 + flake.size * .022) + Math.sin(t * .9 + flake.phase * 6) * .015) * h
      ctx.globalAlpha = .16 + flake.size * .62
      ctx.fillStyle = '#e0efff'
      ctx.fillRect(Math.round(x), Math.round(y), 1 + Math.floor(flake.size * 4), 1)
    }
    for (const p of nearFlakes) {
      const x = wrap(p.x + t * (.05 + p.size * .05) + Math.sin(t * .3 + p.phase * 8) * .03) * w
      const y = wrap(p.y + t * (.05 + p.size * .04)) * h
      const size = 10 + p.size * 14
      ctx.globalAlpha = .1 + p.size * .12
      ctx.drawImage(near, Math.round(x - size / 2), Math.round(y - size / 2), size, size)
    }
  }
}

function paintFalling(leaves: boolean): Paint {
  const colors = leaves ? ['#e3a04f', '#ebc272', '#be633f', '#a0a065'] : ['#f4c2d3', '#d98ead', '#f6dee0', '#d5a5c3']
  const shapes = colors.map(color => sprite(12, 12, ctx => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(6, 11)
    if (leaves) {
      ctx.lineTo(3, 9); ctx.lineTo(0, 5); ctx.lineTo(3, 6); ctx.lineTo(2, 2); ctx.lineTo(5, 4)
      ctx.lineTo(6, 0); ctx.lineTo(7, 4); ctx.lineTo(10, 2); ctx.lineTo(9, 6); ctx.lineTo(12, 5); ctx.lineTo(9, 9)
    } else {
      ctx.bezierCurveTo(2, 9, 0, 6, 2, 2)
      ctx.bezierCurveTo(3, 0, 5, 1, 6, 3)
      ctx.bezierCurveTo(8, -1, 11, 1, 11, 4)
      ctx.bezierCurveTo(11, 7, 9, 10, 6, 11)
    }
    ctx.fill()
    ctx.fillStyle = '#fff5d377'
    ctx.fillRect(6, 5, 1, 5)
  }))
  const drift = points(leaves ? 62 : 90, leaves ? 621 : 157)
  const ground = points(92, 83)
  // 前景少量大叶片，下落更快、更贴近镜头。
  const front = points(leaves ? 5 : 7, leaves ? 91 : 45)

  return (ctx, w, h, t) => {
    for (const p of ground) {
      ctx.globalAlpha = .24 + p.size * .52
      ctx.fillStyle = colors[Math.floor(p.phase * colors.length)]
      ctx.fillRect(Math.round(p.x * w), Math.round(h - p.y * p.y * h * .045 - 1), 1 + Math.floor(p.size * 3), 1)
    }
    drift.forEach((p, index) => {
      const angle = p.phase * 6.28 + t * (.25 + p.size * .62)
      const x = wrap(p.x + t * (.012 + p.size * .026) + Math.sin(angle) * .035) * w
      const y = wrap(p.y + t * (.024 + p.size * .04)) * (h + 16) - 8
      const size = 1.7 + p.size ** 1.8 * (leaves ? 7 : 5.5)
      // 翻面摆动：绕自身转速之外再叠一个更快的「翻面」脉动，像叶片忽正忽背。
      const flutter = .92 + .08 * Math.sin(t * 2.2 + p.phase * 14)
      ctx.save()
      ctx.translate(Math.round(x), Math.round(y))
      ctx.rotate(angle * (index % 2 ? 1 : -1))
      ctx.globalAlpha = .36 + p.size * .62
      ctx.drawImage(shapes[index % shapes.length], -size / 2, -size / 2, size * flutter, size * (.6 + .4 * wave(angle)) * flutter)
      ctx.restore()
    })
    front.forEach((p, index) => {
      const angle = p.phase * 6.28 + t * (.35 + p.size * .5)
      const x = wrap(p.x + t * (.02 + p.size * .03) + Math.sin(angle) * .05) * w
      const y = wrap(p.y + t * (.05 + p.size * .05)) * (h + 20) - 10
      const size = (leaves ? 11 : 9) + p.size * 5
      ctx.save()
      ctx.translate(Math.round(x), Math.round(y))
      ctx.rotate(angle * 1.4 * (index % 2 ? 1 : -1))
      ctx.globalAlpha = .28 + p.size * .2
      ctx.drawImage(shapes[index % shapes.length], -size / 2, -size / 2, size, size * (.6 + .4 * wave(angle)))
      ctx.restore()
    })
  }
}

function paintClouds(): Paint {
  const cloud = (seed: number) => sprite(118, 42, ctx => {
    const random = randomSequence(seed)
    ctx.beginPath()
    ctx.moveTo(2, 37)
    ctx.bezierCurveTo(1, 29, 7, 22, 15, 23)
    for (let x = 15; x < 100;) {
      const next = Math.min(102, x + 12 + random() * 18)
      ctx.quadraticCurveTo((x + next) / 2, -4 + random() * 29, next, 23)
      x = next
    }
    ctx.quadraticCurveTo(115, 23, 117, 37)
    ctx.closePath()
    const color = ctx.createLinearGradient(0, 8, 0, 39)
    color.addColorStop(0, '#a4b7de')
    color.addColorStop(.28, '#617398')
    color.addColorStop(.62, '#35425f')
    color.addColorStop(1, '#1d274600')
    ctx.fillStyle = color
    ctx.fill()
  })
  const clouds = [cloud(46), cloud(136), cloud(722)]
  const banks = points(15, 21)
  // 月亮拆成光晕与月体两张精灵图，光晕可以单独呼吸缩放。
  const moonGlow = sprite(54, 54, ctx => {
    const glow = ctx.createRadialGradient(27, 27, 8, 27, 27, 27)
    glow.addColorStop(0, '#cfddff80')
    glow.addColorStop(1, '#cfddff00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 54, 54)
  })
  const moon = sprite(54, 54, ctx => {
    ctx.fillStyle = '#e9ecfa'
    ctx.beginPath()
    ctx.arc(27, 27, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#aeb9dc88'
    ctx.fillRect(21, 24, 4, 3)
    ctx.fillRect(27, 29, 5, 4)
    ctx.fillRect(31, 20, 3, 3)
  })
  // 月亮背后的远景薄云与飘在最前面的高空薄雾。
  const far = points(6, 333)
  const haze = points(2, 512)
  return (ctx, w, h, t) => {
    ctx.globalAlpha = 1
    // 远景薄云先画，落在月亮后面，漂得更慢更淡。
    far.forEach((p, index) => {
      const width = w * (.1 + p.size * .08)
      const x = wrap(p.x + t * (.002 + index * .0015)) * (w + width) - width
      const y = h * (.14 + p.y * .3)
      ctx.globalAlpha = .16 + p.size * .1
      ctx.drawImage(clouds[index % clouds.length], Math.round(x), Math.round(y), width, width * .33)
    })
    // 光晕随时间缓慢胀缩，像云缝里透出来的月晕。
    const halo = 54 * (1.06 + wave(t * .33) * .12)
    ctx.globalAlpha = .8
    ctx.drawImage(moonGlow, Math.round(w * .77 - halo / 2), Math.round(h * .23 - halo / 2), Math.round(halo), Math.round(halo))
    ctx.globalAlpha = 1
    ctx.drawImage(moon, Math.round(w * .77 - 27), Math.round(h * .23 - 27))
    banks.forEach((p, index) => {
      const depth = index / banks.length
      const width = w * (.19 + p.size * .17)
      const x = wrap(p.x + t * (.004 + depth * .011)) * (w + width) - width
      const y = h * (.25 + depth * .57) + (p.y - .5) * h * .18
      ctx.globalAlpha = .34 + depth * .58
      ctx.drawImage(clouds[index % clouds.length], Math.round(x), Math.round(y), width, width * .33)
    })
    // 高空薄雾压在云与月亮之上，慢速横移，拉开空气层次。
    haze.forEach((p, index) => {
      const width = w * (.5 + p.size * .3)
      const x = wrap(p.x + t * (.006 + index * .003)) * (w + width) - width
      ctx.globalAlpha = .07 + index * .03
      ctx.drawImage(clouds[index % clouds.length], Math.round(x), Math.round(h * (.12 + index * .1)), width, width * .18)
    })
  }
}

function paintFireflies(): Paint {
  const grass = points(410, 821)
  const fireflies = points(40, 661)
  const glow = sprite(20, 20, ctx => {
    const gradient = ctx.createRadialGradient(10, 10, 0, 10, 10, 10)
    gradient.addColorStop(0, '#f9ffd4')
    gradient.addColorStop(.13, '#c5fba6dd')
    gradient.addColorStop(.3, '#8df8ad66')
    gradient.addColorStop(1, '#66f5b200')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 20, 20)
  })
  return (ctx, w, h, t) => {
    for (const blade of grass) {
      const x = blade.x * w
      const y = h - (1 - blade.y) ** 2 * h * .12
      const length = (2 + blade.size ** 2 * h * .13) * (.3 + blade.y * .7)
      ctx.globalAlpha = .18 + blade.size * .44
      ctx.strokeStyle = blade.y > .62 ? '#294c3d' : '#355b45'
      ctx.beginPath()
      ctx.moveTo(Math.round(x), Math.round(y))
      ctx.lineTo(Math.round(x + Math.sin(t * .75 + blade.phase * 3.5) * length * .21), Math.round(y - length))
      ctx.stroke()
    }
    for (const p of fireflies) {
      const x = wrap(p.x + Math.sin(t * .36 + p.phase * 11) * .038) * w
      const y = h * (.31 + .61 * p.y + Math.cos(t * .44 + p.phase * 15) * .09)
      const pulse = wave(t * (.62 + p.phase) + p.phase * 26) ** 2
      // 越靠下（越近）越大越亮，远处只留下微弱的小光点。
      const depth = .8 + .45 * p.y
      const size = (4 + p.size ** 2 * 17) * depth * (.8 + .3 * pulse)
      ctx.globalAlpha = (.14 + .8 * pulse) * (.6 + .4 * p.y)
      ctx.drawImage(glow, Math.round(x - size / 2), Math.round(y - size / 2), size, size)
      // 亮起的瞬间补一圈更大的弱光晕，像萤火虫扩散的一瞬。
      if (pulse > .88) {
        const halo = size * 2.4
        ctx.globalAlpha = (pulse - .88) * 1.6
        ctx.drawImage(glow, Math.round(x - halo / 2), Math.round(y - halo / 2), halo, halo)
      }
    }
  }
}

const painters = {
  aurora: paintAurora,
  snow: paintSnow,
  blossoms: () => paintFalling(false),
  clouds: paintClouds,
  leaves: () => paintFalling(true),
  fireflies: paintFireflies
}

export function createAmbiencePainter(context: CanvasRenderingContext2D, effect: AmbienceEffect, overlay: boolean) {
  const stars = points(effect === 'fireflies' ? 74 : 180, 765)
  const paint = painters[effect]()
  let sky: CanvasGradient | undefined
  let height = 0
  return (time: number) => {
    const { width: w, height: h } = context.canvas
    context.globalAlpha = 1
    if (overlay) context.clearRect(0, 0, w, h)
    else {
      if (!sky || h !== height) {
        height = h
        sky = context.createLinearGradient(0, 0, 0, h)
        sky.addColorStop(0, skies[effect][0])
        sky.addColorStop(1, skies[effect][1])
      }
      context.fillStyle = sky
      context.fillRect(0, 0, w, h)
    }
    if (effect !== 'snow') {
      context.fillStyle = '#e2e9ff'
      for (const star of stars) {
        context.globalAlpha = (.08 + star.size ** 3 * .5) * (.64 + .36 * wave(star.phase * 14 + time * .75))
        const x = Math.floor(star.x * w)
        const y = Math.floor(star.y * h)
        context.fillRect(x, y, 1, 1)
        if (star.size > .985) {
          context.globalAlpha *= .44
          context.fillRect(x - 1, y, 3, 1)
          context.fillRect(x, y - 1, 1, 3)
        }
      }
    }
    context.globalAlpha = 1
    paint(context, w, h, time)
  }
}
