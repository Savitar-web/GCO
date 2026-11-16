export type Family='EL'|'EO'|'EPM'|'EVM'|'EMD'|'RET'
export type Exercise={id:string;family:Family;name:string;description:string;kind:'reading'|'eye'|'process'|'sequence'|'grid'|'change';variant:number;fixedMs?:number}
export const FAMILIES:Record<Family,{name:string;icon:string;description:string}>={
 EL:{name:'Lectura por bloques',icon:'📖',description:'Agrupa palabras y comprueba qué has comprendido.'},
 EO:{name:'Atención y recorrido visual',icon:'👁',description:'Alterna fijaciones y localiza estímulos. No requiere cámara.'},
 EPM:{name:'Procesamiento mental',icon:'⚡',description:'Interpreta y compara información bajo exposición breve.'},
 EVM:{name:'Velocidad de memorización',icon:'🔗',description:'Retén secuencias y asociaciones, y recupéralas en orden.'},
 EMD:{name:'Memoria visual',icon:'✨',description:'Reconstruye patrones, posiciones y cambios de una escena.'},
 RET:{name:'Retos de precisión',icon:'🏁',description:'Decimales, binarios, figuras y matrices con exposición controlada.'}
}
const make=(family:Family,names:string[],kind:Exercise['kind'],descriptions:string[])=>names.map((name,variant)=>({id:`laboratorio-${family.toLowerCase()}-${variant+1}`,family,name,kind,variant,description:descriptions[variant]}))
export const EXERCISES:Exercise[]=[
 ...make('EL',['Bloques numéricos','Grupos de palabras','Lectura en columna','Tres fijaciones','Dos fijaciones','Texto que se desvanece','Barrido por renglones','Ventana de lectura'],'reading',[
 'Reconoce grupos de cifras en una sola exposición y recuerda el último.','Lee grupos de palabras a ritmo ajustable y responde una pregunta de comprensión.','Recorre un texto en una columna central, sin perseguir cada palabra.','Distribuye cada renglón en tres zonas de lectura.','Entrena renglones divididos en dos grupos de palabras.','El bloque anterior desaparece al avanzar. Comprueba lo que has retenido.','Sigue el renglón activo mientras el resto del texto queda atenuado.','Lee a través de una ventana de palabras y recupera la idea principal.']),
 ...make('EO',['Seguimiento horizontal','Saltos por el campo','Fijación periférica','Recorrido en cruz'],'eye',[
 'Sigue los símbolos de izquierda a derecha y cuenta las apariciones de O.','Localiza estímulos en posiciones cambiantes y cuenta las O.','Mantén una referencia central mientras identificas O en la periferia.','Alterna fijaciones arriba, derecha, abajo e izquierda; cuenta las O.']),
 ...make('EPM',['Comparación instantánea','Categorías fugaces','Cálculo en bloques'],'process',[
 'Cuenta cuántos pares son exactamente iguales.','Cuenta las palabras que pertenecen a la categoría indicada.','Resuelve mentalmente una cadena breve y conserva el resultado.']),
 ...make('EVM',['Cadena de palabras','Cifras agrupadas','Vínculos de memoria','Secuencia de figuras'],'sequence',[
 'Memoriza palabras en su orden de aparición.','Retén una secuencia decimal segmentada en bloques.','Relaciona cada objeto con su número y recupera las asociaciones.','Memoriza la forma y el color de cada figura en orden.']),
 ...make('EMD',['Matriz fugaz','Detecta el cambio','Mapa de objetos'],'grid',[
 'Reconstruye las casillas iluminadas después de una exposición.','Observa el patrón; después identifica la única casilla que cambió.','Recuerda qué objeto ocupaba cada casilla del mapa.']),
 ...make('RET',['Decimales · 1 segundo','Decimales · 4 segundos','Binarios · 1 segundo','Binarios · 4 segundos','Figuras de colores','Serie de matrices'],'sequence',[
 'Recupera cifras decimales tras una exposición de un segundo.','Recupera cifras decimales tras cuatro segundos de observación.','Recupera una secuencia de ceros y unos vista durante un segundo.','Recupera una secuencia binaria vista durante cuatro segundos.','Retén una serie de formas y colores, una figura cada vez.','Reconstruye sucesivamente las matrices que has memorizado.'
 ]).map(e=>({...e,fixedMs:[1000,4000,1000,4000,undefined,undefined][e.variant],kind:e.variant===5?'grid' as const:e.kind})),
].map(e=>e.family==='EMD'&&e.variant===1?{...e,kind:'change' as const}:e)
export const COLORS=['#37b9ff','#ff617e','#ffc94a','#5cdb99','#b891ff','#ff954f','#f8fafc','#66758f','#522f22','#161e2c']
export const SHAPES=['círculo','cuadrado','triángulo','estrella','rombo','hexágono','pentágono','rectángulo','heptágono']
export const WORDS=['bosque','luna','puente','llave','río','nube','faro','libro','reloj','jardín','barco','espejo','montaña','pluma','piedra','isla','nido','cobre','torre','cuerda','cactus','ventana','camino','ancla','mariposa','cristal','semilla','pincel','cometa','cereza','violín','escalera','campana','arena','tesoro','brújula']
export type Settings={level:number;count:number;exposure:number;gap:number;chunk:number;wpm:number;sound:boolean}
export const DEFAULT_SETTINGS:Settings={level:1,count:8,exposure:2200,gap:250,chunk:3,wpm:220,sound:true}
export type Round={frames:string[];answer:string[];choices?:string[];question:string;size:number;mask:number[];changed?:number;reading?:string;explanation:string;layout:string;matrixMasks?:number[][]}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
export function scoreAnswers(expected:string[],actual:string[]){const correct=expected.reduce((n,v,i)=>n+Number(i<actual.length&&normalize(v)===normalize(actual[i]||'')),0);return {correct,total:expected.length,accuracy:Math.round(correct/Math.max(1,expected.length,actual.length)*100)}}
export function createRound(e:Exercise,cfg:Settings,seed:number,custom=''):Round{
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};const int=(n:number)=>Math.floor(random()*n)
 const shuffle=<T,>(list:T[])=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=int(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
 const count=Math.max(3,Math.min(96,cfg.count)), size=Math.min(7,3+Math.floor((cfg.level-1)/18)),cells=size*size
 const base:Round={frames:[],answer:[],question:'Reconstruye la secuencia en su orden original.',size,mask:[],explanation:'Cada posición se compara por separado. Los huecos también cuentan.',layout:'center'}
 const digits=(n:number,radix=10)=>Array.from({length:n},()=>String(int(radix)))
 if(e.kind==='reading'){
  if(e.variant===0){base.frames=Array.from({length:Math.min(12,count)},()=>digits(cfg.chunk).join(''));base.answer=[base.frames.at(-1)!];base.question='¿Cuál fue el último bloque de cifras?';return base}
  const people=['Inés','Bruno','Clara','Diego','Elena','Fabián'],places=['el faro','el jardín','la estación','el museo','la biblioteca','el puerto'],objects=['una brújula','un cuaderno','una linterna','una llave','un mapa','un reloj'];const who=people[int(6)],where=places[int(6)],object=objects[int(6)],day=['lunes','martes','miércoles','jueves','viernes','sábado'][int(6)]
  const text=custom.trim()||`${who} decidió visitar ${where} el ${day}. Antes de salir guardó ${object} en su mochila. La lluvia retrasó el viaje, así que tomó un autobús en lugar de caminar. Al llegar encontró la puerta cerrada y esperó bajo un árbol. Una persona abrió poco después. La visita terminó al atardecer y ${who} regresó a casa con una idea para su próximo viaje.`
  const words=text.split(/\s+/),chunk=Math.max(1,Math.min(12,cfg.chunk))*(e.variant===3?3:e.variant===4?2:1);for(let i=0;i<words.length;i+=chunk)base.frames.push(words.slice(i,i+chunk).join(' '));base.reading=text
  base.layout=['','','column','three','two','fade','scan','window'][e.variant]
  if(custom.trim()){const index=int(Math.max(1,words.length-4));const phrase=words.slice(index,index+3).join(' '),target=words[index+3]||words.at(-1)!;base.question=`¿Qué palabra seguía a «${phrase}»?`;base.answer=[target.replace(/[.,;:!?]/g,'')];base.choices=shuffle([...new Set([base.answer[0],...shuffle(words.map(w=>w.replace(/[.,;:!?]/g,''))).filter(w=>normalize(w)!==normalize(base.answer[0])).slice(0,3)])])}
  else {const q=int(4);base.question=['¿Qué hizo que cambiara la forma de viajar?','¿Qué objeto guardó antes de salir?','¿Qué hizo al encontrar la puerta cerrada?','¿Qué día decidió realizar la visita?'][q];base.answer=[['La lluvia',object,'Esperó bajo un árbol',day][q]];base.choices=shuffle([base.answer[0],...([['Un camino bloqueado','Una avería','Un olvido'],objects.filter(x=>x!==object),['Regresó inmediatamente','Entró por una ventana','Buscó otra dirección'],['domingo','ayer','el mes siguiente']][q]).slice(0,3)])}
  base.explanation=`Comprueba el pasaje: ${text}`;return base
 }
 if(e.kind==='eye'){base.frames=Array.from({length:Math.min(40,count)},()=>random()<.4?'O':['X','C','Q'][int(3)]);base.answer=[String(base.frames.filter(x=>x==='O').length)];base.question='¿Cuántas veces apareció exactamente la letra O?';base.layout=['horizontal','field','peripheral','cross'][e.variant];return base}
 if(e.kind==='process'){
  let answer=0
  if(e.variant===0){base.frames=Array.from({length:Math.min(24,count)},()=>{const a=digits(2+Math.floor(cfg.level/25)).join(''),same=random()<.5;let b=a;if(!same)b=String((Number(a)+1)%10**a.length).padStart(a.length,'0');if(same)answer++;return a+'  ·  '+b});base.question='¿Cuántos pares eran exactamente iguales?'}
  if(e.variant===1){const fruit=['manzana','pera','limón','cereza','uva','melón'],other=['martillo','mesa','puerta','reloj','barco','cobre'];base.frames=Array.from({length:Math.min(24,count)},()=>{const hit=random()<.5;if(hit)answer++;return (hit?fruit:other)[int(6)]});base.question='Categoría: FRUTAS. ¿Cuántas aparecieron?'}
  if(e.variant===2){answer=1+int(9);base.frames=[String(answer)];for(let i=0;i<Math.min(12,count-1);i++){const n=1+int(9),positive=random()<.6;answer+=positive?n:-n;base.frames.push(`${positive?'+':'−'} ${n}`)}base.question='Partiendo del primer número y aplicando las operaciones, ¿cuál es el resultado final?'}
  base.answer=[String(answer)];return base
 }
 if(e.kind==='grid'||e.kind==='change'){
  const occupied=shuffle(Array.from({length:cells},(_,i)=>i)).slice(0,Math.min(cells-1,e.family==='EMD'&&e.variant===2?WORDS.length:cells,count));base.mask=occupied;const mask=Array.from({length:cells},(_,i)=>occupied.includes(i)?'1':'0');base.frames=['Matriz'];base.answer=mask
  if(e.kind==='change'){base.changed=int(cells);base.answer=[String(base.changed)];base.question='Toca la única casilla que cambió respecto al patrón inicial.'}
  else if(e.family==='EMD'&&e.variant===2){const items=shuffle(WORDS).slice(0,occupied.length);base.frames=Array.from({length:cells},(_,i)=>occupied.includes(i)?items[occupied.indexOf(i)]:'');base.answer=base.frames;base.choices=items;base.question='Elige un objeto y toca la casilla donde estaba. Puedes borrar una casilla seleccionando Vacío.'}
  else if(e.family==='RET'){const matrices=Array.from({length:Math.min(12,Math.max(2,count))},()=>shuffle(Array.from({length:cells},(_,i)=>i)).slice(0,occupied.length));base.matrixMasks=matrices;base.frames=matrices.map((_,i)=>String(i+1));base.answer=matrices.flatMap(m=>Array.from({length:cells},(_,i)=>m.includes(i)?'1':'0'));base.question='Reconstruye cada matriz en el orden de aparición.'}
  else base.question='Toca las casillas que estaban iluminadas.'
  return base
 }
 if(e.family==='RET'&&e.variant<4||e.family==='EVM'&&e.variant===1){const raw=digits(count,e.family==='RET'&&e.variant>=2?2:10);base.answer=raw;const c=Math.max(1,cfg.chunk);for(let i=0;i<raw.length;i+=c)base.frames.push(raw.slice(i,i+c).join(''));base.layout=e.family==='RET'?'all':'center';base.question='Escribe todas las cifras en orden, sin espacios.';return base}
 if(e.family==='EVM'&&e.variant===0){base.frames=shuffle(WORDS).slice(0,Math.min(30,count));base.answer=base.frames;base.question='Escribe las palabras en orden, separadas por comas.';return base}
 if(e.family==='EVM'&&e.variant===2){const items=shuffle(WORDS).slice(0,Math.min(20,count));base.answer=items.map(()=>digits(2+Math.floor(cfg.level/35)).join(''));base.frames=items.map((w,i)=>`${w} → ${base.answer[i]}`);base.choices=items;base.question='Escribe el número asociado a cada objeto.';return base}
 base.frames=Array.from({length:Math.min(30,count)},()=>`${int(SHAPES.length)}:${int(COLORS.length)}`);base.answer=base.frames;base.question='Elige forma y color y añade cada figura en su orden de aparición.';return base
}
