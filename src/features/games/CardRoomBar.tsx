import { useState, type ReactNode } from 'react'
import { Copy } from 'lucide-react'
import type { Room } from './online'

export function CardRoomBar({ room, children }: { room: Room; children?: ReactNode }) {
  const [copiedCode, setCopiedCode] = useState('')
  return <section className="card-room-bar" aria-label="Sala en línea">
    <div className="card-room-identity">
      <span>Código de sala</span>
      <input id={`room-code-${room.id}`} aria-label="Código de sala" value={room.code} readOnly />
    </div>
    <button className="glass-button secondary" type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(room.code)
        setCopiedCode(room.code)
      } catch {
        setCopiedCode('')
        const code = document.getElementById(`room-code-${room.id}`)
        if (code instanceof HTMLInputElement) { code.focus(); code.select() }
      }
    }}><Copy size={15} /> {copiedCode === room.code ? 'Copiado' : 'Copiar'}</button>
    <span className="card-room-status">{room.ready ? `Jugador ${room.seat + 1}` : `Esperando jugadores · ${room.joined ?? 1}/${room.capacity ?? 2}`}</span>
    <div className="card-room-controls">{children}</div>
  </section>
}
