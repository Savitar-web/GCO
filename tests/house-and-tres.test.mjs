import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newCardGame,applyCardAction,blackjackValue,settleTwentyOne,leaveCardGame} from '../src/features/games/cards/cardEngine.ts'
import {newTres,tresMove} from '../src/features/games/cards/tresEngine.ts'
const card=(rank,suit=0)=>({rank,suit,up:true})
test('House alone deals, validates target, visibility and requests',()=>{
 let state=newCardGame('21',3,{house:true,visibility:'first-hidden'})
 assert.throws(()=>applyCardAction(state,1,{type:'deal',to:1}))
 for(let round=0;round<2;round++)for(let target=0;target<3;target++){state.deck.push(card(2));state=applyCardAction(state,0,{type:'deal',to:target});assert.equal(state.hands[target][round].public,round===1)}
 assert.equal(state.turn,1);assert.equal(state.phase,'play')
 state=applyCardAction(state,1,{type:'hit'});assert.equal(state.pendingSeat,1);assert.equal(state.turn,0)
 assert.throws(()=>applyCardAction(state,0,{type:'deal',to:2}))
 state=applyCardAction(state,0,{type:'deal',to:1,faceUp:false});assert.equal(state.turn,1);assert.equal(state.hands[1].at(-1).public,false)
})
test('House opposite pattern, natural blackjack and shared outcomes',()=>{
 let state=newCardGame('21',2,{house:true,visibility:'first-visible'});state=applyCardAction(state,0,{type:'deal',to:1});assert.equal(state.hands[1][0].public,true);state=applyCardAction(state,0,{type:'deal',to:1});assert.equal(state.hands[1][1].public,false)
 state=newCardGame('21',4,{house:true});state.hands=[[card(10),card(9)],[card(1),card(13)],[card(10),card(8)],[card(10),card(9)]];settleTwentyOne(state);assert.deepEqual(state.outcomes,['loss','win','loss','draw'])
 state.hands=[[card(1),card(13)],[card(7),card(7),card(7)],[card(1),card(13)],[card(10),card(9)]];settleTwentyOne(state);assert.deepEqual(state.outcomes,['win','loss','draw','loss'])
})
test('Ace choices are owned, explicitly valued, and can be corrected before standing',()=>{
 let state=newCardGame('21');state.hands[0]=[card(1),card(9),card(5)];assert.equal(blackjackValue(state.hands[0]),15)
 state=applyCardAction(state,0,{type:'ace',indices:[0],value:11});assert.equal(blackjackValue(state.hands[0]),25)
 assert.throws(()=>applyCardAction(state,1,{type:'ace',indices:[0],value:1}))
 state=applyCardAction(state,0,{type:'ace',indices:[0],value:1});assert.equal(blackjackValue(state.hands[0]),15);assert.equal(state.turn,0)
})
test('House exits cancel, waiting recipient exits do not strand the dealer',()=>{
 let state=newCardGame('21',3,{house:true});state.phase='await-deal';state.pendingSeat=1;state.turn=0
 state=leaveCardGame(state,1);assert.equal(state.pendingSeat,undefined);assert.equal(state.turn,2);assert.equal(state.phase,'draw')
 state=leaveCardGame(state,0);assert.equal(state.finished,true);assert.equal(state.winner,null)
})
test('Tres allows same-color +2 on +4, stacks six and rejects wrong-color +2',()=>{
 let state=newTres(3);state.color=0;state.hands[0]=[{color:4,value:14},{color:1,value:6}];state.hands[1]=[{color:2,value:12},{color:3,value:12},{color:1,value:9}];state.hands[2]=[{color:0,value:6}]
 state=tresMove(state,0,{type:'play',index:0,color:2});assert.equal(state.pendingDraw,4)
 assert.throws(()=>tresMove(state,1,{type:'play',index:1}));assert.throws(()=>tresMove(state,1,{type:'draw'}))
 state=tresMove(state,1,{type:'play',index:0});assert.equal(state.pendingDraw,6)
 state=tresMove(state,2,{type:'draw'});assert.equal(state.hands[2].length,7);assert.equal(state.pendingDraw,0);assert.equal(state.turn,0)
})
