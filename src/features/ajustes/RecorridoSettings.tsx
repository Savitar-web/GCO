import { useMemo, useState } from 'react'
import {
  getTotalProgress,
  getProgressPrefs,
  saveProgressPrefs,
  getAllProgress,
  formatDuration,
  formatDateTime,
  type ProgressPrefs,
  type HistoryEntry,
} from '@/core/storage/progress'
import { soundToggle, soundClick } from '@/core/audio/uiSounds'

type FlatHistory = HistoryEntry & {
  key: string
  gameLabel: string
  categoryId: string
}

export function RecorridoSettings() {
  const [prefs, setPrefs] = useState<ProgressPrefs>(getProgressPrefs)
  const [tick, setTick] = useState(0)
  const [detail, setDetail] = useState<FlatHistory | null>(null)
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all')

  void tick
  const total = getTotalProgress()
  const all = getAllProgress()

  const persistPrefs = (next: ProgressPrefs) => {
    saveProgressPrefs(next)
    setPrefs(next)
    setTick((t) => t + 1)
  }

  const history = useMemo(() => {
    const rows: FlatHistory[] = []
    for (const [key, g] of Object.entries(all)) {
      const [categoryId, gameId] = key.split(':')
      for (const h of g.history ?? []) {
        rows.push({
          ...h,
          key,
          categoryId: categoryId ?? '—',
          gameLabel: (gameId ?? key).replace(/-/g, ' '),
        })
      }
    }
    rows.sort((a, b) => (a.at < b.at ? 1 : -1))
    return rows
  }, [all, tick])

  const filtered = history.filter((h) => {
    if (filter === 'win') return h.success
    if (filter === 'loss') return !h.success
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        className="glass-card"
        style={{ padding: 'clamp(1rem, 3vw, 1.35rem)' }}
      >
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.85rem',
            marginBottom: '0.35rem',
          }}
        >
          Nivel de jugador (skill)
        </p>
        <p
          className="mono"
          style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.15rem)',
            fontWeight: 700,
            marginBottom: '0.35rem',
          }}
        >
          {total.skillScore}%
        </p>
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: '0.75rem',
            lineHeight: 1.4,
          }}
        >
          Combina profundidad de niveles, índice de victorias, volumen de juego
          y racha actual.
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
              width: `${total.skillScore}%`,
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
          {total.totalAttempts} intentos · {total.gamesPlayed} juegos
        </p>
      </div>

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

      <div
        className="glass-card"
        style={{
          padding: '1rem 1.15rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <ToggleRow
          label="Contar en racha y ranking"
          desc="Desactívalo al prestar el móvil"
          checked={prefs.rankingEnabled}
          onChange={(v) => {
            soundToggle(v)
            persistPrefs({ ...prefs, rankingEnabled: v })
          }}
        />
        <div
          style={{
            borderTop: '1px solid var(--gco-glass-border)',
            paddingTop: '0.85rem',
          }}
        >
          <ToggleRow
            label="Subida suave de nivel"
            desc="Dificultad más lenta → más rachas"
            checked={prefs.softProgression}
            onChange={(v) => {
              soundToggle(v)
              persistPrefs({ ...prefs, softProgression: v })
            }}
          />
        </div>
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
            {g.categoryId} · {g.totalCompleted}V / {g.totalAttempts} intentos ·{' '}
            {g.winRate}%
            {g.bestTimeMs != null ? ` · mejor ${formatDuration(g.bestTimeMs)}` : ''}
            {g.avgTimeMs != null ? ` · media ${formatDuration(g.avgTimeMs)}` : ''}
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

      {/* Historial completo */}
      <div className="glass-card" style={{ padding: '1rem 1.15rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <p style={{ fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>
            Historial de partidas
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { id: 'all' as const, label: 'Todas' },
                { id: 'win' as const, label: 'Victorias' },
                { id: 'loss' as const, label: 'Derrotas' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`glass-button ${filter === f.id ? '' : 'secondary'}`}
                style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }}
                onClick={() => {
                  soundClick()
                  setFilter(f.id)
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem' }}>
            Sin partidas en este filtro.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.slice(0, 60).map((h, i) => (
            <button
              key={`${h.at}-${i}`}
              type="button"
              onClick={() => {
                soundClick()
                setDetail(h)
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                border: '1px solid var(--gco-glass-border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    textTransform: 'capitalize',
                    fontWeight: 500,
                  }}
                >
                  {h.gameLabel} · Nv. {h.level}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  {formatDateTime(h.at)}
                  {!h.ranked ? ' · sin racha' : ''}
                </p>
              </div>
              <span
                className="mono"
                style={{
                  flexShrink: 0,
                  fontSize: '0.85rem',
                  color: h.success
                    ? 'var(--gco-primary)'
                    : 'var(--gco-secondary)',
                }}
              >
                {h.success ? '✓' : '✗'}
                {h.timeMs != null ? ` ${formatDuration(h.timeMs)}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      {detail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setDetail(null)}
        >
          <div
            className="glass-card"
            style={{ width: 'min(360px, 100%)', padding: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Detalle de partida</p>
            <p style={{ textTransform: 'capitalize', marginBottom: 4 }}>
              {detail.gameLabel}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Categoría: {detail.categoryId}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Nivel: {detail.level}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Resultado:{' '}
              <span
                style={{
                  color: detail.success
                    ? 'var(--gco-primary)'
                    : 'var(--gco-secondary)',
                }}
              >
                {detail.success ? 'Victoria' : 'Derrota'}
              </span>
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Tiempo:{' '}
              {detail.timeMs != null ? formatDuration(detail.timeMs) : '—'}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Fecha: {formatDateTime(detail.at)}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              Contó en racha: {detail.ranked ? 'Sí' : 'No'}
            </p>
            <button
              type="button"
              className="glass-button secondary"
              style={{ marginTop: 14, width: '100%' }}
              onClick={() => {
                soundClick()
                setDetail(null)
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>
          {label}
        </p>
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--gco-ink-muted)',
            lineHeight: 1.4,
            margin: '2px 0 0',
          }}
        >
          {desc}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 24 : 3,
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
  )
}