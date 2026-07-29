import { useState } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { GlassButton } from '../../components/ui/GlassButton'
import { saveProfile } from '../../core/storage/userProfile'

interface Props {
  onComplete: () => void
}

export function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    const ageNum = parseInt(age, 10)

    if (!trimmed || trimmed.length < 2) {
      setError('Escribe un nombre válido (mínimo 2 caracteres)')
      return
    }
    if (isNaN(ageNum) || ageNum < 5 || ageNum > 120) {
      setError('Edad entre 5 y 120 años')
      return
    }

    saveProfile({
      name: trimmed,
      age: ageNum,
      createdAt: new Date().toISOString(),
    })
    onComplete()
  }

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2rem' }}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 style={{ fontSize: 'clamp(1.8rem, 6vw, 2.4rem)', marginBottom: '0.5rem' }}>
          GymCogOrigins
        </h1>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '1.05rem' }}>
          Entrena tu mente. Empieza por presentarte.
        </p>
      </motion.div>

      <GlassCard>
        <form onSubmit={handleSubmit} style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>
              Tu nombre
            </label>
            <input
              id="name"
              className="glass-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="Ej: Alex"
              autoComplete="name"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="age" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>
              Edad
            </label>
            <input
              id="age"
              className="glass-input"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => {
                setAge(e.target.value)
                setError('')
              }}
              placeholder="Ej: 24"
              min={5}
              max={120}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--gco-secondary)', fontSize: '0.9rem' }}>{error}</p>
          )}

          <GlassButton type="submit" style={{ marginTop: '0.5rem' }}>
            Empezar a entrenar
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  )
}