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

/** Ventana de espera antes de que aparezca el estímulo. Se hace más
 *  impredecible (mayor rango) con cada ronda para evitar que el usuario
 *  "cuente" el tiempo mentalmente. */
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

/** Formatea el tiempo con hasta 5 dígitos: milisegundos si es corto,
 *  segundos con decimales si es largo. */
export function formatReactionTime(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(3)} s`
  }
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

// ─── Puntería (Aim Trainer) ─────────────────────────────────────────────────

export interface AimTarget {
  id: string
  x: number // % dentro del área de juego
  y: number // % dentro del área de juego
  radius: number // px
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
    targetCount,
    radius,
    areaPaddingPct: 8,
    spawnDelayMinMs: Math.max(280 - level * 4, 120),
    spawnDelayMaxMs: Math.max(900 - level * 12, 320),
  }
}

export function generateAimTarget(
  index: number,
  level: number,
  config: AimSessionConfig,
  seed?: number
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

/** Precisión 0-100 según qué tan cerca del centro cayó el click. */
export function scoreAimHit(distanceFromCenterPx: number, radius: number): number {
  const ratio = Math.min(Math.max(distanceFromCenterPx / radius, 0), 1)
  return Math.round((1 - ratio) * 100)
}

/** Color del blanco según precisión: rojo (borde) → ámbar → lima → cian (centro). */
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
  results: AimHitResult[],
  totalTimeMs: number
): AimSessionSummary {
  const hits = results.filter((r) => r.hit)
  const avgAccuracyPct = hits.length
    ? Math.round(hits.reduce((s, r) => s + r.accuracyPct, 0) / hits.length)
    : 0
  const avgReactionMs = hits.length
    ? Math.round(hits.reduce((s, r) => s + r.reactionMs, 0) / hits.length)
    : 0
  const bestReactionMs = hits.length
    ? Math.round(Math.min(...hits.map((r) => r.reactionMs)))
    : 0

  return {
    totalTargets: results.length,
    hits: hits.length,
    misses: results.length - hits.length,
    avgAccuracyPct,
    avgReactionMs,
    bestReactionMs,
    totalTimeMs,
  }
}

// ─── Simón Dice ──────────────────────────────────────────────────────────────

export interface SimonButtonDef {
  id: string
  label: string
  emoji: string
  hex: string
}

/** Más de 10 botones posibles; cada partida se eligen 4 al azar,
 *  parecidos entre sí para generar confusión. */
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
  options: SimonButtonDef[] // 4 botones de la partida
  correctId: string
  prompt: string
  timeLimitMs: number
}

/** Empieza en 4000ms y baja progresivamente hasta un piso de 900ms. */
export function getSimonTimeLimit(level: number): number {
  const time = 4000 - (level - 1) * 90
  return Math.max(time, 900)
}

export function generateSimonLevel(
  level: number,
  pool: SimonButtonDef[] = SIMON_BUTTONS
): SimonLevel {
  const rng = mulberry32(levelSeed(level, 7717))
  const shuffled = [...pool].sort(() => rng() - 0.5)
  const options = shuffled.slice(0, 4)
  const correct = options[Math.floor(rng() * options.length)]

  const prompt = `Simón dice: ${correct.label}`

  return {
    level,
    options,
    correctId: correct.id,
    prompt,
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

/** Construye un nivel manual para el modo creativo. */
export function buildCustomSimonLevel(
  prompt: string,
  correctId: string,
  options: SimonButtonDef[]
): SimonCustomLevel {
  return {
    id: `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    prompt,
    correctId,
    options: options.slice(0, 4),
    createdAt: Date.now(),
  }
}

/** Inserta un nivel creativo guardado dentro de la progresión normal,
 *  con el tiempo correspondiente al nivel donde aparece. Los botones se
 *  vuelven a barajear de forma ordinaria. */
export function simonLevelFromCustom(
  custom: SimonCustomLevel,
  level: number
): SimonLevel {
  const rng = mulberry32(levelSeed(level, 8321))
  const options = [...custom.options].sort(() => rng() - 0.5)

  return {
    level,
    options,
    correctId: custom.correctId,
    prompt: custom.prompt,
    timeLimitMs: getSimonTimeLimit(level),
  }
}