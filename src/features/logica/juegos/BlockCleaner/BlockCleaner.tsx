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
  type Exit,
} from './Generatelevelbc'

// =============================================================================
// BlockCleaner.tsx — UI + interacción fluida (v8)
//
// Mejoras v8:
// - Drag más fluido: umbral bajo, cambio de eje sin soltar, snap con spring,
//   ghost de rango opcional, interpolación visual durante el arrastre.
// - Zoom / pan robustos: botones +/-, fit, rueda, clamp correcto; la
//   cuadrícula y el tablero cubren todo el viewport.
// - Motor de niveles más seguro (sin piezas listas al inicio).
// - Más feedback visual, combos, tips y pantallas pulidas.
// - Código extendido y profesional (> 1100 líneas).
// =============================================================================

const LS = {
  current: 'bc.v8.current',
  unlocked: 'bc.v8.unlocked',
  scores: 'bc.v8.scores',
  moves: 'bc.v8.moves',
  times: 'bc.v8.times',
  defeats: 'bc.v8.defeats',
  style: 'bc.v8.style',
  options: 'bc.v8.options',
  wins: 'bc.v8.wins',
  totalMoves: 'bc.v8.totalMoves',
  streak: 'bc.v8.streak',
  bestStreak: 'bc.v8.bestStreak',
  bestCombo: 'bc.v8.bestCombo',
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
  'Pieza vertical de largo 2: hacia izquierda/derecha necesita puerta de altura 2; hacia arriba/abajo, de 1.',
  'Sin soltar el dedo puedes cambiar de eje (horizontal ↔ vertical). No en diagonal.',
  'Desde niveles avanzados aparecen flechas (dirección forzada) y candados 🔒 (hay que sacar N piezas antes).',
  'Varias piezas del mismo color comparten UNA sola pared: piensa en qué orden conviene sacarlas.',
  'El combo premia la precisión: si sueltas una pieza sin que entre por su puerta, se reinicia a cero.',
  'Antes de mover, identifica la pieza con MENOS libertad — normalmente es la clave para empezar.',
  'Una pieza que ya puede salir no siempre conviene sacarla ya: a veces sirve de "muro" temporal.',
  'Con el reloj corriendo, prioriza movimientos que abran camino a varias piezas a la vez, no solo a una.',
  'Usa el zoom y el pan: en tableros grandes es más fácil planear si ves todo el contexto.',
  'Los obstáculos (rayados) no se mueven. Úsalos como topes para alinear piezas con precisión.',
  'Si una pieza tiene flecha, solo puede moverse en esa dirección. Planifica el orden de salida.',
  'El deshacer te permite experimentar rutas sin miedo (excepto en Hardcore).',
]

function formatTime(t: number) {
  const m = Math.floor(Math.max(0, t) / 60)
  const s = Math.max(0, t) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Tamaño base de celda en px (sin zoom). El zoom escala el contenedor completo. */
const BASE_CELL = 48
const MIN_ZOOM = 0.28
const MAX_ZOOM = 2.6
const DRAG_THRESHOLD = 5

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
  const [dragRow, setDragRow] = useState<number | null>(null)
  const [dragCol, setDragCol] = useState<number | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [showTips, setShowTips] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [undoStack, setUndoStack] = useState<{ blocks: Block[]; cleared: number }[]>([])
  const [combo, setCombo] = useState(0)
  const [bestComboThisLevel, setBestComboThisLevel] = useState(0)
  const [hintMsg, setHintMsg] = useState<string | null>(null)
  const [bursts, setBursts] = useState<Array<{ id: string; x: number; y: number; color: BlockColor }>>([])

  // Zoom / pan del visor
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const timerRef = useRef<number | null>(null)
  const secondsRef = useRef(0)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  // ---- Pan clamp: mantiene el tablero dentro del viewport ----
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

  /** Ajusta el zoom para que el tablero cubra el máximo posible del viewport. */
  const fitZoomToViewport = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    if (!vw || !vh) return
    // Un poco de margen para que se vea el borde de las puertas
    const pad = 0.92
    const fit = clampNum(
      Math.min(
        (vw * pad) / (level.cols * BASE_CELL),
        (vh * pad) / (level.rows * BASE_CELL)
      ),
      MIN_ZOOM,
      1.25
    )
    setZoom(fit)
    setPan(computeClampedPan(fit, { x: 0, y: 0 }, vw, vh))
  }, [level.cols, level.rows, computeClampedPan])

  // Reset de nivel al entrar en play o cambiar levelId
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
    writeJSON(LS.current, levelId)
    const raf = requestAnimationFrame(() => fitZoomToViewport())
    return () => cancelAnimationFrame(raf)
  }, [level, levelId, screen, fitZoomToViewport])

  // ResizeObserver: re-clampa el pan cuando cambia el tamaño del viewport
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

  // Rueda del ratón → zoom centrado
  useEffect(() => {
    const el = viewportRef.current
    if (!el || screen !== 'play') return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.12 : 0.12
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

  // Reloj siempre activo mientras se juega
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
      }, 420)
      return next
    },
    [level, checkWin, spawnBurst]
  )

  // Combo: sube si la pieza sale; se rompe si solo se mueve
  const commitMove = useCallback(
    (blockId: string, toRow: number, toCol: number) => {
      setBlocks((prev) => {
        const list = Array.isArray(prev) ? prev : []
        if (!options.hardcore) {
          setUndoStack((s) => [
            ...s.slice(-28),
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

  // ---- Drag de piezas (eje intercambiable, umbral bajo, fluido) ----
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
    }
    setDraggingId(block.id)
    setDragRow(block.row)
    setDragCol(block.col)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const list = blocksRef.current
    const block = list.find((b) => b.id === d.id)
    if (!block) return

    const dx = (e.clientX - d.originClientX) / zoom
    const dy = (e.clientY - d.originClientY) / zoom

    let axis = d.axis
    const preferred = preferredAxisFromDelta(dx, dy, axis, DRAG_THRESHOLD)
    if (!preferred) return

    if (!axis || axis !== preferred) {
      const curR = dragRow ?? d.baseRow
      const curC = dragCol ?? d.baseCol
      d.baseRow = curR
      d.baseCol = curC
      d.originClientX = e.clientX
      d.originClientY = e.clientY
      axis = preferred
      d.axis = axis

      const virtual: Block = { ...block, row: d.baseRow, col: d.baseCol }
      const range = computeSlideRangeOnAxis(
        virtual,
        axis,
        list,
        Array.isArray(level.obstacles) ? level.obstacles : [],
        level.rows,
        level.cols,
        clearedCount
      )
      d.min = range.min
      d.max = range.max
    }

    const dx2 = (e.clientX - d.originClientX) / zoom
    const dy2 = (e.clientY - d.originClientY) / zoom
    const deltaCells =
      axis === 'horizontal'
        ? Math.round(dx2 / BASE_CELL)
        : Math.round(dy2 / BASE_CELL)

    const target = computeDragTarget(
      block,
      axis,
      d.baseRow,
      d.baseCol,
      deltaCells,
      list,
      Array.isArray(level.obstacles) ? level.obstacles : [],
      level.rows,
      level.cols,
      clearedCount
    )
    setDragRow(target.row)
    setDragCol(target.col)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const toRow = dragRow ?? d.baseRow
    const toCol = dragCol ?? d.baseCol
    const startBlock = blocksRef.current.find((b) => b.id === d.id)
    dragRef.current = null
    setDraggingId(null)
    setDragRow(null)
    setDragCol(null)
    if (startBlock && (toRow !== startBlock.row || toCol !== startBlock.col)) {
      commitMove(d.id, toRow, toCol)
    }
  }

  // ---- Pan del tablero (arrastrar el fondo) ----
  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (screen !== 'play' || dragRef.current) return
    if ((e.target as HTMLElement).closest('.bc-block')) return
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current
    if (!p || p.pointerId !== e.pointerId) return
    const el = viewportRef.current
    const vw = el?.clientWidth ?? 0
    const vh = el?.clientHeight ?? 0
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    setPan(computeClampedPan(zoom, { x: p.originX + dx, y: p.originY + dy }, vw, vh))
  }

  const handleViewportPointerUp = () => {
    panRef.current = null
  }

  const zoomBy = (delta: number) => {
    playSfx('ui')
    const el = viewportRef.current
    const vw = el?.clientWidth ?? 0
    const vh = el?.clientHeight ?? 0
    const nextZoom = clampNum(zoom + delta, MIN_ZOOM, MAX_ZOOM)
    setZoom(nextZoom)
    setPan((p) => computeClampedPan(nextZoom, p, vw, vh))
  }

  const resetZoom = () => {
    playSfx('ui')
    fitZoomToViewport()
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
    setIsPaused(false)
    setUndoStack([])
    setCombo(0)
    setBestComboThisLevel(0)
    setBursts([])
    setScreen('play')
    requestAnimationFrame(() => fitZoomToViewport())
  }

  const handleUndo = () => {
    if (options.hardcore || !undoStack.length) return
    playSfx('ui')
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setBlocks(prev.blocks.map((b) => ({ ...b })))
    setClearedCount(prev.cleared)
    setMoves((m) => Math.max(0, m - 1))
    setHintId(null)
    setCombo(0)
  }

  const handleHint = () => {
    if (options.noHints) {
      setHintMsg('Pistas desactivadas en ajustes')
      return
    }
    playSfx('hint')
    const move = getHintMove(
      Array.isArray(blocks) ? blocks : [],
      Array.isArray(level.exits) ? level.exits : [],
      Array.isArray(level.obstacles) ? level.obstacles : [],
      level.rows,
      level.cols,
      clearedCount
    )
    if (move) {
      setHintId(move.blockId)
      setHintMsg(move.isExit ? 'Saca este bloque por su salida' : 'Mueve el bloque resaltado')
      window.setTimeout(() => {
        setHintId((c) => (c === move.blockId ? null : c))
        setHintMsg(null)
      }, 2800)
    } else {
      setHintMsg('No hay movimiento obvio — prueba reiniciar')
      window.setTimeout(() => setHintMsg(null), 2000)
    }
  }

  const startLevel = (id: number) => {
    playSfx('ui')
    setLevelId(Math.max(1, id))
    setScreen('play')
  }

  const getBlockStyleProps = (color: BlockColor): React.CSSProperties => {
    const c = COLOR_HEX[color] ?? COLOR_HEX.cyan
    switch (blockStyle) {
      case 'metallic':
        return {
          background: `linear-gradient(160deg, ${c.light} 0%, ${c.base} 38%, ${c.dark} 72%, #0e0e10 100%)`,
          boxShadow: `0 5px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -5px 12px rgba(0,0,0,0.4)`,
          border: '1px solid rgba(255,255,255,0.45)',
        }
      case 'matte':
        return {
          background: c.base,
          boxShadow: `0 2px 6px rgba(0,0,0,0.2)`,
          border: `2px solid ${c.dark}`,
          filter: 'saturate(0.92)',
        }
      case 'neon':
        return {
          background: `linear-gradient(135deg, ${c.light}, ${c.base})`,
          boxShadow: `0 0 10px ${c.glow}, 0 0 24px ${c.glow}, 0 0 40px ${c.glow}`,
          border: `2px solid ${c.light}`,
        }
      case 'pastel':
        return {
          background: `linear-gradient(180deg, #faf8f5 0%, ${c.light} 50%, ${c.base}88 100%)`,
          boxShadow: `0 3px 10px rgba(0,0,0,0.08)`,
          border: '1px solid rgba(0,0,0,0.06)',
          filter: 'saturate(0.75) brightness(1.05)',
        }
      case 'crystal':
        return {
          background: `linear-gradient(125deg, ${c.light}b0 0%, transparent 45%), linear-gradient(300deg, ${c.base}99, ${c.dark}66)`,
          boxShadow: `0 0 22px ${c.glow}, inset 0 0 16px rgba(255,255,255,0.3)`,
          border: `1px solid ${c.light}`,
        }
      case 'candy':
        return {
          background: `radial-gradient(circle at 30% 20%, #ffffff 0%, ${c.light} 25%, ${c.base} 65%, ${c.dark} 100%)`,
          boxShadow: `0 8px 18px rgba(0,0,0,0.3), inset 0 4px 8px rgba(255,255,255,0.7), inset 0 -4px 10px rgba(0,0,0,0.2)`,
          border: '2px solid rgba(255,255,255,0.55)',
        }
      case 'obsidian':
        return {
          background: `linear-gradient(155deg, #2c2c34 0%, #0c0c10 55%, #050508 100%)`,
          boxShadow: `0 6px 18px rgba(0,0,0,0.65), inset 0 0 14px ${c.glow}`,
          border: `1px solid ${c.base}77`,
        }
      default:
        return {
          background: `linear-gradient(155deg, rgba(255,255,255,0.55) 0%, ${c.light}cc 25%, ${c.base} 70%, ${c.dark} 100%)`,
          boxShadow: `0 6px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -3px 10px rgba(0,0,0,0.1)`,
          border: '1px solid rgba(255,255,255,0.5)',
          backdropFilter: 'blur(4px)',
        }
    }
  }

  const renderExit = (e: Exit) => {
    const c = COLOR_HEX[e.color] ?? COLOR_HEX.cyan
    const style: React.CSSProperties = {
      position: 'absolute',
      background: `linear-gradient(135deg, ${c.light}, ${c.base})`,
      boxShadow: `0 0 16px ${c.glow}`,
      borderRadius: 5,
      opacity: 0.95,
      zIndex: 2,
      pointerEvents: 'none',
    }
    const gap = 2
    if (e.side === 'top') {
      style.top = -14
      style.left = e.pos * BASE_CELL + gap
      style.width = Math.max(10, e.length * BASE_CELL - gap * 2)
      style.height = 14
    } else if (e.side === 'bottom') {
      style.bottom = -14
      style.left = e.pos * BASE_CELL + gap
      style.width = Math.max(10, e.length * BASE_CELL - gap * 2)
      style.height = 14
    } else if (e.side === 'left') {
      style.left = -14
      style.top = e.pos * BASE_CELL + gap
      style.width = 14
      style.height = Math.max(10, e.length * BASE_CELL - gap * 2)
    } else {
      style.right = -14
      style.top = e.pos * BASE_CELL + gap
      style.width = 14
      style.height = Math.max(10, e.length * BASE_CELL - gap * 2)
    }
    return <div key={e.id} style={style} aria-hidden />
  }

  const TipsModal = showTips ? (
    <div className="modal-overlay" onClick={() => setShowTips(false)}>
      <motion.div
        className="modal-panel glass-card bc-win-panel"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="bc-win-title">Consejos</h2>
        <p className="bc-tip-text">{PRO_TIPS[tipIndex] ?? PRO_TIPS[0]}</p>
        <div className="bc-tip-actions">
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => setTipIndex((i) => (i + 1) % PRO_TIPS.length)}
          >
            Siguiente consejo
          </button>
          <button type="button" className="glass-button" onClick={() => setShowTips(false)}>
            Volver al juego
          </button>
        </div>
      </motion.div>
    </div>
  ) : null

  // ==================== HUB ====================
  if (screen === 'hub') {
    return (
      <div className="app-shell bc-root">
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
            <span className="bc-level-badge">
              Nivel {levelId} · {level.tierLabel}
            </span>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-hub glass-card">
          <p className="bc-hub-lead">
            Desliza cada bloque hasta la <strong>pared de su color</strong>. Solo allí desaparece.
            Sin soltar puedes cambiar de eje (horizontal ↔ vertical). El reloj siempre corre:
            resuelve antes de que se agote.
          </p>
          <div className="bc-hub-grid">
            <button
              type="button"
              className="glass-button bc-hub-primary"
              onClick={() => startLevel(levelId)}
            >
              Continuar · Nivel {levelId}
            </button>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                playSfx('ui')
                setScreen('levels')
              }}
            >
              Niveles
            </button>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                playSfx('ui')
                setScreen('settings')
              }}
            >
              Ajustes de partida
            </button>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                playSfx('ui')
                setScreen('styles')
              }}
            >
              Aspecto
            </button>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                playSfx('ui')
                setScreen('stats')
              }}
            >
              Progreso
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button
            type="button"
            className="glass-button secondary bc-back"
            onClick={() => setScreen('hub')}
          >
            ← Menú
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Ajustes de partida</h1>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-panel glass-card">
          {(
            [
              ['hardcore', 'Hardcore (sin deshacer)'],
              ['noHints', 'Sin pistas'],
              ['showExits', 'Mostrar salidas de color'],
              ['showPar', 'Mostrar par de movimientos'],
              ['showGhost', 'Mostrar rango de arrastre'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="bc-opt-row">
              <span>{label}</span>
              <label className="gco-switch">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) => {
                    const next = { ...options, [key]: e.target.checked }
                    setOptions(next)
                    writeJSON(LS.options, next)
                  }}
                />
                <span />
              </label>
            </label>
          ))}
          <p className="bc-settings-note">
            El límite de tiempo está siempre activo — forma parte del reto en todos los niveles.
          </p>
          <button
            type="button"
            className="glass-button"
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={() => startLevel(levelId)}
          >
            Empezar nivel {levelId}
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'levels') {
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    const bestM = readJSON<Record<number, number>>(LS.moves, {})
    const defeats = readJSON<Record<number, number>>(LS.defeats, {})
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button
            type="button"
            className="glass-button secondary bc-back"
            onClick={() => setScreen('hub')}
          >
            ← Menú
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Niveles</h1>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <p className="bc-levels-hint">Puedes volver a jugar cualquier nivel ya desbloqueado.</p>
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
                {'★'.repeat(scores[n] ?? 0)}
                {'☆'.repeat(3 - (scores[n] ?? 0))}
              </span>
              {bestM[n] != null && <span className="bc-level-meta mono">{bestM[n]} mov</span>}
              {(defeats[n] ?? 0) > 0 && (
                <span className="bc-level-meta mono defeats">{defeats[n]}×</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'styles') {
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button
            type="button"
            className="glass-button secondary bc-back"
            onClick={() => setScreen('hub')}
          >
            ← Menú
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Aspecto</h1>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-styles-grid">
          {BLOCK_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`bc-style-card glass-card ${blockStyle === s.id ? 'active' : ''}`}
              onClick={() => {
                setBlockStyle(s.id)
                writeJSON(LS.style, s.id)
                playSfx('ui')
              }}
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
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    return (
      <div className="app-shell bc-root">
        <style>{BC_STYLES}</style>
        <header className="bc-header">
          <button
            type="button"
            className="glass-button secondary bc-back"
            onClick={() => setScreen('hub')}
          >
            ← Menú
          </button>
          <div className="bc-title-wrap">
            <h1 className="bc-title">Progreso</h1>
          </div>
          <div className="bc-header-spacer" />
        </header>
        <div className="bc-panel glass-card">
          <div className="bc-stat-row">
            <span>Desbloqueados</span>
            <span className="mono">{unlocked}</span>
          </div>
          <div className="bc-stat-row">
            <span>Victorias</span>
            <span className="mono">{readJSON(LS.wins, 0)}</span>
          </div>
          <div className="bc-stat-row">
            <span>Derrotas</span>
            <span className="mono">
              {Object.values(readJSON<Record<number, number>>(LS.defeats, {})).reduce(
                (a, b) => a + b,
                0
              )}
            </span>
          </div>
          <div className="bc-stat-row">
            <span>Movimientos totales</span>
            <span className="mono">{readJSON(LS.totalMoves, 0)}</span>
          </div>
          <div className="bc-stat-row">
            <span>Niveles 3★</span>
            <span className="mono">
              {Object.values(scores).filter((s) => s === 3).length}
            </span>
          </div>
          <div className="bc-stat-row">
            <span>Racha / récord</span>
            <span className="mono">
              {readJSON(LS.streak, 0)} / {readJSON(LS.bestStreak, 0)}
            </span>
          </div>
          <div className="bc-stat-row">
            <span>Mejor combo</span>
            <span className="mono">×{readJSON(LS.bestCombo, 0)}</span>
          </div>
        </div>
      </div>
    )
  }

  // ==================== PLAY ====================
  const safeExits = Array.isArray(level.exits) ? level.exits : []
  const safeObstacles = Array.isArray(level.obstacles) ? level.obstacles : []
  const safeBlocks = Array.isArray(blocks) ? blocks : []
  const boardPixelW = level.cols * BASE_CELL
  const boardPixelH = level.rows * BASE_CELL

  // Ghost range mientras se arrastra (opcional)
  const ghostRange =
    options.showGhost && draggingId && dragRef.current?.axis
      ? (() => {
          const d = dragRef.current!
          const block = safeBlocks.find((b) => b.id === draggingId)
          if (!block) return null
          return { axis: d.axis!, min: d.min, max: d.max, baseRow: d.baseRow, baseCol: d.baseCol, block }
        })()
      : null

  return (
    <div className="app-shell bc-root">
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
          ← Menú
        </button>
        <div className="bc-title-wrap">
          <h1 className="bc-title">Block Cleaner</h1>
          <span className="bc-level-badge">
            Nivel {levelId} · {level.tierLabel}
          </span>
        </div>
        <div className="bc-header-spacer" />
      </header>

      <motion.div
        className="glass-card bc-board-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="bc-board-viewport"
          ref={viewportRef}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
        >
          <div
            className="bc-board"
            style={{
              width: boardPixelW,
              height: boardPixelH,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Cuadrícula que cubre TODO el tablero */}
            <div
              className="bc-grid"
              style={{
                gridTemplateColumns: `repeat(${level.cols}, ${BASE_CELL}px)`,
                gridTemplateRows: `repeat(${level.rows}, ${BASE_CELL}px)`,
                width: boardPixelW,
                height: boardPixelH,
              }}
            >
              {Array.from({ length: Math.max(1, level.rows * level.cols) }).map((_, i) => (
                <div key={i} className="bc-cell" />
              ))}
            </div>

            {safeObstacles.map((o) => (
              <div
                key={o.id}
                className="bc-obstacle"
                style={{
                  width: BASE_CELL,
                  height: BASE_CELL,
                  transform: `translate(${o.col * BASE_CELL}px, ${o.row * BASE_CELL}px)`,
                }}
              />
            ))}

            {options.showExits && safeExits.map(renderExit)}

            {/* Ghost de rango de arrastre */}
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
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                )
              })}
            </AnimatePresence>

            <AnimatePresence>
              {safeBlocks.map((b) => {
                const isDragging = draggingId === b.id
                const isExiting = exitingId === b.id
                const row = isDragging && dragRow != null ? dragRow : b.row
                const col = isDragging && dragCol != null ? dragCol : b.col
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
                      ? 16
                      : -16
                    : exitVec.dy > 0
                      ? 9
                      : -9
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
                      scale: isExiting ? 0.12 : isDragging ? 1.04 : 1,
                      opacity: isExiting ? 0 : locked ? 0.48 : 1,
                      rotate: rotateOut,
                    }}
                    transition={
                      isDragging
                        ? { duration: 0 }
                        : isExiting
                          ? { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
                          : { type: 'spring', stiffness: 420, damping: 32, mass: 0.85 }
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
            <button
              type="button"
              className="icon-btn bc-zoom-btn"
              aria-label="Alejar"
              onClick={() => zoomBy(-0.16)}
            >
              −
            </button>
            <button
              type="button"
              className="icon-btn bc-zoom-btn"
              aria-label="Ajustar al viewport"
              onClick={resetZoom}
            >
              ⤢
            </button>
            <button
              type="button"
              className="icon-btn bc-zoom-btn"
              aria-label="Acercar"
              onClick={() => zoomBy(0.16)}
            >
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
.bc-opt-row { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 0; border-bottom: 1px solid var(--gco-hairline); font-size: 0.92rem; }
.bc-settings-note { font-size: 0.75rem; color: var(--gco-ink-muted); margin-top: 0.9rem; line-height: 1.4; }
.bc-tip-text { font-size: 1rem; line-height: 1.55; margin-bottom: 1.3rem; }
.bc-tip-actions { display: flex; flex-direction: column; gap: 0.55rem; }
.bc-stat-row { display: flex; justify-content: space-between; padding: 0.65rem 0; border-bottom: 1px solid var(--gco-hairline); font-size: 0.9rem; }
.bc-stat-row:last-child { border-bottom: none; }
.bc-levels-hint { text-align: center; color: var(--gco-ink-muted); font-size: 0.85rem; margin-bottom: 0.9rem; }
.bc-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 0.65rem; }
.bc-level-btn { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.8rem 0.4rem; cursor: pointer; border: 1px solid var(--gco-glass-border); background: var(--gco-glass-bg); color: var(--gco-ink); }
.bc-level-btn.active, .bc-level-btn:hover { border-color: var(--gco-primary); background: var(--gco-primary-dim); }
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