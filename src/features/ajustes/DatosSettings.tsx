/**
 * DatosSettings — Copia de seguridad GCO (UI inline)
 */
import { useCallback, useRef, useState } from 'react'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import {
  EXPORT_USER_NOTICE,
  exportData,
  importData,
  type BackupMode,
  type ExportResult,
  type ImportResult,
} from '@/core/storage/exportImport'

type Panel = 'idle' | 'export' | 'working' | 'result'

export function DatosSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [panel, setPanel] = useState<Panel>('idle')
  const [busyLabel, setBusyLabel] = useState('')
  const [resultTitle, setResultTitle] = useState('')
  const [resultBody, setResultBody] = useState('')
  const [resultOk, setResultOk] = useState(true)

  const showResult = (ok: boolean, title: string, body: string) => {
    setResultOk(ok)
    setResultTitle(title)
    setResultBody(body)
    setPanel('result')
    if (ok) soundSuccess()
    else soundFail()
  }

  const runExport = useCallback(async (mode: BackupMode) => {
    setPanel('working')
    setBusyLabel(
      mode === 'full'
        ? 'Generando respaldo completo (puede tardar)…'
        : 'Generando respaldo ligero…'
    )
    try {
      const res: ExportResult = await exportData({
        mode,
        preferSavePicker: true,
        includeCovers: true,
        includeLyrics: true,
      })
      if (!res.save.ok && res.save.error === 'cancelled') {
        setPanel('export')
        return
      }
      if (!res.save.ok) {
        showResult(
          false,
          'No se pudo guardar',
          `${res.save.error || 'Error'}\nMétodo: ${res.save.method}`
        )
        return
      }
      const p = res.payload
      showResult(
        true,
        'Respaldo listo',
        [
          `Modo: ${p.mode === 'full' ? 'Completo' : 'Ligero'}`,
          `Archivo: ${res.save.fileName}`,
          `Método: ${res.save.method}`,
          res.save.pathOrUri ? `Ruta: ${res.save.pathOrUri}` : '',
          `Pistas: ${p.music.tracks.length}`,
          `Con portada: ${p.music.tracks.filter((t) => !!t.coverDataUrl).length}`,
          `Con letra: ${p.music.tracks.filter((t) => !!t.lyrics).length}`,
          `Audios embebidos: ${Object.keys(p.music.embeddedAudioBase64 || {}).length}`,
          `Listas: ${p.music.playlists.length}`,
          `Libros: ${p.nutrition.books.length}`,
          `Carpetas: ${p.nutrition.folders.length}`,
          `Ajustes (claves): ${Object.keys(p.localStorage).length}`,
        ]
          .filter(Boolean)
          .join('\n')
      )
    } catch (e) {
      showResult(false, 'Error al exportar', e instanceof Error ? e.message : String(e))
    }
  }, [])

  const runImport = useCallback(async (file: File) => {
    setPanel('working')
    setBusyLabel('Restaurando datos…')
    try {
      const res: ImportResult = await importData(file, {
        merge: true,
        relinkMedia: true,
      })
      if (!res.ok && res.errors.length) {
        showResult(
          false,
          'Importación con errores',
          [...res.errors, ...res.warnings].slice(0, 14).join('\n')
        )
        return
      }
      showResult(
        true,
        'Datos restaurados',
        [
          `Versión: v${res.version}`,
          `Ajustes: ${res.restoredKeys.length}`,
          `Pistas actualizadas: ${res.musicTracks}`,
          `Listas: ${res.playlists}`,
          `Libros: ${res.books}`,
          `Carpetas: ${res.folders}`,
          `Audios embebidos: ${res.embeddedRestored}`,
          res.warnings.length ? `\nAvisos:\n${res.warnings.slice(0, 8).join('\n')}` : '',
        ].join('\n')
      )
      window.setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('gco:library'))
        } catch {
          /* */
        }
      }, 300)
    } catch (e) {
      showResult(false, 'Error al importar', e instanceof Error ? e.message : String(e))
    }
  }, [])

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1rem, 3vw, 1.35rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div>
        <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.35rem', fontWeight: 700 }}>
          Copia de seguridad
        </h3>
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          Exporta o restaura preferencias, listas, favoritos, metadatos de música (portadas y
          letras) y audiolibros. Compatible con web, APK e instalable.
        </p>
      </div>

      {panel === 'idle' && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <GlassButton
            type="button"
            onClick={() => {
              soundClick()
              setPanel('export')
            }}
          >
            Exportar datos
          </GlassButton>
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              fileRef.current?.click()
            }}
          >
            Importar datos
          </button>
        </div>
      )}

      {panel === 'export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              maxHeight: 200,
              overflow: 'auto',
              padding: '0.85rem 1rem',
              borderRadius: 14,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--gco-glass-border)',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {EXPORT_USER_NOTICE}
          </div>
          <button
            type="button"
            className="glass-button"
            style={{
              width: '100%',
              minHeight: 48,
              background: 'var(--gco-primary)',
              color: 'var(--gco-button-text, #0B1220)',
              fontWeight: 700,
            }}
            onClick={() => {
              soundClick()
              void runExport('light')
            }}
          >
            Ligero (recomendado)
          </button>
          <button
            type="button"
            className="glass-button secondary"
            style={{ width: '100%', minHeight: 48 }}
            onClick={() => {
              soundClick()
              void runExport('full')
            }}
          >
            Completo (embebe audios)
          </button>
          <button
            type="button"
            className="glass-button secondary"
            style={{ width: '100%' }}
            onClick={() => {
              soundClick()
              setPanel('idle')
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {panel === 'working' && (
        <div style={{ textAlign: 'center', padding: '1.25rem 0.5rem' }}>
          <div
            className="import-spinner"
            style={{ margin: '0 auto 12px', width: 32, height: 32 }}
            aria-hidden
          />
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>{busyLabel}</p>
          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            No cierres esta pantalla.
          </p>
        </div>
      )}

      {panel === 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              color: resultOk ? 'var(--gco-primary)' : '#FF6B4A',
            }}
          >
            {resultTitle}
          </p>
          <pre
            style={{
              margin: 0,
              fontSize: '0.75rem',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--gco-ink-muted)',
              maxHeight: 220,
              overflow: 'auto',
              padding: '0.85rem 1rem',
              borderRadius: 14,
              background: 'rgba(0,0,0,0.18)',
              border: '1px solid var(--gco-glass-border)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {resultBody}
          </pre>
          <GlassButton
            type="button"
            onClick={() => {
              soundClick()
              setPanel('idle')
            }}
            style={{ alignSelf: 'flex-start' }}
          >
            Listo
          </GlassButton>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          soundClick()
          void runImport(f)
        }}
      />
    </div>
  )
}