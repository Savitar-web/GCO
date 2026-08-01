import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { ModeSwitch } from '@/components/ui/ModeSwitch'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import {
  listBooks,
  listFolders,
  saveBook,
  deleteBook,
  createFolder,
  deleteFolder,
  renameBook,
  moveBookToFolder,
  type BookItem,
  type BookFolder,
} from '@/core/storage/mediaLibrary'
import { extractTextFromFile } from '@/core/storage/textExtract'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'

export function NutricionHome() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookItem[]>([])
  const [folders, setFolders] = useState<BookFolder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setBooks(await listBooks())
    setFolders(await listFolders())
  }

  useEffect(() => {
    void refresh()
    const on = () => void refresh()
    window.addEventListener('gco:library', on)
    return () => window.removeEventListener('gco:library', on)
  }, [])

  const visible = books.filter((b) =>
    folderId ? b.folderId === folderId : true
  )

  const addFromText = async () => {
    if (!text.trim()) {
      soundFail()
      return
    }
    soundSuccess()
    const b = await saveBook({
      title: title.trim() || `Texto ${new Date().toLocaleString()}`,
      text: text.trim(),
      folderId,
    })
    setTitle('')
    setText('')
    await refresh()
    navigate(`/nutricion/libro/${b.id}`)
  }

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const content = await extractTextFromFile(file)
      if (!content.trim()) {
        soundFail()
        return
      }
      soundSuccess()
      const b = await saveBook({
        title: file.name.replace(/\.[^.]+$/, ''),
        text: content,
        folderId,
      })
      await refresh()
      navigate(`/nutricion/libro/${b.id}`)
    } catch (e) {
      console.error(e)
      soundFail()
    } finally {
      setBusy(false)
    }
  }

  const pasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) {
        soundFail()
        return
      }
      setText(t)
      soundClick()
    } catch {
      soundFail()
    }
  }

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.65rem',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 'clamp(1.35rem, 4.5vw, 1.85rem)', lineHeight: 1.2 }}>
              🍎 Nutrición
            </h1>
            <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', marginTop: 4 }}>
              Biblioteca de audiolibros
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexShrink: 0,
            }}
          >
            {/* Switch solo en PC */}
            <div className="mode-switch-desktop">
              <ModeSwitch />
            </div>
            <ThemeToggle />
            {/* Ajustes siempre */}
            <button
              type="button"
              className="theme-cycle-btn"
              aria-label="Abrir ajustes"
              onClick={() => {
                soundClick()
                navigate('/ajustes')
              }}
              style={{ width: 44, height: 44, padding: 0, borderRadius: 12 }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
              </span>
            </button>
          </div>
        </div>

        {/* Switch solo en móvil — debajo del título */}
        <div className="mode-switch-mobile" style={{ marginTop: '0.75rem' }}>
          <ModeSwitch fullWidth />
        </div>
      </header>

      <GlassCard>
        <div style={{ padding: '1.2rem 1.1rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Nuevo libro</h2>
          <input
            className="glass-input"
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <textarea
            className="glass-input"
            placeholder="Pega o escribe el texto…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{ marginBottom: 10, resize: 'vertical', lineHeight: 1.45 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GlassButton onClick={() => void addFromText()} disabled={busy}>
              Guardar y leer
            </GlassButton>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => void pasteClipboard()}
            >
              Portapapeles
            </button>
            <button
              type="button"
              className="glass-button secondary"
              disabled={busy}
              onClick={() => {
                soundClick()
                fileRef.current?.click()
              }}
            >
              {busy ? 'Importando…' : 'Subir archivo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,.docx,.epub,text/plain,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </div>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 10,
            }}
          >
            Formatos: TXT, PDF, DOCX, EPUB y portapapeles.
            {folderId
              ? ' Se guardará en la carpeta seleccionada.'
              : ''}
          </p>
        </div>
      </GlassCard>

      {/* Carpetas */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: '1.25rem',
          marginBottom: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className={`glass-button ${folderId === null ? '' : 'secondary'}`}
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
          onClick={() => {
            soundClick()
            setFolderId(null)
          }}
        >
          Todos
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`glass-button ${folderId === f.id ? '' : 'secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
            onClick={() => {
              soundClick()
              setFolderId(f.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              if (confirm(`¿Borrar carpeta “${f.name}”?`)) {
                void deleteFolder(f.id).then(() => {
                  setFolderId(null)
                  void refresh()
                })
              }
            }}
          >
            📁 {f.name}
          </button>
        ))}
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
          onClick={() => {
            soundClick()
            const name = prompt('Nombre de la carpeta')
            if (name?.trim()) void createFolder(name.trim()).then(refresh)
          }}
        >
          + Carpeta
        </button>
      </div>

      <h3 style={{ margin: '0.5rem 0 0.65rem', fontSize: '1rem' }}>
        Biblioteca ({visible.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.length === 0 && (
          <p style={{ color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
            Aún no hay libros aquí.
          </p>
        )}
        {visible.map((b) => (
          <div
            key={b.id}
            className="glass-card"
            style={{
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {renamingId === b.id ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="glass-input"
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="glass-button"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => {
                    soundSuccess()
                    void renameBook(b.id, renameVal).then(() => {
                      setRenamingId(null)
                      void refresh()
                    })
                  }}
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  soundClick()
                  navigate(`/nutricion/libro/${b.id}`)
                }}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  font: 'inherit',
                  padding: 0,
                }}
              >
                <p style={{ fontWeight: 600 }}>{b.title}</p>
                <p
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--gco-ink-muted)',
                  }}
                >
                  {b.text.length.toLocaleString()} caracteres · pos {b.position}
                  {b.folderId
                    ? ` · ${folders.find((f) => f.id === b.folderId)?.name ?? ''}`
                    : ''}
                </p>
              </button>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                onClick={() => {
                  soundClick()
                  setRenamingId(b.id)
                  setRenameVal(b.title)
                }}
              >
                Renombrar
              </button>
              <select
                className="glass-input"
                style={{ fontSize: '0.75rem', maxWidth: 140, padding: '0.3rem' }}
                value={b.folderId ?? ''}
                onChange={(e) => {
                  soundClick()
                  const v = e.target.value || null
                  void moveBookToFolder(b.id, v).then(refresh)
                }}
              >
                <option value="">Sin carpeta</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                onClick={() => {
                  soundClick()
                  void deleteBook(b.id).then(refresh)
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}