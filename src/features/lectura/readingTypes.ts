export type ReadingQuestion={id:string;type:'literal'|'inferencia'|'idea'|'evidencia'|'critica'|'lexico';prompt:string;options:string[];correct:number;explanation:string;evidence?:string}
export type ReadingText={id:string;title:string;subject:string;topic:string;language:'es'|'en';kind:'cita'|'original'|'adaptacion';paragraphs:string[];wordCount:number;level:number;citation:string;sourceUrl:string;locator:string;year:string;rights:string;questions:ReadingQuestion[];intro?:string;glossary?:{word:string;meaning:string;example:string}[]}
export type ReadingIndex=Omit<ReadingText,'paragraphs'|'questions'|'glossary'> & {file:string;questionTypes:string[];paragraphCount?:number}
export const countWords=(text:string)=>(text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length
