/**
 * RompecabezasGame — GymCogOrigins (autocontenido)
 * Motor + UI + dificultades + rotación + snap en grupos + historial ilimitado
 */
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function levelSeed(level: number, salt: number): number {
  let h = (level * 2654435761) ^ (salt * 1597334677)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

export type PieceShape =
  | 'classic' | 'round' | 'pointed' | 'wavy' | 'soft' | 'square'
  | 'zigzag' | 'scallop' | 'arrow' | 'diamond' | 'cloud' | 'notch'
  | 'double' | 'smooth' | 'spike' | 'petal'
  | 'bevel' | 'ripple' | 'crest' | 'valley' | 'blade' | 'knob'
  | 'tile' | 'mosaic' | 'bubble' | 'flame' | 'leaf' | 'star'
  | 'cross' | 'wave2' | 'puzzle' | 'brick'
export interface PieceShapeMeta { id: PieceShape; label: string; emoji: string; desc: string }
export const PIECE_SHAPES: PieceShapeMeta[] = [
  { id: 'classic', label: 'Clásica', emoji: '🧩', desc: 'Pestañas tradicionales' },
  { id: 'round', label: 'Redonda', emoji: '⭘', desc: 'Bordes en arco' },
  { id: 'pointed', label: 'Puntiaguda', emoji: '✦', desc: 'Puntas geométricas' },
  { id: 'wavy', label: 'Ondulada', emoji: '〰', desc: 'Curvas fluidas' },
  { id: 'soft', label: 'Suave', emoji: '☁️', desc: 'Pestañas amplias' },
  { id: 'square', label: 'Cuadrada', emoji: '⬜', desc: 'Pestañas rectas' },
  { id: 'zigzag', label: 'Zigzag', emoji: '⚡', desc: 'Dientes angulosos' },
  { id: 'scallop', label: 'Vieira', emoji: '🐚', desc: 'Ondas de concha' },
  { id: 'arrow', label: 'Flecha', emoji: '➤', desc: 'Pestañas en flecha' },
  { id: 'diamond', label: 'Diamante', emoji: '◆', desc: 'Rombo central' },
  { id: 'cloud', label: 'Nube', emoji: '☁', desc: 'Bordes esponjosos' },
  { id: 'notch', label: 'Muesca', emoji: '▮', desc: 'Corte rectangular' },
  { id: 'double', label: 'Doble', emoji: '∞', desc: 'Dos pestañas' },
  { id: 'smooth', label: 'Lisa', emoji: '◯', desc: 'Casi plana' },
  { id: 'spike', label: 'Púa', emoji: '▲', desc: 'Punta aguda' },
  { id: 'petal', label: 'Pétalo', emoji: '🌸', desc: 'Forma floral' },
  { id: 'bevel', label: 'Bisel', emoji: '⬡', desc: 'Corte en ángulo' },
  { id: 'ripple', label: 'Rizo', emoji: '≈', desc: 'Ondas suaves dobles' },
  { id: 'crest', label: 'Cresta', emoji: '⌢', desc: 'Arco alto' },
  { id: 'valley', label: 'Valle', emoji: '⌣', desc: 'Hoyo amplio' },
  { id: 'blade', label: 'Hoja', emoji: '🗡️', desc: 'Filo alargado' },
  { id: 'knob', label: 'Pomo', emoji: '🔘', desc: 'Botón circular' },
  { id: 'tile', label: 'Baldosa', emoji: '▦', desc: 'Corte de azulejo' },
  { id: 'mosaic', label: 'Mosaico', emoji: '🟫', desc: 'Escalonado' },
  { id: 'bubble', label: 'Burbuja', emoji: '🫧', desc: 'Globo suave' },
  { id: 'flame', label: 'Llama', emoji: '🔥', desc: 'Punta ondulada' },
  { id: 'leaf', label: 'Hoja', emoji: '🍃', desc: 'Curva vegetal' },
  { id: 'star', label: 'Estrella', emoji: '⭐', desc: 'Puntas de estrella' },
  { id: 'cross', label: 'Cruz', emoji: '✚', desc: 'Saliente cruzado' },
  { id: 'wave2', label: 'Marea', emoji: '🌊', desc: 'Doble ola' },
  { id: 'puzzle', label: 'Puzzle', emoji: '🧩', desc: 'Clásica marcada' },
  { id: 'brick', label: 'Ladrillo', emoji: '🧱', desc: 'Corte de muro' },
]

export type Difficulty = 'facil' | 'normal' | 'dificil'
export const DIFFICULTY_META: Record<Difficulty, { label: string; emoji: string; desc: string }> = {
  facil: { label: 'Fácil', emoji: '🌱', desc: 'Sin rotación' },
  normal: { label: 'Normal', emoji: '⚡', desc: 'Piezas rotadas; toca para girar' },
  dificil: { label: 'Difícil', emoji: '🔥', desc: 'Rotación + giro automático cada 20 s' },
}

export type ImageCategory = 'naturaleza' | 'animales' | 'libros' | 'ilustraciones' | 'abstracto' | 'custom'
export interface PuzzleImage {
  id: string; name: string; category: ImageCategory; src: string
  isCustom?: boolean; fallbackHue: number; fallbackHue2: number
  /** Dimensiones naturales para respetar el aspect ratio real de la imagen */
  naturalWidth?: number
  naturalHeight?: number
}
export const CATEGORY_LABELS: Record<ImageCategory, string> = {
  naturaleza: 'Naturaleza', animales: 'Animales', libros: 'Libros antiguos',
  ilustraciones: 'Ilustraciones', abstracto: 'Abstracto', custom: 'Mis imágenes',
}
export const CATEGORY_EMOJI: Record<ImageCategory, string> = {
  naturaleza: '🌿', animales: '🦊', libros: '📖', ilustraciones: '🎨', abstracto: '🌀', custom: '🖼️',
}
export const CATEGORY_ORDER: ImageCategory[] = ['naturaleza', 'animales', 'ilustraciones', 'libros', 'abstracto']
export const DEFAULT_IMAGES: PuzzleImage[] = [
  { id: 'imgrom1', name: 'Bosque en primavera', category: 'naturaleza', src: '/puzzles/imgrom1.webp', fallbackHue: 140, fallbackHue2: 165 },
  { id: 'imgrom2', name: 'Montañas al atardecer', category: 'naturaleza', src: '/puzzles/imgrom2.webp', fallbackHue: 25, fallbackHue2: 340 },
  { id: 'imgrom3', name: 'Lago de cristal', category: 'naturaleza', src: '/puzzles/imgrom3.webp', fallbackHue: 195, fallbackHue2: 175 },
  { id: 'imgrom4', name: 'Aurora boreal', category: 'naturaleza', src: '/puzzles/imgrom4.webp', fallbackHue: 170, fallbackHue2: 260 },
  { id: 'imgrom5', name: 'Zorro del bosque', category: 'animales', src: '/puzzles/imgrom5.webp', fallbackHue: 20, fallbackHue2: 35 },
  { id: 'imgrom6', name: 'Gato curioso', category: 'animales', src: '/puzzles/imgrom6.webp', fallbackHue: 35, fallbackHue2: 45 },
  { id: 'imgrom21', name: 'Muchos gatos jugando', category: 'animales', src: '/puzzles/imgrom21.webp', fallbackHue: 35, fallbackHue2: 140 },
  { id: 'imgrom7', name: 'Búho nocturno', category: 'animales', src: '/puzzles/imgrom7.webp', fallbackHue: 250, fallbackHue2: 220 },
  { id: 'imgrom8', name: 'Ciervo en el claro', category: 'animales', src: '/puzzles/imgrom8.webp', fallbackHue: 30, fallbackHue2: 100 },
  { id: 'imgrom9', name: 'Dragón antiguo', category: 'ilustraciones', src: '/puzzles/imgrom9.webp', fallbackHue: 280, fallbackHue2: 320 },
  { id: 'imgrom10', name: 'Barco en la niebla', category: 'ilustraciones', src: '/puzzles/imgrom10.webp', fallbackHue: 210, fallbackHue2: 195 },
  { id: 'imgrom11', name: 'Fénix de fuego', category: 'ilustraciones', src: '/puzzles/imgrom11.webp', fallbackHue: 15, fallbackHue2: 45 },
  { id: 'imgrom12', name: 'Castillo encantado', category: 'ilustraciones', src: '/puzzles/imgrom12.webp', fallbackHue: 260, fallbackHue2: 290 },
  { id: 'imgrom13', name: 'Grabado renacentista', category: 'libros', src: '/puzzles/imgrom13.webp', fallbackHue: 40, fallbackHue2: 30 },
  { id: 'imgrom14', name: 'Mapa del tesoro', category: 'libros', src: '/puzzles/imgrom14.webp', fallbackHue: 45, fallbackHue2: 35 },
  { id: 'imgrom15', name: 'Manuscrito iluminado', category: 'libros', src: '/puzzles/imgrom15.webp', fallbackHue: 50, fallbackHue2: 15 },
  { id: 'imgrom16', name: 'Biblioteca olvidada', category: 'libros', src: '/puzzles/imgrom16.webp', fallbackHue: 35, fallbackHue2: 20 },
  { id: 'imgrom17', name: 'Flor abstracta', category: 'abstracto', src: '/puzzles/imgrom17.webp', fallbackHue: 320, fallbackHue2: 280 },
  { id: 'imgrom18', name: 'Ondas de color', category: 'abstracto', src: '/puzzles/imgrom18.webp', fallbackHue: 200, fallbackHue2: 320 },
  { id: 'imgrom19', name: 'Geometría fluida', category: 'abstracto', src: '/puzzles/imgrom19.webp', fallbackHue: 265, fallbackHue2: 190 },
  { id: 'imgrom20', name: 'Textura orgánica', category: 'abstracto', src: '/puzzles/imgrom20.webp', fallbackHue: 150, fallbackHue2: 90 },
  { id: 'imgrom21', name: 'Gatitos', category: 'animales', src: '/puzzles/imgrom21.webp', fallbackHue: 35, fallbackHue2: 140 },
{ id: 'imgrom22', name: 'Sistema Solar', category: 'naturaleza', src: '/puzzles/imgrom22.webp', fallbackHue: 220, fallbackHue2: 280 }
]
export function imagesByCategory(pool: PuzzleImage[]): Partial<Record<ImageCategory, PuzzleImage[]>> {
  const out: Partial<Record<ImageCategory, PuzzleImage[]>> = {}
  for (const img of pool) {
    if (!out[img.category]) out[img.category] = []
    out[img.category]!.push(img)
  }
  return out
}

export const PIECE_TIER_SIZES = [4, 8, 12, 20, 30, 60, 100, 200, 500, 1000, 2200] as const
const PIECE_TIER_SPAN = [4, 3, 6, 9, 10, 12, 15, 18, 22, 26] as const
export const PIECE_SUGGESTIONS = [4, 8, 12, 20, 30, 60, 100, 200, 500, 1000] as const
export const PIECES_MIN = 4
export const PIECES_MAX = 2200
export function clampPieceCount(n: number): number {
  if (!Number.isFinite(n)) return PIECES_MIN
  return Math.max(PIECES_MIN, Math.min(PIECES_MAX, Math.round(n)))
}
export interface PieceTierInfo {
  tierIndex: number; pieces: number; levelInTier: number; spanForTier: number
  isMaxTier: boolean; levelsUntilNextTier: number | null
}
export function pieceTierInfoForLevel(level: number): PieceTierInfo {
  const lv = Math.max(1, Math.floor(level))
  let remaining = lv
  for (let i = 0; i < PIECE_TIER_SPAN.length; i++) {
    const span = PIECE_TIER_SPAN[i]
    if (remaining <= span) {
      return { tierIndex: i, pieces: PIECE_TIER_SIZES[i], levelInTier: remaining, spanForTier: span, isMaxTier: false, levelsUntilNextTier: span - remaining }
    }
    remaining -= span
  }
  const lastIdx = PIECE_TIER_SIZES.length - 1
  return { tierIndex: lastIdx, pieces: PIECE_TIER_SIZES[lastIdx], levelInTier: remaining, spanForTier: Infinity, isMaxTier: true, levelsUntilNextTier: null }
}
export function piecesForLevel(level: number): number { return pieceTierInfoForLevel(level).pieces }
export function gridForPieces(pieces: number): { cols: number; rows: number } {
  const n = clampPieceCount(pieces)
  let bestCols = 2, bestRows = 2, bestScore = Infinity
  const maxCols = Math.ceil(Math.sqrt(n)) + 8
  for (let cols = 2; cols <= maxCols; cols++) {
    const rows = Math.ceil(n / cols)
    const waste = cols * rows - n
    const aspect = Math.abs(cols / rows - 1)
    const score = waste * 10 + aspect * 6
    if (score < bestScore) { bestScore = score; bestCols = cols; bestRows = rows }
  }
  return { cols: bestCols, rows: bestRows }
}
export function shapeForLevel(level: number): PieceShape {
  const cycle: PieceShape[] = PIECE_SHAPES.map((s) => s.id)
  // Mezcla determinista: no siempre en orden fijo
  const lv = Math.max(1, Math.floor(level))
  const idx = (lv * 7 + Math.floor(lv / 3) * 3) % cycle.length
  return cycle[idx]
}
/**
 * Imagen fija por nivel de Progresión (determinista).
 * No usa imágenes custom ni azar: el mismo nivel siempre muestra la misma foto.
 */
export function imageForLevel(level: number, _pool?: PuzzleImage[]): PuzzleImage {
  const lv = Math.max(1, Math.floor(level))
  if (!DEFAULT_IMAGES.length) {
    return {
      id: 'fallback', name: 'Puzzle', category: 'abstracto', src: '',
      fallbackHue: 180, fallbackHue2: 220,
    }
  }
  const idx = levelSeed(lv, 6600) % DEFAULT_IMAGES.length
  return DEFAULT_IMAGES[idx]
}

export interface JigsawLevel {
  level: number; pieces: number; cols: number; rows: number; shape: PieceShape
  image: PuzzleImage; targetSeconds: number; hints: number; seed: number; goal: string
  difficulty: Difficulty
  /** width/height de la imagen (1 = cuadrada). El tablero respeta esta proporción. */
  imageAspect: number
}
export function hintsForPieces(pieces: number): number { return Math.max(3, Math.round(Math.sqrt(pieces) * 0.5)) }
/**
 * Tiempo del nivel en Progresión.
 * Nivel 1 → 60 s, nivel 2 → 80 s, y sube ~20 s por nivel + extra por piezas.
 * La dificultad multiplica: fácil 1× · normal 1.25× · difícil 1.5×.
 */
export function targetSecondsForPieces(
  pieces: number,
  level = 1,
  difficulty: Difficulty = 'facil',
): number {
  const lv = Math.max(1, Math.floor(level))
  const n = Math.max(4, pieces)
  // Nivel 1 = 60s, nivel 2 = 80s, nivel 3 = 100s...
  const levelBase = 60 + (lv - 1) * 20
  // Extra por piezas más allá de 4 (~3.2 s/pieza) + suavizado log
  const pieceExtra = Math.max(0, n - 4) * 3.2 + Math.log2(n) * 8
  const raw = levelBase + pieceExtra
  const diffMult = difficulty === 'dificil' ? 1.5 : difficulty === 'normal' ? 1.25 : 1.0
  return Math.max(60, Math.round(raw * diffMult))
}

/**
 * Tiempo sugerido en Creativo: más generoso, crece con piezas y dificultad.
 * 12 pz fácil ≈ 2.5 min · 30 pz ≈ 5 min · 100 pz ≈ 12 min · difícil ×1.5
 */
export function recommendTimeLimitSeconds(pieces: number, difficulty: Difficulty = 'facil'): number {
  const n = Math.max(4, pieces)
  const base = 75 + n * 5.5 + Math.sqrt(n) * 10
  const diffMult = difficulty === 'dificil' ? 1.55 : difficulty === 'normal' ? 1.28 : 1.0
  return Math.max(90, Math.round(base * diffMult))
}

export const TIME_LIMIT_SUGGESTIONS = [0, 60, 90, 120, 180, 240, 300, 480, 600, 900, 1200, 1800, 2700, 3600] as const

export function imageAspectOf(img: PuzzleImage): number {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w && h && w > 0 && h > 0) return w / h
  return 1
}
export function getJigsawDifficulty(level: number, difficulty: Difficulty = 'facil') {
  const pieces = piecesForLevel(level)
  const { cols, rows } = gridForPieces(pieces)
  const total = cols * rows
  return {
    pieces: total,
    cols,
    rows,
    shape: shapeForLevel(level),
    targetSeconds: targetSecondsForPieces(total, level, difficulty),
    hints: hintsForPieces(total),
  }
}
export function generateJigsawLevel(level: number, pool: PuzzleImage[], opts?: { seedSalt?: number; difficulty?: Difficulty }): JigsawLevel {
  const lv = Math.max(1, Math.floor(level))
  const difficulty = opts?.difficulty ?? 'facil'
  const d = getJigsawDifficulty(lv, difficulty)
  const limitLabel = d.targetSeconds >= 60
    ? `${Math.floor(d.targetSeconds / 60)} min ${d.targetSeconds % 60}s`
    : `${d.targetSeconds}s`
  const image = imageForLevel(lv, pool)
  return {
    level: lv, pieces: d.pieces, cols: d.cols, rows: d.rows, shape: d.shape,
    image, targetSeconds: d.targetSeconds, hints: d.hints,
    seed: levelSeed(lv, 6200 + (opts?.seedSalt ?? 0)),
    goal: `Arma el rompecabezas de ${d.pieces} piezas (${d.cols}×${d.rows}) en hasta ${limitLabel}.`,
    difficulty,
    imageAspect: imageAspectOf(image),
  }
}
export function generateCreativeJigsaw(opts: {
  image: PuzzleImage
  pieces: number
  shape: PieceShape
  seedSalt?: number
  difficulty?: Difficulty
  /** 0 = sin límite de tiempo */
  timeLimitSeconds?: number
}): JigsawLevel {
  const pieces = clampPieceCount(opts.pieces)
  const { cols, rows } = gridForPieces(pieces)
  const total = cols * rows
  const salt = opts.seedSalt ?? Math.floor(Math.random() * 99999)
  const difficulty = opts.difficulty ?? 'facil'
  const recommended = recommendTimeLimitSeconds(total, difficulty)
  const limit = opts.timeLimitSeconds
  const targetSeconds = limit === undefined ? recommended : Math.max(0, Math.floor(limit))
  const timeGoal = targetSeconds > 0
    ? ` en hasta ${Math.floor(targetSeconds / 60)}m ${targetSeconds % 60}s`
    : ' sin límite de tiempo'
  return {
    level: 0, pieces: total, cols, rows, shape: opts.shape, image: opts.image,
    targetSeconds, hints: hintsForPieces(total),
    seed: levelSeed(total, 6900 + salt),
    goal: `Arma el rompecabezas de ${total} piezas (${cols}×${rows})${timeGoal}.`,
    difficulty,
    imageAspect: imageAspectOf(opts.image),
  }
}

export type EdgeTab = -1 | 0 | 1
export interface PieceEdges {
  top: EdgeTab; topJitter: number; right: EdgeTab; rightJitter: number
  bottom: EdgeTab; bottomJitter: number; left: EdgeTab; leftJitter: number
}
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
  const factors: Partial<Record<PieceShape, number>> = {
    classic: 0.26, round: 0.28, pointed: 0.27, wavy: 0.25, soft: 0.3, square: 0.14,
    zigzag: 0.24, scallop: 0.26, arrow: 0.28, diamond: 0.27, cloud: 0.3, notch: 0.18,
    double: 0.22, smooth: 0.12, spike: 0.3, petal: 0.28,
    bevel: 0.22, ripple: 0.24, crest: 0.28, valley: 0.26, blade: 0.3, knob: 0.27,
    tile: 0.16, mosaic: 0.2, bubble: 0.29, flame: 0.3, leaf: 0.27, star: 0.28,
    cross: 0.24, wave2: 0.25, puzzle: 0.27, brick: 0.15,
  }
  return Math.min(cellW, cellH) * (factors[shape] ?? 0.26)
}
export function pieceTabPad(cellW: number, cellH: number, shape: PieceShape): number {
  return Math.ceil(tabSizeFor(cellW, cellH, shape) * 1.9)
}
function edgeCommand(x0: number, y0: number, x1: number, y1: number, dir: EdgeTab, jitter: number, shape: PieceShape, size: number): string {
  const f = (n: number) => n.toFixed(2)
  if (dir === 0) return `L ${f(x1)} ${f(y1)}`
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len, px = uy, py = -ux
  const pt = (t: number, o: number): [number, number] => [x0 + dx * t + px * o * dir, y0 + dy * t + py * o * dir]
  const jr = (jitter - 0.5) * 2, s = size

  if (shape === 'classic' || shape === 'soft' || shape === 'puzzle' || shape === 'knob') {
    // Pestaña tipo puzzle clásica: cuello estrecho + cabeza redondeada (mejor ajuste visual)
    const neckW = (shape === 'soft' || shape === 'knob' ? 0.30 : shape === 'puzzle' ? 0.23 : 0.21) + 0.04 * jr
    const n1t = 0.5 - neckW / 2, n2t = 0.5 + neckW / 2
    const peakO = s * (shape === 'soft' || shape === 'knob' ? 1.18 + 0.08 * jr : 1.42 + 0.12 * jr)
    const [n1x, n1y] = pt(n1t, 0), [n2x, n2y] = pt(n2t, 0), [peakX, peakY] = pt(0.5, peakO)
    // Control points afinados para un “knob” más circular y legible a cualquier escala
    const [c1x, c1y] = pt(n1t - 0.02, s * 0.55)
    const [c2x, c2y] = pt(0.5 - 0.18, peakO * 0.92)
    const [c3x, c3y] = pt(0.5 + 0.18, peakO * 0.92)
    const [c4x, c4y] = pt(n2t + 0.02, s * 0.55)
    const [s1x, s1y] = pt(n1t, s * 0.22)
    const [s2x, s2y] = pt(n2t, s * 0.22)
    return `L ${f(n1x)} ${f(n1y)} L ${f(s1x)} ${f(s1y)} C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(peakX)} ${f(peakY)} C ${f(c3x)} ${f(c3y)} ${f(c4x)} ${f(c4y)} ${f(s2x)} ${f(s2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'round' || shape === 'wavy' || shape === 'cloud' || shape === 'petal' || shape === 'bubble' || shape === 'crest' || shape === 'ripple' || shape === 'wave2' || shape === 'leaf') {
    const neckW = (shape === 'wavy' || shape === 'wave2' ? 0.52 : shape === 'cloud' || shape === 'bubble' ? 0.56 : shape === 'petal' || shape === 'leaf' ? 0.40 : shape === 'crest' ? 0.48 : 0.46) + 0.04 * jr
    const n1t = 0.5 - neckW / 2, n2t = 0.5 + neckW / 2
    const [n1x, n1y] = pt(n1t, 0), [n2x, n2y] = pt(n2t, 0)
    if (shape === 'wavy' || shape === 'wave2' || shape === 'ripple') {
      const amp = shape === 'wave2' ? 0.58 : shape === 'ripple' ? 0.32 : 0.42
      const [m1x, m1y] = pt(0.32, s * amp)
      const [m2x, m2y] = pt(0.5, -s * amp * 0.35)
      const [m3x, m3y] = pt(0.68, s * amp * 0.85)
      return `L ${f(n1x)} ${f(n1y)} C ${f(m1x)} ${f(m1y)} ${f(m2x)} ${f(m2y)} ${f(m3x)} ${f(m3y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    if (shape === 'cloud') {
      const [a1x, a1y] = pt(0.32, s * 0.5), [a2x, a2y] = pt(0.42, s * 0.95)
      const [a3x, a3y] = pt(0.5, s * 1.12), [a4x, a4y] = pt(0.58, s * 0.95), [a5x, a5y] = pt(0.68, s * 0.5)
      return `L ${f(n1x)} ${f(n1y)} Q ${f(a1x)} ${f(a1y)} ${f(a2x)} ${f(a2y)} Q ${f(a3x)} ${f(a3y)} ${f(a4x)} ${f(a4y)} Q ${f(a5x)} ${f(a5y)} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    if (shape === 'petal' || shape === 'leaf') {
      const peak = shape === 'leaf' ? 1.22 : 1.18
      const [px1, py1] = pt(0.42, s * 0.55), [px2, py2] = pt(0.5, s * peak), [px3, py3] = pt(0.58, s * 0.55)
      return `L ${f(n1x)} ${f(n1y)} C ${f(px1)} ${f(py1)} ${f(px2)} ${f(py2)} ${f(px2)} ${f(py2)} C ${f(px3)} ${f(py3)} ${f(n2x)} ${f(n2y)} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    if (shape === 'crest') {
      const [c1x, c1y] = pt(0.35, s * 0.4), [peakX, peakY] = pt(0.5, s * 1.25), [c2x, c2y] = pt(0.65, s * 0.4)
      return `L ${f(n1x)} ${f(n1y)} C ${f(c1x)} ${f(c1y)} ${f(peakX)} ${f(peakY)} ${f(peakX)} ${f(peakY)} C ${f(c2x)} ${f(c2y)} ${f(n2x)} ${f(n2y)} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    const rx = ((n2t - n1t) * len) / 2, ry = s * (1.08 + 0.1 * jr), sweep = dir > 0 ? 1 : 0
    return `L ${f(n1x)} ${f(n1y)} A ${f(rx)} ${f(ry)} 0 0 ${sweep} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'square' || shape === 'notch' || shape === 'smooth' || shape === 'tile' || shape === 'brick' || shape === 'bevel' || shape === 'mosaic') {
    const neckW = shape === 'smooth' ? 0.12 : shape === 'notch' || shape === 'bevel' ? 0.22 : shape === 'tile' || shape === 'brick' ? 0.15 : shape === 'mosaic' ? 0.2 : 0.18
    const n1t = 0.5 - neckW / 2, n2t = 0.5 + neckW / 2
    const peakO = s * (shape === 'smooth' ? 0.5 : shape === 'notch' ? 0.98 : shape === 'bevel' ? 0.92 : 0.88)
    const [n1x, n1y] = pt(n1t, 0), [n2x, n2y] = pt(n2t, 0)
    if (shape === 'bevel') {
      const [p1x, p1y] = pt(n1t + 0.04, peakO), [p2x, p2y] = pt(n2t - 0.04, peakO)
      return `L ${f(n1x)} ${f(n1y)} L ${f(p1x)} ${f(p1y)} L ${f(p2x)} ${f(p2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    if (shape === 'mosaic') {
      const mid = 0.5
      const [a1x, a1y] = pt(n1t, peakO * 0.55), [a2x, a2y] = pt(mid, peakO), [a3x, a3y] = pt(n2t, peakO * 0.55)
      return `L ${f(n1x)} ${f(n1y)} L ${f(a1x)} ${f(a1y)} L ${f(a2x)} ${f(a2y)} L ${f(a3x)} ${f(a3y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    const [p1x, p1y] = pt(n1t, peakO), [p2x, p2y] = pt(n2t, peakO)
    return `L ${f(n1x)} ${f(n1y)} L ${f(p1x)} ${f(p1y)} L ${f(p2x)} ${f(p2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'zigzag') {
    const pts = [0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78]
    let dpath = `L ${f(pt(0.12, 0)[0])} ${f(pt(0.12, 0)[1])} `
    pts.forEach((t, i) => {
      const o = i % 2 === 0 ? s * 1.08 : 0
      const [px, py] = pt(t, o)
      dpath += `L ${f(px)} ${f(py)} `
    })
    return dpath + `L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'scallop') {
    const [n1x, n1y] = pt(0.22, 0), [n2x, n2y] = pt(0.78, 0)
    const [m1x, m1y] = pt(0.32, s * 0.75), [m2x, m2y] = pt(0.5, s * 0.28), [m3x, m3y] = pt(0.68, s * 0.75)
    return `L ${f(n1x)} ${f(n1y)} Q ${f(m1x)} ${f(m1y)} ${f(m2x)} ${f(m2y)} Q ${f(m3x)} ${f(m3y)} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'star') {
    const pts: [number, number][] = [
      pt(0.26, 0), pt(0.34, s * 0.5), pt(0.42, s * 0.15), pt(0.5, s * 1.28),
      pt(0.58, s * 0.15), pt(0.66, s * 0.5), pt(0.74, 0),
    ]
    let dpath = ''
    for (const [px, py] of pts) dpath += `L ${f(px)} ${f(py)} `
    return dpath + `L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'flame') {
    const [n1x, n1y] = pt(0.28, 0), [n2x, n2y] = pt(0.72, 0)
    const [m1x, m1y] = pt(0.36, s * 0.65), [peakX, peakY] = pt(0.48, s * 1.38)
    const [m2x, m2y] = pt(0.55, s * 0.9), [m3x, m3y] = pt(0.62, s * 0.45)
    return `L ${f(n1x)} ${f(n1y)} C ${f(m1x)} ${f(m1y)} ${f(peakX)} ${f(peakY)} ${f(peakX)} ${f(peakY)} C ${f(m2x)} ${f(m2y)} ${f(m3x)} ${f(m3y)} ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'arrow' || shape === 'spike' || shape === 'blade') {
    const neckW = shape === 'blade' ? 0.18 : shape === 'spike' ? 0.24 : 0.28
    const n1t = 0.5 - neckW / 2, n2t = 0.5 + neckW / 2
    const peakO = s * (shape === 'spike' || shape === 'blade' ? 1.42 : 1.18)
    const [n1x, n1y] = pt(n1t, 0), [n2x, n2y] = pt(n2t, 0), [peakX, peakY] = pt(0.5, peakO)
    if (shape === 'blade') {
      const [m1x, m1y] = pt(0.5 - 0.06, peakO * 0.55)
      return `L ${f(n1x)} ${f(n1y)} L ${f(m1x)} ${f(m1y)} L ${f(peakX)} ${f(peakY)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    return `L ${f(n1x)} ${f(n1y)} L ${f(peakX)} ${f(peakY)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'diamond' || shape === 'cross' || shape === 'valley') {
    if (shape === 'valley') {
      const [n1x, n1y] = pt(0.3, 0), [n2x, n2y] = pt(0.7, 0)
      const [midX, midY] = pt(0.5, s * 0.95), [in1x, in1y] = pt(0.38, s * 0.35), [in2x, in2y] = pt(0.62, s * 0.35)
      return `L ${f(n1x)} ${f(n1y)} L ${f(in1x)} ${f(in1y)} L ${f(midX)} ${f(midY)} L ${f(in2x)} ${f(in2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    if (shape === 'cross') {
      const [n1x, n1y] = pt(0.38, 0), [n2x, n2y] = pt(0.62, 0)
      const [a1x, a1y] = pt(0.38, s * 0.35), [a2x, a2y] = pt(0.28, s * 0.35)
      const [a3x, a3y] = pt(0.28, s * 0.7), [a4x, a4y] = pt(0.72, s * 0.7)
      const [a5x, a5y] = pt(0.72, s * 0.35), [a6x, a6y] = pt(0.62, s * 0.35)
      return `L ${f(n1x)} ${f(n1y)} L ${f(a1x)} ${f(a1y)} L ${f(a2x)} ${f(a2y)} L ${f(a3x)} ${f(a3y)} L ${f(a4x)} ${f(a4y)} L ${f(a5x)} ${f(a5y)} L ${f(a6x)} ${f(a6y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
    }
    const [n1x, n1y] = pt(0.34, 0), [n2x, n2y] = pt(0.66, 0)
    const [midX, midY] = pt(0.5, s * 1.15), [in1x, in1y] = pt(0.42, s * 0.48), [in2x, in2y] = pt(0.58, s * 0.48)
    return `L ${f(n1x)} ${f(n1y)} L ${f(in1x)} ${f(in1y)} L ${f(midX)} ${f(midY)} L ${f(in2x)} ${f(in2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
  }
  if (shape === 'double') {
    const peaks = [0.32, 0.68]
    let d = ''
    for (const t of peaks) {
      const [a0] = [pt(t - 0.09, 0)], [b0] = [pt(t, s * 1.0)], [c0] = [pt(t + 0.09, 0)]
      d += `L ${f(a0[0])} ${f(a0[1])} L ${f(b0[0])} ${f(b0[1])} L ${f(c0[0])} ${f(c0[1])} `
    }
    return d + `L ${f(x1)} ${f(y1)}`
  }
  // pointed default
  const neckW = 0.30, n1t = 0.5 - neckW / 2, n2t = 0.5 + neckW / 2, peakO = s * (1.22 + 0.1 * jr)
  const [n1x, n1y] = pt(n1t, 0), [n2x, n2y] = pt(n2t, 0), [m1x, m1y] = pt(0.5 - 0.07, peakO * 0.48)
  const [peakX, peakY] = pt(0.5, peakO), [m2x, m2y] = pt(0.5 + 0.07, peakO * 0.48)
  return `L ${f(n1x)} ${f(n1y)} L ${f(m1x)} ${f(m1y)} L ${f(peakX)} ${f(peakY)} L ${f(m2x)} ${f(m2y)} L ${f(n2x)} ${f(n2y)} L ${f(x1)} ${f(y1)}`
}
export function buildPiecePath(cellW: number, cellH: number, pad: number, edges: PieceEdges, shape: PieceShape): string {
  const size = tabSizeFor(cellW, cellH, shape)
  const TL = { x: pad, y: pad }, TR = { x: pad + cellW, y: pad }, BR = { x: pad + cellW, y: pad + cellH }, BL = { x: pad, y: pad + cellH }
  let d = `M ${TL.x} ${TL.y} `
  d += edgeCommand(TL.x, TL.y, TR.x, TR.y, edges.top, edges.topJitter, shape, size) + ' '
  d += edgeCommand(TR.x, TR.y, BR.x, BR.y, edges.right, edges.rightJitter, shape, size) + ' '
  d += edgeCommand(BR.x, BR.y, BL.x, BL.y, edges.bottom, edges.bottomJitter, shape, size) + ' '
  d += edgeCommand(BL.x, BL.y, TL.x, TL.y, edges.left, edges.leftJitter, shape, size) + ' Z'
  return d
}

export type PieceRotation = 0 | 90 | 180 | 270
export interface JigsawPiece {
  id: string; row: number; col: number; correctX: number; correctY: number
  x: number; y: number; locked: boolean; z: number; edges: PieceEdges; rotation: PieceRotation
}
export function createPieces(level: JigsawLevel, shuffleSeed: number, difficulty: Difficulty = 'facil'): JigsawPiece[] {
  const { cols, rows } = level
  const edgeMap = buildEdgeMap(cols, rows, level.seed)
  const rng = mulberry32(shuffleSeed)
  const order: { row: number; col: number }[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push({ row: r, col: c })
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]
  }
  const trayCols = Math.max(4, Math.min(cols + 4, Math.ceil(Math.sqrt(order.length * 1.6))))
  const trayGap = 1.18
  const rotations: PieceRotation[] = [0, 90, 180, 270]
  const withRot = difficulty === 'normal' || difficulty === 'dificil'
  return order.map((pos, i) => {
    const trayRow = Math.floor(i / trayCols), trayCol = i % trayCols
    return {
      id: `p-${pos.row}-${pos.col}`, row: pos.row, col: pos.col,
      correctX: pos.col, correctY: pos.row,
      x: trayCol * trayGap + (rng() - 0.5) * 0.22,
      y: rows + 1.2 + trayRow * trayGap + (rng() - 0.5) * 0.22,
      locked: false, z: i + 1, edges: edgeMap[pos.row][pos.col],
      rotation: withRot ? rotations[Math.floor(rng() * 4)] : 0,
    }
  })
}
export function distanceToCorrect(piece: JigsawPiece): number {
  return Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY)
}
export const SNAP_THRESHOLD_CELLS = 0.34
export function countLocked(pieces: JigsawPiece[]): number {
  return pieces.reduce((n, p) => n + (p.locked ? 1 : 0), 0)
}
export function isPuzzleComplete(pieces: JigsawPiece[]): boolean {
  return pieces.length > 0 && pieces.every((p) => p.locked)
}
export function calcJigsawStars(timeMs: number, targetSeconds: number, hintsUsed: number, maxHints: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  const withinTarget = targetSeconds > 0 && timeMs <= targetSeconds * 1000
  if (withinTarget) stars = 2
  const fewHints = maxHints <= 0 || hintsUsed <= Math.ceil(maxHints * 0.3)
  if (withinTarget && fewHints && timeMs <= targetSeconds * 1000 * 0.65) stars = 3
  else if (withinTarget && hintsUsed === 0) stars = 3
  return stars
}
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60), s = total % 60
  if (m >= 60) {
    const h = Math.floor(m / 60), mm = m % 60
    return `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

const CUSTOM_KEY = 'gco:puzzle-custom-images'
export function loadCustomImages(): PuzzleImage[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as PuzzleImage[]
    return Array.isArray(list) ? list.filter((x) => x?.id && x?.src) : []
  } catch { return [] }
}
export function saveCustomImages(list: PuzzleImage[]): void {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)) } catch { /* quota */ }
}
/** Sin límite de cantidad (solo límite real de cuota del navegador). */
export function addCustomImage(img: PuzzleImage): PuzzleImage[] {
  const list = loadCustomImages().filter((x) => x.id !== img.id)
  list.unshift(img)
  saveCustomImages(list)
  return loadCustomImages()
}
export function removeCustomImage(id: string): PuzzleImage[] {
  const list = loadCustomImages().filter((x) => x.id !== id)
  saveCustomImages(list)
  return list
}
export function renameCustomImage(id: string, name: string): PuzzleImage[] {
  const clean = name.trim().slice(0, 48) || 'Mi imagen'
  const list = loadCustomImages().map((x) => (x.id === id ? { ...x, name: clean } : x))
  saveCustomImages(list)
  return list
}
export function compressImageFile(file: File, maxSide = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')) }
    img.src = url
  })
}

export interface PuzzleProgress {
  normalLevel: number
  starsByLevel: Record<number, 0 | 1 | 2 | 3>
  totalStars: number
  hintsUsedByLevel: Record<number, number>
  difficultyByLevel?: Record<number, Difficulty>
}
const PROGRESS_KEY = 'gco:puzzle-progress'
export function defaultPuzzleProgress(): PuzzleProgress {
  return { normalLevel: 1, starsByLevel: {}, totalStars: 0, hintsUsedByLevel: {}, difficultyByLevel: {} }
}
export function loadPuzzleProgress(): PuzzleProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return defaultPuzzleProgress()
    const p = JSON.parse(raw) as Partial<PuzzleProgress>
    return {
      normalLevel: p.normalLevel && p.normalLevel > 0 ? p.normalLevel : 1,
      starsByLevel: p.starsByLevel ?? {}, totalStars: p.totalStars ?? 0,
      hintsUsedByLevel: p.hintsUsedByLevel ?? {}, difficultyByLevel: p.difficultyByLevel ?? {},
    }
  } catch { return defaultPuzzleProgress() }
}
export function savePuzzleProgress(p: PuzzleProgress): void {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) } catch { /* */ }
}

/* ── Tipos UI ── */
type Screen = 'normal' | 'creativo' | 'galeria' | 'mis-imagenes' | 'ajustes' | 'play'
type PlayOrigin = 'normal' | 'creativo'
interface SavedCreativeLevel {
  id: string; name: string; image: PuzzleImage; pieces: number
  shape: PieceShape; difficulty: Difficulty
  /** 0 = infinito */
  timeLimitSeconds: number
  createdAt: number; updatedAt: number
}
const CREATIVE_LEVELS_KEY = 'gco:puzzle-creative-levels'
function loadCreativeLevels(): SavedCreativeLevel[] {
  try {
    const raw = localStorage.getItem(CREATIVE_LEVELS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedCreativeLevel[]
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
function saveCreativeLevels(list: SavedCreativeLevel[]): void {
  try { localStorage.setItem(CREATIVE_LEVELS_KEY, JSON.stringify(list)) } catch { /* */ }
}

interface RompecabezasGameProps { onExit?: () => void; userName?: string }
interface PuzzleSettings { sound: boolean; haptics: boolean; defaultShape: PieceShape; defaultDifficulty: Difficulty }
interface CompletionInfo {
  stars: 0 | 1 | 2 | 3
  timeMs: number
  avgMsPerPiece: number
  fastestSnapMs: number | null
  snaps: number
  difficulty: Difficulty
  beatRecord?: boolean
  challengeMs?: number | null
  timedOut?: boolean
}
interface HistoryEntry {
  id: string
  at: number
  mode: 'normal' | 'creativo'
  level: number
  pieces: number
  stars: 0 | 1 | 2 | 3
  /** Tiempo que tardó el jugador en completar */
  timeMs: number
  difficulty: Difficulty
  avgMsPerPiece: number
  fastestSnapMs: number | null
  creativeLevelId?: string
  creativeLevelName?: string
  /** Snapshot completo para repetir la partida idéntica (puede faltar en entradas antiguas) */
  image?: PuzzleImage
  shape?: PieceShape
  /** Límite de tiempo de esa partida (0 = infinito) */
  timeLimitSeconds?: number
  cols?: number
  rows?: number
  seed?: number
  beatRecord?: boolean
  challengeVsMs?: number
}
interface PuzzleStats {
  wins: number; losses: number; totalPlayMs: number
  history: HistoryEntry[]
  creativeHistory: Record<string, HistoryEntry[]>
}
const SETTINGS_KEY = 'gco:puzzle-settings'
const STATS_KEY = 'gco:puzzle-stats'
function defaultStats(): PuzzleStats { return { wins: 0, losses: 0, totalPlayMs: 0, history: [], creativeHistory: {} } }
function loadStats(): PuzzleStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return defaultStats()
    const p = JSON.parse(raw) as Partial<PuzzleStats>
    return {
      wins: p.wins ?? 0, losses: p.losses ?? 0, totalPlayMs: p.totalPlayMs ?? 0,
      history: Array.isArray(p.history) ? p.history : [],
      creativeHistory: p.creativeHistory && typeof p.creativeHistory === 'object' ? p.creativeHistory : {},
    }
  } catch { return defaultStats() }
}
function saveStats(s: PuzzleStats): void {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)) } catch { /* */ }
}
function formatDurationLong(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
}
function defaultSettings(): PuzzleSettings {
  return { sound: true, haptics: true, defaultShape: 'classic', defaultDifficulty: 'facil' }
}
function loadSettings(): PuzzleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings()
    const p = JSON.parse(raw) as Partial<PuzzleSettings>
    return {
      sound: p.sound ?? true, haptics: p.haptics ?? true,
      defaultShape: p.defaultShape ?? 'classic',
      defaultDifficulty: p.defaultDifficulty ?? 'facil',
    }
  } catch { return defaultSettings() }
}
function saveSettings(s: PuzzleSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* */ }
}
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern) } catch { /* */ }
  }
}
function stepFor(pieces: number): number {
  if (pieces < 20) return 1
  if (pieces < 100) return 5
  if (pieces < 500) return 25
  return 100
}
/**
 * El tablero completo tiene la misma proporción que la imagen (panorámica → tablero panorámico).
 * boardW/boardH = imageAspect = naturalWidth/naturalHeight
 * Cada pieza muestra exactamente 1/(cols*rows) del área de la imagen.
 */
function fitBoardCells(
  cols: number,
  rows: number,
  availW: number,
  availH: number,
  trayRows: number,
  imageAspect = 1,
): { cellW: number; cellH: number } {
  const padBudget = 36
  const maxW = Math.max(160, availW - padBudget)
  const maxH = Math.max(160, availH - padBudget)
  const aspect = imageAspect > 0.12 && imageAspect < 10 ? imageAspect : 1
  const trayFactor = trayRows * 1.1 + 1.25

  // Empezar ocupando el ancho disponible
  let boardW = maxW
  let boardH = boardW / aspect
  // Espacio para bandeja estimado con lado medio
  let meanCell = Math.sqrt((boardW / cols) * (boardH / rows))
  let totalH = boardH + trayFactor * meanCell

  if (totalH > maxH) {
    // Limitar por altura disponible (tablero + bandeja)
    // boardH + trayFactor * sqrt((boardW/cols)*(boardH/rows)) ≈ maxH
    // boardW = boardH * aspect
    boardH = maxH * 0.72 // deja hueco a la bandeja
    boardW = boardH * aspect
    if (boardW > maxW) {
      boardW = maxW
      boardH = boardW / aspect
    }
  }

  let cellW = boardW / Math.max(1, cols)
  let cellH = boardH / Math.max(1, rows)

  // Límites de legibilidad en móvil
  const minSide = 16
  const maxSide = 160
  if (cellW < minSide || cellH < minSide) {
    const scale = minSide / Math.min(cellW, cellH)
    cellW *= scale
    cellH *= scale
  }
  if (cellW > maxSide || cellH > maxSide) {
    const scale = maxSide / Math.max(cellW, cellH)
    cellW *= scale
    cellH *= scale
  }

  return { cellW, cellH }
}

const NAV_ITEMS: { id: Screen; label: string; emoji: string; sub?: string }[] = [
  { id: 'normal', label: 'Progresión', emoji: '📈', sub: 'Sube de nivel y gana estrellas' },
  { id: 'creativo', label: 'Modo Creativo', emoji: '✨', sub: 'Tus niveles guardados' },
  { id: 'galeria', label: 'Galería', emoji: '🖼️', sub: 'Imágenes por defecto' },
  { id: 'mis-imagenes', label: 'Mis Imágenes', emoji: '📁', sub: 'Importadas por ti' },
  { id: 'ajustes', label: 'Ajustes', emoji: '⚙️', sub: 'Stats y preferencias' },
]
const MOBILE_NAV: { id: Screen; label: string; emoji: string }[] = [
  { id: 'normal', label: 'Progresión', emoji: '🧩' },
  { id: 'creativo', label: 'Creativo', emoji: '✨' },
  { id: 'galeria', label: 'Galería', emoji: '🖼️' },
  { id: 'mis-imagenes', label: 'Imágenes', emoji: '📁' },
  { id: 'ajustes', label: 'Ajustes', emoji: '⚙️' },
]

function useJigsawSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  function getCtx(): AudioContext | null {
    if (!enabled || typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try { ctxRef.current = new Ctor() } catch { return null }
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }
  function tone(freq: number, dur: number, type: OscillatorType, peak: number, delay: number) {
    const ctx = getCtx()
    if (!ctx) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }
  function noiseBurst(dur: number, peak: number, delay = 0) {
    const ctx = getCtx()
    if (!ctx) return
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    const t0 = ctx.currentTime + delay
    src.buffer = buf
    gain.gain.setValueAtTime(peak, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    src.connect(gain).connect(ctx.destination)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }
  return {
    playSnap: () => {
      tone(720, 0.07, 'sine', 0.13, 0)
      tone(980, 0.05, 'triangle', 0.08, 0.04)
      noiseBurst(0.025, 0.03, 0.01)
    },
    playGroup: () => {
      tone(440, 0.06, 'triangle', 0.1, 0)
      tone(660, 0.08, 'sine', 0.11, 0.05)
      tone(880, 0.07, 'sine', 0.08, 0.1)
      noiseBurst(0.03, 0.035, 0.02)
    },
    playRotate: () => {
      tone(280, 0.05, 'triangle', 0.09, 0)
      tone(420, 0.06, 'sine', 0.1, 0.04)
      tone(560, 0.05, 'sine', 0.07, 0.08)
    },
    playRotateGroup: () => {
      tone(260, 0.05, 'triangle', 0.08, 0)
      tone(390, 0.06, 'sine', 0.09, 0.04)
      tone(520, 0.06, 'sine', 0.08, 0.08)
      tone(650, 0.05, 'triangle', 0.06, 0.12)
    },
    playLock: () => {
      tone(600, 0.05, 'square', 0.06, 0)
      tone(900, 0.08, 'sine', 0.1, 0.04)
      tone(1200, 0.06, 'triangle', 0.07, 0.08)
      noiseBurst(0.04, 0.04, 0.02)
    },
    playHint: () => {
      tone(880, 0.1, 'sine', 0.1, 0)
      tone(1100, 0.12, 'triangle', 0.08, 0.08)
      tone(1320, 0.1, 'sine', 0.06, 0.16)
    },
    playTick: () => tone(900, 0.03, 'sine', 0.05, 0),
    playTimeWarn: () => {
      tone(400, 0.08, 'sawtooth', 0.07, 0)
      tone(350, 0.1, 'sawtooth', 0.06, 0.1)
      tone(300, 0.12, 'sawtooth', 0.05, 0.2)
    },
    playTimeCritical: () => {
      tone(480, 0.06, 'square', 0.08, 0)
      tone(360, 0.08, 'sawtooth', 0.07, 0.07)
      tone(280, 0.1, 'sawtooth', 0.06, 0.14)
    },
    playComplete: () => {
      tone(523.25, 0.14, 'triangle', 0.13, 0)
      tone(659.25, 0.14, 'triangle', 0.13, 0.09)
      tone(783.99, 0.18, 'triangle', 0.14, 0.18)
      tone(1046.5, 0.28, 'sine', 0.12, 0.28)
      tone(1318.5, 0.22, 'sine', 0.08, 0.42)
      noiseBurst(0.06, 0.04, 0.3)
    },
    playFail: () => {
      tone(300, 0.15, 'sawtooth', 0.08, 0)
      tone(220, 0.2, 'triangle', 0.07, 0.12)
      tone(180, 0.22, 'sawtooth', 0.05, 0.28)
    },
    playPickup: () => {
      tone(520, 0.04, 'sine', 0.06, 0)
      tone(680, 0.03, 'triangle', 0.04, 0.03)
    },
    playDrop: () => {
      tone(380, 0.04, 'triangle', 0.05, 0)
      noiseBurst(0.02, 0.025, 0.01)
    },
    playZoom: () => tone(640, 0.03, 'sine', 0.04, 0),
    playPause: () => {
      tone(440, 0.06, 'sine', 0.07, 0)
      tone(330, 0.08, 'triangle', 0.05, 0.06)
    },
    playResume: () => {
      tone(330, 0.05, 'triangle', 0.06, 0)
      tone(440, 0.07, 'sine', 0.07, 0.05)
    },
    playAutoRotate: () => {
      tone(200, 0.08, 'sawtooth', 0.05, 0)
      tone(280, 0.07, 'triangle', 0.06, 0.06)
      tone(360, 0.06, 'sine', 0.04, 0.12)
    },
    playWhoosh: () => {
      noiseBurst(0.08, 0.05, 0)
      tone(180, 0.1, 'sine', 0.04, 0.02)
    },
    playUI: () => tone(760, 0.025, 'sine', 0.04, 0),
    playRecord: () => {
      tone(523.25, 0.1, 'triangle', 0.1, 0)
      tone(659.25, 0.1, 'triangle', 0.1, 0.08)
      tone(783.99, 0.12, 'sine', 0.11, 0.16)
      tone(1046.5, 0.18, 'sine', 0.09, 0.26)
    },
  }
}

const SCOPED_STYLES = `
.pz-root *, .pz-root *::before, .pz-root *::after { box-sizing: border-box; }
.pz-root {
  --pz-neon: var(--gco-primary, #22E6C5); --pz-neon-dim: var(--gco-primary-dim, rgba(34,230,197,0.18));
  --pz-accent: var(--gco-accent, #8B7CF6); --pz-glass: rgba(255,255,255,0.055);
  --pz-border: rgba(255,255,255,0.14); --pz-ink: var(--gco-ink, #F3F5FA);
  --pz-muted: var(--gco-ink-muted, rgba(243,245,250,0.64)); --pz-faint: var(--gco-ink-faint, rgba(243,245,250,0.38));
  --pz-radius: 20px; --pz-nav-h: 88px; --pz-safe-b: env(safe-area-inset-bottom, 0px); --pz-safe-t: env(safe-area-inset-top, 0px);
  position: absolute; inset: 0; width: 100%; max-width: 100%; height: 100%; min-height: 0; max-height: 100%;
  display: flex; flex-direction: row; overflow: hidden;
  background: radial-gradient(ellipse 80% 50% at 20% -10%, rgba(34,230,197,0.08), transparent 50%),
    radial-gradient(ellipse 60% 40% at 90% 10%, rgba(139,124,246,0.07), transparent 45%), var(--gco-bg, #0B1220);
  color: var(--pz-ink); font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif);
  -webkit-font-smoothing: antialiased; container-type: inline-size; container-name: pz-shell; isolation: isolate;
}
.pz-sidebar { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.2rem; padding: 1rem 0.8rem; border-right: 1px solid var(--pz-border); background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 45%); overflow-y: auto; height: 100%; }
.pz-brand { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.55rem 0.9rem; font-weight: 700; font-size: 1.02rem; }
.pz-brand-mark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: linear-gradient(135deg, var(--pz-neon), var(--pz-accent)); color: #0B1220; font-size: 1.05rem; box-shadow: 0 0 18px rgba(34,230,197,0.4); }
.pz-brand-sub { font-size: 0.66rem; font-weight: 500; color: var(--pz-muted); display: block; }
.pz-nav-btn { display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.65rem 0.7rem; border: 1px solid transparent; border-radius: 12px; background: transparent; color: var(--pz-muted); font: inherit; font-weight: 600; font-size: 0.86rem; text-align: left; cursor: pointer; }
.pz-nav-btn:hover { background: var(--pz-glass); color: var(--pz-ink); }
.pz-nav-btn.is-active { background: var(--pz-neon-dim); border-color: rgba(34,230,197,0.4); color: var(--pz-neon); }
.pz-nav-emoji { width: 1.3rem; text-align: center; }
.pz-nav-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pz-nav-sub { font-size: 0.64rem; font-weight: 400; color: var(--pz-faint); }
.pz-side-profile { margin-top: auto; padding: 0.8rem; border-radius: 12px; background: var(--pz-glass); border: 1px solid var(--pz-border); display: flex; flex-direction: column; gap: 2px; }
.pz-side-profile-name { font-weight: 700; font-size: 0.88rem; }
.pz-side-profile-meta { font-size: 0.72rem; color: var(--pz-muted); }
.pz-main { flex: 1 1 0%; min-width: 0; min-height: 0; width: 100%; display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative; container-type: inline-size; container-name: pz-main; }
.pz-topbar { flex-shrink: 0; display: flex; align-items: center; gap: 0.45rem; padding: calc(0.55rem + var(--pz-safe-t)) 0.85rem 0.5rem; width: 100%; }
.pz-topbar-title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 0.4rem; font-weight: 700; font-size: 0.98rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pz-topbar-sub { font-weight: 500; font-size: 0.74rem; color: var(--pz-muted); }
.pz-topbar-right { display: flex; align-items: center; gap: 0.35rem; margin-left: auto; flex-shrink: 0; }
.pz-pill { padding: 0.32rem 0.7rem; border-radius: 999px; background: linear-gradient(165deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04)); border: 1px solid rgba(255,255,255,0.14); font-size: 0.78rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pz-icon-btn { width: 36px; height: 36px; min-width: 36px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: linear-gradient(165deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); color: var(--pz-ink); display: grid; place-items: center; cursor: pointer; font-size: 0.95rem; }
.pz-icon-btn:hover { border-color: rgba(34,230,197,0.45); background: rgba(34,230,197,0.12); }
.pz-content { flex: 1 1 0%; min-height: 0 !important; min-width: 0; width: 100%; overflow-x: hidden !important; overflow-y: scroll !important; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; touch-action: pan-y; padding: 0.7rem 1rem 1.25rem; scrollbar-width: thin; position: relative; z-index: 1; }
.pz-main.is-playing .pz-content { display: flex; flex-direction: column; flex: 1 1 0%; min-height: 0; padding: 0.4rem 0.5rem 0.45rem; overflow: hidden !important; overscroll-behavior: none; touch-action: manipulation; }
.pz-scroll-inner { width: 100%; max-width: 100%; min-height: min-content; padding-bottom: 0.5rem; }
.pz-welcome { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; width: 100%; }
.pz-welcome-text { font-size: 0.9rem; color: var(--pz-muted); }
.pz-welcome-text strong { color: var(--pz-ink); }
.pz-welcome-stats { margin-left: auto; display: flex; gap: 0.35rem; flex-wrap: wrap; }
.pz-card { background: linear-gradient(155deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 42%, rgba(255,255,255,0.025) 100%); border: 1px solid rgba(255,255,255,0.14); border-radius: var(--pz-radius); backdrop-filter: blur(36px) saturate(1.7); box-shadow: 0 10px 36px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.16); width: 100%; }
.pz-panel { padding: 1.05rem 1.1rem; display: flex; flex-direction: column; gap: 0.7rem; }
.pz-panel-head { display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.95rem; margin: 0; }
.pz-panel-desc { font-size: 0.78rem; color: var(--pz-muted); line-height: 1.4; margin: -0.15rem 0 0; }
.pz-level-row { display: flex; gap: 0.55rem; overflow-x: auto; padding: 2px 1px 8px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; width: 100%; }
.pz-level-card { position: relative; flex: 0 0 auto; width: 100px; aspect-ratio: 3/4; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--pz-border); background: rgba(0,0,0,0.25); cursor: pointer; scroll-snap-align: start; padding: 0; text-align: left; color: #fff; }
.pz-level-card.is-current { border-color: var(--pz-neon); box-shadow: 0 0 0 2px var(--pz-neon-dim), 0 0 20px rgba(34,230,197,0.22); }
.pz-level-cover { position: absolute; inset: 0; background-size: cover; background-position: center; }
.pz-level-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.55rem; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.78)); }
.pz-level-label { font-weight: 700; font-size: 0.84rem; }
.pz-level-pieces { font-size: 0.68rem; opacity: .88; }
.pz-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; padding: 0.7rem 1.05rem; border-radius: 999px; border: 1px solid transparent; font: inherit; font-weight: 700; font-size: 0.86rem; cursor: pointer; }
.pz-btn:active { transform: scale(0.98); }
.pz-btn-primary { background: linear-gradient(180deg, #3aefd0 0%, var(--pz-neon) 100%); color: var(--gco-button-text, #0B1220); box-shadow: 0 4px 20px rgba(34,230,197,0.4); }
.pz-btn-accent { background: var(--pz-accent); color: #fff; }
.pz-btn-ghost { background: var(--pz-glass); border-color: var(--pz-border); color: var(--pz-ink); }
.pz-btn-ghost:hover { border-color: var(--pz-neon); color: var(--pz-neon); }
.pz-btn-block { width: 100%; }
.pz-preview { position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: rgba(0,0,0,0.25); border: 1px solid var(--pz-border); width: 100%; }
.pz-preview-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--pz-border); background: rgba(11,18,32,0.75); color: #fff; cursor: pointer; display: grid; place-items: center; z-index: 2; }
.pz-preview-nav.prev { left: 8px; } .pz-preview-nav.next { right: 8px; }
.pz-select { display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; padding: 0.58rem 0.75rem; border-radius: 12px; border: 1px solid var(--pz-border); background: var(--gco-input-bg, rgba(0,0,0,0.28)); color: var(--pz-ink); font: inherit; font-weight: 600; font-size: 0.84rem; cursor: pointer; text-align: left; width: 100%; }
.pz-shape-slider {
  display: grid;
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  grid-auto-columns: minmax(72px, 84px);
  gap: 0.35rem;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 10px;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
}
.pz-shape-slider .pz-shape-card { scroll-snap-align: start; min-height: 64px; }
.pz-shape-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; width: 100%; }
.pz-diff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; width: 100%; }
.pz-shape-card, .pz-diff-card { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 0.7rem 0.3rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); color: var(--pz-muted); cursor: pointer; font: inherit; }
.pz-shape-card.is-on, .pz-diff-card.is-on { border-color: rgba(34,230,197,0.5); background: linear-gradient(165deg, rgba(34,230,197,0.22), rgba(34,230,197,0.08)); color: var(--pz-neon); }
.pz-shape-emoji, .pz-diff-emoji { font-size: 1.15rem; }
.pz-shape-label, .pz-diff-label { font-size: 0.7rem; font-weight: 600; }
.pz-upload { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.95rem; border-radius: 12px; border: 1.5px dashed var(--pz-border); background: rgba(255,255,255,0.03); color: var(--pz-ink); font: inherit; font-weight: 600; font-size: 0.84rem; cursor: pointer; width: 100%; }
.pz-upload:hover { border-color: var(--pz-neon); background: var(--pz-neon-dim); }
.pz-upload-sub { font-size: 0.68rem; font-weight: 400; color: var(--pz-muted); }
.pz-img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.6rem; width: 100%; }
.pz-img-card { display: flex; flex-direction: column; gap: 0.28rem; background: none; border: none; padding: 0; cursor: pointer; text-align: left; color: var(--pz-ink); position: relative; font: inherit; min-width: 0; width: 100%; }
.pz-img-cover { aspect-ratio: 4/3; border-radius: 12px; background-size: cover; background-position: center; border: 1.5px solid transparent; width: 100%; }
.pz-img-card.is-on .pz-img-cover { border-color: var(--pz-neon); box-shadow: 0 0 14px rgba(34,230,197,0.2); }
.pz-img-name { font-size: 0.72rem; color: var(--pz-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pz-play {
  display: flex; flex-direction: column; gap: 0.45rem;
  flex: 1; min-height: 0; width: 100%; overflow: hidden;
  --play-glass: linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.02) 100%);
  --play-edge: rgba(255,255,255,0.14);
  --play-glow: 0 0 24px rgba(34,230,197,0.12);
}
.pz-play.is-fs {
  position: fixed; inset: 0; z-index: 150;
  background:
    radial-gradient(ellipse 90% 50% at 50% -20%, rgba(34,230,197,0.14), transparent 55%),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139,124,246,0.1), transparent 50%),
    radial-gradient(ellipse 40% 30% at 0% 80%, rgba(34,230,197,0.06), transparent 45%),
    #070d18;
  padding: calc(0.4rem + var(--pz-safe-t)) 0.55rem calc(0.45rem + var(--pz-safe-b));
}
.pz-toolbar {
  display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; width: 100%; flex-shrink: 0;
  padding: 0.4rem 0.5rem; border-radius: 18px;
  background: var(--play-glass);
  border: 1px solid var(--play-edge);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  box-shadow: var(--play-glow), inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 28px rgba(0,0,0,0.25);
}
.pz-tool {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
  min-height: 34px; padding: 0.38rem 0.7rem; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));
  color: rgba(243,245,250,0.72); font: inherit; font-size: 0.72rem; font-weight: 650;
  cursor: pointer; white-space: nowrap;
  transition: transform .12s ease, border-color .15s, background .15s, color .15s, box-shadow .15s;
}
.pz-tool:hover {
  border-color: rgba(34,230,197,0.45); color: #fff;
  background: linear-gradient(180deg, rgba(34,230,197,0.18), rgba(34,230,197,0.06));
}
.pz-tool:active { transform: scale(0.96); }
.pz-tool.is-on {
  border-color: rgba(34,230,197,0.65);
  background: linear-gradient(180deg, rgba(34,230,197,0.28), rgba(34,230,197,0.1));
  color: #5CFFE0;
  box-shadow: 0 0 16px rgba(34,230,197,0.25), inset 0 1px 0 rgba(255,255,255,0.15);
}
.pz-tool:disabled { opacity: 0.38; cursor: not-allowed; transform: none; }
.pz-zoom {
  display: flex; align-items: center; gap: 0.3rem; margin-left: auto;
  padding: 0.15rem 0.25rem 0.15rem 0.45rem; border-radius: 999px;
  background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.08);
  font-size: 0.72rem; color: rgba(243,245,250,0.7); font-variant-numeric: tabular-nums; font-weight: 650;
}
.pz-prog { display: flex; align-items: center; gap: 0.55rem; width: 100%; flex-shrink: 0; padding: 0 0.2rem; }
.pz-prog-bar {
  flex: 1; height: 7px; border-radius: 999px; min-width: 0;
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.35);
  overflow: hidden; position: relative;
}
.pz-prog-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #22E6C5 0%, #5B8CFF 55%, #8B7CF6 100%);
  background-size: 200% 100%;
  animation: pz-prog-shine 3s linear infinite;
  transition: width .4s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 0 14px rgba(34,230,197,0.45);
}
@keyframes pz-prog-shine {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.pz-prog-count {
  font-size: 0.75rem; color: rgba(243,245,250,0.65);
  font-variant-numeric: tabular-nums; font-weight: 700; min-width: 3.2rem; text-align: right;
}
.pz-board {
  border: 2px solid rgba(34,230,197,0.35) !important;
  border-radius: 14px !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 0 40px rgba(34,230,197,0.12),
    0 16px 48px rgba(0,0,0,0.4),
    inset 0 0 80px rgba(0,0,0,0.2) !important;
  background:
    linear-gradient(145deg, rgba(34,230,197,0.07), transparent 42%),
    rgba(4, 10, 20, 0.55) !important;
}
.pz-arena-scroll {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.07),
    0 12px 40px rgba(0,0,0,0.3);
  border-radius: 20px !important;
}
.pz-hud {
  border-radius: 16px !important;
  padding: 0.45rem 0.9rem !important;
  background: linear-gradient(160deg, rgba(255,255,255,0.16), rgba(10,16,28,0.82)) !important;
  border: 1px solid rgba(34,230,197,0.4) !important;
  backdrop-filter: blur(24px) saturate(1.5) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 20px rgba(34,230,197,0.15) !important;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.pz-piece.is-dragging {
  filter: drop-shadow(0 12px 24px rgba(0,0,0,0.5)) drop-shadow(0 0 14px rgba(34,230,197,0.4)) !important;
}
.pz-piece.is-locked {
  filter: drop-shadow(0 0 6px rgba(34,230,197,0.25));
}


.pz-arena-scroll {
  flex: 1; min-height: 0; width: 100%;
  overflow-x: auto; overflow-y: auto;
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 30% 10%, rgba(34,230,197,0.08), transparent 50%),
    radial-gradient(ellipse at 80% 90%, rgba(139,124,246,0.07), transparent 45%),
    linear-gradient(180deg, rgba(12,18,32,0.5), rgba(0,0,0,0.35));
  border: 1px solid rgba(255,255,255,0.1);
  position: relative;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  /* pan-x + pan-y permite deslizar el tablero en horizontal y vertical en móvil */
  touch-action: pan-x pan-y;
  scrollbar-width: thin;
}
.pz-arena-scroll.is-pinching,
.pz-arena-scroll.is-dragging-piece { touch-action: none; overflow: hidden; }
.pz-arena { position: relative; transform-origin: top left; touch-action: none; margin: 8px; will-change: transform; }
.pz-board { position: absolute; left: 0; top: 0; border: 2px solid rgba(34,230,197,0.28); border-radius: 10px; overflow: hidden; background: linear-gradient(145deg, rgba(34,230,197,0.05), rgba(0,0,0,0.22)); box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04); }
.pz-ghost { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.3; pointer-events: none; }
.pz-piece { position: absolute; touch-action: none; will-change: left, top, transform; cursor: grab; transition: filter .15s ease; contain: layout style; user-select: none; -webkit-user-select: none; }
.pz-piece.is-locked { cursor: default; pointer-events: none; animation: pz-lock-pop .28s cubic-bezier(0.34, 1.4, 0.64, 1); }
.pz-piece.is-dragging { z-index: 9999 !important; cursor: grabbing; filter: drop-shadow(0 8px 18px rgba(0,0,0,0.45)) drop-shadow(0 0 10px rgba(34,230,197,0.3)); transition: none; }
.pz-piece.is-hint { filter: drop-shadow(0 0 12px var(--pz-neon)); animation: pz-hint-pulse 1s ease-in-out; }
@keyframes pz-lock-pop {
  0% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes pz-hint-pulse {
  0%, 100% { filter: drop-shadow(0 0 6px var(--pz-neon)); }
  50% { filter: drop-shadow(0 0 16px var(--pz-neon)); }
}
@keyframes pz-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.pz-complete { animation: pz-fade-up .35s ease-out; }
.pz-modal { animation: pz-fade-up .28s ease-out; }
.pz-prog-fill { transition: width .35s cubic-bezier(0.22, 1, 0.36, 1); }
.pz-hud { transition: box-shadow .2s ease; }
.pz-hud.is-urgent { border-color: rgba(255,107,74,0.7); box-shadow: 0 6px 24px rgba(0,0,0,0.4), 0 0 18px rgba(255,107,74,0.25); }
.pz-arena-scroll { scroll-behavior: smooth; }
.pz-tool:active, .pz-btn:active { transform: scale(0.97); }
.pz-level-card { transition: transform .15s ease, box-shadow .15s ease; }
.pz-level-card:hover { transform: translateY(-2px); }
.pz-level-card:active { transform: scale(0.98); }

.pz-pause { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(11,18,32,0.6); backdrop-filter: blur(6px); z-index: 30; border-radius: inherit; padding: 1rem; }
.pz-pause-card { padding: 1.35rem 1.2rem; text-align: center; min-width: 200px; max-width: 100%; width: min(280px, 100%); }
.pz-hud { position: fixed; z-index: 120; display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.8rem; border-radius: 999px; background: linear-gradient(165deg, rgba(255,255,255,0.14), rgba(12,18,32,0.78)); border: 1px solid rgba(34,230,197,0.35); backdrop-filter: blur(20px); font-size: 0.75rem; color: var(--pz-ink); box-shadow: 0 6px 24px rgba(0,0,0,0.4); cursor: grab; user-select: none; touch-action: none; font-variant-numeric: tabular-nums; }
.pz-hud strong { color: var(--pz-neon); }
.pz-hud-grip { opacity: 0.45; font-size: 0.65rem; }
.pz-overlay { position: fixed; inset: 0; background: rgba(5,10,20,0.68); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 0.85rem; overflow: auto; }
.pz-modal { width: min(500px, 100%); max-height: min(85dvh, 85vh); overflow: auto; padding: 1.1rem; border-radius: var(--pz-radius); }
.pz-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem; gap: 0.5rem; }
.pz-modal-head h3 { margin: 0; font-size: 1rem; }
.pz-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--pz-border); margin-bottom: 0.8rem; overflow-x: auto; }
.pz-tabs button { padding: 0.48rem 0.1rem; background: none; border: none; border-bottom: 2px solid transparent; color: var(--pz-muted); font: inherit; font-weight: 600; font-size: 0.82rem; cursor: pointer; margin-right: 0.95rem; white-space: nowrap; }
.pz-tabs button.is-on { color: var(--pz-neon); border-color: var(--pz-neon); }
.pz-pieces-val { font-size: 2.2rem; font-weight: 800; text-align: center; color: var(--pz-neon); line-height: 1; }
.pz-pieces-lbl { text-align: center; font-size: 0.76rem; color: var(--pz-muted); margin-bottom: 0.85rem; }
.pz-stepper { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; width: 100%; }
.pz-stepper input[type=range] { flex: 1; min-width: 0; accent-color: var(--pz-neon); }
.pz-chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem; margin: 0.7rem 0 0.85rem; width: 100%; }
.pz-chip { padding: 0.42rem 0.12rem; border-radius: 10px; border: 1px solid var(--pz-border); background: var(--pz-glass); color: var(--pz-muted); font: inherit; font-size: 0.76rem; font-weight: 700; cursor: pointer; }
.pz-chip.is-on { border-color: var(--pz-neon); background: var(--pz-neon-dim); color: var(--pz-neon); }
.pz-complete { text-align: center; padding: 1.25rem 1.15rem 1.4rem; max-width: min(440px, 100%); width: 100%; }
.pz-complete-art { width: 100%; border-radius: 14px; overflow: hidden; margin: 0.5rem 0; border: 1px solid rgba(34,230,197,0.3); box-shadow: 0 0 28px rgba(34,230,197,0.15); position: relative; background: rgba(0,0,0,0.25); }
.pz-complete-emoji { font-size: 2.4rem; margin-bottom: 0.25rem; }
.pz-stars { display: flex; justify-content: center; gap: 0.28rem; font-size: 1.55rem; margin: 0.45rem 0; }
.pz-star { opacity: 0.25; filter: grayscale(1); }
.pz-star.is-on { opacity: 1; filter: none; text-shadow: 0 0 12px rgba(255,200,80,0.5); }
.pz-complete-stats { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.55rem; color: var(--pz-muted); font-size: 0.8rem; margin-bottom: 0.85rem; }
.pz-complete-stats span { background: rgba(255,255,255,0.06); padding: 0.25rem 0.55rem; border-radius: 8px; }
.pz-complete-actions { display: flex; flex-direction: column; gap: 0.4rem; }
.pz-bottom { display: none; position: fixed; left: 50%; bottom: calc(12px + var(--pz-safe-b)); transform: translateX(-50%); z-index: 100; width: min(400px, calc(100% - 24px)); padding: 0.45rem 0.4rem; gap: 0.12rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(12,18,32,0.7)); backdrop-filter: blur(48px) saturate(2); box-shadow: 0 14px 48px rgba(0,0,0,0.55); }
.pz-bottom-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0.42rem 0.15rem; background: none; border: none; color: rgba(243,245,250,0.55); font: inherit; font-size: 0.58rem; font-weight: 600; cursor: pointer; border-radius: 999px; min-width: 0; }
.pz-bottom-item span:first-child { font-size: 1.2rem; line-height: 1.1; }
.pz-bottom-item.is-on { color: var(--pz-neon); background: rgba(34,230,197,0.16); }
.pz-section-title { font-size: 0.7rem; font-weight: 700; color: var(--pz-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.3rem 0 0.45rem; }
.pz-upcoming { display: flex; flex-direction: column; gap: 0.4rem; width: 100%; }
.pz-upcoming-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.85rem; border-radius: 14px; width: 100%; }
.pz-upcoming-lv { font-weight: 700; flex-shrink: 0; }
.pz-upcoming-pc { margin-right: auto; font-size: 0.76rem; color: var(--pz-muted); }
.pz-switch { position: relative; width: 52px; height: 32px; flex-shrink: 0; border: none; padding: 0; border-radius: 999px; background: rgba(255,255,255,0.12); cursor: pointer; }
.pz-switch.is-on { background: linear-gradient(180deg, #4af0d4, var(--pz-neon)); }
.pz-switch-knob { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(180deg, #fff, #e8eef8); box-shadow: 0 2px 6px rgba(0,0,0,0.35); transition: transform .25s cubic-bezier(0.34, 1.4, 0.64, 1); pointer-events: none; }
.pz-switch.is-on .pz-switch-knob { transform: translateX(20px); }
.pz-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 0; }
.pz-row + .pz-row { border-top: 1px solid rgba(255,255,255,0.08); }
.pz-row-label { font-weight: 600; font-size: 0.92rem; }
.pz-row-sub { font-size: 0.74rem; color: var(--pz-muted); margin-top: 2px; }
.pz-list-group { border-radius: 16px; overflow: hidden; background: linear-gradient(165deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(28px); padding: 0 1rem; }
.pz-empty { font-size: 0.82rem; color: var(--pz-muted); line-height: 1.5; padding: 0.4rem 0 0.85rem; }
.pz-inicio-spacer { width: 100%; height: 0; pointer-events: none; }
.pz-error { font-size: 0.76rem; color: var(--gco-secondary, #FF6B4A); }
@media (max-width: 900px) {
  .pz-sidebar { display: none !important; }
  .pz-bottom { display: flex; }
  .pz-main:not(.is-playing) .pz-content { padding-bottom: calc(var(--pz-nav-h) + var(--pz-safe-b) + 40px) !important; }
  .pz-inicio-spacer { height: calc(var(--pz-nav-h) + var(--pz-safe-b) + 32px); }
}
@media (min-width: 901px) { .pz-bottom { display: none !important; } .pz-sidebar { display: flex; } }
@container pz-shell (max-width: 900px) {
  .pz-sidebar { display: none !important; }
  .pz-bottom { display: flex; }
  .pz-main:not(.is-playing) .pz-content { padding-bottom: calc(var(--pz-nav-h) + var(--pz-safe-b) + 40px) !important; }
}
@container pz-shell (min-width: 901px) { .pz-bottom { display: none !important; } .pz-sidebar { display: flex; } }
@container pz-main (max-width: 520px) {
  .pz-img-grid { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
  .pz-level-card { width: 92px; }
  .pz-welcome-stats { width: 100%; margin-left: 0; }
}
`

function ImageCover({ image, className, style }: { image: PuzzleImage; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundImage: failed
          ? `linear-gradient(135deg, hsl(${image.fallbackHue} 55% 28%), hsl(${image.fallbackHue2} 50% 22%))`
          : `url(${image.src})`,
        backgroundColor: `hsl(${image.fallbackHue} 40% 20%)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!failed && <img src={image.src} alt="" style={{ display: 'none' }} onError={() => setFailed(true)} />}
    </div>
  )
}


/** Vista de la imagen completa con bordes de la forma de piezas de esa partida. */
function AssembledPuzzlePreview({
  image,
  cols,
  rows,
  shape,
  seed,
  showBorders,
}: {
  image: PuzzleImage
  cols: number
  rows: number
  shape: PieceShape
  seed: number
  showBorders: boolean
}) {
  const aspect = imageAspectOf(image)
  const safeAspect = aspect > 0.15 && aspect < 8 ? aspect : 16 / 10
  const edgeMap = useMemo(() => buildEdgeMap(cols, rows, seed), [cols, rows, seed])
  // Celdas de 100×100 para trazos visibles de bordes de pieza
  const U = 100
  const borderPaths = useMemo(() => {
    const list: { d: string; c: number; r: number }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        list.push({ d: buildPiecePath(U, U, 0, edgeMap[r][c], shape), c, r })
      }
    }
    return list
  }, [cols, rows, edgeMap, shape])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${safeAspect}`,
        borderRadius: 14,
        overflow: 'hidden',
        background: `hsl(${image.fallbackHue} 40% 16%)`,
        boxShadow: 'inset 0 0 0 1px rgba(34,230,197,0.25)',
      }}
    >
      <img
        src={image.src}
        alt={image.name}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          display: 'block',
        }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.opacity = '0'
        }}
      />
      {showBorders && (
        <svg
          viewBox={`0 0 ${cols * U} ${rows * U}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {borderPaths.map((p) => (
            <path
              key={`${p.r}-${p.c}`}
              d={p.d}
              transform={`translate(${p.c * U}, ${p.r * U})`}
              fill="rgba(34,230,197,0.04)"
              stroke="rgba(34,230,197,0.95)"
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
    </div>
  )
}

const PieceView = memo(function PieceView({
  piece, cellW, cellH, pad, shape, imageSrc, fallbackHue, boardPxW, boardPxH, showBorders, isHinted, dragging, lite,
}: {
  piece: JigsawPiece
  cellW: number
  cellH: number
  pad: number
  shape: PieceShape
  imageSrc: string
  fallbackHue: number
  boardPxW: number
  boardPxH: number
  showBorders: boolean
  isHinted: boolean
  dragging: boolean
  /** Modo ligero: menos efectos SVG para miles de piezas en móvil */
  lite?: boolean
}) {
  const w = cellW + pad * 2
  const h = cellH + pad * 2
  const path = useMemo(
    () => buildPiecePath(cellW, cellH, pad, piece.edges, shape),
    [cellW, cellH, pad, piece.edges, shape],
  )
  const clipId = `clip-${piece.id}`
  const imgX = pad - piece.col * cellW
  const imgY = pad - piece.row * cellH
  const rot = piece.rotation
  const scale = dragging && !lite ? 1.04 : 1
  const transform =
    rot || scale !== 1
      ? `${rot ? `rotate(${rot}deg)` : ''}${scale !== 1 ? ` scale(${scale})` : ''}`.trim()
      : undefined

  return (
    <div
      className={`pz-piece${piece.locked ? ' is-locked' : ''}${dragging ? ' is-dragging' : ''}${isHinted ? ' is-hint' : ''}`}
      data-piece-id={piece.id}
      style={{
        left: piece.x * cellW - pad,
        top: piece.y * cellH - pad,
        width: w,
        height: h,
        zIndex: piece.locked ? 1 : piece.z,
        transform,
        transformOrigin: 'center center',
        // Evita pintar piezas fuera de pantalla (mejor en listas grandes)
        contentVisibility: 'auto',
        containIntrinsicSize: `${w}px ${h}px`,
      }}
    >
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {!lite && (
            <rect x={imgX} y={imgY} width={boardPxW} height={boardPxH} fill={`hsl(${fallbackHue} 40% 22%)`} />
          )}
          <image
            href={imageSrc}
            x={imgX}
            y={imgY}
            width={boardPxW}
            height={boardPxH}
            preserveAspectRatio="none"
          />
        </g>
        {showBorders && !lite && (
          <path
            d={path}
            fill="none"
            stroke={piece.locked ? 'rgba(34,230,197,0.5)' : 'rgba(255,255,255,0.35)'}
            strokeWidth={1}
          />
        )}
        {showBorders && lite && (
          <path d={path} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} />
        )}
      </svg>
    </div>
  )
}, (prev, next) => {
  // Comparación fina: evita re-render de piezas quietas durante el drag
  return (
    prev.piece === next.piece ||
    (prev.piece.x === next.piece.x &&
      prev.piece.y === next.piece.y &&
      prev.piece.z === next.piece.z &&
      prev.piece.locked === next.piece.locked &&
      prev.piece.rotation === next.piece.rotation &&
      prev.dragging === next.dragging &&
      prev.isHinted === next.isHinted &&
      prev.showBorders === next.showBorders &&
      prev.cellW === next.cellW &&
      prev.cellH === next.cellH &&
      prev.pad === next.pad &&
      prev.shape === next.shape &&
      prev.imageSrc === next.imageSrc &&
      prev.lite === next.lite)
  )
})

export function RompecabezasGame({ onExit, userName: _userName = 'Jugador' }: RompecabezasGameProps) {
  void _userName
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('normal')
  const [progress, setProgress] = useState<PuzzleProgress>(() => loadPuzzleProgress())
  const [stats, setStats] = useState<PuzzleStats>(() => loadStats())
  const [isTouch, setIsTouch] = useState(false)
  const [settings, setSettings] = useState<PuzzleSettings>(() => loadSettings())
  const [customImages, setCustomImages] = useState<PuzzleImage[]>(() => loadCustomImages())
  const [savedLevels, setSavedLevels] = useState<SavedCreativeLevel[]>(() => loadCreativeLevels())
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [levelNameDraft, setLevelNameDraft] = useState('')
  const [creativeImage, setCreativeImage] = useState<PuzzleImage>(DEFAULT_IMAGES[0])
  const [creativePieces, setCreativePieces] = useState(30)
  const [creativeShape, setCreativeShape] = useState<PieceShape>(() => loadSettings().defaultShape)
  const [creativeDifficulty, setCreativeDifficulty] = useState<Difficulty>(() => loadSettings().defaultDifficulty)
  const [normalDifficulty, setNormalDifficulty] = useState<Difficulty>(() => loadSettings().defaultDifficulty)
  /** 0 = infinito en creativo */
  const [creativeTimeLimit, setCreativeTimeLimit] = useState(0)
  const [historyDetail, setHistoryDetail] = useState<HistoryEntry | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'todos' | 'normal' | 'creativo'>('todos')
  /** Reto: superar un récord previo (ms del récord a batir) */
  const [challengeMs, setChallengeMs] = useState<number | null>(null)
  const [timeUp, setTimeUp] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imagePickerTab, setImagePickerTab] = useState<'defecto' | 'mias'>('defecto')
  const [piecesModalOpen, setPiecesModalOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [activeLevel, setActiveLevel] = useState<JigsawLevel | null>(null)
  const [pieces, setPieces] = useState<JigsawPiece[]>([])
  const [playOrigin, setPlayOrigin] = useState<PlayOrigin>('normal')
  const [activeCreativeId, setActiveCreativeId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showBorders, setShowBorders] = useState(true)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintPieceId, setHintPieceId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [completion, setCompletion] = useState<CompletionInfo | null>(null)
  const [completionBorders, setCompletionBorders] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [groupOf, setGroupOf] = useState<Record<string, string>>({})
  const [hudPos, setHudPos] = useState<{ x: number; y: number } | null>(null)
  const hudDragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [arenaSize, setArenaSize] = useState({ w: 360, h: 420 })
  const snapTimesRef = useRef<number[]>([])
  const lastSnapAtRef = useRef<number | null>(null)
  const timerBaseRef = useRef<number | null>(null)
  const timerAccumRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const arenaScrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string; startX: number; startY: number; originX: number; originY: number
    pointerId: number; moved: boolean; groupOrigins?: Record<string, { x: number; y: number }>
  } | null>(null)
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  const groupOfRef = useRef(groupOf)
  groupOfRef.current = groupOf
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const cellSizeRef = useRef({ cellW: 40, cellH: 40 })
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  const timeWarnRef = useRef(false)
  const dragLiveRef = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
    pointerId: number
    moved: boolean
    /** Posiciones de origen de todo el grupo al iniciar el drag (para tracking estable) */
    groupOrigins: Record<string, { x: number; y: number }>
  } | null>(null)

  useEffect(() => { setIsTouch(isTouchDevice()) }, [])
  const sound = useJigsawSound(settings.sound)
  const imagePool = useMemo(() => [...DEFAULT_IMAGES, ...customImages], [customImages])
  const galleryGrouped = useMemo(() => imagesByCategory(DEFAULT_IMAGES), [])

  useEffect(() => {
    const el = arenaScrollRef.current
    if (!el || screen !== 'play') return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setArenaSize({ w: Math.floor(cr.width), h: Math.floor(cr.height) })
    })
    ro.observe(el)
    setArenaSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [screen, fullscreen])

  useEffect(() => {
    if (screen !== 'play' || paused || completion) {
      if (timerBaseRef.current != null) {
        timerAccumRef.current += performance.now() - timerBaseRef.current
        timerBaseRef.current = null
      }
      return
    }
    timerBaseRef.current = performance.now()
    const id = window.setInterval(() => {
      if (timerBaseRef.current == null) return
      setElapsedMs(timerAccumRef.current + (performance.now() - timerBaseRef.current))
    }, 200)
    return () => clearInterval(id)
  }, [screen, paused, completion])

  // Modo difícil: rotación automática cada 20 s (solo piezas sueltas; grupos giran juntos)
  useEffect(() => {
    if (screen !== 'play' || !activeLevel || activeLevel.difficulty !== 'dificil' || paused || completion) return
    const id = window.setInterval(() => {
      setPieces((prev) => {
        const groups = groupOfRef.current
        const rotatedIds = new Set<string>()
        const next = prev.map((p) => {
          if (p.locked || p.id === draggingId || rotatedIds.has(p.id)) return p
          // Solo gira un subconjunto aleatorio de piezas/grupos (~40 %)
          if (Math.random() > 0.4) return p
          const gid = groups[p.id]
          if (gid) {
            // Grupo conectado: girar todas las piezas del grupo a la vez
            const members = prev.filter((x) => !x.locked && groups[x.id] === gid)
            for (const m of members) rotatedIds.add(m.id)
            return { ...p, rotation: ((p.rotation + 90) % 360) as PieceRotation }
          }
          rotatedIds.add(p.id)
          return { ...p, rotation: ((p.rotation + 90) % 360) as PieceRotation }
        })
        // Segunda pasada: aplicar la misma rotación a hermanos de grupo ya marcados
        return next.map((p) => {
          if (p.locked || !rotatedIds.has(p.id)) return p
          const gid = groups[p.id]
          if (!gid) return p
          // Asegurar misma rotación que el primer miembro del grupo
          const first = next.find((x) => groups[x.id] === gid && rotatedIds.has(x.id))
          if (!first) return p
          return { ...p, rotation: first.rotation }
        })
      })
      sound.playAutoRotate()
    }, 20000)
    return () => clearInterval(id)
  }, [screen, activeLevel, paused, completion, draggingId, sound])

  // Aviso sonoro cuando quedan < 15s
  useEffect(() => {
    if (screen !== 'play' || !activeLevel || paused || completion || timeUp) return
    if (!activeLevel.targetSeconds || activeLevel.targetSeconds <= 0) return
    const remain = activeLevel.targetSeconds * 1000 - elapsedMs
    if (remain > 0 && remain <= 15000 && !timeWarnRef.current) {
      timeWarnRef.current = true
      sound.playTimeWarn()
    }
  }, [elapsedMs, screen, activeLevel, paused, completion, timeUp, sound])

  // Límite de tiempo del nivel (targetSeconds > 0)
  useEffect(() => {
    if (screen !== 'play' || !activeLevel || paused || completion || timeUp) return
    if (!activeLevel.targetSeconds || activeLevel.targetSeconds <= 0) return
    const limitMs = activeLevel.targetSeconds * 1000
    if (elapsedMs < limitMs) return
    setTimeUp(true)
    const timeMs = limitMs
    sound.playFail()
    setStats((st) => {
      const updated: PuzzleStats = { ...st, losses: st.losses + 1, totalPlayMs: st.totalPlayMs + timeMs }
      saveStats(updated)
      return updated
    })
    setCompletion({
      stars: 0,
      timeMs,
      avgMsPerPiece: timeMs / Math.max(1, activeLevel.pieces),
      fastestSnapMs: snapTimesRef.current.length ? Math.min(...snapTimesRef.current) : null,
      snaps: snapTimesRef.current.length,
      difficulty: activeLevel.difficulty,
      timedOut: true,
      beatRecord: challengeMs != null ? false : undefined,
      challengeMs,
    })
  }, [elapsedMs, screen, activeLevel, paused, completion, timeUp, challengeMs])

  const resetTimer = () => {
    timerBaseRef.current = performance.now()
    timerAccumRef.current = 0
    setElapsedMs(0)
    snapTimesRef.current = []
    lastSnapAtRef.current = null
    timeWarnRef.current = false
  }

  const updateSettings = (patch: Partial<PuzzleSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  const goBackToLogica = useCallback(() => {
    if (onExit) { onExit(); return }
    navigate('/categoria/logica')
  }, [onExit, navigate])

  const handleBack = () => {
    if (screen === 'play') {
      if (!completion) {
        const timeMs = timerAccumRef.current + (timerBaseRef.current != null ? performance.now() - timerBaseRef.current : 0)
        setStats((st) => {
          const updated: PuzzleStats = { ...st, losses: st.losses + 1, totalPlayMs: st.totalPlayMs + timeMs }
          saveStats(updated)
          return updated
        })
      }
      setFullscreen(false)
      setScreen(playOrigin === 'normal' ? 'normal' : 'creativo')
      setActiveLevel(null); setPieces([]); setCompletion(null); setGroupOf({}); setActiveCreativeId(null)
      setChallengeMs(null); setTimeUp(false)
      return
    }
    if (screen === 'normal') { goBackToLogica(); return }
    setScreen('normal')
  }

  const recordSnap = () => {
    const now = performance.now()
    if (lastSnapAtRef.current != null) snapTimesRef.current.push(now - lastSnapAtRef.current)
    lastSnapAtRef.current = now
  }

  const finishLevel = useCallback((timeMs: number, stars: 0 | 1 | 2 | 3, nextPieces: JigsawPiece[]) => {
    if (!activeLevel) return
    const snaps = snapTimesRef.current
    const avgMsPerPiece = snaps.length ? snaps.reduce((a, b) => a + b, 0) / snaps.length : timeMs / Math.max(1, nextPieces.length)
    const fastestSnapMs = snaps.length ? Math.min(...snaps) : null
    const difficulty = activeLevel.difficulty
    const beatRecord = challengeMs != null ? timeMs < challengeMs : undefined
    setCompletion({
      stars, timeMs, avgMsPerPiece, fastestSnapMs, snaps: snaps.length, difficulty,
      beatRecord: beatRecord === true ? true : beatRecord === false ? false : undefined,
      challengeMs,
      timedOut: false,
    })
    setCompletionBorders(true)
    sound.playComplete()
    setStats((st) => {
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        at: Date.now(),
        mode: playOrigin,
        level: activeLevel.level,
        pieces: activeLevel.pieces,
        stars,
        timeMs,
        difficulty,
        avgMsPerPiece,
        fastestSnapMs,
        creativeLevelId: activeCreativeId ?? undefined,
        creativeLevelName: activeCreativeId ? savedLevels.find((l) => l.id === activeCreativeId)?.name : undefined,
        image: activeLevel.image,
        shape: activeLevel.shape,
        timeLimitSeconds: activeLevel.targetSeconds,
        cols: activeLevel.cols,
        rows: activeLevel.rows,
        seed: activeLevel.seed,
        beatRecord: beatRecord === true ? true : beatRecord === false ? false : undefined,
        challengeVsMs: challengeMs ?? undefined,
      }
      const history = [entry, ...st.history]
      const creativeHistory = { ...st.creativeHistory }
      if (playOrigin === 'creativo' && activeCreativeId) {
        creativeHistory[activeCreativeId] = [entry, ...(creativeHistory[activeCreativeId] ?? [])]
      }
      const updated: PuzzleStats = { wins: st.wins + 1, losses: st.losses, totalPlayMs: st.totalPlayMs + timeMs, history, creativeHistory }
      saveStats(updated)
      return updated
    })
    if (playOrigin === 'normal') {
      setProgress((pr) => {
        const nextLevel = Math.max(pr.normalLevel, activeLevel.level + 1)
        const prevStars = pr.starsByLevel[activeLevel.level] ?? 0
        const best = (stars > prevStars ? stars : prevStars) as 0 | 1 | 2 | 3
        const starsByLevel = { ...pr.starsByLevel, [activeLevel.level]: best }
        const totalStars = (Object.values(starsByLevel) as number[]).reduce((sum, n) => sum + n, 0)
        const difficultyByLevel = { ...(pr.difficultyByLevel ?? {}), [activeLevel.level]: difficulty }
        const updated: PuzzleProgress = { ...pr, normalLevel: nextLevel, starsByLevel, totalStars, difficultyByLevel }
        savePuzzleProgress(updated)
        return updated
      })
    }
  }, [activeLevel, playOrigin, activeCreativeId, savedLevels, sound, challengeMs])

  const startNormalLevel = useCallback((level: number, difficulty?: Difficulty, challenge?: number | null) => {
    const diff = difficulty ?? normalDifficulty
    const data = generateJigsawLevel(level, imagePool, { difficulty: diff })
    const pcs = createPieces(data, data.seed + 17, diff)
    setActiveLevel(data); setPieces(pcs); setPlayOrigin('normal'); setActiveCreativeId(null)
    setHintsUsed(0); setHintPieceId(null); setShowPreview(false); setShowBorders(true)
    setZoom(1); setPaused(false); setCompletion(null); setDraggingId(null); setFullscreen(false); setGroupOf({})
    setChallengeMs(challenge ?? null); setTimeUp(false)
    resetTimer(); setScreen('play')
  }, [imagePool, normalDifficulty])

  const persistSavedLevels = (list: SavedCreativeLevel[]) => { setSavedLevels(list); saveCreativeLevels(list) }

  const saveCurrentAsLevel = () => {
    const name = levelNameDraft.trim() || `${creativeImage.name} · ${creativePieces} pz`
    if (editingLevelId) {
      persistSavedLevels(savedLevels.map((l) => l.id === editingLevelId
        ? { ...l, name, image: creativeImage, pieces: creativePieces, shape: creativeShape, difficulty: creativeDifficulty, timeLimitSeconds: creativeTimeLimit, updatedAt: Date.now() }
        : l))
      setEditingLevelId(null); setLevelNameDraft(''); return
    }
    const entry: SavedCreativeLevel = {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name, image: creativeImage, pieces: creativePieces, shape: creativeShape,
      difficulty: creativeDifficulty, timeLimitSeconds: creativeTimeLimit,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    persistSavedLevels([entry, ...savedLevels])
    setLevelNameDraft('')
  }

  const loadSavedLevel = (lv: SavedCreativeLevel) => {
    setCreativeImage(lv.image); setCreativePieces(lv.pieces); setCreativeShape(lv.shape)
    setCreativeDifficulty(lv.difficulty ?? 'facil')
    setCreativeTimeLimit(lv.timeLimitSeconds ?? 0)
    setLevelNameDraft(lv.name); setEditingLevelId(lv.id)
  }
  const deleteSavedLevel = (id: string) => {
    if (!window.confirm('¿Borrar este nivel guardado?')) return
    persistSavedLevels(savedLevels.filter((l) => l.id !== id))
    if (editingLevelId === id) { setEditingLevelId(null); setLevelNameDraft('') }
  }

  const playSavedLevel = (lv: SavedCreativeLevel, challenge?: number | null) => {
    const diff = lv.difficulty ?? 'facil'
    const data = generateCreativeJigsaw({
      image: lv.image, pieces: lv.pieces, shape: lv.shape, difficulty: diff,
      timeLimitSeconds: lv.timeLimitSeconds ?? 0,
    })
    const pcs = createPieces(data, data.seed + 31, diff)
    setActiveLevel(data); setPieces(pcs); setPlayOrigin('creativo'); setActiveCreativeId(lv.id)
    setHintsUsed(0); setHintPieceId(null); setShowPreview(false); setShowBorders(true)
    setZoom(1); setPaused(false); setCompletion(null); setDraggingId(null); setFullscreen(false); setGroupOf({})
    setChallengeMs(challenge ?? null); setTimeUp(false)
    resetTimer(); setScreen('play')
  }

  const startCreative = useCallback((challenge?: number | null) => {
    const data = generateCreativeJigsaw({
      image: creativeImage, pieces: creativePieces, shape: creativeShape, difficulty: creativeDifficulty,
      timeLimitSeconds: creativeTimeLimit,
    })
    const pcs = createPieces(data, data.seed + 31, creativeDifficulty)
    setActiveLevel(data); setPieces(pcs); setPlayOrigin('creativo')
    setActiveCreativeId(editingLevelId)
    setHintsUsed(0); setHintPieceId(null); setShowPreview(false); setShowBorders(true)
    setZoom(1); setPaused(false); setCompletion(null); setDraggingId(null); setFullscreen(false); setGroupOf({})
    setChallengeMs(challenge ?? null); setTimeUp(false)
    resetTimer(); setScreen('play')
  }, [creativeImage, creativePieces, creativeShape, creativeDifficulty, creativeTimeLimit, editingLevelId])

  /** Repite una partida del historial con la misma imagen, forma, piezas, dificultad y límite de tiempo. */
  const startFromHistory = useCallback((h: HistoryEntry, withChallenge = true) => {
    const image = h.image ?? DEFAULT_IMAGES[0]
    const shape = h.shape ?? 'classic'
    const difficulty = h.difficulty ?? 'facil'
    const pieces = h.pieces
    const timeLimitSeconds = h.timeLimitSeconds ?? 0
    const { cols, rows } = gridForPieces(pieces)
    const total = cols * rows
    const seed = levelSeed(h.level > 0 ? h.level : total, 9100 + (h.at % 9999))
    const data: JigsawLevel = {
      level: h.mode === 'normal' ? h.level : 0,
      pieces: total,
      cols,
      rows,
      shape,
      image,
      targetSeconds: timeLimitSeconds,
      hints: hintsForPieces(total),
      seed,
      goal: timeLimitSeconds > 0
        ? `Repite la partida: ${total} piezas · límite ${Math.floor(timeLimitSeconds / 60)}m ${timeLimitSeconds % 60}s`
        : `Repite la partida: ${total} piezas sin límite de tiempo`,
      difficulty,
      imageAspect: imageAspectOf(image),
    }
    const pcs = createPieces(data, seed + 41, difficulty)
    setActiveLevel(data)
    setPieces(pcs)
    setPlayOrigin(h.mode)
    setActiveCreativeId(h.creativeLevelId ?? null)
    setHintsUsed(0)
    setHintPieceId(null)
    setShowPreview(false)
    setShowBorders(true)
    setZoom(1)
    setPaused(false)
    setCompletion(null)
    setDraggingId(null)
    setFullscreen(false)
    setGroupOf({})
    setChallengeMs(withChallenge ? h.timeMs : null)
    setTimeUp(false)
    // Sincroniza creativo por si vuelve al menú
    setCreativeImage(image)
    setCreativePieces(total)
    setCreativeShape(shape)
    setCreativeDifficulty(difficulty)
    setCreativeTimeLimit(timeLimitSeconds)
    if (h.mode === 'normal') setNormalDifficulty(difficulty)
    resetTimer()
    setScreen('play')
  }, [])

  const togglePause = () => setPaused((p) => !p)

  const trayCols = activeLevel ? Math.max(3, Math.min(activeLevel.cols + 2, Math.ceil(Math.sqrt(activeLevel.pieces * 1.5)))) : 4
  const trayRows = activeLevel ? Math.ceil(activeLevel.pieces / trayCols) : 2
  const { cellW, cellH } = useMemo(() => {
    if (!activeLevel) return { cellW: 40, cellH: 40 }
    return fitBoardCells(
      activeLevel.cols,
      activeLevel.rows,
      arenaSize.w,
      arenaSize.h,
      trayRows,
      activeLevel.imageAspect || imageAspectOf(activeLevel.image),
    )
  }, [activeLevel, arenaSize, trayRows])
  const padPx = useMemo(() => {
    if (!activeLevel) return 10
    return pieceTabPad(cellW, cellH, activeLevel.shape)
  }, [activeLevel, cellW, cellH])
  const boardPxW = activeLevel ? activeLevel.cols * cellW : 0
  const boardPxH = activeLevel ? activeLevel.rows * cellH : 0
  const arenaWidthPx = boardPxW + padPx * 2 + 48
  const arenaHeightPx = boardPxH + padPx * 2 + trayRows * Math.min(cellW, cellH) * 1.25 + 72

  // Actualiza medidas de celda para el drag (evita valores stale de React)
  cellSizeRef.current = { cellW, cellH }

  /**
   * Rota una pieza o, si forma parte de un grupo conectado, rota el grupo entero
   * a la vez. Las piezas locked en el tablero no rotan nunca.
   */
  const rotatePiece = (id: string) => {
    if (!activeLevel || activeLevel.difficulty === 'facil') return
    const groups = groupOfRef.current
    const gid = groups[id]
    const memberIds = new Set<string>()
    if (gid) {
      for (const [pid, g] of Object.entries(groups)) {
        if (g === gid) memberIds.add(pid)
      }
    } else {
      memberIds.add(id)
    }
    let didRotate = false
    setPieces((prev) =>
      prev.map((p) => {
        if (p.locked || !memberIds.has(p.id)) return p
        didRotate = true
        return { ...p, rotation: ((p.rotation + 90) % 360) as PieceRotation }
      }),
    )
    if (didRotate) {
      if (memberIds.size > 1) sound.playRotateGroup()
      else sound.playRotate()
      if (settings.haptics && isTouch) vibrate(6)
    }
  }

  const handleArenaPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || completion || !activeLevel) return
    const target = (e.target as HTMLElement).closest('[data-piece-id]') as HTMLElement | null
    if (!target) return
    const id = target.dataset.pieceId
    if (!id) return
    const piece = piecesRef.current.find((p) => p.id === id)
    if (!piece || piece.locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const groups = groupOfRef.current
    const gid = groups[id]
    const groupOrigins: Record<string, { x: number; y: number }> = {}
    for (const p of piecesRef.current) {
      if (p.locked) continue
      if (p.id === id || (gid && groups[p.id] === gid)) {
        groupOrigins[p.id] = { x: p.x, y: p.y }
      }
    }
    const live = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      originX: piece.x,
      originY: piece.y,
      pointerId: e.pointerId,
      moved: false,
      groupOrigins,
    }
    dragRef.current = live
    dragLiveRef.current = live
    setDraggingId(id)
    arenaScrollRef.current?.classList.add('is-dragging-piece')
    sound.playPickup()
    setPieces((prev) => {
      const maxZ = Math.max(...prev.map((p) => p.z), 1)
      return prev.map((p) =>
        p.id === id || (gid && groups[p.id] === gid) ? { ...p, z: maxZ + 1 } : p,
      )
    })
  }

  const handleArenaPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragLiveRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    const { cellW: cw, cellH: ch } = cellSizeRef.current
    const z = zoomRef.current || 1
    // Coordenadas en unidades de celda: el arena está escalado con CSS transform
    const dx = (e.clientX - drag.startX) / (cw * z)
    const dy = (e.clientY - drag.startY) / (ch * z)
    if (Math.abs(dx) > 0.015 || Math.abs(dy) > 0.015) drag.moved = true
    // Posiciona desde orígenes fijos del inicio del drag → la pieza sigue al puntero sin deriva
    setPieces((prev) =>
      prev.map((p) => {
        if (p.locked) return p
        const o = drag.groupOrigins[p.id]
        if (!o) return p
        return { ...p, x: o.x + dx, y: o.y + dy }
      }),
    )
  }

  const finishDrag = useCallback((pointerId: number) => {
    const drag = dragLiveRef.current ?? dragRef.current
    if (!drag || drag.pointerId !== pointerId || !activeLevel) return
    const wasTap = !drag.moved
    dragRef.current = null
    dragLiveRef.current = null
    setDraggingId(null)
    arenaScrollRef.current?.classList.remove('is-dragging-piece')

    if (wasTap && (activeLevel.difficulty === 'normal' || activeLevel.difficulty === 'dificil')) {
      rotatePiece(drag.id)
      return
    }

    sound.playDrop()

    const groupsSnap = groupOfRef.current
    setPieces((prev) => {
      const piece = prev.find((p) => p.id === drag.id)
      if (!piece || piece.locked) return prev

      const gids = (() => {
        const gid = groupsSnap[drag.id]
        if (!gid) return [drag.id]
        const members = prev.filter((p) => !p.locked && groupsSnap[p.id] === gid).map((p) => p.id)
        return members.length ? members : [drag.id]
      })()

      const groupSize = gids.length
      const primary = prev.find((p) => p.id === drag.id)!
      const allRotationOk = gids.every((id) => {
        const p = prev.find((x) => x.id === id)
        return p && p.rotation === 0
      })
      const distBoard = distanceToCorrect(primary)

      // Lock al tablero si: grupo >= 2, O al menos una pieza del grupo es vecina ortogonal de una ya locked
      const touchesLockedBoard = gids.some((gid) => {
        const gp = prev.find((x) => x.id === gid)
        if (!gp) return false
        return prev.some((other) => {
          if (!other.locked) return false
          const dr = Math.abs(gp.row - other.row)
          const dc = Math.abs(gp.col - other.col)
          return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
        })
      })
      const canLockToBoard =
        allRotationOk &&
        distBoard <= SNAP_THRESHOLD_CELLS &&
        (groupSize >= 2 || touchesLockedBoard)

      if (canLockToBoard) {
        const next = prev.map((p) =>
          gids.includes(p.id) ? { ...p, x: p.correctX, y: p.correctY, locked: true, z: 0, rotation: 0 as PieceRotation } : p
        )
        sound.playLock()
        if (settings.haptics && isTouch) vibrate(12)
        recordSnap()
        setGroupOf((go) => {
          const n = { ...go }
          for (const id of gids) delete n[id]
          return n
        })
        if (isPuzzleComplete(next)) {
          const timeMs = timerAccumRef.current + (timerBaseRef.current != null ? performance.now() - timerBaseRef.current : 0)
          const stars = calcJigsawStars(timeMs, activeLevel.targetSeconds, hintsUsed, activeLevel.hints)
          window.setTimeout(() => finishLevel(timeMs, stars, next), 280)
        }
        return next
      }

      let nextPieces = prev
      let nextGroups = { ...groupsSnap }
      const THRESH = SNAP_THRESHOLD_CELLS * 1.08
      const isOrthogonalNeighbor = (a: { row: number; col: number }, b: { row: number; col: number }) => {
        const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col)
        return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
      }
      type Candidate = { fromId: string; toId: string; err: number; shiftX: number; shiftY: number }
      let best: Candidate | null = null
      const draggedSet = new Set(gids)
      const draggedPieces = prev.filter((p) => draggedSet.has(p.id) && !p.locked && p.rotation === 0)
      const others = prev.filter((p) => !p.locked && !draggedSet.has(p.id) && p.rotation === 0)
      for (const from of draggedPieces) {
        for (const to of others) {
          if (!isOrthogonalNeighbor(from, to)) continue
          const dx = from.x - to.x, dy = from.y - to.y
          const cdx = from.correctX - to.correctX, cdy = from.correctY - to.correctY
          const err = Math.hypot(dx - cdx, dy - cdy)
          if (err > THRESH) continue
          const shiftX = to.x + cdx - from.x, shiftY = to.y + cdy - from.y
          if (!best || err < best.err) best = { fromId: from.id, toId: to.id, err, shiftX, shiftY }
        }
      }
      if (best) {
        nextPieces = nextPieces.map((p) =>
          draggedSet.has(p.id) ? { ...p, x: p.x + best!.shiftX, y: p.y + best!.shiftY } : p
        )
        const toPiece = prev.find((p) => p.id === best!.toId)!
        const otherG = nextGroups[toPiece.id] ?? `g-${toPiece.id}`
        const myG = nextGroups[drag.id] ?? `g-${drag.id}`
        const otherMembers = new Set<string>([toPiece.id])
        for (const [id, g] of Object.entries(nextGroups)) if (g === otherG) otherMembers.add(id)
        for (const id of draggedSet) nextGroups[id] = otherG
        for (const id of otherMembers) nextGroups[id] = otherG
        for (const [id, g] of Object.entries(nextGroups)) if (g === myG) nextGroups[id] = otherG
        sound.playGroup()
        if (settings.haptics && isTouch) vibrate(8)
        recordSnap()
      }
      setGroupOf(nextGroups)
      return nextPieces
    })
  }, [activeLevel, hintsUsed, settings.haptics, sound, isTouch, finishLevel])

  const handleArenaPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => { finishDrag(e.pointerId) }

  const panTouchRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  // Listeners nativos no-pasivos: pan horizontal/vertical + pellizco sin zoom de la PWA
  useEffect(() => {
    const el = arenaScrollRef.current
    if (!el || screen !== 'play') return
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) {
        ev.preventDefault()
        return
      }
      // Pan manual (horizontal y vertical) cuando no se arrastra una pieza
      if (ev.touches.length === 1 && panTouchRef.current && !dragLiveRef.current) {
        ev.preventDefault()
        const t = ev.touches[0]
        const dx = t.clientX - panTouchRef.current.x
        const dy = t.clientY - panTouchRef.current.y
        el.scrollLeft = panTouchRef.current.left - dx
        el.scrollTop = panTouchRef.current.top - dy
      }
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [screen, fullscreen])


  const onArenaTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      panTouchRef.current = null
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      pinchRef.current = { dist: Math.max(1, d), zoom: zoomRef.current }
      arenaScrollRef.current?.classList.add('is-pinching')
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const target = (t.target as HTMLElement).closest?.('[data-piece-id]')
      // Si no toca una pieza, habilita pan del scroll (X e Y)
      if (!target && arenaScrollRef.current && !dragLiveRef.current) {
        panTouchRef.current = {
          x: t.clientX,
          y: t.clientY,
          left: arenaScrollRef.current.scrollLeft,
          top: arenaScrollRef.current.scrollTop,
        }
      } else {
        panTouchRef.current = null
      }
    }
  }
  const onArenaTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const ratio = d / pinchRef.current.dist
      setZoom(Math.max(0.35, Math.min(3.2, +(pinchRef.current.zoom * ratio).toFixed(2))))
      return
    }
    if (e.touches.length === 1 && panTouchRef.current && arenaScrollRef.current && !dragLiveRef.current) {
      e.preventDefault()
      const t = e.touches[0]
      const dx = t.clientX - panTouchRef.current.x
      const dy = t.clientY - panTouchRef.current.y
      arenaScrollRef.current.scrollLeft = panTouchRef.current.left - dx
      arenaScrollRef.current.scrollTop = panTouchRef.current.top - dy
    }
  }
  const onArenaTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchRef.current = null
      arenaScrollRef.current?.classList.remove('is-pinching')
    }
    if (e.touches.length === 0) panTouchRef.current = null
  }

  const useHint = () => {
    if (!activeLevel || completion) return
    if (hintsUsed >= activeLevel.hints) return
    const unlocked = pieces.filter((p) => !p.locked)
    if (!unlocked.length) return
    const target = unlocked[Math.floor(Math.random() * unlocked.length)]
    setPieces((prev) =>
      prev.map((p) => (p.id === target.id ? { ...p, x: p.correctX, y: p.correctY, locked: true, z: 0, rotation: 0 as PieceRotation } : p))
    )
    setHintsUsed((h) => h + 1)
    setHintPieceId(target.id)
    sound.playHint()
    recordSnap()
    window.setTimeout(() => setHintPieceId(null), 1200)
    window.setTimeout(() => {
      setPieces((prev) => {
        if (isPuzzleComplete(prev) && activeLevel) {
          const timeMs = timerAccumRef.current + (timerBaseRef.current != null ? performance.now() - timerBaseRef.current : 0)
          const stars = calcJigsawStars(timeMs, activeLevel.targetSeconds, hintsUsed + 1, activeLevel.hints)
          finishLevel(timeMs, stars, prev)
        }
        return prev
      })
    }, 100)
  }

  const onHudPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    hudDragRef.current = { ox: hudPos?.x ?? rect.left, oy: hudPos?.y ?? rect.top, sx: e.clientX, sy: e.clientY }
  }
  const onHudPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = hudDragRef.current
    if (!d) return
    setHudPos({
      x: Math.max(4, Math.min(window.innerWidth - 120, d.ox + (e.clientX - d.sx))),
      y: Math.max(4, Math.min(window.innerHeight - 40, d.oy + (e.clientY - d.sy))),
    })
  }
  const onHudPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    hudDragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
  }

  const fitToScreen = () => {
    setZoom(1)
    arenaScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }

  const handleImportFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    setImportError(null)
    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      const okType = /^image\/(jpeg|jpg|png|webp|heic|heif|gif|bmp)$/i.test(file.type)
        || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)
      if (!okType) {
        rejected.push(file.name)
        continue
      }
      accepted.push(file)
    }
    if (!accepted.length) {
      setImportError('Ningún archivo válido. Usa JPG, PNG o WEBP.')
      setImporting(false)
      return
    }
    let lastImg: PuzzleImage | null = null
    let okCount = 0
    const errors: string[] = []
    // Importa en serie para no saturar memoria en móvil
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i]
      try {
        const dataUrl = await compressImageFile(file, 1600, 0.82)
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const im = new Image()
          im.onload = () => resolve({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height })
          im.onerror = () => resolve({ w: 1, h: 1 })
          im.src = dataUrl
        })
        const hue = Math.floor(Math.random() * 360)
        const img: PuzzleImage = {
          id: `custom-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 48) || `Imagen ${okCount + 1}`,
          category: 'custom',
          src: dataUrl,
          isCustom: true,
          fallbackHue: hue,
          fallbackHue2: (hue + 40) % 360,
          naturalWidth: dims.w,
          naturalHeight: dims.h,
        }
        const list = addCustomImage(img)
        setCustomImages(list)
        lastImg = img
        okCount++
      } catch {
        errors.push(file.name)
      }
    }
    if (lastImg) setCreativeImage(lastImg)
    if (okCount > 0 && errors.length === 0 && rejected.length === 0) {
      setImportError(null)
    } else if (okCount > 0) {
      setImportError(
        `Importadas ${okCount}. ` +
          (rejected.length ? `Omitidas: ${rejected.slice(0, 3).join(', ')}. ` : '') +
          (errors.length ? `Fallaron: ${errors.slice(0, 3).join(', ')}.` : ''),
      )
    } else {
      setImportError('No se pudo importar. Puede que el almacenamiento del navegador esté lleno.')
    }
    setImporting(false)
  }

  const handleDeleteCustomImage = (id: string) => {
    const list = removeCustomImage(id)
    setCustomImages(list)
    if (creativeImage.id === id) setCreativeImage(DEFAULT_IMAGES[0])
  }

  const currentNormalLevel = progress.normalLevel
  const tierInfo = pieceTierInfoForLevel(currentNormalLevel)
  const cycleCreativeImage = (dir: -1 | 1) => {
    const pool = DEFAULT_IMAGES
    const idx = pool.findIndex((i) => i.id === creativeImage.id)
    const base = idx >= 0 ? idx : 0
    setCreativeImage(pool[(base + dir + pool.length) % pool.length])
  }

  function renderNormal() {
    const current = currentNormalLevel
    const pastAndCurrent = Array.from({ length: current }, (_, i) => i + 1).reverse()
    const upcoming = Array.from({ length: 4 }, (_, i) => current + 1 + i)
    const img = imageForLevel(current, imagePool)
    const starsFor = (lv: number) => progress.starsByLevel[lv] ?? 0
    return (
      <div style={{ maxWidth: 640, width: '100%', paddingBottom: 8 }}>
        <div className="pz-welcome">
          <div className="pz-welcome-text"><strong>Progresión</strong><span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}> · sube de nivel</span></div>
          <div className="pz-welcome-stats">
            <span className="pz-pill">🏆 {stats.wins}</span>
            <span className="pz-pill">⭐ {progress.totalStars}</span>
            <span className="pz-pill">Nv {current}</span>
          </div>
        </div>
        <div className="pz-card pz-panel" style={{ marginBottom: '0.9rem' }}>
          <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden' }}>
            <ImageCover image={img} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.78))', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0.9rem 1rem', color: '#fff' }}>
              <div>
                <div style={{ fontSize: '0.7rem', opacity: 0.85, letterSpacing: '0.06em', fontWeight: 600 }}>NIVEL ACTUAL</div>
                <div style={{ fontWeight: 800, fontSize: '1.45rem' }}>Nivel {current}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: 2 }}>
                  {piecesForLevel(current)} piezas · {'⭐'.repeat(starsFor(current)) || 'Sin estrellas aún'}
                </div>
              </div>
              <button type="button" className="pz-btn pz-btn-primary" style={{ padding: '0.65rem 1.1rem', flexShrink: 0 }} onClick={() => startNormalLevel(current)}>Continuar ▶</button>
            </div>
          </div>
          <div className="pz-section-title">Dificultad</div>
          <div className="pz-diff-grid">
            {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
              <button key={d} type="button" className={`pz-diff-card${normalDifficulty === d ? ' is-on' : ''}`} onClick={() => setNormalDifficulty(d)}>
                <span className="pz-diff-emoji">{DIFFICULTY_META[d].emoji}</span>
                <span className="pz-diff-label">{DIFFICULTY_META[d].label}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--pz-muted)', textAlign: 'center', margin: 0 }}>
            Escalón {tierInfo.tierIndex + 1} · {tierInfo.pieces} piezas
            · límite ~{formatTime(targetSecondsForPieces(tierInfo.pieces, current, normalDifficulty) * 1000)}
            · {DIFFICULTY_META[normalDifficulty].label}
            {!tierInfo.isMaxTier && ` · ${tierInfo.levelsUntilNextTier ?? 0} para el siguiente`}
          </p>
        </div>
        <div className="pz-section-title">Tu progreso — puedes rejugar cualquier nivel</div>
        <div className="pz-level-row" style={{ marginBottom: 12 }}>
          {pastAndCurrent.slice(0, 12).map((lv) => {
            const piecesN = piecesForLevel(lv)
            const cover = imageForLevel(lv, imagePool)
            const st = starsFor(lv)
            return (
              <button key={lv} type="button" className={`pz-level-card${lv === current ? ' is-current' : ''}`} onClick={() => startNormalLevel(lv)} title={`Jugar nivel ${lv}`}>
                <ImageCover image={cover} className="pz-level-cover" />
                <div className="pz-level-body">
                  <div className="pz-level-label">Nivel {lv}</div>
                  <div className="pz-level-pieces">{piecesN} pz{st > 0 ? ` · ${'★'.repeat(st)}` : ''}</div>
                </div>
              </button>
            )
          })}
        </div>
        <div className="pz-section-title">Próximos (bloqueados)</div>
        <div className="pz-upcoming" style={{ marginBottom: 8 }}>
          {upcoming.map((lv) => (
            <div key={lv} className="pz-card pz-upcoming-row" style={{ opacity: 0.5 }}>
              <span className="pz-upcoming-lv">Nivel {lv}</span>
              <span className="pz-upcoming-pc">{piecesForLevel(lv)} piezas</span>
              <span>🔒</span>
            </div>
          ))}
        </div>
        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderCreativo() {
    return (
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div className="pz-card pz-panel" style={{ marginBottom: '0.9rem' }}>
          <h3 className="pz-panel-head"><span>✨</span> {editingLevelId ? 'Editar nivel' : 'Nuevo nivel'}</h3>
          <p className="pz-panel-desc">Configura imagen, piezas, forma y dificultad.</p>
          <div className="pz-preview">
            <button type="button" className="pz-preview-nav prev" onClick={() => cycleCreativeImage(-1)}>‹</button>
            <ImageCover image={creativeImage} style={{ position: 'absolute', inset: 0 }} />
            <button type="button" className="pz-preview-nav next" onClick={() => cycleCreativeImage(1)}>›</button>
          </div>
          <button type="button" className="pz-select" onClick={() => setImagePickerOpen(true)}>
            <span><span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}>Imagen </span>{creativeImage.name}</span><span>▾</span>
          </button>
          <button type="button" className="pz-select" onClick={() => setPiecesModalOpen(true)}>
            <span><span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}>Piezas </span>{creativePieces}</span><span>▾</span>
          </button>
          <div className="pz-section-title">Forma · desliza →</div>
          <div className="pz-shape-slider">
            {PIECE_SHAPES.map((s) => (
              <button key={s.id} type="button" className={`pz-shape-card${creativeShape === s.id ? ' is-on' : ''}`} onClick={() => setCreativeShape(s.id)} title={s.desc}>
                <span className="pz-shape-emoji">{s.emoji}</span>
                <span className="pz-shape-label">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="pz-section-title">Dificultad</div>
          <div className="pz-diff-grid">
            {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
              <button key={d} type="button" className={`pz-diff-card${creativeDifficulty === d ? ' is-on' : ''}`} onClick={() => setCreativeDifficulty(d)}>
                <span className="pz-diff-emoji">{DIFFICULTY_META[d].emoji}</span>
                <span className="pz-diff-label">{DIFFICULTY_META[d].label}</span>
              </button>
            ))}
          </div>
          <div className="pz-section-title">Límite de tiempo</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <button type="button" className={`pz-chip${creativeTimeLimit === 0 ? ' is-on' : ''}`} onClick={() => setCreativeTimeLimit(0)}>∞ Infinito</button>
            <button
              type="button"
              className="pz-chip"
              onClick={() => setCreativeTimeLimit(recommendTimeLimitSeconds(creativePieces, creativeDifficulty))}
            >
              Usar sugerido
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--pz-muted)' }}>
              Sugerido: {formatTime(recommendTimeLimitSeconds(creativePieces, creativeDifficulty) * 1000)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--pz-muted)' }}>Min</span>
              <input
                type="number"
                min={0}
                max={180}
                value={creativeTimeLimit === 0 ? 0 : Math.floor(creativeTimeLimit / 60)}
                onChange={(e) => {
                  const mins = Math.max(0, Math.min(180, Number(e.target.value) || 0))
                  const secs = creativeTimeLimit === 0 ? 0 : creativeTimeLimit % 60
                  const total = mins * 60 + secs
                  setCreativeTimeLimit(total)
                }}
                style={{
                  width: 64, padding: '0.45rem 0.5rem', borderRadius: 10,
                  border: '1px solid var(--pz-border)', background: 'var(--gco-input-bg, rgba(0,0,0,0.28))',
                  color: 'var(--pz-ink)', font: 'inherit', fontWeight: 700, textAlign: 'center',
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--pz-muted)' }}>Seg</span>
              <input
                type="number"
                min={0}
                max={59}
                value={creativeTimeLimit === 0 ? 0 : creativeTimeLimit % 60}
                onChange={(e) => {
                  const secs = Math.max(0, Math.min(59, Number(e.target.value) || 0))
                  const mins = creativeTimeLimit === 0 ? 0 : Math.floor(creativeTimeLimit / 60)
                  setCreativeTimeLimit(mins * 60 + secs)
                }}
                style={{
                  width: 64, padding: '0.45rem 0.5rem', borderRadius: 10,
                  border: '1px solid var(--pz-border)', background: 'var(--gco-input-bg, rgba(0,0,0,0.28))',
                  color: 'var(--pz-ink)', font: 'inherit', fontWeight: 700, textAlign: 'center',
                }}
              />
            </label>
            <span style={{ fontSize: '0.8rem', color: 'var(--pz-neon)', fontWeight: 700 }}>
              {creativeTimeLimit === 0 ? '∞ Sin límite' : formatTime(creativeTimeLimit * 1000)}
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--pz-muted)', margin: 0 }}>
            Elige minutos y segundos a mano, o usa el sugerido según piezas y dificultad.
            Pon 0 min y 0 seg para tiempo infinito.
          </p>
          <input type="text" value={levelNameDraft} onChange={(e) => setLevelNameDraft(e.target.value)} placeholder="Nombre del nivel (opcional)"
            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 12, border: '1px solid var(--pz-border)', background: 'var(--gco-input-bg, rgba(0,0,0,0.28))', color: 'var(--pz-ink)', font: 'inherit', fontSize: '0.88rem' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="pz-btn pz-btn-primary" style={{ flex: 1 }} onClick={() => startCreative()}>▶ Jugar ahora</button>
            <button type="button" className="pz-btn pz-btn-accent" style={{ flex: 1 }} onClick={saveCurrentAsLevel}>{editingLevelId ? '💾 Actualizar' : '💾 Guardar'}</button>
          </div>
          {editingLevelId && (
            <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => { setEditingLevelId(null); setLevelNameDraft('') }}>Cancelar edición</button>
          )}
        </div>
        <div className="pz-section-title">Mis niveles ({savedLevels.length})</div>
        {savedLevels.length === 0 ? (
          <p className="pz-empty">Aún no tienes niveles guardados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {savedLevels.map((lv) => (
              <div key={lv.id} className="pz-card" style={{ padding: '0.75rem', display: 'flex', gap: 12, alignItems: 'center' }}>
                <ImageCover image={lv.image} style={{ width: 64, height: 48, borderRadius: 10, flexShrink: 0, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lv.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--pz-muted)' }}>
                    {lv.pieces} pz · {PIECE_SHAPES.find((s) => s.id === lv.shape)?.label ?? lv.shape} · {DIFFICULTY_META[lv.difficulty ?? 'facil'].label} · {(lv.timeLimitSeconds ?? 0) > 0 ? formatTime((lv.timeLimitSeconds ?? 0) * 1000) : '∞'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" className="pz-btn pz-btn-primary" style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem' }} onClick={() => playSavedLevel(lv)}>▶</button>
                  <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem' }} onClick={() => loadSavedLevel(lv)}>✎</button>
                  <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem' }} onClick={() => deleteSavedLevel(lv.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderGaleria() {
    return (
      <div>
        {CATEGORY_ORDER.map((cat) => {
          const imgs = galleryGrouped[cat] ?? []
          if (!imgs.length) return null
          return (
            <div key={cat} style={{ marginBottom: '1.1rem' }}>
              <div className="pz-section-title">{CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}</div>
              <div className="pz-img-grid">
                {imgs.map((img) => (
                  <button key={img.id} type="button" className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`} onClick={() => { setCreativeImage(img); setScreen('creativo') }}>
                    <ImageCover image={img} className="pz-img-cover" />
                    <span className="pz-img-name">{img.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderMisImagenes() {
    return (
      <div>
        <button type="button" className="pz-upload" style={{ marginBottom: '0.9rem' }} onClick={() => fileInputRef.current?.click()} disabled={importing}>
          <span style={{ fontSize: '1.3rem' }}>⬆️</span>
          {importing ? 'Importando…' : 'Importar imágenes'}
          <span className="pz-upload-sub">Elige una o muchas a la vez · JPG/PNG/WEBP · sin límite de cantidad</span>
        </button>
        {importError && <p className="pz-error">{importError}</p>}
        {customImages.length === 0 ? (
          <p className="pz-empty">Todavía no importaste imágenes. Puedes renombrarlas después de importarlas.</p>
        ) : (
          <div className="pz-img-grid">
            {customImages.map((img) => (
              <div key={img.id} className="pz-card" style={{ padding: '0.45rem', position: 'relative' }}>
                <button
                  type="button"
                  className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`}
                  style={{ width: '100%' }}
                  onClick={() => { setCreativeImage(img); setScreen('creativo') }}
                >
                  <ImageCover image={img} className="pz-img-cover" />
                </button>
                <input
                  type="text"
                  value={img.name}
                  onChange={(e) => {
                    const list = renameCustomImage(img.id, e.target.value)
                    setCustomImages(list)
                    if (creativeImage.id === img.id) {
                      const updated = list.find((x) => x.id === img.id)
                      if (updated) setCreativeImage(updated)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Nombre de la imagen"
                  style={{
                    width: '100%', marginTop: 6, padding: '0.4rem 0.5rem', borderRadius: 10,
                    border: '1px solid var(--pz-border)', background: 'rgba(0,0,0,0.28)',
                    color: 'var(--pz-ink)', font: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                  }}
                />
                <button
                  type="button"
                  className="pz-icon-btn"
                  style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, minWidth: 28, background: 'rgba(11,18,32,0.75)', fontSize: '0.75rem' }}
                  onClick={() => handleDeleteCustomImage(img.id)}
                  aria-label="Eliminar"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderAjustes() {
    const filteredHistory = historyFilter === 'todos'
      ? stats.history
      : stats.history.filter((h) => h.mode === historyFilter)
    const winRate = stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0
    return (
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div className="pz-section-title">Resumen</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.55rem', marginBottom: '1.1rem' }}>
          {[
            { label: 'Victorias', value: String(stats.wins), icon: '🏆' },
            { label: 'Derrotas', value: String(stats.losses), icon: '📉' },
            { label: 'Tiempo total', value: formatDurationLong(stats.totalPlayMs), icon: '⏱' },
            { label: 'Ratio victorias', value: `${winRate}%`, icon: '📊' },
            { label: 'Nivel máximo', value: String(Math.max(1, progress.normalLevel)), icon: '📈' },
            { label: 'Estrellas', value: String(progress.totalStars), icon: '⭐' },
          ].map((s) => (
            <div key={s.label} className="pz-card" style={{ padding: '0.85rem 0.95rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--pz-muted)', marginBottom: 6 }}>{s.icon} {s.label}</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="pz-section-title">Historial</div>
        <div className="pz-tabs" style={{ marginBottom: 10 }}>
          {(
            [
              { id: 'todos' as const, label: 'Todos' },
              { id: 'normal' as const, label: 'Progresión' },
              { id: 'creativo' as const, label: 'Creativo' },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={historyFilter === t.id ? 'is-on' : ''}
              onClick={() => setHistoryFilter(t.id)}
            >
              {t.label}
              {t.id === 'todos'
                ? ` (${stats.history.length})`
                : ` (${stats.history.filter((x) => x.mode === t.id).length})`}
            </button>
          ))}
        </div>
        <div className="pz-card" style={{ padding: '0.35rem 0', marginBottom: '1.1rem', maxHeight: 400, overflow: 'auto' }}>
          {filteredHistory.length === 0 ? (
            <p className="pz-empty" style={{ padding: '0.85rem 1rem' }}>
              {historyFilter === 'todos'
                ? 'Completa un nivel para ver el historial.'
                : historyFilter === 'normal'
                  ? 'Aún no hay partidas de Progresión.'
                  : 'Aún no hay partidas de Creativo.'}
            </p>
          ) : (
            filteredHistory.map((h, i) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHistoryDetail(h)}
                style={{
                  display: 'flex', gap: 10, alignItems: 'center', padding: '0.65rem 0.9rem', width: '100%',
                  border: 'none', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '0.8rem',
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                {h.image && (
                  <ImageCover
                    image={h.image}
                    style={{ width: 48, height: 36, borderRadius: 8, flexShrink: 0, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>
                      {h.mode === 'normal' ? `Nv ${h.level}` : (h.creativeLevelName || 'Creativo')}
                    </span>
                    <span style={{ color: 'var(--pz-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.pieces} pz · {formatTime(h.timeMs)} · {DIFFICULTY_META[h.difficulty]?.label ?? h.difficulty}
                    </span>
                    <span>{h.stars > 0 ? '⭐'.repeat(h.stars) : '—'}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--pz-faint)', marginTop: 2 }}>
                    {h.shape ? `${PIECE_SHAPES.find((s) => s.id === h.shape)?.label ?? h.shape} · ` : ''}
                    {(h.timeLimitSeconds ?? 0) > 0 ? `Límite ${formatTime((h.timeLimitSeconds ?? 0) * 1000)}` : 'Sin límite'}
                    {' · toca para ver'}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="pz-section-title">Preferencias</div>
        <div className="pz-list-group" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-row">
            <div><div className="pz-row-label">Sonido</div><div className="pz-row-sub">Feedback al encajar</div></div>
            <button type="button" role="switch" aria-checked={settings.sound} className={`pz-switch${settings.sound ? ' is-on' : ''}`} onClick={() => updateSettings({ sound: !settings.sound })}><span className="pz-switch-knob" /></button>
          </div>
          {isTouch && (
            <div className="pz-row">
              <div><div className="pz-row-label">Vibración</div><div className="pz-row-sub">Háptica al encajar</div></div>
              <button type="button" role="switch" aria-checked={settings.haptics} className={`pz-switch${settings.haptics ? ' is-on' : ''}`} onClick={() => updateSettings({ haptics: !settings.haptics })}><span className="pz-switch-knob" /></button>
            </div>
          )}
        </div>
        <div className="pz-section-title">Forma por defecto · desliza →</div>
        <div className="pz-card pz-panel" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-shape-slider">
            {PIECE_SHAPES.map((s) => (
              <button key={s.id} type="button" className={`pz-shape-card${settings.defaultShape === s.id ? ' is-on' : ''}`} onClick={() => { updateSettings({ defaultShape: s.id }); setCreativeShape(s.id) }} title={s.desc}>
                <span className="pz-shape-emoji">{s.emoji}</span>
                <span className="pz-shape-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pz-section-title">Dificultad por defecto</div>
        <div className="pz-card pz-panel" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-diff-grid">
            {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
              <button key={d} type="button" className={`pz-diff-card${settings.defaultDifficulty === d ? ' is-on' : ''}`} onClick={() => { updateSettings({ defaultDifficulty: d }); setCreativeDifficulty(d); setNormalDifficulty(d) }}>
                <span className="pz-diff-emoji">{DIFFICULTY_META[d].emoji}</span>
                <span className="pz-diff-label">{DIFFICULTY_META[d].label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pz-section-title">Datos</div>
        <div className="pz-list-group" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-row">
            <div>
              <div className="pz-row-label">Borrar historial</div>
              <div className="pz-row-sub">No elimina progreso de niveles ni estrellas</div>
            </div>
            <button
              type="button"
              className="pz-btn pz-btn-ghost"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              onClick={() => {
                if (!window.confirm('¿Borrar todo el historial de partidas?')) return
                setStats((st) => {
                  const updated = { ...st, history: [], creativeHistory: {} }
                  saveStats(updated)
                  return updated
                })
              }}
            >
              Borrar
            </button>
          </div>
          <div className="pz-row">
            <div>
              <div className="pz-row-label">Reiniciar progresión</div>
              <div className="pz-row-sub">Vuelve al nivel 1 y borra estrellas</div>
            </div>
            <button
              type="button"
              className="pz-btn pz-btn-ghost"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              onClick={() => {
                if (!window.confirm('¿Reiniciar la progresión al nivel 1?')) return
                const p = defaultPuzzleProgress()
                savePuzzleProgress(p)
                setProgress(p)
              }}
            >
              Reiniciar
            </button>
          </div>
        </div>
        <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={goBackToLogica} style={{ marginBottom: 8 }}>← Volver a Lógica</button>
        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderPlay() {
    if (!activeLevel) return null
    const locked = countLocked(pieces)
    const pct = pieces.length ? Math.round((locked / pieces.length) * 100) : 0
    const hasLimit = activeLevel.targetSeconds > 0
    const remainMs = hasLimit ? Math.max(0, activeLevel.targetSeconds * 1000 - elapsedMs) : null
    const challengeRemain = challengeMs != null ? Math.max(0, challengeMs - elapsedMs) : null
    return (
      <div className={`pz-play${fullscreen ? ' is-fs' : ''}`}>
        <div className="pz-toolbar">
          <button type="button" className={`pz-tool${showPreview ? ' is-on' : ''}`} onClick={() => setShowPreview((v) => !v)} title="Vista previa de la imagen">👁️ Vista</button>
          <button type="button" className={`pz-tool${showBorders ? ' is-on' : ''}`} onClick={() => setShowBorders((v) => !v)} title="Bordes de pieza">✦ Bordes</button>
          <button type="button" className="pz-tool" onClick={useHint} disabled={hintsUsed >= activeLevel.hints || !!completion} title="Pista">💡 {Math.max(0, activeLevel.hints - hintsUsed)}</button>
          <button type="button" className="pz-tool" onClick={fitToScreen} title="Centrar y ajustar zoom">⊡ Ajustar</button>
          <button type="button" className={`pz-tool${fullscreen ? ' is-on' : ''}`} onClick={() => setFullscreen((f) => !f)} title="Pantalla completa">⛶</button>
          <span className="pz-tool is-on" style={{ cursor: 'default', pointerEvents: 'none' }}>
            {DIFFICULTY_META[activeLevel.difficulty].emoji} {DIFFICULTY_META[activeLevel.difficulty].label}
          </span>
          <div className="pz-zoom">
            <button type="button" className="pz-icon-btn" style={{ width: 28, height: 28, minWidth: 28 }} onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.15).toFixed(2)))}>−</button>
            <span style={{ minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button type="button" className="pz-icon-btn" style={{ width: 28, height: 28, minWidth: 28 }} onClick={() => setZoom((z) => Math.min(2.8, +(z + 0.15).toFixed(2)))}>+</button>
          </div>
        </div>
        <div className="pz-prog">
          <div className="pz-prog-bar"><div className="pz-prog-fill" style={{ width: `${pct}%` }} /></div>
          <span className="pz-prog-count">{locked}/{pieces.length}</span>
        </div>
        <div className={`pz-hud${remainMs != null && remainMs < 30000 ? ' is-urgent' : ''}`} style={hudPos ? { left: hudPos.x, top: hudPos.y } : { left: '50%', top: 'max(12px, calc(env(safe-area-inset-top, 0px) + 52px))', transform: 'translateX(-50%)' }}
          onPointerDown={onHudPointerDown} onPointerMove={onHudPointerMove} onPointerUp={onHudPointerUp} onPointerCancel={onHudPointerUp} title="Arrastra">
          <span className="pz-hud-grip">⠿</span>
          <span title="Tu tiempo">⏱ {formatTime(elapsedMs)}</span>
          {remainMs != null && (
            <span title="Tiempo restante del nivel" style={{ color: remainMs < 30000 ? '#FF6B4A' : undefined }}>
              ⌛ {formatTime(remainMs)}
            </span>
          )}
          {challengeRemain != null && (
            <span title="Récord a superar" style={{ color: 'var(--pz-accent)' }}>
              🏁 {formatTime(challengeRemain)}
            </span>
          )}
          <strong>{pct}%</strong>
          <span>{locked}/{pieces.length}</span>
        </div>
        <div className="pz-arena-scroll" ref={arenaScrollRef} onTouchStart={onArenaTouchStart} onTouchMove={onArenaTouchMove} onTouchEnd={onArenaTouchEnd} onTouchCancel={onArenaTouchEnd}>
          <div style={{ width: arenaWidthPx * zoom, height: arenaHeightPx * zoom, position: 'relative' }}>
            <div className="pz-arena" style={{ width: arenaWidthPx, height: arenaHeightPx, transform: `scale(${zoom})` }}
              onPointerDown={handleArenaPointerDown} onPointerMove={handleArenaPointerMove} onPointerUp={handleArenaPointerUp} onPointerCancel={handleArenaPointerUp}>
              <div className="pz-board" style={{ width: boardPxW, height: boardPxH }}>
                {showPreview && (
                  <div className="pz-ghost" style={{ backgroundImage: `url(${activeLevel.image.src})`, backgroundColor: `hsl(${activeLevel.image.fallbackHue} 40% 20%)` }} />
                )}
              </div>
              {pieces.map((p) => (
                <PieceView
                  key={p.id}
                  piece={p}
                  cellW={cellW}
                  cellH={cellH}
                  pad={padPx}
                  shape={activeLevel.shape}
                  imageSrc={activeLevel.image.src}
                  fallbackHue={activeLevel.image.fallbackHue}
                  boardPxW={boardPxW}
                  boardPxH={boardPxH}
                  showBorders={showBorders}
                  isHinted={p.id === hintPieceId}
                  dragging={p.id === draggingId}
                  lite={pieces.length >= 80}
                />
              ))}
            </div>
          </div>
          {paused && (
            <div className="pz-pause">
              <div className="pz-card pz-pause-card">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.9rem' }}>⏸️ Pausado</div>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={togglePause}>Continuar</button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" style={{ marginTop: 8 }} onClick={handleBack}>Salir del nivel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderImagePickerModal() {
    return (
      <div className="pz-overlay" onClick={() => setImagePickerOpen(false)}>
        <div className="pz-card pz-modal" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
          <div className="pz-modal-head"><h3>Seleccionar imagen</h3><button type="button" className="pz-icon-btn" onClick={() => setImagePickerOpen(false)}>✕</button></div>
          <div className="pz-tabs">
            <button type="button" className={imagePickerTab === 'defecto' ? 'is-on' : ''} onClick={() => setImagePickerTab('defecto')}>Por defecto</button>
            <button type="button" className={imagePickerTab === 'mias' ? 'is-on' : ''} onClick={() => setImagePickerTab('mias')}>Mis imágenes ({customImages.length})</button>
          </div>
          {imagePickerTab === 'defecto'
            ? CATEGORY_ORDER.map((cat) => {
                const imgs = galleryGrouped[cat] ?? []
                if (!imgs.length) return null
                return (
                  <div key={cat}>
                    <div className="pz-section-title">{CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}</div>
                    <div className="pz-img-grid">
                      {imgs.map((img) => (
                        <button key={img.id} type="button" className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`} onClick={() => { setCreativeImage(img); setImagePickerOpen(false) }}>
                          <ImageCover image={img} className="pz-img-cover" /><span className="pz-img-name">{img.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            : customImages.length === 0
              ? <p className="pz-empty">Todavía no importaste imágenes.</p>
              : (
                <div className="pz-img-grid">
                  {customImages.map((img) => (
                    <button key={img.id} type="button" className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`} onClick={() => { setCreativeImage(img); setImagePickerOpen(false) }}>
                      <ImageCover image={img} className="pz-img-cover" /><span className="pz-img-name">{img.name}</span>
                    </button>
                  ))}
                </div>
              )}
        </div>
      </div>
    )
  }

  function renderPiecesModal() {
    return (
      <div className="pz-overlay" onClick={() => setPiecesModalOpen(false)}>
        <div className="pz-card pz-modal" style={{ maxWidth: 400 }} onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
          <div className="pz-modal-head"><h3>Seleccionar piezas</h3><button type="button" className="pz-icon-btn" onClick={() => setPiecesModalOpen(false)}>✕</button></div>
          <div className="pz-pieces-val">{creativePieces}</div>
          <div className="pz-pieces-lbl">piezas</div>
          <div className="pz-stepper">
            <button type="button" className="pz-icon-btn" onClick={() => setCreativePieces((p) => clampPieceCount(p - stepFor(p)))}>−</button>
            <input type="range" min={PIECES_MIN} max={PIECES_MAX} value={creativePieces} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreativePieces(clampPieceCount(Number(e.target.value)))} />
            <button type="button" className="pz-icon-btn" onClick={() => setCreativePieces((p) => clampPieceCount(p + stepFor(p)))}>+</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--pz-muted)', marginBottom: 8 }}>
            <span>{PIECES_MIN}</span><span>{PIECES_MAX}</span>
          </div>
          <div className="pz-section-title">Sugerencias</div>
          <div className="pz-chips">
            {PIECE_SUGGESTIONS.map((n) => (
              <button key={n} type="button" className={`pz-chip${creativePieces === n ? ' is-on' : ''}`} onClick={() => setCreativePieces(n)}>{n}</button>
            ))}
          </div>
          <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={() => setPiecesModalOpen(false)}>Continuar</button>
        </div>
      </div>
    )
  }

  function renderCompletionModal() {
    if (!completion || !activeLevel) return null
    const art = activeLevel.image
    return (
      <div className="pz-overlay" style={{ pointerEvents: 'auto' }}>
        <div className="pz-card pz-complete" onClick={(e: ReactMouseEvent) => e.stopPropagation()} style={{ pointerEvents: 'auto' }}>
          <div className="pz-complete-emoji">{completion.timedOut ? '⏰' : completion.beatRecord === false ? '😅' : '🎉'}</div>
          <h3 style={{ margin: '0 0 0.15rem' }}>
            {completion.timedOut
              ? 'Se acabó el tiempo'
              : completion.beatRecord === false
                ? 'No superaste tu récord'
                : completion.beatRecord === true
                  ? '¡Nuevo récord personal!'
                  : '¡Completado!'}
          </h3>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', color: 'var(--pz-muted)' }}>
            {DIFFICULTY_META[completion.difficulty].emoji} {DIFFICULTY_META[completion.difficulty].label}
            {completion.timedOut && ' · el reloj llegó a cero'}
            {completion.beatRecord === true && completion.challengeMs != null && ` · mejoraste ${formatTime(completion.challengeMs - completion.timeMs)}`}
            {completion.beatRecord === false && completion.challengeMs != null && ` · tu marca era ${formatTime(completion.challengeMs)}`}
          </p>
          <div
            className="pz-complete-art"
            style={{ backgroundColor: `hsl(${art.fallbackHue} 40% 22%)`, position: 'relative', padding: 0 }}
            role="img"
            aria-label={art.name}
          >
            <AssembledPuzzlePreview
              image={art}
              cols={activeLevel.cols}
              rows={activeLevel.rows}
              shape={activeLevel.shape}
              seed={activeLevel.seed}
              showBorders={completionBorders}
            />
          </div>
          <button type="button" className="pz-btn pz-btn-ghost" style={{ marginBottom: 8, fontSize: '0.78rem', padding: '0.4rem 0.8rem' }} onClick={() => setCompletionBorders((b) => !b)}>
            {completionBorders ? 'Ver imagen sin bordes' : 'Ver con bordes de piezas'}
          </button>
          <div style={{ fontSize: '0.78rem', color: 'var(--pz-muted)', marginBottom: 6 }}>{art.name}</div>
          <div className="pz-stars">{[1, 2, 3].map((n) => <span key={n} className={`pz-star${n <= completion.stars ? ' is-on' : ''}`}>⭐</span>)}</div>
          <div className="pz-complete-stats">
            <span>⏱ {formatTime(completion.timeMs)}</span>
            <span>🧩 {activeLevel.pieces} piezas</span>
            <span>💡 {hintsUsed} pistas</span>
            <span>⌀ {formatTime(completion.avgMsPerPiece)}/pz</span>
            {completion.fastestSnapMs != null && <span>⚡ mejor {formatTime(completion.fastestSnapMs)}</span>}
          </div>
          <div className="pz-complete-actions">
            {playOrigin === 'normal' ? (
              <>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={() => startNormalLevel(activeLevel.level + 1)}>Siguiente nivel ▶</button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => { setFullscreen(false); setCompletion(null); setScreen('normal') }}>Inicio</button>
              </>
            ) : (
              <>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={() => { setCompletion(null); startCreative() }}>Repetir</button>
                <button type="button" className="pz-btn pz-btn-accent pz-btn-block" onClick={() => { setFullscreen(false); setCompletion(null); setPiecesModalOpen(true); setScreen('creativo') }}>Cambiar cantidad de piezas</button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => { setFullscreen(false); setCompletion(null); setActiveLevel(null); setPieces([]); setScreen('creativo') }}>Volver al modo creativo</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }


  function renderHistoryDetailModal() {
    if (!historyDetail) return null
    const h = historyDetail
    const img = h.image
    const shapeLabel = PIECE_SHAPES.find((s) => s.id === h.shape)?.label ?? h.shape ?? '—'
    const limitSecs = h.timeLimitSeconds ?? 0
    const limitLabel = limitSecs > 0
      ? formatTime(limitSecs * 1000)
      : 'Sin límite (∞)'
    const when = new Date(h.at).toLocaleString()
    return (
      <div className="pz-overlay" onClick={() => setHistoryDetail(null)} style={{ pointerEvents: 'auto' }}>
        <div className="pz-card pz-modal" onClick={(e: ReactMouseEvent) => e.stopPropagation()} style={{ maxWidth: 440 }}>
          <div className="pz-modal-head">
            <h3>Partida guardada</h3>
            <button type="button" className="pz-icon-btn" onClick={() => setHistoryDetail(null)}>✕</button>
          </div>

          {/* Imagen completa como se veía armado el rompecabezas */}
          {img ? (
            <div
              style={{
                aspectRatio: '16/10',
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 12,
                border: '1px solid rgba(34,230,197,0.35)',
                boxShadow: '0 0 24px rgba(34,230,197,0.12)',
                position: 'relative',
                background: '#0a1018',
              }}
            >
              {h.cols && h.rows && h.shape ? (
                <AssembledPuzzlePreview
                  image={img}
                  cols={h.cols}
                  rows={h.rows}
                  shape={h.shape}
                  seed={h.seed ?? levelSeed(h.level || h.pieces, 9100 + (h.at % 9999))}
                  showBorders
                />
              ) : (
                <ImageCover image={img} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              )}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '0.55rem 0.75rem',
                  background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.75))',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                {img.name} · {DIFFICULTY_META[h.difficulty]?.label} · {h.pieces} pz
              </div>
            </div>
          ) : (
            <p className="pz-empty">Esta partida antigua no tiene imagen guardada.</p>
          )}

          <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 6 }}>
            {h.mode === 'normal'
              ? `Progresión · Nivel ${h.level}`
              : (h.creativeLevelName || 'Modo Creativo')}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--pz-muted)', marginBottom: 10 }}>{when}</div>

          <div className="pz-complete-stats" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
            <span>⏱ {formatTime(h.timeMs)}</span>
            <span>🧩 {h.pieces} piezas</span>
            <span>{DIFFICULTY_META[h.difficulty]?.emoji} {DIFFICULTY_META[h.difficulty]?.label}</span>
            <span>⭐ {h.stars > 0 ? '⭐'.repeat(h.stars) : '0'}</span>
            <span>⌛ {limitLabel}</span>
            <span>✂️ {shapeLabel}</span>
            {h.cols && h.rows ? <span>{h.cols}×{h.rows}</span> : null}
            {h.fastestSnapMs != null && <span>⚡ {formatTime(h.fastestSnapMs)}</span>}
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--pz-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Al <strong>repetir</strong> se abre la misma partida: misma imagen, forma de piezas, cantidad,
            dificultad y límite de tiempo. Además verás un reloj de récord ({formatTime(h.timeMs)}).
            Si no mejoras esa marca, te lo diremos; si la superas, se añade una nueva entrada al historial
            sin borrar esta.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="pz-btn pz-btn-primary pz-btn-block"
              onClick={() => {
                setHistoryDetail(null)
                startFromHistory(h, true)
              }}
            >
              🏁 Repetir misma partida
            </button>
            <button
              type="button"
              className="pz-btn pz-btn-ghost pz-btn-block"
              onClick={() => {
                setHistoryDetail(null)
                startFromHistory(h, false)
              }}
            >
              Jugar sin reto de récord
            </button>
            <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => setHistoryDetail(null)}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const topbarTitle = (() => {

    switch (screen) {
      case 'normal': return (<><span>📈</span> Progresión <span className="pz-topbar-sub">Sube de nivel</span></>)
      case 'creativo': return 'Modo Creativo'
      case 'galeria': return 'Galería'
      case 'mis-imagenes': return 'Mis Imágenes'
      case 'ajustes': return 'Ajustes'
      case 'play':
        if (!activeLevel) return ''
        return (<>{activeLevel.level > 0 ? `Nivel ${activeLevel.level}` : 'Creativo'}<span className="pz-topbar-sub">{activeLevel.pieces} piezas</span></>)
      default: return ''
    }
  })()

  return (
    <div className="pz-root">
      <style>{SCOPED_STYLES}</style>
      {screen !== 'play' && (
        <aside className="pz-sidebar">
          <div className="pz-brand"><div className="pz-brand-mark">🧩</div><div>Puzzle<span className="pz-brand-sub">Rompecabezas</span></div></div>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className={`pz-nav-btn${screen === item.id ? ' is-active' : ''}`} onClick={() => setScreen(item.id)}>
              <span className="pz-nav-emoji">{item.emoji}</span>
              <span className="pz-nav-text"><span>{item.label}</span>{item.sub && <span className="pz-nav-sub">{item.sub}</span>}</span>
            </button>
          ))}
          <div className="pz-side-profile">
            <span className="pz-side-profile-name">📊 Estadísticas</span>
            <span className="pz-side-profile-meta">🏆 {stats.wins} · 📉 {stats.losses} · ⭐ {progress.totalStars}</span>
            <span className="pz-side-profile-meta">Nv {progress.normalLevel} · ⏱ {formatDurationLong(stats.totalPlayMs)}</span>
          </div>
        </aside>
      )}
      <div className={`pz-main${screen === 'play' ? ' is-playing' : ''}`}>
        {!fullscreen && (
          <header className="pz-topbar">
            <button type="button" className="pz-icon-btn" onClick={handleBack} aria-label="Volver">‹</button>
            <div className="pz-topbar-title">{topbarTitle}</div>
            {screen === 'play' && activeLevel && (
              <div className="pz-topbar-right">
                <span className="pz-pill">{formatTime(elapsedMs)}</span>
                <button type="button" className="pz-icon-btn" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? '▶' : '⏸'}</button>
              </div>
            )}
            {screen === 'normal' && (
              <div className="pz-topbar-right">
                <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={goBackToLogica}>← Lógica</button>
              </div>
            )}
          </header>
        )}
        <main className="pz-content">
          {screen === 'play' ? renderPlay() : (
            <div className="pz-scroll-inner">
              {screen === 'normal' && renderNormal()}
              {screen === 'creativo' && renderCreativo()}
              {screen === 'galeria' && renderGaleria()}
              {screen === 'mis-imagenes' && renderMisImagenes()}
              {screen === 'ajustes' && renderAjustes()}
            </div>
          )}
        </main>
      </div>
      {screen !== 'play' && (
        <nav className="pz-bottom" aria-label="Navegación">
          {MOBILE_NAV.map((item) => (
            <button key={item.id} type="button" className={`pz-bottom-item${screen === item.id ? ' is-on' : ''}`} onClick={() => setScreen(item.id)}>
              <span>{item.emoji}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
      {imagePickerOpen && renderImagePickerModal()}
      {piecesModalOpen && renderPiecesModal()}
      {completion && renderCompletionModal()}
      {historyDetail && renderHistoryDetailModal()}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/*" multiple style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { void handleImportFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

export default RompecabezasGame