import {GameSelect} from '../GameSelect'
import {roomRequest} from '../online'
import {useRef} from 'react'
import {EngineSettings} from './EngineSettings'
import {GameBackground} from '../GameBackground'
import {VisualSettings} from './VisualSettings'
import { useMemo, useState } from 'react'
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
import {PieceCustomizer} from './PieceCustomizer'
import {usePieceStyles} from './pieceStyles'
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

export function ChessMenu() {
  const [pieceStyles,savePieceStyles]=usePieceStyles()
  const navigate = useNavigate()
  const [setup, setSetup] = useState<ChessSetup>(DEFAULT_SETUP)
  const [history, setHistory] = useState<ChessHistoryEntry[]>(() => loadChessHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [roomAction,setRoomAction]=useState<'create'|'join'>('create')
  const [roomCode,setRoomCode]=useState('')
  const [roomError,setRoomError]=useState('')
  const [joining,setJoining]=useState(false)
  const roomPending=useRef(false)
  const stats = useMemo(() => chessHistoryStats(history), [history])

  function update<K extends keyof ChessSetup>(key: K, value: ChessSetup[K]) {
    soundClick()
    setRoomError('')
    setSetup((s) => ({ ...s, [key]: value }))
  }

  async function startGame() {
    if(roomPending.current)return
    soundClick()
    if(setup.mode==='online'){
      const code=roomCode.trim().toUpperCase()
      if(roomAction==='join'&&!/^[A-F0-9]{10}$/.test(code)){
        setRoomError(code?'Introduce un código de sala válido de 10 caracteres.':'Introduce el código de la sala para continuar.')
        return
      }
      roomPending.current=true;setJoining(true);setRoomError('')
      try{
        const pace=setup.clock==='none'?'none':setup.clock==='1'?'bala':setup.clock==='3'?'blitz':setup.clock==='5'?'blitz5':'rapid'
        const room=await roomRequest({op:roomAction,kind:'ajedrez',...(roomAction==='join'?{code}:{}),pace,appearance:pieceStyles[roomAction==='join'?'b':'w']})
        navigate('/games/mesa/ajedrez?sala='+room.code,{state:{initialRoom:room}})
      }catch(cause){setRoomError(cause instanceof Error?cause.message:'No se pudo conectar. Inténtalo de nuevo.')}
      finally{roomPending.current=false;setJoining(false)}
      return
    }
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
      <GameBackground />
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
            <span className="gco-chess-option-desc">IA Verónica y Conde · 100 niveles offline</span>
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
          <button type="button" className={`gco-chess-option ${setup.mode==='online'?'is-active':''}`} onClick={() => {update('mode', 'online');if(!['none','1','3','5','10'].includes(setup.clock))setSetup(current=>({...current,mode:'online',clock:'10'}))}}>
            <span className="gco-chess-option-icon">🌐</span>
            <span className="gco-chess-option-title">Multijugador</span>
            <span className="gco-chess-option-desc">En línea contra otros jugadores</span>
          </button>
        </div>


        {setup.mode==='online'&&<section className="chess-room-panel" aria-label="Sala multijugador">
          <div className="chess-room-intro"><span className="chess-room-symbol" aria-hidden="true">♟</span><div><h2>Tu próxima partida, en línea</h2><p>Crea una sala privada o entra con el código de tu rival.</p></div></div>
          <div className="chess-room-tabs" role="group" aria-label="Acceso a la sala">
            <button type="button" aria-pressed={roomAction==='create'} disabled={joining} onClick={()=>{setRoomAction('create');setRoomError('')}}>Crear sala</button>
            <button type="button" aria-pressed={roomAction==='join'} disabled={joining} onClick={()=>{setRoomAction('join');setRoomError('')}}>Unirse a sala</button>
          </div>
          {roomAction==='join'?<label className="chess-room-code">Código de invitación<input className="glass-input" aria-label="Código de sala" value={roomCode} maxLength={10} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Ej. A1B2C3D4E5" disabled={joining} onChange={event=>{setRoomCode(event.target.value.toUpperCase());setRoomError('')}} onKeyDown={event=>{if(event.key==='Enter')void startGame()}}/><small>Introduce los 10 caracteres que te compartieron.</small></label>:<div className="chess-room-pace"><label htmlFor="chess-room-clock">Ritmo de la sala</label><GameSelect id="chess-room-clock" className="glass-input" value={setup.clock} onChange={event=>update('clock',event.target.value as ClockPreset)}>{CLOCK_OPTIONS.filter(option=>['none','1','3','5','10'].includes(option.id)).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</GameSelect><p>Al comenzar recibirás el código para invitar a tu rival.</p></div>}
        </section>}
        {setup.mode!=='online'&&<>
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

            <EngineSettings value={setup.engine||'full'} onChange={engine=>update('engine',engine)}/>
            <p className="gco-chess-section-label">Nivel de la IA — {setup.aiLevel}/100</p>
            <div className="gco-chess-slider-row">
              <div className="gco-chess-slider-track-wrap">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={setup.aiLevel}
                  aria-label="Nivel de la IA"
                  onChange={(e) => update('aiLevel', Number(e.target.value))}
                  className="gco-chess-range"
                  style={{
                    ['--range-pct' as string]: `${((setup.aiLevel - 1) / 99) * 100}%`,
                  }}
                />
              </div>
              <div className="gco-chess-slider-meta">
                <span className="gco-chess-slider-level">
                  {setup.aiLevel <= 25 ? 'Principiante' : setup.aiLevel <= 70 ? 'Intermedio' : 'Avanzado'}
                </span>
                <span className="gco-chess-slider-hint">IA Verónica y Conde · proceso independiente</span>
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
            <span className="gco-chess-option-desc">Piezas nítidas y máxima fluidez</span>
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
              onClick={() => {update('skin', s.id);localStorage.setItem('gco:chess-visual',JSON.stringify({...JSON.parse(localStorage.getItem('gco:chess-visual')||'{}'),skin:s.id}))}}
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

        <div className="gco-actions"><PieceCustomizer styles={pieceStyles} onSave={savePieceStyles}/><VisualSettings/><GameTutorial kind="ajedrez"/></div><p className="gco-chess-section-label">Competición y partidas</p>
        <div className="gco-actions chess-extra-actions"><button className="glass-button secondary" onClick={() => navigate('/games/torneo')}>Torneo online · 2–32</button><button className="glass-button secondary" onClick={() => navigate('/games/activas')}>Partidas activas e historial</button></div>
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

        </>}
        {roomError&&<p className="chess-room-error" role="alert">{roomError}</p>}
        <button type="button" className="gco-chess-cta" disabled={joining} onClick={()=>void startGame()}>
          {joining?'Conectando…':'Comenzar partida'}
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

        {setup.mode==='online'&&<button type="button" className="gco-chess-back-btn" onClick={()=>navigate('/games/activas')}>Partidas online e historial</button>}
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
