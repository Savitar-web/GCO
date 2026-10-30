import { useState, useEffect } from 'react'
import { supabase } from '@/core/cloud/supabase'
import { Link, useNavigate } from 'react-router-dom'
import { activeMatches, replayText } from './matchStorage'
import { ChessBoard2D } from './ChessBoard2D'

export function MatchCenter() {
  const navigate = useNavigate()
  const [text, setText] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [cloud,setCloud]=useState<{id:string;transcript:string;created_at:string}[]>([])
  useEffect(()=>{void supabase?.functions.invoke('game',{body:{op:'history'}}).then(({data})=>{if(data?.history)setCloud(data.history)})},[])
  const local: { id: string; text: string; at: number }[] = JSON.parse(localStorage.getItem('gco:chess-text-history') || '[]')
  const history=[...local,...cloud.filter(entry=>!local.some(item=>item.id===entry.id)).map(entry=>({id:entry.id,text:entry.transcript,at:new Date(entry.created_at).getTime()}))]
  return <main className="gco-hub"><Link to="/games/ajedrez/menu">← Ajedrez</Link><h1>Partidas activas</h1><p>Las partidas locales quedan en pausa al salir. Las salas en línea permiten volver durante 5 minutos.</p>{activeMatches().map(match => <section className="gco-surface" key={match.id}><h3>{match.setup.mode === 'ai' ? 'Contra IA' : 'Dos jugadores locales'} · {match.state.history.length} jugadas</h3><button className="glass-button" onClick={() => { sessionStorage.setItem('gco:resume-chess', match.id); navigate('/games/ajedrez', { state: { setup: match.setup } }) }}>Reanudar</button></section>)}{JSON.parse(localStorage.getItem('gco:online-active') || '[]').map((room: { code: string; kind: string }) => <Link key={room.code} className="glass-button secondary" to={`/games/mesa/${room.kind}?sala=${room.code}`}>Volver a sala {room.code}</Link>)}<h2>Historial de texto</h2>{history.map(entry => <button className="glass-button secondary" key={entry.id} onClick={() => { setText(entry.text); setStep(0) }}>{new Date(entry.at).toLocaleString()} · Ver partida</button>)}{text !== null && <section className="gco-surface"><ChessBoard2D state={replayText(text, step)} selection={null} lastMove={null} orientation="w" skin="wood" showLegalHints={false} onSquareClick={() => {}} /><input aria-label="Jugada del historial" type="range" min={0} max={text.split('\n').filter(Boolean).length} value={step} onChange={event => setStep(Number(event.target.value))} /><p>Jugada {step}</p><button className="glass-button secondary" onClick={() => setText(null)}>Cerrar revisión y liberar tablero</button></section>}</main>
}
