function openPuzzleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open('gco-puzzle-library',1)
    request.onupgradeneeded=()=>{request.result.createObjectStore('images',{keyPath:'id'});request.result.createObjectStore('session')}
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
}
export async function puzzleStore<T>(store:'images'|'session',action:'all'|'get'|'put'|'delete',value?:unknown,key?:string):Promise<T>{
 const db=await openPuzzleDatabase()
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(store,action==='get'||action==='all'?'readonly':'readwrite'),table=tx.objectStore(store)
  const request=action==='all'?table.getAll():action==='get'?table.get(key!):action==='delete'?table.delete(key!):store==='images'?table.put(value):table.put(value,key!)
  let result:T
  request.onsuccess=()=>{result=request.result as T}
  tx.oncomplete=()=>resolve(result)
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
 })}finally{db.close()}
}
export function rotateConnected<T extends {id:string;x:number;y:number;locked:boolean;rotation:number}>(
 pieces:T[],groups:Record<string,string>,id:string,cellW:number,cellH:number,
):T[]{
 const selected=pieces.find(piece=>piece.id===id)
 if(!selected||selected.locked)return pieces
 const members=pieces.filter(piece=>piece.id===id||!!groups[id]&&groups[piece.id]===groups[id])
 if(members.some(piece=>piece.locked))return pieces
 const cx=members.reduce((sum,piece)=>sum+(piece.x+.5)*cellW,0)/members.length
 const cy=members.reduce((sum,piece)=>sum+(piece.y+.5)*cellH,0)/members.length
 const ids=new Set(members.map(piece=>piece.id))
 return pieces.map(piece=>{
  if(!ids.has(piece.id))return piece
  const x=(piece.x+.5)*cellW-cx,y=(piece.y+.5)*cellH-cy
  return {...piece,x:(cx-y)/cellW-.5,y:(cy+x)/cellH-.5,rotation:(piece.rotation+90)%360}
 })
}
