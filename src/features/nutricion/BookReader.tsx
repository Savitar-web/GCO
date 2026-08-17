/**
 * BookReader.tsx — Lector de audiolibro + texto premium (corregido)
 * Sticky topbar (móvil/PC) + sidebar desktop.
 * Respeta tema global (Oscuro / Claro / Arcoíris) + modos día/noche/sepia.
 * Render fiel de formato real (** * <u> ~~ color ::align:: imágenes).
 * Cero alucinaciones. Errores TS corregidos.
 */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type CSSProperties,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getBook, saveBook, type BookItem } from '@/core/storage/mediaLibrary'
import { soundClick, soundSuccess } from '@/core/audio/uiSounds'
import { useReaderPlayer } from '@/core/reader/ReaderPlayerContext.tsx'
import { pickHumanVoice, scoreVoiceHumanness, type SkipSeconds } from '@/hooks/useSpeechReader'

/* ───────────────────────── Tipos ───────────────────────── */

export interface ChapterMark {
  id: string
  title: string
  start: number
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
  paraIndex: number
  charStart: number
  text: string
  createdAt: string
}

export interface Highlight {
  id: string
  paraIndex: number
  /** Offset dentro del texto "visible" del párrafo (sin marcado markdown) */
  startOffset: number
  endOffset: number
  /** Copia del fragmento resaltado, para robustez visual */
  text: string
  color: string
  createdAt: string
}

type ReadingMode = 'day' | 'night' | 'sepia'
type FontFamily = 'lora' | 'inter' | 'merriweather' | 'source-serif' | 'system'
type LayoutMode = 'vertical' | 'horizontal'

interface Appearance {
  mode: ReadingMode
  font: FontFamily
  fontSize: number
  lineHeight: number
  letterSpacing: number
  brightness: number
  autoAdvance: boolean
  pageAnim: boolean
  layout: LayoutMode
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
  layout: 'vertical',
}

const FONT_STACK: Record<FontFamily, string> = {
  lora: '"Lora", "Georgia", "Times New Roman", serif',
  inter: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  merriweather: '"Merriweather", "Georgia", serif',
  'source-serif': '"Source Serif 4", "Georgia", serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const SKIP: SkipSeconds[] = [5, 10, 15]
const DESKTOP_MQ = '(min-width: 900px)'
const WORD_PAGE = {
  targetChars: 2200,
  maxParasSoft: 12,
}

const HIGHLIGHT_COLORS: { id: string; label: string; color: string }[] = [
  { id: 'yellow', label: 'Amarillo', color: '#FDE68A' },
  { id: 'green', label: 'Verde', color: '#BBF7D0' },
  { id: 'blue', label: 'Azul', color: '#BFDBFE' },
  { id: 'pink', label: 'Rosa', color: '#FBCFE8' },
  { id: 'orange', label: 'Naranja', color: '#FED7AA' },
]

const AUTHOR_HEADING_RE = /^[ \t]*palabras del autor[ \t]*:?[ \t]*$/gim

function stripAuthorWordsHeading(raw: string): string {
  if (!raw) return raw
  return raw.replace(AUTHOR_HEADING_RE, '').replace(/\n{3,}/g, '\n\n')
}

/* ───────────────────────── matchMedia legacy ───────────────────────── */

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.matchMedia(DESKTOP_MQ).matches
    } catch {
      return typeof window.innerWidth === 'number' ? window.innerWidth >= 900 : false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    let mq: MediaQueryList | null = null
    const apply = () => {
      try {
        if (mq) setIsDesktop(mq.matches)
        else setIsDesktop(window.innerWidth >= 900)
      } catch {
        setIsDesktop(window.innerWidth >= 900)
      }
    }
    try {
      mq = window.matchMedia(DESKTOP_MQ)
      apply()
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', apply)
        return () => mq!.removeEventListener('change', apply)
      }
      const legacy = mq as MediaQueryList & {
        addListener?: (fn: () => void) => void
        removeListener?: (fn: () => void) => void
      }
      if (typeof legacy.addListener === 'function') {
        legacy.addListener(apply)
        return () => legacy.removeListener?.(apply)
      }
    } catch {
      apply()
      const onResize = () => apply()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
  }, [])

  return { isDesktop }
}

/* ───────────────────────── Capítulos ───────────────────────── */

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

  if (!marks.length) {
    marks.push({ id: 'ch-auto-1', title: 'Inicio', start: 0, source: 'auto' })
  } else if (marks[0].start > 0) {
    marks.unshift({ id: 'ch-auto-0', title: 'Inicio', start: 0, source: 'auto' })
  }
  return marks
}

function splitParagraphs(
  text: string
): { text: string; start: number; end: number; isImage?: boolean; imageSrc?: string; indent?: number }[] {
  const paras: {
    text: string
    start: number
    end: number
    isImage?: boolean
    imageSrc?: string
    indent?: number
  }[] = []
  const re = /([^\n]+(?:\n(?!\n)[^\n]+)*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const rawBlock = m[0]
    const t = rawBlock.replace(/^\n+|\n+$/g, '')
    if (!t.trim()) continue

    const imgMatch = t.trim().match(/^!\[([^\]]*)\]\((data:[^)]+|https?:[^)]+|blob:[^)]+)\)(?:\{([^}]*)\})?\s*$/)
    if (imgMatch) {
      paras.push({
        text: t.trim(),
        start: m.index,
        end: m.index + m[0].length,
        isImage: true,
        imageSrc: imgMatch[2],
      })
    } else {
      const lead = t.match(/^[\t ]*/)?.[0] ?? ''
      const indent = lead.replace(/\t/g, '    ').length
      paras.push({
        text: t,
        start: m.index,
        end: m.index + m[0].length,
        indent,
      })
    }
  }
  if (!paras.length && text.trim()) {
    paras.push({ text, start: 0, end: text.length })
  }
  return paras
}

type ParaAlign = 'left' | 'center' | 'right' | 'justify'

function detectAlign(raw: string): ParaAlign {
  const t = raw.trim()
  if (/^::center::|text-align:\s*center|^centered:/i.test(t)) return 'center'
  if (/^::right::|text-align:\s*right/i.test(t)) return 'right'
  if (/^::justify::|text-align:\s*justify/i.test(t)) return 'justify'
  return 'left'
}

function stripAlignMarkers(raw: string): string {
  return raw
    .replace(/^::(center|right|left|justify)::\s*/i, '')
    .replace(/^centered:\s*/i, '')
}

/** Un "run" de texto plano con su formato (negrita/cursiva/subrayado/tachado/color) */
interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
}

/**
 * Convierte el markdown/HTML residual del párrafo en una lista de "runs" de
 * texto plano + formato. A diferencia del render directo a nodos React, esto
 * permite conocer la posición exacta (offset) de cada carácter *visible*
 * dentro del párrafo — necesario para poder superponer subrayados sobre
 * cualquier fragmento que el usuario seleccione, sin que el marcado
 * markdown (**, *, ~~…) descuadre los índices.
 */
function buildInlineRuns(text: string): InlineRun[] {
  let s = text
  s = s.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
  s = s.replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
  s = s.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
  s = s.replace(/<u>([\s\S]*?)<\/u>/gi, '§u§$1§/u§')
  s = s.replace(/<(s|strike|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~')

  type Seg = { t: string; color?: string }
  const segs: Seg[] = []
  const colorRe = /<span\s+style=["'][^"']*color:\s*([^;"']+)[^"']*["']>([\s\S]*?)<\/span>/gi
  let last = 0
  let cm: RegExpExecArray | null
  while ((cm = colorRe.exec(s))) {
    if (cm.index > last) segs.push({ t: s.slice(last, cm.index) })
    segs.push({ t: cm[2], color: cm[1].trim() })
    last = cm.index + cm[0].length
  }
  if (last < s.length) segs.push({ t: s.slice(last) })
  if (!segs.length) segs.push({ t: s })

  const runs: InlineRun[] = []

  const pushMarkdown = (chunk: string, color?: string) => {
    const parts = chunk.split(/(\*\*[\s\S]+?\*\*|~~[\s\S]+?~~|§u§[\s\S]+?§\/u§|\*[^*\n]+?\*)/g)
    for (const p of parts) {
      if (!p) continue
      if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
        runs.push({ text: p.slice(2, -2), bold: true, color })
      } else if (p.startsWith('~~') && p.endsWith('~~') && p.length >= 4) {
        runs.push({ text: p.slice(2, -2), strike: true, color })
      } else if (p.startsWith('§u§') && p.endsWith('§/u§') && p.length >= 7) {
        runs.push({ text: p.slice(3, -4), underline: true, color })
      } else if (p.startsWith('*') && p.endsWith('*') && p.length >= 3 && !p.startsWith('**')) {
        runs.push({ text: p.slice(1, -1), italic: true, color })
      } else {
        runs.push({ text: p, color })
      }
    }
  }

  for (const seg of segs) pushMarkdown(seg.t, seg.color)
  return runs.filter((r) => r.text.length > 0)
}

/** Texto plano equivalente a una lista de runs (lo que el usuario realmente ve/selecciona) */
function plainTextOfRuns(runs: InlineRun[]): string {
  return runs.map((r) => r.text).join('')
}

interface HighlightRange {
  id: string
  start: number
  end: number
  color: string
}

/**
 * Renderiza los runs aplicando el formato normal (negrita/cursiva/…) y, por
 * encima, cualquier subrayado (`<mark>`) cuyo rango se solape con cada run,
 * partiéndolo en los trozos necesarios para no perder ni el formato ni la
 * fidelidad del resaltado.
 */
function renderRunsWithHighlights(
  runs: InlineRun[],
  ranges: HighlightRange[],
  onMarkClick?: (id: string, e: React.MouseEvent<HTMLElement>) => void
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let key = 0
  let cursor = 0

  const wrap = (run: InlineRun, slice: string, node: React.ReactNode = slice): React.ReactNode => {
    let n = node
    const style: React.CSSProperties = run.color ? { color: run.color } : {}
    if (run.bold) n = <strong>{n}</strong>
    if (Object.keys(style).length) n = <span style={style}>{n}</span>
    if (run.italic) n = <em>{n}</em>
    if (run.underline) n = <u>{n}</u>
    if (run.strike) n = <s>{n}</s>
    return n
  }

  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd

    const overlaps = ranges
      .filter((r) => r.start < runEnd && r.end > runStart)
      .sort((a, b) => a.start - b.start)

    if (!overlaps.length) {
      nodes.push(<React.Fragment key={key++}>{wrap(run, run.text)}</React.Fragment>)
      continue
    }

    let pos = runStart
    for (const r of overlaps) {
      const segStart = Math.max(pos, r.start)
      const segEnd = Math.min(runEnd, r.end)
      if (segStart > pos) {
        const plain = run.text.slice(pos - runStart, segStart - runStart)
        nodes.push(<React.Fragment key={key++}>{wrap(run, plain)}</React.Fragment>)
      }
      const hlText = run.text.slice(segStart - runStart, segEnd - runStart)
      nodes.push(
        <mark
          key={key++}
          className="reader-highlight-mark"
          style={{ backgroundColor: r.color }}
          onClick={(e) => onMarkClick?.(r.id, e)}
        >
          {wrap(run, hlText)}
        </mark>
      )
      pos = segEnd
    }
    if (pos < runEnd) {
      const plain = run.text.slice(pos - runStart)
      nodes.push(<React.Fragment key={key++}>{wrap(run, plain)}</React.Fragment>)
    }
  }
  return nodes
}

/**
 * Recorre los nodos de texto de `root` para hallar el offset "plano"
 * (sin marcado) correspondiente a un punto (node, offset) de un Range de
 * selección del navegador. Es estable frente a negrita/cursiva/subrayado
 * porque camina exactamente sobre lo que el usuario ve y selecciona.
 */
function getPlainOffsetInElement(root: HTMLElement, targetNode: Node, targetOffset: number): number {
  if (targetNode.nodeType !== Node.TEXT_NODE) {
    // El navegador puede referenciar un elemento contenedor (p.ej. al
    // seleccionar hasta el final del párrafo). Aproximamos sumando el
    // texto de los hijos anteriores al índice indicado.
    let acc = 0
    const children = targetNode.childNodes
    for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
      acc += (children[i].textContent || '').length
    }
    if (targetNode === root) return acc
    // Si el nodo no es la raíz, camina hasta él y suma su longitud interna
    let offset = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (targetNode.contains(node)) return offset + acc
      offset += (node.textContent || '').length
    }
    return offset
  }
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === targetNode) return offset + targetOffset
    offset += (node.textContent || '').length
  }
  return offset
}

function parseImageMeta(srcLine: string): { src: string; width?: string; align?: ParaAlign; alt: string } | null {
  const m2 = srcLine.trim().match(/^!\[([^\]]*)\]\((data:[^)]+|https?:[^)]+|blob:[^)]+)\)(?:\{([^}]*)\})?\s*$/)
  if (!m2) return null
  let width: string | undefined
  let align: ParaAlign | undefined
  if (m2[3]) {
    const w = m2[3].match(/width\s*=\s*([\d.]+%?)/i)
    if (w) width = w[1].includes('%') ? w[1] : w[1] + 'px'
    const a = m2[3].match(/align\s*=\s*(left|center|right)/i)
    if (a) align = a[1].toLowerCase() as ParaAlign
  }
  return { src: m2[2], alt: m2[1] || '', width, align }
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
function IconLayoutV() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}
function IconLayoutH() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="7" height="14" rx="1.5" />
      <rect x="14" y="5" width="7" height="14" rx="1.5" />
    </svg>
  )
}
function IconImageGallery() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L4 19" />
    </svg>
  )
}
function IconMarker() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11 15 5l4 4-6 6" />
      <path d="M4 20l3.5-1 6-6-2.5-2.5-6 6z" />
      <path d="M13 7l4 4" />
    </svg>
  )
}
function IconExpand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  )
}
function IconSwipeHint() {
  return (
    <svg className="swipe-hint-icon" width="20" height="14" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h14M11 3l5 5-5 5" />
      <path d="M18.5 8h3" opacity="0.4" />
    </svg>
  )
}

/* ───────────────────────── Paginación horizontal ───────────────────────── */

interface PageSlice {
  paraIndices: number[]
  startChar: number
  endChar: number
}

function buildPages(
  paragraphs: { text: string; start: number; end: number; isImage?: boolean }[],
  charsBudget = WORD_PAGE.targetChars
): PageSlice[] {
  if (!paragraphs.length) return [{ paraIndices: [], startChar: 0, endChar: 0 }]
  const pages: PageSlice[] = []
  let cur: number[] = []
  let used = 0
  let pageStart = paragraphs[0].start

  const flush = (endChar: number) => {
    if (!cur.length) return
    pages.push({ paraIndices: [...cur], startChar: pageStart, endChar })
    cur = []
    used = 0
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const cost = p.isImage ? Math.max(Math.floor(charsBudget * 0.45), 400) : Math.max(p.text.length, 40)

    if (p.isImage && cur.length > 0 && used > charsBudget * 0.15) {
      const prev = paragraphs[cur[cur.length - 1]]
      flush(prev.end)
      pageStart = p.start
    }

    if (cur.length > 0 && !p.isImage && (used + cost > charsBudget || cur.length >= WORD_PAGE.maxParasSoft)) {
      const prev = paragraphs[cur[cur.length - 1]]
      flush(prev.end)
      pageStart = p.start
    }

    if (p.isImage && cur.length === 0) {
      cur.push(i)
      flush(p.end)
      if (i + 1 < paragraphs.length) pageStart = paragraphs[i + 1].start
      continue
    }

    cur.push(i)
    used += cost

    if (p.isImage) {
      flush(p.end)
      if (i + 1 < paragraphs.length) pageStart = paragraphs[i + 1].start
    }
  }
  if (cur.length) {
    const last = paragraphs[cur[cur.length - 1]]
    flush(last.end)
  }
  return pages.length
    ? pages
    : [{ paraIndices: paragraphs.map((_, i) => i), startChar: 0, endChar: paragraphs[paragraphs.length - 1]?.end ?? 0 }]
}

/* ───────────────────────── Componente principal ───────────────────────── */

export function BookReader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { reader, loadBook } = useReaderPlayer()
  const { isDesktop } = useIsDesktop()

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [chapters, setChapters] = useState<ChapterMark[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [comments, setComments] = useState<ParagraphComment[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [skipSec, setSkipSec] = useState<SkipSeconds>(10)
  const [sleepMin, setSleepMin] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showToc, setShowToc] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showImageGallery, setShowImageGallery] = useState(false)
  const [editingChapter, setEditingChapter] = useState<ChapterMark | null>(null)
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [commentPara, setCommentPara] = useState<number | null>(null)
  const [bookmarkNote, setBookmarkNote] = useState('')
  const [showBookmarkForm, setShowBookmarkForm] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [transportVisible, setTransportVisible] = useState(true)
  const [highlightMode, setHighlightMode] = useState(false)
  const [selectionPopup, setSelectionPopup] = useState<{
    paraIndex: number
    startOffset: number
    endOffset: number
    text: string
    x: number
    y: number
    editingId?: string
  } | null>(null)

  const [pageIndex, setPageIndex] = useState(0)
  const [pages, setPages] = useState<PageSlice[]>([])
  const [pageAnimDir, setPageAnimDir] = useState<0 | 1 | -1>(0)

  const textRef = useRef<HTMLDivElement>(null)
  const pageAreaRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)
  const pageCalcTimer = useRef<number | null>(null)
  const idleTimer = useRef<number | null>(null)

  /* ── Carga ── */
  useEffect(() => {
    if (!id) return
    let cancelled = false

    const normalizeFont = (f?: string): FontFamily => {
      const allowed: FontFamily[] = ['lora', 'inter', 'merriweather', 'source-serif', 'system']
      if (f && (allowed as string[]).includes(f)) return f as FontFamily
      return DEFAULT_APPEARANCE.font
    }

    const normalizeAppearance = (raw?: Record<string, unknown> | null): Appearance => {
      if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE }
      const modeRaw = raw.mode
      const mode: ReadingMode =
        modeRaw === 'day' || modeRaw === 'sepia' || modeRaw === 'night' ? modeRaw : DEFAULT_APPEARANCE.mode
      const layout: LayoutMode = raw.layout === 'horizontal' ? 'horizontal' : 'vertical'
      return {
        ...DEFAULT_APPEARANCE,
        mode,
        font: normalizeFont(typeof raw.font === 'string' ? raw.font : undefined),
        fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : DEFAULT_APPEARANCE.fontSize,
        lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : DEFAULT_APPEARANCE.lineHeight,
        letterSpacing: typeof raw.letterSpacing === 'number' ? raw.letterSpacing : DEFAULT_APPEARANCE.letterSpacing,
        brightness: typeof raw.brightness === 'number' ? raw.brightness : DEFAULT_APPEARANCE.brightness,
        autoAdvance: typeof raw.autoAdvance === 'boolean' ? raw.autoAdvance : DEFAULT_APPEARANCE.autoAdvance,
        pageAnim: typeof raw.pageAnim === 'boolean' ? raw.pageAnim : DEFAULT_APPEARANCE.pageAnim,
        layout,
      }
    }

    const applyBook = (b: BookItem) => {
      if (cancelled) return
      setTitle(b.title)
      setAuthor(b.author || '')
      setText(stripAuthorWordsHeading(b.text || ''))
      setCover(b.coverDataUrl || null)
      if (b.chapters?.length) setChapters(b.chapters as ChapterMark[])
      else setChapters(detectChapters(stripAuthorWordsHeading(b.text || '')))
      if (b.bookmarks) setBookmarks(b.bookmarks as Bookmark[])
      if (b.comments) setComments(b.comments as ParagraphComment[])
      if (b.highlights?.length) {
        // Migra marcadores antiguos (párrafo completo, sin offsets) a rangos.
        const migrated = (b.highlights as Highlight[]).map((h) => ({
          ...h,
          startOffset: typeof h.startOffset === 'number' ? h.startOffset : 0,
          endOffset: typeof h.endOffset === 'number' ? h.endOffset : Number.MAX_SAFE_INTEGER,
          text: h.text || '',
        }))
        setHighlights(migrated)
      } else {
        setHighlights([])
      }
      if (b.appearance) {
        setAppearance(normalizeAppearance(b.appearance as unknown as Record<string, unknown>))
      }
      try {
        reader.setRate(b.rate || 1)
        const best = pickHumanVoice(reader.voices, b.voiceURI)
        if (best) reader.setVoiceURI(best)
        loadBook(b, b.position || 0)
      } catch {
        /* */
      }
      setLoading(false)
      setLoadError(null)
    }

    void getBook(id)
      .then((b) => {
        if (cancelled) return
        if (!b) {
          navigate('/nutricion')
          return
        }
        applyBook(b)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError('No se pudo cargar el libro.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!text) return
    const hasManual = chapters.some((c) => c.source === 'manual')
    if (!hasManual && chapters.length <= 1) {
      setChapters(detectChapters(text))
    }
  }, [text]) // eslint-disable-line

  useEffect(() => {
    if (!reader.voices.length) return
    if (!reader.voiceURI) {
      const best = pickHumanVoice(reader.voices)
      if (best) reader.setVoiceURI(best)
    }
  }, [reader.voices]) // eslint-disable-line

  useEffect(() => {
    if (sleepMin <= 0) return
    const t = window.setTimeout(() => {
      reader.stop()
      setSleepMin(0)
    }, sleepMin * 60_000)
    return () => clearTimeout(t)
  }, [sleepMin]) // eslint-disable-line

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    const show = () => {
      setTransportVisible(true)
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setTransportVisible(false), 3200)
    }
    show()
    window.addEventListener('mousemove', show)
    window.addEventListener('mousedown', show)
    window.addEventListener('touchstart', show)
    window.addEventListener('scroll', show, true)
    window.addEventListener('keydown', show)
    return () => {
      window.removeEventListener('mousemove', show)
      window.removeEventListener('mousedown', show)
      window.removeEventListener('touchstart', show)
      window.removeEventListener('scroll', show, true)
      window.removeEventListener('keydown', show)
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
    }
  }, [])

  const appearancePayload = useCallback(
    () => ({
      mode: appearance.mode,
      font: appearance.font,
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      letterSpacing: appearance.letterSpacing,
      brightness: appearance.brightness,
      autoAdvance: appearance.autoAdvance,
      pageAnim: appearance.pageAnim,
      layout: appearance.layout,
    }),
    [appearance]
  )

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      if (!id || !text) return
      try {
        const payload = {
          id,
          title,
          text,
          position: reader.charIndex,
          rate: reader.rate,
          voiceURI: reader.voiceURI,
          chapters,
          bookmarks,
          comments,
          highlights,
          appearance: appearancePayload(),
        }
        await saveBook(payload as unknown as Parameters<typeof saveBook>[0])
      } catch {
        /* ignore */
      }
    }, 800)
  }, [id, title, text, reader.charIndex, reader.rate, reader.voiceURI, chapters, bookmarks, comments, highlights, appearancePayload])

  useEffect(() => {
    schedulePersist()
  }, [reader.charIndex, chapters, bookmarks, comments, highlights, appearance]) // eslint-disable-line

  const paragraphs = useMemo(() => splitParagraphs(text), [text])


  const imageParas = useMemo(
    () => paragraphs.map((p, i) => ({ p, i })).filter((x) => x.p.isImage),
    [paragraphs]
  )

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
  const isPlaying = reader.speaking && !reader.paused

  /* ── Páginas horizontales ── */
  const recalcPages = useCallback(() => {
    if (appearance.layout !== 'horizontal' || !paragraphs.length) {
      setPages([])
      return
    }
    const next = buildPages(paragraphs)
    setPages(next)
    let best = 0
    for (let i = 0; i < next.length; i++) {
      if (next[i].startChar <= reader.charIndex) best = i
      else break
    }
    setPageIndex(best)
  }, [appearance.layout, paragraphs, reader.charIndex])

  useLayoutEffect(() => {
    if (appearance.layout !== 'horizontal') return
    if (pageCalcTimer.current) window.clearTimeout(pageCalcTimer.current)
    pageCalcTimer.current = window.setTimeout(recalcPages, 40)
    return () => {
      if (pageCalcTimer.current) window.clearTimeout(pageCalcTimer.current)
    }
  }, [recalcPages, isDesktop, appearance.mode, appearance.brightness, appearance.letterSpacing, appearance.fontSize, appearance.lineHeight])

  useEffect(() => {
    if (appearance.layout !== 'horizontal') return
    const onResize = () => {
      if (pageCalcTimer.current) window.clearTimeout(pageCalcTimer.current)
      pageCalcTimer.current = window.setTimeout(recalcPages, 100)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    let ro: ResizeObserver | null = null
    if (pageAreaRef.current && typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(onResize)
        ro.observe(pageAreaRef.current)
      } catch {
        /* */
      }
    }
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      try {
        ro?.disconnect()
      } catch {
        /* */
      }
    }
  }, [appearance.layout, recalcPages])

  const totalPages = Math.max(1, pages.length)
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1)

  const goPage = (idx: number, dir: 1 | -1 = 1) => {
    const next = Math.max(0, Math.min(idx, totalPages - 1))
    if (next === safePageIndex) return
    setPageAnimDir(dir)
    setPageIndex(next)
    const slice = pages[next]
    if (slice) reader.setCharIndex(slice.startChar)
    window.setTimeout(() => setPageAnimDir(0), 620)
  }

  const goToChar = (pos: number) => {
    const p = Math.max(0, Math.min(pos, text.length))
    reader.setCharIndex(p)
    if (reader.speaking || reader.paused) {
      reader.speakFrom(text, p, reader.rate, reader.voiceURI)
    }
    if (appearance.layout === 'horizontal' && pages.length) {
      let best = 0
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].startChar <= p) best = i
        else break
      }
      setPageIndex(best)
    } else {
      requestAnimationFrame(() => {
        try {
          textRef.current?.querySelector('[data-spoken-end]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch {
          /* */
        }
      })
    }
  }

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
    if (appearance.layout === 'horizontal') {
      if (dx < 0) goPage(safePageIndex + 1, 1)
      else goPage(safePageIndex - 1, -1)
      return
    }
    if (dx < 0) {
      if (nextChapter) goToChar(nextChapter.start)
    } else {
      const prev = chapters[currentChapterIdx - 1]
      if (prev) goToChar(prev.start)
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
    setComments((prev) => [
      ...prev,
      {
        id: `cm-${Date.now()}`,
        paraIndex,
        charStart: p.start,
        text: commentDraft.trim(),
        createdAt: new Date().toISOString(),
      },
    ])
    setCommentDraft('')
    setCommentPara(null)
    soundSuccess()
  }

  /** Halla el offset "plano" (post-markdown) de un punto de selección dentro de un párrafo */
  const captureSelectionHighlight = useCallback(() => {
    if (!highlightMode) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const asElement = (n: Node): Element | null => (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element))
    const startHost = asElement(range.startContainer)?.closest('[data-para]') as HTMLElement | null
    const endHost = asElement(range.endContainer)?.closest('[data-para]') as HTMLElement | null
    if (!startHost || !endHost) return
    const paraIndex = Number(startHost.getAttribute('data-para'))
    const endParaIndex = Number(endHost.getAttribute('data-para'))
    if (Number.isNaN(paraIndex)) return
    const pEl = startHost.querySelector('p')
    if (!pEl) return

    let endContainer: Node = range.endContainer
    let endOffsetRaw = range.endOffset
    if (endParaIndex !== paraIndex) {
      // Selección multi-párrafo: recortamos al final del primer párrafo.
      endContainer = pEl
      endOffsetRaw = pEl.childNodes.length
    }

    const a = getPlainOffsetInElement(pEl, range.startContainer, range.startOffset)
    const b = getPlainOffsetInElement(pEl, endContainer, endOffsetRaw)
    const from = Math.max(0, Math.min(a, b))
    const to = Math.max(a, b)
    if (to - from < 1) return

    const rect = range.getBoundingClientRect()
    const plainLen = plainTextOfRuns(buildInlineRuns(stripAlignMarkers(paragraphs[paraIndex]?.text || '')))
      .length
    const clampedTo = Math.min(to, plainLen)
    const text = (pEl.textContent || '').slice(from, clampedTo)
    if (!text.trim()) return

    setSelectionPopup({
      paraIndex,
      startOffset: from,
      endOffset: clampedTo,
      text,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top),
    })
  }, [highlightMode, paragraphs])

  useEffect(() => {
    if (!highlightMode) return
    let t: number | null = null
    const onChange = () => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(captureSelectionHighlight, 60)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      if (t) window.clearTimeout(t)
    }
  }, [highlightMode, captureSelectionHighlight])

  const openHighlightEditor = useCallback(
    (hid: string, e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      soundClick()
      const h = highlights.find((x) => x.id === hid)
      if (!h) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setSelectionPopup({
        paraIndex: h.paraIndex,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        text: h.text,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top),
        editingId: h.id,
      })
    },
    [highlights]
  )

  const applySelectionColor = (color: string) => {
    if (!selectionPopup) return
    soundClick()
    setHighlights((prev) => {
      if (selectionPopup.editingId) {
        return prev.map((h) => (h.id === selectionPopup.editingId ? { ...h, color } : h))
      }
      return [
        ...prev,
        {
          id: `hl-${Date.now()}`,
          paraIndex: selectionPopup.paraIndex,
          startOffset: selectionPopup.startOffset,
          endOffset: selectionPopup.endOffset,
          text: selectionPopup.text,
          color,
          createdAt: new Date().toISOString(),
        },
      ]
    })
    try {
      window.getSelection()?.removeAllRanges()
    } catch {
      /* */
    }
    setSelectionPopup(null)
  }

  const removeSelectionHighlight = () => {
    if (!selectionPopup?.editingId) return
    soundClick()
    setHighlights((prev) => prev.filter((h) => h.id !== selectionPopup.editingId))
    setSelectionPopup(null)
  }

  const toggleHighlightMode = () => {
    soundClick()
    setHighlightMode((v) => {
      const next = !v
      if (!next) {
        try {
          window.getSelection()?.removeAllRanges()
        } catch {
          /* */
        }
        setSelectionPopup(null)
      }
      return next
    })
  }

  const saveChapterEdit = () => {
    const t = newChapterTitle.trim() || `Capítulo ${chapters.length + 1}`
    if (editingChapter?.id) {
      setChapters((prev) => prev.map((c) => (c.id === editingChapter.id ? { ...c, title: t, source: 'manual' as const } : c)))
    } else {
      setChapters((prev) =>
        [
          ...prev,
          {
            id: `ch-man-${Date.now()}`,
            title: t,
            start: reader.charIndex,
            source: 'manual' as const,
          },
        ].sort((a, b) => a.start - b.start)
      )
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

  const toggleReaderPlayback = useCallback(() => {
    soundClick()
    const anyReader = reader as unknown as {
      pause?: () => void
      resume?: () => void
    }
    if (reader.speaking && !reader.paused) {
      if (typeof anyReader.pause === 'function') {
        anyReader.pause()
      } else {
        reader.stop()
      }
      return
    }
    if (reader.paused && typeof anyReader.resume === 'function') {
      anyReader.resume()
      return
    }
    reader.speakFrom(text, reader.charIndex, reader.rate, reader.voiceURI)
  }, [reader, text])

  /* ── MediaSession: metadatos (portada/título/autor) para lockscreen y notificación ── */
  useEffect(() => {
    const anyReader = reader as unknown as {
      setMediaMetadata?: (m: { title: string; artist?: string; album?: string; artwork?: string }) => void
    }
    anyReader.setMediaMetadata?.({
      title: currentChapter?.title || title || 'Audiolibro',
      artist: author || undefined,
      album: title || undefined,
      artwork: cover || undefined,
    })
  }, [reader, title, author, cover, currentChapter])

  /* ── MediaSession: capítulo anterior/siguiente desde controles del sistema ── */
  useEffect(() => {
    const anyReader = reader as unknown as {
      setChapterHandlers?: (h: { onPrevChapter?: () => void; onNextChapter?: () => void }) => void
    }
    anyReader.setChapterHandlers?.({
      onPrevChapter: () => {
        const prev = chapters[currentChapterIdx - 1]
        if (prev) goToChar(prev.start)
        else goToChar(Math.max(0, reader.charIndex - 800))
      },
      onNextChapter: () => {
        if (nextChapter) goToChar(nextChapter.start)
        else goToChar(Math.min(text.length, reader.charIndex + 800))
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, chapters, currentChapterIdx, nextChapter, text.length])

  /* ── Cierra el selector de color de marcatextos al tocar fuera ── */
  useEffect(() => {
    if (!selectionPopup) return
    let bound = false
    const onDocClick = () => setSelectionPopup(null)
    const t = window.setTimeout(() => {
      document.addEventListener('click', onDocClick, { once: true })
      bound = true
    }, 80)
    return () => {
      window.clearTimeout(t)
      if (bound) document.removeEventListener('click', onDocClick)
    }
  }, [selectionPopup])

  /* ── Render de párrafo fiel ── */
  const renderParagraph = (p: ReturnType<typeof splitParagraphs>[number], idx: number, isFirst: boolean) => {
    if (p.isImage && p.imageSrc) {
      const meta = parseImageMeta(p.text)
      const imgStyle: CSSProperties = {
        maxWidth: '100%',
        width: meta?.width && meta.width.includes('%') ? meta.width : undefined,
        height: 'auto',
        display: 'block',
        margin: meta?.align === 'left' ? '0.5em 0' : meta?.align === 'right' ? '0.5em 0 0.5em auto' : '0.5em auto',
      }
      return (
        <div key={idx} className="reader-para reader-para-image" data-para={idx}>
          <button
            type="button"
            className="reader-image-btn"
            aria-label="Ampliar imagen"
            onClick={() => {
              soundClick()
              setLightbox({ src: p.imageSrc as string, alt: meta?.alt || '' })
            }}
          >
            <img
              src={p.imageSrc}
              alt={meta?.alt || ''}
              style={imgStyle}
              loading="lazy"
              decoding="async"
              className="reader-inline-image"
            />
            <span className="image-expand-hint" aria-hidden="true">
              <IconExpand />
            </span>
          </button>
        </div>
      )
    }

    const align = detectAlign(p.text)
    const clean = stripAlignMarkers(p.text)
    const indentStyle: CSSProperties = p.indent && p.indent > 0 ? { paddingLeft: `${Math.min(p.indent * 0.6, 4)}em` } : {}
    const alignStyle: CSSProperties = align !== 'left' ? { textAlign: align } : {}
    const runs = buildInlineRuns(clean)
    const plainLen = plainTextOfRuns(runs).length
    const paraHighlights: HighlightRange[] = highlights
      .filter((h) => h.paraIndex === idx)
      .map((h) => ({ id: h.id, start: h.startOffset, end: Math.min(h.endOffset, plainLen), color: h.color }))
      .filter((r) => r.end > r.start)

    return (
      <div key={idx} className="reader-para" data-para={idx} style={{ ...indentStyle, ...alignStyle }}>
        <div className="para-row">
          <p className={isFirst ? 'drop-cap' : undefined}>
            {renderRunsWithHighlights(runs, paraHighlights, openHighlightEditor)}
          </p>
          <button
            type="button"
            className="para-comment-btn"
            aria-label="Comentar párrafo"
            onClick={() => {
              soundClick()
              setCommentPara(idx)
              setCommentDraft('')
            }}
          >
            <IconComment />
            {comments.filter((c) => c.paraIndex === idx).length > 0 && (
              <span className="para-comment-count">{comments.filter((c) => c.paraIndex === idx).length}</span>
            )}
          </button>
        </div>
        {comments.filter((c) => c.paraIndex === idx).length > 0 && (
          <div className="para-comments-preview">
            {comments
              .filter((c) => c.paraIndex === idx)
              .map((c) => (
                <div key={c.id} className="para-comment-bubble">
                  <span>{c.text}</span>
                  <button
                    type="button"
                    className="comment-del"
                    aria-label="Eliminar comentario"
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
  }

  /* ── Controles de apariencia ── */
  const appearanceControls = (
    <>
      <div className="appearance-group">
        <h4 className="appearance-group-title">Modo de lectura</h4>
        <div className="mode-presets">
          {(['day', 'night', 'sepia'] as ReadingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-btn ${appearance.mode === m ? 'active' : ''}`}
              onClick={() => {
                soundClick()
                setAppearance((a) => ({ ...a, mode: m }))
              }}
            >
              {m === 'day' ? 'Día' : m === 'night' ? 'Noche' : 'Sepia'}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-group">
        <h4 className="appearance-group-title">Tipografía</h4>
        <div className="appearance-section">
          <label>Fuente</label>
          <select
            className="glass-input"
            value={appearance.font}
            onChange={(e) => setAppearance((a) => ({ ...a, font: e.target.value as FontFamily }))}
          >
            <option value="lora">Lora</option>
            <option value="inter">Inter</option>
            <option value="merriweather">Merriweather</option>
            <option value="source-serif">Source Serif</option>
            <option value="system">Sistema</option>
          </select>
        </div>

        <div className="appearance-section">
          <label>Tamaño · {appearance.fontSize}px</label>
          <input
            type="range"
            className="reader-slider"
            min={14}
            max={28}
            step={1}
            value={appearance.fontSize}
            onChange={(e) => setAppearance((a) => ({ ...a, fontSize: Number(e.target.value) }))}
            style={{ ['--fill' as string]: `${((appearance.fontSize - 14) / 14) * 100}%` }}
          />
        </div>

        <div className="appearance-section">
          <label>Interlineado · {appearance.lineHeight.toFixed(1)}</label>
          <input
            type="range"
            className="reader-slider"
            min={1.3}
            max={2.2}
            step={0.1}
            value={appearance.lineHeight}
            onChange={(e) => setAppearance((a) => ({ ...a, lineHeight: Number(e.target.value) }))}
            style={{ ['--fill' as string]: `${((appearance.lineHeight - 1.3) / 0.9) * 100}%` }}
          />
        </div>

        <div className="appearance-section">
          <label>Espaciado de letras</label>
          <input
            type="range"
            className="reader-slider"
            min={-0.5}
            max={2}
            step={0.1}
            value={appearance.letterSpacing}
            onChange={(e) => setAppearance((a) => ({ ...a, letterSpacing: Number(e.target.value) }))}
            style={{ ['--fill' as string]: `${((appearance.letterSpacing + 0.5) / 2.5) * 100}%` }}
          />
        </div>
      </div>

      <div className="appearance-group">
        <h4 className="appearance-group-title">Página</h4>
        <div className="appearance-section">
          <label>Brillo · {Math.round(appearance.brightness * 100)}%</label>
          <input
            type="range"
            className="reader-slider"
            min={0.7}
            max={1.15}
            step={0.05}
            value={appearance.brightness}
            onChange={(e) => setAppearance((a) => ({ ...a, brightness: Number(e.target.value) }))}
            style={{ ['--fill' as string]: `${((appearance.brightness - 0.7) / 0.45) * 100}%` }}
          />
        </div>

        <div className="appearance-section row">
          <label>Layout</label>
          <div className="spacing-presets">
            <button
              type="button"
              className={`preset-btn ${appearance.layout === 'vertical' ? 'active' : ''}`}
              onClick={() => setAppearance((a) => ({ ...a, layout: 'vertical' }))}
              aria-label="Vertical continuo"
            >
              <IconLayoutV />
            </button>
            <button
              type="button"
              className={`preset-btn ${appearance.layout === 'horizontal' ? 'active' : ''}`}
              onClick={() => setAppearance((a) => ({ ...a, layout: 'horizontal' }))}
              aria-label="Horizontal paginado"
            >
              <IconLayoutH />
            </button>
          </div>
        </div>

        <div className="appearance-section row">
          <label>Animación de página</label>
          <label className="gco-switch">
            <input
              type="checkbox"
              checked={appearance.pageAnim}
              onChange={(e) => setAppearance((a) => ({ ...a, pageAnim: e.target.checked }))}
            />
            <span />
          </label>
        </div>
      </div>

      <div className="appearance-group">
        <h4 className="appearance-group-title">Narración</h4>
        <div className="appearance-section">
          <label>Voz</label>
          <select
            className="glass-input"
            value={reader.voiceURI || ''}
            onChange={(e) => {
              reader.setVoiceURI(e.target.value || '')
              soundClick()
            }}
          >
            <optgroup label="Español">
              {esVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </optgroup>
            <optgroup label="Otras">
              {otherVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </optgroup>
          </select>
          {!esVoices.length && (
            <p className="voice-hint warn">
              <IconWarning /> No se detectaron voces en español. El sistema usará la voz por defecto.
            </p>
          )}
        </div>

        <div className="appearance-section">
          <label>Velocidad · {reader.rate.toFixed(1)}×</label>
          <input
            type="range"
            className="reader-slider"
            min={0.5}
            max={2.5}
            step={0.1}
            value={reader.rate}
            onChange={(e) => reader.setRate(Number(e.target.value))}
            style={{ ['--fill' as string]: `${((reader.rate - 0.5) / 2) * 100}%` }}
          />
        </div>

        <div className="appearance-section">
          <label>Saltar</label>
          <div className="skip-row">
            {SKIP.map((s) => (
              <button
                key={s}
                type="button"
                className={`preset-btn ${skipSec === s ? 'active' : ''}`}
                onClick={() => {
                  setSkipSec(s)
                  soundClick()
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        <div className="appearance-section">
          <label>Temporizador de sueño</label>
          <div className="skip-row">
            {[0, 15, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                className={`preset-btn ${sleepMin === m ? 'active' : ''}`}
                onClick={() => {
                  setSleepMin(m)
                  soundClick()
                }}
              >
                {m === 0 ? 'Off' : `${m}m`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )

  /* ── CSS variables de tema de lectura (respetan tema global) ── */
  const readerVars: CSSProperties = {
    ['--reader-font' as string]: FONT_STACK[appearance.font],
    ['--reader-size' as string]: `${appearance.fontSize}px`,
    ['--reader-lh' as string]: String(appearance.lineHeight),
    ['--reader-ls' as string]: `${appearance.letterSpacing}px`,
    ['--reader-brightness' as string]: String(appearance.brightness),
  }

  if (loading) {
    return (
      <div className="reader-root" style={{ ...readerVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gco-bg, #0B1220)' }}>
        <p style={{ color: 'var(--gco-ink-muted)' }}>Cargando libro…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="reader-root" style={{ ...readerVars, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--gco-bg, #0B1220)' }}>
        <p style={{ color: 'var(--gco-ink)' }}>{loadError}</p>
        <button type="button" className="glass-button" onClick={() => navigate('/nutricion')}>
          Volver a biblioteca
        </button>
      </div>
    )
  }

  const bodyStyle: CSSProperties = {
    fontFamily: 'var(--reader-font)',
    fontSize: 'var(--reader-size)',
    lineHeight: 'var(--reader-lh)',
    letterSpacing: 'var(--reader-ls)',
    filter: `brightness(${appearance.brightness})`,
  }

  return (
    <div
      className={`reader-root ${isDesktop ? 'reader-desktop' : 'reader-mobile'} ${isDesktop && showAppearance ? 'with-appearance' : ''}`}
      data-reader-mode={appearance.mode}
      style={readerVars}
      onTouchStart={onSwipeStart}
      onTouchEnd={onSwipeEnd}
    >
      {/* Sidebar desktop (sticky) */}
      {isDesktop && (
        <aside className="reader-sidebar glass-panel">
          <div className="reader-cover-block">
            <div className="reader-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
              {!cover && title.charAt(0).toUpperCase()}
            </div>
            <h2 className="reader-sidebar-title">{title}</h2>
            {author && <p className="reader-sidebar-author">{author}</p>}
            <div className="reader-sidebar-progress">
              <span>{progressPct}% completado</span>
              <div className="mini-player-progress">
                <div className="mini-player-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              {currentChapter && (
                <span style={{ marginTop: 4 }}>
                  {currentChapter.title} · {chapterProgress}%
                </span>
              )}
            </div>
          </div>

          <div className="reader-toc-header">
            <span>ÍNDICE</span>
            <button
              type="button"
              className="reader-icon-btn sm"
              aria-label="Añadir capítulo"
              onClick={() => {
                soundClick()
                setEditingChapter({ id: '', title: '', start: reader.charIndex, source: 'manual' })
                setNewChapterTitle('')
              }}
            >
              <IconPlus />
            </button>
          </div>
          <div className="reader-toc">
            {chapters.map((ch, i) => (
              <div key={ch.id} className={`reader-toc-item ${i === currentChapterIdx ? 'active' : ''}`}>
                <button
                  type="button"
                  className="sheet-item-btn"
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
                  onClick={() => goToChar(ch.start)}
                >
                  <span className="toc-label">
                    <span>{ch.title}</span>
                    {i === currentChapterIdx && (
                      <span className="toc-item-progress">
                        <span style={{ width: `${chapterProgress}%` }} />
                      </span>
                    )}
                  </span>
                </button>
                <div className="toc-actions">
                  <button type="button" className="toc-edit" aria-label="Renombrar" onClick={() => openRenameChapter(ch)}>
                    <IconEdit />
                  </button>
                  {ch.source === 'manual' && (
                    <button type="button" className="toc-edit" aria-label="Eliminar" onClick={() => removeChapter(ch.id)}>
                      <IconTrash />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="reader-lib-btn" onClick={() => navigate('/nutricion')}>
            ← Biblioteca
          </button>
        </aside>
      )}

      {/* Main */}
      <div className={isDesktop ? 'reader-main' : undefined} style={isDesktop ? undefined : { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Topbar sticky */}
        <div className={isDesktop ? 'reader-topbar' : 'mobile-topbar'}>
          {!isDesktop && (
            <button type="button" className="reader-icon-btn" aria-label="Volver" onClick={() => navigate('/nutricion')}>
              <IconBack />
            </button>
          )}
          <span className="reader-chapter-label">{currentChapter?.title || title}</span>
          <div className={isDesktop ? 'reader-topbar-actions' : 'mobile-top-actions'}>
            <button
              type="button"
              className={`reader-icon-btn ${highlightMode ? 'active' : ''}`}
              aria-label={highlightMode ? 'Salir del modo marcatextos' : 'Marcatextos: selecciona texto para resaltarlo'}
              aria-pressed={highlightMode}
              onClick={toggleHighlightMode}
            >
              <IconMarker />
            </button>
            <button type="button" className="reader-icon-btn" aria-label="Índice" onClick={() => { soundClick(); setShowToc(true) }}>
              <IconList />
            </button>
            <button type="button" className="reader-icon-btn" aria-label="Marcadores" onClick={() => { soundClick(); setShowBookmarks(true) }}>
              <IconBookmark filled={isBookmarkedHere} />
            </button>
            <button type="button" className="reader-icon-btn" aria-label="Comentarios" onClick={() => { soundClick(); setShowComments(true) }}>
              <IconComment />
            </button>
            <button type="button" className="reader-icon-btn" aria-label="Imágenes del libro" onClick={() => { soundClick(); setShowImageGallery(true) }}>
              <IconImageGallery />
            </button>
            <button type="button" className="reader-icon-btn" aria-label="Apariencia" onClick={() => { soundClick(); setShowAppearance(true) }}>
              <IconSun />
            </button>
          </div>
        </div>

        {highlightMode && (
          <div className="highlight-mode-banner" role="status">
            <IconMarker />
            <span>Selecciona un fragmento de texto para marcarlo y elige un color.</span>
            <button type="button" className="hl-popup-close" aria-label="Salir del modo marcatextos" onClick={toggleHighlightMode}>
              <IconClose />
            </button>
          </div>
        )}


        {!isDesktop && (
          <>
            <div className="mobile-progress-meta">
              <span>{progressPct}%</span>
              <span>{currentChapter?.title || ''}</span>
            </div>
            <div className="reader-progress-line">
              <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        )}

        {isDesktop && (
          <div className="reader-progress-line">
            <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Contenido */}
        {appearance.layout === 'horizontal' ? (
          <div className={`h-page-area ${isDesktop ? '' : 'mobile'}`} ref={pageAreaRef}>
            <div className={`h-page-stage ${appearance.pageAnim ? (pageAnimDir === 1 ? 'slide-next' : pageAnimDir === -1 ? 'slide-prev' : '') : 'no-anim'}`}>
              <div className="h-page-inner word-sheet" style={bodyStyle}>
                {(pages[safePageIndex]?.paraIndices || []).map((pi, i) =>
                  renderParagraph(paragraphs[pi], pi, i === 0)
                )}
              </div>
            </div>
            <div className="h-page-indicator">
              Página {safePageIndex + 1} / {totalPages}
            </div>
            <div className="swipe-hint" aria-hidden="true">
              <IconSwipeHint />
              <span>Desliza la hoja</span>
            </div>
          </div>
        ) : (
          <article className="reader-article" ref={textRef} style={bodyStyle}>
            {currentChapter && (
              <>
                <div className="reader-chapter-kicker">CAPÍTULO</div>
                <h1 className="reader-chapter-title">{currentChapter.title}</h1>
              </>
            )}
            <div className="reader-body">
              {paragraphs.map((p, i) => renderParagraph(p, i, i === 0))}
            </div>
          </article>
        )}

        {/* Scrubber */}
        <div className={`reader-bottom-progress ${isDesktop ? '' : 'mobile'}`}>
          <span className="scrub-pct">{progressPct}%</span>
          <input
            type="range"
            className="scrub-slider"
            min={0}
            max={Math.max(1, text.length)}
            value={reader.charIndex}
            onChange={(e) => goToChar(Number(e.target.value))}
            style={{ ['--scrub-fill' as string]: `${progressPct}%` }}
            aria-label="Posición de lectura"
          />
          <span className="scrub-chapter">{currentChapter?.title?.slice(0, 18) || ''}</span>
        </div>
      </div>

      {/* Apariencia desktop */}
      {isDesktop && showAppearance && (
        <aside className="reader-appearance glass-panel">
          <div className="appearance-header">
            <h3>Apariencia</h3>
            <button type="button" className="reader-icon-btn" aria-label="Cerrar" onClick={() => setShowAppearance(false)}>
              <IconClose />
            </button>
          </div>
          <div className="appearance-scroll-desk">{appearanceControls}</div>
        </aside>
      )}

      {/* Transporte flotante */}
      <div className={`reader-transport-float ${isDesktop ? 'is-desktop' : 'is-mobile'} ${transportVisible ? '' : 'is-idle'}`}>
        <button
          type="button"
          className="transport-btn"
          aria-label="Capítulo anterior"
          onClick={() => {
            soundClick()
            const prev = chapters[currentChapterIdx - 1]
            if (prev) goToChar(prev.start)
            else goToChar(Math.max(0, reader.charIndex - 800))
          }}
        >
          <IconPrev />
        </button>
        <button
          type="button"
          className="transport-btn"
          aria-label={`Retroceder ${skipSec}s`}
          onClick={() => {
            soundClick()
            goToChar(Math.max(0, reader.charIndex - skipSec * 40))
          }}
        >
          -{skipSec}
        </button>
        <button
          type="button"
          className="transport-btn transport-play"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={toggleReaderPlayback}
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button
          type="button"
          className="transport-btn"
          aria-label={`Avanzar ${skipSec}s`}
          onClick={() => {
            soundClick()
            goToChar(Math.min(text.length, reader.charIndex + skipSec * 40))
          }}
        >
          +{skipSec}
        </button>
        <button
          type="button"
          className="transport-btn"
          aria-label="Capítulo siguiente"
          onClick={() => {
            soundClick()
            if (nextChapter) goToChar(nextChapter.start)
            else goToChar(Math.min(text.length, reader.charIndex + 800))
          }}
        >
          <IconNext />
        </button>
        <button
          type="button"
          className="transport-btn"
          aria-label={isBookmarkedHere ? 'Quitar marcador' : 'Añadir marcador'}
          onClick={toggleBookmark}
        >
          <IconBookmark filled={isBookmarkedHere} />
        </button>
      </div>

      {/* Sheets */}
      {showToc && (
        <div className="sheet-overlay" onClick={() => setShowToc(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Índice ({chapters.length})</h3>
            <div className="sheet-list">
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  className={`sheet-item ${i === currentChapterIdx ? 'active' : ''}`}
                  onClick={() => {
                    goToChar(ch.start)
                    setShowToc(false)
                  }}
                >
                  {ch.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="glass-button secondary"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => {
                setEditingChapter({ id: '', title: '', start: reader.charIndex, source: 'manual' })
                setNewChapterTitle('')
                setShowToc(false)
              }}
            >
              + Añadir capítulo aquí
            </button>
          </div>
        </div>
      )}

      {showBookmarks && (
        <div className="sheet-overlay" onClick={() => setShowBookmarks(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Marcadores ({bookmarks.length})</h3>
            {bookmarks.length === 0 && <p className="empty-hint">Toca el icono de marcador para añadir uno.</p>}
            <div className="sheet-list">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="sheet-item row">
                  <button
                    type="button"
                    className="sheet-item-btn"
                    onClick={() => {
                      goToChar(bm.charIndex)
                      setShowBookmarks(false)
                    }}
                  >
                    <strong>{bm.label}</strong>
                    {bm.note ? <span className="muted"> — {bm.note}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="reader-icon-btn sm"
                    onClick={() => setBookmarks((p) => p.filter((x) => x.id !== bm.id))}
                    aria-label="Eliminar"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showComments && (
        <div className="sheet-overlay" onClick={() => setShowComments(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Comentarios ({comments.length})</h3>
            {comments.length === 0 && <p className="empty-hint">Toca el icono de comentario junto a un párrafo.</p>}
            <div className="sheet-list">
              {comments.map((c) => (
                <div key={c.id} className="sheet-item row">
                  <button
                    type="button"
                    className="sheet-item-btn"
                    onClick={() => {
                      goToChar(c.charStart)
                      setShowComments(false)
                    }}
                  >
                    <span className="muted">Párrafo {c.paraIndex + 1}</span>
                    <div>{c.text}</div>
                  </button>
                  <button
                    type="button"
                    className="reader-icon-btn sm"
                    onClick={() => setComments((p) => p.filter((x) => x.id !== c.id))}
                    aria-label="Eliminar"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showImageGallery && (
        <div className="sheet-overlay" onClick={() => setShowImageGallery(false)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Imágenes del libro ({imageParas.length})</h3>
            {imageParas.length === 0 && <p className="empty-hint">Este libro no tiene imágenes.</p>}
            <div className="image-gallery-grid">
              {imageParas.map(({ p, i }) => (
                <button
                  key={i}
                  type="button"
                  className="image-gallery-item"
                  aria-label={`Ir a imagen en párrafo ${i + 1}`}
                  onClick={() => {
                    goToChar(p.start)
                    setShowImageGallery(false)
                  }}
                >
                  <img src={p.imageSrc} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {editingChapter && (
        <div className="sheet-overlay" onClick={() => setEditingChapter(null)}>
          <div className="sheet glass-panel" onClick={(e) => e.stopPropagation()}>
            <h3>{editingChapter.id ? 'Renombrar capítulo' : 'Nuevo capítulo'}</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 8 }}>
              {editingChapter.id ? 'Cambia el título del índice.' : `Marcador en el carácter ${reader.charIndex}.`}
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

      {!isDesktop && showAppearance && (
        <div className="sheet-overlay appearance-full" onClick={() => setShowAppearance(false)}>
          <div className="sheet glass-panel appearance-sheet-full" onClick={(e) => e.stopPropagation()}>
            <div className="appearance-header sticky-header">
              <h3>Apariencia</h3>
              <button type="button" className="reader-icon-btn" onClick={() => setShowAppearance(false)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="appearance-scroll">{appearanceControls}</div>
            <button type="button" className="glass-button" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowAppearance(false)}>
              Listo
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button type="button" className="lightbox-close" aria-label="Cerrar" onClick={() => setLightbox(null)}>
            <IconClose />
          </button>
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {selectionPopup && (
        <div
          className="highlight-popup"
          style={{ left: selectionPopup.x, top: Math.max(64, selectionPopup.y) }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Elegir color de marcatextos"
        >
          {HIGHLIGHT_COLORS.map((hc) => (
            <button
              key={hc.id}
              type="button"
              className="hl-swatch"
              style={{ background: hc.color }}
              aria-label={hc.label}
              onClick={() => applySelectionColor(hc.color)}
            />
          ))}
          {selectionPopup.editingId && (
            <button type="button" className="hl-swatch hl-clear" aria-label="Quitar marca" onClick={removeSelectionHighlight}>
              ×
            </button>
          )}
          <button
            type="button"
            className="hl-popup-close"
            aria-label="Cerrar"
            onClick={() => {
              setSelectionPopup(null)
              try {
                window.getSelection()?.removeAllRanges()
              } catch {
                /* */
              }
            }}
          >
            ×
          </button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Merriweather:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap');

        .reader-root {
          --reader-radius: 16px;
          --reader-bg: var(--gco-bg, #0B1220);
          --reader-ink: var(--gco-ink, #E8EEF7);
          --reader-muted: var(--gco-ink-muted, #8B9BB4);
          --reader-hl: var(--gco-accent, #22E6C5);
          --reader-border: var(--gco-border, rgba(255,255,255,0.12));
          --reader-glass: var(--gco-glass, rgba(255,255,255,0.08));
          --reader-spoken: color-mix(in srgb, var(--reader-hl) 22%, transparent);
          position: relative;
          overflow-x: hidden;
          width: 100%;
          box-sizing: border-box;
          background: var(--reader-bg);
          color: var(--reader-ink);
          min-height: 100vh;
          min-height: 100dvh;
        }
        [data-reader-mode="day"] {
          --reader-bg: #F7F3E9;
          --reader-ink: #1A1F2E;
          --reader-muted: #5A6577;
          --reader-hl: #0D9488;
          --reader-border: rgba(0,0,0,0.1);
          --reader-glass: rgba(255,255,255,0.7);
          --reader-spoken: color-mix(in srgb, var(--reader-hl) 18%, transparent);
        }
        [data-reader-mode="sepia"] {
          --reader-bg: #EFE1C3;
          --reader-ink: #3B2A18;
          --reader-muted: #8A7150;
          --reader-hl: #A8631B;
          --reader-border: rgba(59,42,24,0.18);
          --reader-glass: rgba(250,240,220,0.8);
          --reader-spoken: color-mix(in srgb, var(--reader-hl) 22%, transparent);
        }
        .reader-root *, .reader-root *::before, .reader-root *::after { box-sizing: border-box; }

        .reader-desktop {
          display: grid;
          grid-template-columns: 260px 1fr;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          align-items: start;
        }
        .reader-desktop.with-appearance {
          grid-template-columns: 260px 1fr 300px;
        }

        .glass-panel {
          background: var(--reader-glass);
          border: 1px solid var(--reader-border);
          -webkit-backdrop-filter: blur(20px) saturate(1.3);
          backdrop-filter: blur(20px) saturate(1.3);
        }

        .reader-sidebar {
          padding: 1.1rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-right: 1px solid var(--reader-border);
          position: sticky;
          top: 0;
          align-self: start;
          z-index: 8;
          height: 100vh;
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .reader-cover-block { text-align: center; }
        .reader-cover {
          width: 110px; height: 158px;
          margin: 0 auto 0.75rem;
          border-radius: 10px;
          background: linear-gradient(145deg, rgba(34,230,197,0.18), #8B7CF6);
          background-size: cover;
          background-position: center;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; font-weight: 700;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        }
        .reader-sidebar-title { font-size: 0.95rem; font-weight: 600; line-height: 1.3; margin: 0; }
        .reader-sidebar-author { font-size: 0.78rem; color: var(--reader-muted); margin: 0; }
        .reader-sidebar-progress {
          margin-top: 8px; display: flex; flex-direction: column; gap: 4px;
          font-size: 0.7rem; color: var(--reader-muted);
        }
        .mini-player-progress {
          height: 3px; border-radius: 3px; background: var(--reader-border); overflow: hidden;
        }
        .mini-player-progress-fill {
          height: 100%; background: var(--reader-hl); border-radius: 3px;
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
        }
        .reader-toc-item:hover { background: rgba(255,255,255,0.06); color: var(--reader-ink); }
        .reader-toc-item.active {
          background: color-mix(in srgb, var(--reader-hl) 18%, transparent);
          color: var(--reader-hl); font-weight: 600;
        }
        @supports not (background: color-mix(in srgb, red 50%, blue)) {
          .reader-toc-item.active { background: rgba(34,230,197,0.18); }
        }
        .toc-edit { opacity: 0.5; display: flex; cursor: pointer; background: none; border: none; color: inherit; }
        .toc-edit:hover { opacity: 1; }
        .toc-actions { display: flex; gap: 6px; flex-shrink: 0; margin-left: 6px; }
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

        .reader-main {
          display: flex; flex-direction: column;
          max-width: 720px; margin: 0 auto; width: 100%;
          padding: 0 1.5rem 7.5rem;
          position: relative;
          overflow-x: hidden;
          min-height: 100vh;
          min-height: 100dvh;
        }
        .reader-topbar, .mobile-topbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.75rem 0 0.5rem; position: sticky; top: 0; z-index: 20;
          background: var(--reader-bg);
          box-shadow: 0 1px 0 var(--reader-border);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .reader-chapter-label {
          font-size: 0.72rem; letter-spacing: 0.08em; font-weight: 600;
          color: var(--reader-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 34vw;
        }
        .reader-topbar-actions, .mobile-top-actions { display: flex; gap: 2px; flex-wrap: nowrap; }

        .reader-progress-line {
          height: 3px; background: var(--reader-border); border-radius: 3px;
          margin-bottom: 1.25rem; overflow: hidden;
        }
        .reader-progress-fill {
          height: 100%; background: var(--reader-hl); border-radius: 3px;
          transition: width 0.25s ease;
        }

        .reader-article { flex: 1; padding-bottom: 1.5rem; }
        .reader-chapter-kicker {
          text-align: center; font-size: 0.75rem; letter-spacing: 0.12em;
          font-weight: 600; color: var(--reader-hl); margin-bottom: 0.5rem;
        }
        .reader-chapter-title {
          text-align: center; font-size: clamp(1.5rem, 4vw, 2.1rem);
          font-weight: 700; line-height: 1.2; margin-bottom: 1.1rem;
          font-family: "Lora", Georgia, serif;
        }

        .reader-body { cursor: text; }
        .reader-body.highlight-mode { cursor: text; }
        .reader-para { margin-bottom: 1em; }
        .para-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .para-row > p {
          flex: 1;
          min-width: 0;
          margin: 0;
        }
        .drop-cap::first-letter {
          float: left; font-size: 3.2em; line-height: 0.75;
          padding: 0.06em 0.1em 0 0; font-weight: 700;
          color: var(--reader-hl); font-family: "Lora", Georgia, serif;
        }

        .para-comment-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          min-width: 40px;
          min-height: 40px;
          padding: 6px 8px;
          margin-top: 2px;
          border: none;
          border-radius: 10px;
          background: rgba(34,230,197,0.1);
          color: var(--reader-muted);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .para-comment-btn:hover,
        .para-comment-btn:focus-visible {
          background: rgba(34,230,197,0.22);
          color: var(--reader-hl);
          outline: none;
        }
        .para-comment-count { font-size: 0.7rem; font-weight: 700; }
        .para-comments-preview {
          margin-top: 6px; display: flex; flex-direction: column; gap: 4px;
        }
        .para-comment-bubble {
          font-size: 0.8rem; padding: 6px 10px; border-radius: 8px;
          background: rgba(34,230,197,0.12);
          display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;
        }
        .comment-del {
          background: none; border: none; color: var(--reader-muted);
          cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 0 4px;
        }

        /* Subrayados de texto (selección libre, no todo el párrafo) */
        .reader-highlight-mark {
          border-radius: 3px;
          padding: 0.02em 0.08em;
          margin: 0 -0.08em;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          cursor: pointer;
          color: #1a1a1a;
        }
        [data-reader-mode="night"] .reader-highlight-mark { color: #14181f; }

        .highlight-mode-banner {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.76rem; color: var(--reader-hl);
          background: color-mix(in srgb, var(--reader-hl) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--reader-hl) 30%, transparent);
          border-radius: 10px;
          padding: 0.45rem 0.7rem;
          margin-bottom: 0.75rem;
        }
        @supports not (background: color-mix(in srgb, red 50%, blue)) {
          .highlight-mode-banner { background: rgba(34,230,197,0.12); border-color: rgba(34,230,197,0.3); }
        }

        .highlight-popup {
          position: fixed;
          transform: translate(-50%, -100%) translateY(-10px);
          z-index: 140;
          display: flex; align-items: center; gap: 6px;
          padding: 8px; border-radius: 14px;
          background: var(--reader-glass); border: 1px solid var(--reader-border);
          -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          max-width: min(92vw, 340px);
        }
        .hl-swatch {
          width: 24px; height: 24px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.55); cursor: pointer; padding: 0;
          flex-shrink: 0;
        }
        .hl-swatch:hover, .hl-swatch:focus-visible { transform: scale(1.12); outline: none; }
        .hl-clear {
          background: transparent !important; border: 1px solid var(--reader-border) !important;
          color: var(--reader-muted); font-size: 0.85rem;
          display: flex; align-items: center; justify-content: center;
        }
        .hl-popup-close {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          border: none; background: rgba(255,255,255,0.08); color: var(--reader-muted);
          cursor: pointer; font-size: 0.85rem; line-height: 1;
          display: flex; align-items: center; justify-content: center;
        }

        .reader-image-btn {
          position: relative;
          display: block;
          width: 100%;
          max-width: 100%;
          border: none;
          background: none;
          padding: 0;
          cursor: zoom-in;
        }
        .reader-inline-image {
          max-width: 100%;
          max-height: min(65vh, 480px);
          width: auto; height: auto;
          object-fit: contain;
          border-radius: 12px;
          margin: 0.4rem auto;
          display: block;
        }
        .image-expand-hint {
          position: absolute; top: 12px; right: 12px;
          width: 30px; height: 30px; border-radius: 50%;
          background: rgba(0,0,0,0.45); color: #fff;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: opacity 0.2s ease;
        }
        .reader-image-btn:hover .image-expand-hint,
        .reader-image-btn:focus-visible .image-expand-hint {
          opacity: 1;
        }
        .reader-para-image { text-align: center; }

        .lightbox-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(0,0,0,0.92);
          display: flex; align-items: center; justify-content: center;
          cursor: zoom-out;
          padding: 2rem;
        }
        .lightbox-img {
          max-width: 95vw; max-height: 92vh;
          width: auto; height: auto;
          object-fit: contain;
          border-radius: 10px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          cursor: default;
        }
        .lightbox-close {
          position: fixed;
          top: max(1rem, env(safe-area-inset-top, 0px));
          right: max(1rem, env(safe-area-inset-right, 0px));
          width: 44px; height: 44px; border-radius: 50%;
          border: none; background: rgba(255,255,255,0.12); color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 301;
        }

        .image-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
          gap: 10px;
        }
        .image-gallery-item {
          border: none; background: rgba(255,255,255,0.05);
          border-radius: 10px; overflow: hidden; cursor: pointer;
          padding: 0; aspect-ratio: 1;
        }
        .image-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .reader-transport-float {
          position: fixed;
          left: 50%;
          -webkit-transform: translateX(-50%);
          transform: translateX(-50%);
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          padding: 0.5rem 0.95rem;
          border-radius: 999px;
          background: var(--reader-glass);
          border: 1px solid var(--reader-border);
          -webkit-backdrop-filter: blur(18px) saturate(1.35);
          backdrop-filter: blur(18px) saturate(1.35);
          box-shadow: 0 8px 32px rgba(0,0,0,0.28);
          max-width: calc(100vw - 1.25rem);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .reader-transport-float.is-idle {
          opacity: 0;
          pointer-events: none;
          -webkit-transform: translateX(-50%) translateY(14px);
          transform: translateX(-50%) translateY(14px);
        }
        .reader-transport-float.is-desktop {
          bottom: max(1.35rem, env(safe-area-inset-bottom, 0px));
        }
        .reader-transport-float.is-mobile {
          bottom: calc(4.4rem + env(safe-area-inset-bottom, 0px));
        }
        .transport-btn {
          display: flex; align-items: center; gap: 5px;
          background: transparent; border: none; color: var(--reader-ink);
          font-size: 0.85rem; cursor: pointer; padding: 0.35rem 0.5rem;
          min-height: 42px; min-width: 42px; justify-content: center;
        }
        .transport-play {
          width: 52px; height: 52px; border-radius: 50%;
          background: var(--reader-hl); color: #0B1220; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(34,230,197,0.4);
          flex-shrink: 0;
          min-width: 52px;
        }

        .reader-bottom-progress {
          display: flex; align-items: center; gap: 10px;
          font-size: 0.72rem; color: var(--reader-muted);
          padding: 0.4rem 0 0.75rem;
        }
        .scrub-pct, .scrub-chapter { white-space: nowrap; flex-shrink: 0; }
        .scrub-slider {
          -webkit-appearance: none; appearance: none;
          flex: 1; height: 4px; border-radius: 4px; cursor: pointer;
          background: linear-gradient(
            to right,
            var(--reader-hl) 0%, var(--reader-hl) var(--scrub-fill, 0%),
            var(--reader-border) var(--scrub-fill, 0%), var(--reader-border) 100%
          );
          outline: none;
        }
        .scrub-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--reader-hl); border: 2px solid var(--reader-bg);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        }
        .scrub-slider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--reader-hl); border: 2px solid var(--reader-bg);
        }

        .reader-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 5px; border-radius: 5px; cursor: pointer;
          background: linear-gradient(
            to right,
            var(--reader-hl) 0%, var(--reader-hl) var(--fill, 50%),
            var(--reader-border) var(--fill, 50%), var(--reader-border) 100%
          );
          outline: none;
        }
        .reader-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--reader-hl);
          border: 3px solid var(--reader-bg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        }
        .reader-slider::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--reader-hl); border: 3px solid var(--reader-bg);
        }

        .reader-appearance {
          padding: 1.15rem 1rem;
          border-left: 1px solid var(--reader-border);
          position: sticky; top: 0; height: 100vh; height: 100dvh; overflow-y: auto;
          display: flex; flex-direction: column; gap: 0.85rem;
        }
        .appearance-scroll-desk {
          display: flex; flex-direction: column; gap: 1.1rem;
          overflow-y: auto; flex: 1;
        }
        .appearance-header { display: flex; justify-content: space-between; align-items: center; }
        .appearance-header h3 { font-size: 1rem; margin: 0; font-weight: 700; letter-spacing: 0.01em; }
        .appearance-group {
          display: flex; flex-direction: column; gap: 0.85rem;
          padding-bottom: 0.95rem;
          border-bottom: 1px solid var(--reader-border);
        }
        .appearance-group:last-child { border-bottom: none; padding-bottom: 0; }
        .appearance-group-title {
          font-size: 0.66rem; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: var(--reader-hl);
          margin: 0 0 0.1rem;
        }
        .appearance-section { display: flex; flex-direction: column; gap: 6px; }
        .appearance-section.row { flex-direction: row; align-items: center; justify-content: space-between; }
        .appearance-section label { font-size: 0.8rem; color: var(--reader-muted); }
        .spacing-presets, .mode-presets, .skip-row {
          display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
        }
        .preset-btn {
          min-width: 40px; height: 36px; padding: 0 10px;
          border-radius: 10px; border: 1px solid var(--reader-border);
          background: transparent; color: var(--reader-ink); cursor: pointer;
          font-size: 0.85rem;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .preset-btn.active, .mode-btn.active {
          background: rgba(34,230,197,0.22);
          border-color: var(--reader-hl); color: var(--reader-hl);
        }
        .mode-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 0.5rem 0.3rem; border-radius: 10px;
          border: 1px solid var(--reader-border); background: transparent;
          color: var(--reader-ink); font-size: 0.72rem; cursor: pointer;
          min-height: 48px;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .voice-hint { font-size: 0.68rem; color: var(--reader-muted); margin-top: 4px; }
        .voice-hint.warn {
          color: #FF6B4A;
          display: flex; align-items: flex-start; gap: 6px;
          background: rgba(255,107,74,0.12);
          padding: 8px; border-radius: 8px;
        }

        .reader-icon-btn {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          background: transparent; color: var(--reader-ink);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .reader-icon-btn:hover { background: rgba(255,255,255,0.08); }
        .reader-icon-btn.sm { width: 32px; height: 32px; }
        .reader-icon-btn:focus-visible {
          outline: 2px solid var(--reader-hl);
          outline-offset: 2px;
        }
        .reader-icon-btn.active {
          background: rgba(255,193,7,0.2);
          color: #F59E0B;
        }
        .reader-icon-btn.active:hover { background: rgba(255,193,7,0.3); }

        .h-page-area {
          position: relative;
          flex: 1;
          min-height: 48vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          perspective: 1800px;
          -webkit-perspective: 1800px;
        }
        .h-page-area.mobile {
          min-height: calc(100vh - 13rem);
          min-height: calc(100dvh - 13rem - env(safe-area-inset-bottom, 0px));
        }
        .h-page-stage {
          flex: 1;
          overflow: hidden;
          padding: 0.4rem 0.15rem 0.4rem;
          transform-style: preserve-3d;
          -webkit-transform-style: preserve-3d;
        }
        .h-page-stage.slide-next {
          animation: pageFlipNext 0.62s cubic-bezier(0.45, 0, 0.2, 1);
          transform-origin: left center;
        }
        .h-page-stage.slide-prev {
          animation: pageFlipPrev 0.62s cubic-bezier(0.45, 0, 0.2, 1);
          transform-origin: right center;
        }
        .h-page-stage.no-anim { animation: none !important; }
        @keyframes pageFlipNext {
          0% { transform: rotateY(0deg) translateZ(0); filter: brightness(1); }
          22% { transform: rotateY(-16deg) translateZ(-10px); filter: brightness(0.96); }
          48% { transform: rotateY(-82deg) translateZ(-46px); filter: brightness(0.78); }
          52% { transform: rotateY(-88deg) translateZ(-50px); filter: brightness(1.06); }
          78% { transform: rotateY(-28deg) translateZ(-14px); filter: brightness(0.94); }
          100% { transform: rotateY(0deg) translateZ(0); filter: brightness(1); }
        }
        @keyframes pageFlipPrev {
          0% { transform: rotateY(0deg) translateZ(0); filter: brightness(1); }
          22% { transform: rotateY(16deg) translateZ(-10px); filter: brightness(0.96); }
          48% { transform: rotateY(82deg) translateZ(-46px); filter: brightness(0.78); }
          52% { transform: rotateY(88deg) translateZ(-50px); filter: brightness(1.06); }
          78% { transform: rotateY(28deg) translateZ(-14px); filter: brightness(0.94); }
          100% { transform: rotateY(0deg) translateZ(0); filter: brightness(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .h-page-stage.slide-next, .h-page-stage.slide-prev { animation: none; }
        }
        .h-page-inner.word-sheet {
          margin: 0 auto;
          width: min(100%, 21cm);
          max-width: 816px;
          min-height: min(62vh, 26cm);
          padding: 1.6rem 1.85rem 2rem;
          background: color-mix(in srgb, var(--reader-bg) 92%, #fff 8%);
          box-shadow: 0 10px 40px rgba(0,0,0,0.22), 0 0 0 1px var(--reader-border);
          border-radius: 2px 10px 10px 2px;
          overflow: hidden;
        }
        [data-reader-mode="day"] .h-page-inner.word-sheet {
          background: #fffef9;
        }
        [data-reader-mode="sepia"] .h-page-inner.word-sheet {
          background: radial-gradient(ellipse at top left, #FBF3DE, #F3E5C1 55%, #ECDBB0 100%);
          box-shadow: 0 10px 40px rgba(59,42,24,0.28), inset 0 0 70px rgba(168,99,27,0.08), 0 0 0 1px rgba(59,42,24,0.16);
          border-radius: 4px 14px 14px 4px;
        }
        [data-reader-mode="sepia"] .reader-chapter-title,
        [data-reader-mode="sepia"] .drop-cap::first-letter {
          font-family: "Merriweather", Georgia, serif;
        }
        .reader-para em { font-style: italic; }
        .reader-para strong { font-weight: 700; }
        .reader-para u { text-decoration: underline; text-underline-offset: 2px; }
        .reader-para s { text-decoration: line-through; opacity: 0.9; }
        .h-page-inner {
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .h-page-indicator {
          text-align: center;
          font-size: 0.72rem;
          color: var(--reader-muted);
          letter-spacing: 0.06em;
          padding: 0.3rem 0 0.1rem;
          flex-shrink: 0;
        }
        .swipe-hint {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 0.7rem; color: var(--reader-muted); letter-spacing: 0.04em;
          padding-bottom: 0.4rem; opacity: 0.85; flex-shrink: 0;
        }
        .swipe-hint-icon { animation: swipeHintMove 1.6s ease-in-out infinite; }
        @keyframes swipeHintMove {
          0%, 100% { transform: translateX(0); opacity: 0.5; }
          50% { transform: translateX(6px); opacity: 1; }
        }

        .reader-mobile {
          display: flex; flex-direction: column;
          min-height: 100vh;
          min-height: 100dvh;
          min-height: 100svh;
          padding:
            max(0.4rem, env(safe-area-inset-top, 0px))
            max(0.9rem, env(safe-area-inset-right, 0px))
            calc(7.8rem + env(safe-area-inset-bottom, 0px))
            max(0.9rem, env(safe-area-inset-left, 0px));
          overflow-x: hidden;
        }
        .mobile-progress-meta {
          display: flex; justify-content: space-between;
          font-size: 0.72rem; color: var(--reader-muted);
          margin-bottom: 0;
          position: sticky;
          top: 52px;
          z-index: 19;
          background: var(--reader-bg);
          padding: 4px 0 2px;
        }
        .reader-mobile > .reader-progress-line {
          position: sticky;
          top: 74px;
          z-index: 18;
          background: var(--reader-bg);
          margin-bottom: 0.75rem;
        }
        .reader-bottom-progress.mobile {
          position: fixed;
          left: max(0.9rem, env(safe-area-inset-left, 0px));
          right: max(0.9rem, env(safe-area-inset-right, 0px));
          bottom: calc(0.45rem + env(safe-area-inset-bottom, 0px));
          z-index: 35;
          padding: 0;
        }

        .sheet-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.5);
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
          display: flex; align-items: flex-end; justify-content: center;
        }
        .sheet {
          width: 100%; max-width: 480px; max-height: 85vh; max-height: 85dvh;
          border-radius: 22px 22px 0 0;
          padding: 0.75rem 1.2rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .sheet-handle {
          width: 36px; height: 4px; border-radius: 4px;
          background: var(--reader-border); margin: 0 auto 1rem;
        }
        .sheet h3 { font-size: 1.05rem; margin-bottom: 0.75rem; }
        .sheet-list { display: flex; flex-direction: column; gap: 4px; }
        .sheet-item {
          padding: 0.55rem 0.65rem; border-radius: 10px;
          color: var(--reader-ink); font-size: 0.9rem;
          background: none; border: none; text-align: left; cursor: pointer; width: 100%;
        }
        .sheet-item.active, .sheet-item:hover {
          background: rgba(34,230,197,0.14);
        }
        .sheet-item.row { display: flex; align-items: center; gap: 6px; }
        .sheet-item-btn {
          flex: 1; text-align: left; background: none; border: none;
          color: inherit; font: inherit; cursor: pointer; padding: 0.35rem 0;
        }
        .empty-hint { font-size: 0.85rem; color: var(--reader-muted); padding: 1rem 0; }
        .muted { color: var(--reader-muted); }

        .appearance-full { align-items: stretch; }
        .appearance-sheet-full {
          max-width: 100%;
          max-height: 100vh; max-height: 100dvh;
          height: 100%;
          border-radius: 0;
          padding:
            max(0.85rem, env(safe-area-inset-top, 0px))
            1.15rem
            calc(1.25rem + env(safe-area-inset-bottom, 0px));
          display: flex;
          flex-direction: column;
        }
        .sticky-header {
          position: sticky; top: 0; z-index: 2;
          background: var(--reader-glass);
          padding-bottom: 0.5rem; margin-bottom: 0.35rem;
        }
        .appearance-scroll {
          flex: 1; overflow-y: auto;
          display: flex; flex-direction: column; gap: 1.1rem;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 0.5rem;
        }

        .glass-input {
          width: 100%;
          padding: 0.55rem 0.75rem;
          border-radius: 10px;
          border: 1px solid var(--reader-border);
          background: rgba(0,0,0,0.15);
          color: var(--reader-ink);
          font: inherit;
        }
        .glass-button {
          padding: 0.6rem 1rem;
          border-radius: 12px;
          border: none;
          background: var(--reader-hl);
          color: #0B1220;
          font-weight: 600;
          cursor: pointer;
        }
        .glass-button.secondary {
          background: transparent;
          border: 1px solid var(--reader-border);
          color: var(--reader-ink);
        }
        .gco-switch {
          position: relative;
          display: inline-block;
          width: 44px; height: 26px;
        }
        .gco-switch input { opacity: 0; width: 0; height: 0; }
        .gco-switch span {
          position: absolute; cursor: pointer; inset: 0;
          background: var(--reader-border); border-radius: 26px;
          transition: 0.2s;
        }
        .gco-switch span::before {
          content: '';
          position: absolute;
          height: 20px; width: 20px;
          left: 3px; bottom: 3px;
          background: #fff;
          border-radius: 50%;
          transition: 0.2s;
        }
        .gco-switch input:checked + span { background: var(--reader-hl); }
        .gco-switch input:checked + span::before { transform: translateX(18px); }

        @media (min-width: 900px) {
          .sheet-overlay { align-items: center; padding: 1.5rem; }
          .sheet { border-radius: 18px; }
        }
      `}</style>
    </div>
  )
}