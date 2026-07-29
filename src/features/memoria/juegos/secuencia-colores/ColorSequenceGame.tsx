import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '../../../../components/ui/GlassButton'
import { GlassCard } from '../../../../components/ui/GlassCard'
import { generateColorSequenceLevel, COLORS, type ColorId } from '../generateLevel'
import { getGameProgress, saveGameProgress } from '../../../../core/storage/progress'
import { useNavigate } from 'react-router'

type Phase = 'ready' | 'showing' | 'input' | 'success' | 'fail'

export function ColorSequenceGame() {
  const navigate = useNavigate()
  const progress = getGameProgress('memoria', 'secuencia-colores')
  const [level, setLevel] = useState(Math.max(1, progress.highestLevel + 1))
  const [phase, setPhase] = useState<Phase>('ready')
  const [sequence, setSequence] = useState<ColorId[]>([])
  const [userInput, setUserInput] = useState<ColorId[]>([])
  const [activeColor, setActiveColor] = useState<ColorId | null>(null)
  const [showTimeMs, setShowTimeMs] = useState(600)
  const [pauseMs, setPauseMs] = useState(200)

  const startLevel = useCallback(() => {
    const data = generateColorSequenceLevel(level)
    setSequence(data.sequence)
    setShowTimeMs(data.showTimeMs)
    setPauseMs(data.pauseBetweenMs)
    setUserInput([])
    setPhase('showing')
  }, [level])

  // Reproducir la secuencia
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
      setTimeout(() => {
        if (cancelled) return
        setActiveColor(null)
        i++
        setTimeout(playNext, pauseMs)
      }, showTimeMs)
    }

    const startDelay = setTimeout(playNext, 400)
    return () => {
      cancelled = true
      clearTimeout(startDelay)
    }
  }, [phase, sequence, showTimeMs, pauseMs])

  const handleColorClick = (colorId: ColorId) => {
    if (phase !== 'input') return

    const nextInput = [...userInput, colorId]
    setUserInput(nextInput)

    // Feedback visual breve
    setActiveColor(colorId)
    setTimeout(() => setActiveColor(null), 180)

    const expected = sequence[nextInput.length - 1]
    if (colorId !== expected) {
      setPhase('fail')
      return
    }

    if (nextInput.length === sequence.length) {
      // Éxito
      const newHighest = Math.max(progress.highestLevel, level)
      saveGameProgress('memoria', 'secuencia-colores', {
        highestLevel: newHighest,
        totalCompleted: progress.totalCompleted + 1,
      })
      setPhase('success')
    }
  }

  const nextLevel = () => {
    setLevel((l) => l + 1)
    setPhase('ready')
  }

  const retry = () => {
    setPhase('ready')
  }

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          className="glass-button secondary"
          onClick={() => navigate('/')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>
        <span className="level-number" style={{ fontSize: '1.25rem' }}>
          Nivel {level}
        </span>
      </header>

      <GlassCard>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Secuencia de colores</h2>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Observa la secuencia y repítela en el mismo orden.
          </p>

          {/* Grid de colores */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              maxWidth: 280,
              margin: '0 auto 1.5rem',
            }}
          >
            {COLORS.map((c) => (
              <motion.button
                key={c.id}
                onClick={() => handleColorClick(c.id)}
                disabled={phase !== 'input'}
                style={{
                  aspectRatio: '1',
                  borderRadius: 16,
                  border: activeColor === c.id ? '3px solid white' : '2px solid transparent',
                  background: c.hex,
                  opacity: phase === 'showing' && activeColor !== c.id ? 0.35 : 1,
                  boxShadow: activeColor === c.id ? `0 0 24px ${c.hex}` : 'none',
                  cursor: phase === 'input' ? 'pointer' : 'default',
                  transition: 'opacity 0.15s, box-shadow 0.15s',
                }}
                whileTap={phase === 'input' ? { scale: 0.92 } : undefined}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {phase === 'ready' && (
              <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GlassButton onClick={startLevel}>Comenzar nivel {level}</GlassButton>
              </motion.div>
            )}
            {phase === 'showing' && (
              <motion.p key="showing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--gco-primary)' }}>
                Observa…
              </motion.p>
            )}
            {phase === 'input' && (
              <motion.p key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--gco-ink-muted)' }}>
                Tu turno · {userInput.length}/{sequence.length}
              </motion.p>
            )}
            {phase === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <p style={{ color: 'var(--gco-primary)', fontWeight: 600, marginBottom: '1rem' }}>
                  ¡Correcto!
                </p>
                <GlassButton onClick={nextLevel}>Siguiente nivel</GlassButton>
              </motion.div>
            )}
            {phase === 'fail' && (
              <motion.div key="fail" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <p style={{ color: 'var(--gco-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
                  Fallaste. Inténtalo de nuevo.
                </p>
                <GlassButton onClick={retry}>Reintentar</GlassButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}