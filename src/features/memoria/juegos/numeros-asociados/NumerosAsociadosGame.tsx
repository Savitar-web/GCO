import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
  soundTick,
} from '@/core/audio/uiSounds'
import {
  generateChunkSequence,
  configFromLevel,
  emojiSequenceToSpeech,
  type ChunkSequence,
  type CharsetMode,
} from '../generateLevel'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

type Phase = 'setup' | 'study' | 'recall'

const GAME_CAT = 'memoria' as const
const GAME_ID = 'numeros-asociados'

export function NumerosAsociadosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [totalChars, setTotalChars] = useState(12)
  const [blockSize, setBlockSize] = useState(3)
  const [charset, setCharset] = useState<CharsetMode>('digits')
  const [useProgressive, setUseProgressive] = useState(false)
  const [useTimer, setUseTimer] = useState(false)
  const [level, setLevel] = useState(defaultLevel)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const [phase, setPhase] = useState<Phase>('setup')
  const [sequence, setSequence] = useState<ChunkSequence | null>(null)
  const [story, setStory] = useState('')
  const [hidden, setHidden] = useState(false)
  const [recallInput, setRecallInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)

  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)

  const timerRef = useRef<number | null>(null)
  const runTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [phase, progress.highestLevel, progress.totalCompleted]
  )

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

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

  useEffect(
    () => () => {
      clearTimer()
      clearRunTimer()
    },
    []
  )

  const generate = useCallback(
    (lv = level) => {
      soundStart()
      clearTimer()
      clearRunTimer()
      setLastTimeMs(null)
      setBeatBest(false)
      setElapsedMs(0)

      const config = useProgressive
        ? configFromLevel(lv)
        : {
            totalChars: clamp(totalChars, 1, 32),
            blockSize: clamp(blockSize, 1, 6),
            charset,
          }

      if (config.blockSize > config.totalChars) {
        config.blockSize = config.totalChars
      }
      if (useProgressive) {
        config.charset = 'digits'
      }

      const seq = generateChunkSequence(config)
      setSequence(seq)
      setStory('')
      setHidden(false)
      setRecallInput('')
      setIsCorrect(null)
      setPhase('study')
    },
    [useProgressive, level, totalChars, blockSize, charset]
  )

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }

  const speakBlocks = () => {
    soundClick()
    if (!sequence) return
    if (sequence.config.charset === 'emojis') {
      speak(emojiSequenceToSpeech(sequence.raw))
    } else {
      speak(sequence.blocks.join(' · '))
    }
  }

  const speakStory = () => {
    soundClick()
    if (!story.trim()) return
    speak(story.trim())
  }

  const goToRecall = () => {
    soundClick()
    setHidden(true)
    setPhase('recall')
    setRecallInput('')
    setIsCorrect(null)
    startRunTimer()

    if (useTimer && sequence) {
      const sec = Math.min(120, Math.max(20, sequence.config.totalChars * 4))
      setTimeLeft(sec)
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearTimer()
            const ms = stopRunTimer()
            soundFail()
            setIsCorrect(false)
            if (useProgressive) {
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: ms,
              })
            }
            return 0
          }
          const next = t - 1
          soundTick(next <= 10)
          return next
        })
      }, 1000)
    } else {
      setTimeLeft(0)
    }
  }

  const checkRecall = () => {
    if (!sequence) return
    if (useTimer && timeLeft <= 0 && isCorrect === false) return

    clearTimer()
    const timeMs = stopRunTimer()

    const cleaned = recallInput.replace(/[\s\-_/|.]/g, '').toUpperCase()
    const target =
      sequence.config.charset === 'emojis'
        ? sequence.raw
        : sequence.raw.toUpperCase()

    const compare =
      sequence.config.charset === 'emojis'
        ? recallInput.replace(/\s/g, '')
        : cleaned

    const ok =
      sequence.config.charset === 'emojis'
        ? compare === target
        : cleaned === target

    setIsCorrect(ok)

    if (ok) {
      soundSuccess()
      if (useProgressive) {
        const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, level)
        const isNew =
          timeMs > 0 && (prevBest == null || timeMs < prevBest)
        setBeatBest(!!isNew)
        setLastTimeMs(timeMs)
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: true,
          timeMs,
        })
      } else {
        setLastTimeMs(timeMs)
        setBeatBest(false)
      }
    } else {
      soundFail()
      setLastTimeMs(timeMs)
      setBeatBest(false)
      if (useProgressive) {
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: false,
          timeMs,
        })
      }
    }
  }

  /** Siguiente nivel: sube y genera al instante */
  const nextProgressive = () => {
    soundClick()
    clearTimer()
    clearRunTimer()
    const next = level + 1
    setLevel(next)
    generate(next)
  }

  const progressivePreview = configFromLevel(level)

  const slowerThanBest =
    useProgressive &&
    bestForLevel != null &&
    lastTimeMs != null &&
    lastTimeMs > bestForLevel * 1.15

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
            gap: '0.65rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {phase === 'recall' && useTimer && timeLeft > 0 && (
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
          {phase === 'recall' && (
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
            >
              {formatDuration(elapsedMs)}
              {useProgressive &&
                bestForLevel != null &&
                bestForLevel > 0 && (
                  <> · 🏆 {formatDuration(bestForLevel)}</>
                )}
            </span>
          )}
          {useProgressive && phase === 'setup' && (
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
          {useProgressive && phase !== 'setup' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
            </span>
          )}
          {!useProgressive && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Modo libre
            </span>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && useProgressive && phase === 'setup' && (
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
        <div style={{ padding: '1.35rem 1.25rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
            Bloques de memoria
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
            {phase === 'setup' && (
              <motion.div
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.15rem',
                }}
              >
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
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--gco-ink-muted)',
                        }}
                      >
                        {useProgressive
                          ? `Nivel actual: ${level}`
                          : 'Sube de nivel con números'}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={useProgressive}
                      aria-label="Activar modo progresivo"
                      onClick={() => {
                        const next = !useProgressive
                        soundToggle(next)
                        setUseProgressive(next)
                        if (next) {
                          setLevel(Math.max(1, progress.highestLevel + 1))
                        }
                      }}
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
                      Elige niveles pasados arriba · supera tu marca de tiempo
                      en el recuerdo
                    </p>
                  )}
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
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      Contrarreloj
                    </p>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      Límite de tiempo al recordar
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    aria-label="Activar contrarreloj"
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
                      transition: 'background 0.2s ease',
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
                        Cantidad de elementos
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
                        Mínimo 1 · Máximo 6
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
                        Tipo de contenido
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
                            ['letters', 'Solo letras'],
                            ['code', 'Código mixto'],
                            ['emojis', 'Emojis'],
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
                            onClick={() => {
                              soundClick()
                              setCharset(value)
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {useProgressive && (
                  <div>
                    <p
                      style={{
                        color: 'var(--gco-ink-muted)',
                        fontSize: '0.9rem',
                        lineHeight: 1.45,
                        marginBottom: 8,
                      }}
                    >
                      Nivel {level}: ~{progressivePreview.totalChars} caracteres
                      en bloques de {progressivePreview.blockSize}
                    </p>
                    {bestForLevel != null && bestForLevel > 0 && (
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--gco-primary)',
                        }}
                      >
                        Marca a superar:{' '}
                        <span className="mono">
                          {formatDuration(bestForLevel)}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <GlassButton
                  onClick={() => generate()}
                  style={{ marginTop: '0.15rem' }}
                >
                  Generar secuencia
                  {useProgressive ? ` · Nv. ${level}` : ''}
                </GlassButton>
              </motion.div>
            )}

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
                        className={
                          sequence.config.charset === 'emojis'
                            ? undefined
                            : 'mono'
                        }
                        style={{
                          background: 'rgba(34, 230, 197, 0.12)',
                          border: '1px solid rgba(34, 230, 197, 0.35)',
                          borderRadius: 10,
                          padding: '0.55rem 0.75rem',
                          fontSize:
                            sequence.config.charset === 'emojis'
                              ? '1.45rem'
                              : '1.25rem',
                          letterSpacing:
                            sequence.config.charset === 'emojis'
                              ? '0.12em'
                              : '0.06em',
                          color: 'var(--gco-primary)',
                          fontWeight: 700,
                        }}
                      >
                        {block}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--gco-ink-muted)' }}>
                      Contenido oculto
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
                    onClick={() => {
                      soundClick()
                      setHidden((v) => !v)
                    }}
                  >
                    {hidden ? 'Mostrar' : 'Ocultar'}
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
                  placeholder={
                    sequence.config.charset === 'emojis'
                      ? 'Ej: La manzana del zorro brilla bajo la luna...'
                      : 'Ej: El 25 de navidad, 39 esferas iluminan 17 carritos...'
                  }
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
                    onClick={() => {
                      soundClick()
                      clearTimer()
                      clearRunTimer()
                      setPhase('setup')
                    }}
                  >
                    Nueva secuencia
                  </button>
                </div>
              </motion.div>
            )}

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
                  {sequence.config.charset === 'emojis'
                    ? 'Escribe los emojis en orden (puedes pegarlos)'
                    : 'Escribe la secuencia completa (espacios o guiones opcionales)'}
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
                  className={`glass-input ${
                    sequence.config.charset === 'emojis' ? '' : 'mono'
                  }`}
                  value={recallInput}
                  onChange={(e) => {
                    setRecallInput(e.target.value)
                    setIsCorrect(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && checkRecall()}
                  placeholder={
                    sequence.config.charset === 'emojis'
                      ? '🍎🍋🍇…'
                      : 'Ej: 2539 1747 1748'
                  }
                  autoFocus
                  style={{
                    textAlign: 'center',
                    fontSize:
                      sequence.config.charset === 'emojis'
                        ? '1.35rem'
                        : '1.15rem',
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
                    disabled={
                      !recallInput.trim() ||
                      (useTimer && timeLeft <= 0 && isCorrect === false)
                    }
                  >
                    Comprobar
                  </GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      clearTimer()
                      clearRunTimer()
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
                        marginBottom: '0.35rem',
                      }}
                    >
                      ¡Correcto!
                    </p>
                    {lastTimeMs != null && (
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--gco-ink-muted)',
                          marginBottom: '0.5rem',
                        }}
                      >
                        {formatDuration(lastTimeMs)}
                        {beatBest ? ' · ¡Nueva marca!' : ''}
                      </p>
                    )}
                    {slowerThanBest && bestForLevel != null && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--gco-secondary)',
                          marginBottom: '0.75rem',
                        }}
                      >
                        Más lento que tu marca (
                        {formatDuration(bestForLevel)}). ¿La superas?
                      </p>
                    )}
                    {useProgressive ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <GlassButton onClick={nextProgressive}>
                          Siguiente nivel
                        </GlassButton>
                        <button
                          type="button"
                          className="glass-button secondary"
                          onClick={() => generate(level)}
                        >
                          Reintentar marca
                        </button>
                      </div>
                    ) : (
                      <GlassButton
                        onClick={() => {
                          soundClick()
                          clearTimer()
                          clearRunTimer()
                          setPhase('setup')
                        }}
                      >
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
                    {useTimer && timeLeft <= 0
                      ? 'Se acabó el tiempo.'
                      : 'No coincide. Prepárate un poco más e inténtalo de nuevo.'}
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