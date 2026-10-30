import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  getAppMode,
  setAppMode,
  pathForMode,
  type AppMode,
} from '@/core/storage/appMode'
import { soundClick } from '@/core/audio/uiSounds'

/* ═══════════════════════════════════════════════════════════════════════════
 * ModeSwitch — selector de modo de la app (Nutrición · GymCog · Música)
 *
 * Principios de diseño (para evitar el bloqueo que ocurría en la PWA):
 *
 *  1. LA URL ES LA ÚNICA FUENTE DE VERDAD. El modo visible se deriva de la ruta
 *     actual; el storage solo es respaldo para rutas "neutras" y se sincroniza
 *     DESPUÉS de navegar, nunca antes.
 *  2. Estado optimista controlado ("pending"): al pulsar se muestra al instante
 *     el modo destino, y se limpia cuando la ruta cambia (o por timeout).
 *  3. Ruta destino validada: si `pathForMode` devuelve algo inválido se usa una
 *     ruta de respaldo local, así el botón nunca queda "muerto".
 *  4. Red de seguridad: si el router no cambió la ruta tras un instante, se
 *     fuerza la navegación nativa (útil con service worker / PWA instalada).
 *  5. Emojis protegidos de mutaciones externas (Twemoji, traductores, etc.):
 *     se pintan con dangerouslySetInnerHTML sobre un contenedor estable para
 *     que React nunca intente reconciliar nodos que otro script reemplazó.
 *     Es lo que provocaba errores tipo "removeChild / insertBefore" y el
 *     switch dejaba de responder.
 *  6. Accesible: tablist real, flechas ←/→, Home/End, foco visible.
 * ========================================================================= */

export type ModeDef = {
  id: AppMode
  label: string
  /** Etiqueta corta para espacios muy estrechos */
  short: string
  emoji: string
  /** Ruta de respaldo si `pathForMode` falla o devuelve un valor inválido */
  fallbackPath: string
  /** Descripción para lectores de pantalla y tooltip */
  description: string
}

export const MODES: readonly ModeDef[] = [
  {
    id: 'nutricion',
    label: 'Nutrición',
    short: 'Nutri',
    emoji: '🍎',
    fallbackPath: '/nutricion',
    description: 'Libros, lectura y nutrición cognitiva',
  },
  {
    id: 'gym',
    label: 'GymCog',
    short: 'Gym',
    emoji: '🧠',
    fallbackPath: '/',
    description: 'Entrenamiento mental y juegos cognitivos',
  },
  {
    id: 'musica',
    label: 'Música',
    short: 'Música',
    emoji: '🎵',
    fallbackPath: '/musica',
    description: 'Biblioteca, listas y reproductor',
  },
] as const

/** Prefijos de ruta que pertenecen a cada modo. El orden no importa. */
const GYM_PREFIXES = ['/categoria', '/ajustes', '/games', '/gym'] as const

/** Deriva el modo real desde la ruta actual (fuente de verdad visual). */
export function modeFromPath(pathname: string): AppMode | null {
  const p = pathname || '/'
  if (p === '/nutricion' || p.startsWith('/nutricion/')) return 'nutricion'
  if (p === '/musica' || p.startsWith('/musica/')) return 'musica'
  if (p === '/') return 'gym'
  for (const prefix of GYM_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + '/')) return 'gym'
  }
  return null
}

/** Devuelve una ruta válida para el modo, aunque `pathForMode` falle. */
export function safePathFor(mode: AppMode): string {
  const def = MODES.find((m) => m.id === mode)
  const fallback = def?.fallbackPath ?? '/'
  try {
    const p = pathForMode(mode)
    if (typeof p === 'string' && p.startsWith('/') && modeFromPath(p) === mode) {
      return p
    }
  } catch {
    /* se usa el respaldo */
  }
  return fallback
}

function isAppMode(v: unknown): v is AppMode {
  return v === 'nutricion' || v === 'gym' || v === 'musica'
}

function readStoredMode(): AppMode {
  try {
    const m = getAppMode()
    if (isAppMode(m)) return m
  } catch {
    /* */
  }
  return 'gym'
}

function persistMode(mode: AppMode) {
  try {
    if (readStoredMode() !== mode) setAppMode(mode)
  } catch {
    /* El storage nunca debe bloquear la navegación */
  }
}

/**
 * Tiempos adaptativos según el peso del almacenamiento (lo calcula
 * CategoryMenu y lo deja en sessionStorage). Con bibliotecas de >1 GB la
 * carga de la pantalla destino tarda más: no se fuerza ninguna recarga
 * prematura, que en iOS agravaba el bloqueo.
 */
function storageLevel(): 0 | 1 | 2 {
  try {
    const v = sessionStorage.getItem('gco:storage-heavy')
    return v === '2' ? 2 : v === '1' ? 1 : 0
  } catch {
    return 0
  }
}

function timings() {
  const lvl = storageLevel()
  return {
    safetyMs: lvl === 2 ? 6000 : lvl === 1 ? 3000 : 450,
    pendingMs: lvl === 2 ? 9000 : lvl === 1 ? 4500 : 1500,
  }
}

/** Avisa a Música/Audiolibros para liberar blobs y object URLs antes de salir. */
function announceLeaving(from: AppMode | null, to: AppMode) {
  try {
    window.dispatchEvent(new CustomEvent('gco:mode-leaving', { detail: { from, to } }))
  } catch {
    /* */
  }
}

function haptic() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8)
    }
  } catch {
    /* */
  }
}

/* ───────────────────────── Hook reutilizable ───────────────────────── */

/**
 * Hook para el resto de pantallas (Nutrición, Música…): devuelve el modo
 * efectivo según la URL y una función para cambiarlo con las mismas garantías
 * que el switch visual.
 */
export function useAppModeSwitch() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  const mode = useMemo<AppMode>(
    () => modeFromPath(location.pathname) ?? readStoredMode(),
    [location.pathname]
  )

  const switchTo = useCallback(
    (next: AppMode, opts?: { replace?: boolean }) => {
      if (!isAppMode(next)) return
      const target = safePathFor(next)
      const { safetyMs } = timings()
      announceLeaving(modeFromPath(pathRef.current), next)
      try {
        startTransition(() => {
          navigate(target, { replace: opts?.replace ?? true })
        })
      } catch {
        window.location.assign(target)
        return
      }
      persistMode(next)
      // Red de seguridad: solo si el router no movió la ruta.
      window.setTimeout(() => {
        if (modeFromPath(pathRef.current) !== next) {
          try {
            window.location.assign(target)
          } catch {
            /* */
          }
        }
      }, safetyMs)
    },
    [navigate]
  )

  return { mode, switchTo }
}

/* ───────────────────────── Emoji protegido ───────────────────────── */

/**
 * Contenedor estable: React no vuelve a tocar su contenido mientras el HTML
 * sea el mismo, por lo que un reemplazo externo del emoji (Twemoji) no rompe
 * la reconciliación. `translate="no"` evita que traductores lo alteren.
 */
const SafeEmoji = memo(function SafeEmoji({ emoji }: { emoji: string }) {
  return (
    <span
      aria-hidden
      translate="no"
      className="gco-ms-emoji notranslate"
      dangerouslySetInnerHTML={{ __html: emoji }}
    />
  )
})

/* ───────────────────────── Estilos ───────────────────────── */

const STYLE_ID = 'gco-modeswitch-css'

const CSS = `
.gco-ms {
  --ms-pad: 3px;
  --ms-gap: 3px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ms-gap);
  padding: var(--ms-pad);
  border-radius: 999px;
  border: 1px solid var(--gco-glass-border);
  background: rgba(255,255,255,0.04);
  position: relative;
  flex-shrink: 0;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.gco-ms[data-full="false"] { min-width: 168px; max-width: 240px; }
.gco-ms[data-full="true"] { width: 100%; }
.gco-ms[data-busy="true"] .gco-ms-pill { animation: gco-ms-pulse 0.9s ease-in-out infinite; }
@keyframes gco-ms-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

.gco-ms-pill {
  position: absolute;
  top: var(--ms-pad);
  bottom: var(--ms-pad);
  left: var(--ms-pad);
  width: calc((100% - (var(--ms-pad) * 2) - (var(--ms-gap) * 2)) / 3);
  border-radius: 999px;
  background: rgba(34, 230, 197, 0.22);
  border: 1px solid rgba(34, 230, 197, 0.35);
  transform: translateX(calc(var(--ms-idx) * (100% + var(--ms-gap))));
  transition: transform 0.24s cubic-bezier(0.25, 0.1, 0.25, 1);
  pointer-events: none;
  z-index: 0;
  will-change: transform;
}

.gco-ms-btn {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.35rem 0.2rem;
  border-radius: 999px;
  color: var(--gco-ink-muted);
  font: inherit;
  font-size: 0.65rem;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.1;
  min-height: 40px;
  transition: color 0.2s ease;
  outline: none;
}
.gco-ms-btn[aria-selected="true"] { color: var(--gco-primary); font-weight: 700; }
.gco-ms-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--gco-primary);
}
.gco-ms-btn:active { transform: scale(0.97); }
.gco-ms-btn[disabled] { cursor: progress; }

.gco-ms-emoji {
  font-size: 0.9rem;
  line-height: 1;
  display: inline-block;
  min-height: 1em;
}
.gco-ms-emoji img.emoji, .gco-ms-emoji img.gco-emoji {
  height: 1em !important;
  width: 1em !important;
  margin: 0 !important;
  vertical-align: -0.1em !important;
}
.gco-ms-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 360px) {
  .gco-ms[data-full="false"] { min-width: 150px; }
  .gco-ms-btn { font-size: 0.6rem; }
}
@media (prefers-reduced-motion: reduce) {
  .gco-ms-pill, .gco-ms-btn { transition: none !important; animation: none !important; }
}
`

function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/* ───────────────────────── Componente ───────────────────────── */

type Props = {
  fullWidth?: boolean
  /** Usa etiquetas abreviadas (útil en barras muy estrechas). */
  compact?: boolean
  /** Callback opcional tras cambiar de modo. */
  onChange?: (mode: AppMode) => void
}

/** Evita toques fantasma (doble evento touch+click en iOS). */
const DEBOUNCE_MS = 220

export function ModeSwitch({ fullWidth = false, compact = false, onChange }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  ensureStyles()

  // Modo según la URL; si la ruta es neutra, respaldo en storage.
  const urlMode = useMemo<AppMode>(
    () => modeFromPath(pathname) ?? readStoredMode(),
    [pathname]
  )

  // Estado optimista mientras se navega.
  const [pending, setPending] = useState<AppMode | null>(null)
  const pendingTimer = useRef<number | null>(null)
  const safetyTimer = useRef<number | null>(null)
  const pathRef = useRef(pathname)
  const mounted = useRef(true)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const lastGo = useRef(0)

  pathRef.current = pathname

  const clearTimers = useCallback(() => {
    if (pendingTimer.current != null) window.clearTimeout(pendingTimer.current)
    if (safetyTimer.current != null) window.clearTimeout(safetyTimer.current)
    pendingTimer.current = null
    safetyTimer.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimers()
    }
  }, [clearTimers])

  // Cuando la ruta cambia, el estado optimista ya no hace falta.
  useEffect(() => {
    if (pending && urlMode === pending) {
      clearTimers()
      setPending(null)
    }
    // Sincroniza el storage DESPUÉS de que la URL manda.
    persistMode(urlMode)
  }, [urlMode, pending, clearTimers])

  // Eventos externos (otra pestaña, otra pantalla, historial del navegador).
  useEffect(() => {
    const sync = () => {
      const fromUrl = modeFromPath(window.location.pathname)
      if (fromUrl) persistMode(fromUrl)
    }
    const onStorage = (e: StorageEvent) => {
      // Otra pestaña cambió el modo: solo informativo, la URL manda aquí.
      if (e.key && e.key.toLowerCase().includes('mode')) sync()
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const shown: AppMode = pending ?? urlMode
  const idx = Math.max(
    0,
    MODES.findIndex((m) => m.id === shown)
  )
  const busy = pending !== null

  const go = useCallback(
    (next: AppMode) => {
      if (!isAppMode(next)) return
      if (next === urlMode && !pending) return
      if (pending === next) return

      const nowTs = Date.now()
      if (nowTs - lastGo.current < DEBOUNCE_MS) return
      lastGo.current = nowTs

      const { safetyMs, pendingMs } = timings()

      soundClick()
      haptic()
      announceLeaving(urlMode, next)

      const target = safePathFor(next)

      setPending(next)
      clearTimers()

      // Si por cualquier motivo la ruta no cambia, se libera el estado.
      pendingTimer.current = window.setTimeout(() => {
        if (mounted.current) setPending(null)
      }, pendingMs)

      try {
        // startTransition mantiene la UI fluida mientras carga el chunk destino.
        startTransition(() => {
          navigate(target, { replace: true })
        })
      } catch {
        // El router falló: navegación nativa directa.
        window.location.replace(target)
        return
      }

      // Red de seguridad para PWA: si el router no movió la URL, la forzamos.
      safetyTimer.current = window.setTimeout(() => {
        if (!mounted.current) return
        const now = modeFromPath(pathRef.current)
        if (now !== next) {
          try {
            window.location.replace(target)
          } catch {
            /* */
          }
        }
      }, safetyMs)

      persistMode(next)
      try {
        onChange?.(next)
      } catch {
        /* El callback del consumidor no debe romper el switch */
      }
    },
    [urlMode, pending, navigate, clearTimers, onChange]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    let nextIdx = idx
    if (e.key === 'ArrowLeft') nextIdx = (idx + MODES.length - 1) % MODES.length
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % MODES.length
    if (e.key === 'Home') nextIdx = 0
    if (e.key === 'End') nextIdx = MODES.length - 1
    const m = MODES[nextIdx]
    btnRefs.current[m.id]?.focus()
    go(m.id)
  }

  return (
    <div
      role="tablist"
      aria-label="Modo de la app"
      aria-busy={busy}
      className="gco-ms"
      data-full={fullWidth ? 'true' : 'false'}
      data-busy={busy ? 'true' : 'false'}
      onKeyDown={onKeyDown}
      style={{ ['--ms-idx' as string]: idx } as React.CSSProperties}
    >
      <span aria-hidden className="gco-ms-pill" />
      {MODES.map((m) => {
        const active = shown === m.id
        return (
          <button
            key={m.id}
            ref={(el) => {
              btnRefs.current[m.id] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${m.label}: ${m.description}`}
            title={m.description}
            tabIndex={active ? 0 : -1}
            onClick={() => go(m.id)}
            className="gco-ms-btn"
          >
            <SafeEmoji emoji={m.emoji} />
            <span className="gco-ms-label">{compact ? m.short : m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ModeSwitch
