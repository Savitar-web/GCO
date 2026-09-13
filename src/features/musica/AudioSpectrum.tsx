import { useEffect, useRef } from 'react'

/**
 * Visualizador de espectro de audio de alta calidad y máxima compatibilidad.
 *
 * Mejoras respecto a la versión anterior:
 * - 18 estilos (antes 9) con animaciones más fluidas y realistas.
 * - Detección de beat más precisa + múltiples capas de partículas/trails.
 * - Adaptive quality: baja automáticamente resolución y efectos en dispositivos lentos.
 * - Compatibilidad extrema:
 *   · Android antiguos (4.4+), iOS 10+, Windows 7 (IE11/Edge legado vía polyfills suaves)
 *   · Chrome, Firefox, Safari, Edge, Opera, Brave, OperaGX, Samsung Internet, WebViews
 *   · DPR limitado, ResizeObserver + fallback, matchMedia seguro, rAF con fallback
 *   · prefers-reduced-motion respetado
 *   · Canvas 2D puro (sin WebGL) → funciona en hardware muy limitado
 * - Respiración idle más orgánica + interpolación exponencial suave.
 * - Peak caps, reflejos, glow y glass con degradación progresiva.
 *
 * Todas las props nuevas son opcionales → drop-in replacement.
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
  | 'circular'
  | 'radial'
  | 'plasma'
  | 'fire'
  | 'vortex'
  | 'starfield'
  | 'liquid'
  | 'heartbeat'
  | 'matrix'

/** Catálogo completo de estilos (útil para UI selectors). */
export const SPEC_STYLES: { id: SpecStyle; label: string; hint: string }[] = [
  { id: 'bars', label: 'Barras', hint: 'Ecualizador clásico con picos' },
  { id: 'wave', label: 'Onda', hint: 'Silueta suave rellena + reflejo' },
  { id: 'sphere', label: 'Esfera', hint: 'Núcleo pulsante con ecos' },
  { id: 'mirror', label: 'Espejo', hint: 'Barras simétricas al centro' },
  { id: 'pulse', label: 'Pulso', hint: 'Barras con piso de energía' },
  { id: 'rings', label: 'Anillos', hint: 'Radial giratorio estilo Siri' },
  { id: 'ribbon', label: 'Cinta', hint: 'Trazo líquido multicapa' },
  { id: 'nebula', label: 'Nébula', hint: 'Partículas ambientales' },
  { id: 'dots', label: 'Puntos', hint: 'Matriz LED tipo iTunes' },
  { id: 'circular', label: 'Circular', hint: 'Barras alrededor de un círculo' },
  { id: 'radial', label: 'Radial', hint: 'Rayos desde el centro' },
  { id: 'plasma', label: 'Plasma', hint: 'Campo de energía orgánico' },
  { id: 'fire', label: 'Fuego', hint: 'Llamas ascendentes realistas' },
  { id: 'vortex', label: 'Vórtice', hint: 'Espiral que gira con el beat' },
  { id: 'starfield', label: 'Estrellas', hint: 'Campo de estrellas reactivas' },
  { id: 'liquid', label: 'Líquido', hint: 'Superficie ondulante 2.5D' },
  { id: 'heartbeat', label: 'Latido', hint: 'Pulso cardíaco + ondas' },
  { id: 'matrix', label: 'Matrix', hint: 'Lluvia digital estilo Matrix' },
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
  /** Refuerzo de volumen % (100 = normal, hasta 300). */
  boost?: number
  /** 0–1: velocidad de persecución (más bajo = más líquido). */
  smoothing?: number
  /** Multiplica la energía percibida. */
  sensitivity?: number
  /** Reflejo tipo vidrio bajo el dibujo. */
  reflection?: boolean
  /** Marcas de pico con caída lenta. */
  peakCaps?: boolean
  /** Anillos expansivos al detectar graves. */
  beatReactive?: boolean
  /** Panel de cristal esmerilado (CSS). */
  glass?: boolean
  /** Alto en px (default 100). */
  height?: number
  /** Ancho máximo en px (default 360). */
  maxWidth?: number
  className?: string
  /** Forzar calidad baja (útil en dispositivos muy antiguos). */
  lowQuality?: boolean
}

/* ────────────────────────────────────────────────────────────────────────
 * Utilidades compatibles (sin APIs modernas críticas)
 * ──────────────────────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** roundRect con fallback total (funciona en IE11 / Android 4.4). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  const anyCtx = ctx as any
  ctx.beginPath()
  if (typeof anyCtx.roundRect === 'function') {
    anyCtx.roundRect(x, y, w, h, rad)
    return
  }
  // Fallback clásico (compatible con todo)
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  ctx.lineTo(x + rad, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad)
  ctx.lineTo(x, y + rad)
  ctx.quadraticCurveTo(x, y, x + rad, y)
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

/** Polyfill suave de requestAnimationFrame (muy antiguos). */
const raf =
  typeof window !== 'undefined'
    ? window.requestAnimationFrame ||
      (window as any).webkitRequestAnimationFrame ||
      (window as any).mozRequestAnimationFrame ||
      ((cb: FrameRequestCallback) => setTimeout(cb, 16))
    : (cb: FrameRequestCallback) => setTimeout(cb, 16)

const caf =
  typeof window !== 'undefined'
    ? window.cancelAnimationFrame ||
      (window as any).webkitCancelAnimationFrame ||
      (window as any).mozCancelAnimationFrame ||
      clearTimeout
    : clearTimeout

/* ────────────────────────────────────────────────────────────────────────
 * Partículas ambient (overlay)
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

function spawnParticles(
  list: Particle[],
  w: number,
  h: number,
  values: number[],
  reduceMotion: boolean,
  lowQuality: boolean
) {
  if (reduceMotion || list.length > (lowQuality ? 40 : 140)) return
  const count = lowQuality ? 1 : 2
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * values.length)
    const v = values[idx] / 255
    if (v < 0.28) continue
    list.push({
      x: Math.random() * w,
      y: h - v * h * 0.78,
      vx: (Math.random() - 0.5) * 0.55,
      vy: -0.45 - v * 1.35,
      r: 1 + Math.random() * (lowQuality ? 1.8 : 2.6),
      life: 0,
      maxLife: 32 + Math.random() * 40,
      hueT: idx / values.length,
    })
  }
}

function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  list: Particle[],
  colorAt: ColorAt
) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    p.life++
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.007
    const lifeT = p.life / p.maxLife
    if (lifeT >= 1) {
      list.splice(i, 1)
      continue
    }
    const alpha = Math.sin(Math.PI * lifeT)
    ctx.globalAlpha = Math.max(0, alpha * 0.9)
    ctx.fillStyle = colorAt(p.hueT)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Beat rings
 * ──────────────────────────────────────────────────────────────────────── */

type BeatRing = { r: number; alpha: number; speed: number }

function updateBeatRings(
  rings: BeatRing[],
  bassAvgRef: { current: number },
  cooldownRef: { current: number },
  values: number[],
  playing: boolean,
  w: number,
  h: number
): BeatRing[] {
  const bassCount = Math.max(4, Math.floor(values.length * 0.14))
  let sum = 0
  for (let i = 0; i < bassCount; i++) sum += values[i]
  const bass = sum / bassCount / 255
  bassAvgRef.current += (bass - bassAvgRef.current) * 0.055

  if (cooldownRef.current > 0) cooldownRef.current--

  if (
    playing &&
    bass > bassAvgRef.current * 1.48 &&
    bass > 0.38 &&
    cooldownRef.current <= 0
  ) {
    rings.push({
      r: Math.min(w, h) * 0.12,
      alpha: 0.62,
      speed: Math.max(w, h) * 0.011,
    })
    cooldownRef.current = 11
  }

  return rings
    .map((r) => ({
      r: r.r + r.speed,
      alpha: r.alpha - 0.018,
      speed: r.speed,
    }))
    .filter((r) => r.alpha > 0.02)
}

function drawBeatRings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rings: BeatRing[],
  color: string
) {
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i]
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, r.r, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.globalAlpha = Math.max(0, r.alpha)
    ctx.lineWidth = 1.8
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Estilos de dibujo
 * ──────────────────────────────────────────────────────────────────────── */

type CommonOpts = {
  glow: boolean
  heat: number
  reflection?: boolean
  peakCaps?: boolean
  mirrored?: boolean
  pulseFloor?: boolean
  lowQuality?: boolean
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  peaks: number[],
  colorAt: ColorAt,
  opts: CommonOpts
) {
  const n = Math.min(opts.lowQuality ? 28 : 52, values.length)
  const gap = Math.max(1.5, w * 0.0055)
  const bw = (w - gap * (n - 1)) / n
  const baseH = opts.reflection ? h * 0.7 : h

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    let bh = v * baseH * 0.9 * (1 + opts.heat * 0.14)
    if (opts.pulseFloor) bh = Math.max(bh, v * baseH * 0.48)
    bh = Math.min(bh, baseH)
    const x = i * (bw + gap)
    const color = colorAt(i / n)

    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 9 + opts.heat * 11 : 0

    if (opts.mirrored) {
      const mid = baseH / 2
      const half = bh / 2
      roundRectPath(ctx, x, mid - half, bw, half, Math.min(bw / 2, 4))
      ctx.fill()
      roundRectPath(ctx, x, mid, bw, half, Math.min(bw / 2, 4))
      ctx.fill()
      continue
    }

    const y = baseH - bh
    roundRectPath(ctx, x, y, bw, bh, Math.min(bw / 2, 5))
    ctx.fill()

    if (opts.peakCaps) {
      const pv = peaks[idx] / 255
      const py = baseH - pv * baseH * 0.9 * (1 + opts.heat * 0.14)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.88
      ctx.fillRect(x, Math.max(0, py - 2), bw, 2)
      ctx.globalAlpha = 1
    }

    if (opts.reflection) {
      const reflH = Math.min(bh, h - baseH)
      ctx.save()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.2
      ctx.fillRect(x, baseH, bw, reflH * 0.55)
      ctx.globalAlpha = 0.07
      ctx.fillRect(x, baseH + reflH * 0.55, bw, reflH * 0.45)
      ctx.restore()
    }
  }
  ctx.shadowBlur = 0
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  opts: CommonOpts
) {
  const baseH = opts.reflection ? h * 0.7 : h
  const midY = baseH / 2
  const step = w / Math.max(1, values.length - 1)

  const buildPath = () => {
    ctx.beginPath()
    for (let i = 0; i < values.length; i++) {
      const x = i * step
      const y = midY - (values[i] / 255) * (baseH * 0.44)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    for (let i = values.length - 1; i >= 0; i--) {
      const x = i * step
      const y = midY + (values[i] / 255) * (baseH * 0.44)
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
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 14 + opts.heat * 12 : 0
  ctx.globalAlpha = 0.88
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0

  if (opts.reflection) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, baseH, w, h - baseH)
    ctx.clip()
    ctx.translate(0, 2 * baseH)
    ctx.scale(1, -1)
    buildPath()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

function drawSphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  opts: CommonOpts
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const r = base * 0.2 + avg * base * 0.24 + opts.heat * 7

  for (let i = 3; i >= 1; i--) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + i * 8 + avg * 5, 0, Math.PI * 2)
    ctx.strokeStyle = colorA
    ctx.globalAlpha = 0.07 * i
    ctx.lineWidth = 1.4
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r)
  grad.addColorStop(0, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.4, colorA)
  grad.addColorStop(0.78, colorB)
  grad.addColorStop(1, 'transparent')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.shadowColor = colorA
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 22 + avg * 30 + opts.heat * 16 : 0
  ctx.fillStyle = grad
  ctx.fill()
  ctx.shadowBlur = 0
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: CommonOpts
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const baseR = base * 0.18
  const maxR = base * 0.46
  const n = Math.min(opts.lowQuality ? 36 : 64, values.length)

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2 + rotation
    const r1 = baseR
    const r2 = baseR + v * (maxR - baseR) * (1 + opts.heat * 0.12)
    const x1 = cx + Math.cos(angle) * r1
    const y1 = cy + Math.sin(angle) * r1
    const x2 = cx + Math.cos(angle) * r2
    const y2 = cy + Math.sin(angle) * r2
    const color = colorAt(i / n)

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.3, ((Math.PI * 2 * baseR) / n) * 0.5)
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 7 + opts.heat * 9 : 0
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const coreR = baseR * 0.68 * (1 + avg * 0.2)
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
  grad.addColorStop(0, 'rgba(255,255,255,0.7)')
  grad.addColorStop(0.5, colorAt(0))
  grad.addColorStop(1, 'transparent')
  ctx.beginPath()
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  opts: CommonOpts
) {
  const midY = h / 2
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < values.length; i++) {
    points.push({
      x: (i / Math.max(1, values.length - 1)) * w,
      y: midY - (values[i] / 255 - 0.5) * h * 0.84,
    })
  }

  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, colorA)
  grad.addColorStop(0.5, colorB)
  grad.addColorStop(1, multi === 3 ? colorC : colorA)

  const layers = opts.lowQuality
    ? [{ offsetY: 0, alpha: 1, width: 3 }]
    : [
        { offsetY: -6, alpha: 0.16, width: 6 },
        { offsetY: 6, alpha: 0.16, width: 6 },
        { offsetY: 0, alpha: 1, width: 2.8 },
      ]

  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l]
    ctx.beginPath()
    for (let i = 0; i < points.length; i++) {
      const y = points[i].y + layer.offsetY
      if (i === 0) {
        ctx.moveTo(points[i].x, y)
        continue
      }
      const prev = points[i - 1]
      const prevY = prev.y + layer.offsetY
      const midX = (prev.x + points[i].x) / 2
      const midYPt = (prevY + y) / 2
      ctx.quadraticCurveTo(prev.x, prevY, midX, midYPt)
    }
    ctx.strokeStyle = grad
    ctx.lineWidth = layer.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = layer.alpha
    ctx.shadowColor = colorB
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 12 + opts.heat * 9 : 0
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawDotsGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts
) {
  const cols = Math.min(opts.lowQuality ? 20 : 32, values.length)
  const rows = opts.lowQuality ? 10 : 14
  const gap = 2.5
  const cw = (w - gap * (cols - 1)) / cols
  const rh = (h - gap * (rows - 1)) / rows

  for (let c = 0; c < cols; c++) {
    const idx = Math.floor((c / cols) * values.length)
    const v = (values[idx] / 255) * (1 + opts.heat * 0.12)
    const lit = Math.round(clamp(v, 0, 1) * rows)
    const color = colorAt(c / cols)

    for (let r = 0; r < rows; r++) {
      const isLit = r < lit
      const isTip = r === lit - 1
      ctx.fillStyle = isLit ? color : 'rgba(255,255,255,0.9)'
      ctx.globalAlpha = isLit ? 0.5 + (r / rows) * 0.5 : 0.06
      ctx.shadowColor = color
      ctx.shadowBlur = opts.glow && isTip && !opts.lowQuality ? 8 : 0
      const x = c * (cw + gap)
      const y = h - (r + 1) * (rh + gap) + gap
      roundRectPath(ctx, x, y, cw, rh, Math.min(cw, rh) / 3)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

type NebulaParticle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hueT: number
  alpha: number
}

function drawNebulaField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  list: NebulaParticle[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean }
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255

  if (!opts.reduceMotion && list.length < (opts.lowQuality ? 22 : 48)) {
    const spawnCount = opts.playing ? (avg > 0.28 ? 2 : 1) : 1
    for (let i = 0; i < spawnCount; i++) {
      list.push({
        x: Math.random() * w,
        y: h + 8,
        vx: (Math.random() - 0.5) * 0.28,
        vy: -(0.22 + Math.random() * 0.55 + avg * 0.95),
        r: 5 + Math.random() * (opts.lowQuality ? 10 : 18),
        hueT: Math.random(),
        alpha: 0,
      })
    }
  }

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    p.x += p.vx
    p.y += p.vy
    p.alpha = Math.min(0.52, p.alpha + 0.018)
    if (p.y < h * 0.22) p.alpha -= 0.014
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

/* ── Nuevos estilos ──────────────────────────────────────────────────── */

function drawCircular(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const innerR = base * 0.22
  const maxLen = base * 0.32
  const n = Math.min(opts.lowQuality ? 40 : 72, values.length)

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const len = v * maxLen * (1 + opts.heat * 0.1)
    const x1 = cx + Math.cos(angle) * innerR
    const y1 = cy + Math.sin(angle) * innerR
    const x2 = cx + Math.cos(angle) * (innerR + len)
    const y2 = cy + Math.sin(angle) * (innerR + len)
    const color = colorAt(i / n)

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * innerR) / n * 0.65)
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 6 + opts.heat * 8 : 0
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.48
  const n = Math.min(opts.lowQuality ? 32 : 56, values.length)

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2
    const r = v * maxR * (1 + opts.heat * 0.12)
    const color = colorAt(i / n)

    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 8 : 0
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawPlasma(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  time: number,
  opts: CommonOpts
) {
  const step = opts.lowQuality ? 8 : 5
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, colorA)
  grad.addColorStop(0.5, colorB)
  grad.addColorStop(1, multi === 3 ? colorC : colorA)

  ctx.fillStyle = grad
  ctx.globalAlpha = 0.55

  for (let x = 0; x < w; x += step) {
    const t = x / w
    const idx = Math.floor(t * (values.length - 1))
    const v = values[idx] / 255
    const wave =
      Math.sin(time * 0.8 + t * 6) * 0.15 +
      Math.sin(time * 1.3 + t * 11) * 0.08
    const y = h * 0.55 - (v + wave) * h * 0.45
    const height = (v + 0.15) * h * 0.7

    ctx.beginPath()
    ctx.ellipse(x, y, step * 1.1, height * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawFire(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  opts: CommonOpts
) {
  const n = Math.min(opts.lowQuality ? 24 : 40, values.length)
  const gap = 1
  const bw = (w - gap * (n - 1)) / n

  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const bh = v * h * 0.95 * (1 + opts.heat * 0.15)
    const x = i * (bw + gap)
    const y = h - bh

    // Gradiente vertical de fuego
    const g = ctx.createLinearGradient(x, y, x, h)
    g.addColorStop(0, 'rgba(255,255,200,0.95)')
    g.addColorStop(0.25, colorA)
    g.addColorStop(0.6, colorB)
    g.addColorStop(1, 'transparent')

    ctx.fillStyle = g
    ctx.shadowColor = colorA
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 12 + v * 18 : 0

    // Forma de llama irregular
    ctx.beginPath()
    ctx.moveTo(x, h)
    ctx.quadraticCurveTo(x + bw * 0.2, y + bh * 0.4, x + bw * 0.5, y)
    ctx.quadraticCurveTo(x + bw * 0.8, y + bh * 0.35, x + bw, h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

function drawVortex(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: CommonOpts
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.48
  const arms = opts.lowQuality ? 3 : 5
  const pointsPerArm = opts.lowQuality ? 18 : 28

  for (let a = 0; a < arms; a++) {
    const baseAngle = (a / arms) * Math.PI * 2 + rotation
    ctx.beginPath()
    for (let i = 0; i < pointsPerArm; i++) {
      const t = i / (pointsPerArm - 1)
      const idx = Math.floor(t * (values.length - 1))
      const v = values[idx] / 255
      const r = t * maxR * (0.7 + v * 0.5)
      const angle = baseAngle + t * Math.PI * 1.6
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = colorAt(a / arms)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.shadowColor = colorAt(a / arms)
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 10 : 0
    ctx.globalAlpha = 0.85
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

type Star = { x: number; y: number; z: number; size: number; hueT: number }

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  stars: Star[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean }
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const speed = (opts.playing ? 1.8 : 0.4) * (0.4 + avg)

  if (stars.length < (opts.lowQuality ? 30 : 70) && !opts.reduceMotion) {
    stars.push({
      x: (Math.random() - 0.5) * w * 2,
      y: (Math.random() - 0.5) * h * 2,
      z: Math.random() * 0.8 + 0.2,
      size: 0.8 + Math.random() * 2.2,
      hueT: Math.random(),
    })
  }

  const cx = w / 2
  const cy = h / 2

  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i]
    s.z -= 0.008 * speed
    if (s.z <= 0.05) {
      stars.splice(i, 1)
      continue
    }
    const sx = cx + (s.x / s.z) * 0.5
    const sy = cy + (s.y / s.z) * 0.5
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) {
      stars.splice(i, 1)
      continue
    }
    const size = (s.size / s.z) * (0.6 + avg * 0.8)
    ctx.globalAlpha = clamp(1 - s.z, 0.15, 0.95)
    ctx.fillStyle = colorAt(s.hueT)
    ctx.beginPath()
    ctx.arc(sx, sy, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawLiquid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  multi: 1 | 2 | 3,
  time: number,
  opts: CommonOpts
) {
  const baseY = h * 0.62
  const step = opts.lowQuality ? 6 : 3

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, colorA)
  grad.addColorStop(0.55, colorB)
  grad.addColorStop(1, multi === 3 ? colorC : colorA)

  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += step) {
    const t = x / w
    const idx = Math.floor(t * (values.length - 1))
    const v = values[idx] / 255
    const wave =
      Math.sin(time * 1.1 + t * 8) * 6 +
      Math.sin(time * 0.7 + t * 15) * 3
    const y = baseY - v * h * 0.48 + wave
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.shadowColor = colorB
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 16 : 0
  ctx.globalAlpha = 0.9
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawHeartbeat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  time: number,
  opts: CommonOpts
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const cx = w / 2
  const cy = h / 2

  // Núcleo que late
  const beat = 0.85 + Math.sin(time * 4.2) * 0.15 * (0.5 + avg)
  const r = Math.min(w, h) * 0.16 * beat * (1 + avg * 0.35)

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.45, colorA)
  g.addColorStop(1, colorB)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.shadowColor = colorA
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 20 + avg * 25 : 0
  ctx.fill()
  ctx.shadowBlur = 0

  // Ondas de latido
  for (let i = 1; i <= 3; i++) {
    const rr = r + i * 12 + (time * 30) % 40
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.strokeStyle = colorA
    ctx.globalAlpha = 0.25 / i
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

type MatrixDrop = { x: number; y: number; speed: number; len: number; hueT: number }

function drawMatrix(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  drops: MatrixDrop[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean }
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255

  const cols = Math.floor(w / (opts.lowQuality ? 14 : 10))
  if (drops.length < cols && !opts.reduceMotion) {
    drops.push({
      x: Math.random() * w,
      y: -20,
      speed: 1.2 + Math.random() * 2.5 + avg * 2,
      len: 8 + Math.random() * 18,
      hueT: Math.random(),
    })
  }

  ctx.font = opts.lowQuality ? '11px monospace' : '13px monospace'
  ctx.textAlign = 'center'

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]
    d.y += d.speed * (opts.playing ? 1 : 0.35)
    if (d.y > h + d.len * 14) {
      drops.splice(i, 1)
      continue
    }
    const color = colorAt(d.hueT)
    for (let j = 0; j < d.len; j++) {
      const yy = d.y - j * 14
      if (yy < -10 || yy > h + 10) continue
      ctx.globalAlpha = 1 - j / d.len
      ctx.fillStyle = j === 0 ? '#ffffff' : color
      // Caracteres aleatorios estilo Matrix
      const char = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
      ctx.fillText(char, d.x, yy)
    }
  }
  ctx.globalAlpha = 1
}

/* ────────────────────────────────────────────────────────────────────────
 * Componente principal
 * ──────────────────────────────────────────────────────────────────────── */

export function AudioSpectrum(props: Props) {
  const {
    glass = false,
    height = 100,
    maxWidth = 360,
    className,
    lowQuality: forceLowQuality = false,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const fpsRef = useRef({ frames: 0, last: 0, avg: 60 })
  const qualityRef = useRef(1) // 1 = full, 0.5 = reduced

  const liveRef = useRef(props)
  liveRef.current = props

  // Estado persistente entre frames
  const smoothedRef = useRef<number[]>([])
  const peaksRef = useRef<number[]>([])
  const particlesRef = useRef<Particle[]>([])
  const nebulaRef = useRef<NebulaParticle[]>([])
  const beatRingsRef = useRef<BeatRing[]>([])
  const bassAvgRef = useRef(0)
  const beatCooldownRef = useRef(0)
  const rotationRef = useRef(0)
  const idlePhaseRef = useRef(0)
  const timeRef = useRef(0)
  const starsRef = useRef<Star[]>([])
  const matrixDropsRef = useRef<MatrixDrop[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // getContext con fallback alpha
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // prefers-reduced-motion seguro
    let reduceMotion = false
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        reduceMotion = mq.matches
        // Algunos navegadores antiguos no tienen addEventListener en MediaQueryList
        if (mq.addEventListener) {
          mq.addEventListener('change', (e) => {
            reduceMotion = e.matches
          })
        } else if ((mq as any).addListener) {
          ;(mq as any).addListener((e: MediaQueryListEvent) => {
            reduceMotion = e.matches
          })
        }
      }
    } catch (_) {
      /* ignore */
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      // Limitar DPR en dispositivos lentos / antiguos
      let dpr = 1
      try {
        dpr = Math.min(2.2, window.devicePixelRatio || 1)
      } catch (_) {
        dpr = 1
      }
      if (qualityRef.current < 0.75) dpr = Math.min(dpr, 1.25)
      if (forceLowQuality) dpr = 1

      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      // Estilo CSS siempre 100% para que el layout no se rompa
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }

    resize()

    // ResizeObserver + fallbacks
    let ro: ResizeObserver | null = null
    try {
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(resize)
        ro.observe(container)
      }
    } catch (_) {
      /* ignore */
    }
    window.addEventListener('resize', resize)
    // Fallback extra para orientación móvil antigua
    window.addEventListener('orientationchange', resize)

    let tabHidden = false
    const onVisibility = () => {
      tabHidden = document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Medición simple de FPS para adaptive quality
    const measureFps = (now: number) => {
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 1000) {
        fpsRef.current.avg = fpsRef.current.frames
        fpsRef.current.frames = 0
        fpsRef.current.last = now
        // Bajar calidad si FPS < 28, subir si > 50
        if (fpsRef.current.avg < 28 && qualityRef.current > 0.5) {
          qualityRef.current = 0.55
          resize()
        } else if (fpsRef.current.avg > 50 && qualityRef.current < 1) {
          qualityRef.current = 1
          resize()
        }
      }
    }

    const draw = (now: number) => {
      if (tabHidden) {
        rafRef.current = raf(draw)
        return
      }

      measureFps(now || performance.now())

      const p = liveRef.current
      const { w, h, dpr } = sizeRef.current
      if (w === 0 || h === 0) {
        rafRef.current = raf(draw)
        return
      }

      // setTransform es ampliamente soportado; fallback a scale
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      } catch (_) {
        ctx.scale(dpr, dpr)
      }
      ctx.clearRect(0, 0, w, h)

      const lowQuality = forceLowQuality || qualityRef.current < 0.7 || reduceMotion

      // ── Datos de frecuencia o respiración idle orgánica ──
      const n = lowQuality ? 48 : 64
      const raw: number[] = new Array(n)
      const data = p.getFrequencyData()
      if (data && data.length > 0) {
        for (let i = 0; i < n; i++) {
          raw[i] = data[Math.floor((i / n) * data.length)]
        }
      } else {
        // Respiración más natural (múltiples armónicos)
        idlePhaseRef.current += p.playing ? 0.048 : 0.018
        const base = p.playing ? 32 : 8
        const amp = p.playing ? 22 : 5
        for (let i = 0; i < n; i++) {
          const t = idlePhaseRef.current
          raw[i] =
            base +
            Math.sin(t + i * 0.38) * amp +
            Math.sin(t * 1.65 + i * 0.17) * amp * 0.45 +
            Math.sin(t * 0.7 + i * 0.09) * amp * 0.25
        }
      }

      // ── Suavizado exponencial + picos ──
      if (smoothedRef.current.length !== n) {
        smoothedRef.current = raw.slice()
        peaksRef.current = raw.slice()
      }
      const sm = clamp(p.smoothing ?? 0.32, 0.04, 1)
      const sensitivity = p.sensitivity ?? 1
      for (let i = 0; i < n; i++) {
        const target = clamp(raw[i] * sensitivity, 0, 255)
        // Interpolación más suave (ease-out)
        smoothedRef.current[i] += (target - smoothedRef.current[i]) * sm
        if (smoothedRef.current[i] >= peaksRef.current[i]) {
          peaksRef.current[i] = smoothedRef.current[i]
        } else {
          peaksRef.current[i] = Math.max(
            smoothedRef.current[i],
            peaksRef.current[i] - (lowQuality ? 3.2 : 2.4)
          )
        }
      }
      const values = smoothedRef.current
      const peaks = peaksRef.current

      const heat = clamp(((p.boost ?? 100) - 100) / 200, 0, 1)
      const colorAt = makeColorAt(p.colorA, p.colorB, p.colorC, p.multi)

      timeRef.current += 0.016

      // ── Switch de estilos ──
      switch (p.style) {
        case 'sphere':
          drawSphere(ctx, w, h, values, p.colorA, p.colorB, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'wave':
          drawWave(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            lowQuality,
          })
          break
        case 'mirror':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            mirrored: true,
            lowQuality,
          })
          break
        case 'pulse':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            pulseFloor: true,
            lowQuality,
          })
          break
        case 'rings':
          rotationRef.current +=
            (reduceMotion ? 0.0005 : 0.002) * (p.playing ? 1 : 0.35)
          drawRings(ctx, w, h, values, colorAt, rotationRef.current, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'ribbon':
          drawRibbon(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'dots':
          drawDotsGrid(ctx, w, h, values, colorAt, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'nebula':
          drawNebulaField(ctx, w, h, values, colorAt, nebulaRef.current, {
            playing: p.playing,
            reduceMotion,
            lowQuality,
          })
          break
        case 'circular':
          drawCircular(ctx, w, h, values, colorAt, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'radial':
          drawRadial(ctx, w, h, values, colorAt, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'plasma':
          drawPlasma(
            ctx,
            w,
            h,
            values,
            p.colorA,
            p.colorB,
            p.colorC,
            p.multi,
            timeRef.current,
            { glow: p.glow, heat, lowQuality }
          )
          break
        case 'fire':
          drawFire(ctx, w, h, values, p.colorA, p.colorB, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'vortex':
          rotationRef.current +=
            (reduceMotion ? 0.0008 : 0.0035) * (p.playing ? 1 : 0.3)
          drawVortex(ctx, w, h, values, colorAt, rotationRef.current, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'starfield':
          drawStarfield(ctx, w, h, values, colorAt, starsRef.current, {
            playing: p.playing,
            reduceMotion,
            lowQuality,
          })
          break
        case 'liquid':
          drawLiquid(
            ctx,
            w,
            h,
            values,
            p.colorA,
            p.colorB,
            p.colorC,
            p.multi,
            timeRef.current,
            { glow: p.glow, heat, lowQuality }
          )
          break
        case 'heartbeat':
          drawHeartbeat(ctx, w, h, values, p.colorA, p.colorB, timeRef.current, {
            glow: p.glow,
            heat,
            lowQuality,
          })
          break
        case 'matrix':
          drawMatrix(ctx, w, h, values, colorAt, matrixDropsRef.current, {
            playing: p.playing,
            reduceMotion,
            lowQuality,
          })
          break
        case 'bars':
        default:
          drawBars(ctx, w, h, values, peaks, colorAt, {
            glow: p.glow,
            heat,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            lowQuality,
          })
          break
      }

      // Overlays
      if (p.particles && p.style !== 'nebula' && p.style !== 'starfield' && p.style !== 'matrix') {
        spawnParticles(
          particlesRef.current,
          w,
          h,
          values,
          reduceMotion,
          lowQuality
        )
        updateAndDrawParticles(ctx, particlesRef.current, colorAt)
      }

      if (
        (p.beatReactive ?? true) &&
        (p.style === 'sphere' ||
          p.style === 'rings' ||
          p.style === 'pulse' ||
          p.style === 'circular' ||
          p.style === 'radial' ||
          p.style === 'vortex' ||
          p.style === 'heartbeat')
      ) {
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

      rafRef.current = raf(draw)
    }

    rafRef.current = raf(draw)

    return () => {
      caf(rafRef.current)
      try {
        ro?.disconnect()
      } catch (_) {}
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Estilos del contenedor con fallbacks CSS
  const glassStyles: React.CSSProperties = glass
    ? {
        borderRadius: 20,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        // backdrop-filter con prefijos y fallback
        backdropFilter: 'blur(16px) saturate(1.25)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.25)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 28px rgba(0,0,0,0.2)',
      }
    : {
        borderRadius: 0,
        overflow: 'hidden',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }

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
        ...glassStyles,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          // Evita selección y gestos no deseados en móvil
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
    </div>
  )
}

// Silenciar warnings de linter sobre props no usadas directamente
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