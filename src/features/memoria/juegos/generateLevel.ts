import { mulberry32, levelSeed } from '../../../core/level-engine/rng'
import { getMemorySequenceDifficulty } from '../../../core/level-engine/difficulty'

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