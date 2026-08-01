import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAppMode,
  setAppMode,
  pathForMode,
  type AppMode,
} from '@/core/storage/appMode'
import { soundClick } from '@/core/audio/uiSounds'

const MODES: { id: AppMode; label: string; emoji: string }[] = [
  { id: 'nutricion', label: 'Nutrición', emoji: '🍎' },
  { id: 'gym', label: 'GymCog', emoji: '🧠' },
  { id: 'musica', label: 'Música', emoji: '🎵' },
]

export function ModeSwitch() {
  const navigate = useNavigate()
  const [mode, setModeState] = useState<AppMode>(() => getAppMode())

  useEffect(() => {
    const on = (e: Event) => {
      const m = (e as CustomEvent<AppMode>).detail ?? getAppMode()
      setModeState(m)
    }
    window.addEventListener('gco:app-mode', on)
    return () => window.removeEventListener('gco:app-mode', on)
  }, [])

  const idx = Math.max(0, MODES.findIndex((m) => m.id === mode))

  const go = (next: AppMode) => {
    soundClick()
    setAppMode(next)
    setModeState(next)
    navigate(pathForMode(next), { replace: true })
  }

  return (
    <div
      role="tablist"
      aria-label="Modo de la app"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        border: '1px solid var(--gco-glass-border)',
        background: 'rgba(255,255,255,0.04)',
        position: 'relative',
        minWidth: 198,
        maxWidth: 280,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: `calc(${idx} * 100% / 3 + 4px)`,
          width: 'calc(100% / 3 - 8px)',
          borderRadius: 999,
          background: 'rgba(34, 230, 197, 0.22)',
          border: '1px solid rgba(34, 230, 197, 0.35)',
          transition: 'left 0.22s ease',
          pointerEvents: 'none',
        }}
      />
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => go(m.id)}
            style={{
              position: 'relative',
              zIndex: 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '0.45rem 0.3rem',
              borderRadius: 999,
              color: active ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
              font: 'inherit',
              fontSize: '0.7rem',
              fontWeight: active ? 700 : 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              lineHeight: 1.15,
            }}
          >
            <span style={{ fontSize: '0.95rem' }}>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}