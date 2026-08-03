import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpeechReader } from '@/hooks/useSpeechReader'
import { saveBook, type BookItem } from '@/core/storage/mediaLibrary'
import { soundClick } from '@/core/audio/uiSounds'

interface ActiveBook {
  id: string
  title: string
  author?: string
  coverDataUrl?: string | null
  text: string
}

interface ReaderPlayerCtx {
  reader: ReturnType<typeof useSpeechReader>
  activeBook: ActiveBook | null
  loadBook: (book: BookItem, startAt?: number) => void
  clearBook: () => void
  persist: () => Promise<void>
  minimized: boolean
  setMinimized: (v: boolean) => void
}

const Ctx = createContext<ReaderPlayerCtx | null>(null)

export function ReaderPlayerProvider({ children }: { children: ReactNode }) {
  const reader = useSpeechReader()
  const [activeBook, setActiveBook] = useState<ActiveBook | null>(null)
  const [minimized, setMinimized] = useState(false)

  const loadBook = (book: BookItem, startAt?: number) => {
    setActiveBook({
      id: book.id,
      title: book.title,
      author: book.author,
      coverDataUrl: book.coverDataUrl,
      text: book.text,
    })
    if (typeof startAt === 'number') {
      reader.setCharIndex(startAt)
    }
  }

  const clearBook = () => {
    reader.stop()
    setActiveBook(null)
    setMinimized(false)
  }

  const persist = async () => {
    if (!activeBook) return
    await saveBook({
      id: activeBook.id,
      title: activeBook.title,
      text: activeBook.text,
      position: reader.charIndex,
      rate: reader.rate,
      voiceURI: reader.voiceURI,
    })
  }

  const value = useMemo(
    () => ({ reader, activeBook, loadBook, clearBook, persist, minimized, setMinimized }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reader, activeBook, minimized]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useReaderPlayer() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useReaderPlayer debe usarse dentro de <ReaderPlayerProvider>')
  return ctx
}

/**
 * Mini-reproductor flotente. Móntalo UNA vez en el layout raíz de la app
 * (fuera de las <Routes>), así se mantiene visible y con sonido activo
 * al navegar entre pantallas.
 */
export function MiniPlayer() {
  const { reader, activeBook, minimized } = useReaderPlayer()
  const navigate = useNavigate()

  if (!activeBook || !reader.speaking && !reader.paused) return null
  if (minimized) return null

  const progress =
    activeBook.text.length > 0
      ? Math.min(100, (reader.charIndex / activeBook.text.length) * 100)
      : 0

  return (
    <div className="mini-player glass-card" role="complementary" aria-label="Reproductor">
      <div
        className="mini-player-cover"
        style={
          activeBook.coverDataUrl
            ? { backgroundImage: `url(${activeBook.coverDataUrl})` }
            : undefined
        }
        onClick={() => {
          soundClick()
          navigate(`/nutricion/libro/${activeBook.id}`)
        }}
      >
        {!activeBook.coverDataUrl && '📖'}
      </div>

      <div
        className="mini-player-info"
        onClick={() => {
          soundClick()
          navigate(`/nutricion/libro/${activeBook.id}`)
        }}
      >
        <p className="mini-player-title">{activeBook.title}</p>
        <p className="mini-player-author">{activeBook.author || 'Escuchando…'}</p>
        <div className="mini-player-progress">
          <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mini-player-controls">
        <button
          type="button"
          aria-label="Retroceder"
          className="mini-player-btn"
          onClick={() => {
            soundClick()
            reader.skipBack(10)
          }}
        >
          <IconPrev />
        </button>
        <button
          type="button"
          aria-label={reader.paused ? 'Reproducir' : 'Pausar'}
          className="mini-player-btn primary"
          onClick={() => {
            soundClick()
            if (reader.paused) reader.resume()
            else if (reader.speaking) reader.pause()
          }}
        >
          {reader.paused ? <IconPlay /> : <IconPause />}
        </button>
        <button
          type="button"
          aria-label="Adelantar"
          className="mini-player-btn"
          onClick={() => {
            soundClick()
            reader.skipForward(10)
          }}
        >
          <IconNext />
        </button>
      </div>
    </div>
  )
}

function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}
function IconPrev() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}
function IconNext() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" />
    </svg>
  )
}