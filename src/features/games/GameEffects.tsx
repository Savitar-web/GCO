import { useEffect, useRef, useState } from 'react'
import { soundCard, soundColor, soundFail, soundSuccess, unlockAudio } from '@/core/audio/uiSounds'
export function gameSound(kind:'card'|'color'|'win'|'loss'='card') {
  if(localStorage.getItem('gco:game-sound')==='off')return
  unlockAudio()
  if(kind==='color')soundColor(3);else if(kind==='win')soundSuccess();else if(kind==='loss')soundFail();else soundCard()
}
export function SoundControl(){const [on,setOn]=useState(()=>localStorage.getItem('gco:game-sound')!=='off');return <button className="glass-button secondary" aria-pressed={on} onClick={()=>{localStorage.setItem('gco:game-sound',on?'off':'on');setOn(!on);if(!on)gameSound()}}>Sonido: {on?'activado':'silenciado'}</button>}
export function GameEffects({event,finished,won}:{event?:{id:number;type:string;seat:number;to?:number;amount?:number};finished?:boolean;won?:boolean}){
 const last=useRef(event?.id);const ended=useRef(finished)
 useEffect(()=>{if(event&&event.id!==last.current){last.current=event.id;gameSound()}},[event])
 useEffect(()=>{if(finished&&!ended.current)gameSound(won?'win':'loss');ended.current=finished},[finished,won])
 if(!event)return null
 return <div key={event.id} className={`table-event event-${event.type}`} aria-live="polite"><span className="flying-card" aria-hidden>♠</span><span>{event.type==='deal'?`Casa → J${(event.to??0)+1}`:event.type==='draw'||event.type==='hit'?`J${event.seat+1} recibe ${event.amount||1} carta(s)`:event.type==='request'?`J${event.seat+1} pide carta a la Casa`:event.type==='ace'?`J${event.seat+1} eligió el valor del As`:`J${event.seat+1} juega`}</span></div>
}
