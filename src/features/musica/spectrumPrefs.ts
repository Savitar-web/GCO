export const SPECTRUM_PREFS_KEY='gco:spectrum-preferences-v1'
export const spectrumDefaults={colorA:'#22E6C5',colorB:'#8B5CF6',colorC:'#F472B6',style:'coverOrb',multi:2 as 1|2|3,particles:true,glow:true,eq:{bass:1,mid:1,treble:1,voice:1,master:1}}
export function normalizeSpectrumPrefs(value:unknown){
 const p=value&&typeof value==='object'?value as Record<string,unknown>:{}
 const color=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback
 const eq=p.eq&&typeof p.eq==='object'?p.eq as Record<string,unknown>:{}
 return {...spectrumDefaults,colorA:color(p.colorA,spectrumDefaults.colorA),colorB:color(p.colorB,spectrumDefaults.colorB),colorC:color(p.colorC,spectrumDefaults.colorC),style:typeof p.style==='string'?p.style:spectrumDefaults.style,multi:([1,2,3].includes(Number(p.multi))?Number(p.multi):2) as 1|2|3,particles:typeof p.particles==='boolean'?p.particles:true,glow:typeof p.glow==='boolean'?p.glow:true,eq:Object.fromEntries(Object.entries(spectrumDefaults.eq).map(([k,v])=>[k,typeof eq[k]==='number'&&Number.isFinite(eq[k])?Math.max(0,Math.min(4,eq[k] as number)):v])) as typeof spectrumDefaults.eq}
}
export function loadSpectrumPrefs(){try{return normalizeSpectrumPrefs(JSON.parse(localStorage.getItem(SPECTRUM_PREFS_KEY)||'null'))}catch{return normalizeSpectrumPrefs(null)}}
export function saveSpectrumPrefs(p:ReturnType<typeof normalizeSpectrumPrefs>){try{localStorage.setItem(SPECTRUM_PREFS_KEY,JSON.stringify(normalizeSpectrumPrefs(p)))}catch{/* Keep current settings usable if storage is full. */}}
