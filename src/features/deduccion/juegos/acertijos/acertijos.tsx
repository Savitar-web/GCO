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
const GAME_ID = 'acertijos'
const TOTAL_LEVELS = 140
const TIMER_BASE = 55

type Riddle = {
  id: string
  q: string
  options: [string, string, string, string]
  correct: 0 | 1 | 2 | 3
  kind: 'acertijo' | 'adivinanza'
}

const BANK: Riddle[] = [
  { id: 'a1', kind: 'adivinanza', q: 'Blanco por dentro, verde por fuera. Si quieres que te lo diga, espera.', options: ['El plátano', 'La pera', 'El coco', 'La manzana'], correct: 1 },
  { id: 'a2', kind: 'adivinanza', q: 'Oro parece, plata no es. Quien no lo adivine, bien tonto es.', options: ['El plátano', 'El oro', 'La moneda', 'El sol'], correct: 0 },
  { id: 'a3', kind: 'acertijo', q: 'Tiene ciudades sin casas, ríos sin agua y bosques sin árboles. ¿Qué es?', options: ['Un mapa', 'Un sueño', 'Una nube', 'Un desierto'], correct: 0 },
  { id: 'a4', kind: 'acertijo', q: 'Cuanto más se seca, más mojada se pone.', options: ['La toalla', 'La esponja', 'La ropa', 'El jabón'], correct: 0 },
  { id: 'a5', kind: 'acertijo', q: 'Si me nombras, desaparezco. ¿Qué soy?', options: ['El silencio', 'El eco', 'La sombra', 'El secreto'], correct: 0 },
  { id: 'a6', kind: 'adivinanza', q: 'Agua pasa por mi casa, cate de mi corazón.', options: ['La sandía', 'El coco', 'El melón', 'La naranja'], correct: 0 },
  { id: 'a7', kind: 'acertijo', q: 'Un hombre mira un retrato: «Hermanos y hermanas no tengo, pero el padre de ese hombre es el hijo de mi padre». ¿A quién mira?', options: ['A su hijo', 'A su hermano', 'A su padre', 'A sí mismo'], correct: 0 },
  { id: 'a8', kind: 'acertijo', q: '¿Qué se rompe al nombrarlo?', options: ['El silencio', 'El cristal', 'El secreto', 'El hielo'], correct: 0 },
  { id: 'a9', kind: 'adivinanza', q: 'Largo, largo como un camino, lleno de letras y de caminos.', options: ['El abecedario', 'El libro', 'El mapa', 'El río'], correct: 0 },
  { id: 'a10', kind: 'acertijo', q: 'Tengo agujas pero no coso; números pero no cuento. ¿Qué soy?', options: ['Un reloj', 'Un termómetro', 'Una brújula', 'Un ábaco'], correct: 0 },
  { id: 'a11', kind: 'acertijo', q: 'Camina sin piernas, habla sin boca, vuela sin alas.', options: ['El viento', 'El eco', 'La nube', 'El humo'], correct: 0 },
  { id: 'a12', kind: 'acertijo', q: 'Un granjero tiene 17 ovejas. Todas menos 9 mueren. ¿Cuántas le quedan?', options: ['9', '8', '17', '0'], correct: 0 },
  { id: 'a13', kind: 'acertijo', q: '¿Qué pesa más: un kilo de plomo o un kilo de plumas?', options: ['Pesan igual', 'El plomo', 'Las plumas', 'Depende'], correct: 0 },
  { id: 'a14', kind: 'acertijo', q: 'Un tren eléctrico va de norte a sur. El viento sopla de este a oeste. ¿Hacia dónde va el humo?', options: ['No hay humo', 'Al oeste', 'Al este', 'Al sur'], correct: 0 },
  { id: 'a15', kind: 'acertijo', q: 'Calcetines negros y blancos a pares iguales. ¿Cuántos mínimos a oscuras para un par del mismo color?', options: ['3', '2', '4', '5'], correct: 0 },
  { id: 'a16', kind: 'acertijo', q: 'Barquero, lobo, cabra y col. Solo uno extra en la barca. ¿Orden mínimo?', options: ['Cabra; vuelve; lobo; vuelve con cabra; col; vuelve; cabra', 'Lobo primero', 'Col primero', 'Imposible'], correct: 0 },
  { id: 'a17', kind: 'acertijo', q: '¿Qué número sigue: 2, 3, 3, 5, 4, 4, 3, 5, 5, 4…?', options: ['3 (letras de «seis»)', '6', '4', '2'], correct: 0 },
  { id: 'a18', kind: 'acertijo', q: '«Este enunciado es falso.» ¿Qué ocurre?', options: ['Paradoja: no es establemente V ni F', 'Es verdadero', 'Es falso', 'No significa nada'], correct: 0 },
  { id: 'a19', kind: 'acertijo', q: 'Hombre pide agua; camarero saca pistola; hombre dice gracias y se va. ¿Por qué?', options: ['Tenía hipo; el susto lo curó', 'Era un robo', 'Agua envenenada', 'Era un juego'], correct: 0 },
  { id: 'a20', kind: 'acertijo', q: 'Si todos los cuervos son negros y este pájaro es negro, ¿es un cuervo?', options: ['No necesariamente (afirma el consecuente)', 'Sí', 'No', 'Solo si es grande'], correct: 0 },
  { id: 'a21', kind: 'acertijo', q: 'A: «B miente». B: «C miente». C: «A y B mienten». Exactamente uno dice verdad. ¿Quién?', options: ['B', 'A', 'C', 'Ninguno'], correct: 0 },
  { id: 'a22', kind: 'acertijo', q: 'Barbero afeita a quienes no se afeitan solos. ¿Quién afeita al barbero?', options: ['Paradoja de Russell: inconsistente', 'Él mismo', 'Otro', 'Nadie'], correct: 0 },
  { id: 'a23', kind: 'acertijo', q: 'Cuanto más le quitas, más grande es.', options: ['Un agujero', 'Una deuda', 'El silencio', 'La sombra'], correct: 0 },
  { id: 'a24', kind: 'acertijo', q: '5 máquinas → 5 piezas en 5 min. ¿100 máquinas → 100 piezas?', options: ['5 minutos', '100 minutos', '20 minutos', '1 minuto'], correct: 0 },
  { id: 'a25', kind: 'acertijo', q: '9 bolas, una más pesada. Balanza. ¿Mínimo pesadas?', options: ['2', '3', '4', '1'], correct: 0 },
  { id: 'a26', kind: 'acertijo', q: 'Torneo eliminación, 100 jugadores. ¿Partidos para campeón?', options: ['99', '100', '50', '198'], correct: 0 },
  { id: 'a27', kind: 'acertijo', q: '¿Qué palabra se escribe incorrectamente en todos los diccionarios?', options: ['Incorrectamente', 'Diccionario', 'Ortografía', 'Error'], correct: 0 },
  { id: 'a28', kind: 'acertijo', q: 'Dos puertas, mentiroso y veraz. Una pregunta. ¿Cuál?', options: ['«Si preguntara al otro cuál es la de libertad, ¿qué diría?» y eliges la contraria', '«¿Mientes?»', '«¿Cuál es la buena?»', 'No hay pregunta útil'], correct: 0 },
  { id: 'a29', kind: 'acertijo', q: 'De «Si P entonces Q» y «no Q» se concluye:', options: ['no P (modus tollens)', 'P', 'Q', 'nada'], correct: 0 },
  { id: 'a30', kind: 'acertijo', q: 'De «Todos los A son B» y «Algunos B son C» se sigue:', options: ['Nada necesario sobre A y C', 'Todos los A son C', 'Algunos A son C', 'Ningún A es C'], correct: 0 },
  { id: 'a31', kind: 'acertijo', q: 'Dado justo, dos tiradas. P(suma = 7):', options: ['1/6', '1/12', '1/2', '1/36'], correct: 0 },
  { id: 'a32', kind: 'acertijo', q: '«Estudian → aprueban. Ana aprobó. Luego estudió.» Es:', options: ['Falacia (afirma el consecuente)', 'Válido', 'Inducción', 'Modus ponens'], correct: 0 },
  { id: 'a33', kind: 'acertijo', q: '12 monedas, una falsa ± peso. ¿Pesadas peor caso?', options: ['3', '2', '4', '6'], correct: 0 },
  { id: 'a34', kind: 'acertijo', q: 'Divisible por 3 si:', options: ['Suma de dígitos divisible por 3', 'Termina en 3', 'Es par', 'Resta dígitos = 3'], correct: 0 },
  { id: 'a35', kind: 'acertijo', q: 'K6 completo: ¿aristas?', options: ['15', '12', '30', '6'], correct: 0 },
  { id: 'a36', kind: 'acertijo', q: 'P → Q y Q → R implica:', options: ['P → R', 'R → P', 'no P', 'nada'], correct: 0 },
  { id: 'a37', kind: 'acertijo', q: '¬(P ∧ Q) equivale a:', options: ['¬P ∨ ¬Q', '¬P ∧ ¬Q', 'P ∨ Q', 'P → Q'], correct: 0 },
  { id: 'a38', kind: 'acertijo', q: 'Camino euleriano si:', options: ['0 o 2 vértices grado impar', 'Todos pares solo', 'Todos impares', 'Es completo'], correct: 0 },
  { id: 'a39', kind: 'acertijo', q: 'P(al menos un 6 en 4 tiradas) ≈', options: ['1 − (5/6)⁴ ≈ 0,52', '4/6', '1/6', '1'], correct: 0 },
  { id: 'a40', kind: 'acertijo', q: 'César +3: «KROD» es:', options: ['HOLA', 'MUNDO', 'CASA', 'SOL'], correct: 0 },
  { id: 'a41', kind: 'acertijo', q: '∀x ∃y P(x,y) vs ∃y ∀x P(x,y):', options: ['El orden de cuantificadores cambia el significado', 'Siempre equivalentes', 'Solo en finitos', 'Idénticos'], correct: 0 },
  { id: 'a42', kind: 'acertijo', q: 'Número perfecto más pequeño:', options: ['6', '8', '10', '12'], correct: 0 },
  { id: 'a43', kind: 'acertijo', q: '100 puertas / prisioneros (toggle). Abiertas:', options: ['Cuadrados perfectos', 'Pares', 'Primos', 'Todas'], correct: 0 },
  { id: 'a44', kind: 'acertijo', q: 'Inducción matemática requiere:', options: ['Base + paso inductivo', 'Solo base', 'Infinitos chequeos', 'Probabilidad'], correct: 0 },
  { id: 'a45', kind: 'acertijo', q: 'K5 todos adyacentes en el plano:', options: ['No (no planar)', 'Sí', 'Solo con islas', 'Sí si convexos'], correct: 0 },
  { id: 'a46', kind: 'acertijo', q: 'Paradoja del cumpleaños, 23 personas ≈', options: ['50%', '23%', '5%', '90%'], correct: 0 },
  { id: 'a47', kind: 'acertijo', q: 'Gödel (sistema potente y consistente):', options: ['Hay verdades no demostrables en el sistema', 'Todo es demostrable', 'Aritmética inconsistente', 'Sin axiomas'], correct: 0 },
  { id: 'a48', kind: 'acertijo', q: 'Camino hamiltoniano visita:', options: ['Cada vértice una vez', 'Cada arista una vez', 'Solo hojas', 'El centro'], correct: 0 },
  { id: 'a49', kind: 'acertijo', q: 'Bayes actualiza:', options: ['P(H|E) con prior y verosimilitud', 'Solo frecuencias', 'Solo deducción', 'Nada'], correct: 0 },
  { id: 'a50', kind: 'acertijo', q: 'Validez vs verdad en un argumento:', options: ['Validez = forma; verdad = contenido de hecho', 'Son sinónimos', 'Validez solo empírica', 'Verdad solo formal'], correct: 0 },
]

function expandBank(): Riddle[] {
  const out = [...BANK]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const b = BANK[i % BANK.length]
    out.push({
      ...b,
      id: `${b.id}-v${out.length}`,
      q: b.q + (i % 2 === 0 ? ' (piensa con calma.)' : ' (elige la más rigurosa.)'),
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}

const LEVELS = expandBank()

function pickRiddle(level: number, failed: Set<string>): Riddle {
  const pool = LEVELS.filter((r) => !failed.has(r.id))
  const use = pool.length ? pool : LEVELS
  return use[(level * 17) % use.length]
}

export function AcertijosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel],
  )
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const [level, setLevel] = useState(defaultLevel)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [riddle, setRiddle] = useState<Riddle | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  const [runMs, setRunMs] = useState(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const limit = useMemo(() => Math.max(25, TIMER_BASE - Math.floor(level / 8)), [level])
  const maxSelectable = Math.max(1, defaultLevel, ...unlocked.map((u) => u.level))

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number) => {
      clearTimers()
      const r = pickRiddle(lv, failedIds)
      setRiddle(r)
      setSelected(null)
      setIsCorrect(null)
      setLevel(lv)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(limit)
      setRunMs(0)
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              clearTimers()
              const ms = Date.now() - startRef.current
              setRunMs(ms)
              setIsCorrect(false)
              setPhase('result')
              soundFail()
              setFailedIds((prev) => new Set(prev).add(r.id))
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: ms,
              })
              return 0
            }
            return t - 1
          })
        }, 1000)
      }
    },
    [failedIds, limit, useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!riddle || isCorrect !== null) return
    soundClick()
    setSelected(idx)
    clearTimers()
    const ok = idx === riddle.correct
    setIsCorrect(ok)
    setPhase('result')
    const ms = Date.now() - startRef.current
    setRunMs(ms)
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: ok,
      timeMs: ms,
    })
    if (ok) soundSuccess()
    else {
      soundFail()
      setFailedIds((prev) => new Set(prev).add(riddle.id))
    }
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
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {phase === 'play' && useTimer && (
            <span className="mono" style={{ fontSize: '0.95rem', color: timeLeft <= 10 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)' }}>
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
          {phase !== 'setup' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
            </span>
          )}
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

      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center', marginBottom: 0 }}>🧩 Acertijos</h2>
                <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
                  Fallar cambia el acertijo. Solo los acertados fijan progreso.
                  {bestForLevel != null && bestForLevel > 0 && (
                    <>
                      {' '}
                      · 🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                    </>
                  )}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.85rem 1.1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>Activo por defecto</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      const n = !useTimer
                      soundToggle(n)
                      setUseTimer(n)
                    }}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
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
                <GlassButton onClick={() => startLevel(Math.min(level, maxSelectable))} style={{ minHeight: 48 }}>
                  Empezar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && riddle && (
          <motion.div key="play" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gco-ink-muted)', marginBottom: 8 }}>
                  {riddle.kind}
                </p>
                <p style={{ fontSize: '1.05rem', lineHeight: 1.5, marginBottom: '1.25rem', fontWeight: 500 }}>
                  {riddle.q}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {riddle.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      className="glass-button secondary"
                      style={{
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        minHeight: 48,
                        padding: '0.75rem 1rem',
                        borderColor: selected === i ? 'var(--gco-primary)' : undefined,
                      }}
                      onClick={() => submit(i)}
                    >
                      <span style={{ opacity: 0.55, marginRight: 10, fontFamily: 'var(--font-mono)' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && riddle && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.15rem', fontWeight: 700, color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)', marginBottom: 8 }}>
                  {isCorrect ? '¡Correcto!' : 'Incorrecto'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', marginBottom: 6 }}>
                  {formatDuration(runMs)}
                </p>
                {!isCorrect && (
                  <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                    Respuesta: <strong style={{ color: 'var(--gco-primary)' }}>{riddle.options[riddle.correct]}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <GlassButton onClick={() => startLevel(isCorrect ? Math.min(level + 1, TOTAL_LEVELS) : level)}>
                    {isCorrect ? 'Siguiente nivel' : 'Otro acertijo'}
                  </GlassButton>
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

export default AcertijosGame