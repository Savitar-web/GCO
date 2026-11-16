import {test} from 'node:test'
import assert from 'node:assert/strict'
import {logicPuzzle,toggleLights} from '../src/features/logica/juegos/logicPuzzles.ts'
test('200 light puzzles have a constructive solution and never start completed',()=>{for(let level=1;level<=200;level++){const p=logicPuzzle(level,'luces');assert.ok(p.board.some(Boolean));let b=p.board;for(const i of p.solution)b=toggleLights(b,p.n,i);assert.ok(b.every(x=>!x));assert.deepEqual(toggleLights(toggleLights(p.board,p.n,0),p.n,0),p.board)}})
test('200 sum puzzles have unique missing values and consistent row/column clues',()=>{for(let level=1;level<=200;level++){const p=logicPuzzle(level,'sumas');for(let r=0;r<p.n;r++){const row=p.board.slice(r*p.n,r*p.n+p.n);assert.equal(row.filter(x=>!x).length,1);assert.equal(p.rows[r]-row.reduce((a,b)=>a+b,0),p.solution[r*p.n+r]);assert.equal(p.cols[r],p.solution.filter((_,i)=>i%p.n===r).reduce((a,b)=>a+b,0))}}})
