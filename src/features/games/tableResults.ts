import {useEffect,useRef} from 'react'
type Result={id:string;kind:string;at:string;result:string;durationMs:number;mode?:string}
export function recordTableResult(entry:Result){
 const history:Result[]=JSON.parse(localStorage.getItem('gco:table-history-v1')||'[]');if(history.some(x=>x.id===entry.id))return
 const totals:Record<string,{attempts:number;wins:number;draws:number;time:number;last:string}>=JSON.parse(localStorage.getItem('gco:table-totals-v1')||'null')||{}
 const add=(e:Result)=>{const t=totals[e.kind]??{attempts:0,wins:0,draws:0,time:0,last:''};t.attempts++;t.wins+=Number(e.result==='win');t.draws+=Number(e.result==='draw');t.time+=Math.max(0,e.durationMs||0);t.last=e.at>t.last?e.at:t.last;totals[e.kind]=t}
 if(!localStorage.getItem('gco:table-totals-v1'))history.forEach(add)
 add(entry);localStorage.setItem('gco:table-totals-v1',JSON.stringify(totals));localStorage.setItem('gco:table-history-v1',JSON.stringify([entry,...history].slice(0,500)));window.dispatchEvent(new Event('gco:progress'))
}
export function useTableResult(kind:string,active:boolean,finished:boolean,won:boolean,draw:boolean,roomId?:string){
 const started=useRef(Date.now()),recorded=useRef(false)
 const previous=useRef({active:false,finished:false,roomId})
 useEffect(()=>{
  const before=previous.current
  if(active&&(!before.active||(before.finished&&!finished)||before.roomId!==roomId))started.current=Date.now()
  previous.current={active,finished,roomId}
  if(!active||!finished){recorded.current=false;return}
  if(recorded.current)return
  try{recordTableResult({id:roomId||`${kind}-${started.current}`,kind,at:new Date().toISOString(),result:won?'win':draw?'draw':'loss',durationMs:Date.now()-started.current});recorded.current=true}catch{/* Storage failure must not interrupt play. */}
 },[kind,active,finished,won,draw,roomId])
}
