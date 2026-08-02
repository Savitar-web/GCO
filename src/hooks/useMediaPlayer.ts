import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

export function useMediaPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const queueRef = useRef<TrackItem[]>([])
  const indexRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'one' | 'all'>('off')
  const [volume, setVolumeState] = useState(1)
  const [rate, setRateState] = useState(1)

  const cleanupUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const ensureGraph = (audio: HTMLAudioElement) => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext()
      }
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      if (!analyserRef.current) {
        const an = ctx.createAnalyser()
        an.fftSize = 256
        an.smoothingTimeConstant = 0.75
        analyserRef.current = an
      }
      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audio)
        sourceRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
      }
    } catch {
      /* ya conectado o no soportado */
    }
  }

  const ensureAudio = () => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.crossOrigin = 'anonymous'
      a.ontimeupdate = () => setCurrentMs((a.currentTime || 0) * 1000)
      a.onloadedmetadata = () => setDurationMs((a.duration || 0) * 1000)
      a.onplay = () => setPlaying(true)
      a.onpause = () => setPlaying(false)
      a.onended = () => {
        void onEndedRef.current()
      }
      audioRef.current = a
      ensureGraph(a)
    }
    return audioRef.current
  }

  const onEndedRef = useRef<() => Promise<void>>(async () => {})

  const loadTrack = useCallback(async (t: TrackItem) => {
    const blob = await getTrackBlob(t.blobKey)
    if (!blob) return
    const audio = ensureAudio()
    ensureGraph(audio)
    cleanupUrl()
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    audio.src = url
    setTrack(t)
    setCurrentMs(0)
    setDurationMs(t.durationMs || 0)
    updateMediaSession(t)
  }, [])

  const playTrack = useCallback(
    async (t: TrackItem, queue?: TrackItem[]) => {
      if (queue) {
        queueRef.current = queue
        indexRef.current = Math.max(
          0,
          queue.findIndex((x) => x.id === t.id)
        )
      }
      await loadTrack(t)
      const audio = ensureAudio()
      if (ctxRef.current?.state === 'suspended') {
        await ctxRef.current.resume()
      }
      try {
        await audio.play()
      } catch {
        /* autoplay */
      }
    },
    [loadTrack]
  )

  const toggle = useCallback(async () => {
    const audio = ensureAudio()
    if (!audio.src) return
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        /* */
      }
    } else {
      audio.pause()
    }
  }, [])

  const seek = useCallback((ms: number) => {
    const audio = ensureAudio()
    audio.currentTime = Math.max(0, ms / 1000)
    setCurrentMs(ms)
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
    if (shuffle) {
      await playIndex(Math.floor(Math.random() * q.length))
      return
    }
    await playIndex(indexRef.current + 1)
  }, [playIndex, shuffle])

  const prev = useCallback(async () => {
    const audio = ensureAudio()
    if (audio.currentTime > 3) {
      audio.currentTime = 0
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

  const setVolume = useCallback((v: number) => {
    const val = Math.min(1, Math.max(0, v))
    const audio = ensureAudio()
    audio.volume = val
    setVolumeState(val)
  }, [])

  const setPlaybackRate = useCallback((r: number) => {
    const val = Math.min(2, Math.max(0.5, r))
    const audio = ensureAudio()
    audio.playbackRate = val
    setRateState(val)
  }, [])

  /** Datos de frecuencia 0–255 para el espectro */
  const getFrequencyData = useCallback((): Uint8Array | null => {
    const an = analyserRef.current
    if (!an) return null
    const buf = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(buf)
    return buf
  }, [])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      cleanupUrl()
      void ctxRef.current?.close()
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
    rate,
    setPlaybackRate,
    playTrack,
    toggle,
    seek,
    next,
    prev,
    setQueue: (q: TrackItem[]) => {
      queueRef.current = q
    },
    getFrequencyData,
  }
}

function updateMediaSession(t: TrackItem) {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      artwork: t.coverDataUrl
        ? [{ src: t.coverDataUrl, sizes: '512x512', type: 'image/png' }]
        : [],
    })
  } catch {
    /* */
  }
}

export type MediaPlayerApi = ReturnType<typeof useMediaPlayer>