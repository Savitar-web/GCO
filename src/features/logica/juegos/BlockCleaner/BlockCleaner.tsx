/**
 * =============================================================================
 * BlockCleaner.tsx — Color Block Jam style (v18.0 · ALL-IN-ONE)
 * =============================================================================
 * v14.5 — Archivo único: motor + generación + solver + UI.
 * Sin niveles imposibles · candados · axis locks · tableros verticales · 24 colores.
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
  | 'white' | 'black' | 'brown' | 'mint' | 'lavender' | 'peach' | 'navy' | 'crimson'
  | 'forest' | 'scarlet' | 'marine' | 'gold' | 'plum' | 'turquoise'

export const BLOCK_COLOR_ORDER: BlockColor[] = [
  'cyan', 'blue', 'violet', 'orange', 'pink', 'yellow', 'green', 'red',
  'lime', 'teal', 'magenta', 'amber', 'indigo', 'rose', 'sky', 'coral',
  'white', 'black', 'brown', 'mint', 'lavender', 'peach', 'navy', 'crimson',
  'forest', 'scarlet', 'marine', 'gold', 'plum', 'turquoise',
]

export type Direction = 'up' | 'down' | 'left' | 'right'
export type AxisLock = 'horizontal' | 'vertical'
export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Axis = 'horizontal' | 'vertical'

export interface Block {
  id: string
  color: BlockColor
  /** Segundo color: al salir por la puerta primaria, la pieza se convierte en este color */
  secondaryColor?: BlockColor
  row: number
  col: number
  w: number
  h: number
  length?: number
  orientation?: 'horizontal' | 'vertical'
  axisLock?: AxisLock
  forcedDir?: Direction
  lockedUntilClears?: number
  /** Segundos restantes de amenaza; al llegar a 0 → derrota */
  threatSeconds?: number
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
/**
 * Movimiento ortogonal libre siguiendo el puntero.
 * Permite cambiar de eje SIN soltar (recorre caminos en L).
 * 1) Aplica el eje dominante clampado al rango desde el origen.
 * 2) Desde la nueva posición, aplica el eje secundario con rangos recalculados.
 * Así puedes ir horizontal y luego vertical (o al revés) en el mismo gesto.
 */
/**
 * Movimiento ORTOGONAL estricto (nunca diagonal).
 *
 * Interpretación de gesto diagonal (ej. derecha+abajo):
 *   1) Eje dominante → se aplica primero clampado a rangos físicos
 *   2) Eje secundario → se aplica después con rangos recalculados
 *      desde la posición intermedia (camino en L).
 *
 * No atraviesa piezas ni obstáculos: los rangos se calculan celda a celda.
 * El resultado siempre tiene al menos un eje anclado al origen o a la
 * posición intermedia válida (nunca una diagonal libre).
 */
/**
 * Movimiento ORTOGONAL estricto — NUNCA diagonal.
 *
 * Cada frame solo se mueve UN eje (el dominante del gesto desde el origen).
 * Si el gesto es diagonal (ej. derecha+abajo):
 *   - Mientras el eje dominante aún tiene recorrido pendiente, solo ese eje.
 *   - Cuando el dominante está saturado (llegó al clamp), se aplica el secundario.
 * Resultado: camino en L (derecha, después abajo), sin atravesar piezas.
 */
/**
 * ORTOGONAL estricto — un solo eje por actualización.
 * El puntero en diagonal se proyecta al eje dominante del desplazamiento
 * residual desde la posición visual actual hacia el objetivo.
 * Camino en L natural: primero el eje con más residual, luego el otro
 * cuando el primero está bloqueado o saturado.
 */
export function computeOrthogonalDragPosition(
  originRow: number,
  originCol: number,
  deltaRow: number,
  deltaCol: number,
  ranges: { minRow: number; maxRow: number; minCol: number; maxCol: number },
  lockedAxis: Axis | null,
  block?: Block,
  blocks?: Block[],
  obstacles?: Obstacle[],
  rows?: number,
  cols?: number,
  clearedCount?: number,
  currentVisual?: { row: number; col: number }
): { row: number; col: number; axis: Axis | null } {
  const targetRow = originRow + deltaRow
  const targetCol = originCol + deltaCol
  let row = currentVisual ? currentVisual.row : originRow
  let col = currentVisual ? currentVisual.col : originCol

  const resR = targetRow - row
  const resC = targetCol - col
  const absR = Math.abs(resR)
  const absC = Math.abs(resC)
  const DEAD = 0.03

  if (absR < DEAD && absC < DEAD) {
    return { row, col, axis: lockedAxis }
  }

  // Solo el eje con MAYOR residual (ignora la componente diagonal)
  let axis: Axis = absC >= absR ? 'horizontal' : 'vertical'

  // Rangos desde la celda actual (anti-solape)
  let rMin = ranges.minRow, rMax = ranges.maxRow, cMin = ranges.minCol, cMax = ranges.maxCol
  if (block && blocks && obstacles && rows != null && cols != null && clearedCount != null) {
    const virtual = normalizeBlock({
      ...block,
      row: Math.round(row),
      col: Math.round(col),
    })
    const dyn = computeFreeSlideRanges(virtual, blocks, obstacles, rows, cols, clearedCount)
    rMin = dyn.minRow; rMax = dyn.maxRow; cMin = dyn.minCol; cMax = dyn.maxCol
  }

  if (axis === 'horizontal') {
    const next = clampNum(targetCol, cMin, cMax)
    // Si no puede avanzar en H, intentar V (L cuando hay bloqueo)
    if (Math.abs(next - col) < DEAD && absR > DEAD) {
      axis = 'vertical'
      row = clampNum(targetRow, rMin, rMax)
    } else {
      col = next
    }
  } else {
    const next = clampNum(targetRow, rMin, rMax)
    if (Math.abs(next - row) < DEAD && absC > DEAD) {
      axis = 'horizontal'
      col = clampNum(targetCol, cMin, cMax)
    } else {
      row = next
    }
  }

  return { row, col, axis }
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

  // Tablero crece de forma visible
  let rows = 6
  let cols = 6
  if (L >= 5) { rows = 6; cols = 7 }
  if (L >= 9) { rows = 7; cols = 7 }
  if (L >= 13) { rows = 7; cols = 8 }
  if (L >= 18) { rows = 8; cols = 8 }
  if (L >= 24) { rows = 8; cols = 9 }
  if (L >= 30) { rows = 9; cols = 9 }
  if (L >= 35) { rows = 9; cols = 10 }
  if (L >= 45) { rows = 10; cols = 10 }
  if (L >= 60) { rows = 10; cols = 11 }
  if (L >= 80) { rows = 11; cols = 11 }
  if (L >= 100) {
    rows = clampNum(11 + Math.floor((L - 100) / 30), 11, 13)
    cols = rows
  }
  if (L >= 10 && L % 7 === 0) {
    rows = clampNum(rows + 1, 6, 14)
    cols = clampNum(Math.max(6, cols - 1), 6, 12)
  }

  // Piezas densas (el 35 debe verse lleno)
  let numBlocks = 8 + Math.floor(L * 0.5) + Math.floor(L / 5)
  if (L >= 35) numBlocks = Math.max(numBlocks, 22 + Math.floor((L - 35) / 3))
  if (L >= 50) numBlocks = Math.max(numBlocks, 28 + Math.floor((L - 50) / 4))
  numBlocks = clampNum(numBlocks, 8, rows * cols - 4)

  // MUCHOS colores (no solo 4)
  let numColors = 5 + Math.floor(L / 3)
  if (L >= 13) numColors = Math.max(numColors, 9)
  if (L >= 24) numColors = Math.max(numColors, 12)
  if (L >= 35) numColors = Math.max(numColors, 14)
  if (L >= 50) numColors = Math.max(numColors, 16)
  numColors = clampNum(numColors, 5, BLOCK_COLOR_ORDER.length)

  const scrambleMoves = clampNum(50 + L * 3, 50, 240)
  const maxDim = L < 6 ? 2 : L < 18 ? 3 : 4
  const allowSquares = L >= 4
  const timeLimitBase = clampNum(150 + L * 3, 140, 500)

  // Obstáculos desde 15
  let obstacleCount = 0
  if (L >= 15) {
    obstacleCount = 1 + Math.floor((L - 15) / 5)
    if (L >= 35) obstacleCount = Math.max(obstacleCount, 2)
    if (L >= 50) obstacleCount = Math.max(obstacleCount, 3)
    obstacleCount = clampNum(obstacleCount, 1, 8)
  }

  // Candados desde 10
  let lockedChance = 0
  let lockedClearsMin = 0
  let lockedClearsMax = 0
  if (L >= 10) {
    lockedChance = clampNum(0.5 + (L - 10) * 0.01, 0.5, 0.85)
    lockedClearsMin = 1
    lockedClearsMax = clampNum(2 + Math.floor((L - 10) / 10), 2, 6)
  }

  let axisLockChance = 0
  if (L >= 44) axisLockChance = clampNum(0.18 + (L - 44) * 0.005, 0.18, 0.4)

  let label = 'Tutorial'
  if (L >= 100) label = 'Maestro'
  else if (L >= 70) label = 'Experto+'
  else if (L >= 50) label = 'Experto'
  else if (L >= 44) label = 'Avanzado+'
  else if (L >= 35) label = 'Avanzado'
  else if (L >= 24) label = 'Intermedio+'
  else if (L >= 15) label = 'Intermedio'
  else if (L >= 10) label = 'Principiante+'
  else if (L >= 5) label = 'Principiante'

  return {
    rows,
    cols,
    numBlocks: Math.min(numBlocks, rows * cols - 3 - obstacleCount),
    numColors,
    obstacleCount,
    maxDim,
    allowSquares,
    scrambleMoves,
    axisLockChance,
    lockedChance,
    lockedClearsMin,
    lockedClearsMax,
    timeLimitBase,
    label,
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
  const palette = [...BLOCK_COLOR_ORDER]
  shuffle(rng, palette)
  // Priorizar variedad visual: mezclar siempre la paleta completa
  const colors = palette.slice(0, Math.max(2, tier.numColors))
  const shapes = shapesForTier(tier)
  const sides: Side[] = ['top', 'bottom', 'left', 'right']

  type Planned = { color: BlockColor; w: number; h: number }
  const planned: Planned[] = []
  for (let i = 0; i < tier.numBlocks; i++) {
    // Garantizar que aparezcan TODOS los colores del tramo al menos una vez
    const color = i < colors.length ? colors[i % colors.length]! : pickItem(rng, colors)
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
    // Puerta = huella de la pieza MÁS GRANDE de ese color en ese lado
    // top/bottom → ancho (w); left/right → alto (h)
    const need = Math.max(1, ...same.map((p) => (preferred === 'left' || preferred === 'right') ? p.h : p.w))
    const boundaryLen = preferred === 'top' || preferred === 'bottom' ? cols : rows
    // NUNCA reducir por debajo de need: si no cabe en el borde, fallar este lado
    if (need > boundaryLen) return false
    const length = need
    for (let attempt = 0; attempt < 60; attempt++) {
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
        const need = Math.max(1, ...same2.map((p) => (side === 'left' || side === 'right') ? p.h : p.w))
        const boundaryLen = side === 'top' || side === 'bottom' ? cols : rows
        if (need > boundaryLen) continue
        const length = need
        const overlap = usedSlots.some(
          (u) => u.side === side && 0 < u.pos + u.length && length > u.pos
        )
        if (overlap) continue
        exits.push({ id: `e${exits.length + 1}`, color, side, pos: 0, length })
        usedSlots.push({ side, pos: 0, length })
        placed = true
        break
      }
    }
    // Si no hay puerta válida para este color, abortar nivel
    if (!placed) return null
  }

  // Forzar tamaño de puerta según planned (antes de colocar en el tablero)
  for (const e of exits) {
    const same = planned.filter((p) => p.color === e.color)
    if (!same.length) continue
    const need = Math.max(1, ...same.map((p) => (e.side === 'left' || e.side === 'right') ? p.h : p.w))
    const boundary = e.side === 'top' || e.side === 'bottom' ? cols : rows
    if (need > boundary) return null
    e.length = need
    if (e.pos + e.length > boundary) e.pos = Math.max(0, boundary - e.length)
  }

  const colorExit = new Map<BlockColor, Exit>()
  for (const e of exits) colorExit.set(e.color, e)
  if (colorExit.size === 0) return null
  // Validar: toda pieza planificada debe caber en la puerta de su color
  for (const p of planned) {
    const ex = colorExit.get(p.color)
    if (!ex) return null
    if (((ex.side === 'left' || ex.side === 'right') ? p.h : p.w) > ex.length) return null
  }

  const occupied = new Set<string>()
  // Obstáculos se colocan DESPUÉS de las piezas (evita sellar rutas)
  const obstacles: Obstacle[] = []

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
  // Reafirmar tamaño de puertas tras scramble (seguridad)
  for (const e of exits) {
    const same = blocks.filter((b) => b.color === e.color)
    if (!same.length) continue
    const need = Math.max(1, ...same.map((b) => footprintAlongSide(b, e.side)))
    const boundary = e.side === 'top' || e.side === 'bottom' ? cols : rows
    e.length = Math.min(Math.max(need, e.length), boundary)
    if (e.pos + e.length > boundary) e.pos = Math.max(0, boundary - e.length)
  }

  for (let i = 0; i < n; i++) {
    const guaranteed = n - 1 - i
    if (
      tier.lockedChance > 0 &&
      guaranteed >= Math.max(1, tier.lockedClearsMin) &&
      rng() < tier.lockedChance
    ) {
      const maxLock = Math.min(Math.max(1, tier.lockedClearsMax), guaranteed)
      blocks[i].lockedUntilClears = pickInt(rng, Math.max(1, tier.lockedClearsMin), maxLock)
    }
  }
  // Garantizar candados visibles desde nivel 10
  if (safeId >= 10) {
    const lockedNow = blocks.filter((b) => b.lockedUntilClears).length
    const needLocks = safeId >= 100 ? 3 : safeId >= 50 ? 2 : safeId >= 20 ? 2 : 1
    if (lockedNow < needLocks) {
      const unlocked = blocks
        .map((b, idx) => ({ b, idx }))
        .filter((x) => !x.b.lockedUntilClears)
      for (let k = 0; k < needLocks - lockedNow && k < unlocked.length - 1; k++) {
        const { idx } = unlocked[k]
        const guaranteed = n - 1 - idx
        if (guaranteed >= 1) {
          blocks[idx].lockedUntilClears = pickInt(rng, 1, Math.min(3, guaranteed))
        }
      }
    }
  }
  // Niveles 100+: más axis locks forzados
  if (safeId >= 100) {
    for (const b of blocks) {
      if (!b.axisLock && rng() < 0.22) {
        const ex = colorExit.get(b.color)
        if (ex) {
          b.axisLock = (ex.side === 'left' || ex.side === 'right') ? 'horizontal' : 'vertical'
          b.forcedDir =
            ex.side === 'left' ? 'left' : ex.side === 'right' ? 'right' : ex.side === 'top' ? 'up' : 'down'
        }
      }
    }
  }

  // Niveles 35+: amenaza de tiempo ocasional (1 pieza)
  if (safeId >= 35 && rng() < (safeId >= 50 ? 0.55 : safeId >= 40 ? 0.4 : 0.32)) {
    const movable = blocks.filter((b) => !b.lockedUntilClears)
    if (movable.length) {
      const target = pickItem(rng, movable)
      target.threatSeconds = pickInt(rng, 20, safeId >= 70 ? 35 : 28)
    }
  }

  // Niveles 35+: pieza bicolor ocasional (debe usar puerta secundaria al “reaparecer” lógica simplificada:
  // secondaryColor marca que necesita la puerta del 2º color también — UI/motor: sale solo si ambas puertas existen;
  // al salir por color primario, si tiene secondary, se convierte en el secundario en el mismo sitio)
  if (safeId >= 24 && rng() < (safeId >= 40 ? 0.45 : safeId >= 30 ? 0.35 : 0.28)) {
    const candidates = blocks.filter((b) => !b.threatSeconds)
    if (candidates.length && usedColors.length >= 2) {
      const target = pickItem(rng, candidates)
      const other = usedColors.find((c) => c !== target.color) || usedColors[0]
      if (other !== target.color) target.secondaryColor = other
    }
  }


  // Scramble más controlado (menos probabilidad de estados imposibles)
  let current = blocks.map((b) => ({ ...b }))
  let lastId: string | null = null
  const scrambleSteps = Math.min(tier.scrambleMoves, Math.max(20, tier.numBlocks * (safeId >= 25 ? 6 : 4)))
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
  for (let pass = 0; pass < 8; pass++) {
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

  // Último intento de empujar salidas inmediatas
  if (countUnlockedExitable(current, exits, obstacles, rows, cols) > 0) {
    for (let pass = 0; pass < 10; pass++) {
      let moved = false
      for (const block of [...current]) {
        if (block.lockedUntilClears) continue
        const exit = colorExit.get(block.color)
        if (!exit || !canExit(block, exit, current, obstacles, rows, cols, 999)) continue
        const before = current
        current = nudgeBlock(current, block.id, obstacles, rows, cols, rng)
        if (current !== before) moved = true
      }
      if (!moved) break
    }
    if (countUnlockedExitable(current, exits, obstacles, rows, cols) > 0) return null
  }

  // Solver más estricto en niveles pequeños/medios
  const maxNodes = tier.numBlocks <= 6 ? 4000 : tier.numBlocks <= 10 ? 2500 : 0  // 0 = skip solver
  const solution = maxNodes > 0 ? solveLevel(current, exits, obstacles, rows, cols, 0, maxNodes) : null

  if (solution === null && tier.numBlocks <= 6 && maxNodes > 0) {
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
    Math.round(
      (solution ? solution.length : tier.scrambleMoves * 0.5) +
      current.length * (safeId >= 30 ? 1.35 : safeId >= 15 ? 1.05 : 0.8) +
      (safeId >= 35 ? 8 : safeId >= 20 ? 4 : 0)
    )
  )

  // Empujar piezas lo MÁS LEJOS posible de su puerta (prioridad de dificultad)
  {
    const colorEx = new Map(exits.map(e => [e.color, e] as const))
    const distToExit = (b: Block, ex: Exit) => {
      if (ex.side === 'left') return b.col
      if (ex.side === 'right') return (cols - blockWidth(b)) - b.col
      if (ex.side === 'top') return b.row
      return (rows - blockHeight(b)) - b.row
    }
    for (let pass = 0; pass < 4; pass++) {
      for (const b of [...current]) {
        if (b.lockedUntilClears) continue
        const ex = colorEx.get(b.color)
        if (!ex) continue
        const ranges = computeFreeSlideRanges(b, current, obstacles, rows, cols, 999)
        let best = { row: b.row, col: b.col, dist: distToExit(b, ex) }
        const candidates: Array<{ row: number; col: number }> = [
          { row: b.row, col: ranges.minCol },
          { row: b.row, col: ranges.maxCol },
          { row: ranges.minRow, col: b.col },
          { row: ranges.maxRow, col: b.col },
        ]
        // también puntos intermedios para no quedar en la puerta
        if (ranges.maxCol > ranges.minCol) {
          candidates.push({ row: b.row, col: Math.round((ranges.minCol + ranges.maxCol) / 2) })
        }
        if (ranges.maxRow > ranges.minRow) {
          candidates.push({ row: Math.round((ranges.minRow + ranges.maxRow) / 2), col: b.col })
        }
        for (const c of candidates) {
          const virtual = normalizeBlock({ ...b, row: c.row, col: c.col })
          const d = distToExit(virtual, ex)
          if (d > best.dist) best = { row: c.row, col: c.col, dist: d }
        }
        if (best.row !== b.row || best.col !== b.col) {
          current = current.map(x => x.id === b.id ? normalizeBlock({ ...x, row: best.row, col: best.col }) : x)
        }
      }
    }
    // Eliminar salidas inmediatas con más fuerza
    for (let pass = 0; pass < 8; pass++) {
      if (countUnlockedExitable(current, exits, obstacles, rows, cols) === 0) break
      for (const b of [...current]) {
        if (b.lockedUntilClears) continue
        const ex = colorEx.get(b.color)
        if (!ex || !canExit(b, ex, current, obstacles, rows, cols, 999)) continue
        current = nudgeBlock(current, b.id, obstacles, rows, cols, rng)
      }
    }
  }

  // === Obstáculos estratégicos (solo celdas libres, lejos de puertas) ===
  if (tier.obstacleCount > 0) {
    const occ = new Set<string>()
    for (const b of current) {
      for (let dr = 0; dr < b.h; dr++)
        for (let dc = 0; dc < b.w; dc++) occ.add(cellKey(b.row + dr, b.col + dc))
    }
    const candidates: Array<{ row: number; col: number }> = []
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (occ.has(cellKey(r, c))) continue
        // Nunca en el corredor de una puerta (toda la franja hacia el interior)
        let bad = false
        for (const e of exits) {
          if (e.side === 'left' && c <= 2 && r >= e.pos && r < e.pos + e.length) bad = true
          if (e.side === 'right' && c >= cols - 3 && r >= e.pos && r < e.pos + e.length) bad = true
          if (e.side === 'top' && r <= 2 && c >= e.pos && c < e.pos + e.length) bad = true
          if (e.side === 'bottom' && r >= rows - 3 && c >= e.pos && c < e.pos + e.length) bad = true
        }
        // Preferir centro del tablero (no bordes)
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) bad = true
        if (!bad) candidates.push({ row: r, col: c })
      }
    }
    shuffle(rng, candidates)
    for (let i = 0; i < tier.obstacleCount && i < candidates.length; i++) {
      const { row, col } = candidates[i]
      // Verificar que tras poner obstáculo sigue habiendo movimiento posible
      const trial = [...obstacles, { id: `o${obstacles.length + 1}`, row, col }]
      let stillOk = false
      for (const b of current) {
        if (!isBlockMovable(b, 0)) continue
        const ranges = computeFreeSlideRanges(b, current, trial, rows, cols, 0)
        if (ranges.minRow < b.row || ranges.maxRow > b.row || ranges.minCol < b.col || ranges.maxCol > b.col) {
          stillOk = true
          break
        }
      }
      if (!stillOk && current.length > 1) continue
      obstacles.push({ id: `o${obstacles.length + 1}`, row, col })
    }
  }


  // Atascar el tablero: empujar piezas hacia el centro / entre sí (menos movilidad)
  if (safeId >= 12) {
    for (let pass = 0; pass < (safeId >= 30 ? 5 : 3); pass++) {
      for (const b of [...current]) {
        if (b.lockedUntilClears) continue
        const ranges = computeFreeSlideRanges(b, current, obstacles, rows, cols, 999)
        // Elegir posición con MENOR movilidad restante (atasco), no la más lejos
        const opts: Array<{ row: number; col: number }> = [
          { row: b.row, col: ranges.minCol },
          { row: b.row, col: ranges.maxCol },
          { row: ranges.minRow, col: b.col },
          { row: ranges.maxRow, col: b.col },
        ]
        let bestPos = { row: b.row, col: b.col, mob: 999 }
        for (const o of opts) {
          if (o.row === b.row && o.col === b.col) continue
          const trial = normalizeBlock({ ...b, row: o.row, col: o.col })
          const others = current.map(x => x.id === b.id ? trial : x)
          const rr = computeFreeSlideRanges(trial, others, obstacles, rows, cols, 999)
          const mob = (rr.maxRow - rr.minRow) + (rr.maxCol - rr.minCol)
          if (mob < bestPos.mob) bestPos = { row: o.row, col: o.col, mob }
        }
        if (bestPos.mob < 999) {
          current = current.map(x => x.id === b.id ? normalizeBlock({ ...x, row: bestPos.row, col: bestPos.col }) : x)
        }
      }
    }
  }

  // Rechazar si demasiadas piezas siguen cerca de su puerta (evita niveles fáciles)
  {
    const colorEx = new Map(exits.map(e => [e.color, e] as const))
    let tooClose = 0
    for (const b of current) {
      const ex = colorEx.get(b.color)
      if (!ex) continue
      let dist = 0
      if (ex.side === 'left') dist = b.col
      else if (ex.side === 'right') dist = cols - blockWidth(b) - b.col
      else if (ex.side === 'top') dist = b.row
      else dist = rows - blockHeight(b) - b.row
      // "cerca" = distancia 0 o 1 hacia la pared de salida
      if (dist <= 1) tooClose++
    }
    // Como máximo 1 pieza puede estar cerca (y preferible 0)
    if (tooClose > 1) return null
  }

  // === VALIDACIÓN FINAL ANTI-IMPOSIBLE ===
  current = current.map(normalizeBlock)
  for (const e of exits) {
    const same = current.filter((b) => b.color === e.color)
    if (!same.length) continue
    const need = Math.max(1, ...same.map((b) => footprintAlongSide(b, e.side)))
    const boundary = e.side === 'top' || e.side === 'bottom' ? cols : rows
    if (need > boundary) return null
    e.length = need
    if (e.pos + e.length > boundary) e.pos = Math.max(0, boundary - e.length)
  }
  for (const b of current) {
    const ex = exits.find((e) => e.color === b.color)
    if (!ex) return null
    if (footprintAlongSide(b, ex.side) > ex.length) return null
  }
  // Al menos debe haber un movimiento legal o una salida posible en el tablero
  let anyProgress = false
  for (const b of current) {
    if (!isBlockMovable(b, 0)) continue
    const ranges = computeFreeSlideRanges(b, current, obstacles, rows, cols, 0)
    if (ranges.minRow < b.row || ranges.maxRow > b.row || ranges.minCol < b.col || ranges.maxCol > b.col) {
      anyProgress = true
      break
    }
    if (canExit(b, exits.find((e) => e.color === b.color)!, current, obstacles, rows, cols, 0)) {
      anyProgress = true
      break
    }
  }
  if (!anyProgress && current.length > 0) return null

  // Solver ligero solo en tutorial (evita freezes al cargar)
  if (current.length <= 6) {
    const sol = solveLevel(current, exits, obstacles, rows, cols, 0, 2500)
    if (sol === null) return null
  }
  // Comprobar que ninguna pieza axis-lock tenga puerta en eje incompatible
  for (const b of current) {
    if (!b.axisLock) continue
    const ex = exits.find(e => e.color === b.color)
    if (!ex) return null
    const exitAxis = (ex.side === 'left' || ex.side === 'right') ? 'horizontal' : 'vertical'
    if (b.axisLock !== exitAxis) {
      // Corregir en lugar de fallar
      b.axisLock = exitAxis as AxisLock
      b.forcedDir = ex.side === 'left' ? 'left' : ex.side === 'right' ? 'right' : ex.side === 'top' ? 'up' : 'down'
    }
  }

  return {
    id: safeId,
    rows,
    cols,
    blocks: current,
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
/** Cache en memoria para no regenerar el mismo nivel en la misma sesión */
const _levelCache = new Map<number, BlockCleanerLevel>() // v18.0 HARD RESET

/**
 * Genera un nivel único por id. Siempre produce distribución distinta (seed).
 * Prioriza jugabilidad: scramble legal + empujar salidas inmediatas.
 * Solver pesado solo en niveles muy pequeños.
 */

/** Puntúa dureza lógica: más alto = más "gimnasio mental" */
function scoreLevelHardness(level: BlockCleanerLevel): number {
  const { blocks, exits, obstacles, rows, cols } = level
  const totalCells = rows * cols
  const occupied = blocks.reduce((s, b) => s + blockWidth(b) * blockHeight(b), 0) + obstacles.length
  const fill = occupied / Math.max(1, totalCells)
  const immediate = countUnlockedExitable(blocks, exits, obstacles, rows, cols)

  // Movilidad media: rangos de deslizamiento (menos = más atascado)
  let mobility = 0
  for (const b of blocks) {
    if (!isBlockMovable(b, 0)) continue
    const r = computeFreeSlideRanges(b, blocks, obstacles, rows, cols, 0)
    mobility += (r.maxRow - r.minRow) + (r.maxCol - r.minCol)
  }
  const avgMobility = mobility / Math.max(1, blocks.length)

  // Distancia media a puerta
  let distSum = 0
  for (const b of blocks) {
    const ex = exits.find(e => e.color === b.color)
    if (!ex) continue
    if (ex.side === 'left') distSum += b.col
    else if (ex.side === 'right') distSum += cols - blockWidth(b) - b.col
    else if (ex.side === 'top') distSum += b.row
    else distSum += rows - blockHeight(b) - b.row
  }
  const avgDist = distSum / Math.max(1, blocks.length)

  const locks = blocks.filter(b => b.lockedUntilClears).length
  const threats = blocks.filter(b => b.threatSeconds != null).length
  const duals = blocks.filter(b => b.secondaryColor).length
  const axis = blocks.filter(b => b.axisLock).length

  // Penalizar salidas inmediatas fuerte; recompensar fill, distancia, mecánicas
  let score = 0
  score += fill * 4000
  score += blocks.length * 40
  score += avgDist * 120
  score += locks * 80 + threats * 100 + duals * 90 + axis * 70
  score += obstacles.length * 60
  score -= immediate * 900
  score -= avgMobility * 50
  // Ideal: 0 salidas inmediatas
  if (immediate === 0) score += 2000
  else if (immediate === 1) score += 400
  return score
}

export function generateLevel(levelId: number): BlockCleanerLevel {
  try {
    const safeId = Math.max(1, Math.floor(Number(levelId)) || 1)
    const cached = _levelCache.get(safeId)
    if (cached) return cached

    const tier = getDifficultyTier(safeId)
    const baseSeed = (safeId * 2654435761 + 41) >>> 0
    // Más intentos en niveles altos: elegir el más "gimnasio mental"
    const maxAttempts = safeId <= 8 ? 4 : safeId <= 20 ? 6 : safeId <= 40 ? 8 : 10

    let best: BlockCleanerLevel | null = null
    let bestScore = -Infinity

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const seed = (baseSeed + attempt * 9973 + attempt * 37 + safeId * 13) >>> 0
      const level = generateLevelOnce(safeId, tier, seed)
      if (!level || level.blocks.length < 2) continue

      let fitOk = true
      for (const b of level.blocks) {
        const ex = level.exits.find((e) => e.color === b.color)
        if (!ex || footprintAlongSide(b, ex.side) > ex.length) { fitOk = false; break }
      }
      if (!fitOk) continue

      const immediate = countUnlockedExitable(
        level.blocks, level.exits, level.obstacles, level.rows, level.cols
      )
      // Niveles altos: rechazar si hay demasiadas salidas gratis
      if (safeId >= 15 && immediate > 2) continue
      if (safeId >= 30 && immediate > 1) continue

      const score = scoreLevelHardness(level)
      if (score > bestScore) {
        bestScore = score
        best = level
      }
      // En tutorial aceptar pronto; en avanzado seguir buscando más duro
      if (immediate === 0 && safeId < 12 && score > 3000) {
        _levelCache.set(safeId, level)
        return level
      }
    }

    if (best) {
      _levelCache.set(safeId, best)
      return best
    }

    // Fallback VARIADO por nivel (no el mismo siempre)
    const fb = buildVariedFallback(safeId, tier, baseSeed)
    _levelCache.set(safeId, fb)
    return fb
  } catch {
    return buildVariedFallback(Math.max(1, levelId | 0), getDifficultyTier(1), 1)
  }
}

/** Fallback distinto por nivel para que 1..N no se vean iguales */
function buildVariedFallback(
  safeId: number,
  tier: DifficultyTierConfig,
  seed: number
): BlockCleanerLevel {
  const rng = mulberry32(seed ^ (safeId * 0x9e3779b9))
  const rows = Math.min(tier.rows, 6)
  const cols = Math.min(tier.cols, 6)
  const colors = BLOCK_COLOR_ORDER.slice(0, Math.max(3, Math.min(tier.numColors, 5)))
  const exits: Exit[] = []
  const used: Array<{ side: Side; pos: number; length: number }> = []
  const sides: Side[] = ['left', 'right', 'top', 'bottom']

  for (let i = 0; i < colors.length; i++) {
    const side = sides[(i + safeId) % 4]
    const boundary = side === 'top' || side === 'bottom' ? cols : rows
    const length = 1 + (safeId + i) % 2
    const pos = Math.min((safeId * 3 + i * 2) % Math.max(1, boundary - length + 1), Math.max(0, boundary - length))
    const overlap = used.some(u => u.side === side && pos < u.pos + u.length && pos + length > u.pos)
    if (overlap) continue
    exits.push({ id: `e${i + 1}`, color: colors[i], side, pos, length })
    used.push({ side, pos, length })
  }
  if (!exits.length) {
    exits.push({ id: 'e1', color: 'cyan', side: 'right', pos: 1, length: 2 })
  }

  const occupied = new Set<string>()
  const blocks: Block[] = []
  const nBlocks = Math.min(tier.numBlocks, 4 + (safeId % 4))
  for (let i = 0; i < nBlocks; i++) {
    const color = colors[i % colors.length]
    const w = 1 + ((safeId + i) % 3 === 0 ? 1 : 0)
    const h = 1 + ((safeId + i) % 5 === 0 ? 1 : 0)
    let placed = false
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const row = pickInt(rng, 0, rows - h)
      const col = pickInt(rng, 0, cols - w)
      if (canPlace({ w, h }, row, col, rows, cols, occupied)) {
        for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) occupied.add(`${row + dr}:${col + dc}`)
        blocks.push(normalizeBlock({ id: `b${i + 1}`, color, row, col, w, h }))
        placed = true
      }
    }
  }
  if (blocks.length < 2) {
    return {
      ...FALLBACK_LEVEL,
      id: safeId,
      difficulty: safeId,
      seed,
      tierLabel: tier.label,
      blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
    }
  }

  // Ajustar longitud de puertas al tamaño real de las piezas de cada color
  for (const ex of exits) {
    const same = blocks.filter(b => b.color === ex.color)
    if (!same.length) continue
    const need = Math.max(1, ...same.map(b => footprintAlongSide(b, ex.side)))
    const boundary = ex.side === 'top' || ex.side === 'bottom' ? cols : rows
    ex.length = Math.min(Math.max(need, ex.length), boundary)
    if (ex.pos + ex.length > boundary) ex.pos = Math.max(0, boundary - ex.length)
  }

  // Empujar salidas inmediatas
  let current = blocks
  for (let pass = 0; pass < 6; pass++) {
    let fixed = false
    for (const b of [...current]) {
      const exit = exits.find(e => e.color === b.color)
      if (!exit || !canExit(b, exit, current, [], rows, cols, 999)) continue
      const hR = computeSlideRangeOnAxis(b, 'horizontal', current, [], rows, cols, 999)
      const vR = computeSlideRangeOnAxis(b, 'vertical', current, [], rows, cols, 999)
      const opts: Array<{ row: number; col: number }> = []
      for (let v = hR.min; v <= hR.max; v++) if (v !== b.col) opts.push({ row: b.row, col: v })
      for (let v = vR.min; v <= vR.max; v++) if (v !== b.row) opts.push({ row: v, col: b.col })
      if (opts.length) {
        const t = pickItem(rng, opts)
        current = current.map(x => x.id === b.id ? normalizeBlock({ ...x, row: t.row, col: t.col }) : x)
        fixed = true
      }
    }
    if (!fixed) break
  }

  return {
    id: safeId,
    rows,
    cols,
    blocks: current.map(normalizeBlock),
    exits,
    obstacles: [],
    difficulty: safeId,
    parMoves: Math.max(4, current.length * 2),
    timeLimit: Math.max(90, tier.timeLimitBase),
    seed,
    tierLabel: tier.label,
  }
}


const SOLVER_CAP = 6000

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
  const sol = solveLevel(blocks, exits, obstacles, rows, cols, clearedCount, 2000)
  if (sol && sol.length > 0) return sol[0]
  return heuristicHint(blocks, exits, obstacles, rows, cols, clearedCount)
}

// -----------------------------------------------------------------------------
// Estrellas y utilidades
// -----------------------------------------------------------------------------
export function starsForMoves(moves: number, par: number): 1 | 2 | 3 {
  const p = Math.max(1, par)
  // 3★: ≤ par · 2★: ≤ par*1.55 · 1★: resto (más exigente)
  if (moves <= p) return 3
  if (moves <= Math.ceil(p * 1.55) + 2) return 2
  return 1
}

export function starsForTime(seconds: number, limit: number): 1 | 2 | 3 {
  const lim = Math.max(30, limit)
  if (seconds <= lim * 0.35) return 3
  if (seconds <= lim * 0.65) return 2
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

export const ENGINE_VERSION = '18.0.0'
export const ENGINE_NAME = 'BlockCleaner / Color Block Jam style'

export const COLOR_DISPLAY_NAMES: Record<BlockColor, string> = {
  cyan: 'Cian', blue: 'Azul', violet: 'Violeta', orange: 'Naranja', pink: 'Rosa',
  yellow: 'Amarillo', green: 'Verde', red: 'Rojo', lime: 'Lima', teal: 'Verde azulado',
  magenta: 'Magenta', amber: 'Ámbar', indigo: 'Índigo', rose: 'Rosa intenso', sky: 'Cielo',
  coral: 'Coral', white: 'Blanco', black: 'Negro', brown: 'Café', mint: 'Menta',
  lavender: 'Lavanda', peach: 'Durazno', navy: 'Azul marino', crimson: 'Carmesí', forest: 'Verde fuerte', scarlet: 'Rojo fuerte',
  marine: 'Azul marino', gold: 'Dorado', plum: 'Ciruela', turquoise: 'Turquesa',
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
  current: 'bc.v180.current', unlocked: 'bc.v180.unlocked', scores: 'bc.v180.scores', moves: 'bc.v180.moves',
  times: 'bc.v180.times', defeats: 'bc.v180.defeats', style: 'bc.v180.style', options: 'bc.v180.options',
  wins: 'bc.v180.wins', totalMoves: 'bc.v180.totalMoves', streak: 'bc.v180.streak', bestStreak: 'bc.v180.bestStreak', bestCombo: 'bc.v180.bestCombo', regen: 'bc.v180.regen',
}
function readJSON<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

/** Sincroniza con getGameProgress('logica', 'blockcleaner') del hub de GCO */
function syncBlockCleanerProgress(highestLevel: number) {
  try {
    const keys = [
      'gco:gameProgress:logica:blockcleaner',
      'gco.progress.logica.blockcleaner',
      'progress_logica_blockcleaner',
      'gameProgress:logica:blockcleaner',
    ]
    for (const key of keys) {
      let data: Record<string, unknown> = {}
      try {
        const raw = localStorage.getItem(key)
        if (raw) data = JSON.parse(raw) as Record<string, unknown>
      } catch { /* */ }
      const prev = typeof data.highestLevel === 'number' ? data.highestLevel : 0
      data.highestLevel = Math.max(prev, highestLevel)
      data.lastPlayed = Date.now()
      localStorage.setItem(key, JSON.stringify(data))
    }
    // Almacén anidado tipo { logica: { blockcleaner: { highestLevel } } }
    for (const root of ['gco.progress', 'gco:progress', 'gameProgress']) {
      try {
        const raw = localStorage.getItem(root)
        const tree = raw ? JSON.parse(raw) as Record<string, unknown> : {}
        const logica = (tree.logica as Record<string, unknown>) || {}
        const bc = (logica.blockcleaner as Record<string, unknown>) || {}
        const prev = typeof bc.highestLevel === 'number' ? bc.highestLevel : 0
        bc.highestLevel = Math.max(prev, highestLevel)
        logica.blockcleaner = bc
        tree.logica = logica
        localStorage.setItem(root, JSON.stringify(tree))
      } catch { /* */ }
    }
    const w = window as unknown as {
      __GCO_SET_PROGRESS?: (cat: string, id: string, p: { highestLevel: number }) => void
    }
    w.__GCO_SET_PROGRESS?.('logica', 'blockcleaner', { highestLevel })
  } catch { /* noop */ }
}

function playSfx(kind: string) {
  try {
    const click = () => { try { soundClick() } catch { /* noop */ } }
    // Beeps extra vía Web Audio (funciona offline / PWA)
    const beep = (freq: number, dur = 0.06, type: OscillatorType = 'sine', vol = 0.08) => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        const ctx = new AC()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = type
        o.frequency.value = freq
        g.gain.value = vol
        o.connect(g)
        g.connect(ctx.destination)
        o.start()
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
        o.stop(ctx.currentTime + dur)
        setTimeout(() => { try { ctx.close() } catch { /* */ } }, (dur + 0.05) * 1000)
      } catch { /* noop */ }
    }
    if (kind === 'move') {
      click()
      beep(420, 0.04, 'triangle', 0.05)
    } else if (kind === 'exit') {
      click()
      beep(520, 0.05); setTimeout(() => beep(680, 0.06), 50); setTimeout(() => beep(840, 0.08), 110)
    } else if (kind === 'hint') {
      click(); beep(600, 0.05); setTimeout(() => beep(720, 0.06), 60)
    } else if (kind === 'win') {
      click()
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'sine', 0.09), i * 90))
    } else if (kind === 'lose') {
      click()
      beep(200, 0.15, 'sawtooth', 0.07); setTimeout(() => beep(140, 0.2, 'sawtooth', 0.06), 120)
    } else if (kind === 'lock') {
      click(); beep(180, 0.08, 'square', 0.05)
    } else if (kind === 'combo') {
      click(); beep(700, 0.04); setTimeout(() => beep(900, 0.05), 40)
    } else if (kind === 'tick') {
      // tick-tack de presión
      beep(880, 0.035, 'square', 0.06)
      setTimeout(() => beep(660, 0.03, 'square', 0.04), 80)
    } else if (kind === 'regen') {
      click(); beep(400, 0.05); setTimeout(() => beep(550, 0.06), 70)
    } else if (kind === 'ui') {
      click(); beep(500, 0.03, 'sine', 0.04)
    } else {
      click()
    }
  } catch {
    /* noop */
  }
}

export type BlockStyle = 'liquid-glass' | 'metallic' | 'matte' | 'neon' | 'pastel' | 'crystal' | 'candy' | 'obsidian' | 'hologram' | 'velvet' | 'retro' | 'aurora' | 'ice' | 'magma' | 'gold' | 'shadow' | 'bubble' | 'circuit' | 'chrome' | 'wood' | 'paper' | 'emerald' | 'sapphire' | 'ruby' | 'smoke' | 'plasma' | 'neon-grid' | 'sunset' | 'ocean' | 'carbon' | 'prism' | 'ink' | 'lava-glass' | 'mint-frost' | 'pulse-neon' | 'ripple' | 'shimmer' | 'orbit' | 'glitch' | 'mosaic' | 'frosted' | 'duotone' | 'spark'
const BLOCK_STYLES: { id: BlockStyle; label: string; desc: string }[] = [
  { id: 'liquid-glass', label: 'Liquid Glass', desc: 'Reflejo iOS' },
  { id: 'metallic', label: 'Metálico', desc: 'Acero cepillado' },
  { id: 'matte', label: 'Mate', desc: 'Opaco plano' },
  { id: 'neon', label: 'Neón', desc: 'Halo eléctrico' },
  { id: 'pastel', label: 'Pastel', desc: 'Crema suave' },
  { id: 'crystal', label: 'Cristal', desc: 'Facetas' },
  { id: 'candy', label: 'Candy', desc: 'Caramelo 3D' },
  { id: 'obsidian', label: 'Obsidiana', desc: 'Negro volcánico' },
  { id: 'hologram', label: 'Holograma', desc: 'Irisado futurista' },
  { id: 'velvet', label: 'Terciopelo', desc: 'Suave y profundo' },
  { id: 'retro', label: 'Retro', desc: 'Pixel 8-bit' },
  { id: 'aurora', label: 'Aurora', desc: 'Degradado polar' },
  { id: 'ice', label: 'Hielo', desc: 'Cristal frío' },
  { id: 'magma', label: 'Magma', desc: 'Lava interior' },
  { id: 'gold', label: 'Oro', desc: 'Metal precioso' },
  { id: 'shadow', label: 'Sombra', desc: 'Oscuro etéreo' },
  { id: 'bubble', label: 'Burbuja', desc: 'Translúcido suave' },
  { id: 'circuit', label: 'Circuito', desc: 'Tech neón' },
  { id: 'chrome', label: 'Cromo', desc: 'Espejo metálico' },
  { id: 'wood', label: 'Madera', desc: 'Veta natural' },
  { id: 'paper', label: 'Papel', desc: 'Suave mate' },
  { id: 'emerald', label: 'Esmeralda', desc: 'Gema verde' },
  { id: 'sapphire', label: 'Zafiro', desc: 'Gema azul' },
  { id: 'ruby', label: 'Rubí', desc: 'Gema roja' },
  { id: 'smoke', label: 'Humo', desc: 'Difuminado gris' },
  { id: 'plasma', label: 'Plasma', desc: 'Energía viva' },
  { id: 'neon-grid', label: 'Neon Grid', desc: 'Líneas tech' },
  { id: 'sunset', label: 'Atardecer', desc: 'Naranja-rosa' },
  { id: 'ocean', label: 'Océano', desc: 'Azul profundo' },
  { id: 'carbon', label: 'Carbono', desc: 'Fibra oscura' },
  { id: 'prism', label: 'Prisma', desc: 'Refracción' },
  { id: 'ink', label: 'Tinta', desc: 'Acuarela oscura' },
  { id: 'lava-glass', label: 'Lava Glass', desc: 'Vidrio fundido' },
  { id: 'mint-frost', label: 'Menta Frost', desc: 'Hielo mentolado' },
  { id: 'pulse-neon', label: 'Pulse Neon', desc: 'Latido luminoso' },
  { id: 'ripple', label: 'Ripple', desc: 'Ondas suaves' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Brillo deslizante' },
  { id: 'orbit', label: 'Orbit', desc: 'Giro orbital' },
  { id: 'glitch', label: 'Glitch', desc: 'Fallo digital' },
  { id: 'mosaic', label: 'Mosaico', desc: 'Baldosas' },
  { id: 'frosted', label: 'Escarchado', desc: 'Vidrio frío' },
  { id: 'duotone', label: 'Duotono', desc: 'Dos tonos' },
  { id: 'spark', label: 'Chispa', desc: 'Destello' },
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
  white: { base: '#F4F4F5', light: '#FFFFFF', dark: '#A1A1AA', glow: 'rgba(255,255,255,0.45)' },
  black: { base: '#27272A', light: '#52525B', dark: '#09090B', glow: 'rgba(39,39,42,0.55)' },
  brown: { base: '#A16207', light: '#EAB308', dark: '#713F12', glow: 'rgba(161,98,7,0.5)' },
  mint: { base: '#6EE7B7', light: '#D1FAE5', dark: '#047857', glow: 'rgba(110,231,183,0.5)' },
  lavender: { base: '#C4B5FD', light: '#EDE9FE', dark: '#6D28D9', glow: 'rgba(196,181,253,0.5)' },
  peach: { base: '#FDBA74', light: '#FFEDD5', dark: '#C2410C', glow: 'rgba(253,186,116,0.5)' },
  navy: { base: '#1E3A5F', light: '#60A5FA', dark: '#0F172A', glow: 'rgba(30,58,95,0.55)' },
  crimson: { base: '#DC2626', light: '#FCA5A5', dark: '#7F1D1D', glow: 'rgba(220,38,38,0.55)' },
  forest: { base: '#15803D', light: '#4ADE80', dark: '#14532D', glow: 'rgba(21,128,61,0.55)' },
  scarlet: { base: '#E11D48', light: '#FB7185', dark: '#9F1239', glow: 'rgba(225,29,72,0.55)' },
  marine: { base: '#1E3A8A', light: '#60A5FA', dark: '#172554', glow: 'rgba(30,58,138,0.55)' },
  gold: { base: '#CA8A04', light: '#FDE047', dark: '#854D0E', glow: 'rgba(202,138,4,0.5)' },
  plum: { base: '#7E22CE', light: '#C084FC', dark: '#581C87', glow: 'rgba(126,34,206,0.5)' },
  turquoise: { base: '#0D9488', light: '#5EEAD4', dark: '#115E59', glow: 'rgba(13,148,136,0.5)' },
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
  // NO generar al montar (evita freeze). Usar fallback hasta loadLevel.
  const [level, setLevel] = useState<BlockCleanerLevel>(() => ({
    ...FALLBACK_LEVEL,
    id: readJSON(LS.current, 1),
    blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock),
  }))
  const [blocks, setBlocks] = useState<Block[]>(() => FALLBACK_LEVEL.blocks.map(normalizeBlock))
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [timerOn, setTimerOn] = useState(true)
  const [timerStarted, setTimerStarted] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [undoStack, setUndoStack] = useState<Block[][]>([])
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [hintId, setHintId] = useState<string | null>(null)
  const [hintsLeft, setHintsLeft] = useState(5)
  const [showRegenModal, setShowRegenModal] = useState(false)
  const [regenCooldownMsg, setRegenCooldownMsg] = useState<string | null>(null)
  const [exitingMap, setExitingMap] = useState<Record<string, { dx: number; dy: number }>>({})
  const [blockStyle, setBlockStyle] = useState<BlockStyle>(() => readJSON(LS.style, 'liquid-glass'))
  const [options, setOptions] = useState<PlayOptions>(() => readJSON(LS.options, DEFAULT_OPTIONS))
  const [tipIndex, setTipIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 700,
  }))
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Celda adaptativa: la grilla completa debe caber en pantalla (móvil vertical incluido)
  const cellSize = useMemo(() => {
    const padX = 28
    const chromeY = 210 // top bar + bottom controls approx
    const maxW = Math.max(180, Math.min(viewport.w - padX, 560))
    const maxH = Math.max(180, viewport.h - chromeY)
    const gap = GAP
    const cellByW = Math.floor((maxW - (level.cols + 1) * gap) / Math.max(1, level.cols))
    const cellByH = Math.floor((maxH - (level.rows + 1) * gap) / Math.max(1, level.rows))
    return clampNum(Math.min(cellByW, cellByH, BASE_CELL), 26, BASE_CELL)
  }, [viewport.w, viewport.h, level.rows, level.cols])


  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragVisual, setDragVisual] = useState<{ row: number; col: number } | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const timerRef = useRef<number | null>(null)
  const winHandled = useRef(false)
  const rafRef = useRef<number | null>(null)
  const pendingVisual = useRef<{ row: number; col: number } | null>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const [isLoading, setIsLoading] = useState(false)

  const loadLevel = useCallback((id: number) => {
    setIsLoading(true)
    setScreen('play')
    // Diferir generación al siguiente frame para no congelar el click
    requestAnimationFrame(() => {
      try {
        const lv = safeGenerate(id)
        setLevel(lv)
        setBlocks(lv.blocks.map(normalizeBlock))
        setMoves(0)
        setSeconds(0)
        setCleared(0)
        setUndoStack([])
        setCombo(0)
        setHintId(null)
        setHintsLeft(5)
        setExitingMap({})
        setDraggingId(null)
        setDragVisual(null)
        dragRef.current = null
        winHandled.current = false
        setLevelId(id)
        writeJSON(LS.current, id)
      } catch (err) {
        console.error('loadLevel', err)
        const fb = { ...FALLBACK_LEVEL, id, blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock) }
        setLevel(fb)
        setBlocks(fb.blocks)
      } finally {
        setIsLoading(false)
      }
    })
  }, [])

  /** Inicio rápido: usa cache si existe, sin pantalla de carga bloqueante */
  const loadLevelFast = useCallback((id: number) => {
    const safeId = Math.max(1, Math.floor(id) || 1)
    // Respuesta inmediata de UI
    setLevelId(safeId)
    writeJSON(LS.current, safeId)
    setMoves(0)
    setSeconds(0)
    setCleared(0)
    setUndoStack([])
    setCombo(0)
    setMaxCombo(0)
    setHintId(null)
    setHintsLeft(5)
    setTimerStarted(false)
    setExitingMap({})
    setDraggingId(null)
    setDragVisual(null)
    dragRef.current = null
    winHandled.current = false
    setScreen('play')

    const cached = _levelCache.get(safeId)
    if (cached) {
      setLevel(cached)
      setBlocks(cached.blocks.map(normalizeBlock))
      setIsLoading(false)
      return
    }

    // Sin cache: generar en el siguiente tick (UI ya visible)
    setIsLoading(true)
    const run = () => {
      try {
        const lv = generateLevel(safeId)
        setLevel(lv)
        setBlocks(lv.blocks.map(normalizeBlock))
      } catch (err) {
        console.error('loadLevelFast', err)
        const fb = { ...FALLBACK_LEVEL, id: safeId, blocks: FALLBACK_LEVEL.blocks.map(normalizeBlock) }
        setLevel(fb)
        setBlocks(fb.blocks)
      } finally {
        setIsLoading(false)
      }
    }
    // requestIdleCallback si existe, si no microtask+timeout mínimo
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (typeof ric === 'function') ric(run, { timeout: 400 })
    else setTimeout(run, 0)
  }, [])

  // Precargar el siguiente nivel en idle para que "Siguiente" sea instantáneo
  useEffect(() => {
    if (screen !== 'play') return
    const nextId = levelId + 1
    if (_levelCache.has(nextId)) return
    let cancelled = false
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
    const run = () => {
      if (cancelled || _levelCache.has(nextId)) return
      try {
        generateLevel(nextId)
      } catch { /* noop */ }
    }
    let handle: number | undefined
    if (typeof ric === 'function') {
      handle = ric(run, { timeout: 1200 })
    } else {
      handle = window.setTimeout(run, 200) as unknown as number
    }
    return () => {
      cancelled = true
      if (typeof ric === 'function' && handle != null) {
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(handle)
      } else if (handle != null) {
        clearTimeout(handle)
      }
    }
  }, [screen, levelId])

  useEffect(() => {
    // Reloj de partida: solo tras primera interacción
    if (screen !== 'play' || !timerOn || !timerStarted) return
    timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [screen, timerOn, levelId, timerStarted])

  // Contador de amenaza en piezas: baja 1 por segundo; a 0 → derrota
  useEffect(() => {
    if (screen !== 'play' || !timerStarted) return
    const id = window.setInterval(() => {
      setBlocks(prev => {
        let exploded = false
        let ticking = false
        const next = prev.map(b => {
          if (b.threatSeconds == null) return b
          const left = b.threatSeconds - 1
          if (left <= 0) {
            exploded = true
            return { ...b, threatSeconds: 0 }
          }
          if (left <= 10) ticking = true
          return { ...b, threatSeconds: left }
        })
        if (exploded) {
          playSfx('lose')
          setTimeout(() => {
            writeJSON(LS.defeats, readJSON(LS.defeats, 0) + 1)
            writeJSON(LS.streak, 0)
            setScreen('lose')
          }, 120)
        } else if (ticking) {
          playSfx('tick')
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [screen, timerStarted, levelId])

  useEffect(() => {
    if (screen !== 'play' || winHandled.current || blocks.length > 0) return
    winHandled.current = true
    playSfx('win')
    // Precargar siguiente ya
    try { generateLevel(levelId + 1) } catch { /* noop */ }
    const moveStars = starsForMoves(moves, level.parMoves)
    const timeStars = timerOn ? starsForTime(seconds, level.timeLimit) : 3
    // Media ponderada: movimientos pesan más
    const stars = (Math.round((moveStars * 2 + timeStars) / 3) as 1 | 2 | 3)
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    scores[levelId] = Math.max(scores[levelId] ?? 0, stars)
    writeJSON(LS.scores, scores)
    writeJSON(LS.wins, readJSON(LS.wins, 0) + 1)
    writeJSON(LS.totalMoves, readJSON(LS.totalMoves, 0) + moves)
    const streak = readJSON(LS.streak, 0) + 1
    writeJSON(LS.streak, streak)
    writeJSON(LS.bestStreak, Math.max(readJSON(LS.bestStreak, 0), streak))
    const newUnlocked = levelId >= unlocked ? levelId + 1 : unlocked
    if (newUnlocked !== unlocked) { setUnlocked(newUnlocked); writeJSON(LS.unlocked, newUnlocked) }
    syncBlockCleanerProgress(Math.max(newUnlocked, levelId))
    setScreen('win')
  }, [blocks, screen, moves, seconds, level, levelId, unlocked])

  useEffect(() => {
    // Límite de tiempo en todos los niveles (si el reloj está activo)
    if (screen !== 'play' || !timerOn || !timerStarted) return
    if (seconds >= level.timeLimit && blocks.length > 0) {
      playSfx('lose')
      writeJSON(LS.defeats, readJSON(LS.defeats, 0) + 1)
      writeJSON(LS.streak, 0)
      setScreen('lose')
    }
  }, [seconds, screen, timerOn, timerStarted, level.timeLimit, blocks.length])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])


  const getRegenState = () => {
    const day = new Date().toISOString().slice(0, 10)
    const st = readJSON<{ day: string; freeUsed: number; lastAt: number }>(LS.regen, {
      day,
      freeUsed: 0,
      lastAt: 0,
    })
    if (st.day !== day) return { day, freeUsed: 0, lastAt: 0 }
    return st
  }

  const requestRegenerate = () => {
    const st = getRegenState()
    const FREE_DAILY = 4
    const COOLDOWN_MS = 2 * 60 * 1000
    if (st.freeUsed >= FREE_DAILY) {
      const left = COOLDOWN_MS - (Date.now() - st.lastAt)
      if (left > 0) {
        playSfx('lock')
        const secs = Math.ceil(left / 1000)
        const mins = Math.floor(secs / 60)
        const rem = secs % 60
        setRegenCooldownMsg(
          mins > 0
            ? `Has usado las 4 regeneraciones gratis de hoy. Espera ${mins} min ${rem}s.`
            : `Has usado las 4 regeneraciones gratis de hoy. Espera ${rem}s.`
        )
        return
      }
    }
    setRegenCooldownMsg(null)
    setShowRegenModal(true)
    playSfx('ui')
  }

  const confirmRegenerate = useCallback(() => {
    setShowRegenModal(false)
    setRegenCooldownMsg(null)
    playSfx('regen')
    const id = levelId
    const salt = Date.now()
    try {
      const st = (function () {
        const day = new Date().toISOString().slice(0, 10)
        const cur = readJSON<{ day: string; freeUsed: number; lastAt: number }>(LS.regen, {
          day,
          freeUsed: 0,
          lastAt: 0,
        })
        if (cur.day !== day) return { day, freeUsed: 0, lastAt: 0 }
        return cur
      })()
      st.freeUsed = (st.freeUsed || 0) + 1
      st.lastAt = Date.now()
      writeJSON(LS.regen, st)
    } catch { /* */ }

    setIsLoading(true)
    const run = () => {
      try {
        _levelCache.delete(id)
        const base = getDifficultyTier(id)
        const tier = {
          ...base,
          numBlocks: Math.min(base.numBlocks + 1, base.rows * base.cols - 4),
          scrambleMoves: base.scrambleMoves + 12,
          obstacleCount: id >= 15 ? Math.min(base.obstacleCount + 1, 4) : 0,
          lockedChance: Math.min(base.lockedChance + 0.1, 0.85),
          numColors: Math.min(base.numColors + 1, BLOCK_COLOR_ORDER.length),
        }
        let level: BlockCleanerLevel | null = null
        for (let a = 0; a < 14 && !level; a++) {
          const seed = (id * 2654435761 + salt + a * 7919) >>> 0
          level = generateLevelOnce(id, tier, seed)
        }
        if (!level) {
          for (let a = 0; a < 8 && !level; a++) {
            level = generateLevelOnce(id, base, (salt + a * 1337) >>> 0)
          }
        }
        if (!level) {
          level = generateLevel(id)
        }
        _levelCache.set(id, level)
        setLevel(level)
        setBlocks(level.blocks.map(normalizeBlock))
        setMoves(0)
        setSeconds(0)
        setCleared(0)
        setUndoStack([])
        setCombo(0)
        setMaxCombo(0)
        setHintId(null)
        setHintsLeft(5)
        setTimerStarted(false)
        setExitingMap({})
        setDraggingId(null)
        setDragVisual(null)
        dragRef.current = null
        winHandled.current = false
      } catch (err) {
        console.error('regen', err)
      } finally {
        setIsLoading(false)
      }
    }
    setTimeout(run, 0)
  }, [levelId])


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
        const exiting = next.find(b => b.id === blockId)
        // Bicolor: al salir por el color primario, se convierte en el secundario
        if (exiting?.secondaryColor) {
          const transformed = next.map(b =>
            b.id === blockId
              ? normalizeBlock({
                  ...b,
                  row: toRow,
                  col: toCol,
                  color: b.secondaryColor!,
                  secondaryColor: undefined,
                  threatSeconds: b.threatSeconds,
                })
              : b
          )
          playSfx('exit')
          setCombo(c => {
            const n = c + 1
            setMaxCombo(m => Math.max(m, n))
            return n
          })
          setCleared(c => c + 1)
          setUndoStack(u => [...u, list])
          setMoves(m => m + 1)
          return transformed
        }
        const v = exitPixelVector(exitSide ?? 'top', cellSize)
        setExitingMap(prev => ({ ...prev, [blockId]: v }))
        playSfx('exit')
        setCombo(c => {
          const n = c + 1
          setMaxCombo(m => Math.max(m, n))
          if (n > 1) setTimeout(() => playSfx('combo'), 80)
          return n
        })
        setCleared(c => c + 1)
        setUndoStack(u => [...u, list])
        setMoves(m => m + 1)
        const kept = next.map(b => b.id === blockId ? normalizeBlock({ ...b, row: toRow, col: toCol }) : b)
        setTimeout(() => {
          setBlocks(cur => cur.filter(b => b.id !== blockId))
          setExitingMap(prev => {
            const n = { ...prev }
            delete n[blockId]
            return n
          })
        }, 650)
        return kept
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
    if (!timerStarted) setTimerStarted(true)
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
    const block = blocksRef.current.find(b => b.id === drag.id)
    const result = computeOrthogonalDragPosition(
      drag.originRow,
      drag.originCol,
      dyPx / cellSize,
      dxPx / cellSize,
      drag.ranges,
      drag.lockedAxis,
      block,
      blocksRef.current,
      level.obstacles ?? [],
      level.rows,
      level.cols,
      cleared,
      { row: drag.visualRow, col: drag.visualCol }
    )
    const prevSnapR = Math.round(drag.visualRow)
    const prevSnapC = Math.round(drag.visualCol)
    drag.visualRow = result.row
    drag.visualCol = result.col
    if (result.axis) drag.lockedAxis = result.axis
    // Actualizar rangos cuando cambia de celda
    if (block) {
      const snappedR = Math.round(result.row)
      const snappedC = Math.round(result.col)
      if (snappedR !== prevSnapR || snappedC !== prevSnapC) {
        const virtual = normalizeBlock({ ...block, row: snappedR, col: snappedC })
        drag.ranges = computeFreeSlideRanges(
          virtual, blocksRef.current, level.obstacles ?? [], level.rows, level.cols, cleared
        )
      }
    }
    scheduleVisual(result.row, result.col)

    if (block) {
      const exit = canExitByDrag(block, result.row, result.col, level.exits ?? [], level.rows, level.cols, cleared)
      if (exit) {
        const dCol = dxPx / cellSize, dRow = dyPx / cellSize
        const pushing =
          (exit.side === 'left' && dCol < -0.35) || (exit.side === 'right' && dCol > 0.35) ||
          (exit.side === 'top' && dRow < -0.35) || (exit.side === 'bottom' && dRow > 0.35)
        if (pushing) {
          dragRef.current = null
          setDraggingId(null)
          setDragVisual(null)
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
    if (hintsLeft <= 0) {
      playSfx('lock')
      return
    }
    const move = getHintMove(safeBlocks, level.exits ?? [], level.obstacles ?? [], level.rows, level.cols, cleared)
    if (!move) {
      playSfx('lock')
      return
    }
    playSfx('hint')
    setHintsLeft(h => Math.max(0, h - 1))
    setHintId(move.blockId)
    applyMove(move.blockId, move.toRow, move.toCol, !!move.isExit)
    setTimeout(() => setHintId(null), 550)
  }
  const reset = () => { loadLevel(levelId); playSfx('ui') }

  const boardW = level.cols * cellSize + (level.cols + 1) * GAP
  const boardH = level.rows * cellSize + (level.rows + 1) * GAP

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
    if (style === 'hologram') return { background: `linear-gradient(125deg, ${c.light}, ${c.base}, ${c.dark}, ${c.light})`, backgroundSize: '200% 200%', boxShadow: `0 0 18px ${c.glow}, inset 0 0 12px ${c.light}44`, border: `1px solid ${c.light}aa` }
    if (style === 'velvet') return { background: `radial-gradient(ellipse at 30% 20%, ${c.light}55, ${c.base} 50%, ${c.dark})`, boxShadow: `0 6px 20px ${c.glow}66, inset 0 2px 4px ${c.light}33`, border: 'none' }
    if (style === 'retro') return { background: c.base, boxShadow: `4px 4px 0 ${c.dark}`, border: `2px solid ${c.dark}`, imageRendering: 'pixelated' as const }
    if (style === 'aurora') return { background: `linear-gradient(160deg, ${c.light}, ${c.base} 35%, #a78bfa 70%, ${c.dark})`, boxShadow: `0 4px 24px ${c.glow}`, border: `1px solid ${c.light}66` }
    if (style === 'ice') return { background: `linear-gradient(180deg, #e0f2fe, ${c.light} 40%, ${c.base})`, boxShadow: `0 4px 16px rgba(125,211,252,0.45), inset 0 1px 0 #fff8`, border: `1px solid #bae6fd` }
    if (style === 'magma') return { background: `radial-gradient(circle at 50% 80%, #fbbf24, ${c.base} 45%, ${c.dark} 80%)`, boxShadow: `0 0 20px ${c.glow}, inset 0 -8px 16px rgba(0,0,0,0.35)`, border: 'none' }
    if (style === 'gold') return { background: `linear-gradient(145deg, #fde68a, #fbbf24 40%, #d97706)`, boxShadow: `0 4px 14px rgba(251,191,36,0.5), inset 0 1px 0 #fff6`, border: `1px solid #f59e0b` }
    if (style === 'shadow') return { background: `linear-gradient(160deg, ${c.dark}, #0a0a12 60%, ${c.base}44)`, boxShadow: `0 8px 24px rgba(0,0,0,0.55)`, border: `1px solid ${c.base}22` }
    if (style === 'bubble') return { background: `radial-gradient(circle at 30% 25%, #fff8, ${c.light}66 40%, ${c.base}99)`, backdropFilter: 'blur(6px)', boxShadow: `0 4px 18px ${c.glow}55`, border: `1px solid ${c.light}88` }
    if (style === 'circuit') return { background: `linear-gradient(135deg, ${c.dark}, ${c.base})`, boxShadow: `0 0 12px ${c.glow}, inset 0 0 0 1px ${c.light}33`, border: `1px solid ${c.light}66` }
    if (style === 'chrome') return { background: `linear-gradient(160deg, #f8fafc, ${c.light} 30%, ${c.base} 55%, ${c.dark})`, boxShadow: `0 2px 12px ${c.glow}, inset 0 1px 0 #fff`, border: `1px solid ${c.light}` }
    if (style === 'wood') return { background: `linear-gradient(90deg, ${c.dark}, ${c.base} 40%, ${c.dark} 60%, ${c.base})`, boxShadow: `0 4px 10px rgba(0,0,0,0.3)`, border: `1px solid ${c.dark}` }
    if (style === 'paper') return { background: c.light, boxShadow: `2px 3px 0 ${c.dark}44`, border: `1px solid ${c.base}55` }
    if (style === 'emerald') return { background: `radial-gradient(circle at 35% 30%, #6ee7b7, ${c.base} 50%, #064e3b)`, boxShadow: `0 0 16px rgba(16,185,129,0.45)`, border: `1px solid #34d399` }
    if (style === 'sapphire') return { background: `radial-gradient(circle at 35% 30%, #93c5fd, ${c.base} 50%, #1e3a8a)`, boxShadow: `0 0 16px rgba(59,130,246,0.45)`, border: `1px solid #60a5fa` }
    if (style === 'ruby') return { background: `radial-gradient(circle at 35% 30%, #fca5a5, ${c.base} 50%, #7f1d1d)`, boxShadow: `0 0 16px rgba(239,68,68,0.45)`, border: `1px solid #f87171` }
    if (style === 'smoke') return { background: `linear-gradient(180deg, ${c.light}88, ${c.base}99, ${c.dark}aa)`, backdropFilter: 'blur(3px)', boxShadow: `0 6px 20px rgba(0,0,0,0.25)`, border: `1px solid ${c.light}44` }
    if (style === 'plasma') return { background: `conic-gradient(from 120deg, ${c.light}, ${c.base}, ${c.dark}, ${c.light})`, boxShadow: `0 0 22px ${c.glow}`, border: 'none' }
    if (style === 'neon-grid') return { background: `linear-gradient(135deg, ${c.dark}, ${c.base})`, boxShadow: `0 0 14px ${c.glow}, inset 0 0 0 1px ${c.light}55`, border: `1px solid ${c.light}` }
    if (style === 'sunset') return { background: `linear-gradient(145deg, #fb923c, ${c.base} 50%, #e11d48)`, boxShadow: `0 4px 18px ${c.glow}`, border: 'none' }
    if (style === 'ocean') return { background: `linear-gradient(160deg, #0ea5e9, ${c.base} 45%, #1e3a8a)`, boxShadow: `0 4px 16px rgba(14,165,233,0.4)`, border: `1px solid #38bdf8` }
    if (style === 'carbon') return { background: `repeating-linear-gradient(90deg, ${c.dark}, ${c.dark} 2px, ${c.base} 2px, ${c.base} 4px)`, boxShadow: `0 4px 12px rgba(0,0,0,0.4)`, border: `1px solid ${c.light}33` }
    if (style === 'prism') return { background: `linear-gradient(120deg, ${c.light}, #c4b5fd 35%, ${c.base} 65%, #67e8f9)`, boxShadow: `0 0 20px ${c.glow}`, border: `1px solid #e9d5ff` }
    if (style === 'ink') return { background: `radial-gradient(circle at 30% 20%, ${c.light}44, ${c.dark} 70%)`, boxShadow: `0 6px 18px rgba(0,0,0,0.45)`, border: 'none' }
    if (style === 'lava-glass') return { background: `linear-gradient(160deg, #fb923c, ${c.base} 40%, #7f1d1d)`, boxShadow: `0 0 18px rgba(251,146,60,0.45), inset 0 1px 0 #fff3`, border: `1px solid #fdba74` }
    if (style === 'mint-frost') return { background: `linear-gradient(180deg, #ecfdf5, ${c.light} 40%, ${c.base})`, boxShadow: `0 4px 16px rgba(52,211,153,0.35)`, border: `1px solid #a7f3d0` }
    if (style === 'pulse-neon') return { background: `linear-gradient(145deg, ${c.light}, ${c.base} 50%, ${c.dark})`, boxShadow: `0 0 12px ${c.glow}`, border: `1px solid ${c.light}`, ['--bc-glow' as string]: c.glow }
    if (style === 'ripple') return { background: `radial-gradient(circle at 50% 50%, ${c.light}, ${c.base} 45%, ${c.dark})`, boxShadow: `0 4px 14px ${c.glow}`, border: 'none' }
    if (style === 'shimmer') return { background: `linear-gradient(120deg, ${c.dark}, ${c.base} 40%, ${c.light} 50%, ${c.base} 60%, ${c.dark})`, backgroundSize: '200% 200%', boxShadow: `0 4px 14px ${c.glow}`, border: `1px solid ${c.light}66` }
    if (style === 'orbit') return { background: `conic-gradient(from 0deg, ${c.light}, ${c.base}, ${c.dark}, ${c.light})`, boxShadow: `0 0 16px ${c.glow}`, border: 'none' }
    if (style === 'glitch') return { background: `linear-gradient(90deg, ${c.base}, ${c.dark})`, boxShadow: `2px 0 ${c.light}, -2px 0 ${c.dark}`, border: `1px solid ${c.light}55` }
    if (style === 'mosaic') return { background: `repeating-conic-gradient(${c.base} 0% 25%, ${c.dark} 0% 50%) 0 0 / 12px 12px`, boxShadow: `0 4px 12px ${c.glow}`, border: `1px solid ${c.light}44` }
    if (style === 'frosted') return { background: `linear-gradient(160deg, ${c.light}cc, ${c.base}99)`, backdropFilter: 'blur(6px)', boxShadow: `inset 0 1px 0 #fff6, 0 4px 14px ${c.glow}`, border: `1px solid ${c.light}88` }
    if (style === 'duotone') return { background: `linear-gradient(135deg, ${c.light} 50%, ${c.dark} 50%)`, boxShadow: `0 4px 14px ${c.glow}`, border: 'none' }
    if (style === 'spark') return { background: `radial-gradient(circle at 30% 30%, #fff8, ${c.light} 20%, ${c.base} 55%, ${c.dark})`, boxShadow: `0 0 16px ${c.glow}`, border: `1px solid ${c.light}` }
    return { ...base, background: `linear-gradient(145deg, ${c.light}55, ${c.base} 45%, ${c.dark}cc)`, backdropFilter: 'blur(8px)' }
  }

  // Screens (hub, levels, options glass, styles, stats, win, lose, play)
  if (screen === 'hub') return (
    <div className="bc-root bc-root-hub"><style>{CSS}</style>
      <div className="bc-particles" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className="bc-particle" style={{
            left: `${(i * 17 + 7) % 100}%`,
            animationDelay: `${(i % 9) * 0.4}s`,
            animationDuration: `${6 + (i % 5)}s`,
            width: 4 + (i % 4) * 2,
            height: 4 + (i % 4) * 2,
            opacity: 0.25 + (i % 5) * 0.08,
          }} />
        ))}
      </div>
      <div className="bc-hub glass-panel">
        <button type="button" className="bc-back" onClick={() => navigate('/categoria/logica')}><span className="bc-back-arrow">←</span> Volver</button>
        <h1 className="bc-title">Block Cleaner</h1>
        <p className="bc-sub">Libera las piezas</p>
        <div className="bc-hub-actions">
          <button className="bc-btn primary" onClick={() => loadLevelFast(levelId)}>Continuar · Niv. {levelId}</button>
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
        <button type="button" className="bc-back" onClick={() => setScreen('hub')}><span className="bc-back-arrow">←</span> Volver</button>
        <h2 className="bc-title">Opciones</h2>
        <p className="bc-sub">Personaliza la experiencia de juego</p>
        <div className="bc-options-list">
          <p className="bc-opt-section">Dificultad</p>
          {([['hardcore', 'Modo estricto', 'Sin deshacer ni pistas'], ['noHints', 'Sin pistas', 'Oculta el botón de pista']] as const).map(([key, title, desc]) => (
            <label key={key} className="bc-opt-glass">
              <div className="bc-opt-text"><strong>{title}</strong><span>{desc}</span></div>
              <div className="bc-toggle">
                <input type="checkbox" checked={options[key]} onChange={e => { const next = { ...options, [key]: e.target.checked }; setOptions(next); writeJSON(LS.options, next) }} />
                <span className="bc-toggle-slider" />
              </div>
            </label>
          ))}
          <p className="bc-opt-section">Interfaz</p>
          {([['showExits', 'Mostrar puertas', 'Barras de color en el borde'], ['showPar', 'Mostrar par', 'Objetivo de movimientos'], ['showGhost', 'Guía de rango', 'Resalta hasta dónde puedes deslizar']] as const).map(([key, title, desc]) => (
            <label key={key} className="bc-opt-glass">
              <div className="bc-opt-text"><strong>{title}</strong><span>{desc}</span></div>
              <div className="bc-toggle">
                <input type="checkbox" checked={options[key]} onChange={e => { const next = { ...options, [key]: e.target.checked }; setOptions(next); writeJSON(LS.options, next) }} />
                <span className="bc-toggle-slider" />
              </div>
            </label>
          ))}
          <p className="bc-opt-section">Tiempo</p>
          <label className="bc-opt-glass">
            <div className="bc-opt-text"><strong>Mostrar reloj</strong><span>Si se desactiva, no hay derrota por tiempo</span></div>
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

  if (screen === 'stats') {
    const wins = readJSON(LS.wins, 0)
    const defeats = readJSON(LS.defeats, 0)
    const total = wins + defeats
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    const scores = readJSON<Record<number, number>>(LS.scores, {})
    const starCounts = [0, 0, 0, 0]
    for (const s of Object.values(scores)) {
      if (s >= 1 && s <= 3) starCounts[s]++
    }
    const avgStars = Object.keys(scores).length
      ? (Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length).toFixed(2)
      : '—'
    const totalMoves = readJSON(LS.totalMoves, 0)
    const avgMoves = wins > 0 ? Math.round(totalMoves / wins) : 0
    return (
      <div className="bc-root"><style>{CSS}</style>
        <div className="bc-hub glass-panel">
          <button type="button" className="bc-back" onClick={() => setScreen('hub')}><span className="bc-back-arrow">←</span> Volver</button>
          <h2 className="bc-title">Estadísticas</h2>
          <p className="bc-sub">Tu progreso en Block Cleaner</p>
          <div className="bc-stats-grid">
            <div className="bc-stat-card"><span className="bc-stat-val">{unlocked}</span><span className="bc-stat-label">Nivel máx.</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{wins}</span><span className="bc-stat-label">Victorias</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{defeats}</span><span className="bc-stat-label">Derrotas</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{winRate}%</span><span className="bc-stat-label">Ratio victoria</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{readJSON(LS.streak, 0)}</span><span className="bc-stat-label">Racha actual</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{readJSON(LS.bestStreak, 0)}</span><span className="bc-stat-label">Mejor racha</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{avgStars}</span><span className="bc-stat-label">★ promedio</span></div>
            <div className="bc-stat-card"><span className="bc-stat-val">{avgMoves}</span><span className="bc-stat-label">Mov. / victoria</span></div>
          </div>
          <div className="bc-stars-breakdown">
            <p><strong>Desglose de estrellas</strong></p>
            <p>★★★ {starCounts[3]} · ★★☆ {starCounts[2]} · ★☆☆ {starCounts[1]}</p>
            <p>Niveles con puntuación: {Object.keys(scores).length}</p>
            <p>Movimientos totales: {totalMoves}</p>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'win') {
    const stars = readJSON<Record<number, number>>(LS.scores, {})[levelId] ?? 1
    return (
      <div className="bc-root"><style>{CSS}</style>
        <div className="bc-hub glass-panel">
          <h2 className="bc-title">¡Nivel {levelId} superado!</h2>
          <p className="bc-stars-big">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</p>
          <p>Movimientos: {moves} · Par: {level.parMoves} · Tiempo: {seconds}s</p>
          <p className="bc-sub">Mejor combo: ×{Math.max(maxCombo, combo, 1)}</p>
          <div className="bc-hub-actions">
            <button className="bc-btn primary" onClick={() => loadLevelFast(levelId + 1)}>Siguiente</button>
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

  if (isLoading) {
    return (
      <div className="bc-root"><style>{CSS}</style>
        <div className="bc-hub glass-panel">
          <h2 className="bc-title">Cargando nivel…</h2>
          <p className="bc-sub">Preparando el puzzle</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bc-root bc-root-hub"><style>{CSS}</style>
      <div className="bc-particles" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="bc-particle" style={{
            left: `${(i * 19 + 11) % 100}%`,
            animationDelay: `${(i % 7) * 0.5}s`,
            animationDuration: `${7 + (i % 4)}s`,
            width: 3 + (i % 3) * 2,
            height: 3 + (i % 3) * 2,
            opacity: 0.18 + (i % 4) * 0.05,
          }} />
        ))}
      </div>
      <div className="bc-play-bar glass-bar">
        <button className="bc-icon-btn" onClick={() => setScreen('hub')}>←</button>
        <div className="bc-play-meta">
          <span>Niv. {levelId}</span>
          <span className="bc-tier">{level.tierLabel}</span>
          {options.showPar && <span>Par {level.parMoves}</span>}
          <span>{moves} mov</span>
          {timerOn && <span className={seconds > level.timeLimit * 0.8 ? 'bc-time-warn' : ''}>{seconds}s / {level.timeLimit}s</span>}
          {combo > 1 && <span className="bc-combo">×{combo}</span>}
        </div>
        <div className="bc-play-actions">
          <button className="bc-icon-btn" onClick={undo} disabled={options.hardcore || !undoStack.length}>↩</button>
          <button className="bc-icon-btn" onClick={hint} disabled={options.noHints || options.hardcore || hintsLeft <= 0} title={`Pistas: ${hintsLeft}/5`}>💡{hintsLeft < 5 ? hintsLeft : ''}</button>
        <button className="bc-icon-btn bc-regen-btn" onClick={requestRegenerate} title="Regenerar disposición del nivel" aria-label="Regenerar nivel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 0 1 15.5-6.4"/>
            <polyline points="3 5 3 12 10 12"/>
            <path d="M21 12a9 9 0 0 1-15.5 6.4"/>
            <polyline points="21 19 21 12 14 12"/>
          </svg>
        </button>
          <button className="bc-icon-btn" onClick={reset}>⟳</button>
          <button className="bc-icon-btn" onClick={() => setZoom(z => clampNum(z - 0.1, 0.5, 1.6))}>−</button>
          <button className="bc-icon-btn" onClick={() => setZoom(z => clampNum(z + 0.1, 0.5, 1.6))}>+</button>
        </div>
      </div>
      <div className="bc-board-wrap" onPointerMove={e => { if (dragRef.current) handlePointerMove(e) }} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}>
        <div className="bc-board" style={{ width: boardW, height: boardH, transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: 'top center' }}>
          {Array.from({ length: level.rows * level.cols }).map((_, i) => {
            const r = Math.floor(i / level.cols), c = i % level.cols
            return <div key={'g' + i} className="bc-cell" style={{ left: GAP + c * (cellSize + GAP), top: GAP + r * (cellSize + GAP), width: cellSize, height: cellSize }} />
          })}
          {(level.obstacles ?? []).map(o => (
            <div key={o.id} className="bc-obstacle" style={{ left: GAP + o.col * (cellSize + GAP), top: GAP + o.row * (cellSize + GAP), width: cellSize, height: cellSize }} />
          ))}
          {options.showExits && (level.exits ?? []).map(ex => {
            const c = COLOR_HEX[ex.color]
            const style: CSSProperties = { background: c.glow, border: `2px solid ${c.base}`, position: 'absolute', borderRadius: 6, pointerEvents: 'none', opacity: 0.9 }
            if (ex.side === 'left') Object.assign(style, { left: 0, top: GAP + ex.pos * (cellSize + GAP), width: 10, height: ex.length * cellSize + (ex.length - 1) * GAP })
            else if (ex.side === 'right') Object.assign(style, { right: 0, left: 'auto', top: GAP + ex.pos * (cellSize + GAP), width: 10, height: ex.length * cellSize + (ex.length - 1) * GAP })
            else if (ex.side === 'top') Object.assign(style, { top: 0, left: GAP + ex.pos * (cellSize + GAP), height: 10, width: ex.length * cellSize + (ex.length - 1) * GAP })
            else Object.assign(style, { bottom: 0, top: 'auto', left: GAP + ex.pos * (cellSize + GAP), height: 10, width: ex.length * cellSize + (ex.length - 1) * GAP })
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
              let top = GAP + b.row * (cellSize + GAP), left = GAP + b.col * (cellSize + GAP)
              if (isDrag && dragVisual) { top = GAP + dragVisual.row * (cellSize + GAP); left = GAP + dragVisual.col * (cellSize + GAP) }
              const width = w * cellSize + (w - 1) * GAP, height = h * cellSize + (h - 1) * GAP
              return (
                <motion.div key={b.id}
                  className={`bc-block ${isDrag ? 'dragging' : ''} ${canGo ? 'exitable' : ''} ${isHint ? 'hint' : ''} ${isExit ? 'exiting' : ''} ${['pulse-neon','ripple','shimmer','orbit','glitch'].includes(blockStyle) ? `bc-anim-${blockStyle}` : ''}`}
                  style={{
                    ...blockStyleCss(b.color, blockStyle), width, height, left, top,
                    zIndex: isDrag ? 30 : isExit ? 25 : 5, transition: isDrag ? 'none' : undefined,
                    touchAction: 'none', cursor: isBlockMovable(b, cleared) ? 'grab' : 'not-allowed',
                    opacity: b.lockedUntilClears && cleared < b.lockedUntilClears ? 0.5 : 1,
                  }}
                  initial={false}
                  animate={
                    isExit
                      ? {
                          x: exitAnim.dx,
                          y: exitAnim.dy,
                          opacity: 0,
                          scale: 0.55,
                          filter: 'blur(4px)',
                          rotate: exitAnim.dx !== 0 ? (exitAnim.dx > 0 ? 8 : -8) : (exitAnim.dy > 0 ? 6 : -6),
                        }
                      : { x: 0, y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', rotate: 0 }
                  }
                  transition={
                    isDrag
                      ? { duration: 0 }
                      : isExit
                        ? { duration: 0.62, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.55, ease: 'easeOut' }, scale: { duration: 0.62 } }
                        : { type: 'spring', stiffness: 520, damping: 38, mass: 0.85 }
                  }
                  onPointerDown={e => handlePointerDown(e, b)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  {b.lockedUntilClears != null && cleared < b.lockedUntilClears && <span className="bc-lock">🔒{b.lockedUntilClears - cleared}</span>}
                  {b.threatSeconds != null && <span className="bc-threat">{b.threatSeconds}</span>}
                  {b.secondaryColor && <span className="bc-dir" style={{bottom:4,left:6}}>◎</span>}
                  {b.forcedDir && <span className="bc-dir">{b.forcedDir === 'left' ? '←' : b.forcedDir === 'right' ? '→' : b.forcedDir === 'up' ? '↑' : '↓'}</span>}
                  
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      {regenCooldownMsg && (
        <div className="bc-modal-backdrop" onClick={() => setRegenCooldownMsg(null)}>
          <div className="bc-modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Regeneración en espera</h3>
            <p>{regenCooldownMsg}</p>
            <div className="bc-modal-actions">
              <button type="button" className="bc-btn primary" onClick={() => setRegenCooldownMsg(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
      {showRegenModal && (
        <div className="bc-modal-backdrop" onClick={() => setShowRegenModal(false)}>
          <div className="bc-modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>¿Regenerar este nivel?</h3>
            <p>
              Se generará una nueva disposición un poco más exigente (misma dificultad de tramo).
              Tienes 4 regeneraciones gratis al día; después hay una espera de 2 minutos entre cada una.
              Úsalo si el tablero parece injusto o imposible — el motor prioriza niveles jugables.
            </p>
            <div className="bc-modal-actions">
              <button type="button" className="bc-btn" onClick={() => setShowRegenModal(false)}>Cancelar</button>
              <button type="button" className="bc-btn primary" onClick={confirmRegenerate}>Sí, regenerar</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}

const CSS = `

.bc-root-hub{position:relative;overflow:hidden}
.bc-particles{pointer-events:none;position:fixed;inset:0;z-index:0;overflow:hidden}
.bc-particle{position:absolute;bottom:-20px;border-radius:50%;
  background:radial-gradient(circle,rgba(125,211,252,.9),rgba(167,139,250,.35));
  animation:bc-float linear infinite}

@keyframes bc-pulse-neon{0%,100%{filter:brightness(1);box-shadow:0 0 8px var(--bc-glow,rgba(56,189,248,.5))}50%{filter:brightness(1.25);box-shadow:0 0 18px var(--bc-glow,rgba(56,189,248,.8))}}
@keyframes bc-ripple{0%{background-size:100% 100%}50%{background-size:140% 140%}100%{background-size:100% 100%}}
@keyframes bc-shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes bc-orbit{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}
@keyframes bc-glitch{0%,100%{transform:translate(0)}20%{transform:translate(-1px,1px)}40%{transform:translate(1px,-1px)}60%{transform:translate(-1px,0)}80%{transform:translate(1px,1px)}}
.bc-anim-pulse-neon{animation:bc-pulse-neon 1.6s ease-in-out infinite}
.bc-anim-ripple{animation:bc-ripple 2.4s ease-in-out infinite}
.bc-anim-shimmer{animation:bc-shimmer 3s linear infinite;background-size:200% 200%}
.bc-anim-orbit{animation:bc-orbit 8s linear infinite}
.bc-anim-glitch{animation:bc-glitch .8s steps(2) infinite}
@keyframes bc-float{
  0%{transform:translateY(0) translateX(0) scale(1);opacity:0}
  10%{opacity:.7}
  90%{opacity:.5}
  100%{transform:translateY(-110vh) translateX(30px) scale(.6);opacity:0}
}
.bc-hub{position:relative;z-index:1}
.bc-hub .bc-title{background:linear-gradient(135deg,#e0f2fe,#c4b5fd 50%,#f9a8d4);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800;letter-spacing:-.02em}
.bc-hub-actions{display:flex;flex-direction:column;gap:10px;margin:18px 0 12px}
.bc-btn.primary{background:linear-gradient(135deg,#38bdf8,#818cf8);border:none;color:#0f172a;font-weight:700;box-shadow:0 8px 24px rgba(56,189,248,.25)}
.bc-btn.primary:hover{filter:brightness(1.06)}
.bc-root{min-height:100dvh;width:100%;display:flex;flex-direction:column;color:var(--text-primary,#f2f4f8);background:transparent;font-family:Inter,system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.glass-panel{background:color-mix(in srgb,var(--text-primary,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);border-radius:24px;backdrop-filter:blur(20px) saturate(1.2);-webkit-backdrop-filter:blur(20px) saturate(1.2);box-shadow:0 16px 48px rgba(0,0,0,.22)}
.glass-bar{background:color-mix(in srgb,var(--text-primary,#fff) 5%,transparent);border-bottom:1px solid color-mix(in srgb,var(--text-primary,#fff) 10%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.bc-hub{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 18px;max-width:520px;margin:16px auto;width:calc(100% - 24px)}
.bc-title{font-family:"Space Grotesk",Inter,sans-serif;font-weight:700;font-size:clamp(1.6rem,5vw,2.2rem);margin:0;letter-spacing:-.02em}
.bc-sub{opacity:.65;margin:0 0 6px;font-size:.9rem}
.bc-back{
  display:inline-flex;align-items:center;gap:8px;
  padding:10px 18px 10px 14px;border-radius:999px;
  border:1px solid color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);
  background:color-mix(in srgb,var(--text-primary,#fff) 8%,transparent);
  color:color-mix(in srgb,var(--text-primary,#e2e8f0) 92%,transparent);
  font-size:.92rem;font-weight:600;letter-spacing:.01em;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:0 4px 16px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.06);
  cursor:pointer;transition:background .15s ease,transform .15s ease;
}
.bc-back:hover{background:color-mix(in srgb,var(--text-primary,#fff) 14%,transparent);transform:translateY(-1px)}
.bc-back:active{transform:translateY(0)}
.bc-back-arrow{font-size:1.05em;opacity:.9}
.bc-regen-btn{color:#7dd3fc}.bc-regen-btn:hover{color:#e0f2fe;transform:rotate(-25deg);transition:transform .25s ease}.bc-icon-btn{appearance:none;border:none;background:color-mix(in srgb,var(--text-primary,#fff) 8%,transparent);color:inherit;border-radius:12px;width:40px;height:40px;display:grid;place-items:center;font-size:1.1rem;cursor:pointer;backdrop-filter:blur(12px)}
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

.bc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
.bc-modal{max-width:360px;width:100%;padding:22px 20px;border-radius:20px}
.bc-modal h3{margin:0 0 10px;font-size:1.15rem}
.bc-modal p{margin:0 0 16px;font-size:.9rem;line-height:1.45;opacity:.9}
.bc-modal-actions{display:flex;gap:10px;justify-content:flex-end}
.bc-threat{position:absolute;top:4px;right:6px;font-size:.75rem;font-weight:800;color:#fecaca;background:rgba(127,29,29,.75);padding:2px 6px;border-radius:8px;pointer-events:none;animation:bc-threat-pulse 1s ease-in-out infinite}
@keyframes bc-threat-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:.85}}
.bc-bicolor{box-shadow:inset 0 -6px 0 rgba(255,255,255,.35)}
.bc-time-warn{color:#FF6B4A}
.bc-combo{color:#FFC94D;font-weight:800}
.bc-play-actions{display:flex;gap:6px;align-items:center}
.bc-board-wrap{overflow:auto;max-width:100%;display:flex;justify-content:center;align-items:center;flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:12px;padding-bottom:max(16px,env(safe-area-inset-bottom));touch-action:none}
.bc-board{border:1px solid rgba(255,255,255,.08);position:relative;background:color-mix(in srgb,var(--text-primary,#fff) 4%,transparent);border:1px solid color-mix(in srgb,var(--text-primary,#fff) 12%,transparent);border-radius:18px;backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,.25);flex-shrink:0}
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
@media(max-width:480px){.bc-play-meta{font-size:.75rem;gap:6px 8px}.bc-regen-btn{color:#7dd3fc}.bc-regen-btn:hover{color:#e0f2fe;transform:rotate(-25deg);transition:transform .25s ease}.bc-icon-btn{width:36px;height:36px}.bc-hub{margin:10px auto;padding:20px 14px}}
`