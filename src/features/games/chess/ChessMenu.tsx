import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { soundClick } from '@/core/audio/uiSounds'
import type { Color } from './chessEngine'
import { BOARD_SKINS, DEFAULT_SETUP, type ChessSetup, type ClockPreset } from './chessTypes'
import './chess.css'

const CLOCK_OPTIONS: { id: ClockPreset; label: string }[] = [
  { id: 'none', label: 'Sin reloj' },
  { id: '3', label: '3 min' },
  { id: '5', label: '5 min' },
  { id: '10', label: '10 min' },
  { id: '15', label: '15 min' },
  { id: '30', label: '30 min' },
]

export function ChessMenu() {
  const navigate = useNavigate()
  const [setup, setSetup] = useState<ChessSetup>(DEFAULT_SETUP)

  function update<K extends keyof ChessSetup>(key: K, value: ChessSetup[K]) {
    soundClick()
    setSetup((s) => ({ ...s, [key]: value }))
  }

  function startGame() {
    soundClick()
    navigate('/games/ajedrez', { state: { setup } })
  }

  return (
    <div className="gco-chess-menu">
      <div className="gco-chess-menu-header">
        <div>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.85rem', marginBottom: '0.15rem' }}>
            Games · Estrategia
          </p>
          <h1 className="gco-chess-menu-title">♟ Ajedrez</h1>
        </div>
        <button className="gco-chess-back-btn" onClick={() => navigate(-1)}>
          ← Volver
        </button>
      </div>

      <p className="gco-chess-section-label">Modo de juego</p>
      <div className="gco-chess-option-grid">
        <button
          className={`gco-chess-option ${setup.mode === 'ai' ? 'is-active' : ''}`}
          onClick={() => update('mode', 'ai')}
        >
          <span className="gco-chess-option-icon">🤖</span>
          <span className="gco-chess-option-title">Contra la IA</span>
          <span className="gco-chess-option-desc">Motor propio con dificultad ajustable</span>
        </button>
        <button
          className={`gco-chess-option ${setup.mode === 'local2p' ? 'is-active' : ''}`}
          onClick={() => update('mode', 'local2p')}
        >
          <span className="gco-chess-option-icon">🧑‍🤝‍🧑</span>
          <span className="gco-chess-option-title">2 jugadores</span>
          <span className="gco-chess-option-desc">Mismo dispositivo, turno a turno</span>
        </button>
      </div>

      {setup.mode === 'ai' && (
        <>
          <p className="gco-chess-section-label">Tu color</p>
          <div className="gco-chess-option-grid">
            {(['w', 'b'] as Color[]).map((color) => (
              <button
                key={color}
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
            <input
              type="range"
              min={1}
              max={10}
              value={setup.aiLevel}
              onChange={(e) => update('aiLevel', Number(e.target.value))}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>
              {setup.aiLevel <= 3 ? 'Principiante' : setup.aiLevel <= 7 ? 'Intermedio' : 'Avanzado'} · motor con
              poda alfa-beta
            </span>
          </div>
        </>
      )}

      <p className="gco-chess-section-label">Vista del tablero</p>
      <div className="gco-chess-option-grid">
        <button
          className={`gco-chess-option ${setup.view === '3d' ? 'is-active' : ''}`}
          onClick={() => update('view', '3d')}
        >
          <span className="gco-chess-option-icon">🧊</span>
          <span className="gco-chess-option-title">3D</span>
          <span className="gco-chess-option-desc">Piezas talladas, mármol y luces</span>
        </button>
        <button
          className={`gco-chess-option ${setup.view === '2d' ? 'is-active' : ''}`}
          onClick={() => update('view', '2d')}
        >
          <span className="gco-chess-option-icon">▦</span>
          <span className="gco-chess-option-title">2D</span>
          <span className="gco-chess-option-desc">Máximo rendimiento, estilo neón</span>
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
            className={`gco-chess-skin-chip ${setup.clock === o.id ? 'is-active' : ''}`}
            onClick={() => update('clock', o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="gco-chess-section-label">Opciones</p>
      <div className="gco-chess-panel-section">
        <div className="gco-chess-toggle-row">
          <span>Mostrar jugadas legales</span>
          <input
            type="checkbox"
            checked={setup.showLegalHints}
            onChange={(e) => update('showLegalHints', e.target.checked)}
          />
        </div>
        <div className="gco-chess-toggle-row">
          <span>Sonido</span>
          <input
            type="checkbox"
            checked={setup.soundEnabled}
            onChange={(e) => update('soundEnabled', e.target.checked)}
          />
        </div>
        {setup.mode === 'local2p' && (
          <div className="gco-chess-toggle-row">
            <span>Girar tablero según el turno</span>
            <input type="checkbox" checked={setup.autoFlip} onChange={(e) => update('autoFlip', e.target.checked)} />
          </div>
        )}
      </div>

      <button className="gco-chess-cta" onClick={startGame}>
        Comenzar partida
      </button>
    </div>
  )
}
