import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassButton } from '../../../../components/ui/GlassButton'
import { GlassCard } from '../../../../components/ui/GlassCard'
import {
  soundClick,
  soundColor,
  soundMatch,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
} from '@/core/audio/uiSounds'
import {
  generateColorSequenceLevel,
  buildCustomColorLevel,
  ALL_COLORS_LIST,
  type ColorId,
  type ColorCount,
  type ColorDef,
} from '../generateLevel'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  getProgressPrefs,
  formatDuration,
} from '../../../../core/storage/progress'

/* ─── Tipos ─────────────────────────────────────────────────────────────── */

type GameMode = 'climb' | 'progressive' | 'iluminados' | 'chimp' | 'creative' | 'paint'
type CreativeKind = 'sequence' | 'iluminados' | 'chimp'

type Phase =
  | 'menu'
  | 'ready'
  | 'showing'
  | 'input'
  | 'success'
  | 'fail'
  | 'creative-hub'
  | 'creative-edit'
  | 'paint-hub'
  | 'paint-edit'

/** Tamaño de rejilla para iluminados / chimp (mín. 9) */
type GridSize = 9 | 12 | 20 | 30

type CreativeLevel = {
  id: string
  name: string
  kind: CreativeKind
  /** Secuencia ordenada (modo sequence) */
  sequence: ColorId[]
  /** Índices de celdas iluminadas (modo iluminados) */
  targets: number[]
  /** Cantidad de números 1..N (modo chimp) */
  chimpCount: number
  colorCount: number
  updatedAt: string
}

type ColorTheme = {
  id: string
  name: string
  colors: ColorDef[]
  updatedAt: string
}

const SEQ_COLOR_OPTIONS: ColorCount[] = [4, 6, 9, 12]
const GRID_SIZE_OPTIONS: GridSize[] = [9, 12, 20, 30]
const GAME_CAT = 'memoria' as const
const GAME_ID = 'secuencia-colores'
const CREATIVE_KEY = 'gco:color-seq-creative-levels'
const THEMES_KEY = 'gco:color-seq-themes'
const ACTIVE_THEME_KEY = 'gco:color-seq-active-theme'

const MODE_INFO: Record<GameMode, { title: string; emoji: string; desc: string }> = {
  climb: {
    title: 'Subir de nivel',
    emoji: '📶',
    desc: 'Cada nivel genera una secuencia nueva más exigente.',
  },
  progressive: {
    title: 'Modo progresivo',
    emoji: '🔗',
    desc: 'La misma cadena crece: se conserva lo anterior y se añade un color.',
  },
  iluminados: {
    title: 'Iluminados',
    emoji: '💡',
    desc: 'Varias casillas se iluminan a la vez. Recuerda cuáles y tócalas.',
  },
  chimp: {
    title: 'Orden de colores',
    emoji: '🔢',
    desc: 'Números aparecen un instante en casillas mezcladas. Pulsa 1→N en orden.',
  },
  creative: {
    title: 'Modo creativo',
    emoji: '✨',
    desc: 'Crea secuencias, patrones iluminados u orden de colores.',
  },
  paint: {
    title: 'Colorear',
    emoji: '🎨',
    desc: 'Temas de colores con nombre; solo uno activo a la vez.',
  },
}

/** Orden del menú: iluminados y chimp encima de creativo */
const MODE_ORDER: GameMode[] = [
  'climb',
  'progressive',
  'iluminados',
  'chimp',
  'creative',
  'paint',
]

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadCreativeLevels(): CreativeLevel[] {
  try {
    const raw = localStorage.getItem(CREATIVE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as CreativeLevel[]
    if (!Array.isArray(list)) return []
    return list.map((lv) => ({
      kind: lv.kind ?? 'sequence',
      targets: lv.targets ?? [],
      chimpCount: lv.chimpCount ?? Math.max(4, (lv.targets?.length ?? 4)),
      sequence: lv.sequence ?? [],
      colorCount: lv.colorCount ?? 9,
      id: lv.id,
      name: lv.name,
      updatedAt: lv.updatedAt,
    }))
  } catch {
    return []
  }
}

function saveCreativeLevels(list: CreativeLevel[]) {
  localStorage.setItem(CREATIVE_KEY, JSON.stringify(list))
}

function loadThemes(): ColorTheme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ColorTheme[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveThemes(list: ColorTheme[]) {
  localStorage.setItem(THEMES_KEY, JSON.stringify(list))
}

function getActiveThemeId(): string | null {
  return localStorage.getItem(ACTIVE_THEME_KEY)
}

function setActiveThemeId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_THEME_KEY, id)
  else localStorage.removeItem(ACTIVE_THEME_KEY)
}

function isValidHex(v: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(v.trim())
}

/** Paleta expandida hasta N celdas (repite/varía si hace falta) */
function buildGridPalette(base: ColorDef[], n: number): ColorDef[] {
  if (base.length >= n) return base.slice(0, n).map((c) => ({ ...c }))
  const out: ColorDef[] = base.map((c) => ({ ...c }))
  let i = 0
  while (out.length < n) {
    const src = base[i % base.length]
    out.push({
      ...src,
      id: `${src.id}-x${out.length}` as ColorId,
      label: `${src.label} ${out.length + 1}`,
    })
    i += 1
  }
  return out
}

function gridColsFor(n: number) {
  if (n <= 9) return 3
  if (n <= 12) return 4
  if (n <= 20) return 5
  return 6 // 30
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Iluminados — más difícil:
 * Nivel 1 ya pide bastantes casillas; sube rápido y deja poco margen vacío.
 * No añade "colores nuevos": solo elige un subconjunto más grande y más revuelto.
 */
function iluminadosCount(level: number, grid: number) {
  // base agresiva: ~40% del grid en nv.1, sube ~12% del grid por nivel
  const base = Math.max(4, Math.ceil(grid * 0.38))
  const step = Math.max(1, Math.ceil(grid * 0.12))
  const n = base + (level - 1) * step
  // siempre deja al menos 1 celda vacía para poder fallar
  return Math.min(n, grid - 1)
}

/**
 * Orden de colores — más difícil:
 * Empieza en 5 números (no 4), sube +1 cada nivel, y el tiempo de muestra cae fuerte.
 */
function chimpNumbers(level: number, grid: number) {
  const n = 5 + (level - 1) // nv1=5, nv2=6...
  return Math.min(n, grid)
}

/** Tiempo de muestra iluminados (ms) — más corto conforme sube el nivel */
function iluminadosShowMs(level: number, soft: boolean) {
  // nv1 ~1100ms, baja ~55ms/nivel, piso 420ms
  const ms = Math.max(420, 1100 - (level - 1) * 55)
  return soft ? ms + 180 : ms
}

/** Tiempo de muestra orden de colores (ms) — muy breve en niveles altos */
function chimpShowMs(level: number, soft: boolean) {
  // nv1 ~900ms, baja ~70ms/nivel, piso 280ms (casi flash)
  const ms = Math.max(280, 900 - (level - 1) * 70)
  return soft ? ms + 200 : ms
}

/** Extra revoloteo: varias pasadas de shuffle con semilla distinta */
function deepPickIndices(count: number, grid: number, seed: number): number[] {
  let best = pickRandomIndices(count, grid, seed)
  // 3 revoluciones extra con sales distintas → patrones menos predecibles
  for (let pass = 1; pass <= 3; pass++) {
    best = pickRandomIndices(count, grid, seed + pass * 9973 + count * 131)
  }
  // no ordenar espacialmente: devolver en orden de shuffle puro
  const rng = mulberry32(seed ^ 0x9e3779b9)
  const arr = [...best]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickRandomIndices(count: number, grid: number, seed: number): number[] {
  const rng = mulberry32(seed)
  const pool = Array.from({ length: grid }, (_, i) => i)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count).sort((a, b) => a - b)
}

function Switch({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 0.9rem',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--gco-glass-border)',
      }}
    >
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <p style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</p>
        {desc && (
          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>{desc}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 24 : 3,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
          }}
        />
      </button>
    </div>
  )
}

export function ColorSequenceGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [menuMode, setMenuMode] = useState<GameMode>('climb')
  const [mode, setMode] = useState<GameMode | null>(null)
  const [phase, setPhase] = useState<Phase>('menu')
  const [level, setLevel] = useState(defaultLevel)
  const [colorCount, setColorCount] = useState<ColorCount>(9)
  const [gridSize, setGridSize] = useState<GridSize>(9)

  const [sequence, setSequence] = useState<ColorId[]>([])
  const [chainBase, setChainBase] = useState<ColorId[]>([])
  const [userInput, setUserInput] = useState<ColorId[]>([])
  const [activeColor, setActiveColor] = useState<ColorId | null>(null)

  /** Iluminados: índices que brillaron */
  const [litTargets, setLitTargets] = useState<number[]>([])
  const [pickedCells, setPickedCells] = useState<number[]>([])
  const [flashCells, setFlashCells] = useState<number[]>([])

  /** Chimp: mapa cellIndex → número (1..N) */
  const [chimpMap, setChimpMap] = useState<Record<number, number>>({})
  const [chimpOrder, setChimpOrder] = useState<number[]>([])
  const [chimpNext, setChimpNext] = useState(1)
  const [chimpVisible, setChimpVisible] = useState(true)
  const [chimpGone, setChimpGone] = useState<number[]>([])

  const [baseShowMs, setBaseShowMs] = useState(600)
  const [basePauseMs, setBasePauseMs] = useState(200)
  const [mistakeFlash, setMistakeFlash] = useState(false)
  const [softHighlight, setSoftHighlight] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)

  const [creativeLevels, setCreativeLevels] = useState<CreativeLevel[]>(loadCreativeLevels)
  const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null)
  const [creativeName, setCreativeName] = useState('')
  const [creativeSeq, setCreativeSeq] = useState<ColorId[]>([])
  const [creativeKind, setCreativeKind] = useState<CreativeKind>('sequence')
  const [creativeTargets, setCreativeTargets] = useState<number[]>([])
  const [creativeChimpCount, setCreativeChimpCount] = useState(5)

  const [themes, setThemes] = useState<ColorTheme[]>(loadThemes)
  const [activeThemeId, setActiveThemeIdState] = useState<string | null>(getActiveThemeId)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [themeName, setThemeName] = useState('')
  const [paintPalette, setPaintPalette] = useState<ColorDef[]>(() =>
    ALL_COLORS_LIST.map((c) => ({ ...c }))
  )
  const [paintIndex, setPaintIndex] = useState(0)

  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  const showTimeMs = Math.max(180, Math.round(baseShowMs / speed))
  const pauseMs = Math.max(60, Math.round(basePauseMs / speed))

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [phase, progress.highestLevel, progress.totalCompleted]
  )

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? null

  const isGridMode =
    mode === 'iluminados' || mode === 'chimp' ||
    (mode === 'creative' && (creativeKind === 'iluminados' || creativeKind === 'chimp'))

  const activeGrid = isGridMode ? gridSize : colorCount

  const palette: ColorDef[] = useMemo(() => {
    const source = activeTheme?.colors ?? ALL_COLORS_LIST
    return buildGridPalette(source, activeGrid)
  }, [activeTheme, activeGrid])

  const gridCols = gridColsFor(activeGrid)
  const gridMaxWidth =
    activeGrid <= 9 ? 280 : activeGrid <= 12 ? 340 : activeGrid <= 20 ? 400 : 460

  const clearRunTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearRunTimer(), [])

  const startRunTimer = () => {
    clearRunTimer()
    startedAtRef.current = performance.now()
    setElapsedMs(0)
    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current == null) return
      setElapsedMs(Math.round(performance.now() - startedAtRef.current))
    }, 200)
  }

  const stopRunTimer = (): number => {
    clearRunTimer()
    const t =
      startedAtRef.current != null
        ? Math.round(performance.now() - startedAtRef.current)
        : elapsedMs
    startedAtRef.current = null
    setElapsedMs(t)
    return t
  }

  const resetPlayState = () => {
    setUserInput([])
    setActiveColor(null)
    setMistakeFlash(false)
    setLastTimeMs(null)
    setBeatBest(false)
    setElapsedMs(0)
    startedAtRef.current = null
    setPickedCells([])
    setFlashCells([])
    setLitTargets([])
    setChimpMap({})
    setChimpOrder([])
    setChimpNext(1)
    setChimpVisible(true)
    setChimpGone([])
  }

  const beginShowingSequence = useCallback(
    (data: { sequence: ColorId[]; showTimeMs: number; pauseBetweenMs: number }) => {
      resetPlayState()
      setSequence(data.sequence)
      setBaseShowMs(data.showTimeMs)
      setBasePauseMs(data.pauseBetweenMs)
      setPhase('showing')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const beginIluminados = useCallback(
    (targets: number[], showMs: number) => {
      resetPlayState()
      setLitTargets(targets)
      setFlashCells(targets)
      setBaseShowMs(showMs)
      setPhase('showing')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const beginChimp = useCallback(
    (map: Record<number, number>, order: number[], showMs: number) => {
      resetPlayState()
      setChimpMap(map)
      setChimpOrder(order)
      setChimpNext(1)
      setChimpVisible(true)
      setChimpGone([])
      setBaseShowMs(showMs)
      setPhase('showing')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const startLevelAt = useCallback(
    (
      lv: number,
      m: GameMode,
      chain: ColorId[],
      seq: ColorId[],
      opts?: {
        targets?: number[]
        chimpCount?: number
        kind?: CreativeKind
        grid?: GridSize
      }
    ) => {
      soundStart()
      const soft = getProgressPrefs().softProgression
      const g = opts?.grid ?? gridSize

      if (m === 'iluminados') {
        const count = iluminadosCount(lv, g)
        const targets =
          opts?.targets && opts.targets.length > 0
            ? opts.targets
            : deepPickIndices(count, g, lv * 7919 + g * 17)
        beginIluminados(targets, iluminadosShowMs(lv, soft))
        return
      }

      if (m === 'chimp') {
        const n = opts?.chimpCount ?? chimpNumbers(lv, g)
        // índices bien revueltos; el orden numérico 1..N se asigna tras el shuffle
        const indices =
          opts?.targets && opts.targets.length >= n
            ? opts.targets.slice(0, n)
            : deepPickIndices(n, g, lv * 4999 + g * 31)
        const map: Record<number, number> = {}
        const order: number[] = []
        // Asignar números en orden del array ya revuelto (no por posición de rejilla)
        indices.forEach((cell, i) => {
          map[cell] = i + 1
          order.push(cell)
        })
        order.sort((a, b) => map[a] - map[b])
        beginChimp(map, order, chimpShowMs(lv, soft))
        return
      }

      if (m === 'progressive') {
        const data = generateColorSequenceLevel(lv, colorCount, {
          softProgression: soft,
          chainFrom: chain.length > 0 ? chain : undefined,
          chainGrowBy: 1,
        })
        beginShowingSequence(data)
        return
      }

      if (m === 'creative') {
        const kind = opts?.kind ?? creativeKind
        if (kind === 'iluminados') {
          const targets = opts?.targets ?? creativeTargets
          if (targets.length < 1) return
          beginIluminados(targets, soft ? 1200 : 1000)
          return
        }
        if (kind === 'chimp') {
          const n = opts?.chimpCount ?? creativeChimpCount
          const targets = opts?.targets ?? creativeTargets
          if (targets.length < n) return
          const map: Record<number, number> = {}
          const order: number[] = []
          targets.slice(0, n).forEach((cell, i) => {
            map[cell] = i + 1
            order.push(cell)
          })
          order.sort((a, b) => map[a] - map[b])
          beginChimp(map, order, soft ? 1400 : 1100)
          return
        }
        if (seq.length < 1) return
        const data = buildCustomColorLevel(seq, colorCount, {
          showTimeMs: soft ? 720 : 650,
          pauseBetweenMs: soft ? 240 : 220,
        })
        beginShowingSequence(data)
        return
      }

      // climb
      const data = generateColorSequenceLevel(lv, colorCount, {
        softProgression: soft,
      })
      beginShowingSequence(data)
    },
    [
      gridSize,
      colorCount,
      creativeKind,
      creativeTargets,
      creativeChimpCount,
      beginIluminados,
      beginChimp,
      beginShowingSequence,
    ]
  )

  const startLevel = useCallback(() => {
    if (!mode) return
    startLevelAt(level, mode, chainBase, creativeSeq)
  }, [mode, level, chainBase, creativeSeq, startLevelAt])

  /* ── Mostrar secuencia clásica ── */
  useEffect(() => {
    if (phase !== 'showing') return
    if (mode === 'iluminados' || mode === 'chimp') return
    if (mode === 'creative' && creativeKind !== 'sequence') return
    if (sequence.length === 0) return

    let cancelled = false
    let i = 0

    const playNext = () => {
      if (cancelled) return
      if (i >= sequence.length) {
        setActiveColor(null)
        setPhase('input')
        startRunTimer()
        return
      }
      setActiveColor(sequence[i])
      soundColor(i)
      window.setTimeout(() => {
        if (cancelled) return
        setActiveColor(null)
        i += 1
        window.setTimeout(playNext, pauseMs)
      }, showTimeMs)
    }

    const startDelay = window.setTimeout(playNext, 400)
    return () => {
      cancelled = true
      window.clearTimeout(startDelay)
    }
  }, [phase, sequence, showTimeMs, pauseMs, mode, creativeKind])

  /* ── Iluminados: flash simultáneo ── */
  useEffect(() => {
    if (phase !== 'showing') return
    const isIlum =
      mode === 'iluminados' || (mode === 'creative' && creativeKind === 'iluminados')
    if (!isIlum || litTargets.length === 0) return

    setFlashCells(litTargets)
    soundColor(0)

    const t = window.setTimeout(() => {
      setFlashCells([])
      setPhase('input')
      startRunTimer()
    }, Math.max(320, Math.round(baseShowMs / speed)))

    return () => window.clearTimeout(t)
  }, [phase, mode, creativeKind, litTargets, baseShowMs, speed])

  /* ── Chimp: mostrar números y luego ocultar ── */
  useEffect(() => {
    if (phase !== 'showing') return
    const isCh =
      mode === 'chimp' || (mode === 'creative' && creativeKind === 'chimp')
    if (!isCh || chimpOrder.length === 0) return

    setChimpVisible(true)
    soundColor(0)

    const t = window.setTimeout(() => {
      setChimpVisible(false)
      setPhase('input')
      startRunTimer()
    }, Math.max(240, Math.round(baseShowMs / speed)))

    return () => window.clearTimeout(t)
  }, [phase, mode, creativeKind, chimpOrder, baseShowMs, speed])

  const finishSuccess = (timeMs: number) => {
    const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, level)
    const isNewBest = timeMs > 0 && (prevBest == null || timeMs < prevBest)

    if (mode === 'climb' || mode === 'progressive' || mode === 'iluminados' || mode === 'chimp') {
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: GAME_ID,
        level,
        success: true,
        timeMs,
      })
    }
    if (mode === 'progressive') setChainBase(sequence)

    setLastTimeMs(timeMs)
    setBeatBest(!!isNewBest)
    soundSuccess()
    setPhase('success')
  }

  const finishFail = (timeMs: number) => {
    if (mode === 'climb' || mode === 'progressive' || mode === 'iluminados' || mode === 'chimp') {
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: GAME_ID,
        level,
        success: false,
        timeMs,
      })
    }
    setLastTimeMs(timeMs)
    setBeatBest(false)
    soundFail()
    setMistakeFlash(true)
    setPhase('fail')
  }

  /* Clic en color (secuencia clásica) */
  const handleColorClick = (colorId: ColorId) => {
    if (phase !== 'input') return
    const isClassic =
      mode === 'climb' ||
      mode === 'progressive' ||
      (mode === 'creative' && creativeKind === 'sequence')
    if (!isClassic) return

    const nextInput = [...userInput, colorId]
    setUserInput(nextInput)
    setActiveColor(colorId)
    soundColor(nextInput.length - 1)
    window.setTimeout(() => setActiveColor(null), 180)

    if (colorId !== sequence[nextInput.length - 1]) {
      finishFail(stopRunTimer())
      return
    }
    if (nextInput.length === sequence.length) finishSuccess(stopRunTimer())
    else soundMatch()
  }

  /* Clic en celda (iluminados / chimp) */
  const handleCellClick = (cellIndex: number) => {
    if (phase !== 'input') return

    const isIlum =
      mode === 'iluminados' || (mode === 'creative' && creativeKind === 'iluminados')
    const isCh =
      mode === 'chimp' || (mode === 'creative' && creativeKind === 'chimp')

    if (isIlum) {
      if (pickedCells.includes(cellIndex)) return
      if (!litTargets.includes(cellIndex)) {
        finishFail(stopRunTimer())
        return
      }
      const next = [...pickedCells, cellIndex]
      setPickedCells(next)
      soundMatch()
      if (next.length === litTargets.length) finishSuccess(stopRunTimer())
      return
    }

    if (isCh) {
      if (chimpGone.includes(cellIndex)) return
      const num = chimpMap[cellIndex]
      if (num == null) {
        // celda sin número: no debería ser clicable
        return
      }
      if (num !== chimpNext) {
        finishFail(stopRunTimer())
        return
      }
      // Correcto: desaparece esta casilla
      const gone = [...chimpGone, cellIndex]
      setChimpGone(gone)
      soundMatch()
      const nextNum = chimpNext + 1
      if (nextNum > chimpOrder.length) {
        finishSuccess(stopRunTimer())
      } else {
        setChimpNext(nextNum)
      }
    }
  }

  const goNextLevel = () => {
    soundClick()
    if (mode === 'creative') {
      setPhase('creative-hub')
      return
    }
    if (!mode) return
    const next = level + 1
    const nextChain = mode === 'progressive' ? sequence : chainBase
    setLevel(next)
    if (mode === 'progressive') setChainBase(nextChain)
    startLevelAt(next, mode, nextChain, creativeSeq)
  }

  const retry = () => {
    soundClick()
    setMistakeFlash(false)
    if (!mode) return
    startLevelAt(level, mode, chainBase, creativeSeq)
  }

  const beginFromMenu = () => {
    soundClick()
    const m = menuMode
    setMode(m)
    if (m === 'progressive') {
      setChainBase([])
      setLevel(1)
      setPhase('ready')
      return
    }
    if (m === 'climb') {
      setLevel(Math.max(1, progress.highestLevel + 1))
      setColorCount(9)
      setPhase('ready')
      return
    }
    if (m === 'iluminados' || m === 'chimp') {
      setLevel(1)
      setGridSize(9)
      setPhase('ready')
      return
    }
    if (m === 'creative') {
      setPhase('creative-hub')
      return
    }
    setPhase('paint-hub')
  }

  const backToMenu = () => {
    soundClick()
    clearRunTimer()
    setMode(null)
    setPhase('menu')
    setChainBase([])
    setShowLevelPicker(false)
  }

  const slowerThanBest =
    bestForLevel != null && lastTimeMs != null && lastTimeMs > bestForLevel * 1.15

  const kindLabel = (k: CreativeKind) =>
    k === 'sequence' ? 'Secuencia' : k === 'iluminados' ? 'Iluminados' : 'Orden de colores'

  /* ─── MENÚ ─────────────────────────────────────────────────────────────── */
  if (phase === 'menu' || mode === null) {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              navigate('/categoria/memoria')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginBottom: '1rem' }}
          >
            ← Volver
          </button>
        </header>

        <GlassCard>
          <div style={{ padding: '1.35rem 1.2rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
              Secuencia de colores
            </h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                fontSize: '0.88rem',
                marginBottom: '1.15rem',
              }}
            >
              Observa, memoriza y responde según el modo.
            </p>

            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.55rem' }}>
              Modo de juego
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {MODE_ORDER.map((m) => {
                const info = MODE_INFO[m]
                const selected = menuMode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      soundClick()
                      setMenuMode(m)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '0.85rem 1rem',
                      borderRadius: 14,
                      border: selected
                        ? '2px solid var(--gco-primary)'
                        : '1px solid var(--gco-glass-border)',
                      background: selected
                        ? 'rgba(34, 230, 197, 0.12)'
                        : 'rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.15rem' }}>{info.emoji}</span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{info.title}</p>
                        <p
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--gco-ink-muted)',
                            marginTop: 2,
                            lineHeight: 1.35,
                          }}
                        >
                          {info.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: '1.15rem' }}>
              <GlassButton onClick={beginFromMenu} style={{ width: '100%' }}>
                Continuar
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ─── CREATIVO: lista ──────────────────────────────────────────────────── */
  if (phase === 'creative-hub') {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="glass-button secondary"
            onClick={backToMenu}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Modos
          </button>
          <span style={{ fontSize: '0.95rem' }}>Creativo</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <GlassButton
              onClick={() => {
                soundClick()
                setEditingCreativeId(null)
                setCreativeName(`Nivel ${creativeLevels.length + 1}`)
                setCreativeSeq([])
                setCreativeTargets([])
                setCreativeChimpCount(5)
                setCreativeKind('sequence')
                setColorCount(9)
                setGridSize(9)
                setPhase('creative-edit')
              }}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              + Nuevo nivel
            </GlassButton>

            {creativeLevels.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
                Aún no hay niveles guardados.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {creativeLevels.map((lv) => (
                <div
                  key={lv.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 14,
                    border: '1px solid var(--gco-glass-border)',
                    background: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <p style={{ fontWeight: 600 }}>{lv.name}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                    {kindLabel(lv.kind)} ·{' '}
                    {lv.kind === 'sequence'
                      ? `${lv.sequence.length} pasos · ${lv.colorCount} colores`
                      : lv.kind === 'iluminados'
                        ? `${lv.targets.length} iluminadas · rejilla ${lv.colorCount}`
                        : `${lv.chimpCount} números · rejilla ${lv.colorCount}`}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.4rem',
                      marginTop: '0.55rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="glass-button"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => {
                        soundClick()
                        setCreativeKind(lv.kind)
                        setCreativeSeq(lv.sequence)
                        setCreativeTargets(lv.targets)
                        setCreativeChimpCount(lv.chimpCount)
                        const g = ([9, 12, 20, 30].includes(lv.colorCount)
                          ? lv.colorCount
                          : 9) as GridSize
                        setGridSize(g)
                        setColorCount(
                          ([4, 6, 9, 12].includes(lv.colorCount)
                            ? lv.colorCount
                            : 9) as ColorCount
                        )
                        setMode('creative')
                        startLevelAt(1, 'creative', [], lv.sequence, {
                          kind: lv.kind,
                          targets: lv.targets,
                          chimpCount: lv.chimpCount,
                          grid: g,
                        })
                      }}
                    >
                      Jugar
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => {
                        soundClick()
                        setEditingCreativeId(lv.id)
                        setCreativeName(lv.name)
                        setCreativeSeq([...lv.sequence])
                        setCreativeTargets([...(lv.targets ?? [])])
                        setCreativeChimpCount(lv.chimpCount ?? 5)
                        setCreativeKind(lv.kind ?? 'sequence')
                        const g = ([9, 12, 20, 30].includes(lv.colorCount)
                          ? lv.colorCount
                          : 9) as GridSize
                        setGridSize(g)
                        setColorCount(
                          ([4, 6, 9, 12].includes(lv.colorCount)
                            ? lv.colorCount
                            : 9) as ColorCount
                        )
                        setPhase('creative-edit')
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => {
                        soundClick()
                        const next = creativeLevels.filter((x) => x.id !== lv.id)
                        setCreativeLevels(next)
                        saveCreativeLevels(next)
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ─── CREATIVO: editor ─────────────────────────────────────────────────── */
  if (phase === 'creative-edit') {
    const editGrid = creativeKind === 'sequence' ? colorCount : gridSize
    const editPalette = buildGridPalette(
      activeTheme?.colors ?? ALL_COLORS_LIST,
      editGrid
    )
    const cols = gridColsFor(editGrid)

    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setPhase('creative-hub')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Lista
          </button>
          <span style={{ fontSize: '0.95rem' }}>
            {editingCreativeId ? 'Editar' : 'Nuevo'}
          </span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem', textAlign: 'center' }}>
            <label
              style={{
                display: 'block',
                textAlign: 'left',
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Nombre del nivel
            </label>
            <input
              className="glass-input"
              value={creativeName}
              onChange={(e) => setCreativeName(e.target.value)}
              placeholder="Mi nivel"
              style={{ marginBottom: '0.85rem' }}
            />

            <p
              style={{
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.88rem',
                marginBottom: 6,
              }}
            >
              Tipo de nivel
            </p>
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginBottom: '0.85rem',
                justifyContent: 'center',
              }}
            >
              {(
                [
                  { id: 'sequence' as const, label: 'Secuencia' },
                  { id: 'iluminados' as const, label: 'Iluminados' },
                  { id: 'chimp' as const, label: 'Orden de colores' },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`glass-button ${creativeKind === k.id ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => {
                    soundClick()
                    setCreativeKind(k.id)
                    if (k.id !== 'sequence') {
                      setGridSize((g) => (g < 9 ? 9 : g))
                    }
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {creativeKind === 'sequence' ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    justifyContent: 'center',
                    minHeight: 44,
                    marginBottom: '0.85rem',
                  }}
                >
                  {creativeSeq.length === 0 && (
                    <span style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem' }}>
                      Secuencia vacía — toca colores abajo
                    </span>
                  )}
                  {creativeSeq.map((id, i) => {
                    const c = editPalette.find((p) => p.id === id)
                    return (
                      <button
                        key={`${id}-${i}`}
                        type="button"
                        onClick={() => {
                          soundClick()
                          setCreativeSeq((s) => s.filter((_, j) => j !== i))
                        }}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          border: '2px solid rgba(255,255,255,0.2)',
                          background: c?.hex ?? '#666',
                          padding: 0,
                        }}
                      />
                    )
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  {SEQ_COLOR_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`glass-button ${colorCount === n ? '' : 'secondary'}`}
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        soundClick()
                        setColorCount(n)
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: 8,
                    maxWidth: gridMaxWidth,
                    margin: '0 auto 1rem',
                  }}
                >
                  {editPalette.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        soundClick()
                        setCreativeSeq((s) => [...s, c.id])
                      }}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 12,
                        border: '2px solid transparent',
                        background: c.hex,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  {GRID_SIZE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`glass-button ${gridSize === n ? '' : 'secondary'}`}
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        soundClick()
                        setGridSize(n)
                        setCreativeTargets((t) => t.filter((i) => i < n))
                        if (creativeKind === 'chimp') {
                          setCreativeChimpCount((c) => Math.min(c, n))
                        }
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {creativeKind === 'chimp' && (
                  <p
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--gco-ink-muted)',
                      marginBottom: 8,
                    }}
                  >
                    Toca casillas en el orden 1→N. Cantidad:{' '}
                    <strong>{creativeChimpCount}</strong>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{
                        marginLeft: 8,
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                      }}
                      onClick={() => {
                        soundClick()
                        setCreativeChimpCount((c) => Math.min(gridSize, c + 1))
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{
                        marginLeft: 4,
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                      }}
                      onClick={() => {
                        soundClick()
                        setCreativeChimpCount((c) => Math.max(3, c - 1))
                      }}
                    >
                      −
                    </button>
                  </p>
                )}

                {creativeKind === 'iluminados' && (
                  <p
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--gco-ink-muted)',
                      marginBottom: 8,
                    }}
                  >
                    Toca para marcar/desmarcar casillas iluminadas (
                    {creativeTargets.length})
                  </p>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: 8,
                    maxWidth: gridMaxWidth,
                    margin: '0 auto 1rem',
                  }}
                >
                  {editPalette.map((c, idx) => {
                    const on = creativeTargets.includes(idx)
                    const chimpNum =
                      creativeKind === 'chimp'
                        ? creativeTargets.indexOf(idx) + 1
                        : 0
                    const showNum =
                      creativeKind === 'chimp' &&
                      chimpNum > 0 &&
                      chimpNum <= creativeChimpCount
                    return (
                      <button
                        key={c.id + idx}
                        type="button"
                        onClick={() => {
                          soundClick()
                          if (creativeKind === 'iluminados') {
                            setCreativeTargets((t) =>
                              t.includes(idx) ? t.filter((x) => x !== idx) : [...t, idx]
                            )
                          } else {
                            // chimp: añadir al final o quitar
                            setCreativeTargets((t) => {
                              if (t.includes(idx)) return t.filter((x) => x !== idx)
                              if (t.length >= creativeChimpCount) return t
                              return [...t, idx]
                            })
                          }
                        }}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 12,
                          border: on
                            ? '3px solid rgba(255,255,255,0.95)'
                            : '2px solid transparent',
                          background: c.hex,
                          padding: 0,
                          cursor: 'pointer',
                          boxShadow: on ? `0 0 14px ${c.hex}` : 'none',
                          position: 'relative',
                          fontWeight: 800,
                          fontSize: '1.1rem',
                          color: '#fff',
                          textShadow: '0 1px 3px rgba(0,0,0,0.65)',
                        }}
                      >
                        {showNum ? chimpNum : ''}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <GlassButton
              style={{ width: '100%' }}
              onClick={() => {
                if (!creativeName.trim()) return
                if (creativeKind === 'sequence' && creativeSeq.length < 1) return
                if (creativeKind === 'iluminados' && creativeTargets.length < 1) return
                if (
                  creativeKind === 'chimp' &&
                  creativeTargets.length < creativeChimpCount
                )
                  return
                soundSuccess()
                const entry: CreativeLevel = {
                  id: editingCreativeId ?? uid(),
                  name: creativeName.trim(),
                  kind: creativeKind,
                  sequence: creativeKind === 'sequence' ? creativeSeq : [],
                  targets:
                    creativeKind === 'sequence'
                      ? []
                      : creativeTargets.slice(
                          0,
                          creativeKind === 'chimp' ? creativeChimpCount : undefined
                        ),
                  chimpCount: creativeChimpCount,
                  colorCount:
                    creativeKind === 'sequence' ? colorCount : gridSize,
                  updatedAt: new Date().toISOString(),
                }
                const next = editingCreativeId
                  ? creativeLevels.map((x) =>
                      x.id === editingCreativeId ? entry : x
                    )
                  : [entry, ...creativeLevels]
                setCreativeLevels(next)
                saveCreativeLevels(next)
                setPhase('creative-hub')
              }}
            >
              Guardar nivel
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ─── TEMAS hub ────────────────────────────────────────────────────────── */
  if (phase === 'paint-hub') {
    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={backToMenu}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Modos
          </button>
          <span style={{ fontSize: '0.95rem' }}>Temas</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <div
              style={{
                padding: '0.75rem 0.9rem',
                borderRadius: 14,
                border: !activeThemeId
                  ? '2px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
                marginBottom: '0.55rem',
                background: !activeThemeId
                  ? 'rgba(34,230,197,0.1)'
                  : 'rgba(255,255,255,0.04)',
              }}
            >
              <p style={{ fontWeight: 600 }}>Tema original</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                Colores por defecto de la app
              </p>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="glass-button"
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                  onClick={() => {
                    soundToggle(true)
                    setActiveThemeId(null)
                    setActiveThemeIdState(null)
                  }}
                >
                  {!activeThemeId ? 'Activo' : 'Usar'}
                </button>
              </div>
            </div>

            {themes.map((th) => (
              <div
                key={th.id}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: 14,
                  border:
                    activeThemeId === th.id
                      ? '2px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  marginBottom: '0.55rem',
                  background:
                    activeThemeId === th.id
                      ? 'rgba(34,230,197,0.1)'
                      : 'rgba(255,255,255,0.04)',
                }}
              >
                <p style={{ fontWeight: 600 }}>{th.name}</p>
                <div style={{ display: 'flex', gap: 4, margin: '0.4rem 0' }}>
                  {th.colors.slice(0, 8).map((c) => (
                    <span
                      key={c.id}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        background: c.hex,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="glass-button"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    onClick={() => {
                      soundToggle(true)
                      setActiveThemeId(th.id)
                      setActiveThemeIdState(th.id)
                    }}
                  >
                    {activeThemeId === th.id ? 'Activo' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    onClick={() => {
                      soundClick()
                      setEditingThemeId(th.id)
                      setThemeName(th.name)
                      setPaintPalette(th.colors.map((c) => ({ ...c })))
                      setPaintIndex(0)
                      setPhase('paint-edit')
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    onClick={() => {
                      soundClick()
                      const next = themes.filter((x) => x.id !== th.id)
                      setThemes(next)
                      saveThemes(next)
                      if (activeThemeId === th.id) {
                        setActiveThemeId(null)
                        setActiveThemeIdState(null)
                      }
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}

            <GlassButton
              style={{ width: '100%', marginTop: '0.75rem' }}
              onClick={() => {
                soundClick()
                setEditingThemeId(null)
                setThemeName(`Tema ${themes.length + 1}`)
                setPaintPalette(ALL_COLORS_LIST.map((c) => ({ ...c })))
                setPaintIndex(0)
                setPhase('paint-edit')
              }}
            >
              + Nuevo tema
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ─── TEMAS: editor ────────────────────────────────────────────────────── */
  if (phase === 'paint-edit') {
    const current = paintPalette[paintIndex] ?? paintPalette[0]
    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setPhase('paint-hub')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Temas
          </button>
          <span style={{ fontSize: '0.95rem' }}>Editar tema</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 6 }}>
              Nombre
            </label>
            <input
              className="glass-input"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                marginBottom: '1rem',
              }}
            >
              {paintPalette.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    soundClick()
                    setPaintIndex(i)
                  }}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 12,
                    border:
                      paintIndex === i
                        ? '3px solid #fff'
                        : '2px solid transparent',
                    background: c.hex,
                    boxShadow: paintIndex === i ? `0 0 14px ${c.hex}` : 'none',
                  }}
                />
              ))}
            </div>

            {current && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: '1rem',
                }}
              >
                <input
                  type="color"
                  value={isValidHex(current.hex) ? current.hex : '#888888'}
                  onChange={(e) => {
                    const hex = e.target.value
                    setPaintPalette((list) =>
                      list.map((c, i) => (i === paintIndex ? { ...c, hex } : c))
                    )
                  }}
                  style={{
                    width: 48,
                    height: 40,
                    border: 'none',
                    background: 'transparent',
                  }}
                />
                <input
                  className="glass-input mono"
                  value={current.hex}
                  onChange={(e) => {
                    const hex = e.target.value
                    setPaintPalette((list) =>
                      list.map((c, i) => (i === paintIndex ? { ...c, hex } : c))
                    )
                  }}
                  style={{ maxWidth: 140 }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
                  {current.label}
                </span>
              </div>
            )}

            <GlassButton
              style={{ width: '100%' }}
              onClick={() => {
                if (!themeName.trim()) return
                soundSuccess()
                const entry: ColorTheme = {
                  id: editingThemeId ?? uid(),
                  name: themeName.trim(),
                  colors: paintPalette.map((c) => ({
                    ...c,
                    hex: isValidHex(c.hex) ? c.hex : c.hex,
                  })),
                  updatedAt: new Date().toISOString(),
                }
                const next = editingThemeId
                  ? themes.map((t) => (t.id === editingThemeId ? entry : t))
                  : [entry, ...themes]
                setThemes(next)
                saveThemes(next)
                setPhase('paint-hub')
              }}
            >
              Guardar tema
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ─── JUEGO ────────────────────────────────────────────────────────────── */
  const playingIlum =
    mode === 'iluminados' || (mode === 'creative' && creativeKind === 'iluminados')
  const playingChimp =
    mode === 'chimp' || (mode === 'creative' && creativeKind === 'chimp')
  const playingClassic = !playingIlum && !playingChimp

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={backToMenu}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Modos
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          {(mode === 'climb' ||
            mode === 'progressive' ||
            mode === 'iluminados' ||
            mode === 'chimp') && (
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setShowLevelPicker((v) => !v)
              }}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            >
              {mode === 'progressive' ? `Cadena · Nv. ${level}` : `Nivel ${level}`} ▾
            </button>
          )}
          <div
            className="mono"
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              display: 'flex',
              gap: '0.65rem',
            }}
          >
            {(phase === 'input' || phase === 'showing') && (
              <span style={{ color: 'var(--gco-ink)' }}>
                ⏱ {formatDuration(elapsedMs)}
              </span>
            )}
            {bestForLevel != null &&
              bestForLevel > 0 &&
              (mode === 'climb' || mode === 'iluminados' || mode === 'chimp') && (
                <span>🏆 {formatDuration(bestForLevel)}</span>
              )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker &&
          (mode === 'climb' || mode === 'iluminados' || mode === 'chimp') &&
          phase === 'ready' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-card"
              style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className={`glass-button ${level === defaultLevel ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                  onClick={() => {
                    soundClick()
                    setLevel(defaultLevel)
                    setShowLevelPicker(false)
                  }}
                >
                  Nv. {defaultLevel}
                </button>
                {unlocked.map((u) => (
                  <button
                    key={u.level}
                    type="button"
                    className={`glass-button ${level === u.level ? '' : 'secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                    onClick={() => {
                      soundClick()
                      setLevel(u.level)
                      setShowLevelPicker(false)
                    }}
                  >
                    Nv. {u.level}
                    <span
                      className="mono"
                      style={{ display: 'block', fontSize: '0.65rem' }}
                    >
                      {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      <GlassCard>
        <div style={{ padding: '1.25rem 1.1rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 4 }}>
            {MODE_INFO[mode].emoji} {MODE_INFO[mode].title}
          </h2>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {mode === 'progressive'
              ? chainBase.length
                ? `Cadena: ${chainBase.length} → +1`
                : 'Primera base de la cadena'
              : mode === 'iluminados'
                ? 'Memoriza las casillas iluminadas (cualquier orden).'
                : mode === 'chimp'
                  ? 'Pulsa en orden numérico 1 → N. El resto desaparece.'
                  : 'Observa y repite en tu turno.'}
          </p>

          {phase === 'ready' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {(mode === 'iluminados' || mode === 'chimp'
                  ? GRID_SIZE_OPTIONS
                  : SEQ_COLOR_OPTIONS
                ).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`glass-button ${
                      (mode === 'iluminados' || mode === 'chimp'
                        ? gridSize
                        : colorCount) === n
                        ? ''
                        : 'secondary'
                    }`}
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                    onClick={() => {
                      soundClick()
                      if (mode === 'iluminados' || mode === 'chimp') {
                        setGridSize(n as GridSize)
                      } else {
                        setColorCount(n as ColorCount)
                      }
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {playingClassic && (
                <Switch
                  checked={softHighlight}
                  onChange={(v) => {
                    soundToggle(v)
                    setSoftHighlight(v)
                  }}
                  label="Resalte suave"
                  desc="Menos brillo al marcar el color"
                />
              )}

              <div
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: 14,
                  border: '1px solid var(--gco-glass-border)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    Velocidad
                  </span>
                  <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                    {speed.toFixed(1)}×
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '1rem',
                      minWidth: 44,
                    }}
                    onClick={() => {
                      soundClick()
                      setSpeed((s) => Math.max(0.6, Math.round((s - 0.1) * 10) / 10))
                    }}
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={0.6}
                    max={1.5}
                    step={0.1}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--gco-primary)' }}
                  />
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '1rem',
                      minWidth: 44,
                    }}
                    onClick={() => {
                      soundClick()
                      setSpeed((s) => Math.min(1.5, Math.round((s + 0.1) * 10) / 10))
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {(phase === 'ready' ||
            phase === 'showing' ||
            phase === 'input' ||
            phase === 'success' ||
            phase === 'fail') && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gap: '0.55rem',
                maxWidth: gridMaxWidth,
                margin: '0 auto 1.15rem',
              }}
            >
              {palette.map((c, idx) => {
                if (playingClassic) {
                  const isActive = activeColor === c.id
                  const dimmed =
                    !softHighlight &&
                    phase === 'showing' &&
                    activeColor !== null &&
                    !isActive
                  return (
                    <motion.button
                      key={c.id}
                      type="button"
                      aria-label={c.label}
                      onClick={() => handleColorClick(c.id)}
                      disabled={phase !== 'input'}
                      whileTap={phase === 'input' ? { scale: 0.9 } : undefined}
                      animate={{
                        scale: isActive ? (softHighlight ? 1.03 : 1.06) : 1,
                        opacity: dimmed ? 0.32 : 1,
                      }}
                      transition={{ duration: 0.12 }}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 16,
                        border: isActive
                          ? softHighlight
                            ? '2px solid rgba(255,255,255,0.5)'
                            : '3px solid rgba(255,255,255,0.95)'
                          : '2px solid transparent',
                        background: c.hex,
                        boxShadow: isActive
                          ? softHighlight
                            ? `0 0 12px ${c.hex}55`
                            : `0 0 28px ${c.hex}`
                          : '0 2px 8px rgba(0,0,0,0.2)',
                        cursor: phase === 'input' ? 'pointer' : 'default',
                        padding: 0,
                      }}
                    />
                  )
                }

                // Grid modes: iluminados / chimp
                const isFlashing = flashCells.includes(idx)
                const isPicked = pickedCells.includes(idx)
                const chimpNum = chimpMap[idx]
                const isGone = chimpGone.includes(idx)
                const isChimpCell = chimpNum != null

                if (playingChimp && phase === 'input' && !isChimpCell) {
                  // celdas sin número desaparecen tras mostrar
                  return (
                    <div
                      key={c.id + idx}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 16,
                        background: 'transparent',
                      }}
                    />
                  )
                }

                if (playingChimp && isGone) {
                  return (
                    <div
                      key={c.id + idx}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 16,
                        background: 'transparent',
                      }}
                    />
                  )
                }

                const showNumber =
                  playingChimp &&
                  isChimpCell &&
                  (chimpVisible || phase === 'showing')

                return (
                  <motion.button
                    key={c.id + idx}
                    type="button"
                    onClick={() => handleCellClick(idx)}
                    disabled={phase !== 'input'}
                    whileTap={phase === 'input' ? { scale: 0.92 } : undefined}
                    animate={{
                      scale: isFlashing || isPicked ? 1.05 : 1,
                      opacity: 1,
                    }}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 16,
                      border:
                        isFlashing || isPicked
                          ? '3px solid rgba(255,255,255,0.95)'
                          : '2px solid transparent',
                      background: c.hex,
                      boxShadow:
                        isFlashing || isPicked
                          ? `0 0 22px ${c.hex}`
                          : '0 2px 8px rgba(0,0,0,0.2)',
                      cursor: phase === 'input' ? 'pointer' : 'default',
                      padding: 0,
                      fontWeight: 800,
                      fontSize: 'clamp(1.1rem, 4vw, 1.45rem)',
                      color: '#fff',
                      textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    {showNumber ? chimpNum : ''}
                  </motion.button>
                )
              })}
            </div>
          )}

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <GlassButton onClick={startLevel}>
                  Comenzar nivel {level}
                </GlassButton>
              </motion.div>
            )}

            {phase === 'showing' && (
              <motion.div
                key="showing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p style={{ color: 'var(--gco-primary)', fontWeight: 600 }}>
                  {playingIlum
                    ? 'Memoriza las iluminadas…'
                    : playingChimp
                      ? 'Memoriza los números…'
                      : 'Observa…'}
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.8rem',
                    marginTop: 4,
                  }}
                >
                  {playingIlum
                    ? `${litTargets.length} casillas`
                    : playingChimp
                      ? `${chimpOrder.length} números`
                      : `${sequence.length} pasos`}{' '}
                  · {speed.toFixed(1)}×
                </p>
              </motion.div>
            )}

            {phase === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p style={{ color: 'var(--gco-ink-muted)' }}>
                  {playingIlum ? (
                    <>
                      Tu turno ·{' '}
                      <span className="mono">
                        {pickedCells.length}/{litTargets.length}
                      </span>
                    </>
                  ) : playingChimp ? (
                    <>
                      Pulsa el{' '}
                      <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                        {chimpNext}
                      </span>
                    </>
                  ) : (
                    <>
                      Tu turno ·{' '}
                      <span className="mono">
                        {userInput.length}/{sequence.length}
                      </span>
                    </>
                  )}
                  {' · '}
                  <span className="mono">{formatDuration(elapsedMs)}</span>
                </p>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <p
                  style={{
                    color: 'var(--gco-primary)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                  }}
                >
                  ¡Correcto!
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.85rem',
                    margin: '0.35rem 0 0.75rem',
                  }}
                >
                  {lastTimeMs != null ? formatDuration(lastTimeMs) : '—'}
                  {beatBest ? ' · ¡Nueva marca!' : ''}
                </p>
                {slowerThanBest && bestForLevel != null && (
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--gco-secondary)',
                      marginBottom: 12,
                    }}
                  >
                    Más lento que tu marca ({formatDuration(bestForLevel)})
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={goNextLevel}>
                    {mode === 'creative' ? 'Volver a mis niveles' : 'Siguiente nivel'}
                  </GlassButton>
                  <button
                    type="button"
                    className="glass-button secondary"
                    onClick={retry}
                  >
                    Reintentar
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'fail' && (
              <motion.div
                key="fail"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <p style={{ color: 'var(--gco-secondary)', fontWeight: 700 }}>
                  Fallaste
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.85rem',
                    margin: '0.35rem 0 1rem',
                  }}
                >
                  {mistakeFlash
                    ? playingIlum
                      ? `Acertaste ${pickedCells.length} de ${litTargets.length}.`
                      : playingChimp
                        ? `Llegaste al ${Math.max(1, chimpNext - 1)}.`
                        : `Acertaste ${Math.max(0, userInput.length - 1)} de ${sequence.length}.`
                    : 'Inténtalo de nuevo.'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={retry}>Reintentar</GlassButton>
                  {mode === 'progressive' && (
                    <button
                      type="button"
                      className="glass-button secondary"
                      onClick={() => {
                        soundClick()
                        setChainBase([])
                        setLevel(1)
                        setPhase('ready')
                      }}
                    >
                      Reiniciar cadena
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}
