import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newCardGame,applyCardAction,cardAI,validMeld} from '../src/features/games/cards/cardEngine.ts'
import {newTres,tresMove} from '../src/features/games/cards/tresEngine.ts'
test('21 and Conquian support 1–10 seats without undefined or lost cards',()=>{
 for(const kind of ['21','conquian'])for(let count=1;count<=10;count++){
  let state=newCardGame(kind,count)
  const total=(kind==='21'?52*Math.ceil(count/4):40*Math.ceil(count/2))
  assert.equal(state.hands.length,count)
  assert.equal(state.hands.flat().length+state.deck.length+state.discard.length,total)
  for(let i=0;i<1500&&!state.finished;i++)state=applyCardAction(state,state.turn,cardAI(state,state.turn))
  assert.ok(state.finished,`${kind}, ${count} seats must terminate`)
  assert.equal(state.hands.flat().length+state.deck.length+state.discard.length+state.melds.flat(2).length,total)
 }
 assert.throws(()=>newCardGame('21',11));assert.throws(()=>newCardGame('conquian',0))
})
test('21 shared winners exclude busts and all ten seats receive a turn',()=>{
 let state=newCardGame('21',10)
 state.hands=Array.from({length:10},(_,i)=>[{rank:i<2?1:10,suit:0,up:true},{rank:10,suit:1,up:true}])
 for(let seat=0;seat<10;seat++){assert.equal(state.turn,seat);state=applyCardAction(state,seat,{type:'stand'})}
 assert.deepEqual(state.winners,[0,1]);assert.equal(state.winner,null)
})
test('Conquian rejects duplicate physical ranks in melds and empty nonwinning hands',()=>{
 const card=(rank,suit)=>({rank,suit,up:true})
 assert.equal(validMeld([card(4,0),card(4,0),card(4,1)]),false)
 const state=newCardGame('conquian',10);state.phase='discard';state.hands[0]=[card(1,0),card(2,0),card(3,0)]
 assert.throws(()=>applyCardAction(state,0,{type:'meld',indices:[0,1,2]}),/Conserva/)
})
function tres(value,count=4){const state=newTres(count);state.color=0;state.discard=[{color:0,value:1}];state.hands[0]=[{color:value>=13?4:0,value},{color:1,value:7}];return state}
test('Tres skip, reverse, +2 and +4 enforce turn and hand penalties',()=>{
 assert.equal(tresMove(tres(10),0,{type:'play',index:0}).turn,2)
 const reverse=tresMove(tres(11),0,{type:'play',index:0});assert.equal(reverse.direction,-1);assert.equal(reverse.turn,3)
 assert.equal(tresMove(tres(11,2),0,{type:'play',index:0}).turn,0)
 for(const [value,penalty] of [[12,2],[14,4]]){let next=tresMove(tres(value),0,{type:'play',index:0,color:2});assert.equal(next.pendingDraw,penalty);assert.equal(next.turn,1);next.hands[1]=[{color:3,value:7}];next=tresMove(next,1,{type:'draw'});assert.equal(next.hands[1].length,1+penalty);assert.equal(next.turn,2)}
 const illegal=tres(14);illegal.hands[0].push({color:0,value:9});assert.throws(()=>tresMove(illegal,0,{type:'play',index:0,color:1}))
})
test('Tres eats only without a valid card and continues until a playable card appears',()=>{
 assert.throws(()=>tresMove(tres(3),0,{type:'draw'}),/válida/)
 let state=tres(3);state.hands[0]=[{color:1,value:9}];state.deck=[{color:0,value:8},{color:2,value:8}];state=tresMove(state,0,{type:'draw'})
 assert.equal(state.hands[0].length,2);assert.throws(()=>tresMove(state,0,{type:'pass'}))
 state=tresMove(state,0,{type:'draw'});assert.equal(state.hands[0].length,3);assert.throws(()=>tresMove(state,0,{type:'draw'}));state=tresMove(state,0,{type:'play',index:2});assert.equal(state.turn,1)
})
