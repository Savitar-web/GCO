/**
 * =============================================================================
 * BlockCleaner.tsx — Color Block Jam style (v13.1 · ALL-IN-ONE)
 * =============================================================================
 * Archivo único: motor + generación + solver + UI.
 * Motor + UI en un solo archivo.
 * =============================================================================
 */

// =============================================================================
// ENGINE — Color Block Jam style (v13)
//
// Mejoras v12:
// - Generación más robusta (más intentos, scramble más seguro, validación fuerte).
// - Rangos dinámicos durante el drag (permite cambiar de eje sin soltar).
// - Salida continua: se puede arrastrar hacia fuera de la pared del color.
// - Solver optimizado + heurística más inteligente.
// - Menos estados imposibles.
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

export interface Block {
  id: string
  color: BlockColor
  row: number
  col: number
  w: number
  h: number
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
  pos: number
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
// RNG
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
// Geometría
// -----------------------------------------------------------------------------
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

export function footprintAlongSide(
  b: Pick<Block, 'w' | 'h' | 'length' | 'orientation'>,
  side: Side
): number {
  if (side === 'left' || side === 'right') return blockHeight(b)
  return blockWidth(b)
}

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
// Rangos de deslizamiento (ortogonales)
// -----------------------------------------------------------------------------
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

/**
 * Rangos dinámicos desde una posición visual (permite cambiar de eje sin soltar).
 * Se usa durante el drag continuo.
 */
export function computeDynamicSlideRanges(
  block: Block,
  visualRow: number,
  visualCol: number,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
  const virtual: Block = normalizeBlock({
    ...block,
    row: Math.round(visualRow),
    col: Math.round(visualCol),
  })
  return computeFreeSlideRanges(virtual, blocks, obstacles, rows, cols, clearedCount)
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
 * Posición continua ortogonal con soporte de cambio de eje.
 * Si el delta dominante cambia, se reorienta manteniendo la posición actual.
 */
export function computeContinuousDragPosition(
  originRow: number,
  originCol: number,
  deltaRow: number,
  deltaCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number },
  currentVisual?: { row: number; col: number }
): { row: number; col: number } {
  // Si ya hay visual y el usuario cambia de dirección clara, usar visual como nuevo origen lógico
  const baseRow = currentVisual ? currentVisual.row : originRow
  const baseCol = currentVisual ? currentVisual.col : originCol

  // Preferir el eje con mayor desplazamiento absoluto desde el origen original
  if (Math.abs(deltaCol) >= Math.abs(deltaRow)) {
    return {
      row: clampNum(baseRow, ranges.minRow, ranges.maxRow),
      col: clampNum(originCol + deltaCol, ranges.minCol, ranges.maxCol),
    }
  }
  return {
    row: clampNum(originRow + deltaRow, ranges.minRow, ranges.maxRow),
    col: clampNum(baseCol, ranges.minCol, ranges.maxCol),
  }
}

/**
 * Versión mejorada: permite movimiento libre ortogonal continuo.
 * Calcula la posición deseada y la clampa a los rangos actuales.
 * Si el usuario cruza a otro eje, se permite siempre que el rango lo permita.
 */
export function computeFluidDragPosition(
  originRow: number,
  originCol: number,
  deltaRow: number,
  deltaCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number }
): { row: number; col: number } {
  // Movimiento independiente en cada eje, clampado al rango actual.
  // Esto da fluidez real: puedes deslizar horizontal y luego vertical sin soltar
  // siempre que en la posición intermedia el rango lo permita (se recalcula).
  const row = clampNum(originRow + deltaRow, ranges.minRow, ranges.maxRow)
  const col = clampNum(originCol + deltaCol, ranges.minCol, ranges.maxCol)
  return { row, col }
}


/**
 * Posición visual 1:1 con el puntero, FORZANDO un solo eje (sin diagonal).
 * El eje se elige por el delta dominante y se mantiene estable (hysteresis).
 */
export function computeOrthogonalDragPosition(
  originRow: number,
  originCol: number,
  deltaRow: number,
  deltaCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number },
  lockedAxis: Axis | null
): { row: number; col: number; axis: Axis | null } {
  const absR = Math.abs(deltaRow)
  const absC = Math.abs(deltaCol)
  const THRESH = 0.08

  let axis = lockedAxis
  if (!axis) {
    if (absC < THRESH && absR < THRESH) return { row: originRow, col: originCol, axis: null }
    axis = absC >= absR ? 'horizontal' : 'vertical'
  } else {
    if (axis === 'horizontal' && absR > absC * 1.55 && absR > THRESH * 2) axis = 'vertical'
    else if (axis === 'vertical' && absC > absR * 1.55 && absC > THRESH * 2) axis = 'horizontal'
  }

  if (axis === 'horizontal') {
    return {
      row: originRow,
      col: clampNum(originCol + deltaCol, ranges.minCol, ranges.maxCol),
      axis,
    }
  }
  return {
    row: clampNum(originRow + deltaRow, ranges.minRow, ranges.maxRow),
    col: originCol,
    axis,
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

// -----------------------------------------------------------------------------
// Salidas
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

/**
 * ¿Puede la pieza salir arrastrándola hacia fuera desde su posición actual?
 * Usado durante el drag para permitir salida continua.
 */
export function canExitByDrag(
  block: Block,
  visualRow: number,
  visualCol: number,
  exits: Exit[],
  rows: number,
  cols: number,
  clearedCount: number
): Exit | null {
  if (!isBlockMovable(block, clearedCount)) return null
  const w = blockWidth(block)
  const h = blockHeight(block)
  const minR = visualRow
  const maxR = visualRow + h - 1
  const minC = visualCol
  const maxC = visualCol + w - 1

  for (const exit of exits) {
    if (exit.color !== block.color) continue
    if (footprintAlongSide(block, exit.side) > exit.length) continue

    if (exit.side === 'left') {
      // Está en el borde o ya saliendo
      if (minC <= 0.15 && minR >= exit.pos - 0.2 && maxR <= exit.pos + exit.length - 0.8) {
        return exit
      }
    } else if (exit.side === 'right') {
      if (maxC >= cols - 1 - 0.15 && minR >= exit.pos - 0.2 && maxR <= exit.pos + exit.length - 0.8) {
        return exit
      }
    } else if (exit.side === 'top') {
      if (minR <= 0.15 && minC >= exit.pos - 0.2 && maxC <= exit.pos + exit.length - 0.8) {
        return exit
      }
    } else if (exit.side === 'bottom') {
      if (maxR >= rows - 1 - 0.15 && minC >= exit.pos - 0.2 && maxC <= exit.pos + exit.length - 0.8) {
        return exit
      }
    }
  }
  return null
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
// Fallback
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
// Dificultad
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

export function getDifficultyTier(level: number): DifficultyTierConfig {
  const L = Math.max(1, level)
  const decade = Math.floor((L - 1) / 10)

  if (L <= 3) {
    return {
      rows: 5, cols: 5, numBlocks: 6, numColors: 3, obstacleCount: 0,
      maxDim: 2, allowSquares: false, scrambleMoves: 10, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 200, label: 'Tutorial',
    }
  }
  if (L <= 6) {
    return {
      rows: 5, cols: 6, numBlocks: 4, numColors: 3, obstacleCount: 0,
      maxDim: 2, allowSquares: false, scrambleMoves: 14, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 180, label: 'Tutorial+',
    }
  }
  if (L <= 10) {
    return {
      rows: 6, cols: 6, numBlocks: 8, numColors: 4, obstacleCount: 0,
      maxDim: 2, allowSquares: true, scrambleMoves: 18, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 160, label: 'Principiante',
    }
  }
  if (L <= 16) {
    return {
      rows: 6, cols: 7, numBlocks: 10, numColors: 4, obstacleCount: 1,
      maxDim: 3, allowSquares: true, scrambleMoves: 22, axisLockChance: 0.03,
      lockedChance: 0.04, lockedClearsMin: 1, lockedClearsMax: 2,
      timeLimitBase: 150, label: 'Principiante+',
    }
  }
  if (L <= 25) {
    return {
      rows: 7, cols: 7, numBlocks: 12, numColors: 5, obstacleCount: 1,
      maxDim: 3, allowSquares: true, scrambleMoves: 28, axisLockChance: 0.06,
      lockedChance: 0.08, lockedClearsMin: 1, lockedClearsMax: 2,
      timeLimitBase: 140, label: 'Intermedio',
    }
  }
  if (L <= 40) {
    return {
      rows: 8, cols: 8, numBlocks: 14, numColors: 5, obstacleCount: 2,
      maxDim: 3, allowSquares: true, scrambleMoves: 34, axisLockChance: 0.1,
      lockedChance: 0.1, lockedClearsMin: 1, lockedClearsMax: 3,
      timeLimitBase: 130, label: 'Intermedio+',
    }
  }
  if (L <= 60) {
    return {
      rows: 9, cols: 9, numBlocks: 16, numColors: 6, obstacleCount: 2,
      maxDim: 4, allowSquares: true, scrambleMoves: 40, axisLockChance: 0.12,
      lockedChance: 0.12, lockedClearsMin: 1, lockedClearsMax: 3,
      timeLimitBase: 120, label: 'Avanzado',
    }
  }
  if (L <= 80) {
    return {
      rows: 10, cols: 10, numBlocks: 18, numColors: 6, obstacleCount: 3,
      maxDim: 4, allowSquares: true, scrambleMoves: 46, axisLockChance: 0.15,
      lockedChance: 0.15, lockedClearsMin: 1, lockedClearsMax: 4,
      timeLimitBase: 110, label: 'Experto',
    }
  }
  if (L <= 100) {
    return {
      rows: 11, cols: 11, numBlocks: 20, numColors: 7, obstacleCount: 4,
      maxDim: 4, allowSquares: true, scrambleMoves: 52, axisLockChance: 0.18,
      lockedChance: 0.18, lockedClearsMin: 1, lockedClearsMax: 4,
      timeLimitBase: 100, label: 'Maestro',
    }
  }

  const rows = clampNum(11 + Math.floor((decade - 10) * 0.3), 11, 13)
  return {
    rows,
    cols: rows,
    numBlocks: clampNum(20 + Math.floor((decade - 10) * 0.8), 20, 26),
    numColors: clampNum(6 + Math.floor((decade - 10) / 3), 6, BLOCK_COLOR_ORDER.length),
    obstacleCount: clampNum(4 + Math.floor((decade - 10) * 0.5), 4, 10),
    maxDim: 4,
    allowSquares: true,
    scrambleMoves: clampNum(52 + (decade - 10) * 2, 52, 75),
    axisLockChance: clampNum(0.18 + (decade - 10) * 0.012, 0.18, 0.3),
    lockedChance: clampNum(0.18 + (decade - 10) * 0.012, 0.18, 0.28),
    lockedClearsMin: 1,
    lockedClearsMax: clampNum(4 + Math.floor((decade - 10) / 2), 4, 6),
    timeLimitBase: clampNum(100 - (decade - 10) * 2, 60, 100),
    label: decade < 14 ? 'Maestro+' : 'Infinito',
  }
}

// -----------------------------------------------------------------------------
// Generación mejorada
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
    for (let attempt = 0; attempt < 140; attempt++) {
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

  const occupied = new Set<string>()
  const obstacles: Obstacle[] = []
  for (let i = 0; i < tier.obstacleCount && rows > 2 && cols > 2; i++) {
    let attempts = 0
    while (attempts < 90) {
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

      let axisLock: AxisLock | undefined
      let forcedDir: Direction | undefined
      if (rng() < tier.axisLockChance) {
        if (exit.side === 'left' || exit.side === 'right') {
          axisLock = 'horizontal'
          if (rng() < 0.35) forcedDir = exit.side === 'left' ? 'left' : 'right'
        } else {
          axisLock = 'vertical'
          if (rng() < 0.35) forcedDir = exit.side === 'top' ? 'up' : 'down'
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

  // Candados seguros
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

  // Scramble más controlado (menos probabilidad de estados imposibles)
  let current = blocks.map((b) => ({ ...b }))
  let lastId: string | null = null
  const scrambleSteps = Math.min(tier.scrambleMoves, Math.max(8, tier.numBlocks * 4))
  for (let step = 0; step < scrambleSteps; step++) {
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

  // Empujar piezas que arrancan listas para salir
  for (let pass = 0; pass < 16; pass++) {
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

  // Solver más estricto en niveles pequeños/medios
  const maxNodes = tier.numBlocks <= 8 ? 18000 : tier.numBlocks <= 12 ? 12000 : 6000
  const solution = solveLevel(current, exits, obstacles, rows, cols, 0, maxNodes)

  if (solution === null && tier.numBlocks <= 11) {
    // Rechazar si no se encuentra solución en niveles de tamaño razonable
    return null
  }

  if (solution === null) {
    // Para niveles grandes: al menos garantizar movilidad suficiente
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
    if (movable < Math.max(2, Math.floor(current.length * 0.4))) return null
  }

  const parMoves = Math.max(
    1,
    Math.round((solution ? solution.length : tier.scrambleMoves * 0.4) + current.length * 0.7)
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
    timeLimit: Math.max(50, tier.timeLimitBase + pickInt(rng, -8, 15)),
    seed,
    tierLabel: tier.label,
  }
}

/**
 * Genera nivel garantizado. Más intentos + fallback seguro.
 */
export function generateLevel(levelId: number): BlockCleanerLevel {
  try {
    const safeId = Math.max(1, Math.floor(Number(levelId)) || 1)
    const tier = getDifficultyTier(safeId)
    const baseSeed = (safeId * 2654435761 + 41) >>> 0

    // Más intentos para niveles pequeños (evitar imposibles)
    const maxAttempts = safeId <= 25 ? 24 : safeId <= 60 ? 16 : 10

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const seed = (baseSeed + attempt * 9973 + attempt * 31) >>> 0
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

    // Fallback enriquecido (siempre jugable)
    return {
      ...FALLBACK_LEVEL,
      id: safeId,
      difficulty: safeId,
      seed: baseSeed,
      tierLabel: tier.label,
      blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
      timeLimit: Math.max(90, tier.timeLimitBase),
    }
  } catch {
    return {
      ...FALLBACK_LEVEL,
      blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
    }
  }
}

// -----------------------------------------------------------------------------
// Solver optimizado
// -----------------------------------------------------------------------------
const SOLVER_CAP = 18000

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
      // Solo extremos + vecinos cercanos para reducir branching
      for (let v = Math.max(range.min, cur - 1); v <= Math.min(range.max, cur + 1); v++) {
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
  // 1. Salidas inmediatas
  for (const block of blocks) {
    if (!isBlockMovable(block, clearedCount)) continue
    const exit = exits.find((e) => e.color === block.color)
    if (!exit) continue
    if (canExit(block, exit, blocks, obstacles, rows, cols, clearedCount)) {
      return { blockId: block.id, toRow: block.row, toCol: block.col, isExit: true }
    }
  }

  // 2. Mover hacia la puerta
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

  // 3. Cualquier movimiento posible
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
  // Solver rápido primero
  const sol = solveLevel(blocks, exits, obstacles, rows, cols, clearedCount, 5000)
  if (sol && sol.length > 0) return sol[0]
  return heuristicHint(blocks, exits, obstacles, rows, cols, clearedCount)
}

// -----------------------------------------------------------------------------
// Estrellas y utilidades
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
  multiplier = 2.8
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

export const ENGINE_VERSION = '12.0.0'
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


// =============================================================================
// UI LAYER
// =============================================================================

/**
 * UI LAYER
 * Movimiento ortogonal 1:1, animación de salida, glassmorphism, optimizado
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { soundClick } from '@/core/audio/uiSounds'
const LS = {
  current: 'bc.v13.current', unlocked: 'bc.v13.unlocked', scores: 'bc.v13.scores', moves: 'bc.v13.moves',
  times: 'bc.v13.times', defeats: 'bc.v13.defeats', style: 'bc.v13.style', options: 'bc.v13.options',
  wins: 'bc.v13.wins', totalMoves: 'bc.v13.totalMoves', streak: 'bc.v13.streak', bestStreak: 'bc.v13.bestStreak', bestCombo: 'bc.v13.bestCombo',
}
function readJSON<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function writeJSON(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
function playSfx(kind: string) {
  try {
    soundClick()
    if (kind === 'exit' || kind === 'hint') setTimeout(() => soundClick(), 65)
    if (kind === 'win') { setTimeout(() => soundClick(), 80); setTimeout(() => soundClick(), 160) }
  } catch {}
}

export type BlockStyle = 'liquid-glass' | 'metallic' | 'matte' | 'neon' | 'pastel' | 'crystal' | 'candy' | 'obsidian'
const BLOCK_STYLES: { id: BlockStyle; label: string; desc: string }[] = [
  { id: 'liquid-glass', label: 'Liquid Glass', desc: 'Reflejo iOS' },
  { id: 'metallic', label: 'Metálico', desc: 'Acero cepillado' },
  { id: 'matte', label: 'Mate', desc: 'Opaco plano' },
  { id: 'neon', label: 'Neón', desc: 'Halo eléctrico' },
  { id: 'pastel', label: 'Pastel', desc: 'Crema suave' },
  { id: 'crystal', label: 'Cristal', desc: 'Facetas' },
  { id: 'candy', label: 'Candy', desc: 'Caramelo 3D' },
  { id: 'obsidian', label: 'Obsidiana', desc: 'Negro volcánico' },
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
interface PlayOptions { hardcore: boolean; noHints: boolean; showExits: boolean; showPar: boolean; showGhost: boolean }
const DEFAULT_OPTIONS: PlayOptions = { hardcore: false, noHints: false, showExits: true, showPar: true, showGhost: false }
const PRO_TIPS = [
  'Solo salen por la pared de su color. Arrastra hacia fuera cuando esté alineada.',
  'Movimiento ortogonal 1:1: la pieza sigue tu dedo sin saltos ni diagonal.',
  'Las piezas no pueden atravesarse. Planifica el orden.',
  'Candados 🔒: saca N piezas antes de poder moverlas.',
]
const BASE_CELL = 54
const GAP = 5
type Screen = 'hub' | 'play' | 'levels' | 'options' | 'styles' | 'stats' | 'win' | 'lose'
interface DragState {
  pointerId: number; id: string; originClientX: number; originClientY: number
  originRow: number; originCol: number
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number }
  visualRow: number; visualCol: number; lockedAxis: Axis | null
}
function safeGenerate(id: number): BlockCleanerLevel {
  try {
    const g = generateLevel(id)
    if (g?.blocks?.length && g.exits) return { ...g, blocks: g.blocks.map(normalizeBlock) }
  } catch {}
  return { ...FALLBACK_LEVEL, id, difficulty: id, blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock) }
}

export function BlockCleaner() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('hub')
  const [levelId, setLevelId] = useState(() => readJSON(LS.current, 1))
  const [unlocked, setUnlocked] = useState(() => readJSON(LS.unlocked, 1))
  const [level, setLevel] = useState(() => safeGenerate(readJSON(LS.current, 1)))
  const [blocks, setBlocks] = useState(() => safeGenerate(readJSON(LS.current, 1)).blocks.map(normalizeBlock))
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [timerOn, setTimerOn] = useState(true)
  const [cleared, setCleared] = useState(0)
  const [undoStack, setUndoStack] = useState<Block[][]>([])
  const [combo, setCombo] = useState(0)
  const [hintId, setHintId] = useState<string | null>(null)
  const [exitingMap, setExitingMap] = useState<Record<string, { dx: number; dy: number }>>({})
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() => readJSON(LS.style, 'liquid-glass'))
  const [options, setOptions] = useState<PlayOptions>(() => readJSON(LS.options, DEFAULT_OPTIONS))
  const [tipIndex, setTipIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragVisual, setDragVisual] = useState<{ row: number; col: number } | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const timerRef = useRef<number | null>(null)
  const winHandled = useRef(false)
  const rafRef = useRef<number | null>(null)
  const pendingVisual = useRef<{ row: number; col: number } | null>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const loadLevel = useCallback((id: number) => {
    const lv = safeGenerate(id)
    setLevel(lv); setBlocks(lv.blocks.map(normalizeBlock))
    setMoves(0); setSeconds(0); setCleared(0); setUndoStack([]); setCombo(0)
    setHintId(null); setExitingMap({}); setDraggingId(null); setDragVisual(null)
    dragRef.current = null; winHandled.current = false
    setLevelId(id); writeJSON(LS.current, id); setScreen('play')
  }, [])

  useEffect(() => {
    if (screen !== 'play' || !timerOn) return
    timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [screen, timerOn, levelId])

  useEffect(() => {
    if (screen !== 'play' || winHandled.current || blocks.length > 0) return
    winHandled.current = true
    playSfx('win')
    const stars = Math.min(starsForMoves(moves, level.parMoves), starsForTime(seconds, level.timeLimit)) as 1 | 2 | 3
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    scores[levelId] = Math.max(scores[levelId] ?? 0, stars)
    writeJSON(LS.scores, scores)
    writeJSON(LS.wins, readJSON(LS.wins, 0) + 1)
    writeJSON(LS.totalMoves, readJSON(LS.totalMoves, 0) + moves)
    const streak = readJSON(LS.streak, 0) + 1
    writeJSON(LS.streak, streak)
    writeJSON(LS.bestStreak, Math.max(readJSON(LS.bestStreak, 0), streak))
    if (levelId >= unlocked) { setUnlocked(levelId + 1); writeJSON(LS.unlocked, levelId + 1) }
    setScreen('win')
  }, [blocks, screen, moves, seconds, level, levelId, unlocked])

  useEffect(() => {
    if (screen !== 'play' || !timerOn || !options.hardcore) return
    if (seconds >= level.timeLimit && blocks.length > 0) {
      playSfx('lose'); writeJSON(LS.defeats, readJSON(LS.defeats, 0) + 1); writeJSON(LS.streak, 0); setScreen('lose')
    }
  }, [seconds, screen, timerOn, options.hardcore, level.timeLimit, blocks.length])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const safeBlocks = useMemo(() => blocks.map(normalizeBlock), [blocks])
  const exitable = useMemo(
    () => getExitableBlocks(safeBlocks, level.exits ?? [], level.obstacles ?? [], level.rows, level.cols, cleared),
    [safeBlocks, level, cleared]
  )

  const applyMove = useCallback((blockId: string, toRow: number, toCol: number, forceExit = false) => {
    setBlocks(list => {
      const block = list.find(b => b.id === blockId)
      if (!block || !isBlockMovable(block, cleared)) { playSfx('lock'); return list }
      const next = list.map(b => b.id === blockId ? normalizeBlock({ ...b, row: toRow, col: toCol }) : b)
      let exitSide: Side | null = null
      const after = next.filter(b => {
        if (b.id !== blockId) return true
        for (const e of level.exits ?? []) {
          if (b.color === e.color && isBlockMovable(b, cleared)) {
            const w = blockWidth(b), h = blockHeight(b)
            const minR = b.row, maxR = b.row + h - 1, minC = b.col, maxC = b.col + w - 1
            let aligned = false
            if (e.side === 'left') aligned = minC === 0 && minR >= e.pos && maxR <= e.pos + e.length - 1
            else if (e.side === 'right') aligned = maxC === level.cols - 1 && minR >= e.pos && maxR <= e.pos + e.length - 1
            else if (e.side === 'top') aligned = minR === 0 && minC >= e.pos && maxC <= e.pos + e.length - 1
            else aligned = maxR === level.rows - 1 && minC >= e.pos && maxC <= e.pos + e.length - 1
            if (aligned && (e.side === 'left' || e.side === 'right' ? h : w) <= e.length) { exitSide = e.side; return false }
          }
        }
        if (forceExit) {
          const exit = (level.exits ?? []).find(e => e.color === b.color)
          if (exit) { exitSide = exit.side; return false }
        }
        return true
      })
      if (exitSide || after.length !== next.length) {
        const v = exitPixelVector(exitSide ?? 'top', BASE_CELL)
        setExitingMap(prev => ({ ...prev, [blockId]: v }))
        playSfx('exit'); setCombo(c => c + 1); setCleared(c => c + 1)
        setUndoStack(u => [...u, list]); setMoves(m => m + 1)
        setTimeout(() => setExitingMap(prev => { const n = { ...prev }; delete n[blockId]; return n }), 420)
        return after
      }
      if (toRow !== block.row || toCol !== block.col) {
        playSfx('move'); setCombo(0); setUndoStack(u => [...u, list]); setMoves(m => m + 1)
      }
      return next
    })
  }, [cleared, level])

  const scheduleVisual = useCallback((row: number, col: number) => {
    pendingVisual.current = { row, col }
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (pendingVisual.current) { setDragVisual(pendingVisual.current); pendingVisual.current = null }
    })
  }, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, block: Block) => {
    if (screen !== 'play' || !isBlockMovable(block, cleared)) { playSfx('lock'); return }
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const ranges = computeFreeSlideRanges(block, blocksRef.current, level.obstacles ?? [], level.rows, level.cols, cleared)
    dragRef.current = {
      pointerId: e.pointerId, id: block.id,
      originClientX: e.clientX, originClientY: e.clientY,
      originRow: block.row, originCol: block.col, ranges,
      visualRow: block.row, visualCol: block.col, lockedAxis: null,
    }
    setDraggingId(block.id); setDragVisual({ row: block.row, col: block.col }); setHintId(null)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const dxPx = (e.clientX - drag.originClientX) / zoom
    const dyPx = (e.clientY - drag.originClientY) / zoom
    const result = computeOrthogonalDragPosition(
      drag.originRow, drag.originCol, dyPx / BASE_CELL, dxPx / BASE_CELL, drag.ranges, drag.lockedAxis
    )
    drag.visualRow = result.row; drag.visualCol = result.col
    if (result.axis) drag.lockedAxis = result.axis
    scheduleVisual(result.row, result.col)

    const block = blocksRef.current.find(b => b.id === drag.id)
    if (block) {
      const exit = canExitByDrag(block, result.row, result.col, level.exits ?? [], level.rows, level.cols, cleared)
      if (exit) {
        const dCol = dxPx / BASE_CELL, dRow = dyPx / BASE_CELL
        const pushing =
          (exit.side === 'left' && dCol < -0.3) || (exit.side === 'right' && dCol > 0.3) ||
          (exit.side === 'top' && dRow < -0.3) || (exit.side === 'bottom' && dRow > 0.3)
        if (pushing) {
          dragRef.current = null; setDraggingId(null); setDragVisual(null)
          applyMove(drag.id, Math.round(result.row), Math.round(result.col), true)
        }
      }
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId) } catch {}
    const visual = { row: drag.visualRow, col: drag.visualCol }
    const block = blocksRef.current.find(b => b.id === drag.id)
    let forceExit = !!(block && canExitByDrag(block, visual.row, visual.col, level.exits ?? [], level.rows, level.cols, cleared))
    dragRef.current = null; setDraggingId(null); setDragVisual(null)
    const snapped = snapToGrid(visual.row, visual.col, drag.ranges)
    if (forceExit || snapped.row !== drag.originRow || snapped.col !== drag.originCol)
      applyMove(drag.id, snapped.row, snapped.col, forceExit)
  }

  const handlePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null; setDraggingId(null); setDragVisual(null)
  }

  const undo = () => {
    if (options.hardcore || !undoStack.length) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(u => u.slice(0, -1)); setBlocks(last.map(normalizeBlock)); setMoves(m => Math.max(0, m - 1)); setCombo(0); playSfx('ui')
  }
  const hint = () => {
    if (options.noHints || options.hardcore) return
    const move = getHintMove(safeBlocks, level.exits ?? [], level.obstacles ?? [], level.rows, level.cols, cleared)
    if (!move) return
    playSfx('hint'); setHintId(move.blockId)
    applyMove(move.blockId, move.toRow, move.toCol, !!move.isExit)
    setTimeout(() => setHintId(null), 550)
  }
  const reset = () => { loadLevel(levelId); playSfx('ui') }

  const boardW = level.cols * BASE_CELL + (level.cols + 1) * GAP
  const boardH = level.rows * BASE_CELL + (level.rows + 1) * GAP

  const blockStyleCss = (color: BlockColor, style: BlockStyle): CSSProperties => {
    const c = COLOR_HEX[color]
    const base: CSSProperties = { background: c.base, boxShadow: `0 4px 16px ${c.glow}, inset 0 1px 0 ${c.light}88`, border: `1px solid ${c.light}55` }
    if (style === 'metallic') return { ...base, background: `linear-gradient(135deg, ${c.light}, ${c.base} 40%, ${c.dark})` }
    if (style === 'matte') return { background: c.base, boxShadow: 'none', border: `1px solid ${c.dark}` }
    if (style === 'neon') return { background: c.base, boxShadow: `0 0 12px ${c.glow}, 0 0 28px ${c.glow}`, border: `1px solid ${c.light}` }
    if (style === 'pastel') return { background: c.light, color: c.dark, boxShadow: `0 2px 8px ${c.glow}44`, border: `1px solid ${c.base}66` }
    if (style === 'crystal') return { background: `linear-gradient(160deg, ${c.light}cc, ${c.base}99 50%, ${c.dark}aa)`, backdropFilter: 'blur(4px)', boxShadow: `0 4px 20px ${c.glow}`, border: `1px solid ${c.light}88` }
    if (style === 'candy') return { background: `radial-gradient(circle at 30% 25%, ${c.light}, ${c.base} 55%, ${c.dark})`, boxShadow: `0 6px 14px ${c.glow}, inset 0 -3px 6px ${c.dark}66`, border: 'none' }
    if (style === 'obsidian') return { background: `linear-gradient(145deg, #1a1a1a, ${c.dark} 60%, #0a0a0a)`, boxShadow: `0 2px 10px ${c.glow}88`, border: `1px solid ${c.base}33` }
    return { ...base, background: `linear-gradient(145deg, ${c.light}55, ${c.base} 45%, ${c.dark}cc)`, backdropFilter: 'blur(8px)' }
  }

  // Screens (hub, levels, options glass, styles, stats, win, lose, play)
  if (screen === 'hub') return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-hub glass-panel">
        <button className="bc-back" onClick={() => navigate('/categoria/logica')}>←</button>
        <h1 className="bc-title">Block Cleaner</h1>
        <p className="bc-sub">Color Block Jam · v13</p>
        <div className="bc-hub-actions">
          <button className="bc-btn primary" onClick={() => loadLevel(levelId)}>Continuar · Niv. {levelId}</button>
          <button className="bc-btn" onClick={() => setScreen('levels')}>Niveles</button>
          <button className="bc-btn" onClick={() => setScreen('options')}>Opciones</button>
          <button className="bc-btn" onClick={() => setScreen('styles')}>Estilos</button>
          <button className="bc-btn" onClick={() => setScreen('stats')}>Estadísticas</button>
        </div>
        <p className="bc-tip-text">{PRO_TIPS[tipIndex % PRO_TIPS.length]}</p>
        <button className="bc-link" onClick={() => setTipIndex(i => (i + 1) % PRO_TIPS.length)}>Siguiente tip</button>
      </div>
    </div>
  )

  if (screen === 'levels') {
    const maxShow = Math.max(unlocked + 8, 36)
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    return (
      <div className="bc-root"><style>{CSS}</style>
        <div className="bc-hub glass-panel">
          <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
          <h2 className="bc-title">Niveles</h2>
          <div className="bc-level-grid">
            {Array.from({ length: maxShow }, (_, i) => i + 1).map(n => (
              <button key={n} className={`bc-level-cell ${n > unlocked ? 'locked' : ''} ${n === levelId ? 'current' : ''}`}
                disabled={n > unlocked} onClick={() => n <= unlocked && loadLevel(n)}>
                <span className="bc-level-num">{n}</span>
                <span className="bc-level-stars">{(scores[n] ?? 0) > 0 ? '★'.repeat(scores[n]) + '☆'.repeat(3 - scores[n]) : '·'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'options') return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-hub glass-panel">
        <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
        <h2 className="bc-title">Opciones</h2>
        <div className="bc-options-list">
          {([['hardcore', 'Hardcore', 'Sin undo y límite de tiempo'], ['noHints', 'Sin pistas', 'Desactiva pistas'], ['showExits', 'Mostrar puertas', 'Bordes de color'], ['showPar', 'Mostrar par', 'Objetivo de movimientos'], ['showGhost', 'Ghost de rango', 'Área deslizable']] as const).map(([key, title, desc]) => (
            <label key={key} className="bc-opt-glass">
              <div className="bc-opt-text"><strong>{title}</strong><span>{desc}</span></div>
              <div className="bc-toggle">
                <input type="checkbox" checked={options[key]} onChange={e => { const next = { ...options, [key]: e.target.checked }; setOptions(next); writeJSON(LS.options, next) }} />
                <span className="bc-toggle-slider" />
              </div>
            </label>
          ))}
          <label className="bc-opt-glass">
            <div className="bc-opt-text"><strong>Contrarreloj</strong><span>Contador de segundos</span></div>
            <div className="bc-toggle">
              <input type="checkbox" checked={timerOn} onChange={e => setTimerOn(e.target.checked)} />
              <span className="bc-toggle-slider" />
            </div>
          </label>
        </div>
      </div>
    </div>
  )

  if (screen === 'styles') return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-hub glass-panel">
        <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
        <h2 className="bc-title">Estilos</h2>
        <div className="bc-style-grid">
          {BLOCK_STYLES.map(s => (
            <button key={s.id} className={`bc-style-card ${blockStyle === s.id ? 'active' : ''}`}
              onClick={() => { setBlockStyle(s.id); writeJSON(LS.style, s.id); playSfx('ui') }}>
              <div className="bc-style-swatch" style={blockStyleCss('cyan', s.id)} />
              <strong>{s.label}</strong><span>{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (screen === 'stats') return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-hub glass-panel">
        <button className="bc-back" onClick={() => setScreen('hub')}>←</button>
        <h2 className="bc-title">Estadísticas</h2>
        <ul className="bc-stats">
          <li>Victorias: {readJSON(LS.wins, 0)}</li>
          <li>Derrotas: {readJSON(LS.defeats, 0)}</li>
          <li>Movimientos: {readJSON(LS.totalMoves, 0)}</li>
          <li>Racha: {readJSON(LS.streak, 0)}</li>
          <li>Mejor racha: {readJSON(LS.bestStreak, 0)}</li>
          <li>Desbloqueado: {unlocked}</li>
        </ul>
      </div>
    </div>
  )

  if (screen === 'win') {
    const stars = readJSON<Record<number, number>>(LS.scores, {})[levelId] ?? 1
    return (
      <div className="bc-root"><style>{CSS}</style>
        <div className="bc-hub glass-panel">
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

  if (screen === 'lose') return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-hub glass-panel">
        <h2 className="bc-title">Tiempo agotado</h2>
        <div className="bc-hub-actions">
          <button className="bc-btn primary" onClick={() => loadLevel(levelId)}>Reintentar</button>
          <button className="bc-btn" onClick={() => setScreen('hub')}>Menú</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bc-root"><style>{CSS}</style>
      <div className="bc-play-bar glass-bar">
        <button className="bc-icon-btn" onClick={() => setScreen('hub')}>←</button>
        <div className="bc-play-meta">
          <span>Niv. {levelId}</span>
          <span className="bc-tier">{level.tierLabel}</span>
          {options.showPar && <span>Par {level.parMoves}</span>}
          <span>{moves} mov</span>
          {timerOn && <span className={seconds > level.timeLimit * 0.8 ? 'bc-time-warn' : ''}>{seconds}s{options.hardcore ? ` / ${level.timeLimit}s` : ''}</span>}
          {combo > 1 && <span className="bc-combo">×{combo}</span>}
        </div>
        <div className="bc-play-actions">
          <button className="bc-icon-btn" onClick={undo} disabled={options.hardcore || !undoStack.length}>↩</button>
          <button className="bc-icon-btn" onClick={hint} disabled={options.noHints || options.hardcore}>💡</button>
          <button className="bc-icon-btn" onClick={reset}>⟳</button>
          <button className="bc-icon-btn" onClick={() => setZoom(z => clampNum(z - 0.1, 0.5, 1.6))}>−</button>
          <button className="bc-icon-btn" onClick={() => setZoom(z => clampNum(z + 0.1, 0.5, 1.6))}>+</button>
        </div>
      </div>
      <div className="bc-board-wrap" onPointerMove={e => { if (dragRef.current) handlePointerMove(e) }} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}>
        <div className="bc-board" style={{ width: boardW, height: boardH, transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          {Array.from({ length: level.rows * level.cols }).map((_, i) => {
            const r = Math.floor(i / level.cols), c = i % level.cols
            return <div key={'g' + i} className="bc-cell" style={{ left: GAP + c * (BASE_CELL + GAP), top: GAP + r * (BASE_CELL + GAP), width: BASE_CELL, height: BASE_CELL }} />
          })}
          {(level.obstacles ?? []).map(o => (
            <div key={o.id} className="bc-obstacle" style={{ left: GAP + o.col * (BASE_CELL + GAP), top: GAP + o.row * (BASE_CELL + GAP), width: BASE_CELL, height: BASE_CELL }} />
          ))}
          {options.showExits && (level.exits ?? []).map(ex => {
            const c = COLOR_HEX[ex.color]
            const style: CSSProperties = { background: c.glow, border: `2px solid ${c.base}`, position: 'absolute', borderRadius: 6, pointerEvents: 'none', opacity: 0.9 }
            if (ex.side === 'left') Object.assign(style, { left: 0, top: GAP + ex.pos * (BASE_CELL + GAP), width: 7, height: ex.length * BASE_CELL + (ex.length - 1) * GAP })
            else if (ex.side === 'right') Object.assign(style, { right: 0, left: 'auto', top: GAP + ex.pos * (BASE_CELL + GAP), width: 7, height: ex.length * BASE_CELL + (ex.length - 1) * GAP })
            else if (ex.side === 'top') Object.assign(style, { top: 0, left: GAP + ex.pos * (BASE_CELL + GAP), height: 7, width: ex.length * BASE_CELL + (ex.length - 1) * GAP })
            else Object.assign(style, { bottom: 0, top: 'auto', left: GAP + ex.pos * (BASE_CELL + GAP), height: 7, width: ex.length * BASE_CELL + (ex.length - 1) * GAP })
            return <div key={ex.id} className="bc-exit" style={style} />
          })}
          <AnimatePresence>
            {safeBlocks.map(b => {
              const w = blockWidth(b), h = blockHeight(b)
              const isDrag = draggingId === b.id
              const exitAnim = exitingMap[b.id]
              const isExit = !!exitAnim
              const isHint = hintId === b.id
              const canGo = exitable.includes(b.id)
              let top = GAP + b.row * (BASE_CELL + GAP), left = GAP + b.col * (BASE_CELL + GAP)
              if (isDrag && dragVisual) { top = GAP + dragVisual.row * (BASE_CELL + GAP); left = GAP + dragVisual.col * (BASE_CELL + GAP) }
              const width = w * BASE_CELL + (w - 1) * GAP, height = h * BASE_CELL + (h - 1) * GAP
              return (
                <motion.div key={b.id}
                  className={`bc-block ${isDrag ? 'dragging' : ''} ${canGo ? 'exitable' : ''} ${isHint ? 'hint' : ''} ${isExit ? 'exiting' : ''}`}
                  style={{
                    ...blockStyleCss(b.color, blockStyle), width, height, left, top,
                    zIndex: isDrag ? 30 : isExit ? 25 : 5, transition: isDrag ? 'none' : undefined,
                    touchAction: 'none', cursor: isBlockMovable(b, cleared) ? 'grab' : 'not-allowed',
                    opacity: b.lockedUntilClears && cleared < b.lockedUntilClears ? 0.5 : 1,
                  }}
                  initial={false}
                  animate={isExit ? { x: exitAnim.dx, y: exitAnim.dy, opacity: 0, scale: 0.65, filter: 'blur(2px)' } : { x: 0, y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  transition={isDrag ? { duration: 0 } : isExit ? { duration: 0.4, ease: [0.22, 1, 0.36, 1] } : { type: 'spring', stiffness: 520, damping: 38, mass: 0.85 }}
                  onPointerDown={e => handlePointerDown(e, b)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  {b.lockedUntilClears != null && cleared < b.lockedUntilClears && <span className="bc-lock">🔒{b.lockedUntilClears - cleared}</span>}
                  {b.forcedDir && <span className="bc-dir">{b.forcedDir === 'left' ? '←' : b.forcedDir === 'right' ? '→' : b.forcedDir === 'up' ? '↑' : '↓'}</span>}
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
.bc-root{min-height:100dvh;width:100%;display:flex;flex-direction:column;color:var(--text-primary,#f2f4f8);background:transparent;font-family:Inter,system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.glass-panel{background:color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);border-radius:24px;backdrop-filter:blur(20px) saturate(1.2);-webkit-backdrop-filter:blur(20px) saturate(1.2);box-shadow:0 16px 48px rgba(0,0,0,.22)}
.glass-bar{background:color-mix(in srgb,var(--text-primary,#fff) 5%,transparent);border-bottom:1px solid color-mix(in srgb,var(--text-primary,#fff) 10%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.bc-hub{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 18px;max-width:520px;margin:16px auto;width:calc(100% - 24px)}
.bc-title{font-family:"Space Grotesk",Inter,sans-serif;font-weight:700;font-size:clamp(1.6rem,5vw,2.2rem);margin:0;letter-spacing:-.02em}
.bc-sub{opacity:.65;margin:0 0 6px;font-size:.9rem}
.bc-back,.bc-icon-btn{appearance:none;border:1px solid color-mix(in srgb,var(--text-primary,#fff) 18%,transparent);background:color-mix(in srgb,var(--text-primary,#fff) 8%,transparent);color:inherit;border-radius:12px;width:40px;height:40px;display:grid;place-items:center;font-size:1.1rem;cursor:pointer;backdrop-filter:blur(12px)}
.bc-back{align-self:flex-start}
.bc-hub-actions{display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px}
.bc-btn{appearance:none;border:1px solid color-mix(in srgb,var(--text-primary,#fff) 16%,transparent);background:color-mix(in srgb,var(--text-primary,#fff) 7%,transparent);color:inherit;border-radius:14px;padding:12px 16px;font-size:1rem;font-weight:600;cursor:pointer;backdrop-filter:blur(14px);transition:transform .15s ease}
.bc-btn:active{transform:scale(.98)}
.bc-btn.primary{background:linear-gradient(135deg,#3AA0FF88,#8B7CF688);border-color:#3AA0FF55}
.bc-link{background:none;border:none;color:inherit;opacity:.7;text-decoration:underline;cursor:pointer;font-size:.85rem}
.bc-tip-text{text-align:center;opacity:.75;font-size:.88rem;line-height:1.4;max-width:360px;margin-top:6px}
.bc-level-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;width:100%;max-width:420px;max-height:60dvh;overflow:auto;padding:4px}
.bc-level-cell{appearance:none;border:1px solid color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);background:color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);color:inherit;border-radius:12px;padding:10px 4px;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;backdrop-filter:blur(10px)}
.bc-level-cell.locked{opacity:.35;cursor:not-allowed}
.bc-level-cell.current{outline:2px solid #3AA0FF}
.bc-level-num{font-weight:700;font-size:1rem}
.bc-level-stars{font-size:.7rem;opacity:.8;letter-spacing:-1px}
.bc-options-list{display:flex;flex-direction:column;gap:10px;width:100%;max-width:380px}
.bc-opt-glass{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:16px;background:color-mix(in srgb,var(--text-primary,#fff) 7%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 12%,transparent);backdrop-filter:blur(14px);cursor:pointer}
.bc-opt-text{display:flex;flex-direction:column;gap:2px}
.bc-opt-text strong{font-size:.95rem}
.bc-opt-text span{font-size:.78rem;opacity:.65}
.bc-toggle{position:relative;width:48px;height:28px;flex-shrink:0}
.bc-toggle input{opacity:0;width:0;height:0}
.bc-toggle-slider{position:absolute;inset:0;border-radius:28px;background:color-mix(in srgb,var(--text-primary,#fff) 15%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 18%,transparent);transition:background .2s ease}
.bc-toggle-slider::before{content:'';position:absolute;width:22px;height:22px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:transform .2s ease}
.bc-toggle input:checked+.bc-toggle-slider{background:linear-gradient(135deg,#3AA0FF,#8B7CF6);border-color:transparent}
.bc-toggle input:checked+.bc-toggle-slider::before{transform:translateX(20px)}
.bc-style-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:400px}
.bc-style-card{appearance:none;border:1px solid color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);background:color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);color:inherit;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;cursor:pointer;text-align:left;backdrop-filter:blur(10px)}
.bc-style-card.active{outline:2px solid #3AA0FF}
.bc-style-swatch{width:100%;height:36px;border-radius:10px}
.bc-style-card span{font-size:.75rem;opacity:.7}
.bc-stats{list-style:none;padding:0;margin:0;width:100%;max-width:320px;display:flex;flex-direction:column;gap:8px}
.bc-stats li{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 10%,transparent);backdrop-filter:blur(10px)}
.bc-stars-big{font-size:2rem;letter-spacing:4px;margin:8px 0}
.bc-play-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));flex-wrap:wrap}
.bc-play-meta{flex:1;display:flex;flex-wrap:wrap;gap:8px 12px;font-size:.82rem;font-weight:600;opacity:.9;min-width:0}
.bc-tier{opacity:.65;font-weight:500}
.bc-time-warn{color:#FF6B4A}
.bc-combo{color:#FFC94D;font-weight:800}
.bc-play-actions{display:flex;gap:6px;align-items:center}
.bc-board-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:12px;padding-bottom:max(16px,env(safe-area-inset-bottom));touch-action:none}
.bc-board{position:relative;background:color-mix(in srgb,var(--text-primary,#fff) 4%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 12%,transparent);border-radius:18px;backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,.25);flex-shrink:0}
.bc-cell{position:absolute;border-radius:10px;background:color-mix(in srgb,var(--text-primary,#fff) 5%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);pointer-events:none}
.bc-obstacle{position:absolute;border-radius:10px;background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--text-primary,#fff) 18%,transparent),color-mix(in srgb,var(--text-primary,#fff) 18%,transparent) 4px,color-mix(in srgb,var(--text-primary,#fff) 8%,transparent) 4px,color-mix(in srgb,var(--text-primary,#fff) 8%,transparent) 8px);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 20%,transparent);pointer-events:none;z-index:2}
.bc-block{position:absolute;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:#0a0a12;will-change:left,top,transform,opacity;touch-action:none}
.bc-block.dragging{cursor:grabbing!important;filter:brightness(1.1);box-shadow:0 10px 32px rgba(0,0,0,.4)!important}
.bc-block.exitable{outline:2px solid rgba(255,255,255,.55);outline-offset:1px}
.bc-block.hint{animation:bc-pulse .55s ease}
.bc-block.exiting{pointer-events:none}
@keyframes bc-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.4)}}
.bc-lock,.bc-dir,.bc-size{position:absolute;font-size:.7rem;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5);pointer-events:none}
.bc-lock{top:4px;right:4px}
.bc-dir{bottom:4px;left:6px;font-size:.9rem}
.bc-size{bottom:4px;right:6px;opacity:.7}
@media(max-width:480px){.bc-play-meta{font-size:.75rem;gap:6px 8px}.bc-icon-btn{width:36px;height:36px}.bc-hub{margin:10px auto;padding:20px 14px}}
`