import { useCallback, useEffect, useRef, useState } from 'react'

export type SkipSeconds = 5 | 10 | 15

/** ~13 caracteres/s a rate 1 (aproximación para "segundos" en TTS) */
function charsForSeconds(sec: number, rate: number) {
  return Math.round(sec * 13 * Math.max(0.5, rate || 1))
}

/**
 * Puntúa una voz para elegir la más "humana" disponible por defecto.
 * Prioriza voces neuronales/naturales de Google, Microsoft, Apple, etc.
 */
export function scoreVoiceHumanness(v: SpeechSynthesisVoice, preferLang = 'es'): number {
  let s = 0
  const name = (v.name || '').toLowerCase()
  const lang = (v.lang || '').toLowerCase()

  if (lang.startsWith(preferLang) || lang.includes('spa')) s += 100
  else if (lang.startsWith('en')) s += 15

  if (/natural|neural|premium|enhanced|wavenet|studio|online|plus|eloquence/.test(name)) s += 60
  if (
    /google|microsoft|apple|siri|samantha|alex|daniel|monica|jorge|paulina|sabina|elsa|helena|mónica/.test(
      name
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

/** Elige automáticamente la voz "más humana" disponible */
export function pickHumanVoice(voices: SpeechSynthesisVoice[], currentURI?: string): string {
  if (!voices.length) return ''
  if (currentURI && voices.some((v) => v.voiceURI === currentURI)) return currentURI
  const ranked = [...voices].sort((a, b) => scoreVoiceHumanness(b) - scoreVoiceHumanness(a))
  return ranked[0]?.voiceURI || ''
}

const WATCHDOG_MS = 10_000
const BG_NUDGE_MS = 4_000

/** Fragmenta textos largos para evitar cortes de Chrome/Android y límites de Safari */
function chunkText(text: string, maxLen = 220): string[] {
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
        slice.lastIndexOf(', ')
      )
      if (lastBreak > maxLen * 0.35) end = i + lastBreak + 1
    }
    const part = text.slice(i, end).trim()
    if (part) chunks.push(part)
    i = end
  }
  return chunks.length ? chunks : [text]
}

/**
 * WAV de silencio (~0.25s) en base64.
 * Se reproduce en loop con volumen casi inaudible mientras se habla,
 * para mantener viva una sesión de audio del SO (background + MediaSession).
 */
const SILENT_LOOP_SRC =
  'data:audio/wav;base64,UklGRgwEAABXQVZFZm10IBAAAAABAAEAoA8AAKAPAAABAAgAZGF0YegDAACAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCB'

export interface ReaderMediaMeta {
  title: string
  artist?: string
  album?: string
  /** Data URL o URL absoluta de la portada */
  artwork?: string
}

export interface ChapterNavHandlers {
  onPrevChapter?: () => void
  onNextChapter?: () => void
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Capgo Media Session — tipos propios + carga sin chocar con TS2322
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

type CapMsActionHandler = (details?: {
  seekOffset?: number
  seekTime?: number
}) => void

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
    handler: CapMsActionHandler | null
  ) => Promise<void>
}

let capMs: CapMediaSessionPlugin | null = null
let capMsTried = false

/**
 * Carga @capgo/capacitor-media-session sin anotar el módulo completo
 * (así TypeScript no compara setActionHandler con ActionHandlerOptions del paquete).
 */
async function loadCapMediaSession(): Promise<CapMediaSessionPlugin | null> {
  if (capMs) return capMs
  if (capMsTried) return null
  capMsTried = true
  if (typeof window === 'undefined') return null

  try {
    const mod = await import('@capgo/capacitor-media-session')
    const bag = mod as Record<string, unknown>
    const raw = bag.MediaSession ?? bag.default ?? null

    if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as CapMediaSessionPlugin).setMetadata === 'function' &&
      typeof (raw as CapMediaSessionPlugin).setPlaybackState === 'function' &&
      typeof (raw as CapMediaSessionPlugin).setActionHandler === 'function'
    ) {
      capMs = raw as CapMediaSessionPlugin
      return capMs
    }
  } catch (e) {
    console.warn('[gco] reader: @capgo/capacitor-media-session no disponible:', e)
  }
  return null
}

function hasWebMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Hook
 * ═══════════════════════════════════════════════════════════════════════════ */

export function useSpeechReader() {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [charIndex, setCharIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesReady, setVoicesReady] = useState(false)
  const [noVoicesAvailable, setNoVoicesAvailable] = useState(false)
  const [backgroundSupported] = useState(
    () => hasWebMediaSession() || typeof window !== 'undefined'
  )

  const textRef = useRef('')
  const baseOffsetRef = useRef(0)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
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
  const hiddenSinceRef = useRef<number | null>(null)

  // Refs estables para Media Session (no re-registrar en cada render)
  const pauseRef = useRef<() => void>(() => {})
  const resumeRef = useRef<() => void>(() => {})
  const stopRef = useRef<() => void>(() => {})
  const skipBackRef = useRef<(sec: SkipSeconds) => void>(() => {})
  const skipForwardRef = useRef<(sec: SkipSeconds) => void>(() => {})

  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'

  /* ── Audio keep-alive ── */
  useEffect(() => {
    if (typeof Audio === 'undefined') return
    try {
      const a = new Audio(SILENT_LOOP_SRC)
      a.loop = true
      a.preload = 'auto'
      a.volume = 0.01
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
      if (list.length) {
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

    const onVoices = () => loadVoices()
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
      if ((list && list.length) || voicePollAttemptsRef.current > 25) {
        if (voicePollRef.current) {
          window.clearInterval(voicePollRef.current)
          voicePollRef.current = null
        }
        if (!list || !list.length) {
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
        if (a && a.paused && window.speechSynthesis.speaking) {
          startKeepAlive()
        }
      } catch {
        /* */
      }
      const interval = document.hidden ? BG_NUDGE_MS : WATCHDOG_MS
      watchdogRef.current = window.setTimeout(tick, interval) as unknown as number
    }
    watchdogRef.current = window.setTimeout(tick, WATCHDOG_MS) as unknown as number
  }, [clearWatchdog, supported, startKeepAlive])

  /* ── Media Session (web + Capgo) ── */

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
            { src: meta.artwork, sizes: '192x192', type: 'image/png' },
          ]
        : []

      const plugin = await loadCapMediaSession()
      if (plugin) {
        try {
          await plugin.setMetadata({
            title: meta.title || 'Audiolibro',
            artist: meta.artist || '',
            album: meta.album || 'GCO Nutrición · Lector',
            artwork: artwork.length ? artwork : undefined,
          })
        } catch {
          /* */
        }
      }

      if (!hasWebMediaSession() || typeof MediaMetadata === 'undefined') return
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: meta.title || 'Audiolibro',
          artist: meta.artist || '',
          album: meta.album || 'GCO Nutrición · Lector',
          artwork,
        })
      } catch {
        /* */
      }
    },
    [updatePlaybackState]
  )

  const setMediaMetadata = useCallback(
    (meta: ReaderMediaMeta) => {
      void applyMediaMetadata(meta)
    },
    [applyMediaMetadata]
  )

  const setChapterHandlers = useCallback((handlers: ChapterNavHandlers) => {
    chapterHandlersRef.current = handlers || {}
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
    utteranceRef.current = null
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
          const nextChunk = queueRef.current[nextIdx]
          const nextOff = queueOffsetRef.current[nextIdx]
          setCharIndex(nextOff)
          speakChunk(nextChunk, nextOff, r, vURI)
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
          const nextChunk = queueRef.current[nextIdx]
          const nextOff = queueOffsetRef.current[nextIdx]
          speakChunk(nextChunk, nextOff, r, vURI)
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

      utteranceRef.current = u
      try {
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
    ]
  )

  const speakFrom = useCallback(
    (text: string, startChar = 0, r = rate, vURI = voiceURI) => {
      if (!supported) return
      stop()
      cancelledRef.current = false
      textRef.current = text
      const start = Math.max(0, Math.min(startChar, text.length))
      baseOffsetRef.current = start
      setCharIndex(start)
      const slice = text.slice(start)
      if (!slice.trim()) return

      const chunks = chunkText(slice, 200)
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

      speakChunk(chunks[0], offsets[0], r, vURI)
    },
    [rate, voiceURI, stop, supported, speakChunk]
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
      const delta = charsForSeconds(sec, rate)
      const next = Math.max(0, charIndex - delta)
      speakFrom(textRef.current, next, rate, voiceURI)
    },
    [charIndex, rate, voiceURI, speakFrom]
  )

  const skipForward = useCallback(
    (sec: SkipSeconds) => {
      const delta = charsForSeconds(sec, rate)
      const next = Math.min(textRef.current.length, charIndex + delta)
      speakFrom(textRef.current, next, rate, voiceURI)
    },
    [charIndex, rate, voiceURI, speakFrom]
  )

  pauseRef.current = pause
  resumeRef.current = resume
  stopRef.current = stop
  skipBackRef.current = skipBack
  skipForwardRef.current = skipForward

  /* ── Handlers Media Session una sola vez ── */
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
        const actions: [CapMsAction, CapMsActionHandler][] = [
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
        const safeSet = (
          action: MediaSessionAction,
          handler: MediaSessionActionHandler | null
        ) => {
          try {
            ms.setActionHandler(action, handler)
          } catch {
            /* */
          }
        }
        safeSet('play', onPlay)
        safeSet('pause', onPause)
        safeSet('stop', onStop)
        safeSet('seekbackward', onSeekBack)
        safeSet('seekforward', onSeekFwd)
        safeSet('previoustrack', onPrev)
        safeSet('nexttrack', onNext)
      }
    }

    void wire()

    return () => {
      cancelled = true
      if (capMs) {
        const clearActions: CapMsAction[] = [
          'play',
          'pause',
          'stop',
          'seekbackward',
          'seekforward',
          'previoustrack',
          'nexttrack',
        ]
        for (const action of clearActions) {
          void capMs.setActionHandler({ action }, null).catch(() => {})
        }
      }
      if (hasWebMediaSession()) {
        const ms = navigator.mediaSession
        for (const action of [
          'play',
          'pause',
          'stop',
          'seekbackward',
          'seekforward',
          'previoustrack',
          'nexttrack',
        ] as MediaSessionAction[]) {
          try {
            ms.setActionHandler(action, null)
          } catch {
            /* */
          }
        }
      }
    }
  }, [])

  /* ── Visibilidad ── */
  useEffect(() => {
    if (!supported) return
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now()
        return
      }
      hiddenSinceRef.current = null
      try {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused && !paused) {
          window.speechSynthesis.resume()
        }
      } catch {
        /* */
      }
      if (speaking) startKeepAlive()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [supported, speaking, paused, startKeepAlive])

  /* ── Capacitor App resume ── */
  useEffect(() => {
    let remove: (() => void) | undefined
    void import('@capacitor/app')
      .then((mod) => {
        const App = (
          mod as {
            App?: {
              addListener: (
                e: string,
                cb: (data?: { isActive?: boolean }) => void
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
          }
        }).then((h) => {
          remove = () => h.remove()
        })
      })
      .catch(() => {})
    return () => remove?.()
  }, [speaking, paused, startKeepAlive])

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
    speakFrom,
    pause,
    resume,
    stop,
    skipBack,
    skipForward,
    setMediaMetadata,
    setChapterHandlers,
  }
}