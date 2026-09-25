import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme, type ThemeMode, type ThemeMeta } from '@/hooks/useTheme'

const GROUP_LABEL: Record<ThemeMeta['group'], string> = {
  base: 'Base',
  retro: 'Retro',
  nature: 'Naturaleza',
  tech: 'Tech',
  art: 'Arte',
  mood: 'Atmósfera',
}

const SHAPE_LABEL: Record<ThemeMeta['shape'], string> = {
  pill: 'Pastilla',
  soft: 'Suave',
  sharp: 'Angular',
  square: 'Cuadrado',
  organic: 'Orgánico',
  tech: 'Tech',
  ornate: 'Ornato',
}

const GROUP_ORDER: ThemeMeta['group'][] = ['base', 'retro', 'nature', 'tech', 'art', 'mood']

/** Mantener pulsado ≥ este ms abre el catálogo (tap corto = ciclar). */
const LONG_PRESS_MS = 420
/** Si el dedo se mueve más de esto, se cancela el long-press (scroll/arrastre). */
const MOVE_CANCEL_PX = 12

/**
 * ThemeToggle — un solo botón.
 * · Tap corto → siguiente tema
 * · Mantener pulsado → catálogo completo (colores + formas)
 * Responsive, glass, accesible.
 */
export function ThemeToggle() {
  const { theme, label, icon, blurb, shape, catalog, cycleTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const startXY = useRef({ x: 0, y: 0 })

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current != null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  const openCatalog = useCallback(() => {
    longPressFired.current = true
    setOpen(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
    } catch {
      /* */
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return
    longPressFired.current = false
    startXY.current = { x: e.clientX, y: e.clientY }
    clearPressTimer()
    pressTimer.current = setTimeout(() => {
      openCatalog()
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pressTimer.current == null) return
    const dx = Math.abs(e.clientX - startXY.current.x)
    const dy = Math.abs(e.clientY - startXY.current.y)
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPressTimer()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    clearPressTimer()
    if (longPressFired.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    cycleTheme()
  }

  const onPointerCancel = () => {
    clearPressTimer()
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }
    const onPointer = (ev: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (!el) return
      if (ev.target instanceof Node && !el.contains(ev.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('touchstart', onPointer, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('touchstart', onPointer)
    }
  }, [open])

  useEffect(() => () => clearPressTimer(), [clearPressTimer])

  const byGroup = GROUP_ORDER.map((g) => ({
    group: g,
    items: catalog.filter((t) => t.group === g),
  })).filter((b) => b.items.length > 0)

  const pick = (id: ThemeMode) => {
    setTheme(id)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="gco-theme-toggle-root" style={{ position: 'relative' }}>
      <button
        type="button"
        className="theme-cycle-btn gco-theme-cycle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onContextMenu={onContextMenu}
        title={`${label} · ${SHAPE_LABEL[shape]}. Tap: siguiente · Mantener: catálogo`}
        aria-label={`Tema actual: ${label}. Pulsar para ciclar. Mantener para ver todos.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <span aria-hidden="true" className="gco-theme-icon gco-icon-bubble">
          {icon}
        </span>
        <span className="gco-theme-label">{label}</span>
      </button>

      {open && (
        <div
          className="gco-theme-panel glass-card"
          role="dialog"
          aria-label="Catálogo de temas"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 80,
            width: 'min(92vw, 340px)',
            maxHeight: 'min(72vh, 520px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 'var(--gco-card-radius, 18px)',
            boxShadow: 'var(--gco-shadow-lg, 0 18px 48px rgba(0,0,0,0.35))',
            border: 'var(--gco-border-width, 1px) solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg, var(--gco-bg-elevated))',
            backdropFilter: 'blur(var(--gco-glass-blur, 20px)) saturate(var(--gco-glass-saturate, 1.3))',
            WebkitBackdropFilter:
              'blur(var(--gco-glass-blur, 20px)) saturate(var(--gco-glass-saturate, 1.3))',
            color: 'var(--gco-ink)',
          }}
        >
          <div
            className="gco-theme-panel-head"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--gco-hairline, var(--gco-glass-border))',
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                className="gco-theme-panel-title"
                style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}
              >
                Temas visuales
              </p>
              <p
                className="gco-theme-panel-sub"
                style={{
                  margin: '4px 0 0',
                  fontSize: '0.72rem',
                  opacity: 0.65,
                  lineHeight: 1.35,
                }}
              >
                {icon} {label} · {SHAPE_LABEL[shape]}
                {blurb ? ` — ${blurb}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn gco-icon-bubble"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                borderRadius: 'var(--gco-icon-radius, 50%)',
              }}
            >
              ✕
            </button>
          </div>

          <div
            className="gco-theme-panel-scroll gco-pb-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '10px 12px 14px',
              overscrollBehavior: 'contain',
            }}
          >
            {byGroup.map(({ group, items }) => (
              <section key={group} className="gco-theme-group" style={{ marginBottom: 14 }}>
                <h3
                  className="gco-theme-group-title"
                  style={{
                    margin: '0 0 8px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    opacity: 0.5,
                  }}
                >
                  {GROUP_LABEL[group]}
                </h3>
                <div
                  className="gco-theme-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 8,
                  }}
                >
                  {items.map((t) => {
                    const on = t.id === theme
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`gco-theme-swatch${on ? ' is-active' : ''}`}
                        data-theme-preview={t.id}
                        data-shape={t.shape}
                        onClick={() => pick(t.id)}
                        aria-pressed={on}
                        title={`${t.blurb} · forma ${SHAPE_LABEL[t.shape]}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 4,
                          textAlign: 'left',
                          padding: '10px 11px',
                          minHeight: 64,
                          borderRadius: 'var(--gco-radius-sm, 14px)',
                          border: on
                            ? '1.5px solid var(--gco-primary)'
                            : '1px solid var(--gco-glass-border)',
                          background: on
                            ? 'color-mix(in srgb, var(--gco-primary) 14%, var(--gco-glass-bg))'
                            : 'var(--gco-glass-bg)',
                          color: 'var(--gco-ink)',
                          cursor: 'pointer',
                          font: 'inherit',
                          boxShadow: on
                            ? '0 0 0 1px color-mix(in srgb, var(--gco-primary) 35%, transparent)'
                            : 'none',
                          transition: 'border-color 0.15s ease, background 0.15s ease',
                        }}
                      >
                        <span
                          className="gco-theme-swatch-icon gco-icon-bubble"
                          aria-hidden
                          style={{ fontSize: '1.15rem', lineHeight: 1 }}
                        >
                          {t.icon}
                        </span>
                        <span
                          className="gco-theme-swatch-label"
                          style={{ fontWeight: 650, fontSize: '0.82rem' }}
                        >
                          {t.label}
                        </span>
                        <span
                          className="gco-theme-swatch-blurb"
                          style={{
                            fontSize: '0.65rem',
                            opacity: 0.55,
                            lineHeight: 1.25,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {SHAPE_LABEL[t.shape]}
                          {t.blurb ? ` · ${t.blurb}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <p
            style={{
              margin: 0,
              padding: '8px 14px 12px',
              fontSize: '0.65rem',
              opacity: 0.45,
              flexShrink: 0,
              borderTop: '1px solid var(--gco-hairline, var(--gco-glass-border))',
            }}
          >
            Mantén pulsado el botón del tema para abrir · Esc o toca fuera para cerrar
          </p>
        </div>
      )}
    </div>
  )
}