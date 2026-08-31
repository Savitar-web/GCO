// =============================================================================
// Generatelevelbc.ts — Block Cleaner · Color Block Jam style engine (v11.1)
//
// REGLAS DE MOVIMIENTO (Color Block Jam):
// - Solo ortogonal: horizontal O vertical, NUNCA diagonal.
// - La pieza no atraviesa otras piezas ni obstáculos.
// - La pieza no se solapa con otras.
// - Rangos de deslizamiento calculados celda a celda hasta colisión.
//
// MODELO DE PIEZAS:
// - Rectángulos reales w × h (1×1, 2×1, 2×2, 3×2, 4×2, 3×3, …).
// - Varias piezas del mismo color con distintos tamaños.
// - Salida del color dimensionada por la pieza más grande de ese color.
//
// GENERACIÓN:
// 1) Planificar formas y colores.
// 2) Colocar salidas compatibles (lado preferido por forma dominante).
// 3) Obstáculos lejos de puertas.
// 4) Colocar piezas cerca de su salida (casi resuelto).
// 5) Scramble solo con movimientos ortogonales legales.
// 6) Empujar piezas que arrancan listas para salir.
// 7) Validar con solver BFS (niveles pequeños/medios obligatorios).
// 8) Reintentar semillas hasta obtener nivel válido.
//
// API pública estable para BlockCleaner.tsx.
// =============================================================================

export type BlockColor =
  | 'cyan' | 'blue' | 'violet' | 'orange' | 'pink' | 'yellow' | 'green' | 'red'
  | 'lime' | 'teal' | 'magenta' | 'amber' | 'indigo' | 'rose' | 'sky' | 'coral'

export const BLOCK_COLOR_ORDER: BlockColor[] = [
  'cyan', 'blue', 'violet', 'orange', 'pink', 'yellow', 'green', 'red',
  'lime', 'teal', 'magenta', 'amber', 'indigo', 'rose', 'sky', 'coral',
]

export type Direction = 'up' | 'down' | 'left' | 'right'
export type AxisLock = 'horizontal' | 'vertical'
export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Axis = 'horizontal' | 'vertical'

/** Pieza rectangular real (no solo barra length + orientation). */
export interface Block {
  id: string
  color: BlockColor
  row: number
  col: number
  /** Ancho en celdas. */
  w: number
  /** Alto en celdas. */
  h: number
  /** Compatibilidad con código legado. */
  length?: number
  orientation?: 'horizontal' | 'vertical'
  axisLock?: AxisLock
  forcedDir?: Direction
  lockedUntilClears?: number
}

export interface Exit {
  id: string
  color: BlockColor
  side: Side
  /** Índice de inicio sobre el borde. */
  pos: number
  /** Longitud de la abertura en celdas. */
  length: number
}

export interface Obstacle {
  id: string
  row: number
  col: number
}

export interface BlockCleanerLevel {
  id: number
  rows: number
  cols: number
  blocks: Block[]
  exits: Exit[]
  obstacles: Obstacle[]
  timeLimit: number
  difficulty: number
  parMoves: number
  seed: number
  tierLabel: string
}

export interface Move {
  blockId: string
  toRow: number
  toCol: number
  isExit?: boolean
}

// -----------------------------------------------------------------------------
// RNG determinista (Mulberry32) — misma semilla = mismo nivel
// -----------------------------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed | 0
  return function random() {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickInt(rng: () => number, min: number, max: number) {
  if (max < min) return min
  return min + Math.floor(rng() * (max - min + 1))
}

function pickItem<T>(rng: () => number, arr: T[]): T {
  if (!arr.length) throw new Error('pickItem: empty array')
  return arr[Math.floor(rng() * arr.length)]
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// -----------------------------------------------------------------------------
// Geometría de piezas
// -----------------------------------------------------------------------------

/**
 * Normaliza w/h y rellena length/orientation para compatibilidad.
 */
export function normalizeBlock(b: Block): Block {
  let w = b.w
  let h = b.h
  if ((!w || !h) && b.length) {
    if (b.orientation === 'vertical') {
      w = 1
      h = b.length
    } else {
      w = b.length
      h = 1
    }
  }
  w = Math.max(1, Math.floor(w || 1))
  h = Math.max(1, Math.floor(h || 1))
  return {
    ...b,
    w,
    h,
    length: Math.max(w, h),
    orientation: w >= h ? 'horizontal' : 'vertical',
  }
}

export function blockWidth(b: Pick<Block, 'w' | 'h' | 'length' | 'orientation'>): number {
  if (b.w != null && b.w > 0) return b.w
  return b.orientation === 'vertical' ? 1 : (b.length ?? 1)
}

export function blockHeight(b: Pick<Block, 'w' | 'h' | 'length' | 'orientation'>): number {
  if (b.h != null && b.h > 0) return b.h
  return b.orientation === 'horizontal' ? 1 : (b.length ?? 1)
}

/** Todas las celdas ocupadas por la pieza. */
export function blockCells(
  b: Pick<Block, 'row' | 'col' | 'w' | 'h' | 'length' | 'orientation'>
): [number, number][] {
  const w = blockWidth(b)
  const h = blockHeight(b)
  const out: [number, number][] = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      out.push([b.row + r, b.col + c])
    }
  }
  return out
}

function cellKey(r: number, c: number) {
  return `${r}:${c}`
}

export function buildOccupancy(
  blocks: Block[],
  obstacles: Obstacle[],
  excludeId?: string
): Set<string> {
  const set = new Set<string>()
  for (const o of obstacles) set.add(cellKey(o.row, o.col))
  for (const b of blocks) {
    if (b.id === excludeId) continue
    for (const [r, c] of blockCells(b)) set.add(cellKey(r, c))
  }
  return set
}

export function isBlockMovable(block: Block, clearedCount: number): boolean {
  if (block.lockedUntilClears != null && clearedCount < block.lockedUntilClears) {
    return false
  }
  return true
}

/** Huella proyectada sobre el lado de la puerta. */
export function footprintAlongSide(
  b: Pick<Block, 'w' | 'h' | 'length' | 'orientation'>,
  side: Side
): number {
  if (side === 'left' || side === 'right') return blockHeight(b)
  return blockWidth(b)
}

/**
 * ¿Cabe la pieza en (row,col) sin solaparse ni salirse del tablero?
 */
export function canPlace(
  block: Pick<Block, 'w' | 'h' | 'length' | 'orientation'>,
  row: number,
  col: number,
  rows: number,
  cols: number,
  occupied: Set<string>
): boolean {
  const w = blockWidth(block)
  const h = blockHeight(block)
  if (row < 0 || col < 0 || row + h > rows || col + w > cols) return false
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (occupied.has(cellKey(row + r, col + c))) return false
    }
  }
  return true
}

// -----------------------------------------------------------------------------
// Rangos de deslizamiento ORTOGONALES (sin diagonal)
// -----------------------------------------------------------------------------

/**
 * Calcula [min, max] alcanzables en UN solo eje, con la otra coordenada fija.
 * Avanza celda a celda hasta chocar con borde, obstáculo u otra pieza.
 * Es la base del drag fluido sin saltos y sin atravesar.
 */
export function computeSlideRangeOnAxis(
  block: Block,
  axis: Axis,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): { min: number; max: number } {
  const w = blockWidth(block)
  const h = blockHeight(block)
  const cur = axis === 'horizontal' ? block.col : block.row

  if (!isBlockMovable(block, clearedCount)) {
    return { min: cur, max: cur }
  }
  if (block.axisLock && block.axisLock !== axis) {
    return { min: cur, max: cur }
  }
  if (block.forcedDir) {
    const ok =
      (axis === 'horizontal' && (block.forcedDir === 'left' || block.forcedDir === 'right')) ||
      (axis === 'vertical' && (block.forcedDir === 'up' || block.forcedDir === 'down'))
    if (!ok) return { min: cur, max: cur }
  }

  const occ = buildOccupancy(blocks, obstacles, block.id)
  const boardLimit = axis === 'horizontal' ? cols - w : rows - h

  let min = cur
  let max = cur

  const canDec =
    !block.forcedDir ||
    (axis === 'horizontal' && block.forcedDir === 'left') ||
    (axis === 'vertical' && block.forcedDir === 'up')
  const canInc =
    !block.forcedDir ||
    (axis === 'horizontal' && block.forcedDir === 'right') ||
    (axis === 'vertical' && block.forcedDir === 'down')

  if (canDec) {
    while (min > 0) {
      const next = min - 1
      let blocked = false
      if (axis === 'horizontal') {
        for (let r = 0; r < h; r++) {
          if (occ.has(cellKey(block.row + r, next))) {
            blocked = true
            break
          }
        }
      } else {
        for (let c = 0; c < w; c++) {
          if (occ.has(cellKey(next, block.col + c))) {
            blocked = true
            break
          }
        }
      }
      if (blocked) break
      min = next
    }
  }

  if (canInc) {
    while (max < boardLimit) {
      const next = max + 1
      let blocked = false
      if (axis === 'horizontal') {
        for (let r = 0; r < h; r++) {
          if (occ.has(cellKey(block.row + r, next + w - 1))) {
            blocked = true
            break
          }
        }
      } else {
        for (let c = 0; c < w; c++) {
          if (occ.has(cellKey(next + h - 1, block.col + c))) {
            blocked = true
            break
          }
        }
      }
      if (blocked) break
      max = next
    }
  }

  return { min, max }
}

/**
 * Rangos H y V independientes (el cliente elige UN eje por gesto).
 */
export function computeFreeSlideRanges(
  block: Block,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
  const hRange = computeSlideRangeOnAxis(
    block, 'horizontal', blocks, obstacles, rows, cols, clearedCount
  )
  const vRange = computeSlideRangeOnAxis(
    block, 'vertical', blocks, obstacles, rows, cols, clearedCount
  )
  return {
    minRow: vRange.min,
    maxRow: vRange.max,
    minCol: hRange.min,
    maxCol: hRange.max,
  }
}

export function computeSlideRange(
  block: Block,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 999
): { min: number; max: number } {
  const axis: Axis = blockWidth(block) >= blockHeight(block) ? 'horizontal' : 'vertical'
  return computeSlideRangeOnAxis(block, axis, blocks, obstacles, rows, cols, clearedCount)
}

/**
 * Posición visual continua EN UN SOLO EJE (sin diagonal).
 * El otro eje permanece fijo en origin.
 */
export function computeAxisDragPosition(
  axis: Axis,
  originRow: number,
  originCol: number,
  deltaCells: number,
  range: { min: number; max: number }
): { row: number; col: number } {
  if (axis === 'horizontal') {
    return {
      row: originRow,
      col: clampNum(originCol + deltaCells, range.min, range.max),
    }
  }
  return {
    row: clampNum(originRow + deltaCells, range.min, range.max),
    col: originCol,
  }
}

/**
 * Elige eje dominante. Si ya hay eje activo, solo cambia si el otro
 * domina claramente (evita vibración entre ejes).
 */
export function preferredAxisFromDelta(
  dx: number,
  dy: number,
  currentAxis: Axis | null,
  threshold = 4
): Axis | null {
  if (currentAxis) {
    if (currentAxis === 'horizontal') {
      if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dy) > threshold) return 'vertical'
      return 'horizontal'
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.4 && Math.abs(dx) > threshold) return 'horizontal'
    return 'vertical'
  }
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical'
}

/** Compat API: target en un eje. */
export function computeDragTarget(
  block: Block,
  axis: Axis,
  baseRow: number,
  baseCol: number,
  deltaCells: number,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): { row: number; col: number } {
  const virtual: Block = { ...block, row: baseRow, col: baseCol }
  const range = computeSlideRangeOnAxis(
    virtual, axis, blocks, obstacles, rows, cols, clearedCount
  )
  return computeAxisDragPosition(axis, baseRow, baseCol, deltaCells, range)
}

/**
 * Compat: posición continua forzando ortogonal (eje dominante).
 * No mueve en diagonal aunque delta tenga ambos componentes.
 */
export function computeContinuousDragPosition(
  originRow: number,
  originCol: number,
  deltaRow: number,
  deltaCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number }
): { row: number; col: number } {
  if (Math.abs(deltaCol) >= Math.abs(deltaRow)) {
    return {
      row: originRow,
      col: clampNum(originCol + deltaCol, ranges.minCol, ranges.maxCol),
    }
  }
  return {
    row: clampNum(originRow + deltaRow, ranges.minRow, ranges.maxRow),
    col: originCol,
  }
}

export function snapToGrid(
  visualRow: number,
  visualCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number }
): { row: number; col: number } {
  return {
    row: clampNum(Math.round(visualRow), ranges.minRow, ranges.maxRow),
    col: clampNum(Math.round(visualCol), ranges.minCol, ranges.maxCol),
  }
}

export function listReachablePositionsOnAxis(
  block: Block,
  axis: Axis,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): number[] {
  const { min, max } = computeSlideRangeOnAxis(
    block, axis, blocks, obstacles, rows, cols, clearedCount
  )
  const out: number[] = []
  for (let v = min; v <= max; v++) out.push(v)
  return out
}

// -----------------------------------------------------------------------------
// Salidas y alineación
// -----------------------------------------------------------------------------

function isAlignedWithExit(
  block: Block,
  exit: Exit,
  rows: number,
  cols: number
): boolean {
  const w = blockWidth(block)
  const h = blockHeight(block)
  const minR = block.row
  const maxR = block.row + h - 1
  const minC = block.col
  const maxC = block.col + w - 1

  if (exit.side === 'left') {
    return minC === 0 && minR >= exit.pos && maxR <= exit.pos + exit.length - 1
  }
  if (exit.side === 'right') {
    return maxC === cols - 1 && minR >= exit.pos && maxR <= exit.pos + exit.length - 1
  }
  if (exit.side === 'top') {
    return minR === 0 && minC >= exit.pos && maxC <= exit.pos + exit.length - 1
  }
  if (exit.side === 'bottom') {
    return maxR === rows - 1 && minC >= exit.pos && maxC <= exit.pos + exit.length - 1
  }
  return false
}

export function canExit(
  block: Block,
  exit: Exit,
  _blocks: Block[],
  _obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 999
): boolean {
  if (block.color !== exit.color) return false
  if (!isBlockMovable(block, clearedCount)) return false
  if (footprintAlongSide(block, exit.side) > exit.length) return false
  return isAlignedWithExit(block, exit, rows, cols)
}

export function getExitableBlocks(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 999
): string[] {
  const result: string[] = []
  if (!Array.isArray(blocks) || !Array.isArray(exits)) return result
  for (const b of blocks) {
    for (const e of exits) {
      if (canExit(b, e, blocks, obstacles, rows, cols, clearedCount)) {
        result.push(b.id)
        break
      }
    }
  }
  return result
}

export function isSolved(blocks: Block[]): boolean {
  return !Array.isArray(blocks) || blocks.length === 0
}

export const isLevelSolved = isSolved

// -----------------------------------------------------------------------------
// Nivel de respaldo (siempre válido y jugable)
// -----------------------------------------------------------------------------
export const FALLBACK_LEVEL: BlockCleanerLevel = {
  id: 1,
  rows: 5,
  cols: 5,
  blocks: (
    [
      { id: 'b1', color: 'cyan', row: 2, col: 1, w: 2, h: 1 },
      { id: 'b2', color: 'orange', row: 0, col: 3, w: 1, h: 2 },
      { id: 'b3', color: 'violet', row: 3, col: 0, w: 1, h: 1 },
      { id: 'b4', color: 'cyan', row: 1, col: 0, w: 1, h: 1 },
    ] as Block[]
  ).map(normalizeBlock),
  exits: [
    { id: 'e1', color: 'cyan', side: 'right', pos: 1, length: 2 },
    { id: 'e2', color: 'orange', side: 'bottom', pos: 3, length: 1 },
    { id: 'e3', color: 'violet', side: 'left', pos: 3, length: 1 },
  ],
  obstacles: [],
  timeLimit: 180,
  difficulty: 1,
  parMoves: 6,
  seed: 1,
  tierLabel: 'Tutorial',
}

// -----------------------------------------------------------------------------
// Dificultad + formas
// -----------------------------------------------------------------------------
export interface DifficultyTierConfig {
  rows: number
  cols: number
  numBlocks: number
  numColors: number
  obstacleCount: number
  maxDim: number
  allowSquares: boolean
  scrambleMoves: number
  axisLockChance: number
  lockedChance: number
  lockedClearsMin: number
  lockedClearsMax: number
  timeLimitBase: number
  label: string
}

/** Catálogo de formas según tier. */
function shapesForTier(tier: DifficultyTierConfig): Array<{ w: number; h: number }> {
  const shapes: Array<{ w: number; h: number }> = [
    { w: 1, h: 1 },
    { w: 2, h: 1 },
    { w: 1, h: 2 },
  ]
  if (tier.maxDim >= 2 && tier.allowSquares) shapes.push({ w: 2, h: 2 })
  if (tier.maxDim >= 3) {
    shapes.push({ w: 3, h: 1 }, { w: 1, h: 3 })
    if (tier.allowSquares) shapes.push({ w: 3, h: 2 }, { w: 2, h: 3 })
  }
  if (tier.maxDim >= 4) {
    shapes.push({ w: 4, h: 1 }, { w: 1, h: 4 })
    if (tier.allowSquares) {
      shapes.push({ w: 4, h: 2 }, { w: 2, h: 4 }, { w: 3, h: 3 })
    }
  }
  return shapes
}

/**
 * Escala de dificultad progresiva.
 * Tableros más grandes, más piezas, formas variadas, candados y ejes.
 */
export function getDifficultyTier(level: number): DifficultyTierConfig {
  const L = Math.max(1, level)
  const decade = Math.floor((L - 1) / 10)

  if (L <= 3) {
    return {
      rows: 5, cols: 5, numBlocks: 3, numColors: 3, obstacleCount: 0,
      maxDim: 2, allowSquares: false, scrambleMoves: 12, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 200, label: 'Tutorial',
    }
  }
  if (L <= 6) {
    return {
      rows: 5, cols: 6, numBlocks: 4, numColors: 3, obstacleCount: 0,
      maxDim: 2, allowSquares: false, scrambleMoves: 16, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 180, label: 'Tutorial+',
    }
  }
  if (L <= 10) {
    return {
      rows: 6, cols: 6, numBlocks: 5, numColors: 3, obstacleCount: 0,
      maxDim: 2, allowSquares: true, scrambleMoves: 20, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 160, label: 'Principiante',
    }
  }
  if (L <= 16) {
    return {
      rows: 6, cols: 7, numBlocks: 7, numColors: 4, obstacleCount: 1,
      maxDim: 3, allowSquares: true, scrambleMoves: 26, axisLockChance: 0.04,
      lockedChance: 0.05, lockedClearsMin: 1, lockedClearsMax: 2,
      timeLimitBase: 150, label: 'Principiante+',
    }
  }
  if (L <= 25) {
    return {
      rows: 7, cols: 7, numBlocks: 8, numColors: 4, obstacleCount: 2,
      maxDim: 3, allowSquares: true, scrambleMoves: 32, axisLockChance: 0.08,
      lockedChance: 0.1, lockedClearsMin: 1, lockedClearsMax: 2,
      timeLimitBase: 140, label: 'Intermedio',
    }
  }
  if (L <= 40) {
    return {
      rows: 8, cols: 8, numBlocks: 10, numColors: 5, obstacleCount: 2,
      maxDim: 3, allowSquares: true, scrambleMoves: 38, axisLockChance: 0.12,
      lockedChance: 0.12, lockedClearsMin: 1, lockedClearsMax: 3,
      timeLimitBase: 130, label: 'Intermedio+',
    }
  }
  if (L <= 60) {
    return {
      rows: 9, cols: 9, numBlocks: 12, numColors: 5, obstacleCount: 3,
      maxDim: 4, allowSquares: true, scrambleMoves: 44, axisLockChance: 0.15,
      lockedChance: 0.15, lockedClearsMin: 1, lockedClearsMax: 3,
      timeLimitBase: 120, label: 'Avanzado',
    }
  }
  if (L <= 80) {
    return {
      rows: 10, cols: 10, numBlocks: 14, numColors: 6, obstacleCount: 4,
      maxDim: 4, allowSquares: true, scrambleMoves: 52, axisLockChance: 0.18,
      lockedChance: 0.18, lockedClearsMin: 1, lockedClearsMax: 4,
      timeLimitBase: 110, label: 'Experto',
    }
  }
  if (L <= 100) {
    return {
      rows: 11, cols: 11, numBlocks: 16, numColors: 6, obstacleCount: 5,
      maxDim: 4, allowSquares: true, scrambleMoves: 60, axisLockChance: 0.2,
      lockedChance: 0.2, lockedClearsMin: 1, lockedClearsMax: 5,
      timeLimitBase: 100, label: 'Maestro',
    }
  }

  const rows = clampNum(11 + Math.floor((decade - 10) * 0.35), 11, 14)
  return {
    rows,
    cols: rows,
    numBlocks: clampNum(16 + Math.floor((decade - 10) * 1.1), 16, 22),
    numColors: clampNum(6 + Math.floor((decade - 10) / 3), 6, BLOCK_COLOR_ORDER.length),
    obstacleCount: clampNum(5 + Math.floor((decade - 10) * 0.6), 5, 12),
    maxDim: 4,
    allowSquares: true,
    scrambleMoves: clampNum(60 + (decade - 10) * 3, 60, 85),
    axisLockChance: clampNum(0.2 + (decade - 10) * 0.015, 0.2, 0.35),
    lockedChance: clampNum(0.2 + (decade - 10) * 0.015, 0.2, 0.32),
    lockedClearsMin: 1,
    lockedClearsMax: clampNum(5 + Math.floor((decade - 10) / 2), 5, 7),
    timeLimitBase: clampNum(100 - (decade - 10) * 3, 55, 100),
    label: decade < 14 ? 'Maestro+' : 'Infinito',
  }
}

// -----------------------------------------------------------------------------
// Generación (resuelto → scramble legal → solver)
// -----------------------------------------------------------------------------

function tryPlaceNearExit(
  shape: { w: number; h: number },
  exit: Exit,
  depth: number,
  rows: number,
  cols: number,
  occupied: Set<string>,
  rng: () => number
): { row: number; col: number } | null {
  const { w, h } = shape
  let fixedRow: number | null = null
  let fixedCol: number | null = null
  let minStart: number
  let maxStart: number
  let alongRows: boolean

  if (exit.side === 'left' || exit.side === 'right') {
    fixedCol = exit.side === 'left' ? depth : cols - w - depth
    if (fixedCol < 0 || fixedCol + w > cols) return null
    minStart = Math.max(exit.pos, 0)
    maxStart = Math.min(exit.pos + exit.length - h, rows - h)
    alongRows = true
  } else {
    fixedRow = exit.side === 'top' ? depth : rows - h - depth
    if (fixedRow < 0 || fixedRow + h > rows) return null
    minStart = Math.max(exit.pos, 0)
    maxStart = Math.min(exit.pos + exit.length - w, cols - w)
    alongRows = false
  }
  if (maxStart < minStart) return null

  const candidates: number[] = []
  for (let v = minStart; v <= maxStart; v++) candidates.push(v)

  for (const v of shuffle(rng, candidates)) {
    const row = alongRows ? v : (fixedRow as number)
    const col = alongRows ? (fixedCol as number) : v
    if (canPlace(shape, row, col, rows, cols, occupied)) return { row, col }
  }
  return null
}

function countUnlockedExitable(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): number {
  let n = 0
  for (const b of blocks) {
    if (b.lockedUntilClears) continue
    for (const e of exits) {
      if (canExit(b, e, blocks, obstacles, rows, cols, 999)) {
        n++
        break
      }
    }
  }
  return n
}

function nudgeBlock(
  blocks: Block[],
  blockId: string,
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  rng: () => number
): Block[] {
  const block = blocks.find((b) => b.id === blockId)
  if (!block) return blocks
  const options: Array<{ row: number; col: number }> = []
  for (const axis of ['horizontal', 'vertical'] as Axis[]) {
    const range = computeSlideRangeOnAxis(block, axis, blocks, obstacles, rows, cols, 999)
    for (let v = range.min; v <= range.max; v++) {
      if (axis === 'horizontal' && v !== block.col) options.push({ row: block.row, col: v })
      if (axis === 'vertical' && v !== block.row) options.push({ row: v, col: block.col })
    }
  }
  if (!options.length) return blocks
  const target = pickItem(rng, options)
  return blocks.map((b) =>
    b.id === blockId ? normalizeBlock({ ...b, row: target.row, col: target.col }) : b
  )
}

function generateLevelOnce(
  safeId: number,
  tier: DifficultyTierConfig,
  seed: number
): BlockCleanerLevel | null {
  const rng = mulberry32(seed)
  const { rows, cols } = tier
  const colors = BLOCK_COLOR_ORDER.slice(0, Math.max(2, tier.numColors))
  const shapes = shapesForTier(tier)
  const sides: Side[] = ['top', 'bottom', 'left', 'right']

  type Planned = { color: BlockColor; w: number; h: number }
  const planned: Planned[] = []
  for (let i = 0; i < tier.numBlocks; i++) {
    const color = pickItem(rng, colors)
    const shape = pickItem(rng, shapes)
    if (shape.w > cols - 1 || shape.h > rows - 1) {
      planned.push({ color, w: 1, h: 1 })
    } else {
      planned.push({ color, w: shape.w, h: shape.h })
    }
  }

  const usedColors = Array.from(new Set(planned.map((p) => p.color)))
  const exits: Exit[] = []
  const usedSlots: Array<{ side: Side; pos: number; length: number }> = []

  const placeExit = (color: BlockColor, preferred: Side): boolean => {
    const same = planned.filter((p) => p.color === color)
    const need = Math.max(1, ...same.map((p) => footprintAlongSide(p, preferred)))
    const boundaryLen = preferred === 'top' || preferred === 'bottom' ? cols : rows
    const length = Math.min(need, boundaryLen)
    for (let attempt = 0; attempt < 120; attempt++) {
      const pos = pickInt(rng, 0, Math.max(0, boundaryLen - length))
      const overlap = usedSlots.some(
        (u) => u.side === preferred && pos < u.pos + u.length && pos + length > u.pos
      )
      if (overlap) continue
      exits.push({ id: `e${exits.length + 1}`, color, side: preferred, pos, length })
      usedSlots.push({ side: preferred, pos, length })
      return true
    }
    return false
  }

  for (const color of usedColors) {
    const same = planned.filter((p) => p.color === color)
    const avgW = same.reduce((s, p) => s + p.w, 0) / same.length
    const avgH = same.reduce((s, p) => s + p.h, 0) / same.length
    const preferredOrder: Side[] =
      avgW >= avgH
        ? shuffle(rng, ['left', 'right'] as Side[]).concat(shuffle(rng, ['top', 'bottom'] as Side[]))
        : shuffle(rng, ['top', 'bottom'] as Side[]).concat(shuffle(rng, ['left', 'right'] as Side[]))

    let placed = false
    for (const side of preferredOrder) {
      if (placeExit(color, side)) {
        placed = true
        break
      }
    }
    if (!placed) {
      for (const side of sides) {
        const same2 = planned.filter((p) => p.color === color)
        const need = Math.max(1, ...same2.map((p) => footprintAlongSide(p, side)))
        const boundaryLen = side === 'top' || side === 'bottom' ? cols : rows
        const length = Math.min(need, boundaryLen)
        const overlap = usedSlots.some(
          (u) => u.side === side && 0 < u.pos + u.length && length > u.pos
        )
        if (overlap) continue
        exits.push({ id: `e${exits.length + 1}`, color, side, pos: 0, length })
        usedSlots.push({ side, pos: 0, length })
        break
      }
    }
  }

  const colorExit = new Map<BlockColor, Exit>()
  for (const e of exits) colorExit.set(e.color, e)
  if (colorExit.size === 0) return null

  // Obstáculos: nunca en el borde de una puerta
  const occupied = new Set<string>()
  const obstacles: Obstacle[] = []
  for (let i = 0; i < tier.obstacleCount && rows > 2 && cols > 2; i++) {
    let attempts = 0
    while (attempts < 80) {
      attempts++
      const row = pickInt(rng, 1, rows - 2)
      const col = pickInt(rng, 1, cols - 2)
      if (occupied.has(cellKey(row, col))) continue
      let nearExit = false
      for (const e of exits) {
        if (e.side === 'left' && col === 0 && row >= e.pos && row < e.pos + e.length) nearExit = true
        if (e.side === 'right' && col === cols - 1 && row >= e.pos && row < e.pos + e.length) nearExit = true
        if (e.side === 'top' && row === 0 && col >= e.pos && col < e.pos + e.length) nearExit = true
        if (e.side === 'bottom' && row === rows - 1 && col >= e.pos && col < e.pos + e.length) nearExit = true
      }
      if (nearExit) continue
      occupied.add(cellKey(row, col))
      obstacles.push({ id: `o${obstacles.length + 1}`, row, col })
      break
    }
  }

  const blocks: Block[] = []
  const byColor = new Map<BlockColor, Planned[]>()
  for (const p of planned) {
    if (!colorExit.has(p.color)) continue
    const arr = byColor.get(p.color) ?? []
    arr.push(p)
    byColor.set(p.color, arr)
  }

  for (const color of usedColors) {
    const queue = shuffle(rng, byColor.get(color) ?? [])
    const exit = colorExit.get(color)
    if (!exit) continue
    for (const p of queue) {
      const maxDepth =
        exit.side === 'left' || exit.side === 'right' ? cols - p.w : rows - p.h
      let origin: { row: number; col: number } | null = null
      for (let depth = 0; depth <= Math.max(0, maxDepth) && !origin; depth++) {
        origin = tryPlaceNearExit(p, exit, depth, rows, cols, occupied, rng)
      }
      if (!origin) {
        outer: for (let r = 0; r <= rows - p.h; r++) {
          for (let c = 0; c <= cols - p.w; c++) {
            if (canPlace(p, r, c, rows, cols, occupied)) {
              origin = { row: r, col: c }
              break outer
            }
          }
        }
      }
      if (!origin) continue

      for (let dr = 0; dr < p.h; dr++) {
        for (let dc = 0; dc < p.w; dc++) {
          occupied.add(cellKey(origin.row + dr, origin.col + dc))
        }
      }

      // axisLock / forcedDir derivados del lado de la puerta (siempre compatibles)
      let axisLock: AxisLock | undefined
      let forcedDir: Direction | undefined
      if (rng() < tier.axisLockChance) {
        if (exit.side === 'left' || exit.side === 'right') {
          axisLock = 'horizontal'
          if (rng() < 0.4) forcedDir = exit.side === 'left' ? 'left' : 'right'
        } else {
          axisLock = 'vertical'
          if (rng() < 0.4) forcedDir = exit.side === 'top' ? 'up' : 'down'
        }
      }

      blocks.push(
        normalizeBlock({
          id: `b${blocks.length + 1}`,
          color: p.color,
          row: origin.row,
          col: origin.col,
          w: p.w,
          h: p.h,
          axisLock,
          forcedDir,
        })
      )
    }
  }

  if (blocks.length < 2) return null

  // Candados con precedentes garantizados
  const n = blocks.length
  for (let i = 0; i < n; i++) {
    const guaranteed = n - 1 - i
    if (
      tier.lockedChance > 0 &&
      guaranteed >= tier.lockedClearsMin &&
      rng() < tier.lockedChance
    ) {
      const maxLock = Math.min(tier.lockedClearsMax, guaranteed)
      blocks[i].lockedUntilClears = pickInt(rng, tier.lockedClearsMin, maxLock)
    }
  }

  // Scramble solo con movimientos ortogonales legales
  let current = blocks.map((b) => ({ ...b }))
  let lastId: string | null = null
  for (let step = 0; step < tier.scrambleMoves; step++) {
    const pool = current.filter((b) => !b.lockedUntilClears && b.id !== lastId)
    const candidates = pool.length ? pool : current.filter((b) => !b.lockedUntilClears)
    if (!candidates.length) break
    const block = pickItem(rng, candidates)
    const axis = pickItem(rng, ['horizontal', 'vertical'] as Axis[])
    const range = computeSlideRangeOnAxis(block, axis, current, obstacles, rows, cols, 999)
    const options: number[] = []
    const cur = axis === 'horizontal' ? block.col : block.row
    for (let v = range.min; v <= range.max; v++) if (v !== cur) options.push(v)
    if (!options.length) continue
    const target = pickItem(rng, options)
    current = current.map((b) =>
      b.id !== block.id
        ? b
        : normalizeBlock(
            axis === 'horizontal' ? { ...b, col: target } : { ...b, row: target }
          )
    )
    lastId = block.id
  }

  // Ninguna pieza desbloqueada lista para salir al inicio
  for (let pass = 0; pass < 14; pass++) {
    let fixed = false
    for (const block of [...current]) {
      if (block.lockedUntilClears) continue
      const exit = colorExit.get(block.color)
      if (!exit) continue
      if (!canExit(block, exit, current, obstacles, rows, cols, 999)) continue
      const before = current
      current = nudgeBlock(current, block.id, obstacles, rows, cols, rng)
      if (current !== before) {
        fixed = true
        continue
      }
      const others = shuffle(
        rng,
        current.filter((b) => b.id !== block.id && !b.lockedUntilClears)
      )
      for (const other of others) {
        const b2 = current
        current = nudgeBlock(current, other.id, obstacles, rows, cols, rng)
        if (current !== b2) {
          fixed = true
          break
        }
      }
    }
    if (!fixed) break
  }

  if (countUnlockedExitable(current, exits, obstacles, rows, cols) > 0) return null

  // Solver: exigir solución en niveles con ≤12 piezas
  const solution = solveLevel(current, exits, obstacles, rows, cols, 0, 14000)
  if (solution === null && tier.numBlocks <= 12) return null

  if (solution === null) {
    let movable = 0
    for (const b of current) {
      if (!isBlockMovable(b, 0)) continue
      for (const axis of ['horizontal', 'vertical'] as Axis[]) {
        const r = computeSlideRangeOnAxis(b, axis, current, obstacles, rows, cols, 0)
        const cur = axis === 'horizontal' ? b.col : b.row
        if (r.min < cur || r.max > cur) {
          movable++
          break
        }
      }
    }
    if (movable < Math.max(1, Math.floor(current.length * 0.35))) return null
  }

  const parMoves = Math.max(
    1,
    Math.round((solution ? solution.length : tier.scrambleMoves * 0.45) + current.length * 0.75)
  )

  return {
    id: safeId,
    rows,
    cols,
    blocks: current.map(normalizeBlock),
    exits,
    obstacles,
    difficulty: safeId,
    parMoves,
    timeLimit: Math.max(45, tier.timeLimitBase + pickInt(rng, -10, 20)),
    seed,
    tierLabel: tier.label,
  }
}

/**
 * Genera un nivel garantizado. Hasta 12 semillas. Siempre devuelve algo jugable.
 */
export function generateLevel(levelId: number): BlockCleanerLevel {
  try {
    const safeId = Math.max(1, Math.floor(Number(levelId)) || 1)
    const tier = getDifficultyTier(safeId)
    const baseSeed = (safeId * 2654435761 + 41) >>> 0

    for (let attempt = 0; attempt < 12; attempt++) {
      const seed = (baseSeed + attempt * 9973) >>> 0
      const level = generateLevelOnce(safeId, tier, seed)
      if (
        level &&
        level.blocks.length > 0 &&
        countUnlockedExitable(
          level.blocks,
          level.exits,
          level.obstacles,
          level.rows,
          level.cols
        ) === 0
      ) {
        return level
      }
    }

    return {
      ...FALLBACK_LEVEL,
      id: safeId,
      difficulty: safeId,
      seed: baseSeed,
      tierLabel: tier.label,
      blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
    }
  } catch {
    return {
      ...FALLBACK_LEVEL,
      blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
    }
  }
}

// -----------------------------------------------------------------------------
// Solver BFS
// -----------------------------------------------------------------------------
const SOLVER_CAP = 22000

function stateKey(blocks: Block[]) {
  return blocks
    .map((b) => `${b.id}:${b.row}:${b.col}`)
    .sort()
    .join('|')
}

function neighbors(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  cleared: number
): Array<{ move: Move; blocks: Block[]; cleared: number }> {
  const out: Array<{ move: Move; blocks: Block[]; cleared: number }> = []
  const exitable = getExitableBlocks(blocks, exits, obstacles, rows, cols, cleared)

  for (const id of exitable) {
    const block = blocks.find((b) => b.id === id)
    if (!block) continue
    out.push({
      move: { blockId: id, toRow: block.row, toCol: block.col, isExit: true },
      blocks: blocks.filter((b) => b.id !== id),
      cleared: cleared + 1,
    })
  }

  for (const block of blocks) {
    if (exitable.includes(block.id)) continue
    if (!isBlockMovable(block, cleared)) continue
    for (const axis of ['horizontal', 'vertical'] as Axis[]) {
      const range = computeSlideRangeOnAxis(
        block, axis, blocks, obstacles, rows, cols, cleared
      )
      const cur = axis === 'horizontal' ? block.col : block.row
      const targets = new Set<number>()
      targets.add(range.min)
      targets.add(range.max)
      for (let v = Math.max(range.min, cur - 2); v <= Math.min(range.max, cur + 2); v++) {
        targets.add(v)
      }
      for (const v of targets) {
        if (v === cur) continue
        const toRow = axis === 'vertical' ? v : block.row
        const toCol = axis === 'horizontal' ? v : block.col
        out.push({
          move: { blockId: block.id, toRow, toCol },
          blocks: blocks.map((b) =>
            b.id === block.id ? normalizeBlock({ ...b, row: toRow, col: toCol }) : b
          ),
          cleared,
        })
      }
    }
  }
  return out
}

export function solveLevel(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 0,
  nodeCap = SOLVER_CAP
): Move[] | null {
  if (isSolved(blocks)) return []
  const visited = new Set<string>([`${stateKey(blocks)}@${clearedCount}`])
  const queue: Array<{ blocks: Block[]; path: Move[]; cleared: number }> = [
    { blocks, path: [], cleared: clearedCount },
  ]
  let explored = 0
  while (queue.length && explored < nodeCap) {
    const cur = queue.shift()!
    explored++
    for (const n of neighbors(cur.blocks, exits, obstacles, rows, cols, cur.cleared)) {
      const key = `${stateKey(n.blocks)}@${n.cleared}`
      if (visited.has(key)) continue
      visited.add(key)
      const path = [...cur.path, n.move]
      if (isSolved(n.blocks)) return path
      queue.push({ blocks: n.blocks, path, cleared: n.cleared })
    }
  }
  return null
}

function heuristicHint(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): Move | null {
  for (const block of blocks) {
    if (!isBlockMovable(block, clearedCount)) continue
    const exit = exits.find((e) => e.color === block.color)
    if (!exit) continue
    if (canExit(block, exit, blocks, obstacles, rows, cols, clearedCount)) {
      return { blockId: block.id, toRow: block.row, toCol: block.col, isExit: true }
    }
  }

  for (const block of blocks) {
    if (!isBlockMovable(block, clearedCount)) continue
    const exit = exits.find((e) => e.color === block.color)
    if (!exit) continue

    if (exit.side === 'left' || exit.side === 'right') {
      const hRange = computeSlideRangeOnAxis(
        block, 'horizontal', blocks, obstacles, rows, cols, clearedCount
      )
      const targetCol = exit.side === 'left' ? hRange.min : hRange.max
      if (targetCol !== block.col) {
        return { blockId: block.id, toRow: block.row, toCol: targetCol }
      }
      const vRange = computeSlideRangeOnAxis(
        block, 'vertical', blocks, obstacles, rows, cols, clearedCount
      )
      const ideal = clampNum(exit.pos, vRange.min, vRange.max)
      if (ideal !== block.row) {
        return { blockId: block.id, toRow: ideal, toCol: block.col }
      }
    } else {
      const vRange = computeSlideRangeOnAxis(
        block, 'vertical', blocks, obstacles, rows, cols, clearedCount
      )
      const targetRow = exit.side === 'top' ? vRange.min : vRange.max
      if (targetRow !== block.row) {
        return { blockId: block.id, toRow: targetRow, toCol: block.col }
      }
      const hRange = computeSlideRangeOnAxis(
        block, 'horizontal', blocks, obstacles, rows, cols, clearedCount
      )
      const ideal = clampNum(exit.pos, hRange.min, hRange.max)
      if (ideal !== block.col) {
        return { blockId: block.id, toRow: block.row, toCol: ideal }
      }
    }
  }

  for (const block of blocks) {
    if (!isBlockMovable(block, clearedCount)) continue
    for (const axis of ['horizontal', 'vertical'] as Axis[]) {
      const range = computeSlideRangeOnAxis(
        block, axis, blocks, obstacles, rows, cols, clearedCount
      )
      const cur = axis === 'horizontal' ? block.col : block.row
      if (range.min < cur) {
        return {
          blockId: block.id,
          toRow: axis === 'vertical' ? range.min : block.row,
          toCol: axis === 'horizontal' ? range.min : block.col,
        }
      }
      if (range.max > cur) {
        return {
          blockId: block.id,
          toRow: axis === 'vertical' ? range.max : block.row,
          toCol: axis === 'horizontal' ? range.max : block.col,
        }
      }
    }
  }
  return null
}

export function getHintMove(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 0
): Move | null {
  const sol = solveLevel(blocks, exits, obstacles, rows, cols, clearedCount, 8000)
  if (sol && sol.length > 0) return sol[0]
  return heuristicHint(blocks, exits, obstacles, rows, cols, clearedCount)
}

// -----------------------------------------------------------------------------
// Estrellas, análisis, validación, lotes
// -----------------------------------------------------------------------------
export function starsForMoves(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3
  if (moves <= par + Math.max(3, Math.round(par * 0.4))) return 2
  return 1
}

export function starsForTime(seconds: number, limit: number): 1 | 2 | 3 {
  if (seconds <= limit * 0.4) return 3
  if (seconds <= limit * 0.7) return 2
  return 1
}

export interface LevelAnalysis {
  totalBlocks: number
  colorsUsed: number
  lockedBlocks: number
  axisLocked: number
  forcedDir: number
  obstacles: number
  estimatedMinMoves: number
  hasImmediateExit: boolean
  freeCells: number
  largestBlock: string
}

export function analyzeLevel(level: BlockCleanerLevel): LevelAnalysis {
  const blocks = level.blocks ?? []
  const colors = new Set(blocks.map((b) => b.color))
  let locked = 0
  let axisL = 0
  let forced = 0
  let maxArea = 0
  let largest = '1×1'
  for (const b of blocks) {
    if (b.lockedUntilClears) locked++
    if (b.axisLock) axisL++
    if (b.forcedDir) forced++
    const area = blockWidth(b) * blockHeight(b)
    if (area > maxArea) {
      maxArea = area
      largest = `${blockWidth(b)}×${blockHeight(b)}`
    }
  }
  const occupied =
    blocks.reduce((s, b) => s + blockWidth(b) * blockHeight(b), 0) +
    (level.obstacles ?? []).length
  const total = level.rows * level.cols
  const immediate = countUnlockedExitable(
    blocks,
    level.exits,
    level.obstacles ?? [],
    level.rows,
    level.cols
  )
  return {
    totalBlocks: blocks.length,
    colorsUsed: colors.size,
    lockedBlocks: locked,
    axisLocked: axisL,
    forcedDir: forced,
    obstacles: (level.obstacles ?? []).length,
    estimatedMinMoves: level.parMoves,
    hasImmediateExit: immediate > 0,
    freeCells: Math.max(0, total - occupied),
    largestBlock: largest,
  }
}

export function validateLevel(level: BlockCleanerLevel): boolean {
  if (!level || !Array.isArray(level.blocks) || level.blocks.length === 0) return false
  if (!Array.isArray(level.exits) || level.exits.length === 0) return false
  const ready = countUnlockedExitable(
    level.blocks,
    level.exits,
    level.obstacles ?? [],
    level.rows,
    level.cols
  )
  return ready === 0
}

export function generateLevelBatch(fromId: number, toId: number): BlockCleanerLevel[] {
  const out: BlockCleanerLevel[] = []
  for (let id = fromId; id <= toId; id++) out.push(generateLevel(id))
  return out
}

export function summarizeRange(fromId: number, toId: number): {
  total: number
  avgBlocks: number
  avgColors: number
  withLocks: number
  immediateExitCount: number
  avgFreeCells: number
} {
  let totalBlocks = 0
  let totalColors = 0
  let withLocks = 0
  let immediate = 0
  let free = 0
  const n = Math.max(0, toId - fromId + 1)
  for (let id = fromId; id <= toId; id++) {
    const lv = generateLevel(id)
    const a = analyzeLevel(lv)
    totalBlocks += a.totalBlocks
    totalColors += a.colorsUsed
    if (a.lockedBlocks > 0) withLocks++
    if (a.hasImmediateExit) immediate++
    free += a.freeCells
  }
  return {
    total: n,
    avgBlocks: n ? totalBlocks / n : 0,
    avgColors: n ? totalColors / n : 0,
    withLocks,
    immediateExitCount: immediate,
    avgFreeCells: n ? free / n : 0,
  }
}

export const SIDE_VECTORS: Record<Side, { dr: number; dc: number }> = {
  top: { dr: -1, dc: 0 },
  bottom: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}

export function exitPixelVector(
  side: Side,
  cellSize: number,
  multiplier = 2.6
): { dx: number; dy: number } {
  const d = cellSize * multiplier
  switch (side) {
    case 'left':
      return { dx: -d, dy: 0 }
    case 'right':
      return { dx: d, dy: 0 }
    case 'top':
      return { dx: 0, dy: -d }
    case 'bottom':
      return { dx: 0, dy: d }
  }
}

export const ENGINE_VERSION = '11.1.0'
export const ENGINE_NAME = 'BlockCleaner / Color Block Jam style'

export const COLOR_DISPLAY_NAMES: Record<BlockColor, string> = {
  cyan: 'Cian',
  blue: 'Azul',
  violet: 'Violeta',
  orange: 'Naranja',
  pink: 'Rosa',
  yellow: 'Amarillo',
  green: 'Verde',
  red: 'Rojo',
  lime: 'Lima',
  teal: 'Verde azulado',
  magenta: 'Magenta',
  amber: 'Ámbar',
  indigo: 'Índigo',
  rose: 'Rosa intenso',
  sky: 'Cielo',
  coral: 'Coral',
}