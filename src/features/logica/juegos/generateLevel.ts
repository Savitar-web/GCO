/**
 * Motor de niveles compartido — Lógica
 *
 * Sirve a:
 *   1) Colocador (Number Puzzle)  → generateNumberPuzzleLevel, shuffleBoard, …
 *   2) Rompecabezas (Jigsaw)      → generateJigsawLevel, generateCreativeJigsaw,
 *                                    buildPiecePath, createPieces, …
 *   3) Despejes (Puzzle)          → generateLaberintoLevel, generateCromaLevel,
 *                                    generatePintarLevel, …
 *
 * Puedes colocarlo en:
 *   src/features/logica/juegos/generateLevel.ts
 * e importar desde los tres juegos,
 * o copiar/reexportar desde cada carpeta.
 *
 * v2 — sección 2) ROMPECABEZAS reescrita: piezas con geometría SVG real
 * (pestaña/hueco), 3 estilos de corte, banco de imágenes por categoría +
 * imágenes importadas, progresión de piezas por nivel y persistencia en
 * localStorage. Secciones 1) Colocador y 3) Despejes se conservan del motor
 * original de este archivo.
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

/** mm:ss — formateo de tiempo compartido por los tres juegos. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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

/* ── Estrellas del colocador ── */

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

/** Alias explícito del colocador (misma implementación) — se conserva por compatibilidad. */
export function calcNumberPuzzleStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  moveLimit: number,
  size: number
): 0 | 1 | 2 | 3 {
  return calcStars(moves, timeMs, targetSeconds, moveLimit, size)
}

/* ═══════════════════════════════════════════════════════════════════════════
   2) ROMPECABEZAS — Jigsaw
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Piezas con geometría real: cada una tiene un contorno SVG propio (pestaña
 * saliente o hueco entrante) que coincide exactamente con el de su vecina,
 * así que no quedan huecos ni solapes en la unión. La fotografía en sí
 * jamás se recorta ni se deforma — todas las piezas dibujan el MISMO fondo
 * continuo (del tamaño completo del tablero); lo único que cambia entre
 * piezas es el recorte (clip-path) con su forma. Lo que se "corta" siempre
 * es el borde de la pieza, nunca la imagen.
 *
 * Incluye 3 estilos de corte, banco de imágenes por categoría + imágenes
 * importadas por el usuario, progresión de piezas por nivel para el Modo
 * Normal (que se alarga a medida que sube la dificultad) y una selección
 * totalmente libre para el Modo Creativo (4 a 2200 piezas).
 */

/* ── Formas de pieza ── */

export type PieceShape = 'classic' | 'round' | 'pointed'

export interface PieceShapeMeta {
  id: PieceShape
  label: string
  emoji: string
  desc: string
}

export const PIECE_SHAPES: PieceShapeMeta[] = [
  { id: 'classic', label: 'Clásica', emoji: '🧩', desc: 'Pestañas y huecos tradicionales' },
  { id: 'round', label: 'Redonda', emoji: '⭘', desc: 'Bordes suaves y ondulados' },
  { id: 'pointed', label: 'Puntiaguda', emoji: '✦', desc: 'Puntas geométricas' },
]

/* ── Imágenes ── */

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
  /** Ruta pública o data-URL (imágenes importadas por el usuario) */
  src: string
  isCustom?: boolean
  /** Tonos para el degradado de respaldo mientras no exista el archivo real */
  fallbackHue: number
  fallbackHue2: number
}

export const CATEGORY_LABELS: Record<ImageCategory, string> = {
  naturaleza: 'Naturaleza',
  animales: 'Animales',
  libros: 'Libros antiguos',
  ilustraciones: 'Ilustraciones',
  abstracto: 'Abstracto',
  custom: 'Mis imágenes',
}

export const CATEGORY_EMOJI: Record<ImageCategory, string> = {
  naturaleza: '🌿',
  animales: '🦊',
  libros: '📖',
  ilustraciones: '🎨',
  abstracto: '🌀',
  custom: '🖼️',
}

/** Orden de exhibición de las categorías por defecto (sin "custom", que vive en su propia pestaña). */
export const CATEGORY_ORDER: ImageCategory[] = [
  'naturaleza',
  'animales',
  'ilustraciones',
  'libros',
  'abstracto',
]

/**
 * Catálogo por defecto. Coloca los archivos reales en:
 *   public/puzzles/imgrom1.webp … imgrom20.webp
 * Si un archivo todavía no existe, la pieza muestra un degradado de marca
 * (fallbackHue → fallbackHue2) en su lugar — nunca un ícono de imagen rota.
 */
export const DEFAULT_IMAGES: PuzzleImage[] = [
  // Naturaleza
  { id: 'imgrom1', name: 'Bosque en primavera', category: 'naturaleza', src: '/puzzles/imgrom1.webp', fallbackHue: 140, fallbackHue2: 165 },
  { id: 'imgrom2', name: 'Montañas al atardecer', category: 'naturaleza', src: '/puzzles/imgrom2.webp', fallbackHue: 25, fallbackHue2: 340 },
  { id: 'imgrom3', name: 'Lago de cristal', category: 'naturaleza', src: '/puzzles/imgrom3.webp', fallbackHue: 195, fallbackHue2: 175 },
  { id: 'imgrom4', name: 'Aurora boreal', category: 'naturaleza', src: '/puzzles/imgrom4.webp', fallbackHue: 170, fallbackHue2: 260 },
  // Animales
  { id: 'imgrom5', name: 'Zorro del bosque', category: 'animales', src: '/puzzles/imgrom5.webp', fallbackHue: 20, fallbackHue2: 35 },
  { id: 'imgrom6', name: 'Gato curioso', category: 'animales', src: '/puzzles/imgrom6.webp', fallbackHue: 35, fallbackHue2: 45 },
  { id: 'imgrom7', name: 'Búho nocturno', category: 'animales', src: '/puzzles/imgrom7.webp', fallbackHue: 250, fallbackHue2: 220 },
  { id: 'imgrom8', name: 'Ciervo en el claro', category: 'animales', src: '/puzzles/imgrom8.webp', fallbackHue: 30, fallbackHue2: 100 },
  // Ilustraciones
  { id: 'imgrom9', name: 'Dragón antiguo', category: 'ilustraciones', src: '/puzzles/imgrom9.webp', fallbackHue: 280, fallbackHue2: 320 },
  { id: 'imgrom10', name: 'Barco en la niebla', category: 'ilustraciones', src: '/puzzles/imgrom10.webp', fallbackHue: 210, fallbackHue2: 195 },
  { id: 'imgrom11', name: 'Fénix de fuego', category: 'ilustraciones', src: '/puzzles/imgrom11.webp', fallbackHue: 15, fallbackHue2: 45 },
  { id: 'imgrom12', name: 'Castillo encantado', category: 'ilustraciones', src: '/puzzles/imgrom12.webp', fallbackHue: 260, fallbackHue2: 290 },
  // Libros antiguos
  { id: 'imgrom13', name: 'Grabado renacentista', category: 'libros', src: '/puzzles/imgrom13.webp', fallbackHue: 40, fallbackHue2: 30 },
  { id: 'imgrom14', name: 'Mapa del tesoro', category: 'libros', src: '/puzzles/imgrom14.webp', fallbackHue: 45, fallbackHue2: 35 },
  { id: 'imgrom15', name: 'Manuscrito iluminado', category: 'libros', src: '/puzzles/imgrom15.webp', fallbackHue: 50, fallbackHue2: 15 },
  { id: 'imgrom16', name: 'Biblioteca olvidada', category: 'libros', src: '/puzzles/imgrom16.webp', fallbackHue: 35, fallbackHue2: 20 },
  // Abstracto
  { id: 'imgrom17', name: 'Flor abstracta', category: 'abstracto', src: '/puzzles/imgrom17.webp', fallbackHue: 320, fallbackHue2: 280 },
  { id: 'imgrom18', name: 'Ondas de color', category: 'abstracto', src: '/puzzles/imgrom18.webp', fallbackHue: 200, fallbackHue2: 320 },
  { id: 'imgrom19', name: 'Geometría fluida', category: 'abstracto', src: '/puzzles/imgrom19.webp', fallbackHue: 265, fallbackHue2: 190 },
  { id: 'imgrom20', name: 'Textura orgánica', category: 'abstracto', src: '/puzzles/imgrom20.webp', fallbackHue: 150, fallbackHue2: 90 },
]

/** Agrupa un banco de imágenes por categoría, en el orden en que aparecen. */
export function imagesByCategory(pool: PuzzleImage[]): Partial<Record<ImageCategory, PuzzleImage[]>> {
  const out: Partial<Record<ImageCategory, PuzzleImage[]>> = {}
  for (const img of pool) {
    if (!out[img.category]) out[img.category] = []
    out[img.category]!.push(img)
  }
  return out
}

/* ── Progresión de piezas por nivel (Modo Normal) ── */

/** Cada escalón de piezas por el que pasa el Modo Normal, en orden. */
export const PIECE_TIER_SIZES = [4, 8, 12, 20, 30, 60, 100, 200, 500, 1000, 2200] as const

/**
 * Cuántos niveles dura cada escalón antes de subir al siguiente
 * (el último escalón —2200— ya no sube: se queda ahí para siempre).
 * Los primeros 5 valores son los pedidos explícitamente (4, 3, 6, 9, 10);
 * de ahí en adelante la duración del escalón sigue creciendo, para que la
 * curva de dificultad no se detenga.
 */
const PIECE_TIER_SPAN = [4, 3, 6, 9, 10, 12, 15, 18, 22, 26] as const

/** Chips de piezas sugeridas en el Modo Creativo (2200 se alcanza con el control deslizante). */
export const PIECE_SUGGESTIONS = [4, 8, 12, 20, 30, 60, 100, 200, 500, 1000] as const

export const PIECES_MIN = 4
export const PIECES_MAX = 2200

export function clampPieceCount(n: number): number {
  if (!Number.isFinite(n)) return PIECES_MIN
  return Math.max(PIECES_MIN, Math.min(PIECES_MAX, Math.round(n)))
}

export interface PieceTierInfo {
  tierIndex: number
  pieces: number
  /** Nivel dentro del escalón actual, empezando en 1 */
  levelInTier: number
  /** Cuántos niveles dura este escalón (Infinity en el último) */
  spanForTier: number
  isMaxTier: boolean
  /** Niveles que faltan, después del actual, para subir de escalón (null en el último) */
  levelsUntilNextTier: number | null
}

export function pieceTierInfoForLevel(level: number): PieceTierInfo {
  const lv = Math.max(1, Math.floor(level))
  let remaining = lv
  for (let i = 0; i < PIECE_TIER_SPAN.length; i++) {
    const span = PIECE_TIER_SPAN[i]
    if (remaining <= span) {
      return {
        tierIndex: i,
        pieces: PIECE_TIER_SIZES[i],
        levelInTier: remaining,
        spanForTier: span,
        isMaxTier: false,
        levelsUntilNextTier: span - remaining,
      }
    }
    remaining -= span
  }
  const lastIdx = PIECE_TIER_SIZES.length - 1
  return {
    tierIndex: lastIdx,
    pieces: PIECE_TIER_SIZES[lastIdx],
    levelInTier: remaining,
    spanForTier: Infinity,
    isMaxTier: true,
    levelsUntilNextTier: null,
  }
}

export function piecesForLevel(level: number): number {
  return pieceTierInfoForLevel(level).pieces
}

/* ── Cuadrícula ── */

/** cols × rows lo más parecido posible a un cuadrado para el número de piezas pedido. */
export function gridForPieces(pieces: number): { cols: number; rows: number } {
  const n = clampPieceCount(pieces)
  let bestCols = 2
  let bestRows = 2
  let bestScore = Infinity
  const maxCols = Math.ceil(Math.sqrt(n)) + 8
  for (let cols = 2; cols <= maxCols; cols++) {
    const rows = Math.ceil(n / cols)
    const total = cols * rows
    const waste = total - n
    const aspect = Math.abs(cols / rows - 1)
    const score = waste * 10 + aspect * 6
    if (score < bestScore) {
      bestScore = score
      bestCols = cols
      bestRows = rows
    }
  }
  return { cols: bestCols, rows: bestRows }
}

/* ── Forma e imagen automáticas (Modo Normal) ── */

/** En Modo Normal la forma de las piezas la decide el motor, según el nivel. */
export function shapeForLevel(level: number): PieceShape {
  const lv = Math.max(1, Math.floor(level))
  const cycle: PieceShape[] = ['classic', 'classic', 'round', 'classic', 'pointed']
  return cycle[lv % cycle.length]
}

/**
 * En Modo Normal la imagen "aparece de repente" — la elige el motor, no el
 * jugador. La mayoría de las veces sale del catálogo por defecto; si el
 * jugador ya importó imágenes propias, de vez en cuando también puede tocar
 * una de las suyas (así las imágenes importadas también aparecen al subir
 * de nivel, no solo en el Modo Creativo). La elección es determinista por
 * nivel: el mismo nivel siempre vuelve a mostrar la misma imagen.
 */
export function imageForLevel(level: number, pool: PuzzleImage[]): PuzzleImage {
  const lv = Math.max(1, Math.floor(level))
  const defaults = pool.filter((p) => !p.isCustom)
  const custom = pool.filter((p) => p.isCustom)
  const rng = mulberry32(levelSeed(lv, 6600))
  const useCustom = custom.length > 0 && rng() < 0.18
  const from = useCustom ? custom : defaults.length ? defaults : pool
  if (!from.length) return DEFAULT_IMAGES[0]
  const idx = Math.floor(rng() * from.length)
  return from[idx]
}

/* ── Nivel completo ── */

export interface JigsawLevel {
  /** 0 = nivel "libre" generado desde el Modo Creativo (no forma parte de la progresión) */
  level: number
  pieces: number
  cols: number
  rows: number
  shape: PieceShape
  image: PuzzleImage
  targetSeconds: number
  hints: number
  seed: number
  goal: string
}

export function hintsForPieces(pieces: number): number {
  return Math.max(3, Math.round(Math.sqrt(pieces) * 0.5))
}

export function targetSecondsForPieces(pieces: number): number {
  return Math.round(20 + pieces * 0.9)
}

export function getJigsawDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const pieces = piecesForLevel(lv)
  const { cols, rows } = gridForPieces(pieces)
  const shape = shapeForLevel(lv)
  const total = cols * rows
  return {
    pieces: total,
    cols,
    rows,
    shape,
    targetSeconds: targetSecondsForPieces(total),
    hints: hintsForPieces(total),
  }
}

/** Nivel de Modo Normal — pieza, forma e imagen las decide el motor según el nivel. */
export function generateJigsawLevel(
  level: number,
  pool: PuzzleImage[],
  opts?: { seedSalt?: number }
): JigsawLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 6200 + (opts?.seedSalt ?? 0))
  const d = getJigsawDifficulty(lv)
  const image = imageForLevel(lv, pool)
  return {
    level: lv,
    pieces: d.pieces,
    cols: d.cols,
    rows: d.rows,
    shape: d.shape,
    image,
    targetSeconds: d.targetSeconds,
    hints: d.hints,
    seed,
    goal: `Arma el rompecabezas de ${d.pieces} piezas (${d.cols}×${d.rows}).`,
  }
}

/** Nivel de Modo Creativo — imagen, cantidad de piezas y forma las elige el jugador. */
export function generateCreativeJigsaw(opts: {
  image: PuzzleImage
  pieces: number
  shape: PieceShape
  seedSalt?: number
}): JigsawLevel {
  const pieces = clampPieceCount(opts.pieces)
  const { cols, rows } = gridForPieces(pieces)
  const total = cols * rows
  const salt = opts.seedSalt ?? Math.floor(Math.random() * 99999)
  const seed = levelSeed(total, 6900 + salt)
  return {
    level: 0,
    pieces: total,
    cols,
    rows,
    shape: opts.shape,
    image: opts.image,
    targetSeconds: targetSecondsForPieces(total),
    hints: hintsForPieces(total),
    seed,
    goal: `Arma el rompecabezas de ${total} piezas (${cols}×${rows}).`,
  }
}

/* ── Geometría de piezas: pestaña / hueco reales, sin deformar la imagen ── */

/** -1 = hueco, 0 = borde recto (perímetro del tablero), 1 = pestaña */
export type EdgeTab = -1 | 0 | 1

export interface PieceEdges {
  top: EdgeTab
  topJitter: number
  right: EdgeTab
  rightJitter: number
  bottom: EdgeTab
  bottomJitter: number
  left: EdgeTab
  leftJitter: number
}

/**
 * Genera el mapa de bordes de toda la cuadrícula. Cada borde INTERNO se
 * decide una única vez (cuando la pieza de arriba/izquierda lo "declara"
 * como su right/bottom, junto con su jitter) y la pieza vecina simplemente
 * hereda el mismo valor invertido — así dos piezas contiguas comparten
 * exactamente la misma curva en su unión, sin huecos ni solapes.
 */
export function buildEdgeMap(cols: number, rows: number, seed: number): PieceEdges[][] {
  const rng = mulberry32(seed)
  const map: PieceEdges[][] = []
  for (let r = 0; r < rows; r++) {
    map[r] = []
    for (let c = 0; c < cols; c++) {
      const top = r === 0 ? 0 : ((-map[r - 1][c].bottom) as EdgeTab)
      const topJitter = r === 0 ? 0 : map[r - 1][c].bottomJitter
      const left = c === 0 ? 0 : ((-map[r][c - 1].right) as EdgeTab)
      const leftJitter = c === 0 ? 0 : map[r][c - 1].rightJitter
      const right = c === cols - 1 ? 0 : ((rng() > 0.5 ? 1 : -1) as EdgeTab)
      const rightJitter = c === cols - 1 ? 0 : rng()
      const bottom = r === rows - 1 ? 0 : ((rng() > 0.5 ? 1 : -1) as EdgeTab)
      const bottomJitter = r === rows - 1 ? 0 : rng()
      map[r][c] = { top, topJitter, right, rightJitter, bottom, bottomJitter, left, leftJitter }
    }
  }
  return map
}

export function isBorderPiece(edges: PieceEdges): boolean {
  return edges.top === 0 || edges.right === 0 || edges.bottom === 0 || edges.left === 0
}

function tabSizeFor(cellW: number, cellH: number, shape: PieceShape): number {
  const factor = shape === 'round' ? 0.28 : shape === 'pointed' ? 0.27 : 0.26
  return Math.min(cellW, cellH) * factor
}

/** Cuánto hay que reservar alrededor de la celda base para que quepa la pestaña más ancha, sin recortarla. */
export function pieceTabPad(cellW: number, cellH: number, shape: PieceShape): number {
  return Math.ceil(tabSizeFor(cellW, cellH, shape) * 1.9)
}

/**
 * Comandos SVG (L/C/A) de un borde individual, desde (x0,y0) hasta (x1,y1).
 * `dir` decide si ese borde tiene pestaña (1), hueco (-1) o va recto (0);
 * `jitter` (0..1, compartido con la pieza vecina) varía un poco el ancho y
 * la altura de la pestaña para que la cuadrícula no se vea perfectamente
 * uniforme. Las 3 formas usan la MISMA construcción simétrica alrededor del
 * punto medio del borde, así que sin importar en qué sentido la recorra
 * cada pieza (una la ve como pestaña, la vecina como hueco), el resultado
 * es exactamente la misma curva física — de ahí que nunca queden huecos.
 */
function edgeCommand(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dir: EdgeTab,
  jitter: number,
  shape: PieceShape,
  size: number
): string {
  const f = (n: number) => n.toFixed(2)
  if (dir === 0) return `L ${f(x1)} ${f(y1)}`

  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // normal "hacia afuera" para un recorrido en sentido horario del contorno
  const px = uy
  const py = -ux
  const pt = (t: number, o: number): [number, number] => {
    const bx = x0 + dx * t
    const by = y0 + dy * t
    return [bx + px * o * dir, by + py * o * dir]
  }
  const jr = (jitter - 0.5) * 2 // -1..1
  const s = size

  if (shape === 'classic') {
    const neckW = 0.22 + 0.05 * jr
    const n1t = 0.5 - neckW / 2
    const n2t = 0.5 + neckW / 2
    const peakO = s * (1.38 + 0.15 * jr)
    const [n1x, n1y] = pt(n1t, 0)
    const [n2x, n2y] = pt(n2t, 0)
    const [peakX, peakY] = pt(0.5, peakO)
    const [c1x, c1y] = pt(n1t - 0.025, s * 0.95)
    const [c2x, c2y] = pt(0.5 - 0.155, peakO * 1.02)
    const [c3x, c3y] = pt(0.5 + 0.155, peakO * 1.02)
    const [c4x, c4y] = pt(n2t + 0.025, s * 0.95)
    return (
      `L ${f(n1x)} ${f(n1y)} ` +
      `C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(peakX)} ${f(peakY)} ` +
      `C ${f(c3x)} ${f(c3y)} ${f(c4x)} ${f(c4y)} ${f(n2x)} ${f(n2y)} ` +
      `L ${f(x1)} ${f(y1)}`
    )
  }

  if (shape === 'round') {
    const neckW = 0.46 + 0.04 * jr
    const n1t = 0.5 - neckW / 2
    const n2t = 0.5 + neckW / 2
    const [n1x, n1y] = pt(n1t, 0)
    const [n2x, n2y] = pt(n2t, 0)
    const rx = ((n2t - n1t) * len) / 2
    const ry = s * (1.05 + 0.1 * jr)
    const sweep = dir > 0 ? 1 : 0
    return (
      `L ${f(n1x)} ${f(n1y)} ` +
      `A ${f(rx)} ${f(ry)} 0 0 ${sweep} ${f(n2x)} ${f(n2y)} ` +
      `L ${f(x1)} ${f(y1)}`
    )
  }

  // pointed — pico geométrico en forma de rombo
  const neckW = 0.32
  const n1t = 0.5 - neckW / 2
  const n2t = 0.5 + neckW / 2
  const peakO = s * (1.2 + 0.1 * jr)
  const [n1x, n1y] = pt(n1t, 0)
  const [n2x, n2y] = pt(n2t, 0)
  const [m1x, m1y] = pt(0.5 - 0.08, peakO * 0.5)
  const [peakX, peakY] = pt(0.5, peakO)
  const [m2x, m2y] = pt(0.5 + 0.08, peakO * 0.5)
  return (
    `L ${f(n1x)} ${f(n1y)} L ${f(m1x)} ${f(m1y)} L ${f(peakX)} ${f(peakY)} ` +
    `L ${f(m2x)} ${f(m2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  )
}

/**
 * Contorno SVG completo (atributo `d`) de una pieza, en coordenadas locales
 * de su propia "caja" (celda base + el margen `pad` reservado para la
 * pestaña). El mismo `d` sirve tanto para el `clip-path` que recorta la
 * imagen como para el `<path>` de borde visible — por eso el corte y el
 * dibujo del borde siempre coinciden exactamente.
 */
export function buildPiecePath(
  cellW: number,
  cellH: number,
  pad: number,
  edges: PieceEdges,
  shape: PieceShape
): string {
  const size = tabSizeFor(cellW, cellH, shape)
  const TL = { x: pad, y: pad }
  const TR = { x: pad + cellW, y: pad }
  const BR = { x: pad + cellW, y: pad + cellH }
  const BL = { x: pad, y: pad + cellH }
  let d = `M ${TL.x} ${TL.y} `
  d += edgeCommand(TL.x, TL.y, TR.x, TR.y, edges.top, edges.topJitter, shape, size) + ' '
  d += edgeCommand(TR.x, TR.y, BR.x, BR.y, edges.right, edges.rightJitter, shape, size) + ' '
  d += edgeCommand(BR.x, BR.y, BL.x, BL.y, edges.bottom, edges.bottomJitter, shape, size) + ' '
  d += edgeCommand(BL.x, BL.y, TL.x, TL.y, edges.left, edges.leftJitter, shape, size) + ' '
  d += 'Z'
  return d
}

/* ── Piezas interactivas ── */

export interface JigsawPiece {
  id: string
  row: number
  col: number
  /** Posición correcta, en unidades de celda (col, row) — nunca cambia. */
  correctX: number
  correctY: number
  /** Posición actual, en unidades de celda — independiente del zoom y del tamaño de pantalla. */
  x: number
  y: number
  locked: boolean
  z: number
  edges: PieceEdges
}

/**
 * Crea las piezas de un nivel, ya "desordenadas" en una bandeja debajo del
 * tablero. Tanto la posición correcta como la posición inicial están en
 * UNIDADES DE CELDA (no en píxeles): para dibujarlas solo hay que
 * multiplicar por el tamaño de celda actual, así que cambiar de pantalla,
 * rotar el dispositivo o hacer zoom jamás obliga a reordenar ni a "perder"
 * el progreso de piezas sueltas.
 */
export function createPieces(level: JigsawLevel, shuffleSeed: number): JigsawPiece[] {
  const { cols, rows } = level
  const edgeMap = buildEdgeMap(cols, rows, level.seed)
  const rng = mulberry32(shuffleSeed)

  const order: { row: number; col: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) order.push({ row: r, col: c })
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const trayCols = Math.max(4, Math.min(cols + 4, Math.ceil(Math.sqrt(order.length * 1.6))))
  const trayGap = 1.18

  return order.map((pos, i) => {
    const trayRow = Math.floor(i / trayCols)
    const trayCol = i % trayCols
    const jitterX = (rng() - 0.5) * 0.22
    const jitterY = (rng() - 0.5) * 0.22
    return {
      id: `p-${pos.row}-${pos.col}`,
      row: pos.row,
      col: pos.col,
      correctX: pos.col,
      correctY: pos.row,
      x: trayCol * trayGap + jitterX,
      y: rows + 1.2 + trayRow * trayGap + jitterY,
      locked: false,
      z: i + 1,
      edges: edgeMap[pos.row][pos.col],
    }
  })
}

/** Distancia (en celdas) entre la posición actual de una pieza y su lugar correcto. */
export function distanceToCorrect(piece: JigsawPiece): number {
  return Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY)
}

/** Umbral (en celdas) para que una pieza "encaje" al soltarla — el jugador siempre debe soltarla cerca; nunca se coloca sola. */
export const SNAP_THRESHOLD_CELLS = 0.34

export function countLocked(pieces: JigsawPiece[]): number {
  return pieces.reduce((n, p) => n + (p.locked ? 1 : 0), 0)
}

export function isPuzzleComplete(pieces: JigsawPiece[]): boolean {
  return pieces.length > 0 && pieces.every((p) => p.locked)
}

export function calcJigsawStars(
  timeMs: number,
  targetSeconds: number,
  hintsUsed: number,
  maxHints: number
): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  const withinTarget = targetSeconds > 0 && timeMs <= targetSeconds * 1000
  if (withinTarget) stars = 2
  const fewHints = maxHints <= 0 || hintsUsed <= Math.ceil(maxHints * 0.3)
  if (withinTarget && fewHints && timeMs <= targetSeconds * 1000 * 0.65) stars = 3
  else if (withinTarget && hintsUsed === 0) stars = 3
  return stars
}

/** Tamaño de celda responsive (px), pensado para tableros de 4 a 2200 piezas. */
export function jigsawCellPx(
  cols: number,
  rows: number,
  containerW: number,
  isMobile: boolean
): number {
  const maxW = isMobile ? Math.max(240, containerW) : Math.min(containerW, 860)
  const raw = Math.floor(maxW / Math.max(cols, 1))
  const totalPieces = cols * rows
  const min = totalPieces > 600 ? 16 : totalPieces > 150 ? 22 : 30
  const max = isMobile ? 74 : 96
  return Math.max(min, Math.min(max, raw))
}

/* ── Imágenes personalizadas (localStorage) ── */

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

export function saveCustomImages(list: PuzzleImage[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
  } catch {
    // almacenamiento lleno o no disponible: se ignora, la sesión sigue funcionando igual
  }
}

/** Agrega (o reemplaza) una imagen propia y devuelve la lista actualizada. */
export function addCustomImage(img: PuzzleImage): PuzzleImage[] {
  const list = loadCustomImages().filter((x) => x.id !== img.id)
  list.unshift(img)
  saveCustomImages(list.slice(0, 60))
  return loadCustomImages()
}

/** Elimina una imagen propia por id — las del catálogo por defecto no pasan por aquí. */
export function removeCustomImage(id: string): PuzzleImage[] {
  const list = loadCustomImages().filter((x) => x.id !== id)
  saveCustomImages(list)
  return list
}

/** Redimensiona y comprime una imagen del dispositivo a un data-URL liviano, listo para guardar. */
export function compressImageFile(file: File, maxSide = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas no disponible'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('no se pudo leer la imagen'))
    }
    img.src = url
  })
}

/* ── Progreso persistente del Modo Normal ── */

export interface PuzzleProgress {
  normalLevel: number
  starsByLevel: Record<number, 0 | 1 | 2 | 3>
  totalStars: number
  hintsUsedByLevel: Record<number, number>
}

const PROGRESS_KEY = 'gco:puzzle-progress'

export function defaultPuzzleProgress(): PuzzleProgress {
  return { normalLevel: 1, starsByLevel: {}, totalStars: 0, hintsUsedByLevel: {} }
}

export function loadPuzzleProgress(): PuzzleProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return defaultPuzzleProgress()
    const parsed = JSON.parse(raw) as Partial<PuzzleProgress>
    return {
      normalLevel: parsed.normalLevel && parsed.normalLevel > 0 ? parsed.normalLevel : 1,
      starsByLevel: parsed.starsByLevel ?? {},
      totalStars: parsed.totalStars ?? 0,
      hintsUsedByLevel: parsed.hintsUsedByLevel ?? {},
    }
  } catch {
    return defaultPuzzleProgress()
  }
}

export function savePuzzleProgress(p: PuzzleProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    // se ignora: el progreso queda solo en memoria para esta sesión
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3) DESPEJES — Laberinto (empuja rocas) + Croma (gemas) + Pintar
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Filosofía compartida con el resto del motor: todo nivel se genera desde
 * un estado "resuelto" y se desordena con movimientos legales y reversibles
 * (mismo principio que shuffleBoard). Esto garantiza matemáticamente que
 * cada nivel generado SIEMPRE tiene solución, sin necesidad de un solver
 * por fuerza bruta en tiempo de ejecución.
 */

/* Helpers propios de Despejes (no tocan nada de las secciones 1 y 2) */

/** Baraja un arreglo con un rng dado (Fisher–Yates), sin mutar el original */
function shuffledArray<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const DIRECTION_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}


/* ── 3.1 Laberinto: laberinto perfecto + rocas que caen en huecos ──
 *
 * Inspirado en los puzzles de rocas de Pokémon (despejar el camino a un
 * objetivo empujando piedras), pero con generador de niveles infinito:
 * cada nivel es un laberinto perfecto (siempre tiene un único camino base,
 * más atajos añadidos por "trenzado" en niveles altos para subir la
 * dificultad de forma progresiva y lenta) sembrado con rocas que bloquean
 * ese camino y solo pueden despejarse empujándolas a un hueco cercano.
 */

export type MazeCellType = 'wall' | 'floor' | 'hole'
export interface MazeCoord {
  row: number
  col: number
}

export interface MazeBoulder {
  id: string
  /** Posición actual de la roca */
  row: number
  col: number
  /** Hueco donde debe caer para despejarse */
  holeRow: number
  holeCol: number
  cleared: boolean
}

export interface LaberintoLevel {
  level: number
  rows: number
  cols: number
  /** 'hole' = hueco sin rellenar; una vez la roca cae, se trata como piso */
  grid: MazeCellType[][]
  start: MazeCoord
  exit: MazeCoord
  boulders: MazeBoulder[]
  /** Radio de niebla de guerra en casillas (0 = sin niebla, mapa visible) */
  fogRadius: number
  /** 0 = sin límite */
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

/** Laberinto perfecto por backtracking recursivo (siempre conexo) */
function carveMaze(
  rooms: number,
  rng: () => number
): MazeCellType[][] {
  const W = rooms * 2 + 1
  const H = rooms * 2 + 1
  const grid: MazeCellType[][] = Array.from({ length: H }, () =>
    Array<MazeCellType>(W).fill('wall')
  )
  const visited = Array.from({ length: rooms }, () =>
    Array<boolean>(rooms).fill(false)
  )
  const stack: [number, number][] = [[0, 0]]
  visited[0][0] = true
  grid[1][1] = 'floor'
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]

  while (stack.length) {
    const [r, c] = stack[stack.length - 1]
    const order = shuffledArray(dirs, rng)
    let moved = false
    for (const [dr, dc] of order) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rooms || nc < 0 || nc >= rooms) continue
      if (visited[nr][nc]) continue
      visited[nr][nc] = true
      grid[1 + r * 2 + dr][1 + c * 2 + dc] = 'floor'
      grid[1 + nr * 2][1 + nc * 2] = 'floor'
      stack.push([nr, nc])
      moved = true
      break
    }
    if (!moved) stack.pop()
  }
  return grid
}

/** Añade atajos (ciclos) al laberinto perfecto: más difícil de leer visualmente */
function braidMaze(
  grid: MazeCellType[][],
  rng: () => number,
  extraRatio: number
) {
  const H = grid.length
  const W = grid[0].length
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      if (grid[r][c] !== 'wall') continue
      if (r % 2 === 1 && c % 2 === 0) {
        if (
          grid[r][c - 1] === 'floor' &&
          grid[r][c + 1] === 'floor' &&
          rng() < extraRatio
        ) {
          grid[r][c] = 'floor'
        }
      } else if (r % 2 === 0 && c % 2 === 1) {
        if (
          grid[r - 1][c] === 'floor' &&
          grid[r + 1][c] === 'floor' &&
          rng() < extraRatio
        ) {
          grid[r][c] = 'floor'
        }
      }
    }
  }
}

function mazeBfsPath(
  grid: MazeCellType[][],
  start: MazeCoord,
  goal: MazeCoord
): MazeCoord[] | null {
  const H = grid.length
  const W = grid[0].length
  const key = (r: number, c: number) => r * W + c
  const prev = new Map<number, number>()
  const seen = new Set<number>([key(start.row, start.col)])
  const queue: MazeCoord[] = [start]
  let qi = 0
  while (qi < queue.length) {
    const { row: r, col: c } = queue[qi++]
    if (r === goal.row && c === goal.col) break
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
      if (grid[nr][nc] === 'wall') continue
      const k = key(nr, nc)
      if (seen.has(k)) continue
      seen.add(k)
      prev.set(k, key(r, c))
      queue.push({ row: nr, col: nc })
    }
  }
  const gk = key(goal.row, goal.col)
  if (!seen.has(gk)) return null
  const path: MazeCoord[] = []
  let cur = gk
  const sk = key(start.row, start.col)
  while (cur !== sk) {
    path.push({ row: Math.floor(cur / W), col: cur % W })
    cur = prev.get(cur)!
  }
  path.push(start)
  path.reverse()
  return path
}

/** Simula el despeje en orden: valida que la generación sea 100% resoluble */
function simulateMazeClear(
  grid: MazeCellType[][],
  boulders: MazeBoulder[],
  start: MazeCoord,
  exit: MazeCoord
): boolean {
  const work = grid.map((row) => row.slice())
  for (const b of boulders) work[b.row][b.col] = 'wall'
  let cur = start
  for (const b of boulders) {
    const from = boulderApproach(b)
    const path = mazeBfsPath(work, cur, from)
    if (!path) return false
    work[b.row][b.col] = 'floor'
    cur = { row: b.row, col: b.col }
  }
  return !!mazeBfsPath(work, cur, exit)
}

function boulderApproach(b: MazeBoulder): MazeCoord {
  const dr = b.holeRow - b.row
  const dc = b.holeCol - b.col
  return { row: b.row - dr, col: b.col - dc }
}

/** Construye rocas + huecos garantizando que el nivel sea resoluble en orden */
function placeMazeBoulders(
  grid: MazeCellType[][],
  path: MazeCoord[],
  count: number,
  rng: () => number,
  start: MazeCoord,
  exit: MazeCoord
): MazeBoulder[] {
  const H = grid.length
  const W = grid[0].length
  const pathSet = new Set(path.map((p) => p.row * W + p.col))
  const placed: MazeBoulder[] = []
  const candidates = shuffledArray(path.slice(1, -1), rng)
  let idCounter = 0

  for (const p of candidates) {
    if (placed.length >= count) break
    if (placed.some((b) => b.row === p.row && b.col === p.col)) continue

    const dirs = shuffledArray(
      [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const,
      rng
    )
    for (const [dr, dc] of dirs) {
      const hr = p.row + dr
      const hc = p.col + dc
      if (hr < 0 || hr >= H || hc < 0 || hc >= W) continue
      if (grid[hr][hc] === 'wall') continue
      if (pathSet.has(hr * W + hc)) continue
      if (placed.some((b) => b.holeRow === hr && b.holeCol === hc)) continue
      const fr = p.row - dr
      const fc = p.col - dc
      if (fr < 0 || fr >= H || fc < 0 || fc >= W) continue
      if (grid[fr][fc] === 'wall') continue

      const candidate: MazeBoulder = {
        id: `b${idCounter}`,
        row: p.row,
        col: p.col,
        holeRow: hr,
        holeCol: hc,
        cleared: false,
      }
      const trial = [...placed, candidate]
      if (simulateMazeClear(grid, trial, start, exit)) {
        placed.push(candidate)
        idCounter++
        break
      }
    }
  }
  return placed
}

/** Curva de dificultad del laberinto */
export function getLaberintoDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const rooms = Math.min(4 + Math.floor(lv / 2.2), 19)
  const braidRatio = Math.min(0.04 + lv * 0.014, 0.46)
  const boulderCount = Math.min(1 + Math.floor(lv / 3), 12)
  const fogRadius = lv >= 22 ? Math.max(2, 6 - Math.floor((lv - 22) / 9)) : 0
  const moveLimit =
    lv <= 4 ? 0 : Math.round(rooms * rooms * 2.4 + boulderCount * 6)
  const targetSeconds = Math.max(
    20,
    Math.round(rooms * rooms * 1.6 + boulderCount * 8)
  )
  return { rooms, braidRatio, boulderCount, fogRadius, moveLimit, targetSeconds }
}

/**
 * Genera un nivel de Laberinto completo (garantizado resoluble).
 */
export function generateLaberintoLevel(
  level: number,
  opts?: { seedSalt?: number }
): LaberintoLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 8100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getLaberintoDifficulty(lv)

  const grid = carveMaze(d.rooms, rng)
  braidMaze(grid, rng, d.braidRatio)

  const start: MazeCoord = { row: 1, col: 1 }
  const exit: MazeCoord = { row: d.rooms * 2 - 1, col: d.rooms * 2 - 1 }
  const path = mazeBfsPath(grid, start, exit) ?? [start, exit]

  const boulders = placeMazeBoulders(
    grid,
    path,
    d.boulderCount,
    rng,
    start,
    exit
  )

  // marca el tipo 'hole' en la grilla para cada roca colocada
  for (const b of boulders) {
    grid[b.holeRow][b.holeCol] = 'hole'
  }

  return {
    level: lv,
    rows: grid.length,
    cols: grid[0].length,
    grid,
    start,
    exit,
    boulders,
    fogRadius: d.fogRadius,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    goal:
      boulders.length > 0
        ? 'Empuja las rocas a los huecos para despejar el camino a la salida.'
        : 'Encuentra el camino hasta la salida.',
    seed,
  }
}

export function isMazeWalkable(
  level: LaberintoLevel,
  boulders: MazeBoulder[],
  row: number,
  col: number
): boolean {
  if (row < 0 || row >= level.rows || col < 0 || col >= level.cols)
    return false
  const cell = level.grid[row][col]
  if (cell === 'wall') return false
  if (boulders.some((b) => !b.cleared && b.row === row && b.col === col))
    return false
  if (cell === 'hole') {
    // solo transitable si YA fue rellenado por una roca despejada en esa celda
    return boulders.some(
      (b) => b.cleared && b.holeRow === row && b.holeCol === col
    )
  }
  return true
}

export interface MazeMoveResult {
  player: MazeCoord
  boulders: MazeBoulder[]
  moved: boolean
  pushed: boolean
}

/** Aplica un movimiento del jugador (y empuja roca si corresponde) */
export function laberintoStep(
  level: LaberintoLevel,
  boulders: MazeBoulder[],
  player: MazeCoord,
  dir: Direction
): MazeMoveResult {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const targetRow = player.row + dr
  const targetCol = player.col + dc
  const noMove: MazeMoveResult = { player, boulders, moved: false, pushed: false }

  if (
    targetRow < 0 ||
    targetRow >= level.rows ||
    targetCol < 0 ||
    targetCol >= level.cols
  )
    return noMove
  if (level.grid[targetRow][targetCol] === 'wall') return noMove

  const boulderHere = boulders.find(
    (b) => !b.cleared && b.row === targetRow && b.col === targetCol
  )

  if (boulderHere) {
    const beyondRow = targetRow + dr
    const beyondCol = targetCol + dc
    if (
      beyondRow < 0 ||
      beyondRow >= level.rows ||
      beyondCol < 0 ||
      beyondCol >= level.cols
    )
      return noMove
    const beyondType = level.grid[beyondRow][beyondCol]
    if (beyondType === 'wall') return noMove
    const otherBoulder = boulders.find(
      (b) => !b.cleared && b.row === beyondRow && b.col === beyondCol
    )
    if (otherBoulder) return noMove

    if (beyondType === 'hole') {
      const nextBoulders = boulders.map((b) =>
        b.id === boulderHere.id
          ? { ...b, row: beyondRow, col: beyondCol, cleared: true }
          : b
      )
      return {
        player: { row: targetRow, col: targetCol },
        boulders: nextBoulders,
        moved: true,
        pushed: true,
      }
    }
    // piso normal: la roca se desliza una casilla
    const nextBoulders = boulders.map((b) =>
      b.id === boulderHere.id ? { ...b, row: beyondRow, col: beyondCol } : b
    )
    return {
      player: { row: targetRow, col: targetCol },
      boulders: nextBoulders,
      moved: true,
      pushed: true,
    }
  }

  if (!isMazeWalkable(level, boulders, targetRow, targetCol)) return noMove
  return {
    player: { row: targetRow, col: targetCol },
    boulders,
    moved: true,
    pushed: false,
  }
}

export function isMazeComplete(player: MazeCoord, exit: MazeCoord): boolean {
  return player.row === exit.row && player.col === exit.col
}

/** Celdas visibles según niebla de guerra (Chebyshev radius). fogRadius 0 = todo visible */
export function visibleMazeCells(
  level: LaberintoLevel,
  player: MazeCoord
): Set<number> {
  const visible = new Set<number>()
  const W = level.cols
  if (level.fogRadius <= 0) {
    for (let r = 0; r < level.rows; r++)
      for (let c = 0; c < level.cols; c++) visible.add(r * W + c)
    return visible
  }
  for (
    let r = Math.max(0, player.row - level.fogRadius);
    r <= Math.min(level.rows - 1, player.row + level.fogRadius);
    r++
  ) {
    for (
      let c = Math.max(0, player.col - level.fogRadius);
      c <= Math.min(level.cols - 1, player.col + level.fogRadius);
      c++
    ) {
      if (Math.max(Math.abs(r - player.row), Math.abs(c - player.col)) <= level.fogRadius) {
        visible.add(r * W + c)
      }
    }
  }
  return visible
}

export function calcLaberintoStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  moveLimit: number
): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ── 3.2 Croma: gemas de color que deben llegar a su meta ──
 *
 * Estilo "block jam" simplificado y garantizado resoluble: cada gema
 * empieza en su casilla meta (estado resuelto) y se desordena con
 * movimientos legales de una casilla, igual que shuffleBoard. Los
 * obstáculos son fijos y nunca se mueven ("obstruidos").
 */

export interface CromaColorDef {
  id: string
  hue: number
  label: string
}

export const GEM_COLORS: CromaColorDef[] = [
  { id: 'rosa', hue: 340, label: 'Rosa' },
  { id: 'cian', hue: 190, label: 'Cian' },
  { id: 'ambar', hue: 40, label: 'Ámbar' },
  { id: 'violeta', hue: 265, label: 'Violeta' },
  { id: 'lima', hue: 95, label: 'Lima' },
  { id: 'coral', hue: 12, label: 'Coral' },
  { id: 'azul', hue: 220, label: 'Azul' },
  { id: 'fucsia', hue: 320, label: 'Fucsia' },
  { id: 'oliva', hue: 70, label: 'Oliva' },
  { id: 'turquesa', hue: 172, label: 'Turquesa' },
]

export function gemHue(colorId: string): number {
  return GEM_COLORS.find((g) => g.id === colorId)?.hue ?? 200
}

export interface Gem {
  id: string
  color: string
  row: number
  col: number
}

export interface CromaGoal {
  color: string
  row: number
  col: number
}

export interface CromaLevel {
  level: number
  rows: number
  cols: number
  obstacles: MazeCoord[]
  gems: Gem[]
  goals: CromaGoal[]
  shuffleMoves: number
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function getCromaDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(5 + Math.floor(lv / 4), 11)
  const gemCount = Math.min(2 + Math.floor(lv / 2.4), GEM_COLORS.length)
  const obstacleCount = Math.min(Math.floor(lv / 1.6), Math.floor(size * size * 0.3))
  const shuffleMoves = Math.min(10 + lv * 4, 320)
  const moveLimit = Math.round(shuffleMoves * 1.9 + gemCount * 4)
  const targetSeconds = Math.max(18, Math.round(shuffleMoves * 0.9 + gemCount * 3))
  return { size, gemCount, obstacleCount, shuffleMoves, moveLimit, targetSeconds }
}

function isBorderCell(row: number, col: number, size: number) {
  return row === 0 || col === 0 || row === size - 1 || col === size - 1
}

export function generateCromaLevel(
  level: number,
  opts?: { seedSalt?: number }
): CromaLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 9100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getCromaDifficulty(lv)
  const size = d.size

  const borderCells: MazeCoord[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isBorderCell(r, c, size)) borderCells.push({ row: r, col: c })
    }
  }
  const borderShuffled = shuffledArray(borderCells, rng)
  const colors = shuffledArray(GEM_COLORS, rng).slice(0, d.gemCount)
  const goals: CromaGoal[] = colors.map((c, i) => ({
    color: c.id,
    row: borderShuffled[i].row,
    col: borderShuffled[i].col,
  }))
  const occupied = new Set(goals.map((g) => g.row * size + g.col))

  const interiorCells: MazeCoord[] = []
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (!occupied.has(r * size + c)) interiorCells.push({ row: r, col: c })
    }
  }
  const obstacles = shuffledArray(interiorCells, rng).slice(0, d.obstacleCount)
  for (const o of obstacles) occupied.add(o.row * size + o.col)

  // Estado resuelto: cada gema sobre su meta
  let gems: Gem[] = goals.map((g, i) => ({
    id: `g${i}`,
    color: g.color,
    row: g.row,
    col: g.col,
  }))

  const blocked = new Set(obstacles.map((o) => o.row * size + o.col))
  const dirs: Direction[] = ['up', 'down', 'left', 'right']

  let applied = 0
  let guard = 0
  while (applied < d.shuffleMoves && guard < d.shuffleMoves * 12) {
    guard++
    const gemIdx = Math.floor(rng() * gems.length)
    const dir = dirs[Math.floor(rng() * 4)]
    const { dr, dc } = DIRECTION_DELTA[dir]
    const gem = gems[gemIdx]
    const nr = gem.row + dr
    const nc = gem.col + dc
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
    if (blocked.has(nr * size + nc)) continue
    if (gems.some((g) => g.row === nr && g.col === nc)) continue
    gems = gems.map((g, i) => (i === gemIdx ? { ...g, row: nr, col: nc } : g))
    applied++
  }

  return {
    level: lv,
    rows: size,
    cols: size,
    obstacles,
    gems,
    goals,
    shuffleMoves: d.shuffleMoves,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    goal: 'Lleva cada gema a su meta del mismo color esquivando los bloques.',
    seed,
  }
}

export function cromaTryMove(
  level: CromaLevel,
  gems: Gem[],
  gemId: string,
  dir: Direction
): Gem[] | null {
  const gem = gems.find((g) => g.id === gemId)
  if (!gem) return null
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = gem.row + dr
  const nc = gem.col + dc
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return null
  if (level.obstacles.some((o) => o.row === nr && o.col === nc)) return null
  if (gems.some((g) => g.id !== gemId && g.row === nr && g.col === nc))
    return null
  return gems.map((g) => (g.id === gemId ? { ...g, row: nr, col: nc } : g))
}

export function cromaIsComplete(level: CromaLevel, gems: Gem[]): boolean {
  return gems.every((g) =>
    level.goals.some(
      (goal) => goal.color === g.color && goal.row === g.row && goal.col === g.col
    )
  )
}

export function calcCromaStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  shuffleMoves: number
): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= Math.max(shuffleMoves, 4) * 1.3) stars = 3
  return stars
}

/* ── 3.3 Pintar: colorea figuras con celdas obstruidas ──
 *
 * Sub-modo de Croma pensado para "colorear objetos de distintas formas":
 * cada nivel muestra una figura (silueta) con un patrón objetivo de
 * colores; algunas celdas empiezan "obstruidas" (con escombros) y deben
 * despejarse con varios toques antes de poder pintarse.
 */

export type PaintShapeId =
  | 'cuadro'
  | 'cruz'
  | 'diamante'
  | 'anillo'
  | 'corazon'
  | 'estrella'
  | 'reloj_arena'
  | 'mosaico'
  | 'anillo_grande'
  | 'copo'

/** Máscaras: '1' = celda activa de la figura, '0' = celda vacía (no se dibuja) */
export const PAINT_SHAPES: Record<PaintShapeId, string[]> = {
  cuadro: ['11111', '11111', '11111', '11111', '11111'],
  cruz: ['00100', '00100', '11111', '00100', '00100'],
  diamante: ['00100', '01110', '11111', '01110', '00100'],
  anillo: ['11111', '10001', '10001', '10001', '11111'],
  corazon: [
    '0110110',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ],
  estrella: [
    '0001000',
    '0001000',
    '1111111',
    '0111110',
    '0110110',
    '0100010',
    '1000001',
  ],
  reloj_arena: ['1111111', '0111110', '0011100', '0001000', '0011100', '0111110', '1111111'],
  mosaico: [
    '111111111',
    '111111111',
    '111111111',
    '111111111',
    '111111111',
    '111111111',
    '111111111',
    '111111111',
    '111111111',
  ],
  anillo_grande: [
    '111111111',
    '100000001',
    '101111101',
    '101000101',
    '101010101',
    '101000101',
    '101111101',
    '100000001',
    '111111111',
  ],
  copo: [
    '000101000',
    '000101000',
    '100101001',
    '010101010',
    '111111111',
    '010101010',
    '100101001',
    '000101000',
    '000101000',
  ],
}

const SMALL_SHAPE_ORDER: PaintShapeId[] = ['cuadro', 'cruz', 'diamante', 'anillo']
const BIG_SHAPE_ORDER: PaintShapeId[] = ['corazon', 'estrella', 'reloj_arena', 'mosaico', 'anillo_grande', 'copo']

const PAINT_SHAPE_ORDER: PaintShapeId[] = [
  'cuadro',
  'cruz',
  'diamante',
  'anillo',
  'corazon',
  'estrella',
  'reloj_arena',
]

export const PAINT_PALETTE: CromaColorDef[] = [
  { id: 'p1', hue: 340, label: 'Rosa' },
  { id: 'p2', hue: 190, label: 'Cian' },
  { id: 'p3', hue: 40, label: 'Ámbar' },
  { id: 'p4', hue: 265, label: 'Violeta' },
  { id: 'p5', hue: 95, label: 'Lima' },
  { id: 'p6', hue: 12, label: 'Coral' },
  { id: 'p7', hue: 220, label: 'Azul' },
  { id: 'p8', hue: 320, label: 'Fucsia' },
  { id: 'p9', hue: 0, label: 'Rojo' },
  { id: 'p10', hue: 60, label: 'Amarillo' },
  { id: 'p11', hue: 150, label: 'Esmeralda' },
  { id: 'p12', hue: 172, label: 'Turquesa' },
  { id: 'p13', hue: 205, label: 'Celeste' },
  { id: 'p14', hue: 285, label: 'Índigo' },
  { id: 'p15', hue: 20, label: 'Naranja' },
  { id: 'p16', hue: 300, label: 'Magenta' },
]

export interface PaintCell {
  row: number
  col: number
  target: string
  current: string | null
  locked: boolean
  clearsNeeded: number
  clearsDone: number
}

export interface PintarLevel {
  level: number
  shape: PaintShapeId
  rows: number
  cols: number
  cells: PaintCell[]
  palette: CromaColorDef[]
  targetSeconds: number
  goal: string
  seed: number
}

function shapeActiveCells(mask: string[]): MazeCoord[] {
  const cells: MazeCoord[] = []
  mask.forEach((rowStr, r) => {
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] === '1') cells.push({ row: r, col: c })
    }
  })
  return cells
}

export function getPintarDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const pool = lv <= 6 ? SMALL_SHAPE_ORDER : lv <= 14 ? PAINT_SHAPE_ORDER : BIG_SHAPE_ORDER
  const shape = pool[(lv - 1) % pool.length]
  const colorCount = Math.min(2 + Math.floor(lv / 2.2), PAINT_PALETTE.length)
  const obstructedRatio = Math.min(0.08 + lv * 0.016, 0.5)
  const clearsNeeded = lv < 8 ? 1 : lv < 18 ? 2 : lv < 30 ? 3 : 4
  const targetSeconds = Math.max(
    20,
    Math.round(shapeActiveCells(PAINT_SHAPES[shape]).length * 2.4)
  )
  return { shape, colorCount, obstructedRatio, clearsNeeded, targetSeconds }
}

export function generatePintarLevel(
  level: number,
  opts?: { seedSalt?: number }
): PintarLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 9700 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getPintarDifficulty(lv)
  const mask = PAINT_SHAPES[d.shape]
  const activeCells = shapeActiveCells(mask)
  const palette = PAINT_PALETTE.slice(0, d.colorCount)

  const cells: PaintCell[] = activeCells.map(({ row, col }) => {
    const target = palette[Math.floor(rng() * palette.length)].id
    const locked = rng() < d.obstructedRatio
    // color inicial deliberadamente distinto al objetivo para que haya algo que resolver
    let startIdx = Math.floor(rng() * palette.length)
    if (palette[startIdx].id === target && palette.length > 1) {
      startIdx = (startIdx + 1) % palette.length
    }
    return {
      row,
      col,
      target,
      current: locked ? null : palette[startIdx].id,
      locked,
      clearsNeeded: locked ? d.clearsNeeded : 0,
      clearsDone: 0,
    }
  })

  return {
    level: lv,
    shape: d.shape,
    rows: mask.length,
    cols: mask[0].length,
    cells,
    palette,
    targetSeconds: d.targetSeconds,
    goal: 'Despeja los escombros y pinta cada celda del color objetivo.',
    seed,
  }
}

/** Toca una celda: si está obstruida la despeja poco a poco; si no, avanza su color */
export function pintarTapCell(
  level: PintarLevel,
  row: number,
  col: number
): PintarLevel {
  const cells = level.cells.map((cell) => {
    if (cell.row !== row || cell.col !== col) return cell
    if (cell.locked) {
      const clearsDone = cell.clearsDone + 1
      if (clearsDone >= cell.clearsNeeded) {
        return { ...cell, locked: false, clearsDone, current: null }
      }
      return { ...cell, clearsDone }
    }
    const idx = level.palette.findIndex((p) => p.id === cell.current)
    const nextIdx = idx < 0 ? 0 : (idx + 1) % level.palette.length
    return { ...cell, current: level.palette[nextIdx].id }
  })
  return { ...level, cells }
}

export function pintarIsComplete(level: PintarLevel): boolean {
  return level.cells.every(
    (c) => !c.locked && c.current !== null && c.current === c.target
  )
}

export function pintarProgress(level: PintarLevel): { done: number; total: number } {
  const total = level.cells.length
  const done = level.cells.filter(
    (c) => !c.locked && c.current === c.target
  ).length
  return { done, total }
}

export function calcPintarStars(
  timeMs: number,
  targetSeconds: number,
  taps: number,
  cellCount: number
): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && taps <= cellCount * 2.2) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   4) DESPEJES — Motor de cuadrícula ampliado: Hielo, Interruptores,
      Teletransportadores, Láser y Circuitos
   ═══════════════════════════════════════════════════════════════════════════
 */

export type GridPos = MazeCoord

/* ── 4.1 Hielo — Ice Slide Puzzle ── */

export type IceCellType = 'wall' | 'ice' | 'floor' | 'goal'

export interface IceSlideLevel {
  level: number
  rows: number
  cols: number
  grid: IceCellType[][]
  start: MazeCoord
  target: MazeCoord
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function iceSlideTarget(level: IceSlideLevel, pos: MazeCoord, dir: Direction): MazeCoord {
  const { dr, dc } = DIRECTION_DELTA[dir]
  let cur = pos
  while (true) {
    const nr = cur.row + dr
    const nc = cur.col + dc
    if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) break
    if (level.grid[nr][nc] === 'wall') break
    cur = { row: nr, col: nc }
    if (level.grid[nr][nc] !== 'ice') break
  }
  return cur
}

export function iceSlideBfs(level: IceSlideLevel): MazeCoord[] | null {
  const W = level.cols
  const key = (p: MazeCoord) => p.row * W + p.col
  const startKey = key(level.start)
  const targetKey = key(level.target)
  const prev = new Map<number, number>()
  const seen = new Set<number>([startKey])
  const queue: MazeCoord[] = [level.start]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    const ck = key(cur)
    if (ck === targetKey) break
    for (const dir of dirs) {
      const next = iceSlideTarget(level, cur, dir)
      const nk = key(next)
      if (nk === ck) continue
      if (seen.has(nk)) continue
      seen.add(nk)
      prev.set(nk, ck)
      queue.push(next)
    }
  }
  if (!seen.has(targetKey)) return null
  const path: MazeCoord[] = []
  let cur = targetKey
  while (cur !== startKey) {
    path.push({ row: Math.floor(cur / W), col: cur % W })
    const p = prev.get(cur)
    if (p === undefined) return null
    cur = p
  }
  path.push(level.start)
  path.reverse()
  return path
}

export function isIceSlideSolvable(level: IceSlideLevel): boolean {
  return iceSlideBfs(level) !== null
}

export function getIceSlideDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(6 + Math.floor(lv / 3), 17)
  const obstacleRatio = Math.min(0.06 + lv * 0.013, 0.34)
  const moveLimit = Math.round(6 + lv * 0.9)
  const targetSeconds = Math.max(15, Math.round(20 + lv * 2.2))
  const minPathLength = Math.min(3 + Math.floor(lv / 2), 12)
  return { size, obstacleRatio, moveLimit, targetSeconds, minPathLength }
}

export function generateIceSlideLevel(level: number, opts?: { seedSalt?: number }): IceSlideLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getIceSlideDifficulty(lv)
  const maxAttempts = 40
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 10100 + (opts?.seedSalt ?? 0) + attempt * 733)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size
    const grid: IceCellType[][] = Array.from({ length: rows }, () => Array<IceCellType>(cols).fill('ice'))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = 'wall'
      }
    }
    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        if (rng() < d.obstacleRatio) grid[r][c] = rng() < 0.4 ? 'wall' : 'floor'
      }
    }
    const interior: MazeCoord[] = []
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (grid[r][c] !== 'wall') interior.push({ row: r, col: c })
      }
    }
    const shuffled = shuffledArray(interior, rng)
    if (shuffled.length < 2) continue
    const pairTries = Math.min(6, shuffled.length - 1)
    for (let pt = 0; pt < pairTries; pt++) {
      const start = shuffled[pt]
      const target = shuffled[shuffled.length - 1 - pt]
      if (start.row === target.row && start.col === target.col) continue
      const trialGrid = grid.map((row) => row.slice())
      trialGrid[start.row][start.col] = 'floor'
      trialGrid[target.row][target.col] = 'goal'
      const candidate: IceSlideLevel = {
        level: lv,
        rows,
        cols,
        grid: trialGrid,
        start,
        target,
        moveLimit: d.moveLimit,
        targetSeconds: d.targetSeconds,
        goal: 'Deslízate sobre el hielo hasta llegar a la meta.',
        seed,
      }
      const path = iceSlideBfs(candidate)
      if (path && path.length >= d.minPathLength) return candidate
    }
  }
  const rows = 7
  const cols = 7
  const grid: IceCellType[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? 'wall' : 'ice') as IceCellType
    )
  )
  grid[1][1] = 'floor'
  grid[rows - 2][cols - 2] = 'goal'
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: { row: 1, col: 1 },
    target: { row: rows - 2, col: cols - 2 },
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Deslízate sobre el hielo hasta llegar a la meta.',
    seed: levelSeed(lv, 10999),
  }
}

export function calcIceSlideStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ── 4.2 Interruptores — Switch Puzzle ── */

export interface SwitchDef {
  id: string
  row: number
  col: number
  doorIds: string[]
}

export interface DoorDef {
  id: string
  row: number
  col: number
  openInitially: boolean
}

export interface SwitchLevel {
  level: number
  rows: number
  cols: number
  grid: ('wall' | 'floor')[][]
  start: MazeCoord
  target: MazeCoord
  switches: SwitchDef[]
  doors: DoorDef[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export interface SwitchState {
  doorsOpen: Record<string, boolean>
}

export function switchInitialState(level: SwitchLevel): SwitchState {
  const doorsOpen: Record<string, boolean> = {}
  for (const d of level.doors) doorsOpen[d.id] = d.openInitially
  return { doorsOpen }
}

export function isSwitchWalkable(level: SwitchLevel, state: SwitchState, row: number, col: number): boolean {
  if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) return false
  if (level.grid[row][col] === 'wall') return false
  const door = level.doors.find((d) => d.row === row && d.col === col)
  if (door && !state.doorsOpen[door.id]) return false
  return true
}

export function switchStep(
  level: SwitchLevel,
  state: SwitchState,
  player: MazeCoord,
  dir: Direction
): { player: MazeCoord; state: SwitchState; moved: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  if (!isSwitchWalkable(level, state, nr, nc)) return { player, state, moved: false }
  let nextState = state
  const sw = level.switches.find((s) => s.row === nr && s.col === nc)
  if (sw) {
    const doorsOpen = { ...state.doorsOpen }
    for (const id of sw.doorIds) doorsOpen[id] = !doorsOpen[id]
    nextState = { doorsOpen }
  }
  return { player: { row: nr, col: nc }, state: nextState, moved: true }
}

export function switchIsComplete(level: SwitchLevel, player: MazeCoord): boolean {
  return player.row === level.target.row && player.col === level.target.col
}

export function isSwitchLevelSolvable(level: SwitchLevel): boolean {
  const doorIds = level.doors.map((d) => d.id)
  const bitFor = (state: SwitchState) =>
    doorIds.reduce((acc, id, i) => acc | ((state.doorsOpen[id] ? 1 : 0) << i), 0)
  const initial = switchInitialState(level)
  const startKey = `${level.start.row},${level.start.col},${bitFor(initial)}`
  const seen = new Set<string>([startKey])
  const queue: { player: MazeCoord; state: SwitchState }[] = [{ player: level.start, state: initial }]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    if (switchIsComplete(level, cur.player)) return true
    for (const dir of dirs) {
      const res = switchStep(level, cur.state, cur.player, dir)
      if (!res.moved) continue
      const k = `${res.player.row},${res.player.col},${bitFor(res.state)}`
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ player: res.player, state: res.state })
    }
  }
  return false
}

export function getSwitchDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(6 + Math.floor(lv / 3), 15)
  const switchCount = Math.min(1 + Math.floor(lv / 4), 6)
  const decoySwitches = lv >= 10 ? Math.min(Math.floor((lv - 10) / 5) + 1, 4) : 0
  const moveLimit = Math.round(size * size * 0.95 + switchCount * 12 + decoySwitches * 8)
  const targetSeconds = Math.max(20, Math.round(size * size * 1.15 + switchCount * 14 + decoySwitches * 10))
  return { size, switchCount, decoySwitches, moveLimit, targetSeconds }
}

export function generateSwitchLevel(level: number, opts?: { seedSalt?: number }): SwitchLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getSwitchDifficulty(lv)
  const maxAttempts = 40
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 11100 + (opts?.seedSalt ?? 0) + attempt * 619)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size
    const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, () => Array<'wall' | 'floor'>(cols).fill('floor'))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = 'wall'
      }
    }
    const barrierCol = Math.floor(cols / 2)
    for (let r = 1; r < rows - 1; r++) grid[r][barrierCol] = 'wall'

    const doors: DoorDef[] = []
    const gapRows = shuffledArray(
      Array.from({ length: rows - 2 }, (_, i) => i + 1),
      rng
    ).slice(0, d.switchCount)
    gapRows.forEach((r, i) => {
      grid[r][barrierCol] = 'floor'
      doors.push({ id: `door${i}`, row: r, col: barrierCol, openInitially: false })
    })
    if (doors.length === 0) continue

    const leftCells: MazeCoord[] = []
    const rightCells: MazeCoord[] = []
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < barrierCol; c++) leftCells.push({ row: r, col: c })
      for (let c = barrierCol + 1; c < cols - 1; c++) rightCells.push({ row: r, col: c })
    }
    if (!leftCells.length || !rightCells.length) continue
    const start = shuffledArray(leftCells, rng)[0]
    const target = shuffledArray(rightCells, rng)[0]

    const usedSwitchCells = new Set<number>()
    const switches: SwitchDef[] = doors.map((door, i) => {
      const options = shuffledArray(leftCells, rng).filter(
        (p) => !(p.row === start.row && p.col === start.col) && !usedSwitchCells.has(p.row * cols + p.col)
      )
      const pos = options[0] ?? leftCells[0]
      usedSwitchCells.add(pos.row * cols + pos.col)
      return { id: `sw${i}`, row: pos.row, col: pos.col, doorIds: [door.id] }
    })

    for (let i = 0; i < d.decoySwitches; i++) {
      const rightOptions = shuffledArray(rightCells, rng).filter(
        (p) => !(p.row === target.row && p.col === target.col) && !usedSwitchCells.has(p.row * cols + p.col)
      )
      const pos = rightOptions[0]
      if (!pos || doors.length === 0) continue
      usedSwitchCells.add(pos.row * cols + pos.col)
      const targetDoor = doors[Math.floor(rng() * doors.length)]
      switches.push({ id: `decoy${i}`, row: pos.row, col: pos.col, doorIds: [targetDoor.id] })
    }

    const candidate: SwitchLevel = {
      level: lv,
      rows,
      cols,
      grid,
      start,
      target,
      switches,
      doors,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Activa los interruptores para abrir las puertas y llega a la meta.',
      seed,
    }
    if (isSwitchLevelSolvable(candidate)) return candidate
  }
  const rows = 7
  const cols = 7
  const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? 'wall' : 'floor') as 'wall' | 'floor'
    )
  )
  const barrierCol = 3
  for (let r = 1; r < rows - 1; r++) grid[r][barrierCol] = 'wall'
  grid[3][barrierCol] = 'floor'
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: { row: 1, col: 1 },
    target: { row: 1, col: cols - 2 },
    switches: [{ id: 'sw0', row: 1, col: 1, doorIds: ['door0'] }],
    doors: [{ id: 'door0', row: 3, col: barrierCol, openInitially: false }],
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Activa los interruptores para abrir las puertas y llega a la meta.',
    seed: levelSeed(lv, 11999),
  }
}

export function calcSwitchStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ── 4.3 Teletransportadores — Teleport Puzzle ── */

export interface TeleportPortal {
  id: string
  row: number
  col: number
}

export interface TeleportPair {
  a: TeleportPortal
  b: TeleportPortal
}

export interface TeleportLevel {
  level: number
  rows: number
  cols: number
  grid: ('wall' | 'floor')[][]
  start: MazeCoord
  target: MazeCoord
  pairs: TeleportPair[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function teleportPortalAt(level: TeleportLevel, row: number, col: number): { pair: TeleportPair; isA: boolean } | null {
  for (const pair of level.pairs) {
    if (pair.a.row === row && pair.a.col === col) return { pair, isA: true }
    if (pair.b.row === row && pair.b.col === col) return { pair, isA: false }
  }
  return null
}

export function teleportStep(
  level: TeleportLevel,
  player: MazeCoord,
  dir: Direction
): { player: MazeCoord; moved: boolean; teleported: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return { player, moved: false, teleported: false }
  if (level.grid[nr][nc] === 'wall') return { player, moved: false, teleported: false }
  const portal = teleportPortalAt(level, nr, nc)
  if (portal) {
    const dest = portal.isA ? portal.pair.b : portal.pair.a
    return { player: { row: dest.row, col: dest.col }, moved: true, teleported: true }
  }
  return { player: { row: nr, col: nc }, moved: true, teleported: false }
}

export function teleportIsComplete(level: TeleportLevel, player: MazeCoord): boolean {
  return player.row === level.target.row && player.col === level.target.col
}

export function isTeleportLevelSolvable(level: TeleportLevel): boolean {
  const W = level.cols
  const key = (p: MazeCoord) => p.row * W + p.col
  const seen = new Set<number>([key(level.start)])
  const queue: MazeCoord[] = [level.start]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    if (teleportIsComplete(level, cur)) return true
    for (const dir of dirs) {
      const res = teleportStep(level, cur, dir)
      if (!res.moved) continue
      const k = key(res.player)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push(res.player)
    }
  }
  return false
}

export function getTeleportDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(6 + Math.floor(lv / 3), 15)
  const pairCount = Math.min(1 + Math.floor(lv / 3.5), 5)
  const wallRatio = Math.min(0.08 + lv * 0.011, 0.3)
  const moveLimit = Math.round(size * size * 0.75 + pairCount * 9)
  const targetSeconds = Math.max(20, Math.round(size * size + pairCount * 10))
  return { size, pairCount, wallRatio, moveLimit, targetSeconds }
}

export function generateTeleportLevel(level: number, opts?: { seedSalt?: number }): TeleportLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getTeleportDifficulty(lv)
  const maxAttempts = 40
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 12100 + (opts?.seedSalt ?? 0) + attempt * 541)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size
    const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, () => Array<'wall' | 'floor'>(cols).fill('floor'))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = 'wall'
      }
    }
    const interior: MazeCoord[] = []
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) interior.push({ row: r, col: c })
    }
    for (const p of interior) {
      if (rng() < d.wallRatio) grid[p.row][p.col] = 'wall'
    }
    const openCells = interior.filter((p) => grid[p.row][p.col] === 'floor')
    if (openCells.length < d.pairCount * 2 + 2) continue
    const shuffled = shuffledArray(openCells, rng)
    const start = shuffled[0]
    const target = shuffled[1]
    const pairs: TeleportPair[] = []
    let idx = 2
    for (let i = 0; i < d.pairCount; i++) {
      if (idx + 1 >= shuffled.length) break
      const a = shuffled[idx++]
      const b = shuffled[idx++]
      pairs.push({ a: { id: `t${i}a`, row: a.row, col: a.col }, b: { id: `t${i}b`, row: b.row, col: b.col } })
    }
    if (!pairs.length) continue
    const candidate: TeleportLevel = {
      level: lv,
      rows,
      cols,
      grid,
      start,
      target,
      pairs,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Usa los portales para llegar a la meta.',
      seed,
    }
    if (isTeleportLevelSolvable(candidate)) return candidate
  }
  const rows = 7
  const cols = 7
  const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? 'wall' : 'floor') as 'wall' | 'floor'
    )
  )
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: { row: 1, col: 1 },
    target: { row: rows - 2, col: cols - 2 },
    pairs: [{ a: { id: 't0a', row: 1, col: cols - 2 }, b: { id: 't0b', row: rows - 2, col: 1 } }],
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Usa los portales para llegar a la meta.',
    seed: levelSeed(lv, 12999),
  }
}

export function calcTeleportStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ── 4.4 Láser — Laser & Mirrors Puzzle ── */

export type MirrorOrientation = '/' | '\\'

export interface LaserMirror {
  id: string
  row: number
  col: number
  orientation: MirrorOrientation
  fixed: boolean
}

export interface LaserLevel {
  level: number
  rows: number
  cols: number
  walls: MazeCoord[]
  source: { row: number; col: number; dir: Direction }
  target: MazeCoord
  mirrors: LaserMirror[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

const MIRROR_REFLECT: Record<MirrorOrientation, Record<Direction, Direction>> = {
  '/': { up: 'right', right: 'up', down: 'left', left: 'down' },
  '\\': { up: 'left', left: 'up', down: 'right', right: 'down' },
}

export function simulateLaser(level: LaserLevel, mirrors: LaserMirror[]): MazeCoord[] {
  const wallSet = new Set(level.walls.map((w) => w.row * level.cols + w.col))
  const mirrorMap = new Map<number, LaserMirror>()
  for (const m of mirrors) mirrorMap.set(m.row * level.cols + m.col, m)
  const path: MazeCoord[] = []
  let row = level.source.row
  let col = level.source.col
  let dir: Direction = level.source.dir
  const maxSteps = level.rows * level.cols * 4
  for (let step = 0; step < maxSteps; step++) {
    const { dr, dc } = DIRECTION_DELTA[dir]
    row += dr
    col += dc
    if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) break
    const key = row * level.cols + col
    path.push({ row, col })
    if (wallSet.has(key)) break
    const mirror = mirrorMap.get(key)
    if (mirror) dir = MIRROR_REFLECT[mirror.orientation][dir]
    if (row === level.target.row && col === level.target.col) break
  }
  return path
}

export function laserHitsTarget(level: LaserLevel, mirrors: LaserMirror[]): boolean {
  const path = simulateLaser(level, mirrors)
  return path.some((p) => p.row === level.target.row && p.col === level.target.col)
}

export function toggleMirror(mirrors: LaserMirror[], id: string): LaserMirror[] {
  return mirrors.map((m) => (m.id === id && !m.fixed ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m))
}

function laserOrientationForBend(from: Direction, to: Direction): MirrorOrientation | null {
  const pairs: [Direction, Direction, MirrorOrientation][] = [
    ['right', 'up', '/'],
    ['up', 'right', '/'],
    ['left', 'down', '/'],
    ['down', 'left', '/'],
    ['right', 'down', '\\'],
    ['down', 'right', '\\'],
    ['left', 'up', '\\'],
    ['up', 'left', '\\'],
  ]
  for (const [f, t, o] of pairs) if (f === from && t === to) return o
  return null
}

export function getLaserDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(6 + Math.floor(lv / 3.5), 13)
  const bendCount = Math.min(1 + Math.floor(lv / 3), 7)
  const moveLimit = 0
  const targetSeconds = Math.max(20, Math.round(20 + lv * 2.4))
  return { size, bendCount, moveLimit, targetSeconds }
}

export function generateLaserLevel(level: number, opts?: { seedSalt?: number }): LaserLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getLaserDifficulty(lv)
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 13100 + (opts?.seedSalt ?? 0) + attempt * 467)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size
    const startDir: Direction = 'right'
    const source: { row: number; col: number; dir: Direction } = {
      row: Math.floor(rows / 2),
      col: 0,
      dir: startDir,
    }

    let curRow: number = source.row
    let curCol: number = source.col
    let curDir: Direction = source.dir
    const mirrors: LaserMirror[] = []
    let ok = true
    for (let i = 0; i < d.bendCount; i++) {
      const dirsAvail: Direction[] =
        curDir === 'up' || curDir === 'down' ? ['left', 'right'] : ['up', 'down']
      const nextDir: Direction = dirsAvail[Math.floor(rng() * dirsAvail.length)]
      const orientation = laserOrientationForBend(curDir, nextDir)
      if (!orientation) {
        ok = false
        break
      }
      const { dr, dc } = DIRECTION_DELTA[curDir]
      const steps = 1 + Math.floor(rng() * 2)
      let br = curRow
      let bc = curCol
      for (let s = 0; s < steps; s++) {
        br += dr
        bc += dc
      }
      if (br <= 0 || br >= rows - 1 || bc <= 0 || bc >= cols - 1) {
        ok = false
        break
      }
      mirrors.push({ id: `m${i}`, row: br, col: bc, orientation, fixed: false })
      curRow = br
      curCol = bc
      curDir = nextDir
    }
    if (!ok) continue
    const { dr, dc } = DIRECTION_DELTA[curDir]
    const finalSteps = 1 + Math.floor(rng() * 2)
    let tr = curRow
    let tc = curCol
    for (let s = 0; s < finalSteps; s++) {
      tr += dr
      tc += dc
    }
    if (tr <= 0 || tr >= rows - 1 || tc <= 0 || tc >= cols - 1) continue
    if (mirrors.some((m) => m.row === tr && m.col === tc)) continue

    const target: MazeCoord = { row: tr, col: tc }
    const candidate: LaserLevel = {
      level: lv,
      rows,
      cols,
      walls: [],
      source,
      target,
      mirrors,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Gira los espejos para dirigir el láser hasta el objetivo.',
      seed,
    }
    if (!laserHitsTarget(candidate, mirrors)) continue

    const scrambled = mirrors.map((m) =>
      rng() < 0.6 ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m
    )
    if (laserHitsTarget(candidate, scrambled)) continue
    return { ...candidate, mirrors: scrambled }
  }
  const rows = 7
  const cols = 7
  const source = { row: 3, col: 0, dir: 'right' as Direction }
  const mirrors: LaserMirror[] = [{ id: 'm0', row: 3, col: 3, orientation: '/', fixed: false }]
  return {
    level: lv,
    rows,
    cols,
    walls: [],
    source,
    target: { row: 1, col: 3 },
    mirrors,
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Gira los espejos para dirigir el láser hasta el objetivo.',
    seed: levelSeed(lv, 13999),
  }
}

export function isLaserLevelSolvable(level: LaserLevel): boolean {
  const rotatable = level.mirrors.filter((m) => !m.fixed)
  const n = Math.min(rotatable.length, 10)
  for (let mask = 0; mask < 1 << n; mask++) {
    const trial = level.mirrors.map((m) => {
      if (m.fixed) return m
      const idx = rotatable.indexOf(m)
      if (idx < 0 || idx >= n) return m
      const flip = (mask >> idx) & 1
      return flip ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m
    })
    if (laserHitsTarget(level, trial)) return true
  }
  return false
}

export function calcLaserStars(timeMs: number, targetSeconds: number, moves: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= 6) stars = 3
  return stars
}

/* ── 4.5 Circuitos — Circuit Puzzle ── */

export type CircuitPieceKind = 'straight' | 'corner' | 't' | 'cross' | 'source' | 'target' | 'empty'

export interface CircuitPiece {
  row: number
  col: number
  kind: CircuitPieceKind
  rotation: 0 | 90 | 180 | 270
  fixed: boolean
}

export interface CircuitLevel {
  level: number
  rows: number
  cols: number
  pieces: CircuitPiece[][]
  source: MazeCoord
  target: MazeCoord
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

const BASE_CONNECTIONS: Record<CircuitPieceKind, Direction[]> = {
  straight: ['up', 'down'],
  corner: ['up', 'right'],
  t: ['left', 'up', 'right'],
  cross: ['up', 'down', 'left', 'right'],
  source: ['right'],
  target: ['left'],
  empty: [],
}

const DIR_ROTATE: Record<Direction, Direction> = { up: 'right', right: 'down', down: 'left', left: 'up' }
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function pieceConnections(piece: CircuitPiece): Direction[] {
  const steps = piece.rotation / 90
  let dirs = BASE_CONNECTIONS[piece.kind]
  for (let i = 0; i < steps; i++) dirs = dirs.map((d) => DIR_ROTATE[d])
  return dirs
}

export function rotateCircuitPiece(level: CircuitLevel, row: number, col: number): CircuitLevel {
  const pieces = level.pieces.map((r) => r.map((p) => ({ ...p })))
  const target = pieces[row][col]
  if (target.fixed) return level
  target.rotation = ((target.rotation + 90) % 360) as 0 | 90 | 180 | 270
  return { ...level, pieces }
}

export function isCircuitComplete(level: CircuitLevel): boolean {
  const W = level.cols
  const key = (r: number, c: number) => r * W + c
  const seen = new Set<number>([key(level.source.row, level.source.col)])
  const queue: MazeCoord[] = [level.source]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    const piece = level.pieces[cur.row][cur.col]
    const dirs = pieceConnections(piece)
    for (const dir of dirs) {
      const { dr, dc } = DIRECTION_DELTA[dir]
      const nr = cur.row + dr
      const nc = cur.col + dc
      if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) continue
      const neighbor = level.pieces[nr][nc]
      const neighborDirs = pieceConnections(neighbor)
      if (!neighborDirs.includes(OPPOSITE[dir])) continue
      const k = key(nr, nc)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ row: nr, col: nc })
    }
  }
  return seen.has(key(level.target.row, level.target.col))
}

function dirBetween(a: MazeCoord, b: MazeCoord): Direction {
  if (b.row < a.row) return 'up'
  if (b.row > a.row) return 'down'
  if (b.col < a.col) return 'left'
  return 'right'
}

function rotationForCorner(d1: Direction, d2: Direction): 0 | 90 | 180 | 270 {
  const sets: [0 | 90 | 180 | 270, Direction, Direction][] = [
    [0, 'up', 'right'],
    [90, 'right', 'down'],
    [180, 'down', 'left'],
    [270, 'left', 'up'],
  ]
  const want = new Set([d1, d2])
  for (const [rotation, a, b] of sets) {
    if (want.has(a) && want.has(b) && want.size === 2) return rotation
  }
  return 0
}

export function getCircuitDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(5 + Math.floor(lv / 3), 13)
  const bends = Math.min(1 + Math.floor(lv / 3), 8)
  const moveLimit = 0
  const targetSeconds = Math.max(20, Math.round(15 + lv * 2.4))
  return { size, bends, moveLimit, targetSeconds }
}

export function generateCircuitLevel(level: number, opts?: { seedSalt?: number }): CircuitLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getCircuitDifficulty(lv)
  const maxAttempts = 20
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 14100 + (opts?.seedSalt ?? 0) + attempt * 823)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size

    const source: MazeCoord = { row: Math.floor(rows / 2), col: 0 }
    const occupied = new Set<number>([source.row * cols + source.col])
    const path: MazeCoord[] = [source]
    let cur = { ...source }
    let curDir: Direction = 'right'
    let ok = true

    for (let bend = 0; bend < d.bends && ok; bend++) {
      const dirsAvail: Direction[] =
        curDir === 'up' || curDir === 'down' ? ['left', 'right'] : ['up', 'down']
      const candidates = shuffledArray(dirsAvail, rng)
      let moved = false
      for (const nextDir of candidates) {
        const { dr, dc } = DIRECTION_DELTA[nextDir]
        const steps = 1 + Math.floor(rng() * 2)
        const trial: MazeCoord[] = []
        let tr = cur.row
        let tc = cur.col
        let stepOk = true
        for (let s = 0; s < steps; s++) {
          tr += dr
          tc += dc
          if (tr <= 0 || tr >= rows - 1 || tc < 0 || tc >= cols - 1) {
            stepOk = false
            break
          }
          if (occupied.has(tr * cols + tc)) {
            stepOk = false
            break
          }
          trial.push({ row: tr, col: tc })
        }
        if (!stepOk || trial.length === 0) continue
        for (const p of trial) {
          occupied.add(p.row * cols + p.col)
          path.push(p)
        }
        cur = trial[trial.length - 1]
        curDir = nextDir
        moved = true
        break
      }
      if (!moved) {
        const { dc } = DIRECTION_DELTA['right']
        const tr = cur.row
        const tc = cur.col + dc
        if (tc >= cols - 1 || occupied.has(tr * cols + tc)) {
          ok = false
          break
        }
        occupied.add(tr * cols + tc)
        path.push({ row: tr, col: tc })
        cur = { row: tr, col: tc }
        curDir = 'right'
      }
    }
    if (!ok) continue

    while (cur.col < cols - 1) {
      const nr = cur.row
      const nc = cur.col + 1
      if (occupied.has(nr * cols + nc)) {
        ok = false
        break
      }
      occupied.add(nr * cols + nc)
      path.push({ row: nr, col: nc })
      cur = { row: nr, col: nc }
      curDir = 'right'
    }
    if (!ok) continue

    const target: MazeCoord = { ...cur }
    if (path.length < 3) continue

    const pieces: CircuitPiece[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        row: r,
        col: c,
        kind: 'empty' as CircuitPieceKind,
        rotation: 0 as const,
        fixed: true,
      }))
    )

    for (let i = 0; i < path.length; i++) {
      const cell = path[i]
      const prev = path[i - 1]
      const next = path[i + 1]
      let kind: CircuitPieceKind = 'straight'
      let rotation: 0 | 90 | 180 | 270 = 0
      let fixed = false

      if (i === 0) {
        kind = 'source'
        rotation = 0
        fixed = true
      } else if (i === path.length - 1) {
        kind = 'target'
        rotation = 0
        fixed = true
      } else {
        const inDir = dirBetween(prev, cell)
        const outDir = dirBetween(cell, next)
        if (inDir === outDir) {
          kind = 'straight'
          rotation = inDir === 'left' || inDir === 'right' ? 90 : 0
        } else {
          kind = 'corner'
          rotation = rotationForCorner(OPPOSITE[inDir], outDir)
        }
      }
      pieces[cell.row][cell.col] = { row: cell.row, col: cell.col, kind, rotation, fixed }
    }

    const solved: CircuitLevel = {
      level: lv,
      rows,
      cols,
      pieces,
      source,
      target,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Gira las piezas para conectar la fuente con el objetivo.',
      seed,
    }

    let scrambledPieces = pieces.map((r) =>
      r.map((p) =>
        p.fixed || p.kind === 'empty'
          ? p
          : { ...p, rotation: ([0, 90, 180, 270] as const)[Math.floor(rng() * 4)] }
      )
    )
    let scrambled: CircuitLevel = { ...solved, pieces: scrambledPieces }
    if (isCircuitComplete(scrambled)) {
      const rotatableCells: MazeCoord[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = scrambledPieces[r][c]
          if (!p.fixed && p.kind !== 'empty') rotatableCells.push({ row: r, col: c })
        }
      }
      if (rotatableCells.length > 0) {
        const pick = rotatableCells[Math.floor(rng() * rotatableCells.length)]
        scrambledPieces = scrambledPieces.map((row, r) =>
          row.map((p, c) =>
            r === pick.row && c === pick.col
              ? { ...p, rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
              : p
          )
        )
        scrambled = { ...solved, pieces: scrambledPieces }
      }
    }
    return scrambled
  }

  const rows = 7
  const cols = 7
  const source: MazeCoord = { row: 3, col: 0 }
  const target: MazeCoord = { row: 3, col: cols - 1 }
  const pieces: CircuitPiece[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 3 && c === 0) return { row: r, col: c, kind: 'source' as CircuitPieceKind, rotation: 0 as const, fixed: true }
      if (r === 3 && c === cols - 1) return { row: r, col: c, kind: 'target' as CircuitPieceKind, rotation: 0 as const, fixed: true }
      if (r === 3) return { row: r, col: c, kind: 'straight' as CircuitPieceKind, rotation: 90 as const, fixed: false }
      return { row: r, col: c, kind: 'empty' as CircuitPieceKind, rotation: 0 as const, fixed: true }
    })
  )
  return {
    level: lv,
    rows,
    cols,
    pieces,
    source,
    target,
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Gira las piezas para conectar la fuente con el objetivo.',
    seed: levelSeed(lv, 14999),
  }
}

export function calcCircuitStars(timeMs: number, targetSeconds: number, rotations: number, pieceCount: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && rotations <= pieceCount * 2) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   5) Personaje — piel/género configurable durante la partida
   ═══════════════════════════════════════════════════════════════════════════
 */

export const PLAYER_SKINS: string[] = [
  '🧑',
  '👨',
  '👩',
  '👨🏻',
  '👨🏼',
  '👨🏽',
  '👨🏾',
  '👨🏿',
  '👩🏻',
  '👩🏼',
  '👩🏽',
  '👩🏾',
  '👩🏿',
]

const PLAYER_SKIN_KEY = 'gco:despejes-player-skin'

export function loadPlayerSkin(): string {
  try {
    const raw = localStorage.getItem(PLAYER_SKIN_KEY)
    if (raw && PLAYER_SKINS.includes(raw)) return raw
  } catch {
    /* localStorage no disponible: se usa el valor por defecto */
  }
  return PLAYER_SKINS[0]
}

export function savePlayerSkin(skin: string): void {
  try {
    if (PLAYER_SKINS.includes(skin)) localStorage.setItem(PLAYER_SKIN_KEY, skin)
  } catch {
    /* se ignora: la selección queda solo en memoria para esta sesión */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   6) CAMINO ÚNICO — Hamiltonian Path Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * El jugador debe recorrer cada casilla transitable exactamente una vez y
 * terminar en la meta. El generador construye directamente una ruta que
 * cubre el tablero completo (variantes de recorrido en zigzag / serpiente
 * sembradas por semilla), lo que garantiza matemáticamente que el nivel
 * siempre tiene solución sin depender de reintentos aleatorios.
 */

export type PathUniqueCellType = 'wall' | 'floor'

export interface PathUniqueLevel {
  level: number
  rows: number
  cols: number
  grid: PathUniqueCellType[][]
  start: MazeCoord
  target: MazeCoord
  totalWalkable: number
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function getPathUniqueDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const base =
    lv <= 2 ? 3 : lv <= 5 ? 4 : lv <= 9 ? 5 : lv <= 14 ? 6 : lv <= 20 ? 7 : lv <= 27 ? 8 : lv <= 35 ? 9 : 10
  const rows = Math.min(base, 11)
  const cols = Math.min(base + (lv % 2 === 0 ? 1 : 0), 12)
  const moveLimit = 0
  const targetSeconds = Math.max(15, Math.round(rows * cols * 1.7))
  return { rows, cols, moveLimit, targetSeconds }
}

function buildSnakePath(rows: number, cols: number, rowMajor: boolean, reverseAlt: boolean, reverseMain: boolean): MazeCoord[] {
  const path: MazeCoord[] = []
  if (rowMajor) {
    for (let r = 0; r < rows; r++) {
      const flip = r % 2 === 0 !== reverseAlt
      if (flip) {
        for (let c = 0; c < cols; c++) path.push({ row: r, col: c })
      } else {
        for (let c = cols - 1; c >= 0; c--) path.push({ row: r, col: c })
      }
    }
  } else {
    for (let c = 0; c < cols; c++) {
      const flip = c % 2 === 0 !== reverseAlt
      if (flip) {
        for (let r = 0; r < rows; r++) path.push({ row: r, col: c })
      } else {
        for (let r = rows - 1; r >= 0; r--) path.push({ row: r, col: c })
      }
    }
  }
  return reverseMain ? path.slice().reverse() : path
}

/**
 * Verificador genérico de solvencia (búsqueda con backtracking acotada).
 * No se usa en la generación normal -porque la construcción ya garantiza
 * una solución- pero queda disponible como validación matemática real,
 * tal como en el resto de los generadores del motor.
 */
export function isPathUniqueSolvable(level: PathUniqueLevel, maxNodes = 300000): boolean {
  const rows = level.rows
  const cols = level.cols
  const total = level.totalWalkable
  const visited: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  let nodes = 0
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]
  function dfs(r: number, c: number, count: number): boolean {
    nodes++
    if (nodes > maxNodes) return false
    if (count === total) return r === level.target.row && c === level.target.col
    for (const [dr, dc] of dirs) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      if (level.grid[nr][nc] === 'wall') continue
      if (visited[nr][nc]) continue
      visited[nr][nc] = true
      if (dfs(nr, nc, count + 1)) return true
      visited[nr][nc] = false
    }
    return false
  }
  visited[level.start.row][level.start.col] = true
  return dfs(level.start.row, level.start.col, 1)
}

export function generatePathUniqueLevel(level: number, opts?: { seedSalt?: number }): PathUniqueLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 16100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getPathUniqueDifficulty(lv)
  const rows = d.rows
  const cols = d.cols

  const rowMajor = rng() < 0.5
  const reverseAlt = rng() < 0.5
  const reverseMain = rng() < 0.5
  const finalPath = buildSnakePath(rows, cols, rowMajor, reverseAlt, reverseMain)

  const grid: PathUniqueCellType[][] = Array.from({ length: rows }, () => Array<PathUniqueCellType>(cols).fill('floor'))
  const start = finalPath[0]
  const target = finalPath[finalPath.length - 1]

  return {
    level: lv,
    rows,
    cols,
    grid,
    start,
    target,
    totalWalkable: rows * cols,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    goal: 'Recorre cada casilla una sola vez y termina en la meta.',
    seed,
  }
}

export function pathUniqueStep(
  level: PathUniqueLevel,
  visited: Set<number>,
  player: MazeCoord,
  dir: Direction
): { player: MazeCoord; visited: Set<number>; moved: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  const noMove = { player, visited, moved: false }
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return noMove
  if (level.grid[nr][nc] === 'wall') return noMove
  const key = nr * level.cols + nc
  if (visited.has(key)) return noMove
  const isTarget = nr === level.target.row && nc === level.target.col
  if (isTarget && visited.size < level.totalWalkable - 1) return noMove
  const nextVisited = new Set(visited)
  nextVisited.add(key)
  return { player: { row: nr, col: nc }, visited: nextVisited, moved: true }
}

export function pathUniqueInitialVisited(level: PathUniqueLevel): Set<number> {
  return new Set<number>([level.start.row * level.cols + level.start.col])
}

export function pathUniqueIsComplete(level: PathUniqueLevel, player: MazeCoord, visited: Set<number>): boolean {
  return (
    player.row === level.target.row &&
    player.col === level.target.col &&
    visited.size === level.totalWalkable
  )
}

export function calcPathUniqueStars(
  moves: number,
  timeMs: number,
  targetSeconds: number,
  totalWalkable: number
): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= totalWalkable * 1.05) stars = 3
  return stars
}