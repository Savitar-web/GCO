import {useEffect,useRef} from 'react'
import {gameSound} from '../gameSound'
import {TRES_COLORS} from './tresColors'
export function ColorChoice({onChoose,onCancel}:{onChoose:(color:number)=>void;onCancel:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{ref.current?.showModal();gameSound('color')},[])
 return <dialog ref={ref} className="game-modal color-modal" onCancel={onCancel} aria-labelledby="wild-title"><h2 id="wild-title">Elige el nuevo color</h2><p>Tu comodín se jugará al confirmar un color.</p><div className="color-choices">{TRES_COLORS.map((name,index)=><button key={name} className={`tres-color-${index}`} onClick={()=>onChoose(index)}>{name}</button>)}</div><button className="glass-button secondary" onClick={onCancel}>Cancelar</button></dialog>
}
