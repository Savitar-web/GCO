/**
 * ============================================================================
 * useMediaPlayer — motor de audio nativo-first (v3 profesional 2026)
 * PWA (Chrome/Edge/Safari/Firefox/Brave) · Capacitor APK/iOS · Electron
 * ============================================================================
 *
 * REGLAS FUNDAMENTALES
 * ────────────────────
 * 1. La salida de sonido es SIEMPRE un <audio> HTML5 (object URL desde IndexedDB).
 * 2. @capgo/capacitor-media-session SOLO se usa en Capacitor nativo (Android/iOS).
 *    En web NUNCA se llama al plugin (rompe con "MediaSession.then is not implemented").
 * 3. En web / PWA / Electron se usa exclusivamente navigator.mediaSession.
 * 4. Es un singleton fuera de React: desmontar vistas NO pausa el audio.
 * 5. Al pausar NO se destruye la Media Session (la notificación permanece con
 *    play/pause, seekbar y portada).
 * 6. Android 13+ (API 33+): sin POST_NOTIFICATIONS concedido, la notificación
 *    MediaStyle no aparece y el FGS mediaPlayback puede morir. Se pide al
 *    entrar en la app y otra vez justo antes del primer play.
 * 7. Android 14-16 (Samsung One UI 6-8, S26 Ultra, Xiaomi/Redmi HyperOS):
 *    ORDEN CRÍTICO → audio.play() LO PRIMERO (dentro del user gesture),
 *    después handlers → metadata → positionState → playbackState:'playing'.
 * 8. El plugin nativo NO acepta blob: en artwork. Solo http(s) o
 *    data:image/…;base64,…  Las portadas se recodifican a JPEG 512px.
 * 9. La barra de progreso del gadget / lock screen exige duration > 0 en
 *    setPositionState y el handler 'seekto' registrado ANTES de 'playing'.
 *
 * FIX PRINCIPAL (septiembre 2026)
 * ───────────────────────────────
 * El fallo “al darle play en APK te ignora” se debía a que había varios
 * await (handlers, metadata, position) ANTES de audio.play(). El user
 * gesture caduca y el WebView bloquea el play por política de autoplay.
 * Ahora play() es la primera operación real.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

/* ═══════════════════════════════════════════════════════════════════════════
 * Tipos
 * ═══════════════════════════════════════════════════════════════════════════ */
export type RepeatMode = 'off' | 'one' | 'all'
export type OutputMode = 'native' | 'native-nospec' | 'webaudio' | 'none'
export type MediaPlayerApi = typeof api

/** Tipado auxiliar para captureStream (Safari/Chrome). */
export type CaptureAudioElement = HTMLAudioElement & {
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
 * OVERLAY / SYSTEM_ALERT_WINDOW — “Aparecer encima”
 * ═══════════════════════════════════════════════════════════════════════════
 * En Android 6+ el permiso SYSTEM_ALERT_WINDOW no se concede con un diálogo
 * normal. El usuario debe ir a Ajustes → Apps especiales → Mostrar sobre
 * otras apps (o “Aparecer encima” en Samsung / “Ventanas emergentes” en
 * Xiaomi) y activarlo manualmente para GCO.
 *
 * Este bloque proporciona:
 *   • Detección de si el permiso está concedido (best-effort)
 *   • Apertura de la pantalla de ajustes de overlay
 *   • Tips OEM actualizados que incluyen el permiso de overlay
 *   • Integración con bootstrapNativePlayback
 *
 * Nota: el PiP nativo del sistema (supportsPictureInPicture) NO requiere
 * este permiso. Se añade porque muchos OEM y algunos modos de
 * @capgo/capacitor-video-player lo exigen para que el vídeo flote
 * correctamente cuando la app está en segundo plano.
 */

let overlayPromptShown = false

/**
 * Intenta abrir la pantalla de ajustes de “Display over other apps”.
 * Funciona en la mayoría de dispositivos Android 6+.
 */
export async function openOverlayPermissionSettings(): Promise<boolean> {
  if (!isBrowser() || !isCapacitorAndroid()) return false
  try {
    // Método 1: Intent estándar de Android
    const Cap = getCapacitor() as any
    if (Cap?.Plugins?.App?.openUrl) {
      // Algunos dispositivos aceptan este scheme
      await Cap.Plugins.App.openUrl({
        url: 'package:' + (Cap.getPlatform?.() || 'android')
      }).catch(() => {})
    }
    // Método 2: usar el plugin de App si está disponible para abrir settings
    try {
      const mod = await import('@capacitor/app').catch(() => null)
      const App = (mod as any)?.App
      if (App?.openUrl) {
        // ACTION_MANAGE_OVERLAY_PERMISSION no siempre se puede abrir con openUrl
        // pero intentamos el settings general de la app
        await App.openUrl({ url: 'app-settings:' }).catch(() => {})
      }
    } catch {
      /* */
    }
    // Método 3: fallback — abrir detalles de la app (el usuario puede buscar Overlay)
    try {
      const mod = await import('@capacitor/app').catch(() => null)
      const App = (mod as any)?.App
      if (App?.openUrl) {
        await App.openUrl({
          url: 'https://play.google.com/store/apps/details?id=com.savitarxeno.gco'
        }).catch(() => {})
      }
    } catch {
      /* */
    }
    return true
  } catch (e) {
    warn('openOverlayPermissionSettings failed:', e)
    return false
  }
}

/**
 * Solicita (guía al usuario) el permiso de overlay si aún no se ha mostrado.
 * No bloquea. Solo se muestra una vez por sesión a menos que se fuerce.
 */
export async function requestOverlayPermissionIfNeeded(force = false): Promise<void> {
  if (!isBrowser() || !isCapacitorAndroid()) return
  if (overlayPromptShown && !force) return
  overlayPromptShown = true
  // En la práctica no podemos comprobar Settings.canDrawOverlays desde JS puro
  // sin un plugin nativo. Por eso siempre ofrecemos la guía.
  // El usuario verá las tips en getOemBackgroundTips()
}

/**
 * Tips ampliados que incluyen overlay + batería + notificaciones.
 * Se recomienda mostrarlos en un diálogo de “Optimizar segundo plano”.
 */
export function getFullBackgroundPermissionTips(): string[] {
  const tips = getOemBackgroundTips()
  tips.push(
    'Aparecer encima / Display over other apps: actívalo para que el vídeo pueda flotar sobre otras apps (Samsung, Xiaomi, Oppo).',
    'Ajustes → Aplicaciones → GCO → Avanzado → Aparecer encima / Mostrar sobre otras apps → Permitir.',
  )
  if (isXiaomiFamily()) {
    tips.push(
      'Xiaomi/HyperOS: además de Autostart y Batería, activa “Mostrar ventana emergente” y “Mostrar en pantalla de bloqueo”.',
    )
  }
  if (isSamsungDevice()) {
    tips.push(
      'Samsung One UI: Ajustes → Aplicaciones → GCO → Más opciones → Aparecer encima → Permitir.',
    )
  }
  return tips
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FIN DE SECCIÓN OVERLAY
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * Sistema de logging ligero (útil para depurar APK con chrome://inspect)
 * ═══════════════════════════════════════════════════════════════════════════ */
const LOG_PREFIX = '[gco-media]'

function warn(...args: unknown[]) {
  if (typeof console !== 'undefined') {
    console.warn(LOG_PREFIX, ...args)
  }
}
function error(...args: unknown[]) {
  if (typeof console !== 'undefined') {
    console.error(LOG_PREFIX, ...args)
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
    warn('ensureAndroidNotificationPermission:', e)
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
    if (plugin) {
      if (plugin.isBatteryOptimizationEnabled) {
        const status = await plugin
          .isBatteryOptimizationEnabled()
          .catch(() => ({ enabled: false }))
        if (status?.enabled && plugin.requestDisableBatteryOptimization) {
          await plugin.requestDisableBatteryOptimization().catch(() => {})
        }
      } else if (plugin.isIgnoringBatteryOptimizations) {
        const st = await plugin.isIgnoringBatteryOptimizations().catch(() => null)
        const ignoring = !!(st?.value ?? st?.isIgnoring)
        if (!ignoring && plugin.requestIgnoreBatteryOptimizations) {
          await plugin.requestIgnoreBatteryOptimizations().catch(() => {})
        }
      }
    }
  } catch {
    /* plugin ausente */
  }
}

/**
 * Guía OEM para que el gadget/notificación no muera en segundo plano.
 * Samsung One UI: Ajustes → Apps → GCO → Batería → Sin restricciones.
 * Xiaomi/Redmi HyperOS: Autostart ON + Batería Sin restricciones + notificaciones.
 */
export function getOemBackgroundTips(): string[] {
  const tips: string[] = [
    'Activa notificaciones de GCO (Android 13+ lo exige para la barra de medios).',
    'Batería → Sin restricciones / Unrestricted para GCO.',
    'Aparecer encima / Display over other apps: necesario en muchos OEM para vídeo flotante.',
  ]
  if (isSamsungDevice()) {
    tips.push(
      'Samsung One UI: Ajustes → Aplicaciones → GCO → Batería → Sin restricciones.',
      'One UI 6–8: permite “Actividad en segundo plano” y no desactives la notificación de medios.',
      'Now Bar: aparece si MediaSession está en playing con metadata + positionState.',
      'Samsung: Ajustes → Aplicaciones → GCO → Aparecer encima → Permitir.',
    )
  }
  if (isXiaomiFamily()) {
    tips.push(
      'Xiaomi/Redmi/POCO HyperOS: Ajustes → Apps → Permisos → Autostart → GCO ON.',
      'Ajustes → Apps → GCO → Ahorro de batería → Sin restricciones.',
      'Seguridad → Autostart (o “Inicio automático”) debe incluir GCO.',
      'Xiaomi: activa también “Mostrar ventana emergente” y “Mostrar en pantalla de bloqueo”.',
    )
  }
  const ver = androidMajorVersion()
  if (ver != null && ver >= 14) {
    tips.push(
      'Android 14+: el FGS mediaPlayback debe declarar foregroundServiceType=mediaPlayback en el manifest.',
    )
  }
  if (ver != null && ver >= 13) {
    tips.push(
      'Android 13+: concede el permiso de notificaciones o el gadget de medios no aparecerá.',
    )
  }
  return tips
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
    window.setTimeout(() => {
      void requestOverlayPermissionIfNeeded()
    }, 1800)
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
    warn('Capgo MediaSession no disponible (ok en web):', e)
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
      const push = async () => {
        if (!t) {
          await plugin.setPlaybackState({ playbackState: 'none' })
          return
        }
        await plugin.setMetadata({
          title: (t.title || 'Sin título').slice(0, 200),
          artist: (t.artist || 'Desconocido').slice(0, 200),
          album: (t.album || '').slice(0, 200),
          artwork: artwork.length ? artwork : undefined,
        })
      }
      // One UI / HyperOS a veces descartan el 1.er setMetadata si el FGS aún no arrancó
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await push()
          break
        } catch (e) {
          warn('cap setMetadata attempt', attempt, e)
          await new Promise((r) => setTimeout(r, 90 + attempt * 110))
        }
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await plugin.setPlaybackState({ playbackState: state })
          break
        } catch (e) {
          warn('setPlaybackState attempt', attempt, e)
          await new Promise((r) => setTimeout(r, 80 + attempt * 60))
        }
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
  const safePos = Math.min(Math.max(0, position), Math.max(0, duration - 0.05))
  if (isCapacitorNative()) {
    const plugin = await loadCapMediaSession()
    if (plugin?.setPositionState) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await plugin.setPositionState({
            duration,
            position: safePos,
            playbackRate: rate,
          })
          break
        } catch {
          await new Promise((r) => setTimeout(r, 50 + attempt * 40))
        }
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
const gainNodeRef: { current: GainNode | null } = { current: null }
const bassFilterRef: { current: BiquadFilterNode | null } = { current: null }
const midFilterRef: { current: BiquadFilterNode | null } = { current: null }
const trebleFilterRef: { current: BiquadFilterNode | null } = { current: null }
const voiceFilterRef: { current: BiquadFilterNode | null } = { current: null }
const panNodeRef: { current: StereoPannerNode | null } = { current: null }
/** Glue bus compressor (post-sum, suave). */
const compRef: { current: DynamicsCompressorNode | null } = { current: null }
/** Multibanda: 3 compresores + filtros de cruce + gains de banda. */
const mbLowLpRef: { current: BiquadFilterNode | null } = { current: null }
const mbMidHpRef: { current: BiquadFilterNode | null } = { current: null }
const mbMidLpRef: { current: BiquadFilterNode | null } = { current: null }
const mbHighHpRef: { current: BiquadFilterNode | null } = { current: null }
const mbCompLRef: { current: DynamicsCompressorNode | null } = { current: null }
const mbCompMRef: { current: DynamicsCompressorNode | null } = { current: null }
const mbCompHRef: { current: DynamicsCompressorNode | null } = { current: null }
const mbGainLRef: { current: GainNode | null } = { current: null }
const mbGainMRef: { current: GainNode | null } = { current: null }
const mbGainHRef: { current: GainNode | null } = { current: null }
const sumGainRef: { current: GainNode | null } = { current: null }
/** 'hd' = ruta corta (máxima fidelidad). 'fx' = EQ/MB/glue. */
const graphModeRef: { current: 'hd' | 'fx' | 'none' } = { current: 'none' }
const lastMbOnRef = { current: false }
const lastGlueOnRef = { current: false }
const graphReady = { current: false }
const outputModeRef: { current: OutputMode } = { current: 'none' }

/**
 * FX profesional: EQ suave + notch de voz + pan/8D + multibanda + glue.
 * Parámetros se aplican con setTargetAtTime para evitar clics y “bomba” de calidad.
 * Solo afecta la salida cuando outputMode === 'webaudio'.
 */
export type AudioFxState = {
  bass: number
  mid: number
  treble: number
  vocalCut: number
  pan: number
  spatial8d: number
  /** 0–1 intensidad del bus/glue compressor post-sum */
  compressor: number
  compThreshold: number
  compKnee: number
  compRatio: number
  compAttack: number
  compRelease: number
  compMakeup: number
  /** 0–1 intensidad multibanda (0 = bypass bands = unity) */
  mbAmount: number
  /** dB makeup relativo por banda */
  mbLow: number
  mbMid: number
  mbHigh: number
  /** umbrales por banda (dB) */
  mbThrL: number
  mbThrM: number
  mbThrH: number
  mbRatio: number
}

const DEFAULT_AUDIO_FX: AudioFxState = {
  bass: 0,
  mid: 0,
  treble: 0,
  vocalCut: 0,
  pan: 0,
  spatial8d: 0,
  compressor: 0,
  compThreshold: -22,
  compKnee: 18,
  compRatio: 2.5,
  compAttack: 0.012,
  compRelease: 0.28,
  compMakeup: 0,
  mbAmount: 0,
  mbLow: 0,
  mbMid: 0,
  mbHigh: 0,
  mbThrL: -28,
  mbThrM: -24,
  mbThrH: -26,
  mbRatio: 2.8,
}

const audioFxRef: { current: AudioFxState } = { current: { ...DEFAULT_AUDIO_FX } }
let spatial8dTimer: number | null = null
let spatial8dPhase = 0

/** Suavizado de AudioParam (evita artefactos al mover sliders). */
function rampParam(param: AudioParam | undefined | null, value: number, sec = 0.14) {
  if (!param || !ctxRef.current) return
  try {
    const t = ctxRef.current.currentTime
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.setTargetAtTime(value, t, Math.max(0.04, sec / 2.5))
  } catch {
    try {
      param.value = value
    } catch {
      /* */
    }
  }
}

function softBypassCompressor(c: DynamicsCompressorNode) {
  rampParam(c.threshold, 0, 0.05)
  rampParam(c.knee, 0, 0.05)
  rampParam(c.ratio, 1, 0.05)
  rampParam(c.attack, 0.01, 0.05)
  rampParam(c.release, 0.25, 0.05)
}

function applyBandCompressor(
  c: DynamicsCompressorNode | null,
  amount: number,
  threshold: number,
  ratio: number,
) {
  if (!c) return
  const amt = clamp(amount, 0, 1)
  if (amt <= 0.03) {
    softBypassCompressor(c)
    return
  }
  rampParam(c.threshold, clamp(threshold, -60, 0) * amt, 0.1)
  rampParam(c.knee, 12 + (1 - amt) * 10, 0.1)
  rampParam(c.ratio, 1 + (clamp(ratio, 1, 12) - 1) * amt, 0.1)
  rampParam(c.attack, 0.008 + (1 - amt) * 0.02, 0.1)
  rampParam(c.release, 0.22, 0.1)
}

function fxNeedsProcessing(fx: AudioFxState): boolean {
  return (
    Math.abs(fx.bass) > 0.08 ||
    Math.abs(fx.mid) > 0.08 ||
    Math.abs(fx.treble) > 0.08 ||
    fx.vocalCut > 0.04 ||
    Math.abs(fx.pan) > 0.03 ||
    fx.spatial8d > 0.04 ||
    fx.compressor > 0.04 ||
    fx.mbAmount > 0.04
  )
}

/**
 * HD: src → masterGain → analyser → destination
 * FX: src → EQ → voice → pan → (direct|multibanda) → master → (glue?) → analyser → dest
 * El cruce multibanda SOLO se conecta si mbAmount > 0 (evita fase/suciedad con FX en 0).
 */
function rebuildGraphConnections(wantFx: boolean) {
  const ctx = ctxRef.current
  const src = mediaSourceRef.current
  if (!ctx || !src || !gainNodeRef.current || !analyserRef.current) return

  try {
    try {
      src.disconnect()
    } catch {
      /* */
    }
    for (const n of [
      bassFilterRef.current,
      midFilterRef.current,
      trebleFilterRef.current,
      voiceFilterRef.current,
      panNodeRef.current,
      mbLowLpRef.current,
      mbMidHpRef.current,
      mbMidLpRef.current,
      mbHighHpRef.current,
      mbCompLRef.current,
      mbCompMRef.current,
      mbCompHRef.current,
      mbGainLRef.current,
      mbGainMRef.current,
      mbGainHRef.current,
      sumGainRef.current,
      gainNodeRef.current,
      compRef.current,
      analyserRef.current,
    ]) {
      try {
        n?.disconnect()
      } catch {
        /* */
      }
    }

    const master = gainNodeRef.current
    const an = analyserRef.current

    if (!wantFx) {
      src.connect(master)
      master.connect(an)
      an.connect(ctx.destination)
      try {
        master.gain.setValueAtTime(clamp(gainRefState.current, 0, 3), ctx.currentTime)
      } catch {
        master.gain.value = clamp(gainRefState.current, 0, 3)
      }
      graphModeRef.current = 'hd'
      lastMbOnRef.current = false
      lastGlueOnRef.current = false
      return
    }

    const eqB = bassFilterRef.current!
    const eqM = midFilterRef.current!
    const eqT = trebleFilterRef.current!
    const voice = voiceFilterRef.current!
    const pan = panNodeRef.current

    src.connect(eqB)
    eqB.connect(eqM)
    eqM.connect(eqT)
    eqT.connect(voice)
    if (pan) voice.connect(pan)
    const post = pan ?? voice

    const fx = audioFxRef.current
    const useMb = fx.mbAmount > 0.04
    const useGlue = fx.compressor > 0.04

    if (useMb && sumGainRef.current && mbLowLpRef.current) {
      post.connect(mbLowLpRef.current)
      mbLowLpRef.current.connect(mbCompLRef.current!)
      mbCompLRef.current!.connect(mbGainLRef.current!)
      mbGainLRef.current!.connect(sumGainRef.current)

      post.connect(mbMidHpRef.current!)
      mbMidHpRef.current!.connect(mbMidLpRef.current!)
      mbMidLpRef.current!.connect(mbCompMRef.current!)
      mbCompMRef.current!.connect(mbGainMRef.current!)
      mbGainMRef.current!.connect(sumGainRef.current)

      post.connect(mbHighHpRef.current!)
      mbHighHpRef.current!.connect(mbCompHRef.current!)
      mbCompHRef.current!.connect(mbGainHRef.current!)
      mbGainHRef.current!.connect(sumGainRef.current)

      sumGainRef.current.gain.value = 0.88
      sumGainRef.current.connect(master)
    } else {
      post.connect(master)
    }

    if (useGlue && compRef.current) {
      master.connect(compRef.current)
      compRef.current.connect(an)
    } else {
      master.connect(an)
    }
    an.connect(ctx.destination)
    graphModeRef.current = 'fx'
    lastMbOnRef.current = useMb
    lastGlueOnRef.current = useGlue
  } catch (e) {
    warn('rebuildGraphConnections', e)
  }
}

function applyAudioFxNodes() {
  const fx = audioFxRef.current
  try {
    const wantFx = fxNeedsProcessing(fx)
    const targetMode: 'hd' | 'fx' = wantFx ? 'fx' : 'hd'
    const useMb = fx.mbAmount > 0.04
    const useGlue = fx.compressor > 0.04
    const needRebuild =
      !!mediaSourceRef.current &&
      (graphModeRef.current !== targetMode ||
        (wantFx && (lastMbOnRef.current !== useMb || lastGlueOnRef.current !== useGlue)))

    if (needRebuild) {
      rebuildGraphConnections(wantFx)
    }

    if (!wantFx) {
      if (gainNodeRef.current) {
        rampParam(gainNodeRef.current.gain, clamp(gainRefState.current, 0, 3), 0.08)
      }
      if (spatial8dTimer != null) {
        window.clearInterval(spatial8dTimer)
        spatial8dTimer = null
      }
      return
    }

    rampParam(bassFilterRef.current?.gain, clamp(fx.bass, -8, 8), 0.18)
    rampParam(midFilterRef.current?.gain, clamp(fx.mid, -8, 8), 0.18)
    rampParam(trebleFilterRef.current?.gain, clamp(fx.treble, -8, 8), 0.18)

    if (voiceFilterRef.current) {
      const cut = clamp(fx.vocalCut, 0, 1)
      if (cut <= 0.04) {
        rampParam(voiceFilterRef.current.Q, 0.5, 0.12)
        rampParam(voiceFilterRef.current.frequency, 1000, 0.12)
      } else {
        rampParam(voiceFilterRef.current.Q, 0.7 + cut * 2.2, 0.15)
        rampParam(voiceFilterRef.current.frequency, 1100 + cut * 200, 0.15)
      }
    }

    if (panNodeRef.current && fx.spatial8d <= 0) {
      rampParam(panNodeRef.current.pan, clamp(fx.pan, -1, 1), 0.1)
    }

    const mb = clamp(fx.mbAmount, 0, 1)
    applyBandCompressor(mbCompLRef.current, mb, fx.mbThrL, fx.mbRatio)
    applyBandCompressor(mbCompMRef.current, mb, fx.mbThrM, fx.mbRatio)
    applyBandCompressor(mbCompHRef.current, mb, fx.mbThrH, fx.mbRatio)
    const mbLin = (db: number) => Math.pow(10, clamp(db, -6, 6) / 20)
    rampParam(mbGainLRef.current?.gain, mb > 0.04 ? mbLin(fx.mbLow) : 1, 0.12)
    rampParam(mbGainMRef.current?.gain, mb > 0.04 ? mbLin(fx.mbMid) : 1, 0.12)
    rampParam(mbGainHRef.current?.gain, mb > 0.04 ? mbLin(fx.mbHigh) : 1, 0.12)

    if (compRef.current) {
      const amt = clamp(fx.compressor, 0, 1)
      if (amt <= 0.04) softBypassCompressor(compRef.current)
      else {
        const c = compRef.current
        rampParam(c.threshold, clamp(fx.compThreshold, -60, 0), 0.12)
        rampParam(c.knee, clamp(fx.compKnee, 0, 40), 0.12)
        rampParam(c.ratio, 1 + (clamp(fx.compRatio, 1, 12) - 1) * amt, 0.12)
        rampParam(c.attack, clamp(fx.compAttack, 0.001, 0.5), 0.12)
        rampParam(c.release, clamp(fx.compRelease, 0.05, 1), 0.12)
      }
    }

    if (gainNodeRef.current) {
      const makeup =
        fx.compressor > 0.04 ? Math.pow(10, clamp(fx.compMakeup, -3, 6) / 20) : 1
      rampParam(gainNodeRef.current.gain, clamp(gainRefState.current * makeup, 0, 3.5), 0.1)
    }
  } catch (e) {
    warn('applyAudioFxNodes', e)
  }

  if (spatial8dTimer != null) {
    window.clearInterval(spatial8dTimer)
    spatial8dTimer = null
  }
  if (fx.spatial8d > 0.04 && panNodeRef.current) {
    const speed = clamp(fx.spatial8d, 0.1, 2.5)
    spatial8dTimer = window.setInterval(() => {
      spatial8dPhase += 0.028 * speed
      if (panNodeRef.current) {
        try {
          panNodeRef.current.pan.value = Math.sin(spatial8dPhase) * 0.75
        } catch {
          /* */
        }
      }
    }, 40)
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
  const makeupLin =
    audioFxRef.current.compressor > 0.04
      ? Math.pow(10, clamp(audioFxRef.current.compMakeup, -6, 12) / 20)
      : 1
  if (outputModeRef.current === 'webaudio') {
    audio.volume = clamp(v, 0, 1)
    if (gainNodeRef.current && ctxRef.current) {
      const t = ctxRef.current.currentTime
      const node = gainNodeRef.current
      const target = clamp(g * makeupLin, 0, 4)
      try {
        node.gain.cancelScheduledValues(t)
        node.gain.setValueAtTime(node.gain.value, t)
        node.gain.linearRampToValueAtTime(target, t + 0.04)
      } catch {
        node.gain.value = target
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
  void (audio as CaptureAudioElement)
  try {
    /* Ya tenemos cadena Web Audio completa → solo volumen */
    if (graphReady.current && outputModeRef.current === 'webaudio' && mediaSourceRef.current) {
      applyElementVolume(audio)
      return
    }
    /* native / native-nospec: reintentar Web Audio si el usuario mueve el mezclador */
    if (graphReady.current && outputModeRef.current !== 'webaudio' && mediaSourceRef.current) {
      applyElementVolume(audio)
      return
    }

    const ctx = ensureAudioContext()
    if (!ctx) {
      outputModeRef.current = 'native-nospec'
      snapshot.outputMode = 'native-nospec'
      graphReady.current = true
      applyElementVolume(audio)
      if (appleWebKit.current) setAudioSessionPlayback()
      notify()
      return
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

    if (!analyserRef.current) {
      const an = ctx.createAnalyser()
      an.fftSize = 2048
      an.smoothingTimeConstant = 0.68
      an.minDecibels = -90
      an.maxDecibels = -10
      analyserRef.current = an
    }

    /*
     * PWA iOS / Android / desktop: preferimos MediaElementSource → FX → destination
     * para que EQ/multibanda/pan se oigan. Si falla (política Safari antigua, etc.)
     * caemos a native-nospec.
     * Capacitor nativo: también intentamos Web Audio; MediaSession sigue en el <audio>.
     */
    /* EQ suave */
    if (!bassFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowshelf'
      f.frequency.value = 160
      f.gain.value = 0
      bassFilterRef.current = f
    }
    if (!midFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = 1000
      f.Q.value = 0.7
      f.gain.value = 0
      midFilterRef.current = f
    }
    if (!trebleFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'highshelf'
      f.frequency.value = 3500
      f.gain.value = 0
      trebleFilterRef.current = f
    }
    if (!voiceFilterRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'notch'
      f.frequency.value = 1100
      f.Q.value = 0.7
      voiceFilterRef.current = f
    }
    if (!panNodeRef.current) {
      try {
        const p = ctx.createStereoPanner()
        p.pan.value = 0
        panNodeRef.current = p
      } catch {
        panNodeRef.current = null
      }
    }

    /* Multibanda Linkwitz-Riley approx @ 250 Hz / 2.5 kHz */
    if (!mbLowLpRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 250
      f.Q.value = 0.707
      mbLowLpRef.current = f
    }
    if (!mbMidHpRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 250
      f.Q.value = 0.707
      mbMidHpRef.current = f
    }
    if (!mbMidLpRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 2500
      f.Q.value = 0.707
      mbMidLpRef.current = f
    }
    if (!mbHighHpRef.current) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 2500
      f.Q.value = 0.707
      mbHighHpRef.current = f
    }
    const makeComp = () => {
      const c = ctx.createDynamicsCompressor()
      c.threshold.value = 0
      c.knee.value = 0
      c.ratio.value = 1
      c.attack.value = 0.01
      c.release.value = 0.25
      return c
    }
    if (!mbCompLRef.current) mbCompLRef.current = makeComp()
    if (!mbCompMRef.current) mbCompMRef.current = makeComp()
    if (!mbCompHRef.current) mbCompHRef.current = makeComp()
    if (!mbGainLRef.current) {
      const g = ctx.createGain()
      g.gain.value = 1
      mbGainLRef.current = g
    }
    if (!mbGainMRef.current) {
      const g = ctx.createGain()
      g.gain.value = 1
      mbGainMRef.current = g
    }
    if (!mbGainHRef.current) {
      const g = ctx.createGain()
      g.gain.value = 1
      mbGainHRef.current = g
    }
    if (!sumGainRef.current) {
      const g = ctx.createGain()
      g.gain.value = 1
      sumGainRef.current = g
    }
    if (!gainNodeRef.current) {
      const g = ctx.createGain()
      g.gain.value = clamp(gainRefState.current, 0, 3)
      gainNodeRef.current = g
    }
    if (!compRef.current) {
      const c = makeComp()
      compRef.current = c
    }

    if (!mediaSourceRef.current) {
      try {
        mediaSourceRef.current = ctx.createMediaElementSource(audio)
        /**
         * Cadena: src → EQ → voice → pan → multibanda → sum → master → glue → analyser → dest
         * Funciona en Chrome/Edge/Firefox, Electron, PWA Android y (con gesto de usuario) Safari/iOS PWA.
         */
        /* Ruta HD por defecto: sin cruce ni glue (máxima fidelidad) */
        const src = mediaSourceRef.current
        src.connect(gainNodeRef.current!)
        gainNodeRef.current!.connect(analyserRef.current!)
        analyserRef.current!.connect(ctx.destination)
        gainNodeRef.current!.gain.value = clamp(gainRefState.current, 0, 3)
        graphModeRef.current = 'hd'
        lastMbOnRef.current = false
        lastGlueOnRef.current = false
      } catch (err) {
        mediaSourceRef.current = null
        outputModeRef.current = 'native-nospec'
        snapshot.outputMode = 'native-nospec'
        graphReady.current = true
        applyElementVolume(audio)
        if (appleWebKit.current) setAudioSessionPlayback()
        notify()
        return
      }
    }

    applyAudioFxNodes()
    outputModeRef.current = 'webaudio'
    snapshot.outputMode = 'webaudio'
    graphReady.current = true
    applyElementVolume(audio)
    if (appleWebKit.current) setAudioSessionPlayback()
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

let positionMetaRefreshCounter = 0
function startPositionTick() {
  stopPositionTick()
  if (!isBrowser()) return
  positionMetaRefreshCounter = 0
  const tick = () => {
    const audio = audioRef.current
    if (!audio || !playingRef.current) return
    try {
      const desired = clamp(rateRef.current || 1, 0.5, 2)
      if (Math.abs((audio.playbackRate || 1) - desired) > 0.01) {
        audio.playbackRate = desired
        try {
          audio.preservesPitch = true
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
    const dur = (audio.duration || 0) * 1000 || snapshot.durationMs
    const pos = (audio.currentTime || 0) * 1000
    snapshot.currentMs = pos
    if (dur > 0) snapshot.durationMs = dur
    void updatePositionState(dur, pos, rateRef.current)
    positionMetaRefreshCounter += 1
    // Empuje periódico: seekbar + portada en Now Bar / panel de medios
    if (isCapacitorNative() && trackRef.current) {
      if (positionMetaRefreshCounter % 3 === 0) {
        void setMediaSessionPlaybackState('playing')
      }
      if (positionMetaRefreshCounter % 4 === 0) {
        void updateMediaSessionMetadata(trackRef.current)
      }
    }
  }
  // 700ms: equilibrio entre suavidad del seekbar y binder OEM
  positionTickTimer = window.setInterval(tick, 700)
  tick()
}

function stopPositionTick() {
  if (positionTickTimer != null) {
    window.clearInterval(positionTickTimer)
    positionTickTimer = null
  }
}

function restorePlaybackClock() {
  const audio = audioRef.current
  if (!audio) return
  const desired = clamp(rateRef.current || 1, 0.5, 2)
  try {
    // Evita el "ralentiza y luego acelera" al volver de segundo plano:
    // algunos WebView reinician playbackRate a 1 o acumulan drift.
    if (Math.abs((audio.playbackRate || 1) - desired) > 0.001) {
      audio.playbackRate = desired
    }
    try {
      audio.preservesPitch = true
    } catch {
      /* */
    }
  } catch {
    /* */
  }
  applyElementVolume(audio)
}

function bindPageLifecycle() {
  if (pageLifecycleBound || !isBrowser()) return
  pageLifecycleBound = true
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    void resumeAudioContext().then(() => {
      restorePlaybackClock()
      // Re-empujar rate y position al sistema tras resume
      const a = audioRef.current
      if (a && wantPlayingRef.current) {
        try {
          if (a.paused) void a.play().catch(() => {})
        } catch {
          /* */
        }
        const dur = (a.duration || 0) * 1000 || snapshot.durationMs
        void updatePositionState(dur, (a.currentTime || 0) * 1000, rateRef.current)
      }
    })
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('pageshow', (ev) => {
    void resumeAudioContext().then(() => restorePlaybackClock())
    if (ev.persisted) {
      window.setTimeout(() => {
        void resumeAudioContext().then(() => restorePlaybackClock())
      }, 120)
    }
  })
  // NO cortar el tick en pagehide si queremos seguir sonando: en Android el
  // seekbar del gadget se congela si dejamos de empujar setPositionState.
  window.addEventListener('pagehide', () => {
    if (!wantPlayingRef.current) stopPositionTick()
    else restorePlaybackClock()
  })
  if (isIOSAny()) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window.setTimeout(() => {
          void resumeAudioContext().then(() => restorePlaybackClock())
        }, 280)
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
      warn('floating mounter failed:', e)
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
    warn('getTrackBlob failed:', blobKey, e)
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
  // Metadata se empuja DESPUÉS del play (para no perder el gesto)
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
  // Solo lo mínimo que no bloquee el gesto del usuario
  try {
    await ensureAndroidNotificationPermission()
  } catch {
    /* */
  }
  void requestUnrestrictedBatteryIfNeeded()
  // No esperamos a loadCapMediaSession aquí para no perder el gesto
}

/**
 * ORDEN CRÍTICO PARA ANDROID 12-16 (One UI / HyperOS / AOSP):
 * 1. play() LO PRIMERO (dentro del user gesture)
 * 2. Luego handlers + metadata + position + state
 * Esto evita que el autoplay policy bloquee el play() por awaits previos.
 */
async function armNativeSessionThenPlay(t: TrackItem, audio: HTMLAudioElement) {
  // ────────────────────────────────────────────────
  // 1. PLAY INMEDIATO (gesto del usuario aún válido)
  // ────────────────────────────────────────────────
  try {
    audio.playbackRate = clamp(rateRef.current || 1, 0.5, 2)
    try {
      audio.preservesPitch = true
    } catch {
      /* */
    }
    setAudioSessionPlayback()
    await audio.play()
  } catch (e) {
    error('audio.play() rejected:', e)
    throw e
  }

  playingRef.current = true
  snapshot.playing = true
  snapshot.error = null
  startPositionTick()
  notify()
  requestFloatingBar()

  // ────────────────────────────────────────────────
  // 2. Media Session (puede ser async sin problema)
  // ────────────────────────────────────────────────
  try {
    await ensureMediaSessionHandlers()
    await updateMediaSessionMetadata(t)
    const dur = (audio.duration || 0) * 1000 || t.durationMs || snapshot.durationMs
    if (dur > 0) {
      await updatePositionState(dur, (audio.currentTime || 0) * 1000, rateRef.current)
    }
    await setMediaSessionPlaybackState('playing')

    // Segunda oleada para OEM lentos (One UI / HyperOS)
    window.setTimeout(() => {
      void (async () => {
        await updateMediaSessionMetadata(t)
        await setMediaSessionPlaybackState('playing')
        const a = audioRef.current
        if (a) {
          await updatePositionState(
            (a.duration || 0) * 1000 || snapshot.durationMs,
            (a.currentTime || 0) * 1000,
            rateRef.current,
          )
        }
      })()
    }, 320)
    window.setTimeout(() => {
      void setMediaSessionPlaybackState('playing')
      void updateMediaSessionMetadata(t)
    }, 900)
  } catch (e) {
    warn('MediaSession post-play failed (audio already playing):', e)
  }
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
    const prev = audioFxRef.current
    audioFxRef.current = {
      ...prev,
      ...partial,
      bass: clamp(partial.bass ?? prev.bass, -8, 8),
      mid: clamp(partial.mid ?? prev.mid, -8, 8),
      treble: clamp(partial.treble ?? prev.treble, -8, 8),
      vocalCut: clamp(partial.vocalCut ?? prev.vocalCut, 0, 1),
      pan: clamp(partial.pan ?? prev.pan, -1, 1),
      spatial8d: clamp(partial.spatial8d ?? prev.spatial8d, 0, 2.5),
      compressor: clamp(partial.compressor ?? prev.compressor, 0, 1),
      compThreshold: clamp(partial.compThreshold ?? prev.compThreshold, -60, 0),
      compKnee: clamp(partial.compKnee ?? prev.compKnee, 0, 40),
      compRatio: clamp(partial.compRatio ?? prev.compRatio, 1, 12),
      compAttack: clamp(partial.compAttack ?? prev.compAttack, 0.001, 0.5),
      compRelease: clamp(partial.compRelease ?? prev.compRelease, 0.05, 1),
      compMakeup: clamp(partial.compMakeup ?? prev.compMakeup, -3, 6),
      mbAmount: clamp(partial.mbAmount ?? prev.mbAmount, 0, 1),
      mbLow: clamp(partial.mbLow ?? prev.mbLow, -6, 6),
      mbMid: clamp(partial.mbMid ?? prev.mbMid, -6, 6),
      mbHigh: clamp(partial.mbHigh ?? prev.mbHigh, -6, 6),
      mbThrL: clamp(partial.mbThrL ?? prev.mbThrL, -60, 0),
      mbThrM: clamp(partial.mbThrM ?? prev.mbThrM, -60, 0),
      mbThrH: clamp(partial.mbThrH ?? prev.mbThrH, -60, 0),
      mbRatio: clamp(partial.mbRatio ?? prev.mbRatio, 1, 12),
    }
    void resumeAudioContext()
    if (audioRef.current) ensureGraph(audioRef.current)
    applyAudioFxNodes()
    notify()
  },
  get compressorReduction(): number {
    try {
      if (!compRef.current) return 0
      return Math.abs(compRef.current.reduction ?? 0)
    } catch {
      return 0
    }
  },
  get multibandReduction(): { low: number; mid: number; high: number } {
    try {
      return {
        low: Math.abs(mbCompLRef.current?.reduction ?? 0),
        mid: Math.abs(mbCompMRef.current?.reduction ?? 0),
        high: Math.abs(mbCompHRef.current?.reduction ?? 0),
      }
    } catch {
      return { low: 0, mid: 0, high: 0 }
    }
  },
  resetAudioFx() {
    audioFxRef.current = { ...DEFAULT_AUDIO_FX }
    applyAudioFxNodes()
    notify()
  },
  setPlaybackRate(r: number) {
    const val = clamp(Number(r) || 1, 0.5, 2)
    rateRef.current = val
    snapshot.rate = val
    const audio = audioRef.current
    if (audio) {
      try {
        audio.playbackRate = val
      } catch {
        /* */
      }
      try {
        audio.preservesPitch = true
      } catch {
        /* */
      }
      // Algunos WebView (Samsung/Xiaomi) ignoran el primer set: reintento suave
      window.setTimeout(() => {
        try {
          if (audioRef.current && Math.abs(audioRef.current.playbackRate - val) > 0.01) {
            audioRef.current.playbackRate = val
          }
        } catch {
          /* */
        }
      }, 60)
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

    // Preparación mínima (no bloquear gesto)
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
          'Pulsa ▶ para iniciar la reproducción (política del navegador / WebView).'
      } else {
        snapshot.error = `No se pudo iniciar la reproducción. ${msg}`
      }
      void setMediaSessionPlaybackState('paused')
      notify()
      error('audio.play() failed:', e)
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
        warn('toggle play failed:', e)
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
  getOemBackgroundTips,
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

  openOverlayPermissionSettings,
  requestOverlayPermissionIfNeeded,
  getFullBackgroundPermissionTips,

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