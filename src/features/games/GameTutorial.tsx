import {useEffect,useRef,useState} from 'react'
import {gameSound} from './GameEffects'
type Lesson={title:string;explain:string;sample:string;question:string;answers:string[];correct:number}
const lessons:Record<string,Lesson[]>={
 tres:[
  {title:'Combina color o símbolo',explain:'Juega una carta del color activo o del símbolo de la carta superior.',sample:'Mesa: azul 7 · Tu mano: azul 3 / rojo 2',question:'¿Qué carta puedes jugar?',answers:['Azul 3','Rojo 2'],correct:0},
  {title:'Comer y comodines',explain:'Si no tienes una carta válida, come hasta encontrar una. Al jugar un comodín aparecen cuatro colores.',sample:'Mesa: verde 4 · Tu mano: rojo 2 / azul 8',question:'¿Qué haces?',answers:['Pasar sin comer','Comer una carta'],correct:1},
  {title:'Penalizaciones de Tres',explain:'Esta variante permite acumular +. Sobre un +4 puedes poner un +2 del color elegido.',sample:'+4 elige azul · Tienes azul +2',question:'¿Cuántas cartas quedan pendientes?',answers:['2','4','6'],correct:2}],
 '21':[
  {title:'Acércate a 21',explain:'Las figuras valen 10. Pide para recibir otra carta o plántate para terminar tu mano.',sample:'Tu mano: K + 7 = 17',question:'¿Qué acción conserva tus 17 puntos?',answers:['Pedir','Plantarse'],correct:1},
  {title:'El valor del As',explain:'El As puede valer 1 u 11. El valor automático se ajusta para evitar pasarte; también puedes elegirlo durante tu turno.',sample:'A + 9 + 5',question:'¿Qué valor del As evita pasarte?',answers:['1 → 15 puntos','11 → 25 puntos'],correct:0},
  {title:'Jugar con Casa',explain:'Solo el creador reparte. Pides una carta y la Casa la envía a tu asiento. Siempre ves tus cartas, aunque estén ocultas para los demás.',sample:'Tu mano: 20 · Casa: 18',question:'¿Quién gana este enfrentamiento?',answers:['Tú','Casa'],correct:0}],
 conquian:[
  {title:'Tríos y escaleras',explain:'Combina tres o cuatro cartas de igual rango y distinto palo, o una escalera del mismo palo. No existen 8, 9 ni 10.',sample:'6♠ · 7♠ · J♠',question:'¿Es una escalera válida?',answers:['Sí, J sigue a 7','No'],correct:0},
  {title:'Orden del turno',explain:'En esta variante de robo libre, roba del mazo o toma el descarte, combina y descarta una carta.',sample:'Empieza tu turno',question:'¿Cuál es el primer paso?',answers:['Descartar','Robar o tomar descarte'],correct:1},
  {title:'Cerrar la mano',explain:'Ganas al bajar once cartas en combinaciones válidas. Puedes agregar cartas a tus grupos. Conserva una para descartar si aún no llegas a once.',sample:'Bajadas: 8 · Mano: 3 cartas que completan grupos',question:'¿Puedes ganar bajando las tres?',answers:['Sí: 11 combinadas','No: necesitas 12'],correct:0}],
 poker:[
  {title:'Póker de cinco cartas',explain:'Cada persona recibe cinco cartas. Se juega con fichas de práctica, sin dinero.',sample:'A♠ A♥ 7♣ 4♦ 2♠',question:'¿Qué combinación tienes?',answers:['Pareja de ases','Escalera'],correct:0},
  {title:'Cambio y apuestas',explain:'Después de la primera ronda de apuestas puedes cambiar hasta tres cartas. Luego viene la segunda ronda y se comparan manos.',sample:'Conservas dos ases',question:'¿Cuántas cartas puedes cambiar como máximo?',answers:['3','5'],correct:0},
  {title:'Orden de las manos',explain:'Escalera de color, póker, full, color, escalera, trío, doble pareja, pareja y carta alta.',sample:'Tu mano: color · Rival: escalera',question:'¿Cuál gana?',answers:['Escalera','Color'],correct:1}],
 solitario:[
  {title:'Ordena las columnas',explain:'Las columnas bajan de rango alternando rojo y negro.',sample:'Destino: 8♣ · Carta: 7♥',question:'¿Puedes colocarla?',answers:['Sí','No'],correct:0},
  {title:'Construye las bases',explain:'Cada base empieza por As y continúa por el mismo palo hasta Rey.',sample:'Base: A♦',question:'¿Qué carta sigue?',answers:['2♣','2♦'],correct:1},
  {title:'Espacios vacíos',explain:'Solo un Rey, o una secuencia que empiece por Rey, puede ocupar una columna vacía.',sample:'Columna vacía',question:'¿Qué puedes mover allí?',answers:['Q♠','K♥'],correct:1}],
 ajedrez:[
  {title:'Protege a tu rey',explain:'Ganas con jaque mate: el rey está amenazado y no existe una jugada legal para salvarlo. La casilla a1 es oscura.',sample:'Tu rey está en jaque',question:'¿Puedes ignorarlo y mover otra pieza sin resolverlo?',answers:['Sí','No'],correct:1},
  {title:'Enroque',explain:'Mueve el rey dos casillas hacia una torre que no se haya movido. No puede haber piezas entre ambos ni jaque en el origen, tránsito o destino.',sample:'Rey e1 → g1',question:'¿Dónde queda la torre h1?',answers:['f1','e1'],correct:0},
  {title:'Captura al paso',explain:'Si un peón rival avanza dos casillas y queda junto al tuyo, puedes capturarlo en diagonal como si hubiera avanzado una, solo en la respuesta inmediata.',sample:'El rival acaba de avanzar dos casillas',question:'¿Puedes esperar otro turno para capturarlo al paso?',answers:['Sí','No'],correct:1}]
}
function TutorialModal({kind,onClose}:{kind:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);const [step,setStep]=useState(0);const [answer,setAnswer]=useState<number|null>(null);const list=lessons[kind]||lessons.ajedrez;const item=list[step]
 useEffect(()=>{ref.current?.showModal()},[])
 return <dialog className="game-modal tutorial-modal" ref={ref} onCancel={onClose} aria-labelledby="lesson-title"><span className="gco-eyebrow">Tutorial · {step+1}/{list.length}</span><h2 id="lesson-title">{item.title}</h2><p>{item.explain}</p><div className="tutorial-example">{item.sample}</div><h3>{item.question}</h3><div className="gco-form">{item.answers.map((label,index)=><button className={`glass-button ${answer===index?'':'secondary'}`} key={label} onClick={()=>{setAnswer(index);gameSound(index===item.correct?'win':'loss')}}>{label}</button>)}</div>{answer!==null&&<p role="status">{answer===item.correct?'¡Correcto! Puedes continuar.':'Inténtalo otra vez. Revisa la explicación.'}</p>}<div className="gco-actions"><button className="glass-button" disabled={answer!==item.correct} onClick={()=>{if(step===list.length-1){localStorage.setItem(`gco:tutorial:${kind}`,'done');onClose()}else{setStep(step+1);setAnswer(null)}}}>{step===list.length-1?'Terminar tutorial':'Siguiente'}</button><button className="glass-button secondary" onClick={onClose}>Cerrar</button></div></dialog>
}
export function GameTutorial({kind}:{kind:string}){const [open,setOpen]=useState(false);return <><button className="glass-button secondary" onClick={()=>setOpen(true)}>Aprender a jugar</button>{open&&<TutorialModal kind={kind} onClose={()=>setOpen(false)}/>}</>}
