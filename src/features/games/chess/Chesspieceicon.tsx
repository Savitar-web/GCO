import { useId } from 'react'
import type { PieceType } from './chessEngine'

interface Props {
  type: PieceType
  color: 'w' | 'b'
  accent: string
}

/**
 * Pedestal compartido por todas las piezas: base de doble escalón + cuello
 * cónico + dos collares. Da una base visual común "formal" antes de que cada
 * pieza dibuje su cabeza distintiva por encima de y=58.
 */
function Pedestal({ fill, id }: { fill: string; id: string }) {
  return (
    <g>
      <path d="M14 132 L86 132 L86 122 L20 122 Z" fill={fill} />
      <path d="M20 122 L80 122 L74 108 L26 108 Z" fill={fill} />
      <path d="M31 108 L69 108 L60 70 L40 70 Z" fill={fill} />
      <ellipse cx="50" cy="70" rx="20" ry="4" fill={fill} opacity={0.92} />
      <path d="M42 70 L58 70 L54 58 L46 58 Z" fill={fill} />
      <ellipse cx="50" cy="58" rx="13" ry="2.6" fill={fill} opacity={0.95} />
      <rect x="12" y="129" width="76" height="3.5" rx="1.5" fill={`url(#${id}-rim)`} opacity={0.85} />
    </g>
  )
}

function polygonPoints(pts: [number, number][]) {
  return pts.map((p) => p.join(',')).join(' ')
}

export function ChessPieceIcon({ type, color, accent }: Props) {
  const uid = useId().replace(/[:]/g, '')
  const isWhite = color === 'w'
  const gradId = `${uid}-body`
  const rimId = `${uid}-rim`

  const bodyStops = isWhite
    ? [
        ['0%', '#fbfdff'],
        ['45%', '#d7e2ea'],
        ['78%', '#a9b8c6'],
        ['100%', '#8592a0'],
      ]
    : [
        ['0%', '#565f6c'],
        ['45%', '#2c323c'],
        ['78%', '#15181d'],
        ['100%', '#08090b'],
      ]

  const fill = `url(#${gradId})`

  return (
    <svg viewBox="0 0 100 136" className="gco-chess-piece-svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {bodyStops.map(([off, col]) => (
            <stop key={off} offset={off} stopColor={col} />
          ))}
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.15} />
          <stop offset="50%" stopColor={accent} stopOpacity={0.95} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.15} />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-40%" y="-20%" width="180%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity={isWhite ? 0.35 : 0.6} />
        </filter>
      </defs>

      <g filter={`url(#${uid}-shadow)`}>
        <Pedestal fill={fill} id={uid} />
        <PieceHead type={type} fill={fill} accent={accent} />
      </g>
    </svg>
  )
}

function PieceHead({ type, fill, accent }: { type: PieceType; fill: string; accent: string }) {
  switch (type) {
    case 'p':
      return (
        <g>
          <ellipse cx="50" cy="54" rx="15" ry="3.4" fill={fill} opacity={0.95} />
          <circle cx="50" cy="38" r="16" fill={fill} />
        </g>
      )

    case 'r': {
      const segW = 32 / 5
      const merlons = [0, 2, 4]
      return (
        <g>
          <rect x="34" y="30" width="32" height="28" fill={fill} />
          <rect x="32" y="28" width="36" height="4" fill={fill} />
          {merlons.map((i) => (
            <rect key={i} x={34 + i * segW} y={14} width={segW - 1.4} height={16} fill={fill} />
          ))}
        </g>
      )
    }

    case 'n': {
      const pts: [number, number][] = [
        [40, 58], [37, 42], [41, 28], [49, 14], [45, 25], [59, 18],
        [72, 33], [65, 42], [59, 46], [61, 58],
      ]
      return (
        <g>
          <polygon points={polygonPoints(pts)} fill={fill} />
          <polygon points={polygonPoints([[57, 24], [64, 24], [60, 30]])} fill={accent} opacity={0.85} />
        </g>
      )
    }

    case 'b':
      return (
        <g>
          <path d="M37 58 C37 38 40 18 50 5 C60 18 63 38 63 58 Z" fill={fill} />
          <rect x="34" y="30" width="32" height="3" fill={accent} opacity={0.75} transform="rotate(-8 50 31)" />
          <circle cx="50" cy="2" r="5" fill={fill} />
        </g>
      )

    case 'q': {
      const spikes = [0, 1, 2, 3, 4].map((i) => {
        const x0 = 34 + i * 8
        const h = 14 + (2 - Math.abs(i - 2)) * 3.4
        return { base: x0, apex: [x0 + 4, 48 - h] as [number, number] }
      })
      return (
        <g>
          <rect x="32" y="48" width="36" height="10" fill={fill} />
          {spikes.map((s, i) => (
            <g key={i}>
              <polygon points={polygonPoints([[s.base, 48], [s.base + 8, 48], s.apex])} fill={fill} />
              <circle cx={s.apex[0]} cy={s.apex[1]} r={2.8} fill={accent} />
            </g>
          ))}
        </g>
      )
    }

    case 'k':
      return (
        <g>
          <rect x="32" y="50" width="36" height="9" fill={fill} />
          <path d="M36 50 L64 50 L61 36 L39 36 Z" fill={fill} />
          <rect x="47" y="12" width="6" height="26" fill={fill} />
          <rect x="39" y="19" width="22" height="6" fill={fill} />
          <circle cx="50" cy="9" r="3.4" fill={accent} />
        </g>
      )

    default:
      return null
  }
}