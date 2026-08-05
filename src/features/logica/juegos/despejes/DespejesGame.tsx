/**
 * Despejes — puzzles de despejar camino / laberinto
 * src/features/logica/juegos/despejes/DespejesGame.tsx
 *
 * Modos: Hielo · Empuje · Tráfico · Laberinto
 * Compatible con generateLevel.ts (sección 3 DESPEJES)
 * y con recordLevelResult({ categoryId, gameId, level, success, timeMs }).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundCard,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  formatDuration,
} from '@/core/storage/progress'
import {
  DESPEJE_MODES,
  generateDespejeLevel,
  stepPlayer,
  moveTrafficPiece,
  isDespejeWon,
  calcDespejeStars,
  despejeCellPx,
  formatTime,
  type DespejeMode,
  type DespejeLevel,
  type DespejeGrid,
  type DespejeDir,
  type TrafficPiece,
} from '../generateLevel'

const GAME_CAT = 'logica' as const
const GAME_ID = 'despejes'

type Phase = 'hub' | 'playing' | 'success'

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

function progressKey(mode: DespejeMode) {
  return `${GAME_ID}:${mode}`
}

function saveResult(
  gameId: string,
  level: number,
  success: boolean,
  timeMs: number,
  score?: number
) {
  try {
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId,
      level,
      success,
      timeMs,
      score,
    })
  } catch {
    /* progress API opcional / variantes */
  }
}

/* ── estilos de celda ── */

function cellStyle(
  cell: number,
  isPlayer: boolean,
  isGoalUnder: boolean,
  traffic?: TrafficPiece[]
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    display: 'grid',
    placeItems: 'center',
    fontSize: '0.85rem',
    fontWeight: 700,
    userSelect: 'none',
    transition: 'transform 0.12s ease, background 0.12s ease',
    boxSizing: 'border-box',
  }

  if (isPlayer) {
    return {
      ...base,
      background: 'var(--gco-primary)',
      color: 'var(--gco-button-text)',
      boxShadow: isGoalUnder
        ? '0 0 0 2px var(--gco-secondary)'
        : '0 0 0 2px rgba(42,216,185,0.35)',
    }
  }
  if (cell === 1) {
    return {
      ...base,
      background: 'var(--gco-glass-bg-hover)',
      border: '1px solid var(--gco-glass-border)',
      opacity: 0.9,
    }
  }
  if (cell === 3 || isGoalUnder) {
    return {
      ...base,
      background: 'var(--gco-secondary-dim)',
      border: '1px dashed var(--gco-secondary)',
      color: 'var(--gco-secondary)',
    }
  }
  if (cell === 4) {
    return {
      ...base,
      background: 'rgba(245, 166, 35, 0.88)',
      color: '#1a1200',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }
  }
  if (cell === 5) {
    return {
      ...base,
      background: 'rgba(42, 216, 185, 0.92)',
      color: 'var(--gco-button-text)',
      boxShadow: '0 0 0 2px var(--gco-primary)',
    }
  }
  if (cell === 6) {
    return {
      ...base,
      background: 'transparent',
      border: '2px solid rgba(245, 166, 35, 0.55)',
      color: 'rgba(245, 166, 35, 0.85)',
    }
  }
  if (cell >= 10 && traffic) {
    const p = traffic.find((t) => t.id === cell)
    if (p?.isHero) {
      return {
        ...base,
        background: 'var(--gco-secondary)',
        color: '#fff',
        borderRadius: 6,
      }
    }
    return {
      ...base,
      background: 'var(--gco-accent)',
      color: '#fff',
      borderRadius: 6,
      opacity: 0.92,
    }
  }
  return {
    ...base,
    background: 'var(--gco-glass-bg)',
    border: '1px solid transparent',
  }
}

function cellLabel(
  cell: number,
  isPlayer: boolean,
  isGoalUnder: boolean,
  traffic?: TrafficPiece[]
): string {
  if (isPlayer) return '●'
  if (cell === 1) return ''
  if (cell === 3 || isGoalUnder) return '★'
  if (cell === 4) return '▢'
  if (cell === 5) return '▣'
  if (cell === 6) return '◎'
  if (cell >= 10 && traffic) {
    const p = traffic.find((t) => t.id === cell)
    if (p?.isHero) return '▶'
    return p?.horizontal ? '═' : '║'
  }
  return ''
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function DespejesGame() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const progressAll = getGameProgress(GAME_CAT, GAME_ID)

  const [phase, setPhase] = useState<Phase>('hub')
  const [mode, setMode] = useState<DespejeMode>('hielo')
  const [level, setLevel] = useState(1)
  const [levelData, setLevelData] = useState<DespejeLevel | null>(null)

  const [grid, setGrid] = useState<DespejeGrid>([])
  const [pr, setPr] = useState(0)
  const [pc, setPc] = useState(0)
  const [traffic, setTraffic] = useState<TrafficPiece[]>([])
  const [selectedTrafficId, setSelectedTrafficId] = useState<number | null>(null)
  const [goalCells, setGoalCells] = useState<Set<string>>(new Set())

  const [moves, setMoves] = useState(0)
  const [timeMs, setTimeMs] = useState(0)
  const [stars, setStars] = useState<0 | 1 | 2 | 3>(0)
  const [msg, setMsg] = useState('')
  const [paused, setPaused] = useState(false)

  const startedAt = useRef<number | null>(null)
  const pausedAccum = useRef(0)
  const pauseStartedAt = useRef<number | null>(null)
  const historyRef = useRef<
    { grid: DespejeGrid; pr: number; pc: number; traffic: TrafficPiece[] }[]
  >([])

  const modeProgress = getGameProgress(GAME_CAT, progressKey(mode))

  let bestTime: number | null = null
  if (levelData) {
    try {
      bestTime = getLevelBestTime(GAME_CAT, progressKey(mode), levelData.level)
    } catch {
      bestTime = null
    }
  }

  const cellPx = useMemo(() => {
    if (!levelData) return 40
    return despejeCellPx(levelData.rows, levelData.cols, isMobile)
  }, [levelData, isMobile])

  useEffect(() => {
    if (phase !== 'playing' || paused) return
    const id = window.setInterval(() => {
      if (startedAt.current == null) return
      setTimeMs(performance.now() - startedAt.current - pausedAccum.current)
    }, 100)
    return () => clearInterval(id)
  }, [phase, paused])

  const resetTimer = () => {
    startedAt.current = performance.now()
    pausedAccum.current = 0
    pauseStartedAt.current = null
    setTimeMs(0)
    setPaused(false)
  }

  const loadLevel = useCallback((m: DespejeMode, lv: number, salt?: number) => {
    const data = generateDespejeLevel(m, lv, { seedSalt: salt })
    setLevelData(data)
    setGrid(data.grid.map((row) => row.slice()))
    setPr(data.start.r)
    setPc(data.start.c)
    setTraffic(data.traffic ? data.traffic.map((p) => ({ ...p })) : [])
    setSelectedTrafficId(
      data.traffic?.find((p) => p.isHero)?.id ?? data.traffic?.[0]?.id ?? null
    )

    const goals = new Set<string>()
    if (m === 'hielo' || m === 'laberinto') {
      goals.add(`${data.goal.r},${data.goal.c}`)
    }
    if (m === 'empuje') {
      data.grid.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (cell === 6 || cell === 5) goals.add(`${r},${c}`)
        })
      )
    }
    setGoalCells(goals)

    setMoves(0)
    setStars(0)
    setMsg('')
    historyRef.current = []
    resetTimer()
    setPhase('playing')
    soundStart()
  }, [])

  const startMode = (m: DespejeMode) => {
    soundClick()
    setMode(m)
    const prog = getGameProgress(GAME_CAT, progressKey(m))
    const next = Math.max(1, prog.highestLevel + 1)
    setLevel(next)
    loadLevel(m, next)
  }

  const retry = () => {
    soundClick()
    if (!levelData) return
    loadLevel(mode, levelData.level, (Date.now() % 99991) + 3)
  }

  const nextLevel = () => {
    soundClick()
    const n = level + 1
    setLevel(n)
    loadLevel(mode, n)
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    soundToggle(false)
    setGrid(prev.grid)
    setPr(prev.pr)
    setPc(prev.pc)
    setTraffic(prev.traffic)
    setMoves((m) => Math.max(0, m - 1))
  }

  const pushHistory = (
    g: DespejeGrid,
    r: number,
    c: number,
    t: TrafficPiece[]
  ) => {
    historyRef.current.push({
      grid: g.map((row) => row.slice()),
      pr: r,
      pc: c,
      traffic: t.map((x) => ({ ...x })),
    })
    if (historyRef.current.length > 80) historyRef.current.shift()
  }

  const checkWin = (
    nextGrid: DespejeGrid,
    nr: number,
    nc: number,
    nextTraffic: TrafficPiece[],
    moveCount: number
  ) => {
    if (!levelData) return
    if (!isDespejeWon(mode, nextGrid, nr, nc, levelData.goal, nextTraffic)) return

    const elapsed =
      (startedAt.current != null
        ? performance.now() - startedAt.current - pausedAccum.current
        : timeMs) || timeMs
    const s = calcDespejeStars(
      moveCount,
      elapsed,
      levelData.moveHint,
      levelData.targetSeconds
    )
    setStars(s)
    setTimeMs(elapsed)
    setPhase('success')
    soundSuccess()
    saveResult(GAME_ID, levelData.level, true, elapsed, moveCount)
    saveResult(progressKey(mode), levelData.level, true, elapsed, moveCount)
  }

  const tryMove = useCallback(
    (dir: DespejeDir) => {
      if (phase !== 'playing' || paused || !levelData) return
      if (mode === 'trafico') return

      pushHistory(grid, pr, pc, traffic)
      const res = stepPlayer(grid, pr, pc, dir, mode)
      if (!res.moved) {
        historyRef.current.pop()
        soundFail()
        return
      }

      const next = res.grid.map((row) => row.slice())
      if (mode === 'hielo' || mode === 'laberinto') {
        for (const key of goalCells) {
          const [gr, gc] = key.split(',').map(Number)
          if (next[gr]?.[gc] === 0) next[gr][gc] = 3
        }
        if (next[res.pr]?.[res.pc] === 3) next[res.pr][res.pc] = 2
      }
      if (mode === 'empuje') {
        for (const key of goalCells) {
          const [gr, gc] = key.split(',').map(Number)
          if (next[gr]?.[gc] === 0) next[gr][gc] = 6
        }
      }

      soundCard()
      setGrid(next)
      setPr(res.pr)
      setPc(res.pc)
      const nextMoves = moves + 1
      setMoves(nextMoves)
      checkWin(next, res.pr, res.pc, traffic, nextMoves)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, paused, levelData, mode, grid, pr, pc, moves, traffic, goalCells]
  )

  const tryTrafficMove = useCallback(
    (dir: DespejeDir) => {
      if (phase !== 'playing' || paused || !levelData || mode !== 'trafico') return
      if (selectedTrafficId == null) return
      pushHistory(grid, pr, pc, traffic)
      const res = moveTrafficPiece(grid, traffic, selectedTrafficId, dir)
      if (!res.moved) {
        historyRef.current.pop()
        soundFail()
        return
      }
      soundCard()
      setGrid(res.grid)
      setTraffic(res.pieces)
      const nextMoves = moves + 1
      setMoves(nextMoves)
      checkWin(res.grid, pr, pc, res.pieces, nextMoves)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, paused, levelData, mode, selectedTrafficId, grid, traffic, moves, pr, pc]
  )

  const move = (dir: DespejeDir) => {
    if (mode === 'trafico') tryTrafficMove(dir)
    else tryMove(dir)
  }

  const togglePause = () => {
    soundToggle(!paused)
    if (!paused) {
      pauseStartedAt.current = performance.now()
      setPaused(true)
      setMsg('Pausa')
    } else {
      if (pauseStartedAt.current != null) {
        pausedAccum.current += performance.now() - pauseStartedAt.current
        pauseStartedAt.current = null
      }
      setPaused(false)
      setMsg('')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' || paused) return
      const map: Record<string, DespejeDir> = {
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
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        togglePause()
        return
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        move(dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, mode, grid, pr, pc, traffic, selectedTrafficId, moves])

  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (Math.max(absX, absY) < 28) return
    if (absX > absY) move(dx > 0 ? 'right' : 'left')
    else move(dy > 0 ? 'down' : 'up')
  }

  /* ── HUB ── */
  if (phase === 'hub') {
    return (
      <div className="app-shell" style={{ color: 'var(--gco-ink)' }}>
        <header style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              navigate('/categoria/logica')
            }}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.88rem',
              marginBottom: '0.85rem',
            }}
          >
            ← Volver
          </button>
          <h1 style={{ fontSize: 'clamp(1.55rem, 5vw, 2rem)', margin: 0 }}>
            🧹 Despejes
          </h1>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              marginTop: '0.35rem',
              fontSize: '0.9rem',
              lineHeight: 1.4,
            }}
          >
            Despeja el camino, deslízate sobre hielo o escapa del laberinto.
            Progresión lenta para encadenar victorias.
          </p>
          {progressAll.highestLevel > 0 && (
            <p
              className="mono"
              style={{
                color: 'var(--gco-primary)',
                fontSize: '0.78rem',
                marginTop: '0.4rem',
              }}
            >
              Mejor nivel · {progressAll.highestLevel}
              {progressAll.totalCompleted > 0 &&
                ` · ${progressAll.totalCompleted} victorias`}
            </p>
          )}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {DESPEJE_MODES.map((m, i) => {
            const mp = getGameProgress(GAME_CAT, progressKey(m.id))
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard onClick={() => startMode(m.id)}>
                  <div
                    style={{
                      padding: '1.05rem 1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '1.65rem' }}>{m.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.2rem' }}>
                        {m.title}
                      </h3>
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--gco-ink-muted)',
                          margin: 0,
                          lineHeight: 1.35,
                        }}
                      >
                        {m.desc}
                      </p>
                      {mp.highestLevel > 0 && (
                        <p
                          className="mono"
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--gco-primary)',
                            marginTop: '0.3rem',
                          }}
                        >
                          Nivel {mp.highestLevel}
                        </p>
                      )}
                    </div>
                    <span style={{ color: 'var(--gco-ink-faint)', fontSize: '1.2rem' }}>
                      →
                    </span>
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── PLAYING ── */
  const modeMeta = DESPEJE_MODES.find((m) => m.id === mode)
  const unlocked = Math.max(modeProgress.highestLevel, level)

  return (
    <div
      className="app-shell"
      style={{
        color: 'var(--gco-ink)',
        paddingBottom: isMobile ? '5rem' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setPhase('hub')
            setLevelData(null)
          }}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
        >
          ← Modos
        </button>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>
            {modeMeta?.emoji} {modeMeta?.title} · Nv {level}
          </p>
          <p
            className="mono"
            style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}
          >
            {formatTime(timeMs)}
            {bestTime != null && (
              <>
                {' '}
                · mejor {formatDuration(bestTime)}
              </>
            )}
            {' · '}
            {moves} mov.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            className="glass-button secondary"
            onClick={togglePause}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
            title="Pausa (P)"
          >
            {paused ? '▶' : 'Ⅱ'}
          </button>
          <button
            type="button"
            className="glass-button secondary"
            onClick={undo}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
            title="Deshacer (Z)"
          >
            ↩
          </button>
        </div>
      </div>

      {levelData && (
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: '0.65rem',
            textAlign: 'center',
          }}
        >
          {levelData.goalText}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '0.85rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${levelData?.cols ?? 1}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${levelData?.rows ?? 1}, ${cellPx}px)`,
            gap: 3,
            padding: 8,
            borderRadius: 16,
            background: 'var(--gco-glass-bg)',
            border: '1px solid var(--gco-glass-border)',
            boxShadow: 'var(--gco-shadow)',
            maxWidth: '100%',
            opacity: paused ? 0.55 : 1,
            margin: '0 auto',
          }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const isPlayer = mode !== 'trafico' && r === pr && c === pc
              const isGoalUnder = goalCells.has(`${r},${c}`)
              const isSelectedTraffic =
                mode === 'trafico' && cell >= 10 && cell === selectedTrafficId

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => {
                    if (mode === 'trafico' && cell >= 10) {
                      soundClick()
                      setSelectedTrafficId(cell)
                    }
                  }}
                  style={{
                    ...cellStyle(cell, isPlayer, isGoalUnder, traffic),
                    width: cellPx,
                    height: cellPx,
                    padding: 0,
                    cursor: mode === 'trafico' && cell >= 10 ? 'pointer' : 'default',
                    outline: isSelectedTraffic
                      ? '2px solid var(--gco-primary)'
                      : undefined,
                    outlineOffset: 1,
                  }}
                  aria-label={`celda ${r},${c}`}
                >
                  {cellLabel(cell, isPlayer, isGoalUnder, traffic)}
                </button>
              )
            })
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(44px, 52px))',
          gridTemplateRows: 'repeat(3, minmax(44px, 52px))',
          gap: 6,
          justifyContent: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <div />
        <PadBtn label="▲" onPress={() => move('up')} />
        <div />
        <PadBtn label="◀" onPress={() => move('left')} />
        <PadBtn label="●" onPress={() => {}} muted />
        <PadBtn label="▶" onPress={() => move('right')} />
        <div />
        <PadBtn label="▼" onPress={() => move('down')} />
        <div />
      </div>

      {mode === 'trafico' && (
        <p
          style={{
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: '0.5rem',
          }}
        >
          Toca un objeto pra llevarlo a la salida
        </p>
      )}

      {msg && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--gco-primary)',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          {msg}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={retry}
          style={{ fontSize: '0.85rem' }}
        >
          Reintentar
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            const n = Math.max(1, level - 1)
            setLevel(n)
            loadLevel(mode, n)
          }}
          style={{ fontSize: '0.85rem' }}
        >
          Nivel −
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            const n = Math.min(unlocked + 1, level + 1)
            setLevel(n)
            loadLevel(mode, n)
          }}
          style={{ fontSize: '0.85rem' }}
        >
          Nivel +
        </button>
      </div>

      {unlocked > 1 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.35rem',
            justifyContent: 'center',
            maxWidth: 420,
            margin: '0 auto',
          }}
        >
          {Array.from({ length: Math.min(unlocked, 30) }, (_, i) => i + 1).map((lv) => (
            <button
              key={lv}
              type="button"
              className="glass-button secondary"
              style={{
                fontSize: '0.72rem',
                padding: '0.28rem 0.5rem',
                minWidth: 32,
                opacity: lv === level ? 1 : 0.75,
                borderColor:
                  lv === level ? 'var(--gco-primary)' : 'var(--gco-glass-border)',
              }}
              onClick={() => {
                soundClick()
                setLevel(lv)
                loadLevel(mode, lv)
              }}
            >
              {lv}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {phase === 'success' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 80,
              background: 'rgba(0,0,0,0.55)',
              display: 'grid',
              placeItems: 'center',
              padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass-card"
              style={{
                padding: '1.35rem 1.4rem',
                maxWidth: 360,
                width: '100%',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  color: 'var(--gco-primary)',
                  fontWeight: 700,
                  fontSize: '1.15rem',
                  marginBottom: '0.35rem',
                }}
              >
                ¡Camino despejado!
              </p>
              <p
                style={{
                  color: 'var(--gco-ink-muted)',
                  fontSize: '0.88rem',
                  marginBottom: '0.75rem',
                }}
              >
                Nivel {level} · {moves} movimientos · {formatTime(timeMs)}
              </p>
              <p style={{ fontSize: '1.4rem', marginBottom: '1rem', letterSpacing: 4 }}>
                {'★'.repeat(stars)}
                {'☆'.repeat(3 - stars)}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: '0.55rem',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <GlassButton onClick={nextLevel}>Siguiente nivel</GlassButton>
                <button type="button" className="glass-button secondary" onClick={retry}>
                  Reintentar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PadBtn({
  label,
  onPress,
  muted,
}: {
  label: string
  onPress: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (muted) return
        onPress()
      }}
      className="glass-button secondary"
      style={{
        width: '100%',
        height: '100%',
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        fontSize: '1.1rem',
        opacity: muted ? 0.35 : 1,
        borderRadius: 14,
      }}
      aria-hidden={muted}
    >
      {label}
    </button>
  )
}

export default DespejesGame