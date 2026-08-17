/**
 * textExtract.ts
 * ───────────────────────────────────────────────────────────────────────
 * Extrae texto legible desde múltiples formatos de archivo para importarlo
 * al editor/lector de la app. Pensado para ser rápido incluso en equipos
 * modestos: usa las APIs nativas del navegador cuando es posible (texto
 * plano, HTML) y solo recurre a librerías pesadas (pdfjs-dist, mammoth,
 * jszip) mediante `import()` dinámico, así el bundle inicial no crece y
 * esas dependencias solo se cargan cuando el usuario realmente importa un
 * PDF/DOCX/EPUB.
 *
 * Formatos soportados: .txt, .md/.markdown, .html/.htm, .rtf, .pdf, .docx, .epub
 *
 * Dependencias opcionales (instalar solo si vas a importar esos formatos):
 *   npm i pdfjs-dist mammoth jszip
 *
 * La salida siempre es un string en el "markdown ligero" que ya entiende
 * el lector (negrita **, cursiva *, subrayado <u>, tachado ~~, imágenes
 * embebidas como ![alt](dataURL) y separación de párrafos por línea en
 * blanco), de modo que formatee igual sin importar el origen del archivo.
 */

export type SupportedImportExt =
  | 'txt'
  | 'md'
  | 'markdown'
  | 'html'
  | 'htm'
  | 'rtf'
  | 'pdf'
  | 'docx'
  | 'epub'

const MAX_INLINE_IMAGE_BYTES = 900_000 // evita inflar el documento con imágenes gigantes embebidas

export function getFileExt(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim())
  return (m?.[1] || '').toLowerCase()
}

export function isSupportedImportFile(filename: string): boolean {
  const ext = getFileExt(filename)
  return ['txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'pdf', 'docx', 'epub'].includes(ext)
}

/** Punto de entrada único: detecta el formato por extensión y delega */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = getFileExt(file.name) as SupportedImportExt

  switch (ext) {
    case 'txt':
    case 'md':
    case 'markdown':
      return extractPlainText(file)
    case 'html':
    case 'htm':
      return extractHtmlFile(file)
    case 'rtf':
      return extractRtf(file)
    case 'pdf':
      return extractPdf(file)
    case 'docx':
      return extractDocx(file)
    case 'epub':
      return extractEpub(file)
    default:
      throw new Error(
        `Formato ".${ext || '?'}" no compatible. Formatos admitidos: TXT, MD, HTML, RTF, PDF, DOCX, EPUB.`
      )
  }
}

/* ────────────────────────────── TXT / Markdown ────────────────────────────── */

async function extractPlainText(file: File): Promise<string> {
  // file.text() usa streaming interno del navegador: es la vía más rápida
  // para archivos de texto, incluso de varios MB.
  const raw = await file.text()
  return normalizeParagraphs(raw)
}

/* ─────────────────────────────────── HTML ─────────────────────────────────── */

async function extractHtmlFile(file: File): Promise<string> {
  const raw = await file.text()
  return htmlToLightMarkdown(raw)
}

/**
 * Convierte HTML a nuestro markdown ligero preservando negrita, cursiva,
 * subrayado, tachado, encabezados (como líneas independientes) e imágenes
 * pequeñas (embebidas como data URL). Usa DOMParser nativo → muy rápido.
 */
function htmlToLightMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Elimina elementos que no aportan contenido legible
  doc.querySelectorAll('script,style,noscript,template,svg,head').forEach((n) => n.remove())

  const lines: string[] = []

  const inlineOf = (el: Node): string => {
    let out = ''
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent || '').replace(/\s+/g, ' ')
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const e = child as HTMLElement
      const tag = e.tagName.toLowerCase()
      const inner = inlineOf(e)
      if (!inner.trim() && tag !== 'br' && tag !== 'img') return
      switch (tag) {
        case 'strong':
        case 'b':
          out += `**${inner}**`
          break
        case 'em':
        case 'i':
          out += `*${inner}*`
          break
        case 'u':
          out += `<u>${inner}</u>`
          break
        case 's':
        case 'strike':
        case 'del':
          out += `~~${inner}~~`
          break
        case 'br':
          out += '\n'
          break
        case 'a':
          out += inner
          break
        default:
          out += inner
      }
    })
    return out
  }

  const blockTags = new Set(['p', 'div', 'section', 'article', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const e = child as HTMLElement
        const tag = e.tagName.toLowerCase()
        if (tag === 'img') {
          const src = e.getAttribute('src') || ''
          const alt = e.getAttribute('alt') || 'imagen'
          if (src.startsWith('data:image/')) lines.push(`![${alt}](${src})`)
          return
        }
        if (/^h[1-6]$/.test(tag)) {
          const level = Number(tag[1])
          const text = inlineOf(e).trim()
          if (text) lines.push(`${'#'.repeat(level)} ${text}`)
          return
        }
        if (blockTags.has(tag)) {
          const text = inlineOf(e).trim()
          if (text) lines.push(text)
          if (tag !== 'li') return
          return
        }
        // Elemento no-bloque en el nivel raíz: seguir bajando
        walk(e)
      }
    })
  }

  walk(doc.body || doc)

  const joined = lines.filter(Boolean).join('\n\n')
  return normalizeParagraphs(joined)
}

/* ──────────────────────────────────── RTF ─────────────────────────────────── */

/**
 * Extractor RTF ligero (sin dependencias): elimina la sintaxis de control
 * `\comando`, grupos `{}` y tablas de fuentes/colores, dejando el texto
 * plano. Cubre bien los RTF simples exportados por Word/Notas/WordPad.
 */
async function extractRtf(file: File): Promise<string> {
  const raw = await file.text()
  let s = raw

  // Quita tablas de fuente y color (bloques {\fonttbl...} {\colortbl...})
  s = s.replace(/\{\\fonttbl[\s\S]*?\}\}/g, '')
  s = s.replace(/\{\\colortbl[\s\S]*?\}/g, '')
  s = s.replace(/\{\\\*\\[a-z]+[\s\S]*?\}/g, '')

  // Saltos de párrafo / línea
  s = s.replace(/\\par[d]?/g, '\n\n')
  s = s.replace(/\\line/g, '\n')
  s = s.replace(/\\tab/g, '\t')

  // Negrita/cursiva/subrayado básicos → markdown ligero (heurística simple
  // por apertura/cierre de \b, \i, \ul en el mismo grupo)
  s = s.replace(/\{\\b\s+([\s\S]*?)\}/g, '**$1**')
  s = s.replace(/\{\\i\s+([\s\S]*?)\}/g, '*$1*')
  s = s.replace(/\{\\ul\s+([\s\S]*?)\}/g, '<u>$1</u>')

  // Caracteres especiales de RTF (\'e9 = é, etc.) — decodifica los más comunes
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16))
    } catch {
      return ''
    }
  })

  // Elimina el resto de comandos de control y llaves de grupo
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, '')
  s = s.replace(/[{}]/g, '')
  s = s.replace(/\\\r?\n/g, '\n')

  return normalizeParagraphs(s)
}

/* ──────────────────────────────────── PDF ─────────────────────────────────── */

async function extractPdf(file: File): Promise<string> {
  let pdfjsLib: typeof import('pdfjs-dist')
  try {
    pdfjsLib = await import('pdfjs-dist')
  } catch {
    throw new Error(
      'Falta la dependencia "pdfjs-dist" para importar PDF. Instálala con: npm i pdfjs-dist'
    )
  }

  try {
    // Worker vía URL relativa al paquete: funciona con Vite/Webpack modernos
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  } catch {
    /* algunos bundlers resuelven el worker automáticamente; se ignora si falla */
  }

  const buf = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buf })
  const pdf = await loadingTask.promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (line.trim()) lines.push(line.trim())
        line = ''
      }
      line += item.str
      lastY = y
    }
    if (line.trim()) lines.push(line.trim())

    pageTexts.push(lines.join('\n'))

    // Cede el hilo cada pocas páginas para no congelar la UI en libros largos
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  const joined = pageTexts.join('\n\n')
  return normalizeParagraphs(joined)
}

/* ──────────────────────────────────── DOCX ────────────────────────────────── */

async function extractDocx(file: File): Promise<string> {
  let mammoth: typeof import('mammoth')
  try {
    mammoth = await import('mammoth')
  } catch {
    throw new Error('Falta la dependencia "mammoth" para importar DOCX. Instálala con: npm i mammoth')
  }

  const buf = await file.arrayBuffer()

  // Para archivos grandes priorizamos velocidad: solo texto plano, sin
  // convertir a HTML (evita el costo de re-serializar estilos que luego
  // tendríamos que volver a parsear).
  const isLarge = buf.byteLength > 4 * 1024 * 1024 // 4 MB

  if (isLarge) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
    return normalizeParagraphs(value)
  }

  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        if (image.contentType && (await image.readAsBase64String()).length * 0.75 > MAX_INLINE_IMAGE_BYTES) {
          return { src: '' }
        }
        const base64 = await image.readAsBase64String()
        return { src: `data:${image.contentType};base64,${base64}` }
      }),
    }
  )
  return htmlToLightMarkdown(html)
}

/* ──────────────────────────────────── EPUB ────────────────────────────────── */

async function extractEpub(file: File): Promise<string> {
  let JSZip: typeof import('jszip')
  try {
    JSZip = (await import('jszip')).default as unknown as typeof import('jszip')
  } catch {
    throw new Error('Falta la dependencia "jszip" para importar EPUB. Instálala con: npm i jszip')
  }

  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)

  // 1) Ubicar el .opf a través de META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerXml) throw new Error('EPUB inválido: falta META-INF/container.xml')
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml')
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('EPUB inválido: no se encontró el archivo .opf')

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const opfXml = await zip.file(opfPath)?.async('text')
  if (!opfXml) throw new Error('EPUB inválido: no se pudo leer el .opf')
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml')

  // 2) Manifest: id → href
  const manifest: Record<string, string> = {}
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest[id] = opfDir + href
  })

  // 3) Spine: orden real de lectura
  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .map((n) => n.getAttribute('idref'))
    .filter((x): x is string => !!x)

  const chapterPaths = spineIds.map((id) => manifest[id]).filter(Boolean)
  if (!chapterPaths.length) throw new Error('EPUB inválido: el spine no contiene capítulos')

  const parts: string[] = []
  for (let i = 0; i < chapterPaths.length; i++) {
    const path = decodeURIComponent(chapterPaths[i])
    const entry = zip.file(path)
    if (!entry) continue
    const xhtml = await entry.async('text')
    const md = htmlToLightMarkdown(xhtml)
    if (md.trim()) parts.push(md.trim())

    // Cede el hilo cada pocos capítulos para mantener la UI fluida
    if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  return normalizeParagraphs(parts.join('\n\n'))
}

/* ────────────────────────────────── Utilidades ────────────────────────────── */

/** Normaliza finales de línea, colapsa saltos excesivos y recorta espacios sobrantes */
function normalizeParagraphs(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}