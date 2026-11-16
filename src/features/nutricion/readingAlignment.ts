export type ReadingWord={text:string;start:number;end:number}
export function readingWords(text:string):ReadingWord[]{
 const clean=text.replace(/!\[[^\]]*\]\([^)]*\)/g,match=>' '.repeat(match.length))
 return [...clean.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(match=>({text:match[0].normalize('NFC').toLocaleLowerCase(),start:match.index!,end:match.index!+match[0].length}))
}
export function wordAt(words:ReadingWord[],position:number){let lo=0,hi=words.length;while(lo<hi){const mid=(lo+hi)>>1;if(words[mid].end<=position)lo=mid+1;else hi=mid}return Math.min(lo,Math.max(0,words.length-1))}
export function alignReadingWords(source:ReadingWord[],target:ReadingWord[],from=0):number[]{
 const result:number[]=[];let cursor=from
 for(let i=0;i<target.length;i++){
  let found=-1
  for(let j=cursor;j<Math.min(source.length,cursor+150);j++){
   if(source[j].text!==target[i].text)continue
   let agrees=true
   for(let k=1;k<Math.min(4,target.length-i,source.length-j);k++)if(source[j+k].text!==target[i+k].text){agrees=false;break}
   if(agrees){found=j;break}
  }
  if(found<0&&source[cursor]?.text===target[i].text)found=cursor
  result.push(found);if(found>=0)cursor=found+1
 }
 return result
}
export function documentWordRanges(doc:Document){
 const walker=doc.createTreeWalker(doc.body||doc.documentElement,NodeFilter.SHOW_TEXT),entries:{word:ReadingWord;range:Range}[]=[]
 let node:Node|null
 while((node=walker.nextNode())){
  if(node.parentElement?.closest('script,style,noscript,svg,[hidden]'))continue
  for(const word of readingWords(node.textContent||'')){
   const range=doc.createRange();range.setStart(node,word.start);range.setEnd(node,word.end);entries.push({word,range})
  }
 }
 return entries
}
