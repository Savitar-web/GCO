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
 * 5. Al pausar NO se destruye la Media Session (la notificación puede permanecer).
 * 6. Android 13+ (API 33+): sin permiso POST_NOTIFICATIONS concedido, la
 *    notificación de reproducción no aparece y el sistema puede matar el
 *    Foreground Service mediaPlayback poco después. Este archivo pide el
 *    permiso en runtime automáticamente antes de reproducir en Capacitor.
 * 7. Android 14-16 (Samsung One UI incluido, p. ej. S26 Ultra): el orden de
 *    llamadas alrededor de audio.play() importa. Se fija: metadata → handlers
 *    → play() → playbackState:'playing'. Reordenar esto puede hacer que la
 *    notificación aparezca "vacía" o que el sistema no reconozca la sesión
 *    como activa en dispositivos con capas de fabricante agresivas.
 * ============================================================================
 */
import { useSyncExternalStore } from 'react'
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

type CapMediaSessionPlugin = {
  setMetadata: (opts: {
    title?: string
    artist?: string
    album?: string
    artwork?: { src: string; sizes?: string; type?: string }[]
  }) => Promise<void>
  setPlaybackState: (opts: {
    playbackState: 'none' | 'paused' | 'playing'
  }) => Promise<void>
  setActionHandler: (
    opts: { action: string },
    handler:
      | ((details?: { seekOffset?: number; seekTime?: number }) => void)
      | null
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
/** true solo dentro de APK / app iOS nativa Capacitor (no en PWA del navegador). */
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
/** true si el navegador corre en un iOS real (Safari, o cualquier navegador iOS, que usan WebKit por obligación de Apple). */
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
/** Detecta la versión mayor de Android desde el user agent (best-effort, solo informativo/telemetría). */
function androidMajorVersion(): number | null {
  if (!isBrowser()) return null
  const m = /Android\s+(\d+)/i.exec(navigator.userAgent || '')
  return m ? parseInt(m[1], 10) : null
}
function isSamsungDevice(): boolean {
  if (!isBrowser()) return false
  return /SM-|Samsung|SAMSUNG/i.test(navigator.userAgent || '')
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
async function tryKeepAwake(playing: boolean) {
  if (!isBrowser() || !isCapacitorNative()) return
  try {
    const mod = await import('@capacitor-community/keep-awake').catch(() => null)
    const KeepAwake = (
      mod as {
        KeepAwake?: {
          keepAwake: () => Promise<void>
          allowSleep: () => Promise<void>
        }
      } | null
    )?.KeepAwake
    if (!KeepAwake) return
    if (playing) await KeepAwake.keepAwake()
    else await KeepAwake.allowSleep()
  } catch {
    /* */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Permisos en runtime — Android 13+ (notificaciones) y batería
 * ═══════════════════════════════════════════════════════════════════════════
 * CRÍTICO: declarar POST_NOTIFICATIONS en el Manifest NO concede el permiso.
 * Sin esto concedido, en Android 13-16 la notificación de reproducción no
 * puede mostrarse y el Foreground Service tipo mediaPlayback puede ser
 * detenido por el sistema poco después de iniciar. Se pide una sola vez
 * por sesión de la app (no en cada play) para no ser intrusivos.
 * ═══════════════════════════════════════════════════════════════════════════ */
let notifPermAsked = false
let notifPermGranted: boolean | null = null

async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (!isBrowser() || !isCapacitorAndroid()) return true
  if (notifPermGranted === true) return true
  if (notifPermAsked && notifPermGranted === false) return false
  notifPermAsked = true
  try {
    const mod = await import('@capacitor/local-notifications').catch(() => null)
    const LN = (mod as { LocalNotifications?: LocalNotificationsPlugin } | null)
      ?.LocalNotifications
    if (LN) {
      const cur = await LN.checkPermissions().catch(() => ({ display: 'prompt' }))
      if (cur.display === 'granted') {
        notifPermGranted = true
        return true
      }
      const req = await LN.requestPermissions().catch(() => ({ display: 'denied' }))
      notifPermGranted = req.display === 'granted'
      return notifPermGranted
    }
  } catch (e) {
    console.warn('[gco] ensureAndroidNotificationPermission:', e)
  }
  // Sin el plugin instalado no podemos pedir el permiso nativo: no bloqueamos
  // la reproducción, solo dejamos constancia de que puede faltar notificación.
  notifPermGranted = null
  return true
}

let batteryPromptShown = false

/**
 * Abre (si hay un plugin disponible) el diálogo nativo para excluir la app
 * de la optimización de batería del fabricante. En Samsung One UI (S26
 * Ultra incluido), Xiaomi/MIUI, Huawei y OnePlus, esto es a menudo la causa
 * real de que el audio se corte en segundo plano aunque el Foreground
 * Service esté correctamente declarado y en ejecución.
 *
 * Es best-effort y silencioso: si no hay plugin, no interrumpe el flujo de
 * reproducción; el usuario puede excluir la app manualmente desde
 * Ajustes → Apps → GCO → Batería → Sin restricciones.
 */
async function requestUnrestrictedBatteryIfNeeded() {
  if (!isBrowser() || !isCapacitorAndroid() || batteryPromptShown) return
  batteryPromptShown = true
  try {
const mod = await import(
  '@capawesome-team/capacitor-android-battery-optimization'
).catch(() => null)
    const plugin = (
      mod as {
        BatteryOptimization?: {
          isBatteryOptimizationEnabled?: () => Promise<{ enabled: boolean }>
          requestDisableBatteryOptimization?: () => Promise<void>
        }
      } | null
    )?.BatteryOptimization
    if (!plugin) return
    const status = await plugin
      .isBatteryOptimizationEnabled?.()
      .catch(() => ({ enabled: false }))
    if (status?.enabled && plugin.requestDisableBatteryOptimization) {
      await plugin.requestDisableBatteryOptimization().catch(() => {})
    }
  } catch {
    /* Plugin no instalado: no-op silencioso, ver nota de Ajustes manuales. */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Capgo Media Session — SOLO nativo
 * ═══════════════════════════════════════════════════════════════════════════ */
let capMs: CapMediaSessionPlugin | null = null
let capMsTried = false
let capMsHandlersReady = false

/**
 * Carga Capgo únicamente si estamos en Capacitor nativo.
 * En web/PWA devuelve null siempre (evita "MediaSession.then() is not implemented on web").
 */
async function loadCapMediaSession(): Promise<CapMediaSessionPlugin | null> {
  if (capMs) return capMs
  if (capMsTried) return null
  capMsTried = true
  // CRÍTICO: no tocar el plugin en web
  if (!isBrowser() || !isCapacitorNative()) return null
  try {
    const cap = getCapacitor()
    if (typeof cap?.isPluginAvailable === 'function') {
      try {
        if (!cap.isPluginAvailable('MediaSession')) return null
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
      return capMs
    }
  } catch (e) {
    console.warn('[gco] Capgo MediaSession no disponible (ok en web):', e)
  }
  return null
}
function hasWebMediaSession(): boolean {
  return isBrowser() && typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Media Session unificada
 * ═══════════════════════════════════════════════════════════════════════════ */
async function updateMediaSessionMetadata(t: TrackItem | null) {
  if (!isBrowser()) return
  const artwork: { src: string; sizes: string; type: string }[] = []
  if (t?.coverDataUrl) {
    for (const s of ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']) {
      artwork.push({ src: t.coverDataUrl, sizes: s, type: 'image/png' })
    }
  }
  // Capgo solo nativo
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
  // Web / PWA / Electron
  if (!hasWebMediaSession()) return
  try {
    if (!t) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Sin título',
      artist: t.artist || 'Desconocido',
      album: t.album || '',
      artwork,
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
  playbackRate = 1
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
const compRef: { current: DynamicsCompressorNode | null } = { current: null }
const graphReady = { current: false }
const outputModeRef: { current: OutputMode } = { current: 'none' }
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
    // Nativo: el hardware satura en 1
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
    // iOS / Safari: nunca createMediaElementSource (rompe background)
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
    // Desktop no-Apple: Web Audio con boost real
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
      mediaSourceRef.current.connect(gainNodeRef.current)
      gainNodeRef.current.connect(compRef.current)
      compRef.current.connect(analyserRef.current!)
      analyserRef.current!.connect(ctx.destination)
    }
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
      void setMediaSessionPlaybackState('playing')
      notify()
    } catch {
      /* autoplay */
    }
  }
  api.refreshMediaSession()
}
function startPositionTick() {
  stopPositionTick()
  if (!isBrowser()) return
  positionTickTimer = window.setInterval(() => {
    const audio = audioRef.current
    if (!audio || !playingRef.current) return
    const dur = (audio.duration || 0) * 1000
    const pos = (audio.currentTime || 0) * 1000
    void updatePositionState(dur, pos, rateRef.current)
  }, 1000)
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
  window.addEventListener('pagehide', () => {
    stopPositionTick()
  })
  // iOS Safari / PWA standalone: al desbloquear pantalla el AudioContext
  // puede quedar suspendido sin disparar visibilitychange de forma fiable.
  // Se refuerza con un segundo intento retrasado.
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
        const App = (mod as {
          App?: {
            addListener: (
              e: string,
              cb: (data: { isActive?: boolean }) => void
            ) => Promise<{ remove: () => void }>
          }
        }).App
        if (!App?.addListener) return
        void App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            void resumeAudioContext()
            // Refuerzo Android 14-16 / One UI: al volver a primer plano,
            // reafirmar metadata + estado evita que la notificación quede
            // "congelada" tras que el sistema recorte el proceso en segundo
            // plano y lo reactive.
            if (wantPlayingRef.current && trackRef.current) {
              void updateMediaSessionMetadata(trackRef.current)
              void setMediaSessionPlaybackState(
                playingRef.current ? 'playing' : 'paused'
              )
            }
          }
        })
        void App.addListener('resume', () => {
          void resumeAudioContext()
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
  handler: (details?: { seekOffset?: number; seekTime?: number }) => void
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
  handler: (details?: { seekOffset?: number; seekTime?: number }) => void
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
      void tryKeepAwake(false)
      notify()
    }
  }
  const onStop = () => onPause()
  wireWebAction('play', onPlay)
  wireWebAction('pause', onPause)
  wireWebAction('stop', onStop)
  wireWebAction('previoustrack', () => {
    void api.prev()
  })
  wireWebAction('nexttrack', () => {
    void api.next()
  })
  wireWebAction('seekbackward', (d) => {
    const audio = audioRef.current
    if (!audio) return
    const offset = (d?.seekOffset ?? 10) * 1000
    api.seek(Math.max(0, audio.currentTime * 1000 - offset))
  })
  wireWebAction('seekforward', (d) => {
    const audio = audioRef.current
    if (!audio) return
    const offset = (d?.seekOffset ?? 10) * 1000
    const dur = (audio.duration || 0) * 1000
    api.seek(Math.min(dur || Number.MAX_SAFE_INTEGER, audio.currentTime * 1000 + offset))
  })
  wireWebAction('seekto', (d) => {
    if (d?.seekTime == null) return
    api.seek(d.seekTime * 1000)
  })
  if (capMs && isCapacitorNative()) {
    wireCapAction('play', onPlay)
    wireCapAction('pause', onPause)
    wireCapAction('stop', onStop)
    wireCapAction('previoustrack', () => {
      void api.prev()
    })
    wireCapAction('nexttrack', () => {
      void api.next()
    })
    wireCapAction('seekbackward', (d) => {
      const audio = audioRef.current
      if (!audio) return
      api.seek(Math.max(0, audio.currentTime * 1000 - (d?.seekOffset ?? 10) * 1000))
    })
    wireCapAction('seekforward', (d) => {
      const audio = audioRef.current
      if (!audio) return
      const dur = (audio.duration || 0) * 1000
      api.seek(
        Math.min(dur || Number.MAX_SAFE_INTEGER, audio.currentTime * 1000 + (d?.seekOffset ?? 10) * 1000)
      )
    })
    wireCapAction('seekto', (d) => {
      if (d?.seekTime == null) return
      api.seek(d.seekTime * 1000)
    })
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
      void tryKeepAwake(true)
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
      stopPositionTick()
      void tryKeepAwake(false)
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
  // Reset antes de asignar src
  try {
    audio.pause()
  } catch {
    /* */
  }
  audio.src = url
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
  // Media Session en paralelo (no bloquea el play si falla)
  void updateMediaSessionMetadata(t)
  void ensureMediaSessionHandlers()
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
      // Timeout de seguridad
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
    void tryKeepAwake(false)
    notify()
  }
}

/**
 * Preparación previa a reproducir en Android nativo: pide permiso de
 * notificaciones (una vez por sesión) y, si procede, sugiere excluir la
 * app de la optimización de batería. No bloquea el play si el usuario
 * aún no ha respondido: el audio arranca igual, solo puede faltar la
 * notificación hasta que el permiso se conceda.
 */
async function prepareAndroidBackgroundPlayback() {
  if (!isCapacitorAndroid()) return
  try {
    await ensureAndroidNotificationPermission()
  } catch {
    /* */
  }
  // Se dispara sin esperar: no debe retrasar el arranque del audio.
  void requestUnrestrictedBatteryIfNeeded()
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
        val
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
    // Android 13-16: preparar permisos ANTES de tocar el <audio>, para que
    // la notificación pueda aparecer en el primer play y no solo desde el
    // segundo intento tras conceder el permiso.
    await prepareAndroidBackgroundPlayback()
    await loadTrack(t)
    const audio = ensureAudio()
    if (!audio.src) {
      // loadTrack falló
      return
    }
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
    // Orden crítico en Android 14-16 / fabricantes con capas agresivas
    // (Samsung One UI incluido): metadata y handlers se preparan ANTES de
    // play(), y el playbackState:'playing' se confirma justo después.
    // Invertir este orden puede dejar la notificación sin título/portada
    // en el primer segundo de reproducción en algunos dispositivos.
    void updateMediaSessionMetadata(t)
    void ensureMediaSessionHandlers()
    try {
      await audio.play()
      playingRef.current = true
      snapshot.playing = true
      snapshot.error = null
      void setMediaSessionPlaybackState('playing')
      startPositionTick()
      void tryKeepAwake(true)
      notify()
      requestFloatingBar()
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
        await api.playTrack(
          queueRef.current[indexRef.current] ?? queueRef.current[0]
        )
      }
      return
    }
    if (audio.paused) {
      await prepareAndroidBackgroundPlayback()
      wantPlayingRef.current = true
      try {
        await audio.play()
        playingRef.current = true
        snapshot.playing = true
        snapshot.error = null
        void setMediaSessionPlaybackState('playing')
        if (trackRef.current) void updateMediaSessionMetadata(trackRef.current)
        startPositionTick()
        void tryKeepAwake(true)
        notify()
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
      void tryKeepAwake(false)
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
  /** Pide (o vuelve a pedir) el permiso de notificaciones de Android en runtime. */
  async requestNotificationsPermission() {
    const ok = await ensureAndroidNotificationPermission()
    notify()
    return ok
  },
  /** Sugiere al usuario excluir la app de la optimización de batería del fabricante. */
  async requestBatteryUnrestricted() {
    batteryPromptShown = false
    await requestUnrestrictedBatteryIfNeeded()
  },
  refreshMediaSession() {
    mediaSessionReady.current = false
    capMsHandlersReady = false
    void (async () => {
      await ensureMediaSessionHandlers()
      if (trackRef.current) await updateMediaSessionMetadata(trackRef.current)
      await setMediaSessionPlaybackState(playingRef.current ? 'playing' : 'paused')
      const audio = audioRef.current
      if (audio) {
        void updatePositionState(
          (audio.duration || 0) * 1000 || snapshot.durationMs,
          (audio.currentTime || 0) * 1000,
          rateRef.current
        )
      }
    })()
  },
}

export function useMediaPlayer(): MediaPlayerApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  void snap.version
  return api
}

export const __mediaPlayerInternals = {
  notify,
  getSnapshot,
  loadCapMediaSession,
  ensureAndroidNotificationPermission,
  requestUnrestrictedBatteryIfNeeded,
}