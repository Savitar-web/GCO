import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { soundClick } from '@/core/audio/uiSounds'
import { ChessBoard2D } from './ChessBoard2D'
import type { CameraPreset } from './ChessBoard3D'
import { ChessPieceIcon } from './Chesspieceicon'
import { BOARD_SKINS, DEFAULT_SETUP, type BoardView, type ChessSetup } from './chessTypes'
import { useChessGame } from './useChessGame'
import { chessSfx } from './chessSound'
import './chess.css'
import {PieceCustomizer,usePieceStyles} from './PieceCustomizer'

const ChessBoard3D = lazy(() => import('./ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })))

const MOBILE_QUERY = '(max-width: 768px)'

function formatClock(seconds: number | null): string {
  if (seconds === null) return '∞'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

export function ChessGame() {
  const [pieceStyles,savePieceStyles]=usePieceStyles()
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const screenRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const game = useChessGame(setup)
  const { state } = game
  const displayState=useMemo(()=>({...state,cosmetics:pieceStyles}),[state,pieceStyles])
  const skinDef = BOARD_SKINS.find((s) => s.id === skin) ?? BOARD_SKINS[0]

  // ☰: en móvil siempre; en PC solo en pantalla completa
  const showHamburger = isMobile || isFullscreen

  const statusLabel = useMemo(() => {
    if (state.result === 'checkmate') {
      const winnerLabel = state.winner === 'w' ? 'Blancas' : 'Negras'
      return { text: `Jaque mate · ${winnerLabel} ganan`, cls: 'is-mate' }
    }
    if (state.result === 'timeout') return { text: `Tiempo agotado · ${state.winner==='w'?'Blancas':'Negras'} ganan`, cls: '' }
    if (state.result === 'resignation') return { text: `Rendición · ${state.winner==='w'?'Blancas':'Negras'} ganan`, cls: '' }
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

  const toggleFullscreen = useCallback(() => {
    soundClick()
    const el = screenRef.current
    if (!el) return

    // Salir
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined)
      setIsFullscreen(false)
      return
    }
    if (isFullscreen) {
      // pantalla completa simulada (iOS)
      setIsFullscreen(false)
      return
    }

    // Entrar
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen(true)) // fallback CSS si el navegador lo rechaza
    } else {
      // iOS Safari no soporta Fullscreen API en elementos: usamos modo CSS
      setIsFullscreen(true)
    }
  }, [isFullscreen])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // En PC, si se sale de pantalla completa el ☰ desaparece: cerramos el drawer
  useEffect(() => {
    if (!isFullscreen && !isMobile) setMenuOpen(false)
  }, [isFullscreen, isMobile])

  // Cerrar con Escape
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function goToCategoryMenu() {
    soundClick()
    if (document.fullscreenElement) void document.exitFullscreen?.()
    navigate('/games')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  const isActuallyFullscreen = isFullscreen || !!document.fullscreenElement

  return (
    <div
      ref={screenRef}
      className={`gco-chess-screen ${isFullscreen ? 'is-fullscreen' : ''} ${menuOpen ? 'is-menu-open' : ''}`}
    >
      {/* Top bar */}
      <div className="gco-chess-topbar">
        <button type="button" className="gco-chess-back-btn" onClick={goToCategoryMenu}>
          ← Volver
        </button>

        <div className="gco-chess-turn-pill">
          <span className={`gco-chess-turn-dot ${state.turn === 'b' ? 'is-black' : ''}`} />
          <span className="gco-chess-turn-text">
            {state.turn === 'w' ? 'Blancas' : 'Negras'}
            {statusLabel.text && (
              <span className={`gco-chess-status ${statusLabel.cls}`}> · {statusLabel.text}</span>
            )}
          </span>
        </div>

        <div className="gco-chess-top-actions"><PieceCustomizer styles={pieceStyles} onSave={savePieceStyles}/>
          <div className="gco-chess-view-switch" role="tablist" aria-label="Vista del tablero">
            <button
              type="button"
              className={view === '3d' ? 'is-active' : ''}
              onClick={() => {
                soundClick()
                setView('3d')
              }}
            >
              3D
            </button>
            <button
              type="button"
              className={view === '2d' ? 'is-active' : ''}
              onClick={() => {
                soundClick()
                setView('2d')
              }}
            >
              2D
            </button>
          </div>

          {/* ☰ en móvil siempre, en PC solo en pantalla completa */}
          {showHamburger && (
            <button
              type="button"
              className={`gco-chess-icon-btn gco-chess-hamburger ${menuOpen ? 'is-open' : ''}`}
              title="Menú"
              aria-label="Abrir menú de opciones"
              aria-expanded={menuOpen}
              onClick={() => {
                soundClick()
                setMenuOpen((v) => {
                  const next = !v
                  chessSfx[next ? 'openMenu' : 'closeMenu'](setup.soundEnabled)
                  return next
                })
              }}
            >
              <span className="gco-chess-ham-line" />
              <span className="gco-chess-ham-line" />
              <span className="gco-chess-ham-line" />
            </button>
          )}
        </div>

        {setup.clock !== 'none' && (
          <div className="gco-chess-clocks">
            <span
              className={`gco-chess-clock ${state.turn === 'w' ? 'is-active-turn' : ''} ${
                game.clock.w !== null && game.clock.w < 30 ? 'is-low' : ''
              }`}
            >
              ♙ {formatClock(game.clock.w)}
            </span>
            <span
              className={`gco-chess-clock ${state.turn === 'b' ? 'is-active-turn' : ''} ${
                game.clock.b !== null && game.clock.b < 30 ? 'is-low' : ''
              }`}
            >
              ♟ {formatClock(game.clock.b)}
            </span>
          </div>
        )}
      </div>

      {/* Drawer de opciones (PC: lateral · móvil: ventana emergente ascendente) */}
      {menuOpen && (
        <>
          <button type="button" className="gco-chess-menu-backdrop" aria-label="Cerrar menú" onClick={closeMenu} />
          <aside className="gco-chess-drawer" role="dialog" aria-modal="true" aria-label="Opciones de partida">
            <div className="gco-chess-sheet-handle" aria-hidden="true" />
            <div className="gco-chess-drawer-header">
              <span>Opciones</span>
              <button type="button" className="gco-chess-icon-btn" onClick={closeMenu} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="gco-chess-drawer-body">
              {setup.mode === 'ai' && (
                <div className="gco-chess-drawer-ai">
                  {game.isAiThinking ? (
                    <span className="gco-chess-ai-thinking">
                      <span className="gco-chess-ai-dot" /> Pensando su jugada…
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                      IA nivel {setup.aiLevel}/10 · esperando tu jugada
                    </span>
                  )}
                </div>
              )}

              <div className="gco-chess-panel-title">Vista</div>
              <div className="gco-chess-view-switch gco-chess-view-switch-block" role="tablist">
                <button
                  type="button"
                  className={view === '3d' ? 'is-active' : ''}
                  onClick={() => {
                    soundClick()
                    setView('3d')
                  }}
                >
                  3D
                </button>
                <button
                  type="button"
                  className={view === '2d' ? 'is-active' : ''}
                  onClick={() => {
                    soundClick()
                    setView('2d')
                  }}
                >
                  2D
                </button>
              </div>

              <div className="gco-chess-panel-title" style={{ marginTop: '1rem' }}>
                Estilo del tablero
              </div>
              <div className="gco-chess-skin-row">
                {BOARD_SKINS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`gco-chess-skin-chip ${skin === s.id ? 'is-active' : ''}`}
                    style={{ ['--skin-chip-accent' as string]: s.accent }}
                    onClick={() => {
                      soundClick()
                      setSkin(s.id)
                    }}
                  >
                    <span className="gco-chess-skin-swatch" style={{ background: s.accent }} />
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="gco-chess-toggle-row">
                <span>Mostrar jugadas legales</span>
                <label className="gco-chess-switch">
                  <input
                    type="checkbox"
                    checked={showLegalHints}
                    onChange={(e) => setShowLegalHints(e.target.checked)}
                  />
                  <span className="gco-chess-switch-slider" />
                </label>
              </div>

              {view === '3d' && (
                <>
                  <div className="gco-chess-panel-title" style={{ marginTop: '0.75rem' }}>
                    Cámara 3D
                  </div>
                  <div className="gco-chess-camera-row">
                    <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('default')}>
                      Angular
                    </button>
                    <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('front')}>
                      Frontal
                    </button>
                    <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('top')}>
                      Cenital
                    </button>
                  </div>
                </>
              )}

              <div className="gco-chess-panel-title" style={{ marginTop: '1rem' }}>
                Controles
              </div>
              <div className="gco-chess-btn-grid">
                <button
                  type="button"
                  className="gco-chess-btn"
                  onClick={() => {
                    soundClick()
                    game.flipBoard()
                  }}
                >
                  ⇅ Girar tablero
                </button>
                <button type="button" className="gco-chess-btn" disabled={!game.canUndo} onClick={game.undo}>
                  ↺ Deshacer
                </button>
                <button type="button" className="gco-chess-btn" disabled={!game.canRedo} onClick={game.redo}>
                  ↻ Rehacer
                </button>
                {setup.mode === 'ai' && (
                  <button
                    type="button"
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
                  type="button"
                  className="gco-chess-btn wide"
                  onClick={() => {
                    soundClick()
                    game.newGame()
                    closeMenu()
                  }}
                >
                  Nueva partida
                </button>
                <button
                  type="button"
                  className="gco-chess-btn danger wide"
                  disabled={!!state.result}
                  onClick={() => {
                    game.resign(state.turn)
                    closeMenu()
                  }}
                >
                  🏳 Rendirse
                </button>
              </div>

              <div className="gco-chess-drawer-fs">
                <button
                  type="button"
                  className="gco-chess-btn wide"
                  onClick={() => {
                    closeMenu()
                    toggleFullscreen()
                  }}
                >
                  {isActuallyFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                </button>
                <button
                  type="button"
                  className="gco-chess-btn wide"
                  onClick={() => {
                    closeMenu()
                    goToCategoryMenu()
                  }}
                >
                  ← Menú de juegos
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

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
                state={displayState}
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
              state={displayState}
              selection={game.selection}
              lastMove={lastMoveSquares}
              orientation={game.boardOrientation}
              skin={skin}
              showLegalHints={showLegalHints}
              onSquareClick={game.onSquareClick}
            />
          )}
        </div>

        {/* PANEL LATERAL EN PC · EN MÓVIL ABAJO */}
        <div
          className={`gco-chess-panel ${isFullscreen ? 'is-fs-hidden' : ''} ${
            isFullscreen ? 'is-fullscreen' : ''
          }`}
        >
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
            <div className="gco-chess-panel-section gco-chess-panel-desktop-only">
              <div className="gco-chess-panel-title">Cámara</div>
              <div className="gco-chess-camera-row">
                <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('default')}>
                  Angular
                </button>
                <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('front')}>
                  Frontal
                </button>
                <button type="button" className="gco-chess-btn" onClick={() => setCameraPreset('top')}>
                  Cenital
                </button>
              </div>
            </div>
          )}

          <div className="gco-chess-panel-section">
            <div className="gco-chess-panel-title">Historial de movimientos</div>
            <div className="gco-chess-move-list">
              {movePairs.length === 0 && (
                <span style={{ gridColumn: '1 / -1', color: 'var(--gco-ink-muted)', fontSize: '0.78rem' }}>
                  Sin jugadas aún
                </span>
              )}
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
              <span style={{ width: 54, color: 'var(--gco-ink-muted)', flexShrink: 0 }}>Blancas</span>
              <div className="gco-chess-captured-icons">
                {game.captured.w.map((p, i) => (
                  <span key={i} className="gco-chess-captured-mini is-white">
                    <ChessPieceIcon type={p.type} color="w" accent={skinDef.accent} />
                  </span>
                ))}
              </div>
            </div>
            <div className="gco-chess-captured-row">
              <span style={{ width: 54, color: 'var(--gco-ink-muted)', flexShrink: 0 }}>Negras</span>
              <div className="gco-chess-captured-icons">
                {game.captured.b.map((p, i) => (
                  <span key={i} className="gco-chess-captured-mini is-black">
                    <ChessPieceIcon type={p.type} color="b" accent={skinDef.accent} />
                  </span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--gco-ink-muted)', marginTop: '0.35rem' }}>
              Material: {game.material > 0 ? `+${game.material}` : game.material} · Jugadas: {state.fullLog.length}
            </div>
          </div>

          <div className="gco-chess-panel-section gco-chess-panel-desktop-only">
            <div className="gco-chess-panel-title">Controles</div>
            {state.result && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--gco-primary, #22e6c5)',
                  marginBottom: '0.6rem',
                  fontWeight: 700,
                }}
              >
                Partida finalizada — guardada en tu historial.
              </div>
            )}
            <div className="gco-chess-btn-grid">
              <button type="button" className="gco-chess-btn wide" onClick={toggleFullscreen}>
                {isActuallyFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </button>
              <button
                type="button"
                className="gco-chess-btn wide"
                onClick={() => {
                  soundClick()
                  game.newGame()
                }}
              >
                Nueva partida
              </button>
              <button type="button" className="gco-chess-btn" disabled={!game.canUndo} onClick={game.undo}>
                ↺ Deshacer
              </button>
              <button type="button" className="gco-chess-btn" disabled={!game.canRedo} onClick={game.redo}>
                ↻ Rehacer
              </button>
              <button type="button" className="gco-chess-btn" onClick={game.flipBoard}>
                ⇅ Girar tablero
              </button>
              {setup.mode === 'ai' && (
                <button
                  type="button"
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
                type="button"
                className="gco-chess-btn"
                onClick={() => {
                  soundClick()
                  navigate('/games')
                }}
              >
                📜 Menú juegos
              </button>
              <button
                type="button"
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
