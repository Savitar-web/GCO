/**
 * ============================================================================
 * useMediaPlayer — motor de audio nativo-first para PWA / Capacitor / Electron
 * ============================================================================
 *
 * Objetivo: comportarse como una app de música real.
 *
 *  • El sonido sale SIEMPRE por un <audio> HTML5 nativo (nunca se “roba” la
 *    salida con createMediaElementSource en iOS/Android/WebView: eso rompe el
 *    background y la notificación del sistema).
 *  • Media Session API = controles de la notificación / pantalla de bloqueo /
 *    auriculares / car play (play, pause, next, prev, seek±, seekto).
 *  • Al pausar, la sesión de medios NO se destruye: el icono de notificación
 *    permanece y se puede reanudar desde el sistema.
 *  • Reanudación agresiva al volver de segundo plano, freeze, pageshow,
 *    visibilitychange, focus y eventos Capacitor (`resume` / `appStateChange`).
 *  • Preferencia absoluta por audio nativo; Web Audio solo se usa (si existe)
 *    como analizador en paralelo vía captureStream, sin conectar a destination.
 *  • Compatible con: Chrome/Edge/Firefox, Safari iOS 17+, Android WebView,
 *    Capacitor (Android/iOS), Electron, PWA instalada.
 *
 * SINGLETON DE MÓDULO
 * ───────────────────
 * Una sola instancia de <audio> + estado vive fuera del árbol de React.
 * useMediaPlayer() en MusicaHome, Nutrición, juegos o CategoryMenu comparte
 * el mismo motor. Desmontar una vista NO pausa ni destruye el audio.
 * ============================================================================
 */

import { useSyncExternalStore } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

/* ═══════════════════════════════════════════════════════════════════════════
 * Tipos públicos
 * ═══════════════════════════════════════════════════════════════════════════ */

export type RepeatMode = 'off' | 'one' | 'all'

/**
 * Cómo se está sacando el audio / el espectro.
 *  - native        → <audio> + captureStream (mejor: background + espectro)
 *  - native-nospec → <audio> puro sin espectro (iOS / Safari / WebViews antiguos)
 *  - webaudio      → SOLO como último recurso en desktop no-Apple; en móvil
 *                    NUNCA se elige este modo porque rompe el background.
 *  - none          → aún no inicializado
 */
export type OutputMode = 'native' | 'native-nospec' | 'webaudio' | 'none'

export type MediaPlayerApi = typeof api

/* ═══════════════════════════════════════════════════════════════════════════
 * Utilidades de entorno
 * ═══════════════════════════════════════════════════════════════════════════ */

type CaptureAudioElement = HTMLAudioElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

type AudioSessionLike = {
  type?: string
}

/** Capacitor App plugin (opcional; no es dependencia dura). */
type CapacitorAppPlugin = {
  addListener: (
    event: string,
    cb: (data: { isActive?: boolean }) => void
  ) => Promise<{ remove: () => void }> | { remove: () => void }
}

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { App?: CapacitorAppPlugin }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/** iPhone / iPad / iPod / Safari de escritorio (sin Chromium). */
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

/** Android WebView / Capacitor Android / Chrome Android. */
function isAndroid(): boolean {
  if (!isBrowser()) return false
  return /Android/i.test(navigator.userAgent || '')
}

/** Ejecutándose dentro de Capacitor (APK/IPA nativos). */
function getCapacitor(): CapacitorBridge | null {
  if (!isBrowser()) return null
  const w = window as Window & { Capacitor?: CapacitorBridge }
  return w.Capacitor ?? null
}

function isNativeShell(): boolean {
  const cap = getCapacitor()
  try {
    if (cap?.isNativePlatform?.()) return true
  } catch {
    /* */
  }
  // Electron
  if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '')) {
    return true
  }
  return false
}

/**
 * Categoría de sesión de audio iOS 17+ / algunos WebViews.
 * 'playback' = medios largos: no se silencia con el switch de silencio y
 * sobrevive mejor cuando la pantalla se bloquea.
 */
function setAudioSessionPlayback() {
  try {
    const nav = navigator as Navigator & { audioSession?: AudioSessionLike }
    if (nav.audioSession && typeof nav.audioSession === 'object') {
      nav.audioSession.type = 'playback'
    }
  } catch {
    /* API no disponible o de solo lectura */
  }
}

/**
 * Intenta mantener la app “viva” en Capacitor mientras hay reproducción.
 * No es obligatorio: si el plugin no existe, se ignora sin romper nada.
 * En Android el SO puede igual matar el proceso sin un foreground service;
 * Media Session + <audio> nativo es la base que funciona en la mayoría de
 * WebViews modernos sin plugins extra.
 */
async function tryKeepAwakeWhilePlaying(playing: boolean) {
  if (!isBrowser()) return
  try {
    const w = window as Window & {
      Capacitor?: {
        Plugins?: {
          KeepAwake?: { keepAwake: () => Promise<void>; allowSleep: () => Promise<void> }
          App?: unknown
        }
      }
    }
    const keep = w.Capacitor?.Plugins?.KeepAwake
    if (!keep) return
    if (playing) await keep.keepAwake()
    else await keep.allowSleep()
  } catch {
    /* plugin ausente o rechazado */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Media Session — notificación del sistema / lock-screen / auriculares
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Actualiza metadatos visibles en la notificación del SO.
 * Si no hay portada, se omite artwork (algunos SO muestran un placeholder).
 */
function updateMediaSessionMetadata(t: TrackItem | null) {
  if (!isBrowser() || !('mediaSession' in navigator)) return
  try {
    if (!t) {
      navigator.mediaSession.metadata = null
      return
    }
    const artwork: MediaImage[] = []
    if (t.coverDataUrl) {
      // Varios tamaños ayudan a Android / iOS a elegir la resolución correcta.
      artwork.push(
        { src: t.coverDataUrl, sizes: '96x96', type: 'image/png' },
        { src: t.coverDataUrl, sizes: '128x128', type: 'image/png' },
        { src: t.coverDataUrl, sizes: '192x192', type: 'image/png' },
        { src: t.coverDataUrl, sizes: '256x256', type: 'image/png' },
        { src: t.coverDataUrl, sizes: '384x384', type: 'image/png' },
        { src: t.coverDataUrl, sizes: '512x512', type: 'image/png' }
      )
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Sin título',
      artist: t.artist || 'Desconocido',
      album: t.album || '',
      artwork,
    })
  } catch {
    /* MediaMetadata no soportado o artwork inválido */
  }
}

/**
 * Estado de reproducción expuesto al SO.
 * IMPORTANTE: al pausar usamos 'paused', NUNCA limpiamos metadata ni handlers.
 * Así el icono de notificación permanece y el usuario puede reanudar / seek.
 */
function setMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
  if (!isBrowser() || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* */
  }
}

/**
 * Posición para la barra de progreso de la notificación del sistema.
 * Sin esto, en Android/iOS a veces no aparecen los botones de seek o la
 * barra no es interactiva.
 */
function updatePositionState(
  durationMs: number,
  positionMs: number,
  playbackRate = 1
) {
  if (!isBrowser() || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession as MediaSession & {
    setPositionState?: (state: {
      duration: number
      playbackRate: number
      position: number
    }) => void
  }
  if (!ms.setPositionState) return
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return
  try {
    const duration = durationMs / 1000
    const position = clamp(positionMs, 0, durationMs) / 1000
    ms.setPositionState({
      duration,
      playbackRate: playbackRate > 0 ? playbackRate : 1,
      position: Math.min(Math.max(0, position), duration),
    })
  } catch {
    /* Algunos WebViews lanzan si position > duration por redondeo */
  }
}

/** Desregistra handlers sin tocar metadata (la notificación puede seguir visible). */
function clearMediaSessionHandlers() {
  if (!isBrowser() || !('mediaSession' in navigator)) return
  const actions = [
    'play',
    'pause',
    'previoustrack',
    'nexttrack',
    'stop',
    'seekbackward',
    'seekforward',
    'seekto',
  ] as const
  for (const action of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, null)
    } catch {
      /* acción no soportada en este motor */
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Snapshot reactivo (useSyncExternalStore)
 * ═══════════════════════════════════════════════════════════════════════════ */

type Snapshot = {
  track: TrackItem | null
  playing: boolean
  currentMs: number
  durationMs: number
  shuffle: boolean
  repeat: RepeatMode
  volume: number
  /** 0–3. En salida nativa el hardware satura en 1; el exceso solo refuerza espectro. */
  gain: number
  rate: number
  error: string | null
  outputMode: OutputMode
  /** Incremento monotónico para forzar re-render en suscriptores. */
  version: number
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
}

function notify() {
  snapshot = { ...snapshot, version: snapshot.version + 1 }
  listeners.forEach((l) => {
    try {
      l()
    } catch {
      /* un suscriptor roto no debe tumbar al resto */
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
 * Referencias del motor (fuera de React)
 * ═══════════════════════════════════════════════════════════════════════════ */

const audioRef: { current: HTMLAudioElement | null } = { current: null }
const urlRef: { current: string | null } = { current: null }
const queueRef: { current: TrackItem[] } = { current: [] }
const indexRef: { current: number } = { current: 0 }
/** Generación de carga: evita que un load antiguo pise uno nuevo (skip rápido). */
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
const appleWebKit = { current: isAppleWebKit() }
const androidEnv = { current: isAndroid() }
const nativeShell = { current: isNativeShell() }

const playingRef = { current: false }
const volumeRef = { current: 1 }
const gainRefState = { current: 1 }
const rateRef = { current: 1 }
const trackRef: { current: TrackItem | null } = { current: null }
const shuffleRef = { current: false }
const repeatRef: { current: RepeatMode } = { current: 'off' }

/** El usuario quiere seguir reproduciendo; útil para reanudar tras interrupciones del SO. */
const wantPlayingRef = { current: false }

let pageLifecycleBound = false
let capacitorListenersBound = false
let floatingBarRequested = false
let positionTickTimer: number | null = null

/* ═══════════════════════════════════════════════════════════════════════════
 * URL / volumen del elemento nativo
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

/**
 * Aplica volumen al <audio> nativo.
 * En modo nativo el hardware no amplifica por encima de 1.0; gain > 1 solo
 * refuerza getFrequencyData para el visualizador.
 */
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
 * Grafo de análisis (espectro) — NUNCA sustituye la salida nativa en móvil
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

/**
 * Configura el analizador SIN interrumpir el path nativo de audio.
 *
 * Prioridad:
 *  1. Apple / iOS / Safari → solo nativo, sin espectro (background fiable).
 *  2. Android / Capacitor / móvil → captureStream si existe; si no, nospec.
 *     NUNCA createMediaElementSource en estos entornos.
 *  3. Desktop Chromium/Firefox → captureStream preferido; fallback webaudio
 *     solo si captureStream falla (boost real + background aceptable en desktop).
 */
function ensureGraph(audio: HTMLAudioElement) {
  try {
    if (graphReady.current) {
      applyElementVolume(audio)
      return
    }

    // ── Móvil / WebKit: priorizar background sobre espectro ──
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

    // Preferido en todos los entornos no-Apple: captura sin robar salida.
    if (captureFn) {
      try {
        const stream = captureFn()
        if (stream && stream.getAudioTracks().length > 0) {
          streamSourceRef.current = ctx.createMediaStreamSource(stream)
          streamSourceRef.current.connect(analyserRef.current)
          // NO conectar a destination: el <audio> sigue yendo a altavoces/auriculares.
          outputModeRef.current = 'native'
          snapshot.outputMode = 'native'
          graphReady.current = true
          applyElementVolume(audio)
          notify()
          return
        }
      } catch {
        /* captura bloqueada o elemento sin datos aún */
      }
    }

    // En móvil / shell nativo: si no hay captureStream, nos quedamos sin espectro.
    // El audio nativo debe seguir funcionando sí o sí.
    if (forceNativeOnly) {
      outputModeRef.current = 'native-nospec'
      snapshot.outputMode = 'native-nospec'
      graphReady.current = true
      applyElementVolume(audio)
      notify()
      return
    }

    // Desktop no-Apple: fallback Web Audio completo (boost real).
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
 * Reanudación / ciclo de vida (background real)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reanuda AudioContext + <audio> tras suspensión del SO / cambio de app.
 * Si el usuario tenía la intención de reproducir (wantPlayingRef), intentamos
 * play() de nuevo: clave en iOS y en WebViews que pausan al bloquear pantalla.
 */
async function resumeAudioContext() {
  setAudioSessionPlayback()
  const ctx = ctxRef.current
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* requiere gesto de usuario en algunos motores */
    }
  }
  const audio = audioRef.current
  if (audio && audio.src && audio.paused && wantPlayingRef.current) {
    try {
      await audio.play()
      playingRef.current = true
      snapshot.playing = true
      setMediaSessionPlaybackState('playing')
      notify()
    } catch {
      /* autoplay policy: el usuario deberá tocar ▶ */
    }
  }
}

/**
 * Tick periódico de posición hacia Media Session mientras suena.
 * Algunos Android actualizan mal la barra de la notificación solo con
 * timeupdate; este refuerzo mantiene seekto usable.
 */
function startPositionTick() {
  stopPositionTick()
  if (!isBrowser()) return
  positionTickTimer = window.setInterval(() => {
    const audio = audioRef.current
    if (!audio || !playingRef.current) return
    const dur = (audio.duration || 0) * 1000
    const pos = (audio.currentTime || 0) * 1000
    updatePositionState(dur, pos, rateRef.current)
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
    if (document.visibilityState === 'visible') {
      void resumeAudioContext()
    }
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('pageshow', (ev) => {
    // pageshow con persisted=true = back-forward cache; hay que reanudar.
    void resumeAudioContext()
    if (ev.persisted) void resumeAudioContext()
  })

  // Algunos WebViews Android disparan 'resume' al descongelar.
  window.addEventListener('resume', () => void resumeAudioContext())

  // freeze/resume del Page Lifecycle API (Chrome).
  document.addEventListener('freeze', () => {
    /* no pausamos nosotros: el SO puede hacerlo; al resume reanudamos */
  })
  document.addEventListener('resume', () => void resumeAudioContext())

  /**
   * pagehide: cierre real de documento / navegación fuera del origen.
   * NO se llama al cambiar de vista React dentro de la SPA.
   * Aquí sí podemos liberar el blob URL; el elemento puede quedarse.
   */
  window.addEventListener('pagehide', () => {
    stopPositionTick()
    // No forzamos pause aquí en Capacitor: el SO gestiona el background.
    // Solo limpiamos object URLs huérfanas si la página se descarta.
    if ((window as Window & { __gcoPageUnloading?: boolean }).__gcoPageUnloading) {
      cleanupUrl()
    }
  })

  window.addEventListener('beforeunload', () => {
    ;(window as Window & { __gcoPageUnloading?: boolean }).__gcoPageUnloading = true
  })
}

/**
 * Listeners nativos de Capacitor (app en segundo plano / primer plano).
 * Sin el plugin @capacitor/app simplemente no se registran.
 */
function bindCapacitorListeners() {
  if (capacitorListenersBound || !isBrowser()) return
  capacitorListenersBound = true
  try {
    const cap = getCapacitor()
    const app = cap?.Plugins?.App
    if (!app?.addListener) return
    void Promise.resolve(
      app.addListener('appStateChange', (state) => {
        if (state.isActive) void resumeAudioContext()
      })
    ).catch(() => {})
    void Promise.resolve(
      app.addListener('resume', () => {
        void resumeAudioContext()
      })
    ).catch(() => {})
  } catch {
    /* */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Media Session handlers (notificación del dispositivo)
 * ═══════════════════════════════════════════════════════════════════════════ */

function ensureMediaSessionHandlers() {
  if (mediaSessionReady.current) return
  if (!isBrowser() || !('mediaSession' in navigator)) return

  try {
    // Play / Pause: no destruir sesión; solo toggle del <audio> nativo.
    navigator.mediaSession.setActionHandler('play', () => {
      wantPlayingRef.current = true
      void api.toggle()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      // Pausar pero mantener metadata + handlers → la notificación sigue.
      wantPlayingRef.current = false
      const audio = audioRef.current
      if (audio && !audio.paused) {
        audio.pause()
        playingRef.current = false
        snapshot.playing = false
        setMediaSessionPlaybackState('paused')
        stopPositionTick()
        void tryKeepAwakeWhilePlaying(false)
        notify()
      }
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void api.prev()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void api.next()
    })
    // 'stop' en muchos SO significa pausar, no destruir la cola.
    navigator.mediaSession.setActionHandler('stop', () => {
      wantPlayingRef.current = false
      const audio = audioRef.current
      if (audio && !audio.paused) {
        audio.pause()
        playingRef.current = false
        snapshot.playing = false
        setMediaSessionPlaybackState('paused')
        stopPositionTick()
        void tryKeepAwakeWhilePlaying(false)
        notify()
      }
    })

    // Seek desde la notificación / auriculares con botones ±.
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const audio = audioRef.current
      if (!audio) return
      const offset = (details.seekOffset ?? 10) * 1000
      api.seek(Math.max(0, audio.currentTime * 1000 - offset))
    })
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const audio = audioRef.current
      if (!audio) return
      const offset = (details.seekOffset ?? 10) * 1000
      const dur = (audio.duration || 0) * 1000
      api.seek(Math.min(dur || Number.MAX_SAFE_INTEGER, audio.currentTime * 1000 + offset))
    })

    // Barra de progreso arrastrable en la notificación (Android 11+, iOS reciente).
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime == null) return
      api.seek(details.seekTime * 1000)
    })

    mediaSessionReady.current = true
  } catch {
    /* algunas acciones no existen en motores antiguos; se ignoran */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Burbuja flotante global (PlayerBar)
 *
 * Evitamos import() dinámico como único camino: en bundles con ciclo
 * MusicaHome → PlayerBar → useMediaPlayer el export a veces llega undefined
 * y la burbuja nunca monta. En su lugar:
 *  1. PlayerBar se registra al cargar el módulo (registerFloatingBarMounter).
 *  2. Evento window "gco:need-player-bar" como respaldo.
 *  3. import() dinámico solo como último intento.
 * ═══════════════════════════════════════════════════════════════════════════ */

type FloatingMounter = () => void
let floatingMounter: FloatingMounter | null = null
let floatingMountAttempts = 0

/**
 * Llamado por PlayerBar.tsx al evaluarse el módulo.
 * Si ya hay una pista cargada, monta la burbuja de inmediato.
 */
export function registerFloatingBarMounter(fn: FloatingMounter) {
  floatingMounter = fn
  if (!isBrowser()) return
  if (snapshot.track) {
    try {
      fn()
    } catch (e) {
      console.warn('[gco] floating mounter (immediate) failed:', e)
    }
  }
}

/**
 * Pide mostrar la pastilla flotante. Idempotente y con varios respaldos.
 * Se invoca en loadTrack / playTrack y puede repetirse sin daño.
 */
function requestFloatingBar() {
  if (!isBrowser()) return

  // 1) Registro directo (camino preferido, sin async).
  if (floatingMounter) {
    try {
      floatingMounter()
      return
    } catch (e) {
      console.warn('[gco] floating mounter failed:', e)
    }
  }

  // 2) Evento global: PlayerBar escucha al cargar.
  try {
    window.dispatchEvent(new CustomEvent('gco:need-player-bar'))
  } catch {
    /* */
  }

  // 3) Último recurso: import dinámico (puede fallar por ciclos de bundle).
  if (floatingBarRequested && floatingMountAttempts > 3) return
  floatingBarRequested = true
  floatingMountAttempts += 1
  void import('@/features/musica/PlayerBar')
    .then((mod: { ensureGlobalPlayerBar?: () => void }) => {
      if (typeof mod.ensureGlobalPlayerBar === 'function') {
        mod.ensureGlobalPlayerBar()
      } else {
        floatingBarRequested = false
      }
    })
    .catch((err: unknown) => {
      floatingBarRequested = false
      console.warn('[gco] dynamic import PlayerBar failed:', err)
    })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Elemento <audio> nativo — único path de salida real
 * ═══════════════════════════════════════════════════════════════════════════ */

function ensureAudio(): HTMLAudioElement {
  bindPageLifecycle()
  bindCapacitorListeners()

  if (!audioRef.current) {
    const a = new Audio()
    a.preload = 'auto'
    a.crossOrigin = 'anonymous'
    // iOS: evita pantalla completa forzada del vídeo/audio.
    a.setAttribute('playsinline', 'true')
    a.setAttribute('webkit-playsinline', 'true')
    // Ayuda a que algunos WebViews no traten el media como “solo en primer plano”.
    try {
      ;(a as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false
    } catch {
      /* */
    }
    try {
      a.preservesPitch = true
    } catch {
      /* Safari antiguo */
    }
    a.volume = clamp(volumeRef.current, 0, 1)

    a.ontimeupdate = () => {
      const ms = (a.currentTime || 0) * 1000
      snapshot.currentMs = ms
      notify()
      updatePositionState(
        a.duration ? a.duration * 1000 : snapshot.durationMs,
        ms,
        rateRef.current
      )
    }

    a.onloadedmetadata = () => {
      const dur = (a.duration || 0) * 1000
      if (dur > 0) {
        snapshot.durationMs = dur
        notify()
        updatePositionState(dur, snapshot.currentMs, rateRef.current)
      }
    }

    a.ondurationchange = () => {
      if (a.duration && Number.isFinite(a.duration)) {
        snapshot.durationMs = a.duration * 1000
        notify()
        updatePositionState(snapshot.durationMs, snapshot.currentMs, rateRef.current)
      }
    }

    a.onplay = () => {
      playingRef.current = true
      wantPlayingRef.current = true
      snapshot.playing = true
      setMediaSessionPlaybackState('playing')
      setAudioSessionPlayback()
      startPositionTick()
      void tryKeepAwakeWhilePlaying(true)
      notify()
      requestFloatingBar()
    }

    a.onplaying = () => {
      playingRef.current = true
      wantPlayingRef.current = true
      snapshot.playing = true
      setMediaSessionPlaybackState('playing')
      void resumeAudioContext()
      startPositionTick()
      notify()
    }

    a.onpause = () => {
      // Refleja el estado real del elemento.
      // Si el SO pausó brevemente, wantPlayingRef sigue true y resume intentará play.
      playingRef.current = false
      snapshot.playing = false
      setMediaSessionPlaybackState('paused')
      // NO limpiar metadata ni handlers → la notificación permanece.
      stopPositionTick()
      void tryKeepAwakeWhilePlaying(false)
      notify()
    }

    a.onended = () => {
      void onEnded()
    }

    a.onerror = () => {
      snapshot.error = 'No se pudo decodificar el archivo de audio.'
      playingRef.current = false
      wantPlayingRef.current = false
      snapshot.playing = false
      setMediaSessionPlaybackState('paused')
      stopPositionTick()
      notify()
      // Auto-avanzar si hay cola (evita quedarse bloqueado en un archivo malo).
      window.setTimeout(() => {
        void api.next()
      }, 400)
    }

    a.onstalled = () => {
      /* blob local: raro; no paramos la UI */
    }
    a.onwaiting = () => {
      /* buffering */
    }
    a.onsuspend = () => {
      /* */
    }

    // Interrupciones de audio del sistema (llamada, otra app con focus).
    a.addEventListener('pause', () => {
      // ya cubierto en onpause; se deja por si algún WebView no dispara onpause
    })

    audioRef.current = a
    ensureGraph(a)
    ensureMediaSessionHandlers()
    setAudioSessionPlayback()
  }
  return audioRef.current
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Carga de pistas (blobs IndexedDB → object URL)
 * ═══════════════════════════════════════════════════════════════════════════ */

async function resolveBlob(blobKey: string): Promise<Blob | null> {
  try {
    const raw = await getTrackBlob(blobKey)
    if (!raw) return null
    if (raw instanceof Blob) return raw
    if (typeof raw === 'object' && raw !== null && 'blob' in raw) {
      return (raw as { blob: Blob }).blob
    }
    return null
  } catch {
    return null
  }
}

async function loadTrack(t: TrackItem) {
  const gen = ++loadGenRef.current
  snapshot.error = null
  notify()

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
  updateMediaSessionMetadata(t)
  // Sesión en 'paused' hasta que play() confirme; la notificación ya muestra la pista.
  setMediaSessionPlaybackState(playingRef.current ? 'playing' : 'paused')
  updatePositionState(snapshot.durationMs, 0, rateRef.current)
  notify()
  requestFloatingBar()

  await new Promise<void>((resolve) => {
    if (gen !== loadGenRef.current) {
      resolve()
      return
    }
    const onMeta = () => {
      if (gen === loadGenRef.current) {
        const dur = (audio.duration || 0) * 1000
        if (dur > 0) snapshot.durationMs = dur
        updatePositionState(snapshot.durationMs, snapshot.currentMs, rateRef.current)
        notify()
      }
      audio.removeEventListener('loadedmetadata', onMeta)
      resolve()
    }
    if (audio.readyState >= 1) onMeta()
    else audio.addEventListener('loadedmetadata', onMeta)
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
      setMediaSessionPlaybackState('playing')
      startPositionTick()
      notify()
    } catch {
      playingRef.current = false
      wantPlayingRef.current = false
      snapshot.playing = false
      setMediaSessionPlaybackState('paused')
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
    setMediaSessionPlaybackState('paused')
    stopPositionTick()
    void tryKeepAwakeWhilePlaying(false)
    notify()
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * API pública del motor
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

  /**
   * 0–3. En modo nativo el volumen real se satura en 1; el exceso refuerza
   * getFrequencyData para el visualizador (no distorsiona el altavoz).
   */
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
      updatePositionState(
        (audio.duration || 0) * 1000,
        (audio.currentTime || 0) * 1000,
        val
      )
    }
    notify()
  },

  async playTrack(t: TrackItem, queue?: TrackItem[]) {
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

    await loadTrack(t)
    const audio = ensureAudio()
    ensureGraph(audio)
    setAudioSessionPlayback()
    ensureMediaSessionHandlers()
    updateMediaSessionMetadata(t)
    requestFloatingBar()

    if (ctxRef.current?.state === 'suspended') {
      try {
        await ctxRef.current.resume()
      } catch {
        /* */
      }
    }

    wantPlayingRef.current = true
    try {
      await audio.play()
      playingRef.current = true
      snapshot.playing = true
      snapshot.error = null
      setMediaSessionPlaybackState('playing')
      startPositionTick()
      void tryKeepAwakeWhilePlaying(true)
      notify()
    } catch (e) {
      playingRef.current = false
      snapshot.playing = false
      const msg = e instanceof Error ? e.message : String(e)
      if (/NotAllowedError|interact/i.test(msg)) {
        snapshot.error =
          'Pulsa ▶ para iniciar la reproducción (política del navegador).'
      } else {
        snapshot.error = 'No se pudo iniciar la reproducción.'
      }
      setMediaSessionPlaybackState('paused')
      notify()
    }
  },

  async toggle() {
    const audio = ensureAudio()
    ensureGraph(audio)
    setAudioSessionPlayback()
    ensureMediaSessionHandlers()

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
      wantPlayingRef.current = true
      try {
        await audio.play()
        playingRef.current = true
        snapshot.playing = true
        snapshot.error = null
        setMediaSessionPlaybackState('playing')
        startPositionTick()
        void tryKeepAwakeWhilePlaying(true)
        notify()
      } catch {
        playingRef.current = false
        snapshot.playing = false
        setMediaSessionPlaybackState('paused')
        notify()
      }
    } else {
      // Pausa explícita del usuario: la notificación DEBE permanecer.
      wantPlayingRef.current = false
      audio.pause()
      playingRef.current = false
      snapshot.playing = false
      setMediaSessionPlaybackState('paused')
      stopPositionTick()
      void tryKeepAwakeWhilePlaying(false)
      // Reafirmar metadata por si algún SO la limpió al pausar.
      if (trackRef.current) updateMediaSessionMetadata(trackRef.current)
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
      /* algunos estados readyState no permiten seek todavía */
    }
    snapshot.currentMs = t * 1000
    updatePositionState(d * 1000 || snapshot.durationMs, t * 1000, rateRef.current)
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
    // Si llevamos >3s, reiniciar la pista actual (comportamiento típico de apps).
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      snapshot.currentMs = 0
      updatePositionState((audio.duration || 0) * 1000, 0, rateRef.current)
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
    // En modo nativo, gain > 1 no sube el altavoz; refuerza el espectro del UI.
    if (outputModeRef.current === 'native' && gainRefState.current > 1) {
      const boost = gainRefState.current
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.min(255, Math.round(buf[i] * boost))
      }
    }
    return buf
  },

  resumeAudioContext,

  /**
   * Fuerza re-registro de Media Session (útil tras volver de un WebView que
   * a veces pierde los handlers al suspender).
   */
  refreshMediaSession() {
    mediaSessionReady.current = false
    ensureMediaSessionHandlers()
    if (trackRef.current) updateMediaSessionMetadata(trackRef.current)
    setMediaSessionPlaybackState(playingRef.current ? 'playing' : 'paused')
    const audio = audioRef.current
    if (audio) {
      updatePositionState(
        (audio.duration || 0) * 1000 || snapshot.durationMs,
        (audio.currentTime || 0) * 1000,
        rateRef.current
      )
    }
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Hook React — ventana reactiva hacia el singleton
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Hook reactivo hacia el motor singleton.
 * Seguro llamar desde cualquier vista (Música, Nutrición, juegos, menú…):
 * todas comparten el mismo <audio> y la misma Media Session.
 *
 * No hay cleanup al desmontar el componente: el motor vive hasta pagehide.
 */
export function useMediaPlayer(): MediaPlayerApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  // Leer version fuerza re-render cuando el motor notifica.
  void snap.version
  return api
}

/* Re-export por si algún test o bridge necesita limpiar handlers al salir del proceso. */
export const __mediaPlayerInternals = {
  clearMediaSessionHandlers,
  notify,
  getSnapshot,
}