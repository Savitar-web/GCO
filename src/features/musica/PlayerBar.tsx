/**
 * ============================================================================
 * PlayerBar.tsx — pastilla flotante + reproductor fullscreen (GCO)
 * ============================================================================
 * Temas: oscuro / claro / arcoíris vía CSS vars + data-theme / clases.
 * Clic portada/título → fullscreen (drag solo tras umbral).
 * Gestos fullscreen: swipe ↓ cierra · ← cola · → letra.
 * Cola: long-press para reordenar (sin selección de texto).
 * Vídeo nativo FS: overlay con ±10s, volumen, brillo, candado, auto-hide.
 * PiP: document.pictureInPicture + webkit (iOS Safari/PWA cuando existe).
 * Plataformas: web, PWA, Capacitor APK, Electron · Android 9–16+ · iOS · desktop.
 * ============================================================================
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type DragEvent as ReactDragEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { formatTrackTime, getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'
import { useMediaPlayer, type MediaPlayerApi } from '@/hooks/useMediaPlayer'
import { soundClick } from '@/core/audio/uiSounds'

/* ═══════════════════════════════════════════════════════════════════════════
 * Constantes
 * ═══════════════════════════════════════════════════════════════════════════ */

const PREF_KEY = 'gco:player-bar-prefs'
const HEATMAP_KEY = 'gco:player-heatmap'
const HEATMAP_BINS = 40
const CONTROLS_IDLE_MS = 3200
const FLOAT_POS_KEY = 'gco:player-bar-float-v6'
const EDGE_SNAP_PX = 42
const COLLAPSED_SIZE = 52
const DRAG_THRESHOLD_PX = 10
const MOBILE_NAV_RESERVE = 76
const MOBILE_BAR_MAX_W = 300
const DESKTOP_BAR_MAX_W = 560
const SWIPE_MIN_PX = 64
const QUEUE_LONGPRESS_MS = 280

type FloatEdge = 'left' | 'right' | 'top' | 'bottom' | null
type FloatPos = { x: number; y: number; edge: FloatEdge; docked: boolean }
type FsTab = 'queue' | 'now' | 'lyrics'
type AppThemeMode = 'dark' | 'light' | 'rainbow' | 'unknown'

type Props = {
  player: MediaPlayerApi
  compact?: boolean
  floating?: boolean
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Detección de tema
 * ═══════════════════════════════════════════════════════════════════════════ */

function detectThemeMode(): AppThemeMode {
  if (typeof document === 'undefined') return 'dark'
  const root = document.documentElement
  const body = document.body
  const attr =
    root.getAttribute('data-theme') ||
    root.getAttribute('data-gco-theme') ||
    body.getAttribute('data-theme') ||
    ''
  const cls = `${root.className} ${body.className}`.toLowerCase()
  const stored =
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('gco:theme') || localStorage.getItem('theme') || '')) ||
    ''
  const blob = `${attr} ${cls} ${stored}`.toLowerCase()
  if (/rainbow|arco|iris|pride|neon/.test(blob)) return 'rainbow'
  if (/light|claro|day|sunrise/.test(blob)) return 'light'
  if (/dark|oscuro|night|midnight/.test(blob)) return 'dark'
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    /* */
  }
  return 'dark'
}

function useAppThemeMode(): AppThemeMode {
  const [mode, setMode] = useState<AppThemeMode>(() => detectThemeMode())
  useEffect(() => {
    const refresh = () => setMode(detectThemeMode())
    refresh()
    const obs = new MutationObserver(refresh)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-gco-theme', 'style'],
    })
    if (document.body) {
      obs.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-gco-theme'],
      })
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('gco:theme-change', refresh)
    const id = window.setInterval(refresh, 2000)
    return () => {
      obs.disconnect()
      window.removeEventListener('storage', refresh)
      window.removeEventListener('gco:theme-change', refresh)
      window.clearInterval(id)
    }
  }, [])
  return mode
}

function useThemeTokens(mode: AppThemeMode) {
  return useMemo(() => {
    const accent = 'var(--gco-primary)'
    const onAccent = 'var(--gco-on-primary, #0B1220)'
    if (mode === 'light') {
      return {
        accent,
        onAccent,
        floatBg: 'linear-gradient(145deg, rgba(255,255,255,0.94), rgba(244,246,252,0.92))',
        floatBorder: '1px solid rgba(15,20,40,0.1)',
        floatShadow: '0 12px 36px rgba(20,30,60,0.14), inset 0 1px 0 rgba(255,255,255,0.9)',
        floatColor: 'var(--gco-ink, #12141c)',
        floatMuted: 'var(--gco-ink-muted, rgba(18,20,28,0.55))',
        fsBg: 'radial-gradient(ellipse at top, #eef1f8 0%, #dfe5f2 45%, #d0d7e8 100%)',
        fsColor: 'var(--gco-ink, #12141c)',
        glassBg: 'rgba(255,255,255,0.55)',
        glassBorder: '1px solid rgba(20,30,50,0.1)',
        glassIconBg: 'rgba(255,255,255,0.72)',
        glassIconColor: 'var(--gco-ink, #12141c)',
        liquid: {
          background: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(20,30,50,0.1)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          boxShadow: '0 10px 30px rgba(30,40,70,0.12), inset 0 1px 0 rgba(255,255,255,0.85)',
        } as CSSProperties,
        progressTrack: 'rgba(20,30,50,0.12)',
        heatBase: 0.06,
        overlayBg: 'linear-gradient(transparent 30%, rgba(0,0,0,0.72) 100%)',
        surfaceMuted: 'rgba(0,0,0,0.05)',
      }
    }
    return {
      accent,
      onAccent,
      floatBg: 'linear-gradient(145deg, rgba(28,32,48,0.95), rgba(14,16,28,0.92))',
      floatBorder: '1px solid rgba(255,255,255,0.12)',
      floatShadow: '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
      floatColor: '#F3F5FA',
      floatMuted: 'rgba(243,245,250,0.65)',
      fsBg: 'radial-gradient(ellipse at top, #1a1f35 0%, #0a0c14 55%)',
      fsColor: '#F3F5FA',
      glassBg: 'rgba(255,255,255,0.1)',
      glassBorder: '1px solid rgba(255,255,255,0.12)',
      glassIconBg: 'rgba(255,255,255,0.1)',
      glassIconColor: '#F3F5FA',
      liquid: {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        boxShadow: '0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.14)',
      } as CSSProperties,
      progressTrack: 'rgba(255,255,255,0.12)',
      heatBase: 0.04,
      overlayBg: 'linear-gradient(transparent 28%, rgba(0,0,0,0.78) 100%)',
      surfaceMuted: 'rgba(255,255,255,0.06)',
    }
  }, [mode])
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Utils
 * ═══════════════════════════════════════════════════════════════════════════ */

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 720px)').matches
}

function defaultFloatPos(): FloatPos {
  if (typeof window === 'undefined') return { x: 24, y: 24, edge: null, docked: false }
  const mobile = isMobileViewport()
  const maxW = mobile ? MOBILE_BAR_MAX_W : DESKTOP_BAR_MAX_W
  const w = Math.min(maxW, window.innerWidth - 24)
  const bottomPad = mobile ? MOBILE_NAV_RESERVE + 16 : 28
  return {
    x: Math.max(12, (window.innerWidth - w) / 2),
    y: Math.max(12, window.innerHeight - bottomPad - 56),
    edge: null,
    docked: false,
  }
}

function loadFloatPos(): FloatPos {
  try {
    const raw = localStorage.getItem(FLOAT_POS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as FloatPos
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        return { x: p.x, y: p.y, edge: p.edge ?? null, docked: !!p.docked }
      }
    }
  } catch {
    /* */
  }
  return defaultFloatPos()
}

function saveFloatPos(p: FloatPos) {
  try {
    localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(p))
  } catch {
    /* */
  }
}

function nearestEdge(x: number, y: number, w: number, h: number): FloatEdge {
  if (typeof window === 'undefined') return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const dist: Record<Exclude<FloatEdge, null>, number> = {
    left: x,
    right: vw - (x + w),
    top: y,
    bottom: vh - (y + h),
  }
  const entries = Object.entries(dist) as [Exclude<FloatEdge, null>, number][]
  entries.sort((a, b) => a[1] - b[1])
  return entries[0][1] <= EDGE_SNAP_PX ? entries[0][0] : null
}

function clampPos(x: number, y: number, w: number, h: number) {
  if (typeof window === 'undefined') return { x, y }
  const pad = 8
  return {
    x: Math.max(pad, Math.min(window.innerWidth - w - pad, x)),
    y: Math.max(pad, Math.min(window.innerHeight - h - pad, y)),
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function isVideoTrack(item: TrackItem) {
  return (
    !!item.mime &&
    (item.mime.startsWith('video/') ||
      /mp4|webm|mov|mkv/i.test(item.mime) ||
      /\.(mp4|webm|mov|mkv)$/i.test(item.title || ''))
  )
}

/** Tiempo restante: "-3:42" */
function formatRemaining(currentMs: number, durationMs: number) {
  if (!durationMs || durationMs <= 0) return '−0:00'
  const left = Math.max(0, durationMs - currentMs)
  return `−${formatTrackTime(left)}`
}

function detectPipSupport(): boolean {
  if (typeof document === 'undefined') return false
  const d = document as Document & {
    pictureInPictureEnabled?: boolean
    webkitPictureInPictureEnabled?: boolean
  }
  if (d.pictureInPictureEnabled) return true
  if (typeof HTMLVideoElement !== 'undefined') {
    const proto = HTMLVideoElement.prototype as HTMLVideoElement & {
      webkitSupportsPresentationMode?: (mode: string) => boolean
      webkitSetPresentationMode?: (mode: string) => void
    }
    if (typeof proto.webkitSupportsPresentationMode === 'function') return true
    if (typeof proto.requestPictureInPicture === 'function') return true
  }
  return false
}

let globalBarMounted = false
let globalRoot: Root | null = null

export function isGlobalPlayerBarMounted() {
  return globalBarMounted
}

export function getBarPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return JSON.parse(raw) as { progressColor: string }
  } catch {
    /* */
  }
  return { progressColor: '' }
}

export function saveBarPrefs(p: { progressColor: string }) {
  localStorage.setItem(PREF_KEY, JSON.stringify(p))
}

function loadHeatmapStore(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(HEATMAP_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
  } catch {
    return {}
  }
}

function saveHeatmapStore(map: Record<string, number[]>) {
  try {
    localStorage.setItem(HEATMAP_KEY, JSON.stringify(map))
  } catch {
    /* */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Iconos SVG
 * ═══════════════════════════════════════════════════════════════════════════ */

function IconPrev({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
    </svg>
  )
}
function IconNext({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
    </svg>
  )
}
function IconPlay({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}
function IconPause({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  )
}
function IconShuffle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  )
}
function IconRepeat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}
function IconFsEnter() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
    </svg>
  )
}
function IconPip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <rect x="11" y="10" width="9" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.9" />
    </svg>
  )
}
function IconChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
function IconLock({ locked }: { locked: boolean }) {
  return locked ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </svg>
  )
}
/** −10 s */
function IconSeekBack10({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 4v6h6" />
      <path d="M3.5 15a9 9 0 103.6-9.3L1 10" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="700">
        10
      </text>
    </svg>
  )
}
/** +10 s */
function IconSeekFwd10({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M23 4v6h-6" />
      <path d="M20.5 15a9 9 0 11-3.6-9.3L23 10" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="700">
        10
      </text>
    </svg>
  )
}
function IconVolDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15 9.5a3 3 0 010 5" />
    </svg>
  )
}
function IconVolUp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15 9.5a3 3 0 010 5M18 7a6 6 0 010 10" />
    </svg>
  )
}
function IconBrightDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" opacity="0.45" />
    </svg>
  )
}
function IconBrightUp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}
function IconGrip() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden opacity="0.45">
      <circle cx="4" cy="3" r="1.4" />
      <circle cx="10" cy="3" r="1.4" />
      <circle cx="4" cy="9" r="1.4" />
      <circle cx="10" cy="9" r="1.4" />
      <circle cx="4" cy="15" r="1.4" />
      <circle cx="10" cy="15" r="1.4" />
    </svg>
  )
}

function buildGlobalCss(mode: AppThemeMode) {
  const isLight = mode === 'light'
  return `
.gco-pb-scroll { scrollbar-width: thin; scrollbar-color: ${isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.22)'} transparent; }
.gco-pb-scroll::-webkit-scrollbar { width: 5px; }
.gco-pb-scroll::-webkit-scrollbar-thumb { background: ${isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}; border-radius: 999px; }
.gco-pb-icon:hover { filter: brightness(1.1); }
.gco-pb-icon:active { transform: scale(0.92); }
.gco-pb-icon:disabled { opacity: 0.32; cursor: not-allowed; }
.gco-float-bar {
  border-radius: 22px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: box-shadow 0.2s ease, width 0.22s ease, border-radius 0.22s ease, background 0.25s ease;
}
.gco-float-bar.is-dragging { filter: brightness(1.03); }
.gco-float-bar.is-docked {
  width: ${COLLAPSED_SIZE}px !important;
  height: ${COLLAPSED_SIZE}px !important;
  border-radius: 16px;
  padding: 0 !important;
  overflow: hidden;
}
.gco-fs-root {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: pan-y;
}
.gco-fs-root input,
.gco-fs-root textarea {
  user-select: text;
  -webkit-user-select: text;
}
.gco-fs-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 6px 4px 10px; border-radius: 999px;
  font-size: 0.74rem; font-weight: 600;
}
.gco-fs-pill span { min-width: 48px; text-align: center; font-variant-numeric: tabular-nums; }
.gco-fs-pill button {
  width: 26px; height: 26px; border-radius: 50%; border: none;
  cursor: pointer; display: grid; place-items: center;
  background: rgba(255,255,255,0.15); color: inherit;
}
.gco-fs-range {
  -webkit-appearance: none; appearance: none; width: 100%; height: 6px;
  border-radius: 999px; outline: none; cursor: pointer;
  background: transparent;
}
.gco-fs-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.35); margin-top: -5px;
  border: none;
}
.gco-fs-range::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.35); border: none;
}
.gco-seg {
  display: inline-flex; padding: 3px; border-radius: 999px;
}
.gco-seg button {
  border: none; cursor: pointer; font: inherit; font-size: 0.75rem;
  padding: 0.4rem 1rem; border-radius: 999px; background: transparent;
}
.gco-seg button.is-on { font-weight: 700; }
.gco-open-zone {
  cursor: pointer; border: none; background: transparent;
  color: inherit; font: inherit; text-align: left; padding: 0; min-width: 0;
  user-select: none; -webkit-user-select: none;
}
.gco-open-zone:focus-visible {
  outline: 2px solid var(--gco-primary);
  outline-offset: 2px;
  border-radius: 12px;
}
.gco-queue-row {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}
.gco-queue-row.is-dragging-row {
  opacity: 0.7;
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.gco-seek-chip {
  width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center; border: none; cursor: pointer;
  flex-shrink: 0; transition: transform 0.12s ease, background 0.15s ease;
}
.gco-seek-chip:active { transform: scale(0.9); }
.gco-swipe-hint {
  width: 36px; height: 4px; border-radius: 999px; margin: 0 auto 8px;
  background: rgba(128,128,128,0.35);
}
${
  mode === 'rainbow'
    ? `
.gco-float-bar {
  box-shadow: 0 12px 40px color-mix(in srgb, var(--gco-primary) 25%, transparent),
              inset 0 1px 0 rgba(255,255,255,0.12);
}
`
    : ''
}
`
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Componente
 * ═══════════════════════════════════════════════════════════════════════════ */

export function PlayerBar({ player, floating }: Props) {
  const themeMode = useAppThemeMode()
  const tokens = useThemeTokens(themeMode)
  const prefs = getBarPrefs()
  const progressColor = prefs.progressColor || tokens.accent

  const t = player.track
  const [fullscreen, setFullscreen] = useState(false)
  const [fsTab, setFsTab] = useState<FsTab>('now')
  const [queue, setQueue] = useState<TrackItem[]>([])
  const [showVideo, setShowVideo] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fsRootRef = useRef<HTMLDivElement | null>(null)

  const [locked, setLocked] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [volumeUi, setVolumeUi] = useState(() => Math.round((player.volume ?? 1) * 100))
  const [heatmap, setHeatmap] = useState<number[]>(() => new Array(HEATMAP_BINS).fill(0))
  const [overlayVisible, setOverlayVisible] = useState(true)
  const heatmapRef = useRef(heatmap)
  const lastBinRef = useRef<number | null>(null)
  const mediaAreaRef = useRef<HTMLDivElement | null>(null)
  const idleTimerRef = useRef<number | null>(null)

  const [nativeFsActive, setNativeFsActive] = useState(false)
  const [nativeOverlayVisible, setNativeOverlayVisible] = useState(true)
  const nativeIdleTimerRef = useRef<number | null>(null)

  const [floatPos, setFloatPos] = useState<FloatPos>(() => loadFloatPos())
  const [dragging, setDragging] = useState(false)
  const [mobile, setMobile] = useState(() => isMobileViewport())
  const floatRootRef = useRef<HTMLDivElement | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const dragActiveRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 })
  const barSizeRef = useRef({ w: 360, h: 56 })

  const [pipActive, setPipActive] = useState(false)
  const [pipSupported, setPipSupported] = useState(false)
  const pipRequestedRef = useRef(false)

  /* Swipe fullscreen */
  const swipeStartRef = useRef<{ x: number; y: number; t: number; fromHandle?: boolean; scrollTop?: number } | null>(null)
  const fsScrollRef = useRef<HTMLDivElement | null>(null)
  const [fsDragY, setFsDragY] = useState(0)

  /* Queue long-press reorder */
  const queueDragFromRef = useRef<number | null>(null)
  const queueLongPressRef = useRef<number | null>(null)
  const queuePointerRef = useRef<{ id: number; y: number } | null>(null)
  const [queueDraggingIdx, setQueueDraggingIdx] = useState<number | null>(null)
  const [queueDropIdx, setQueueDropIdx] = useState<number | null>(null)
  const queueDropIdxRef = useRef<number | null>(null)
  const queueRowsRef = useRef<Map<number, HTMLElement>>(new Map())
  const htmlDragFromRef = useRef<number | null>(null)

  const dur = player.durationMs || t?.durationMs || 0
  const hasVideo = t ? isVideoTrack(t) : false
  const globalCss = useMemo(() => buildGlobalCss(themeMode), [themeMode])

  const glassIconStyle: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 14,
    border: tokens.glassBorder,
    background: tokens.glassIconBg,
    color: tokens.glassIconColor,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    flexShrink: 0,
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  }

  const seekChipStyle: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: tokens.glassBorder,
    background: tokens.glassIconBg,
    color: tokens.glassIconColor,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    flexShrink: 0,
  }

  const openFullscreen = useCallback(() => {
    soundClick()
    setFsTab('now')
    setFullscreen(true)
    setOverlayVisible(true)
  }, [])

  const closeFullscreen = useCallback(() => {
    soundClick()
    setFullscreen(false)
    setFsDragY(0)
  }, [])

  const syncQueue = useCallback(() => {
    setQueue(player.getQueue?.() ?? [])
  }, [player])

  useEffect(() => {
    const onResize = () => setMobile(isMobileViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    setPipSupported(detectPipSupport())
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    syncQueue()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [fullscreen, syncQueue, t?.id])

  /* Sync volume UI → player */
  useEffect(() => {
    const v = clamp(volumeUi / 100, 0, 1)
    if (Math.abs((player.volume ?? 1) - v) > 0.01) {
      player.setVolume?.(v)
    }
  }, [volumeUi]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVolumeUi(Math.round((player.volume ?? 1) * 100))
  }, [player.volume])

  /* Atajos teclado */
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setFullscreen(false)
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (locked) return
      if (e.code === 'Space') {
        e.preventDefault()
        void player.toggle()
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        player.seek(Math.min(dur, player.currentMs + 10000))
      } else if (e.key === 'ArrowLeft' && e.shiftKey) {
        player.seek(Math.max(0, player.currentMs - 10000))
      } else if (e.key === 'ArrowRight') {
        player.seek(Math.min(dur, player.currentMs + 5000))
      } else if (e.key === 'ArrowLeft') {
        player.seek(Math.max(0, player.currentMs - 5000))
      } else if (e.key === 'ArrowUp') {
        setVolumeUi((v) => clamp(v + 5, 0, 100))
      } else if (e.key === 'ArrowDown') {
        setVolumeUi((v) => clamp(v - 5, 0, 100))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, player, dur, locked])

  /* Carga blob vídeo */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const need =
        !!t && hasVideo && (showVideo || fullscreen || pipRequestedRef.current || pipActive)
      if (!need) {
        if (!pipActive) {
          setVideoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
          })
        }
        return
      }
      try {
        const blob = await getTrackBlob(t!.blobKey)
        if (cancelled || !blob) return
        const url = URL.createObjectURL(blob)
        setVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        /* */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t?.id, t?.blobKey, hasVideo, showVideo, fullscreen, pipActive])

  /* Sync vídeo ↔ audio */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoUrl) return
    const target = player.currentMs / 1000
    if (Math.abs(v.currentTime - target) > 0.35) {
      try {
        v.currentTime = target
      } catch {
        /* */
      }
    }
    if (player.playing && v.paused) {
      v.play().catch(() => {})
    } else if (!player.playing && !v.paused) {
      v.pause()
    }
  }, [player.currentMs, player.playing, videoUrl])

  /* PiP events */
  useEffect(() => {
    const onEnter = () => setPipActive(true)
    const onLeave = () => {
      setPipActive(false)
      pipRequestedRef.current = false
    }
    document.addEventListener('enterpictureinpicture', onEnter)
    document.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      document.removeEventListener('enterpictureinpicture', onEnter)
      document.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  /* Native fullscreen change */
  useEffect(() => {
    const onFs = () => {
      const active = !!document.fullscreenElement
      setNativeFsActive(active)
      if (active) {
        setNativeOverlayVisible(true)
        bumpNativeIdle()
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs as EventListener)
    }
  }, [])

  /* Heatmap */
  useEffect(() => {
    heatmapRef.current = heatmap
  }, [heatmap])

  useEffect(() => {
    if (!t?.id || !player.playing || !dur) return
    const bin = Math.min(HEATMAP_BINS - 1, Math.floor((player.currentMs / dur) * HEATMAP_BINS))
    if (lastBinRef.current === bin) return
    lastBinRef.current = bin
    setHeatmap((prev) => {
      const next = [...prev]
      next[bin] = (next[bin] || 0) + 1
      const store = loadHeatmapStore()
      store[t.id] = next
      saveHeatmapStore(store)
      return next
    })
  }, [player.currentMs, player.playing, dur, t?.id])

  useEffect(() => {
    if (!t?.id) return
    const store = loadHeatmapStore()
    const arr = store[t.id]
    if (arr && arr.length === HEATMAP_BINS) setHeatmap(arr)
    else setHeatmap(new Array(HEATMAP_BINS).fill(0))
    lastBinRef.current = null
  }, [t?.id])

  /* Idle overlay (fullscreen UI) */
  const bumpIdle = useCallback(() => {
    if (locked) return
    setOverlayVisible(true)
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setOverlayVisible(false)
    }, CONTROLS_IDLE_MS)
  }, [locked])

  const bumpNativeIdle = useCallback(() => {
    if (locked) return
    setNativeOverlayVisible(true)
    if (nativeIdleTimerRef.current) window.clearTimeout(nativeIdleTimerRef.current)
    nativeIdleTimerRef.current = window.setTimeout(() => {
      setNativeOverlayVisible(false)
    }, CONTROLS_IDLE_MS)
  }, [locked])

  useEffect(() => {
    if (!fullscreen) return
    bumpIdle()
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [fullscreen, bumpIdle, fsTab])

  /* ── Floating bar: medir tamaño real (docked / expanded) ── */
  useEffect(() => {
    const el = floatRootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 0 && r.height > 0) {
        barSizeRef.current = { w: r.width, h: r.height }
      }
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) barSizeRef.current = { w: rect.width, h: rect.height }
    return () => ro.disconnect()
  }, [floatPos.docked, floating, mobile, t?.id])

  /* ── Floating bar drag (listeners en window → fiable en móvil/desktop) ── */
  const finishDrag = useCallback(() => {
    const el = floatRootRef.current
    const rect = el?.getBoundingClientRect()
    const w = rect?.width ?? (floatPos.docked ? COLLAPSED_SIZE : barSizeRef.current.w)
    const h = rect?.height ?? barSizeRef.current.h
    const x = rect?.left ?? floatPos.x
    const y = rect?.top ?? floatPos.y
    if (rect) barSizeRef.current = { w: rect.width, h: rect.height }

    const edge = nearestEdge(x, y, w, h)
    let next: FloatPos
    if (edge === 'left' || edge === 'right') {
      next = {
        x: edge === 'left' ? 8 : window.innerWidth - COLLAPSED_SIZE - 8,
        y: clamp(y, 8, window.innerHeight - COLLAPSED_SIZE - 8),
        edge,
        docked: true,
      }
    } else {
      const expandedW = Math.min(
        mobile ? MOBILE_BAR_MAX_W : DESKTOP_BAR_MAX_W,
        window.innerWidth - 24,
      )
      const c = clampPos(x, y, floatPos.docked ? expandedW : w, h)
      next = { x: c.x, y: c.y, edge: null, docked: false }
    }
    setFloatPos(next)
    saveFloatPos(next)
  }, [floatPos.docked, floatPos.x, floatPos.y, mobile])

  const onPointerDownBar = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    /* No iniciar drag con botón derecho / stylus eraser */
    if (e.button != null && e.button !== 0) return

    e.preventDefault()
    pointerIdRef.current = e.pointerId
    dragActiveRef.current = false
    const el = floatRootRef.current
    const rect = el?.getBoundingClientRect()
    if (rect && rect.width > 0) {
      barSizeRef.current = { w: rect.width, h: rect.height }
    }
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: rect?.left ?? floatPos.x,
      top: rect?.top ?? floatPos.y,
    }

    const pid = e.pointerId
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const dx = ev.clientX - dragStartRef.current.x
      const dy = ev.clientY - dragStartRef.current.y
      if (!dragActiveRef.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        dragActiveRef.current = true
        setDragging(true)
      }
      const dragW = floatPos.docked ? COLLAPSED_SIZE : barSizeRef.current.w
      const dragH = floatPos.docked ? COLLAPSED_SIZE : barSizeRef.current.h
      const c = clampPos(dragStartRef.current.left + dx, dragStartRef.current.top + dy, dragW, dragH)
      setFloatPos((p) => ({ ...p, x: c.x, y: c.y, docked: false, edge: null }))
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const wasDragging = dragActiveRef.current
      pointerIdRef.current = null
      dragActiveRef.current = false
      setDragging(false)
      if (wasDragging) {
        finishDrag()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  /** Click en pastilla / burbuja → fullscreen (si no hubo drag) */
  const onOpenFromPill = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (dragActiveRef.current || dragging) return
    openFullscreen()
  }

  /* ── PiP: iOS webkit + estándar + fallback flotante (Capacitor WebView) ── */
  const [pipFallback, setPipFallback] = useState(false)

  const exitAllPip = useCallback(async () => {
    const d = document as Document & {
      pictureInPictureElement?: Element | null
      exitPictureInPicture?: () => Promise<void>
    }
    try {
      if (d.pictureInPictureElement) await d.exitPictureInPicture?.()
    } catch {
      /* */
    }
    const vid = videoRef.current as
      | (HTMLVideoElement & {
          webkitPresentationMode?: string
          webkitSetPresentationMode?: (m: string) => void
        })
      | null
    try {
      if (vid?.webkitPresentationMode === 'picture-in-picture') {
        vid.webkitSetPresentationMode?.('inline')
      }
    } catch {
      /* */
    }
    setPipActive(false)
    setPipFallback(false)
    pipRequestedRef.current = false
  }, [])

  const togglePip = useCallback(async () => {
    soundClick()
    if (!hasVideo || !t) return

    const d = document as Document & {
      pictureInPictureElement?: Element | null
      exitPictureInPicture?: () => Promise<void>
      pictureInPictureEnabled?: boolean
    }

    if (d.pictureInPictureElement || pipFallback || pipActive) {
      await exitAllPip()
      return
    }

    setShowVideo(true)
    pipRequestedRef.current = true

    const prepareVideo = (vid: HTMLVideoElement) => {
      try {
        vid.setAttribute('playsinline', 'true')
        vid.setAttribute('webkit-playsinline', 'true')
        vid.setAttribute('x5-playsinline', 'true')
        vid.setAttribute('x5-video-player-type', 'h5')
        ;(vid as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false
        /* No forzar mute: iOS a veces exige audio activo tras gesto de usuario */
      } catch {
        /* */
      }
    }

    const tryEnter = async (vid: HTMLVideoElement): Promise<boolean> => {
      prepareVideo(vid)
      const wv = vid as HTMLVideoElement & {
        webkitSupportsPresentationMode?: (m: string) => boolean
        webkitSetPresentationMode?: (m: string) => void
        webkitPresentationMode?: string
        requestPictureInPicture?: () => Promise<PictureInPictureWindow>
      }

      try {
        if (vid.paused) await vid.play()
      } catch {
        /* */
      }

      /* iOS Safari / PWA */
      if (typeof wv.webkitSupportsPresentationMode === 'function') {
        try {
          if (wv.webkitSupportsPresentationMode('picture-in-picture')) {
            wv.webkitSetPresentationMode?.('picture-in-picture')
            setPipActive(true)
            setPipFallback(false)
            /* Cerrar FS de la app para ver el sistema PiP */
            closeFullscreen()
            return true
          }
        } catch (err) {
          console.warn('[gco] webkit PiP', err)
        }
      }

      /* Chrome / Edge / Android Chrome / algunos WebView */
      if (typeof wv.requestPictureInPicture === 'function') {
        try {
          if (d.pictureInPictureEnabled !== false) {
            await wv.requestPictureInPicture()
            setPipActive(true)
            setPipFallback(false)
            closeFullscreen()
            return true
          }
        } catch (err) {
          console.warn('[gco] PiP standard', err)
        }
      }

      /* Fallback Capacitor / WebView sin PiP de sistema: burbuja flotante */
      setPipFallback(true)
      setPipActive(true)
      closeFullscreen()
      return true
    }

    const attempt = (tries: number) => {
      const vid = videoRef.current
      if (!vid) {
        if (tries > 0) window.setTimeout(() => attempt(tries - 1), 50)
        else {
          /* Sin <video> aún: activar fallback de todos modos */
          setPipFallback(true)
          setPipActive(true)
          closeFullscreen()
        }
        return
      }
      void (async () => {
        const ok = await tryEnter(vid)
        if (!ok && tries > 0) window.setTimeout(() => attempt(tries - 1), 80)
      })()
    }

    /* Misma cadena de gesto de usuario: primer intento casi inmediato */
    window.setTimeout(() => attempt(12), 16)
  }, [hasVideo, t, pipFallback, pipActive, exitAllPip, closeFullscreen])

  const toggleNativeFullscreen = async () => {
    soundClick()
    const el = mediaAreaRef.current || videoRef.current
    if (!el) return
    const anyEl = el as HTMLElement & {
      webkitRequestFullscreen?: () => void
      webkitEnterFullscreen?: () => void
    }
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen()
        else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen()
        else if (videoRef.current) {
          const vv = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
          vv.webkitEnterFullscreen?.()
        }
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('[gco] fs', err)
    }
  }

  const reorderQueue = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    const q = [...(player.getQueue?.() ?? [])]
    if (from >= q.length || to >= q.length) return
    const [item] = q.splice(from, 1)
    q.splice(to, 0, item)
    player.setQueue?.(q)
    setQueue(q)
  }

  const seekBy = (deltaMs: number) => {
    if (locked) return
    soundClick()
    const next = clamp(player.currentMs + deltaMs, 0, dur || Number.MAX_SAFE_INTEGER)
    player.seek(next)
    bumpIdle()
    bumpNativeIdle()
  }

  /* ── Swipe: cierre solo desde asa / scrollTop≈0; no pelear con scroll vertical ── */
  const onFsPointerDown = (e: ReactPointerEvent) => {
    if (locked) return
    const target = e.target as HTMLElement
    const fromHandle = !!target.closest('[data-fs-handle]')
    if (target.closest('button, input, textarea, a, [data-no-swipe]') && !fromHandle) return
    swipeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      fromHandle,
      scrollTop: fsScrollRef.current?.scrollTop ?? 0,
    }
    setFsDragY(0)
  }

  const onFsPointerMove = (e: ReactPointerEvent) => {
    if (!swipeStartRef.current || locked) return
    const dy = e.clientY - swipeStartRef.current.y
    const dx = e.clientX - swipeStartRef.current.x
    const canDismiss =
      !!swipeStartRef.current.fromHandle ||
      (fsTab === 'now' && (swipeStartRef.current.scrollTop ?? 0) <= 4)
    if (canDismiss && Math.abs(dy) > Math.abs(dx) && dy > 8) {
      setFsDragY(Math.min(dy, 220))
    }
  }

  const onFsPointerUp = (e: ReactPointerEvent) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    setFsDragY(0)
    if (!start || locked) return
    if ((e.target as HTMLElement).closest('button, input, textarea, a') && !start.fromHandle) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (Date.now() - start.t > 900) {
      bumpIdle()
      return
    }
    const canDismiss = !!start.fromHandle || (fsTab === 'now' && (start.scrollTop ?? 0) <= 4)
    if (canDismiss && absY > SWIPE_MIN_PX && absY > absX * 1.2 && dy > 0) {
      closeFullscreen()
      return
    }
    /* Tabs horizontales: solo gesto claro y sin scroll de contenido */
    if (absX > SWIPE_MIN_PX && absX > absY * 1.3 && (start.scrollTop ?? 0) <= 8) {
      const order: FsTab[] = ['queue', 'now', 'lyrics']
      const i = order.indexOf(fsTab)
      const dir = dx < 0 ? 1 : -1
      const next = order[(i + dir + order.length) % order.length]
      soundClick()
      setFsTab(next)
      if (next === 'queue') syncQueue()
      bumpIdle()
      return
    }
    bumpIdle()
  }

  /* ── Cola: long-press en grip (móvil) + HTML5 drag (PC) ── */
  const clearQueueLongPress = () => {
    if (queueLongPressRef.current != null) {
      window.clearTimeout(queueLongPressRef.current)
      queueLongPressRef.current = null
    }
  }

  const endQueueDrag = () => {
    clearQueueLongPress()
    queuePointerRef.current = null
    queueDragFromRef.current = null
    setQueueDraggingIdx(null)
    setQueueDropIdx(null)
  }

  const findQueueIndexAtY = (clientY: number): number | null => {
    let best: number | null = null
    let bestDist = Infinity
    queueRowsRef.current.forEach((el, idx) => {
      const r = el.getBoundingClientRect()
      const mid = r.top + r.height / 2
      const dist = Math.abs(clientY - mid)
      if (dist < bestDist) {
        bestDist = dist
        best = idx
      }
    })
    return best
  }

  const onQueueHandlePointerDown = (idx: number, e: ReactPointerEvent) => {
    if (locked) return
    e.preventDefault()
    e.stopPropagation()
    queuePointerRef.current = { id: e.pointerId, y: e.clientY }
    clearQueueLongPress()
    const pid = e.pointerId
    const startY = e.clientY
    queueLongPressRef.current = window.setTimeout(() => {
      queueDragFromRef.current = idx
      setQueueDraggingIdx(idx)
      setQueueDropIdx(idx)
      if (navigator.vibrate) {
        try {
          navigator.vibrate(14)
        } catch {
          /* */
        }
      }
    }, QUEUE_LONGPRESS_MS)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const dy = Math.abs(ev.clientY - startY)
      if (queueDragFromRef.current == null) {
        if (dy > 10) clearQueueLongPress()
        return
      }
      const over = findQueueIndexAtY(ev.clientY)
      if (over != null) {
        queueDropIdxRef.current = over
        setQueueDropIdx(over)
      }
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const from = queueDragFromRef.current
      const to = queueDropIdxRef.current
      clearQueueLongPress()
      if (from != null && to != null && from !== to) {
        reorderQueue(from, to)
        soundClick()
      }
      queueDropIdxRef.current = null
      endQueueDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onHtmlDragStart = (idx: number, e: ReactDragEvent) => {
    htmlDragFromRef.current = idx
    setQueueDraggingIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', String(idx))
    } catch {
      /* */
    }
  }

  const onHtmlDragOver = (idx: number, e: ReactDragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (queueDropIdx !== idx) setQueueDropIdx(idx)
  }

  const onHtmlDrop = (idx: number, e: ReactDragEvent) => {
    e.preventDefault()
    const from = htmlDragFromRef.current
    if (from != null && from !== idx) {
      reorderQueue(from, idx)
      soundClick()
    }
    htmlDragFromRef.current = null
    setQueueDraggingIdx(null)
    setQueueDropIdx(null)
  }

  const onHtmlDragEnd = () => {
    htmlDragFromRef.current = null
    setQueueDraggingIdx(null)
    setQueueDropIdx(null)
  }

  const progressBar = (opacity = 1, large = false, showTimes = false) => {
    const pct = dur > 0 ? clamp((player.currentMs / dur) * 100, 0, 100) : 0
    const maxHeat = Math.max(1, ...heatmap)
    return (
      <div data-no-drag data-no-swipe style={{ position: 'relative', opacity, transition: 'opacity 0.3s' }}>
        <div style={{ position: 'relative', height: large ? 28 : 18 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: large ? 8 : 5,
              height: large ? 8 : 5,
              borderRadius: 999,
              overflow: 'hidden',
              background: tokens.progressTrack,
              display: 'flex',
            }}
          >
            {heatmap.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background:
                    themeMode === 'light'
                      ? `rgba(20,30,50,${tokens.heatBase + (h / maxHeat) * 0.28})`
                      : `rgba(255,255,255,${tokens.heatBase + (h / maxHeat) * 0.25})`,
                }}
              />
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: large ? 8 : 5,
              height: large ? 8 : 5,
              width: `${pct}%`,
              borderRadius: 999,
              background: progressColor,
              boxShadow: `0 0 12px color-mix(in srgb, ${progressColor} 50%, transparent)`,
              pointerEvents: 'none',
            }}
          />
          <input
            type="range"
            className="gco-fs-range"
            min={0}
            max={Math.max(1, dur)}
            step={100}
            value={clamp(player.currentMs, 0, dur || 1)}
            disabled={locked}
            aria-label="Progreso"
            onChange={(e) => {
              if (locked) return
              player.seek(Number(e.target.value))
              bumpIdle()
              bumpNativeIdle()
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: large ? 2 : 0,
              width: '100%',
              margin: 0,
              height: large ? 24 : 18,
              opacity: 0.001,
              cursor: locked ? 'not-allowed' : 'pointer',
            }}
          />
        </div>
        {showTimes && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              opacity: 0.65,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            <span>{formatTrackTime(player.currentMs)}</span>
            <span>{formatRemaining(player.currentMs, dur)}</span>
          </div>
        )}
      </div>
    )
  }

  /* Transport row: shuffle · −10 · prev · play · next · +10 · repeat */
  const transportRow = (size: 'fs' | 'mini' = 'fs') => {
    const big = size === 'fs'
    const mainSize = big ? 68 : 40
    const sideSize = big ? 40 : 36
    const chip = big ? 34 : 30
    return (
      <div
        data-no-swipe
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: big ? 10 : 6,
          flexWrap: 'nowrap',
        }}
      >
        {big && (
          <button
            type="button"
            className="gco-pb-icon"
            style={{
              ...glassIconStyle,
              opacity: player.shuffle ? 1 : 0.4,
              color: player.shuffle ? tokens.accent : undefined,
            }}
            aria-label="Aleatorio"
            disabled={locked}
            onClick={() => {
              if (locked) return
              soundClick()
              player.setShuffle(!player.shuffle)
              bumpIdle()
            }}
          >
            <IconShuffle />
          </button>
        )}

        <button
          type="button"
          className="gco-seek-chip"
          style={{ ...seekChipStyle, width: chip, height: chip }}
          aria-label="Retroceder 10 segundos"
          disabled={locked}
          onClick={() => seekBy(-10000)}
        >
          <IconSeekBack10 size={big ? 15 : 13} />
        </button>

        <button
          type="button"
          className="gco-pb-icon"
          style={{ ...glassIconStyle, width: sideSize, height: sideSize, borderRadius: big ? 14 : 12 }}
          aria-label="Anterior"
          disabled={locked}
          onClick={() => {
            if (locked) return
            soundClick()
            void player.prev()
            bumpIdle()
          }}
        >
          <IconPrev size={big ? 18 : 14} />
        </button>

        <button
          type="button"
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            width: mainSize,
            height: mainSize,
            borderRadius: big ? 24 : 14,
            background: tokens.accent,
            color: tokens.onAccent,
            border: 'none',
            boxShadow: `0 8px 28px color-mix(in srgb, ${tokens.accent} 45%, transparent)`,
          }}
          aria-label={player.playing ? 'Pausar' : 'Reproducir'}
          onClick={() => {
            soundClick()
            void player.toggle()
            bumpIdle()
            bumpNativeIdle()
          }}
        >
          {player.playing ? <IconPause size={big ? 26 : 16} /> : <IconPlay size={big ? 26 : 16} />}
        </button>

        <button
          type="button"
          className="gco-pb-icon"
          style={{ ...glassIconStyle, width: sideSize, height: sideSize, borderRadius: big ? 14 : 12 }}
          aria-label="Siguiente"
          disabled={locked}
          onClick={() => {
            if (locked) return
            soundClick()
            void player.next()
            bumpIdle()
          }}
        >
          <IconNext size={big ? 18 : 14} />
        </button>

        <button
          type="button"
          className="gco-seek-chip"
          style={{ ...seekChipStyle, width: chip, height: chip }}
          aria-label="Adelantar 10 segundos"
          disabled={locked}
          onClick={() => seekBy(10000)}
        >
          <IconSeekFwd10 size={big ? 15 : 13} />
        </button>

        {big && (
          <button
            type="button"
            className="gco-pb-icon"
            style={{
              ...glassIconStyle,
              opacity: player.repeat === 'off' ? 0.4 : 1,
              color: player.repeat !== 'off' ? tokens.accent : undefined,
            }}
            aria-label="Repetir"
            disabled={locked}
            onClick={() => {
              if (locked) return
              soundClick()
              const order = ['off', 'all', 'one'] as const
              const i = order.indexOf(player.repeat)
              player.setRepeat(order[(i + 1) % 3])
              bumpIdle()
            }}
          >
            <IconRepeat />
          </button>
        )}
      </div>
    )
  }

  /* Native video overlay controls */
  const nativeVideoOverlay = (
    <div
      data-no-swipe
      style={{
        position: 'absolute',
        inset: 0,
        opacity: nativeOverlayVisible ? 1 : 0,
        pointerEvents: nativeOverlayVisible ? 'auto' : 'none',
        background: tokens.overlayBg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '16px 14px calc(16px + env(safe-area-inset-bottom, 0px))',
        transition: 'opacity 0.35s ease',
        color: '#fff',
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (locked) {
          setLocked(false)
          bumpNativeIdle()
          return
        }
        bumpNativeIdle()
      }}
    >
      {progressBar(1, true, true)}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 12,
          flexWrap: 'wrap',
          opacity: locked ? 0.35 : 1,
          pointerEvents: locked ? 'none' : 'auto',
        }}
      >
        {transportRow('mini')}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 12,
          flexWrap: 'wrap',
          opacity: locked ? 0.35 : 1,
          pointerEvents: locked ? 'none' : 'auto',
        }}
      >
        <div
          className="gco-fs-pill"
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
          }}
        >
          <button
            type="button"
            aria-label="Bajar brillo"
            onClick={(e) => {
              e.stopPropagation()
              setBrightness((b) => clamp(b - 10, 40, 160))
              bumpNativeIdle()
            }}
          >
            <IconBrightDown size={13} />
          </button>
          <span>{brightness}%</span>
          <button
            type="button"
            aria-label="Subir brillo"
            onClick={(e) => {
              e.stopPropagation()
              setBrightness((b) => clamp(b + 10, 40, 160))
              bumpNativeIdle()
            }}
          >
            <IconBrightUp size={13} />
          </button>
        </div>

        <div
          className="gco-fs-pill"
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
          }}
        >
          <button
            type="button"
            aria-label="Bajar volumen"
            onClick={(e) => {
              e.stopPropagation()
              setVolumeUi((v) => clamp(v - 10, 0, 100))
              bumpNativeIdle()
            }}
          >
            <IconVolDown size={13} />
          </button>
          <span>{volumeUi}%</span>
          <button
            type="button"
            aria-label="Subir volumen"
            onClick={(e) => {
              e.stopPropagation()
              setVolumeUi((v) => clamp(v + 10, 0, 100))
              bumpNativeIdle()
            }}
          >
            <IconVolUp size={13} />
          </button>
        </div>

        <button
          type="button"
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            width: 36,
            height: 36,
            borderRadius: 12,
            color: locked ? tokens.accent : '#fff',
            background: locked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
            pointerEvents: 'auto',
          }}
          aria-label={locked ? 'Desbloquear' : 'Bloquear controles'}
          onClick={(e) => {
            e.stopPropagation()
            soundClick()
            setLocked((v) => !v)
            if (!locked) {
              /* acaba de bloquear: mantener overlay visible un momento */
              setNativeOverlayVisible(true)
            } else {
              bumpNativeIdle()
            }
          }}
        >
          <IconLock locked={locked} />
        </button>
      </div>
    </div>
  )

  /* ── Mini / floating bar ── */
  const barMaxW = mobile ? MOBILE_BAR_MAX_W : DESKTOP_BAR_MAX_W

  const miniBarInner = floatPos.docked ? (
    <button
      type="button"
      className="gco-open-zone"
      onClick={onOpenFromPill}
      style={{
        width: COLLAPSED_SIZE,
        height: COLLAPSED_SIZE,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 16,
        overflow: 'hidden',
        padding: 0,
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      aria-label="Abrir reproductor a pantalla completa"
    >
      {t?.coverDataUrl ? (
        <img
          src={t.coverDataUrl}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      ) : (
        <span style={{ fontSize: '1.25rem', opacity: 0.7 }}>♪</span>
      )}
    </button>
  ) : (
    <div
      data-theme={themeMode}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        width: '100%',
        maxWidth: barMaxW,
        background: tokens.floatBg,
        border: tokens.floatBorder,
        boxShadow: tokens.floatShadow,
        color: tokens.floatColor,
        borderRadius: 22,
        boxSizing: 'border-box',
      }}
    >
      <style>{globalCss}</style>
      <button
        type="button"
        className="gco-open-zone"
        onClick={onOpenFromPill}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            overflow: 'hidden',
            flexShrink: 0,
            background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          }}
        >
          {t?.coverDataUrl ? (
            <img
              src={t.coverDataUrl}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', opacity: 0.4 }}>♪</div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {t?.title || 'Sin título'}
          </p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '0.72rem',
              opacity: 0.55,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {t?.artist || '—'}
          </p>
        </div>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          data-no-drag
          className="gco-pb-icon"
          style={{ ...glassIconStyle, width: 36, height: 36, borderRadius: 12 }}
          aria-label="Anterior"
          onClick={(e) => {
            e.stopPropagation()
            soundClick()
            void player.prev()
          }}
        >
          <IconPrev size={14} />
        </button>
        <button
          type="button"
          data-no-drag
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            width: 40,
            height: 40,
            borderRadius: 14,
            background: tokens.accent,
            color: tokens.onAccent,
            border: 'none',
          }}
          aria-label={player.playing ? 'Pausar' : 'Reproducir'}
          onClick={(e) => {
            e.stopPropagation()
            soundClick()
            void player.toggle()
          }}
        >
          {player.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>
        <button
          type="button"
          data-no-drag
          className="gco-pb-icon"
          style={{ ...glassIconStyle, width: 36, height: 36, borderRadius: 12 }}
          aria-label="Siguiente"
          onClick={(e) => {
            e.stopPropagation()
            soundClick()
            void player.next()
          }}
        >
          <IconNext size={14} />
        </button>
      </div>
    </div>
  )

  const miniBar = floating ? (
    <div
      ref={floatRootRef}
      className={`gco-float-bar${dragging ? ' is-dragging' : ''}${floatPos.docked ? ' is-docked' : ''}`}
      style={{
        position: 'fixed',
        left: floatPos.x,
        top: floatPos.y,
        zIndex: 130,
        pointerEvents: 'auto',
        width: floatPos.docked
          ? COLLAPSED_SIZE
          : Math.min(barMaxW, typeof window !== 'undefined' ? window.innerWidth - 24 : barMaxW),
        maxWidth: barMaxW,
        background: floatPos.docked ? tokens.floatBg : undefined,
        border: floatPos.docked ? tokens.floatBorder : undefined,
        boxShadow: floatPos.docked ? tokens.floatShadow : undefined,
        color: tokens.floatColor,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={onPointerDownBar}
    >
      <style>{globalCss}</style>
      {miniBarInner}
    </div>
  ) : (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: barMaxW,
        margin: '0 auto',
      }}
    >
      {miniBarInner}
    </div>
  )

  /* ── Fullscreen portal content ── */
  const fullscreenContent = t ? (
    <div
      ref={fsRootRef}
      className="gco-fs-root"
      data-theme={themeMode}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: tokens.fsBg,
        color: tokens.fsColor,
        display: 'flex',
        flexDirection: 'column',
        transform: fsDragY > 0 ? `translateY(${fsDragY}px)` : undefined,
        opacity: fsDragY > 0 ? clamp(1 - fsDragY / 280, 0.4, 1) : 1,
        transition: fsDragY > 0 ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
        borderRadius: fsDragY > 12 ? 24 : 0,
        overflow: 'hidden',
      }}
      onPointerDown={onFsPointerDown}
      onPointerMove={onFsPointerMove}
      onPointerUp={onFsPointerUp}
      onPointerCancel={onFsPointerUp}
      onMouseMove={() => {
        if (!locked) bumpIdle()
      }}
      onTouchStart={() => {
        if (!locked) bumpIdle()
      }}
    >
      <style>{globalCss}</style>

      {/* Header — safe-area top + sin desbordar en notch/móvil */}
      <div
        data-no-swipe
        data-fs-handle
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingTop: 'max(10px, env(safe-area-inset-top, 0px))',
          paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
          paddingBottom: 8,
          opacity: overlayVisible ? 1 : 0.35,
          transition: 'opacity 0.3s',
          flexShrink: 0,
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <button
          type="button"
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            width: 36,
            height: 36,
            minWidth: 36,
            flexShrink: 0,
            borderRadius: 12,
          }}
          aria-label="Cerrar"
          onClick={closeFullscreen}
        >
          <IconChevronDown />
        </button>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            pointerEvents: 'none',
          }}
          title="Arrastra desde aquí hacia abajo para cerrar"
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 99,
              background: themeMode === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)',
            }}
          />
          <span style={{ fontSize: '0.65rem', opacity: 0.45, fontWeight: 600 }}>Cerrar</span>
        </div>
        <button
          type="button"
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            width: 36,
            height: 36,
            minWidth: 36,
            flexShrink: 0,
            borderRadius: 12,
            color: locked ? tokens.accent : tokens.glassIconColor,
          }}
          aria-label={locked ? 'Desbloquear' : 'Bloquear'}
          onClick={() => {
            soundClick()
            setLocked((v) => !v)
            bumpIdle()
          }}
        >
          <IconLock locked={locked} />
        </button>
      </div>

      <div
        ref={fsScrollRef}
        className="gco-pb-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 16px 12px',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
      >
        {fsTab === 'now' && (
          <>
            <div
              ref={mediaAreaRef}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 420,
                margin: '0 auto 16px',
                aspectRatio: '1',
                borderRadius: 24,
                overflow: 'hidden',
                ...tokens.liquid,
                filter: `brightness(${brightness}%)`,
              }}
              onClick={() => {
                if (nativeFsActive) {
                  bumpNativeIdle()
                  setNativeOverlayVisible((v) => !v || true)
                } else {
                  bumpIdle()
                }
              }}
            >
              {showVideo && videoUrl ? (
                <video
                  ref={(el) => {
                    videoRef.current = el
                    if (el) {
                      el.setAttribute('playsinline', 'true')
                      el.setAttribute('webkit-playsinline', 'true')
                      el.setAttribute('x5-playsinline', 'true')
                      el.setAttribute('x5-video-player-type', 'h5')
                      el.setAttribute('x5-video-player-fullscreen', 'true')
                    }
                  }}
                  src={videoUrl}
                  playsInline
                  preload="auto"
                  controls={false}
                  disablePictureInPicture={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    background: '#000',
                    pointerEvents: locked ? 'none' : 'auto',
                  }}
                />
              ) : t.coverDataUrl ? (
                <img
                  src={t.coverDataUrl}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    height: '100%',
                    fontSize: '3rem',
                    opacity: 0.35,
                  }}
                >
                  ♪
                </div>
              )}
              {nativeFsActive && nativeVideoOverlay}
            </div>

            {!nativeFsActive && hasVideo && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <div
                  className="gco-seg"
                  data-no-swipe
                  style={{
                    background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.09)',
                    border: tokens.glassBorder,
                  }}
                >
                  {(['Portada', 'Vídeo'] as const).map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={(i === 1) === showVideo ? 'is-on' : ''}
                      style={{
                        color:
                          (i === 1) === showVideo
                            ? tokens.fsColor
                            : themeMode === 'light'
                              ? 'rgba(0,0,0,0.45)'
                              : 'rgba(255,255,255,0.55)',
                        background:
                          (i === 1) === showVideo
                            ? themeMode === 'light'
                              ? 'rgba(0,0,0,0.08)'
                              : 'rgba(255,255,255,0.2)'
                            : 'transparent',
                      }}
                      onClick={() => {
                        soundClick()
                        setShowVideo(i === 1)
                        bumpIdle()
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!nativeFsActive && (
              <>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 'clamp(1.2rem, 5vw, 1.55rem)',
                    fontWeight: 800,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {t.title}
                </h1>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '0.95rem',
                    opacity: 0.62,
                    textAlign: 'center',
                  }}
                >
                  {t.artist}
                </p>

                <div
                  style={{
                    margin: '16px 0 4px',
                    opacity: overlayVisible ? 1 : 0.4,
                    transition: 'opacity 0.3s',
                  }}
                >
                  {progressBar(1, false, true)}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    marginBottom: 18,
                    opacity: overlayVisible ? 1 : 0.35,
                    transition: 'opacity 0.3s',
                    pointerEvents: locked ? 'none' : 'auto',
                  }}
                >
                  {transportRow('fs')}
                </div>

                {/* Vol + bright row in non-native FS */}
                <div
                  data-no-swipe
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: 14,
                    flexWrap: 'wrap',
                    opacity: overlayVisible ? (locked ? 0.35 : 1) : 0.25,
                    pointerEvents: locked ? 'none' : 'auto',
                    transition: 'opacity 0.3s',
                  }}
                >
                  <div
                    className="gco-fs-pill"
                    style={{
                      background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                      border: tokens.glassBorder,
                      color: tokens.fsColor,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Bajar brillo"
                      onClick={() => {
                        setBrightness((b) => clamp(b - 10, 40, 160))
                        bumpIdle()
                      }}
                    >
                      <IconBrightDown size={13} />
                    </button>
                    <span>{brightness}%</span>
                    <button
                      type="button"
                      aria-label="Subir brillo"
                      onClick={() => {
                        setBrightness((b) => clamp(b + 10, 40, 160))
                        bumpIdle()
                      }}
                    >
                      <IconBrightUp size={13} />
                    </button>
                  </div>
                  <div
                    className="gco-fs-pill"
                    style={{
                      background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                      border: tokens.glassBorder,
                      color: tokens.fsColor,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Bajar volumen"
                      onClick={() => {
                        setVolumeUi((v) => clamp(v - 10, 0, 100))
                        bumpIdle()
                      }}
                    >
                      <IconVolDown size={13} />
                    </button>
                    <span>{volumeUi}%</span>
                    <button
                      type="button"
                      aria-label="Subir volumen"
                      onClick={() => {
                        setVolumeUi((v) => clamp(v + 10, 0, 100))
                        bumpIdle()
                      }}
                    >
                      <IconVolUp size={13} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 10,
                    opacity: overlayVisible ? 1 : 0.3,
                    transition: 'opacity 0.3s',
                  }}
                >
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIconStyle}
                    aria-label="Pantalla completa"
                    onClick={() => void toggleNativeFullscreen()}
                  >
                    <IconFsEnter />
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIconStyle,
                      color: pipActive ? tokens.accent : tokens.glassIconColor,
                    }}
                    disabled={!hasVideo || !pipSupported}
                    aria-label="Vídeo en segundo plano (PiP)"
                    title={
                      !hasVideo
                        ? 'Solo disponible en pistas de vídeo'
                        : !pipSupported
                          ? 'PiP no soportado en este navegador'
                          : 'Picture-in-Picture'
                    }
                    onClick={() => void togglePip()}
                  >
                    <IconPip />
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {fsTab === 'queue' && (
          <div data-no-swipe>
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0 8px', fontWeight: 800 }}>
              Cola · {queue.length}
            </h2>
            <p style={{ margin: '0 0 12px', fontSize: '0.75rem', opacity: 0.5 }}>
              Mantén pulsado ⠿ y arrastra · en PC puedes arrastrar la fila
            </p>
            {queue.map((item, i) => {
              const active = item.id === t.id
              const isDrag = queueDraggingIdx === i
              const isDrop = queueDropIdx === i && queueDraggingIdx != null && queueDraggingIdx !== i
              return (
                <div
                  key={`${item.id}-${i}`}
                  data-queue-idx={i}
                  ref={(el) => {
                    if (el) queueRowsRef.current.set(i, el)
                    else queueRowsRef.current.delete(i)
                  }}
                  className={`gco-queue-row${isDrag ? ' is-dragging-row' : ''}${isDrop ? ' is-drop-target' : ''}`}
                  draggable={!mobile && !locked}
                  onDragStart={(e) => onHtmlDragStart(i, e)}
                  onDragOver={(e) => onHtmlDragOver(i, e)}
                  onDrop={(e) => onHtmlDrop(i, e)}
                  onDragEnd={onHtmlDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0.6rem 0.55rem',
                    borderRadius: 16,
                    background: active
                      ? themeMode === 'light'
                        ? 'rgba(0,0,0,0.06)'
                        : 'rgba(255,255,255,0.1)'
                      : isDrag || isDrop
                        ? tokens.surfaceMuted
                        : 'transparent',
                    marginBottom: 4,
                    cursor: isDrag ? 'grabbing' : 'default',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    outline: isDrop
                      ? `2px solid color-mix(in srgb, ${tokens.accent} 55%, transparent)`
                      : undefined,
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <button
                    type="button"
                    aria-label="Arrastrar para reordenar"
                    onPointerDown={(e) => onQueueHandlePointerDown(i, e)}
                    style={{
                      opacity: 0.5,
                      display: 'grid',
                      placeItems: 'center',
                      width: 28,
                      height: 36,
                      flexShrink: 0,
                      touchAction: 'none',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'grab',
                      padding: 0,
                    }}
                  >
                    <IconGrip />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (queueDraggingIdx != null) return
                      soundClick()
                      void player.playTrack(item, queue)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0,
                      minWidth: 0,
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background:
                          themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {item.coverDataUrl ? (
                        <img
                          src={item.coverDataUrl}
                          alt=""
                          draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: active ? 700 : 600,
                          color: active ? tokens.accent : undefined,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '0.9rem',
                        }}
                      >
                        {item.title}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.55 }}>
                        {item.artist}
                      </p>
                    </div>
                    <span style={{ fontSize: '0.72rem', opacity: 0.45, flexShrink: 0 }}>
                      {formatTrackTime(item.durationMs)}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {fsTab === 'lyrics' && (
          <div style={{ borderRadius: 22, padding: '14px 16px', ...tokens.liquid }} data-no-swipe>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px', fontWeight: 800 }}>Letra</h2>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '1.02rem',
                lineHeight: 1.7,
                opacity: 0.9,
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}
            >
              {t.lyrics?.trim() || 'Sin letra guardada.\nEdita la pista en la biblioteca.'}
            </pre>
          </div>
        )}
      </div>

      {/* Bottom tabs */}
      <div
        data-no-swipe
        style={{
          padding: '8px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
          flexShrink: 0,
          opacity: overlayVisible ? 1 : 0.4,
          transition: 'opacity 0.3s',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            padding: 5,
            borderRadius: 26,
            ...tokens.liquid,
          }}
        >
          {(
            [
              { id: 'queue' as const, label: 'Cola', icon: '☰' },
              { id: 'now' as const, label: 'Ahora', icon: '◎' },
              { id: 'lyrics' as const, label: 'Letra', icon: '¶' },
            ] as const
          ).map((tab) => {
            const on = fsTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setFsTab(tab.id)
                  if (tab.id === 'queue') syncQueue()
                  bumpIdle()
                }}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: '0.72rem',
                  fontWeight: on ? 700 : 500,
                  padding: '0.6rem 0.3rem',
                  borderRadius: 20,
                  background: on
                    ? themeMode === 'light'
                      ? 'rgba(0,0,0,0.08)'
                      : 'rgba(255,255,255,0.2)'
                    : 'transparent',
                  color: on
                    ? tokens.fsColor
                    : themeMode === 'light'
                      ? 'rgba(0,0,0,0.45)'
                      : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: '0.95rem' }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  ) : null

  /* Sin pista activa: no mostrar pastilla ni burbuja */
  if (!t) return null

  const hideBecauseGlobal =
    !floating &&
    globalBarMounted &&
    typeof document !== 'undefined' &&
    !!document.getElementById('gco-global-player-host')

  const pipFallbackUi =
    pipFallback && hasVideo && videoUrl && typeof document !== 'undefined' ? (
      <div
        style={{
          position: 'fixed',
          right: 'max(12px, env(safe-area-inset-right, 0px))',
          bottom: 'max(88px, calc(72px + env(safe-area-inset-bottom, 0px)))',
          zIndex: 160,
          width: 'min(42vw, 168px)',
          aspectRatio: '16 / 9',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          border: tokens.floatBorder,
          background: '#000',
          pointerEvents: 'auto',
        }}
      >
        <video
          src={videoUrl}
          playsInline
          autoPlay
          muted={false}
          ref={(el) => {
            if (el) {
              el.setAttribute('playsinline', 'true')
              el.setAttribute('webkit-playsinline', 'true')
              try {
                void el.play()
              } catch {
                /* */
              }
            }
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <button
          type="button"
          aria-label="Cerrar vídeo flotante"
          onClick={() => void exitAllPip()}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            borderRadius: 10,
            border: 'none',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.85rem',
          }}
        >
          ×
        </button>
        <button
          type="button"
          aria-label="Abrir reproductor"
          onClick={() => {
            void exitAllPip()
            setFullscreen(true)
          }}
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            border: 'none',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: '0.65rem',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Ampliar
        </button>
      </div>
    ) : null

  return (
    <>
      {hideBecauseGlobal ? null : miniBar}
      {fullscreen && typeof document !== 'undefined' && fullscreenContent
        ? createPortal(fullscreenContent, document.body)
        : null}
      {pipFallbackUi ? createPortal(pipFallbackUi, document.body) : null}
    </>
  )
}

export function ensureGlobalPlayerBar() {
  if (typeof document === 'undefined') return
  if (globalRoot && globalBarMounted) return

  let host = document.getElementById('gco-global-player-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'gco-global-player-host'
    host.setAttribute('data-gco', 'global-player')
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;'
    document.body.appendChild(host)
  }

  function Bridge() {
    const player = useMediaPlayer()
    if (!player.track) return null
    return (
      <div style={{ pointerEvents: 'auto' }}>
        <PlayerBar player={player} floating />
      </div>
    )
  }

  try {
    if (!globalRoot) globalRoot = createRoot(host)
    globalBarMounted = true
    globalRoot.render(<Bridge />)
  } catch (err) {
    console.warn('[gco] ensureGlobalPlayerBar:', err)
    try {
      host.innerHTML = ''
      globalRoot = createRoot(host)
      globalBarMounted = true
      globalRoot.render(<Bridge />)
    } catch (err2) {
      console.warn('[gco] ensureGlobalPlayerBar retry:', err2)
      globalBarMounted = false
      globalRoot = null
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('gco:need-player-bar', () => ensureGlobalPlayerBar())
  void import('@/hooks/useMediaPlayer')
    .then(
      (mod: {
        registerFloatingBarMounter?: (fn: () => void) => void
        api?: { track: unknown }
      }) => {
        mod.registerFloatingBarMounter?.(ensureGlobalPlayerBar)
        if (mod.api?.track) requestAnimationFrame(() => ensureGlobalPlayerBar())
      },
    )
    .catch(() => {})
}