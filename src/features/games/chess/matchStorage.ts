import { newGameState, legalMoves, applyMove, type GameState } from './chessEngine.ts'
import type { ChessSetup } from './chessTypes'
export type SavedMatch = { id: string; setup: ChessSetup; state: GameState; clock: { w: number | null; b: number | null }; at: number }
export function activeMatches(): SavedMatch[] { try { const data=JSON.parse(localStorage.getItem('gco:chess-active') || '[]');return Array.isArray(data)?data.filter(m=>m&&m.state&&Array.isArray(m.state.board)&&m.clock):[] } catch { return [] } }
export function matchText(state: GameState) { return state.fullLog.map(move => `${move.from.r},${move.from.c},${move.to.r},${move.to.c},${move.san},${move.promotionPiece||''}`).join('\n') }
export function replayText(text: string, limit = Infinity) {
  const state = newGameState()
  for (const line of text.split('\n').filter(Boolean).slice(0, limit)) {
    const [row, column, toR, toC] = line.split(',').map(Number)
    const move = legalMoves(state, row, column).find(move => move.toR === toR && move.toC === toC)
    if (!move) throw new Error('El historial contiene una jugada inválida.')
    const promotion=line.split(',')[5]||/=([QRBN])/.exec(line)?.[1]?.toLowerCase();if(move.promotion&&promotion&&['q','r','b','n'].includes(promotion))move.promotionPiece=promotion as 'q'|'r'|'b'|'n'
    applyMove(state, row, column, move)
  }
  return state
}
export function archiveMatch(id: string, state: GameState) {
  const entries = JSON.parse(localStorage.getItem('gco:chess-text-history') || '[]')
  if (!entries.some((entry: { id: string }) => entry.id === id)) localStorage.setItem('gco:chess-text-history', JSON.stringify([{ id, text: matchText(state), result: state.result, winner: state.winner, at: Date.now() }, ...entries]))
}
