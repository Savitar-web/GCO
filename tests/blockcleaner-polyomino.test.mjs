import {test} from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
import {polyominoPath} from '../src/features/logica/juegos/BlockCleaner/polyominoPath.ts'
const source=readFileSync(new URL('../src/features/logica/juegos/BlockCleaner/BlockCleaner.tsx',import.meta.url),'utf8').split("import { useCallback")[0].replace(/^import .*$/gm,'')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {computeSlideRangeOnAxis,canPlace,buildOccupancy}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const l={id:'L',color:'blue',row:0,col:0,w:2,h:3,mask:[[0,0],[1,0],[2,0],[2,1]]}
test('L moves around a wall inside its empty corner, but occupied cells cannot cross walls',()=>{const wall=[{id:'wall',row:0,col:2}];assert.ok(canPlace(l,0,1,5,5,buildOccupancy([],wall)));assert.ok(computeSlideRangeOnAxis(l,'horizontal',[l],wall,5,5,0).max>=1);assert.equal(computeSlideRangeOnAxis(l,'horizontal',[l],[{id:'w',row:1,col:1}],5,5,0).max,0)})
test('T can slide down with a wall in the empty part of its bounding rectangle',()=>{const t={...l,id:'T',w:3,h:2,mask:[[0,0],[0,1],[0,2],[1,1]]};assert.ok(computeSlideRangeOnAxis(t,'vertical',[t],[{id:'w',row:2,col:0}],5,5,0).max>=1)})
test('L and T render as one continuous outline without internal cell borders',()=>{for(const mask of [l.mask,[[0,0],[0,1],[0,2],[1,1]]]){const p=polyominoPath(mask,50,6);assert.equal((p.match(/M/g)||[]).length,1);assert.equal((p.match(/Z/g)||[]).length,1);assert.ok(!p.includes('NaN'));assert.ok(p.includes('Q'))}})
