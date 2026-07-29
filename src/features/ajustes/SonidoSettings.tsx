import { useRef, useState } from 'react'
import {
  getBgPrefs,
  saveBgPrefs,
  saveAudioFile,
  clearAudioFile,
} from '@/core/storage/customBackground'
import { GlassButton } from '@/components/ui/GlassButton'

export function SonidoSettings() {
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
    // mp3, m4a, mp4 (solo pista), wav, ogg, webm…
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
    await saveAudioFile(file)
    persist({ ...prefs, audioEnabled: true })
    window.dispatchEvent(new Event('gco:bg-updated'))
    e.target.value = ''
  }

  return (
    <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
        Música ambiental en bucle, a volumen muy bajo. Puedes usar mp3, m4a, wav, ogg o la pista de un mp4.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <span>Audio ambiente</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.audioEnabled}
          className="theme-cycle-btn"
          onClick={() => persist({ ...prefs, audioEnabled: !prefs.audioEnabled })}
        >
          {prefs.audioEnabled ? 'On' : 'Off'}
        </button>
      </label>

      <div>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>
          Volumen ({Math.round(prefs.volume * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={0.4}
          step={0.01}
          value={prefs.volume}
          onChange={(e) => persist({ ...prefs, volume: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-faint)', marginTop: '0.3rem' }}>
          Limitado a 40% para que siga siendo sutil
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton type="button" onClick={() => fileRef.current?.click()}>
          Elegir pista
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={async () => {
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