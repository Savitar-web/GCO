import {test} from 'node:test'
import assert from 'node:assert/strict'
import {RoundGuard,advanceSequence} from '../src/core/roundGuard.ts'
import {clonePlain} from '../src/core/clonePlain.ts'
import {registerHooks} from 'node:module'
import {existsSync} from 'node:fs'
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.'))for(const suffix of ['.ts','/index.ts']){const url=new URL(specifier+suffix,context.parentURL);if(existsSync(url))return next(url.href,context)}throw error}}})
const {generateColorSequenceLevel,getColorsForCount}=await import('../src/features/memoria/juegos/generateLevel.ts')
test('Color sequences resolve at the exact last input and reject excess input',()=>{let input=[];for(const color of ['red','blue','red']){const step=advanceSequence(['red','blue','red'],input,color);input=step.input;assert.equal(step.result,input.length===3?'success':'input')}assert.equal(advanceSequence(['red','blue','red'],input,'red').result,'closed');assert.equal(advanceSequence(['red'],[],'blue').result,'fail')})
test('Multiple result events award once; a fresh round can award again',()=>{const guard=new RoundGuard();assert.equal(guard.finish(),true);for(let i=0;i<20;i++)assert.equal(guard.finish(),false);guard.reset();assert.equal(guard.finish(),true)})
test('Every generated sequence is bounded and uses visible palette colors',()=>{for(const count of [4,6,9,12])for(const level of [1,5,20,100,1000]){const data=generateColorSequenceLevel(level,count);assert.ok(data.sequence.length>0&&data.sequence.length<=40);const colors=new Set(getColorsForCount(count).map(c=>c.id));assert.ok(data.sequence.every(c=>colors.has(c)));assert.ok(data.showTimeMs>=180)}})
test('Snapshots remain independent without structuredClone (older Safari)',()=>{const original=globalThis.structuredClone;try{globalThis.structuredClone=undefined;const saved={board:[[{type:'p',color:'w'}]],hands:[[1,2]]};const clone=clonePlain(saved);clone.board[0][0].type='q';clone.hands[0].pop();assert.equal(saved.board[0][0].type,'p');assert.equal(saved.hands[0].length,2)}finally{globalThis.structuredClone=original}})
