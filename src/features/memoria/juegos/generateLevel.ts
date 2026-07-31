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
]

/** Nombres en español para el lector de voz */
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
export type ColorCount = 4 | 6 | 9 | 12

/** @deprecated usa ALL_COLORS + colorCount */
export const COLORS = ALL_COLORS.slice(0, 9)

export function getColorsForCount(count: ColorCount) {
  return ALL_COLORS.slice(0, count)
}

export function generateColorSequenceLevel(
  level: number,
  colorCount: ColorCount = 9
) {
  const rng = mulberry32(levelSeed(level, 3100 + colorCount))
  const { length, showTimeMs, pauseBetweenMs } =
    getMemorySequenceDifficulty(level)
  const palette = getColorsForCount(colorCount)

  const sequence: ColorId[] = Array.from({ length }, () => {
    const idx = Math.floor(rng() * palette.length)
    return palette[idx].id
  })

  return {
    level,
    sequence,
    showTimeMs,
    pauseBetweenMs,
    colorCount,
    palette,
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

/** Varias pasadas + corte riffle para mezclar mejor */
function deepShuffle<T>(arr: T[], rng: () => number, passes = 3): T[] {
  let a = [...arr]
  for (let p = 0; p < passes; p++) {
    a = fisherYates(a, rng)
    // Riffle simple: partir por la mitad e intercalar
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

  const pool = deepShuffle(CARD_EMOJIS, rng, 2)

  if (mode === 'pairs') {
    const chosen = pool.slice(0, pairs)
    let cards: CardItem[] = []
    chosen.forEach((emoji, pairId) => {
      cards.push({ id: `${pairId}-a`, pairId, emoji })
      cards.push({ id: `${pairId}-b`, pairId, emoji })
    })
    cards = deepShuffle(cards, rng, 4)
    return { mode, cards, pairs, gridCols, timeSec, targetIndex: -1, orderIds: [] as string[] }
  }

  if (mode === 'track') {
    // Un set de cartas únicas; una es el objetivo
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

  // mode === 'order': memorizar orden de aparición
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