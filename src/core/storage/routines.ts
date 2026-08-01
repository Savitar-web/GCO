export type RoutineActivityType = 'game' | 'rest'

export interface RoutineActivity {
  id: string
  type: RoutineActivityType
  /** Ruta de juego, ej. /memoria/cartas */
  path?: string
  label: string
  durationMin: number
}

export interface Routine {
  id: string
  name: string
  activities: RoutineActivity[]
  /** 0 = domingo … 6 = sábado; vacío = cualquier día */
  daysOfWeek: number[]
  /** "HH:MM" local; vacío = sin hora fija */
  timeHHMM: string
  enabled: boolean
  isPreset?: boolean
  updatedAt: string
}

export interface RoutineSession {
  routineId: string
  activityIndex: number
  /** epoch ms fin de la actividad actual */
  endsAt: number
  startedAt: number
  paused?: boolean
  remainingMsWhenPaused?: number
}

export interface RoutinePrefs {
  /** Master switch (Ajustes). Por defecto false */
  systemEnabled: boolean
  widgetX: number
  widgetY: number
  session: RoutineSession | null
}

const ROUTINES_KEY = 'gco:routines'
const PREFS_KEY = 'gco:routine-prefs'

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const PRESET_ROUTINES: Routine[] = [
  {
    id: 'preset-warmup-mem',
    name: 'Calentamiento memoria',
    isPreset: true,
    enabled: true,
    daysOfWeek: [],
    timeHHMM: '',
    updatedAt: new Date(0).toISOString(),
    activities: [
      {
        id: 'a1',
        type: 'game',
        path: '/memoria/secuencia-colores',
        label: 'Secuencia de colores',
        durationMin: 8,
      },
      { id: 'a2', type: 'rest', label: 'Descanso', durationMin: 2 },
      {
        id: 'a3',
        type: 'game',
        path: '/memoria/cartas',
        label: 'Memoria de cartas',
        durationMin: 10,
      },
    ],
  },
  {
    id: 'preset-focus-blocks',
    name: 'Bloques + cartas',
    isPreset: true,
    enabled: true,
    daysOfWeek: [],
    timeHHMM: '',
    updatedAt: new Date(0).toISOString(),
    activities: [
      {
        id: 'b1',
        type: 'game',
        path: '/memoria/numeros-asociados',
        label: 'Bloques de memoria',
        durationMin: 12,
      },
      { id: 'b2', type: 'rest', label: 'Descanso', durationMin: 3 },
      {
        id: 'b3',
        type: 'game',
        path: '/memoria/cartas',
        label: 'Cartas (parejas)',
        durationMin: 10,
      },
      { id: 'b4', type: 'rest', label: 'Cierre', durationMin: 2 },
    ],
  },
  {
    id: 'preset-short',
    name: 'Rápida 15 min',
    isPreset: true,
    enabled: true,
    daysOfWeek: [],
    timeHHMM: '',
    updatedAt: new Date(0).toISOString(),
    activities: [
      {
        id: 'c1',
        type: 'game',
        path: '/memoria/secuencia-colores',
        label: 'Colores',
        durationMin: 6,
      },
      { id: 'c2', type: 'rest', label: 'Pausa', durationMin: 1 },
      {
        id: 'c3',
        type: 'game',
        path: '/memoria/numeros-asociados',
        label: 'Bloques',
        durationMin: 8,
      },
    ],
  },
]

const DEFAULT_PREFS: RoutinePrefs = {
  systemEnabled: false,
  widgetX: 16,
  widgetY: 120,
  session: null,
}

export function getRoutinePrefs(): RoutinePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<RoutinePrefs>
    return {
      systemEnabled: p.systemEnabled ?? false,
      widgetX: typeof p.widgetX === 'number' ? p.widgetX : 16,
      widgetY: typeof p.widgetY === 'number' ? p.widgetY : 120,
      session: p.session ?? null,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveRoutinePrefs(update: Partial<RoutinePrefs>): RoutinePrefs {
  const next = { ...getRoutinePrefs(), ...update }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('gco:routines-changed'))
  return next
}

export function getRoutines(): Routine[] {
  try {
    const raw = localStorage.getItem(ROUTINES_KEY)
    if (!raw) {
      // Primera vez: copiar presets
      const seed = PRESET_ROUTINES.map((r) => ({ ...r, activities: [...r.activities] }))
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(seed))
      return seed
    }
    const list = JSON.parse(raw) as Routine[]
    return Array.isArray(list) ? list : []
  } catch {
    return [...PRESET_ROUTINES]
  }
}

export function saveRoutines(list: Routine[]) {
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('gco:routines-changed'))
}

export function upsertRoutine(routine: Routine) {
  const list = getRoutines()
  const i = list.findIndex((r) => r.id === routine.id)
  if (i >= 0) list[i] = routine
  else list.unshift(routine)
  saveRoutines(list)
}

export function deleteRoutine(id: string) {
  saveRoutines(getRoutines().filter((r) => r.id !== id))
}

export function createEmptyRoutine(name = 'Mi rutina'): Routine {
  return {
    id: uid(),
    name,
    activities: [
      {
        id: uid(),
        type: 'game',
        path: '/memoria/secuencia-colores',
        label: 'Secuencia de colores',
        durationMin: 8,
      },
      { id: uid(), type: 'rest', label: 'Descanso', durationMin: 2 },
    ],
    daysOfWeek: [],
    timeHHMM: '',
    enabled: true,
    updatedAt: new Date().toISOString(),
  }
}

export function totalRoutineMinutes(r: Routine): number {
  return r.activities.reduce((s, a) => s + Math.max(0, a.durationMin), 0)
}

export function startRoutineSession(routineId: string): RoutinePrefs {
  const r = getRoutines().find((x) => x.id === routineId)
  if (!r || r.activities.length === 0) return getRoutinePrefs()
  const first = r.activities[0]
  const now = Date.now()
  return saveRoutinePrefs({
    session: {
      routineId,
      activityIndex: 0,
      startedAt: now,
      endsAt: now + first.durationMin * 60_000,
      paused: false,
    },
  })
}

export function advanceRoutineSession(): RoutinePrefs {
  const prefs = getRoutinePrefs()
  const session = prefs.session
  if (!session) return prefs
  const r = getRoutines().find((x) => x.id === session.routineId)
  if (!r) return saveRoutinePrefs({ session: null })

  const nextIdx = session.activityIndex + 1
  if (nextIdx >= r.activities.length) {
    return saveRoutinePrefs({ session: null })
  }
  const act = r.activities[nextIdx]
  const now = Date.now()
  return saveRoutinePrefs({
    session: {
      routineId: session.routineId,
      activityIndex: nextIdx,
      startedAt: now,
      endsAt: now + act.durationMin * 60_000,
      paused: false,
    },
  })
}

export function stopRoutineSession(): RoutinePrefs {
  return saveRoutinePrefs({ session: null })
}

export function togglePauseSession(): RoutinePrefs {
  const prefs = getRoutinePrefs()
  const s = prefs.session
  if (!s) return prefs
  if (s.paused) {
    const rem = s.remainingMsWhenPaused ?? 0
    const now = Date.now()
    return saveRoutinePrefs({
      session: {
        ...s,
        paused: false,
        startedAt: now,
        endsAt: now + rem,
        remainingMsWhenPaused: undefined,
      },
    })
  }
  const remaining = Math.max(0, s.endsAt - Date.now())
  return saveRoutinePrefs({
    session: {
      ...s,
      paused: true,
      remainingMsWhenPaused: remaining,
    },
  })
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Campana corta (Web Audio) */
export function ringBell() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const now = ctx.currentTime
    ;[880, 1174].forEach((freq, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, now + i * 0.12)
      g.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(now + i * 0.12)
      o.stop(now + i * 0.12 + 0.4)
    })
    window.setTimeout(() => ctx.close(), 800)
  } catch {
    /* ignore */
  }
}