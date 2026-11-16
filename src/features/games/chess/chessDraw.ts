import type {Color,GameState} from './chessEngine.ts'
export function chessDrawAction(state:GameState,actor:Color,action:'offer_draw'|'accept_draw'|'decline_draw'):GameState{
 if(state.result)throw new Error('La partida terminó.')
 const next={...state}
 if(action==='offer_draw'){
  if(state.turn!==actor)throw new Error('Ofrece tablas durante tu turno.')
  if(state.drawOffer)throw new Error('Ya hay una oferta pendiente.')
  if(state.lastDrawOfferPly===state.fullLog.length)throw new Error('Espera a la siguiente jugada para volver a ofrecer tablas.')
  next.drawOffer=actor;next.lastDrawOfferPly=state.fullLog.length
 }else{
  if(!state.drawOffer||state.drawOffer===actor)throw new Error('No tienes una oferta del rival para responder.')
  delete next.drawOffer
  if(action==='accept_draw'){next.result='draw';next.winner=null}
 }
 return next
}
