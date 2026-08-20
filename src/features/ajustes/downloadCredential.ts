import { getProfile, type AvatarFrame } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'

export type CredentialTheme = 'dark' | 'light' | 'rainbow'

export type CredentialOptions = {
  hideAge?: boolean
  theme?: CredentialTheme
  /** Si false, no se dibuja el marco del avatar en la credencial */
  showFrame?: boolean
  showFavoriteGame?: boolean
  favoriteGameLabel?: string
  showFavoriteBook?: boolean
  favoriteBookLabel?: string
  showFavoriteTrack?: boolean
  favoriteTrackLabel?: string
}

type FrameId =
  | AvatarFrame
  | 'gold'
  | 'holographic'
  | 'cyber'
  | 'frutiger-aero'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function palette(theme: CredentialTheme) {
  if (theme === 'light') {
    return {
      bg0: '#F4F6FA',
      bg1: '#E8ECF4',
      ink: '#0B1220',
      muted: 'rgba(11,18,32,0.55)',
      faint: 'rgba(11,18,32,0.35)',
      primary: '#0D9488',
      border: 'rgba(13,148,136,0.45)',
      card: 'rgba(255,255,255,0.7)',
    }
  }
  if (theme === 'rainbow') {
    return {
      bg0: '#12081F',
      bg1: '#1A1030',
      ink: '#F8F7FF',
      muted: 'rgba(248,247,255,0.6)',
      faint: 'rgba(248,247,255,0.35)',
      primary: '#FF6BCB',
      border: 'rgba(139,124,246,0.55)',
      card: 'rgba(255,255,255,0.06)',
    }
  }
  return {
    bg0: '#0B1220',
    bg1: '#15102A',
    ink: '#F3F5FA',
    muted: 'rgba(243,245,250,0.6)',
    faint: 'rgba(243,245,250,0.35)',
    primary: '#22E6C5',
    border: 'rgba(34,230,197,0.45)',
    card: 'rgba(255,255,255,0.05)',
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  frame: FrameId,
  primary: string
) {
  if (frame === 'none') {
    ctx.strokeStyle = primary
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  if (frame === 'neon') {
    ctx.strokeStyle = primary
    ctx.lineWidth = 3
    ctx.shadowColor = primary
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
    return
  }
  if (frame === 'metal') {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    g.addColorStop(0, '#E8ECF4')
    g.addColorStop(0.5, '#8B93A7')
    g.addColorStop(1, '#3A4154')
    ctx.strokeStyle = g
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  if (frame === 'matte') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  if (frame === 'gold') {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    g.addColorStop(0, '#FFF6C8')
    g.addColorStop(0.35, '#E8C547')
    g.addColorStop(0.65, '#B8860B')
    g.addColorStop(1, '#F5E6A3')
    ctx.strokeStyle = g
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  if (frame === 'holographic') {
    // Anillo multi-stop aproximando conic
    const stops: [number, string][] = [
      [0, '#FF6BCB'],
      [0.2, '#7EC8FF'],
      [0.4, '#22E6C5'],
      [0.6, '#8B7CF6'],
      [0.8, '#FF8EC8'],
      [1, '#FF6BCB'],
    ]
    const segs = 48
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs
      const t1 = (i + 1) / segs
      const a0 = t0 * Math.PI * 2 - Math.PI / 2
      const a1 = t1 * Math.PI * 2 - Math.PI / 2
      const stop = stops.find((s, idx) => t0 <= s[0] || idx === stops.length - 1)!
      ctx.strokeStyle = stop[1]
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(cx, cy, r + 4, a0, a1)
      ctx.stroke()
    }
    ctx.shadowColor = 'rgba(139,124,246,0.5)'
    ctx.shadowBlur = 10
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
    return
  }
  if (frame === 'cyber') {
    ctx.strokeStyle = primary
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#8B7CF6'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowColor = primary
    ctx.shadowBlur = 8
    ctx.strokeStyle = primary
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0.15, Math.PI * 0.55)
    ctx.stroke()
    ctx.shadowBlur = 0
    return
  }
  if (frame === 'frutiger-aero') {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    g.addColorStop(0, 'rgba(200,240,255,0.95)')
    g.addColorStop(0.4, 'rgba(120,200,240,0.75)')
    g.addColorStop(1, 'rgba(60,140,200,0.55)')
    ctx.strokeStyle = g
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.stroke()
    // highlight superior (glass bubble)
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r + 2, -Math.PI * 0.85, -Math.PI * 0.15)
    ctx.stroke()
    return
  }
  // glass (default)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = primary
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2)
  ctx.stroke()
}

function isCapacitorNative(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
    if (cap?.isNativePlatform?.()) return true
    const p = cap?.getPlatform?.()
    return p === 'android' || p === 'ios'
  } catch {
    return false
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const b64 = result.includes(',') ? result.split(',')[1]! : result
      resolve(b64)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Descarga robusta multiplataforma:
 * 1) Capacitor Filesystem + Share (APK / iOS nativo)
 * 2) Web Share API con File
 * 3) <a download> + object URL
 * 4) dataURL download
 * 5) Abrir blob en pestaña / location
 */
export async function saveCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<'download' | 'share' | 'open' | 'fail'> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png', 1)
  )
  if (!blob) return 'fail'

  const file = new File([blob], filename, { type: 'image/png' })

  // ── 1) Capacitor nativo (APK / iOS) ──────────────────────────────────────
  if (isCapacitorNative()) {
    try {
      // Dynamic imports: no rompen web/Electron si los plugins no están
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ])

      const base64 = await blobToBase64(blob)
      const path = filename

      // Cache es compartible por FileProvider en Android por defecto
      const written = await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Cache,
      })

      // Share con URI nativa (Android FileProvider / iOS)
      const uri =
        written.uri ||
        (
          await Filesystem.getUri({
            path,
            directory: Directory.Cache,
          })
        ).uri

      await Share.share({
        title: 'Credencial GCO',
        text: filename,
        url: uri,
        dialogTitle: 'Guardar o compartir credencial',
      })
      return 'share'
    } catch (err) {
      // Plugin no instalado o usuario canceló → seguir con fallbacks
      console.warn('[saveCanvasPng] Capacitor path failed', err)
    }

    // Fallback Capacitor: solo Share con data URL (algunos WebViews)
    try {
      const { Share } = await import('@capacitor/share')
      const dataUrl = canvas.toDataURL('image/png')
      await Share.share({
        title: 'Credencial GCO',
        text: filename,
        url: dataUrl,
        dialogTitle: 'Guardar o compartir credencial',
      })
      return 'share'
    } catch {
      /* continue */
    }
  }

  // ── 2) Web Share con archivos (PWA / Android Chrome / iOS Safari) ───────
  try {
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: 'Credencial GCO',
        text: filename,
      })
      return 'share'
    }
  } catch {
    /* usuario canceló o no soportado */
  }

  // ── 3) <a download> + object URL (web, Electron, PWA) ───────────────────
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    window.setTimeout(() => {
      try {
        document.body.removeChild(a)
      } catch {
        /* */
      }
      URL.revokeObjectURL(url)
    }, 2500)
    return 'download'
  } catch {
    /* */
  }

  // ── 4) dataURL click ────────────────────────────────────────────────────
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return 'download'
  } catch {
    /* */
  }

  // ── 5) Abrir en pestaña / location (último recurso en WebView) ──────────
  try {
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      // En muchos WebViews Android open() está bloqueado
      window.location.href = url
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'open'
  } catch {
    return 'fail'
  }
}

export async function downloadCredential(
  opts: CredentialOptions = {}
): Promise<'download' | 'share' | 'open' | 'fail'> {
  const {
    hideAge = false,
    theme = 'dark',
    showFrame = true,
    showFavoriteGame = false,
    favoriteGameLabel,
    showFavoriteBook = false,
    favoriteBookLabel,
    showFavoriteTrack = false,
    favoriteTrackLabel,
  } = opts

  const profile = getProfile()
  const total = getTotalProgress()
  const name = profile?.name?.trim() || 'Atleta GCO'
  const age = hideAge ? undefined : profile?.age
  const frame = (profile?.avatarFrame ?? 'none') as FrameId
  const c = palette(theme)

  const W = 900
  const H = 560
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'fail'

  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, c.bg0)
  grad.addColorStop(0.5, c.bg1)
  grad.addColorStop(1, c.bg0)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  if (theme === 'rainbow') {
    const g2 = ctx.createRadialGradient(700, 120, 10, 700, 120, 280)
    g2.addColorStop(0, 'rgba(255,107,203,0.18)')
    g2.addColorStop(1, 'transparent')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)
    const g3 = ctx.createRadialGradient(120, 400, 10, 120, 400, 240)
    g3.addColorStop(0, 'rgba(139,124,246,0.16)')
    g3.addColorStop(1, 'transparent')
    ctx.fillStyle = g3
    ctx.fillRect(0, 0, W, H)
  } else {
    const glow = ctx.createRadialGradient(160, 200, 20, 160, 200, 220)
    glow.addColorStop(
      0,
      theme === 'light' ? 'rgba(13,148,136,0.12)' : 'rgba(34,230,197,0.12)'
    )
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
  }

  ctx.strokeStyle = c.border
  ctx.lineWidth = 2.5
  roundRect(ctx, 22, 22, W - 44, H - 44, 22)
  ctx.stroke()

  ctx.strokeStyle =
    theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  roundRect(ctx, 32, 32, W - 64, H - 64, 16)
  ctx.stroke()

  ctx.fillStyle = c.primary
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillText('GYMCOGORIGINS', 56, 64)

  ctx.fillStyle = c.ink
  ctx.font = '600 26px system-ui, sans-serif'
  ctx.fillText('Credencial de progreso', 56, 98)

  ctx.fillStyle = c.muted
  ctx.font = '400 14px system-ui, sans-serif'
  ctx.fillText('Gimnasio cognitivo · Registro personal', 56, 122)

  ctx.strokeStyle =
    theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(56, 140)
  ctx.lineTo(W - 56, 140)
  ctx.stroke()

  const avatarCx = 120
  const avatarCy = 248
  const avatarR = 58

  if (profile?.avatarDataUrl) {
    const img = await loadImage(profile.avatarDataUrl)
    if (img) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(
        img,
        avatarCx - avatarR,
        avatarCy - avatarR,
        avatarR * 2,
        avatarR * 2
      )
      ctx.restore()
    }
  } else {
    ctx.fillStyle = c.card
    ctx.beginPath()
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.muted
    ctx.font = '600 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(name.charAt(0).toUpperCase(), avatarCx, avatarCy + 10)
    ctx.textAlign = 'left'
  }

  if (showFrame) {
    drawFrame(ctx, avatarCx, avatarCy, avatarR, frame, c.primary)
  } else {
    // Borde sutil mínimo si se oculta el marco
    ctx.strokeStyle = c.border
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(avatarCx, avatarCy, avatarR + 2, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = c.ink
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText(name, 210, 222)

  const defeats = Math.max(0, total.totalAttempts - total.totalCompleted)
  const meta = [
    age != null ? `${age} años` : null,
    `Skill ${total.skillScore}%`,
    `Índice ${total.winRate}%`,
    `${total.totalCompleted}V · ${defeats}D`,
    `${total.totalLevels} niveles`,
  ]
    .filter(Boolean)
    .join('  ·  ')

  ctx.fillStyle = c.muted
  ctx.font = '400 15px system-ui, sans-serif'
  ctx.fillText(meta, 210, 252)

  let favY = 278
  const favs: string[] = []
  if (showFavoriteGame && favoriteGameLabel) favs.push(`🎮 ${favoriteGameLabel}`)
  if (showFavoriteBook && favoriteBookLabel) favs.push(`📖 ${favoriteBookLabel}`)
  if (showFavoriteTrack && favoriteTrackLabel)
    favs.push(`🎵 ${favoriteTrackLabel}`)
  if (favs.length) {
    ctx.fillStyle = c.faint
    ctx.font = '400 13px system-ui, sans-serif'
    ctx.fillText(favs.join('   '), 210, favY)
  }

  let y = 330
  ctx.fillStyle = c.primary
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('RÉCORDS', 56, y)
  y += 26

  ctx.font = '400 14px ui-monospace, SFMono-Regular, Menlo, monospace'
  const lines = total.byGame.slice(0, 5)
  if (lines.length === 0) {
    ctx.fillStyle = c.faint
    ctx.fillText('Aún sin partidas registradas', 56, y)
  } else {
    for (const g of lines) {
      const label = `${g.categoryId} / ${g.gameId.replace(/-/g, ' ')}`
      const losses = Math.max(0, g.totalAttempts - g.totalCompleted)
      const stats = `Nv. ${g.highestLevel}  ·  ${g.totalCompleted}V/${losses}D  ·  ${g.winRate}%`
      ctx.fillStyle = c.faint
      ctx.fillText(label, 56, y)
      ctx.fillStyle = c.ink
      ctx.globalAlpha = 0.85
      ctx.fillText(stats, 400, y)
      ctx.globalAlpha = 1
      y += 22
    }
  }

  ctx.fillStyle = c.faint
  ctx.font = '400 11px system-ui, sans-serif'
  const issued = new Date().toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  ctx.fillText(`Emitida · ${issued}`, 56, H - 40)
  ctx.fillText('Desarrollado por Savitar Xeno', W - 250, H - 40)

  const safeName =
    name
      .replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || 'atleta'
  const filename = `gco-credencial-${safeName}.png`
  return saveCanvasPng(canvas, filename)
}