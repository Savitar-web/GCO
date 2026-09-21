/**
 * ============================================================================
 * AudioSpectrum.tsx — visualizador de espectro profesional (GCO)
 * ============================================================================
 * • 36 estilos canvas 2D (sin WebGL) → móvil, PC, Electron, Capacitor, PWA
 * • Idle visible en móvil cuando no hay analyser / modo native-nospec
 * • Calidad adaptativa por FPS + prefers-reduced-motion + lowQuality
 * • Estilo coverOrb: portada + ondas / anillos reactivos
 * • Bandas DJ: bass / mid / treble / voice boost (sensibilidad por banda)
 * • Perfil por canción (localStorage) + restore defaults
 * • DPR limitado, ResizeObserver, rAF polyfill, roundRect fallback
 * ============================================================================
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
 * Tipos públicos
 * ═══════════════════════════════════════════════════════════════════════════ */

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
  | 'coverOrb'
  | 'eqBars'
  | 'duotone'
  | 'aurora'
  | 'crystal'
  | 'spiral'
  | 'hexgrid'
  | 'lightning'
  | 'ocean'
  | 'city'
  | 'dna'
  | 'bloom'
  | 'orbit'
  | 'scanline'
  | 'prism'
  | 'echo'
  | 'waveform'
  | 'galaxy'

export const SPEC_STYLES: { id: SpecStyle; label: string; hint: string }[] = [
  { id: 'bars', label: 'Barras', hint: 'Ecualizador clásico con picos' },
  { id: 'wave', label: 'Onda', hint: 'Silueta suave + reflejo' },
  { id: 'sphere', label: 'Esfera', hint: 'Núcleo pulsante' },
  { id: 'mirror', label: 'Espejo', hint: 'Barras simétricas' },
  { id: 'pulse', label: 'Pulso', hint: 'Barras con piso de energía' },
  { id: 'rings', label: 'Anillos', hint: 'Radial estilo Siri' },
  { id: 'ribbon', label: 'Cinta', hint: 'Trazo líquido multicapa' },
  { id: 'nebula', label: 'Nébula', hint: 'Partículas ambientales' },
  { id: 'dots', label: 'Puntos', hint: 'Matriz LED' },
  { id: 'circular', label: 'Circular', hint: 'Barras en círculo' },
  { id: 'radial', label: 'Radial', hint: 'Rayos desde el centro' },
  { id: 'plasma', label: 'Plasma', hint: 'Campo orgánico' },
  { id: 'fire', label: 'Fuego', hint: 'Llamas ascendentes' },
  { id: 'vortex', label: 'Vórtice', hint: 'Espiral con beat' },
  { id: 'starfield', label: 'Estrellas', hint: 'Campo estelar reactivo' },
  { id: 'liquid', label: 'Líquido', hint: 'Superficie 2.5D' },
  { id: 'heartbeat', label: 'Latido', hint: 'Pulso + ondas' },
  { id: 'matrix', label: 'Matrix', hint: 'Lluvia digital' },
  { id: 'coverOrb', label: 'Portada', hint: 'Cover + ondas/anillos' },
  { id: 'eqBars', label: 'EQ Pro', hint: 'Barras por bandas' },
  { id: 'duotone', label: 'Duotone', hint: 'Dos capas espejo' },
  { id: 'aurora', label: 'Aurora', hint: 'Cortinas boreales' },
  { id: 'crystal', label: 'Cristal', hint: 'Facetas geométricas' },
  { id: 'spiral', label: 'Espiral', hint: 'Helice reactiva' },
  { id: 'hexgrid', label: 'Hexágonos', hint: 'Malla hexagonal' },
  { id: 'lightning', label: 'Rayos', hint: 'Descargas con graves' },
  { id: 'ocean', label: 'Océano', hint: 'Oleaje multicapa' },
  { id: 'city', label: 'Ciudad', hint: 'Skyline de frecuencias' },
  { id: 'dna', label: 'ADN', hint: 'Doble hélice' },
  { id: 'bloom', label: 'Bloom', hint: 'Pétalos radiales' },
  { id: 'orbit', label: 'Órbita', hint: 'Planetas y anillos' },
  { id: 'scanline', label: 'Scan', hint: 'Líneas de escaneo' },
  { id: 'prism', label: 'Prisma', hint: 'Refracción de color' },
  { id: 'echo', label: 'Eco', hint: 'Ondas concéntricas' },
  { id: 'waveform', label: 'Waveform', hint: 'Osciloscopio' },
  { id: 'galaxy', label: 'Galaxia', hint: 'Brazo espiral + núcleo' },
]

/** Ajustes tipo DJ / ecualizador perceptual (no modifica el audio real). */
export type SpecEqBands = {
  /** 0–3, énfasis graves (visual) */
  bass: number
  /** 0–3, medios / guitarra */
  mid: number
  /** 0–3, agudos */
  treble: number
  /** 0–3, zona de voz (~300–3k perceptual) */
  voice: number
  /** 0.2–4, ganancia global visual */
  master: number
}

export const DEFAULT_EQ: SpecEqBands = {
  bass: 1,
  mid: 1,
  treble: 1,
  voice: 1,
  master: 1,
}

export type SpecProfile = {
  style: SpecStyle
  colorA: string
  colorB: string
  colorC: string
  multi: 1 | 2 | 3
  particles: boolean
  glow: boolean
  boost: number
  smoothing: number
  sensitivity: number
  reflection: boolean
  peakCaps: boolean
  beatReactive: boolean
  eq: SpecEqBands
}

export const DEFAULT_PROFILE: SpecProfile = {
  style: 'coverOrb',
  colorA: '#22E6C5',
  colorB: '#8B5CF6',
  colorC: '#F472B6',
  multi: 2,
  particles: true,
  glow: true,
  boost: 100,
  smoothing: 0.32,
  sensitivity: 1,
  reflection: true,
  peakCaps: true,
  beatReactive: true,
  eq: { ...DEFAULT_EQ },
}

const PROFILE_STORE_KEY = 'gco:spectrum-profiles-v1'

export function loadSpecProfile(trackKey: string): SpecProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, SpecProfile>
    return map[trackKey] ?? null
  } catch {
    return null
  }
}

export function saveSpecProfile(trackKey: string, profile: SpecProfile) {
  try {
    const raw = localStorage.getItem(PROFILE_STORE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, SpecProfile>) : {}
    map[trackKey] = profile
    localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

export function clearSpecProfile(trackKey: string) {
  try {
    const raw = localStorage.getItem(PROFILE_STORE_KEY)
    if (!raw) return
    const map = JSON.parse(raw) as Record<string, SpecProfile>
    delete map[trackKey]
    localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(map))
  } catch {
    /* */
  }
}

export function listSpecProfiles(): Record<string, SpecProfile> {
  try {
    const raw = localStorage.getItem(PROFILE_STORE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, SpecProfile>) : {}
  } catch {
    return {}
  }
}

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
  boost?: number
  smoothing?: number
  sensitivity?: number
  reflection?: boolean
  peakCaps?: boolean
  beatReactive?: boolean
  glass?: boolean
  /** Alto por defecto más generoso para móvil/PC */
  height?: number
  maxWidth?: number
  className?: string
  lowQuality?: boolean
  /** URL de portada para estilos coverOrb / orbit */
  coverUrl?: string | null
  /** Bandas DJ visuales */
  eq?: Partial<SpecEqBands>
  /** Clave de canción para auto-cargar/guardar perfil */
  trackKey?: string
  /** Mostrar mini panel DJ (bass/mid/treble/voice) */
  showDjPanel?: boolean
  onEqChange?: (eq: SpecEqBands) => void
  onProfileChange?: (p: SpecProfile) => void
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Utils compat
 * ═══════════════════════════════════════════════════════════════════════════ */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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

const raf =
  typeof window !== 'undefined'
    ? window.requestAnimationFrame ||
      (window as unknown as { webkitRequestAnimationFrame?: typeof requestAnimationFrame })
        .webkitRequestAnimationFrame ||
      ((cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number)
    : (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number

const caf =
  typeof window !== 'undefined'
    ? window.cancelAnimationFrame ||
      (window as unknown as { webkitCancelAnimationFrame?: typeof cancelAnimationFrame })
        .webkitCancelAnimationFrame ||
      clearTimeout
    : clearTimeout

/** Aplica EQ perceptual a bins de frecuencia (solo visual). */
function applyEqBands(values: number[], eq: SpecEqBands): number[] {
  const n = values.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    let gain = eq.master
    if (t < 0.18) gain *= eq.bass
    else if (t < 0.42) gain *= eq.voice * 0.85 + eq.mid * 0.4
    else if (t < 0.7) gain *= eq.mid
    else gain *= eq.treble
    out[i] = clamp(values[i] * gain, 0, 255)
  }
  return out
}

/** Idle orgánico más visible en móvil (sin analyser). */
function synthesizeIdle(n: number, phase: number, playing: boolean): number[] {
  const raw: number[] = new Array(n)
  const base = playing ? 48 : 18
  const amp = playing ? 38 : 14
  for (let i = 0; i < n; i++) {
    const t = phase
    const band = i / n
    raw[i] = clamp(
      base +
        Math.sin(t + i * 0.42) * amp +
        Math.sin(t * 1.7 + i * 0.19) * amp * 0.55 +
        Math.sin(t * 0.55 + i * 0.11) * amp * 0.35 +
        Math.sin(t * 2.3 + band * 6) * amp * 0.2 +
        (playing ? Math.sin(t * 4.1 + i * 0.07) * 10 : 0),
      0,
      255,
    )
  }
  return raw
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Partículas / rings
 * ═══════════════════════════════════════════════════════════════════════════ */

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

type BeatRing = { r: number; alpha: number; speed: number }

type NebulaParticle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hueT: number
  alpha: number
}

type Star = { x: number; y: number; z: number; hueT: number }
type MatrixDrop = { x: number; y: number; speed: number; len: number; hueT: number }

function spawnParticles(
  list: Particle[],
  w: number,
  h: number,
  values: number[],
  reduceMotion: boolean,
  lowQuality: boolean,
) {
  if (reduceMotion || list.length > (lowQuality ? 36 : 120)) return
  const count = lowQuality ? 1 : 2
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * values.length)
    const v = values[idx] / 255
    if (v < 0.22) continue
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

function updateAndDrawParticles(ctx: CanvasRenderingContext2D, list: Particle[], colorAt: ColorAt) {
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
    ctx.globalAlpha = Math.max(0, Math.sin(Math.PI * lifeT) * 0.9)
    ctx.fillStyle = colorAt(p.hueT)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function updateBeatRings(
  rings: BeatRing[],
  bassAvgRef: { current: number },
  cooldownRef: { current: number },
  values: number[],
  playing: boolean,
  w: number,
  h: number,
): BeatRing[] {
  const bassCount = Math.max(4, Math.floor(values.length * 0.14))
  let sum = 0
  for (let i = 0; i < bassCount; i++) sum += values[i]
  const bass = sum / bassCount / 255
  bassAvgRef.current += (bass - bassAvgRef.current) * 0.055
  if (cooldownRef.current > 0) cooldownRef.current--
  if (playing && bass > bassAvgRef.current * 1.42 && bass > 0.32 && cooldownRef.current <= 0) {
    rings.push({ r: Math.min(w, h) * 0.12, alpha: 0.62, speed: Math.max(w, h) * 0.011 })
    cooldownRef.current = 10
  }
  return rings
    .map((r) => ({ r: r.r + r.speed, alpha: r.alpha - 0.018, speed: r.speed }))
    .filter((r) => r.alpha > 0.02)
}

function drawBeatRings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rings: BeatRing[],
  color: string,
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Draw styles (core + nuevos)
 * ═══════════════════════════════════════════════════════════════════════════ */

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
  opts: CommonOpts,
) {
  const n = Math.min(opts.lowQuality ? 28 : 56, values.length)
  const gap = Math.max(1.5, w * 0.005)
  const bw = (w - gap * (n - 1)) / n
  const baseH = opts.reflection ? h * 0.7 : h
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    let bh = v * baseH * 0.92 * (1 + opts.heat * 0.14)
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
      const py = baseH - pv * baseH * 0.92 * (1 + opts.heat * 0.14)
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
  opts: CommonOpts,
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
  opts: CommonOpts,
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
  opts: CommonOpts,
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
    const color = colorAt(i / n)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.3, ((Math.PI * 2 * baseR) / n) * 0.5)
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 7 + opts.heat * 9 : 0
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
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
  opts: CommonOpts,
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
      const p = points[i]
      if (i === 0) ctx.moveTo(p.x, p.y + layer.offsetY)
      else ctx.lineTo(p.x, p.y + layer.offsetY)
    }
    ctx.strokeStyle = grad
    ctx.globalAlpha = layer.alpha
    ctx.lineWidth = layer.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = colorB
    ctx.shadowBlur = opts.glow && !opts.lowQuality && layer.alpha > 0.5 ? 10 : 0
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
  opts: CommonOpts,
) {
  const cols = opts.lowQuality ? 16 : 24
  const rows = opts.lowQuality ? 6 : 10
  const cw = w / cols
  const ch = h / rows
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = Math.floor((col / cols) * values.length)
      const v = values[idx] / 255
      const threshold = 1 - (row + 1) / rows
      if (v < threshold * 0.85) continue
      const r = Math.min(cw, ch) * 0.32 * (0.5 + v)
      ctx.fillStyle = colorAt(col / cols)
      ctx.globalAlpha = 0.4 + v * 0.6
      ctx.shadowColor = colorAt(col / cols)
      ctx.shadowBlur = opts.glow && !opts.lowQuality ? 4 + v * 6 : 0
      ctx.beginPath()
      ctx.arc(col * cw + cw / 2, row * ch + ch / 2, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawNebulaField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  particles: NebulaParticle[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean },
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const target = opts.lowQuality ? 40 : opts.reduceMotion ? 28 : 90
  while (particles.length < target && !opts.reduceMotion) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1 + Math.random() * 3 + avg * 2,
      hueT: Math.random(),
      alpha: 0.25 + Math.random() * 0.5,
    })
  }
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.x += p.vx * (opts.playing ? 1 + avg : 0.4)
    p.y += p.vy * (opts.playing ? 1 + avg : 0.4)
    if (p.x < 0) p.x = w
    if (p.x > w) p.x = 0
    if (p.y < 0) p.y = h
    if (p.y > h) p.y = 0
    ctx.globalAlpha = p.alpha * (0.5 + avg)
    ctx.fillStyle = colorAt(p.hueT)
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * (1 + avg * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawCircular(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  const inner = base * 0.22
  const n = Math.min(opts.lowQuality ? 40 : 72, values.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 0.7) / n) * Math.PI * 2 - Math.PI / 2
    const outer = inner + v * base * 0.32 * (1 + opts.heat * 0.1)
    ctx.beginPath()
    ctx.arc(cx, cy, outer, a0, a1)
    ctx.arc(cx, cy, inner, a1, a0, true)
    ctx.closePath()
    ctx.fillStyle = colorAt(i / n)
    ctx.shadowColor = colorAt(i / n)
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 6 : 0
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.48
  const n = Math.min(opts.lowQuality ? 48 : 90, values.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2
    ctx.strokeStyle = colorAt(i / n)
    ctx.lineWidth = Math.max(1, (Math.PI * 2 * maxR) / n / 2.5)
    ctx.globalAlpha = 0.35 + v * 0.65
    ctx.shadowColor = colorAt(i / n)
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 5 : 0
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * maxR * v, cy + Math.sin(angle) * maxR * v)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
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
  opts: CommonOpts,
) {
  const step = opts.lowQuality ? 8 : 5
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const nx = x / w
      const ny = y / h
      const idx = Math.floor(nx * (values.length - 1))
      const v = values[idx] / 255
      const n =
        Math.sin(nx * 6 + time) * Math.cos(ny * 5 - time * 0.7) * 0.5 +
        Math.sin((nx + ny) * 4 + time * 1.3) * 0.3 +
        v * 0.6
      const t = clamp((n + 1) / 2, 0, 1)
      ctx.globalAlpha = 0.35 + v * 0.45
      ctx.fillStyle = t < 0.33 ? colorA : t < 0.66 ? colorB : multi === 3 ? colorC : colorA
      ctx.fillRect(x, y, step + 1, step + 1)
    }
  }
  ctx.globalAlpha = 1
  void opts
}

function drawFire(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  opts: CommonOpts,
) {
  const n = Math.min(opts.lowQuality ? 24 : 40, values.length)
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const bh = v * h * 0.95
    const grad = ctx.createLinearGradient(0, h - bh, 0, h)
    grad.addColorStop(0, colorA)
    grad.addColorStop(0.5, colorB)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.55 + v * 0.45
    ctx.shadowColor = colorA
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 8 + v * 12 : 0
    const sway = Math.sin(i * 0.7 + v * 4) * bw * 0.25
    roundRectPath(ctx, i * bw + sway * 0.3, h - bh, bw * 0.85, bh, bw * 0.4)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawVortex(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.48
  const arms = opts.lowQuality ? 3 : 5
  const n = values.length
  for (let a = 0; a < arms; a++) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const t = i / n
      const v = values[i] / 255
      const angle = rotation + a * ((Math.PI * 2) / arms) + t * Math.PI * 3
      const r = t * maxR * (0.55 + v * 0.55)
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = colorAt(a / arms)
    ctx.lineWidth = opts.lowQuality ? 2 : 2.5
    ctx.globalAlpha = 0.7
    ctx.shadowColor = colorAt(a / arms)
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 10 : 0
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  stars: Star[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean },
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const target = opts.lowQuality ? 50 : opts.reduceMotion ? 40 : 120
  while (stars.length < target) {
    stars.push({
      x: (Math.random() - 0.5) * w,
      y: (Math.random() - 0.5) * h,
      z: Math.random() * w,
      hueT: Math.random(),
    })
  }
  const speed = (opts.playing ? 4 : 1.2) * (1 + avg * 2)
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]
    s.z -= speed
    if (s.z <= 1) {
      s.z = w
      s.x = (Math.random() - 0.5) * w
      s.y = (Math.random() - 0.5) * h
    }
    const k = 128 / s.z
    const sx = s.x * k + w / 2
    const sy = s.y * k + h / 2
    const r = (1 - s.z / w) * 2.8 * (1 + avg)
    if (sx < 0 || sx > w || sy < 0 || sy > h) continue
    ctx.fillStyle = colorAt(s.hueT)
    ctx.globalAlpha = clamp(1 - s.z / w, 0.15, 1)
    ctx.beginPath()
    ctx.arc(sx, sy, Math.max(0.4, r), 0, Math.PI * 2)
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
  opts: CommonOpts,
) {
  const layers = opts.lowQuality ? 2 : 3
  for (let L = 0; L < layers; L++) {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += opts.lowQuality ? 6 : 3) {
      const idx = Math.floor((x / w) * (values.length - 1))
      const v = values[idx] / 255
      const y =
        h * 0.55 -
        Math.sin(x * 0.02 + time * (1 + L * 0.3) + L) * 12 -
        v * h * 0.35 * (1 - L * 0.15)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, L === 0 ? colorA : L === 1 ? colorB : multi === 3 ? colorC : colorA)
    g.addColorStop(1, 'transparent')
    ctx.fillStyle = g
    ctx.globalAlpha = 0.35 + L * 0.15
    ctx.fill()
  }
  ctx.globalAlpha = 1
  void opts
}

function drawHeartbeat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  time: number,
  opts: CommonOpts,
) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const cx = w / 2
  const cy = h / 2
  const beat = 0.85 + Math.sin(time * 6) * 0.15 * (0.5 + avg)
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

function drawMatrix(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  drops: MatrixDrop[],
  opts: { playing: boolean; reduceMotion: boolean; lowQuality: boolean },
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
      const char = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
      ctx.fillText(char, d.x, yy)
    }
  }
  ctx.globalAlpha = 1
}

/** Portada + ondas / anillos — estilo estrella para móvil */
function drawCoverOrb(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  coverImg: HTMLImageElement | null,
  rotation: number,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const coverR = base * 0.22 * (1 + avg * 0.08)

  // Anillos reactivos
  const n = Math.min(opts.lowQuality ? 32 : 56, values.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const angle = (i / n) * Math.PI * 2 + rotation
    const r1 = coverR + 6
    const r2 = r1 + v * base * 0.28 * (1 + opts.heat * 0.12)
    ctx.strokeStyle = colorAt(i / n)
    ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * r1) / n) * 0.55)
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.55 + v * 0.45
    ctx.shadowColor = colorAt(i / n)
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 6 + v * 8 : 0
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1

  // Disco / portada
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, coverR, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (coverImg && coverImg.complete && coverImg.naturalWidth > 0) {
    const size = coverR * 2
    ctx.drawImage(coverImg, cx - coverR, cy - coverR, size, size)
  } else {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coverR)
    g.addColorStop(0, colorAt(0))
    g.addColorStop(1, colorAt(1))
    ctx.fillStyle = g
    ctx.fillRect(cx - coverR, cy - coverR, coverR * 2, coverR * 2)
  }
  ctx.restore()

  // Borde glow
  ctx.beginPath()
  ctx.arc(cx, cy, coverR, 0, Math.PI * 2)
  ctx.strokeStyle = colorAt(0.5)
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.7
  ctx.shadowColor = colorAt(0)
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 12 + avg * 16 : 0
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
}

function drawEqBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  // 10 bandas tipo EQ de estudio
  const bands = 10
  const labels = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
  const gap = 6
  const bw = (w - gap * (bands - 1)) / bands
  for (let b = 0; b < bands; b++) {
    const start = Math.floor((b / bands) * values.length)
    const end = Math.floor(((b + 1) / bands) * values.length)
    let sum = 0
    for (let i = start; i < end; i++) sum += values[i]
    const v = sum / Math.max(1, end - start) / 255
    const bh = v * h * 0.85
    const x = b * (bw + gap)
    const color = colorAt(b / bands)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 8 : 0
    roundRectPath(ctx, x, h - bh - 14, bw, bh, 4)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.55
    ctx.fillStyle = colorAt(b / bands)
    ctx.font = `${Math.max(8, Math.min(11, bw * 0.35))}px system-ui,sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(labels[b], x + bw / 2, h - 3)
    ctx.globalAlpha = 1
  }
}

function drawDuotone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  opts: CommonOpts,
) {
  const mid = h / 2
  const n = values.length
  const step = w / Math.max(1, n - 1)
  // capa superior
  ctx.beginPath()
  ctx.moveTo(0, mid)
  for (let i = 0; i < n; i++) {
    ctx.lineTo(i * step, mid - (values[i] / 255) * mid * 0.9)
  }
  ctx.lineTo(w, mid)
  ctx.closePath()
  ctx.fillStyle = colorA
  ctx.globalAlpha = 0.85
  ctx.fill()
  // capa inferior espejo
  ctx.beginPath()
  ctx.moveTo(0, mid)
  for (let i = 0; i < n; i++) {
    ctx.lineTo(i * step, mid + (values[i] / 255) * mid * 0.9)
  }
  ctx.lineTo(w, mid)
  ctx.closePath()
  ctx.fillStyle = colorB
  ctx.fill()
  ctx.globalAlpha = 1
  void opts
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  time: number,
  opts: CommonOpts,
) {
  const layers = opts.lowQuality ? 2 : 4
  for (let L = 0; L < layers; L++) {
    ctx.beginPath()
    for (let x = 0; x <= w; x += opts.lowQuality ? 8 : 4) {
      const idx = Math.floor((x / w) * (values.length - 1))
      const v = values[idx] / 255
      const y =
        h * (0.25 + L * 0.12) +
        Math.sin(x * 0.015 + time * (0.8 + L * 0.2) + L) * 18 +
        v * h * 0.25
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = L % 3 === 0 ? colorA : L % 3 === 1 ? colorB : colorC
    ctx.lineWidth = opts.lowQuality ? 3 : 5 - L
    ctx.globalAlpha = 0.25 + (1 - L / layers) * 0.35
    ctx.shadowColor = colorA
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 12 : 0
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawCrystal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const facets = opts.lowQuality ? 8 : 12
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const R = Math.min(w, h) * 0.38 * (0.75 + avg * 0.35)
  for (let i = 0; i < facets; i++) {
    const a0 = (i / facets) * Math.PI * 2
    const a1 = ((i + 1) / facets) * Math.PI * 2
    const idx = Math.floor((i / facets) * values.length)
    const v = values[idx] / 255
    const r = R * (0.55 + v * 0.55)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r)
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
    ctx.closePath()
    ctx.fillStyle = colorAt(i / facets)
    ctx.globalAlpha = 0.35 + v * 0.5
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.4
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  void opts
}

function drawSpiral(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.46
  ctx.beginPath()
  for (let i = 0; i < values.length; i++) {
    const t = i / values.length
    const v = values[i] / 255
    const angle = rotation + t * Math.PI * 6
    const r = t * maxR * (0.6 + v * 0.5)
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = colorAt(0.5)
  ctx.lineWidth = 2.5
  ctx.shadowColor = colorAt(0)
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 12 : 0
  ctx.stroke()
  ctx.shadowBlur = 0
}

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const size = opts.lowQuality ? 16 : 12
  const hw = size * Math.sqrt(3)
  let col = 0
  for (let y = 0; y < h + size; y += size * 1.5) {
    const offset = (col % 2) * (hw / 2)
    col++
    for (let x = -hw; x < w + hw; x += hw) {
      const nx = clamp((x + offset) / w, 0, 1)
      const idx = Math.floor(nx * (values.length - 1))
      const v = values[idx] / 255
      if (v < 0.12) continue
      const cx = x + offset
      const cy = y
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6
        const px = cx + Math.cos(a) * size * (0.4 + v * 0.6)
        const py = cy + Math.sin(a) * size * (0.4 + v * 0.6)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = colorAt(nx)
      ctx.globalAlpha = 0.25 + v * 0.7
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawLightning(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  opts: CommonOpts,
) {
  let sum = 0
  const bassN = Math.max(4, Math.floor(values.length * 0.15))
  for (let i = 0; i < bassN; i++) sum += values[i]
  const bass = sum / bassN / 255
  if (bass < 0.35 && !opts.lowQuality) {
    // trazo suave de fondo
    ctx.strokeStyle = colorA
    ctx.globalAlpha = 0.15
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w * 0.5, 0)
    ctx.lineTo(w * 0.5, h)
    ctx.stroke()
    ctx.globalAlpha = 1
    return
  }
  const bolts = opts.lowQuality ? 1 : 2 + Math.floor(bass * 3)
  for (let b = 0; b < bolts; b++) {
    let x = w * (0.2 + Math.random() * 0.6)
    let y = 0
    ctx.beginPath()
    ctx.moveTo(x, y)
    while (y < h) {
      x += (Math.random() - 0.5) * 28
      y += 8 + Math.random() * 18
      ctx.lineTo(clamp(x, 0, w), y)
    }
    ctx.strokeStyle = colorA
    ctx.lineWidth = 1.5 + bass * 2
    ctx.globalAlpha = 0.4 + bass * 0.5
    ctx.shadowColor = colorA
    ctx.shadowBlur = opts.glow ? 14 : 0
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawOcean(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  time: number,
  opts: CommonOpts,
) {
  for (let L = 0; L < (opts.lowQuality ? 2 : 3); L++) {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 4) {
      const idx = Math.floor((x / w) * (values.length - 1))
      const v = values[idx] / 255
      const y =
        h * 0.62 +
        Math.sin(x * 0.02 + time * 1.2 + L * 1.4) * (10 + L * 4) -
        v * h * 0.28
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, L === 0 ? colorA : colorB)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.globalAlpha = 0.3 + L * 0.15
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawCity(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const n = Math.min(opts.lowQuality ? 20 : 36, values.length)
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const bh = (0.15 + v * 0.8) * h
    const x = i * bw
    ctx.fillStyle = colorAt(i / n)
    ctx.globalAlpha = 0.75
    ctx.fillRect(x + 1, h - bh, bw - 2, bh)
    // ventanas
    if (!opts.lowQuality && v > 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      for (let wy = h - bh + 4; wy < h - 4; wy += 6) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
          if (Math.random() > 0.45) ctx.fillRect(wx, wy, 2, 2)
        }
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawDna(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  time: number,
  opts: CommonOpts,
) {
  const midY = h / 2
  const step = w / Math.max(1, values.length - 1)
  for (let strand = 0; strand < 2; strand++) {
    ctx.beginPath()
    for (let i = 0; i < values.length; i++) {
      const v = values[i] / 255
      const x = i * step
      const y = midY + Math.sin(i * 0.35 + time * 2 + strand * Math.PI) * (h * 0.28) * (0.5 + v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = strand === 0 ? colorA : colorB
    ctx.lineWidth = 2.2
    ctx.shadowColor = strand === 0 ? colorA : colorB
    ctx.shadowBlur = opts.glow && !opts.lowQuality ? 8 : 0
    ctx.stroke()
  }
  // peldaños
  for (let i = 0; i < values.length; i += opts.lowQuality ? 4 : 2) {
    const v = values[i] / 255
    const x = i * step
    const y1 = midY + Math.sin(i * 0.35 + time * 2) * (h * 0.28) * (0.5 + v)
    const y2 = midY + Math.sin(i * 0.35 + time * 2 + Math.PI) * (h * 0.28) * (0.5 + v)
    ctx.strokeStyle = colorA
    ctx.globalAlpha = 0.35 + v * 0.4
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y1)
    ctx.lineTo(x, y2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const petals = opts.lowQuality ? 8 : 14
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  for (let i = 0; i < petals; i++) {
    const idx = Math.floor((i / petals) * values.length)
    const v = values[idx] / 255
    const angle = (i / petals) * Math.PI * 2
    const len = Math.min(w, h) * 0.18 * (0.6 + v) * (1 + avg * 0.2)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.ellipse(0, -len * 0.6, len * 0.28, len * 0.65, 0, 0, Math.PI * 2)
    ctx.fillStyle = colorAt(i / petals)
    ctx.globalAlpha = 0.35 + v * 0.5
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = 1
  void opts
}

function drawOrbit(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  coverImg: HTMLImageElement | null,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const base = Math.min(w, h)
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  // órbitas
  for (let o = 1; o <= 3; o++) {
    const rr = base * (0.15 + o * 0.1)
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.strokeStyle = colorAt(o / 3)
    ctx.globalAlpha = 0.2
    ctx.lineWidth = 1
    ctx.stroke()
    const angle = rotation * (1 + o * 0.3) + o
    const px = cx + Math.cos(angle) * rr
    const py = cy + Math.sin(angle) * rr
    const pr = 3 + avg * 5 + (values[Math.floor((o / 3) * values.length)] / 255) * 6
    ctx.globalAlpha = 0.9
    ctx.fillStyle = colorAt(o / 3)
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // núcleo cover
  const cr = base * 0.12
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  ctx.clip()
  if (coverImg && coverImg.complete && coverImg.naturalWidth > 0) {
    ctx.drawImage(coverImg, cx - cr, cy - cr, cr * 2, cr * 2)
  } else {
    ctx.fillStyle = colorAt(0)
    ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2)
  }
  ctx.restore()
  void opts
}

function drawScanline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  time: number,
  opts: CommonOpts,
) {
  const lineY = ((time * 40) % (h + 20)) - 10
  // waveform background
  ctx.beginPath()
  const step = w / Math.max(1, values.length - 1)
  for (let i = 0; i < values.length; i++) {
    const y = h / 2 - (values[i] / 255) * h * 0.4
    if (i === 0) ctx.moveTo(i * step, y)
    else ctx.lineTo(i * step, y)
  }
  ctx.strokeStyle = colorA
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.5
  ctx.stroke()
  // scan
  const g = ctx.createLinearGradient(0, lineY - 20, 0, lineY + 20)
  g.addColorStop(0, 'transparent')
  g.addColorStop(0.5, colorB)
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.globalAlpha = 0.35
  ctx.fillRect(0, lineY - 20, w, 40)
  ctx.globalAlpha = 1
  void opts
}

function drawPrism(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  colorB: string,
  colorC: string,
  opts: CommonOpts,
) {
  const n = Math.min(opts.lowQuality ? 20 : 32, values.length)
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * values.length)
    const v = values[idx] / 255
    const bh = v * h * 0.9
    const x = i * bw
    const g = ctx.createLinearGradient(x, h - bh, x + bw, h)
    g.addColorStop(0, colorA)
    g.addColorStop(0.5, colorB)
    g.addColorStop(1, colorC)
    ctx.fillStyle = g
    ctx.globalAlpha = 0.7 + v * 0.3
    ctx.fillRect(x, h - bh, bw * 0.9, bh)
  }
  ctx.globalAlpha = 1
}

function drawEcho(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  time: number,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const avg = sum / values.length / 255
  const rings = opts.lowQuality ? 4 : 7
  for (let i = 0; i < rings; i++) {
    const phase = (time * 0.8 + i * 0.35) % 1
    const r = Math.min(w, h) * 0.1 + phase * Math.min(w, h) * 0.4 * (0.7 + avg)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = colorAt(i / rings)
    ctx.globalAlpha = (1 - phase) * (0.3 + avg * 0.5)
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  void opts
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorA: string,
  opts: CommonOpts,
) {
  const mid = h / 2
  const step = w / Math.max(1, values.length - 1)
  ctx.beginPath()
  for (let i = 0; i < values.length; i++) {
    const y = mid - ((values[i] / 255) * 2 - 1) * mid * 0.85
    if (i === 0) ctx.moveTo(i * step, y)
    else ctx.lineTo(i * step, y)
  }
  ctx.strokeStyle = colorA
  ctx.lineWidth = 2
  ctx.shadowColor = colorA
  ctx.shadowBlur = opts.glow && !opts.lowQuality ? 10 : 0
  ctx.stroke()
  ctx.shadowBlur = 0
  // centro
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()
}

function drawGalaxy(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  values: number[],
  colorAt: ColorAt,
  rotation: number,
  opts: CommonOpts,
) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.48
  const arms = 3
  for (let a = 0; a < arms; a++) {
    for (let i = 0; i < values.length; i++) {
      const t = i / values.length
      const v = values[i] / 255
      const angle = rotation + a * ((Math.PI * 2) / arms) + t * Math.PI * 2.5
      const r = t * maxR
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      ctx.fillStyle = colorAt(t)
      ctx.globalAlpha = 0.2 + v * 0.7
      ctx.beginPath()
      ctx.arc(x, y, 1 + v * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // núcleo
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.2)
  g.addColorStop(0, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.4, colorAt(0))
  g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 1
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, maxR * 0.2, 0, Math.PI * 2)
  ctx.fill()
  void opts
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Componente principal
 * ═══════════════════════════════════════════════════════════════════════════ */

export function AudioSpectrum(props: Props) {
  const {
    glass = false,
    height = 148,
    maxWidth = 480,
    className,
    lowQuality: forceLowQuality = false,
    coverUrl = null,
    showDjPanel = false,
    trackKey,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const fpsRef = useRef({ frames: 0, last: 0, avg: 60 })
  const qualityRef = useRef(1)

  const liveRef = useRef(props)
  liveRef.current = props

  const [eqLocal, setEqLocal] = useState<SpecEqBands>(() => ({
    ...DEFAULT_EQ,
    ...props.eq,
  }))

  useEffect(() => {
    if (props.eq) setEqLocal((prev) => ({ ...prev, ...props.eq }))
  }, [props.eq])

  // Cargar perfil por canción
  useEffect(() => {
    if (!trackKey) return
    const saved = loadSpecProfile(trackKey)
    if (saved?.eq) {
      setEqLocal(saved.eq)
      props.onEqChange?.(saved.eq)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey])

  const coverImgRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!coverUrl) {
      coverImgRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      coverImgRef.current = img
    }
    img.onerror = () => {
      coverImgRef.current = null
    }
    img.src = coverUrl
  }, [coverUrl])

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
  const noDataFramesRef = useRef(0)

  const mergedEq = useMemo(
    () => ({ ...DEFAULT_EQ, ...props.eq, ...eqLocal }),
    [props.eq, eqLocal],
  )

  const updateEq = useCallback(
    (patch: Partial<SpecEqBands>) => {
      setEqLocal((prev) => {
        const next = { ...prev, ...patch }
        props.onEqChange?.(next)
        if (trackKey) {
          const profile: SpecProfile = {
            style: props.style,
            colorA: props.colorA,
            colorB: props.colorB,
            colorC: props.colorC,
            multi: props.multi,
            particles: props.particles,
            glow: props.glow,
            boost: props.boost ?? 100,
            smoothing: props.smoothing ?? 0.32,
            sensitivity: props.sensitivity ?? 1,
            reflection: props.reflection ?? true,
            peakCaps: props.peakCaps ?? true,
            beatReactive: props.beatReactive ?? true,
            eq: next,
          }
          saveSpecProfile(trackKey, profile)
          props.onProfileChange?.(profile)
        }
        return next
      })
    },
    [props, trackKey],
  )

  const restoreDefaults = useCallback(() => {
    setEqLocal({ ...DEFAULT_EQ })
    props.onEqChange?.({ ...DEFAULT_EQ })
    if (trackKey) clearSpecProfile(trackKey)
  }, [props, trackKey])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let reduceMotion = false
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        reduceMotion = mq.matches
        if (mq.addEventListener) {
          mq.addEventListener('change', (e) => {
            reduceMotion = e.matches
          })
        } else if (
          (mq as MediaQueryList & { addListener?: (cb: (e: MediaQueryListEvent) => void) => void })
            .addListener
        ) {
          ;(
            mq as MediaQueryList & { addListener: (cb: (e: MediaQueryListEvent) => void) => void }
          ).addListener((e) => {
            reduceMotion = e.matches
          })
        }
      }
    } catch {
      /* */
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      let dpr = 1
      try {
        dpr = Math.min(2.2, window.devicePixelRatio || 1)
      } catch {
        dpr = 1
      }
      if (qualityRef.current < 0.75) dpr = Math.min(dpr, 1.25)
      if (forceLowQuality) dpr = 1
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }

    resize()

    let ro: ResizeObserver | null = null
    try {
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(resize)
        ro.observe(container)
      }
    } catch {
      /* */
    }
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)

    let tabHidden = false
    const onVisibility = () => {
      tabHidden = document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    const measureFps = (now: number) => {
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 1000) {
        fpsRef.current.avg = fpsRef.current.frames
        fpsRef.current.frames = 0
        fpsRef.current.last = now
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

      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      } catch {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(dpr, dpr)
      }
      ctx.clearRect(0, 0, w, h)

      const lowQuality = forceLowQuality || qualityRef.current < 0.7 || reduceMotion
      const n = lowQuality ? 48 : 64

      // Datos o idle
      let raw: number[]
      const data = p.getFrequencyData()
      const hasData =
        !!data &&
        data.length > 0 &&
        (() => {
          let s = 0
          const lim = Math.min(data.length, 32)
          for (let i = 0; i < lim; i++) s += data[i]
          return s > 8
        })()

      if (hasData && data) {
        noDataFramesRef.current = 0
        raw = new Array(n)
        for (let i = 0; i < n; i++) {
          raw[i] = data[Math.floor((i / n) * data.length)]
        }
      } else {
        noDataFramesRef.current++
        idlePhaseRef.current += p.playing ? 0.055 : 0.022
        // Idle más visible (sobre todo móvil sin analyser)
        raw = synthesizeIdle(n, idlePhaseRef.current, p.playing)
      }

      // EQ visual
      const eq = { ...DEFAULT_EQ, ...p.eq, ...eqLocal }
      raw = applyEqBands(raw, eq)

      if (smoothedRef.current.length !== n) {
        smoothedRef.current = raw.slice()
        peaksRef.current = raw.slice()
      }
      const sm = clamp(p.smoothing ?? 0.32, 0.04, 1)
      const sensitivity = p.sensitivity ?? 1
      for (let i = 0; i < n; i++) {
        const target = clamp(raw[i] * sensitivity, 0, 255)
        smoothedRef.current[i] += (target - smoothedRef.current[i]) * sm
        if (smoothedRef.current[i] >= peaksRef.current[i]) {
          peaksRef.current[i] = smoothedRef.current[i]
        } else {
          peaksRef.current[i] = Math.max(
            smoothedRef.current[i],
            peaksRef.current[i] - (lowQuality ? 3.2 : 2.4),
          )
        }
      }
      const values = smoothedRef.current
      const peaks = peaksRef.current
      const heat = clamp(((p.boost ?? 100) - 100) / 200, 0, 1)
      const colorAt = makeColorAt(p.colorA, p.colorB, p.colorC, p.multi)
      timeRef.current += 0.016
      const common: CommonOpts = { glow: p.glow, heat, lowQuality }

      switch (p.style) {
        case 'sphere':
          drawSphere(ctx, w, h, values, p.colorA, p.colorB, common)
          break
        case 'wave':
          drawWave(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, {
            ...common,
            reflection: p.reflection ?? false,
          })
          break
        case 'mirror':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            ...common,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            mirrored: true,
          })
          break
        case 'pulse':
          drawBars(ctx, w, h, values, peaks, colorAt, {
            ...common,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
            pulseFloor: true,
          })
          break
        case 'rings':
          rotationRef.current += (reduceMotion ? 0.0005 : 0.002) * (p.playing ? 1 : 0.35)
          drawRings(ctx, w, h, values, colorAt, rotationRef.current, common)
          break
        case 'ribbon':
          drawRibbon(ctx, w, h, values, p.colorA, p.colorB, p.colorC, p.multi, common)
          break
        case 'dots':
          drawDotsGrid(ctx, w, h, values, colorAt, common)
          break
        case 'nebula':
          drawNebulaField(ctx, w, h, values, colorAt, nebulaRef.current, {
            playing: p.playing,
            reduceMotion,
            lowQuality,
          })
          break
        case 'circular':
          drawCircular(ctx, w, h, values, colorAt, common)
          break
        case 'radial':
          drawRadial(ctx, w, h, values, colorAt, common)
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
            common,
          )
          break
        case 'fire':
          drawFire(ctx, w, h, values, p.colorA, p.colorB, common)
          break
        case 'vortex':
          rotationRef.current += (reduceMotion ? 0.0008 : 0.0035) * (p.playing ? 1 : 0.3)
          drawVortex(ctx, w, h, values, colorAt, rotationRef.current, common)
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
            common,
          )
          break
        case 'heartbeat':
          drawHeartbeat(ctx, w, h, values, p.colorA, p.colorB, timeRef.current, common)
          break
        case 'matrix':
          drawMatrix(ctx, w, h, values, colorAt, matrixDropsRef.current, {
            playing: p.playing,
            reduceMotion,
            lowQuality,
          })
          break
        case 'coverOrb':
          rotationRef.current += (reduceMotion ? 0.0006 : 0.0022) * (p.playing ? 1 : 0.4)
          drawCoverOrb(
            ctx,
            w,
            h,
            values,
            colorAt,
            coverImgRef.current,
            rotationRef.current,
            common,
          )
          break
        case 'eqBars':
          drawEqBars(ctx, w, h, values, colorAt, common)
          break
        case 'duotone':
          drawDuotone(ctx, w, h, values, p.colorA, p.colorB, common)
          break
        case 'aurora':
          drawAurora(ctx, w, h, values, p.colorA, p.colorB, p.colorC, timeRef.current, common)
          break
        case 'crystal':
          drawCrystal(ctx, w, h, values, colorAt, common)
          break
        case 'spiral':
          rotationRef.current += (reduceMotion ? 0.0005 : 0.002) * (p.playing ? 1 : 0.3)
          drawSpiral(ctx, w, h, values, colorAt, rotationRef.current, common)
          break
        case 'hexgrid':
          drawHexGrid(ctx, w, h, values, colorAt, common)
          break
        case 'lightning':
          drawLightning(ctx, w, h, values, p.colorA, common)
          break
        case 'ocean':
          drawOcean(ctx, w, h, values, p.colorA, p.colorB, timeRef.current, common)
          break
        case 'city':
          drawCity(ctx, w, h, values, colorAt, common)
          break
        case 'dna':
          drawDna(ctx, w, h, values, p.colorA, p.colorB, timeRef.current, common)
          break
        case 'bloom':
          drawBloom(ctx, w, h, values, colorAt, common)
          break
        case 'orbit':
          rotationRef.current += (reduceMotion ? 0.0004 : 0.0018) * (p.playing ? 1 : 0.35)
          drawOrbit(
            ctx,
            w,
            h,
            values,
            colorAt,
            rotationRef.current,
            coverImgRef.current,
            common,
          )
          break
        case 'scanline':
          drawScanline(ctx, w, h, values, p.colorA, p.colorB, timeRef.current, common)
          break
        case 'prism':
          drawPrism(ctx, w, h, values, p.colorA, p.colorB, p.colorC, common)
          break
        case 'echo':
          drawEcho(ctx, w, h, values, colorAt, timeRef.current, common)
          break
        case 'waveform':
          drawWaveform(ctx, w, h, values, p.colorA, common)
          break
        case 'galaxy':
          rotationRef.current += (reduceMotion ? 0.0003 : 0.0012) * (p.playing ? 1 : 0.3)
          drawGalaxy(ctx, w, h, values, colorAt, rotationRef.current, common)
          break
        case 'bars':
        default:
          drawBars(ctx, w, h, values, peaks, colorAt, {
            ...common,
            reflection: p.reflection ?? false,
            peakCaps: p.peakCaps ?? true,
          })
          break
      }

      if (
        p.particles &&
        p.style !== 'nebula' &&
        p.style !== 'starfield' &&
        p.style !== 'matrix' &&
        p.style !== 'galaxy'
      ) {
        spawnParticles(particlesRef.current, w, h, values, reduceMotion, lowQuality)
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
          p.style === 'heartbeat' ||
          p.style === 'coverOrb' ||
          p.style === 'echo' ||
          p.style === 'orbit')
      ) {
        beatRingsRef.current = updateBeatRings(
          beatRingsRef.current,
          bassAvgRef,
          beatCooldownRef,
          values,
          p.playing,
          w,
          h,
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
      } catch {
        /* */
      }
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const glassStyles: React.CSSProperties = glass
    ? {
        borderRadius: 22,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(16px) saturate(1.25)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.25)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 28px rgba(0,0,0,0.2)',
      }
    : {
        borderRadius: 0,
        overflow: 'hidden',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }

  const eqSlider = (key: keyof SpecEqBands, label: string) => (
    <label
      key={key}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flex: 1,
        minWidth: 64,
        fontSize: '0.68rem',
        opacity: 0.9,
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mergedEq[key].toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={3}
        step={0.05}
        value={mergedEq[key]}
        onChange={(e) => updateEq({ [key]: Number(e.target.value) })}
        style={{ width: '100%', accentColor: 'var(--gco-primary, #22E6C5)' }}
      />
    </label>
  )

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <div
        ref={containerRef}
        className={className}
        style={{
          position: 'relative',
          width: '100%',
          height,
          ...glassStyles,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
      </div>

      {showDjPanel && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <span>Mezcla visual (DJ)</span>
            <button
              type="button"
              onClick={restoreDefaults}
              style={{
                border: 'none',
                background: 'rgba(255,255,255,0.1)',
                color: 'inherit',
                fontSize: '0.68rem',
                padding: '0.3rem 0.65rem',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              Restaurar
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {eqSlider('bass', 'Graves')}
            {eqSlider('mid', 'Medios')}
            {eqSlider('treble', 'Agudos')}
            {eqSlider('voice', 'Voz')}
            {eqSlider('master', 'Master')}
          </div>
          <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>
            Solo afecta al visualizador · se guarda por canción si hay trackKey
          </p>
        </div>
      )}
    </div>
  )
}

export default AudioSpectrum