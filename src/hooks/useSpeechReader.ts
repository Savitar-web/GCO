import { useCallback, useEffect, useRef, useState } from 'react'

export type SkipSeconds = 5 | 10 | 15

/** ~13 caracteres/s a rate 1 (aproximación para “segundos” en TTS) */
function charsForSeconds(sec: number, rate: number) {
  return Math.round(sec * 13 * rate)
}

/**
 * Puntúa una voz para elegir la más "humana" disponible por defecto.
 * Prioriza voces neuronales/naturales de Google, Microsoft, Apple, etc.
 * sobre las robóticas "compact"/legacy que traen algunos Android/Electron.
 */
export function scoreVoiceHumanness(v: SpeechSynthesisVoice, preferLang = 'es'): number {
  let s = 0
  const name = (v.name || '').toLowerCase()
  const lang = (v.lang || '').toLowerCase()

  if (lang.startsWith(preferLang) || lang.includes('spa')) s += 100
  else if (lang.startsWith('en')) s += 15

  if (/natural|neural|premium|enhanced|wavenet|studio|online|plus/.test(name)) s += 60
  if (/google|microsoft|apple|siri|samantha|alex|daniel|monica|jorge|paulina|sabina|elsa|helena/.test(name)) s += 30
  if (v.localService) s += 10
  if (/compact|novelty|whisper|zarvox|trinoids|bad|robot|espeak/.test(name)) s -= 50
  if (v.default) s += 5
  return s
}

/** Elige automáticamente la voz "más humana" disponible (sin depender de un modo "Automático") */
export function pickHumanVoice(voices: SpeechSynthesisVoice[], currentURI?: string): string {
  if (!voices.length) return ''
  if (currentURI && voices.some((v) => v.voiceURI === currentURI)) return currentURI
  const ranked = [...voices].sort((a, b) => scoreVoiceHumanness(b) - scoreVoiceHumanness(a))
  return ranked[0]?.voiceURI || ''
}

const WATCHDOG_MS = 12_000 // Chrome/Android detienen el TTS ~15s si no se refresca con pause/resume

export function useSpeechReader() {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [charIndex, setCharIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  /** true en cuanto el motor entregó al menos una lista de voces (aunque esté vacía) */
  const [voicesReady, setVoicesReady] = useState(false)
  /** true si tras varios intentos el dispositivo no tiene ninguna voz instalada */
  const [noVoicesAvailable, setNoVoicesAvailable] = useState(false)

  const textRef = useRef('')
  const baseOffsetRef = useRef(0)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const watchdogRef = useRef<number | null>(null)
  const voicePollRef = useRef<number | null>(null)
  const voicePollAttemptsRef = useRef(0)

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const loadVoices = useCallback(() => {
    if (!supported) return
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
  }, [supported])

  // Carga inicial + reintentos (algunos WebView de Android / Electron no
  // disparan "voiceschanged" a tiempo, o lo hacen vacío la primera vez).
  useEffect(() => {
    if (!supported) return
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)

    voicePollAttemptsRef.current = 0
    voicePollRef.current = window.setInterval(() => {
      voicePollAttemptsRef.current += 1
      const list = loadVoices()
      if ((list && list.length) || voicePollAttemptsRef.current > 20) {
        if (voicePollRef.current) {
          window.clearInterval(voicePollRef.current)
          voicePollRef.current = null
        }
        if (!list || !list.length) {
          setVoicesReady(true)
          setNoVoicesAvailable(true)
        }
      }
    }, 400)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis.cancel()
      if (voicePollRef.current) window.clearInterval(voicePollRef.current)
      if (watchdogRef.current) window.clearInterval(watchdogRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  /** Truco anti-corte de Chrome/Android: refresca la cola cada ~12s mientras habla */
  const startWatchdog = useCallback(() => {
    clearWatchdog()
    watchdogRef.current = window.setInterval(() => {
      if (!supported) return
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, WATCHDOG_MS)
  }, [clearWatchdog, supported])

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    utteranceRef.current = null
    clearWatchdog()
    setSpeaking(false)
    setPaused(false)
  }, [supported, clearWatchdog])

  const speakFrom = useCallback(
    (text: string, startChar = 0, r = rate, vURI = voiceURI) => {
      if (!supported) return
      stop()
      textRef.current = text
      const start = Math.max(0, Math.min(startChar, text.length))
      baseOffsetRef.current = start
      setCharIndex(start)
      const slice = text.slice(start)
      if (!slice.trim()) return

      const u = new SpeechSynthesisUtterance(slice)
      u.rate = Math.min(2, Math.max(0.5, r))
      const voice =
        voices.find((v) => v.voiceURI === vURI) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('es')) ||
        voices[0]
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      } else {
        u.lang = 'es-ES'
      }

      u.onboundary = (ev) => {
        if (ev.name === 'word' || ev.charIndex != null) {
          setCharIndex(baseOffsetRef.current + (ev.charIndex ?? 0))
        }
      }
      u.onstart = () => {
        setSpeaking(true)
        setPaused(false)
        startWatchdog()
      }
      u.onend = () => {
        setSpeaking(false)
        setPaused(false)
        setCharIndex(text.length)
        clearWatchdog()
      }
      u.onerror = () => {
        setSpeaking(false)
        setPaused(false)
        clearWatchdog()
      }
      u.onpause = () => setPaused(true)
      u.onresume = () => setPaused(false)

      utteranceRef.current = u
      window.speechSynthesis.speak(u)
    },
    [rate, voiceURI, voices, stop, supported, startWatchdog, clearWatchdog]
  )

  const pause = useCallback(() => {
    if (!speaking || !supported) return
    window.speechSynthesis.pause()
    setPaused(true)
    clearWatchdog()
  }, [speaking, supported, clearWatchdog])

  const resume = useCallback(() => {
    if (!paused || !supported) return
    window.speechSynthesis.resume()
    setPaused(false)
    startWatchdog()
  }, [paused, supported, startWatchdog])

  /** Retroceso aproximado en “segundos” de lectura */
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
    charIndex,
    setCharIndex,
    speakFrom,
    pause,
    resume,
    stop,
    skipBack,
    skipForward,
  }
}