import { useEffect, useRef, useState, useCallback } from 'react'
import {
  getProfile,
  updateProfile,
  type AvatarFrame,
} from '@/core/storage/userProfile'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  downloadCredential,
  renderCredentialCanvas,
  type CredentialTheme,
  type CredentialOptions,
} from './downloadCredential'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { listBooks, listTracks } from '@/core/storage/mediaLibrary'

/** Marcos (añadir estos ids en AvatarFrame del storage) */
type FrameId =
  | AvatarFrame
  | 'gold'
  | 'holographic'
  | 'cyber'
  | 'frutiger-aero'

const FRAMES: { id: FrameId; label: string; emoji: string }[] = [
  { id: 'none', label: 'Ninguno', emoji: '○' },
  { id: 'metal', label: 'Metálico', emoji: '⚙️' },
  { id: 'neon', label: 'Neón', emoji: '✦' },
  { id: 'matte', label: 'Mate', emoji: '●' },
  { id: 'glass', label: 'Liquid glass', emoji: '◌' },
  { id: 'gold', label: 'Oro', emoji: '✦' },
  { id: 'holographic', label: 'Holográfico', emoji: '◇' },
  { id: 'cyber', label: 'Cyber', emoji: '▣' },
  { id: 'frutiger-aero', label: 'Frutiger Aero', emoji: '💧' },
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

const TARGET_PX = 512
const PREVIEW = 240
const STEP = 8
const AVATAR_UI = 104
const BIO_MAX = 160

function frameRingStyle(frame: FrameId): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: '50%',
    transition:
      'box-shadow 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), border-color 0.25s ease, background 0.35s ease, transform 0.2s ease',
  }
  if (frame === 'neon')
    return {
      ...base,
      padding: 3,
      background: 'var(--gco-primary)',
      boxShadow:
        '0 0 0 1px var(--gco-primary), 0 0 14px var(--gco-primary), 0 0 28px rgba(34,230,197,0.35), inset 0 0 8px rgba(34,230,197,0.25)',
    }
  if (frame === 'metal')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(135deg, #f0f2f5 0%, #8b93a7 40%, #3a4154 70%, #cfd5e0 100%)',
      boxShadow:
        'inset 0 1px 1px rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.35)',
    }
  if (frame === 'matte')
    return {
      ...base,
      padding: 5,
      background: 'rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
    }
  if (frame === 'glass')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 40%, rgba(34,230,197,0.25))',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.35), 0 0 0 4px rgba(34,230,197,0.22), inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 24px rgba(0,0,0,0.28)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }
  if (frame === 'gold')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(145deg, #fff6c8 0%, #e8c547 25%, #b8860b 55%, #f5e6a3 80%, #c9a227 100%)',
      boxShadow:
        '0 0 0 1px rgba(184,134,11,0.5), inset 0 1px 1px rgba(255,255,255,0.7), 0 6px 18px rgba(184,134,11,0.35)',
    }
  if (frame === 'holographic')
    return {
      ...base,
      padding: 3,
      background:
        'conic-gradient(from 210deg, #ff6bcb, #7ec8ff, #22e6c5, #8b7cf6, #ff8ec8, #ff6bcb)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.4), 0 0 20px rgba(139,124,246,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
    }
  if (frame === 'cyber')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(90deg, #22e6c5 0%, #0B1220 35%, #0B1220 65%, #8b7cf6 100%)',
      boxShadow:
        '0 0 0 2px #22e6c5, 0 0 12px rgba(34,230,197,0.5), 0 0 2px #8b7cf6 inset',
    }
  if (frame === 'frutiger-aero')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(160deg, rgba(180,230,255,0.95) 0%, rgba(120,200,240,0.7) 35%, rgba(90,180,220,0.55) 70%, rgba(200,240,255,0.85) 100%)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.75), inset 0 2px 6px rgba(255,255,255,0.85), inset 0 -2px 8px rgba(40,120,180,0.25), 0 8px 22px rgba(60,140,200,0.35)',
    }
  return {
    ...base,
    padding: 2,
    background: 'var(--gco-glass-border)',
    boxShadow: 'none',
  }
}

function SwitchRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0.35rem 0',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{label}</span>
        {hint ? (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '0.72rem',
              color: 'var(--gco-ink-muted)',
              lineHeight: 1.35,
            }}
          >
            {hint}
          </p>
        ) : null}
      </div>
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
          background: checked ? 'var(--gco-primary)' : 'rgba(128,128,128,0.35)',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
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
            transition: 'left 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        />
      </button>
    </div>
  )
}

function PadBtn({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="glass-button secondary"
      onClick={() => {
        soundClick()
        onClick()
      }}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        fontSize: '1.1rem',
        display: 'grid',
        placeItems: 'center',
      }}
      aria-label={label}
    >
      {label}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.72rem',
        color: 'var(--gco-ink-muted)',
        margin: '0 0 0.65rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: '0.4rem',
        fontWeight: 550,
        fontSize: '0.88rem',
      }}
    >
      {children}
    </label>
  )
}

/** Avatar siempre circular */
function CircularAvatar({
  src,
  frame,
  size = AVATAR_UI,
  onClick,
}: {
  src: string | null
  frame: FrameId
  size?: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cambiar foto de perfil"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        aspectRatio: '1 / 1',
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        display: 'block',
        lineHeight: 0,
        overflow: 'visible',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          aspectRatio: '1 / 1',
          boxSizing: 'border-box',
          ...frameRingStyle(frame),
        }}
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--gco-glass-bg)',
            boxSizing: 'border-box',
          }}
        >
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                display: 'block',
                borderRadius: '50%',
                maxWidth: '100%',
                maxHeight: '100%',
                aspectRatio: '1 / 1',
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
                borderRadius: '50%',
              }}
            >
              Foto
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export function PerfilSettings() {
  const profile = getProfile()
  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [bio, setBio] = useState(
    (profile as { bio?: string } | null)?.bio ?? ''
  )
  const [avatar, setAvatar] = useState(profile?.avatarDataUrl ?? null)
  const [frame, setFrame] = useState<FrameId>(
    (profile?.avatarFrame as FrameId) ?? 'none'
  )
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const frameScrollRef = useRef<HTMLDivElement>(null)

  // Crop
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [imgNat, setImgNat] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [outSize, setOutSize] = useState(TARGET_PX)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Credential viewer / options
  const [credOpen, setCredOpen] = useState(false)
  const [credViewOpen, setCredViewOpen] = useState(false)
  const [credPreviewUrl, setCredPreviewUrl] = useState<string | null>(null)
  const [hideAge, setHideAge] = useState(false)
  const [showFrameOnCred, setShowFrameOnCred] = useState(true)
  const [showBioOnCred, setShowBioOnCred] = useState(true)
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
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => {
    void listBooks()
      .then((list) => setBooks(list.map((b) => ({ id: b.id, title: b.title }))))
      .catch(() => setBooks([]))
    void listTracks()
      .then((list) => setTracks(list.map((t) => ({ id: t.id, title: t.title }))))
      .catch(() => setTracks([]))
  }, [])

  useEffect(() => {
    return () => {
      if (credPreviewUrl) URL.revokeObjectURL(credPreviewUrl)
    }
  }, [credPreviewUrl])

  const nudge = useCallback((dx: number, dy: number) => {
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }, [])

  const buildOpts = useCallback((): CredentialOptions => {
    return {
      hideAge,
      theme: credTheme,
      showFrame: showFrameOnCred,
      showBio: showBioOnCred,
      bio: bio.trim() || undefined,
      showFavoriteGame: showGame,
      favoriteGameLabel: GAMES.find((g) => g.id === favGame)?.label,
      showFavoriteBook: showBook,
      favoriteBookLabel: books.find((b) => b.id === favBook)?.title,
      showFavoriteTrack: showTrack,
      favoriteTrackLabel: tracks.find((t) => t.id === favTrack)?.title,
    }
  }, [
    hideAge,
    credTheme,
    showFrameOnCred,
    showBioOnCred,
    bio,
    showGame,
    favGame,
    showBook,
    favBook,
    books,
    showTrack,
    favTrack,
    tracks,
  ])

  const persistPrefs = () => {
    updateProfile({
      favoriteGameId: favGame,
      favoriteBookId: favBook || null,
      favoriteTrackId: favTrack || null,
      avatarFrame: frame as AvatarFrame,
      ...(bio.trim()
        ? ({ bio: bio.trim().slice(0, BIO_MAX) } as Record<string, unknown>)
        : {}),
    } as Parameters<typeof updateProfile>[0] & { bio?: string })
  }

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
      avatarFrame: frame as AvatarFrame,
      favoriteGameId: favGame,
      favoriteBookId: favBook || null,
      favoriteTrackId: favTrack || null,
      bio: bio.trim().slice(0, BIO_MAX) || null,
    } as Parameters<typeof updateProfile>[0] & { bio?: string | null })
    soundSuccess()
    setMsg('Perfil guardado')
  }

  const onAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    setOffset({ x: 0, y: 0 })
    setScale(1)
    setOutSize(TARGET_PX)
    soundClick()
    e.target.value = ''
  }

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgNat({ w: img.naturalWidth, h: img.naturalHeight })
    const minCover = Math.max(
      PREVIEW / img.naturalWidth,
      PREVIEW / img.naturalHeight
    )
    setScale(Math.max(1, minCover * (img.naturalWidth / PREVIEW)))
  }

  const autoResize = () => {
    if (!imgNat.w || !imgNat.h) return
    soundClick()
    setOffset({ x: 0, y: 0 })
    setOutSize(TARGET_PX)
    const side = Math.min(imgNat.w, imgNat.h)
    setScale(PREVIEW / side)
  }

  const applyCrop = () => {
    const img = imgRef.current
    if (!img || !imgNat.w) return
    try {
      const size = Math.max(64, Math.min(2048, outSize))
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('ctx')

      const dispW = imgNat.w * scale
      const dispH = imgNat.h * scale
      const imgLeft = PREVIEW / 2 - dispW / 2 + offset.x
      const imgTop = PREVIEW / 2 - dispH / 2 + offset.y

      const sx = ((0 - imgLeft) / dispW) * imgNat.w
      const sy = ((0 - imgTop) / dispH) * imgNat.h
      const sw = (PREVIEW / dispW) * imgNat.w
      const sh = (PREVIEW / dispH) * imgNat.h

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      setAvatar(dataUrl)
      if (cropSrc) URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
      soundSuccess()
      setMsg(`Avatar ${size}×${size}px`)
    } catch {
      soundFail()
      setMsg('No se pudo recortar')
    }
  }

  const openCredentialViewer = async () => {
    setPreviewBusy(true)
    try {
      persistPrefs()
      const canvas = await renderCredentialCanvas(buildOpts())
      if (!canvas) {
        soundFail()
        setMsg('No se pudo generar la vista previa')
        return
      }
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1)
      )
      if (!blob) {
        soundFail()
        setMsg('No se pudo generar la vista previa')
        return
      }
      if (credPreviewUrl) URL.revokeObjectURL(credPreviewUrl)
      const url = URL.createObjectURL(blob)
      setCredPreviewUrl(url)
      setCredViewOpen(true)
      setCredOpen(false)
      soundSuccess()
    } catch {
      soundFail()
      setMsg('Error al generar la credencial')
    } finally {
      setPreviewBusy(false)
    }
  }

  const doDownload = async () => {
    setCredBusy(true)
    try {
      persistPrefs()
      const result = await downloadCredential(buildOpts())
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
    } catch {
      soundFail()
      setMsg('Error al generar la credencial')
    } finally {
      setCredBusy(false)
    }
  }

  const scrollFrames = (dir: -1 | 1) => {
    const el = frameScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 120, behavior: 'smooth' })
  }

  const closeViewer = () => {
    soundClick()
    setCredViewOpen(false)
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1.1rem, 3vw, 1.5rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.35rem',
      }}
    >
      {/* Cabecera de perfil */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.15rem',
          flexWrap: 'wrap',
        }}
      >
        <CircularAvatar
          src={avatar}
          frame={frame}
          size={AVATAR_UI}
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              fontWeight: 700,
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
            }}
          >
            {name.trim() || 'Tu perfil'}
          </p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            Toca la foto para cambiarla. Recomendado{' '}
            <span className="mono">
              {TARGET_PX}×{TARGET_PX}
            </span>
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

      {/* Marcos */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <SectionTitle>Marco del avatar</SectionTitle>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="hscroll-nav-btn"
              aria-label="Anterior"
              onClick={() => {
                soundClick()
                scrollFrames(-1)
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="hscroll-nav-btn"
              aria-label="Siguiente"
              onClick={() => {
                soundClick()
                scrollFrames(1)
              }}
            >
              ›
            </button>
          </div>
        </div>
        <div
          ref={frameScrollRef}
          className="hscroll"
          style={{
            gap: '0.65rem',
            paddingBottom: 6,
            scrollSnapType: 'x mandatory',
          }}
        >
          {FRAMES.map((f) => {
            const on = frame === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  soundClick()
                  setFrame(f.id)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.85rem 0.55rem',
                  minWidth: 92,
                  flex: '0 0 auto',
                  scrollSnapAlign: 'start',
                  borderRadius: 16,
                  cursor: 'pointer',
                  border: on
                    ? '1.5px solid var(--gco-primary)'
                    : '1px solid var(--gco-glass-border)',
                  background: on
                    ? 'var(--gco-primary-dim)'
                    : 'var(--gco-glass-bg)',
                  color: 'inherit',
                  transform: on ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: on
                    ? '0 6px 20px var(--gco-primary-dim)'
                    : 'none',
                  transition:
                    'transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.28s ease, background 0.25s ease, border-color 0.25s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 44,
                    minWidth: 44,
                    minHeight: 44,
                    aspectRatio: '1 / 1',
                    boxSizing: 'border-box',
                    ...frameRingStyle(f.id),
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'var(--gco-bg-elevated)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-emoji)',
                    }}
                  >
                    {f.emoji}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: on ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Datos personales */}
      <div>
        <SectionTitle>Identidad</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <input
              className="glass-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cómo quieres aparecer"
              maxLength={40}
            />
          </div>
          <div>
            <FieldLabel>Edad</FieldLabel>
            <input
              className="glass-input"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              style={{ maxWidth: 128 }}
              placeholder="—"
            />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <FieldLabel>Descripción</FieldLabel>
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--gco-ink-faint)',
                }}
              >
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              className="glass-input"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="Una línea sobre ti: enfoque, meta o estilo de entrenamiento…"
              rows={3}
              style={{
                minHeight: 88,
                resize: 'vertical',
                lineHeight: 1.45,
              }}
            />
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.72rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.4,
              }}
            >
              Aparece en la credencial como nota personal, no como hashtag.
            </p>
          </div>
        </div>
      </div>

      {msg && (
        <p
          style={{
            fontSize: '0.88rem',
            color: 'var(--gco-primary)',
            margin: 0,
            fontWeight: 500,
          }}
        >
          {msg}
        </p>
      )}

      {/* Acciones principales */}
      <div
        style={{
          display: 'flex',
          gap: '0.55rem',
          flexWrap: 'wrap',
        }}
      >
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
          Credencial
        </button>
      </div>

      {/* ── Crop modal ── */}
      {cropSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
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
              maxHeight: '94dvh',
              overflowY: 'auto',
            }}
          >
            <p style={{ fontWeight: 700, margin: 0 }}>Ajustar foto</p>

            <div
              style={{
                width: PREVIEW,
                height: PREVIEW,
                maxWidth: '100%',
                aspectRatio: '1 / 1',
                margin: '0 auto',
                borderRadius: '50%',
                overflow: 'hidden',
                position: 'relative',
                border: '2px solid var(--gco-glass-border)',
                background: '#0a0a0a',
                touchAction: 'none',
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              <img
                ref={imgRef}
                src={cropSrc}
                alt=""
                onLoad={onImgLoad}
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: imgNat.w ? imgNat.w * scale : '100%',
                  height: imgNat.h ? imgNat.h * scale : 'auto',
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: '0.8rem',
              }}
            >
              <div className="glass-card" style={{ padding: '0.55rem 0.7rem' }}>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.7rem',
                  }}
                >
                  Original
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {imgNat.w || '—'}×{imgNat.h || '—'}
                </p>
              </div>
              <div className="glass-card" style={{ padding: '0.55rem 0.7rem' }}>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.7rem',
                  }}
                >
                  Salida
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {outSize}×{outSize}
                </p>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: 8,
                }}
              >
                Mover imagen
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 44px 44px',
                  gridTemplateRows: '44px 44px 44px',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                <span />
                <PadBtn label="↑" onClick={() => nudge(0, STEP)} />
                <span />
                <PadBtn label="←" onClick={() => nudge(STEP, 0)} />
                <PadBtn label="·" onClick={() => setOffset({ x: 0, y: 0 })} />
                <PadBtn label="→" onClick={() => nudge(-STEP, 0)} />
                <span />
                <PadBtn label="↓" onClick={() => nudge(0, -STEP)} />
                <span />
              </div>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                <span>Zoom</span>
                <span className="mono">{scale.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.02}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="pref-slider"
                style={
                  {
                    width: '100%',
                    '--fill': `${((scale - 0.3) / (3 - 0.3)) * 100}%`,
                  } as React.CSSProperties
                }
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                <span>Tamaño de salida</span>
                <span className="mono">{outSize}px</span>
              </div>
              <input
                type="range"
                min={128}
                max={1024}
                step={16}
                value={outSize}
                onChange={(e) => setOutSize(parseInt(e.target.value, 10))}
                className="pref-slider"
                style={
                  {
                    width: '100%',
                    '--fill': `${((outSize - 128) / (1024 - 128)) * 100}%`,
                  } as React.CSSProperties
                }
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                onClick={autoResize}
                style={{ fontSize: '0.82rem' }}
              >
                Autoajustar
              </button>
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

      {/* ── Opciones de credencial ── */}
      {credOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'var(--gco-overlay)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(460px, 100%)',
              padding: '1.35rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxHeight: '92dvh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.08rem',
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Credencial
                </p>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--gco-ink-muted)',
                    margin: '6px 0 0',
                    lineHeight: 1.4,
                  }}
                >
                  Configura el diseño y previsualiza antes de guardar.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => {
                  soundClick()
                  setCredOpen(false)
                }}
                style={{ width: 36, height: 36 }}
              >
                ✕
              </button>
            </div>

            <div>
              <SectionTitle>Apariencia</SectionTitle>
              <div className="segmented" style={{ width: '100%' }}>
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
                    className={credTheme === t.id ? 'active' : ''}
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

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '0.35rem 0',
              }}
            >
              <SectionTitle>Privacidad y detalles</SectionTitle>
              <SwitchRow
                label="Ocultar edad"
                checked={hideAge}
                onChange={setHideAge}
              />
              <SwitchRow
                label="Mostrar marco del avatar"
                checked={showFrameOnCred}
                onChange={setShowFrameOnCred}
              />
              <SwitchRow
                label="Incluir descripción"
                checked={showBioOnCred}
                onChange={setShowBioOnCred}
                hint={
                  bio.trim()
                    ? undefined
                    : 'Escribe una descripción en el perfil para usarla aquí'
                }
              />
            </div>

            <div>
              <SectionTitle>Favoritos (opcional)</SectionTitle>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <SwitchRow
                  label="Juego favorito"
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
                  label="Libro favorito"
                  checked={showBook}
                  onChange={setShowBook}
                />
                {showBook && (
                  <select
                    className="glass-input"
                    value={favBook}
                    onChange={(e) => setFavBook(e.target.value)}
                  >
                    <option value="">Elegir libro</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                )}

                <SwitchRow
                  label="Canción favorita"
                  checked={showTrack}
                  onChange={setShowTrack}
                />
                {showTrack && (
                  <select
                    className="glass-input"
                    value={favTrack}
                    onChange={(e) => setFavTrack(e.target.value)}
                  >
                    <option value="">Elegir canción</option>
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                paddingTop: 4,
              }}
            >
              <GlassButton
                type="button"
                onClick={() => void openCredentialViewer()}
                disabled={previewBusy}
              >
                {previewBusy ? 'Generando…' : 'Ver credencial'}
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                disabled={credBusy}
                onClick={() => void doDownload()}
              >
                {credBusy ? 'Descargando…' : 'Descargar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visor de credencial ── */}
      {credViewOpen && credPreviewUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 210,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding:
              'max(12px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '1rem',
                fontFamily: 'var(--font-display)',
                color: '#fff',
              }}
            >
              Vista previa
            </p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={closeViewer}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1rem',
                display: 'grid',
                placeItems: 'center',
                backdropFilter: 'blur(8px)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              width: 'min(520px, 100%)',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.12)',
              background: '#0a0a0a',
              maxHeight: 'min(70dvh, 420px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={credPreviewUrl}
              alt="Credencial de progreso"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                maxHeight: 'min(70dvh, 420px)',
                objectFit: 'contain',
              }}
            />
          </div>

          <div
            style={{
              width: 'min(520px, 100%)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <GlassButton
              type="button"
              onClick={() => void doDownload()}
              disabled={credBusy}
            >
              {credBusy ? 'Descargando…' : 'Descargar'}
            </GlassButton>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setCredViewOpen(false)
                setCredOpen(true)
              }}
            >
              Ajustar opciones
            </button>
            <button
              type="button"
              className="glass-button ghost"
              onClick={closeViewer}
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}