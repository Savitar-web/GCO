import type {Point} from './engine'
export const SHOT_SLOWDOWN=.72
export function motionDuration(simulationMs:number){return Math.max(420,Math.min(3600,simulationMs*SHOT_SLOWDOWN))}
export function sampleMotion(frames:Point[][],progress:number):Point[]{
 if(!frames.length)return []
 const at=Math.max(0,Math.min(1,progress))*(frames.length-1),i=Math.floor(at),t=at-i,a=frames[i],b=frames[Math.min(i+1,frames.length-1)]
 return a.map((p,n)=>({x:p.x+(b[n].x-p.x)*t,y:p.y+(b[n].y-p.y)*t}))
}
