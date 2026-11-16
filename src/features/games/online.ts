import { supabase } from '@/core/cloud/supabase'
import {getProfile} from '@/core/storage/userProfile'
import type { CardState } from './cards/cardEngine'
import type { GameState } from './chess/chessEngine'

export interface Room { members?:{name:string;avatar:string|null;frame?:string;wins?:number}[]; id: string; code: string; kind: string; state: CardState | GameState; unchanged?:boolean; revision: number; seat: number; ready: boolean; joined?: number; capacity?: number }
let avatarSource:string|null|undefined,avatarThumbnail:string|null=null
async function gameProfile(){const profile=getProfile();const source=profile?.avatarDataUrl;if(source!==avatarSource){avatarSource=source;avatarThumbnail=null;if(source?.startsWith('data:image/')){try{const img=new Image();img.src=source;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=80;const ctx=canvas.getContext('2d')!;const size=Math.min(img.width,img.height);ctx.drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,80,80);avatarThumbnail=canvas.toDataURL('image/jpeg',.7)}catch{/* Initials remain available when an old profile image cannot be decoded. */}}}return {name:profile?.name||'Jugador',avatar:avatarThumbnail,frame:profile?.avatarFrame||'none'}}
export async function roomRequest(body: Record<string, unknown>): Promise<Room> {return gameCall<Room>({...body,player:await gameProfile()})}
export async function gameCall<T>(body:Record<string,unknown>):Promise<T>{
  if (!supabase) throw new Error('La conexión todavía no está configurada.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión en Ajustes → Perfil para jugar en línea.')
  const { data, error } = await supabase.functions.invoke('game', { body })
  if (error) {
    const details = await error.context?.json?.().catch(() => null)
    throw new Error(details?.error || error.message || 'No se pudo conectar con la sala.')
  }
  if (data.error) throw new Error(data.error)
  return data as T
}
