import fs from 'node:fs/promises';
await fs.mkdir('scripts/reading-sources',{recursive:true});
const ids=[53311,79044,13476,1225,2010,60956,25992,30775,1497,8438,59,3800,9662,5682,10615,45109,2680,5827,56075,1656,10992,15663,6708,43491,1174,14291,2009,2591,503,7439,1597,66688];
async function load(id){const path=`scripts/reading-sources/pg${id}.html`;let html;try{html=await fs.readFile(path,'utf8')}catch{const response=await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`);if(!response.ok){console.log(id,response.status);return}html=await response.text();await fs.writeFile(path,html)}const {load}=await import('cheerio');const $=load(html);console.log(id,$('title').text().replace(/\s+/g,' ').slice(0,125))}
for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(load));
