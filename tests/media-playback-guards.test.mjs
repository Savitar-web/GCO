import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PlaybackIntent,preciseSeek} from '../src/core/audio/playbackGuards.ts'
import {sampleMotion,motionDuration} from '../src/features/games/fichacore/motion.ts'
test('A slow earlier track cannot replace the latest selection or resume after cancellation',async()=>{
 const intent=new PlaybackIntent();let finishA,finishB,track=null
 const select=async(name,wait)=>{const token=intent.begin();await wait;if(intent.current(token))track=name}
 const a=select('A',new Promise(resolve=>finishA=resolve)),b=select('B',new Promise(resolve=>finishB=resolve));finishB();await b;finishA();await a;assert.equal(track,'B')
 let finish;const c=select('C',new Promise(resolve=>finish=resolve));intent.cancel();finish();await c;assert.equal(track,'B')
})
test('Seek preserves fractional milliseconds and rejects invalid positions',()=>{assert.equal(preciseSeek(12345.67,90000),12345.67);assert.equal(preciseSeek(-10,90000),0);assert.equal(preciseSeek(99999,90000),90000);assert.equal(preciseSeek(500,Infinity),500);assert.equal(preciseSeek(NaN,1000),null);assert.equal(preciseSeek(Infinity,1000),null)})
test('Fichacore interpolates continuous positions at any display refresh rate',()=>{const frames=[[{x:0,y:0}],[{x:100,y:50}],[{x:120,y:70}]];assert.deepEqual(sampleMotion(frames,0),frames[0]);assert.deepEqual(sampleMotion(frames,1),frames[2]);assert.deepEqual(sampleMotion(frames,.125),[{x:25,y:12.5}]);assert.deepEqual(sampleMotion(frames,.75),[{x:110,y:60}]);assert.ok(motionDuration(4000)<4000);assert.ok(motionDuration(20000)<=13000)})
