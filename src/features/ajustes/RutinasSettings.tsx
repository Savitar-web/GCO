import { useState, useEffect } from 'react'
import {
  getRoutinePrefs,
  saveRoutinePrefs,
  getRoutines,
  upsertRoutine,
  deleteRoutine,
  createEmptyRoutine,
  totalRoutineMinutes,
  startRoutineSession,
  type Routine,
  type RoutineActivity,
} from '@/core/storage/routines'
import { soundClick, soundToggle, soundSuccess } from '@/core/audio/uiSounds'

const GAME_OPTIONS = [
  { path: '/memoria/secuencia-colores', label: 'Secuencia de colores' },
  { path: '/memoria/cartas', label: 'Memoria de cartas' },
  { path: '/memoria/numeros-asociados', label: 'Bloques de memoria' },
]

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function RutinasSettings() {
  const [prefs, setPrefs] = useState(getRoutinePrefs)
  const [list, setList] = useState(getRoutines)
  const [editing, setEditing] = useState<Routine | null>(null)

  const refresh = () => {
    setPrefs(getRoutinePrefs())
    setList(getRoutines())
  }

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener('gco:routines-changed', onChange)
    return () => window.removeEventListener('gco:routines-changed', onChange)
  }, [])

  const toggleSystem = () => {
    const next = !prefs.systemEnabled
    soundToggle(next)
    setPrefs(saveRoutinePrefs({ systemEnabled: next }))
  }

  if (editing) {
    return (
      <RoutineEditor
        routine={editing}
        onCancel={() => setEditing(null)}
        onSave={(r) => {
          upsertRoutine({ ...r, updatedAt: new Date().toISOString() })
          soundSuccess()
          setEditing(null)
          refresh()
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Master switch */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.15rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600 }}>Sistema de rutinas</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            Desactivado por defecto. Al activarlo aparece la campana flotante.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.systemEnabled}
          onClick={toggleSystem}
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: prefs.systemEnabled
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
              left: prefs.systemEnabled ? 24 : 3,
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

      {!prefs.systemEnabled && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
          }}
        >
          Activa el sistema para usar rutinas y la campana en pantalla.
        </p>
      )}

      <button
        type="button"
        className="glass-button"
        style={{ padding: '0.65rem 1rem' }}
        onClick={() => {
          soundClick()
          setEditing(createEmptyRoutine())
        }}
      >
        + Nueva rutina
      </button>

      {list.map((r) => (
        <div
          key={r.id}
          className="glass-card"
          style={{ padding: '1rem 1.1rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 600 }}>
                {r.name}{' '}
                {r.isPreset && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--gco-ink-muted)',
                      fontWeight: 500,
                    }}
                  >
                    preset
                  </span>
                )}
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--gco-ink-muted)',
                  marginTop: 2,
                }}
              >
                {r.activities.length} pasos · {totalRoutineMinutes(r)} min
                {r.timeHHMM ? ` · ${r.timeHHMM}` : ''}
              </p>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <button
              type="button"
              className="glass-button"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
              disabled={!prefs.systemEnabled}
              onClick={() => {
                soundClick()
                startRoutineSession(r.id)
                refresh()
              }}
            >
              Iniciar
            </button>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
              onClick={() => {
                soundClick()
                setEditing({
                  ...r,
                  activities: r.activities.map((a) => ({ ...a })),
                })
              }}
            >
              Editar
            </button>
            {!r.isPreset && (
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                onClick={() => {
                  soundClick()
                  deleteRoutine(r.id)
                  refresh()
                }}
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RoutineEditor({
  routine,
  onSave,
  onCancel,
}: {
  routine: Routine
  onSave: (r: Routine) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(routine)

  const updateAct = (id: string, patch: Partial<RoutineActivity>) => {
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.id === id ? { ...a, ...patch } : a
      ),
    }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <button
        type="button"
        className="glass-button secondary"
        onClick={onCancel}
        style={{ alignSelf: 'flex-start', padding: '0.45rem 0.9rem' }}
      >
        ← Cancelar
      </button>

      <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>Nombre</label>
      <input
        className="glass-input"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />

      <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>
        Hora sugerida (opcional)
      </label>
      <input
        className="glass-input mono"
        type="time"
        value={draft.timeHHMM}
        onChange={(e) => setDraft({ ...draft, timeHHMM: e.target.value })}
      />

      <p style={{ fontWeight: 600, marginTop: 4 }}>Actividades</p>
      {draft.activities.map((a, idx) => (
        <div
          key={a.id}
          className="glass-card"
          style={{ padding: '0.85rem 1rem' }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: 6,
            }}
          >
            Paso {idx + 1}
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className={`glass-button ${a.type === 'game' ? '' : 'secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
              onClick={() => {
                soundClick()
                updateAct(a.id, {
                  type: 'game',
                  path: GAME_OPTIONS[0].path,
                  label: GAME_OPTIONS[0].label,
                })
              }}
            >
              Juego
            </button>
            <button
              type="button"
              className={`glass-button ${a.type === 'rest' ? '' : 'secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
              onClick={() => {
                soundClick()
                updateAct(a.id, {
                  type: 'rest',
                  path: undefined,
                  label: 'Descanso',
                })
              }}
            >
              Descanso
            </button>
          </div>
          {a.type === 'game' && (
            <select
              className="glass-input"
              value={a.path ?? ''}
              onChange={(e) => {
                const opt = GAME_OPTIONS.find((o) => o.path === e.target.value)
                updateAct(a.id, {
                  path: e.target.value,
                  label: opt?.label ?? a.label,
                })
              }}
              style={{ marginBottom: 8 }}
            >
              {GAME_OPTIONS.map((o) => (
                <option key={o.path} value={o.path}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {a.type === 'rest' && (
            <input
              className="glass-input"
              value={a.label}
              onChange={(e) => updateAct(a.id, { label: e.target.value })}
              style={{ marginBottom: 8 }}
            />
          )}
          <label style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            Minutos
          </label>
          <input
            className="glass-input mono"
            type="number"
            min={1}
            max={90}
            value={a.durationMin}
            onChange={(e) =>
              updateAct(a.id, {
                durationMin: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
            style={{ maxWidth: 100 }}
          />
          <button
            type="button"
            className="glass-button secondary"
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              marginTop: 8,
            }}
            onClick={() => {
              soundClick()
              setDraft((d) => ({
                ...d,
                activities: d.activities.filter((x) => x.id !== a.id),
              }))
            }}
          >
            Quitar paso
          </button>
        </div>
      ))}

      <button
        type="button"
        className="glass-button secondary"
        onClick={() => {
          soundClick()
          setDraft((d) => ({
            ...d,
            activities: [
              ...d.activities,
              {
                id: uid(),
                type: 'rest',
                label: 'Descanso',
                durationMin: 2,
              },
            ],
          }))
        }}
      >
        + Añadir paso
      </button>

      <button
        type="button"
        className="glass-button"
        onClick={() => onSave(draft)}
        style={{ padding: '0.7rem 1rem' }}
      >
        Guardar rutina
      </button>
    </div>
  )
}