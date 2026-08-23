/**
 * ============================================================================
 * PlayerBar.tsx — pastilla flotante + reproductor fullscreen (GCO)
 * ============================================================================
 * Temas: oscuro / claro / arcoíris vía CSS vars + data-theme / clases.
 * Clic portada/título → fullscreen (drag solo tras umbral).
 * Dock L/R · móvil · PiP · cola · letra · heatmap · vídeo.
 * Plataformas: web, PWA, Capacitor APK, Electron.
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
 * Detección de tema (oscuro / claro / arcoíris)
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

  // Preferencia del sistema si no hay marca explícita
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
    // Poll suave por si el tema se cambia solo en localStorage sin evento
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

/** Tokens visuales según tema (siempre priorizan CSS vars de la app). */
function useThemeTokens(mode: AppThemeMode) {
  return useMemo(() => {
    const accent = 'var(--gco-primary)'
    const onAccent = 'var(--gco-on-primary, #0B1220)'

    if (mode === 'light') {
      return {
        accent,
        onAccent,
        floatBg:
          'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(244,246,252,0.9))',
        floatBorder: '1px solid rgba(15,20,40,0.1)',
        floatShadow: '0 12px 36px rgba(20,30,60,0.14), inset 0 1px 0 rgba(255,255,255,0.9)',
        floatColor: 'var(--gco-ink, #12141c)',
        floatMuted: 'var(--gco-ink-muted, rgba(18,20,28,0.55))',
        fsBg:
          'radial-gradient(ellipse at top, #eef1f8 0%, #dfe5f2 45%, #d0d7e8 100%)',
        fsColor: 'var(--gco-ink, #12141c)',
        glassBg: 'rgba(255,255,255,0.55)',
        glassBorder: '1px solid rgba(20,30,50,0.1)',
        glassIconBg: 'rgba(255,255,255,0.7)',
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
      }
    }

    // dark + rainbow (rainbow se apoya en --gco-primary animado del tema global)
    return {
      accent,
      onAccent,
      floatBg:
        'linear-gradient(145deg, rgba(28,32,48,0.94), rgba(14,16,28,0.9))',
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
    }
  }, [mode])
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Utils geo / storage
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

function buildGlobalCss(mode: AppThemeMode) {
  const isLight = mode === 'light'
  return `
.gco-pb-scroll { scrollbar-width: thin; scrollbar-color: ${isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.22)'} transparent; }
.gco-pb-scroll::-webkit-scrollbar { width: 5px; }
.gco-pb-scroll::-webkit-scrollbar-thumb { background: ${isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}; border-radius: 999px; }
.gco-pb-icon:hover { filter: brightness(1.08); }
.gco-pb-icon:active { transform: scale(0.93); }
.gco-pb-icon:disabled { opacity: 0.32; cursor: not-allowed; }
.gco-float-bar {
  border-radius: 22px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
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
.gco-fs-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 6px 4px 10px; border-radius: 999px;
  font-size: 0.74rem; font-weight: 600;
}
.gco-fs-pill span { min-width: 54px; text-align: center; font-variant-numeric: tabular-nums; }
.gco-fs-pill button {
  width: 26px; height: 26px; border-radius: 50%; border: none;
  cursor: pointer; display: grid; place-items: center;
}
.gco-fs-range {
  -webkit-appearance: none; appearance: none; width: 100%; height: 6px;
  border-radius: 999px; outline: none; cursor: pointer;
}
.gco-fs-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.35); margin-top: -5px;
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
}
.gco-open-zone:focus-visible {
  outline: 2px solid var(--gco-primary);
  outline-offset: 2px;
  border-radius: 12px;
}
${mode === 'rainbow' ? `
.gco-float-bar {
  box-shadow: 0 12px 40px color-mix(in srgb, var(--gco-primary) 25%, transparent),
              inset 0 1px 0 rgba(255,255,255,0.12);
}
` : ''}
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
  const dragQ = useRef<number | null>(null)
  const fsRootRef = useRef<HTMLDivElement | null>(null)

  const [locked, setLocked] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [volumeUi, setVolumeUi] = useState(100)
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

  const openFullscreen = useCallback(() => {
    soundClick()
    setFsTab('now')
    setFullscreen(true)
  }, [])

  const closeFullscreen = useCallback(() => {
    soundClick()
    setFullscreen(false)
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
    if (typeof document === 'undefined') return
    setPipSupported(
      'pictureInPictureEnabled' in document &&
        !!(document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled
    )
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

  /* Atajos con fullscreen abierto */
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setFullscreen(false)
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        void player.toggle()
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
  }, [fullscreen, player, dur])

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
    v.muted = true
    if (player.playing) void v.play().catch(() => {})
    else v.pause()
  }, [player.playing, player.currentMs, videoUrl])

  useEffect(() => {
    if (!hasVideo) setShowVideo(false)
  }, [hasVideo, t?.id])

  useEffect(() => {
    if (!t) return
    const all = loadHeatmapStore()
    const saved = all[t.id]
    const arr =
      saved && saved.length === HEATMAP_BINS ? [...saved] : new Array(HEATMAP_BINS).fill(0)
    heatmapRef.current = arr
    setHeatmap(arr)
    lastBinRef.current = null
  }, [t?.id])

  useEffect(() => {
    if (!t || !player.playing || !dur) return
    const bin = clamp(Math.floor((player.currentMs / dur) * HEATMAP_BINS), 0, HEATMAP_BINS - 1)
    if (bin !== lastBinRef.current) {
      lastBinRef.current = bin
      const next = [...heatmapRef.current]
      next[bin] += 1
      heatmapRef.current = next
      setHeatmap(next)
      const all = loadHeatmapStore()
      all[t.id] = next
      saveHeatmapStore(all)
    }
  }, [player.currentMs, player.playing, dur, t?.id])

  useEffect(() => {
    player.setVolume?.(volumeUi / 100)
  }, [volumeUi, player])

  useEffect(() => {
    if (!fullscreen || fsTab !== 'now') return
    setOverlayVisible(true)
    const bump = () => {
      setOverlayVisible(true)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = window.setTimeout(() => setOverlayVisible(false), CONTROLS_IDLE_MS)
    }
    bump()
    const root = fsRootRef.current
    root?.addEventListener('mousemove', bump)
    root?.addEventListener('pointerdown', bump)
    root?.addEventListener('touchstart', bump)
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      root?.removeEventListener('mousemove', bump)
      root?.removeEventListener('pointerdown', bump)
      root?.removeEventListener('touchstart', bump)
    }
  }, [fullscreen, fsTab])

  useEffect(() => {
    const onFsChange = () => {
      const anyDoc = document as Document & { webkitFullscreenElement?: Element | null }
      const fs = document.fullscreenElement || anyDoc.webkitFullscreenElement || null
      const videoFs = !!(
        videoRef.current &&
        (videoRef.current as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
          .webkitDisplayingFullscreen
      )
      setNativeFsActive(fs === mediaAreaRef.current || fs === videoRef.current || videoFs)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener)
    }
  }, [videoUrl, showVideo])

  useEffect(() => {
    if (!nativeFsActive) return
    setNativeOverlayVisible(true)
    const bump = () => {
      setNativeOverlayVisible(true)
      if (nativeIdleTimerRef.current) window.clearTimeout(nativeIdleTimerRef.current)
      nativeIdleTimerRef.current = window.setTimeout(
        () => setNativeOverlayVisible(false),
        CONTROLS_IDLE_MS
      )
    }
    bump()
    const el = mediaAreaRef.current
    el?.addEventListener('mousemove', bump)
    el?.addEventListener('pointerdown', bump)
    el?.addEventListener('touchstart', bump)
    return () => {
      if (nativeIdleTimerRef.current) window.clearTimeout(nativeIdleTimerRef.current)
      el?.removeEventListener('mousemove', bump)
      el?.removeEventListener('pointerdown', bump)
      el?.removeEventListener('touchstart', bump)
    }
  }, [nativeFsActive])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnter = () => setPipActive(true)
    const onLeave = () => setPipActive(false)
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter)
      v.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [videoUrl])

  useEffect(() => {
    if (!pipRequestedRef.current) return
    const v = videoRef.current
    if (!v || !videoUrl) return
    const tryPip = () => {
      pipRequestedRef.current = false
      void v.requestPictureInPicture().catch((err) => console.warn('[gco] PiP', err))
    }
    if (v.readyState >= 1) tryPip()
    else v.addEventListener('loadedmetadata', tryPip, { once: true })
  }, [showVideo, videoUrl, fullscreen])

  /* Drag con umbral (clic intacto) */
  const finishDrag = () => {
    const el = floatRootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = nearestEdge(rect.left, rect.top, rect.width, rect.height)
    if (edge === 'left' || edge === 'right') {
      const y = clamp(rect.top, 8, window.innerHeight - COLLAPSED_SIZE - 8)
      const x = edge === 'left' ? 8 : window.innerWidth - COLLAPSED_SIZE - 8
      const next: FloatPos = { x, y, edge, docked: true }
      setFloatPos(next)
      saveFloatPos(next)
      return
    }
    const c = clampPos(rect.left, rect.top, rect.width, rect.height)
    let { x, y } = c
    if (edge === 'top') y = 8
    if (edge === 'bottom') {
      const reserve = mobile ? MOBILE_NAV_RESERVE + 8 : 20
      y = window.innerHeight - rect.height - reserve
    }
    const next: FloatPos = {
      x,
      y,
      edge: edge === 'top' || edge === 'bottom' ? edge : null,
      docked: false,
    }
    setFloatPos(next)
    saveFloatPos(next)
  }

  const onPointerDownBar = (e: ReactPointerEvent) => {
    if (!floating || !floatRootRef.current) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    pointerIdRef.current = e.pointerId
    dragActiveRef.current = false
    const rect = floatRootRef.current.getBoundingClientRect()
    barSizeRef.current = { w: rect.width, h: rect.height }
    dragStartRef.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }
  }

  const onPointerMoveBar = (e: ReactPointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    if (!dragActiveRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      dragActiveRef.current = true
      setDragging(true)
      try {
        floatRootRef.current?.setPointerCapture(e.pointerId)
      } catch {
        /* */
      }
    }
    const { w, h } = barSizeRef.current
    const c = clampPos(
      dragStartRef.current.left + dx,
      dragStartRef.current.top + dy,
      floatPos.docked ? COLLAPSED_SIZE : w,
      h
    )
    setFloatPos((p) => ({ ...p, x: c.x, y: c.y, docked: false, edge: null }))
  }

  const onPointerUpBar = (e: ReactPointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return
    const wasDragging = dragActiveRef.current
    pointerIdRef.current = null
    dragActiveRef.current = false
    try {
      floatRootRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
    setDragging(false)
    if (wasDragging) finishDrag()
  }

  const undock = () => {
    const maxW = mobile ? MOBILE_BAR_MAX_W : DESKTOP_BAR_MAX_W
    const w = Math.min(maxW, window.innerWidth - 24)
    const x =
      floatPos.edge === 'right'
        ? Math.max(12, window.innerWidth - w - 12)
        : Math.min(Math.max(12, floatPos.x), window.innerWidth - w - 12)
    const next: FloatPos = {
      x,
      y: clamp(floatPos.y, 12, window.innerHeight - 80),
      edge: null,
      docked: false,
    }
    setFloatPos(next)
    saveFloatPos(next)
    soundClick()
  }

  const onOpenFromPill = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (dragActiveRef.current || dragging) return
    openFullscreen()
  }

  const togglePip = useCallback(async () => {
    soundClick()
    if (!hasVideo || !t) return
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture()
      } catch (err) {
        console.warn('[gco] exit PiP', err)
      }
      return
    }
    if (!document.pictureInPictureEnabled) return
    setShowVideo(true)
    if (!fullscreen) setFullscreen(true)
    pipRequestedRef.current = true
    window.setTimeout(() => {
      const v = videoRef.current
      if (!v) return
      const run = async () => {
        try {
          v.muted = true
          if (player.playing) await v.play().catch(() => {})
          if (v !== document.pictureInPictureElement) await v.requestPictureInPicture()
        } catch (err) {
          console.warn('[gco] PiP', err)
        }
      }
      if (v.readyState >= 1) void run()
      else v.addEventListener('loadedmetadata', () => void run(), { once: true })
    }, 120)
  }, [hasVideo, t, fullscreen, player.playing])

  const toggleNativeFullscreen = async () => {
    soundClick()
    const el = mediaAreaRef.current || videoRef.current
    if (!el) return
    const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => void }
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen()
        else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen()
        else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
          ;(videoRef.current as any).webkitEnterFullscreen()
        }
      } else await document.exitFullscreen()
    } catch (err) {
      console.warn('[gco] fs', err)
    }
  }

  const reorderQueue = (from: number, to: number) => {
    if (from === to) return
    const q = [...(player.getQueue?.() ?? [])]
    const [item] = q.splice(from, 1)
    q.splice(to, 0, item)
    player.setQueue?.(q)
    setQueue(q)
  }

  const progressBar = (opacity = 1, large = false) => {
    const pct = dur > 0 ? clamp((player.currentMs / dur) * 100, 0, 100) : 0
    const maxHeat = Math.max(1, ...heatmap)
    return (
      <div data-no-drag style={{ position: 'relative', height: large ? 28 : 18, opacity, transition: 'opacity 0.3s' }}>
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
          value={clamp(player.currentMs, 0, dur || 1)}
          disabled={!dur}
          onChange={(e) => player.seek(Number(e.target.value))}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', height: '100%' }}
          aria-label="Progreso"
        />
      </div>
    )
  }

  if (!t) return null

  const barMaxW = mobile ? MOBILE_BAR_MAX_W : DESKTOP_BAR_MAX_W

  const miniBar = floating ? (
    <div
      ref={floatRootRef}
      className={`gco-float-bar${dragging ? ' is-dragging' : ''}${floatPos.docked ? ' is-docked' : ''}`}
      data-theme={themeMode}
      style={{
        position: 'fixed',
        left: floatPos.x,
        top: floatPos.y,
        zIndex: 130,
        width: floatPos.docked ? COLLAPSED_SIZE : `min(${barMaxW}px, calc(100vw - 24px))`,
        padding: floatPos.docked ? 0 : '8px 10px 8px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: dragging ? 'grabbing' : 'grab',
        pointerEvents: 'auto',
        background: tokens.floatBg,
        border: tokens.floatBorder,
        boxShadow: tokens.floatShadow,
        color: tokens.floatColor,
      }}
      onPointerDown={onPointerDownBar}
      onPointerMove={onPointerMoveBar}
      onPointerUp={onPointerUpBar}
      onPointerCancel={onPointerUpBar}
    >
      <style>{globalCss}</style>
      {floatPos.docked ? (
        <button
          type="button"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: 16,
            overflow: 'hidden',
          }}
          aria-label="Expandir"
          onClick={(e) => {
            e.stopPropagation()
            if (dragging) return
            undock()
          }}
        >
          {t.coverDataUrl ? (
            <img
              src={t.coverDataUrl}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: tokens.accent }}>
              ♪
            </span>
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="gco-open-zone"
            onClick={onOpenFromPill}
            aria-label="Abrir reproductor"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              overflow: 'hidden',
              flexShrink: 0,
              background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              display: 'block',
            }}
          >
            {t.coverDataUrl ? (
              <img
                src={t.coverDataUrl}
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <span style={{ display: 'grid', placeItems: 'center', height: '100%', pointerEvents: 'none' }}>
                ♪
              </span>
            )}
          </button>
          <button
            type="button"
            className="gco-open-zone"
            onClick={onOpenFromPill}
            aria-label="Abrir reproductor"
            style={{ flex: 1 }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: mobile ? '0.8rem' : '0.88rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
              }}
            >
              {t.title}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '0.72rem',
                color: tokens.floatMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
              }}
            >
              {t.artist}
            </p>
          </button>
          <div data-no-drag style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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
        </>
      )}
    </div>
  ) : (
    <div
      className="gco-float-bar"
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
      }}
    >
      <style>{globalCss}</style>
      <button
        type="button"
        className="gco-open-zone"
        onClick={openFullscreen}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}
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
          {t.coverDataUrl ? (
            <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>
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
            {t.title}
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: tokens.floatMuted }}>{t.artist}</p>
        </div>
      </button>
      <button
        type="button"
        data-no-drag
        className="gco-pb-icon"
        style={{
          ...glassIconStyle,
          width: 40,
          height: 40,
          background: tokens.accent,
          color: tokens.onAccent,
          border: 'none',
        }}
        aria-label={player.playing ? 'Pausar' : 'Reproducir'}
        onClick={() => {
          soundClick()
          void player.toggle()
        }}
      >
        {player.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
    </div>
  )

  const fullscreenContent = (
    <div
      ref={fsRootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor"
      data-theme={themeMode}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        background: tokens.fsBg,
        color: tokens.fsColor,
      }}
    >
      <style>{globalCss}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 16px 8px',
          flexShrink: 0,
        }}
      >
        <button type="button" className="gco-pb-icon" style={glassIconStyle} aria-label="Cerrar" onClick={closeFullscreen}>
          <IconChevronDown />
        </button>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', opacity: 0.8 }}>Reproduciendo</span>
        <button
          type="button"
          className="gco-pb-icon"
          style={{
            ...glassIconStyle,
            color: pipActive ? tokens.accent : tokens.glassIconColor,
            opacity: hasVideo && pipSupported ? 1 : 0.35,
          }}
          disabled={!hasVideo || !pipSupported}
          aria-label="Picture in Picture"
          onClick={() => void togglePip()}
        >
          <IconPip />
        </button>
      </div>

      <div className="gco-pb-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 20px 12px' }}>
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
            >
              {showVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              ) : t.coverDataUrl ? (
                <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '3rem', opacity: 0.35 }}>
                  ♪
                </div>
              )}
              {nativeFsActive && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: nativeOverlayVisible ? 1 : 0,
                    pointerEvents: nativeOverlayVisible ? 'auto' : 'none',
                    background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.75))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: 16,
                    transition: 'opacity 0.35s ease',
                    color: '#fff',
                  }}
                >
                  {progressBar(1, true)}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 10,
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
                      <button type="button" onClick={() => setBrightness((b) => clamp(b - 10, 40, 160))}>
                        −
                      </button>
                      <span>{brightness}%</span>
                      <button type="button" onClick={() => setBrightness((b) => clamp(b + 10, 40, 160))}>
                        +
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
                      <button type="button" onClick={() => setVolumeUi((v) => clamp(v - 10, 0, 100))}>
                        −
                      </button>
                      <span>{volumeUi}%</span>
                      <button type="button" onClick={() => setVolumeUi((v) => clamp(v + 10, 0, 100))}>
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="gco-pb-icon"
                      style={{ ...glassIconStyle, color: locked ? tokens.accent : '#fff' }}
                      onClick={() => {
                        soundClick()
                        setLocked((v) => !v)
                      }}
                    >
                      <IconLock locked={locked} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!nativeFsActive && hasVideo && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <div
                  className="gco-seg"
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
                  }}
                >
                  {t.title}
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.95rem', opacity: 0.62, textAlign: 'center' }}>
                  {t.artist}
                </p>
                <div style={{ margin: '14px 0 4px' }}>{progressBar(overlayVisible ? 1 : 0.35, false)}</div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    opacity: 0.55,
                    marginBottom: 16,
                  }}
                >
                  <span>{formatTrackTime(player.currentMs)}</span>
                  <span>{formatTrackTime(dur)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 14,
                    marginBottom: 18,
                  }}
                >
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIconStyle,
                      opacity: player.shuffle ? 1 : 0.4,
                      color: player.shuffle ? tokens.accent : undefined,
                    }}
                    aria-label="Aleatorio"
                    onClick={() => {
                      soundClick()
                      player.setShuffle(!player.shuffle)
                    }}
                  >
                    <IconShuffle />
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIconStyle}
                    aria-label="Anterior"
                    onClick={() => {
                      soundClick()
                      void player.prev()
                    }}
                  >
                    <IconPrev />
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIconStyle,
                      width: 68,
                      height: 68,
                      borderRadius: 24,
                      background: tokens.accent,
                      color: tokens.onAccent,
                      border: 'none',
                      boxShadow: `0 8px 28px color-mix(in srgb, ${tokens.accent} 45%, transparent)`,
                    }}
                    aria-label={player.playing ? 'Pausar' : 'Reproducir'}
                    onClick={() => {
                      soundClick()
                      void player.toggle()
                    }}
                  >
                    {player.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIconStyle}
                    aria-label="Siguiente"
                    onClick={() => {
                      soundClick()
                      void player.next()
                    }}
                  >
                    <IconNext />
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIconStyle,
                      opacity: player.repeat === 'off' ? 0.4 : 1,
                      color: player.repeat !== 'off' ? tokens.accent : undefined,
                    }}
                    aria-label="Repetir"
                    onClick={() => {
                      soundClick()
                      const order = ['off', 'all', 'one'] as const
                      const i = order.indexOf(player.repeat)
                      player.setRepeat(order[(i + 1) % 3])
                    }}
                  >
                    <IconRepeat />
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
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
                    aria-label="Vídeo en segundo plano"
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
          <div>
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0 8px', fontWeight: 800 }}>
              Cola · {queue.length}
            </h2>
            {queue.map((item, i) => {
              const active = item.id === t.id
              return (
                <div
                  key={`${item.id}-${i}`}
                  draggable
                  onDragStart={() => {
                    dragQ.current = i
                  }}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => {
                    if (dragQ.current != null) reorderQueue(dragQ.current, i)
                    dragQ.current = null
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0.55rem 0.5rem',
                    borderRadius: 16,
                    background: active
                      ? themeMode === 'light'
                        ? 'rgba(0,0,0,0.06)'
                        : 'rgba(255,255,255,0.1)'
                      : 'transparent',
                    marginBottom: 3,
                    cursor: 'grab',
                  }}
                >
                  <span style={{ opacity: 0.4 }}>⠿</span>
                  <button
                    type="button"
                    onClick={() => {
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
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {item.coverDataUrl ? (
                        <img src={item.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.55 }}>{item.artist}</p>
                    </div>
                    <span style={{ fontSize: '0.72rem', opacity: 0.45 }}>
                      {formatTrackTime(item.durationMs)}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {fsTab === 'lyrics' && (
          <div style={{ borderRadius: 22, padding: '14px 16px', ...tokens.liquid }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px', fontWeight: 800 }}>Letra</h2>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '1.02rem',
                lineHeight: 1.7,
                opacity: 0.9,
              }}
            >
              {t.lyrics?.trim() || 'Sin letra guardada.\nEdita la pista en la biblioteca.'}
            </pre>
          </div>
        )}
      </div>

      <div style={{ padding: '8px 16px calc(14px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
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
                  color: on ? tokens.fsColor : themeMode === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)',
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
  )

  const hideBecauseGlobal =
    !floating &&
    globalBarMounted &&
    typeof document !== 'undefined' &&
    !!document.getElementById('gco-global-player-host')

  return (
    <>
      {hideBecauseGlobal ? null : miniBar}
      {fullscreen && typeof document !== 'undefined'
        ? createPortal(fullscreenContent, document.body)
        : null}
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
      }
    )
    .catch(() => {})
}