import { useState } from 'react'
import {
  getTotalProgress,
  getProgressPrefs,
  saveProgressPrefs,
  getAllProgress,
  formatDuration,
  type ProgressPrefs,
} from '@/core/storage/progress'
import { soundToggle } from '@/core/audio/uiSounds'

export function RecorridoSettings() {
  const [prefs, setPrefs] = useState<ProgressPrefs>(getProgressPrefs)
  const [tick, setTick] = useState(0)

  // Releer tras cambiar prefs
  const total = getTotalProgress()
  const all = getAllProgress()

  const persistPrefs = (next: ProgressPrefs) => {
    saveProgressPrefs(next)
    setPrefs(next)
    setTick((t) => t + 1)
  }

  void tick

  const recent = Object.entries(all)
    .flatMap(([key, g]) =>
      (g.history ?? []).map((h) => ({
        key,
        gameLabel: key.split(':')[1]?.replace(/-/g, ' ') ?? key,
        ...h,
      }))
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Resumen global */}
      <div
        className="glass-card"
        style={{ padding: 'clamp(1rem, 3vw, 1.35rem)' }}
      >
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.85rem',
            marginBottom: '0.5rem',
          }}
        >
          Progreso global
        </p>
        <p
          className="mono"
          style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.15rem)',
            fontWeight: 700,
            marginBottom: '0.75rem',
          }}
        >
          {total.percent}%
        </p>
        <div
          style={{
            height: 14,
            borderRadius: 999,
            background: 'rgba(127,127,127,0.2)',
            overflow: 'hidden',
          }}
        >
          <div
            className="gco-progress-rainbow"
            style={{
              height: '100%',
              width: `${total.percent}%`,
              borderRadius: 999,
              transition: 'width 0.7s ease',
            }}
          />
        </div>
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.85rem',
            color: 'var(--gco-ink-muted)',
            lineHeight: 1.45,
          }}
        >
          {total.totalLevels} niveles · {total.totalCompleted} victorias ·{' '}
          {total.gamesPlayed} juegos
        </p>
      </div>

      {/* Racha + índice de victoria */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}
      >
        <div className="glass-card" style={{ padding: '1rem 1.1rem' }}>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: '0.35rem',
            }}
          >
            Racha
          </p>
          <p className="mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {total.streak.current}
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--gco-ink-muted)',
              }}
            >
              {' '}
              días
            </span>
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginTop: '0.25rem',
            }}
          >
            Mejor: {total.streak.best} días
          </p>
        </div>

        <div className="glass-card" style={{ padding: '1rem 1.1rem' }}>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: '0.35rem',
            }}
          >
            Índice de victoria
          </p>
          <p
            className="mono"
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--gco-primary)',
            }}
          >
            {total.winRate}%
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginTop: '0.25rem',
            }}
          >
            {total.totalCompleted}/{total.totalAttempts || 0} intentos
          </p>
        </div>
      </div>

      {/* Toggle ranking / racha */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.15rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              Contar en racha y ranking
            </p>
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.4,
              }}
            >
              Desactívalo al prestar el móvil para no romper tu racha
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.rankingEnabled}
            onClick={() => {
              const next = {
                ...prefs,
                rankingEnabled: !prefs.rankingEnabled,
              }
              soundToggle(next.rankingEnabled)
              persistPrefs(next)
            }}
            style={{
              width: 52,
              height: 30,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: prefs.rankingEnabled
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
                left: prefs.rankingEnabled ? 24 : 3,
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            borderTop: '1px solid var(--gco-glass-border)',
            paddingTop: '0.85rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              Subida suave de nivel
            </p>
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.4,
              }}
            >
              Dificultad más lenta → más rachas de victorias
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.softProgression}
            onClick={() => {
              const next = {
                ...prefs,
                softProgression: !prefs.softProgression,
              }
              soundToggle(next.softProgression)
              persistPrefs(next)
            }}
            style={{
              width: 52,
              height: 30,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: prefs.softProgression
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
                left: prefs.softProgression ? 24 : 3,
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

        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--gco-ink-faint, var(--gco-ink-muted))',
          }}
        >
          Ranking global de cuentas: próximamente. Este interruptor ya prepara
          tus partidas locales.
        </p>
      </div>

      {/* Por juego */}
      {total.byGame.map((g) => (
        <div
          key={g.key}
          className="glass-card"
          style={{ padding: '1rem 1.15rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              alignItems: 'baseline',
            }}
          >
            <span
              style={{
                fontWeight: 600,
                textTransform: 'capitalize',
                minWidth: 0,
              }}
            >
              {g.gameId.replace(/-/g, ' ')}
            </span>
            <span
              className="mono"
              style={{ color: 'var(--gco-primary)', flexShrink: 0 }}
            >
              Nv. {g.highestLevel}
            </span>
          </div>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: '0.25rem',
            }}
          >
            {g.categoryId} · {g.totalCompleted} victorias · índice {g.winRate}%
            {g.bestTimeMs != null && g.bestTimeMs > 0
              ? ` · mejor ${formatDuration(g.bestTimeMs)}`
              : ''}
          </p>
        </div>
      ))}

      {total.byGame.length === 0 && (
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            textAlign: 'center',
            padding: '1rem 0',
          }}
        >
          Todavía no hay progreso. ¡Entrena un poco!
        </p>
      )}

      {/* Historial reciente */}
      {recent.length > 0 && (
        <div
          className="glass-card"
          style={{ padding: '1rem 1.15rem' }}
        >
          <p
            style={{
              fontWeight: 600,
              marginBottom: '0.75rem',
              fontSize: '0.95rem',
            }}
          >
            Historial reciente
          </p>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}
          >
            {recent.map((h, i) => (
              <div
                key={`${h.at}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  fontSize: '0.82rem',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ textTransform: 'capitalize' }}>
                    {h.gameLabel}
                  </span>
                  {' · '}
                  Nv. {h.level}
                  {!h.ranked && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: '0.7rem',
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      (sin racha)
                    </span>
                  )}
                </span>
                <span
                  className="mono"
                  style={{
                    flexShrink: 0,
                    color: h.success
                      ? 'var(--gco-primary)'
                      : 'var(--gco-secondary)',
                  }}
                >
                  {h.success ? '✓' : '✗'}
                  {h.timeMs != null ? ` ${formatDuration(h.timeMs)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}