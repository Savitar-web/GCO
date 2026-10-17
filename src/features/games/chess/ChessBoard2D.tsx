import { useMemo } from 'react'
import type { Color, GameState, LegalMove } from './chessEngine'
import { BOARD_SKINS, type BoardSkin } from './chessTypes'
import { ChessPieceIcon } from './Chesspieceicon'
import type { Selection } from './useChessGame'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const FILES_UP = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface Props {
  state: GameState
  selection: Selection | null
  lastMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null
  orientation: Color
  skin: BoardSkin
  showLegalHints: boolean
  onSquareClick: (r: number, c: number) => void
}

/**
 * Tablero 2D estable: marco con coordenadas fuera de la grilla 8×8
 * para que nunca se corten y el tamaño no “salte”.
 */
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

  const fileLabels = orientation === 'w' ? FILES_UP : [...FILES_UP].reverse()
  const rankLabels = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]

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
      <div className="gco-chess-board2d-frame">
        <div className="gco-chess-board2d-ranks gco-chess-board2d-ranks-left" aria-hidden>
          {rankLabels.map((n) => (
            <span key={`rl-${n}`} className="gco-chess-coord-label">
              {n}
            </span>
          ))}
        </div>

        <div className="gco-chess-board2d-center">
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
                    {moveHint && (
                      <span className={`gco-chess-hint ${moveHint.capture ? 'is-capture' : ''}`} aria-hidden />
                    )}
                    {piece && (
                      <span
                        className={`gco-chess-piece-wrap ${piece.color === 'w' ? 'is-white' : 'is-black'}`}
                        aria-hidden
                      >
                        <ChessPieceIcon type={piece.type} color={piece.color} accent={skinDef.accent} />
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="gco-chess-board2d-files" aria-hidden>
            {fileLabels.map((f) => (
              <span key={`f-${f}`} className="gco-chess-coord-label">
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="gco-chess-board2d-ranks gco-chess-board2d-ranks-right" aria-hidden>
          {rankLabels.map((n) => (
            <span key={`rr-${n}`} className="gco-chess-coord-label">
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
