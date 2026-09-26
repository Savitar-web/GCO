import { useMemo } from 'react'
import type { Color, GameState, LegalMove } from './chessEngine'
import { BOARD_SKINS, type BoardSkin } from './chessTypes'
import type { Selection } from './useChessGame'

const GLYPH: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

interface Props {
  state: GameState
  selection: Selection | null
  lastMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null
  orientation: Color
  skin: BoardSkin
  showLegalHints: boolean
  onSquareClick: (r: number, c: number) => void
}

export function ChessBoard2D({
  state,
  selection,
  lastMove,
  orientation,
  skin,
  showLegalHints,
  onSquareClick,
}: Props) {
  const skinDef = BOARD_SKINS.find((s) => s.id === skin) ?? BOARD_SKINS[0]

  const rows = useMemo(() => {
    const r = [0, 1, 2, 3, 4, 5, 6, 7]
    return orientation === 'w' ? [...r].reverse() : r
  }, [orientation])
  const cols = useMemo(() => {
    const c = [0, 1, 2, 3, 4, 5, 6, 7]
    return orientation === 'w' ? c : [...c].reverse()
  }, [orientation])

  const inCheckSquare = useMemo(() => {
    if (state.fullLog.length === 0) return null
    const last = state.fullLog[state.fullLog.length - 1]
    if (last.status !== 'check' && last.status !== 'checkmate') return null
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c]
        if (p && p.type === 'k' && p.color === state.turn) return { r, c }
      }
    return null
  }, [state])

  return (
    <div
      className="gco-chess-board2d"
      style={
        {
          '--skin-light': skinDef.light,
          '--skin-dark': skinDef.dark,
          '--skin-accent': skinDef.accent,
        } as React.CSSProperties
      }
    >
      <div className="gco-chess-board2d-grid">
        {rows.map((r) =>
          cols.map((c) => {
            const piece = state.board[r][c]
            const isLight = (r + c) % 2 === 0
            const isSelected = selection?.r === r && selection?.c === c
            const moveHint = showLegalHints
              ? selection?.moves.find((m: LegalMove) => m.toR === r && m.toC === c)
              : undefined
            const isLastFrom = lastMove && lastMove.from.r === r && lastMove.from.c === c
            const isLastTo = lastMove && lastMove.to.r === r && lastMove.to.c === c
            const isCheck = inCheckSquare && inCheckSquare.r === r && inCheckSquare.c === c
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={[
                  'gco-chess-sq',
                  isLight ? 'is-light' : 'is-dark',
                  isSelected ? 'is-selected' : '',
                  isLastFrom || isLastTo ? 'is-lastmove' : '',
                  isCheck ? 'is-check' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSquareClick(r, c)}
                aria-label={`${FILES[c]}${r + 1}`}
              >
                {c === (orientation === 'w' ? 0 : 7) && (
                  <span className="gco-chess-coord gco-chess-coord-rank">{r + 1}</span>
                )}
                {r === (orientation === 'w' ? 0 : 7) && (
                  <span className="gco-chess-coord gco-chess-coord-file">{FILES[c]}</span>
                )}
                {moveHint && (
                  <span className={`gco-chess-hint ${moveHint.capture ? 'is-capture' : ''}`} aria-hidden />
                )}
                {piece && (
                  <span
                    className={`gco-chess-piece ${piece.color === 'w' ? 'is-white' : 'is-black'}`}
                    aria-hidden
                  >
                    {GLYPH[`${piece.color}${piece.type}`]}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
