import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

/**
 * Reproductor offline con grafo Web Audio (gain boost + soft limiter + analyser)
 * y soporte robusto de reproducción en segundo plano:
 *  - Media Session API centralizada aquí (única fuente de verdad: play, pause,
 *    previoustrack, nexttrack, seekbackward, seekforward, seekto, setPositionState).
 *  - resumeAudioContext(): reintenta reanudar el AudioContext cuando el navegador
 *    lo suspende al volver de segundo plano (pestaña oculta, app minimizada, etc.).
 *  - insertNext, error, preservesPitch, ramp de gain, soft limiter al boostear volumen.
 */
export function useMediaPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const queueRef = useRef<TrackItem[]>([])
  const indexRef = useRef(0)

  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const graphReady = useRef(false)
  const mediaSessionReady = useRef(false)

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'one' | 'all'>('off')
  const [volume, setVolumeState] = useState(1)
  const [rate, setRateState] = useState(1)
  const [gain, setGainState] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Refs "espejo" para que los handlers de Media Session (registrados una sola vez)
  // siempre llamen a la versión más reciente de toggle/next/prev/seek sin clausuras obsoletas.
  const toggleRef = useRef<() => Promise<void>>(async () => {})
  const nextRef = useRef<() => Promise<void>>(async () => {})
  const prevRef = useRef<() => Promise<void>>(async () => {})
  const seekRef = useRef<(ms: number) => void>(() => {})

  const cleanupUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const ensureGraph = (audio: HTMLAudioElement) => {
    try {
      if (!ctxRef.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        ctxRef.current = new AC({ latencyHint: 'playback' })
      }
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') void ctx.resume()

      if (!graphReady.current) {
        if (!gainRef.current) {
          const g = ctx.createGain()
          g.gain.value = 1
          gainRef.current = g
        }

        // Soft limiter: evita distorsión con boost > 100 %
        if (!compRef.current) {
          const c = ctx.createDynamicsCompressor()
          c.threshold.value = -6
          c.knee.value = 12
          c.ratio.value = 4
          c.attack.value = 0.003
          c.release.value = 0.18
          compRef.current = c
        }

        if (!analyserRef.current) {
          const an = ctx.createAnalyser()
          an.fftSize = 512
          an.smoothingTimeConstant = 0.75
          an.minDecibels = -90
          an.maxDecibels = -10
          analyserRef.current = an
        }

        // source → gain → compressor → analyser → destination (solo una vez)
        if (!sourceRef.current) {
          sourceRef.current = ctx.createMediaElementSource(audio)
          sourceRef.current.connect(gainRef.current)
          gainRef.current.connect(compRef.current)
          compRef.current.connect(analyserRef.current)
          analyserRef.current.connect(ctx.destination)
        }

        graphReady.current = true
      }

      // Con grafo activo el elemento sigue respetando volume (0–1);
      // el boost extra (0–3) va solo por GainNode.
      audio.volume = volume
    } catch {
      /* ya conectado o no soportado — el elemento sigue sonando solo */
      graphReady.current = false
    }
  }

  /**
   * Reintenta reanudar el AudioContext (y, si estaba sonando, el <audio>) cuando
   * el navegador lo suspende al volver de segundo plano. Seguro de llamar en
   * cualquier momento — no hace nada si ya está activo o no hay pista cargada.
   */
  const resumeAudioContext = useCallback(async () => {
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        /* algunos navegadores exigen un gesto del usuario; se reintentará luego */
      }
    }
    const audio = audioRef.current
    if (audio && audio.src && audio.paused && playing) {
      try {
        await audio.play()
      } catch {
        /* política de autoplay del navegador: el usuario deberá tocar ▶ una vez */
      }
    }
  }, [playing])

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') void resumeAudioContext()
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    window.addEventListener('pageshow', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
      window.removeEventListener('pageshow', handler)
    }
  }, [resumeAudioContext])

  const ensureAudio = () => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.crossOrigin = 'anonymous'
      try {
        a.preservesPitch = true
      } catch {
        /* Safari antiguo */
      }
      a.volume = volume
      a.ontimeupdate = () => {
        const ms = (a.currentTime || 0) * 1000
        setCurrentMs(ms)
        updatePositionState(a.duration ? a.duration * 1000 : 0, ms)
      }
      a.onloadedmetadata = () => setDurationMs((a.duration || 0) * 1000)
      a.onplay = () => {
        setPlaying(true)
        setMediaSessionPlaybackState('playing')
      }
      a.onpause = () => {
        setPlaying(false)
        setMediaSessionPlaybackState('paused')
      }
      a.onended = () => {
        void onEndedRef.current()
      }
      a.onerror = () => {
        setError('No se pudo decodificar el archivo de audio.')
        setPlaying(false)
      }
      audioRef.current = a
      ensureGraph(a)
      ensureMediaSessionHandlers()
    }
    return audioRef.current
  }

  /** Registra los handlers de Media Session una sola vez; siempre delegan en los refs "espejo". */
  const ensureMediaSessionHandlers = () => {
    if (mediaSessionReady.current) return
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => void toggleRef.current())
      navigator.mediaSession.setActionHandler('pause', () => void toggleRef.current())
      navigator.mediaSession.setActionHandler('previoustrack', () => void prevRef.current())
      navigator.mediaSession.setActionHandler('nexttrack', () => void nextRef.current())
      navigator.mediaSession.setActionHandler('stop', () => void toggleRef.current())
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const audio = audioRef.current
        if (!audio) return
        seekRef.current(Math.max(0, audio.currentTime * 1000 - (d.seekOffset ?? 10) * 1000))
      })
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const audio = audioRef.current
        if (!audio) return
        seekRef.current(audio.currentTime * 1000 + (d.seekOffset ?? 10) * 1000)
      })
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) seekRef.current(d.seekTime * 1000)
      })
      mediaSessionReady.current = true
    } catch {
      /* alguna acción puede no estar soportada; las que sí lo están quedan registradas */
    }
  }

  const onEndedRef = useRef<() => Promise<void>>(async () => {})

  /** Admite Blob directo o { blob } según implementación de getTrackBlob */
  const resolveBlob = async (blobKey: string): Promise<Blob | null> => {
    const raw = await getTrackBlob(blobKey)
    if (!raw) return null
    if (raw instanceof Blob) return raw
    if (typeof raw === 'object' && raw !== null && 'blob' in raw) {
      return (raw as { blob: Blob }).blob
    }
    return null
  }

  const loadTrack = useCallback(
    async (t: TrackItem) => {
      setError(null)
      const media = await resolveBlob(t.blobKey)
      if (!media) {
        setError('Archivo no encontrado en la biblioteca offline.')
        return
      }
      const audio = ensureAudio()
      ensureGraph(audio)
      cleanupUrl()
      const url = URL.createObjectURL(media)
      urlRef.current = url
      audio.src = url
      audio.playbackRate = rate
      audio.volume = volume
      if (gainRef.current) {
        gainRef.current.gain.value = gain
      }
      setTrack(t)
      setCurrentMs(0)
      setDurationMs(t.durationMs || 0)
      updateMediaSessionMetadata(t)

      await new Promise<void>((resolve) => {
        const onMeta = () => {
          setDurationMs((audio.duration || 0) * 1000)
          audio.removeEventListener('loadedmetadata', onMeta)
          resolve()
        }
        if (audio.readyState >= 1) onMeta()
        else audio.addEventListener('loadedmetadata', onMeta)
      })
    },
    [volume, rate, gain]
  )

  const playTrack = useCallback(
    async (t: TrackItem, queue?: TrackItem[]) => {
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
      if (ctxRef.current?.state === 'suspended') {
        try {
          await ctxRef.current.resume()
        } catch {
          /* */
        }
      }
      try {
        await audio.play()
        setPlaying(true)
        setError(null)
      } catch (e) {
        setPlaying(false)
        const msg = e instanceof Error ? e.message : String(e)
        if (/NotAllowedError|interact/i.test(msg)) {
          setError('Pulsa ▶ para iniciar la reproducción (política del navegador).')
        }
      }
    },
    [loadTrack]
  )

  const toggle = useCallback(async () => {
    const audio = ensureAudio()
    ensureGraph(audio)
    if (ctxRef.current?.state === 'suspended') {
      try {
        await ctxRef.current.resume()
      } catch {
        /* */
      }
    }
    if (!audio.src) {
      if (queueRef.current.length) {
        await playTrack(queueRef.current[indexRef.current] ?? queueRef.current[0])
      }
      return
    }
    if (audio.paused) {
      try {
        await audio.play()
        setPlaying(true)
        setError(null)
      } catch {
        setPlaying(false)
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }, [playTrack])

  const seek = useCallback((ms: number) => {
    const audio = ensureAudio()
    const d = audio.duration || 0
    const t = Math.max(0, d ? Math.min(d, ms / 1000) : ms / 1000)
    audio.currentTime = t
    setCurrentMs(t * 1000)
    updatePositionState(d * 1000, t * 1000)
  }, [])

  const playIndex = useCallback(
    async (i: number) => {
      const q = queueRef.current
      if (!q.length) return
      const idx = ((i % q.length) + q.length) % q.length
      indexRef.current = idx
      await playTrack(q[idx])
    },
    [playTrack]
  )

  const next = useCallback(async () => {
    const q = queueRef.current
    if (!q.length) return
    if (shuffle && q.length > 1) {
      let n = Math.floor(Math.random() * q.length)
      if (n === indexRef.current) n = (n + 1) % q.length
      await playIndex(n)
      return
    }
    await playIndex(indexRef.current + 1)
  }, [playIndex, shuffle])

  const prev = useCallback(async () => {
    const audio = ensureAudio()
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      setCurrentMs(0)
      return
    }
    await playIndex(indexRef.current - 1)
  }, [playIndex])

  const onEnded = useCallback(async () => {
    if (repeat === 'one') {
      const audio = ensureAudio()
      audio.currentTime = 0
      try {
        await audio.play()
      } catch {
        /* */
      }
      return
    }
    if (repeat === 'all' || indexRef.current < queueRef.current.length - 1) {
      await next()
    } else {
      setPlaying(false)
    }
  }, [next, repeat])

  onEndedRef.current = onEnded
  toggleRef.current = toggle
  nextRef.current = next
  prevRef.current = prev
  seekRef.current = seek

  const setVolume = useCallback((v: number) => {
    const val = Math.min(1, Math.max(0, v))
    setVolumeState(val)
    const audio = audioRef.current
    if (audio) audio.volume = val
  }, [])

  /** 0–3 → hasta 300 % de ganancia real (GainNode + soft limiter) */
  const setGain = useCallback((g: number) => {
    const val = Math.min(3, Math.max(0, g))
    setGainState(val)
    const node = gainRef.current
    const ctx = ctxRef.current
    if (node && ctx) {
      const t = ctx.currentTime
      node.gain.cancelScheduledValues(t)
      node.gain.setValueAtTime(node.gain.value, t)
      node.gain.linearRampToValueAtTime(val, t + 0.05)
    } else if (node) {
      node.gain.value = val
    }
  }, [])

  const setPlaybackRate = useCallback((r: number) => {
    const val = Math.min(2, Math.max(0.5, r))
    setRateState(val)
    const audio = audioRef.current
    if (audio) {
      audio.playbackRate = val
      try {
        audio.preservesPitch = true
      } catch {
        /* */
      }
    }
  }, [])

  /** Inserta pista justo después de la actual (MusicaHome → "Reproducir a continuación") */
  const insertNext = useCallback((t: TrackItem) => {
    const q = [...queueRef.current]
    const i = indexRef.current
    const without = q.filter((x) => x.id !== t.id)
    const at = without.findIndex((x) => x.id === queueRef.current[i]?.id)
    const pos = at >= 0 ? at + 1 : without.length
    without.splice(pos, 0, t)
    queueRef.current = without
  }, [])

  const getFrequencyData = useCallback((): Uint8Array | null => {
    const an = analyserRef.current
    if (!an) return null
    const buf = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(buf)
    return buf
  }, [])

  const getQueue = useCallback(() => [...queueRef.current], [])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      cleanupUrl()
      try {
        sourceRef.current?.disconnect()
        gainRef.current?.disconnect()
        compRef.current?.disconnect()
        analyserRef.current?.disconnect()
      } catch {
        /* */
      }
      void ctxRef.current?.close()
      ctxRef.current = null
      graphReady.current = false
      mediaSessionReady.current = false
      sourceRef.current = null
      gainRef.current = null
      compRef.current = null
      analyserRef.current = null
      try {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', null)
          navigator.mediaSession.setActionHandler('pause', null)
          navigator.mediaSession.setActionHandler('previoustrack', null)
          navigator.mediaSession.setActionHandler('nexttrack', null)
          navigator.mediaSession.setActionHandler('stop', null)
          navigator.mediaSession.setActionHandler('seekbackward', null)
          navigator.mediaSession.setActionHandler('seekforward', null)
          navigator.mediaSession.setActionHandler('seekto', null)
        }
      } catch {
        /* */
      }
    },
    []
  )

  return {
    track,
    playing,
    currentMs,
    durationMs,
    shuffle,
    setShuffle,
    repeat,
    setRepeat,
    volume,
    setVolume,
    gain,
    setGain,
    rate,
    setPlaybackRate,
    playTrack,
    toggle,
    seek,
    next,
    prev,
    insertNext,
    setQueue: (q: TrackItem[]) => {
      queueRef.current = q
    },
    getQueue,
    getFrequencyData,
    /** Reintenta reanudar audio/contexto tras volver de segundo plano. Seguro de llamar siempre. */
    resumeAudioContext,
    error,
  }
}

function updateMediaSessionMetadata(t: TrackItem) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album || '',
      artwork: t.coverDataUrl
        ? [
            { src: t.coverDataUrl, sizes: '256x256', type: 'image/png' },
            { src: t.coverDataUrl, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    })
  } catch {
    /* */
  }
}

function setMediaSessionPlaybackState(state: 'playing' | 'paused') {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* */
  }
}

function updatePositionState(durationMs: number, positionMs: number) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession as MediaSession & {
    setPositionState?: (state: { duration: number; playbackRate: number; position: number }) => void
  }
  if (!ms.setPositionState || !durationMs) return
  try {
    ms.setPositionState({
      duration: durationMs / 1000,
      playbackRate: 1,
      position: Math.min(positionMs, durationMs) / 1000,
    })
  } catch {
    /* algunos navegadores exigen que position ≤ duration exactamente; se ignora si falla */
  }
}

export type MediaPlayerApi = ReturnType<typeof useMediaPlayer>