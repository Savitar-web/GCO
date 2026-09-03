import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { getGameProgress } from '@/core/storage/progress'
import { soundClick } from '@/core/audio/uiSounds'

const GAMES = [
  {
    id: 'acertijos',
    title: 'Acertijos y adivinanzas',
    emoji: '🧩',
    desc: 'Opción múltiple. Solo avanzas si aciertas; los fallados no se repiten en niveles posteriores.',
  },
  {
    id: 'historias',
    title: 'Casos de detective',
    emoji: '🔍',
    desc: 'Historias reales.',
  },
  {
    id: 'palabras',
    title: 'Palabras ocultas',
    emoji: '🔤',
    desc: 'Anagramas, ahorcado y crucigramas con todas las combinaciones válidas.',
  },
  {
    id: 'silogismos',
    title: 'Silogismos',
    emoji: '⚖️',
    desc: 'Premisas → conclusión válida. Trampas de cuantificadores, negaciones y falacias sutiles.',
  },
  {
    id: 'mapas',
    title: 'Mapas mentales',
    emoji: '🗺️',
    desc: 'Relaciones espaciales, grafos y restricciones. Deduce posiciones y trayectos.',
  },
  {
    id: 'codigo',
    title: 'Código cifrado',
    emoji: '🔐',
    desc: 'Cifrados, patrones y reglas ocultas. Decodifica mensajes con evidencia limitada.',
  },
  {
    id: 'idiomas',
    title: 'Idiomas',
    emoji: '🌐',
    desc: 'Traducción, gramática y cognados en español, inglés, japonés, chino y francés.',
  },
] as const

export function DeduccionCategory() {
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
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginBottom: '1rem' }}
        >
          ← Volver
        </button>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.1rem)' }}>🔍 Deducción</h1>
        <p style={{ color: 'var(--gco-ink-muted)', marginTop: '0.35rem' }}>
          Entrena inferencias, patrones y razonamiento.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {GAMES.map((game, i) => {
          const best = getGameProgress('deduccion', game.id).highestLevel
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <GlassCard
                onClick={() => {
                  soundClick()
                  navigate(`/categoria/deduccion/${game.id}`)
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
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>{game.title}</h3>
                    <p
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--gco-ink-muted)',
                        lineHeight: 1.35,
                      }}
                    >
                      {game.desc}
                    </p>
                    {best > 0 && (
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--gco-primary)',
                          marginTop: '0.35rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        Nivel {best}
                      </p>
                    )}
                  </div>
                  <span style={{ color: 'var(--gco-ink-faint)', fontSize: '1.25rem' }}>→</span>
                </div>
              </GlassCard>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}