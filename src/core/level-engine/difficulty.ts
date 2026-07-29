export function getMemorySequenceDifficulty(level: number) {
  return {
    length: Math.min(3 + Math.floor(level / 2), 16),
    showTimeMs: Math.max(700 - level * 8, 280),
    pauseBetweenMs: Math.max(220 - level * 2, 90),
  }
}

export function getMemoryCardsDifficulty(level: number) {
  // pares = 4 → 12
  const pairs = Math.min(4 + Math.floor(level / 3), 12)
  return {
    pairs,
    gridCols: pairs <= 6 ? 3 : pairs <= 8 ? 4 : 4,
  }
}