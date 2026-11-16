/** Trace only the exposed edges of a polyomino; internal cell edges disappear. */
export function polyominoPath(mask: readonly (readonly number[])[],cell:number,gap:number,radius=7){
 const pitch=cell+gap,has=new Set(mask.map(([r,c])=>`${r}:${c}`));const edges:number[][]=[]
 for(const [r,c] of mask){const x=c*pitch,y=r*pitch;const right=has.has(`${r}:${c+1}`)?x+pitch:x+cell,bottom=has.has(`${r+1}:${c}`)?y+pitch:y+cell
 // Extend a cell toward its neighbours to bridge the visual grid gap.
 const left=has.has(`${r}:${c-1}`)?x-gap:x,top=has.has(`${r-1}:${c}`)?y-gap:y
 // Union rectangles below handles the bridges as occupied micro-grid rectangles.
 edges.push([left,top,right,bottom])}
 const xs=[...new Set(edges.flatMap(e=>[e[0],e[2]]))].sort((a,b)=>a-b),ys=[...new Set(edges.flatMap(e=>[e[1],e[3]]))].sort((a,b)=>a-b)
 const filled=(i:number,j:number)=>i>=0&&j>=0&&i<xs.length-1&&j<ys.length-1&&edges.some(([l,t,r,b])=>(xs[i]+xs[i+1])/2>l&&(xs[i]+xs[i+1])/2<r&&(ys[j]+ys[j+1])/2>t&&(ys[j]+ys[j+1])/2<b)
 const links=new Map<string,number[]>(),key=(x:number,y:number)=>`${x}:${y}`
 for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){if(!filled(i,j))continue;const l=xs[i],r=xs[i+1],t=ys[j],b=ys[j+1];if(!filled(i,j-1))links.set(key(l,t),[r,t]);if(!filled(i+1,j))links.set(key(r,t),[r,b]);if(!filled(i,j+1))links.set(key(r,b),[l,b]);if(!filled(i-1,j))links.set(key(l,b),[l,t])}
 let path='';while(links.size){const first=links.keys().next().value!;let current=first;const points:number[][]=[];do{points.push(current.split(':').map(Number));const next=links.get(current);if(!next)break;links.delete(current);current=key(next[0],next[1])}while(current!==first)
 const corners=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0])})
 const pairs=corners.map((p,i)=>{const a=corners[(i+corners.length-1)%corners.length],b=corners[(i+1)%corners.length],d1=Math.hypot(p[0]-a[0],p[1]-a[1]),d2=Math.hypot(b[0]-p[0],b[1]-p[1]),r=Math.min(radius,d1/2,d2/2);return {p,in:[p[0]+(a[0]-p[0])*r/d1,p[1]+(a[1]-p[1])*r/d1],out:[p[0]+(b[0]-p[0])*r/d2,p[1]+(b[1]-p[1])*r/d2]}})
 if(pairs.length){path+=`M${pairs[0].in.join(',')}`;for(const c of pairs)path+=`L${c.in.join(',')}Q${c.p.join(',')} ${c.out.join(',')}`;path+='Z'}}return path
}
