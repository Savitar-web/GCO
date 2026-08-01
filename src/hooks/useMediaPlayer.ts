import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrackBlob, type TrackItem } from '@/core/storage/mediaLibrary'

export function useMediaPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const queueRef = useRef<TrackItem[]>([])
  const indexRef = useRef(0)

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'one' | 'all'>('off')

  const cleanupUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const ensureAudio = () => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.onended = () => {
        void onEnded()
      }
      a.ontimeupdate = () => {
        setCurrentMs((a.currentTime || 0) * 1000)
      }
      a.onloadedmetadata = () => {
        setDurationMs((a.duration || 0) * 1000)
      }
      a.onplay = () => setPlaying(true)
      a.onpause = () => setPlaying(false)
      audioRef.current = a
    }
    return audioRef.current
  }

  const loadTrack = useCallback(async (t: TrackItem) => {
    const blob = await getTrackBlob(t.blobKey)
    if (!blob) return
    const audio = ensureAudio()
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
      const i = Math.floor(Math.random() * q.length)
      await playIndex(i)
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

  useEffect(() => {
    const a = audioRef.current
    if (a) a.onended = () => {
      void onEnded()
    }
  }, [onEnded])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      cleanupUrl()
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
    playTrack,
    toggle,
    seek,
    next,
    prev,
    setQueue: (q: TrackItem[]) => {
      queueRef.current = q
    },
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