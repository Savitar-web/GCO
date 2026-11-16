import {useEffect,useRef} from 'react'
export function GameBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if(matchMedia('(prefers-reduced-motion:reduce)').matches)return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    const particles: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = []

    function resize() {
      w = canvas!.width = window.innerWidth
      h = canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.min(70, Math.floor((w * h) / 18000))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 0.8 + Math.random() * 2.2,
        a: 0.15 + Math.random() * 0.45,
      })
    }

    function tick() {
      ctx!.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(55, 230, 255, ${p.a})`
        ctx!.fill()
      }
      // conexiones suaves
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < 120) {
            ctx!.strokeStyle = `rgba(34, 230, 197, ${0.12 * (1 - d / 120)})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="gco-chess-particles" aria-hidden />
}

