import { mulberry32, levelSeed } from '../../../core/level-engine/rng'
import { getMemorySequenceDifficulty } from '../../../core/level-engine/difficulty'

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
  alnum: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // sin I,O,0,1 para legibilidad
  code: 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',
}

/** Genera secuencia con bloques a partir de config (o de un nivel) */
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

/** Config sugerida por nivel (modo progresivo) */
export function configFromLevel(level: number): ChunkConfig {
  // Niveles 1-5: 6-10 dígitos, bloques de 2-3
  // Luego sube chars y tamaño de bloque
  const totalChars = Math.min(6 + level, 32)
  const blockSize =
    level <= 4 ? 2 :
    level <= 10 ? 3 :
    level <= 20 ? 4 : 5

  return {
    totalChars,
    blockSize: Math.min(blockSize, totalChars),
    charset: 'digits',
    seed: level * 7919,
  }
}

export const COLORS = [
  { id: 'cyan', hex: '#22E6C5' },
  { id: 'coral', hex: '#FF6B4A' },
  { id: 'violet', hex: '#8B7CF6' },
  { id: 'amber', hex: '#F5A623' },
  { id: 'blue', hex: '#4A9EFF' },
  { id: 'pink', hex: '#FF6BCB' },
] as const

export type ColorId = (typeof COLORS)[number]['id']

export function generateColorSequenceLevel(level: number) {
  const rng = mulberry32(levelSeed(level))
  const { length, showTimeMs, pauseBetweenMs } = getMemorySequenceDifficulty(level)

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