import test from 'node:test'
import assert from 'node:assert/strict'
import {indexedDB} from 'fake-indexeddb'
globalThis.indexedDB=indexedDB
const {rotateConnected,puzzleStore}=await import('../src/features/logica/juegos/rompecabezas/puzzleStorage.ts')

test('Connected pieces rotate about one centre and four turns restore positions',()=>{
 const pieces=[{id:'a',x:1,y:3,locked:false,rotation:0},{id:'b',x:2,y:3,locked:false,rotation:0},{id:'c',x:5,y:1,locked:true,rotation:0}]
 const groups={a:'pair',b:'pair'}
 let result=rotateConnected(pieces,groups,'a',40,60)
 assert.equal(result[0].rotation,90)
 assert.equal(result[1].rotation,90)
 assert.ok(Math.abs(result[0].x-result[1].x)<1e-9)
 assert.ok(Math.abs((result[1].y-result[0].y)*60-40)<1e-9)
 for(let i=0;i<3;i++)result=rotateConnected(result,groups,'a',40,60)
 for(let i=0;i<pieces.length;i++){
  assert.ok(Math.abs(result[i].x-pieces[i].x)<1e-9)
  assert.ok(Math.abs(result[i].y-pieces[i].y)<1e-9)
  assert.equal(result[i].rotation,0)
 }
 assert.deepEqual(rotateConnected(pieces,groups,'c',40,60),pieces)
})
test('Independent image records survive batches, metadata edits and reloads',async()=>{
 for(let i=0;i<35;i++)await puzzleStore('images','put',{id:String(i),src:'data:image/webp;base64,test',name:'Imagen '+i})
 await puzzleStore('images','put',{id:'5',src:'data:image/webp;base64,test',name:'Renombrada'})
 const all=await puzzleStore('images','all')
 assert.equal(all.length,35)
 assert.equal(all.find(image=>image.id==='5').name,'Renombrada')
 await puzzleStore('session','put',{pieces:[{id:'a',x:2}],elapsed:500},'active')
 assert.equal((await puzzleStore('session','get',undefined,'active')).elapsed,500)
})
