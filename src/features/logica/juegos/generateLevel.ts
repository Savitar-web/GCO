/**
 * Motor de niveles compartido — Lógica
 *
 * Sirve a:
 *   1) Colocador (Number Puzzle)  → generateNumberPuzzleLevel, shuffleBoard, …
 *   2) Rompecabezas (Jigsaw)      → generateJigsawLevel, createPieces, …
 *   3) Despejes (Puzzle)      → generatepuzzleLevel, …
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 3) DESPEJES — Path clearing / sliding / maze puzzles
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modos:
 *   - hielo   → deslizamiento tipo hielo Pokémon (slide hasta chocar)
 *   - empuje  → Sokoban-lite (empujar cajas a metas)
 *   - trafico → Rush Hour-lite (deslizar bloques H/V para liberar salida)
 *   - laberinto → laberinto clásico con salida
 *
 * Progresión lenta (sensación de racha):
 *   Nv 1–5   → grids pequeños, pocos obstáculos
 *   Nv 6–15  → más paredes / 1–2 cajas
 *   Nv 16–30 → grids medianos, más piezas
 *   Nv 31+   → densidad y tamaño crecientes
 *
 * Pegar esta sección al final de:
 *   src/features/logica/juegos/generateLevel.ts
 */

export type DespejeMode = 'hielo' | 'empuje' | 'trafico' | 'laberinto'

export const DESPEJE_MODES: {
  id: DespejeMode
  title: string
  emoji: string
  desc: string
}[] = [
  {
    id: 'hielo',
    title: 'Hielo',
    emoji: '🧊',
    desc: 'Deslízate hasta chocar. Llega a la meta planificando rebotes.',
  },
  {
    id: 'empuje',
    title: 'Empuje',
    emoji: '📦',
    desc: 'Empuja las cajas a las marcas. No puedes tirar hacia atrás.',
  },
  {
    id: 'trafico',
    title: 'Salida',
    emoji: '🚗',
    desc: 'Despeja el camino hasta la salida.',
  },
  {
    id: 'laberinto',
    title: 'Laberinto',
    emoji: '🌀',
    desc: 'Encuentra la salida. Cada nivel es un laberinto distinto.',
  },
]

/** Celda del tablero Despejes */
export type DespejeCell =
  | 0 // vacío / suelo
  | 1 // pared
  | 2 // jugador
  | 3 // meta / salida
  | 4 // caja
  | 5 // caja sobre meta
  | 6 // meta vacía (solo empuje)
  | number // >= 10 → id de vehículo tráfico

export type DespejeGrid = DespejeCell[][]

export type DespejeDir = 'up' | 'down' | 'left' | 'right'

export interface TrafficPiece {
  id: number
  /** true = solo horizontal */
  horizontal: boolean
  length: 2 | 3
  /** es el vehículo objetivo (rojo) */
  isHero: boolean
  row: number
  col: number
}

export interface DespejeLevel {
  mode: DespejeMode
  level: number
  rows: number
  cols: number
  grid: DespejeGrid
  /** posición inicial del jugador (hielo / empuje / laberinto) */
  start: { r: number; c: number }
  goal: { r: number; c: number }
  /** piezas de tráfico (solo modo trafico) */
  traffic?: TrafficPiece[]
  /** número de cajas a colocar (empuje) */
  crateCount: number
  moveHint: number
  targetSeconds: number
  seed: number
  goalText: string
}

/* ── tamaño y curva ── */

export function despejeSizeForLevel(level: number, mode: DespejeMode): {
  rows: number
  cols: number
} {
  const lv = Math.max(1, Math.floor(level))
  if (mode === 'trafico') {
    // Rush Hour clásico 6×6, sube despacio
    if (lv <= 8) return { rows: 5, cols: 5 }
    if (lv <= 20) return { rows: 6, cols: 6 }
    if (lv <= 40) return { rows: 7, cols: 7 }
    return { rows: 8, cols: 8 }
  }
  if (mode === 'laberinto') {
    if (lv <= 4) return { rows: 5, cols: 5 }
    if (lv <= 10) return { rows: 7, cols: 7 }
    if (lv <= 20) return { rows: 9, cols: 9 }
    if (lv <= 35) return { rows: 11, cols: 11 }
    if (lv <= 55) return { rows: 13, cols: 13 }
    return { rows: Math.min(21, 13 + Math.floor((lv - 55) / 8) * 2), cols: Math.min(21, 13 + Math.floor((lv - 55) / 8) * 2) }
  }
  // hielo / empuje
  if (lv <= 3) return { rows: 4, cols: 4 }
  if (lv <= 8) return { rows: 5, cols: 5 }
  if (lv <= 15) return { rows: 6, cols: 6 }
  if (lv <= 25) return { rows: 7, cols: 7 }
  if (lv <= 40) return { rows: 8, cols: 8 }
  return {
    rows: Math.min(12, 8 + Math.floor((lv - 40) / 10)),
    cols: Math.min(12, 8 + Math.floor((lv - 40) / 10)),
  }
}

export function getDespejeDifficulty(level: number, mode: DespejeMode) {
  const lv = Math.max(1, Math.floor(level))
  const { rows, cols } = despejeSizeForLevel(lv, mode)
  const area = rows * cols

  let wallDensity = 0.12 + Math.min(0.28, lv * 0.008)
  let crateCount = 0
  let trafficCars = 2
  let moveHint = 8
  let targetSeconds = 40

  if (mode === 'hielo') {
    wallDensity = 0.14 + Math.min(0.32, lv * 0.009)
    moveHint = Math.max(4, Math.round(6 + lv * 0.55))
    targetSeconds = Math.max(12, Math.round(18 + lv * 2.2))
  } else if (mode === 'empuje') {
    crateCount = Math.min(8, 1 + Math.floor(lv / 4))
    wallDensity = 0.1 + Math.min(0.22, lv * 0.006)
    moveHint = Math.max(6, crateCount * 6 + lv)
    targetSeconds = Math.max(20, Math.round(25 + crateCount * 18 + lv * 2))
  } else if (mode === 'trafico') {
    trafficCars = Math.min(12, 2 + Math.floor(lv / 3))
    moveHint = Math.max(5, 4 + trafficCars * 2 + Math.floor(lv / 2))
    targetSeconds = Math.max(20, Math.round(22 + trafficCars * 8 + lv * 1.5))
  } else {
    // laberinto
    wallDensity = 0.45
    moveHint = Math.max(8, Math.round(area * 0.35))
    targetSeconds = Math.max(15, Math.round(12 + area * 0.45 + lv * 0.8))
  }

  return {
    rows,
    cols,
    wallDensity,
    crateCount,
    trafficCars,
    moveHint,
    targetSeconds,
  }
}

/* ── util grid ── */

function emptyGrid(rows: number, cols: number, fill: DespejeCell = 0): DespejeGrid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => fill)
  )
}

function cloneGrid(g: DespejeGrid): DespejeGrid {
  return g.map((row) => row.slice())
}

function inBounds(r: number, c: number, rows: number, cols: number) {
  return r >= 0 && c >= 0 && r < rows && c < cols
}

const DIR_DELTA: Record<DespejeDir, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}

export const DESPEJE_DIRS: DespejeDir[] = ['up', 'down', 'left', 'right']

/* ── HIELO: slide hasta obstáculo ── */

export function slideUntilStop(
  grid: DespejeGrid,
  r: number,
  c: number,
  dir: DespejeDir
): { r: number; c: number } {
  const rows = grid.length
  const cols = grid[0].length
  const { dr, dc } = DIR_DELTA[dir]
  let nr = r
  let nc = c
  while (true) {
    const tr = nr + dr
    const tc = nc + dc
    if (!inBounds(tr, tc, rows, cols)) break
    const cell = grid[tr][tc]
    if (cell === 1 || cell === 4 || cell === 5) break // pared o caja
    if (cell >= 10) break // vehículo
    nr = tr
    nc = tc
  }
  return { r: nr, c: nc }
}

function bfsSlideReachable(
  grid: DespejeGrid,
  startR: number,
  startC: number
): Set<string> {
  const seen = new Set<string>()
  const q: { r: number; c: number }[] = [{ r: startR, c: startC }]
  seen.add(`${startR},${startC}`)
  while (q.length) {
    const cur = q.shift()!
    for (const dir of DESPEJE_DIRS) {
      const next = slideUntilStop(grid, cur.r, cur.c, dir)
      const key = `${next.r},${next.c}`
      if (!seen.has(key)) {
        seen.add(key)
        q.push(next)
      }
    }
  }
  return seen
}

/**
 * Genera nivel de hielo garantizando que la meta sea alcanzable
 * con deslizamientos.
 */
export function generateHieloLevel(
  level: number,
  opts?: { seedSalt?: number }
): DespejeLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 7100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getDespejeDifficulty(lv, 'hielo')
  const { rows, cols } = d

  let best: DespejeLevel | null = null

  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = emptyGrid(rows, cols, 0)
    // borde de paredes suave
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) {
          if (rng() < 0.55) grid[r][c] = 1
        } else if (rng() < d.wallDensity) {
          grid[r][c] = 1
        }
      }
    }

    // candidatos libres
    const free: { r: number; c: number }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 0) free.push({ r, c })
      }
    }
    if (free.length < 4) continue

    // start y goal lejanos
    const start = free[Math.floor(rng() * free.length)]
    let goal = free[Math.floor(rng() * free.length)]
    let distBest = -1
    for (let i = 0; i < Math.min(30, free.length); i++) {
      const cand = free[Math.floor(rng() * free.length)]
      const dist = Math.abs(cand.r - start.r) + Math.abs(cand.c - start.c)
      if (dist > distBest) {
        distBest = dist
        goal = cand
      }
    }
    if (start.r === goal.r && start.c === goal.c) continue

    grid[start.r][start.c] = 2
    grid[goal.r][goal.c] = 3

    const reach = bfsSlideReachable(grid, start.r, start.c)
    if (!reach.has(`${goal.r},${goal.c}`)) continue

    // preferir caminos que requieran varios deslizamientos
    const pathLen = reach.size
    const score = pathLen + distBest
    const levelObj: DespejeLevel = {
      mode: 'hielo',
      level: lv,
      rows,
      cols,
      grid,
      start,
      goal,
      crateCount: 0,
      moveHint: d.moveHint,
      targetSeconds: d.targetSeconds,
      seed: seed + attempt,
      goalText: 'Deslízate hasta la meta. Cada movimiento sigue hasta chocar.',
    }
    if (!best || score > (best.rows * best.cols) / 4) {
      best = levelObj
      if (pathLen >= Math.max(4, Math.floor(rows * 0.8))) break
    }
  }

  if (best) return best

  // fallback mínimo resoluble
  const grid = emptyGrid(rows, cols, 0)
  for (let c = 0; c < cols; c++) {
    grid[0][c] = 1
    grid[rows - 1][c] = 1
  }
  for (let r = 0; r < rows; r++) {
    grid[r][0] = 1
    grid[r][cols - 1] = 1
  }
  grid[1][1] = 2
  grid[rows - 2][cols - 2] = 3
  return {
    mode: 'hielo',
    level: lv,
    rows,
    cols,
    grid,
    start: { r: 1, c: 1 },
    goal: { r: rows - 2, c: cols - 2 },
    crateCount: 0,
    moveHint: d.moveHint,
    targetSeconds: d.targetSeconds,
    seed,
    goalText: 'Deslízate hasta la meta. Cada movimiento sigue hasta chocar.',
  }
}

/* ── EMPUJE: Sokoban-lite ── */

export function canPushStep(
  grid: DespejeGrid,
  pr: number,
  pc: number,
  dir: DespejeDir
): { ok: boolean; grid?: DespejeGrid; pr?: number; pc?: number } {
  const rows = grid.length
  const cols = grid[0].length
  const { dr, dc } = DIR_DELTA[dir]
  const nr = pr + dr
  const nc = pc + dc
  if (!inBounds(nr, nc, rows, cols)) return { ok: false }
  const front = grid[nr][nc]
  if (front === 1) return { ok: false }
  if (front === 0 || front === 3 || front === 6) {
    const next = cloneGrid(grid)
    next[pr][pc] = next[pr][pc] === 2 ? 0 : 0
    // restaurar meta bajo el jugador si había
    next[nr][nc] = 2
    return { ok: true, grid: next, pr: nr, pc: nc }
  }
  if (front === 4 || front === 5) {
    const br = nr + dr
    const bc = nc + dc
    if (!inBounds(br, bc, rows, cols)) return { ok: false }
    const beyond = grid[br][bc]
    if (beyond !== 0 && beyond !== 3 && beyond !== 6) return { ok: false }
    const next = cloneGrid(grid)
    // quitar jugador
    next[pr][pc] = 0
    // mover caja
    const boxWasOnGoal = front === 5
    next[nr][nc] = 2
    next[br][bc] = beyond === 3 || beyond === 6 ? 5 : 4
    // si la caja salió de una meta, dejar meta
    if (boxWasOnGoal) {
      // la celda nr,nc ahora tiene jugador; la meta queda “debajo” conceptualmente
      // representamos meta vacía solo si no hay jugador — simplificado: al irse el jugador restauramos
    }
    return { ok: true, grid: next, pr: nr, pc: nc }
  }
  return { ok: false }
}

/** Movimiento de 1 paso (empuje / laberinto / hielo paso a paso no-slide) */
export function stepPlayer(
  grid: DespejeGrid,
  pr: number,
  pc: number,
  dir: DespejeDir,
  mode: DespejeMode
): { grid: DespejeGrid; pr: number; pc: number; moved: boolean } {
  if (mode === 'hielo') {
    const stop = slideUntilStop(grid, pr, pc, dir)
    if (stop.r === pr && stop.c === pc) {
      return { grid, pr, pc, moved: false }
    }
    const next = cloneGrid(grid)
    next[pr][pc] = next[pr][pc] === 2 ? 0 : 0
    // restaurar meta si el start era goal visual
    if (grid[pr][pc] === 2 && /* was on goal marker stored separately */ false) {
      /* handled in UI */
    }
    next[stop.r][stop.c] = 2
    return { grid: next, pr: stop.r, pc: stop.c, moved: true }
  }

  const rows = grid.length
  const cols = grid[0].length
  const { dr, dc } = DIR_DELTA[dir]
  const nr = pr + dr
  const nc = pc + dc
  if (!inBounds(nr, nc, rows, cols)) return { grid, pr, pc, moved: false }
  const front = grid[nr][nc]

  if (mode === 'laberinto') {
    if (front === 1) return { grid, pr, pc, moved: false }
    const next = cloneGrid(grid)
    next[pr][pc] = 0
    next[nr][nc] = front === 3 ? 2 : 2
    return { grid: next, pr: nr, pc: nc, moved: true }
  }

  // empuje
  if (front === 1) return { grid, pr, pc, moved: false }
  if (front === 0 || front === 3 || front === 6) {
    const next = cloneGrid(grid)
    // restaurar meta si salimos de una
    const leftCell = 0
    next[pr][pc] = leftCell
    next[nr][nc] = 2
    return { grid: next, pr: nr, pc: nc, moved: true }
  }
  if (front === 4 || front === 5) {
    const br = nr + dr
    const bc = nc + dc
    if (!inBounds(br, bc, rows, cols)) return { grid, pr, pc, moved: false }
    const beyond = grid[br][bc]
    if (beyond !== 0 && beyond !== 3 && beyond !== 6) {
      return { grid, pr, pc, moved: false }
    }
    const next = cloneGrid(grid)
    next[pr][pc] = 0
    next[nr][nc] = 2
    next[br][bc] = beyond === 3 || beyond === 6 ? 5 : 4
    return { grid: next, pr: nr, pc: nc, moved: true }
  }
  return { grid, pr, pc, moved: false }
}

export function isEmpujeSolved(grid: DespejeGrid): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 4) return false // caja sin meta
    }
  }
  // al menos una caja en meta
  let onGoal = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 5) onGoal++
    }
  }
  return onGoal > 0
}

export function generateEmpujeLevel(
  level: number,
  opts?: { seedSalt?: number }
): DespejeLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 7200 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getDespejeDifficulty(lv, 'empuje')
  const { rows, cols, crateCount } = d

  for (let attempt = 0; attempt < 50; attempt++) {
    const grid = emptyGrid(rows, cols, 0)
    // paredes perimetrales
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) {
          grid[r][c] = 1
        } else if (rng() < d.wallDensity * 0.7) {
          grid[r][c] = 1
        }
      }
    }

    const free: { r: number; c: number }[] = []
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (grid[r][c] === 0) free.push({ r, c })
      }
    }
    if (free.length < crateCount * 2 + 3) continue

    // metas
    const goals: { r: number; c: number }[] = []
    for (let i = 0; i < crateCount; i++) {
      if (!free.length) break
      const idx = Math.floor(rng() * free.length)
      const g = free.splice(idx, 1)[0]
      goals.push(g)
      grid[g.r][g.c] = 6
    }

    // cajas cerca del centro
    const crates: { r: number; c: number }[] = []
    for (let i = 0; i < crateCount; i++) {
      if (!free.length) break
      const idx = Math.floor(rng() * free.length)
      const b = free.splice(idx, 1)[0]
      crates.push(b)
      grid[b.r][b.c] = 4
    }

    // jugador
    if (!free.length) continue
    const start = free[Math.floor(rng() * free.length)]
    grid[start.r][start.c] = 2

    // meta de referencia (primera)
    const goal = goals[0] ?? { r: rows - 2, c: cols - 2 }

    return {
      mode: 'empuje',
      level: lv,
      rows,
      cols,
      grid,
      start,
      goal,
      crateCount,
      moveHint: d.moveHint,
      targetSeconds: d.targetSeconds,
      seed: seed + attempt,
      goalText: `Empuja ${crateCount} caja${crateCount > 1 ? 's' : ''} a las marcas.`,
    }
  }

  // fallback 1 caja
  const grid = emptyGrid(rows, cols, 0)
  for (let r = 0; r < rows; r++) {
    grid[r][0] = 1
    grid[r][cols - 1] = 1
  }
  for (let c = 0; c < cols; c++) {
    grid[0][c] = 1
    grid[rows - 1][c] = 1
  }
  grid[1][1] = 2
  grid[2][2] = 4
  grid[rows - 2][cols - 2] = 6
  return {
    mode: 'empuje',
    level: lv,
    rows,
    cols,
    grid,
    start: { r: 1, c: 1 },
    goal: { r: rows - 2, c: cols - 2 },
    crateCount: 1,
    moveHint: d.moveHint,
    targetSeconds: d.targetSeconds,
    seed,
    goalText: 'Empuja la caja a la marca.',
  }
}

/* ── TRÁFICO: Rush Hour-lite ── */

export function generateTraficoLevel(
  level: number,
  opts?: { seedSalt?: number }
): DespejeLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 7300 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getDespejeDifficulty(lv, 'trafico')
  const { rows, cols, trafficCars } = d

  const grid = emptyGrid(rows, cols, 0)
  // bordes
  for (let r = 0; r < rows; r++) {
    grid[r][0] = 1
    grid[r][cols - 1] = 1
  }
  for (let c = 0; c < cols; c++) {
    grid[0][c] = 1
    grid[rows - 1][c] = 1
  }

  const exitRow = Math.floor(rows / 2)
  // salida a la derecha
  grid[exitRow][cols - 1] = 0

  const pieces: TrafficPiece[] = []
  let nextId = 10

  // héroe horizontal en la fila de salida
  const heroLen: 2 | 3 = 2
  const heroCol = Math.max(1, Math.min(cols - 3, 1 + Math.floor(rng() * (cols - 4))))
  const hero: TrafficPiece = {
    id: nextId++,
    horizontal: true,
    length: heroLen,
    isHero: true,
    row: exitRow,
    col: heroCol,
  }
  pieces.push(hero)
  for (let i = 0; i < hero.length; i++) {
    grid[hero.row][hero.col + i] = hero.id
  }

  let placed = 0
  let guard = 0
  while (placed < trafficCars - 1 && guard < 200) {
    guard++
    const horizontal = rng() < 0.55
    const len: 2 | 3 = rng() < 0.65 ? 2 : 3
    const r = 1 + Math.floor(rng() * (rows - 2))
    const c = 1 + Math.floor(rng() * (cols - 2))
    let fits = true
    if (horizontal) {
      if (c + len > cols - 1) fits = false
      else {
        for (let i = 0; i < len; i++) {
          if (grid[r][c + i] !== 0) fits = false
        }
      }
    } else {
      if (r + len > rows - 1) fits = false
      else {
        for (let i = 0; i < len; i++) {
          if (grid[r + i][c] !== 0) fits = false
        }
      }
    }
    if (!fits) continue
    const p: TrafficPiece = {
      id: nextId++,
      horizontal,
      length: len,
      isHero: false,
      row: r,
      col: c,
    }
    pieces.push(p)
    if (horizontal) {
      for (let i = 0; i < len; i++) grid[r][c + i] = p.id
    } else {
      for (let i = 0; i < len; i++) grid[r + i][c] = p.id
    }
    placed++
  }

  return {
    mode: 'trafico',
    level: lv,
    rows,
    cols,
    grid,
    start: { r: exitRow, c: heroCol },
    goal: { r: exitRow, c: cols - 1 },
    traffic: pieces,
    crateCount: 0,
    moveHint: d.moveHint,
    targetSeconds: d.targetSeconds,
    seed,
    goalText: 'Despeja el camino →',
  }
}

/** Mueve una pieza de tráfico un paso si cabe */
export function moveTrafficPiece(
  grid: DespejeGrid,
  pieces: TrafficPiece[],
  pieceId: number,
  dir: DespejeDir
): { grid: DespejeGrid; pieces: TrafficPiece[]; moved: boolean } {
  const p = pieces.find((x) => x.id === pieceId)
  if (!p) return { grid, pieces, moved: false }

  if (p.horizontal && (dir === 'up' || dir === 'down')) {
    return { grid, pieces, moved: false }
  }
  if (!p.horizontal && (dir === 'left' || dir === 'right')) {
    return { grid, pieces, moved: false }
  }

  const rows = grid.length
  const cols = grid[0].length
  const { dr, dc } = DIR_DELTA[dir]

  // celdas que ocupará
  const cells: { r: number; c: number }[] = []
  for (let i = 0; i < p.length; i++) {
    cells.push(
      p.horizontal
        ? { r: p.row, c: p.col + i }
        : { r: p.row + i, c: p.col }
    )
  }
  const nextCells = cells.map((x) => ({ r: x.r + dr, c: x.c + dc }))
  for (const n of nextCells) {
    if (!inBounds(n.r, n.c, rows, cols)) return { grid, pieces, moved: false }
    const occ = grid[n.r][n.c]
    // permitir si es parte de la misma pieza
    if (occ !== 0 && occ !== p.id) return { grid, pieces, moved: false }
  }

  const nextGrid = cloneGrid(grid)
  for (const x of cells) nextGrid[x.r][x.c] = 0
  for (const n of nextCells) nextGrid[n.r][n.c] = p.id

  const nextPieces = pieces.map((x) =>
    x.id === p.id ? { ...x, row: x.row + dr, col: x.col + dc } : x
  )
  return { grid: nextGrid, pieces: nextPieces, moved: true }
}

export function isTraficoSolved(
  pieces: TrafficPiece[],
  cols: number
): boolean {
  const hero = pieces.find((p) => p.isHero)
  if (!hero) return false
  // el héroe toca la columna de salida (última)
  return hero.col + hero.length - 1 >= cols - 2 && hero.horizontal
}

/* ── LABERINTO ── */

function carveMaze(
  rows: number,
  cols: number,
  rng: () => number
): DespejeGrid {
  // odd sizes work better for recursive backtracker
  const R = rows % 2 === 0 ? rows - 1 : rows
  const C = cols % 2 === 0 ? cols - 1 : cols
  const grid = emptyGrid(R, C, 1)

  function carve(r: number, c: number) {
    grid[r][c] = 0
    const dirs = DESPEJE_DIRS.slice()
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[dirs[i], dirs[j]] = [dirs[j], dirs[i]]
    }
    for (const dir of dirs) {
      const { dr, dc } = DIR_DELTA[dir]
      const nr = r + dr * 2
      const nc = c + dc * 2
      if (nr > 0 && nc > 0 && nr < R - 1 && nc < C - 1 && grid[nr][nc] === 1) {
        grid[r + dr][c + dc] = 0
        carve(nr, nc)
      }
    }
  }

  carve(1, 1)

  // expand to requested size if even
  if (R !== rows || C !== cols) {
    const full = emptyGrid(rows, cols, 1)
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) full[r][c] = grid[r][c]
    }
    return full
  }
  return grid
}

export function generateLaberintoLevel(
  level: number,
  opts?: { seedSalt?: number }
): DespejeLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 7400 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getDespejeDifficulty(lv, 'laberinto')
  let { rows, cols } = d
  // prefer odd
  if (rows % 2 === 0) rows++
  if (cols % 2 === 0) cols++
  rows = Math.min(21, rows)
  cols = Math.min(21, cols)

  const grid = carveMaze(rows, cols, rng)
  const start = { r: 1, c: 1 }
  const goal = { r: rows - 2, c: cols - 2 }
  grid[start.r][start.c] = 2
  grid[goal.r][goal.c] = 3

  // abrir un poco más en niveles bajos
  if (lv <= 6) {
    for (let i = 0; i < Math.floor(rows * cols * 0.04); i++) {
      const r = 1 + Math.floor(rng() * (rows - 2))
      const c = 1 + Math.floor(rng() * (cols - 2))
      if (grid[r][c] === 1) grid[r][c] = 0
    }
  }

  return {
    mode: 'laberinto',
    level: lv,
    rows,
    cols,
    grid,
    start,
    goal,
    crateCount: 0,
    moveHint: d.moveHint,
    targetSeconds: d.targetSeconds,
    seed,
    goalText: 'Encuentra la salida del laberinto.',
  }
}

/* ── API unificada ── */

export function generateDespejeLevel(
  mode: DespejeMode,
  level: number,
  opts?: { seedSalt?: number }
): DespejeLevel {
  switch (mode) {
    case 'hielo':
      return generateHieloLevel(level, opts)
    case 'empuje':
      return generateEmpujeLevel(level, opts)
    case 'trafico':
      return generateTraficoLevel(level, opts)
    case 'laberinto':
      return generateLaberintoLevel(level, opts)
    default:
      return generateHieloLevel(level, opts)
  }
}

export function isDespejeWon(
  mode: DespejeMode,
  grid: DespejeGrid,
  pr: number,
  pc: number,
  goal: { r: number; c: number },
  traffic?: TrafficPiece[]
): boolean {
  if (mode === 'empuje') return isEmpujeSolved(grid)
  if (mode === 'trafico' && traffic) {
    return isTraficoSolved(traffic, grid[0].length)
  }
  // hielo / laberinto: jugador en meta
  return pr === goal.r && pc === goal.c
}

export function calcDespejeStars(
  moves: number,
  timeMs: number,
  moveHint: number,
  targetSeconds: number
): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (moves <= moveHint && stars >= 2) stars = 3
  else if (moves <= moveHint * 1.4 && stars === 1) stars = 2
  return stars
}

/** Tamaño de celda responsive */
export function despejeCellPx(
  rows: number,
  cols: number,
  isMobile: boolean
): number {
  const maxBoard = isMobile ? Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 32 : 360) : 480
  const cell = Math.floor(maxBoard / Math.max(rows, cols))
  return Math.max(22, Math.min(isMobile ? 48 : 56, cell))
}
