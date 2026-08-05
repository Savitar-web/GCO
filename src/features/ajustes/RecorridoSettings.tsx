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

  const losses = Math.max(0, total.totalAttempts - total.totalCompleted)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Hero skill */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.3rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-40% -20% auto auto',
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--gco-primary-dim), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '0.78rem',
            margin: 0,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Nivel de jugador
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 6,
            marginBottom: 10,
          }}
        >
          <p
            className="mono"
            style={{
              fontSize: 'clamp(2rem, 6vw, 2.4rem)',
              fontWeight: 700,
              margin: 0,
              background:
                'linear-gradient(90deg, var(--gco-primary), var(--gco-accent))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {total.skillScore}
          </p>
          <span style={{ color: 'var(--gco-ink-muted)', fontSize: '0.95rem' }}>
            / 100 skill
          </span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: 'rgba(127,127,127,0.18)',
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
            marginTop: 12,
            fontSize: '0.82rem',
            color: 'var(--gco-ink-muted)',
            lineHeight: 1.5,
            marginBottom: 0,
          }}
        >
          Combina profundidad de niveles, índice de victorias, volumen de
          partidas y racha. Más realista que un simple % de niveles.
        </p>
      </div>

      {/* KPI grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}
      >
        <Kpi
          label="Racha"
          value={`${total.streak.current}`}
          suffix="días"
          sub={`Mejor ${total.streak.best}`}
        />
        <Kpi
          label="Índice victoria"
          value={`${total.winRate}%`}
          accent
          sub={`${total.totalCompleted}V · ${losses}D`}
        />
        <Kpi
          label="Niveles"
          value={`${total.totalLevels}`}
          sub={`${total.gamesPlayed} juegos`}
        />
        <Kpi
          label="Intentos"
          value={`${total.totalAttempts}`}
          sub={`${total.totalCompleted} victorias`}
        />
      </div>

      {/* Prefs */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.15rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--gco-ink-muted)',
            fontWeight: 600,
          }}
        >
          Preferencias
        </p>
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
            height: 1,
            background: 'var(--gco-glass-border)',
          }}
        />
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

      {/* Por juego */}
      {total.byGame.length > 0 && (
        <p
          style={{
            margin: '0.15rem 0 0',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--gco-ink-muted)',
            fontWeight: 600,
          }}
        >
          Por juego
        </p>
      )}

      {total.byGame.map((g) => {
        const d = Math.max(0, g.totalAttempts - g.totalCompleted)
        return (
          <div
            key={g.key}
            className="glass-card"
            style={{ padding: '1rem 1.15rem' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
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
                marginTop: 6,
                marginBottom: 0,
                lineHeight: 1.45,
              }}
            >
              {g.categoryId} · {g.totalCompleted}V / {d}D · índice {g.winRate}%
              {g.bestTimeMs != null
                ? ` · mejor ${formatDuration(g.bestTimeMs)}`
                : ''}
              {g.avgTimeMs != null
                ? ` · media ${formatDuration(g.avgTimeMs)}`
                : ''}
            </p>
            <div
              style={{
                marginTop: 10,
                height: 4,
                borderRadius: 999,
                background: 'rgba(127,127,127,0.15)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, g.winRate)}%`,
                  background: 'var(--gco-primary)',
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        )
      })}

      {total.byGame.length === 0 && (
        <p
          style={{
            color: 'var(--gco-ink-muted)',
            textAlign: 'center',
            padding: '1.25rem 0',
          }}
        >
          Todavía no hay progreso. ¡Entrena un poco!
        </p>
      )}

      {/* Historial */}
      <div className="glass-card" style={{ padding: '1.1rem 1.15rem' }}>
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
            Historial
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
          {filtered.slice(0, 80).map((h, i) => (
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
                gap: 10,
                alignItems: 'center',
                padding: '0.65rem 0.75rem',
                borderRadius: 12,
                border: '1px solid var(--gco-glass-border)',
                background: 'var(--gco-glass-bg)',
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
                    fontSize: '0.88rem',
                    textTransform: 'capitalize',
                    fontWeight: 600,
                  }}
                >
                  {h.gameLabel}
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--gco-ink-muted)',
                    }}
                  >
                    {' '}
                    · Nv. {h.level}
                  </span>
                </p>
                <p
                  style={{
                    margin: '3px 0 0',
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
                  fontSize: '0.88rem',
                  fontWeight: 700,
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
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setDetail(null)}
        >
          <div
            className="glass-card"
            style={{ width: 'min(380px, 100%)', padding: '1.35rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontWeight: 700, margin: '0 0 12px', fontSize: '1.05rem' }}>
              Detalle de partida
            </p>
            <DetailRow label="Juego" value={detail.gameLabel} />
            <DetailRow label="Categoría" value={detail.categoryId} />
            <DetailRow label="Nivel" value={String(detail.level)} />
            <DetailRow
              label="Resultado"
              value={detail.success ? 'Victoria' : 'Derrota'}
              color={
                detail.success ? 'var(--gco-primary)' : 'var(--gco-secondary)'
              }
            />
            <DetailRow
              label="Tiempo"
              value={
                detail.timeMs != null ? formatDuration(detail.timeMs) : '—'
              }
            />
            <DetailRow label="Fecha" value={formatDateTime(detail.at)} />
            <DetailRow
              label="Contó en racha"
              value={detail.ranked ? 'Sí' : 'No'}
            />
            <button
              type="button"
              className="glass-button secondary"
              style={{ marginTop: 16, width: '100%' }}
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

function Kpi({
  label,
  value,
  suffix,
  sub,
  accent,
}: {
  label: string
  value: string
  suffix?: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="glass-card" style={{ padding: '1rem 1.05rem' }}>
      <p
        style={{
          fontSize: '0.72rem',
          color: 'var(--gco-ink-muted)',
          margin: 0,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
      <p
        className="mono"
        style={{
          fontSize: '1.45rem',
          fontWeight: 700,
          margin: '4px 0 2px',
          color: accent ? 'var(--gco-primary)' : 'var(--gco-ink)',
        }}
      >
        {value}
        {suffix && (
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--gco-ink-muted)',
            }}
          >
            {' '}
            {suffix}
          </span>
        )}
      </p>
      <p
        style={{
          fontSize: '0.72rem',
          color: 'var(--gco-ink-muted)',
          margin: 0,
        }}
      >
        {sub}
      </p>
    </div>
  )
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0.4rem 0',
        borderBottom: '1px solid var(--gco-glass-border)',
        fontSize: '0.88rem',
      }}
    >
      <span style={{ color: 'var(--gco-ink-muted)' }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          textTransform: 'capitalize',
          color: color ?? 'var(--gco-ink)',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
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