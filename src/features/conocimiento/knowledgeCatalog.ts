export const KNOWLEDGE_MODES=[
{id:'saber-reto',title:'Reto de conocimiento',icon:'✦',description:'Preguntas con contexto, cuatro opciones y explicación documentada.',kind:'quiz'},
{id:'saber-cronologia',title:'Cronologías',icon:'⌛',description:'Ordena acontecimientos y distingue fechas de procesos históricos.',kind:'timeline'},
{id:'saber-conexiones',title:'Conecta conceptos',icon:'⌘',description:'Relaciona términos y definiciones sin depender del orden visual.',kind:'match'},
{id:'saber-evocacion',title:'Recuperación activa',icon:'↗',description:'Recuerda la respuesta antes de verla; escribe y contrasta.',kind:'recall'},
{id:'saber-laboratorio',title:'Laboratorio aplicado',icon:'⚗',description:'Cálculos nuevos de ingeniería, agua, redes, matemáticas y empresa.',kind:'numeric'},
{id:'saber-casos',title:'Decisiones y casos',icon:'⚖',description:'Resuelve escenarios con supuestos explícitos y consecuencias.',kind:'case'},
{id:'saber-mitos',title:'Detecta el error',icon:'◈',description:'Evalúa afirmaciones y encuentra el matiz que cambia su validez.',kind:'myth'},
{id:'saber-certeza',title:'¿Cuánto lo sabes?',icon:'◎',description:'Contrasta tus aciertos con la seguridad de tus respuestas.',kind:'confidence'},
{id:'saber-examen',title:'Examen interdisciplinario',icon:'▤',description:'Una evaluación sin pistas, con tiempo regulable y revisión final.',kind:'exam'},
{id:'saber-repaso',title:'Repaso espaciado',icon:'↶',description:'Recupera errores y conceptos pendientes antes de avanzar.',kind:'review'},
{id:'saber-clasifica',title:'Clasifica y distingue',icon:'▦',description:'Organiza categorías que suelen confundirse y explica sus límites.',kind:'classify'},
{id:'saber-procesos',title:'Cómo funciona',icon:'⇢',description:'Reconstruye sistemas: del agua potable a una conexión a internet.',kind:'process'},
] as const
export type KnowledgeMode=typeof KNOWLEDGE_MODES[number]
export const DISCIPLINES=[
{id:'historia',name:'Historia mundial',icon:'🏛',description:'Fechas, fuentes, revoluciones y procesos; una fecha no explica por sí sola una guerra.'},
{id:'filosofia',name:'Filosofía y tomismo',icon:'🦉',description:'Argumentos, escuelas y textos. Distingue al Sócrates de Platón de una afirmación histórica directa.'},
{id:'metafisica',name:'Metafísica y lógica',icon:'∞',description:'Posibilidad, identidad, causalidad y los límites de lo que se sigue de una premisa.'},
{id:'astronomia',name:'Astronomía',icon:'🪐',description:'Planetas, descubrimientos y escalas del universo; observar no es siempre identificar.'},
{id:'fisica',name:'Física y medición',icon:'⚡',description:'Magnitudes, modelos, energía e interpretación de mediciones.'},
{id:'quimica',name:'Química',icon:'⚗',description:'Átomos, enlaces, equilibrio y conservación con condiciones explícitas.'},
{id:'biologia',name:'Biología y evolución',icon:'🧬',description:'Organización de la vida, herencia, selección y ecosistemas.'},
{id:'matematicas',name:'Matemáticas y estadística',icon:'∑',description:'Estructuras, probabilidad y razonamiento cuantitativo; más allá de memorizar fórmulas.'},
{id:'geografia',name:'Geografía y Tierra',icon:'🌍',description:'Escalas, mapas, placas, cuencas y relaciones entre territorio y sociedad.'},
{id:'economia',name:'Economía',icon:'↗',description:'Precios, moneda, incentivos y políticas. Evalúa mecanismos y condiciones, sin consignas.'},
{id:'empresa',name:'Empresa y administración',icon:'▥',description:'Costos, liquidez, decisiones, proyectos y organización del trabajo.'},
{id:'ingenieria',name:'Ingeniería y agua',icon:'⚙',description:'Caudales, energía, seguridad y servicios: del diseño a la operación.'},
{id:'internet',name:'Internet e informática',icon:'⌘',description:'Historia de computación, redes, protocolos y seguridad de los datos.'},
{id:'politica',name:'Política y gobiernos',icon:'⚖',description:'Instituciones, democracia y rendición de cuentas; describe sin imponer una preferencia.'},
{id:'derecho',name:'Derecho y ciudadanía',icon:'§',description:'Principios jurídicos y ejemplos constitucionales de México, con jurisdicción declarada.'},
{id:'singapur',name:'Singapur: historia y sistemas',icon:'🏙',description:'Independencia, instituciones, agua y política monetaria en su contexto.'},
] as const
export type Discipline=typeof DISCIPLINES[number]['id']
export type Source={id:string;author:string;year:string;title:string;url:string;locator?:string;checked:string}
export type Question={id:string;area:Discipline;title:string;prompt:string;options:string[];correct:number;explanation:string;source:string;level:number;kind:'fact'|'case';jurisdiction?:string;aliases?:string[]}
export type OrderedSet={id:string;area:Discipline;title:string;intro:string;items:{label:string;detail:string;sort:number}[];source:string;kind:'timeline'|'process'}
export type Myth={id:string;area:Discipline;claim:string;truth:boolean;explanation:string;source:string;level:number}
export type Classification={id:string;area:Discipline;title:string;categories:string[];items:{label:string;category:number;explanation:string}[];source:string}
export type KnowledgeBank={version:number;sources:Source[];questions:Question[];ordered:OrderedSet[];myths:Myth[];classifications:Classification[]}
