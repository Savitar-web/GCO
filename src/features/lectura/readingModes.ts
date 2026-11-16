export const READING_MODES=[
 {id:'comprension',title:'Comprensión lectora',icon:'📚',description:'Ideas, detalles e inferencias con corrección razonada.'},
 {id:'ritmo',title:'Lectura contrarreloj',icon:'⏱',description:'Ajusta tu tiempo y comprueba qué has comprendido.'},
 {id:'bloques',title:'Lectura por bloques',icon:'⚡',description:'Grupos de palabras a ritmo regulable, seguidos de un examen.'},
 {id:'resistencia',title:'Resistencia lectora',icon:'🏔',description:'Extensión creciente, pausas conscientes y seguimiento del avance.'},
 {id:'inferencia',title:'Entre líneas',icon:'🔎',description:'Distingue lo que el texto implica de lo que sólo imaginas.'},
 {id:'ideas',title:'Idea esencial',icon:'💡',description:'Elige una síntesis fiel sin confundir tema, ejemplo y conclusión.'},
 {id:'orden',title:'Reconstruye el relato',icon:'🧩',description:'Recupera el orden de párrafos y sus relaciones.'},
 {id:'evidencia',title:'Encuentra la evidencia',icon:'📌',description:'Recupera detalles y vincula fragmentos con su contexto.'},
 {id:'lexico',title:'Léxico en contexto',icon:'🌱',description:'Aprende matices y recupera palabras con repaso espaciado.'},
 {id:'ortografia',title:'Ortografía consciente',icon:'✍',description:'Tildes, grafías y palabras que se confunden.'},
 {id:'puntuacion',title:'Puntuación con sentido',icon:'〰',description:'Descubre cómo los signos organizan y cambian el significado.'},
 {id:'critica',title:'Lectura crítica',icon:'⚖',description:'Fuentes, perspectiva, pruebas y límites de una interpretación.'},
] as const
export type ReadingMode=typeof READING_MODES[number]['id']
