import { useEffect, useRef } from 'react'

export type SpecStyle = 'bars' | 'wave' | 'sphere' | 'mirror' | 'pulse'

type Props = {
  getFrequencyData: () => Uint8Array | null
  playing: boolean
  style: SpecStyle
  colorA: string
  colorB: string
  colorC: string
  multi: 1 | 2 | 3
  particles: boolean
  glow: boolean
  /** Refuerzo de volumen actual en % (100 = normal, hasta 300).
   *  Opcional: si se omite, el visualizador se comporta igual que antes. */
  boost?: number
}

export function AudioSpectrum({
  getFrequencyData,
  playing,
  style,
  colorA,
  colorB,
  colorC,
  multi,
  particles,
  glow,
  boost = 100,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const data = getFrequencyData()
      const bins = data ? Array.from(data) : Array(64).fill(playing ? 40 : 8)

      // 0 a 100% de volumen, 1 a 300%: intensifica el brillo/energía del
      // visualizador cuando el boost está activo, sin tocar los colores
      // que ya eligió la persona.
      const heat = Math.max(0, Math.min(1, (boost - 100) / 200))

      const colorAt = (t: number) => {
        if (multi === 1) return colorA
        if (multi === 2) return t < 0.5 ? colorA : colorB
        if (t < 0.33) return colorA
        if (t < 0.66) return colorB
        return colorC
      }

      if (style === 'sphere') {
        const avg =
          bins.reduce((a, b) => a + b, 0) / Math.max(1, bins.length) / 255
        const r = 28 + avg * 42 + heat * 10
        const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, r)
        g.addColorStop(0, '#ffffffaa')
        g.addColorStop(0.4, colorA)
        g.addColorStop(0.75, colorB)
        g.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
        if (glow) {
          ctx.shadowColor = colorA
          ctx.shadowBlur = 24 + avg * 30 + heat * 16
        }
        ctx.fillStyle = g
        ctx.fill()
        ctx.shadowBlur = 0
      } else if (style === 'wave') {
        ctx.beginPath()
        const step = w / bins.length
        bins.forEach((v, i) => {
          const x = i * step
          const y = h / 2 - (v / 255) * (h * 0.42)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        for (let i = bins.length - 1; i >= 0; i--) {
          const x = i * step
          const y = h / 2 + (bins[i] / 255) * (h * 0.42)
          ctx.lineTo(x, y)
        }
        ctx.closePath()
        const grad = ctx.createLinearGradient(0, 0, w, 0)
        grad.addColorStop(0, colorA)
        grad.addColorStop(0.5, colorB)
        grad.addColorStop(1, multi === 3 ? colorC : colorA)
        ctx.fillStyle = grad
        if (glow) {
          ctx.shadowColor = colorA
          ctx.shadowBlur = 16 + heat * 12
        }
        ctx.globalAlpha = 0.85
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      } else {
        const n = Math.min(48, bins.length)
        const gap = 2
        const bw = (w - gap * n) / n
        for (let i = 0; i < n; i++) {
          const v = bins[Math.floor((i / n) * bins.length)] / 255
          let bh = v * (h * 0.85) * (1 + heat * 0.12)
          if (style === 'pulse') bh = Math.max(bh, v * h * 0.5)
          bh = Math.min(bh, h)
          if (style === 'mirror') {
            const mid = h / 2
            const half = bh / 2
            ctx.fillStyle = colorAt(i / n)
            if (glow) {
              ctx.shadowColor = colorAt(i / n)
              ctx.shadowBlur = 8 + heat * 8
            }
            ctx.fillRect(i * (bw + gap), mid - half, bw, half)
            ctx.fillRect(i * (bw + gap), mid, bw, half)
          } else {
            ctx.fillStyle = colorAt(i / n)
            if (glow) {
              ctx.shadowColor = colorAt(i / n)
              ctx.shadowBlur = 10 + heat * 8
            }
            ctx.fillRect(i * (bw + gap), h - bh, bw, bh)
          }
        }
        ctx.shadowBlur = 0
      }

      if (particles && playing && data) {
        for (let i = 0; i < 12; i++) {
          const v = bins[(i * 7) % bins.length] / 255
          if (v < 0.25) continue
          ctx.beginPath()
          ctx.arc(
            (i / 12) * w + (v * 10),
            h * (1 - v) * 0.9,
            1.5 + v * 2,
            0,
            Math.PI * 2
          )
          ctx.fillStyle = colorAt(i / 12)
          ctx.globalAlpha = 0.5 + v * 0.5
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      raf.current = requestAnimationFrame(draw)
    }

    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [
    getFrequencyData,
    playing,
    style,
    colorA,
    colorB,
    colorC,
    multi,
    particles,
    glow,
  ])

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={100}
      style={{
        width: '100%',
        maxWidth: 360,
        height: 100,
        display: 'block',
        margin: '0 auto',
      }}
    />
  )
}