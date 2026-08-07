import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatTrackTime, getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'
import type { MediaPlayerApi } from '@/hooks/useMediaPlayer'
import { soundClick } from '@/core/audio/uiSounds'

const PREF_KEY = 'gco:player-bar-prefs'
const HEATMAP_KEY = 'gco:player-heatmap'
const HEATMAP_BINS = 40
/** Milisegundos de inactividad antes de ocultar sombra + brillo/volumen/candado en pantalla completa. */
const CONTROLS_IDLE_MS = 3200

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

const glassIcon: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
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

const SCROLLBAR_CSS = `
.gco-pb-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.gco-pb-scroll::-webkit-scrollbar { width: 5px; }
.gco-pb-scroll::-webkit-scrollbar-track { background: transparent; }
.gco-pb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 999px; }
.gco-pb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.36); }
.gco-pb-icon:hover { background: rgba(255,255,255,0.16) !important; }
.gco-pb-icon:active { transform: scale(0.94); }

.gco-fs-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  font-size: 0.74rem;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  box-shadow: 0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12);
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
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.gco-fs-pill button:hover { background: rgba(255,255,255,0.24); }
.gco-fs-pill button:active { transform: scale(0.92); }

.gco-fs-fade {
  transition: opacity 0.45s ease;
}
`

export function PlayerBar({ player, compact }: Props) {
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

  // ── Controles futuristas de pantalla completa (solo pestaña "Ahora") ──
  const [locked, setLocked] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [volumeUi, setVolumeUi] = useState(100)
  const [heatmap, setHeatmap] = useState<number[]>(() => new Array(HEATMAP_BINS).fill(0))
  const [overlayVisible, setOverlayVisible] = useState(true)
  const heatmapRef = useRef<number[]>(heatmap)
  const lastBinRef = useRef<number | null>(null)
  const mediaAreaRef = useRef<HTMLDivElement | null>(null)
  const idleTimerRef = useRef<number | null>(null)

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
      if (e.key === 'Escape') setFullscreen(false)
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

  // ── Heatmap por pista: qué tramos se repiten más (solo se usa en pantalla completa) ──
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

  // ── Auto-ocultar la sombra + brillo/volumen/candado tras inactividad (solo pestaña "Ahora") ──
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
    const el = mediaAreaRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      /* el navegador puede bloquear el permiso; se ignora silenciosamente */
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
    extra?: React.CSSProperties
  ) => (
    <button
      type="button"
      className="gco-pb-icon"
      onClick={(e) => {
        e.stopPropagation()
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
        cursor: 'pointer',
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
  const miniBar = (
    <div
      className={`gco-player-bar-wrap${compact ? ' is-compact' : ''}`}
      style={
        compact
          ? {
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              padding: '0 12px',
              pointerEvents: 'none',
            }
          : {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 'calc(4.15rem + env(safe-area-inset-bottom, 0px))',
              zIndex: 45,
              display: 'flex',
              justifyContent: 'center',
              padding: '0 12px',
              pointerEvents: 'none',
            }
      }
    >
      <button
        type="button"
        onClick={openFs}
        className="gco-player-bar-inner"
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.42rem 0.5rem 0.42rem 0.42rem',
          borderRadius: 999,
          border: '1px solid var(--gco-glass-border)',
          background:
            'color-mix(in srgb, var(--gco-bg, #0B1220) 58%, transparent)',
          backdropFilter: 'blur(18px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          margin: 0,
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
            <img
              src={t.coverDataUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '0.95rem' }}>♪</span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: '0.84rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--gco-ink)',
            }}
          >
            {t.title}
          </p>
          <p
            style={{
              margin: '1px 0 0',
              fontSize: '0.72rem',
              color: 'var(--gco-ink-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {t.artist}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
            paddingRight: 4,
          }}
        >
          {ctrlBtn(
            () => {
              soundClick()
              void player.prev()
            },
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          )}
          {ctrlBtn(
            () => {
              soundClick()
              void player.toggle()
            },
            player.playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            ),
            {
              width: 36,
              height: 36,
              background: ACCENT,
              color: ON_ACCENT,
              borderRadius: '50%',
            }
          )}
          {ctrlBtn(
            () => {
              soundClick()
              void player.next()
            },
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
            </svg>
          )}
        </div>
      </button>
    </div>
  )

  const heatmapMax = Math.max(1, ...heatmap)

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
      <style>{SCROLLBAR_CSS}</style>
      {t.coverDataUrl && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-24px',
            backgroundImage: `url(${t.coverDataUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(52px) brightness(0.36) saturate(1.12)',
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
            'linear-gradient(180deg, rgba(6,8,15,0.4) 0%, rgba(6,8,15,0.75) 48%, rgba(6,8,15,0.94) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top bar delgado, encima de la portada */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 52,
          padding:
            'calc(6px + env(safe-area-inset-top, 0px)) 12px 6px',
          background: 'rgba(8,10,18,0.35)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <button type="button" className="gco-pb-icon" onClick={closeFs} style={glassIcon} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div style={{ textAlign: 'center', minWidth: 0, flex: 1, padding: '0 6px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.62rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              opacity: 0.55,
            }}
          >
            Reproduciendo
          </p>
          <p
            style={{
              margin: '1px 0 0',
              fontWeight: 600,
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
          title={hasVideo ? (showVideo ? 'Portada' : 'Vídeo') : 'Sin vídeo'}
          onClick={() => {
            if (!hasVideo) return
            soundClick()
            setShowVideo((v) => !v)
          }}
          style={{
            ...glassIcon,
            opacity: hasVideo ? 1 : 0.35,
            color: showVideo && hasVideo ? ACCENT : '#F3F5FA',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3V10z" />
          </svg>
        </button>
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 16px 8px',
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
                  width: 'min(78vw, 340px)',
                  aspectRatio: showVideo && videoUrl ? '16 / 10' : '1',
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'grid',
                  placeItems: 'center',
                  filter: `brightness(${brightness}%)`,
                  transition: 'filter 0.15s ease',
                }}
              >
                {showVideo && videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
              </div>
            </div>

            {hasVideo && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    padding: 3,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {(['Portada', 'Vídeo'] as const).map((label, i) => {
                    const on = (i === 1) === showVideo
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          soundClick()
                          setShowVideo(i === 1)
                        }}
                        style={{
                          border: 'none',
                          cursor: 'pointer',
                          font: 'inherit',
                          fontSize: '0.75rem',
                          fontWeight: on ? 700 : 500,
                          padding: '0.35rem 0.9rem',
                          borderRadius: 999,
                          background: on ? 'rgba(255,255,255,0.18)' : 'transparent',
                          color: on ? '#fff' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(1.2rem, 5vw, 1.55rem)',
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {t.title}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.95rem', opacity: 0.65 }}>{t.artist}</p>

            {/* Barra de progreso siempre visible. La sombra de "más repetido" solo se dibuja
                en esta pestaña ("Ahora") y se desvanece sola tras inactividad. */}
            <div style={{ position: 'relative', margin: '12px 0 4px' }}>
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
                  opacity: overlayVisible ? 0.4 : 0,
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
                min={0}
                max={dur || 1}
                value={Math.min(player.currentMs, dur || 0)}
                onChange={(e) => !locked && player.seek(Number(e.target.value))}
                disabled={locked}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  accentColor: progressColor,
                  cursor: locked ? 'not-allowed' : 'pointer',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.7rem',
                opacity: 0.55,
                marginBottom: 14,
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
                marginBottom: 16,
                opacity: locked ? 0.35 : 1,
                pointerEvents: locked ? 'none' : 'auto',
                transition: 'opacity 0.2s ease',
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
                  borderRadius: 22,
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

            {/* Fila iOS-futurista: brillo, volumen, pantalla completa, candado.
                Solo existe en esta pestaña y se desvanece con la misma inactividad que la sombra. */}
            <div
              className="gco-fs-fade"
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
                opacity: overlayVisible ? 1 : 0,
                pointerEvents: overlayVisible ? 'auto' : 'none',
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
                style={glassIcon}
                aria-label="Pantalla completa"
                title="Pantalla completa"
                onClick={() => void toggleNativeFullscreen()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
                </svg>
              </button>
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
            {locked && (
              <p style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.5, marginTop: 8 }}>
                Controles bloqueados — toca 🔒 para desbloquear
              </p>
            )}
          </>
        )}

        {fsTab === 'queue' && (
          <div className="gco-pb-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0 8px' }}>
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
                      padding: '0.55rem 0.35rem',
                      borderRadius: 12,
                      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                      marginBottom: 2,
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
                          borderRadius: 8,
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
              borderRadius: 16,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px' }}>Letra</h2>
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
          padding: '8px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            padding: 4,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
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
                  padding: '0.55rem 0.3rem',
                  borderRadius: 999,
                  background: on ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: on ? '#fff' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
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

  return (
    <>
      {miniBar}
      {fullscreen && typeof document !== 'undefined' ? createPortal(fullscreenContent, document.body) : null}
    </>
  )
}