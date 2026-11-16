export class PlaybackIntent {
 private revision=0
 begin(){return ++this.revision}
 current(token:number){return token===this.revision}
 cancel(){this.revision++}
}
export function preciseSeek(ms:number,durationMs:number){
 if(!Number.isFinite(ms))return null
 return Math.max(0,Number.isFinite(durationMs)&&durationMs>0?Math.min(durationMs,ms):ms)
}
