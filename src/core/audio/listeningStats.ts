const KEY = 'gco:music-listen-stats-v1'
let previous: { id: string; position: number; at: number } | null = null
let countedTrack: string | null = null
let pendingMs = 0
let lastWrite = 0

export function recordListening(id: string | undefined, position: number, playing: boolean) {
  if (!id) { previous = null; return }
  const now = Date.now()
  if (previous?.id === id && playing) {
    const elapsed = now - previous.at
    const advanced = position - previous.position
    if (advanced > 0 && advanced <= elapsed * 4 + 1000) pendingMs += Math.min(elapsed, advanced)
  } else pendingMs = 0
  previous = { id, position, at: now }
  if ((!playing || now - lastWrite >= 2000) && (pendingMs > 0 || (playing && countedTrack !== id))) {
    try {
      const stats = JSON.parse(localStorage.getItem(KEY) || '{}')
      const current = stats[id] || { plays: 0, ms: 0, lastAt: 0 }
      if (countedTrack !== id && playing) { current.plays++; countedTrack = id }
      current.ms += Math.round(pendingMs); current.lastAt = now; stats[id] = current
      localStorage.setItem(KEY, JSON.stringify(stats))
      pendingMs = 0; lastWrite = now
      window.dispatchEvent(new Event('gco:listening'))
    } catch { pendingMs = 0 }
  }
}
