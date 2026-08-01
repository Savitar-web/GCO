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
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑', '🥝', '🍌',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬', '🐱', '🐼',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯', '🎵', '🍀',
  '🚀', '🌈', '❄️', '🌻', '🏀', '🎲', '🔑', '🎈',
] as const

export const EMOJI_NAMES: Record<string, string> = {
  '🍎': 'manzana',
  '🍋': 'limón',
  '🍇': 'uva',
  '🍉': 'sandía',
  '🍓': 'fresa',
  '🍑': 'melocotón',
  '🥝': 'kiwi',
  '🍌': 'plátano',
  '🦊': 'zorro',
  '🐸': 'rana',
  '🦉': 'búho',
  '🐙': 'pulpo',
  '🦋': 'mariposa',
  '🐬': 'delfín',
  '🐱': 'gato',
  '🐼': 'panda',
  '⭐': 'estrella',
  '🌙': 'luna',
  '⚡': 'rayo',
  '🔥': 'fuego',
  '💎': 'diamante',
  '🎯': 'diana',
  '🎵': 'nota musical',
  '🍀': 'trébol',
  '🚀': 'cohete',
  '🌈': 'arcoíris',
  '❄️': 'copo de nieve',
  '🌻': 'girasol',
  '🏀': 'balón',
  '🎲': 'dado',
  '🔑': 'llave',
  '🎈': 'globo',
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
  const blockSize =
    level <= 4 ? 2 : level <= 10 ? 3 : level <= 20 ? 4 : 5

  return {
    totalChars,
    blockSize: Math.min(blockSize, totalChars),
    charset: 'digits',
    seed: level * 7919,
  }
}

export function emojiSequenceToSpeech(raw: string): string {
  return [...raw]
    .map((ch) => EMOJI_NAMES[ch] ?? ch)
    .join(', ')
}

// ─── Secuencia de colores ──────────────────────────────────────────────────

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
export type ColorDef = {
  id: ColorId
  hex: string
  label: string
}
export type ColorCount = 4 | 6 | 9 | 12

/** Lista mutable tipada (evita el `never` de .slice sobre `as const`) */
export const ALL_COLORS_LIST: ColorDef[] = ALL_COLORS.map((c) => ({
  id: c.id,
  hex: c.hex,
  label: c.label,
}))

/** @deprecated usa ALL_COLORS_LIST + colorCount */
export const COLORS: ColorDef[] = ALL_COLORS_LIST.slice(0, 9)

/**
 * Paleta para el grid según cantidad elegida.
 * Retorno explícito → TypeScript reconoce `id`, `hex`, `label`.
 */
export function getColorsForCount(count: ColorCount): ColorDef[] {
  const n = Math.min(Math.max(count, 4), ALL_COLORS_LIST.length)
  return ALL_COLORS_LIST.slice(0, n)
}

export interface ColorSequenceLevelOptions {
  /** Multiplica tiempos de muestra/pausa (curva suave / dopamina) */
  softProgression?: boolean
  /**
   * Modo cadena: parte de la secuencia anterior y añade colores.
   * Si no hay anterior, genera una secuencia normal.
   */
  chainFrom?: ColorId[]
  /** Cuántos colores nuevos añadir en modo cadena (default 1) */
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

export function generateColorSequenceLevel(
  level: number,
  colorCount: ColorCount = 9,
  options: ColorSequenceLevelOptions = {}
): ColorSequenceLevel {
  const {
    softProgression = false,
    chainFrom,
    chainGrowBy = 1,
  } = options

  const rng = mulberry32(levelSeed(level, 3100 + colorCount * 13))
  const base = getMemorySequenceDifficulty(level)
  const palette = getColorsForCount(colorCount)

  let sequence: ColorId[]
  let chained = false

  if (chainFrom && chainFrom.length > 0) {
    chained = true
    const grow = Math.max(1, chainGrowBy)
    const extra: ColorId[] = Array.from({ length: grow }, () => {
      const idx = Math.floor(rng() * palette.length)
      return palette[idx].id
    })
    sequence = [...chainFrom, ...extra]
  } else {
    const length = base.length
    sequence = Array.from({ length }, () => {
      const idx = Math.floor(rng() * palette.length)
      return palette[idx].id
    })
  }

  // Curva suave: más tiempo para ver / más pausa → más aciertos seguidos
  const softMulShow = softProgression ? 1.12 : 1
  const softMulPause = softProgression ? 1.1 : 1

  // En cadena, un poco más de tiempo de muestra por la longitud
  const lenFactor =
    sequence.length > 8 ? 1 + (sequence.length - 8) * 0.02 : 1

  const showTimeMs = Math.round(base.showTimeMs * softMulShow * lenFactor)
  const pauseBetweenMs = Math.round(base.pauseBetweenMs * softMulPause)

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

/**
 * Genera un nivel creativo / manual a partir de una secuencia fija.
 * Útil para el modo “crear nivel”.
 */
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
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯',
  '🎵', '🎲', '🧩', '🔑', '🎈', '🍀',
  '🚀', '🌈', '❄️', '🌻', '🏀', '🐱',
  '🐼', '🐢', '🐝', '🌸', '🎸', '🔔',
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
      if (takeLeft && li < left.length) {
        merged.push(left[li++])
      } else if (ri < right.length) {
        merged.push(right[ri++])
      } else if (li < left.length) {
        merged.push(left[li++])
      }
    }
    a = merged
  }
  return a
}

export function generateCardsLevel(level: number, mode: CardsMode = 'pairs') {
  const { pairs, gridCols, timeSec } = getMemoryCardsDifficulty(level)
  const rng = mulberry32(levelSeed(level, 4242 + mode.length * 17))

  const pool = deepShuffle([...CARD_EMOJIS], rng, 2)

  if (mode === 'pairs') {
    const chosen = pool.slice(0, pairs)
    let cards: CardItem[] = []
    chosen.forEach((emoji, pairId) => {
      cards.push({ id: `${pairId}-a`, pairId, emoji })
      cards.push({ id: `${pairId}-b`, pairId, emoji })
    })
    cards = deepShuffle(cards, rng, 4)
    return {
      mode,
      cards,
      pairs,
      gridCols,
      timeSec,
      targetIndex: -1,
      orderIds: [] as string[],
    }
  }

  if (mode === 'track') {
    const count = Math.min(4 + Math.floor(level / 2), 12)
    const chosen = pool.slice(0, count)
    let cards: CardItem[] = chosen.map((emoji, i) => ({
      id: `t-${i}`,
      pairId: i,
      emoji,
    }))
    cards = deepShuffle(cards, rng, 3)
    const targetIndex = Math.floor(rng() * cards.length)
    return {
      mode,
      cards,
      pairs: count,
      gridCols: count <= 6 ? 3 : 4,
      timeSec: Math.max(timeSec, 40),
      targetIndex,
      orderIds: [] as string[],
    }
  }

  // order
  {
    const count = Math.min(3 + Math.floor(level / 2), 10)
    const chosen = pool.slice(0, count)
    const cards: CardItem[] = chosen.map((emoji, i) => ({
      id: `o-${i}`,
      pairId: i,
      emoji,
    }))
    const orderIds = cards.map((c) => c.id)
    const shuffled = deepShuffle(cards, rng, 4)
    return {
      mode,
      cards: shuffled,
      pairs: count,
      gridCols: count <= 6 ? 3 : 4,
      timeSec: Math.max(timeSec, 45),
      targetIndex: -1,
      orderIds,
    }
  }
}

export function reshuffleCards(cards: CardItem[], level: number): CardItem[] {
  const rng = mulberry32(levelSeed(level, Date.now() % 99991))
  return deepShuffle(cards, rng, 5)
}