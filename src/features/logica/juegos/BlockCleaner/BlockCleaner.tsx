import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { soundClick } from '@/core/audio/uiSounds'
import {
  generateLevel,
  FALLBACK_LEVEL,
  computeSlideRangeOnAxis,
  preferredAxisFromDelta,
  computeDragTarget,
  getHintMove,
  getExitableBlocks,
  isBlockMovable,
  blockWidth,
  blockHeight,
  starsForMoves,
  starsForTime,
  exitPixelVector,
  type Block,
  type BlockColor,
  type BlockCleanerLevel,
} from './Generatelevelbc'

// =============================================================================
// BlockCleaner.tsx — UI + interacción fluida (v9)
//
// Mejoras v9:
// - Drag en píxeles continuos durante el arrastre; snap a celda al soltar.
// - Umbral bajo (3px), cambio de eje sin soltar, ghost de rango visible.
// - Puertas compatibles garantizadas por el motor v9.
// - Zoom/pan robustos; tableros grandes se ven completos.
// - Feedback de combo, tips, estilos de bloque, stats y pantallas pulidas.
// =============================================================================

const LS = {
  current: 'bc.v9.current',
  unlocked: 'bc.v9.unlocked',
  scores: 'bc.v9.scores',
  moves: 'bc.v9.moves',
  times: 'bc.v9.times',
  defeats: 'bc.v9.defeats',
  style: 'bc.v9.style',
  options: 'bc.v9.options',
  wins: 'bc.v9.wins',
  totalMoves: 'bc.v9.totalMoves',
  streak: 'bc.v9.streak',
  bestStreak: 'bc.v9.bestStreak',
  bestCombo: 'bc.v9.bestCombo',
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
  'Pieza con flecha: solo se mueve en esa dirección. Planifica el orden.',
  'Sin soltar el dedo puedes cambiar de eje (horizontal ↔ vertical).',
  'Candados 🔒: hay que sacar N piezas antes de poder moverlas.',
  'Varias piezas del mismo color comparten UNA sola pared.',
  'El combo se rompe si sueltas una pieza sin que entre por su puerta.',
  'Identifica la pieza con MENOS libertad: suele ser la clave.',
  'Una pieza lista para salir a veces conviene dejarla de muro temporal.',
  'Usa zoom y pan en tableros grandes para ver el contexto completo.',
  'Los obstáculos rayados no se mueven: úsalos como topes de alineación.',
  'El deshacer permite experimentar rutas (excepto en Hardcore).',
]

function formatTime(t: number) {
  const m = Math.floor(Math.max(0, t) / 60)
  const s = Math.max(0, t) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const BASE_CELL = 48
const MIN_ZOOM = 0.22
const MAX_ZOOM = 2.8
/** Umbral bajo para arranque de arrastre fluido (como el original). */
const DRAG_THRESHOLD = 3

interface DragState {
  id: string
  pointerId: number
  originClientX: number
  originClientY: number
  baseRow: number
  baseCol: number
  axis: 'horizontal' | 'vertical' | null
  min: number
  max: number
  /** Posición visual en celdas fraccionarias durante el drag */
  visualRow: number
  visualCol: number
}

interface PanState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

type Screen = 'hub' | 'play' | 'levels' | 'settings' | 'styles' | 'stats' | 'win' | 'lose'

export function BlockCleaner() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('hub')
  const [levelId, setLevelId] = useState(() => Math.max(1, readJSON(LS.current, 1)))
  const [unlocked, setUnlocked] = useState(() => Math.max(1, readJSON(LS.unlocked, 1)))
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() => readJSON(LS.style, 'liquid-glass'))
  const [options, setOptions] = useState<PlayOptions>(() => readJSON(LS.options, DEFAULT_OPTIONS))

  const level: BlockCleanerLevel = useMemo(() => {
    try {
      const g = generateLevel(levelId)
      if (g && Array.isArray(g.blocks) && g.blocks.length > 0 && Array.isArray(g.exits)) return g
      return { ...FALLBACK_LEVEL, id: levelId }
    } catch {
      return { ...FALLBACK_LEVEL, id: levelId }
    }
  }, [levelId])

  const [blocks, setBlocks] = useState<Block[]>(() =>
    (Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks).map((b) => ({ ...b }))
  )
  const [clearedCount, setClearedCount] = useState(0)
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [stars, setStars] = useState<1 | 2 | 3>(1)
  const [hintId, setHintId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragVisual, setDragVisual] = useState<{ row: number; col: number } | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [showTips, setShowTips] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [undoStack, setUndoStack] = useState<{ blocks: Block[]; cleared: number }[]>([])
  const [combo, setCombo] = useState(0)
  const [bestComboThisLevel, setBestComboThisLevel] = useState(0)
  const [hintMsg, setHintMsg] = useState<string | null>(null)
  const [bursts, setBursts] = useState<Array<{ id: string; x: number; y: number; color: BlockColor }>>([])

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const timerRef = useRef<number | null>(null)
  const secondsRef = useRef(0)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const computeClampedPan = useCallback(
    (zoomVal: number, panVal: { x: number; y: number }, vw: number, vh: number) => {
      const contentW = level.cols * BASE_CELL * zoomVal
      const contentH = level.rows * BASE_CELL * zoomVal
      let x = panVal.x
      let y = panVal.y
      if (contentW <= vw) x = (vw - contentW) / 2
      else x = clampNum(x, vw - contentW, 0)
      if (contentH <= vh) y = (vh - contentH) / 2
      else y = clampNum(y, vh - contentH, 0)
      return { x, y }
    },
    [level.cols, level.rows]
  )

  const fitZoomToViewport = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    if (!vw || !vh) return
    const pad = 0.9
    const fit = clampNum(
      Math.min(
        (vw * pad) / (level.cols * BASE_CELL),
        (vh * pad) / (level.rows * BASE_CELL)
      ),
      MIN_ZOOM,
      1.2
    )
    setZoom(fit)
    setPan(computeClampedPan(fit, { x: 0, y: 0 }, vw, vh))
  }, [level.cols, level.rows, computeClampedPan])

  useEffect(() => {
    if (screen !== 'play') return
    const src = Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks
    setBlocks(src.map((b) => ({ ...b })))
    setClearedCount(0)
    setMoves(0)
    setSeconds(0)
    secondsRef.current = 0
    setHintId(null)
    setHintMsg(null)
    setExitingId(null)
    setIsPaused(false)
    setUndoStack([])
    setCombo(0)
    setBestComboThisLevel(0)
    setBursts([])
    setDraggingId(null)
    setDragVisual(null)
    dragRef.current = null
    writeJSON(LS.current, levelId)
    const raf = requestAnimationFrame(() => fitZoomToViewport())
    return () => cancelAnimationFrame(raf)
  }, [level, levelId, screen, fitZoomToViewport])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || screen !== 'play') return
    const ro = new ResizeObserver(() => {
      const vw = el.clientWidth
      const vh = el.clientHeight
      setPan((p) => computeClampedPan(zoom, p, vw, vh))
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, computeClampedPan])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || screen !== 'play') return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const vw = el.clientWidth
      const vh = el.clientHeight
      setZoom((z) => {
        const next = clampNum(z + delta, MIN_ZOOM, MAX_ZOOM)
        setPan((p) => computeClampedPan(next, p, vw, vh))
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [screen, computeClampedPan])

  useEffect(() => {
    if (screen !== 'play' || isPaused || showTips) return
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1
      setSeconds(secondsRef.current)
      if (level.timeLimit && secondsRef.current >= level.timeLimit) handleLose()
    }, 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, screen, level.timeLimit, isPaused, showTips])

  const handleLose = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    playSfx('lose')
    const d = readJSON<Record<number, number>>(LS.defeats, {})
    d[levelId] = (d[levelId] ?? 0) + 1
    writeJSON(LS.defeats, d)
    writeJSON(LS.streak, 0)
    setScreen('lose')
  }, [levelId])

  const checkWin = useCallback(
    (remaining: Block[], movesUsed: number) => {
      if (!Array.isArray(remaining) || remaining.length > 0) return
      if (timerRef.current) window.clearInterval(timerRef.current)
      playSfx('win')
      const ms = starsForMoves(movesUsed, level.parMoves || 5)
      const ts = starsForTime(secondsRef.current, level.timeLimit || 1)
      const earned = Math.min(ms, ts) as 1 | 2 | 3
      setStars(earned)
      setScreen('win')
      const scores = readJSON<Record<number, number>>(LS.scores, {})
      const bestM = readJSON<Record<number, number>>(LS.moves, {})
      const bestT = readJSON<Record<number, number>>(LS.times, {})
      if (earned > (scores[levelId] ?? 0)) scores[levelId] = earned
      if (bestM[levelId] === undefined || movesUsed < bestM[levelId]) bestM[levelId] = movesUsed
      if (bestT[levelId] === undefined || secondsRef.current < bestT[levelId]) {
        bestT[levelId] = secondsRef.current
      }
      writeJSON(LS.scores, scores)
      writeJSON(LS.moves, bestM)
      writeJSON(LS.times, bestT)
      writeJSON(LS.wins, readJSON(LS.wins, 0) + 1)
      writeJSON(LS.totalMoves, readJSON(LS.totalMoves, 0) + movesUsed)
      if (bestComboThisLevel > readJSON(LS.bestCombo, 0)) {
        writeJSON(LS.bestCombo, bestComboThisLevel)
      }
      const streak = readJSON(LS.streak, 0) + 1
      writeJSON(LS.streak, streak)
      if (streak > readJSON(LS.bestStreak, 0)) writeJSON(LS.bestStreak, streak)
      const next = Math.max(unlocked, levelId + 1)
      if (next !== unlocked) {
        setUnlocked(next)
        writeJSON(LS.unlocked, next)
      }
    },
    [level.parMoves, level.timeLimit, levelId, unlocked, bestComboThisLevel]
  )

  const spawnBurst = useCallback((block: Block) => {
    const bw = blockWidth(block)
    const bh = blockHeight(block)
    const x = (block.col + bw / 2) * BASE_CELL
    const y = (block.row + bh / 2) * BASE_CELL
    const id = `${block.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setBursts((prev) => [...prev, { id, x, y, color: block.color }])
    window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 650)
  }, [])

  const tryExit = useCallback(
    (blockId: string, list: Block[], cleared: number): Block[] => {
      const exits = Array.isArray(level.exits) ? level.exits : []
      const obstacles = Array.isArray(level.obstacles) ? level.obstacles : []
      const exitable = getExitableBlocks(list, exits, obstacles, level.rows, level.cols, cleared)
      if (!exitable.includes(blockId)) return list
      const block = list.find((b) => b.id === blockId)
      playSfx('exit')
      setExitingId(blockId)
      if (block) spawnBurst(block)
      const next = list.filter((b) => b.id !== blockId)
      const newCleared = cleared + 1
      window.setTimeout(() => {
        setExitingId(null)
        setBlocks(next)
        setClearedCount(newCleared)
        setMoves((m) => {
          const nm = m + 1
          checkWin(next, nm)
          return nm
        })
      }, 380)
      return next
    },
    [level, checkWin, spawnBurst]
  )

  const commitMove = useCallback(
    (blockId: string, toRow: number, toCol: number) => {
      setBlocks((prev) => {
        const list = Array.isArray(prev) ? prev : []
        if (!options.hardcore) {
          setUndoStack((s) => [
            ...s.slice(-30),
            { blocks: list.map((b) => ({ ...b })), cleared: clearedCount },
          ])
        }
        const next = list.map((b) =>
          b.id === blockId ? { ...b, row: toRow, col: toCol } : b
        )
        const after = tryExit(blockId, next, clearedCount)
        if (after.length !== next.length) {
          setCombo((c) => {
            const nc = c + 1
            setBestComboThisLevel((best) => Math.max(best, nc))
            if (nc > 1) playSfx('combo')
            return nc
          })
          return after
        }
        playSfx('move')
        setMoves((m) => m + 1)
        setCombo(0)
        return next
      })
      setHintId(null)
      setHintMsg(null)
    },
    [tryExit, options.hardcore, clearedCount]
  )

  // ---- Drag fluido: visual continuo en celdas fraccionarias, snap al soltar ----
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, block: Block) => {
    if (screen !== 'play' || exitingId || isPaused || showTips) return
    if (!isBlockMovable(block, clearedCount)) {
      playSfx('lock')
      return
    }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id: block.id,
      pointerId: e.pointerId,
      originClientX: e.clientX,
      originClientY: e.clientY,
      baseRow: block.row,
      baseCol: block.col,
      axis: null,
      min: 0,
      max: 0,
      visualRow: block.row,
      visualCol: block.col,
    }
    setDraggingId(block.id)
    setDragVisual({ row: block.row, col: block.col })
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const list = blocksRef.current
    const block = list.find((b) => b.id === drag.id)
    if (!block) return

    const dxPx = (e.clientX - drag.originClientX) / zoom
    const dyPx = (e.clientY - drag.originClientY) / zoom

    const axis = preferredAxisFromDelta(dxPx, dyPx, drag.axis, DRAG_THRESHOLD)
    if (!axis) return

    // Recalcular rango si cambió el eje
    if (axis !== drag.axis) {
      const range = computeSlideRangeOnAxis(
        { ...block, row: drag.baseRow, col: drag.baseCol },
        axis,
        list,
        level.obstacles ?? [],
        level.rows,
        level.cols,
        clearedCount
      )
      drag.axis = axis
      drag.min = range.min
      drag.max = range.max
    }

    const deltaCells = axis === 'horizontal' ? dxPx / BASE_CELL : dyPx / BASE_CELL
    const snapped = computeDragTarget(
      block,
      axis,
      drag.baseRow,
      drag.baseCol,
      Math.round(deltaCells),
      list,
      level.obstacles ?? [],
      level.rows,
      level.cols,
      clearedCount
    )

    // Visual continuo (clamp al rango en float) + snap lógico
    let visualRow = drag.baseRow
    let visualCol = drag.baseCol
    if (axis === 'horizontal') {
      const raw = drag.baseCol + deltaCells
      visualCol = clampNum(raw, drag.min, drag.max)
      visualRow = drag.baseRow
    } else {
      const raw = drag.baseRow + deltaCells
      visualRow = clampNum(raw, drag.min, drag.max)
      visualCol = drag.baseCol
    }

    drag.visualRow = visualRow
    drag.visualCol = visualCol
    setDragVisual({ row: visualRow, col: visualCol })

    // Mantener base lógica alineada al último snap entero (para commit limpio)
    drag.baseRow = snapped.row
    // No actualizamos base durante el drag continuo; el commit usa el visual redondeado
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }

    const list = blocksRef.current
    const block = list.find((b) => b.id === drag.id)
    const visual = dragVisual

    dragRef.current = null
    setDraggingId(null)
    setDragVisual(null)

    if (!block || !visual || !drag.axis) return

    const toRow = Math.round(visual.row)
    const toCol = Math.round(visual.col)

    // Clamp final al rango válido
    const range = computeSlideRangeOnAxis(
      { ...block, row: block.row, col: block.col },
      drag.axis,
      list,
      level.obstacles ?? [],
      level.rows,
      level.cols,
      clearedCount
    )
    let finalRow = block.row
    let finalCol = block.col
    if (drag.axis === 'horizontal') {
      finalCol = clampNum(toCol, range.min, range.max)
      finalRow = block.row
    } else {
      finalRow = clampNum(toRow, range.min, range.max)
      finalCol = block.col
    }

    if (finalRow === block.row && finalCol === block.col) return
    commitMove(block.id, finalRow, finalCol)
  }

  // Pan del viewport (fondo vacío)
  const onViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('bc-grid') &&
        !(e.target as HTMLElement).classList.contains('bc-cell') &&
        !(e.target as HTMLElement).classList.contains('bc-board')) {
      return
    }
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current
    if (!p || e.pointerId !== p.pointerId) return
    const el = viewportRef.current
    if (!el) return
    const nx = p.originX + (e.clientX - p.startX)
    const ny = p.originY + (e.clientY - p.startY)
    setPan(computeClampedPan(zoom, { x: nx, y: ny }, el.clientWidth, el.clientHeight))
  }

  const onViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
  }

  const handleRestart = () => {
    playSfx('ui')
    const src = Array.isArray(level.blocks) ? level.blocks : FALLBACK_LEVEL.blocks
    setBlocks(src.map((b) => ({ ...b })))
    setClearedCount(0)
    setMoves(0)
    setSeconds(0)
    secondsRef.current = 0
    setHintId(null)
    setHintMsg(null)
    setExitingId(null)
    setUndoStack([])
    setCombo(0)
    setBestComboThisLevel(0)
    setBursts([])
    setIsPaused(false)
    setScreen('play')
  }

  const handleUndo = () => {
    if (options.hardcore || undoStack.length === 0) return
    playSfx('ui')
    const last = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setBlocks(last.blocks.map((b) => ({ ...b })))
    setClearedCount(last.cleared)
    setMoves((m) => Math.max(0, m - 1))
    setCombo(0)
    setHintId(null)
  }

  const handleHint = () => {
    if (options.noHints) return
    playSfx('hint')
    const move = getHintMove(
      blocks,
      level.exits,
      level.obstacles ?? [],
      level.rows,
      level.cols,
      clearedCount
    )
    if (!move) {
      setHintMsg('No hay movimiento claro ahora')
      return
    }
    setHintId(move.blockId)
    setHintMsg(move.isExit ? 'Esta pieza ya puede salir' : 'Mueve esta pieza')
    window.setTimeout(() => setHintMsg(null), 2200)
  }

  const zoomBy = (delta: number) => {
    const el = viewportRef.current
    if (!el) return
    setZoom((z) => {
      const next = clampNum(z + delta, MIN_ZOOM, MAX_ZOOM)
      setPan((p) => computeClampedPan(next, p, el.clientWidth, el.clientHeight))
      return next
    })
  }

  const resetZoom = () => fitZoomToViewport()

  const getBlockStyleProps = (color: BlockColor): React.CSSProperties => {
    const c = COLOR_HEX[color] ?? COLOR_HEX.cyan
    switch (blockStyle) {
      case 'metallic':
        return {
          background: `linear-gradient(145deg, ${c.light}, ${c.base} 40%, ${c.dark})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 10px ${c.glow}`,
          border: `1px solid ${c.dark}`,
        }
      case 'matte':
        return {
          background: c.base,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          border: '1px solid rgba(0,0,0,0.15)',
        }
      case 'neon':
        return {
          background: c.base,
          boxShadow: `0 0 12px ${c.glow}, 0 0 24px ${c.glow}, inset 0 0 8px ${c.light}`,
          border: `1px solid ${c.light}`,
        }
      case 'pastel':
        return {
          background: c.light,
          color: c.dark,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          border: `1px solid ${c.base}`,
        }
      case 'crystal':
        return {
          background: `linear-gradient(160deg, rgba(255,255,255,0.45), ${c.base}88 50%, ${c.dark}aa)`,
          boxShadow: `0 4px 14px ${c.glow}`,
          border: `1px solid ${c.light}`,
          backdropFilter: 'blur(4px)',
        }
      case 'candy':
        return {
          background: `linear-gradient(180deg, ${c.light} 0%, ${c.base} 45%, ${c.dark} 100%)`,
          boxShadow: `inset 0 2px 4px rgba(255,255,255,0.5), 0 4px 12px ${c.glow}`,
          border: `1px solid ${c.dark}`,
        }
      case 'obsidian':
        return {
          background: `linear-gradient(145deg, #2a2a2e, ${c.dark} 60%, #111)`,
          boxShadow: `0 0 10px ${c.glow}`,
          border: `1px solid ${c.base}`,
        }
      default: // liquid-glass
        return {
          background: `linear-gradient(155deg, ${c.light}cc, ${c.base} 55%, ${c.dark})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 14px ${c.glow}`,
          border: `1px solid rgba(255,255,255,0.25)`,
        }
    }
  }

  const safeBlocks = Array.isArray(blocks) ? blocks : []
  const safeExits = Array.isArray(level.exits) ? level.exits : []
  const safeObstacles = Array.isArray(level.obstacles) ? level.obstacles : []

  // Ghost range del bloque en drag
  const ghostRange = useMemo(() => {
    if (!draggingId || !options.showGhost) return null
    const drag = dragRef.current
    const block = safeBlocks.find((b) => b.id === draggingId)
    if (!block || !drag?.axis) return null
    return {
      block,
      axis: drag.axis,
      min: drag.min,
      max: drag.max,
      baseRow: block.row,
      baseCol: block.col,
    }
  }, [draggingId, options.showGhost, safeBlocks, dragVisual])

  // ---- Pantallas no-play ----
  if (screen === 'hub') {
    return (
      <div className="app-shell">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button
            type="button"
            className="glass-button secondary bc-back"
            onClick={() => {
              playSfx('ui')
              navigate('/categoria/logica')
            }}
          >
            ← Volver
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Block Cleaner</h1>
            <span className="bc-level-badge">Nv. {levelId}</span>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="glass-card bc-hub">
          <p className="bc-hub-lead">
            Desliza bloques de color hacia su puerta. Cada nivel crece y se complica:
            ejes forzados, candados y tableros más grandes.
          </p>
          <div className="bc-hub-grid">
            <button
              type="button"
              className="glass-button bc-hub-primary"
              onClick={() => {
                playSfx('ui')
                setScreen('play')
              }}
            >
              Jugar · Nivel {levelId}
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { playSfx('ui'); setScreen('levels') }}>
              Niveles
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { playSfx('ui'); setScreen('styles') }}>
              Estilos de bloque
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { playSfx('ui'); setScreen('settings') }}>
              Opciones
            </button>
            <button type="button" className="glass-button secondary" onClick={() => { playSfx('ui'); setScreen('stats') }}>
              Estadísticas
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'levels') {
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    const bestM = readJSON<Record<number, number>>(LS.moves, {})
    const defeats = readJSON<Record<number, number>>(LS.defeats, {})
    const maxShow = Math.max(unlocked + 4, 20)
    return (
      <div className="app-shell">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('hub')}>←</button>
          <div className="bc-title-wrap"><h1 className="bc-title">Niveles</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <p className="bc-levels-hint">Desbloqueados: {unlocked}</p>
        <div className="bc-level-grid">
          {Array.from({ length: maxShow }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked
            return (
              <button
                key={n}
                type="button"
                className={`glass-card bc-level-btn ${n === levelId ? 'active' : ''}`}
                disabled={locked}
                onClick={() => {
                  if (locked) return
                  playSfx('ui')
                  setLevelId(n)
                  setScreen('play')
                }}
              >
                <span className="bc-level-num">{locked ? '🔒' : n}</span>
                {!locked && scores[n] != null && (
                  <span className="bc-level-stars">{'★'.repeat(scores[n])}</span>
                )}
                {!locked && bestM[n] != null && (
                  <span className="bc-level-meta mono">{bestM[n]} mov</span>
                )}
                {defeats[n] ? <span className="bc-level-meta defeats">{defeats[n]}×</span> : null}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div className="app-shell">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('hub')}>←</button>
          <div className="bc-title-wrap"><h1 className="bc-title">Opciones</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="glass-card bc-panel">
          {(
            [
              ['hardcore', 'Hardcore', 'Sin deshacer ni reiniciar'],
              ['noHints', 'Sin pistas', 'Oculta el botón de pista'],
              ['showExits', 'Mostrar puertas', 'Resalta las salidas de color'],
              ['showPar', 'Mostrar par', 'Objetivo de movimientos'],
              ['showGhost', 'Rango fantasma', 'Muestra el tramo deslizable'],
            ] as const
          ).map(([key, label, desc]) => (
            <div key={key} className="bc-opt-row">
              <div>
                <div>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>{desc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={options[key]}
                className="gco-switch"
                onClick={() => {
                  const next = { ...options, [key]: !options[key] }
                  setOptions(next)
                  writeJSON(LS.options, next)
                  playSfx('ui')
                }}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  border: 'none',
                  background: options[key] ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: options[key] ? 24 : 3,
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
          ))}
          <p className="bc-settings-note">
            El motor v9 garantiza que cada pieza con eje forzado tenga su puerta en un lado compatible.
          </p>
        </div>
      </div>
    )
  }

  if (screen === 'styles') {
    return (
      <div className="app-shell">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('hub')}>←</button>
          <div className="bc-title-wrap"><h1 className="bc-title">Estilos</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-styles-grid">
          {BLOCK_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`glass-card bc-style-card ${blockStyle === s.id ? 'active' : ''}`}
              onClick={() => {
                setBlockStyle(s.id)
                writeJSON(LS.style, s.id)
                playSfx('ui')
              }}
            >
              <div
                className="bc-style-preview"
                style={getBlockStyleProps('cyan')}
              />
              <span className="bc-style-label">{s.label}</span>
              <span className="bc-style-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'stats') {
    return (
      <div className="app-shell">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button type="button" className="glass-button secondary bc-back" onClick={() => setScreen('hub')}>←</button>
          <div className="bc-title-wrap"><h1 className="bc-title">Estadísticas</h1></div>
          <div className="bc-header-spacer" />
        </header>
        <div className="glass-card bc-panel">
          <div className="bc-stat-row"><span>Victorias</span><span className="mono">{readJSON(LS.wins, 0)}</span></div>
          <div className="bc-stat-row"><span>Movimientos totales</span><span className="mono">{readJSON(LS.totalMoves, 0)}</span></div>
          <div className="bc-stat-row"><span>Racha actual</span><span className="mono">{readJSON(LS.streak, 0)}</span></div>
          <div className="bc-stat-row"><span>Mejor racha</span><span className="mono">{readJSON(LS.bestStreak, 0)}</span></div>
          <div className="bc-stat-row"><span>Mejor combo</span><span className="mono">×{readJSON(LS.bestCombo, 0)}</span></div>
          <div className="bc-stat-row"><span>Desbloqueado hasta</span><span className="mono">{unlocked}</span></div>
        </div>
      </div>
    )
  }

  // ---- PLAY ----
  const TipsModal = (
    <div className="modal-overlay" onClick={() => setShowTips(false)}>
      <motion.div
        className="modal-panel glass-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.75rem' }}>Consejo</h3>
        <p className="bc-tip-text">{PRO_TIPS[tipIndex % PRO_TIPS.length]}</p>
        <div className="bc-tip-actions">
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => setTipIndex((i) => (i + 1) % PRO_TIPS.length)}
          >
            Otro consejo
          </button>
          <button type="button" className="glass-button" onClick={() => setShowTips(false)}>
            Entendido
          </button>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div className="app-shell">
      <style>{BC_STYLES}</style>

      <header className="bc-header">
        <button
          type="button"
          className="glass-button secondary bc-back"
          onClick={() => {
            playSfx('ui')
            setScreen('hub')
          }}
        >
          ←
        </button>
        <div className="bc-title-wrap">
          <h1 className="bc-title">Block Cleaner</h1>
          <span className="bc-level-badge">
            Nv. {levelId} · {level.tierLabel}
          </span>
        </div>
        <div className="bc-header-spacer" />
      </header>

      <motion.div className="glass-card bc-board-card" layout>
        <div
          ref={viewportRef}
          className="bc-board-viewport"
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerUp}
          onPointerCancel={onViewportPointerUp}
        >
          <div
            className="bc-board"
            style={{
              width: level.cols * BASE_CELL,
              height: level.rows * BASE_CELL,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Grid */}
            <div
              className="bc-grid"
              style={{
                width: level.cols * BASE_CELL,
                height: level.rows * BASE_CELL,
                gridTemplateColumns: `repeat(${level.cols}, ${BASE_CELL}px)`,
                gridTemplateRows: `repeat(${level.rows}, ${BASE_CELL}px)`,
              }}
            >
              {Array.from({ length: level.rows * level.cols }).map((_, i) => (
                <div key={i} className="bc-cell" />
              ))}
            </div>

            {/* Obstáculos */}
            {safeObstacles.map((o) => (
              <div
                key={o.id}
                className="bc-obstacle"
                style={{
                  left: o.col * BASE_CELL + 2,
                  top: o.row * BASE_CELL + 2,
                  width: BASE_CELL - 4,
                  height: BASE_CELL - 4,
                }}
              />
            ))}

            {/* Puertas */}
            {options.showExits &&
              safeExits.map((ex) => {
                const c = COLOR_HEX[ex.color] ?? COLOR_HEX.cyan
                const thick = 6
                let style: React.CSSProperties = {
                  position: 'absolute',
                  background: c.base,
                  boxShadow: `0 0 10px ${c.glow}`,
                  borderRadius: 3,
                  pointerEvents: 'none',
                  zIndex: 2,
                }
                if (ex.side === 'left') {
                  style = {
                    ...style,
                    left: -thick,
                    top: ex.pos * BASE_CELL,
                    width: thick,
                    height: ex.length * BASE_CELL,
                  }
                } else if (ex.side === 'right') {
                  style = {
                    ...style,
                    left: level.cols * BASE_CELL,
                    top: ex.pos * BASE_CELL,
                    width: thick,
                    height: ex.length * BASE_CELL,
                  }
                } else if (ex.side === 'top') {
                  style = {
                    ...style,
                    left: ex.pos * BASE_CELL,
                    top: -thick,
                    width: ex.length * BASE_CELL,
                    height: thick,
                  }
                } else {
                  style = {
                    ...style,
                    left: ex.pos * BASE_CELL,
                    top: level.rows * BASE_CELL,
                    width: ex.length * BASE_CELL,
                    height: thick,
                  }
                }
                return <div key={ex.id} style={style} />
              })}

            {/* Ghost range */}
            {ghostRange && (
              <div
                className="bc-ghost-range"
                style={
                  ghostRange.axis === 'horizontal'
                    ? {
                        left: ghostRange.min * BASE_CELL + 2,
                        top: ghostRange.baseRow * BASE_CELL + 2,
                        width:
                          (ghostRange.max - ghostRange.min + blockWidth(ghostRange.block)) *
                            BASE_CELL -
                          4,
                        height: blockHeight(ghostRange.block) * BASE_CELL - 4,
                      }
                    : {
                        left: ghostRange.baseCol * BASE_CELL + 2,
                        top: ghostRange.min * BASE_CELL + 2,
                        width: blockWidth(ghostRange.block) * BASE_CELL - 4,
                        height:
                          (ghostRange.max - ghostRange.min + blockHeight(ghostRange.block)) *
                            BASE_CELL -
                          4,
                      }
                }
              />
            )}

            <AnimatePresence>
              {bursts.map((b) => {
                const c = COLOR_HEX[b.color] ?? COLOR_HEX.cyan
                return (
                  <motion.div
                    key={b.id}
                    className="bc-burst"
                    style={{
                      left: b.x,
                      top: b.y,
                      background: `radial-gradient(circle, ${c.light} 0%, ${c.base} 45%, transparent 72%)`,
                    }}
                    initial={{ opacity: 0.85, scale: 0.2 }}
                    animate={{ opacity: 0, scale: 2.7 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  />
                )
              })}
            </AnimatePresence>

            <AnimatePresence>
              {safeBlocks.map((b) => {
                const isDragging = draggingId === b.id
                const isExiting = exitingId === b.id
                const row =
                  isDragging && dragVisual != null ? dragVisual.row : b.row
                const col =
                  isDragging && dragVisual != null ? dragVisual.col : b.col
                const bw = blockWidth(b)
                const bh = blockHeight(b)
                const w = bw * BASE_CELL
                const h = bh * BASE_CELL
                const locked = !isBlockMovable(b, clearedCount)
                const need =
                  b.lockedUntilClears != null
                    ? Math.max(0, b.lockedUntilClears - clearedCount)
                    : 0
                const pad = 4
                const activeExit = safeExits.find((e) => e.color === b.color)
                const exitVec =
                  isExiting && activeExit
                    ? exitPixelVector(activeExit.side, BASE_CELL)
                    : { dx: 0, dy: 0 }
                const rotateOut = isExiting
                  ? exitVec.dx !== 0
                    ? exitVec.dx > 0
                      ? 14
                      : -14
                    : exitVec.dy > 0
                      ? 8
                      : -8
                  : 0

                return (
                  <motion.div
                    key={b.id}
                    role="button"
                    tabIndex={locked ? -1 : 0}
                    className={[
                      'bc-block',
                      isDragging ? 'bc-block-dragging' : '',
                      hintId === b.id ? 'bc-block-hint' : '',
                      isExiting ? 'bc-block-exiting' : '',
                      locked ? 'bc-block-locked' : '',
                    ].join(' ')}
                    style={{
                      width: Math.max(8, w - pad),
                      height: Math.max(8, h - pad),
                      ...getBlockStyleProps(b.color),
                    }}
                    initial={false}
                    animate={{
                      x: col * BASE_CELL + pad / 2 + exitVec.dx,
                      y: row * BASE_CELL + pad / 2 + exitVec.dy,
                      scale: isExiting ? 0.12 : isDragging ? 1.05 : 1,
                      opacity: isExiting ? 0 : locked ? 0.48 : 1,
                      rotate: rotateOut,
                    }}
                    transition={
                      isDragging
                        ? { duration: 0 }
                        : isExiting
                          ? { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
                          : { type: 'spring', stiffness: 480, damping: 34, mass: 0.75 }
                    }
                    onPointerDown={(e) => handlePointerDown(e, b)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {b.forcedDir && (
                      <span className="bc-badge">
                        {b.forcedDir === 'up'
                          ? '↑'
                          : b.forcedDir === 'down'
                            ? '↓'
                            : b.forcedDir === 'left'
                              ? '←'
                              : '→'}
                      </span>
                    )}
                    {b.axisLock && !b.forcedDir && (
                      <span className="bc-badge">
                        {b.axisLock === 'horizontal' ? '↔' : '↕'}
                      </span>
                    )}
                    {locked && need > 0 && <span className="bc-lock">🔒{need}</span>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          <div className="bc-zoom-controls">
            <button type="button" className="icon-btn bc-zoom-btn" aria-label="Alejar" onClick={() => zoomBy(-0.14)}>
              −
            </button>
            <button type="button" className="icon-btn bc-zoom-btn" aria-label="Ajustar" onClick={resetZoom}>
              ⤢
            </button>
            <button type="button" className="icon-btn bc-zoom-btn" aria-label="Acercar" onClick={() => zoomBy(0.14)}>
              +
            </button>
          </div>
        </div>
      </motion.div>

      {hintMsg && <p className="bc-hint-msg mono">{hintMsg}</p>}

      <div className="bc-stats">
        <span className="mono">Mov: {moves}</span>
        <span className="mono">Tiempo: {formatTime(seconds)}</span>
        <span className="mono bc-timer-warn">
          Límite: {formatTime(Math.max(0, level.timeLimit - seconds))}
        </span>
        {options.showPar && <span className="mono">Par: {level.parMoves}</span>}
        <span className="mono">Quedan: {safeBlocks.length}</span>
        <span className="mono">Sacados: {clearedCount}</span>
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
          onClick={() => {
            playSfx('ui')
            setTipIndex(Math.floor(Math.random() * PRO_TIPS.length))
            setShowTips(true)
          }}
        >
          Consejos
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            playSfx('ui')
            setIsPaused((p) => !p)
          }}
        >
          {isPaused ? 'Reanudar' : 'Pausa'}
        </button>
      </div>

      <AnimatePresence>
        {showTips && TipsModal}
        {screen === 'win' && (
          <div className="modal-overlay">
            <motion.div
              className="modal-panel glass-card bc-win-panel"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h2 className="bc-win-title">¡Nivel completado!</h2>
              <p className="mono bc-win-moves">
                Movimientos: {moves} · {formatTime(seconds)}
              </p>
              {bestComboThisLevel > 1 && (
                <p className="mono bc-win-combo">Mejor combo: ×{bestComboThisLevel}</p>
              )}
              <div className="bc-stars">
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= stars ? 'bc-star bc-star-on' : 'bc-star'}>
                    ★
                  </span>
                ))}
              </div>
              <div className="bc-win-actions">
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => {
                    playSfx('ui')
                    setLevelId((id) => id + 1)
                    setScreen('play')
                  }}
                >
                  Siguiente
                </button>
                <button type="button" className="glass-button secondary" onClick={handleRestart}>
                  Repetir
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => setScreen('hub')}
                >
                  Menú
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {screen === 'lose' && (
          <div className="modal-overlay">
            <motion.div
              className="modal-panel glass-card bc-win-panel"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h2 className="bc-win-title">Tiempo agotado</h2>
              <p className="mono bc-win-moves">Movimientos: {moves}</p>
              <div className="bc-win-actions">
                <button type="button" className="glass-button" onClick={handleRestart}>
                  Reintentar
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => setScreen('hub')}
                >
                  Menú
                </button>
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
.bc-level-badge { font-family: var(--font-mono); font-size: 0.78rem; color: var(--gco-primary); background: var(--gco-primary-dim); padding: 0.15rem 0.65rem; border-radius: var(--gco-radius-pill); }
.bc-back { flex-shrink: 0; }
.bc-hub, .bc-panel { padding: 1.4rem 1.2rem; max-width: 440px; margin: 0 auto; }
.bc-hub-lead { color: var(--gco-ink-muted); font-size: 0.92rem; line-height: 1.5; margin-bottom: 1.25rem; text-align: center; }
.bc-hub-grid { display: flex; flex-direction: column; gap: 0.6rem; }
.bc-hub-primary { width: 100%; }
.bc-opt-row { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 0; border-bottom: 1px solid var(--gco-hairline); font-size: 0.92rem; gap: 1rem; }
.bc-settings-note { font-size: 0.75rem; color: var(--gco-ink-muted); margin-top: 0.9rem; line-height: 1.4; }
.bc-tip-text { font-size: 1rem; line-height: 1.55; margin-bottom: 1.3rem; }
.bc-tip-actions { display: flex; flex-direction: column; gap: 0.55rem; }
.bc-stat-row { display: flex; justify-content: space-between; padding: 0.65rem 0; border-bottom: 1px solid var(--gco-hairline); font-size: 0.9rem; }
.bc-stat-row:last-child { border-bottom: none; }
.bc-levels-hint { text-align: center; color: var(--gco-ink-muted); font-size: 0.85rem; margin-bottom: 0.9rem; }
.bc-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 0.65rem; }
.bc-level-btn { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.8rem 0.4rem; cursor: pointer; border: 1px solid var(--gco-glass-border); background: var(--gco-glass-bg); color: var(--gco-ink); }
.bc-level-btn.active, .bc-level-btn:hover:not(:disabled) { border-color: var(--gco-primary); background: var(--gco-primary-dim); }
.bc-level-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.bc-level-num { font-weight: 700; font-size: 1.05rem; }
.bc-level-stars { font-size: 0.72rem; color: var(--gco-primary); letter-spacing: 1px; }
.bc-level-meta { font-size: 0.62rem; color: var(--gco-ink-muted); }
.bc-level-meta.defeats { color: var(--gco-secondary); }
.bc-styles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
.bc-style-card { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.95rem 0.6rem; cursor: pointer; border: 1px solid var(--gco-glass-border); background: var(--gco-glass-bg); color: var(--gco-ink); font-size: 0.85rem; font-weight: 600; }
.bc-style-card.active { border-color: var(--gco-primary); background: var(--gco-primary-dim); }
.bc-style-preview { width: 56px; height: 28px; border-radius: 10px; }
.bc-style-label { font-weight: 600; }
.bc-style-desc { font-size: 0.68rem; color: var(--gco-ink-muted); font-weight: 400; text-align: center; }
.bc-board-card { padding: clamp(0.5rem, 2vw, 0.9rem); display: flex; justify-content: center; }
.bc-board-viewport {
  position: relative;
  width: 100%;
  height: min(62vh, 580px);
  min-height: 300px;
  overflow: hidden;
  touch-action: none;
  background: var(--gco-input-bg);
  border: 1px solid var(--gco-glass-border);
  border-radius: var(--gco-radius-sm);
  cursor: grab;
}
.bc-board-viewport:active { cursor: grabbing; }
.bc-board { position: absolute; top: 0; left: 0; will-change: transform; }
.bc-grid {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  box-sizing: border-box;
}
.bc-cell {
  border: 1px solid var(--gco-hairline);
  box-sizing: border-box;
  background: transparent;
}
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
  border-radius: 4px;
  box-sizing: border-box;
}
.bc-ghost-range {
  position: absolute;
  border-radius: 10px;
  background: rgba(100, 160, 255, 0.12);
  border: 1px dashed rgba(100, 160, 255, 0.45);
  pointer-events: none;
  z-index: 3;
}
.bc-block {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 10px;
  cursor: grab;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
  touch-action: none;
}
.bc-block-dragging {
  cursor: grabbing;
  filter: brightness(1.1);
  z-index: 12;
  box-shadow: 0 10px 28px rgba(0,0,0,0.35) !important;
}
.bc-block-hint {
  animation: bc-hint-pulse 0.85s ease-in-out infinite;
  z-index: 8;
}
.bc-block-exiting { pointer-events: none; z-index: 20; }
.bc-block-locked { cursor: not-allowed; }
.bc-badge, .bc-lock {
  font-size: 0.85rem;
  text-shadow: 0 1px 3px rgba(0,0,0,0.45);
}
.bc-lock {
  background: rgba(0,0,0,0.4);
  border-radius: 999px;
  padding: 0.12rem 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.bc-burst {
  position: absolute;
  width: 56px;
  height: 56px;
  margin-left: -28px;
  margin-top: -28px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 25;
}
@keyframes bc-hint-pulse {
  0%, 100% { filter: brightness(1); box-shadow: 0 0 0 0 var(--gco-primary-dim); }
  50% { filter: brightness(1.25); box-shadow: 0 0 0 8px var(--gco-primary-dim); }
}
.bc-zoom-controls {
  position: absolute;
  right: 0.55rem;
  bottom: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  z-index: 30;
}
.bc-zoom-btn {
  background: var(--gco-glass-bg);
  border: 1px solid var(--gco-glass-border);
  backdrop-filter: blur(10px);
  font-weight: 700;
  font-size: 1.05rem;
  width: 2.1rem;
  height: 2.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  color: var(--gco-ink);
}
.bc-zoom-btn:hover { border-color: var(--gco-primary); background: var(--gco-primary-dim); }
.bc-hint-msg {
  text-align: center;
  color: var(--gco-primary);
  font-size: 0.85rem;
  margin-top: 0.5rem;
}
.bc-stats {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 1rem;
  color: var(--gco-ink-muted);
  font-size: 0.85rem;
}
.bc-timer-warn { color: var(--gco-secondary); font-weight: 600; }
.bc-combo { color: var(--gco-primary); font-weight: 700; }
.bc-actions {
  display: flex;
  justify-content: center;
  gap: 0.65rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.bc-win-panel { text-align: center; padding: 1.7rem 1.4rem; max-width: 340px; }
.bc-win-title { font-size: 1.3rem; margin-bottom: 0.55rem; }
.bc-win-moves { color: var(--gco-ink-muted); margin-bottom: 0.4rem; }
.bc-win-combo { color: var(--gco-primary); font-weight: 700; margin-bottom: 0.5rem; }
.bc-stars { font-size: 1.85rem; letter-spacing: 0.28rem; margin-bottom: 1.2rem; }
.bc-star { color: var(--gco-glass-border); }
.bc-star-on { color: var(--gco-primary); text-shadow: 0 0 12px var(--gco-primary-dim); }
.bc-win-actions { display: flex; flex-direction: column; gap: 0.55rem; }
@media (max-width: 420px) {
  .bc-header { flex-wrap: wrap; }
  .bc-title-wrap { order: 3; width: 100%; }
  .bc-board-viewport { min-height: 280px; height: min(55vh, 480px); }
}
`

export default BlockCleaner