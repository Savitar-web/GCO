import { Fragment, lazy, Suspense, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { soundClick } from '@/core/audio/uiSounds'
import { ChessBoard2D } from './ChessBoard2D'
import type { CameraPreset } from './ChessBoard3D'
import { BOARD_SKINS, DEFAULT_SETUP, type BoardView, type ChessSetup } from './chessTypes'
import { useChessGame } from './useChessGame'
import './chess.css'

const ChessBoard3D = lazy(() => import('./ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })))

const GLYPH: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
}

function formatClock(seconds: number | null): string {
  if (seconds === null) return '∞'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ChessGame() {
  const navigate = useNavigate()
  const location = useLocation()
  const setup = useMemo<ChessSetup>(
    () => (location.state as { setup?: ChessSetup } | null)?.setup ?? DEFAULT_SETUP,
    [location.state]
  )
  const [view, setView] = useState<BoardView>(setup.view)
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('default')
  const [skin, setSkin] = useState(setup.skin)
  const [showLegalHints, setShowLegalHints] = useState(setup.showLegalHints)

  const game = useChessGame(setup)
  const { state } = game

  const statusLabel = useMemo(() => {
    if (state.result === 'checkmate') {
      const winnerLabel = state.winner === 'w' ? 'Blancas' : 'Negras'
      return { text: `Jaque mate · ${winnerLabel} ganan`, cls: 'is-mate' }
    }
    if (state.result === 'stalemate') return { text: 'Tablas por ahogado', cls: '' }
    if (state.result === 'draw') return { text: 'Tablas', cls: '' }
    const last = state.fullLog[state.fullLog.length - 1]
    if (last?.status === 'check') return { text: 'Jaque', cls: 'is-check' }
    return { text: '', cls: '' }
  }, [state])

  const movePairs = useMemo(() => {
    const pairs: { n: number; w?: string; b?: string }[] = []
    state.history.forEach((san, i) => {
      const n = Math.floor(i / 2) + 1
      if (i % 2 === 0) pairs.push({ n, w: san })
      else pairs[pairs.length - 1].b = san
    })
    return pairs
  }, [state.history])

  const lastMoveSquares = game.lastMove ? { from: game.lastMove.from, to: game.lastMove.to } : null

  return (
    <div className="gco-chess-screen">
      <div className="gco-chess-topbar">
        <button className="gco-chess-back-btn" onClick={() => navigate('/games')}>
          ← Menú
        </button>

        <div className="gco-chess-turn-pill">
          <span className={`gco-chess-turn-dot ${state.turn === 'b' ? 'is-black' : ''}`} />
          <span>Turno: {state.turn === 'w' ? 'Blancas' : 'Negras'}</span>
          {statusLabel.text && <span className={`gco-chess-status ${statusLabel.cls}`}> · {statusLabel.text}</span>}
        </div>

        <div className="gco-chess-view-switch" role="tablist" aria-label="Vista del tablero">
          <button className={view === '3d' ? 'is-active' : ''} onClick={() => { soundClick(); setView('3d') }}>
            3D
          </button>
          <button className={view === '2d' ? 'is-active' : ''} onClick={() => { soundClick(); setView('2d') }}>
            2D
          </button>
        </div>

        {setup.clock !== 'none' && (
          <div className="gco-chess-clocks">
            <span className={`gco-chess-clock ${state.turn === 'w' ? 'is-active-turn' : ''} ${game.clock.w !== null && game.clock.w < 30 ? 'is-low' : ''}`}>
              ♙ {formatClock(game.clock.w)}
            </span>
            <span className={`gco-chess-clock ${state.turn === 'b' ? 'is-active-turn' : ''} ${game.clock.b !== null && game.clock.b < 30 ? 'is-low' : ''}`}>
              ♟ {formatClock(game.clock.b)}
            </span>
          </div>
        )}
      </div>

      <div className="gco-chess-layout">
        <div className="gco-chess-board-wrap">
          {view === '3d' ? (
            <Suspense
              fallback={
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--gco-ink-muted)' }}>
                  Cargando escena 3D…
                </div>
              }
            >
              <ChessBoard3D
                state={state}
                selection={game.selection}
                lastMove={lastMoveSquares}
                orientation={game.boardOrientation}
                skin={skin}
                showLegalHints={showLegalHints}
                cameraPreset={cameraPreset}
                onSquareClick={game.onSquareClick}
              />
            </Suspense>
          ) : (
            <ChessBoard2D
              state={state}
              selection={game.selection}
              lastMove={lastMoveSquares}
              orientation={game.boardOrientation}
              skin={skin}
              showLegalHints={showLegalHints}
              onSquareClick={game.onSquareClick}
            />
          )}
        </div>

        <div className="gco-chess-panel">
          {setup.mode === 'ai' && (
            <div className="gco-chess-panel-section">
              <div className="gco-chess-panel-title">Inteligencia artificial</div>
              {game.isAiThinking ? (
                <span className="gco-chess-ai-thinking">
                  <span className="gco-chess-ai-dot" /> Pensando su jugada…
                </span>
              ) : (
                <span style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                  Nivel {setup.aiLevel}/10 · esperando tu jugada
                </span>
              )}
            </div>
          )}

          {view === '3d' && (
            <div className="gco-chess-panel-section">
              <div className="gco-chess-panel-title">Cámara</div>
              <div className="gco-chess-camera-row">
                <button className="gco-chess-btn" onClick={() => setCameraPreset('default')}>
                  Angular
                </button>
                <button className="gco-chess-btn" onClick={() => setCameraPreset('front')}>
                  Frontal
                </button>
                <button className="gco-chess-btn" onClick={() => setCameraPreset('top')}>
                  Cenital
                </button>
              </div>
            </div>
          )}

          <div className="gco-chess-panel-section">
            <div className="gco-chess-panel-title">Historial de movimientos</div>
            <div className="gco-chess-move-list">
              {movePairs.map((p) => (
                <Fragment key={p.n}>
                  <span className="mv-num">{p.n}.</span>
                  <span>{p.w ?? ''}</span>
                  <span>{p.b ?? ''}</span>
                </Fragment>
              ))}
            </div>
          </div>

          <div className="gco-chess-panel-section">
            <div className="gco-chess-panel-title">Piezas capturadas</div>
            <div className="gco-chess-captured-row">
              <span style={{ width: 54, color: 'var(--gco-ink-muted)' }}>Blancas</span>
              <div className="gco-chess-captured-icons">
                {game.captured.w.map((p, i) => (
                  <span key={i}>{GLYPH[p.type]}</span>
                ))}
              </div>
            </div>
            <div className="gco-chess-captured-row">
              <span style={{ width: 54, color: 'var(--gco-ink-muted)' }}>Negras</span>
              <div className="gco-chess-captured-icons">
                {game.captured.b.map((p, i) => (
                  <span key={i}>{GLYPH[p.type]}</span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--gco-ink-muted)', marginTop: '0.35rem' }}>
              Material: {game.material > 0 ? `+${game.material}` : game.material} · Jugadas: {state.fullLog.length}
            </div>
          </div>

          <div className="gco-chess-panel-section">
            <div className="gco-chess-panel-title">Estilo del tablero</div>
            <div className="gco-chess-skin-row">
              {BOARD_SKINS.map((s) => (
                <button
                  key={s.id}
                  className={`gco-chess-skin-chip ${skin === s.id ? 'is-active' : ''}`}
                  style={{ ['--skin-chip-accent' as string]: s.accent }}
                  onClick={() => setSkin(s.id)}
                >
                  <span className="gco-chess-skin-swatch" style={{ background: s.accent }} />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="gco-chess-toggle-row" style={{ marginTop: '0.4rem' }}>
              <span>Mostrar jugadas legales</span>
              <input type="checkbox" checked={showLegalHints} onChange={(e) => setShowLegalHints(e.target.checked)} />
            </div>
          </div>

          <div className="gco-chess-panel-section">
            <div className="gco-chess-panel-title">Controles</div>
            <div className="gco-chess-btn-grid">
              <button className="gco-chess-btn wide" onClick={() => { soundClick(); game.newGame() }}>
                ♟ Nueva partida
              </button>
              <button className="gco-chess-btn" disabled={!game.canUndo} onClick={game.undo}>
                ↺ Deshacer
              </button>
              <button className="gco-chess-btn" disabled={!game.canRedo} onClick={game.redo}>
                ↻ Rehacer
              </button>
              <button className="gco-chess-btn" onClick={game.flipBoard}>
                ⇅ Girar tablero
              </button>
              {setup.mode === 'ai' && (
                <button
                  className="gco-chess-btn"
                  onClick={() => {
                    const h = game.hint()
                    if (h) soundClick()
                  }}
                >
                  💡 Sugerencia
                </button>
              )}
              <button
                className="gco-chess-btn danger wide"
                disabled={!!state.result}
                onClick={() => game.resign(state.turn)}
              >
                🏳 Rendirse
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
