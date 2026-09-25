import { useEffect, useState, useCallback, useMemo } from 'react'

/**
 * Temas GCO — colores + forma + animación (data-theme en <html>).
 * Persistencia: localStorage `gco:theme`
 */
export type ThemeMode =
  | 'dark'
  | 'light'
  | 'rainbow'
  | 'raygun-gothic'
  | 'cluttercore'
  | 'oceancore'
  | 'spacecore'
  | 'goblincore'
  | 'fairycore'
  | 'nightcore'
  | 'retro-cgi'
  | 'vectorheart'
  | 'windowscore'
  | 'frutiger-aero'
  | 'vaporwave'
  | 'y2k'
  | 'glassmorphism'
  | 'cyberpunk'
  | 'solarpunk'
  | 'steampunk'
  | 'dieselpunk'
  | 'cassette-futurism'
  | 'synthwave'
  | 'brutalism'
  | 'neumorphism'
  | 'memphis'
  | 'bauhaus'
  | 'art-deco'
  | 'retrofuturism'
  | 'dark-academia'
  | 'light-academia'
  | 'cottagecore'
  | 'dreamcore'
  | 'weirdcore'
  | 'liminal'
  | 'biopunk'
  | 'techwear'
  | 'corporate-memphis'
  | 'skeuomorphism'
  | 'scandinavian'
  | 'maximalism'
  | 'ukiyo-e'
  | 'cyber-y2k'

/** Forma dominante del tema (documentada para UI / accesibilidad). */
export type ThemeShape =
  | 'pill'
  | 'soft'
  | 'sharp'
  | 'square'
  | 'organic'
  | 'tech'
  | 'ornate'

export type ThemeMeta = {
  id: ThemeMode
  label: string
  icon: string
  group: 'base' | 'retro' | 'nature' | 'tech' | 'art' | 'mood'
  blurb: string
  shape: ThemeShape
}

export const THEME_CATALOG: ThemeMeta[] = [
  { id: 'dark', label: 'Oscuro', icon: '🌙', group: 'base', blurb: 'Liquid glass nocturno', shape: 'soft' },
  { id: 'light', label: 'Claro', icon: '☀️', group: 'base', blurb: 'Legible y profesional', shape: 'soft' },
  { id: 'rainbow', label: 'Arcoíris', icon: '🌈', group: 'base', blurb: 'Pasteles vibrantes', shape: 'pill' },
  { id: 'raygun-gothic', label: 'Raygun Gothic', icon: '🚀', group: 'retro', blurb: 'Futuro de los 50 · ángulos vivos', shape: 'sharp' },
  { id: 'cluttercore', label: 'Cluttercore', icon: '🧩', group: 'mood', blurb: 'Caos organizado · burbujas irregulares', shape: 'organic' },
  { id: 'oceancore', label: 'Oceancore', icon: '🌊', group: 'nature', blurb: 'Profundidad · formas fluidas', shape: 'organic' },
  { id: 'spacecore', label: 'Spacecore', icon: '🪐', group: 'tech', blurb: 'Órbitas y bordes técnicos', shape: 'tech' },
  { id: 'goblincore', label: 'Goblincore', icon: '🍄', group: 'nature', blurb: 'Musgo · esquinas naturales', shape: 'organic' },
  { id: 'fairycore', label: 'Fairycore', icon: '🧚', group: 'nature', blurb: 'Curvas suaves mágicas', shape: 'pill' },
  { id: 'nightcore', label: 'Nightcore', icon: '💜', group: 'tech', blurb: 'Neón · chips y pastillas', shape: 'tech' },
  { id: 'retro-cgi', label: 'Retro CGI', icon: '🖥️', group: 'retro', blurb: 'Polígonos duros 90s', shape: 'square' },
  { id: 'vectorheart', label: 'Vectorheart', icon: '💖', group: 'retro', blurb: 'Brillos y burbujas 2008', shape: 'pill' },
  { id: 'windowscore', label: 'Windowscore', icon: '🪟', group: 'retro', blurb: 'XP · esquinas 3px', shape: 'square' },
  { id: 'frutiger-aero', label: 'Frutiger Aero', icon: '💧', group: 'retro', blurb: 'Burbujas de agua y cielo', shape: 'pill' },
  { id: 'vaporwave', label: 'Vaporwave', icon: '🌴', group: 'retro', blurb: 'Rectángulos y glitch', shape: 'sharp' },
  { id: 'y2k', label: 'Y2K', icon: '💿', group: 'retro', blurb: 'Cromo y curvas orgánicas', shape: 'organic' },
  { id: 'glassmorphism', label: 'Glassmorphism', icon: '🔮', group: 'tech', blurb: 'Cristal esmerilado redondo', shape: 'soft' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🌃', group: 'tech', blurb: 'Cortes diagonales y chips', shape: 'tech' },
  { id: 'solarpunk', label: 'Solarpunk', icon: '🌿', group: 'nature', blurb: 'Orgánico y sostenible', shape: 'organic' },
  { id: 'steampunk', label: 'Steampunk', icon: '⚙️', group: 'retro', blurb: 'Engranajes · ornato', shape: 'ornate' },
  { id: 'dieselpunk', label: 'Dieselpunk', icon: '✈️', group: 'retro', blurb: 'Industrial angular', shape: 'sharp' },
  { id: 'cassette-futurism', label: 'Cassette Futurism', icon: '📼', group: 'retro', blurb: 'CRT · botones físicos', shape: 'square' },
  { id: 'synthwave', label: 'Synthwave', icon: '🚗', group: 'retro', blurb: 'Pastillas neón', shape: 'pill' },
  { id: 'brutalism', label: 'Brutalismo', icon: '⬛', group: 'art', blurb: 'Bloques sin redondeo', shape: 'square' },
  { id: 'neumorphism', label: 'Neumorphism', icon: '🔘', group: 'tech', blurb: 'Suave embutido', shape: 'soft' },
  { id: 'memphis', label: 'Memphis', icon: '🔺', group: 'art', blurb: 'Geometría ochentera', shape: 'sharp' },
  { id: 'bauhaus', label: 'Bauhaus', icon: '🟥', group: 'art', blurb: 'Círculo · cuadrado · triángulo', shape: 'sharp' },
  { id: 'art-deco', label: 'Art Deco', icon: '✨', group: 'art', blurb: 'Simetría y biseles', shape: 'ornate' },
  { id: 'retrofuturism', label: 'Retrofuturismo', icon: '🛸', group: 'retro', blurb: 'Cápsulas del futuro pasado', shape: 'pill' },
  { id: 'dark-academia', label: 'Dark Academia', icon: '📚', group: 'mood', blurb: 'Marcos clásicos', shape: 'ornate' },
  { id: 'light-academia', label: 'Light Academia', icon: '📜', group: 'mood', blurb: 'Papel y suavidad', shape: 'soft' },
  { id: 'cottagecore', label: 'Cottagecore', icon: '🌻', group: 'nature', blurb: 'Bordes naturales', shape: 'organic' },
  { id: 'dreamcore', label: 'Dreamcore', icon: '☁️', group: 'mood', blurb: 'Nubes y difuminado', shape: 'pill' },
  { id: 'weirdcore', label: 'Weirdcore', icon: '👁️', group: 'mood', blurb: 'Formas inquietas', shape: 'sharp' },
  { id: 'liminal', label: 'Liminal Space', icon: '🚪', group: 'mood', blurb: 'Pasillos · radios bajos', shape: 'square' },
  { id: 'biopunk', label: 'Biopunk', icon: '🧬', group: 'tech', blurb: 'Orgánico tecnológico', shape: 'organic' },
  { id: 'techwear', label: 'Techwear', icon: '🧥', group: 'tech', blurb: 'Utilitario angular', shape: 'tech' },
  { id: 'corporate-memphis', label: 'Corporate Memphis', icon: '🧍', group: 'art', blurb: 'Planos y pastillas', shape: 'soft' },
  { id: 'skeuomorphism', label: 'Skeuomorphism', icon: '📎', group: 'retro', blurb: 'Materiales reales', shape: 'soft' },
  { id: 'scandinavian', label: 'Escandinavo', icon: '🪵', group: 'art', blurb: 'Minimal · radios medios', shape: 'soft' },
  { id: 'maximalism', label: 'Maximalismo', icon: '🎨', group: 'art', blurb: 'Exceso y capas', shape: 'ornate' },
  { id: 'ukiyo-e', label: 'Ukiyo-e', icon: '🗻', group: 'art', blurb: 'Marcos tradicionales', shape: 'ornate' },
  { id: 'cyber-y2k', label: 'Cyber Y2K', icon: '🪩', group: 'tech', blurb: 'Holo · cromo líquido', shape: 'pill' },
]

export const THEMES: ThemeMode[] = THEME_CATALOG.map((t) => t.id)

const STORAGE_KEY = 'gco:theme'
const META_BY_ID = Object.fromEntries(THEME_CATALOG.map((t) => [t.id, t])) as Record<
  ThemeMode,
  ThemeMeta
>

function isThemeMode(v: string | null | undefined): v is ThemeMode {
  return !!v && (THEMES as string[]).includes(v)
}

function readStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isThemeMode(saved)) return saved
  } catch {
    /* */
  }
  return 'dark'
}

function applyThemeToDom(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const meta = META_BY_ID[theme]
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-gco-theme', theme)
  if (meta?.shape) root.setAttribute('data-gco-shape', meta.shape)
  root.classList.remove('theme-light', 'theme-dark', 'theme-rainbow')
  if (theme === 'light') root.classList.add('theme-light')
  if (theme === 'dark') root.classList.add('theme-dark')
  if (theme === 'rainbow') root.classList.add('theme-rainbow')
  try {
    window.dispatchEvent(new CustomEvent('gco:theme-change', { detail: { theme, shape: meta?.shape } }))
  } catch {
    /* */
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    applyThemeToDom(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* */
    }
  }, [theme])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isThemeMode(e.newValue)) setThemeState(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const index = THEMES.indexOf(current)
      return THEMES[(index + 1) % THEMES.length]
    })
  }, [])

  const setTheme = useCallback((next: ThemeMode) => {
    if (isThemeMode(next)) setThemeState(next)
  }, [])

  const meta = useMemo(() => META_BY_ID[theme] ?? META_BY_ID.dark, [theme])

  return {
    theme,
    label: meta.label,
    icon: meta.icon,
    blurb: meta.blurb,
    group: meta.group,
    shape: meta.shape,
    catalog: THEME_CATALOG,
    cycleTheme,
    setTheme,
  }
}