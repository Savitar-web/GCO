/**
 * chessSound.ts — SFX procedurales vía Web Audio API (sin archivos de audio).
 * Se integra con el ajuste de sonido global de la app: pásale `enabled=false`
 * para silenciar (por ejemplo si el usuario apagó el sonido en Ajustes → Sonido).
 */

let audioCtx: AudioContext | null = null

function ensureAudio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function playTone(freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.18, detune = 0) {
  const ctx = ensureAudio()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  } catch {
    /* audio no disponible; degradación silenciosa */
  }
}

export const chessSfx = {
  select(enabled: boolean) {
    if (!enabled) return
    playTone(880, 0.06, 'sine', 0.12)
    playTone(1320, 0.05, 'triangle', 0.06)
  },
  move(enabled: boolean) {
    if (!enabled) return
    playTone(220, 0.14, 'triangle', 0.14)
    playTone(330, 0.1, 'sine', 0.08)
  },
  capture(enabled: boolean) {
    if (!enabled) return
    playTone(90, 0.22, 'sawtooth', 0.2)
    playTone(180, 0.18, 'square', 0.1)
    setTimeout(() => playTone(60, 0.3, 'sawtooth', 0.12), 40)
  },
  check(enabled: boolean) {
    if (!enabled) return
    playTone(660, 0.15, 'square', 0.15)
    setTimeout(() => playTone(880, 0.2, 'sine', 0.12), 80)
  },
  mate(enabled: boolean) {
    if (!enabled) return
    ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 'triangle', 0.2), i * 120))
  },
  click(enabled: boolean) {
    if (!enabled) return
    playTone(400, 0.04, 'sine', 0.08)
  },
  invalid(enabled: boolean) {
    if (!enabled) return
    playTone(160, 0.12, 'sawtooth', 0.1)
  },
}
