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
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    const ageNumber = Number(age)

    if (!trimmedName) {
      setError('Escribe tu nombre para continuar')
      return
    }

    if (trimmedName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      return
    }

    if (!Number.isInteger(ageNumber) || ageNumber < 5 || ageNumber > 120) {
      setError('La edad debe estar entre 5 y 120 años')
      return
    }

    setIsSaving(true)

    saveProfile({
      name: trimmedName,
      age: ageNumber,
      createdAt: new Date().toISOString(),
      avatarDataUrl: null,
    })

    setTimeout(() => {
      onComplete()
    }, 250)
  }

  return (
    <main
      className="app-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2rem',
        padding: '1rem',
      }}
    >

      {/* Encabezado */}
      <motion.header
        initial={{
          opacity: 0,
          y: -25,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          duration: 0.5,
        }}
      >

        <h1
          style={{
            fontSize: 'clamp(2rem, 7vw, 2.8rem)',
            marginBottom: '0.5rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          GymCogOrigins
        </h1>


        <p
          style={{
            color: 'var(--gco-ink-muted)',
            fontSize: '1.05rem',
            lineHeight: 1.5,
          }}
        >
          Entrena tu mente.
          <br />
          Crea tu perfil para comenzar.
        </p>

      </motion.header>



      {/* Tarjeta principal */}
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.96,
        }}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        transition={{
          duration: 0.35,
        }}
      >

        <GlassCard>

          <form
            onSubmit={handleSubmit}
            style={{
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.35rem',
            }}
          >


            {/* Nombre */}
            <div>

              <label
                htmlFor="name"
                style={labelStyle}
              >
                Nombre del jugador
              </label>


              <input
                id="name"
                className="glass-input"
                type="text"
                value={name}
                maxLength={40}
                autoComplete="name"
                autoFocus
                placeholder="Ej: Alex"
                onChange={(e) => {
                  setName(e.target.value)
                  setError('')
                }}
              />


              <small style={helperStyle}>
                Aparecerá en tu progreso de entrenamiento.
              </small>

            </div>



            {/* Edad */}
            <div>

              <label
                htmlFor="age"
                style={labelStyle}
              >
                Edad
              </label>


              <input
                id="age"
                className="glass-input"
                type="number"
                inputMode="numeric"
                min={5}
                max={120}
                value={age}
                placeholder="Ej: 24"
                onChange={(e) => {
                  setAge(e.target.value)
                  setError('')
                }}
              />


              <small style={helperStyle}>
                Se usa para personalizar la experiencia.
              </small>

            </div>




            {/* Error */}
            {error && (

              <motion.div
                initial={{
                  opacity: 0,
                  y: -5,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
              >

                <p
                  style={{
                    margin: 0,
                    padding: '0.75rem',
                    borderRadius: 12,
                    background:
                      'rgba(255,80,80,.12)',
                    color:
                      'var(--gco-secondary)',
                    fontSize: '0.9rem',
                  }}
                >
                  {error}
                </p>

              </motion.div>

            )}




            {/* Botón */}
            <GlassButton
              type="submit"
              disabled={isSaving}
              style={{
                marginTop: '0.5rem',
                minHeight: 48,
              }}
            >

              {isSaving
                ? 'Preparando entrenamiento...'
                : 'Empezar a entrenar'
              }

            </GlassButton>


          </form>

        </GlassCard>

      </motion.div>



      <p
        style={{
          textAlign: 'center',
          color: 'var(--gco-ink-muted)',
          fontSize: '0.8rem',
        }}
      >
        Tu progreso se guarda localmente en este dispositivo.
      </p>


    </main>
  )
}



const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.45rem',
  fontWeight: 600,
  fontSize: '0.95rem',
}



const helperStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.4rem',
  color: 'var(--gco-ink-muted)',
  fontSize: '0.78rem',
}