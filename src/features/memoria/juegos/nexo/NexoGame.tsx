import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  generateNexoLevel,
  reshuffleNexoCards,
  type NexoCard,
  type NexoLevel,
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
} from '@/core/audio/uiSounds'

type Phase =
  | 'ready'
  | 'show'
  | 'shuffle'
  | 'play'
  | 'success'
  | 'fail'

const GAME_CAT = 'memoria' as const
const GAME_ID = 'nexo'

const EMOJI_STYLE: React.CSSProperties = {
  color: 'initial',
  WebkitTextFillColor: 'initial',
  filter: 'none',
  fontFamily:
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif',
  lineHeight: 1,
  fontSize: '1.5rem',
}

export function NexoGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [level, setLevel] = useState(defaultLevel)
  const [phase, setPhase] = useState<Phase>('ready')
  const [data, setData] = useState<NexoLevel | null>(null)
  const [cards, setCards] = useState<NexoCard[]>([])
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [flipped, setFlipped] = useState<string[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [useTimer, setUseTimer] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [statusHint, setStatusHint] = useState('')

  const timerRef = useRef<number | null>(null)
  const runTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const sequenceRef = useRef<string[]>([])
  const levelRef = useRef(level)
  levelRef.current = level

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
          recordLevelResult({
            categoryId: GAME_CAT,
            gameId: GAME_ID,
            level: levelRef.current,
            success: false,
            timeMs: ms,
          })
          setPhase('fail')
          return 0
        }
        const next = t - 1
        soundTick(next <= 10)
        return next
      })
    }, 1000)
  }

  const win = useCallback((timeMs: number) => {
    clearTimer()
    const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, levelRef.current)
    const isNew = timeMs > 0 && (prevBest == null || timeMs < prevBest)
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level: levelRef.current,
      success: true,
      timeMs,
    })
    setLastTimeMs(timeMs)
    setBeatBest(!!isNew)
    soundSuccess()
    setPhase('success')
  }, [])

  const startLevelAt = useCallback(
    (lv: number) => {
      soundStart()
      clearTimer()
      clearRunTimer()
      setLevel(lv)
      const lvData = generateNexoLevel(lv)
      setData(lvData)
      setCards(lvData.cards)
      sequenceRef.current = lvData.reverse
        ? [...lvData.sequenceIds].reverse()
        : [...lvData.sequenceIds]
      setStep(0)
      setFlipped([])
      setHighlightId(null)
      setLastTimeMs(null)
      setBeatBest(false)
      setElapsedMs(0)
      setStatusHint(
        lvData.reverse
          ? 'Memoriza la secuencia… (luego será INVERSA)'
          : 'Memoriza la secuencia…'
      )
      setPhase('show')
    },
    [useTimer]
  )

  // Fase SHOW: iluminar secuencia (+ distractores)
  useEffect(() => {
    if (phase !== 'show' || !data) return
    const ids = data.sequenceIds
    let i = 0
    setHighlightId(ids[0])
    soundCard()

    const id = window.setInterval(() => {
      i += 1
      if (i >= ids.length) {
        clearInterval(id)
        setHighlightId(null)
        setPhase('shuffle')
        setStatusHint('Observa el revoloteo…')
        return
      }
      // Distractores ocasionales
      if (data.distractors > 0 && Math.random() < 0.25 * data.distractors) {
        const noise = data.cards[Math.floor(Math.random() * data.cards.length)]
        setHighlightId(noise.id)
        soundCard()
        window.setTimeout(() => {
          setHighlightId(ids[i])
          soundCard()
        }, Math.round(data.showStepMs * 0.35))
      } else {
        setHighlightId(ids[i])
        soundCard()
      }
    }, data.showStepMs)

    return () => clearInterval(id)
  }, [phase, data])

  // Fase SHUFFLE
  useEffect(() => {
    if (phase !== 'shuffle' || !data) return
    let pass = 0
    const id = window.setInterval(() => {
      soundCard()
      setCards((prev) => reshuffleNexoCards(prev, level + pass))
      pass += 1
      if (pass >= data.shufflePasses) {
        clearInterval(id)
        setPhase('play')
        setStatusHint(
          data.reverse
            ? `Pulsa en orden INVERSO 0/${sequenceRef.current.length}`
            : `Pulsa en orden 0/${sequenceRef.current.length}`
        )
        startRunTimer()
        startCountdown(useTimer ? data.timeSec : 0)
      }
    }, data.shuffleIntervalMs)
    return () => clearInterval(id)
  }, [phase, data, level, useTimer])

  useEffect(
    () => () => {
      clearTimer()
      clearRunTimer()
    },
    []
  )

  const onCardClick = (card: NexoCard) => {
    if (phase !== 'play') return
    const expected = sequenceRef.current[step]
    soundCard()
    if (card.id === expected) {
      const next = step + 1
      setStep(next)
      setFlipped((f) => [...f, card.id])
      setStatusHint(
        data?.reverse
          ? `Orden inverso ${next}/${sequenceRef.current.length}`
          : `Orden ${next}/${sequenceRef.current.length}`
      )
      if (next >= sequenceRef.current.length) {
        win(stopRunTimer())
      } else {
        soundMatch()
      }
    } else {
      const t = stopRunTimer()
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: GAME_ID,
        level,
        success: false,
        timeMs: t,
      })
      soundFail()
      setPhase('fail')
    }
  }

  const nextLevel = () => {
    soundClick()
    startLevelAt(level + 1)
  }
  const retry = () => {
    soundClick()
    startLevelAt(level)
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
          {useTimer && timeLeft > 0 && phase === 'play' && (
            <span
              className="mono"
              style={{
                fontSize: '0.95rem',
                color: timeLeft <= 10 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
              }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {phase === 'play' && (
            <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              {formatDuration(elapsedMs)}
              {bestForLevel != null && bestForLevel > 0 && (
                <> · 🏆 {formatDuration(bestForLevel)}</>
              )}
            </span>
          )}
          {phase === 'ready' && (
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
          {phase !== 'ready' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
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
            <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.5rem' }}>
              Elige nivel · marca a superar
            </p>
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
                Nv. {defaultLevel} (nuevo)
              </button>
              {unlocked.map((u) => (
                <button
                  key={u.level}
                  type="button"
                  className={`glass-button ${level === u.level ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem', minWidth: 64 }}
                  onClick={() => {
                    soundClick()
                    setLevel(u.level)
                    setShowLevelPicker(false)
                  }}
                >
                  Nv. {u.level}
                  <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
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
          <h2 style={{ marginBottom: '0.35rem' }}>Nexo</h2>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', marginBottom: '1.1rem' }}>
            Memoriza la secuencia, sigue el revoloteo y repítela en las nuevas posiciones.
            En niveles altos puede pedirse el orden inverso.
          </p>

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
              >
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.9rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: 'inherit' }}>Cómo se juega</strong>
                  <br />
                  1. Observa qué cartas se iluminan y en qué orden.
                  <br />
                  2. Las cartas cambian de sitio varias veces.
                  <br />
                  3. Pulsa las mismas cartas en el orden correcto (o inverso).
                  <br />
                  Exige memoria secuencial + seguimiento espacial a la vez.
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
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                      Límite de tiempo al jugar
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => setUseTimer((v) => !v)}
                    style={{
                      width: 52, height: 30, borderRadius: 999, border: 'none',
                      cursor: 'pointer',
                      background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                      position: 'relative', flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute', top: 3, left: useTimer ? 24 : 3,
                        width: 24, height: 24, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }}
                    />
                  </button>
                </div>

                {bestForLevel != null && bestForLevel > 0 && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
                    Marca Nv. {level}: <span className="mono">{formatDuration(bestForLevel)}</span>
                  </p>
                )}

                <GlassButton onClick={() => startLevelAt(level)}>
                  Comenzar nivel {level}
                </GlassButton>
              </motion.div>
            )}

            {phase !== 'ready' && cards.length > 0 && data && (
              <motion.div key="board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${data.gridCols}, 1fr)`,
                    gap: '0.5rem',
                    maxWidth: data.gridCols <= 3 ? 300 : data.gridCols <= 4 ? 360 : 420,
                    margin: '0 auto 1.1rem',
                  }}
                >
                  {cards.map((card) => {
                    const glow = highlightId === card.id
                    const done = flipped.includes(card.id)
                    return (
                      <motion.button
                        key={card.id}
                        type="button"
                        layout
                        onClick={() => onCardClick(card)}
                        disabled={phase === 'show' || phase === 'shuffle' || phase === 'success' || phase === 'fail'}
                        whileTap={{ scale: 0.94 }}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 14,
                          border: glow
                            ? '3px solid var(--gco-primary)'
                            : done
                              ? '2px solid rgba(34, 230, 197, 0.5)'
                              : '2px solid var(--gco-glass-border)',
                          background: done
                            ? 'rgba(34, 230, 197, 0.14)'
                            : glow
                              ? 'rgba(34, 230, 197, 0.2)'
                              : 'var(--gco-glass-bg)',
                          boxShadow: glow ? '0 0 18px rgba(34, 230, 197, 0.45)' : 'none',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                          cursor: phase === 'play' ? 'pointer' : 'default',
                        }}
                      >
                        <span aria-hidden style={EMOJI_STYLE}>
                          {card.emoji}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>

                {phase !== 'success' && phase !== 'fail' && (
                  <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    {statusHint}
                  </p>
                )}

                {phase === 'success' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <p style={{ color: 'var(--gco-primary)', fontWeight: 600, marginBottom: '0.35rem' }}>
                      ¡Nexo completado!
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: '0.85rem' }}>
                      {lastTimeMs != null ? formatDuration(lastTimeMs) : '—'}
                      {beatBest ? ' · ¡Nueva marca!' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <GlassButton onClick={nextLevel}>Siguiente nivel</GlassButton>
                      <button type="button" className="glass-button secondary" onClick={retry}>
                        Reintentar
                      </button>
                    </div>
                  </motion.div>
                )}

                {phase === 'fail' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <p style={{ color: 'var(--gco-secondary)', fontWeight: 600, marginBottom: '0.85rem' }}>
                      {useTimer && timeLeft <= 0
                        ? 'Se acabó el tiempo.'
                        : 'Secuencia rota. Inténtalo de nuevo.'}
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