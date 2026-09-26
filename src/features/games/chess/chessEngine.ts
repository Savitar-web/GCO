/**
 * chessEngine.ts
 * Motor de ajedrez puro (sin DOM, sin Three.js) — reglas completas + IA.
 * Compartido entre el tablero 2D y el tablero 3D para que ambas vistas
 * representen siempre exactamente el mismo estado de partida.
 */

export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface Piece {
  type: PieceType
  color: Color
  moved: boolean
}

export type Board = (Piece | null)[][]

export interface CastlingRights {
  wK: boolean
  wQ: boolean
  bK: boolean
  bQ: boolean
}

export interface EnPassant {
  r: number
  c: number
}

export interface Move {
  toR: number
  toC: number
  capture?: boolean
  promotion?: boolean
  doubleStep?: boolean
  enPassantCapture?: boolean
  castle?: 'K' | 'Q'
}

export interface LegalMove extends Move {
  r: number
  c: number
}

export type MoveStatus = 'ok' | 'check' | 'checkmate' | 'stalemate'

export interface MoveInfo {
  from: { r: number; c: number }
  to: { r: number; c: number }
  piece: Piece
  captured: Piece | null
  promotion: boolean
  castle: 'K' | 'Q' | null
  enPassantCapture: boolean
  san: string
  status: MoveStatus
  color: Color
}

export type GameResult = 'checkmate' | 'stalemate' | 'draw' | null

export interface GameState {
  board: Board
  turn: Color
  castling: CastlingRights
  enPassant: EnPassant | null
  moveNumber: number
  history: string[]
  fullLog: MoveInfo[]
  result: GameResult
  winner: Color | null
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function squareName(r: number, c: number): string {
  return `${FILES[c]}${r + 1}`
}

export function initialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null))
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let f = 0; f < 8; f++) {
    b[0][f] = { type: back[f], color: 'w', moved: false }
    b[1][f] = { type: 'p', color: 'w', moved: false }
    b[6][f] = { type: 'p', color: 'b', moved: false }
    b[7][f] = { type: back[f], color: 'b', moved: false }
  }
  return b
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function cloneState(s: GameState): GameState {
  return {
    board: cloneBoard(s.board),
    turn: s.turn,
    castling: { ...s.castling },
    enPassant: s.enPassant ? { ...s.enPassant } : null,
    moveNumber: s.moveNumber,
    history: [...s.history],
    fullLog: [...s.fullLog],
    result: s.result,
    winner: s.winner,
  }
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

export function newGameState(): GameState {
  return {
    board: initialBoard(),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    moveNumber: 1,
    history: [],
    fullLog: [],
    result: null,
    winner: null,
  }
}

const DIRS: Record<string, number[][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
  n: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
  k: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}

export function pseudoMoves(state: GameState, r: number, c: number): Move[] {
  const board = state.board
  const piece = board[r][c]
  if (!piece) return []
  const moves: Move[] = []
  const enemy: Color = piece.color === 'w' ? 'b' : 'w'

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? 1 : -1
    const startRank = piece.color === 'w' ? 1 : 6
    const promoRank = piece.color === 'w' ? 7 : 0
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ toR: r + dir, toC: c, promotion: r + dir === promoRank })
      if (r === startRank && !board[r + 2 * dir][c]) {
        moves.push({ toR: r + 2 * dir, toC: c, doubleStep: true })
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir
      const nc = c + dc
      if (!inBounds(nr, nc)) continue
      const target = board[nr][nc]
      if (target && target.color === enemy) {
        moves.push({ toR: nr, toC: nc, capture: true, promotion: nr === promoRank })
      } else if (state.enPassant && state.enPassant.r === nr && state.enPassant.c === nc) {
        moves.push({ toR: nr, toC: nc, capture: true, enPassantCapture: true })
      }
    }
  } else if (piece.type === 'n' || piece.type === 'k') {
    for (const [dr, dc] of DIRS[piece.type]) {
      const nr = r + dr
      const nc = c + dc
      if (!inBounds(nr, nc)) continue
      const target = board[nr][nc]
      if (!target) moves.push({ toR: nr, toC: nc })
      else if (target.color === enemy) moves.push({ toR: nr, toC: nc, capture: true })
    }
    if (piece.type === 'k') {
      const rank = piece.color === 'w' ? 0 : 7
      const rights = state.castling
      const canK = piece.color === 'w' ? rights.wK : rights.bK
      const canQ = piece.color === 'w' ? rights.wQ : rights.bQ
      if (!piece.moved && r === rank && c === 4) {
        if (
          canK &&
          !board[rank][5] &&
          !board[rank][6] &&
          board[rank][7] &&
          board[rank][7]!.type === 'r' &&
          !board[rank][7]!.moved &&
          !isAttacked(state, rank, 4, enemy) &&
          !isAttacked(state, rank, 5, enemy) &&
          !isAttacked(state, rank, 6, enemy)
        ) {
          moves.push({ toR: rank, toC: 6, castle: 'K' })
        }
        if (
          canQ &&
          !board[rank][1] &&
          !board[rank][2] &&
          !board[rank][3] &&
          board[rank][0] &&
          board[rank][0]!.type === 'r' &&
          !board[rank][0]!.moved &&
          !isAttacked(state, rank, 4, enemy) &&
          !isAttacked(state, rank, 3, enemy) &&
          !isAttacked(state, rank, 2, enemy)
        ) {
          moves.push({ toR: rank, toC: 2, castle: 'Q' })
        }
      }
    }
  } else {
    for (const [dr, dc] of DIRS[piece.type]) {
      let nr = r + dr
      let nc = c + dc
      while (inBounds(nr, nc)) {
        const target = board[nr][nc]
        if (!target) {
          moves.push({ toR: nr, toC: nc })
        } else {
          if (target.color === enemy) moves.push({ toR: nr, toC: nc, capture: true })
          break
        }
        nr += dr
        nc += dc
      }
    }
  }
  return moves
}

export function isAttacked(state: GameState, r: number, c: number, byColor: Color): boolean {
  const board = state.board
  const pdir = byColor === 'w' ? -1 : 1
  for (const dc of [-1, 1]) {
    const nr = r + pdir
    const nc = c + dc
    if (inBounds(nr, nc)) {
      const p = board[nr][nc]
      if (p && p.color === byColor && p.type === 'p') return true
    }
  }
  for (const [dr, dc] of DIRS.n) {
    const nr = r + dr
    const nc = c + dc
    if (inBounds(nr, nc)) {
      const p = board[nr][nc]
      if (p && p.color === byColor && p.type === 'n') return true
    }
  }
  for (const [dr, dc] of DIRS.k) {
    const nr = r + dr
    const nc = c + dc
    if (inBounds(nr, nc)) {
      const p = board[nr][nc]
      if (p && p.color === byColor && p.type === 'k') return true
    }
  }
  for (const [dr, dc] of DIRS.b) {
    let nr = r + dr
    let nc = c + dc
    while (inBounds(nr, nc)) {
      const p = board[nr][nc]
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true
        break
      }
      nr += dr
      nc += dc
    }
  }
  for (const [dr, dc] of DIRS.r) {
    let nr = r + dr
    let nc = c + dc
    while (inBounds(nr, nc)) {
      const p = board[nr][nc]
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true
        break
      }
      nr += dr
      nc += dc
    }
  }
  return false
}

export function findKing(board: Board, color: Color): { r: number; c: number } | null {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.type === 'k' && p.color === color) return { r, c }
    }
  return null
}

function leavesKingInCheck(state: GameState, r: number, c: number, move: Move): boolean {
  const board = cloneBoard(state.board)
  const piece = board[r][c]!
  const color = piece.color
  if (move.enPassantCapture) board[r][move.toC] = null
  board[move.toR][move.toC] = { ...piece, moved: true }
  board[r][c] = null
  if (move.castle) {
    const rank = r
    if (move.castle === 'K') {
      board[rank][5] = board[rank][7]
      board[rank][7] = null
      if (board[rank][5]) board[rank][5]!.moved = true
    } else {
      board[rank][3] = board[rank][0]
      board[rank][0] = null
      if (board[rank][3]) board[rank][3]!.moved = true
    }
  }
  const kingPos = piece.type === 'k' ? { r: move.toR, c: move.toC } : findKing(board, color)
  if (!kingPos) return false
  const tempState: GameState = { ...state, board }
  const enemy: Color = color === 'w' ? 'b' : 'w'
  return isAttacked(tempState, kingPos.r, kingPos.c, enemy)
}

export function legalMoves(state: GameState, r: number, c: number): Move[] {
  const piece = state.board[r][c]
  if (!piece || piece.color !== state.turn) return []
  return pseudoMoves(state, r, c).filter((m) => !leavesKingInCheck(state, r, c, m))
}

export function allLegalMoves(state: GameState, color: Color): LegalMove[] {
  const list: LegalMove[] = []
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c]
      if (p && p.color === color) {
        const moves = pseudoMoves(state, r, c).filter((m) => !leavesKingInCheck(state, r, c, m))
        for (const m of moves) list.push({ r, c, ...m })
      }
    }
  return list
}

const PIECE_LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }

/** Aplica un movimiento MUTANDO `state` (se espera pasar un clon). Devuelve la info del movimiento. */
export function applyMove(state: GameState, r: number, c: number, move: Move): MoveInfo {
  const board = state.board
  const piece = board[r][c]!
  const color = piece.color
  const enemy: Color = color === 'w' ? 'b' : 'w'
  const capturedPiece = move.enPassantCapture ? board[r][move.toC] : board[move.toR][move.toC]

  let disambiguation = ''
  if (piece.type !== 'p' && piece.type !== 'k') {
    const others = allLegalMoves(state, color).filter(
      (m2) =>
        m2.toR === move.toR &&
        m2.toC === move.toC &&
        !(m2.r === r && m2.c === c) &&
        state.board[m2.r][m2.c]!.type === piece.type
    )
    if (others.length) {
      const sameFile = others.some((o) => o.c === c)
      const sameRank = others.some((o) => o.r === r)
      if (!sameFile) disambiguation = FILES[c]
      else if (!sameRank) disambiguation = String(r + 1)
      else disambiguation = FILES[c] + String(r + 1)
    }
  }

  if (move.enPassantCapture) board[r][move.toC] = null
  board[r][c] = null
  board[move.toR][move.toC] = { ...piece, moved: true }

  if (move.castle) {
    const rank = r
    if (move.castle === 'K') {
      board[rank][5] = board[rank][7]
      board[rank][7] = null
      board[rank][5]!.moved = true
    } else {
      board[rank][3] = board[rank][0]
      board[rank][0] = null
      board[rank][3]!.moved = true
    }
  }
  if (move.promotion) board[move.toR][move.toC]!.type = 'q'

  if (piece.type === 'k') {
    if (color === 'w') {
      state.castling.wK = false
      state.castling.wQ = false
    } else {
      state.castling.bK = false
      state.castling.bQ = false
    }
  }
  if (piece.type === 'r') {
    if (color === 'w' && r === 0 && c === 0) state.castling.wQ = false
    if (color === 'w' && r === 0 && c === 7) state.castling.wK = false
    if (color === 'b' && r === 7 && c === 0) state.castling.bQ = false
    if (color === 'b' && r === 7 && c === 7) state.castling.bK = false
  }
  if (capturedPiece && capturedPiece.type === 'r') {
    if (capturedPiece.color === 'w' && move.toR === 0 && move.toC === 0) state.castling.wQ = false
    if (capturedPiece.color === 'w' && move.toR === 0 && move.toC === 7) state.castling.wK = false
    if (capturedPiece.color === 'b' && move.toR === 7 && move.toC === 0) state.castling.bQ = false
    if (capturedPiece.color === 'b' && move.toR === 7 && move.toC === 7) state.castling.bK = false
  }

  state.enPassant = move.doubleStep ? { r: (r + move.toR) / 2, c } : null
  state.turn = enemy

  const enemyMoves = allLegalMoves(state, enemy)
  const kingPos = findKing(state.board, enemy)!
  const inCheck = isAttacked(state, kingPos.r, kingPos.c, color)
  let suffix = ''
  let status: MoveStatus = 'ok'
  if (enemyMoves.length === 0) {
    if (inCheck) {
      suffix = '#'
      status = 'checkmate'
      state.result = 'checkmate'
      state.winner = color
    } else {
      status = 'stalemate'
      state.result = 'stalemate'
    }
  } else if (inCheck) {
    suffix = '+'
    status = 'check'
  } else if (isInsufficientMaterial(state.board) || isFiftyMoveIsh(state)) {
    state.result = 'draw'
  }

  let san: string
  if (move.castle === 'K') san = 'O-O'
  else if (move.castle === 'Q') san = 'O-O-O'
  else {
    const letter = PIECE_LETTER[piece.type]
    const fromFile = FILES[c]
    const dest = FILES[move.toC] + (move.toR + 1)
    const capMark = move.capture ? 'x' : ''
    if (piece.type === 'p' && move.capture) {
      san = fromFile + 'x' + dest
    } else {
      san = letter + disambiguation + capMark + dest
    }
    if (move.promotion) san += '=Q'
  }
  san += suffix

  const info: MoveInfo = {
    from: { r, c },
    to: { r: move.toR, c: move.toC },
    piece,
    captured: capturedPiece || null,
    promotion: !!move.promotion,
    castle: move.castle || null,
    enPassantCapture: !!move.enPassantCapture,
    san,
    status,
    color,
  }
  state.history.push(san)
  state.fullLog.push(info)
  if (color === 'b') state.moveNumber++
  return info
}

function isInsufficientMaterial(board: Board): boolean {
  const pieces: Piece[] = []
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p) pieces.push(p)
    }
  if (pieces.length > 4) return false
  const nonKing = pieces.filter((p) => p.type !== 'k')
  if (nonKing.length === 0) return true
  if (nonKing.length === 1 && (nonKing[0].type === 'b' || nonKing[0].type === 'n')) return true
  return false
}

// Aproximación ligera de la regla de las 50 jugadas (sin reloj de medio-movimientos exacto).
function isFiftyMoveIsh(state: GameState): boolean {
  if (state.fullLog.length < 100) return false
  const recent = state.fullLog.slice(-100)
  return recent.every((m) => m.piece.type !== 'p' && !m.captured)
}

export function materialScore(board: Board): number {
  let score = 0
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p) score += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type]
    }
  return score
}

export function isInCheck(state: GameState, color: Color): boolean {
  const kingPos = findKing(state.board, color)
  if (!kingPos) return false
  const enemy: Color = color === 'w' ? 'b' : 'w'
  return isAttacked(state, kingPos.r, kingPos.c, enemy)
}

/* ================================================================
   IA — negamax con poda alfa-beta + tablas posicionales simples
   ================================================================ */

const PST: Record<PieceType, number[][]> = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, -10, -10, 10, 10, 5],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  r: [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  k: [
    [20, 30, 10, 0, 0, 10, 30, 20],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
  ],
}

function pstValue(p: Piece, r: number, c: number): number {
  const table = PST[p.type]
  const row = p.color === 'w' ? r : 7 - r
  return table[row][c]
}

function evaluate(state: GameState): number {
  let score = 0
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c]
      if (!p) continue
      const val = PIECE_VALUES[p.type] * 100 + pstValue(p, r, c)
      score += p.color === 'w' ? val : -val
    }
  return state.turn === 'w' ? score : -score
}

function orderMoves(moves: LegalMove[]): LegalMove[] {
  return [...moves].sort((a, b) => Number(!!b.capture) - Number(!!a.capture))
}

interface SearchBudget {
  deadline: number
  nodes: number
  maxNodes: number
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, budget: SearchBudget): number {
  budget.nodes++
  if (depth === 0 || state.result || budget.nodes > budget.maxNodes || performance.now() > budget.deadline) {
    return evaluate(state)
  }
  const moves = orderMoves(allLegalMoves(state, state.turn))
  if (moves.length === 0) {
    return isInCheck(state, state.turn) ? -100000 + depth : 0
  }
  let best = -Infinity
  for (const m of moves) {
    const next = cloneState(state)
    applyMove(next, m.r, m.c, m)
    const score = -negamax(next, depth - 1, -beta, -alpha, budget)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
    if (performance.now() > budget.deadline) break
  }
  return best
}

export interface AILevelConfig {
  depth: number
  timeMs: number
  randomness: number // 0 = siempre el mejor movimiento, mayor = más variación
}

/** Traduce un nivel 1-10 (fácil→difícil) a la configuración de búsqueda. */
export function levelToConfig(level: number): AILevelConfig {
  const l = Math.max(1, Math.min(10, level))
  return {
    depth: 1 + Math.floor(l / 3), // 1..4
    timeMs: 250 + l * 90, // 340ms..1150ms
    randomness: Math.max(0, (10 - l) * 12), // hasta 108 "centipawns" de margen en niveles bajos
  }
}

/** Calcula el mejor movimiento para el color al turno. Devuelve null si no hay movimientos. */
export function getAIMove(state: GameState, level: number): LegalMove | null {
  const moves = allLegalMoves(state, state.turn)
  if (moves.length === 0) return null
  const { depth, timeMs, randomness } = levelToConfig(level)
  const budget: SearchBudget = { deadline: performance.now() + timeMs, nodes: 0, maxNodes: 260000 }

  const scored: { move: LegalMove; score: number }[] = []
  for (const m of orderMoves(moves)) {
    const next = cloneState(state)
    applyMove(next, m.r, m.c, m)
    const score = -negamax(next, depth - 1, -Infinity, Infinity, budget)
    scored.push({ move: m, score })
    if (performance.now() > budget.deadline) break
  }
  scored.sort((a, b) => b.score - a.score)
  if (scored.length === 0) return moves[0]

  if (randomness > 0) {
    const top = scored.filter((s) => s.score >= scored[0].score - randomness)
    return top[Math.floor(Math.random() * top.length)].move
  }
  return scored[0].move
}
