import { useMemo, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

export function ReaderTools({ text, position, onJump }: { text: string; position: number; onJump: (position: number) => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const words = useMemo(() => text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').split(/\s+/).filter(Boolean).length, [text])
  const matches = useMemo(() => {
    const result: number[] = []
    if (query.trim().length < 2) return result
    const haystack = text.toLocaleLowerCase(); const needle = query.trim().toLocaleLowerCase()
    let cursor = haystack.indexOf(needle)
    while (cursor >= 0 && result.length < 500) { result.push(cursor); cursor = haystack.indexOf(needle, cursor + needle.length) }
    return result
  }, [text, query])
  const percent = Math.min(100, Math.max(0, position / Math.max(1, text.length) * 100))
  return <details className="reader-tools"><summary><BookOpen size={16} /> Tu lectura · {Math.round(percent)}% · ~{Math.max(0, Math.ceil(words * (1 - percent / 100) / 220))} min restantes</summary><div className="reader-session-summary"><span>{words.toLocaleString('es')} palabras</span><span>Estimación a 220 palabras/min</span></div><form className="reader-search" onSubmit={event => { event.preventDefault(); if (matches.length) onJump(matches[index % matches.length]) }}><label><Search size={16} /><input aria-label="Buscar dentro del libro" className="glass-input" value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }} placeholder="Buscar dentro del libro…" /></label><button type="submit" className="reader-icon-btn" disabled={!matches.length} aria-label="Ir al resultado"><Search size={17} /></button><button type="button" className="reader-icon-btn" disabled={!matches.length} aria-label="Resultado anterior" onClick={() => { const next = (index - 1 + matches.length) % matches.length; setIndex(next); onJump(matches[next]) }}><ChevronLeft size={18} /></button><button type="button" className="reader-icon-btn" disabled={!matches.length} aria-label="Resultado siguiente" onClick={() => { const next = (index + 1) % matches.length; setIndex(next); onJump(matches[next]) }}><ChevronRight size={18} /></button><span aria-live="polite">{query.trim().length < 2 ? 'Escribe al menos 2 letras' : matches.length ? `${index + 1}/${matches.length}${matches.length === 500 ? '+' : ''}` : 'Sin resultados'}</span></form></details>
}
