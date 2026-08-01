import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getRoutinePrefs,
  saveRoutinePrefs,
  getRoutines,
  advanceRoutineSession,
  stopRoutineSession,
  togglePauseSession,
  formatMs,
  ringBell,
  type RoutinePrefs,
} from '@/core/storage/routines'
import { soundClick } from '@/core/audio/uiSounds'

export function RoutineWidget() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<RoutinePrefs>(getRoutinePrefs)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean }>({
    dx: 0,
    dy: 0,
    dragging: false,
  })
  const bellFired = useRef(false)

  const refresh = () => setPrefs(getRoutinePrefs())

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener('gco:routines-changed', onChange)
    return () => window.removeEventListener('gco:routines-changed', onChange)
  }, [])

  useEffect(() => {
    if (!prefs.systemEnabled) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [prefs.systemEnabled])

  // Campana al terminar actividad
  useEffect(() => {
    const s = prefs.session
    if (!s || s.paused) {
      bellFired.current = false
      return
    }
    if (now >= s.endsAt) {
      if (!bellFired.current) {
        bellFired.current = true
        ringBell()
      }
    } else {
      bellFired.current = false
    }
  }, [now, prefs.session])

  if (!prefs.systemEnabled) return null

  const session = prefs.session
  const routine = session
    ? getRoutines().find((r) => r.id === session.routineId)
    : null
  const activity =
    session && routine ? routine.activities[session.activityIndex] : null

  const remaining =
    session && !session.paused
      ? Math.max(0, session.endsAt - now)
      : session?.remainingMsWhenPaused ?? 0

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    dragRef.current = {
      dragging: true,
      dx: e.clientX - prefs.widgetX,
      dy: e.clientY - prefs.widgetY,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return
    const x = Math.max(8, Math.min(window.innerWidth - 56, e.clientX - dragRef.current.dx))
    const y = Math.max(8, Math.min(window.innerHeight - 56, e.clientY - dragRef.current.dy))
    setPrefs((p) => ({ ...p, widgetX: x, widgetY: y }))
  }

  const onPointerUp = () => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    const p = getRoutinePrefs()
    saveRoutinePrefs({ widgetX: prefs.widgetX, widgetY: prefs.widgetY })
    setPrefs({ ...p, widgetX: prefs.widgetX, widgetY: prefs.widgetY })
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: prefs.widgetX,
        top: prefs.widgetY,
        zIndex: 9999,
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <button
        type="button"
        aria-label="Rutina"
        onClick={() => {
          soundClick()
          setOpen((v) => !v)
        }}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '1px solid var(--gco-glass-border)',
          background: session
            ? 'rgba(34, 230, 197, 0.25)'
            : 'var(--gco-glass-bg, rgba(20,24,40,0.9))',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          cursor: 'grab',
          fontSize: '1.25rem',
          display: 'grid',
          placeItems: 'center',
          color: 'inherit',
        }}
      >
        🔔
        {session && (
          <span
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              fontSize: '0.55rem',
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--gco-primary)',
              color: '#0B1220',
              borderRadius: 6,
              padding: '1px 4px',
              fontWeight: 700,
            }}
          >
            {formatMs(remaining)}
          </span>
        )}
      </button>

      {open && (
        <div
          data-no-drag
          style={{
            position: 'absolute',
            top: 56,
            left: 0,
            width: 240,
            maxWidth: 'min(240px, 70vw)',
            padding: '0.85rem 1rem',
            borderRadius: 16,
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg, rgba(16,20,32,0.96))',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            fontSize: '0.85rem',
          }}
        >
          {!session && (
            <p style={{ color: 'var(--gco-ink-muted)' }}>
              Sin rutina activa. Inicia una en Ajustes → Rutinas.
            </p>
          )}
          {session && activity && routine && (
            <>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{routine.name}</p>
              <p style={{ color: 'var(--gco-ink-muted)', marginBottom: 6 }}>
                {activity.type === 'rest' ? '☕' : '🎮'} {activity.label}
              </p>
              <p
                className="mono"
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--gco-primary)',
                  marginBottom: 10,
                }}
              >
                {formatMs(remaining)}
                {session.paused ? ' (pausa)' : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activity.type === 'game' && activity.path && (
                  <button
                    type="button"
                    className="glass-button"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                    onClick={() => {
                      soundClick()
                      navigate(activity.path!)
                      setOpen(false)
                    }}
                  >
                    Ir al juego
                  </button>
                )}
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    soundClick()
                    setPrefs(togglePauseSession())
                  }}
                >
                  {session.paused ? 'Reanudar' : 'Pausar'}
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    soundClick()
                    ringBell()
                    setPrefs(advanceRoutineSession())
                  }}
                >
                  Siguiente paso
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    soundClick()
                    setPrefs(stopRoutineSession())
                    setOpen(false)
                  }}
                >
                  Terminar rutina
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}