import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { getProfile } from '../../core/storage/userProfile'

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

export function CategoryMenu() {
  const navigate = useNavigate()
  const profile = getProfile()

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.75rem',
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
              fontSize: 'clamp(1.55rem, 5vw, 2.1rem)',
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
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <ThemeToggle />

          <button
            type="button"
            className="theme-cycle-btn"
            aria-label="Abrir ajustes"
            onClick={() => navigate('/ajustes')}
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
            <GlassCard onClick={() => navigate(`/categoria/${cat.id}`)}>
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

            <footer
        style={{
          marginTop: '2.5rem',
          paddingBottom: '0.5rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '0.7rem',
            color: 'var(--gco-ink-faint, var(--gco-ink-muted))',
            opacity: 0.55,
            letterSpacing: '0.02em',
          }}
        >
          Desarrollado por Savitar Xeno
        </p>
      </footer>
      
    </div>
  )
}