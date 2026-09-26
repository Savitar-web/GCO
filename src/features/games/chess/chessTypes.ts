import type { Color } from './chessEngine'

export type GameMode = 'ai' | 'local2p'
export type BoardView = '2d' | '3d'
export type ClockPreset = 'none' | '3' | '5' | '10' | '15' | '30'
export type BoardSkin = 'cyan' | 'wood' | 'gold' | 'stone' | 'dark' | 'light'

export interface ChessSetup {
  mode: GameMode
  humanColor: Color // color que juega la persona cuando mode === 'ai'
  aiLevel: number // 1-10
  view: BoardView
  skin: BoardSkin
  clock: ClockPreset
  showLegalHints: boolean
  soundEnabled: boolean
  autoFlip: boolean // gira el tablero según el turno (partidas locales a 2 jugadores)
}

export const DEFAULT_SETUP: ChessSetup = {
  mode: 'ai',
  humanColor: 'w',
  aiLevel: 5,
  view: '3d',
  skin: 'cyan',
  clock: 'none',
  showLegalHints: true,
  soundEnabled: true,
  autoFlip: true,
}

export const BOARD_SKINS: { id: BoardSkin; label: string; light: string; dark: string; accent: string }[] = [
  { id: 'cyan', label: 'Cian', light: '#bfe9e4', dark: '#280a10', accent: '#37e6ff' },
  { id: 'wood', label: 'Madera', light: '#e8d5b0', dark: '#5c3a1e', accent: '#c9a26b' },
  { id: 'gold', label: 'Oro', light: '#f0e0a8', dark: '#3a2a08', accent: '#ffd060' },
  { id: 'stone', label: 'Piedra', light: '#c8cdd4', dark: '#2a3038', accent: '#90a0b0' },
  { id: 'dark', label: 'Oscuro', light: '#3a4555', dark: '#12161c', accent: '#4a90b0' },
  { id: 'light', label: 'Claro', light: '#f0f4f8', dark: '#6a7a8a', accent: '#60b0d0' },
]

export const CLOCK_PRESET_SECONDS: Record<ClockPreset, number | null> = {
  none: null,
  '3': 180,
  '5': 300,
  '10': 600,
  '15': 900,
  '30': 1800,
}
