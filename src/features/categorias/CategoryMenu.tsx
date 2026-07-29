import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { getProfile } from '../../core/storage/userProfile'
import { exportData } from '../../core/storage/exportImport'

const CATEGORIES = [
  { id: 'memoria', title: 'Memoria', emoji: '🧠', desc: 'Cartas, secuencias, asociaciones' },
  { id: 'logica', title: 'Lógica', emoji: '🧩', desc: 'Patrones, razonamiento, puzzles' },
  { id: 'deduccion', title: 'Deducción', emoji: '🔍', desc: 'Inferencias y pistas' },
  { id: 'lectura', title: 'Lectura', emoji: '📖', desc: 'Comprensión y velocidad' },
  { id: 'conocimiento', title: 'Conocimiento', emoji: '🌍', desc: 'Cultura general y datos' },
  { id: 'matematicas', title: 'Matemáticas', emoji: '🔢', desc: 'Cálculo, Sudoku y más' },
] as const

export function CategoryMenu() {
  const navigate = useNavigate()
  const profile = getProfile()

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.75rem' }}>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.95rem' }}>
          Hola, {profile?.name ?? 'Atleta mental'}
        </p>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.1rem)' }}>¿Qué quieres entrenar?</h1>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '1rem',
        }}
      >
        {CATEGORIES.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
          >
            <GlassCard
              onClick={() => navigate(`/categoria/${cat.id}`)}
              className=""
            >
              <div style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{cat.emoji}</div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>{cat.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', lineHeight: 1.35 }}>
                  {cat.desc}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <div style={{ marginTop: '2.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className="glass-button secondary"
          onClick={exportData}
          style={{ fontSize: '0.9rem' }}
        >
          Exportar datos
        </button>
        {/* Import se implementa fácilmente con <input type="file"> */}
      </div>
    </div>
  )
}