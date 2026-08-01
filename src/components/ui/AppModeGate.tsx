import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getAppMode, pathForMode, type AppMode } from '@/core/storage/appMode'

/**
 * Mantiene URL ↔ modo sincronizados en toda la app.
 */
export function AppModeGate() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const apply = (mode: AppMode) => {
      const path = location.pathname
      const inNut = path.startsWith('/nutricion')
      const inMus = path.startsWith('/musica')
      const inGymArea =
        path === '/' ||
        path.startsWith('/categoria') ||
        path.startsWith('/ajustes')

      if (mode === 'nutricion' && !inNut) {
        navigate('/nutricion', { replace: true })
        return
      }
      if (mode === 'musica' && !inMus) {
        navigate('/musica', { replace: true })
        return
      }
      if (mode === 'gym' && (inNut || inMus)) {
        navigate('/', { replace: true })
      }
      // gym + inGymArea → no tocar
      void inGymArea
      void pathForMode
    }

    apply(getAppMode())

    const on = (e: Event) => {
      apply((e as CustomEvent<AppMode>).detail ?? getAppMode())
    }
    window.addEventListener('gco:app-mode', on)
    return () => window.removeEventListener('gco:app-mode', on)
  }, [navigate, location.pathname])

  return null
}