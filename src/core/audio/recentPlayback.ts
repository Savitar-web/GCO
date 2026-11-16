export function recentPlayback<T extends {id:string}>(tracks:T[],stats:Record<string,{lastAt?:number}>,onlyPlayed=false):T[]{
 return tracks.filter(track=>!onlyPlayed||(stats[track.id]?.lastAt??0)>0).slice().sort((a,b)=>(stats[b.id]?.lastAt??0)-(stats[a.id]?.lastAt??0))
}
