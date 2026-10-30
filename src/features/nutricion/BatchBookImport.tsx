import { useRef, useState } from 'react'
import { Files, CheckCircle2, AlertCircle } from 'lucide-react'
import { extractTextFromFile } from '@/core/storage/textExtract'
import { saveBook, type BookItem } from '@/core/storage/mediaLibrary'

export function BatchBookImport() {
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<{ name: string; ok: boolean; detail: string }[]>([])
  const [current, setCurrent] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  async function importFiles(files: File[]) {
    if (lock.current) return
    lock.current = true; setBusy(true); setResults([])
    try {
      for (const [index, file] of files.entries()) {
        setCurrent(`${index + 1}/${files.length} · ${file.name}`)
        try {
          if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('El archivo debe pesar entre 1 byte y 50 MB.')
          const text = await extractTextFromFile(file)
          if (!text.trim()) throw new Error('No contiene texto extraíble. Los PDF escaneados necesitan reconocimiento de texto (OCR).')
          const extension = file.name.split('.').pop()?.toLowerCase()
          const sourceFormat = ({ md: 'markdown', markdown: 'markdown', htm: 'html' } as Record<string, string>)[extension || ''] || extension
          await saveBook({ title: file.name.replace(/\.[^.]+$/, ''), text, folderId: null, sourceFormat: sourceFormat as BookItem['sourceFormat'] })
          setResults(previous => [...previous, { name: file.name, ok: true, detail: `${text.split(/\s+/).length.toLocaleString('es')} palabras` }])
        } catch (error) { setResults(previous => [...previous, { name: file.name, ok: false, detail: error instanceof Error ? error.message : 'No se pudo importar.' }]) }
      }
    } finally { lock.current = false; setBusy(false); setCurrent('') }
  }
  return <details className="gco-surface"><summary><Files size={18} /> Importar varios libros</summary><p>Trae una colección de TXT, PDF, DOCX, EPUB o Markdown. Cada archivo se guarda por separado; un error no cancela los demás.</p><input hidden ref={input} type="file" multiple accept=".txt,.md,.markdown,.html,.htm,.rtf,.pdf,.docx,.epub" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void importFiles(files) }} /><button className="glass-button secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Importando…' : 'Elegir archivos'}</button>{busy && <p role="status">{current}</p>}<ul className="book-import-results" aria-live="polite">{results.map((result, index) => <li key={index}>{result.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}<span><strong>{result.name}</strong><br />{result.detail}</span></li>)}</ul></details>
}
