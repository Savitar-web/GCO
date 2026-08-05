import { useEffect, useRef, useState } from 'react'
import {
  getProfile,
  updateProfile,
  type AvatarFrame,
} from '@/core/storage/userProfile'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  downloadCredential,
  type CredentialTheme,
} from './downloadCredential'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { listBooks, listTracks } from '@/core/storage/mediaLibrary'

const FRAMES: { id: AvatarFrame; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'metal', label: 'Metálico' },
  { id: 'neon', label: 'Neón' },
  { id: 'matte', label: 'Mate' },
  { id: 'glass', label: 'Liquid glass' },
]

const GAMES = [
  { id: 'secuencia-colores', label: 'Secuencia de colores' },
  { id: 'cartas', label: 'Memoria de cartas' },
  { id: 'numeros-asociados', label: 'Números asociados' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'numberpuzzle', label: 'Colocador' },
  { id: 'rompecabezas', label: 'Rompecabezas' },
  { id: 'despejes', label: 'Despejes' },
]

function frameStyle(frame: AvatarFrame): React.CSSProperties {
  if (frame === 'neon')
    return {
      boxShadow: '0 0 0 2px var(--gco-primary), 0 0 16px var(--gco-primary)',
    }
  if (frame === 'metal')
    return {
      boxShadow:
        '0 0 0 3px #9aa3b5, 0 0 0 5px #3a4154, inset 0 1px 0 rgba(255,255,255,0.4)',
    }
  if (frame === 'matte')
    return { boxShadow: '0 0 0 4px rgba(255,255,255,0.2)' }
  if (frame === 'glass')
    return {
      boxShadow:
        '0 0 0 2px rgba(255,255,255,0.35), 0 0 0 4px rgba(34,230,197,0.35)',
    }
  return { boxShadow: '0 0 0 2px var(--gco-glass-border)' }
}

/** Recorte centrado cuadrado → dataURL JPEG */
function cropToSquare(
  source: HTMLImageElement | HTMLCanvasElement,
  size = 512
): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const sw =
    'naturalWidth' in source ? source.naturalWidth || source.width : source.width
  const sh =
    'naturalHeight' in source
      ? source.naturalHeight || source.height
      : source.height
  const side = Math.min(sw, sh)
  const sx = (sw - side) / 2
  const sy = (sh - side) / 2
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.9)
}

function SwitchRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          soundClick()
          onChange(!checked)
        }}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 22 : 3,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s ease',
          }}
        />
      </button>
    </div>
  )
}

export function PerfilSettings() {
  const profile = getProfile()
  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [avatar, setAvatar] = useState(profile?.avatarDataUrl ?? null)
  const [frame, setFrame] = useState<AvatarFrame>(profile?.avatarFrame ?? 'none')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Crop UI
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const cropImgRef = useRef<HTMLImageElement | null>(null)

  // Credential modal
  const [credOpen, setCredOpen] = useState(false)
  const [hideAge, setHideAge] = useState(false)
  const [credTheme, setCredTheme] = useState<CredentialTheme>('dark')
  const [showGame, setShowGame] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const [favGame, setFavGame] = useState(profile?.favoriteGameId ?? GAMES[0].id)
  const [favBook, setFavBook] = useState(profile?.favoriteBookId ?? '')
  const [favTrack, setFavTrack] = useState(profile?.favoriteTrackId ?? '')
  const [books, setBooks] = useState<{ id: string; title: string }[]>([])
  const [tracks, setTracks] = useState<{ id: string; title: string }[]>([])
  const [credBusy, setCredBusy] = useState(false)

  useEffect(() => {
    void listBooks()
      .then((list) => setBooks(list.map((b) => ({ id: b.id, title: b.title }))))
      .catch(() => setBooks([]))
    void listTracks()
      .then((list) => setTracks(list.map((t) => ({ id: t.id, title: t.title }))))
      .catch(() => setTracks([]))
  }, [])

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
      avatarFrame: frame,
      favoriteGameId: favGame,
      favoriteBookId: favBook || null,
      favoriteTrackId: favTrack || null,
    })
    soundSuccess()
    setMsg('Perfil guardado')
  }

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    soundClick()
    e.target.value = ''
  }

  const applyCrop = () => {
    const img = cropImgRef.current
    if (!img) return
    try {
      const dataUrl = cropToSquare(img, 512)
      setAvatar(dataUrl)
      if (cropSrc) URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
      soundSuccess()
    } catch {
      soundFail()
      setMsg('No se pudo recortar')
    }
  }

  const doDownload = async () => {
    setCredBusy(true)
    try {
      updateProfile({
        favoriteGameId: favGame,
        favoriteBookId: favBook || null,
        favoriteTrackId: favTrack || null,
        avatarFrame: frame,
      })
      const result = await downloadCredential({
        hideAge,
        theme: credTheme,
        showFavoriteGame: showGame,
        favoriteGameLabel: GAMES.find((g) => g.id === favGame)?.label,
        showFavoriteBook: showBook,
        favoriteBookLabel: books.find((b) => b.id === favBook)?.title,
        showFavoriteTrack: showTrack,
        favoriteTrackLabel: tracks.find((t) => t.id === favTrack)?.title,
      })
      if (result === 'fail') {
        soundFail()
        setMsg('No se pudo generar la descarga en este dispositivo')
      } else if (result === 'open') {
        soundSuccess()
        setMsg('Imagen abierta: mantén pulsado → Guardar imagen')
      } else {
        soundSuccess()
        setMsg(
          result === 'share'
            ? 'Comparte o guarda desde el menú del sistema'
            : 'Credencial lista'
        )
      }
      setCredOpen(false)
    } catch {
      soundFail()
      setMsg('Error al generar la credencial')
    } finally {
      setCredBusy(false)
    }
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            border: 'none',
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--gco-glass-bg)',
            flexShrink: 0,
            ...frameStyle(frame),
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
            Toca para elegir y recortar
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onAvatar}
        />
      </div>

      <div>
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: 8,
          }}
        >
          Marco
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`glass-button ${frame === f.id ? '' : 'secondary'}`}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              onClick={() => {
                soundClick()
                setFrame(f.id)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}
        >
          Nombre
        </label>
        <input
          className="glass-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label
          style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}
        >
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
            setCredOpen(true)
          }}
        >
          Descargar credencial
        </button>
      </div>

      {/* Crop modal */}
      {cropSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.65)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(420px, 100%)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <p style={{ fontWeight: 600 }}>Ajustar foto</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
              Se recortará al centro en cuadrado.
            </p>
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid var(--gco-glass-border)',
                background: '#000',
              }}
            >
              <img
                ref={cropImgRef}
                src={cropSrc}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <GlassButton type="button" onClick={applyCrop}>
                Usar foto
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  if (cropSrc) URL.revokeObjectURL(cropSrc)
                  setCropSrc(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credential modal */}
      {credOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(440px, 100%)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: '90dvh',
              overflowY: 'auto',
            }}
          >
            <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>
              Credencial
            </p>

            <SwitchRow
              label="Ocultar edad"
              checked={hideAge}
              onChange={setHideAge}
            />

            <div>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: 8,
                }}
              >
                Diseño
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'dark' as const, label: 'Oscuro' },
                    { id: 'light' as const, label: 'Claro' },
                    { id: 'rainbow' as const, label: 'Arcoíris' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`glass-button ${credTheme === t.id ? '' : 'secondary'}`}
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
                    onClick={() => {
                      soundClick()
                      setCredTheme(t.id)
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <SwitchRow
              label="Mostrar juego favorito"
              checked={showGame}
              onChange={setShowGame}
            />
            {showGame && (
              <select
                className="glass-input"
                value={favGame}
                onChange={(e) => setFavGame(e.target.value)}
              >
                {GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}

            <SwitchRow
              label="Mostrar libro favorito"
              checked={showBook}
              onChange={setShowBook}
            />
            {showBook && (
              <select
                className="glass-input"
                value={favBook}
                onChange={(e) => setFavBook(e.target.value)}
              >
                <option value="">— Elegir —</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            )}

            <SwitchRow
              label="Mostrar canción favorita"
              checked={showTrack}
              onChange={setShowTrack}
            />
            {showTrack && (
              <select
                className="glass-input"
                value={favTrack}
                onChange={(e) => setFavTrack(e.target.value)}
              >
                <option value="">— Elegir —</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <GlassButton
                type="button"
                onClick={() => void doDownload()}
              >
                {credBusy ? 'Generando…' : 'Descargar'}
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  setCredOpen(false)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
