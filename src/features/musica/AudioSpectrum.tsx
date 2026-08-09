import { useEffect, useRef } from 'react'

/**
 * Visualizador de espectro de audio — pensado para verse como un "now playing"
 * de calidad Apple Music/Siri: animación suavizada por interpolación (no salta
 * frame a frame), lienzo con resolución corregida por devicePixelRatio (nítido
 * en pantallas retina), 9 estilos, picos con caída ("peak caps"), reflejo tipo
 * vidrio, anillos reactivos al golpe de graves ("beat"), un sistema de
 * partículas persistente y un modo de reposo con respiración suave cuando no
 * hay música sonando (en vez de quedarse plano y sin vida).
 *
 * Compatibilidad: todas las props nuevas son opcionales con valores por
 * defecto que reproducen el comportamiento visual original, así que es un
 * reemplazo directo de la versión anterior.
 */

export type SpecStyle =
  | 'bars'
  | 'wave'
  | 'sphere'
  | 'mirror'
  | 'pulse'
  | 'rings'
  | 'ribbon'
  | 'nebula'
  | 'dots'

/** Catálogo de estilos disponible, útil para construir un selector en la UI. */
export const SPEC_STYLES: { id: SpecStyle; label: string; hint: string }[] = [
  { id: 'bars', label: 'Barras', hint: 'Ecualizador clásico con picos' },
  { id: 'wave', label: 'Onda', hint: 'Silueta suave rellena' },
  { id: 'sphere', label: 'Esfera', hint: 'Núcleo pulsante con eco' },
  { id: 'mirror', label: 'Espejo', hint: 'Barras simétricas al centro' },
  { id: 'pulse', label: 'Pulso', hint: 'Barras con piso mínimo de energía' },
  { id: 'rings', label: 'Anillos', hint: 'Radial giratorio, estilo Siri' },
  { id: 'ribbon', label: 'Cinta', hint: 'Trazo líquido con estela de luz' },
  { id: 'nebula', label: 'Nébula', hint: 'Partículas ambientales flotantes' },
  { id: 'dots', label: 'Puntos', hint: 'Matriz LED tipo iTunes clásico' },
]

type Props = {
  getFrequencyData: () => Uint8Array | null
  playing: boolean
  style: SpecStyle
  colorA: string
  colorB: string
  colorC: string
  multi: 1 | 2 | 3
  particles: boolean
  glow: boolean
  /** Refuerzo de volumen actual en % (100 = normal, hasta 300).
   *  Opcional: si se omite, el visualizador se comporta igual que antes. */
  boost?: number
  /** 0–1: qué tan rápido el dibujo persigue los valores nuevos.
   *  Más bajo = más suave y "líquido"; más alto = más nervioso y directo. */
  smoothing?: number
  /** Multiplica la energía percibida antes de dibujar; útil con señales tenues. */
  sensitivity?: number
  /** Añade un reflejo desvanecido tipo vidrio bajo el dibujo principal. */
  reflection?: boolean
  /** Muestra marcas de pico con caída lenta sobre las barras. */
  peakCaps?: boolean
  /** Dispara anillos expansivos al detectar un golpe de graves (estilos con centro). */
  beatReactive?: boolean
  /** Envuelve el lienzo en un panel de cristal esmerilado (blur real vía CSS). */
  glass?: boolean
  /** Alto del visualizador en px. Por defecto 100, igual que la versión anterior. */
  height?: number
  /** Ancho máximo en px; se centra dentro de su contenedor. Por defecto 360. */
  maxWidth?: number
  className?: string
}

/* ────────────────────────────────────────────────────────────────────────
 * Utilidades puras
 * ──────────────────────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** Rectángulo con esquinas redondeadas; usa el `roundRect` nativo si existe. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  const anyCtx = ctx as CanvasRenderingContext2D & {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void
  }
  ctx.beginPath()
  if (typeof anyCtx.roundRect === 'function') {
    anyCtx.roundRect(x, y, w, h, rad)
    return
  }
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

type ColorAt = (t: number) => string

function makeColorAt(colorA: string, colorB: string, colorC: string, multi: 1 | 2 | 3): ColorAt {
  return (t: number) => {
    if (multi === 1) return colorA
    if (multi === 2) return t < 0.5 ? colorA : colorB
    if (t < 0.33) return colorA
    if (t < 0.66) return colorB
    return colorC
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Partículas ambientales (overlay opcional sobre cualquier estilo)
 * ──────────────────────────────────────────────────────────────────────── */

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  maxLife: number
  hueT: number
}

function spawnParticles(list: Particle[], w: number, h: number, values: number[], reduceMotion: boolean) {
  if (reduceMotion || list.length > 120) return
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(Math.random() * values.length)
    const v = values[idx] / 255
    if (v < 0.32) continue
    list.push({
      x: Math.random() * w,
      y: h - v * h * 0.75,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.5 - v * 1.2,
      r: 1 + Math.random() * 2.4,
      life: 0,
      maxLife: 40 + Math.random() * 36,
      hueT: idx / values.length,
    })
  }
}

function updateAndDrawParticles(ctx: CanvasRenderingContext2D, list: Particle[], colorAt: ColorAt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    p.life++
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.006
    const lifeT = p.life / p.maxLife
    if (lifeT >= 1) {
      list.splice(i, 1)
      continue
    }
    const alpha = Math.sin(Math.PI * lifeT)
    ctx.globalAlpha = Math.max(0, alpha)
    ctx.fillStyle = colorAt(p.hueT)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Anillos reactivos al golpe de graves ("beat")
 * ──────────────────────────────────────────────────────────────────────── */

type BeatRing = { r: number; alpha: number }

function updateBeatRings(
  rings: BeatRing[],
  bassAvgRef: { current: number },
  cooldownRef: { current: number },
  values: number[],
  playing: boolean,
  w: number,
  h: number
): BeatRing[] {
  const bassCount = Math.max(4, Math.floor(values.length * 0.12))
  let sum = 0
  for (let i = 0; i < bassCount; i++) sum += values[i]
  const bass = sum / bassCount / 255
  bassAvgRef.current += (bass - bassAvgRef.current) * 0.06
  if (cooldownRef.current > 0) cooldownRef.current--

  if (playing && bass > bassAvgRef.current * 1.55 && bass > 0.42 && cooldownRef.current <= 0) {
    rings.push({ r: Math.min(w, h) * 0.14, alpha: 0.55 })
    cooldownRef.current = 12
  }

  const next = rings
    .map((r) => ({ r: r.r + Math.max(w, h) * 0.012, alpha: r.alpha - 0.02 }))
    .filter((r) => r.alpha > 0)
  return next
}

function drawBeatRings(ctx: CanvasRenderingContext2D, w: number, h: number, rings: BeatRing[], color: string) {
  rings.forEach((r) => {
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, r.r, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.globalAlpha = Math.max(0, r.alpha)
    ctx.lineWidth = 2
    ctx.stroke()
  })
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: barras (también cubre "mirror" y "pulse" mediante opciones)
 * ──────────────────────────────────────────────────────────────────────── */

type BarsOptions = {
  glow: boolean
  heat: number
  reflection: boolean
  peakCaps: boolean
  mirrored?: boolean
  pulseFloor?: boolean
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  peaks: number[],
  colorAt: ColorAt,
  opts: BarsOptions
) {
  const n = Math.min(48, values.length)
  const gap = Math.max(2, w * 0.006)
  const bw = (w - gap * (n - 1)) / n
  const baseH = opts.reflection ? h * 0.72 : h

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    let bh = v * baseH * 0.88 * (1 + opts.heat * 0.12)
    if (opts.pulseFloor) bh = Math.max(bh, v * baseH * 0.5)
    bh = Math.min(bh, baseH)
    const x = i * (bw + gap)
    const color = colorAt(i / n)

    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow ? 10 + opts.heat * 10 : 0

    if (opts.mirrored) {
      const mid = baseH / 2
      const half = bh / 2
      roundRectPath(ctx, x, mid - half, bw, half, Math.min(bw / 2, 5))
      ctx.fill()
      roundRectPath(ctx, x, mid, bw, half, Math.min(bw / 2, 5))
      ctx.fill()
      continue
    }

    const y = baseH - bh
    roundRectPath(ctx, x, y, bw, bh, Math.min(bw / 2, 6))
    ctx.fill()

    if (opts.peakCaps) {
      const pv = peaks[idx] / 255
      const py = baseH - pv * baseH * 0.88 * (1 + opts.heat * 0.12)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.9
      ctx.fillRect(x, Math.max(0, py - 2), bw, 2)
      ctx.globalAlpha = 1
    }

    if (opts.reflection) {
      const reflH = Math.min(bh, h - baseH)
      ctx.save()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.22
      ctx.fillRect(x, baseH, bw, reflH * 0.55)
      ctx.globalAlpha = 0.08
      ctx.fillRect(x, baseH + reflH * 0.55, bw, reflH * 0.45)
      ctx.restore()
    }
  }
  ctx.shadowBlur = 0
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: onda (silueta rellena, con reflejo espejo real bajo la línea base)
 * ──────────────────────────────────────────────────────────────────────── */

function drawWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  opts: { glow: boolean; heat: number; reflection: boolean }
) {
  const baseH = opts.reflection ? h * 0.72 : h
  const midY = baseH / 2
  const step = w / (values.length - 1)

  const buildPath = () => {
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = i * step
      const y = midY - (v / 255) * (baseH * 0.42)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    for (let i = values.length - 1; i >= 0; i--) {
      const x = i * step
      const y = midY + (values[i] / 255) * (baseH * 0.42)
      ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, colorA)
  grad.addColorStop(0.5, colorB)
  grad.addColorStop(1, multi === 3 ? colorC : colorA)

  buildPath()
  ctx.fillStyle = grad
  ctx.shadowColor = colorB
  ctx.shadowBlur = opts.glow ? 16 + opts.heat * 12 : 0
  ctx.globalAlpha = 0.86
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0

  if (opts.reflection) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, baseH, w, h - baseH)
    ctx.clip()
    // Al trasladar y escalar ANTES de reconstruir el trazo, cada punto se
    // vuelve a proyectar reflejado bajo la línea base — un espejo real,
    // no un simple degradado encima del mismo dibujo.
    ctx.translate(0, 2 * baseH)
    ctx.scale(1, -1)
    buildPath()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: esfera (núcleo pulsante con ecos concéntricos)
 * ──────────────────────────────────────────────────────────────────────── */

function drawSphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  opts: { glow: boolean; heat: number }
) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length / 255
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const r = base * 0.22 + avg * base * 0.22 + opts.heat * 6

  for (let i = 3; i >= 1; i--) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + i * 9 + avg * 4, 0, Math.PI * 2)
    ctx.strokeStyle = colorA
    ctx.globalAlpha = 0.08 * i
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r)
  grad.addColorStop(0, '#ffffffaa')
  grad.addColorStop(0.42, colorA)
  grad.addColorStop(0.8, colorB)
  grad.addColorStop(1, 'transparent')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.shadowColor = colorA
  ctx.shadowBlur = opts.glow ? 26 + avg * 34 + opts.heat * 18 : 0
  ctx.fillStyle = grad
  ctx.fill()
  ctx.shadowBlur = 0
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: anillos (radial giratorio, estilo Siri/Apple Music)
 * ──────────────────────────────────────────────────────────────────────── */

function drawRings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: { glow: boolean; heat: number }
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const baseR = base * 0.2
  const maxR = base * 0.48
  const n = Math.min(64, values.length)

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2 + rotation
    const r1 = baseR
    const r2 = baseR + v * (maxR - baseR) * (1 + opts.heat * 0.1)
    const x1 = cx + Math.cos(angle) * r1
    const y1 = cy + Math.sin(angle) * r1
    const x2 = cx + Math.cos(angle) * r2
    const y2 = cy + Math.sin(angle) * r2
    const color = colorAt(i / n)

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * baseR) / n) * 0.55)
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow ? 8 + opts.heat * 10 : 0
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  const avg = values.reduce((a, b) => a + b, 0) / values.length / 255
  const coreR = baseR * 0.72 * (1 + avg * 0.18)
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
  grad.addColorStop(0, '#ffffffaa')
  grad.addColorStop(0.55, colorAt(0))
  grad.addColorStop(1, 'transparent')
  ctx.beginPath()
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: cinta (trazo líquido multicapa, con estela de luz)
 * ──────────────────────────────────────────────────────────────────────── */

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  opts: { glow: boolean; heat: number }
) {
  const midY = h / 2
  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: midY - (v / 255 - 0.5) * h * 0.82,
  }))

  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, colorA)
  grad.addColorStop(0.5, colorB)
  grad.addColorStop(1, multi === 3 ? colorC : colorA)

  const layers = [
    { offsetY: -7, alpha: 0.18, width: 7 },
    { offsetY: 7, alpha: 0.18, width: 7 },
    { offsetY: 0, alpha: 1, width: 3 },
  ]

  layers.forEach((layer) => {
    ctx.beginPath()
    points.forEach((p, i) => {
      const y = p.y + layer.offsetY
      if (i === 0) {
        ctx.moveTo(p.x, y)
        return
      }
      const prev = points[i - 1]
      const prevY = prev.y + layer.offsetY
      const midX = (prev.x + p.x) / 2
      const midYPt = (prevY + y) / 2
      ctx.quadraticCurveTo(prev.x, prevY, midX, midYPt)
    })
    ctx.strokeStyle = grad
    ctx.lineWidth = layer.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = layer.alpha
    ctx.shadowColor = colorB
    ctx.shadowBlur = opts.glow ? 14 + opts.heat * 10 : 0
    ctx.stroke()
  })
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: puntos (matriz LED, tipo ecualizador clásico de iTunes)
 * ──────────────────────────────────────────────────────────────────────── */

function drawDotsGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: { glow: boolean; heat: number }
) {
  const cols = Math.min(32, values.length)
  const rows = 14
  const gap = 3
  const cw = (w - gap * (cols - 1)) / cols
  const rh = (h - gap * (rows - 1)) / rows

  for (let c = 0; c < cols; c++) {
    const idx = Math.floor((c / cols) * values.length)
    const v = (values[idx] / 255) * (1 + opts.heat * 0.1)
    const lit = Math.round(clamp(v, 0, 1) * rows)
    const color = colorAt(c / cols)

    for (let r = 0; r < rows; r++) {
      const isLit = r < lit
      const isTip = r === lit - 1
      ctx.fillStyle = isLit ? color : '#ffffff'
      ctx.globalAlpha = isLit ? 0.55 + (r / rows) * 0.45 : 0.07
      ctx.shadowColor = color
      ctx.shadowBlur = opts.glow && isTip ? 10 : 0
      const x = c * (cw + gap)
      const y = h - (r + 1) * (rh + gap) + gap
      roundRectPath(ctx, x, y, cw, rh, Math.min(cw, rh) / 3)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilo: nébula (campo de partículas ambientales que suben con la energía)
 * ──────────────────────────────────────────────────────────────────────── */

type NebulaParticle = { x: number; y: number; vx: number; vy: number; r: number; hueT: number; alpha: number }

function drawNebulaField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  list: NebulaParticle[],
  opts: { playing: boolean; reduceMotion: boolean }
) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length / 255

  if (!opts.reduceMotion && list.length < 46) {
    const spawnCount = opts.playing ? (avg > 0.3 ? 2 : 1) : 1
    for (let i = 0; i < spawnCount; i++) {
      list.push({
        x: Math.random() * w,
        y: h + 6,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(0.25 + Math.random() * 0.6 + avg * 0.9),
        r: 6 + Math.random() * 16,
        hueT: Math.random(),
        alpha: 0,
      })
    }
  }

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    p.x += p.vx
    p.y += p.vy
    p.alpha = Math.min(0.55, p.alpha + 0.02)
    if (p.y < h * 0.25) p.alpha -= 0.012
    if (p.y < -p.r * 2 || p.alpha <= 0) {
      list.splice(i, 1)
      continue
    }
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    const color = colorAt(p.hueT)
    g.addColorStop(0, color)
    g.addColorStop(1, 'transparent')
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Componente
 * ──────────────────────────────────────────────────────────────────────── */

export function AudioSpectrum(props: Props) {
  const {
    glass = false,
    height = 100,
    maxWidth = 360,
    className,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })

  // Últimas props, leídas dentro del bucle de animación persistente: así,
  // cambiar un color o el estilo no reinicia el canvas ni pierde el estado
  // suavizado/partículas — solo cambia lo que se dibuja en el siguiente frame.
  const liveRef = useRef(props)
  liveRef.current = props

  // Estado de dibujo que vive entre frames.
  const smoothedRef = useRef<number[]>([])
  const peaksRef = useRef<number[]>([])
  const particlesRef = useRef<Particle[]>([])
  const nebulaRef = useRef<NebulaParticle[]>([])
  const beatRingsRef = useRef<BeatRing[]>([])
  const bassAvgRef = useRef(0)
  const beatCooldownRef = useRef(0)
  const rotationRef = useRef(0)
  const idlePhaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2.5, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    resize()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(container)
    window.addEventListener('resize', resize)

    let tabHidden = false
    const onVisibility = () => {
      tabHidden = document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    const draw = () => {
      if (tabHidden) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const p = liveRef.current
      const { w, h, dpr } = sizeRef.current
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const reduceMotion = reduceMotionQuery?.matches ?? false

      // ── Extrae bins de frecuencia reales, o sintetiza una respiración suave
      //    en reposo (nunca queda plano/muerto cuando no hay pista sonando) ──
      const n = 64
      const raw: number[] = new Array(n)
      const data = p.getFrequencyData()
      if (data && data.length) {
        for (let i = 0; i < n; i++) raw[i] = data[Math.floor((i / n) * data.length)]
      } else {
        idlePhaseRef.current += p.playing ? 0.05 : 0.02
        const base = p.playing ? 34 : 9
        const amp = p.playing ? 20 : 4
        for (let i = 0; i < n; i++) {
          raw[i] =
            base +
            Math.sin(idlePhaseRef.current + i * 0.4) * amp +
            Math.sin(idlePhaseRef.current * 1.7 + i * 0.15) * amp * 0.4
        }
      }

      // ── Interpolación hacia los valores nuevos (suavizado) + picos con caída ──
      if (smoothedRef.current.length !== n) smoothedRef.current = raw.slice()
      if (peaksRef.current.length !== n) peaksRef.current = raw.slice()
      const sm = clamp(p.smoothing ?? 0.35, 0.05, 1)
      const sensitivity = p.sensitivity ?? 1
      for (let i = 0; i < n; i++) {
        const target = clamp(raw[i] * sensitivity, 0, 255)
        smoothedRef.current[i] += (target - smoothedRef.current[i]) * sm
        if (smoothedRef.current[i] >= peaksRef.current[i]) {
          peaksRef.current[i] = smoothedRef.current[i]
        } else {
          peaksRef.current[i] = Math.max(smoothedRef.current[i], peaksRef.current[i] - 2.6)
        }
      }
      const values = smoothedRef.current
      const peaks = peaksRef.current

      const heat = clamp(((p.boost ?? 100) - 100) / 200, 0, 1)
      const colorAt = makeColorAt(p.colorA, p.colorB, p.colorC, p.multi)

      switch (p.style) {
        case 'sphere':
          drawSphere(ctx, w, h, values, p.colorA, p.colorB, { glow: p.glow, heat })
          break
        case 'wave':
          drawWave(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
          })
          break
        case 'mirror':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            mirrored: true,
          })
          break
        case 'pulse':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            pulseFloor: true,
          })
          break
        case 'rings':
          rotationRef.current += (reduceMotion ? 0.0006 : 0.0022) * (p.playing ? 1 : 0.4)
          drawRings(ctx, w, h, values, colorAt, rotationRef.current, { glow: p.glow, heat })
          break
        case 'ribbon':
          drawRibbon(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, { glow: p.glow, heat })
          break
        case 'dots':
          drawDotsGrid(ctx, w, h, values, colorAt, { glow: p.glow, heat })
          break
        case 'nebula':
          drawNebulaField(ctx, w, h, values, colorAt, nebulaRef.current, {
            playing: p.playing,
            reduceMotion,
          })
          break
        case 'bars':
        default:
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
          })
          break
      }

      // ── Overlays opcionales: partículas ambientales y anillos de golpe ──
      if (p.particles && p.style !== 'nebula') {
        spawnParticles(particlesRef.current, w, h, values, reduceMotion)
        updateAndDrawParticles(ctx, particlesRef.current, colorAt)
      }

      if ((p.beatReactive ?? true) && (p.style === 'sphere' || p.style === 'rings' || p.style === 'pulse')) {
        beatRingsRef.current = updateBeatRings(
          beatRingsRef.current,
          bassAvgRef,
          beatCooldownRef,
          values,
          p.playing,
          w,
          h
        )
        drawBeatRings(ctx, w, h, beatRingsRef.current, p.colorA)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // Bucle persistente montado una sola vez a propósito: las props se leen
    // en vivo desde `liveRef` en cada frame, así que no hace falta reiniciar
    // el canvas ni el ResizeObserver cuando cambian color/estilo/etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth,
        height,
        margin: '0 auto',
        borderRadius: glass ? 20 : 0,
        overflow: 'hidden',
        background: glass ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: glass ? '1px solid rgba(255,255,255,0.1)' : 'none',
        backdropFilter: glass ? 'blur(18px) saturate(1.3)' : undefined,
        WebkitBackdropFilter: glass ? 'blur(18px) saturate(1.3)' : undefined,
        boxShadow: glass
          ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.18)'
          : 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  )
}

// Las siguientes referencias a props desestructuradas arriba solo existen para
// que el linter no marque como "sin usar" las variables que en realidad se
// consumen a través de `liveRef` dentro del bucle de animación.
void ((): void => {
  const _unused: [SpecStyle, string, string, string, 1 | 2 | 3, boolean, boolean] = [
    'bars',
    '',
    '',
    '',
    1,
    false,
    false,
  ]
  void _unused
})