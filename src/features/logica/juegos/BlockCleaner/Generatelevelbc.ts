// =============================================================================
// Generatelevelbc.ts — Block Cleaner · Color Block Jam style engine (v9)
//
// FIXES v9 (críticos):
// - PUERTAS SIEMPRE COMPATIBLES con axisLock / forcedDir / orientation.
//   Pieza con eje horizontal → puerta SOLO en left/right.
//   Pieza con eje vertical   → puerta SOLO en top/bottom.
// - Asignación de lado de puerta ANTES de candados de eje; el axisLock
//   se deriva del lado de la puerta (nunca al revés).
// - Huella exacta: longitud de puerta = max footprint del color en ese lado.
// - Scramble + 16 pasadas de "no-exit-at-start" + reintento de semillas.
// - Tableros que crecen de forma agresiva y predecible.
// - API pública estable para BlockCleaner.tsx.
// =============================================================================

export type BlockColor =
  | 'cyan' | 'blue' | 'violet' | 'orange' | 'pink' | 'yellow' | 'green' | 'red'
  | 'lime' | 'teal' | 'magenta' | 'amber' | 'indigo' | 'rose' | 'sky' | 'coral'

export const BLOCK_COLOR_ORDER: BlockColor[] = [
  'cyan', 'blue', 'violet', 'orange', 'pink', 'yellow', 'green', 'red',
  'lime', 'teal', 'magenta', 'amber', 'indigo', 'rose', 'sky', 'coral',
]

export type Orientation = 'horizontal' | 'vertical'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type AxisLock = 'horizontal' | 'vertical'
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Block {
  id: string
  color: BlockColor
  row: number
  col: number
  length: number
  orientation: Orientation
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
// RNG determinista (Mulberry32)
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
// Dificultad — tableros que crecen de verdad
// -----------------------------------------------------------------------------
export interface DifficultyTierConfig {
  rows: number
  cols: number
  numBlocks: number
  numColors: number
  obstacleCount: number
  minLength: number
  maxLength: number
  scrambleMoves: number
  axisLockChance: number
  lockedChance: number
  lockedClearsMin: number
  lockedClearsMax: number
  timeLimitBase: number
  label: string
}

export function getDifficultyTier(level: number): DifficultyTierConfig {
  const L = Math.max(1, level)
  const decade = Math.floor((L - 1) / 10)

  if (L <= 3) {
    return {
      rows: 5, cols: 5, numBlocks: 3, numColors: 3, obstacleCount: 0,
      minLength: 1, maxLength: 2, scrambleMoves: 8, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 180, label: 'Tutorial',
    }
  }
  if (L <= 6) {
    return {
      rows: 5, cols: 6, numBlocks: 4, numColors: 3, obstacleCount: 0,
      minLength: 1, maxLength: 2, scrambleMoves: 12, axisLockChance: 0,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 160, label: 'Tutorial+',
    }
  }
  if (L <= 10) {
    return {
      rows: 6, cols: 6, numBlocks: 6, numColors: 4, obstacleCount: 1,
      minLength: 1, maxLength: 3, scrambleMoves: 16, axisLockChance: 0.05,
      lockedChance: 0, lockedClearsMin: 0, lockedClearsMax: 0,
      timeLimitBase: 145, label: 'Principiante',
    }
  }
  if (L <= 16) {
    return {
      rows: 6, cols: 7, numBlocks: 7, numColors: 4, obstacleCount: 2,
      minLength: 1, maxLength: 3, scrambleMoves: 20, axisLockChance: 0.12,
      lockedChance: 0.06, lockedClearsMin: 1, lockedClearsMax: 2,
      timeLimitBase: 130, label: 'Principiante+',
    }
  }
  if (L <= 25) {
    return {
      rows: 7, cols: 7, numBlocks: 9, numColors: 5, obstacleCount: 2,
      minLength: 1, maxLength: 3, scrambleMoves: 26, axisLockChance: 0.2,
      lockedChance: 0.12, lockedClearsMin: 1, lockedClearsMax: 3,
      timeLimitBase: 120, label: 'Intermedio',
    }
  }
  if (L <= 40) {
    return {
      rows: 8, cols: 8, numBlocks: 11, numColors: 5, obstacleCount: 3,
      minLength: 1, maxLength: 4, scrambleMoves: 32, axisLockChance: 0.28,
      lockedChance: 0.18, lockedClearsMin: 1, lockedClearsMax: 4,
      timeLimitBase: 110, label: 'Intermedio+',
    }
  }
  if (L <= 60) {
    return {
      rows: 9, cols: 9, numBlocks: 13, numColors: 6, obstacleCount: 4,
      minLength: 1, maxLength: 4, scrambleMoves: 40, axisLockChance: 0.35,
      lockedChance: 0.22, lockedClearsMin: 1, lockedClearsMax: 5,
      timeLimitBase: 100, label: 'Avanzado',
    }
  }
  if (L <= 80) {
    return {
      rows: 10, cols: 10, numBlocks: 15, numColors: 7, obstacleCount: 5,
      minLength: 1, maxLength: 4, scrambleMoves: 48, axisLockChance: 0.4,
      lockedChance: 0.28, lockedClearsMin: 1, lockedClearsMax: 6,
      timeLimitBase: 90, label: 'Experto',
    }
  }
  if (L <= 100) {
    return {
      rows: 11, cols: 11, numBlocks: 17, numColors: 8, obstacleCount: 6,
      minLength: 1, maxLength: 5, scrambleMoves: 56, axisLockChance: 0.45,
      lockedChance: 0.32, lockedClearsMin: 2, lockedClearsMax: 7,
      timeLimitBase: 80, label: 'Maestro',
    }
  }

  // Infinito: crece suavemente hasta 14×14
  const extra = Math.floor((L - 100) / 15)
  return {
    rows: clampNum(12 + extra, 12, 14),
    cols: clampNum(12 + extra, 12, 14),
    numBlocks: clampNum(18 + Math.floor((L - 100) / 8), 18, 26),
    numColors: clampNum(8 + Math.floor((L - 100) / 20), 8, BLOCK_COLOR_ORDER.length),
    obstacleCount: clampNum(7 + Math.floor((L - 100) / 12), 7, 18),
    minLength: 1,
    maxLength: clampNum(4 + Math.floor((L - 100) / 40), 4, 5),
    scrambleMoves: clampNum(60 + Math.floor((L - 100) / 5), 60, 90),
    axisLockChance: clampNum(0.48 + decade * 0.01, 0.48, 0.62),
    lockedChance: clampNum(0.35 + decade * 0.01, 0.35, 0.5),
    lockedClearsMin: 2,
    lockedClearsMax: clampNum(6 + Math.floor((L - 100) / 25), 6, 10),
    timeLimitBase: clampNum(75 - Math.floor((L - 100) / 10), 45, 75),
    label: 'Infinito',
  }
}

// -----------------------------------------------------------------------------
// Geometría
// -----------------------------------------------------------------------------
function cellKey(r: number, c: number) {
  return `${r}:${c}`
}

export function blockCells(b: Pick<Block, 'row' | 'col' | 'length' | 'orientation'>): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < b.length; i++) {
    out.push([
      b.orientation === 'vertical' ? b.row + i : b.row,
      b.orientation === 'horizontal' ? b.col + i : b.col,
    ])
  }
  return out
}

export function blockWidth(b: Pick<Block, 'length' | 'orientation'>): number {
  return b.orientation === 'horizontal' ? b.length : 1
}

export function blockHeight(b: Pick<Block, 'length' | 'orientation'>): number {
  return b.orientation === 'vertical' ? b.length : 1
}

export function footprintAlongSide(b: Pick<Block, 'length' | 'orientation'>, side: Side): number {
  if (side === 'left' || side === 'right') return blockHeight(b)
  return blockWidth(b)
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
  if (block.lockedUntilClears != null && clearedCount < block.lockedUntilClears) return false
  return true
}

function cellsAt(
  b: Pick<Block, 'length' | 'orientation'>,
  row: number,
  col: number
): [number, number][] {
  return blockCells({ ...b, row, col })
}

/** Lados compatibles con un axisLock (o con orientación si no hay lock). */
function sidesForAxis(axis: AxisLock | Orientation): Side[] {
  if (axis === 'horizontal') return ['left', 'right']
  return ['top', 'bottom']
}

function axisForSide(side: Side): AxisLock {
  return side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
}

function dirTowardSide(side: Side): Direction {
  if (side === 'left') return 'left'
  if (side === 'right') return 'right'
  if (side === 'top') return 'up'
  return 'down'
}

// -----------------------------------------------------------------------------
// Rangos de deslizamiento
// -----------------------------------------------------------------------------
export function computeSlideRangeOnAxis(
  block: Block,
  axis: 'horizontal' | 'vertical',
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount: number
): { min: number; max: number } {
  const current = axis === 'horizontal' ? block.col : block.row

  if (!isBlockMovable(block, clearedCount)) {
    return { min: current, max: current }
  }
  if (block.axisLock && block.axisLock !== axis) {
    return { min: current, max: current }
  }
  if (block.forcedDir) {
    const ok =
      (axis === 'horizontal' && (block.forcedDir === 'left' || block.forcedDir === 'right')) ||
      (axis === 'vertical' && (block.forcedDir === 'up' || block.forcedDir === 'down'))
    if (!ok) return { min: current, max: current }
  }

  const occ = buildOccupancy(blocks, obstacles, block.id)
  const w = blockWidth(block)
  const h = blockHeight(block)
  const extent = axis === 'horizontal' ? w : h
  const boardSize = axis === 'horizontal' ? cols : rows
  const boundMax = boardSize - extent

  let min = current
  let max = current

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
      const testCells =
        axis === 'horizontal'
          ? cellsAt(block, block.row, next)
          : cellsAt(block, next, block.col)
      if (testCells.some(([r, c]) => occ.has(cellKey(r, c)))) break
      min = next
    }
  }
  if (canInc) {
    while (max < boundMax) {
      const next = max + 1
      const testCells =
        axis === 'horizontal'
          ? cellsAt(block, block.row, next)
          : cellsAt(block, next, block.col)
      if (testCells.some(([r, c]) => occ.has(cellKey(r, c)))) break
      max = next
    }
  }
  return { min, max }
}

export function computeSlideRange(
  block: Block,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  clearedCount = 999
): { min: number; max: number } {
  const axis = block.orientation === 'horizontal' ? 'horizontal' : 'vertical'
  return computeSlideRangeOnAxis(block, axis, blocks, obstacles, rows, cols, clearedCount)
}

export function listReachablePositionsOnAxis(
  block: Block,
  axis: 'horizontal' | 'vertical',
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
// Salidas
// -----------------------------------------------------------------------------
function isAlignedWithExit(
  block: Block,
  exit: Exit,
  rows: number,
  cols: number
): boolean {
  const cells = blockCells(block)
  const rowsArr = cells.map(([r]) => r)
  const colsArr = cells.map(([, c]) => c)
  const minR = Math.min(...rowsArr)
  const maxR = Math.max(...rowsArr)
  const minC = Math.min(...colsArr)
  const maxC = Math.max(...colsArr)

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

/**
 * Una pieza solo puede salir por su color si:
 * - no está bloqueada por candado
 * - la huella cabe en la puerta
 * - está alineada con la puerta
 * - su axisLock (si existe) es compatible con el lado de la puerta
 * - su forcedDir (si existe) apunta hacia ese lado
 */
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

  // Compatibilidad de eje: horizontal lock → solo left/right
  if (block.axisLock) {
    const need = axisForSide(exit.side)
    if (block.axisLock !== need) return false
  }
  if (block.forcedDir) {
    const need = dirTowardSide(exit.side)
    if (block.forcedDir !== need) return false
  }

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

// -----------------------------------------------------------------------------
// Fallback
// -----------------------------------------------------------------------------
export const FALLBACK_LEVEL: BlockCleanerLevel = {
  id: 1,
  rows: 5,
  cols: 5,
  blocks: [
    { id: 'b1', color: 'cyan', row: 2, col: 1, length: 2, orientation: 'horizontal' },
    { id: 'b2', color: 'orange', row: 0, col: 3, length: 2, orientation: 'vertical' },
    { id: 'b3', color: 'violet', row: 3, col: 0, length: 1, orientation: 'horizontal' },
    { id: 'b4', color: 'cyan', row: 1, col: 0, length: 1, orientation: 'horizontal' },
  ],
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
// Inserción en cola hacia la puerta
// -----------------------------------------------------------------------------
function tryPlaceAtDepth(
  p: { color: BlockColor; length: number; orientation: Orientation },
  exit: Exit,
  depth: number,
  rows: number,
  cols: number,
  occupied: Set<string>,
  rng: () => number
): { row: number; col: number } | null {
  const bh = p.orientation === 'vertical' ? p.length : 1
  const bw = p.orientation === 'horizontal' ? p.length : 1

  let fixedRow: number | null = null
  let fixedCol: number | null = null
  let minStart: number
  let maxStart: number
  let alongRows: boolean

  if (exit.side === 'left' || exit.side === 'right') {
    fixedCol = exit.side === 'left' ? depth : cols - bw - depth
    if (fixedCol < 0 || fixedCol + bw > cols) return null
    minStart = Math.max(exit.pos, 0)
    maxStart = Math.min(exit.pos + exit.length - bh, rows - bh)
    alongRows = true
  } else {
    fixedRow = exit.side === 'top' ? depth : rows - bh - depth
    if (fixedRow < 0 || fixedRow + bh > rows) return null
    minStart = Math.max(exit.pos, 0)
    maxStart = Math.min(exit.pos + exit.length - bw, cols - bw)
    alongRows = false
  }
  if (maxStart < minStart) return null

  const candidates: number[] = []
  for (let v = minStart; v <= maxStart; v++) candidates.push(v)

  for (const v of shuffle(rng, candidates)) {
    const row = alongRows ? v : (fixedRow as number)
    const col = alongRows ? (fixedCol as number) : v
    const cells = cellsAt(p, row, col)
    if (
      cells.every(
        ([r, c]) =>
          r >= 0 && r < rows && c >= 0 && c < cols && !occupied.has(cellKey(r, c))
      )
    ) {
      return { row, col }
    }
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

function nudgeBlockAwayFromExit(
  blocks: Block[],
  blockId: string,
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  rng: () => number
): Block[] {
  const block = blocks.find((b) => b.id === blockId)
  if (!block) return blocks

  const axes: Array<'horizontal' | 'vertical'> = []
  if (!block.axisLock || block.axisLock === 'horizontal') axes.push('horizontal')
  if (!block.axisLock || block.axisLock === 'vertical') axes.push('vertical')

  for (const axis of shuffle(rng, axes)) {
    const range = computeSlideRangeOnAxis(block, axis, blocks, obstacles, rows, cols, 999)
    const cur = axis === 'horizontal' ? block.col : block.row
    const options: number[] = []
    for (let v = range.min; v <= range.max; v++) {
      if (v !== cur) options.push(v)
    }
    if (!options.length) continue
    const target = pickItem(rng, options)
    return blocks.map((b) =>
      b.id !== blockId
        ? b
        : axis === 'horizontal'
          ? { ...b, col: target }
          : { ...b, row: target }
    )
  }
  return blocks
}

/**
 * Comprueba que TODA pieza pueda, en teoría, alcanzar su puerta
 * (ignorando otras piezas): el axisLock y forcedDir apuntan al lado correcto
 * y la huella cabe.
 */
function allBlocksCompatibleWithExits(blocks: Block[], exits: Exit[]): boolean {
  const byColor = new Map<BlockColor, Exit>()
  for (const e of exits) byColor.set(e.color, e)

  for (const b of blocks) {
    const exit = byColor.get(b.color)
    if (!exit) return false
    if (footprintAlongSide(b, exit.side) > exit.length) return false
    if (b.axisLock && b.axisLock !== axisForSide(exit.side)) return false
    if (b.forcedDir && b.forcedDir !== dirTowardSide(exit.side)) return false
  }
  return true
}

// -----------------------------------------------------------------------------
// Generación principal
// -----------------------------------------------------------------------------
function generateLevelOnce(
  safeId: number,
  tier: DifficultyTierConfig,
  seed: number
): BlockCleanerLevel | null {
  const rng = mulberry32(seed)
  const { rows, cols } = tier
  const colors = BLOCK_COLOR_ORDER.slice(0, Math.max(2, tier.numColors))
  const sides: Side[] = ['top', 'bottom', 'left', 'right']

  // 1) Planificar bloques (color, length, orientation)
  type Planned = { color: BlockColor; length: number; orientation: Orientation }
  const planned: Planned[] = []
  for (let i = 0; i < tier.numBlocks; i++) {
    const color = pickItem(rng, colors)
    const length = pickInt(rng, tier.minLength, tier.maxLength)
    const orientation: Orientation = rng() > 0.5 ? 'horizontal' : 'vertical'
    planned.push({ color, length, orientation })
  }

  const usedColors = Array.from(new Set(planned.map((p) => p.color)))

  // 2) Elegir lado de puerta POR COLOR según mayoría de orientaciones
  //    horizontal-majority → left/right; vertical-majority → top/bottom
  const sideByColor = new Map<BlockColor, Side>()
  for (const color of usedColors) {
    const group = planned.filter((p) => p.color === color)
    const hCount = group.filter((p) => p.orientation === 'horizontal').length
    const vCount = group.length - hCount
    const preferredAxis: AxisLock = hCount >= vCount ? 'horizontal' : 'vertical'
    const allowed = sidesForAxis(preferredAxis)
    sideByColor.set(color, pickItem(rng, allowed))
  }

  // 3) Una puerta por color, ANCHO = max footprint en ese lado
  const exits: Exit[] = []
  const usedSlots: Array<{ side: Side; pos: number; length: number }> = []

  const placeExit = (color: BlockColor, side: Side): boolean => {
    const sameColor = planned.filter((p) => p.color === color)
    const need = Math.max(1, ...sameColor.map((p) => footprintAlongSide(p, side)))
    const boundaryLen = side === 'top' || side === 'bottom' ? cols : rows
    const length = Math.min(need, boundaryLen)
    for (let attempt = 0; attempt < 160; attempt++) {
      const pos = pickInt(rng, 0, Math.max(0, boundaryLen - length))
      const overlap = usedSlots.some(
        (u) => u.side === side && pos < u.pos + u.length && pos + length > u.pos
      )
      if (overlap) continue
      exits.push({ id: `e${exits.length + 1}`, color, side, pos, length })
      usedSlots.push({ side, pos, length })
      sideByColor.set(color, side)
      return true
    }
    return false
  }

  for (const color of usedColors) {
    const preferred = sideByColor.get(color) ?? pickItem(rng, sides)
    let placed = placeExit(color, preferred)
    if (!placed) {
      // Alternativas del MISMO eje (compatibles con la orientación mayoritaria)
      const sameAxis = sidesForAxis(axisForSide(preferred)).filter((s) => s !== preferred)
      for (const alt of shuffle(rng, sameAxis)) {
        if (placeExit(color, alt)) {
          placed = true
          break
        }
      }
    }
    if (!placed) {
      // Último recurso: cualquier lado libre (se reorientarán piezas si hace falta)
      for (const alt of shuffle(rng, sides)) {
        if (placeExit(color, alt)) {
          placed = true
          break
        }
      }
    }
    if (!placed) return null
  }

  const colorExit = new Map<BlockColor, Exit>()
  for (const e of exits) colorExit.set(e.color, e)

  // 4) Reorientar planned para que cada bloque quepa en su puerta
  //    y su orientación sea compatible con el lado de la puerta.
  const fixedPlanned: Planned[] = planned.map((p) => {
    const exit = colorExit.get(p.color)
    if (!exit) return p
    const needAxis = axisForSide(exit.side)
    // Si la pieza es más larga que la puerta en su orientación actual, girar
    let orientation = p.orientation
    let length = p.length
    if (footprintAlongSide({ length, orientation }, exit.side) > exit.length) {
      // Girar: la huella en el otro eje suele ser 1
      orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal'
      if (footprintAlongSide({ length, orientation }, exit.side) > exit.length) {
        length = exit.length
      }
    }
    // Preferir orientación alineada con el eje de la puerta (cola natural)
    if (needAxis === 'horizontal' && orientation === 'vertical' && length === 1) {
      // 1×1: da igual
    } else if (needAxis === 'vertical' && orientation === 'horizontal' && length === 1) {
      // 1×1: da igual
    }
    return { ...p, orientation, length }
  })

  // 5) Obstáculos interiores
  const occupied = new Set<string>()
  const obstacles: Obstacle[] = []
  for (let i = 0; i < tier.obstacleCount && rows > 2 && cols > 2; i++) {
    let attempts = 0
    while (attempts < 120) {
      attempts++
      const row = pickInt(rng, 1, rows - 2)
      const col = pickInt(rng, 1, cols - 2)
      const key = cellKey(row, col)
      if (occupied.has(key)) continue
      occupied.add(key)
      obstacles.push({ id: `o${obstacles.length + 1}`, row, col })
      break
    }
  }

  // 6) Inserción constructiva en cola hacia la puerta
  const blocks: Block[] = []
  const byColor = new Map<BlockColor, Planned[]>()
  for (const p of fixedPlanned) {
    if (!colorExit.has(p.color)) continue
    const arr = byColor.get(p.color) ?? []
    arr.push(p)
    byColor.set(p.color, arr)
  }

  for (const color of usedColors) {
    const queue = shuffle(rng, byColor.get(color) ?? [])
    const exit = colorExit.get(color)
    if (!exit) continue
    const exitAxis = axisForSide(exit.side)

    for (const p of queue) {
      const bh = p.orientation === 'vertical' ? p.length : 1
      const bw = p.orientation === 'horizontal' ? p.length : 1
      const maxDepth =
        exit.side === 'left' || exit.side === 'right' ? cols - bw : rows - bh
      let origin: { row: number; col: number } | null = null
      for (let depth = 0; depth <= Math.max(0, maxDepth) && !origin; depth++) {
        origin = tryPlaceAtDepth(p, exit, depth, rows, cols, occupied, rng)
      }
      if (!origin) continue

      for (const [r, c] of cellsAt(p, origin.row, origin.col)) {
        occupied.add(cellKey(r, c))
      }

      // axisLock / forcedDir SIEMPRE derivados del lado de la puerta
      let axisLock: AxisLock | undefined
      let forcedDir: Direction | undefined
      if (rng() < tier.axisLockChance) {
        axisLock = exitAxis // compatible por construcción
        if (rng() < 0.45) {
          forcedDir = dirTowardSide(exit.side) // apunta a la puerta
        }
      }

      blocks.push({
        id: `b${blocks.length + 1}`,
        color: p.color,
        row: origin.row,
        col: origin.col,
        length: p.length,
        orientation: p.orientation,
        axisLock,
        forcedDir,
      })
    }
  }

  if (!blocks.length) return null

  // 7) Candados de orden (precedentes garantizados por orden de inserción)
  const n = blocks.length
  for (let i = 0; i < n; i++) {
    const guaranteedPrecedents = n - 1 - i
    if (
      tier.lockedChance > 0 &&
      guaranteedPrecedents >= tier.lockedClearsMin &&
      rng() < tier.lockedChance
    ) {
      const maxLock = Math.min(tier.lockedClearsMax, guaranteedPrecedents)
      blocks[i].lockedUntilClears = pickInt(rng, tier.lockedClearsMin, maxLock)
    }
  }

  // Validación dura: toda pieza compatible con su puerta
  if (!allBlocksCompatibleWithExits(blocks, exits)) return null

  // 8) Scramble reversible
  let current = blocks.map((b) => ({ ...b }))
  let lastId: string | null = null
  for (let step = 0; step < tier.scrambleMoves; step++) {
    const scramblable = current.filter((b) => !b.lockedUntilClears && b.id !== lastId)
    const pool = scramblable.length
      ? scramblable
      : current.filter((b) => !b.lockedUntilClears)
    if (!pool.length) break
    const block = pickItem(rng, pool)
    const axes: Array<'horizontal' | 'vertical'> = []
    if (!block.axisLock || block.axisLock === 'horizontal') axes.push('horizontal')
    if (!block.axisLock || block.axisLock === 'vertical') axes.push('vertical')
    if (!axes.length) continue
    const axis = pickItem(rng, axes)
    const range = computeSlideRangeOnAxis(block, axis, current, obstacles, rows, cols, 999)
    const cur = axis === 'horizontal' ? block.col : block.row
    const options: number[] = []
    for (let v = range.min; v <= range.max; v++) if (v !== cur) options.push(v)
    if (!options.length) continue
    const target = pickItem(rng, options)
    current = current.map((b) =>
      b.id !== block.id
        ? b
        : axis === 'horizontal'
          ? { ...b, col: target }
          : { ...b, row: target }
    )
    lastId = block.id
  }

  // 9) GARANTÍA: ninguna pieza desbloqueada arranca lista para salir
  for (let pass = 0; pass < 16; pass++) {
    let fixedAny = false
    for (let i = 0; i < current.length; i++) {
      const block = current[i]
      if (block.lockedUntilClears) continue
      const exit = colorExit.get(block.color)
      if (!exit) continue
      if (!canExit(block, exit, current, obstacles, rows, cols, 999)) continue

      const before = current
      current = nudgeBlockAwayFromExit(current, block.id, obstacles, rows, cols, rng)
      if (current !== before) {
        fixedAny = true
        continue
      }
      const others = shuffle(
        rng,
        current.filter((b) => b.id !== block.id && !b.lockedUntilClears)
      )
      for (const other of others) {
        const before2 = current
        current = nudgeBlockAwayFromExit(current, other.id, obstacles, rows, cols, rng)
        if (current !== before2) {
          fixedAny = true
          break
        }
      }
    }
    if (!fixedAny) break
  }

  if (countUnlockedExitable(current, exits, obstacles, rows, cols) > 0) {
    return null
  }
  if (!allBlocksCompatibleWithExits(current, exits)) return null

  const parMoves = Math.max(
    1,
    Math.round(tier.scrambleMoves * 0.38 + current.length * 1.9)
  )

  return {
    id: safeId,
    rows,
    cols,
    blocks: current,
    exits,
    obstacles,
    difficulty: safeId,
    parMoves,
    timeLimit: Math.max(40, tier.timeLimitBase + pickInt(rng, -10, 20)),
    seed,
    tierLabel: tier.label,
  }
}

export function generateLevel(levelId: number): BlockCleanerLevel {
  try {
    const safeId = Math.max(1, Math.floor(Number(levelId)) || 1)
    const tier = getDifficultyTier(safeId)
    const baseSeed = safeId * 2654435761 + 17

    for (let attempt = 0; attempt < 12; attempt++) {
      const seed = (baseSeed + attempt * 9973) >>> 0
      const level = generateLevelOnce(safeId, tier, seed)
      if (level && level.blocks.length > 0) {
        const unlockedReady = countUnlockedExitable(
          level.blocks,
          level.exits,
          level.obstacles,
          level.rows,
          level.cols
        )
        if (unlockedReady === 0 && allBlocksCompatibleWithExits(level.blocks, level.exits)) {
          return level
        }
      }
    }

    return {
      ...FALLBACK_LEVEL,
      id: safeId,
      difficulty: safeId,
      seed: baseSeed,
      tierLabel: tier.label,
    }
  } catch {
    return { ...FALLBACK_LEVEL }
  }
}

// -----------------------------------------------------------------------------
// Solver + pistas
// -----------------------------------------------------------------------------
const SOLVER_CAP = 20000

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
    for (const axis of ['horizontal', 'vertical'] as const) {
      const range = computeSlideRangeOnAxis(
        block, axis, blocks, obstacles, rows, cols, cleared
      )
      const cur = axis === 'horizontal' ? block.col : block.row
      for (let v = range.min; v <= range.max; v++) {
        if (v === cur) continue
        const next = blocks.map((b) =>
          b.id === block.id
            ? axis === 'horizontal'
              ? { ...b, col: v }
              : { ...b, row: v }
            : b
        )
        out.push({
          move: {
            blockId: block.id,
            toRow: axis === 'vertical' ? v : block.row,
            toCol: axis === 'horizontal' ? v : block.col,
          },
          blocks: next,
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
      const range = computeSlideRangeOnAxis(
        block, 'horizontal', blocks, obstacles, rows, cols, clearedCount
      )
      const targetCol = exit.side === 'left' ? range.min : range.max
      if (targetCol !== block.col) {
        return { blockId: block.id, toRow: block.row, toCol: targetCol }
      }
      const vRange = computeSlideRangeOnAxis(
        block, 'vertical', blocks, obstacles, rows, cols, clearedCount
      )
      const idealRow = Math.max(vRange.min, Math.min(vRange.max, exit.pos))
      if (idealRow !== block.row) {
        return { blockId: block.id, toRow: idealRow, toCol: block.col }
      }
    } else {
      const range = computeSlideRangeOnAxis(
        block, 'vertical', blocks, obstacles, rows, cols, clearedCount
      )
      const targetRow = exit.side === 'top' ? range.min : range.max
      if (targetRow !== block.row) {
        return { blockId: block.id, toRow: targetRow, toCol: block.col }
      }
      const hRange = computeSlideRangeOnAxis(
        block, 'horizontal', blocks, obstacles, rows, cols, clearedCount
      )
      const idealCol = Math.max(hRange.min, Math.min(hRange.max, exit.pos))
      if (idealCol !== block.col) {
        return { blockId: block.id, toRow: block.row, toCol: idealCol }
      }
    }
  }

  for (const block of blocks) {
    if (!isBlockMovable(block, clearedCount)) continue
    for (const axis of ['horizontal', 'vertical'] as const) {
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
  const sol = solveLevel(blocks, exits, obstacles, rows, cols, clearedCount, 12000)
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

export { isSolved as isLevelSolved }

export interface LevelAnalysis {
  totalBlocks: number
  colorsUsed: number
  lockedBlocks: number
  axisLocked: number
  forcedDir: number
  obstacles: number
  estimatedMinMoves: number
  hasImmediateExit: boolean
}

export function analyzeLevel(level: BlockCleanerLevel): LevelAnalysis {
  const blocks = level.blocks ?? []
  const colors = new Set(blocks.map((b) => b.color))
  let locked = 0
  let axisL = 0
  let forced = 0
  for (const b of blocks) {
    if (b.lockedUntilClears) locked++
    if (b.axisLock) axisL++
    if (b.forcedDir) forced++
  }
  const immediate = countUnlockedExitable(
    blocks,
    level.exits,
    level.obstacles,
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
  }
}

export function validateLevel(level: BlockCleanerLevel): boolean {
  if (!level || !Array.isArray(level.blocks) || level.blocks.length === 0) return false
  if (!Array.isArray(level.exits) || level.exits.length === 0) return false
  if (!allBlocksCompatibleWithExits(level.blocks, level.exits)) return false
  const ready = countUnlockedExitable(
    level.blocks,
    level.exits,
    level.obstacles ?? [],
    level.rows,
    level.cols
  )
  return ready === 0
}

export function computeDragTarget(
  block: Block,
  axis: 'horizontal' | 'vertical',
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
  if (axis === 'horizontal') {
    const target = clampNum(baseCol + deltaCells, range.min, range.max)
    return { row: baseRow, col: target }
  }
  const target = clampNum(baseRow + deltaCells, range.min, range.max)
  return { row: target, col: baseCol }
}

export function preferredAxisFromDelta(
  dx: number,
  dy: number,
  currentAxis: 'horizontal' | 'vertical' | null,
  threshold = 4
): 'horizontal' | 'vertical' | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold && !currentAxis) {
    return null
  }
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical'
}

export const ENGINE_VERSION = '9.0.0'
export const ENGINE_NAME = 'BlockCleaner / Color Block Jam style'

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
    case 'left': return { dx: -d, dy: 0 }
    case 'right': return { dx: d, dy: 0 }
    case 'top': return { dx: 0, dy: -d }
    case 'bottom': return { dx: 0, dy: d }
  }
}

export function generateLevelBatch(
  fromId: number,
  toId: number
): BlockCleanerLevel[] {
  const out: BlockCleanerLevel[] = []
  for (let id = fromId; id <= toId; id++) {
    out.push(generateLevel(id))
  }
  return out
}

export function summarizeRange(fromId: number, toId: number): {
  total: number
  avgBlocks: number
  avgColors: number
  withLocks: number
  immediateExitCount: number
  incompatible: number
} {
  let totalBlocks = 0
  let totalColors = 0
  let withLocks = 0
  let immediate = 0
  let incompatible = 0
  const n = Math.max(0, toId - fromId + 1)
  for (let id = fromId; id <= toId; id++) {
    const lv = generateLevel(id)
    const a = analyzeLevel(lv)
    totalBlocks += a.totalBlocks
    totalColors += a.colorsUsed
    if (a.lockedBlocks > 0) withLocks++
    if (a.hasImmediateExit) immediate++
    if (!allBlocksCompatibleWithExits(lv.blocks, lv.exits)) incompatible++
  }
  return {
    total: n,
    avgBlocks: n ? totalBlocks / n : 0,
    avgColors: n ? totalColors / n : 0,
    withLocks,
    immediateExitCount: immediate,
    incompatible,
  }
}

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

// -----------------------------------------------------------------------------
// Fin del motor — API pública exportada arriba
// =============================================================================