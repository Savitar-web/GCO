/** Biblioteca de audiolibros (texto) y música (blobs) en IndexedDB */

const DB_NAME = 'gco-media-library'
const DB_VERSION = 2
const STORE_BOOKS = 'books'
const STORE_TRACKS = 'tracks'
const STORE_PLAYLISTS = 'playlists'
const STORE_BLOBS = 'blobs'
const STORE_FOLDERS = 'folders'

export interface BookFolder {
  id: string
  name: string
  parentId: string | null
  updatedAt: string
}

export interface BookItem {
  id: string
  title: string
  folderId: string | null
  text: string
  position: number
  rate: number
  voiceURI?: string
  highlightColor?: string
  spokenColor?: string
  lang?: string
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
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  updatedAt: string
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    req.onerror = () => reject(req.error)
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
  window.dispatchEvent(new CustomEvent('gco:library'))
}

// ─── Folders ───────────────────────────────────────────────────────────────

export async function listFolders(): Promise<BookFolder[]> {
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
      await saveBook({
        id: b.id,
        title: b.title,
        text: b.text,
        folderId: null,
        position: b.position,
        rate: b.rate,
        voiceURI: b.voiceURI,
        highlightColor: b.highlightColor,
        spokenColor: b.spokenColor,
        lang: b.lang,
      })
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_FOLDERS, 'readwrite')
  tx.objectStore(STORE_FOLDERS).delete(id)
  await txDone(tx)
  emit()
}

// ─── Books ─────────────────────────────────────────────────────────────────

export async function listBooks(): Promise<BookItem[]> {
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
}

export async function getBook(id: string): Promise<BookItem | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_BOOKS, 'readonly')
      .objectStore(STORE_BOOKS)
      .get(id)
    req.onsuccess = () => resolve((req.result as BookItem) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function saveBook(
  input: Partial<BookItem> & { title: string; text: string }
): Promise<BookItem> {
  const now = new Date().toISOString()
  const existing = input.id ? await getBook(input.id) : null
  const book: BookItem = {
    id: existing?.id ?? input.id ?? uid(),
    title: input.title.trim() || 'Sin título',
    folderId:
      input.folderId !== undefined
        ? input.folderId
        : (existing?.folderId ?? null),
    text: input.text,
    position: input.position ?? existing?.position ?? 0,
    rate: input.rate ?? existing?.rate ?? 1,
    voiceURI: input.voiceURI ?? existing?.voiceURI,
    highlightColor: input.highlightColor ?? existing?.highlightColor,
    spokenColor: input.spokenColor ?? existing?.spokenColor,
    lang: input.lang ?? existing?.lang,
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

export async function deleteBook(id: string) {
  const db = await openDb()
  const tx = db.transaction(STORE_BOOKS, 'readwrite')
  tx.objectStore(STORE_BOOKS).delete(id)
  await txDone(tx)
  emit()
}

// ─── Tracks ────────────────────────────────────────────────────────────────

export async function listTracks(): Promise<TrackItem[]> {
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
}

export async function getTrack(id: string): Promise<TrackItem | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_TRACKS, 'readonly')
      .objectStore(STORE_TRACKS)
      .get(id)
    req.onsuccess = () => resolve((req.result as TrackItem) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function getTrackBlob(blobKey: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_BLOBS, 'readonly')
      .objectStore(STORE_BLOBS)
      .get(blobKey)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

function measureDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
      URL.revokeObjectURL(url)
      resolve(Math.round(d))
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    audio.src = url
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
  patch: Partial<Pick<TrackItem, 'title' | 'artist' | 'coverDataUrl'>>
) {
  const t = await getTrack(id)
  if (!t) return null
  const next = { ...t, ...patch }
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

// ─── Playlists ─────────────────────────────────────────────────────────────

export async function listPlaylists(): Promise<Playlist[]> {
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