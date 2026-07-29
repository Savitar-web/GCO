import { getTotalProgress } from '@/core/storage/progress'

export function RecorridoSettings() {
  const total = getTotalProgress()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Progreso global
        </p>
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
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
        <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
          {total.totalLevels} niveles · {total.totalCompleted} completados · {total.gamesPlayed} juegos
        </p>
      </div>

      {total.byGame.map((g) => (
        <div key={g.key} className="glass-card" style={{ padding: '1rem 1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
              {g.gameId.replace(/-/g, ' ')}
            </span>
            <span className="mono" style={{ color: 'var(--gco-primary)' }}>
              Nv. {g.highestLevel}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', marginTop: '0.25rem' }}>
            {g.categoryId} · {g.totalCompleted} victorias
          </p>
        </div>
      ))}

      {total.byGame.length === 0 && (
        <p style={{ color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
          Todavía no hay progreso. ¡Entrena un poco!
        </p>
      )}
    </div>
  )
}