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
const GAME_ID = 'codigo'
const TOTAL_LEVELS = 130
const TIMER_BASE = 75

type Item = {
  id: string
  cipher: string
  hint: string
  question: string
  options: string[]
  correct: number
}

function caesar(s: string, k: number) {
  return s
    .split('')
    .map((c) => {
      const base = c >= 'A' && c <= 'Z' ? 65 : c >= 'a' && c <= 'z' ? 97 : 0
      if (!base) return c
      return String.fromCharCode(((c.charCodeAt(0) - base + k + 26) % 26) + base)
    })
    .join('')
}

const PLAIN = [
  'HOLA', 'CLAVE', 'MENSAJE', 'SECRETO', 'LOGICA', 'RAZON', 'PRUEBA', 'CODIGO', 'CIFRA', 'PATRON',
  'ENIGMA', 'PUERTA', 'VERDAD', 'ERROR', 'SISTEMA', 'METODO', 'PISTA', 'CASO', 'IDEA', 'NORTE',
  'SOL', 'MAR', 'LUZ', 'PAZ', 'REY', 'LEY', 'FIN', 'MES', 'DIA', 'OLA',
]

function build(): Item[] {
  const out: Item[] = []
  for (let i = 0; i < TOTAL_LEVELS; i++) {
    const plain = PLAIN[i % PLAIN.length]
    const shift = (i % 12) + 1
    const mode = i % 5
    if (mode === 0) {
      const c = caesar(plain, shift)
      const opts = [
        plain,
        caesar(plain, shift + 1),
        caesar(plain, Math.max(1, shift - 1)),
        plain.split('').reverse().join(''),
        plain.toLowerCase(),
        caesar(plain, 13),
        plain + 'X',
        caesar(plain, 7),
      ]
      out.push({
        id: `c${i}`,
        cipher: c,
        hint: `Cifrado César · desplazamiento +${shift}`,
        question: 'Texto en claro:',
        options: opts,
        correct: 0,
      })
    } else if (mode === 1) {
      const c = plain.split('').reverse().join('')
      out.push({
        id: `c${i}`,
        cipher: c,
        hint: 'Inversión de caracteres (espejo)',
        question: 'Texto en claro:',
        options: [
          plain,
          c,
          caesar(plain, 3),
          plain.slice(1) + plain[0],
          plain + plain[0],
          plain.toLowerCase(),
          caesar(c, 1),
          'XXXX',
        ],
        correct: 0,
      })
    } else if (mode === 2) {
      const c = plain
        .split('')
        .map((ch, idx) => caesar(ch, (idx % 3) + 1))
        .join('')
      out.push({
        id: `c${i}`,
        cipher: c,
        hint: 'Desplazamiento variable por posición (+1, +2, +3…)',
        question: 'Texto en claro más plausible:',
        options: [
          plain,
          caesar(plain, 2),
          c,
          plain.split('').reverse().join(''),
          'CLAVE',
          plain.toLowerCase(),
          caesar(plain, 5),
          'ERROR',
        ],
        correct: 0,
      })
    } else if (mode === 3) {
      const map: Record<string, string> = { A: 'Q', E: 'W', I: 'E', O: 'R', U: 'T' }
      const c = plain
        .split('')
        .map((ch) => map[ch] || ch)
        .join('')
      out.push({
        id: `c${i}`,
        cipher: c,
        hint: 'Sustitución de vocales (A→Q, E→W, I→E, O→R, U→T)',
        question: 'Texto en claro:',
        options: [
          plain,
          c,
          caesar(plain, 4),
          plain.split('').reverse().join(''),
          'VOCAL',
          plain.toLowerCase(),
          caesar(c, 1),
          'XXXX',
        ],
        correct: 0,
      })
    } else {
      const nums = plain
        .split('')
        .map((ch) => String(ch.charCodeAt(0) - 64))
        .join('-')
      out.push({
        id: `c${i}`,
        cipher: nums,
        hint: 'A=1, B=2, … Z=26',
        question: 'Texto en claro:',
        options: [
          plain,
          'ABC',
          caesar(plain, 1),
          plain.split('').reverse().join(''),
          'NUMERO',
          plain.toLowerCase(),
          'CODIGO',
          'XXXX',
        ],
        correct: 0,
      })
    }
  }
  return out
}

const LEVELS = build()

type Guide = { id: string; title: string; body: string }

const CIPHER_GUIDE: Guide[] = [
  {
    id: 'cesar',
    title: 'Cifrado César',
    body:
      'Origen: atribuido a Julio César (siglo I a. C.) en la Guerra de las Galias. Cada letra se desplaza un número fijo de posiciones en el alfabeto (por ejemplo, +3: A→D, B→E…). Uso histórico: mensajes militares breves. Limitación: solo 25 claves útiles en alfabeto latino, vulnerable al análisis de frecuencias.\n\nCómo resolver: prueba desplazamientos 1–25, o cuenta letras frecuentes (en español E, A, O, S) y alinea con el cifrado. En este juego la pista indica el desplazamiento exacto.',
  },
  {
    id: 'espejo',
    title: 'Inversión (espejo)',
    body:
      'Origen: técnica elemental documentada en juegos y ejercicios didácticos; no es un cifrado militar serio. El texto se escribe de derecha a izquierda.\n\nCómo resolver: lee el mensaje al revés. Ejemplo: ADAR → RADA. Combínalo a veces con mayúsculas o espacios eliminados.',
  },
  {
    id: 'variable',
    title: 'Desplazamiento variable',
    body:
      'Relacionado con cifrados polialfabéticos. El de Vigenère (formalizado en el s. XVI por Blaise de Vigenère, con antecedentes en Alberti y Trithemius) usa una clave que cambia el desplazamiento por posición. Aquí usamos un patrón simple: +1, +2, +3 y se repite.\n\nCómo resolver: aplica el patrón inverso a cada letra según su índice (0→−1, 1→−2, 2→−3…).',
  },
  {
    id: 'sust',
    title: 'Sustitución de vocales',
    body:
      'La sustitución monoalfabética existe desde la Antigüedad (cifrado atbash hebreo, sistemas árabes medievales, “cifra del Cesar” generalizada). Aquí solo se sustituyen vocales con un mapa fijo: A→Q, E→W, I→E, O→R, U→T.\n\nCómo resolver: invierte el mapa en las posiciones que sean vocales cifradas; las consonantes no cambian.',
  },
  {
    id: 'nums',
    title: 'Números A=1 … Z=26',
    body:
      'Codificación aritmética usada en acertijos escolares y en introducción a la criptografía. Cada letra se representa por su orden en el alfabeto (A=1 … Z=26).\n\nCómo resolver: convierte cada número a la letra correspondiente. Separadores “-” agrupan dígitos de cada letra.',
  },
]

export function CodigoGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(() => getUnlockedLevels(GAME_CAT, GAME_ID), [progress.highestLevel])
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))
  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [openGuide, setOpenGuide] = useState<string | null>(null)
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
      setItem(LEVELS[(lv - 1 + att * 7) % LEVELS.length])
      setIsCorrect(null)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(35, TIMER_BASE - Math.floor(lv / 6)))
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
      <header
        style={{
          marginBottom: '1.15rem',
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
            clearTimers()
            if (phase === 'setup') navigate('/categoria/deduccion')
            else {
              setPhase('setup')
              setShowLevelPicker(false)
            }
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {phase === 'setup' ? '← Volver' : '← Menú'}
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
                <h2 style={{ textAlign: 'center' }}>🔐 Código cifrado</h2>
                <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  Abre cada método para estudiar origen e historia. Luego descifra. Al fallar, el mensaje cambia
                  sin subir de nivel.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {CIPHER_GUIDE.map((g) => {
                    const open = openGuide === g.id
                    return (
                      <div
                        key={g.id}
                        style={{
                          borderRadius: 14,
                          border: '1px solid var(--gco-glass-border)',
                          background: 'var(--gco-fill-quaternary)',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundClick()
                            setOpenGuide(open ? null : g.id)
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0.85rem 1rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--gco-ink)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: 600,
                            fontSize: '0.92rem',
                          }}
                        >
                          <span style={{ color: open ? 'var(--gco-primary)' : 'var(--gco-ink)' }}>{g.title}</span>
                          <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
                        </button>
                        <AnimatePresence>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <p
                                style={{
                                  margin: 0,
                                  padding: '0 1rem 1rem',
                                  fontSize: '0.82rem',
                                  color: 'var(--gco-ink-muted)',
                                  lineHeight: 1.55,
                                  whiteSpace: 'pre-line',
                                }}
                              >
                                {g.body}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
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
                  Descifrar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && item && (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.2rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', marginBottom: 6 }}>CIFRADO</p>
                <p
                  className="mono"
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    marginBottom: 10,
                    color: 'var(--gco-primary)',
                  }}
                >
                  {item.cipher}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 12 }}>{item.hint}</p>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>{item.question}</p>
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
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  {isCorrect ? 'Descifrado' : 'Fallido'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 12px' }}>
                  {formatDuration(Date.now() - startRef.current)}
                </p>
                {!isCorrect && (
                  <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                    Era: <strong style={{ color: 'var(--gco-primary)' }}>{item.options[item.correct]}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>Siguiente</GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, attempt + 1)}>Otro mensaje (mismo nivel)</GlassButton>
                  )}
                  <button
                    type="button"
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setPhase('setup')
                    }}
                  >
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

export default CodigoGame