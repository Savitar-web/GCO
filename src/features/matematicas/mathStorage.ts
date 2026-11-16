export type MathResult={id:string;game:string;level:number;at:string;correct:number;total:number;timeMs:number;hints:number}
export type MathStats={history:MathResult[];totals:{attempts:number;wins:number;totalTimeMs:number;totalCorrect:number;totalQuestions:number}}
export function readMath<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
export function writeMath(key:string,value:unknown){const encoded=JSON.stringify(value);if(localStorage.getItem(key)===encoded)return;localStorage.setItem(key,encoded);window.dispatchEvent(new Event('gco:progress'))}
export function getMathStats():MathStats{return readMath('gco:math-stats-v1',{history:[],totals:{attempts:0,wins:0,totalTimeMs:0,totalCorrect:0,totalQuestions:0}})}
export function saveMathResult(r:MathResult){const s=getMathStats();if(s.history.some(x=>x.id===r.id))return false;writeMath('gco:math-stats-v1',{history:[r,...s.history].slice(0,200),totals:{attempts:s.totals.attempts+1,wins:s.totals.wins+Number(r.total>0&&r.correct/r.total>=.8),totalTimeMs:s.totals.totalTimeMs+r.timeMs,totalCorrect:s.totals.totalCorrect+r.correct,totalQuestions:s.totals.totalQuestions+r.total}});return true}
export const mathTime=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`
