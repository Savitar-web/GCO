/**
 * UI Sounds — Web Audio sintético, offline, volumen bajo.
 * Envelopes suaves + capas para que no suene “beep de juguete”.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null

const MASTER_GAIN = 0.22

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = MASTER_GAIN
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function dest(): AudioNode | null {
  const ac = getCtx()
  if (!ac || !master) return null
  return master
}

/** Tono con ataque/release suaves */
function playTone(opts: {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  slideTo?: number
  attack?: number
  delay?: number
}) {
  const ac = getCtx()
  const out = dest()
  if (!ac || !out) return

  const {
    freq,
    duration,
    type = 'sine',
    gain = 0.12,
    slideTo,
    attack = 0.008,
    delay = 0,
  } = opts

  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  const filter = ac.createBiquadFilter()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, slideTo),
      t0 + duration
    )
  }

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(4200, t0)
  filter.Q.value = 0.7

  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(filter)
  filter.connect(g)
  g.connect(out)

  osc.start(t0)
  osc.stop(t0 + duration + 0.03)
}

/** Ruido corto filtrado (clic / carta) */
function playNoise(opts: {
  duration: number
  gain?: number
  freq?: number
  delay?: number
}) {
  const ac = getCtx()
  const out = dest()
  if (!ac || !out) return

  const { duration, gain = 0.06, freq = 1800, delay = 0 } = opts
  const t0 = ac.currentTime + delay
  const size = Math.max(1, Math.floor(ac.sampleRate * duration))
  const buffer = ac.createBuffer(1, size, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / size)
  }

  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 0.9
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  src.connect(filter)
  filter.connect(g)
  g.connect(out)
  src.start(t0)
  src.stop(t0 + duration + 0.02)
}

/** Desbloquear audio en el primer gesto del usuario */
export function unlockAudio() {
  getCtx()
}

// ─── API pública ───────────────────────────────────────────────────────────

/** Clic UI (botones, switches, navegación) */
export function soundClick() {
  playNoise({ duration: 0.03, gain: 0.045, freq: 2400 })
  playTone({
    freq: 880,
    duration: 0.045,
    type: 'sine',
    gain: 0.05,
    slideTo: 620,
    attack: 0.004,
  })
}

/** Voltear / tocar carta / barajar */
export function soundCard() {
  playNoise({ duration: 0.045, gain: 0.055, freq: 1400 })
  playTone({
    freq: 420,
    duration: 0.07,
    type: 'triangle',
    gain: 0.06,
    slideTo: 280,
    attack: 0.005,
  })
}

/** Acierto parcial (pareja, paso correcto) */
export function soundMatch() {
  playTone({
    freq: 523.25,
    duration: 0.08,
    type: 'sine',
    gain: 0.07,
    attack: 0.006,
  })
  playTone({
    freq: 659.25,
    duration: 0.1,
    type: 'sine',
    gain: 0.055,
    delay: 0.055,
    attack: 0.006,
  })
}

/** Error */
export function soundFail() {
  playTone({
    freq: 240,
    duration: 0.14,
    type: 'triangle',
    gain: 0.07,
    slideTo: 110,
    attack: 0.01,
  })
  playNoise({ duration: 0.06, gain: 0.03, freq: 400, delay: 0.02 })
}

/** Victoria de nivel */
export function soundSuccess() {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    playTone({
      freq,
      duration: 0.12,
      type: 'sine',
      gain: 0.055 - i * 0.006,
      delay: i * 0.07,
      attack: 0.01,
    })
  })
}

/**
 * Tic de reloj.
 * urgent: últimos segundos (más presente, sigue siendo suave)
 */
export function soundTick(urgent = false) {
  if (urgent) {
    playTone({
      freq: 920,
      duration: 0.028,
      type: 'sine',
      gain: 0.04,
      attack: 0.002,
    })
    playNoise({ duration: 0.02, gain: 0.02, freq: 3000 })
  } else {
    playTone({
      freq: 760,
      duration: 0.02,
      type: 'sine',
      gain: 0.022,
      attack: 0.002,
    })
  }
}

/** Color iluminado en la secuencia (playback o input) */
export function soundColor(index = 0) {
  const base = 392 // G4
  const steps = [0, 3, 5, 7, 10, 12, 15, 17]
  const semitone = steps[index % steps.length]
  const freq = base * Math.pow(2, semitone / 12)
  playTone({
    freq,
    duration: 0.11,
    type: 'sine',
    gain: 0.065,
    slideTo: freq * 1.04,
    attack: 0.012,
  })
}

/** Generar / empezar nivel */
export function soundStart() {
  playTone({
    freq: 392,
    duration: 0.08,
    type: 'sine',
    gain: 0.05,
    attack: 0.01,
  })
  playTone({
    freq: 523.25,
    duration: 0.1,
    type: 'sine',
    gain: 0.045,
    delay: 0.06,
    attack: 0.01,
  })
}

/** Toggle / switch */
export function soundToggle(on: boolean) {
  playTone({
    freq: on ? 640 : 420,
    duration: 0.05,
    type: 'sine',
    gain: 0.04,
    slideTo: on ? 820 : 320,
    attack: 0.004,
  })
}