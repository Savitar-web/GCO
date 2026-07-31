import { useRef, useState } from 'react'
import {
  getBgPrefs,
  saveBgPrefs,
  saveAudioFile,
  clearAudioFile,
} from '@/core/storage/customBackground'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundToggle, soundStart } from '@/core/audio/uiSounds'

function emitBgPrefs(prefs: ReturnType<typeof getBgPrefs>) {
  saveBgPrefs(prefs)
  // Evento genérico (compat)
  window.dispatchEvent(new Event('gco:bg-prefs'))
  // Evento con detalle para que el player aplique volumen al instante
  window.dispatchEvent(
    new CustomEvent('gco:bg-prefs-detail', { detail: prefs })
  )
}

export function SonidoSettings() {
  const [prefs, setPrefs] = useState(getBgPrefs)
  const fileRef = useRef<HTMLInputElement>(null)

  const persist = (next: typeof prefs) => {
    setPrefs(next)
    emitBgPrefs(next)
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      alert('Usa un archivo de audio (o vídeo: solo se usará el sonido).')
      e.target.value = ''
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('Máximo ~15 MB')
      e.target.value = ''
      return
    }
    soundStart()
    await saveAudioFile(file)
    persist({ ...prefs, audioEnabled: true })
    window.dispatchEvent(new Event('gco:bg-updated'))
    e.target.value = ''
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
          Audio ambiente
        </h3>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
          Música en bucle a volumen bajo. Formatos: mp3, m4a, wav, ogg o pista de un mp4.
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
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Activado</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
            {prefs.audioEnabled ? 'Reproduciendo en bucle' : 'Silenciado'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.audioEnabled}
          onClick={() => {
            const next = !prefs.audioEnabled
            soundToggle(next)
            persist({ ...prefs, audioEnabled: next })
          }}
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: prefs.audioEnabled
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
              left: prefs.audioEnabled ? 24 : 3,
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

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.45rem',
          }}
        >
          <label htmlFor="gco-vol" style={{ fontWeight: 500, fontSize: '0.95rem' }}>
            Volumen
          </label>
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
            {Math.round(prefs.volume * 100)}%
          </span>
        </div>
        <input
          id="gco-vol"
          type="range"
          min={0}
          max={0.4}
          step={0.01}
          value={prefs.volume}
          onChange={(e) => {
            const volume = Number(e.target.value)
            persist({ ...prefs, volume })
          }}
          onPointerUp={() => soundClick()}
          style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-faint)', marginTop: '0.35rem' }}>
          Tope 40% para que no tape los sonidos de los juegos
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton
          type="button"
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        >
          Elegir pista
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={async () => {
            soundClick()
            await clearAudioFile()
            window.dispatchEvent(new Event('gco:bg-updated'))
          }}
        >
          Quitar pista
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/mp4,video/webm"
        hidden
        onChange={onFile}
      />
    </div>
  )
}