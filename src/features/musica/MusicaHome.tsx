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
  savePlaylist,
  deletePlaylist,
  updateTrack,
  renamePlaylist,
  formatTrackTime,
  type TrackItem,
  type Playlist,
} from '@/core/storage/mediaLibrary'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { PlayerBar, getBarPrefs, saveBarPrefs } from './PlayerBar'
import { AudioSpectrum, type SpecStyle } from './AudioSpectrum'

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

const SPEC_STYLES: SpecStyle[] = ['bars', 'wave', 'sphere', 'mirror', 'pulse']

export function MusicaHome() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const dragId = useRef<string | null>(null)

  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [sortAlpha, setSortAlpha] = useState(false)
  const [activePl, setActivePl] = useState<string | null>(null)
  const [plDetailId, setPlDetailId] = useState<string | null>(null)
  const [addToPlOpen, setAddToPlOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('library')
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editYear, setEditYear] = useState('')
  const [editAlbum, setEditAlbum] = useState('')
  const [editLyrics, setEditLyrics] = useState('')

  const [specColor, setSpecColor] = useState('#22E6C5')
  const [specColorB, setSpecColorB] = useState('#8B5CF6')
  const [specColorC, setSpecColorC] = useState('#F472B6')
  const [specStyle, setSpecStyle] = useState<SpecStyle>('sphere')
  const [specMulti, setSpecMulti] = useState<1 | 2 | 3>(2)
  const [specParticles, setSpecParticles] = useState(true)
  const [specGlow, setSpecGlow] = useState(true)
  const [progressColor, setProgressColor] = useState(
    () => getBarPrefs().progressColor
  )

  const [playerHidden, setPlayerHidden] = useState(false)
  const [showLyrics, setShowLyrics] = useState(true)
  const [search, setSearch] = useState('')

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

  const plDetail = plDetailId
    ? (playlists.find((p) => p.id === plDetailId) ?? null)
    : null

  const plTracks = useMemo(() => {
    if (!plDetail) return []
    return plDetail.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter(Boolean) as TrackItem[]
  }, [plDetail, tracks])

  const visible = useMemo(() => {
    let list = [...tracks]
    if (activePl && !plDetailId) {
      const pl = playlists.find((p) => p.id === activePl)
      if (pl) {
        list = pl.trackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter(Boolean) as TrackItem[]
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album ?? '').toLowerCase().includes(q)
      )
    }
    if (sortAlpha) list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    return list
  }, [tracks, playlists, activePl, sortAlpha, search, plDetailId])

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
    setPlayerHidden(false)
  }

  const openEdit = (t: TrackItem) => {
    soundClick()
    setEditId(t.id)
    setEditTitle(t.title)
    setEditArtist(t.artist)
    setEditYear(t.year ?? '')
    setEditAlbum(t.album ?? '')
    setEditLyrics(t.lyrics ?? '')
  }

  const saveEdit = async () => {
    if (!editId) return
    await updateTrack(editId, {
      title: editTitle.trim() || 'Sin título',
      artist: editArtist.trim() || 'Desconocido',
      year: editYear.trim() || undefined,
      album: editAlbum.trim() || undefined,
      lyrics: editLyrics,
    })
    soundSuccess()
    setEditId(null)
    await refresh()
  }

  const onCover = (file: File | undefined) => {
    if (!file || !editId) return
    const reader = new FileReader()
    reader.onload = async () => {
      await updateTrack(editId, { coverDataUrl: String(reader.result) })
      soundSuccess()
      await refresh()
    }
    reader.readAsDataURL(file)
  }

  const reorderPlaylist = async (fromId: string, toId: string) => {
    if (!plDetail || fromId === toId) return
    const ids = [...plDetail.trackIds]
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, fromId)
    await savePlaylist({ ...plDetail, trackIds: ids })
    await refresh()
  }

  const addTrackToPlaylist = async (trackId: string) => {
    if (!plDetail) return
    if (plDetail.trackIds.includes(trackId)) return
    await savePlaylist({
      ...plDetail,
      trackIds: [...plDetail.trackIds, trackId],
    })
    soundSuccess()
    await refresh()
  }

  const removeFromPlaylist = async (trackId: string) => {
    if (!plDetail) return
    await savePlaylist({
      ...plDetail,
      trackIds: plDetail.trackIds.filter((x) => x !== trackId),
    })
    soundClick()
    await refresh()
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
            Reproductor offline
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
            aria-label="Mostrar u ocultar reproductor"
            title={playerHidden ? 'Mostrar reproductor' : 'Ocultar reproductor'}
            onClick={() => {
              soundClick()
              setPlayerHidden((v) => !v)
            }}
            style={{
              width: 44,
              height: 44,
              padding: 0,
              borderRadius: 12,
              fontSize: '1.1rem',
            }}
          >
            {playerHidden ? '▲' : '▼'}
          </button>
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

  const trackRow = (t: TrackItem, opts?: { inPlaylist?: boolean }) => (
    <div
      key={t.id}
      draggable={!!opts?.inPlaylist}
      onDragStart={() => {
        dragId.current = t.id
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (dragId.current) void reorderPlaylist(dragId.current, t.id)
        dragId.current = null
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0.85rem 1rem',
        borderBottom: '1px solid var(--gco-glass-border)',
        cursor: opts?.inPlaylist ? 'grab' : undefined,
      }}
    >
      {opts?.inPlaylist && (
        <span style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
          ⠿
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(
            opts?.inPlaylist ? plTracks : visible.length ? visible : tracks,
            t
          )
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
          <span style={{ fontSize: '1.25rem' }}>🎵</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(
            opts?.inPlaylist ? plTracks : visible.length ? visible : tracks,
            t
          )
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
      {opts?.inPlaylist ? (
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.72rem', padding: '0.35rem 0.55rem' }}
          onClick={() => void removeFromPlaylist(t.id)}
        >
          Quitar
        </button>
      ) : (
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
      )}
    </div>
  )

  const libraryPanel = (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <input
          className="glass-input"
          placeholder="Buscar título, artista…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
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
        {activePl && (
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setActivePl(null)
            }}
          >
            Quitar filtro lista
          </button>
        )}
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
            visible.map((t) => trackRow(t))
          )}
        </div>
      </GlassCard>
    </div>
  )

  const playlistDetailPanel = plDetail && (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 14,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setPlDetailId(null)
            setAddToPlOpen(false)
          }}
        >
          ← Listas
        </button>
        <h2 style={{ flex: 1, fontSize: '1.15rem', margin: 0 }}>
          {plDetail.name}
        </h2>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem' }}
          onClick={() => {
            soundClick()
            const name = prompt('Nombre de la lista', plDetail.name)
            if (name?.trim())
              void renamePlaylist(plDetail.id, name).then(refresh)
          }}
        >
          Renombrar
        </button>
        <GlassButton
          onClick={() => {
            soundClick()
            setAddToPlOpen((v) => !v)
          }}
        >
          + Añadir del todo
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            playAll(plTracks)
          }}
          disabled={!plTracks.length}
        >
          ▶ Reproducir
        </button>
      </div>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--gco-ink-muted)',
          marginBottom: 10,
        }}
      >
        Arrastra ⠿ para reordenar. {plTracks.length} pistas.
      </p>

      {addToPlOpen && (
        <GlassCard>
          <div
            style={{
              padding: '0.75rem 1rem',
              maxHeight: 280,
              overflow: 'auto',
              marginBottom: 12,
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 8 }}>
              Todas las importadas
            </p>
            {tracks.map((t) => {
              const inPl = plDetail.trackIds.includes(t.id)
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--gco-glass-border)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>
                    {t.title}
                    <span style={{ color: 'var(--gco-ink-muted)' }}>
                      {' '}
                      · {t.artist}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                    disabled={inPl}
                    onClick={() => void addTrackToPlaylist(t.id)}
                  >
                    {inPl ? 'Ya está' : 'Añadir'}
                  </button>
                </div>
              )
            })}
            {tracks.length === 0 && (
              <p style={{ color: 'var(--gco-ink-muted)' }}>
                No hay pistas importadas.
              </p>
            )}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div style={{ padding: '0.25rem 0' }}>
          {plTracks.length === 0 ? (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                padding: '1.5rem',
              }}
            >
              Lista vacía. Pulsa “+ Añadir del todo”.
            </p>
          ) : (
            plTracks.map((t) => trackRow(t, { inPlaylist: true }))
          )}
        </div>
      </GlassCard>
    </div>
  )

  const playlistsPanel = plDetailId ? (
    playlistDetailPanel
  ) : (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <GlassButton
          onClick={() => {
            soundClick()
            void createPlaylist(`Lista ${playlists.length + 1}`).then(refresh)
          }}
        >
          + Nueva lista
        </GlassButton>
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
                  setPlDetailId(pl.id)
                  setAddToPlOpen(pl.trackIds.length === 0)
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
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  {pl.trackIds.length} pistas · tocar para abrir
                </p>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  soundClick()
                  const list = pl.trackIds
                    .map((id) => tracks.find((x) => x.id === id))
                    .filter(Boolean) as TrackItem[]
                  playAll(list)
                }}
              >
                ▶ Reproducir
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  soundClick()
                  setActivePl(pl.id)
                  setTab('library')
                }}
              >
                Filtrar en biblioteca
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const spectrumViz = (
    <div style={{ marginTop: 16 }}>
      <AudioSpectrum
        getFrequencyData={player.getFrequencyData}
        playing={player.playing}
        style={specStyle}
        colorA={specColor}
        colorB={specColorB}
        colorC={specColorC}
        multi={specMulti}
        particles={specParticles}
        glow={specGlow}
      />
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

          {spectrumViz}

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
            {SPEC_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                className={`glass-button ${specStyle === s ? '' : 'secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                onClick={() => {
                  soundClick()
                  setSpecStyle(s)
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div style={{ padding: '1.1rem 1.15rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Letra</h3>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.75rem' }}
              onClick={() => {
                soundClick()
                setShowLyrics((v) => !v)
              }}
            >
              {showLyrics ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {showLyrics && (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '0.92rem',
                lineHeight: 1.55,
                color: 'var(--gco-ink-muted)',
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {current?.lyrics?.trim()
                ? current.lyrics
                : 'Sin letra. Edita la pista y pégala aquí.'}
            </pre>
          )}
          {current && (
            <button
              type="button"
              className="glass-button secondary"
              style={{ marginTop: 10, fontSize: '0.8rem' }}
              onClick={() => openEdit(current)}
            >
              Editar letra / metadatos
            </button>
          )}
        </div>
      </GlassCard>
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
          MP3, M4A, AAC, WAV, OGG, FLAC · MP4/WebM si el navegador extrae audio.
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
          <h3 style={{ marginBottom: 10 }}>Personalización</h3>

          <label
            style={{
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            Color barra de progreso
            <input
              type="color"
              value={progressColor}
              onChange={(e) => {
                setProgressColor(e.target.value)
                saveBarPrefs({ progressColor: e.target.value })
              }}
            />
          </label>

          <p style={{ fontSize: '0.85rem', marginBottom: 6 }}>
            Colores del espectro
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <label style={{ fontSize: '0.8rem' }}>
              A{' '}
              <input
                type="color"
                value={specColor}
                onChange={(e) => setSpecColor(e.target.value)}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              B{' '}
              <input
                type="color"
                value={specColorB}
                onChange={(e) => setSpecColorB(e.target.value)}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              C{' '}
              <input
                type="color"
                value={specColorC}
                onChange={(e) => setSpecColorC(e.target.value)}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`glass-button ${specMulti === n ? '' : 'secondary'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => {
                  soundClick()
                  setSpecMulti(n)
                }}
              >
                {n} color{n > 1 ? 'es' : ''}
              </button>
            ))}
            <button
              type="button"
              className={`glass-button ${specParticles ? '' : 'secondary'}`}
              style={{ fontSize: '0.75rem' }}
              onClick={() => {
                soundClick()
                setSpecParticles((v) => !v)
              }}
            >
              Partículas
            </button>
            <button
              type="button"
              className={`glass-button ${specGlow ? '' : 'secondary'}`}
              style={{ fontSize: '0.75rem' }}
              onClick={() => {
                soundClick()
                setSpecGlow((v) => !v)
              }}
            >
              Glow
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div style={{ padding: '1.15rem 1.1rem' }}>
          <h3 style={{ marginBottom: 10 }}>Funciones</h3>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--gco-ink-muted)',
              lineHeight: 1.55,
            }}
          >
            · Playlists: tocar lista → + Añadir del todo
            <br />
            · Reordenar por arrastre
            <br />
            · Portada, artista, álbum, año y letra
            <br />
            · Espectro real (AnalyserNode)
            <br />
            · Ocultar barra (▲/▼)
            <br />
            · Offline IndexedDB
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <div style={{ padding: '1.15rem 1.1rem' }}>
          <h3 style={{ marginBottom: 8 }}>Biblioteca</h3>
          <p style={{ fontSize: '0.9rem' }}>
            {tracks.length} pistas · {playlists.length} listas
          </p>
          <button
            type="button"
            className="glass-button secondary"
            style={{ marginTop: 10, fontSize: '0.85rem' }}
            onClick={() => {
              soundClick()
              setPlayerHidden((v) => !v)
            }}
          >
            {playerHidden ? 'Mostrar reproductor' : 'Ocultar reproductor'}
          </button>
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
        paddingBottom: playerHidden
          ? 'calc(5.5rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(8.5rem + env(safe-area-inset-bottom, 0px))',
        maxWidth: 1100,
      }}
    >
      <style>{`
        .gco-music-layout { display: block; }
        .gco-music-side { display: none; }
        .gco-music-bottom-nav { display: flex; }
        @media (min-width: 900px) {
          .gco-music-layout {
            display: grid;
            grid-template-columns: 240px 1fr;
            gap: 1.25rem;
            align-items: start;
          }
          .gco-music-side { display: block; position: sticky; top: 1rem; }
          .gco-music-bottom-nav { display: none; }
        }
      `}</style>

      {header}

      <div className="gco-music-layout">
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
                  if (t.id !== 'playlists') setPlDetailId(null)
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
        </aside>
        <main style={{ minWidth: 0 }}>{mainContent}</main>
      </div>

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
              width: 'min(440px, 100%)',
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
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {editing.coverDataUrl ? (
                <img
                  src={editing.coverDataUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                '🎵'
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
                onCover(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <label
              style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}
            >
              Título
            </label>
            <input
              className="glass-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label
              style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}
            >
              Artista
            </label>
            <input
              className="glass-input"
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label
              style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}
            >
              Álbum
            </label>
            <input
              className="glass-input"
              value={editAlbum}
              onChange={(e) => setEditAlbum(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label
              style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}
            >
              Año
            </label>
            <input
              className="glass-input"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label
              style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}
            >
              Letra
            </label>
            <textarea
              className="glass-input"
              value={editLyrics}
              onChange={(e) => setEditLyrics(e.target.value)}
              rows={6}
              style={{ marginBottom: 12, resize: 'vertical', lineHeight: 1.45 }}
              placeholder="Pega la letra aquí…"
            />
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: 12,
              }}
            >
              {formatBytes(editing.sizeBytes)} ·{' '}
              {formatTrackTime(editing.durationMs)} · {editing.mime}
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

      <nav
        className="gco-music-bottom-nav"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background:
            'color-mix(in srgb, var(--gco-bg, #0B1220) 72%, transparent)',
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
                  if (t.id !== 'playlists') setPlDetailId(null)
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

      {!playerHidden && <PlayerBar player={player} />}
    </div>
  )
}