import { useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent as ReactDragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LibraryBig } from 'lucide-react'

import { GlassButton } from '@/components/ui/GlassButton'
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
function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

type NavId = 'inicio' | 'biblioteca' | 'listas' | 'reproduciendo' | 'importar' | 'mas' | 'buscar'
type SortOrder = 'recientes' | 'titulo' | 'autor'
type GridDensity = 'comoda' | 'compacta'
type AppId = 'nutricion' | 'gymcog' | 'musica'

const APPS: { id: AppId; label: string; emoji: string; path: string }[] = [
  { id: 'nutricion', label: 'Nutrición', emoji: '🍎', path: '/nutricion' },
  { id: 'gymcog', label: 'GymCog', emoji: '🧠', path: '/gymcog' },
  { id: 'musica', label: 'Música', emoji: '🎵', path: '/musica' },
]

const LS_SORT = 'gco:nutricion:sort'
const LS_DENSITY = 'gco:nutricion:density'
const LS_VOLUME = 'gco:nutricion:volumeBoost'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function readImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = src
    } catch {
      resolve({ w: 0, h: 0 })
    }
  })
}

function imageMarkdown(name: string, dataUrl: string, widthPx?: number, align: 'left' | 'center' | 'right' = 'center') {
  const w = widthPx && widthPx > 0 ? Math.min(widthPx, 640) : 640
  return `![${name}](${dataUrl}){width=${w}px align=${align}}`
}

function AppSwitcher({ current }: { current: AppId }) {
  const navigate = useNavigate()
  return (
    <div className="app-switcher">
      {APPS.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`app-switcher-item ${a.id === current ? 'active' : ''}`}
          onClick={() => {
            soundClick()
            if (a.id !== current) navigate(a.path)
          }}
        >
          <span aria-hidden>{a.emoji}</span> {a.label}
        </button>
      ))}
    </div>
  )
}

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

  const [moreOpen, setMoreOpen] = useState(false)
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => (localStorage.getItem(LS_SORT) as SortOrder) || 'recientes'
  )
  const [gridDensity, setGridDensity] = useState<GridDensity>(
    () => (localStorage.getItem(LS_DENSITY) as GridDensity) || 'comoda'
  )
  const [volumeBoost, setVolumeBoost] = useState<number>(
    () => Number(localStorage.getItem(LS_VOLUME)) || 100
  )

  useEffect(() => localStorage.setItem(LS_SORT, sortOrder), [sortOrder])
  useEffect(() => localStorage.setItem(LS_DENSITY, gridDensity), [gridDensity])
  useEffect(() => localStorage.setItem(LS_VOLUME, String(volumeBoost)), [volumeBoost])

  const refresh = async () => {
    try {
      setBooks(await listBooks())
      setFolders(await listFolders())
    } catch {
      setBooks([])
      setFolders([])
    }
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

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortOrder === 'titulo') arr.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    else if (sortOrder === 'autor') arr.sort((a, b) => (a.author || '').localeCompare(b.author || '', 'es'))
    return arr
  }, [filtered, sortOrder])

  const byFolder = (id: string | null) => sorted.filter((b) => b.folderId === id)
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
      setMoreOpen(true)
    } else if (id === 'buscar') {
      setSearchOpen((v) => !v)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const continueScrollRef = useRef<HTMLDivElement>(null)
  const [continueIndex, setContinueIndex] = useState(0)

  const scrollContinueBy = (dir: 1 | -1) => {
    const el = continueScrollRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('.continue-card')
    const step = card ? card.offsetWidth + 14 : el.clientWidth * 0.8
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  const onContinueScroll = () => {
    const el = continueScrollRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('.continue-card')
    const step = card ? card.offsetWidth + 14 : 1
    setContinueIndex(Math.round(el.scrollLeft / step))
  }

  const NAV_ITEMS: { id: NavId; label: string; icon: ReactNode }[] = [
    { id: 'biblioteca', label: 'Biblioteca', icon: <LibraryBig /> },
    { id: 'listas', label: 'Listas', icon: <IconList /> },
    { id: 'reproduciendo', label: 'Reproduciendo', icon: <IconPlayCircle /> },
    { id: 'importar', label: 'Importar', icon: <IconDownload /> },
    { id: 'mas', label: 'Más', icon: <IconDots /> },
  ]

  const MOBILE_NAV: { id: NavId; label: string; icon: ReactNode }[] = [
    { id: 'inicio', label: 'Nutrición', icon: <span aria-hidden style={{ fontSize: 18 }}>🍎</span> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <LibraryBig /> },
    { id: 'importar', label: 'Importar', icon: <IconDownload /> },
    { id: 'buscar', label: 'Buscar', icon: <IconSearch /> },
  ]

  return (
    <div className="app-layout nutricion-layout">
      <aside className="app-sidebar">
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
        <div className="app-shell app-shell-pro nutricion-shell">
          <header className="nutricion-header" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.65rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 style={{ fontSize: 'clamp(1.35rem, 4.5vw, 1.85rem)', lineHeight: 1.2 }}>🍎 Nutrición</h1>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', marginTop: 4 }}>
                  Biblioteca de audiolibros
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <div className="appswitch-slot desktop">
                  <AppSwitcher current="nutricion" />
                </div>
                <ThemeToggle />
                <button
                  type="button"
                  className="theme-cycle-btn"
                  aria-label="Más opciones"
                  onClick={() => {
                    soundClick()
                    setMoreOpen(true)
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

            <div className="appswitch-slot mobile" style={{ marginTop: '0.85rem' }}>
              <AppSwitcher current="nutricion" />
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

          {continuing.length > 0 && !query && (
            <section style={{ marginBottom: '1.6rem' }}>
              <div className="folder-row-header" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: '1rem' }}>Continuar</h2>
                {continuing.length > 1 && (
                  <div className="hscroll-nav">
                    <button type="button" className="hscroll-nav-btn" aria-label="Anterior" onClick={() => scrollContinueBy(-1)}>
                      <IconChevronLeft />
                    </button>
                    <button type="button" className="hscroll-nav-btn" aria-label="Siguiente" onClick={() => scrollContinueBy(1)}>
                      <IconChevronRight />
                    </button>
                  </div>
                )}
              </div>
              <div className="hscroll" ref={continueScrollRef} onScroll={onContinueScroll}>
                {continuing.map((b) => {
                  const pct = b.text.length ? Math.round((b.position / b.text.length) * 100) : 0
                  return (
                    <div
                      key={b.id}
                      className="glass-card continue-card"
                      onClick={() => openBook(b)}
                      style={{ position: 'relative' }}
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
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Opciones"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuFor(menuFor === b.id ? null : b.id)
                        }}
                        style={{ position: 'absolute', top: 10, right: 10 }}
                      >
                        <IconKebab />
                      </button>
                      {menuFor === b.id && (
                        <BookMenu
                          folders={folders}
                          onEdit={() => {
                            setMenuFor(null)
                            setEditingBook(b)
                          }}
                          onDelete={() => {
                            setMenuFor(null)
                            soundClick()
                            void deleteBook(b.id).then(refresh)
                          }}
                          onMove={(fid) => {
                            setMenuFor(null)
                            void moveBookToFolder(b.id, fid).then(refresh)
                          }}
                          onClose={() => setMenuFor(null)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              {continuing.length > 1 && (
                <div className="hscroll-dots">
                  {continuing.map((b, i) => (
                    <span key={b.id} className={`hscroll-dot ${i === continueIndex ? 'active' : ''}`} />
                  ))}
                </div>
              )}
            </section>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.4rem' }}>
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

          {folders.map((f) => {
            const items = byFolder(f.id)
            if (query && items.length === 0) return null
            return (
              <section key={f.id} style={{ marginBottom: '1.2rem' }}>
                <div className="folder-row-header">
                  <h3 style={{ fontSize: '1rem' }}>📁 {f.name}</h3>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Opciones de ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        soundClick()
                        setFolderMenuFor(folderMenuFor === f.id ? null : f.id)
                      }}
                    >
                      <IconChevronRight />
                    </button>
                    {folderMenuFor === f.id && (
                      <div className="context-menu" style={{ top: 36, right: 0 }} onMouseLeave={() => setFolderMenuFor(null)}>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedFolders((s) => ({ ...s, [f.id]: !s[f.id] }))
                            setFolderMenuFor(null)
                          }}
                        >
                          <IconChevronRight /> {expandedFolders[f.id] ? 'Ver menos' : 'Ver todo'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            soundClick()
                            setFolderMenuFor(null)
                            if (confirm(`¿Borrar la carpeta "${f.name}"? Los libros pasarán a "Sin carpeta".`)) {
                              void deleteFolder(f.id).then(refresh)
                            }
                          }}
                        >
                          <IconTrash /> Eliminar carpeta
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {viewMode === 'estanteria' ? (
                  expandedFolders[f.id] ? (
                    <div
                      className="book-grid"
                      style={{ ['--grid-min' as string]: gridDensity === 'compacta' ? '96px' : '120px' }}
                    >
                      {items.map((b) => (
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
                      {items.length === 0 && (
                        <p style={{ color: 'var(--gco-ink-faint)', fontSize: '0.85rem' }}>Carpeta vacía.</p>
                      )}
                    </div>
                  ) : (
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
                  )
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
              <div
                className="book-grid"
                style={{ ['--grid-min' as string]: gridDensity === 'compacta' ? '96px' : '120px' }}
              >
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

      <nav className="bottom-nav" aria-label="Navegación">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${
              (item.id === 'inicio' && !searchOpen && !importOpen) ||
              (item.id === 'importar' && importOpen) ||
              (item.id === 'buscar' && searchOpen)
                ? 'active'
                : ''
            }`}
            onClick={() => nav(item.id)}
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

      {moreOpen && (
        <MoreSheet
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          gridDensity={gridDensity}
          setGridDensity={setGridDensity}
          volumeBoost={volumeBoost}
          setVolumeBoost={setVolumeBoost}
          onClose={() => setMoreOpen(false)}
          onOpenSettings={() => {
            setMoreOpen(false)
            navigate('/ajustes')
          }}
        />
      )}

      <style>{`
        .app-sidebar {
          position: sticky;
          top: 0;
          align-self: start;
          height: 100vh;
          height: 100dvh;
          max-height: 100dvh;
          overflow-y: auto;
          z-index: 20;
          -webkit-overflow-scrolling: touch;
        }
        .nutricion-header {
          position: static;
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          box-shadow: none;
          padding-top: 0.35rem;
          padding-bottom: 0.35rem;
        }
        .nutricion-shell {
          width: 100%;
          max-width: none;
        }
        @media (max-width: 899px) {
          .app-sidebar { display: none; }
        }
      `}</style>
    </div>
  )
}

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
      style={variant === 'shelf' ? { width: 130, flexShrink: 0 } : undefined}
    >
      <div
        className={coverClass}
        style={book.coverDataUrl ? { backgroundImage: `url(${book.coverDataUrl})`, cursor: 'pointer' } : { cursor: 'pointer' }}
        onClick={onOpen}
      >
        {!book.coverDataUrl && book.title.charAt(0).toUpperCase()}
      </div>
      <div style={{ marginTop: 6, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
          <p
            className="book-title"
            style={{ flex: 1, minWidth: 0, ...(variant === 'shelf' ? { fontSize: '0.85rem', fontWeight: 600 } : {}) }}
            onClick={onOpen}
          >
            {book.title}
          </p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Opciones"
            onClick={(e) => {
              e.stopPropagation()
              onMenuToggle()
            }}
            style={{ width: 24, height: 24, flexShrink: 0 }}
          >
            <IconKebab />
          </button>
        </div>
        {book.author && <p className="book-author">{book.author}</p>}

        {menuOpen && (
          <BookMenu folders={folders} onEdit={onEdit} onDelete={onDelete} onMove={onMove} onClose={onMenuToggle} />
        )}
      </div>
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
    <div className="context-menu" style={{ top: 28, right: 0 }} onMouseLeave={onClose}>
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
          {book.author || 'Autor desconocido'}
          {book.year ? ` · ${book.year}` : ''}
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

type ImportSource = 'texto' | 'archivo' | 'portapapeles' | 'imagen' | null

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
  const [dragActive, setDragActive] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [chapterDraft, setChapterDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const insertImgRef = useRef<HTMLInputElement>(null)

  const ACCEPTED_EXT = [
    '.txt',
    '.md',
    '.markdown',
    '.html',
    '.htm',
    '.rtf',
    '.pdf',
    '.docx',
    '.epub',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
  ]
  const ACCEPT_ATTR =
    '.txt,.md,.markdown,.html,.htm,.rtf,.pdf,.docx,.epub,.jpg,.jpeg,.png,.webp,.gif,text/plain,text/markdown,text/html,application/rtf,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*'

  const isImageFile = (file: File) =>
    /\.(jpe?g|png|webp|gif)$/i.test(file.name) || (file.type || '').startsWith('image/')

  const isAcceptedFile = (file: File) => {
    const name = file.name.toLowerCase()
    return ACCEPTED_EXT.some((ext) => name.endsWith(ext)) || (file.type || '').startsWith('image/')
  }

  const pickSource = async (s: ImportSource) => {
    soundClick()
    setImportError(null)
    setSource(s)
    if (s === 'archivo') {
      fileRef.current?.click()
      return
    }
    if (s === 'imagen') {
      imageRef.current?.click()
      return
    }
    if (s === 'portapapeles') {
      try {
        const t = await navigator.clipboard.readText()
        if (!t.trim()) {
          soundFail()
          setImportError('El portapapeles está vacío o no contiene texto.')
          return
        }
        setText(t)
        soundSuccess()
        setStep(2)
      } catch {
        soundFail()
        setImportError('No se pudo leer el portapapeles. Revisa los permisos del navegador.')
      }
      return
    }
    setStep(2)
  }

  const onFile = async (file: File) => {
    setImportError(null)
    if (!isAcceptedFile(file)) {
      soundFail()
      setImportError('Formato no compatible. Usa TXT, MD, HTML, RTF, PDF, DOCX, EPUB o imagen.')
      return
    }
    if (isImageFile(file)) {
      setBusy(true)
      try {
        const dataUrl = await fileToDataUrl(file)
        const dims = await readImageSize(dataUrl)
        const block = imageMarkdown(file.name, dataUrl, dims.w || 640, 'center')
        setText((prev) => (prev ? `${prev}\n\n${block}` : block))
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
        soundSuccess()
        setStep(2)
      } catch {
        soundFail()
        setImportError('No se pudo cargar la imagen.')
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    try {
      const content = await extractTextFromFile(file)
      if (!content.trim()) {
        soundFail()
        setImportError('No se pudo extraer texto de este archivo.')
        return
      }
      setText(content)
      setTitle(file.name.replace(/\.[^.]+$/, ''))
      soundSuccess()
      setStep(2)
    } catch (e) {
      console.error(e)
      soundFail()
      setImportError(e instanceof Error ? e.message : 'Ocurrió un error al importar el archivo. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!busy) setDragActive(true)
  }
  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }
  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (busy) return
    const f = e.dataTransfer.files?.[0]
    if (f) {
      soundClick()
      setSource('archivo')
      void onFile(f)
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

  const insertImageIntoText = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file)
      const dims = await readImageSize(dataUrl)
      const block = imageMarkdown(file.name, dataUrl, dims.w || 640, 'center')
      setText((prev) => `${prev}\n\n${block}\n\n`)
      soundSuccess()
    } catch {
      soundFail()
    }
  }

  const insertChapterMarker = () => {
    const name = chapterDraft.trim() || 'Capítulo'
    setText((prev) => `${prev}\n\n${name.toUpperCase()}\n\n`)
    setChapterDraft('')
    soundClick()
  }

  const save = async () => {
    if (!text.trim()) {
      soundFail()
      setImportError('Escribe o pega texto, o añade una imagen.')
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
          <h2 style={{ fontSize: '1.1rem' }}>
            {step === 1 ? 'Nuevo libro' : step === 2 ? 'Editor del libro' : 'Detalles'}
          </h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="modal-steps">
          <div className={`modal-step-dot ${step >= 1 ? 'active' : ''}`} />
          <div className={`modal-step-dot ${step >= 2 ? 'active' : ''}`} />
          <div className={`modal-step-dot ${step >= 3 ? 'active' : ''}`} />
        </div>

        {step === 1 && (
          <>
            <p className="import-intro">Elige cómo quieres traer tu próximo audiolibro.</p>

            <div
              className={`import-dropzone ${dragActive ? 'active' : ''} ${busy ? 'busy' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !busy && pickSource('archivo')}
              role="button"
              tabIndex={0}
              aria-label="Subir archivo TXT, PDF, DOCX, EPUB o imagen"
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                  e.preventDefault()
                  void pickSource('archivo')
                }
              }}
            >
              <span className="import-dropzone-icon">
                {busy ? <span className="import-spinner" aria-hidden /> : <IconFile />}
              </span>
              <span className="import-dropzone-title">
                {busy ? 'Extrayendo texto…' : 'Arrastra un archivo aquí'}
              </span>
              <span className="import-dropzone-sub">
                {busy ? 'Esto puede tardar unos segundos' : 'o toca · TXT, PDF, DOCX, EPUB o imagen'}
              </span>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />

            {importError && (
              <div className="import-error" role="alert">
                {importError}
              </div>
            )}

            <div className="import-divider">
              <span />
              <em>o también</em>
              <span />
            </div>

            <div className="import-quick-options">
              <button
                type="button"
                className={`source-option compact ${source === 'texto' ? 'selected' : ''}`}
                onClick={() => pickSource('texto')}
              >
                <span className="source-icon">
                  <IconType />
                </span>
                <span>
                  <span className="source-label" style={{ display: 'block' }}>
                    Escribir o pegar texto
                  </span>
                  <span className="source-sub">Abre el editor directamente</span>
                </span>
              </button>
              <button type="button" className="source-option compact" onClick={() => pickSource('portapapeles')}>
                <span className="source-icon">
                  <IconPaste />
                </span>
                <span>
                  <span className="source-label" style={{ display: 'block' }}>
                    Desde el portapapeles
                  </span>
                  <span className="source-sub">Usa lo último que copiaste</span>
                </span>
              </button>
              <button type="button" className="source-option compact" onClick={() => pickSource('imagen')}>
                <span className="source-icon">
                  <IconImage />
                </span>
                <span>
                  <span className="source-label" style={{ display: 'block' }}>
                    Importar imagen
                  </span>
                  <span className="source-sub">JPG, PNG, WEBP o GIF · se conserva tamaño</span>
                </span>
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="import-intro" style={{ marginBottom: 8 }}>
              Escribe, pega o inserta imágenes (con tamaño). Después pondrás título y portada.
            </p>
            <textarea
              autoFocus
              className="glass-input"
              placeholder="Escribe o pega el texto del libro aquí…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              style={{ resize: 'vertical', minHeight: '40vh', fontSize: 16 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button type="button" className="glass-button secondary" onClick={() => insertImgRef.current?.click()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconImage /> Insertar imagen
                </span>
              </button>
              <input
                ref={insertImgRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void insertImageIntoText(f)
                  e.target.value = ''
                }}
              />
              <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 160 }}>
                <input
                  className="glass-input"
                  placeholder="Nombre de capítulo"
                  value={chapterDraft}
                  onChange={(e) => setChapterDraft(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="glass-button secondary" onClick={insertChapterMarker}>
                  + Capítulo
                </button>
              </div>
            </div>
            {importError && (
              <div className="import-error" role="alert" style={{ marginTop: 8 }}>
                {importError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="glass-button secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                Atrás
              </button>
              <GlassButton
                onClick={() => {
                  if (!text.trim()) {
                    soundFail()
                    setImportError('Escribe o pega algo de texto, o añade una imagen.')
                    return
                  }
                  setImportError(null)
                  soundClick()
                  setStep(3)
                }}
                style={{ flex: 2 }}
              >
                Continuar
              </GlassButton>
            </div>
          </>
        )}

        {step === 3 && (
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
              <input className="glass-input" placeholder="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
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
              <button type="button" className="glass-button secondary" onClick={() => setStep(2)} style={{ flex: 1 }}>
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

function MoreSheet({
  sortOrder,
  setSortOrder,
  gridDensity,
  setGridDensity,
  volumeBoost,
  setVolumeBoost,
  onClose,
  onOpenSettings,
}: {
  sortOrder: SortOrder
  setSortOrder: (v: SortOrder) => void
  gridDensity: GridDensity
  setGridDensity: (v: GridDensity) => void
  volumeBoost: number
  setVolumeBoost: (v: number) => void
  onClose: () => void
  onOpenSettings: () => void
}) {
  const GUIDE: { icon: ReactNode; title: string; text: string }[] = [
    { icon: <IconList />, title: 'Listas', text: 'Cambia entre estantería con portadas y una lista compacta con más detalle por libro.' },
    { icon: <IconPlayCircle />, title: 'Reproduciendo', text: 'Vuelve de un toque al audiolibro que tienes activo en este momento.' },
    { icon: <IconDownload />, title: 'Importar', text: 'Sube un TXT o PDF, o pega texto. Las imágenes conservan tamaño y alineación.' },
    { icon: <IconDots />, title: 'Más', text: 'Esta pantalla: orden de la biblioteca, densidad de portadas y volumen de lectura.' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.1rem' }}>Más</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <section style={{ marginBottom: '1.3rem' }}>
          <h3 className="more-section-title">Guía rápida</h3>
          <div className="guide-list">
            {GUIDE.map((g) => (
              <div className="guide-item" key={g.title}>
                <span className="guide-icon">{g.icon}</span>
                <div>
                  <p className="guide-title">{g.title}</p>
                  <p className="guide-text">{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: '1.3rem' }}>
          <h3 className="more-section-title">Biblioteca</h3>
          <label className="more-field-label" htmlFor="more-sort">
            Orden
          </label>
          <select
            id="more-sort"
            className="glass-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            style={{ marginBottom: 12 }}
          >
            <option value="recientes">Más recientes</option>
            <option value="titulo">Título (A–Z)</option>
            <option value="autor">Autor (A–Z)</option>
          </select>

          <label className="more-field-label">Densidad de portadas</label>
          <div className="segmented">
            <button
              type="button"
              className={gridDensity === 'comoda' ? 'active' : ''}
              onClick={() => setGridDensity('comoda')}
            >
              Cómoda
            </button>
            <button
              type="button"
              className={gridDensity === 'compacta' ? 'active' : ''}
              onClick={() => setGridDensity('compacta')}
            >
              Compacta
            </button>
          </div>
        </section>

        <section style={{ marginBottom: '1.4rem' }}>
          <h3 className="more-section-title">Audio</h3>
          <label className="more-field-label">Refuerzo de volumen · {volumeBoost}%</label>
          <input
            type="range"
            className="pref-slider"
            min={50}
            max={150}
            step={5}
            value={volumeBoost}
            onChange={(e) => setVolumeBoost(Number(e.target.value))}
            style={{ ['--fill' as string]: `${((volumeBoost - 50) / 100) * 100}%` }}
            aria-label="Refuerzo de volumen de lectura"
          />
          <p className="guide-text" style={{ marginTop: 8 }}>
            Se aplica al reproducir tus audiolibros. Por encima del 100% algunos dispositivos pueden distorsionar el
            sonido.
          </p>
        </section>

        <button type="button" className="glass-button secondary" style={{ width: '100%' }} onClick={onOpenSettings}>
          Ajustes generales de la app →
        </button>
      </div>
    </div>
  )
}