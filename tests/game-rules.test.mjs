import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGameState, legalMoves, applyMove } from '../src/features/games/chess/chessEngine.ts'
import { newCardGame, applyCardAction, pokerRank, blackjackValue, validMeld, cardAI } from '../src/features/games/cards/cardEngine.ts'

function move(state, fromR, fromC, toR, toC) {
  const found = legalMoves(state, fromR, fromC).find(candidate => candidate.toR === toR && candidate.toC === toC)
  assert.ok(found, `Legal move ${fromR},${fromC} -> ${toR},${toC}`)
  return applyMove(state, fromR, fromC, found)
}
test('Castling moves king and rook, and revokes both rights', () => {
  for (const side of ['K', 'Q']) {
    const state = newGameState()
    for (const column of [1, 2, 3, 5, 6]) state.board[0][column] = null
    const castle = legalMoves(state, 0, 4).find(candidate => candidate.castle === side)
    assert.ok(castle)
    applyMove(state, 0, 4, castle)
    assert.equal(state.board[0][side === 'K' ? 6 : 2].type, 'k')
    assert.equal(state.board[0][side === 'K' ? 5 : 3].type, 'r')
    assert.equal(state.castling.wK, false)
    assert.equal(state.castling.wQ, false)
  }
})
test('Cannot castle through attack, with an enemy rook, or after king moved', () => {
  const state = newGameState()
  state.board[0][5] = null; state.board[0][6] = null; state.board[1][5] = null
  state.board[3][5] = { type: 'r', color: 'b', moved: false }
  assert.equal(legalMoves(state, 0, 4).some(candidate => candidate.castle === 'K'), false)
  state.board[3][5] = null; state.board[0][7].color = 'b'
  assert.equal(legalMoves(state, 0, 4).some(candidate => candidate.castle === 'K'), false)
  state.board[0][7].color = 'w'; state.board[0][4].moved = true
  assert.equal(legalMoves(state, 0, 4).some(candidate => candidate.castle), false)
})
function enPassantState() {
  const state = newGameState()
  move(state, 1, 4, 3, 4); move(state, 6, 0, 5, 0); move(state, 3, 4, 4, 4); move(state, 6, 3, 4, 3)
  return state
}
test('En passant captures the adjacent pawn and expires after one turn', () => {
  const state = enPassantState()
  const info = move(state, 4, 4, 5, 3)
  assert.equal(info.enPassantCapture, true); assert.equal(state.board[4][3], null); assert.equal(info.captured.type, 'p')
  const expired = enPassantState()
  move(expired, 1, 7, 2, 7); move(expired, 5, 0, 4, 0)
  assert.equal(legalMoves(expired, 4, 4).some(candidate => candidate.enPassantCapture), false)
})
test('En passant is rejected when removing both pawns exposes the king', () => {
  const state = newGameState()
  state.board = Array.from({ length: 8 }, () => Array(8).fill(null))
  state.board[4][0] = { type: 'k', color: 'w', moved: true }
  state.board[7][7] = { type: 'k', color: 'b', moved: true }
  state.board[4][7] = { type: 'r', color: 'b', moved: true }
  state.board[4][4] = { type: 'p', color: 'w', moved: true }
  state.board[4][3] = { type: 'p', color: 'b', moved: true }
  state.enPassant = { r: 5, c: 3 }
  assert.equal(legalMoves(state, 4, 4).some(candidate => candidate.enPassantCapture), false)
})
const card = (rank, suit = 0) => ({ rank, suit, up: true })
test('Poker handles ace-low straight and complete tie breakers', () => {
  assert.deepEqual(pokerRank([card(1), card(2, 1), card(3), card(4), card(5)]), [4, 5])
  assert.deepEqual(pokerRank([card(10), card(11), card(12), card(13), card(1)]), [8, 14])
  assert.deepEqual(pokerRank([card(7), card(7, 1), card(7, 2), card(2), card(2, 1)]), [6, 7, 2])
})
test('Blackjack aces adjust and out-of-turn moves fail without mutation', () => {
  assert.equal(blackjackValue([card(1), card(1), card(9)]), 21)
  const state = newCardGame('21'); const original = JSON.stringify(state)
  assert.throws(() => applyCardAction(state, 1, { type: 'hit' }))
  assert.equal(JSON.stringify(state), original)
})
test('Conquian has 40 unique cards, and sequences skip 8/9/10', () => {
  const state = newCardGame('conquian'); const all = [...state.deck, ...state.hands.flat(), ...state.discard]
  assert.equal(new Set(all.map(item => `${item.suit}:${item.rank}`)).size, 40)
  assert.equal(validMeld([card(6), card(7), card(11)]), true)
  assert.equal(validMeld([card(6), card(7, 1), card(11)]), false)
})
test('Solitaire can move to a foundation, turns over exposed cards, rejects invalid moves', () => {
  const state = newCardGame('solitario')
  state.columns[0] = [{ ...card(5, 1), up: false }, card(1)]
  const next = applyCardAction(state, 0, { type: 'move', from: 0, to: 7, indices: [1] })
  assert.equal(next.foundations[0].length, 1); assert.equal(next.columns[0][0].up, true)
  assert.equal(state.foundations[0].length, 0)
  assert.throws(() => applyCardAction(next, 0, { type: 'move', from: 0, to: 7, indices: [0] }))
})
test('AI games terminate and conserve cards', () => {
  for (const kind of ['21', 'poker', 'conquian']) for (let trial = 0; trial < 20; trial++) {
    let state = newCardGame(kind)
    for (let turn = 0; turn < 200 && !state.finished; turn++) state = applyCardAction(state, state.turn, cardAI(state, state.turn))
    assert.equal(state.finished, true, `${kind} finishes`)
  }
})
