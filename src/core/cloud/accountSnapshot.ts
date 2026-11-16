type Snapshot = Record<string, string>
const keys = new Set([
  'gco:math-stats-v1','gco:math-resume-v1','gco:sudoku-v1','gco:sudoku-saves-v1','gco:sudoku-prefs-v1',
  'gco:knowledge-stats-v1','gco:knowledge-resume-v1',
  'gco:reading-stats-v1','gco:reading-lexicon-v1','gco:reading-resume-v1',
  'gco:profile', 'gco:progress', 'gco:progress-prefs', 'gco:streak', 'gco:table-history-v1',
  'gco:table-totals-v1', 'gco:chess-text-history', 'gco:puzzle-progress', 'gco:puzzle-stats',
  'gco:typing-best', 'gco:verbal-best', 'gco:palace-best', 'gco:routines', 'gco:routine-prefs',
  'gco_historias_completed_v3', 'gco:chess-active', 'gco:chess-tournament',
  'gco:theme', 'gco:theme-mode', 'gco:chess-visual', 'gco:piece-styles',
])
const isAccountKey = (key: string) => keys.has(key) || /^gco:party-(save|prefs):/.test(key) || /^bc\.v21[23]\./.test(key) || /^gco:(gameProgress(?::|$)|despejes-progress:|habilidades:)/.test(key)
const counters = new Set(['attempts', 'wins', 'draws', 'time', 'totalTimeMs', 'totalAttempts', 'totalCompleted', 'accuracySum', 'readMs', 'words', 'totalCorrect', 'totalQuestions'])
export function accountSnapshot(storage: Storage): Snapshot {
  const snapshot: Snapshot = {}
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key && isAccountKey(key)) {
      const value = storage.getItem(key)
      if (value !== null) snapshot[key] = value
    }
  }
  return snapshot
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const parse = (value?: string): unknown => { try { return JSON.parse(value ?? 'null') } catch { return null } }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function mergeProgress(local: unknown, remote: unknown, base: unknown, field = ''): unknown {
  if (local == null) return remote
  if (remote == null || equal(remote, base)) return local
  if (equal(local, base)) return remote
  if (Array.isArray(local) && Array.isArray(remote)) {
    const entries = new Map<string, unknown>()
    for (const item of [...remote, ...local]) entries.set(object(item) && typeof item.id === 'string' ? item.id : JSON.stringify(item), item)
    const time = (item: unknown) => object(item) ? (typeof item.at === 'number' ? item.at : Date.parse(String(item.at)) || 0) : 0
    return [...entries.values()].sort((a, b) => time(b) - time(a))
  }
  if (object(local) && object(remote)) {
    const common = object(base) ? base : {}
    return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local)])]
      .map(key => [key, mergeProgress(local[key], remote[key], common[key], key)]))
  }
  if (typeof local === 'number' && typeof remote === 'number') {
    if (field === 'bestTimeMs') return local && remote ? Math.min(local, remote) : local || remote
    if (counters.has(field) && typeof base === 'number' && local >= base && remote >= base) return local + remote - base
    return Math.max(local, remote)
  }
  if (typeof local === 'string' && typeof remote === 'string' && /^(last|lastPlayedAt|lastActiveDate)$/.test(field)) return local > remote ? local : remote
  return local
}

export function snapshotSignatures(snapshot: Snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    return [key, `${value.length}:${hash >>> 0}`]
  }))
}

export function combineAccountSnapshots(local: Snapshot, remote: Snapshot, base: Snapshot | null, signatures?: Snapshot): Snapshot {
  const merged: Snapshot = {}
  for (const [key, value] of Object.entries(remote)) if (isAccountKey(key) && typeof value === 'string') merged[key] = value
  const localSignatures = signatures ? snapshotSignatures(local) : undefined
  for (const [key, value] of Object.entries(local)) {
    if (base ? base[key] === value : signatures?.[key] === localSignatures?.[key] && !!signatures?.[key]) continue
    const previous = merged[key]
    if (!previous || previous === base?.[key] || previous === value) {
      merged[key] = value
      continue
    }
    if (/progress|history|totals|stats|best|historial|nivel|completed|chess-active/i.test(key) && key !== 'gco:progress-prefs') {
      merged[key] = JSON.stringify(mergeProgress(parse(value), parse(previous), parse(base?.[key])))
    } else if (base || signatures) {
      merged[key] = value
    }
  }
  return merged
}
