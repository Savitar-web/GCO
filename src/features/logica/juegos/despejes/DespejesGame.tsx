/**
 * Despejes — Laberinto · Croma (Gemas) · Pintar
 * src/features/logica/juegos/despejes/DespejesGame.tsx
 *
 * Motor: ../generateLevel (sección 3 DESPEJES)
 * Progreso: recordLevelResult / getGameProgress
 *
 * Nota: GlassCard/GlassButton del proyecto NO aceptan prop `style`.
 * Los estilos van en wrappers <div> o en <button className="glass-button">.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import {
  soundClick,
  soundFail,
  soundSuccess,
  soundStart,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
} from '@/core/storage/progress'
import {
  type Direction,
  type MazeCoord,
  type MazeBoulder,
  type LaberintoLevel,
  type Gem,
  type CromaLevel,
  type PintarLevel,
  generateLaberintoLevel,
  laberintoStep,
  isMazeComplete,
  visibleMazeCells,
  calcLaberintoStars,
  generateCromaLevel,
  cromaTryMove,
  cromaIsComplete,
  calcCromaStars,
  gemHue,
  generatePintarLevel,
  pintarTapCell,
  pintarIsComplete,
  pintarProgress,
  calcPintarStars,
  PAINT_PALETTE,
  formatTime,
} from '../generateLevel'

/* ═══════════════════════════════════════════════════════════════════════════
   Constantes / tipos
   ═══════════════════════════════════════════════════════════════════════════ */

const GAME_CAT = 'logica' as const
const GAME_ID = 'despejes'

type SubGame = 'laberinto' | 'croma'
type CromaStyle = 'desplazar' | 'colorear'
type PlayMode = 'progresivo' | 'contrarreloj' | 'zen'
type Screen = 'inicio' | 'niveles' | 'jugando' | 'resumen'
type TrackId = 'laberinto' | 'cromaDesplazar' | 'cromaColorear'

interface LevelResult {
  stars: 0 | 1 | 2 | 3
  timeMs: number
  moves: number
  failed?: boolean
  reason?: string
}

const MODE_INFO: {
  id: PlayMode
  label: string
  icon: string
  desc: string
}[] = [
  {
    id: 'progresivo',
    label: 'Subir de nivel',
    icon: '📈',
    desc: 'Avanza nivel a nivel: cada uno es un poco más exigente.',
  },
  {
    id: 'contrarreloj',
    label: 'Contrarreloj',
    icon: '⏱️',
    desc: 'Mismo nivel con presión de tiempo desde el primer movimiento.',
  },
  {
    id: 'zen',
    label: 'Zen',
    icon: '🌿',
    desc: 'Sin límite de movimientos ni presión de tiempo.',
  },
]

function trackKey(sub: SubGame, style: CromaStyle): TrackId {
  if (sub === 'laberinto') return 'laberinto'
  return style === 'colorear' ? 'cromaColorear' : 'cromaDesplazar'
}

function progressGameId(track: TrackId): string {
  return `${GAME_ID}:${track}`
}

function unlockedFor(track: TrackId): number {
  try {
    const p = getGameProgress(GAME_CAT, progressGameId(track))
    const highest = typeof p.highestLevel === 'number' ? p.highestLevel : 0
    return Math.max(1, highest + 1)
  } catch {
    return 1
  }
}

function starsFor(track: TrackId, level: number): 0 | 1 | 2 | 3 {
  try {
    const p = getGameProgress(GAME_CAT, progressGameId(track))
    const rec = p.levels?.[String(level)]
    if (!rec) return 0
    if ((rec.wins ?? 0) > 0) return 1
    return 0
  } catch {
    return 0
  }
}

function saveResult(
  track: TrackId,
  level: number,
  success: boolean,
  timeMs: number,
  stars: 0 | 1 | 2 | 3
) {
  try {
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: progressGameId(track),
      level,
      success,
      timeMs,
      score: stars,
    })
  } catch {
    /* progress opcional */
  }
}

function useIsMobile(bp = 900) {
  const [m, setM] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : true
  )
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

function useGameTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0)
  const baseRef = useRef<number | null>(null)
  const accumRef = useRef(0)

  useEffect(() => {
    if (!active) {
      if (baseRef.current != null) {
        accumRef.current += performance.now() - baseRef.current
        baseRef.current = null
      }
      return
    }
    baseRef.current = performance.now()
    const id = window.setInterval(() => {
      if (baseRef.current == null) return
      setElapsed(accumRef.current + (performance.now() - baseRef.current))
    }, 100)
    return () => clearInterval(id)
  }, [active])

  const reset = useCallback(() => {
    baseRef.current = active ? performance.now() : null
    accumRef.current = 0
    setElapsed(0)
  }, [active])

  return { elapsed, reset }
}

function useKeyboardDirection(
  onPress: (dir: Direction) => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        W: 'up',
        s: 'down',
        S: 'down',
        a: 'left',
        A: 'left',
        d: 'right',
        D: 'right',
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        onPress(dir)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPress, active])
}

/* ═══════════════════════════════════════════════════════════════════════════
   Raíz
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DespejesGameProps {
  onBack?: () => void
}

export function DespejesGame(props: DespejesGameProps = {}) {
  const { onBack } = props
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState<Screen>('inicio')
  const [subGame, setSubGame] = useState<SubGame>('laberinto')
  const [cromaStyle, setCromaStyle] = useState<CromaStyle>('desplazar')
  const [playMode, setPlayMode] = useState<PlayMode>('progresivo')
  const [currentLevel, setCurrentLevel] = useState(1)
  const [lastResult, setLastResult] = useState<LevelResult | null>(null)
  const [progressTick, setProgressTick] = useState(0)

  const track = trackKey(subGame, cromaStyle)
  const unlockedLevel = useMemo(
    () => unlockedFor(track),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, progressTick]
  )

  const goBack = () => {
    soundClick()
    if (screen === 'inicio') {
      if (onBack) onBack()
      else navigate('/categoria/logica')
      return
    }
    if (screen === 'niveles') setScreen('inicio')
    else setScreen('niveles')
  }

  const openSubGame = (sub: SubGame) => {
    soundClick()
    setSubGame(sub)
    setCromaStyle('desplazar')
    setScreen('niveles')
  }

  const startLevel = (level: number, mode: PlayMode = playMode) => {
    soundStart()
    setCurrentLevel(level)
    setPlayMode(mode)
    setLastResult(null)
    setScreen('jugando')
  }

  const handleComplete = useCallback(
    (result: LevelResult) => {
      setLastResult(result)
      if (!result.failed) {
        soundSuccess()
        saveResult(track, currentLevel, true, result.timeMs, result.stars)
      } else {
        soundFail()
        saveResult(track, currentLevel, false, result.timeMs, 0)
      }
      setProgressTick((t) => t + 1)
      setScreen('resumen')
    },
    [track, currentLevel]
  )

  const title =
    screen === 'inicio'
      ? 'Despejes'
      : subGame === 'laberinto'
        ? 'Laberinto'
        : cromaStyle === 'colorear'
          ? 'Croma · Pintar'
          : 'Croma · Gemas'

  const subtitle =
    screen === 'inicio'
      ? 'Despeja el camino, mueve gemas y colorea'
      : screen === 'niveles'
        ? undefined
        : `Nivel ${currentLevel} · ${MODE_INFO.find((m) => m.id === playMode)?.label ?? ''}`

  return (
    <div className="app-shell" style={{ maxWidth: 720, margin: '0 auto' }}>
      <HeaderBar title={title} subtitle={subtitle} onBack={goBack} />

      <AnimatePresence mode="wait">
        {screen === 'inicio' && (
          <motion.div
            key="inicio"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <HomeScreen
              onSelect={openSubGame}
              labUnlocked={unlockedFor('laberinto')}
              cromaUnlocked={Math.max(
                unlockedFor('cromaDesplazar'),
                unlockedFor('cromaColorear')
              )}
            />
          </motion.div>
        )}

        {screen === 'niveles' && (
          <motion.div
            key={`niveles-${track}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <LevelSelectScreen
              subGame={subGame}
              cromaStyle={cromaStyle}
              onChangeCromaStyle={(s) => {
                setCromaStyle(s)
              }}
              unlockedLevel={unlockedLevel}
              getStars={(lv) => starsFor(track, lv)}
              playMode={playMode}
              onChangePlayMode={(m) => {
                soundClick()
                setPlayMode(m)
              }}
              onStart={(lvl) => startLevel(lvl)}
              isMobile={isMobile}
            />
          </motion.div>
        )}

        {screen === 'jugando' && subGame === 'laberinto' && (
          <motion.div
            key={`play-lab-${currentLevel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LaberintoScreen
              level={currentLevel}
              playMode={playMode}
              isMobile={isMobile}
              onComplete={handleComplete}
              onExit={() => {
                soundClick()
                setScreen('niveles')
              }}
            />
          </motion.div>
        )}

        {screen === 'jugando' &&
          subGame === 'croma' &&
          cromaStyle === 'desplazar' && (
            <motion.div
              key={`play-gem-${currentLevel}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CromaDesplazarScreen
                level={currentLevel}
                playMode={playMode}
                isMobile={isMobile}
                onComplete={handleComplete}
                onExit={() => {
                  soundClick()
                  setScreen('niveles')
                }}
              />
            </motion.div>
          )}

        {screen === 'jugando' &&
          subGame === 'croma' &&
          cromaStyle === 'colorear' && (
            <motion.div
              key={`play-paint-${currentLevel}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CromaColorearScreen
                level={currentLevel}
                playMode={playMode}
                isMobile={isMobile}
                onComplete={handleComplete}
                onExit={() => {
                  soundClick()
                  setScreen('niveles')
                }}
              />
            </motion.div>
          )}

        {screen === 'resumen' && lastResult && (
          <motion.div
            key="resumen"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SummaryScreen
              level={currentLevel}
              result={lastResult}
              onRetry={() => startLevel(currentLevel)}
              onNext={() => startLevel(currentLevel + 1)}
              onLevels={() => {
                soundClick()
                setScreen('niveles')
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default DespejesGame

/* ═══════════════════════════════════════════════════════════════════════════
   Header
   ═══════════════════════════════════════════════════════════════════════════ */

function HeaderBar({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.1rem',
        gap: '0.75rem',
      }}
    >
      <button
        type="button"
        className="glass-button secondary"
        onClick={onBack}
        style={{ flexShrink: 0 }}
      >
        ← Volver
      </button>
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
        <h1
          style={{
            fontSize: 'clamp(1.25rem, 4vw, 1.65rem)',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <div
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.82rem',
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ width: 88, flexShrink: 0 }} aria-hidden />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Inicio
   ═══════════════════════════════════════════════════════════════════════════ */

function HomeScreen({
  onSelect,
  labUnlocked,
  cromaUnlocked,
}: {
  onSelect: (sub: SubGame) => void
  labUnlocked: number
  cromaUnlocked: number
}) {
  const cards: {
    id: SubGame
    title: string
    desc: string
    icon: string
    level: number
  }[] = [
    {
      id: 'laberinto',
      title: 'Laberinto',
      desc: 'Encuentra la salida y empuja rocas a los huecos para despejar el camino.',
      icon: '🧱',
      level: labUnlocked,
    },
    {
      id: 'croma',
      title: 'Croma',
      desc: 'Lleva gemas de color a su meta o pinta figuras despejando escombros.',
      icon: '💎',
      level: cromaUnlocked,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {cards.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.28 }}
        >
          <div
            onClick={() => onSelect(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(c.id)
            }}
            style={{ cursor: 'pointer' }}
          >
            <GlassCard>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1.15rem 1.25rem',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontSize: '1.9rem',
                    width: 54,
                    height: 54,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 14,
                    background:
                      'var(--gco-primary-dim, rgba(34,230,197,0.15))',
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{c.title}</h3>
                  <div
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.82rem',
                      marginTop: 4,
                      lineHeight: 1.35,
                    }}
                  >
                    {c.desc}
                  </div>
                  <div
                    style={{
                      color: 'var(--gco-primary)',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      marginTop: 8,
                    }}
                  >
                    Nivel {c.level}
                  </div>
                </div>
                <div
                  style={{
                    color: 'var(--gco-ink-faint, #6b7280)',
                    fontSize: '1.2rem',
                  }}
                >
                  →
                </div>
              </div>
            </GlassCard>
          </div>
        </motion.div>
      ))}

      <GlassCard>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            padding: '0.95rem 1.1rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>💡</span>
          <div>
            <div
              style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}
            >
              Cómo jugar
            </div>
            <div
              style={{
                color: 'var(--gco-ink-muted)',
                fontSize: '0.82rem',
                lineHeight: 1.45,
              }}
            >
              En Laberinto usa flechas o el D-pad para moverte y empujar rocas
              hacia los huecos. En Croma · Gemas, toca una gema y deslízala a su
              meta. En Croma · Pintar, despeja escombros y colorea hasta igualar
              el objetivo.
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Selector de niveles
   ═══════════════════════════════════════════════════════════════════════════ */

function LevelSelectScreen({
  subGame,
  cromaStyle,
  onChangeCromaStyle,
  unlockedLevel,
  getStars,
  playMode,
  onChangePlayMode,
  onStart,
  isMobile,
}: {
  subGame: SubGame
  cromaStyle: CromaStyle
  onChangeCromaStyle: (s: CromaStyle) => void
  unlockedLevel: number
  getStars: (lv: number) => 0 | 1 | 2 | 3
  playMode: PlayMode
  onChangePlayMode: (m: PlayMode) => void
  onStart: (level: number) => void
  isMobile: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(24)
  const [selected, setSelected] = useState(unlockedLevel)

  useEffect(() => {
    setSelected((prev) => Math.min(prev, unlockedLevel) || unlockedLevel)
    setVisibleCount(Math.max(24, Math.ceil(unlockedLevel / 12) * 12 + 12))
  }, [unlockedLevel, subGame, cromaStyle])

  const levels = useMemo(
    () => Array.from({ length: visibleCount }, (_, i) => i + 1),
    [visibleCount]
  )

  const locked = selected > unlockedLevel

  return (
    <div>
      {subGame === 'croma' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: '1rem',
          }}
        >
          {(
            [
              { id: 'desplazar' as const, label: '💎 Gemas' },
              { id: 'colorear' as const, label: '🎨 Pintar' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="glass-button secondary"
              onClick={() => onChangeCromaStyle(opt.id)}
              style={{
                borderColor:
                  cromaStyle === opt.id
                    ? 'var(--gco-primary)'
                    : 'var(--gco-glass-border)',
                background:
                  cromaStyle === opt.id
                    ? 'var(--gco-primary-dim, rgba(34,230,197,0.12))'
                    : undefined,
                fontWeight: cromaStyle === opt.id ? 700 : 500,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr',
          gap: '1rem',
        }}
      >
        <GlassCard>
          <div style={{ padding: '1rem' }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                marginBottom: '0.75rem',
              }}
            >
              🗺️ Niveles — {subGame === 'laberinto' ? 'Laberinto' : 'Croma'}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                gap: '0.45rem',
                maxHeight: isMobile ? 280 : 360,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {levels.map((lv) => {
                const isLocked = lv > unlockedLevel
                const isSelected = lv === selected
                const st = getStars(lv)
                return (
                  <button
                    key={lv}
                    type="button"
                    disabled={isLocked}
                    onClick={() => {
                      soundClick()
                      setSelected(lv)
                    }}
                    className="glass-button secondary"
                    style={{
                      flexDirection: 'column',
                      gap: 2,
                      padding: '0.45rem 0.25rem',
                      minHeight: 54,
                      borderColor: isSelected
                        ? 'var(--gco-primary)'
                        : 'var(--gco-glass-border)',
                      color: isLocked
                        ? 'var(--gco-ink-faint, #6b7280)'
                        : 'var(--gco-ink)',
                      background: isSelected
                        ? 'var(--gco-primary-dim, rgba(34,230,197,0.15))'
                        : 'var(--gco-glass-bg)',
                      opacity: isLocked ? 0.55 : 1,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {isLocked ? '🔒' : lv}
                    </span>
                    {!isLocked && (
                      <span
                        style={{
                          fontSize: '0.58rem',
                          letterSpacing: 1,
                          color: st
                            ? 'var(--gco-primary)'
                            : 'var(--gco-ink-muted)',
                        }}
                      >
                        {st
                          ? '★'.repeat(st) + '☆'.repeat(3 - st)
                          : '···'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {visibleCount < unlockedLevel + 200 && (
              <button
                type="button"
                className="glass-button ghost"
                style={{ marginTop: '0.65rem', width: '100%' }}
                onClick={() => {
                  soundClick()
                  setVisibleCount((v) => v + 24)
                }}
              >
                Cargar más niveles
              </button>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ padding: '1.2rem' }}>
            <h3 style={{ margin: '0 0 4px' }}>
              {locked ? 'Bloqueado' : `Nivel ${selected}`}
            </h3>
            <div
              style={{
                color: 'var(--gco-ink-muted)',
                fontSize: '0.82rem',
                marginBottom: '1rem',
                lineHeight: 1.4,
              }}
            >
              {locked
                ? `Completa el nivel ${unlockedLevel} para desbloquearlo.`
                : 'Elige el modo de juego y comienza cuando quieras.'}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {MODE_INFO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangePlayMode(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0.7rem 0.85rem',
                    borderRadius: 12,
                    border: `1px solid ${
                      playMode === m.id
                        ? 'var(--gco-primary)'
                        : 'var(--gco-glass-border)'
                    }`,
                    background:
                      playMode === m.id
                        ? 'var(--gco-primary-dim, rgba(34,230,197,0.12))'
                        : 'var(--gco-glass-bg, rgba(255,255,255,0.04))',
                    color: 'var(--gco-ink)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{m.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--gco-ink-muted)',
                        marginTop: 2,
                      }}
                    >
                      {m.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="glass-button"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={locked}
              onClick={() => {
                if (!locked) onStart(selected)
              }}
            >
              Comenzar nivel {selected}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI compartida de partida
   ═══════════════════════════════════════════════════════════════════════════ */

function TimerBadge({ ms }: { ms: number }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '0.4rem 0.8rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.85rem',
        fontWeight: 700,
        color: 'var(--gco-primary)',
      }}
    >
      ⏱ {formatTime(ms)}
    </div>
  )
}

function StatBadge({ children }: { children: ReactNode }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '0.4rem 0.8rem',
        fontSize: '0.85rem',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
    </div>
  )
}

function ModeBadge({ mode }: { mode: PlayMode }) {
  const info = MODE_INFO.find((m) => m.id === mode)
  if (!info) return null
  return (
    <div
      className="glass-card"
      title={info.label}
      style={{
        padding: '0.4rem 0.7rem',
        fontSize: '0.85rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {info.icon}
    </div>
  )
}

function HintPill({ text }: { text: string }) {
  return (
    <div
      className="glass-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0.65rem 1rem',
        marginTop: '1rem',
        color: 'var(--gco-ink-muted)',
        fontSize: '0.82rem',
        lineHeight: 1.4,
      }}
    >
      <span>💡</span>
      <span>{text}</span>
    </div>
  )
}

function DPad({ onPress }: { onPress: (dir: Direction) => void }) {
  const btn = (dir: Direction, label: string, area: string) => (
    <button
      key={dir}
      type="button"
      className="glass-button secondary"
      style={{
        gridArea: area,
        minHeight: 52,
        minWidth: 52,
        fontSize: '1.2rem',
        padding: 0,
      }}
      onClick={() => {
        soundClick()
        onPress(dir)
      }}
      aria-label={dir}
    >
      {label}
    </button>
  )
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateAreas: '". up ." "left mid right" ". down ."',
        gridTemplateColumns: '52px 52px 52px',
        gridTemplateRows: '52px 52px 52px',
        gap: 6,
        margin: '0 auto',
        justifyContent: 'center',
      }}
    >
      {btn('up', '↑', 'up')}
      {btn('left', '←', 'left')}
      <div style={{ gridArea: 'mid' }} />
      {btn('right', '→', 'right')}
      {btn('down', '↓', 'down')}
    </div>
  )
}

function PlayToolbar({
  elapsed,
  playMode,
  moves,
  moveLimit,
  extra,
  onUndo,
  canUndo,
  onRestart,
  onExit,
}: {
  elapsed: number
  playMode: PlayMode
  moves: number
  moveLimit: number
  extra?: ReactNode
  onUndo?: () => void
  canUndo?: boolean
  onRestart: () => void
  onExit: () => void
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.8rem',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TimerBadge ms={elapsed} />
          <ModeBadge mode={playMode} />
          <StatBadge>
            👣 {moves}
            {moveLimit > 0 && playMode !== 'zen' ? ` / ${moveLimit}` : ''}
          </StatBadge>
          {extra}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {onUndo ? (
          <button
            type="button"
            className="glass-button secondary"
            disabled={!canUndo}
            onClick={() => {
              soundClick()
              onUndo()
            }}
            style={{ flex: 1, minWidth: 90, opacity: canUndo ? 1 : 0.45 }}
          >
            ↩ Deshacer
          </button>
        ) : null}
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            onRestart()
          }}
          style={{ flex: 1, minWidth: 90 }}
        >
          ↺ Reiniciar
        </button>
        <button
          type="button"
          className="glass-button ghost"
          onClick={onExit}
          style={{ flex: 1, minWidth: 90 }}
        >
          Salir
        </button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LABERINTO
   ═══════════════════════════════════════════════════════════════════════════ */

function LaberintoScreen({
  level,
  playMode,
  isMobile,
  onComplete,
  onExit,
}: {
  level: number
  playMode: PlayMode
  isMobile: boolean
  onComplete: (r: LevelResult) => void
  onExit: () => void
}) {
  const [seedSalt, setSeedSalt] = useState(0)
  const data = useMemo(
    () => generateLaberintoLevel(level, { seedSalt }),
    [level, seedSalt]
  )

  const [player, setPlayer] = useState<MazeCoord>(data.start)
  const [boulders, setBoulders] = useState<MazeBoulder[]>(() =>
    data.boulders.map((b) => ({ ...b }))
  )
  const [moves, setMoves] = useState(0)
  const [finished, setFinished] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failReason, setFailReason] = useState('')
  const completedRef = useRef(false)

  const bouldersRef = useRef(boulders)
  const playerRef = useRef(player)
  bouldersRef.current = boulders
  playerRef.current = player

  type Snap = { player: MazeCoord; boulders: MazeBoulder[]; moves: number }
  const historyRef = useRef<Snap[]>([])

  const { elapsed, reset: resetTimer } = useGameTimer(!finished && !failed)

  const softReset = useCallback(
    (d: LaberintoLevel) => {
      setPlayer(d.start)
      setBoulders(d.boulders.map((b) => ({ ...b })))
      setMoves(0)
      setFinished(false)
      setFailed(false)
      setFailReason('')
      completedRef.current = false
      historyRef.current = []
      resetTimer()
    },
    [resetTimer]
  )

  useEffect(() => {
    softReset(data)
  }, [data, softReset])

  const enforceLimits = useCallback(
    (nextMoves: number, timeMs: number): boolean => {
      if (playMode === 'zen') return true
      if (data.moveLimit > 0 && nextMoves > data.moveLimit) {
        setFailed(true)
        setFailReason('Límite de movimientos agotado.')
        return false
      }
      if (
        playMode === 'contrarreloj' &&
        data.targetSeconds > 0 &&
        timeMs > data.targetSeconds * 1000
      ) {
        setFailed(true)
        setFailReason('Se acabó el tiempo.')
        return false
      }
      return true
    },
    [playMode, data.moveLimit, data.targetSeconds]
  )

  const handleMove = useCallback(
    (dir: Direction) => {
      if (finished || failed || completedRef.current) return
      const curPlayer = playerRef.current
      const curBoulders = bouldersRef.current
      const result = laberintoStep(data, curBoulders, curPlayer, dir)
      if (!result.moved) return

      historyRef.current.push({
        player: curPlayer,
        boulders: curBoulders.map((b) => ({ ...b })),
        moves,
      })
      if (historyRef.current.length > 80) historyRef.current.shift()

      const nextMoves = moves + 1
      setBoulders(result.boulders)
      setPlayer(result.player)
      setMoves(nextMoves)

      if (isMazeComplete(result.player, data.exit)) {
        setFinished(true)
        return
      }
      enforceLimits(nextMoves, elapsed)
    },
    [data, finished, failed, moves, elapsed, enforceLimits]
  )

  useKeyboardDirection(handleMove, !finished && !failed)

  useEffect(() => {
    if (finished || failed || playMode !== 'contrarreloj') return
    if (data.targetSeconds > 0 && elapsed > data.targetSeconds * 1000) {
      setFailed(true)
      setFailReason('Se acabó el tiempo.')
    }
  }, [elapsed, playMode, data.targetSeconds, finished, failed])

  useEffect(() => {
    if ((!finished && !failed) || completedRef.current) return
    completedRef.current = true
    const t = window.setTimeout(() => {
      if (failed) {
        onComplete({
          stars: 0,
          timeMs: elapsed,
          moves,
          failed: true,
          reason: failReason,
        })
        return
      }
      const stars =
        playMode === 'zen'
          ? 1
          : calcLaberintoStars(
              moves,
              elapsed,
              data.targetSeconds,
              data.moveLimit
            )
      onComplete({ stars, timeMs: elapsed, moves })
    }, 480)
    return () => clearTimeout(t)
  }, [
    finished,
    failed,
    elapsed,
    moves,
    data,
    playMode,
    failReason,
    onComplete,
  ])

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    setPlayer(prev.player)
    setBoulders(prev.boulders)
    setMoves(prev.moves)
  }

  const visible = useMemo(
    () => visibleMazeCells(data, player),
    [data, player]
  )

  const cellPx = useMemo(() => {
    if (isMobile) {
      if (data.cols > 22) return 14
      if (data.cols > 16) return 18
      if (data.cols > 12) return 22
      return 26
    }
    if (data.cols > 22) return 18
    if (data.cols > 16) return 22
    if (data.cols > 12) return 28
    return 32
  }, [data.cols, isMobile])

  const remainingBoulders = boulders.filter((b) => !b.cleared).length

  return (
    <div>
      <PlayToolbar
        elapsed={elapsed}
        playMode={playMode}
        moves={moves}
        moveLimit={data.moveLimit}
        extra={
          remainingBoulders > 0 ? (
            <StatBadge>
              🪨 {remainingBoulders} roca
              {remainingBoulders !== 1 ? 's' : ''}
            </StatBadge>
          ) : undefined
        }
        onUndo={undo}
        canUndo={historyRef.current.length > 0 && !finished && !failed}
        onRestart={() => setSeedSalt((s) => s + 1)}
        onExit={onExit}
      />

      <GlassCard>
        <div
          style={{
            padding: '0.85rem',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          <div
            role="grid"
            aria-label="Laberinto"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${data.cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${data.rows}, ${cellPx}px)`,
              gap: 1,
            }}
          >
            {data.grid.map((row, r) =>
              row.map((cellType, c) => {
                const key = r * data.cols + c
                const isVisible = visible.has(key)
                const isPlayer = player.row === r && player.col === c
                const boulderHere = boulders.find(
                  (b) => !b.cleared && b.row === r && b.col === c
                )
                const filledHole = boulders.some(
                  (b) => b.cleared && b.holeRow === r && b.holeCol === c
                )
                const isExit = data.exit.row === r && data.exit.col === c

                let bg = 'transparent'
                let content: ReactNode = null

                if (!isVisible) {
                  bg = 'rgba(0,0,0,0.55)'
                } else if (cellType === 'wall') {
                  bg = 'var(--gco-glass-border)'
                } else {
                  if (cellType === 'hole' && !filledHole) {
                    bg = 'rgba(0,0,0,0.38)'
                    content = '⚫'
                  } else {
                    bg =
                      'var(--gco-fill-quaternary, rgba(255,255,255,0.06))'
                  }
                  if (filledHole) content = null
                  if (isExit && !isPlayer) content = '🚩'
                  if (boulderHere) content = '🪨'
                  if (isPlayer) content = '🧑'
                }

                return (
                  <div
                    key={key}
                    role="gridcell"
                    style={{
                      width: cellPx,
                      height: cellPx,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: bg,
                      borderRadius: 3,
                      fontSize: cellPx * 0.58,
                      transition: 'background 0.12s ease',
                      boxShadow:
                        isExit && isVisible
                          ? 'inset 0 0 0 1px var(--gco-primary)'
                          : undefined,
                    }}
                  >
                    {content}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </GlassCard>

      <div style={{ marginTop: '1.1rem' }}>
        <DPad onPress={handleMove} />
      </div>

      <HintPill text={data.goal} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CROMA — Gemas
   ═══════════════════════════════════════════════════════════════════════════ */

function CromaDesplazarScreen({
  level,
  playMode,
  isMobile,
  onComplete,
  onExit,
}: {
  level: number
  playMode: PlayMode
  isMobile: boolean
  onComplete: (r: LevelResult) => void
  onExit: () => void
}) {
  const [seedSalt, setSeedSalt] = useState(0)
  const data = useMemo(
    () => generateCromaLevel(level, { seedSalt }),
    [level, seedSalt]
  )

  const [gems, setGems] = useState<Gem[]>(() =>
    data.gems.map((g) => ({ ...g }))
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [moves, setMoves] = useState(0)
  const [finished, setFinished] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failReason, setFailReason] = useState('')
  const completedRef = useRef(false)

  const gemsRef = useRef(gems)
  gemsRef.current = gems

  type Snap = { gems: Gem[]; moves: number; selected: string | null }
  const historyRef = useRef<Snap[]>([])

  const { elapsed, reset: resetTimer } = useGameTimer(!finished && !failed)

  const softReset = useCallback(
    (d: CromaLevel) => {
      setGems(d.gems.map((g) => ({ ...g })))
      setSelected(null)
      setMoves(0)
      setFinished(false)
      setFailed(false)
      setFailReason('')
      completedRef.current = false
      historyRef.current = []
      resetTimer()
    },
    [resetTimer]
  )

  useEffect(() => {
    softReset(data)
  }, [data, softReset])

  const enforceLimits = useCallback(
    (nextMoves: number, timeMs: number): boolean => {
      if (playMode === 'zen') return true
      if (data.moveLimit > 0 && nextMoves > data.moveLimit) {
        setFailed(true)
        setFailReason('Límite de movimientos agotado.')
        return false
      }
      if (
        playMode === 'contrarreloj' &&
        data.targetSeconds > 0 &&
        timeMs > data.targetSeconds * 1000
      ) {
        setFailed(true)
        setFailReason('Se acabó el tiempo.')
        return false
      }
      return true
    },
    [playMode, data.moveLimit, data.targetSeconds]
  )

  const handleMove = useCallback(
    (dir: Direction) => {
      if (finished || failed || completedRef.current || !selected) return
      const cur = gemsRef.current
      const next = cromaTryMove(data, cur, selected, dir)
      if (!next) return

      historyRef.current.push({
        gems: cur.map((g) => ({ ...g })),
        moves,
        selected,
      })
      if (historyRef.current.length > 80) historyRef.current.shift()

      const nextMoves = moves + 1
      setGems(next)
      setMoves(nextMoves)

      if (cromaIsComplete(data, next)) {
        setFinished(true)
        return
      }
      enforceLimits(nextMoves, elapsed)
    },
    [data, finished, failed, selected, moves, elapsed, enforceLimits]
  )

  useKeyboardDirection(handleMove, !finished && !failed && !!selected)

  useEffect(() => {
    if (finished || failed || playMode !== 'contrarreloj') return
    if (data.targetSeconds > 0 && elapsed > data.targetSeconds * 1000) {
      setFailed(true)
      setFailReason('Se acabó el tiempo.')
    }
  }, [elapsed, playMode, data.targetSeconds, finished, failed])

  useEffect(() => {
    if ((!finished && !failed) || completedRef.current) return
    completedRef.current = true
    const t = window.setTimeout(() => {
      if (failed) {
        onComplete({
          stars: 0,
          timeMs: elapsed,
          moves,
          failed: true,
          reason: failReason,
        })
        return
      }
      const stars =
        playMode === 'zen'
          ? 1
          : calcCromaStars(
              moves,
              elapsed,
              data.targetSeconds,
              data.shuffleMoves
            )
      onComplete({ stars, timeMs: elapsed, moves })
    }, 480)
    return () => clearTimeout(t)
  }, [
    finished,
    failed,
    elapsed,
    moves,
    data,
    playMode,
    failReason,
    onComplete,
  ])

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    setGems(prev.gems)
    setMoves(prev.moves)
    setSelected(prev.selected)
  }

  const cellPx = isMobile
    ? data.cols > 8
      ? 32
      : 38
    : data.cols > 8
      ? 38
      : 46

  const obstacleSet = useMemo(
    () => new Set(data.obstacles.map((o) => o.row * data.cols + o.col)),
    [data]
  )
  const goalMap = useMemo(() => {
    const m = new Map<number, string>()
    data.goals.forEach((g) => m.set(g.row * data.cols + g.col, g.color))
    return m
  }, [data])

  return (
    <div>
      <PlayToolbar
        elapsed={elapsed}
        playMode={playMode}
        moves={moves}
        moveLimit={data.moveLimit}
        onUndo={undo}
        canUndo={historyRef.current.length > 0 && !finished && !failed}
        onRestart={() => setSeedSalt((s) => s + 1)}
        onExit={onExit}
      />

      <GlassCard>
        <div
          style={{
            padding: '0.9rem',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            role="grid"
            aria-label="Tablero de gemas"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${data.cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${data.rows}, ${cellPx}px)`,
              gap: 3,
            }}
          >
            {Array.from({ length: data.rows }).map((_, r) =>
              Array.from({ length: data.cols }).map((__, c) => {
                const idx = r * data.cols + c
                const isObstacle = obstacleSet.has(idx)
                const goalColor = goalMap.get(idx)
                const gem = gems.find((g) => g.row === r && g.col === c)
                const isSelected = !!(gem && gem.id === selected)
                const onGoal = !!(
                  gem &&
                  goalColor &&
                  gem.color === goalColor
                )

                let bg =
                  'var(--gco-fill-quaternary, rgba(255,255,255,0.06))'
                if (isObstacle) bg = 'var(--gco-glass-border)'
                else if (goalColor)
                  bg = `hsl(${gemHue(goalColor)} 70% 45% / 0.28)`

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!gem || finished || failed) return
                      soundClick()
                      setSelected(gem.id === selected ? null : gem.id)
                    }}
                    disabled={isObstacle || finished || failed}
                    aria-label={
                      gem
                        ? `Gema ${gem.color}`
                        : isObstacle
                          ? 'Obstáculo'
                          : goalColor
                            ? `Meta ${goalColor}`
                            : 'Vacío'
                    }
                    style={{
                      width: cellPx,
                      height: cellPx,
                      borderRadius: 10,
                      border: goalColor
                        ? `2px dashed hsl(${gemHue(goalColor)} 70% 55%)`
                        : '1px solid var(--gco-hairline, rgba(255,255,255,0.08))',
                      background: bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: gem ? 'pointer' : 'default',
                      padding: 0,
                      boxShadow: onGoal
                        ? `0 0 0 2px hsl(${gemHue(gem!.color)} 85% 60%)`
                        : undefined,
                    }}
                  >
                    {isObstacle ? (
                      <span style={{ fontSize: cellPx * 0.48 }}>🚧</span>
                    ) : null}
                    {gem ? (
                      <span
                        style={{
                          width: '68%',
                          height: '68%',
                          borderRadius: '50%',
                          background: `hsl(${gemHue(gem.color)} 85% 58%)`,
                          boxShadow: isSelected
                            ? `0 0 0 3px hsl(${gemHue(gem.color)} 85% 72%)`
                            : '0 2px 6px rgba(0,0,0,0.35)',
                          transition: 'box-shadow 0.15s ease',
                        }}
                      />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </GlassCard>

      <div style={{ marginTop: '1.1rem' }}>
        <DPad onPress={handleMove} />
      </div>

      <HintPill
        text={
          selected
            ? 'Usa las flechas o el D-pad para mover la gema seleccionada.'
            : 'Toca una gema y luego muévela hacia su meta del mismo color.'
        }
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CROMA — Pintar
   ═══════════════════════════════════════════════════════════════════════════ */

function paintHue(colorId: string): number {
  return PAINT_PALETTE.find((p) => p.id === colorId)?.hue ?? 200
}

function CromaColorearScreen({
  level,
  playMode,
  isMobile,
  onComplete,
  onExit,
}: {
  level: number
  playMode: PlayMode
  isMobile: boolean
  onComplete: (r: LevelResult) => void
  onExit: () => void
}) {
  const [seedSalt, setSeedSalt] = useState(0)
  const initial = useMemo(
    () => generatePintarLevel(level, { seedSalt }),
    [level, seedSalt]
  )
  const [data, setData] = useState<PintarLevel>(initial)
  const [taps, setTaps] = useState(0)
  const [finished, setFinished] = useState(false)
  const [failed, setFailed] = useState(false)
  const completedRef = useRef(false)

  type Snap = { data: PintarLevel; taps: number }
  const historyRef = useRef<Snap[]>([])

  const { elapsed, reset: resetTimer } = useGameTimer(!finished && !failed)

  useEffect(() => {
    setData(initial)
    setTaps(0)
    setFinished(false)
    setFailed(false)
    completedRef.current = false
    historyRef.current = []
    resetTimer()
  }, [initial, resetTimer])

  useEffect(() => {
    if (finished || failed || playMode !== 'contrarreloj') return
    if (data.targetSeconds > 0 && elapsed > data.targetSeconds * 1000) {
      setFailed(true)
    }
  }, [elapsed, playMode, data.targetSeconds, finished, failed])

  const handleTap = useCallback(
    (row: number, col: number) => {
      if (finished || failed || completedRef.current) return
      setData((prev) => {
        historyRef.current.push({ data: prev, taps })
        if (historyRef.current.length > 80) historyRef.current.shift()
        const next = pintarTapCell(prev, row, col)
        setTaps((t) => t + 1)
        if (pintarIsComplete(next)) setFinished(true)
        return next
      })
    },
    [finished, failed, taps]
  )

  useEffect(() => {
    if ((!finished && !failed) || completedRef.current) return
    completedRef.current = true
    const t = window.setTimeout(() => {
      if (failed) {
        onComplete({
          stars: 0,
          timeMs: elapsed,
          moves: taps,
          failed: true,
          reason: 'Se acabó el tiempo.',
        })
        return
      }
      const stars =
        playMode === 'zen'
          ? 1
          : calcPintarStars(
              elapsed,
              data.targetSeconds,
              taps,
              data.cells.length
            )
      onComplete({ stars, timeMs: elapsed, moves: taps })
    }, 480)
    return () => clearTimeout(t)
  }, [finished, failed, elapsed, taps, data, playMode, onComplete])

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    setData(prev.data)
    setTaps(prev.taps)
  }

  const cellActive = useMemo(() => {
    const m = new Map<number, PintarLevel['cells'][number]>()
    data.cells.forEach((c) => m.set(c.row * data.cols + c.col, c))
    return m
  }, [data])

  const cellPx = isMobile
    ? data.cols > 6
      ? 36
      : 44
    : data.cols > 6
      ? 42
      : 50

  const prog = pintarProgress(data)

  return (
    <div>
      <PlayToolbar
        elapsed={elapsed}
        playMode={playMode}
        moves={taps}
        moveLimit={0}
        extra={
          <StatBadge>
            🎨 {prog.done}/{prog.total}
          </StatBadge>
        }
        onUndo={undo}
        canUndo={historyRef.current.length > 0 && !finished && !failed}
        onRestart={() => setSeedSalt((s) => s + 1)}
        onExit={onExit}
      />

      <GlassCard>
        <div
          style={{
            padding: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--gco-ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              Objetivo
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${data.cols}, 12px)`,
                gridTemplateRows: `repeat(${data.rows}, 12px)`,
                gap: 1,
                width: 'fit-content',
                margin: '0 auto',
              }}
            >
              {Array.from({ length: data.rows }).map((_, r) =>
                Array.from({ length: data.cols }).map((__, c) => {
                  const cell = cellActive.get(r * data.cols + c)
                  return (
                    <div
                      key={`obj-${r}-${c}`}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: cell
                          ? `hsl(${paintHue(cell.target)} 80% 55%)`
                          : 'transparent',
                      }}
                    />
                  )
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              role="grid"
              aria-label="Tablero de pintar"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${data.cols}, ${cellPx}px)`,
                gridTemplateRows: `repeat(${data.rows}, ${cellPx}px)`,
                gap: 3,
              }}
            >
              {Array.from({ length: data.rows }).map((_, r) =>
                Array.from({ length: data.cols }).map((__, c) => {
                  const cell = cellActive.get(r * data.cols + c)
                  if (!cell) {
                    return (
                      <div
                        key={`empty-${r}-${c}`}
                        style={{ width: cellPx, height: cellPx }}
                      />
                    )
                  }
                  const matched =
                    !cell.locked && cell.current === cell.target
                  const style: CSSProperties = {
                    width: cellPx,
                    height: cellPx,
                    borderRadius: 10,
                    border: matched
                      ? '2px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                    background: cell.locked
                      ? 'var(--gco-input-bg, rgba(0,0,0,0.25))'
                      : cell.current
                        ? `hsl(${paintHue(cell.current)} 78% 52%)`
                        : 'var(--gco-fill-quaternary, rgba(255,255,255,0.06))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: finished || failed ? 'default' : 'pointer',
                    padding: 0,
                  }
                  return (
                    <button
                      key={`cell-${r}-${c}`}
                      type="button"
                      onClick={() => {
                        soundClick()
                        handleTap(r, c)
                      }}
                      disabled={finished || failed}
                      style={style}
                      aria-label={
                        cell.locked
                          ? `Escombro ${cell.clearsDone}/${cell.clearsNeeded}`
                          : `Celda color ${cell.current ?? 'vacío'}`
                      }
                    >
                      {cell.locked ? (
                        <span style={{ fontSize: cellPx * 0.42 }}>
                          {cell.clearsNeeded - cell.clearsDone > 1
                            ? '🪨'
                            : '⚡'}
                        </span>
                      ) : null}
                      {matched && !cell.locked ? (
                        <span
                          style={{
                            fontSize: cellPx * 0.38,
                            color: '#fff',
                            fontWeight: 800,
                          }}
                        >
                          ✓
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      <HintPill text="Toca los escombros para despejarlos. Toca las celdas libres para cambiar el color hasta igualar el objetivo." />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Resumen
   ═══════════════════════════════════════════════════════════════════════════ */

function SummaryScreen({
  level,
  result,
  onRetry,
  onNext,
  onLevels,
}: {
  level: number
  result: LevelResult
  onRetry: () => void
  onNext: () => void
  onLevels: () => void
}) {
  const failed = !!result.failed
  return (
    <GlassCard>
      <div
        style={{
          padding: '2rem 1.5rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: '2.4rem' }}>{failed ? '😅' : '🎉'}</div>
        <h2 style={{ margin: 0 }}>
          {failed
            ? `Nivel ${level} no superado`
            : `¡Nivel ${level} superado!`}
        </h2>
        {failed && result.reason ? (
          <div style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            {result.reason}
          </div>
        ) : null}
        {!failed ? (
          <div
            style={{
              fontSize: '1.8rem',
              letterSpacing: 4,
              color: 'var(--gco-primary)',
            }}
          >
            {'★'.repeat(result.stars)}
            {'☆'.repeat(3 - result.stars)}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            gap: '1.2rem',
            color: 'var(--gco-ink-muted)',
            fontSize: '0.88rem',
          }}
        >
          <span>⏱ {formatTime(result.timeMs)}</span>
          <span>👣 {result.moves}</span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            width: '100%',
            marginTop: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            style={{ flex: 1, minWidth: 100 }}
            onClick={() => {
              soundClick()
              onRetry()
            }}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="glass-button secondary"
            style={{ flex: 1, minWidth: 100 }}
            onClick={onLevels}
          >
            Niveles
          </button>
          {!failed ? (
            <button
              type="button"
              className="glass-button"
              style={{ flex: 1, minWidth: 100 }}
              onClick={() => {
                soundStart()
                onNext()
              }}
            >
              Siguiente →
            </button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  )
}
