import { createClient } from 'npm:@supabase/supabase-js@2'
import { newCardGame, applyCardAction, leaveCardGame, type CardKind } from '../../../src/features/games/cards/cardEngine.ts'
import { newGameState, legalMoves, applyMove } from '../../../src/features/games/chess/chessEngine.ts'
import { newTres, tresMove } from '../../../src/features/games/cards/tresEngine.ts'
import {newFicha,fichaMove} from '../../../src/features/games/fichacore/engine.ts'
import { replayText } from '../../../src/features/games/chess/matchStorage.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
function appearance(value:any){if(!value)return undefined;if(!/^#[0-9a-f]{6}$/i.test(value.color)||!/^#[0-9a-f]{6}$/i.test(value.particleColor)||!['none','sparks','orbit'].includes(value.effect))throw new Error('Diseño de piezas inválido.');return {color:value.color,particleColor:value.particleColor,effect:value.effect}}
function visible(room: any, userId: string) {
  const state = structuredClone(room.state)
  const seat = room.players ? room.players.indexOf(userId) : room.host_id === userId ? 0 : 1
  if (room.kind === 'tres') {
    state.deck = state.deck.map(() => ({color:4,value:-1}))
    state.hands = state.hands.map((hand:any[], index:number) => index===seat || state.finished ? hand : hand.map(()=>({color:4,value:-1})))
  } else if (room.kind !== 'ajedrez' && room.kind!=='fichacore') {
    state.deck = state.deck.map(() => ({ rank: 0, suit: 0, up: false }))
    if (!state.finished) state.hands = state.hands.map((hand:any[],index:number)=>index===seat?hand:hand.map((card:any)=>state.house!==undefined&&card.public?card:{rank:0,suit:0,up:false}))
    state.columns = state.columns.map((column: any[]) => column.map(card => card.up ? card : { rank: 0, suit: 0, up: false }))
  }
  return { id: room.id, code: room.code, kind: room.kind, state, revision: room.revision, seat, ready: room.players?state.started:!!room.guest_id, joined:room.players?.length || (room.guest_id?2:1), capacity:state.count || state.hands?.length || 2 }
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    if (request.method !== 'POST') return new Response('{}', { status: 405, headers })
    const token = request.headers.get('Authorization')?.replace(/^Bearer /i, '')
    if (!token) return new Response(JSON.stringify({ error: 'Inicia sesión para jugar en línea.' }), { status: 401, headers })
    const { data: { user }, error: authError } = await database.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'La sesión ha caducado.' }), { status: 401, headers })
    const body = await request.json()
    await database.rpc('expire_games')
    if (['tournament_create','tournament_join','tournament_get'].includes(body.op)) {
      const seconds=({bala:60,blitz:180,blitz5:300,rapid:600} as any)[body.pace]||300
      const template:any=newGameState();template.displayName=typeof body.displayName==='string'?body.displayName.slice(0,32):'Jugador';if(body.pace!=='none')template.clockMs=[seconds*1000,seconds*1000];template.clockAt=Date.now()
      const {data,error}=await database.rpc('tournament_action',{actor:user.id,operation:body.op,invite:body.code||'',capacity:body.count||4,initial_state:template})
      if(error)throw new Error(error.message)
      return new Response(JSON.stringify(data),{headers})
    }
    if(body.op==='history') {
      const {data,error}=await database.from('game_text_history').select('id,code,kind,transcript,result,winner,created_at').contains('players',[user.id]).eq('kind','ajedrez').order('created_at',{ascending:false})
      if(error)throw error
      return new Response(JSON.stringify({history:data}),{headers})
    }
    if (body.op === 'create') {
      if (!['poker', 'solitario', '21', 'conquian', 'ajedrez','tres','fichacore'].includes(body.kind)) throw new Error('Juego inválido.')
      const { count } = await database.from('game_rooms').select('id', { count: 'exact', head: true }).eq('host_id', user.id).gte('created_at', new Date(Date.now() - 3600000).toISOString())
      if ((count || 0) >= 15) throw new Error('Has creado muchas salas. Reutiliza una o espera una hora.')
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
      const state:any = body.kind==='fichacore'?newFicha(body.count,body.target):body.kind==='tres'?newTres(body.count,!!body.teams):body.kind==='ajedrez'?newGameState():newCardGame(body.kind as CardKind, ['21','conquian'].includes(body.kind)?body.count??2:2,{house:body.kind==='21'&&body.house===true,visibility:body.visibility})
      if(['tres','21','conquian'].includes(body.kind))state.started=state.hands.length===1
      if(body.kind==='ajedrez') { const seconds=({bala:60,blitz:180,blitz5:300,rapid:600} as any)[body.pace]||600;if(body.pace!=='none')state.clockMs=[seconds*1000,seconds*1000];state.clockAt=Date.now();const style=appearance(body.appearance);if(style)state.cosmetics={w:style} }
      const { data, error } = await database.from('game_rooms').insert({ host_id: user.id, players:['tres','21','conquian','fichacore'].includes(body.kind)?[user.id]:null, seen:{[user.id]:Date.now()}, code, kind: body.kind, state }).select().single()
      if (error) throw error
      return new Response(JSON.stringify(visible(data, user.id)), { headers })
    }
    if (!/^[A-F0-9]{10}$/.test(body.code || '')) throw new Error('Código de sala inválido.')
    const { data: room, error } = await database.from('game_rooms').select().eq('code', body.code).single()
    if (error || !room) {
      const {data:archive}=await database.from('game_text_history').select().eq('code',body.code).contains('players',[user.id]).maybeSingle()
      if(!archive)throw new Error('La sala no existe.')
      const state:any=archive.kind==='ajedrez'?replayText(archive.transcript):JSON.parse(archive.transcript)
      if(archive.kind==='ajedrez'){state.result=archive.result;state.winner=archive.winner}
      return new Response(JSON.stringify({id:archive.id,code:archive.code,kind:archive.kind,state,revision:2147483647,seat:archive.players.indexOf(user.id),ready:true}),{headers})
    }
    if (body.op === 'join' && body.kind && body.kind !== room.kind) throw new Error(`Esta sala es de ${room.kind}. Abre ese juego para unirte.`)
    if(room.players && body.op==='join' && !room.players.includes(user.id)) {
      if(room.players.length>=(room.kind==='fichacore'?room.state.count:room.state.hands.length))throw new Error('La sala está llena.')
      const players=[...room.players,user.id];if(room.kind!=='fichacore')room.state.started=players.length===room.state.hands.length
      const seen=room.state.started?Object.fromEntries(players.map((id:string)=>[id,Date.now()])):{...room.seen,[user.id]:Date.now()}
      const {data,error}=await database.from('game_rooms').update({players,state:room.state,seen,revision:room.revision+1}).eq('id',room.id).eq('revision',room.revision).select().single()
      if(error)throw new Error('La sala cambió. Vuelve a intentar.')
      return new Response(JSON.stringify(visible(data,user.id)),{headers})
    }
    if (!room.players && body.op === 'join' && room.host_id !== user.id && !room.guest_id) {
      if(room.kind==='ajedrez'){room.state.clockAt=Date.now();const style=appearance(body.appearance);if(style)room.state.cosmetics={...room.state.cosmetics,b:style}}
      const { data, error } = await database.from('game_rooms').update({ guest_id: user.id, state:room.state,seen:{...room.seen,[user.id]:Date.now(),[room.host_id]:Date.now()},revision: room.revision + 1 }).eq('id', room.id).is('guest_id', null).eq('revision', room.revision).select().single()
      if (error) throw new Error('La sala cambió. Vuelve a intentarlo.')
      return new Response(JSON.stringify(visible(data, user.id)), { headers })
    }
    if (room.players ? !room.players.includes(user.id) : room.host_id !== user.id && room.guest_id !== user.id) throw new Error('No perteneces a esta sala.')
    await database.rpc('touch_game',{room_id:room.id,player_id:user.id})
    if(room.kind==='ajedrez' && room.guest_id && room.state.clockMs && !room.state.result) {
      const turn=room.state.turn==='w'?0:1
      room.state.clockMs[turn]=Math.max(0,room.state.clockMs[turn]-(Date.now()-room.state.clockAt))
      room.state.clockAt=Date.now()
      if(room.state.clockMs[turn]===0) {
        room.state.result='timeout';room.state.winner=turn===0?'b':'w'
        const {data:expired,error}=await database.from('game_rooms').update({state:room.state,revision:room.revision+1}).eq('id',room.id).eq('revision',room.revision).select().maybeSingle()
        if(error || !expired)throw new Error('La partida cambió; actualiza el tablero.')
        const archived=await database.rpc('archive_game',{room_id:room.id});if(archived.error)throw archived.error
        return new Response(JSON.stringify(visible(expired,user.id)),{headers})
      }
    }
    if(body.op==='style'){
      if(room.kind!=='ajedrez'||room.state.result)throw new Error('El diseño se aplica durante una partida de ajedrez.')
      const style=appearance(body.appearance);if(!style)throw new Error('Falta el diseño.')
      const side=room.host_id===user.id?'w':'b';room.state.cosmetics={...room.state.cosmetics,[side]:style}
      const {data,error}=await database.from('game_rooms').update({state:room.state,revision:room.revision+1}).eq('id',room.id).eq('revision',body.revision).select().single()
      if(error)throw new Error('La partida cambió: vuelve a guardar tu diseño.')
      return new Response(JSON.stringify(visible(data,user.id)),{headers})
    }
    if (body.op === 'move' || body.op === 'resign') {
      if (room.kind!=='fichacore' && (room.players?!room.state.started:!room.guest_id)) throw new Error('Espera a que se unan los jugadores.')
      if (body.revision !== room.revision) throw new Error('La partida cambió. Actualiza antes de jugar.')
      const seat = room.players?room.players.indexOf(user.id):room.host_id === user.id ? 0 : 1
      let next = room.state
      if (body.op === 'resign') {
        if (room.kind === 'ajedrez') { if (next.result) throw new Error('La partida terminó.'); next.result = 'resignation'; next.winner = seat === 0 ? 'b' : 'w' }
        else if(room.kind==='fichacore'){next.finished=true;next.phase='finished';next.winner=1-seat%2;next.message='El otro equipo se retiró.'}
        else if(room.kind==='tres') {next.finished=true;next.winner=null;next.message='Partida cancelada por retirada.'}
        else next=leaveCardGame(next,seat)
      } else if (room.kind === 'ajedrez') {
        const color = seat === 0 ? 'w' : 'b'
        if (next.result || next.turn !== color) throw new Error('No es tu turno.')
        const { fromR, fromC, toR, toC } = body.action || {}
        if (![fromR, fromC, toR, toC].every(value => Number.isInteger(value) && value >= 0 && value < 8)) throw new Error('Casilla inválida.')
        const move = legalMoves(next, fromR, fromC).find(move => move.toR === toR && move.toC === toC)
        if (!move) throw new Error('Movimiento ilegal.')
        applyMove(next, fromR, fromC, move)
      } else if(room.kind==='fichacore'){if(body.action?.type==='shoot'&&Date.now()<(next.readyAt||0))throw new Error('Espera a que termine el movimiento.');next=fichaMove(next,seat,body.action);if(body.action?.type==='shoot')next.readyAt=Date.now()+2400}
      else next = room.kind==='tres'?tresMove(next,seat,body.action):applyCardAction(next, seat, body.action)
      const { data, error } = await database.from('game_rooms').update({ state: next, revision: room.revision + 1, updated_at: new Date().toISOString() }).eq('id', room.id).eq('revision', room.revision).select().single()
      if (error) throw new Error('Se recibió otra jugada primero. Vuelve a intentar.')
      if(next.result || next.finished) { const {error}=await database.rpc('archive_game',{room_id:room.id});if(error)throw error }
      return new Response(JSON.stringify(visible(data, user.id)), { headers })
    }
    return new Response(JSON.stringify(visible(room, user.id)), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'No se pudo completar la jugada.' }), { status: 400, headers })
  }
})
