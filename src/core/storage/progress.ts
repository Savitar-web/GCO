export type CategoryId =
  | 'memoria'
  | 'logica'
  | 'deduccion'
  | 'lectura'
  | 'conocimiento'
  | 'matematicas'

/** Mejor marca y estadísticas de un nivel concreto */
export interface LevelRecord {
  bestTimeMs: number
  lastTimeMs?: number
  attempts: number
  wins: number
  lastPlayedAt?: string
}

export interface HistoryEntry {
  level: number
  success: boolean
  timeMs?: number
  at: string
  /** false = no contó para racha/ranking (modo invitado) */
  ranked: boolean
}

export interface GameProgress {
  highestLevel: number
  totalCompleted: number
  /** Intentos totales (éxitos + fallos) */
  totalAttempts: number
  bestScore?: number
  lastPlayedAt?: string
  /** key = String(level) */
  levels: Record<string, LevelRecord>
  /** Últimas partidas (más reciente primero), máx. ~40 */
  history: HistoryEntry[]
}

export type ProgressMap = Record<string, GameProgress>

export interface ProgressPrefs {
  /**
   * Si false: no se actualiza racha ni se marca la partida como "ranked".
   * Útil al prestar el móvil.
   */
  rankingEnabled: boolean
  /**
   * Curva más suave de dificultad (los juegos pueden leerlo).
   */
  softProgression: boolean
}

export interface StreakData {
  current: number
  best: number
  /** YYYY-MM-DD local */
  lastActiveDate: string | null
}

export interface TotalProgressSummary {
  gamesPlayed: number
  totalLevels: number
  totalCompleted: number
  totalAttempts: number
  /** 0–100 victorias / intentos global */
  winRate: number
  percent: number
  streak: StreakData
  prefs: ProgressPrefs
  byGame: Array<{
    key: string
    categoryId: string
    gameId: string
    highestLevel: number
    totalCompleted: number
    totalAttempts: number
    winRate: number
    bestTimeMs?: number
  }>
}

const PROGRESS_KEY = 'gco:progress'
const PREFS_KEY = 'gco:progress-prefs'
const STREAK_KEY = 'gco:streak'
const HISTORY_LIMIT = 40
const TARGET_LEVEL_SUM = 50

// ─── Preferencias (ranking / curva suave) ───────────────────────────────────

const DEFAULT_PREFS: ProgressPrefs = {
  rankingEnabled: true,
  softProgression: true,
}

export function getProgressPrefs(): ProgressPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<ProgressPrefs>
    return {
      rankingEnabled: p.rankingEnabled ?? true,
      softProgression: p.softProgression ?? true,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveProgressPrefs(update: Partial<ProgressPrefs>): ProgressPrefs {
  const next = { ...getProgressPrefs(), ...update }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  return next
}

// ─── Rachas ─────────────────────────────────────────────────────────────────

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2])
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2])
  return Math.round((db - da) / 86_400_000)
}

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return { current: 0, best: 0, lastActiveDate: null }
    const s = JSON.parse(raw) as StreakData
    return {
      current: s.current ?? 0,
      best: s.best ?? 0,
      lastActiveDate: s.lastActiveDate ?? null,
    }
  } catch {
    return { current: 0, best: 0, lastActiveDate: null }
  }
}

function bumpStreakIfNeeded(): StreakData {
  const today = todayKey()
  const s = getStreak()

  if (s.lastActiveDate === today) {
    return s
  }

  let current = 1
  if (s.lastActiveDate) {
    const diff = daysBetween(s.lastActiveDate, today)
    if (diff === 1) current = s.current + 1
    else current = 1
  }

  const next: StreakData = {
    current,
    best: Math.max(s.best, current),
    lastActiveDate: today,
  }
  localStorage.setItem(STREAK_KEY, JSON.stringify(next))
  return next
}

// ─── Progress map ───────────────────────────────────────────────────────────

function emptyGame(): GameProgress {
  return {
    highestLevel: 0,
    totalCompleted: 0,
    totalAttempts: 0,
    levels: {},
    history: [],
  }
}

function normalizeGame(raw: Partial<GameProgress> | undefined): GameProgress {
  const base = emptyGame()
  if (!raw) return base
  return {
    highestLevel: raw.highestLevel ?? 0,
    totalCompleted: raw.totalCompleted ?? 0,
    totalAttempts: raw.totalAttempts ?? raw.totalCompleted ?? 0,
    bestScore: raw.bestScore,
    lastPlayedAt: raw.lastPlayedAt,
    levels: raw.levels ?? {},
    history: Array.isArray(raw.history) ? raw.history : [],
  }
}

export function getAllProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ProgressMap
    const out: ProgressMap = {}
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = normalizeGame(v)
    }
    return out
  } catch {
    return {}
  }
}

export function getGameProgress(
  categoryId: CategoryId,
  gameId: string
): GameProgress {
  const all = getAllProgress()
  return normalizeGame(all[`${categoryId}:${gameId}`])
}

/** Escritura parcial legacy (compatible con código antiguo) */
export function saveGameProgress(
  categoryId: CategoryId,
  gameId: string,
  update: Partial<GameProgress>
): void {
  const all = getAllProgress()
  const key = `${categoryId}:${gameId}`
  const current = normalizeGame(all[key])

  all[key] = normalizeGame({
    ...current,
    ...update,
    levels: update.levels ?? current.levels,
    history: update.history ?? current.history,
    lastPlayedAt: new Date().toISOString(),
  })

  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
}

export function getLevelRecord(
  categoryId: CategoryId,
  gameId: string,
  level: number
): LevelRecord | null {
  const g = getGameProgress(categoryId, gameId)
  return g.levels[String(level)] ?? null
}

export function getLevelBestTime(
  categoryId: CategoryId,
  gameId: string,
  level: number
): number | null {
  const rec = getLevelRecord(categoryId, gameId, level)
  return rec?.bestTimeMs ?? null
}

export interface RecordResultInput {
  categoryId: CategoryId
  gameId: string
  level: number
  success: boolean
  /** ms que tardó esta partida (solo si aplica) */
  timeMs?: number
  score?: number
}

/**
 * Registra un intento de nivel.
 * Respeta rankingEnabled: si está off, no sube racha ni marca ranked.
 * Siempre actualiza intentos locales y best time si hay timeMs y éxito.
 */
export function recordLevelResult(input: RecordResultInput): GameProgress {
  const { categoryId, gameId, level, success } = input
  const prefs = getProgressPrefs()
  const ranked = prefs.rankingEnabled
  const all = getAllProgress()
  const key = `${categoryId}:${gameId}`
  const current = normalizeGame(all[key])
  const levelKey = String(level)
  const prevLevel = current.levels[levelKey]

  const attempts = (prevLevel?.attempts ?? 0) + 1
  const wins = (prevLevel?.wins ?? 0) + (success ? 1 : 0)

  let bestTimeMs = prevLevel?.bestTimeMs
  let lastTimeMs = input.timeMs

  if (success && typeof input.timeMs === 'number' && input.timeMs > 0) {
    if (bestTimeMs == null || input.timeMs < bestTimeMs) {
      bestTimeMs = input.timeMs
    }
  }

  const levelRec: LevelRecord = {
    bestTimeMs: bestTimeMs ?? (success && input.timeMs ? input.timeMs : prevLevel?.bestTimeMs ?? 0),
    lastTimeMs,
    attempts,
    wins,
    lastPlayedAt: new Date().toISOString(),
  }

  // Si no hay ningún tiempo válido, no dejes bestTimeMs en 0 engañoso
  if (!levelRec.bestTimeMs && !prevLevel?.bestTimeMs) {
    if (!(success && input.timeMs)) {
      const { bestTimeMs: _b, ...rest } = levelRec
      current.levels[levelKey] = {
        ...rest,
        bestTimeMs: prevLevel?.bestTimeMs ?? 0,
      }
    } else {
      current.levels[levelKey] = levelRec
    }
  } else {
    current.levels[levelKey] = levelRec
  }

  const entry: HistoryEntry = {
    level,
    success,
    timeMs: input.timeMs,
    at: new Date().toISOString(),
    ranked,
  }

  const history = [entry, ...current.history].slice(0, HISTORY_LIMIT)

  let highestLevel = current.highestLevel
  let totalCompleted = current.totalCompleted

  if (success) {
    highestLevel = Math.max(highestLevel, level)
    totalCompleted = totalCompleted + 1
  }

  if (ranked && success) {
    bumpStreakIfNeeded()
  }

  const next: GameProgress = {
    highestLevel,
    totalCompleted,
    totalAttempts: current.totalAttempts + 1,
    bestScore:
      input.score != null
        ? Math.max(current.bestScore ?? 0, input.score)
        : current.bestScore,
    lastPlayedAt: entry.at,
    levels: {
      ...current.levels,
      [levelKey]: current.levels[levelKey],
    },
    history,
  }

  all[key] = next
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
  return next
}

export function getWinRate(completed: number, attempts: number): number {
  if (attempts <= 0) return 0
  return Math.round((completed / attempts) * 100)
}

export function getTotalProgress(): TotalProgressSummary {
  const all = getAllProgress()
  const prefs = getProgressPrefs()
  const streak = getStreak()

  const byGame = Object.entries(all).map(([key, value]) => {
    const [categoryId, gameId] = key.split(':')
    const g = normalizeGame(value)
    const times = Object.values(g.levels)
      .map((l) => l.bestTimeMs)
      .filter((t) => t > 0)
    const bestTimeMs = times.length ? Math.min(...times) : undefined

    return {
      key,
      categoryId: categoryId ?? '—',
      gameId: gameId ?? key,
      highestLevel: g.highestLevel,
      totalCompleted: g.totalCompleted,
      totalAttempts: g.totalAttempts,
      winRate: getWinRate(g.totalCompleted, g.totalAttempts),
      bestTimeMs,
    }
  })

  const totalLevels = byGame.reduce((s, g) => s + g.highestLevel, 0)
  const totalCompleted = byGame.reduce((s, g) => s + g.totalCompleted, 0)
  const totalAttempts = byGame.reduce((s, g) => s + g.totalAttempts, 0)
  const percent = Math.min(
    100,
    Math.round((totalLevels / TARGET_LEVEL_SUM) * 100)
  )

  return {
    gamesPlayed: byGame.length,
    totalLevels,
    totalCompleted,
    totalAttempts,
    winRate: getWinRate(totalCompleted, totalAttempts),
    percent,
    streak,
    prefs,
    byGame: byGame.sort((a, b) => b.highestLevel - a.highestLevel),
  }
}

/** Lista de niveles desbloqueados (1..highest) con marcas */
export function getUnlockedLevels(
  categoryId: CategoryId,
  gameId: string
): Array<{ level: number; bestTimeMs: number | null; wins: number }> {
  const g = getGameProgress(categoryId, gameId)
  const max = Math.max(1, g.highestLevel)
  const list: Array<{
    level: number
    bestTimeMs: number | null
    wins: number
  }> = []

  for (let level = 1; level <= max; level++) {
    const rec = g.levels[String(level)]
    list.push({
      level,
      bestTimeMs: rec?.bestTimeMs && rec.bestTimeMs > 0 ? rec.bestTimeMs : null,
      wins: rec?.wins ?? 0,
    })
  }
  return list
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) return `${s}s`
  return `${m}:${String(s).padStart(2, '0')}`
}