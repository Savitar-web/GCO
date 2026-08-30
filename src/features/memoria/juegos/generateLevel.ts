import { mulberry32, levelSeed } from '../../../core/level-engine/rng'
import {
  getMemorySequenceDifficulty,
  getMemoryCardsDifficulty,
} from '../../../core/level-engine/difficulty'

// ─── Bloques de memoria ────────────────────────────────────────────────────

export type CharsetMode = 'digits' | 'letters' | 'code' | 'emojis'

export interface ChunkConfig {
  totalChars: number
  blockSize: number
  charset: CharsetMode
  seed?: number
}

export interface ChunkSequence {
  raw: string
  blocks: string[]
  config: ChunkConfig
}

const EMOJI_POOL = [
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑', '🥝', '🍌', '🍒', '🍍', '🥭', '🥥',
  '🍕', '🍔', '🌮', '🍣', '🍦', '🍩', '🍪', '🧁',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬', '🐱', '🐼', '🐶', '🦄', '🦁', '🐯',
  '🐻', '🐨', '🐰', '🐧', '🐦‍⬛', '🦅', '🐢', '🐝', '🐞', '🦀', '🦈', '🐳',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯', '🎵', '🍀', '🌈', '❄️', '🌻', '🌸',
  '🌺', '🌹', '🌴', '🌵', '🌊', '☁️', '☀️', '🌪️',
  '🚀', '🏀', '🎲', '🔑', '🎈', '🎸', '🔔', '📱', '💻', '🎮', '🎨', '📚',
  '🏆', '👑', '💍', '🧸', '🎁', '🧩', '🪄', '🧿',
  '❤️', '💙', '💚', '💛', '💜', '🖤', '✨', '💫', '🌟', '💥',
] as const

export const EMOJI_NAMES: Record<string, string> = {
  '🍎': 'manzana', '🍋': 'limón', '🍇': 'uva', '🍉': 'sandía', '🍓': 'fresa',
  '🍑': 'melocotón', '🥝': 'kiwi', '🍌': 'plátano', '🍒': 'cereza', '🍍': 'piña',
  '🥭': 'mango', '🥥': 'coco', '🍕': 'pizza', '🍔': 'hamburguesa', '🌮': 'taco',
  '🍣': 'sushi', '🍦': 'helado', '🍩': 'donut', '🍪': 'galleta', '🧁': 'cupcake',
  '🦊': 'zorro', '🐸': 'rana', '🦉': 'búho', '🐙': 'pulpo', '🦋': 'mariposa',
  '🐬': 'delfín', '🐱': 'gato', '🐼': 'panda', '🐶': 'perro', '🦄': 'unicornio',
  '🦁': 'león', '🐯': 'tigre', '🐻': 'oso', '🐨': 'koala', '🐰': 'conejo',
  '🐧': 'pingüino', '🐦‍⬛': 'cuervo', '🦅': 'águila', '🐢': 'tortuga', '🐝': 'abeja',
  '🐞': 'mariquita', '🦀': 'cangrejo', '🦈': 'tiburón', '🐳': 'ballena',
  '⭐': 'estrella', '🌙': 'luna', '⚡': 'rayo', '🔥': 'fuego', '💎': 'diamante',
  '🎯': 'diana', '🎵': 'nota musical', '🍀': 'trébol', '🌈': 'arcoíris',
  '❄️': 'copo de nieve', '🌻': 'girasol', '🌸': 'cerezo', '🌺': 'hibisco',
  '🌹': 'rosa', '🌴': 'palmera', '🌵': 'cactus', '🌊': 'ola', '☁️': 'nube',
  '☀️': 'sol', '🌪️': 'tornado', '🚀': 'cohete', '🏀': 'balón', '🎲': 'dado',
  '🔑': 'llave', '🎈': 'globo', '🎸': 'guitarra', '🔔': 'campana', '📱': 'móvil',
  '💻': 'ordenador', '🎮': 'mando', '🎨': 'paleta', '📚': 'libros', '🏆': 'trofeo',
  '👑': 'corona', '💍': 'anillo', '🧸': 'osito', '🎁': 'regalo', '🧩': 'puzzle',
  '🪄': 'varita', '🧿': 'ojo turco', '❤️': 'corazón rojo', '💙': 'corazón azul',
  '💚': 'corazón verde', '💛': 'corazón amarillo', '💜': 'corazón morado',
  '🖤': 'corazón negro', '✨': 'destellos', '💫': 'estrella fugaz',
  '🌟': 'estrella brillante', '💥': 'explosión',
}

const CHARSETS: Record<Exclude<CharsetMode, 'emojis'>, string> = {
  digits: '0123456789',
  letters: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  code: 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',
}

export function generateChunkSequence(config: ChunkConfig): ChunkSequence {
  const seed = config.seed ?? Date.now() % 1_000_000
  const rng = mulberry32(levelSeed(seed, 9173))
  let raw = ''
  const blocks: string[] = []

  if (config.charset === 'emojis') {
    const picked: string[] = []
    for (let i = 0; i < config.totalChars; i++) {
      picked.push(EMOJI_POOL[Math.floor(rng() * EMOJI_POOL.length)])
    }
    raw = picked.join('')
    for (let i = 0; i < picked.length; i += config.blockSize) {
      blocks.push(picked.slice(i, i + config.blockSize).join(''))
    }
  } else {
    const alphabet = CHARSETS[config.charset]
    for (let i = 0; i < config.totalChars; i++) {
      raw += alphabet[Math.floor(rng() * alphabet.length)]
    }
    for (let i = 0; i < raw.length; i += config.blockSize) {
      blocks.push(raw.slice(i, i + config.blockSize))
    }
  }
  return { raw, blocks, config: { ...config, seed } }
}

export function configFromLevel(level: number): ChunkConfig {
  const totalChars = Math.min(6 + level, 32)
  const blockSize = level <= 4 ? 2 : level <= 10 ? 3 : level <= 20 ? 4 : 5
  return {
    totalChars,
    blockSize: Math.min(blockSize, totalChars),
    charset: 'digits',
    seed: level * 7919,
  }
}

export function emojiSequenceToSpeech(raw: string): string {
  return [...raw].map((ch) => EMOJI_NAMES[ch] ?? ch).join(', ')
}

// ─── Secuencia de colores · ILUMINADOS (reescrito profesional) ─────────────

export const ALL_COLORS = [
  { id: 'cyan', hex: '#22E6C5', label: 'Cian' },
  { id: 'coral', hex: '#FF6B4A', label: 'Coral' },
  { id: 'violet', hex: '#8B7CF6', label: 'Violeta' },
  { id: 'amber', hex: '#F5A623', label: 'Ámbar' },
  { id: 'blue', hex: '#4A9EFF', label: 'Azul' },
  { id: 'pink', hex: '#FF6BCB', label: 'Rosa' },
  { id: 'lime', hex: '#A3E635', label: 'Lima' },
  { id: 'orange', hex: '#FB923C', label: 'Naranja' },
  { id: 'indigo', hex: '#818CF8', label: 'Índigo' },
  { id: 'teal', hex: '#2DD4BF', label: 'Verde azulado' },
  { id: 'rose', hex: '#FB7185', label: 'Rosado' },
  { id: 'sky', hex: '#38BDF8', label: 'Cielo' },
] as const

export type ColorId = (typeof ALL_COLORS)[number]['id']
export type ColorDef = { id: ColorId; hex: string; label: string }
export type ColorCount = 4 | 6 | 9 | 12

export const ALL_COLORS_LIST: ColorDef[] = ALL_COLORS.map((c) => ({
  id: c.id, hex: c.hex, label: c.label,
}))
export const COLORS: ColorDef[] = ALL_COLORS_LIST.slice(0, 9)

export function getColorsForCount(count: ColorCount): ColorDef[] {
  const n = Math.min(Math.max(count, 4), ALL_COLORS_LIST.length)
  return ALL_COLORS_LIST.slice(0, n)
}

export interface ColorSequenceLevelOptions {
  softProgression?: boolean
  chainFrom?: ColorId[]
  chainGrowBy?: number
}

export interface ColorSequenceLevel {
  level: number
  sequence: ColorId[]
  showTimeMs: number
  pauseBetweenMs: number
  colorCount: ColorCount
  palette: ColorDef[]
  chained: boolean
}

/**
 * ILUMINADOS – lógica profesional y exigente
 *
 * Principios:
 * 1. Nunca se iluminan “casi todos” los botones de la paleta.
 * 2. Se elige un subconjunto ACTIVO pequeño (2–5 colores) y se trabaja
 *    intensamente con él (repeticiones, patrones, trampas).
 * 3. La dificultad crece por: velocidad, longitud moderada con repeticiones
 *    y patrones anti-chunking, NO por cubrir toda la paleta.
 * 4. Siempre quedan ≥ 3 colores de la paleta sin usar (cuando colorCount ≥ 6).
 */
export function generateColorSequenceLevel(
  level: number,
  colorCount: ColorCount = 9,
  options: ColorSequenceLevelOptions = {}
): ColorSequenceLevel {
  const { softProgression = false, chainFrom, chainGrowBy = 1 } = options
  const rng = mulberry32(levelSeed(level, 3100 + colorCount * 13))
  const base = getMemorySequenceDifficulty(level)
  const palette = getColorsForCount(colorCount)

  let sequence: ColorId[]
  let chained = false

  if (chainFrom && chainFrom.length > 0) {
    chained = true
    const grow = Math.max(1, chainGrowBy)
    // En cadena también limitamos el universo activo
    const active = pickActiveSubset(palette, level, rng)
    const extra: ColorId[] = Array.from({ length: grow }, () =>
      active[Math.floor(rng() * active.length)].id
    )
    sequence = [...chainFrom, ...extra]
  } else {
    const active = pickActiveSubset(palette, level, rng)
    const length = smartSequenceLength(level, active.length, base.length)
    sequence = buildSmartSequence(active, length, level, rng)
  }

  // Velocidad: más agresiva en niveles altos (dificultad real)
  const speedFactor = 1 - Math.min(level * 0.008, 0.42)
  const softMulShow = softProgression ? 1.1 : 1
  const softMulPause = softProgression ? 1.08 : 1
  const lenFactor = sequence.length > 7 ? 1 + (sequence.length - 7) * 0.015 : 1

  const showTimeMs = Math.round(
    Math.max(280, base.showTimeMs * softMulShow * lenFactor * speedFactor)
  )
  const pauseBetweenMs = Math.round(
    Math.max(90, base.pauseBetweenMs * softMulPause * speedFactor)
  )

  return {
    level,
    sequence,
    showTimeMs,
    pauseBetweenMs,
    colorCount,
    palette,
    chained,
  }
}

/** Elige 2–5 colores activos. Siempre deja ≥3 de la paleta fuera (si hay ≥6). */
function pickActiveSubset(
  palette: ColorDef[],
  level: number,
  rng: () => number
): ColorDef[] {
  const n = palette.length
  // Objetivo: máximo 5 activos, y como mínimo 3 fuera cuando sea posible
  let maxActive = Math.min(5, n)
  if (n >= 6) maxActive = Math.min(maxActive, n - 3) // garantiza ≥3 fuera
  if (n >= 9) maxActive = Math.min(maxActive, n - 4)

  // Variedad: a veces solo 2, a veces 3, a veces el máximo permitido
  const roll = rng()
  let count: number
  if (roll < 0.22) count = 2
  else if (roll < 0.48) count = 3
  else if (roll < 0.72) count = Math.min(4, maxActive)
  else count = maxActive

  count = Math.max(2, Math.min(count, maxActive))

  // En niveles altos tendemos un poco más al máximo (pero nunca a “casi todos”)
  if (level > 40 && count < maxActive && rng() < 0.35) {
    count = Math.min(count + 1, maxActive)
  }

  const shuffled = [...palette].sort(() => rng() - 0.5)
  return shuffled.slice(0, count)
}

/** Longitud inteligente: crece despacio y se topea. Nunca “marca casi todos”. */
function smartSequenceLength(
  level: number,
  activeCount: number,
  engineLength: number
): number {
  // Base suave independiente del motor (el motor crecía demasiado)
  let len = 3 + Math.floor(level * 0.28)
  // Tope duro relativo al subconjunto activo
  const hardCap = Math.min(11, activeCount * 2 + 2)
  len = Math.min(len, hardCap)
  // El motor puede sugerir menos en niveles bajos
  len = Math.min(len, Math.max(engineLength, 3))
  // Mínimo
  return Math.max(3, len)
}

/**
 * Construye secuencia con patrones que exigen atención:
 * - repeticiones controladas
 * - alternancias
 * - “trampas” (mismo color dos veces seguidas o salto inesperado)
 * Evita el pure-random que se siente fácil de chunkear.
 */
function buildSmartSequence(
  active: ColorDef[],
  length: number,
  level: number,
  rng: () => number
): ColorId[] {
  const ids = active.map((c) => c.id)
  const seq: ColorId[] = []
  let last: ColorId | null = null
  let run = 0

  for (let i = 0; i < length; i++) {
    let next: ColorId
    const r = rng()

    if (i === 0) {
      next = ids[Math.floor(rng() * ids.length)]
    } else if (r < 0.18 && run < 2) {
      // Repetición corta (trampa de atención)
      next = last!
    } else if (r < 0.42 && ids.length >= 2) {
      // Alternar con otro distinto
      const others = ids.filter((id) => id !== last)
      next = others[Math.floor(rng() * others.length)]
    } else if (r < 0.62 && ids.length >= 3 && level > 15) {
      // Saltar a un tercero (rompe predicción)
      const others = ids.filter((id) => id !== last)
      next = others[Math.floor(rng() * others.length)]
    } else {
      next = ids[Math.floor(rng() * ids.length)]
    }

    if (next === last) run++
    else run = 1
    last = next
    seq.push(next)
  }
  return seq
}

export function buildCustomColorLevel(
  sequence: ColorId[],
  colorCount: ColorCount = 9,
  opts?: { showTimeMs?: number; pauseBetweenMs?: number }
): ColorSequenceLevel {
  const palette = getColorsForCount(colorCount)
  return {
    level: 0,
    sequence: [...sequence],
    showTimeMs: opts?.showTimeMs ?? 650,
    pauseBetweenMs: opts?.pauseBetweenMs ?? 220,
    colorCount,
    palette,
    chained: false,
  }
}

// ─── Memoria de cartas ─────────────────────────────────────────────────────

export type CardsMode = 'pairs' | 'track' | 'order'

const CARD_EMOJIS = [
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑', '🥝', '🍌', '🍒', '🍍', '🥭',
  '🍕', '🍔', '🌮', '🍣', '🍦', '🍩', '🍪',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬', '🐱', '🐼', '🐶', '🦄', '🦁',
  '🐯', '🐻', '🐨', '🐰', '🐧', '🐦‍⬛', '🦅', '🐢', '🐝', '🐞', '🦈',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯', '🎵', '🍀', '🌈', '❄️', '🌻',
  '🌸', '🌺', '🌹', '🌴', '🌊', '☀️',
  '🚀', '🏀', '🎲', '🔑', '🎈', '🎸', '🔔', '📱', '💻', '🎮', '🎨',
  '📚', '🏆', '👑', '🧸', '🎁', '🧩', '🪄', '❤️', '💙', '✨', '💫',
]

export type CardItem = {
  id: string
  pairId: number
  emoji: string
}

function fisherYates<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function deepShuffle<T>(arr: T[], rng: () => number, passes = 3): T[] {
  let a = [...arr]
  for (let p = 0; p < passes; p++) {
    a = fisherYates(a, rng)
    const mid = Math.floor(a.length / 2)
    const left = a.slice(0, mid)
    const right = a.slice(mid)
    const merged: T[] = []
    let li = 0
    let ri = 0
    while (li < left.length || ri < right.length) {
      const takeLeft = rng() > 0.45
      if (takeLeft && li < left.length) merged.push(left[li++])
      else if (ri < right.length) merged.push(right[ri++])
      else if (li < left.length) merged.push(left[li++])
    }
    a = merged
  }
  return a
}

/**
 * Escalado de casillas:
 * - Más base desde el principio
 * - ×1.2 tras 50, ×1.35 tras 76
 * - Tras 100: cada 20 niveles suma más (crecimiento indefinido)
 */
function scaleCardCount(base: number, level: number): number {
  let n = base
  // Base más generosa
  n = Math.round(n * 1.15)
  if (level > 50) n = Math.round(n * 1.2)
  if (level > 76) n = Math.round(n * 1.18)
  if (level > 100) {
    const tiers = Math.floor((level - 100) / 20) + 1
    n = Math.round(n * (1 + tiers * 0.14))
  }
  return n
}

export function generateCardsLevel(level: number, mode: CardsMode = 'pairs') {
  const { pairs: basePairs, gridCols: baseGrid, timeSec } = getMemoryCardsDifficulty(level)
  const rng = mulberry32(levelSeed(level, 4242 + mode.length * 17))
  const pool = deepShuffle([...CARD_EMOJIS], rng, 2)

  if (mode === 'pairs') {
    const pairs = Math.min(scaleCardCount(basePairs, level), 36)
    const chosen = pool.slice(0, pairs)
    let cards: CardItem[] = []
    chosen.forEach((emoji, pairId) => {
      cards.push({ id: `${pairId}-a`, pairId, emoji })
      cards.push({ id: `${pairId}-b`, pairId, emoji })
    })
    cards = deepShuffle(cards, rng, 4)
    let gridCols = baseGrid
    if (cards.length > 30) gridCols = 6
    else if (cards.length > 20) gridCols = 5
    else if (cards.length > 12) gridCols = 4
    else gridCols = 3
    return {
      mode, cards, pairs, gridCols,
      timeSec: Math.max(timeSec, 28 + pairs * 2.2),
      targetIndex: -1, orderIds: [] as string[],
    }
  }

  if (mode === 'track') {
    let count = Math.min(5 + Math.floor(level / 1.8), 14)
    count = Math.min(scaleCardCount(count, level), 24)
    const chosen = pool.slice(0, count)
    let cards: CardItem[] = chosen.map((emoji, i) => ({
      id: `t-${i}`, pairId: i, emoji,
    }))
    cards = deepShuffle(cards, rng, 3)
    const targetIndex = Math.floor(rng() * cards.length)
    return {
      mode, cards, pairs: count,
      gridCols: count <= 6 ? 3 : count <= 12 ? 4 : count <= 18 ? 5 : 6,
      timeSec: Math.max(timeSec, 42),
      targetIndex, orderIds: [] as string[],
    }
  }

  // order
  {
    let count = Math.min(4 + Math.floor(level / 1.8), 12)
    count = Math.min(scaleCardCount(count, level), 20)
    const chosen = pool.slice(0, count)
    const cards: CardItem[] = chosen.map((emoji, i) => ({
      id: `o-${i}`, pairId: i, emoji,
    }))
    const orderIds = cards.map((c) => c.id)
    const shuffled = deepShuffle(cards, rng, 4)
    return {
      mode, cards: shuffled, pairs: count,
      gridCols: count <= 6 ? 3 : count <= 12 ? 4 : 5,
      timeSec: Math.max(timeSec, 48),
      targetIndex: -1, orderIds,
    }
  }
}

export function reshuffleCards(cards: CardItem[], level: number): CardItem[] {
  const rng = mulberry32(levelSeed(level, Date.now() % 99991))
  return deepShuffle(cards, rng, 5)
}

// ─── NEXO · Memoria espacial + secuencial avanzada ─────────────────────────

export type NexoCard = {
  id: string
  emoji: string
  /** Posición inicial (antes del shuffle) */
  homeIndex: number
}

export interface NexoLevel {
  level: number
  cards: NexoCard[]
  /** Orden de IDs que el jugador debe reproducir */
  sequenceIds: string[]
  gridCols: number
  /** Cuántas pasadas de shuffle */
  shufflePasses: number
  showStepMs: number
  shuffleIntervalMs: number
  timeSec: number
  /** Si true, al final hay que reproducir en orden INVERSO */
  reverse: boolean
  /** Destellos distractores durante la demostración */
  distractors: number
}

/**
 * Nexo: híbrido exigente.
 * 1. Se muestra una secuencia de cartas iluminándose.
 * 2. Las cartas se barajan varias veces.
 * 3. Debes pulsar las mismas cartas en el mismo orden (o inverso)
 *    en sus NUEVAS posiciones → carga espacial + secuencial.
 */
export function generateNexoLevel(level: number): NexoLevel {
  const rng = mulberry32(levelSeed(level, 9901))
  const pool = deepShuffle([...CARD_EMOJIS], rng, 2)

  // Cantidad de cartas en el tablero
  let boardSize = Math.min(6 + Math.floor(level / 3), 12)
  boardSize = Math.min(scaleCardCount(boardSize, level), 20)

  // Longitud de la secuencia a memorizar (más corta que el tablero)
  let seqLen = Math.min(3 + Math.floor(level / 4), 8)
  if (level > 50) seqLen = Math.min(seqLen + 1, 9)
  if (level > 80) seqLen = Math.min(seqLen + 1, 10)
  seqLen = Math.min(seqLen, boardSize - 1)

  const chosen = pool.slice(0, boardSize)
  const cards: NexoCard[] = chosen.map((emoji, i) => ({
    id: `n-${i}`,
    emoji,
    homeIndex: i,
  }))

  // Secuencia: índices aleatorios sin repetición inmediata excesiva
  const sequenceIds: string[] = []
  let lastIdx = -1
  for (let i = 0; i < seqLen; i++) {
    let idx: number
    do {
      idx = Math.floor(rng() * boardSize)
    } while (idx === lastIdx && boardSize > 2)
    sequenceIds.push(cards[idx].id)
    lastIdx = idx
  }

  const gridCols =
    boardSize <= 6 ? 3 : boardSize <= 12 ? 4 : boardSize <= 16 ? 5 : 6

  const shufflePasses = Math.min(3 + Math.floor(level / 15), 8)
  const showStepMs = Math.max(420, 900 - level * 6)
  const shuffleIntervalMs = Math.max(180, 380 - level * 2)
  const timeSec = Math.max(35, 50 + seqLen * 4 - Math.floor(level / 10))
  const reverse = level > 25 && rng() < Math.min(0.15 + level * 0.004, 0.55)
  const distractors =
    level < 12 ? 0 : level < 30 ? 1 : level < 60 ? 2 : 3

  return {
    level,
    cards,
    sequenceIds,
    gridCols,
    shufflePasses,
    showStepMs,
    shuffleIntervalMs,
    timeSec,
    reverse,
    distractors,
  }
}

export function reshuffleNexoCards(cards: NexoCard[], level: number): NexoCard[] {
  const rng = mulberry32(levelSeed(level, Date.now() % 88883))
  return deepShuffle(cards, rng, 4)
}

// ─── Tiempo de reacción ─────────────────────────────────────────────────────

export interface ReactionRoundConfig {
  minDelayMs: number
  maxDelayMs: number
}
export interface ReactionRound {
  round: number
  delayMs: number
  config: ReactionRoundConfig
}

export function getReactionRoundConfig(round: number): ReactionRoundConfig {
  const base = 1200
  const spread = Math.min(2200 + round * 60, 4200)
  return { minDelayMs: base, maxDelayMs: base + spread }
}

export function generateReactionRound(round: number, seed?: number): ReactionRound {
  const config = getReactionRoundConfig(round)
  const rng = mulberry32(levelSeed(seed ?? round, 5501))
  const delayMs = Math.round(
    config.minDelayMs + rng() * (config.maxDelayMs - config.minDelayMs)
  )
  return { round, delayMs, config }
}

export function formatReactionTime(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)} s`
  return `${String(Math.round(ms)).padStart(3, '0')} ms`
}

export function rateReactionTime(ms: number): {
  label: string
  tier: 'elite' | 'rapido' | 'promedio' | 'lento'
} {
  if (ms < 180) return { label: 'Reflejos de élite', tier: 'elite' }
  if (ms < 250) return { label: 'Muy rápido', tier: 'rapido' }
  if (ms < 350) return { label: 'Promedio', tier: 'promedio' }
  return { label: 'Puedes mejorar', tier: 'lento' }
}

// ─── Puntería ───────────────────────────────────────────────────────────────

export interface AimTarget {
  id: string
  x: number
  y: number
  radius: number
}
export interface AimSessionConfig {
  targetCount: number
  radius: number
  areaPaddingPct: number
  spawnDelayMinMs: number
  spawnDelayMaxMs: number
}

export function getAimSessionConfig(level: number): AimSessionConfig {
  const targetCount = Math.min(10 + Math.floor(level * 1.5), 40)
  const radius = Math.max(38 - level * 1.1, 15)
  return {
    targetCount, radius, areaPaddingPct: 8,
    spawnDelayMinMs: Math.max(280 - level * 4, 120),
    spawnDelayMaxMs: Math.max(900 - level * 12, 320),
  }
}

export function generateAimTarget(
  index: number, level: number, config: AimSessionConfig, seed?: number
): AimTarget {
  const rng = mulberry32(levelSeed(seed ?? level * 1000 + index, 6203))
  const pad = config.areaPaddingPct
  return {
    id: `aim-${level}-${index}`,
    x: pad + rng() * (100 - pad * 2),
    y: pad + rng() * (100 - pad * 2),
    radius: config.radius,
  }
}

export function generateAimSession(level: number, seed?: number): AimTarget[] {
  const config = getAimSessionConfig(level)
  return Array.from({ length: config.targetCount }, (_, i) =>
    generateAimTarget(i, level, config, seed !== undefined ? seed + i : undefined)
  )
}

export interface AimHitResult {
  targetId: string
  hit: boolean
  distanceFromCenterPx: number
  accuracyPct: number
  reactionMs: number
}

export function scoreAimHit(distanceFromCenterPx: number, radius: number): number {
  const ratio = Math.min(Math.max(distanceFromCenterPx / radius, 0), 1)
  return Math.round((1 - ratio) * 100)
}

export function aimAccuracyColor(accuracyPct: number): string {
  if (accuracyPct >= 85) return '#22E6C5'
  if (accuracyPct >= 60) return '#A3E635'
  if (accuracyPct >= 30) return '#F5A623'
  return '#FF6B4A'
}

export interface AimSessionSummary {
  totalTargets: number
  hits: number
  misses: number
  avgAccuracyPct: number
  avgReactionMs: number
  bestReactionMs: number
  totalTimeMs: number
}

export function summarizeAimSession(
  results: AimHitResult[], totalTimeMs: number
): AimSessionSummary {
  const hits = results.filter((r) => r.hit)
  const avgAccuracyPct = hits.length
    ? Math.round(hits.reduce((s, r) => s + r.accuracyPct, 0) / hits.length) : 0
  const avgReactionMs = hits.length
    ? Math.round(hits.reduce((s, r) => s + r.reactionMs, 0) / hits.length) : 0
  const bestReactionMs = hits.length
    ? Math.round(Math.min(...hits.map((r) => r.reactionMs))) : 0
  return {
    totalTargets: results.length,
    hits: hits.length,
    misses: results.length - hits.length,
    avgAccuracyPct, avgReactionMs, bestReactionMs, totalTimeMs,
  }
}

// ─── Simón Dice ──────────────────────────────────────────────────────────────

export interface SimonButtonDef {
  id: string
  label: string
  emoji: string
  hex: string
}

export const SIMON_BUTTONS: SimonButtonDef[] = [
  { id: 'levantense', label: 'levántense', emoji: '🙌', hex: '#22E6C5' },
  { id: 'salten', label: 'salten', emoji: '🤸', hex: '#FF6B4A' },
  { id: 'agachense', label: 'agáchense', emoji: '🙇', hex: '#8B7CF6' },
  { id: 'aplaudan', label: 'aplaudan', emoji: '👏', hex: '#F5A623' },
  { id: 'giren', label: 'giren', emoji: '🔄', hex: '#4A9EFF' },
  { id: 'sientense', label: 'siéntense', emoji: '🪑', hex: '#FF6BCB' },
  { id: 'toquen-nariz', label: 'toquen su nariz', emoji: '👃', hex: '#A3E635' },
  { id: 'cierren-ojos', label: 'cierren los ojos', emoji: '🙈', hex: '#FB923C' },
  { id: 'sonrian', label: 'sonrían', emoji: '😄', hex: '#818CF8' },
  { id: 'silencio', label: 'guarden silencio', emoji: '🤫', hex: '#2DD4BF' },
  { id: 'brazos-arriba', label: 'levanten los brazos', emoji: '🙋', hex: '#FB7185' },
  { id: 'congelense', label: 'se congelen', emoji: '🧊', hex: '#38BDF8' },
]

export interface SimonLevel {
  level: number
  options: SimonButtonDef[]
  correctId: string
  prompt: string
  timeLimitMs: number
}

export function getSimonTimeLimit(level: number): number {
  return Math.max(4000 - (level - 1) * 90, 900)
}

export function generateSimonLevel(
  level: number, pool: SimonButtonDef[] = SIMON_BUTTONS
): SimonLevel {
  const rng = mulberry32(levelSeed(level, 7717))
  const shuffled = [...pool].sort(() => rng() - 0.5)
  const options = shuffled.slice(0, 4)
  const correct = options[Math.floor(rng() * options.length)]
  return {
    level, options, correctId: correct.id,
    prompt: `Simón dice: ${correct.label}`,
    timeLimitMs: getSimonTimeLimit(level),
  }
}

export interface SimonCustomLevel {
  id: string
  prompt: string
  correctId: string
  options: SimonButtonDef[]
  createdAt: number
}

export function buildCustomSimonLevel(
  prompt: string, correctId: string, options: SimonButtonDef[]
): SimonCustomLevel {
  return {
    id: `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    prompt, correctId, options: options.slice(0, 4), createdAt: Date.now(),
  }
}

export function simonLevelFromCustom(
  custom: SimonCustomLevel, level: number
): SimonLevel {
  const rng = mulberry32(levelSeed(level, 8321))
  const options = [...custom.options].sort(() => rng() - 0.5)
  return {
    level, options, correctId: custom.correctId,
    prompt: custom.prompt, timeLimitMs: getSimonTimeLimit(level),
  }
}