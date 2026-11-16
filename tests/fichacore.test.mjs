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
test('A fast ball transfers momentum to a teammate and remains controlled on the next turn',()=>{let s=ready();s.discs=s.discs.map((d,i)=>({...d,x:80+i*70,y:100}));s.discs[0]={...s.discs[0],x:100,y:300};s.discs[1]={...s.discs[1],x:280,y:300};s.ball={x:150,y:300};const result=simulateShot(s.discs,s.ball,0,180,0,true);assert.equal(result.pass,true);assert.equal(result.receiver,1);assert.ok(result.discs[1].x>280);assert.ok(Math.hypot(result.ball.x-result.discs[1].x,result.ball.y-result.discs[1].y)<40);s=fichaMove(s,0,{type:'shoot',index:0,dx:180,dy:0});assert.equal(s.turn,0);assert.equal(s.lastPass,true);assert.ok(s.motionMs<=3600)});
test('The host breaks court-vote ties and high power has a visibly stronger impulse',()=>{let s=newFicha();s=fichaMove(s,0,{type:'continue',court:'night'});s=fichaMove(s,1,{type:'continue',court:'classic'});assert.equal(s.court,'night');const a=simulateShot(s.discs,s.ball,1,25,0,true),b=simulateShot(s.discs,s.ball,1,180,0,true);assert.ok(Math.hypot(b.frames[1][1].x-s.discs[1].x,b.frames[1][1].y-s.discs[1].y)>Math.hypot(a.frames[1][1].x-s.discs[1].x,a.frames[1][1].y-s.discs[1].y)*10)});
