import { useState } from 'react'
import { Headphones, BookmarkPlus, Trash2 } from 'lucide-react'
import { useMediaPlayer } from '@/hooks/useMediaPlayer'

type SavedVideo = { id: string; title: string }
const STORAGE = 'gco:youtube-links-v1'
function youtubeId(value: string): string | null {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    const host = url.hostname.toLowerCase()
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host) ? url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] : null
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}
function savedVideos(): SavedVideo[] {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(saved) ? saved.filter(item => /^[A-Za-z0-9_-]{11}$/.test(item.id) && typeof item.title === 'string') : [] } catch { return [] }
}
export function OnlineMusic() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [saved, setSaved] = useState(savedVideos)
  const [message, setMessage] = useState('')
  const player = useMediaPlayer()
  function persist(next: SavedVideo[]) {
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaved(next); window.dispatchEvent(new Event('gco:library')) }
    catch { setMessage('No queda espacio para guardar el enlace.') }
  }
  function preview(id: string) { if (player.playing) void player.toggle(); setCurrent(id); setMessage('') }
  return <section className="gco-surface"><div className="gco-section-heading"><Headphones size={28} /><div><span className="gco-eyebrow">Escucha primero</span><h2>YouTube, a tu biblioteca</h2></div></div>
    <p>Escucha y guarda tus enlaces favoritos. Funciona con tu computadora apagada: solo necesitas Internet.</p>
    <form className="gco-form" onSubmit={event => { event.preventDefault(); const id = youtubeId(url.trim()); if (!id) { setMessage('Pega el enlace de un video de YouTube, no de una búsqueda o lista.'); return } preview(id) }}>
      <label>Enlace del video<input className="glass-input" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={event => setUrl(event.target.value)} required /></label>
      <label>Nombre en tu biblioteca<input className="glass-input" maxLength={150} placeholder="Artista — canción" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <div className="gco-actions"><button className="glass-button">Preescuchar</button><a href="https://www.youtube.com" target="_blank" rel="noreferrer" className="gco-text-button">Buscar en YouTube ↗</a></div>
    </form>
    {current && <div style={{ marginTop: 20 }}><iframe key={current} className="youtube-preview" title="Preescucha de YouTube" src={`https://www.youtube-nocookie.com/embed/${current}?playsinline=1&rel=0`} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /><div className="gco-actions"><button className="glass-button secondary" onClick={() => { persist([{ id: current, title: title.trim() || `YouTube · ${current}` }, ...savedVideos().filter(item => item.id !== current)]); setMessage('Enlace guardado en esta sección.') }}><BookmarkPlus size={18} /> Guardar enlace</button><button className="gco-text-button" onClick={() => setCurrent(null)}>Cerrar preescucha</button><a className="gco-text-button" href={`https://www.youtube.com/watch?v=${current}`} target="_blank" rel="noreferrer">Abrir en YouTube</a></div></div>}
    {message && <p role="status" className="gco-callout">{message}</p>}
    {saved.length > 0 && <><h3>Enlaces guardados · {saved.length}</h3>{saved.map(video => <div className="online-track" key={video.id}><button className="gco-text-button" onClick={() => { setTitle(video.title); preview(video.id) }}>{video.title}</button><button className="gco-text-button" aria-label={`Quitar enlace ${video.title}`} onClick={() => persist(savedVideos().filter(item => item.id !== video.id))}><Trash2 size={18} /></button></div>)}</>}
    <p style={{ fontSize: '.85rem' }}>Guardar un enlace no descarga el audio. Para escuchar sin Internet, importa archivos desde tu dispositivo. Algunos videos no permiten reproducción externa; usa «Abrir en YouTube» en ese caso.</p>
  </section>
}
