import { useState, useEffect, useRef } from 'react'
import {
  getRoutinePrefs,
  saveRoutinePrefs,
  getRoutines,
  upsertRoutine,
  deleteRoutine,
  createEmptyRoutine,
  totalRoutineMinutes,
  startRoutineSession,
  ringBell,
  type Routine,
  type RoutineActivity,
} from '@/core/storage/routines'
import { listBooks, type BookItem } from '@/core/storage/mediaLibrary'
import { soundClick, soundToggle, soundSuccess } from '@/core/audio/uiSounds'

/* ---------------------------------------------------------------------- */
/* Catálogo de destinos (rutas reales de App.tsx)                         */
/* ---------------------------------------------------------------------- */

type StepKind = 'game' | 'reading' | 'rest'
type GameCategory = 'memoria' | 'logica'

type GameOption = {
  path: string
  label: string
  category: GameCategory
  icon: string
}

const GAME_OPTIONS: GameOption[] = [
  {
    path: '/categoria/memoria/secuencia-colores',
    label: 'Secuencia de colores',
    category: 'memoria',
    icon: '🌈',
  },
  {
    path: '/categoria/memoria/cartas',
    label: 'Memoria de cartas',
    category: 'memoria',
    icon: '🃏',
  },
  {
    path: '/categoria/memoria/numeros-asociados',
    label: 'Números asociados · Palabras · Citas',
    category: 'memoria',
    icon: '🔢',
  },
  {
    path: '/categoria/memoria/habilidades',
    label: 'Habilidades',
    category: 'memoria',
    icon: '⚡',
  },
  {
    path: '/categoria/logica/numberpuzzle',
    label: 'Colocador',
    category: 'logica',
    icon: '🧩',
  },
  {
    path: '/categoria/logica/rompecabezas',
    label: 'Rompecabezas',
    category: 'logica',
    icon: '🧩',
  },
  {
    path: '/categoria/logica/despejes',
    label: 'Despejes',
    category: 'logica',
    icon: '🧹',
  },
]

const CATEGORY_LABELS: Record<GameCategory, string> = {
  memoria: 'Memoria',
  logica: 'Lógica',
}

const READING_HOME = '/nutricion'
const REST_PATH = '/musica'

/* ---------------------------------------------------------------------- */
/* Apariencia / sonido                                                    */
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

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function stepKindOf(a: RoutineActivity): StepKind {
  if (a.path === REST_PATH || a.type === 'rest') return 'rest'
  if (
    a.path === READING_HOME ||
    (a.path != null && a.path.startsWith('/nutricion'))
  )
    return 'reading'
  return 'game'
}

export function RutinasSettings() {
  const [prefs, setPrefs] = useState(getRoutinePrefs)
  const [list, setList] = useState(getRoutines)
  const [editing, setEditing] = useState<Routine | null>(null)

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

  const refresh = () => {
    setPrefs(getRoutinePrefs())
    setList(getRoutines())
  }

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener('gco:routines-changed', onChange)
    return () => window.removeEventListener('gco:routines-changed', onChange)
  }, [])

  const toggleSystem = () => {
    const next = !prefs.systemEnabled
    soundToggle(next)
    setPrefs(saveRoutinePrefs({ systemEnabled: next }))
  }

  const selectedImage =
    appearance.source === 'gallery'
      ? gallery.find((g) => g.id === appearance.imageId)
      : undefined

  const persistAppearance = (next: BellAppearance) => {
    setAppearance(next)
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(APPEARANCE_EVENT))
  }

  const handleUploadImage = async (file: File) => {
    if (file.type !== 'image/png') {
      window.alert(
        'Solo se aceptan imágenes .png (idealmente con fondo transparente).'
      )
      return
    }
    try {
      const dataUrl = await readFileAsDataURL(file)
      const img: GalleryImage = { id: uid(), name: file.name, dataUrl }
      const nextGallery = [...gallery, img]
      setGallery(nextGallery)
      localStorage.setItem(GALLERY_KEY, JSON.stringify(nextGallery))
      persistAppearance({ source: 'gallery', imageId: img.id })
      soundSuccess()
    } catch {
      window.alert('No se pudo cargar la imagen.')
    }
  }

  const deleteGalleryImage = (id: string) => {
    soundClick()
    const nextGallery = gallery.filter((g) => g.id !== id)
    setGallery(nextGallery)
    localStorage.setItem(GALLERY_KEY, JSON.stringify(nextGallery))
    if (appearance.imageId === id) persistAppearance({ source: 'default' })
    else window.dispatchEvent(new Event(APPEARANCE_EVENT))
  }

  const persistSound = (next: SoundSettings) => {
    setSoundSettings(next)
    localStorage.setItem(SOUND_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(SOUND_EVENT))
  }

  const selectTone = (toneId: string) => {
    soundClick()
    const next = { ...soundSettings, toneId }
    persistSound(next)
    playSelectedTone(toneId, customTracks, next.volume ?? 1, ringBell)
  }

  const setVolume = (volume: number) => {
    persistSound({
      ...soundSettings,
      volume: Math.min(1, Math.max(0.2, volume)),
    })
  }

  const handleUploadTrack = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      window.alert('Selecciona un archivo de audio (mp3, wav, ogg...).')
      return
    }
    try {
      const dataUrl = await readFileAsDataURL(file)
      const track: CustomTrack = { id: uid(), name: file.name, dataUrl }
      const nextTracks = [...customTracks, track]
      setCustomTracks(nextTracks)
      localStorage.setItem(TRACKS_KEY, JSON.stringify(nextTracks))
      persistSound({ ...soundSettings, toneId: `custom:${track.id}` })
      soundSuccess()
    } catch {
      window.alert('No se pudo cargar la pista.')
    }
  }

  const deleteTrack = (id: string) => {
    soundClick()
    const nextTracks = customTracks.filter((t) => t.id !== id)
    setCustomTracks(nextTracks)
    localStorage.setItem(TRACKS_KEY, JSON.stringify(nextTracks))
    if (soundSettings.toneId === `custom:${id}`) {
      persistSound({ ...soundSettings, toneId: 'default' })
    }
  }

  if (editing) {
    return (
      <RoutineEditor
        routine={editing}
        onCancel={() => setEditing(null)}
        onSave={(r) => {
          upsertRoutine({ ...r, updatedAt: new Date().toISOString() })
          soundSuccess()
          setEditing(null)
          refresh()
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        className="glass-card"
        style={{
          padding: '1.1rem 1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, margin: 0 }}>Sistema de rutinas</p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Al activarlo aparece la campana flotante. Arrástrala donde quieras.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.systemEnabled}
          onClick={toggleSystem}
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: prefs.systemEnabled
              ? 'var(--gco-primary)'
              : 'rgba(255,255,255,0.12)',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: prefs.systemEnabled ? 24 : 3,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            }}
          />
        </button>
      </div>

      {!prefs.systemEnabled && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
            margin: 0,
          }}
        >
          Activa el sistema para usar rutinas y la campana.
        </p>
      )}

      <SectionTitle>Personalización</SectionTitle>

      <div className="glass-card" style={{ padding: '1.1rem 1.2rem' }}>
        <p style={{ fontWeight: 600, margin: '0 0 2px' }}>
          Apariencia de la campana
        </p>
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          Campana por defecto o PNG con fondo transparente.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button
            type="button"
            className="glass-button"
            onClick={() => {
              soundClick()
              persistAppearance({ source: 'default' })
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '0.75rem',
              border:
                appearance.source === 'default'
                  ? '1px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>🔔</span>
            <span style={{ fontSize: '0.75rem' }}>Por defecto</span>
          </button>
          <button
            type="button"
            className="glass-button secondary"
            disabled={gallery.length === 0}
            onClick={() => {
              soundClick()
              const id =
                appearance.imageId &&
                gallery.some((g) => g.id === appearance.imageId)
                  ? appearance.imageId
                  : gallery[0]?.id
              if (!id) return
              persistAppearance({ source: 'gallery', imageId: id })
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '0.75rem',
              opacity: gallery.length === 0 ? 0.45 : 1,
              border:
                appearance.source === 'gallery'
                  ? '1px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
            }}
          >
            {selectedImage ? (
              <img
                src={selectedImage.dataUrl}
                alt=""
                style={{ width: 24, height: 24, objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '1.4rem' }}>🖼️</span>
            )}
            <span style={{ fontSize: '0.75rem' }}>Personalizada</span>
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
            gap: 8,
          }}
        >
          {gallery.map((g) => (
            <div key={g.id} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  persistAppearance({ source: 'gallery', imageId: g.id })
                }}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 10,
                  border:
                    appearance.source === 'gallery' && appearance.imageId === g.id
                      ? '2px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <img
                  src={g.dataUrl}
                  alt={g.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              </button>
              <button
                type="button"
                aria-label="Eliminar"
                onClick={() => deleteGalleryImage(g.id)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(220,60,60,0.9)',
                  color: '#fff',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <label
            style={{
              aspectRatio: '1',
              borderRadius: 10,
              border: '1px dashed var(--gco-glass-border)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: '1.2rem',
              color: 'var(--gco-ink-muted)',
            }}
          >
            +
            <input
              type="file"
              accept="image/png"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUploadImage(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.1rem 1.2rem' }}>
        <p style={{ fontWeight: 600, margin: '0 0 2px' }}>
          Sonido del temporizador
        </p>
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          Tono al terminar cada paso.
        </p>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
              Volumen
            </span>
            <span className="mono" style={{ fontSize: '0.8rem' }}>
              {Math.round((soundSettings.volume ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            value={Math.round((soundSettings.volume ?? 1) * 100)}
            onChange={(e) => setVolume(parseInt(e.target.value, 10) / 100)}
            style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {TONE_PRESETS.map((p) => (
            <ToneCard
              key={p.id}
              label={p.label}
              icon={p.id === 'default' ? '🔔' : '🎵'}
              active={soundSettings.toneId === p.id}
              onSelect={() => selectTone(p.id)}
            />
          ))}
        </div>

        {customTracks.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginBottom: 10,
            }}
          >
            {customTracks.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.5rem 0.7rem',
                  borderRadius: 10,
                  border:
                    soundSettings.toneId === `custom:${t.id}`
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <button
                  type="button"
                  onClick={() => selectTone(`custom:${t.id}`)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🎧 {t.name}
                </button>
                <button
                  type="button"
                  aria-label="Eliminar"
                  onClick={() => deleteTrack(t.id)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(220,60,60,0.9)',
                    color: '#fff',
                    fontSize: '0.6rem',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          className="glass-button secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.5rem 0.85rem',
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          + Añadir pista
          <input
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUploadTrack(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <SectionTitle>Tus rutinas</SectionTitle>

      <button
        type="button"
        className="glass-button"
        style={{ padding: '0.7rem 1rem' }}
        onClick={() => {
          soundClick()
          setEditing(createEmptyRoutine())
        }}
      >
        + Nueva rutina
      </button>

      {list.length === 0 && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
          }}
        >
          Aún no hay rutinas.
        </p>
      )}

      {list.map((r) => (
        <div key={r.id} className="glass-card" style={{ padding: '1rem 1.15rem' }}>
          <p style={{ fontWeight: 600, margin: 0 }}>
            {r.name}{' '}
            {r.isPreset && (
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--gco-ink-muted)',
                  fontWeight: 500,
                }}
              >
                preset
              </span>
            )}
          </p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 4,
            }}
          >
            {r.activities.length} pasos · {totalRoutineMinutes(r)} min
            {r.timeHHMM ? ` · ${r.timeHHMM}` : ''}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <button
              type="button"
              className="glass-button"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
              disabled={!prefs.systemEnabled}
              onClick={() => {
                soundClick()
                startRoutineSession(r.id)
                refresh()
              }}
            >
              Iniciar
            </button>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
              onClick={() => {
                soundClick()
                setEditing({
                  ...r,
                  activities: r.activities.map((a) => ({ ...a })),
                })
              }}
            >
              Editar
            </button>
            {!r.isPreset && (
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                onClick={() => {
                  soundClick()
                  deleteRoutine(r.id)
                  refresh()
                }}
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.72rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--gco-ink-muted)',
        margin: '0.15rem 0 0',
        fontWeight: 600,
      }}
    >
      {children}
    </p>
  )
}

function ToneCard({
  label,
  icon,
  active,
  onSelect,
}: {
  label: string
  icon: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '0.65rem 0.4rem',
        borderRadius: 10,
        cursor: 'pointer',
        border: active
          ? '1px solid var(--gco-primary)'
          : '1px solid var(--gco-glass-border)',
        background: active ? 'rgba(34,230,197,0.12)' : 'rgba(255,255,255,0.03)',
        color: 'inherit',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontSize: '0.72rem', textAlign: 'center' }}>{label}</span>
    </button>
  )
}

/* ── Desplegable reutilizable (overflow visible + z-index alto) ──────── */

function FancySelect({
  valueLabel,
  valueIcon,
  open,
  setOpen,
  children,
}: {
  valueLabel: string
  valueIcon: string
  open: boolean
  setOpen: (v: boolean) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [setOpen])

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: open ? 50 : 1,
      }}
    >
      <button
        type="button"
        className="glass-input"
        onClick={() => {
          soundClick()
          setOpen(!open)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          <span>{valueIcon}</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {valueLabel}
          </span>
        </span>
        <span
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 60,
            borderRadius: 12,
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-bg-elevated, #121A2B)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            maxHeight: 260,
            overflowY: 'auto',
            padding: '0.4rem',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function GameSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (path: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current =
    GAME_OPTIONS.find((o) => o.path === value) ?? GAME_OPTIONS[0]

  return (
    <FancySelect
      valueLabel={current.label}
      valueIcon={current.icon}
      open={open}
      setOpen={setOpen}
    >
      {(['memoria', 'logica'] as GameCategory[]).map((cat) => {
        const opts = GAME_OPTIONS.filter((o) => o.category === cat)
        if (!opts.length) return null
        return (
          <div key={cat} style={{ marginBottom: 4 }}>
            <p
              style={{
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--gco-ink-muted)',
                padding: '0.3rem 0.5rem 0.15rem',
                margin: 0,
              }}
            >
              {CATEGORY_LABELS[cat]}
            </p>
            {opts.map((o) => (
              <button
                key={o.path}
                type="button"
                onClick={() => {
                  soundClick()
                  onChange(o.path, o.label)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.5rem 0.65rem',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  background:
                    o.path === value ? 'rgba(34,230,197,0.15)' : 'transparent',
                  color: 'inherit',
                }}
              >
                <span>{o.icon}</span>
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.path === value && (
                  <span style={{ color: 'var(--gco-primary)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        )
      })}
    </FancySelect>
  )
}

function BookSelect({
  books,
  valuePath,
  onChange,
}: {
  books: BookItem[]
  valuePath: string
  onChange: (path: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const bookId =
    valuePath.startsWith('/nutricion/libro/')
      ? valuePath.replace('/nutricion/libro/', '')
      : null
  const current = bookId ? books.find((b) => b.id === bookId) : null
  const label = current ? current.title : 'Biblioteca (todos los libros)'
  const icon = '📖'

  return (
    <FancySelect
      valueLabel={label}
      valueIcon={icon}
      open={open}
      setOpen={setOpen}
    >
      <button
        type="button"
        onClick={() => {
          soundClick()
          onChange(READING_HOME, 'Lectura · biblioteca')
          setOpen(false)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0.5rem 0.65rem',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '0.85rem',
          background:
            !bookId ? 'rgba(34,230,197,0.15)' : 'transparent',
          color: 'inherit',
        }}
      >
        <span>📚</span>
        <span style={{ flex: 1 }}>Biblioteca (todos)</span>
        {!bookId && <span style={{ color: 'var(--gco-primary)' }}>✓</span>}
      </button>

      {books.length === 0 && (
        <p
          style={{
            padding: '0.5rem 0.65rem',
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            margin: 0,
          }}
        >
          No hay libros importados. Ve a Nutrición para añadirlos.
        </p>
      )}

      {books.map((b) => {
        const path = `/nutricion/libro/${b.id}`
        const on = bookId === b.id
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              soundClick()
              onChange(path, b.title)
              setOpen(false)
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0.5rem 0.65rem',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '0.85rem',
              background: on ? 'rgba(34,230,197,0.15)' : 'transparent',
              color: 'inherit',
            }}
          >
            <span>📖</span>
            <span style={{ flex: 1 }}>{b.title}</span>
            {on && <span style={{ color: 'var(--gco-primary)' }}>✓</span>}
          </button>
        )
      })}
    </FancySelect>
  )
}

function RoutineEditor({
  routine,
  onSave,
  onCancel,
}: {
  routine: Routine
  onSave: (r: Routine) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(routine)
  const [books, setBooks] = useState<BookItem[]>([])

  useEffect(() => {
    void listBooks()
      .then(setBooks)
      .catch(() => setBooks([]))
  }, [])

  const updateAct = (id: string, patch: Partial<RoutineActivity>) => {
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.id === id ? { ...a, ...patch } : a
      ),
    }))
  }

  const setKind = (id: string, kind: StepKind) => {
    soundClick()
    if (kind === 'game') {
      updateAct(id, {
        type: 'game',
        path: GAME_OPTIONS[0].path,
        label: GAME_OPTIONS[0].label,
      })
      return
    }
    if (kind === 'reading') {
      updateAct(id, {
        type: 'game',
        path: READING_HOME,
        label: 'Lectura · biblioteca',
      })
      return
    }
    updateAct(id, {
      type: 'rest',
      path: REST_PATH,
      label: 'Descanso · Música',
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <button
        type="button"
        className="glass-button secondary"
        onClick={onCancel}
        style={{ alignSelf: 'flex-start', padding: '0.45rem 0.9rem' }}
      >
        ← Cancelar
      </button>

      <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>Nombre</label>
      <input
        className="glass-input"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />

      <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>
        Hora sugerida (opcional)
      </label>
      <input
        className="glass-input mono"
        type="time"
        value={draft.timeHHMM}
        onChange={(e) => setDraft({ ...draft, timeHHMM: e.target.value })}
      />

      <p style={{ fontWeight: 600, margin: '0.35rem 0 0' }}>Actividades</p>

      {draft.activities.map((a, idx) => {
        const kind = stepKindOf(a)
        return (
          <div
            key={a.id}
            className="glass-card"
            style={{
              padding: '1rem 1.05rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              /* overflow visible para que el desplegable no se corte */
              overflow: 'visible',
              position: 'relative',
              zIndex: draft.activities.length - idx,
            }}
          >
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--gco-ink-muted)',
                margin: 0,
              }}
            >
              Paso {idx + 1}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
              }}
            >
              {(
                [
                  { id: 'reading' as const, label: 'Lectura', icon: '📖' },
                  { id: 'game' as const, label: 'Juego', icon: '🎮' },
                  { id: 'rest' as const, label: 'Descanso', icon: '☕' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`glass-button ${kind === t.id ? '' : 'secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '0.45rem 0.35rem' }}
                  onClick={() => setKind(a.id, t.id)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Selector ARRIBA de minutos / quitar */}
            {kind === 'game' && (
              <div style={{ position: 'relative', zIndex: 5 }}>
                <label
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Juego
                </label>
                <GameSelect
                  value={
                    a.path && GAME_OPTIONS.some((o) => o.path === a.path)
                      ? a.path
                      : GAME_OPTIONS[0].path
                  }
                  onChange={(path, label) => updateAct(a.id, { path, label })}
                />
              </div>
            )}

            {kind === 'reading' && (
              <div style={{ position: 'relative', zIndex: 5 }}>
                <label
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Libro
                </label>
                <BookSelect
                  books={books}
                  valuePath={a.path ?? READING_HOME}
                  onChange={(path, label) =>
                    updateAct(a.id, { path, label, type: 'game' })
                  }
                />
              </div>
            )}

            {kind === 'rest' && (
              <div>
                <label
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Etiqueta
                </label>
                <input
                  className="glass-input"
                  value={a.label}
                  onChange={(e) => updateAct(a.id, { label: e.target.value })}
                />
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--gco-ink-faint)',
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  Abre Música ({REST_PATH}).
                </p>
              </div>
            )}

            <div>
              <label
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Minutos
              </label>
              <input
                className="glass-input mono"
                type="number"
                min={1}
                max={90}
                value={a.durationMin}
                onChange={(e) =>
                  updateAct(a.id, {
                    durationMin: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                style={{ maxWidth: 120 }}
              />
            </div>

            <button
              type="button"
              className="glass-button secondary"
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                alignSelf: 'flex-start',
              }}
              onClick={() => {
                soundClick()
                setDraft((d) => ({
                  ...d,
                  activities: d.activities.filter((x) => x.id !== a.id),
                }))
              }}
            >
              Quitar paso
            </button>
          </div>
        )
      })}

      <button
        type="button"
        className="glass-button secondary"
        onClick={() => {
          soundClick()
          setDraft((d) => ({
            ...d,
            activities: [
              ...d.activities,
              {
                id: uid(),
                type: 'rest',
                path: REST_PATH,
                label: 'Descanso · Música',
                durationMin: 2,
              },
            ],
          }))
        }}
      >
        + Añadir paso
      </button>

      <button
        type="button"
        className="glass-button"
        onClick={() => onSave(draft)}
        style={{ padding: '0.75rem 1rem' }}
      >
        Guardar rutina
      </button>
    </div>
  )
}