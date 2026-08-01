import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'
import JSZip from 'jszip'

// Vite worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type

  if (
    name.endsWith('.txt') ||
    type === 'text/plain' ||
    type === 'text/markdown'
  ) {
    return file.text()
  }

  if (name.endsWith('.pdf') || type === 'application/pdf') {
    return extractPdf(file)
  }

  if (
    name.endsWith('.docx') ||
    type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(file)
  }

  if (name.endsWith('.epub') || type === 'application/epub+zip') {
    return extractEpub(file)
  }

  // fallback
  try {
    return await file.text()
  } catch {
    throw new Error('Formato no soportado')
  }
}

async function extractPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ')
    parts.push(line)
  }
  return parts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim()
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return (result.value || '').trim()
}

async function extractEpub(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const htmlFiles: { name: string; text: string }[] = []

  const jobs: Promise<void>[] = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    const lower = relativePath.toLowerCase()
    if (
      lower.endsWith('.xhtml') ||
      lower.endsWith('.html') ||
      lower.endsWith('.htm')
    ) {
      jobs.push(
        entry.async('string').then((text) => {
          htmlFiles.push({ name: relativePath, text })
        })
      )
    }
  })
  await Promise.all(jobs)
  htmlFiles.sort((a, b) => a.name.localeCompare(b.name))

  const texts = htmlFiles.map(({ text }) => stripHtml(text))
  return texts.join('\n\n').trim()
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body?.textContent || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}