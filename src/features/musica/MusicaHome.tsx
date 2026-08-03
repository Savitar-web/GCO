import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModeSwitch } from '@/components/ui/ModeSwitch'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { GlassButton } from '@/components/ui/GlassButton'
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
type LibFilter = 'recents' | 'favorites'

type TrackMenuState = {
  track: TrackItem
  x: number
  y: number
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const FAV_KEY = 'gco:music-favorites'
const SPEC_STYLES: SpecStyle[] = ['bars', 'wave', 'sphere', 'mirror', 'pulse']
const SPEC_STYLE_LABELS: Record<SpecStyle, string> = {
  bars: 'Barras',
  wave: 'Onda',
  sphere: 'Esfera',
  mirror: 'Espejo',
  pulse: 'Pulso',
}

function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveFavs(ids: string[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids))
}

const NavIcon = {
  library: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 14v-2a8 8 0 0116 0v2" />
      <rect x="2" y="14" width="5" height="6" rx="1.5" />
      <rect x="17" y="14" width="5" height="6" rx="1.5" />
    </svg>
  ),
  playlists: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  now: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" />
    </svg>
  ),
  import: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  ),
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  ),
}

const BOTTOM_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'library', label: 'Biblioteca', icon: NavIcon.library },
  { id: 'playlists', label: 'Listas', icon: NavIcon.playlists },
  { id: 'now', label: 'Reproduciendo', icon: NavIcon.now },
  { id: 'import', label: 'Importar', icon: NavIcon.import },
  { id: 'more', label: 'Más', icon: NavIcon.more },
]

const LAYOUT_CSS = `
.gco-music-root { min-height: 100dvh; color: var(--gco-ink); }
.gco-music-shell {
  display: flex; flex-direction: column; min-height: 100dvh;
  width: 100%; margin: 0; padding: 0 0.65rem;
}
.gco-music-sidebar { display: none; }
.gco-music-bottom-nav { display: block; }
.gco-music-desktop-top { display: none; }
.gco-music-mobile-header { display: block; }
.gco-music-table-head { display: none; }
.gco-music-song-artist-col { display: none; }
.gco-music-song-idx { display: none; }
.gco-music-song-subtitle-mobile { display: block; }

.gco-song-row { transition: background-color 0.15s ease; border-radius: 12px; }
.gco-song-row:hover { background: var(--gco-glass-bg, rgba(255,255,255,0.05)); }
.gco-hover-card { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
.gco-hover-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.22); }
.gco-icon-btn { transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease; }
.gco-icon-btn:hover { background: var(--gco-glass-bg, rgba(255,255,255,0.08)); }
.gco-icon-btn:active { transform: scale(0.94); }
.gco-dropzone { transition: border-color 0.15s ease, background-color 0.15s ease; }
.gco-dropzone.is-active {
  border-color: var(--gco-primary) !important;
  background: color-mix(in srgb, var(--gco-primary) 10%, transparent) !important;
}

/* Scrollbars finas y casi imperceptibles, siempre respetando el tema */
.gco-scroll-x, .gco-scroll-y {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--gco-ink) 22%, transparent) transparent;
}
.gco-scroll-x::-webkit-scrollbar { height: 5px; }
.gco-scroll-y::-webkit-scrollbar { width: 5px; }
.gco-scroll-x::-webkit-scrollbar-track,
.gco-scroll-y::-webkit-scrollbar-track { background: transparent; }
.gco-scroll-x::-webkit-scrollbar-thumb,
.gco-scroll-y::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--gco-ink) 20%, transparent);
  border-radius: 999px;
}
.gco-scroll-x::-webkit-scrollbar-thumb:hover,
.gco-scroll-y::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--gco-ink) 38%, transparent);
}

@media (min-width: 960px) {
  .gco-music-shell {
    width: 100%; margin: 0; padding: 0;
    display: grid; grid-template-columns: 232px 1fr; min-height: 100dvh;
  }
  .gco-music-sidebar {
    display: flex; flex-direction: column; gap: 0.35rem;
    padding: 1.25rem 0.85rem;
    border-right: 1px solid var(--gco-glass-border);
    background: color-mix(in srgb, var(--gco-bg, #0B1220) 92%, transparent);
    position: sticky; top: 0; height: 100dvh; overflow: auto;
  }
  .gco-music-main {
    display: flex; flex-direction: column; min-width: 0;
    padding: 1.25rem 1.75rem 5.5rem;
  }
  .gco-music-bottom-nav { display: none !important; }
  .gco-music-mobile-header { display: none !important; }
  .gco-music-desktop-top {
    display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.35rem;
  }
  .gco-music-table-head {
    display: grid; grid-template-columns: 34px 44px minmax(0,1.4fr) minmax(0,1fr) 72px 34px 34px; gap: 10px;
    padding: 0.5rem 0.9rem; font-size: 0.74rem; color: var(--gco-ink-muted);
    text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid var(--gco-glass-border); margin-bottom: 4px;
  }
  .gco-music-song-row-desktop {
    display: grid !important;
    grid-template-columns: 34px 44px minmax(0,1.4fr) minmax(0,1fr) 72px 34px 34px;
    gap: 10px; align-items: center;
    padding: 0.55rem 0.9rem !important;
  }
  .gco-music-song-artist-col {
    display: block; font-size: 0.85rem; color: var(--gco-ink-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gco-music-song-idx { display: block; font-size: 0.8rem; color: var(--gco-ink-muted); text-align: center; }
  .gco-music-song-subtitle-mobile { display: none; }
  .gco-music-player-dock { left: 232px !important; }
}

@media (min-width: 1280px) {
  .gco-music-main { padding: 1.5rem 2.25rem 5.5rem; }
}
`

/* --- COMPONENTE IMPORT PANEL EXTRAIDO Y REPARADO --- */
function ImportPanelComponent({
  onImport,
  tracks,
}: {
  onImport: (files: File[] | FileList) => Promise<void>
  tracks: TrackItem[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropActive, setDropActive] = useState(false)

  // Búsqueda / URL de YouTube
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<
    { id: string; title: string; url: string }[]
  >([])
  const [searchError, setSearchError] = useState<string | null>(null)

  // Modal de descarga
  const [selectedYt, setSelectedYt] = useState<{
    id: string
    title: string
    url: string
  } | null>(null)
  const [ytName, setYtName] = useState('')
  /** true = MP3 (audio) · false = MP4 (vídeo) */
  const [isAudioOnly, setIsAudioOnly] = useState(true)
  const [dlDevice, setDlDevice] = useState(false)
  const [dlCache, setDlCache] = useState(true)
  const [showDuplicateWarn, setShowDuplicateWarn] = useState(false)

  // Progreso
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState({
    metadata: 0,
    download: 0,
    import: 0,
  })
  const [dlStatus, setDlStatus] = useState('')
  const [dlError, setDlError] = useState<string | null>(null)

  /** Base del backend de descargas (local o desplegado). */
  const API_BASE =
    (typeof localStorage !== 'undefined' &&
      localStorage.getItem('gco:yt-api')) ||
    (import.meta as { env?: { VITE_YT_API?: string } }).env?.VITE_YT_API ||
    'http://localhost:3001'

  const isYoutubeUrl = (q: string) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(q.trim())

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setIsSearching(true)
    setSearchError(null)
    setSearchResults([])
    soundClick()

    // Si pegan una URL de YouTube, va directo al modal de descarga
    if (isYoutubeUrl(q)) {
      const title = q
        .replace(/^https?:\/\//, '')
        .slice(0, 80)
      const item = { id: `url-${Date.now()}`, title, url: q }
      setSearchResults([item])
      setIsSearching(false)
      openDownloadModal(item)
      return
    }

    // Intento de búsqueda vía backend (si existe /buscar)
    try {
      const res = await fetch(
        `${API_BASE}/buscar?q=${encodeURIComponent(q)}`,
        { method: 'GET' }
      )
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { id: string; title: string; url: string }[]
        }
        if (data.results && data.results.length > 0) {
          setSearchResults(data.results)
          setIsSearching(false)
          return
        }
      }
    } catch {
      /* backend de búsqueda opcional */
    }

    // Fallback local: trata el texto como consulta + sugerencia de pegar URL
    setSearchResults([
      {
        id: '1',
        title: `${q} (pega la URL completa de YouTube para descargar)`,
        url: q,
      },
      {
        id: '2',
        title: `Usar como URL directa: ${q}`,
        url: q.startsWith('http') ? q : `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      },
    ])
    setIsSearching(false)
  }

  const openDownloadModal = (song: {
    id: string
    title: string
    url: string
  }) => {
    soundClick()
    setYtName(song.title)
    setSelectedYt(song)
    setDlError(null)
    const isDuplicate = tracks.some(
      (s) => s.title.toLowerCase() === song.title.toLowerCase()
    )
    setShowDuplicateWarn(isDuplicate)
  }

  const startDownload = async () => {
    if (!selectedYt) return
    if (!dlDevice && !dlCache) {
      soundFail()
      setDlError('Elige al menos: dispositivo o caché de la app.')
      return
    }
    if (!isYoutubeUrl(selectedYt.url) && !selectedYt.url.startsWith('http')) {
      soundFail()
      setDlError(
        'Necesitas una URL válida de YouTube (youtube.com o youtu.be). Pégala en el buscador.'
      )
      return
    }

    soundClick()
    const song = selectedYt
    const name = (ytName || song.title || 'media').replace(
      /[\\/:*?"<>|]+/g,
      '_'
    )
    const formato = isAudioOnly ? 'mp3' : 'mp4'
    setSelectedYt(null)
    setIsDownloading(true)
    setDlError(null)
    setDlStatus('Conectando con el servidor…')
    setProgress({ metadata: 10, download: 0, import: 0 })

    try {
      setDlStatus('Solicitando metadatos y descarga…')
      setProgress((p) => ({ ...p, metadata: 40 }))

      const response = await fetch(`${API_BASE}/descargar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: song.url,
          formato,
          title: name,
        }),
      })

      setProgress((p) => ({ ...p, metadata: 100, download: 30 }))

      if (!response.ok) {
        const msg = await response.text().catch(() => '')
        throw new Error(
          msg || `Error del servidor (${response.status}). ¿Está en marcha el backend en ${API_BASE}?`
        )
      }

      setDlStatus('Recibiendo archivo…')
      const blob = await response.blob()
      setProgress((p) => ({ ...p, download: 100 }))

      const mime =
        formato === 'mp3'
          ? 'audio/mpeg'
          : blob.type || 'video/mp4'
      const ext = formato === 'mp3' ? 'mp3' : 'mp4'
      const fileName = `${name}.${ext}`

      // Descomprimir ZIP si el servidor envía archiver
      let mediaBlob = blob
      let mediaName = fileName
      if (
        blob.type.includes('zip') ||
        (response.headers.get('content-disposition') || '').includes('.zip')
      ) {
        setDlStatus('Extrayendo del ZIP…')
        // Sin dependencia de JSZip: si es ZIP pequeño de un solo archivo,
        // el servidor idealmente envía el binario directo. Fallback: guardar ZIP.
        mediaName = `${name}.zip`
      }

      if (dlDevice) {
        setDlStatus('Guardando en el dispositivo…')
        const url = URL.createObjectURL(mediaBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = mediaName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }

      if (dlCache) {
        setDlStatus('Importando al reproductor…')
        setProgress((p) => ({ ...p, import: 40 }))
        const file = new File([mediaBlob], mediaName.endsWith('.zip') ? fileName : mediaName, {
          type: mime,
        })
        await onImport([file])
        setProgress((p) => ({ ...p, import: 100 }))
      }

      soundSuccess()
      setDlStatus('Listo.')
    } catch (err) {
      soundFail()
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo descargar. Revisa que el servidor (yt-dlp) esté activo.'
      setDlError(message)
      setDlStatus('')
    } finally {
      setIsDownloading(false)
      window.setTimeout(() => {
        setProgress({ metadata: 0, download: 0, import: 0 })
        setDlStatus('')
      }, 1800)
    }
  }

  const onExportZip = () => {
    soundClick()
    const data = JSON.stringify(
      tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        year: t.year,
        durationMs: t.durationMs,
        sizeBytes: t.sizeBytes,
        mime: t.mime,
      })),
      null,
      2
    )
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gco-musica-biblioteca.json'
    a.click()
    URL.revokeObjectURL(url)
    soundSuccess()
  }

  const liquidGlassStyle: React.CSSProperties = {
    background: 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--gco-glass-border, rgba(255,255,255,0.1))',
    borderRadius: 16,
    padding: '1.2rem',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
  }

  const switchTrack = (on: boolean): React.CSSProperties => ({
    width: 52,
    height: 30,
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    background: on ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s ease',
  })

  const switchKnob = (on: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 3,
    left: on ? 24 : 3,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
  })

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative',
      }}
    >
      {/* Buscador liquid glass */}
      <div
        className="glass-card"
        style={{
          ...liquidGlassStyle,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="Pega URL de YouTube o busca…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          style={{
            flex: 1,
            minWidth: 180,
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid var(--gco-glass-border)',
            color: 'inherit',
            padding: '10px 15px',
            borderRadius: 999,
            outline: 'none',
            fontSize: '0.9rem',
          }}
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          style={{
            padding: '10px 20px',
            borderRadius: 999,
            background: 'var(--gco-primary)',
            color: 'var(--gco-on-primary, #0B1220)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          {isSearching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {searchError && (
        <p style={{ color: 'var(--gco-secondary)', fontSize: '0.85rem', margin: 0 }}>
          {searchError}
        </p>
      )}

      {searchResults.length > 0 && (
        <div
          className="glass-card"
          style={{
            ...liquidGlassStyle,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Resultados</h3>
          {searchResults.map((song) => (
            <div
              key={song.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                background: 'var(--gco-glass-bg, rgba(255,255,255,0.05))',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: 0 }}>
                {song.title}
              </span>
              <button
                type="button"
                onClick={() => openDownloadModal(song)}
                style={{
                  background: 'var(--gco-primary)',
                  color: 'var(--gco-on-primary, #0B1220)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Descargar
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onExportZip}
        className="glass-card gco-hover-card"
        style={{
          ...liquidGlassStyle,
          padding: 12,
          cursor: 'pointer',
          textAlign: 'center',
          fontWeight: 'bold',
          background:
            'color-mix(in srgb, var(--gco-primary) 15%, transparent)',
          color: 'var(--gco-primary)',
          border: '1px solid var(--gco-primary)',
        }}
      >
        📦 Exportar metadatos de la biblioteca
      </button>

      {/* Drop local */}
      <div
        className={`glass-card gco-dropzone${dropActive ? ' is-active' : ''}`}
        style={{
          padding: '2.4rem 1.4rem',
          textAlign: 'center',
          border: '1.5px dashed var(--gco-glass-border)',
          borderRadius: 16,
          background: dropActive
            ? 'var(--gco-glass-bg, rgba(255,255,255,0.1))'
            : 'transparent',
          transition: 'all 0.2s ease',
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDropActive(true)
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropActive(false)
          void onImport(e.dataTransfer.files)
        }}
      >
        <p style={{ fontSize: '2.6rem', margin: '0 0 10px' }} aria-hidden>
          ⬇️
        </p>
        <h2 style={{ margin: '0 0 8px', fontWeight: 800 }}>
          Importar audio local
        </h2>
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.9rem',
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          Arrastra archivos o elige desde el dispositivo
          <br />
          MP3, M4A, AAC, WAV, OGG, FLAC · MP4 / WebM
        </p>
        <button
          type="button"
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
          style={{
            padding: '10px 24px',
            borderRadius: 999,
            background: 'var(--gco-glass-bg, rgba(255,255,255,0.1))',
            color: 'inherit',
            border: '1px solid var(--gco-glass-border)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Elegir archivos
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.aac,.wav,.ogg,.flac"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void onImport(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <p
        style={{
          fontSize: '0.78rem',
          color: 'var(--gco-ink-muted)',
          margin: 0,
          lineHeight: 1.45,
        }}
      >
        Descarga de Youtube con enlaces URL.
      </p>

      {/* Modal descarga */}
      {selectedYt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(5px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setSelectedYt(null)}
        >
          <div
            className="glass-card"
            style={{
              ...liquidGlassStyle,
              width: 'min(90%, 400px)',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>
              Preparar descarga
            </h2>

            {showDuplicateWarn && (
              <div
                style={{
                  background:
                    'color-mix(in srgb, var(--gco-secondary, #ff6b6b) 20%, transparent)',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 15,
                  color: 'var(--gco-secondary, #ff6b6b)',
                  fontSize: '0.85rem',
                  border: '1px solid var(--gco-secondary, #ff6b6b)',
                }}
              >
                Ya tienes una canción con un nombre parecido. ¿Descargar de
                nuevo?
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 15 }}>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--gco-ink-muted)',
                  fontWeight: 600,
                }}
              >
                Nombre del archivo
              </span>
              <input
                type="text"
                value={ytName}
                onChange={(e) => setYtName(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.2)',
                  color: 'inherit',
                  border: '1px solid var(--gco-glass-border)',
                  outline: 'none',
                }}
              />
            </label>

            {/* Switch MP3 / MP4 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: 12,
                border: '1px solid var(--gco-glass-border)',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem' }}>
                  Formato: {isAudioOnly ? 'MP3 (solo audio)' : 'MP4 (vídeo)'}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  {isAudioOnly
                    ? 'Extrae la pista de audio con yt-dlp'
                    : 'Mejor vídeo + audio en MP4'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isAudioOnly}
                aria-label="Cambiar entre MP3 y MP4"
                onClick={() => {
                  soundClick()
                  setIsAudioOnly((v) => !v)
                }}
                style={switchTrack(isAudioOnly)}
              >
                <span style={switchKnob(isAudioOnly)} />
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 16,
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
              }}
            >
              <span
                style={{
                  fontWeight: isAudioOnly ? 700 : 500,
                  color: isAudioOnly ? 'var(--gco-primary)' : undefined,
                }}
              >
                MP3
              </span>
              <span>/</span>
              <span
                style={{
                  fontWeight: !isAudioOnly ? 700 : 500,
                  color: !isAudioOnly ? 'var(--gco-primary)' : undefined,
                }}
              >
                MP4
              </span>
            </div>

            {/* Destinos */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                    Guardar en el dispositivo
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '0.75rem',
                      color: 'var(--gco-ink-muted)',
                    }}
                  >
                    Descarga el archivo a tu carpeta de descargas
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dlDevice}
                  onClick={() => {
                    soundClick()
                    setDlDevice((v) => !v)
                  }}
                  style={switchTrack(dlDevice)}
                >
                  <span style={switchKnob(dlDevice)} />
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                    Añadir al reproductor
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '0.75rem',
                      color: 'var(--gco-ink-muted)',
                    }}
                  >
                    Importa al caché IndexedDB de GCO
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dlCache}
                  onClick={() => {
                    soundClick()
                    setDlCache((v) => !v)
                  }}
                  style={switchTrack(dlCache)}
                >
                  <span style={switchKnob(dlCache)} />
                </button>
              </div>
            </div>

            {dlError && (
              <p
                style={{
                  color: 'var(--gco-secondary)',
                  fontSize: '0.85rem',
                  marginBottom: 12,
                }}
              >
                {dlError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  setSelectedYt(null)
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'inherit',
                  border: '1px solid var(--gco-glass-border)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void startDownload()}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--gco-primary)',
                  color: 'var(--gco-on-primary, #0B1220)',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Descargar {isAudioOnly ? 'MP3' : 'MP4'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progreso */}
      {isDownloading && (
        <div
          className="glass-card"
          style={{ ...liquidGlassStyle, textAlign: 'center' }}
        >
          <p
            style={{
              color: 'var(--gco-primary)',
              fontWeight: 700,
              margin: '0 0 12px',
            }}
          >
            {dlStatus || 'Procesando…'}
          </p>
          {(
            [
              ['Metadatos', progress.metadata],
              ['Descarga', progress.download],
              ['Importar', progress.import],
            ] as const
          ).map(([label, pct]) => (
            <div key={label} style={{ marginBottom: 10, textAlign: 'left' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.78rem',
                  marginBottom: 4,
                }}
              >
                <span>{label}</span>
                <span className="mono">{pct}%</span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--gco-primary)',
                    transition: 'width 0.2s ease-out',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {dlError && !selectedYt && !isDownloading && (
        <p
          style={{
            color: 'var(--gco-secondary)',
            fontSize: '0.85rem',
            margin: 0,
          }}
        >
          {dlError}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------- */
/* -------------------------------------------------------- */

export function MusicaHome() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const dragId = useRef<string | null>(null)

  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [favorites, setFavorites] = useState<string[]>(() => loadFavs())
  const [libFilter, setLibFilter] = useState<LibFilter>('recents')
  const [plDetailId, setPlDetailId] = useState<string | null>(null)
  const [addToPlOpen, setAddToPlOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('library')
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editYear, setEditYear] = useState('')
  const [editAlbum, setEditAlbum] = useState('')
  const [editLyrics, setEditLyrics] = useState('')
  const [search, setSearch] = useState('')
  const [playerHidden, setPlayerHidden] = useState(false)
  const [showLyrics, setShowLyrics] = useState(true)
  const [volumeBoost, setVolumeBoost] = useState(100)
  const [dropActive, setDropActive] = useState(false)

  const [menu, setMenu] = useState<TrackMenuState | null>(null)
  const [assignTrack, setAssignTrack] = useState<TrackItem | null>(null)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [metaTrack, setMetaTrack] = useState<TrackItem | null>(null)
  const [newPlDraft, setNewPlDraft] = useState('')

  const [specColor, setSpecColor] = useState('#22E6C5')
  const [specColorB, setSpecColorB] = useState('#8B5CF6')
  const [specColorC, setSpecColorC] = useState('#F472B6')
  const [specStyle, setSpecStyle] = useState<SpecStyle>('sphere')
  const [specMulti, setSpecMulti] = useState<1 | 2 | 3>(2)
  const [specParticles, setSpecParticles] = useState(true)
  const [specGlow, setSpecGlow] = useState(true)
  const [progressColor, setProgressColor] = useState(() => getBarPrefs().progressColor)

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

  useEffect(() => {
    const gain = Math.min(3, Math.max(0, volumeBoost / 100))
    if (typeof player.setGain === 'function') player.setGain(gain)
    else player.setVolume?.(Math.min(1, gain))
  }, [volumeBoost, player])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [menu])

  const plDetail = plDetailId
    ? (playlists.find((p) => p.id === plDetailId) ?? null)
    : null

  const plTracks = useMemo(() => {
    if (!plDetail) return []
    return plDetail.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter(Boolean) as TrackItem[]
  }, [plDetail, tracks])

  const filteredTracks = useMemo(() => {
    let list = [...tracks]
    if (libFilter === 'favorites') list = list.filter((t) => favorites.includes(t.id))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [tracks, libFilter, favorites, search])

  const recentTracks = useMemo(() => filteredTracks.slice(0, 8), [filteredTracks])
  const editing = editId ? tracks.find((t) => t.id === editId) : null
  const current = player.track

  const toggleFav = (id: string) => {
    soundClick()
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      saveFavs(next)
      return next
    })
  }

  const createNamedPlaylist = async (preferredName?: string) => {
    const name =
      preferredName?.trim() ||
      prompt('Nombre de la lista de reproducción')?.trim()
    if (!name) return null
    const pl = await createPlaylist(name)
    soundSuccess()
    await refresh()
    return pl
  }

  const onImport = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : []
    if (!list.length) return
    for (const file of list) {
      const ok =
        file.type.startsWith('audio/') ||
        file.type.startsWith('video/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus|mp4|webm)$/i.test(file.name)
      if (!ok) {
        soundFail()
        continue
      }
      try {
        const t = await importTrackFile(file)
        soundSuccess()
        if (playlists.length > 0) {
          setAssignTrack(t)
          setAssignIds([])
          setNewPlDraft('')
        }
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
    setPlayerHidden(false)
  }

  const playNext = (t: TrackItem) => {
    const anyP = player as {
      track: TrackItem | null
      setQueue: (q: TrackItem[]) => void
      getQueue?: () => TrackItem[]
      playTrack: (t: TrackItem, list?: TrackItem[]) => void | Promise<void>
    }
    const q = typeof anyP.getQueue === 'function' ? [...anyP.getQueue()] : []
    const cur = anyP.track
    if (!cur) {
      anyP.setQueue([t])
      void anyP.playTrack(t, [t])
    } else {
      const i = q.findIndex((x) => x.id === cur.id)
      const base = i >= 0 ? q : [cur]
      const at = i >= 0 ? i : 0
      const next = [
        ...base.slice(0, at + 1),
        t,
        ...base.slice(at + 1).filter((x) => x.id !== t.id),
      ]
      anyP.setQueue(next)
    }
    soundSuccess()
  }

  const openEdit = (t: TrackItem) => {
    soundClick()
    setMenu(null)
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

  const addTrackToPlaylist = async (trackId: string, playlistId: string) => {
    const pl = playlists.find((p) => p.id === playlistId) ?? plDetail
    if (!pl) return
    if (pl.trackIds.includes(trackId)) return
    await savePlaylist({ ...pl, trackIds: [...pl.trackIds, trackId] })
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

  const confirmAssign = async () => {
    if (!assignTrack) return
    let ids = [...assignIds]
    if (newPlDraft.trim()) {
      const pl = await createPlaylist(newPlDraft.trim())
      ids = [...ids, pl.id]
    }
    const latest = await listPlaylists()
    for (const pid of ids) {
      const pl = latest.find((p) => p.id === pid)
      if (!pl || pl.trackIds.includes(assignTrack.id)) continue
      await savePlaylist({ ...pl, trackIds: [...pl.trackIds, assignTrack.id] })
    }
    setAssignTrack(null)
    setAssignIds([])
    setNewPlDraft('')
    await refresh()
    soundSuccess()
  }

  const openMenu = (t: TrackItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    soundClick()
    const pad = 8
    const menuW = 260
    const menuH = 360
    let x = e.clientX
    let y = e.clientY
    if (x + menuW > window.innerWidth - pad) x = window.innerWidth - menuW - pad
    if (y + menuH > window.innerHeight - pad) y = window.innerHeight - menuH - pad
    setMenu({ track: t, x: Math.max(pad, x), y: Math.max(pad, y) })
  }

  /* ── Header ── */
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: 0,
              fontWeight: 800,
              letterSpacing: '-0.01em',
            }}
          >
            <span style={{ opacity: 0.9 }} aria-hidden>
              🎵
            </span>{' '}
            Música
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
            className="theme-cycle-btn gco-icon-btn"
            aria-label={playerHidden ? 'Mostrar reproductor' : 'Ocultar reproductor'}
            title={playerHidden ? 'Mostrar reproductor' : 'Ocultar reproductor'}
            onClick={() => {
              soundClick()
              setPlayerHidden((v) => !v)
            }}
            style={{ width: 44, height: 44, padding: 0, borderRadius: 12, fontSize: '0.9rem' }}
          >
            {playerHidden ? '▲' : '▼'}
          </button>
          <button
            type="button"
            className="theme-cycle-btn gco-icon-btn"
            aria-label="Abrir ajustes"
            onClick={() => {
              soundClick()
              navigate('/ajustes')
            }}
            style={{ width: 44, height: 44, padding: 0, borderRadius: 12 }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
              <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
              <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
            </span>
          </button>
        </div>
      </div>
      <div className="mode-switch-mobile" style={{ marginTop: '0.75rem' }}>
        <ModeSwitch fullWidth />
      </div>
    </header>
  )

  const recentCard = (t: TrackItem) => (
    <div
      key={t.id}
      className="glass-card gco-hover-card"
      style={{
        minWidth: 250,
        maxWidth: 270,
        padding: '0.8rem',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexShrink: 0,
        border: '1px solid var(--gco-glass-border)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(filteredTracks, t)
        }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          overflow: 'hidden',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {t.coverDataUrl ? (
          <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          '🎵'
        )}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t.title}
        </p>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--gco-ink-muted)',
            margin: '2px 0 6px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t.artist}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--gco-ink-muted)', margin: 0 }}>
          {formatTrackTime(t.durationMs)}
          {t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ''}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => {
              soundClick()
              playAll(filteredTracks, t)
            }}
            aria-label="Reproducir"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--gco-primary)',
              color: 'var(--gco-on-primary, #0B1220)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            ▶
          </button>
          <div
            style={{
              flex: 1,
              height: 3,
              borderRadius: 99,
              background: 'var(--gco-glass-border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width:
                  current?.id === t.id && player.durationMs
                    ? `${Math.min(100, (player.currentMs / player.durationMs) * 100)}%`
                    : '0%',
                height: '100%',
                background: 'var(--gco-primary)',
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label="Opciones"
        className="gco-icon-btn"
        onClick={(e) => openMenu(t, e)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--gco-ink-muted)',
          cursor: 'pointer',
          fontSize: '1.15rem',
          padding: 4,
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        ⋮
      </button>
    </div>
  )

  const songRow = (t: TrackItem, opts?: { inPlaylist?: boolean; index?: number }) => (
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
      className="gco-song-row gco-music-song-row-desktop"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0.6rem 0.4rem',
        borderBottom: '1px solid var(--gco-glass-border)',
        cursor: opts?.inPlaylist ? 'grab' : undefined,
      }}
    >
      {opts?.inPlaylist ? (
        <span
          style={{ color: 'var(--gco-ink-muted)', userSelect: 'none', textAlign: 'center', fontSize: '0.9rem' }}
          aria-hidden
        >
          ⠿
        </span>
      ) : (
        <span className="gco-music-song-idx">{opts?.index ?? ''}</span>
      )}
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(opts?.inPlaylist ? plTracks : filteredTracks, t)
        }}
        aria-label={`Reproducir ${t.title}`}
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          overflow: 'hidden',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {t.coverDataUrl ? (
          <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          '🎵'
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          soundClick()
          playAll(opts?.inPlaylist ? plTracks : filteredTracks, t)
        }}
        style={{
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
            fontSize: '0.92rem',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t.title}
        </p>
        <p className="gco-music-song-subtitle-mobile" style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', margin: '2px 0 0' }}>
          {t.artist}
        </p>
      </button>
      <span className="gco-music-song-artist-col">{t.artist}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', flexShrink: 0, textAlign: 'right' }}>
        {formatTrackTime(t.durationMs)}
      </span>
      <button
        type="button"
        onClick={() => toggleFav(t.id)}
        className="gco-icon-btn"
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '1rem',
          color: favorites.includes(t.id) ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
          borderRadius: 8,
          padding: 4,
        }}
        title="Favorito"
        aria-label="Favorito"
      >
        {favorites.includes(t.id) ? '♥' : '♡'}
      </button>
      <button
        type="button"
        aria-label="Opciones"
        className="gco-icon-btn"
        onClick={(e) => openMenu(t, e)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--gco-ink-muted)',
          cursor: 'pointer',
          fontSize: '1.15rem',
          borderRadius: 8,
          padding: 4,
        }}
      >
        ⋮
      </button>
      {opts?.inPlaylist && (
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.7rem', padding: '0.25rem 0.45rem', gridColumn: '1 / -1', justifySelf: 'end' }}
          onClick={() => void removeFromPlaylist(t.id)}
        >
          Quitar
        </button>
      )}
    </div>
  )

  /* ── Biblioteca ── */
  const libraryPanel = (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.65rem 1rem',
            borderRadius: 999,
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg, rgba(255,255,255,0.04))',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span style={{ opacity: 0.5 }} aria-hidden>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canciones, artistas o álbumes"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              outline: 'none',
              fontSize: '0.9rem',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(
          [
            { id: 'recents' as const, label: 'Recientes', icon: '🕒' },
            { id: 'favorites' as const, label: 'Favoritos', icon: '♡' },
          ] as const
        ).map((c) => {
          const on = libFilter === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                soundClick()
                setLibFilter(c.id)
              }}
              style={{
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0.5rem 1rem',
                borderRadius: 999,
                background: on ? 'var(--gco-primary)' : 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
                color: on ? 'var(--gco-on-primary, #0B1220)' : 'var(--gco-ink-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          )
        })}
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px', fontWeight: 700 }}>Reproduciendo recientemente</h2>
      <div
        className="gco-scroll-x"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 26,
        }}
      >
        {recentTracks.length === 0 ? (
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            Importa audio para verlo aquí.
          </p>
        ) : (
          recentTracks.map(recentCard)
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Listas de reproducción</h2>
        <button
          type="button"
          className="gco-icon-btn"
          onClick={() => {
            soundClick()
            setTab('playlists')
            setPlDetailId(null)
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--gco-ink-muted)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            borderRadius: 8,
            padding: '2px 8px',
          }}
          aria-label="Ver todas las listas"
        >
          ›
        </button>
      </div>
      <div className="gco-scroll-x" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 26 }}>
        <button
          type="button"
          onClick={() => {
            soundClick()
            setTab('library')
            setLibFilter('favorites')
          }}
          className="glass-card gco-hover-card"
          style={{
            minWidth: 116,
            width: 116,
            padding: '0.65rem',
            border: '1px solid var(--gco-glass-border)',
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'left',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 12,
              background:
                'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--gco-primary) 35%, transparent), var(--gco-glass-bg))',
              border: '1px solid var(--gco-glass-border)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '2rem',
              marginBottom: 8,
              color: 'var(--gco-primary)',
            }}
          >
            ♥
          </div>
          <p style={{ fontWeight: 700, fontSize: '0.82rem', margin: 0 }}>Favoritos</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', margin: '2px 0 0' }}>
            {favorites.length} canciones
          </p>
        </button>

        {playlists.map((pl) => {
          const cover =
            tracks.find((t) => pl.trackIds.includes(t.id) && t.coverDataUrl)?.coverDataUrl ?? null
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => {
                soundClick()
                setTab('playlists')
                setPlDetailId(pl.id)
                setAddToPlOpen(pl.trackIds.length === 0)
              }}
              className="glass-card gco-hover-card"
              style={{
                minWidth: 116,
                width: 116,
                padding: '0.65rem',
                border: '1px solid var(--gco-glass-border)',
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--gco-glass-bg)',
                  marginBottom: 8,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {cover ? (
                  <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '📋'
                )}
              </div>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pl.name}
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', margin: '2px 0 0' }}>
                {pl.trackIds.length} canciones
              </p>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => {
            soundClick()
            void createNamedPlaylist().then((pl) => {
              if (pl) {
                setTab('playlists')
                setPlDetailId(pl.id)
                setAddToPlOpen(true)
              }
            })
          }}
          className="gco-hover-card"
          style={{
            minWidth: 116,
            width: 116,
            padding: '0.65rem',
            borderRadius: 16,
            border: '1px dashed var(--gco-glass-border)',
            cursor: 'pointer',
            color: 'var(--gco-ink-muted)',
            font: 'inherit',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            minHeight: 148,
            background: 'transparent',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.4rem' }}>＋</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Nueva lista</span>
          </span>
        </button>
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px', fontWeight: 700 }}>Todas las canciones</h2>
      <div className="gco-music-table-head" aria-hidden>
        <span>#</span>
        <span />
        <span>Título</span>
        <span>Artista</span>
        <span style={{ textAlign: 'right' }}>⏱</span>
        <span />
        <span />
      </div>

      <div>
        {filteredTracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--gco-ink-muted)' }}>
            <p style={{ fontSize: '2rem', margin: '0 0 8px' }}>🎧</p>
            <p style={{ margin: 0 }}>
              {search.trim() ? 'No hay resultados para tu búsqueda.' : 'No hay canciones todavía.'}
            </p>
            {!search.trim() && (
              <button
                type="button"
                className="glass-button secondary"
                style={{ marginTop: 12, fontSize: '0.85rem' }}
                onClick={() => setTab('import')}
              >
                Ir a Importar
              </button>
            )}
          </div>
        ) : (
          filteredTracks.map((t, i) => songRow(t, { index: i + 1 }))
        )}
      </div>
    </div>
  )

  const playlistDetailPanel = plDetail && (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
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
        <h2 style={{ flex: 1, fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>{plDetail.name}</h2>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem' }}
          onClick={() => {
            soundClick()
            const name = prompt('Nombre de la lista', plDetail.name)
            if (name?.trim()) void renamePlaylist(plDetail.id, name).then(refresh)
          }}
        >
          Renombrar
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem' }}
          onClick={() => {
            soundClick()
            if (confirm(`¿Borrar la lista "${plDetail.name}"? Las canciones no se eliminan.`)) {
              void deletePlaylist(plDetail.id).then(() => {
                setPlDetailId(null)
                void refresh()
              })
            }
          }}
        >
          Borrar lista
        </button>
        <GlassButton
          onClick={() => {
            soundClick()
            setAddToPlOpen((v) => !v)
          }}
        >
          + Añadir
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
      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', marginBottom: 10 }}>
        Arrastra ⠿ para reordenar · {plTracks.length} pistas · una canción puede estar en varias listas
      </p>
      {addToPlOpen && (
        <div
          className="glass-card gco-scroll-y"
          style={{ padding: '0.75rem 1rem', maxHeight: 280, overflow: 'auto', marginBottom: 12, border: '1px solid var(--gco-glass-border)' }}
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Biblioteca completa</p>
          {tracks.length === 0 && (
            <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem' }}>No hay pistas importadas.</p>
          )}
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
                <span style={{ flex: 1, fontSize: '0.9rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                  <span style={{ color: 'var(--gco-ink-muted)' }}> · {t.artist}</span>
                </span>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', flexShrink: 0 }}
                  disabled={inPl}
                  onClick={() => void addTrackToPlaylist(t.id, plDetail.id)}
                >
                  {inPl ? 'Ya está' : 'Añadir'}
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div>
        {plTracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--gco-ink-muted)' }}>
            <p style={{ fontSize: '1.8rem', margin: '0 0 6px' }}>📋</p>
            <p style={{ margin: 0 }}>Lista vacía. Pulsa "+ Añadir".</p>
          </div>
        ) : (
          plTracks.map((t, i) => songRow(t, { inPlaylist: true, index: i + 1 }))
        )}
      </div>
    </div>
  )

  const playlistsPanel = plDetailId ? (
    playlistDetailPanel
  ) : (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Tus listas</h2>
        <GlassButton
          onClick={() => {
            soundClick()
            void createNamedPlaylist()
          }}
        >
          + Nueva lista
        </GlassButton>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playlists.length === 0 && (
          <div className="glass-card" style={{ padding: '2rem 1rem', textAlign: 'center', border: '1px dashed var(--gco-glass-border)' }}>
            <p style={{ fontSize: '2rem', margin: '0 0 8px' }}>📋</p>
            <p style={{ color: 'var(--gco-ink-muted)', lineHeight: 1.5, margin: 0 }}>
              No hay listas todavía. Crea una y elige un nombre. No se generan automáticamente.
            </p>
          </div>
        )}
        {playlists.map((pl) => {
          const cover =
            tracks.find((t) => pl.trackIds.includes(t.id) && t.coverDataUrl)?.coverDataUrl ?? null
          return (
            <div
              key={pl.id}
              className="glass-card gco-hover-card"
              style={{
                padding: '0.85rem 1rem',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                border: '1px solid var(--gco-glass-border)',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--gco-glass-bg)',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.4rem',
                }}
              >
                {cover ? (
                  <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '📋'
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  setPlDetailId(pl.id)
                  setAddToPlOpen(pl.trackIds.length === 0)
                }}
                style={{
                  flex: 1,
                  minWidth: 120,
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <p style={{ fontWeight: 700, margin: 0 }}>{pl.name}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', margin: '4px 0 0' }}>
                  {pl.trackIds.length} pistas
                </p>
              </button>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
                    if (confirm(`¿Borrar "${pl.name}"?`)) void deletePlaylist(pl.id).then(refresh)
                  }}
                >
                  Borrar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const nowPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="glass-card" style={{ padding: '1.5rem 1.3rem', textAlign: 'center', border: '1px solid var(--gco-glass-border)' }}>
        <div
          style={{
            width: 'min(220px, 62vw)',
            aspectRatio: '1',
            margin: '0 auto 1.2rem',
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
          }}
        >
          {current?.coverDataUrl ? (
            <img src={current.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '3rem' }}>🎵</span>
          )}
        </div>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 4, fontWeight: 800 }}>
          {current?.title ?? 'Nada en reproducción'}
        </h2>
        <p style={{ color: 'var(--gco-ink-muted)', marginBottom: 6 }}>
          {current?.artist ?? 'Elige una canción desde tu biblioteca'}
          {current?.album ? ` · ${current.album}` : ''}
        </p>
        {!current && (
          <button
            type="button"
            className="glass-button secondary"
            style={{ marginTop: 8, fontSize: '0.85rem' }}
            onClick={() => setTab('library')}
          >
            Ir a Biblioteca
          </button>
        )}
        <div style={{ marginTop: 18 }}>
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          {SPEC_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              className={`glass-button ${specStyle === s ? '' : 'secondary'}`}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
              onClick={() => {
                soundClick()
                setSpecStyle(s)
              }}
            >
              {SPEC_STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden>¶</span> Letra
          </h3>
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
            className="gco-scroll-y"
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.92rem',
              lineHeight: 1.6,
              color: 'var(--gco-ink-muted)',
              maxHeight: 240,
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
            style={{ marginTop: 12, fontSize: '0.8rem' }}
            onClick={() => openEdit(current)}
          >
            Editar letra / metadatos
          </button>
        )}
      </div>
    </div>
  )

  const importPanel = (
    <ImportPanelComponent 
      onImport={onImport}
      tracks={tracks} 
    />
  )

  const morePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <h3 style={{ marginBottom: 10, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>🔊</span> Volumen forzado
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: 10 }}>
          Hasta 300% (3×) con GainNode. Usa con precaución para no dañar tus oídos ni el audio.
        </p>
        <input
          type="range"
          min={0}
          max={300}
          step={5}
          value={volumeBoost}
          onChange={(e) => setVolumeBoost(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
        />
        <p style={{ fontSize: '0.9rem', marginTop: 6, fontWeight: 600 }}>{volumeBoost}%</p>
      </div>

      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <h3 style={{ marginBottom: 14, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>🎨</span> Personalización
        </h3>
        <label
          style={{
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            padding: '0.5rem 0.75rem',
            borderRadius: 10,
            background: 'var(--gco-glass-bg, rgba(255,255,255,0.04))',
          }}
        >
          <span>Color barra de progreso</span>
          <input
            type="color"
            value={progressColor}
            onChange={(e) => {
              setProgressColor(e.target.value)
              saveBarPrefs({ progressColor: e.target.value })
            }}
            style={{ width: 36, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
          />
        </label>

        <p style={{ fontSize: '0.85rem', marginBottom: 8, fontWeight: 600 }}>Colores del espectro</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            A <input type="color" value={specColor} onChange={(e) => setSpecColor(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            B <input type="color" value={specColorB} onChange={(e) => setSpecColorB(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            C <input type="color" value={specColorC} onChange={(e) => setSpecColorC(e.target.value)} />
          </label>
        </div>

        <p style={{ fontSize: '0.85rem', marginBottom: 8, fontWeight: 600 }}>Efectos del espectro</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <h3 style={{ marginBottom: 10, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>📊</span> Resumen de tu biblioteca
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Pistas', value: tracks.length },
            { label: 'Listas', value: playlists.length },
            { label: 'Favoritos', value: favorites.length },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: '1 1 100px',
                padding: '0.8rem',
                borderRadius: 12,
                background: 'var(--gco-glass-bg, rgba(255,255,255,0.04))',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--gco-primary)' }}>{s.value}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', margin: '2px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
          Las listas solo existen si tú las creas. Puedes poner la misma canción en varias listas sin
          duplicar el archivo.
        </p>
      </div>
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

  const padBottom = playerHidden
    ? 'calc(5.4rem + env(safe-area-inset-bottom, 0px))'
    : 'calc(8.4rem + env(safe-area-inset-bottom, 0px))'

  return (
    <div className="app-shell app-shell-pro" style={{ paddingBottom: padBottom }}>
      <style>{LAYOUT_CSS}</style>
      <div className="gco-music-shell">
        <aside className="gco-music-sidebar gco-scroll-y" aria-label="Navegación lateral">
          <div style={{ marginBottom: 18, padding: '0 0.35rem' }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span aria-hidden>🎵</span> Música
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
              Reproductor offline
            </p>
          </div>
          {BOTTOM_TABS.map((tb) => {
            const on = tab === tb.id
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setTab(tb.id)
                  if (tb.id !== 'playlists') setPlDetailId(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  border: 'none',
                  borderRadius: 14,
                  cursor: 'pointer',
                  font: 'inherit',
                  fontWeight: on ? 700 : 500,
                  background: on
                    ? 'color-mix(in srgb, var(--gco-primary) 22%, transparent)'
                    : 'transparent',
                  color: on ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                }}
              >
                {tb.icon}
                {tb.label}
              </button>
            )
          })}
        </aside>

        <div className="gco-music-main" style={{ flex: 1, minWidth: 0 }}>
          <div className="gco-music-mobile-header">{header}</div>

          <div className="gco-music-desktop-top" style={{ justifyContent: 'flex-end' }}>
            <p style={{ margin: '0 auto 0 0', fontWeight: 700, fontSize: '1.02rem', opacity: 0.9 }}>
              {tab === 'library'
                ? 'Biblioteca'
                : tab === 'playlists'
                  ? 'Listas de reproducción'
                  : tab === 'now'
                    ? 'Reproduciendo'
                    : tab === 'import'
                      ? 'Importar'
                      : 'Más'}
            </p>
            <ModeSwitch />
            <ThemeToggle />
            <button
              type="button"
              className="theme-cycle-btn gco-icon-btn"
              aria-label={playerHidden ? 'Mostrar reproductor' : 'Ocultar reproductor'}
              onClick={() => {
                soundClick()
                setPlayerHidden((v) => !v)
              }}
              style={{ width: 44, height: 44, borderRadius: 12 }}
            >
              {playerHidden ? '▲' : '▼'}
            </button>
            <button
              type="button"
              className="theme-cycle-btn gco-icon-btn"
              aria-label="Abrir ajustes"
              onClick={() => {
                soundClick()
                navigate('/ajustes')
              }}
              style={{ width: 44, height: 44, borderRadius: 12 }}
            >
              ☰
            </button>
          </div>

          <main style={{ minWidth: 0 }}>{mainContent}</main>
        </div>
      </div>

      {/* Menú contextual ⋮ */}
      {menu && (
        <>
          <div
            role="presentation"
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
            onClick={() => setMenu(null)}
          />
          <div
            role="menu"
            className="glass-card"
            style={{
              position: 'fixed',
              left: menu.x,
              top: menu.y,
              zIndex: 91,
              width: 260,
              padding: '0.35rem',
              borderRadius: 16,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              border: '1px solid var(--gco-glass-border)',
            }}
          >
            {(
              [
                {
                  label: 'Reproducir',
                  run: () => playAll(filteredTracks, menu.track),
                },
                {
                  label: 'Reproducir a continuación',
                  run: () => playNext(menu.track),
                },
                {
                  label: 'Agregar a playlist…',
                  run: () => {
                    setAssignTrack(menu.track)
                    setAssignIds([])
                    setNewPlDraft('')
                  },
                },
                {
                  label: 'Barajear desde aquí',
                  run: () => {
                    const list = [...filteredTracks]
                    const i = list.findIndex((x) => x.id === menu.track.id)
                    const ordered =
                      i >= 0 ? [...list.slice(i), ...list.slice(0, i)] : list
                    player.setShuffle(true)
                    playAll(ordered, menu.track)
                  },
                },
                {
                  label: 'Renombrar / editar',
                  run: () => openEdit(menu.track),
                },
                {
                  label: 'Metadatos',
                  run: () => setMetaTrack(menu.track),
                },
                {
                  label: `Peso · ${formatBytes(menu.track.sizeBytes)}`,
                  run: () => setMetaTrack(menu.track),
                },
                {
                  label: 'Borrar',
                  danger: true,
                  run: () => {
                    if (confirm(`¿Borrar "${menu.track.title}"?`)) {
                      void deleteTrack(menu.track.id).then(refresh)
                    }
                  },
                },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="gco-icon-btn"
                onClick={() => {
                  soundClick()
                  setMenu(null)
                  item.run()
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 0.9rem',
                  border: 'none',
                  borderRadius: 12,
                  background: 'transparent',
                  color: 'danger' in item && item.danger ? 'var(--gco-secondary, #ff6b6b)' : 'inherit',
                  font: 'inherit',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Asignar a una o varias playlists */}
      {assignTrack && (
        <div
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 95,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setAssignTrack(null)}
        >
          <div
            className="glass-card"
            style={{ width: 'min(400px, 100%)', padding: '1.2rem', border: '1px solid var(--gco-glass-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Agregar a playlist</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginTop: 0 }}>
              {assignTrack.title} · puedes marcar varias
            </p>
            {playlists.length === 0 ? (
              <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
                No hay listas. Crea una abajo.
              </p>
            ) : (
              playlists.map((pl) => (
                <label
                  key={pl.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    marginBottom: 8,
                    fontSize: '0.92rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={assignIds.includes(pl.id)}
                    onChange={(e) =>
                      setAssignIds((ids) =>
                        e.target.checked ? [...ids, pl.id] : ids.filter((x) => x !== pl.id)
                      )
                    }
                  />
                  {pl.name}
                  <span style={{ color: 'var(--gco-ink-muted)', fontSize: '0.78rem' }}>
                    ({pl.trackIds.length})
                  </span>
                </label>
              ))
            )}
            <input
              className="glass-input"
              placeholder="Crear lista nueva…"
              value={newPlDraft}
              onChange={(e) => setNewPlDraft(e.target.value)}
              style={{ marginTop: 8, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <GlassButton onClick={() => void confirmAssign()}>Guardar</GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => setAssignTrack(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadatos */}
      {metaTrack && (
        <div
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 95,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setMetaTrack(null)}
        >
          <div
            className="glass-card"
            style={{ width: 'min(400px, 100%)', padding: '1.2rem', border: '1px solid var(--gco-glass-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Metadatos</h3>
            {(
              [
                ['Título', metaTrack.title],
                ['Artista', metaTrack.artist],
                ['Álbum', metaTrack.album || '—'],
                ['Año', metaTrack.year || '—'],
                ['Duración', formatTrackTime(metaTrack.durationMs)],
                ['Peso', formatBytes(metaTrack.sizeBytes)],
                ['MIME', metaTrack.mime || '—'],
                ['Id', metaTrack.id],
              ] as const
            ).map(([k, v]) => (
              <p key={k} style={{ margin: '6px 0', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--gco-ink-muted)' }}>{k}: </span>
                {v}
              </p>
            ))}
            <button
              type="button"
              className="glass-button secondary"
              style={{ marginTop: 12 }}
              onClick={() => setMetaTrack(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

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
            className="glass-card gco-scroll-y"
            style={{
              width: 'min(440px, 100%)',
              padding: '1.25rem',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid var(--gco-glass-border)',
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
                display: 'grid',
                placeItems: 'center',
                background: 'var(--gco-glass-bg)',
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
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Título</label>
            <input
              className="glass-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Artista</label>
            <input
              className="glass-input"
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Álbum</label>
            <input
              className="glass-input"
              value={editAlbum}
              onChange={(e) => setEditAlbum(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Año</label>
            <input
              className="glass-input"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Letra</label>
            <textarea
              className="glass-input"
              value={editLyrics}
              onChange={(e) => setEditLyrics(e.target.value)}
              rows={6}
              style={{ marginBottom: 12, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <GlassButton onClick={() => void saveEdit()}>Guardar</GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  void deleteTrack(editing.id).then(() => {
                    setEditId(null)
                    void refresh()
                  })
                }}
              >
                Borrar pista
              </button>
              <button type="button" className="glass-button secondary" onClick={() => setEditId(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini player encima del nav */}
      {!playerHidden && (
        <div
          className="gco-music-player-dock"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(5.15rem + env(safe-area-inset-bottom, 0px))',
            zIndex: 45,
          }}
        >
          <PlayerBar player={player} compact />
        </div>
      )}

      {/* Nav inferior redondeado + iconos mockup */}
      <nav
        className="gco-music-bottom-nav"
        aria-label="Navegación música"
        style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
          zIndex: 50,
          borderRadius: 24,
          background: 'color-mix(in srgb, var(--gco-bg, #0B1220) 78%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.15)',
          border: '1px solid var(--gco-glass-border)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.28)',
          padding: '0.4rem 0.3rem 0.45rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            maxWidth: 520,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {BOTTOM_TABS.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => {
                  soundClick()
                  setTab(t.id)
                  if (t.id !== 'playlists') setPlDetailId(null)
                }}
                className={`gco-icon-btn ${on ? 'is-active' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  border: 'none',
                  background: 'transparent',
                  color: on ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: 12,
                }}
              >
                {t.icon}
                <span style={{ fontSize: '0.65rem', fontWeight: on ? 700 : 500 }}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}