import { useEffect, useRef } from 'react'
import { loadAudioFile, getBgPrefs, type BgPrefs } from '@/core/storage/customBackground'

/**
 * Pista ambiental (IndexedDB) en bucle.
 * Reacciona a enabled/volume y a los eventos gco:bg-prefs / gco:bg-prefs-detail / gco:bg-updated.
 */
export function useAmbientAudio(enabled: boolean, volume: number = 0.12) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const volumeRef = useRef(volume)
  const enabledRef = useRef(enabled)

  volumeRef.current = volume
  enabledRef.current = enabled

  const applyVolume = (v: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, v))
    }
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const tryPlay = (audio: HTMLAudioElement) => {
    audio.play().catch(() => {
      /* autoplay bloqueado hasta gesto del usuario */
    })
  }

  // Carga / recarga de pista
  useEffect(() => {
    let cancelled = false
    let unlockHandler: (() => void) | null = null

    if (!enabled) {
      stop()
      return
    }

    ;(async () => {
      try {
        const file = await loadAudioFile()
        if (cancelled) return

        stop()
        if (!file) return

        const url = URL.createObjectURL(file.blob)
        urlRef.current = url

        const audio = new Audio()
        audio.loop = true
        audio.preload = 'auto'
        audio.src = url
        audio.volume = Math.min(1, Math.max(0, volumeRef.current))
        audioRef.current = audio

        tryPlay(audio)

        unlockHandler = () => tryPlay(audio)
        document.addEventListener('pointerdown', unlockHandler, { once: true })
        document.addEventListener('keydown', unlockHandler, { once: true })
      } catch {
        /* IndexedDB no disponible o sin pista */
      }
    })()

    return () => {
      cancelled = true
      if (unlockHandler) {
        document.removeEventListener('pointerdown', unlockHandler)
        document.removeEventListener('keydown', unlockHandler)
      }
      stop()
    }
  }, [enabled])

  // Volumen en caliente (sin recargar el archivo)
  useEffect(() => {
    applyVolume(volume)
  }, [volume])

  // Preferencias externas (ajustes de sonido)
  useEffect(() => {
    const onPrefs = () => {
      const p = getBgPrefs()
      applyVolume(p.volume)
      if (!p.audioEnabled) {
        audioRef.current?.pause()
      } else if (audioRef.current && enabledRef.current) {
        tryPlay(audioRef.current)
      }
    }

    const onPrefsDetail = (e: Event) => {
      const p = (e as CustomEvent<BgPrefs>).detail
      if (!p) return
      applyVolume(p.volume)
      if (!p.audioEnabled) {
        audioRef.current?.pause()
      } else if (audioRef.current) {
        tryPlay(audioRef.current)
      }
    }

    const onUpdated = () => {
      // Fuerza re-evaluación: si hay audio y está enabled, el efecto de enabled
      // no se re-ejecuta solo; recargamos si hace falta
      if (!enabledRef.current) return
      void (async () => {
        try {
          const file = await loadAudioFile()
          if (!file) {
            stop()
            return
          }
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          const url = URL.createObjectURL(file.blob)
          urlRef.current = url
          if (!audioRef.current) {
            const audio = new Audio()
            audio.loop = true
            audio.src = url
            audio.volume = Math.min(1, Math.max(0, volumeRef.current))
            audioRef.current = audio
          } else {
            audioRef.current.src = url
            applyVolume(volumeRef.current)
          }
          tryPlay(audioRef.current)
        } catch {
          /* ignore */
        }
      })()
    }

    window.addEventListener('gco:bg-prefs', onPrefs)
    window.addEventListener('gco:bg-prefs-detail', onPrefsDetail)
    window.addEventListener('gco:bg-updated', onUpdated)

    return () => {
      window.removeEventListener('gco:bg-prefs', onPrefs)
      window.removeEventListener('gco:bg-prefs-detail', onPrefsDetail)
      window.removeEventListener('gco:bg-updated', onUpdated)
    }
  }, [])
}