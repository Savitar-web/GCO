import type { CSSProperties } from 'react'

export function frameRingStyle(frame: string): CSSProperties {
  const base: CSSProperties = {
    borderRadius: '50%',
    transition:
      'box-shadow 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), border-color 0.25s ease, background 0.35s ease, transform 0.2s ease',
  }
  if (frame === 'neon')
    return {
      ...base,
      padding: 3,
      background: 'var(--gco-primary)',
      boxShadow:
        '0 0 0 1px var(--gco-primary), 0 0 14px var(--gco-primary), 0 0 28px rgba(34,230,197,0.35), inset 0 0 8px rgba(34,230,197,0.25)',
    }
  if (frame === 'metal')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(135deg, #f0f2f5 0%, #8b93a7 40%, #3a4154 70%, #cfd5e0 100%)',
      boxShadow:
        'inset 0 1px 1px rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.35)',
    }
  if (frame === 'matte')
    return {
      ...base,
      padding: 5,
      background: 'rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
    }
  if (frame === 'glass')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 40%, rgba(34,230,197,0.25))',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.35), 0 0 0 4px rgba(34,230,197,0.22), inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 24px rgba(0,0,0,0.28)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }
  if (frame === 'gold')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(145deg, #fff6c8 0%, #e8c547 25%, #b8860b 55%, #f5e6a3 80%, #c9a227 100%)',
      boxShadow:
        '0 0 0 1px rgba(184,134,11,0.5), inset 0 1px 1px rgba(255,255,255,0.7), 0 6px 18px rgba(184,134,11,0.35)',
    }
  if (frame === 'holographic')
    return {
      ...base,
      padding: 3,
      background:
        'conic-gradient(from 210deg, #ff6bcb, #7ec8ff, #22e6c5, #8b7cf6, #ff8ec8, #ff6bcb)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.4), 0 0 20px rgba(139,124,246,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
    }
  if (frame === 'cyber')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(90deg, #22e6c5 0%, #0B1220 35%, #0B1220 65%, #8b7cf6 100%)',
      boxShadow:
        '0 0 0 2px #22e6c5, 0 0 12px rgba(34,230,197,0.5), 0 0 2px #8b7cf6 inset',
    }
  if (frame === 'frutiger-aero')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(160deg, rgba(180,230,255,0.95) 0%, rgba(120,200,240,0.7) 35%, rgba(90,180,220,0.55) 70%, rgba(200,240,255,0.85) 100%)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.75), inset 0 2px 6px rgba(255,255,255,0.85), inset 0 -2px 8px rgba(40,120,180,0.25), 0 8px 22px rgba(60,140,200,0.35)',
    }

  if (frame === 'pulse')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #ff6b9d, #ff3d7f)',
      boxShadow: '0 0 0 2px rgba(255,61,127,0.5), 0 0 18px rgba(255,61,127,0.45)',
    }
  if (frame === 'aurora')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(120deg, #22e6c5, #5b8cff, #c084fc, #22e6c5)',
      boxShadow: '0 0 16px rgba(91,140,255,0.4)',
    }
  if (frame === 'sunset')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #ffb347, #ff6b6b, #c44dff)',
      boxShadow: '0 6px 18px rgba(255,107,107,0.35)',
    }
  if (frame === 'ice')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #e8f7ff, #a8d8ff, #7ec8ff)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.7), 0 8px 20px rgba(126,200,255,0.35)',
    }
  if (frame === 'lava')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #ffeb3b, #ff5722, #b71c1c)',
      boxShadow: '0 0 16px rgba(255,87,34,0.45)',
    }
  if (frame === 'mint')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #d4fff0, #22e6c5, #0d9488)',
      boxShadow: '0 0 12px rgba(34,230,197,0.35)',
    }
  if (frame === 'violet')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #e9d5ff, #8b5cf6, #5b21b6)',
      boxShadow: '0 0 16px rgba(139,92,246,0.4)',
    }
  if (frame === 'chrome')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(135deg, #fff 0%, #bbb 30%, #666 50%, #ddd 70%, #fff 100%)',
      boxShadow:
        'inset 0 1px 2px rgba(255,255,255,0.8), 0 4px 14px rgba(0,0,0,0.3)',
    }
  if (frame === 'pixel')
    return {
      ...base,
      padding: 3,
      background:
        'repeating-linear-gradient(90deg, #22e6c5 0 4px, #8b5cf6 4px 8px)',
      boxShadow: '0 0 0 2px #0B1220',
    }
  if (frame === 'orbit')
    return {
      ...base,
      padding: 4,
      background:
        'conic-gradient(from 0deg, #22e6c5, transparent 40%, #8b5cf6, transparent 80%, #22e6c5)',
      boxShadow: '0 0 12px rgba(34,230,197,0.3)',
    }
  if (frame === 'rainbow')
    return {
      ...base,
      padding: 3,
      background:
        'conic-gradient(from 0deg, #ff6b6b, #ffb347, #ffe66d, #22e6c5, #5b8cff, #c084fc, #ff6b6b)',
      boxShadow: '0 0 18px rgba(192,132,252,0.4)',
    }
  if (frame === 'emerald')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #a7f3d0, #10b981, #064e3b)',
      boxShadow: '0 0 14px rgba(16,185,129,0.4)',
    }
  if (frame === 'rose')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fecdd3, #f43f5e, #9f1239)',
      boxShadow: '0 0 14px rgba(244,63,94,0.4)',
    }

  if (frame === 'midnight')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #1e1b4b, #312e81, #0f172a)',
      boxShadow: '0 0 14px rgba(99,102,241,0.35)',
    }
  if (frame === 'solar')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fef08a, #f59e0b, #ea580c)',
      boxShadow: '0 0 16px rgba(245,158,11,0.45)',
    }
  if (frame === 'neon-pink')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #f472b6, #db2777, #9d174d)',
      boxShadow: '0 0 0 1px #f472b6, 0 0 18px rgba(244,114,182,0.55)',
    }
  if (frame === 'copper')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fdba74, #c2410c, #7c2d12)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 4px 14px rgba(194,65,12,0.35)',
    }
  if (frame === 'glitch')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(90deg, #22e6c5 0%, #ff2d55 50%, #8b5cf6 100%)',
      boxShadow: '2px 0 0 #22e6c5, -2px 0 0 #ff2d55',
    }
  if (frame === 'ocean')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #67e8f9, #0284c7, #1e3a8a)',
      boxShadow: '0 0 16px rgba(2,132,199,0.4)',
    }
  if (frame === 'forest')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #86efac, #16a34a, #14532d)',
      boxShadow: '0 0 14px rgba(22,163,74,0.35)',
    }
  if (frame === 'candy')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fda4af, #e879f9, #a78bfa)',
      boxShadow: '0 0 14px rgba(232,121,249,0.4)',
    }
  if (frame === 'steel')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(135deg, #e2e8f0, #64748b, #1e293b, #94a3b8)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.3)',
    }
  if (frame === 'plasma')
    return {
      ...base,
      padding: 3,
      background: 'conic-gradient(from 90deg, #22e6c5, #8b5cf6, #f472b6, #22e6c5)',
      boxShadow: '0 0 18px rgba(139,92,246,0.45)',
    }
  if (frame === 'duo')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(90deg, #0a0a0a 50%, #f5f5f5 50%)',
      boxShadow: '0 0 0 2px var(--gco-primary, #22e6c5)',
    }

  if (frame === 'amber')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fcd34d,#d97706,#92400e)', boxShadow: '0 0 14px rgba(217,119,6,0.4)' }
  if (frame === 'indigo')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a5b4fc,#4f46e5,#1e1b4b)', boxShadow: '0 0 14px rgba(79,70,229,0.4)' }
  if (frame === 'lime')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#bef264,#65a30d,#365314)', boxShadow: '0 0 14px rgba(101,163,13,0.4)' }
  if (frame === 'crimson')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fca5a5,#dc2626,#7f1d1d)', boxShadow: '0 0 14px rgba(220,38,38,0.45)' }
  if (frame === 'sapphire')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#93c5fd,#2563eb,#1e3a8a)', boxShadow: '0 0 16px rgba(37,99,235,0.45)' }
  if (frame === 'pearl')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fff,#e2e8f0,#cbd5e1)', boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.15)' }
  if (frame === 'obsidian')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#334155,#0f172a,#020617)', boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' }
  if (frame === 'coral')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fda4af,#fb7185,#e11d48)', boxShadow: '0 0 14px rgba(251,113,133,0.4)' }
  if (frame === 'azure')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a5f3fc,#06b6d4,#0e7490)', boxShadow: '0 0 14px rgba(6,182,212,0.4)' }
  if (frame === 'magenta')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f0abfc,#d946ef,#a21caf)', boxShadow: '0 0 16px rgba(217,70,239,0.45)' }
  if (frame === 'bronze')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#d6b089,#a16207,#713f12)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35)' }
  if (frame === 'silver')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f8fafc,#94a3b8,#475569)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)' }
  if (frame === 'titanium')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#e2e8f0,#64748b,#334155,#94a3b8)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }
  if (frame === 'neon-blue')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#38bdf8,#0284c7)', boxShadow: '0 0 0 1px #38bdf8, 0 0 18px rgba(56,189,248,0.55)' }
  if (frame === 'neon-green')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#4ade80,#16a34a)', boxShadow: '0 0 0 1px #4ade80, 0 0 18px rgba(74,222,128,0.55)' }
  if (frame === 'fire')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fef08a,#f97316,#b91c1c)', boxShadow: '0 0 16px rgba(249,115,22,0.5)' }
  if (frame === 'frost')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#e0f2fe,#7dd3fc,#38bdf8)', boxShadow: '0 0 14px rgba(125,211,252,0.45)' }
  if (frame === 'galaxy')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 30% 30%,#c084fc,#312e81,#0f172a)', boxShadow: '0 0 16px rgba(192,132,252,0.4)' }
  if (frame === 'prism')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#f472b6,#38bdf8,#4ade80,#fbbf24,#f472b6)', boxShadow: '0 0 16px rgba(56,189,248,0.35)' }
  if (frame === 'vapor')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#f9a8d4,#67e8f9,#c4b5fd)', boxShadow: '0 0 14px rgba(249,168,212,0.4)' }
  if (frame === 'retro')
    return { ...base, padding: 3, background: 'linear-gradient(90deg,#f97316,#ec4899,#8b5cf6)', boxShadow: '2px 0 0 #22e6c5, -2px 0 0 #f97316' }
  if (frame === 'noir')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#52525b,#18181b,#09090b)', boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }
  if (frame === 'sunrise')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fde68a,#fb923c,#f43f5e)', boxShadow: '0 0 14px rgba(251,146,60,0.4)' }
  if (frame === 'twilight')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#c4b5fd,#6366f1,#312e81)', boxShadow: '0 0 14px rgba(99,102,241,0.4)' }
  if (frame === 'jade')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#6ee7b7,#059669,#064e3b)', boxShadow: '0 0 14px rgba(5,150,105,0.4)' }
  if (frame === 'ruby')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fb7185,#e11d48,#881337)', boxShadow: '0 0 14px rgba(225,29,72,0.45)' }
  if (frame === 'opal')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#e0e7ff,#fce7f3,#d1fae5,#e0e7ff)', boxShadow: '0 0 12px rgba(224,231,255,0.5)' }
  if (frame === 'quartz')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f5f3ff,#ddd6fe,#a78bfa)', boxShadow: '0 0 12px rgba(167,139,250,0.35)' }
  if (frame === 'nebula')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 70% 40%,#f472b6,#7c3aed,#0f172a)', boxShadow: '0 0 16px rgba(124,58,237,0.45)' }
  if (frame === 'comet')
    return { ...base, padding: 3, background: 'linear-gradient(120deg,#e0f2fe,#38bdf8,#1e3a8a)', boxShadow: '0 0 14px rgba(56,189,248,0.4)' }
  if (frame === 'eclipse')
    return { ...base, padding: 3, background: 'radial-gradient(circle,#1e293b 40%,#fbbf24 42%,#0f172a 70%)', boxShadow: '0 0 16px rgba(251,191,36,0.3)' }
  if (frame === 'bloom')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fbcfe8,#f472b6,#db2777)', boxShadow: '0 0 14px rgba(244,114,182,0.4)' }
  if (frame === 'storm')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#94a3b8,#334155,#0f172a)', boxShadow: '0 0 12px rgba(148,163,184,0.35)' }
  if (frame === 'honey')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fde68a,#f59e0b,#b45309)', boxShadow: '0 0 14px rgba(245,158,11,0.4)' }
  if (frame === 'mint-glow')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a7f3d0,#34d399,#059669)', boxShadow: '0 0 16px rgba(52,211,153,0.45)' }
  if (frame === 'lava-ring')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#f97316,#b91c1c,#f97316)', boxShadow: '0 0 16px rgba(185,28,28,0.45)' }
  if (frame === 'ice-ring')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#e0f2fe,#38bdf8,#e0f2fe)', boxShadow: '0 0 14px rgba(56,189,248,0.4)' }
  if (frame === 'gold-pulse')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fef08a,#eab308,#a16207)', boxShadow: '0 0 16px rgba(234,179,8,0.45)' }
  if (frame === 'cyber-grid')
    return { ...base, padding: 3, background: 'repeating-linear-gradient(90deg,#22e6c5 0 3px,#0B1220 3px 6px)', boxShadow: '0 0 0 2px #22e6c5' }
  if (frame === 'holo-wave')
    return { ...base, padding: 3, background: 'linear-gradient(90deg,#22e6c5,#8b5cf6,#f472b6,#22e6c5)', boxShadow: '0 0 16px rgba(139,92,246,0.4)' }
  if (frame === 'shadow')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#3f3f46,#18181b)', boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }
  if (frame === 'bloom-pink')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fce7f3,#f9a8d4,#ec4899)', boxShadow: '0 0 14px rgba(236,72,153,0.4)' }
  if (frame === 'arctic')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#f0f9ff,#bae6fd,#7dd3fc)', boxShadow: '0 0 14px rgba(125,211,252,0.4)' }
  if (frame === 'volcano')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fecaca,#ef4444,#7f1d1d)', boxShadow: '0 0 16px rgba(239,68,68,0.45)' }
  if (frame === 'meadow')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#d9f99d,#84cc16,#3f6212)', boxShadow: '0 0 14px rgba(132,204,22,0.35)' }
  if (frame === 'royal')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fde68a,#a855f7,#1e1b4b)', boxShadow: '0 0 16px rgba(168,85,247,0.4)' }
  if (frame === 'sunset-glow')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fdba74,#f97316,#db2777)', boxShadow: '0 0 14px rgba(249,115,22,0.4)' }
  if (frame === 'electric')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fef08a,#22e6c5,#3b82f6)', boxShadow: '0 0 0 1px #22e6c5, 0 0 18px rgba(34,230,197,0.5)' }
  if (frame === 'pastel')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fbcfe8,#c7d2fe,#bbf7d0)', boxShadow: '0 0 12px rgba(199,210,254,0.4)' }
  if (frame === 'mono')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a1a1aa,#52525b,#27272a)', boxShadow: '0 0 0 1px rgba(255,255,255,0.2)' }
  if (frame === 'triad')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#22e6c5 0 120deg,#8b5cf6 120deg 240deg,#f472b6 240deg 360deg)', boxShadow: '0 0 14px rgba(139,92,246,0.35)' }
  if (frame === 'spectrum')
    return { ...base, padding: 3, background: 'conic-gradient(from 180deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)', boxShadow: '0 0 16px rgba(59,130,246,0.35)' }
  if (frame === 'aurora-borealis')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#0f2027,#2c5364 30%,#22e6c5 60%,#8b7cf6 100%)', boxShadow: '0 0 0 1px rgba(139,124,246,0.4), 0 0 22px rgba(34,230,197,0.4)' }
  if (frame === 'liquid-gold')
    return { ...base, padding: 4, background: 'linear-gradient(160deg,#fff7d6 0%,#f5cc4d 25%,#c98a12 50%,#fff2b8 75%,#b8860b 100%)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 8px 20px rgba(184,134,11,0.4)' }
  if (frame === 'deep-sea')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#001220,#003554,#0077b6,#00b4d8)', boxShadow: '0 0 0 1px rgba(0,180,216,0.5), 0 0 18px rgba(0,119,182,0.4)' }
  if (frame === 'cherry-blossom')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ffe4ef,#ffb3d1,#ff8fc0)', boxShadow: '0 0 0 1px rgba(255,143,192,0.5), 0 6px 16px rgba(255,143,192,0.35)' }
  if (frame === 'volt')
    return { ...base, padding: 3, background: 'linear-gradient(120deg,#d4ff00,#a3e635)', boxShadow: '0 0 0 2px rgba(212,255,0,0.6), 0 0 20px rgba(212,255,0,0.5)' }
  if (frame === 'obsidian-gold')
    return { ...base, padding: 3, background: 'linear-gradient(155deg,#0a0a0a 0%,#1c1c1c 40%,#c9a227 70%,#0a0a0a 100%)', boxShadow: '0 0 0 1px rgba(201,162,39,0.55), 0 8px 20px rgba(0,0,0,0.5)' }
  if (frame === 'peach')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ffe5d4,#ffb088,#ff8a5c)', boxShadow: '0 6px 16px rgba(255,138,92,0.35)' }
  if (frame === 'cosmic-purple')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 30% 30%,#c084fc,#7c3aed 55%,#1e1b4b 100%)', boxShadow: '0 0 0 1px rgba(124,58,237,0.5), 0 0 20px rgba(124,58,237,0.4)' }
  if (frame === 'terra')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#e9c9a6,#c97b45,#8a4a2b)', boxShadow: '0 6px 16px rgba(138,74,43,0.35)' }
  if (frame === 'mercury')
    return { ...base, padding: 4, background: 'linear-gradient(135deg,#e6e9f0,#9aa4b5 30%,#4b5566 55%,#c9d0da 80%,#f2f4f7 100%)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.7), 0 6px 16px rgba(0,0,0,0.3)' }
  if (frame === 'blood-orange')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ff9a5c,#ff5c33,#8f1c1c)', boxShadow: '0 0 16px rgba(255,92,51,0.45)' }
  if (frame === 'moss')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#eaf5d0,#8bb34a,#3f5c1f)', boxShadow: '0 6px 16px rgba(63,92,31,0.35)' }
  if (frame === 'ultraviolet')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#7b2ff7,#f107a3)', boxShadow: '0 0 0 2px rgba(123,47,247,0.5), 0 0 22px rgba(241,7,163,0.45)' }
  if (frame === 'champagne')
    return { ...base, padding: 4, background: 'linear-gradient(160deg,#fdf3e3,#e8c9a0,#c9a670,#f5e2c0)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), 0 6px 16px rgba(201,166,112,0.35)' }
  if (frame === 'graphite')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#3a3a3a,#1a1a1a,#050505)', boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 6px 16px rgba(0,0,0,0.5)' }
  if (frame === 'lagoon')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#a8f0e0,#22c1a8,#0d6e63)', boxShadow: '0 0 14px rgba(34,193,168,0.4)' }
  return {
    ...base,
    padding: 2,
    background: 'var(--gco-glass-border)',
    boxShadow: 'none',
  }
}
