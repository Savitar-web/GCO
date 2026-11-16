import {fichaAI,type FichaState} from './engine'
const worker=self as unknown as {onmessage:((event:MessageEvent<FichaState>)=>void)|null;postMessage:(message:unknown)=>void}
worker.onmessage=event=>{try{worker.postMessage({action:fichaAI(event.data)})}catch(error){worker.postMessage({error:(error as Error).message})}}
