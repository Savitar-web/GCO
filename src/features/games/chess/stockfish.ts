import {Capacitor} from '@capacitor/core'
import {fromUci,toFen,stockfishLevel} from './uciPosition'
import type {GameState,LegalMove} from './chessEngine'
export type EngineFlavor='full'|'lite'
const base='/chess/stockfish-19.0.1/',cacheName='gco-stockfish-v19'
const script=(flavor:EngineFlavor)=>base+(flavor==='full'?'stockfish-19-single':'stockfish-19-lite-single')+'.js'
export async function prepareStockfish(flavor:EngineFlavor,onProgress?:(value:number)=>void,signal?:AbortSignal){
 if(Capacitor.isNativePlatform()){onProgress?.(100);return}
 const cache=await caches.open(cacheName)
 const files=[script(flavor),script(flavor).replace('.js','.wasm')]
 for(const file of files){
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
  if(await cache.match(file)){onProgress?.(file.endsWith('.wasm')?100:0);continue}
  const response=await fetch(file,{signal})
  if(!response.ok)throw Error('No se pudo preparar Stockfish. Conéctate una vez para guardarlo offline.')
  const stored=cache.put(file,response.clone()).then(()=>true,()=>false)
  const length=Number(response.headers.get('content-length'))||(flavor==='full'?99169054:1845971)
  if(file.endsWith('.wasm')&&response.body){const reader=response.body.getReader();let loaded=0;while(true){const result=await reader.read();if(result.done)break;loaded+=result.value.length;onProgress?.(Math.min(99,Math.round(loaded/length*100)))}}
  if(!await stored)throw Error('El motor está disponible, pero falta espacio para guardarlo sin conexión.')
 }
 onProgress?.(100)
}

class Engine {
 worker:Worker;ready:Promise<void>;tail:Promise<unknown>=Promise.resolve();listeners=new Set<(line:string)=>void>();failure:Error|null=null;disposed=false
 constructor(flavor:EngineFlavor){
  this.worker=new Worker(script(flavor),{type:'classic'})
  this.worker.onmessage=e=>{for(const line of String(e.data).trim().split('\n'))for(const listener of [...this.listeners])listener(line.trim())}
  this.worker.onerror=()=>{this.failure=new Error('La IA no pudo iniciarse en este dispositivo.');for(const listener of [...this.listeners])listener('__error__')}
  this.ready=this.init();void this.ready.catch(()=>{})
 }
 send(command:string){if(this.disposed)throw new Error('La sesión de análisis se reinició. Reintenta la jugada.');this.worker.postMessage(command)}
 wait(match:(line:string)=>boolean,timeout=45000,signal?:AbortSignal){
  return new Promise<string>((resolve,reject)=>{
   const stop=()=>{clearTimeout(timer);this.listeners.delete(receive);signal?.removeEventListener('abort',abort)}
   const receive=(line:string)=>{if(line==='__error__'){stop();reject(this.failure||new Error('La IA se interrumpió.'))}else if(match(line)){stop();resolve(line)}}
   const abort=()=>{stop();reject(new DOMException('Cancelado','AbortError'))}
   const timer=setTimeout(()=>{stop();reject(new Error('No se completó el análisis. Puedes reintentarlo sin perder la partida.'))},timeout)
   this.listeners.add(receive);signal?.addEventListener('abort',abort,{once:true})
   if(signal?.aborted)abort();else if(this.failure||this.disposed){stop();reject(this.failure||new Error('La IA se reinició.'))}
  })
 }
 async init(){const uci=this.wait(line=>line==='uciok',90000);this.send('uci');await uci;this.send('setoption name Hash value 32');this.send('setoption name Threads value 1');const ready=this.wait(line=>line==='readyok');this.send('isready');await ready}
 move(state:GameState,level:number,signal?:AbortSignal):Promise<LegalMove|null>{
  const work=this.tail.then(async()=>{
   if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
   await this.ready
   if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
   if(state.result)return null
   const options=stockfishLevel(level)
   this.send('setoption name Skill Level value '+options.skill);this.send('setoption name UCI_LimitStrength value false')
   this.send('position fen '+toFen(state))
   let candidate:LegalMove|null=null
   const capture=(line:string)=>{const pv=/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);if(pv){const move=fromUci(state,pv[1]);if(move)candidate=move}}
   this.listeners.add(capture)
   const response=this.wait(line=>line.startsWith('bestmove '),options.timeMs+4000,signal)
   const deadline=setTimeout(()=>{if(!this.disposed)this.send('stop')},options.timeMs+700)
   try{
    this.send('go movetime '+options.timeMs+(options.depth?' depth '+options.depth:''))
    const line=await response
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
    const uci=line.split(/\s+/)[1];if(uci==='(none)'||uci==='0000')return null
    const move=fromUci(state,uci);if(!move)throw new Error('La IA devolvió una jugada incompatible con la posición.');return move
   }catch(error){
    // A restarted worker cannot leak a late bestmove into the following request.
    this.dispose()
    if((error as Error).name!=='AbortError'&&candidate)return candidate
    throw error
   }finally{clearTimeout(deadline);this.listeners.delete(capture)}
  });this.tail=work.catch(()=>undefined);return work
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.worker.terminate();for(const listener of [...this.listeners])listener('__error__');this.listeners.clear()}
}
const engines=new Map<EngineFlavor,Engine>()
const unavailableEngines=new Set<EngineFlavor>()
export async function warmStockfish(flavor:EngineFlavor){let engine=engines.get(flavor);if(!engine||engine.disposed){engine=new Engine(flavor);engines.set(flavor,engine)}try{await engine.ready}catch(error){engine.dispose();if(engines.get(flavor)===engine)engines.delete(flavor);throw error}}
async function search(state:GameState,level:number,flavor:EngineFlavor,signal?:AbortSignal){
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
  let engine=engines.get(flavor);if(!engine||engine.disposed){engine=new Engine(flavor);engines.set(flavor,engine)}
  try{const move=await engine.move(state,level,signal);if(engine.disposed&&engines.get(flavor)===engine)engines.delete(flavor);return move}
  catch(error){if(engine.disposed||((error as Error).name!=='AbortError')){engine.dispose();if(engines.get(flavor)===engine)engines.delete(flavor)}if((error as Error).name==='AbortError'||attempt===1){if((error as Error).name!=='AbortError')unavailableEngines.add(flavor);throw error}}
 }
 return null
}

export async function stockfishMove(state:GameState,level:number,options:{engine?:EngineFlavor;signal?:AbortSignal;strict?:boolean;onFallback?:()=>void}={}){if(options.engine!=='lite'&&!options.strict&&unavailableEngines.has('full')){options.onFallback?.();return search(state,level,'lite',options.signal)}try{return await search(state,level,options.engine||'full',options.signal)}catch(error){if((error as Error).name==='AbortError'||options.strict||options.engine==='lite')throw error;options.onFallback?.();return search(state,level,'lite',options.signal)}}
