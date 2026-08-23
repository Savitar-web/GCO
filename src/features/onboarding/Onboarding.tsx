import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { GlassButton } from '../../components/ui/GlassButton'
import { BackupModal } from '../../components/ui/BackupModal'
import { saveProfile, getProfile } from '../../core/storage/userProfile'
import { soundClick, soundSuccess, soundFail } from '../../core/audio/uiSounds'

interface Props {
  onComplete: () => void
}

const AVATAR_SIZE = 96
const TARGET_PX = 512

function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - side) / 2
        const sy = (img.naturalHeight - side) / 2
        const canvas = document.createElement('canvas')
        canvas.width = TARGET_PX
        canvas.height = TARGET_PX
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('ctx')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_PX, TARGET_PX)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

export function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      soundClick()
      const dataUrl = await fileToAvatarDataUrl(file)
      setAvatar(dataUrl)
      soundSuccess()
    } catch {
      soundFail()
      setError('No se pudo usar esa imagen')
    }
  }

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
      avatarDataUrl: avatar,
    })
    setTimeout(() => onComplete(), 250)
  }

  const afterBackupClose = () => {
    setBackupOpen(false)
    const p = getProfile()
    if (p?.name && String(p.name).length >= 2) {
      soundSuccess()
      onComplete()
    }
  }

  return (
    <main
      className="app-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '1.75rem',
        padding: '1rem',
      }}
    >
      <motion.header
        initial={{ opacity: 0, y: -25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
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
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '1.05rem', lineHeight: 1.5 }}>
          Entrena tu mente.
          <br />
          Crea tu perfil o restaura una copia de seguridad.
        </p>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        <GlassCard>
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  fileRef.current?.click()
                }}
                aria-label="Elegir foto de perfil"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: '50%',
                  border: '1.5px solid var(--gco-glass-border)',
                  padding: 0,
                  overflow: 'hidden',
                  background: 'var(--gco-glass-bg)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: '100%',
                      height: '100%',
                      fontSize: '0.75rem',
                      color: 'var(--gco-ink-muted)',
                    }}
                  >
                    Foto
                  </span>
                )}
              </button>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>Foto de perfil</p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                    lineHeight: 1.4,
                  }}
                >
                  Opcional. Toca el círculo para elegir una imagen.
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onAvatar(e)}
              />
            </div>

            <div>
              <label htmlFor="name" style={labelStyle}>
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
              <small style={helperStyle}>Aparecerá en tu progreso de entrenamiento.</small>
            </div>

            <div>
              <label htmlFor="age" style={labelStyle}>
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
              <small style={helperStyle}>Se usa para personalizar la experiencia.</small>
            </div>

            {error && (
              <p
                style={{
                  margin: 0,
                  padding: '0.75rem',
                  borderRadius: 12,
                  background: 'rgba(255,80,80,.12)',
                  color: 'var(--gco-secondary)',
                  fontSize: '0.9rem',
                }}
              >
                {error}
              </p>
            )}

            <GlassButton type="submit" disabled={isSaving} style={{ marginTop: '0.25rem', minHeight: 48 }}>
              {isSaving ? 'Preparando entrenamiento...' : 'Empezar a entrenar'}
            </GlassButton>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--gco-glass-border)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>o</span>
              <span style={{ flex: 1, height: 1, background: 'var(--gco-glass-border)' }} />
            </div>

            <button
              type="button"
              className="glass-button secondary"
              style={{ minHeight: 48 }}
              onClick={() => {
                soundClick()
                setBackupOpen(true)
              }}
            >
              Ya tengo una copia de seguridad
            </button>
          </form>
        </GlassCard>
      </motion.div>

      <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.8rem' }}>
        Tu progreso se guarda localmente en este dispositivo.
      </p>

      <BackupModal open={backupOpen} onClose={afterBackupClose} />
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