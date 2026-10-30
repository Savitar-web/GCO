import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BrainCircuit, Club, Crown, Layers, Users, RotateCcw, Copy } from 'lucide-react'
import { newCardGame, applyCardAction, cardAI, type CardState, type CardKind, type CardAction } from './cards/cardEngine'
import { CardTable } from './cards/CardTable'
import { roomRequest, type Room } from './online'
import { ChessBoard2D } from './chess/ChessBoard2D'
import { legalMoves, type GameState, type LegalMove } from './chess/chessEngine'
import type { Selection } from './chess/useChessGame'
import './chess/chess.css'
import { archiveMatch } from './chess/matchStorage'
import { OnlineClock } from './chess/OnlineClock'

import {GameCover} from './GameCover'
import {GameTutorial} from './GameTutorial'
import {GameEffects,SoundControl} from './GameEffects'
import {gameSound} from './gameSound'
import {PieceCustomizer} from './chess/PieceCustomizer'
import {usePieceStyles} from './chess/pieceStyles'
const Board3D=lazy(()=>import('./chess/ChessBoard3D').then(m=>({default:m.ChessBoard3D})))
const games = [
  { id: 'ajedrez', name: 'Ajedrez', icon: Crown, description: 'Estrategia en cada casilla. IA, tablero 3D y salas privadas.', rule: 'Selecciona tu pieza y el destino. Para enrocar, mueve el rey dos casillas; para capturar al paso, toca la casilla diagonal vacía inmediatamente después del avance doble del peón rival.' },
  { id: 'fichacore', name:'Fichacore', icon:Users, description:'Fútbol de seis fichas. Formaciones, pases, IA y equipos online.', rule:'Arrastra hacia atrás y suelta para tirar.' },
  { id: 'tres', name: 'Tres', icon: Layers, description: 'Colores, bloqueos y giros. De 2 a 8, individual o por equipos.', rule: 'Combina color o símbolo y vacía tu mano.' },
  { id: 'poker', name: 'Póker', icon: Club, description: 'Cinco cartas, un cambio y dos rondas de apuestas.', rule: 'Póker cerrado de 5 cartas. Ante de 2, cambio de hasta 3 cartas, dos rondas de apuestas con subidas de 4. Solo fichas de práctica, sin dinero. Gana la mejor mano.' },
  { id: 'solitario', name: 'Solitario', icon: Layers, description: 'Klondike de una carta, ayuda inteligente o mesa cooperativa.', rule: 'Alterna colores en orden descendente. Solo un Rey ocupa una columna vacía. Las bases suben de As a Rey por palo. Selecciona una carta y después la columna o base de destino. En línea ambos colaboran sobre la misma mesa.' },
  { id: '21', name: '21', icon: BrainCircuit, description: 'Calcula el riesgo. Acércate a 21 sin pasarte.', rule: 'As vale 1 u 11, figuras 10. Pide o plántate. La IA se planta en 17. En duelo ambos juegan su mano; gana quien más se acerca a 21 sin pasarse. Empate si ambos se pasan.' },
  { id: 'conquian', name: 'Conquián', icon: Club, description: 'Combina tríos y escaleras con la baraja de 40 cartas.', rule: 'Variante de robo libre: 10 cartas por persona; mesas grandes usan varias barajas de 40. Sin 8, 9 ni 10; J sigue al 7. Roba del mazo o descarte, baja tríos o escaleras del mismo palo y descarta una carta. Puedes extender tus combinaciones. Gana al bajar 11 cartas. Mazo agotado: empate.' },
] as const

export function GamesHub() { return <GamesHubContent /> }
function GamesHubContent() {
  return <main className="gco-hub"><Link className="gco-back" to="/"><ArrowLeft size={18} /> Inicio</Link><header className="gco-hub-hero"><span className="gco-eyebrow">GCO · Play room</span><h1>Una buena jugada<br /><em>empieza contigo.</em></h1><p>Entrena tu estrategia, prueba una mano y comparte la mesa.</p><span className="gco-pill"><Users size={16} /> Salas privadas · Sin apuestas reales</span></header><div className="gco-game-grid">{games.map((game, index) => <Link key={game.id} to={game.id === 'ajedrez' ? '/games/ajedrez/menu' : game.id === 'tres' ? '/games/tres' : game.id==='fichacore'?'/games/fichacore': `/games/mesa/${game.id}`} className="gco-game-tile"><span className="gco-game-index">0{index + 1}</span><GameCover kind={game.id}/><h2>{game.name}</h2><p>{game.description}</p><span>Entrar a la mesa ↗</span></Link>)}</div></main>
}

export function GameRoom() {
  const { kind: routeKind } = useParams()
  const game = games.find(item => item.id === routeKind) || games[1]
  const kind = game.id
  const [local, setLocal] = useState<CardState>(() => newCardGame(kind === 'ajedrez' || kind === 'tres' || kind==='fichacore' ? 'poker' : kind))
  const [mode, setMode] = useState<'ai' | 'online'>('ai')
  const [room, setRoom] = useState<Room | null>(null)
  const [code, setCode] = useState('')
  const [pace,setPace]=useState(new URLSearchParams(location.search).get('pace') || 'rapid')
  const [count,setCount]=useState(2)
  const [house,setHouse]=useState(false)
  const [visibility,setVisibility]=useState<'first-hidden'|'first-visible'>('first-hidden')
  const [pieceStyles,savePieceStyles]=usePieceStyles()
  const [view,setView]=useState('2d')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const locked = useRef(false)
  const recorded = useRef<string | null>(null)
  const [initialTime] = useState(() => Date.now())
  const started = useRef(initialTime)
  const roomCode = room?.code
  const seat = room?.seat || 0
  const cards = room ? room.state as CardState : local
  const chess = kind === 'ajedrez' && room ? room.state as GameState : null
  const finished = chess ? !!chess.result : cards.finished
  const cardWin = cards.outcomes?cards.outcomes[seat]==='win':cards.winners?.includes(seat) || cards.winner === seat
  const cardResult = cards.outcomes?.[seat]==='draw'?'Empate con Casa':cardWin ? '¡Victoria!' : cards.winners?.length ? 'Ganó otro participante' : cards.winner === null ? 'Empate' : 'Ganó otro participante'
  const tournamentCode = new URLSearchParams(location.search).get('torneo')
  useEffect(()=>{const code=new URLSearchParams(location.search).get('sala');if(code)void request({op:'get',code})},[])
  useEffect(()=>{
    if(!room)return
    const entries=JSON.parse(localStorage.getItem('gco:online-active')||'[]').filter((entry:{code:string})=>entry.code!==room.code)
    if(!finished)entries.push({code:room.code,kind:room.kind})
    else if(chess)archiveMatch(room.id,chess)
    localStorage.setItem('gco:online-active',JSON.stringify(entries))
  },[room,finished,chess])
  useEffect(() => {
    if (!roomCode || finished) return
    let active = true
    const timer = window.setInterval(() => {
      if (locked.current || document.hidden) return
      void roomRequest({ op: 'get', code: roomCode }).then(next => { if (active) setRoom(current => !current || next.revision >= current.revision ? next : current) }).catch(cause => { if (active) setError(cause.message) })
    }, 4000)
    return () => { active = false; clearInterval(timer) }
  }, [roomCode,finished])
  useEffect(() => {
    if (mode !== 'ai' || kind === 'ajedrez' || local.finished || local.turn !== 1 || kind === 'solitario') return
    const timer = window.setTimeout(() => setLocal(current => applyCardAction(current, 1, cardAI(current, 1))), 650)
    return () => clearTimeout(timer)
  }, [local, mode, kind])
  useEffect(() => {
    if (!finished) return
    const id = room?.id || String(started.current)
    if (recorded.current === id) return
    recorded.current = id
    const winner = chess ? chess.winner === null ? null : chess.winner === 'w' ? 0 : 1 : cards.winner
    try {
      const history = JSON.parse(localStorage.getItem('gco:table-history-v1') || '[]')
      if (!history.some((item: { id: string }) => item.id === id)) localStorage.setItem('gco:table-history-v1', JSON.stringify([{ id, kind, at: new Date().toISOString(), result: (chess ? winner === seat : cardWin) || kind === 'solitario' ? 'win' : winner === null && !cards.winners?.length ? 'draw' : 'loss', durationMs: Date.now() - started.current, mode }, ...history].slice(0, 500)))
      window.dispatchEvent(new Event('gco:progress'))
    } catch { queueMicrotask(() => setError('No se pudo guardar el resultado local; la partida sí terminó.')) }
  }, [finished, room, chess, cards.winner, kind, seat, mode])
  async function request(body: Record<string, unknown>) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      let next = await roomRequest({kind,pace,count,house,visibility,appearance:pieceStyles[room?.seat===1||body.op==='join'?'b':'w'],...body})
      if(next.kind==='ajedrez'&&!(next.state as GameState).result&&!(next.state as GameState).cosmetics?.[next.seat===0?'w':'b'])next=await roomRequest({op:'style',code:next.code,revision:next.revision,appearance:pieceStyles[next.seat===0?'w':'b']})
      setRoom(next); setMode('online'); setSelection(null)
      if (body.op === 'create' || body.op === 'join') { started.current = Date.now(); recorded.current = null }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error de conexión.') }
    finally { locked.current = false; setBusy(false) }
  }
  function move(action: CardAction) {
    gameSound()
    if (room) { void request({ op: 'move', code: room.code, revision: room.revision, action }); return }
    try { setLocal(applyCardAction(local, 0, action)); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Jugada inválida.') }
  }
  const enabled = !busy && !finished && !cards.abandoned?.includes(seat) && (room ? room.ready : mode === 'ai') && (kind === 'solitario' || (chess ? chess.turn === (seat === 0 ? 'w' : 'b') : cards.turn === seat))
  return <main className="gco-hub game-room"><Link to="/games" className="gco-back"><ArrowLeft size={18} /> Sala de juegos</Link><div className="gco-section-heading"><game.icon size={32} /><div><span className="gco-eyebrow">Tu próxima jugada</span><h1>{game.name}</h1></div></div>
    {tournamentCode&&<Link className="glass-button secondary" to="/games/torneo">Volver al cuadro del torneo</Link>}<details className="gco-surface"><summary>Cómo jugar</summary><p>{game.rule}</p></details>
    <div className="gco-actions"><GameTutorial kind={kind}/><SoundControl/>{kind==='ajedrez'&&<PieceCustomizer styles={{...pieceStyles,...chess?.cosmetics}} side={room?(seat===0?'w':'b'):undefined} onSave={next=>{savePieceStyles(next);if(room)void request({op:'style',code:room.code,revision:room.revision,appearance:next[seat===0?'w':'b']})}}/>}</div>{kind==='ajedrez'&&!room&&<label className="gco-surface room-field">Ritmo de la sala<select className="glass-input" value={pace} onChange={event=>setPace(event.target.value)}><option value="none">Sin tiempo</option><option value="bala">Bala · 1 minuto</option><option value="blitz">Blitz · 3 minutos</option><option value="blitz5">Blitz · 5 minutos</option><option value="rapid">Rápida · 10 minutos</option></select></label>}
    {chess&&<div className="gco-actions"><button className="glass-button secondary" onClick={()=>setView(view==='2d'?'3d':'2d')}>Vista {view==='2d'?'3D':'2D'}</button></div>}{chess && <OnlineClock state={chess} ready={!!room?.ready} />}
    {finished&&<div className={`game-result ${chess ? chess.winner===(seat===0?'w':'b')?'result-win':'result-loss' : (cards.winners?.includes(seat)||cards.winner===seat)?'result-win':cards.winner===null?'result-draw':'result-loss'}`} role="status"><span>{chess ? '♛' : (cards.winners?.includes(seat)||cards.winner===seat)?'✦':'♠'}</span><h2>{chess ? chess.winner===(seat===0?'w':'b')?'¡Victoria!':'Partida finalizada' : cardResult}</h2><p>Una nueva mano, una nueva oportunidad.</p></div>}
    {!room && <section className="gco-surface"><div className="gco-actions">{kind !== 'ajedrez' && <label className="game-switch"><span>Jugar en línea</span><input type="checkbox" role="switch" checked={mode==='online'} onChange={event=>setMode(event.target.checked?'online':'ai')}/></label>}<Link className="gco-text-button" to="/ajustes/perfil">Mi cuenta</Link></div>{kind==='21'&&<div className="gco-form"><label className="game-switch"><span>Modo Casa · tú repartes</span><input type="checkbox" role="switch" checked={house} onChange={e=>{setHouse(e.target.checked);if(e.target.checked&&count<2)setCount(2);if(mode==='ai')setLocal(newCardGame('21',2,{house:e.target.checked,visibility}))}}/></label>{house&&<label>Patrón inicial de reparto<select value={visibility} onChange={e=>{const value=e.target.value as typeof visibility;setVisibility(value);if(mode==='ai')setLocal(newCardGame('21',2,{house,visibility:value}))}}><option value="first-hidden">Primera oculta, las demás visibles</option><option value="first-visible">Primera visible, las demás ocultas</option></select><small>Solo tú eres Casa. Cada destinatario ve siempre su mano.</small></label>}</div>}{['21','conquian'].includes(kind)&&mode==='online'&&<label className="room-field">Jugadores en la sala<select value={count} onChange={event=>setCount(Number(event.target.value))}>{Array.from({length:10},(_,i)=><option key={i} value={i+1} disabled={house&&kind==='21'&&i===0}>{i+1}</option>)}</select><small>{kind==='conquian'?'Variante multibaraja de robo libre: una baraja de 40 por cada dos plazas.':'Duelo de puntos, sin banca: todos juegan su mano; se permiten victorias compartidas.'} Una plaza permite practicar en línea.</small></label>}{(mode === 'online' || kind === 'ajedrez') && <div className="gco-form"><p>Crea una sala y comparte el código con los participantes. La partida empieza al completarse las plazas.</p><button className="glass-button" disabled={busy} onClick={() => void request({ op: 'create', kind })}>Crear sala privada</button><label>Código de invitación<input className="glass-input" autoComplete="off" maxLength={10} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))} /></label><button className="glass-button secondary" disabled={busy || code.length !== 10} onClick={() => void request({ op: 'join', code })}>Unirme</button></div>}</section>}
    {room && <section className="gco-surface gco-actions"><strong>Sala {room.code}</strong><button className="glass-button secondary" onClick={() => void navigator.clipboard.writeText(room.code).then(() => setError('Código copiado.')).catch(() => setError(`Comparte este código: ${room.code}`))}><Copy size={16} /> Copiar</button><span>{room.ready ? `Eres el jugador ${seat + 1}` : `Esperando jugadores · ${room.joined ?? 1}/${room.capacity ?? 2}`}</span><button className="gco-text-button" disabled={busy} onClick={() => void request({ op: 'get', code: room.code })}>Actualizar</button></section>}
    {error && <p role="status" className="gco-callout">{error}</p>}
    {(room || (mode === 'ai' && kind !== 'ajedrez')) && <><GameEffects event={chess?{id:chess.history.length,type:'play',seat:chess.turn==='w'?1:0}:cards.event} finished={finished} won={chess?chess.winner===(seat===0?'w':'b'):!!cardWin}/><p className="game-status" aria-live="polite">{finished ? (chess ? chess.winner === null ? 'Tablas' : chess.winner === (seat === 0 ? 'w' : 'b') ? 'Ganaste' : 'Ganó tu rival' : `${cardResult} · ${cards.message}`) : !room?.ready && room ? 'Comparte el código para comenzar' : enabled ? (cards.house===seat?'Tu turno · Casa':'Tu turno') : cards.house!==undefined?cards.message:'Turno de tu rival'}</p>
      {chess ? view==='3d'?<Suspense fallback={<p>Cargando tablero 3D…</p>}><div className="online-board-3d"><Board3D state={chess} selection={selection} lastMove={chess.fullLog.at(-1)||null} orientation={seat===0?'w':'b'} skin="wood" showLegalHints cameraPreset="default" onSquareClick={(row,column)=>{if(!enabled)return;if(selection?.moves.some(move=>move.toR===row&&move.toC===column)){void request({op:'move',code:room!.code,revision:room!.revision,action:{fromR:selection.r,fromC:selection.c,toR:row,toC:column}});return}setSelection({r:row,c:column,moves:legalMoves(chess,row,column) as LegalMove[]})}}/></div></Suspense>:<ChessBoard2D state={chess} selection={selection} lastMove={chess.fullLog.at(-1) || null} orientation={seat === 0 ? 'w' : 'b'} skin="wood" showLegalHints onSquareClick={(row, column) => {
        if (!enabled) return
        if (selection?.moves.some(move => move.toR === row && move.toC === column)) { void request({ op: 'move', code: room!.code, revision: room!.revision, action: { fromR: selection.r, fromC: selection.c, toR: row, toC: column } }); return }
        setSelection({ r: row, c: column, moves: legalMoves(chess, row, column) as LegalMove[] })
      }} /> : <CardTable key={`${kind}-${room?.id || 'local'}`} state={cards} seat={seat} enabled={enabled} onAction={move} />}
      <div className="gco-actions">{!room && <><button className="glass-button secondary" onClick={() => { if (!finished && !window.confirm('¿Empezar otra partida? Se perderá solo la partida actual.')) return; setLocal(newCardGame(kind as CardKind,2,{house:kind==='21'&&house,visibility})); started.current = Date.now(); recorded.current = null }}><RotateCcw size={18} /> Nueva partida</button>{kind === 'solitario' && <button className="glass-button" disabled={finished} onClick={() => move(cardAI(local, 0))}>Ayuda: realizar una jugada</button>}</>}{room && !finished && <button className="glass-button secondary" disabled={busy || !room.ready} onClick={() => { if (window.confirm('¿Abandonar esta partida?')) void request({ op: 'resign', code: room.code, revision: room.revision }) }}>Rendirme</button>}{room && finished && <button className="glass-button" onClick={() => { setRoom(null); setMode('online'); setSelection(null) }}>Volver a salas</button>}</div>
    </>}
  </main>
}
