import { useEffect, useRef, useState, useCallback } from 'react'
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

const FRAMES: { id: AvatarFrame; label: string; emoji: string }[] = [
  { id: 'none', label: 'Ninguno', emoji: '○' },
  { id: 'metal', label: 'Metálico', emoji: '⚙️' },
  { id: 'neon', label: 'Neón', emoji: '✦' },
  { id: 'matte', label: 'Mate', emoji: '●' },
  { id: 'glass', label: 'Liquid glass', emoji: '◌' },
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

/** Tamaño recomendado del avatar final */
const TARGET_PX = 512
const PREVIEW = 240
const STEP = 8

function framePreviewStyle(frame: AvatarFrame): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: '50%',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  }
  if (frame === 'neon')
    return {
      ...base,
      border: '2px solid var(--gco-primary)',
      boxShadow:
        '0 0 12px var(--gco-primary), 0 0 28px rgba(34,230,197,0.35), inset 0 0 8px rgba(34,230,197,0.2)',
    }
  if (frame === 'metal')
    return {
      ...base,
      border: '3px solid transparent',
      backgroundImage:
        'linear-gradient(var(--gco-bg-elevated, #121A2B), var(--gco-bg-elevated, #121A2B)), linear-gradient(135deg, #f0f2f5 0%, #8b93a7 40%, #3a4154 70%, #cfd5e0 100%)',
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
      boxShadow:
        'inset 0 1px 1px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.35)',
    }
  if (frame === 'matte')
    return {
      ...base,
      border: '5px solid rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
    }
  if (frame === 'glass')
    return {
      ...base,
      border: '1.5px solid rgba(255,255,255,0.45)',
      boxShadow:
        '0 0 0 3px rgba(34,230,197,0.25), inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 20px rgba(0,0,0,0.25)',
      backdropFilter: 'blur(4px)',
    }
  return {
    ...base,
    border: '2px solid var(--gco-glass-border)',
  }
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

export function PerfilSettings() {
  const profile = getProfile()
  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [avatar, setAvatar] = useState(profile?.avatarDataUrl ?? null)
  const [frame, setFrame] = useState<AvatarFrame>(profile?.avatarFrame ?? 'none')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [imgNat, setImgNat] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [outSize, setOutSize] = useState(TARGET_PX)
  const imgRef = useRef<HTMLImageElement | null>(null)

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

  const nudge = useCallback((dx: number, dy: number) => {
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
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
    // Escala mínima para cubrir el círculo de preview
    const minCover = Math.max(PREVIEW / img.naturalWidth, PREVIEW / img.naturalHeight)
    setScale(Math.max(1, minCover * (img.naturalWidth / PREVIEW)))
  }

  const autoResize = () => {
    // Centrar y cubrir el área de recorte al 100%
    if (!imgNat.w || !imgNat.h) return
    soundClick()
    setOffset({ x: 0, y: 0 })
    setOutSize(TARGET_PX)
    // scale 1 = imagen natural; ajustamos visualmente centrando cover
    const cover = Math.max(PREVIEW / imgNat.w, PREVIEW / imgNat.h)
    setScale(cover * (imgNat.w / PREVIEW) * (imgNat.w > imgNat.h ? imgNat.h / imgNat.w : 1) || 1)
    // Más simple: scale para que el lado corto llene PREVIEW
    const side = Math.min(imgNat.w, imgNat.h)
    setScale(PREVIEW / side)
    setOffset({ x: 0, y: 0 })
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

      // Displayed size of image in preview
      const dispW = imgNat.w * scale
      const dispH = imgNat.h * scale
      // Image top-left in preview coords (centered + offset)
      const imgLeft = PREVIEW / 2 - dispW / 2 + offset.x
      const imgTop = PREVIEW / 2 - dispH / 2 + offset.y

      // Source rect corresponding to the circular preview (square PREVIEW×PREVIEW)
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
        gap: '1.25rem',
      }}
    >
      {/* Avatar + frame */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.15rem',
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
            width: 96,
            height: 96,
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--gco-glass-bg)',
            flexShrink: 0,
            ...framePreviewStyle(frame),
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>
              Foto
            </span>
          )}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontWeight: 600, margin: 0 }}>Foto de perfil</p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Toca para elegir, recortar y redimensionar. Recomendado:{' '}
            <span className="mono">{TARGET_PX}×{TARGET_PX}px</span>
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
            fontSize: '0.78rem',
            color: 'var(--gco-ink-muted)',
            marginBottom: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Marco
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
            gap: 8,
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
                  padding: '0.75rem 0.4rem',
                  borderRadius: 14,
                  cursor: 'pointer',
                  border: on
                    ? '1px solid var(--gco-primary)'
                    : '1px solid var(--gco-glass-border)',
                  background: on
                    ? 'var(--gco-primary-dim)'
                    : 'var(--gco-glass-bg)',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    ...framePreviewStyle(f.id),
                    background: 'var(--gco-bg-elevated)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.85rem',
                  }}
                >
                  {f.emoji}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: on ? 700 : 500 }}>
                  {f.label}
                </span>
              </button>
            )
          })}
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
        <p style={{ fontSize: '0.9rem', color: 'var(--gco-primary)', margin: 0 }}>
          {msg}
        </p>
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

      {/* ── Crop modal ── */}
      {cropSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
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
                margin: '0 auto',
                borderRadius: '50%',
                overflow: 'hidden',
                position: 'relative',
                border: '2px solid var(--gco-glass-border)',
                background: '#0a0a0a',
                touchAction: 'none',
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

            {/* Dimensiones */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: '0.8rem',
              }}
            >
              <div
                className="glass-card"
                style={{ padding: '0.55rem 0.7rem' }}
              >
                <p style={{ margin: 0, color: 'var(--gco-ink-muted)', fontSize: '0.7rem' }}>
                  Original
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {imgNat.w || '—'}×{imgNat.h || '—'}px
                </p>
              </div>
              <div
                className="glass-card"
                style={{ padding: '0.55rem 0.7rem' }}
              >
                <p style={{ margin: 0, color: 'var(--gco-ink-muted)', fontSize: '0.7rem' }}>
                  Salida (recomendado {TARGET_PX})
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {outSize}×{outSize}px
                </p>
              </div>
            </div>

            {/* Cruceta */}
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

            {/* Zoom */}
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
                style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
              />
            </div>

            {/* Output size */}
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
                <span>Redimensionar salida</span>
                <span className="mono">{outSize}px</span>
              </div>
              <input
                type="range"
                min={128}
                max={1024}
                step={16}
                value={outSize}
                onChange={(e) => setOutSize(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
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
            <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', margin: 0 }}>
              Incluye victorias, derrotas e índice de victoria.
            </p>

            <SwitchRow label="Ocultar edad" checked={hideAge} onChange={setHideAge} />

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
              <GlassButton type="button" onClick={() => void doDownload()}>
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