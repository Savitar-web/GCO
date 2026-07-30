import { mulberry32, levelSeed } from '../../../core/level-engine/rng'
import {
  getMemorySequenceDifficulty,
  getMemoryCardsDifficulty,
} from '../../../core/level-engine/difficulty'

// ─── Números asociados (bloques) ───────────────────────────────────────────

export type CharsetMode = 'digits' | 'alnum' | 'code'

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

const CHARSETS: Record<CharsetMode, string> = {
  digits: '0123456789',
  alnum: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  code: 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',
}

export function generateChunkSequence(config: ChunkConfig): ChunkSequence {
  const seed = config.seed ?? Date.now() % 1_000_000
  const rng = mulberry32(levelSeed(seed, 9173))
  const alphabet = CHARSETS[config.charset]

  let raw = ''
  for (let i = 0; i < config.totalChars; i++) {
    raw += alphabet[Math.floor(rng() * alphabet.length)]
  }

  const blocks: string[] = []
  for (let i = 0; i < raw.length; i += config.blockSize) {
    blocks.push(raw.slice(i, i + config.blockSize))
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

// ─── Secuencia de colores (9 colores) ──────────────────────────────────────

export const COLORS = [
  { id: 'cyan', hex: '#22E6C5' },
  { id: 'coral', hex: '#FF6B4A' },
  { id: 'violet', hex: '#8B7CF6' },
  { id: 'amber', hex: '#F5A623' },
  { id: 'blue', hex: '#4A9EFF' },
  { id: 'pink', hex: '#FF6BCB' },
  { id: 'lime', hex: '#A3E635' },
  { id: 'orange', hex: '#FB923C' },
  { id: 'indigo', hex: '#818CF8' },
] as const

export type ColorId = (typeof COLORS)[number]['id']

export function generateColorSequenceLevel(level: number) {
  const rng = mulberry32(levelSeed(level))
  const { length, showTimeMs, pauseBetweenMs } =
    getMemorySequenceDifficulty(level)

  const sequence: ColorId[] = Array.from({ length }, () => {
    const idx = Math.floor(rng() * COLORS.length)
    return COLORS[idx].id
  })

  return {
    level,
    sequence,
    showTimeMs,
    pauseBetweenMs,
  }
}

// ─── Memoria de cartas ─────────────────────────────────────────────────────

const CARD_EMOJIS = [
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯',
  '🎵', '🎲', '🧩', '🔑', '🎈', '🍀',
]

export type CardItem = {
  id: string
  pairId: number
  emoji: string
}

export function generateCardsLevel(level: number) {
  const { pairs, gridCols, timeSec } = getMemoryCardsDifficulty(level)
  const rng = mulberry32(levelSeed(level, 4242))

  const pool = [...CARD_EMOJIS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const chosen = pool.slice(0, pairs)

  const cards: CardItem[] = []
  chosen.forEach((emoji, pairId) => {
    cards.push({ id: `${pairId}-a`, pairId, emoji })
    cards.push({ id: `${pairId}-b`, pairId, emoji })
  })

  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }

  return { cards, pairs, gridCols, timeSec }
}