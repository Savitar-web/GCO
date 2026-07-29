/** Generador pseudoaleatorio determinista (mulberry32) */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Semilla derivada del nivel (y opcionalmente del usuario) */
export function levelSeed(level: number, salt = 7919): number {
  return level * salt
}