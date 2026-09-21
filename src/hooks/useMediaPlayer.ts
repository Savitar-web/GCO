/**
 * ============================================================================
 * useMediaPlayer — motor de audio nativo-first
 * PWA (Chrome/Edge/Safari/Firefox/Brave…) · Capacitor APK/iOS · Electron
 * ============================================================================
 *
 * REGLAS
 * ──────
 * 1. La salida de sonido es SIEMPRE un <audio> HTML5 (object URL desde IndexedDB).
 * 2. @capgo/capacitor-media-session SOLO en Capacitor nativo (Android/iOS).
 *    En web NUNCA se llama al plugin: en web lanza
 *    "MediaSession.then() is not implemented on web" y rompe el play.
 * 3. En web / PWA / Electron: navigator.mediaSession.
 * 4. Singleton fuera de React: desmontar vistas NO pausa el audio.
 * 5. Al pausar NO se destruye la Media Session (la notificación permanece
 *    con play/pause, seekbar y portada).
 * 6. Android 13+ (API 33+): sin POST_NOTIFICATIONS concedido, la notificación
 *    MediaStyle no aparece y el FGS mediaPlayback puede morir. Se pide al
 *    entrar en la app (Activity activa) y otra vez justo antes del primer play.
 * 7. Android 14-16 (Samsung One UI 6-8, S26 Ultra, Xiaomi/Redmi HyperOS):
 *    orden fijo: handlers → metadata (portada base64) → positionState
 *    → audio.play() → playbackState:'playing' → positionState otra vez.
 * 8. El plugin nativo NO acepta blob: en artwork. Solo http(s) o
 *    data:image/…;base64,…  Las portadas se recodifican a JPEG 512px.
 * 9. La barra de progreso del gadget / lock screen exige duration>0 en
 *    setPositionState y el handler 'seekto' registrado ANTES de 'playing'.
 * ============================================================================
 */
import { useEffect, useSyncExternalStore } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

/* ═══════════════════════════════════════════════════════════════════════════
 * Tipos
 * ═══════════════════════════════════════════════════════════════════════════ */
export type RepeatMode = 'off' | 'one' | 'all'
export type OutputMode = 'native' | 'native-nospec' | 'webaudio' | 'none'
export type MediaPlayerApi = typeof api

type CaptureAudioElement = HTMLAudioElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  isPluginAvailable?: (name: string) => boolean
  Plugins?: Record<string, unknown>
}

type MediaArtwork = { src: string; sizes?: string; type?: string }

type CapMediaSessionPlugin = {
  setMetadata: (opts: {
    title?: string
    artist?: string
    album?: string
    artwork?: MediaArtwork[]
  }) => Promise<void>
  setPlaybackState: (opts: {
    playbackState: 'none' | 'paused' | 'playing'
  }) => Promise<void>
  setActionHandler: (
    opts: { action: string },
    handler:
      | ((details?: { seekOffset?: number; seekTime?: number }) => void)
      | null,
  ) => Promise<void>
  setPositionState?: (opts: {
    duration?: number
    position?: number
    playbackRate?: number
  }) => Promise<void>
}

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

/* ═══════════════════════════════════════════════════════════════════════════
 * Utilidades de entorno
 * ═══════════════════════════════════════════════════════════════════════════ */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}
function getCapacitor(): CapacitorBridge | null {
  if (!isBrowser()) return null
  try {
    return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null
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
function isAppleWebKit(): boolean {
  if (!isBrowser()) return false
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafariDesktop =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)
  return isIOS || isSafariDesktop
}
function isIOSAny(): boolean {
  if (!isBrowser()) return false
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /CriOS|FxiOS|EdgiOS/.test(ua)
  )
}
function isAndroidUa(): boolean {
  if (!isBrowser()) return false
  return /Android/i.test(navigator.userAgent || '')
}
function androidMajorVersion(): number | null {
  if (!isBrowser()) return null
  const m = /Android\s+(\d+)/i.exec(navigator.userAgent || '')
  return m ? parseInt(m[1], 10) : null
}
function isSamsungDevice(): boolean {
  if (!isBrowser()) return false
  return /SM-|Samsung|SAMSUNG/i.test(navigator.userAgent || '')
}
function isXiaomiFamily(): boolean {
  if (!isBrowser()) return false
  return /Xiaomi|Redmi|POCO|MIUI|HyperOS/i.test(navigator.userAgent || '')
}
function isElectron(): boolean {
  if (!isBrowser()) return false
  return /Electron/i.test(navigator.userAgent || '')
}
function isPWAStandalone(): boolean {
  if (!isBrowser()) return false
  try {
    const nav = navigator as Navigator & { standalone?: boolean }
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      nav.standalone === true
    )
  } catch {
    return false
  }
}
function setAudioSessionPlayback() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type?: string } }
    if (nav.audioSession && typeof nav.audioSession === 'object') {
      nav.audioSession.type = 'playback'
    }
  } catch {
    /* Safari antiguo */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Permisos runtime — POST_NOTIFICATIONS (API 33+) y batería OEM
 * ═══════════════════════════════════════════════════════════════════════════ */
let notifPermAsked = false
let notifPermGranted: boolean | null = null
let batteryPromptShown = false
let bootstrapStarted = false
let bootstrapDone = false

async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (!isBrowser() || !isCapacitorAndroid()) return true
  if (notifPermGranted === true) return true
  try {
    const mod = await import('@capacitor/local-notifications').catch(() => null)
    const LN = (mod as { LocalNotifications?: LocalNotificationsPlugin } | null)
      ?.LocalNotifications
    if (LN) {
      const cur = await LN.checkPermissions().catch(() => ({ display: 'prompt' }))
      if (cur.display === 'granted') {
        notifPermGranted = true
        notifPermAsked = true
        notify()
        return true
      }
      if (notifPermAsked && cur.display === 'denied' && notifPermGranted === false) {
        return false
      }
      notifPermAsked = true
      const req = await LN.requestPermissions().catch(() => ({ display: 'denied' }))
      notifPermGranted = req.display === 'granted'
      notify()
      return notifPermGranted
    }
  } catch (e) {
    console.warn('[gco] ensureAndroidNotificationPermission:', e)
  }
  notifPermGranted = null
  return true
}

async function requestUnrestrictedBatteryIfNeeded() {
  if (!isBrowser() || !isCapacitorAndroid() || batteryPromptShown) return
  batteryPromptShown = true
  try {
    const mod = await import(
      '@capawesome-team/capacitor-android-battery-optimization'
    ).catch(() => null)
    const plugin = (
      mod as { BatteryOptimization?: BatteryOptimizationPlugin } | null
    )?.BatteryOptimization
    if (!plugin) return
    if (plugin.isBatteryOptimizationEnabled) {
      const status = await plugin
        .isBatteryOptimizationEnabled()
        .catch(() => ({ enabled: false }))
      if (status?.enabled && plugin.requestDisableBatteryOptimization) {
        await plugin.requestDisableBatteryOptimization().catch(() => {})
      }
      return
    }
    if (plugin.isIgnoringBatteryOptimizations) {
      const st = await plugin.isIgnoringBatteryOptimizations().catch(() => null)
      const ignoring = !!(st?.value ?? st?.isIgnoring)
      if (!ignoring && plugin.requestIgnoreBatteryOptimizations) {
        await plugin.requestIgnoreBatteryOptimizations().catch(() => {})
      }
    }
  } catch {
    /* plugin ausente: el usuario puede excluir la app en Ajustes → Batería */
  }
}

/**
 * Llama al entrar en la app (Activity en primer plano). Encadena:
 * 1) POST_NOTIFICATIONS  2) exclusión de optimización de batería.
 * No bloquea la UI; el play no espera a que el usuario pulse "Permitir".
 */
export async function bootstrapNativePlayback(): Promise<void> {
  if (!isBrowser() || bootstrapDone) return
  if (!isCapacitorNative()) {
    bootstrapDone = true
    return
  }
  if (bootstrapStarted) return
  bootstrapStarted = true
  initEnvFlags()
  bindPageLifecycle()
  bindCapacitorListeners()
  await loadCapMediaSession()
  await ensureMediaSessionHandlers()
  if (isCapacitorAndroid()) {
    try {
      await ensureAndroidNotificationPermission()
    } catch {
      /* */
    }
    window.setTimeout(() => {
      void requestUnrestrictedBatteryIfNeeded()
    }, 900)
  }
  bootstrapDone = true
  notify()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Capgo Media Session — SOLO nativo
 * ═══════════════════════════════════════════════════════════════════════════ */
let capMs: CapMediaSessionPlugin | null = null
let capMsFailCount = 0
let capMsHandlersReady = false

function pluginFromCapacitorBridge(): CapMediaSessionPlugin | null {
  try {
    const raw = getCapacitor()?.Plugins?.MediaSession as CapMediaSessionPlugin | undefined
    if (
      raw &&
      typeof raw === 'object' &&
      typeof raw.setMetadata === 'function' &&
      typeof raw.setPlaybackState === 'function'
    ) {
      return raw
    }
  } catch {
    /* */
  }
  return null
}

async function loadCapMediaSession(): Promise<CapMediaSessionPlugin | null> {
  if (capMs) return capMs
  if (!isBrowser() || !isCapacitorNative()) return null
  if (capMsFailCount > 8) return null

  const bridged = pluginFromCapacitorBridge()
  if (bridged) {
    capMs = bridged
    capMsFailCount = 0
    return capMs
  }

  try {
    const cap = getCapacitor()
    if (typeof cap?.isPluginAvailable === 'function') {
      try {
        if (!cap.isPluginAvailable('MediaSession')) {
          capMsFailCount += 1
          return null
        }
      } catch {
        /* */
      }
    }
    const mod = await import('@capgo/capacitor-media-session')
    const bag = mod as Record<string, unknown>
    const raw = (bag.MediaSession ?? bag.default) as CapMediaSessionPlugin | undefined
    if (
      raw &&
      typeof raw === 'object' &&
      typeof raw.setMetadata === 'function' &&
      typeof raw.setPlaybackState === 'function'
    ) {
      capMs = raw
      capMsFailCount = 0
      return capMs
    }
  } catch (e) {
    console.warn('[gco] Capgo MediaSession no disponible (ok en web):', e)
    capMsFailCount += 1
  }
  capMsFailCount += 1
  return null
}

function hasWebMediaSession(): boolean {
  return isBrowser() && typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Portada para el plugin nativo
 * El decoder Android (urlToBitmap) SOLO entiende:
 *   · http(s)://…
 *   · data:*;base64,…
 * blob: se descarta → gadget sin carátula.
 * Recodificamos a JPEG 512 para no OOM en Redmi / One UI.
 * ═══════════════════════════════════════════════════════════════════════════ */
const COVER_NATIVE_SIZE = 512
const coverCache = new Map<string, string>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function shrinkCoverToJpegDataUrl(src: string): Promise<string | null> {
  if (!isBrowser()) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = COVER_NATIVE_SIZE
        canvas.height = COVER_NATIVE_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(src.includes(';base64,') ? src : null)
          return
        }
        const iw = img.naturalWidth || img.width
        const ih = img.naturalHeight || img.height
        const scale = Math.max(COVER_NATIVE_SIZE / iw, COVER_NATIVE_SIZE / ih)
        const dw = iw * scale
        const dh = ih * scale
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, COVER_NATIVE_SIZE, COVER_NATIVE_SIZE)
        ctx.drawImage(img, (COVER_NATIVE_SIZE - dw) / 2, (COVER_NATIVE_SIZE - dh) / 2, dw, dh)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      } catch {
        resolve(src.includes(';base64,') ? src : null)
      }
    }
    img.onerror = () => resolve(src.includes(';base64,') ? src : null)
    img.src = src
  })
}

async function artworkSrcForNative(cover?: string): Promise<string | undefined> {
  if (!cover) return undefined
  const cached = coverCache.get(cover)
  if (cached) return cached
  let src = cover
  try {
    if (src.startsWith('blob:')) {
      const blob = await fetch(src).then((r) => r.blob())
      src = await blobToDataUrl(blob)
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      coverCache.set(cover, src)
      return src
    }
    const jpeg = await shrinkCoverToJpegDataUrl(src)
    const out = jpeg || (src.includes(';base64,') ? src : undefined)
    if (out) coverCache.set(cover, out)
    return out
  } catch {
    return cover.includes(';base64,') ? cover : undefined
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Media Session unificada
 * ═══════════════════════════════════════════════════════════════════════════ */
async function updateMediaSessionMetadata(t: TrackItem | null) {
  if (!isBrowser()) return
  const nativeSrc = t?.coverDataUrl ? await artworkSrcForNative(t.coverDataUrl) : undefined
  const artwork: MediaArtwork[] = []
  if (nativeSrc) {
    artwork.push({
      src: nativeSrc,
      sizes: `${COVER_NATIVE_SIZE}x${COVER_NATIVE_SIZE}`,
      type: nativeSrc.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
    })
  }

  if (isCapacitorNative()) {
    const plugin = await loadCapMediaSession()
    if (plugin) {
      try {
        if (!t) {
          await plugin.setPlaybackState({ playbackState: 'none' })
        } else {
          await plugin.setMetadata({
            title: t.title || 'Sin título',
            artist: t.artist || 'Desconocido',
            album: t.album || '',
            artwork: artwork.length ? artwork : undefined,
          })
        }
      } catch (e) {
        console.warn('[gco] cap setMetadata:', e)
      }
    }
  }

  if (!hasWebMediaSession()) return
  try {
    if (!t) {
      navigator.mediaSession.metadata = null
      return
    }
    const webArt: MediaImage[] = []
    if (t.coverDataUrl) {
      for (const s of ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']) {
        webArt.push({ src: t.coverDataUrl, sizes: s, type: 'image/png' })
      }
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Sin título',
      artist: t.artist || 'Desconocido',
      album: t.album || '',
      artwork: webArt,
    })
  } catch {
    /* */
  }
}

async function setMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
  if (!isBrowser()) return
  if (isCapacitorNative()) {
    const plugin = await loadCapMediaSession()
    if (plugin) {
      try {
        await plugin.setPlaybackState({ playbackState: state })
      } catch {
        /* */
      }
    }
  }
  if (!hasWebMediaSession()) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* */
  }
}

async function updatePositionState(
  durationMs: number,
  positionMs: number,
  playbackRate = 1,
) {
  if (!isBrowser()) return
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return
  const duration = durationMs / 1000
  const position = clamp(positionMs, 0, durationMs) / 1000
  const rate = playbackRate > 0 ? playbackRate : 1
  const safePos = Math.min(Math.max(0, position), duration)
  if (isCapacitorNative()) {
    const plugin = await loadCapMediaSession()
    if (plugin?.setPositionState) {
      try {
        await plugin.setPositionState({
          duration,
          position: safePos,
          playbackRate: rate,
        })
      } catch {
        /* */
      }
    }
  }
  if (!hasWebMediaSession()) return
  const ms = navigator.mediaSession as MediaSession & {
    setPositionState?: (s: {
      duration: number
      playbackRate: number
      position: number
    }) => void
  }
  if (!ms.setPositionState) return
  try {
    ms.setPositionState({ duration, playbackRate: rate, position: safePos })
  } catch {
    /* */
  }
}

async function pushNowPlayingToSystem() {
  const t = trackRef.current
  const audio = audioRef.current
  if (!t) return
  await updateMediaSessionMetadata(t)
  const dur = (audio?.duration || 0) * 1000 || snapshot.durationMs
  const pos = (audio?.currentTime || 0) * 1000 || snapshot.currentMs
  await updatePositionState(dur, pos, rateRef.current)
  await setMediaSessionPlaybackState(playingRef.current ? 'playing' : 'paused')
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Snapshot reactivo (singleton)
 * ═══════════════════════════════════════════════════════════════════════════ */
type Snapshot = {
  track: TrackItem | null
  playing: boolean
  currentMs: number
  durationMs: number
  shuffle: boolean
  repeat: RepeatMode
  volume: number
  gain: number
  rate: number
  error: string | null
  outputMode: OutputMode
  version: number
  nativeMediaSession: boolean
  notificationsGranted: boolean | null
  androidVersion: number | null
}
type Listener = () => void
const listeners = new Set<Listener>()
let snapshot: Snapshot = {
  track: null,
  playing: false,
  currentMs: 0,
  durationMs: 0,
  shuffle: false,
  repeat: 'off',
  volume: 1,
  gain: 1,
  rate: 1,
  error: null,
  outputMode: 'none',
  version: 0,
  nativeMediaSession: false,
  notificationsGranted: null,
  androidVersion: null,
}
function notify() {
  snapshot = {
    ...snapshot,
    version: snapshot.version + 1,
    nativeMediaSession: !!capMs && isCapacitorNative(),
    notificationsGranted: notifPermGranted,
  }
  listeners.forEach((l) => {
    try {
      l()
    } catch {
      /* */
    }
  })
}
function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function getSnapshot(): Snapshot {
  return snapshot
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Referencias del motor
 * ═══════════════════════════════════════════════════════════════════════════ */
const audioRef: { current: HTMLAudioElement | null } = { current: null }
const urlRef: { current: string | null } = { current: null }
const queueRef: { current: TrackItem[] } = { current: [] }
const indexRef: { current: number } = { current: 0 }
const loadGenRef: { current: number } = { current: 0 }
const ctxRef: { current: AudioContext | null } = { current: null }
const analyserRef: { current: AnalyserNode | null } = { current: null }
const mediaSourceRef: { current: MediaElementAudioSourceNode | null } = { current: null }
const streamSourceRef: { current: MediaStreamAudioSourceNode | null } = { current: null }
const gainNodeRef: { current: GainNode | null } = { current: null }
const bassFilterRef: { current: BiquadFilterNode | null } = { current: null }
const midFilterRef: { current: BiquadFilterNode | null } = { current: null }
const trebleFilterRef: { current: BiquadFilterNode | null } = { current: null }
const voiceFilterRef: { current: BiquadFilterNode | null } = { current: null }
const panNodeRef: { current: StereoPannerNode | null } = { current: null }
const compRef: { current: DynamicsCompressorNode | null } = { current: null }
const graphReady = { current: false }
const outputModeRef: { current: OutputMode } = { current: 'none' }

/** FX de audio real (EQ + pan + corte de voz aproximado). */
export type AudioFxState = {
  bass: number
  mid: number
  treble: number
  vocalCut: number
  pan: number
  spatial8d: number
}

const DEFAULT_AUDIO_FX: AudioFxState = {
  bass: 0,
  mid: 0,
  treble: 0,
  vocalCut: 0,
  pan: 0,
  spatial8d: 0,
}

const audioFxRef: { current: AudioFxState } = { current: { ...DEFAULT_AUDIO_FX } }
let spatial8dTimer: number | null = null
let spatial8dPhase = 0

function applyAudioFxNodes() {
  const fx = audioFxRef.current
  try {
    if (bassFilterRef.current) bassFilterRef.current.gain.value = clamp(fx.bass, -12, 12)
    if (midFilterRef.current) midFilterRef.current.gain.value = clamp(fx.mid, -12, 12)
    if (trebleFilterRef.current) trebleFilterRef.current.gain.value = clamp(fx.treble, -12, 12)
    if (voiceFilterRef.current) {
      /* notch Q alto = más corte de banda vocal */
      const cut = clamp(fx.vocalCut, 0, 1)
      voiceFilterRef.current.Q.value = 0.5 + cut * 8
      voiceFilterRef.current.frequency.value = 1000 + cut * 400
    }
    if (panNodeRef.current && fx.spatial8d <= 0) {
      panNodeRef.current.pan.value = clamp(fx.pan, -1, 1)
    }
  } catch {
    /* */
  }
  /* Auto-pan 8D */
  if (spatial8dTimer != null) {
    window.clearInterval(spatial8dTimer)
    spatial8dTimer = null
  }
  if (fx.spatial8d > 0 && panNodeRef.current && typeof window !== 'undefined') {
    const speed = clamp(fx.spatial8d, 0.2, 3)
    spatial8dTimer = window.setInterval(() => {
      spatial8dPhase += 0.04 * speed
      if (panNodeRef.current) {
        panNodeRef.current.pan.value = Math.sin(spatial8dPhase) * 0.92
      }
    }, 32)
  }
}
const mediaSessionReady = { current: false }
const appleWebKit = { current: false }
const androidEnv = { current: false }
const nativeShell = { current: false }
const playingRef = { current: false }
const volumeRef = { current: 1 }
const gainRefState = { current: 1 }
const rateRef = { current: 1 }
const trackRef: { current: TrackItem | null } = { current: null }
const shuffleRef = { current: false }
const repeatRef: { current: RepeatMode } = { current: 'off' }
const wantPlayingRef = { current: false }
let pageLifecycleBound = false
let capacitorListenersBound = false
let floatingBarRequested = false
let floatingMountAttempts = 0
let positionTickTimer: number | null = null

function initEnvFlags() {
  if (!isBrowser()) return
  appleWebKit.current = isAppleWebKit()
  androidEnv.current = isAndroidUa()
  nativeShell.current = isCapacitorNative() || isElectron()
  snapshot.androidVersion = androidMajorVersion()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * URL / volumen
 * ═══════════════════════════════════════════════════════════════════════════ */
function cleanupUrl() {
  if (urlRef.current) {
    try {
      URL.revokeObjectURL(urlRef.current)
    } catch {
      /* */
    }
    urlRef.current = null
  }
}
function applyElementVolume(audio: HTMLAudioElement) {
  const v = volumeRef.current
  const g = gainRefState.current
  if (outputModeRef.current === 'webaudio') {
    audio.volume = clamp(v, 0, 1)
    if (gainNodeRef.current && ctxRef.current) {
      const t = ctxRef.current.currentTime
      const node = gainNodeRef.current
      try {
        node.gain.cancelScheduledValues(t)
        node.gain.setValueAtTime(node.gain.value, t)
        node.gain.linearRampToValueAtTime(clamp(g, 0, 3), t + 0.04)
      } catch {
        node.gain.value = clamp(g, 0, 3)
      }
    }
  } else {
    audio.volume = clamp(v * clamp(g, 0, 1), 0, 1)
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Grafo de análisis (opcional; no sustituye salida en móvil)
 * ═══════════════════════════════════════════════════════════════════════════ */
function ensureAudioContext(): AudioContext | null {
  try {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') {
        void ctxRef.current.resume().catch(() => {})
      }
      return ctxRef.current
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctxRef.current = new AC({ latencyHint: 'playback' })
    return ctxRef.current
  } catch {
    return null
  }
}
function ensureGraph(audio: HTMLAudioElement) {
  try {
    if (graphReady.current) {
      applyElementVolume(audio)
      return
    }
    const forceNativeOnly =
      appleWebKit.current || androidEnv.current || nativeShell.current
    if (appleWebKit.current) {
      outputModeRef.current = 'native-nospec'
      snapshot.outputMode = 'native-nospec'
      graphReady.current = true
      applyElementVolume(audio)
      setAudioSessionPlayback()
      notify()
      return
    }
    const ctx = ensureAudioContext()
    if (!ctx) {
      outputModeRef.current = 'native-nospec'
      snapshot.outputMode = 'native-nospec'
      graphReady.current = true
      applyElementVolume(audio)
      notify()
      return
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    if (!analyserRef.current) {
      const an = ctx.createAnalyser()
      an.fftSize = 512
      an.smoothingTimeConstant = 0.75
      an.minDecibels = -90
      an.maxDecibels = -10
      analyserRef.current = an
    }
    const el = audio as CaptureAudioElement
    const captureFn =
      typeof el.captureStream === 'function'
        ? () => el.captureStream!()
        : typeof el.mozCaptureStream === 'function'
          ? () => el.mozCaptureStream!()
          : null
    if (captureFn) {
      try {
        const stream = captureFn()
        if (stream && stream.getAudioTracks().length > 0) {
          streamSourceRef.current = ctx.createMediaStreamSource(stream)
          streamSourceRef.current.connect(analyserRef.current)
          outputModeRef.current = 'native'
          snapshot.outputMode = 'native'
          graphReady.current = true
          applyElementVolume(audio)
          notify()
          return
        }
      } catch {
        /* */
      }
    }
    if (forceNativeOnly) {
      outputModeRef.current = 'native-nospec'
      snapshot.outputMode = 'native-nospec'
      graphReady.current = true
      applyElementVolume(audio)
      notify()
      return
    }
    if (!bassFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowshelf'
      f.frequency.value = 180
      f.gain.value = audioFxRef.current.bass
      bassFilterRef.current = f
    }
    if (!midFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = 1000
      f.Q.value = 0.9
      f.gain.value = audioFxRef.current.mid
      midFilterRef.current = f
    }
    if (!trebleFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'highshelf'
      f.frequency.value = 3200
      f.gain.value = audioFxRef.current.treble
      trebleFilterRef.current = f
    }
    if (!voiceFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'notch'
      f.frequency.value = 1200
      f.Q.value = 1.2
      f.gain.value = 0
      voiceFilterRef.current = f
    }
    if (!panNodeRef.current) {
      try {
        const p = ctx.createStereoPanner()
        p.pan.value = audioFxRef.current.pan
        panNodeRef.current = p
      } catch {
        panNodeRef.current = null
      }
    }
    if (!gainNodeRef.current) {
      const g = ctx.createGain()
      g.gain.value = clamp(gainRefState.current, 0, 3)
      gainNodeRef.current = g
    }
    if (!compRef.current) {
      const c = ctx.createDynamicsCompressor()
      c.threshold.value = -6
      c.knee.value = 12
      c.ratio.value = 4
      c.attack.value = 0.003
      c.release.value = 0.18
      compRef.current = c
    }
    if (!mediaSourceRef.current) {
      mediaSourceRef.current = ctx.createMediaElementSource(audio)
      /* source → EQ → voice notch → pan → gain → comp → analyser → out */
      const src = mediaSourceRef.current
      const bass = bassFilterRef.current!
      const mid = midFilterRef.current!
      const treble = trebleFilterRef.current!
      const voice = voiceFilterRef.current!
      const pan = panNodeRef.current
      const gain = gainNodeRef.current!
      const comp = compRef.current!
      const an = analyserRef.current!
      src.connect(bass)
      bass.connect(mid)
      mid.connect(treble)
      treble.connect(voice)
      if (pan) {
        voice.connect(pan)
        pan.connect(gain)
      } else {
        voice.connect(gain)
      }
      gain.connect(comp)
      comp.connect(an)
      an.connect(ctx.destination)
    }
    applyAudioFxNodes()
    outputModeRef.current = 'webaudio'
    snapshot.outputMode = 'webaudio'
    graphReady.current = true
    applyElementVolume(audio)
    notify()
  } catch {
    outputModeRef.current = 'native-nospec'
    snapshot.outputMode = 'native-nospec'
    graphReady.current = true
    applyElementVolume(audio)
    notify()
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ciclo de vida / reanudación
 * ═══════════════════════════════════════════════════════════════════════════ */
async function resumeAudioContext() {
  setAudioSessionPlayback()
  const ctx = ctxRef.current
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* */
    }
  }
  const audio = audioRef.current
  if (audio && audio.src && audio.paused && wantPlayingRef.current) {
    try {
      await audio.play()
      playingRef.current = true
      snapshot.playing = true
      await setMediaSessionPlaybackState('playing')
      startPositionTick()
      notify()
    } catch {
      /* autoplay */
    }
  }
  if (trackRef.current) void pushNowPlayingToSystem()
  else api.refreshMediaSession()
}

function startPositionTick() {
  stopPositionTick()
  if (!isBrowser()) return
  const tick = () => {
    const audio = audioRef.current
    if (!audio || !playingRef.current) return
    const dur = (audio.duration || 0) * 1000 || snapshot.durationMs
    const pos = (audio.currentTime || 0) * 1000
    void updatePositionState(dur, pos, rateRef.current)
  }
  positionTickTimer = window.setInterval(tick, 500)
  tick()
}
function stopPositionTick() {
  if (positionTickTimer != null) {
    window.clearInterval(positionTickTimer)
    positionTickTimer = null
  }
}
function bindPageLifecycle() {
  if (pageLifecycleBound || !isBrowser()) return
  pageLifecycleBound = true
  const onVisible = () => {
    if (document.visibilityState === 'visible') void resumeAudioContext()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('pageshow', (ev) => {
    void resumeAudioContext()
    if (ev.persisted) void resumeAudioContext()
  })
  // NO cortar el tick en pagehide si queremos seguir sonando: en Android el
  // seekbar del gadget se congela si dejamos de empujar setPositionState.
  window.addEventListener('pagehide', () => {
    if (!wantPlayingRef.current) stopPositionTick()
  })
  if (isIOSAny()) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window.setTimeout(() => void resumeAudioContext(), 300)
      }
    })
  }
}
function bindCapacitorListeners() {
  if (capacitorListenersBound || !isBrowser() || !isCapacitorNative()) return
  capacitorListenersBound = true
  try {
    void import('@capacitor/app')
      .then((mod) => {
        const App = (
          mod as {
            App?: {
              addListener: (
                e: string,
                cb: (data: { isActive?: boolean }) => void,
              ) => Promise<{ remove: () => void }>
            }
          }
        ).App
        if (!App?.addListener) return
        void App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            void bootstrapNativePlayback()
            void resumeAudioContext()
            if (trackRef.current) {
              void ensureMediaSessionHandlers()
              void pushNowPlayingToSystem()
            }
          }
        })
        void App.addListener('resume', () => {
          void resumeAudioContext()
          if (trackRef.current) void pushNowPlayingToSystem()
        })
      })
      .catch(() => {})
  } catch {
    /* */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Handlers Media Session
 * ═══════════════════════════════════════════════════════════════════════════ */
function wireWebAction(
  action: MediaSessionAction,
  handler: (details?: { seekOffset?: number; seekTime?: number }) => void,
) {
  if (!hasWebMediaSession()) return
  try {
    navigator.mediaSession.setActionHandler(action, (details) => {
      handler({
        seekOffset: details?.seekOffset,
        seekTime: details?.seekTime,
      })
    })
  } catch {
    /* acción no soportada */
  }
}
function wireCapAction(
  action: string,
  handler: (details?: { seekOffset?: number; seekTime?: number }) => void,
) {
  if (!capMs || !isCapacitorNative()) return
  void capMs
    .setActionHandler({ action }, (details) => {
      handler({
        seekOffset: details?.seekOffset,
        seekTime: details?.seekTime,
      })
    })
    .catch(() => {})
}

async function ensureMediaSessionHandlers() {
  if (!isBrowser()) return
  if (isCapacitorNative()) await loadCapMediaSession()
  if (mediaSessionReady.current && (capMsHandlersReady || !capMs)) return

  const onPlay = () => {
    wantPlayingRef.current = true
    void api.toggle()
  }
  const onPause = () => {
    wantPlayingRef.current = false
    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.pause()
      playingRef.current = false
      snapshot.playing = false
      void setMediaSessionPlaybackState('paused')
      stopPositionTick()
      notify()
    }
  }
  const onStop = () => onPause()
  const onPrev = () => {
    void api.prev()
  }
  const onNext = () => {
    void api.next()
  }
  const onSeekBack = (d?: { seekOffset?: number }) => {
    const audio = audioRef.current
    if (!audio) return
    const offset = (d?.seekOffset ?? 10) * 1000
    api.seek(Math.max(0, audio.currentTime * 1000 - offset))
  }
  const onSeekFwd = (d?: { seekOffset?: number }) => {
    const audio = audioRef.current
    if (!audio) return
    const offset = (d?.seekOffset ?? 10) * 1000
    const dur = (audio.duration || 0) * 1000
    api.seek(Math.min(dur || Number.MAX_SAFE_INTEGER, audio.currentTime * 1000 + offset))
  }
  const onSeekTo = (d?: { seekTime?: number }) => {
    if (d?.seekTime == null) return
    api.seek(d.seekTime * 1000)
  }

  wireWebAction('play', onPlay)
  wireWebAction('pause', onPause)
  wireWebAction('stop', onStop)
  wireWebAction('previoustrack', onPrev)
  wireWebAction('nexttrack', onNext)
  wireWebAction('seekbackward', onSeekBack)
  wireWebAction('seekforward', onSeekFwd)
  wireWebAction('seekto', onSeekTo)

  if (capMs && isCapacitorNative()) {
    wireCapAction('play', onPlay)
    wireCapAction('pause', onPause)
    wireCapAction('stop', onStop)
    wireCapAction('previoustrack', onPrev)
    wireCapAction('nexttrack', onNext)
    wireCapAction('seekbackward', onSeekBack)
    wireCapAction('seekforward', onSeekFwd)
    wireCapAction('seekto', onSeekTo)
    capMsHandlersReady = true
  }
  mediaSessionReady.current = true
  snapshot.nativeMediaSession = !!capMs && isCapacitorNative()
  notify()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PlayerBar flotante
 * ═══════════════════════════════════════════════════════════════════════════ */
type FloatingMounter = () => void
let floatingMounter: FloatingMounter | null = null
export function registerFloatingBarMounter(fn: FloatingMounter) {
  floatingMounter = fn
  if (!isBrowser()) return
  if (snapshot.track) {
    try {
      fn()
    } catch (e) {
      console.warn('[gco] floating mounter failed:', e)
    }
  }
}
function requestFloatingBar() {
  if (!isBrowser()) return
  if (floatingMounter) {
    try {
      floatingMounter()
      return
    } catch {
      /* */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('gco:need-player-bar'))
  } catch {
    /* */
  }
  if (floatingBarRequested && floatingMountAttempts > 3) return
  floatingBarRequested = true
  floatingMountAttempts += 1
  void import('@/features/musica/PlayerBar')
    .then((mod: { ensureGlobalPlayerBar?: () => void }) => {
      if (typeof mod.ensureGlobalPlayerBar === 'function') mod.ensureGlobalPlayerBar()
      else floatingBarRequested = false
    })
    .catch(() => {
      floatingBarRequested = false
    })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Elemento <audio>
 * En WebView Android el Audio() huérfano (fuera del DOM) se pausa al ir a
 * segundo plano. Lo montamos oculto en document.body.
 * ═══════════════════════════════════════════════════════════════════════════ */
function ensureAudio(): HTMLAudioElement {
  initEnvFlags()
  bindPageLifecycle()
  bindCapacitorListeners()
  if (!audioRef.current) {
    const a = new Audio()
    a.preload = 'auto'
    a.crossOrigin = 'anonymous'
    a.setAttribute('playsinline', 'true')
    a.setAttribute('webkit-playsinline', 'true')
    a.setAttribute('data-gco', 'media-engine')
    a.controls = false
    a.style.cssText =
      'position:fixed;width:0;height:0;opacity:0;pointer-events:none;left:-9999px;'
    try {
      ;(a as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
        false
    } catch {
      /* */
    }
    try {
      a.preservesPitch = true
    } catch {
      /* */
    }
    a.volume = clamp(volumeRef.current, 0, 1)
    try {
      if (document.body && !a.isConnected) document.body.appendChild(a)
    } catch {
      /* */
    }
    a.ontimeupdate = () => {
      const ms = (a.currentTime || 0) * 1000
      snapshot.currentMs = ms
      notify()
    }
    a.onloadedmetadata = () => {
      const dur = (a.duration || 0) * 1000
      if (dur > 0) {
        snapshot.durationMs = dur
        notify()
        void updatePositionState(dur, snapshot.currentMs, rateRef.current)
      }
    }
    a.ondurationchange = () => {
      if (a.duration && Number.isFinite(a.duration)) {
        snapshot.durationMs = a.duration * 1000
        notify()
        void updatePositionState(
          snapshot.durationMs,
          (a.currentTime || 0) * 1000,
          rateRef.current,
        )
      }
    }
    a.onplay = () => {
      playingRef.current = true
      wantPlayingRef.current = true
      snapshot.playing = true
      void setMediaSessionPlaybackState('playing')
      void updateMediaSessionMetadata(trackRef.current)
      setAudioSessionPlayback()
      startPositionTick()
      notify()
      requestFloatingBar()
    }
    a.onplaying = () => {
      playingRef.current = true
      wantPlayingRef.current = true
      snapshot.playing = true
      void setMediaSessionPlaybackState('playing')
      startPositionTick()
      notify()
    }
    a.onpause = () => {
      playingRef.current = false
      snapshot.playing = false
      void setMediaSessionPlaybackState('paused')
      if (!wantPlayingRef.current) stopPositionTick()
      notify()
    }
    a.onended = () => {
      void onEnded()
    }
    a.onerror = () => {
      const code = a.error?.code
      const msg =
        code === 2
          ? 'Error de red al cargar el audio.'
          : code === 3
            ? 'No se pudo decodificar el archivo de audio.'
            : code === 4
              ? 'Formato de audio no soportado.'
              : 'No se pudo reproducir el archivo de audio.'
      snapshot.error = msg
      playingRef.current = false
      wantPlayingRef.current = false
      snapshot.playing = false
      void setMediaSessionPlaybackState('paused')
      stopPositionTick()
      notify()
      window.setTimeout(() => {
        void api.next()
      }, 500)
    }
    audioRef.current = a
    ensureGraph(a)
    void ensureMediaSessionHandlers()
    setAudioSessionPlayback()
  }
  return audioRef.current
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Carga de pistas
 * ═══════════════════════════════════════════════════════════════════════════ */
async function resolveBlob(blobKey: string): Promise<Blob | null> {
  if (!blobKey) return null
  try {
    const raw = await getTrackBlob(blobKey)
    if (!raw) return null
    if (raw instanceof Blob) return raw
    if (typeof raw === 'object' && raw !== null && 'blob' in raw) {
      const b = (raw as { blob: Blob }).blob
      return b instanceof Blob ? b : null
    }
    return null
  } catch (e) {
    console.warn('[gco] getTrackBlob failed:', blobKey, e)
    return null
  }
}
async function loadTrack(t: TrackItem) {
  const gen = ++loadGenRef.current
  snapshot.error = null
  notify()
  if (!t?.blobKey) {
    snapshot.error = 'La pista no tiene archivo de audio asociado.'
    notify()
    return
  }
  const media = await resolveBlob(t.blobKey)
  if (gen !== loadGenRef.current) return
  if (!media) {
    snapshot.error = 'Archivo no encontrado en la biblioteca offline.'
    notify()
    return
  }
  const audio = ensureAudio()
  ensureGraph(audio)
  cleanupUrl()
  const url = URL.createObjectURL(media)
  urlRef.current = url
  try {
    audio.pause()
  } catch {
    /* */
  }
  audio.src = url
  try {
    audio.load()
  } catch {
    /* */
  }
  audio.playbackRate = rateRef.current
  try {
    audio.preservesPitch = true
  } catch {
    /* */
  }
  applyElementVolume(audio)
  trackRef.current = t
  snapshot.track = t
  snapshot.currentMs = 0
  snapshot.durationMs = t.durationMs || 0
  notify()
  requestFloatingBar()
  await updateMediaSessionMetadata(t)
  await ensureMediaSessionHandlers()
  await new Promise<void>((resolve) => {
    if (gen !== loadGenRef.current) {
      resolve()
      return
    }
    const done = () => {
      if (gen === loadGenRef.current) {
        const dur = (audio.duration || 0) * 1000
        if (dur > 0) snapshot.durationMs = dur
        notify()
      }
      audio.removeEventListener('loadedmetadata', done)
      audio.removeEventListener('canplay', done)
      resolve()
    }
    if (audio.readyState >= 1) done()
    else {
      audio.addEventListener('loadedmetadata', done)
      audio.addEventListener('canplay', done)
      window.setTimeout(done, 4000)
    }
  })
}
async function playIndex(i: number) {
  const q = queueRef.current
  if (!q.length) return
  const idx = ((i % q.length) + q.length) % q.length
  indexRef.current = idx
  await api.playTrack(q[idx])
}
async function onEnded() {
  if (repeatRef.current === 'one') {
    const audio = ensureAudio()
    audio.currentTime = 0
    try {
      wantPlayingRef.current = true
      await audio.play()
      playingRef.current = true
      snapshot.playing = true
      await setMediaSessionPlaybackState('playing')
      startPositionTick()
      notify()
    } catch {
      playingRef.current = false
      wantPlayingRef.current = false
      snapshot.playing = false
      await setMediaSessionPlaybackState('paused')
      notify()
    }
    return
  }
  if (repeatRef.current === 'all' || indexRef.current < queueRef.current.length - 1) {
    await api.next()
  } else {
    playingRef.current = false
    wantPlayingRef.current = false
    snapshot.playing = false
    await setMediaSessionPlaybackState('paused')
    stopPositionTick()
    notify()
  }
}

async function prepareAndroidBackgroundPlayback() {
  if (!isCapacitorAndroid()) return
  try {
    await ensureAndroidNotificationPermission()
  } catch {
    /* */
  }
  void requestUnrestrictedBatteryIfNeeded()
  await loadCapMediaSession()
  await ensureMediaSessionHandlers()
}

async function armNativeSessionThenPlay(t: TrackItem, audio: HTMLAudioElement) {
  await ensureMediaSessionHandlers()
  await updateMediaSessionMetadata(t)
  const durHint = (audio.duration || 0) * 1000 || t.durationMs || snapshot.durationMs
  if (durHint > 0) {
    await updatePositionState(durHint, (audio.currentTime || 0) * 1000, rateRef.current)
  }
  await audio.play()
  playingRef.current = true
  snapshot.playing = true
  snapshot.error = null
  await setMediaSessionPlaybackState('playing')
  const dur = (audio.duration || 0) * 1000 || snapshot.durationMs
  await updatePositionState(dur, (audio.currentTime || 0) * 1000, rateRef.current)
  startPositionTick()
  notify()
  requestFloatingBar()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * API pública
 * ═══════════════════════════════════════════════════════════════════════════ */
export const api = {
  get track() {
    return snapshot.track
  },
  get playing() {
    return snapshot.playing
  },
  get currentMs() {
    return snapshot.currentMs
  },
  get durationMs() {
    return snapshot.durationMs
  },
  get shuffle() {
    return snapshot.shuffle
  },
  get repeat() {
    return snapshot.repeat
  },
  get volume() {
    return snapshot.volume
  },
  get gain() {
    return snapshot.gain
  },
  get rate() {
    return snapshot.rate
  },
  get error() {
    return snapshot.error
  },
  get outputMode() {
    return snapshot.outputMode
  },
  get nativeMediaSession() {
    return snapshot.nativeMediaSession
  },
  get notificationsGranted() {
    return snapshot.notificationsGranted
  },
  get androidVersion() {
    return snapshot.androidVersion
  },
  get environment() {
    return {
      isCapacitorNative: isCapacitorNative(),
      isCapacitorAndroid: isCapacitorAndroid(),
      isCapacitorIOS: isCapacitorIOS(),
      isElectron: isElectron(),
      isAppleWebKit: isAppleWebKit(),
      isIOSAny: isIOSAny(),
      isAndroidUa: isAndroidUa(),
      isPWAStandalone: isPWAStandalone(),
      isSamsungDevice: isSamsungDevice(),
      isXiaomiFamily: isXiaomiFamily(),
    }
  },
  setShuffle(v: boolean) {
    shuffleRef.current = !!v
    snapshot.shuffle = !!v
    notify()
  },
  setRepeat(v: RepeatMode) {
    repeatRef.current = v
    snapshot.repeat = v
    notify()
  },
  setVolume(v: number) {
    const val = clamp(v, 0, 1)
    volumeRef.current = val
    snapshot.volume = val
    if (audioRef.current) applyElementVolume(audioRef.current)
    notify()
  },
  setGain(g: number) {
    const val = clamp(g, 0, 3)
    gainRefState.current = val
    snapshot.gain = val
    if (audioRef.current) applyElementVolume(audioRef.current)
    notify()
  },
  get audioFx(): AudioFxState {
    return { ...audioFxRef.current }
  },
  setAudioFx(partial: Partial<AudioFxState>) {
    audioFxRef.current = {
      ...audioFxRef.current,
      ...partial,
      bass: clamp(partial.bass ?? audioFxRef.current.bass, -12, 12),
      mid: clamp(partial.mid ?? audioFxRef.current.mid, -12, 12),
      treble: clamp(partial.treble ?? audioFxRef.current.treble, -12, 12),
      vocalCut: clamp(partial.vocalCut ?? audioFxRef.current.vocalCut, 0, 1),
      pan: clamp(partial.pan ?? audioFxRef.current.pan, -1, 1),
      spatial8d: clamp(partial.spatial8d ?? audioFxRef.current.spatial8d, 0, 3),
    }
    if (audioRef.current) ensureGraph(audioRef.current)
    applyAudioFxNodes()
    notify()
  },
  resetAudioFx() {
    audioFxRef.current = { ...DEFAULT_AUDIO_FX }
    applyAudioFxNodes()
    notify()
  },
  setPlaybackRate(r: number) {
    const val = clamp(r, 0.5, 2)
    rateRef.current = val
    snapshot.rate = val
    const audio = audioRef.current
    if (audio) {
      audio.playbackRate = val
      try {
        audio.preservesPitch = true
      } catch {
        /* */
      }
      void updatePositionState(
        (audio.duration || 0) * 1000,
        (audio.currentTime || 0) * 1000,
        val,
      )
    }
    notify()
  },
  async playTrack(t: TrackItem, queue?: TrackItem[]) {
    if (!t) return
    if (queue) {
      queueRef.current = queue
      const found = queue.findIndex((x) => x.id === t.id)
      indexRef.current = found >= 0 ? found : 0
    } else if (!queueRef.current.some((x) => x.id === t.id)) {
      queueRef.current = [t]
      indexRef.current = 0
    } else {
      indexRef.current = queueRef.current.findIndex((x) => x.id === t.id)
    }
    await prepareAndroidBackgroundPlayback()
    await loadTrack(t)
    const audio = ensureAudio()
    if (!audio.src) return
    ensureGraph(audio)
    setAudioSessionPlayback()
    if (ctxRef.current?.state === 'suspended') {
      try {
        await ctxRef.current.resume()
      } catch {
        /* */
      }
    }
    wantPlayingRef.current = true
    try {
      await armNativeSessionThenPlay(t, audio)
    } catch (e) {
      playingRef.current = false
      snapshot.playing = false
      const msg = e instanceof Error ? e.message : String(e)
      if (/NotAllowedError|interact|user gesture/i.test(msg)) {
        snapshot.error =
          'Pulsa ▶ para iniciar la reproducción (política del navegador).'
      } else {
        snapshot.error = `No se pudo iniciar la reproducción. ${msg}`
      }
      void setMediaSessionPlaybackState('paused')
      notify()
      console.warn('[gco] audio.play() failed:', e)
    }
  },
  async toggle() {
    const audio = ensureAudio()
    ensureGraph(audio)
    setAudioSessionPlayback()
    if (ctxRef.current?.state === 'suspended') {
      try {
        await ctxRef.current.resume()
      } catch {
        /* */
      }
    }
    if (!audio.src) {
      if (queueRef.current.length) {
        await api.playTrack(queueRef.current[indexRef.current] ?? queueRef.current[0])
      }
      return
    }
    if (audio.paused) {
      await prepareAndroidBackgroundPlayback()
      wantPlayingRef.current = true
      try {
        const t = trackRef.current
        if (t) await armNativeSessionThenPlay(t, audio)
        else {
          await audio.play()
          playingRef.current = true
          snapshot.playing = true
          snapshot.error = null
          await setMediaSessionPlaybackState('playing')
          startPositionTick()
          notify()
        }
      } catch (e) {
        playingRef.current = false
        snapshot.playing = false
        void setMediaSessionPlaybackState('paused')
        notify()
        console.warn('[gco] toggle play failed:', e)
      }
    } else {
      wantPlayingRef.current = false
      audio.pause()
      playingRef.current = false
      snapshot.playing = false
      void setMediaSessionPlaybackState('paused')
      stopPositionTick()
      notify()
    }
  },
  seek(ms: number) {
    const audio = ensureAudio()
    const d = audio.duration || 0
    const t = Math.max(0, d ? Math.min(d, ms / 1000) : ms / 1000)
    try {
      audio.currentTime = t
    } catch {
      /* */
    }
    snapshot.currentMs = t * 1000
    void updatePositionState(d * 1000 || snapshot.durationMs, t * 1000, rateRef.current)
    notify()
  },
  async next() {
    const q = queueRef.current
    if (!q.length) return
    if (shuffleRef.current && q.length > 1) {
      let n = Math.floor(Math.random() * q.length)
      if (n === indexRef.current) n = (n + 1) % q.length
      await playIndex(n)
      return
    }
    await playIndex(indexRef.current + 1)
  },
  async prev() {
    const audio = ensureAudio()
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      snapshot.currentMs = 0
      void updatePositionState((audio.duration || 0) * 1000, 0, rateRef.current)
      notify()
      return
    }
    await playIndex(indexRef.current - 1)
  },
  insertNext(t: TrackItem) {
    const q = [...queueRef.current]
    const i = indexRef.current
    const without = q.filter((x) => x.id !== t.id)
    const at = without.findIndex((x) => x.id === queueRef.current[i]?.id)
    const pos = at >= 0 ? at + 1 : without.length
    without.splice(pos, 0, t)
    queueRef.current = without
  },
  setQueue(q: TrackItem[]) {
    queueRef.current = q
    if (!q.length) {
      indexRef.current = 0
      return
    }
    const curId = trackRef.current?.id
    if (curId) {
      const i = q.findIndex((x) => x.id === curId)
      indexRef.current = i >= 0 ? i : clamp(indexRef.current, 0, q.length - 1)
    } else {
      indexRef.current = clamp(indexRef.current, 0, q.length - 1)
    }
  },
  getQueue() {
    return [...queueRef.current]
  },
  getIndex() {
    return indexRef.current
  },
  getFrequencyData(): Uint8Array | null {
    const an = analyserRef.current
    if (!an) return null
    const buf = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(buf)
    if (outputModeRef.current === 'native' && gainRefState.current > 1) {
      const boost = gainRefState.current
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.min(255, Math.round(buf[i] * boost))
      }
    }
    return buf
  },
  resumeAudioContext,
  bootstrapNativePlayback,
  async requestNotificationsPermission() {
    notifPermAsked = false
    const ok = await ensureAndroidNotificationPermission()
    notify()
    return ok
  },
  async requestBatteryUnrestricted() {
    batteryPromptShown = false
    await requestUnrestrictedBatteryIfNeeded()
  },
  refreshMediaSession() {
    mediaSessionReady.current = false
    capMsHandlersReady = false
    void (async () => {
      await ensureMediaSessionHandlers()
      if (trackRef.current) await pushNowPlayingToSystem()
      else await setMediaSessionPlaybackState(playingRef.current ? 'playing' : 'paused')
    })()
  },
}

export function useMediaPlayer(): MediaPlayerApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  void snap.version
  useEffect(() => {
    void bootstrapNativePlayback()
  }, [])
  return api
}

export const __mediaPlayerInternals = {
  notify,
  getSnapshot,
  loadCapMediaSession,
  ensureAndroidNotificationPermission,
  requestUnrestrictedBatteryIfNeeded,
}

if (typeof window !== 'undefined') {
  const boot = () => {
    void bootstrapNativePlayback()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    window.setTimeout(boot, 0)
  }
}