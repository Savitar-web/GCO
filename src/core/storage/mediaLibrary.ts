/** Biblioteca de audiolibros (texto) y música (blobs) en IndexedDB
 * Compatibilidad: Chrome/Edge/Firefox/Safari modernos y antiguos,
 * Android WebView, iOS Safari, Windows LTSC, macOS, Linux.
 * No modifica la lógica de pistas/música más allá de defensas de IDB.
 */

const DB_NAME = 'gco-media-library'
const DB_VERSION = 2
const STORE_BOOKS = 'books'
const STORE_TRACKS = 'tracks'
const STORE_PLAYLISTS = 'playlists'
const STORE_BLOBS = 'blobs'
const STORE_FOLDERS = 'folders'

/* ───────────────────────── Tipos ───────────────────────── */

export interface BookFolder {
  id: string
  name: string
  parentId: string | null
  updatedAt: string
}

export interface ChapterMark {
  id: string
  title: string
  /** offset de carácter en el texto completo */
  start: number
  source: 'auto' | 'manual'
}

export interface Bookmark {
  id: string
  charIndex: number
  label?: string
  note?: string
  createdAt: string
  chapterId?: string
}

export interface ParagraphComment {
  id: string
  /** índice del párrafo (0-based) */
  paraIndex: number
  charStart: number
  text: string
  createdAt: string
}

/**
 * Subrayado sobre un fragmento de texto seleccionado por el usuario
 * (no necesariamente el párrafo completo). `startOffset`/`endOffset`
 * son posiciones dentro del texto "visible" del párrafo (sin marcado
 * markdown), de modo que el resaltado sea estable frente a negrita,
 * cursiva, etc. `text` guarda una copia del fragmento por robustez
 * (permite recuperar/mostrar el marcador aunque el texto cambie).
 */
export interface Highlight {
  id: string
  paraIndex: number
  startOffset: number
  endOffset: number
  text: string
  color: string
  createdAt: string
}

export interface ReaderAppearance {
  mode: 'day' | 'night' | 'sepia'
  font: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  brightness: number
  autoAdvance: boolean
  pageAnim: boolean
  /** vertical continuo | horizontal paginado (máx. 4 párrafos/hoja) */
  layout?: 'vertical' | 'horizontal'
}

export interface BookItem {
  id: string
  title: string
  author?: string
  year?: string
  coverDataUrl?: string | null
  folderId: string | null
  text: string
  position: number
  rate: number
  voiceURI?: string
  highlightColor?: string
  spokenColor?: string
  lang?: string
  chapters?: ChapterMark[]
  bookmarks?: Bookmark[]
  comments?: ParagraphComment[]
  highlights?: Highlight[]
  appearance?: ReaderAppearance
  /** Formato de origen del archivo importado (para diagnóstico/reimportación) */
  sourceFormat?: 'txt' | 'pdf' | 'docx' | 'epub' | 'html' | 'rtf' | 'markdown' | 'clipboard' | 'manual'
  updatedAt: string
  createdAt: string
}

export interface TrackItem {
  id: string
  title: string
  artist: string
  durationMs: number
  blobKey: string
  mime: string
  coverDataUrl?: string | null
  createdAt: string
  sizeBytes?: number
  year?: string
  album?: string
  lyrics?: string
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  updatedAt: string
}

/* ───────────────────────── Utils ───────────────────────── */

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible (modo privado o navegador antiguo)'))
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_TRACKS)) {
          db.createObjectStore(STORE_TRACKS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
          db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          db.createObjectStore(STORE_BLOBS)
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('IDB open error'))
      req.onblocked = () => {
        /* otra pestaña mantiene versión antigua; el caller puede reintentar */
      }
    } catch (e) {
      reject(e)
    }
  })
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function emit() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gco:library'))
    }
  } catch {
    /* ignore */
  }
}

/* ───────────────────────── Folders ───────────────────────── */

export async function listFolders(): Promise<BookFolder[]> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        resolve([])
        return
      }
      const req = db
        .transaction(STORE_FOLDERS, 'readonly')
        .objectStore(STORE_FOLDERS)
        .getAll()
      req.onsuccess = () => {
        const rows = (req.result as BookFolder[]) ?? []
        rows.sort((a, b) => a.name.localeCompare(b.name, 'es'))
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function saveFolder(f: BookFolder) {
  const db = await openDb()
  const tx = db.transaction(STORE_FOLDERS, 'readwrite')
  tx.objectStore(STORE_FOLDERS).put({
    ...f,
    updatedAt: new Date().toISOString(),
  })
  await txDone(tx)
  emit()
}

export async function createFolder(
  name: string,
  parentId: string | null = null
): Promise<BookFolder> {
  const f: BookFolder = {
    id: uid(),
    name: name.trim() || 'Carpeta',
    parentId,
    updatedAt: new Date().toISOString(),
  }
  await saveFolder(f)
  return f
}

export async function renameFolder(id: string, name: string) {
  const list = await listFolders()
  const f = list.find((x) => x.id === id)
  if (!f) return null
  const next = { ...f, name: name.trim() || f.name }
  await saveFolder(next)
  return next
}

export async function deleteFolder(id: string) {
  const books = await listBooks()
  for (const b of books) {
    if (b.folderId === id) {
      await saveBook({ ...b, folderId: null })
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_FOLDERS, 'readwrite')
  tx.objectStore(STORE_FOLDERS).delete(id)
  await txDone(tx)
  emit()
}

/* ───────────────────────── Books ───────────────────────── */

export async function listBooks(): Promise<BookItem[]> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_BOOKS, 'readonly')
        .objectStore(STORE_BOOKS)
        .getAll()
      req.onsuccess = () => {
        const rows = (req.result as BookItem[]) ?? []
        rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function getBook(id: string): Promise<BookItem | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_BOOKS, 'readonly')
        .objectStore(STORE_BOOKS)
        .get(id)
      req.onsuccess = () => resolve((req.result as BookItem) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function saveBook(
  input: Partial<BookItem> & { title: string; text: string }
): Promise<BookItem> {
  const now = new Date().toISOString()
  const existing = input.id ? await getBook(input.id) : null

  const book: BookItem = {
    id: existing?.id ?? input.id ?? uid(),
    title: input.title.trim() || 'Sin título',
    author: input.author !== undefined ? input.author : existing?.author,
    year: input.year !== undefined ? input.year : existing?.year,
    coverDataUrl:
      input.coverDataUrl !== undefined
        ? input.coverDataUrl
        : (existing?.coverDataUrl ?? null),
    folderId:
      input.folderId !== undefined
        ? input.folderId
        : (existing?.folderId ?? null),
    text: input.text,
    position: input.position ?? existing?.position ?? 0,
    rate: input.rate ?? existing?.rate ?? 1,
    voiceURI:
      input.voiceURI !== undefined ? input.voiceURI : existing?.voiceURI,
    highlightColor:
      input.highlightColor !== undefined
        ? input.highlightColor
        : existing?.highlightColor,
    spokenColor:
      input.spokenColor !== undefined
        ? input.spokenColor
        : existing?.spokenColor,
    lang: input.lang !== undefined ? input.lang : existing?.lang,

    chapters:
      input.chapters !== undefined ? input.chapters : existing?.chapters,
    bookmarks:
      input.bookmarks !== undefined ? input.bookmarks : existing?.bookmarks,
    comments:
      input.comments !== undefined ? input.comments : existing?.comments,
    highlights:
      input.highlights !== undefined ? input.highlights : existing?.highlights,
    appearance:
      input.appearance !== undefined
        ? input.appearance
        : existing?.appearance,
    sourceFormat:
      input.sourceFormat !== undefined ? input.sourceFormat : existing?.sourceFormat,

    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const db = await openDb()
  const tx = db.transaction(STORE_BOOKS, 'readwrite')
  tx.objectStore(STORE_BOOKS).put(book)
  await txDone(tx)
  emit()
  return book
}

export async function renameBook(id: string, title: string) {
  const b = await getBook(id)
  if (!b) return null
  return saveBook({ ...b, title: title.trim() || b.title })
}

export async function moveBookToFolder(id: string, folderId: string | null) {
  const b = await getBook(id)
  if (!b) return null
  return saveBook({ ...b, folderId })
}

export async function updateBookMeta(
  id: string,
  patch: {
    title?: string
    author?: string
    year?: string
    coverDataUrl?: string | null
  }
) {
  const b = await getBook(id)
  if (!b) return null
  return saveBook({ ...b, ...patch })
}

/** Actualiza solo los datos de lectura (capítulos, marcadores, comentarios, apariencia, posición…) */
export async function updateBookReaderState(
  id: string,
  patch: Partial<
    Pick<
      BookItem,
      | 'position'
      | 'rate'
      | 'voiceURI'
      | 'chapters'
      | 'bookmarks'
      | 'comments'
      | 'highlights'
      | 'appearance'
      | 'highlightColor'
      | 'spokenColor'
    >
  >
) {
  const b = await getBook(id)
  if (!b) return null
  return saveBook({ ...b, ...patch })
}

export async function deleteBook(id: string) {
  const db = await openDb()
  const tx = db.transaction(STORE_BOOKS, 'readwrite')
  tx.objectStore(STORE_BOOKS).delete(id)
  await txDone(tx)
  emit()
}

/* ───────────────────────── Tracks (sin cambios de lógica musical) ───────────────────────── */

export async function listTracks(): Promise<TrackItem[]> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_TRACKS, 'readonly')
        .objectStore(STORE_TRACKS)
        .getAll()
      req.onsuccess = () => {
        const rows = (req.result as TrackItem[]) ?? []
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function getTrack(id: string): Promise<TrackItem | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_TRACKS, 'readonly')
        .objectStore(STORE_TRACKS)
        .get(id)
      req.onsuccess = () => resolve((req.result as TrackItem) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function getTrackBlob(blobKey: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_BLOBS, 'readonly')
        .objectStore(STORE_BLOBS)
        .get(blobKey)
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

function measureDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      audio.preload = 'metadata'
      const done = (ms: number) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* */
        }
        resolve(Math.round(ms))
      }
      audio.onloadedmetadata = () => {
        const d = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
        done(d)
      }
      audio.onerror = () => done(0)
      // timeout de seguridad (Android/WebView lentos)
      setTimeout(() => done(0), 8000)
      audio.src = url
    } catch {
      resolve(0)
    }
  })
}

export async function importTrackFile(file: File): Promise<TrackItem> {
  const blobKey = `trk-${uid()}`
  const durationMs = await measureDuration(file)
  const title = file.name.replace(/\.[^.]+$/, '') || 'Pista'
  const track: TrackItem = {
    id: uid(),
    title,
    artist: 'Desconocido',
    durationMs,
    blobKey,
    mime: file.type || 'audio/mpeg',
    coverDataUrl: null,
    createdAt: new Date().toISOString(),
    sizeBytes: file.size,
  }
  const db = await openDb()
  const tx = db.transaction([STORE_TRACKS, STORE_BLOBS], 'readwrite')
  tx.objectStore(STORE_BLOBS).put(file, blobKey)
  tx.objectStore(STORE_TRACKS).put(track)
  await txDone(tx)
  emit()
  return track
}

export async function updateTrack(
  id: string,
  patch: Partial<
    Pick<
      TrackItem,
      | 'title'
      | 'artist'
      | 'coverDataUrl'
      | 'year'
      | 'album'
      | 'sizeBytes'
      | 'lyrics'
    >
  >
) {
  const t = await getTrack(id)
  if (!t) return null
  const next: TrackItem = { ...t, ...patch }
  const db = await openDb()
  const tx = db.transaction(STORE_TRACKS, 'readwrite')
  tx.objectStore(STORE_TRACKS).put(next)
  await txDone(tx)
  emit()
  return next
}

export async function deleteTrack(id: string) {
  const t = await getTrack(id)
  if (!t) return
  const db = await openDb()
  const tx = db.transaction(
    [STORE_TRACKS, STORE_BLOBS, STORE_PLAYLISTS],
    'readwrite'
  )
  tx.objectStore(STORE_TRACKS).delete(id)
  tx.objectStore(STORE_BLOBS).delete(t.blobKey)
  const plReq = tx.objectStore(STORE_PLAYLISTS).getAll()
  await new Promise<void>((resolve, reject) => {
    plReq.onsuccess = () => {
      const lists = (plReq.result as Playlist[]) ?? []
      for (const pl of lists) {
        if (pl.trackIds.includes(id)) {
          pl.trackIds = pl.trackIds.filter((x) => x !== id)
          pl.updatedAt = new Date().toISOString()
          tx.objectStore(STORE_PLAYLISTS).put(pl)
        }
      }
      resolve()
    }
    plReq.onerror = () => reject(plReq.error)
  })
  await txDone(tx)
  emit()
}

/* ───────────────────────── Playlists ───────────────────────── */

export async function listPlaylists(): Promise<Playlist[]> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_PLAYLISTS, 'readonly')
        .objectStore(STORE_PLAYLISTS)
        .getAll()
      req.onsuccess = () => {
        const rows = (req.result as Playlist[]) ?? []
        rows.sort((a, b) => a.name.localeCompare(b.name, 'es'))
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function savePlaylist(pl: Playlist) {
  const db = await openDb()
  const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
  tx.objectStore(STORE_PLAYLISTS).put({
    ...pl,
    updatedAt: new Date().toISOString(),
  })
  await txDone(tx)
  emit()
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const pl: Playlist = {
    id: uid(),
    name: name.trim() || 'Lista',
    trackIds: [],
    updatedAt: new Date().toISOString(),
  }
  await savePlaylist(pl)
  return pl
}

export async function renamePlaylist(id: string, name: string) {
  const list = await listPlaylists()
  const pl = list.find((p) => p.id === id)
  if (!pl) return null
  const next = { ...pl, name: name.trim() || pl.name }
  await savePlaylist(next)
  return next
}

export async function deletePlaylist(id: string) {
  const db = await openDb()
  const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
  tx.objectStore(STORE_PLAYLISTS).delete(id)
  await txDone(tx)
  emit()
}

export function formatTrackTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}