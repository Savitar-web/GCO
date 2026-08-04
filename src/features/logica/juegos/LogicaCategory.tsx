import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { getGameProgress } from '@/core/storage/progress'
import { soundClick } from '@/core/audio/uiSounds'

const GAMES = [
  {
    id: 'numberpuzzle',
    title: 'Colocador',
    emoji: '🔢',
    desc: 'Ordena los números deslizando fichas. Empieza en 2×2 y sube de dificultad sin límite.',
  },
  {
    id: 'rompecabezas',
    title: 'Rompecabezas',
    emoji: '🧩',
    desc: 'Arma imágenes por piezas. Modo normal, creativo, galería e importación de tus fotos.',
  },
] as const

export function LogicaCategory() {
  const navigate = useNavigate()

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.5rem' }}>
        <button
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            navigate('/')
          }}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          ← Volver
        </button>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.1rem)' }}>🧩 Lógica</h1>
        <p style={{ color: 'var(--gco-ink-muted)', marginTop: '0.35rem' }}>
          Entrena razonamiento, planificación y resolución de problemas.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {GAMES.map((game, i) => {
          const progress = getGameProgress('logica', game.id)
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <GlassCard
                onClick={() => {
                  soundClick()
                  navigate(`/categoria/logica/${game.id}`)
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
                  <div style={{ flex: 1 }}>
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
                    {progress.highestLevel > 0 && (
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--gco-primary)',
                          marginTop: '0.35rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        Nivel {progress.highestLevel}
                      </p>
                    )}
                  </div>
                  <span style={{ color: 'var(--gco-ink-faint)', fontSize: '1.25rem' }}>
                    →
                  </span>
                </div>
              </GlassCard>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
