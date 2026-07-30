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
  const timeSec = Math.max(90 - level * 3, 25)
  return {
    pairs,
    gridCols: pairs <= 6 ? 3 : 4,
    timeSec,
  }
}