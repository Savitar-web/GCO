import { getTotalProgress } from '@/core/storage/progress'

export function RecorridoSettings() {
  const total = getTotalProgress()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
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
          }}
        >
          {total.totalLevels} niveles · {total.totalCompleted} completados ·{' '}
          {total.gamesPlayed} juegos
        </p>
      </div>

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
            {g.categoryId} · {g.totalCompleted} victorias
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
    </div>
  )
}