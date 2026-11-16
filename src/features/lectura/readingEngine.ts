import type {ReadingText,ReadingQuestion} from './readingTypes'
import type {ReadingMode} from './readingModes'
export const tactics=[
 ['Explora y pregunta','Antes de leer, examina el título y formula una pregunta. Después comprueba si el texto la responde.'],
 ['Lee con propósito','Busca primero la idea general; vuelve después sobre los argumentos y los detalles que la sostienen.'],
 ['Recupera sin mirar','Al cerrar el texto, resume de memoria. Relee los pasajes que no puedes explicar con tus palabras.'],
 ['Conecta y contrasta','Relaciona cada párrafo con el anterior. Distingue una causa, una comparación y un simple ejemplo.'],
 ['Vocabulario en contexto','Infiere un significado provisional, contrástalo con la definición y úsalo en una frase nueva.'],
 ['Extensión gradual','Aumenta el texto cuando mantengas la comprensión. Una pausa consciente ayuda a revisar lo leído.'],
 ['Ritmo flexible','Reduce la velocidad ante conceptos nuevos. La lectura por bloques es una práctica, no una obligación ni una prueba de comprensión.'],
 ['Examina la fuente','Pregunta quién escribe, cuándo, con qué evidencia y qué no permite concluir el documento.'],
] as const
export function rng(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export function shuffle<T>(items:readonly T[],random=Math.random):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function mixQuestion(q:ReadingQuestion,random=Math.random):ReadingQuestion{const positions=shuffle(q.options.map((_,i)=>i),random);return {...q,options:positions.map(i=>q.options[i]),correct:positions.indexOf(q.correct)}}
export function chunks(text:string,size:number){const words=text.trim().split(/\s+/);return Array.from({length:Math.ceil(words.length/size)},(_,i)=>words.slice(i*size,(i+1)*size).join(' '))}
export function scoreReading(correct:number,total:number,words:number,readMs:number){const accuracy=total?Math.round(correct/total*100):0;return {accuracy,wpm:readMs>=1000?Math.round(words/(readMs/60000)):0,success:accuracy>=80}}
export const wordGoal=(level:number)=>250+Math.floor((level-1)/10)*180
const q=(id:string,prompt:string,options:string[],explanation:string,type:ReadingQuestion['type']='literal'):ReadingQuestion=>({id,prompt,options,correct:0,explanation,type})
export const spelling:ReadingQuestion[]=[
 q('porque','Completa: «No vino ___ estaba enferma».',['porque','por qué','porqué','por que'],'«Porque» introduce la causa. «Por qué» pregunta por ella; «el porqué» es un sustantivo.'),
 q('sino','Completa: «No quería una copia, ___ el original».',['sino','si no','sí no','sinó'],'«Sino» contrapone una alternativa después de una negación; «si no» introduce una condición.'),
 q('haya','Completa: «Espero que ___ una explicación».',['haya','halla','aya','allá'],'«Haya» pertenece a haber. «Halla» es de hallar; «aya» designa a una cuidadora.'),
 q('hecho','Completa: «Ya he ___ la revisión».',['hecho','echo','echó','hechó'],'El participio de hacer es «hecho». «Echo» pertenece a echar.'),
 q('tu','Completa: «___ sabes dónde está ___ libro».',['Tú / tu','Tu / tú','Tú / tú','Tu / tu'],'El pronombre personal «tú» lleva tilde; el posesivo «tu» no.'),
 q('aun','Completa: «___ no ha llegado; ___ así, empezaremos».',['Aún / aun','Aun / aún','Aún / aún','Aun / aun'],'«Aún» equivale aquí a todavía. «Aun así» significa incluso en esas circunstancias.'),
 q('mas','Completa: «Quería ___ tiempo, ___ no lo consiguió».',['más / mas','mas / más','más / más','mas / mas'],'«Más» expresa cantidad; «mas», sin tilde, equivale a pero.'),
 q('sesion','¿Qué serie está escrita correctamente?',['sesión, decisión, precisión','seción, decisión, presición','sesión, desición, precisión','seción, desición, presición'],'Las formas normativas son sesión, decisión y precisión.'),
 q('absorber','Elige la oración correcta.',['El material puede absorber agua.','El material puede absorver agua.','El material puede absorber água.','El material puede absorver água.'],'«Absorber» se escribe con b; «agua» no lleva tilde.'),
 q('excepcion','¿Qué serie está escrita correctamente?',['excepción, excelente, exigencia','exepción, excelente, exigencia','excepción, exelente, exigencia','excepción, excelente, exijencia'],'«Excepción» conserva el grupo -xc-; excelente y exigencia se escriben con c y g, respectivamente.'),
 q('donde','Completa: «No sé ___ vive, pero conozco la ciudad ___ nació».',['dónde / donde','donde / dónde','dónde / dónde','donde / donde'],'El interrogativo indirecto «dónde» lleva tilde. El relativo «donde» no.'),
 q('de','Completa: «Dile que me ___ el libro ___ historia».',['dé / de','de / dé','dé / dé','de / de'],'«Dé» es del verbo dar; «de» es una preposición.'),
 q('te','Completa: «¿___ apetece un ___?».',['Te / té','Té / te','Té / té','Te / te'],'«Te» es un pronombre; «té» nombra la bebida.'),
 q('si','Completa: «Dijo que ___ vendría ___ terminaba pronto».',['sí / si','si / sí','sí / sí','si / si'],'La afirmación «sí» lleva tilde; la conjunción condicional «si» no.'),
 q('vaya','Completa: «Deja que ___ por el sendero junto a la ___».',['vaya / valla','valla / vaya','vaya / vaya','valla / valla'],'«Vaya» pertenece a ir; «valla» es una cerca.'),
 q('tubo','Completa: «El fontanero ___ que cambiar el ___».',['tuvo / tubo','tubo / tuvo','tuvo / tuvo','tubo / tubo'],'«Tuvo» es de tener; «tubo» designa un conducto.'),
 q('rebelar','Completa: «El informe permitió ___ datos ocultos».',['revelar','rebelar','rebélar','revélar'],'«Revelar» es descubrir algo oculto; «rebelar» es sublevar.'),
 q('acentos','¿Cuál está acentuada correctamente?',['El análisis fue útil y riguroso.','El analisis fue útil y riguroso.','El análisis fué útil y riguroso.','El análisis fue util y riguroso.'],'«Análisis» es esdrújula, «útil» es llana terminada en l y «fue» es un monosílabo sin tilde.'),
 q('cuanto','Completa: «Pregunta ___ cuesta y paga ___ puedas».',['cuánto / cuanto','cuanto / cuánto','cuánto / cuánto','cuanto / cuanto'],'El interrogativo indirecto «cuánto» lleva tilde. El relativo «cuanto» no.'),
 q('habia','¿Qué oración respeta la concordancia del haber impersonal?',['Había muchas personas esperando.','Habían muchas personas esperando.','Habían mucha persona esperando.','Había mucha personas esperando.'],'En el uso impersonal de existencia, haber va en singular: había muchas personas.'),
]
export const punctuation:ReadingQuestion[]=[
 q('vocativo','¿Qué oración distingue correctamente a la persona a la que se habla?',['Vamos a comer, Ana.','Vamos, a comer Ana.','Vamos a, comer Ana.','Vamos a comer Ana.'],'El vocativo «Ana» se separa con coma. Sin ella cambia la estructura de la oración.'),
 q('sujeto','Elige la puntuación adecuada.',['Los libros de la estantería pertenecen a Lucía.','Los libros de la estantería, pertenecen a Lucía.','Los libros, de la estantería pertenecen a Lucía.','Los libros de, la estantería pertenecen a Lucía.'],'No se separan sujeto y predicado con una coma, aunque el sujeto sea largo.'),
 q('lista','¿Cómo se anuncia correctamente esta enumeración?',['Necesitamos tres cosas: agua, pan y fruta.','Necesitamos: tres cosas, agua, pan y fruta.','Necesitamos tres cosas; agua pan y fruta.','Necesitamos tres cosas agua: pan, y fruta.'],'Los dos puntos siguen al elemento que anticipa la enumeración.'),
 q('inciso','Elige la oración que delimita el inciso completo.',['El informe, según la autora, está incompleto.','El informe según, la autora está incompleto.','El informe, según la autora está incompleto.','El informe según la autora, está incompleto.'],'El inciso «según la autora» queda delimitado por dos comas.'),
 q('explicativa','¿Qué oración afirma que TODOS los alumnos aprobaron?',['Los alumnos, que habían estudiado, aprobaron.','Los alumnos que habían estudiado aprobaron.','Aprobaron los alumnos que habían estudiado.','De los alumnos, aprobaron los que habían estudiado.'],'La relativa explicativa entre comas se refiere a todo el grupo. Sin comas selecciona un subconjunto.'),
 q('pregunta','Elige la puntuación normativa en español.',['¿Cuándo llegarás? Te esperaremos.','Cuándo llegarás? Te esperaremos.','¿Cuándo llegarás?. Te esperaremos.','¿Cuándo llegarás?; Te esperaremos.'],'La interrogación directa lleva apertura y cierre. No se añade punto tras el signo de cierre.'),
 q('conector','Elige la oración que delimita correctamente el conector.',['Sin embargo, los datos no coinciden.','Sin, embargo los datos no coinciden.','Sin embargo los datos, no coinciden.','Sin embargo los, datos no coinciden.'],'«Sin embargo» como conector al inicio se separa por coma.'),
 q('puntos','¿Qué oración emplea correctamente los puntos suspensivos?',['Tal vez mañana… No puedo asegurarlo.','Tal vez mañana.... No puedo asegurarlo.','Tal vez mañana.. No puedo asegurarlo.','Tal vez mañana…. No puedo asegurarlo.'],'Los puntos suspensivos son tres y no se añade un cuarto para cerrar la oración.'),
 q('causa','Elige la puntuación que introduce una explicación anunciada.',['No abrió la puerta: había perdido la llave.','No abrió: la puerta había perdido la llave.','No abrió la puerta había: perdido la llave.','No abrió la: puerta había perdido la llave.'],'Los dos puntos pueden conectar una afirmación con su explicación.'),
 q('coma','¿Qué oración usa una coma para separar una condición inicial?',['Si llegas temprano, podremos conversar.','Si, llegas temprano podremos conversar.','Si llegas, temprano podremos conversar.','Si llegas temprano podremos, conversar.'],'La oración condicional antepuesta se separa de la principal por coma.'),
]
const vocabularyDistractors=['Relación entre la masa y el volumen de una muestra.','Conjunto de datos seleccionados para estudiar una población.','Representación simplificada de un proceso o sistema.','Cambio gradual apreciable al comparar una serie temporal.','Capacidad de distinguir detalles separados en una observación.','Cantidad de energía transferida entre dos cuerpos por su diferencia de temperatura.','Conjunto de reacciones químicas de un organismo.','Distribución de materiales que forman un objeto.']
export function buildQuiz(text:ReadingText,mode:ReadingMode,level:number,seed:number):ReadingQuestion[]{
 const random=rng(seed),count=Math.min(10,4+Math.floor(level/15));
 if(mode==='ortografia')return shuffle(spelling,random).slice(0,count).map(q=>mixQuestion(q,random));
 if(mode==='puntuacion')return shuffle(punctuation,random).slice(0,count).map(q=>mixQuestion(q,random));
 let list=[...text.questions];
 if(mode==='lexico'&&text.glossary?.length){list=text.glossary.map((g,i)=>q('lex-'+i,`En este contexto, ¿qué significa «${g.word}»? ${g.example}`,[g.meaning,...shuffle([...new Set([...text.glossary!.filter((_,j)=>j!==i).map(x=>x.meaning),...vocabularyDistractors])].filter(m=>m!==g.meaning),random).slice(0,3)],`${g.word}: ${g.meaning}`,'lexico'))}
 const preferred=mode==='inferencia'?'inferencia':mode==='ideas'?'idea':mode==='critica'?'critica':null;
 if(preferred)list=list.filter(q=>q.type===preferred);
 if(!list.length||mode==='evidencia'){
  const paras=text.paragraphs.filter(p=>p.length>70);
  list=shuffle(paras.map((p,i)=>({p,i})),random).slice(0,count).map(({p,i})=>{
   const words=p.split(/\s+/),size=Math.min(12,Math.floor(words.length/2)),start=Math.max(0,Math.floor(words.length/3)-size/2|0),answer=words.slice(start,start+size).join(' ');
   const distractors=shuffle(paras.filter((_,j)=>j!==i).map(x=>x.split(/\s+/).slice(0,size).join(' ')),random).filter(x=>x!==answer).slice(0,3);
   return {...q('fragment-'+i,`¿Qué expresión pertenece al pasaje que empieza «${words.slice(0,8).join(' ')}…»?`,[answer,...distractors],`El pasaje dice: «${p}»`,'evidencia'),evidence:p};
  }).filter(q=>q.options.length>=2);
 }
 if(!list.length){const paragraph=text.paragraphs.find(p=>p.length>80)||'',words=paragraph.split(/\s+/),terms=[...new Set(words.filter(w=>/^[\p{L}]{6,}$/u.test(w)))];list=shuffle(terms,random).slice(0,count).map((word,i)=>{const at=words.indexOf(word),context=words.slice(Math.max(0,at-10),Math.min(words.length,at+12)).map((w,j)=>Math.max(0,at-10)+j===at?'______':w).join(' ');return q('cloze-'+i,`Recupera la palabra del fragmento: «${context}»`,[word,...shuffle(terms.filter(w=>w!==word),random).slice(0,3)],`El original utiliza «${word}»: ${words.slice(Math.max(0,at-10),Math.min(words.length,at+12)).join(' ')}`,'literal')}).filter(q=>q.options.length>1)}
 // Curated semantic questions are never fabricated for documentary excerpts.
 return shuffle(list,random).slice(0,count).map(q=>mixQuestion(q,random));
}
export function eligibleForMode(text:{questionTypes:string[];id:string;paragraphCount?:number},mode:ReadingMode){return mode==='orden'&&(text.paragraphCount||0)<3?false:mode==='inferencia'?text.questionTypes.includes('inferencia'):mode==='ideas'?text.questionTypes.includes('idea'):mode==='critica'?text.questionTypes.includes('critica'):mode==='lexico'?text.questionTypes.includes('lexico'):true}
export function orderRound(text:ReadingText,level:number,seed:number){const random=rng(seed),eligible=text.paragraphs.map((p,i)=>({text:p,id:i})).filter(p=>p.text.length>45),size=Math.min(eligible.length,3+Math.floor(level/20)),start=Math.floor(random()*Math.max(1,eligible.length-size+1)),correct=eligible.slice(start,start+size);let mixed=shuffle(correct,random);if(mixed.every((p,i)=>p.id===correct[i]?.id)&&mixed.length>1)mixed=[...mixed.slice(1),mixed[0]];return {correct:correct.map(p=>p.id),mixed}}
