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

type GameMode = 'climb' | 'progressive' | 'creative' | 'paint'
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

type CreativeLevel = {
  id: string
  name: string
  sequence: ColorId[]
  colorCount: ColorCount
  updatedAt: string
}

type ColorTheme = {
  id: string
  name: string
  colors: ColorDef[]
  updatedAt: string
}

const COLOR_OPTIONS: ColorCount[] = [4, 6, 9, 12]
const GAME_CAT = 'memoria' as const
const GAME_ID = 'secuencia-colores'
const CREATIVE_KEY = 'gco:color-seq-creative-levels'
const THEMES_KEY = 'gco:color-seq-themes'
const ACTIVE_THEME_KEY = 'gco:color-seq-active-theme'

const MODE_INFO: Record<
  GameMode,
  { title: string; emoji: string; desc: string }
> = {
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
  creative: {
    title: 'Modo creativo',
    emoji: '✨',
    desc: 'Crea, nombra y guarda tus propias secuencias.',
  },
  paint: {
    title: 'Colorear',
    emoji: '🎨',
    desc: 'Temas de colores con nombre; solo uno activo a la vez.',
  },
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadCreativeLevels(): CreativeLevel[] {
  try {
    const raw = localStorage.getItem(CREATIVE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as CreativeLevel[]
    return Array.isArray(list) ? list : []
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
          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
            {desc}
          </p>
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

  const [sequence, setSequence] = useState<ColorId[]>([])
  const [chainBase, setChainBase] = useState<ColorId[]>([])
  const [userInput, setUserInput] = useState<ColorId[]>([])
  const [activeColor, setActiveColor] = useState<ColorId | null>(null)
  const [baseShowMs, setBaseShowMs] = useState(600)
  const [basePauseMs, setBasePauseMs] = useState(200)
  const [mistakeFlash, setMistakeFlash] = useState(false)
  const [softHighlight, setSoftHighlight] = useState(false)
  /** 0.7 más lento … 1.4 más rápido */
  const [speed, setSpeed] = useState(1)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)

  const [creativeLevels, setCreativeLevels] = useState<CreativeLevel[]>(loadCreativeLevels)
  const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null)
  const [creativeName, setCreativeName] = useState('')
  const [creativeSeq, setCreativeSeq] = useState<ColorId[]>([])

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

  const palette: ColorDef[] = useMemo(() => {
    const source = activeTheme?.colors ?? ALL_COLORS_LIST
    return source.slice(0, colorCount).map((c) => ({ ...c }))
  }, [activeTheme, colorCount])

  const gridCols = colorCount <= 6 ? 2 : colorCount <= 9 ? 3 : 4
  const gridMaxWidth = colorCount <= 6 ? 220 : colorCount <= 9 ? 300 : 360

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

  const beginShowing = useCallback(
    (data: { sequence: ColorId[]; showTimeMs: number; pauseBetweenMs: number }) => {
      setSequence(data.sequence)
      setBaseShowMs(data.showTimeMs)
      setBasePauseMs(data.pauseBetweenMs)
      setUserInput([])
      setActiveColor(null)
      setMistakeFlash(false)
      setLastTimeMs(null)
      setBeatBest(false)
      setElapsedMs(0)
      startedAtRef.current = null
      setPhase('showing')
    },
    []
  )

  const startLevelAt = useCallback(
    (lv: number, m: GameMode, chain: ColorId[], seq: ColorId[]) => {
      soundStart()
      const soft = getProgressPrefs().softProgression

      if (m === 'progressive') {
        const data = generateColorSequenceLevel(lv, colorCount, {
          softProgression: soft,
          chainFrom: chain.length > 0 ? chain : undefined,
          chainGrowBy: 1,
        })
        beginShowing(data)
        return
      }

      if (m === 'creative') {
        if (seq.length < 1) return
        const data = buildCustomColorLevel(seq, colorCount, {
          showTimeMs: soft ? 720 : 650,
          pauseBetweenMs: soft ? 240 : 220,
        })
        beginShowing(data)
        return
      }

      const data = generateColorSequenceLevel(lv, colorCount, {
        softProgression: soft,
      })
      beginShowing(data)
    },
    [colorCount, beginShowing]
  )

  const startLevel = useCallback(() => {
    if (!mode) return
    startLevelAt(level, mode, chainBase, creativeSeq)
  }, [mode, level, chainBase, creativeSeq, startLevelAt])

  // Reproducir secuencia
  useEffect(() => {
    if (phase !== 'showing' || sequence.length === 0) return

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
  }, [phase, sequence, showTimeMs, pauseMs])

  const finishSuccess = (timeMs: number) => {
    const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, level)
    const isNewBest = timeMs > 0 && (prevBest == null || timeMs < prevBest)

    if (mode === 'climb' || mode === 'progressive') {
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
    if (mode === 'climb' || mode === 'progressive') {
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

  const handleColorClick = (colorId: ColorId) => {
    if (phase !== 'input') return
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

  /** Un solo toque → siguiente nivel y se reproduce al instante (sin "Comenzar") */
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
    bestForLevel != null &&
    lastTimeMs != null &&
    lastTimeMs > bestForLevel * 1.15

  // ─── MENÚ (estilo cartas) ────────────────────────────────────────────────
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
              Observa y repite el orden de los colores.
            </p>

            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.55rem' }}>
              Modo de juego
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(Object.keys(MODE_INFO) as GameMode[]).map((m) => {
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

  // ─── CREATIVO: lista ─────────────────────────────────────────────────────
  if (phase === 'creative-hub') {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="glass-button secondary" onClick={backToMenu}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
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
                setColorCount(9)
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
                    {lv.sequence.length} pasos · {lv.colorCount} colores
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="glass-button"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => {
                        soundClick()
                        setCreativeSeq(lv.sequence)
                        setColorCount(lv.colorCount)
                        setMode('creative')
                        startLevelAt(1, 'creative', [], lv.sequence)
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
                        setColorCount(lv.colorCount)
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

  // ─── CREATIVO: editor ────────────────────────────────────────────────────
  if (phase === 'creative-edit') {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="glass-button secondary" onClick={() => {
            soundClick()
            setPhase('creative-hub')
          }} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
            ← Lista
          </button>
          <span style={{ fontSize: '0.95rem' }}>
            {editingCreativeId ? 'Editar' : 'Nuevo'}
          </span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem', textAlign: 'center' }}>
            <label style={{ display: 'block', textAlign: 'left', fontWeight: 500, marginBottom: 6 }}>
              Nombre del nivel
            </label>
            <input
              className="glass-input"
              value={creativeName}
              onChange={(e) => setCreativeName(e.target.value)}
              placeholder="Mi secuencia"
              style={{ marginBottom: '1rem' }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', minHeight: 44, marginBottom: '0.85rem' }}>
              {creativeSeq.length === 0 && (
                <span style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem' }}>Secuencia vacía</span>
              )}
              {creativeSeq.map((id, i) => {
                const c = palette.find((p) => p.id === id)
                return (
                  <button
                    key={`${id}-${i}`}
                    type="button"
                    onClick={() => {
                      soundClick()
                      setCreativeSeq((s) => s.filter((_, j) => j !== i))
                    }}
                    style={{
                      width: 34, height: 34, borderRadius: 10, border: '2px solid rgba(255,255,255,0.2)',
                      background: c?.hex ?? '#666', padding: 0,
                    }}
                  />
                )
              })}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: 8, maxWidth: gridMaxWidth, margin: '0 auto 1rem',
            }}>
              {palette.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    soundClick()
                    setCreativeSeq((s) => [...s, c.id])
                  }}
                  style={{
                    aspectRatio: '1', borderRadius: 14, border: 'none', background: c.hex,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {COLOR_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`glass-button ${colorCount === n ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => { soundClick(); setColorCount(n) }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <GlassButton
                onClick={() => {
                  if (!creativeName.trim() || creativeSeq.length < 1) return
                  soundSuccess()
                  const entry: CreativeLevel = {
                    id: editingCreativeId ?? uid(),
                    name: creativeName.trim(),
                    sequence: [...creativeSeq],
                    colorCount,
                    updatedAt: new Date().toISOString(),
                  }
                  const next = editingCreativeId
                    ? creativeLevels.map((x) => (x.id === editingCreativeId ? entry : x))
                    : [entry, ...creativeLevels]
                  setCreativeLevels(next)
                  saveCreativeLevels(next)
                  setPhase('creative-hub')
                }}
              >
                Guardar nivel
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  if (creativeSeq.length < 1) return
                  soundClick()
                  startLevelAt(1, 'creative', [], creativeSeq)
                }}
              >
                Probar sin guardar
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  // ─── TEMAS: lista ────────────────────────────────────────────────────────
  if (phase === 'paint-hub') {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="glass-button secondary" onClick={backToMenu}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
            ← Modos
          </button>
          <span style={{ fontSize: '0.95rem' }}>Temas</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: '0.85rem' }}>
              Solo un tema activo. Si no hay ninguno, se usa la paleta original.
            </p>

            <div
              style={{
                padding: '0.75rem 0.9rem',
                borderRadius: 14,
                border: !activeThemeId ? '2px solid var(--gco-primary)' : '1px solid var(--gco-glass-border)',
                marginBottom: '0.55rem',
                background: !activeThemeId ? 'rgba(34,230,197,0.1)' : 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>Tema original</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>12 colores por defecto</p>
                </div>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => {
                    soundToggle(false)
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
                        width: 18, height: 18, borderRadius: 6, background: c.hex,
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

  // ─── TEMAS: editor (solo Guardar → vuelve a hub) ─────────────────────────
  if (phase === 'paint-edit') {
    const current = paintPalette[paintIndex] ?? paintPalette[0]
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="glass-button secondary" onClick={() => {
            soundClick()
            setPhase('paint-hub')
          }} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
            ← Temas
          </button>
          <span style={{ fontSize: '0.95rem' }}>Editar tema</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 6 }}>Nombre</label>
            <input
              className="glass-input"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: '1rem',
            }}>
              {paintPalette.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { soundClick(); setPaintIndex(i) }}
                  style={{
                    aspectRatio: '1', borderRadius: 12,
                    border: paintIndex === i ? '3px solid #fff' : '2px solid transparent',
                    background: c.hex,
                    boxShadow: paintIndex === i ? `0 0 14px ${c.hex}` : 'none',
                  }}
                />
              ))}
            </div>

            {current && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <input
                  type="color"
                  value={isValidHex(current.hex) ? current.hex : '#888888'}
                  onChange={(e) => {
                    const hex = e.target.value
                    setPaintPalette((list) =>
                      list.map((c, i) => (i === paintIndex ? { ...c, hex } : c))
                    )
                  }}
                  style={{ width: 48, height: 40, border: 'none', background: 'transparent' }}
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

  // ─── JUEGO ───────────────────────────────────────────────────────────────
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {(mode === 'climb' || mode === 'progressive') && (
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
          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', display: 'flex', gap: '0.65rem' }}>
            {(phase === 'input' || phase === 'showing') && (
              <span style={{ color: 'var(--gco-ink)' }}>⏱ {formatDuration(elapsedMs)}</span>
            )}
            {bestForLevel != null && bestForLevel > 0 && mode === 'climb' && (
              <span>🏆 {formatDuration(bestForLevel)}</span>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && mode === 'climb' && phase === 'ready' && (
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
                  <span className="mono" style={{ display: 'block', fontSize: '0.65rem' }}>
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
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {mode === 'progressive'
              ? chainBase.length
                ? `Cadena: ${chainBase.length} → +1`
                : 'Primera base de la cadena'
              : 'Observa y repite en tu turno.'}
          </p>

          {/* Controles solo en ready */}
          {phase === 'ready' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`glass-button ${colorCount === n ? '' : 'secondary'}`}
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                    onClick={() => { soundClick(); setColorCount(n) }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <Switch
                checked={softHighlight}
                onChange={(v) => {
                  soundToggle(v)
                  setSoftHighlight(v)
                }}
                label="Resalte suave"
                desc="Menos brillo al marcar el color"
              />

              <div
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: 14,
                  border: '1px solid var(--gco-glass-border)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>Velocidad</span>
                  <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                    {speed.toFixed(1)}×
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '1rem', minWidth: 44 }}
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
                    style={{ padding: '0.4rem 0.75rem', fontSize: '1rem', minWidth: 44 }}
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
                gap: '0.65rem',
                maxWidth: gridMaxWidth,
                margin: '0 auto 1.15rem',
              }}
            >
              {palette.map((c) => {
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
              })}
            </div>
          )}

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GlassButton onClick={startLevel}>Comenzar nivel {level}</GlassButton>
              </motion.div>
            )}

            {phase === 'showing' && (
              <motion.div key="showing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p style={{ color: 'var(--gco-primary)', fontWeight: 600 }}>Observa…</p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                  {sequence.length} pasos · {speed.toFixed(1)}×
                </p>
              </motion.div>
            )}

            {phase === 'input' && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p style={{ color: 'var(--gco-ink-muted)' }}>
                  Tu turno ·{' '}
                  <span className="mono">
                    {userInput.length}/{sequence.length}
                  </span>
                  {' · '}
                  <span className="mono">{formatDuration(elapsedMs)}</span>
                </p>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <p style={{ color: 'var(--gco-primary)', fontWeight: 700, fontSize: '1.1rem' }}>
                  ¡Correcto!
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', margin: '0.35rem 0 0.75rem' }}>
                  {lastTimeMs != null ? formatDuration(lastTimeMs) : '—'}
                  {beatBest ? ' · ¡Nueva marca!' : ''}
                </p>
                {slowerThanBest && bestForLevel != null && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--gco-secondary)', marginBottom: 12 }}>
                    Más lento que tu marca ({formatDuration(bestForLevel)})
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <GlassButton onClick={goNextLevel}>
                    {mode === 'creative' ? 'Volver a mis niveles' : 'Siguiente nivel'}
                  </GlassButton>
                  <button type="button" className="glass-button secondary" onClick={retry}>
                    Reintentar
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'fail' && (
              <motion.div key="fail" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <p style={{ color: 'var(--gco-secondary)', fontWeight: 700 }}>Fallaste</p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', margin: '0.35rem 0 1rem' }}>
                  {mistakeFlash
                    ? `Acertaste ${Math.max(0, userInput.length - 1)} de ${sequence.length}.`
                    : 'Inténtalo de nuevo.'}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
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