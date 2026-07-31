import { getProfile } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'

type CredentialOptions = {
  hideAge?: boolean
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
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function downloadCredential(opts: CredentialOptions = {}) {
  const { hideAge = false } = opts
  const profile = getProfile()
  const total = getTotalProgress()
  const name = profile?.name?.trim() || 'Atleta GCO'
  const age = hideAge ? undefined : profile?.age

  const W = 900
  const H = 560
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Fondo
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#0B1220')
  grad.addColorStop(0.45, '#15102A')
  grad.addColorStop(1, '#0B1220')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Glow decorativo
  const glow = ctx.createRadialGradient(160, 200, 20, 160, 200, 220)
  glow.addColorStop(0, 'rgba(34, 230, 197, 0.12)')
  glow.addColorStop(1, 'rgba(34, 230, 197, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Marco exterior
  ctx.strokeStyle = 'rgba(34, 230, 197, 0.4)'
  ctx.lineWidth = 2.5
  roundRect(ctx, 22, 22, W - 44, H - 44, 22)
  ctx.stroke()

  // Marco interior fino
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  roundRect(ctx, 32, 32, W - 64, H - 64, 16)
  ctx.stroke()

  // Marca superior
  ctx.fillStyle = 'rgba(34, 230, 197, 0.9)'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillText('GYMCOGORIGINS', 56, 64)

  ctx.fillStyle = '#F3F5FA'
  ctx.font = '600 26px system-ui, sans-serif'
  ctx.fillText('Credencial de progreso', 56, 98)

  ctx.fillStyle = 'rgba(243,245,250,0.5)'
  ctx.font = '400 14px system-ui, sans-serif'
  ctx.fillText('Gimnasio cognitivo · Registro personal', 56, 122)

  // Línea divisoria
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(56, 140)
  ctx.lineTo(W - 56, 140)
  ctx.stroke()

  // Avatar
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
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(243,245,250,0.55)'
    ctx.font = '600 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(name.charAt(0).toUpperCase(), avatarCx, avatarCy + 10)
    ctx.textAlign = 'left'
  }

  ctx.strokeStyle = 'rgba(34, 230, 197, 0.55)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(avatarCx, avatarCy, avatarR + 3, 0, Math.PI * 2)
  ctx.stroke()

  // Nombre y meta
  ctx.fillStyle = '#F3F5FA'
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText(name, 210, 230)

  const meta = [
    age != null ? `${age} años` : null,
    `Progreso ${total.percent}%`,
    `${total.totalLevels} niveles`,
    `${total.totalCompleted} victorias`,
  ]
    .filter(Boolean)
    .join('  ·  ')

  ctx.fillStyle = 'rgba(243,245,250,0.6)'
  ctx.font = '400 16px system-ui, sans-serif'
  ctx.fillText(meta, 210, 262)

  // Récords
  let y = 330
  ctx.fillStyle = '#22E6C5'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('RÉCORDS', 56, y)
  y += 26

  ctx.fillStyle = 'rgba(243,245,250,0.78)'
  ctx.font = '400 14px ui-monospace, SFMono-Regular, Menlo, monospace'

  const lines = total.byGame.slice(0, 6)
  if (lines.length === 0) {
    ctx.fillStyle = 'rgba(243,245,250,0.45)'
    ctx.fillText('Aún sin partidas registradas', 56, y)
  } else {
    for (const g of lines) {
      const label = `${g.categoryId} / ${g.gameId.replace(/-/g, ' ')}`
      const stats = `Nv. ${g.highestLevel}  ·  ${g.totalCompleted} wins`
      ctx.fillStyle = 'rgba(243,245,250,0.55)'
      ctx.fillText(label, 56, y)
      ctx.fillStyle = 'rgba(243,245,250,0.85)'
      ctx.fillText(stats, 420, y)
      y += 22
    }
  }

  // Pie
  ctx.fillStyle = 'rgba(243,245,250,0.32)'
  ctx.font = '400 11px system-ui, sans-serif'
  const issued = new Date().toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  ctx.fillText(`Emitida · ${issued}`, 56, H - 40)
  ctx.fillText('Desarrollado por Savitar Xeno', W - 56 - 180, H - 40)

  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `gco-credencial-${name.replace(/\s+/g, '-').toLowerCase()}.png`
  a.click()
}