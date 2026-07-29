import { getProfile } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'
import { Link } from 'react-router-dom'

export function SettingsHome() {
  const profile = getProfile()
  const total = getTotalProgress()

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.5rem',
            flexShrink: 0,
          }}
        >
          {profile?.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            (profile?.name ?? '?').charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h2 style={{ fontSize: '1.2rem' }}>{profile?.name ?? 'Sin nombre'}</h2>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            {profile?.age ? `${profile.age} años · ` : ''}
            {total.percent}% de recorrido
          </p>
        </div>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
        Niveles totales: <strong className="mono">{total.totalLevels}</strong>
        {' · '}
        Partidas completadas: <strong className="mono">{total.totalCompleted}</strong>
      </p>

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link to="/ajustes/perfil" className="glass-button secondary" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>
          Editar perfil
        </Link>
        <Link to="/ajustes/recorrido" className="glass-button secondary" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>
          Ver recorrido
        </Link>
      </div>
    </div>
  )
}