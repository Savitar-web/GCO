// CartasGame.tsx  (archivo completo)
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  generateCardsLevel,
  reshuffleCards,
  type CardItem,
  type CardsMode,
} from '../generateLevel'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'
import {
  soundClick,
  soundCard,
  soundMatch,
  soundFail,
  soundSuccess,
  soundTick,
  soundStart,
  soundToggle,
} from '@/core/audio/uiSounds'

type Phase =
  | 'ready'
  | 'creative-hub'
  | 'creative-edit'
  | 'playing'
  | 'track-show'
  | 'track-shuffle'
  | 'track-pick'
  | 'order-show'
  | 'order-play'
  | 'success'
  | 'fail'

type CreativeCardsLevel = {
  id: string
  name: string
  mode: CardsMode
  emojis: string[]
  updatedAt: string
}

/** Multiplicador de velocidad de animación (solo track / order). 1 = normal */
type SpeedMul = 0.65 | 1 | 1.45

const MODE_INFO: Record<
  CardsMode,
  { title: string; desc: string; emoji: string }
> = {
  pairs: {
    title: 'Parejas',
    desc: 'Encuentra todas las parejas iguales.',
    emoji: '🃏',
  },
  track: {
    title: 'Seguimiento',
    desc: 'Memoriza una carta, observa el revoloteo y señala dónde quedó.',
    emoji: '👁️',
  },
  order: {
    title: 'Orden',
    desc: 'Observa el orden de aparición y vuelve a tocarlo en secuencia.',
    emoji: '📶',
  },
}

const EMOJI_POOL = [
  '🍎', '🍋', '🍇', '🍉', '🍓', '🍑', '🥝', '🍌', '🍒', '🍍', '🥭',
  '🍕', '🍔', '🌮', '🍣', '🍦', '🍩', '🍪',
  '🦊', '🐸', '🦉', '🐙', '🦋', '🐬', '🐱', '🐼', '🐶', '🦄', '🦁',
  '🐯', '🐻', '🐨', '🐰', '🐧', '🐦‍⬛', '🦅', '🐢', '🐝', '🐞', '🦈',
  '⭐', '🌙', '⚡', '🔥', '💎', '🎯', '🎵', '🍀', '🌈', '❄️', '🌻',
  '🌸', '🌺', '🌹', '🌴', '🌊', '☀️',
  '🚀', '🏀', '🎲', '🔑', '🎈', '🎸', '🔔', '📱', '💻', '🎮', '🎨',
  '📚', '🏆', '👑', '🧸', '🎁', '🧩', '🪄', '❤️', '💙', '✨', '💫',
]

const CREATIVE_KEY = 'gco:cartas-creative-levels'
const GAME_CAT = 'memoria' as const
const GAME_ID = 'cartas'

const EMOJI_STYLE: React.CSSProperties = {
  color: 'initial',
  WebkitTextFillColor: 'initial',
  filter: 'none',
  fontFamily:
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif',
  lineHeight: 1,
  fontSize: '1.55rem',
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadCreative(): CreativeCardsLevel[] {
  try {
    const raw = localStorage.getItem(CREATIVE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as CreativeCardsLevel[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveCreative(list: CreativeCardsLevel[]) {
  localStorage.setItem(CREATIVE_KEY, JSON.stringify(list))
}

function buildCardsFromEmojis(
  emojis: string[],
  mode: CardsMode
): {
  cards: CardItem[]
  orderIds: string[]
  targetIndex: number
  gridCols: number
} {
  const unique = emojis.filter(Boolean)
  if (mode === 'pairs') {
    let cards: CardItem[] = []
    unique.forEach((emoji, pairId) => {
      cards.push({ id: `${pairId}-a`, pairId, emoji })
      cards.push({ id: `${pairId}-b`, pairId, emoji })
    })
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cards[i], cards[j]] = [cards[j], cards[i]]
    }
    const n = cards.length
    return {
      cards,
      orderIds: [],
      targetIndex: -1,
      gridCols: n <= 12 ? 3 : n <= 20 ? 4 : 5,
    }
  }

  const cards: CardItem[] = unique.map((emoji, i) => ({
    id: `c-${i}`,
    pairId: i,
    emoji,
  }))
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }

  if (mode === 'track') {
    return {
      cards,
      orderIds: [],
      targetIndex: Math.floor(Math.random() * Math.max(1, cards.length)),
      gridCols: cards.length <= 6 ? 3 : cards.length <= 12 ? 4 : 5,
    }
  }

  const orderIds = unique.map((_, i) => `c-${i}`)
  return {
    cards,
    orderIds,
    targetIndex: -1,
    gridCols: cards.length <= 6 ? 3 : cards.length <= 12 ? 4 : 5,
  }
}

/** Desplegable propio (sin <select> nativo) */
function ModeDropdown({
  value,
  onChange,
}: {
  value: CardsMode
  onChange: (m: CardsMode) => void
}) {
  const [open, setOpen] = useState(false)
  const info = MODE_INFO[value]

  return (
    <div style={{ textAlign: 'left', position: 'relative' }}>
      <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>
        Modo de juego
      </p>
      <button
        type="button"
        onClick={() => {
          soundClick()
          setOpen((v) => !v)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.85rem 1rem',
          borderRadius: 14,
          border: '1px solid var(--gco-glass-border)',
          background: 'rgba(255,255,255,0.04)',
          color: 'inherit',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{info.emoji}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '0.95rem' }}>
            {info.title}
          </strong>
          <span
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {info.desc}
          </span>
        </span>
        <span style={{ opacity: 0.7, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{
              marginTop: 8,
              borderRadius: 14,
              border: '1px solid var(--gco-glass-border)',
              background: 'var(--gco-glass-bg, rgba(18, 22, 36, 0.98))',
              overflow: 'hidden',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            }}
          >
            {(Object.keys(MODE_INFO) as CardsMode[]).map((m, idx, arr) => {
              const active = value === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    soundClick()
                    onChange(m)
                    setOpen(false)
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    gap: '0.65rem',
                    alignItems: 'center',
                    padding: '0.8rem 1rem',
                    border: 'none',
                    borderBottom:
                      idx < arr.length - 1
                        ? '1px solid var(--gco-glass-border)'
                        : 'none',
                    background: active
                      ? 'rgba(34, 230, 197, 0.14)'
                      : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>{MODE_INFO[m].emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.92rem' }}>
                      {MODE_INFO[m].title}
                    </strong>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        color: 'var(--gco-ink-muted)',
                        marginTop: 2,
                        lineHeight: 1.3,
                      }}
                    >
                      {MODE_INFO[m].desc}
                    </span>
                  </span>
                  {active && (
                    <span
                      style={{
                        color: 'var(--gco-primary)',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CartasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [level, setLevel] = useState(defaultLevel)
  const [mode, setMode] = useState<CardsMode>('pairs')
  const [phase, setPhase] = useState<Phase>('ready')
  const [cards, setCards] = useState<CardItem[]>([])
  const [gridCols, setGridCols] = useState(3)
  const [timeLeft, setTimeLeft] = useState(0)
  const [useTimer, setUseTimer] = useState(true)
  const [flipped, setFlipped] = useState<string[]>([])
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [lock, setLock] = useState(false)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [orderStep, setOrderStep] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)
  const [isCreativeRun, setIsCreativeRun] = useState(false)

  // Velocidad de animación (solo afecta track / order). 1 = normal
  const [speedMul, setSpeedMul] = useState<SpeedMul>(1)
  const isTraining = speedMul !== 1 // si se modifica → no cuenta victoria

  const [creativeList, setCreativeList] =
    useState<CreativeCardsLevel[]>(loadCreative)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editMode, setEditMode] = useState<CardsMode>('pairs')
  const [editEmojis, setEditEmojis] = useState<string[]>([])

  const timerRef = useRef<number | null>(null)
  const runTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const totalPairsRef = useRef(0)
  const orderIdsRef = useRef<string[]>([])
  const levelRef = useRef(level)
  levelRef.current = level
  const isTrainingRef = useRef(isTraining)
  isTrainingRef.current = isTraining

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [phase, progress.highestLevel, progress.totalCompleted]
  )

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const clearRunTimer = () => {
    if (runTimerRef.current != null) {
      window.clearInterval(runTimerRef.current)
      runTimerRef.current = null
    }
  }

  const startRunTimer = () => {
    clearRunTimer()
    startedAtRef.current = performance.now()
    setElapsedMs(0)
    runTimerRef.current = window.setInterval(() => {
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

  const startCountdown = (seconds: number) => {
    if (!useTimer) {
      setTimeLeft(0)
      return
    }
    setTimeLeft(seconds)
    clearTimer()
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearTimer()
          const ms = stopRunTimer()
          soundFail()
          if (!isCreativeRun && !isTrainingRef.current) {
            recordLevelResult({
              categoryId: GAME_CAT,
              gameId: GAME_ID,
              level: levelRef.current,
              success: false,
              timeMs: ms,
            })
          }
          setPhase('fail')
          return 0
        }
        const next = t - 1
        soundTick(next <= 10)
        return next
      })
    }, 1000)
  }

  const win = useCallback(
    (timeMs: number) => {
      clearTimer()
      const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, levelRef.current)
      const isNew =
        timeMs > 0 && (prevBest == null || timeMs < prevBest)

      // Solo registra victoria si NO es creativo y NO es entrenamiento (velocidad ≠ normal)
      if (!isCreativeRun && !isTrainingRef.current) {
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level: levelRef.current,
          success: true,
          timeMs,
        })
      }

      setLastTimeMs(timeMs)
      setBeatBest(!!isNew && !isTrainingRef.current)
      soundSuccess()
      setPhase('success')
    },
    [isCreativeRun]
  )

  const applyBoard = (
    data: {
      cards: CardItem[]
      pairs: number
      gridCols: number
      timeSec: number
      targetIndex: number
      orderIds: string[]
    },
    m: CardsMode
  ) => {
    setCards(data.cards)
    setGridCols(data.gridCols)
    totalPairsRef.current = data.pairs
    setFlipped([])
    setMatched(new Set())
    setLock(false)
    setOrderStep(0)
    setHighlightId(null)
    orderIdsRef.current = data.orderIds
    setLastTimeMs(null)
    setBeatBest(false)
    setElapsedMs(0)

    if (m === 'pairs') {
      setPhase('playing')
      startRunTimer()
      startCountdown(data.timeSec)
      return
    }

    if (m === 'track') {
      const target = data.cards[data.targetIndex]
      setTargetId(target?.id ?? null)
      setPhase('track-show')
      setHighlightId(target?.id ?? null)
      return
    }

    setPhase('order-show')
  }

  const startLevelAt = useCallback(
    (lv: number, m: CardsMode) => {
      soundStart()
      clearTimer()
      clearRunTimer()
      setIsCreativeRun(false)
      setLevel(lv)
      const data = generateCardsLevel(lv, m)
      applyBoard(data, m)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useTimer]
  )

  const startLevel = useCallback(() => {
    startLevelAt(level, mode)
  }, [level, mode, startLevelAt])

  const startCreativeLevel = (lv: CreativeCardsLevel) => {
    soundStart()
    clearTimer()
    clearRunTimer()
    setIsCreativeRun(true)
    setMode(lv.mode)
    const built = buildCardsFromEmojis(lv.emojis, lv.mode)
    const pairs = lv.emojis.length
    applyBoard(
      {
        cards: built.cards,
        pairs,
        gridCols: built.gridCols,
        timeSec: Math.max(30, 15 + lv.emojis.length * 5),
        targetIndex: built.targetIndex,
        orderIds: built.orderIds,
      },
      lv.mode
    )
  }

  // Track: mostrar la carta objetivo
  useEffect(() => {
    if (phase !== 'track-show' || !targetId) return
    const showMs = Math.round(1800 / speedMul)
    const t = window.setTimeout(() => {
      setHighlightId(null)
      setPhase('track-shuffle')
    }, showMs)
    return () => clearTimeout(t)
  }, [phase, targetId, speedMul])

  // Track: revoloteo (shuffle)
  useEffect(() => {
    if (phase !== 'track-shuffle') return
    let step = 0
    const intervalMs = Math.round(420 / speedMul)
    const id = window.setInterval(() => {
      soundCard()
      setCards((prev) => reshuffleCards(prev, level + step))
      step += 1
      if (step >= 5) {
        clearInterval(id)
        setPhase('track-pick')
        startRunTimer()
        startCountdown(useTimer ? Math.max(20, 40 - Math.min(level, 15)) : 0)
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [phase, level, useTimer, speedMul])

  // Order: mostrar secuencia
  useEffect(() => {
    if (phase !== 'order-show') return
    const ids = orderIdsRef.current
    if (ids.length === 0) return
    let i = 0
    setHighlightId(ids[0])
    soundCard()
    const stepMs = Math.round(900 / speedMul)
    const id = window.setInterval(() => {
      i += 1
      if (i >= ids.length) {
        clearInterval(id)
        setHighlightId(null)
        setCards((prev) => reshuffleCards(prev, level + 99))
        setPhase('order-play')
        startRunTimer()
        startCountdown(useTimer ? Math.max(30, 40 + ids.length * 3) : 0)
        return
      }
      soundCard()
      setHighlightId(ids[i])
    }, stepMs)
    return () => clearInterval(id)
  }, [phase, level, useTimer, speedMul])

  useEffect(() => {
    if (phase !== 'playing') return
    if (matched.size === totalPairsRef.current && totalPairsRef.current > 0) {
      win(stopRunTimer())
    }
  }, [matched, phase, win])

  useEffect(
    () => () => {
      clearTimer()
      clearRunTimer()
    },
    []
  )

  const onPairsClick = (card: CardItem) => {
    if (phase !== 'playing' || lock) return
    if (flipped.includes(card.id) || matched.has(card.pairId)) return
    if (flipped.length >= 2) return

    soundCard()
    const next = [...flipped, card.id]
    setFlipped(next)
    if (next.length < 2) return

    setLock(true)
    const a = cards.find((c) => c.id === next[0])!
    const b = cards.find((c) => c.id === next[1])!
    if (a.pairId === b.pairId) {
      soundMatch()
      setMatched((prev) => new Set(prev).add(a.pairId))
      setFlipped([])
      setLock(false)
    } else {
      window.setTimeout(() => {
        soundFail()
        setFlipped([])
        setLock(false)
      }, 650)
    }
  }

  const onTrackClick = (card: CardItem) => {
    if (phase !== 'track-pick') return
    soundCard()
    const t = stopRunTimer()
    if (card.id === targetId) win(t)
    else {
      if (!isCreativeRun && !isTraining) {
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: false,
          timeMs: t,
        })
      }
      soundFail()
      setPhase('fail')
    }
  }

  const onOrderClick = (card: CardItem) => {
    if (phase !== 'order-play' || lock) return
    const expected = orderIdsRef.current[orderStep]
    soundCard()
    if (card.id === expected) {
      const next = orderStep + 1
      setOrderStep(next)
      setFlipped((f) => [...f, card.id])
      if (next >= orderIdsRef.current.length) win(stopRunTimer())
      else soundMatch()
    } else {
      const t = stopRunTimer()
      if (!isCreativeRun && !isTraining) {
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: false,
          timeMs: t,
        })
      }
      soundFail()
      setPhase('fail')
    }
  }

  const onCardClick = (card: CardItem) => {
    if (mode === 'pairs') onPairsClick(card)
    else if (mode === 'track') onTrackClick(card)
    else onOrderClick(card)
  }

  const isFaceUp = (card: CardItem) => {
    if (mode === 'pairs') {
      return flipped.includes(card.id) || matched.has(card.pairId)
    }
    if (mode === 'track') {
      if (phase === 'track-show') return card.id === targetId
      return false
    }
    if (mode === 'order') {
      if (phase === 'order-show') return card.id === highlightId
      return flipped.includes(card.id)
    }
    return false
  }

  const nextLevel = () => {
    soundClick()
    if (isCreativeRun) {
      setPhase('creative-hub')
      return
    }
    startLevelAt(level + 1, mode)
  }

  const retry = () => {
    soundClick()
    if (isCreativeRun) {
      setPhase('creative-hub')
      return
    }
    startLevelAt(level, mode)
  }

  const statusText = () => {
    if (phase === 'playing')
      return `Parejas ${matched.size}/${totalPairsRef.current}`
    if (phase === 'track-show') return 'Memoriza esta carta…'
    if (phase === 'track-shuffle') return 'Siguiendo el revoloteo…'
    if (phase === 'track-pick') return '¿Dónde quedó?'
    if (phase === 'order-show') return 'Observa el orden…'
    if (phase === 'order-play')
      return `Orden ${orderStep}/${orderIdsRef.current.length}`
    return ''
  }

  const speedLabel =
    speedMul === 0.65 ? 'Lenta' : speedMul === 1.45 ? 'Rápida' : 'Normal'

  // ─── Hub creativo ────────────────────────────────────────────────────────
  if (phase === 'creative-hub') {
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
              setPhase('ready')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Atrás
          </button>
          <span style={{ fontSize: '0.95rem' }}>Niveles creativos</span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <GlassButton
              style={{ width: '100%', marginBottom: '1rem' }}
              onClick={() => {
                soundClick()
                setEditingId(null)
                setEditName(`Nivel ${creativeList.length + 1}`)
                setEditMode('pairs')
                setEditEmojis([])
                setPhase('creative-edit')
              }}
            >
              + Nuevo nivel
            </GlassButton>

            {creativeList.length === 0 && (
              <p
                style={{
                  textAlign: 'center',
                  color: 'var(--gco-ink-muted)',
                  fontSize: '0.9rem',
                }}
              >
                Crea niveles con tus emojis y un nombre.
              </p>
            )}

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}
            >
              {creativeList.map((lv) => (
                <div
                  key={lv.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 14,
                    border: '1px solid var(--gco-glass-border)',
                    background: 'rgba(255,255,255,0.04)',
                    textAlign: 'left',
                  }}
                >
                  <p style={{ fontWeight: 600 }}>{lv.name}</p>
                  <p
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--gco-ink-muted)',
                    }}
                  >
                    {MODE_INFO[lv.mode].title} · {lv.emojis.length} emojis
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      margin: '0.4rem 0',
                      flexWrap: 'wrap',
                    }}
                  >
                    {lv.emojis.slice(0, 10).map((e, i) => (
                      <span key={`${e}-${i}`} style={{ fontSize: '1.1rem' }}>
                        {e}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="glass-button"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => startCreativeLevel(lv)}
                    >
                      Jugar
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => {
                        soundClick()
                        setEditingId(lv.id)
                        setEditName(lv.name)
                        setEditMode(lv.mode)
                        setEditEmojis([...lv.emojis])
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
                        const next = creativeList.filter((x) => x.id !== lv.id)
                        setCreativeList(next)
                        saveCreative(next)
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

  // ─── Editor creativo ─────────────────────────────────────────────────────
  if (phase === 'creative-edit') {
    const minEmojis = editMode === 'pairs' ? 2 : 3
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
            {editingId ? 'Editar' : 'Nuevo'}
          </span>
        </header>

        <GlassCard>
          <div style={{ padding: '1.2rem 1.1rem' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Nombre
            </label>
            <input
              className="glass-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{ marginBottom: '0.85rem' }}
            />

            <div style={{ marginBottom: '0.85rem' }}>
              <ModeDropdown value={editMode} onChange={setEditMode} />
            </div>

            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: 8,
              }}
            >
              Emojis del nivel (mín. {minEmojis}) · toca para quitar
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                minHeight: 40,
                marginBottom: 12,
              }}
            >
              {editEmojis.length === 0 && (
                <span
                  style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem' }}
                >
                  Ninguno
                </span>
              )}
              {editEmojis.map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  type="button"
                  onClick={() => {
                    soundClick()
                    setEditEmojis((s) => s.filter((_, j) => j !== i))
                  }}
                  style={{
                    fontSize: '1.4rem',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 10,
                    padding: '0.25rem 0.4rem',
                    cursor: 'pointer',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 14,
              }}
            >
              {EMOJI_POOL.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    if (editEmojis.includes(e)) return
                    if (editEmojis.length >= 16) return
                    soundClick()
                    setEditEmojis((s) => [...s, e])
                  }}
                  style={{
                    fontSize: '1.35rem',
                    background: 'transparent',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 10,
                    padding: '0.2rem 0.35rem',
                    cursor: 'pointer',
                    opacity: editEmojis.includes(e) ? 0.35 : 1,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            <GlassButton
              style={{ width: '100%' }}
              onClick={() => {
                if (!editName.trim() || editEmojis.length < minEmojis) return
                soundSuccess()
                const entry: CreativeCardsLevel = {
                  id: editingId ?? uid(),
                  name: editName.trim(),
                  mode: editMode,
                  emojis: [...editEmojis],
                  updatedAt: new Date().toISOString(),
                }
                const next = editingId
                  ? creativeList.map((x) => (x.id === editingId ? entry : x))
                  : [entry, ...creativeList]
                setCreativeList(next)
                saveCreative(next)
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

  // ─── Juego (phase ya no es creative-*) ───────────────────────────────────
  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            clearTimer()
            clearRunTimer()
            if (phase !== 'ready') {
              setPhase('ready')
              return
            }
            navigate('/categoria/memoria')
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>
        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {useTimer &&
            timeLeft > 0 &&
            (phase === 'playing' ||
              phase === 'track-pick' ||
              phase === 'order-play') && (
              <span
                className="mono"
                style={{
                  fontSize: '0.95rem',
                  color:
                    timeLeft <= 10
                      ? 'var(--gco-secondary)'
                      : 'var(--gco-ink-muted)',
                }}
              >
                ⏱ {timeLeft}s
              </span>
            )}
          {(phase === 'playing' ||
            phase === 'track-pick' ||
            phase === 'order-play') && (
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
            >
              {formatDuration(elapsedMs)}
              {bestForLevel != null && bestForLevel > 0 && !isCreativeRun && !isTraining && (
                <> · 🏆 {formatDuration(bestForLevel)}</>
              )}
            </span>
          )}
          {!isCreativeRun && phase === 'ready' && (
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setShowLevelPicker((v) => !v)
              }}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
            >
              Nivel {level} ▾
            </button>
          )}
          {!isCreativeRun && phase !== 'ready' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
              {isTraining && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    marginLeft: 6,
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  (entreno)
                </span>
              )}
            </span>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && phase === 'ready' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
          >
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: '0.5rem',
              }}
            >
              Elige nivel · marca a superar
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className={`glass-button ${
                  level === defaultLevel ? '' : 'secondary'
                }`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                onClick={() => {
                  soundClick()
                  setLevel(defaultLevel)
                  setShowLevelPicker(false)
                }}
              >
                Nv. {defaultLevel} (nuevo)
              </button>
              {unlocked.map((u) => (
                <button
                  key={u.level}
                  type="button"
                  className={`glass-button ${
                    level === u.level ? '' : 'secondary'
                  }`}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.4rem 0.65rem',
                    minWidth: 64,
                  }}
                  onClick={() => {
                    soundClick()
                    setLevel(u.level)
                    setShowLevelPicker(false)
                  }}
                >
                  Nv. {u.level}
                  <span
                    className="mono"
                    style={{
                      display: 'block',
                      fontSize: '0.65rem',
                      opacity: 0.85,
                    }}
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
        <div style={{ padding: '1.35rem 1.15rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.35rem' }}>Memoria de cartas</h2>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.88rem',
              marginBottom: '1.1rem',
            }}
          >
            {MODE_INFO[mode].desc}
          </p>

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <ModeDropdown value={mode} onChange={setMode} />

                {/* Control de velocidad (solo visible / útil en track y order) */}
                {(mode === 'track' || mode === 'order') && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--gco-glass-border)',
                      borderRadius: 14,
                      padding: '0.85rem 1.1rem',
                      textAlign: 'left',
                    }}
                  >
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>
                      Velocidad de movimiento
                    </p>
                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 10,
                      }}
                    >
                      Normal cuenta victoria. Lenta / Rápida solo para entrenamiento.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(
                        [
                          { v: 0.65 as SpeedMul, label: '🐢 Lenta' },
                          { v: 1 as SpeedMul, label: '✨ Normal' },
                          { v: 1.45 as SpeedMul, label: '⚡ Rápida' },
                        ] as const
                      ).map(({ v, label }) => (
                        <button
                          key={v}
                          type="button"
                          className={`glass-button ${speedMul === v ? '' : 'secondary'}`}
                          style={{
                            fontSize: '0.82rem',
                            padding: '0.4rem 0.75rem',
                            flex: 1,
                            minWidth: 90,
                          }}
                          onClick={() => {
                            soundToggle(v === 1)
                            setSpeedMul(v)
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {speedMul !== 1 && (
                      <p
                        style={{
                          marginTop: 8,
                          fontSize: '0.75rem',
                          color: 'var(--gco-secondary)',
                        }}
                      >
                        Modo entrenamiento · no se registra la victoria
                      </p>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.85rem 1.1rem',
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      Contrarreloj
                    </p>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      Límite de tiempo al jugar
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      const next = !useTimer
                      soundToggle(next)
                      setUseTimer(next)
                    }}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      background: useTimer
                        ? 'var(--gco-primary)'
                        : 'rgba(255,255,255,0.12)',
                      position: 'relative',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: useTimer ? 24 : 3,
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

                {bestForLevel != null && bestForLevel > 0 && (
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--gco-primary)',
                    }}
                  >
                    Marca Nv. {level}:{' '}
                    <span className="mono">{formatDuration(bestForLevel)}</span>
                  </p>
                )}

                <GlassButton onClick={startLevel}>
                  Comenzar nivel {level}
                  {speedMul !== 1 && mode !== 'pairs' ? ' (entreno)' : ''}
                </GlassButton>

                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    soundClick()
                    setPhase('creative-hub')
                  }}
                >
                  ✨ Modo creativo
                </button>
              </motion.div>
            )}

            {phase !== 'ready' && cards.length > 0 && (
              <motion.div
                key="board"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    gap: '0.55rem',
                    maxWidth: gridCols <= 3 ? 300 : gridCols <= 4 ? 360 : 420,
                    margin: '0 auto 1.1rem',
                  }}
                >
                  {cards.map((card) => {
                    const up = isFaceUp(card)
                    const glow = highlightId === card.id
                    const showEmoji = up || glow
                    return (
                      <motion.button
                        key={card.id}
                        type="button"
                        layout
                        onClick={() => onCardClick(card)}
                        disabled={
                          phase === 'track-shuffle' ||
                          phase === 'track-show' ||
                          phase === 'order-show' ||
                          phase === 'success' ||
                          phase === 'fail' ||
                          (mode === 'pairs' && (lock || up))
                        }
                        whileTap={{ scale: 0.94 }}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 14,
                          border: glow
                            ? '3px solid var(--gco-primary)'
                            : up
                              ? '2px solid rgba(34, 230, 197, 0.45)'
                              : '2px solid var(--gco-glass-border)',
                          background: up
                            ? 'rgba(34, 230, 197, 0.12)'
                            : 'var(--gco-glass-bg)',
                          boxShadow: glow
                            ? '0 0 20px rgba(34, 230, 197, 0.45)'
                            : 'none',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'initial',
                          WebkitTextFillColor: 'initial',
                          filter: 'none',
                        }}
                      >
                        {showEmoji ? (
                          <span aria-hidden style={EMOJI_STYLE}>
                            {card.emoji}
                          </span>
                        ) : (
                          <span
                            style={{
                              opacity: 0.65,
                              color: 'var(--gco-ink-muted)',
                              fontSize: '1.35rem',
                            }}
                          >
                            🂠
                          </span>
                        )}
                      </motion.button>
                    )
                  })}
                </div>

                {phase !== 'success' && phase !== 'fail' && (
                  <p
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.85rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {statusText()}
                    {isTraining && (mode === 'track' || mode === 'order') && (
                      <span style={{ marginLeft: 8, opacity: 0.8 }}>
                        · {speedLabel}
                      </span>
                    )}
                  </p>
                )}

                {phase === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <p
                      style={{
                        color: 'var(--gco-primary)',
                        fontWeight: 600,
                        marginBottom: '0.35rem',
                      }}
                    >
                      ¡Correcto!
                    </p>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: '0.85rem',
                      }}
                    >
                      {lastTimeMs != null ? formatDuration(lastTimeMs) : '—'}
                      {beatBest ? ' · ¡Nueva marca!' : ''}
                      {isTraining && ' · Entrenamiento (no registrado)'}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <GlassButton onClick={nextLevel}>
                        {isCreativeRun
                          ? 'Volver a mis niveles'
                          : 'Siguiente nivel'}
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
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <p
                      style={{
                        color: 'var(--gco-secondary)',
                        fontWeight: 600,
                        marginBottom: '0.85rem',
                      }}
                    >
                      {useTimer && timeLeft <= 0
                        ? 'Se acabó el tiempo.'
                        : 'No era esa. Inténtalo de nuevo.'}
                    </p>
                    <GlassButton onClick={retry}>Reintentar</GlassButton>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}