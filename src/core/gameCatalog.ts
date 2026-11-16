import {PARTY_GAMES} from '@/features/games/party/partyCatalog'
import {MATH_GAMES} from '@/features/matematicas/mathCatalog'
import {KNOWLEDGE_MODES} from '@/features/conocimiento/knowledgeCatalog'
import {READING_MODES} from '@/features/lectura/readingModes'
import {EXERCISES} from '@/features/memoria/juegos/laboratorio/trainingEngine'
export const GAME_CATEGORIES = {
  matematicas:'Matemáticas', conocimiento:'Conocimiento', lectura: 'Lectura', memoria: 'Memoria', logica: 'Lógica', deduccion: 'Deducción', games: 'Juegos de mesa',
}
export type GameCategory = keyof typeof GAME_CATEGORIES
export const GAME_CATALOG: {id:string;path:string;label:string;category:GameCategory;icon:string}[] = [
  ...PARTY_GAMES.map(g=>({id:g.id,path:'/games/'+g.id+'/menu',label:g.name,category:'games' as const,icon:g.id==='domino'?'⚄':g.id==='dibujar'?'✎':'◇'})),
  ...MATH_GAMES.map(m=>({id:m.id,path:m.id==='mate-sudoku'?'/categoria/matematicas/sudoku':'/categoria/matematicas?modo='+m.id,label:m.title,category:'matematicas' as const,icon:m.symbol})),
  ...KNOWLEDGE_MODES.map(m=>({id:m.id,path:'/categoria/conocimiento?modo='+m.id,label:m.title,category:'conocimiento' as const,icon:m.icon})),
  ...READING_MODES.map(mode=>({id:mode.id,path:'/categoria/lectura?modo='+mode.id,label:mode.title,category:'lectura' as const,icon:mode.icon})),
  ...[['reaccion','Tiempo de reacción'],['punteria','Puntería'],['simon','Simón dice'],['secuencia','Secuencia numérica'],['numero-fugaz','Número fugaz'],['memoria-posicion','Memoria de posición'],['multitono','Multitono']].map(([id,label])=>({id:'habilidad-'+id,path:'/categoria/memoria/habilidades?modo='+id,label,category:'memoria' as const,icon:'⚡'})),
  ...[['laberinto','Laberinto'],['hielo','Hielo'],['teleport','Teletransportadores'],['interruptores','Interruptores'],['laser','Láser'],['circuitos','Circuitos'],['camino','Camino único'],['croma','Croma'],['pintar','Pintar']].map(([id,label])=>({id:'despejes-'+id,path:'/categoria/logica/despejes?modo='+id,label:'Despejes · '+label,category:'logica' as const,icon:'🧭'})),
  ...[['palabras-encadenadas','verbal','Palabras encadenadas'],['citando-al-citador','typing','Citando al citador'],['palacio-imaginario','palace','Palacio imaginario']].map(([id,mode,label])=>({id,path:'/categoria/memoria/numeros-asociados?modo='+mode,label,category:'memoria' as const,icon:'🔗'})),
  ...EXERCISES.map(e=>({id:e.id,path:'/categoria/memoria/laboratorio?ejercicio='+e.id,label:e.name,category:'memoria' as const,icon:'🧠'})),
  {id:'secuencia-colores',path:'/categoria/memoria/secuencia-colores',label:'Secuencia de colores',category:'memoria',icon:'🌈'},
  {id:'cartas',path:'/categoria/memoria/cartas',label:'Memoria de cartas',category:'memoria',icon:'🃏'},
  {id:'numeros-asociados',path:'/categoria/memoria/numeros-asociados',label:'Números asociados · Palabras · Citas',category:'memoria',icon:'🔢'},
  {id:'habilidades',path:'/categoria/memoria/habilidades',label:'Habilidades · Reacción · Multitono · Secuencias',category:'memoria',icon:'⚡'},
  {id:'nexo',path:'/categoria/memoria/nexo',label:'Nexo',category:'memoria',icon:'🔗'},
  {id:'numberpuzzle',path:'/categoria/logica/numberpuzzle',label:'Colocador',category:'logica',icon:'🔢'},
  {id:'rompecabezas',path:'/categoria/logica/rompecabezas',label:'Rompecabezas',category:'logica',icon:'🧩'},
  {id:'despejes',path:'/categoria/logica/despejes',label:'Despejes · Laberintos y desafíos',category:'logica',icon:'🧭'},
  {id:'blockcleaner',path:'/categoria/logica/blockcleaner',label:'Block Cleaner',category:'logica',icon:'🟦'},
  {id:'luces',path:'/categoria/logica/luces',label:'Luces',category:'logica',icon:'💡'},
  {id:'sumas',path:'/categoria/logica/sumas',label:'Sumas',category:'logica',icon:'➕'},
  {id:'acertijos',path:'/categoria/deduccion/acertijos',label:'Acertijos',category:'deduccion',icon:'🔍'},
  {id:'historias',path:'/categoria/deduccion/historias',label:'Historias',category:'deduccion',icon:'📖'},
  {id:'palabras',path:'/categoria/deduccion/palabras',label:'Palabras',category:'deduccion',icon:'🔤'},
  {id:'silogismos',path:'/categoria/deduccion/silogismos',label:'Silogismos',category:'deduccion',icon:'🧠'},
  {id:'mapas',path:'/categoria/deduccion/mapas',label:'Mapas',category:'deduccion',icon:'🗺️'},
  {id:'codigo',path:'/categoria/deduccion/codigo',label:'Código',category:'deduccion',icon:'🔐'},
  {id:'idiomas',path:'/categoria/deduccion/idiomas',label:'Idiomas',category:'deduccion',icon:'🌐'},
  {id:'ajedrez',path:'/games/ajedrez/menu',label:'Ajedrez',category:'games',icon:'♟️'},
  {id:'tres',path:'/games/tres/menu',label:'Tres',category:'games',icon:'🎴'},
  {id:'poker',path:'/games/poker/menu',label:'Póker',category:'games',icon:'♠️'},
  {id:'solitario',path:'/games/solitario/menu',label:'Solitario',category:'games',icon:'🃏'},
  {id:'21',path:'/games/21/menu',label:'21',category:'games',icon:'♥️'},
  {id:'conquian',path:'/games/conquian/menu',label:'Conquián',category:'games',icon:'♦️'},
  {id:'fichacore',path:'/games/fichacore/menu',label:'Fichacore',category:'games',icon:'⚽'},
]
