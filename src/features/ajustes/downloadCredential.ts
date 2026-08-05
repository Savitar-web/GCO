import { getProfile, type AvatarFrame } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'

export type CredentialTheme = 'dark' | 'light' | 'rainbow'

export type CredentialOptions = {
  hideAge?: boolean
  theme?: CredentialTheme
  showFavoriteGame?: boolean
  favoriteGameLabel?: string
  showFavoriteBook?: boolean
  favoriteBookLabel?: string
  showFavoriteTrack?: boolean
  favoriteTrackLabel?: string
}

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
  frame: AvatarFrame,
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
  // glass
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

/** Descarga robusta: blob + <a download> + Share API + fallback ventana */
export async function saveCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<'download' | 'share' | 'open' | 'fail'> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png', 1)
  )
  if (!blob) return 'fail'

  const file = new File([blob], filename, { type: 'image/png' })

  // 1) Web Share con archivos (iOS PWA / Android)
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
    /* usuario canceló o no soportado → seguir */
  }

  // 2) <a download> + object URL
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
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 2500)
    return 'download'
  } catch {
    /* */
  }

  // 3) dataURL click (algunos WebViews)
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return 'download'
  } catch {
    /* */
  }

  // 4) Abrir en pestaña para “Guardar imagen”
  try {
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      // último recurso: location
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
  const frame = (profile?.avatarFrame ?? 'none') as AvatarFrame
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
    glow.addColorStop(0, theme === 'light' ? 'rgba(13,148,136,0.12)' : 'rgba(34,230,197,0.12)')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
  }

  ctx.strokeStyle = c.border
  ctx.lineWidth = 2.5
  roundRect(ctx, 22, 22, W - 44, H - 44, 22)
  ctx.stroke()

  ctx.strokeStyle = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
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

  ctx.strokeStyle = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
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

  drawFrame(ctx, avatarCx, avatarCy, avatarR, frame, c.primary)

  ctx.fillStyle = c.ink
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText(name, 210, 222)

  const meta = [
    age != null ? `${age} años` : null,
    `Skill ${total.skillScore}%`,
    `${total.totalLevels} niveles`,
    `${total.totalCompleted} victorias`,
  ]
    .filter(Boolean)
    .join('  ·  ')

  ctx.fillStyle = c.muted
  ctx.font = '400 15px system-ui, sans-serif'
  ctx.fillText(meta, 210, 252)

  // Favoritos
  let favY = 278
  const favs: string[] = []
  if (showFavoriteGame && favoriteGameLabel) favs.push(`🎮 ${favoriteGameLabel}`)
  if (showFavoriteBook && favoriteBookLabel) favs.push(`📖 ${favoriteBookLabel}`)
  if (showFavoriteTrack && favoriteTrackLabel) favs.push(`🎵 ${favoriteTrackLabel}`)
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
      const stats = `Nv. ${g.highestLevel}  ·  ${g.totalCompleted} wins  ·  ${g.winRate}%`
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

  const safeName = name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').replace(/\s+/g, '-').toLowerCase() || 'atleta'
  const filename = `gco-credencial-${safeName}.png`
  return saveCanvasPng(canvas, filename)
}
