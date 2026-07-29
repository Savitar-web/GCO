import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getProfile } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'

const LINKS = [
  { to: '/ajustes', label: 'Resumen', end: true },
  { to: '/ajustes/perfil', label: 'Perfil', end: false },
  { to: '/ajustes/recorrido', label: 'Recorrido', end: false },
  { to: '/ajustes/sonido', label: 'Sonido', end: false },
  { to: '/ajustes/fondo', label: 'Fondo', end: false },
  { to: '/ajustes/datos', label: 'Datos', end: false },
] as const

export function SettingsLayout() {
  const navigate = useNavigate()
  const profile = getProfile()
  const total = getTotalProgress()

  return (
    <div className="app-shell">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => navigate('/')}
          style={{ padding: '0.5rem 0.9rem', fontSize: '0.9rem' }}
        >
          ← Atrás
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.35rem' }}>Ajustes</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/ajustes/perfil')}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px solid var(--gco-glass-border)',
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--gco-glass-bg)',
            flexShrink: 0,
          }}
          aria-label="Perfil"
        >
          {profile?.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '1.1rem' }}>
              {(profile?.name ?? '?').charAt(0).toUpperCase()}
            </span>
          )}
        </button>
      </header>

      <div
        className="glass-card"
        style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '0.45rem',
            fontSize: '0.82rem',
            color: 'var(--gco-ink-muted)',
          }}
        >
          <span>Progreso global</span>
          <span className="mono">{total.percent}%</span>
        </div>
        <div
          style={{
            height: 10,
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
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      </div>

      <nav
        style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
          marginBottom: '1rem',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            style={({ isActive }) => ({
              flexShrink: 0,
              padding: '0.45rem 0.85rem',
              borderRadius: 999,
              fontSize: '0.85rem',
              textDecoration: 'none',
              color: isActive ? 'var(--gco-button-text)' : 'var(--gco-ink)',
              background: isActive ? 'var(--gco-primary)' : 'var(--gco-glass-bg)',
              border: isActive ? 'none' : '1px solid var(--gco-glass-border)',
              fontWeight: 500,
            })}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}