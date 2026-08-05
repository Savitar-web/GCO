/** Rutinas de entrenamiento — localStorage */

export type ActivityType = 'game' | 'rest'

export interface RoutineActivity {
  id: string
  type: ActivityType
  label: string
  durationMin: number
  /** Ruta de App.tsx */
  path?: string
}

export interface Routine {
  id: string
  name: string
  timeHHMM: string
  activities: RoutineActivity[]
  isPreset?: boolean
  updatedAt: string
}

export interface RoutineSession {
  routineId: string
  activityIndex: number
  endsAt: number
  paused: boolean
  remainingMsWhenPaused?: number
}

export interface RoutinePrefs {
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

function nowIso() {
  return new Date().toISOString()
}

/** Presets conscientes (reemplazan los antiguos). */
export function defaultPresetRoutines(): Routine[] {
  const t = nowIso()
  return [
    {
      id: 'preset-despertar-mente',
      name: 'Despertar mental (15 min)',
      timeHHMM: '07:30',
      isPreset: true,
      updatedAt: t,
      activities: [
        {
          id: uid(),
          type: 'game',
          label: 'Secuencia de colores',
          durationMin: 5,
          path: '/categoria/memoria/secuencia-colores',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Respirar · música suave',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: uid(),
          type: 'game',
          label: 'Habilidades · reacción',
          durationMin: 5,
          path: '/categoria/memoria/habilidades',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Cierre · estirar cuello',
          durationMin: 3,
          path: '/musica',
        },
      ],
    },
    {
      id: 'preset-memoria-suave',
      name: 'Memoria suave (20 min)',
      timeHHMM: '12:00',
      isPreset: true,
      updatedAt: t,
      activities: [
        {
          id: uid(),
          type: 'game',
          label: 'Memoria de cartas',
          durationMin: 7,
          path: '/categoria/memoria/cartas',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Descanso visual',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: uid(),
          type: 'game',
          label: 'Números / palabras / citas',
          durationMin: 8,
          path: '/categoria/memoria/numeros-asociados',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Agua + caminar',
          durationMin: 3,
          path: '/musica',
        },
      ],
    },
    {
      id: 'preset-logica-foco',
      name: 'Lógica con foco (25 min)',
      timeHHMM: '17:00',
      isPreset: true,
      updatedAt: t,
      activities: [
        {
          id: uid(),
          type: 'game',
          label: 'Colocador',
          durationMin: 8,
          path: '/categoria/logica/numberpuzzle',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Pausa de 2 min',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: uid(),
          type: 'game',
          label: 'Despejes',
          durationMin: 8,
          path: '/categoria/logica/despejes',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Lectura breve',
          durationMin: 5,
          path: '/nutricion',
        },
        {
          id: uid(),
          type: 'game',
          label: 'Rompecabezas (opcional)',
          durationMin: 2,
          path: '/categoria/logica/rompecabezas',
        },
      ],
    },
    {
      id: 'preset-noche-calma',
      name: 'Noche en calma (12 min)',
      timeHHMM: '21:30',
      isPreset: true,
      updatedAt: t,
      activities: [
        {
          id: uid(),
          type: 'game',
          label: 'Lectura / audiolibro',
          durationMin: 6,
          path: '/nutricion',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Música relajante',
          durationMin: 4,
          path: '/musica',
        },
        {
          id: uid(),
          type: 'game',
          label: 'Secuencia suave',
          durationMin: 2,
          path: '/categoria/memoria/secuencia-colores',
        },
      ],
    },
    {
      id: 'preset-rapido-5',
      name: 'Micro-sesión (5 min)',
      timeHHMM: '',
      isPreset: true,
      updatedAt: t,
      activities: [
        {
          id: uid(),
          type: 'game',
          label: 'Habilidades',
          durationMin: 3,
          path: '/categoria/memoria/habilidades',
        },
        {
          id: uid(),
          type: 'rest',
          label: 'Respirar 4-7-8',
          durationMin: 2,
          path: '/musica',
        },
      ],
    },
  ]
}

const DEFAULT_PREFS: RoutinePrefs = {
  systemEnabled: false,
  widgetX: 16,
  widgetY: 120,
  session: null,
}

function emit() {
  window.dispatchEvent(new Event('gco:routines-changed'))
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

export function saveRoutinePrefs(
  update: Partial<RoutinePrefs>
): RoutinePrefs {
  const next = { ...getRoutinePrefs(), ...update }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  emit()
  return next
}

export function getRoutines(): Routine[] {
  try {
    const raw = localStorage.getItem(ROUTINES_KEY)
    if (!raw) {
      const presets = defaultPresetRoutines()
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(presets))
      return presets
    }
    const list = JSON.parse(raw) as Routine[]
    // Migración: si solo hay presets viejos, o lista vacía de presets conocidos
    const hasNew = list.some((r) => r.id.startsWith('preset-despertar'))
    if (!hasNew && list.every((r) => r.isPreset)) {
      const presets = defaultPresetRoutines()
      const customs = list.filter((r) => !r.isPreset)
      const next = [...presets, ...customs]
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(next))
      return next
    }
    return list
  } catch {
    return defaultPresetRoutines()
  }
}

export function saveRoutines(list: Routine[]) {
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(list))
  emit()
}

export function upsertRoutine(r: Routine) {
  const list = getRoutines()
  const i = list.findIndex((x) => x.id === r.id)
  if (i >= 0) list[i] = r
  else list.push(r)
  saveRoutines(list)
}

export function deleteRoutine(id: string) {
  saveRoutines(getRoutines().filter((r) => r.id !== id))
}

export function createEmptyRoutine(): Routine {
  return {
    id: uid(),
    name: 'Mi rutina',
    timeHHMM: '',
    isPreset: false,
    updatedAt: nowIso(),
    activities: [
      {
        id: uid(),
        type: 'game',
        label: 'Secuencia de colores',
        durationMin: 5,
        path: '/categoria/memoria/secuencia-colores',
      },
      {
        id: uid(),
        type: 'rest',
        label: 'Descanso · Música',
        durationMin: 2,
        path: '/musica',
      },
    ],
  }
}

export function totalRoutineMinutes(r: Routine) {
  return r.activities.reduce((s, a) => s + (a.durationMin || 0), 0)
}

export function startRoutineSession(routineId: string): RoutinePrefs {
  const r = getRoutines().find((x) => x.id === routineId)
  if (!r || r.activities.length === 0) return getRoutinePrefs()
  const first = r.activities[0]
  const endsAt = Date.now() + first.durationMin * 60_000
  return saveRoutinePrefs({
    session: {
      routineId,
      activityIndex: 0,
      endsAt,
      paused: false,
    },
  })
}

export function advanceRoutineSession(): RoutinePrefs {
  const prefs = getRoutinePrefs()
  const s = prefs.session
  if (!s) return prefs
  const r = getRoutines().find((x) => x.id === s.routineId)
  if (!r) return saveRoutinePrefs({ session: null })
  const nextIdx = s.activityIndex + 1
  if (nextIdx >= r.activities.length) {
    return saveRoutinePrefs({ session: null })
  }
  const act = r.activities[nextIdx]
  return saveRoutinePrefs({
    session: {
      routineId: s.routineId,
      activityIndex: nextIdx,
      endsAt: Date.now() + act.durationMin * 60_000,
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
  if (!s.paused) {
    const remaining = Math.max(0, s.endsAt - Date.now())
    return saveRoutinePrefs({
      session: {
        ...s,
        paused: true,
        remainingMsWhenPaused: remaining,
      },
    })
  }
  const remaining = s.remainingMsWhenPaused ?? 0
  return saveRoutinePrefs({
    session: {
      ...s,
      paused: false,
      endsAt: Date.now() + remaining,
      remainingMsWhenPaused: undefined,
    },
  })
}

export function formatMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Fallback de campana si no hay tono personalizado */
export function ringBell() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.75)
    window.setTimeout(() => void ctx.close(), 1000)
  } catch {
    /* */
  }
}

/** Fuerza regenerar presets (borra presets viejos, conserva custom). */
export function resetPresetRoutines() {
  const customs = getRoutines().filter((r) => !r.isPreset)
  saveRoutines([...defaultPresetRoutines(), ...customs])
}