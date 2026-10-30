export type TresCard = { color: number; value: number }
export type TresState = { hands: TresCard[][]; deck: TresCard[]; discard: TresCard[]; color: number; turn: number; direction: number; drawn: boolean; started: boolean; finished: boolean; winner: number | null; teams: boolean; message: string; pendingDraw?: number; event?: {id:number;type:string;seat:number;amount?:number} }
export type TresAction = { type: 'play' | 'draw' | 'pass'; index?: number; color?: number }
export function newTres(count: number, teams = false): TresState {
  if (!Number.isInteger(count) || count < 2 || count > 8 || (teams && ![4,8].includes(count))) throw new Error('Elige entre 2 y 8 jugadores, o equipos de 4 u 8.')
  const deck: TresCard[] = []
  for (let color=0;color<4;color++) { deck.push({color,value:0}); for(let value=1;value<=12;value++) deck.push({color,value},{color,value}) }
  for(let index=0;index<4;index++) deck.push({color:4,value:13},{color:4,value:14})
  for(let index=deck.length-1;index>0;index--) { const random = crypto.getRandomValues(new Uint32Array(1))[0] % (index+1); [deck[index],deck[random]]=[deck[random],deck[index]] }
  const hands=Array.from({length:count},()=>deck.splice(0,7))
  const first=deck.findIndex(card=>card.value<10); const discard=deck.splice(first,1)
  return {hands,deck,discard,color:discard[0].color,turn:0,direction:1,drawn:false,started:true,finished:false,winner:null,teams,message:'Combina color o símbolo.'}
}
export function canPlayTres(state: TresState, seat: number, card: TresCard) {
  if(card.value===14 && state.hands[seat].some(other=>other.color===state.color)) return false
  if(state.pendingDraw) return card.value===14 || card.value===12 && (state.discard.at(-1)!.value===12 || card.color===state.color)
  return card.color===4 || card.color===state.color || card.value===state.discard.at(-1)!.value
}
export function tresMove(previous: TresState, seat: number, action: TresAction): TresState {
  if(previous.finished || !previous.started || previous.turn!==seat) throw new Error('Espera tu turno.')
  const state=structuredClone(previous); const count=state.hands.length
  const next=(offset=1)=>(seat+state.direction*offset+count*4)%count
  function draw(target: number, amount: number) {
    for(let index=0;index<amount;index++) {
      if(!state.deck.length) { const top=state.discard.pop()!; state.deck=state.discard.splice(0); state.discard=[top]; for(let position=state.deck.length-1;position>0;position--) { const other=crypto.getRandomValues(new Uint32Array(1))[0]%(position+1); [state.deck[position],state.deck[other]]=[state.deck[other],state.deck[position]] } }
      if(state.deck.length) state.hands[target].push(state.deck.pop()!)
    }
  }
  if(action.type==='draw') {
    if(state.hands[seat].some(card=>canPlayTres(state,seat,card))) throw new Error('Tienes una carta válida: juégala antes de comer.')
    const amount=state.pendingDraw||1; const before=state.hands[seat].length
    draw(seat,amount);state.drawn=true
    state.event={id:(state.event?.id||0)+1,type:'draw',seat,amount:state.hands[seat].length-before}
    if(state.pendingDraw){state.pendingDraw=0;state.turn=next();state.drawn=false;state.message=`J${seat+1} come ${amount} y pierde turno.`}
    else state.message=state.hands[seat].some(card=>canPlayTres(state,seat,card))?'Ya tienes una carta válida: puedes jugarla.':state.deck.length||state.discard.length>1?'Sin coincidencia: sigue comiendo.':'No quedan cartas disponibles. Puedes pasar.'
    return state
  }
  if(action.type==='pass') { if(state.deck.length || state.discard.length>1 || state.hands[seat].some(card=>canPlayTres(state,seat,card))) throw new Error('Debes jugar o seguir comiendo.'); state.turn=next(); state.drawn=false; state.message=`Turno del jugador ${state.turn+1}`; return state }
  if(action.type!=='play' || !Number.isInteger(action.index)) throw new Error('Acción inválida.')
  const card=state.hands[seat][action.index ?? -1]
  if(!card || !canPlayTres(state,seat,card)) throw new Error('Esa carta no coincide con el color o símbolo.')
  if(card.color===4 && (!Number.isInteger(action.color) || action.color!<0 || action.color!>3)) throw new Error('Elige un color.')
  state.hands[seat].splice(action.index!,1); state.discard.push(card); state.color=card.color===4?action.color!:card.color; state.drawn=false
  state.event={id:(state.event?.id||0)+1,type:'play',seat}
  let skip=1
  if(card.value===10) skip=2
  if(card.value===11) { state.direction*=-1; if(count===2) skip=2 }
  if(card.value===12 || card.value===14) state.pendingDraw=(state.pendingDraw||0)+(card.value===12?2:4)
  state.turn=next(skip)
  if(!state.hands[seat].length) { state.finished=true; state.winner=seat; state.message=state.teams?`¡Ganó el equipo ${seat%2+1}!`:`¡Ganó el jugador ${seat+1}!` }
  else { const effect=state.pendingDraw?`Penalización acumulada: ${state.pendingDraw}. Responde con un + válido o come. `:card.value===10?'Bloqueo: el siguiente jugador pierde su turno. ':card.value===11?'Reversa: cambia el sentido. ':card.value===13?'Nuevo color. ':'';state.message=effect+(state.hands[seat].length===1?'¡Tres! Última carta. ': '')+`Turno del jugador ${state.turn+1}` }
  return state
}
export function tresAI(state: TresState): TresAction {
  const index=state.hands[state.turn].findIndex(card=>canPlayTres(state,state.turn,card))
  const colors=[0,1,2,3].sort((first,second)=>state.hands[state.turn].filter(card=>card.color===second).length-state.hands[state.turn].filter(card=>card.color===first).length)
  return index>=0?{type:'play',index,color:colors[0]}:{type:!state.deck.length&&state.discard.length<=1?'pass':'draw'}
}
