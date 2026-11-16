import {extractTextFromFile,getFileExt} from './textExtract'
import type {BookItem} from './mediaLibrary'
export async function importDocument(file:File):Promise<Partial<BookItem>&{text:string}>{
 if(!file.size||file.size>50*1024*1024)throw new Error('Selecciona un archivo de hasta 50 MB.')
 const ext=getFileExt(file.name)
 const original=['pdf','docx','epub'].includes(ext)
 if(ext==='pdf'&&!(await file.slice(0,1024).text()).includes('%PDF-'))throw new Error('El archivo no contiene un PDF válido.')
 if(ext==='docx'||ext==='epub'){
  const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await file.arrayBuffer())
  if(!zip.file(ext==='docx'?'word/document.xml':'META-INF/container.xml'))throw new Error('El archivo no contiene un documento válido de este formato.')
 }
 let text=''
 try{text=await extractTextFromFile(file)}catch(error){if(!original)throw error}
 if(!original&&!text.trim())throw new Error('El archivo no contiene texto legible.')
 const originalDataUrl=original?await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('No se pudo leer el archivo.'));r.readAsDataURL(file)}):undefined
 return {text,textExtractionVersion:text.trim()?2:undefined,originalDataUrl,originalName:original?file.name:undefined,sourceFormat:(({md:'markdown',htm:'html'} as Record<string,string>)[ext]||ext) as BookItem['sourceFormat']}
}
