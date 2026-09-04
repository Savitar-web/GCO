import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { getGameProgress, recordLevelResult } from '@/core/storage/progress'
import {
  soundClick,
  soundMatch,
  soundFail,
  soundSuccess,
  soundStart,
} from '@/core/audio/uiSounds'
import {
  generateReactionRound,
  formatReactionTime,
  rateReactionTime,
  getAimSessionConfig,
  generateAimTarget,
  scoreAimHit,
  aimAccuracyColor,
  summarizeAimSession,
  generateSimonLevel,
  getSimonTimeLimit,
  type AimHitResult,
  type AimSessionSummary,
  type SimonLevel,
  type SimonButtonDef,
  type SimonCustomLevel,
} from '../generateLevel'

type View =
  | 'menu'
  | 'reaccion'
  | 'punteria'
  | 'simon'
  | 'secuencia'
  | 'numero-fugaz'
  | 'memoria-posicion'

/* ── storage ─────────────────────────────────────────────────────────────── */
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

const KEYS = {
  reaction: 'gco:habilidades:reaccion',
  aim: 'gco:habilidades:punteria',
  aimKeyPrimary: 'gco:habilidades:punteria-key-primary',
  aimKeySecondary: 'gco:habilidades:punteria-key-secondary',
  simonLevel: 'gco:habilidades:simon-nivel',
  simonCustom: 'gco:habilidades:simon-creativo',
  simonActions: 'gco:habilidades:simon-acciones',
  sequenceLevel: 'gco:habilidades:secuencia-nivel',
  sequenceHistory: 'gco:habilidades:secuencia-historial',
  sequenceCellScale: 'gco:habilidades:secuencia-escala',
  flashLevel: 'gco:habilidades:numero-fugaz-nivel',
  flashHistory: 'gco:habilidades:numero-fugaz-historial',
  positionLevel: 'gco:habilidades:memoria-posicion-nivel',
  positionHistory: 'gco:habilidades:memoria-posicion-historial',
} as const

const CAT = 'memoria' as const
const GAME_ID = 'habilidades'

/* ── utilidades compartidas ─────────────────────────────────────────────── */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Nivel creativo de Simón Dice con tiempo de espera propio. */
interface CreativeSimonLevel extends SimonCustomLevel {
  timeLimitMsOverride: number
}

function buildSimonLevelFromCustom(
  custom: CreativeSimonLevel,
  level: number
): SimonLevel {
  return {
    level,
    options: shuffleArray(custom.options),
    correctId: custom.correctId,
    prompt: custom.prompt,
    timeLimitMs: custom.timeLimitMsOverride,
  }
}

function recommendSimonTime(referenceLevel: number): number {
  const raw = getSimonTimeLimit(Math.max(1, referenceLevel))
  return Math.min(2800, Math.max(1200, Math.round(raw / 50) * 50))
}

/* ── Banco masivo de acciones para Simón Dice (>120) ─────────────────────── */
const BASE_SIMON_ACTIONS: SimonButtonDef[] = [
  { id: 'aplaude', label: 'aplaude', emoji: '👏', hex: '#22E6C5' },
  { id: 'salta', label: 'salta', emoji: '🤸', hex: '#FF6B4A' },
  { id: 'saluda', label: 'saluda', emoji: '👋', hex: '#8B7CF6' },
  { id: 'gira', label: 'gira', emoji: '🔄', hex: '#F5A623' },
  { id: 'sientate', label: 'siéntate', emoji: '🪑', hex: '#4A9EFF' },
  { id: 'toca-nariz', label: 'tócate la nariz', emoji: '👃', hex: '#FF6BCB' },
  { id: 'tapa-ojos', label: 'tápate los ojos', emoji: '🙈', hex: '#A3E635' },
  { id: 'sonrie', label: 'sonríe', emoji: '😄', hex: '#FB923C' },
  { id: 'silencio', label: 'haz silencio', emoji: '🤫', hex: '#818CF8' },
  { id: 'levanta-mano', label: 'levanta la mano', emoji: '🙋', hex: '#2DD4BF' },
  { id: 'congelate', label: 'congélate', emoji: '🧊', hex: '#38BDF8' },
  { id: 'mira-arriba', label: 'mira hacia arriba', emoji: '👀', hex: '#FB7185' },
  { id: 'choca-5', label: 'choca los cinco', emoji: '🖐️', hex: '#22E6C5' },
  { id: 'pisa-fuerte', label: 'pisa fuerte', emoji: '🦶', hex: '#FF6B4A' },
  { id: 'ok', label: 'haz ok', emoji: '🤙', hex: '#8B7CF6' },
  { id: 'para', label: 'para', emoji: '✋', hex: '#F5A623' },
  { id: 'saluda-mano', label: 'saluda con la mano', emoji: '👋', hex: '#4A9EFF' },
  { id: 'aprieta-mano', label: 'aprieta la mano', emoji: '🤝', hex: '#FF6BCB' },
  { id: 'canta', label: 'canta', emoji: '🎤', hex: '#A3E635' },
  { id: 'baila', label: 'baila', emoji: '🕺', hex: '#FB923C' },
  { id: 'baila-mujer', label: 'baila suave', emoji: '💃', hex: '#818CF8' },
  { id: 'medita', label: 'medita', emoji: '🧘', hex: '#2DD4BF' },
  { id: 'corre-sitio', label: 'corre en el sitio', emoji: '🏃', hex: '#38BDF8' },
  { id: 'lanza', label: 'lanza', emoji: '🤾', hex: '#FB7185' },
  { id: 'malabarea', label: 'malabarea', emoji: '🤹', hex: '#22E6C5' },
  { id: 'palma-abajo', label: 'palma hacia abajo', emoji: '🫳', hex: '#FF6B4A' },
  { id: 'mano-derecha', label: 'mano a la derecha', emoji: '🫱', hex: '#8B7CF6' },
  { id: 'vulcano', label: 'saludo vulcaniano', emoji: '🖖', hex: '#F5A623' },
  { id: 'pinza', label: 'haz la pinza', emoji: '🤌', hex: '#4A9EFF' },
  { id: 'pulgar-arriba', label: 'pulgar arriba', emoji: '👍', hex: '#FF6BCB' },
  { id: 'pulgar-abajo', label: 'pulgar abajo', emoji: '👎', hex: '#A3E635' },
  { id: 'corazon', label: 'haz un corazón', emoji: '🫶', hex: '#FB923C' },
  { id: 'cruzate-brazos', label: 'crúzate de brazos', emoji: '🙅', hex: '#818CF8' },
  { id: 'toca-hombro', label: 'tócate el hombro', emoji: '💪', hex: '#2DD4BF' },
  { id: 'guiña', label: 'guiña un ojo', emoji: '😉', hex: '#38BDF8' },
  { id: 'bosteza', label: 'bosteza', emoji: '🥱', hex: '#FB7185' },
  { id: 'estornuda', label: 'estornuda (finge)', emoji: '🤧', hex: '#22E6C5' },
  { id: 'tose', label: 'tose (suave)', emoji: '😷', hex: '#FF6B4A' },
  { id: 'suspira', label: 'suspira', emoji: '😮‍💨', hex: '#8B7CF6' },
  { id: 'piensa', label: 'piensa', emoji: '🤔', hex: '#F5A623' },
  { id: 'celebra', label: 'celebra', emoji: '🎉', hex: '#4A9EFF' },
  { id: 'abrase', label: 'abrázate', emoji: '🤗', hex: '#FF6BCB' },
  { id: 'senala-arriba', label: 'señala arriba', emoji: '☝️', hex: '#A3E635' },
  { id: 'senala-abajo', label: 'señala abajo', emoji: '👇', hex: '#FB923C' },
  { id: 'senala-izq', label: 'señala a la izquierda', emoji: '👈', hex: '#818CF8' },
  { id: 'senala-der', label: 'señala a la derecha', emoji: '👉', hex: '#2DD4BF' },
  { id: 'cuenta-3', label: 'cuenta hasta 3', emoji: '3️⃣', hex: '#38BDF8' },
  { id: 'cierra-ojos', label: 'cierra los ojos', emoji: '😌', hex: '#FB7185' },
  { id: 'abre-boca', label: 'abre la boca', emoji: '😮', hex: '#22E6C5' },
  { id: 'saca-lengua', label: 'saca la lengua', emoji: '😛', hex: '#FF6B4A' },
  { id: 'mueve-cejas', label: 'mueve las cejas', emoji: '🤨', hex: '#8B7CF6' },
  { id: 'sopla', label: 'sopla', emoji: '🌬️', hex: '#F5A623' },
  { id: 'silba', label: 'silba', emoji: '🎵', hex: '#4A9EFF' },
  { id: 'choca-codos', label: 'choca los codos', emoji: '🦾', hex: '#FF6BCB' },
  { id: 'toca-rodilla', label: 'tócate la rodilla', emoji: '🦵', hex: '#A3E635' },
  { id: 'equilibrio', label: 'ponte en equilibrio', emoji: '⚖️', hex: '#FB923C' },
  { id: 'camina-atras', label: 'camina hacia atrás', emoji: '🔙', hex: '#818CF8' },
  { id: 'gira-cabeza', label: 'gira la cabeza', emoji: '🔄', hex: '#2DD4BF' },
  { id: 'encoge-hombros', label: 'encoge los hombros', emoji: '🤷', hex: '#38BDF8' },
  { id: 'toca-oreja', label: 'tócate la oreja', emoji: '👂', hex: '#FB7185' },
  { id: 'toca-barbilla', label: 'tócate la barbilla', emoji: '🧔', hex: '#22E6C5' },
  { id: 'cruza-piernas', label: 'cruza las piernas', emoji: '🤞', hex: '#FF6B4A' },
  { id: 'salta-1-pie', label: 'salta a un pie', emoji: '🦶', hex: '#8B7CF6' },
  { id: 'agachate', label: 'agáchate', emoji: '🙇', hex: '#F5A623' },
  { id: 'estira-brazos', label: 'estira los brazos', emoji: '🙆', hex: '#4A9EFF' },
  { id: 'manos-caderas', label: 'manos en la cadera', emoji: '🧍', hex: '#FF6BCB' },
  { id: 'toca-pies', label: 'tócate los pies', emoji: '🦶', hex: '#A3E635' },
  { id: 'mira-reloj', label: 'mira el reloj', emoji: '⌚', hex: '#FB923C' },
  { id: 'escribe-aire', label: 'escribe en el aire', emoji: '✍️', hex: '#818CF8' },
  { id: 'dibuja-circulo', label: 'dibuja un círculo', emoji: '⭕', hex: '#2DD4BF' },
  { id: 'cuenta-dedos', label: 'cuenta con los dedos', emoji: '🖐️', hex: '#38BDF8' },
  { id: 'choca-rodillas', label: 'choca las rodillas', emoji: '🦵', hex: '#FB7185' },
  { id: 'imita-avion', label: 'imita un avión', emoji: '✈️', hex: '#22E6C5' },
  { id: 'imita-robot', label: 'imita un robot', emoji: '🤖', hex: '#FF6B4A' },
  { id: 'imita-gatoo', label: 'imita un gato', emoji: '🐱', hex: '#8B7CF6' },
  { id: 'imita-perro', label: 'imita un perro', emoji: '🐶', hex: '#F5A623' },
  { id: 'imita-pajaro', label: 'imita un pájaro', emoji: '🐦', hex: '#4A9EFF' },
  { id: 'hace-ola', label: 'haz la ola', emoji: '🌊', hex: '#FF6BCB' },
  { id: 'toca-codo', label: 'tócate el codo', emoji: '💪', hex: '#A3E635' },
  { id: 'palmas-arriba', label: 'palmas hacia arriba', emoji: '🤲', hex: '#FB923C' },
  { id: 'forma-pistola', label: 'forma una pistola', emoji: '🔫', hex: '#818CF8' },
  { id: 'forma-telefono', label: 'forma un teléfono', emoji: '📞', hex: '#2DD4BF' },
  { id: 'forma-corazon-manos', label: 'corazón con las manos', emoji: '❣️', hex: '#38BDF8' },
  { id: 'toca-nuca', label: 'tócate la nuca', emoji: '🧍‍♂️', hex: '#FB7185' },
  { id: 'mira-suelo', label: 'mira al suelo', emoji: '⬇️', hex: '#22E6C5' },
  { id: 'mira-cielo', label: 'mira al cielo', emoji: '⬆️', hex: '#FF6B4A' },
  { id: 'gira-360', label: 'da una vuelta completa', emoji: '🔁', hex: '#8B7CF6' },
  { id: 'paso-lateral', label: 'da un paso lateral', emoji: '↔️', hex: '#F5A623' },
  { id: 'salta-tijera', label: 'salta en tijera', emoji: '✂️', hex: '#4A9EFF' },
  { id: 'toca-cadera', label: 'tócate la cadera', emoji: '🦴', hex: '#FF6BCB' },
  { id: 'parpadea-rapido', label: 'parpadea rápido', emoji: '👁️', hex: '#A3E635' },
  { id: 'susurra', label: 'susurra algo', emoji: '🗣️', hex: '#FB923C' },
  { id: 'grita-suave', label: 'grita suave “¡ya!”', emoji: '📢', hex: '#818CF8' },
  { id: 'cuenta-atras', label: 'cuenta atrás desde 5', emoji: '5️⃣', hex: '#2DD4BF' },
  { id: 'toca-mejilla', label: 'tócate la mejilla', emoji: '😊', hex: '#38BDF8' },
  { id: 'manos-cabeza', label: 'manos en la cabeza', emoji: '🤦', hex: '#FB7185' },
  { id: 'toca-muneca', label: 'tócate la muñeca', emoji: '⌚', hex: '#22E6C5' },
  { id: 'forma-l', label: 'forma una L', emoji: '👆', hex: '#FF6B4A' },
  { id: 'forma-v', label: 'forma una V', emoji: '✌️', hex: '#8B7CF6' },
  { id: 'forma-ok-clasico', label: 'haz el ok clásico', emoji: '👌', hex: '#F5A623' },
  { id: 'toca-frente', label: 'tócate la frente', emoji: '🧠', hex: '#4A9EFF' },
  { id: 'respira-hondo', label: 'respira hondo', emoji: '😮‍💨', hex: '#FF6BCB' },
  { id: 'sonrie-grande', label: 'sonríe muy grande', emoji: '😁', hex: '#A3E635' },
  { id: 'cara-seria', label: 'ponte serio', emoji: '😐', hex: '#FB923C' },
  { id: 'cara-sorprendida', label: 'ponte sorprendido', emoji: '😲', hex: '#818CF8' },
  { id: 'cara-enfadada', label: 'ponte enfadado (finge)', emoji: '😠', hex: '#2DD4BF' },
  { id: 'cara-triste', label: 'ponte triste (finge)', emoji: '😢', hex: '#38BDF8' },
  { id: 'saludo-militar', label: 'saludo militar', emoji: '🫡', hex: '#FB7185' },
  { id: 'toca-tobillos', label: 'tócate los tobillos', emoji: '🦶', hex: '#22E6C5' },
  { id: 'equilibrio-1-pie', label: 'equilibrio en un pie', emoji: '🦩', hex: '#FF6B4A' },
  { id: 'camina-lento', label: 'camina muy lento', emoji: '🚶', hex: '#8B7CF6' },
  { id: 'corre-rapido-sitio', label: 'corre rápido en el sitio', emoji: '🏃‍♂️', hex: '#F5A623' },
  { id: 'salta-alto', label: 'salta lo más alto', emoji: '⬆️', hex: '#4A9EFF' },
  { id: 'agacha-profundo', label: 'agáchate profundo', emoji: '🧎', hex: '#FF6BCB' },
  { id: 'estira-cuello', label: 'estira el cuello', emoji: '🦒', hex: '#A3E635' },
  { id: 'roda-hombros', label: 'roda los hombros', emoji: '🔄', hex: '#FB923C' },
  { id: 'toca-codo-izq', label: 'codo izquierdo', emoji: '💪', hex: '#818CF8' },
  { id: 'toca-codo-der', label: 'codo derecho', emoji: '💪', hex: '#2DD4BF' },
  { id: 'palma-frente', label: 'palma en la frente', emoji: '🤦‍♂️', hex: '#38BDF8' },
  { id: 'dedos-entrelazados', label: 'dedos entrelazados', emoji: '🤞', hex: '#FB7185' },
  { id: 'mano-corazon', label: 'mano en el corazón', emoji: '❤️', hex: '#22E6C5' },
  { id: 'senala-tu', label: 'señálate a ti mismo', emoji: '🫵', hex: '#FF6B4A' },
  { id: 'doble-ok', label: 'doble ok', emoji: '👌', hex: '#8B7CF6' },
  { id: 'aplauso-lento', label: 'aplauso lento', emoji: '👏', hex: '#F5A623' },
  { id: 'aplauso-rapido', label: 'aplauso rápido', emoji: '👏', hex: '#4A9EFF' },
  { id: 'chasquido', label: 'haz un chasquido', emoji: '🫰', hex: '#FF6BCB' },
  { id: 'toca-nuez', label: 'tócate la nuez', emoji: '🦴', hex: '#A3E635' },
  { id: 'mira-izquierda', label: 'mira a la izquierda', emoji: '👀', hex: '#FB923C' },
  { id: 'mira-derecha', label: 'mira a la derecha', emoji: '👀', hex: '#818CF8' },
  { id: 'cabeza-no', label: 'mueve la cabeza (no)', emoji: '🙅', hex: '#2DD4BF' },
  { id: 'cabeza-si', label: 'mueve la cabeza (sí)', emoji: '🙆', hex: '#38BDF8' },
  { id: 'bostezo-grande', label: 'bostezo grande', emoji: '🥱', hex: '#FB7185' },
  { id: 'estornudo-falso', label: 'estornudo falso', emoji: '🤧', hex: '#22E6C5' },
  { id: 'tos-suave', label: 'tos suave', emoji: '😷', hex: '#FF6B4A' },
  { id: 'suspiro-dramatico', label: 'suspiro dramático', emoji: '😮‍💨', hex: '#8B7CF6' },
  { id: 'pensativo', label: 'pon cara pensativa', emoji: '🤔', hex: '#F5A623' },
  { id: 'celebracion', label: 'celebración corta', emoji: '🥳', hex: '#4A9EFF' },
]

const ACTION_EMOJI_CHOICES = [
  '🙌', '🤸', '🙇', '👏', '🔄', '🪑', '👃', '🙈', '😄', '🤫',
  '🙋', '🧊', '👀', '🖐️', '🦶', '🤙', '✋', '👋', '🤝', '🎤',
  '🕺', '💃', '🧘', '🏃', '🤾', '🤹', '🫳', '🫱', '🖖', '🤌',
  '👍', '👎', '🫶', '💪', '😉', '🥱', '🎉', '🤗', '☝️', '👇',
  '👈', '👉', '😮', '😛', '🤨', '🎵', '⚖️', '✍️', '⭕', '🤖',
]

const ACTION_COLOR_CHOICES = [
  '#22E6C5', '#FF6B4A', '#8B7CF6', '#F5A623', '#4A9EFF', '#FF6BCB',
  '#A3E635', '#FB923C', '#818CF8', '#2DD4BF', '#FB7185', '#38BDF8',
]

/* ── raíz ────────────────────────────────────────────────────────────────── */
export function HabilidadesGame() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('menu')
  const progress = getGameProgress(CAT, GAME_ID)

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.35rem' }}>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            if (view === 'menu') navigate('/categoria/memoria')
            else setView('menu')
          }}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          ← {view === 'menu' ? 'Volver' : 'Habilidades'}
        </button>
        {view === 'menu' && (
          <>
            <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.1rem)' }}>
              ⚡ Habilidades
            </h1>
            <p
              style={{
                color: 'var(--gco-ink-muted)',
                marginTop: '0.35rem',
                fontSize: '0.92rem',
              }}
            >
              Reflejos, puntería, atención y memoria de trabajo bajo presión.
            </p>
          </>
        )}
      </header>
      <AnimatePresence mode="wait">
        {view === 'menu' && (
          <MenuHabilidades
            key="menu"
            onSelect={setView}
            progressLevel={progress.highestLevel}
          />
        )}
        {view === 'reaccion' && <ReactionGame key="reaccion" />}
        {view === 'punteria' && <AimGame key="punteria" />}
        {view === 'simon' && <SimonGame key="simon" />}
        {view === 'secuencia' && <SequenceGame key="secuencia" />}
        {view === 'numero-fugaz' && <FlashNumberGame key="numero-fugaz" />}
        {view === 'memoria-posicion' && <PositionMemoryGame key="memoria-posicion" />}
      </AnimatePresence>
    </div>
  )
}

export default HabilidadesGame

/* ── menú ────────────────────────────────────────────────────────────────── */
function MenuHabilidades({
  onSelect,
  progressLevel,
}: {
  onSelect: (v: View) => void
  progressLevel: number
}) {
  const reactionHist = loadJSON<number[]>(KEYS.reaction, [])
  const aimHist = loadJSON<AimSessionSummary[]>(KEYS.aim, [])
  const simonLevel = loadJSON<number>(KEYS.simonLevel, 1)
  const sequenceHist = loadJSON<SequenceResult[]>(KEYS.sequenceHistory, [])
  const flashHist = loadJSON<FlashResult[]>(KEYS.flashHistory, [])
  const positionHist = loadJSON<PositionResult[]>(KEYS.positionHistory, [])

  const bestReaction = reactionHist.length ? Math.min(...reactionHist) : null
  const bestAim = aimHist.length
    ? Math.max(...aimHist.map((s) => s.avgAccuracyPct))
    : null
  const cleanRuns = sequenceHist.filter((r) => r.mistakes === 0)
  const bestSequence = cleanRuns.length
    ? Math.min(...cleanRuns.map((r) => r.timeMs))
    : sequenceHist.length
      ? Math.min(...sequenceHist.map((r) => r.timeMs))
      : null
  const bestFlash = flashHist.length
    ? Math.max(...flashHist.map((r) => r.level))
    : null
  const bestPosition = positionHist.length
    ? Math.max(...positionHist.map((r) => r.level))
    : null

  const cards: Array<{
    id: View
    title: string
    emoji: string
    desc: string
    stat: string | null
  }> = [
    {
      id: 'reaccion',
      title: 'Tiempo de reacción',
      emoji: '🟢',
      desc: 'Pulsa apenas la pantalla cambie. Mide tu velocidad en milisegundos.',
      stat:
        bestReaction !== null
          ? `Mejor: ${formatReactionTime(bestReaction)}`
          : null,
    },
    {
      id: 'punteria',
      title: 'Puntería',
      emoji: '🎯',
      desc: 'Golpea el blanco lo más cerca del centro. Niveles, contrarreloj y teclado opcional.',
      stat: bestAim !== null ? `Mejor precisión: ${bestAim}%` : null,
    },
    {
      id: 'simon',
      title: 'Simón Dice',
      emoji: '🧠',
      desc: 'Lee la orden y pulsa el botón correcto antes de que se acabe el tiempo. +120 acciones.',
      stat: `Nivel ${simonLevel}`,
    },
    {
      id: 'secuencia',
      title: 'Secuencia numérica',
      emoji: '🔢',
      desc: 'Encuentra los números en orden ascendente. Cuadrícula adaptable y tamaño ajustable.',
      stat:
        bestSequence !== null
          ? `Mejor: ${formatReactionTime(bestSequence)}`
          : null,
    },
    {
      id: 'numero-fugaz',
      title: 'Número fugaz',
      emoji: '👁️',
      desc: 'Observa un número durante un instante y reescríbelo. El tiempo de observación se acorta.',
      stat: bestFlash !== null ? `Nivel máximo: ${bestFlash}` : null,
    },
    {
      id: 'memoria-posicion',
      title: 'Memoria de posición',
      emoji: '📍',
      desc: 'Memoriza qué celdas se iluminan y reprodúcelas en el mismo orden o conjunto.',
      stat: bestPosition !== null ? `Nivel máximo: ${bestPosition}` : null,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
    >
      {progressLevel > 0 && (
        <p
          className="mono"
          style={{
            color: 'var(--gco-primary)',
            fontSize: '0.8rem',
            marginBottom: '0.15rem',
          }}
        >
          Nivel general {progressLevel}
        </p>
      )}
      {cards.map((game, i) => (
        <motion.div
          key={game.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          <GlassCard
            onClick={() => {
              soundClick()
              onSelect(game.id)
            }}
          >
            <div
              style={{
                padding: '1.15rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '1.75rem' }}>{game.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>
                  {game.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.35,
                  }}
                >
                  {game.desc}
                </p>
                {game.stat && (
                  <p
                    className="mono"
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gco-primary)',
                      marginTop: '0.35rem',
                    }}
                  >
                    {game.stat}
                  </p>
                )}
              </div>
              <span
                style={{ color: 'var(--gco-ink-faint)', fontSize: '1.25rem' }}
              >
                →
              </span>
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── Tiempo de reacción ──────────────────────────────────────────────────── */
type ReactionState = 'idle' | 'esperando' | 'listo' | 'muy-pronto' | 'resultado'

function ReactionGame() {
  const [state, setState] = useState<ReactionState>('idle')
  const [round, setRound] = useState(1)
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>(() =>
    loadJSON(KEYS.reaction, [])
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyAtRef = useRef(0)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const startRound = useCallback(() => {
    soundStart()
    setState('esperando')
    const r = generateReactionRound(round, Date.now())
    timeoutRef.current = setTimeout(() => {
      readyAtRef.current = performance.now()
      setState('listo')
    }, r.delayMs)
  }, [round])

  const handleTap = useCallback(() => {
    if (state === 'idle' || state === 'resultado' || state === 'muy-pronto') {
      startRound()
      return
    }
    if (state === 'esperando') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      soundFail()
      setState('muy-pronto')
      return
    }
    if (state === 'listo') {
      const elapsed = performance.now() - readyAtRef.current
      soundMatch()
      setLastTime(elapsed)
      setState('resultado')
      setRound((r) => r + 1)
      const next = [elapsed, ...history]
      setHistory(next)
      saveJSON(KEYS.reaction, next)
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: Math.max(1, Math.floor(1000 / Math.max(elapsed, 80))),
          success: true,
          timeMs: elapsed,
        })
      } catch {
        /* */
      }
    }
  }, [state, startRound, history])

  const rating = lastTime !== null ? rateReactionTime(lastTime) : null
  const best = history.length ? Math.min(...history) : null
  const avg = history.length
    ? history.reduce((s, v) => s + v, 0) / history.length
    : null

  const zoneBg: Record<ReactionState, string> = {
    idle: 'var(--gco-glass-bg)',
    esperando: 'var(--gco-secondary-dim)',
    listo: 'var(--gco-primary)',
    'muy-pronto': 'var(--gco-secondary-dim)',
    resultado: 'var(--gco-glass-bg)',
  }
  const zoneFg: Record<ReactionState, string> = {
    idle: 'var(--gco-ink)',
    esperando: 'var(--gco-ink)',
    listo: 'var(--gco-button-text)',
    'muy-pronto': 'var(--gco-ink)',
    resultado: 'var(--gco-ink)',
  }
  const message: Record<ReactionState, string> = {
    idle: 'Toca para empezar',
    esperando: 'Espera a que cambie de color',
    listo: '¡AHORA! Toca ya',
    'muy-pronto': 'Muy pronto · Toca para reintentar',
    resultado: 'Toca para otra ronda',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>
            🟢 Tiempo de reacción
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            Ronda {round} · Toca apenas cambie el color.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleTap}
        style={{
          width: '100%',
          minHeight: '46vh',
          border: '1px solid var(--gco-glass-border)',
          borderRadius: 'var(--gco-radius)',
          background: zoneBg[state],
          color: zoneFg[state],
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          cursor: 'pointer',
          transition: 'background 0.12s ease, color 0.12s ease',
          boxShadow: 'var(--gco-shadow)',
          font: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {state === 'resultado' && lastTime !== null ? (
          <>
            <span
              className="mono"
              style={{
                fontSize: 'clamp(2rem, 8vw, 3rem)',
                fontWeight: 700,
              }}
            >
              {formatReactionTime(lastTime)}
            </span>
            {rating && (
              <span style={{ fontSize: '0.95rem', opacity: 0.9 }}>
                {rating.label}
              </span>
            )}
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                marginTop: 4,
              }}
            >
              {message.resultado}
            </span>
          </>
        ) : (
          <span
            style={{
              fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
              fontWeight: 600,
              textAlign: 'center',
              padding: '0 1rem',
            }}
          >
            {message[state]}
          </span>
        )}
      </button>
      {history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.7rem',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
              >
                Mejor:{' '}
                <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                  {best !== null ? formatReactionTime(best) : '—'}
                </span>
              </span>
              <span
                style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
              >
                Promedio:{' '}
                <span className="mono">
                  {avg !== null ? formatReactionTime(avg) : '—'}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color: 'var(--gco-ink)',
                  }}
                >
                  {formatReactionTime(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Puntería (con niveles, contrarreloj y teclado Z/X) ──────────────────── */
function AimGame() {
  const [level, setLevel] = useState(1)
  const config = useMemo(() => getAimSessionConfig(level), [level])
  // Más blancos según nivel
  const totalTargets = Math.min(8 + level * 2, 28)
  const sessionTimeLimit = Math.max(18, 45 - level) // segundos, se endurece

  const [phase, setPhase] = useState<'listo' | 'jugando' | 'resumen'>('listo')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<ReturnType<typeof generateAimTarget> | null>(null)
  const [results, setResults] = useState<AimHitResult[]>([])
  const [lastFeedback, setLastFeedback] = useState<{
    accuracy: number
    hit: boolean
  } | null>(null)
  const [timeLeft, setTimeLeft] = useState(sessionTimeLimit)
  const spawnAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number }>({ x: 50, y: 50 })
  const [history, setHistory] = useState<AimSessionSummary[]>(() =>
    loadJSON(KEYS.aim, [])
  )
  const [summary, setSummary] = useState<AimSessionSummary | null>(null)

  // Teclas configurables (por defecto z y x)
  const [keyPrimary, setKeyPrimary] = useState(() =>
    loadJSON(KEYS.aimKeyPrimary, 'z')
  )
  const [keySecondary, setKeySecondary] = useState(() =>
    loadJSON(KEYS.aimKeySecondary, 'x')
  )
  const [assigningKey, setAssigningKey] = useState<'primary' | 'secondary' | null>(null)
  const isDesktop =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches

  const spawnNext = useCallback(
    (i: number) => {
      const t = generateAimTarget(i, level, config, Date.now() + i)
      setTarget(t)
      spawnAtRef.current = performance.now()
    },
    [config, level]
  )

  const finishSession = useCallback(
    (nextResults: AimHitResult[], timedOut: boolean) => {
      const totalTimeMs = performance.now() - startedAtRef.current
      const s = summarizeAimSession(nextResults, totalTimeMs)
      setSummary(s)
      const nextHist = [s, ...history]
      setHistory(nextHist)
      saveJSON(KEYS.aim, nextHist)
      setTarget(null)
      setPhase('resumen')
      if (!timedOut && s.hits > s.misses) {
        setLevel((l) => l + 1)
      }
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: Math.max(1, Math.round(s.avgAccuracyPct / 10)),
          success: s.hits > s.misses,
          timeMs: s.avgReactionMs,
        })
      } catch {
        /* */
      }
    },
    [history]
  )

  const registerHit = useCallback(
    (clientX: number, clientY: number) => {
      if (phase !== 'jugando' || !target || !areaRef.current) return
      const rect = areaRef.current.getBoundingClientRect()
      const clickX = ((clientX - rect.left) / rect.width) * 100
      const clickY = ((clientY - rect.top) / rect.height) * 100
      const dxPct = clickX - target.x
      const dyPct = clickY - target.y
      const distPx = Math.sqrt(dxPct * dxPct + dyPct * dyPct) * (rect.width / 100)
      const hit = distPx <= target.radius * 1.15
      const accuracy = hit ? scoreAimHit(distPx, target.radius) : 0
      const reactionMs = performance.now() - spawnAtRef.current
      if (hit) soundMatch()
      else soundFail()
      const result: AimHitResult = {
        targetId: target.id,
        hit,
        distanceFromCenterPx: distPx,
        accuracyPct: accuracy,
        reactionMs,
      }
      setLastFeedback({ accuracy, hit })
      const nextResults = [...results, result]
      setResults(nextResults)
      const nextIndex = index + 1
      if (nextIndex >= totalTargets) {
        finishSession(nextResults, false)
      } else {
        setIndex(nextIndex)
        spawnNext(nextIndex)
      }
    },
    [phase, target, results, index, totalTargets, spawnNext, finishSession]
  )

  const start = () => {
    soundStart()
    setResults([])
    setSummary(null)
    setLastFeedback(null)
    setIndex(0)
    setTimeLeft(sessionTimeLimit)
    startedAtRef.current = performance.now()
    setPhase('jugando')
    spawnNext(0)
  }

  // Ratón / touch
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    registerHit(e.clientX, e.clientY)
  }

  // Seguimiento del puntero para el teclado
  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    pointerRef.current = {
      x: e.clientX,
      y: e.clientY,
    }
  }

  // Teclado (Z / X o teclas asignadas)
  useEffect(() => {
    if (phase !== 'jugando') return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === keyPrimary.toLowerCase() || k === keySecondary.toLowerCase()) {
        e.preventDefault()
        // Usa la última posición conocida del puntero
        registerHit(pointerRef.current.x, pointerRef.current.y)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, keyPrimary, keySecondary, registerHit])

  // Contrarreloj de sesión
  useEffect(() => {
    if (phase !== 'jugando') return
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id)
          finishSession(results, true)
          soundFail()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Asignación de teclas
  useEffect(() => {
    if (!assigningKey) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (assigningKey === 'primary') {
        setKeyPrimary(k)
        saveJSON(KEYS.aimKeyPrimary, k)
      } else {
        setKeySecondary(k)
        saveJSON(KEYS.aimKeySecondary, k)
      }
      setAssigningKey(null)
      soundSuccess()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assigningKey])

  const display = summary ?? history[0] ?? null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>🎯 Puntería</h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · {totalTargets} blancos
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            {phase === 'jugando'
              ? `Blanco ${index + 1} de ${totalTargets} · ⏱ ${timeLeft}s`
              : 'Golpea el centro del blanco. En PC puedes usar teclas además del ratón.'}
          </p>
        </div>
      </div>

      {/* Controles de teclado (solo escritorio) */}
      {isDesktop && phase !== 'jugando' && (
        <div className="glass-card" style={{ marginBottom: '1rem' }}>
          <div style={{ padding: '0.95rem 1.15rem' }}>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: '0.65rem',
              }}
            >
              Teclas de disparo (opcional). El clic se registra donde esté el
              puntero del ratón.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                onClick={() => {
                  soundClick()
                  setAssigningKey('primary')
                }}
              >
                {assigningKey === 'primary'
                  ? 'Pulsa una tecla…'
                  : `Primaria: ${keyPrimary.toUpperCase()}`}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                onClick={() => {
                  soundClick()
                  setAssigningKey('secondary')
                }}
              >
                {assigningKey === 'secondary'
                  ? 'Pulsa una tecla…'
                  : `Secundaria: ${keySecondary.toUpperCase()}`}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                onClick={() => {
                  soundClick()
                  setKeyPrimary('z')
                  setKeySecondary('x')
                  saveJSON(KEYS.aimKeyPrimary, 'z')
                  saveJSON(KEYS.aimKeySecondary, 'x')
                }}
              >
                Restablecer Z / X
              </button>
            </div>
          </div>
        </div>
      )}

      {phase !== 'jugando' && (
        <div className="glass-card">
          <div style={{ padding: '1.85rem 1.5rem', textAlign: 'center' }}>
            {phase === 'resumen' && display && (
              <>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1.15rem',
                  }}
                >
                  Resultado de la ronda · Nivel {level}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    rowGap: '1.35rem',
                    columnGap: '1.5rem',
                    marginBottom: '1.5rem',
                    textAlign: 'left',
                  }}
                >
                  <Stat
                    label="Aciertos"
                    value={`${display.hits}/${display.totalTargets}`}
                  />
                  <Stat label="Fallos" value={`${display.misses}`} />
                  <Stat
                    label="Precisión media"
                    value={`${display.avgAccuracyPct}%`}
                  />
                  <Stat
                    label="Reacción media"
                    value={formatReactionTime(display.avgReactionMs)}
                  />
                  <Stat
                    label="Mejor click"
                    value={formatReactionTime(display.bestReactionMs)}
                  />
                  <Stat
                    label="Tiempo total"
                    value={formatReactionTime(display.totalTimeMs)}
                  />
                </div>
              </>
            )}
            <button
              type="button"
              className="glass-button"
              onClick={start}
              style={{ width: '100%' }}
            >
              {phase === 'resumen' ? 'Siguiente / Repetir' : 'Comenzar'}
            </button>
          </div>
        </div>
      )}

      {phase === 'jugando' && (
        <div
          ref={areaRef}
          onClick={handleClick}
          onMouseMove={handlePointerMove}
          style={{
            position: 'relative',
            width: '100%',
            height: '52vh',
            minHeight: 320,
            borderRadius: 'var(--gco-radius)',
            background: 'var(--gco-glass-bg)',
            border: '1px solid var(--gco-glass-border)',
            overflow: 'hidden',
            cursor: 'crosshair',
            boxShadow: 'var(--gco-shadow)',
            touchAction: 'manipulation',
          }}
        >
          {/* Barra de tiempo */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'var(--gco-glass-border)',
              zIndex: 2,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(timeLeft / sessionTimeLimit) * 100}%`,
                background:
                  timeLeft > 8 ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                transition: 'width 1s linear',
              }}
            />
          </div>
          {target && (
            <div
              key={target.id}
              style={{
                position: 'absolute',
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: target.radius * 2,
                height: target.radius * 2,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, #22E6C5 0%, #A3E635 45%, #F5A623 72%, #FF6B4A 100%)',
                boxShadow:
                  '0 0 0 3px rgba(255,255,255,0.14), var(--gco-shadow)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}
      {lastFeedback && phase !== 'jugando' && (
        <p
          className="mono"
          style={{
            marginTop: '0.85rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: lastFeedback.hit
              ? aimAccuracyColor(lastFeedback.accuracy)
              : 'var(--gco-secondary)',
          }}
        >
          Último click:{' '}
          {lastFeedback.hit
            ? `${lastFeedback.accuracy}% de precisión`
            : 'fallo'}
        </p>
      )}
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: '0.72rem',
          color: 'var(--gco-ink-faint)',
          marginBottom: 5,
          lineHeight: 1.3,
        }}
      >
        {label}
      </p>
      <p
        className="mono"
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--gco-ink)',
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {value}
      </p>
    </div>
  )
}

/* ── Simón Dice (con menú previo + banco grande + creativo completo) ─────── */
type SimonPhase = 'lectura' | 'esperando' | 'acierto' | 'fallo' | 'tiempo'
type SimonScreen = 'menu' | 'jugar' | 'creativo'

function SimonGame() {
  const [screen, setScreen] = useState<SimonScreen>('menu')

  const [unlockedLevel, setUnlockedLevel] = useState<number>(() =>
    loadJSON(KEYS.simonLevel, 1)
  )
  const [playingLevel, setPlayingLevel] = useState<number>(unlockedLevel)

  const [current, setCurrent] = useState<SimonLevel | null>(null)
  const [phase, setPhase] = useState<SimonPhase>('lectura')
  const [msLeft, setMsLeft] = useState(0)
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const [directLevel, setDirectLevel] = useState<CreativeSimonLevel | null>(null)

  const [customActions, setCustomActions] = useState<SimonButtonDef[]>(() =>
    loadJSON(KEYS.simonActions, [])
  )
  const [customLevels, setCustomLevels] = useState<CreativeSimonLevel[]>(() =>
    loadJSON(KEYS.simonCustom, [])
  )

  const pool = useMemo(
    () => [...BASE_SIMON_ACTIONS, ...customActions],
    [customActions]
  )

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)

  const loadLevel = useCallback(
    (lvl: number) => {
      setDirectLevel(null)
      const useCustom = customLevels.length > 0 && lvl % 4 === 0
      const next = useCustom
        ? buildSimonLevelFromCustom(
            customLevels[Math.floor(Math.random() * customLevels.length)],
            lvl
          )
        : generateSimonLevel(lvl, pool)
      setCurrent(next)
      setPhase('lectura')
      setMsLeft(next.timeLimitMs)
      setLastElapsedMs(null)
    },
    [customLevels, pool]
  )

  const playCustomLevel = useCallback(
    (lvl: CreativeSimonLevel) => {
      soundClick()
      setScreen('jugar')
      setDirectLevel(lvl)
      const built = buildSimonLevelFromCustom(lvl, playingLevel)
      setCurrent(built)
      setPhase('lectura')
      setMsLeft(built.timeLimitMs)
      setLastElapsedMs(null)
    },
    [playingLevel]
  )

  const startPlaying = (lvl?: number) => {
    soundStart()
    const target = lvl ?? unlockedLevel
    setPlayingLevel(target)
    setScreen('jugar')
    loadLevel(target)
  }

  useEffect(() => {
    if (screen !== 'jugar') return
    if (phase !== 'lectura') return
    const t = window.setTimeout(() => {
      startedAtRef.current = performance.now()
      setPhase('esperando')
    }, 550)
    return () => window.clearTimeout(t)
  }, [phase, current, screen])

  useEffect(() => {
    if (screen !== 'jugar' || phase !== 'esperando' || !current) return
    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current
      const remaining = current.timeLimitMs - elapsed
      if (remaining <= 0) {
        setMsLeft(0)
        setPhase('tiempo')
        soundFail()
        if (tickRef.current) clearInterval(tickRef.current)
      } else {
        setMsLeft(remaining)
      }
    }, 40)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [phase, current, screen])

  const press = (id: string) => {
    if (phase !== 'esperando' || !current) return
    if (tickRef.current) clearInterval(tickRef.current)
    const elapsed = performance.now() - startedAtRef.current
    setLastElapsedMs(elapsed)

    if (id === current.correctId) {
      soundSuccess()
      setPhase('acierto')

      if (directLevel) {
        window.setTimeout(() => playCustomLevel(directLevel), 900)
        return
      }

      const nextLevel = playingLevel + 1
      setPlayingLevel(nextLevel)
      if (nextLevel > unlockedLevel) {
        setUnlockedLevel(nextLevel)
        saveJSON(KEYS.simonLevel, nextLevel)
      }
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: nextLevel,
          success: true,
          timeMs: elapsed,
        })
      } catch {
        /* */
      }
      window.setTimeout(() => loadLevel(nextLevel), 900)
    } else {
      soundFail()
      setPhase('fallo')
    }
  }

  const retry = () => {
    soundClick()
    if (directLevel) playCustomLevel(directLevel)
    else loadLevel(playingLevel)
  }

  const goToUnlocked = () => {
    soundClick()
    setPlayingLevel(unlockedLevel)
    loadLevel(unlockedLevel)
  }

  const exitPractice = () => {
    soundClick()
    loadLevel(playingLevel)
  }

  const jumpToLevel = (lvl: number) => {
    soundClick()
    setPlayingLevel(lvl)
    loadLevel(lvl)
    setShowLevelPicker(false)
  }

  const timePct = current
    ? Math.max(0, Math.min(100, (msLeft / current.timeLimitMs) * 100))
    : 0

  const recommendedTimeMs = useMemo(
    () => recommendSimonTime(unlockedLevel),
    [unlockedLevel]
  )

  // ——— Pantalla de menú de Simón ———
  if (screen === 'menu') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="glass-card" style={{ marginBottom: '1rem' }}>
          <div style={{ padding: '1.25rem 1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
              🧠 Simón Dice
            </h2>
            <p
              style={{
                fontSize: '0.88rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.45,
                marginBottom: '1.1rem',
              }}
            >
              Lee la orden y pulsa el botón correcto antes de que se acabe el
              tiempo. Hay más de 120 acciones distintas y puedes crear las tuyas.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.7rem',
              }}
            >
              <button
                type="button"
                className="glass-button"
                style={{ width: '100%', minHeight: 48 }}
                onClick={() => startPlaying()}
              >
                Jugar · Nivel {unlockedLevel}
              </button>
              <button
                type="button"
                className="glass-button secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  soundClick()
                  setScreen('creativo')
                }}
              >
                Modo creativo
              </button>
              {unlockedLevel > 1 && (
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    soundClick()
                    setShowLevelPicker((v) => !v)
                  }}
                >
                  {showLevelPicker ? 'Ocultar niveles' : 'Elegir nivel pasado'}
                </button>
              )}
            </div>
            {showLevelPicker && (
              <SimonLevelPicker
                unlockedLevel={unlockedLevel}
                currentLevel={playingLevel}
                onSelect={(lvl) => {
                  setShowLevelPicker(false)
                  startPlaying(lvl)
                }}
              />
            )}
            <p
              className="mono"
              style={{
                fontSize: '0.75rem',
                color: 'var(--gco-primary)',
                marginTop: '1rem',
                textAlign: 'center',
              }}
            >
              {pool.length} acciones disponibles · {customLevels.length} niveles
              creativos
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.7rem',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>🧠 Simón Dice</h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              {directLevel ? 'Práctica libre' : `Nivel ${playingLevel}`}
            </span>
          </div>
          <div className="segmented" style={{ marginBottom: '0.6rem' }}>
            <button
              type="button"
              className={screen === 'jugar' ? 'active' : ''}
              onClick={() => {
                soundClick()
                setScreen('jugar')
                if (!current) loadLevel(playingLevel)
              }}
            >
              Jugar
            </button>
            <button
              type="button"
              className={screen === 'creativo' ? 'active' : ''}
              onClick={() => {
                soundClick()
                setScreen('creativo')
              }}
            >
              Modo creativo
            </button>
          </div>
          {screen === 'jugar' && !directLevel && (
            <>
              <button
                type="button"
                className="glass-button secondary"
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.8rem',
                  width: '100%',
                }}
                onClick={() => {
                  soundClick()
                  setShowLevelPicker((v) => !v)
                }}
              >
                {showLevelPicker ? 'Ocultar niveles' : 'Elegir nivel pasado'}
              </button>
              {showLevelPicker && (
                <SimonLevelPicker
                  unlockedLevel={unlockedLevel}
                  currentLevel={playingLevel}
                  onSelect={jumpToLevel}
                />
              )}
            </>
          )}
          {screen === 'jugar' && directLevel && (
            <button
              type="button"
              className="glass-button secondary"
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.8rem',
                width: '100%',
              }}
              onClick={exitPractice}
            >
              Volver a mi progresión (nivel {playingLevel})
            </button>
          )}
        </div>
      </div>

      {screen === 'jugar' && current && (
        <div className="glass-card">
          <div style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-ink-faint)',
                marginBottom: '0.5rem',
              }}
            >
              {phase === 'lectura'
                ? 'Prepárate…'
                : phase === 'esperando'
                  ? 'Encuentra el botón correcto'
                  : phase === 'acierto'
                    ? '¡Correcto!'
                    : 'Resultado'}
            </p>
            <h3
              style={{
                fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
                marginBottom: '1.1rem',
                color:
                  phase === 'fallo' || phase === 'tiempo'
                    ? 'var(--gco-secondary)'
                    : phase === 'acierto'
                      ? 'var(--gco-primary)'
                      : 'var(--gco-ink)',
              }}
            >
              {phase === 'fallo'
                ? '¡Botón incorrecto!'
                : phase === 'tiempo'
                  ? '¡Se acabó el tiempo!'
                  : phase === 'acierto'
                    ? directLevel
                      ? '¡Bien hecho! Repitiendo…'
                      : 'Siguiente nivel…'
                    : current.prompt}
            </h3>
            {phase === 'esperando' && (
              <div
                style={{
                  height: 6,
                  borderRadius: 6,
                  background: 'var(--gco-glass-border)',
                  overflow: 'hidden',
                  marginBottom: '1.3rem',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${timePct}%`,
                    background:
                      timePct > 40
                        ? 'var(--gco-primary)'
                        : 'var(--gco-secondary)',
                    transition: 'width 0.04s linear',
                    borderRadius: 6,
                  }}
                />
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.85rem',
              }}
            >
              {current.options.map((btn) => {
                const reveal =
                  (phase === 'acierto' ||
                    phase === 'fallo' ||
                    phase === 'tiempo') &&
                  btn.id === current.correctId
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => press(btn.id)}
                    disabled={phase !== 'esperando'}
                    style={{
                      minHeight: 84,
                      borderRadius: 'var(--gco-radius-sm)',
                      border: reveal
                        ? `1.5px solid ${btn.hex}`
                        : '1px solid var(--gco-glass-border)',
                      background: reveal
                        ? `${btn.hex}33`
                        : 'var(--gco-glass-bg)',
                      color: 'var(--gco-ink)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      cursor: phase === 'esperando' ? 'pointer' : 'default',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-body)',
                      opacity: phase === 'esperando' || reveal ? 1 : 0.75,
                      transition:
                        'background 0.15s ease, border-color 0.15s ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{ fontSize: '1.6rem' }}>{btn.emoji}</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {btn.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {lastElapsedMs !== null &&
              (phase === 'acierto' || phase === 'fallo' || phase === 'tiempo') && (
                <p
                  className="mono"
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.82rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  Tardaste {formatReactionTime(lastElapsedMs)}
                </p>
              )}

            {(phase === 'fallo' || phase === 'tiempo') && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  marginTop: '1.3rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ flex: 1, minWidth: 120 }}
                  onClick={retry}
                >
                  Repetir nivel
                </button>
                {directLevel ? (
                  <button
                    type="button"
                    className="glass-button"
                    style={{ flex: 1, minWidth: 120 }}
                    onClick={exitPractice}
                  >
                    Salir de práctica
                  </button>
                ) : (
                  playingLevel !== unlockedLevel && (
                    <button
                      type="button"
                      className="glass-button"
                      style={{ flex: 1, minWidth: 120 }}
                      onClick={goToUnlocked}
                    >
                      Ir a mi nivel más alto
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'creativo' && (
        <SimonCreativeEditor
          pool={pool}
          customActions={customActions}
          onChangeActions={(list) => {
            setCustomActions(list)
            saveJSON(KEYS.simonActions, list)
          }}
          customLevels={customLevels}
          onChangeLevels={(list) => {
            setCustomLevels(list)
            saveJSON(KEYS.simonCustom, list)
          }}
          recommendedTimeMs={recommendedTimeMs}
          onPlayLevel={playCustomLevel}
        />
      )}
    </motion.div>
  )
}

function SimonLevelPicker({
  unlockedLevel,
  currentLevel,
  onSelect,
}: {
  unlockedLevel: number
  currentLevel: number
  onSelect: (lvl: number) => void
}) {
  const levels = Array.from({ length: unlockedLevel }, (_, i) => i + 1)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginTop: '0.9rem',
        maxHeight: 168,
        overflowY: 'auto',
        paddingRight: 2,
      }}
    >
      {levels.map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onSelect(lvl)}
          className="mono"
          style={{
            minWidth: 42,
            padding: '0.45rem 0.6rem',
            borderRadius: 999,
            border:
              lvl === currentLevel
                ? '1.5px solid var(--gco-primary)'
                : '1px solid var(--gco-glass-border)',
            background:
              lvl === currentLevel
                ? 'var(--gco-primary-dim)'
                : 'var(--gco-glass-bg)',
            color:
              lvl === currentLevel ? 'var(--gco-primary)' : 'var(--gco-ink)',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {lvl}
        </button>
      ))}
    </div>
  )
}

/* ── Simón Dice · modo creativo completo ─────────────────────────────────── */
function SimonCreativeEditor({
  pool,
  customActions,
  onChangeActions,
  customLevels,
  onChangeLevels,
  recommendedTimeMs,
  onPlayLevel,
}: {
  pool: SimonButtonDef[]
  customActions: SimonButtonDef[]
  onChangeActions: (list: SimonButtonDef[]) => void
  customLevels: CreativeSimonLevel[]
  onChangeLevels: (list: CreativeSimonLevel[]) => void
  recommendedTimeMs: number
  onPlayLevel: (lvl: CreativeSimonLevel) => void
}) {
  const [selected, setSelected] = useState<SimonButtonDef[]>(pool.slice(0, 4))
  const [correctId, setCorrectId] = useState(pool[0]?.id ?? '')
  const [customPrompt, setCustomPrompt] = useState('')
  const [timeLimitMs, setTimeLimitMs] = useState(recommendedTimeMs)
  const [msg, setMsg] = useState('')

  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState(ACTION_EMOJI_CHOICES[0])
  const [newColor, setNewColor] = useState(ACTION_COLOR_CHOICES[0])
  const [actionMsg, setActionMsg] = useState('')

  const toggleButton = (btn: SimonButtonDef) => {
    soundClick()
    const exists = selected.some((b) => b.id === btn.id)
    if (exists) {
      if (selected.length <= 4) return
      const next = selected.filter((b) => b.id !== btn.id)
      setSelected(next)
      if (correctId === btn.id && next[0]) setCorrectId(next[0].id)
    } else {
      if (selected.length >= 4) {
        const next = [...selected.slice(0, 3), btn]
        setSelected(next)
        return
      }
      setSelected([...selected, btn])
    }
  }

  const addAction = () => {
    const label = newLabel.trim().toLowerCase()
    if (!label) {
      soundFail()
      setActionMsg('Escribe el nombre de la nueva acción')
      return
    }
    if (pool.some((b) => b.label.toLowerCase() === label)) {
      soundFail()
      setActionMsg('Ya existe una acción con ese nombre')
      return
    }
    const action: SimonButtonDef = {
      id: `custom-action-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      label,
      emoji: newEmoji,
      hex: newColor,
    }
    onChangeActions([...customActions, action])
    setNewLabel('')
    soundSuccess()
    setActionMsg('Acción añadida: ya aparece en el juego normal')
    window.setTimeout(() => setActionMsg(''), 2200)
  }

  const removeAction = (id: string) => {
    soundClick()
    onChangeActions(customActions.filter((a) => a.id !== id))
    setSelected((prev) => prev.filter((b) => b.id !== id))
  }

  const save = () => {
    if (selected.length !== 4 || !selected.some((b) => b.id === correctId)) {
      soundFail()
      setMsg('Necesitas 4 acciones y una acción correcta válida')
      return
    }
    const correctBtn = selected.find((b) => b.id === correctId)!
    const promptText =
      customPrompt.trim() ||
      `Simón dice: ${correctBtn.label}`
    const level: CreativeSimonLevel = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      prompt: promptText,
      correctId,
      options: selected,
      createdAt: Date.now(),
      timeLimitMsOverride: timeLimitMs,
    }
    onChangeLevels([level, ...customLevels].slice(0, 50))
    soundSuccess()
    setMsg('Nivel guardado. Puedes jugarlo cuando quieras.')
    setCustomPrompt('')
    window.setTimeout(() => setMsg(''), 2200)
  }

  const removeLevel = (id: string) => {
    soundClick()
    onChangeLevels(customLevels.filter((l) => l.id !== id))
  }

  const timePresets: Array<{ label: string; ms: number }> = [
    { label: 'Fácil', ms: 3200 },
    { label: 'Prudente', ms: recommendedTimeMs },
    { label: 'Difícil', ms: 1500 },
    { label: 'Extremo', ms: 950 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-card">
        <div style={{ padding: '1.25rem 1.25rem' }}>
          <p className="more-section-title">Elige 4 acciones para la ronda</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.55rem',
              marginBottom: '1.2rem',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {pool.map((btn) => {
              const isSelected = selected.some((b) => b.id === btn.id)
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => toggleButton(btn)}
                  style={{
                    padding: '0.55rem 0.4rem',
                    borderRadius: 'var(--gco-radius-xs)',
                    border: isSelected
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                    background: isSelected
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                    color: 'var(--gco-ink)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontFamily: 'var(--font-body)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{btn.emoji}</span>
                  {btn.label}
                </button>
              )
            })}
          </div>

          <p className="more-section-title">¿Cuál es la acción correcta?</p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            {selected.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setCorrectId(btn.id)
                }}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: 999,
                  border:
                    correctId === btn.id
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background:
                    correctId === btn.id
                      ? 'var(--gco-primary-dim)'
                      : 'transparent',
                  color: 'var(--gco-ink)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {btn.emoji} {btn.label}
              </button>
            ))}
          </div>

          <label className="more-field-label">
            Texto de la pregunta (opcional)
          </label>
          <input
            className="glass-input"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={
              correctId
                ? `Simón dice: ${selected.find((b) => b.id === correctId)?.label ?? ''}`
                : 'Simón dice: …'
            }
            style={{ marginBottom: '1.1rem' }}
          />
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: '1.3rem',
            }}
          >
            El jugador verá exactamente el texto que escribas (o el automático
            si lo dejas vacío). Tú eliges cuál de los 4 botones es la respuesta
            correcta.
          </p>

          <p className="more-section-title">Tiempo para responder</p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '0.7rem',
              flexWrap: 'wrap',
            }}
          >
            {timePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="glass-button secondary"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  flex: '1 1 auto',
                }}
                onClick={() => {
                  soundClick()
                  setTimeLimitMs(p.ms)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={900}
            max={4000}
            step={50}
            value={timeLimitMs}
            onChange={(e) => setTimeLimitMs(Number(e.target.value))}
            className="pref-slider"
            style={
              {
                '--fill': `${((timeLimitMs - 900) / (4000 - 900)) * 100}%`,
              } as unknown as React.CSSProperties
            }
          />
          <p
            className="mono"
            style={{
              fontSize: '0.78rem',
              color: 'var(--gco-primary)',
              marginTop: '0.5rem',
              marginBottom: '0.3rem',
            }}
          >
            {formatReactionTime(timeLimitMs)}
          </p>
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--gco-ink-faint)',
              marginBottom: '1.3rem',
              lineHeight: 1.4,
            }}
          >
            Recomendado: {formatReactionTime(recommendedTimeMs)} según tu nivel
            actual.
          </p>

          <button
            type="button"
            className="glass-button"
            style={{ width: '100%' }}
            onClick={save}
          >
            Guardar nivel creativo
          </button>
          {msg && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-primary)',
                marginTop: '0.6rem',
                textAlign: 'center',
              }}
            >
              {msg}
            </p>
          )}
        </div>
      </div>

      <div className="glass-card">
        <div style={{ padding: '1.25rem 1.25rem' }}>
          <p className="more-section-title">Crear una nueva acción</p>
          <label className="more-field-label">Nombre de la acción</label>
          <input
            className="glass-input"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="p. ej. den una vuelta"
            style={{ marginBottom: '1rem' }}
          />
          <label className="more-field-label">Emoji</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '0.4rem',
              marginBottom: '1rem',
            }}
          >
            {ACTION_EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  soundClick()
                  setNewEmoji(emoji)
                }}
                style={{
                  height: 40,
                  borderRadius: 'var(--gco-radius-xs)',
                  border:
                    newEmoji === emoji
                      ? '1.5px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background:
                    newEmoji === emoji
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                  fontSize: '1.15rem',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label className="more-field-label">Color</label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1.2rem',
            }}
          >
            {ACTION_COLOR_CHOICES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  soundClick()
                  setNewColor(hex)
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: hex,
                  border:
                    newColor === hex
                      ? '3px solid var(--gco-ink)'
                      : '1px solid var(--gco-glass-border)',
                  cursor: 'pointer',
                }}
                aria-label={hex}
              />
            ))}
          </div>
          <button
            type="button"
            className="glass-button secondary"
            style={{ width: '100%' }}
            onClick={addAction}
          >
            Añadir acción
          </button>
          {actionMsg && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-primary)',
                marginTop: '0.6rem',
                textAlign: 'center',
              }}
            >
              {actionMsg}
            </p>
          )}

          {customActions.length > 0 && (
            <>
              <p
                className="more-section-title"
                style={{ marginTop: '1.4rem' }}
              >
                Tus acciones creadas
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {customActions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--gco-radius-xs)',
                      background: 'var(--gco-glass-bg)',
                      border: '1px solid var(--gco-glass-border)',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', minWidth: 0 }}>
                      {a.emoji} {a.label}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeAction(a.id)}
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {customLevels.length > 0 && (
        <div className="glass-card">
          <div style={{ padding: '1.25rem 1.25rem' }}>
            <p className="more-section-title">Tus niveles guardados</p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {customLevels.map((lvl) => (
                <div
                  key={lvl.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.7rem 0.85rem',
                    borderRadius: 'var(--gco-radius-xs)',
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.82rem' }}>{lvl.prompt}</span>
                    <p
                      className="mono"
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--gco-ink-faint)',
                        marginTop: 2,
                      }}
                    >
                      {formatReactionTime(lvl.timeLimitMsOverride)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
                      onClick={() => onPlayLevel(lvl)}
                    >
                      Jugar
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeLevel(lvl.id)}
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Secuencia numérica (responsive + control de tamaño) ─────────────────── */
interface SequenceResult {
  level: number
  size: number
  timeMs: number
  mistakes: number
  date: number
}

type SequencePhase = 'listo' | 'jugando' | 'resumen'

function sequenceBoardSize(level: number): number {
  return Math.min(9 + (level - 1) * 2, 36)
}
function sequenceCols(size: number): number {
  if (size <= 9) return 3
  if (size <= 16) return 4
  if (size <= 25) return 5
  return 6
}
function sequencePar(size: number): number {
  return size * 620
}
function sequenceStars(timeMs: number, mistakes: number, size: number): number {
  const penalized = timeMs + mistakes * 500
  const par = sequencePar(size)
  if (penalized <= par * 0.75) return 3
  if (penalized <= par * 1.15) return 2
  return 1
}

function SequenceGame() {
  const [level, setLevel] = useState<number>(() =>
    loadJSON(KEYS.sequenceLevel, 1)
  )
  const [phase, setPhase] = useState<SequencePhase>('listo')
  const [board, setBoard] = useState<number[]>([])
  const [nextTarget, setNextTarget] = useState(1)
  const [mistakes, setMistakes] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [flashWrong, setFlashWrong] = useState<number | null>(null)
  const [summary, setSummary] = useState<SequenceResult | null>(null)
  const [history, setHistory] = useState<SequenceResult[]>(() =>
    loadJSON(KEYS.sequenceHistory, [])
  )
  // Escala de celda (0.7 – 1.35). Por defecto se calcula para que quepa.
  const [cellScale, setCellScale] = useState<number>(() =>
    loadJSON(KEYS.sequenceCellScale, 1)
  )

  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    },
    []
  )

  const size = sequenceBoardSize(level)
  const cols = sequenceCols(size)
  const rows = Math.ceil(size / cols)

  const start = () => {
    soundStart()
    const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1))
    setBoard(nums)
    setNextTarget(1)
    setMistakes(0)
    setElapsedMs(0)
    setSummary(null)
    setPhase('jugando')
    startedAtRef.current = performance.now()
    tickRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current)
    }, 60)
  }

  const finish = useCallback(
    (timeMs: number, finalMistakes: number) => {
      if (tickRef.current) clearInterval(tickRef.current)
      const result: SequenceResult = {
        level,
        size,
        timeMs,
        mistakes: finalMistakes,
        date: Date.now(),
      }
      const nextHist = [result, ...history]
      setHistory(nextHist)
      saveJSON(KEYS.sequenceHistory, nextHist)
      setSummary(result)
      setPhase('resumen')
      const nextLevel = level + 1
      setLevel(nextLevel)
      saveJSON(KEYS.sequenceLevel, nextLevel)
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level: nextLevel,
          success: finalMistakes === 0,
          timeMs,
        })
      } catch {
        /* */
      }
    },
    [level, size, history]
  )

  const handleTap = (n: number) => {
    if (phase !== 'jugando') return
    if (n !== nextTarget) {
      soundFail()
      setMistakes((m) => m + 1)
      setFlashWrong(n)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => setFlashWrong(null), 220)
      return
    }
    soundMatch()
    if (n === size) {
      const timeMs = performance.now() - startedAtRef.current
      finish(timeMs, mistakes)
    } else {
      setNextTarget(n + 1)
    }
  }

  const bestClean = history.filter((r) => r.mistakes === 0)
  const bestTime = bestClean.length
    ? Math.min(...bestClean.map((r) => r.timeMs))
    : history.length
      ? Math.min(...history.map((r) => r.timeMs))
      : null

  const stars = summary
    ? sequenceStars(summary.timeMs, summary.mistakes, summary.size)
    : 0

  // Tamaño de celda en px: quepa toda la cuadrícula sin solaparse ni scroll
  const gapPx = 6
  const maxGridPx =
    typeof window !== 'undefined'
      ? Math.max(220, Math.min(window.innerHeight - 300, 520))
      : 360
  const availW =
    typeof window !== 'undefined'
      ? Math.min(window.innerWidth - 48, 420)
      : 360
  const cellPx = Math.max(
    28,
    Math.floor(
      Math.min(
        (maxGridPx - (rows - 1) * gapPx) / rows,
        availW / cols - gapPx
      ) * cellScale
    )
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
              🔢 Secuencia numérica
            </h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · {size} números
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            {phase === 'jugando'
              ? `Buscas el número ${nextTarget}`
              : 'Toca los números en orden ascendente. La cuadrícula se adapta a la pantalla.'}
          </p>
        </div>
      </div>

      {/* Control de tamaño de celdas */}
      {phase !== 'jugando' && (
        <div className="glass-card" style={{ marginBottom: '1rem' }}>
          <div style={{ padding: '0.9rem 1.15rem' }}>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: '0.55rem',
              }}
            >
              Tamaño de los números
            </p>
            <input
              type="range"
              min={0.7}
              max={1.35}
              step={0.05}
              value={cellScale}
              onChange={(e) => {
                const v = Number(e.target.value)
                setCellScale(v)
                saveJSON(KEYS.sequenceCellScale, v)
              }}
              className="pref-slider"
              style={
                {
                  '--fill': `${((cellScale - 0.7) / (1.35 - 0.7)) * 100}%`,
                } as unknown as React.CSSProperties
              }
            />
            <p
              className="mono"
              style={{
                fontSize: '0.75rem',
                color: 'var(--gco-primary)',
                marginTop: '0.4rem',
              }}
            >
              {Math.round(cellScale * 100)}%
            </p>
          </div>
        </div>
      )}

      {phase === 'jugando' && (
        <div
          className="glass-card"
          style={{
            marginBottom: '0.9rem',
            padding: '0.7rem 1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="mono" style={{ fontSize: '0.95rem' }}>
            ⏱ {formatReactionTime(elapsedMs)}
          </span>
          <span
            className="mono"
            style={{ fontSize: '0.85rem', color: 'var(--gco-secondary)' }}
          >
            Errores: {mistakes}
          </span>
        </div>
      )}

      {phase !== 'jugando' && (
        <div className="glass-card">
          <div style={{ padding: '1.85rem 1.5rem', textAlign: 'center' }}>
            {phase === 'resumen' && summary && (
              <>
                <p
                  style={{
                    fontSize: '1.6rem',
                    marginBottom: '0.5rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  {'★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars)}
                </p>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1.15rem',
                  }}
                >
                  Resultado del nivel {summary.level}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    rowGap: '1.35rem',
                    columnGap: '1.5rem',
                    marginBottom: '1.5rem',
                    textAlign: 'left',
                  }}
                >
                  <Stat label="Tiempo" value={formatReactionTime(summary.timeMs)} />
                  <Stat label="Errores" value={`${summary.mistakes}`} />
                  <Stat label="Casillas" value={`${summary.size}`} />
                  <Stat
                    label="Mejor sin errores"
                    value={bestTime !== null ? formatReactionTime(bestTime) : '—'}
                  />
                </div>
              </>
            )}
            <button
              type="button"
              className="glass-button"
              onClick={start}
              style={{ width: '100%' }}
            >
              {phase === 'resumen' ? 'Siguiente nivel' : 'Comenzar'}
            </button>
          </div>
        </div>
      )}

      {phase === 'jugando' && (
        <div
          ref={gridRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
            gap: `${gapPx}px`,
            justifyContent: 'center',
            width: '100%',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {board.map((n) => {
            const done = n < nextTarget
            const isWrong = flashWrong === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => handleTap(n)}
                disabled={done}
                className="mono"
                style={{
                  width: cellPx,
                  height: cellPx,
                  borderRadius: Math.max(6, cellPx * 0.12),
                  border: isWrong
                    ? '1.5px solid var(--gco-secondary)'
                    : '1px solid var(--gco-glass-border)',
                  background: isWrong
                    ? 'var(--gco-secondary-dim)'
                    : done
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                  color: done ? 'var(--gco-primary)' : 'var(--gco-ink)',
                  fontWeight: 700,
                  fontSize: Math.max(11, Math.floor(cellPx * 0.38)),
                  cursor: done ? 'default' : 'pointer',
                  opacity: done ? 0.55 : 1,
                  transition: 'background 0.12s ease, border-color 0.12s ease',
                  WebkitTapHighlightColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
      )}

      {phase !== 'jugando' && history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <p className="more-section-title" style={{ marginBottom: '0.7rem' }}>
              Historial reciente
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.slice(0, 10).map((r, i) => (
                <span
                  key={`${r.date}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color:
                      r.mistakes === 0 ? 'var(--gco-primary)' : 'var(--gco-ink)',
                  }}
                >
                  {formatReactionTime(r.timeMs)}
                  {r.mistakes > 0 ? ` · ${r.mistakes} err` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Número fugaz (nuevo) ────────────────────────────────────────────────── */
interface FlashResult {
  level: number
  digits: number
  timeMs: number
  correct: boolean
  date: number
}

type FlashPhase = 'listo' | 'mostrando' | 'escribiendo' | 'resultado'

function flashDigits(level: number): number {
  return Math.min(3 + Math.floor((level - 1) / 2), 9)
}
function flashShowMs(level: number): number {
  // Empieza generoso y se va acortando
  return Math.max(350, 2200 - (level - 1) * 120)
}

function FlashNumberGame() {
  const [level, setLevel] = useState(() => loadJSON(KEYS.flashLevel, 1))
  const [phase, setPhase] = useState<FlashPhase>('listo')
  const [number, setNumber] = useState('')
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [history, setHistory] = useState<FlashResult[]>(() =>
    loadJSON(KEYS.flashHistory, [])
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const digits = flashDigits(level)
  const displayTime = flashShowMs(level)

  const start = () => {
    soundStart()
    const max = Math.pow(10, digits) - 1
    const min = Math.pow(10, digits - 1)
    const n = String(Math.floor(Math.random() * (max - min + 1)) + min)
    setNumber(n)
    setInput('')
    setCorrect(null)
    setPhase('mostrando')
    timeoutRef.current = setTimeout(() => {
      setPhase('escribiendo')
      // auto-focus en el input
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }, displayTime)
  }

  const submit = () => {
    if (phase !== 'escribiendo') return
    const ok = input.trim() === number
    setCorrect(ok)
    setPhase('resultado')
    if (ok) soundSuccess()
    else soundFail()

    const result: FlashResult = {
      level,
      digits,
      timeMs: displayTime,
      correct: ok,
      date: Date.now(),
    }
    const nextHist = [result, ...history]
    setHistory(nextHist)
    saveJSON(KEYS.flashHistory, nextHist)

    if (ok) {
      const nextLevel = level + 1
      setLevel(nextLevel)
      saveJSON(KEYS.flashLevel, nextLevel)
    }
    try {
      recordLevelResult({
        categoryId: CAT,
        gameId: GAME_ID,
        level: level,
        success: ok,
        timeMs: displayTime,
      })
    } catch {
      /* */
    }
  }

  const streak = history.filter((r) => r.correct).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>👁️ Número fugaz</h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · {digits} dígitos
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            Observa el número el tiempo indicado y escríbelo de memoria. Cada
            nivel reduce el tiempo de exposición.
          </p>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ padding: '1.75rem 1.4rem', textAlign: 'center' }}>
          {phase === 'listo' && (
            <>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: '1.2rem',
                  lineHeight: 1.45,
                }}
              >
                Tiempo de observación en este nivel:{' '}
                <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                  {formatReactionTime(displayTime)}
                </span>
              </p>
              <button
                type="button"
                className="glass-button"
                style={{ width: '100%' }}
                onClick={start}
              >
                Comenzar
              </button>
            </>
          )}

          {phase === 'mostrando' && (
            <div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-faint)',
                  marginBottom: '0.8rem',
                }}
              >
                Memoriza…
              </p>
              <p
                className="mono"
                style={{
                  fontSize: 'clamp(2.4rem, 12vw, 3.8rem)',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'var(--gco-ink)',
                }}
              >
                {number}
              </p>
              <div
                style={{
                  height: 5,
                  borderRadius: 5,
                  background: 'var(--gco-glass-border)',
                  marginTop: '1.4rem',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: displayTime / 1000, ease: 'linear' }}
                  style={{
                    height: '100%',
                    background: 'var(--gco-primary)',
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          )}

          {phase === 'escribiendo' && (
            <div>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: '1rem',
                }}
              >
                Escribe el número que viste
              </p>
              <input
                ref={inputRef}
                className="glass-input"
                value={input}
                onChange={(e) =>
                  setInput(e.target.value.replace(/\D/g, '').slice(0, digits))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                style={{
                  textAlign: 'center',
                  fontSize: '1.6rem',
                  letterSpacing: '0.15em',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: '1.1rem',
                }}
                placeholder={'·'.repeat(digits)}
              />
              <button
                type="button"
                className="glass-button"
                style={{ width: '100%' }}
                onClick={submit}
                disabled={input.length !== digits}
              >
                Comprobar
              </button>
            </div>
          )}

          {phase === 'resultado' && (
            <div>
              <p
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: correct ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  marginBottom: '0.6rem',
                }}
              >
                {correct ? '✓ Correcto' : '✗ Incorrecto'}
              </p>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: '0.4rem',
                }}
              >
                Número: <span className="mono">{number}</span>
              </p>
              {!correct && (
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1rem',
                  }}
                >
                  Escribiste: <span className="mono">{input || '—'}</span>
                </p>
              )}
              <button
                type="button"
                className="glass-button"
                style={{ width: '100%', marginTop: '0.8rem' }}
                onClick={start}
              >
                {correct ? 'Siguiente nivel' : 'Reintentar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <p className="more-section-title" style={{ marginBottom: '0.55rem' }}>
              Historial · Aciertos recientes: {streak}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.slice(0, 12).map((r, i) => (
                <span
                  key={`${r.date}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color: r.correct ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  Nv.{r.level} · {r.digits}d · {formatReactionTime(r.timeMs)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Memoria de posición (nuevo) ─────────────────────────────────────────── */
interface PositionResult {
  level: number
  cells: number
  timeMs: number
  correct: boolean
  date: number
}

type PositionPhase = 'listo' | 'mostrando' | 'respondiendo' | 'resultado'

function positionGridSize(level: number): number {
  if (level <= 3) return 3
  if (level <= 8) return 4
  if (level <= 18) return 5
  if (level <= 35) return 6
  if (level <= 60) return 7
  if (level <= 100) return 8
  if (level <= 160) return 9
  return Math.min(10, 9 + Math.floor((level - 160) / 80))
}
function positionShowCount(level: number): number {
  const grid = positionGridSize(level)
  const maxCells = grid * grid
  const raw = 2 + Math.floor(level * 0.35)
  return Math.min(raw, Math.floor(maxCells * 0.55), maxCells - 1)
}
function positionShowMs(level: number): number {
  return Math.max(550, 2600 - Math.floor(level * 8))
}

function PositionMemoryGame() {
  const [level, setLevel] = useState(() => loadJSON(KEYS.positionLevel, 1))
  const [phase, setPhase] = useState<PositionPhase>('listo')
  const [lit, setLit] = useState<number[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [history, setHistory] = useState<PositionResult[]>(() =>
    loadJSON(KEYS.positionHistory, [])
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const grid = positionGridSize(level)
  const count = positionShowCount(level)
  const showMs = positionShowMs(level)
  const totalCells = grid * grid

  const start = () => {
    soundStart()
    const indices = shuffleArray(
      Array.from({ length: totalCells }, (_, i) => i)
    ).slice(0, count)
    setLit(indices)
    setSelected([])
    setCorrect(null)
    setPhase('mostrando')
    timeoutRef.current = setTimeout(() => {
      setPhase('respondiendo')
    }, showMs)
  }

  const toggleCell = (idx: number) => {
    if (phase !== 'respondiendo') return
    soundClick()
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    )
  }

  const submit = () => {
    if (phase !== 'respondiendo') return
    const a = [...selected].sort((x, y) => x - y)
    const b = [...lit].sort((x, y) => x - y)
    const ok =
      a.length === b.length && a.every((v, i) => v === b[i])
    setCorrect(ok)
    setPhase('resultado')
    if (ok) soundSuccess()
    else soundFail()

    const result: PositionResult = {
      level,
      cells: count,
      timeMs: showMs,
      correct: ok,
      date: Date.now(),
    }
    const nextHist = [result, ...history]
    setHistory(nextHist)
    saveJSON(KEYS.positionHistory, nextHist)

    if (ok) {
      const nextLevel = level + 1
      setLevel(nextLevel)
      saveJSON(KEYS.positionLevel, nextLevel)
    }
    try {
      recordLevelResult({
        categoryId: CAT,
        gameId: GAME_ID,
        level,
        success: ok,
        timeMs: showMs,
      })
    } catch {
      /* */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
              📍 Memoria de posición
            </h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · {count} celdas
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            Memoriza qué celdas se iluminan y selecciónalas después. El tiempo
            de visualización se acorta con el nivel.
          </p>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ padding: '1.4rem 1.2rem', textAlign: 'center' }}>
          {phase === 'listo' && (
            <>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: '1.1rem',
                  lineHeight: 1.45,
                }}
              >
                Cuadrícula {grid}×{grid} · Observación:{' '}
                <span className="mono" style={{ color: 'var(--gco-primary)' }}>
                  {formatReactionTime(showMs)}
                </span>
              </p>
              <button
                type="button"
                className="glass-button"
                style={{ width: '100%' }}
                onClick={start}
              >
                Comenzar
              </button>
            </>
          )}

          {(phase === 'mostrando' ||
            phase === 'respondiendo' ||
            phase === 'resultado') && (
            <>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--gco-ink-faint)',
                  marginBottom: '0.85rem',
                }}
              >
                {phase === 'mostrando'
                  ? 'Memoriza las celdas iluminadas…'
                  : phase === 'respondiendo'
                    ? 'Selecciona las celdas que viste'
                    : correct
                      ? '¡Correcto!'
                      : 'Incorrecto'}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${grid}, 1fr)`,
                  gap: '0.45rem',
                  maxWidth: 340,
                  margin: '0 auto 1.1rem',
                }}
              >
                {Array.from({ length: totalCells }, (_, idx) => {
                  const isLit =
                    phase === 'mostrando'
                      ? lit.includes(idx)
                      : phase === 'resultado'
                        ? lit.includes(idx)
                        : selected.includes(idx)
                  const isMiss =
                    phase === 'resultado' &&
                    selected.includes(idx) &&
                    !lit.includes(idx)
                  const isHit =
                    phase === 'resultado' &&
                    lit.includes(idx) &&
                    selected.includes(idx)
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleCell(idx)}
                      disabled={phase !== 'respondiendo'}
                      style={{
                        aspectRatio: '1 / 1',
                        borderRadius: 'var(--gco-radius-sm)',
                        border: isMiss
                          ? '1.5px solid var(--gco-secondary)'
                          : isHit || (phase === 'mostrando' && isLit)
                            ? '1.5px solid var(--gco-primary)'
                            : '1px solid var(--gco-glass-border)',
                        background: isMiss
                          ? 'var(--gco-secondary-dim)'
                          : isLit
                            ? 'var(--gco-primary-dim)'
                            : 'var(--gco-glass-bg)',
                        cursor:
                          phase === 'respondiendo' ? 'pointer' : 'default',
                        transition: 'background 0.12s ease',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    />
                  )
                })}
              </div>

              {phase === 'mostrando' && (
                <div
                  style={{
                    height: 5,
                    borderRadius: 5,
                    background: 'var(--gco-glass-border)',
                    overflow: 'hidden',
                    maxWidth: 340,
                    margin: '0 auto',
                  }}
                >
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: showMs / 1000, ease: 'linear' }}
                    style={{
                      height: '100%',
                      background: 'var(--gco-primary)',
                      borderRadius: 5,
                    }}
                  />
                </div>
              )}

              {phase === 'respondiendo' && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ width: '100%', maxWidth: 340 }}
                  onClick={submit}
                  disabled={selected.length === 0}
                >
                  Comprobar ({selected.length}/{count})
                </button>
              )}

              {phase === 'resultado' && (
                <button
                  type="button"
                  className="glass-button"
                  style={{ width: '100%', maxWidth: 340, marginTop: '0.4rem' }}
                  onClick={start}
                >
                  {correct ? 'Siguiente nivel' : 'Reintentar'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem' }}>
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <p className="more-section-title" style={{ marginBottom: '0.55rem' }}>
              Historial reciente
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.slice(0, 12).map((r, i) => (
                <span
                  key={`${r.date}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color: r.correct ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  Nv.{r.level} · {r.cells}c
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}