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

/* ============================================================================
 * NOTA DE ARQUITECTURA — REPRODUCCIÓN ININTERRUMPIDA ENTRE MODOS
 * `useMediaPlayer()` está respaldado por un motor de audio compartido a nivel
 * de aplicación (una única instancia de <audio>/AudioContext que vive fuera
 * del árbol de React de este componente). Esta vista es solo una "ventana"
 * hacia ese estado global: montar o desmontar `MusicaHome` — por ejemplo al
 * saltar de modo con `ModeSwitch` hacia GymCog o Nutrición vía `AppModeGate`
 * — NO debe crear ni destruir el motor de audio, así que aquí nunca se llama
 * a pausa/stop en la limpieza de efectos. El audio sigue sonando en
 * `CategoryMenu.tsx`, `NutricionHome.tsx` o cualquier otra pantalla mientras
 * el motor global no reciba una orden explícita de pausa/stop del usuario.
 * El único efecto ligado al ciclo de vida de este componente es el
 * wake-lock de pantalla, que es una mejora local y no crítica para el audio.
 * ========================================================================= */

type Tab = 'library' | 'playlists' | 'now' | 'import' | 'more'
type LibFilter = 'recents' | 'favorites'
type SortMode = 'recent' | 'title' | 'artist' | 'duration'

type TrackMenuState = {
  track: TrackItem
  x: number
  y: number
}

/** Resultado de búsqueda / objetivo de descarga de YouTube (panel de Importar). */
type YtSearchResult = {
  id: string
  title: string
  url: string
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const FAV_KEY = 'gco:music-favorites'

/** Solo mapeamos las variantes que este panel expone en la UI. El tipo
 *  `SpecStyle` puede tener más miembros a futuro; usamos un registro parcial
 *  con fallback en vez de un Record exhaustivo para no romper el build cada
 *  vez que se amplíe el motor de visualización. */
const SPEC_STYLES: SpecStyle[] = ['bars', 'wave', 'sphere', 'mirror', 'pulse'] as SpecStyle[]
const SPEC_STYLE_LABELS: Partial<Record<SpecStyle, string>> = {
  bars: 'Barras',
  wave: 'Onda',
  sphere: 'Esfera',
  mirror: 'Espejo',
  pulse: 'Pulso',
}
const specLabel = (s: SpecStyle) => SPEC_STYLE_LABELS[s] ?? String(s)

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

/* ============================================================================
 * ICONOGRAFÍA — set de iconos lineales propios (sin dependencias externas),
 * consistentes con un lenguaje visual iOS-2026: trazos finos, esquinas
 * redondeadas, tamaños predecibles. Sustituyen por completo los emojis.
 * NOTA: los componentes de icono solo aceptan `size`/`strokeWidth`. Para
 * transformaciones (p. ej. rotar una flecha) se envuelve el icono en un
 * <span> con `style`, en vez de pasarle `style` directamente al icono.
 * ========================================================================= */

type IconProps = { size?: number; strokeWidth?: number }

const Icon = {
  play: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" />
    </svg>
  ),
  pause: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4.4" height="14" rx="1.4" />
      <rect x="13.6" y="5" width="4.4" height="14" rx="1.4" />
    </svg>
  ),
  heart: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.2-4.6-10-9.3C.4 8.6 1.9 4.9 5.4 4.1c2-.5 4 .3 5.2 2 1.2-1.7 3.2-2.5 5.2-2 3.5.8 5 4.5 3.4 7.6C19.2 16.4 12 21 12 21z" />
    </svg>
  ),
  heartOutline: ({ size = 18, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7.2-4.6-10-9.3C.4 8.6 1.9 4.9 5.4 4.1c2-.5 4 .3 5.2 2 1.2-1.7 3.2-2.5 5.2-2 3.5.8 5 4.5 3.4 7.6C19.2 16.4 12 21 12 21z" />
    </svg>
  ),
  dots: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  ),
  chevronUp: ({ size = 16, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 15l6-6 6 6" />
    </svg>
  ),
  chevronDown: ({ size = 16, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  chevronRight: ({ size = 16, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  arrowLeft: ({ size = 18, strokeWidth = 1.9 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  ),
  search: ({ size = 17, strokeWidth = 1.9 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  close: ({ size = 16, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  plus: ({ size = 18, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  gear: ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 13.5a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19.5a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4.5a2 2 0 110-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.03a1.65 1.65 0 001-1.51V4.5a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.03a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.03c.24.62.8 1.05 1.51 1.08h.16a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  musicNote: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 18a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M18 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M12 15V4.8a.7.7 0 01.9-.68l6 1.63a.7.7 0 01.5.68V9" strokeWidth="0" />
      <path d="M12 15V5l9-2v10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  playlist: ({ size = 22, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h13M4 12h13M4 18h8" />
      <circle cx="19.5" cy="17.5" r="2.6" />
      <path d="M20.5 15v5" />
    </svg>
  ),
  queue: ({ size = 20, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h13M3 12h13M3 18h8" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  ),
  drag: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" />
      <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
      <circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
    </svg>
  ),
  download: ({ size = 30, strokeWidth = 1.6 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  ),
  package: ({ size = 18, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
  volume: ({ size = 18, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 8a5 5 0 010 8" />
      <path d="M19.5 5.5a9 9 0 010 13" />
    </svg>
  ),
  palette: ({ size = 18, strokeWidth = 1.6 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a9 9 0 100 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4 4 0 004-4c0-4.4-3.6-8.2-8-8.2z" />
      <circle cx="7.2" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="8.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="10.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  chart: ({ size = 18, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  ),
  lyrics: ({ size = 18, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  ),
  library: ({ size = 22, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 14v-2a8 8 0 0116 0v2" />
      <rect x="2" y="14" width="5" height="6" rx="1.5" />
      <rect x="17" y="14" width="5" height="6" rx="1.5" />
    </svg>
  ),
  importIcon: ({ size = 22, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  ),
  moreGrid: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  ),
  artist: ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.5 3.1-6.3 7-6.3s7 2.8 7 6.3" />
    </svg>
  ),
  sort: ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8h12M9 12h6M11 16h2" />
    </svg>
  ),
  clock: ({ size = 15, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  shuffle: ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h3.5L16 18h4.5M3 18h3.5L11 12M16 6h4.5" />
      <path d="M18 3l2.5 3L18 9M18 15l2.5 3-2.5 3" />
    </svg>
  ),
  headphones: ({ size = 34, strokeWidth = 1.5 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 13.5A9 9 0 0121 13.5" />
      <rect x="3" y="13.5" width="4" height="6.2" rx="1.6" />
      <rect x="17" y="13.5" width="4" height="6.2" rx="1.6" />
    </svg>
  ),
  editPencil: ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  ),
  trash: ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V4.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1V7" />
      <path d="M6.5 7l.7 12.2c.05.9.8 1.6 1.7 1.6h6.2c.9 0 1.65-.7 1.7-1.6L18.5 7" />
    </svg>
  ),
  weight: ({ size = 16, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20h18l-3-11H6L3 20z" />
      <path d="M9 9a3 3 0 016 0" />
    </svg>
  ),
  info: ({ size = 16, strokeWidth = 1.75 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 8v.01" />
    </svg>
  ),
  checkCircle: ({ size = 16, strokeWidth = 1.9 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.4 2.4 5-5.2" />
    </svg>
  ),
  fileMusic: ({ size = 42, strokeWidth = 1.4 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M9.5 16.6a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z" fill="currentColor" stroke="none" />
      <path d="M11.1 15V10.7l3-.6v4.3" />
    </svg>
  ),
  fit: ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3H5a2 2 0 00-2 2v3" />
      <path d="M16 3h3a2 2 0 012 2v3" />
      <path d="M8 21H5a2 2 0 01-2-2v-3" />
      <path d="M16 21h3a2 2 0 002-2v-3" />
    </svg>
  ),
}

/* ============================================================================
 * EXTRACCIÓN DE METADATOS EMBEBIDOS (ID3v2 en MP3 · átomos MP4/M4A)
 * Sin dependencias externas. Todo el árbol de funciones está protegido con
 * try/catch: si un archivo viene corrupto o con un formato no estándar, la
 * extracción simplemente devuelve {} y la importación continúa con normalidad.
 * ========================================================================= */

type ExtractedAudioMeta = {
  title?: string
  artist?: string
  album?: string
  year?: string
  coverDataUrl?: string
}

const TEXT_DECODER_LATIN1 = new TextDecoder('iso-8859-1')
const TEXT_DECODER_UTF16 = new TextDecoder('utf-16')
const TEXT_DECODER_UTF8 = new TextDecoder('utf-8')

/** Convierte bytes binarios (portada embebida) en un data: URL, sin usar FileReader (síncrono). */
function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/** Entero "synchsafe" de 4 bytes usado por las cabeceras ID3v2 (7 bits útiles por byte). */
function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  )
}

function decodeId3Text(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  const encodingByte = bytes[0]
  const rest = bytes.subarray(1)
  try {
    if (encodingByte === 1 || encodingByte === 2) {
      return TEXT_DECODER_UTF16.decode(rest).replace(/\u0000+$/g, '').trim()
    }
    if (encodingByte === 3) {
      return TEXT_DECODER_UTF8.decode(rest).replace(/\u0000+$/g, '').trim()
    }
    return TEXT_DECODER_LATIN1.decode(rest).replace(/\u0000+$/g, '').trim()
  } catch {
    return ''
  }
}

/** Decodifica el frame APIC (portada embebida) de un tag ID3v2. */
function decodeApicFrame(frameBytes: Uint8Array): string | null {
  try {
    const encoding = frameBytes[0]
    let p = 1
    while (p < frameBytes.length && frameBytes[p] !== 0) p++
    const mime = TEXT_DECODER_LATIN1.decode(frameBytes.subarray(1, p)) || 'image/jpeg'
    p += 1 // separador tras el MIME
    p += 1 // byte de "picture type" (portada frontal, etc.)
    if (encoding === 1 || encoding === 2) {
      while (p + 1 < frameBytes.length && !(frameBytes[p] === 0 && frameBytes[p + 1] === 0)) p += 2
      p += 2
    } else {
      while (p < frameBytes.length && frameBytes[p] !== 0) p++
      p += 1
    }
    const imageBytes = frameBytes.subarray(p)
    if (!imageBytes.length) return null
    return bytesToDataUrl(imageBytes, mime.toLowerCase().includes('png') ? 'image/png' : 'image/jpeg')
  } catch {
    return null
  }
}

/** Lee tags ID3v2.3 / ID3v2.4 (MP3): título, artista, álbum, año y portada. */
function parseId3v2(buffer: ArrayBuffer): ExtractedAudioMeta {
  const meta: ExtractedAudioMeta = {}
  try {
    const bytes = new Uint8Array(buffer)
    if (bytes.length < 10) return meta
    const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 // "ID3"
    if (!isId3) return meta

    const majorVersion = bytes[3]
    const hasExtendedHeader = (bytes[5] & 0x40) !== 0
    const tagSize = readSynchsafeInt(bytes, 6)
    const view = new DataView(buffer)

    let offset = 10
    if (hasExtendedHeader) {
      const extSize = majorVersion >= 4 ? readSynchsafeInt(bytes, offset) : view.getUint32(offset)
      offset += extSize
    }

    const end = Math.min(bytes.length, 10 + tagSize)

    while (offset + 10 <= end) {
      const frameId = TEXT_DECODER_LATIN1.decode(bytes.subarray(offset, offset + 4))
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break

      const frameSize = majorVersion >= 4 ? readSynchsafeInt(bytes, offset + 4) : view.getUint32(offset + 4)
      const frameStart = offset + 10
      const frameEnd = frameStart + frameSize
      if (frameSize <= 0 || frameEnd > end) break

      const frameBytes = bytes.subarray(frameStart, frameEnd)

      if (frameId === 'TIT2') meta.title = decodeId3Text(frameBytes) || meta.title
      else if (frameId === 'TPE1' || frameId === 'TPE2') meta.artist = decodeId3Text(frameBytes) || meta.artist
      else if (frameId === 'TALB') meta.album = decodeId3Text(frameBytes) || meta.album
      else if (frameId === 'TYER' || frameId === 'TDRC') {
        const y = decodeId3Text(frameBytes).slice(0, 4)
        if (/^\d{4}$/.test(y)) meta.year = y
      } else if (frameId === 'APIC') {
        const img = decodeApicFrame(frameBytes)
        if (img) meta.coverDataUrl = img
      }

      offset = frameEnd
    }
  } catch {
    /* tag ID3 corrupto o truncado: se conserva lo que se haya podido leer hasta el error */
  }
  return meta
}

type Mp4Box = { type: string; start: number; end: number }

function readBoxes(view: DataView, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    const size = view.getUint32(offset)
    if (size < 8) break
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    )
    const boxEnd = Math.min(end, offset + size)
    boxes.push({ type, start: offset + 8, end: boxEnd })
    offset = boxEnd
  }
  return boxes
}

function findBox(boxes: Mp4Box[], type: string): Mp4Box | undefined {
  return boxes.find((b) => b.type === type)
}

/** Lee metadatos iTunes-style de contenedores MP4/M4A: moov > udta > meta > ilst. */
function parseMp4Tags(buffer: ArrayBuffer): ExtractedAudioMeta {
  const meta: ExtractedAudioMeta = {}
  try {
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const top = readBoxes(view, 0, buffer.byteLength)
    const moov = findBox(top, 'moov')
    if (!moov) return meta

    const moovBoxes = readBoxes(view, moov.start, moov.end)
    const udta = findBox(moovBoxes, 'udta')
    if (!udta) return meta

    const udtaBoxes = readBoxes(view, udta.start, udta.end)
    const metaBox = findBox(udtaBoxes, 'meta')
    if (!metaBox) return meta

    // El box 'meta' trae 4 bytes de version/flags antes de sus hijos.
    const metaChildren = readBoxes(view, metaBox.start + 4, metaBox.end)
    const ilst = findBox(metaChildren, 'ilst')
    if (!ilst) return meta

    const items = readBoxes(view, ilst.start, ilst.end)

    const readDataString = (item: Mp4Box): string | undefined => {
      const dataBoxes = readBoxes(view, item.start, item.end)
      const data = findBox(dataBoxes, 'data')
      if (!data) return undefined
      const payloadStart = data.start + 8 // 4 bytes tipo + 4 bytes locale
      const text = TEXT_DECODER_UTF8.decode(bytes.subarray(payloadStart, data.end)).trim()
      return text || undefined
    }

    const readDataImage = (item: Mp4Box): string | undefined => {
      const dataBoxes = readBoxes(view, item.start, item.end)
      const data = findBox(dataBoxes, 'data')
      if (!data) return undefined
      const payloadStart = data.start + 8
      const imgBytes = bytes.subarray(payloadStart, data.end)
      if (!imgBytes.length) return undefined
      const isPng = imgBytes[0] === 0x89 && imgBytes[1] === 0x50
      return bytesToDataUrl(imgBytes, isPng ? 'image/png' : 'image/jpeg')
    }

    for (const item of items) {
      if (item.type === '\u00A9nam') meta.title = readDataString(item) ?? meta.title
      else if (item.type === '\u00A9ART') meta.artist = readDataString(item) ?? meta.artist
      else if (item.type === '\u00A9alb') meta.album = readDataString(item) ?? meta.album
      else if (item.type === '\u00A9day') {
        const y = (readDataString(item) ?? '').slice(0, 4)
        if (/^\d{4}$/.test(y)) meta.year = y
      } else if (item.type === 'covr') meta.coverDataUrl = readDataImage(item) ?? meta.coverDataUrl
    }
  } catch {
    /* contenedor MP4 no estándar, cifrado o truncado: se ignora silenciosamente */
  }
  return meta
}

/**
 * Punto de entrada de la extracción de metadatos. Se ejecuta en el propio
 * navegador (sin backend) leyendo solo los bytes necesarios del archivo:
 * - MP3: primeros ~1.5MB (los tags ID3v2 siempre van al inicio).
 * - MP4/M4A: archivo completo si es liviano (<40MB), o los primeros 20MB si es grande
 *   (el átomo 'moov' casi siempre está cerca del inicio o del final; este límite evita
 *   bloquear la UI con archivos de vídeo enormes sin sacrificar la mayoría de los casos reales).
 */
async function extractAudioMetadata(file: File): Promise<ExtractedAudioMeta> {
  try {
    const name = file.name.toLowerCase()
    const isMp3 = file.type.includes('mpeg') || file.type.includes('mp3') || name.endsWith('.mp3')
    const isMp4Family =
      file.type.includes('mp4') || file.type.includes('m4a') || /\.(m4a|mp4|m4b)$/i.test(name)

    if (isMp3) {
      const head = await file.slice(0, 1_500_000).arrayBuffer()
      const meta = parseId3v2(head)
      if (Object.keys(meta).length) return meta
    }

    if (isMp4Family) {
      const buffer = await (file.size <= 40_000_000
        ? file.arrayBuffer()
        : file.slice(0, 20_000_000).arrayBuffer())
      const meta = parseMp4Tags(buffer)
      if (Object.keys(meta).length) return meta
    }
  } catch {
    /* la extracción de metadatos es una mejora opcional: nunca debe romper la importación */
  }
  return {}
}

/* ============================================================================
 * EDITOR DE PORTADA — recorte cuadrado con panorámica y zoom.
 * Toda la matemática se expresa en proporciones (0–100%) para que la vista
 * previa en pantalla y el recorte final por canvas usen exactamente la misma
 * fórmula, solo con distinto tamaño de "lienzo" (contenedor visual vs salida).
 * ========================================================================= */

const COVER_PREVIEW_SIZE = 260
const COVER_OUTPUT_SIZE = 1024
const COVER_MIN_RECOMMENDED = 500

type CoverTransform = { drawW: number; drawH: number; offsetX: number; offsetY: number }

function computeCoverTransform(
  natW: number,
  natH: number,
  containerSize: number,
  zoom: number,
  posXPct: number,
  posYPct: number
): CoverTransform {
  const safeW = Math.max(1, natW)
  const safeH = Math.max(1, natH)
  const baseScale = Math.max(containerSize / safeW, containerSize / safeH)
  const scale = baseScale * Math.max(1, zoom)
  const drawW = safeW * scale
  const drawH = safeH * scale
  const maxOffsetX = Math.max(0, drawW - containerSize)
  const maxOffsetY = Math.max(0, drawH - containerSize)
  const offsetX = (Math.min(100, Math.max(0, posXPct)) / 100) * maxOffsetX
  const offsetY = (Math.min(100, Math.max(0, posYPct)) / 100) * maxOffsetY
  return { drawW, drawH, offsetX, offsetY }
}

function cropCoverToSquareDataUrl(
  src: string,
  natW: number,
  natH: number,
  posXPct: number,
  posYPct: number,
  zoom: number,
  outSize = COVER_OUTPUT_SIZE
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = outSize
        canvas.height = outSize
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas no disponible')
        const t = computeCoverTransform(natW, natH, outSize, zoom, posXPct, posYPct)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, -t.offsetX, -t.offsetY, t.drawW, t.drawH)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

/* ============================================================================
 * BLINDAJE DE REPRODUCCIÓN EN SEGUNDO PLANO
 * Cubre tres frentes de forma defensiva (nunca lanza si algo no existe):
 *  1) Navegador / PWA  → Screen Wake Lock API.
 *  2) Capacitor (APK)  → BackgroundMode / KeepAwake si están instalados.
 *  3) Electron (.exe)  → puente opcional expuesto por el preload script.
 * Este guard es una mejora local (evita que el SO apague la pantalla) y no
 * controla el audio en sí: el audio sigue sonando aunque este componente y
 * su wake-lock se desmonten al cambiar de modo.
 * ========================================================================= */

type WakeLockSentinelLike = { release: () => Promise<void> }

function useBackgroundPlaybackGuard(playing: boolean) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    let cancelled = false

    const release = async () => {
      const sentinel = wakeLockRef.current
      wakeLockRef.current = null
      try {
        await sentinel?.release()
      } catch {
        /* noop */
      }
    }

    const request = async () => {
      if (!playing) return
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
      try {
        const nav = navigator as Navigator & {
          wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
        }
        const sentinel = await nav.wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        wakeLockRef.current = sentinel
      } catch {
        /* el permiso puede negarse (p. ej. pestaña en 2º plano); no es crítico */
      }
    }

    void request()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void release()
      // Importante: esta limpieza SOLO libera el wake-lock local. Nunca pausa
      // ni detiene el motor de audio compartido, que sigue vivo fuera de React.
    }
  }, [playing])

  useEffect(() => {
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean
        Plugins?: Record<string, Record<string, (...args: unknown[]) => unknown> | undefined>
      }
    }
    const isNative = w.Capacitor?.isNativePlatform?.()
    if (!isNative) return
    const backgroundMode = w.Capacitor?.Plugins?.BackgroundMode
    const keepAwake = w.Capacitor?.Plugins?.KeepAwake
    try {
      if (playing) {
        backgroundMode?.enable?.()
        keepAwake?.keepAwake?.()
      } else {
        backgroundMode?.disable?.()
        keepAwake?.allowSleep?.()
      }
    } catch {
      /* plugins opcionales: si no están instalados, esto simplemente no hace nada */
    }
  }, [playing])

  useEffect(() => {
    const w = window as unknown as {
      electronAPI?: {
        setBackgroundThrottling?: (enabled: boolean) => void
        preventAppSuspension?: (on: boolean) => void
      }
    }
    try {
      w.electronAPI?.setBackgroundThrottling?.(false)
      w.electronAPI?.preventAppSuspension?.(playing)
    } catch {
      /* solo aplica si el preload de Electron expone este puente */
    }
  }, [playing])
}

const BOTTOM_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'library', label: 'Biblioteca', icon: <Icon.library /> },
  { id: 'playlists', label: 'Listas', icon: <Icon.playlist /> },
  { id: 'now', label: 'Reproduciendo', icon: <Icon.play size={20} /> },
  { id: 'import', label: 'Importar', icon: <Icon.importIcon /> },
  { id: 'more', label: 'Más', icon: <Icon.moreGrid /> },
]

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'recent', label: 'Recientes' },
  { id: 'title', label: 'Título' },
  { id: 'artist', label: 'Artista' },
  { id: 'duration', label: 'Duración' },
]

const LAYOUT_CSS = `
.gco-music-root { min-height: 100vh; min-height: 100dvh; width: 100%; max-width: none; color: var(--gco-ink); box-sizing: border-box; }
.gco-music-shell {
  display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh;
  width: 100%; max-width: 100%; margin: 0; padding: 0;
  box-sizing: border-box;
}
.gco-music-sidebar { display: none; }
.gco-music-bottom-nav { display: block; }
.gco-music-desktop-top { display: none; }
.gco-music-mobile-header { display: block; }
.gco-music-table-head { display: none; }
.gco-music-song-artist-col { display: none; }
.gco-music-song-idx { display: none; }
.gco-music-song-subtitle-mobile { display: block; }

.gco-song-row { transition: background-color 0.15s ease; border-radius: 14px; }
.gco-song-row:hover { background: var(--gco-glass-bg, rgba(255,255,255,0.05)); }
.gco-song-row:last-child { border-bottom: none !important; }
.gco-music-songs-card { border-radius: var(--gco-radius); }
.gco-hover-card { transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease, border-color 0.18s ease; }
.gco-hover-card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0,0,0,0.24); }
.gco-icon-btn { transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease; }
.gco-icon-btn:hover { background: var(--gco-glass-bg, rgba(255,255,255,0.08)); }
.gco-icon-btn:active { transform: scale(0.94); }
.gco-icon-btn.is-active { color: var(--gco-primary) !important; }
.gco-dropzone { transition: border-color 0.15s ease, background-color 0.15s ease; }
.gco-dropzone.is-active {
  border-color: var(--gco-primary) !important;
  background: color-mix(in srgb, var(--gco-primary) 10%, transparent) !important;
}
.gco-play-fab {
  display: grid; place-items: center; border: none; cursor: pointer;
  background: var(--gco-primary); color: var(--gco-on-primary, #0B1220);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--gco-primary) 45%, transparent);
  transition: transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease, filter 0.15s ease;
}
.gco-play-fab:hover { filter: brightness(1.06); box-shadow: 0 8px 24px color-mix(in srgb, var(--gco-primary) 55%, transparent); }
.gco-play-fab:active { transform: scale(0.92); }

.gco-chip {
  border: none; cursor: pointer; font: inherit; font-size: 0.85rem; font-weight: 600;
  padding: 0.5rem 1rem; border-radius: 999px; display: flex; align-items: center; gap: 6px;
  background: var(--gco-glass-bg, rgba(255,255,255,0.06)); color: var(--gco-ink-muted);
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
}
.gco-chip:hover { transform: translateY(-1px); }
.gco-chip.on { background: var(--gco-primary); color: var(--gco-on-primary, #0B1220); }

.gco-stat-tile {
  flex: 1 1 100px; padding: 0.9rem; border-radius: 16px;
  background: var(--gco-glass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--gco-glass-border); text-align: center;
}

/* Dropdown de orden — liquid glass, compacto en móvil */
.gco-sort-trigger {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--gco-glass-border);
  background: var(--gco-glass-bg, rgba(255,255,255,0.06));
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  color: var(--gco-ink-muted);
  padding: 0.42rem 0.55rem;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.gco-sort-trigger:hover { background: var(--gco-glass-bg-hover); color: var(--gco-ink); }
.gco-sort-trigger.is-open { border-color: var(--gco-primary); color: var(--gco-primary); }
.gco-sort-label { display: none; }
@media (min-width: 640px) {
  .gco-sort-trigger { padding: 0.42rem 0.85rem; }
  .gco-sort-label { display: inline; }
}
.gco-sort-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 168px;
  padding: 6px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 16px;
  animation: gco-sort-pop 0.14s ease-out;
}
@keyframes gco-sort-pop {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.gco-sort-option {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: none; background: transparent; color: inherit; font: inherit;
  font-size: 0.85rem; padding: 0.55rem 0.7rem; border-radius: 11px; cursor: pointer; text-align: left;
}
.gco-sort-option:hover { background: var(--gco-glass-bg-hover); }
.gco-sort-option.active { color: var(--gco-primary); font-weight: 700; }

/* Editor de portada — cruceta de panorámica */
.gco-cover-dpad {
  display: grid;
  grid-template-columns: 38px 38px 38px;
  grid-template-rows: 38px 38px 38px;
  gap: 4px;
  justify-content: center;
}
.gco-cover-dpad button {
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--gco-glass-border);
  background: var(--gco-glass-bg, rgba(255,255,255,0.06));
  color: var(--gco-ink-muted);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
}
.gco-cover-dpad button:hover { background: var(--gco-glass-bg-hover); color: var(--gco-ink); }
.gco-cover-dpad button:active { transform: scale(0.92); }
.gco-cover-dpad button.center { color: var(--gco-primary); border-color: var(--gco-primary); }
.gco-cover-dpad span { pointer-events: none; }

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
    width: 100%; max-width: 100%; margin: 0; padding: 0;
    display: grid; grid-template-columns: 240px minmax(0, 1fr);
    min-height: 100vh; min-height: 100dvh;
  }
  .gco-music-sidebar {
    display: flex; flex-direction: column; gap: 0.35rem;
    padding: 1.25rem 0.85rem;
    border-right: 1px solid var(--gco-glass-border);
    background: color-mix(in srgb, var(--gco-bg, #0B1220) 92%, transparent);
    position: sticky; top: 0; height: 100vh; height: 100dvh; overflow: auto;
    border-top-left-radius: 0;
  }
  .gco-music-main {
    display: flex; flex-direction: column; min-width: 0; width: 100%;
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
  .gco-music-player-dock { left: 240px !important; }
}

@media (min-width: 1280px) {
  .gco-music-main { padding: 1.5rem 2.25rem 5.5rem; }
}

/* ============================================================================
 * ACABADO PROFESIONAL Y ANCHO COMPLETO (pantallas ≥960px)
 * 'app-shell-pro' (theme.css) limita el ancho a 1100px y centra el bloque:
 * correcto para pantallas de una sola columna, pero esta vista ya tiene su
 * propio layout responsive de sidebar + contenido, así que ese límite hacía
 * que todo se viera "cortado" y flotando en el centro con espacio muerto a
 * los lados. Lo anulamos SOLO aquí (el resto de la app sigue usando
 * 'app-shell-pro' normalmente) para que la sidebar llegue al borde y el
 * contenido aproveche el ancho real de la pantalla.
 * ========================================================================= */
@media (min-width: 960px) {
  .gco-music-root.app-shell-pro,
  .gco-music-root.app-shell {
    max-width: none !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .gco-music-root {
    max-width: none !important;
    width: 100% !important;
  }
}

/* El contenido interno se centra con un ancho máximo cómodo en monitores
   muy anchos, en vez de estirar cada línea de borde a borde de la pantalla. */
.gco-music-content-inner { width: 100%; max-width: none; margin: 0; box-sizing: border-box; }
@media (min-width: 960px) {
  .gco-music-content-inner { max-width: none; width: 100%; margin: 0; padding: 0 1.25rem; }
}
@media (min-width: 1440px) {
  .gco-music-content-inner { padding: 0 1.75rem; }
}

/* Cabecera de escritorio con más presencia y separación clara del contenido */
.gco-music-desktop-top {
  padding-bottom: 1rem !important;
  margin-bottom: 1.5rem !important;
  border-bottom: 1px solid var(--gco-hairline);
}

/* Filas de la tabla de canciones: leve zebra + cabecera más legible */
.gco-song-row:nth-child(even) {
  background: color-mix(in srgb, var(--gco-ink) 2.5%, transparent);
}
.gco-music-table-head span {
  opacity: 0.85;
}

/* Tarjetas "reproduciendo recientemente" con más presencia en escritorio */
@media (min-width: 960px) {
  .gco-music-root .continue-card { min-width: 320px; max-width: 380px; }
}

/* Pantallas grandes: sidebar y márgenes más generosos, look de app de escritorio */
@media (min-width: 1440px) {
  .gco-music-shell { grid-template-columns: 272px 1fr; }
  .gco-music-sidebar { padding: 1.85rem 1.15rem; }
  .gco-music-player-dock { left: 272px !important; }
  .gco-music-main { padding: 1.85rem 3rem 5.5rem; }
}
`

/* --- DROPDOWN DE ORDEN (liquid glass, icon-only en móvil) --- */
function SortDropdown({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const current = SORT_OPTIONS.find((o) => o.id === value) ?? SORT_OPTIONS[0]

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`gco-sort-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ordenar por: ${current.label}`}
        onClick={() => {
          soundClick()
          setOpen((v) => !v)
        }}
      >
        <Icon.sort size={14} />
        <span className="gco-sort-label">{current.label}</span>
        <Icon.chevronDown size={12} />
      </button>
      {open && (
        <div role="listbox" className="glass-card gco-sort-panel">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              className={`gco-sort-option${o.id === value ? ' active' : ''}`}
              onClick={() => {
                soundClick()
                onChange(o.id)
                setOpen(false)
              }}
            >
              {o.label}
              {o.id === value && <Icon.checkCircle size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* --- COMPONENTE IMPORT PANEL --- */
function ImportPanelComponent({
  onImport,
  tracks,
}: {
  onImport: (files: File[] | FileList) => Promise<void>
  tracks: TrackItem[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropActive, setDropActive] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<YtSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)

  const [selectedYt, setSelectedYt] = useState<YtSearchResult | null>(null)
  const [ytName, setYtName] = useState('')
  const [isAudioOnly, setIsAudioOnly] = useState(true)
  const [dlDevice, setDlDevice] = useState(false)
  const [dlCache, setDlCache] = useState(true)
  const [showDuplicateWarn, setShowDuplicateWarn] = useState(false)

  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState({
    metadata: 0,
    download: 0,
    import: 0,
  })
  const [dlStatus, setDlStatus] = useState('')
  const [dlError, setDlError] = useState<string | null>(null)
  const downloadAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort()
      downloadAbortRef.current?.abort()
    }
  }, [])

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

    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    setIsSearching(true)
    setSearchError(null)
    setSearchResults([])
    soundClick()

    if (isYoutubeUrl(q)) {
      const title = q.replace(/^https?:\/\//, '').slice(0, 80)
      const item: YtSearchResult = { id: `url-${Date.now()}`, title, url: q }
      setSearchResults([item])
      setIsSearching(false)
      openDownloadModal(item)
      return
    }

    try {
      const res = await fetch(`${API_BASE}/buscar?q=${encodeURIComponent(q)}`, {
        method: 'GET',
        signal: controller.signal,
      })
      if (res.ok) {
        const data = (await res.json()) as { results?: YtSearchResult[] }
        if (data.results && data.results.length > 0) {
          setSearchResults(data.results)
          setIsSearching(false)
          return
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      /* backend de búsqueda opcional; seguimos al fallback local */
    }

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

  const openDownloadModal = (song: YtSearchResult) => {
    soundClick()
    setYtName(song.title)
    setSelectedYt(song)
    setDlError(null)
    const isDuplicate = tracks.some((s) => s.title.toLowerCase() === song.title.toLowerCase())
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
      setDlError('Necesitas una URL válida de YouTube (youtube.com o youtu.be). Pégala en el buscador.')
      return
    }

    soundClick()
    const song = selectedYt
    const name = (ytName || song.title || 'media').replace(/[\\/:*?"<>|]+/g, '_')
    const formato = isAudioOnly ? 'mp3' : 'mp4'

    downloadAbortRef.current?.abort()
    const controller = new AbortController()
    downloadAbortRef.current = controller

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
        body: JSON.stringify({ url: song.url, formato, title: name }),
        signal: controller.signal,
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

      const mime = formato === 'mp3' ? 'audio/mpeg' : blob.type || 'video/mp4'
      const ext = formato === 'mp3' ? 'mp3' : 'mp4'
      const fileName = `${name}.${ext}`

      let mediaBlob = blob
      let mediaName = fileName
      if (
        blob.type.includes('zip') ||
        (response.headers.get('content-disposition') || '').includes('.zip')
      ) {
        setDlStatus('Extrayendo del ZIP…')
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        setDlStatus('')
        return
      }
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
    backdropFilter: 'blur(18px) saturate(1.3)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
    border: '1px solid var(--gco-glass-border, rgba(255,255,255,0.1))',
    borderRadius: 18,
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
        <span style={{ color: 'var(--gco-ink-muted)', display: 'flex', alignItems: 'center' }}>
          <Icon.search />
        </span>
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
                borderRadius: 12,
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon.download size={15} strokeWidth={2} /> Descargar
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon.package size={18} /> Exportar metadatos de la biblioteca
      </button>

      <div
        className={`glass-card gco-dropzone${dropActive ? ' is-active' : ''}`}
        style={{
          padding: '2.4rem 1.4rem',
          textAlign: 'center',
          border: '1.5px dashed var(--gco-glass-border)',
          borderRadius: 18,
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
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--gco-primary)', margin: '0 0 12px' }}>
          <Icon.download size={38} strokeWidth={1.4} />
        </div>
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
          <br />
          <span style={{ opacity: 0.8 }}>Portada, artista, álbum y año se detectan automáticamente si el archivo los trae.</span>
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
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon.info size={14} /> Descarga de YouTube mediante enlaces URL.
      </p>

      {selectedYt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
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
                  borderRadius: 10,
                  marginBottom: 15,
                  color: 'var(--gco-secondary, #ff6b6b)',
                  fontSize: '0.85rem',
                  border: '1px solid var(--gco-secondary, #ff6b6b)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <Icon.info size={16} />
                <span>Ya tienes una canción con un nombre parecido. ¿Descargar de nuevo?</span>
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
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.2)',
                  color: 'inherit',
                  border: '1px solid var(--gco-glass-border)',
                  outline: 'none',
                }}
              />
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: 14,
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
                  borderRadius: 10,
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
                  borderRadius: 10,
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

      {isDownloading && (
        <div
          className="glass-card"
          style={{ ...liquidGlassStyle, textAlign: 'center' }}
          aria-live="polite"
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
  const coverRef = useRef<HTMLInputElement>(null)
  const dragId = useRef<string | null>(null)
  const recentScrollRef = useRef<HTMLDivElement>(null)

  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [favorites, setFavorites] = useState<string[]>(() => loadFavs())
  const [libFilter, setLibFilter] = useState<LibFilter>('recents')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
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
  const [showQueue, setShowQueue] = useState(false)
  const [volumeBoost, setVolumeBoost] = useState(100)
  const [recentDot, setRecentDot] = useState(0)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [artistFilter, setArtistFilter] = useState<string | null>(null)

  const [menu, setMenu] = useState<TrackMenuState | null>(null)
  const [assignTrack, setAssignTrack] = useState<TrackItem | null>(null)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [metaTrack, setMetaTrack] = useState<TrackItem | null>(null)
  const [newPlDraft, setNewPlDraft] = useState('')

  // ── Editor de portada ──
  const [editCover, setEditCover] = useState<string | undefined>(undefined)
  const [coverPending, setCoverPending] = useState<{ src: string; w: number; h: number } | null>(null)
  const [coverZoom, setCoverZoom] = useState(1)
  const [coverPosX, setCoverPosX] = useState(50)
  const [coverPosY, setCoverPosY] = useState(50)
  const [coverBusy, setCoverBusy] = useState(false)

  const [specColor, setSpecColor] = useState('#22E6C5')
  const [specColorB, setSpecColorB] = useState('#8B5CF6')
  const [specColorC, setSpecColorC] = useState('#F472B6')
  const [specStyle, setSpecStyle] = useState<SpecStyle>('sphere' as SpecStyle)
  const [specMulti, setSpecMulti] = useState<1 | 2 | 3>(2)
  const [specParticles, setSpecParticles] = useState(true)
  const [specGlow, setSpecGlow] = useState(true)
  const [progressColor, setProgressColor] = useState(() => getBarPrefs().progressColor)

  const player = useMediaPlayer()

  // Mantiene la reproducción viva en 2º plano en PWA/navegador/Electron/Capacitor.
  // El propio motor de audio es global (ver nota de arquitectura arriba), así que
  // saltar de modo (GymCog/Nutrición) no lo detiene: solo se desmonta esta vista.
  useBackgroundPlaybackGuard(player.playing)

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

  useEffect(() => {
    if (!importNotice) return
    const id = window.setTimeout(() => setImportNotice(null), 3600)
    return () => window.clearTimeout(id)
  }, [importNotice])

  const plDetail = plDetailId
    ? (playlists.find((p) => p.id === plDetailId) ?? null)
    : null

  const plTracks = useMemo(() => {
    if (!plDetail) return []
    return plDetail.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter(Boolean) as TrackItem[]
  }, [plDetail, tracks])

  const artistGroups = useMemo(() => {
    const map = new Map<string, { name: string; count: number; cover: string | null }>()
    for (const t of tracks) {
      const name = t.artist?.trim() || 'Desconocido'
      const prev = map.get(name)
      if (prev) {
        prev.count += 1
        if (!prev.cover && t.coverDataUrl) prev.cover = t.coverDataUrl
      } else {
        map.set(name, { name, count: 1, cover: t.coverDataUrl ?? null })
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [tracks])

  const filteredTracks = useMemo(() => {
    let list = [...tracks]
    if (libFilter === 'favorites') list = list.filter((t) => favorites.includes(t.id))
    if (artistFilter) list = list.filter((t) => (t.artist?.trim() || 'Desconocido') === artistFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album ?? '').toLowerCase().includes(q)
      )
    }
    if (sortMode === 'title') list.sort((a, b) => a.title.localeCompare(b.title))
    else if (sortMode === 'artist') list.sort((a, b) => a.artist.localeCompare(b.artist))
    else if (sortMode === 'duration') list.sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))
    return list
  }, [tracks, libFilter, favorites, search, artistFilter, sortMode])

  const recentTracks = useMemo(() => filteredTracks.slice(0, 8), [filteredTracks])
  const editing = editId ? tracks.find((t) => t.id === editId) : null
  const current = player.track

  const queueList = useMemo(() => {
    const anyP = player as { getQueue?: () => TrackItem[] }
    try {
      return typeof anyP.getQueue === 'function' ? anyP.getQueue() : []
    } catch {
      return []
    }
  }, [player, current])

  const scrollRecent = (dir: 1 | -1) => {
    const el = recentScrollRef.current
    if (!el) return
    const card = el.querySelector('.continue-card') as HTMLElement | null
    const amount = card ? card.offsetWidth + 14 : 300
    el.scrollBy({ left: dir * amount, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = recentScrollRef.current
    if (!el) return
    const onScroll = () => {
      const card = el.querySelector('.continue-card') as HTMLElement | null
      const w = card ? card.offsetWidth + 14 : 1
      setRecentDot(Math.round(el.scrollLeft / w))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [recentTracks.length])

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

    let enrichedCount = 0

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

        const meta = await extractAudioMetadata(file)
        const patch: Partial<TrackItem> = {}
        if (meta.title && (!t.title || /^(track|audio|untitled|sin t[ií]tulo)/i.test(t.title))) {
          patch.title = meta.title
        }
        if (meta.artist && (!t.artist || /^(desconocido|unknown)$/i.test(t.artist))) {
          patch.artist = meta.artist
        }
        if (meta.album && !t.album) patch.album = meta.album
        if (meta.year && !t.year) patch.year = meta.year
        if (meta.coverDataUrl && !t.coverDataUrl) patch.coverDataUrl = meta.coverDataUrl

        let enrichedTrack = t
        if (Object.keys(patch).length) {
          await updateTrack(t.id, patch)
          enrichedTrack = { ...t, ...patch }
          enrichedCount += 1
        }

        if (playlists.length > 0) {
          setAssignTrack(enrichedTrack)
          setAssignIds([])
          setNewPlDraft('')
        }
      } catch {
        soundFail()
      }
    }

    await refresh()
    setTab('library')
    if (enrichedCount > 0) {
      setImportNotice(
        enrichedCount === 1
          ? 'Se detectaron metadatos (portada/artista/álbum/año) en 1 archivo.'
          : `Se detectaron metadatos en ${enrichedCount} archivos.`
      )
    }
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
    setCoverPending(null)
    setCoverZoom(1)
    setCoverPosX(50)
    setCoverPosY(50)
  }

  const saveEdit = async () => {
    if (!editId) return
    await updateTrack(editId, {
      title: editTitle.trim() || 'Sin título',
      artist: editArtist.trim() || 'Desconocido',
      year: editYear.trim() || undefined,
      album: editAlbum.trim() || undefined,
      lyrics: editLyrics,
      coverDataUrl: editCover,
    })
    soundSuccess()
    setEditId(null)
    await refresh()
  }

  const onCoverFileSelected = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => {
        setCoverPending({ src, w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
        setCoverZoom(1)
        setCoverPosX(50)
        setCoverPosY(50)
        soundClick()
      }
      img.onerror = () => soundFail()
      img.src = src
    }
    reader.onerror = () => soundFail()
    reader.readAsDataURL(file)
  }

  const panCover = (dx: number, dy: number) => {
    soundClick()
    setCoverPosX((v) => Math.min(100, Math.max(0, v + dx)))
    setCoverPosY((v) => Math.min(100, Math.max(0, v + dy)))
  }

  const autoFitCover = () => {
    soundClick()
    setCoverZoom(1)
    setCoverPosX(50)
    setCoverPosY(50)
  }

  const applyCoverCrop = async () => {
    if (!coverPending) return
    setCoverBusy(true)
    try {
      const dataUrl = await cropCoverToSquareDataUrl(
        coverPending.src,
        coverPending.w,
        coverPending.h,
        coverPosX,
        coverPosY,
        coverZoom
      )
      setEditCover(dataUrl)
      setCoverPending(null)
      soundSuccess()
    } catch {
      soundFail()
    } finally {
      setCoverBusy(false)
    }
  }

  const cancelCoverCrop = () => {
    soundClick()
    setCoverPending(null)
  }

  const removeCover = () => {
    soundClick()
    setEditCover(undefined)
    setCoverPending(null)
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
    const menuH = 390
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
              gap: 10,
              margin: 0,
              fontWeight: 800,
              letterSpacing: '-0.01em',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: 'color-mix(in srgb, var(--gco-primary) 18%, transparent)',
                color: 'var(--gco-primary)',
                flexShrink: 0,
              }}
            >
              <Icon.musicNote size={19} />
            </span>
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
            style={{ width: 44, height: 44, padding: 0, borderRadius: 13, display: 'grid', placeItems: 'center' }}
          >
            {playerHidden ? <Icon.chevronUp /> : <Icon.chevronDown />}
          </button>
          <button
            type="button"
            className="theme-cycle-btn gco-icon-btn"
            aria-label="Abrir ajustes"
            onClick={() => {
              soundClick()
              navigate('/ajustes')
            }}
            style={{ width: 44, height: 44, padding: 0, borderRadius: 13, display: 'grid', placeItems: 'center' }}
          >
            <Icon.gear />
          </button>
        </div>
      </div>
      <div className="mode-switch-mobile" style={{ marginTop: '0.75rem' }}>
        <ModeSwitch fullWidth />
      </div>
    </header>
  )

  /* ── Tarjeta "Reproduciendo recientemente" ── */
  const recentCard = (t: TrackItem) => {
    const isCurrent = current?.id === t.id
    const pct =
      isCurrent && player.durationMs
        ? Math.min(100, (player.currentMs / player.durationMs) * 100)
        : 0
    return (
      <div key={t.id} className="glass-card continue-card gco-hover-card" style={{ border: '1px solid var(--gco-glass-border)' }}>
        <button
          type="button"
          onClick={() => {
            soundClick()
            playAll(filteredTracks, t)
          }}
          style={{
            width: 88,
            height: 88,
            borderRadius: 18,
            overflow: 'hidden',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
          }}
        >
          {t.coverDataUrl ? (
            <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: 'var(--gco-ink-muted)' }}><Icon.musicNote size={26} /></span>
          )}
          {isCurrent && player.playing && (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}
            >
              <Icon.pause size={22} />
            </span>
          )}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
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
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                  margin: '2px 0 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.artist}
              </p>
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
                padding: 4,
                borderRadius: 8,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon.dots />
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', margin: '4px 0 8px' }}>
            {formatTrackTime(t.durationMs)}
            {t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                soundClick()
                playAll(filteredTracks, t)
              }}
              aria-label="Reproducir"
              className="gco-play-fab"
              style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }}
            >
              <Icon.play size={12} />
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
                  width: `${pct}%`,
                  height: '100%',
                  background: 'var(--gco-primary)',
                  borderRadius: 99,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const songRow = (
    t: TrackItem,
    opts?: { inPlaylist?: boolean; index?: number; hideFav?: boolean }
  ) => (
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
          style={{ color: 'var(--gco-ink-muted)', userSelect: 'none', display: 'grid', placeItems: 'center' }}
          aria-hidden
        >
          <Icon.drag />
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
          borderRadius: 12,
          overflow: 'hidden',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: 'var(--gco-glass-bg, rgba(255,255,255,0.06))',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          color: 'var(--gco-ink-muted)',
        }}
      >
        {t.coverDataUrl ? (
          <img src={t.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Icon.musicNote size={18} />
        )}
        {current?.id === t.id && player.playing && (
          <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <Icon.pause size={16} />
          </span>
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
            fontWeight: 700,
            fontSize: '0.93rem',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: current?.id === t.id ? 'var(--gco-primary)' : 'inherit',
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
      {!opts?.hideFav && (
        <button
          type="button"
          onClick={() => toggleFav(t.id)}
          className="gco-icon-btn"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: favorites.includes(t.id) ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
            borderRadius: 8,
            padding: 4,
            display: 'grid',
            placeItems: 'center',
          }}
          title="Favorito"
          aria-label="Favorito"
        >
          {favorites.includes(t.id) ? <Icon.heart size={17} /> : <Icon.heartOutline size={17} />}
        </button>
      )}
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
          borderRadius: 8,
          padding: 4,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon.dots />
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
      {importNotice && (
        <div
          role="status"
          aria-live="polite"
          className="glass-card"
          style={{
            padding: '0.65rem 1rem',
            marginBottom: 14,
            border: '1px solid var(--gco-primary)',
            background: 'color-mix(in srgb, var(--gco-primary) 12%, transparent)',
            color: 'var(--gco-primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon.checkCircle size={17} /> {importNotice}
        </div>
      )}

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
          <span style={{ color: 'var(--gco-ink-muted)', display: 'flex' }}>
            <Icon.search />
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
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="gco-icon-btn"
              style={{ border: 'none', background: 'transparent', color: 'var(--gco-ink-muted)', cursor: 'pointer', borderRadius: 8, padding: 4, display: 'grid', placeItems: 'center' }}
              aria-label="Limpiar búsqueda"
            >
              <Icon.close size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            { id: 'recents' as const, label: 'Recientes', icon: <Icon.clock size={14} /> },
            { id: 'favorites' as const, label: 'Favoritos', icon: <Icon.heartOutline size={14} /> },
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
              className={`gco-chip${on ? ' on' : ''}`}
            >
              {c.icon} {c.label}
            </button>
          )
        })}
        {artistFilter && (
          <button type="button" className="gco-chip on" onClick={() => setArtistFilter(null)}>
            <Icon.artist size={14} /> {artistFilter} <Icon.close size={12} />
          </button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <SortDropdown value={sortMode} onChange={setSortMode} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Reproduciendo recientemente</h2>
        <div className="hscroll-nav">
          <button type="button" className="hscroll-nav-btn" aria-label="Anterior" onClick={() => scrollRecent(-1)}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
              <Icon.chevronRight size={15} strokeWidth={2.2} />
            </span>
          </button>
          <button type="button" className="hscroll-nav-btn" aria-label="Siguiente" onClick={() => scrollRecent(1)}>
            <Icon.chevronRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div ref={recentScrollRef} className="hscroll" style={{ marginBottom: 4 }}>
        {recentTracks.length === 0 ? (
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            Importa audio para verlo aquí.
          </p>
        ) : (
          recentTracks.map(recentCard)
        )}
      </div>
      {recentTracks.length > 1 ? (
        <div className="hscroll-dots" style={{ marginBottom: 22 }}>
          {recentTracks.map((t, i) => (
            <span key={t.id} className={`hscroll-dot${i === recentDot ? ' active' : ''}`} />
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 22 }} />
      )}

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
            borderRadius: 8,
            padding: '4px 6px',
            display: 'grid',
            placeItems: 'center',
          }}
          aria-label="Ver todas las listas"
        >
          <Icon.chevronRight size={18} />
        </button>
      </div>
      <div className="book-grid" style={{ ['--grid-min' as unknown as string]: '128px', marginBottom: 26 } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => {
            soundClick()
            setTab('library')
            setLibFilter('favorites')
          }}
          className="book-grid-card"
          style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', padding: 0 }}
        >
          <div
            className="gco-playlist-cover"
            style={{
              background:
                'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--gco-primary) 40%, transparent), var(--gco-glass-bg))',
              color: 'var(--gco-primary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon.heart size={22} />
          </div>
          <p className="book-title">Favoritos</p>
          <p className="book-author">{favorites.length} canciones</p>
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
              className="book-grid-card"
              style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', padding: 0 }}
            >
              <div className="gco-playlist-cover" style={{ display: 'grid', placeItems: 'center', color: 'var(--gco-ink-muted)' }}>
                {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon.playlist size={22} />}
              </div>
              <p className="book-title">{pl.name}</p>
              <p className="book-author">{pl.trackIds.length} canciones</p>
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
          className="book-grid-card"
          style={{ border: 'none', background: 'transparent', color: 'var(--gco-ink-muted)', font: 'inherit', textAlign: 'left', padding: 0 }}
        >
          <div
            className="gco-playlist-cover"
            style={{ background: 'transparent', border: '1px dashed var(--gco-glass-border)', display: 'grid', placeItems: 'center' }}
          >
            <Icon.plus size={20} />
          </div>
          <p className="book-title">Nueva lista</p>
        </button>
      </div>

      {artistGroups.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Artistas</h2>
          </div>
          <div className="hscroll" style={{ marginBottom: 26 }}>
            {artistGroups.slice(0, 14).map((a) => (
              <button
                key={a.name}
                type="button"
                onClick={() => {
                  soundClick()
                  setArtistFilter((cur) => (cur === a.name ? null : a.name))
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  width: 92,
                  flexShrink: 0,
                  scrollSnapAlign: 'start',
                  color: artistFilter === a.name ? 'var(--gco-primary)' : 'inherit',
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--gco-glass-bg)',
                    border: artistFilter === a.name ? '2px solid var(--gco-primary)' : '1px solid var(--gco-glass-border)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  {a.cover ? (
                    <img src={a.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Icon.artist size={26} />
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                  {a.name}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--gco-ink-muted)', margin: 0 }}>{a.count} pistas</p>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px', fontWeight: 700 }}>Todas las canciones</h2>
      <div className="glass-card gco-music-songs-card" style={{ border: '1px solid var(--gco-glass-border)', padding: '0.35rem 0.6rem' }}>
        <div className="gco-music-table-head" aria-hidden>
          <span>#</span>
          <span />
          <span>Título</span>
          <span>Artista</span>
          <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}><Icon.clock size={13} /></span>
          <span />
          <span />
        </div>

        {filteredTracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--gco-ink-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Icon.headphones size={38} />
            </div>
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
          <div>{filteredTracks.map((t, i) => songRow(t, { index: i + 1, hideFav: true }))}</div>
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
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon.arrowLeft size={15} /> Listas
        </button>
        <h2 style={{ flex: 1, fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>{plDetail.name}</h2>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => {
            soundClick()
            const name = prompt('Nombre de la lista', plDetail.name)
            if (name?.trim()) void renamePlaylist(plDetail.id, name).then(refresh)
          }}
        >
          <Icon.editPencil size={14} /> Renombrar
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
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
          <Icon.trash size={14} /> Borrar
        </button>
        <GlassButton
          onClick={() => {
            soundClick()
            setAddToPlOpen((v) => !v)
          }}
        >
          <Icon.plus size={14} /> Añadir
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            playAll(plTracks)
          }}
          disabled={!plTracks.length}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon.play size={13} /> Reproducir
        </button>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon.drag size={14} /> Arrastra para reordenar · {plTracks.length} pistas · una canción puede estar en varias listas
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Icon.playlist size={32} />
            </div>
            <p style={{ margin: 0 }}>Lista vacía. Pulsa "Añadir".</p>
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
          <Icon.plus size={14} /> Nueva lista
        </GlassButton>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playlists.length === 0 && (
          <div className="glass-card" style={{ padding: '2rem 1rem', textAlign: 'center', border: '1px dashed var(--gco-glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--gco-ink-muted)' }}>
              <Icon.playlist size={30} />
            </div>
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
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'var(--gco-glass-bg)',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                {cover ? (
                  <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Icon.playlist size={22} />
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
                  style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => {
                    soundClick()
                    const name = prompt('Nombre de la lista', pl.name)
                    if (name?.trim()) void renamePlaylist(pl.id, name).then(refresh)
                  }}
                >
                  <Icon.editPencil size={13} /> Renombrar
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => {
                    soundClick()
                    if (confirm(`¿Borrar "${pl.name}"?`)) void deletePlaylist(pl.id).then(refresh)
                  }}
                >
                  <Icon.trash size={13} /> Borrar
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
            borderRadius: 22,
            overflow: 'hidden',
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
            color: 'var(--gco-ink-muted)',
          }}
        >
          {current?.coverDataUrl ? (
            <img src={current.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Icon.musicNote size={48} />
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
              {specLabel(s)}
            </button>
          ))}
        </div>
        {current && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                soundClick()
                setShowQueue((v) => !v)
              }}
            >
              <Icon.queue size={15} /> Cola{queueList.length ? ` (${queueList.length})` : ''}
            </button>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                soundClick()
                player.setShuffle?.(true)
              }}
            >
              <Icon.shuffle size={15} /> Aleatorio
            </button>
          </div>
        )}
        {showQueue && (
          <div className="glass-card gco-scroll-y" style={{ marginTop: 14, textAlign: 'left', maxHeight: 220, overflow: 'auto', padding: '0.6rem 0.7rem' }}>
            {queueList.length === 0 ? (
              <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', margin: 0 }}>La cola está vacía.</p>
            ) : (
              queueList.map((t, i) => (
                <div
                  key={`${t.id}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.4rem 0.2rem',
                    borderBottom: i < queueList.length - 1 ? '1px solid var(--gco-glass-border)' : 'none',
                    color: t.id === current?.id ? 'var(--gco-primary)' : 'inherit',
                    fontWeight: t.id === current?.id ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', width: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.title}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}>{formatTrackTime(t.durationMs)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.lyrics size={17} /> Letra
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
            style={{ marginTop: 12, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => openEdit(current)}
          >
            <Icon.editPencil size={14} /> Editar letra / metadatos
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
          <Icon.volume size={17} /> Volumen forzado
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
          className="pref-slider"
          style={{ ['--fill' as unknown as string]: `${(volumeBoost / 300) * 100}%` } as React.CSSProperties}
        />
        <p style={{ fontSize: '0.9rem', marginTop: 6, fontWeight: 600 }}>{volumeBoost}%</p>
      </div>

      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <h3 style={{ marginBottom: 14, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.palette size={17} /> Personalización
        </h3>
        <label
          style={{
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            padding: '0.5rem 0.75rem',
            borderRadius: 12,
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
          <Icon.chart size={17} /> Resumen de tu biblioteca
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Pistas', value: tracks.length },
            { label: 'Listas', value: playlists.length },
            { label: 'Favoritos', value: favorites.length },
            { label: 'Artistas', value: artistGroups.length },
          ].map((s) => (
            <div key={s.label} className="gco-stat-tile">
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

      <div className="glass-card" style={{ padding: '1.2rem 1.25rem', border: '1px solid var(--gco-glass-border)' }}>
        <h3 style={{ marginBottom: 10, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.headphones size={17} /> Reproducción en segundo plano
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', lineHeight: 1.55, margin: 0 }}>
          El audio sigue sonando aunque cambies de modo en el selector superior (GymCog, Nutrición…) o
          bloquees la pantalla: el motor de audio vive fuera de esta vista, así que saltar entre
          `CategoryMenu`, `NutricionHome` o cualquier otra pantalla no lo interrumpe. Este panel solo
          controla el bloqueo de pantalla y las señales nativas cuando la app está empaquetada.
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

  const coverPreviewTransform = coverPending
    ? computeCoverTransform(coverPending.w, coverPending.h, COVER_PREVIEW_SIZE, coverZoom, coverPosX, coverPosY)
    : null

  return (
    <div className="app-shell app-shell-pro gco-music-root" style={{ paddingBottom: padBottom, width: '100%', maxWidth: 'none', margin: 0 }}>
      <style>{LAYOUT_CSS}</style>
      <div className="gco-music-shell">
        <aside className="gco-music-sidebar gco-scroll-y" aria-label="Navegación lateral">
          <div style={{ marginBottom: 18, padding: '0 0.35rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: 'color-mix(in srgb, var(--gco-primary) 18%, transparent)',
                color: 'var(--gco-primary)',
                flexShrink: 0,
              }}
            >
              <Icon.musicNote size={18} />
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem' }}>Música</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--gco-ink-muted)' }}>
                Reproductor offline
              </p>
            </div>
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
          <div className="gco-music-content-inner">
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
                style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center' }}
              >
                {playerHidden ? <Icon.chevronUp /> : <Icon.chevronDown />}
              </button>
              <button
                type="button"
                className="theme-cycle-btn gco-icon-btn"
                aria-label="Abrir ajustes"
                onClick={() => {
                  soundClick()
                  navigate('/ajustes')
                }}
                style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center' }}
              >
                <Icon.gear />
              </button>
            </div>

            <main style={{ minWidth: 0 }}>{mainContent}</main>
          </div>
        </div>
      </div>

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
              borderRadius: 18,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              border: '1px solid var(--gco-glass-border)',
            }}
          >
            {(
              [
                { label: 'Reproducir', icon: <Icon.play size={15} />, run: () => playAll(filteredTracks, menu.track) },
                { label: 'Reproducir a continuación', icon: <Icon.queue size={15} />, run: () => playNext(menu.track) },
                {
                  label: favorites.includes(menu.track.id) ? 'Quitar de favoritos' : 'Agregar a favoritos',
                  icon: favorites.includes(menu.track.id) ? <Icon.heart size={15} /> : <Icon.heartOutline size={15} />,
                  run: () => toggleFav(menu.track.id),
                },
                {
                  label: 'Agregar a playlist…',
                  icon: <Icon.plus size={15} />,
                  run: () => {
                    setAssignTrack(menu.track)
                    setAssignIds([])
                    setNewPlDraft('')
                  },
                },
                {
                  label: 'Barajear desde aquí',
                  icon: <Icon.shuffle size={15} />,
                  run: () => {
                    const list = [...filteredTracks]
                    const i = list.findIndex((x) => x.id === menu.track.id)
                    const ordered =
                      i >= 0 ? [...list.slice(i), ...list.slice(0, i)] : list
                    player.setShuffle(true)
                    playAll(ordered, menu.track)
                  },
                },
                { label: 'Renombrar / editar', icon: <Icon.editPencil size={15} />, run: () => openEdit(menu.track) },
                { label: 'Metadatos', icon: <Icon.info size={15} />, run: () => setMetaTrack(menu.track) },
                {
                  label: `Peso · ${formatBytes(menu.track.sizeBytes)}`,
                  icon: <Icon.weight size={15} />,
                  run: () => setMetaTrack(menu.track),
                },
                {
                  label: 'Borrar',
                  icon: <Icon.trash size={15} />,
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
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
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

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
            style={{ width: 'min(420px, 100%)', padding: '1.2rem', border: '1px solid var(--gco-glass-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon.info size={17} /> Metadatos
            </h3>
            <div
              style={{
                width: '100%',
                maxWidth: 240,
                aspectRatio: '1',
                margin: '0 auto 14px',
                borderRadius: 18,
                overflow: 'hidden',
                border: '1px solid var(--gco-glass-border)',
                background: 'var(--gco-glass-bg)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--gco-ink-muted)',
                boxShadow: '0 10px 26px rgba(0,0,0,0.2)',
              }}
            >
              {metaTrack.coverDataUrl ? (
                <img src={metaTrack.coverDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Icon.musicNote size={40} />
              )}
            </div>
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
              width: 'min(460px, 100%)',
              padding: '1.25rem',
              maxHeight: '92vh',
              overflow: 'auto',
              border: '1px solid var(--gco-glass-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 12 }}>Editar pista</h3>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: COVER_PREVIEW_SIZE,
                  aspectRatio: '1',
                  margin: '0 auto',
                  borderRadius: 20,
                  overflow: 'hidden',
                  position: 'relative',
                  background: 'var(--gco-glass-bg)',
                  border: '1px solid var(--gco-glass-border)',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
                }}
              >
                {coverPending && coverPreviewTransform ? (
                  <img
                    src={coverPending.src}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: -coverPreviewTransform.offsetX,
                      top: -coverPreviewTransform.offsetY,
                      width: coverPreviewTransform.drawW,
                      height: coverPreviewTransform.drawH,
                      maxWidth: 'none',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                ) : editCover ? (
                  <img src={editCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--gco-ink-muted)' }}>
                    <Icon.musicNote size={40} />
                  </div>
                )}
              </div>

              {coverPending ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div className="gco-cover-dpad">
                    <span />
                    <button type="button" aria-label="Mover portada arriba" onClick={() => panCover(0, -8)}>
                      <Icon.chevronUp size={16} />
                    </button>
                    <span />
                    <button type="button" aria-label="Mover portada a la izquierda" onClick={() => panCover(-8, 0)}>
                      <Icon.arrowLeft size={16} />
                    </button>
                    <button type="button" className="center" aria-label="Autoajustar portada" onClick={autoFitCover}>
                      <Icon.fit size={16} />
                    </button>
                    <button type="button" aria-label="Mover portada a la derecha" onClick={() => panCover(8, 0)}>
                      <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                        <Icon.arrowLeft size={16} />
                      </span>
                    </button>
                    <span />
                    <button type="button" aria-label="Mover portada abajo" onClick={() => panCover(0, 8)}>
                      <Icon.chevronDown size={16} />
                    </button>
                    <span />
                  </div>

                  <div style={{ width: '100%', maxWidth: COVER_PREVIEW_SIZE, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>1×</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={coverZoom}
                      onChange={(e) => setCoverZoom(Number(e.target.value))}
                      className="pref-slider"
                      style={{ ['--fill' as unknown as string]: `${((coverZoom - 1) / 2) * 100}%` } as React.CSSProperties}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>3×</span>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                    Imagen original: {coverPending.w} × {coverPending.h} px
                    <br />
                    Tamaño recomendado: cuadrada, mínimo {COVER_MIN_RECOMMENDED} × {COVER_MIN_RECOMMENDED} px (ideal 1000 × 1000 px)
                    {(coverPending.w < COVER_MIN_RECOMMENDED || coverPending.h < COVER_MIN_RECOMMENDED) && (
                      <>
                        <br />
                        <span style={{ color: 'var(--gco-secondary)' }}>Resolución baja: la portada puede verse borrosa.</span>
                      </>
                    )}
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <GlassButton onClick={() => void applyCoverCrop()}>
                      {coverBusy ? 'Aplicando…' : 'Aplicar recorte'}
                    </GlassButton>
                    <button type="button" className="glass-button secondary" onClick={cancelCoverCrop}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      soundClick()
                      coverRef.current?.click()
                    }}
                  >
                    <Icon.editPencil size={14} /> {editCover ? 'Cambiar portada' : 'Añadir portada'}
                  </button>
                  {editCover && (
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={removeCover}
                    >
                      <Icon.trash size={14} /> Quitar portada
                    </button>
                  )}
                </div>
              )}

              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  onCoverFileSelected(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>

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
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  soundClick()
                  void deleteTrack(editing.id).then(() => {
                    setEditId(null)
                    void refresh()
                  })
                }}
              >
                <Icon.trash size={14} /> Borrar pista
              </button>
              <button type="button" className="glass-button secondary" onClick={() => setEditId(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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

      <nav
        className="gco-music-bottom-nav"
        aria-label="Navegación música"
        style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
          zIndex: 50,
          borderRadius: 26,
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
                  borderRadius: 14,
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