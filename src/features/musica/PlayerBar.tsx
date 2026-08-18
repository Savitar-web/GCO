import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { formatTrackTime, getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'
import { useMediaPlayer, type MediaPlayerApi } from '@/hooks/useMediaPlayer'
import { soundClick } from '@/core/audio/uiSounds'

const PREF_KEY = 'gco:player-bar-prefs'
const HEATMAP_KEY = 'gco:player-heatmap'
const HEATMAP_BINS = 40
/** Milisegundos de inactividad antes de ocultar overlays de controles (diálogo y vídeo nativo). */
const CONTROLS_IDLE_MS = 3200

const FLOAT_POS_KEY = 'gco:player-bar-float'
const EDGE_SNAP_PX = 36
const COLLAPSED_SIZE = 48
/** Píxeles de movimiento antes de considerar arrastre (vs click). */
const DRAG_THRESHOLD_PX = 10

type FloatEdge = 'left' | 'right' | 'top' | 'bottom' | null
type FloatPos = { x: number; y: number; edge: FloatEdge }

function loadFloatPos(): FloatPos {
  // Siempre centrada abajo al cargar (la barra “correcta”).
  // El usuario puede arrastrar después; no restauramos posiciones raras
  // que aparecían junto al click de la canción.
  if (typeof window !== 'undefined') {
    const w = Math.min(560, window.innerWidth - 24)
    return {
      x: Math.max(12, (window.innerWidth - w) / 2),
      y: Math.max(12, window.innerHeight - 120),
      edge: null,
    }
  }
  return { x: 24, y: 24, edge: null }
}

function saveFloatPos(p: FloatPos) {
  try { localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(p)) } catch { /* */ }
}

function nearestEdge(x: number, y: number, w: number, h: number): FloatEdge {
  if (typeof window === 'undefined') return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const dist: Record<Exclude<FloatEdge, null>, number> = {
    left: x, right: vw - (x + w), top: y, bottom: vh - (y + h),
  }
  const entries = Object.entries(dist) as [Exclude<FloatEdge, null>, number][]
  entries.sort((a, b) => a[1] - b[1])
  return entries[0][1] <= EDGE_SNAP_PX ? entries[0][0] : null
}

let globalBarMounted = false
let globalRoot: Root | null = null
export function isGlobalPlayerBarMounted() { return globalBarMounted }


export function getBarPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return JSON.parse(raw) as { progressColor: string }
  } catch {
    /* */
  }
  return { progressColor: '#22E6C5' }
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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

type Props = {
  player: MediaPlayerApi
  compact?: boolean
  floating?: boolean
}

type FsTab = 'queue' | 'now' | 'lyrics'

function isVideoTrack(t: TrackItem) {
  return (
    !!t.mime &&
    (t.mime.startsWith('video/') ||
      /mp4|webm|mov|mkv/i.test(t.mime) ||
      /\.(mp4|webm|mov|mkv)$/i.test(t.title))
  )
}

/** Color de acento: siempre sigue al tema activo (--gco-primary), igual que el resto de la UI.
 *  El color elegido en "Más" solo se usa para la barra de progreso (personalizable aparte). */
const ACCENT = 'var(--gco-primary)'
const ON_ACCENT = 'var(--gco-on-primary, #0B1220)'

/** Panel "liquid glass": vidrio esmerilado con highlight interior, usado en toda la pantalla completa. */
const LIQUID_PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  backdropFilter: 'blur(24px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
  boxShadow: '0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.14)',
}

const glassIcon: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.1)',
  color: '#F3F5FA',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  flexShrink: 0,
  transition: 'background-color 0.15s ease, transform 0.1s ease',
}

const GLOBAL_CSS = `
.gco-pb-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.gco-pb-scroll::-webkit-scrollbar { width: 5px; }
.gco-pb-scroll::-webkit-scrollbar-track { background: transparent; }
.gco-pb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 999px; }
.gco-pb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.36); }
.gco-pb-icon:hover { background: rgba(255,255,255,0.18) !important; }
.gco-pb-icon:active { transform: scale(0.93); }
.gco-pb-icon:disabled { opacity: 0.32; cursor: not-allowed; }
.gco-pb-icon:disabled:hover { background: rgba(255,255,255,0.1) !important; }

.gco-fs-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.09);
  border: 1px solid rgba(255,255,255,0.15);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  font-size: 0.74rem;
  font-weight: 600;
  color: rgba(255,255,255,0.88);
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.14);
}
.gco-fs-pill span {
  min-width: 54px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.gco-fs-pill button {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.14);
  color: #fff;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.gco-fs-pill button:hover { background: rgba(255,255,255,0.26); }
.gco-fs-pill button:active { transform: scale(0.92); }

.gco-fs-fade { transition: opacity 0.4s ease, background 0.4s ease; }

.gco-fs-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.16);
  outline: none;
  cursor: pointer;
}
.gco-fs-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  margin-top: -5px;
  transition: transform 0.12s ease;
}
.gco-fs-range::-webkit-slider-thumb:active { transform: scale(1.15); }
.gco-fs-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
}
.gco-fs-range::-moz-range-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.16); }
.gco-fs-range::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--gco-primary); }
.gco-fs-range::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 50%; background: #fff; border: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.gco-fs-range:disabled { cursor: not-allowed; opacity: 0.4; }

.gco-native-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: opacity 0.35s ease;
  z-index: 5;
}

.gco-seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,0.09);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.gco-seg button {
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  background: transparent;
  color: rgba(255,255,255,0.55);
  transition: background-color 0.18s ease, color 0.18s ease;
}
.gco-seg button.is-on {
  background: rgba(255,255,255,0.2);
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}
`

export function PlayerBar({ player, compact, floating }: Props) {
  const progressColor = getBarPrefs().progressColor
  const t = player.track
  const [fullscreen, setFullscreen] = useState(false)
  const [fsTab, setFsTab] = useState<FsTab>('now')
  const [queue, setQueue] = useState<TrackItem[]>([])
  const [showVideo, setShowVideo] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const dragQ = useRef<number | null>(null)
  const fsRootRef = useRef<HTMLDivElement | null>(null)

  // ── Controles del reproductor de vídeo nativo (brillo, volumen, bloqueo, progreso "Netflix-style") ──
  const [locked, setLocked] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [volumeUi, setVolumeUi] = useState(100)
  const [heatmap, setHeatmap] = useState<number[]>(() => new Array(HEATMAP_BINS).fill(0))
  const [overlayVisible, setOverlayVisible] = useState(true)
  const heatmapRef = useRef<number[]>(heatmap)
  const lastBinRef = useRef<number | null>(null)
  const mediaAreaRef = useRef<HTMLDivElement | null>(null)
  const idleTimerRef = useRef<number | null>(null)

  // ── Pantalla completa nativa del vídeo (Fullscreen API) con overlay tipo Netflix ──
  const [nativeFsActive, setNativeFsActive] = useState(false)
  const [nativeOverlayVisible, setNativeOverlayVisible] = useState(true)
  const nativeIdleTimerRef = useRef<number | null>(null)

  const [floatPos, setFloatPos] = useState<FloatPos>(() => loadFloatPos())
  const [dragging, setDragging] = useState(false)
  const dragMovedRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const barSizeRef = useRef({ w: 360, h: 56 })
  const floatRootRef = useRef<HTMLDivElement | null>(null)

  // ── Picture-in-Picture: ver el vídeo flotando en segundo plano mientras el audio sigue sonando ──
  const [pipActive, setPipActive] = useState(false)
  const pipRequestedRef = useRef(false)

  const dur = player.durationMs || t?.durationMs || 0
  const hasVideo = t ? isVideoTrack(t) : false

  const syncQueue = () => {
    setQueue(player.getQueue?.() ?? [])
  }

  useEffect(() => {
    if (!fullscreen) return
    syncQueue()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [fullscreen, player, t?.id])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    ;(async () => {
      if (!t || !hasVideo || !showVideo || !fullscreen) {
        setVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
        return
      }
      try {
        const blob = await getTrackBlob(t.blobKey)
        if (cancelled || !blob) return
        const url = URL.createObjectURL(blob)
        revoked = url
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
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [t?.id, t?.blobKey, hasVideo, showVideo, fullscreen])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !showVideo || !videoUrl) return
    const target = player.currentMs / 1000
    if (Math.abs(v.currentTime - target) > 0.35) {
      try {
        v.currentTime = target
      } catch {
        /* */
      }
    }
    if (player.playing) {
      v.muted = true
      void v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [player.playing, player.currentMs, showVideo, videoUrl])

  useEffect(() => {
    if (!hasVideo) setShowVideo(false)
  }, [hasVideo, t?.id])

  // ── Heatmap por pista: qué tramos se repiten más (barra de progreso, dentro y fuera de pantalla nativa) ──
  useEffect(() => {
    if (!t) return
    const all = loadHeatmapStore()
    const saved = all[t.id]
    const arr = saved && saved.length === HEATMAP_BINS ? [...saved] : new Array(HEATMAP_BINS).fill(0)
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

  // ── Volumen real del reproductor (si el hook lo soporta) ──
  useEffect(() => {
    player.setVolume?.(volumeUi / 100)
  }, [volumeUi, player])

  // ── Auto-ocultar la sombra del heatmap en la barra de progreso del diálogo (pestaña "Ahora") ──
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
    root?.addEventListener('click', bump)
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      root?.removeEventListener('mousemove', bump)
      root?.removeEventListener('pointerdown', bump)
      root?.removeEventListener('touchstart', bump)
      root?.removeEventListener('click', bump)
    }
  }, [fullscreen, fsTab])

  // ── Detecta si el área de medios está en pantalla completa nativa del navegador ──
  useEffect(() => {
    const onFsChange = () => {
      const anyDoc = document as Document & { webkitFullscreenElement?: Element | null }
      const fs = document.fullscreenElement || anyDoc.webkitFullscreenElement || null
      const videoFs = !!(
        videoRef.current &&
        (videoRef.current as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
          .webkitDisplayingFullscreen
      )
      setNativeFsActive(
        fs === mediaAreaRef.current || fs === videoRef.current || videoFs
      )
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener)
    }
  }, [videoUrl, showVideo])

  // ── Overlay "Netflix-style" sobre el vídeo/portada en pantalla completa nativa: progreso, brillo, volumen ──
  useEffect(() => {
    if (!nativeFsActive) return
    setNativeOverlayVisible(true)
    const bump = () => {
      setNativeOverlayVisible(true)
      if (nativeIdleTimerRef.current) window.clearTimeout(nativeIdleTimerRef.current)
      nativeIdleTimerRef.current = window.setTimeout(() => setNativeOverlayVisible(false), CONTROLS_IDLE_MS)
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

  // ── Picture-in-Picture: sincroniza el estado del botón con el navegador ──
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

  // ── Si se pidió PiP antes de que el <video> estuviera montado, se completa en cuanto carga ──
  useEffect(() => {
    if (!pipRequestedRef.current) return
    const v = videoRef.current
    if (!v || !videoUrl) return
    pipRequestedRef.current = false
    const tryPip = () => {
      v.requestPictureInPicture().catch(() => {
        /* el navegador puede bloquear el permiso o no soportar PiP */
      })
    }
    if (v.readyState >= 1) tryPip()
    else v.addEventListener('loadedmetadata', tryPip, { once: true })
  }, [showVideo, videoUrl])

  // ── Media Session API: metadata + controles del sistema/lock-screen para reproducción en 2º plano ──
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !t) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        artwork: t.coverDataUrl
          ? [
              { src: t.coverDataUrl, sizes: '256x256', type: 'image/png' },
              { src: t.coverDataUrl, sizes: '512x512', type: 'image/png' },
            ]
          : [],
      })
    } catch {
      /* */
    }

    navigator.mediaSession.setActionHandler('play', () => {
      if (!player.playing) void player.toggle()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (player.playing) void player.toggle()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => void player.prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => void player.next())
    navigator.mediaSession.setActionHandler('stop', () => {
      if (player.playing) void player.toggle()
    })
    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skip = (details.seekOffset ?? 10) * 1000
        player.seek(clamp(player.currentMs - skip, 0, dur || player.currentMs))
      })
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skip = (details.seekOffset ?? 10) * 1000
        player.seek(clamp(player.currentMs + skip, 0, dur || player.currentMs))
      })
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) player.seek(details.seekTime * 1000)
      })
    } catch {
      /* algunos navegadores no soportan seekto/seekbackward/seekforward */
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('stop', null)
        navigator.mediaSession.setActionHandler('seekbackward', null)
        navigator.mediaSession.setActionHandler('seekforward', null)
        navigator.mediaSession.setActionHandler('seekto', null)
      } catch {
        /* */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.title, t?.artist, t?.album, t?.coverDataUrl])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused'
  }, [player.playing])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession as MediaSession & {
      setPositionState?: (state: { duration: number; playbackRate: number; position: number }) => void
    }
    if (!ms.setPositionState || !dur) return
    try {
      ms.setPositionState({
        duration: dur / 1000,
        playbackRate: 1,
        position: Math.min(player.currentMs, dur) / 1000,
      })
    } catch {
      /* */
    }
  }, [player.currentMs, dur])

  // ── Intento de reanudar audio si el navegador lo suspendió al volver de segundo plano ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const anyPlayer = player as unknown as { resumeAudioContext?: () => void }
      anyPlayer.resumeAudioContext?.()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [player])

  const toggleNativeFullscreen = async () => {
    const video = videoRef.current
    const el = mediaAreaRef.current
    try {
      const anyDoc = document as Document & {
        webkitFullscreenElement?: Element | null
        webkitExitFullscreen?: () => Promise<void> | void
      }
      const fsEl =
        document.fullscreenElement ||
        anyDoc.webkitFullscreenElement ||
        null
      const videoFs = !!(
        video &&
        (video as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen
      )
      if (fsEl || videoFs) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (anyDoc.webkitExitFullscreen) await anyDoc.webkitExitFullscreen()
        else if (video) {
          ;(video as HTMLVideoElement & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.()
        }
        return
      }
      // iOS / Capacitor: fullscreen del <video>
      if (video && showVideo) {
        const v = video as HTMLVideoElement & {
          webkitEnterFullscreen?: () => void
          requestFullscreen?: () => Promise<void>
        }
        if (typeof v.webkitEnterFullscreen === 'function') {
          try { v.webkitEnterFullscreen(); return } catch { /* */ }
        }
        if (v.requestFullscreen) {
          await v.requestFullscreen()
          return
        }
      }
      if (el) {
        const anyEl = el as HTMLElement & {
          webkitRequestFullscreen?: () => void
          webkitRequestFullScreen?: () => void
        }
        if (el.requestFullscreen) await el.requestFullscreen()
        else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen()
        else if (anyEl.webkitRequestFullScreen) anyEl.webkitRequestFullScreen()
      }
    } catch {
      /* permiso denegado */
    }
  }

  /** Picture-in-Picture: si el vídeo aún no está montado (mostrando la portada), lo activa primero. */
  const togglePip = async () => {
    if (!hasVideo) return
    soundClick()
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      if (typeof document === 'undefined' || !('pictureInPictureEnabled' in document) || !document.pictureInPictureEnabled) {
        return
      }
      if (!showVideo) {
        pipRequestedRef.current = true
        setShowVideo(true)
        return
      }
      const v = videoRef.current
      if (!v) return
      await v.requestPictureInPicture()
    } catch {
      /* PiP no soportado, bloqueado por el navegador, o cancelado por el usuario */
    }
  }

  if (!t) return null

  const openFs = () => {
    soundClick()
    setFsTab('now')
    setFullscreen(true)
  }

  const closeFs = () => {
    soundClick()
    setShowVideo(false)
    setFullscreen(false)
  }

  const applyQueueOrder = (next: TrackItem[]) => {
    setQueue(next)
    player.setQueue(next)
  }

  const reorderQueue = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    const next = [...queue]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    applyQueueOrder(next)
  }

  const ctrlBtn = (
    onClick: () => void,
    children: React.ReactNode,
    extra?: React.CSSProperties,
    disabled?: boolean
  ) => (
    <button
      type="button"
      className="gco-pb-icon"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        onClick()
      }}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: 'none',
        background: 'transparent',
        color: 'var(--gco-ink, #F3F5FA)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.15s ease, transform 0.1s ease',
        ...extra,
      }}
    >
      {children}
    </button>
  )

  /* Mini barra pastilla — permanece montada mientras exista una pista, independiente de la pestaña interna */
  const expandFromEdge = () => {
    soundClick()
    setFloatPos((prev) => {
      const margin = 12
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = barSizeRef.current.w || Math.min(560, vw - 24)
      const h = barSizeRef.current.h || 56
      const next: FloatPos = {
        x: Math.max(margin, (vw - w) / 2),
        y: Math.max(margin, vh - h - 24 - 8),
        edge: null,
      }
      // Preferir expandir hacia el centro inferior (única barra deseada)
      if (prev.edge === 'left') next.x = margin
      if (prev.edge === 'right') next.x = Math.max(margin, vw - w - margin)
      if (prev.edge === 'top') next.y = margin + 8
      if (prev.edge === 'bottom') next.y = Math.max(margin, vh - h - margin - 8)
      saveFloatPos(next)
      return next
    })
  }

  const onFloatPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-no-drag]')) return
    dragMovedRef.current = false
    const root = floatRootRef.current
    if (root) {
      const rect = root.getBoundingClientRect()
      barSizeRef.current = { w: rect.width, h: rect.height }
      dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    // Guardar origen para umbral click vs drag
    ;(dragOffsetRef as { current: { x: number; y: number; ox?: number; oy?: number } }).current.ox = e.clientX
    ;(dragOffsetRef as { current: { x: number; y: number; ox?: number; oy?: number } }).current.oy = e.clientY
    setDragging(true)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch { /* */ }
  }

  const onFloatPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const ox = (dragOffsetRef.current as { ox?: number }).ox ?? e.clientX
    const oy = (dragOffsetRef.current as { oy?: number }).oy ?? e.clientY
    const dist = Math.hypot(e.clientX - ox, e.clientY - oy)
    if (!dragMovedRef.current && dist < DRAG_THRESHOLD_PX) {
      // Aún es un click potencial: no mover la barra
      return
    }
    dragMovedRef.current = true
    const w = barSizeRef.current.w
    let x = e.clientX - dragOffsetRef.current.x
    let y = e.clientY - dragOffsetRef.current.y
    x = clamp(x, -w + 56, window.innerWidth - 56)
    y = clamp(y, 0, window.innerHeight - 40)
    setFloatPos({ x, y, edge: null })
  }

  const onFloatPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    setDragging(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch { /* */ }

    // Click corto sin movimiento → abrir pantalla del reproductor
    if (!dragMovedRef.current) {
      onBarActivate()
      return
    }

    setFloatPos((prev) => {
      const root = floatRootRef.current
      const w = root?.offsetWidth ?? barSizeRef.current.w
      const h = root?.offsetHeight ?? barSizeRef.current.h
      const edge = nearestEdge(prev.x, prev.y, w, h)
      let x = prev.x
      let y = prev.y
      if (edge === 'left') x = -w + COLLAPSED_SIZE
      if (edge === 'right') x = window.innerWidth - COLLAPSED_SIZE
      if (edge === 'top') y = -h + COLLAPSED_SIZE
      if (edge === 'bottom') y = window.innerHeight - COLLAPSED_SIZE
      const next = { x, y, edge }
      saveFloatPos(next)
      return next
    })
  }

  const onBarActivate = () => {
    openFs()
  }

  /**
   * UNA sola barra visible:
   *  - floating (global): posición fija libre / centrada abajo por defecto
   *  - compact (MusicaHome): dock inferior centrado, SIN position fixed libre
   * Nunca usamos layout flotante en compact salvo acoplado explícito del usuario
   * en la instancia floating.
   */
  const useFloatingLayout = !!floating
  const collapsed = useFloatingLayout && floatPos.edge != null

  const floatWrapStyle: React.CSSProperties = useFloatingLayout
    ? {
        position: 'fixed',
        left: collapsed ? floatPos.x : floatPos.x,
        top: collapsed ? floatPos.y : floatPos.y,
        zIndex: 121,
        width: collapsed ? COLLAPSED_SIZE : 'min(560px, calc(100vw - 24px))',
        maxWidth: 'calc(100vw - 16px)',
        pointerEvents: 'auto',
        touchAction: 'none',
        transition: dragging && dragMovedRef.current ? 'none' : 'left 0.2s ease, top 0.2s ease, width 0.2s ease',
        cursor: dragging && dragMovedRef.current ? 'grabbing' : 'grab',
      }
    : {
        // compact / default: centrada abajo, una sola pastilla
        position: 'relative',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 12px',
        pointerEvents: 'none',
        zIndex: 45,
      }

  const miniBar = (
    <div
      ref={floatRootRef}
      className={`gco-player-bar-wrap${compact ? ' is-compact' : ''}${useFloatingLayout ? ' is-floating' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={floatWrapStyle}
      onPointerDown={onFloatPointerDown}
      onPointerMove={onFloatPointerMove}
      onPointerUp={onFloatPointerUp}
      onPointerCancel={onFloatPointerUp}
    >
      {collapsed ? (
        <button
          type="button"
          aria-label="Mostrar reproductor"
          title="Toca o arrastra para mostrar"
          onClick={(e) => {
            e.stopPropagation()
            expandFromEdge()
          }}
          style={{
            width: COLLAPSED_SIZE,
            height: COLLAPSED_SIZE,
            borderRadius: 999,
            border: '1px solid var(--gco-glass-border)',
            background: 'color-mix(in srgb, var(--gco-bg, #0B1220) 78%, transparent)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            color: 'var(--gco-primary)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
            pointerEvents: 'auto',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {floatPos.edge === 'left' && <path d="M9 6l6 6-6 6" />}
            {floatPos.edge === 'right' && <path d="M15 6l-6 6 6 6" />}
            {floatPos.edge === 'top' && <path d="M6 9l6 6 6-6" />}
            {floatPos.edge === 'bottom' && <path d="M6 15l6-6 6 6" />}
            {!floatPos.edge && <path d="M9 6l6 6-6 6" />}
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="gco-player-bar-inner"
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: useFloatingLayout ? 'none' : 560,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.42rem 0.5rem 0.42rem 0.42rem',
            borderRadius: 999,
            border: '1px solid var(--gco-glass-border)',
            background: 'color-mix(in srgb, var(--gco-bg, #0B1220) 58%, transparent)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
            cursor: dragging ? 'grabbing' : 'grab',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'left',
            margin: 0,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'var(--gco-glass-bg)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {t.coverDataUrl ? (
              <img src={t.coverDataUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '0.95rem' }}>♪</span>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--gco-ink)' }}>
              {t.title}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: 'var(--gco-ink-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.artist}
            </p>
          </div>
          <div
            data-no-drag
            style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, paddingRight: 4 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ctrlBtn(
              () => { soundClick(); void player.prev() },
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
            )}
            {ctrlBtn(
              () => { soundClick(); void player.toggle() },
              player.playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
              ),
              { width: 36, height: 36, background: ACCENT, color: ON_ACCENT, borderRadius: '50%' }
            )}
            {ctrlBtn(
              () => { soundClick(); void player.next() },
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" /></svg>
            )}
          </div>
        </button>
      )}
    </div>
  )

  const heatmapMax = Math.max(1, ...heatmap)

  const exitFsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 3v4a2 2 0 01-2 2H3M21 9h-4a2 2 0 01-2-2V3M3 15h4a2 2 0 012 2v4M15 21v-4a2 2 0 012-2h4" />
    </svg>
  )
  const enterFsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
    </svg>
  )
  const pipIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.4" />
      <rect x="12.5" y="12" width="6.5" height="4.6" rx="1.1" fill="currentColor" stroke="none" />
    </svg>
  )

  /* Barra de progreso reutilizable, con sombra de "más repetido" (heatmap) detrás del slider. */
  const progressBar = (fadeOpacity: number, disabled: boolean) => (
    <div style={{ position: 'relative' }}>
      <div
        aria-hidden
        className="gco-fs-fade"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 3,
          height: 8,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          pointerEvents: 'none',
          opacity: fadeOpacity * 0.4,
        }}
      >
        {heatmap.map((c, i) => {
          const h = 2 + (c / heatmapMax) * 6
          const intensity = Math.min(55, 15 + (c / heatmapMax) * 40)
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                borderRadius: 2,
                background:
                  c > 0
                    ? `color-mix(in srgb, ${progressColor} ${intensity}%, transparent)`
                    : 'transparent',
              }}
            />
          )
        })}
      </div>
      <input
        type="range"
        className="gco-fs-range"
        min={0}
        max={dur || 1}
        value={Math.min(player.currentMs, dur || 0)}
        onChange={(e) => !disabled && player.seek(Number(e.target.value))}
        disabled={disabled}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          accentColor: progressColor,
        }}
      />
    </div>
  )

  /* Fullscreen — montado vía portal en document.body para escapar de cualquier
     contexto de apilamiento heredado (p. ej. el dock del mini-player con su propio
     z-index) y así quedar SIEMPRE por encima del nav inferior de MusicaHome. */
  const fullscreenContent = fullscreen && (
    <div
      ref={fsRootRef}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        color: '#F3F5FA',
        background: '#06080f',
      }}
    >
      <style>{GLOBAL_CSS}</style>
      {t.coverDataUrl && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-24px',
            backgroundImage: `url(${t.coverDataUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px) brightness(0.34) saturate(1.2)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6,8,15,0.42) 0%, rgba(6,8,15,0.78) 48%, rgba(6,8,15,0.95) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top bar: pastilla flotante de vidrio, iOS-style, en vez de barra de ancho completo */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 8px',
            borderRadius: 24,
            ...LIQUID_PANEL,
          }}
        >
          <button type="button" className="gco-pb-icon" onClick={closeFs} style={glassIcon} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div style={{ textAlign: 'center', minWidth: 0, flex: 1, padding: '0 4px' }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.6rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.5,
                fontWeight: 700,
              }}
            >
              Reproduciendo
            </p>
            <p
              style={{
                margin: '1px 0 0',
                fontWeight: 700,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.album || t.title}
            </p>
          </div>
          <button
            type="button"
            className="gco-pb-icon"
            disabled={!hasVideo}
            title={hasVideo ? 'Ver en segundo plano (PiP)' : 'Sin vídeo'}
            onClick={togglePip}
            style={{
              ...glassIcon,
              color: pipActive ? ACCENT : '#F3F5FA',
            }}
          >
            {pipIcon}
          </button>
          <button
            type="button"
            className="gco-pb-icon"
            disabled={!hasVideo}
            title={hasVideo ? (showVideo ? 'Portada' : 'Vídeo') : 'Sin vídeo'}
            onClick={() => {
              if (!hasVideo) return
              soundClick()
              setShowVideo((v) => !v)
            }}
            style={{
              ...glassIcon,
              color: showVideo && hasVideo ? ACCENT : '#F3F5FA',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="6" width="13" height="12" rx="2" />
              <path d="M16 10l5-3v10l-5-3V10z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 16px 8px',
        }}
      >
        {fsTab === 'now' && (
          <>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
                padding: '6px 0',
              }}
            >
              <div
                ref={mediaAreaRef}
                style={{
                  position: 'relative',
                  width: nativeFsActive ? '100%' : 'min(80vw, 350px)',
                  height: nativeFsActive ? '100%' : undefined,
                  aspectRatio: nativeFsActive ? undefined : showVideo && videoUrl ? '16 / 10' : '1',
                  borderRadius: nativeFsActive ? 0 : 30,
                  overflow: 'hidden',
                  boxShadow: nativeFsActive ? 'none' : '0 28px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                  background: nativeFsActive ? '#000' : 'rgba(255,255,255,0.06)',
                  border: nativeFsActive ? 'none' : '1px solid rgba(255,255,255,0.12)',
                  display: 'grid',
                  placeItems: 'center',
                  filter: `brightness(${brightness}%)`,
                  transition: 'filter 0.15s ease, border-radius 0.25s ease',
                }}
              >
                {showVideo && videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: nativeFsActive ? 'contain' : 'cover',
                    }}
                  />
                ) : t.coverDataUrl ? (
                  <img
                    src={t.coverDataUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '3.5rem' }}>🎵</span>
                )}

                {/* Overlay "Netflix-style" — solo existe mientras el área de medios está en
                    pantalla completa nativa del navegador: progreso, brillo, volumen y transporte
                    quedan sobre el propio vídeo, con auto-ocultado tras inactividad. */}
                {nativeFsActive && (
                  <div
                    className="gco-native-overlay"
                    style={{
                      opacity: nativeOverlayVisible ? 1 : 0,
                      pointerEvents: nativeOverlayVisible ? 'auto' : 'none',
                      background: nativeOverlayVisible
                        ? 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 66%, rgba(0,0,0,0.72) 100%)'
                        : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 0',
                      }}
                    >
                      <button
                        type="button"
                        className="gco-pb-icon"
                        style={glassIcon}
                        aria-label="Salir de pantalla completa"
                        onClick={() => void toggleNativeFullscreen()}
                      >
                        {exitFsIcon}
                      </button>
                      <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {t.title}
                        </p>
                        <p style={{ margin: '1px 0 0', fontSize: '0.72rem', opacity: 0.65 }}>{t.artist}</p>
                      </div>
                      <button
                        type="button"
                        className="gco-pb-icon"
                        disabled={!hasVideo}
                        style={{ ...glassIcon, color: pipActive ? ACCENT : '#F3F5FA' }}
                        aria-label="Ver en segundo plano (PiP)"
                        onClick={togglePip}
                      >
                        {pipIcon}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 26,
                        opacity: locked ? 0.35 : 1,
                        pointerEvents: locked ? 'none' : 'auto',
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <button
                        type="button"
                        className="gco-pb-icon"
                        style={glassIcon}
                        onClick={() => {
                          soundClick()
                          void player.prev()
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="gco-pb-icon"
                        style={{
                          ...glassIcon,
                          width: 62,
                          height: 62,
                          borderRadius: 22,
                          background: ACCENT,
                          color: ON_ACCENT,
                          boxShadow: `0 8px 26px color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                        }}
                        onClick={() => {
                          soundClick()
                          void player.toggle()
                        }}
                      >
                        {player.playing ? (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                          </svg>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7L8 5z" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="gco-pb-icon"
                        style={glassIcon}
                        onClick={() => {
                          soundClick()
                          void player.next()
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
                        </svg>
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        padding: '0 16px calc(16px + env(safe-area-inset-bottom, 0px))',
                      }}
                    >
                      {progressBar(nativeOverlayVisible ? 1 : 0, locked)}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          opacity: 0.6,
                        }}
                      >
                        <span>{formatTrackTime(player.currentMs)}</span>
                        <span>{formatTrackTime(dur)}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          opacity: locked ? 0.35 : 1,
                          pointerEvents: locked ? 'none' : 'auto',
                        }}
                      >
                        <div className="gco-fs-pill">
                          <button type="button" aria-label="Bajar brillo" onClick={() => setBrightness((b) => clamp(b - 10, 40, 160))}>
                            −
                          </button>
                          <span>☀ {brightness}%</span>
                          <button type="button" aria-label="Subir brillo" onClick={() => setBrightness((b) => clamp(b + 10, 40, 160))}>
                            +
                          </button>
                        </div>
                        <div className="gco-fs-pill">
                          <button type="button" aria-label="Bajar volumen" onClick={() => setVolumeUi((v) => clamp(v - 10, 0, 100))}>
                            −
                          </button>
                          <span>🔊 {volumeUi}%</span>
                          <button type="button" aria-label="Subir volumen" onClick={() => setVolumeUi((v) => clamp(v + 10, 0, 100))}>
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="gco-pb-icon"
                          style={{ ...glassIcon, color: locked ? ACCENT : '#F3F5FA' }}
                          aria-label={locked ? 'Desbloquear controles' : 'Bloquear controles'}
                          title={locked ? 'Desbloquear controles' : 'Bloquear controles'}
                          onClick={() => {
                            soundClick()
                            setLocked((v) => !v)
                          }}
                        >
                          {locked ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V8a4 4 0 018 0v3" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V8a4 4 0 017.5-2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!nativeFsActive && hasVideo && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <div className="gco-seg">
                  {(['Portada', 'Vídeo'] as const).map((label, i) => {
                    const on = (i === 1) === showVideo
                    return (
                      <button
                        key={label}
                        type="button"
                        className={on ? 'is-on' : ''}
                        onClick={() => {
                          soundClick()
                          setShowVideo(i === 1)
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
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
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    zIndex: 100,
                  }}
                >
                  {t.title}
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.95rem', opacity: 0.62 }}>{t.artist}</p>

                <div style={{ margin: '14px 0 4px' }}>{progressBar(overlayVisible ? 1 : 0, false)}</div>
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
                      ...glassIcon,
                      opacity: player.shuffle ? 1 : 0.4,
                      color: player.shuffle ? ACCENT : undefined,
                    }}
                    onClick={() => {
                      soundClick()
                      player.setShuffle(!player.shuffle)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIcon}
                    onClick={() => {
                      soundClick()
                      void player.prev()
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIcon,
                      width: 68,
                      height: 68,
                      borderRadius: 24,
                      background: ACCENT,
                      color: ON_ACCENT,
                      boxShadow: `0 8px 28px color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                    }}
                    onClick={() => {
                      soundClick()
                      void player.toggle()
                    }}
                  >
                    {player.playing ? (
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    ) : (
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIcon}
                    onClick={() => {
                      soundClick()
                      void player.next()
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={{
                      ...glassIcon,
                      opacity: player.repeat === 'off' ? 0.4 : 1,
                      color: player.repeat !== 'off' ? ACCENT : undefined,
                    }}
                    onClick={() => {
                      soundClick()
                      const order = ['off', 'all', 'one'] as const
                      const i = order.indexOf(player.repeat)
                      player.setRepeat(order[(i + 1) % 3])
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 1l4 4-4 4" />
                      <path d="M3 11V9a4 4 0 014-4h14" />
                      <path d="M7 23l-4-4 4-4" />
                      <path d="M21 13v2a4 4 0 01-4 4H3" />
                    </svg>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    style={glassIcon}
                    aria-label="Pantalla completa"
                    title="Pantalla completa (brillo, volumen y progreso sobre el vídeo)"
                    onClick={() => void toggleNativeFullscreen()}
                  >
                    {enterFsIcon}
                  </button>
                  <button
                    type="button"
                    className="gco-pb-icon"
                    disabled={!hasVideo}
                    style={{ ...glassIcon, color: pipActive ? ACCENT : '#F3F5FA' }}
                    aria-label="Ver en segundo plano (PiP)"
                    title={hasVideo ? 'Ver en segundo plano (PiP)' : 'Sin vídeo'}
                    onClick={togglePip}
                  >
                    {pipIcon}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {fsTab === 'queue' && (
          <div className="gco-pb-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0 8px', fontWeight: 800 }}>
              Cola · {queue.length}
            </h2>
            <p style={{ fontSize: '0.78rem', opacity: 0.55, margin: '0 0 10px' }}>
              Arrastra para reordenar. Esta cola es temporal: al abrir otra playlist se reemplaza.
            </p>
            {queue.length === 0 ? (
              <p style={{ opacity: 0.55 }}>Cola vacía.</p>
            ) : (
              queue.map((item, i) => {
                const active = item.id === t.id
                return (
                  <div
                    key={`${item.id}-${i}`}
                    draggable
                    onDragStart={() => {
                      dragQ.current = i
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragQ.current != null) reorderQueue(dragQ.current, i)
                      dragQ.current = null
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '0.55rem 0.5rem',
                      borderRadius: 16,
                      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                      marginBottom: 3,
                      cursor: 'grab',
                    }}
                  >
                    <span style={{ opacity: 0.4, fontSize: '0.85rem' }}>⠿</span>
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
                          background: 'rgba(255,255,255,0.08)',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {item.coverDataUrl ? (
                          <img
                            src={item.coverDataUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          '♪'
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: active ? 700 : 600,
                            color: active ? ACCENT : undefined,
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
                      <span style={{ fontSize: '0.72rem', opacity: 0.45 }}>
                        {formatTrackTime(item.durationMs)}
                      </span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {fsTab === 'lyrics' && (
          <div
            className="gco-pb-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              borderRadius: 22,
              padding: '14px 16px',
              ...LIQUID_PANEL,
            }}
          >
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
              {t.lyrics?.trim()
                ? t.lyrics
                : 'Sin letra guardada.\nEdita la pista en la biblioteca.'}
            </pre>
          </div>
        )}
      </div>

      {/* Nav inferior (Cola / Ahora / Letra) — al vivir dentro del portal montado en
          document.body, este bloque queda siempre por encima del nav de MusicaHome. */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          padding: '8px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            padding: 5,
            borderRadius: 26,
            ...LIQUID_PANEL,
          }}
        >
          {(
            [
              { id: 'queue' as const, label: 'Cola', icon: '☰' },
              { id: 'now' as const, label: 'Ahora', icon: '◎' },
              { id: 'lyrics' as const, label: 'Letra', icon: '¶' },
            ] as const
          ).map((tabItem) => {
            const on = fsTab === tabItem.id
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setFsTab(tabItem.id)
                  if (tabItem.id === 'queue') syncQueue()
                }}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: '0.72rem',
                  fontWeight: on ? 700 : 500,
                  padding: '0.6rem 0.3rem',
                  borderRadius: 20,
                  background: on ? 'rgba(255,255,255,0.2)' : 'transparent',
                  boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.16)' : 'none',
                  color: on ? '#fff' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  transition: 'background-color 0.18s ease, color 0.18s ease',
                }}
              >
                <span style={{ fontSize: '0.95rem' }}>{tabItem.icon}</span>
                {tabItem.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  // Evitar DOBLE barra: si el host global ya está montado, la instancia
  // compact de MusicaHome no pinta miniBar (la global es la única visible).
  const hideBecauseGlobal =
    !floating && globalBarMounted && typeof document !== 'undefined' &&
    !!document.getElementById('gco-global-player-host')

  return (
    <>
      {hideBecauseGlobal ? null : miniBar}
      {fullscreen && typeof document !== 'undefined' ? createPortal(fullscreenContent, document.body) : null}
    </>
  )
}

/** Única pastilla global — centrada abajo por defecto. */
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
    .then((mod: { registerFloatingBarMounter?: (fn: () => void) => void; api?: { track: unknown } }) => {
      mod.registerFloatingBarMounter?.(ensureGlobalPlayerBar)
      if (mod.api?.track) requestAnimationFrame(() => ensureGlobalPlayerBar())
    })
    .catch(() => {})
}