import fs from 'node:fs/promises';import {load} from 'cheerio';import {createHash} from 'node:crypto';
export const subjects=[
 ['newton','Isaac Newton',53311,'ciencia','Brewster, D.','1831','The life of Sir Isaac Newton'],
 ['maxwell','James Clerk Maxwell',79044,'ciencia','Campbell, L., & Garnett, W.','1882','The life of James Clerk Maxwell'],
 ['tesla','Nikola Tesla',13476,'ciencia','Tesla, N.','1892','Experiments with alternate currents of high potential and high frequency'],
 ['faraday','Michael Faraday',1225,'ciencia','Tyndall, J.','1868','Faraday as a discoverer'],
 ['darwin','Charles Darwin',2010,'ciencia','Darwin, C.','1887','The autobiography of Charles Darwin (F. Darwin, Ed.)'],
 ['pasteur','Louis Pasteur',60956,'ciencia','Vallery-Radot, R.','1920','The life of Pasteur (R. L. Devonshire, Trad.)'],
 ['galileo','Galileo Galilei',25992,'ciencia','Brewster, D.','1841','The martyrs of science','galileo'],
 ['tycho','Tycho Brahe',25992,'ciencia','Brewster, D.','1841','The martyrs of science','tycho'],
 ['kepler','Johannes Kepler',25992,'ciencia','Brewster, D.','1841','The martyrs of science','kepler'],
 ['lavoisier','Antoine Lavoisier',30775,'ciencia','Lavoisier, A. L.','1790','Elements of chemistry (R. Kerr, Trad.)'],
 ['platon','Platón',1497,'filosofia','Platón','s. f.','The republic (B. Jowett, Trad.)'],
 ['aristoteles','Aristóteles',8438,'filosofia','Aristóteles','s. f.','The Nicomachean ethics'],
 ['descartes','René Descartes',59,'filosofia','Descartes, R.','s. f.','A discourse on method (J. Veitch, Trad.)'],
 ['spinoza','Baruch Spinoza',3800,'filosofia','Spinoza, B.','1883','Ethics (R. H. M. Elwes, Trad.)'],
 ['hume','David Hume',9662,'filosofia','Hume, D.','1777','An enquiry concerning human understanding'],
 ['kant','Immanuel Kant',5682,'filosofia','Kant, I.','s. f.','Fundamental principles of the metaphysic of morals (T. K. Abbott, Trad.)'],
 ['locke','John Locke',10615,'filosofia','Locke, J.','s. f.','An essay concerning humane understanding (Vol. 1)'],
 ['epicteto','Epicteto',45109,'filosofia','Epicteto','1865','The enchiridion (T. W. Higginson, Trad.)'],
 ['marco-aurelio','Marco Aurelio',2680,'filosofia','Marco Aurelio','1634','Meditations (M. Casaubon, Trad.)'],
 ['russell','Bertrand Russell',5827,'filosofia','Russell, B.','1912','The problems of philosophy'],
 ['seneca','Séneca',56075,'filosofia','Séneca','s. f.',"Seneca’s morals of a happy life, benefits, anger and clemency (R. L’Estrange, Trad.)"],
 ['socrates','Sócrates',1656,'filosofia','Platón','s. f.','Apology (B. Jowett, Trad.)'],
 ['cleopatra','Cleopatra VII',10992,'historia','Abbott, J.','1851','Cleopatra'],
 ['egipto','Vida en el antiguo Egipto',15663,'historia','Rawlinson, G., con la colaboración de Gilman, A.','1887','Ancient Egypt'],
 ['china','Dinastías de China',6708,'historia','Boulger, D. C.','1893','China'],
 ['mayas','Escritura y calendarios mayas',43491,'historia','Morley, S. G.','1915','An introduction to the study of the Maya hieroglyphs'],
 ['grecia','La antigua Grecia',1174,'historia','Jenofonte','s. f.','Hellenica (H. G. Dakyns, Trad.)'],
 ['geografia','Historia de la geografía',14291,'geografia','Jacobs, J.','1899','The story of geographical discovery'],
 ['evolucion','Evolución y selección natural',2009,'ciencia','Darwin, C.','1872','On the origin of species (6.ª ed.)'],
]
const clean=s=>s.replace(/\[Pg\s*\d+\]|\[p\.\s*\d+\]/g,'').replace(/\s+/g,' ').trim();const words=s=>(s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length
export async function paragraphs(id){const html=await fs.readFile(`scripts/reading-sources/pg${id}.html`,'utf8'),$=load(html);$('#pg-header,#pg-footer,.pg-boilerplate,.footnote,.footnotes,.pagenum,.pginternal,nav,table,script,style').remove();let heading='Texto',region='',paragraph=0,started=![45109,1497,8438,2680,1656,30775,53311,79044,13476,1225,60956,15663,6708,10992,14291,1174,43491,10615,56075,2009].includes(id);const rows=[];$('h1,h2,h3,h4,p').each((_,el)=>{const text=clean($(el).text());if(el.tagName!=='p'){if(/LIFE OF GALILEO/i.test(text))region='galileo';if(/LIFE OF TYCHO/i.test(text))region='tycho';if(/LIFE OF (JOHN )?KEPLER/i.test(text))region='kepler';if((id===53311&&/^CHAPTER I\./.test(text))||(id===79044&&/^PART I\. CHAPTER I\./.test(text))||(id===13476&&el.tagName==='h1'&&text==='EXPERIMENTS')||(id===1225&&text==='Chapter 1.')||(id===60956&&/^CHAPTER I /.test(text))||(id===15663&&text==='THE STORY OF ANCIENT EGYPT.')||(id===6708&&text==='CHAPTER I')||(id===10992&&text==='CHAPTER I.')||(id===14291&&/CHAPTER I$/.test(text))||(id===1174&&text==='BOOK I')||(id===10615&&/^BOOK I NEITHER/.test(text))||(id===56075&&text==='SENECA OF BENEFITS.')||(id===2009&&/^CHAPTER I\. VARIATION/.test(text))||(id===45109&&text==='THE ENCHIRIDION')||(id===1497&&text==='BOOK I.')||(id===8438&&text==='BOOK I')||(id===2680&&text==='HIS FIRST BOOK')||(id===1656&&el.tagName==='h2'&&text==='APOLOGY')||(id===30775&&text==='PREFACE OF THE AUTHOR.'))started=true;if(text&&text.length<260){heading=text;paragraph=0}return}paragraph++;if(id===43491&&text.startsWith('The hieroglyphic writing developed'))started=true;if(!started||words(text)<20||/project gutenberg|gutenberg.org|release date:|copyright|start of this|produced by/i.test(text))return;rows.push({text,heading,region,paragraph})});return {rows,hash:createHash('sha256').update(html).digest('hex')}}
await fs.mkdir('public/reading/texts',{recursive:true});const index=[],sources=[]
for(const [id,subject,book,topic,author,year,title,region] of subjects){const parsed=await paragraphs(book);let rows=parsed.rows.filter(p=>(!region||p.region===region)&&!/^preface$|^contents[.]?$|bibliography|dedication|introduction|^notes|^appendix|^glossary|^footnotes/i.test(p.heading));if(rows.length<20)throw Error('Insufficient material '+id+': '+rows.length)
 // Ten non-overlapping windows; all quoted paragraphs remain in source order.
 for(let episode=0;episode<10;episode++){const start=Math.floor(episode*rows.length/10),end=Math.floor((episode+1)*rows.length/10),available=rows.slice(start,end);let group=[],total=0;const target=400+episode*90;for(const p of available){group.push(p);total+=words(p.text);if(total>=target)break}if(total<250){for(const p of rows.slice(end)){group.push(p);total+=words(p.text);if(total>=250)break}}if(total<180)throw Error('Insufficient excerpt '+id)
 const paragraphs=group.map(p=>p.text),sourceUrl=`https://www.gutenberg.org/ebooks/${book}`,locator=`${group[0].heading}; fragmento que comienza «${group[0].text.split(/\s+/).slice(0,9).join(' ')}…»`
 const text={id:`${id}-${episode+1}`,title:`${subject} · Lectura ${episode+1}`,subject,topic,language:'en',kind:'cita',paragraphs,wordCount:words(paragraphs.join(' ')),level:Math.min(100,8+episode*8),citation:`${author} (${year}). ${title}. Project Gutenberg. ${sourceUrl}`,sourceUrl,locator,year,rights:'Edición histórica identificada por Project Gutenberg como dominio público en EE. UU.; se conserva el texto de la edición citada.',intro:topic==='historia'?'Fuente histórica: analiza quién escribe, cuándo y con qué perspectiva. Sus interpretaciones no equivalen por sí solas al consenso historiográfico actual.':'Documento histórico en su idioma de edición. Distingue lo que afirma el autor de las explicaciones y conocimientos actuales.',questions:[]}
 const file=`/reading/texts/${text.id}.json`;await fs.writeFile('public'+file,JSON.stringify(text));const {paragraphs:_,questions:__,...meta}=text;index.push({...meta,file,questionTypes:['evidencia','literal']})}
 sources.push({subject,sourceUrl:`https://www.gutenberg.org/ebooks/${book}`,author,year,title,sha256:parsed.hash})
}
await fs.writeFile('public/reading/index.json',JSON.stringify(index));await fs.writeFile('public/reading/sources.json',JSON.stringify(sources,null,2));console.log('Documentos',index.length,'Palabras',index.reduce((s,t)=>s+t.wordCount,0))
