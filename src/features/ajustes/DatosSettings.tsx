import { useRef } from 'react'
import { exportData, importData } from '@/core/storage/exportImport'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'

export function DatosSettings() {
  const ref = useRef<HTMLInputElement>(null)

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
          Copia de seguridad
        </h3>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
          Exporta nombre, avatar, progreso, tema y preferencias de fondo/sonido.
          El archivo de fondo y la pista de audio se quedan en este dispositivo (IndexedDB).
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton
          type="button"
          onClick={() => {
            soundClick()
            exportData()
            soundSuccess()
          }}
        >
          Exportar datos
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            ref.current?.click()
          }}
        >
          Importar datos
        </button>
      </div>

      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            await importData(f)
            soundSuccess()
            window.location.reload()
          } catch {
            soundFail()
            alert('Backup inválido')
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}