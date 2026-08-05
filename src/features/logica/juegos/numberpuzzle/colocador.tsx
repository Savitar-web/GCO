import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassButton } from '@/components/ui/GlassButton'
import { GlassCard } from '@/components/ui/GlassCard'
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
  getProgressPrefs,
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

type Phase = 'ready' | 'playing' | 'won' | 'lost'

/* ── hooks locales ─────────────────────────────────────────────────────── */

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

function useIsMobile(breakpoint = 700) {
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

/* ── Switch inline ─────────────────────────────────────────────────────── */

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
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--gco-glass-border)',
      }}
    >
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <p style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</p>
        {desc && (
          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>{desc}</p>
        )}
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

/* ── Stat chip ─────────────────────────────────────────────────────────── */

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
    <GlassCard>
      <div
        style={{
          minWidth: 100,
          padding: '0.65rem 0.8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
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
            fontSize: '1.1rem',
            fontWeight: 600,
            color: accent ? 'var(--gco-primary)' : 'var(--gco-ink)',
          }}
        >
          {value}
        </span>
      </div>
    </GlassCard>
  )
}

/* ── Componente principal ──────────────────────────────────────────────── */

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
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [softMode, setSoftMode] = useState(() => getProgressPrefs().softProgression)
  const [peekSolved, setPeekSolved] = useState(false)

  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const boardRef = useRef<Board>([])
  boardRef.current = board
  const movesRef = useRef(0)
  movesRef.current = moves

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, progress.highestLevel, progress.totalCompleted]
  )

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearTimer(), [])

  const startTimer = () => {
    clearTimer()
    startedAtRef.current = performance.now()
    setElapsedMs(0)
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current == null) return
      setElapsedMs(Math.round(performance.now() - startedAtRef.current))
    }, 200)
  }

  const stopTimer = (): number => {
    clearTimer()
    const t =
      startedAtRef.current != null
        ? Math.round(performance.now() - startedAtRef.current)
        : elapsedMs
    startedAtRef.current = null
    setElapsedMs(t)
    return t
  }

  const buildLevel = useCallback(
    (lv: number) => generateNumberPuzzleLevel(lv, { softProgression: softMode }),
    [softMode]
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
      setPhase('playing')
      startTimer()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, buildLevel]
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
    setPhase('playing')
    startTimer()
  }

  const finishWin = (newMoves: number) => {
    const timeMs = stopTimer()
    const size = puzzle?.size ?? 3
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

  const finishLose = () => {
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
  }

  const applyBoard = useCallback(
    (next: Board) => {
      if (!puzzle || phase !== 'playing') return
      setBoard(next)
      const newMoves = movesRef.current + 1
      movesRef.current = newMoves
      setMoves(newMoves)

      if (puzzle.moveLimit > 0 && newMoves >= puzzle.moveLimit && !isSolved(next)) {
        finishLose()
        return
      }
      if (isSolved(next)) finishWin(newMoves)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, puzzle]
  )

  const tryMove = useCallback(
    (from: number) => {
      if (phase !== 'playing' || !puzzle) return
      if (!canMove(boardRef.current, puzzle.size, from)) return
      soundClick()
      applyBoard(moveTile(boardRef.current, puzzle.size, from))
    },
    [phase, puzzle, applyBoard]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' || !puzzle) return
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
  }, [phase, puzzle, applyBoard])

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (phase !== 'playing') return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (phase !== 'playing' || !puzzle || !touchStart.current) return
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

  const size: GridSize = puzzle?.size ?? sizeForLevel(level)
  const px = tileSizePx(size, isMobile)
  const tiles = size * size - 1

  const sizeLabel =
    size === 2
      ? '2×2 · 3 fichas'
      : size === 3
        ? '3×3 · 8 fichas'
        : size === 4
          ? '4×4 · 15 fichas'
          : '5×5 · 24 fichas'

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
      : 0

  const goReady = (lv?: number) => {
    if (lv != null) setLevel(lv)
    setPhase('ready')
    clearTimer()
    setShowLevelPicker(false)
    setShowHint(false)
    setPeekSolved(false)
  }

  return (
    <div className="app-shell app-shell-pro" style={{ maxWidth: 1100 }}>
      {/* Header */}
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
              background: 'linear-gradient(90deg, var(--gco-primary), var(--gco-accent))',
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
              setShowLevelPicker((v) => !v)
            }}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          >
            Nivel {level} ▾
          </button>
          <span
            className="mono"
            style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
          >
            ⏱{' '}
            {phase === 'playing' || phase === 'ready'
              ? formatTime(elapsedMs)
              : lastTimeMs != null
                ? formatTime(lastTimeMs)
                : formatTime(elapsedMs)}
          </span>
        </div>
      </header>

      {/* Level picker */}
      <AnimatePresence>
        {showLevelPicker && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
          >
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: 8,
              }}
            >
              Niveles desbloqueados · generados al vuelo
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className={`glass-button ${level === defaultLevel ? '' : 'secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                onClick={() => {
                  soundClick()
                  goReady(defaultLevel)
                }}
              >
                Nv. {defaultLevel}
              </button>
              {unlocked.map((u) => (
                <button
                  key={u.level}
                  type="button"
                  className={`glass-button ${level === u.level ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                  onClick={() => {
                    soundClick()
                    goReady(u.level)
                  }}
                >
                  Nv. {u.level}
                  <span
                    className="mono"
                    style={{ display: 'block', fontSize: '0.65rem' }}
                  >
                    {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {/* Sidebar desktop */}
        {!isMobile && (
          <GlassCard>
            <div style={{ width: 150, padding: '0.75rem 0.6rem' }}>
              <p
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                📶 Niveles
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
gap: '0.85rem 1.25rem',
    marginBottom: '1.2rem',
    textAlign: 'left',
    width: '100%',
                }}
              >
                {sideLevels.map((id) => {
                  const open =
                    id <= defaultLevel || unlocked.some((u) => u.level === id)
                  const active = id === level
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        if (!open) return
                        soundClick()
                        goReady(id)
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        padding: '0.4rem 0.25rem',
                        borderRadius: 10,
                        border: active
                          ? '1px solid var(--gco-primary)'
                          : '1px solid var(--gco-glass-border)',
                        background: active
                          ? 'var(--gco-primary-dim)'
                          : 'transparent',
                        color: active
                          ? 'var(--gco-primary)'
                          : 'var(--gco-ink-muted)',
                        cursor: open ? 'pointer' : 'not-allowed',
                        opacity: open ? 1 : 0.4,
                        fontSize: '0.65rem',
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
                      Nivel {id}
                    </button>
                  )
                })}
              </div>
            </div>
          </GlassCard>
        )}

        {/* Tablero + stats */}
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
          <GlassCard>
            <div
              style={{
                padding: isMobile ? '0.75rem' : '1rem',
                borderRadius: 'var(--gco-radius)',
                boxShadow: '0 0 36px var(--gco-primary-dim)',
              }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {(phase === 'ready' || !puzzle) && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '1.5rem 1rem',
                    minWidth: isMobile ? 240 : 280,
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>
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
                      marginBottom: 16,
                    }}
                  >
                    Ordena del 1 al {tiles}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginBottom: 16,
                      textAlign: 'left',
                    }}
                  >
                  </div>

                  <GlassButton onClick={() => startLevel()}>
                    Comenzar nivel {level}
                  </GlassButton>
                </div>
              )}

              {phase !== 'ready' && puzzle && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${size}, ${px}px)`,
                    gridTemplateRows: `repeat(${size}, ${px}px)`,
                    gap: isMobile ? 6 : 8,
                    margin: '0 auto',
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
                            background: 'rgba(0,0,0,0.18)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--gco-ink-faint)',
                            fontSize: '1.3rem',
                          }}
                        >
                          ←
                        </div>
                      )
                    }

                    const color = tileColor(cell, theme)
                    const inPlace = cell === i + 1
                    const active =
                      phase === 'playing' && canMove(board, size, i)

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
                          opacity: peekSolved && !inPlace ? 0.45 : 1,
                        }}
                        style={{
                          width: px,
                          height: px,
                          borderRadius: 14,
                          border: inPlace
                            ? `2px solid ${color}`
                            : `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
                          background: `linear-gradient(145deg, color-mix(in srgb, ${color} 22%, transparent), rgba(0,0,0,0.28))`,
                          color,
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: `clamp(1rem, ${px * 0.38}px, 1.9rem)`,
                          boxShadow: inPlace
                            ? `0 0 18px color-mix(in srgb, ${color} 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)`
                            : `0 0 14px color-mix(in srgb, ${color} 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.12)`,
                          cursor: active ? 'pointer' : 'default',
                          padding: 0,
                          transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        {cell}
                      </motion.button>
                    )
                  })}
                </div>
              )}
            </div>
          </GlassCard>

          {phase !== 'ready' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                width: '100%',
                maxWidth: 420,
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
                label="Estado"
                value={
                  phase === 'playing'
                    ? remainingMoves != null
                      ? `${remainingMoves} rest.`
                      : 'En progreso'
                    : phase === 'won'
                      ? '¡Completado!'
                      : 'Sin movimientos'
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
                onClick={() => {
                  soundClick()
                  setShowHint((v) => !v)
                }}
              >
                {showHint ? 'Ocultar pista' : '💡 Pista'}
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
            </div>
          )}

          {showHint && phase === 'playing' && (
            <GlassCard>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.82rem',
                  color: 'var(--gco-ink-muted)',
                  maxWidth: 360,
                  lineHeight: 1.45,
                }}
              >
                <p
                  style={{
                    fontWeight: 600,
                    color: 'var(--gco-ink)',
                    marginBottom: 4,
                  }}
                >
                  Consejos
                </p>
                <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  <li>Resuelve fila por fila de arriba hacia abajo.</li>
                  <li>No rompas filas ya ordenadas salvo que sea necesario.</li>
                  <li>Usa flechas / WASD o desliza el dedo sobre el tablero.</li>
                  {puzzle && puzzle.moveLimit > 0 && (
                    <li>
                      Límite de {puzzle.moveLimit} movimientos · te quedan{' '}
                      <span className="mono">{remainingMoves}</span>.
                    </li>
                  )}
                </ul>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Footer */}
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
        <GlassCard>
          <div
            style={{
              minWidth: 200,
              padding: '0.7rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
              color: 'var(--gco-ink-muted)',
            }}
          >
            <span>💡</span>
            <span>
              {puzzle?.goal ??
                `Ordena los números del 1 al ${tiles} usando el espacio vacío.`}
              {puzzle && puzzle.moveLimit > 0 && phase === 'playing' && (
                <span
                  className="mono"
                  style={{ marginLeft: 8, color: 'var(--gco-secondary)' }}
                >
                  · máx {puzzle.moveLimit} mov
                </span>
              )}
            </span>
          </div>
        </GlassCard>

        {phase !== 'ready' && (
          <button
            type="button"
            className="glass-button secondary"
            onClick={restart}
            style={{ flexShrink: 0 }}
          >
            ↻ Reiniciar nivel
          </button>
        )}
      </div>

      {/* Overlay resultado */}
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
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              padding: '1.25rem',
            }}
          >
            <GlassCard>
              <div
                style={{
                  maxWidth: 360,
                  width: '100%',
                  padding: '1.5rem 1.3rem',
                  textAlign: 'center',
                }}
              >
                <h2 style={{ marginBottom: 8 }}>
                  {phase === 'won'
                    ? '¡Nivel superado!'
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
                    <p
                      style={{
                        color: 'var(--gco-ink-muted)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {moves} movimientos ·{' '}
                      {lastTimeMs != null ? formatTime(lastTimeMs) : '—'}
                    </p>
                    {bestForLevel != null &&
                      lastTimeMs != null &&
                      lastTimeMs > bestForLevel && (
                        <p
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--gco-secondary)',
                            marginTop: 6,
                          }}
                        >
                          Tu marca: {formatDuration(bestForLevel)}
                        </p>
                      )}
                  </>
                )}

                {phase === 'lost' && (
                  <p
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.9rem',
                      margin: '0.5rem 0 0',
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
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Colocador