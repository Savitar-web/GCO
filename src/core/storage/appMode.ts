export type AppMode = 'gym' | 'nutricion' | 'musica'

const KEY = 'gco:app-mode'

export function getAppMode(): AppMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'nutricion' || v === 'musica' || v === 'gym') return v
  } catch {
    /* ignore */
  }
  return 'gym'
}

export function setAppMode(mode: AppMode) {
  const prev = getAppMode()
  if (prev === mode) {
    // Re-emite para que los listeners puedan re-sincronizar navegación
    window.dispatchEvent(new CustomEvent('gco:app-mode', { detail: mode }))
    return
  }
  localStorage.setItem(KEY, mode)
  window.dispatchEvent(new CustomEvent('gco:app-mode', { detail: mode }))
}

export function pathForMode(mode: AppMode): string {
  if (mode === 'nutricion') return '/nutricion'
  if (mode === 'musica') return '/musica'
  return '/'
}