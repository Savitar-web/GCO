export type Card = { suit: number; rank: number; up: boolean; public?:boolean; aceValue?:1|11 }
export type CardKind = 'poker' | 'solitario' | '21' | 'conquian'
export type CardAction = { type: string; indices?: number[]; from?: number; to?: number; value?:1|11; faceUp?:boolean }
export type CardState = {
  kind: CardKind; deck: Card[]; hands: Card[][]; turn: number; phase: string
  discard: Card[]; melds: Card[][][]; columns: Card[][]; foundations: Card[][]
  winner: number | null; finished: boolean; message: string; stood: boolean[]
  chips: number[]; bets: number[]; pot: number; actions: number; round: number
  winners?: number[]; started?: boolean; abandoned?: number[]
  house?:number; visibility?:'first-hidden'|'first-visible'; pendingSeat?:number; outcomes?:('win'|'loss'|'draw')[]
  event?:{id:number;type:string;seat:number;to?:number;amount?:number}
}
export const SUITS = ['♠', '♥', '♣', '♦']
export function cardName(card: Card) { return `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[card.rank] || card.rank}${SUITS[card.suit]}` }
export function shuffle(kind: CardKind): Card[] {
  const deck = Array.from({ length: 52 }, (_, index) => ({ suit: Math.floor(index / 13), rank: index % 13 + 1, up: true })).filter(card => kind !== 'conquian' || ![8, 9, 10].includes(card.rank))
  for (let index = deck.length - 1; index > 0; index--) {
    const buffer = new Uint32Array(1)
    const ceiling = Math.floor(4294967296 / (index + 1)) * (index + 1)
    do { crypto.getRandomValues(buffer) } while (buffer[0] >= ceiling)
    const other = buffer[0] % (index + 1)
    ;[deck[index], deck[other]] = [deck[other], deck[index]]
  }
  return deck
}
export function newCardGame(kind: CardKind, players = 2, options:{house?:boolean;visibility?:'first-hidden'|'first-visible'}={}): CardState {
  if (!Number.isInteger(players) || players < 1 || players > 10 || (!['21', 'conquian'].includes(kind) && players !== 2)) throw new Error('Elige entre 1 y 10 jugadores para esta mesa.')
  const state: CardState = { kind, deck: shuffle(kind), hands: [[], []], turn: 0, phase: kind === 'poker' ? 'bet' : 'draw', discard: [], melds: [[], []], columns: [], foundations: [[], [], [], []], winner: null, finished: false, message: 'Tu turno', stood: [false, false], chips: [98, 98], bets: [0, 0], pot: 4, actions: 0, round: 0 }
  if (kind === 'solitario') {
    state.columns = Array.from({ length: 7 }, (_, column) => Array.from({ length: column + 1 }, (_, index) => ({ ...state.deck.pop()!, up: index === column })))
  } else {
    const count = kind === 'poker' ? 5 : kind === '21' ? 2 : 10
    // Large tables use independent shuffled packs; a standard 40-card deck cannot deal ten hands.
    const packs = kind === 'conquian' ? Math.ceil(players / 2) : kind === '21' ? Math.ceil(players / 4) : 1
    for (let pack = 1; pack < packs; pack++) state.deck.push(...shuffle(kind))
    for (let i = state.deck.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]] }
    state.hands = Array.from({length: players}, () => Array.from({ length: count }, () => state.deck.pop()!))
    state.melds = Array.from({length: players}, () => [])
    state.stood = Array(players).fill(false)
    if (kind === 'conquian') state.discard.push(state.deck.pop()!)
  }
  if(options.house){
    if(kind!=='21'||players<2)throw new Error('Casa requiere 21 y al menos dos participantes.')
    state.deck.push(...state.hands.flat());state.hands=Array.from({length:players},()=>[])
    state.house=0;state.visibility=options.visibility==='first-visible'?'first-visible':'first-hidden';state.phase='deal';state.message='La Casa reparte dos cartas a cada participante, incluida su mano.'
  }
  return state
}
export function blackjackValue(cards: Card[]) {
  let total = cards.reduce((sum, card) => sum + (card.rank === 1 ? card.aceValue??11 : Math.min(card.rank, 10)), 0)
  let aces = cards.filter(card => card.rank === 1 && card.aceValue===undefined).length
  while (total > 21 && aces-- > 0) total -= 10
  return total
}
export function pokerRank(cards: Card[]): number[] {
  const ranks = cards.map(card => card.rank === 1 ? 14 : card.rank).sort((first, second) => second - first)
  const groups = [...new Set(ranks)].map(rank => [ranks.filter(value => value === rank).length, rank]).sort((first, second) => second[0] - first[0] || second[1] - first[1])
  const flush = cards.every(card => card.suit === cards[0].suit)
  const straight = new Set(ranks).size === 5 && (ranks[0] - ranks[4] === 4 || ranks.join(',') === '14,5,4,3,2')
  const high = ranks.join(',') === '14,5,4,3,2' ? 5 : ranks[0]
  if (straight && flush) return [8, high]
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]]
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]]
  if (flush) return [5, ...ranks]
  if (straight) return [4, high]
  if (groups[0][0] === 3) return [3, ...groups.map(group => group[1])]
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...groups.map(group => group[1])]
  if (groups[0][0] === 2) return [1, ...groups.map(group => group[1])]
  return [0, ...ranks]
}
export const POKER_NAMES = ['Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color']
export function validMeld(cards: Card[]) {
  if (cards.length < 3) return false
  if (cards.length <= 4 && cards.every(card => card.rank === cards[0].rank) && new Set(cards.map(card => card.suit)).size === cards.length) return true
  const ranks = cards.map(card => card.rank > 10 ? card.rank - 3 : card.rank).sort((first, second) => first - second)
  return cards.every(card => card.suit === cards[0].suit) && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1)
}
function finish(state: CardState, winner: number | null, message: string) {
  state.finished = true; state.winner = winner; state.message = message
  if (state.kind === 'poker') {
    if (winner === null) { state.chips[0] += state.pot / 2; state.chips[1] += state.pot / 2 }
    else state.chips[winner] += state.pot
    state.pot = 0
  }
}
export function settleTwentyOne(state: CardState) {
  if(state.house!==undefined){
    const house=state.house;const bank=blackjackValue(state.hands[house]);const bankNatural=bank===21&&state.hands[house].length===2
    state.outcomes=state.hands.map((hand,index)=>{
      if(state.abandoned?.includes(index))return 'loss'
      const points=blackjackValue(hand);const natural=points===21&&hand.length===2
      if(points>21)return 'loss'
      if(bank>21)return 'win'
      if(natural!==bankNatural)return natural?'win':'loss'
      return points>bank?'win':points===bank?'draw':'loss'
    })
    const others=state.outcomes.filter((_,index)=>index!==house)
    state.outcomes[house]=others.includes('win')?'loss':others.includes('loss')?'win':'draw'
    state.winners=state.outcomes.flatMap((outcome,index)=>outcome==='win'?[index]:[])
    finish(state,state.winners.length===1?state.winners[0]:null,'Cada mano se compara contra la Casa. Un 21 de dos cartas vence a un 21 de más cartas.');return
  }
  const values = state.hands.map((hand,index) => state.abandoned?.includes(index) ? -1 : blackjackValue(hand)).map(value=>value>21?-1:value)
  const best = Math.max(...values)
  state.winners = values.flatMap((value,index)=>value===best && best>=0 ? [index] : [])
  finish(state,state.winners.length===1?state.winners[0]:null,`Puntos: ${state.hands.map((hand,index)=>`J${index+1}: ${state.abandoned?.includes(index)?'retirado':blackjackValue(hand)}`).join(' · ')}${best<0?' · Ninguna mano válida':state.winners.length>1?' · Victoria compartida':''}`)
}
export function leaveCardGame(previous: CardState, seat: number): CardState {
  if(previous.finished || previous.abandoned?.includes(seat)) throw new Error('Ya no participas en esta partida.')
  const state=structuredClone(previous)
  state.abandoned=[...(state.abandoned||[]),seat]
  if(state.house===seat){finish(state,null,'La Casa se retiró: mesa cancelada.');return state}
  if(state.house!==undefined&&state.pendingSeat===seat){delete state.pendingSeat;state.phase='play';state.turn=seat}
  const remaining=state.hands.map((_,i)=>i).filter(i=>!state.abandoned!.includes(i))
  if(remaining.length<=1){finish(state,remaining[0]??null,'Partida finalizada por retirada.');return state}
  if(state.kind==='21'){state.stood[seat]=true;if(state.stood.every(Boolean)){settleTwentyOne(state);return state}}
  if(state.turn===seat){state.turn=(seat+1)%state.hands.length;while(state.abandoned.includes(state.turn)||state.kind==='21'&&state.stood[state.turn])state.turn=(state.turn+1)%state.hands.length;state.phase='draw'}
  state.message=`Jugador ${seat+1} se retiró. La mesa continúa.`
  return state
}
function resolvePoker(state: CardState) {
  const first = pokerRank(state.hands[0]); const second = pokerRank(state.hands[1])
  let comparison = 0
  for (let index = 0; index < Math.max(first.length, second.length); index++) { comparison = (first[index] || 0) - (second[index] || 0); if (comparison) break }
  finish(state, comparison === 0 ? null : comparison > 0 ? 0 : 1, `${POKER_NAMES[first[0]]} frente a ${POKER_NAMES[second[0]]}`)
}
export function applyCardAction(previous: CardState, seat: number, action: CardAction): CardState {
  if (previous.finished) throw new Error('La partida ya terminó.')
  if (previous.abandoned?.includes(seat)) throw new Error('Ya te retiraste de esta mesa.')
  if (previous.kind !== 'solitario' && seat !== previous.turn) throw new Error('Espera tu turno.')
  const state: CardState = structuredClone(previous)
  state.event={id:(state.event?.id||0)+1,type:action.type,seat,to:action.to,amount:1}
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.hands.length) throw new Error('Asiento inválido.')
  let opponent = (seat + 1) % state.hands.length
  while (state.abandoned?.includes(opponent) && opponent !== seat) opponent = (opponent + 1) % state.hands.length
  const indices = action.indices || []
  if (state.kind !== 'solitario' && (new Set(indices).size !== indices.length || indices.some(index => !Number.isInteger(index) || index < 0 || index >= state.hands[seat].length))) throw new Error('Selección de cartas inválida.')
  if (state.kind === '21') {
    const advance=()=>{if(state.stood.every(Boolean))settleTwentyOne(state);else {state.turn=(seat+1)%state.hands.length;while(state.stood[state.turn])state.turn=(state.turn+1)%state.hands.length}}
    if(action.type==='ace'){
      const card=state.hands[seat][indices[0]]
      if(!card||card.rank!==1||![1,11].includes(action.value!))throw new Error('Elige un As propio y su valor: 1 u 11.')
      if(state.phase==='deal'||state.phase==='await-deal')throw new Error('Espera al reparto para elegir el valor.')
      card.aceValue=action.value;state.message=`As elegido: ${action.value}. Tu mano: ${blackjackValue(state.hands[seat])}.`;return state
    }
    if(state.house!==undefined&&(state.phase==='deal'||state.phase==='await-deal')){
      if(seat!==state.house||action.type!=='deal'||!Number.isInteger(action.to)||action.to!<0||action.to!>=state.hands.length||state.abandoned?.includes(action.to!))throw new Error('Solo la Casa puede repartir a un asiento disponible.')
      const target=action.to!
      if(state.phase==='deal'?state.hands[target].length>=2:target!==state.pendingSeat)throw new Error('Este asiento no espera una carta.')
      const card=state.deck.pop();if(!card)throw new Error('El mazo está vacío.')
      card.public=typeof action.faceUp==='boolean'?action.faceUp:state.visibility==='first-visible'?state.hands[target].length===0:state.hands[target].length!==0
      state.hands[target].push(card)
      if(state.phase==='deal'){
        if(state.hands.every((hand,index)=>hand.length===2||state.abandoned?.includes(index))){state.phase='play';state.turn=1;while(state.abandoned?.includes(state.turn))state.turn=(state.turn+1)%state.hands.length}
      }else{state.phase='play';state.turn=target;delete state.pendingSeat}
      state.message=`Casa entrega una carta a J${target+1}. ${card.public?'Visible para todos.':'Solo su dueño puede verla.'}`;return state
    }
    if (!['hit', 'stand'].includes(action.type)) throw new Error('Acción inválida.')
    if (action.type === 'hit') {
      if(blackjackValue(state.hands[seat])>=21)throw new Error('Ya tienes 21 o más: ajusta un As o plántate.')
      if(state.house!==undefined&&seat!==state.house){state.pendingSeat=seat;state.turn=state.house;state.phase='await-deal';state.event.type='request';state.message=`J${seat+1} pide una carta. La Casa debe enviársela.`;return state}
      if (!state.deck.length) throw new Error('No quedan cartas; debes plantarte.')
      const card=state.deck.pop()!;if(state.house!==undefined)card.public=true;state.hands[seat].push(card)
      if (blackjackValue(state.hands[seat]) >= 21 && !state.hands[seat].some(c=>c.rank===1)) state.stood[seat] = true
    } else state.stood[seat] = true
    if (state.stood[seat]) advance()
    if (state.stood.every(Boolean)) {
      settleTwentyOne(state)
    }
  } else if (state.kind === 'poker') {
    if (action.type === 'fold') { finish(state, opponent, 'Retirada. La otra mano gana el bote.'); return state }
    if (state.phase === 'exchange') {
      if (action.type !== 'exchange' || indices.length > 3) throw new Error('Puedes cambiar entre cero y tres cartas.')
      for (const index of indices) state.hands[seat][index] = state.deck.pop()!
      state.actions++
      state.turn = opponent
      if (state.actions === 2) { state.phase = 'bet'; state.round = 1; state.actions = 0; state.bets = [0, 0]; state.turn = 0 }
    } else {
      if (!['call', 'raise'].includes(action.type)) throw new Error('Iguala, pasa, sube o retírate.')
      const owed = Math.max(...state.bets) - state.bets[seat]
      const cost = owed + (action.type === 'raise' ? 4 : 0)
      if (cost > state.chips[seat] || (action.type === 'raise' && state.actions >= 4)) throw new Error('No puedes subir más en esta ronda.')
      state.chips[seat] -= cost; state.bets[seat] += cost; state.pot += cost; state.actions++; state.turn = opponent
      if (state.actions >= 2 && state.bets[0] === state.bets[1]) {
        if (state.round === 1) resolvePoker(state)
        else { state.phase = 'exchange'; state.actions = 0; state.turn = 0 }
      }
    }
  } else if (state.kind === 'conquian') {
    if (action.type === 'draw' && state.phase === 'draw') {
      if (!state.deck.length) { finish(state, null, 'Mazo agotado: empate.'); return state }
      state.hands[seat].push(state.deck.pop()!); state.phase = 'discard'
    } else if (action.type === 'take' && state.phase === 'draw' && state.discard.length) {
      state.hands[seat].push(state.discard.pop()!); state.phase = 'discard'
    } else if (action.type === 'meld' && state.phase === 'discard') {
      const chosen = indices.map(index => state.hands[seat][index])
      const existing = action.to === undefined ? [] : state.melds[seat][action.to]
      if (!existing || !chosen.length || !validMeld([...existing, ...chosen])) throw new Error('Forma un trío o una escalera del mismo palo (7 sigue con J).')
      if (chosen.length === state.hands[seat].length && state.melds[seat].flat().length + chosen.length < 11) throw new Error('Conserva una carta para descartar hasta completar once combinadas.')
      if (action.to === undefined) state.melds[seat].push(chosen)
      else state.melds[seat][action.to] = [...existing, ...chosen]
      state.hands[seat] = state.hands[seat].filter((_, index) => !indices.includes(index))
      if (state.melds[seat].flat().length >= 11) finish(state, seat, '¡Once cartas combinadas!')
    } else if (action.type === 'discard' && state.phase === 'discard' && indices.length === 1) {
      state.discard.push(state.hands[seat].splice(indices[0], 1)[0]); state.turn = opponent; state.phase = 'draw'
    } else throw new Error('Roba, forma combinaciones y descarta una carta.')
  } else {
    if (action.type === 'draw') {
      if (state.deck.length) state.discard.push({ ...state.deck.pop()!, up: true })
      else if (state.discard.length) state.deck = state.discard.splice(0).reverse()
      else throw new Error('No quedan cartas en el mazo.')
    } else if (action.type === 'move') {
      const source = action.from === -1 ? state.discard : state.columns[action.from ?? -2]
      const start = indices[0] ?? (source?.length || 0) - 1
      if (!source || start < 0 || start >= source.length || !source[start].up || (action.from === -1 && start !== source.length - 1)) throw new Error('Selecciona una carta visible.')
      const cards = source.slice(start)
      if (!cards.every((card, index) => index === 0 || (card.up && cards[index - 1].rank === card.rank + 1 && cards[index - 1].suit % 2 !== card.suit % 2))) throw new Error('La secuencia debe alternar colores y descender.')
      const targetIndex = action.to ?? -1
      if (targetIndex >= 7 && targetIndex <= 10) {
        const foundation = state.foundations[targetIndex - 7]
        if (cards.length !== 1 || cards[0].suit !== targetIndex - 7 || cards[0].rank !== foundation.length + 1) throw new Error('La base empieza por As y sube por palo.')
        foundation.push(...source.splice(start))
      } else {
        const target = state.columns[targetIndex]
        if (!target || action.from === targetIndex) throw new Error('Elige otra columna.')
        const top = target.at(-1)
        if (top ? top.suit % 2 === cards[0].suit % 2 || top.rank !== cards[0].rank + 1 : cards[0].rank !== 13) throw new Error('Alterna colores; solo un Rey puede ocupar una columna vacía.')
        target.push(...source.splice(start))
      }
      if (source.length) source[source.length - 1].up = true
      if (state.foundations.flat().length === 52) finish(state, 0, '¡Solitario completado!')
    } else throw new Error('Acción inválida.')
  }
  if (!state.finished) state.message = state.kind === 'solitario' ? 'Construye las cuatro bases de As a Rey.' : `Turno del jugador ${state.turn + 1}`
  return state
}
export function cardAI(state: CardState, seat: number): CardAction {
  if (state.kind === '21') return { type: blackjackValue(state.hands[seat]) < 17 ? 'hit' : 'stand' }
  if (state.kind === 'poker') {
    if (state.phase === 'exchange') {
      const indices = state.hands[seat].map((card, index) => state.hands[seat].filter(other => other.rank === card.rank).length === 1 ? index : -1).filter(index => index >= 0)
      return { type: 'exchange', indices: pokerRank(state.hands[seat])[0] >= 4 ? [] : indices.slice(0, 3) }
    }
    return { type: pokerRank(state.hands[seat])[0] >= 2 && state.actions < 2 ? 'raise' : 'call' }
  }
  if (state.kind === 'conquian') {
    if (state.phase === 'draw') return { type: 'draw' }
    const hand = state.hands[seat]
    for (let first = 0; first < hand.length; first++) {
      for (let target = 0; target < state.melds[seat].length; target++) if ((hand.length>1||state.melds[seat].flat().length+1>=11)&&validMeld([...state.melds[seat][target], hand[first]])) return { type: 'meld', indices: [first], to: target }
      for (let second = first + 1; second < hand.length; second++) for (let third = second + 1; third < hand.length; third++) if ((hand.length>3||state.melds[seat].flat().length+3>=11)&&validMeld([hand[first], hand[second], hand[third]])) return { type: 'meld', indices: [first, second, third] }
    }
    const scores = hand.map(card => hand.filter(other => other !== card && (other.rank === card.rank || (other.suit === card.suit && Math.abs(other.rank - card.rank) <= 2))).length)
    return { type: 'discard', indices: [scores.indexOf(Math.min(...scores))] }
  }
  const sources = [-1, 0, 1, 2, 3, 4, 5, 6]
  for (const from of sources) {
    const source = from === -1 ? state.discard : state.columns[from]
    if (!source.length) continue
    const top = source.at(-1)!
    if (top.rank === state.foundations[top.suit].length + 1) return { type: 'move', from, to: 7 + top.suit, indices: [source.length - 1] }
  }
  for (const from of sources) {
    const source = from === -1 ? state.discard : state.columns[from]
    for (let index = 0; index < source.length; index++) {
      if (!source[index].up || (from === -1 && index !== source.length - 1)) continue
      for (let target = 0; target < 7; target++) {
        if (from === target || (index === 0 && !state.columns[target].length)) continue
        const action = { type: 'move', from, to: target, indices: [index] }
        try { applyCardAction(state, 0, action); return action } catch { continue }
      }
    }
  }
  return { type: 'draw' }
}
