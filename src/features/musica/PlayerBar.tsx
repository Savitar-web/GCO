import { formatTrackTime } from '@/core/storage/mediaLibrary'
import type { MediaPlayerApi } from '@/hooks/useMediaPlayer'
import { soundClick } from '@/core/audio/uiSounds'

const PREF_KEY = 'gco:player-bar-prefs'

export function getBarPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return JSON.parse(raw) as { progressColor: string }
  } catch {
    /* */
  }
  return { progressColor: '#22E6C5' }
}

export function saveBarPrefs(p: { progressColor: string }) {
  localStorage.setItem(PREF_KEY, JSON.stringify(p))
}

type Props = { player: MediaPlayerApi }

export function PlayerBar({ player }: Props) {
  const color = getBarPrefs().progressColor
  const t = player.track
  const dur = player.durationMs || t?.durationMs || 0
  const pct = dur > 0 ? Math.min(100, (player.currentMs / dur) * 100) : 0

  if (!t) return null

  const btn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.08)',
    color: 'var(--gco-ink)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(3.6rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 45,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 12px',
      }}
      className="gco-player-bar-wrap"
    >
      <style>{`
        @media (min-width: 900px) {
          .gco-player-bar-wrap { bottom: 20px !important; }
          .gco-player-bar-inner { max-width: 420px !important; }
        }
        @media (max-width: 899px) {
          .gco-player-bar-inner { max-width: 520px !important; }
        }
      `}</style>
      <div
        className="gco-player-bar-inner glass-card"
        style={{
          width: '100%',
          maxWidth: 520,
          pointerEvents: 'auto',
          padding: '0.75rem 1rem 0.85rem',
          borderRadius: 18,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.06)',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {t.coverDataUrl ? (
              <img
                src={t.coverDataUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              '♪'
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontWeight: 600,
                fontSize: '0.88rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                margin: 0,
              }}
            >
              {t.title}
            </p>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--gco-ink-muted)',
                margin: 0,
              }}
            >
              {t.artist}
            </p>
          </div>
        </div>

        {/* Una sola barra de progreso */}
        <input
          type="range"
          min={0}
          max={dur || 1}
          value={Math.min(player.currentMs, dur || 0)}
          onChange={(e) => player.seek(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: color,
            cursor: 'pointer',
            margin: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: 'var(--gco-ink-muted)',
            marginTop: 2,
          }}
        >
          <span>{formatTrackTime(player.currentMs)}</span>
          <span>{formatTrackTime(dur)}</span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            style={{
              ...btn,
              opacity: player.shuffle ? 1 : 0.55,
              color: player.shuffle ? color : undefined,
            }}
            title="Aleatorio"
            onClick={() => {
              soundClick()
              player.setShuffle(!player.shuffle)
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
          </button>
          <button
            type="button"
            style={btn}
            title="Anterior"
            onClick={() => {
              soundClick()
              void player.prev()
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button
            type="button"
            style={{
              ...btn,
              width: 48,
              height: 48,
              background: color,
              color: '#0B1220',
            }}
            title={player.playing ? 'Pausa' : 'Play'}
            onClick={() => {
              soundClick()
              void player.toggle()
            }}
          >
            {player.playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            style={btn}
            title="Siguiente"
            onClick={() => {
              soundClick()
              void player.next()
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
            </svg>
          </button>
          <button
            type="button"
            style={{
              ...btn,
              opacity: player.repeat === 'off' ? 0.55 : 1,
              color: player.repeat !== 'off' ? color : undefined,
            }}
            title={`Repetir: ${player.repeat}`}
            onClick={() => {
              soundClick()
              const order = ['off', 'all', 'one'] as const
              const i = order.indexOf(player.repeat)
              player.setRepeat(order[(i + 1) % 3])
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 014-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 01-4 4H3" />
              {player.repeat === 'one' && (
                <text x="10" y="15" fontSize="8" fill="currentColor" stroke="none">
                  1
                </text>
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}