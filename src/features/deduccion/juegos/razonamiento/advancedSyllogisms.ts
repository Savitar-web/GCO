export type LogicFormula={op:'atom';index:number}|{op:'not';arg:LogicFormula}|{op:'and'|'or'|'implies'|'iff';left:LogicFormula;right:LogicFormula}
export function evaluateFormula(f:LogicFormula,mask:number):boolean{if(f.op==='atom')return !!(mask&(1<<f.index));if(f.op==='not')return !evaluateFormula(f.arg,mask);const a=evaluateFormula(f.left,mask),b=evaluateFormula(f.right,mask);return f.op==='and'?a&&b:f.op==='or'?a||b:f.op==='implies'?!a||b:a===b}
export function formulaText(f:LogicFormula):string{if(f.op==='atom')return 'PQRS'[f.index];if(f.op==='not')return `¬${f.arg.op==='atom'?formulaText(f.arg):'('+formulaText(f.arg)+')'}`;return `(${formulaText(f.left)} ${{and:'∧',or:'∨',implies:'→',iff:'↔'}[f.op]} ${formulaText(f.right)})`}
const atom=(index:number):LogicFormula=>({op:'atom',index}),not=(arg:LogicFormula):LogicFormula=>({op:'not',arg}),binary=(op:'and'|'or'|'implies'|'iff',left:LogicFormula,right:LogicFormula):LogicFormula=>({op,left,right})
export type CertifiedSyllogism={id:string;premises:string[];question:string;options:string[];correct:number;hint:string;explain:string;certificate:{premises:LogicFormula[];options:LogicFormula[];models:number[]}}
export function buildAdvancedSyllogisms(count=144):CertifiedSyllogism[]{
 const out:CertifiedSyllogism[]=[],seen=new Set<string>();let seed=817263
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},int=(n:number)=>Math.floor(random()*n),literal=()=>{const a=atom(int(4));return random()<.4?not(a):a}
 for(let attempt=0;out.length<count&&attempt<100000;attempt++){
  const premises:LogicFormula[]=[literal()]
  for(let i=0;i<3+out.length%3;i++){const left=random()<.65?binary(random()<.5?'and':'or',literal(),literal()):literal(),right=literal();premises.push(binary(random()<.18?'iff':'implies',left,right))}
  const models=Array.from({length:16},(_,i)=>i).filter(mask=>premises.every(f=>evaluateFormula(f,mask)));if(models.length<1||models.length>5)continue
  const candidates:LogicFormula[]=[];for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(i!==j)for(const ni of [false,true])for(const nj of [false,true])candidates.push(binary('implies',ni?not(atom(i)):atom(i),nj?not(atom(j)):atom(j)))
  const premiseTexts=premises.map(formulaText),valid=candidates.filter(f=>!premiseTexts.includes(formulaText(f))&&models.every(m=>evaluateFormula(f,m))),invalid=candidates.filter(f=>models.some(m=>!evaluateFormula(f,m)))
  if(!valid.length||invalid.length<3)continue
  const correct=valid[int(valid.length)],wrong:LogicFormula[]=[];while(wrong.length<3){const f=invalid.splice(int(invalid.length),1)[0];if(!f)break;wrong.push(f)}if(wrong.length<3)continue
  const key=[...premiseTexts].sort().join(';');if(seen.has(key))continue;seen.add(key)
  const options=[correct,...wrong];out.push({id:`certificado-${out.length+1}`,premises:[...premiseTexts,'P, Q, R y S representan proposiciones. ¬: no; ∧: y; ∨: o inclusiva; →: si… entonces; ↔: si y sólo si.'],question:'¿Qué condicional es verdadero en todas las asignaciones que satisfacen las premisas?',options:options.map(f=>`Se sigue necesariamente ${formulaText(f)}.`),correct:0,hint:'Busca asignaciones que satisfagan las premisas y contradigan cada conclusión candidata.',explain:`Las premisas admiten ${models.length} asignaciones: ${models.map(m=>'PQRS'.split('').map((p,i)=>p+'='+Number(!!(m&(1<<i)))).join(', ')).join(' · ')}. La conclusión ${formulaText(correct)} se cumple en todas. Cada alternativa tiene al menos un contraejemplo compatible con las premisas.`,certificate:{premises,options,models}})
 }
 if(out.length<count)throw new Error('No se completó el banco certificado')
 return out
}
export const ADVANCED_SYLLOGISMS=buildAdvancedSyllogisms()
