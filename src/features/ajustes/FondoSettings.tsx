import { useRef, useState } from 'react'
import {
  getBgPrefs,
  saveBgPrefs,
  saveBackgroundFile,
  clearBackgroundFile,
} from '@/core/storage/customBackground'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundToggle, soundStart, soundFail } from '@/core/audio/uiSounds'

/**
 * Re-codifica la imagen a JPEG de alta calidad manteniendo
 * hasta ~2560px en el lado largo (mejor resolución en PWA/APK).
 */
async function prepareBackgroundFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('type')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('img'))
      i.src = url
    })
    const maxSide = 2560
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('blob'))),
        'image/jpeg',
        0.92
      )
    })
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', {
      type: 'image/jpeg',
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function FondoSettings() {
  const [prefs, setPrefs] = useState(getBgPrefs)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const persist = (next: typeof prefs) => {
    saveBgPrefs(next)
    setPrefs(next)
    window.dispatchEvent(new Event('gco:bg-prefs'))
    window.dispatchEvent(
      new CustomEvent('gco:bg-prefs-detail', { detail: next })
    )
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      soundFail()
      alert('Usa un archivo de imagen (jpg, png, webp…).')
      e.target.value = ''
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      soundFail()
      alert('Máximo ~25 MB')
      e.target.value = ''
      return
    }
    setBusy(true)
    try {
      soundStart()
      const prepared = await prepareBackgroundFile(file)
      await saveBackgroundFile(prepared)
      persist({ ...prefs, enabled: true })
      window.dispatchEvent(new Event('gco:bg-updated'))
    } catch {
      soundFail()
      alert('No se pudo procesar la imagen.')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1rem, 3vw, 1.35rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
      }}
    >
      <div>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.35rem' }}>
          Fondo personalizado
        </h3>
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
            lineHeight: 1.45,
          }}
        >
          Se guarda en este dispositivo (IndexedDB) a alta resolución (hasta
          2560px). Ideal para pantallas grandes y PWA.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.85rem 1rem',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--gco-glass-border)',
        }}
      >
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Usar imagen</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
            {prefs.enabled ? 'Visible' : 'Oculta'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.enabled}
          onClick={() => {
            const next = !prefs.enabled
            soundToggle(next)
            persist({ ...prefs, enabled: next })
          }}
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: prefs.enabled
              ? 'var(--gco-primary)'
              : 'rgba(255,255,255,0.12)',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: prefs.enabled ? 24 : 3,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            }}
          />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton
          type="button"
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        >
          {busy ? 'Procesando…' : 'Elegir imagen'}
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={async () => {
            soundClick()
            await clearBackgroundFile()
            window.dispatchEvent(new Event('gco:bg-updated'))
          }}
        >
          Quitar imagen
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
    </div>
  )
}