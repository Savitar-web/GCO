import { useCallback, useEffect, useRef, useState } from 'react'

export type SkipSeconds = 5 | 10 | 15

/** ~13 caracteres/s a rate 1 (aproximación para “segundos” en TTS) */
function charsForSeconds(sec: number, rate: number) {
  return Math.round(sec * 13 * Math.max(0.5, rate || 1))
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

  if (/natural|neural|premium|enhanced|wavenet|studio|online|plus|eloquence/.test(name)) s += 60
  if (
    /google|microsoft|apple|siri|samantha|alex|daniel|monica|jorge|paulina|sabina|elsa|helena|mónica|jorge/.test(
      name
    )
  )
    s += 30
  if (v.localService) s += 10
  if (/compact|novelty|whisper|zarvox|trinoids|bad|robot|espeak|eloquence/.test(name) && !/premium|enhanced/.test(name))
    s -= 40
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

const WATCHDOG_MS = 11_000 // Chrome/Android cortan ~15s; pause/resume refresca la cola

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

export function useSpeechReader() {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [charIndex, setCharIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesReady, setVoicesReady] = useState(false)
  const [noVoicesAvailable, setNoVoicesAvailable] = useState(false)

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

  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'

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
      // Safari antiguo: property assignment
      try {
        ;(window.speechSynthesis as unknown as { onvoiceschanged: () => void }).onvoiceschanged = onVoices
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
      if (watchdogRef.current) window.clearInterval(watchdogRef.current)
    }
  }, [supported, loadVoices])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const startWatchdog = useCallback(() => {
    clearWatchdog()
    if (!supported) return
    watchdogRef.current = window.setInterval(() => {
      try {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        }
      } catch {
        /* */
      }
    }, WATCHDOG_MS)
  }, [clearWatchdog, supported])

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
    setSpeaking(false)
    setPaused(false)
  }, [supported, clearWatchdog])

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
        }
      }
      u.onerror = () => {
        if (cancelledRef.current) return
        // Intentar siguiente chunk en lugar de morir
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
        }
      }
      u.onpause = () => setPaused(true)
      u.onresume = () => setPaused(false)

      utteranceRef.current = u
      try {
        window.speechSynthesis.speak(u)
      } catch {
        setSpeaking(false)
        clearWatchdog()
      }
    },
    [supported, voices, startWatchdog, clearWatchdog]
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

      // Fragmentar para compatibilidad Chrome 15s / Safari / Android
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
  }, [speaking, supported, clearWatchdog])

  const resume = useCallback(() => {
    if (!paused || !supported) return
    try {
      window.speechSynthesis.resume()
    } catch {
      /* */
    }
    setPaused(false)
    startWatchdog()
  }, [paused, supported, startWatchdog])

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