import { useEffect, useState } from 'react'
export function OnlineClock({ state, ready }: { state: { clockMs?: number[]; clockAt?: number; turn: string; result: unknown }; ready: boolean }) {
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[])
 if(!state.clockMs)return <p className="gco-pill">Sin tiempo · la reconexión sigue limitada a 5 minutos</p>
 return <div className="online-clocks gco-actions">{state.clockMs.map((milliseconds,index)=>{const active=ready&&!state.result&&index===(state.turn==='w'?0:1);const seconds=Math.max(0,Math.ceil((milliseconds-(active?Math.max(0,now-(state.clockAt||now)):0))/1000));return <strong className={active?'gco-pill current-seat':'gco-pill'} key={index}>{index===0?'Blancas':'Negras'} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong>})}</div>
}
