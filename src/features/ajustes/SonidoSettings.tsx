/**
 * SonidoSettings — Audio ambiente (GymCogOrigins)
 *
 * - Biblioteca de pistas subidas (persistente en IndexedDB)
 * - Selección desde la biblioteca de Música (mediaLibrary / MusicaHome)
 * - Activar / desactivar ambiente + volumen con tope seguro para juegos
 * - Compatible con el player de fondo vía saveAudioFile + eventos gco:*
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import {
  getBgPrefs,
  saveBgPrefs,
  saveAudioFile,
  clearAudioFile,
} from '@/core/storage/customBackground'
import {
  listTracks,
  getTrackBlob,
  type TrackItem,
} from '@/core/storage/mediaLibrary'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundToggle, soundStart } from '@/core/audio/uiSounds'

/* ═══════════════════════════════════════════════════════════════════════════
   Tipos
   ═══════════════════════════════════════════════════════════════════════════ */

type AmbientSource = 'none' | 'upload' | 'library'

interface AmbientEntry {
  id: string
  name: string
  /** 'upload' = blob en IDB local · 'library' = referencia a mediaLibrary */
  source: 'upload' | 'library'
  /** Solo library: id de TrackItem */
  libraryTrackId?: string
  /** Solo library: blobKey de TrackItem */
  blobKey?: string
  mime?: string
  size?: number
  durationMs?: number
  createdAt: number
}

interface AmbientPrefsExtra {
  /** Pista activa de la biblioteca ambiente */
  activeAmbientId: string | null
  source: AmbientSource
}

type BgPrefs = ReturnType<typeof getBgPrefs>

type FullPrefs = BgPrefs & Partial<AmbientPrefsExtra>

/* ═══════════════════════════════════════════════════════════════════════════
   Persistencia local (IndexedDB + localStorage)
   ═══════════════════════════════════════════════════════════════════════════ */

const META_KEY = 'gco:ambient-library-meta'
const EXTRA_PREFS_KEY = 'gco:ambient-extra'
const IDB_NAME = 'gco-ambient-audio'
const IDB_STORE = 'blobs'
const IDB_VERSION = 1
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_LIBRARY_ITEMS = 24

function loadMeta(): AmbientEntry[] {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AmbientEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMeta(list: AmbientEntry[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list.slice(0, MAX_LIBRARY_ITEMS)))
  } catch {
    /* quota */
  }
}

function loadExtraPrefs(): AmbientPrefsExtra {
  try {
    const raw = localStorage.getItem(EXTRA_PREFS_KEY)
    if (!raw) return { activeAmbientId: null, source: 'none' }
    const p = JSON.parse(raw) as Partial<AmbientPrefsExtra>
    return {
      activeAmbientId: p.activeAmbientId ?? null,
      source: p.source ?? 'none',
    }
  } catch {
    return { activeAmbientId: null, source: 'none' }
  }
}

function saveExtraPrefs(extra: AmbientPrefsExtra): void {
  try {
    localStorage.setItem(EXTRA_PREFS_KEY, JSON.stringify(extra))
  } catch {
    /* */
  }
}

function openAmbientDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

async function idbPutBlob(id: string, blob: Blob): Promise<void> {
  const db = await openAmbientDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDB put failed'))
    tx.objectStore(IDB_STORE).put(blob, id)
  })
  db.close()
}

async function idbGetBlob(id: string): Promise<Blob | null> {
  const db = await openAmbientDb()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('IDB get failed'))
  })
  db.close()
  return blob
}

async function idbDeleteBlob(id: string): Promise<void> {
  const db = await openAmbientDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDB delete failed'))
    tx.objectStore(IDB_STORE).delete(id)
  })
  db.close()
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return ''
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/** Intenta leer duración de un blob de audio */
function probeDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    const done = (ms?: number) => {
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = audio.duration
      done(Number.isFinite(d) ? d * 1000 : undefined)
    }
    audio.onerror = () => done(undefined)
    window.setTimeout(() => done(undefined), 4000)
    audio.src = url
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   Eventos hacia el player de fondo
   ═══════════════════════════════════════════════════════════════════════════ */

function emitBgPrefs(prefs: FullPrefs) {
  saveBgPrefs(prefs)
  window.dispatchEvent(new Event('gco:bg-prefs'))
  window.dispatchEvent(
    new CustomEvent('gco:bg-prefs-detail', { detail: prefs }),
  )
}

function emitBgUpdated() {
  window.dispatchEvent(new Event('gco:bg-updated'))
}

/* ═══════════════════════════════════════════════════════════════════════════
   Estilos scoped (liquid glass)
   ═══════════════════════════════════════════════════════════════════════════ */

const SCOPED = `
.snd-root {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: clamp(1rem, 3vw, 1.35rem);
}
.snd-head h3 {
  font-size: 1.05rem;
  margin: 0 0 0.35rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.snd-head p {
  margin: 0;
  color: var(--gco-ink-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}
.snd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: linear-gradient(165deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
  border: 1px solid var(--gco-glass-border, rgba(255,255,255,0.14));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.snd-row-title { font-weight: 600; font-size: 0.95rem; margin: 0; }
.snd-row-sub { font-size: 0.78rem; color: var(--gco-ink-muted); margin: 0.15rem 0 0; }
.snd-switch {
  width: 52px;
  height: 30px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s ease;
  background: rgba(255,255,255,0.12);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
}
.snd-switch.is-on {
  background: var(--gco-primary, #22E6C5);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 0 12px rgba(34,230,197,0.3);
}
.snd-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s ease;
  box-shadow: 0 1px 4px rgba(0,0,0,0.35);
  pointer-events: none;
}
.snd-switch.is-on .snd-switch-knob { left: 24px; }
.snd-section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gco-ink-muted);
  margin: 0.15rem 0 0.5rem;
}
.snd-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.25rem;
  border-radius: 12px;
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.08);
}
.snd-tab {
  flex: 1;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  background: transparent;
  color: var(--gco-ink-muted);
  transition: 0.15s;
}
.snd-tab.is-on {
  background: linear-gradient(165deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05));
  color: var(--gco-ink, #F3F5FA);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.snd-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: min(42vh, 320px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 2px;
}
.snd-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  width: 100%;
  transition: 0.15s;
}
.snd-item:hover {
  border-color: rgba(34,230,197,0.35);
  background: rgba(34,230,197,0.06);
}
.snd-item.is-active {
  border-color: rgba(34,230,197,0.5);
  background: rgba(34,230,197,0.12);
  box-shadow: 0 0 16px rgba(34,230,197,0.12);
}
.snd-item-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(34,230,197,0.25), rgba(139,124,246,0.2));
  font-size: 1rem;
}
.snd-item-body { flex: 1; min-width: 0; }
.snd-item-title {
  font-weight: 600;
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.snd-item-meta {
  font-size: 0.72rem;
  color: var(--gco-ink-muted);
  margin-top: 2px;
}
.snd-item-actions {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}
.snd-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
}
.snd-icon-btn:hover {
  border-color: rgba(34,230,197,0.4);
  background: rgba(34,230,197,0.1);
}
.snd-empty {
  font-size: 0.84rem;
  color: var(--gco-ink-muted);
  line-height: 1.45;
  padding: 0.75rem 0.25rem;
}
.snd-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.snd-hint {
  font-size: 0.75rem;
  color: var(--gco-ink-faint, rgba(243,245,250,0.38));
  margin: 0.35rem 0 0;
}
.snd-error {
  font-size: 0.8rem;
  color: var(--gco-secondary, #FF6B4A);
  margin: 0;
}
.snd-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: rgba(34,230,197,0.15);
  color: var(--gco-primary, #22E6C5);
  flex-shrink: 0;
}
`

/* ═══════════════════════════════════════════════════════════════════════════
   Componente
   ═══════════════════════════════════════════════════════════════════════════ */

type BrowserTab = 'saved' | 'music'

export function SonidoSettings() {
  const [prefs, setPrefs] = useState<FullPrefs>(() => ({
    ...getBgPrefs(),
    ...loadExtraPrefs(),
  }))
  const [library, setLibrary] = useState<AmbientEntry[]>(() => loadMeta())
  const [musicTracks, setMusicTracks] = useState<TrackItem[]>([])
  const [musicLoading, setMusicLoading] = useState(false)
  const [tab, setTab] = useState<BrowserTab>('saved')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  const persistPrefs = useCallback((next: FullPrefs) => {
    setPrefs(next)
    const extra: AmbientPrefsExtra = {
      activeAmbientId: next.activeAmbientId ?? null,
      source: next.source ?? 'none',
    }
    saveExtraPrefs(extra)
    emitBgPrefs(next)
  }, [])

  const refreshMusic = useCallback(async () => {
    setMusicLoading(true)
    try {
      const list = await listTracks()
      setMusicTracks(Array.isArray(list) ? list : [])
    } catch {
      setMusicTracks([])
    } finally {
      setMusicLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMusic()
  }, [refreshMusic])

  /** Activa una pista en el motor de fondo (saveAudioFile → player) */
  const activateBlob = useCallback(
    async (blob: Blob, name: string, entryId: string, source: AmbientSource) => {
      const file = new File([blob], name || 'ambient.audio', {
        type: blob.type || 'audio/mpeg',
      })
      await saveAudioFile(file)
      persistPrefs({
        ...prefs,
        audioEnabled: true,
        activeAmbientId: entryId,
        source,
      })
      emitBgUpdated()
    },
    [persistPrefs, prefs],
  )

  const selectSavedEntry = useCallback(
    async (entry: AmbientEntry) => {
      setError(null)
      setBusy(true)
      soundClick()
      try {
        if (entry.source === 'upload') {
          const blob = await idbGetBlob(entry.id)
          if (!blob) {
            setError('No se encontró el archivo guardado. Vuelve a subirlo.')
            return
          }
          await activateBlob(blob, entry.name, entry.id, 'upload')
        } else if (entry.source === 'library' && entry.blobKey) {
          const raw = await getTrackBlob(entry.blobKey)
          const blob =
            raw instanceof Blob
              ? raw
              : raw && typeof raw === 'object' && 'blob' in raw
                ? (raw as { blob: Blob }).blob
                : null
          if (!blob) {
            setError('No se pudo leer la pista de la biblioteca de música.')
            return
          }
          await activateBlob(blob, entry.name, entry.id, 'library')
        }
      } catch {
        setError('Error al activar la pista.')
      } finally {
        setBusy(false)
      }
    },
    [activateBlob],
  )

  const selectMusicTrack = useCallback(
    async (t: TrackItem) => {
      setError(null)
      setBusy(true)
      soundClick()
      try {
        const raw = await getTrackBlob(t.blobKey)
        const blob =
          raw instanceof Blob
            ? raw
            : raw && typeof raw === 'object' && 'blob' in raw
              ? (raw as { blob: Blob }).blob
              : null
        if (!blob) {
          setError('No se pudo cargar esa canción.')
          return
        }

        // ¿Ya está en la biblioteca ambiente?
        let entry = library.find(
          (e) => e.source === 'library' && e.libraryTrackId === t.id,
        )
        if (!entry) {
          entry = {
            id: newId('lib'),
            name: t.title || t.artist || 'Pista de música',
            source: 'library',
            libraryTrackId: t.id,
            blobKey: t.blobKey,
            mime: blob.type,
            size: blob.size,
            durationMs: t.durationMs,
            createdAt: Date.now(),
          }
          const nextLib = [entry, ...library].slice(0, MAX_LIBRARY_ITEMS)
          setLibrary(nextLib)
          saveMeta(nextLib)
        }

        await activateBlob(blob, entry.name, entry.id, 'library')
      } catch {
        setError('No se pudo usar la canción del reproductor.')
      } finally {
        setBusy(false)
      }
    },
    [activateBlob, library],
  )

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      setError('Usa un archivo de audio (o vídeo: solo se usará el sonido).')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Máximo ~15 MB por archivo.')
      return
    }

    setBusy(true)
    soundStart()
    try {
      const durationMs = await probeDuration(file)
      const entry: AmbientEntry = {
        id: newId('up'),
        name: file.name.replace(/\.[^.]+$/, '') || 'Pista subida',
        source: 'upload',
        mime: file.type,
        size: file.size,
        durationMs,
        createdAt: Date.now(),
      }
      await idbPutBlob(entry.id, file)
      const nextLib = [entry, ...library].slice(0, MAX_LIBRARY_ITEMS)
      setLibrary(nextLib)
      saveMeta(nextLib)
      await activateBlob(file, entry.name, entry.id, 'upload')
      setTab('saved')
    } catch {
      setError('No se pudo guardar la pista.')
    } finally {
      setBusy(false)
    }
  }

  const removeEntry = async (entry: AmbientEntry, ev?: React.MouseEvent) => {
    ev?.stopPropagation()
    soundClick()
    if (entry.source === 'upload') {
      try {
        await idbDeleteBlob(entry.id)
      } catch {
        /* */
      }
    }
    const nextLib = library.filter((x) => x.id !== entry.id)
    setLibrary(nextLib)
    saveMeta(nextLib)

    if (prefs.activeAmbientId === entry.id) {
      await clearAudioFile()
      persistPrefs({
        ...prefs,
        activeAmbientId: null,
        source: 'none',
        audioEnabled: false,
      })
      emitBgUpdated()
    }
  }

  const clearActive = async () => {
    soundClick()
    await clearAudioFile()
    persistPrefs({
      ...prefs,
      activeAmbientId: null,
      source: 'none',
      audioEnabled: false,
    })
    emitBgUpdated()
  }

  const filteredMusic = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return musicTracks
    return musicTracks.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q),
    )
  }, [musicTracks, filter])

  const activeEntry = useMemo(
    () => library.find((e) => e.id === prefs.activeAmbientId) ?? null,
    [library, prefs.activeAmbientId],
  )

  return (
    <div className="glass-card snd-root">
      <style>{SCOPED}</style>

      <div className="snd-head">
        <h3>Audio ambiente</h3>
        <p>
          Música en bucle a volumen bajo. Sube pistas, guárdalas en este dispositivo
          o elige canciones de tu biblioteca de Música. Formatos: mp3, m4a, wav, ogg
          o pista de un mp4.
        </p>
      </div>

      {/* Master enable */}
      <div className="snd-row">
        <div>
          <p className="snd-row-title">Activado</p>
          <p className="snd-row-sub">
            {prefs.audioEnabled
              ? activeEntry
                ? `Reproduciendo: ${activeEntry.name}`
                : 'Reproduciendo en bucle'
              : 'Silenciado'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!prefs.audioEnabled}
          className={`snd-switch${prefs.audioEnabled ? ' is-on' : ''}`}
          disabled={busy}
          onClick={() => {
            const next = !prefs.audioEnabled
            soundToggle(next)
            persistPrefs({ ...prefs, audioEnabled: next })
          }}
        >
          <span className="snd-switch-knob" />
        </button>
      </div>

      {/* Volume */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.45rem',
          }}
        >
          <label htmlFor="gco-vol" style={{ fontWeight: 500, fontSize: '0.95rem' }}>
            Volumen
          </label>
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
            {Math.round((prefs.volume ?? 0) * 100)}%
          </span>
        </div>
        <input
          id="gco-vol"
          type="range"
          min={0}
          max={0.4}
          step={0.01}
          value={prefs.volume ?? 0.15}
          onChange={(e) => {
            const volume = Number(e.target.value)
            persistPrefs({ ...prefs, volume })
          }}
          onPointerUp={() => soundClick()}
          style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
        />
        <p className="snd-hint">Tope 40% para que no tape los sonidos de los juegos</p>
      </div>

      {/* Tabs */}
      <div>
        <div className="snd-section-label">Biblioteca de ambiente</div>
        <div className="snd-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'saved'}
            className={`snd-tab${tab === 'saved' ? ' is-on' : ''}`}
            onClick={() => {
              soundClick()
              setTab('saved')
            }}
          >
            Guardadas ({library.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'music'}
            className={`snd-tab${tab === 'music' ? ' is-on' : ''}`}
            onClick={() => {
              soundClick()
              setTab('music')
              void refreshMusic()
            }}
          >
            Desde Música
          </button>
        </div>
      </div>

      {error && <p className="snd-error">{error}</p>}

      {/* Saved ambient tracks */}
      {tab === 'saved' && (
        <div>
          {library.length === 0 ? (
            <p className="snd-empty">
              Aún no hay pistas guardadas. Sube un archivo o elige una canción de
              Música; se guardará aquí para reutilizarla.
            </p>
          ) : (
            <div className="snd-list">
              {library.map((entry) => {
                const isActive = prefs.activeAmbientId === entry.id
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`snd-item${isActive ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => void selectSavedEntry(entry)}
                  >
                    <span className="snd-item-icon">
                      {entry.source === 'library' ? '🎵' : '📁'}
                    </span>
                    <span className="snd-item-body">
                      <span className="snd-item-title">{entry.name}</span>
                      <span className="snd-item-meta">
                        {entry.source === 'library' ? 'Biblioteca Música' : 'Subida'}
                        {entry.size ? ` · ${formatBytes(entry.size)}` : ''}
                        {entry.durationMs
                          ? ` · ${formatDuration(entry.durationMs)}`
                          : ''}
                      </span>
                    </span>
                    {isActive && <span className="snd-badge">ACTIVA</span>}
                    <span className="snd-item-actions">
                      <span
                        role="button"
                        tabIndex={0}
                        className="snd-icon-btn"
                        title="Quitar de la lista"
                        onClick={(ev) => void removeEntry(entry, ev)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            void removeEntry(entry)
                          }
                        }}
                      >
                        🗑
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="snd-actions" style={{ marginTop: '0.75rem' }}>
            <GlassButton
              type="button"
              disabled={busy}
              onClick={() => {
                soundClick()
                fileRef.current?.click()
              }}
            >
              {busy ? 'Procesando…' : 'Subir pista'}
            </GlassButton>
            <button
              type="button"
              className="glass-button secondary"
              disabled={busy || !prefs.activeAmbientId}
              onClick={() => void clearActive()}
            >
              Quitar activa
            </button>
          </div>
        </div>
      )}

      {/* Music library picker */}
      {tab === 'music' && (
        <div>
          <input
            type="search"
            placeholder="Buscar en tu biblioteca de Música…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={
              {
                width: '100%',
                marginBottom: '0.55rem',
                padding: '0.6rem 0.85rem',
                borderRadius: 12,
                border: '1px solid var(--gco-glass-border, rgba(255,255,255,0.14))',
                background: 'var(--gco-input-bg, rgba(0,0,0,0.28))',
                color: 'var(--gco-ink, #F3F5FA)',
                font: 'inherit',
                fontSize: '0.88rem',
              } satisfies CSSProperties
            }
          />

          {musicLoading ? (
            <p className="snd-empty">Cargando biblioteca…</p>
          ) : filteredMusic.length === 0 ? (
            <p className="snd-empty">
              {musicTracks.length === 0
                ? 'No hay canciones en Música. Importa pistas desde la sección Música.'
                : 'Ningún resultado con ese filtro.'}
            </p>
          ) : (
            <div className="snd-list">
              {filteredMusic.map((t) => {
                const linked = library.find(
                  (e) => e.source === 'library' && e.libraryTrackId === t.id,
                )
                const isActive = linked && prefs.activeAmbientId === linked.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`snd-item${isActive ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => void selectMusicTrack(t)}
                  >
                    <span className="snd-item-icon">🎶</span>
                    <span className="snd-item-body">
                      <span className="snd-item-title">
                        {t.title || 'Sin título'}
                      </span>
                      <span className="snd-item-meta">
                        {t.artist || 'Artista desconocido'}
                        {t.durationMs
                          ? ` · ${formatDuration(t.durationMs)}`
                          : ''}
                      </span>
                    </span>
                    {isActive && <span className="snd-badge">ACTIVA</span>}
                    {linked && !isActive && (
                      <span className="snd-badge" style={{ opacity: 0.7 }}>
                        GUARDADA
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="snd-actions" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                void refreshMusic()
              }}
            >
              Actualizar lista
            </button>
          </div>
          <p className="snd-hint">
            Al elegir una canción se añade a «Guardadas» y se activa como ambiente.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/mp4,video/webm"
        hidden
        onChange={(e) => void onUpload(e)}
      />
    </div>
  )
}

export default SonidoSettings