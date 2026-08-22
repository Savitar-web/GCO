// =============================================================================
// Generatelevelbc.ts — Block Cleaner · Color Block Jam procedural engine
// Generación infinita, scramble inverso (solvencia garantizada), solver BFS,
// dificultad progresiva, forced-dir, multi-exit, par estimation.
// Pure TypeScript — sin React.
// =============================================================================

export type BlockColor =
  | 'cyan' | 'blue' | 'violet' | 'orange' | 'pink' | 'yellow' | 'green' | 'red'

export const BLOCK_COLOR_ORDER: BlockColor[] = [
  'cyan', 'blue', 'violet', 'orange', 'pink', 'yellow', 'green', 'red',
]

export type Orientation = 'horizontal' | 'vertical'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Block {
  id: string
  color: BlockColor
  row: number
  col: number
  length: number
  orientation: Orientation
  forcedDir?: Direction
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

function mulberry32(seed: number) {
  let s = seed | 0
  return function random() {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pickItem<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

export interface DifficultyTierConfig {
  rows: number
  cols: number
  numBlocks: number
  numColors: number
  obstacleCount: number
  minLength: number
  maxLength: number
  scrambleMoves: number
  forcedDirChance: number
  timeLimitBase: number
  extraExitsChance: number
  label: string
}

export function getDifficultyTier(level: number): DifficultyTierConfig {
  if (level <= 3) {
    return { rows: 5, cols: 5, numBlocks: 2, numColors: 2, obstacleCount: 0, minLength: 1, maxLength: 2, scrambleMoves: 4, forcedDirChance: 0, timeLimitBase: 180, extraExitsChance: 0, label: 'Tutorial' }
  }
  if (level <= 8) {
    return { rows: 6, cols: 6, numBlocks: 3, numColors: 3, obstacleCount: 0, minLength: 1, maxLength: 2, scrambleMoves: 6, forcedDirChance: 0, timeLimitBase: 150, extraExitsChance: 0, label: 'Introducción' }
  }
  if (level <= 15) {
    return { rows: 6, cols: 6, numBlocks: 4, numColors: 4, obstacleCount: 1, minLength: 1, maxLength: 3, scrambleMoves: 9, forcedDirChance: 0.1, timeLimitBase: 140, extraExitsChance: 0.15, label: 'Básico' }
  }
  if (level <= 25) {
    return { rows: 7, cols: 7, numBlocks: 5, numColors: 5, obstacleCount: 2, minLength: 1, maxLength: 3, scrambleMoves: 12, forcedDirChance: 0.15, timeLimitBase: 130, extraExitsChance: 0.2, label: 'Intermedio' }
  }
  if (level <= 40) {
    return { rows: 7, cols: 7, numBlocks: 6, numColors: 5, obstacleCount: 3, minLength: 1, maxLength: 3, scrambleMoves: 16, forcedDirChance: 0.22, timeLimitBase: 120, extraExitsChance: 0.25, label: 'Avanzado' }
  }
  if (level <= 60) {
    return { rows: 8, cols: 8, numBlocks: 7, numColors: 6, obstacleCount: 4, minLength: 1, maxLength: 4, scrambleMoves: 20, forcedDirChance: 0.28, timeLimitBase: 110, extraExitsChance: 0.3, label: 'Experto' }
  }
  if (level <= 100) {
    return { rows: 8, cols: 8, numBlocks: 8, numColors: 6, obstacleCount: 5, minLength: 1, maxLength: 4, scrambleMoves: 24, forcedDirChance: 0.35, timeLimitBase: 100, extraExitsChance: 0.35, label: 'Maestro' }
  }
  const stage = Math.min(Math.floor((level - 101) / 12), 16)
  return {
    rows: Math.min(8 + Math.floor(stage / 3), 10),
    cols: Math.min(8 + Math.floor(stage / 3), 10),
    numBlocks: Math.min(8 + Math.floor(stage / 2), 15),
    numColors: Math.min(6 + Math.floor(stage / 3), 8),
    obstacleCount: Math.min(5 + stage, 14),
    minLength: 1,
    maxLength: Math.min(4 + Math.floor(stage / 4), 5),
    scrambleMoves: Math.min(24 + stage * 2, 48),
    forcedDirChance: Math.min(0.35 + stage * 0.02, 0.6),
    timeLimitBase: Math.max(50, 100 - stage * 3),
    extraExitsChance: Math.min(0.35 + stage * 0.02, 0.5),
    label: stage < 6 ? 'Élite' : stage < 12 ? 'Legendario' : 'Infinito',
  }
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function blockCells(
  b: Pick<Block, 'row' | 'col' | 'length' | 'orientation'>
): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let i = 0; i < b.length; i++) {
    cells.push([
      b.orientation === 'vertical' ? b.row + i : b.row,
      b.orientation === 'horizontal' ? b.col + i : b.col,
    ])
  }
  return cells
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

export function computeSlideRange(
  block: Block,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): { min: number; max: number } {
  const occ = buildOccupancy(blocks, obstacles, block.id)
  const isH = block.orientation === 'horizontal'
  const current = isH ? block.col : block.row
  const fixed = isH ? block.row : block.col
  const boundMax = (isH ? cols : rows) - block.length
  let min = current
  let max = current
  const canDecrease =
    !block.forcedDir ||
    (isH && block.forcedDir === 'left') ||
    (!isH && block.forcedDir === 'up')
  const canIncrease =
    !block.forcedDir ||
    (isH && block.forcedDir === 'right') ||
    (!isH && block.forcedDir === 'down')
  if (canDecrease) {
    while (min > 0) {
      const probe = min - 1
      const r = isH ? fixed : probe
      const c = isH ? probe : fixed
      if (occ.has(cellKey(r, c))) break
      min = probe
    }
  }
  if (canIncrease) {
    while (max < boundMax) {
      const trailing = max + block.length
      const r = isH ? fixed : trailing
      const c = isH ? trailing : fixed
      if (occ.has(cellKey(r, c))) break
      max += 1
    }
  }
  return { min, max }
}

export function canExit(
  block: Block,
  exit: Exit,
  blocks: Block[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): boolean {
  if (block.color !== exit.color) return false
  if (block.length > exit.length) return false
  const isH = block.orientation === 'horizontal'
  const range = computeSlideRange(block, blocks, obstacles, rows, cols)
  if (exit.side === 'left' && isH) {
    if (range.min > 0) return false
    return block.row >= exit.pos && block.row <= exit.pos + exit.length - 1
  }
  if (exit.side === 'right' && isH) {
    if (range.max < cols - block.length) return false
    return block.row >= exit.pos && block.row <= exit.pos + exit.length - 1
  }
  if (exit.side === 'top' && !isH) {
    if (range.min > 0) return false
    return block.col >= exit.pos && block.col <= exit.pos + exit.length - 1
  }
  if (exit.side === 'bottom' && !isH) {
    if (range.max < rows - block.length) return false
    return block.col >= exit.pos && block.col <= exit.pos + exit.length - 1
  }
  return false
}

export function getExitableBlocks(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): string[] {
  const result: string[] = []
  if (!Array.isArray(blocks) || !Array.isArray(exits)) return result
  for (const b of blocks) {
    for (const e of exits) {
      if (canExit(b, e, blocks, obstacles, rows, cols)) {
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

export const FALLBACK_LEVEL: BlockCleanerLevel = {
  id: 1,
  rows: 5,
  cols: 5,
  blocks: [
    { id: 'b1', color: 'cyan', row: 2, col: 1, length: 2, orientation: 'horizontal' },
    { id: 'b2', color: 'orange', row: 0, col: 3, length: 2, orientation: 'vertical' },
  ],
  exits: [
    { id: 'e1', color: 'cyan', side: 'right', pos: 2, length: 1 },
    { id: 'e2', color: 'orange', side: 'bottom', pos: 3, length: 1 },
  ],
  obstacles: [],
  timeLimit: 180,
  difficulty: 1,
  parMoves: 4,
  seed: 1,
  tierLabel: 'Tutorial',
}

export function generateLevel(levelId: number): BlockCleanerLevel {
  try {
    const safeId = Math.max(1, Math.floor(Number(levelId)) || 1)
    const tier = getDifficultyTier(safeId)
    const seed = safeId * 2654435761 + 17
    const rng = mulberry32(seed)
    const { rows, cols } = tier
    const colors = BLOCK_COLOR_ORDER.slice(0, Math.max(2, tier.numColors))
    const occupied = new Set<string>()
    const exits: Exit[] = []
    const obstacles: Obstacle[] = []
    const sides: Side[] = ['top', 'bottom', 'left', 'right']

    for (let i = 0; i < colors.length; i++) {
      let placed = false
      let attempts = 0
      while (!placed && attempts < 120) {
        attempts++
        const side = pickItem(rng, sides)
        const maxPos = (side === 'top' || side === 'bottom' ? cols : rows) - 1
        const length = pickInt(rng, 1, Math.min(3, maxPos + 1))
        const pos = pickInt(rng, 0, Math.max(0, maxPos - length + 1))
        let overlap = false
        for (const e of exits) {
          if (e.side === side && pos < e.pos + e.length && pos + length > e.pos) {
            overlap = true
            break
          }
        }
        if (overlap) continue
        exits.push({ id: `e${exits.length + 1}`, color: colors[i], side, pos, length })
        placed = true
      }
    }

    if (rng() < tier.extraExitsChance && colors.length > 0) {
      const extraColor = pickItem(rng, colors)
      let attempts = 0
      while (attempts < 40) {
        attempts++
        const side = pickItem(rng, sides)
        const maxPos = (side === 'top' || side === 'bottom' ? cols : rows) - 1
        const length = pickInt(rng, 1, Math.min(2, maxPos + 1))
        const pos = pickInt(rng, 0, Math.max(0, maxPos - length + 1))
        let overlap = false
        for (const e of exits) {
          if (e.side === side && pos < e.pos + e.length && pos + length > e.pos) {
            overlap = true
            break
          }
        }
        if (overlap) continue
        exits.push({ id: `e${exits.length + 1}`, color: extraColor, side, pos, length })
        break
      }
    }

    if (exits.length === 0) {
      exits.push({ id: 'e1', color: colors[0], side: 'right', pos: 0, length: Math.min(2, rows) })
    }

    for (let i = 0; i < tier.obstacleCount; i++) {
      let attempts = 0
      while (attempts < 70) {
        attempts++
        const row = pickInt(rng, 0, rows - 1)
        const col = pickInt(rng, 0, cols - 1)
        const key = cellKey(row, col)
        if (occupied.has(key)) continue
        occupied.add(key)
        obstacles.push({ id: `o${i + 1}`, row, col })
        break
      }
    }

    const blocks: Block[] = []
    const colorExits = new Map<BlockColor, Exit[]>()
    for (const e of exits) {
      const list = colorExits.get(e.color) ?? []
      list.push(e)
      colorExits.set(e.color, list)
    }

    for (let i = 0; i < tier.numBlocks; i++) {
      const color = colors[i % colors.length]
      const possible = colorExits.get(color) ?? []
      if (possible.length === 0) continue
      let placed = false
      let attempts = 0
      while (!placed && attempts < 140) {
        attempts++
        const exit = pickItem(rng, possible)
        const length = pickInt(
          rng,
          tier.minLength,
          Math.min(tier.maxLength, exit.length, exit.side === 'left' || exit.side === 'right' ? cols : rows)
        )
        let orientation: Orientation
        let row: number
        let col: number
        if (exit.side === 'left' || exit.side === 'right') {
          orientation = 'horizontal'
          row = exit.pos + pickInt(rng, 0, Math.max(0, exit.length - 1))
          col = exit.side === 'left' ? 0 : cols - length
        } else {
          orientation = 'vertical'
          col = exit.pos + pickInt(rng, 0, Math.max(0, exit.length - 1))
          row = exit.side === 'top' ? 0 : rows - length
        }
        let fits = row >= 0 && col >= 0
        if (orientation === 'horizontal' && col + length > cols) fits = false
        if (orientation === 'vertical' && row + length > rows) fits = false
        if (fits) {
          for (let k = 0; k < length; k++) {
            const r = orientation === 'vertical' ? row + k : row
            const c = orientation === 'horizontal' ? col + k : col
            if (r < 0 || r >= rows || c < 0 || c >= cols || occupied.has(cellKey(r, c))) {
              fits = false
              break
            }
          }
        }
        if (!fits) continue
        for (let k = 0; k < length; k++) {
          const r = orientation === 'vertical' ? row + k : row
          const c = orientation === 'horizontal' ? col + k : col
          occupied.add(cellKey(r, c))
        }
        const forcedDir: Direction | undefined =
          rng() < tier.forcedDirChance
            ? orientation === 'horizontal'
              ? exit.side === 'left' ? 'left' : 'right'
              : exit.side === 'top' ? 'up' : 'down'
            : undefined
        blocks.push({ id: `b${i + 1}`, color, row, col, length, orientation, forcedDir })
        placed = true
      }
    }

    if (blocks.length === 0) {
      return { ...FALLBACK_LEVEL, id: safeId, difficulty: safeId, seed, tierLabel: tier.label }
    }

    let current = blocks.map((b) => ({ ...b }))
    let lastMovedId: string | null = null
    for (let step = 0; step < tier.scrambleMoves; step++) {
      const candidates = current.filter((b) => b.id !== lastMovedId)
      if (candidates.length === 0) break
      const block = pickItem(rng, candidates)
      const range = computeSlideRange(block, current, obstacles, rows, cols)
      const options: number[] = []
      const curCoord = block.orientation === 'horizontal' ? block.col : block.row
      for (let v = range.min; v <= range.max; v++) {
        if (v !== curCoord) options.push(v)
      }
      if (options.length === 0) continue
      const target = pickItem(rng, options)
      current = current.map((b) => {
        if (b.id !== block.id) return b
        return block.orientation === 'horizontal' ? { ...b, col: target } : { ...b, row: target }
      })
      lastMovedId = block.id
    }

    if (
      current.length > 0 &&
      getExitableBlocks(current, exits, obstacles, rows, cols).length === current.length
    ) {
      const b = current[0]
      const range = computeSlideRange(b, current, obstacles, rows, cols)
      const curCoord = b.orientation === 'horizontal' ? b.col : b.row
      const alt = range.max !== curCoord ? range.max : range.min
      if (alt !== curCoord) {
        current = current.map((x) =>
          x.id === b.id
            ? b.orientation === 'horizontal' ? { ...x, col: alt } : { ...x, row: alt }
            : x
        )
      }
    }

    const parMoves = estimateParMoves(current, exits, obstacles, rows, cols, tier.scrambleMoves)

    return {
      id: safeId,
      rows,
      cols,
      blocks: current,
      exits,
      obstacles,
      difficulty: safeId,
      parMoves,
      timeLimit: Math.max(45, tier.timeLimitBase + pickInt(rng, -15, 20)),
      seed,
      tierLabel: tier.label,
    }
  } catch {
    return { ...FALLBACK_LEVEL }
  }
}

const SOLVER_NODE_CAP = 26000

function stateKey(blocks: Block[]): string {
  return blocks.map((b) => `${b.id}:${b.row}:${b.col}`).sort().join('|')
}

function neighbors(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): Array<{ move: Move; blocks: Block[] }> {
  const out: Array<{ move: Move; blocks: Block[] }> = []
  const exitable = getExitableBlocks(blocks, exits, obstacles, rows, cols)
  for (const id of exitable) {
    const block = blocks.find((b) => b.id === id)
    if (!block) continue
    out.push({
      move: { blockId: id, toRow: block.row, toCol: block.col, isExit: true },
      blocks: blocks.filter((b) => b.id !== id),
    })
  }
  for (const block of blocks) {
    if (exitable.includes(block.id)) continue
    const range = computeSlideRange(block, blocks, obstacles, rows, cols)
    const current = block.orientation === 'horizontal' ? block.col : block.row
    for (let v = range.min; v <= range.max; v++) {
      if (v === current) continue
      const nextBlocks = blocks.map((b) =>
        b.id === block.id
          ? block.orientation === 'horizontal' ? { ...b, col: v } : { ...b, row: v }
          : b
      )
      out.push({
        move:
          block.orientation === 'horizontal'
            ? { blockId: block.id, toRow: block.row, toCol: v }
            : { blockId: block.id, toRow: v, toCol: block.col },
        blocks: nextBlocks,
      })
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
  nodeCap: number = SOLVER_NODE_CAP
): Move[] | null {
  if (isSolved(blocks)) return []
  const visited = new Set<string>([stateKey(blocks)])
  const queue: Array<{ blocks: Block[]; path: Move[] }> = [{ blocks, path: [] }]
  let explored = 0
  while (queue.length > 0 && explored < nodeCap) {
    const current = queue.shift()
    if (!current) break
    explored++
    for (const n of neighbors(current.blocks, exits, obstacles, rows, cols)) {
      const key = stateKey(n.blocks)
      if (visited.has(key)) continue
      visited.add(key)
      const path = [...current.path, n.move]
      if (isSolved(n.blocks)) return path
      queue.push({ blocks: n.blocks, path })
    }
  }
  return null
}

function estimateParMoves(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number,
  fallback: number
): number {
  if (blocks.length <= 7) {
    const solution = solveLevel(blocks, exits, obstacles, rows, cols, 16000)
    if (solution) return Math.max(1, solution.length)
  }
  return Math.max(1, Math.round(fallback * 0.62 + blocks.length * 1.3))
}

export function getHintMove(
  blocks: Block[],
  exits: Exit[],
  obstacles: Obstacle[],
  rows: number,
  cols: number
): Move | null {
  const solution = solveLevel(blocks, exits, obstacles, rows, cols, 12000)
  if (solution && solution.length > 0) return solution[0]
  return null
}

export function starsForMoves(moves: number, parMoves: number): 1 | 2 | 3 {
  if (moves <= parMoves) return 3
  if (moves <= parMoves + Math.max(3, Math.round(parMoves * 0.4))) return 2
  return 1
}

export function starsForTime(seconds: number, timeLimit: number): 1 | 2 | 3 {
  if (seconds <= timeLimit * 0.4) return 3
  if (seconds <= timeLimit * 0.7) return 2
  return 1
}

export { isSolved as isLevelSolved }