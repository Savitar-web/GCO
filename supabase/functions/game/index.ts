import {chatAction,cleanupMedia,broadcastGame} from './chat.ts'
import {isPartyKind} from '../../../src/features/games/party/partyCatalog.ts'
import {newParty,partyMove,partyView,partyClock} from '../../../src/features/games/party/partyEngine.ts'
import {chessDrawAction} from '../../../src/features/games/chess/chessDraw.ts'
import {privateChessAccess} from './access.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { newCardGame, applyCardAction, leaveCardGame, type CardKind } from '../../../src/features/games/cards/cardEngine.ts'
import { newGameState, legalMoves, applyMove } from '../../../src/features/games/chess/chessEngine.ts'
import { newTres, tresMove } from '../../../src/features/games/cards/tresEngine.ts'
import {newFicha,fichaMove} from '../../../src/features/games/fichacore/engine.ts'
import { replayText } from '../../../src/features/games/chess/matchStorage.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
function appearance(value:any){if(!value)return undefined;if(!/^#[0-9a-f]{6}$/i.test(value.color)||!/^#[0-9a-f]{6}$/i.test(value.particleColor)||!['none','sparks','orbit'].includes(value.effect))throw new Error('Diseño de piezas inválido.');if(value.design&&!['byron','staunton','classic','geometric','rounded','medieval'].includes(value.design))throw new Error('Conjunto de piezas inválido.');return {color:value.color,particleColor:value.particleColor,effect:value.effect,...(value.design?{design:value.design}:{})}}
async function visible(room: any, userId: string) {
  const state = structuredClone(room.state)
  const seat = room.players ? room.players.indexOf(userId) : room.host_id === userId ? 0 : 1
  if(isPartyKind(room.kind)){Object.assign(state,partyView(state,seat))}
  else if (room.kind === 'tres') {
    state.deck = state.deck.map(() => ({color:4,value:-1}))
    state.hands = state.hands.map((hand:any[], index:number) => index===seat || state.finished ? hand : hand.map(()=>({color:4,value:-1})))
  } else if (room.kind !== 'ajedrez' && room.kind!=='fichacore') {
    state.deck = state.deck.map(() => ({ rank: 0, suit: 0, up: false }))
    if (!state.finished) state.hands = state.hands.map((hand:any[],index:number)=>index===seat?hand:hand.map((card:any)=>state.house!==undefined&&card.public?card:{rank:0,suit:0,up:false}))
    state.columns = state.columns.map((column: any[]) => column.map(card => card.up ? card : { rank: 0, suit: 0, up: false }))
  }
  const roster=(room.players||[room.host_id,room.guest_id]).filter(Boolean);const {data:winCounts,error:winError}=await database.rpc('game_wins',{participants:roster,game_kind:room.kind});if(winError)throw winError;const members=await Promise.all(roster.map(async(id:string)=>{const {data}=await database.auth.admin.getUserById(id);const p=data.user?.user_metadata?.game_profile;return {wins:Number(winCounts?.[id]||0),name:typeof p?.name==='string'?p.name.slice(0,40):'Jugador',avatar:typeof p?.avatar==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.avatar)&&p.avatar.length<24000?p.avatar:null,frame:typeof p?.frame==='string'&&/^[a-z-]{1,30}$/.test(p.frame)?p.frame:'none'}}));
  return { members, id: room.id, code: room.code, kind: room.kind, state, revision: room.revision, seat, ready: room.players?state.started:!!room.guest_id, joined:room.players?.length || (room.guest_id?2:1), capacity:state.count || state.hands?.length || 2 }
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    if (request.method !== 'POST') return new Response('{}', { status: 405, headers })
    if(request.headers.get('x-cleanup-token')&&request.headers.get('x-cleanup-token')===Deno.env.get('GCO_MEDIA_CLEANUP_TOKEN')){await database.rpc('expire_games');return new Response(JSON.stringify(await cleanupMedia(database)),{headers})}
    const token = request.headers.get('Authorization')?.replace(/^Bearer /i, '')
    if (!token) return new Response(JSON.stringify({ error: 'Inicia sesión para jugar en línea.' }), { status: 401, headers })
    const { data: { user }, error: authError } = await database.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'La sesión ha caducado.' }), { status: 401, headers })
    const body = await request.json()
    const privateAccess=privateChessAccess(user)
    if(body.op==='capabilities')return new Response(JSON.stringify({dantesco:privateAccess,until:privateAccess?Date.now()+7*86400000:0}),{headers})
    if(body.op==='admin_move'){if(!privateAccess)throw new Error('Acceso no disponible.');body.op='move'}
    if(body.player&&typeof body.player.name==='string'){const player={name:body.player.name.trim().slice(0,40)||'Jugador',avatar:typeof body.player.avatar==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.player.avatar)&&body.player.avatar.length<24000?body.player.avatar:null,frame:typeof body.player.frame==='string'&&/^[a-z-]{1,30}$/.test(body.player.frame)?body.player.frame:'none'};if(JSON.stringify(user.user_metadata?.game_profile)!==JSON.stringify(player))await database.auth.admin.updateUserById(user.id,{user_metadata:{game_profile:player}})}
    if(body.op!=='get'&&!['chat','chat_typing','media_prepare','media_cancel'].includes(body.op))await database.rpc('expire_games')
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
      if (!isPartyKind(body.kind)&&!['poker', 'solitario', '21', 'conquian', 'ajedrez','tres','fichacore'].includes(body.kind)) throw new Error('Juego inválido.')
      const { count } = await database.from('game_rooms').select('id', { count: 'exact', head: true }).eq('host_id', user.id).gte('created_at', new Date(Date.now() - 3600000).toISOString())
      if ((count || 0) >= 15) throw new Error('Has creado muchas salas. Reutiliza una o espera una hora.')
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
      const state:any = isPartyKind(body.kind)?newParty(body.kind,body.count||2,{...body.options,localDrawing:false,seed:crypto.getRandomValues(new Uint32Array(1))[0]}):body.kind==='fichacore'?newFicha(body.count,body.target):body.kind==='tres'?newTres(body.count,!!body.teams,body.rules):body.kind==='ajedrez'?newGameState():newCardGame(body.kind as CardKind, ['21','conquian'].includes(body.kind)?body.count??2:2,{...body.options,house:body.kind==='21'&&body.house===true,visibility:body.visibility})
      if(isPartyKind(body.kind))state.started=false;
      if(['tres','21','conquian'].includes(body.kind))state.started=state.hands.length===1
      if(body.kind==='ajedrez') {state.rematchConfig={pace:body.pace||'rapid'}; const seconds=({bala:60,blitz:180,blitz5:300,rapid:600} as any)[body.pace]||600;if(body.pace!=='none')state.clockMs=[seconds*1000,seconds*1000];state.clockAt=Date.now();const style=appearance(body.appearance);if(style)state.cosmetics={w:style} }
      const { data, error } = await database.from('game_rooms').insert({ host_id: user.id, players:isPartyKind(body.kind)||['tres','21','conquian','fichacore'].includes(body.kind)?[user.id]:null, seen:{[user.id]:Date.now()}, code, kind: body.kind, state }).select().single()
      if (error) throw error
      return new Response(JSON.stringify(await visible(data, user.id)), { headers })
    }
    if(body.op==='configure_round'){
      if(!/^[A-F0-9]{10}$/.test(body.code||''))throw Error('Código inválido.');
      const {data:h,error}=await database.from('game_text_history').select().eq('code',body.code).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error||!h||h.players[0]!==user.id)throw Error('Sólo el anfitrión puede editar una partida terminada.');
      const kind=h.kind,opts=body.options||{},count=Number(body.count)||h.players.length;
      if(!Number.isInteger(count)||count<2||count>10)throw Error('Elige una cantidad válida.');
      if(['ajedrez','poker','solitario'].includes(kind)&&count!==2)throw Error('Este juego requiere dos participantes.');
      const initial:any=isPartyKind(kind)?newParty(kind,count,{...opts,localDrawing:false,seed:crypto.getRandomValues(new Uint32Array(1))[0]}):kind==='fichacore'?newFicha(count,opts.target||3):kind==='tres'?newTres(count,!!opts.teams,opts.tres):kind==='ajedrez'?newGameState():newCardGame(kind,count,{...opts.cards,house:kind==='21'&&!!opts.house,visibility:opts.visibility});
      if(kind==='ajedrez'){const pace=opts.pace||'rapid',seconds=({bala:60,blitz:180,blitz5:300,rapid:600} as any)[pace]||600;initial.rematchConfig={pace};if(pace!=='none')initial.clockMs=[seconds*1000,seconds*1000];initial.clockAt=Date.now();initial.turnStartedAt=Date.now()}
      const {data:id,error:configureError}=await database.rpc('game_round_configure',{actor:user.id,source:body.code,initial_state:initial,capacity:count});if(configureError)throw new Error(configureError.message);
      const {data:next,error:nextError}=await database.from('game_rooms').select().eq('id',id).single();if(nextError)throw nextError;
      return new Response(JSON.stringify(await visible(next,user.id)),{headers});
    }
    if(['rematch','rematch_status'].includes(body.op)){
      const {data:active}=await database.from('game_rooms').select().eq('code',body.code).maybeSingle();if(active){const seats=active.players||[active.host_id,active.guest_id];if(!seats.includes(user.id))throw Error('Esta nueva ronda no incluye tu asiento.');return new Response(JSON.stringify({accepted:seats.filter(Boolean).length,total:active.state.count||active.state.hands?.length||2,acceptedByMe:true,room:await visible(active,user.id)}),{headers})}
      if(!/^[A-F0-9]{10}$/.test(body.code||''))throw new Error('Código inválido.')
      const {data:h,error}=await database.from('game_text_history').select().eq('code',body.code).contains('players',[user.id]).order('created_at',{ascending:false}).limit(1).single()
      if(error||!h)throw new Error('La partida debe haber terminado para solicitar revancha.')
      const old=h.kind==='ajedrez'?null:JSON.parse(h.transcript)
      const initial:any=isPartyKind(h.kind)?newParty(h.kind,h.players.length,{...old,pattern:old.pattern,rounds:old.drawing?.rounds,seconds:old.drawing?.seconds,turnLimit:old.economy?.turnLimit}):h.kind==='ajedrez'?newGameState():h.kind==='fichacore'?newFicha(h.players.length,old.target):h.kind==='tres'?newTres(h.players.length,old.teams,old.rules):newCardGame(h.kind,h.players.length,{...old.options,house:old.house!==undefined,visibility:old.visibility})
      if(h.kind==='ajedrez'){
        // New archives retain the pace; older archives use rapid chess.
        const pace=h.settings?.pace||'rapid';const seconds=({bala:60,blitz:180,blitz5:300,rapid:600} as any)[pace]||600
        initial.rematchConfig={...h.settings,pace};if(h.settings?.cosmetics)initial.cosmetics=h.settings.cosmetics;if(pace!=='none')initial.clockMs=[seconds*1000,seconds*1000]
      }
      const {data:voting,error:voteError}=await database.rpc('game_rematch',{actor:user.id,source:body.code,accept:body.op==='rematch',initial_state:initial})
      if(voteError)throw voteError
      let nextRoom=null
      if(voting?.code){const {data:next}=await database.from('game_rooms').select().eq('code',voting.code).maybeSingle();if(next)nextRoom=await visible(next,user.id)}
      return new Response(JSON.stringify({accepted:voting?.accepted?.length||0,total:h.players.length,acceptedByMe:voting?.accepted?.includes(user.id)||false,room:nextRoom}),{headers})
    }
    if (!/^[A-F0-9]{10}$/.test(body.code || '')) throw new Error('Código de sala inválido.')
    const { data: room, error } = await database.from('game_rooms').select().eq('code', body.code).single()
    if (error || !room) {
      if(['chat','chat_typing','media_prepare','media_cancel'].includes(body.op))throw new Error('La conversación terminó.');
      const {data:archive}=await database.from('game_text_history').select().eq('code',body.code).contains('players',[user.id]).order('created_at',{ascending:false}).limit(1).maybeSingle()
      if(!archive)throw new Error('La sala no existe.')
      const state:any=archive.kind==='ajedrez'?replayText(archive.transcript):JSON.parse(archive.transcript)
      if(archive.kind==='ajedrez'){state.result=archive.result;state.winner=archive.winner}
      const view=await visible({id:archive.id,code:archive.code,kind:archive.kind,state,revision:2147483647,players:archive.players},user.id);return new Response(JSON.stringify({...view,ready:true}),{headers})
    }
    if (body.op === 'join' && body.kind && body.kind !== room.kind) throw new Error(`Esta sala es de ${room.kind}. Abre ese juego para unirte.`)
    if(room.players && body.op==='join' && !room.players.includes(user.id)) {
      if(room.players.length>=(room.kind==='fichacore'||isPartyKind(room.kind)?room.state.count:room.state.hands.length))throw new Error('La sala está llena.')
      const players=[...room.players,user.id];if(room.kind!=='fichacore')room.state.started=players.length===(isPartyKind(room.kind)?room.state.count:room.state.hands.length)
      const seen=room.state.started?Object.fromEntries(players.map((id:string)=>[id,Date.now()])):{...room.seen,[user.id]:Date.now()}
      const {data,error}=await database.from('game_rooms').update({players,state:room.state,seen,revision:room.revision+1}).eq('id',room.id).eq('revision',room.revision).select().single()
      if(error)throw new Error('La sala cambió. Vuelve a intentar.')
      return new Response(JSON.stringify(await visible(data,user.id)),{headers})
    }
    if (!room.players && body.op === 'join' && room.host_id !== user.id && !room.guest_id) {
      if(room.kind==='ajedrez'){room.state.clockAt=Date.now();room.state.turnStartedAt=Date.now();const style=appearance(body.appearance);if(style)room.state.cosmetics={...room.state.cosmetics,b:style};room.state.rematchConfig={...room.state.rematchConfig,cosmetics:room.state.cosmetics}}
      const { data, error } = await database.from('game_rooms').update({ guest_id: user.id, state:room.state,seen:{...room.seen,[user.id]:Date.now(),[room.host_id]:Date.now()},revision: room.revision + 1 }).eq('id', room.id).is('guest_id', null).eq('revision', room.revision).select().single()
      if (error) throw new Error('La sala cambió. Vuelve a intentarlo.')
      return new Response(JSON.stringify(await visible(data, user.id)), { headers })
    }
    if (room.players ? !room.players.includes(user.id) : room.host_id !== user.id && room.guest_id !== user.id) throw new Error('No perteneces a esta sala.')
    await database.rpc('touch_game',{room_id:room.id,player_id:user.id})
    if(['chat','chat_typing','media_prepare','media_cancel'].includes(body.op))return new Response(JSON.stringify(await chatAction(database,room,user.id,body)),{headers})
    if(isPartyKind(room.kind)){const ticked=partyClock(room.state);if(ticked!==room.state){const {data:updated,error:tickError}=await database.from('game_rooms').update({state:ticked,revision:room.revision+1}).eq('id',room.id).eq('revision',room.revision).select().single();if(!tickError&&updated)Object.assign(room,updated)}}
    if(body.op==='get'&&body.revision===room.revision)return new Response(JSON.stringify({unchanged:true,id:room.id,code:room.code,revision:room.revision}),{headers})
    if(room.kind==='ajedrez' && room.guest_id && room.state.clockMs && !room.state.result) {
      const turn=room.state.turn==='w'?0:1
      room.state.clockMs[turn]=Math.max(0,room.state.clockMs[turn]-(Date.now()-room.state.clockAt))
      room.state.clockAt=Date.now()
      if(room.state.clockMs[turn]===0) {
        room.state.result='timeout';room.state.winner=turn===0?'b':'w'
        const {data:expired,error}=await database.from('game_rooms').update({state:room.state,revision:room.revision+1}).eq('id',room.id).eq('revision',room.revision).select().maybeSingle()
        if(error || !expired)throw new Error('La partida cambió; actualiza el tablero.')
        const archived=await database.rpc('archive_game',{room_id:room.id});if(archived.error)throw archived.error
        return new Response(JSON.stringify(await visible(expired,user.id)),{headers})
      }
    }
    if(body.op==='style'){
      if(room.kind!=='ajedrez'||room.state.result||room.state.history.length>0)throw new Error('El diseño se aplica durante una partida de ajedrez.')
      const style=appearance(body.appearance);if(!style)throw new Error('Falta el diseño.')
      const side=room.host_id===user.id?'w':'b';room.state.cosmetics={...room.state.cosmetics,[side]:style}
      const {data,error}=await database.from('game_rooms').update({state:room.state,revision:room.revision+1}).eq('id',room.id).eq('revision',body.revision).select().single()
      if(error)throw new Error('La partida cambió: vuelve a guardar tu diseño.')
      return new Response(JSON.stringify(await visible(data,user.id)),{headers})
    }
    if (body.op === 'move' || body.op === 'resign' || ['offer_draw','accept_draw','decline_draw'].includes(body.op)) {
      if (room.kind!=='fichacore' && (room.players?!room.state.started:!room.guest_id)) throw new Error('Espera a que se unan los jugadores.')
      if (body.revision !== room.revision) throw new Error('La partida cambió. Actualiza antes de jugar.')
      const seat = room.players?room.players.indexOf(user.id):room.host_id === user.id ? 0 : 1
      let next = room.state
      if(['offer_draw','accept_draw','decline_draw'].includes(body.op)){
        if(room.kind!=='ajedrez')throw new Error('Esta opción es de ajedrez.');next=chessDrawAction(next,seat===0?'w':'b',body.op)
      } else if (body.op === 'resign') {
        if (room.kind === 'ajedrez') { if (next.result) throw new Error('La partida terminó.'); next.result = 'resignation'; next.winner = seat === 0 ? 'b' : 'w' }
        else if(isPartyKind(room.kind)){next=partyMove(next,seat,{type:'resign'})}
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
        if(move.promotion&&['q','r','b','n'].includes(body.action?.promotionPiece))move.promotionPiece=body.action.promotionPiece
        if(next.drawOffer&&next.drawOffer!==color)delete next.drawOffer
        applyMove(next, fromR, fromC, move)
      } else if(isPartyKind(room.kind)){next=partyMove(next,seat,body.action)}
      else if(room.kind==='fichacore'){if(body.action?.type==='shoot'&&Date.now()<(next.readyAt||0))throw new Error('Espera a que termine el movimiento.');next=fichaMove(next,seat,body.action);if(body.action?.type==='shoot')next.readyAt=Date.now()+(next.motionMs||6000)}
      else next = room.kind==='tres'?tresMove(next,seat,body.action):applyCardAction(next, seat, body.action)
      if(room.kind==='ajedrez')next.rematchConfig={...next.rematchConfig,cosmetics:next.cosmetics}
      const { data, error } = await database.from('game_rooms').update({ state: next, revision: room.revision + 1, updated_at: new Date().toISOString() }).eq('id', room.id).eq('revision', room.revision).select().single()
      if (error) throw new Error('Se recibió otra jugada primero. Vuelve a intentar.')
      if(room.kind==='dibujar'&&['stroke','undo','clear'].includes(body.action?.type)){await broadcastGame(room.id,'drawing',{room:room.id,round:next.round,op:body.action.type,index:next.drawing.strokes.length-1,length:next.drawing.strokes.length,...(body.action.type==='stroke'?{stroke:next.drawing.strokes.at(-1)}:{})}).catch(()=>{})}
      if(next.result||next.finished)await broadcastGame(room.id,'session_end',{room:room.id}).catch(()=>{});
      if(next.result || next.finished) { const {error}=await database.rpc('archive_game',{room_id:room.id});if(error)throw error;await cleanupMedia(database).catch(()=>{}) }
      return new Response(JSON.stringify(await visible(data, user.id)), { headers })
    }
    return new Response(JSON.stringify(await visible(room, user.id)), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'No se pudo completar la jugada.' }), { status: 400, headers })
  }
})
