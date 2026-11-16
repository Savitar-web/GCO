import {test} from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/features/logica/juegos/despejes/DespejesGame.tsx',import.meta.url),'utf8').split('import React,')[0]
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const engine=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
test('Maze campaign stays within readable board dimensions and includes push puzzles',()=>{let rocks=0;for(let level=1;level<=30;level++){const p=engine.generateLaberintoLevel(level);assert.ok(p.rows<=19);assert.ok(p.rows>=7);for(const b of p.boulders){if(b.kind==='boulder'){rocks++;const dr=b.holeRow-b.row,dc=b.holeCol-b.col;const dir=dr===1?'down':dr===-1?'up':dc===1?'right':'left';const result=engine.laberintoStep(p,p.boulders,{row:b.row-dr,col:b.col-dc},dir);assert.ok(result.pushed)}}}assert.ok(rocks>0)})
