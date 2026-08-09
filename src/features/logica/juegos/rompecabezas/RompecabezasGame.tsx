/**
 * RompecabezasGame — GymCogOrigins
 * Liquid glass · Container Queries · Play fit-to-screen
 * Motor: ../generateLevel.ts
 */

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PIECE_SHAPES,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  CATEGORY_ORDER,
  DEFAULT_IMAGES,
  imagesByCategory,
  PIECE_SUGGESTIONS,
  PIECES_MIN,
  PIECES_MAX,
  clampPieceCount,
  pieceTierInfoForLevel,
  piecesForLevel,
  generateJigsawLevel,
  generateCreativeJigsaw,
  imageForLevel,
  buildPiecePath,
  pieceTabPad,
  createPieces,
  distanceToCorrect,
  SNAP_THRESHOLD_CELLS,
  countLocked,
  isPuzzleComplete,
  calcJigsawStars,
  formatTime,
  loadCustomImages,
  addCustomImage,
  removeCustomImage,
  compressImageFile,
  loadPuzzleProgress,
  savePuzzleProgress,
} from '../generateLevel'
import type {
  PieceShape,
  PuzzleImage,
  JigsawLevel,
  JigsawPiece,
  PuzzleProgress,
} from '../generateLevel'

/* ═══════════════════════════════════════════════════════════════════════════
   Tipos
   ═══════════════════════════════════════════════════════════════════════════ */

type Screen =
  | 'normal'
  | 'creativo'
  | 'galeria'
  | 'mis-imagenes'
  | 'ajustes'
  | 'play'

type PlayOrigin = 'normal' | 'creativo'

interface SavedCreativeLevel {
  id: string
  name: string
  image: PuzzleImage
  pieces: number
  shape: PieceShape
  createdAt: number
  updatedAt: number
}

const CREATIVE_LEVELS_KEY = 'gco:puzzle-creative-levels'

function loadCreativeLevels(): SavedCreativeLevel[] {
  try {
    const raw = localStorage.getItem(CREATIVE_LEVELS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedCreativeLevel[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCreativeLevels(list: SavedCreativeLevel[]): void {
  try {
    localStorage.setItem(CREATIVE_LEVELS_KEY, JSON.stringify(list))
  } catch {
    /* quota */
  }
}


interface RompecabezasGameProps {
  onExit?: () => void
  userName?: string
}

interface PuzzleSettings {
  sound: boolean
  haptics: boolean
  defaultShape: PieceShape
}

interface CompletionInfo {
  stars: 0 | 1 | 2 | 3
  timeMs: number
}

const SETTINGS_KEY = 'gco:puzzle-settings'

const STATS_KEY = 'gco:puzzle-stats'

interface PuzzleStats {
  wins: number
  losses: number
  totalPlayMs: number
  history: {
    id: string
    at: number
    mode: 'normal' | 'creativo'
    level: number
    pieces: number
    stars: 0 | 1 | 2 | 3
    timeMs: number
  }[]
}

function defaultStats(): PuzzleStats {
  return { wins: 0, losses: 0, totalPlayMs: 0, history: [] }
}

function loadStats(): PuzzleStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return defaultStats()
    const p = JSON.parse(raw) as Partial<PuzzleStats>
    return {
      wins: p.wins ?? 0,
      losses: p.losses ?? 0,
      totalPlayMs: p.totalPlayMs ?? 0,
      history: Array.isArray(p.history) ? p.history.slice(0, 50) : [],
    }
  } catch {
    return defaultStats()
  }
}

function saveStats(s: PuzzleStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s))
  } catch {
    /* */
  }
}

function formatDurationLong(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
  )
}


function defaultSettings(): PuzzleSettings {
  return { sound: true, haptics: true, defaultShape: 'classic' }
}

function loadSettings(): PuzzleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<PuzzleSettings>
    return {
      sound: parsed.sound ?? true,
      haptics: parsed.haptics ?? true,
      defaultShape: parsed.defaultShape ?? 'classic',
    }
  } catch {
    return defaultSettings()
  }
}

function saveSettings(s: PuzzleSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* */
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* */
    }
  }
}

function stepFor(pieces: number): number {
  if (pieces < 20) return 1
  if (pieces < 100) return 5
  if (pieces < 500) return 25
  return 100
}

/** Celda que cabe en el viewport disponible (ancho Y alto). */
function fitCellPx(
  cols: number,
  rows: number,
  availW: number,
  availH: number,
  trayRows: number
): number {
  const padBudget = 48
  const w = Math.max(120, availW - padBudget)
  const h = Math.max(120, availH - padBudget)
  // espacio vertical: tablero + bandeja debajo
  const totalRows = rows + trayRows * 1.15 + 1.4
  const byW = Math.floor(w / Math.max(cols, 1))
  const byH = Math.floor(h / Math.max(totalRows, 1))
  const cell = Math.min(byW, byH)
  return Math.max(28, Math.min(cell, 120))
}

const NAV_ITEMS: { id: Screen; label: string; emoji: string; sub?: string }[] = [
  { id: 'normal', label: 'Modo Normal', emoji: '📈', sub: 'Progresión e historial' },
  { id: 'creativo', label: 'Modo Creativo', emoji: '✨', sub: 'Tus niveles guardados' },
  { id: 'galeria', label: 'Galería', emoji: '🖼️', sub: 'Imágenes por defecto' },
  { id: 'mis-imagenes', label: 'Mis Imágenes', emoji: '📁', sub: 'Importadas por ti' },
  { id: 'ajustes', label: 'Ajustes', emoji: '⚙️', sub: 'Stats y preferencias' },
]

const MOBILE_NAV: { id: Screen; label: string; emoji: string }[] = [
  { id: 'normal', label: 'Normal', emoji: '🧩' },
  { id: 'creativo', label: 'Creativo', emoji: '✨' },
  { id: 'galeria', label: 'Galería', emoji: '🖼️' },
  { id: 'mis-imagenes', label: 'Imágenes', emoji: '📁' },
  { id: 'ajustes', label: 'Ajustes', emoji: '⚙️' },
]

/* ═══════════════════════════════════════════════════════════════════════════
   Sonido
   ═══════════════════════════════════════════════════════════════════════════ */

function useJigsawSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)

  function getCtx(): AudioContext | null {
    if (!enabled || typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      try {
        ctxRef.current = new Ctor()
      } catch {
        return null
      }
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    delay: number
  ) {
    const ctx = getCtx()
    if (!ctx) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  return {
    playSnap: () => tone(720, 0.09, 'sine', 0.14, 0),
    playComplete: () => {
      tone(523.25, 0.16, 'triangle', 0.14, 0)
      tone(659.25, 0.16, 'triangle', 0.14, 0.1)
      tone(783.99, 0.26, 'triangle', 0.16, 0.2)
    },
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Estilos
   ═══════════════════════════════════════════════════════════════════════════ */

const SCOPED_STYLES = `
.pz-root *, .pz-root *::before, .pz-root *::after { box-sizing: border-box; }
.pz-root {
  --pz-neon: var(--gco-primary, #22E6C5);
  --pz-neon-dim: var(--gco-primary-dim, rgba(34,230,197,0.18));
  --pz-accent: var(--gco-accent, #8B7CF6);
  --pz-glass: rgba(255, 255, 255, 0.055);
  --pz-glass-thick: rgba(255, 255, 255, 0.09);
  --pz-border: rgba(255, 255, 255, 0.14);
  --pz-border-hi: rgba(255, 255, 255, 0.22);
  --pz-ink: var(--gco-ink, #F3F5FA);
  --pz-muted: var(--gco-ink-muted, rgba(243,245,250,0.64));
  --pz-faint: var(--gco-ink-faint, rgba(243,245,250,0.38));
  --pz-radius: 20px;
  --pz-radius-sm: 14px;
  --pz-nav-h: 88px;
  --pz-safe-b: env(safe-area-inset-bottom, 0px);
  --pz-safe-t: env(safe-area-inset-top, 0px);

  /* Ocupa el viewport del host sin pelear con layouts padre */
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(34,230,197,0.08), transparent 50%),
    radial-gradient(ellipse 60% 40% at 90% 10%, rgba(139,124,246,0.07), transparent 45%),
    var(--gco-bg, #0B1220);
  color: var(--pz-ink);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
  container-type: inline-size;
  container-name: pz-shell;
  isolation: isolate;
}

/* Sidebar */
.pz-sidebar {
  width: 236px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.2rem;
  padding: 1rem 0.8rem;
  border-right: 1px solid var(--pz-border);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 45%);
  overflow-y: auto; overflow-x: hidden; height: 100%;
}
.pz-brand { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.55rem 0.9rem; font-weight: 700; font-size: 1.02rem; }
.pz-brand-mark {
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--pz-neon), var(--pz-accent));
  color: #0B1220; font-size: 1.05rem;
  box-shadow: 0 0 18px rgba(34,230,197,0.4); flex-shrink: 0;
}
.pz-brand-sub { font-size: 0.66rem; font-weight: 500; color: var(--pz-muted); display: block; }
.pz-nav-btn {
  display: flex; align-items: center; gap: 0.6rem; width: 100%;
  padding: 0.65rem 0.7rem; border: 1px solid transparent; border-radius: 12px;
  background: transparent; color: var(--pz-muted);
  font: inherit; font-weight: 600; font-size: 0.86rem; text-align: left; cursor: pointer;
  transition: .15s;
}
.pz-nav-btn:hover { background: var(--pz-glass); color: var(--pz-ink); }
.pz-nav-btn.is-active {
  background: var(--pz-neon-dim); border-color: rgba(34,230,197,0.4);
  color: var(--pz-neon); box-shadow: 0 0 20px rgba(34,230,197,0.14);
}
.pz-nav-emoji { width: 1.3rem; text-align: center; flex-shrink: 0; }
.pz-nav-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pz-nav-sub { font-size: 0.64rem; font-weight: 400; color: var(--pz-faint); }
.pz-nav-btn.is-active .pz-nav-sub { color: var(--pz-neon); opacity: .75; }
.pz-side-profile {
  margin-top: auto; padding: 0.8rem; border-radius: 12px;
  background: var(--pz-glass); border: 1px solid var(--pz-border);
  display: flex; flex-direction: column; gap: 2px;
}
.pz-side-profile-name { font-weight: 700; font-size: 0.88rem; }
.pz-side-profile-meta { font-size: 0.72rem; color: var(--pz-muted); }

/* Main */
.pz-main {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  container-type: inline-size;
  container-name: pz-main;
}
.pz-topbar {
  flex-shrink: 0; display: flex; align-items: center; gap: 0.45rem;
  padding: calc(0.55rem + var(--pz-safe-t)) 0.85rem 0.5rem;
  width: 100%; max-width: 100%; overflow: hidden;
}
.pz-topbar-title {
  flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 0.4rem;
  font-weight: 700; font-size: 0.98rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pz-topbar-sub { font-weight: 500; font-size: 0.74rem; color: var(--pz-muted); }
.pz-topbar-right { display: flex; align-items: center; gap: 0.35rem; margin-left: auto; flex-shrink: 0; }
.pz-pill {
  padding: 0.32rem 0.7rem; border-radius: 999px;
  background: linear-gradient(165deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04));
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(12px);
  font-size: 0.78rem; font-variant-numeric: tabular-nums; white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
}
.pz-icon-btn {
  width: 36px; height: 36px; min-width: 36px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(165deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  color: var(--pz-ink);
  display: grid; place-items: center; cursor: pointer; font-size: 0.95rem; flex-shrink: 0;
  transition: .18s;
  backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
}
.pz-icon-btn:hover { border-color: rgba(34,230,197,0.45); background: rgba(34,230,197,0.12); }
.pz-icon-btn.is-on {
  border-color: rgba(34,230,197,0.55); color: var(--pz-neon);
  background: rgba(34,230,197,0.16);
  box-shadow: 0 0 14px rgba(34,230,197,0.2);
}

.pz-content {
  /* flex-basis 0% es clave: permite que el item se encoja y scrollee */
  flex: 1 1 0%;
  min-height: 0 !important;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden !important;
  overflow-y: scroll !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  padding: 0.7rem 1rem 1.25rem;
  padding-bottom: 1.25rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(34,230,197,0.25) transparent;
  position: relative;
  z-index: 1;
}
.pz-content::-webkit-scrollbar { width: 5px; }
.pz-content::-webkit-scrollbar-thumb {
  background: rgba(34,230,197,0.28); border-radius: 4px;
}
.pz-main.is-playing .pz-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  min-height: 0;
  padding: 0.45rem 0.65rem 0.55rem;
  overflow: hidden !important;
  padding-bottom: 0.55rem;
}
.pz-scroll-inner {
  width: 100%;
  max-width: 100%;
  min-height: min-content;
  padding-bottom: 0.5rem;
}

.pz-welcome { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; width: 100%; }
.pz-welcome-text { font-size: 0.9rem; color: var(--pz-muted); }
.pz-welcome-text strong { color: var(--pz-ink); }
.pz-welcome-stats { margin-left: auto; display: flex; gap: 0.35rem; flex-wrap: wrap; }

.pz-card {
  background: linear-gradient(
    155deg,
    rgba(255,255,255,0.12) 0%,
    rgba(255,255,255,0.05) 42%,
    rgba(255,255,255,0.025) 100%
  );
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: var(--pz-radius);
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-backdrop-filter: blur(36px) saturate(1.7);
  box-shadow:
    0 10px 36px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.16),
    inset 0 -1px 0 rgba(0,0,0,0.12);
  width: 100%;
  max-width: 100%;
}
.pz-panel {
  padding: 1.05rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-width: 100%;
}
.pz-panel-head { display: flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.95rem; margin: 0; }
.pz-panel-desc { font-size: 0.78rem; color: var(--pz-muted); line-height: 1.4; margin: -0.15rem 0 0; }

.pz-inicio-grid {
  display: grid; grid-template-columns: 1fr; gap: 0.85rem;
  align-items: start; width: 100%; max-width: 100%;
  padding-bottom: 0.5rem;
}
@container pz-main (min-width: 700px) {
  .pz-inicio-grid { grid-template-columns: 1fr 1fr; }
}
@container pz-main (min-width: 1000px) {
  .pz-inicio-grid { grid-template-columns: 1.15fr 1fr 0.85fr; }
}

.pz-level-row {
  display: flex; gap: 0.55rem; overflow-x: auto; overflow-y: hidden;
  padding: 2px 1px 8px; scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch; width: 100%; max-width: 100%;
  overscroll-behavior-x: contain;
}
.pz-level-row::-webkit-scrollbar { height: 3px; }
.pz-level-row::-webkit-scrollbar-thumb { background: rgba(34,230,197,0.35); border-radius: 4px; }
.pz-level-card {
  position: relative; flex: 0 0 auto; width: 100px; aspect-ratio: 3/4;
  border-radius: 14px; overflow: hidden; border: 1.5px solid var(--pz-border);
  background: rgba(0,0,0,0.25); cursor: pointer; scroll-snap-align: start;
  padding: 0; text-align: left; color: #fff; transition: .15s;
}
.pz-level-card.is-current {
  border-color: var(--pz-neon);
  box-shadow: 0 0 0 2px var(--pz-neon-dim), 0 0 20px rgba(34,230,197,0.22);
}
.pz-level-card.is-locked { opacity: 0.48; cursor: not-allowed; }
.pz-level-cover { position: absolute; inset: 0; background-size: cover; background-position: center; }
.pz-level-body {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 0.55rem;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.78));
}
.pz-level-label { font-weight: 700; font-size: 0.84rem; }
.pz-level-pieces { font-size: 0.68rem; opacity: .88; }
.pz-level-lock {
  position: absolute; top: 0.4rem; right: 0.4rem; width: 24px; height: 24px;
  border-radius: 8px; background: rgba(0,0,0,0.55); display: grid; place-items: center;
  font-size: 0.75rem; z-index: 2;
}
.pz-tier-track { display: flex; align-items: center; gap: 0.28rem; width: 100%; }
.pz-tier-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pz-border); flex-shrink: 0; }
.pz-tier-dot.is-on { background: var(--pz-neon); box-shadow: 0 0 8px var(--pz-neon); }
.pz-tier-line {
  flex: 1; height: 3px; border-radius: 3px; background: var(--pz-border);
  position: relative; overflow: hidden; min-width: 0;
}
.pz-tier-line > i {
  position: absolute; left: 0; top: 0; bottom: 0; background: var(--pz-neon);
  box-shadow: 0 0 10px var(--pz-neon); border-radius: 3px;
}

.pz-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
  padding: 0.7rem 1.05rem; border-radius: 999px; border: 1px solid transparent;
  font: inherit; font-weight: 700; font-size: 0.86rem; cursor: pointer;
  transition: .15s; max-width: 100%;
}
.pz-btn:active { transform: scale(0.98); }
.pz-btn-primary {
  background: linear-gradient(180deg, #3aefd0 0%, var(--pz-neon) 100%);
  color: var(--gco-button-text, #0B1220);
  box-shadow: 0 4px 20px rgba(34,230,197,0.4), inset 0 1px 0 rgba(255,255,255,0.35);
}
.pz-btn-accent { background: var(--pz-accent); color: #fff; box-shadow: 0 4px 16px rgba(139,124,246,0.35); }
.pz-btn-ghost { background: var(--pz-glass); border-color: var(--pz-border); color: var(--pz-ink); }
.pz-btn-ghost:hover { border-color: var(--pz-neon); color: var(--pz-neon); }
.pz-btn-block { width: 100%; }

.pz-preview {
  position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden;
  background: rgba(0,0,0,0.25); border: 1px solid var(--pz-border); width: 100%;
}
.pz-preview-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--pz-border);
  background: rgba(11,18,32,0.75); color: #fff; cursor: pointer;
  display: grid; place-items: center; z-index: 2;
}
.pz-preview-nav.prev { left: 8px; }
.pz-preview-nav.next { right: 8px; }
.pz-select {
  display: flex; align-items: center; justify-content: space-between; gap: 0.45rem;
  padding: 0.58rem 0.75rem; border-radius: 12px; border: 1px solid var(--pz-border);
  background: var(--gco-input-bg, rgba(0,0,0,0.28)); color: var(--pz-ink);
  font: inherit; font-weight: 600; font-size: 0.84rem; cursor: pointer;
  text-align: left; width: 100%; min-width: 0;
}
.pz-select > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pz-select-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; width: 100%; }
.pz-shape-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; width: 100%; }
.pz-shape-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
  padding: 0.7rem 0.3rem; border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
  color: var(--pz-muted); cursor: pointer; font: inherit; transition: .2s;
  backdrop-filter: blur(12px);
}
.pz-shape-card.is-on {
  border-color: rgba(34,230,197,0.5);
  background: linear-gradient(165deg, rgba(34,230,197,0.22), rgba(34,230,197,0.08));
  color: var(--pz-neon);
  box-shadow: 0 0 18px rgba(34,230,197,0.2), inset 0 1px 0 rgba(255,255,255,0.15);
}
.pz-shape-emoji { font-size: 1.15rem; }
.pz-shape-label { font-size: 0.7rem; font-weight: 600; }

.pz-upload {
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
  padding: 0.95rem; border-radius: 12px; border: 1.5px dashed var(--pz-border);
  background: rgba(255,255,255,0.03); color: var(--pz-ink);
  font: inherit; font-weight: 600; font-size: 0.84rem; cursor: pointer; width: 100%;
}
.pz-upload:hover { border-color: var(--pz-neon); background: var(--pz-neon-dim); }
.pz-upload-sub { font-size: 0.68rem; font-weight: 400; color: var(--pz-muted); }
.pz-mini-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; width: 100%; }
.pz-mini-thumb { aspect-ratio: 1; border-radius: 8px; background-size: cover; background-position: center; border: 1px solid var(--pz-border); width: 100%; }
.pz-img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.6rem; width: 100%; }
.pz-img-card {
  display: flex; flex-direction: column; gap: 0.28rem; background: none; border: none; padding: 0;
  cursor: pointer; text-align: left; color: var(--pz-ink); position: relative; font: inherit;
  min-width: 0; width: 100%;
}
.pz-img-cover {
  aspect-ratio: 4/3; border-radius: 12px; background-size: cover; background-position: center;
  border: 1.5px solid transparent; width: 100%; transition: .15s;
}
.pz-img-card.is-on .pz-img-cover { border-color: var(--pz-neon); box-shadow: 0 0 14px rgba(34,230,197,0.2); }
.pz-img-name { font-size: 0.72rem; color: var(--pz-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ═══ PLAY ═══ */
.pz-play {
  display: flex; flex-direction: column; gap: 0.4rem;
  flex: 1; min-height: 0; width: 100%; max-width: 100%; overflow: hidden;
}
.pz-play.is-fs {
  position: fixed; inset: 0; z-index: 150;
  background: var(--gco-bg, #0B1220);
  padding: calc(0.4rem + var(--pz-safe-t)) 0.5rem calc(0.4rem + var(--pz-safe-b));
}
.pz-toolbar {
  display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;
  width: 100%; flex-shrink: 0;
}
.pz-tool {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.38rem 0.6rem; border-radius: 999px;
  border: 1px solid var(--pz-border); background: var(--pz-glass);
  color: var(--pz-muted); font: inherit; font-size: 0.74rem; font-weight: 600;
  cursor: pointer; white-space: nowrap;
}
.pz-tool.is-on { border-color: var(--pz-neon); background: var(--pz-neon-dim); color: var(--pz-neon); }
.pz-tool:disabled { opacity: 0.4; cursor: not-allowed; }
.pz-zoom {
  display: flex; align-items: center; gap: 0.25rem;
  margin-left: auto; font-size: 0.72rem; color: var(--pz-muted); flex-shrink: 0;
}

.pz-prog {
  display: flex; align-items: center; gap: 0.45rem; width: 100%; flex-shrink: 0;
}
.pz-prog-bar {
  flex: 1; height: 5px; border-radius: 6px;
  background: rgba(255,255,255,0.08); overflow: hidden; min-width: 0;
}
.pz-prog-fill {
  height: 100%; border-radius: 6px;
  background: linear-gradient(90deg, var(--pz-neon), var(--pz-accent));
  box-shadow: 0 0 10px rgba(34,230,197,0.4);
  transition: width .25s ease;
}
.pz-prog-count { font-size: 0.74rem; color: var(--pz-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }

.pz-arena-scroll {
  flex: 1; min-height: 0; width: 100%; max-width: 100%;
  overflow: auto; border-radius: 14px;
  background:
    radial-gradient(ellipse at 25% 15%, rgba(34,230,197,0.07), transparent 50%),
    radial-gradient(ellipse at 80% 85%, rgba(139,124,246,0.06), transparent 45%),
    rgba(0,0,0,0.22);
  border: 1px solid var(--pz-border);
  position: relative;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
}
.pz-arena {
  position: relative; transform-origin: top left; touch-action: none; margin: 8px;
}
.pz-board {
  position: absolute; left: 0; top: 0;
  border: 2px dashed rgba(34,230,197,0.3);
  border-radius: 6px; overflow: hidden;
  background: rgba(0,0,0,0.16);
  box-shadow: inset 0 0 36px rgba(34,230,197,0.05);
}
.pz-ghost {
  position: absolute; inset: 0; background-size: cover; background-position: center;
  opacity: 0.3; pointer-events: none;
}
.pz-piece { position: absolute; touch-action: none; will-change: left, top; cursor: grab; }
.pz-piece.is-locked { cursor: default; pointer-events: none; }
.pz-piece.is-dragging {
  z-index: 9999 !important; cursor: grabbing;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.45)) drop-shadow(0 0 10px rgba(34,230,197,0.3));
}
.pz-piece.is-hint { filter: drop-shadow(0 0 10px var(--pz-neon)); }

.pz-pause {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(11,18,32,0.6); backdrop-filter: blur(6px); z-index: 30;
  border-radius: inherit; padding: 1rem;
}
.pz-pause-card {
  padding: 1.35rem 1.2rem; text-align: center; min-width: 200px;
  max-width: 100%; width: min(280px, 100%);
}

/* HUD flotante de progreso (play) */
.pz-hud {
  position: fixed;
  z-index: 120;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  background: linear-gradient(165deg, rgba(255,255,255,0.14), rgba(12,18,32,0.78));
  border: 1px solid rgba(34,230,197,0.35);
  backdrop-filter: blur(20px) saturate(1.5);
  -webkit-backdrop-filter: blur(20px) saturate(1.5);
  font-size: 0.75rem;
  color: var(--pz-ink);
  box-shadow: 0 6px 24px rgba(0,0,0,0.4), 0 0 16px rgba(34,230,197,0.12);
  cursor: grab;
  user-select: none;
  touch-action: none;
  font-variant-numeric: tabular-nums;
}
.pz-hud:active { cursor: grabbing; }
.pz-hud strong { color: var(--pz-neon); }
.pz-hud-grip {
  opacity: 0.45;
  font-size: 0.65rem;
  letter-spacing: -1px;
}

/* Modals */
.pz-overlay {
  position: fixed; inset: 0; background: rgba(5,10,20,0.68);
  backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 0.85rem; overflow: auto;
}
.pz-modal {
  width: min(500px, 100%); max-height: min(85dvh, 85vh); overflow: auto;
  padding: 1.1rem; border-radius: var(--pz-radius); -webkit-overflow-scrolling: touch;
}
.pz-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem; gap: 0.5rem; }
.pz-modal-head h3 { margin: 0; font-size: 1rem; }
.pz-tabs {
  display: flex; gap: 0; border-bottom: 1px solid var(--pz-border);
  margin-bottom: 0.8rem; overflow-x: auto; max-width: 100%;
}
.pz-tabs button {
  padding: 0.48rem 0.1rem; background: none; border: none;
  border-bottom: 2px solid transparent; color: var(--pz-muted);
  font: inherit; font-weight: 600; font-size: 0.82rem; cursor: pointer;
  margin-right: 0.95rem; white-space: nowrap; flex-shrink: 0;
}
.pz-tabs button.is-on { color: var(--pz-neon); border-color: var(--pz-neon); }
.pz-pieces-val {
  font-size: 2.2rem; font-weight: 800; text-align: center; color: var(--pz-neon);
  line-height: 1; text-shadow: 0 0 22px rgba(34,230,197,0.35);
}
.pz-pieces-lbl { text-align: center; font-size: 0.76rem; color: var(--pz-muted); margin-bottom: 0.85rem; }
.pz-stepper { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; width: 100%; }
.pz-stepper input[type=range] { flex: 1; min-width: 0; accent-color: var(--pz-neon); }
.pz-chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem; margin: 0.7rem 0 0.85rem; width: 100%; }
.pz-chip {
  padding: 0.42rem 0.12rem; border-radius: 10px; border: 1px solid var(--pz-border);
  background: var(--pz-glass); color: var(--pz-muted);
  font: inherit; font-size: 0.76rem; font-weight: 700; cursor: pointer;
}
.pz-chip.is-on { border-color: var(--pz-neon); background: var(--pz-neon-dim); color: var(--pz-neon); }
.pz-complete {
  text-align: center;
  padding: 1.25rem 1.15rem 1.4rem;
  max-width: min(420px, 100%);
  width: 100%;
}
.pz-complete-art {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 14px;
  overflow: hidden;
  margin: 0.5rem 0 0.85rem;
  border: 1px solid rgba(34,230,197,0.3);
  box-shadow: 0 0 28px rgba(34,230,197,0.15);
  background-size: cover;
  background-position: center;
  position: relative;
}
.pz-complete-art::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
  border-radius: inherit;
  pointer-events: none;
}

.pz-complete-emoji { font-size: 2.4rem; margin-bottom: 0.25rem; }
.pz-stars { display: flex; justify-content: center; gap: 0.28rem; font-size: 1.55rem; margin: 0.45rem 0; }
.pz-star { opacity: 0.25; filter: grayscale(1); }
.pz-star.is-on { opacity: 1; filter: none; text-shadow: 0 0 12px rgba(255,200,80,0.5); }
.pz-complete-stats {
  display: flex; justify-content: center; flex-wrap: wrap; gap: 0.7rem;
  color: var(--pz-muted); font-size: 0.82rem; margin-bottom: 0.95rem;
}
.pz-complete-actions { display: flex; flex-direction: column; gap: 0.4rem; }

/* ═══ Liquid glass neon bottom nav (iOS-style floating dock) ═══ */
.pz-bottom {
  display: none;
  position: fixed;
  left: 50%;
  bottom: calc(12px + var(--pz-safe-b));
  transform: translateX(-50%);
  z-index: 100;
  width: min(400px, calc(100% - 24px));
  max-width: calc(100vw - 24px);
  padding: 0.45rem 0.4rem;
  gap: 0.12rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(
    180deg,
    rgba(255,255,255,0.16) 0%,
    rgba(20, 30, 50, 0.55) 45%,
    rgba(12, 18, 32, 0.7) 100%
  );
  backdrop-filter: blur(48px) saturate(2);
  -webkit-backdrop-filter: blur(48px) saturate(2);
  box-shadow:
    0 14px 48px rgba(0,0,0,0.55),
    0 0 0 0.5px rgba(255,255,255,0.22) inset,
    0 1.5px 0 rgba(255,255,255,0.28) inset,
    0 -1px 0 rgba(0,0,0,0.2) inset,
    0 0 40px rgba(34,230,197,0.12);
}
.pz-bottom-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0.42rem 0.15rem;
  background: none;
  border: none;
  color: rgba(243,245,250,0.55);
  font: inherit;
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  border-radius: 999px;
  min-width: 0;
  transition: color .2s, background .2s, box-shadow .2s, transform .15s;
}
.pz-bottom-item span:first-child { font-size: 1.2rem; line-height: 1.1; }
.pz-bottom-item span:last-child {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.pz-bottom-item:active { transform: scale(0.94); }
.pz-bottom-item.is-on {
  color: var(--pz-neon);
  background: rgba(34,230,197,0.16);
  box-shadow: 0 0 20px rgba(34,230,197,0.2);
}

.pz-section-title {
  font-size: 0.7rem; font-weight: 700; color: var(--pz-muted);
  text-transform: uppercase; letter-spacing: 0.05em; margin: 0.3rem 0 0.45rem;
}
.pz-upcoming { display: flex; flex-direction: column; gap: 0.4rem; width: 100%; }
.pz-upcoming-row {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.85rem;
  border-radius: 14px; width: 100%; max-width: 100%;
}
.pz-upcoming-lv { font-weight: 700; flex-shrink: 0; }
.pz-upcoming-pc {
  margin-right: auto; font-size: 0.76rem; color: var(--pz-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}

/* iOS-style liquid switch */
.pz-switch {
  position: relative;
  width: 52px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  padding: 0;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.35);
  cursor: pointer;
  transition: background .25s ease;
}
.pz-switch.is-on {
  background: linear-gradient(180deg, #4af0d4, var(--pz-neon));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 0 14px rgba(34,230,197,0.35);
}
.pz-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(180deg, #fff, #e8eef8);
  box-shadow: 0 2px 6px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.08);
  transition: transform .25s cubic-bezier(0.34, 1.4, 0.64, 1);
  pointer-events: none;
}
.pz-switch.is-on .pz-switch-knob {
  transform: translateX(20px);
}
.pz-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0;
}
.pz-row + .pz-row {
  border-top: 1px solid rgba(255,255,255,0.08);
}
.pz-row-label { font-weight: 600; font-size: 0.92rem; }
.pz-row-sub { font-size: 0.74rem; color: var(--pz-muted); margin-top: 2px; }

/* Glass list group (iOS settings style) */
.pz-list-group {
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(165deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03));
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  box-shadow: 0 8px 28px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  padding: 0 1rem;
}

.pz-empty { font-size: 0.82rem; color: var(--pz-muted); line-height: 1.5; padding: 0.4rem 0 0.85rem; }
.pz-inicio-spacer {
  width: 100%;
  height: 0;
  flex-shrink: 0;
  pointer-events: none;
}
@media (max-width: 900px) {
  .pz-inicio-spacer {
    height: calc(var(--pz-nav-h) + var(--pz-safe-b) + 32px);
  }
}

.pz-error { font-size: 0.76rem; color: var(--gco-secondary, #FF6B4A); }

/* ── Responsive: media + container (doble garantía) ── */
@media (max-width: 900px) {
  .pz-sidebar { display: none !important; }
  .pz-bottom { display: flex; }
  /* CRÍTICO: espacio real para que el scroll no muera bajo el dock */
  .pz-main:not(.is-playing) .pz-content {
    padding-bottom: calc(var(--pz-nav-h) + var(--pz-safe-b) + 40px) !important;
  }
  .pz-topbar { padding-left: 0.85rem; padding-right: 0.85rem; }
  .pz-content { padding-left: 0.9rem; padding-right: 0.9rem; }
}
@media (min-width: 901px) {
  .pz-bottom { display: none !important; }
  .pz-sidebar { display: flex; }
}

@container pz-shell (max-width: 900px) {
  .pz-sidebar { display: none !important; }
  .pz-bottom { display: flex; }
  .pz-main:not(.is-playing) .pz-content {
    padding-bottom: calc(var(--pz-nav-h) + var(--pz-safe-b) + 40px) !important;
  }
}
@container pz-shell (min-width: 901px) {
  .pz-bottom { display: none !important; }
  .pz-sidebar { display: flex; }
}
@container pz-main (max-width: 520px) {
  .pz-select-row { grid-template-columns: 1fr; }
  .pz-img-grid { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
  .pz-level-card { width: 92px; }
  .pz-welcome-stats { width: 100%; margin-left: 0; }
  .pz-panel { padding: 0.95rem; }
}
`

/* ═══════════════════════════════════════════════════════════════════════════
   ImageCover / PieceView
   ═══════════════════════════════════════════════════════════════════════════ */

function ImageCover({
  image,
  className,
  style,
}: {
  image: PuzzleImage
  className?: string
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundImage: failed
          ? `linear-gradient(135deg, hsl(${image.fallbackHue} 55% 28%), hsl(${image.fallbackHue2} 50% 22%))`
          : `url(${image.src})`,
        backgroundColor: `hsl(${image.fallbackHue} 40% 20%)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!failed && (
        <img src={image.src} alt="" style={{ display: 'none' }} onError={() => setFailed(true)} />
      )}
    </div>
  )
}

const PieceView = memo(function PieceView({
  piece,
  cellPx,
  pad,
  shape,
  imageSrc,
  fallbackHue,
  boardPxW,
  boardPxH,
  showBorders,
  isHinted,
  dragging,
}: {
  piece: JigsawPiece
  cellPx: number
  pad: number
  shape: PieceShape
  imageSrc: string
  fallbackHue: number
  boardPxW: number
  boardPxH: number
  showBorders: boolean
  isHinted: boolean
  dragging: boolean
}) {
  const w = cellPx + pad * 2
  const h = cellPx + pad * 2
  const path = useMemo(
    () => buildPiecePath(cellPx, cellPx, pad, piece.edges, shape),
    [cellPx, pad, piece.edges, shape]
  )
  const clipId = `clip-${piece.id}`
  return (
    <div
      className={`pz-piece${piece.locked ? ' is-locked' : ''}${dragging ? ' is-dragging' : ''}${isHinted ? ' is-hint' : ''}`}
      data-piece-id={piece.id}
      style={{
        left: piece.x * cellPx - pad,
        top: piece.y * cellPx - pad,
        width: w,
        height: h,
        zIndex: piece.locked ? 1 : piece.z,
      }}
    >
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={pad - piece.col * cellPx}
            y={pad - piece.row * cellPx}
            width={boardPxW}
            height={boardPxH}
            fill={`hsl(${fallbackHue} 40% 22%)`}
          />
          <image
            href={imageSrc}
            x={pad - piece.col * cellPx}
            y={pad - piece.row * cellPx}
            width={boardPxW}
            height={boardPxH}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
        {showBorders && (
          <path
            d={path}
            fill="none"
            stroke={piece.locked ? 'rgba(34,230,197,0.55)' : 'rgba(255,255,255,0.4)'}
            strokeWidth={1.15}
          />
        )}
      </svg>
    </div>
  )
})

/* ═══════════════════════════════════════════════════════════════════════════
   Root
   ═══════════════════════════════════════════════════════════════════════════ */

export function RompecabezasGame({
  onExit,
  userName: _userName = 'Jugador',
}: RompecabezasGameProps) {
  void _userName
  const navigate = useNavigate()

  const [screen, setScreen] = useState<Screen>('normal')
  const [progress, setProgress] = useState<PuzzleProgress>(() => loadPuzzleProgress())
  const [stats, setStats] = useState<PuzzleStats>(() => loadStats())
  const [isTouch, setIsTouch] = useState(false)
  const [settings, setSettings] = useState<PuzzleSettings>(() => loadSettings())
  const [customImages, setCustomImages] = useState<PuzzleImage[]>(() => loadCustomImages())
  const [savedLevels, setSavedLevels] = useState<SavedCreativeLevel[]>(() => loadCreativeLevels())
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [levelNameDraft, setLevelNameDraft] = useState('')

  const [creativeImage, setCreativeImage] = useState<PuzzleImage>(DEFAULT_IMAGES[0])
  const [creativePieces, setCreativePieces] = useState(30)
  const [creativeShape, setCreativeShape] = useState<PieceShape>(
    () => loadSettings().defaultShape
  )
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imagePickerTab, setImagePickerTab] = useState<'defecto' | 'mias'>('defecto')
  const [piecesModalOpen, setPiecesModalOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const [activeLevel, setActiveLevel] = useState<JigsawLevel | null>(null)
  const [pieces, setPieces] = useState<JigsawPiece[]>([])
  const [playOrigin, setPlayOrigin] = useState<PlayOrigin>('normal')
  const [showPreview, setShowPreview] = useState(false)
  const [showBorders, setShowBorders] = useState(true)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintPieceId, setHintPieceId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [completion, setCompletion] = useState<CompletionInfo | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /** pieceId → groupId (piezas sueltas comparten id de grupo al encajar entre sí) */
  const [groupOf, setGroupOf] = useState<Record<string, string>>({})
  const [hudPos, setHudPos] = useState<{ x: number; y: number } | null>(null)
  const hudDragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [arenaSize, setArenaSize] = useState({ w: 360, h: 420 })

  const timerBaseRef = useRef<number | null>(null)
  const timerAccumRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const arenaScrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
    pointerId: number
  } | null>(null)
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces

  useEffect(() => {
    setIsTouch(isTouchDevice())
  }, [])

  const sound = useJigsawSound(settings.sound)
  const imagePool = useMemo(() => [...DEFAULT_IMAGES, ...customImages], [customImages])
  const galleryGrouped = useMemo(() => imagesByCategory(DEFAULT_IMAGES), [])

  // Measure arena
  useEffect(() => {
    const el = arenaScrollRef.current
    if (!el || screen !== 'play') return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setArenaSize({ w: Math.floor(cr.width), h: Math.floor(cr.height) })
    })
    ro.observe(el)
    setArenaSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [screen, fullscreen])

  useEffect(() => {
    if (screen !== 'play' || paused || completion) {
      if (timerBaseRef.current != null) {
        timerAccumRef.current += performance.now() - timerBaseRef.current
        timerBaseRef.current = null
      }
      return
    }
    timerBaseRef.current = performance.now()
    const id = window.setInterval(() => {
      if (timerBaseRef.current == null) return
      setElapsedMs(timerAccumRef.current + (performance.now() - timerBaseRef.current))
    }, 200)
    return () => clearInterval(id)
  }, [screen, paused, completion])

  const resetTimer = () => {
    timerBaseRef.current = performance.now()
    timerAccumRef.current = 0
    setElapsedMs(0)
  }

  const updateSettings = (patch: Partial<PuzzleSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  const goBackToLogica = useCallback(() => {
    if (onExit) {
      onExit()
      return
    }
    navigate('/categoria/logica')
  }, [onExit, navigate])

  const handleBack = () => {
    if (screen === 'play') {
      if (!completion) {
        const timeMs =
          timerAccumRef.current +
          (timerBaseRef.current != null
            ? performance.now() - timerBaseRef.current
            : 0)
        setStats((st) => {
          const updated: PuzzleStats = {
            ...st,
            losses: st.losses + 1,
            totalPlayMs: st.totalPlayMs + timeMs,
          }
          saveStats(updated)
          return updated
        })
      }
      setFullscreen(false)
      setScreen(playOrigin === 'normal' ? 'normal' : 'creativo')
      setActiveLevel(null)
      setPieces([])
      setCompletion(null)
      setGroupOf({})
      return
    }
    if (screen === 'normal') {
      goBackToLogica()
      return
    }
    setScreen('normal')
  }

  const startNormalLevel = useCallback(
    (level: number) => {
      const lv = Math.max(1, level)
      const data = generateJigsawLevel(lv, imagePool)
      const pcs = createPieces(data, data.seed + 17)
      setActiveLevel(data)
      setPieces(pcs)
      setPlayOrigin('normal')
      setHintsUsed(0)
      setHintPieceId(null)
      setShowPreview(false)
      setShowBorders(true)
      setZoom(1)
      setPaused(false)
      setCompletion(null)
      setDraggingId(null)
      setFullscreen(false)
      setGroupOf({})
      resetTimer()
      setScreen('play')
    },
    [imagePool]
  )


  const persistSavedLevels = (list: SavedCreativeLevel[]) => {
    setSavedLevels(list)
    saveCreativeLevels(list)
  }

  const saveCurrentAsLevel = () => {
    const name =
      levelNameDraft.trim() ||
      `${creativeImage.name} · ${creativePieces} pz`
    if (editingLevelId) {
      const list = savedLevels.map((l) =>
        l.id === editingLevelId
          ? {
              ...l,
              name,
              image: creativeImage,
              pieces: creativePieces,
              shape: creativeShape,
              updatedAt: Date.now(),
            }
          : l
      )
      persistSavedLevels(list)
      setEditingLevelId(null)
      setLevelNameDraft('')
      return
    }
    const entry: SavedCreativeLevel = {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      image: creativeImage,
      pieces: creativePieces,
      shape: creativeShape,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    persistSavedLevels([entry, ...savedLevels])
    setLevelNameDraft('')
  }

  const loadSavedLevel = (lv: SavedCreativeLevel) => {
    setCreativeImage(lv.image)
    setCreativePieces(lv.pieces)
    setCreativeShape(lv.shape)
    setLevelNameDraft(lv.name)
    setEditingLevelId(lv.id)
  }

  const deleteSavedLevel = (id: string) => {
    if (!window.confirm('¿Borrar este nivel guardado?')) return
    persistSavedLevels(savedLevels.filter((l) => l.id !== id))
    if (editingLevelId === id) {
      setEditingLevelId(null)
      setLevelNameDraft('')
    }
  }

  const playSavedLevel = (lv: SavedCreativeLevel) => {
    const data = generateCreativeJigsaw({
      image: lv.image,
      pieces: lv.pieces,
      shape: lv.shape,
    })
    const pcs = createPieces(data, data.seed + 31)
    setActiveLevel(data)
    setPieces(pcs)
    setPlayOrigin('creativo')
    setHintsUsed(0)
    setHintPieceId(null)
    setShowPreview(false)
    setShowBorders(true)
    setZoom(1)
    setPaused(false)
    setCompletion(null)
    setDraggingId(null)
    setFullscreen(false)
    setGroupOf({})
    resetTimer()
    setScreen('play')
  }

  const startCreative = useCallback(() => {
    const data = generateCreativeJigsaw({
      image: creativeImage,
      pieces: creativePieces,
      shape: creativeShape,
    })
    const pcs = createPieces(data, data.seed + 31)
    setActiveLevel(data)
    setPieces(pcs)
    setPlayOrigin('creativo')
    setHintsUsed(0)
    setHintPieceId(null)
    setShowPreview(false)
    setShowBorders(true)
    setZoom(1)
    setPaused(false)
    setCompletion(null)
    setDraggingId(null)
    setFullscreen(false)
    resetTimer()
    setScreen('play')
  }, [creativeImage, creativePieces, creativeShape])

  const togglePause = () => setPaused((p) => !p)

  /* Layout metrics — fit to arena */
  const trayCols = activeLevel
    ? Math.max(3, Math.min(activeLevel.cols + 2, Math.ceil(Math.sqrt(activeLevel.pieces * 1.5))))
    : 4
  const trayRows = activeLevel ? Math.ceil(activeLevel.pieces / trayCols) : 2

  const cellPx = useMemo(() => {
    if (!activeLevel) return 40
    return fitCellPx(
      activeLevel.cols,
      activeLevel.rows,
      arenaSize.w,
      arenaSize.h,
      trayRows
    )
  }, [activeLevel, arenaSize, trayRows])

  const padPx = useMemo(() => {
    if (!activeLevel) return 10
    return pieceTabPad(cellPx, cellPx, activeLevel.shape)
  }, [activeLevel, cellPx])

  const boardPxW = activeLevel ? activeLevel.cols * cellPx : 0
  const boardPxH = activeLevel ? activeLevel.rows * cellPx : 0
  const arenaWidthPx = boardPxW + padPx * 2 + 24
  const arenaHeightPx = boardPxH + padPx * 2 + trayRows * cellPx * 1.2 + 56

  /* Drag */
  const handleArenaPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || completion || !activeLevel) return
    const target = (e.target as HTMLElement).closest('[data-piece-id]') as HTMLElement | null
    if (!target) return
    const id = target.dataset.pieceId
    if (!id) return
    const piece = piecesRef.current.find((p) => p.id === id)
    if (!piece || piece.locked) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      originX: piece.x,
      originY: piece.y,
      pointerId: e.pointerId,
    }
    setDraggingId(id)
    setPieces((prev) => {
      const maxZ = Math.max(...prev.map((p) => p.z), 1)
      const gid = groupOf[id]
      return prev.map((p) => {
        if (p.id === id || (gid && groupOf[p.id] === gid)) {
          return { ...p, z: maxZ + 1 }
        }
        return p
      })
    })
  }

  const handleArenaPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = (e.clientX - drag.startX) / (cellPx * zoom)
    const dy = (e.clientY - drag.startY) / (cellPx * zoom)
    const gid = groupOf[drag.id]
    setPieces((prev) => {
      const origin = prev.find((p) => p.id === drag.id)
      if (!origin) return prev
      const ox = drag.originX
      const oy = drag.originY
      const primaryNewX = ox + dx
      const primaryNewY = oy + dy
      const shiftX = primaryNewX - origin.x
      const shiftY = primaryNewY - origin.y
      return prev.map((p) => {
        if (p.locked) return p
        if (p.id === drag.id) return { ...p, x: primaryNewX, y: primaryNewY }
        if (gid && groupOf[p.id] === gid) {
          return { ...p, x: p.x + shiftX, y: p.y + shiftY }
        }
        return p
      })
    })
  }

  const finishDrag = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId || !activeLevel) return
      dragRef.current = null
      setDraggingId(null)

      setPieces((prev) => {
        const piece = prev.find((p) => p.id === drag.id)
        if (!piece || piece.locked) return prev

        // 1) Intentar snap del grupo completo al tablero
        const gids = (() => {
          const gid = groupOf[drag.id]
          if (!gid) return [drag.id]
          const members = prev
            .filter((p) => !p.locked && groupOf[p.id] === gid)
            .map((p) => p.id)
          return members.length ? members : [drag.id]
        })()

        const primary = prev.find((p) => p.id === drag.id)!
        const distBoard = distanceToCorrect(primary)

        if (distBoard <= SNAP_THRESHOLD_CELLS) {
          // Snap todo el grupo a posiciones correctas y bloquear
          const next = prev.map((p) =>
            gids.includes(p.id)
              ? { ...p, x: p.correctX, y: p.correctY, locked: true, z: 0 }
              : p
          )
          sound.playSnap()
          if (settings.haptics && isTouch) vibrate(12)

          setGroupOf((go) => {
            const n = { ...go }
            for (const id of gids) delete n[id]
            return n
          })

          if (isPuzzleComplete(next)) {
            const timeMs =
              timerAccumRef.current +
              (timerBaseRef.current != null
                ? performance.now() - timerBaseRef.current
                : 0)
            const stars = calcJigsawStars(
              timeMs,
              activeLevel.targetSeconds,
              hintsUsed,
              activeLevel.hints
            )
            window.setTimeout(() => {
              sound.playComplete()
              setCompletion({ stars, timeMs })
              setStats((st) => {
                const entry = {
                  id: `${Date.now()}`,
                  at: Date.now(),
                  mode: playOrigin,
                  level: activeLevel.level,
                  pieces: activeLevel.pieces,
                  stars,
                  timeMs,
                }
                const updated: PuzzleStats = {
                  wins: st.wins + 1,
                  losses: st.losses,
                  totalPlayMs: st.totalPlayMs + timeMs,
                  history: [entry, ...st.history].slice(0, 40),
                }
                saveStats(updated)
                return updated
              })
              if (playOrigin === 'normal') {
                setProgress((pr) => {
                  const nextLevel = Math.max(pr.normalLevel, activeLevel.level + 1)
                  const prevStars = pr.starsByLevel[activeLevel.level] ?? 0
                  const best: 0 | 1 | 2 | 3 =
                    stars > prevStars ? stars : (prevStars as 0 | 1 | 2 | 3)
                  const starsByLevel: Record<number, 0 | 1 | 2 | 3> = {
                    ...pr.starsByLevel,
                    [activeLevel.level]: best,
                  }
                  const totalStars = (Object.values(starsByLevel) as number[]).reduce(
                    (sum, n) => sum + n,
                    0
                  )
                  const updated: PuzzleProgress = {
                    ...pr,
                    normalLevel: nextLevel,
                    starsByLevel,
                    totalStars,
                  }
                  savePuzzleProgress(updated)
                  return updated
                })
              }
            }, 320)
          }
          return next
        }

        // 2) Encajar SOLO con vecinos ortogonales (N/S/E/O) del tablero lógico.
        //    No diagonales, no piezas lejanas aunque el offset coincida.
        let nextPieces = prev
        let nextGroups = { ...groupOf }
        const THRESH = SNAP_THRESHOLD_CELLS * 1.08

        /** ¿Comparten un lado en la cuadrícula del puzzle? */
        const isOrthogonalNeighbor = (
          a: { row: number; col: number },
          b: { row: number; col: number }
        ) => {
          const dr = Math.abs(a.row - b.row)
          const dc = Math.abs(a.col - b.col)
          return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
        }

        // Candidatos: cualquier pieza del grupo arrastrado vs cualquier pieza
        // de otro grupo (o suelta), si son vecinos de rejilla.
        type Candidate = {
          fromId: string
          toId: string
          err: number
          shiftX: number
          shiftY: number
        }
        let best: Candidate | null = null

        const draggedSet = new Set(gids)
        const draggedPieces = prev.filter((p) => draggedSet.has(p.id) && !p.locked)
        const others = prev.filter((p) => !p.locked && !draggedSet.has(p.id))

        for (const from of draggedPieces) {
          for (const to of others) {
            if (!isOrthogonalNeighbor(from, to)) continue

            const dx = from.x - to.x
            const dy = from.y - to.y
            const cdx = from.correctX - to.correctX
            const cdy = from.correctY - to.correctY
            const err = Math.hypot(dx - cdx, dy - cdy)
            if (err > THRESH) continue

            const shiftX = to.x + cdx - from.x
            const shiftY = to.y + cdy - from.y
            if (!best || err < best.err) {
              best = { fromId: from.id, toId: to.id, err, shiftX, shiftY }
            }
          }
        }

        if (best) {
          nextPieces = nextPieces.map((p) =>
            draggedSet.has(p.id)
              ? { ...p, x: p.x + best!.shiftX, y: p.y + best!.shiftY }
              : p
          )

          // Fusionar grupos (piezas sueltas reciben id de grupo)
          const toPiece = prev.find((p) => p.id === best!.toId)!
          const otherG = nextGroups[toPiece.id] ?? `g-${toPiece.id}`
          const myG = nextGroups[drag.id] ?? `g-${drag.id}`
          const targetG = otherG

          // piezas del grupo "other"
          const otherMembers = new Set<string>([toPiece.id])
          for (const [id, g] of Object.entries(nextGroups)) {
            if (g === otherG) otherMembers.add(id)
          }
          for (const id of draggedSet) nextGroups[id] = targetG
          for (const id of otherMembers) nextGroups[id] = targetG
          // unificar restos de myG
          for (const [id, g] of Object.entries(nextGroups)) {
            if (g === myG) nextGroups[id] = targetG
          }

          sound.playSnap()
          if (settings.haptics && isTouch) vibrate(8)
        }

        setGroupOf(nextGroups)
        return nextPieces
      })
    },
    [activeLevel, groupOf, hintsUsed, playOrigin, settings.haptics, sound, isTouch]
  )

  const handleArenaPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    finishDrag(e.pointerId)
  }

  const useHint = () => {
    if (!activeLevel || completion) return
    if (hintsUsed >= activeLevel.hints) return
    const unlocked = pieces.filter((p) => !p.locked)
    if (!unlocked.length) return
    const target = unlocked[Math.floor(Math.random() * unlocked.length)]
    setPieces((prev) =>
      prev.map((p) =>
        p.id === target.id
          ? { ...p, x: p.correctX, y: p.correctY, locked: true, z: 0 }
          : p
      )
    )
    setHintsUsed((h) => h + 1)
    setHintPieceId(target.id)
    sound.playSnap()
    window.setTimeout(() => setHintPieceId(null), 1200)
    window.setTimeout(() => {
      setPieces((prev) => {
        if (isPuzzleComplete(prev) && activeLevel) {
          const timeMs =
            timerAccumRef.current +
            (timerBaseRef.current != null
              ? performance.now() - timerBaseRef.current
              : 0)
          const stars = calcJigsawStars(
            timeMs,
            activeLevel.targetSeconds,
            hintsUsed + 1,
            activeLevel.hints
          )
          setCompletion({ stars, timeMs })
          sound.playComplete()
        }
        return prev
      })
    }, 100)
  }

  const onHudPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const x = hudPos?.x ?? rect.left
    const y = hudPos?.y ?? rect.top
    hudDragRef.current = { ox: x, oy: y, sx: e.clientX, sy: e.clientY }
  }

  const onHudPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = hudDragRef.current
    if (!d) return
    const nx = d.ox + (e.clientX - d.sx)
    const ny = d.oy + (e.clientY - d.sy)
    const maxX = window.innerWidth - 120
    const maxY = window.innerHeight - 40
    setHudPos({
      x: Math.max(4, Math.min(maxX, nx)),
      y: Math.max(4, Math.min(maxY, ny)),
    })
  }

  const onHudPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    hudDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
  }

  const fitToScreen = () => {
    setZoom(1)
    const el = arenaScrollRef.current
    if (el) el.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }

  const handleImportFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    setImportError(null)
    try {
      for (const file of Array.from(files)) {
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
          setImportError('Solo JPG, PNG o WEBP.')
          continue
        }
        const dataUrl = await compressImageFile(file)
        const img: PuzzleImage = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Mi imagen',
          category: 'custom',
          src: dataUrl,
          isCustom: true,
          fallbackHue: 200,
          fallbackHue2: 260,
        }
        const list = addCustomImage(img)
        setCustomImages(list)
        setCreativeImage(img)
      }
    } catch {
      setImportError('No se pudo importar la imagen.')
    } finally {
      setImporting(false)
    }
  }

  const handleDeleteCustomImage = (id: string) => {
    const list = removeCustomImage(id)
    setCustomImages(list)
    if (creativeImage.id === id) setCreativeImage(DEFAULT_IMAGES[0])
  }


  const currentNormalLevel = progress.normalLevel
  const tierInfo = pieceTierInfoForLevel(currentNormalLevel)

  const cycleCreativeImage = (dir: -1 | 1) => {
    const pool = DEFAULT_IMAGES
    const idx = pool.findIndex((i) => i.id === creativeImage.id)
    const base = idx >= 0 ? idx : 0
    const next = (base + dir + pool.length) % pool.length
    setCreativeImage(pool[next])
  }

  /* ── Screens ── */

  function renderNormal() {
    const current = currentNormalLevel
    // Niveles 1..current todos jugables; current+1..current+4 como preview bloqueados
    const pastAndCurrent = Array.from({ length: current }, (_, i) => i + 1).reverse()
    const upcoming = Array.from({ length: 4 }, (_, i) => current + 1 + i)
    const img = imageForLevel(current, imagePool)
    const starsFor = (lv: number) => progress.starsByLevel[lv] ?? 0

    return (
      <div style={{ maxWidth: 640, width: '100%', paddingBottom: 8 }}>
        <div className="pz-welcome">
          <div className="pz-welcome-text">
            <strong>Modo Normal</strong>
            <span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}> · progresión</span>
          </div>
          <div className="pz-welcome-stats">
            <span className="pz-pill">🏆 {stats.wins}</span>
            <span className="pz-pill">⭐ {progress.totalStars}</span>
            <span className="pz-pill">Nv {current}</span>
          </div>
        </div>

        <div className="pz-card pz-panel" style={{ marginBottom: '0.9rem' }}>
          <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden' }}>
            <ImageCover image={img} style={{ position: 'absolute', inset: 0 }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.78))',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              padding: '0.9rem 1rem', color: '#fff',
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', opacity: 0.85, letterSpacing: '0.06em', fontWeight: 600 }}>NIVEL ACTUAL</div>
                <div style={{ fontWeight: 800, fontSize: '1.45rem', letterSpacing: '-0.02em' }}>Nivel {current}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: 2 }}>
                  {piecesForLevel(current)} piezas · {'⭐'.repeat(starsFor(current)) || 'Sin estrellas aún'}
                </div>
              </div>
              <button
                type="button"
                className="pz-btn pz-btn-primary"
                style={{ padding: '0.65rem 1.1rem', flexShrink: 0 }}
                onClick={() => startNormalLevel(current)}
              >
                Continuar ▶
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--pz-muted)', textAlign: 'center', margin: 0 }}>
            Escalón {tierInfo.tierIndex + 1} · {tierInfo.pieces} piezas
            {!tierInfo.isMaxTier && ` · ${tierInfo.levelsUntilNextTier ?? 0} para el siguiente`}
          </p>
        </div>

        <div className="pz-section-title">Tu progreso — puedes rejugar cualquier nivel</div>
        <div className="pz-level-row" style={{ marginBottom: 12 }}>
          {pastAndCurrent.slice(0, 12).map((lv) => {
            const piecesN = piecesForLevel(lv)
            const cover = imageForLevel(lv, imagePool)
            const st = starsFor(lv)
            const isCur = lv === current
            return (
              <button
                key={lv}
                type="button"
                className={`pz-level-card${isCur ? ' is-current' : ''}`}
                onClick={() => startNormalLevel(lv)}
                title={`Jugar nivel ${lv}`}
              >
                <ImageCover image={cover} className="pz-level-cover" />
                <div className="pz-level-body">
                  <div className="pz-level-label">Nivel {lv}</div>
                  <div className="pz-level-pieces">
                    {piecesN} pz{st > 0 ? ` · ${'★'.repeat(st)}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="pz-section-title">Próximos (bloqueados)</div>
        <div className="pz-upcoming" style={{ marginBottom: 8 }}>
          {upcoming.map((lv) => (
            <div key={lv} className="pz-card pz-upcoming-row" style={{ opacity: 0.5 }}>
              <span className="pz-upcoming-lv">Nivel {lv}</span>
              <span className="pz-upcoming-pc">{piecesForLevel(lv)} piezas</span>
              <span>🔒</span>
            </div>
          ))}
        </div>

        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderCreativo() {
    return (
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div className="pz-card pz-panel" style={{ marginBottom: '0.9rem' }}>
          <h3 className="pz-panel-head"><span>✨</span> {editingLevelId ? 'Editar nivel' : 'Nuevo nivel'}</h3>
          <p className="pz-panel-desc">
            Configura imagen, piezas y forma. Guárdalo para rejugario o editarlo después.
          </p>
          <div className="pz-preview">
            <button type="button" className="pz-preview-nav prev" onClick={() => cycleCreativeImage(-1)}>‹</button>
            <ImageCover image={creativeImage} style={{ position: 'absolute', inset: 0 }} />
            <button type="button" className="pz-preview-nav next" onClick={() => cycleCreativeImage(1)}>›</button>
          </div>
          <button type="button" className="pz-select" onClick={() => setImagePickerOpen(true)}>
            <span><span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}>Imagen </span>{creativeImage.name}</span>
            <span>▾</span>
          </button>
          <button type="button" className="pz-select" onClick={() => setPiecesModalOpen(true)}>
            <span><span style={{ color: 'var(--pz-muted)', fontWeight: 500 }}>Piezas </span>{creativePieces}</span>
            <span>▾</span>
          </button>
          <div className="pz-section-title">Forma</div>
          <div className="pz-shape-grid">
            {PIECE_SHAPES.map((s) => (
              <button key={s.id} type="button" className={`pz-shape-card${creativeShape === s.id ? ' is-on' : ''}`} onClick={() => setCreativeShape(s.id)}>
                <span className="pz-shape-emoji">{s.emoji}</span>
                <span className="pz-shape-label">{s.label}</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            value={levelNameDraft}
            onChange={(e) => setLevelNameDraft(e.target.value)}
            placeholder="Nombre del nivel (opcional)"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 12,
              border: '1px solid var(--pz-border)',
              background: 'var(--gco-input-bg, rgba(0,0,0,0.28))',
              color: 'var(--pz-ink)',
              font: 'inherit',
              fontSize: '0.88rem',
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="pz-btn pz-btn-primary" style={{ flex: 1 }} onClick={startCreative}>
              ▶ Jugar ahora
            </button>
            <button type="button" className="pz-btn pz-btn-accent" style={{ flex: 1 }} onClick={saveCurrentAsLevel}>
              {editingLevelId ? '💾 Actualizar' : '💾 Guardar'}
            </button>
          </div>
          {editingLevelId && (
            <button
              type="button"
              className="pz-btn pz-btn-ghost pz-btn-block"
              onClick={() => {
                setEditingLevelId(null)
                setLevelNameDraft('')
              }}
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="pz-section-title">
          Mis niveles ({savedLevels.length})
        </div>
        {savedLevels.length === 0 ? (
          <p className="pz-empty">
            Aún no tienes niveles guardados. Configura uno arriba y pulsa Guardar.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {savedLevels.map((lv) => (
              <div
                key={lv.id}
                className="pz-card"
                style={{
                  padding: '0.75rem',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <ImageCover
                  image={lv.image}
                  style={{
                    width: 64,
                    height: 48,
                    borderRadius: 10,
                    flexShrink: 0,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lv.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--pz-muted)' }}>
                    {lv.pieces} piezas · {PIECE_SHAPES.find((s) => s.id === lv.shape)?.label ?? lv.shape}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" className="pz-btn pz-btn-primary" style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem' }} onClick={() => playSavedLevel(lv)}>
                    ▶
                  </button>
                  <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem' }} onClick={() => loadSavedLevel(lv)}>
                    ✎
                  </button>
                  <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem' }} onClick={() => deleteSavedLevel(lv.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderGaleria() {
    return (
      <div>
        {CATEGORY_ORDER.map((cat) => {
          const imgs = galleryGrouped[cat] ?? []
          if (!imgs.length) return null
          return (
            <div key={cat} style={{ marginBottom: '1.1rem' }}>
              <div className="pz-section-title">{CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}</div>
              <div className="pz-img-grid">
                {imgs.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`}
                    onClick={() => { setCreativeImage(img); setScreen('creativo') }}
                  >
                    <ImageCover image={img} className="pz-img-cover" />
                    <span className="pz-img-name">{img.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderMisImagenes() {
    return (
      <div>
        <button type="button" className="pz-upload" style={{ marginBottom: '0.9rem' }} onClick={() => fileInputRef.current?.click()} disabled={importing}>
          <span style={{ fontSize: '1.3rem' }}>⬆️</span>
          {importing ? 'Importando…' : 'Importar imagen'}
          <span className="pz-upload-sub">JPG, PNG, WEBP</span>
        </button>
        {importError && <p className="pz-error">{importError}</p>}
        {customImages.length === 0 ? (
          <p className="pz-empty">Todavía no importaste imágenes.</p>
        ) : (
          <div className="pz-img-grid">
            {customImages.map((img) => (
              <div key={img.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`}
                  style={{ width: '100%' }}
                  onClick={() => { setCreativeImage(img); setScreen('creativo') }}
                >
                  <ImageCover image={img} className="pz-img-cover" />
                  <span className="pz-img-name">{img.name}</span>
                </button>
                <button
                  type="button"
                  className="pz-icon-btn"
                  style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, minWidth: 28, background: 'rgba(11,18,32,0.7)', fontSize: '0.75rem' }}
                  onClick={() => handleDeleteCustomImage(img.id)}
                  aria-label="Eliminar"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderAjustes() {
    const recent = stats.history.slice(0, 15)
    const winRate =
      stats.wins + stats.losses > 0
        ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
        : 0

    return (
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div className="pz-section-title">Resumen</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.55rem',
            marginBottom: '1.1rem',
          }}
        >
          {[
            { label: 'Victorias', value: String(stats.wins), icon: '🏆' },
            { label: 'Derrotas', value: String(stats.losses), icon: '📉' },
            {
              label: 'Tiempo total',
              value: formatDurationLong(stats.totalPlayMs),
              icon: '⏱',
            },
            {
              label: 'Ratio victorias',
              value: `${winRate}%`,
              icon: '📊',
            },
            {
              label: 'Nivel máximo',
              value: String(Math.max(1, progress.normalLevel)),
              icon: '📈',
            },
            {
              label: 'Estrellas',
              value: String(progress.totalStars),
              icon: '⭐',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="pz-card"
              style={{ padding: '0.85rem 0.95rem' }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--pz-muted)', marginBottom: 6 }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="pz-section-title">Historial reciente</div>
        <div className="pz-card" style={{ padding: '0.35rem 0', marginBottom: '1.1rem' }}>
          {recent.length === 0 ? (
            <p className="pz-empty" style={{ padding: '0.85rem 1rem' }}>
              Completa un nivel para ver el historial aquí.
            </p>
          ) : (
            recent.map((h, i) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0.7rem 1rem',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 70 }}>
                  {h.mode === 'normal' ? `Nv ${h.level}` : 'Creativo'}
                </span>
                <span style={{ color: 'var(--pz-muted)', flex: 1 }}>
                  {h.pieces} pz · {formatTime(h.timeMs)}
                </span>
                <span aria-label={`${h.stars} estrellas`}>
                  {h.stars > 0 ? '⭐'.repeat(h.stars) : '—'}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="pz-section-title">Preferencias</div>
        <div className="pz-list-group" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-row">
            <div>
              <div className="pz-row-label">Sonido al encajar</div>
              <div className="pz-row-sub">Feedback al unir piezas y al completar</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.sound}
              className={`pz-switch${settings.sound ? ' is-on' : ''}`}
              onClick={() => updateSettings({ sound: !settings.sound })}
            >
              <span className="pz-switch-knob" />
            </button>
          </div>
          {isTouch && (
            <div className="pz-row">
              <div>
                <div className="pz-row-label">Vibración</div>
                <div className="pz-row-sub">Háptica al encajar (solo móvil)</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.haptics}
                className={`pz-switch${settings.haptics ? ' is-on' : ''}`}
                onClick={() => updateSettings({ haptics: !settings.haptics })}
              >
                <span className="pz-switch-knob" />
              </button>
            </div>
          )}
        </div>

        <div className="pz-section-title">Forma de pieza por defecto</div>
        <div className="pz-card pz-panel" style={{ marginBottom: '1.1rem' }}>
          <div className="pz-shape-grid">
            {PIECE_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pz-shape-card${settings.defaultShape === s.id ? ' is-on' : ''}`}
                onClick={() => {
                  updateSettings({ defaultShape: s.id })
                  setCreativeShape(s.id)
                }}
              >
                <span className="pz-shape-emoji">{s.emoji}</span>
                <span className="pz-shape-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="pz-btn pz-btn-ghost pz-btn-block"
          onClick={goBackToLogica}
          style={{ marginBottom: 8 }}
        >
          ← Volver a Lógica
        </button>
        <div className="pz-inicio-spacer" aria-hidden />
      </div>
    )
  }

  function renderPlay() {
    if (!activeLevel) return null
    const locked = countLocked(pieces)
    const pct = pieces.length ? Math.round((locked / pieces.length) * 100) : 0

    return (
      <div className={`pz-play${fullscreen ? ' is-fs' : ''}`}>
        <div className="pz-toolbar">
          <button type="button" className={`pz-tool${showPreview ? ' is-on' : ''}`} onClick={() => setShowPreview((v) => !v)}>
            👁️ Preview
          </button>
          <button type="button" className={`pz-tool${showBorders ? ' is-on' : ''}`} onClick={() => setShowBorders((v) => !v)}>
            🔲 Bordes
          </button>
          <button
            type="button"
            className="pz-tool"
            onClick={useHint}
            disabled={hintsUsed >= activeLevel.hints || !!completion}
          >
            💡 {Math.max(0, activeLevel.hints - hintsUsed)}
          </button>
          <button type="button" className="pz-tool" onClick={fitToScreen} title="Ajustar a pantalla">
            ⊡ Fit
          </button>
          <button
            type="button"
            className={`pz-tool${fullscreen ? ' is-on' : ''}`}
            onClick={() => setFullscreen((f) => !f)}
            title="Pantalla completa"
          >
            {fullscreen ? '⛶' : '⛶'} FS
          </button>
          <div className="pz-zoom">
            <button
              type="button"
              className="pz-icon-btn"
              style={{ width: 28, height: 28, minWidth: 28 }}
              onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.15).toFixed(2)))}
              aria-label="Alejar"
            >
              −
            </button>
            <span style={{ minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="pz-icon-btn"
              style={{ width: 28, height: 28, minWidth: 28 }}
              onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
              aria-label="Acercar"
            >
              +
            </button>
          </div>
        </div>

        <div className="pz-prog">
          <div className="pz-prog-bar">
            <div className="pz-prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="pz-prog-count">{locked}/{pieces.length}</span>
        </div>

        {/* Burbuja de tiempo fuera del arena, arrastrable */}
        <div
          className="pz-hud"
          style={
            hudPos
              ? { left: hudPos.x, top: hudPos.y }
              : { left: '50%', top: 'max(12px, calc(env(safe-area-inset-top, 0px) + 52px))', transform: 'translateX(-50%)' }
          }
          onPointerDown={onHudPointerDown}
          onPointerMove={onHudPointerMove}
          onPointerUp={onHudPointerUp}
          onPointerCancel={onHudPointerUp}
          title="Arrastra para mover"
        >
          <span className="pz-hud-grip">⠿</span>
          <span>{formatTime(elapsedMs)}</span>
          <strong>{pct}%</strong>
          <span>{locked}/{pieces.length}</span>
        </div>

        <div className="pz-arena-scroll" ref={arenaScrollRef}>
          <div style={{ width: arenaWidthPx * zoom, height: arenaHeightPx * zoom, position: 'relative' }}>
            <div
              className="pz-arena"
              style={{ width: arenaWidthPx, height: arenaHeightPx, transform: `scale(${zoom})` }}
              onPointerDown={handleArenaPointerDown}
              onPointerMove={handleArenaPointerMove}
              onPointerUp={handleArenaPointerUp}
              onPointerCancel={handleArenaPointerUp}
            >
              <div className="pz-board" style={{ width: boardPxW, height: boardPxH }}>
                {showPreview && (
                  <div
                    className="pz-ghost"
                    style={{
                      backgroundImage: `url(${activeLevel.image.src})`,
                      backgroundColor: `hsl(${activeLevel.image.fallbackHue} 40% 20%)`,
                    }}
                  />
                )}
              </div>
              {pieces.map((p) => (
                <PieceView
                  key={p.id}
                  piece={p}
                  cellPx={cellPx}
                  pad={padPx}
                  shape={activeLevel.shape}
                  imageSrc={activeLevel.image.src}
                  fallbackHue={activeLevel.image.fallbackHue}
                  boardPxW={boardPxW}
                  boardPxH={boardPxH}
                  showBorders={showBorders}
                  isHinted={p.id === hintPieceId}
                  dragging={p.id === draggingId}
                />
              ))}
            </div>
          </div>

          {paused && (
            <div className="pz-pause">
              <div className="pz-card pz-pause-card">
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.9rem' }}>⏸️ Pausado</div>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={togglePause}>
                  Continuar
                </button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" style={{ marginTop: 8 }} onClick={handleBack}>
                  Salir del nivel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderImagePickerModal() {
    return (
      <div className="pz-overlay" onClick={() => setImagePickerOpen(false)}>
        <div className="pz-card pz-modal" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
          <div className="pz-modal-head">
            <h3>Seleccionar imagen</h3>
            <button type="button" className="pz-icon-btn" onClick={() => setImagePickerOpen(false)}>✕</button>
          </div>
          <div className="pz-tabs">
            <button type="button" className={imagePickerTab === 'defecto' ? 'is-on' : ''} onClick={() => setImagePickerTab('defecto')}>Por defecto</button>
            <button type="button" className={imagePickerTab === 'mias' ? 'is-on' : ''} onClick={() => setImagePickerTab('mias')}>Mis imágenes ({customImages.length})</button>
          </div>
          {imagePickerTab === 'defecto'
            ? CATEGORY_ORDER.map((cat) => {
                const imgs = galleryGrouped[cat] ?? []
                if (!imgs.length) return null
                return (
                  <div key={cat}>
                    <div className="pz-section-title">{CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}</div>
                    <div className="pz-img-grid">
                      {imgs.map((img) => (
                        <button key={img.id} type="button" className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`} onClick={() => { setCreativeImage(img); setImagePickerOpen(false) }}>
                          <ImageCover image={img} className="pz-img-cover" />
                          <span className="pz-img-name">{img.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            : customImages.length === 0
              ? <p className="pz-empty">Todavía no importaste imágenes.</p>
              : (
                <div className="pz-img-grid">
                  {customImages.map((img) => (
                    <button key={img.id} type="button" className={`pz-img-card${creativeImage.id === img.id ? ' is-on' : ''}`} onClick={() => { setCreativeImage(img); setImagePickerOpen(false) }}>
                      <ImageCover image={img} className="pz-img-cover" />
                      <span className="pz-img-name">{img.name}</span>
                    </button>
                  ))}
                </div>
              )}
        </div>
      </div>
    )
  }

  function renderPiecesModal() {
    return (
      <div className="pz-overlay" onClick={() => setPiecesModalOpen(false)}>
        <div className="pz-card pz-modal" style={{ maxWidth: 400 }} onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
          <div className="pz-modal-head">
            <h3>Seleccionar piezas</h3>
            <button type="button" className="pz-icon-btn" onClick={() => setPiecesModalOpen(false)}>✕</button>
          </div>
          <div className="pz-pieces-val">{creativePieces}</div>
          <div className="pz-pieces-lbl">piezas</div>
          <div className="pz-stepper">
            <button type="button" className="pz-icon-btn" onClick={() => setCreativePieces((p) => clampPieceCount(p - stepFor(p)))}>−</button>
            <input type="range" min={PIECES_MIN} max={PIECES_MAX} value={creativePieces} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreativePieces(clampPieceCount(Number(e.target.value)))} />
            <button type="button" className="pz-icon-btn" onClick={() => setCreativePieces((p) => clampPieceCount(p + stepFor(p)))}>+</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--pz-muted)', marginBottom: 8 }}>
            <span>{PIECES_MIN}</span><span>{PIECES_MAX}</span>
          </div>
          <div className="pz-section-title">Sugerencias</div>
          <div className="pz-chips">
            {PIECE_SUGGESTIONS.map((n) => (
              <button key={n} type="button" className={`pz-chip${creativePieces === n ? ' is-on' : ''}`} onClick={() => setCreativePieces(n)}>{n}</button>
            ))}
          </div>
          <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={() => setPiecesModalOpen(false)}>Continuar</button>
        </div>
      </div>
    )
  }

  function renderCompletionModal() {
    if (!completion || !activeLevel) return null
    const art = activeLevel.image
    return (
      <div className="pz-overlay">
        <div className="pz-card pz-complete">
          <div className="pz-complete-emoji">🎉</div>
          <h3 style={{ margin: '0 0 0.15rem' }}>¡Completado!</h3>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', color: 'var(--pz-muted)' }}>
            Tu rompecabezas terminado
          </p>
          <div
            className="pz-complete-art"
            style={{
              backgroundImage: `url(${art.src})`,
              backgroundColor: `hsl(${art.fallbackHue} 40% 22%)`,
            }}
            role="img"
            aria-label={art.name}
          />
          <div style={{ fontSize: '0.78rem', color: 'var(--pz-muted)', marginBottom: 6 }}>
            {art.name}
          </div>
          <div className="pz-stars">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`pz-star${n <= completion.stars ? ' is-on' : ''}`}>⭐</span>
            ))}
          </div>
          <div className="pz-complete-stats">
            <span>{formatTime(completion.timeMs)}</span>
            <span>{activeLevel.pieces} piezas</span>
            <span>{hintsUsed} pistas</span>
          </div>
          <div className="pz-complete-actions">
            {playOrigin === 'normal' ? (
              <>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={() => startNormalLevel(activeLevel.level + 1)}>
                  Siguiente nivel ▶
                </button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => { setFullscreen(false); setScreen('normal') }}>
                  Inicio
                </button>
              </>
            ) : (
              <>
                <button type="button" className="pz-btn pz-btn-primary pz-btn-block" onClick={startCreative}>Otro igual</button>
                <button type="button" className="pz-btn pz-btn-ghost pz-btn-block" onClick={() => { setFullscreen(false); setScreen('creativo') }}>Ajustar</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const topbarTitle = (() => {
    switch (screen) {
      case 'normal':
        return (<><span>🧩</span> Modo Normal <span className="pz-topbar-sub">Puzzle</span></>)
      case 'creativo': return 'Modo Creativo'
      case 'galeria': return 'Galería'
      case 'mis-imagenes': return 'Mis Imágenes'
      case 'ajustes': return 'Ajustes'
      case 'play':
        if (!activeLevel) return ''
        return (
          <>
            {activeLevel.level > 0 ? `Nivel ${activeLevel.level}` : 'Creativo'}
            <span className="pz-topbar-sub">{activeLevel.pieces} piezas</span>
          </>
        )
      default: return ''
    }
  })()

  return (
    <div className="pz-root">
      <style>{SCOPED_STYLES}</style>

      {screen !== 'play' && (
        <aside className="pz-sidebar">
          <div className="pz-brand">
            <div className="pz-brand-mark">🧩</div>
            <div>Puzzle<span className="pz-brand-sub">Rompecabezas</span></div>
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pz-nav-btn${screen === item.id ? ' is-active' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span className="pz-nav-emoji">{item.emoji}</span>
              <span className="pz-nav-text">
                <span>{item.label}</span>
                {item.sub && <span className="pz-nav-sub">{item.sub}</span>}
              </span>
            </button>
          ))}
          <div className="pz-side-profile">
            <span className="pz-side-profile-name">📊 Estadísticas</span>
            <span className="pz-side-profile-meta">
              🏆 {stats.wins} · 📉 {stats.losses} · ⭐ {progress.totalStars}
            </span>
            <span className="pz-side-profile-meta">Nv {progress.normalLevel} · ⏱ {formatDurationLong(stats.totalPlayMs)}</span>
          </div>
        </aside>
      )}

      <div className={`pz-main${screen === 'play' ? ' is-playing' : ''}`}>
        {!fullscreen && (
          <header className="pz-topbar">
            <button type="button" className="pz-icon-btn" onClick={handleBack} aria-label="Volver">‹</button>
            <div className="pz-topbar-title">{topbarTitle}</div>
            {screen === 'play' && activeLevel && (
              <div className="pz-topbar-right">
                <span className="pz-pill">{formatTime(elapsedMs)}</span>
                <button type="button" className="pz-icon-btn" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>
                  {paused ? '▶' : '⏸'}
                </button>
              </div>
            )}
            {screen === 'normal' && (
              <div className="pz-topbar-right">
                <button type="button" className="pz-btn pz-btn-ghost" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={goBackToLogica}>
                  ← Lógica
                </button>
              </div>
            )}
          </header>
        )}

        <main className="pz-content">
          {screen === 'play' ? (
            renderPlay()
          ) : (
            <div className="pz-scroll-inner">
              {screen === 'normal' && renderNormal()}
              {screen === 'creativo' && renderCreativo()}
              {screen === 'galeria' && renderGaleria()}
              {screen === 'mis-imagenes' && renderMisImagenes()}
              {screen === 'ajustes' && renderAjustes()}
            </div>
          )}
        </main>
      </div>

      {screen !== 'play' && (
        <nav className="pz-bottom" aria-label="Navegación">
          {MOBILE_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pz-bottom-item${screen === item.id ? ' is-on' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      {imagePickerOpen && renderImagePickerModal()}
      {piecesModalOpen && renderPiecesModal()}
      {completion && renderCompletionModal()}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          void handleImportFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export default RompecabezasGame