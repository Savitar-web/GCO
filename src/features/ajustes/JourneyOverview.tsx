import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, Headphones, Trophy, Download } from 'lucide-react'
import { listBooks, listTracks, listPlaylists, type BookItem, type TrackItem } from '@/core/storage/mediaLibrary'
import { getAllProgress, formatDuration } from '@/core/storage/progress'
import { loadChessHistory } from '@/features/games/chess/chessHistory'
import { getRoutines, getRoutinePrefs } from '@/core/storage/routines'

const catalog: [string, string][] = [
  ['memoria:secuencia-colores', 'Secuencia de colores'], ['memoria:numeros-asociados', 'Números asociados'], ['memoria:cartas', 'Memoria de cartas'], ['memoria:nexo', 'Nexo'], ['memoria:habilidades', 'Habilidades'],
  ['logica:numberpuzzle', 'Colocador'], ['logica:despejes', 'Despejes'], ['logica:rompecabezas', 'Rompecabezas'], ['logica:blockcleaner', 'Block Cleaner'],
  ['deduccion:acertijos', 'Acertijos'], ['deduccion:historias', 'Historias'], ['deduccion:palabras', 'Palabras'], ['deduccion:silogismos', 'Silogismos'], ['deduccion:mapas', 'Mapas'], ['deduccion:codigo', 'Código'], ['deduccion:idiomas', 'Idiomas'],
]
type TableResult = { kind: string; result: string; durationMs: number; at: string }
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
      void Promise.all([listBooks(), listTracks(), listPlaylists()]).then(([nextBooks, nextTracks, nextLists]) => { if (active) { setBooks(nextBooks); setTracks(nextTracks); setPlaylists(nextLists.length); setLoading(false) } })
    }
    refresh()
    window.addEventListener('gco:library', refresh); window.addEventListener('gco:progress', refresh); window.addEventListener('storage', refresh)
    return () => { active = false; window.removeEventListener('gco:library', refresh); window.removeEventListener('gco:progress', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  void tick
  const progress = getAllProgress()
  const tableHistory = read<TableResult[]>('gco:table-history-v1', [])
  const chessHistory = loadChessHistory()
  const listen = Object.values(read<Record<string, { plays: number; ms: number }>>('gco:music-listen-stats-v1', {}))
  const rows = [...catalog, ...Object.keys(progress).filter(key => !catalog.some(entry => entry[0] === key)).map(key => [key, key.split(':').at(-1)!] as [string, string])].map(([key, label]) => {
    const item = progress[key]
    return { key, label, category: key.split(':')[0], attempts: item?.totalAttempts || 0, wins: item?.totalCompleted || 0, draws: 0, level: item?.highestLevel || 0, time: (item?.history || []).reduce((sum, entry) => sum + (entry.timeMs || 0), 0), last: item?.lastPlayedAt }
  })
  for (const [kind, label] of [['ajedrez', 'Ajedrez'], ['poker', 'Póker'], ['solitario', 'Solitario'], ['21', '21'], ['conquian', 'Conquián']]) {
    const entries = tableHistory.filter(entry => entry.kind === kind)
    const legacy = kind === 'ajedrez' ? chessHistory : []
    rows.push({ key: `games:${kind}`, label, category: 'games', attempts: entries.length + legacy.length, wins: entries.filter(entry => entry.result === 'win').length + legacy.filter(entry => entry.result === 'win').length, draws: entries.filter(entry => entry.result === 'draw').length + legacy.filter(entry => entry.result === 'draw').length, level: 0, time: entries.reduce((sum, entry) => sum + entry.durationMs, 0) + legacy.reduce((sum, entry) => sum + entry.durationSec * 1000, 0), last: [...entries.map(entry => entry.at), ...legacy.map(entry => new Date(entry.date).toISOString())].sort().at(-1) })
  }
  const annotated = books.reduce((sum, book) => sum + (book.bookmarks?.length || 0) + (book.comments?.length || 0) + (book.highlights?.length || 0), 0)
  const readingPercent = books.length ? Math.round(books.reduce((sum, book) => sum + Math.min(1, Math.max(0, book.position) / Math.max(1, book.text.length)), 0) / books.length * 100) : 0
  function exportSummary() {
    const csv = [['Módulo', 'Juego', 'Partidas', 'Victorias', 'Empates', 'Nivel', 'Tiempo registrado (ms)', 'Última actividad'], ...rows.map(row => [row.category, row.label, row.attempts, row.wins, row.draws, row.level, row.time, row.last || ''])].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'gco-recorrido.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="gco-surface"><div className="gco-section-heading"><BarChart3 size={28} /><div><span className="gco-eyebrow">Tu recorrido completo</span><h2>Todo lo que has construido</h2></div></div>
    <div className="gco-stat-grid"><div className="gco-stat"><Trophy size={20} /><strong>{rows.reduce((sum, row) => sum + row.attempts, 0)}</strong><small>Partidas registradas</small></div><div className="gco-stat"><BookOpen size={20} /><strong>{loading ? '…' : books.length}</strong><small>Libros · {readingPercent}% avance medio</small></div><div className="gco-stat"><Headphones size={20} /><strong>{loading ? '…' : tracks.length}</strong><small>Pistas · {playlists} listas</small></div></div>
    <div className="gco-actions" style={{ margin: '22px 0' }}><label>Filtrar módulo <select className="glass-input" value={category} onChange={event => setCategory(event.target.value)}>{[['all', 'Todos'], ['memoria', 'Memoria'], ['logica', 'Lógica'], ['deduccion', 'Deducción'], ['games', 'Juegos de mesa']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="glass-button secondary" onClick={exportSummary}><Download size={16} /> Exportar resumen CSV</button></div>
    <div className="gco-table-scroll"><table className="gco-data-table"><caption style={{ textAlign: 'left', marginBottom: 12 }}>Todos los juegos, incluidos los que aún no has probado</caption><thead><tr><th>Juego</th><th>Partidas</th><th>Victorias</th><th>Empates</th><th>Nivel</th><th>Tiempo*</th></tr></thead><tbody>{rows.filter(row => category === 'all' || row.category === category).map(row => <tr key={row.key}><td>{row.label}<small style={{ display: 'block', opacity: .65 }}>{row.last ? new Date(row.last).toLocaleDateString('es') : 'Sin actividad registrada'}</small></td><td>{row.attempts}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.level || '—'}</td><td>{row.time ? formatDuration(row.time) : '—'}</td></tr>)}</tbody></table></div>
    <p style={{ fontSize: '.78rem' }}>* El tiempo corresponde al historial conservado, que tiene un límite de registros; no es el tiempo acumulado de toda la vida. Las partidas antiguas sin registro no se reconstruyen.</p>
    <div className="gco-stat-grid"><div className="gco-stat"><strong>{annotated}</strong><small>Notas, marcadores y resaltados</small></div><div className="gco-stat"><strong>{Math.round(listen.reduce((sum, item) => sum + item.ms, 0) / 60000)} min</strong><small>Escucha registrada · {listen.reduce((sum, item) => sum + item.plays, 0)} reproducciones</small></div><div className="gco-stat"><strong>{getRoutines().length}</strong><small>Rutinas · {getRoutinePrefs().session ? 'Sesión en curso' : 'Sin sesión activa'}</small></div><div className="gco-stat"><strong>{(tracks.reduce((sum, track) => sum + (track.sizeBytes || 0), 0) / 1048576).toFixed(1)} MB</strong><small>Audio local · {read<unknown[]>('gco:youtube-links-v1', []).length} enlaces de YouTube</small></div></div>
    {books.length > 0 && <details style={{ marginTop: 20 }}><summary>Avance de cada libro</summary>{books.map(book => <div key={book.id} style={{ margin: '14px 0' }}><div>{book.title} · {Math.min(100, Math.round(book.position / Math.max(1, book.text.length) * 100))}%</div><progress max={Math.max(1, book.text.length)} value={Math.min(book.position, book.text.length)} style={{ width: '100%' }} /></div>)}</details>}
  </section>
}
