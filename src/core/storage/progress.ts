export type CategoryId =
  | 'memoria'
  | 'logica'
  | 'deduccion'
  | 'lectura'
  | 'conocimiento'
  | 'matematicas'

export interface GameProgress {
  highestLevel: number
  totalCompleted: number
  bestScore?: number
  lastPlayedAt?: string
}

export type ProgressMap = Record<string, GameProgress> // key = `${categoryId}:${gameId}`

const PROGRESS_KEY = 'gco:progress'

export function getAllProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? (JSON.parse(raw) as ProgressMap) : {}
  } catch {
    return {}
  }
}

export function getGameProgress(categoryId: CategoryId, gameId: string): GameProgress {
  const all = getAllProgress()
  return (
    all[`${categoryId}:${gameId}`] ?? {
      highestLevel: 0,
      totalCompleted: 0,
    }
  )
}

export function saveGameProgress(
  categoryId: CategoryId,
  gameId: string,
  update: Partial<GameProgress>
): void {
  const all = getAllProgress()
  const key = `${categoryId}:${gameId}`
  const current = all[key] ?? { highestLevel: 0, totalCompleted: 0 }

  all[key] = {
    ...current,
    ...update,
    lastPlayedAt: new Date().toISOString(),
  }

  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
}