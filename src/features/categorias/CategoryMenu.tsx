import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { ModeSwitch } from '@/components/ui/ModeSwitch'
import { getProfile } from '../../core/storage/userProfile'
import { soundClick } from '@/core/audio/uiSounds'

const CATEGORIES = [
  {
    id: 'memoria',
    title: 'Memoria',
    emoji: '🧠',
    desc: 'Cartas, secuencias, asociaciones',
  },
  {
    id: 'logica',
    title: 'Lógica',
    emoji: '🧩',
    desc: 'Patrones, razonamiento, puzzles',
  },
  {
    id: 'deduccion',
    title: 'Deducción',
    emoji: '🔍',
    desc: 'Inferencias y pistas',
  },
  {
    id: 'lectura',
    title: 'Lectura',
    emoji: '📖',
    desc: 'Comprensión y velocidad',
  },
  {
    id: 'conocimiento',
    title: 'Conocimiento',
    emoji: '🌍',
    desc: 'Cultura general y datos',
  },
  {
    id: 'matematicas',
    title: 'Matemáticas',
    emoji: '🔢',
    desc: 'Cálculo, Sudoku y más',
  },
] as const

/** Partículas fijas (posiciones % + color + tamaño) para el banner GAMES */
const PARTICLES: {
  left: string
  top: string
  size: number
  color: string
  delay: string
  dur: string
}[] = [
  { left: '6%', top: '18%', size: 3, color: '#ff3b3b', delay: '0s', dur: '2.4s' },
  { left: '12%', top: '72%', size: 2, color: '#ffffff', delay: '0.3s', dur: '3.1s' },
  { left: '18%', top: '40%', size: 2.5, color: '#4da3ff', delay: '0.6s', dur: '2.8s' },
  { left: '24%', top: '22%', size: 2, color: '#ff5a5a', delay: '0.2s', dur: '3.4s' },
  { left: '30%', top: '78%', size: 3, color: '#6ec8ff', delay: '0.9s', dur: '2.6s' },
  { left: '38%', top: '14%', size: 2, color: '#ffffff', delay: '0.4s', dur: '3.2s' },
  { left: '44%', top: '68%', size: 2.5, color: '#ff2d2d', delay: '1.1s', dur: '2.9s' },
  { left: '52%', top: '28%', size: 3, color: '#5eb8ff', delay: '0.1s', dur: '3.0s' },
  { left: '58%', top: '80%', size: 2, color: '#ffffff', delay: '0.7s', dur: '2.5s' },
  { left: '64%', top: '20%', size: 2.5, color: '#ff4444', delay: '0.5s', dur: '3.3s' },
  { left: '70%', top: '55%', size: 3, color: '#7ad0ff', delay: '0.8s', dur: '2.7s' },
  { left: '76%', top: '35%', size: 2, color: '#ffffff', delay: '1.2s', dur: '3.1s' },
  { left: '82%', top: '70%', size: 2.5, color: '#ff3b3b', delay: '0.35s', dur: '2.8s' },
  { left: '88%', top: '25%', size: 3, color: '#4da3ff', delay: '0.95s', dur: '3.4s' },
  { left: '92%', top: '60%', size: 2, color: '#ffffff', delay: '0.15s', dur: '2.6s' },
  { left: '8%', top: '50%', size: 1.5, color: '#ff6b6b', delay: '1.4s', dur: '3.0s' },
  { left: '48%', top: '48%', size: 1.5, color: '#a8d8ff', delay: '0.55s', dur: '2.9s' },
  { left: '95%', top: '42%', size: 2, color: '#ff2a2a', delay: '1.0s', dur: '3.2s' },
  { left: '15%', top: '12%', size: 1.5, color: '#ffffff', delay: '0.75s', dur: '2.4s' },
  { left: '85%', top: '85%', size: 2, color: '#5eb8ff', delay: '1.3s', dur: '2.7s' },
]

export function CategoryMenu() {
  const navigate = useNavigate()
  const profile = getProfile()

  return (
    <div className="app-shell">
      <style>{`
        @keyframes gco-games-spark {
          0%, 100% { opacity: 0.35; transform: scale(0.85) translateY(0); }
          50% { opacity: 1; transform: scale(1.15) translateY(-3px); }
        }
        @keyframes gco-games-streak {
          0% { opacity: 0; transform: translateX(-8px) scaleX(0.6); }
          40% { opacity: 0.9; }
          100% { opacity: 0; transform: translateX(18px) scaleX(1.2); }
        }
        .gco-games-banner {
          position: relative;
          display: block;
          width: 100%;
          margin-top: 1.75rem;
          padding: 0;
          border: 1px solid var(--gco-glass-border, rgba(255,255,255,0.14));
          border-radius: 18px;
          background: transparent;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 8px 28px rgba(0,0,0,0.18);
          cursor: pointer;
          overflow: hidden;
          font: inherit;
          color: inherit;
          text-align: center;
          min-height: 96px;
        }
        .gco-games-banner:active {
          transform: scale(0.985);
        }
        .gco-games-title {
          position: relative;
          z-index: 2;
          margin: 0;
          padding: 1.35rem 1rem;
          font-size: clamp(2.4rem, 11vw, 3.4rem);
          font-weight: 900;
          letter-spacing: 0.04em;
          line-height: 1;
          font-style: italic;
          text-transform: uppercase;
          color: #0a0a0a;
          -webkit-text-stroke: 2.5px #f5f5f5;
          paint-order: stroke fill;
          text-shadow:
            3px 3px 0 #111,
            -1px -1px 0 #fff,
            0 0 18px rgba(255,255,255,0.25);
          filter: contrast(1.05);
          user-select: none;
        }
        .gco-games-particle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          animation-name: gco-games-spark;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .gco-games-streak {
          position: absolute;
          height: 1.5px;
          border-radius: 2px;
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          animation-name: gco-games-streak;
          animation-timing-function: ease-out;
          animation-iteration-count: infinite;
        }
      `}</style>

      <header style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                color: 'var(--gco-ink-muted)',
                fontSize: '0.95rem',
                marginBottom: '0.2rem',
              }}
            >
              Hola, {profile?.name ?? 'Atleta mental'}
            </p>
            <h1
              style={{
                fontSize: 'clamp(1.45rem, 5vw, 2.1rem)',
                lineHeight: 1.2,
              }}
            >
              ¿Qué quieres entrenar?
            </h1>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              flexShrink: 0,
            }}
          >
            <div className="mode-switch-desktop">
              <ModeSwitch />
            </div>
            <ThemeToggle />
            <button
              type="button"
              className="theme-cycle-btn"
              aria-label="Abrir ajustes"
              onClick={() => {
                soundClick()
                navigate('/ajustes')
              }}
              style={{ width: 44, height: 44, padding: 0, borderRadius: 12 }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 2,
                    background: 'currentColor',
                    borderRadius: 2,
                  }}
                />
                <span
                  style={{
                    width: 18,
                    height: 2,
                    background: 'currentColor',
                    borderRadius: 2,
                  }}
                />
                <span
                  style={{
                    width: 18,
                    height: 2,
                    background: 'currentColor',
                    borderRadius: 2,
                  }}
                />
              </span>
            </button>
          </div>
        </div>

        <div className="mode-switch-mobile" style={{ marginTop: '0.85rem' }}>
          <ModeSwitch fullWidth />
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '1rem',
        }}
      >
        {CATEGORIES.map((cat, index) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.35 }}
          >
            <GlassCard
              onClick={() => {
                soundClick()
                navigate(`/categoria/${cat.id}`)
              }}
            >
              <div style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '2rem',
                    marginBottom: '0.5rem',
                    lineHeight: 1,
                  }}
                >
                  {cat.emoji}
                </div>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  {cat.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.35,
                  }}
                >
                  {cat.desc}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Banner GAMES — liquid glass, sin fondo sólido */}
      <motion.button
        type="button"
        className="gco-games-banner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        aria-label="Abrir Games"
        onClick={() => {
          soundClick()
          navigate('/games')
        }}
      >
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="gco-games-particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animationDuration: p.dur,
              animationDelay: p.delay,
            }}
          />
        ))}
        {/* Estelas rojas / azules */}
        <span
          className="gco-games-streak"
          style={{
            left: '10%',
            top: '30%',
            width: 28,
            background: 'linear-gradient(90deg, transparent, #ff3b3b, transparent)',
            animationDuration: '2.8s',
            animationDelay: '0.2s',
          }}
        />
        <span
          className="gco-games-streak"
          style={{
            left: '70%',
            top: '65%',
            width: 36,
            background: 'linear-gradient(90deg, transparent, #4da3ff, transparent)',
            animationDuration: '3.2s',
            animationDelay: '0.9s',
          }}
        />
        <span
          className="gco-games-streak"
          style={{
            left: '40%',
            top: '18%',
            width: 22,
            background: 'linear-gradient(90deg, transparent, #ffffff, transparent)',
            animationDuration: '2.5s',
            animationDelay: '1.4s',
          }}
        />
        <p className="gco-games-title">GAMES</p>
      </motion.button>

      <footer
        style={{
          marginTop: '1.75rem',
          paddingBottom: '0.75rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '0.72rem',
            color: 'var(--gco-ink-muted)',
            opacity: 0.5,
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          Desarrollado por{' '}
          <span
            style={{
              fontWeight: 600,
              opacity: 0.85,
              background:
                'linear-gradient(90deg, var(--gco-primary, #22E6C5), #8B5CF6)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Savitar Xeno
          </span>
        </p>
      </footer>
    </div>
  )
}