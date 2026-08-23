/**
 * BackupModal — Copia de seguridad profesional (web / PWA / APK / Electron)
 * Modal propio (no window.confirm). Estilo alineado con PerfilSettings.
 */
import { useCallback, useState } from 'react'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import {
  EXPORT_USER_NOTICE,
  exportData,
  pickAndImportData,
  type BackupMode,
  type ExportResult,
  type ImportResult,
} from '@/core/storage/exportImport'

type Phase = 'menu' | 'export-choose' | 'working' | 'done' | 'error'

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 220,
  background: 'var(--gco-overlay, rgba(0,0,0,0.72))',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  display: 'grid',
  placeItems: 'center',
  padding: 'max(12px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))',
}

const panelStyle: React.CSSProperties = {
  width: 'min(460px, 100%)',
  padding: '1.35rem 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  maxHeight: '92dvh',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Cerrar"
      onClick={() => {
        soundClick()
        onClick()
      }}
      style={{ width: 36, height: 36, flexShrink: 0 }}
    >
      ✕
    </button>
  )
}

export function BackupModal({
  open,
  onClose,
  /** Si true, arranca en “Importar” (útil desde Onboarding). */
  initialPhase = 'menu',
}: {
  open: boolean
  onClose: () => void
  initialPhase?: Phase
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState('')

  const reset = () => {
    setPhase(initialPhase)
    setMessage('')
    setDetail('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const runExport = useCallback(async (mode: BackupMode) => {
    setPhase('working')
    setMessage(mode === 'full' ? 'Generando respaldo completo…' : 'Generando respaldo ligero…')
    setDetail(
      mode === 'full'
        ? 'Puede tardar y ocupar mucho. En APK se abrirá el menú para guardar o compartir.'
        : 'Solo metadatos y preferencias. En APK se abrirá el menú para guardar o compartir.'
    )
    try {
      const res: ExportResult = await exportData({ mode, preferSavePicker: true })
      if (!res.save.ok && res.save.error === 'cancelled') {
        setPhase('export-choose')
        return
      }
      if (!res.save.ok) {
        soundFail()
        setPhase('error')
        setMessage('No se pudo guardar el archivo')
        setDetail(
          `${res.save.error || 'Error desconocido'}\nMétodo intentado: ${res.save.method}`
        )
        return
      }
      soundSuccess()
      setPhase('done')
      setMessage('Respaldo listo')
      setDetail(
        [
          `Modo: ${res.payload.mode === 'full' ? 'Completo' : 'Ligero'}`,
          `Método: ${res.save.method}`,
          `Archivo: ${res.save.fileName}`,
          res.save.pathOrUri ? `Ubicación: ${res.save.pathOrUri}` : '',
          `Pistas: ${res.payload.music.tracks.length}`,
          `Listas: ${res.payload.music.playlists.length}`,
          `Libros: ${res.payload.nutrition.books.length}`,
          `Carpetas: ${res.payload.nutrition.folders.length}`,
          `Claves de ajustes: ${Object.keys(res.payload.localStorage).length}`,
        ]
          .filter(Boolean)
          .join('\n')
      )
    } catch (e) {
      soundFail()
      setPhase('error')
      setMessage('Error al exportar')
      setDetail(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const runImport = useCallback(async () => {
    setPhase('working')
    setMessage('Elige el archivo JSON…')
    setDetail('Selecciona un respaldo GCO (.json). En Android usa el administrador de archivos.')
    try {
      const res: ImportResult = await pickAndImportData({
        merge: true,
        relinkMedia: true,
      })
      if (res.errors.includes('cancelled')) {
        setPhase(initialPhase === 'menu' ? 'menu' : 'menu')
        setPhase('menu')
        return
      }
      if (!res.ok && res.errors.length) {
        soundFail()
        setPhase('error')
        setMessage('Importación con errores')
        setDetail([...res.errors, ...res.warnings].slice(0, 12).join('\n'))
        return
      }
      soundSuccess()
      setPhase('done')
      setMessage('Datos restaurados')
      setDetail(
        [
          `Versión del respaldo: v${res.version}`,
          `Ajustes restaurados: ${res.restoredKeys.length}`,
          `Pistas actualizadas: ${res.musicTracks}`,
          `Listas: ${res.playlists}`,
          `Libros: ${res.books}`,
          `Carpetas: ${res.folders}`,
          `Audios embebidos: ${res.embeddedRestored}`,
          res.warnings.length
            ? `\nAvisos:\n${res.warnings.slice(0, 6).join('\n')}`
            : '',
        ].join('\n')
      )
    } catch (e) {
      soundFail()
      setPhase('error')
      setMessage('Error al importar')
      setDetail(e instanceof Error ? e.message : String(e))
    }
  }, [initialPhase])

  if (!open) return null

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gco-backup-title"
      onClick={handleClose}
    >
      <div
        className="glass-card"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <p
              id="gco-backup-title"
              style={{
                fontWeight: 700,
                fontSize: '1.08rem',
                margin: 0,
                fontFamily: 'var(--font-display)',
              }}
            >
              Copia de seguridad
            </p>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                margin: '6px 0 0',
                lineHeight: 1.4,
              }}
            >
              Exporta o restaura tu biblioteca y preferencias en este dispositivo.
            </p>
          </div>
          <CloseBtn onClick={handleClose} />
        </div>

        {phase === 'menu' && (
          <>
            <p
              style={{
                fontSize: '0.86rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              El modo <strong>ligero</strong> guarda metadatos, listas, favoritos, libros y
              portadas. Los archivos de audio originales no se copian: se reenlazan si coinciden
              nombre y datos. El modo <strong>completo</strong> puede embeber audios (archivo
              muy grande).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <GlassButton
                type="button"
                onClick={() => {
                  soundClick()
                  setPhase('export-choose')
                }}
                style={{ width: '100%', minHeight: 48 }}
              >
                Exportar datos
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                style={{ width: '100%', minHeight: 48 }}
                onClick={() => {
                  soundClick()
                  void runImport()
                }}
              >
                Importar datos
              </button>
            </div>
          </>
        )}

        {phase === 'export-choose' && (
          <>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                maxHeight: 160,
                overflow: 'auto',
                padding: '0.75rem',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.18)',
                border: '1px solid var(--gco-glass-border)',
              }}
            >
              {EXPORT_USER_NOTICE}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <GlassButton
                type="button"
                onClick={() => {
                  soundClick()
                  void runExport('light')
                }}
                style={{ width: '100%', minHeight: 48 }}
              >
                Ligero (recomendado)
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                style={{ width: '100%', minHeight: 48 }}
                onClick={() => {
                  soundClick()
                  void runExport('full')
                }}
              >
                Completo (audios embebidos)
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  soundClick()
                  setPhase('menu')
                }}
              >
                Atrás
              </button>
            </div>
          </>
        )}

        {phase === 'working' && (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            <div
              className="import-spinner"
              style={{ margin: '0 auto 14px', width: 36, height: 36 }}
              aria-hidden
            />
            <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{message}</p>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {detail}
            </p>
          </div>
        )}

        {(phase === 'done' || phase === 'error') && (
          <>
            <p
              style={{
                fontWeight: 700,
                margin: 0,
                color: phase === 'error' ? '#FF6B4A' : 'var(--gco-primary)',
              }}
            >
              {message}
            </p>
            <pre
              style={{
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                color: 'var(--gco-ink-muted)',
                maxHeight: 220,
                overflow: 'auto',
                margin: 0,
                padding: '0.75rem',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid var(--gco-glass-border)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {detail}
            </pre>
            <GlassButton type="button" onClick={handleClose} style={{ width: '100%' }}>
              Cerrar
            </GlassButton>
          </>
        )}
      </div>
    </div>
  )
}