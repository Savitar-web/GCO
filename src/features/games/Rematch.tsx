import {RoundSettings} from './RoundSettings'
import {useNavigate} from 'react-router-dom'
import {useEffect,useRef,useState} from 'react'
import {roomRequest,type Room} from './online'
type Vote={accepted:number;total:number;acceptedByMe:boolean;room:Room|null}
export function Rematch({room,onReady}:{room:Room;onReady:(room:Room)=>void}){
 const [vote,setVote]=useState<Vote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const navigate=useNavigate()
 const ready=useRef(onReady);useEffect(()=>{ready.current=onReady},[onReady])
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const pending=useRef(false),done=useRef(false),queued=useRef(false)
 async function update(accept=false){if(done.current)return;if(pending.current){if(accept)queued.current=true;return;}pending.current=true;if(accept)setBusy(true);try{const next=await roomRequest({op:accept?'rematch':'rematch_status',code:room.code}) as unknown as Vote;if(!mounted.current)return;setVote(next);setError('');if(next.room){done.current=true;ready.current(next.room);const path=next.room.kind==='tres'?'/games/tres':next.room.kind==='fichacore'?'/games/fichacore':'/games/mesa/'+next.room.kind;navigate(path+'?sala='+next.room.code,{replace:true})}}catch(e){setError((e as Error).message)}finally{pending.current=false;if(mounted.current)setBusy(false);if(queued.current&&mounted.current){queued.current=false;void update(true)}}}
 useEffect(()=>{const first=setTimeout(()=>void update(),0);const timer=setInterval(()=>{if(!document.hidden)void update()},2500);return()=>{clearTimeout(first);clearInterval(timer)}},[room.code])
 return <section className="match-rematch" aria-label="Revancha"><RoundSettings room={room} onReady={next=>{done.current=true;ready.current(next)}}/><button className="glass-button" disabled={busy||vote?.acceptedByMe} onClick={()=>void update(true)}>{vote?.acceptedByMe?'Revancha solicitada':'Revancha'}</button><small role="status">{vote?.accepted?`${vote.accepted}/${vote.total} aceptaron · esperando al resto`:'Vuelve a jugar con los mismos participantes'}</small>{error&&<p role="alert">{error}</p>}</section>
}
