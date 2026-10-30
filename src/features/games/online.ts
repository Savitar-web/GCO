import { supabase } from '@/core/cloud/supabase'
import type { CardState } from './cards/cardEngine'
import type { GameState } from './chess/chessEngine'

export interface Room { id: string; code: string; kind: string; state: CardState | GameState; revision: number; seat: number; ready: boolean; joined?: number; capacity?: number }
export async function roomRequest(body: Record<string, unknown>): Promise<Room> {
  if (!supabase) throw new Error('La conexión todavía no está configurada.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión en Ajustes → Perfil para jugar en línea.')
  const { data, error } = await supabase.functions.invoke('game', { body })
  if (error) {
    const details = await error.context?.json?.().catch(() => null)
    throw new Error(details?.error || error.message || 'No se pudo conectar con la sala.')
  }
  if (data.error) throw new Error(data.error)
  return data as Room
}
