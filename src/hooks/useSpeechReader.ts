/**
 * ============================================================================
 * useSpeechReader.ts — Lector de voz (TTS) + soporte segundo plano + detección de voces
 * PWA · Capacitor APK/iOS · Electron · Web
 * ============================================================================
 * Este archivo es .ts puro (sin JSX).
 * El modal visual está en TtsVoiceInstallerModal.tsx
 * ============================================================================
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
 * Tipos públicos
 * ═══════════════════════════════════════════════════════════════════════════ */
export type SkipSeconds = 5 | 10 | 15
export type PlatformId = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown'

export interface ReaderMediaMeta {
  title: string
  artist?: string
  album?: string
  artwork?: string
}

export interface ChapterNavHandlers {
  onPrevChapter?: () => void
  onNextChapter?: () => void
}

export interface TtsEngine {
  id: string
  name: string
  shortName: string
  free: boolean
  offline: boolean
  quality: 'baja' | 'media' | 'alta' | 'excelente'
  pros: string[]
  cons: string[]
  compatibility: string
  tutorial: string[]
  url: string
  cta: string
  recommended?: boolean
  ai?: boolean
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Constantes
 * ═══════════════════════════════════════════════════════════════════════════ */
const WATCHDOG_MS = 10_000
const BG_NUDGE_MS = 3_500
const DEFAULT_CHUNK_LEN = 200
const KEEPALIVE_VOLUME = 0.01

const SILENT_LOOP_SRC =
  'data:audio/wav;base64,UklGRgwEAABXQVZFZm10IBAAAAABAAEAoA8AAKAPAAABAAgAZGF0YegDAACAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCB'

/* ═══════════════════════════════════════════════════════════════════════════
 * Motores TTS por plataforma (datos puros, sin JSX)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const TTS_ENGINES: Record<PlatformId, TtsEngine[]> = {
  android: [
    {
      id: 'google-tts',
      name: 'Google Text-to-Speech',
      shortName: 'Google TTS',
      free: true,
      offline: true,
      quality: 'excelente',
      recommended: true,
      pros: [
        'Voces neuronales de alta calidad',
        'Funciona offline una vez descargado el idioma',
        'Mejor compatibilidad general',
      ],
      cons: [
        'En móviles antiguos hay que instalarlo manualmente',
        'Requiere descargar el paquete de idioma',
      ],
      compatibility: 'Android 5.0 (API 21)+. Ideal en Android 8+',
      tutorial: [
        'Abre Google Play Store.',
        'Busca “Motor de síntesis de voz de Google” o “Google Text-to-Speech”.',
        'Instálalo o actualízalo.',
        'Ve a Ajustes → Sistema → Idiomas → Texto a voz (o Accesibilidad → Texto a voz).',
        'Selecciona “Motor de Google” como motor preferido.',
        'Toca el engranaje → Instalar datos de voz → elige Español.',
        'Vuelve a GCO y reinicia la app si es necesario.',
      ],
      url: 'https://play.google.com/store/apps/details?id=com.google.android.tts',
      cta: 'Abrir en Play Store',
    },
    {
      id: 'samsung-tts',
      name: 'Samsung Text-to-Speech',
      shortName: 'Samsung TTS',
      free: true,
      offline: true,
      quality: 'alta',
      pros: ['Muy buena calidad en Samsung', 'Integrado en One UI', 'Offline'],
      cons: ['Solo óptimo en dispositivos Samsung'],
      compatibility: 'Samsung One UI (Android 9+ recomendado)',
      tutorial: [
        'En Samsung suele venir preinstalado.',
        'Ajustes → Administración general → Texto a voz.',
        'Elige “Motor de Samsung”.',
        'Descarga los idiomas necesarios.',
      ],
      url: 'https://galaxystore.samsung.com/detail/com.samsung.SMT',
      cta: 'Galaxy Store / Ajustes',
    },
    {
      id: 'espeak',
      name: 'eSpeak NG',
      shortName: 'eSpeak',
      free: true,
      offline: true,
      quality: 'baja',
      pros: ['Muy ligero', 'Funciona en móviles antiguos', 'Código abierto'],
      cons: ['Voz robótica', 'No ideal para audiolibros largos'],
      compatibility: 'Android 4.1+ (dispositivos muy antiguos)',
      tutorial: [
        'Busca “eSpeak NG” en Play Store.',
        'Instálalo.',
        'En Ajustes de Texto a voz elige eSpeak como motor.',
      ],
      url: 'https://play.google.com/store/apps/details?id=com.reecedunn.espeak',
      cta: 'Abrir eSpeak en Play Store',
    },
    {
      id: 'cloud-ai',
      name: 'TTS en la nube / IA (ElevenLabs, Google Cloud, Azure…)',
      shortName: 'TTS IA (nube)',
      free: false,
      offline: false,
      quality: 'excelente',
      ai: true,
      pros: ['Calidad casi humana', 'Muchas voces', 'No depende del teléfono'],
      cons: ['Requiere internet', 'Suelen ser de pago', 'Necesitan API'],
      compatibility: 'Cualquier Android con internet',
      tutorial: [
        'Requieren cuenta y clave de API.',
        'ElevenLabs, PlayHT, Google Cloud y Azure son las más usadas.',
        'En GCO puedes usar el reproductor normal con audio pre-generado.',
      ],
      url: 'https://elevenlabs.io',
      cta: 'Ver ElevenLabs',
    },
  ],
  ios: [
    {
      id: 'apple-voices',
      name: 'Voces de Apple (Siri / Premium)',
      shortName: 'Voces Apple',
      free: true,
      offline: true,
      quality: 'excelente',
      recommended: true,
      pros: ['Calidad excelente', 'Integradas', 'Offline una vez descargadas'],
      cons: ['Hay que descargar las voces Premium manualmente'],
      compatibility: 'iOS 12+ (mejores en iOS 15+)',
      tutorial: [
        'Ajustes → Accesibilidad → Contenido hablado → Voces.',
        'Elige el idioma (Español).',
        'Descarga una voz “Premium” o “Mejorada”.',
        'Vuelve a la app.',
      ],
      url: 'https://support.apple.com/es-es/HT202362',
      cta: 'Guía oficial de Apple',
    },
  ],
  windows: [
    {
      id: 'microsoft-voices',
      name: 'Voces de Microsoft (OneCore / Neural)',
      shortName: 'Microsoft TTS',
      free: true,
      offline: true,
      quality: 'alta',
      recommended: true,
      pros: ['Buenas voces neurales', 'Integradas en Windows 10/11'],
      cons: ['Hay que añadir paquetes de voz en Configuración'],
      compatibility: 'Windows 10 y Windows 11',
      tutorial: [
        'Configuración → Hora e idioma → Voz.',
        'O Accesibilidad → Narrador → Agregar voces.',
        'Descarga el idioma y las voces neurales.',
      ],
      url: 'https://support.microsoft.com/es-es/windows',
      cta: 'Soporte Microsoft',
    },
  ],
  macos: [
    {
      id: 'macos-voices',
      name: 'Voces del sistema de macOS',
      shortName: 'Voces macOS',
      free: true,
      offline: true,
      quality: 'excelente',
      recommended: true,
      pros: ['Muy alta calidad', 'Fáciles de descargar'],
      cons: ['Algunas voces Premium pesan bastante'],
      compatibility: 'macOS Catalina en adelante',
      tutorial: [
        'Ajustes del Sistema → Accesibilidad → Contenido hablado → Voces del sistema.',
        'Elige el idioma y descarga las voces.',
      ],
      url: 'https://support.apple.com/es-es/guide/mac-help/mchlp2717/mac',
      cta: 'Guía de Apple para Mac',
    },
  ],
  linux: [
    {
      id: 'espeak-ng',
      name: 'eSpeak NG',
      shortName: 'eSpeak NG',
      free: true,
      offline: true,
      quality: 'baja',
      pros: ['Muy ligero', 'Disponible en casi todas las distros'],
      cons: ['Voz robótica'],
      compatibility: 'Cualquier distribución Linux moderna',
      tutorial: [
        'Ubuntu/Debian: sudo apt install espeak-ng',
        'Fedora: sudo dnf install espeak-ng',
        'Arch: sudo pacman -S espeak-ng',
      ],
      url: 'https://github.com/espeak-ng/espeak-ng',
      cta: 'GitHub eSpeak NG',
    },
    {
      id: 'piper',
      name: 'Piper TTS',
      shortName: 'Piper',
      free: true,
      offline: true,
      quality: 'alta',
      recommended: true,
      pros: ['Voces neurales', 'Totalmente offline', 'Código abierto'],
      cons: ['Instalación manual según distro'],
      compatibility: 'Linux moderno (x86_64 / arm64)',
      tutorial: [
        'Visita el repositorio oficial de Piper.',
        'Sigue las instrucciones para tu distribución.',
      ],
      url: 'https://github.com/rhasspy/piper',
      cta: 'GitHub Piper',
    },
  ],
  unknown: [],
}

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  android: 'Android',
  ios: 'iOS',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'Otro',
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Utilidades de entorno
 * ═══════════════════════════════════════════════════════════════════════════ */
type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  isPluginAvailable?: (name: string) => boolean
  Plugins?: Record<string, unknown>
}

function isBrowserEnv(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function getCapacitor(): CapacitorBridge | null {
  if (!isBrowserEnv()) return null
  try {
    return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null
  } catch {
    return null
  }
}

function isCapacitorNative(): boolean {
  try {
    return Boolean(getCapacitor()?.isNativePlatform?.())
  } catch {
    return false
  }
}

function isCapacitorAndroid(): boolean {
  try {
    return isCapacitorNative() && getCapacitor()?.getPlatform?.() === 'android'
  } catch {
    return false
  }
}

function isCapacitorIOS(): boolean {
  try {
    return isCapacitorNative() && getCapacitor()?.getPlatform?.() === 'ios'
  } catch {
    return false
  }
}

export function detectPlatform(): PlatformId {
  if (!isBrowserEnv()) return 'unknown'
  if (isCapacitorAndroid() || /Android/i.test(navigator.userAgent || '')) return 'android'
  if (
    isCapacitorIOS() ||
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios'
  }
  if (/Win/i.test(navigator.platform || '') || /Windows/i.test(navigator.userAgent || '')) {
    return 'windows'
  }
  if (/Mac/i.test(navigator.platform || '') || /Mac OS/i.test(navigator.userAgent || '')) {
    return 'macos'
  }
  if (/Linux/i.test(navigator.platform || '') || /Linux/i.test(navigator.userAgent || '')) {
    return 'linux'
  }
  return 'unknown'
}

export function isAndroidUa(): boolean {
  if (!isBrowserEnv()) return false
  return /Android/i.test(navigator.userAgent || '')
}

export function isSamsungDevice(): boolean {
  if (!isBrowserEnv()) return false
  return /SM-|Samsung|SAMSUNG/i.test(navigator.userAgent || '')
}

export function isXiaomiFamily(): boolean {
  if (!isBrowserEnv()) return false
  return /Xiaomi|Redmi|POCO|MIUI|HyperOS/i.test(navigator.userAgent || '')
}

function setAudioSessionPlayback(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type?: string } }
    if (nav.audioSession && typeof nav.audioSession === 'object') {
      nav.audioSession.type = 'playback'
    }
  } catch {
    /* */
  }
}

function charsForSeconds(sec: number, rate: number): number {
  return Math.round(sec * 13 * Math.max(0.5, rate || 1))
}

export function scoreVoiceHumanness(v: SpeechSynthesisVoice, preferLang = 'es'): number {
  let s = 0
  const name = (v.name || '').toLowerCase()
  const lang = (v.lang || '').toLowerCase()
  if (lang.startsWith(preferLang) || lang.includes('spa')) s += 100
  else if (lang.startsWith('en')) s += 15
  if (/natural|neural|premium|enhanced|wavenet|studio|online|plus|eloquence/.test(name)) s += 60
  if (
    /google|microsoft|apple|siri|samantha|alex|daniel|monica|jorge|paulina|sabina|elsa|helena|mónica/.test(
      name,
    )
  ) {
    s += 30
  }
  if (v.localService) s += 10
  if (
    /compact|novelty|whisper|zarvox|trinoids|bad|robot|espeak/.test(name) &&
    !/premium|enhanced/.test(name)
  ) {
    s -= 40
  }
  if (v.default) s += 5
  return s
}

export function pickHumanVoice(voices: SpeechSynthesisVoice[], currentURI?: string): string {
  if (!voices.length) return ''
  if (currentURI && voices.some((v) => v.voiceURI === currentURI)) return currentURI
  const ranked = [...voices].sort((a, b) => scoreVoiceHumanness(b) - scoreVoiceHumanness(a))
  return ranked[0]?.voiceURI || ''
}

function chunkText(text: string, maxLen = DEFAULT_CHUNK_LEN): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length)
    if (end < text.length) {
      const slice = text.slice(i, end)
      const lastBreak = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('; '),
        slice.lastIndexOf(', '),
      )
      if (lastBreak > maxLen * 0.35) end = i + lastBreak + 1
    }
    const part = text.slice(i, end).trim()
    if (part) chunks.push(part)
    i = end
  }
  return chunks.length ? chunks : [text]
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Permisos Android
 * ═══════════════════════════════════════════════════════════════════════════ */
let readerNotifPermAsked = false
let readerNotifPermGranted: boolean | null = null
let readerBatteryPromptShown = false

type LocalNotificationsPlugin = {
  checkPermissions: () => Promise<{ display: string }>
  requestPermissions: () => Promise<{ display: string }>
}

type BatteryOptimizationPlugin = {
  isBatteryOptimizationEnabled?: () => Promise<{ enabled: boolean }>
  requestDisableBatteryOptimization?: () => Promise<void>
  isIgnoringBatteryOptimizations?: () => Promise<{ value?: boolean; isIgnoring?: boolean }>
  requestIgnoreBatteryOptimizations?: () => Promise<void>
}

async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (!isBrowserEnv() || !isCapacitorAndroid()) return true
  if (readerNotifPermGranted === true) return true
  if (readerNotifPermAsked && readerNotifPermGranted === false) return false
  readerNotifPermAsked = true
  try {
    const mod = await import('@capacitor/local-notifications').catch(() => null)
    const LN = (mod as { LocalNotifications?: LocalNotificationsPlugin } | null)?.LocalNotifications
    if (LN) {
      const cur = await LN.checkPermissions().catch(() => ({ display: 'prompt' }))
      if (cur.display === 'granted') {
        readerNotifPermGranted = true
        return true
      }
      const req = await LN.requestPermissions().catch(() => ({ display: 'denied' }))
      readerNotifPermGranted = req.display === 'granted'
      return readerNotifPermGranted
    }
  } catch {
    /* */
  }
  readerNotifPermGranted = null
  return true
}

async function requestUnrestrictedBatteryIfNeeded(): Promise<void> {
  if (!isBrowserEnv() || !isCapacitorAndroid() || readerBatteryPromptShown) return
  readerBatteryPromptShown = true
  try {
    const mod = await import('@capawesome-team/capacitor-android-battery-optimization').catch(
      () => null,
    )
    const plugin = (mod as { BatteryOptimization?: BatteryOptimizationPlugin } | null)
      ?.BatteryOptimization
    if (plugin) {
      if (plugin.isBatteryOptimizationEnabled) {
        const status = await plugin.isBatteryOptimizationEnabled().catch(() => ({ enabled: false }))
        if (status?.enabled && plugin.requestDisableBatteryOptimization) {
          await plugin.requestDisableBatteryOptimization().catch(() => {})
        }
      } else if (plugin.isIgnoringBatteryOptimizations) {
        const st = await plugin.isIgnoringBatteryOptimizations().catch(() => null)
        const ignoring = Boolean(st?.value ?? st?.isIgnoring)
        if (!ignoring && plugin.requestIgnoreBatteryOptimizations) {
          await plugin.requestIgnoreBatteryOptimizations().catch(() => {})
        }
      }
    }
  } catch {
    /* */
  }
}

export function getReaderOemBackgroundTips(): string[] {
  const tips: string[] = [
    'Activa notificaciones de GCO (Android 13+).',
    'Batería → Sin restricciones para GCO.',
  ]
  if (isSamsungDevice()) {
    tips.push('Samsung: Ajustes → Apps → GCO → Batería → Sin restricciones + Aparecer encima.')
  }
  if (isXiaomiFamily()) {
    tips.push('Xiaomi: Autostart ON + Batería Sin restricciones + Ventanas emergentes.')
  }
  return tips
}

export async function bootstrapReaderBackground(): Promise<void> {
  if (!isBrowserEnv() || !isCapacitorAndroid()) return
  try {
    await ensureAndroidNotificationPermission()
  } catch {
    /* */
  }
  window.setTimeout(() => {
    void requestUnrestrictedBatteryIfNeeded()
  }, 1000)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Capgo Media Session
 * ═══════════════════════════════════════════════════════════════════════════ */
type CapMsPlaybackState = 'none' | 'paused' | 'playing'
type CapMsAction =
  | 'play'
  | 'pause'
  | 'stop'
  | 'seekbackward'
  | 'seekforward'
  | 'previoustrack'
  | 'nexttrack'
type CapMsActionHandler = (details?: { seekOffset?: number; seekTime?: number }) => void

type CapMediaSessionPlugin = {
  setMetadata: (opts: {
    title?: string
    artist?: string
    album?: string
    artwork?: { src: string; sizes?: string; type?: string }[]
  }) => Promise<void>
  setPlaybackState: (opts: { playbackState: CapMsPlaybackState }) => Promise<void>
  setActionHandler: (
    opts: { action: CapMsAction },
    handler: CapMsActionHandler | null,
  ) => Promise<void>
}

let capMs: CapMediaSessionPlugin | null = null
let capMsTried = false

async function loadCapMediaSession(): Promise<CapMediaSessionPlugin | null> {
  if (capMs) return capMs
  if (capMsTried) return null
  capMsTried = true
  if (!isCapacitorNative()) return null
  try {
    const bridged = getCapacitor()?.Plugins?.MediaSession as CapMediaSessionPlugin | undefined
    if (
      bridged &&
      typeof bridged.setMetadata === 'function' &&
      typeof bridged.setPlaybackState === 'function'
    ) {
      capMs = bridged
      return capMs
    }
    const mod = await import('@capgo/capacitor-media-session')
    const bag = mod as Record<string, unknown>
    const raw = (bag.MediaSession ?? bag.default) as CapMediaSessionPlugin | null
    if (
      raw &&
      typeof raw.setMetadata === 'function' &&
      typeof raw.setPlaybackState === 'function' &&
      typeof raw.setActionHandler === 'function'
    ) {
      capMs = raw
      return capMs
    }
  } catch {
    /* ok en web */
  }
  return null
}

function hasWebMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Hook principal
 * ═══════════════════════════════════════════════════════════════════════════ */
export function useSpeechReader() {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState('')
  const [charIndex, setCharIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesReady, setVoicesReady] = useState(false)
  const [noVoicesAvailable, setNoVoicesAvailable] = useState(false)
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(null)
  const [showVoiceInstaller, setShowVoiceInstaller] = useState(false)
  const [backgroundSupported] = useState(
    () => hasWebMediaSession() || typeof window !== 'undefined',
  )

  const textRef = useRef('')
  const watchdogRef = useRef<number | null>(null)
  const voicePollRef = useRef<number | null>(null)
  const voicePollAttemptsRef = useRef(0)
  const queueRef = useRef<string[]>([])
  const queueOffsetRef = useRef<number[]>([])
  const queueIdxRef = useRef(0)
  const cancelledRef = useRef(false)
  const keepAliveRef = useRef<HTMLAudioElement | null>(null)
  const chapterHandlersRef = useRef<ChapterNavHandlers>({})
  const mediaMetaRef = useRef<ReaderMediaMeta | null>(null)

  const pauseRef = useRef<() => void>(() => {})
  const resumeRef = useRef<() => void>(() => {})
  const stopRef = useRef<() => void>(() => {})
  const skipBackRef = useRef<(sec: SkipSeconds) => void>(() => {})
  const skipForwardRef = useRef<(sec: SkipSeconds) => void>(() => {})

  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'

  useEffect(() => {
    if (typeof Audio === 'undefined') return
    try {
      const a = new Audio(SILENT_LOOP_SRC)
      a.loop = true
      a.preload = 'auto'
      a.volume = KEEPALIVE_VOLUME
      a.setAttribute('playsinline', 'true')
      keepAliveRef.current = a
    } catch {
      keepAliveRef.current = null
    }
    return () => {
      try {
        keepAliveRef.current?.pause()
      } catch {
        /* */
      }
      keepAliveRef.current = null
    }
  }, [])

  const startKeepAlive = useCallback(() => {
    const a = keepAliveRef.current
    if (!a) return
    try {
      setAudioSessionPlayback()
      const p = a.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      /* */
    }
  }, [])

  const stopKeepAlive = useCallback(() => {
    const a = keepAliveRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch {
      /* */
    }
  }, [])

  const loadVoices = useCallback(() => {
    if (!supported) return []
    try {
      const list = window.speechSynthesis.getVoices() ?? []
      if (list.length > 0) {
        setVoices(list)
        setVoicesReady(true)
        setNoVoicesAvailable(false)
        if (voicePollRef.current) {
          window.clearInterval(voicePollRef.current)
          voicePollRef.current = null
        }
      }
      return list
    } catch {
      return []
    }
  }, [supported])

  useEffect(() => {
    if (!supported) {
      setVoicesReady(true)
      setNoVoicesAvailable(true)
      return
    }
    loadVoices()
    const onVoices = () => {
      loadVoices()
    }
    try {
      window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    } catch {
      try {
        ;(window.speechSynthesis as unknown as { onvoiceschanged: () => void }).onvoiceschanged =
          onVoices
      } catch {
        /* */
      }
    }
    voicePollAttemptsRef.current = 0
    voicePollRef.current = window.setInterval(() => {
      voicePollAttemptsRef.current += 1
      const list = loadVoices()
      if ((list && list.length > 0) || voicePollAttemptsRef.current > 30) {
        if (voicePollRef.current) {
          window.clearInterval(voicePollRef.current)
          voicePollRef.current = null
        }
        if (!list || list.length === 0) {
          setVoicesReady(true)
          setNoVoicesAvailable(true)
        }
      }
    }, 350)
    return () => {
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
      } catch {
        /* */
      }
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* */
      }
      if (voicePollRef.current) window.clearInterval(voicePollRef.current)
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current)
    }
  }, [supported, loadVoices])

  // Auto-abrir instalador si no hay voces
  useEffect(() => {
    if (voicesReady && noVoicesAvailable) {
      const t = window.setTimeout(() => setShowVoiceInstaller(true), 600)
      return () => window.clearTimeout(t)
    }
  }, [voicesReady, noVoicesAvailable])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const startWatchdog = useCallback(() => {
    clearWatchdog()
    if (!supported) return
    const tick = () => {
      try {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        }
        const a = keepAliveRef.current
        if (a && a.paused && window.speechSynthesis.speaking) startKeepAlive()
      } catch {
        /* */
      }
      const interval = document.hidden ? BG_NUDGE_MS : WATCHDOG_MS
      watchdogRef.current = window.setTimeout(tick, interval) as unknown as number
    }
    watchdogRef.current = window.setTimeout(tick, WATCHDOG_MS) as unknown as number
  }, [clearWatchdog, supported, startKeepAlive])

  const updatePlaybackState = useCallback(async (state: CapMsPlaybackState) => {
    const plugin = await loadCapMediaSession()
    if (plugin) {
      try {
        await plugin.setPlaybackState({ playbackState: state })
      } catch {
        /* */
      }
    }
    if (!hasWebMediaSession()) return
    try {
      navigator.mediaSession.playbackState = state
    } catch {
      /* */
    }
  }, [])

  const applyMediaMetadata = useCallback(
    async (meta: ReaderMediaMeta | null) => {
      mediaMetaRef.current = meta
      if (!meta) {
        await updatePlaybackState('none')
        return
      }
      const artwork = meta.artwork
        ? [
            { src: meta.artwork, sizes: '512x512', type: 'image/png' },
            { src: meta.artwork, sizes: '256x256', type: 'image/png' },
          ]
        : []
      const plugin = await loadCapMediaSession()
      if (plugin) {
        try {
          await plugin.setMetadata({
            title: meta.title || 'Audiolibro',
            artist: meta.artist || '',
            album: meta.album || 'GCO · Lector',
            artwork: artwork.length ? artwork : undefined,
          })
        } catch {
          /* */
        }
      }
      if (hasWebMediaSession() && typeof MediaMetadata !== 'undefined') {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: meta.title || 'Audiolibro',
            artist: meta.artist || '',
            album: meta.album || 'GCO · Lector',
            artwork,
          })
        } catch {
          /* */
        }
      }
    },
    [updatePlaybackState],
  )

  const setMediaMetadata = useCallback(
    (meta: ReaderMediaMeta) => {
      void applyMediaMetadata(meta)
    },
    [applyMediaMetadata],
  )

  const setChapterHandlers = useCallback((h: ChapterNavHandlers) => {
    chapterHandlersRef.current = h || {}
  }, [])

  const stop = useCallback(() => {
    cancelledRef.current = true
    queueRef.current = []
    queueOffsetRef.current = []
    queueIdxRef.current = 0
    if (supported) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* */
      }
    }
    clearWatchdog()
    stopKeepAlive()
    void updatePlaybackState('none')
    setSpeaking(false)
    setPaused(false)
  }, [supported, clearWatchdog, stopKeepAlive, updatePlaybackState])

  const speakChunk = useCallback(
    (chunk: string, absoluteStart: number, r: number, vURI: string) => {
      if (!supported || cancelledRef.current) return
      const u = new SpeechSynthesisUtterance(chunk)
      u.rate = Math.min(2, Math.max(0.5, r))
      const voice =
        voices.find((v) => v.voiceURI === vURI) ||
        voices.find((v) => (v.lang || '').toLowerCase().startsWith('es')) ||
        voices[0]
      if (voice) {
        try {
          u.voice = voice
          u.lang = voice.lang || 'es-ES'
        } catch {
          u.lang = 'es-ES'
        }
      } else {
        u.lang = 'es-ES'
      }
      u.onboundary = (ev) => {
        if (ev.name === 'word' || ev.charIndex != null) {
          setCharIndex(absoluteStart + (ev.charIndex ?? 0))
        }
      }
      u.onstart = () => {
        setSpeaking(true)
        setPaused(false)
        startWatchdog()
        startKeepAlive()
        void updatePlaybackState('playing')
        if (mediaMetaRef.current) void applyMediaMetadata(mediaMetaRef.current)
      }
      u.onend = () => {
        if (cancelledRef.current) return
        const nextIdx = queueIdxRef.current + 1
        if (nextIdx < queueRef.current.length) {
          queueIdxRef.current = nextIdx
          speakChunk(queueRef.current[nextIdx], queueOffsetRef.current[nextIdx], r, vURI)
        } else {
          setSpeaking(false)
          setPaused(false)
          setCharIndex(textRef.current.length)
          clearWatchdog()
          stopKeepAlive()
          void updatePlaybackState('none')
        }
      }
      u.onerror = () => {
        if (cancelledRef.current) return
        const nextIdx = queueIdxRef.current + 1
        if (nextIdx < queueRef.current.length) {
          queueIdxRef.current = nextIdx
          speakChunk(queueRef.current[nextIdx], queueOffsetRef.current[nextIdx], r, vURI)
        } else {
          setSpeaking(false)
          setPaused(false)
          clearWatchdog()
          stopKeepAlive()
          void updatePlaybackState('none')
        }
      }
      u.onpause = () => {
        setPaused(true)
        void updatePlaybackState('paused')
      }
      u.onresume = () => {
        setPaused(false)
        void updatePlaybackState('playing')
      }
      try {
        setAudioSessionPlayback()
        window.speechSynthesis.speak(u)
      } catch {
        setSpeaking(false)
        clearWatchdog()
        stopKeepAlive()
      }
    },
    [
      supported,
      voices,
      startWatchdog,
      clearWatchdog,
      startKeepAlive,
      stopKeepAlive,
      updatePlaybackState,
      applyMediaMetadata,
    ],
  )

  const speakFrom = useCallback(
    (text: string, startChar = 0, r = rate, vURI = voiceURI) => {
      if (!supported) return
      if (noVoicesAvailable || (voicesReady && voices.length === 0)) {
        setShowVoiceInstaller(true)
        return
      }
      stop()
      cancelledRef.current = false
      textRef.current = text
      const start = Math.max(0, Math.min(startChar, text.length))
      setCharIndex(start)
      const slice = text.slice(start)
      if (!slice.trim()) return
      const chunks = chunkText(slice)
      const offsets: number[] = []
      let cursor = start
      for (const c of chunks) {
        const idx = text.indexOf(c, cursor)
        const off = idx >= 0 ? idx : cursor
        offsets.push(off)
        cursor = off + c.length
      }
      queueRef.current = chunks
      queueOffsetRef.current = offsets
      queueIdxRef.current = 0

      if (isCapacitorAndroid()) {
        void ensureAndroidNotificationPermission().then((g) => setNotificationsGranted(g))
        void requestUnrestrictedBatteryIfNeeded()
      }

      speakChunk(chunks[0], offsets[0], r, vURI)
    },
    [rate, voiceURI, stop, supported, speakChunk, noVoicesAvailable, voicesReady, voices.length],
  )

  const pause = useCallback(() => {
    if (!speaking || !supported) return
    try {
      window.speechSynthesis.pause()
    } catch {
      /* */
    }
    setPaused(true)
    clearWatchdog()
    void updatePlaybackState('paused')
  }, [speaking, supported, clearWatchdog, updatePlaybackState])

  const resume = useCallback(() => {
    if (!paused || !supported) return
    try {
      window.speechSynthesis.resume()
    } catch {
      /* */
    }
    setPaused(false)
    startWatchdog()
    startKeepAlive()
    void updatePlaybackState('playing')
  }, [paused, supported, startWatchdog, startKeepAlive, updatePlaybackState])

  const skipBack = useCallback(
    (sec: SkipSeconds) => {
      const next = Math.max(0, charIndex - charsForSeconds(sec, rate))
      speakFrom(textRef.current, next, rate, voiceURI)
    },
    [charIndex, rate, voiceURI, speakFrom],
  )

  const skipForward = useCallback(
    (sec: SkipSeconds) => {
      const next = Math.min(textRef.current.length, charIndex + charsForSeconds(sec, rate))
      speakFrom(textRef.current, next, rate, voiceURI)
    },
    [charIndex, rate, voiceURI, speakFrom],
  )

  pauseRef.current = pause
  resumeRef.current = resume
  stopRef.current = stop
  skipBackRef.current = skipBack
  skipForwardRef.current = skipForward

  useEffect(() => {
    let cancelled = false
    const wire = async () => {
      const plugin = await loadCapMediaSession()
      if (cancelled) return
      const onPlay = () => resumeRef.current()
      const onPause = () => pauseRef.current()
      const onStop = () => stopRef.current()
      const onSeekBack = () => skipBackRef.current(10)
      const onSeekFwd = () => skipForwardRef.current(10)
      const onPrev = () => chapterHandlersRef.current.onPrevChapter?.()
      const onNext = () => chapterHandlersRef.current.onNextChapter?.()
      if (plugin) {
        const actions: Array<[CapMsAction, CapMsActionHandler]> = [
          ['play', onPlay],
          ['pause', onPause],
          ['stop', onStop],
          ['seekbackward', onSeekBack],
          ['seekforward', onSeekFwd],
          ['previoustrack', onPrev],
          ['nexttrack', onNext],
        ]
        for (const [action, handler] of actions) {
          void plugin.setActionHandler({ action }, handler).catch(() => {})
        }
      }
      if (hasWebMediaSession()) {
        const ms = navigator.mediaSession
        const safe = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
          try {
            ms.setActionHandler(a, h)
          } catch {
            /* */
          }
        }
        safe('play', onPlay)
        safe('pause', onPause)
        safe('stop', onStop)
        safe('seekbackward', onSeekBack)
        safe('seekforward', onSeekFwd)
        safe('previoustrack', onPrev)
        safe('nexttrack', onNext)
      }
    }
    void wire()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!supported) return
    const onVis = () => {
      if (document.hidden) return
      try {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused && !paused) {
          window.speechSynthesis.resume()
        }
      } catch {
        /* */
      }
      if (speaking) startKeepAlive()
      if (speaking && mediaMetaRef.current) {
        void applyMediaMetadata(mediaMetaRef.current)
        void updatePlaybackState(paused ? 'paused' : 'playing')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [supported, speaking, paused, startKeepAlive, applyMediaMetadata, updatePlaybackState])

  useEffect(() => {
    let remove: (() => void) | undefined
    void import('@capacitor/app')
      .then((mod) => {
        const App = (
          mod as {
            App?: {
              addListener: (
                e: string,
                cb: (data?: { isActive?: boolean }) => void,
              ) => Promise<{ remove: () => void }>
            }
          }
        ).App
        if (!App?.addListener) return
        return App.addListener('appStateChange', (state) => {
          if (state?.isActive === false) return
          if (speaking && !paused) {
            try {
              if (window.speechSynthesis.paused) window.speechSynthesis.resume()
            } catch {
              /* */
            }
            startKeepAlive()
            if (mediaMetaRef.current) {
              void applyMediaMetadata(mediaMetaRef.current)
              void updatePlaybackState('playing')
            }
          }
        }).then((h) => {
          remove = () => h.remove()
        })
      })
      .catch(() => {})
    return () => remove?.()
  }, [speaking, paused, startKeepAlive, applyMediaMetadata, updatePlaybackState])

  useEffect(() => {
    if (isCapacitorAndroid()) void bootstrapReaderBackground()
  }, [])

  const requestNotificationsPermission = useCallback(async () => {
    if (!isCapacitorAndroid()) return true
    readerNotifPermAsked = false
    const g = await ensureAndroidNotificationPermission()
    setNotificationsGranted(g)
    return g
  }, [])

  const openVoiceInstaller = useCallback(() => setShowVoiceInstaller(true), [])
  const closeVoiceInstaller = useCallback(() => setShowVoiceInstaller(false), [])

  return {
    speaking,
    paused,
    rate,
    setRate,
    voiceURI,
    setVoiceURI,
    voices,
    voicesReady,
    noVoicesAvailable,
    supported,
    backgroundSupported,
    charIndex,
    setCharIndex,
    notificationsGranted,
    speakFrom,
    pause,
    resume,
    stop,
    skipBack,
    skipForward,
    setMediaMetadata,
    setChapterHandlers,
    requestNotificationsPermission,
    getReaderOemBackgroundTips,
    bootstrapReaderBackground,
    showVoiceInstaller,
    openVoiceInstaller,
    closeVoiceInstaller,
    detectPlatform,
    isAndroidUa,
    isCapacitorAndroid,
    isCapacitorIOS,
    isSamsungDevice,
    isXiaomiFamily,
  }
}

export default useSpeechReader