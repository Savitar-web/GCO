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
} from '../generateLevel'

type View =
  | 'menu'
  | 'reaccion'
  | 'punteria'
  | 'simon'
  | 'secuencia'
  | 'numero-fugaz'
  | 'memoria-posicion'
  | 'multitono'

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
  reactionRelease: 'gco:habilidades:reaccion-soltar',
  reactionMode: 'gco:habilidades:reaccion-modo',
  aim: 'gco:habilidades:punteria',
  aimKeyPrimary: 'gco:habilidades:punteria-key-primary',
  aimKeySecondary: 'gco:habilidades:punteria-key-secondary',
  simonLevel: 'gco:habilidades:simon-nivel',
  simonCustom: 'gco:habilidades:simon-creativo',
  simonActions: 'gco:habilidades:simon-acciones',
  sequenceLevel: 'gco:habilidades:secuencia-nivel',
  sequenceHistory: 'gco:habilidades:secuencia-historial',
  sequenceCellScale: 'gco:habilidades:secuencia-escala',
  sequenceBestStreak: 'gco:habilidades:secuencia-racha',
  flashLevel: 'gco:habilidades:numero-fugaz-nivel',
  flashHistory: 'gco:habilidades:numero-fugaz-historial',
  positionLevel: 'gco:habilidades:memoria-posicion-nivel',
  positionHistory: 'gco:habilidades:memoria-posicion-historial',
  multitonoLevel: 'gco:habilidades:multitono-nivel',
  multitonoHistory: 'gco:habilidades:multitono-historial',
  multitonoPanel: 'gco:habilidades:multitono-panel',
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
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/* ── sonidos sintetizados adicionales (WebAudio) ──────────────────────────
   Se generan en el propio archivo (no dependen de uiSounds.ts) para poder
   incorporar nuevos efectos "de última generación" sin tocar el core de
   audio compartido. Todo con try/catch defensivo por si el navegador
   bloquea el AudioContext antes de un gesto del usuario.                 */
let sharedAudioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!sharedAudioCtx) {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      sharedAudioCtx = new Ctx()
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {})
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

function playTone(
  freq: number,
  durationMs: number,
  opts: {
    type?: OscillatorType
    gain?: number
    glideTo?: number
    delayMs?: number
  } = {}
) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const { type = 'sine', gain = 0.08, glideTo, delayMs = 0 } = opts
  try {
    const start = ctx.currentTime + delayMs / 1000
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, start + durationMs / 1000)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(gain, start + 0.014)
    g.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + durationMs / 1000 + 0.03)
  } catch {
    /* ignore */
  }
}

function soundLevelUp() {
  playTone(440, 90, { type: 'triangle' })
  playTone(660, 110, { type: 'triangle', delayMs: 70 })
  playTone(880, 200, { type: 'triangle', delayMs: 150 })
}
function soundCombo(step: number) {
  playTone(500 + Math.min(step, 12) * 32, 90, { type: 'square', gain: 0.045 })
}
function soundCountdownTick() {
  playTone(320, 30, { type: 'square', gain: 0.035 })
}
function soundFakeTarget() {
  playTone(200, 150, { type: 'sawtooth', glideTo: 85, gain: 0.09 })
}
function soundScanSweep() {
  playTone(220, 900, { type: 'sine', glideTo: 900, gain: 0.045 })
  playTone(110, 900, { type: 'triangle', glideTo: 440, gain: 0.03, delayMs: 40 })
}
function soundWheelTick() {
  playTone(760, 16, { type: 'square', gain: 0.02 })
}
function soundShapeUnlock() {
  playTone(320, 100, { type: 'triangle' })
  playTone(480, 100, { type: 'triangle', delayMs: 90 })
  playTone(640, 220, { type: 'triangle', delayMs: 180 })
}
function soundSliderTick() {
  playTone(880, 12, { type: 'sine', gain: 0.018 })
}
function soundHold() {
  playTone(180, 260, { type: 'sine', gain: 0.05, glideTo: 260 })
}

/** Ronda individual dentro de un nivel creativo multi-ronda. */
interface CreativeSimonRound {
  prompt: string
  correctId: string
  options: SimonButtonDef[]
  timeLimitMs: number
}

/** Nivel creativo con varias rondas y nombre propio. */
interface CreativeSimonLevel {
  id: string
  name: string
  rounds: CreativeSimonRound[]
  createdAt: number
}

function buildSimonLevelFromRound(
  round: CreativeSimonRound,
  level: number
): SimonLevel {
  return {
    level,
    options: shuffleArray(round.options),
    correctId: round.correctId,
    prompt: round.prompt,
    timeLimitMs: round.timeLimitMs,
  }
}

function recommendSimonTime(referenceLevel: number): number {
  const raw = getSimonTimeLimit(Math.max(1, referenceLevel))
  return Math.min(2800, Math.max(1200, Math.round(raw / 50) * 50))
}

/* ── Banco masivo de acciones para Simón Dice (>170) ─────────────────────── */
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

/** Bloque adicional (nuevo) para ampliar mucho más el banco de acciones. */
const EXTRA_SIMON_ACTIONS: SimonButtonDef[] = [
  { id: 'z-remo', label: 'imita remar', emoji: '🚣', hex: '#22E6C5' },
  { id: 'z-nada', label: 'imita nadar', emoji: '🏊', hex: '#FF6B4A' },
  { id: 'z-boxea', label: 'boxea al aire', emoji: '🥊', hex: '#8B7CF6' },
  { id: 'z-patina', label: 'imita patinar', emoji: '⛸️', hex: '#F5A623' },
  { id: 'z-esquia', label: 'imita esquiar', emoji: '⛷️', hex: '#4A9EFF' },
  { id: 'z-surfea', label: 'imita surfear', emoji: '🏄', hex: '#FF6BCB' },
  { id: 'z-escala', label: 'imita escalar', emoji: '🧗', hex: '#A3E635' },
  { id: 'z-anda-bici', label: 'pedalea en el aire', emoji: '🚴', hex: '#FB923C' },
  { id: 'z-lanza-beso', label: 'lanza un beso', emoji: '😘', hex: '#818CF8' },
  { id: 'z-abanica', label: 'abanícate', emoji: '🪭', hex: '#2DD4BF' },
  { id: 'z-toca-pecho', label: 'tócate el pecho', emoji: '🫱', hex: '#38BDF8' },
  { id: 'z-forma-o', label: 'forma una O con la boca', emoji: '😯', hex: '#FB7185' },
  { id: 'z-cara-guiño-doble', label: 'guiña los dos ojos', emoji: '😆', hex: '#22E6C5' },
  { id: 'z-cara-mono', label: 'pon cara de mono', emoji: '🐵', hex: '#FF6B4A' },
  { id: 'z-cara-zombie', label: 'camina como zombi', emoji: '🧟', hex: '#8B7CF6' },
  { id: 'z-cara-fantasma', label: 'imita un fantasma', emoji: '👻', hex: '#F5A623' },
  { id: 'z-imita-mono', label: 'imita un mono', emoji: '🙉', hex: '#4A9EFF' },
  { id: 'z-imita-vaca', label: 'imita una vaca', emoji: '🐮', hex: '#FF6BCB' },
  { id: 'z-imita-leon', label: 'imita un león', emoji: '🦁', hex: '#A3E635' },
  { id: 'z-imita-serpiente', label: 'imita una serpiente', emoji: '🐍', hex: '#FB923C' },
  { id: 'z-imita-rana', label: 'imita una rana', emoji: '🐸', hex: '#818CF8' },
  { id: 'z-imita-mariposa', label: 'imita una mariposa', emoji: '🦋', hex: '#2DD4BF' },
  { id: 'z-imita-abeja', label: 'imita una abeja', emoji: '🐝', hex: '#38BDF8' },
  { id: 'z-imita-conejo', label: 'imita un conejo', emoji: '🐰', hex: '#FB7185' },
  { id: 'z-imita-elefante', label: 'imita un elefante', emoji: '🐘', hex: '#22E6C5' },
  { id: 'z-imita-cangrejo', label: 'camina como cangrejo', emoji: '🦀', hex: '#FF6B4A' },
  { id: 'z-forma-estrella', label: 'forma una estrella con el cuerpo', emoji: '⭐', hex: '#8B7CF6' },
  { id: 'z-forma-triangulo', label: 'forma un triángulo con las manos', emoji: '🔺', hex: '#F5A623' },
  { id: 'z-forma-cuadrado', label: 'forma un cuadrado con las manos', emoji: '⬜', hex: '#4A9EFF' },
  { id: 'z-forma-circulo-manos', label: 'forma un círculo con las manos', emoji: '⭕', hex: '#FF6BCB' },
  { id: 'z-dedo-en-labios', label: 'dedo en los labios', emoji: '🤫', hex: '#A3E635' },
  { id: 'z-manos-orejas', label: 'manos en las orejas', emoji: '🙉', hex: '#FB923C' },
  { id: 'z-cruza-dedos', label: 'cruza los dedos', emoji: '🤞', hex: '#818CF8' },
  { id: 'z-hace-cuernos', label: 'haz cuernitos con la mano', emoji: '🤘', hex: '#2DD4BF' },
  { id: 'z-toca-suelo', label: 'toca el suelo', emoji: '🖐️', hex: '#38BDF8' },
  { id: 'z-toca-techo', label: 'estira hacia el techo', emoji: '🙌', hex: '#FB7185' },
  { id: 'z-abre-brazos', label: 'abre los brazos como avión', emoji: '🛩️', hex: '#22E6C5' },
  { id: 'z-esconde-manos', label: 'esconde las manos', emoji: '🙈', hex: '#FF6B4A' },
  { id: 'z-mano-en-cadera', label: 'una mano en la cadera', emoji: '🧍‍♀️', hex: '#8B7CF6' },
  { id: 'z-simula-lluvia', label: 'simula que llueve', emoji: '🌧️', hex: '#F5A623' },
  { id: 'z-simula-sol', label: 'simula tomar sol', emoji: '☀️', hex: '#4A9EFF' },
  { id: 'z-simula-frio', label: 'tiembla de frío (finge)', emoji: '🥶', hex: '#FF6BCB' },
  { id: 'z-simula-calor', label: 'abanícate por calor', emoji: '🥵', hex: '#A3E635' },
  { id: 'z-simula-dormir', label: 'finge que duermes', emoji: '😴', hex: '#FB923C' },
  { id: 'z-simula-despertar', label: 'finge que despiertas', emoji: '🥱', hex: '#818CF8' },
  { id: 'z-simula-comer', label: 'finge que comes', emoji: '🍽️', hex: '#2DD4BF' },
  { id: 'z-simula-beber', label: 'finge que bebes', emoji: '🥤', hex: '#38BDF8' },
  { id: 'z-simula-telefono', label: 'contesta un teléfono imaginario', emoji: '📱', hex: '#FB7185' },
  { id: 'z-simula-foto', label: 'tómate una foto imaginaria', emoji: '📸', hex: '#22E6C5' },
  { id: 'z-aplaude-cabeza', label: 'aplaude sobre tu cabeza', emoji: '👏', hex: '#FF6B4A' },
  { id: 'z-toca-espalda', label: 'tócate la espalda baja', emoji: '🫲', hex: '#8B7CF6' },
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
              Reflejos, puntería, atención, color y memoria de trabajo bajo presión.
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
        {view === 'multitono' && <MultitonoGame key="multitono" />}
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
  const reactionReleaseHist = loadJSON<number[]>(KEYS.reactionRelease, [])
  const aimHist = loadJSON<AimSessionSummary[]>(KEYS.aim, [])
  const simonLevel = loadJSON<number>(KEYS.simonLevel, 1)
  const sequenceHist = loadJSON<SequenceResult[]>(KEYS.sequenceHistory, [])
  const flashHist = loadJSON<FlashResult[]>(KEYS.flashHistory, [])
  const positionHist = loadJSON<PositionResult[]>(KEYS.positionHistory, [])
  const multitonoLevel = loadJSON<number>(KEYS.multitonoLevel, 1)

  const allReaction = [...reactionHist, ...reactionReleaseHist]
  const bestReaction = allReaction.length ? Math.min(...allReaction) : null
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
      desc: 'Pulsa apenas la pantalla cambie. Elige entre modo "al hacer clic" o "al soltar clic".',
      stat:
        bestReaction !== null
          ? `Mejor: ${formatReactionTime(bestReaction)}`
          : null,
    },
    {
      id: 'punteria',
      title: 'Puntería',
      emoji: '🎯',
      desc: 'Golpea el blanco lo más cerca del centro. Desde el nivel 15, cuidado con los señuelos falsos.',
      stat: bestAim !== null ? `Mejor precisión: ${bestAim}%` : null,
    },
    {
      id: 'simon',
      title: 'Simón Dice',
      emoji: '🧠',
      desc: 'Lee la orden y pulsa el botón correcto antes de que se acabe el tiempo. +170 acciones.',
      stat: `Nivel ${simonLevel}`,
    },
    {
      id: 'secuencia',
      title: 'Secuencia numérica',
      emoji: '🔢',
      desc: 'Encuentra los números en orden ascendente. Ahora con rachas, rangos y estadísticas completas.',
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
    {
      id: 'multitono',
      title: 'Multitono',
      emoji: '🎨',
      desc: 'Reproduce el color exacto con RGB, porcentajes, rueda cromática o barras. Niveles infinitos con figuras 2D/3D.',
      stat: `Nivel ${multitonoLevel}`,
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

/* ── Tiempo de reacción (con switch: al hacer clic / al soltar clic) ─────── */
type ReactionMode = 'click' | 'release'
type ReactionState = 'idle' | 'esperando' | 'listo' | 'muy-pronto' | 'resultado'

function ReactionGame() {
  const [mode, setMode] = useState<ReactionMode>(() =>
    loadJSON<ReactionMode>(KEYS.reactionMode, 'click')
  )
  const [state, setState] = useState<ReactionState>('idle')
  const [round, setRound] = useState(1)
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [historyClick, setHistoryClick] = useState<number[]>(() =>
    loadJSON(KEYS.reaction, [])
  )
  const [historyRelease, setHistoryRelease] = useState<number[]>(() =>
    loadJSON(KEYS.reactionRelease, [])
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyAtRef = useRef(0)
  const holdingRef = useRef(false)

  const history = mode === 'click' ? historyClick : historyRelease

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const pushHistory = useCallback(
    (elapsed: number) => {
      if (mode === 'click') {
        setHistoryClick((prev) => {
          const next = [elapsed, ...prev]
          saveJSON(KEYS.reaction, next)
          return next
        })
      } else {
        setHistoryRelease((prev) => {
          const next = [elapsed, ...prev]
          saveJSON(KEYS.reactionRelease, next)
          return next
        })
      }
    },
    [mode]
  )

  const changeMode = (m: ReactionMode) => {
    if (m === mode) return
    soundClick()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    holdingRef.current = false
    setMode(m)
    saveJSON(KEYS.reactionMode, m)
    setState('idle')
    setLastTime(null)
  }

  const armRound = useCallback(() => {
    soundStart()
    const r = generateReactionRound(round, Date.now())
    setState('esperando')
    timeoutRef.current = setTimeout(() => {
      readyAtRef.current = performance.now()
      setState('listo')
    }, r.delayMs)
  }, [round])

  const registerSuccess = useCallback(
    (elapsed: number) => {
      soundMatch()
      setLastTime(elapsed)
      setState('resultado')
      setRound((r) => r + 1)
      pushHistory(elapsed)
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
    },
    [pushHistory]
  )

  const failTooSoon = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    soundFail()
    setState('muy-pronto')
  }, [])

  /* Modo "Al hacer clic": un solo toque arranca, otro toque marca el tiempo */
  const handleClickMode = () => {
    if (state === 'idle' || state === 'resultado' || state === 'muy-pronto') {
      armRound()
      return
    }
    if (state === 'esperando') {
      failTooSoon()
      return
    }
    if (state === 'listo') {
      const elapsed = performance.now() - readyAtRef.current
      registerSuccess(elapsed)
    }
  }

  /* Modo "Al soltar clic": mantén presionado, suelta cuando cambie de color */
  const handlePointerDownRelease = () => {
    if (state === 'idle' || state === 'resultado' || state === 'muy-pronto') {
      holdingRef.current = true
      soundHold()
      armRound()
    }
  }
  const handlePointerUpRelease = () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (state === 'esperando') {
      failTooSoon()
      return
    }
    if (state === 'listo') {
      const elapsed = performance.now() - readyAtRef.current
      registerSuccess(elapsed)
    }
  }

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

  const message: Record<ReactionState, string> =
    mode === 'click'
      ? {
          idle: 'Toca para empezar',
          esperando: 'Espera a que cambie de color',
          listo: '¡AHORA! Toca ya',
          'muy-pronto': 'Muy pronto · Toca para reintentar',
          resultado: 'Toca para otra ronda',
        }
      : {
          idle: 'Mantén presionado para empezar',
          esperando: 'Sigue presionando… espera el cambio',
          listo: '¡AHORA! Suelta ya',
          'muy-pronto': 'Soltaste antes de tiempo · Mantén presionado para reintentar',
          resultado: 'Mantén presionado para otra ronda',
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
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.9rem' }}>
            Ronda {round} · {mode === 'click' ? 'Toca apenas cambie el color.' : 'Mantén presionado y suelta apenas cambie.'}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.7rem 0.85rem',
              borderRadius: 'var(--gco-radius-sm)',
              background: 'var(--gco-fill-quaternary)',
              border: '1px solid var(--gco-glass-border)',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: mode === 'click' ? 700 : 500,
                color: mode === 'click' ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
              }}
            >
              Al hacer clic
            </span>
            <label className="gco-switch">
              <input
                type="checkbox"
                checked={mode === 'release'}
                onChange={(e) => changeMode(e.target.checked ? 'release' : 'click')}
                aria-label="Cambiar modo de tiempo de reacción"
              />
              <span />
            </label>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: mode === 'release' ? 700 : 500,
                color: mode === 'release' ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
              }}
            >
              Al soltar clic
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={mode === 'click' ? handleClickMode : undefined}
        onPointerDown={mode === 'release' ? handlePointerDownRelease : undefined}
        onPointerUp={mode === 'release' ? handlePointerUpRelease : undefined}
        onPointerLeave={mode === 'release' ? handlePointerUpRelease : undefined}
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
          touchAction: 'manipulation',
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
              fontSize: 'clamp(1.05rem, 4vw, 1.4rem)',
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
                Mejor ({mode === 'click' ? 'clic' : 'soltar'}):{' '}
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

/* ── Puntería (con niveles, contrarreloj, teclado Z/X y señuelos falsos) ─── */
function AimGame() {
  const [level, setLevel] = useState(1)
  const config = useMemo(() => getAimSessionConfig(level), [level])
  const totalTargets = Math.min(8 + level * 2, 28)
  const sessionTimeLimit = Math.max(18, 45 - level)
  const obstaclesActive = level > 14

  const [phase, setPhase] = useState<'listo' | 'jugando' | 'resumen'>('listo')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<ReturnType<typeof generateAimTarget> | null>(null)
  const [obstacles, setObstacles] = useState<ReturnType<typeof generateAimTarget>[]>([])
  const [results, setResults] = useState<AimHitResult[]>([])
  const [lastFeedback, setLastFeedback] = useState<{
    accuracy: number
    hit: boolean
    fake: boolean
  } | null>(null)
  const [timeLeft, setTimeLeft] = useState(sessionTimeLimit)
  const [fakesAvoided, setFakesAvoided] = useState(0)
  const spawnAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number }>({ x: 50, y: 50 })
  const [history, setHistory] = useState<AimSessionSummary[]>(() =>
    loadJSON(KEYS.aim, [])
  )
  const [summary, setSummary] = useState<AimSessionSummary | null>(null)

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

      if (obstaclesActive) {
        const fakeCount = Math.min(1 + Math.floor((level - 14) / 6), 3)
        const fakes: typeof t[] = []
        for (let k = 0; k < fakeCount; k++) {
          let candidate = generateAimTarget(
            i * 137 + k + 1,
            level,
            config,
            Date.now() + i * 97 + k * 13 + 7
          )
          let attempt = 0
          while (
            attempt < 6 &&
            Math.hypot(candidate.x - t.x, candidate.y - t.y) <
              (t.radius + candidate.radius) / 4 + 9
          ) {
            candidate = generateAimTarget(
              i * 137 + k + 1 + attempt,
              level,
              config,
              Date.now() + i * 97 + k * 13 + 7 + attempt * 31
            )
            attempt++
          }
          fakes.push({ ...candidate, id: `fake-${candidate.id}-${k}` })
        }
        setObstacles(fakes)
      } else {
        setObstacles([])
      }
    },
    [config, level, obstaclesActive]
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
      setObstacles([])
      setPhase('resumen')
      if (!timedOut && s.hits > s.misses) {
        soundLevelUp()
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

      const fakeHit = obstacles.find((o) => {
        const fdx = clickX - o.x
        const fdy = clickY - o.y
        const fdist = Math.sqrt(fdx * fdx + fdy * fdy) * (rect.width / 100)
        return fdist <= o.radius * 1.05
      })

      const dxPct = clickX - target.x
      const dyPct = clickY - target.y
      const distPx = Math.sqrt(dxPct * dxPct + dyPct * dyPct) * (rect.width / 100)
      const hit = !fakeHit && distPx <= target.radius * 1.15
      const accuracy = hit ? scoreAimHit(distPx, target.radius) : 0
      const reactionMs = performance.now() - spawnAtRef.current

      if (hit) soundMatch()
      else if (fakeHit) soundFakeTarget()
      else soundFail()

      if (!fakeHit && obstaclesActive) setFakesAvoided((f) => f + 1)

      const result: AimHitResult = {
        targetId: target.id,
        hit,
        distanceFromCenterPx: fakeHit ? target.radius * 3 : distPx,
        accuracyPct: accuracy,
        reactionMs,
      }
      setLastFeedback({ accuracy, hit, fake: !!fakeHit })
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
    [phase, target, obstacles, obstaclesActive, results, index, totalTargets, spawnNext, finishSession]
  )

  const start = () => {
    soundStart()
    setResults([])
    setSummary(null)
    setLastFeedback(null)
    setIndex(0)
    setFakesAvoided(0)
    setTimeLeft(sessionTimeLimit)
    startedAtRef.current = performance.now()
    setPhase('jugando')
    spawnNext(0)
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    registerHit(e.clientX, e.clientY)
  }

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    pointerRef.current = {
      x: e.clientX,
      y: e.clientY,
    }
  }

  useEffect(() => {
    if (phase !== 'jugando') return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === keyPrimary.toLowerCase() || k === keySecondary.toLowerCase()) {
        e.preventDefault()
        registerHit(pointerRef.current.x, pointerRef.current.y)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, keyPrimary, keySecondary, registerHit])

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
        if (t <= 6) soundCountdownTick()
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

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
              ? `Blanco ${index + 1} de ${totalTargets} · ⏱ ${timeLeft}s${
                  obstaclesActive ? ' · ⚠️ hay señuelos falsos' : ''
                }`
              : 'Golpea el centro del blanco. En PC puedes usar teclas además del ratón.'}
          </p>
          {!obstaclesActive && level >= 10 && phase !== 'jugando' && (
            <p
              className="mono"
              style={{
                fontSize: '0.72rem',
                color: 'var(--gco-secondary)',
                marginTop: '0.5rem',
              }}
            >
              ⚠️ Desde el nivel 15 aparecerán señuelos falsos: si les das, cuenta como fallo.
            </p>
          )}
        </div>
      </div>

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
                  {obstaclesActive && (
                    <Stat label="Señuelos evitados" value={`${fakesAvoided}`} />
                  )}
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

          {obstacles.map((o) => (
            <motion.div
              key={o.id}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [1, 1.06, 1], opacity: 1 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                left: `${o.x}%`,
                top: `${o.y}%`,
                width: o.radius * 2,
                height: o.radius * 2,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, #FF6B4A 0%, #FB923C 45%, #F5A623 72%, #8B2E1E 100%)',
                boxShadow:
                  '0 0 0 3px rgba(255,107,74,0.22), var(--gco-shadow)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(10, o.radius * 0.5),
                color: 'rgba(0,0,0,0.35)',
                fontWeight: 900,
              }}
            >
              ✕
            </motion.div>
          ))}

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
            color: lastFeedback.fake
              ? 'var(--gco-secondary)'
              : lastFeedback.hit
                ? aimAccuracyColor(lastFeedback.accuracy)
                : 'var(--gco-secondary)',
          }}
        >
          Último click:{' '}
          {lastFeedback.fake
            ? '¡señuelo falso! cuenta como fallo'
            : lastFeedback.hit
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

/* ── Simón Dice (con menú previo + banco ampliado + creativo completo) ───── */
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
  const [streak, setStreak] = useState(0)

  const [directLevel, setDirectLevel] = useState<CreativeSimonLevel | null>(null)
  const [directRoundIndex, setDirectRoundIndex] = useState(0)

  const [customActions, setCustomActions] = useState<SimonButtonDef[]>(() =>
    loadJSON(KEYS.simonActions, [])
  )
  const [customLevels, setCustomLevels] = useState<CreativeSimonLevel[]>(() => {
    const raw = loadJSON<unknown[]>(KEYS.simonCustom, [])
    return (raw as Array<Record<string, unknown>>).map((item) => {
      if (item && Array.isArray((item as any).rounds)) return item as unknown as CreativeSimonLevel
      return {
        id: String(item.id ?? `migrated-${Date.now()}`),
        name: String(item.prompt ?? 'Nivel antiguo'),
        rounds: [
          {
            prompt: String(item.prompt ?? 'Simón dice'),
            correctId: String(item.correctId ?? ''),
            options: (item.options as SimonButtonDef[]) ?? [],
            timeLimitMs: Number(item.timeLimitMsOverride ?? 2000),
          },
        ],
        createdAt: Number(item.createdAt ?? Date.now()),
      } satisfies CreativeSimonLevel
    })
  })

  const pool = useMemo(
    () => [...BASE_SIMON_ACTIONS, ...EXTRA_SIMON_ACTIONS, ...customActions],
    [customActions]
  )

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)

  const loadLevel = useCallback(
    (lvl: number) => {
      setDirectLevel(null)
      setDirectRoundIndex(0)
      let next: SimonLevel
      if (customLevels.length > 0 && lvl % 5 === 0) {
        const cl = customLevels[Math.floor(Math.random() * customLevels.length)]
        const round = cl.rounds[Math.floor(Math.random() * cl.rounds.length)]
        next = buildSimonLevelFromRound(round, lvl)
      } else {
        next = generateSimonLevel(lvl, pool)
        if (lvl >= 8 && next.options.length >= 4) {
          const correct = next.options.find((o) => o.id === next.correctId)
          if (correct) {
            const similar = pool
              .filter((b) => b.id !== correct.id)
              .map((b) => ({
                b,
                score:
                  (b.label.slice(0, 3) === correct.label.slice(0, 3) ? 3 : 0) +
                  (b.emoji === correct.emoji ? 2 : 0) +
                  (Math.abs(b.label.length - correct.label.length) <= 2 ? 1 : 0),
              }))
              .sort((a, c) => c.score - a.score)
            const distractors = similar.slice(0, 3).map((x) => x.b)
            if (distractors.length === 3) {
              next = {
                ...next,
                options: shuffleArray([correct, ...distractors]),
              }
            }
          }
        }
      }
      setCurrent(next)
      setPhase('lectura')
      setMsLeft(next.timeLimitMs)
      setLastElapsedMs(null)
    },
    [customLevels, pool]
  )

  const playCustomLevel = useCallback(
    (lvl: CreativeSimonLevel, roundIdx = 0) => {
      soundClick()
      setScreen('jugar')
      setDirectLevel(lvl)
      setDirectRoundIndex(roundIdx)
      const round = lvl.rounds[roundIdx % lvl.rounds.length]
      const built = buildSimonLevelFromRound(round, playingLevel)
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
    setStreak(0)
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
        setStreak(0)
        if (tickRef.current) clearInterval(tickRef.current)
      } else {
        setMsLeft(remaining)
        if (remaining < 800) soundCountdownTick()
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
      const nextStreak = streak + 1
      setStreak(nextStreak)
      if (nextStreak > 0 && nextStreak % 5 === 0) soundLevelUp()
      else soundSuccess()
      setPhase('acierto')

      if (directLevel) {
        const nextRound = (directRoundIndex + 1) % directLevel.rounds.length
        window.setTimeout(() => playCustomLevel(directLevel, nextRound), 900)
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
      setStreak(0)
      setPhase('fallo')
    }
  }

  const retry = () => {
    soundClick()
    if (directLevel) playCustomLevel(directLevel, directRoundIndex)
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
              tiempo. Hay más de 170 acciones distintas y puedes crear las tuyas.
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {streak > 1 && (
                <span
                  className="mono"
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--gco-secondary)',
                    background: 'var(--gco-secondary-dim)',
                    padding: '0.2rem 0.55rem',
                    borderRadius: 999,
                  }}
                >
                  🔥 x{streak}
                </span>
              )}
              <span
                className="mono"
                style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
              >
                {directLevel ? `${directLevel.name} · R${directRoundIndex + 1}` : `Nivel ${playingLevel}`}
              </span>
            </div>
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
  const [rounds, setRounds] = useState<CreativeSimonRound[]>([])
  const [selected, setSelected] = useState<SimonButtonDef[]>([])
  const [correctId, setCorrectId] = useState('')
  const [timeLimitMs, setTimeLimitMs] = useState(recommendedTimeMs)
  const [msg, setMsg] = useState('')
  const [levelName, setLevelName] = useState('')
  const [askingName, setAskingName] = useState(false)

  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState(ACTION_EMOJI_CHOICES[0])
  const [newColor, setNewColor] = useState(ACTION_COLOR_CHOICES[0])
  const [actionMsg, setActionMsg] = useState('')
  const [customEmojiMode, setCustomEmojiMode] = useState(false)
  const [customEmojiInput, setCustomEmojiInput] = useState('')

  const toggleButton = (btn: SimonButtonDef) => {
    soundClick()
    const exists = selected.some((b) => b.id === btn.id)
    if (exists) {
      const next = selected.filter((b) => b.id !== btn.id)
      setSelected(next)
      if (correctId === btn.id) setCorrectId(next[0]?.id ?? '')
    } else {
      if (selected.length >= 4) {
        const next = [...selected.slice(0, 3), btn]
        setSelected(next)
        return
      }
      setSelected([...selected, btn])
      if (!correctId) setCorrectId(btn.id)
    }
  }

  const autoPrompt =
    selected.find((b) => b.id === correctId)?.label != null
      ? `Simón dice: ${selected.find((b) => b.id === correctId)!.label}`
      : 'Simón dice: …'

  const addRound = () => {
    if (selected.length !== 4 || !selected.some((b) => b.id === correctId)) {
      soundFail()
      setMsg('Necesitas exactamente 4 acciones y una respuesta correcta')
      return
    }
    const round: CreativeSimonRound = {
      prompt: autoPrompt,
      correctId,
      options: [...selected],
      timeLimitMs,
    }
    setRounds((prev) => [...prev, round])
    soundSuccess()
    setMsg(`Ronda ${rounds.length + 1} añadida`)
    window.setTimeout(() => setMsg(''), 1800)
  }

  const removeRound = (idx: number) => {
    soundClick()
    setRounds((prev) => prev.filter((_, i) => i !== idx))
  }

  const requestSave = () => {
    if (rounds.length < 4) {
      soundFail()
      setMsg('Necesitas al menos 4 rondas para guardar el nivel')
      return
    }
    setAskingName(true)
    setMsg('')
  }

  const confirmSave = () => {
    const name = levelName.trim()
    if (!name) {
      soundFail()
      setMsg('Escribe un nombre para el nivel')
      return
    }
    const level: CreativeSimonLevel = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      name,
      rounds: [...rounds],
      createdAt: Date.now(),
    }
    onChangeLevels([level, ...customLevels])
    soundSuccess()
    setMsg(`Nivel «${name}» guardado con ${rounds.length} rondas`)
    setRounds([])
    setLevelName('')
    setAskingName(false)
    window.setTimeout(() => setMsg(''), 2500)
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
    setActionMsg('Acción añadida')
    window.setTimeout(() => setActionMsg(''), 2000)
  }

  const removeAction = (id: string) => {
    soundClick()
    onChangeActions(customActions.filter((a) => a.id !== id))
    setSelected((prev) => prev.filter((b) => b.id !== id))
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
          <p className="more-section-title">Elige 4 acciones para esta ronda</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-faint)', marginBottom: '0.7rem' }}>
            Clic = seleccionar · Clic otra vez = deseleccionar · Máximo 4
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.55rem',
              marginBottom: '1.2rem',
              maxHeight: 260,
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

          <p className="more-section-title">Respuesta correcta</p>
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
            {selected.length === 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--gco-ink-faint)' }}>
                Selecciona acciones arriba
              </span>
            )}
          </div>

          <p className="more-section-title">Texto de la pregunta</p>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--gco-ink)',
              marginBottom: '1.1rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 10,
              background: 'var(--gco-glass-bg)',
              border: '1px solid var(--gco-glass-border)',
            }}
          >
            {autoPrompt}
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginBottom: '1.1rem',
            }}
          >
            Se genera automáticamente según la respuesta correcta (no es editable).
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
              marginBottom: '1.1rem',
            }}
          >
            {formatReactionTime(timeLimitMs)}
          </p>

          <button
            type="button"
            className="glass-button secondary"
            style={{ width: '100%', marginBottom: '0.7rem' }}
            onClick={addRound}
          >
            + Añadir esta ronda
          </button>

          {rounds.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p className="more-section-title">
                Rondas preparadas ({rounds.length})
                {rounds.length < 4 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gco-secondary)',
                      marginLeft: 8,
                    }}
                  >
                    · mínimo 4
                  </span>
                )}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {rounds.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--gco-radius-xs)',
                      background: 'var(--gco-glass-bg)',
                      border: '1px solid var(--gco-glass-border)',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: '0.8rem' }}>
                      {idx + 1}. {r.prompt}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeRound(idx)}
                      aria-label="Eliminar ronda"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!askingName ? (
            <button
              type="button"
              className="glass-button"
              style={{ width: '100%' }}
              onClick={requestSave}
              disabled={rounds.length < 4}
            >
              Guardar nivel
              {rounds.length < 4 ? ` (${rounds.length}/4)` : ''}
            </button>
          ) : (
            <div>
              <label className="more-field-label">
                Nombre del nivel (no es el texto de la ronda)
              </label>
              <input
                className="glass-input"
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
                placeholder="p. ej. Desafío matutino"
                style={{ marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="glass-button"
                  style={{ flex: 1 }}
                  onClick={confirmSave}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setAskingName(false)
                    setLevelName('')
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
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
              marginBottom: '0.75rem',
            }}
          >
            {ACTION_EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  soundClick()
                  setNewEmoji(emoji)
                  setCustomEmojiMode(false)
                }}
                style={{
                  height: 40,
                  borderRadius: 'var(--gco-radius-xs)',
                  border:
                    !customEmojiMode && newEmoji === emoji
                      ? '1.5px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background:
                    !customEmojiMode && newEmoji === emoji
                      ? 'var(--gco-primary-dim)'
                      : 'var(--gco-glass-bg)',
                  fontSize: '1.15rem',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                soundClick()
                setCustomEmojiMode(true)
              }}
              style={{
                height: 40,
                borderRadius: 'var(--gco-radius-xs)',
                border: customEmojiMode
                  ? '1.5px solid var(--gco-primary)'
                  : '1px solid var(--gco-glass-border)',
                background: customEmojiMode
                  ? 'var(--gco-primary-dim)'
                  : 'var(--gco-glass-bg)',
                fontSize: '1.15rem',
                cursor: 'pointer',
                fontWeight: 700,
              }}
              title="Elegir otro emoji"
            >
              +
            </button>
          </div>
          {customEmojiMode && (
            <div style={{ marginBottom: '1rem' }}>
              <input
                className="glass-input"
                value={customEmojiInput}
                onChange={(e) => {
                  const v = e.target.value
                  setCustomEmojiInput(v)
                  if (v.trim()) {
                    const chars = Array.from(v.trim())
                    setNewEmoji(chars[chars.length - 1])
                  }
                }}
                placeholder="Pega o escribe un emoji aquí"
                style={{ textAlign: 'center', fontSize: '1.4rem' }}
              />
              <p
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--gco-ink-faint)',
                  marginTop: 4,
                }}
              >
                En móvil se abrirá el teclado de emojis. Seleccionado: {newEmoji}
              </p>
            </div>
          )}
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
              <p className="more-section-title" style={{ marginTop: '1.4rem' }}>
                Tus acciones creadas
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {lvl.name}
                    </span>
                    <p
                      className="mono"
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--gco-ink-faint)',
                        marginTop: 2,
                      }}
                    >
                      {lvl.rounds.length} rondas
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

/* ── Secuencia numérica (rediseño profesional: rachas, rango, estadísticas) */
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
function sequenceRank(stars: number, mistakes: number): { letter: string; color: string } {
  if (stars === 3 && mistakes === 0) return { letter: 'S', color: '#F5A623' }
  if (stars === 3) return { letter: 'A', color: 'var(--gco-primary)' }
  if (stars === 2) return { letter: 'B', color: 'var(--gco-accent)' }
  return { letter: 'C', color: 'var(--gco-ink-muted)' }
}
function sequenceDifficulty(level: number): { label: string; color: string } {
  if (level <= 3) return { label: 'Iniciado', color: 'var(--gco-primary)' }
  if (level <= 8) return { label: 'Intermedio', color: 'var(--gco-accent)' }
  if (level <= 15) return { label: 'Avanzado', color: 'var(--gco-secondary)' }
  if (level <= 25) return { label: 'Experto', color: '#F5A623' }
  return { label: 'Maestro', color: '#FF6BCB' }
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
  const [bestStreak, setBestStreak] = useState<number>(() =>
    loadJSON(KEYS.sequenceBestStreak, 0)
  )
  const [cellScale, setCellScale] = useState<number>(() =>
    loadJSON(KEYS.sequenceCellScale, 1)
  )
  const comboRef = useRef(0)

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
  const difficulty = sequenceDifficulty(level)

  const start = () => {
    soundStart()
    const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1))
    setBoard(nums)
    setNextTarget(1)
    setMistakes(0)
    setElapsedMs(0)
    setSummary(null)
    comboRef.current = 0
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
      const nextHist = [result, ...history].slice(0, 60)
      setHistory(nextHist)
      saveJSON(KEYS.sequenceHistory, nextHist)
      setSummary(result)
      setPhase('resumen')
      if (finalMistakes === 0) {
        const nextStreak = bestStreak + 1
        setBestStreak(nextStreak)
        saveJSON(KEYS.sequenceBestStreak, nextStreak)
        soundLevelUp()
      } else {
        setBestStreak(0)
        saveJSON(KEYS.sequenceBestStreak, 0)
      }
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
    [level, size, history, bestStreak]
  )

  const handleTap = (n: number) => {
    if (phase !== 'jugando') return
    if (n !== nextTarget) {
      soundFail()
      comboRef.current = 0
      setMistakes((m) => m + 1)
      setFlashWrong(n)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => setFlashWrong(null), 220)
      return
    }
    comboRef.current += 1
    soundCombo(comboRef.current)
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
  const avgTime = history.length
    ? history.reduce((s, r) => s + r.timeMs, 0) / history.length
    : null
  const accuracyPct = history.length
    ? Math.round(
        (history.filter((r) => r.mistakes === 0).length / history.length) * 100
      )
    : null

  const stars = summary
    ? sequenceStars(summary.timeMs, summary.mistakes, summary.size)
    : 0
  const rank = summary ? sequenceRank(stars, summary.mistakes) : null

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

  const recentTimes = history.slice(0, 10).map((r) => r.timeMs).reverse()
  const maxRecent = recentTimes.length ? Math.max(...recentTimes) : 1

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
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: difficulty.color,
                background: 'var(--gco-fill-quaternary)',
                padding: '0.25rem 0.6rem',
                borderRadius: 999,
              }}
            >
              {difficulty.label}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.9rem' }}>
            Nivel {level} · {size} números ·{' '}
            {phase === 'jugando'
              ? `Buscas el ${nextTarget}`
              : 'Toca en orden ascendente'}
          </p>

          {history.length > 0 && phase !== 'jugando' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.6rem',
              }}
            >
              <Stat label="Mejor" value={bestTime !== null ? formatReactionTime(bestTime) : '—'} />
              <Stat label="Promedio" value={avgTime !== null ? formatReactionTime(avgTime) : '—'} />
              <Stat label="Partidas" value={`${history.length}`} />
              <Stat label="Sin errores" value={accuracyPct !== null ? `${accuracyPct}%` : '—'} />
            </div>
          )}

          {bestStreak > 1 && phase !== 'jugando' && (
            <p
              className="mono"
              style={{
                fontSize: '0.78rem',
                color: 'var(--gco-secondary)',
                marginTop: '0.8rem',
              }}
            >
              🔥 Racha perfecta actual: {bestStreak} niveles sin errores
            </p>
          )}
        </div>
      </div>

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
          {comboRef.current > 2 && (
            <span
              className="mono"
              style={{ fontSize: '0.82rem', color: 'var(--gco-primary)' }}
            >
              🔗 combo x{comboRef.current}
            </span>
          )}
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
            {phase === 'resumen' && summary && rank && (
              <>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: `${rank.color}22`,
                    border: `2px solid ${rank.color}`,
                    color: rank.color,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: '1.7rem',
                    marginBottom: '0.7rem',
                  }}
                >
                  {rank.letter}
                </div>
                <p
                  style={{
                    fontSize: '1.4rem',
                    marginBottom: '0.35rem',
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
                {recentTimes.length > 1 && (
                  <div style={{ marginBottom: '1.4rem' }}>
                    <p
                      className="more-section-title"
                      style={{ textAlign: 'left', marginBottom: '0.5rem' }}
                    >
                      Tendencia (últimas {recentTimes.length} partidas)
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 4,
                        height: 56,
                      }}
                    >
                      {recentTimes.map((t, i) => (
                        <div
                          key={i}
                          title={formatReactionTime(t)}
                          style={{
                            flex: 1,
                            height: `${Math.max(8, (t / maxRecent) * 100)}%`,
                            background:
                              i === recentTimes.length - 1
                                ? 'var(--gco-primary)'
                                : 'var(--gco-glass-border)',
                            borderRadius: 4,
                            transition: 'height 0.3s ease',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
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
              <motion.button
                key={n}
                type="button"
                onClick={() => handleTap(n)}
                disabled={done}
                whileTap={{ scale: done ? 1 : 0.9 }}
                className="mono"
                style={{
                  width: cellPx,
                  height: cellPx,
                  borderRadius: Math.max(6, cellPx * 0.12),
                  border: isWrong
                    ? '1.5px solid var(--gco-secondary)'
                    : done
                      ? '1px solid var(--gco-primary)'
                      : '1px solid var(--gco-glass-border)',
                  background: isWrong
                    ? 'var(--gco-secondary-dim)'
                    : done
                      ? 'linear-gradient(155deg, var(--gco-primary-dim), transparent)'
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
              </motion.button>
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

/* ── Número fugaz ─────────────────────────────────────────────────────────── */
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
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }, displayTime)
  }

  const submit = () => {
    if (phase !== 'escribiendo') return
    const ok = input.trim() === number
    setCorrect(ok)
    setPhase('resultado')
    if (ok) {
      soundSuccess()
      if (level % 5 === 0) soundLevelUp()
    } else soundFail()

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

/* ── Memoria de posición ──────────────────────────────────────────────────── */
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
    if (ok) {
      soundSuccess()
      if (level % 5 === 0) soundLevelUp()
    } else soundFail()

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

/* ══════════════════════════════════════════════════════════════════════════
   MULTITONO — laboratorio de color futurista
   Modelo: HSL (tono, saturación, luminosidad) + contraste + brillo.
   4 paneles de edición: RGB/Código · Porcentajes (conos) · Rueda · Barras.
   Niveles infinitos con figuras 2D/3D cada vez más complejas + ficha
   matemática (área, perímetro, volumen o ecuación) puramente educativa.
   ══════════════════════════════════════════════════════════════════════════ */

interface ColorParams {
  h: number // tono 0-360
  s: number // saturación 0-100
  l: number // luminosidad 0-100
  contrast: number // 0-100, 50 = neutro
  brightness: number // 0-100, 50 = neutro
}

const DEFAULT_PARAMS: ColorParams = { h: 200, s: 55, l: 50, contrast: 50, brightness: 50 }

type MultitonoPanel = 'rgb' | 'porcentaje' | 'rueda' | 'barras'
type MultitonoShape =
  | 'cuadrado'
  | 'circulo'
  | 'estrella'
  | 'esfera'
  | 'cubo'
  | 'cono'
  | 'onda'

const SHAPE_SEQUENCE: MultitonoShape[] = [
  'circulo',
  'estrella',
  'esfera',
  'cubo',
  'cono',
  'onda',
]

function getShapeForLevel(level: number): MultitonoShape {
  if (level <= 3) return 'cuadrado'
  const idx = Math.floor((level - 4) / 2) % SHAPE_SEQUENCE.length
  return SHAPE_SEQUENCE[idx]
}

function minSimilarityForLevel(level: number): number {
  return Math.min(70 + (level - 1) * 2, 96)
}

/* ── conversión de color ──────────────────────────────────────────────── */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const S = s / 100
  const L = l / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const Hp = h / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (Hp >= 0 && Hp < 1) [r1, g1, b1] = [C, X, 0]
  else if (Hp < 2) [r1, g1, b1] = [X, C, 0]
  else if (Hp < 3) [r1, g1, b1] = [0, C, X]
  else if (Hp < 4) [r1, g1, b1] = [0, X, C]
  else if (Hp < 5) [r1, g1, b1] = [X, 0, C]
  else [r1, g1, b1] = [C, 0, X]
  const m = L - C / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case R:
        h = ((G - B) / d) % 6
        break
      case G:
        h = (B - R) / d + 2
        break
      default:
        h = (R - G) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return { r, g, b }
}

/** Ajusta L y S visualmente según contraste/brillo para renderizar el color final. */
function visualHsl(p: ColorParams): { h: number; s: number; l: number } {
  const brightDelta = (p.brightness - 50) * 0.34
  const contrastDelta = (p.contrast - 50) * 0.32
  return {
    h: p.h,
    s: clamp(p.s + contrastDelta, 0, 100),
    l: clamp(p.l + brightDelta, 3, 97),
  }
}
function cssColor(p: ColorParams): string {
  const v = visualHsl(p)
  return `hsl(${Math.round(v.h)}, ${Math.round(v.s)}%, ${Math.round(v.l)}%)`
}
function shade(p: ColorParams, lDelta: number, sDelta = 0): string {
  const v = visualHsl(p)
  return `hsl(${Math.round(v.h)}, ${clamp(Math.round(v.s + sDelta), 0, 100)}%, ${clamp(
    Math.round(v.l + lDelta),
    2,
    98
  )}%)`
}

/* ── similitud ────────────────────────────────────────────────────────── */
interface SimilarityBreakdown {
  hue: number
  sat: number
  light: number
  contrast: number
  brightness: number
  overall: number
}
function computeSimilarity(target: ColorParams, user: ColorParams): SimilarityBreakdown {
  const hueDiff = Math.min(Math.abs(target.h - user.h), 360 - Math.abs(target.h - user.h))
  const hue = clamp(100 - (hueDiff / 180) * 100, 0, 100)
  const sat = clamp(100 - Math.abs(target.s - user.s), 0, 100)
  const light = clamp(100 - Math.abs(target.l - user.l), 0, 100)
  const contrast = clamp(100 - Math.abs(target.contrast - user.contrast), 0, 100)
  const brightness = clamp(100 - Math.abs(target.brightness - user.brightness), 0, 100)
  const overall = hue * 0.3 + sat * 0.25 + light * 0.25 + contrast * 0.1 + brightness * 0.1
  return { hue, sat, light, contrast, brightness, overall: Math.round(overall) }
}

/* ── generación de objetivo por nivel ────────────────────────────────────── */
function generateTargetParams(level: number): ColorParams {
  const spread = Math.min(12 + level * 1.4, 34)
  const h = Math.floor(Math.random() * 360)
  const s = Math.floor(28 + Math.random() * 58)
  const l = Math.floor(26 + Math.random() * 48)
  const contrast =
    level >= 4 ? Math.round(clamp(50 + (Math.random() * 2 - 1) * spread, 6, 94)) : 50
  const brightness =
    level >= 7 ? Math.round(clamp(50 + (Math.random() * 2 - 1) * spread, 6, 94)) : 50
  return { h, s, l, contrast, brightness }
}

/* ── ficha matemática por figura (con valores deterministas por nivel) ──── */
function shapeMathInfo(shape: MultitonoShape, level: number): { title: string; lines: string[] } {
  const seed = 40 + (level % 12) * 5
  switch (shape) {
    case 'cuadrado': {
      const lado = seed
      return {
        title: 'Cuadrado',
        lines: [
          `Lado = ${lado} px`,
          `Área = lado² = ${lado * lado} px²`,
          `Perímetro = 4 · lado = ${lado * 4} px`,
        ],
      }
    }
    case 'circulo': {
      const r = seed / 2
      return {
        title: 'Círculo',
        lines: [
          `Radio = ${r} px`,
          `Área = π·r² ≈ ${(Math.PI * r * r).toFixed(1)} px²`,
          `Perímetro = 2π·r ≈ ${(2 * Math.PI * r).toFixed(1)} px`,
        ],
      }
    }
    case 'estrella': {
      const puntas = 5
      const rOut = seed / 2
      const rIn = rOut * 0.46
      const areaAprox = 0.5 * puntas * rOut * rIn * Math.sin((2 * Math.PI) / puntas) * 2
      return {
        title: `Estrella de ${puntas} puntas`,
        lines: [
          `Radio exterior = ${rOut.toFixed(0)} px · Radio interior ≈ ${rIn.toFixed(0)} px`,
          `Área ≈ ${areaAprox.toFixed(1)} px² (polígono estrellado regular)`,
          `Ángulo entre puntas = 360°/${puntas} = ${(360 / puntas).toFixed(0)}°`,
        ],
      }
    }
    case 'esfera': {
      const r = seed / 2
      return {
        title: 'Esfera',
        lines: [
          `Radio = ${r} px`,
          `Volumen = (4/3)π·r³ ≈ ${((4 / 3) * Math.PI * r ** 3).toFixed(0)} px³`,
          `Área superficial = 4π·r² ≈ ${(4 * Math.PI * r * r).toFixed(1)} px²`,
        ],
      }
    }
    case 'cubo': {
      const a = seed * 0.8
      return {
        title: 'Cubo',
        lines: [
          `Arista = ${a.toFixed(0)} px`,
          `Volumen = a³ = ${(a ** 3).toFixed(0)} px³`,
          `Área total = 6·a² ≈ ${(6 * a * a).toFixed(0)} px²`,
        ],
      }
    }
    case 'cono': {
      const r = seed / 2.6
      const h = seed * 0.9
      const g = Math.sqrt(r * r + h * h)
      return {
        title: 'Cono',
        lines: [
          `Radio = ${r.toFixed(0)} px · Altura = ${h.toFixed(0)} px`,
          `Generatriz (Pitágoras) g = √(r²+h²) ≈ ${g.toFixed(1)} px`,
          `Volumen = (1/3)π·r²·h ≈ ${((1 / 3) * Math.PI * r * r * h).toFixed(0)} px³`,
        ],
      }
    }
    case 'onda': {
      const amp = 24 + (level % 6) * 3
      const freq = 1 + (level % 4)
      return {
        title: 'Onda senoidal',
        lines: [
          `Ecuación: y = A·sin(B·x)`,
          `Amplitud A = ${amp} px · Frecuencia B = ${freq}`,
          `Período = 2π/B ≈ ${(2 * Math.PI * 60 / freq).toFixed(0)} px`,
        ],
      }
    }
  }
}

/* ── render de figuras (SVG con sombreado pseudo-3D) ─────────────────────── */
function ShapeSVG({
  shape,
  params,
  uid,
}: {
  shape: MultitonoShape
  params: ColorParams
  uid: string
}) {
  const base = cssColor(params)
  const light = shade(params, 20, -6)
  const dark = shade(params, -22, 4)
  const midLight = shade(params, 10)

  switch (shape) {
    case 'cuadrado':
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id={`sq-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={light} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>
          </defs>
          <rect x={30} y={30} width={140} height={140} rx={14} fill={`url(#sq-${uid})`} stroke={dark} strokeWidth={2} />
        </svg>
      )
    case 'circulo':
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <radialGradient id={`ci-${uid}`} cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor={light} />
              <stop offset="55%" stopColor={base} />
              <stop offset="100%" stopColor={dark} />
            </radialGradient>
          </defs>
          <circle cx={100} cy={100} r={78} fill={`url(#ci-${uid})`} />
        </svg>
      )
    case 'estrella': {
      const points: string[] = []
      const spikes = 5
      const rOut = 82
      const rIn = 36
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? rOut : rIn
        const angle = (Math.PI / spikes) * i - Math.PI / 2
        points.push(`${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`)
      }
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id={`st-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={light} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>
          </defs>
          <polygon points={points.join(' ')} fill={`url(#st-${uid})`} stroke={dark} strokeWidth={1.5} />
        </svg>
      )
    }
    case 'esfera':
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <radialGradient id={`es-${uid}`} cx="34%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.85} />
              <stop offset="18%" stopColor={light} />
              <stop offset="55%" stopColor={base} />
              <stop offset="100%" stopColor={dark} />
            </radialGradient>
          </defs>
          <circle cx={100} cy={100} r={80} fill={`url(#es-${uid})`} />
          <ellipse cx={100} cy={168} rx={54} ry={10} fill="rgba(0,0,0,0.25)" />
        </svg>
      )
    case 'cubo':
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          {/* cara superior */}
          <polygon points="55,55 145,55 175,80 85,80" fill={midLight} />
          {/* cara frontal */}
          <polygon points="85,80 175,80 175,160 85,160" fill={base} />
          {/* cara lateral */}
          <polygon points="55,55 85,80 85,160 55,140" fill={dark} />
        </svg>
      )
    case 'cono':
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id={`co-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={dark} />
              <stop offset="45%" stopColor={light} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>
          </defs>
          <ellipse cx={100} cy={158} rx={62} ry={16} fill={dark} />
          <polygon points="100,32 38,158 162,158" fill={`url(#co-${uid})`} />
        </svg>
      )
    case 'onda': {
      const amp = 34
      const points: string[] = []
      for (let x = 0; x <= 200; x += 4) {
        const y = 100 + amp * Math.sin((x / 200) * Math.PI * 2.4)
        points.push(`${x},${y.toFixed(1)}`)
      }
      const path = `M0,200 L0,${points[0].split(',')[1]} L${points.join(' L')} L200,200 Z`
      return (
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id={`wv-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={light} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>
          </defs>
          <path d={path} fill={`url(#wv-${uid})`} />
        </svg>
      )
    }
  }
}

/* ── panel 1: RGB / Código hex ────────────────────────────────────────────── */
function RgbHexPanel({
  params,
  onChange,
}: {
  params: ColorParams
  onChange: (p: ColorParams) => void
}) {
  const v = visualHsl(params)
  const rgb = hslToRgb(v.h, v.s, v.l)
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
  const [hexInput, setHexInput] = useState(hex)

  useEffect(() => setHexInput(hex), [hex])

  const applyRgb = (r: number, g: number, b: number) => {
    const hsl = rgbToHsl(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255))
    soundSliderTick()
    onChange({ ...params, h: hsl.h, s: hsl.s, l: hsl.l, contrast: 50, brightness: 50 })
  }

  const applyHex = () => {
    const parsed = hexToRgb(hexInput)
    if (!parsed) {
      soundFail()
      return
    }
    applyRgb(parsed.r, parsed.g, parsed.b)
  }

  return (
    <div>
      <p className="more-section-title">Código hexadecimal</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.1rem' }}>
        <input
          className="glass-input mono"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyHex()}
          placeholder="#22E6C5"
          style={{ textTransform: 'uppercase' }}
        />
        <button type="button" className="glass-button secondary" onClick={applyHex}>
          Aplicar
        </button>
      </div>
      <p className="more-section-title">Canales RGB (0–255)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {(['r', 'g', 'b'] as const).map((ch) => (
          <div key={ch}>
            <label className="more-field-label" style={{ textTransform: 'uppercase' }}>
              {ch}
            </label>
            <input
              type="number"
              min={0}
              max={255}
              className="glass-input mono"
              value={rgb[ch]}
              onChange={(e) => {
                const val = clamp(Number(e.target.value) || 0, 0, 255)
                applyRgb(
                  ch === 'r' ? val : rgb.r,
                  ch === 'g' ? val : rgb.g,
                  ch === 'b' ? val : rgb.b
                )
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── panel 2: porcentajes ("conos") ───────────────────────────────────────── */
function PercentPanel({
  params,
  onChange,
}: {
  params: ColorParams
  onChange: (p: ColorParams) => void
}) {
  const rows: Array<{ key: keyof ColorParams; label: string; max: number }> = [
    { key: 'h', label: 'Tono', max: 360 },
    { key: 's', label: 'Saturación', max: 100 },
    { key: 'l', label: 'Luminosidad', max: 100 },
    { key: 'contrast', label: 'Contraste', max: 100 },
    { key: 'brightness', label: 'Brillo', max: 100 },
  ]
  return (
    <div>
      <p className="more-section-title">Ajusta cada parámetro por porcentaje</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {rows.map((row) => {
          const pct = Math.round((params[row.key] / row.max) * 100)
          return (
            <div
              key={row.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0.5rem 0.7rem',
                borderRadius: 'var(--gco-radius-xs)',
                background: 'var(--gco-fill-quaternary)',
                border: '1px solid var(--gco-glass-border)',
              }}
            >
              <span style={{ fontSize: '0.8rem', flex: 1 }}>{row.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                className="glass-input mono"
                style={{ width: 84, textAlign: 'right', padding: '0.45rem 0.6rem' }}
                value={pct}
                onChange={(e) => {
                  const p = clamp(Number(e.target.value) || 0, 0, 100)
                  soundSliderTick()
                  onChange({ ...params, [row.key]: Math.round((p / 100) * row.max) })
                }}
              />
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--gco-ink-faint)' }}>
                %
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── panel 3: rueda cromática ─────────────────────────────────────────────── */
function WheelPanel({
  params,
  onChange,
}: {
  params: ColorParams
  onChange: (p: ColorParams) => void
}) {
  const size = 200
  const radius = size / 2
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const lastTickRef = useRef(0)

  const angleRad = (params.h * Math.PI) / 180
  const dist = (params.s / 100) * (radius - 16)
  const knobX = radius + dist * Math.cos(angleRad - Math.PI / 2)
  const knobY = radius + dist * Math.sin(angleRad - Math.PI / 2)

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = wheelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (angle < 0) angle += 360
    const distPx = Math.min(Math.sqrt(dx * dx + dy * dy), radius - 16)
    const sat = Math.round((distPx / (radius - 16)) * 100)
    const now = performance.now()
    if (now - lastTickRef.current > 60) {
      soundWheelTick()
      lastTickRef.current = now
    }
    onChange({ ...params, h: Math.round(angle), s: clamp(sat, 0, 100) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div
        ref={wheelRef}
        onPointerDown={(e) => {
          draggingRef.current = true
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          updateFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          background:
            'conic-gradient(from 0deg, #ff0040, #ff8a00, #ffe600, #6bff2e, #00e6c5, #2e6bff, #8a2eff, #ff2e9e, #ff0040)',
          boxShadow: '0 0 0 6px rgba(255,255,255,0.04), var(--gco-shadow-lg)',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '20%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: knobX,
            top: knobY,
            width: 20,
            height: 20,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background: cssColor(params),
            border: '3px solid white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ width: '100%' }}>
        <label className="more-field-label">Luminosidad</label>
        <input
          type="range"
          min={0}
          max={100}
          value={params.l}
          onChange={(e) => {
            soundWheelTick()
            onChange({ ...params, l: Number(e.target.value) })
          }}
          className="pref-slider"
          style={{ '--fill': `${params.l}%` } as unknown as React.CSSProperties}
        />
      </div>
    </div>
  )
}

/* ── panel 4: barras deslizables ──────────────────────────────────────────── */
function SliderPanel({
  params,
  onChange,
}: {
  params: ColorParams
  onChange: (p: ColorParams) => void
}) {
  const rows: Array<{ key: keyof ColorParams; label: string; max: number }> = [
    { key: 'h', label: 'Tono', max: 360 },
    { key: 's', label: 'Saturación', max: 100 },
    { key: 'l', label: 'Luminosidad', max: 100 },
    { key: 'contrast', label: 'Contraste', max: 100 },
    { key: 'brightness', label: 'Brillo', max: 100 },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {rows.map((row) => (
        <div key={row.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="more-field-label" style={{ marginBottom: 0 }}>
              {row.label}
            </label>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--gco-primary)' }}>
              {Math.round(params[row.key])}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={row.max}
            value={params[row.key]}
            onChange={(e) => {
              soundSliderTick()
              onChange({ ...params, [row.key]: Number(e.target.value) })
            }}
            className="pref-slider"
            style={
              {
                '--fill': `${(params[row.key] / row.max) * 100}%`,
              } as unknown as React.CSSProperties
            }
          />
        </div>
      ))}
    </div>
  )
}

/* ── historial ────────────────────────────────────────────────────────────── */
interface MultitonoResult {
  level: number
  similarity: number
  passed: boolean
  date: number
}

function MultitonoGame() {
  const [level, setLevel] = useState<number>(() => loadJSON(KEYS.multitonoLevel, 1))
  const [panel, setPanel] = useState<MultitonoPanel>(() =>
    loadJSON<MultitonoPanel>(KEYS.multitonoPanel, 'rueda')
  )
  const [target, setTarget] = useState<ColorParams>(() => generateTargetParams(1))
  const [user, setUser] = useState<ColorParams>(DEFAULT_PARAMS)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<SimilarityBreakdown | null>(null)
  const [passed, setPassed] = useState<boolean | null>(null)
  const [history, setHistory] = useState<MultitonoResult[]>(() =>
    loadJSON(KEYS.multitonoHistory, [])
  )
  const [showTargetInfo, setShowTargetInfo] = useState(false)
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current)
    },
    []
  )

  const shape = getShapeForLevel(level)
  const minRequired = minSimilarityForLevel(level)
  const math = useMemo(() => shapeMathInfo(shape, level), [shape, level])

  const changePanel = (p: MultitonoPanel) => {
    if (p === panel) return
    soundClick()
    setPanel(p)
    saveJSON(KEYS.multitonoPanel, p)
  }

  const newRound = useCallback((lvl: number) => {
    setTarget(generateTargetParams(lvl))
    setUser(DEFAULT_PARAMS)
    setResult(null)
    setPassed(null)
    setShowTargetInfo(false)
  }, [])

  const check = () => {
    if (analyzing) return
    soundScanSweep()
    setAnalyzing(true)
    setResult(null)
    setPassed(null)
    analyzeTimeoutRef.current = setTimeout(() => {
      const sim = computeSimilarity(target, user)
      const ok = sim.overall >= minRequired
      setResult(sim)
      setPassed(ok)
      setAnalyzing(false)
      setShowTargetInfo(true)
      const nextHist = [{ level, similarity: sim.overall, passed: ok, date: Date.now() }, ...history].slice(0, 60)
      setHistory(nextHist)
      saveJSON(KEYS.multitonoHistory, nextHist)
      if (ok) {
        soundShapeUnlock()
        const nextLevel = level + 1
        setLevel(nextLevel)
        saveJSON(KEYS.multitonoLevel, nextLevel)
      } else {
        soundFail()
      }
      try {
        recordLevelResult({
          categoryId: CAT,
          gameId: GAME_ID,
          level,
          success: ok,
          timeMs: 0,
        })
      } catch {
        /* */
      }
    }, 1050)
  }

  const nextRound = () => {
    soundClick()
    newRound(level)
  }
  const retrySame = () => {
    soundClick()
    newRound(level)
  }

  const bestSimilarity = history.length ? Math.max(...history.map((h) => h.similarity)) : null
  const passRate = history.length
    ? Math.round((history.filter((h) => h.passed).length / history.length) * 100)
    : null

  const breakdownRows: Array<{ label: string; value: number }> = result
    ? [
        { label: 'Tono', value: result.hue },
        { label: 'Saturación', value: result.sat },
        { label: 'Luminosidad', value: result.light },
        { label: 'Contraste', value: result.contrast },
        { label: 'Brillo', value: result.brightness },
      ]
    : []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'relative' }}
    >
      {/* fondo decorativo futurista */}
      <div
        style={{
          position: 'absolute',
          inset: -20,
          background:
            'radial-gradient(ellipse 60% 40% at 20% 0%, rgba(139,124,246,0.10), transparent 60%), radial-gradient(ellipse 50% 35% at 100% 30%, rgba(34,230,197,0.10), transparent 55%)',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />

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
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>🎨 Multitono</h2>
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}
            >
              Nivel {level} · mínimo {minRequired}%
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)' }}>
            Reproduce el color objetivo con la mayor similitud posible. Figura actual:{' '}
            <strong style={{ color: 'var(--gco-ink)' }}>{math.title}</strong>
          </p>
          {history.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.6rem',
                marginTop: '0.9rem',
              }}
            >
              <Stat label="Mejor similitud" value={bestSimilarity !== null ? `${bestSimilarity}%` : '—'} />
              <Stat label="Intentos" value={`${history.length}`} />
              <Stat label="% aprobados" value={passRate !== null ? `${passRate}%` : '—'} />
            </div>
          )}
        </div>
      </div>

      {/* escenario: tu color vs objetivo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.9rem',
          marginBottom: '1rem',
        }}
      >
        <div className="glass-card">
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <p className="more-section-title" style={{ marginBottom: '0.6rem' }}>
              Tu color
            </p>
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 'var(--gco-radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--gco-glass-border)',
                boxShadow: `0 0 24px ${cssColor(user)}33`,
              }}
            >
              <ShapeSVG shape={shape} params={user} uid="user" />
            </div>
            <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--gco-ink-faint)', marginTop: '0.5rem' }}>
              {(() => {
                const v = visualHsl(user)
                const rgb = hslToRgb(v.h, v.s, v.l)
                return rgbToHex(rgb.r, rgb.g, rgb.b)
              })()}
            </p>
          </div>
        </div>
        <div className="glass-card">
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <p className="more-section-title" style={{ marginBottom: '0.6rem' }}>
              Objetivo
            </p>
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 'var(--gco-radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--gco-glass-border)',
                boxShadow: `0 0 24px ${cssColor(target)}33`,
              }}
            >
              <ShapeSVG shape={shape} params={target} uid="target" />
            </div>
            <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--gco-ink-faint)', marginTop: '0.5rem' }}>
              {showTargetInfo
                ? (() => {
                    const v = visualHsl(target)
                    const rgb = hslToRgb(v.h, v.s, v.l)
                    return rgbToHex(rgb.r, rgb.g, rgb.b)
                  })()
                : '???'}
            </p>
          </div>
        </div>
      </div>

      {/* selector de panel */}
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ padding: '1.1rem 1.15rem' }}>
          <div className="segmented" style={{ marginBottom: '1.1rem' }}>
            <button type="button" className={panel === 'rgb' ? 'active' : ''} onClick={() => changePanel('rgb')}>
              RGB/Código
            </button>
            <button
              type="button"
              className={panel === 'porcentaje' ? 'active' : ''}
              onClick={() => changePanel('porcentaje')}
            >
              Porcentajes
            </button>
            <button type="button" className={panel === 'rueda' ? 'active' : ''} onClick={() => changePanel('rueda')}>
              Rueda
            </button>
            <button
              type="button"
              className={panel === 'barras' ? 'active' : ''}
              onClick={() => changePanel('barras')}
            >
              Barras
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={panel}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {panel === 'rgb' && <RgbHexPanel params={user} onChange={setUser} />}
              {panel === 'porcentaje' && <PercentPanel params={user} onChange={setUser} />}
              {panel === 'rueda' && <WheelPanel params={user} onChange={setUser} />}
              {panel === 'barras' && <SliderPanel params={user} onChange={setUser} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <button
        type="button"
        className="glass-button"
        style={{ width: '100%', marginBottom: '1rem' }}
        onClick={check}
        disabled={analyzing}
      >
        {analyzing ? 'Analizando…' : 'Comprobar'}
      </button>

      <AnimatePresence>
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card"
            style={{ marginBottom: '1rem', overflow: 'hidden' }}
          >
            <div style={{ padding: '1.1rem 1.25rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.7rem' }}>
                Escaneando espectro cromático…
              </p>
              <div
                style={{
                  height: 8,
                  borderRadius: 8,
                  background: 'var(--gco-glass-border)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1.05, ease: 'linear' }}
                  style={{
                    height: '100%',
                    width: '50%',
                    background:
                      'linear-gradient(90deg, transparent, var(--gco-primary), var(--gco-accent), transparent)',
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && passed !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass-card"
            style={{ marginBottom: '1rem' }}
          >
            <div style={{ padding: '1.4rem 1.25rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
                <p
                  className="mono"
                  style={{
                    fontSize: 'clamp(2rem, 8vw, 2.6rem)',
                    fontWeight: 800,
                    color: passed ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  {result.overall}%
                </p>
                <p style={{ fontSize: '0.9rem', color: 'var(--gco-ink-muted)' }}>
                  {passed
                    ? `¡Aprobado! Necesitabas ${minRequired}% o más.`
                    : `No alcanza el mínimo de ${minRequired}%. ¡Sigue ajustando!`}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.2rem' }}>
                {breakdownRows.map((row) => (
                  <div key={row.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>{row.label}</span>
                      <span className="mono" style={{ fontSize: '0.78rem' }}>
                        {row.value}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 6,
                        background: 'var(--gco-glass-border)',
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.value}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          background:
                            row.value >= minRequired ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  padding: '0.9rem 1rem',
                  borderRadius: 'var(--gco-radius-sm)',
                  background: 'var(--gco-fill-quaternary)',
                  border: '1px solid var(--gco-glass-border)',
                  marginBottom: '1.1rem',
                }}
              >
                <p className="more-section-title" style={{ marginBottom: '0.4rem' }}>
                  📐 {math.title} · cómo se construyó matemáticamente
                </p>
                {math.lines.map((l, i) => (
                  <p key={i} className="mono" style={{ fontSize: '0.76rem', color: 'var(--gco-ink-muted)', lineHeight: 1.6 }}>
                    {l}
                  </p>
                ))}
              </div>

              <button
                type="button"
                className="glass-button"
                style={{ width: '100%' }}
                onClick={passed ? nextRound : retrySame}
              >
                {passed ? 'Siguiente nivel →' : 'Reintentar este nivel'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {history.length > 0 && (
        <div className="glass-card">
          <div style={{ padding: '1.05rem 1.25rem' }}>
            <p className="more-section-title" style={{ marginBottom: '0.6rem' }}>
              Historial reciente
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {history.slice(0, 12).map((h, i) => (
                <span
                  key={`${h.date}-${i}`}
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: 999,
                    background: 'var(--gco-glass-bg)',
                    border: '1px solid var(--gco-glass-border)',
                    color: h.passed ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  Nv.{h.level} · {h.similarity}%
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}