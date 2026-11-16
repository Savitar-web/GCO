import type { Color } from './chessEngine'

export type GameMode = 'ai' | 'local2p' | 'online'
export type BoardView = '2d' | '3d'
export type ClockPreset = 'none' | '1' | '3' | '5' | '10' | '15' | '30'
export type BoardSkin = 'cyan' | 'wood' | 'gold' | 'stone' | 'dark' | 'light' | 'forest' | 'ocean' | 'rose' | 'walnut' | 'ivory' | 'violet'

export interface ChessSetup {
  tournamentMatch?: number
  mode: GameMode
  humanColor: Color
  engine?: 'full' | 'lite'
  aiLevel: number
  view: BoardView
  skin: BoardSkin
  clock: ClockPreset
  showLegalHints: boolean
  soundEnabled: boolean
  /** Gira el tablero según el turno (partidas locales a 2 jugadores, celular compartido) */
  autoFlip: boolean
}

export const DEFAULT_SETUP: ChessSetup = {
  mode: 'ai',
  humanColor: 'w',
  aiLevel: 30,
  engine: 'full',
  view: '3d',
  skin: 'wood',
  clock: 'none',
  showLegalHints: true,
  soundEnabled: true,
  autoFlip: true,
}

export const BOARD_SKINS: { id: BoardSkin; label: string; light: string; dark: string; accent: string }[] = [
  {id:'forest',label:'Bosque',light:'#e1ead0',dark:'#37694d',accent:'#a6c790'},
  {id:'ocean',label:'Océano',light:'#d4e8f5',dark:'#245b7a',accent:'#69c9ed'},
  {id:'rose',label:'Rosa',light:'#f6dce0',dark:'#8a4258',accent:'#ee9eb2'},
  {id:'walnut',label:'Nogal',light:'#dab98a',dark:'#472c20',accent:'#b78855'},
  {id:'ivory',label:'Marfil',light:'#fff6dc',dark:'#7d7360',accent:'#d4bd84'},
  {id:'violet',label:'Amatista',light:'#e6dff7',dark:'#554077',accent:'#baa1ed'},
  { id: 'cyan', label: 'Cian', light: '#bfe9e4', dark: '#280a10', accent: '#37e6ff' },
  { id: 'wood', label: 'Madera', light: '#e8d5b0', dark: '#5c3a1e', accent: '#c9a26b' },
  { id: 'gold', label: 'Oro', light: '#f0e0a8', dark: '#3a2a08', accent: '#ffd060' },
  { id: 'stone', label: 'Piedra', light: '#c8cdd4', dark: '#2a3038', accent: '#90a0b0' },
  { id: 'dark', label: 'Oscuro', light: '#3a4555', dark: '#12161c', accent: '#4a90b0' },
  { id: 'light', label: 'Claro', light: '#f0f4f8', dark: '#6a7a8a', accent: '#60b0d0' },
]

export const CLOCK_PRESET_SECONDS: Record<ClockPreset, number | null> = {
  none: null,
  '1': 60,
  '3': 180,
  '5': 300,
  '10': 600,
  '15': 900,
  '30': 1800,
}
