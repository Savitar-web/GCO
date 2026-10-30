import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { soundClick } from '@/core/audio/uiSounds'
import type { Color } from './chessEngine'
import {
  chessHistoryStats,
  clearChessHistory,
  formatDuration,
  formatHistoryDate,
  loadChessHistory,
  type ChessHistoryEntry,
} from './chessHistory'
import { BOARD_SKINS, DEFAULT_SETUP, type ChessSetup, type ClockPreset } from './chessTypes'
import { chessSfx } from './chessSound'
import './chess.css'
import {PieceCustomizer,usePieceStyles} from './PieceCustomizer'
import {GameTutorial} from '../GameTutorial'

const CLOCK_OPTIONS: { id: ClockPreset; label: string }[] = [
  { id: 'none', label: 'Sin reloj' },
  { id: '1', label: 'Bala · 1 min' },
  { id: '3', label: 'Blitz · 3 min' },
  { id: '5', label: 'Blitz · 5 min' },
  { id: '10', label: '10 min' },
  { id: '15', label: '15 min' },
  { id: '30', label: '30 min' },
]

function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    const particles: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = []

    function resize() {
      w = canvas!.width = window.innerWidth
      h = canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.min(70, Math.floor((w * h) / 18000))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 0.8 + Math.random() * 2.2,
        a: 0.15 + Math.random() * 0.45,
      })
    }

    function tick() {
      ctx!.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(55, 230, 255, ${p.a})`
        ctx!.fill()
      }
      // conexiones suaves
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < 120) {
            ctx!.strokeStyle = `rgba(34, 230, 197, ${0.12 * (1 - d / 120)})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="gco-chess-particles" aria-hidden />
}

export function ChessMenu() {
  const [pieceStyles,savePieceStyles]=usePieceStyles()
  const navigate = useNavigate()
  const [setup, setSetup] = useState<ChessSetup>(DEFAULT_SETUP)
  const [history, setHistory] = useState<ChessHistoryEntry[]>(() => loadChessHistory())
  const [showHistory, setShowHistory] = useState(false)
  const stats = useMemo(() => chessHistoryStats(history), [history])

  function update<K extends keyof ChessSetup>(key: K, value: ChessSetup[K]) {
    soundClick()
    setSetup((s) => ({ ...s, [key]: value }))
  }

  function startGame() {
    if (setup.mode === 'online') { navigate(`/games/mesa/ajedrez?pace=${setup.clock==='none'?'none':setup.clock==='1'?'bala':setup.clock==='3'?'blitz':setup.clock==='5'?'blitz5':'rapid'}`); return }
    soundClick()
    chessSfx.start(setup.soundEnabled)
    navigate('/games/ajedrez', { state: { setup } })
  }

  function goBack() {
    soundClick()
    // CategoryMenu (pantalla principal de categorías)
    navigate('/games')
  }

  function refreshHistory() {
    setHistory(loadChessHistory())
  }

  function handleClearHistory() {
    soundClick()
    clearChessHistory()
    setHistory([])
  }

  return (
    <>
      <ParticleCanvas />
      <div className="gco-chess-menu">
        <div className="gco-chess-menu-header">
          <div>
            <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', marginBottom: '0.15rem' }}>
              Games · Estrategia
            </p>
            <h1 className="gco-chess-menu-title">Ajedrez</h1>
          </div>
          <button type="button" className="gco-chess-back-btn" onClick={goBack}>
            ← Volver
          </button>
        </div>

        <p className="gco-chess-section-label">Modo de juego</p>
        <div className="gco-chess-option-grid">
          <button
            type="button"
            className={`gco-chess-option ${setup.mode === 'ai' ? 'is-active' : ''}`}
            onClick={() => update('mode', 'ai')}
          >
            <span className="gco-chess-option-icon">🤖</span>
            <span className="gco-chess-option-title">Contra la IA</span>
            <span className="gco-chess-option-desc">Motor propio con dificultad ajustable</span>
          </button>
          <button
            type="button"
            className={`gco-chess-option ${setup.mode === 'local2p' ? 'is-active' : ''}`}
            onClick={() => update('mode', 'local2p')}
          >
            <span className="gco-chess-option-icon">🧑‍🤝‍🧑</span>
            <span className="gco-chess-option-title">2 jugadores</span>
            <span className="gco-chess-option-desc">Mismo dispositivo, turno a turno</span>
          </button>
          <button type="button" className={`gco-chess-option ${setup.mode==='online'?'is-active':''}`} onClick={() => update('mode', 'online')}>
            <span className="gco-chess-option-icon">🌐</span>
            <span className="gco-chess-option-title">Multijugador</span>
            <span className="gco-chess-option-desc">En línea contra otros jugadores</span>
          </button>
        </div>

        {setup.mode === 'ai' && (
          <>
            <p className="gco-chess-section-label">Tu color</p>
            <div className="gco-chess-option-grid">
              {(['w', 'b'] as Color[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`gco-chess-option ${setup.humanColor === color ? 'is-active' : ''}`}
                  onClick={() => update('humanColor', color)}
                >
                  <span className="gco-chess-option-icon">{color === 'w' ? '♔' : '♚'}</span>
                  <span className="gco-chess-option-title">{color === 'w' ? 'Blancas' : 'Negras'}</span>
                  <span className="gco-chess-option-desc">
                    {color === 'w' ? 'Mueves primero' : 'La IA abre la partida'}
                  </span>
                </button>
              ))}
            </div>

            <p className="gco-chess-section-label">Nivel de la IA — {setup.aiLevel}/10</p>
            <div className="gco-chess-slider-row">
              <div className="gco-chess-slider-track-wrap">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={setup.aiLevel}
                  onChange={(e) => update('aiLevel', Number(e.target.value))}
                  className="gco-chess-range"
                  style={{
                    ['--range-pct' as string]: `${((setup.aiLevel - 1) / 9) * 100}%`,
                  }}
                />
              </div>
              <div className="gco-chess-slider-meta">
                <span className="gco-chess-slider-level">
                  {setup.aiLevel <= 3 ? 'Principiante' : setup.aiLevel <= 7 ? 'Intermedio' : 'Avanzado'}
                </span>
                <span className="gco-chess-slider-hint">Motor con poda alfa-beta</span>
              </div>
            </div>
          </>
        )}

        <p className="gco-chess-section-label">Vista del tablero</p>
        <div className="gco-chess-option-grid">
          <button
            type="button"
            className={`gco-chess-option ${setup.view === '3d' ? 'is-active' : ''}`}
            onClick={() => update('view', '3d')}
          >
            <span className="gco-chess-option-icon">🧊</span>
            <span className="gco-chess-option-title">3D</span>
            <span className="gco-chess-option-desc">Piezas talladas, mármol y luces</span>
          </button>
          <button
            type="button"
            className={`gco-chess-option ${setup.view === '2d' ? 'is-active' : ''}`}
            onClick={() => update('view', '2d')}
          >
            <span className="gco-chess-option-icon">▦</span>
            <span className="gco-chess-option-title">2D</span>
            <span className="gco-chess-option-desc">SVG premium, máximo rendimiento</span>
          </button>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', marginTop: '-0.6rem', marginBottom: '1rem' }}>
          Podrás cambiar entre 2D y 3D en cualquier momento, incluso durante la partida.
        </p>

        <p className="gco-chess-section-label">Estilo del tablero</p>
        <div className="gco-chess-skin-row">
          {BOARD_SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`gco-chess-skin-chip ${setup.skin === s.id ? 'is-active' : ''}`}
              style={{ ['--skin-chip-accent' as string]: s.accent }}
              onClick={() => update('skin', s.id)}
            >
              <span className="gco-chess-skin-swatch" style={{ background: s.accent }} />
              {s.label}
            </button>
          ))}
        </div>

        <p className="gco-chess-section-label">Reloj de partida</p>
        <div className="gco-chess-skin-row">
          {CLOCK_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`gco-chess-skin-chip ${setup.clock === o.id ? 'is-active' : ''}`}
              onClick={() => update('clock', o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="gco-actions"><PieceCustomizer styles={pieceStyles} onSave={savePieceStyles}/><GameTutorial kind="ajedrez"/></div><p className="gco-chess-section-label">Competición y partidas</p>
        <div className="gco-actions chess-extra-actions"><button className="glass-button secondary" onClick={() => navigate('/games/torneo')}>Torneo online · 4 u 8</button><button className="glass-button secondary" onClick={() => navigate('/games/activas')}>Partidas activas e historial</button></div>
        <p className="gco-chess-section-label">Opciones</p>
        <div className="gco-chess-panel-section">
          <div className="gco-chess-toggle-row">
            <span>Mostrar jugadas legales</span>
            <label className="gco-chess-switch">
              <input
                type="checkbox"
                checked={setup.showLegalHints}
                onChange={(e) => update('showLegalHints', e.target.checked)}
              />
              <span className="gco-chess-switch-slider" />
            </label>
          </div>
          <div className="gco-chess-toggle-row">
            <span>Sonido</span>
            <label className="gco-chess-switch">
              <input
                type="checkbox"
                checked={setup.soundEnabled}
                onChange={(e) => update('soundEnabled', e.target.checked)}
              />
              <span className="gco-chess-switch-slider" />
            </label>
          </div>
          {setup.mode === 'local2p' && (
            <div className="gco-chess-toggle-row">
              <span>Girar tablero cada turno</span>
              <label className="gco-chess-switch">
                <input
                  type="checkbox"
                  checked={setup.autoFlip}
                  onChange={(e) => update('autoFlip', e.target.checked)}
                />
                <span className="gco-chess-switch-slider" />
              </label>
            </div>
          )}
          {setup.mode === 'local2p' && (
            <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', marginTop: '0.35rem' }}>
              Activado: ideal si se prestan el celular. Desactivado: tablero fijo (cada uno en su lado).
            </p>
          )}
        </div>

        <button type="button" className="gco-chess-cta" onClick={startGame}>
          Comenzar partida
        </button>

        <p className="gco-chess-section-label" style={{ marginTop: '1.5rem' }}>
          Historial de partidas
        </p>
        <div className="gco-chess-stats-row">
          <div className="gco-chess-stat-card">
            <div className="gco-chess-stat-value">{stats.games}</div>
            <div className="gco-chess-stat-label">Partidas</div>
          </div>
          <div className="gco-chess-stat-card">
            <div className="gco-chess-stat-value">{stats.wins}</div>
            <div className="gco-chess-stat-label">Victorias</div>
          </div>
          <div className="gco-chess-stat-card">
            <div className="gco-chess-stat-value">{stats.losses}</div>
            <div className="gco-chess-stat-label">Derrotas</div>
          </div>
          <div className="gco-chess-stat-card">
            <div className="gco-chess-stat-value">{stats.draws}</div>
            <div className="gco-chess-stat-label">Tablas</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="gco-chess-btn"
            onClick={() => {
              soundClick()
              refreshHistory()
              setShowHistory((v) => !v)
            }}
          >
            {showHistory ? 'Ocultar detalle' : 'Ver historial'}
          </button>
          {history.length > 0 && (
            <button type="button" className="gco-chess-btn danger" onClick={handleClearHistory}>
              Borrar historial
            </button>
          )}
        </div>

        {showHistory && (
          <div className="gco-chess-history-list">
            {history.length === 0 ? (
              <p className="gco-chess-history-empty">Aún no hay partidas registradas.</p>
            ) : (
              history.slice(0, 30).map((e) => (
                <div key={e.id} className="gco-chess-history-row">
                  <div
                    className={`gco-chess-history-badge ${
                      e.result === 'win' ? 'is-win' : e.result === 'loss' ? 'is-loss' : 'is-draw'
                    }`}
                  >
                    {e.result === 'win' ? 'W' : e.result === 'loss' ? 'L' : 'D'}
                  </div>
                  <div className="gco-chess-history-main">
                    <div className="gco-chess-history-title">
                      {e.winnerLabel}
                      {e.mode === 'ai' ? ` · IA ${e.aiLevel ?? '—'}` : ' · 2 jugadores'}
                    </div>
                    <div className="gco-chess-history-meta">
                      {formatHistoryDate(e.date)} · {e.moves} jugadas · {formatDuration(e.durationSec)}
                      {e.clock && e.clock !== 'none' ? ` · reloj ${e.clock}m` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}
