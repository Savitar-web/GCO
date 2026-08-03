import { useEffect, useRef, useState } from 'react'
import { formatTrackTime, getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'
import type { MediaPlayerApi } from '@/hooks/useMediaPlayer'
import { soundClick } from '@/core/audio/uiSounds'

const PREF_KEY = 'gco:player-bar-prefs'

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

  /* Mini barra pastilla */
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

  /* Fullscreen — zIndex por encima del nav (50) */
  const fullscreenUi = fullscreen && (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
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

            <input
              type="range"
              min={0}
              max={dur || 1}
              value={Math.min(player.currentMs, dur || 0)}
              onChange={(e) => player.seek(Number(e.target.value))}
              style={{ width: '100%', accentColor: progressColor, cursor: 'pointer', margin: '12px 0 4px' }}
            />
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
                marginBottom: 4,
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
      {fullscreenUi}
    </>
  )
}