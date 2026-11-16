import {PARTY_GAMES} from '@/features/games/party/partyCatalog'
import {GAME_CATALOG} from './gameCatalog'
import {getAllProgress} from './storage/progress'
import {loadChessHistory} from '@/features/games/chess/chessHistory'
type TableResult={kind:string;result:string;durationMs:number;at:string}
function read<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
const catalog:[string,string][]=GAME_CATALOG.filter(game=>game.category!=='games'&&!game.id.startsWith('despejes')).map(game=>[game.category+':'+game.id,game.label])
export function getUnifiedGameStats(){
  const progress = getAllProgress()
  const tableHistory = read<TableResult[]>('gco:table-history-v1', [])
  const chessHistory = loadChessHistory()
  const rows = [...catalog, ...Object.keys(progress).filter(key => key!=='logica:despejes'&&!catalog.some(entry => entry[0] === key)).map(key => [key, key.split(':').at(-1)!] as [string, string])].map(([key, label]) => {
    const item = progress[key]
    return { key, label, category: key.split(':')[0], attempts: item?.totalAttempts || 0, wins: item?.totalCompleted || 0, draws: 0, level: key==='logica:blockcleaner'?Math.max(read<number>('bc.v213.current',1),read<number>('bc.v213.unlocked',1),item?.highestLevel||0):item?.highestLevel || 0, time: item?.totalTimeMs ?? (item?.history || []).reduce((sum, entry) => sum + (entry.timeMs || 0), 0), last: item?.lastPlayedAt }
  })
  for (const [kind, label] of [...PARTY_GAMES.map(g=>[g.id,g.name]),['ajedrez', 'Ajedrez'], ['poker', 'Póker'], ['solitario', 'Solitario'], ['tres','Tres'], ['fichacore','Fichacore'], ['21', '21'], ['conquian', 'Conquián']]) {
    const entries = tableHistory.filter(entry => entry.kind === kind)
    const legacy = kind === 'ajedrez' && !entries.length ? chessHistory : []
    rows.push({ key: `games:${kind}`, label, category: 'games', attempts: entries.length + legacy.length, wins: entries.filter(entry => entry.result === 'win').length + legacy.filter(entry => entry.result === 'win').length, draws: entries.filter(entry => entry.result === 'draw').length + legacy.filter(entry => entry.result === 'draw').length, level: 0, time: entries.reduce((sum, entry) => sum + entry.durationMs, 0) + legacy.reduce((sum, entry) => sum + entry.durationSec * 1000, 0), last: [...entries.map(entry => entry.at), ...legacy.map(entry => new Date(entry.date).toISOString())].sort().at(-1) })
  }
  for(const [id,label] of [['laberinto','Laberinto'],['hielo','Hielo'],['teleport','Teletransportadores'],['interruptores','Interruptores'],['laser','Láser'],['circuitos','Circuitos'],['camino','Camino único'],['croma','Croma'],['pintar','Pintar']]){
    const p=read<{level:number;stars:Record<string,number>}>(`gco:despejes-progress:${id}`,{level:1,stars:{}})
    rows.push({key:`despejes:${id}`,label:`Despejes · ${label}`,category:'logica',attempts:0,wins:Object.keys(p.stars).length,draws:0,level:Math.max(1,p.level),time:0,last:undefined})
  }
  const lifetime=read<Record<string,{attempts:number;wins:number;draws:number;time:number;last:string}>>('gco:table-totals-v1',{})
  for(const row of rows){const total=lifetime[row.key.replace('games:','')];if(row.category==='games'&&total)Object.assign(row,total)}
  const puzzle=read<{wins:number;losses:number;totalPlayMs:number;history:{at:number}[]}>('gco:puzzle-stats',{wins:0,losses:0,totalPlayMs:0,history:[]})
  const puzzleProgress=read<{normalLevel:number}>('gco:puzzle-progress',{normalLevel:1})
  const puzzleRow=rows.find(row=>row.key==='logica:rompecabezas')
  if(puzzleRow)Object.assign(puzzleRow,{
    attempts:Math.max(puzzleRow.attempts,puzzle.wins+puzzle.losses),
    wins:Math.max(puzzleRow.wins,puzzle.wins),
    time:Math.max(puzzleRow.time,puzzle.totalPlayMs),
    level:Math.max(puzzleRow.level,puzzleProgress.normalLevel),
    last:puzzle.history?.[0]?.at?new Date(puzzle.history[0].at).toISOString():puzzleRow.last,
  })
  const bc=rows.find(row=>row.key==='logica:blockcleaner')
  if(bc){
    const wins=read<number>('bc.v213.wins',0),losses=read<number>('bc.v213.defeats',0)
    const history=read<{seconds:number;at:string}[]>('bc.v213.history',[])
    bc.attempts=Math.max(bc.attempts,wins+losses)
    bc.wins=Math.max(bc.wins,wins)
    bc.time=Math.max(bc.time,history.reduce((sum,entry)=>sum+Math.max(0,entry.seconds||0)*1000,0))
    bc.last=history[0]?.at||bc.last
  }
  return rows
}
