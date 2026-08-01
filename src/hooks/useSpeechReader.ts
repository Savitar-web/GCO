import { useCallback, useEffect, useRef, useState } from 'react'

export type SkipSeconds = 5 | 10 | 15

/** ~13 caracteres/s a rate 1 (aproximación para “segundos” en TTS) */
function charsForSeconds(sec: number, rate: number) {
  return Math.round(sec * 13 * rate)
}

export function useSpeechReader() {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState(1)
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [charIndex, setCharIndex] = useState(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const textRef = useRef('')
  const baseOffsetRef = useRef(0)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const loadVoices = useCallback(() => {
    const list = window.speechSynthesis?.getVoices() ?? []
    setVoices(list)
  }, [])

  useEffect(() => {
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis?.cancel()
    }
  }, [loadVoices])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setSpeaking(false)
    setPaused(false)
  }, [])

  const speakFrom = useCallback(
    (text: string, startChar = 0, r = rate, vURI = voiceURI) => {
      if (!('speechSynthesis' in window)) return
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
        voices.find((v) => v.lang.startsWith('es')) ||
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
      }
      u.onend = () => {
        setSpeaking(false)
        setPaused(false)
        setCharIndex(text.length)
      }
      u.onerror = () => {
        setSpeaking(false)
        setPaused(false)
      }

      utteranceRef.current = u
      window.speechSynthesis.speak(u)
    },
    [rate, voiceURI, voices, stop]
  )

  const pause = useCallback(() => {
    if (!speaking) return
    window.speechSynthesis.pause()
    setPaused(true)
  }, [speaking])

  const resume = useCallback(() => {
    if (!paused) return
    window.speechSynthesis.resume()
    setPaused(false)
  }, [paused])

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