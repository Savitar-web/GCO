import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import {supabase} from '@/core/cloud/supabase'
import {roomRequest} from '../online'
import type {GameState,LegalMove} from './chessEngine'
import {stockfishMove,warmStockfish} from './stockfish'
import {toFen} from './uciPosition'
const key='gco:private-chess-permit'
function useAccess(active:boolean){const [allowed,setAllowed]=useState(false);useEffect(()=>{if(!active)return;let alive=true;async function check(){if(!alive)return;try{if(!navigator.onLine){const cached=JSON.parse(localStorage.getItem(key)||'null');if(alive)setAllowed(!!cached&&cached.until>Date.now());return}const {data:{session}}=await supabase!.auth.getSession();if(!session){if(alive)setAllowed(false);return}const response=await roomRequest({op:'capabilities'}) as unknown as {dantesco:boolean;until:number};if(!alive)return;setAllowed(response.dantesco);try{if(response.dantesco)localStorage.setItem(key,JSON.stringify({userId:session.user.id,until:response.until}));else localStorage.removeItem(key)}catch{/* Online authorization works even when Safari denies optional caching. */}}catch{if(alive)setAllowed(false)}}const initial=setTimeout(()=>{if(supabase)void check()},0);const {data}=supabase?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){try{localStorage.removeItem(key)}catch{/* Optional cache. */}setAllowed(false)}else setTimeout(()=>void check(),0)})||{data:undefined};return()=>{alive=false;clearTimeout(initial);data?.subscription.unsubscribe()}},[active]);return allowed}

export function privatePositionKey(state:GameState|null){return state ? toFen(state)+'|'+(state.result||'') : ''}
export function usePrivateChessTools(state:GameState|null,onMove:(move:LegalMove)=>void|Promise<void>,canMove:boolean){
 const allowed=useAccess(!!state)
 const [enabled,setEnabled]=useState(false),[mode,setMode]=useState<'manual'|'auto'>('manual'),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null),latest=useRef(state),commit=useRef(onMove),inFlight=useRef(false)
 const position=privatePositionKey(state),currentPosition=useRef(position),attempted=useRef('')
 useLayoutEffect(()=>{latest.current=state;commit.current=onMove;currentPosition.current=position})
 // Polling, clock updates, chat and draw offers must not restart a search.
 useEffect(()=>{controller.current?.abort();controller.current=null;inFlight.current=false;setBusy(false);attempted.current=''},[position])
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{if(allowed&&enabled)void warmStockfish('full').catch(()=>{})},[allowed,enabled])
 const toggle=()=>{controller.current?.abort();controller.current=null;inFlight.current=false;setBusy(false);setEnabled(v=>!v);setError('');attempted.current=''}
 const play=useCallback(async()=>{
  const snapshot=latest.current,key=privatePositionKey(snapshot)
  if(!allowed||!enabled||!snapshot||!canMove||snapshot.result||inFlight.current)return
  const c=new AbortController();controller.current=c;inFlight.current=true;setBusy(true);setError('')
  try{const move=await stockfishMove(snapshot,100,{engine:'full',strict:true,signal:c.signal});if(move&&!c.signal.aborted&&currentPosition.current===key)await commit.current(move)}
  catch(e){if((e as Error).name!=='AbortError'&&controller.current===c)setError((e as Error).message)}
  finally{if(controller.current===c){controller.current=null;inFlight.current=false;setBusy(false)}}
 },[allowed,enabled,canMove])
 const playRef=useRef(play);playRef.current=play
 useEffect(()=>{
  if(!allowed||!enabled||mode!=='auto'||!canMove||!state||state.result||attempted.current===position)return
  attempted.current=position
  const timer=setTimeout(()=>void playRef.current(),0)
  return()=>clearTimeout(timer)
 },[allowed,enabled,mode,canMove,position])
 return {allowed,enabled,mode,setMode,busy,error,toggle,play,canMove:canMove&&!state?.result}
}
