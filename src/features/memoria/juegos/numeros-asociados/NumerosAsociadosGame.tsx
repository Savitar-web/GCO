import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  generateChunkSequence,
  configFromLevel,
  type ChunkSequence,
  type CharsetMode,
} from '../generateLevel'
import { getGameProgress, saveGameProgress } from '@/core/storage/progress'

type Phase = 'setup' | 'study' | 'recall'

export function NumerosAsociadosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress('memoria', 'numeros-asociados')

  // Configuración libre
  const [totalChars, setTotalChars] = useState(12)
  const [blockSize, setBlockSize] = useState(3)
  const [charset, setCharset] = useState<CharsetMode>('digits')
  const [useProgressive, setUseProgressive] = useState(false)
  const [level, setLevel] = useState(Math.max(1, progress.highestLevel + 1))

  // Estado del ejercicio
  const [phase, setPhase] = useState<Phase>('setup')
  const [sequence, setSequence] = useState<ChunkSequence | null>(null)
  const [story, setStory] = useState('')
  const [hidden, setHidden] = useState(false)
  const [recallInput, setRecallInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

  const generate = useCallback(() => {
    const config = useProgressive
      ? configFromLevel(level)
      : {
          totalChars: clamp(totalChars, 1, 32),
          blockSize: clamp(blockSize, 1, 6),
          charset,
        }

    if (config.blockSize > config.totalChars) {
      config.blockSize = config.totalChars
    }

    const seq = generateChunkSequence(config)
    setSequence(seq)
    setStory('')
    setHidden(false)
    setRecallInput('')
    setIsCorrect(null)
    setPhase('study')
  }, [useProgressive, level, totalChars, blockSize, charset])

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }

  const speakBlocks = () => {
    if (!sequence) return
    speak(sequence.blocks.join(' · '))
  }

  const speakStory = () => {
    if (!story.trim()) return
    speak(story.trim())
  }

  const goToRecall = () => {
    setHidden(true)
    setPhase('recall')
    setRecallInput('')
    setIsCorrect(null)
  }

  const checkRecall = () => {
    if (!sequence) return

    const cleaned = recallInput.replace(/[\s\-_/|.]/g, '').toUpperCase()
    const target = sequence.raw.toUpperCase()
    const ok = cleaned === target
    setIsCorrect(ok)

    if (ok && useProgressive) {
      const newHighest = Math.max(progress.highestLevel, level)
      saveGameProgress('memoria', 'numeros-asociados', {
        highestLevel: newHighest,
        totalCompleted: progress.totalCompleted + 1,
      })
    }
  }

  const nextProgressive = () => {
    setLevel((current) => current + 1)
    setSequence(null)
    setPhase('setup')
  }

  const progressivePreview = configFromLevel(level)

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
        <span className="level-number" style={{ fontSize: '1.05rem' }}>
          {useProgressive ? `Nivel ${level}` : 'Modo libre'}
        </span>
      </header>

      <GlassCard>
        <div style={{ padding: '1.35rem 1.25rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
            Bloques numéricos
          </h2>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--gco-ink-muted)',
              fontSize: '0.88rem',
              marginBottom: '1.35rem',
            }}
          >
            Genera · agrupa · inventa una historia · oculta · recuerda
          </p>

          <AnimatePresence mode="wait">
            {/* ========== SETUP ========== */}
            {phase === 'setup' && (
              <motion.div
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}
              >
                {/* Switch modo progresivo */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '1rem 1.1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        Modo progresivo
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                        {useProgressive
                          ? `Nivel actual: ${level}`
                          : 'Sube de nivel'}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={useProgressive}
                      aria-label="Activar modo progresivo"
                      onClick={() => setUseProgressive((value) => !value)}
                      style={{
                        width: 52,
                        height: 30,
                        borderRadius: 999,
                        border: 'none',
                        cursor: 'pointer',
                        background: useProgressive
                          ? 'var(--gco-primary)'
                          : 'rgba(255,255,255,0.12)',
                        position: 'relative',
                        transition: 'background 0.2s ease',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 3,
                          left: useProgressive ? 24 : 3,
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

                  {useProgressive && (
                    <p
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--gco-ink-muted)',
                        lineHeight: 1.5,
                        borderTop: '1px solid var(--gco-glass-border)',
                        paddingTop: '0.75rem',
                        marginTop: '0.85rem',
                      }}
                    >
                      Cada nivel aumenta la cantidad de caracteres y el tamaño de
                      los bloques. Empiezas con secuencias cortas (fáciles de
                      convertir en historia) y vas subiendo hasta cadenas más
                      largas. Al acertar se guarda tu progreso y pasas al
                      siguiente nivel.
                    </p>
                  )}
                </div>

                {/* Configuración manual */}
                {!useProgressive && (
                  <>
                    <div>
                      <label
                        htmlFor="totalChars"
                        style={{
                          display: 'block',
                          marginBottom: '0.4rem',
                          fontWeight: 500,
                        }}
                      >
                        Cantidad de caracteres
                      </label>
                      <input
                        id="totalChars"
                        className="glass-input mono"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={32}
                        value={totalChars}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '') {
                            setTotalChars(1)
                            return
                          }
                          const parsed = parseInt(value, 10)
                          if (!isNaN(parsed)) {
                            setTotalChars(clamp(parsed, 1, 32))
                          }
                        }}
                        style={{
                          maxWidth: 120,
                          textAlign: 'center',
                          fontSize: '1.1rem',
                        }}
                      />
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--gco-ink-faint)',
                          marginTop: '0.3rem',
                        }}
                      >
                        Mínimo 1 · Máximo 32
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="blockSize"
                        style={{
                          display: 'block',
                          marginBottom: '0.4rem',
                          fontWeight: 500,
                        }}
                      >
                        Tamaño de bloque
                      </label>
                      <input
                        id="blockSize"
                        className="glass-input mono"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={6}
                        value={blockSize}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '') {
                            setBlockSize(1)
                            return
                          }
                          const parsed = parseInt(value, 10)
                          if (!isNaN(parsed)) {
                            setBlockSize(clamp(parsed, 1, 6))
                          }
                        }}
                        style={{
                          maxWidth: 120,
                          textAlign: 'center',
                          fontSize: '1.1rem',
                        }}
                      />
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--gco-ink-faint)',
                          marginTop: '0.3rem',
                        }}
                      >
                        Mínimo 1 · Máximo 6 (de 2 en 2, de 3 en 3, de 4 en 4…)
                      </p>
                    </div>

                    <div>
                      <p
                        style={{
                          fontSize: '0.9rem',
                          marginBottom: '0.5rem',
                          fontWeight: 500,
                        }}
                      >
                        Tipo de caracteres
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        {(
                          [
                            ['digits', 'Solo números'],
                            ['alnum', 'Letras + números'],
                            ['code', 'Código mixto'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`glass-button ${
                              charset === value ? '' : 'secondary'
                            }`}
                            style={{
                              fontSize: '0.85rem',
                              padding: '0.5rem 0.9rem',
                            }}
                            onClick={() => setCharset(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {useProgressive && (
                  <p
                    style={{
                      color: 'var(--gco-ink-muted)',
                      fontSize: '0.9rem',
                      lineHeight: 1.45,
                    }}
                  >
                    Nivel {level}: ~{progressivePreview.totalChars} caracteres en
                    bloques de {progressivePreview.blockSize}
                  </p>
                )}

                <GlassButton onClick={generate} style={{ marginTop: '0.15rem' }}>
                  Generar secuencia
                </GlassButton>
              </motion.div>
            )}

            {/* ========== STUDY ========== */}
            {phase === 'study' && sequence && (
              <motion.div
                key="study"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                    minHeight: 56,
                  }}
                >
                  {!hidden ? (
                    sequence.blocks.map((block, index) => (
                      <span
                        key={`${block}-${index}`}
                        className="mono"
                        style={{
                          background: 'rgba(34, 230, 197, 0.12)',
                          border: '1px solid rgba(34, 230, 197, 0.35)',
                          borderRadius: 10,
                          padding: '0.55rem 0.75rem',
                          fontSize: '1.25rem',
                          letterSpacing: '0.06em',
                          color: 'var(--gco-primary)',
                          fontWeight: 700,
                        }}
                      >
                        {block}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--gco-ink-muted)' }}>
                      Números ocultos
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    marginBottom: '1.15rem',
                  }}
                >
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={() => setHidden((value) => !value)}
                  >
                    {hidden ? 'Mostrar' : 'Ocultar'} números
                  </button>
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={speakBlocks}
                  >
                    🔊 Leer bloques
                  </button>
                </div>

                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.4rem',
                    fontWeight: 500,
                  }}
                >
                  Tu historia / significado
                </label>
                <textarea
                  className="glass-input"
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="Ej: El 25 de navidad, 39 esferas iluminan 17 carritos..."
                  rows={4}
                  style={{
                    resize: 'vertical',
                    minHeight: 100,
                    lineHeight: 1.45,
                    marginBottom: '0.75rem',
                  }}
                />

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={speakStory}
                    disabled={!story.trim()}
                  >
                    🔊 Leer historia
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={goToRecall}>
                    Ya lo memoricé → Jugar
                  </GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => setPhase('setup')}
                  >
                    Nueva secuencia
                  </button>
                </div>
              </motion.div>
            )}

            {/* ========== RECALL ========== */}
            {phase === 'recall' && sequence && (
              <motion.div
                key="recall"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                  }}
                >
                  Escribe la secuencia completa (puedes usar espacios o guiones)
                </p>

                {story.trim() && (
                  <p
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 12,
                      padding: '0.75rem 1rem',
                      fontSize: '0.88rem',
                      color: 'var(--gco-ink-muted)',
                      marginBottom: '1rem',
                      fontStyle: 'italic',
                    }}
                  >
                    “{story.trim()}”
                  </p>
                )}

                <input
                  className="glass-input mono"
                  value={recallInput}
                  onChange={(e) => {
                    setRecallInput(e.target.value)
                    setIsCorrect(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && checkRecall()}
                  placeholder="Ej: 2539 1747 1748 1374"
                  autoFocus
                  style={{
                    textAlign: 'center',
                    fontSize: '1.15rem',
                    letterSpacing: '0.05em',
                    marginBottom: '1rem',
                  }}
                />

                <div
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton
                    onClick={checkRecall}
                    disabled={!recallInput.trim()}
                  >
                    Comprobar
                  </GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      setHidden(false)
                      setPhase('study')
                      setIsCorrect(null)
                    }}
                  >
                    Volver a estudiar
                  </button>
                </div>

                {isCorrect === true && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ marginTop: '1.25rem', textAlign: 'center' }}
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
                    {useProgressive ? (
                      <GlassButton onClick={nextProgressive}>
                        Siguiente nivel
                      </GlassButton>
                    ) : (
                      <GlassButton onClick={() => setPhase('setup')}>
                        Nueva secuencia
                      </GlassButton>
                    )}
                  </motion.div>
                )}

                {isCorrect === false && (
                  <p
                    style={{
                      marginTop: '1rem',
                      color: 'var(--gco-secondary)',
                      textAlign: 'center',
                      fontSize: '0.95rem',
                    }}
                  >
                    No coincide. Revisa tu historia e inténtalo de nuevo.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}