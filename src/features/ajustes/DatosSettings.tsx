import { useRef } from 'react'
import { exportData, importData } from '@/core/storage/exportImport'
import { GlassButton } from '@/components/ui/GlassButton'

export function DatosSettings() {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
        Exporta nombre, avatar (en el perfil), progreso, tema y preferencias de fondo/sonido.
        El archivo de fondo y la pista de audio permanecen en este dispositivo (IndexedDB).
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton type="button" onClick={exportData}>
          Exportar datos
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => ref.current?.click()}
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
            window.location.reload()
          } catch {
            alert('Backup inválido')
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}