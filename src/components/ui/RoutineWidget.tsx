import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getRoutinePrefs,
  saveRoutinePrefs,
  getRoutines,
  advanceRoutineSession,
  stopRoutineSession,
  togglePauseSession,
  formatMs,
  ringBell,
  type RoutinePrefs,
} from '@/core/storage/routines'
import { soundClick } from '@/core/audio/uiSounds'

/* ---------------------------------------------------------------------- */
/* Apariencia y sonido — compartidos con RutinasSettings                  */
/* ---------------------------------------------------------------------- */

const APPEARANCE_KEY = 'gco:routine-appearance'
const GALLERY_KEY = 'gco:routine-gallery-images'
const SOUND_KEY = 'gco:routine-sound-settings'
const TRACKS_KEY = 'gco:routine-sound-tracks'
const APPEARANCE_EVENT = 'gco:routine-appearance-changed'
const SOUND_EVENT = 'gco:routine-sound-changed'

type BellAppearance = { source: 'default' | 'gallery'; imageId?: string }
type GalleryImage = { id: string; name: string; dataUrl: string }
type SoundSettings = { toneId: string; volume: number }
type CustomTrack = { id: string; name: string; dataUrl: string }

type ToneLayer = {
  freq: number
  gain: number
  type: OscillatorType
  delay?: number
}
type TonePreset = {
  id: string
  label: string
  layers: ToneLayer[]
  duration: number
  repeat?: number
  gapBetweenRepeats?: number
}

const TONE_PRESETS: TonePreset[] = [
  {
    id: 'default',
    label: 'Campana clásica',
    layers: [
      { freq: 987.77, gain: 1.0, type: 'triangle' },
      { freq: 1975.53, gain: 0.72, type: 'sine' },
      { freq: 659.25, gain: 0.55, type: 'sine' },
      { freq: 1318.5, gain: 0.35, type: 'triangle', delay: 0.04 },
    ],
    duration: 0.95,
  },
  {
    id: 'soft',
    label: 'Suave',
    layers: [
      { freq: 523.25, gain: 0.95, type: 'sine' },
      { freq: 784.0, gain: 0.55, type: 'sine', delay: 0.05 },
    ],
    duration: 0.55,
  },
  {
    id: 'chime',
    label: 'Timbre',
    layers: [
      { freq: 659.25, gain: 1.0, type: 'triangle' },
      { freq: 987.77, gain: 0.85, type: 'triangle', delay: 0.1 },
      { freq: 1318.5, gain: 0.55, type: 'sine', delay: 0.2 },
    ],
    duration: 0.35,
  },
  {
    id: 'alert',
    label: 'Alerta',
    layers: [{ freq: 880, gain: 1.0, type: 'square' }],
    duration: 0.18,
    repeat: 4,
    gapBetweenRepeats: 0.08,
  },
  {
    id: 'digital',
    label: 'Digital',
    layers: [
      { freq: 1046.5, gain: 1.0, type: 'square' },
      { freq: 1318.5, gain: 1.0, type: 'square', delay: 0.08 },
      { freq: 1568, gain: 1.0, type: 'square', delay: 0.16 },
    ],
    duration: 0.12,
  },
  {
    id: 'warm',
    label: 'Cálida',
    layers: [
      { freq: 392, gain: 1.0, type: 'sine' },
      { freq: 523.25, gain: 0.85, type: 'sine', delay: 0.08 },
      { freq: 659.25, gain: 0.55, type: 'sine', delay: 0.16 },
    ],
    duration: 0.5,
  },
]

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function schedulePreset(ctx: AudioContext, preset: TonePreset, volume: number) {
  const repeat = preset.repeat ?? 1
  const gapRepeat = preset.gapBetweenRepeats ?? 0
  let base = ctx.currentTime
  const vol = Math.min(1, Math.max(0.15, volume))
  for (let r = 0; r < repeat; r++) {
    preset.layers.forEach((layer) => {
      const start = base + (layer.delay ?? 0)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = layer.type
      osc.frequency.value = layer.freq
      const peak = Math.max(0.001, Math.min(1, layer.gain * vol))
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + preset.duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + preset.duration + 0.04)
    })
    base += preset.duration + gapRepeat
  }
  return base
}

function playSelectedTone(
  toneId: string,
  customTracks: CustomTrack[],
  volume: number,
  fallback: () => void
) {
  const vol = Math.min(1, Math.max(0.35, volume))
  if (toneId.startsWith('custom:')) {
    const id = toneId.slice('custom:'.length)
    const track = customTracks.find((t) => t.id === id)
    if (!track) {
      fallback()
      return
    }
    const audio = new Audio(track.dataUrl)
    audio.volume = vol
    audio.play().catch(() => fallback())
    return
  }
  const preset = TONE_PRESETS.find((p) => p.id === toneId) ?? TONE_PRESETS[0]
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    const end = schedulePreset(ctx, preset, vol)
    window.setTimeout(() => void ctx.close(), (end + 0.5) * 1000)
  } catch {
    fallback()
  }
}

const GAME_ICONS: Record<string, string> = {
  '/categoria/memoria/secuencia-colores': '🌈',
  '/categoria/memoria/cartas': '🃏',
  '/categoria/memoria/numeros-asociados': '🔢',
  '/categoria/memoria/habilidades': '⚡',
  '/categoria/logica/numberpuzzle': '🧩',
  '/categoria/logica/rompecabezas': '🧩',
  '/categoria/logica/despejes': '🧹',
  '/nutricion': '📖',
  '/musica': '🎵',
}

const RING_SIZE = 52
const RING_RADIUS = 23
const RING_CIRC = 2 * Math.PI * RING_RADIUS

type ActLike = {
  type: string
  path?: string
  label: string
  durationMin: number
}

function isRest(a: ActLike) {
  return a.type === 'rest' || a.path === '/musica'
}

function isReading(a: ActLike) {
  return (
    a.path === '/nutricion' ||
    a.path?.startsWith('/nutricion/') === true ||
    (a as { kind?: string }).kind === 'reading'
  )
}

function activityIcon(a: ActLike) {
  if (isRest(a)) return '☕'
  if (isReading(a)) return '📖'
  if (a.path && GAME_ICONS[a.path]) return GAME_ICONS[a.path]
  return '🎮'
}

function resolveActivityPath(a: ActLike): string | null {
  if (a.path) return a.path
  if (a.type === 'rest') return '/musica'
  return null
}

export function RoutineWidget() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<RoutinePrefs>(getRoutinePrefs)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const dragRef = useRef<{
    dx: number
    dy: number
    dragging: boolean
    moved: boolean
  }>({ dx: 0, dy: 0, dragging: false, moved: false })
  const bellFired = useRef(false)

  const [appearance, setAppearance] = useState<BellAppearance>(() =>
    readJSON(APPEARANCE_KEY, { source: 'default' } as BellAppearance)
  )
  const [gallery, setGallery] = useState<GalleryImage[]>(() =>
    readJSON(GALLERY_KEY, [] as GalleryImage[])
  )
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    readJSON(SOUND_KEY, { toneId: 'default', volume: 1 } as SoundSettings)
  )
  const [customTracks, setCustomTracks] = useState<CustomTrack[]>(() =>
    readJSON(TRACKS_KEY, [] as CustomTrack[])
  )

  const refresh = () => setPrefs(getRoutinePrefs())

  useEffect(() => {
    const onChange = () => refresh()
    const onAppearance = () => {
      setAppearance(readJSON(APPEARANCE_KEY, { source: 'default' } as BellAppearance))
      setGallery(readJSON(GALLERY_KEY, [] as GalleryImage[]))
    }
    const onSound = () => {
      setSoundSettings(
        readJSON(SOUND_KEY, { toneId: 'default', volume: 1 } as SoundSettings)
      )
      setCustomTracks(readJSON(TRACKS_KEY, [] as CustomTrack[]))
    }
    window.addEventListener('gco:routines-changed', onChange)
    window.addEventListener(APPEARANCE_EVENT, onAppearance)
    window.addEventListener(SOUND_EVENT, onSound)
    window.addEventListener('storage', onAppearance)
    window.addEventListener('storage', onSound)
    return () => {
      window.removeEventListener('gco:routines-changed', onChange)
      window.removeEventListener(APPEARANCE_EVENT, onAppearance)
      window.removeEventListener(SOUND_EVENT, onSound)
      window.removeEventListener('storage', onAppearance)
      window.removeEventListener('storage', onSound)
    }
  }, [])

  useEffect(() => {
    if (!prefs.systemEnabled) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [prefs.systemEnabled])

  const playBell = () =>
    playSelectedTone(
      soundSettings.toneId,
      customTracks,
      soundSettings.volume ?? 1,
      ringBell
    )

  useEffect(() => {
    const s = prefs.session
    if (!s || s.paused) {
      bellFired.current = false
      return
    }
    if (now >= s.endsAt) {
      if (!bellFired.current) {
        bellFired.current = true
        playBell()
      }
    } else {
      bellFired.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, prefs.session, soundSettings.toneId, soundSettings.volume, customTracks])

  if (!prefs.systemEnabled) return null

  const session = prefs.session
  const routine = session
    ? getRoutines().find((r) => r.id === session.routineId)
    : null
  const activity =
    session && routine
      ? (routine.activities[session.activityIndex] as ActLike | undefined)
      : undefined

  const remaining =
    session && !session.paused
      ? Math.max(0, session.endsAt - now)
      : session?.remainingMsWhenPaused ?? 0

  const activityDurationMs = activity ? activity.durationMin * 60000 : 0
  const progressFraction =
    session && activity && activityDurationMs > 0
      ? Math.min(1, Math.max(0, 1 - remaining / activityDurationMs))
      : 0

  const selectedImage =
    appearance.source === 'gallery'
      ? gallery.find((g) => g.id === appearance.imageId)
      : undefined

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    dragRef.current = {
      dragging: true,
      moved: false,
      dx: e.clientX - prefs.widgetX,
      dy: e.clientY - prefs.widgetY,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return
    const x = Math.max(
      8,
      Math.min(window.innerWidth - 56, e.clientX - dragRef.current.dx)
    )
    const y = Math.max(
      8,
      Math.min(window.innerHeight - 56, e.clientY - dragRef.current.dy)
    )
    if (Math.abs(x - prefs.widgetX) > 2 || Math.abs(y - prefs.widgetY) > 2) {
      dragRef.current.moved = true
    }
    setPrefs((p) => ({ ...p, widgetX: x, widgetY: y }))
  }

  const onPointerUp = () => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    const p = getRoutinePrefs()
    saveRoutinePrefs({ widgetX: prefs.widgetX, widgetY: prefs.widgetY })
    setPrefs({ ...p, widgetX: prefs.widgetX, widgetY: prefs.widgetY })
  }

  const handleMainClick = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false
      return
    }
    soundClick()
    setOpen((v) => !v)
  }

  const goToPreviousStep = () => {
    if (!session || !routine) return
    if (session.activityIndex <= 0) return
    soundClick()
    const prevIndex = session.activityIndex - 1
    const prevActivity = routine.activities[prevIndex]
    const durationMs = (prevActivity?.durationMin ?? 1) * 60000
    const nextSession = {
      ...session,
      activityIndex: prevIndex,
      endsAt: Date.now() + durationMs,
      paused: false,
      remainingMsWhenPaused: undefined,
    }
    setPrefs(saveRoutinePrefs({ session: nextSession } as Partial<RoutinePrefs>))
  }

  const goToActivity = () => {
    if (!activity) return
    const path = resolveActivityPath(activity)
    if (!path) return
    soundClick()
    navigate(path)
    setOpen(false)
  }

  const stepLabel =
    session && routine
      ? `Paso ${session.activityIndex + 1} de ${routine.activities.length}`
      : ''

  const destPath = activity ? resolveActivityPath(activity) : null
  const canGo = Boolean(destPath)

  const goLabel = (() => {
    if (!activity || !destPath) return 'Ir al juego'
    if (isRest(activity) || destPath === '/musica') return 'Ir a música'
    if (isReading(activity) || destPath.startsWith('/nutricion'))
      return 'Ir a lectura'
    return 'Ir al juego'
  })()

  return (
    <div
      style={{
        position: 'fixed',
        left: prefs.widgetX,
        top: prefs.widgetY,
        zIndex: 9999,
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ position: 'relative', width: 48, height: 48 }}>
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            pointerEvents: 'none',
            transform: 'rotate(-90deg)',
          }}
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={2.5}
          />
          {session && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--gco-primary)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={RING_CIRC * (1 - progressFraction)}
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          )}
        </svg>

        <button
          type="button"
          aria-label="Rutina"
          onClick={handleMainClick}
          style={{
            position: 'relative',
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.28)',
            background: session
              ? 'rgba(34, 230, 197, 0.16)'
              : 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            boxShadow:
              '0 8px 24px rgba(0,0,0,0.28), inset 0 1px 1px rgba(255,255,255,0.35)',
            cursor: 'grab',
            fontSize: '1.25rem',
            display: 'grid',
            placeItems: 'center',
            color: 'inherit',
          }}
        >
          {selectedImage ? (
            <img
              src={selectedImage.dataUrl}
              alt=""
              style={{
                width: 26,
                height: 26,
                objectFit: 'contain',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <span style={{ pointerEvents: 'none' }}>🔔</span>
          )}
          {session && (
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                fontSize: '0.55rem',
                fontFamily: 'var(--font-mono, monospace)',
                background: 'var(--gco-primary)',
                color: '#0B1220',
                borderRadius: 6,
                padding: '1px 4px',
                fontWeight: 700,
              }}
            >
              {formatMs(remaining)}
            </span>
          )}
        </button>
      </div>

      <div
        data-no-drag
        style={{
          position: 'absolute',
          top: 56,
          left: 0,
          width: 280,
          maxWidth: 'min(280px, 82vw)',
          padding: '1rem 1.1rem',
          borderRadius: 18,
          border: '1px solid var(--gco-glass-border)',
          background: 'var(--gco-glass-bg, rgba(16,20,32,0.97))',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
          fontSize: '0.85rem',
          opacity: open ? 1 : 0,
          transform: open
            ? 'translateY(0) scale(1)'
            : 'translateY(-6px) scale(0.97)',
          pointerEvents: open ? 'auto' : 'none',
          visibility: open ? 'visible' : 'hidden',
          transition: 'opacity 0.16s ease, transform 0.16s ease',
          transformOrigin: 'top left',
        }}
      >
        {!session && (
          <p style={{ color: 'var(--gco-ink-muted)', margin: 0 }}>
            Sin rutina activa. Inicia una en Ajustes → Rutinas.
          </p>
        )}
        {session && activity && routine && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 2,
                gap: 8,
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                }}
              >
                {routine.name}
              </p>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--gco-ink-muted)',
                  flexShrink: 0,
                }}
              >
                {stepLabel}
              </span>
            </div>
            <p
              style={{
                color: 'var(--gco-ink-muted)',
                marginBottom: 8,
                marginTop: 4,
              }}
            >
              {activityIcon(activity)} {activity.label}
            </p>
            <p
              className="mono"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--gco-primary)',
                marginBottom: 6,
                marginTop: 0,
              }}
            >
              {formatMs(remaining)}
              {session.paused ? ' (pausa)' : ''}
            </p>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(progressFraction * 100)}%`,
                  background: 'var(--gco-primary)',
                  transition: 'width 0.5s linear',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {canGo && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ fontSize: '0.8rem', padding: '0.5rem 0.65rem' }}
                  onClick={goToActivity}
                >
                  {goLabel}
                </button>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="glass-button secondary"
                  disabled={session.activityIndex <= 0}
                  style={{
                    flex: 1,
                    fontSize: '0.78rem',
                    padding: '0.42rem 0.5rem',
                    opacity: session.activityIndex <= 0 ? 0.45 : 1,
                  }}
                  onClick={goToPreviousStep}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{
                    flex: 1,
                    fontSize: '0.78rem',
                    padding: '0.42rem 0.5rem',
                  }}
                  onClick={() => {
                    soundClick()
                    playBell()
                    setPrefs(advanceRoutineSession())
                  }}
                >
                  Siguiente →
                </button>
              </div>

              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem', padding: '0.42rem 0.6rem' }}
                onClick={() => {
                  soundClick()
                  setPrefs(togglePauseSession())
                }}
              >
                {session.paused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem', padding: '0.42rem 0.6rem' }}
                onClick={() => {
                  soundClick()
                  setPrefs(stopRoutineSession())
                  setOpen(false)
                }}
              >
                Terminar rutina
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}