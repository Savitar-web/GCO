import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { ModeSwitch } from '@/components/ui/ModeSwitch'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import {
  listTracks,
  listPlaylists,
  importTrackFile,
  deleteTrack,
  createPlaylist,
  deletePlaylist,
  updateTrack,
  renamePlaylist,
  formatTrackTime,
  type TrackItem,
  type Playlist,
} from '@/core/storage/mediaLibrary'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { PlayerBar } from './PlayerBar'

type Tab = 'library' | 'playlists' | 'now' | 'import' | 'more'

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'library', label: 'Biblioteca', emoji: '🎧' },
  { id: 'playlists', label: 'Listas', emoji: '📋' },
  { id: 'now', label: 'Ahora', emoji: '▶' },
  { id: 'import', label: 'Importar', emoji: '⬇️' },
  { id: 'more', label: 'Más', emoji: '⋯' },
]

export function MusicaHome() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [sortAlpha, setSortAlpha] = useState(false)
  const [activePl, setActivePl] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('library')
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editYear, setEditYear] = useState('')
  const [editAlbum, setEditAlbum] = useState('')
  const [specColor, setSpecColor] = useState('#22E6C5')
  const [specStyle, setSpecStyle] = useState<'bars' | 'wave'>('bars')
  const player = useMediaPlayer()

  const refresh = async () => {
    setTracks(await listTracks())
    setPlaylists(await listPlaylists())
  }

  useEffect(() => {
    void refresh()
    const on = () => void refresh()
    window.addEventListener('gco:library', on)
    return () => window.removeEventListener('gco:library', on)
  }, [])

  const visible = useMemo(() => {
    let list = [...tracks]
    if (activePl) {
      const pl = playlists.find((p) => p.id === activePl)
      if (pl) {
        list = pl.trackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter(Boolean) as TrackItem[]
      }
    }
    if (sortAlpha) list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    return list
  }, [tracks, playlists, activePl, sortAlpha])

  const editing = editId ? tracks.find((t) => t.id === editId) : null
  const current = player.track

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const ok =
        file.type.startsWith('audio/') ||
        file.type.startsWith('video/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus|mp4|webm)$/i.test(file.name)
      if (!ok) {
        soundFail()
        continue
      }
      try {
        await importTrackFile(file)
        soundSuccess()
      } catch {
        soundFail()
      }
    }
    await refresh()
    setTab('library')
  }

  const playAll = (list: TrackItem[], start?: TrackItem) => {
    if (!list.length) return
    player.setQueue(list)
    void player.playTrack(start ?? list[0], list)
    setTab('now')
  }

  const openEdit = (t: TrackItem) => {
    soundClick()
    setEditId(t.id)
    setEditTitle(t.title)
    setEditArtist(t.artist)
    setEditYear(t.year ?? '')
    setEditAlbum(t.album ?? '')
  }

  const saveEdit = async () => {
    if (!editId) return
    await updateTrack(editId, {
      title: editTitle.trim() || 'Sin título',
      artist: editArtist.trim() || 'Desconocido',
      year: editYear.trim() || undefined,
      album: editAlbum.trim() || undefined,
    } as Partial<TrackItem>)
    soundSuccess()
    setEditId(null)
    await refresh()
  }

  const onCover = async (file: File | undefined) => {
    if (!file || !editId) return
    const reader = new FileReader()
    reader.onload = async () => {
      await updateTrack(editId, { coverDataUrl: String(reader.result) })
      soundSuccess()
      await refresh()
    }
    reader.readAsDataURL(file)
  }

  const header = (
    <header style={{ marginBottom: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.65rem',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: 'clamp(1.35rem, 4.5vw, 1.85rem)',
              lineHeight: 1.2,
            }}
          >
            🎵 Música
          </h1>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.88rem',
              marginTop: 4,
            }}
          >
            Reproductor Offline
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexShrink: 0,
          }}
        >
          <div className="mode-switch-desktop">
            <ModeSwitch />
          </div>
          <ThemeToggle />
          <button
            type="button"
            className="theme-cycle-btn"
            aria-label="Abrir ajustes"
            onClick={() => {
              soundClick()
              navigate('/ajustes')
            }}
            style={{ width: 44, height: 44, padding: 0, borderRadius: 12 }}
          >
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 2,
                  background: 'currentColor',
                  borderRadius: 2,
                }}
              />
              <span
                style={{
                  width: 18,
                  height: 2,
                  background: 'currentColor',
                  borderRadius: 2,
                }}
              />
              <span
                style={{
                  width: 18,
                  height: 2,
                  background: 'currentColor',
                  borderRadius: 2,
                }}
              />
            </span>
          </button>
        </div>
      </div>
      <div className="mode-switch-mobile" style={{ marginTop: '0.75rem' }}>
        <ModeSwitch fullWidth />
      </div>
    </header>
  )

  const trackRow = (t: TrackItem) => (
    <div
      key={t.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0.85rem 1rem',
        borderBottom: '1px solid var(--gco-glass-border)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(visible.length ? visible : tracks, t)
        }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--gco-glass-border)',
          background: 'rgba(255,255,255,0.06)',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {t.coverDataUrl ? (
          <img
            src={t.coverDataUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1.25rem' }}>🎵</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(visible.length ? visible : tracks, t)
        }}
        style={{
          flex: 1,
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          font: 'inherit',
          padding: 0,
          minWidth: 0,
        }}
      >
        <p
          style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t.title}
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
          {t.artist} · {formatTrackTime(t.durationMs)}
          {t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ''}
        </p>
      </button>
      <button
        type="button"
        className="glass-button secondary"
        style={{ fontSize: '0.72rem', padding: '0.35rem 0.55rem' }}
        onClick={() => openEdit(t)}
      >
        Editar
      </button>
      <button
        type="button"
        className="glass-button secondary"
        style={{ fontSize: '0.72rem', padding: '0.35rem 0.55rem' }}
        onClick={() => {
          soundClick()
          void deleteTrack(t.id).then(refresh)
        }}
      >
        ✕
      </button>
    </div>
  )

  const libraryPanel = (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setSortAlpha((v) => !v)
          }}
        >
          {sortAlpha ? 'A–Z' : 'Recientes'}
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            playAll(visible)
          }}
          disabled={!visible.length}
        >
          ▶ Todo
        </button>
      </div>
      <GlassCard>
        <div style={{ padding: '0.25rem 0' }}>
          {visible.length === 0 ? (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                padding: '2rem 1rem',
              }}
            >
              Biblioteca vacía. Ve a Importar.
            </p>
          ) : (
            visible.map(trackRow)
          )}
        </div>
      </GlassCard>
    </div>
  )

  const playlistsPanel = (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <GlassButton
          onClick={() => {
            soundClick()
            void createPlaylist(`Lista ${playlists.length + 1}`).then(refresh)
          }}
        >
          + Nueva lista
        </GlassButton>
        <button
          type="button"
          className={`glass-button ${!activePl ? '' : 'secondary'}`}
          onClick={() => {
            soundClick()
            setActivePl(null)
            setTab('library')
          }}
        >
          Ver todas las pistas
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playlists.length === 0 && (
          <p style={{ color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
            Aún no hay playlists.
          </p>
        )}
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="glass-card"
            style={{
              padding: '1rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  setActivePl(pl.id)
                  setTab('library')
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  flex: 1,
                  padding: 0,
                }}
              >
                <p style={{ fontWeight: 700 }}>{pl.name}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                  {pl.trackIds.length} pistas
                </p>
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.75rem' }}
                onClick={() => {
                  soundClick()
                  const name = prompt('Nombre de la lista', pl.name)
                  if (name?.trim()) void renamePlaylist(pl.id, name).then(refresh)
                }}
              >
                Renombrar
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.75rem' }}
                onClick={() => {
                  soundClick()
                  if (confirm(`¿Borrar “${pl.name}”?`)) {
                    void deletePlaylist(pl.id).then(() => {
                      if (activePl === pl.id) setActivePl(null)
                      void refresh()
                    })
                  }
                }}
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', alignSelf: 'flex-start' }}
              onClick={() => {
                soundClick()
                const list = pl.trackIds
                  .map((id) => tracks.find((t) => t.id === id))
                  .filter(Boolean) as TrackItem[]
                playAll(list)
              }}
            >
              ▶ Reproducir lista
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  const nowPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GlassCard>
        <div style={{ padding: '1.35rem 1.2rem', textAlign: 'center' }}>
          <div
            style={{
              width: 'min(220px, 70vw)',
              aspectRatio: '1',
              margin: '0 auto 1.1rem',
              borderRadius: 20,
              overflow: 'hidden',
              border: '1px solid var(--gco-glass-border)',
              background: 'rgba(255,255,255,0.06)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            {current?.coverDataUrl ? (
              <img
                src={current.coverDataUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '3rem',
                }}
              >
                🎵
              </div>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>
            {current?.title ?? 'Nada en reproducción'}
          </h2>
          <p style={{ color: 'var(--gco-ink-muted)', marginBottom: 6 }}>
            {current?.artist ?? '—'}
            {current?.album ? ` · ${current.album}` : ''}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            {current
              ? `${formatTrackTime(current.durationMs)} · ${formatBytes(current.sizeBytes)}${
                  current.year ? ` · ${current.year}` : ''
                }`
              : 'Elige una pista en Biblioteca'}
          </p>

          {/* Espectro simple (CSS pulse; el analizer real puede ir en PlayerBar) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 4,
              height: 56,
              marginTop: 18,
              opacity: player.playing ? 1 : 0.35,
            }}
          >
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  borderRadius: 4,
                  background: specColor,
                  height:
                    specStyle === 'bars'
                      ? `${20 + ((i * 17) % 36)}px`
                      : `${18 + Math.sin(i) * 14 + 14}px`,
                  animation: player.playing
                    ? `gco-bar ${0.4 + (i % 5) * 0.08}s ease-in-out infinite alternate`
                    : 'none',
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              marginTop: 14,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <label style={{ fontSize: '0.8rem' }}>
              Color espectro
              <input
                type="color"
                value={specColor}
                onChange={(e) => setSpecColor(e.target.value)}
                style={{ marginLeft: 8, verticalAlign: 'middle' }}
              />
            </label>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem' }}
              onClick={() => {
                soundClick()
                setSpecStyle((s) => (s === 'bars' ? 'wave' : 'bars'))
              }}
            >
              Estilo: {specStyle === 'bars' ? 'Barras' : 'Onda'}
            </button>
          </div>
        </div>
      </GlassCard>
      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
        Controles de reproducción en la barra inferior. Volumen y velocidad
        también allí.
      </p>
    </div>
  )

  const importPanel = (
    <GlassCard>
      <div style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
        <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>⬇️</p>
        <h2 style={{ marginBottom: 8 }}>Importar audio</h2>
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.9rem',
            marginBottom: 18,
            lineHeight: 1.45,
          }}
        >
          MP3, M4A, AAC, WAV, OGG, FLAC. También MP4/WebM (el navegador usará la
          pista de audio si puede).
        </p>
        <GlassButton
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        >
          Elegir archivos
        </GlassButton>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.aac,.wav,.ogg,.flac"
          multiple
          hidden
          onChange={(e) => {
            void onImport(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </GlassCard>
  )

  const morePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <GlassCard>
        <div style={{ padding: '1.15rem 1.1rem' }}>
          <h3 style={{ marginBottom: 10 }}>Reproductor</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--gco-ink-muted)', lineHeight: 1.5 }}>
            · Cola y modo aleatorio / repetición (barra inferior)
            <br />
            · Portada en “Ahora” y miniatura en biblioteca
            <br />
            · Editar título, artista, álbum, año y carátula
            <br />
            · Playlists renombrables
            <br />
            · Todo offline (IndexedDB)
            <br />
            · Segundo plano: Media Session del sistema (cuando el SO lo permite)
          </p>
        </div>
      </GlassCard>
      <GlassCard>
        <div style={{ padding: '1.15rem 1.1rem' }}>
          <h3 style={{ marginBottom: 8 }}>Biblioteca</h3>
          <p style={{ fontSize: '0.9rem' }}>
            {tracks.length} pistas · {playlists.length} listas
          </p>
        </div>
      </GlassCard>
    </div>
  )

  const mainContent =
    tab === 'library'
      ? libraryPanel
      : tab === 'playlists'
        ? playlistsPanel
        : tab === 'now'
          ? nowPanel
          : tab === 'import'
            ? importPanel
            : morePanel

  return (
    <div
      className="app-shell"
      style={{
        paddingBottom: 'calc(7.5rem + env(safe-area-inset-bottom, 0px))',
        maxWidth: 1100,
      }}
    >
      <style>{`
        @keyframes gco-bar {
          from { transform: scaleY(0.45); }
          to { transform: scaleY(1); }
        }
        .gco-music-layout {
          display: block;
        }
        .gco-music-side {
          display: none;
        }
        .gco-music-bottom-nav {
          display: flex;
        }
        @media (min-width: 900px) {
          .gco-music-layout {
            display: grid;
            grid-template-columns: 240px 1fr;
            gap: 1.25rem;
            align-items: start;
          }
          .gco-music-side {
            display: block;
            position: sticky;
            top: 1rem;
          }
          .gco-music-bottom-nav {
            display: none;
          }
        }
      `}</style>

      {header}

      <div className="gco-music-layout">
        {/* Sidebar PC */}
        <aside className="gco-music-side">
          <div
            className="glass-card"
            style={{
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setTab(t.id)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0.7rem 0.85rem',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  textAlign: 'left',
                  background:
                    tab === t.id ? 'rgba(34, 230, 197, 0.18)' : 'transparent',
                  color:
                    tab === t.id ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                  fontWeight: tab === t.id ? 700 : 500,
                }}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          {activePl && (
            <p
              style={{
                marginTop: 12,
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
              }}
            >
              Filtro: {playlists.find((p) => p.id === activePl)?.name}
            </p>
          )}
        </aside>

        <main style={{ minWidth: 0 }}>{mainContent}</main>
      </div>

      {/* Editor de pista */}
      {editing && (
        <div
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setEditId(null)}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(420px, 100%)',
              padding: '1.25rem',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 12 }}>Editar pista</h3>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 12,
                border: '1px solid var(--gco-glass-border)',
              }}
            >
              {editing.coverDataUrl ? (
                <img
                  src={editing.coverDataUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  🎵
                </div>
              )}
            </div>
            <button
              type="button"
              className="glass-button secondary"
              style={{ marginBottom: 12, fontSize: '0.85rem' }}
              onClick={() => {
                soundClick()
                coverRef.current?.click()
              }}
            >
              Cambiar portada
            </button>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void onCover(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
              Título
            </label>
            <input
              className="glass-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
              Artista
            </label>
            <input
              className="glass-input"
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
              Álbum
            </label>
            <input
              className="glass-input"
              value={editAlbum}
              onChange={(e) => setEditAlbum(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
              Año
            </label>
            <input
              className="glass-input"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              style={{ marginBottom: 14 }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', marginBottom: 12 }}>
              {formatBytes(editing.sizeBytes)} · {formatTrackTime(editing.durationMs)} ·{' '}
              {editing.mime}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <GlassButton onClick={() => void saveEdit()}>Guardar</GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => setEditId(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nav inferior móvil (safe-area) */}
      <nav
        className="gco-music-bottom-nav"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'color-mix(in srgb, var(--gco-bg, #0B1220) 72%, transparent)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderTop: '1px solid var(--gco-glass-border)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            maxWidth: 520,
            margin: '0 auto',
            width: '100%',
            padding: '0.35rem 0.25rem 0.45rem',
          }}
        >
          {TABS.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setTab(t.id)
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: on ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                  font: 'inherit',
                  fontSize: '0.62rem',
                  fontWeight: on ? 700 : 500,
                  padding: '0.4rem 0.15rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '1.15rem' }}>{t.emoji}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>

      <PlayerBar player={player} />
    </div>
  )
}