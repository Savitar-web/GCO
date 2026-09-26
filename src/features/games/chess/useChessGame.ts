import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  allLegalMoves,
  applyMove,
  cloneState,
  getAIMove,
  legalMoves,
  materialScore,
  newGameState,
  type Color,
  type GameState,
  type LegalMove,
  type Move,
  type MoveInfo,
  type Piece,
} from './chessEngine'
import { chessSfx } from './chessSound'
import { CLOCK_PRESET_SECONDS, type ChessSetup } from './chessTypes'

export interface Selection {
  r: number
  c: number
  moves: LegalMove[]
}

export interface ClockState {
  w: number | null
  b: number | null
}

export interface UseChessGameResult {
  state: GameState
  selection: Selection | null
  lastMove: MoveInfo | null
  captured: { w: Piece[]; b: Piece[] }
  material: number
  isAiThinking: boolean
  clock: ClockState
  canUndo: boolean
  canRedo: boolean
  boardOrientation: Color // 'w' = blancas abajo
  onSquareClick: (r: number, c: number) => void
  newGame: () => void
  undo: () => void
  redo: () => void
  flipBoard: () => void
  resign: (color: Color) => void
  hint: () => LegalMove | null
}

function isHumanTurn(setup: ChessSetup, turn: Color): boolean {
  if (setup.mode === 'local2p') return true
  return turn === setup.humanColor
}

export function useChessGame(setup: ChessSetup): UseChessGameResult {
  const [state, setState] = useState<GameState>(() => newGameState())
  const [selection, setSelection] = useState<Selection | null>(null)
  const [lastMove, setLastMove] = useState<MoveInfo | null>(null)
  const [past, setPast] = useState<GameState[]>([])
  const [future, setFuture] = useState<GameState[]>([])
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [orientation, setOrientation] = useState<Color>(setup.humanColor === 'b' ? 'b' : 'w')
  const [clock, setClock] = useState<ClockState>(() => {
    const secs = CLOCK_PRESET_SECONDS[setup.clock]
    return { w: secs, b: secs }
  })
  const aiTimer = useRef<number | null>(null)
  const clockTicker = useRef<number | null>(null)

  // Reinicia el reloj si cambia el preset elegido en el menú
  useEffect(() => {
    const secs = CLOCK_PRESET_SECONDS[setup.clock]
    setClock({ w: secs, b: secs })
  }, [setup.clock])

  useEffect(() => {
    if (setup.autoFlip && setup.mode === 'local2p') {
      setOrientation(state.turn)
    }
  }, [state.turn, setup.autoFlip, setup.mode])

  const captured = useMemo(() => {
    const w: Piece[] = []
    const b: Piece[] = []
    for (const m of state.fullLog) {
      if (m.captured) {
        if (m.captured.color === 'w') w.push(m.captured)
        else b.push(m.captured)
      }
    }
    return { w, b }
  }, [state.fullLog])

  const material = useMemo(() => materialScore(state.board), [state.board])

  const commitMove = useCallback(
    (r: number, c: number, move: Move) => {
      setPast((p) => [...p, cloneState(state)])
      setFuture([])
      const next = cloneState(state)
      const info = applyMove(next, r, c, move)
      setState(next)
      setLastMove(info)
      setSelection(null)
      if (info.status === 'checkmate') chessSfx.mate(setup.soundEnabled)
      else if (info.status === 'check') chessSfx.check(setup.soundEnabled)
      else if (info.captured) chessSfx.capture(setup.soundEnabled)
      else chessSfx.move(setup.soundEnabled)
    },
    [state, setup.soundEnabled]
  )

  const onSquareClick = useCallback(
    (r: number, c: number) => {
      if (state.result) return
      if (!isHumanTurn(setup, state.turn)) return

      if (selection) {
        const target = selection.moves.find((m) => m.toR === r && m.toC === c)
        if (target) {
          commitMove(selection.r, selection.c, target)
          return
        }
        const piece = state.board[r][c]
        if (piece && piece.color === state.turn) {
          const moves = legalMoves(state, r, c) as LegalMove[]
          setSelection({ r, c, moves })
          chessSfx.select(setup.soundEnabled)
        } else {
          setSelection(null)
          chessSfx.invalid(setup.soundEnabled)
        }
        return
      }

      const piece = state.board[r][c]
      if (piece && piece.color === state.turn) {
        const moves = legalMoves(state, r, c) as LegalMove[]
        if (moves.length) {
          setSelection({ r, c, moves })
          chessSfx.select(setup.soundEnabled)
        }
      }
    },
    [state, selection, setup, commitMove]
  )

  // Turno de la IA
  useEffect(() => {
    if (setup.mode !== 'ai') return
    if (state.result) return
    if (state.turn === setup.humanColor) return
    setIsAiThinking(true)
    aiTimer.current = window.setTimeout(() => {
      const move = getAIMove(state, setup.aiLevel)
      setIsAiThinking(false)
      if (move) commitMove(move.r, move.c, move)
    }, 260) // pequeña pausa perceptible antes de "pensar"
    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, setup.mode, setup.humanColor, setup.aiLevel])

  // Reloj de partida
  useEffect(() => {
    if (setup.clock === 'none' || state.result) return
    clockTicker.current = window.setInterval(() => {
      setClock((c) => {
        const turn = state.turn
        const current = c[turn]
        if (current === null) return c
        const nextVal = Math.max(0, current - 1)
        return { ...c, [turn]: nextVal }
      })
    }, 1000)
    return () => {
      if (clockTicker.current) window.clearInterval(clockTicker.current)
    }
  }, [setup.clock, state.turn, state.result])

  const newGame = useCallback(() => {
    setState(newGameState())
    setSelection(null)
    setLastMove(null)
    setPast([])
    setFuture([])
    setOrientation(setup.humanColor === 'b' ? 'b' : 'w')
    const secs = CLOCK_PRESET_SECONDS[setup.clock]
    setClock({ w: secs, b: secs })
  }, [setup.humanColor, setup.clock])

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setFuture((f) => [cloneState(state), ...f])
      setState(prev)
      setSelection(null)
      setLastMove(prev.fullLog[prev.fullLog.length - 1] || null)
      return p.slice(0, -1)
    })
  }, [state])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const nxt = f[0]
      setPast((p) => [...p, cloneState(state)])
      setState(nxt)
      setSelection(null)
      setLastMove(nxt.fullLog[nxt.fullLog.length - 1] || null)
      return f.slice(1)
    })
  }, [state])

  const flipBoard = useCallback(() => {
    setOrientation((o) => (o === 'w' ? 'b' : 'w'))
  }, [])

  const resign = useCallback((color: Color) => {
    setState((s) => {
      const next = cloneState(s)
      next.result = 'checkmate'
      next.winner = color === 'w' ? 'b' : 'w'
      return next
    })
  }, [])

  const hint = useCallback((): LegalMove | null => {
    if (state.result) return null
    return getAIMove(state, Math.min(6, setup.aiLevel + 2))
  }, [state, setup.aiLevel])

  return {
    state,
    selection,
    lastMove,
    captured,
    material,
    isAiThinking,
    clock,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    boardOrientation: orientation,
    onSquareClick,
    newGame,
    undo,
    redo,
    flipBoard,
    resign,
    hint,
  }
}

export function allMovesFor(state: GameState, color: Color): LegalMove[] {
  return allLegalMoves(state, color)
}
