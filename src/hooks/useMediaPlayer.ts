import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

/**
 * Reproductor offline profesional con reproducción en segundo plano real.
 *
 * Arquitectura de audio (clave para background):
 *  1. El sonido SIEMPRE sale por el <audio> nativo → los navegadores
 *     (incl. iOS Safari) permiten que siga sonando en pestaña oculta /
 *     pantalla bloqueada si hay Media Session activa.
 *  2. El espectro se obtiene con captureStream() → MediaStreamSource →
 *     AnalyserNode (sin conectar a destination). Así no se “roba” la
 *     salida del elemento y el background no se rompe.
 *  3. Fallback: createMediaElementSource + gain + soft-limiter solo si
 *     captureStream no está disponible (navegadores antiguos). En ese
 *     modo el background puede degradarse en iOS.
 *
 * Media Session vive solo aquí (única fuente de verdad).
 */

export type RepeatMode = 'off' | 'one' | 'all'
export type OutputMode = 'native' | 'webaudio' | 'none'

export type MediaPlayerApi = ReturnType<typeof useMediaPlayer>

type CaptureAudioElement = HTMLAudioElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function useMediaPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const queueRef = useRef<TrackItem[]>([])
  const indexRef = useRef(0)
  /** Evita que una carga antigua pise una más reciente (doble clic, skip rápido). */
  const loadGenRef = useRef(0)

  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const graphReady = useRef(false)
  const outputModeRef = useRef<OutputMode>('none')
  const mediaSessionReady = useRef(false)

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [volume, setVolumeState] = useState(1)
  const [rate, setRateState] = useState(1)
  /** 0–3. En modo nativo solo afecta hasta ×1 en volumen real; el resto refuerza el espectro. */
  const [gain, setGainState] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [outputMode, setOutputMode] = useState<OutputMode>('none')

  // Refs espejo para Media Session (handlers registrados una sola vez).
  const toggleRef = useRef<() => Promise<void>>(async () => {})
  const nextRef = useRef<() => Promise<void>>(async () => {})
  const prevRef = useRef<() => Promise<void>>(async () => {})
  const seekRef = useRef<(ms: number) => void>(() => {})
  const onEndedRef = useRef<() => Promise<void>>(async () => {})
  const playingRef = useRef(false)
  const volumeRef = useRef(volume)
  const gainRefState = useRef(gain)
  const rateRef = useRef(rate)

  playingRef.current = playing
  volumeRef.current = volume
  gainRefState.current = gain
  rateRef.current = rate

  const cleanupUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const applyElementVolume = (audio: HTMLAudioElement) => {
    // En salida nativa el hardware no amplifica > 1; gain extra va al visualizador.
    const v = volumeRef.current
    const g = gainRefState.current
    if (outputModeRef.current === 'webaudio') {
      audio.volume = clamp(v, 0, 1)
      if (gainRef.current && ctxRef.current) {
        const t = ctxRef.current.currentTime
        const node = gainRef.current
        node.gain.cancelScheduledValues(t)
        node.gain.setValueAtTime(node.gain.value, t)
        node.gain.linearRampToValueAtTime(clamp(g, 0, 3), t + 0.04)
      }
    } else {
      audio.volume = clamp(v * clamp(g, 0, 1), 0, 1)
    }
  }

  const ensureAudioContext = () => {
    if (ctxRef.current) return ctxRef.current
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctxRef.current = new AC({ latencyHint: 'playback' })
    return ctxRef.current
  }

  /**
   * Grafo de análisis / boost.
   * Preferencia: captureStream (salida nativa intacta → background OK).
   * Fallback: MediaElementSource (boost real, background menos fiable en iOS).
   */
  const ensureGraph = (audio: HTMLAudioElement) => {
    try {
      const ctx = ensureAudioContext()
      if (ctx.state === 'suspended') void ctx.resume()

      if (!analyserRef.current) {
        const an = ctx.createAnalyser()
        an.fftSize = 512
        an.smoothingTimeConstant = 0.75
        an.minDecibels = -90
        an.maxDecibels = -10
        analyserRef.current = an
      }

      if (graphReady.current) {
        applyElementVolume(audio)
        return
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
          streamSourceRef.current = ctx.createMediaStreamSource(stream)
          streamSourceRef.current.connect(analyserRef.current)
          // No conectar a destination: el <audio> sigue yendo a altavoces.
          outputModeRef.current = 'native'
          setOutputMode('native')
          graphReady.current = true
          applyElementVolume(audio)
          return
        } catch {
          /* captura no disponible o bloqueada → fallback */
        }
      }

      // ── Fallback Web Audio completo (puede limitar background en iOS) ──
      if (!gainRef.current) {
        const g = ctx.createGain()
        g.gain.value = clamp(gainRefState.current, 0, 3)
        gainRef.current = g
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
        mediaSourceRef.current.connect(gainRef.current)
        gainRef.current.connect(compRef.current)
        compRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
      }
      outputModeRef.current = 'webaudio'
      setOutputMode('webaudio')
      graphReady.current = true
      applyElementVolume(audio)
    } catch {
      graphReady.current = false
      outputModeRef.current = 'none'
      setOutputMode('none')
    }
  }

  /** Reanuda AudioContext + <audio> al volver de segundo plano. */
  const resumeAudioContext = useCallback(async () => {
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        /* gesto de usuario requerido en algunos motores */
      }
    }
    const audio = audioRef.current
    if (audio && audio.src && audio.paused && playingRef.current) {
      try {
        await audio.play()
      } catch {
        /* autoplay policy */
      }
    }
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resumeAudioContext()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    // iOS a veces congela la página; al descongelar reanudamos.
    const onResume = () => void resumeAudioContext()
    window.addEventListener('resume', onResume as EventListener)
    document.addEventListener('freeze', () => {}, { passive: true })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('resume', onResume as EventListener)
    }
  }, [resumeAudioContext])

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
      /* acciones no soportadas se ignoran */
    }
  }

  const ensureAudio = () => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.crossOrigin = 'anonymous'
      a.setAttribute('playsinline', 'true')
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
        setCurrentMs(ms)
        updatePositionState(a.duration ? a.duration * 1000 : 0, ms, rateRef.current)
      }
      a.onloadedmetadata = () => {
        setDurationMs((a.duration || 0) * 1000)
      }
      a.ondurationchange = () => {
        if (a.duration && Number.isFinite(a.duration)) {
          setDurationMs(a.duration * 1000)
        }
      }
      a.onplay = () => {
        setPlaying(true)
        playingRef.current = true
        setMediaSessionPlaybackState('playing')
      }
      a.onplaying = () => {
        setPlaying(true)
        playingRef.current = true
        setMediaSessionPlaybackState('playing')
        void resumeAudioContext()
      }
      a.onpause = () => {
        // No forzar paused si el navegador pausó por suspensión breve;
        // solo reflejamos el estado real del elemento.
        setPlaying(false)
        playingRef.current = false
        setMediaSessionPlaybackState('paused')
      }
      a.onended = () => {
        void onEndedRef.current()
      }
      a.onerror = () => {
        setError('No se pudo decodificar el archivo de audio.')
        setPlaying(false)
        playingRef.current = false
        // Auto-avanzar si hay cola (evita quedarse bloqueado en un archivo malo).
        window.setTimeout(() => {
          void nextRef.current()
        }, 400)
      }
      a.onstalled = () => {
        /* blob local: raro; no paramos la UI */
      }
      a.onwaiting = () => {
        /* buffering */
      }

      audioRef.current = a
      ensureGraph(a)
      ensureMediaSessionHandlers()
    }
    return audioRef.current
  }

  const resolveBlob = async (blobKey: string): Promise<Blob | null> => {
    const raw = await getTrackBlob(blobKey)
    if (!raw) return null
    if (raw instanceof Blob) return raw
    if (typeof raw === 'object' && raw !== null && 'blob' in raw) {
      return (raw as { blob: Blob }).blob
    }
    return null
  }

  const loadTrack = useCallback(async (t: TrackItem) => {
    const gen = ++loadGenRef.current
    setError(null)
    const media = await resolveBlob(t.blobKey)
    if (gen !== loadGenRef.current) return
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
    audio.playbackRate = rateRef.current
    try {
      audio.preservesPitch = true
    } catch {
      /* */
    }
    applyElementVolume(audio)

    setTrack(t)
    setCurrentMs(0)
    setDurationMs(t.durationMs || 0)
    updateMediaSessionMetadata(t)

    await new Promise<void>((resolve) => {
      if (gen !== loadGenRef.current) {
        resolve()
        return
      }
      const onMeta = () => {
        if (gen === loadGenRef.current) {
          setDurationMs((audio.duration || 0) * 1000)
        }
        audio.removeEventListener('loadedmetadata', onMeta)
        resolve()
      }
      if (audio.readyState >= 1) onMeta()
      else audio.addEventListener('loadedmetadata', onMeta)
    })
  }, [])

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
        playingRef.current = true
        setError(null)
      } catch (e) {
        setPlaying(false)
        playingRef.current = false
        const msg = e instanceof Error ? e.message : String(e)
        if (/NotAllowedError|interact/i.test(msg)) {
          setError('Pulsa ▶ para iniciar la reproducción (política del navegador).')
        } else {
          setError('No se pudo iniciar la reproducción.')
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
        playingRef.current = true
        setError(null)
      } catch {
        setPlaying(false)
        playingRef.current = false
      }
    } else {
      audio.pause()
      setPlaying(false)
      playingRef.current = false
    }
  }, [playTrack])

  const seek = useCallback((ms: number) => {
    const audio = ensureAudio()
    const d = audio.duration || 0
    const t = Math.max(0, d ? Math.min(d, ms / 1000) : ms / 1000)
    audio.currentTime = t
    setCurrentMs(t * 1000)
    updatePositionState(d * 1000, t * 1000, rateRef.current)
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
      updatePositionState((audio.duration || 0) * 1000, 0, rateRef.current)
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
        setPlaying(true)
        playingRef.current = true
      } catch {
        setPlaying(false)
        playingRef.current = false
      }
      return
    }
    if (repeat === 'all' || indexRef.current < queueRef.current.length - 1) {
      await next()
    } else {
      setPlaying(false)
      playingRef.current = false
      setMediaSessionPlaybackState('paused')
    }
  }, [next, repeat])

  onEndedRef.current = onEnded
  toggleRef.current = toggle
  nextRef.current = next
  prevRef.current = prev
  seekRef.current = seek

  const setVolume = useCallback((v: number) => {
    const val = clamp(v, 0, 1)
    setVolumeState(val)
    volumeRef.current = val
    const audio = audioRef.current
    if (audio) applyElementVolume(audio)
  }, [])

  /** 0–3. En modo nativo el volumen real se satura en 1; el exceso refuerza getFrequencyData. */
  const setGain = useCallback((g: number) => {
    const val = clamp(g, 0, 3)
    setGainState(val)
    gainRefState.current = val
    const audio = audioRef.current
    if (audio) applyElementVolume(audio)
  }, [])

  const setPlaybackRate = useCallback((r: number) => {
    const val = clamp(r, 0.5, 2)
    setRateState(val)
    rateRef.current = val
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
  }, [])

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
    // En modo nativo, gain > 1 no sube el altavoz; refuerza el espectro para el UI.
    if (outputModeRef.current === 'native' && gainRefState.current > 1) {
      const boost = gainRefState.current
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.min(255, Math.round(buf[i] * boost))
      }
    }
    return buf
  }, [])

  const getQueue = useCallback(() => [...queueRef.current], [])

  const getIndex = useCallback(() => indexRef.current, [])

  const setQueue = useCallback((q: TrackItem[]) => {
    queueRef.current = q
    if (!q.length) {
      indexRef.current = 0
      return
    }
    const curId = track?.id
    if (curId) {
      const i = q.findIndex((x) => x.id === curId)
      indexRef.current = i >= 0 ? i : clamp(indexRef.current, 0, q.length - 1)
    } else {
      indexRef.current = clamp(indexRef.current, 0, q.length - 1)
    }
  }, [track?.id])

  // Cleanup
  useEffect(
    () => () => {
      audioRef.current?.pause()
      cleanupUrl()
      try {
        mediaSourceRef.current?.disconnect()
        streamSourceRef.current?.disconnect()
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
      mediaSourceRef.current = null
      streamSourceRef.current = null
      gainRef.current = null
      compRef.current = null
      analyserRef.current = null
      outputModeRef.current = 'none'
      try {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
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
              /* */
            }
          }
          navigator.mediaSession.metadata = null
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
    setQueue,
    getQueue,
    getIndex,
    getFrequencyData,
    resumeAudioContext,
    error,
    /** 'native' = background fiable; 'webaudio' = fallback con boost real. */
    outputMode,
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

function setMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* */
  }
}

function updatePositionState(durationMs: number, positionMs: number, playbackRate = 1) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession as MediaSession & {
    setPositionState?: (state: {
      duration: number
      playbackRate: number
      position: number
    }) => void
  }
  if (!ms.setPositionState || !durationMs || !Number.isFinite(durationMs)) return
  try {
    const duration = durationMs / 1000
    const position = clamp(positionMs, 0, durationMs) / 1000
    ms.setPositionState({
      duration,
      playbackRate: playbackRate || 1,
      position: Math.min(position, duration),
    })
  } catch {
    /* */
  }
}