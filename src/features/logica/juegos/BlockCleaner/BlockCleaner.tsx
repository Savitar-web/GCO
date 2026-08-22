import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { soundClick } from '@/core/audio/uiSounds'
import {
  generateLevel,
  FALLBACK_LEVEL,
  computeSlideRange,
  getHintMove,
  getExitableBlocks,
  starsForMoves,
  starsForTime,
  type Block,
  type BlockColor,
  type BlockCleanerLevel,
  type Exit,
} from './Generatelevelbc'

// =============================================================================
// Persistencia localStorage
// =============================================================================
const LS_CURRENT = 'blockCleaner.currentLevel'
const LS_UNLOCKED = 'blockCleaner.unlockedLevels'
const LS_BEST_SCORES = 'blockCleaner.bestScores'
const LS_BEST_MOVES = 'blockCleaner.bestMoves'
const LS_BEST_TIMES = 'blockCleaner.bestTimes'
const LS_DEFEATS = 'blockCleaner.defeats'
const LS_STYLE = 'blockCleaner.blockStyle'
const LS_OPTIONS = 'blockCleaner.playOptions'
const LS_TOTAL_WINS = 'blockCleaner.totalWins'
const LS_TOTAL_MOVES = 'blockCleaner.totalMoves'
const LS_STREAK = 'blockCleaner.winStreak'
const LS_BEST_STREAK = 'blockCleaner.bestStreak'

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function getCurrentLevel(): number {
  return Math.max(1, readJSON(LS_CURRENT, 1))
}
function getUnlockedLevels(): number {
  return Math.max(1, readJSON(LS_UNLOCKED, 1))
}
function getBestScores(): Record<number, number> {
  return readJSON(LS_BEST_SCORES, {})
}
function getBestMoves(): Record<number, number> {
  return readJSON(LS_BEST_MOVES, {})
}
function getBestTimes(): Record<number, number> {
  return readJSON(LS_BEST_TIMES, {})
}
function getDefeats(): Record<number, number> {
  return readJSON(LS_DEFEATS, {})
}

// =============================================================================
// Estilos de bloque
// =============================================================================
export type BlockStyle =
  | 'liquid-glass'
  | 'metallic'
  | 'matte'
  | 'neon'
  | 'pastel'
  | 'crystal'
  | 'candy'
  | 'obsidian'

const BLOCK_STYLES: { id: BlockStyle; label: string; desc: string }[] = [
  { id: 'liquid-glass', label: 'Liquid Glass', desc: 'Brillo iOS / glass' },
  { id: 'metallic', label: 'Metálico', desc: 'Acero cepillado' },
  { id: 'matte', label: 'Mate', desc: 'Superficie opaca' },
  { id: 'neon', label: 'Neón', desc: 'Resplandor intenso' },
  { id: 'pastel', label: 'Pastel', desc: 'Colores suaves' },
  { id: 'crystal', label: 'Cristal', desc: 'Translúcido' },
  { id: 'candy', label: 'Candy', desc: 'Caramelo brillante' },
  { id: 'obsidian', label: 'Obsidiana', desc: 'Negro profundo' },
]

const COLOR_HEX: Record<BlockColor, { base: string; light: string; glow: string }> = {
  cyan:   { base: '#22E6C5', light: '#7CFCE8', glow: 'rgba(34,230,197,0.55)' },
  blue:   { base: '#3AA0FF', light: '#8FCBFF', glow: 'rgba(58,160,255,0.55)' },
  violet: { base: '#8B7CF6', light: '#C2B8FF', glow: 'rgba(139,124,246,0.55)' },
  orange: { base: '#FF6B4A', light: '#FFA98F', glow: 'rgba(255,107,74,0.55)' },
  pink:   { base: '#FF6FA8', light: '#FFB3D3', glow: 'rgba(255,111,168,0.55)' },
  yellow: { base: '#FFC94D', light: '#FFE29B', glow: 'rgba(255,201,77,0.55)' },
  green:  { base: '#4ADE80', light: '#A6F3C2', glow: 'rgba(74,222,128,0.55)' },
  red:    { base: '#FF4D6A', light: '#FF9AAB', glow: 'rgba(255,77,106,0.55)' },
}

// =============================================================================
// Opciones
// =============================================================================
interface PlayOptions {
  timed: boolean
  hardcore: boolean
  noHints: boolean
  showExits: boolean
  zen: boolean
  showPar: boolean
}

const DEFAULT_OPTIONS: PlayOptions = {
  timed: false,
  hardcore: false,
  noHints: false,
  showExits: true,
  zen: false,
  showPar: true,
}

const PRO_TIPS = [
  'Observa el tablero 10–15 s antes de mover nada. Identifica qué bloques bloquean las salidas prioritarias.',
  'Libera primero los bloques con salida directa al borde. Cada salida libera espacio valioso.',
  'Los bloques con flecha solo se mueven en una dirección: úsalos como paredes móviles temporales.',
  'Nunca dejes un bloque largo bloqueando el centro si tienes salidas laterales cortas.',
  'Piensa en reverse: imagina el bloque ya fuera y trabaja hacia atrás desde la puerta.',
  'En niveles apretados, mueve los bloques de longitud 1 a las esquinas para crear pasillos.',
  'Si te atascas, reinicia y prueba un orden de colores completamente distinto.',
  'Las puertas más largas aceptan más bloques: úsalas prioritariamente para los polyominos grandes.',
  'Cuenta mentalmente los movimientos mínimos. Si superas el doble del par, cambia de estrategia.',
  'En contra-reloj prioriza velocidad sobre estrellas perfectas en los primeros intentos.',
  'Los obstáculos fijos son aliados: úsalos para detener bloques que se deslizan demasiado lejos.',
  'Agrupa mentalmente por color y resuelve un color completo antes de pasar al siguiente.',
  'Cuando dos bloques del mismo color compiten por la misma puerta, saca primero el más cercano al borde.',
  'Un bloque de longitud 1 es una “llave”: guárdalo para desbloquear espacios críticos al final.',
  'En hardcore no hay reinicios fáciles: planifica cada deslizamiento como si fuera el último.',
  'Las pistas revelan el siguiente movimiento óptimo del solver. Úsalas solo cuando estés realmente atascado.',
  'El modo Zen quita el temporizador y el contador de movimientos para practicar layouts difíciles.',
  'Revisa las estadísticas: tu racha de victorias y los niveles con 3★ revelan dónde mejorar.',
]

function formatTime(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60)
  const s = Math.max(0, totalSeconds) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface DragState {
  id: string
  orientation: 'horizontal' | 'vertical'
  pointerId: number
  startClientX: number
  startClientY: number
  startCoord: number
  length: number
  min: number
  max: number
}

type Screen =
  | 'menu'
  | 'options'
  | 'play'
  | 'level-select'
  | 'tips'
  | 'styles'
  | 'stats'
  | 'win'
  | 'lose'

// =============================================================================
// Componente principal — a prueba de undefined
// =============================================================================
export function BlockCleaner() {
  const navigate = useNavigate()

  const [screen, setScreen] = useState<Screen>('menu')
  const [levelId, setLevelId] = useState<number>(() => getCurrentLevel())
  const [unlocked, setUnlocked] = useState<number>(() => getUnlockedLevels())
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() =>
    readJSON<BlockStyle>(LS_STYLE, 'liquid-glass')
  )
  const [options, setOptions] = useState<PlayOptions>(() =>
    readJSON<PlayOptions>(LS_OPTIONS, DEFAULT_OPTIONS)
  )

  // ---- GENERACIÓN SEGURA (nunca lanza, nunca devuelve blocks undefined) ----
  const level: BlockCleanerLevel = useMemo(() => {
    try {
      const g = generateLevel(levelId)
      if (
        g &&
        typeof g === 'object' &&
        Array.isArray(g.blocks) &&
        g.blocks.length > 0 &&
        Array.isArray(g.exits) &&
        typeof g.rows === 'number' &&
        typeof g.cols === 'number'
      ) {
        return g
      }
      return { ...FALLBACK_LEVEL, id: levelId }
    } catch {
      return { ...FALLBACK_LEVEL, id: levelId }
    }
  }, [levelId])

  // ---- ESTADO DE BLOQUES: siempre array ----
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const src = Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks
    return src.map((b) => ({ ...b }))
  })

  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [stars, setStars] = useState<1 | 2 | 3>(1)
  const [hintId, setHintId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragCoord, setDragCoord] = useState<number | null>(null)
  const [cellSize, setCellSize] = useState(48)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [tipIndex, setTipIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [undoStack, setUndoStack] = useState<Block[][]>([])
  const [combo, setCombo] = useState(0)

  const boardRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const timerRef = useRef<number | null>(null)
  const secondsRef = useRef(0)

  // Reset al entrar en play
  useEffect(() => {
    if (screen !== 'play') return
    const src = Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks
    setBlocks(src.map((b) => ({ ...b })))
    setMoves(0)
    setSeconds(0)
    secondsRef.current = 0
    setHintId(null)
    setExitingId(null)
    setIsPaused(false)
    setUndoStack([])
    setCombo(0)
    writeJSON(LS_CURRENT, levelId)
  }, [level, levelId, screen])

  // Timer
  useEffect(() => {
    if (screen !== 'play' || isPaused || options.zen) return
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1
      setSeconds(secondsRef.current)
      if (options.timed && level.timeLimit && secondsRef.current >= level.timeLimit) {
        handleLose()
      }
    }, 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, screen, options.timed, options.zen, level.timeLimit, isPaused])

  // Cell size
  useEffect(() => {
    const el = boardRef.current
    if (!el || screen !== 'play') return
    const compute = () => {
      const width = el.clientWidth
      const size = Math.floor(width / Math.max(1, level.cols || 5))
      setCellSize(Math.max(24, Math.min(size, 64)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [level.cols, screen])

  const handleLose = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    const defeats = getDefeats()
    defeats[levelId] = (defeats[levelId] ?? 0) + 1
    writeJSON(LS_DEFEATS, defeats)
    writeJSON(LS_STREAK, 0)
    setScreen('lose')
  }, [levelId])

  const checkWin = useCallback(
    (remaining: Block[], movesUsed: number) => {
      if (!Array.isArray(remaining) || remaining.length > 0) return
      if (timerRef.current) window.clearInterval(timerRef.current)

      const moveStars = starsForMoves(movesUsed, level.parMoves || 5)
      const timeStars =
        options.zen || !level.timeLimit
          ? 3
          : starsForTime(secondsRef.current, level.timeLimit)
      const earned = Math.min(moveStars, timeStars) as 1 | 2 | 3
      setStars(earned)
      setScreen('win')

      const bestScores = getBestScores()
      const bestMovesMap = getBestMoves()
      const bestTimes = getBestTimes()
      if (earned > (bestScores[levelId] ?? 0)) bestScores[levelId] = earned
      if (bestMovesMap[levelId] === undefined || movesUsed < bestMovesMap[levelId]) {
        bestMovesMap[levelId] = movesUsed
      }
      if (bestTimes[levelId] === undefined || secondsRef.current < bestTimes[levelId]) {
        bestTimes[levelId] = secondsRef.current
      }
      writeJSON(LS_BEST_SCORES, bestScores)
      writeJSON(LS_BEST_MOVES, bestMovesMap)
      writeJSON(LS_BEST_TIMES, bestTimes)
      writeJSON(LS_TOTAL_WINS, readJSON(LS_TOTAL_WINS, 0) + 1)
      writeJSON(LS_TOTAL_MOVES, readJSON(LS_TOTAL_MOVES, 0) + movesUsed)

      const streak = readJSON(LS_STREAK, 0) + 1
      writeJSON(LS_STREAK, streak)
      const bestStreak = readJSON(LS_BEST_STREAK, 0)
      if (streak > bestStreak) writeJSON(LS_BEST_STREAK, streak)

      const nextUnlocked = Math.max(unlocked, levelId + 1)
      if (nextUnlocked !== unlocked) {
        setUnlocked(nextUnlocked)
        writeJSON(LS_UNLOCKED, nextUnlocked)
      }
    },
    [level.parMoves, level.timeLimit, levelId, unlocked, options.zen]
  )

  const tryExitBlock = useCallback(
    (blockId: string, currentBlocks: Block[]): Block[] => {
      const exits = Array.isArray(level.exits) ? level.exits : []
      const obstacles = Array.isArray(level.obstacles) ? level.obstacles : []
      const list = Array.isArray(currentBlocks) ? currentBlocks : []
      const exitable = getExitableBlocks(list, exits, obstacles, level.rows, level.cols)
      if (!exitable.includes(blockId)) return list

      setExitingId(blockId)
      setCombo((c) => c + 1)
      const next = list.filter((b) => b.id !== blockId)
      window.setTimeout(() => {
        setExitingId(null)
        setBlocks(next)
        setMoves((m) => {
          const newMoves = m + 1
          checkWin(next, newMoves)
          return newMoves
        })
      }, 280)
      return next
    },
    [level.exits, level.obstacles, level.rows, level.cols, checkWin]
  )

  const commitMove = useCallback(
    (blockId: string, orientation: 'horizontal' | 'vertical', value: number) => {
      setBlocks((prev) => {
        const list = Array.isArray(prev) ? prev : []
        if (!options.hardcore) {
          setUndoStack((stack) => [...stack.slice(-29), list.map((b) => ({ ...b }))])
        }
        const next = list.map((b) =>
          b.id === blockId
            ? orientation === 'horizontal'
              ? { ...b, col: value }
              : { ...b, row: value }
            : b
        )
        const afterExit = tryExitBlock(blockId, next)
        if (afterExit.length !== next.length) return afterExit
        setMoves((m) => m + 1)
        setCombo(0)
        return next
      })
      setHintId(null)
    },
    [tryExitBlock, options.hardcore]
  )

  const handleUndo = () => {
    if (options.hardcore || undoStack.length === 0) return
    soundClick()
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setBlocks(Array.isArray(prev) ? prev.map((b) => ({ ...b })) : [])
    setMoves((m) => Math.max(0, m - 1))
    setHintId(null)
    setCombo(0)
  }

  // Drag
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, block: Block) => {
    if (screen !== 'play' || exitingId || isPaused) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const list = Array.isArray(blocks) ? blocks : []
    const range = computeSlideRange(
      block,
      list,
      Array.isArray(level.obstacles) ? level.obstacles : [],
      level.rows,
      level.cols
    )
    const startCoord = block.orientation === 'horizontal' ? block.col : block.row
    dragRef.current = {
      id: block.id,
      orientation: block.orientation,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCoord,
      length: block.length,
      min: range.min,
      max: range.max,
    }
    setDraggingId(block.id)
    setDragCoord(startCoord)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const deltaPx =
      d.orientation === 'horizontal'
        ? e.clientX - d.startClientX
        : e.clientY - d.startClientY
    const deltaCells = Math.round(deltaPx / Math.max(1, cellSize))
    const target = Math.min(d.max, Math.max(d.min, d.startCoord + deltaCells))
    setDragCoord(target)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const finalCoord = dragCoord ?? d.startCoord
    dragRef.current = null
    setDraggingId(null)
    setDragCoord(null)
    if (finalCoord !== d.startCoord) {
      commitMove(d.id, d.orientation, finalCoord)
    }
  }

  const handleKeyMove = (e: React.KeyboardEvent<HTMLDivElement>, block: Block) => {
    if (screen !== 'play' || exitingId || isPaused) return
    const list = Array.isArray(blocks) ? blocks : []
    const range = computeSlideRange(
      block,
      list,
      Array.isArray(level.obstacles) ? level.obstacles : [],
      level.rows,
      level.cols
    )
    const current = block.orientation === 'horizontal' ? block.col : block.row
    let target: number | null = null
    if (block.orientation === 'horizontal' && e.key === 'ArrowLeft')
      target = Math.max(range.min, current - 1)
    if (block.orientation === 'horizontal' && e.key === 'ArrowRight')
      target = Math.min(range.max, current + 1)
    if (block.orientation === 'vertical' && e.key === 'ArrowUp')
      target = Math.max(range.min, current - 1)
    if (block.orientation === 'vertical' && e.key === 'ArrowDown')
      target = Math.min(range.max, current + 1)
    if (target !== null && target !== current) {
      e.preventDefault()
      commitMove(block.id, block.orientation, target)
    }
  }

  const handleRestart = () => {
    soundClick()
    const src = Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks
    setBlocks(src.map((b) => ({ ...b })))
    setMoves(0)
    setSeconds(0)
    secondsRef.current = 0
    setHintId(null)
    setExitingId(null)
    setIsPaused(false)
    setUndoStack([])
    setCombo(0)
    setScreen('play')
  }

  const handleHint = () => {
    if (options.noHints) return
    soundClick()
    const list = Array.isArray(blocks) ? blocks : []
    const move = getHintMove(
      list,
      Array.isArray(level.exits) ? level.exits : [],
      Array.isArray(level.obstacles) ? level.obstacles : [],
      level.rows,
      level.cols
    )
    if (move) {
      setHintId(move.blockId)
      window.setTimeout(
        () => setHintId((c) => (c === move.blockId ? null : c)),
        2200
      )
    }
  }

  const startLevel = (id: number) => {
    soundClick()
    setLevelId(Math.max(1, id))
    setScreen('play')
  }

  const goNextLevel = () => {
    soundClick()
    setLevelId((id) => id + 1)
    setScreen('play')
  }

  const goBack = () => {
    soundClick()
    navigate('/categoria/logica')
  }

  const saveOptions = (next: PlayOptions) => {
    setOptions(next)
    writeJSON(LS_OPTIONS, next)
  }

  const saveStyle = (s: BlockStyle) => {
    setBlockStyle(s)
    writeJSON(LS_STYLE, s)
  }

  const renderExit = (e: Exit) => {
    const c = COLOR_HEX[e.color] ?? COLOR_HEX.cyan
    const style: React.CSSProperties = {
      position: 'absolute',
      background: `linear-gradient(135deg, ${c.light}, ${c.base})`,
      boxShadow: `0 0 14px ${c.glow}`,
      borderRadius: 6,
      opacity: 0.9,
      zIndex: 2,
      pointerEvents: 'none',
    }
    if (e.side === 'top') {
      style.top = -12
      style.left = e.pos * cellSize + 3
      style.width = Math.max(10, e.length * cellSize - 6)
      style.height = 12
    } else if (e.side === 'bottom') {
      style.bottom = -12
      style.left = e.pos * cellSize + 3
      style.width = Math.max(10, e.length * cellSize - 6)
      style.height = 12
    } else if (e.side === 'left') {
      style.left = -12
      style.top = e.pos * cellSize + 3
      style.width = 12
      style.height = Math.max(10, e.length * cellSize - 6)
    } else {
      style.right = -12
      style.top = e.pos * cellSize + 3
      style.width = 12
      style.height = Math.max(10, e.length * cellSize - 6)
    }
    return <div key={e.id} className="bc-exit" style={style} aria-hidden />
  }

  const getBlockStyleProps = (color: BlockColor): React.CSSProperties => {
    const c = COLOR_HEX[color] ?? COLOR_HEX.cyan
    switch (blockStyle) {
      case 'metallic':
        return {
          background: `linear-gradient(145deg, ${c.light} 0%, ${c.base} 45%, #111 100%)`,
          boxShadow: `0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.35)`,
          border: '1px solid rgba(255,255,255,0.35)',
        }
      case 'matte':
        return {
          background: c.base,
          boxShadow: `0 3px 10px rgba(0,0,0,0.28)`,
          border: '1px solid rgba(0,0,0,0.18)',
        }
      case 'neon':
        return {
          background: `linear-gradient(135deg, ${c.light}, ${c.base})`,
          boxShadow: `0 0 18px ${c.glow}, 0 0 36px ${c.glow}, inset 0 0 10px rgba(255,255,255,0.25)`,
          border: `1px solid ${c.light}`,
        }
      case 'pastel':
        return {
          background: `linear-gradient(160deg, ${c.light}ee, ${c.base}cc)`,
          boxShadow: `0 4px 12px rgba(0,0,0,0.12)`,
          border: '1px solid rgba(255,255,255,0.55)',
        }
      case 'crystal':
        return {
          background: `linear-gradient(135deg, ${c.light}99, ${c.base}66, transparent)`,
          boxShadow: `0 0 22px ${c.glow}, inset 0 0 14px rgba(255,255,255,0.35)`,
          border: `1px solid ${c.light}`,
        }
      case 'candy':
        return {
          background: `radial-gradient(circle at 30% 25%, #fff8, ${c.light} 40%, ${c.base})`,
          boxShadow: `0 6px 18px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.6)`,
          border: '1px solid rgba(255,255,255,0.45)',
        }
      case 'obsidian':
        return {
          background: `linear-gradient(160deg, #2a2a2a, #0d0d0d)`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.6), inset 0 0 12px ${c.glow}`,
          border: `1px solid ${c.base}55`,
        }
      default:
        return {
          background: `linear-gradient(155deg, ${c.light}, ${c.base})`,
          boxShadow: `0 6px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)`,
          border: '1px solid rgba(255,255,255,0.35)',
        }
    }
  }

  // ========== SCREENS ==========
  if (screen === 'menu') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={goBack}>
            ← Volver
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Block Cleaner</h1>
            <span className="bc-level-badge">Nivel {levelId} · {level.tierLabel ?? '—'}</span>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-menu glass-card">
          <p className="bc-menu-desc">
            Desliza los bloques de color hasta las salidas del mismo color en los bordes.
            Cuanto más alto el nivel, más denso y más hay que pensar. ¡No te dejes atrapar!
          </p>
          <div className="bc-menu-actions">
            <button type="button" className="glass-button" onClick={() => { soundClick(); setScreen('options') }}>
              Jugar nivel {levelId}
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { soundClick(); setScreen('level-select') }}>
              Niveles anteriores
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { soundClick(); setTipIndex(Math.floor(Math.random() * PRO_TIPS.length)); setScreen('tips') }}>
              Consejos
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { soundClick(); setScreen('styles') }}>
              Estilos de bloque
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { soundClick(); setScreen('stats') }}>
              Estadísticas
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'options') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('menu')}>
            ← Menú
          </button>
          <div className="bc-title-wrap"><h1 className="bc-title">Opciones de partida</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-options glass-card">
          <label className="bc-opt-row">
            <span>Contra reloj</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.timed} onChange={(e) => saveOptions({ ...options, timed: e.target.checked })} />
              <span />
            </label>
          </label>
          <label className="bc-opt-row">
            <span>Hardcore (sin undo / reinicio fácil)</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.hardcore} onChange={(e) => saveOptions({ ...options, hardcore: e.target.checked })} />
              <span />
            </label>
          </label>
          <label className="bc-opt-row">
            <span>Sin pistas</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.noHints} onChange={(e) => saveOptions({ ...options, noHints: e.target.checked })} />
              <span />
            </label>
          </label>
          <label className="bc-opt-row">
            <span>Mostrar salidas de color</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.showExits} onChange={(e) => saveOptions({ ...options, showExits: e.target.checked })} />
              <span />
            </label>
          </label>
          <label className="bc-opt-row">
            <span>Modo Zen (sin tiempo ni presión)</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.zen} onChange={(e) => saveOptions({ ...options, zen: e.target.checked })} />
              <span />
            </label>
          </label>
          <label className="bc-opt-row">
            <span>Mostrar par de movimientos</span>
            <label className="gco-switch">
              <input type="checkbox" checked={options.showPar} onChange={(e) => saveOptions({ ...options, showPar: e.target.checked })} />
              <span />
            </label>
          </label>
          <button type="button" className="glass-button" style={{ marginTop: '1.2rem', width: '100%' }} onClick={() => startLevel(levelId)}>
            Empezar nivel {levelId}
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'level-select') {
    const bestScores = getBestScores()
    const bestMovesMap = getBestMoves()
    const defeats = getDefeats()
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('menu')}>
            ← Menú
          </button>
          <div className="bc-title-wrap"><h1 className="bc-title">Seleccionar nivel</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-level-grid">
          {Array.from({ length: unlocked }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`bc-level-btn glass-card ${n === levelId ? 'active' : ''}`}
              onClick={() => startLevel(n)}
            >
              <span className="bc-level-num">{n}</span>
              <span className="bc-level-stars">
                {'★'.repeat(bestScores[n] ?? 0)}{'☆'.repeat(3 - (bestScores[n] ?? 0))}
              </span>
              {bestMovesMap[n] !== undefined && (
                <span className="bc-level-meta mono">{bestMovesMap[n]} mov</span>
              )}
              {(defeats[n] ?? 0) > 0 && (
                <span className="bc-level-meta mono defeats">{defeats[n]} derrotas</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'tips') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('menu')}>
            ← Menú
          </button>
          <div className="bc-title-wrap"><h1 className="bc-title">Consejos</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-tips glass-card">
          <p className="bc-tip-text">{PRO_TIPS[tipIndex] ?? PRO_TIPS[0]}</p>
          <div className="bc-tip-actions">
            <button type="button" className="glass-button secondary" onClick={() => setTipIndex((i) => (i + 1) % PRO_TIPS.length)}>
              Siguiente consejo
            </button>
            <button type="button" className="glass-button" onClick={() => setScreen('menu')}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'styles') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('menu')}>
            ← Menú
          </button>
          <div className="bc-title-wrap"><h1 className="bc-title">Estilos de bloque</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-styles-grid">
          {BLOCK_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`bc-style-card glass-card ${blockStyle === s.id ? 'active' : ''}`}
              onClick={() => saveStyle(s.id)}
            >
              <div className="bc-style-preview" style={getBlockStyleProps('cyan')} />
              <span className="bc-style-label">{s.label}</span>
              <span className="bc-style-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'stats') {
    const bestScores = getBestScores()
    const totalWins = readJSON(LS_TOTAL_WINS, 0)
    const totalMoves = readJSON(LS_TOTAL_MOVES, 0)
    const defeats = getDefeats()
    const totalDefeats = Object.values(defeats).reduce((a, b) => a + b, 0)
    const threeStars = Object.values(bestScores).filter((s) => s === 3).length
    const streak = readJSON(LS_STREAK, 0)
    const bestStreak = readJSON(LS_BEST_STREAK, 0)
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('menu')}>
            ← Menú
          </button>
          <div className="bc-title-wrap"><h1 className="bc-title">Estadísticas</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-stats-panel glass-card">
          <div className="bc-stat-row"><span>Niveles desbloqueados</span><span className="mono">{unlocked}</span></div>
          <div className="bc-stat-row"><span>Victorias totales</span><span className="mono">{totalWins}</span></div>
          <div className="bc-stat-row"><span>Derrotas totales</span><span className="mono">{totalDefeats}</span></div>
          <div className="bc-stat-row"><span>Movimientos totales</span><span className="mono">{totalMoves}</span></div>
          <div className="bc-stat-row"><span>Niveles con 3★</span><span className="mono">{threeStars}</span></div>
          <div className="bc-stat-row"><span>Racha actual</span><span className="mono">{streak}</span></div>
          <div className="bc-stat-row"><span>Mejor racha</span><span className="mono">{bestStreak}</span></div>
        </div>
      </div>
    )
  }

  // PLAY / WIN / LOSE
  const safeExits = Array.isArray(level.exits) ? level.exits : []
  const safeObstacles = Array.isArray(level.obstacles) ? level.obstacles : []
  const safeBlocks = Array.isArray(blocks) ? blocks : []

  return (
    <div className="app-shell bc-root">
      <style>{BC_STYLES}</style>

      <header className="bc-header">
        <button type="button" className="glass-button secondary bc-back" onClick={() => { soundClick(); setScreen('menu') }}>
          ← Menú
        </button>
        <div className="bc-title-wrap">
          <h1 className="bc-title">Block Cleaner</h1>
          <span className="bc-level-badge">Nivel {levelId} · {level.tierLabel ?? '—'}</span>
        </div>
        <div className="bc-header-spacer" />
      </header>

      <motion.div
        className="glass-card bc-board-card"
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="bc-board"
          ref={boardRef}
          style={{ aspectRatio: `${level.cols || 5} / ${level.rows || 5}` }}
        >
          <div
            className="bc-grid"
            style={{
              gridTemplateColumns: `repeat(${level.cols || 5}, 1fr)`,
              gridTemplateRows: `repeat(${level.rows || 5}, 1fr)`,
            }}
          >
            {Array.from({ length: Math.max(1, (level.rows || 5) * (level.cols || 5)) }).map((_, i) => (
              <div key={i} className="bc-cell" />
            ))}
          </div>

          {safeObstacles.map((o) => (
            <div
              key={o.id}
              className="bc-obstacle"
              style={{
                width: cellSize,
                height: cellSize,
                transform: `translate(${o.col * cellSize}px, ${o.row * cellSize}px)`,
              }}
              aria-hidden
            />
          ))}

          {options.showExits && safeExits.map(renderExit)}

          {safeBlocks.map((b) => {
            const isDragging = draggingId === b.id
            const isExiting = exitingId === b.id
            const coord =
              isDragging && dragCoord !== null
                ? dragCoord
                : b.orientation === 'horizontal'
                  ? b.col
                  : b.row
            const row = b.orientation === 'horizontal' ? b.row : coord
            const col = b.orientation === 'horizontal' ? coord : b.col
            const w = b.orientation === 'horizontal' ? b.length * cellSize : cellSize
            const h = b.orientation === 'vertical' ? b.length * cellSize : cellSize
            const isHint = hintId === b.id
            const styleProps = getBlockStyleProps(b.color)

            return (
              <motion.div
                key={b.id}
                role="button"
                tabIndex={0}
                aria-label={`Bloque ${b.color}${b.forcedDir ? `, solo ${b.forcedDir}` : ''}`}
                className={[
                  'bc-block',
                  isDragging ? 'bc-block-dragging' : '',
                  isHint ? 'bc-block-hint' : '',
                  isExiting ? 'bc-block-exiting' : '',
                ].join(' ').trim()}
                style={{
                  width: Math.max(10, w - 6),
                  height: Math.max(10, h - 6),
                  ...styleProps,
                }}
                animate={{
                  x: col * cellSize + 3,
                  y: row * cellSize + 3,
                  scale: isExiting ? 0.2 : 1,
                  opacity: isExiting ? 0 : 1,
                }}
                transition={
                  isDragging
                    ? { duration: 0 }
                    : isExiting
                      ? { duration: 0.28, ease: 'easeIn' }
                      : { type: 'spring', stiffness: 420, damping: 32 }
                }
                onPointerDown={(e) => handlePointerDown(e, b)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => handleKeyMove(e, b)}
              >
                {b.forcedDir && (
                  <span className="bc-forced-arrow" aria-hidden>
                    {b.forcedDir === 'up' ? '↑' : b.forcedDir === 'down' ? '↓' : b.forcedDir === 'left' ? '←' : '→'}
                  </span>
                )}
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      <div className="bc-stats">
        {!options.zen && <span className="mono">Mov: {moves}</span>}
        {!options.zen && <span className="mono">Tiempo: {formatTime(seconds)}</span>}
        {options.timed && !options.zen && level.timeLimit > 0 && (
          <span className="mono bc-timer-warn">
            Límite: {formatTime(Math.max(0, level.timeLimit - seconds))}
          </span>
        )}
        {options.showPar && !options.zen && (
          <span className="mono">Par: {level.parMoves}</span>
        )}
        <span className="mono">Quedan: {safeBlocks.length}</span>
        {combo > 1 && <span className="mono bc-combo">Combo ×{combo}</span>}
      </div>

      <div className="bc-actions">
        {!options.hardcore && (
          <button type="button" className="glass-button secondary" onClick={handleRestart}>
            Reiniciar
          </button>
        )}
        {!options.hardcore && undoStack.length > 0 && (
          <button type="button" className="glass-button secondary" onClick={handleUndo}>
            Deshacer
          </button>
        )}
        {!options.noHints && (
          <button type="button" className="glass-button secondary" onClick={handleHint}>
            Pista
          </button>
        )}
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => { soundClick(); setIsPaused((p) => !p) }}
        >
          {isPaused ? 'Reanudar' : 'Pausa'}
        </button>
      </div>

      <AnimatePresence>
        {screen === 'win' && (
          <div className="modal-overlay">
            <motion.div
              className="modal-panel glass-card bc-win-panel"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
            >
              <h2 className="bc-win-title">¡Nivel completado!</h2>
              <p className="mono bc-win-moves">
                Movimientos: {moves}
                {!options.zen && ` · Tiempo: ${formatTime(seconds)}`}
              </p>
              <div className="bc-stars" aria-label={`${stars} de 3 estrellas`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= stars ? 'bc-star bc-star-on' : 'bc-star'}>★</span>
                ))}
              </div>
              <div className="bc-win-actions">
                <button type="button" className="glass-button" onClick={goNextLevel}>Siguiente nivel</button>
                <button type="button" className="glass-button secondary" onClick={handleRestart}>Repetir</button>
                <button type="button" className="glass-button secondary" onClick={() => setScreen('menu')}>Menú</button>
              </div>
            </motion.div>
          </div>
        )}
        {screen === 'lose' && (
          <div className="modal-overlay">
            <motion.div
              className="modal-panel glass-card bc-win-panel"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
            >
              <h2 className="bc-win-title">Tiempo agotado</h2>
              <p className="mono bc-win-moves">Movimientos: {moves}</p>
              <div className="bc-win-actions">
                <button type="button" className="glass-button" onClick={handleRestart}>Reintentar</button>
                <button type="button" className="glass-button secondary" onClick={() => setScreen('menu')}>Menú</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

const BC_STYLES = `
.bc-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.1rem; }
.bc-header-spacer { flex: 1; }
.bc-title-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
.bc-title { font-size: clamp(1.15rem, 4vw, 1.5rem); }
.bc-level-badge {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--gco-primary);
  background: var(--gco-primary-dim);
  padding: 0.15rem 0.65rem;
  border-radius: var(--gco-radius-pill);
}
.bc-back { flex-shrink: 0; }
.bc-menu, .bc-options, .bc-tips, .bc-stats-panel {
  padding: 1.4rem 1.2rem;
  max-width: 420px;
  margin: 0 auto;
}
.bc-menu-desc {
  color: var(--gco-ink-muted);
  font-size: 0.9rem;
  margin-bottom: 1.3rem;
  line-height: 1.45;
  text-align: center;
}
.bc-menu-actions { display: flex; flex-direction: column; gap: 0.65rem; }
.bc-opt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--gco-hairline);
  font-size: 0.92rem;
}
.bc-tip-text { font-size: 1rem; line-height: 1.55; margin-bottom: 1.4rem; color: var(--gco-ink); }
.bc-tip-actions { display: flex; flex-direction: column; gap: 0.6rem; }
.bc-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--gco-hairline);
  font-size: 0.9rem;
}
.bc-stat-row:last-child { border-bottom: none; }
.bc-level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.7rem;
}
.bc-level-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.85rem 0.5rem;
  cursor: pointer;
  border: 1px solid var(--gco-glass-border);
  background: var(--gco-glass-bg);
  color: var(--gco-ink);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.bc-level-btn.active, .bc-level-btn:hover {
  border-color: var(--gco-primary);
  background: var(--gco-primary-dim);
}
.bc-level-num { font-weight: 700; font-size: 1.1rem; }
.bc-level-stars { font-size: 0.75rem; color: var(--gco-primary); letter-spacing: 1px; }
.bc-level-meta { font-size: 0.65rem; color: var(--gco-ink-muted); }
.bc-level-meta.defeats { color: var(--gco-secondary); }
.bc-styles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.8rem;
}
.bc-style-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1rem 0.7rem;
  cursor: pointer;
  border: 1px solid var(--gco-glass-border);
  background: var(--gco-glass-bg);
  color: var(--gco-ink);
  font-size: 0.85rem;
  font-weight: 600;
}
.bc-style-card.active {
  border-color: var(--gco-primary);
  background: var(--gco-primary-dim);
}
.bc-style-preview { width: 56px; height: 28px; border-radius: 8px; }
.bc-style-label { font-weight: 600; }
.bc-style-desc { font-size: 0.7rem; color: var(--gco-ink-muted); font-weight: 400; }
.bc-board-card {
  padding: clamp(0.9rem, 3vw, 1.5rem);
  display: flex;
  justify-content: center;
}
.bc-board {
  position: relative;
  width: 100%;
  max-width: 440px;
  border-radius: var(--gco-radius-sm);
  overflow: visible;
  touch-action: none;
  background: var(--gco-input-bg);
  border: 1px solid var(--gco-glass-border);
}
.bc-grid { position: absolute; inset: 0; display: grid; }
.bc-cell { border: 1px solid var(--gco-hairline); }
.bc-obstacle {
  position: absolute;
  top: 0;
  left: 0;
  background: repeating-linear-gradient(
    45deg,
    var(--gco-fill-quaternary),
    var(--gco-fill-quaternary) 6px,
    transparent 6px,
    transparent 12px
  );
  border: 1px solid var(--gco-glass-border);
  box-sizing: border-box;
  border-radius: 4px;
}
.bc-exit { pointer-events: none; }
.bc-block {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 12px;
  cursor: grab;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: rgba(255,255,255,0.9);
  font-weight: 700;
  user-select: none;
}
.bc-block:focus-visible { box-shadow: 0 0 0 3px var(--gco-primary-dim) !important; }
.bc-block-dragging { cursor: grabbing; filter: brightness(1.08); z-index: 10; }
.bc-block-hint { animation: bc-hint-pulse 0.9s ease-in-out infinite; }
.bc-block-exiting { pointer-events: none; z-index: 20; }
.bc-forced-arrow { pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
@keyframes bc-hint-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.25); box-shadow: 0 0 0 6px var(--gco-primary-dim); }
}
.bc-stats {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
  color: var(--gco-ink-muted);
  font-size: 0.85rem;
}
.bc-timer-warn { color: var(--gco-secondary); font-weight: 600; }
.bc-combo { color: var(--gco-primary); font-weight: 700; }
.bc-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.bc-win-panel { text-align: center; padding: 1.8rem 1.5rem; max-width: 340px; }
.bc-win-title { font-size: 1.3rem; margin-bottom: 0.6rem; }
.bc-win-moves { color: var(--gco-ink-muted); margin-bottom: 0.9rem; }
.bc-stars { font-size: 1.9rem; letter-spacing: 0.3rem; margin-bottom: 1.3rem; }
.bc-star { color: var(--gco-glass-border); }
.bc-star-on { color: var(--gco-primary); text-shadow: 0 0 12px var(--gco-primary-dim); }
.bc-win-actions { display: flex; flex-direction: column; gap: 0.6rem; }
@media (max-width: 420px) {
  .bc-header { flex-wrap: wrap; }
  .bc-title-wrap { order: 3; width: 100%; }
}
`

export default BlockCleaner