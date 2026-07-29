import { useEffect, useState } from 'react'
import {
  loadBackgroundFile,
  getBgPrefs,
  type BgPrefs,
} from '@/core/storage/customBackground'
import { useAmbientAudio } from '@/hooks/useAmbientAudio'
import { useTheme } from '@/hooks/useTheme'

export function AmbientBackground() {
  const { theme } = useTheme()
  const [prefs, setPrefs] = useState<BgPrefs>(() => getBgPrefs())
  const [url, setUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useAmbientAudio(prefs.audioEnabled, prefs.volume ?? 0.12)

  // Preferencias (volumen, on/off)
  useEffect(() => {
    const onPrefs = () => setPrefs(getBgPrefs())
    window.addEventListener('gco:bg-prefs', onPrefs)
    return () => window.removeEventListener('gco:bg-prefs', onPrefs)
  }, [])

  // Nuevo fondo o nueva pista subida
  useEffect(() => {
    const onUpdate = () => {
      setPrefs(getBgPrefs())
      setReloadToken((n) => n + 1)
    }
    window.addEventListener('gco:bg-updated', onUpdate)
    return () => window.removeEventListener('gco:bg-updated', onUpdate)
  }, [])

  // Cargar media de fondo
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    ;(async () => {
      if (!prefs.enabled) {
        setUrl(null)
        setMediaType('')
        return
      }

      try {
        const data = await loadBackgroundFile()
        if (cancelled) return

        if (!data) {
          setUrl(null)
          setMediaType('')
          return
        }

        objectUrl = URL.createObjectURL(data.blob)
        setMediaType(data.type)
        setUrl(objectUrl)
      } catch {
        if (!cancelled) {
          setUrl(null)
          setMediaType('')
        }
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [prefs.enabled, reloadToken])

  if (!prefs.enabled || !url) {
    return null
  }

  const isVideo = mediaType.startsWith('video/')

  const filterByTheme =
    theme === 'light'
      ? 'brightness(0.88) contrast(0.95) saturate(0.85) blur(2px)'
      : theme === 'rainbow'
        ? 'brightness(0.42) contrast(1.05) saturate(1.35) blur(2.5px)'
        : 'brightness(0.32) contrast(1.1) saturate(0.75) blur(2px)'

  const overlay =
    theme === 'light'
      ? 'rgba(240, 243, 249, 0.55)'
      : theme === 'rainbow'
        ? 'linear-gradient(135deg, rgba(255,142,200,0.25), rgba(26,16,40,0.7), rgba(126,200,255,0.2))'
        : 'rgba(11, 18, 32, 0.72)'

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {isVideo ? (
        <video
          src={url}
          autoPlay
          muted
          loop
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.08)',
            filter: filterByTheme,
          }}
        />
      ) : (
        <img
          src={url}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.08)',
            filter: filterByTheme,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: overlay,
        }}
      />
    </div>
  )
}