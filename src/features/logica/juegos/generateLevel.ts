/**
 * Motor de niveles compartido — Lógica
 *
 * Sirve a:
 *   1) Colocador (Number Puzzle)  → generateNumberPuzzleLevel, shuffleBoard, …
 *   2) Rompecabezas (Jigsaw)      → generateJigsawLevel, createPieces, …
 *
 * Puedes colocarlo en:
 *   src/features/logica/juegos/generateLevel.ts
 * e importar desde ambos juegos,
 * o copiar/reexportar desde cada carpeta.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   RNG compartido
   ═══════════════════════════════════════════════════════════════════════════ */

/** PRNG determinista (mulberry32) */
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

/* ═══════════════════════════════════════════════════════════════════════════
   1) COLOCADOR — Number Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Nv 1–3   → 2×2
 * Nv 4–15  → 3×3
 * Nv 16–30 → 4×4
 * Nv 31+   → 5×5
 */

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
  if (lv <= 3) return 2
  if (lv <= 15) return 3
  if (lv <= 30) return 4
  return 5
}

/**
 * Curva de dificultad del colocador.
 */
export function getNumberPuzzleDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = sizeForLevel(lv)
  const tiles = size * size - 1

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

  const baseTime =
    size === 2 ? 25 : size === 3 ? 55 : size === 4 ? 140 : 280
  const targetSeconds = Math.max(
    size === 2 ? 8 : size === 3 ? 15 : size === 4 ? 40 : 60,
    Math.round(
      baseTime -
        local *
          (size === 2 ? 4 : size === 3 ? 2.5 : size === 4 ? 6 : 8)
    )
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
 * Genera un nivel completo del colocador (tablero incluido).
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
    moveLimit:
      soft && d.moveLimit > 0 ? Math.round(d.moveLimit * 1.25) : d.moveLimit,
    targetSeconds: soft
      ? Math.round(d.targetSeconds * 1.15)
      : d.targetSeconds,
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

/* ── UI helpers colocador ── */

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

/* ═══════════════════════════════════════════════════════════════════════════
   2) ROMPECABEZAS — Jigsaw
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Progresión de piezas (modo normal):
 *   Nv 1–4   → 4
 *   Nv 5–7   → 8
 *   Nv 8–13  → 12
 *   Nv 14–19 → 20
 *   Nv 20–28 → 30
 *   Nv 29–38 → 60
 *   Nv 39–48 → 100
 *   … hasta 2200
 *
 * Formas: classic | round | pointed
 * Imágenes: imgrom1.webp … imgrom12.webp
 */

export type PieceShape = 'classic' | 'round' | 'pointed'

export const PIECE_SHAPES: {
  id: PieceShape
  label: string
  emoji: string
  desc: string
}[] = [
  {
    id: 'classic',
    label: 'Clásica',
    emoji: '🧩',
    desc: 'Pestañas y huecos tradicionales',
  },
  {
    id: 'round',
    label: 'Redonda',
    emoji: '⭘',
    desc: 'Bordes suaves y curvas',
  },
  {
    id: 'pointed',
    label: 'Puntiaguda',
    emoji: '✦',
    desc: 'Puntas geométricas',
  },
]

export type ImageCategory =
  | 'naturaleza'
  | 'animales'
  | 'libros'
  | 'ilustraciones'
  | 'abstracto'
  | 'custom'

export interface PuzzleImage {
  id: string
  name: string
  category: ImageCategory
  /** Ruta pública o data-URL */
  src: string
  isCustom?: boolean
  fallbackHue?: number
}

/**
 * Catálogo por defecto. Coloca los archivos en:
 *   public/puzzles/imgrom1.webp … imgrom12.webp
 * Si faltan, el juego dibuja un fondo procedural.
 */
export const DEFAULT_IMAGES: PuzzleImage[] = [
  {
    id: 'imgrom1',
    name: 'Bosque en primavera',
    category: 'naturaleza',
    src: '/puzzles/imgrom1.webp',
    fallbackHue: 140,
  },
  {
    id: 'imgrom2',
    name: 'Montañas al atardecer',
    category: 'naturaleza',
    src: '/puzzles/imgrom2.webp',
    fallbackHue: 25,
  },
  {
    id: 'imgrom3',
    name: 'Lago de cristal',
    category: 'naturaleza',
    src: '/puzzles/imgrom3.webp',
    fallbackHue: 200,
  },
  {
    id: 'imgrom4',
    name: 'Zorro del bosque',
    category: 'animales',
    src: '/puzzles/imgrom4.webp',
    fallbackHue: 20,
  },
  {
    id: 'imgrom5',
    name: 'Gato curioso',
    category: 'animales',
    src: '/puzzles/imgrom5.webp',
    fallbackHue: 35,
  },
  {
    id: 'imgrom6',
    name: 'Dragón antiguo',
    category: 'ilustraciones',
    src: '/puzzles/imgrom6.webp',
    fallbackHue: 280,
  },
  {
    id: 'imgrom7',
    name: 'Barco en la niebla',
    category: 'ilustraciones',
    src: '/puzzles/imgrom7.webp',
    fallbackHue: 210,
  },
  {
    id: 'imgrom8',
    name: 'Grabado renacentista',
    category: 'libros',
    src: '/puzzles/imgrom8.webp',
    fallbackHue: 40,
  },
  {
    id: 'imgrom9',
    name: 'Mapa del tesoro',
    category: 'libros',
    src: '/puzzles/imgrom9.webp',
    fallbackHue: 50,
  },
  {
    id: 'imgrom10',
    name: 'Flor abstracta',
    category: 'abstracto',
    src: '/puzzles/imgrom10.webp',
    fallbackHue: 320,
  },
  {
    id: 'imgrom11',
    name: 'Aurora boreal',
    category: 'naturaleza',
    src: '/puzzles/imgrom11.webp',
    fallbackHue: 170,
  },
  {
    id: 'imgrom12',
    name: 'Ciudad nocturna',
    category: 'ilustraciones',
    src: '/puzzles/imgrom12.webp',
    fallbackHue: 250,
  },
]

export const CATEGORY_LABELS: Record<ImageCategory, string> = {
  naturaleza: 'Naturaleza',
  animales: 'Animales',
  libros: 'Libros antiguos',
  ilustraciones: 'Ilustraciones',
  abstracto: 'Abstracto',
  custom: 'Mis imágenes',
}

/** Chips sugeridos en modo creativo (4 → 2200) */
export const PIECE_SUGGESTIONS = [
  4, 8, 12, 20, 30, 60, 100, 120, 150, 180, 220, 300, 500, 800, 1000, 1500,
  2200,
] as const

const PIECE_TIERS: { untilLevel: number; pieces: number }[] = [
  { untilLevel: 4, pieces: 4 },
  { untilLevel: 7, pieces: 8 },
  { untilLevel: 13, pieces: 12 },
  { untilLevel: 19, pieces: 20 },
  { untilLevel: 28, pieces: 30 },
  { untilLevel: 38, pieces: 60 },
  { untilLevel: 48, pieces: 100 },
  { untilLevel: 58, pieces: 120 },
  { untilLevel: 68, pieces: 150 },
  { untilLevel: 78, pieces: 180 },
  { untilLevel: 88, pieces: 220 },
  { untilLevel: 98, pieces: 300 },
  { untilLevel: 110, pieces: 500 },
  { untilLevel: 125, pieces: 800 },
  { untilLevel: 140, pieces: 1000 },
  { untilLevel: 160, pieces: 1500 },
  { untilLevel: 9999, pieces: 2200 },
]

export function piecesForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level))
  for (const t of PIECE_TIERS) {
    if (lv <= t.untilLevel) return t.pieces
  }
  return 2200
}

/** Grid cols/rows más cercano a N piezas (casi cuadrado) */
export function gridForPieces(pieces: number): { cols: number; rows: number } {
  const n = Math.max(4, Math.min(2200, Math.floor(pieces)))
  let bestCols = 2
  let bestRows = 2
  let bestDiff = Infinity
  const max = Math.ceil(Math.sqrt(n)) + 8
  for (let cols = 2; cols <= max; cols++) {
    const rows = Math.ceil(n / cols)
    const total = cols * rows
    if (total < n) continue
    const aspect = Math.abs(cols / rows - 1)
    const waste = total - n
    const score = waste * 10 + aspect * 5
    if (score < bestDiff) {
      bestDiff = score
      bestCols = cols
      bestRows = rows
    }
  }
  while (bestCols * bestRows - n >= bestCols && bestRows > 2) {
    bestRows--
  }
  while (bestCols * bestRows < n) bestRows++
  return { cols: bestCols, rows: bestRows }
}

export function shapeForLevel(level: number): PieceShape {
  const lv = Math.max(1, Math.floor(level))
  if (lv <= 10) return 'classic'
  if (lv <= 25) return lv % 3 === 0 ? 'round' : 'classic'
  if (lv <= 50) {
    const r = lv % 5
    if (r === 0) return 'pointed'
    if (r === 2) return 'round'
    return 'classic'
  }
  const pool: PieceShape[] = ['classic', 'round', 'pointed']
  return pool[lv % 3]
}

export function imageForLevel(level: number): PuzzleImage {
  const idx = (Math.max(1, level) - 1) % DEFAULT_IMAGES.length
  return DEFAULT_IMAGES[idx]
}

export interface JigsawLevel {
  level: number
  pieces: number
  cols: number
  rows: number
  shape: PieceShape
  image: PuzzleImage
  targetSeconds: number
  seed: number
  goal: string
}

export function getJigsawDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const pieces = piecesForLevel(lv)
  const { cols, rows } = gridForPieces(pieces)
  const shape = shapeForLevel(lv)
  const targetSeconds = Math.max(20, Math.round(pieces * 1.15 + lv * 0.5))
  return { pieces, cols, rows, shape, targetSeconds }
}

export function generateJigsawLevel(
  level: number,
  opts?: {
    image?: PuzzleImage
    pieces?: number
    shape?: PieceShape
    seedSalt?: number
  }
): JigsawLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 6200 + (opts?.seedSalt ?? 0))
  const d = getJigsawDifficulty(lv)

  const pieces = opts?.pieces ?? d.pieces
  const shape = opts?.shape ?? d.shape
  const image = opts?.image ?? imageForLevel(lv)
  const { cols, rows } = gridForPieces(pieces)

  const targetSeconds = Math.max(
    15,
    Math.round(pieces * 1.1 + (shape === 'pointed' ? pieces * 0.15 : 0))
  )

  return {
    level: lv,
    pieces: cols * rows,
    cols,
    rows,
    shape,
    image,
    targetSeconds,
    seed,
    goal: `Arma el rompecabezas de ${cols * rows} piezas (${cols}×${rows}).`,
  }
}

/* ── Geometría de pestañas ── */

/** -1 = hueco, 0 = plano, 1 = pestaña */
export type EdgeTab = -1 | 0 | 1

export interface PieceEdges {
  top: EdgeTab
  right: EdgeTab
  bottom: EdgeTab
  left: EdgeTab
}

export function buildEdgeMap(
  cols: number,
  rows: number,
  seed: number
): PieceEdges[][] {
  const rng = mulberry32(seed)
  const map: PieceEdges[][] = []
  for (let r = 0; r < rows; r++) {
    map[r] = []
    for (let c = 0; c < cols; c++) {
      const top: EdgeTab = r === 0 ? 0 : ((-map[r - 1][c].bottom) as EdgeTab)
      const left: EdgeTab = c === 0 ? 0 : ((-map[r][c - 1].right) as EdgeTab)
      const right: EdgeTab = c === cols - 1 ? 0 : rng() > 0.5 ? 1 : -1
      const bottom: EdgeTab = r === rows - 1 ? 0 : rng() > 0.5 ? 1 : -1
      map[r][c] = { top, right, bottom, left }
    }
  }
  return map
}

export interface JigsawPiece {
  id: string
  row: number
  col: number
  x: number
  y: number
  correctX: number
  correctY: number
  edges: PieceEdges
  locked: boolean
  z: number
}

export function createPieces(
  level: JigsawLevel,
  boardW: number,
  boardH: number,
  traySpread = 1
): JigsawPiece[] {
  const { cols, rows, seed } = level
  const edgeMap = buildEdgeMap(cols, rows, seed)
  const pw = boardW / cols
  const ph = boardH / rows
  const rng = mulberry32(seed + 99)

  const pieces: JigsawPiece[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        id: `p-${r}-${c}`,
        row: r,
        col: c,
        x: 0,
        y: 0,
        correctX: c * pw,
        correctY: r * ph,
        edges: edgeMap[r][c],
        locked: false,
        z: 1,
      })
    }
  }

  const shuffled = pieces.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const margin = Math.max(8, pw * 0.15)
  const side = Math.max(3, Math.ceil(Math.sqrt(shuffled.length)))
  shuffled.forEach((p, i) => {
    const col = i % side
    const row = Math.floor(i / side)
    p.x = margin + col * (pw * 0.55 * traySpread) + (rng() - 0.5) * 12
    p.y =
      boardH + margin + row * (ph * 0.55 * traySpread) + (rng() - 0.5) * 12
    p.z = i + 1
  })

  return shuffled
}

export function snapThreshold(pieceW: number, pieceH: number) {
  return Math.min(pieceW, pieceH) * 0.28
}

export function trySnap(piece: JigsawPiece, pieceW: number, pieceH: number) {
  const th = snapThreshold(pieceW, pieceH)
  const dx = piece.x - piece.correctX
  const dy = piece.y - piece.correctY
  if (Math.hypot(dx, dy) <= th) {
    return {
      ...piece,
      x: piece.correctX,
      y: piece.correctY,
      locked: true,
      z: 0,
    }
  }
  return piece
}

export function countLocked(pieces: JigsawPiece[]) {
  return pieces.filter((p) => p.locked).length
}

export function isPuzzleComplete(pieces: JigsawPiece[]) {
  return pieces.length > 0 && pieces.every((p) => p.locked)
}

/* ── Tiempo / estrellas (compartido + jigsaw) ── */

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Estrellas — sobrecarga para ambos juegos:
 *   Rompecabezas: calcStars(timeMs, targetSeconds, pieces)
 *   Colocador:    calcStars(moves, timeMs, targetSeconds, moveLimit, size)
 */
export function calcStars(
  timeMs: number,
  targetSeconds: number,
  pieces: number
): 0 | 1 | 2 | 3
export function calcStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  moveLimit: number,
  size: number
): 0 | 1 | 2 | 3
export function calcStars(
  a: number,
  b: number,
  c: number,
  d?: number,
  e?: number
): 0 | 1 | 2 | 3 {
  // Colocador: 5 argumentos
  if (d !== undefined && e !== undefined) {
    const moves = a
    const timeMs = b
    const targetSeconds = c
    const moveLimit = d
    const size = e
    if (moves <= 0) return 0
    let stars: 0 | 1 | 2 | 3 = 1
    if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
    const soft = moveLimit > 0 ? moveLimit : size * size * 8
    if (moves <= soft * 0.55 && stars >= 2) stars = 3
    else if (moveLimit > 0 && moves <= moveLimit && stars === 1) stars = 2
    return stars
  }
  // Rompecabezas: 3 argumentos (timeMs, targetSeconds, pieces)
  const timeMs = a
  const targetSeconds = b
  const pieces = c
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000 * 0.65) stars = 3
  const ideal = pieces * 800
  if (timeMs <= ideal) stars = 3
  return stars
}

/** Alias explícito del colocador (misma implementación) */
export function calcNumberPuzzleStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  moveLimit: number,
  size: number
): 0 | 1 | 2 | 3 {
  return calcStars(moves, timeMs, targetSeconds, moveLimit, size)
}

/* ── Imágenes custom (localStorage) ── */

const CUSTOM_KEY = 'gco:puzzle-custom-images'

export function loadCustomImages(): PuzzleImage[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as PuzzleImage[]
    return Array.isArray(list) ? list.filter((x) => x?.id && x?.src) : []
  } catch {
    return []
  }
}

export function saveCustomImages(list: PuzzleImage[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
}

export function addCustomImage(img: PuzzleImage) {
  const list = loadCustomImages().filter((x) => x.id !== img.id)
  list.unshift(img)
  saveCustomImages(list.slice(0, 40))
  return list
}

export function removeCustomImage(id: string) {
  const list = loadCustomImages().filter((x) => x.id !== id)
  saveCustomImages(list)
  return list
}

export function compressImageFile(
  file: File,
  maxSide = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

export function drawFallbackCover(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hue = 180,
  label = ''
) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, `hsl(${hue} 55% 28%)`)
  g.addColorStop(0.5, `hsl(${(hue + 40) % 360} 50% 22%)`)
  g.addColorStop(1, `hsl(${(hue + 80) % 360} 45% 18%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 0.25
  ctx.fillStyle = `hsl(${hue} 80% 60%)`
  ctx.beginPath()
  ctx.arc(w * 0.3, h * 0.35, w * 0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `hsl(${(hue + 60) % 360} 70% 55%)`
  ctx.beginPath()
  ctx.arc(w * 0.75, h * 0.7, w * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `600 ${Math.max(12, Math.floor(w / 18))}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText(label, w / 2, h / 2)
  }
}
