/**
 * chessSound.ts — SFX procedurales ricos vía Web Audio API (sin archivos).
 */

let audioCtx: AudioContext | null = null

function ensureAudio(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function envGain(ctx: AudioContext, vol: number, attack: number, dur: number) {
  const gain = ctx.createGain()
  const t = ctx.currentTime
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  return gain
}

function playTone(
  freq: number,
  dur = 0.12,
  type: OscillatorType = 'sine',
  vol = 0.18,
  detune = 0,
  attack = 0.008
) {
  const ctx = ensureAudio()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = envGain(ctx, vol, attack, dur)
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.02)
  } catch {
    /* */
  }
}

function playNoise(dur: number, vol: number, filterFreq: number) {
  const ctx = ensureAudio()
  if (!ctx) return
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFreq
    const gain = envGain(ctx, vol, 0.005, dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start()
  } catch {
    /* */
  }
}

export const chessSfx = {
  select(enabled: boolean) {
    if (!enabled) return
    playTone(920, 0.055, 'sine', 0.1)
    playTone(1380, 0.045, 'triangle', 0.055, 8)
  },
  move(enabled: boolean) {
    if (!enabled) return
    playNoise(0.06, 0.06, 1800)
    playTone(240, 0.12, 'triangle', 0.11)
    playTone(360, 0.09, 'sine', 0.06, 4)
  },
  capture(enabled: boolean) {
    if (!enabled) return
    playNoise(0.12, 0.14, 900)
    playTone(95, 0.2, 'sawtooth', 0.16)
    playTone(170, 0.16, 'square', 0.08)
    setTimeout(() => playTone(55, 0.28, 'sawtooth', 0.1), 35)
  },
  check(enabled: boolean) {
    if (!enabled) return
    playTone(700, 0.12, 'square', 0.12)
    setTimeout(() => playTone(920, 0.16, 'sine', 0.11), 70)
    setTimeout(() => playTone(1100, 0.1, 'triangle', 0.07), 140)
  },
  mate(enabled: boolean) {
    if (!enabled) return
    ;[523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.32, 'triangle', 0.18), i * 110)
    )
    setTimeout(() => playTone(1318, 0.5, 'sine', 0.12), 480)
  },
  click(enabled: boolean) {
    if (!enabled) return
    playTone(420, 0.035, 'sine', 0.07)
  },
  invalid(enabled: boolean) {
    if (!enabled) return
    playTone(150, 0.1, 'sawtooth', 0.09)
    setTimeout(() => playTone(110, 0.14, 'sawtooth', 0.07), 60)
  },
  castle(enabled: boolean) {
    if (!enabled) return
    playTone(280, 0.1, 'triangle', 0.1)
    setTimeout(() => playTone(340, 0.12, 'triangle', 0.1), 50)
    setTimeout(() => playTone(420, 0.14, 'sine', 0.08), 100)
  },
  promote(enabled: boolean) {
    if (!enabled) return
    ;[523, 659, 784, 988, 1174].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.18, 'sine', 0.1 - i * 0.01), i * 55)
    )
  },
  start(enabled: boolean) {
    if (!enabled) return
    playTone(330, 0.12, 'triangle', 0.1)
    setTimeout(() => playTone(440, 0.14, 'sine', 0.1), 90)
    setTimeout(() => playTone(554, 0.18, 'sine', 0.09), 180)
  },
  draw(enabled: boolean) {
    if (!enabled) return
    playTone(440, 0.2, 'sine', 0.1)
    setTimeout(() => playTone(415, 0.25, 'sine', 0.09), 120)
    setTimeout(() => playTone(392, 0.35, 'triangle', 0.08), 260)
  },
  undo(enabled: boolean) {
    if (!enabled) return
    playTone(500, 0.07, 'sine', 0.08)
    setTimeout(() => playTone(380, 0.09, 'triangle', 0.07), 40)
  },
  flip(enabled: boolean) {
    if (!enabled) return
    playTone(300, 0.08, 'triangle', 0.08)
    setTimeout(() => playTone(450, 0.1, 'sine', 0.07), 55)
  },
  tick(enabled: boolean) {
    if (!enabled) return
    playTone(1200, 0.025, 'square', 0.04)
  },
  lowTime(enabled: boolean) {
    if (!enabled) return
    playTone(880, 0.08, 'square', 0.1)
    setTimeout(() => playTone(660, 0.1, 'square', 0.08), 90)
  },
  openMenu(enabled: boolean) {
    if (!enabled) return
    playTone(280, 0.06, 'sine', 0.07)
    setTimeout(() => playTone(360, 0.08, 'sine', 0.06), 40)
  },
  closeMenu(enabled: boolean) {
    if (!enabled) return
    playTone(360, 0.05, 'sine', 0.06)
    setTimeout(() => playTone(280, 0.07, 'sine', 0.05), 35)
  },
  hover(enabled: boolean) {
    if (!enabled) return
    playTone(640, 0.03, 'sine', 0.035)
  },
  resign(enabled: boolean) {
    if (!enabled) return
    playTone(300, 0.2, 'sawtooth', 0.1)
    setTimeout(() => playTone(220, 0.28, 'triangle', 0.1), 100)
    setTimeout(() => playTone(160, 0.4, 'sine', 0.08), 220)
  },
  hint(enabled: boolean) {
    if (!enabled) return
    playTone(660, 0.08, 'sine', 0.08)
    setTimeout(() => playTone(880, 0.1, 'triangle', 0.07), 60)
    setTimeout(() => playTone(1320, 0.12, 'sine', 0.05), 120)
  },
}
