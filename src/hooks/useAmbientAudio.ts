import { useEffect, useRef } from 'react'
import { loadAudioFile } from '@/core/storage/customBackground'

/**
 * Reproduce la pista ambiental guardada en IndexedDB (bucle + volumen bajo).
 * Si no hay archivo, no hace nada (silencio).
 */
export function useAmbientAudio(enabled: boolean, volume: number = 0.12) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const stop = () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }

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

        const audio = new Audio(url)
        audio.loop = true
        audio.volume = Math.min(1, Math.max(0, volume))
        audioRef.current = audio

        const tryPlay = () => {
          audio.play().catch(() => {
            /* autoplay bloqueado hasta un gesto del usuario */
          })
        }

        tryPlay()
        document.addEventListener('pointerdown', tryPlay, { once: true })
      } catch {
        /* IndexedDB no disponible o sin pista */
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled, volume])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume))
    }
  }, [volume])
}