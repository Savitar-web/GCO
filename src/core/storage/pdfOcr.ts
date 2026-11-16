import type {PDFDocumentProxy} from 'pdfjs-dist'
/** OCR runs entirely on the device. Originals never leave this browser. */
export async function recognizePdf(pdf:PDFDocumentProxy,onProgress?:(message:string)=>void,signal?:AbortSignal){
 const {createWorker}=await import('tesseract.js')
 const check=()=>{if(signal?.aborted)throw new DOMException('Lectura cancelada','AbortError')}
 check();onProgress?.('Preparando reconocimiento de texto…')
 const root=new URL(import.meta.env.BASE_URL,window.location.href)
 const worker=await createWorker('spa+eng',1,{workerPath:new URL('ocr/worker.min.js',root).href,corePath:new URL('ocr/tesseract-core-lstm.wasm.js',root).href,langPath:new URL('ocr/lang',root).href,workerBlobURL:false})
 const abort=()=>{void worker.terminate()};signal?.addEventListener('abort',abort,{once:true})
 const parts:string[]=[]
 try{
  check()
  for(let n=1;n<=pdf.numPages;n++){
   check();onProgress?.(`Reconociendo texto · página ${n} de ${pdf.numPages}`)
   const page=await pdf.getPage(n),native=await page.getTextContent()
   const plain=native.items.filter((item):item is typeof item & {str:string}=>'str' in item).map(item=>item.str).join(' ')
   if(plain.trim().length>20){parts.push(plain);page.cleanup();continue}
   const base=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(3000000/(base.width*base.height))),viewport=page.getViewport({scale})
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
   try{await page.render({canvas,viewport}).promise;check();const {data}=await worker.recognize(canvas);parts.push(data.text.trim())}
   finally{canvas.width=0;canvas.height=0;page.cleanup()}
  }
  return parts.filter(Boolean).join('\n\n')
 }finally{signal?.removeEventListener('abort',abort);await worker.terminate().catch(()=>{})}
}
