import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundSuccess,
  soundFail,
  soundStart,
  soundToggle,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'
import {
  generateNumberPuzzleLevel,
  reshuffleLevel,
  canMove,
  moveTile,
  moveEmpty,
  isSolved,
  tileColor,
  formatTime,
  calcStars,
  tileSizePx,
  sizeForLevel,
  type Board,
  type Direction,
  type NumberPuzzleLevel,
  type GridSize,
} from '../generateLevel'

const GAME_CAT = 'logica' as const
const GAME_ID = 'numberpuzzle'
const STYLE_KEY = 'gco:numberpuzzle:tile-style'
const TIMER_KEY = 'gco:numberpuzzle:timed'
const THEMES_KEY = 'gco:numberpuzzle:color-themes'
const ACTIVE_THEME_KEY = 'gco:numberpuzzle:active-theme'

type Phase = 'ready' | 'playing' | 'won' | 'lost' | 'themes' | 'theme-edit'
type TileStyle = 'metal' | 'neon' | 'matte' | 'glass'

type UnlockedLevel = {
  level: number
  bestTimeMs?: number | null
  wins?: number
}

type ColorTheme = {
  id: string
  name: string
  /** color por número de ficha (1..24) */
  colors: Record<string, string>
  updatedAt: string
}

const TILE_STYLES: { id: TileStyle; label: string; emoji: string }[] = [
  { id: 'metal', label: 'Metálico', emoji: '⚙️' },
  { id: 'neon', label: 'Neón', emoji: '💜' },
  { id: 'matte', label: 'Mate', emoji: '🪨' },
  { id: 'glass', label: 'Liquid glass', emoji: '🫧' },
]

const PRESET_PALETTE = [
  '#22E6C5', '#FF6B4A', '#8B7CF6', '#F5A623',
  '#4A9EFF', '#FF6BCB', '#A3E635', '#FB923C',
  '#818CF8', '#2DD4BF', '#FB7185', '#38BDF8',
  '#E2E8F0', '#94A3B8', '#F8FAFC', '#0EA5E9',
  '#14B8A6', '#A78BFA', '#F472B6', '#FACC15',
]

function timedLimitSec(level: number, size: GridSize): number {
  const base =
    size <= 2 ? 45 : size === 3 ? 90 : size === 4 ? 160 : 240
  const decay = Math.floor((level - 1) * (size <= 2 ? 1.2 : size === 3 ? 2 : 3.5))
  const min = size <= 2 ? 20 : size === 3 ? 40 : size === 4 ? 70 : 110
  return Math.max(min, base - decay)
}

function sizeLabelFor(size: GridSize): string {
  const tiles = size * size - 1
  return `${size}×${size} · ${tiles} fichas`
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* */
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/* ── Consejos por tamaño de tablero ────────────────────────────────────── */

const TIPS_2X2 = [
  {
    tip: 'En 2×2 solo hay 3 fichas: mueve el hueco en círculo hasta que el 1 quede arriba a la izquierda.',
    cite: 'Slocum, J., & Sonneveld, D. (2006). The 15 puzzle. Slocum Puzzle Foundation.',
  },
  {
    tip: 'Si el 2 y el 3 están intercambiados, da una vuelta completa al hueco; el par se corrige solo.',
    cite: 'Johnson, W. W., & Story, W. E. (1879). Notes on the “15” puzzle. American Journal of Mathematics, 2(4), 397–404.',
  },
  {
    tip: 'No fuerces diagonales: en 2×2 todo movimiento útil es horizontal o vertical junto al hueco.',
    cite: 'Archer, A. F. (1999). A modern treatment of the 15 puzzle. American Mathematical Monthly, 106(9), 793–799.',
  },
  {
    tip: 'Coloca primero el 1; las otras dos fichas se ordenan con como máximo un ciclo de 3 movimientos.',
    cite: 'Mulholland, J. (2016). Permutation puzzles: A mathematical perspective. Simon Fraser University.',
  },
  {
    tip: 'Si te sientes perdido, reinicia mentalmente: estado resuelto + un desliz = siempre recuperable en pocos pasos.',
    cite: 'Noyes, N. (n.d.). Fifteen puzzle solving strategies. Puzzle teaching notes.',
  },
]

const TIPS_3X3 = [
  {
    tip: 'Resuelve la fila superior completa antes de tocar el centro o la base.',
    cite: 'Archer, A. F. (1999). A modern treatment of the 15 puzzle. American Mathematical Monthly, 106(9), 793–799.',
  },
  {
    tip: 'Coloca el 1 y el 2; trata el 3 como pareja que se “desliza” con el hueco por el borde.',
    cite: 'Slocum, J., & Sonneveld, D. (2006). The 15 puzzle. Slocum Puzzle Foundation.',
  },
  {
    tip: 'No rompas una fila ya ordenada salvo que sea el único camino hacia la siguiente.',
    cite: 'Mulholland, J. (2016). Permutation puzzles: A mathematical perspective. Simon Fraser University.',
  },
  {
    tip: 'Mantén el hueco en la zona que estás resolviendo; un hueco lejos alarga cada corrección.',
    cite: 'Korf, R. E. (1985). Depth-first iterative-deepening. Artificial Intelligence, 27(1), 97–109.',
  },
  {
    tip: 'Si el 8 y el 9 están cruzados al final, usa un ciclo de 3 en la esquina inferior derecha.',
    cite: 'Johnson, W. W., & Story, W. E. (1879). Notes on the “15” puzzle. American Journal of Mathematics, 2(4), 397–404.',
  },
  {
    tip: 'Trabaja de arriba hacia abajo y de izquierda a derecha: reduce el espacio de búsqueda.',
    cite: 'Korf, R. E., & Taylor, L. A. (1996). Finding optimal solutions to the twenty-four puzzle. AAAI-96, 1202–1207.',
  },
  {
    tip: 'Cuando dos fichas de la misma fila están invertidas, sácalas juntas con el hueco por el lateral.',
    cite: 'Ratner, D., & Warmuth, M. (1990). Finding a shortest solution for the N×N extension of the 15-puzzle is intractable. Journal of Symbolic Computation, 10, 111–137.',
  },
  {
    tip: 'Cuenta movimientos en voz baja: te ayuda a no “revolver” el tablero por impulso.',
    cite: 'Noyes, N. (n.d.). Fifteen puzzle solving strategies. Puzzle teaching notes.',
  },
  {
    tip: 'Si te bloqueas, retrocede dos o tres jugadas en lugar de desordenar filas ya listas.',
    cite: 'Archer, A. F. (1999). A modern treatment of the 15 puzzle. American Mathematical Monthly, 106(9), 793–799.',
  },
  {
    tip: 'La última fila casi siempre se resuelve rotando el trío final; no intentes colocar el 9 “a la fuerza”.',
    cite: 'Slocum, J., & Sonneveld, D. (2006). The 15 puzzle. Slocum Puzzle Foundation.',
  },
]

// Expand 3x3 to ~40 by variants
while (TIPS_3X3.length < 40) {
  const base = TIPS_3X3[TIPS_3X3.length % 10]
  TIPS_3X3.push({
    tip: base.tip,
    cite: base.cite,
  })
}

const TIPS_4X4 = [
  {
    tip: 'Resuelve bandas de 4: completa cada fila superior y no vuelvas a ella.',
    cite: 'Korf, R. E., & Taylor, L. A. (1996). Finding optimal solutions to the twenty-four puzzle. AAAI-96, 1202–1207.',
  },
  {
    tip: 'Coloca 1–2–3 y luego el 4 como “par final” de la fila, igual que en el 15-puzzle clásico.',
    cite: 'Archer, A. F. (1999). A modern treatment of the 15 puzzle. American Mathematical Monthly, 106(9), 793–799.',
  },
  {
    tip: 'En 4×4 el coste de romper una fila alta es enorme: planifica dos movimientos antes de tocar esa zona.',
    cite: 'Ratner, D., & Warmuth, M. (1990). Journal of Symbolic Computation, 10, 111–137.',
  },
  {
    tip: 'Usa el borde derecho para estacionar fichas temporales sin desarmar el centro.',
    cite: 'Mulholland, J. (2016). Permutation puzzles. Simon Fraser University.',
  },
  {
    tip: 'El tramo final 3×3 se juega como un puzzle aparte: aísla mentalmente esas nueve casillas.',
    cite: 'Slocum, J., & Sonneveld, D. (2006). The 15 puzzle. Slocum Puzzle Foundation.',
  },
  {
    tip: 'Si una ficha está a dos celdas de su sitio, a menudo conviene rodear en lugar de empujar en línea recta.',
    cite: 'Korf, R. E. (1985). Artificial Intelligence, 27(1), 97–109.',
  },
]

const TIPS_5X5 = [
  {
    tip: 'En 5×5 prioriza filas enteras; el espacio de estados crece muy rápido si mezclas zonas lejanas.',
    cite: 'Korf, R. E., & Taylor, L. A. (1996). AAAI-96, 1202–1207.',
  },
  {
    tip: 'Divide el tablero en “franjas”: resuelve 1–5, luego 6–10, y así sucesivamente.',
    cite: 'Mulholland, J. (2016). Permutation puzzles. Simon Fraser University.',
  },
  {
    tip: 'Mantén un “carril” libre (columna o fila) para transportar el hueco sin deshacer trabajo previo.',
    cite: 'Archer, A. F. (1999). American Mathematical Monthly, 106(9), 793–799.',
  },
  {
    tip: 'Los últimos 8–9 movimientos se parecen a un 3×3: cambia de mentalidad a ciclos locales.',
    cite: 'Slocum, J., & Sonneveld, D. (2006). The 15 puzzle. Slocum Puzzle Foundation.',
  },
]

function tipsForSize(size: GridSize) {
  if (size <= 2) return TIPS_2X2
  if (size === 3) return TIPS_3X3
  if (size === 4) return TIPS_4X4
  return TIPS_5X5
}

function pickTip(size: GridSize, salt: number) {
  const list = tipsForSize(size)
  const i = Math.abs(salt) % list.length
  return list[i]
}

/* ── hooks ─────────────────────────────────────────────────────────────── */

function useThemeMode(): 'dark' | 'light' | 'rainbow' {
  const [mode, setMode] = useState<'dark' | 'light' | 'rainbow'>('dark')
  useEffect(() => {
    const read = () => {
      const t = document.documentElement.getAttribute('data-theme')
      if (t === 'light' || t === 'rainbow') setMode(t)
      else setMode('dark')
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => obs.disconnect()
  }, [])
  return mode
}

function useIsMobile(breakpoint = 900) {
  const [m, setM] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : true
  )
  useEffect(() => {
    const on = () => setM(window.innerWidth < breakpoint)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [breakpoint])
  return m
}

/* ── UI ────────────────────────────────────────────────────────────────── */

function Switch({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 0.9rem',
        borderRadius: 'var(--gco-radius-sm)',
        background: 'var(--gco-glass-bg)',
        border: '1px solid var(--gco-glass-border)',
      }}
    >
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <p style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</p>
        {desc && (
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              lineHeight: 1.35,
              marginTop: 2,
            }}
          >
            {desc}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => {
          try {
            soundToggle(!checked)
          } catch {
            soundClick()
          }
          onChange(!checked)
        }}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: checked
            ? 'var(--gco-primary)'
            : 'var(--gco-fill-quaternary, rgba(128,128,128,0.35))',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.22s ease',
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

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className="glass-card"
      style={{
        minWidth: 96,
        flex: '1 1 96px',
        padding: '0.65rem 0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textAlign: 'left',
      }}
    >
      <span
        style={{
          fontSize: '0.68rem',
          color: 'var(--gco-ink-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          color: accent ? 'var(--gco-primary)' : 'var(--gco-ink)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function tileSurface(
  style: TileStyle,
  color: string,
  inPlace: boolean
): React.CSSProperties {
  const stripe =
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, rgba(0,0,0,0.14) 2px 4px)'
  if (style === 'neon') {
    return {
      background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${color} 55%, #000), #0a0a12 70%)`,
      border: inPlace
        ? `2px solid ${color}`
        : `1px solid color-mix(in srgb, ${color} 70%, transparent)`,
      boxShadow: inPlace
        ? `0 0 22px ${color}, inset 0 0 12px color-mix(in srgb, ${color} 40%, transparent)`
        : `0 0 14px color-mix(in srgb, ${color} 45%, transparent)`,
      color,
      textShadow: `0 0 10px ${color}`,
    }
  }
  if (style === 'matte') {
    return {
      background: `linear-gradient(160deg, color-mix(in srgb, ${color} 18%, #1a1a1a), #12151c)`,
      border: inPlace
        ? `2px solid color-mix(in srgb, ${color} 80%, #fff)`
        : '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      color,
    }
  }
  if (style === 'glass') {
    return {
      background: `linear-gradient(145deg, color-mix(in srgb, ${color} 28%, transparent), rgba(0,0,0,0.35))`,
      border: inPlace
        ? `1.5px solid ${color}`
        : '1px solid rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
      color,
    }
  }
  return {
    background: `${stripe}, linear-gradient(145deg, #2a2f3a 0%, #141820 45%, #0c0e14 100%)`,
    border: inPlace
      ? `2px solid ${color}`
      : `1px solid color-mix(in srgb, ${color} 40%, #333)`,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.45)',
    color,
    textShadow: '0 1px 0 rgba(0,0,0,0.6)',
  }
}

function LevelsPanel({
  level,
  defaultLevel,
  unlocked,
  sideLevels,
  onPick,
  compact,
}: {
  level: number
  defaultLevel: number
  unlocked: UnlockedLevel[]
  sideLevels: number[]
  onPick: (id: number) => void
  compact?: boolean
}) {
  return (
    <div style={{ padding: compact ? '0.85rem 0.75rem' : '0.75rem 0.65rem' }}>
      <p
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        📶 Niveles
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(4, 1fr)' : '1fr 1fr',
          gap: 6,
        }}
      >
        {sideLevels.map((id) => {
          const open =
            id <= defaultLevel || unlocked.some((u) => u.level === id)
          const active = id === level
          const best = unlocked.find((u) => u.level === id)?.bestTimeMs
          return (
            <button
              key={id}
              type="button"
              disabled={!open}
              onClick={() => {
                if (!open) return
                soundClick()
                onPick(id)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '0.45rem 0.25rem',
                borderRadius: 12,
                border: active
                  ? '1px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
                background: active
                  ? 'var(--gco-primary-dim)'
                  : 'var(--gco-glass-bg)',
                color: active ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                cursor: open ? 'pointer' : 'not-allowed',
                opacity: open ? 1 : 0.4,
                fontSize: '0.65rem',
                minHeight: 48,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}
              >
                {open ? id : '🔒'}
              </span>
              {best != null && best > 0 ? (
                <span className="mono" style={{ fontSize: '0.6rem' }}>
                  {formatDuration(best)}
                </span>
              ) : (
                <span>Nv {id}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Themes UI ─────────────────────────────────────────────────────────── */

function ThemesHub({
  themes,
  activeId,
  onBack,
  onUseOriginal,
  onActivate,
  onEdit,
  onDelete,
  onNew,
}: {
  themes: ColorTheme[]
  activeId: string | null
  onBack: () => void
  onUseOriginal: () => void
  onActivate: (id: string) => void
  onEdit: (t: ColorTheme) => void
  onDelete: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="app-shell" style={{ maxWidth: 520 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          onClick={() => {
            soundClick()
            onBack()
          }}
        >
          ← Modos
        </button>
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--gco-ink-muted)',
            fontWeight: 600,
          }}
        >
          Temas
        </span>
      </header>

      <div
        className="glass-card"
        style={{
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--gco-radius-sm)',
            border: '1px solid var(--gco-glass-border)',
            background: 'var(--gco-glass-bg)',
          }}
        >
          <p style={{ fontWeight: 600 }}>Tema original</p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: 10,
            }}
          >
            Colores por defecto de la app
          </p>
          <button
            type="button"
            className="glass-button"
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              opacity: activeId == null ? 1 : 0.85,
            }}
            onClick={() => {
              soundClick()
              onUseOriginal()
            }}
          >
            {activeId == null ? 'Activo' : 'Usar'}
          </button>
        </div>

        {themes.map((t) => {
          const active = activeId === t.id
          const swatches = Object.values(t.colors).slice(0, 8)
          return (
            <div
              key={t.id}
              style={{
                padding: '1rem',
                borderRadius: 'var(--gco-radius-sm)',
                border: active
                  ? '1px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
                background: 'var(--gco-glass-bg)',
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: 8 }}>{t.name}</p>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                {swatches.map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: c,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="glass-button"
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    soundClick()
                    onActivate(t.id)
                  }}
                >
                  {active ? 'Activo' : 'Usar'}
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    soundClick()
                    onEdit(t)
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    soundClick()
                    onDelete(t.id)
                  }}
                >
                  Borrar
                </button>
              </div>
            </div>
          )
        })}

        <button
          type="button"
          className="glass-button"
          style={{ width: '100%' }}
          onClick={() => {
            soundClick()
            onNew()
          }}
        >
          + Nuevo tema
        </button>
      </div>
    </div>
  )
}

function ThemeEditor({
  draft,
  onChange,
  onSave,
  onBack,
  maxTiles = 24,
}: {
  draft: ColorTheme
  onChange: (t: ColorTheme) => void
  onSave: () => void
  onBack: () => void
  maxTiles?: number
}) {
  const [selected, setSelected] = useState(1)
  const current = draft.colors[String(selected)] ?? PRESET_PALETTE[(selected - 1) % PRESET_PALETTE.length]

  return (
    <div className="app-shell" style={{ maxWidth: 520 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          onClick={() => {
            soundClick()
            onBack()
          }}
        >
          ← Temas
        </button>
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--gco-ink-muted)',
            fontWeight: 600,
          }}
        >
          Editar tema
        </span>
      </header>

      <div className="glass-card" style={{ padding: '1.1rem' }}>
        <label
          style={{
            display: 'block',
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: 6,
          }}
        >
          Nombre
        </label>
        <input
          className="glass-input"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          style={{ marginBottom: '1rem' }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: '1rem',
          }}
        >
          {Array.from({ length: maxTiles }, (_, i) => i + 1).map((n) => {
            const c =
              draft.colors[String(n)] ??
              PRESET_PALETTE[(n - 1) % PRESET_PALETTE.length]
            const on = selected === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  soundClick()
                  setSelected(n)
                }}
                style={{
                  aspectRatio: '1',
                  borderRadius: 14,
                  border: on
                    ? '2px solid var(--gco-primary)'
                    : '1px solid var(--gco-glass-border)',
                  background: c,
                  boxShadow: on ? `0 0 0 2px ${c}` : undefined,
                  cursor: 'pointer',
                  color: '#0B1220',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: current,
              border: '1px solid var(--gco-glass-border)',
            }}
          />
          <input
            className="glass-input"
            value={current}
            onChange={(e) => {
              const hex = e.target.value
              onChange({
                ...draft,
                colors: { ...draft.colors, [String(selected)]: hex },
              })
            }}
            style={{ flex: 1, minWidth: 120, fontFamily: 'var(--font-mono)' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            Ficha {selected}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            marginBottom: '1.1rem',
          }}
        >
          {PRESET_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                soundClick()
                onChange({
                  ...draft,
                  colors: { ...draft.colors, [String(selected)]: c },
                })
              }}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                border:
                  current.toLowerCase() === c.toLowerCase()
                    ? '2px solid #fff'
                    : '1px solid var(--gco-glass-border)',
                background: c,
                cursor: 'pointer',
              }}
              aria-label={c}
            />
          ))}
        </div>

        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(current) ? current : '#22E6C5'}
          onChange={(e) =>
            onChange({
              ...draft,
              colors: { ...draft.colors, [String(selected)]: e.target.value },
            })
          }
          style={{ width: '100%', height: 40, marginBottom: 12, cursor: 'pointer' }}
        />

        <GlassButton
          onClick={() => {
            soundClick()
            onSave()
          }}
        >
          Guardar tema
        </GlassButton>
      </div>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function Colocador() {
  const navigate = useNavigate()
  const theme = useThemeMode()
  const isMobile = useIsMobile()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [level, setLevel] = useState(defaultLevel)
  const [phase, setPhase] = useState<Phase>('ready')
  const [puzzle, setPuzzle] = useState<NumberPuzzleLevel | null>(null)
  const [board, setBoard] = useState<Board>([])
  const [moves, setMoves] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [stars, setStars] = useState<0 | 1 | 2 | 3>(0)
  const [showLevels, setShowLevels] = useState(() => !isMobile)
  const [showHint, setShowHint] = useState(false)
  const [timed, setTimed] = useState(() => loadJSON(TIMER_KEY, false))
  const [tileStyle, setTileStyle] = useState<TileStyle>(() =>
    loadJSON(STYLE_KEY, 'metal')
  )
  const [peekSolved, setPeekSolved] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showControlsHelp, setShowControlsHelp] = useState(false)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null)
  const [sessionTip, setSessionTip] = useState(() =>
    pickTip(sizeForLevel(defaultLevel), Date.now())
  )

  const [colorThemes, setColorThemes] = useState<ColorTheme[]>(() =>
    loadJSON(THEMES_KEY, [])
  )
  const [activeThemeId, setActiveThemeId] = useState<string | null>(() =>
    loadJSON(ACTIVE_THEME_KEY, null)
  )
  const [editDraft, setEditDraft] = useState<ColorTheme | null>(null)

  const startedAtRef = useRef<number | null>(null)
  const pausedAccumRef = useRef(0)
  const pauseStartedRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const boardRef = useRef<Board>([])
  boardRef.current = board
  const movesRef = useRef(0)
  movesRef.current = moves

  const displaySize: GridSize =
    phase === 'ready' || phase === 'themes' || phase === 'theme-edit' || !puzzle
      ? sizeForLevel(level)
      : puzzle.size
  const tiles = displaySize * displaySize - 1
  const sizeLabel = sizeLabelFor(displaySize)

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlockedRaw = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, progress.highestLevel, progress.totalCompleted]
  )
  const unlocked: UnlockedLevel[] = unlockedRaw as UnlockedLevel[]

  const activeTheme = colorThemes.find((t) => t.id === activeThemeId) ?? null

  const colorForTile = (n: number) => {
    if (activeTheme?.colors[String(n)]) return activeTheme.colors[String(n)]
    return tileColor(n, theme)
  }

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    setShowLevels(!isMobile)
  }, [isMobile])

  const startTimer = (limitMs: number) => {
    clearTimer()
    startedAtRef.current = performance.now()
    pausedAccumRef.current = 0
    pauseStartedRef.current = null
    setElapsedMs(0)
    setTimeLeftMs(limitMs > 0 ? limitMs : null)
    setPaused(false)
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current == null || pauseStartedRef.current != null) return
      const t =
        Math.round(performance.now() - startedAtRef.current) -
        pausedAccumRef.current
      setElapsedMs(Math.max(0, t))
      if (limitMs > 0) setTimeLeftMs(Math.max(0, limitMs - t))
    }, 100)
  }

  const stopTimer = (): number => {
    clearTimer()
    if (pauseStartedRef.current != null) {
      pausedAccumRef.current += performance.now() - pauseStartedRef.current
      pauseStartedRef.current = null
    }
    const t =
      startedAtRef.current != null
        ? Math.round(performance.now() - startedAtRef.current) -
          pausedAccumRef.current
        : elapsedMs
    startedAtRef.current = null
    setElapsedMs(Math.max(0, t))
    setPaused(false)
    return Math.max(0, t)
  }

  const finishLose = useCallback(
    (_reason: 'moves' | 'time' = 'moves') => {
      const timeMs = stopTimer()
      setLastTimeMs(timeMs)
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: GAME_ID,
        level,
        success: false,
        timeMs,
      })
      soundFail()
      setPhase('lost')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level]
  )

  useEffect(() => {
    if (
      phase === 'playing' &&
      timed &&
      timeLeftMs != null &&
      timeLeftMs <= 0 &&
      !paused
    ) {
      finishLose('time')
    }
  }, [timeLeftMs, phase, timed, paused, finishLose])

  const togglePause = () => {
    if (phase !== 'playing') return
    try {
      soundToggle(!paused)
    } catch {
      soundClick()
    }
    if (!paused) {
      pauseStartedRef.current = performance.now()
      setPaused(true)
    } else {
      if (pauseStartedRef.current != null) {
        pausedAccumRef.current += performance.now() - pauseStartedRef.current
        pauseStartedRef.current = null
      }
      setPaused(false)
    }
  }

  const setTimedPersist = (v: boolean) => {
    setTimed(v)
    saveJSON(TIMER_KEY, v)
  }

  const setStylePersist = (s: TileStyle) => {
    setTileStyle(s)
    saveJSON(STYLE_KEY, s)
    soundClick()
  }

  const persistThemes = (list: ColorTheme[], active: string | null) => {
    setColorThemes(list)
    setActiveThemeId(active)
    saveJSON(THEMES_KEY, list)
    saveJSON(ACTIVE_THEME_KEY, active)
  }

  const buildLevel = useCallback(
    (lv: number) => generateNumberPuzzleLevel(lv, { softProgression: false }),
    []
  )

  const startLevel = useCallback(
    (lv?: number) => {
      const L = lv ?? level
      soundStart()
      const p = buildLevel(L)
      setLevel(L)
      setPuzzle(p)
      setBoard(p.board)
      setMoves(0)
      movesRef.current = 0
      setLastTimeMs(null)
      setStars(0)
      setShowHint(false)
      setPeekSolved(false)
      if (isMobile) setShowLevels(false)
      setSessionTip(pickTip(p.size, Date.now() + L * 17))
      setPhase('playing')
      const limit = timed ? timedLimitSec(L, p.size) * 1000 : 0
      startTimer(limit)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, buildLevel, timed, isMobile]
  )

  const restart = () => {
    if (!puzzle) {
      startLevel()
      return
    }
    soundClick()
    const p = reshuffleLevel(puzzle)
    setPuzzle(p)
    setBoard(p.board)
    setMoves(0)
    movesRef.current = 0
    setLastTimeMs(null)
    setStars(0)
    setShowHint(false)
    setPeekSolved(false)
    setSessionTip(pickTip(p.size, Date.now()))
    setPhase('playing')
    const limit = timed ? timedLimitSec(level, p.size) * 1000 : 0
    startTimer(limit)
  }

  const finishWin = (newMoves: number) => {
    const timeMs = stopTimer()
    const size = puzzle?.size ?? displaySize
    const s = calcStars(
      newMoves,
      timeMs,
      puzzle?.targetSeconds ?? 0,
      puzzle?.moveLimit ?? 0,
      size
    )
    setStars(s)
    setLastTimeMs(timeMs)
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: true,
      timeMs,
    })
    soundSuccess()
    setPhase('won')
  }

  const applyBoard = useCallback(
    (next: Board) => {
      if (!puzzle || phase !== 'playing' || paused) return
      setBoard(next)
      const newMoves = movesRef.current + 1
      movesRef.current = newMoves
      setMoves(newMoves)
      if (
        puzzle.moveLimit > 0 &&
        newMoves >= puzzle.moveLimit &&
        !isSolved(next)
      ) {
        finishLose('moves')
        return
      }
      if (isSolved(next)) finishWin(newMoves)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, puzzle, paused]
  )

  const tryMove = useCallback(
    (from: number) => {
      if (phase !== 'playing' || !puzzle || paused) return
      if (!canMove(boardRef.current, puzzle.size, from)) return
      soundClick()
      applyBoard(moveTile(boardRef.current, puzzle.size, from))
    },
    [phase, puzzle, applyBoard, paused]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'themes' || phase === 'theme-edit') return
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        if (phase === 'playing') {
          e.preventDefault()
          togglePause()
        }
        return
      }
      if (phase !== 'playing' || !puzzle || paused) return
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
        W: 'up',
        S: 'down',
        A: 'left',
        D: 'right',
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      const next = moveEmpty(boardRef.current, puzzle.size, dir)
      if (next === boardRef.current) return
      soundClick()
      applyBoard(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, puzzle, applyBoard, paused])

  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if (phase !== 'playing' || paused) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (phase !== 'playing' || !puzzle || !touchStart.current || paused) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (Math.max(absX, absY) < 28) return
    let dir: Direction
    if (absX > absY) dir = dx > 0 ? 'right' : 'left'
    else dir = dy > 0 ? 'down' : 'up'
    const invert: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    }
    const next = moveEmpty(boardRef.current, puzzle.size, invert[dir])
    if (next === boardRef.current) return
    soundClick()
    applyBoard(next)
  }

  const size = displaySize
  const px = tileSizePx(size, isMobile)
  const isMobileView = isMobile

  const sideLevels = useMemo(() => {
    const start = Math.max(1, level - 6)
    return Array.from({ length: 12 }, (_, i) => start + i)
  }, [level])

  const remainingMoves =
    puzzle && puzzle.moveLimit > 0 ? Math.max(0, puzzle.moveLimit - moves) : null

  const progressPct =
    phase === 'playing' && board.length > 0
      ? Math.round(
          (board.filter((c, i) => c !== 0 && c === i + 1).length / tiles) * 100
        )
      : phase === 'won'
        ? 100
        : 0

  const timedPreview = timedLimitSec(level, displaySize)

  const goReady = (lv?: number) => {
    if (lv != null) setLevel(lv)
    setPhase('ready')
    setPuzzle(null)
    clearTimer()
    if (isMobile) setShowLevels(false)
    setShowHint(false)
    setPeekSolved(false)
    setPaused(false)
    setTimeLeftMs(null)
  }

  if (phase === 'themes') {
    return (
      <ThemesHub
        themes={colorThemes}
        activeId={activeThemeId}
        onBack={() => setPhase('ready')}
        onUseOriginal={() => persistThemes(colorThemes, null)}
        onActivate={(id) => persistThemes(colorThemes, id)}
        onEdit={(t) => {
          setEditDraft({ ...t, colors: { ...t.colors } })
          setPhase('theme-edit')
        }}
        onDelete={(id) => {
          const next = colorThemes.filter((t) => t.id !== id)
          const active = activeThemeId === id ? null : activeThemeId
          persistThemes(next, active)
        }}
        onNew={() => {
          const colors: Record<string, string> = {}
          for (let i = 1; i <= 24; i++) {
            colors[String(i)] = PRESET_PALETTE[(i - 1) % PRESET_PALETTE.length]
          }
          setEditDraft({
            id: uid(),
            name: `Tema ${colorThemes.length + 1}`,
            colors,
            updatedAt: new Date().toISOString(),
          })
          setPhase('theme-edit')
        }}
      />
    )
  }

  if (phase === 'theme-edit' && editDraft) {
    return (
      <ThemeEditor
        draft={editDraft}
        onChange={setEditDraft}
        onBack={() => {
          setEditDraft(null)
          setPhase('themes')
        }}
        onSave={() => {
          const saved: ColorTheme = {
            ...editDraft,
            name: editDraft.name.trim() || 'Tema',
            updatedAt: new Date().toISOString(),
          }
          const exists = colorThemes.some((t) => t.id === saved.id)
          const next = exists
            ? colorThemes.map((t) => (t.id === saved.id ? saved : t))
            : [...colorThemes, saved]
          // Guardar sin activar automáticamente
          persistThemes(next, activeThemeId)
          setEditDraft(null)
          setPhase('themes')
        }}
      />
    )
  }

  return (
    <div className="app-shell app-shell-pro" style={{ maxWidth: 1100 }}>
      <header
        style={{
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            clearTimer()
            navigate('/categoria/logica')
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>

        <div style={{ textAlign: 'center', flex: 1, minWidth: 140 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.1rem, 3.5vw, 1.5rem)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background:
                'linear-gradient(90deg, var(--gco-primary), var(--gco-accent))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Colocador
          </h1>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.8rem',
              marginTop: 2,
            }}
          >
            Ordena los números y completa el tablero
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setShowLevels((v) => !v)
            }}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          >
            Nivel {level} {showLevels ? '▴' : '▾'}
          </button>
          <span
            className="mono"
            style={{
              fontSize: '0.85rem',
              color:
                timed && timeLeftMs != null && timeLeftMs < 8000
                  ? 'var(--gco-secondary)'
                  : paused
                    ? 'var(--gco-secondary)'
                    : 'var(--gco-primary)',
            }}
          >
            {paused ? '⏸ ' : timed && phase === 'playing' ? '⏳ ' : '⏱ '}
            {timed && phase === 'playing' && timeLeftMs != null
              ? formatTime(timeLeftMs)
              : phase === 'playing' || phase === 'ready'
                ? formatTime(elapsedMs)
                : lastTimeMs != null
                  ? formatTime(lastTimeMs)
                  : formatTime(elapsedMs)}
          </span>
        </div>
      </header>

      <AnimatePresence>
        {showLevels && isMobileView && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card"
            style={{ marginBottom: '0.85rem', overflow: 'hidden' }}
          >
            <LevelsPanel
              level={level}
              defaultLevel={defaultLevel}
              unlocked={unlocked}
              sideLevels={sideLevels}
              compact
              onPick={(id) => goReady(id)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {!isMobileView && (
          <div
            className="glass-card"
            style={{ width: 168, flexShrink: 0, position: 'sticky', top: 12 }}
          >
            <LevelsPanel
              level={level}
              defaultLevel={defaultLevel}
              unlocked={unlocked}
              sideLevels={sideLevels}
              onPick={(id) => goReady(id)}
            />
          </div>
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem',
          }}
        >
          <div className="glass-card" style={{ width: '100%', maxWidth: 480 }}>
            <div
              style={{
                padding: isMobileView ? '0.75rem' : '1rem',
                boxShadow: '0 0 36px var(--gco-primary-dim)',
              }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {(phase === 'ready' || !puzzle) && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '1.25rem 0.75rem',
                    minWidth: isMobileView ? 240 : 280,
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 6, fontSize: '1.1rem' }}>
                    Nivel {level}
                  </p>
                  <p
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.85rem',
                      marginBottom: 4,
                    }}
                  >
                    {sizeLabel}
                  </p>
                  <p
                    style={{
                      color: 'var(--gco-ink-faint)',
                      fontSize: '0.78rem',
                      marginBottom: 14,
                    }}
                  >
                    Ordena del 1 al {tiles}
                    {bestForLevel != null && bestForLevel > 0 && (
                      <>
                        {' '}
                        · Mejor:{' '}
                        <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                          {formatDuration(bestForLevel)}
                        </span>
                      </>
                    )}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginBottom: 14,
                      textAlign: 'left',
                    }}
                  >
                    <Switch
                      checked={timed}
                      onChange={setTimedPersist}
                      label="Contrarreloj"
                      desc={
                        timed
                          ? `Límite aprox. ${timedPreview}s en este nivel`
                          : 'Sin límite de tiempo'
                      }
                    />
                  </div>

                  <div style={{ marginBottom: 12, textAlign: 'left' }}>
                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Estilo de fichas
                    </p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      {TILE_STYLES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`glass-button ${tileStyle === s.id ? '' : 'secondary'}`}
                          style={{ fontSize: '0.75rem', padding: '0.45rem 0.5rem' }}
                          onClick={() => setStylePersist(s.id)}
                        >
                          {s.emoji} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ width: '100%', marginBottom: 10, fontSize: '0.85rem' }}
                    onClick={() => {
                      soundClick()
                      setPhase('themes')
                    }}
                  >
                    🎨 Colorear fichas · Temas
                    {activeTheme ? ` · ${activeTheme.name}` : ''}
                  </button>

                  <GlassButton onClick={() => startLevel()}>
                    Comenzar nivel {level}
                  </GlassButton>

                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ width: '100%', marginTop: 8, fontSize: '0.82rem' }}
                    onClick={() => {
                      soundClick()
                      setShowControlsHelp((v) => !v)
                    }}
                  >
                    {showControlsHelp ? 'Ocultar controles' : 'Controles'}
                  </button>
                  {showControlsHelp && (
                    <p
                      style={{
                        marginTop: 10,
                        fontSize: '0.78rem',
                        color: 'var(--gco-ink-muted)',
                        lineHeight: 1.45,
                        textAlign: 'left',
                      }}
                    >
                      Toca una ficha junto al hueco, desliza el dedo, o usa flechas /
                      WASD. Espacio o P para pausar.
                    </p>
                  )}
                </div>
              )}

              {phase !== 'ready' && puzzle && (
                <div style={{ position: 'relative' }}>
                  {paused && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 5,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--gco-overlay)',
                        borderRadius: 'var(--gco-radius-sm)',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontWeight: 700, marginBottom: 10 }}>Pausa</p>
                        <GlassButton onClick={togglePause}>Continuar</GlassButton>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${size}, ${px}px)`,
                      gridTemplateRows: `repeat(${size}, ${px}px)`,
                      gap: isMobileView ? 6 : 8,
                      margin: '0 auto',
                      justifyContent: 'center',
                    }}
                  >
                    {board.map((cell, i) => {
                      if (cell === 0) {
                        return (
                          <div
                            key={`e-${i}`}
                            aria-label="Espacio vacío"
                            style={{
                              width: px,
                              height: px,
                              borderRadius: 14,
                              border: '1px dashed var(--gco-glass-border)',
                              background:
                                'repeating-linear-gradient(135deg, rgba(0,0,0,0.25) 0 3px, rgba(255,255,255,0.03) 3px 6px)',
                            }}
                          />
                        )
                      }
                      const color = colorForTile(cell)
                      const inPlace = cell === i + 1
                      const active =
                        phase === 'playing' && !paused && canMove(board, size, i)
                      const surface = tileSurface(tileStyle, color, inPlace)
                      return (
                        <motion.button
                          key={`${i}-${cell}`}
                          type="button"
                          aria-label={`Número ${cell}`}
                          disabled={!active}
                          onClick={() => tryMove(i)}
                          whileTap={active ? { scale: 0.94 } : undefined}
                          animate={{
                            scale: 1,
                            opacity: peekSolved && !inPlace ? 0.4 : 1,
                          }}
                          style={{
                            width: px,
                            height: px,
                            borderRadius: 14,
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: `clamp(1rem, ${px * 0.38}px, 1.9rem)`,
                            cursor: active ? 'pointer' : 'default',
                            padding: 0,
                            transition: 'opacity 0.2s ease',
                            ...surface,
                          }}
                        >
                          {cell}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {phase !== 'ready' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                width: '100%',
                maxWidth: 440,
              }}
            >
              <Stat label="Movimientos" value={String(moves)} />
              <Stat
                label="Mejor tiempo"
                value={
                  bestForLevel != null && bestForLevel > 0
                    ? formatDuration(bestForLevel)
                    : '—'
                }
              />
              <Stat
                label={timed ? 'Tiempo rest.' : 'Estado'}
                value={
                  paused
                    ? 'Pausa'
                    : phase === 'playing'
                      ? timed && timeLeftMs != null
                        ? formatTime(timeLeftMs)
                        : remainingMoves != null
                          ? `${remainingMoves} rest.`
                          : 'En progreso'
                      : phase === 'won'
                        ? '¡Completado!'
                        : 'Derrota'
                }
                accent={phase === 'won'}
              />
              <Stat
                label="Ordenado"
                value={`${progressPct}%`}
                accent={progressPct === 100}
              />
            </div>
          )}

          {phase === 'playing' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                onClick={togglePause}
              >
                {paused ? '▶ Continuar' : '⏸ Pausar'}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                onClick={() => {
                  soundClick()
                  setShowHint((v) => !v)
                }}
              >
                {showHint ? 'Ocultar consejo' : '💡 Consejo'}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                onClick={() => {
                  soundClick()
                  setPeekSolved((v) => !v)
                }}
              >
                {peekSolved ? 'Ocultar correctas' : '👁 Resaltar correctas'}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                onClick={() => {
                  soundClick()
                  setShowStylePicker((v) => !v)
                }}
              >
                🎨 Estilo
              </button>
            </div>
          )}

          {showStylePicker && phase === 'playing' && (
            <div
              className="glass-card"
              style={{ maxWidth: 380, width: '100%', padding: '0.75rem' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {TILE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`glass-button ${tileStyle === s.id ? '' : 'secondary'}`}
                    style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                    onClick={() => setStylePersist(s.id)}
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showHint && phase === 'playing' && (
            <div className="glass-card" style={{ maxWidth: 400, width: '100%' }}>
              <div
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.82rem',
                  color: 'var(--gco-ink-muted)',
                  lineHeight: 1.45,
                }}
              >
                <p
                  style={{
                    fontWeight: 600,
                    color: 'var(--gco-ink)',
                    marginBottom: 6,
                  }}
                >
                  Consejo · {sizeLabel}
                </p>
                <p style={{ marginBottom: 8 }}>{sessionTip.tip}</p>
                <p
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--gco-ink-faint)',
                    fontStyle: 'italic',
                  }}
                >
                  {sessionTip.cite}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="glass-card" style={{ flex: '1 1 200px' }}>
          <div
            style={{
              padding: '0.7rem 1rem',
              fontSize: '0.85rem',
              color: 'var(--gco-ink-muted)',
            }}
          >
            {puzzle?.goal ?? `Ordena del 1 al ${tiles} · ${sizeLabel}`}
          </div>
        </div>
        {phase !== 'ready' && (
          <button
            type="button"
            className="glass-button secondary"
            onClick={restart}
          >
            ↻ Reiniciar nivel
          </button>
        )}
      </div>

      <AnimatePresence>
        {(phase === 'won' || phase === 'lost') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--gco-overlay)',
              backdropFilter: 'blur(6px)',
              padding: '1.25rem',
            }}
          >
            <div className="glass-card" style={{ maxWidth: 360, width: '100%' }}>
              <div style={{ padding: '1.5rem 1.3rem', textAlign: 'center' }}>
                <h2 style={{ marginBottom: 8 }}>
                  {phase === 'won'
                    ? '¡Nivel superado!'
                    : timed && timeLeftMs != null && timeLeftMs <= 0
                      ? 'Se acabó el tiempo'
                      : 'Se acabaron los movimientos'}
                </h2>
                {phase === 'won' && (
                  <>
                    <p
                      style={{
                        fontSize: '1.5rem',
                        letterSpacing: 2,
                        color: 'var(--gco-primary)',
                        margin: '0.4rem 0',
                      }}
                    >
                      {'★'.repeat(stars)}
                      {'☆'.repeat(3 - stars)}
                    </p>
                    <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
                      {moves} movimientos ·{' '}
                      {lastTimeMs != null ? formatTime(lastTimeMs) : '—'}
                    </p>
                  </>
                )}
                {phase === 'lost' && (
                  <p
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.9rem',
                      marginTop: 8,
                    }}
                  >
                    Llegaste a {progressPct}% ordenado con {moves} movimientos.
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 16,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  <GlassButton onClick={restart}>Reintentar</GlassButton>
                  {phase === 'won' && (
                    <GlassButton
                      onClick={() => {
                        const next = level + 1
                        setLevel(next)
                        startLevel(next)
                      }}
                    >
                      Siguiente nivel
                    </GlassButton>
                  )}
                  <button
                    type="button"
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      goReady()
                    }}
                  >
                    Elegir nivel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Colocador