import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newFicha,fichaMove,simulateShot,FORMATIONS,validateFormation,validateDesign,defaultDesign,fichaAI} from '../src/features/games/fichacore/engine.ts'
const ready=(count=2)=>{let s=newFicha(count);for(let i=0;i<count;i++)s=fichaMove(s,i,{type:'continue'});return s}
test('Fichacore validates formations, designs and team ownership',()=>{
 for(const f of FORMATIONS)assert.equal(validateFormation(f.points).length,6)
 assert.throws(()=>validateFormation(FORMATIONS[0].points.map(p=>({...p,x:700}))))
 assert.throws(()=>validateDesign({...defaultDesign(0),drawing:[[{x:0,y:0}]]}))
 let s=ready(4);assert.deepEqual(s.discs.map(d=>d.owner),[0,0,0,2,2,2,1,1,1,3,3,3])
 assert.throws(()=>fichaMove(s,0,{type:'shoot',index:6,dx:50,dy:0}))
 assert.throws(()=>fichaMove(s,1,{type:'shoot',index:6,dx:50,dy:0}))
 for(const seat of [0,1,2,3]){assert.equal(s.turn,seat);s=fichaMove(s,seat,{type:'shoot',index:seat%2*6,dx:5,dy:0})}
 assert.equal(s.turn,0)
})
test('Fichacore physics is deterministic, bounded, and goals request new formations',()=>{
 const s=ready();s.discs[0]={...s.discs[0],x:850,y:300};s.ball={x:900,y:300};s.discs[6].y=100
 const a=simulateShot(s.discs,s.ball,0,180,0,true),b=simulateShot(s.discs,s.ball,0,180,0,true)
 assert.deepEqual(a,b);assert.equal(a.goal,0);assert.ok(a.frames.length)
 const n=fichaMove(s,0,{type:'shoot',index:0,dx:180,dy:0});assert.equal(n.phase,'goal');assert.deepEqual(n.score,[1,0]);assert.ok(n.ready.every(v=>!v));assert.equal(s.score[0],0)
 for(const p of [...n.discs,n.ball])assert.ok(Number.isFinite(p.x)&&p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=600)
})
test('Fichacore AI makes legal moves through multiple turns',()=>{let s=ready();for(let i=0;i<20&&!s.finished;i++){if(s.phase==='goal'){s=fichaMove(s,0,{type:'continue'});s=fichaMove(s,1,{type:'continue'})}s=fichaMove(s,s.turn,fichaAI(s));assert.equal(s.discs.length,12)}})
