import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newTres,tresMove,tresAI} from '../src/features/games/cards/tresEngine.ts'
import {newGameState,legalMoves,applyMove} from '../src/features/games/chess/chessEngine.ts'
import {matchText,replayText} from '../src/features/games/chess/matchStorage.ts'
test('Tres deals unique sized hands for 2 through 8 seats and validates teams',()=>{for(let count=2;count<=8;count++){const state=newTres(count);assert.equal(state.hands.length,count);assert.ok(state.hands.every(hand=>hand.length===7));assert.equal(state.deck.length+state.discard.length+count*7,108)}assert.throws(()=>newTres(3,true))})
test('Tres AI completes individual and team games with no lost cards',()=>{for(const [count,teams] of [[2,false],[4,true],[8,true],[8,false]]){let state=newTres(count,teams);for(let turn=0;turn<3000&&!state.finished;turn++)state=tresMove(state,state.turn,tresAI(state));assert.equal(state.finished,true);assert.equal(state.deck.length+state.discard.length+state.hands.flat().length,108)}})
test('Tres rejects out of turn and illegal wild colors',()=>{const state=newTres(2);assert.throws(()=>tresMove(state,1,{type:'draw'}));state.hands[0]=[{color:4,value:13}];assert.throws(()=>tresMove(state,0,{type:'play',index:0,color:4}));assert.throws(()=>tresMove(state,0,{type:'play',index:0,color:-1}))})
test('Chess text reconstructs each position without storing board snapshots',()=>{const state=newGameState();for(let turn=0;turn<8;turn++){const move=legalMoves(state,turn%2===0?1:6,Math.floor(turn/2))[0];applyMove(state,turn%2===0?1:6,Math.floor(turn/2),move)}const text=matchText(state);assert.deepEqual(replayText(text).board,state.board);assert.equal(replayText(text,3).history.length,3)})
