import { getProfile } from '@/core/storage/userProfile'
import { getTotalProgress } from '@/core/storage/progress'

type CredentialOptions = {
  hideAge?: boolean
}

export async function downloadCredential(opts: CredentialOptions = {}) {
  const { hideAge = false } = opts
  const profile = getProfile()
  const total = getTotalProgress()
  const name = profile?.name ?? 'Atleta GCO'
  const age = hideAge ? undefined : profile?.age

  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 560
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Fondo
  const grad = ctx.createLinearGradient(0, 0, 900, 560)
  grad.addColorStop(0, '#0B1220')
  grad.addColorStop(0.5, '#1A1028')
  grad.addColorStop(1, '#0B1220')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 900, 560)

  // Marco
  ctx.strokeStyle = 'rgba(34, 230, 197, 0.45)'
  ctx.lineWidth = 3
  ctx.roundRect(24, 24, 852, 512, 24)
  ctx.stroke()

  // Título
  ctx.fillStyle = '#F3F5FA'
  ctx.font = '600 28px system-ui'
  ctx.fillText('GymCogOrigins — Credencial', 56, 80)

  ctx.fillStyle = 'rgba(243,245,250,0.55)'
  ctx.font = '400 16px system-ui'
  ctx.fillText('Gimnasio cognitivo · Registro de progreso', 56, 110)

  // Avatar
  if (profile?.avatarDataUrl) {
    const img = new Image()
    img.src = profile.avatarDataUrl
    await new Promise<void>((res) => {
      img.onload = () => res()
      img.onerror = () => res()
    })
    ctx.save()
    ctx.beginPath()
    ctx.arc(120, 250, 64, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(img, 56, 186, 128, 128)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(120, 250, 64, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = '#F3F5FA'
  ctx.font = '600 32px system-ui'
  ctx.fillText(name, 220, 230)

  ctx.fillStyle = 'rgba(243,245,250,0.65)'
  ctx.font = '400 18px system-ui'
  ctx.fillText(
    [age ? `${age} años` : null, `Progreso ${total.percent}%`, `${total.totalLevels} niveles`]
      .filter(Boolean)
      .join(' · '),
    220,
    265
  )

  // Records
  let y = 340
  ctx.fillStyle = '#22E6C5'
  ctx.font = '600 16px system-ui'
  ctx.fillText('Récords', 56, y)
  y += 28
  ctx.fillStyle = 'rgba(243,245,250,0.8)'
  ctx.font = '400 15px ui-monospace, monospace'
  const lines = total.byGame.slice(0, 6)
  if (lines.length === 0) {
    ctx.fillText('Aún sin partidas registradas', 56, y)
  } else {
    for (const g of lines) {
      ctx.fillText(
        `Memoria: nivel ${g.highestLevel}  ·  ${g.totalCompleted} wins`,
        56,
        y
      )
      y += 24
    }
  }

  ctx.fillStyle = 'rgba(243,245,250,0.35)'
  ctx.font = '400 12px system-ui'
  ctx.fillText(`Emitida · ${new Date().toLocaleString()}`, 56, 520)

  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `gco-credencial-${name.replace(/\s+/g, '-').toLowerCase()}.png`
  a.click()
}