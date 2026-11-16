import {test} from 'node:test'
import assert from 'node:assert/strict'
import {loadSpectrumPrefs,saveSpectrumPrefs,normalizeSpectrumPrefs,SPECTRUM_PREFS_KEY} from '../src/features/musica/spectrumPrefs.ts'
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
test('Spectrum restores all three custom colors and disabled effects after reopening',()=>{const p=normalizeSpectrumPrefs({colorA:'#112233',colorB:'#abcdef',colorC:'#ff0099',multi:3,style:'wave',particles:false,glow:false,eq:{bass:2,mid:1,treble:1,voice:1,master:1}});saveSpectrumPrefs(p);assert.deepEqual(loadSpectrumPrefs(),p);assert.equal(loadSpectrumPrefs().multi,3)})
test('Invalid stored spectrum values recover without dropping valid colors',()=>{values.set(SPECTRUM_PREFS_KEY,JSON.stringify({colorA:'#123456',colorB:'url(evil)',multi:99,eq:{bass:-9}}));const p=loadSpectrumPrefs();assert.equal(p.colorA,'#123456');assert.equal(p.colorB,'#8B5CF6');assert.equal(p.multi,2);assert.equal(p.eq.bass,0);values.set(SPECTRUM_PREFS_KEY,'broken');assert.equal(loadSpectrumPrefs().multi,2)})
