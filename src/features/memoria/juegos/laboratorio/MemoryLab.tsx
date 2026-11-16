import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {EXERCISES,FAMILIES,COLORS,SHAPES,DEFAULT_SETTINGS,createRound,scoreAnswers,type Exercise,type Family,type Round,type Settings} from './trainingEngine'
import {getGameProgress,recordLevelResult} from '@/core/storage/progress'
import {soundClick,soundSuccess,soundFail} from '@/core/audio/uiSounds'
import './laboratorio.css'
const SETTINGS_KEY='gco:memory-lab-settings-v1'
function initialSettings():Settings{try{return {...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {...DEFAULT_SETTINGS}}}
function Figure({code,small=false}:{code:string;small?:boolean}){
 const [shape,color]=code.split(':').map(Number),fill=COLORS[color]||COLORS[0]
 const points=(n:number,star=false)=>Array.from({length:star?n*2:n},(_,i)=>{const angle=i*Math.PI*2/(star?n*2:n)-Math.PI/2,r=star&&i%2?20:42;return `${50+Math.cos(angle)*r},${50+Math.sin(angle)*r}`}).join(' ')
 return <svg className={`ml-figure ${small?'small':''}`} viewBox="0 0 100 100" role="img" aria-label={`${SHAPES[shape]}, color ${color+1}`} style={{color:fill}}><g fill="currentColor" stroke="var(--gco-ink)" strokeWidth="1.5">{shape===0?<circle cx="50" cy="50" r="40"/>:shape===1?<rect x="12" y="12" width="76" height="76" rx="8"/>:shape===7?<rect x="6" y="25" width="88" height="50" rx="6"/>:<polygon points={points([0,0,3,5,4,6,5,0,7][shape]||4,shape===3)}/>}</g></svg>
}
export function MemoryLab(){
 const [params,setParams]=useSearchParams(),selected=EXERCISES.find(e=>e.id===params.get('ejercicio'))||null
 const [family,setFamily]=useState<Family|'ALL'>('ALL'),[cfg,setCfg]=useState(initialSettings),[custom,setCustom]=useState('')
 const [phase,setPhase]=useState<'setup'|'countdown'|'show'|'recall'|'result'>('setup'),[round,setRound]=useState<Round|null>(null),[tick,setTick]=useState(0),[clock,setClock]=useState(0),[paused,setPaused]=useState(false),[answer,setAnswer]=useState<string[]>([]),[typed,setTyped]=useState(''),[shape,setShape]=useState(0),[color,setColor]=useState(0),[paint,setPaint]=useState(''),[matrix,setMatrix]=useState(0)
 const [result,setResult]=useState<{correct:number;total:number;accuracy:number}|null>(null),[notice,setNotice]=useState('')
 const [historyVersion,setHistoryVersion]=useState(0)
 const started=useRef(0),recorded=useRef(false),suspended=useRef(false),frameMs=useRef(1000),elapsed=useRef(0),lastFrame=useRef(0),roundConfig=useRef(cfg)
 const setConfig=(patch:Partial<Settings>)=>setCfg(current=>({...current,...patch}))
 useEffect(()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(cfg))}catch{/* preferences remain usable without storage */}},[cfg])
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});setPhase('setup');setRound(null);setNotice('');if(selected){const level=Math.min(100,getGameProgress('memoria',selected.id).highestLevel+1);setConfig({level,count:selected.family==='RET'&&selected.variant===4?15:selected.family==='RET'&&selected.variant===5?12:Math.min(36,6+Math.floor(level/3)),exposure:Math.max(350,2400-level*15)})}},[selected?.id])
 useEffect(()=>{const hidden=()=>{if(document.hidden&&(phase==='show'||phase==='countdown')){setPaused(true);suspended.current=true}};document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden)},[phase])
 useEffect(()=>{
  if((phase!=='countdown'&&phase!=='show')||paused||!round)return
  let request=0;lastFrame.current=performance.now()
  const update=(now:number)=>{
   const delta=Math.max(0,now-lastFrame.current);lastFrame.current=now;elapsed.current+=delta;setClock(elapsed.current)
   if(phase==='countdown'){setTick(Math.max(1,3-Math.floor(elapsed.current/1000)));if(elapsed.current>=3000){elapsed.current=0;setClock(0);setTick(0);setPhase('show');return}}
   else {
    const all=round.layout==='all',step=frameMs.current+(all?0:roundConfig.current.gap),limit=all?frameMs.current:round.frames.length*step
    if(elapsed.current>=limit){setPhase('recall');setTick(0);if(roundConfig.current.sound)soundClick();return}
    setTick(all?0:Math.floor(elapsed.current/step))
   }
   request=requestAnimationFrame(update)
  };request=requestAnimationFrame(update);return()=>cancelAnimationFrame(request)
 },[phase,paused,round])
 function begin(e:Exercise){
  const safe={...cfg,count:Math.max(3,Math.min(96,Math.round(cfg.count)||8)),chunk:Math.max(1,Math.min(12,Math.round(cfg.chunk)||3)),exposure:Math.max(100,Math.min(15000,Number(cfg.exposure)||2200)),gap:Math.max(0,Math.min(3000,Number(cfg.gap)||0)),wpm:Math.max(60,Math.min(1600,Number(cfg.wpm)||220))}
  const next=createRound(e,safe,Date.now()>>>0,custom);roundConfig.current=safe
  frameMs.current=e.fixedMs||(e.kind==='reading'&&e.variant!==0?Math.max(120,60000*safe.chunk*(e.variant===3?3:e.variant===4?2:1)/safe.wpm):safe.exposure)
  if(e.family==='RET'&&e.variant===4)frameMs.current=Math.min(safe.exposure,1750)
  setRound(next);setAnswer(Array(next.answer.length).fill(''));setTyped('');setPaint(next.choices?.[0]||'');setMatrix(0);setResult(null);setNotice('');setPaused(false);suspended.current=false;recorded.current=false;started.current=performance.now();elapsed.current=0;setClock(0);setTick(3);setPhase('countdown');if(cfg.sound)soundClick()
 }
 function submit(){
  if(!round||!selected||phase!=='recall'||recorded.current)return
  let actual=answer
  if(round.layout==='all'||selected.family==='EVM'&&selected.variant===1)actual=typed.replace(/\s/g,'').split('')
  else if(selected.family==='EVM'&&selected.variant===0)actual=typed.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean)
  else if(round.answer.length===1&&selected.kind!=='change'&&!round.choices)actual=[typed.trim()]
  const score=scoreAnswers(round.answer,actual);recorded.current=true;setAnswer(actual);setResult(score);setPhase('result');setHistoryVersion(v=>v+1)
  try{recordLevelResult({categoryId:'memoria',gameId:selected.id,level:cfg.level,success:score.accuracy===100,timeMs:Math.round(performance.now()-started.current),score:score.accuracy})}catch{setNotice('El resultado se muestra, pero el dispositivo no permitió guardarlo.')}
  if(cfg.sound)(score.accuracy===100?soundSuccess:soundFail)()
 }
 const isFigures=selected&&(selected.family==='EVM'&&selected.variant===3||selected.family==='RET'&&selected.variant===4)
 const isObjects=selected?.family==='EMD'&&selected.variant===2
 const isPairs=selected?.family==='EVM'&&selected.variant===2
 const isGrid=selected?.kind==='grid'||selected?.kind==='change'
 const frame=round?.frames[Math.min(tick,(round?.frames.length||1)-1)]||''
 const inGap=phase==='show'&&round?.layout!=='all'&&clock%(frameMs.current+roundConfig.current.gap)>=frameMs.current
 const gridOffset=round?matrix*round.size**2:0
 const updateAnswer=(index:number,value:string)=>setAnswer(previous=>{const next=[...previous];next[index]=value;return next})
 const progress=selected?getGameProgress('memoria',selected.id):null
 void historyVersion
 return <main className={`app-shell memory-lab ${phase!=='setup'?'is-playing':''}`}>
  <header className="ml-header"><Link className="glass-button secondary" to="/categoria/memoria">← Memoria</Link><span className="ml-eyebrow">LABORATORIO COGNITIVO</span><h1>{selected?.name||'Entrena a tu ritmo'}</h1><p>{selected?.description||'Lectura, atención, procesamiento y recuerdo. Sesiones breves con resultados que puedes comparar.'}</p></header>
  {!selected?<>
   <div className="ml-overview"><div><strong>{EXERCISES.length}</strong><span>ejercicios</span></div><div><strong>6</strong><span>áreas de práctica</span></div><div><strong>100</strong><span>niveles ajustables</span></div></div>
   <nav className="ml-filters" aria-label="Área de entrenamiento"><button className={family==='ALL'?'active':''} onClick={()=>setFamily('ALL')}>Todos</button>{Object.entries(FAMILIES).map(([id,f])=><button key={id} className={family===id?'active':''} onClick={()=>setFamily(id as Family)}>{f.icon} {id==='RET'?'Retos':id}</button>)}</nav>
   {Object.entries(FAMILIES).filter(([id])=>family==='ALL'||family===id).map(([id,f])=><section className="ml-family" key={id}><h2>{f.icon} {f.name}</h2><p>{f.description}</p><div className="ml-catalog">{EXERCISES.filter(e=>e.family===id).map(e=>{const p=getGameProgress('memoria',e.id);return <button className="ml-card" key={e.id} onClick={()=>setParams({ejercicio:e.id})}><span className="ml-card-index">{e.family} · {String(e.variant+1).padStart(2,'0')}</span><h3>{e.name}</h3><p>{e.description}</p><footer><span>{p.totalAttempts?`${p.totalAttempts} sesiones · mejor ${p.bestScore??0}%`:'Empieza una sesión'}</span><span>↗</span></footer></button>})}</div></section>)}
   <p className="ml-footnote">La velocidad se evalúa junto con la precisión. Estas actividades entrenan habilidades concretas; el rendimiento depende de la práctica, el descanso y la comprensión.</p>
  </>:<>
   <div className="ml-toolbar"><button className="glass-button secondary" onClick={()=>{setPhase('setup');setParams({})}}>← Todos los ejercicios</button><span>{FAMILIES[selected.family].icon} {FAMILIES[selected.family].name}</span></div>
   {phase==='setup'?<div className="ml-setup"><section className="ml-panel"><h2>Prepara tu entrenamiento</h2><p>Observa sin escribir. Cuando desaparezca el contenido, responde de memoria. Sólo se registra una comprobación por intento.</p><div className="ml-settings">
    <label>Nivel<select value={cfg.level} onChange={e=>{const level=Number(e.target.value);setConfig({level,count:Math.min(60,6+Math.floor(level/3)),exposure:Math.max(250,2400-level*18)})}}>{Array.from({length:100},(_,i)=><option key={i} value={i+1}>Nivel {i+1}</option>)}</select></label>
    {(selected.kind!=='reading'||selected.variant===0)&&<label>{selected.family==='RET'&&selected.variant===5?'Matrices de la serie':selected.kind==='grid'||selected.kind==='change'?'Casillas iluminadas':'Elementos'}<input type="number" min="3" max="96" value={cfg.count} onChange={e=>setConfig({count:Number(e.target.value)})}/></label>}
    {(selected.kind!=='reading'||selected.variant===0)&&<label>Exposición por estímulo (ms)<input type="number" min="100" max="15000" step="50" disabled={!!selected.fixedMs} value={selected.fixedMs||cfg.exposure} onChange={e=>setConfig({exposure:Number(e.target.value)})}/></label>}
    {!(selected.family==='RET'&&selected.variant<4)&&<label>Pausa entre estímulos (ms)<input type="number" min="0" max="3000" step="50" value={cfg.gap} onChange={e=>setConfig({gap:Number(e.target.value)})}/></label>}
    {(selected.kind==='reading'||selected.family==='EVM'&&selected.variant===1||selected.family==='RET'&&selected.variant<4)&&<label>Tamaño del bloque<select value={cfg.chunk} onChange={e=>setConfig({chunk:Number(e.target.value)})}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select></label>}
    {selected.kind==='reading'&&selected.variant!==0&&<label>Palabras por minuto<input type="number" min="60" max="1600" step="20" value={cfg.wpm} onChange={e=>setConfig({wpm:Number(e.target.value)})}/></label>}
   </div>{selected.kind==='process'&&<p className="ml-instruction">{selected.variant===0?'Durante la exposición, cuenta los pares idénticos.':selected.variant===1?'Durante la exposición, cuenta únicamente FRUTAS.':'Empieza por el primer número y aplica cada suma o resta en orden.'}</p>}{selected.kind==='eye'&&<p className="ml-instruction">Sigue los estímulos con la vista y cuenta sólo la letra O. La app no detecta ni mide los movimientos de tus ojos.</p>}
   {selected.kind==='reading'&&selected.variant!==0&&<details><summary>Usar mi propio texto</summary><label className="ml-custom">Pega entre 30 y 3000 palabras<textarea rows={5} maxLength={22000} value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Si lo dejas vacío se prepara un pasaje con una pregunta de comprensión."/></label><p>Con texto propio se comprueba el recuerdo de una palabra dentro del pasaje.</p></details>}
   <label className="ml-check"><input type="checkbox" checked={cfg.sound} onChange={e=>setConfig({sound:e.target.checked})}/> Efectos de inicio y resultado</label><button className="glass-button ml-primary" onClick={()=>begin(selected)}>Comenzar entrenamiento →</button></section>
   <aside className="ml-panel ml-stats"><span className="ml-eyebrow">TU PROGRESO</span><strong>{progress?.totalAttempts||0}</strong><span>sesiones realizadas</span><strong>{progress?.bestScore||0}%</strong><span>mejor precisión</span><h3>Últimas sesiones</h3>{progress?.history.slice(-6).reverse().map((h,i)=><div className="ml-history" key={i}><span>Nivel {h.level}</span><span>{h.success?'Completo':'En práctica'}</span><small>{new Date(h.at).toLocaleDateString()}</small></div>)}{!progress?.totalAttempts&&<p>Tu primer resultado aparecerá aquí al comprobarlo.</p>}</aside></div>:<>
   <section className="ml-panel ml-session"><div className="ml-session-head"><span>{phase==='countdown'?'Prepárate':phase==='show'?'Observa':phase==='recall'?'Recupera de memoria':'Resultado'} · Nivel {cfg.level}</span><span>{phase==='show'&&round?`${Math.min(tick+1,round.frames.length)} / ${round.frames.length}`:FAMILIES[selected.family].icon}</span></div>
   {(phase==='show'||phase==='countdown')&&round&&<>
    <div className="ml-meter"><span style={{width:`${phase==='countdown'?100-Math.min(100,clock/30):Math.max(0,100-clock/(round.layout==='all'?frameMs.current:round.frames.length*(frameMs.current+roundConfig.current.gap))*100)}%`}}/></div>
    <div className={`ml-stage layout-${round.layout}`} aria-label="Estímulo de entrenamiento">
     {paused?<div className="ml-paused"><h2>Sesión en pausa</h2><p>El contenido permanece oculto mientras descansas.</p><button className="glass-button" onClick={()=>{setPaused(false);setNotice('Sesión reanudada.')}}>Continuar</button></div>:phase==='countdown'?<strong className="ml-countdown">{tick}</strong>:inGap?<span className="ml-fixation">+</span>:isGrid?<div className="ml-grid" style={{gridTemplateColumns:`repeat(${round.size},1fr)`}}>{Array.from({length:round.size**2},(_,i)=>{const filled=round.matrixMasks?round.matrixMasks[tick]?.includes(i):round.mask.includes(i);return <div key={i} className={filled?'filled':''}>{isObjects?round.frames[i]:''}</div>})}</div>:isFigures?<Figure code={frame}/>:selected.kind==='eye'?<><span className="ml-fixation">+</span><strong className="ml-eye-target" style={eyePosition(selected.variant,tick)}>{frame}</strong></>:round.layout==='all'?<div className="ml-number-blocks">{round.frames.map((f,i)=><span key={i}>{f}</span>)}</div>:<div className={`ml-text-frame ${selected.kind==='reading'?'reading':''}`}><span>{(round.layout==='two'||round.layout==='three'||round.layout==='scan')&&<small className="ml-reading-context">{round.frames.slice(Math.max(0,tick-1),tick).join(' ')}</small>}{round.layout==='two'||round.layout==='three'?<span className="ml-text-columns" style={{'--columns':round.layout==='three'?3:2} as CSSProperties}>{Array.from({length:round.layout==='three'?3:2},(_,i)=><span key={i}>{frame.split(/\s+/).slice(i*roundConfig.current.chunk,(i+1)*roundConfig.current.chunk).join(' ')}</span>)}</span>:frame}</span></div>}
    </div><div className="ml-session-actions"><button className="glass-button secondary" onClick={()=>{setPaused(v=>!v);suspended.current=true}}>{paused?'Continuar':'Pausar'}</button><button className="glass-button secondary" onClick={()=>{setPhase('setup');setPaused(false)}}>Cancelar intento</button></div>
   </>}
   {phase==='recall'&&round&&<>
    <h2 className="ml-question">{round.question}</h2>
    {selected.kind==='change'?<div className="ml-grid recall" style={{gridTemplateColumns:`repeat(${round.size},1fr)`}}>{Array.from({length:round.size**2},(_,i)=><button aria-label={`Casilla ${i+1}`} key={i} onClick={()=>updateAnswer(0,String(i))} className={`${round.mask.includes(i)!==(round.changed===i)?'filled':''} ${answer[0]===String(i)?'chosen':''}`}/>)}</div>:isGrid?<>
     {round.matrixMasks&&<div className="ml-matrix-nav">{round.matrixMasks.map((_,i)=><button className={matrix===i?'active':''} key={i} onClick={()=>setMatrix(i)}>Matriz {i+1}</button>)}</div>}
     {isObjects&&<div className="ml-object-palette"><button className={!paint?'active':''} onClick={()=>setPaint('')}>Vacío</button>{round.choices?.map(item=><button className={paint===item?'active':''} key={item} onClick={()=>setPaint(item)}>{item}</button>)}</div>}
     <div className="ml-grid recall" style={{gridTemplateColumns:`repeat(${round.size},1fr)`}}>{Array.from({length:round.size**2},(_,i)=><button key={i} aria-label={`Casilla ${i+1}`} aria-pressed={answer[gridOffset+i]==='1'||!!(isObjects&&answer[i])} className={!isObjects&&answer[gridOffset+i]==='1'?'filled':''} onClick={()=>updateAnswer(gridOffset+i,isObjects?paint:answer[gridOffset+i]==='1'?'0':'1')}>{isObjects?answer[i]:''}</button>)}</div><p className="ml-help">{isObjects?'Selecciona un objeto y después su casilla.':'Las casillas vacías cuentan como apagadas.'}</p>
    </>:isFigures?<><div className="ml-figure-builder"><label>Forma<select value={shape} onChange={e=>setShape(Number(e.target.value))}>{SHAPES.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label><div className="ml-colors" aria-label="Color de la figura">{COLORS.map((c,i)=><button key={c} className={color===i?'selected':''} aria-label={`Color ${i+1}`} aria-pressed={color===i} style={{background:c}} onClick={()=>setColor(i)}/>)}</div><Figure small code={`${shape}:${color}`}/><button className="glass-button" disabled={answer.filter(Boolean).length>=round.answer.length} onClick={()=>setAnswer(a=>{const n=[...a],i=n.findIndex(x=>!x);if(i>=0)n[i]=`${shape}:${color}`;return n})}>Añadir figura</button><button className="glass-button secondary" onClick={()=>setAnswer(a=>{const n=[...a],i=n.findLastIndex(Boolean);if(i>=0)n[i]='';return n})}>Deshacer</button></div><div className="ml-answer-figures">{answer.map((a,i)=><div key={i}><small>{i+1}</small>{a?<Figure small code={a}/>:<span>?</span>}</div>)}</div></>:isPairs?<div className="ml-pair-inputs">{round.choices?.map((item,i)=><label key={item}>{item}<input inputMode="numeric" value={answer[i]||''} onChange={e=>updateAnswer(i,e.target.value)}/></label>)}</div>:round.choices?<div className="ml-choices">{round.choices.map(option=><button className={answer[0]===option?'selected':''} key={option} onClick={()=>updateAnswer(0,option)}>{option}</button>)}</div>:<label className="ml-recall-input">Tu respuesta<textarea rows={3} autoFocus value={typed} inputMode={selected.kind==='eye'||selected.kind==='process'||round.layout==='all'||selected.variant===1?'numeric':'text'} onChange={e=>setTyped(e.target.value)} placeholder={selected.family==='EVM'&&selected.variant===0?'palabra, palabra, palabra…':'Escribe lo que recuerdas'}/></label>}
    <button className="glass-button ml-primary" onClick={submitGridSafe}>Comprobar una vez</button>
   </>}
   {phase==='result'&&result&&round&&<div className="ml-result" role="status"><span className="ml-eyebrow">{result.accuracy===100?'SECUENCIA COMPLETA':'SIGUE ENTRENANDO'}</span><h2>{result.accuracy}%</h2><p>{result.correct} de {result.total} posiciones correctas</p><div className="ml-review">{round.answer.map((expected,i)=><div key={i} className={scoreAnswers([expected],[answer[i]||'']).accuracy===100?'right':'wrong'}><small>{i+1}</small><span>{isFigures?<Figure small code={expected}/>:isGrid&&!isObjects&&selected.kind!=='change'?(expected==='1'?'●':'○'):selected.kind==='change'?`Casilla ${Number(expected)+1}`:expected||'Vacío'}</span><small>Tu respuesta: {isFigures&&answer[i]?<Figure small code={answer[i]}/>:isGrid&&!isObjects&&selected.kind!=='change'?(answer[i]==='1'?'●':'○'):selected.kind==='change'&&answer[i]?Number(answer[i])+1:answer[i]||'—'}</small></div>)}</div><details><summary>Revisar el ejercicio</summary><p>{round.explanation}</p>{round.reading&&<p>{round.reading}</p>}</details><div className="ml-session-actions"><button className="glass-button ml-primary" onClick={()=>begin(selected)}>Nuevo intento</button><button className="glass-button secondary" onClick={()=>setPhase('setup')}>Ajustar entrenamiento</button></div></div>}
   </section>{notice&&<p role="status" className="ml-help">{notice}</p>}
  </>}
  </>}
 </main>
 function submitGridSafe(){
  // An untouched cell is off, without relying on asynchronous React state updates.
  if(isGrid&&selected?.kind!=='change'&&!isObjects&&round){
   const actual=answer.map(v=>v||'0');if(recorded.current)return;const score=scoreAnswers(round.answer,actual);recorded.current=true;setAnswer(actual);setResult(score);setPhase('result');setHistoryVersion(v=>v+1);try{recordLevelResult({categoryId:'memoria',gameId:selected!.id,level:cfg.level,success:score.accuracy===100,timeMs:Math.round(performance.now()-started.current),score:score.accuracy})}catch{setNotice('No se pudo guardar el resultado en este dispositivo.')};if(cfg.sound)(score.accuracy===100?soundSuccess:soundFail)()
  }else submit()
 }
}
function eyePosition(variant:number,index:number):CSSProperties{
 const cross=[[50,16],[84,50],[50,84],[16,50]],horizontal=[15+index%5*17,50],field=[14+(index*37)%72,18+(index*23)%64],peripheral=[index%2?82:18,index%4<2?25:75]
 const [x,y]=variant===0?horizontal:variant===1?field:variant===2?peripheral:cross[index%4];return {left:`${x}%`,top:`${y}%`}
}
