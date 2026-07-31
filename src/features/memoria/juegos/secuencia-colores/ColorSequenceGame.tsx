import { useState, useEffect, useCallback, useMemo } from 'react'
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
} from '@/core/audio/uiSounds'
import {
  generateColorSequenceLevel,
  getColorsForCount,
  type ColorId,
  type ColorCount,
} from '../generateLevel'
import { getGameProgress, saveGameProgress } from '../../../../core/storage/progress'

type Phase = 'ready' | 'showing' | 'input' | 'success' | 'fail'

const COLOR_OPTIONS: ColorCount[] = [4, 6, 9, 12]

export function ColorSequenceGame() {
  const navigate = useNavigate()
  const progress = getGameProgress('memoria', 'secuencia-colores')

  const [level, setLevel] = useState(Math.max(1, progress.highestLevel + 1))
  const [phase, setPhase] = useState<Phase>('ready')
  const [colorCount, setColorCount] = useState<ColorCount>(9)
  const [sequence, setSequence] = useState<ColorId[]>([])
  const [userInput, setUserInput] = useState<ColorId[]>([])
  const [activeColor, setActiveColor] = useState<ColorId | null>(null)
  const [showTimeMs, setShowTimeMs] = useState(600)
  const [pauseMs, setPauseMs] = useState(200)
  const [mistakeFlash, setMistakeFlash] = useState(false)

  const palette = useMemo(() => getColorsForCount(colorCount), [colorCount])

  const gridCols = colorCount <= 6 ? 2 : colorCount <= 9 ? 3 : 4
  const gridMaxWidth = colorCount <= 6 ? 220 : colorCount <= 9 ? 300 : 360

  const startLevel = useCallback(() => {
    soundStart()
    const data = generateColorSequenceLevel(level, colorCount)
    setSequence(data.sequence)
    setShowTimeMs(data.showTimeMs)
    setPauseMs(data.pauseBetweenMs)
    setUserInput([])
    setActiveColor(null)
    setMistakeFlash(false)
    setPhase('showing')
  }, [level, colorCount])

  useEffect(() => {
    if (phase !== 'showing' || sequence.length === 0) return

    let cancelled = false
    let i = 0

    const playNext = () => {
      if (cancelled) return
      if (i >= sequence.length) {
        setActiveColor(null)
        setPhase('input')
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

    const startDelay = window.setTimeout(playNext, 450)
    return () => {
      cancelled = true
      window.clearTimeout(startDelay)
    }
  }, [phase, sequence, showTimeMs, pauseMs])

  const handleColorClick = (colorId: ColorId) => {
    if (phase !== 'input') return

    const nextInput = [...userInput, colorId]
    setUserInput(nextInput)

    setActiveColor(colorId)
    soundColor(nextInput.length - 1)
    window.setTimeout(() => setActiveColor(null), 180)

    const expected = sequence[nextInput.length - 1]
    if (colorId !== expected) {
      soundFail()
      setMistakeFlash(true)
      setPhase('fail')
      return
    }

    if (nextInput.length === sequence.length) {
      soundSuccess()
      const newHighest = Math.max(progress.highestLevel, level)
      saveGameProgress('memoria', 'secuencia-colores', {
        highestLevel: newHighest,
        totalCompleted: progress.totalCompleted + 1,
      })
      setPhase('success')
    } else {
      soundMatch()
    }
  }

  const nextLevel = () => {
    soundClick()
    setLevel((l) => l + 1)
    setPhase('ready')
  }

  const retry = () => {
    soundClick()
    setMistakeFlash(false)
    setPhase('ready')
  }

  const phaseHint = (() => {
    switch (phase) {
      case 'ready':
        return 'Elige cuántos colores usar y comienza cuando quieras.'
      case 'showing':
        return 'Observa con atención…'
      case 'input':
        return `Tu turno · ${userInput.length}/${sequence.length}`
      case 'success':
        return 'Secuencia completada.'
      case 'fail':
        return 'La secuencia no coincide.'
      default:
        return ''
    }
  })()

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.35rem',
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
          }}
        >
          <span className="level-number" style={{ fontSize: '1.2rem' }}>
            Nivel {level}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
            }}
          >
            {colorCount} colores
          </span>
        </div>
      </header>

      <GlassCard>
        <div style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.35rem' }}>Secuencia de colores</h2>
          <p
            style={{
              color: 'var(--gco-ink-muted)',
              fontSize: '0.9rem',
              marginBottom: '1.25rem',
              lineHeight: 1.45,
            }}
          >
            Observa la secuencia y repítela en el mismo orden. Más colores =
            más dificultad perceptiva.
          </p>

          <AnimatePresence>
            {phase === 'ready' && (
              <motion.div
                key="color-picker"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{ marginBottom: '1.25rem' }}
              >
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    marginBottom: '0.55rem',
                    color: 'var(--gco-ink)',
                  }}
                >
                  Colores en juego
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.45rem',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {COLOR_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`glass-button ${
                        colorCount === n ? '' : 'secondary'
                      }`}
                      style={{
                        padding: '0.45rem 0.95rem',
                        fontSize: '0.88rem',
                        minWidth: 48,
                      }}
                      onClick={() => {
                        soundClick()
                        setColorCount(n)
                      }}
                      aria-pressed={colorCount === n}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--gco-ink-faint)',
                    marginTop: '0.55rem',
                  }}
                >
                  4 fácil · 6 normal · 9 exigente · 12 máximo
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: '0.65rem',
              maxWidth: gridMaxWidth,
              margin: '0 auto 1.35rem',
            }}
          >
            {palette.map((c) => {
              const isActive = activeColor === c.id
              const dimmed =
                phase === 'showing' && activeColor !== null && !isActive

              return (
                <motion.button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  onClick={() => handleColorClick(c.id)}
                  disabled={phase !== 'input'}
                  whileTap={phase === 'input' ? { scale: 0.9 } : undefined}
                  animate={{
                    scale: isActive ? 1.06 : 1,
                    opacity: dimmed ? 0.32 : 1,
                  }}
                  transition={{ duration: 0.12 }}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 16,
                    border: isActive
                      ? '3px solid rgba(255,255,255,0.95)'
                      : '2px solid transparent',
                    background: c.hex,
                    boxShadow: isActive
                      ? `0 0 28px ${c.hex}, 0 0 8px rgba(255,255,255,0.35)`
                      : '0 2px 8px rgba(0,0,0,0.2)',
                    cursor: phase === 'input' ? 'pointer' : 'default',
                    padding: 0,
                    outline: 'none',
                  }}
                />
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.88rem',
                    marginBottom: '1rem',
                    lineHeight: 1.4,
                  }}
                >
                  {phaseHint}
                </p>
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
                <p
                  style={{
                    color: 'var(--gco-primary)',
                    fontWeight: 600,
                    fontSize: '1rem',
                  }}
                >
                  Observa…
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.8rem',
                    marginTop: '0.35rem',
                  }}
                >
                  Secuencia de {sequence.length} pasos
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
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.95rem',
                  }}
                >
                  Tu turno ·{' '}
                  <span className="mono">
                    {userInput.length}/{sequence.length}
                  </span>
                </p>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'rgba(127,127,127,0.2)',
                    overflow: 'hidden',
                    maxWidth: 180,
                    margin: '0.75rem auto 0',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${
                        sequence.length
                          ? (userInput.length / sequence.length) * 100
                          : 0
                      }%`,
                      background: 'var(--gco-primary)',
                      borderRadius: 999,
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <p
                  style={{
                    color: 'var(--gco-primary)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  ¡Correcto!
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  Nivel {level} superado · {sequence.length} pasos ·{' '}
                  {colorCount} colores
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={nextLevel}>
                    Siguiente nivel
                  </GlassButton>
                  <button
                    type="button"
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setPhase('ready')
                    }}
                  >
                    Ajustar colores
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'fail' && (
              <motion.div
                key="fail"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <p
                  style={{
                    color: 'var(--gco-secondary)',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  Fallaste
                </p>
                <p
                  style={{
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  {mistakeFlash
                    ? `Acertaste ${Math.max(0, userInput.length - 1)} de ${sequence.length}.`
                    : 'Inténtalo de nuevo cuando quieras.'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={retry}>Reintentar</GlassButton>
                  <button
                    type="button"
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setLevel((l) => Math.max(1, l - 1))
                      setPhase('ready')
                    }}
                  >
                    Bajar nivel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}