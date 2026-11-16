import JSZip from 'jszip'
import DOMPurify from 'dompurify'
// Reading files must never execute document scripts or load remote trackers.
export async function safeEpub(data:ArrayBuffer){
 const zip=await JSZip.loadAsync(data)
 for(const file of Object.values(zip.files)){
  if(file.dir||! /\.(xhtml|html|htm)$/i.test(file.name))continue
  const raw=await file.async('string')
  const clean=DOMPurify.sanitize(raw,{WHOLE_DOCUMENT:true,ADD_TAGS:['link','style'],ADD_ATTR:['epub:type'],FORBID_TAGS:['script','iframe','object','embed','form','base']})
  const doc=new DOMParser().parseFromString(clean,'text/html')
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' blob: data:; font-src data: blob:; media-src data: blob:"
  doc.head.prepend(csp)
  doc.documentElement.setAttribute('xmlns:epub','http://www.idpf.org/2007/ops')
  zip.file(file.name,new XMLSerializer().serializeToString(doc.documentElement))
 }
 return zip.generateAsync({type:'arraybuffer'})
}
