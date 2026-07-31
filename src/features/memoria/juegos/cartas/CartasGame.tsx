import { useState, useEffect, useCallback, useRef } from 'react'
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
import { getGameProgress, saveGameProgress } from '@/core/storage/progress'
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
  | 'playing'
  | 'track-show'
  | 'track-shuffle'
  | 'track-pick'
  | 'order-show'
  | 'order-play'
  | 'success'
  | 'fail'

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

const EMOJI_STYLE: React.CSSProperties = {
  color: 'initial',
  WebkitTextFillColor: 'initial',
  filter: 'none',
  fontFamily:
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif',
  lineHeight: 1,
  fontSize: '1.55rem',
}

export function CartasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress('memoria', 'cartas')
  const [level, setLevel] = useState(Math.max(1, progress.highestLevel + 1))
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

  const timerRef = useRef<number | null>(null)
  const totalPairsRef = useRef(0)
  const orderIdsRef = useRef<string[]>([])
  const prevTimeRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    prevTimeRef.current = null
  }

  const startCountdown = (seconds: number) => {
    if (!useTimer) {
      setTimeLeft(0)
      return
    }
    setTimeLeft(seconds)
    prevTimeRef.current = seconds
    clearTimer()
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearTimer()
          soundFail()
          setPhase('fail')
          return 0
        }
        const next = t - 1
        soundTick(next <= 10)
        return next
      })
    }, 1000)
  }

  const win = useCallback(() => {
    clearTimer()
    soundSuccess()
    const newHighest = Math.max(progress.highestLevel, level)
    saveGameProgress('memoria', 'cartas', {
      highestLevel: newHighest,
      totalCompleted: progress.totalCompleted + 1,
    })
    setPhase('success')
  }, [level, progress.highestLevel, progress.totalCompleted])

  const startLevel = useCallback(() => {
    soundStart()
    clearTimer()
    const data = generateCardsLevel(level, mode)
    setCards(data.cards)
    setGridCols(data.gridCols)
    totalPairsRef.current = data.pairs
    setFlipped([])
    setMatched(new Set())
    setLock(false)
    setOrderStep(0)
    setHighlightId(null)
    orderIdsRef.current = data.orderIds

    if (mode === 'pairs') {
      setPhase('playing')
      startCountdown(data.timeSec)
      return
    }

    if (mode === 'track') {
      const target = data.cards[data.targetIndex]
      setTargetId(target.id)
      setPhase('track-show')
      setHighlightId(target.id)
      return
    }

    setPhase('order-show')
  }, [level, mode, useTimer])

  useEffect(() => {
    if (phase !== 'track-show' || !targetId) return
    const t = window.setTimeout(() => {
      setHighlightId(null)
      setPhase('track-shuffle')
    }, 1800)
    return () => clearTimeout(t)
  }, [phase, targetId])

  useEffect(() => {
    if (phase !== 'track-shuffle') return
    let step = 0
    const id = window.setInterval(() => {
      soundCard()
      setCards((prev) => reshuffleCards(prev, level + step))
      step += 1
      if (step >= 5) {
        clearInterval(id)
        setPhase('track-pick')
        const data = generateCardsLevel(level, 'track')
        startCountdown(Math.max(20, data.timeSec - 20))
      }
    }, 420)
    return () => clearInterval(id)
  }, [phase, level])

  useEffect(() => {
    if (phase !== 'order-show') return
    const ids = orderIdsRef.current
    if (ids.length === 0) return
    let i = 0
    setHighlightId(ids[0])
    soundCard()
    const id = window.setInterval(() => {
      i += 1
      if (i >= ids.length) {
        clearInterval(id)
        setHighlightId(null)
        setCards((prev) => reshuffleCards(prev, level + 99))
        setPhase('order-play')
        const data = generateCardsLevel(level, 'order')
        startCountdown(data.timeSec)
        return
      }
      soundCard()
      setHighlightId(ids[i])
    }, 900)
    return () => clearInterval(id)
  }, [phase, level])

  useEffect(() => {
    if (phase !== 'playing') return
    if (matched.size === totalPairsRef.current && totalPairsRef.current > 0) {
      win()
    }
  }, [matched, phase, win])

  useEffect(() => () => clearTimer(), [])

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
    if (card.id === targetId) win()
    else {
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
      if (next >= orderIdsRef.current.length) win()
      else soundMatch()
    } else {
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
    setLevel((l) => l + 1)
    setPhase('ready')
  }

  const retry = () => {
    soundClick()
    setPhase('ready')
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
            navigate('/categoria/memoria')
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
          <span className="level-number" style={{ fontSize: '1.15rem' }}>
            Nivel {level}
          </span>
        </div>
      </header>

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
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    textAlign: 'left',
                  }}
                >
                  Modo de juego
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {(Object.keys(MODE_INFO) as CardsMode[]).map((m) => {
                    const active = mode === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          soundClick()
                          setMode(m)
                        }}
                        aria-pressed={active}
                        style={{
                          textAlign: 'left',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          gap: '0.75rem',
                          alignItems: 'center',
                          width: '100%',
                          borderRadius: 14,
                          border: active
                            ? 'none'
                            : '1px solid var(--gco-glass-border)',
                          background: active
                            ? 'var(--gco-primary)'
                            : 'var(--gco-glass-bg)',
                          color: active
                            ? 'var(--gco-button-text, #0B1220)'
                            : 'var(--gco-ink)',
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            ...EMOJI_STYLE,
                            fontSize: '1.25rem',
                            width: 28,
                            textAlign: 'center',
                            flexShrink: 0,
                            filter: 'none',
                          }}
                        >
                          {MODE_INFO[m].emoji}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong
                            style={{
                              display: 'block',
                              fontSize: '0.95rem',
                              fontWeight: 600,
                            }}
                          >
                            {MODE_INFO[m].title}
                          </strong>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.78rem',
                              opacity: active ? 0.85 : 0.75,
                              fontWeight: 400,
                              lineHeight: 1.35,
                              marginTop: 2,
                            }}
                          >
                            {MODE_INFO[m].desc}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>

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

                <GlassButton onClick={startLevel}>
                  Comenzar nivel {level}
                </GlassButton>
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
                    maxWidth: gridCols <= 3 ? 300 : 360,
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
                          opacity: 1,
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
                        marginBottom: '0.85rem',
                      }}
                    >
                      ¡Correcto!
                    </p>
                    <GlassButton onClick={nextLevel}>
                      Siguiente nivel
                    </GlassButton>
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