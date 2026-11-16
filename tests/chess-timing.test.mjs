import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newGameState,cloneState,legalMoves,applyMove} from '../src/features/games/chess/chessEngine.ts'
test('Cloning a turn preserves elapsed time and keeps piece styles independent',()=>{const original=newGameState();original.turnStartedAt=Date.now()-2000;original.cosmetics={w:{color:'#ffffff',particleColor:'#123456',effect:'none'}};const state=cloneState(original);state.cosmetics.w.color='#cccccc';const move=legalMoves(state,1,0).find(m=>m.toR===3);applyMove(state,1,0,move);assert.ok(state.fullLog[0].timeSpentMs>=2000);assert.equal(original.fullLog.length,0);assert.equal(original.cosmetics.w.color,'#ffffff');assert.ok(state.turnStartedAt>original.turnStartedAt)})
