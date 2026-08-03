/**
 * Motor de niveles — Colocador (Puzzle de Números)
 * features/logica/juegos/numberpuzzle/generateLevel.ts
 *
 * Niveles infinitos y progresivos:
 *   Nv 1–3   → 2×2 (3 fichas / 4 casillas)
 *   Nv 4–15  → 3×3 (8 fichas / 9 casillas)
 *   Nv 16–30 → 4×4 (15 fichas / 16 casillas)
 *   Nv 31+   → 5×5 (24 fichas / 25 casillas), cada vez más mezclado
 *
 * La dificultad escala con shuffleMoves, moveLimit y targetSeconds.
 */

/** PRNG determinista (misma familia que el resto del proyecto) */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function levelSeed(level: number, salt = 0) {
  return ((level * 7919 + salt * 104729) >>> 0) || 1
}

export type GridSize = 2 | 3 | 4 | 5

/** 0 = espacio vacío */
export type Cell = number
export type Board = Cell[]

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface NumberPuzzleLevel {
  level: number
  size: GridSize
  /** Fichas numeradas (size² − 1) */
  tiles: number
  /** Movimientos de mezcla desde el estado resuelto */
  shuffleMoves: number
  /** 0 = sin límite */
  moveLimit: number
  /** Objetivo de tiempo en segundos (0 = sin objetivo de estrella) */
  targetSeconds: number
  goal: string
  /** Tablero ya mezclado y resoluble */
  board: Board
  seed: number
}

export function solvedBoard(size: GridSize): Board {
  const n = size * size
  const b: Board = []
  for (let i = 1; i < n; i++) b.push(i)
  b.push(0)
  return b
}

function indexToCoord(index: number, size: number) {
  return { row: Math.floor(index / size), col: index % size }
}

function coordToIndex(row: number, col: number, size: number) {
  return row * size + col
}

export function findEmpty(board: Board): number {
  return board.indexOf(0)
}

export function canMove(board: Board, size: number, from: number): boolean {
  const empty = findEmpty(board)
  if (from < 0 || from >= board.length || from === empty) return false
  const a = indexToCoord(from, size)
  const b = indexToCoord(empty, size)
  const dr = Math.abs(a.row - b.row)
  const dc = Math.abs(a.col - b.col)
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

export function moveTile(board: Board, size: number, from: number): Board {
  if (!canMove(board, size, from)) return board
  const empty = findEmpty(board)
  const next = board.slice()
  next[empty] = next[from]
  next[from] = 0
  return next
}

export function moveEmpty(board: Board, size: number, dir: Direction): Board {
  const empty = findEmpty(board)
  const { row, col } = indexToCoord(empty, size)
  let tr = row
  let tc = col
  if (dir === 'up') tr += 1
  else if (dir === 'down') tr -= 1
  else if (dir === 'left') tc += 1
  else if (dir === 'right') tc -= 1
  if (tr < 0 || tr >= size || tc < 0 || tc >= size) return board
  return moveTile(board, size, coordToIndex(tr, tc, size))
}

export function isSolved(board: Board): boolean {
  for (let i = 0; i < board.length - 1; i++) {
    if (board[i] !== i + 1) return false
  }
  return board[board.length - 1] === 0
}

/**
 * Mezcla siempre resoluble: N movimientos legales desde el resuelto.
 */
export function shuffleBoard(
  size: GridSize,
  shuffleMoves: number,
  seed: number
): Board {
  let board = solvedBoard(size)
  const rng = mulberry32(seed)
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  const opposite: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  }
  let last: Direction | null = null
  let applied = 0
  let guard = 0

  while (applied < shuffleMoves && guard < shuffleMoves * 10) {
    guard++
    const dir = dirs[Math.floor(rng() * 4)]
    if (last && dir === opposite[last]) continue
    const next = moveEmpty(board, size, dir)
    if (next !== board) {
      board = next
      last = dir
      applied++
    }
  }

  if (isSolved(board)) {
    board = moveEmpty(board, size, 'left')
    board = moveEmpty(board, size, 'up')
  }
  return board
}

/** Tamaño del tablero según nivel (progresión automática) */
export function sizeForLevel(level: number): GridSize {
  const lv = Math.max(1, Math.floor(level))
  if (lv <= 3) return 2 // 3 fichas / 4 casillas
  if (lv <= 15) return 3 // 8 / 9
  if (lv <= 30) return 4 // 15 / 16
  return 5 // 24 / 25 · retos altos
}

/**
 * Curva de dificultad dentro del tamaño actual.
 * - shuffleMoves crece con el nivel
 * - moveLimit aparece en niveles altos del mismo tamaño
 * - targetSeconds baja conforme avanza
 */
export function getNumberPuzzleDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = sizeForLevel(lv)
  const tiles = size * size - 1

  // Índice relativo dentro del bloque de tamaño
  let local = lv
  if (size === 2) local = lv
  else if (size === 3) local = lv - 3
  else if (size === 4) local = lv - 15
  else local = lv - 30

  const baseShuffle = size * size * 2
  const shuffleMoves = Math.min(
    baseShuffle + local * Math.max(4, size * 3),
    size * size * 40
  )

  // Límite de movimientos: solo a partir de cierto local index
  let moveLimit = 0
  if (size >= 3 && local >= 6) {
    moveLimit = Math.round(tiles * 12 + local * 8)
  }
  if (size >= 4 && local >= 4) {
    moveLimit = Math.round(tiles * 10 + local * 10)
  }
  if (size >= 5) {
    moveLimit = Math.round(tiles * 14 + local * 12)
  }

  // Tiempo objetivo (segundos) para estrella
  const baseTime =
    size === 2 ? 25 : size === 3 ? 55 : size === 4 ? 140 : 280
  const targetSeconds = Math.max(
    size === 2 ? 8 : size === 3 ? 15 : size === 4 ? 40 : 60,
    Math.round(baseTime - local * (size === 2 ? 4 : size === 3 ? 2.5 : size === 4 ? 6 : 8))
  )

  return {
    size,
    tiles,
    shuffleMoves,
    moveLimit,
    targetSeconds,
    goal: `Ordena los números del 1 al ${tiles} usando el espacio vacío.`,
  }
}

/**
 * Genera un nivel completo (tablero incluido) a partir del número de nivel.
 * Semilla determinista → mismo nivel = mismo tablero.
 */
export function generateNumberPuzzleLevel(
  level: number,
  opts?: { softProgression?: boolean; seedSalt?: number }
): NumberPuzzleLevel {
  const lv = Math.max(1, Math.floor(level))
  const soft = opts?.softProgression ?? false
  const seed = levelSeed(lv, 5100 + (opts?.seedSalt ?? 0))
  const d = getNumberPuzzleDifficulty(lv)

  const shuffleMoves = soft
    ? Math.max(d.size * 2, Math.round(d.shuffleMoves * 0.75))
    : d.shuffleMoves

  const board = shuffleBoard(d.size, shuffleMoves, seed)

  return {
    level: lv,
    size: d.size,
    tiles: d.tiles,
    shuffleMoves,
    moveLimit: soft && d.moveLimit > 0 ? Math.round(d.moveLimit * 1.25) : d.moveLimit,
    targetSeconds: soft ? Math.round(d.targetSeconds * 1.15) : d.targetSeconds,
    goal: d.goal,
    board,
    seed,
  }
}

/** Regenera solo el tablero (mismo nivel, nueva mezcla) */
export function reshuffleLevel(level: NumberPuzzleLevel): NumberPuzzleLevel {
  const seed = levelSeed(level.level, (Date.now() % 99991) + 17)
  return {
    ...level,
    seed,
    board: shuffleBoard(level.size, level.shuffleMoves, seed),
  }
}

/* ── UI helpers ── */

export const TILE_HUES = [
  180, 15, 280, 40, 220, 320, 90, 200, 0, 160, 300, 55, 250, 120, 330,
] as const

export function tileColor(
  n: Cell,
  theme: 'dark' | 'light' | 'rainbow' = 'dark'
): string {
  if (n === 0) return 'transparent'
  const hue = TILE_HUES[(n - 1) % TILE_HUES.length]
  if (theme === 'light') return `hsl(${hue} 70% 42%)`
  if (theme === 'rainbow') return `hsl(${hue} 90% 65%)`
  return `hsl(${hue} 85% 58%)`
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function calcStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  moveLimit: number,
  size: number
): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : size * size * 8
  if (moves <= soft * 0.55 && stars >= 2) stars = 3
  else if (moveLimit > 0 && moves <= moveLimit && stars === 1) stars = 2
  return stars
}

export function tileSizePx(size: GridSize, isMobile: boolean): number {
  if (isMobile) {
    if (size <= 2) return 72
    if (size === 3) return 64
    if (size === 4) return 52
    return 42
  }
  if (size <= 2) return 92
  if (size === 3) return 80
  if (size === 4) return 68
  return 54
}