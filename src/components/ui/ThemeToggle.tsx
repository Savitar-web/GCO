import { useEffect, useRef, useState } from 'react'
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

/**
 * ThemeToggle — ciclo + catálogo.
 * Cada tema cambia color, radios, botones e iconos vía theme.css.
 */
export function ThemeToggle() {
  const { theme, label, icon, blurb, shape, catalog, cycleTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
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
      <div className="gco-theme-toggle-row" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          className="theme-cycle-btn gco-theme-cycle"
          onClick={cycleTheme}
          title={`Forma: ${SHAPE_LABEL[shape]} · siguiente tema`}
          aria-label={`Tema actual: ${label}. Pulsar para ciclar.`}
        >
          <span aria-hidden="true" className="gco-theme-icon gco-icon-bubble">
            {icon}
          </span>
          <span className="gco-theme-label">{label}</span>
        </button>
        <button
          type="button"
          className="theme-cycle-btn gco-theme-more gco-icon-bubble"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Ver todos los temas (colores + formas)"
          aria-label="Abrir catálogo de temas"
        >
          <span aria-hidden="true">···</span>
        </button>
      </div>

      {open && (
        <div className="gco-theme-panel glass-card" role="dialog" aria-label="Catálogo de temas">
          <div className="gco-theme-panel-head">
            <div>
              <p className="gco-theme-panel-title">Temas visuales</p>
              <p className="gco-theme-panel-sub">
                {icon} {label} · {SHAPE_LABEL[shape]} — {blurb}
              </p>
            </div>
            <button type="button" className="icon-btn gco-icon-bubble" aria-label="Cerrar" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <div className="gco-theme-panel-scroll">
            {byGroup.map(({ group, items }) => (
              <section key={group} className="gco-theme-group">
                <h3 className="gco-theme-group-title">{GROUP_LABEL[group]}</h3>
                <div className="gco-theme-grid">
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
                      >
                        <span className="gco-theme-swatch-icon gco-icon-bubble" aria-hidden>
                          {t.icon}
                        </span>
                        <span className="gco-theme-swatch-label">{t.label}</span>
                        <span className="gco-theme-swatch-blurb">
                          {SHAPE_LABEL[t.shape]} · {t.blurb}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}