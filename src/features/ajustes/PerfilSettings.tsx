import { useRef, useState } from 'react'
import { getProfile, updateProfile } from '@/core/storage/userProfile'
import { GlassButton } from '@/components/ui/GlassButton'
import { downloadCredential } from './downloadCredential'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'

function compressImage(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

export function PerfilSettings() {
  const profile = getProfile()
  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [avatar, setAvatar] = useState(profile?.avatarDataUrl ?? null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    const ageNum = parseInt(age, 10)
    if (name.trim().length < 2) {
      soundFail()
      setMsg('Nombre demasiado corto')
      return
    }
    if (isNaN(ageNum) || ageNum < 5 || ageNum > 120) {
      soundFail()
      setMsg('Edad entre 5 y 120')
      return
    }
    updateProfile({
      name: name.trim(),
      age: ageNum,
      avatarDataUrl: avatar,
    })
    soundSuccess()
    setMsg('Perfil guardado')
  }

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    try {
      const dataUrl = await compressImage(file)
      setAvatar(dataUrl)
      soundClick()
    } catch {
      soundFail()
      setMsg('No se pudo cargar la imagen')
    }
    e.target.value = ''
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1rem, 3vw, 1.35rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: '2px solid var(--gco-glass-border)',
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--gco-glass-bg)',
            flexShrink: 0,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>
              Foto
            </span>
          )}
        </button>
        <div>
          <p style={{ fontWeight: 600 }}>Foto de perfil</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
            Toca para cambiar
          </p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
          Nombre
        </label>
        <input
          className="glass-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
          Edad
        </label>
        <input
          className="glass-input"
          type="number"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          style={{ maxWidth: 120 }}
        />
      </div>

      {msg && (
        <p style={{ fontSize: '0.9rem', color: 'var(--gco-primary)' }}>{msg}</p>
      )}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <GlassButton type="button" onClick={save}>
          Guardar perfil
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            const hideAge = window.confirm('¿Deseas ocultar tu edad?')
            downloadCredential({ hideAge })
          }}
        >
          Descargar credencial
        </button>
      </div>
    </div>
  )
}