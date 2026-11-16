import {useReaderPlayer} from '@/core/reader/ReaderPlayerContext'
import {readingWords,wordAt,alignReadingWords,documentWordRanges} from './readingAlignment'
import {extractTextFromFile} from '@/core/storage/textExtract'
import { createPortal } from 'react-dom'
import {lazy,Suspense,useEffect,useRef,useState,useMemo} from 'react'
import {useParams,Link} from 'react-router-dom'
import {ChevronLeft,ChevronRight,Download,Maximize,FileText} from 'lucide-react'
import {getBook,saveBook,type BookItem} from '@/core/storage/mediaLibrary'
import {importDocument} from '@/core/storage/documentImport'
import type {PDFDocumentProxy} from 'pdfjs-dist'
import type {Rendition,Book} from 'epubjs'
import './library.css'
const TextReader=lazy(()=>import('./BookReader').then(m=>({default:m.BookReader})))

export function BookReader(){
 const {id}=useParams();const [book,setBook]=useState<BookItem|null>(null),[loaded,setLoaded]=useState(false),[textMode,setTextMode]=useState(false),[error,setError]=useState('')
 const attach=useRef<HTMLInputElement>(null)
 useEffect(()=>{let alive=true;setLoaded(false);setTextMode(false);void getBook(id||'').then(b=>{if(alive){setBook(b);setLoaded(true)}}).catch(()=>{if(alive){setError('No se pudo abrir el libro.');setLoaded(true)}});return()=>{alive=false}},[id])
 const [extracting, setExtracting] = useState(false)
 const [extractionStatus,setExtractionStatus]=useState('Preparando texto…')
 const [extractionRun,setExtractionRun]=useState(0)
 useEffect(() => {
  if (!book?.originalDataUrl || book.textExtractionVersion===2&&book.text.trim()&&extractionRun===0) return
  let active = true
  const controller=new AbortController()
  setExtracting(true)
  setError('')
  void (async () => {
   const blob = await (await fetch(book.originalDataUrl!)).blob()
   const file = new File([blob], /\.(pdf|epub|docx)$/i.test(book.originalName||'') ? book.originalName! : `document.${book.sourceFormat||'pdf'}`, {type:blob.type})
   const text = await extractTextFromFile(file,{ocr:true,signal:controller.signal,onProgress:message=>{if(active)setExtractionStatus(message)}})
   if (!text.trim()) throw new Error('El documento no contiene texto extraíble. Un PDF escaneado necesita reconocimiento de texto.')
   const current = await getBook(book.id)
   if (!active || !current) return
   const updated = await saveBook({...current,text,textExtractionVersion:2})
   if (active) setBook(updated)
  })().catch(error => {if(active)setError(error instanceof Error ? error.message : 'No se pudo preparar la lectura.')})
   .finally(() => {if(active)setExtracting(false)})
  return () => {active=false;controller.abort()}
 }, [book?.id, book?.originalDataUrl,extractionRun])
 if(!loaded)return <main className="document-empty" role="status">Abriendo tu libro…</main>
 if(!book)return <main className="document-empty"><p>{error||'Este libro no está disponible.'}</p><Link to="/nutricion">Volver a la biblioteca</Link></main>
 const original = !!book.originalDataUrl && !textMode
 return <Suspense fallback={<p className="document-empty">Cargando lector…</p>}>
  <TextReader key={book.id} bookData={book}
   formatControl={<section className="reader-format-options" aria-label="Formato de lectura">
    <strong>Formato de lectura</strong>
    {book.originalDataUrl ? <div className="reader-format-buttons">
     <button type="button" className="glass-button secondary" aria-pressed={original} onClick={() => setTextMode(false)}>Original</button>
     <button type="button" className="glass-button secondary" aria-pressed={!original} disabled={extracting} onClick={() => setTextMode(true)}>{extracting ? extractionStatus : 'Nutrición · texto y voz'}</button>
    </div> : <button type="button" className="glass-button secondary" onClick={() => attach.current?.click()}>Adjuntar original</button>}
    <input hidden ref={attach} type="file" accept=".pdf,.docx,.epub" onChange={async event => {
     const file = event.currentTarget.files?.[0]
     if (!file) return
     setError('')
     try {
      const document = await importDocument(file)
      if (!document.originalDataUrl) throw new Error('Selecciona un PDF, EPUB o DOCX.')
      const current = await getBook(book.id)
      if (!current) return
      const next = await saveBook({ ...current, originalDataUrl: document.originalDataUrl, originalName: document.originalName, sourceFormat: document.sourceFormat, text:document.text, documentLocation: '1', documentProgress: 0 })
      setBook(next)
      setTextMode(false)
     } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo adjuntar el original.')
     }
    }} />
    {book.originalDataUrl&&<button type="button" className="glass-button secondary" disabled={extracting} onClick={()=>setExtractionRun(value=>value+1)}>Volver a extraer el texto</button>}
    {error && <p role="alert">{error}</p>}
   </section>}
   originalBody={!original && !book.text.trim() ? () => <section className="document-empty" role="status"><h2>{extracting ? extractionStatus : 'No hay texto disponible todavía'}</h2><p>{error || 'Se está extrayendo el contenido para leerlo y escucharlo.'}</p><button className="glass-button" disabled={extracting} onClick={()=>setExtractionRun(value=>value+1)}>Reintentar extracción</button></section> : original ? (tools,reading) => <OriginalReader key={(book.originalName||book.id)+book.text.length} book={book} speechText={reading.text} tools={tools}
    onPosition={(documentLocation, documentProgress) => setBook(current => current?.id === book.id ? { ...current, documentLocation, documentProgress } : current)} /> : undefined}
  />
 </Suspense>
}
function OriginalReader({book,tools,onPosition,speechText}:{book:BookItem;speechText:string;tools:HTMLDivElement|null;onPosition:(location:string,progress:number)=>void}){
 const {reader,activeBook}=useReaderPlayer()
 const speechWords=useMemo(()=>readingWords(speechText),[speechText]);const speechWord=activeBook?.id===book.id?wordAt(speechWords,reader.charIndex):-1
 const pdfWords=useRef<{page:number;item:number;start:number;end:number;source:number}[]>([])
 const epubSections=useRef<{href:string;first:number;last:number}[]>([])
 const epubHighlight=useRef<string|null>(null)
 const domMaps=useRef(new WeakMap<Document,{entries:ReturnType<typeof documentWordRanges>;alignment:number[]}>())
 const mappedDocument=(doc:Document,from=0)=>{let map=domMaps.current.get(doc);if(!map){const entries=documentWordRanges(doc);map={entries,alignment:alignReadingWords(speechWords,entries.map(entry=>entry.word),from)};domMaps.current.set(doc,map)}return map}
 const [followReady,setFollowReady]=useState(0),[highlightRect,setHighlightRect]=useState<{left:number;top:number;width:number;height:number}|null>(null)
 const root=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
 const pdf=useRef<PDFDocumentProxy|null>(null),epub=useRef<Book|null>(null),rendition=useRef<Rendition|null>(null)
 const [page,setPage]=useState(Math.max(1,Number(book.documentLocation)||1)),[total,setTotal]=useState(0),[zoom,setZoom]=useState(1),[width,setWidth]=useState(600),[busy,setBusy]=useState(true),[error,setError]=useState(''),[chapter,setChapter]=useState(''),[toc,setToc]=useState<{label:string;href:string}[]>([])
 const initialLocation = useRef(book.documentLocation || '1').current
 const location = useRef(initialLocation)
 const progress = useRef(book.documentProgress ?? 0)
 const ready = useRef(false)
 const lastSaved = useRef({ location: initialLocation, progress: book.documentProgress ?? 0 })
 const positionCallback = useRef(onPosition)
 positionCallback.current = onPosition
 const moving=useRef(false)
 useEffect(()=>{const node=host.current;if(!node)return;const r=new ResizeObserver(()=>setWidth(Math.max(200,node.clientWidth-24)));r.observe(node);return()=>r.disconnect()},[])
 useEffect(()=>{
  let cancelled=false;let cleanup=()=>{};ready.current=false
  async function open(){try{
   const blob=await (await fetch(book.originalDataUrl!)).blob();const data=await blob.arrayBuffer();if(cancelled)return
   if(book.sourceFormat==='pdf'){
    const lib=await import('pdfjs-dist');lib.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
    const task=lib.getDocument({data});cleanup=()=>{void task.destroy()};const document=await task.promise;if(cancelled){void task.destroy();return}pdf.current=document;void (async()=>{let cursor=0;const mapped:typeof pdfWords.current=[];for(let n=1;n<=document.numPages;n++){const content=await(await document.getPage(n)).getTextContent();for(const [item,value] of content.items.entries()){if(!('str' in value))continue;const words=readingWords(value.str),alignment=alignReadingWords(speechWords,words,cursor);words.forEach((word,i)=>{mapped.push({page:n,item,start:word.start,end:word.end,source:alignment[i]});if(alignment[i]>=0)cursor=alignment[i]+1})}if(cancelled)return}pdfWords.current=mapped;if(!cancelled)setFollowReady(value=>value+1)})().catch(()=>{});setTotal(document.numPages);setPage(p=>Math.min(document.numPages,p))
   }else if(book.sourceFormat==='epub'){
    const {default:ePub}=await import('epubjs');if(cancelled)return
    const {safeEpub}=await import('./safeEpub');const safe=await safeEpub(data);if(cancelled)return
    const b=ePub(safe,{replacements:'blobUrl'});epub.current=b;cleanup=()=>b.destroy();await b.ready;if(cancelled)return
    const r=b.renderTo(host.current!,{width:'100%',height:'100%',spread:'none',flow:'paginated',allowScriptedContent:false});rendition.current=r
    r.on('relocated',(loc:{start:{cfi:string;href:string;index:number;displayed:{page:number;total:number}}})=>{if(cancelled)return;location.current=loc.start.cfi;const spineSize=(b.spine as unknown as {length:number}).length;const displayed=loc.start.displayed;progress.current=spineSize?Math.min(1,(loc.start.index+displayed.page/Math.max(1,displayed.total))/spineSize):0;setPage(loc.start.displayed.page);setTotal(loc.start.displayed.total);setChapter(loc.start.href.split('/').pop()||'Capítulo')})
    const nav=await b.loaded.navigation;const chapters:{label:string;href:string}[]=[];const collect=(items:typeof nav.toc)=>items.forEach(t=>{chapters.push({label:t.label.trim(),href:t.href});if(t.subitems?.length)collect(t.subitems)});collect(nav.toc);if(!chapters.length)b.spine.each((section:{href:string},index:number)=>chapters.push({label:`Capítulo ${index+1}`,href:section.href}));setToc(chapters)
    await r.display(initialLocation.startsWith('epubcfi')?initialLocation:undefined)
    void (async()=>{let cursor=0;const sections:{href:string;first:number;last:number}[]=[];const spine:{href:string;load:(loader:unknown)=>Promise<Document|Element>;unload:()=>void}[]=[];b.spine.each((section:unknown)=>spine.push(section as typeof spine[number]));for(const section of spine){const loaded=await section.load(b.load.bind(b));if(cancelled)return;const doc=loaded.nodeType===9?loaded as Document:loaded.ownerDocument!;const entries=documentWordRanges(doc),alignment=alignReadingWords(speechWords,entries.map(entry=>entry.word),cursor),valid=alignment.filter(index=>index>=0);if(valid.length){sections.push({href:section.href,first:valid[0],last:valid.at(-1)!});cursor=valid.at(-1)!+1}}epubSections.current=sections;if(!cancelled)setFollowReady(value=>value+1)})().catch(()=>{})
   }else{
    const frame=document.createElement('iframe');frame.title='Documento Word';frame.setAttribute('sandbox','allow-same-origin');frame.className='docx-frame';host.current!.append(frame);cleanup=()=>frame.remove()
    await new Promise<void>(resolve=>{frame.onload=()=>resolve();frame.srcdoc='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; font-src data: blob:; style-src \'unsafe-inline\'"><style>::highlight(spoken){background:#ffe16a99;color:inherit}body{margin:0;background:#e8e9ed;overflow-x:hidden} .docx-wrapper{padding:12px!important;box-sizing:border-box;width:100%;display:block!important} section.docx{margin:0 auto 16px!important} </style></head><body><div id="pages"></div></body></html>'})
    if(cancelled)return
    const {renderAsync}=await import('docx-preview');await renderAsync(data,frame.contentDocument!.getElementById('pages')!,undefined,{inWrapper:true,breakPages:true,ignoreWidth:false,ignoreHeight:false,useBase64URL:true,renderHeaders:true,renderFooters:true,renderFootnotes:true})
    if(cancelled)return
    const pages=Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>('section.docx'));setTotal(pages.length||1)
    const fit=()=>{const w=frame.clientWidth-24;for(const p of pages){const actual=p.offsetWidth; p.style.zoom=String(Math.min(1,w/actual))}pages[Math.max(0,(Number(location.current)||1)-1)]?.scrollIntoView()}
    fit();const observer=new ResizeObserver(fit);observer.observe(frame)
    const scroll=()=>{let n=1;for(const [i,p] of pages.entries())if(p.getBoundingClientRect().top<frame.clientHeight*.5)n=i+1;setPage(n);location.current=String(n)}
    frame.contentWindow?.addEventListener('scroll',scroll);const initial=Math.min(pages.length,Number(initialLocation)||1);pages[initial-1]?.scrollIntoView();cleanup=()=>{observer.disconnect();frame.remove()}
   }
   if(!cancelled){ready.current=true;setBusy(false)}
  }catch(e){if(!cancelled){setError(e instanceof Error?e.message:'No se pudo mostrar el documento.');setBusy(false)}}}
  void open()
  return()=>{cancelled=true;cleanup();pdf.current=null;rendition.current=null;epub.current=null}
 },[book.id,book.originalDataUrl,book.sourceFormat,initialLocation])
 useEffect(()=>{if(!pdf.current||busy||!canvas.current)return;let alive=true;let task:{cancel:()=>void}|undefined
  void pdf.current.getPage(page).then(p=>{if(!alive)return;const base=p.getViewport({scale:1});const scale=width/base.width*zoom;const viewport=p.getViewport({scale});const dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(6000000/(viewport.width*viewport.height)));const c=canvas.current!;c.width=Math.ceil(viewport.width*dpr);c.height=Math.ceil(viewport.height*dpr);c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;task=p.render({canvas:c,viewport,transform:[dpr,0,0,dpr,0,0]});location.current=String(page);return (task as unknown as {promise:Promise<void>}).promise}).catch(e=>{if(alive&&e?.name!=='RenderingCancelledException')setError('No se pudo dibujar esta página.')});return()=>{alive=false;task?.cancel()}
 },[page,width,zoom,busy])
 useEffect(()=>{
  if(!reader.speaking||speechWord<0||busy)return
  let alive=true
  if(book.sourceFormat==='pdf'){
   const target=pdfWords.current.find(word=>word.source===speechWord)
   if(!target)return
   if(target.page!==page){setPage(target.page);setHighlightRect(null);return}
   void pdf.current?.getPage(page).then(async p=>{
    const content=await p.getTextContent(),item=content.items[target.item];if(!alive||!item||!('str' in item))return
    const lib=await import('pdfjs-dist'),base=p.getViewport({scale:1}),viewport=p.getViewport({scale:width/base.width*zoom}),matrix=lib.Util.transform(viewport.transform,item.transform)
    const context=canvas.current?.getContext('2d');if(!context)return
    context.font=Math.hypot(matrix[2],matrix[3])+'px sans-serif'
    const full=context.measureText(item.str).width||1,left=context.measureText(item.str.slice(0,target.start)).width/full,right=context.measureText(item.str.slice(0,target.end)).width/full
    const itemWidth=item.width*viewport.scale,height=Math.hypot(matrix[2],matrix[3])
    setHighlightRect({left:matrix[4]+left*itemWidth,top:matrix[5]-height,width:Math.max(3,(right-left)*itemWidth),height:height*1.2})
    requestAnimationFrame(()=>root.current?.querySelector('.document-spoken-highlight')?.scrollIntoView({block:'nearest',behavior:'smooth'}))
   }).catch(()=>{})
  }else if(book.sourceFormat==='epub'&&rendition.current){
   const r=rendition.current,section=epubSections.current.find(section=>speechWord>=section.first&&speechWord<=section.last)
   const mark=()=>{
    if(!alive)return
    const contents=r.getContents() as unknown as {document:Document;cfiFromRange:(range:Range)=>string}[]
    for(const content of contents){
     const {entries,alignment}=mappedDocument(content.document,section?.first??0),index=alignment.indexOf(speechWord)
     if(index<0)continue
     const cfi=content.cfiFromRange(entries[index].range)
     if(epubHighlight.current)r.annotations.remove(epubHighlight.current,'highlight')
     r.annotations.highlight(cfi,{},undefined,'reader-spoken-word',{'fill':'#ffe16a','fill-opacity':'.5','mix-blend-mode':'multiply'})
     epubHighlight.current=cfi
     const rect=entries[index].range.getBoundingClientRect(),view=content.document.defaultView
     if(view&&(rect.left<0||rect.right>view.innerWidth||rect.top<0||rect.bottom>view.innerHeight))void r.display(cfi).catch(()=>{})
     return
    }
   }
   const current=r.currentLocation() as unknown as {start?:{href?:string}}
   if(section&&current?.start?.href!==section.href)void r.display(section.href).then(mark).catch(()=>{});else mark()
  }else if(book.sourceFormat==='docx'){
   const doc=host.current?.querySelector('iframe')?.contentDocument;if(!doc)return
   const {entries,alignment}=mappedDocument(doc),index=alignment.indexOf(speechWord)
   if(index>=0){const highlights=(doc.defaultView as unknown as {CSS?:{highlights?:Map<string,unknown>};Highlight?:new(...ranges:Range[])=>unknown});if(highlights.Highlight)highlights.CSS?.highlights?.set('spoken',new highlights.Highlight(entries[index].range));entries[index].range.startContainer.parentElement?.scrollIntoView({block:'center',behavior:'smooth'})}
  }
  return()=>{alive=false}
 },[speechWord,reader.speaking,page,width,zoom,busy,followReady,book.sourceFormat])
 useEffect(()=>{if(book.sourceFormat!=='docx'||busy)return;const frame=host.current?.querySelector('iframe');if(!frame)return;frame.contentDocument?.querySelectorAll<HTMLElement>('section.docx').forEach(p=>{p.style.zoom=String(Math.min(1,(frame.clientWidth-24)/p.offsetWidth)*zoom)});if(frame.contentDocument){frame.contentDocument.body.style.overflowX=zoom>1?'auto':'hidden';frame.contentDocument.querySelectorAll('section.docx')[Math.max(0,(Number(location.current)||1)-1)]?.scrollIntoView()}},[zoom,width,busy,book.sourceFormat])
 useEffect(() => {
  if (!busy && total && book.sourceFormat !== 'epub') progress.current = Math.min(1, page / total)
 }, [busy, total, page, book.sourceFormat])
 useEffect(() => {
  const persist = () => {
   const next = { location: location.current, progress: progress.current }
   if (!ready.current || (next.location === lastSaved.current.location && next.progress === lastSaved.current.progress)) return
   lastSaved.current = next
   positionCallback.current(next.location, next.progress)
   void getBook(book.id).then(current => current && saveBook({
    ...current, documentLocation: next.location, documentProgress: next.progress,
   })).catch(() => { lastSaved.current = { location: '', progress: -1 } })
  }
  const onHidden = () => { if (document.visibilityState === 'hidden') persist() }
  const timer = window.setInterval(persist, 5000)
  window.addEventListener('pagehide', persist)
  document.addEventListener('visibilitychange', onHidden)
  return () => { clearInterval(timer); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', onHidden); persist() }
 }, [book.id])
 function move(delta:number){if(rendition.current){if(moving.current)return;moving.current=true;void (delta>0?rendition.current.next():rendition.current.prev()).catch(()=>setError('No se pudo cambiar de página.')).finally(()=>{moving.current=false});return}const next=Math.max(1,Math.min(total,page+delta));if(book.sourceFormat==='docx'){host.current?.querySelector('iframe')?.contentDocument?.querySelectorAll('section.docx')[next-1]?.scrollIntoView()}setPage(next);location.current=String(next)}
 return <section className="reader-original-body" ref={root} aria-label="Documento original">
 {tools && createPortal(<div className="reader-document-options">
   <a className="glass-button secondary" href={book.originalDataUrl} download={book.originalName || book.title}><Download size={16} /> Descargar original</a>
   {typeof document.documentElement.requestFullscreen === 'function' && <button type="button" className="glass-button secondary" onClick={() => {
     void root.current?.closest('.reader-root')?.requestFullscreen().catch(() => setError('Pantalla completa no disponible.'))
   }}><Maximize size={16} /> Pantalla completa</button>}
   {book.sourceFormat !== 'epub' && <label>Zoom <select className="glass-input" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
     <option value={1}>Ajustar ancho</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option>
   </select></label>}
   {toc.length > 0 && <select className="glass-input" aria-label="Capítulo del original" onChange={event => {
     void rendition.current?.display(event.target.value).catch(() => setError('No se pudo abrir el capítulo.'))
   }} defaultValue=""><option value="" disabled>Índice del original</option>{toc.map(item => <option key={item.href} value={item.href}>{item.label}</option>)}</select>}
 </div>, tools)}
 {error&&<div className="document-message" role="alert">{error}</div>}{busy&&<div className="document-message" role="status"><FileText/> Preparando el documento…</div>}
 <div ref={host} className={`document-stage format-${book.sourceFormat}`}>{book.sourceFormat==='pdf'&&<div className="document-pdf-page"><canvas key={page} ref={canvas} aria-label={`Página ${page} de ${total}`}/>{highlightRect&&<span className="document-spoken-highlight" style={highlightRect}/>}</div>}</div>
 <footer className="document-pagination"><button className="glass-button secondary" disabled={busy||page<=1&&book.sourceFormat!=='epub'} onClick={()=>move(-1)} aria-label="Página anterior"><ChevronLeft/></button><div><strong>{total?`${page} / ${total}`:'…'}</strong><small>{book.sourceFormat==='epub'?`Páginas del capítulo · ${chapter}`:book.sourceFormat==='docx'?'Páginas según el diseño interpretado':'Páginas del documento'}</small></div><button className="glass-button secondary" disabled={busy||page>=total&&book.sourceFormat!=='epub'} onClick={()=>move(1)} aria-label="Página siguiente"><ChevronRight/></button></footer>
 </section>
}
