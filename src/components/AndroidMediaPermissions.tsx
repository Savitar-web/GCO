import { useEffect, useState } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { MediaWindow, nativeMediaWindow } from '@/core/media/mediaWindow'

export function AndroidMediaPermissions() {
  const [open,setOpen] = useState(false)
  const [message,setMessage] = useState('')
  useEffect(() => {
    if (nativeMediaWindow() && !localStorage.getItem('gco:media-permission-intro')) setOpen(true)
  }, [])
  if (!open) return null
  return <div className="terms-overlay" role="dialog" aria-modal="true" aria-label="Reproducción en segundo plano">
    <section className="gco-surface terms-body">
      <h2>Tu música también fuera de GCO</h2>
      <p>Activa las notificaciones para los controles de reproducción y revisa Imagen en imagen para ver vídeos al cambiar de aplicación. La disponibilidad depende de tu dispositivo.</p>
      <div className="gco-actions">
        <button className="glass-button" onClick={async () => {
          try { await LocalNotifications.requestPermissions();setMessage('Permiso de notificaciones revisado.') }
          catch { setMessage('Revisa las notificaciones desde los ajustes de Android.') }
        }}>Activar controles</button>
        <button className="glass-button secondary" onClick={() => void MediaWindow.openOverlaySettings().catch(() => setMessage('Abre Ajustes > Aplicaciones > GCO > Imagen en imagen.'))}>Imagen en imagen</button>
        <button className="glass-button secondary" onClick={() => {localStorage.setItem('gco:media-permission-intro','1');setOpen(false)}}>Continuar</button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  </div>
}
