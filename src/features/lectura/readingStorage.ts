import type {ReadingMode} from './readingModes'
export type ReadingSession={at:string;textId:string;title:string;mode:ReadingMode;level:number;words:number;readMs:number;accuracy:number;wpm:number;success:boolean}
export type ReadingStats={sessions:ReadingSession[];totals:{attempts:number;accuracySum:number;readMs:number;words:number;textIds:string[]};prefs:{level:number;wpm:number;chunk:number;font:number;language:'es'|'en'|'all'}}
export type Resume={textId:string;mode:ReadingMode;level:number;elapsed:number;paragraph?:number;wpm:number;chunk:number;at:string}
const STATS='gco:reading-stats-v1',RESUME='gco:reading-resume-v1',LEXICON='gco:reading-lexicon-v1'
export const defaults:ReadingStats['prefs']={level:1,wpm:220,chunk:4,font:21,language:'es'}
export function readStore<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
export function writeStore(key:string,value:unknown){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event('gco:progress'))}
export function getReadingStats():ReadingStats{const s=readStore<Partial<ReadingStats>>(STATS,{});return {sessions:Array.isArray(s.sessions)?s.sessions:[],totals:s.totals||{attempts:s.sessions?.length||0,accuracySum:(s.sessions||[]).reduce((a,x)=>a+x.accuracy,0),readMs:(s.sessions||[]).reduce((a,x)=>a+x.readMs,0),words:(s.sessions||[]).filter(x=>x.success).reduce((a,x)=>a+x.words,0),textIds:[...new Set((s.sessions||[]).filter(x=>x.success).map(x=>x.textId))]},prefs:{...defaults,...s.prefs}}}
export function savePrefs(prefs:ReadingStats['prefs']){writeStore(STATS,{...getReadingStats(),prefs})}
export function saveSession(session:ReadingSession){const s=getReadingStats();writeStore(STATS,{...s,totals:{attempts:s.totals.attempts+1,accuracySum:s.totals.accuracySum+session.accuracy,readMs:s.totals.readMs+session.readMs,words:s.totals.words+(session.success?session.words:0),textIds:[...new Set([...s.totals.textIds,...(session.success?[session.textId]:[])])]},sessions:[session,...s.sessions].slice(0,500)});localStorage.removeItem(RESUME)}
export const getResume=()=>readStore<Resume|null>(RESUME,null)
export const saveResume=(r:Resume)=>writeStore(RESUME,r)
export const clearResume=()=>localStorage.removeItem(RESUME)
export type Lexicon=Record<string,{word:string;correct:number;next:number;last:number}>
export const getLexicon=()=>readStore<Lexicon>(LEXICON,{})
export function reviewWord(id:string,word:string,correct:boolean){const list=getLexicon(),prev=list[id],streak=correct?(prev?.correct||0)+1:0;list[id]={word,correct:streak,next:Date.now()+(correct?Math.min(30,2**(streak-1))*86400000:600000),last:Date.now()};writeStore(LEXICON,list)}
