import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundFail, soundSuccess, soundStart, soundToggle } from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'silogismos'
const TOTAL_LEVELS = 130
const TIMER_BASE = 70

type Item = {
  id: string
  premises: string[]
  question: string
  options: string[]
  correct: number
}

const BANK: Item[] = [
  { id: 's1', premises: ['Todos los A son B.', 'Todos los B son C.'], question: '¿Qué se sigue con validez?', options: ['Todos los A son C', 'Algunos C no son A', 'Ningún A es C', 'Todos los C son A', 'Nada válido', 'Algunos A no son B', 'Solo B son C', 'A y C disjuntos'], correct: 0 },
  { id: 's2', premises: ['Todos los A son B.', 'Algunos C son A.'], question: 'Conclusión válida:', options: ['Algunos C son B', 'Todos los C son B', 'Ningún C es B', 'Todos los B son C', 'Nada', 'Algunos B no son C', 'A no existe', 'Todos los C son A'], correct: 0 },
  { id: 's3', premises: ['Ningún A es B.', 'Todos los C son A.'], question: 'Se sigue:', options: ['Ningún C es B', 'Algunos C son B', 'Todos los B son C', 'Algunos A son B', 'Nada', 'Todos los C son B', 'B son A', 'C equivale a B'], correct: 0 },
  { id: 's4', premises: ['Si P entonces Q.', 'No Q.'], question: 'Forma correcta:', options: ['No P (modus tollens)', 'P', 'Q', 'P y Q', 'Nada', 'No Q implica P', 'P o Q', 'Solo Q'], correct: 0 },
  { id: 's5', premises: ['Si P entonces Q.', 'P.'], question: 'Se sigue:', options: ['Q (modus ponens)', 'No Q', 'No P', 'P o no Q', 'Nada', 'Q implica no P', 'Solo no P', 'P y no Q'], correct: 0 },
  { id: 's6', premises: ['Si P entonces Q.', 'No P.'], question: '¿Qué es válido?', options: ['Nada sobre Q (negar el antecedente no prueba no Q)', 'No Q', 'Q', 'P', 'Q y P', 'Solo no Q', 'P o Q', 'No P y Q'], correct: 0 },
  { id: 's7', premises: ['Si P entonces Q.', 'Q.'], question: '¿Qué es válido?', options: ['Nada sobre P (afirmar el consecuente es falacia)', 'P', 'No P', 'No Q', 'P y Q', 'Solo P', 'Q implica P', 'No Q'], correct: 0 },
  { id: 's8', premises: ['Todos los médicos son licenciados.', 'Ana es licenciada.'], question: '¿Ana es médica?', options: ['No se sigue', 'Sí necesariamente', 'Es imposible', 'Sí si estudia medicina', 'Siempre', 'Nunca', 'Solo si es mujer', 'Solo con título visible'], correct: 0 },
  { id: 's9', premises: ['Algunos A son B.', 'Algunos B son C.'], question: '¿Algunos A son C?', options: ['No necesariamente', 'Sí siempre', 'Nunca', 'Solo en conjuntos finitos', 'Equivale a todos', 'A es igual a C', 'B está vacío', 'Sí si A = B'], correct: 0 },
  { id: 's10', premises: ['∀x P(x)', 'Pa'], question: '¿Es correcta la instanciación?', options: ['Sí, eliminación del universal', 'No', 'Solo si a es número', 'Solo existencial', 'Nada', 'Implica ∃x ¬P(x)', 'Niega Pa', 'Solo en dominios vacíos'], correct: 0 },
  { id: 's11', premises: ['∃x P(x)', '∀x (P(x) → Q(x))'], question: 'Se sigue:', options: ['∃x Q(x)', '∀x Q(x)', '¬∃x Q(x)', 'Nada', '∀x P(x)', '¬Pa', 'Solo Q(a)', 'P vacío'], correct: 0 },
  { id: 's12', premises: ['¬(P ∧ Q)'], question: 'Equivalente por De Morgan:', options: ['¬P ∨ ¬Q', '¬P ∧ ¬Q', 'P ∨ Q', 'P → Q', '¬P → Q', 'P ∧ ¬Q', 'Q', 'P'], correct: 0 },
  { id: 's13', premises: ['P ∨ Q', '¬P'], question: 'Se sigue:', options: ['Q (silogismo disyuntivo)', '¬Q', 'P', 'P ∧ Q', 'Nada', '¬(P ∨ Q)', 'Solo P', 'Q → P'], correct: 0 },
  { id: 's14', premises: ['P → Q', 'Q → R'], question: 'Se sigue:', options: ['P → R', 'R → P', '¬P', '¬R', 'Nada', 'P ∧ R', 'Solo Q', 'R → Q'], correct: 0 },
  { id: 's15', premises: ['Ningún pez vuela.', 'Algunos animales vuelan.'], question: 'Conclusión válida:', options: ['Algunos animales no son peces', 'Todos los animales son peces', 'Ningún animal vuela', 'Todos los peces vuelan', 'Nada', 'Algunos peces vuelan', 'Solo aves', 'Peces = animales'], correct: 0 },
]

function expand(): Item[] {
  const out = [...BANK]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const b = BANK[i % BANK.length]
    out.push({
      ...b,
      id: `${b.id}-v${out.length}`,
      premises: [...b.premises, i % 2 === 0 ? 'No hay premisas ocultas adicionales.' : 'El dominio de discurso no está vacío.'],
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}
const LEVELS = expand()

export function SilogismosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(() => getUnlockedLevels(GAME_CAT, GAME_ID), [progress.highestLevel])
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))
  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [item, setItem] = useState<Item | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level
  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0) => {
      clearTimers()
      const it = LEVELS[(lv - 1 + att * 3) % LEVELS.length]
      setItem(it)
      setIsCorrect(null)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(35, TIMER_BASE - Math.floor(lv / 8)))
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              clearTimers()
              setIsCorrect(false)
              setPhase('result')
              soundFail()
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: Date.now() - startRef.current,
              })
              return 0
            }
            return t - 1
          })
        }, 1000)
      }
    },
    [useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!item || isCorrect !== null) return
    soundClick()
    clearTimers()
    const ok = idx === item.correct
    setIsCorrect(ok)
    setPhase('result')
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: ok,
      timeMs: Date.now() - startRef.current,
    })
    if (ok) soundSuccess()
    else soundFail()
  }

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <button
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            clearTimers()
            if (phase === 'setup') navigate('/categoria/deduccion')
            else {
              setPhase('setup')
              setShowLevelPicker(false)
            }
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {phase === 'setup' ? '← Volver' : '← Modos'}
        </button>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {phase === 'play' && useTimer && (
            <span className="mono" style={{ color: timeLeft <= 12 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)' }}>
              ⏱ {timeLeft}s
            </span>
          )}
          {phase === 'setup' && (
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
          {phase !== 'setup' && <span className="level-number">Nivel {level}</span>}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && phase === 'setup' && (
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
                Nv. {defaultLevel}
                <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                  actual
                </span>
              </button>
              {unlockedRows.map((u) => (
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

      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center' }}>⚖️ Silogismos</h2>
                <div
                  style={{
                    fontSize: '0.88rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.55,
                    padding: '0.9rem 1rem',
                    borderRadius: 14,
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                  }}
                >
                  <p style={{ marginBottom: 8, color: 'var(--gco-ink)', fontWeight: 600 }}>¿Qué es un silogismo?</p>
                  <p style={{ marginBottom: 8 }}>
                    Un <strong style={{ color: 'var(--gco-ink)' }}>silogismo</strong> es un argumento deductivo
                    compuesto por al menos dos premisas y una conclusión. La validez no depende de que las
                    premisas sean verdaderas en el mundo, sino de que la conclusión se siga necesariamente de
                    ellas por su forma lógica.
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    Aristóteles sistematizó los silogismos categóricos (todo, alguno, ninguno). En lógica
                    moderna se amplían con condicionales (modus ponens, modus tollens), cuantificadores y
                    reglas de inferencia. Una <em>falacia formal</em> es un esquema que parece válido pero no lo es
                    (por ejemplo, afirmar el consecuente).
                  </p>
                  <p>
                    En este entrenamiento debes elegir la conclusión o el juicio de validez correcto. Al fallar,
                    el enunciado cambia sin subir de nivel.
                  </p>
                </div>
                {bestForLevel != null && bestForLevel > 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--gco-primary)', fontSize: '0.9rem' }}>
                    🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.8rem 1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600 }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>Activo por defecto</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      soundToggle(!useTimer)
                      setUseTimer(!useTimer)
                    }}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                      position: 'relative',
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
                        transition: 'left 0.2s',
                      }}
                    />
                  </button>
                </div>
                <GlassButton onClick={() => startLevel(Math.min(level, maxSelectable), 0)} style={{ minHeight: 48 }}>
                  Empezar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && item && (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.2rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', marginBottom: 8, letterSpacing: '0.04em' }}>
                  PREMISAS
                </p>
                {item.premises.map((p, i) => (
                  <p key={i} style={{ fontWeight: 500, marginBottom: 6, lineHeight: 1.4 }}>
                    {i + 1}. {p}
                  </p>
                ))}
                <p style={{ fontWeight: 600, margin: '14px 0 12px' }}>{item.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className="glass-button secondary"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 44, fontSize: '0.88rem' }}
                      onClick={() => submit(i)}
                    >
                      <span style={{ opacity: 0.5, marginRight: 8, fontFamily: 'var(--font-mono)' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && item && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.3rem', textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)' }}>
                  {isCorrect ? 'Válido' : 'Incorrecto'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 12px' }}>
                  {formatDuration(Date.now() - startRef.current)}
                </p>
                {!isCorrect && (
                  <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                    Correcto: <strong style={{ color: 'var(--gco-primary)' }}>{item.options[item.correct]}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>Siguiente</GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, attempt + 1)}>Otro enunciado (mismo nivel)</GlassButton>
                  )}
                  <button className="glass-button secondary" onClick={() => { soundClick(); setPhase('setup') }}>
                    Menú
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SilogismosGame