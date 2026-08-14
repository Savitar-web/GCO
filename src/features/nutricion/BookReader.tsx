/**
 * BookReader.tsx — Lector de audiolibro + texto premium
 * Layout 1:1 con mockup (móvil + desktop), glassmorphism,
 * TOC inteligente, bookmarks ilimitados, comentarios por párrafo,
 * apariencia completa (fuente/tamaño/espacio/brillo/día-noche-sepia),
 * TTS robusto multi-dispositivo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getBook, saveBook } from '@/core/storage/mediaLibrary'
import { soundClick, soundToggle, soundSuccess } from '@/core/audio/uiSounds'
import { useReaderPlayer } from '@/core/reader/ReaderPlayerContext.tsx'
import { pickHumanVoice, scoreVoiceHumanness, type SkipSeconds } from '@/hooks/useSpeechReader'

/* ───────────────────────── Tipos locales ───────────────────────── */

export interface ChapterMark {
  id: string
  title: string
  /** offset de carácter en el texto completo */
  start: number
  /** generado automáticamente o editado a mano */
  source: 'auto' | 'manual'
}

export interface Bookmark {
  id: string
  charIndex: number
  label?: string
  note?: string
  createdAt: string
  chapterId?: string
}

export interface ParagraphComment {
  id: string
  /** índice del párrafo (0-based) */
  paraIndex: number
  charStart: number
  text: string
  createdAt: string
}

type ReadingMode = 'day' | 'night' | 'sepia'
type FontFamily = 'lora' | 'inter' | 'merriweather' | 'source-serif' | 'system'

interface Appearance {
  mode: ReadingMode
  font: FontFamily
  fontSize: number // px
  lineHeight: number // 1.4 – 2.2
  letterSpacing: number // em
  brightness: number // 0.6 – 1.2
  autoAdvance: boolean
  pageAnim: boolean
}

const DEFAULT_APPEARANCE: Appearance = {
  mode: 'night',
  font: 'lora',
  fontSize: 18,
  lineHeight: 1.7,
  letterSpacing: 0,
  brightness: 1,
  autoAdvance: false,
  pageAnim: true,
}

const FONT_STACK: Record<FontFamily, string> = {
  lora: '"Lora", "Georgia", serif',
  inter: '"Inter", system-ui, sans-serif',
  merriweather: '"Merriweather", "Georgia", serif',
  'source-serif': '"Source Serif 4", "Georgia", serif',
  system: 'system-ui, -apple-system, sans-serif',
}

const SKIP: SkipSeconds[] = [5, 10, 15]

/* ───────────────────────── Detección de capítulos ───────────────────────── */

const CHAPTER_RE =
  /^(?:capítulo|capitulo|chapter|parte|part|sección|seccion|book|libro)\s+([\divxlcdm]+|[0-9]+|[ivxlcdm]+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte)(?:\s*[:.\-–—]\s*(.+))?$/i

const SPECIAL_RE =
  /^(prólogo|prologo|epílogo|epilogo|introducción|introduccion|prefacio|foreword|afterword|apéndice|apendice|dedicatoria|agradecimientos)\b/i

function detectChapters(text: string): ChapterMark[] {
  const lines = text.split(/\n/)
  const marks: ChapterMark[] = []
  let offset = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) {
      offset += raw.length + 1
      continue
    }

    // Título en mayúsculas corto + siguiente línea no vacía → posible capítulo
    const isAllCaps =
      line.length >= 4 &&
      line.length <= 80 &&
      line === line.toUpperCase() &&
      /[A-ZÁÉÍÓÚÑ]/.test(line) &&
      !/^\d+$/.test(line)

    const m = line.match(CHAPTER_RE) || line.match(SPECIAL_RE)
    if (m || isAllCaps) {
      let title = line
      if (m && m[0]) {
        title = m[0].trim()
        if (m[2]) title = `${m[1] || m[0]} — ${m[2].trim()}`
      }
      // Evitar duplicados muy cercanos
      if (!marks.length || offset - marks[marks.length - 1].start > 40) {
        marks.push({
          id: `ch-auto-${marks.length + 1}`,
          title: title.length > 60 ? title.slice(0, 57) + '…' : title,
          start: offset,
          source: 'auto',
        })
      }
    }
    offset += raw.length + 1
  }

  // Si no hay ninguno, un único "Inicio"
  if (!marks.length) {
    marks.push({ id: 'ch-auto-1', title: 'Inicio', start: 0, source: 'auto' })
  } else if (marks[0].start > 0) {
    marks.unshift({ id: 'ch-auto-0', title: 'Inicio', start: 0, source: 'auto' })
  }
  return marks
}

/** Divide el texto en párrafos con offsets */
function splitParagraphs(text: string): { text: string; start: number; end: number }[] {
  const paras: { text: string; start: number; end: number }[] = []
  const re = /([^\n]+(?:\n(?!\n)[^\n]+)*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const t = m[0].trim()
    if (t) {
      paras.push({ text: t, start: m.index, end: m.index + m[0].length })
    }
  }
  if (!paras.length && text.trim()) {
    paras.push({ text: text.trim(), start: 0, end: text.length })
  }
  return paras
}

/* ───────────────────────── Iconos ───────────────────────── */

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}
function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}
function IconPrev() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}
function IconNext() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" />
    </svg>
  )
}
function IconBookmark({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-3.5L6 20V4z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-3.5L6 20V4z" />
    </svg>
  )
}
function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}
function IconComment() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconBrain() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2a2.5 2.5 0 0 1 2.45 2H12a2.5 2.5 0 0 1 2.45-2H15a4 4 0 0 1 4 4v.5a2.5 2.5 0 0 1 0 5V14a4 4 0 0 1-4 4h-.5a2.5 2.5 0 0 1-5 0H9a4 4 0 0 1-4-4v-2.5a2.5 2.5 0 0 1 0-5V6a4 4 0 0 1 4-4h.5Z" />
      <path d="M12 8v8M9 11h6" />
    </svg>
  )
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
    </svg>
  )
}
function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
function IconWarning() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.9 18.5A1.5 1.5 0 0 0 3.2 21h17.6a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.5 1.5 0 0 0-2.4 0Z" />
    </svg>
  )
}

/* ───────────────────────── Componente principal ───────────────────────── */

export function BookReader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { reader, activeBook, loadBook, persist } = useReaderPlayer()

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [chapters, setChapters] = useState<ChapterMark[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [comments, setComments] = useState<ParagraphComment[]>([])
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [skipSec, setSkipSec] = useState<SkipSeconds>(10)
  const [sleepMin, setSleepMin] = useState(0)

  // UI panels
  const [showToc, setShowToc] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [editingChapter, setEditingChapter] = useState<ChapterMark | null>(null)
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [commentPara, setCommentPara] = useState<number | null>(null)
  const [bookmarkNote, setBookmarkNote] = useState('')
  const [showBookmarkForm, setShowBookmarkForm] = useState(false)

  const textRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

  /* ── Carga del libro ── */
  useEffect(() => {
    if (!id) return
    if (activeBook?.id === id) {
      setTitle(activeBook.title)
      setAuthor(activeBook.author || '')
      setText(activeBook.text)
      setCover(activeBook.coverDataUrl || null)
      return
    }
    void getBook(id).then((b) => {
      if (!b) {
        navigate('/nutricion')
        return
      }
      setTitle(b.title)
      setAuthor(b.author || '')
      setText(b.text)
      setCover(b.coverDataUrl || null)

      // Preferencias persistidas del lector (ya tipadas en BookItem)
      if (b.chapters?.length) setChapters(b.chapters)
      else setChapters(detectChapters(b.text))

      if (b.bookmarks) setBookmarks(b.bookmarks)
      if (b.comments) setComments(b.comments)
      if (b.appearance) setAppearance({ ...DEFAULT_APPEARANCE, ...(b.appearance as Appearance) })

      reader.setRate(b.rate || 1)
      const best = pickHumanVoice(reader.voices, b.voiceURI)
      if (best) reader.setVoiceURI(best)
      loadBook(b, b.position || 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Re-detectar si el texto cambia y no hay capítulos manuales
  useEffect(() => {
    if (!text) return
    const hasManual = chapters.some((c) => c.source === 'manual')
    if (!hasManual && chapters.length <= 1) {
      setChapters(detectChapters(text))
    }
  }, [text]) // eslint-disable-line

  // Voz más humana por defecto en cuanto el motor entrega la lista (sin
  // depender de ningún modo "Automático": se elige directamente la mejor).
  useEffect(() => {
    if (!reader.voices.length) return
    if (!reader.voiceURI || reader.voiceURI === '') {
      const best = pickHumanVoice(reader.voices)
      if (best) reader.setVoiceURI(best)
    }
  }, [reader.voices]) // eslint-disable-line

  // Sleep timer
  useEffect(() => {
    if (sleepMin <= 0) return
    const t = window.setTimeout(() => {
      reader.stop()
      setSleepMin(0)
    }, sleepMin * 60_000)
    return () => clearTimeout(t)
  }, [sleepMin]) // eslint-disable-line

  /* ── Persistencia debounced ── */
  const schedulePersist = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      if (!id || !text) return
      await saveBook({
        id,
        title,
        text,
        position: reader.charIndex,
        rate: reader.rate,
        voiceURI: reader.voiceURI,
        chapters,
        bookmarks,
        comments,
        appearance,
      })
    }, 800)
  }, [id, title, text, reader.charIndex, reader.rate, reader.voiceURI, chapters, bookmarks, comments, appearance])

  useEffect(() => {
    schedulePersist()
  }, [reader.charIndex, chapters, bookmarks, comments, appearance]) // eslint-disable-line

  /* ── Derivados ── */
  const paragraphs = useMemo(() => splitParagraphs(text), [text])

  const currentChapterIdx = useMemo(() => {
    let idx = 0
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].start <= reader.charIndex) idx = i
      else break
    }
    return idx
  }, [chapters, reader.charIndex])

  const currentChapter = chapters[currentChapterIdx]
  const nextChapter = chapters[currentChapterIdx + 1]

  const progressPct = text.length ? Math.min(100, Math.round((reader.charIndex / text.length) * 100)) : 0

  const chapterProgress = useMemo(() => {
    if (!currentChapter) return 0
    const start = currentChapter.start
    const end = nextChapter ? nextChapter.start : text.length
    const len = Math.max(1, end - start)
    return Math.min(100, Math.round(((reader.charIndex - start) / len) * 100))
  }, [currentChapter, nextChapter, reader.charIndex, text.length])

  const esVoices = useMemo(
    () =>
      [...reader.voices]
        .filter((v) => v.lang.toLowerCase().startsWith('es') || v.lang.toLowerCase().includes('spa'))
        .sort((a, b) => scoreVoiceHumanness(b) - scoreVoiceHumanness(a)),
    [reader.voices]
  )
  const otherVoices = useMemo(
    () =>
      [...reader.voices]
        .filter((v) => !esVoices.includes(v))
        .sort((a, b) => scoreVoiceHumanness(b) - scoreVoiceHumanness(a)),
    [reader.voices, esVoices]
  )

  const isBookmarkedHere = bookmarks.some((b) => Math.abs(b.charIndex - reader.charIndex) < 40)

  /* ── Acciones ── */
  const goToChar = (pos: number) => {
    reader.setCharIndex(Math.max(0, Math.min(pos, text.length)))
    if (reader.speaking || reader.paused) {
      reader.speakFrom(text, pos, reader.rate, reader.voiceURI)
    }
    // scroll suave
    requestAnimationFrame(() => {
      const el = textRef.current?.querySelector('[data-spoken-end]')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const startAtCursor = () => {
    soundClick()
    reader.speakFrom(text, reader.charIndex, reader.rate, reader.voiceURI)
  }

  /* Swipe horizontal (estilo Wattpad) para cambiar de capítulo en móvil */
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const onSwipeStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const onSwipeEnd = (e: ReactTouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    soundClick()
    if (dx < 0) {
      // swipe izq → siguiente capítulo
      if (nextChapter) goToChar(nextChapter.start)
    } else {
      // swipe der → capítulo anterior
      const prevChapter = chapters[currentChapterIdx - 1]
      if (prevChapter) goToChar(prevChapter.start)
      else goToChar(0)
    }
  }

  const toggleBookmark = () => {
    soundClick()
    if (isBookmarkedHere) {
      setBookmarks((prev) => prev.filter((b) => Math.abs(b.charIndex - reader.charIndex) >= 40))
    } else {
      setShowBookmarkForm(true)
    }
  }

  const addBookmark = () => {
    const bm: Bookmark = {
      id: `bm-${Date.now()}`,
      charIndex: reader.charIndex,
      label: bookmarkNote.trim() || `Marcador ${bookmarks.length + 1}`,
      note: bookmarkNote.trim() || undefined,
      createdAt: new Date().toISOString(),
      chapterId: currentChapter?.id,
    }
    setBookmarks((prev) => [...prev, bm].sort((a, b) => a.charIndex - b.charIndex))
    setBookmarkNote('')
    setShowBookmarkForm(false)
    soundSuccess()
  }

  const addComment = (paraIndex: number) => {
    if (!commentDraft.trim()) return
    const p = paragraphs[paraIndex]
    if (!p) return
    const c: ParagraphComment = {
      id: `cm-${Date.now()}`,
      paraIndex,
      charStart: p.start,
      text: commentDraft.trim(),
      createdAt: new Date().toISOString(),
    }
    setComments((prev) => [...prev, c])
    setCommentDraft('')
    setCommentPara(null)
    soundSuccess()
  }

  const saveChapterEdit = () => {
    const title = newChapterTitle.trim() || `Capítulo ${chapters.length + 1}`
    if (editingChapter?.id) {
      // Renombrar capítulo existente (auto o manual): al editarlo pasa a ser "manual"
      setChapters((prev) => prev.map((c) => (c.id === editingChapter.id ? { ...c, title, source: 'manual' } : c)))
    } else {
      const mark: ChapterMark = {
        id: `ch-man-${Date.now()}`,
        title,
        start: reader.charIndex,
        source: 'manual',
      }
      setChapters((prev) => [...prev, mark].sort((a, b) => a.start - b.start))
    }
    setNewChapterTitle('')
    setEditingChapter(null)
    soundSuccess()
  }

  const openRenameChapter = (ch: ChapterMark) => {
    soundClick()
    setEditingChapter(ch)
    setNewChapterTitle(ch.title)
  }

  const removeChapter = (cid: string) => {
    setChapters((prev) => prev.filter((c) => c.id !== cid))
  }

  const doPersistAndBack = async () => {
    soundClick()
    await persist()
    // forzar guardado de extras
    if (id) {
      await saveBook({
        id,
        title,
        text,
        position: reader.charIndex,
        rate: reader.rate,
        voiceURI: reader.voiceURI,
        chapters,
        bookmarks,
        comments,
        appearance,
      })
    }
    navigate('/nutricion')
  }

  /* ── Estilos dinámicos de lectura ── */
  const modeStyles = useMemo(() => {
    switch (appearance.mode) {
      case 'day':
        return {
          bg: '#F7F3EB',
          ink: '#1A1A1A',
          muted: 'rgba(26,26,26,0.55)',
          glass: 'rgba(255,255,255,0.65)',
          border: 'rgba(0,0,0,0.08)',
          hl: '#0D9B86',
          spoken: 'rgba(13,155,134,0.18)',
        }
      case 'sepia':
        return {
          bg: '#F0E6D2',
          ink: '#3B2F1E',
          muted: 'rgba(59,47,30,0.55)',
          glass: 'rgba(240,230,210,0.7)',
          border: 'rgba(59,47,30,0.12)',
          hl: '#8B5E3C',
          spoken: 'rgba(139,94,60,0.2)',
        }
      default: // night
        return {
          bg: 'var(--gco-bg)',
          ink: 'var(--gco-ink)',
          muted: 'var(--gco-ink-muted)',
          glass: 'var(--gco-glass-bg)',
          border: 'var(--gco-glass-border)',
          hl: 'var(--gco-primary)',
          spoken: 'rgba(34,230,197,0.22)',
        }
    }
  }, [appearance.mode])

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div
      className="reader-root"
      style={{
        ['--reader-bg' as string]: modeStyles.bg,
        ['--reader-ink' as string]: modeStyles.ink,
        ['--reader-muted' as string]: modeStyles.muted,
        ['--reader-glass' as string]: modeStyles.glass,
        ['--reader-border' as string]: modeStyles.border,
        ['--reader-hl' as string]: modeStyles.hl,
        ['--reader-spoken' as string]: modeStyles.spoken,
        background: modeStyles.bg,
        color: modeStyles.ink,
        filter: `brightness(${appearance.brightness})`,
        minHeight: '100dvh',
        transition: 'background 0.35s ease, color 0.3s ease, filter 0.25s ease',
      }}
    >
      {/* ───────────── DESKTOP LAYOUT ───────────── */}
      <div className="reader-desktop">
        {/* Sidebar izquierda — portada + TOC */}
        <aside className="reader-sidebar glass-panel">
          <button type="button" className="reader-icon-btn" onClick={doPersistAndBack} aria-label="Volver">
            <IconBack />
          </button>

          <div className="reader-cover-block">
            <div
              className="reader-cover"
              style={cover ? { backgroundImage: `url(${cover})` } : undefined}
            >
              {!cover && (title.charAt(0) || '📖')}
            </div>
            <h2 className="reader-sidebar-title">{title}</h2>
            {author && <p className="reader-sidebar-author">{author}</p>}
            <div className="reader-sidebar-progress">
              <div className="mini-player-progress">
                <div className="mini-player-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span>{progressPct}% completado</span>
            </div>
          </div>

          <div className="reader-toc-header">
            <span>CONTENIDO</span>
            <button
              type="button"
              className="reader-icon-btn sm"
              title="Añadir capítulo aquí"
              onClick={() => {
                setEditingChapter({ id: '', title: '', start: reader.charIndex, source: 'manual' })
                setNewChapterTitle('')
              }}
            >
              <IconPlus />
            </button>
          </div>

          <nav className="reader-toc">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                type="button"
                className={`reader-toc-item ${i === currentChapterIdx ? 'active' : ''}`}
                onClick={() => {
                  soundClick()
                  goToChar(ch.start)
                }}
              >
                <span className="toc-label">
                  {ch.title}
                  {i === currentChapterIdx && (
                    <span className="toc-item-progress">
                      <span style={{ width: `${chapterProgress}%` }} />
                    </span>
                  )}
                </span>
                <span className="toc-actions">
                  <span
                    className="toc-edit"
                    title="Renombrar capítulo"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRenameChapter(ch)
                    }}
                  >
                    <IconEdit />
                  </span>
                  {ch.source === 'manual' && (
                    <span
                      className="toc-edit"
                      title="Eliminar marca de capítulo"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeChapter(ch.id)
                      }}
                    >
                      <IconTrash />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </nav>

          <button type="button" className="reader-lib-btn" onClick={doPersistAndBack}>
            ← Ir a biblioteca
          </button>
        </aside>

        {/* Área central de lectura */}
        <main className="reader-main">
          <header className="reader-topbar">
            <div className="reader-topbar-left">
              <span className="reader-chapter-label">
                CAPÍTULO {currentChapterIdx + 1} DE {chapters.length || 1}
              </span>
            </div>
            <div className="reader-topbar-actions">
              <button type="button" className="reader-icon-btn" onClick={() => setShowAppearance((v) => !v)} title="Apariencia">
                <span style={{ fontWeight: 700, fontSize: 15 }}>Aa</span>
              </button>
              <button type="button" className="reader-icon-btn" onClick={toggleBookmark} title="Marcador">
                <IconBookmark filled={isBookmarkedHere} />
              </button>
              <button type="button" className="reader-icon-btn" onClick={() => setShowBookmarks(true)} title="Marcadores">
                <IconList />
              </button>
              <button type="button" className="reader-icon-btn" onClick={() => setShowComments(true)} title="Comentarios">
                <IconComment />
              </button>
            </div>
          </header>

          <div className="reader-progress-line">
            <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <article
            key={appearance.pageAnim ? `ch-${currentChapterIdx}` : undefined}
            ref={textRef}
            className={`reader-article ${appearance.pageAnim ? 'page-turn' : ''}`}
            style={{
              fontFamily: FONT_STACK[appearance.font],
              fontSize: appearance.fontSize,
              lineHeight: appearance.lineHeight,
              letterSpacing: `${appearance.letterSpacing}em`,
            }}
          >
            <p className="reader-chapter-kicker">CAPÍTULO {currentChapterIdx + 1}</p>
            <h1 className="reader-chapter-title">{currentChapter?.title || title}</h1>

            <div className="reader-quote-block">
              <IconBrain />
              <p className="reader-quote">
                La mente es como el cielo, y los pensamientos son solo nubes que pasan.
              </p>
            </div>

            {/* Texto con resaltado de lectura + drop cap en primer párrafo */}
            <div
              className="reader-body"
              onClick={(e) => {
                const el = e.currentTarget
                const sel = window.getSelection()
                if (!sel || sel.rangeCount === 0) return
                try {
                  const range = sel.getRangeAt(0)
                  const pre = range.cloneRange()
                  pre.selectNodeContents(el)
                  pre.setEnd(range.startContainer, range.startOffset)
                  const off = pre.toString().length
                  // Ajustar al offset real del capítulo actual si es necesario
                  reader.setCharIndex(off)
                  soundClick()
                } catch {
                  /* */
                }
              }}
            >
              {paragraphs.map((p, pi) => {
                const paraComments = comments.filter((c) => c.paraIndex === pi)
                const isFirst = pi === 0
                const start = p.start
                const end = p.end
                const wordStart = Math.max(0, reader.charIndex - start)
                const localText = p.text
                let beforeTxt = ''
                let wordTxt = ''
                let afterTxt = localText

                if (reader.charIndex >= start && reader.charIndex < end) {
                  beforeTxt = localText.slice(0, wordStart)
                  const rest = localText.slice(wordStart)
                  const wm = rest.match(/^(\S+)/)
                  wordTxt = wm?.[1] ?? ''
                  afterTxt = rest.slice(wordTxt.length)
                } else if (reader.charIndex >= end) {
                  beforeTxt = localText
                  afterTxt = ''
                }

                return (
                  <div key={pi} className="reader-para" data-para={pi}>
                    <p className={isFirst ? 'drop-cap' : undefined}>
                      {beforeTxt && <span className="spoken">{beforeTxt}</span>}
                      {wordTxt && (
                        <span className="current-word" data-spoken-end>
                          {wordTxt}
                        </span>
                      )}
                      <span>{afterTxt}</span>
                    </p>
                    <div className="para-actions">
                      <button
                        type="button"
                        className="para-comment-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCommentPara(pi)
                          setCommentDraft('')
                        }}
                      >
                        <IconComment /> {paraComments.length || ''}
                      </button>
                    </div>
                    {paraComments.length > 0 && (
                      <div className="para-comments-preview">
                        {paraComments.map((c) => (
                          <div key={c.id} className="para-comment-bubble">
                            {c.text}
                            <button
                              type="button"
                              className="comment-del"
                              onClick={() => setComments((prev) => prev.filter((x) => x.id !== c.id))}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </article>

          {/* Controles de transporte inferiores */}
          <footer className="reader-transport">
            <button
              type="button"
              className="transport-btn"
              onClick={() => {
                soundClick()
                reader.skipBack(skipSec)
              }}
            >
              <IconPrev /> Anterior
            </button>

            <button
              type="button"
              className="transport-play"
              onClick={() => {
                soundClick()
                if (reader.speaking && !reader.paused) {
                  soundToggle(false)
                  reader.pause()
                } else if (reader.paused) {
                  reader.resume()
                } else {
                  startAtCursor()
                }
              }}
            >
              {reader.speaking && !reader.paused ? <IconPause /> : <IconPlay />}
            </button>

            <button
              type="button"
              className="transport-btn"
              onClick={() => {
                soundClick()
                if (nextChapter) goToChar(nextChapter.start)
                else reader.skipForward(skipSec)
              }}
            >
              Siguiente <IconNext />
            </button>

            <button
              type="button"
              className="reader-icon-btn"
              onClick={() => setShowToc(true)}
              title="Contenido"
            >
              <IconList />
            </button>
          </footer>

          <div className="reader-bottom-progress">
            <span className="scrub-pct">{progressPct}%</span>
            <input
              type="range"
              className="scrub-slider"
              min={0}
              max={100}
              step={0.1}
              value={progressPct}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                goToChar(Math.round((pct / 100) * text.length))
              }}
              style={{ ['--scrub-fill' as string]: `${progressPct}%` }}
              aria-label="Avanzar o retroceder en el libro"
            />
            <span className="scrub-chapter">
              Capítulo {currentChapterIdx + 1} de {chapters.length || 1}
            </span>
            <button
              type="button"
              className="reader-icon-btn sm"
              title="Brillo y modo de lectura"
              onClick={() => {
                soundClick()
                setShowAppearance(true)
              }}
            >
              <IconSun />
            </button>
          </div>
        </main>

        {/* Panel derecho — Apariencia (mockup exacto) */}
        <aside className={`reader-appearance glass-panel ${showAppearance ? 'open' : ''}`}>
          <div className="appearance-header">
            <h3>Apariencia</h3>
            <button type="button" className="reader-icon-btn sm" onClick={() => setShowAppearance(false)}>
              <IconClose />
            </button>
          </div>

          <div className="appearance-section">
            <label>Aa</label>
            <div className="font-size-presets">
              {[14, 16, 18, 20].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`preset-btn ${appearance.fontSize === sz ? 'active' : ''}`}
                  style={{ fontSize: sz - 2 }}
                  onClick={() => setAppearance((a) => ({ ...a, fontSize: sz }))}
                >
                  Aa
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <label>Fuente</label>
            <select
              className="glass-input"
              value={appearance.font}
              onChange={(e) => setAppearance((a) => ({ ...a, font: e.target.value as FontFamily }))}
            >
              <option value="lora">Lora</option>
              <option value="merriweather">Merriweather</option>
              <option value="source-serif">Source Serif</option>
              <option value="inter">Inter</option>
              <option value="system">Sistema</option>
            </select>
          </div>

          <div className="appearance-section">
            <label>Tamaño del texto</label>
            <div className="size-row">
              <button type="button" className="preset-btn" onClick={() => setAppearance((a) => ({ ...a, fontSize: Math.max(12, a.fontSize - 1) }))}>
                A−
              </button>
              <span>{appearance.fontSize}</span>
              <button type="button" className="preset-btn" onClick={() => setAppearance((a) => ({ ...a, fontSize: Math.min(32, a.fontSize + 1) }))}>
                A+
              </button>
            </div>
          </div>

          <div className="appearance-section">
            <label>Espaciado</label>
            <div className="spacing-presets">
              {[1.4, 1.7, 2.0].map((lh, i) => (
                <button
                  key={lh}
                  type="button"
                  className={`preset-btn icon ${Math.abs(appearance.lineHeight - lh) < 0.05 ? 'active' : ''}`}
                  onClick={() => setAppearance((a) => ({ ...a, lineHeight: lh }))}
                >
                  <span style={{ letterSpacing: i === 0 ? 0 : i === 1 ? '0.04em' : '0.08em' }}>≡</span>
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <label>Brillo</label>
            <input
              type="range"
              min={0.65}
              max={1.2}
              step={0.05}
              value={appearance.brightness}
              onChange={(e) => setAppearance((a) => ({ ...a, brightness: parseFloat(e.target.value) }))}
            />
          </div>

          <div className="appearance-section">
            <label>Modo de lectura</label>
            <div className="mode-presets">
              {(
                [
                  { id: 'day', label: 'Día', icon: '☀️' },
                  { id: 'night', label: 'Noche', icon: '🌙' },
                  { id: 'sepia', label: 'Sepia', icon: '📜' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`mode-btn ${appearance.mode === m.id ? 'active' : ''}`}
                  onClick={() => setAppearance((a) => ({ ...a, mode: m.id }))}
                >
                  <span>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section row">
            <label>Avance automático</label>
            <label className="gco-switch">
              <input
                type="checkbox"
                checked={appearance.autoAdvance}
                onChange={(e) => setAppearance((a) => ({ ...a, autoAdvance: e.target.checked }))}
              />
              <span />
            </label>
          </div>

          <div className="appearance-section row">
            <label>Animaciones de página</label>
            <label className="gco-switch">
              <input
                type="checkbox"
                checked={appearance.pageAnim}
                onChange={(e) => setAppearance((a) => ({ ...a, pageAnim: e.target.checked }))}
              />
              <span />
            </label>
          </div>

          {/* TTS extras */}
          <div className="appearance-section">
            <label>Velocidad {reader.rate.toFixed(1)}×</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={reader.rate}
              onChange={(e) => reader.setRate(parseFloat(e.target.value))}
            />
          </div>

          <div className="appearance-section">
            <label>Voz (mejor calidad primero)</label>
            <select
              className="glass-input"
              value={reader.voiceURI}
              onChange={(e) => reader.setVoiceURI(e.target.value)}
            >
              {esVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
              {otherVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {reader.noVoicesAvailable ? (
              <p className="voice-hint warn">
                <IconWarning /> Este dispositivo no reporta ninguna voz instalada. Ve a Ajustes del sistema → Accesibilidad
                → Conversión de texto a voz y descarga el motor de Google (o el de tu sistema) para poder escuchar el libro.
              </p>
            ) : (
              <p className="voice-hint">
                Se elige automáticamente la voz más humana disponible (Natural / Neural / Google / Microsoft). En Android
                descarga voces de alta calidad en Ajustes → Voz.
              </p>
            )}
          </div>

          <div className="appearance-section">
            <label>Salto</label>
            <div className="skip-row">
              {SKIP.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`preset-btn ${skipSec === s ? 'active' : ''}`}
                  onClick={() => setSkipSec(s)}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <label>Sleep timer</label>
            <div className="skip-row">
              {[0, 5, 15, 30, 45].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`preset-btn ${sleepMin === m ? 'active' : ''}`}
                  onClick={() => setSleepMin(m)}
                >
                  {m === 0 ? 'Off' : `${m}m`}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ───────────── MÓVIL ───────────── */}
      <div className="reader-mobile">
        <header className="mobile-topbar">
          <button type="button" className="reader-icon-btn" onClick={doPersistAndBack}>
            <IconBack />
          </button>
          <div className="mobile-top-actions">
            <button type="button" className="reader-icon-btn" onClick={() => setShowAppearance(true)}>
              <span style={{ fontWeight: 700 }}>Aa</span>
            </button>
            <button type="button" className="reader-icon-btn" onClick={toggleBookmark}>
              <IconBookmark filled={isBookmarkedHere} />
            </button>
            <button type="button" className="reader-icon-btn" onClick={() => setShowToc(true)}>
              <IconList />
            </button>
          </div>
        </header>

        <div className="mobile-progress-meta">
          <span>
            Capítulo {currentChapterIdx + 1} de {chapters.length || 1}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="reader-progress-line">
          <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <article
          key={appearance.pageAnim ? `ch-m-${currentChapterIdx}` : undefined}
          className={`reader-article mobile ${appearance.pageAnim ? 'page-turn' : ''}`}
          style={{
            fontFamily: FONT_STACK[appearance.font],
            fontSize: appearance.fontSize,
            lineHeight: appearance.lineHeight,
            letterSpacing: `${appearance.letterSpacing}em`,
          }}
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
          <p className="reader-chapter-kicker">CAPÍTULO {currentChapterIdx + 1}</p>
          <h1 className="reader-chapter-title">{currentChapter?.title || title}</h1>
          <div className="reader-quote-block">
            <IconBrain />
            <p className="reader-quote">La mente es como el cielo, y los pensamientos son solo nubes que pasan.</p>
          </div>

          <div className="reader-body" ref={textRef}>
            {paragraphs.map((p, pi) => {
              const start = p.start
              const end = p.end
              const localText = p.text
              let beforeTxt = ''
              let wordTxt = ''
              let afterTxt = localText
              if (reader.charIndex >= start && reader.charIndex < end) {
                const wordStart = reader.charIndex - start
                beforeTxt = localText.slice(0, wordStart)
                const rest = localText.slice(wordStart)
                const wm = rest.match(/^(\S+)/)
                wordTxt = wm?.[1] ?? ''
                afterTxt = rest.slice(wordTxt.length)
              } else if (reader.charIndex >= end) {
                beforeTxt = localText
                afterTxt = ''
              }
              return (
                <p key={pi} className={pi === 0 ? 'drop-cap' : undefined}>
                  {beforeTxt && <span className="spoken">{beforeTxt}</span>}
                  {wordTxt && <span className="current-word">{wordTxt}</span>}
                  <span>{afterTxt}</span>
                </p>
              )
            })}
          </div>
        </article>

        <footer className="mobile-transport">
          <button type="button" className="transport-btn" onClick={() => { soundClick(); reader.skipBack(skipSec) }}>
            <IconPrev /> Anterior
          </button>
          <button type="button" className="reader-icon-btn" onClick={() => setShowAppearance(true)}>
            <span style={{ fontWeight: 700 }}>Aa</span>
          </button>
          <button
            type="button"
            className="transport-play"
            onClick={() => {
              soundClick()
              if (reader.speaking && !reader.paused) reader.pause()
              else if (reader.paused) reader.resume()
              else startAtCursor()
            }}
          >
            {reader.speaking && !reader.paused ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="transport-btn" onClick={() => { soundClick(); if (nextChapter) goToChar(nextChapter.start); else reader.skipForward(skipSec) }}>
            Siguiente <IconNext />
          </button>
        </footer>

        <div className="reader-bottom-progress mobile">
          <input
            type="range"
            className="scrub-slider"
            min={0}
            max={100}
            step={0.1}
            value={progressPct}
            onChange={(e) => {
              const pct = parseFloat(e.target.value)
              goToChar(Math.round((pct / 100) * text.length))
            }}
            style={{ ['--scrub-fill' as string]: `${progressPct}%` }}
            aria-label="Avanzar o retroceder en el libro"
          />
          <span className="scrub-pct">{progressPct}%</span>
        </div>
      </div>

      {/* ───────────── MODALES / SHEETS ───────────── */}

      {/* TOC móvil */}
      {showToc && (
        <div className="sheet-overlay" onClick={() => setShowToc(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Contenido</h3>
            <div className="sheet-list">
              {chapters.map((ch, i) => (
                <div key={ch.id} className={`sheet-item row ${i === currentChapterIdx ? 'active' : ''}`}>
                  <button
                    type="button"
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit' }}
                    onClick={() => {
                      goToChar(ch.start)
                      setShowToc(false)
                    }}
                  >
                    {ch.title}
                  </button>
                  <button
                    type="button"
                    className="reader-icon-btn sm"
                    onClick={() => openRenameChapter(ch)}
                    aria-label="Renombrar capítulo"
                  >
                    <IconEdit />
                  </button>
                  {ch.source === 'manual' && (
                    <button
                      type="button"
                      className="reader-icon-btn sm"
                      onClick={() => removeChapter(ch.id)}
                      aria-label="Eliminar marca de capítulo"
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="glass-button secondary"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => {
                setEditingChapter({ id: '', title: '', start: reader.charIndex, source: 'manual' })
                setShowToc(false)
              }}
            >
              + Añadir capítulo en posición actual
            </button>
          </div>
        </div>
      )}

      {/* Bookmarks */}
      {showBookmarks && (
        <div className="sheet-overlay" onClick={() => setShowBookmarks(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Marcadores ({bookmarks.length})</h3>
            {bookmarks.length === 0 && <p className="empty-hint">Aún no hay marcadores. Toca el icono de marcador para añadir uno.</p>}
            <div className="sheet-list">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="sheet-item row">
                  <button
                    type="button"
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit' }}
                    onClick={() => {
                      goToChar(bm.charIndex)
                      setShowBookmarks(false)
                    }}
                  >
                    <strong>{bm.label}</strong>
                    {bm.note && <span className="muted"> — {bm.note}</span>}
                  </button>
                  <button type="button" className="reader-icon-btn sm" onClick={() => setBookmarks((p) => p.filter((x) => x.id !== bm.id))}>
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comments list */}
      {showComments && (
        <div className="sheet-overlay" onClick={() => setShowComments(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Comentarios ({comments.length})</h3>
            {comments.length === 0 && <p className="empty-hint">Toca el icono de comentario junto a un párrafo para añadir uno.</p>}
            <div className="sheet-list">
              {comments.map((c) => (
                <div key={c.id} className="sheet-item row">
                  <button
                    type="button"
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit' }}
                    onClick={() => {
                      goToChar(c.charStart)
                      setShowComments(false)
                    }}
                  >
                    <span className="muted">Párrafo {c.paraIndex + 1}</span>
                    <div>{c.text}</div>
                  </button>
                  <button type="button" className="reader-icon-btn sm" onClick={() => setComments((p) => p.filter((x) => x.id !== c.id))}>
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Formulario marcador */}
      {showBookmarkForm && (
        <div className="sheet-overlay" onClick={() => setShowBookmarkForm(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo marcador</h3>
            <input
              className="glass-input"
              placeholder="Etiqueta o nota (opcional)"
              value={bookmarkNote}
              onChange={(e) => setBookmarkNote(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="glass-button secondary" style={{ flex: 1 }} onClick={() => setShowBookmarkForm(false)}>
                Cancelar
              </button>
              <button type="button" className="glass-button" style={{ flex: 1 }} onClick={addBookmark}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulario comentario de párrafo */}
      {commentPara !== null && (
        <div className="sheet-overlay" onClick={() => setCommentPara(null)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Comentario — párrafo {commentPara + 1}</h3>
            <textarea
              className="glass-input"
              rows={3}
              placeholder="Escribe tu comentario…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="glass-button secondary" style={{ flex: 1 }} onClick={() => setCommentPara(null)}>
                Cancelar
              </button>
              <button type="button" className="glass-button" style={{ flex: 1 }} onClick={() => addComment(commentPara)}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar / crear capítulo manual */}
      {editingChapter && (
        <div className="sheet-overlay" onClick={() => setEditingChapter(null)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <h3>{editingChapter.id ? 'Renombrar capítulo' : 'Nuevo capítulo en posición actual'}</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 8 }}>
              {editingChapter.id
                ? 'Cambia el título con el que aparece en el índice de contenido.'
                : `Se creará un marcador de capítulo en el carácter ${reader.charIndex}.`}
            </p>
            <input
              className="glass-input"
              placeholder="Título del capítulo"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="glass-button secondary" style={{ flex: 1 }} onClick={() => setEditingChapter(null)}>
                Cancelar
              </button>
              <button type="button" className="glass-button" style={{ flex: 1 }} onClick={saveChapterEdit}>
                {editingChapter.id ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apariencia móvil (sheet) */}
      {showAppearance && (
        <div className="sheet-overlay mobile-only" onClick={() => setShowAppearance(false)}>
          <div className="sheet glass-panel appearance-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Apariencia</h3>
            {/* Reutilizamos los mismos controles */}
            <div className="appearance-section">
              <label>Modo</label>
              <div className="mode-presets">
                {(
                  [
                    { id: 'day', label: 'Día', icon: '☀️' },
                    { id: 'night', label: 'Noche', icon: '🌙' },
                    { id: 'sepia', label: 'Sepia', icon: '📜' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mode-btn ${appearance.mode === m.id ? 'active' : ''}`}
                    onClick={() => setAppearance((a) => ({ ...a, mode: m.id }))}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="appearance-section">
              <label>Tamaño {appearance.fontSize}px</label>
              <div className="size-row">
                <button type="button" className="preset-btn" onClick={() => setAppearance((a) => ({ ...a, fontSize: Math.max(12, a.fontSize - 1) }))}>A−</button>
                <input type="range" min={12} max={32} value={appearance.fontSize} onChange={(e) => setAppearance((a) => ({ ...a, fontSize: +e.target.value }))} style={{ flex: 1 }} />
                <button type="button" className="preset-btn" onClick={() => setAppearance((a) => ({ ...a, fontSize: Math.min(32, a.fontSize + 1) }))}>A+</button>
              </div>
            </div>
            <div className="appearance-section">
              <label>Fuente</label>
              <select className="glass-input" value={appearance.font} onChange={(e) => setAppearance((a) => ({ ...a, font: e.target.value as FontFamily }))}>
                <option value="lora">Lora</option>
                <option value="merriweather">Merriweather</option>
                <option value="source-serif">Source Serif</option>
                <option value="inter">Inter</option>
                <option value="system">Sistema</option>
              </select>
            </div>
            <div className="appearance-section">
              <label>Voz</label>
              <select className="glass-input" value={reader.voiceURI} onChange={(e) => reader.setVoiceURI(e.target.value)}>
                {esVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
                {otherVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="appearance-section">
              <label>Velocidad {reader.rate.toFixed(1)}×</label>
              <input type="range" min={0.5} max={2} step={0.1} value={reader.rate} onChange={(e) => reader.setRate(+e.target.value)} />
            </div>
            <button type="button" className="glass-button" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowAppearance(false)}>
              Listo
            </button>
          </div>
        </div>
      )}

      {/* Estilos scoped del reader */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Merriweather:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap');

        .reader-root {
          --reader-radius: 16px;
        }

        /* Desktop grid */
        .reader-desktop {
          display: none;
          min-height: 100dvh;
        }
        @media (min-width: 900px) {
          .reader-desktop {
            display: grid;
            grid-template-columns: 260px 1fr 280px;
            gap: 0;
            min-height: 100dvh;
          }
          .reader-mobile { display: none !important; }
          .mobile-only { display: none !important; }
        }

        .glass-panel {
          background: var(--reader-glass);
          border: 1px solid var(--reader-border);
          backdrop-filter: blur(20px) saturate(1.3);
          -webkit-backdrop-filter: blur(20px) saturate(1.3);
        }

        .reader-sidebar {
          padding: 1.1rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-right: 1px solid var(--reader-border);
          position: sticky;
          top: 0;
          height: 100dvh;
          overflow-y: auto;
        }
        .reader-cover-block { text-align: center; }
        .reader-cover {
          width: 110px; height: 158px;
          margin: 0 auto 0.75rem;
          border-radius: 10px;
          background: linear-gradient(145deg, var(--gco-primary-dim), var(--gco-accent));
          background-size: cover;
          background-position: center;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; font-weight: 700;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        }
        .reader-sidebar-title {
          font-size: 0.95rem; font-weight: 600; line-height: 1.3;
          margin-bottom: 2px;
        }
        .reader-sidebar-author { font-size: 0.78rem; color: var(--reader-muted); }
        .reader-sidebar-progress {
          margin-top: 8px; display: flex; flex-direction: column; gap: 4px;
          font-size: 0.7rem; color: var(--reader-muted);
        }

        .reader-toc-header {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em;
          color: var(--reader-muted); margin-top: 0.5rem;
        }
        .reader-toc { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
        .reader-toc-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.55rem 0.65rem; border-radius: 10px; border: none;
          background: transparent; color: var(--reader-muted);
          font-size: 0.85rem; text-align: left; cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .reader-toc-item:hover { background: rgba(255,255,255,0.06); color: var(--reader-ink); }
        .reader-toc-item.active {
          background: color-mix(in srgb, var(--reader-hl) 18%, transparent);
          color: var(--reader-hl); font-weight: 600;
        }
        .toc-edit { opacity: 0.5; display: flex; }
        .toc-edit:hover { opacity: 1; color: var(--gco-secondary); }
        .toc-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 6px; }
        .toc-label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .toc-item-progress {
          display: block; width: 100%; height: 2px; border-radius: 2px;
          background: var(--reader-border); overflow: hidden;
        }
        .toc-item-progress span { display: block; height: 100%; background: var(--reader-hl); }

        .reader-lib-btn {
          margin-top: auto; padding: 0.6rem; border-radius: 10px;
          border: 1px solid var(--reader-border); background: transparent;
          color: var(--reader-muted); font-size: 0.82rem; cursor: pointer;
        }
        .reader-lib-btn:hover { color: var(--reader-ink); background: rgba(255,255,255,0.05); }

        /* Main */
        .reader-main {
          display: flex; flex-direction: column;
          max-width: 720px; margin: 0 auto; width: 100%;
          padding: 0 1.5rem 2rem;
        }
        .reader-topbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1rem 0 0.5rem; position: sticky; top: 0; z-index: 5;
          background: linear-gradient(to bottom, var(--reader-bg) 70%, transparent);
        }
        .reader-chapter-label {
          font-size: 0.72rem; letter-spacing: 0.08em; font-weight: 600;
          color: var(--reader-muted);
        }
        .reader-topbar-actions { display: flex; gap: 4px; }

        .reader-progress-line {
          height: 3px; background: var(--reader-border); border-radius: 3px;
          margin-bottom: 1.5rem; overflow: hidden;
        }
        .reader-progress-fill {
          height: 100%; background: var(--reader-hl); border-radius: 3px;
          transition: width 0.3s ease;
        }

        .reader-article { flex: 1; padding-bottom: 6rem; }
        .reader-article.page-turn { animation: pageTurnIn 0.42s cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes pageTurnIn {
          from { opacity: 0; transform: translateX(18px) scale(0.99); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .reader-article.page-turn { animation: none; }
        }
        .reader-chapter-kicker {
          text-align: center; font-size: 0.75rem; letter-spacing: 0.12em;
          font-weight: 600; color: var(--reader-hl); margin-bottom: 0.5rem;
        }
        .reader-chapter-title {
          text-align: center; font-size: clamp(1.6rem, 4vw, 2.2rem);
          font-weight: 700; line-height: 1.2; margin-bottom: 1.25rem;
          font-family: "Lora", Georgia, serif;
        }
        .reader-quote-block {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          margin-bottom: 2rem; color: var(--reader-hl);
        }
        .reader-quote {
          text-align: center; font-style: italic; font-size: 0.95rem;
          color: var(--reader-muted); max-width: 28em; line-height: 1.5;
        }

        .reader-body { cursor: text; }
        .reader-para { position: relative; margin-bottom: 1.1em; }
        .reader-para p { margin: 0; }
        .drop-cap::first-letter {
          float: left; font-size: 3.4em; line-height: 0.75;
          padding: 0.08em 0.12em 0 0; font-weight: 700;
          color: var(--reader-hl); font-family: "Lora", Georgia, serif;
        }
        .spoken { background: var(--reader-spoken); border-radius: 2px; }
        .current-word {
          background: var(--reader-hl); color: #0B1220;
          font-weight: 700; border-radius: 3px; padding: 0 2px;
        }
        .para-actions {
          position: absolute; right: -36px; top: 0; opacity: 0;
          transition: opacity 0.15s;
        }
        .reader-para:hover .para-actions { opacity: 1; }
        .para-comment-btn {
          background: transparent; border: none; color: var(--reader-muted);
          cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 2px;
        }
        .para-comments-preview { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
        .para-comment-bubble {
          font-size: 0.8rem; padding: 6px 10px; border-radius: 8px;
          background: color-mix(in srgb, var(--reader-hl) 12%, transparent);
          display: flex; justify-content: space-between; gap: 8px;
        }
        .comment-del { background: none; border: none; color: var(--reader-muted); cursor: pointer; }

        /* Transport */
        .reader-transport {
          position: sticky; bottom: 2.5rem;
          display: flex; align-items: center; justify-content: center; gap: 1rem;
          padding: 0.75rem 1.2rem; border-radius: 999px;
          background: var(--reader-glass); border: 1px solid var(--reader-border);
          backdrop-filter: blur(16px); box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          margin: 0 auto; width: fit-content;
        }
        .transport-btn {
          display: flex; align-items: center; gap: 6px;
          background: transparent; border: none; color: var(--reader-ink);
          font-size: 0.85rem; cursor: pointer; padding: 0.4rem 0.6rem;
        }
        .transport-play {
          width: 52px; height: 52px; border-radius: 50%;
          background: var(--reader-hl); color: #0B1220; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 4px 16px color-mix(in srgb, var(--reader-hl) 40%, transparent);
        }
        .reader-bottom-progress {
          display: flex; align-items: center; gap: 10px;
          font-size: 0.72rem; color: var(--reader-muted);
          padding: 0.5rem 0 1rem;
        }
        .scrub-pct, .scrub-chapter { white-space: nowrap; flex-shrink: 0; }
        .scrub-slider {
          -webkit-appearance: none; appearance: none;
          flex: 1; height: 3px; border-radius: 3px; cursor: pointer;
          background: linear-gradient(
            to right,
            var(--reader-hl) 0%, var(--reader-hl) var(--scrub-fill, 0%),
            var(--reader-border) var(--scrub-fill, 0%), var(--reader-border) 100%
          );
          outline: none; margin: 0;
        }
        .scrub-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--reader-hl); border: 2px solid var(--reader-bg);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          cursor: pointer; transition: transform 0.15s;
        }
        .scrub-slider:active::-webkit-slider-thumb { transform: scale(1.25); }
        .scrub-slider::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--reader-bg);
          background: var(--reader-hl); cursor: pointer;
        }
        .scrub-slider::-moz-range-track { height: 3px; border-radius: 3px; background: transparent; }

        /* Appearance panel */
        .reader-appearance {
          padding: 1.2rem 1rem;
          border-left: 1px solid var(--reader-border);
          position: sticky; top: 0; height: 100dvh; overflow-y: auto;
          display: flex; flex-direction: column; gap: 1rem;
        }
        @media (min-width: 900px) {
          .reader-appearance { display: flex; }
          .reader-appearance:not(.open) { /* always visible on desktop in this layout */ }
        }
        .appearance-header { display: flex; justify-content: space-between; align-items: center; }
        .appearance-header h3 { font-size: 1rem; }
        .appearance-section { display: flex; flex-direction: column; gap: 6px; }
        .appearance-section.row { flex-direction: row; align-items: center; justify-content: space-between; }
        .appearance-section label { font-size: 0.8rem; color: var(--reader-muted); }
        .font-size-presets, .spacing-presets, .mode-presets, .skip-row, .size-row {
          display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
        }
        .preset-btn {
          min-width: 40px; height: 36px; padding: 0 10px;
          border-radius: 10px; border: 1px solid var(--reader-border);
          background: transparent; color: var(--reader-ink); cursor: pointer;
          font-size: 0.85rem;
        }
        .preset-btn.active, .mode-btn.active {
          background: color-mix(in srgb, var(--reader-hl) 22%, transparent);
          border-color: var(--reader-hl); color: var(--reader-hl);
        }
        .mode-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 0.5rem 0.3rem; border-radius: 10px;
          border: 1px solid var(--reader-border); background: transparent;
          color: var(--reader-ink); font-size: 0.72rem; cursor: pointer;
        }
        .voice-hint { font-size: 0.68rem; color: var(--reader-muted); margin-top: 4px; }
        .voice-hint.warn {
          color: var(--gco-secondary); display: flex; align-items: flex-start; gap: 6px;
          background: color-mix(in srgb, var(--gco-secondary) 12%, transparent);
          padding: 8px; border-radius: 8px;
        }

        .reader-icon-btn {
          width: 40px; height: 40px; border-radius: 50%; border: none;
          background: transparent; color: var(--reader-ink);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .reader-icon-btn:hover { background: rgba(255,255,255,0.08); }
        .reader-icon-btn.sm { width: 32px; height: 32px; }

        /* Mobile */
        .reader-mobile {
          display: flex; flex-direction: column; min-height: 100dvh; min-height: 100svh;
          padding: 0 max(1rem, env(safe-area-inset-right)) calc(5rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
          overflow-x: hidden;
        }
        .mobile-topbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.75rem 0; position: sticky; top: 0; z-index: 5;
          background: linear-gradient(to bottom, var(--reader-bg) 60%, transparent);
        }
        .mobile-top-actions { display: flex; gap: 2px; }
        .mobile-progress-meta {
          display: flex; justify-content: space-between;
          font-size: 0.72rem; color: var(--reader-muted); margin-bottom: 4px;
        }
        .mobile-transport {
          position: fixed; left: 50%; bottom: calc(1.2rem + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          display: flex; align-items: center; gap: 0.6rem;
          padding: 0.5rem 0.9rem; border-radius: 999px;
          background: var(--reader-glass); border: 1px solid var(--reader-border);
          backdrop-filter: blur(16px); z-index: 20;
          box-shadow: 0 8px 28px rgba(0,0,0,0.25);
          max-width: calc(100vw - 2rem);
        }
        .reader-bottom-progress.mobile {
          position: fixed;
          left: max(1rem, env(safe-area-inset-left));
          right: max(1rem, env(safe-area-inset-right));
          bottom: calc(4.2rem + env(safe-area-inset-bottom));
          z-index: 15;
        }

        /* Sheets */
        .sheet-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
          display: flex; align-items: flex-end; justify-content: center;
        }
        .sheet {
          width: 100%; max-width: 480px; max-height: 85dvh;
          border-radius: 22px 22px 0 0; padding: 0.75rem 1.2rem 1.5rem;
          overflow-y: auto;
        }
        .sheet-handle {
          width: 36px; height: 4px; border-radius: 4px;
          background: var(--reader-border); margin: 0 auto 1rem;
        }
        .sheet h3 { font-size: 1.05rem; margin-bottom: 0.75rem; }
        .sheet-list { display: flex; flex-direction: column; gap: 4px; }
        .sheet-item {
          padding: 0.7rem 0.8rem; border-radius: 10px; border: none;
          background: transparent; color: var(--reader-ink);
          text-align: left; font-size: 0.9rem; cursor: pointer;
        }
        .sheet-item:hover, .sheet-item.active {
          background: color-mix(in srgb, var(--reader-hl) 14%, transparent);
        }
        .sheet-item.row { display: flex; align-items: center; gap: 8px; }
        .empty-hint { font-size: 0.85rem; color: var(--reader-muted); padding: 1rem 0; }
        .muted { color: var(--reader-muted); }

        @media (min-width: 900px) {
          .sheet-overlay { align-items: center; padding: 1.5rem; }
          .sheet { border-radius: 18px; }
        }
      `}</style>
    </div>
  )
}