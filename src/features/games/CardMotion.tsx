import type {CSSProperties,ReactNode} from 'react'
export function CardMotion({deck,event,seat,hands,discard}:{discard?:ReactNode;deck:number;event?:{id:number;type:string;seat:number;to?:number;amount?:number};seat:number;hands:number[]}){
 const receiving=event&&['draw','hit','deal','exchange'].includes(event.type)
 const target=event?.to??event?.seat??seat
 const angle=((target-seat+hands.length)%hands.length)/hands.length*Math.PI*2+Math.PI/2
 const style={'--travel-x':`${Math.cos(angle)*140}px`,'--travel-y':`${Math.sin(angle)*105}px`} as CSSProperties
 return <div className="card-motion-table" aria-label={`Mazo boca abajo: ${deck} cartas`}>
 <div className="physical-deck" style={{'--deck-height':`${deck>0?Math.max(1,deck*.14):0}px`} as CSSProperties}><span>✦</span><small>{deck}</small></div>{discard?<div className="motion-discard">{discard}</div>:<div className="discard-outline" aria-hidden>♠</div>}
 <div className="opening-deal" aria-hidden>{Array.from({length:Math.min(56,hands.reduce((a,b)=>a+b,0))},(_,i)=><i key={i} style={{'--i':i,'--travel-x':`${Math.cos(i%hands.length/hands.length*Math.PI*2)*140}px`,'--travel-y':`${Math.sin(i%hands.length/hands.length*Math.PI*2)*90}px`} as CSSProperties}>✦</i>)}</div>
 {event&&<div key={event.id} className={`card-flight ${receiving?'receiving':'playing'}`} style={style} aria-hidden>{Array.from({length:Math.min(12,event.amount||1)},(_,i)=><i key={i} style={{animationDelay:`${i*95}ms`}}>✦</i>)}</div>}
 </div>
}
