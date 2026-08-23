/**
 * ============================================================================
 * exportImport.ts — Respaldo GCO v3
 * Web / PWA / Capacitor (con o sin plugins) / Electron
 * Sin import() de paquetes npm opcionales (APK antiguos no rompen).
 * ============================================================================
 */

import { getBgPrefs } from './customBackground'

export const EXPORT_USER_NOTICE = `
Qué incluye la copia de seguridad

Se guardan la configuración de la app, el progreso, las listas de reproducción,
los favoritos, las carpetas de audiolibros, los metadatos de cada pista y libro
(título, artista o autor, álbum, año, duración, peso, MIME, letra si la hay) y,
cuando es posible, las portadas en miniatura.

Qué NO se transfiere en el modo recomendado (“ligero”)

Los archivos de audio, vídeo o documentos originales (MP3, M4A, MP4, PDF, etc.)
no viajan dentro del respaldo. Solo se guardan referencias e identificadores
(nombre de archivo, título, carpeta lógica, tamaño y duración) para que, al
restaurar, la app pueda volver a enlazar automáticamente esos contenidos si
siguen existiendo en el dispositivo con el mismo nombre (y, si aplica, la misma
carpeta relativa) junto con portadas e imágenes asociadas.

Modo “completo”

Opcionalmente puedes generar un respaldo completo que embebe audio y textos
en el propio archivo JSON. Es más pesado y puede fallar en dispositivos con
poca memoria; úsalo solo si necesitas migrar sin volver a importar archivos.

Al importar

Se restauran preferencias y metadatos. Si los archivos coinciden por
nombre/metadatos, se reasignan solos. Si no, conserva títulos, listas y
progreso, y vuelve a importar los archivos que falten desde Música o Nutrición.
`.trim()

export const EXPORT_USER_NOTICE_SHORT =
  'El respaldo guarda metadatos, listas y preferencias. Los audios originales no se copian en modo ligero: se reenlazan si coinciden nombre y carpeta.'

export type BackupMode = 'light' | 'full'

export interface BackupPayloadV2 {
  version: 2
  profile: string | null
  progress: string | null
  bgPrefs: string | null
  theme: string | null
  exportedAt: string
}

export interface TrackFingerprint {
  id: string
  title: string
  artist: string
  album?: string
  year?: string
  durationMs?: number
  sizeBytes?: number
  mime?: string
  fileName?: string
  blobKey?: string
  lyrics?: string
  coverDataUrl?: string | null
  genre?: string
  trackNo?: number
  rating?: number
  playCount?: number
  lastPlayedAt?: string
}

export interface PlaylistSnapshot {
  id: string
  name: string
  trackIds: string[]
}

export interface BookFingerprint {
  id: string
  title: string
  author?: string
  year?: string
  folderId?: string | null
  position?: number
  coverDataUrl?: string | null
  text?: string
  textLength?: number
  textShaPreview?: string
}

export interface BookFolderSnapshot {
  id: string
  name: string
}

export interface BackupPayloadV3 {
  version: 3
  mode: BackupMode
  exportedAt: string
  app: { name: 'GCO'; platform?: string; userAgent?: string }
  localStorage: Record<string, string>
  music: {
    tracks: TrackFingerprint[]
    playlists: PlaylistSnapshot[]
    favorites: string[]
    embeddedAudioBase64?: Record<string, string>
  }
  nutrition: {
    books: BookFingerprint[]
    folders: BookFolderSnapshot[]
  }
  notes: string[]
}

export type BackupPayload = BackupPayloadV2 | BackupPayloadV3

export interface ExportOptions {
  mode?: BackupMode
  maxEmbedBytes?: number
  includeCovers?: boolean
  /** Incluir letras de pistas (default true). */
  includeLyrics?: boolean
  maxLightBookChars?: number
  fileName?: string
  preferSavePicker?: boolean
}

export interface ImportOptions {
  relinkMedia?: boolean
  merge?: boolean
}

export interface ImportResult {
  ok: boolean
  version: number
  restoredKeys: string[]
  musicTracks: number
  playlists: number
  books: number
  folders: number
  embeddedRestored: number
  warnings: string[]
  errors: string[]
}

export interface SaveResult {
  ok: boolean
  method: 'file-picker' | 'capacitor-share' | 'electron' | 'anchor-download' | 'none'
  fileName: string
  pathOrUri?: string
  error?: string
}

export interface ExportResult {
  payload: BackupPayloadV3
  save: SaveResult
}

const LS_PREFIX = 'gco:'
const DEFAULT_MAX_EMBED = 25 * 1024 * 1024
const DEFAULT_MAX_LIGHT_BOOK = 200_000

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function getCapacitor(): {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, any>
  isPluginAvailable?: (name: string) => boolean
} | null {
  if (!isBrowser()) return null
  try {
    return (window as any).Capacitor ?? null
  } catch {
    return null
  }
}

function isCapacitorNative(): boolean {
  try {
    return !!getCapacitor()?.isNativePlatform?.()
  } catch {
    return false
  }
}

function platformHint(): string {
  const cap = getCapacitor()
  if (cap?.isNativePlatform?.()) {
    return `capacitor:${cap.getPlatform?.() || 'native'}`
  }
  if (isBrowser() && /Electron/i.test(navigator.userAgent || '')) return 'electron'
  return isBrowser() ? 'web' : 'unknown'
}

function getCapPlugin<T = any>(name: string): T | null {
  const cap = getCapacitor()
  if (!cap) return null
  try {
    if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) {
      return null
    }
  } catch {
    /* */
  }
  return (cap.Plugins?.[name] as T) ?? null
}

export function snapshotLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isBrowser()) return out
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(LS_PREFIX)) continue
      const val = localStorage.getItem(key)
      if (val != null) out[key] = val
    }
  } catch {
    /* */
  }
  return out
}

function restoreLocalStorage(map: Record<string, string>, merge: boolean): string[] {
  const restored: string[] = []
  if (!isBrowser()) return restored
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith(LS_PREFIX)) continue
    try {
      if (merge && localStorage.getItem(key) != null) {
        if (key !== 'gco:music-favorites' && key !== 'gco:player-heatmap') continue
      }
      localStorage.setItem(key, value)
      restored.push(key)
    } catch {
      /* */
    }
  }
  return restored
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string, mime = 'application/octet-stream'): Blob {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function trackFileName(t: { title?: string; mime?: string; fileName?: string }): string {
  if (t.fileName) return t.fileName
  const base = (t.title || 'pista').replace(/[^\w\u00C0-\u024f.-]+/gi, '_').slice(0, 80)
  const ext =
    t.mime?.includes('mpeg') || t.mime?.includes('mp3')
      ? 'mp3'
      : t.mime?.includes('mp4') || t.mime?.includes('m4a')
        ? 'm4a'
        : t.mime?.includes('wav')
          ? 'wav'
          : t.mime?.includes('webm')
            ? 'webm'
            : 'audio'
  return `${base}.${ext}`
}

function defaultFileName(mode: BackupMode, version: number): string {
  const d = new Date()
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join('')
  return `gco-backup-${mode}-v${version}-${stamp}.json`
}

function pickCover(t: Record<string, unknown>): string | null {
  const keys = [
    'coverDataUrl',
    'coverUrl',
    'cover',
    'artwork',
    'artworkUrl',
    'imageDataUrl',
    'thumbnail',
    'thumb',
  ]
  for (const k of keys) {
    const v = t[k]
    if (typeof v === 'string' && v.length > 32) {
      if (
        v.startsWith('data:image') ||
        v.startsWith('https:') ||
        v.startsWith('http:') ||
        v.startsWith('blob:')
      ) {
        return v
      }
    }
  }
  const art = t.artwork
  if (Array.isArray(art) && art[0] && typeof (art[0] as { src?: string }).src === 'string') {
    return String((art[0] as { src: string }).src)
  }
  return null
}

async function saveWithFilePicker(blob: Blob, fileName: string): Promise<SaveResult | null> {
  if (!isBrowser()) return null
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string
      types?: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<{
      createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>
    }>
  }
  if (typeof w.showSaveFilePicker !== 'function') return null
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'Respaldo GCO (JSON)', accept: { 'application/json': ['.json'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { ok: true, method: 'file-picker', fileName }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError' || name === 'NotAllowedError') {
      return { ok: false, method: 'file-picker', fileName, error: 'cancelled' }
    }
    return null
  }
}

async function saveWithElectron(blob: Blob, fileName: string): Promise<SaveResult | null> {
  if (!isBrowser()) return null
  try {
    const w = window as any
    const api = w.gcoElectron?.saveBackup || w.electronAPI?.saveBackup
    if (typeof api !== 'function') return null
    const base64 = await blobToBase64(blob)
    const res = await api({ fileName, base64 })
    if (res?.ok) return { ok: true, method: 'electron', fileName, pathOrUri: res.path }
  } catch {
    /* */
  }
  return null
}

async function saveWithCapacitor(blob: Blob, fileName: string): Promise<SaveResult | null> {
  if (!isCapacitorNative()) return null
  const Filesystem = getCapPlugin<{
    writeFile: (o: {
      path: string
      data: string
      directory?: string
      recursive?: boolean
    }) => Promise<unknown>
    getUri: (o: { path: string; directory?: string }) => Promise<{ uri?: string }>
    Directory?: { Documents?: string }
  }>('Filesystem')
  if (!Filesystem?.writeFile) return null
  try {
    const base64 = await blobToBase64(blob)
    const directory = Filesystem.Directory?.Documents || 'DOCUMENTS'
    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory,
      recursive: true,
    })
    let uri: string | undefined
    try {
      const uriRes = await Filesystem.getUri({ path: fileName, directory })
      uri = uriRes?.uri
    } catch {
      /* */
    }
    const Share = getCapPlugin<{
      share: (o: {
        title?: string
        text?: string
        url?: string
        dialogTitle?: string
      }) => Promise<unknown>
    }>('Share')
    if (Share?.share && uri) {
      try {
        await Share.share({
          title: 'Copia de seguridad GCO',
          text: 'Respaldo GCO',
          url: uri,
          dialogTitle: 'Guardar o enviar respaldo GCO',
        })
      } catch {
        /* */
      }
    }
    return { ok: true, method: 'capacitor-share', fileName, pathOrUri: uri }
  } catch (e) {
    console.warn('[gco] Capacitor save falló:', e)
    return null
  }
}

async function saveWithAnchorDownload(blob: Blob, fileName: string): Promise<SaveResult> {
  if (!isBrowser()) {
    return { ok: false, method: 'none', fileName, error: 'no-browser' }
  }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    a.click()
    window.setTimeout(() => {
      try {
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        /* */
      }
    }, 4000)
    return { ok: true, method: 'anchor-download', fileName }
  } catch (e) {
    return {
      ok: false,
      method: 'anchor-download',
      fileName,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function saveBackupBlob(
  blob: Blob,
  fileName: string,
  preferSavePicker = true
): Promise<SaveResult> {
  if (preferSavePicker) {
    const picker = await saveWithFilePicker(blob, fileName)
    if (picker) return picker
  }
  const electron = await saveWithElectron(blob, fileName)
  if (electron) return electron
  const cap = await saveWithCapacitor(blob, fileName)
  if (cap) return cap
  return saveWithAnchorDownload(blob, fileName)
}

type MediaLib = {
  listTracks?: () => Promise<any[]>
  listPlaylists?: () => Promise<any[]>
  listBooks?: () => Promise<any[]>
  listFolders?: () => Promise<any[]>
  getTrackBlob?: (blobKey: string) => Promise<Blob | { blob: Blob } | null>
  importTrackFile?: (file: File, meta?: any) => Promise<any>
  updateTrack?: (id: string, patch: any) => Promise<any>
  savePlaylist?: (pl: any) => Promise<any>
  createPlaylist?: (name: string) => Promise<any>
  saveBook?: (input: any) => Promise<any>
  createFolder?: (name: string) => Promise<any>
  updateBookMeta?: (id: string, patch: any) => Promise<any>
  moveBookToFolder?: (bookId: string, folderId: string | null) => Promise<any>
}

async function loadMediaLibrary(): Promise<MediaLib | null> {
  try {
    return (await import('@/core/storage/mediaLibrary')) as MediaLib
  } catch {
    return null
  }
}

async function buildMusicSection(
  mode: BackupMode,
  maxEmbedBytes: number,
  includeCovers: boolean,
  includeLyrics: boolean,
  notes: string[]
): Promise<BackupPayloadV3['music']> {
  const lib = await loadMediaLibrary()
  const tracksRaw = (await lib?.listTracks?.().catch(() => [])) || []
  const playlistsRaw = (await lib?.listPlaylists?.().catch(() => [])) || []
  const favorites = safeJsonParse<string[]>(
    isBrowser() ? localStorage.getItem('gco:music-favorites') : null,
    []
  )
  const tracks: TrackFingerprint[] = []
  const embeddedAudioBase64: Record<string, string> = {}

  for (const t of tracksRaw) {
    if (!t || typeof t !== 'object') continue
    const cover = includeCovers ? pickCover(t as Record<string, unknown>) : null
    const fp: TrackFingerprint = {
      id: String(t.id ?? ''),
      title: String(t.title ?? 'Sin título'),
      artist: String(t.artist ?? ''),
      album: t.album != null ? String(t.album) : undefined,
      year: t.year != null ? String(t.year) : undefined,
      durationMs: typeof t.durationMs === 'number' ? t.durationMs : undefined,
      sizeBytes: typeof t.sizeBytes === 'number' ? t.sizeBytes : undefined,
      mime: t.mime != null ? String(t.mime) : undefined,
      fileName: t.fileName != null ? String(t.fileName) : trackFileName(t),
      blobKey: t.blobKey != null ? String(t.blobKey) : undefined,
      lyrics: includeLyrics && t.lyrics != null ? String(t.lyrics) : undefined,
      coverDataUrl: cover,
      genre: t.genre != null ? String(t.genre) : undefined,
      trackNo: typeof t.trackNo === 'number' ? t.trackNo : undefined,
      rating: typeof t.rating === 'number' ? t.rating : undefined,
      playCount: typeof t.playCount === 'number' ? t.playCount : undefined,
      lastPlayedAt: t.lastPlayedAt != null ? String(t.lastPlayedAt) : undefined,
    }
    if (!fp.id) continue
    tracks.push(fp)

    if (mode === 'full' && lib?.getTrackBlob && fp.blobKey) {
      try {
        const size = fp.sizeBytes ?? 0
        if (size > maxEmbedBytes) {
          notes.push(`Audio no embebido (grande): ${fp.title}`)
        } else {
          const raw = await lib.getTrackBlob(fp.blobKey)
          const blob =
            raw instanceof Blob
              ? raw
              : raw && typeof raw === 'object' && 'blob' in raw
                ? (raw as { blob: Blob }).blob
                : null
          if (blob && blob.size <= maxEmbedBytes) {
            embeddedAudioBase64[fp.id] = await blobToBase64(blob)
          }
        }
      } catch (e) {
        notes.push(`Error audio “${fp.title}”: ${String(e)}`)
      }
    }
  }

  const playlists: PlaylistSnapshot[] = playlistsRaw
    .filter((p) => p && p.id)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? 'Lista'),
      trackIds: Array.isArray(p.trackIds) ? p.trackIds.map(String) : [],
    }))

  return {
    tracks,
    playlists,
    favorites,
    ...(mode === 'full' && Object.keys(embeddedAudioBase64).length
      ? { embeddedAudioBase64 }
      : {}),
  }
}

async function buildNutritionSection(
  mode: BackupMode,
  includeCovers: boolean,
  maxLightBookChars: number,
  notes: string[]
): Promise<BackupPayloadV3['nutrition']> {
  const lib = await loadMediaLibrary()
  const booksRaw = (await lib?.listBooks?.().catch(() => [])) || []
  const foldersRaw = (await lib?.listFolders?.().catch(() => [])) || []
  const folders: BookFolderSnapshot[] = foldersRaw
    .filter((f) => f && f.id)
    .map((f) => ({ id: String(f.id), name: String(f.name ?? 'Carpeta') }))
  const books: BookFingerprint[] = []
  for (const b of booksRaw) {
    if (!b?.id) continue
    const text = typeof b.text === 'string' ? b.text : ''
    const fp: BookFingerprint = {
      id: String(b.id),
      title: String(b.title ?? 'Sin título'),
      author: b.author != null ? String(b.author) : undefined,
      year: b.year != null ? String(b.year) : undefined,
      folderId: b.folderId ?? null,
      position: typeof b.position === 'number' ? b.position : 0,
      coverDataUrl: includeCovers && b.coverDataUrl ? String(b.coverDataUrl) : null,
      textLength: text.length,
      textShaPreview: text.slice(0, 64),
    }
    if (mode === 'full') fp.text = text
    else if (text.length <= maxLightBookChars) fp.text = text
    else notes.push(`Texto omitido (ligero) “${fp.title}” (${text.length} chars)`)
    books.push(fp)
  }
  return { books, folders }
}

export async function buildBackupPayload(options: ExportOptions = {}): Promise<BackupPayloadV3> {
  const mode: BackupMode = options.mode ?? 'light'
  const maxEmbedBytes = options.maxEmbedBytes ?? DEFAULT_MAX_EMBED
  const includeCovers = options.includeCovers !== false
  const includeLyrics = options.includeLyrics !== false
  const maxLightBookChars = options.maxLightBookChars ?? DEFAULT_MAX_LIGHT_BOOK
  const notes: string[] = [
    mode === 'light'
      ? 'Modo ligero: sin blobs de audio.'
      : 'Modo completo: se intentan embeber audios/textos.',
  ]
  const music = await buildMusicSection(
    mode,
    maxEmbedBytes,
    includeCovers,
    includeLyrics,
    notes
  )
  const nutrition = await buildNutritionSection(mode, includeCovers, maxLightBookChars, notes)
  return {
    version: 3,
    mode,
    exportedAt: new Date().toISOString(),
    app: {
      name: 'GCO',
      platform: platformHint(),
      userAgent: isBrowser() ? navigator.userAgent : undefined,
    },
    localStorage: snapshotLocalStorage(),
    music,
    nutrition,
    notes,
  }
}

export async function exportData(options: ExportOptions = {}): Promise<ExportResult> {
  const opts: ExportOptions = { ...options, mode: options.mode ?? 'light' }
  const payload = await buildBackupPayload(opts)
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const fileName = opts.fileName || defaultFileName(payload.mode, payload.version)
  const save = await saveBackupBlob(blob, fileName, opts.preferSavePicker !== false)
  try {
    void getBgPrefs()
  } catch {
    /* */
  }
  return { payload, save }
}

export function exportDataLight(o: Omit<ExportOptions, 'mode'> = {}) {
  return exportData({ ...o, mode: 'light' })
}

export function exportDataFull(o: Omit<ExportOptions, 'mode'> = {}) {
  return exportData({ ...o, mode: 'full' })
}

function isV3(data: BackupPayload): data is BackupPayloadV3 {
  return Number((data as BackupPayloadV3).version) === 3
}
function isV2(data: BackupPayload): data is BackupPayloadV2 {
  return Number((data as BackupPayloadV2).version) === 2
}

async function importMusicV3(
  music: BackupPayloadV3['music'],
  opts: ImportOptions,
  result: ImportResult
) {
  const lib = await loadMediaLibrary()
  if (!lib) {
    result.warnings.push('mediaLibrary no disponible')
    return
  }
  try {
    const key = 'gco:music-favorites'
    if (opts.merge) {
      const cur = safeJsonParse<string[]>(localStorage.getItem(key), [])
      localStorage.setItem(
        key,
        JSON.stringify(Array.from(new Set([...cur, ...(music.favorites || [])])))
      )
    } else if (music.favorites) {
      localStorage.setItem(key, JSON.stringify(music.favorites))
    }
  } catch {
    /* */
  }

  const fingerOf = (t: any) =>
    [
      (t.title || '').toLowerCase().trim(),
      (t.artist || '').toLowerCase().trim(),
      t.durationMs ?? '',
      t.sizeBytes ?? '',
      (t.fileName || '').toLowerCase(),
    ].join('|')

  let existing = (await lib.listTracks?.().catch(() => [])) || []
  const byId = new Map<string, any>()
  const byFinger = new Map<string, any>()
  const reindex = (list: any[]) => {
    byId.clear()
    byFinger.clear()
    for (const t of list) {
      if (!t?.id) continue
      byId.set(String(t.id), t)
      byFinger.set(fingerOf(t), t)
    }
  }
  reindex(existing)

  if (opts.relinkMedia !== false && music.embeddedAudioBase64 && lib.importTrackFile) {
    for (const [id, b64] of Object.entries(music.embeddedAudioBase64)) {
      const meta = music.tracks.find((t) => t.id === id)
      try {
        const mime = meta?.mime || 'audio/mpeg'
        const file = new File(
          [base64ToBlob(b64, mime)],
          meta ? trackFileName(meta) : `${id}.mp3`,
          { type: mime }
        )
        await lib.importTrackFile(file, {
          title: meta?.title,
          artist: meta?.artist,
          album: meta?.album,
          year: meta?.year,
          lyrics: meta?.lyrics,
          coverDataUrl: meta?.coverDataUrl,
        })
        result.embeddedRestored += 1
      } catch (e) {
        result.warnings.push(`Audio embebido ${id}: ${String(e)}`)
      }
    }
    existing = (await lib.listTracks?.().catch(() => [])) || []
    reindex(existing)
  }

  if (lib.updateTrack) {
    for (const fp of music.tracks) {
      const target = byId.get(fp.id) || byFinger.get(fingerOf(fp))
      if (!target) {
        result.warnings.push(`Pista no encontrada: ${fp.title}`)
        continue
      }
      try {
        await lib.updateTrack(target.id, {
          title: fp.title,
          artist: fp.artist,
          album: fp.album,
          year: fp.year,
          lyrics: fp.lyrics,
          coverDataUrl: fp.coverDataUrl ?? undefined,
          cover: fp.coverDataUrl ?? undefined,
          genre: fp.genre,
          trackNo: fp.trackNo,
          rating: fp.rating,
          playCount: fp.playCount,
          lastPlayedAt: fp.lastPlayedAt,
        })
        result.musicTracks += 1
      } catch (e) {
        result.warnings.push(`Meta “${fp.title}”: ${String(e)}`)
      }
    }
  }

  const idMap = new Map<string, string>()
  for (const fp of music.tracks) {
    const target = byId.get(fp.id) || byFinger.get(fingerOf(fp))
    if (target) idMap.set(fp.id, String(target.id))
  }
  for (const pl of music.playlists) {
    try {
      const mappedIds = pl.trackIds
        .map((old) => idMap.get(old) || (byId.has(old) ? old : null))
        .filter(Boolean) as string[]
      if (lib.createPlaylist && lib.savePlaylist) {
        const created = await lib.createPlaylist(pl.name)
        await lib.savePlaylist({
          id: created?.id || pl.id,
          name: pl.name,
          trackIds: mappedIds,
        })
        result.playlists += 1
      } else if (lib.savePlaylist) {
        await lib.savePlaylist({ id: pl.id, name: pl.name, trackIds: mappedIds })
        result.playlists += 1
      }
    } catch (e) {
      result.warnings.push(`Lista “${pl.name}”: ${String(e)}`)
    }
  }
}

async function importNutritionV3(
  nutrition: BackupPayloadV3['nutrition'],
  result: ImportResult
) {
  const lib = await loadMediaLibrary()
  if (!lib) {
    result.warnings.push('mediaLibrary ausente (libros)')
    return
  }
  const folderIdMap = new Map<string, string>()
  if (lib.createFolder) {
    for (const f of nutrition.folders) {
      try {
        const created = await lib.createFolder(f.name)
        folderIdMap.set(f.id, created?.id ? String(created.id) : f.id)
        result.folders += 1
      } catch {
        folderIdMap.set(f.id, f.id)
      }
    }
  }
  const existingBooks = (await lib.listBooks?.().catch(() => [])) || []
  const bookByTitle = new Map<string, any>()
  for (const b of existingBooks) {
    if (b?.title) bookByTitle.set(String(b.title).toLowerCase().trim(), b)
  }
  for (const bk of nutrition.books) {
    const folderId =
      bk.folderId != null && bk.folderId !== ''
        ? folderIdMap.get(String(bk.folderId)) ?? bk.folderId
        : null
    try {
      if (bk.text && lib.saveBook) {
        await lib.saveBook({
          title: bk.title,
          text: bk.text,
          author: bk.author,
          year: bk.year,
          coverDataUrl: bk.coverDataUrl,
          folderId,
          position: bk.position ?? 0,
        })
        result.books += 1
      } else {
        const hit = bookByTitle.get(bk.title.toLowerCase().trim())
        if (hit && lib.updateBookMeta) {
          await lib.updateBookMeta(hit.id, {
            title: bk.title,
            author: bk.author,
            year: bk.year,
            coverDataUrl: bk.coverDataUrl,
          })
          if (folderId !== undefined && lib.moveBookToFolder) {
            await lib.moveBookToFolder(hit.id, folderId)
          }
          result.books += 1
        } else {
          result.warnings.push(`Libro sin texto / no encontrado: ${bk.title}`)
        }
      }
    } catch (e) {
      result.errors.push(`Libro “${bk.title}”: ${String(e)}`)
    }
  }
}

export async function importData(file: File, options: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = {
    ok: false,
    version: 0,
    restoredKeys: [],
    musicTracks: 0,
    playlists: 0,
    books: 0,
    folders: 0,
    embeddedRestored: 0,
    warnings: [],
    errors: [],
  }
  let data: BackupPayload
  try {
    data = JSON.parse(await file.text()) as BackupPayload
  } catch (e) {
    result.errors.push(`JSON inválido: ${String(e)}`)
    return result
  }
  try {
    if (isV2(data)) {
      result.version = 2
      if (data.profile) {
        localStorage.setItem('gco:profile', data.profile)
        result.restoredKeys.push('gco:profile')
      }
      if (data.progress) {
        localStorage.setItem('gco:progress', data.progress)
        result.restoredKeys.push('gco:progress')
      }
      if (data.bgPrefs) {
        localStorage.setItem('gco:bg-prefs', data.bgPrefs)
        result.restoredKeys.push('gco:bg-prefs')
      }
      if (data.theme) {
        localStorage.setItem('gco:theme', data.theme)
        result.restoredKeys.push('gco:theme')
      }
      result.ok = true
      result.warnings.push('Respaldo v2: solo preferencias básicas')
    } else if (isV3(data)) {
      result.version = 3
      result.restoredKeys = restoreLocalStorage(data.localStorage || {}, !!options.merge)
      await importMusicV3(
        data.music || { tracks: [], playlists: [], favorites: [] },
        options,
        result
      )
      await importNutritionV3(data.nutrition || { books: [], folders: [] }, result)
      if (data.notes?.length) result.warnings.push(...data.notes.map((n) => `[export] ${n}`))
      result.ok = result.errors.length === 0
    } else {
      result.errors.push('Versión no reconocida')
    }
  } catch (e) {
    result.errors.push(String(e))
  }
  try {
    void getBgPrefs()
  } catch {
    /* */
  }
  if (isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent('gco:library'))
      window.dispatchEvent(new CustomEvent('gco:backup-imported', { detail: result }))
    } catch {
      /* */
    }
  }
  return result
}

export function pickAndImportData(options: ImportOptions = {}): Promise<ImportResult> {
  const cancelled = (): ImportResult => ({
    ok: false,
    version: 0,
    restoredKeys: [],
    musicTracks: 0,
    playlists: 0,
    books: 0,
    folders: 0,
    embeddedRestored: 0,
    warnings: [],
    errors: ['cancelled'],
  })

  return (async () => {
    try {
      const w = window as any
      const open = w.gcoElectron?.openBackup || w.electronAPI?.openBackup
      if (typeof open === 'function') {
        const res = await open()
        if (res?.base64) {
          const file = new File(
            [base64ToBlob(res.base64, 'application/json')],
            res.fileName || 'backup.json',
            { type: 'application/json' }
          )
          return importData(file, options)
        }
      }
    } catch {
      /* */
    }

    const file = await new Promise<File | null>((resolve) => {
      if (!isBrowser()) {
        resolve(null)
        return
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json,text/json,text/plain'
      input.style.display = 'none'
      input.onchange = () => {
        const f = input.files?.[0] || null
        try {
          input.remove()
        } catch {
          /* */
        }
        resolve(f)
      }
      document.body.appendChild(input)
      input.click()
    })

    if (!file) return cancelled()
    return importData(file, options)
  })()
}