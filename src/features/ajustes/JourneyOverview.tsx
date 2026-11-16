import {getUnifiedGameStats} from '@/core/profileGameStats'
import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, Headphones, Trophy, Download } from 'lucide-react'
import { listBooks, listTracks, listPlaylists, type BookItem, type TrackItem } from '@/core/storage/mediaLibrary'
import { formatDuration } from '@/core/storage/progress'
import { getRoutines, getRoutinePrefs } from '@/core/storage/routines'

function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
export function JourneyOverview() {
  const [books, setBooks] = useState<BookItem[]>([])
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [playlists, setPlaylists] = useState(0)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  useEffect(() => {
    let active = true
    const refresh = () => {
      setTick(value => value + 1)
      void Promise.all([listBooks(), listTracks(), listPlaylists()]).then(([nextBooks, nextTracks, nextLists]) => { if (active) { setBooks(nextBooks); setTracks(nextTracks); setPlaylists(nextLists.length); setLoading(false) } }).catch(()=>{if(active)setLoading(false)})
    }
    refresh()
    window.addEventListener('gco:library', refresh); window.addEventListener('gco:progress', refresh); window.addEventListener('storage', refresh)
    return () => { active = false; window.removeEventListener('gco:library', refresh); window.removeEventListener('gco:progress', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  void tick
  const listen = Object.values(read<Record<string, { plays: number; ms: number }>>('gco:music-listen-stats-v1', {}))
  const rows=getUnifiedGameStats()
  const bookPercent=(book:BookItem)=>Math.round(Math.min(1,Math.max(book.documentProgress??0,Math.max(0,book.position)/Math.max(1,book.text.length)))*100)
  const annotated = books.reduce((sum, book) => sum + (book.bookmarks?.length || 0) + (book.comments?.length || 0) + (book.highlights?.length || 0), 0)
  const readingPercent = books.length ? Math.round(books.reduce((sum, book) => sum + bookPercent(book)/100, 0) / books.length * 100) : 0
  function exportSummary() {
    const csv = [['Módulo', 'Juego', 'Partidas', 'Victorias', 'Empates', 'Nivel', 'Tiempo registrado (ms)', 'Última actividad'], ...rows.map(row => [row.category, row.label, row.attempts, row.wins, row.draws, row.level, row.time, row.last || ''])].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'gco-recorrido.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="gco-surface"><div className="gco-section-heading"><BarChart3 size={28} /><div><span className="gco-eyebrow">Tu recorrido completo</span><h2>Todo lo que has construido</h2></div></div>
    <div className="gco-stat-grid"><div className="gco-stat"><Trophy size={20} /><strong>{rows.reduce((sum, row) => sum + row.attempts, 0)}</strong><small>Partidas registradas</small></div><div className="gco-stat"><BookOpen size={20} /><strong>{loading ? '…' : books.length}</strong><small>Libros · {readingPercent}% avance medio</small></div><div className="gco-stat"><Headphones size={20} /><strong>{loading ? '…' : tracks.length}</strong><small>Pistas · {playlists} listas</small></div></div>
    <div className="gco-actions" style={{ margin: '22px 0' }}><label>Filtrar módulo <select className="glass-input" value={category} onChange={event => setCategory(event.target.value)}>{[['all', 'Todos'], ['memoria', 'Memoria'], ['logica', 'Lógica'], ['deduccion', 'Deducción'], ['games', 'Juegos de mesa'], ['lectura','Lectura'], ['conocimiento','Conocimiento'], ['matematicas','Matemáticas']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="glass-button secondary" onClick={exportSummary}><Download size={16} /> Exportar resumen CSV</button></div>
    <div className="gco-table-scroll"><table className="gco-data-table"><caption style={{ textAlign: 'left', marginBottom: 12 }}>Actividad local y sincronizada · nivel actual y acumulados</caption><thead><tr><th>Juego</th><th>Partidas</th><th>Victorias / niveles superados</th><th>Empates</th><th>Nivel actual / desbloqueado</th><th>Tiempo*</th></tr></thead><tbody>{rows.filter(row => category === 'all' || row.category === category).map(row => <tr key={row.key}><td>{row.label}<small style={{ display: 'block', opacity: .65 }}>{row.last ? new Date(row.last).toLocaleDateString('es') : 'Sin actividad registrada'}</small></td><td>{row.key.startsWith('despejes:')?'No registrado':row.attempts}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.level || '—'}</td><td>{row.time ? formatDuration(row.time) : '—'}</td></tr>)}</tbody></table></div>
    <p style={{ fontSize: '.78rem' }}>* Cobertura: los datos antiguos provienen del historial conservado; los tiempos eliminados antes de esta actualización no se pueden reconstruir. Desde ahora se conserva el tiempo acumulado de los ejercicios que registran resultados. Despejes muestra niveles superados únicos; no se inventan intentos ni tiempos antiguos.</p>
    <div className="gco-stat-grid"><div className="gco-stat"><strong>{annotated}</strong><small>Notas, marcadores y resaltados</small></div><div className="gco-stat"><strong>{Math.round(listen.reduce((sum, item) => sum + item.ms, 0) / 60000)} min</strong><small>Escucha registrada · {listen.reduce((sum, item) => sum + item.plays, 0)} reproducciones</small></div><div className="gco-stat"><strong>{getRoutines().length}</strong><small>Rutinas · {getRoutinePrefs().session ? 'Sesión en curso' : 'Sin sesión activa'}</small></div><div className="gco-stat"><strong>{(tracks.reduce((sum, track) => sum + (track.sizeBytes || 0), 0) / 1048576).toFixed(1)} MB</strong><small>Audio local · {read<unknown[]>('gco:youtube-links-v1', []).length} enlaces de YouTube</small></div></div>
    {books.length > 0 && <details style={{ marginTop: 20 }}><summary>Avance de cada libro</summary>{books.map(book => <div key={book.id} style={{ margin: '14px 0' }}><div>{book.title} · {bookPercent(book)}%</div><progress max={100} value={bookPercent(book)} style={{ width: '100%' }} /></div>)}</details>}
  </section>
}
