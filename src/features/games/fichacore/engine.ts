export type Point={x:number;y:number}
export type Disc=Point&{team:number;owner:number}
export type TokenDesign={color:string;text:string;ink:string;drawing:Point[][]}
export type FichaState={kind:'fichacore';count:number;discs:Disc[];ball:Point;turn:number;score:number[];target:number;phase:'setup'|'play'|'goal'|'finished';started:boolean;finished:boolean;winner:number|null;message:string;formations:Point[][];designs:TokenDesign[];ready:boolean[];courtVotes:string[];court:string;round:number;shotId:number;lastShot?:{discs:Disc[];ball:Point;index:number;dx:number;dy:number;id:number};readyAt?:number;lastPass?:boolean;teamTurns?:number[]}
export type FichaAction={type:'setup'|'continue'|'shoot';formation?:Point[];design?:TokenDesign;court?:string;index?:number;dx?:number;dy?:number}
export const COURTS=['classic','night','clay','ice'] as const
export const FORMATIONS:{name:string;points:Point[]}[]=[
 {name:'Equilibrada · 1–2–3',points:[{x:50,y:300},{x:130,y:160},{x:130,y:440},{x:260,y:120},{x:270,y:300},{x:260,y:480}]},
 {name:'Muralla · defensa',points:[{x:45,y:300},{x:100,y:180},{x:100,y:420},{x:200,y:100},{x:200,y:300},{x:200,y:500}]},
 {name:'Presión · ataque',points:[{x:50,y:300},{x:180,y:300},{x:330,y:80},{x:330,y:220},{x:330,y:380},{x:330,y:520}]},
 {name:'Diamante · posesión',points:[{x:50,y:300},{x:160,y:300},{x:250,y:120},{x:250,y:480},{x:350,y:220},{x:350,y:380}]},
 {name:'Bandas · amplitud',points:[{x:45,y:300},{x:150,y:150},{x:150,y:450},{x:310,y:80},{x:380,y:300},{x:310,y:520}]}
]
export const defaultDesign=(seat:number):TokenDesign=>({color:seat%2?'#ed7a36':'#24a9e8',text:seat%2?'🔥':'⚡',ink:'#ffffff',drawing:[]})
export function validateFormation(points:Point[]){
 if(!Array.isArray(points)||points.length!==6||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<24||p.x>476||p.y<24||p.y>576))throw new Error('Coloca exactamente seis fichas dentro de tu mitad del campo.')
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)if(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)<48)throw new Error('Deja espacio entre las fichas: no pueden superponerse.')
 return points.map(p=>({x:Math.round(p.x),y:Math.round(p.y)}))
}
export function validateDesign(design:TokenDesign):TokenDesign{
 if(!design||!/^#[a-f0-9]{6}$/i.test(design.color)||!/^#[a-f0-9]{6}$/i.test(design.ink)||typeof design.text!=='string'||Array.from(design.text).length>12||!Array.isArray(design.drawing)||design.drawing.length>24)throw new Error('Diseño inválido: usa colores, texto corto y hasta 24 trazos.')
 let points=0;for(const stroke of design.drawing){if(!Array.isArray(stroke)||stroke.length>100)throw new Error('Trazo demasiado largo.');for(const p of stroke){points++;if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.hypot(p.x-50,p.y-50)>46)throw new Error('Dibuja dentro de la ficha.')}}
 if(points>800)throw new Error('El dibujo supera los 800 puntos.')
 return structuredClone(design)
}
function place(state:FichaState){state.discs=[0,1].flatMap(team=>state.formations[team].map((p,i)=>({x:team?1000-p.x:p.x,y:p.y,team,owner:state.count===4&&i>=3?team+2:team})));state.ball={x:500,y:300}}
export function newFicha(count=2,target=3):FichaState{
 if(![2,4].includes(count)||!Number.isInteger(target)||target<1||target>7)throw new Error('Elige 2 o 4 jugadores y entre 1 y 7 goles.')
 const state:FichaState={kind:'fichacore',count,discs:[],ball:{x:500,y:300},turn:0,score:[0,0],target,phase:'setup',started:false,finished:false,winner:null,message:'Elige formación, cancha y diseño. Todos deben confirmar.',formations:[structuredClone(FORMATIONS[0].points),structuredClone(FORMATIONS[0].points)],designs:Array.from({length:count},(_,i)=>defaultDesign(i)),ready:Array(count).fill(false),courtVotes:Array(count).fill('classic'),court:'classic',round:0,shotId:0,teamTurns:[1,0]};place(state);return state
}
type Body=Point&{vx:number;vy:number;r:number;m:number;team:number}
export type ShotResult={discs:Disc[];ball:Point;goal:number|null;pass:boolean;frames:Point[][]}
// Fixed steps, finite duration and bounded impulses make client/server simulation deterministic.
export function simulateShot(discs:Disc[],ball:Point,index:number,dx:number,dy:number,record=false):ShotResult{
 const team=discs[index].team;const bodies:Body[]=[...discs.map(p=>({...p,vx:0,vy:0,r:23,m:3})),{...ball,vx:0,vy:0,r:12,m:1,team:-1}]
 const power=Math.hypot(dx,dy),scale=Math.min(power,180)/Math.max(power,.001)*5.5;bodies[index].vx=dx*scale;bodies[index].vy=dy*scale
 const frames:Point[][]=[];let goal:number|null=null;let receiver=-1;let ownTouch=false;const dt=1/120
 for(let tick=0;tick<960;tick++){
   for(const b of bodies){b.x+=b.vx*dt;b.y+=b.vy*dt;const drag=Math.exp(-(b.team<0?1.45:2.1)*dt);b.vx*=drag;b.vy*=drag
     if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy)*.58}if(b.y>600-b.r){b.y=600-b.r;b.vy=-Math.abs(b.vy)*.58}
     const goalMouth=b.team<0&&b.y>232&&b.y<368
     if(goalMouth&&(b.x<0||b.x>1000)){goal=b.x<0?1:0;break}
     if(!goalMouth){if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.58}if(b.x>1000-b.r){b.x=1000-b.r;b.vx=-Math.abs(b.vx)*.58}}
   }
   if(goal!==null)break
   for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
     const first=bodies[a],second=bodies[b];let sx=second.x-first.x,sy=second.y-first.y;let distance=Math.hypot(sx,sy);const min=first.r+second.r;if(distance>=min)continue
     if(distance<.001){sx=1;sy=0;distance=1}const nx=sx/distance,ny=sy/distance;const invA=1/first.m,invB=1/second.m,total=invA+invB;const overlap=min-distance+.01
     first.x-=nx*overlap*invA/total;first.y-=ny*overlap*invA/total;second.x+=nx*overlap*invB/total;second.y+=ny*overlap*invB/total
     const rel=(second.vx-first.vx)*nx+(second.vy-first.vy)*ny;if(rel>=0)continue
     if(b===12){if(a===index)ownTouch=true;else if(ownTouch&&first.team===team&&Math.hypot(second.vx,second.vy)<260)receiver=a;else receiver=-1}
     const impulse=-(1+.72)*rel/total;first.vx-=impulse*nx*invA;first.vy-=impulse*ny*invA;second.vx+=impulse*nx*invB;second.vy+=impulse*ny*invB
   }
   if(record&&tick%6===0)frames.push(bodies.map(p=>({x:p.x,y:p.y})))
   if(tick>30&&bodies.every(p=>Math.hypot(p.vx,p.vy)<3))break
 }
 const round=(v:number)=>Math.round(v*1000)/1000
 const finalDiscs=discs.map((p,i)=>({...p,x:round(Math.max(23,Math.min(977,bodies[i].x))),y:round(Math.max(23,Math.min(577,bodies[i].y)))}))
 const finalBall={x:round(Math.max(12,Math.min(988,bodies[12].x))),y:round(Math.max(12,Math.min(588,bodies[12].y)))}
 const pass=goal===null&&receiver>=0&&Math.hypot(finalDiscs[receiver].x-finalBall.x,finalDiscs[receiver].y-finalBall.y)<85
 if(record)frames.push([...finalDiscs,finalBall]);return {discs:finalDiscs,ball:finalBall,goal,pass,frames}
}
export function fichaMove(previous:FichaState,seat:number,action:FichaAction):FichaState{
 if(previous.finished||!Number.isInteger(seat)||seat<0||seat>=previous.count)throw new Error('No puedes jugar en esta partida.')
 const state=structuredClone(previous)
 if(action.type==='setup'||action.type==='continue'){
   if(!['setup','goal'].includes(state.phase))throw new Error('Solo puedes cambiar la plantilla antes del saque.')
   if(state.ready[seat])throw new Error('Ya confirmaste este saque.')
   if(action.formation){if(seat>1)throw new Error('La formación la elige el capitán del equipo.');state.formations[seat%2]=validateFormation(action.formation)}
   if(action.design)state.designs[seat]=validateDesign(action.design)
   if(action.court){if(!COURTS.includes(action.court as typeof COURTS[number]))throw new Error('Cancha inválida.');state.courtVotes[seat]=action.court}
   state.ready[seat]=true
   if(state.ready.every(Boolean)){state.court=[...COURTS].sort((a,b)=>state.courtVotes.filter(v=>v===b).length-state.courtVotes.filter(v=>v===a).length||COURTS.indexOf(a)-COURTS.indexOf(b))[0];state.phase='play';state.started=true;place(state);state.message=`Saca J${state.turn+1}. Arrastra una ficha hacia atrás y suelta.`}
   return state
 }
 if(action.type!=='shoot'||state.phase!=='play'||state.turn!==seat)throw new Error('Espera tu turno y la confirmación de las plantillas.')
 const {index,dx,dy}=action;if(!Number.isInteger(index)||index!<0||index!>=12||state.discs[index!].team!==seat%2||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx!,dy!)<4||Math.hypot(dx!,dy!)>181)throw new Error('Tiro inválido: elige una ficha de tu equipo y una potencia válida.')
 state.shotId++;state.lastShot={discs:structuredClone(state.discs),ball:{...state.ball},index:index!,dx:dx!,dy:dy!,id:state.shotId}
 const result=simulateShot(state.discs,state.ball,index!,dx!,dy!);state.discs=result.discs;state.ball=result.ball;state.lastPass=result.pass
 if(result.goal!==null){state.score[result.goal]++;state.round++;state.ready=Array(state.count).fill(false);state.turn=1-result.goal;state.message=`¡Gol del equipo ${result.goal+1}! ¿Cambiar plantilla?`;state.phase='goal';if(state.score[result.goal]>=state.target){state.finished=true;state.phase='finished';state.winner=result.goal;state.message=`¡Equipo ${result.goal+1} gana ${state.score.join(' – ')}!`}}
 else if(result.pass)state.message='¡Pase controlado! Conservas el turno.'
 else{const other=1-seat%2;const counters=state.teamTurns||[1,0];state.turn=state.count===4?other+(counters[other]%2)*2:other;counters[other]++;state.teamTurns=counters;state.message=`Balón libre. Turno de J${state.turn+1}.`}
 return state
}
export function fichaAI(state:FichaState):FichaAction{
 if(state.phase!=='play')return {type:'continue'}
 const team=state.turn%2,goal={x:team?0:1000,y:300};let best:FichaAction|undefined;let score=-Infinity
 for(let index=0;index<12;index++){if(state.discs[index].team!==team)continue;const p=state.discs[index];const angle=Math.atan2(state.ball.y-p.y,state.ball.x-p.x)
   for(const offset of [-.12,0,.12])for(const power of [65,115,175]){const action:FichaAction={type:'shoot',index,dx:Math.cos(angle+offset)*power,dy:Math.sin(angle+offset)*power};const result=simulateShot(state.discs,state.ball,index,action.dx!,action.dy!);const value=result.goal===team?10000:result.goal!==null?-10000:-Math.hypot(result.ball.x-goal.x,result.ball.y-goal.y)+(result.pass?120:0);if(value>score){score=value;best=action}}
 }return best!
}
