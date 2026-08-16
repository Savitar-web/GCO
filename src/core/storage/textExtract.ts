/**
 * textExtract.ts — Extracción de texto + formato + imágenes para audiolibros.
 * Formatos: TXT, HTML, Markdown, DOCX (OOXML), imágenes sueltas.
 * PDF: intento básico; si no hay motor PDF, se indica al usuario.
 *
 * Salida orientada a BookReader:
 * - Párrafos separados por líneas en blanco
 * - **negrita**, *cursiva*, <u>subrayado</u>, ~~tachado~~
 * - <span style="color:#RRGGBB">texto</span>
 * - ::center:: / ::right:: al inicio de párrafo
 * - ![alt](data:image/...;base64,...){width=NNpx align=center}
 */

function extOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error || new Error('read failed'))
    r.readAsArrayBuffer(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error || new Error('read failed'))
    r.readAsText(file)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error || new Error('read failed'))
    r.readAsDataURL(file)
  })
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function mimeFromImagePath(path: string): string {
  const p = path.toLowerCase()
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.bmp')) return 'image/bmp'
  if (p.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

function parseDocxDocumentXml(
  xml: string,
  rels: Map<string, string>,
  media: Map<string, { dataUrl: string; name: string }>
): string {
  const paragraphs: string[] = []
  const pBlocks = xml.split(/<w:p[\s>]/i).slice(1)
  for (const block of pBlocks) {
    const pXml = block.split(/<\/w:p>/i)[0] || block
    let alignPrefix = ''
    const jc = pXml.match(/<w:jc\s+[^>]*w:val="(center|right|both|left)"/i)
    if (jc) {
      const v = jc[1].toLowerCase()
      if (v === 'center') alignPrefix = '::center:: '
      else if (v === 'right') alignPrefix = '::right:: '
      else if (v === 'both') alignPrefix = '::justify:: '
    }

    const imgParts: string[] = []
    const blipRe = /(?:r:embed|r:id)="(rId[^"]+)"/gi
    let bm: RegExpExecArray | null
    const seen = new Set<string>()
    while ((bm = blipRe.exec(pXml))) {
      const rid = bm[1]
      if (seen.has(rid)) continue
      seen.add(rid)
      const target = rels.get(rid)
      if (!target) continue
      const key = target.replace(/^\//, '').replace(/^\.\.\//, '')
      const med =
        media.get(key) ||
        media.get('word/' + key.replace(/^word\//, '')) ||
        media.get(key.replace(/^word\//, ''))
      if (med) {
        imgParts.push(`\n\n![${med.name}](${med.dataUrl}){width=640px align=center}\n\n`)
      }
    }

    let line = ''
    const runRe = /<w:r[\s>][\s\S]*?<\/w:r>/gi
    const runs = pXml.match(runRe) || []
    for (const run of runs) {
      const bold = /<w:b\b[^/]*\/>|<w:b\s[^>]*w:val="(?!0|false)/i.test(run)
      const italic = /<w:i\b[^/]*\/>|<w:i\s[^>]*w:val="(?!0|false)/i.test(run)
      const underline = /<w:u\b[^/]*\/>|<w:u\s[^>]*w:val="(?!none)/i.test(run)
      const strike = /<w:strike\b|<w:dstrike\b/i.test(run)
      const colorM = run.match(/<w:color\s+[^>]*w:val="([0-9A-Fa-f]{3,8})"/i)
      let color: string | null = null
      if (colorM && colorM[1].toLowerCase() !== 'auto') {
        color = '#' + colorM[1].replace(/^FF/i, '').slice(-6)
      }
      let text = ''
      const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi
      let tm: RegExpExecArray | null
      while ((tm = tRe.exec(run))) {
        text += decodeXmlEntities(tm[1])
      }
      if (/<w:br\b|<w:cr\b/i.test(run)) text += '\n'
      if (/<w:tab\b/i.test(run)) text += '\t'
      if (!text) continue
      let chunk = text
      if (bold) chunk = `**${chunk}**`
      if (italic) chunk = `*${chunk}*`
      if (underline) chunk = `<u>${chunk}</u>`
      if (strike) chunk = `~~${chunk}~~`
      if (color) chunk = `<span style="color:${color}">${chunk}</span>`
      line += chunk
    }
    const combined = (alignPrefix + line).trim()
    if (combined) paragraphs.push(combined)
    if (imgParts.length) paragraphs.push(...imgParts.map((s) => s.trim()).filter(Boolean))
  }
  if (!paragraphs.length && media.size) {
    for (const med of media.values()) {
      paragraphs.push(`![${med.name}](${med.dataUrl}){width=640px align=center}`)
    }
  }
  return paragraphs.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /Id="(rId[^"]+)"[^>]*Target="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    map.set(m[1], m[2].replace(/\\/g, '/'))
  }
  const re2 = /Target="([^"]+)"[^>]*Id="(rId[^"]+)"/gi
  while ((m = re2.exec(xml))) {
    if (!map.has(m[2])) map.set(m[2], m[1].replace(/\\/g, '/'))
  }
  return map
}

async function extractDocx(file: File): Promise<string> {
  const buf = await fileToArrayBuffer(file)
  const files = await unzipMinimal(new Uint8Array(buf))
  const docXml =
    files.get('word/document.xml') ||
    files.get('word\\document.xml')
  if (!docXml) {
    throw new Error('DOCX sin word/document.xml')
  }
  const relsXml =
    files.get('word/_rels/document.xml.rels') ||
    files.get('word/_rels/document.xml.rels'.replace(/\//g, '\\')) ||
    ''
  const rels = relsXml ? parseRels(relsXml) : new Map<string, string>()
  const media = new Map<string, { dataUrl: string; name: string }>()
  for (const [path, content] of files.entries()) {
    const norm = path.replace(/\\/g, '/')
    if (!norm.startsWith('word/media/')) continue
    const name = norm.split('/').pop() || 'image'
    const mime = mimeFromImagePath(name)
    if (!mime.startsWith('image/')) continue
    if (content.startsWith('__BIN_B64__:')) {
      const b64 = content.slice('__BIN_B64__:'.length)
      media.set(norm, { dataUrl: `data:${mime};base64,${b64}`, name })
      media.set(norm.replace(/^word\//, ''), { dataUrl: `data:${mime};base64,${b64}`, name })
    }
  }
  return parseDocxDocumentXml(docXml, rels, media)
}

async function unzipMinimal(data: Uint8Array): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0
  const u16 = (o: number) => view.getUint16(o, true)
  const u32 = (o: number) => view.getUint32(o, true)
  while (offset + 30 <= data.length) {
    const sig = u32(offset)
    if (sig !== 0x04034b50) break
    const method = u16(offset + 8)
    const compSize = u32(offset + 18)
    const uncompSize = u32(offset + 22)
    const nameLen = u16(offset + 26)
    const extraLen = u16(offset + 28)
    const nameBytes = data.subarray(offset + 30, offset + 30 + nameLen)
    const name = new TextDecoder('utf-8').decode(nameBytes)
    const dataStart = offset + 30 + nameLen + extraLen
    let dataEnd = dataStart + compSize
    if (dataEnd > data.length) dataEnd = data.length
    const payload = data.subarray(dataStart, dataEnd)
    offset = dataEnd
    if (name.endsWith('/')) continue
    let raw: Uint8Array
    if (method === 0) {
      raw = payload
    } else if (method === 8) {
      try {
        raw = await inflateRaw(payload, uncompSize)
      } catch {
        continue
      }
    } else {
      continue
    }
    const isBinary =
      /^word\/media\//i.test(name) ||
      /\.(png|jpe?g|gif|webp|bmp|emf|wmf)$/i.test(name)
    if (isBinary) {
      out.set(name.replace(/\\/g, '/'), '__BIN_B64__:' + uint8ToBase64(raw))
    } else {
      out.set(name.replace(/\\/g, '/'), new TextDecoder('utf-8').decode(raw))
    }
  }
  return out
}

async function inflateRaw(payload: Uint8Array, _hint = 0): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deflate no soportado en este navegador')
  }
  for (const format of ['deflate-raw', 'deflate'] as const) {
    try {
      const ds = new DecompressionStream(format)
      const blob = new Blob([payload as unknown as BlobPart])
      const stream = blob.stream().pipeThrough(ds)
      const ab = await new Response(stream).arrayBuffer()
      return new Uint8Array(ab)
    } catch {
      /* try next */
    }
  }
  throw new Error('inflate failed')
}

function htmlToReaderMarkdown(html: string): string {
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/p>/gi, '\n\n')
  s = s.replace(/<\/div>/gi, '\n')
  s = s.replace(/<\/h[1-6]>/gi, '\n\n')
  s = s.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
  s = s.replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
  s = s.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
  s = s.replace(/<u>([\s\S]*?)<\/u>/gi, '<u>$1</u>')
  s = s.replace(/<(s|strike|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~')
  s = s.replace(
    /<span[^>]*style="[^"]*color:\s*([^";]+)"[^>]*>([\s\S]*?)<\/span>/gi,
    '<span style="color:$1">$2</span>'
  )
  s = s.replace(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    (_m, src) => `\n\n![imagen](${src}){width=640px align=center}\n\n`
  )
  s = s.replace(/<[^>]+>/g, '')
  s = decodeXmlEntities(s)
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name || 'archivo'
  const ext = extOf(name)
  const type = (file.type || '').toLowerCase()

  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
    const dataUrl = await fileToDataUrl(file)
    return `![${name}](${dataUrl}){width=640px align=center}`
  }

  if (
    ext === '.txt' ||
    ext === '.md' ||
    ext === '.markdown' ||
    type === 'text/plain' ||
    type === 'text/markdown'
  ) {
    return (await fileToText(file)).replace(/\r\n/g, '\n')
  }

  if (ext === '.html' || ext === '.htm' || type === 'text/html') {
    return htmlToReaderMarkdown(await fileToText(file))
  }

  if (
    ext === '.docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(file)
  }

  if (ext === '.doc') {
    throw new Error(
      'Los .doc antiguos no se pueden leer en el navegador. Guarda como .docx o .txt e inténtalo de nuevo.'
    )
  }

  if (ext === '.epub' || type === 'application/epub+zip') {
    const buf = await fileToArrayBuffer(file)
    const files = await unzipMinimal(new Uint8Array(buf))
    const htmlParts: string[] = []
    const sorted = [...files.keys()].filter((k) => /\.(xhtml|html|htm)$/i.test(k)).sort()
    for (const k of sorted) {
      const html = files.get(k) || ''
      if (html.startsWith('__BIN_B64__:')) continue
      const md = htmlToReaderMarkdown(html)
      if (md.trim()) htmlParts.push(md)
    }
    for (const [k, v] of files) {
      if (!/^.*\.(png|jpe?g|gif|webp)$/i.test(k) || !v.startsWith('__BIN_B64__:')) continue
      const b64 = v.slice('__BIN_B64__:'.length)
      const mime = mimeFromImagePath(k)
      const base = k.split('/').pop() || 'img'
      htmlParts.push(`![${base}](data:${mime};base64,${b64}){width=640px align=center}`)
    }
    if (htmlParts.length) return htmlParts.join('\n\n')
    throw new Error('No se pudo leer el contenido del EPUB.')
  }

  if (ext === '.pdf' || type === 'application/pdf') {
    throw new Error(
      'La extracción de PDF con imágenes y formato requiere un motor PDF. Exporta a DOCX o TXT, o pega el texto.'
    )
  }

  try {
    const t = await fileToText(file)
    if (t && t.replace(/\0/g, '').trim().length > 0) return t.replace(/\r\n/g, '\n')
  } catch {
    /* */
  }
  throw new Error('Formato no soportado o archivo ilegible.')
}

export default extractTextFromFile