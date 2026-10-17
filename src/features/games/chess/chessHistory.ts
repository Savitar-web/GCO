/**
 * Persistencia de historial de partidas de ajedrez (localStorage).
 */

export type HistoryResult = 'win' | 'loss' | 'draw'

export interface ChessHistoryEntry {
  id: string
  date: number
  mode: 'ai' | 'local2p'
  result: HistoryResult
  /** Desde la perspectiva del jugador humano (en IA) o del resultado global (2p) */
  winnerLabel: string
  moves: number
  durationSec: number
  aiLevel?: number
  humanColor?: 'w' | 'b'
  clock?: string
  view?: string
}

const STORAGE_KEY = 'gco-chess-history-v1'
const MAX_ENTRIES = 80

export function loadChessHistory(): ChessHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChessHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveChessHistoryEntry(entry: Omit<ChessHistoryEntry, 'id' | 'date'>): ChessHistoryEntry {
  const full: ChessHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: Date.now(),
  }
  const list = loadChessHistory()
  list.unshift(full)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota */
  }
  return full
}

export function clearChessHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* */
  }
}

export function chessHistoryStats(list: ChessHistoryEntry[]) {
  let wins = 0
  let losses = 0
  let draws = 0
  let totalMoves = 0
  let totalTime = 0
  for (const e of list) {
    if (e.result === 'win') wins++
    else if (e.result === 'loss') losses++
    else draws++
    totalMoves += e.moves
    totalTime += e.durationSec
  }
  return {
    games: list.length,
    wins,
    losses,
    draws,
    avgMoves: list.length ? Math.round(totalMoves / list.length) : 0,
    totalTime,
  }
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatHistoryDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
