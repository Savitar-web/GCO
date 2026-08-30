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
const GAME_ID = 'mapas'
const TOTAL_LEVELS = 130
const TIMER_BASE = 80

type Item = {
  id: string
  text: string
  question: string
  options: string[]
  correct: number
}

const BANK: Item[] = [
  { id: 'm1', text: 'A está al norte de B. C está al este de B. D está al sur de C.', question: 'En el caso más simple, ¿dónde queda D respecto de A?', options: ['Sureste de A', 'Noroeste de A', 'Norte de A', 'Oeste de A', 'Coincide con A', 'Suroeste de B', 'Este de A', 'No se puede saber'], correct: 0 },
  { id: 'm2', text: 'En una fila: Ana, Bea y Cruz. Ana no está a la izquierda de Bea. Cruz está en un extremo.', question: 'Orden posible de izquierda a derecha:', options: ['Bea, Ana, Cruz', 'Cruz, Ana, Bea', 'Ana, Cruz, Bea', 'Cruz, Bea, Ana', 'Bea, Cruz, Ana', 'Ana, Bea, Cruz', 'Solo Bea al centro', 'Ningún orden válido'], correct: 0 },
  { id: 'm3', text: 'Grafo: 1 conectado con 2, 2 con 3 y 2 con 4. Caminos simples de 1 a 4.', question: '¿Cuántos caminos simples 1→4?', options: ['Uno (1-2-4)', 'Dos', 'Tres', 'Ninguno', 'Cuatro', 'Infinitos', 'Solo 1-2-3-4', 'Hay arista 1-4'], correct: 0 },
  { id: 'm4', text: 'X está entre Y y Z en una línea. Y está a la izquierda de Z.', question: 'Orden de izquierda a derecha:', options: ['Y, X, Z', 'Z, X, Y', 'X, Y, Z', 'Y, Z, X', 'Z, Y, X', 'X fuera de la línea', 'Y coincide con Z', 'No es lineal'], correct: 0 },
  { id: 'm5', text: 'A ve a B y a C. B solo ve a C. C no ve a nadie. Están en fila mirando al frente.', question: 'Orden de atrás hacia adelante:', options: ['A, B, C', 'C, B, A', 'B, A, C', 'A, C, B', 'C, A, B', 'B, C, A', 'Todos al mismo nivel', 'No hay orden'], correct: 0 },
  { id: 'm6', text: 'Cuatro casas en fila. La roja junto a la azul. La verde no está en un extremo. La blanca está entre la verde y la azul.', question: 'Disposición coherente (izquierda a derecha):', options: ['Verde, blanca, azul, roja (o simétrica válida)', 'Roja sola en el centro', 'Todas verdes en extremos', 'Blanca en ambos extremos', 'Azul entre dos verdes', 'Imposible', 'Solo roja y verde', 'Orden alfabético de color'], correct: 0 },
  { id: 'm7', text: 'Mapa planar: A toca B y C; B toca C y D; D no toca A.', question: '¿A y D pueden compartir color en un coloreado propio?', options: ['Sí, porque no son adyacentes', 'No, nunca', 'Solo con cinco colores', 'Obligan el mismo color', 'Rompe la planaridad', 'Solo en escala de grises', 'D debe tocar A', 'Imposible colorear'], correct: 0 },
  { id: 'm8', text: 'Laberinto con entrada E, salida S y un cruce de tres caminos: callejón, retorno a E, camino a S.', question: 'Estrategia segura mínima:', options: ['Marcar caminos explorados (Tremaux o DFS)', 'Elegir siempre izquierda sin memoria', 'Azar puro', 'Solo BFS mental sin marcas', 'Ignorar callejones', 'Volver siempre a E', 'No hay estrategia', 'Atravesar paredes'], correct: 0 },
  { id: 'm9', text: 'Ciudades A-B-C-D en cuadrado. Lados iguales. Camino más corto A→C sin diagonal.', question: 'Longitud relativa:', options: ['Dos lados del cuadrado', 'Tres lados', 'Cero (diagonal mágica)', 'Un lado', 'Cuatro lados', 'Infinito', 'Media lado', 'No hay camino'], correct: 0 },
  { id: 'm10', text: 'Matriz 3×3. Centro ocupado. Debes colocar dos torres que no se ataquen.', question: '¿Es posible?', options: ['Sí, en posiciones no alineadas fila ni columna', 'No nunca', 'Solo en el centro', 'Solo misma fila', 'Solo misma diagonal', 'Requiere tres torres', 'Imposible en 3×3', 'Solo con alfiles'], correct: 0 },
]

function expand(): Item[] {
  const out = [...BANK]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const b = BANK[i % BANK.length]
    out.push({ ...b, id: `${b.id}-v${out.length}`, text: b.text + (i % 2 ? ' Geometría discreta.' : ' Sin distancias métricas extra.') })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}
const LEVELS = expand()

export function MapasGame() {
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
      setItem(LEVELS[(lv - 1 + att * 5) % LEVELS.length])
      setIsCorrect(null)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(40, TIMER_BASE - Math.floor(lv / 7)))
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
      <style>{`
        .gco-map-hero {
          position: relative;
          overflow: hidden;
          border-radius: var(--gco-radius, 22px);
          padding: 1.35rem 1.25rem;
          background:
            radial-gradient(ellipse 80% 60% at 10% 0%, var(--gco-orb-1), transparent 55%),
            radial-gradient(ellipse 60% 50% at 95% 90%, var(--gco-orb-2), transparent 50%),
            var(--gco-glass-bg);
          border: 1px solid var(--gco-glass-border);
          backdrop-filter: blur(var(--gco-glass-blur, 20px));
          -webkit-backdrop-filter: blur(var(--gco-glass-blur, 20px));
          box-shadow: var(--gco-shadow), inset 0 1px 0 var(--gco-glass-highlight);
        }
        .gco-map-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--gco-primary-dim);
          color: var(--gco-primary);
          border: 1px solid transparent;
        }
        .gco-map-option {
          position: relative;
          overflow: hidden;
        }
        .gco-map-option::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: transparent;
          transition: background 0.2s ease;
        }
        .gco-map-option:hover::before {
          background: var(--gco-primary);
        }
        .gco-map-grid-deco {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          max-width: 120px;
          margin: 0 auto 1rem;
          opacity: 0.55;
        }
        .gco-map-grid-deco span {
          aspect-ratio: 1;
          border-radius: 8px;
          border: 1px solid var(--gco-glass-border);
          background: var(--gco-fill-quaternary);
        }
        .gco-map-grid-deco span.on {
          background: var(--gco-primary-dim);
          border-color: var(--gco-primary);
        }
      `}</style>

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
                <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>actual</span>
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
            <div className="gco-map-hero" style={{ marginBottom: '1rem' }}>
              <div className="gco-map-grid-deco" aria-hidden>
                <span className="on" /><span /><span />
                <span /><span className="on" /><span />
                <span /><span /><span className="on" />
              </div>
              <h2 style={{ textAlign: 'center', marginBottom: 8 }}>🗺️ Mapas mentales</h2>
              <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Relaciones espaciales, grafos y restricciones. Visualiza el esquema sin dibujo completo.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                <span className="gco-map-chip">Norte · Sur · Este · Oeste</span>
                <span className="gco-map-chip">Grafos</span>
                <span className="gco-map-chip">Restricciones</span>
              </div>
              {bestForLevel != null && bestForLevel > 0 && (
                <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--gco-primary)', fontSize: '0.9rem' }}>
                  🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                </p>
              )}
            </div>
            <GlassCard>
              <div style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <div style={{ padding: '1.25rem' }}>
                <p style={{ lineHeight: 1.55, marginBottom: 14, fontSize: '0.98rem' }}>{item.text}</p>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>{item.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className="glass-button secondary gco-map-option"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 46, fontSize: '0.88rem' }}
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
                  {isCorrect ? 'Correcto' : 'Incorrecto'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 12px' }}>
                  {formatDuration(Date.now() - startRef.current)}
                </p>
                {!isCorrect && (
                  <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                    Mejor: <strong style={{ color: 'var(--gco-primary)' }}>{item.options[item.correct]}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>Siguiente</GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, attempt + 1)}>Otro mapa (mismo nivel)</GlassButton>
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

export default MapasGame