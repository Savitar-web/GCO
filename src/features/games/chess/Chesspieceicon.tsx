import { useId } from 'react'
import type { PieceType } from './chessEngine'

interface Props {
  type: PieceType
  color: 'w' | 'b'
  accent: string
  bodyColor?:string
}

function Pedestal({ fill, rimId }: { fill: string; rimId: string }) {
  return (
    <g>
      <path d="M12 134 L88 134 L88 124 L16 124 Z" fill={fill} />
      <path d="M18 124 L82 124 L76 110 L24 110 Z" fill={fill} />
      <path d="M28 110 L72 110 L64 72 L36 72 Z" fill={fill} />
      <ellipse cx="50" cy="72" rx="22" ry="4.5" fill={fill} opacity={0.95} />
      <path d="M40 72 L60 72 L56 58 L44 58 Z" fill={fill} />
      <ellipse cx="50" cy="58" rx="14" ry="3" fill={fill} opacity={0.95} />
      <rect x="10" y="131" width="80" height="4" rx="2" fill={`url(#${rimId})`} opacity={0.9} />
    </g>
  )
}

function pts(list: [number, number][]) {
  return list.map((p) => p.join(',')).join(' ')
}

/**
 * SVG originales (no emojis).
 * Blancas = mármol hielo / cian. Negras = granate casi negro.
 */
export function ChessPieceIcon({ type, color, accent,bodyColor }: Props) {
  const uid = useId().replace(/[:]/g, '')
  const isWhite = color === 'w'
  const gradId = `${uid}-body`
  const rimId = `${uid}-rim`

  const bodyStops = bodyColor ? [['0%','#ffffff'],['20%',bodyColor],['65%',bodyColor],['100%','#101522']] : isWhite
    ? [
        ['0%', '#ffffff'],
        ['22%', '#e8f9fd'],
        ['48%', '#b8e8f2'],
        ['75%', '#6eb8cc'],
        ['100%', '#3a7a90'],
      ]
    : [
        ['0%', '#8a3040'],
        ['25%', '#4a1018'],
        ['52%', '#1c060a'],
        ['78%', '#0a0204'],
        ['100%', '#020001'],
      ]

  const strokeColor = isWhite ? 'rgba(10, 35, 48, 0.55)' : 'rgba(255, 190, 200, 0.35)'
  const fill = `url(#${gradId})`
  const highlight = isWhite ? 'rgba(255,255,255,0.45)' : 'rgba(200,70,90,0.28)'

  return (
    <svg viewBox="0 0 100 140" className="gco-chess-piece-svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0.12" y1="0" x2="0.92" y2="1">
          {bodyStops.map(([off, col]) => (
            <stop key={off} offset={off} stopColor={col} />
          ))}
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.1} />
          <stop offset="50%" stopColor={accent} stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.1} />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-40%" y="-20%" width="180%" height="150%">
          <feDropShadow
            dx="0"
            dy="3.5"
            stdDeviation="3"
            floodColor="#000"
            floodOpacity={isWhite ? 0.4 : 0.75}
          />
        </filter>
      </defs>

      <g filter={`url(#${uid}-shadow)`} stroke={strokeColor} strokeWidth={isWhite ? 1.25 : 1.05} strokeLinejoin="round">
        <Pedestal fill={fill} rimId={rimId} />
        <PieceHead type={type} fill={fill} accent={accent} highlight={highlight} isWhite={isWhite} />
      </g>
    </svg>
  )
}

function PieceHead({
  type,
  fill,
  accent,
  highlight,
  isWhite,
}: {
  type: PieceType
  fill: string
  accent: string
  highlight: string
  isWhite: boolean
}) {
  switch (type) {
    case 'p':
      return (
        <g>
          <ellipse cx="50" cy="55" rx="16" ry="3.6" fill={fill} />
          <circle cx="50" cy="36" r="17.5" fill={fill} />
          <ellipse cx="45" cy="30" rx="7" ry="5" fill={highlight} />
          <ellipse cx="50" cy="20" rx="6" ry="3" fill={fill} opacity={0.9} />
        </g>
      )

    case 'r': {
      const segW = 34 / 5
      return (
        <g>
          <rect x="32" y="28" width="36" height="30" rx="1" fill={fill} />
          <rect x="30" y="26" width="40" height="5" rx="1" fill={fill} />
          {[0, 2, 4].map((i) => (
            <rect key={i} x={32 + i * segW} y={10} width={segW - 1.6} height={18} rx="1" fill={fill} />
          ))}
          <rect x="34" y="40" width="32" height="3" fill={accent} opacity={0.55} />
        </g>
      )
    }

    case 'n': {
      const body: [number, number][] = [
        [38, 58], [34, 44], [36, 30], [44, 16], [42, 26], [56, 14],
        [74, 28], [70, 38], [62, 44], [64, 58],
      ]
      return (
        <g>
          <polygon points={pts(body)} fill={fill} />
          <polygon points={pts([[54, 20], [68, 18], [62, 28]])} fill={accent} opacity={0.85} />
          <circle cx="58" cy="30" r="2.6" fill={isWhite ? '#0a2030' : '#f0d0d8'} />
          <circle cx="58.8" cy="29.2" r="0.9" fill={isWhite ? '#fff' : '#1a0608'} opacity={0.7} />
          <path
            d="M68 36 Q74 40 70 46"
            fill="none"
            stroke={isWhite ? 'rgba(10,35,48,0.4)' : 'rgba(255,180,190,0.3)'}
            strokeWidth={1.2}
          />
        </g>
      )
    }

    case 'b':
      return (
        <g>
          <path d="M36 58 C36 36 40 16 50 4 C60 16 64 36 64 58 Z" fill={fill} />
          <ellipse cx="50" cy="58" rx="15" ry="3.5" fill={fill} />
          <path
            d="M44 18 L56 42"
            stroke={isWhite ? 'rgba(10,40,50,0.45)' : 'rgba(255,180,190,0.4)'}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <circle cx="50" cy="10" r="5.5" fill={fill} />
          <circle cx="50" cy="10" r="2.2" fill={accent} opacity={0.9} />
          <ellipse cx="46" cy="28" rx="5" ry="8" fill={highlight} />
        </g>
      )

    case 'q':
      return (
        <g>
          <path d="M28 52 L32 22 L42 40 L50 14 L58 40 L68 22 L72 52 Z" fill={fill} />
          <ellipse cx="50" cy="54" rx="24" ry="5" fill={fill} />
          {[32, 42, 50, 58, 68].map((x, i) => (
            <circle key={i} cx={x} cy={i === 2 ? 12 : 20} r={i === 2 ? 4 : 3.2} fill={fill} />
          ))}
          <circle cx="50" cy="12" r="2" fill={accent} />
          <rect x="36" y="44" width="28" height="4" rx="1" fill={accent} opacity={0.55} />
        </g>
      )

    case 'k':
    default:
      return (
        <g>
          <rect x="46" y="6" width="8" height="22" rx="1.5" fill={fill} />
          <rect x="38" y="12" width="24" height="8" rx="1.5" fill={fill} />
          <path d="M34 58 C34 38 38 28 50 24 C62 28 66 38 66 58 Z" fill={fill} />
          <ellipse cx="50" cy="58" rx="18" ry="4" fill={fill} />
          <ellipse cx="50" cy="32" rx="12" ry="4" fill={fill} />
          <rect x="40" y="36" width="20" height="4" rx="1" fill={accent} opacity={0.6} />
          <ellipse cx="46" cy="40" rx="5" ry="10" fill={highlight} />
        </g>
      )
  }
}
