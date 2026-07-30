import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { generateCardsLevel, type CardItem } from '../generateLevel'
import { getGameProgress, saveGameProgress } from '@/core/storage/progress'

type Phase = 'ready' | 'playing' | 'success' | 'fail'

export function CartasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress('memoria', 'cartas')
  const [level, setLevel] = useState(Math.max(1, progress.highestLevel + 1))
  const [phase, setPhase] = useState<Phase>('ready')
  const [cards, setCards] = useState<CardItem[]>([])
  const [gridCols, setGridCols] = useState(3)
  const [timeLeft, setTimeLeft] = useState(0)
  const [useTimer, setUseTimer] = useState(true)
  const [flipped, setFlipped] = useState<string[]>([])
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [lock, setLock] = useState(false)
  const timerRef = useRef<number | null>(null)
  const totalPairsRef = useRef(0)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(() => {
    clearTimer()
    const data = generateCardsLevel(level)
    setCards(data.cards)
    setGridCols(data.gridCols)
    totalPairsRef.current = data.pairs
    setFlipped([])
    setMatched(new Set())
    setLock(false)
    setPhase('playing')

    if (useTimer) {
      setTimeLeft(data.timeSec)
      timerRef.current = window.setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearTimer()
            setPhase('fail')
            return 0
          }
          return t - 1
        })
      }, 1000)
    } else {
      setTimeLeft(0)
    }
  }, [level, useTimer])

  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (phase !== 'playing') return
    if (matched.size === totalPairsRef.current && totalPairsRef.current > 0) {
      clearTimer()
      const newHighest = Math.max(progress.highestLevel, level)
      saveGameProgress('memoria', 'cartas', {
        highestLevel: newHighest,
        totalCompleted: progress.totalCompleted + 1,
      })
      setPhase('success')
    }
  }, [matched, phase, level, progress.highestLevel, progress.totalCompleted])

  const onCardClick = (card: CardItem) => {
    if (phase !== 'playing' || lock) return
    if (flipped.includes(card.id)) return
    if (matched.has(card.pairId)) return
    if (flipped.length >= 2) return

    const next = [...flipped, card.id]
    setFlipped(next)

    if (next.length < 2) return

    setLock(true)
    const [aId, bId] = next
    const a = cards.find((c) => c.id === aId)!
    const b = cards.find((c) => c.id === bId)!

    if (a.pairId === b.pairId) {
      setMatched((prev) => new Set(prev).add(a.pairId))
      setFlipped([])
      setLock(false)
    } else {
      window.setTimeout(() => {
        setFlipped([])
        setLock(false)
      }, 650)
    }
  }

  const nextLevel = () => {
    setLevel((l) => l + 1)
    setPhase('ready')
  }

  const retry = () => {
    setPhase('ready')
  }

  const isFaceUp = (card: CardItem) =>
    flipped.includes(card.id) || matched.has(card.pairId)

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
          className="glass-button secondary"
          onClick={() => navigate('/categoria/memoria')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {phase === 'playing' && useTimer && (
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
              marginBottom: '1.25rem',
            }}
          >
            Encuentra las parejas
            {useTimer ? ' antes de que se acabe el tiempo.' : '.'}
          </p>

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--gco-ink-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useTimer}
                    onChange={(e) => setUseTimer(e.target.checked)}
                  />
                  Contrarreloj
                </label>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.9rem',
                    marginBottom: '1rem',
                  }}
                >
                  Más cartas y menos tiempo en cada nivel.
                </p>
                <GlassButton onClick={startLevel}>
                  Comenzar nivel {level}
                </GlassButton>
              </motion.div>
            )}

            {(phase === 'playing' ||
              phase === 'success' ||
              phase === 'fail') &&
              cards.length > 0 && (
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
                      margin: '0 auto 1.25rem',
                    }}
                  >
                    {cards.map((card) => {
                      const up = isFaceUp(card)
                      return (
                        <motion.button
                          key={card.id}
                          type="button"
                          onClick={() => onCardClick(card)}
                          disabled={phase !== 'playing' || lock || up}
                          whileTap={
                            phase === 'playing' && !up
                              ? { scale: 0.94 }
                              : undefined
                          }
                          style={{
                            aspectRatio: '1',
                            borderRadius: 14,
                            border: up
                              ? '2px solid rgba(34, 230, 197, 0.45)'
                              : '2px solid var(--gco-glass-border)',
                            background: up
                              ? 'rgba(34, 230, 197, 0.12)'
                              : 'var(--gco-glass-bg)',
                            cursor:
                              phase === 'playing' && !up && !lock
                                ? 'pointer'
                                : 'default',
                            fontSize: '1.55rem',
                            display: 'grid',
                            placeItems: 'center',
                            padding: 0,
                            color: 'var(--gco-ink)',
                            transition: 'background 0.15s, border 0.15s',
                          }}
                        >
                          {up ? card.emoji : '🂠'}
                        </motion.button>
                      )
                    })}
                  </div>

                  {phase === 'playing' && (
                    <p
                      style={{
                        color: 'var(--gco-ink-muted)',
                        fontSize: '0.85rem',
                      }}
                    >
                      Parejas {matched.size}/{totalPairsRef.current}
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
                        ¡Todas las parejas!
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
                        Se acabó el tiempo.
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