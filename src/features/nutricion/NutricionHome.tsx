import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
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
  moveBookToFolder,
  updateBookMeta,
  type BookItem,
  type BookFolder,
} from '@/core/storage/mediaLibrary'
import { extractTextFromFile } from '@/core/storage/textExtract'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { useReaderPlayer } from '@/core/reader/ReaderPlayerContext.tsx'

/* ───────────────────────── Iconos ───────────────────────── */

function IconHeadphones() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 13a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1v-7h3M3 13v7h3v-7H3m0 0v-1a9 9 0 0 1 .5-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 20a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h3v5Z" />
    </svg>
  )
}
function IconList() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}
function IconPlayCircle() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconDownload() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
function IconDots() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function IconFolderPlus() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 11v4M10 13h4" />
    </svg>
  )
}
function IconKebab() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
    </svg>
  )
}
function IconMove() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}
function IconPaste() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h6a1 1 0 0 1 1 1v1H8V6a1 1 0 0 1 1-1Z" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    </svg>
  )
}
function IconFile() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}
function IconType() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5h16v2M9 5v14m0 0h6" />
    </svg>
  )
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
function IconImage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

/* ───────────────────────── Navegación ───────────────────────── */

type NavId = 'inicio' | 'biblioteca' | 'listas' | 'reproduciendo' | 'importar' | 'mas'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

/* ───────────────────────── Componente principal ───────────────────────── */

export function NutricionHome() {
  const navigate = useNavigate()
  const { activeBook, loadBook } = useReaderPlayer()

  const [books, setBooks] = useState<BookItem[]>([])
  const [folders, setFolders] = useState<BookFolder[]>([])
  const [busy, setBusy] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'estanteria' | 'listas'>('estanteria')

  const [importOpen, setImportOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<BookItem | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

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

  const continuing = useMemo(
    () => books.filter((b) => b.position > 0).slice(0, 8),
    [books]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return books
    const q = query.trim().toLowerCase()
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q)
    )
  }, [books, query])

  const byFolder = (id: string | null) => filtered.filter((b) => b.folderId === id)
  const noFolderBooks = byFolder(null)

  const openBook = (b: BookItem) => {
    soundClick()
    loadBook(b, b.position)
    navigate(`/nutricion/libro/${b.id}`)
  }

  const nav = (id: NavId) => {
    soundClick()
    if (id === 'inicio' || id === 'biblioteca') {
      setQuery('')
      setSearchOpen(false)
    } else if (id === 'listas') {
      setViewMode((v) => (v === 'listas' ? 'estanteria' : 'listas'))
    } else if (id === 'reproduciendo') {
      if (activeBook) navigate(`/nutricion/libro/${activeBook.id}`)
    } else if (id === 'importar') {
      setImportOpen(true)
    } else if (id === 'mas') {
      navigate('/ajustes')
    }
  }

  const NAV_ITEMS: { id: NavId; label: string; icon: ReactNode }[] = [
    { id: 'biblioteca', label: 'Biblioteca', icon: <IconHeadphones /> },
    { id: 'listas', label: 'Listas', icon: <IconList /> },
    { id: 'reproduciendo', label: 'Reproduciendo', icon: <IconPlayCircle /> },
    { id: 'importar', label: 'Importar', icon: <IconDownload /> },
    { id: 'mas', label: 'Más', icon: <IconDots /> },
  ]

  const MOBILE_NAV: { id: NavId; label: string; icon: ReactNode }[] = [
    { id: 'inicio', label: 'Nutrición', icon: <span style={{ fontSize: 18 }}>🍎</span> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <IconHeadphones /> },
    { id: 'importar', label: 'Importar', icon: <IconDownload /> },
    { id: 'listas', label: 'Buscar', icon: <IconSearch /> },
  ]

  return (
    <div className="app-layout">
      {/* ───── Sidebar (desktop) ───── */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">🍎 Nutrición</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-nav-item ${
              (item.id === 'biblioteca' && viewMode === 'estanteria') ||
              (item.id === 'listas' && viewMode === 'listas')
                ? 'active'
                : ''
            }`}
            onClick={() => nav(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </aside>

      <div className="app-main">
        <div className="app-shell app-shell-pro">
          <header style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.65rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 style={{ fontSize: 'clamp(1.35rem, 4.5vw, 1.85rem)', lineHeight: 1.2 }}>🍎 Nutrición</h1>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', marginTop: 4 }}>
                  Biblioteca de audiolibros
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <div className="mode-switch-desktop">
                  <ModeSwitch />
                </div>
                <button
                  type="button"
                  className="theme-cycle-btn"
                  aria-label="Buscar"
                  onClick={() => {
                    soundClick()
                    setSearchOpen((v) => !v)
                  }}
                  style={{ width: 40, height: 40, padding: 0, borderRadius: 12 }}
                >
                  <IconSearch />
                </button>
                <ThemeToggle />
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
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                    <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                    <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                  </span>
                </button>
              </div>
            </div>

            <div className="mode-switch-mobile" style={{ marginTop: '0.75rem' }}>
              <ModeSwitch fullWidth />
            </div>

            {searchOpen && (
              <input
                autoFocus
                className="glass-input"
                placeholder="Buscar por título o autor…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ marginTop: '0.85rem' }}
              />
            )}
          </header>

          {/* ───── Continuar ───── */}
          {continuing.length > 0 && !query && (
            <section style={{ marginBottom: '1.6rem' }}>
              <div className="folder-row-header" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: '1rem' }}>Continuar</h2>
              </div>
              <div className="hscroll">
                {continuing.map((b) => {
                  const pct = b.text.length ? Math.round((b.position / b.text.length) * 100) : 0
                  return (
                    <div
                      key={b.id}
                      className="glass-card continue-card"
                      onClick={() => openBook(b)}
                    >
                      <div
                        className="book-cover book-cover-lg"
                        style={b.coverDataUrl ? { backgroundImage: `url(${b.coverDataUrl})` } : undefined}
                      >
                        {!b.coverDataUrl && b.title.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.title}
                        </p>
                        {b.author && (
                          <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>{b.author}</p>
                        )}
                        <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', marginTop: 4 }}>
                          Libro · {pct}% completado
                        </p>
                        <div className="mini-player-progress" style={{ marginTop: 6 }}>
                          <div className="mini-player-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ───── Nuevo / Añadir carpeta ───── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.4rem' }}>
            <GlassButton
              onClick={() => {
                soundClick()
                setImportOpen(true)
              }}
            >
              + Nuevo libro
            </GlassButton>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                const name = prompt('Nombre de la carpeta')
                if (name?.trim()) void createFolder(name.trim()).then(refresh)
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconFolderPlus /> Añadir carpeta
              </span>
            </button>
          </div>

          {/* ───── Carpetas ───── */}
          {folders.map((f) => {
            const items = byFolder(f.id)
            if (query && items.length === 0) return null
            return (
              <section key={f.id} style={{ marginBottom: '1.2rem' }}>
                <div className="folder-row-header">
                  <h3 style={{ fontSize: '1rem' }}>📁 {f.name}</h3>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Borrar carpeta ${f.name}`}
                    onClick={() => {
                      soundClick()
                      if (confirm(`¿Borrar la carpeta "${f.name}"? Los libros pasarán a "Sin carpeta".`)) {
                        void deleteFolder(f.id).then(refresh)
                      }
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
                {viewMode === 'estanteria' ? (
                  <div className="hscroll">
                    {items.map((b) => (
                      <BookCard
                        key={b.id}
                        book={b}
                        variant="shelf"
                        menuOpen={menuFor === b.id}
                        onOpen={() => openBook(b)}
                        onMenuToggle={() => setMenuFor(menuFor === b.id ? null : b.id)}
                        onEdit={() => {
                          setMenuFor(null)
                          setEditingBook(b)
                        }}
                        onDelete={() => {
                          setMenuFor(null)
                          soundClick()
                          void deleteBook(b.id).then(refresh)
                        }}
                        folders={folders}
                        onMove={(fid) => {
                          setMenuFor(null)
                          void moveBookToFolder(b.id, fid).then(refresh)
                        }}
                      />
                    ))}
                    {items.length === 0 && (
                      <p style={{ color: 'var(--gco-ink-faint)', fontSize: '0.85rem' }}>Carpeta vacía.</p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((b) => (
                      <BookRow
                        key={b.id}
                        book={b}
                        onOpen={() => openBook(b)}
                        onEdit={() => setEditingBook(b)}
                        onDelete={() => void deleteBook(b.id).then(refresh)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}

          {/* ───── Sin carpeta ───── */}
          <section style={{ marginBottom: '2rem' }}>
            <div className="folder-row-header">
              <h3 style={{ fontSize: '1rem' }}>
                {folders.length > 0 ? 'Sin carpeta' : `Biblioteca (${noFolderBooks.length})`}
              </h3>
            </div>
            {noFolderBooks.length === 0 && (
              <p style={{ color: 'var(--gco-ink-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                {query ? 'Sin resultados.' : 'Aún no hay libros aquí. Importa uno para empezar.'}
              </p>
            )}
            {viewMode === 'estanteria' ? (
              <div className="book-grid">
                {noFolderBooks.map((b) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    variant="grid"
                    menuOpen={menuFor === b.id}
                    onOpen={() => openBook(b)}
                    onMenuToggle={() => setMenuFor(menuFor === b.id ? null : b.id)}
                    onEdit={() => {
                      setMenuFor(null)
                      setEditingBook(b)
                    }}
                    onDelete={() => {
                      setMenuFor(null)
                      soundClick()
                      void deleteBook(b.id).then(refresh)
                    }}
                    folders={folders}
                    onMove={(fid) => {
                      setMenuFor(null)
                      void moveBookToFolder(b.id, fid).then(refresh)
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {noFolderBooks.map((b) => (
                  <BookRow
                    key={b.id}
                    book={b}
                    onOpen={() => openBook(b)}
                    onEdit={() => setEditingBook(b)}
                    onDelete={() => void deleteBook(b.id).then(refresh)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ───── Bottom nav (móvil) ───── */}
      <nav className="bottom-nav" aria-label="Navegación">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${
              (item.id === 'biblioteca' && !searchOpen) ||
              (item.id === 'listas' && searchOpen)
                ? 'active'
                : item.id === 'inicio'
                  ? 'active'
                  : ''
            }`}
            onClick={() => {
              if (item.id === 'listas') {
                soundClick()
                setSearchOpen((v) => !v)
              } else {
                nav(item.id)
              }
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {importOpen && (
        <ImportModal
          folders={folders}
          defaultFolderId={null}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setImportOpen(false)}
          onCreated={async (b) => {
            await refresh()
            setImportOpen(false)
            openBook(b)
          }}
        />
      )}

      {editingBook && (
        <EditBookModal
          book={editingBook}
          folders={folders}
          onClose={() => setEditingBook(null)}
          onSaved={async () => {
            setEditingBook(null)
            await refresh()
          }}
        />
      )}

      <input ref={fileRef} type="file" hidden />
    </div>
  )
}

/* ───────────────────────── Tarjeta de libro (con menú) ───────────────────────── */

function BookCard({
  book,
  variant,
  menuOpen,
  onOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onMove,
  folders,
}: {
  book: BookItem
  variant: 'shelf' | 'grid'
  menuOpen: boolean
  onOpen: () => void
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (folderId: string | null) => void
  folders: BookFolder[]
}) {
  const coverClass = variant === 'shelf' ? 'book-cover book-cover-lg' : 'book-cover book-cover-grid'
  return (
    <div
      className={variant === 'shelf' ? '' : 'book-grid-card'}
      style={variant === 'shelf' ? { position: 'relative', width: 130, flexShrink: 0 } : { position: 'relative' }}
    >
      <div
        className={coverClass}
        style={book.coverDataUrl ? { backgroundImage: `url(${book.coverDataUrl})`, cursor: 'pointer' } : { cursor: 'pointer' }}
        onClick={onOpen}
      >
        {!book.coverDataUrl && book.title.charAt(0).toUpperCase()}
        <button
          type="button"
          className="icon-btn"
          aria-label="Opciones"
          onClick={(e) => {
            e.stopPropagation()
            onMenuToggle()
          }}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'rgba(0,0,0,0.35)',
            color: '#fff',
          }}
        >
          <IconKebab />
        </button>
      </div>
      <div style={{ marginTop: 6 }}>
        <p
          className="book-title"
          style={variant === 'shelf' ? { fontSize: '0.85rem', fontWeight: 600 } : undefined}
          onClick={onOpen}
        >
          {book.title}
        </p>
        {book.author && <p className="book-author">{book.author}</p>}
      </div>

      {menuOpen && (
        <BookMenu folders={folders} onEdit={onEdit} onDelete={onDelete} onMove={onMove} onClose={onMenuToggle} />
      )}
    </div>
  )
}

function BookMenu({
  folders,
  onEdit,
  onDelete,
  onMove,
  onClose,
}: {
  folders: BookFolder[]
  onEdit: () => void
  onDelete: () => void
  onMove: (folderId: string | null) => void
  onClose: () => void
}) {
  const [showMove, setShowMove] = useState(false)
  return (
    <div className="context-menu" style={{ top: 40, right: 6 }} onMouseLeave={onClose}>
      {!showMove ? (
        <>
          <button type="button" onClick={onEdit}>
            <IconEdit /> Editar detalles
          </button>
          <button type="button" onClick={() => setShowMove(true)}>
            <IconMove /> Mover a carpeta
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <IconTrash /> Eliminar
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => onMove(null)}>
            Sin carpeta
          </button>
          {folders.map((f) => (
            <button key={f.id} type="button" onClick={() => onMove(f.id)}>
              📁 {f.name}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

function BookRow({
  book,
  onOpen,
  onEdit,
  onDelete,
}: {
  book: BookItem
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.65rem 0.8rem' }}>
      <div
        className="book-cover"
        style={{
          width: 46,
          height: 46,
          fontSize: '1.1rem',
          borderRadius: 10,
          cursor: 'pointer',
          ...(book.coverDataUrl ? { backgroundImage: `url(${book.coverDataUrl})` } : {}),
        }}
        onClick={onOpen}
      >
        {!book.coverDataUrl && book.title.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <p style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {book.title}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>
          {book.author || 'Autor desconocido'}{book.year ? ` · ${book.year}` : ''}
        </p>
      </div>
      <button type="button" className="icon-btn" aria-label="Editar" onClick={onEdit}>
        <IconEdit />
      </button>
      <button type="button" className="icon-btn" aria-label="Eliminar" onClick={onDelete}>
        <IconTrash />
      </button>
    </div>
  )
}

/* ───────────────────────── Modal: Importar (multi-paso) ───────────────────────── */

type ImportSource = 'texto' | 'archivo' | 'portapapeles' | null

function ImportModal({
  folders,
  defaultFolderId,
  busy,
  setBusy,
  onClose,
  onCreated,
}: {
  folders: BookFolder[]
  defaultFolderId: string | null
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
  onCreated: (b: BookItem) => void
}) {
  const [step, setStep] = useState(1)
  const [source, setSource] = useState<ImportSource>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [year, setYear] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId)
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  const pickSource = async (s: ImportSource) => {
    soundClick()
    setSource(s)
    if (s === 'archivo') {
      fileRef.current?.click()
      return
    }
    if (s === 'portapapeles') {
      try {
        const t = await navigator.clipboard.readText()
        if (!t.trim()) {
          soundFail()
          return
        }
        setText(t)
        soundSuccess()
        setStep(2)
      } catch {
        soundFail()
      }
      return
    }
    // texto libre
    setStep(2)
  }

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const content = await extractTextFromFile(file)
      if (!content.trim()) {
        soundFail()
        return
      }
      setText(content)
      setTitle(file.name.replace(/\.[^.]+$/, ''))
      soundSuccess()
      setStep(2)
    } catch (e) {
      console.error(e)
      soundFail()
    } finally {
      setBusy(false)
    }
  }

  const onCoverFile = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file)
      setCover(dataUrl)
    } catch {
      soundFail()
    }
  }

  const save = async () => {
    if (!text.trim()) {
      soundFail()
      return
    }
    soundSuccess()
    const b = await saveBook({
      title: title.trim() || `Texto ${new Date().toLocaleDateString()}`,
      text: text.trim(),
      author: author.trim() || undefined,
      year: year.trim() || undefined,
      coverDataUrl: cover,
      folderId,
    })
    onCreated(b)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.1rem' }}>Nuevo libro</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="modal-steps">
          <div className={`modal-step-dot ${step >= 1 ? 'active' : ''}`} />
          <div className={`modal-step-dot ${step >= 2 ? 'active' : ''}`} />
        </div>

        {step === 1 && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: '1rem' }}>
              ¿Desde dónde quieres importar el texto?
            </p>
            <button type="button" className="source-option" onClick={() => pickSource('texto')}>
              <span className="source-icon"><IconType /></span>
              <span>
                <span className="source-label" style={{ display: 'block' }}>Escribir o pegar texto</span>
                <span className="source-sub">Redacta o pega el contenido manualmente</span>
              </span>
            </button>
            <button type="button" className="source-option" onClick={() => pickSource('portapapeles')}>
              <span className="source-icon"><IconPaste /></span>
              <span>
                <span className="source-label" style={{ display: 'block' }}>Desde el portapapeles</span>
                <span className="source-sub">Usa lo último que copiaste</span>
              </span>
            </button>
            <button type="button" className="source-option" disabled={busy} onClick={() => pickSource('archivo')}>
              <span className="source-icon"><IconFile /></span>
              <span>
                <span className="source-label" style={{ display: 'block' }}>
                  {busy ? 'Importando…' : 'Subir archivo'}
                </span>
                <span className="source-sub">TXT, PDF, DOCX o EPUB</span>
              </span>
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

            {source === 'texto' && (
              <textarea
                className="glass-input"
                placeholder="Pega o escribe el texto…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                style={{ marginTop: 8, resize: 'vertical' }}
              />
            )}

            {source === 'texto' && (
              <GlassButton
                onClick={() => {
                  if (!text.trim()) {
                    soundFail()
                    return
                  }
                  soundClick()
                  setStep(2)
                }}
                style={{ marginTop: 10, width: '100%' }}
              >
                Continuar
              </GlassButton>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="cover-picker">
              <div
                className="cover-picker-preview"
                style={cover ? { backgroundImage: `url(${cover})` } : undefined}
                onClick={() => coverRef.current?.click()}
                role="button"
              >
                {!cover && <IconImage />}
              </div>
              <div>
                <button type="button" className="glass-button secondary" onClick={() => coverRef.current?.click()}>
                  Elegir portada
                </button>
                <p style={{ fontSize: '0.7rem', color: 'var(--gco-ink-muted)', marginTop: 6 }}>Opcional</p>
              </div>
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onCoverFile(f)
                  e.target.value = ''
                }}
              />
            </div>

            <input
              className="glass-input"
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                className="glass-input"
                placeholder="Autor"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Año"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ maxWidth: 110 }}
              />
            </div>
            <select
              className="glass-input"
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              style={{ marginBottom: 12 }}
            >
              <option value="">Sin carpeta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="glass-button secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                Atrás
              </button>
              <GlassButton onClick={() => void save()} style={{ flex: 2 }}>
                Guardar y leer
              </GlassButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Modal: Editar libro ───────────────────────── */

function EditBookModal({
  book,
  folders,
  onClose,
  onSaved,
}: {
  book: BookItem
  folders: BookFolder[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author || '')
  const [year, setYear] = useState(book.year || '')
  const [cover, setCover] = useState<string | null>(book.coverDataUrl || null)
  const [folderId, setFolderId] = useState<string | null>(book.folderId)
  const coverRef = useRef<HTMLInputElement>(null)

  const onCoverFile = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file)
      setCover(dataUrl)
    } catch {
      soundFail()
    }
  }

  const save = async () => {
    soundSuccess()
    await updateBookMeta(book.id, {
      title: title.trim() || book.title,
      author: author.trim(),
      year: year.trim(),
      coverDataUrl: cover,
    })
    if (folderId !== book.folderId) {
      await moveBookToFolder(book.id, folderId)
    }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.1rem' }}>Editar detalles</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="cover-picker">
          <div
            className="cover-picker-preview"
            style={cover ? { backgroundImage: `url(${cover})` } : undefined}
            onClick={() => coverRef.current?.click()}
            role="button"
          >
            {!cover && <IconImage />}
          </div>
          <div>
            <button type="button" className="glass-button secondary" onClick={() => coverRef.current?.click()}>
              Cambiar portada
            </button>
            {cover && (
              <button
                type="button"
                className="glass-button secondary"
                style={{ marginLeft: 6 }}
                onClick={() => setCover(null)}
              >
                Quitar
              </button>
            )}
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onCoverFile(f)
              e.target.value = ''
            }}
          />
        </div>

        <input
          className="glass-input"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="glass-input"
            placeholder="Autor"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="Año"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{ maxWidth: 110 }}
          />
        </div>
        <select
          className="glass-input"
          value={folderId ?? ''}
          onChange={(e) => setFolderId(e.target.value || null)}
          style={{ marginBottom: 14 }}
        >
          <option value="">Sin carpeta</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              📁 {f.name}
            </option>
          ))}
        </select>

        <GlassButton onClick={() => void save()} style={{ width: '100%' }}>
          Guardar cambios
        </GlassButton>
      </div>
    </div>
  )
}