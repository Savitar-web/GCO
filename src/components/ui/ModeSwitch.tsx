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

export function ModeSwitch({ fullWidth = false }: { fullWidth?: boolean }) {
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
        gap: 3,
        padding: 3,
        borderRadius: 999,
        border: '1px solid var(--gco-glass-border)',
        background: 'rgba(255,255,255,0.04)',
        position: 'relative',
        width: fullWidth ? '100%' : undefined,
        minWidth: fullWidth ? undefined : 168,
        maxWidth: fullWidth ? undefined : 240,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: `calc(${idx} * 100% / 3 + 3px)`,
          width: 'calc(100% / 3 - 6px)',
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
              padding: '0.35rem 0.2rem',
              borderRadius: 999,
              color: active ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
              font: 'inherit',
              fontSize: '0.65rem',
              fontWeight: active ? 700 : 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}