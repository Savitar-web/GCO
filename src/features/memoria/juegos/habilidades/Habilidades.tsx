import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { getGameProgress, recordLevelResult } from '@/core/storage/progress'
import {
  soundClick,
  soundMatch,
  soundFail,
  soundSuccess,
  soundStart,
} from '@/core/audio/uiSounds'
import {
  generateReactionRound,
  formatReactionTime,
  rateReactionTime,
  getAimSessionConfig,
  generateAimTarget,
  scoreAimHit,
  aimAccuracyColor,
  summarizeAimSession,
  generateSimonLevel,
  getSimonTimeLimit,
  SIMON_BUTTONS,
  type AimHitResult,
  type AimSessionSummary,
  type SimonLevel,
  type SimonButtonDef,
  type SimonCustomLevel,
} from '../generateLevel'

type View = 'menu' | 'reaccion' | 'punteria' | 'simon' | 'secuencia'

/* ── storage ─────────────────────────────────────────────────────────────── */
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
    /* ignore */
  }
}

const KEYS = {
  reaction: 'gco:habilidades:reaccion',
  aim: 'gco:habilidades:punteria',
  simonLevel: 'gco:habilidades:simon-nivel',
  simonCustom: 'gco:habilidades:simon-creativo',
  simonActions: 'gco:habilidades:simon-acciones',
  sequenceLevel: 'gco:habilidades:secuencia-nivel',
  sequenceHistory: 'gco:habilidades:secuencia-historial',
} as const

const CAT = 'memoria' as const
const GAME_ID = 'habilidades'

/* ── utilidades compartidas ─────────────────────────────────────────────── */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Nivel creativo de Simón Dice con tiempo de espera propio, editable por el
 *  jugador. Extiende el tipo de la librería de generación de niveles. */
interface CreativeSimonLevel extends SimonCustomLevel {
  timeLimitMsOverride: number
}

/** Construye un SimonLevel jugable a partir de un nivel creativo guardado,
 *  respetando el tiempo de espera que el propio jugador definió. */
function buildSimonLevelFromCustom(
  custom: CreativeSimonLevel,
  level: number
): SimonLevel {
  return {
    level,
    options: shuffleArray(custom.options),
    correctId: custom.correctId,
    prompt: custom.prompt,
    timeLimitMs: custom.timeLimitMsOverride,
  }
}

/** Recomienda un tiempo de espera prudente pero desafiante para el modo
 *  creativo, basado en el progreso actual del jugador en el modo normal. */
function recommendSimonTime(referenceLevel: number): number {
  const raw = getSimonTimeLimit(Math.max(1, referenceLevel))
  return Math.min(2800, Math.max(1200, Math.round(raw / 50) * 50))
}

const ACTION_EMOJI_CHOICES = [
  '🙌', '🤸', '🙇', '👏', '🔄', '🪑', '👃', '🙈', '😄', '🤫',
  '🙋', '🧊', '👀', '🖐️', '🦶', '🤙', '✋', '👋', '🤝', '🎤',
  '🕺', '💃', '🧘', '🏃', '🤾', '🤹', '🫳', '🫱', '🖖', '🤌',
]
const ACTION_COLOR_CHOICES = [
  '#22E6C5', '#FF6B4A', '#8B7CF6', '#F5A623', '#4A9EFF', '#FF6BCB',
  '#A3E635', '#FB923C', '#818CF8', '#2DD4BF', '#FB7185', '#38BDF8',
]

/* ── raíz ────────────────────────────────────────────────────────────────── */
export function HabilidadesGame() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('menu')
  const progress = getGameProgress(CAT, GAME_ID)

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.35rem' }}>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            if (view === 'menu') navigate('/categoria/memoria')
            else setView('menu')
          }}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          ← {view === 'menu' ? 'Volver' : 'Habilidades'}
        </button>
        {view === 'menu' && (
          <>
            <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.1rem)' }}>
              ⚡ Habilidades
            </h1>
            <p
              style={{
                color: 'var(--gco-ink-muted)',
                marginTop: '0.35rem',
                fontSize: '0.92rem',
              }}
            >
              Reflejos, puntería y atención bajo presión.
            </p>
          </>
        )}
      </header>
      <AnimatePresence mode="wait">
        {view === 'menu' && (
          <MenuHabilidades
            key="menu"
            onSelect={setView}
            progressLevel={progress.highestLevel}
          />
        )}
        {view === 'reaccion' && <ReactionGame key="reaccion" />}
        {view === 'punteria' && <AimGame key="punteria" />}
        {view === 'simon' && <SimonGame key="simon" />}
        {view === 'secuencia' && <SequenceGame key="secuencia" />}
      </AnimatePresence>
    </div>
  )
}

export default HabilidadesGame

/* ── menú ────────────────────────────────────────────────────────────────── */
function MenuHabilidades({
  onSelect,
  progressLevel,
}: {
  onSelect: (v: View) => void
  progressLevel: number
}) {
  const reactionHist = loadJSON<number[]>(KEYS.reaction, [])
  const aimHist = loadJSON<AimSessionSummary[]>(KEYS.aim, [])
  const simonLevel = loadJSON<number>(KEYS.simonLevel, 1)
  const sequenceHist = loadJSON<SequenceResult[]>(KEYS.sequenceHistory, [])

  const bestReaction = reactionHist.length ? Math.min(...reactionHist) : null
  const bestAim = aimHist.length
    ? Math.max(...aimHist.map((s) => s.avgAccuracyPct))
    : null
  const cleanRuns = sequenceHist.filter((r) => r.mistakes === 0)
  const bestSequence = cleanRuns.length
    ? Math.min(...cleanRuns.map((r) => r.timeMs))
    : sequenceHist.length
      ? Math.min(...sequenceHist.map((r) => r.timeMs))
      : null

  const cards: Array<{
    id: View
    title: string
    emoji: string
    desc: string
    stat: string | null
  }> = [
    {
      id: 'reaccion',
      title: 'Tiempo de reacción',
      emoji: '🟢',
      desc: 'Pulsa apenas la pantalla cambie. Mide tu velocidad en milisegundos.',
      stat:
        bestReaction !== null
          ? `Mejor: ${formatReactionTime(bestReaction)}`
          : null,
    },
    {
      id: 'punteria',
      title: 'Puntería',
      emoji: '🎯',
      desc: 'Golpea el blanco lo más cerca del centro posible.',
      stat: bestAim !== null ? `Mejor precisión: ${bestAim}%` : null,
    },
    {
      id: 'simon',
      title: 'Simón Dice',
      emoji: '🧠',
      desc: 'Lee la orden y pulsa el botón correcto antes de que se acabe el tiempo.',
      stat: `Nivel ${simonLevel}`,
    },
    {
      id: 'secuencia',
      title: 'Secuencia numérica',
      emoji: '🔢',
      desc: 'Encuentra los números en orden ascendente lo más rápido posible.',
      stat:
        bestSequence !== null
          ? `Mejor: ${formatReactionTime(bestSequence)}`
          : null,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
    >
      {progressLevel > 0 && (
        <p
          className="mono"
          style={{
            color: 'var(--gco-primary)',
            fontSize: '0.8rem',
            marginBottom: '0.15rem',
          }}
        >
          Nivel general {progressLevel}
        </p>
      )}
      {cards.map((game, i) => (
        <motion.div
          key={game.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
        >
          <GlassCard
            onClick={() => {
              soundClick()
              onSelect(game.id)
            }}
          >
            <div
              style={{
                padding: '1.15rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '1.75rem' }}>{game.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>
                  {game.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.35,
                  }}
                >
                  {game.desc}
                </p>
                {game.stat && (
                  <p
                    className="mono"
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gco-primary)',
                      marginTop: '0.35rem',
                    }}
                  >
                    {game.stat}
                  </p>
                )}
              </div>
              <span
                style={{ color: 'var(--gco-ink-faint)', fontSize: '1.25rem' }}
              >
                →
              </span>
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── Tiempo de reacción ──────────────────────────────────────────────────── */
type ReactionState = 'idle' | 'esperando' | 'listo' | 'muy-pronto' | 'resultado'

function ReactionGame() {
  const [state, setState] = useState<ReactionState>('idle')
  const [round, setRound] = useState(1)
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>(() =>
    loadJSON(KEYS.reaction, [])
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyAtRef = useRef(0)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const startRound = useCallback(() => {
    soundStart()
    setState('esperando')
    const r = generateReactionRound(round, Date.now())
    timeoutRef.current = setTimeout(() => {
      readyAtRef.current = performance.now()
      setState('listo')
    }, r.delayMs)
  }, [round])

  const handleTap = useCallback(() => {
    if (state === 'idle' || state === 'resultado' || state === 'muy-pronto') {
      startRound()
      return
    }
    if (state === 'esperando') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      soundFail()
      setState('muy-pronto')
      return
    }
    if (state === 'listo') {
      const elapsed = performance.now() - readyAtRef.current
      soundMatch()
      setLastTime(elapsed)
      setState('resultado')
      setRound((r) => r + 1)
      const next = [elapsed, ...history].slice(0, 12)
      setHistory(next)
      saveJSON(KEYS.reaction, next)
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: Math.max(1, Math.floor(1000 / Math.max(elapsed, 80))),
          success: true,
          timeMs: elapsed,
        })
      } catch {
        /* */
      }
    }
  }, [state, startRound, history])

  const rating = lastTime !== null ? rateReactionTime(lastTime) : null
  const best = history.length ? Math.min(...history) : null
  const avg = history.length
    ? history.reduce((s, v) => s + v, 0) / history.length
    : null

  const zoneBg: Record<ReactionState, string> = {
    idle: 'var(--gco-glass-bg)',
    esperando: 'var(--gco-secondary-dim)',
    listo: 'var(--gco-primary)',
    'muy-pronto': 'var(--gco-secondary-dim)',
    resultado: 'var(--gco-glass-bg)',
  }
  const zoneFg: Record<ReactionState, string> = {
    idle: 'var(--gco-ink)',
    esperando: 'var(--gco-ink)',
    listo: 'var(--gco-button-text)',
    'muy-pronto': 'var(--gco-ink)',
    resultado: 'var(--gco-ink)',
  }
  // El mensaje de espera NO debe nombrar ningún color específico: sólo debe
  // indicar que hay que esperar a que la zona cambie de color.
  const message: Record<ReactionState, string> = {
    idle: 'Toca para empezar',
    esperando: 'Espera a que cambie de color',
    listo: '¡AHORA! Toca ya',
    'muy-pronto': 'Muy pronto · Toca para reintentar',
    resultado: 'Toca para otra ronda',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>
            🟢 Tiempo de reacción
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            Ronda {round} · Toca apenas cambie el color.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleTap}
        style={{
          width: '100%',
          minHeight: '46vh',
          border: '1px solid var(--gco-glass-border)',
          borderRadius: 'var(--gco-radius)',
          background: zoneBg[state],
          color: zoneFg[state],
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          cursor: 'pointer',
          transition: 'background 0.12s ease, color 0.12s ease',
          boxShadow: 'var(--gco-shadow)',
          font: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {state === 'resultado' && lastTime !== null ? (
          <>
            <span
              className="mono"
              style={{
                fontSize: 'clamp(2rem, 8vw, 3rem)',
                fontWeight: 700,
              }}
            >
              {formatReactionTime(lastTime)}
            </span>
            {rating && (
              <span style={{ fontSize: '0.95rem', opacity: 0.9 }}>
                {rating.label}
              </span>
            )}
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                marginTop: 4,
              }}
            >
              {message.resultado}
            </span>
          </>
        ) : (
          <span
            style={{
              fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
              fontWeight: 600,
              textAlign: 'center',
              padding: '0 1rem',
            }}
          >
            {message[state]}
          </span>
        )}
      </button>
      {history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.7rem',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
              >
                Mejor:{' '}
                <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                  {best !== null ? formatReactionTime(best) : '—'}
                </span>
              </span>
              <span
                style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
              >
                Promedio:{' '}
                <span className="mono">
                  {avg !== null ? formatReactionTime(avg) : '—'}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color: 'var(--gco-ink)',
                  }}
                >
                  {formatReactionTime(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Puntería ────────────────────────────────────────────────────────────── */
function AimGame() {
  const [level] = useState(1)
  const config = useMemo(() => getAimSessionConfig(level), [level])
  const totalTargets = Math.min(config.targetCount, 15)
  const [phase, setPhase] = useState<'listo' | 'jugando' | 'resumen'>('listo')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<ReturnType<typeof generateAimTarget> | null>(
    null
  )
  const [results, setResults] = useState<AimHitResult[]>([])
  const [lastFeedback, setLastFeedback] = useState<{
    accuracy: number
    hit: boolean
  } | null>(null)
  const spawnAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [history, setHistory] = useState<AimSessionSummary[]>(() =>
    loadJSON(KEYS.aim, [])
  )
  const [summary, setSummary] = useState<AimSessionSummary | null>(null)

  const spawnNext = useCallback(
    (i: number) => {
      const t = generateAimTarget(i, level, config, Date.now() + i)
      setTarget(t)
      spawnAtRef.current = performance.now()
    },
    [config, level]
  )

  const start = () => {
    soundStart()
    setResults([])
    setSummary(null)
    setLastFeedback(null)
    setIndex(0)
    startedAtRef.current = performance.now()
    setPhase('jugando')
    spawnNext(0)
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'jugando' || !target || !areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const clickX = ((e.clientX - rect.left) / rect.width) * 100
    const clickY = ((e.clientY - rect.top) / rect.height) * 100
    const dxPct = clickX - target.x
    const dyPct = clickY - target.y
    const distPx = Math.sqrt(dxPct * dxPct + dyPct * dyPct) * (rect.width / 100)
    const hit = distPx <= target.radius * 1.15
    const accuracy = hit ? scoreAimHit(distPx, target.radius) : 0
    const reactionMs = performance.now() - spawnAtRef.current
    if (hit) soundMatch()
    else soundFail()
    const result: AimHitResult = {
      targetId: target.id,
      hit,
      distanceFromCenterPx: distPx,
      accuracyPct: accuracy,
      reactionMs,
    }
    setLastFeedback({ accuracy, hit })
    const nextResults = [...results, result]
    setResults(nextResults)
    const nextIndex = index + 1
    if (nextIndex >= totalTargets) {
      const totalTimeMs = performance.now() - startedAtRef.current
      const s = summarizeAimSession(nextResults, totalTimeMs)
      setSummary(s)
      const nextHist = [s, ...history].slice(0, 10)
      setHistory(nextHist)
      saveJSON(KEYS.aim, nextHist)
      setTarget(null)
      setPhase('resumen')
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: Math.max(1, Math.round(s.avgAccuracyPct / 10)),
          success: s.hits > s.misses,
          timeMs: s.avgReactionMs,
        })
      } catch {
        /* */
      }
    } else {
      setIndex(nextIndex)
      spawnNext(nextIndex)
    }
  }

  const display = summary ?? history[0] ?? null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>
            🎯 Puntería
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            {phase === 'jugando'
              ? `Blanco ${index + 1} de ${totalTargets}`
              : 'Golpea el centro del blanco lo más rápido posible.'}
          </p>
        </div>
      </div>
      {phase !== 'jugando' && (
        <div className="glass-card">
          <div style={{ padding: '1.85rem 1.5rem', textAlign: 'center' }}>
            {phase === 'resumen' && display && (
              <>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1.15rem',
                  }}
                >
                  Resultado de la ronda
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    rowGap: '1.35rem',
                    columnGap: '1.5rem',
                    marginBottom: '1.5rem',
                    textAlign: 'left',
                  }}
                >
                  <Stat
                    label="Aciertos"
                    value={`${display.hits}/${display.totalTargets}`}
                  />
                  <Stat label="Fallos" value={`${display.misses}`} />
                  <Stat
                    label="Precisión media"
                    value={`${display.avgAccuracyPct}%`}
                  />
                  <Stat
                    label="Reacción media"
                    value={formatReactionTime(display.avgReactionMs)}
                  />
                  <Stat
                    label="Mejor click"
                    value={formatReactionTime(display.bestReactionMs)}
                  />
                  <Stat
                    label="Tiempo total"
                    value={formatReactionTime(display.totalTimeMs)}
                  />
                </div>
              </>
            )}
            <button
              type="button"
              className="glass-button"
              onClick={start}
              style={{ width: '100%' }}
            >
              {phase === 'resumen' ? 'Jugar de nuevo' : 'Comenzar'}
            </button>
          </div>
        </div>
      )}
      {phase === 'jugando' && (
        <div
          ref={areaRef}
          onClick={handleClick}
          style={{
            position: 'relative',
            width: '100%',
            height: '52vh',
            minHeight: 320,
            borderRadius: 'var(--gco-radius)',
            background: 'var(--gco-glass-bg)',
            border: '1px solid var(--gco-glass-border)',
            overflow: 'hidden',
            cursor: 'crosshair',
            boxShadow: 'var(--gco-shadow)',
            touchAction: 'manipulation',
          }}
        >
          {target && (
            <div
              key={target.id}
              style={{
                position: 'absolute',
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: target.radius * 2,
                height: target.radius * 2,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, #22E6C5 0%, #A3E635 45%, #F5A623 72%, #FF6B4A 100%)',
                boxShadow:
                  '0 0 0 3px rgba(255,255,255,0.14), var(--gco-shadow)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}
      {lastFeedback && phase !== 'jugando' && (
        <p
          className="mono"
          style={{
            marginTop: '0.85rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: lastFeedback.hit
              ? aimAccuracyColor(lastFeedback.accuracy)
              : 'var(--gco-secondary)',
          }}
        >
          Último click:{' '}
          {lastFeedback.hit
            ? `${lastFeedback.accuracy}% de precisión`
            : 'fallo'}
        </p>
      )}
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: '0.72rem',
          color: 'var(--gco-ink-faint)',
          marginBottom: 5,
          lineHeight: 1.3,
        }}
      >
        {label}
      </p>
      <p
        className="mono"
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--gco-ink)',
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {value}
      </p>
    </div>
  )
}

/* ── Simón Dice ──────────────────────────────────────────────────────────── */
type SimonPhase = 'lectura' | 'esperando' | 'acierto' | 'fallo' | 'tiempo'

function SimonGame() {
  const [mode, setMode] = useState<'jugar' | 'creativo'>('jugar')

  // Nivel máximo desbloqueado (persistido) y nivel que se está jugando en
  // este momento (puede ser cualquiera entre 1 y el nivel desbloqueado).
  const [unlockedLevel, setUnlockedLevel] = useState<number>(() =>
    loadJSON(KEYS.simonLevel, 1)
  )
  const [playingLevel, setPlayingLevel] = useState<number>(unlockedLevel)

  const [current, setCurrent] = useState<SimonLevel | null>(null)
  const [phase, setPhase] = useState<SimonPhase>('lectura')
  const [msLeft, setMsLeft] = useState(0)
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  // Práctica libre: cuando no es null, el jugador está jugando un nivel
  // creativo guardado directamente, sin afectar su progresión numérica.
  const [directLevel, setDirectLevel] = useState<CreativeSimonLevel | null>(
    null
  )

  const [customActions, setCustomActions] = useState<SimonButtonDef[]>(() =>
    loadJSON(KEYS.simonActions, [])
  )
  const [customLevels, setCustomLevels] = useState<CreativeSimonLevel[]>(() =>
    loadJSON(KEYS.simonCustom, [])
  )

  // Las acciones creadas en el modo creativo se suman al set de botones
  // disponible, y por tanto también aparecen en la progresión normal.
  const pool = useMemo(
    () => [...SIMON_BUTTONS, ...customActions],
    [customActions]
  )

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)

  const loadLevel = useCallback(
    (lvl: number) => {
      setDirectLevel(null)
      const useCustom = customLevels.length > 0 && lvl % 4 === 0
      const next = useCustom
        ? buildSimonLevelFromCustom(
            customLevels[Math.floor(Math.random() * customLevels.length)],
            lvl
          )
        : generateSimonLevel(lvl, pool)
      setCurrent(next)
      setPhase('lectura')
      setMsLeft(next.timeLimitMs)
      setLastElapsedMs(null)
    },
    [customLevels, pool]
  )

  const playCustomLevel = useCallback(
    (lvl: CreativeSimonLevel) => {
      soundClick()
      setMode('jugar')
      setDirectLevel(lvl)
      const built = buildSimonLevelFromCustom(lvl, playingLevel)
      setCurrent(built)
      setPhase('lectura')
      setMsLeft(built.timeLimitMs)
      setLastElapsedMs(null)
    },
    [playingLevel]
  )

  useEffect(() => {
    loadLevel(unlockedLevel)
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'lectura') return
    const t = window.setTimeout(() => {
      startedAtRef.current = performance.now()
      setPhase('esperando')
    }, 550)
    return () => window.clearTimeout(t)
  }, [phase, current])

  useEffect(() => {
    if (phase !== 'esperando' || !current) return
    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current
      const remaining = current.timeLimitMs - elapsed
      if (remaining <= 0) {
        setMsLeft(0)
        setPhase('tiempo')
        soundFail()
        if (tickRef.current) clearInterval(tickRef.current)
      } else {
        setMsLeft(remaining)
      }
    }, 40)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [phase, current])

  const press = (id: string) => {
    if (phase !== 'esperando' || !current) return
    if (tickRef.current) clearInterval(tickRef.current)
    const elapsed = performance.now() - startedAtRef.current
    setLastElapsedMs(elapsed)

    if (id === current.correctId) {
      soundSuccess()
      setPhase('acierto')

      if (directLevel) {
        // Práctica libre de un nivel creativo: no afecta la progresión.
        window.setTimeout(() => playCustomLevel(directLevel), 900)
        return
      }

      const nextLevel = playingLevel + 1
      setPlayingLevel(nextLevel)
      if (nextLevel > unlockedLevel) {
        setUnlockedLevel(nextLevel)
        saveJSON(KEYS.simonLevel, nextLevel)
      }
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: nextLevel,
          success: true,
          timeMs: elapsed,
        })
      } catch {
        /* */
      }
      window.setTimeout(() => loadLevel(nextLevel), 900)
    } else {
      soundFail()
      setPhase('fallo')
    }
  }

  const retry = () => {
    soundClick()
    if (directLevel) playCustomLevel(directLevel)
    else loadLevel(playingLevel)
  }

  const goToUnlocked = () => {
    soundClick()
    setPlayingLevel(unlockedLevel)
    loadLevel(unlockedLevel)
  }

  const exitPractice = () => {
    soundClick()
    loadLevel(playingLevel)
  }

  const jumpToLevel = (lvl: number) => {
    soundClick()
    setPlayingLevel(lvl)
    loadLevel(lvl)
    setShowLevelPicker(false)
  }

  const timePct = current
    ? Math.max(0, Math.min(100, (msLeft / current.timeLimitMs) * 100))
    : 0

  const recommendedTimeMs = useMemo(
    () => recommendSimonTime(unlockedLevel),
    [unlockedLevel]
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.7rem',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>🧠 Simón Dice</h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              {directLevel ? 'Práctica libre' : `Nivel ${playingLevel}`}
            </span>
          </div>
          <div className="segmented" style={{ marginBottom: '0.6rem' }}>
            <button
              type="button"
              className={mode === 'jugar' ? 'active' : ''}
              onClick={() => {
                soundClick()
                setMode('jugar')
              }}
            >
              Jugar
            </button>
            <button
              type="button"
              className={mode === 'creativo' ? 'active' : ''}
              onClick={() => {
                soundClick()
                setMode('creativo')
              }}
            >
              Modo creativo
            </button>
          </div>
          {mode === 'jugar' && !directLevel && (
            <>
              <button
                type="button"
                className="glass-button secondary"
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.8rem',
                  width: '100%',
                }}
                onClick={() => {
                  soundClick()
                  setShowLevelPicker((v) => !v)
                }}
              >
                {showLevelPicker ? 'Ocultar niveles' : 'Elegir nivel pasado'}
              </button>
              {showLevelPicker && (
                <SimonLevelPicker
                  unlockedLevel={unlockedLevel}
                  currentLevel={playingLevel}
                  onSelect={jumpToLevel}
                />
              )}
            </>
          )}
          {mode === 'jugar' && directLevel && (
            <button
              type="button"
              className="glass-button secondary"
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.8rem',
                width: '100%',
              }}
              onClick={exitPractice}
            >
              Volver a mi progresión (nivel {playingLevel})
            </button>
          )}
        </div>
      </div>

      {mode === 'jugar' && current && (
        <div className="glass-card">
          <div style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-faint)',
                marginBottom: '0.5rem',
              }}
            >
              {phase === 'lectura'
                ? 'Prepárate…'
                : phase === 'esperando'
                  ? 'Encuentra el botón correcto'
                  : phase === 'acierto'
                    ? '¡Correcto!'
                    : 'Resultado'}
            </p>
            <h3
              style={{
                fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
                marginBottom: '1.1rem',
                color:
                  phase === 'fallo' || phase === 'tiempo'
                    ? 'var(--gco-secondary)'
                    : phase === 'acierto'
                      ? 'var(--gco-primary)'
                      : 'var(--gco-ink)',
              }}
            >
              {phase === 'fallo'
                ? '¡Botón incorrecto!'
                : phase === 'tiempo'
                  ? '¡Se acabó el tiempo!'
                  : phase === 'acierto'
                    ? directLevel
                      ? '¡Bien hecho! Repitiendo…'
                      : 'Siguiente nivel…'
                    : current.prompt}
            </h3>
            {phase === 'esperando' && (
              <div
                style={{
                  height: 6,
                  borderRadius: 6,
                  background: 'var(--gco-glass-border)',
                  overflow: 'hidden',
                  marginBottom: '1.3rem',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${timePct}%`,
                    background:
                      timePct > 40
                        ? 'var(--gco-primary)'
                        : 'var(--gco-secondary)',
                    transition: 'width 0.04s linear',
                    borderRadius: 6,
                  }}
                />
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.85rem',
              }}
            >
              {current.options.map((btn) => {
                // La respuesta correcta sólo se revela DESPUÉS de responder
                // (acierto, fallo o tiempo agotado). Nunca antes de empezar.
                const reveal =
                  (phase === 'acierto' ||
                    phase === 'fallo' ||
                    phase === 'tiempo') &&
                  btn.id === current.correctId
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => press(btn.id)}
                    disabled={phase !== 'esperando'}
                    style={{
                      minHeight: 84,
                      borderRadius: 'var(--gco-radius-sm)',
                      border: reveal
                        ? `1.5px solid ${btn.hex}`
                        : '1px solid var(--gco-glass-border)',
                      background: reveal
                        ? `${btn.hex}33`
                        : 'var(--gco-glass-bg)',
                      color: 'var(--gco-ink)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      cursor: phase === 'esperando' ? 'pointer' : 'default',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-body)',
                      opacity: phase === 'esperando' || reveal ? 1 : 0.75,
                      transition:
                        'background 0.15s ease, border-color 0.15s ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{ fontSize: '1.6rem' }}>{btn.emoji}</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {btn.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {lastElapsedMs !== null &&
              (phase === 'acierto' || phase === 'fallo' || phase === 'tiempo') && (
                <p
                  className="mono"
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.82rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  Tardaste {formatReactionTime(lastElapsedMs)}
                </p>
              )}

            {(phase === 'fallo' || phase === 'tiempo') && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  marginTop: '1.3rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ flex: 1, minWidth: 120 }}
                  onClick={retry}
                >
                  Repetir nivel
                </button>
                {directLevel ? (
                  <button
                    type="button"
                    className="glass-button"
                    style={{ flex: 1, minWidth: 120 }}
                    onClick={exitPractice}
                  >
                    Salir de práctica
                  </button>
                ) : (
                  playingLevel !== unlockedLevel && (
                    <button
                      type="button"
                      className="glass-button"
                      style={{ flex: 1, minWidth: 120 }}
                      onClick={goToUnlocked}
                    >
                      Ir a mi nivel más alto
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'creativo' && (
        <SimonCreativeEditor
          pool={pool}
          customActions={customActions}
          onChangeActions={(list) => {
            setCustomActions(list)
            saveJSON(KEYS.simonActions, list)
          }}
          customLevels={customLevels}
          onChangeLevels={(list) => {
            setCustomLevels(list)
            saveJSON(KEYS.simonCustom, list)
          }}
          recommendedTimeMs={recommendedTimeMs}
          onPlayLevel={playCustomLevel}
        />
      )}
    </motion.div>
  )
}

function SimonLevelPicker({
  unlockedLevel,
  currentLevel,
  onSelect,
}: {
  unlockedLevel: number
  currentLevel: number
  onSelect: (lvl: number) => void
}) {
  const levels = Array.from({ length: unlockedLevel }, (_, i) => i + 1)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginTop: '0.9rem',
        maxHeight: 168,
        overflowY: 'auto',
        paddingRight: 2,
      }}
    >
      {levels.map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onSelect(lvl)}
          className="mono"
          style={{
            minWidth: 42,
            padding: '0.45rem 0.6rem',
            borderRadius: 999,
            border:
              lvl === currentLevel
                ? '1.5px solid var(--gco-primary)'
                : '1px solid var(--gco-glass-border)',
            background:
              lvl === currentLevel
                ? 'var(--gco-primary-dim)'
                : 'var(--gco-glass-bg)',
            color:
              lvl === currentLevel ? 'var(--gco-primary)' : 'var(--gco-ink)',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {lvl}
        </button>
      ))}
    </div>
  )
}

/* ── Simón Dice · modo creativo ──────────────────────────────────────────── */
function SimonCreativeEditor({
  pool,
  customActions,
  onChangeActions,
  customLevels,
  onChangeLevels,
  recommendedTimeMs,
  onPlayLevel,
}: {
  pool: SimonButtonDef[]
  customActions: SimonButtonDef[]
  onChangeActions: (list: SimonButtonDef[]) => void
  customLevels: CreativeSimonLevel[]
  onChangeLevels: (list: CreativeSimonLevel[]) => void
  recommendedTimeMs: number
  onPlayLevel: (lvl: CreativeSimonLevel) => void
}) {
  const [selected, setSelected] = useState<SimonButtonDef[]>(pool.slice(0, 4))
  const [correctId, setCorrectId] = useState(pool[0]?.id ?? '')
  const [timeLimitMs, setTimeLimitMs] = useState(recommendedTimeMs)
  const [msg, setMsg] = useState('')

  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState(ACTION_EMOJI_CHOICES[0])
  const [newColor, setNewColor] = useState(ACTION_COLOR_CHOICES[0])
  const [actionMsg, setActionMsg] = useState('')

  const toggleButton = (btn: SimonButtonDef) => {
    soundClick()
    const exists = selected.some((b) => b.id === btn.id)
    if (exists) {
      if (selected.length <= 4) {
        // mantener mínimo 4: solo permite quitar si luego añades otro
        return
      }
      const next = selected.filter((b) => b.id !== btn.id)
      setSelected(next)
      if (correctId === btn.id && next[0]) setCorrectId(next[0].id)
    } else {
      if (selected.length >= 4) {
        // sustituye el último
        const next = [...selected.slice(0, 3), btn]
        setSelected(next)
        return
      }
      setSelected([...selected, btn])
    }
  }

  const addAction = () => {
    const label = newLabel.trim().toLowerCase()
    if (!label) {
      soundFail()
      setActionMsg('Escribe el nombre de la nueva acción')
      return
    }
    if (pool.some((b) => b.label.toLowerCase() === label)) {
      soundFail()
      setActionMsg('Ya existe una acción con ese nombre')
      return
    }
    const action: SimonButtonDef = {
      id: `custom-action-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      label,
      emoji: newEmoji,
      hex: newColor,
    }
    onChangeActions([...customActions, action])
    setNewLabel('')
    soundSuccess()
    setActionMsg('Acción añadida: ya aparece en el juego normal')
    window.setTimeout(() => setActionMsg(''), 2000)
  }

  const removeAction = (id: string) => {
    soundClick()
    onChangeActions(customActions.filter((a) => a.id !== id))
    setSelected((prev) => prev.filter((b) => b.id !== id))
  }

  const save = () => {
    if (selected.length !== 4 || !selected.some((b) => b.id === correctId)) {
      soundFail()
      setMsg('Necesitas 4 acciones y una acción correcta válida')
      return
    }
    const correctBtn = selected.find((b) => b.id === correctId)!
    const level: CreativeSimonLevel = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      prompt: `Simón dice: ${correctBtn.label}`,
      correctId,
      options: selected,
      createdAt: Date.now(),
      timeLimitMsOverride: timeLimitMs,
    }
    onChangeLevels([level, ...customLevels].slice(0, 40))
    soundSuccess()
    setMsg('Nivel guardado, ya puedes jugarlo cuando quieras')
    window.setTimeout(() => setMsg(''), 2000)
  }

  const removeLevel = (id: string) => {
    soundClick()
    onChangeLevels(customLevels.filter((l) => l.id !== id))
  }

  const timePresets: Array<{ label: string; ms: number }> = [
    { label: 'Fácil', ms: 3200 },
    { label: 'Prudente', ms: recommendedTimeMs },
    { label: 'Difícil', ms: 1500 },
    { label: 'Extremo', ms: 950 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-card">
        <div style={{ padding: '1.25rem 1.25rem' }}>
          <p className="more-section-title">Elige 4 acciones para la ronda</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.55rem',
              marginBottom: '1.2rem',
            }}
          >
            {pool.map((btn) => {
              const isSelected = selected.some((b) => b.id === btn.id)
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => toggleButton(btn)}
                  style={{
                    padding: '0.55rem 0.4rem',
                    borderRadius: 'var(--gco-radius-xs)',
                    border: isSelected
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                    background: isSelected
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                    color: 'var(--gco-ink)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontFamily: 'var(--font-body)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{btn.emoji}</span>
                  {btn.label}
                </button>
              )
            })}
          </div>

          <p className="more-section-title">¿Cuál es la acción correcta?</p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.3rem',
            }}
          >
            {selected.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setCorrectId(btn.id)
                }}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: 999,
                  border:
                    correctId === btn.id
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background:
                    correctId === btn.id
                      ? 'var(--gco-primary-dim)'
                      : 'transparent',
                  color: 'var(--gco-ink)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {btn.emoji} {btn.label}
              </button>
            ))}
          </div>
          {correctId && (
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: '1.3rem',
              }}
            >
              El jugador verá: “Simón dice:{' '}
              {selected.find((b) => b.id === correctId)?.label ?? ''}”
            </p>
          )}

          <p className="more-section-title">Tiempo para responder</p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '0.7rem',
              flexWrap: 'wrap',
            }}
          >
            {timePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="glass-button secondary"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  flex: '1 1 auto',
                }}
                onClick={() => {
                  soundClick()
                  setTimeLimitMs(p.ms)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={900}
            max={4000}
            step={50}
            value={timeLimitMs}
            onChange={(e) => setTimeLimitMs(Number(e.target.value))}
            className="pref-slider"
            style={
              {
                '--fill': `${((timeLimitMs - 900) / (4000 - 900)) * 100}%`,
              } as unknown as React.CSSProperties
            }
          />
          <p
            className="mono"
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-primary)',
              marginTop: '0.5rem',
              marginBottom: '0.3rem',
            }}
          >
            {formatReactionTime(timeLimitMs)}
          </p>
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--gco-ink-faint)',
              marginBottom: '1.3rem',
              lineHeight: 1.4,
            }}
          >
            Recomendado: {formatReactionTime(recommendedTimeMs)} — un tiempo
            prudente pero desafiante según tu nivel actual.
          </p>

          <button
            type="button"
            className="glass-button"
            style={{ width: '100%' }}
            onClick={save}
          >
            Guardar nivel creativo
          </button>
          {msg && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-primary)',
                marginTop: '0.6rem',
                textAlign: 'center',
              }}
            >
              {msg}
            </p>
          )}
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--gco-ink-faint)',
              marginTop: '0.7rem',
              lineHeight: 1.4,
            }}
          >
            Estos niveles no sustituyen el historial de tiempos, pero sí
            aparecen mezclados en la progresión normal (cada 4 niveles), y
            también puedes jugarlos cuando quieras desde “Tus niveles
            guardados”.
          </p>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ padding: '1.25rem 1.25rem' }}>
          <p className="more-section-title">Crear una nueva acción</p>
          <label className="more-field-label">Nombre de la acción</label>
          <input
            className="glass-input"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="p. ej. den una vuelta"
            style={{ marginBottom: '1rem' }}
          />
          <label className="more-field-label">Emoji</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '0.4rem',
              marginBottom: '1rem',
            }}
          >
            {ACTION_EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  soundClick()
                  setNewEmoji(emoji)
                }}
                style={{
                  height: 40,
                  borderRadius: 'var(--gco-radius-xs)',
                  border:
                    newEmoji === emoji
                      ? '1.5px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background:
                    newEmoji === emoji
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                  fontSize: '1.15rem',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label className="more-field-label">Color</label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.2rem',
            }}
          >
            {ACTION_COLOR_CHOICES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  soundClick()
                  setNewColor(hex)
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: hex,
                  border:
                    newColor === hex
                      ? '3px solid var(--gco-ink)'
                      : '1px solid var(--gco-glass-border)',
                  cursor: 'pointer',
                }}
                aria-label={hex}
              />
            ))}
          </div>
          <button
            type="button"
            className="glass-button secondary"
            style={{ width: '100%' }}
            onClick={addAction}
          >
            Añadir acción
          </button>
          {actionMsg && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-primary)',
                marginTop: '0.6rem',
                textAlign: 'center',
              }}
            >
              {actionMsg}
            </p>
          )}

          {customActions.length > 0 && (
            <>
              <p
                className="more-section-title"
                style={{ marginTop: '1.4rem' }}
              >
                Tus acciones creadas
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {customActions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--gco-radius-xs)',
                      background: 'var(--gco-glass-bg)',
                      border: '1px solid var(--gco-glass-border)',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', minWidth: 0 }}>
                      {a.emoji} {a.label}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeAction(a.id)}
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {customLevels.length > 0 && (
        <div className="glass-card">
          <div style={{ padding: '1.25rem 1.25rem' }}>
            <p className="more-section-title">Tus niveles guardados</p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {customLevels.map((lvl) => (
                <div
                  key={lvl.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.7rem 0.85rem',
                    borderRadius: 'var(--gco-radius-xs)',
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.82rem' }}>{lvl.prompt}</span>
                    <p
                      className="mono"
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--gco-ink-faint)',
                        marginTop: 2,
                      }}
                    >
                      {formatReactionTime(lvl.timeLimitMsOverride)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
                      onClick={() => onPlayLevel(lvl)}
                    >
                      Jugar
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeLevel(lvl.id)}
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Secuencia numérica (nuevo juego de habilidad) ──────────────────────────
   Inspirado en la clásica "tabla de Schulte", muy usada para entrenar
   atención sostenida, búsqueda visual y velocidad de procesamiento. Es
   simple de entender pero muy retante y adictivo: el jugador debe tocar
   los números en orden ascendente lo más rápido posible dentro de una
   cuadrícula que crece de tamaño en cada nivel. ─────────────────────────── */

interface SequenceResult {
  level: number
  size: number
  timeMs: number
  mistakes: number
  date: number
}

type SequencePhase = 'listo' | 'jugando' | 'resumen'

function sequenceBoardSize(level: number): number {
  return Math.min(9 + (level - 1) * 2, 36)
}
function sequenceCols(size: number): number {
  if (size <= 9) return 3
  if (size <= 16) return 4
  if (size <= 25) return 5
  return 6
}
/** Tiempo de referencia "bueno" para calificar el resultado con estrellas. */
function sequencePar(size: number): number {
  return size * 620
}
function sequenceStars(timeMs: number, mistakes: number, size: number): number {
  const penalized = timeMs + mistakes * 500
  const par = sequencePar(size)
  if (penalized <= par * 0.75) return 3
  if (penalized <= par * 1.15) return 2
  return 1
}

function SequenceGame() {
  const [level, setLevel] = useState<number>(() =>
    loadJSON(KEYS.sequenceLevel, 1)
  )
  const [phase, setPhase] = useState<SequencePhase>('listo')
  const [board, setBoard] = useState<number[]>([])
  const [nextTarget, setNextTarget] = useState(1)
  const [mistakes, setMistakes] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [flashWrong, setFlashWrong] = useState<number | null>(null)
  const [summary, setSummary] = useState<SequenceResult | null>(null)
  const [history, setHistory] = useState<SequenceResult[]>(() =>
    loadJSON(KEYS.sequenceHistory, [])
  )

  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    },
    []
  )

  const size = sequenceBoardSize(level)
  const cols = sequenceCols(size)

  const start = () => {
    soundStart()
    const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1))
    setBoard(nums)
    setNextTarget(1)
    setMistakes(0)
    setElapsedMs(0)
    setSummary(null)
    setPhase('jugando')
    startedAtRef.current = performance.now()
    tickRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current)
    }, 60)
  }

  const finish = useCallback(
    (timeMs: number, finalMistakes: number) => {
      if (tickRef.current) clearInterval(tickRef.current)
      const result: SequenceResult = {
        level,
        size,
        timeMs,
        mistakes: finalMistakes,
        date: Date.now(),
      }
      const nextHist = [result, ...history].slice(0, 15)
      setHistory(nextHist)
      saveJSON(KEYS.sequenceHistory, nextHist)
      setSummary(result)
      setPhase('resumen')
      const nextLevel = level + 1
      setLevel(nextLevel)
      saveJSON(KEYS.sequenceLevel, nextLevel)
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: nextLevel,
          success: finalMistakes === 0,
          timeMs,
        })
      } catch {
        /* */
      }
    },
    [level, size, history]
  )

  const handleTap = (n: number) => {
    if (phase !== 'jugando') return
    if (n !== nextTarget) {
      soundFail()
      setMistakes((m) => m + 1)
      setFlashWrong(n)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => setFlashWrong(null), 220)
      return
    }
    soundMatch()
    if (n === size) {
      const timeMs = performance.now() - startedAtRef.current
      finish(timeMs, mistakes)
    } else {
      setNextTarget(n + 1)
    }
  }

  const bestClean = history.filter((r) => r.mistakes === 0)
  const bestTime = bestClean.length
    ? Math.min(...bestClean.map((r) => r.timeMs))
    : history.length
      ? Math.min(...history.map((r) => r.timeMs))
      : null

  const stars = summary
    ? sequenceStars(summary.timeMs, summary.mistakes, summary.size)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
              🔢 Secuencia numérica
            </h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · {size} números
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            {phase === 'jugando'
              ? `Buscas el número ${nextTarget}`
              : 'Toca los números en orden ascendente lo más rápido posible.'}
          </p>
        </div>
      </div>

      {phase === 'jugando' && (
        <div
          className="glass-card"
          style={{
            marginBottom: '0.9rem',
            padding: '0.7rem 1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="mono" style={{ fontSize: '0.95rem' }}>
            ⏱ {formatReactionTime(elapsedMs)}
          </span>
          <span
            className="mono"
            style={{ fontSize: '0.85rem', color: 'var(--gco-secondary)' }}
          >
            Errores: {mistakes}
          </span>
        </div>
      )}

      {phase !== 'jugando' && (
        <div className="glass-card">
          <div style={{ padding: '1.85rem 1.5rem', textAlign: 'center' }}>
            {phase === 'resumen' && summary && (
              <>
                <p
                  style={{
                    fontSize: '1.6rem',
                    marginBottom: '0.5rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  {'★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars)}
                </p>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1.15rem',
                  }}
                >
                  Resultado del nivel {summary.level}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    rowGap: '1.35rem',
                    columnGap: '1.5rem',
                    marginBottom: '1.5rem',
                    textAlign: 'left',
                  }}
                >
                  <Stat label="Tiempo" value={formatReactionTime(summary.timeMs)} />
                  <Stat label="Errores" value={`${summary.mistakes}`} />
                  <Stat label="Casillas" value={`${summary.size}`} />
                  <Stat
                    label="Mejor sin errores"
                    value={bestTime !== null ? formatReactionTime(bestTime) : '—'}
                  />
                </div>
              </>
            )}
            <button
              type="button"
              className="glass-button"
              onClick={start}
              style={{ width: '100%' }}
            >
              {phase === 'resumen' ? 'Siguiente nivel' : 'Comenzar'}
            </button>
          </div>
        </div>
      )}

      {phase === 'jugando' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '0.55rem',
          }}
        >
          {board.map((n) => {
            const done = n < nextTarget
            const isWrong = flashWrong === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => handleTap(n)}
                disabled={done}
                className="mono"
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 'var(--gco-radius-sm)',
                  border: isWrong
                    ? '1.5px solid var(--gco-secondary)'
                    : '1px solid var(--gco-glass-border)',
                  background: isWrong
                    ? 'var(--gco-secondary-dim)'
                    : done
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                  color: done ? 'var(--gco-primary)' : 'var(--gco-ink)',
                  fontWeight: 700,
                  fontSize: 'clamp(0.85rem, 3.4vw, 1.15rem)',
                  cursor: done ? 'default' : 'pointer',
                  opacity: done ? 0.55 : 1,
                  transition: 'background 0.12s ease, border-color 0.12s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
      )}

      {phase !== 'jugando' && history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <p className="more-section-title" style={{ marginBottom: '0.7rem' }}>
              Historial reciente
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.slice(0, 10).map((r, i) => (
                <span
                  key={`${r.date}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color:
                      r.mistakes === 0 ? 'var(--gco-primary)' : 'var(--gco-ink)',
                  }}
                >
                  {formatReactionTime(r.timeMs)}
                  {r.mistakes > 0 ? ` · ${r.mistakes} err` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}