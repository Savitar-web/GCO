/**
 * =============================================================================
 * BlockCleaner.tsx — UI + interacción · Color Block Jam style (v11.2)
 * =============================================================================
 *
 * Dependencias del motor (Generatelevelbc.ts v11.1+):
 * - generateLevel / FALLBACK_LEVEL
 * - computeFreeSlideRanges / computeContinuousDragPosition / snapToGrid
 * - getHintMove / getExitableBlocks / isBlockMovable
 * - blockWidth / blockHeight / normalizeBlock
 * - starsForMoves / starsForTime / exitPixelVector
 *
 * MOVIMIENTO:
 * - Visual continuo (fraccionario) durante el arrastre.
 * - El motor fuerza ortogonal (sin diagonal) vía computeContinuousDragPosition.
 * - Snap a grilla solo al soltar.
 * - Rangos físicos: no atraviesa ni solapa.
 *
 * EXPORT named: export function BlockCleaner
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { soundClick } from '@/core/audio/uiSounds'
import {
  generateLevel,
  FALLBACK_LEVEL,
  computeFreeSlideRanges,
  computeContinuousDragPosition,
  snapToGrid,
  getHintMove,
  getExitableBlocks,
  isBlockMovable,
  blockWidth,
  blockHeight,
  starsForMoves,
  starsForTime,
  exitPixelVector,
  normalizeBlock,
  type Block,
  type BlockColor,
  type BlockCleanerLevel,
} from './Generatelevelbc'

const LS = {
  current: 'bc.v11.current',
  unlocked: 'bc.v11.unlocked',
  scores: 'bc.v11.scores',
  moves: 'bc.v11.moves',
  times: 'bc.v11.times',
  defeats: 'bc.v11.defeats',
  style: 'bc.v11.style',
  options: 'bc.v11.options',
  wins: 'bc.v11.wins',
  totalMoves: 'bc.v11.totalMoves',
  streak: 'bc.v11.streak',
  bestStreak: 'bc.v11.bestStreak',
  bestCombo: 'bc.v11.bestCombo',
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function playSfx(kind: 'move' | 'exit' | 'win' | 'lose' | 'lock' | 'ui' | 'hint' | 'combo') {
  try {
    soundClick()
    if (kind === 'exit' || kind === 'hint') window.setTimeout(() => soundClick(), 70)
    if (kind === 'combo') {
      window.setTimeout(() => soundClick(), 55)
      window.setTimeout(() => soundClick(), 110)
    }
    if (kind === 'win') {
      window.setTimeout(() => soundClick(), 90)
      window.setTimeout(() => soundClick(), 180)
    }
  } catch {
    /* noop */
  }
}

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
  { id: 'liquid-glass', label: 'Liquid Glass', desc: 'Reflejo iOS, bordes luminosos' },
  { id: 'metallic', label: 'Metálico', desc: 'Acero cepillado biselado' },
  { id: 'matte', label: 'Mate', desc: 'Opaco plano, sin brillo' },
  { id: 'neon', label: 'Neón', desc: 'Halo eléctrico intenso' },
  { id: 'pastel', label: 'Pastel', desc: 'Crema suave, sin saturar' },
  { id: 'crystal', label: 'Cristal', desc: 'Facetas translúcidas' },
  { id: 'candy', label: 'Candy', desc: 'Caramelo 3D con highlight' },
  { id: 'obsidian', label: 'Obsidiana', desc: 'Negro volcánico con veta' },
]

const COLOR_HEX: Record<BlockColor, { base: string; light: string; dark: string; glow: string }> = {
  cyan: { base: '#22E6C5', light: '#9FF8EA', dark: '#0FA88F', glow: 'rgba(34,230,197,0.55)' },
  blue: { base: '#3AA0FF', light: '#A8D4FF', dark: '#1A6FCB', glow: 'rgba(58,160,255,0.55)' },
  violet: { base: '#8B7CF6', light: '#D0C8FF', dark: '#5B4DC4', glow: 'rgba(139,124,246,0.55)' },
  orange: { base: '#FF6B4A', light: '#FFB59E', dark: '#C94228', glow: 'rgba(255,107,74,0.55)' },
  pink: { base: '#FF6FA8', light: '#FFC0D9', dark: '#C93A72', glow: 'rgba(255,111,168,0.55)' },
  yellow: { base: '#FFC94D', light: '#FFE6A8', dark: '#C99420', glow: 'rgba(255,201,77,0.55)' },
  green: { base: '#4ADE80', light: '#B6F5CD', dark: '#22A055', glow: 'rgba(74,222,128,0.55)' },
  red: { base: '#FF4D6A', light: '#FFA8B6', dark: '#C9223E', glow: 'rgba(255,77,106,0.55)' },
  lime: { base: '#A3E635', light: '#D9F99D', dark: '#65A30D', glow: 'rgba(163,230,53,0.55)' },
  teal: { base: '#2DD4BF', light: '#99F6E4', dark: '#0F766E', glow: 'rgba(45,212,191,0.55)' },
  magenta: { base: '#E94FD8', light: '#F7B6EF', dark: '#A21CAF', glow: 'rgba(233,79,216,0.55)' },
  amber: { base: '#FFB020', light: '#FFDA9E', dark: '#C77800', glow: 'rgba(255,176,32,0.55)' },
  indigo: { base: '#5B6EF5', light: '#B7C0FF', dark: '#3742B0', glow: 'rgba(91,110,245,0.55)' },
  rose: { base: '#FB6F92', light: '#FFC2D1', dark: '#C23A5C', glow: 'rgba(251,111,146,0.55)' },
  sky: { base: '#38BDF8', light: '#BAE6FD', dark: '#0284C7', glow: 'rgba(56,189,248,0.55)' },
  coral: { base: '#FF7F6B', light: '#FFC4B8', dark: '#D14B34', glow: 'rgba(255,127,107,0.55)' },
}

interface PlayOptions {
  hardcore: boolean
  noHints: boolean
  showExits: boolean
  showPar: boolean
  showGhost: boolean
}

const DEFAULT_OPTIONS: PlayOptions = {
  hardcore: false,
  noHints: false,
  showExits: true,
  showPar: true,
  showGhost: true,
}

const PRO_TIPS = [
  'Solo salen por la pared de su color. Otra pared no elimina la pieza.',
  'La puerta mide la huella del bloque más grande de ese color en ese lado.',
  'Movimiento en línea recta: el motor evita diagonales.',
  'Las piezas no pueden atravesarse ni solaparse.',
  'Pieza con flecha: solo se mueve en esa dirección. Planifica el orden.',
  'Candados 🔒: hay que sacar N piezas antes de poder moverlas.',
  'Las piezas grandes necesitan espacio libre antes de deslizarse.',
  'Primero mueve las pequeñas para abrir corredor a las grandes.',
  'El ghost azul muestra el rango deslizable de la pieza.',
  'Hardcore: sin undo y con límite de tiempo estricto.',
  'Usa zoom (− / +) en tableros grandes.',
  'Cada nivel se genera con scramble legal: siempre hay solución.',
]

const BASE_CELL = 52
const GAP = 4

type Screen = 'hub' | 'play' | 'levels' | 'options' | 'styles' | 'stats' | 'win' | 'lose'

interface DragState {
  pointerId: number
  id: string
  originClientX: number
  originClientY: number
  originRow: number
  originCol: number
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number }
  visualRow: number
  visualCol: number
}

function safeGenerate(id: number): BlockCleanerLevel {
  try {
    const g = generateLevel(id)
    if (g && Array.isArray(g.blocks) && g.blocks.length > 0 && Array.isArray(g.exits)) {
      return { ...g, blocks: g.blocks.map(normalizeBlock) }
    }
  } catch {
    /* fallthrough */
  }
  return {
    ...FALLBACK_LEVEL,
    id,
    difficulty: id,
    blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
  }
}

export function BlockCleaner() {
  const navigate = useNavigate()

  const [screen, setScreen] = useState<Screen>('hub')
  const [levelId, setLevelId] = useState(() => readJSON(LS.current, 1))
  const [unlocked, setUnlocked] = useState(() => readJSON(LS.unlocked, 1))
  const [level, setLevel] = useState<BlockCleanerLevel>(() => safeGenerate(readJSON(LS.current, 1)))
  const [blocks, setBlocks] = useState<Block[]>(() =>
    (safeGenerate(readJSON(LS.current, 1)).blocks ?? []).map(normalizeBlock)
  )
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [timerOn, setTimerOn] = useState(true)
  const [cleared, setCleared] = useState(0)
  const [undoStack, setUndoStack] = useState<Block[][]>([])
  const [combo, setCombo] = useState(0)
  const [hintId, setHintId] = useState<string | null>(null)
  const [exitingIds, setExitingIds] = useState<string[]>([])
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() => readJSON(LS.style, 'liquid-glass'))
  const [options, setOptions] = useState<PlayOptions>(() => readJSON(LS.options, DEFAULT_OPTIONS))
  const [tipIndex, setTipIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan] = useState({ x: 0, y: 0 })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragVisual, setDragVisual] = useState<{ row: number; col: number } | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const winHandled = useRef(false)

  const loadLevel = useCallback((id: number) => {
    const lv = safeGenerate(id)
    setLevel(lv)
    setBlocks((lv.blocks ?? []).map(normalizeBlock))
    setMoves(0)
    setSeconds(0)
    setCleared(0)
    setUndoStack([])
    setCombo(0)
    setHintId(null)
    setExitingIds([])
    setDraggingId(null)
    setDragVisual(null)
    dragRef.current = null
    winHandled.current = false
    setLevelId(id)
    writeJSON(LS.current, id)
    setScreen('play')
  }, [])

  useEffect(() => {
    if (screen !== 'play' || !timerOn) return
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [screen, timerOn, levelId])

  useEffect(() => {
    if (screen !== 'play' || winHandled.current) return
    if (!Array.isArray(blocks) || blocks.length > 0) return
    winHandled.current = true
    playSfx('win')
    const moveStars = starsForMoves(moves, level.parMoves)
    const timeStars = starsForTime(seconds, level.timeLimit)
    const stars = Math.min(moveStars, timeStars) as 1 | 2 | 3
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    scores[levelId] = Math.max(scores[levelId] ?? 0, stars)
    writeJSON(LS.scores, scores)
    const moveMap = readJSON<Record<number, number>>(LS.moves, {})
    if (moveMap[levelId] == null || moves < moveMap[levelId]) {
      moveMap[levelId] = moves
      writeJSON(LS.moves, moveMap)
    }
    const timeMap = readJSON<Record<number, number>>(LS.times, {})
    if (timeMap[levelId] == null || seconds < timeMap[levelId]) {
      timeMap[levelId] = seconds
      writeJSON(LS.times, timeMap)
    }
    writeJSON(LS.wins, readJSON(LS.wins, 0) + 1)
    writeJSON(LS.totalMoves, readJSON(LS.totalMoves, 0) + moves)
    const streak = readJSON(LS.streak, 0) + 1
    writeJSON(LS.streak, streak)
    writeJSON(LS.bestStreak, Math.max(readJSON(LS.bestStreak, 0), streak))
    writeJSON(LS.bestCombo, Math.max(readJSON(LS.bestCombo, 0), combo))
    if (levelId >= unlocked) {
      const next = levelId + 1
      setUnlocked(next)
      writeJSON(LS.unlocked, next)
    }
    setScreen('win')
  }, [blocks, screen, moves, seconds, level, levelId, unlocked, combo])

  useEffect(() => {
    if (screen !== 'play' || !timerOn || options.hardcore === false) return
    if (seconds >= level.timeLimit && blocks.length > 0) {
      playSfx('lose')
      writeJSON(LS.defeats, readJSON(LS.defeats, 0) + 1)
      writeJSON(LS.streak, 0)
      setScreen('lose')
    }
  }, [seconds, screen, timerOn, options.hardcore, level.timeLimit, blocks.length])

  const safeBlocks = useMemo(
    () => (Array.isArray(blocks) ? blocks.map(normalizeBlock) : []),
    [blocks]
  )

  const exitable = useMemo(
    () =>
      getExitableBlocks(
        safeBlocks,
        level.exits ?? [],
        level.obstacles ?? [],
        level.rows,
        level.cols,
        cleared
      ),
    [safeBlocks, level, cleared]
  )

  const applyMove = useCallback(
    (blockId: string, toRow: number, toCol: number) => {
      setBlocks((list) => {
        const block = list.find((b) => b.id === blockId)
        if (!block) return list
        if (!isBlockMovable(block, cleared)) {
          playSfx('lock')
          return list
        }
        const next = list.map((b) =>
          b.id === blockId ? normalizeBlock({ ...b, row: toRow, col: toCol }) : b
        )
        const after = next.filter((b) => {
          if (b.id !== blockId) return true
          for (const e of level.exits ?? []) {
            if (b.color === e.color && isBlockMovable(b, cleared)) {
              const w = blockWidth(b)
              const h = blockHeight(b)
              const minR = b.row
              const maxR = b.row + h - 1
              const minC = b.col
              const maxC = b.col + w - 1
              let aligned = false
              if (e.side === 'left') {
                aligned = minC === 0 && minR >= e.pos && maxR <= e.pos + e.length - 1
              } else if (e.side === 'right') {
                aligned =
                  maxC === level.cols - 1 && minR >= e.pos && maxR <= e.pos + e.length - 1
              } else if (e.side === 'top') {
                aligned = minR === 0 && minC >= e.pos && maxC <= e.pos + e.length - 1
              } else {
                aligned =
                  maxR === level.rows - 1 && minC >= e.pos && maxC <= e.pos + e.length - 1
              }
              const footprint = e.side === 'left' || e.side === 'right' ? h : w
              if (aligned && footprint <= e.length) return false
            }
          }
          return true
        })
        if (after.length !== next.length) {
          setExitingIds((ids) => [...ids, blockId])
          playSfx('exit')
          setCombo((c) => c + 1)
          setCleared((c) => c + 1)
          setUndoStack((u) => [...u, list])
          setMoves((m) => m + 1)
          window.setTimeout(() => {
            setExitingIds((ids) => ids.filter((id) => id !== blockId))
          }, 320)
          return after
        }
        if (toRow !== block.row || toCol !== block.col) {
          playSfx('move')
          setCombo(0)
          setUndoStack((u) => [...u, list])
          setMoves((m) => m + 1)
        }
        return next
      })
    },
    [cleared, level]
  )

  // Drag continuo: visual libre, motor clampa ortogonal + colisiones
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, block: Block) => {
    if (screen !== 'play') return
    if (!isBlockMovable(block, cleared)) {
      playSfx('lock')
      return
    }
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)

    const ranges = computeFreeSlideRanges(
      block,
      safeBlocks,
      level.obstacles ?? [],
      level.rows,
      level.cols,
      cleared
    )

    dragRef.current = {
      pointerId: e.pointerId,
      id: block.id,
      originClientX: e.clientX,
      originClientY: e.clientY,
      originRow: block.row,
      originCol: block.col,
      ranges,
      visualRow: block.row,
      visualCol: block.col,
    }
    setDraggingId(block.id)
    setDragVisual({ row: block.row, col: block.col })
    setHintId(null)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    const dxPx = (e.clientX - drag.originClientX) / zoom
    const dyPx = (e.clientY - drag.originClientY) / zoom
    const deltaCol = dxPx / BASE_CELL
    const deltaRow = dyPx / BASE_CELL

    // Motor: un eje dominante (sin diagonal), clamp a rangos físicos
    const visual = computeContinuousDragPosition(
      drag.originRow,
      drag.originCol,
      deltaRow,
      deltaCol,
      drag.ranges
    )

    drag.visualRow = visual.row
    drag.visualCol = visual.col
    setDragVisual({ row: visual.row, col: visual.col })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* noop */
    }
    const visual = { row: drag.visualRow, col: drag.visualCol }
    dragRef.current = null
    setDraggingId(null)
    setDragVisual(null)
    const snapped = snapToGrid(visual.row, visual.col, drag.ranges)
    if (snapped.row !== drag.originRow || snapped.col !== drag.originCol) {
      applyMove(drag.id, snapped.row, snapped.col)
    }
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    setDraggingId(null)
    setDragVisual(null)
  }

  const undo = () => {
    if (options.hardcore || undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack((u) => u.slice(0, -1))
    setBlocks(last.map(normalizeBlock))
    setMoves((m) => Math.max(0, m - 1))
    setCombo(0)
    playSfx('ui')
  }

  const hint = () => {
    if (options.noHints || options.hardcore) return
    const move = getHintMove(
      safeBlocks,
      level.exits ?? [],
      level.obstacles ?? [],
      level.rows,
      level.cols,
      cleared
    )
    if (!move) return
    playSfx('hint')
    setHintId(move.blockId)
    applyMove(move.blockId, move.toRow, move.toCol)
    window.setTimeout(() => setHintId(null), 600)
  }

  const reset = () => {
    loadLevel(levelId)
    playSfx('ui')
  }

  const ghost = useMemo(() => {
    if (!draggingId || !options.showGhost) return null
    const drag = dragRef.current
    const block = safeBlocks.find((b) => b.id === draggingId)
    if (!block || !drag) return null
    return {
      minRow: drag.ranges.minRow,
      maxRow: drag.ranges.maxRow,
      minCol: drag.ranges.minCol,
      maxCol: drag.ranges.maxCol,
      w: blockWidth(block),
      h: blockHeight(block),
    }
  }, [draggingId, options.showGhost, safeBlocks, dragVisual])

  const boardW = level.cols * BASE_CELL + (level.cols + 1) * GAP
  const boardH = level.rows * BASE_CELL + (level.rows + 1) * GAP

  const blockStyleCss = (color: BlockColor, style: BlockStyle): React.CSSProperties => {
    const c = COLOR_HEX[color]
    const base: React.CSSProperties = {
      background: c.base,
      boxShadow: `0 4px 16px ${c.glow}, inset 0 1px 0 ${c.light}88`,
      border: `1px solid ${c.light}55`,
    }
    switch (style) {
      case 'metallic':
        return {
          ...base,
          background: `linear-gradient(135deg, ${c.light}, ${c.base} 40%, ${c.dark})`,
          boxShadow: `0 2px 8px ${c.glow}, inset 0 1px 0 #fff6`,
        }
      case 'matte':
        return { background: c.base, boxShadow: 'none', border: `1px solid ${c.dark}` }
      case 'neon':
        return {
          background: c.base,
          boxShadow: `0 0 12px ${c.glow}, 0 0 28px ${c.glow}`,
          border: `1px solid ${c.light}`,
        }
      case 'pastel':
        return {
          background: c.light,
          color: c.dark,
          boxShadow: `0 2px 8px ${c.glow}44`,
          border: `1px solid ${c.base}66`,
        }
      case 'crystal':
        return {
          background: `linear-gradient(160deg, ${c.light}cc, ${c.base}99 50%, ${c.dark}aa)`,
          backdropFilter: 'blur(4px)',
          boxShadow: `0 4px 20px ${c.glow}`,
          border: `1px solid ${c.light}88`,
        }
      case 'candy':
        return {
          background: `radial-gradient(circle at 30% 25%, ${c.light}, ${c.base} 55%, ${c.dark})`,
          boxShadow: `0 6px 14px ${c.glow}, inset 0 -3px 6px ${c.dark}66`,
          border: 'none',
        }
      case 'obsidian':
        return {
          background: `linear-gradient(145deg, #1a1a1a, ${c.dark} 60%, #0a0a0a)`,
          boxShadow: `0 2px 10px ${c.glow}88, inset 0 1px 0 ${c.base}44`,
          border: `1px solid ${c.base}33`,
        }
      default:
        return {
          ...base,
          background: `linear-gradient(145deg, ${c.light}55, ${c.base} 45%, ${c.dark}cc)`,
          backdropFilter: 'blur(8px)',
        }
    }
  }

  // ---- Screens ----
  if (screen === 'hub') {
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <button className="bc-back" onClick={() => navigate('/categoria/logica')} aria-label="Volver">←</button>
          <h1 className="bc-title">Block Cleaner</h1>
          <p className="bc-sub">Color Block Jam · v11.2</p>
          <div className="bc-hub-actions">
            <button className="bc-btn primary" onClick={() => loadLevel(levelId)}>Continuar · Niv. {levelId}</button>
            <button className="bc-btn" onClick={() => setScreen('levels')}>Niveles</button>
            <button className="bc-btn" onClick={() => setScreen('options')}>Opciones</button>
            <button className="bc-btn" onClick={() => setScreen('styles')}>Estilos</button>
            <button className="bc-btn" onClick={() => setScreen('stats')}>Estadísticas</button>
          </div>
          <p className="bc-tip-text">{PRO_TIPS[tipIndex % PRO_TIPS.length]}</p>
          <button className="bc-link" onClick={() => setTipIndex((i) => (i + 1) % PRO_TIPS.length)}>Siguiente tip</button>
        </div>
      </div>
    )
  }

  if (screen === 'levels') {
    const maxShow = Math.max(unlocked + 5, 30)
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
          <h2 className="bc-title">Niveles</h2>
          <div className="bc-level-grid">
            {Array.from({ length: maxShow }, (_, i) => i + 1).map((n) => {
              const locked = n > unlocked
              const stars = scores[n] ?? 0
              return (
                <button key={n} className={`bc-level-cell ${locked ? 'locked' : ''} ${n === levelId ? 'current' : ''}`}
                  disabled={locked} onClick={() => !locked && loadLevel(n)}>
                  <span className="bc-level-num">{n}</span>
                  <span className="bc-level-stars">{stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '·'}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'options') {
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
          <h2 className="bc-title">Opciones</h2>
          {([
            ['hardcore', 'Hardcore (sin undo, límite de tiempo)'],
            ['noHints', 'Sin pistas'],
            ['showExits', 'Mostrar puertas'],
            ['showPar', 'Mostrar par de movimientos'],
            ['showGhost', 'Ghost de rango al arrastrar'],
          ] as const).map(([key, label]) => (
            <label key={key} className="bc-opt">
              <input type="checkbox" checked={options[key]}
                onChange={(e) => {
                  const next = { ...options, [key]: e.target.checked }
                  setOptions(next)
                  writeJSON(LS.options, next)
                }}
              />
              {label}
            </label>
          ))}
          <label className="bc-opt">
            <input type="checkbox" checked={timerOn} onChange={(e) => setTimerOn(e.target.checked)} />
            Contrarreloj activo
          </label>
        </div>
      </div>
    )
  }

  if (screen === 'styles') {
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
          <h2 className="bc-title">Estilos de bloque</h2>
          <div className="bc-style-grid">
            {BLOCK_STYLES.map((s) => (
              <button key={s.id} className={`bc-style-card ${blockStyle === s.id ? 'active' : ''}`}
                onClick={() => { setBlockStyle(s.id); writeJSON(LS.style, s.id); playSfx('ui') }}>
                <div className="bc-style-swatch" style={blockStyleCss('cyan', s.id)} />
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'stats') {
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
          <h2 className="bc-title">Estadísticas</h2>
          <ul className="bc-stats">
            <li>Victorias: {readJSON(LS.wins, 0)}</li>
            <li>Derrotas: {readJSON(LS.defeats, 0)}</li>
            <li>Movimientos totales: {readJSON(LS.totalMoves, 0)}</li>
            <li>Racha: {readJSON(LS.streak, 0)}</li>
            <li>Mejor racha: {readJSON(LS.bestStreak, 0)}</li>
            <li>Mejor combo: {readJSON(LS.bestCombo, 0)}</li>
            <li>Desbloqueado hasta: {unlocked}</li>
          </ul>
        </div>
      </div>
    )
  }

  if (screen === 'win') {
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    const stars = scores[levelId] ?? 1
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <h2 className="bc-title">¡Nivel superado!</h2>
          <p className="bc-stars-big">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</p>
          <p>Movimientos: {moves} · Par: {level.parMoves} · Tiempo: {seconds}s</p>
          <div className="bc-hub-actions">
            <button className="bc-btn primary" onClick={() => loadLevel(levelId + 1)}>Siguiente</button>
            <button className="bc-btn" onClick={() => loadLevel(levelId)}>Repetir</button>
            <button className="bc-btn" onClick={() => setScreen('hub')}>Menú</button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'lose') {
    return (
      <div className="bc-root">
        <style>{CSS}</style>
        <div className="bc-hub">
          <h2 className="bc-title">Tiempo agotado</h2>
          <div className="bc-hub-actions">
            <button className="bc-btn primary" onClick={() => loadLevel(levelId)}>Reintentar</button>
            <button className="bc-btn" onClick={() => setScreen('hub')}>Menú</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- PLAY ----
  return (
    <div className="bc-root">
      <style>{CSS}</style>
      <div className="bc-play-bar">
        <button className="bc-icon-btn" onClick={() => setScreen('hub')} aria-label="Menú">←</button>
        <div className="bc-play-meta">
          <span>Niv. {levelId}</span>
          <span className="bc-tier">{level.tierLabel}</span>
          {options.showPar && <span>Par {level.parMoves}</span>}
          <span>{moves} mov</span>
          {timerOn && (
            <span className={seconds > level.timeLimit * 0.8 ? 'bc-time-warn' : ''}>
              {seconds}s{options.hardcore ? ` / ${level.timeLimit}s` : ''}
            </span>
          )}
          {combo > 1 && <span className="bc-combo">×{combo}</span>}
        </div>
        <div className="bc-play-actions">
          <button className="bc-icon-btn" onClick={undo} disabled={options.hardcore || undoStack.length === 0}>↩</button>
          <button className="bc-icon-btn" onClick={hint} disabled={options.noHints || options.hardcore}>💡</button>
          <button className="bc-icon-btn" onClick={reset}>⟳</button>
          <button className="bc-icon-btn" onClick={() => setZoom((z) => clampNum(z - 0.1, 0.5, 1.6))}>−</button>
          <button className="bc-icon-btn" onClick={() => setZoom((z) => clampNum(z + 0.1, 0.5, 1.6))}>+</button>
          <label className="bc-timer-toggle" title="Contrarreloj">
            <input type="checkbox" checked={timerOn} onChange={(e) => setTimerOn(e.target.checked)} />
            ⏱
          </label>
        </div>
      </div>

      <div className="bc-board-wrap"
        onPointerMove={(e) => { if (dragRef.current) handlePointerMove(e) }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div ref={boardRef} className="bc-board"
          style={{
            width: boardW,
            height: boardH,
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: 'center center',
          }}
        >
          {Array.from({ length: level.rows * level.cols }).map((_, i) => {
            const r = Math.floor(i / level.cols)
            const c = i % level.cols
            return (
              <div key={`g${i}`} className="bc-cell"
                style={{ left: GAP + c * (BASE_CELL + GAP), top: GAP + r * (BASE_CELL + GAP), width: BASE_CELL, height: BASE_CELL }}
              />
            )
          })}

          {(level.obstacles ?? []).map((o) => (
            <div key={o.id} className="bc-obstacle"
              style={{ left: GAP + o.col * (BASE_CELL + GAP), top: GAP + o.row * (BASE_CELL + GAP), width: BASE_CELL, height: BASE_CELL }}
            />
          ))}

          {options.showExits &&
            (level.exits ?? []).map((ex) => {
              const c = COLOR_HEX[ex.color]
              const style: React.CSSProperties = {
                background: c.glow, border: `2px solid ${c.base}`, position: 'absolute',
                borderRadius: 6, pointerEvents: 'none', opacity: 0.85,
              }
              if (ex.side === 'left') {
                Object.assign(style, { left: 0, top: GAP + ex.pos * (BASE_CELL + GAP), width: 6, height: ex.length * BASE_CELL + (ex.length - 1) * GAP })
              } else if (ex.side === 'right') {
                Object.assign(style, { right: 0, left: 'auto', top: GAP + ex.pos * (BASE_CELL + GAP), width: 6, height: ex.length * BASE_CELL + (ex.length - 1) * GAP })
              } else if (ex.side === 'top') {
                Object.assign(style, { top: 0, left: GAP + ex.pos * (BASE_CELL + GAP), height: 6, width: ex.length * BASE_CELL + (ex.length - 1) * GAP })
              } else {
                Object.assign(style, { bottom: 0, top: 'auto', left: GAP + ex.pos * (BASE_CELL + GAP), height: 6, width: ex.length * BASE_CELL + (ex.length - 1) * GAP })
              }
              return <div key={ex.id} className="bc-exit" style={style} />
            })}

          {ghost && (
            <div className="bc-ghost" style={{
              left: GAP + ghost.minCol * (BASE_CELL + GAP),
              top: GAP + ghost.minRow * (BASE_CELL + GAP),
              width: (ghost.maxCol - ghost.minCol + ghost.w) * BASE_CELL + (ghost.maxCol - ghost.minCol + ghost.w - 1) * GAP,
              height: (ghost.maxRow - ghost.minRow + ghost.h) * BASE_CELL + (ghost.maxRow - ghost.minRow + ghost.h - 1) * GAP,
            }} />
          )}

          <AnimatePresence>
            {safeBlocks.map((b) => {
              const w = blockWidth(b)
              const h = blockHeight(b)
              const isDrag = draggingId === b.id
              const isExit = exitingIds.includes(b.id)
              const isHint = hintId === b.id
              const canGo = exitable.includes(b.id)
              let top = GAP + b.row * (BASE_CELL + GAP)
              let left = GAP + b.col * (BASE_CELL + GAP)
              if (isDrag && dragVisual) {
                top = GAP + dragVisual.row * (BASE_CELL + GAP)
                left = GAP + dragVisual.col * (BASE_CELL + GAP)
              }
              const width = w * BASE_CELL + (w - 1) * GAP
              const height = h * BASE_CELL + (h - 1) * GAP
              let exitAnim = {}
              if (isExit) {
                const exit = (level.exits ?? []).find((e) => e.color === b.color)
                if (exit) {
                  const v = exitPixelVector(exit.side, BASE_CELL)
                  exitAnim = { x: v.dx, y: v.dy, opacity: 0, scale: 0.85 }
                }
              }
              return (
                <motion.div
                  key={b.id}
                  className={`bc-block ${isDrag ? 'dragging' : ''} ${canGo ? 'exitable' : ''} ${isHint ? 'hint' : ''}`}
                  style={{
                    ...blockStyleCss(b.color, blockStyle),
                    width, height, left, top,
                    zIndex: isDrag ? 20 : 5,
                    transition: isDrag ? 'none' : undefined,
                    touchAction: 'none',
                    cursor: isBlockMovable(b, cleared) ? 'grab' : 'not-allowed',
                    opacity: b.lockedUntilClears && cleared < b.lockedUntilClears ? 0.55 : 1,
                  }}
                  animate={isExit ? exitAnim : { x: 0, y: 0, opacity: 1, scale: 1 }}
                  transition={
                    isDrag ? { duration: 0 }
                      : isExit ? { duration: 0.32, ease: 'easeIn' }
                      : { type: 'spring', stiffness: 520, damping: 36 }
                  }
                  onPointerDown={(e) => handlePointerDown(e, b)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  {b.lockedUntilClears != null && cleared < b.lockedUntilClears && (
                    <span className="bc-lock">🔒{b.lockedUntilClears - cleared}</span>
                  )}
                  {b.forcedDir && (
                    <span className="bc-dir">
                      {b.forcedDir === 'left' ? '←' : b.forcedDir === 'right' ? '→' : b.forcedDir === 'up' ? '↑' : '↓'}
                    </span>
                  )}
                  {w >= 2 && h >= 2 && <span className="bc-size">{w}×{h}</span>}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.bc-root {
  min-height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-primary, #f2f4f8);
  background: transparent;
  font-family: Inter, system-ui, sans-serif;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.bc-hub {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}
.bc-title {
  font-family: "Space Grotesk", Inter, sans-serif;
  font-weight: 700;
  font-size: clamp(1.6rem, 5vw, 2.2rem);
  margin: 0;
  letter-spacing: -0.02em;
}
.bc-sub { opacity: 0.65; margin: 0 0 8px; font-size: 0.9rem; }
.bc-back, .bc-icon-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 18%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 8%, transparent);
  color: inherit;
  border-radius: 12px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
  cursor: pointer;
  backdrop-filter: blur(12px);
}
.bc-back { align-self: flex-start; }
.bc-hub-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 320px;
}
.bc-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 16%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 7%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(14px);
  transition: transform 0.15s ease, background 0.15s ease;
}
.bc-btn:active { transform: scale(0.98); }
.bc-btn.primary {
  background: linear-gradient(135deg, #3AA0FF88, #8B7CF688);
  border-color: #3AA0FF55;
}
.bc-link {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.7;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.85rem;
}
.bc-tip-text {
  text-align: center;
  opacity: 0.75;
  font-size: 0.88rem;
  line-height: 1.4;
  max-width: 360px;
  margin-top: 8px;
}
.bc-level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 420px;
  max-height: 60dvh;
  overflow: auto;
  padding: 4px;
}
.bc-level-cell {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  color: inherit;
  border-radius: 12px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.bc-level-cell.locked { opacity: 0.35; cursor: not-allowed; }
.bc-level-cell.current { outline: 2px solid #3AA0FF; }
.bc-level-num { font-weight: 700; font-size: 1rem; }
.bc-level-stars { font-size: 0.7rem; opacity: 0.8; letter-spacing: -1px; }
.bc-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 360px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text-primary, #fff) 5%, transparent);
  font-size: 0.95rem;
}
.bc-style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  max-width: 400px;
}
.bc-style-card {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  cursor: pointer;
  text-align: left;
}
.bc-style-card.active { outline: 2px solid #3AA0FF; }
.bc-style-swatch {
  width: 100%;
  height: 36px;
  border-radius: 10px;
}
.bc-style-card span { font-size: 0.75rem; opacity: 0.7; }
.bc-stats {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bc-stats li {
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
}
.bc-stars-big { font-size: 2rem; letter-spacing: 4px; margin: 8px 0; }
.bc-play-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  padding-top: max(10px, env(safe-area-inset-top));
  flex-wrap: wrap;
}
.bc-play-meta {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  opacity: 0.9;
  min-width: 0;
}
.bc-tier { opacity: 0.65; font-weight: 500; }
.bc-time-warn { color: #FF6B4A; }
.bc-combo { color: #FFC94D; font-weight: 800; }
.bc-play-actions { display: flex; gap: 6px; align-items: center; }
.bc-timer-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.9rem;
  cursor: pointer;
}
.bc-timer-toggle input { width: 14px; height: 14px; }
.bc-board-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 12px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  touch-action: none;
}
.bc-board {
  position: relative;
  background: color-mix(in srgb, var(--text-primary, #fff) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 12%, transparent);
  border-radius: 18px;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  flex-shrink: 0;
}
.bc-cell {
  position: absolute;
  border-radius: 10px;
  background: color-mix(in srgb, var(--text-primary, #fff) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  pointer-events: none;
}
.bc-obstacle {
  position: absolute;
  border-radius: 10px;
  background:
    repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--text-primary, #fff) 18%, transparent),
      color-mix(in srgb, var(--text-primary, #fff) 18%, transparent) 4px,
      color-mix(in srgb, var(--text-primary, #fff) 8%, transparent) 4px,
      color-mix(in srgb, var(--text-primary, #fff) 8%, transparent) 8px
    );
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 20%, transparent);
  pointer-events: none;
  z-index: 2;
}
.bc-ghost {
  position: absolute;
  border-radius: 12px;
  background: color-mix(in srgb, #3AA0FF 12%, transparent);
  border: 1px dashed color-mix(in srgb, #3AA0FF 45%, transparent);
  pointer-events: none;
  z-index: 3;
}
.bc-block {
  position: absolute;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  color: #0a0a12;
  will-change: left, top, transform;
  touch-action: none;
}
.bc-block.dragging {
  cursor: grabbing !important;
  filter: brightness(1.08);
  box-shadow: 0 8px 28px rgba(0,0,0,0.35) !important;
}
.bc-block.exitable {
  outline: 2px solid rgba(255,255,255,0.55);
  outline-offset: 1px;
}
.bc-block.hint { animation: bc-pulse 0.6s ease; }
@keyframes bc-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
}
.bc-lock, .bc-dir, .bc-size {
  position: absolute;
  font-size: 0.7rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  pointer-events: none;
}
.bc-lock { top: 4px; right: 4px; }
.bc-dir { bottom: 4px; left: 6px; font-size: 0.9rem; }
.bc-size { bottom: 4px; right: 6px; opacity: 0.7; }
@media (max-width: 480px) {
  .bc-play-meta { font-size: 0.75rem; gap: 6px 8px; }
  .bc-icon-btn { width: 36px; height: 36px; }
}
`