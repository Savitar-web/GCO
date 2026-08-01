import { useEffect, useRef, useState } from 'react'
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
  formatTrackTime,
  type TrackItem,
  type Playlist,
} from '@/core/storage/mediaLibrary'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { PlayerBar } from './PlayerBar'

export function MusicaHome() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [sortAlpha, setSortAlpha] = useState(false)
  const [activePl, setActivePl] = useState<string | null>(null)
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

  const visible = (() => {
    let list = [...tracks]
    if (activePl) {
      const pl = playlists.find((p) => p.id === activePl)
      if (pl) {
        list = pl.trackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter(Boolean) as TrackItem[]
      }
    }
    if (sortAlpha) {
      list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    }
    return list
  })()

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const isAudio =
        file.type.startsWith('audio/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name)
      const isVideo =
        file.type.startsWith('video/') || /\.(mp4|webm|mkv)$/i.test(file.name)
      if (!isAudio && !isVideo) {
        soundFail()
        continue
      }
      // Navegador: para video usamos el archivo tal cual; el elemento Audio
      // puede fallar. Preferimos audio. Si es video, intentamos igual.
      try {
        await importTrackFile(file)
        soundSuccess()
      } catch {
        soundFail()
      }
    }
    await refresh()
  }

  const playAll = (list: TrackItem[], start?: TrackItem) => {
    if (!list.length) return
    player.setQueue(list)
    void player.playTrack(start ?? list[0], list)
  }

  return (
    <div className="app-shell" style={{ paddingBottom: 96 }}>
      <header
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 1.85rem)' }}>
            🎵 Música
          </h1>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            Biblioteca offline · playlists · segundo plano (web)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ModeSwitch />
          <ThemeToggle />
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <GlassButton
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        >
          + Importar audio
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
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setSortAlpha((v) => !v)
          }}
        >
          {sortAlpha ? 'Orden: A–Z' : 'Orden: reciente'}
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            void createPlaylist(`Lista ${playlists.length + 1}`).then(refresh)
          }}
        >
          + Playlist
        </button>
      </div>

      {playlists.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            className={`glass-button ${!activePl ? '' : 'secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
            onClick={() => {
              soundClick()
              setActivePl(null)
            }}
          >
            Todas
          </button>
          {playlists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              className={`glass-button ${activePl === pl.id ? '' : 'secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
              onClick={() => {
                soundClick()
                setActivePl(pl.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (confirm(`¿Borrar playlist “${pl.name}”?`)) {
                  void deletePlaylist(pl.id).then(() => {
                    setActivePl(null)
                    void refresh()
                  })
                }
              }}
            >
              {pl.name} ({pl.trackIds.length})
            </button>
          ))}
        </div>
      )}

      <GlassCard>
        <div style={{ padding: '0.5rem 0' }}>
          {visible.length === 0 && (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                padding: '1.5rem',
              }}
            >
              Importa mp3, m4a, wav… (o mp4; mejor audio puro)
            </p>
          )}
          {visible.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--gco-glass-border)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  playAll(visible, t)
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
                }}
              >
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t.title}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                  {t.artist} · {formatTrackTime(t.durationMs)}
                </p>
              </button>
              {activePl && (
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => {
                    soundClick()
                    const pl = playlists.find((p) => p.id === activePl)
                    if (!pl) return
                    void savePlaylist({
                      ...pl,
                      trackIds: pl.trackIds.filter((x) => x !== t.id),
                    }).then(refresh)
                  }}
                >
                  Quitar
                </button>
              )}
              {!activePl && playlists[0] && (
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => {
                    soundClick()
                    const pl = playlists[0]
                    if (pl.trackIds.includes(t.id)) return
                    void savePlaylist({
                      ...pl,
                      trackIds: [...pl.trackIds, t.id],
                    }).then(refresh)
                  }}
                >
                  + Lista
                </button>
              )}
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                onClick={() => {
                  soundClick()
                  void deleteTrack(t.id).then(refresh)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

      {visible.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <GlassButton onClick={() => playAll(visible)}>
            Reproducir lista
          </GlassButton>
        </div>
      )}

      <PlayerBar player={player} />
    </div>
  )
}