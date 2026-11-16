export const ALL=0x1ff
export function rng(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export function shuffle<T>(a:readonly T[],random=Math.random){const out=[...a];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
export const rowOf=(i:number)=>Math.floor(i/9),colOf=(i:number)=>i%9,boxOf=(i:number)=>Math.floor(i/27)*3+Math.floor(i%9/3)
export const UNITS=Array.from({length:27},(_,u)=>Array.from({length:9},(_,k)=>u<9?u*9+k:u<18?k*9+u-9:Math.floor((u-18)/3)*27+(u-18)%3*3+Math.floor(k/3)*9+k%3))
export const PEERS=Array.from({length:81},(_,i)=>[...new Set(UNITS.filter(u=>u.includes(i)).flat())].filter(j=>j!==i))
export function isBoard(board:unknown):board is number[]{return Array.isArray(board)&&board.length===81&&board.every(v=>Number.isInteger(v)&&v>=0&&v<=9)}
export function conflicts(board:number[]){const out=new Set<number>();for(const unit of UNITS){const seen=new Map<number,number[]>();for(const i of unit)if(board[i])seen.set(board[i],[...(seen.get(board[i])||[]),i]);for(const indices of seen.values())if(indices.length>1)indices.forEach(i=>out.add(i))}return out}
export function candidates(board:number[],i:number){if(board[i])return 0;return PEERS[i].reduce((mask,j)=>board[j]?mask&~(1<<(board[j]-1)):mask,ALL)}
export const digits=(mask:number)=>Array.from({length:9},(_,i)=>i+1).filter(n=>mask&(1<<(n-1)))
function bitCount(v:number){let n=0;while(v){v&=v-1;n++}return n}
export function solveSudoku(input:number[],limit=2,nodeLimit=200000,random?:()=>number){
 if(!isBoard(input))return {count:0,solution:null as number[]|null,nodes:0,aborted:false};const board=[...input],rows=Array(9).fill(0),cols=Array(9).fill(0),boxes=Array(9).fill(0);for(let i=0;i<81;i++){const n=board[i];if(!n)continue;const bit=1<<(n-1),r=rowOf(i),c=colOf(i),b=boxOf(i);if((rows[r]|cols[c]|boxes[b])&bit)return {count:0,solution:null as number[]|null,nodes:0,aborted:false};rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit}
 let count=0,solution:number[]|null=null,nodes=0,aborted=false;
 function search(){if(count>=limit||aborted)return;if(++nodes>nodeLimit){aborted=true;return}let best=-1,bestMask=0,bestCount=10;for(let i=0;i<81;i++)if(!board[i]){const mask=ALL&~(rows[rowOf(i)]|cols[colOf(i)]|boxes[boxOf(i)]),n=bitCount(mask);if(n===0)return;if(n<bestCount){best=i;bestMask=mask;bestCount=n;if(n===1)break}}if(best<0){count++;if(!solution)solution=[...board];return}const r=rowOf(best),c=colOf(best),b=boxOf(best);for(const n of random?shuffle(digits(bestMask),random):digits(bestMask)){const bit=1<<(n-1);board[best]=n;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;search();board[best]=0;rows[r]&=~bit;cols[c]&=~bit;boxes[b]&=~bit;if(count>=limit||aborted)return}}
 search();return {count,solution,nodes,aborted}
}
export type SudokuDifficulty='inicio'|'principiante'|'suave'|'facil'|'medio'|'exigente'|'dificil'|'maestro'|'experto'|'extremo'
export const SUDOKU_DIFFICULTIES:{id:SudokuDifficulty;name:string;clues:number;level:number}[]=[
{id:'inicio',name:'Iniciación',clues:54,level:1},{id:'principiante',name:'Principiante',clues:50,level:5},{id:'suave',name:'Suave',clues:44,level:10},{id:'facil',name:'Fácil',clues:40,level:20},{id:'medio',name:'Intermedio',clues:36,level:30},{id:'exigente',name:'Exigente',clues:33,level:45},{id:'dificil',name:'Difícil',clues:30,level:60},{id:'maestro',name:'Maestro',clues:28,level:75},{id:'experto',name:'Experto',clues:26,level:90},{id:'extremo',name:'Extremo',clues:24,level:100}]
export type SudokuPuzzle={imported?:boolean;id:string;seed:number;difficulty:SudokuDifficulty;puzzle:number[];solution:number[];clues:number;symmetric:boolean;analysis:{basicSolved:boolean;steps:number;hiddenSingles:number;remaining?:number;searchNodes?:number}}
export type SudokuHint={index:number;digit:number;technique:'Única candidata'|'Único lugar'|'Revelación asistida';reason:string}
export function logicalHint(board:number[]):SudokuHint|null{if(conflicts(board).size)return null;for(let i=0;i<81;i++)if(!board[i]){const ds=digits(candidates(board,i));if(ds.length===1)return {index:i,digit:ds[0],technique:'Única candidata',reason:`En F${rowOf(i)+1} C${colOf(i)+1}, fila, columna y bloque excluyen los otros ocho valores. Sólo puede ir ${ds[0]}.`}}
 for(let u=0;u<UNITS.length;u++)for(let n=1;n<=9;n++){if(UNITS[u].some(i=>board[i]===n))continue;const places=UNITS[u].filter(i=>!board[i]&&(candidates(board,i)&(1<<(n-1))));if(places.length===1)return {index:places[0],digit:n,technique:'Único lugar',reason:`El ${n} sólo puede colocarse en F${rowOf(places[0])+1} C${colOf(places[0])+1} dentro de ${u<9?'la fila '+(u+1):u<18?'la columna '+(u-8):'el bloque '+(u-17)}.`}}
 return null
}
export function analyzeSudoku(puzzle:number[]){const b=[...puzzle];let steps=0,hiddenSingles=0;while(steps<81){const hint=logicalHint(b);if(!hint)break;b[hint.index]=hint.digit;steps++;if(hint.technique==='Único lugar')hiddenSingles++}return {basicSolved:b.every(Boolean)&&!conflicts(b).size,steps,hiddenSingles,remaining:b.filter(n=>!n).length}}
function generateCandidate(seed:number,difficulty:SudokuDifficulty,symmetric=true):SudokuPuzzle{
 const random=rng(seed),filled=solveSudoku(Array(81).fill(0),1,200000,random);if(!filled.solution)throw Error('No se pudo construir el tablero');const solution=filled.solution,puzzle=[...solution],target=SUDOKU_DIFFICULTIES.find(d=>d.id===difficulty)?.clues||36,visited=new Set<number>();let clues=81;
 for(const i of shuffle(Array.from({length:81},(_,i)=>i),random)){if(visited.has(i))continue;const cells=symmetric?[...new Set([i,80-i])]:[i];cells.forEach(i=>visited.add(i));if(clues-cells.length<target)continue;const prev=cells.map(i=>puzzle[i]);cells.forEach(i=>puzzle[i]=0);const result=solveSudoku(puzzle,2,50000);if(result.count===1&&!result.aborted)clues-=cells.length;else cells.forEach((i,k)=>puzzle[i]=prev[k])}
 return {id:'sudoku-'+seed+'-'+difficulty+'-'+Number(symmetric),seed,difficulty,puzzle,solution,clues,symmetric,analysis:analyzeSudoku(puzzle)}
}
export function generateSudoku(seed:number,difficulty:SudokuDifficulty,symmetric=true):SudokuPuzzle{
 const profile=SUDOKU_DIFFICULTIES.find(d=>d.id===difficulty);if(!profile)throw Error('Dificultad no válida');let best:SudokuPuzzle|null=null,bestScore=-Infinity;const trials=profile.level>=75?6:profile.level>=45?3:2;
 for(let attempt=0;attempt<trials;attempt++){const candidate=generateCandidate((seed+Math.imul(attempt,2654435761))>>>0,difficulty,symmetric),search=solveSudoku(candidate.puzzle,1,200000),analysis={...candidate.analysis,searchNodes:search.nodes};candidate.analysis=analysis;const score=profile.level<45?(analysis.basicSolved?10000:0)-Math.abs(candidate.clues-profile.clues)*100+analysis.hiddenSingles:((analysis.remaining||0)*100)+Math.min(search.nodes,5000)-Math.abs(candidate.clues-profile.clues)*30;if(score>bestScore){best=candidate;bestScore=score}if(profile.level<45&&analysis.basicSolved&&candidate.clues<=profile.clues+1)break}
 return {...best!,id:'sudoku-'+seed+'-'+difficulty+'-'+Number(symmetric),seed}
}
export type SudokuFrame={values:number[];notes:number[]}
export function applyDigit(frame:SudokuFrame,givens:number[],i:number,n:number,pencil:boolean):SudokuFrame{if(givens[i])return frame;const values=[...frame.values],notes=[...frame.notes];if(pencil&&n){if(values[i])return frame;notes[i]^=1<<(n-1)}else{values[i]=n;notes[i]=0;if(n)for(const p of PEERS[i])notes[p]&=~(1<<(n-1))}return {values,notes}}
export function parseSudoku(text:string){const raw=text.replace(/\s/g,'');if(!/^[0-9.]{81}$/.test(raw))throw Error('Usa 81 caracteres: dígitos de 1 a 9 y 0 o punto para casillas vacías.');return [...raw].map(c=>c==='.'?0:Number(c))}
export function solvedSudoku(board:number[],givens:number[]){return isBoard(board)&&board.every(Boolean)&&!conflicts(board).size&&givens.every((n,i)=>!n||board[i]===n)}
