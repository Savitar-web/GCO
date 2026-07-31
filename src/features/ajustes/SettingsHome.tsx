import { Link } from 'react-router-dom'
import { getProfile } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'
import { soundClick } from '@/core/audio/uiSounds'

export function SettingsHome() {
  const profile = getProfile()
  const total = getTotalProgress()

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1rem, 3vw, 1.35rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: '1.2rem' }}>{profile?.name ?? 'Sin nombre'}</h2>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            {profile?.age ? `${profile.age} años · ` : ''}
            {total.percent}% de recorrido
          </p>
        </div>
      </div>

      <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
        Niveles totales:{' '}
        <strong className="mono">{total.totalLevels}</strong>
        {' · '}
        Partidas completadas:{' '}
        <strong className="mono">{total.totalCompleted}</strong>
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link
          to="/ajustes/perfil"
          className="glass-button secondary"
          style={{ textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => soundClick()}
        >
          Editar perfil
        </Link>
        <Link
          to="/ajustes/recorrido"
          className="glass-button secondary"
          style={{ textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => soundClick()}
        >
          Ver recorrido
        </Link>
      </div>
    </div>
  )
}