import { useRef, useState } from 'react'
import {
  getBgPrefs,
  saveBgPrefs,
  saveBackgroundFile,
  clearBackgroundFile,
} from '@/core/storage/customBackground'
import { GlassButton } from '@/components/ui/GlassButton'

export function FondoSettings() {
  const [prefs, setPrefs] = useState(getBgPrefs)
  const fileRef = useRef<HTMLInputElement>(null)

  const persist = (next: typeof prefs) => {
    saveBgPrefs(next)
    setPrefs(next)
    window.dispatchEvent(new Event('gco:bg-prefs'))
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Usa un archivo de imagen (jpg, png, webp…).')
      e.target.value = ''
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Máximo ~8 MB')
      e.target.value = ''
      return
    }

    await saveBackgroundFile(file)
    persist({ ...prefs, enabled: true })
    window.dispatchEvent(new Event('gco:bg-updated'))
    e.target.value = ''
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
      }}
    >
      <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
        Imagen de fondo personalizada. Se guarda en este dispositivo (IndexedDB)
        y no se incluye en la exportación de datos.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <span>Fondo personalizado</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.enabled}
          className="theme-cycle-btn"
          onClick={() => persist({ ...prefs, enabled: !prefs.enabled })}
        >
          {prefs.enabled ? 'On' : 'Off'}
        </button>
      </label>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton type="button" onClick={() => fileRef.current?.click()}>
          Elegir imagen
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={async () => {
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