/** Rutinas de entrenamiento — localStorage */

export type ActivityType = 'game' | 'rest'

export interface RoutineActivity {
  id: string
  type: ActivityType
  label: string
  durationMin: number
  /** Ruta exacta de App.tsx */
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
const PRESETS_VERSION_KEY = 'gco:routines-presets-v'

/** Sube este número cuando cambien los presets para forzar migración */
const PRESETS_VERSION = 4

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Presets con rutas REALES del router:
 *   /categoria/memoria/...
 *   /categoria/logica/...
 *   /nutricion  /musica
 */
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
          id: 'pdm-1',
          type: 'game',
          label: 'Secuencia de colores',
          durationMin: 5,
          path: '/categoria/memoria/secuencia-colores',
        },
        {
          id: 'pdm-2',
          type: 'rest',
          label: 'Respirar · música suave',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: 'pdm-3',
          type: 'game',
          label: 'Habilidades · reacción',
          durationMin: 5,
          path: '/categoria/memoria/habilidades',
        },
        {
          id: 'pdm-4',
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
          id: 'pms-1',
          type: 'game',
          label: 'Memoria de cartas',
          durationMin: 7,
          path: '/categoria/memoria/cartas',
        },
        {
          id: 'pms-2',
          type: 'rest',
          label: 'Descanso visual',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: 'pms-3',
          type: 'game',
          label: 'Números · palabras · citas',
          durationMin: 8,
          path: '/categoria/memoria/numeros-asociados',
        },
        {
          id: 'pms-4',
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
          id: 'plf-1',
          type: 'game',
          label: 'Colocador',
          durationMin: 8,
          path: '/categoria/logica/numberpuzzle',
        },
        {
          id: 'plf-2',
          type: 'rest',
          label: 'Pausa de 2 min',
          durationMin: 2,
          path: '/musica',
        },
        {
          id: 'plf-3',
          type: 'game',
          label: 'Despejes',
          durationMin: 8,
          path: '/categoria/logica/despejes',
        },
        {
          id: 'plf-4',
          type: 'game',
          label: 'Lectura breve',
          durationMin: 5,
          path: '/nutricion',
        },
        {
          id: 'plf-5',
          type: 'game',
          label: 'Rompecabezas',
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
          id: 'pnc-1',
          type: 'game',
          label: 'Lectura / audiolibro',
          durationMin: 6,
          path: '/nutricion',
        },
        {
          id: 'pnc-2',
          type: 'rest',
          label: 'Música relajante',
          durationMin: 4,
          path: '/musica',
        },
        {
          id: 'pnc-3',
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
          id: 'pr5-1',
          type: 'game',
          label: 'Habilidades',
          durationMin: 3,
          path: '/categoria/memoria/habilidades',
        },
        {
          id: 'pr5-2',
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

export function saveRoutinePrefs(update: Partial<RoutinePrefs>): RoutinePrefs {
  const next = { ...getRoutinePrefs(), ...update }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  emit()
  return next
}

function mergePresets(customs: Routine[]): Routine[] {
  return [...defaultPresetRoutines(), ...customs]
}

export function getRoutines(): Routine[] {
  try {
    const ver = Number(localStorage.getItem(PRESETS_VERSION_KEY) || '0')
    const raw = localStorage.getItem(ROUTINES_KEY)

    if (!raw || ver < PRESETS_VERSION) {
      const customs = raw
        ? (JSON.parse(raw) as Routine[]).filter((r) => !r.isPreset)
        : []
      const next = mergePresets(customs)
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(next))
      localStorage.setItem(PRESETS_VERSION_KEY, String(PRESETS_VERSION))
      return next
    }

    const list = JSON.parse(raw) as Routine[]
    // Siempre alinear actividades de presets con plantilla (rutas correctas)
    let dirty = false
    const templates = defaultPresetRoutines()
    const fixed = list.map((r) => {
      if (!r.isPreset) return r
      const template = templates.find((p) => p.id === r.id)
      if (!template) return r
      dirty = true
      return {
        ...template,
        timeHHMM: r.timeHHMM || template.timeHHMM,
        updatedAt: nowIso(),
      }
    })
    // Añadir presets nuevos que falten
    for (const p of templates) {
      if (!fixed.some((r) => r.id === p.id)) {
        fixed.unshift(p)
        dirty = true
      }
    }
    if (dirty) {
      const customs = fixed.filter((r) => !r.isPreset)
      const merged = [...templates, ...customs]
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(merged))
      return merged
    }
    return fixed
  } catch {
    const presets = defaultPresetRoutines()
    localStorage.setItem(ROUTINES_KEY, JSON.stringify(presets))
    localStorage.setItem(PRESETS_VERSION_KEY, String(PRESETS_VERSION))
    return presets
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
  return saveRoutinePrefs({
    session: {
      routineId,
      activityIndex: 0,
      endsAt: Date.now() + first.durationMin * 60_000,
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
    return saveRoutinePrefs({
      session: {
        ...s,
        paused: true,
        remainingMsWhenPaused: Math.max(0, s.endsAt - Date.now()),
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

export function resetPresetRoutines() {
  const customs = getRoutines().filter((r) => !r.isPreset)
  localStorage.setItem(PRESETS_VERSION_KEY, String(PRESETS_VERSION))
  saveRoutines([...defaultPresetRoutines(), ...customs])
}