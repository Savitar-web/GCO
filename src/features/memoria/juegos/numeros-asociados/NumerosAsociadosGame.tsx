import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
  soundTick,
  soundMatch,
} from '@/core/audio/uiSounds'
import {
  generateChunkSequence,
  configFromLevel,
  emojiSequenceToSpeech,
  type ChunkSequence,
  type CharsetMode,
} from '../generateLevel'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

/* ─── Tipos ─────────────────────────────────────────────────────────────── */

type AppMode = 'menu' | 'chunks' | 'verbal' | 'typing' | 'palace'
type ChunkPhase = 'setup' | 'study' | 'recall'
type Lang = 'es' | 'en'
type PalacePhase = 'intro' | 'place' | 'countdown' | 'recall' | 'result'

const GAME_CAT = 'memoria' as const
const GAME_ID = 'numeros-asociados'
const VERBAL_ID = 'palabras-encadenadas'
const TYPING_ID = 'citando-al-citador'
const PALACE_ID = 'palacio-imaginario'
const VERBAL_BEST_KEY = 'gco:verbal-best'
const TYPING_BEST_KEY = 'gco:typing-best'
const TYPING_TILDES_KEY = 'gco:typing-tildes'
const PALACE_BEST_KEY = 'gco:palace-best'

const MODE_INFO: Record<
  Exclude<AppMode, 'menu'>,
  { title: string; emoji: string; desc: string }
> = {
  chunks: {
    title: 'Bloques de memoria',
    emoji: '🔢',
    desc: 'Recuerda combinaciones complejas con historias.',
  },
  verbal: {
    title: 'Palabras encadenadas',
    emoji: '📝',
    desc: '¿Ya viste esa palabra o es nueva?',
  },
  typing: {
    title: 'Citando al citador',
    emoji: '⌨️',
    desc: 'Escribe citas en tiempo récord (sin copiar).',
  },
  palace: {
    title: 'Palacio Imaginario',
    emoji: '🏰',
    desc: 'Entrena el Método de Loci (Palacio de la Memoria).',
  },
}

/* ─── Anti-selección / anti-copia ───────────────────────────────────────── */

const noSelectStyle: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  WebkitTouchCallout: 'none',
  cursor: 'default',
}

/** Handlers agresivos anti-selección / anti-copia / anti-menú de traducción */
const blockCopyHandlers = {
  onCopy: (e: React.ClipboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
  },
  onCut: (e: React.ClipboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
  },
  onContextMenu: (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  },
  onDragStart: (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  },
  onMouseDown: (e: React.MouseEvent) => {
    e.preventDefault()
  },
  onSelectStart: (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  },
  onPointerDown: (e: React.PointerEvent) => {
    // Bloquea el inicio de selección en la mayoría de navegadores
    e.preventDefault()
  },
}

/* ─── Palabras (verbal) ─────────────────────────────────────────────────── */

const WORDS_ES: string[] = [
  'agua','fuego','tierra','aire','sol','luna','estrella','nube','lluvia','viento',
  'montana','rio','lago','mar','oceano','playa','bosque','arbol','hoja','flor',
  'rosa','jardin','campo','ciudad','pueblo','casa','puerta','ventana','mesa','silla',
  'libro','pagina','palabra','idea','pensamiento','memoria','tiempo','espacio','luz','sombra',
  'color','blanco','negro','rojo','azul','verde','amarillo','naranja','violeta','musica',
  'ritmo','cancion','baile','teatro','cine','pintura','arte','ciencia','historia','filosofia',
  'fisica','quimica','biologia','corazon','cerebro','sangre','hueso','musculo','energia','fuerza',
  'velocidad','distancia','masa','peso','atomo','molecula','celula','planeta','cometa','galaxia',
  'universo','gravedad','orbita','satelite','cohete','reloj','minuto','hora','segundo','calendario',
  'ano','mes','dia','semana','manana','tarde','noche','comida','pan','leche','fruta','verdura',
  'carne','arroz','pasta','azucar','sal','animal','perro','gato','caballo','pajaro','pez',
  'leon','tigre','oso','lobo','aguila','delfin','trabajo','escuela','universidad','oficina',
  'hospital','mercado','tienda','calle','avenida','camino','puente','torre','castillo','iglesia',
  'museo','biblioteca','parque','familia','madre','padre','hijo','hija','hermano','hermana',
  'amigo','vecino','maestro','alumno','viaje','tren','avion','barco','bicicleta','coche',
  'camion','metro','autobus','taxi','alegria','tristeza','miedo','valor','esperanza','amor',
  'odio','calma','furia','tecnologia','computadora','telefono','pantalla','teclado','raton',
  'red','internet','datos','codigo','programa','algoritmo','sistema','proceso','disco','archivo',
  'carpeta','deporte','futbol','tenis','natacion','carrera','salto','naturaleza','planta','insecto',
  'semilla','raiz','tallo','clima','calor','frio','humedad','sequia','tormenta','nieve',
  'hielo','vapor','sociedad','ley','justicia','derecho','libertad','igualdad','democracia','poder',
  'economia','dinero','moneda','banco','credito','deuda','precio','salud','medico','enfermera',
  'clinica','vacuna','medicina','dolor','transporte','trafico','semaforo','carretera','autopista','estacion',
  'puerto','cultura','tradicion','costumbre','idioma','dialecto','acento','escritura','lectura','aunque',
  'porque','cuando','donde','quien','como','siempre','nunca','todavia','apenas','tambien',
  'solamente','realmente','probablemente','necesario','importante','dificil','facil','posible','imposible','cierto',
  'falso','verdadero','grande','pequeno','alto','bajo','largo','corto','ancho','estrecho',
  'fuerte','debil','rapido','lento','nuevo','viejo','joven','feliz','triste','serio',
  'alegre','tranquilo','nervioso','primero','segundo','tercero','ultimo','anterior','siguiente','cerca',
  'lejos','dentro','fuera','arriba','abajo','delante','detras','izquierda','derecha','centro',
  'medio','mitad','entero','numero','letra','cifra','signo','simbolo','marca','senal',
  'pista','rastro','huella','pensar','sentir','oir','ver','tocar','oler','gustar',
  'hablar','escuchar','escribir','leer','correr','saltar','caminar','nadar','volar','caer',
  'subir','bajar','entrar','salir','abrir','cerrar','comer','beber','dormir','despertar',
  'trabajar','estudiar','aprender','ensenar','buscar','encontrar','ganar','perder','empezar','terminar',
  'continuar','detener','cambiar','permanecer','mover','quedar','crear','destruir','construir','reparar',
  'mejorar','empeorar','aumentar','disminuir','crecer','nacer','morir','vivir','existir','aparecer',
  'desaparecer','comenzar','concluir','resolver','pregunta','respuesta','duda','certeza','verdad','mentira',
  'secreto','misterio','enigma','problema','solucion','error','acierto','exito','fracaso','victoria',
  'derrota','esfuerzo','paciencia','prisa','urgencia','peligro','seguridad','riesgo','oportunidad','decision',
  'eleccion','opcion','alternativa','posibilidad','probabilidad','olvido','recuerdo','imagen','vision','sueno',
  'pesadilla','conciencia','atencion','concentracion','confusion','claridad','inteligencia','sabiduria','conocimiento','ignorancia',
  'experiencia','aprendizaje','talento','habilidad','capacidad','destreza','maestria','principiante','experto','campeon',
  'aficionado','profesional','amateur','practica','entrenamiento','disciplina','objetivo','meta','proposito','intencion',
  'motivo','razon','causa','efecto','consecuencia','origen','destino','principio','final','conclusion',
  'introduccion','capitulo','parrafo','oracion','frase','verbo','sustantivo','adjetivo','adverbio','sujeto',
  'predicado','objeto','plato','vaso','taza','cuchara','tenedor','cuchillo','olla','sarten',
  'horno','nevera','lavadora','sofa','almohada','manta','sabana','espejo','cepillo','jabon',
  'toalla','champu','peine','tijera','aguja','hilo','boton','camisa','pantalon','falda',
  'vestido','abrigo','chaqueta','zapato','bota','sandalia','calcetin','guante','bufanda','gorro',
  'sombrero','gafas','anillo','collar','pulsera','monedero','cartera','mochila','maleta','paraguas',
  'llave','candado','cadena','cuerda','cinta','papel','carton','plastico','vidrio','metal',
  'madera','piedra','arena','barro','cemento','ladrillo','teja','clavo','tornillo','martillo',
  'sierra','taladro','brocha','rodillo','escalera','grua','tractor','helicoptero','submarino','velero',
  'canoa','kayak','patinete','esquies','paracaidas','globo','misil','tanque','espada','escudo',
  'armadura','casco','lanza','arco','flecha','ballesta','catapulta','muralla','foso','porton',
  'amanecer','atardecer','horizonte','brujula','mapa','tesoro','aventura','leyenda','mito','heroe',
  'villano','dragon','castillo','princesa','caballero','magia','hechizo','pocion','cristal','diamante',
  'esmeralda','zafiro','rubi','perla','oro','plata','bronce','cobre','hierro','acero',
]

const WORDS_EN: string[] = [
  'water','fire','earth','air','sun','moon','star','cloud','rain','wind',
  'mountain','river','lake','sea','ocean','beach','forest','tree','leaf','flower',
  'rose','garden','field','city','town','house','door','window','table','chair',
  'book','page','word','idea','thought','memory','time','space','light','shadow',
  'color','white','black','red','blue','green','yellow','orange','purple','music',
  'rhythm','song','dance','theater','cinema','painting','art','science','history','philosophy',
  'physics','chemistry','biology','heart','brain','blood','bone','muscle','energy','force',
  'speed','distance','mass','weight','atom','molecule','cell','planet','comet','galaxy',
  'universe','gravity','orbit','satellite','rocket','clock','minute','hour','second','calendar',
  'year','month','day','week','morning','afternoon','night','food','bread','milk',
  'fruit','vegetable','meat','rice','pasta','sugar','salt','animal','dog','cat',
  'horse','bird','fish','lion','tiger','bear','wolf','eagle','dolphin','work',
  'school','university','office','hospital','market','shop','street','avenue','path','bridge',
  'tower','castle','church','museum','library','park','family','mother','father','son',
  'daughter','brother','sister','friend','neighbor','teacher','student','travel','train','plane',
  'boat','bicycle','car','truck','subway','bus','taxi','joy','sadness','fear',
  'courage','hope','love','hate','calm','anger','technology','computer','phone','screen',
  'keyboard','mouse','network','internet','data','code','program','algorithm','system','process',
  'disk','file','folder','sport','soccer','tennis','swimming','race','jump','nature',
  'plant','insect','seed','root','stem','climate','heat','cold','humidity','drought',
  'storm','snow','ice','steam','society','law','justice','right','freedom','equality',
  'democracy','power','economy','money','currency','bank','credit','debt','price','health',
  'doctor','nurse','clinic','vaccine','medicine','pain','transport','traffic','highway','station',
  'port','culture','tradition','custom','language','dialect','accent','writing','reading','although',
  'because','when','where','who','how','always','never','still','almost','also',
  'only','really','probably','necessary','important','difficult','easy','possible','impossible','certain',
  'false','true','large','small','tall','short','long','wide','narrow','strong',
  'weak','fast','slow','new','old','young','happy','sad','serious','cheerful',
  'quiet','nervous','first','second','third','last','previous','next','near','far',
  'inside','outside','above','below','front','back','left','right','center','middle',
  'half','whole','number','letter','digit','sign','symbol','mark','signal','clue',
  'track','trail','think','feel','hear','see','touch','smell','taste','speak',
  'listen','write','read','run','walk','swim','fly','fall','climb','enter',
  'exit','open','close','eat','drink','sleep','wake','study','learn','teach',
  'search','find','win','lose','start','finish','continue','stop','change','remain',
  'move','stay','create','destroy','build','repair','improve','worsen','increase','decrease',
  'grow','born','die','live','exist','appear','disappear','begin','conclude','solve',
  'question','answer','doubt','certainty','truth','lie','secret','mystery','enigma','problem',
  'solution','error','success','failure','victory','defeat','effort','patience','hurry','urgency',
  'danger','safety','risk','opportunity','decision','choice','option','alternative','possibility','probability',
  'forgetfulness','recollection','image','vision','dream','nightmare','awareness','attention','concentration','distraction',
  'confusion','clarity','intelligence','wisdom','knowledge','ignorance','experience','learning','talent','skill',
  'capacity','ability','mastery','beginner','expert','champion','amateur','professional','practice','training',
  'discipline','goal','purpose','intention','motive','reason','cause','effect','consequence','origin',
  'destiny','principle','final','beginning','conclusion','introduction','epilogue','chapter','paragraph','sentence',
  'phrase','verb','noun','adjective','adverb','subject','predicate','object','plate','glass',
  'cup','spoon','fork','knife','pot','pan','oven','fridge','sofa','pillow',
  'blanket','mirror','brush','soap','towel','shampoo','comb','scissors','needle','thread',
  'button','shirt','pants','skirt','dress','coat','jacket','shoe','boot','sandal',
  'sock','glove','scarf','hat','glasses','ring','necklace','bracelet','wallet','backpack',
  'suitcase','umbrella','key','lock','chain','rope','tape','paper','cardboard','plastic',
  'metal','wood','stone','sand','mud','cement','brick','tile','nail','screw',
  'hammer','saw','drill','ladder','crane','tractor','helicopter','submarine','sailboat','canoe',
  'kayak','scooter','skis','parachute','balloon','missile','tank','sword','shield','armor',
  'helmet','spear','bow','arrow','catapult','wall','moat','gate','dawn','dusk',
  'horizon','compass','map','treasure','adventure','legend','myth','hero','villain','dragon',
  'princess','knight','magic','spell','potion','crystal','diamond','emerald','sapphire','ruby',
  'pearl','gold','silver','bronze','copper','iron','steel','forest','meadow','valley',
]

/* ─── Citas tipográficas (APA) – originales + ampliadas hasta 150 ──────── */

type QuoteItem = {
  level: number
  lang: Lang
  text: string
  source: string
}

const QUOTES: QuoteItem[] = [
  // ES 1–20
  { level: 1, lang: 'es', text: 'El cielo es azul porque la luz del sol se dispersa en el aire.', source: 'NASA. (n.d.). Why is the sky blue?' },
  { level: 2, lang: 'es', text: 'Solo sé que no sé nada.', source: 'Platón. (ca. 399 a. C.). Apología de Sócrates.' },
  { level: 3, lang: 'es', text: 'Pienso, luego existo.', source: 'Descartes, R. (1637). Discurso del método.' },
  { level: 4, lang: 'es', text: 'La educación es el arma más poderosa que puedes usar para cambiar el mundo.', source: 'Mandela, N. (1990). Discurso.' },
  { level: 5, lang: 'es', text: 'No es la especie más fuerte la que sobrevive, sino la que mejor se adapta.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 6, lang: 'es', text: 'La gravedad no es una fuerza misteriosa que tira de los objetos: es la curvatura del espacio y el tiempo causada por la masa.', source: 'Einstein, A. (1915). Relatividad general.' },
  { level: 7, lang: 'es', text: 'El agua cubre la mayor parte de la Tierra, pero el agua dulce accesible es una fracción minúscula de todo el planeta.', source: 'USGS. (n.d.). How much water is there on Earth?' },
  { level: 8, lang: 'es', text: 'La Luna no tiene atmósfera densa; por eso el cielo lunar es negro incluso de día y las huellas de los astronautas pueden durar millones de años.', source: 'NASA. (1969). Apollo mission reports.' },
  { level: 9, lang: 'es', text: 'Aristóteles sostuvo que el conocimiento empieza en los sentidos y que la virtud se adquiere con el hábito, no solo con la teoría.', source: 'Aristóteles. (ca. 350 a. C.). Ética a Nicómaco.' },
  { level: 10, lang: 'es', text: 'Newton formuló que la misma fuerza que hace caer una manzana mantiene a la Luna en su órbita alrededor de la Tierra.', source: 'Newton, I. (1687). Philosophiae Naturalis Principia Mathematica.' },
  { level: 11, lang: 'es', text: 'El ADN almacena instrucciones en una doble hélice; su descubrimiento unió biología, química y física en una sola historia de la vida.', source: 'Watson, J., y Crick, F. (1953). Nature.' },
  { level: 12, lang: 'es', text: 'Nietzsche escribió que quien tiene un porqué para vivir puede soportar casi cualquier cómo; el sentido sostiene la voluntad.', source: 'Nietzsche, F. (1889). Crepúsculo de los ídolos.' },
  { level: 13, lang: 'es', text: 'Cuando los astronautas del Apolo 11 pisaron la Luna, no solo cumplieron una meta técnica: demostraron que la ciencia, la ingeniería y la cooperación pueden llevar a la humanidad más allá de su planeta de origen.', source: 'NASA. (1969). Apollo 11 Mission Report.' },
  { level: 14, lang: 'es', text: 'La fotosíntesis convierte la luz del sol en energía química. Sin ese proceso, la mayoría de las cadenas alimentarias de la Tierra colapsarían y el oxígeno que respiramos sería escaso.', source: 'National Geographic. (n.d.). Photosynthesis explained.' },
  { level: 15, lang: 'es', text: 'Sócrates no dejó textos propios. Lo que sabemos de su método viene de Platón: preguntar sin cesar, examinar las definiciones y preferir la honestidad intelectual a la opinión cómoda.', source: 'Platón. (ca. 399 a. C.). Diálogos socráticos.' },
  { level: 16, lang: 'es', text: 'El teorema de Pitágoras relaciona los lados de un triángulo rectángulo. Aunque se asocia a un nombre, culturas anteriores ya usaban relaciones equivalentes en mediciones y construcciones.', source: 'Historia de las matemáticas. (n.d.). Teorema de Pitágoras.' },
  { level: 17, lang: 'es', text: 'La teoría de la evolución no dice que el azar lo explique todo. Dice que la variación heredable y la selección a lo largo del tiempo producen adaptaciones que parecen diseñadas, sin necesidad de un diseñador.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 18, lang: 'es', text: 'En el vacío del espacio no hay aire que transmita el sonido. Por eso una explosión real en el espacio sería silenciosa para un observador cercano, aunque la luz de la explosión sí viajaría.', source: 'NASA. (n.d.). Sound in space.' },
  { level: 19, lang: 'es', text: 'Aristóteles distinguió entre potencia y acto: lo que algo puede llegar a ser y lo que ya es. Esa distinción influyó siglos de metafísica y sigue alimentando debates sobre cambio e identidad.', source: 'Aristóteles. (ca. 350 a. C.). Metafísica.' },
  { level: 20, lang: 'es', text: 'La misión Apolo no fue un salto improvisado. Fue el resultado de décadas de física orbital, materiales nuevos, computación primitiva y un esfuerzo colectivo que convirtió ecuaciones en naves capaces de ir y volver de otro mundo.', source: 'NASA. (1969–1972). Apollo program documentation.' },

  // EN 1–20
  { level: 1, lang: 'en', text: 'The sky looks blue because sunlight scatters in the air.', source: 'NASA. (n.d.). Why is the sky blue?' },
  { level: 2, lang: 'en', text: 'I know that I know nothing.', source: 'Plato. (c. 399 BCE). Apology of Socrates.' },
  { level: 3, lang: 'en', text: 'I think, therefore I am.', source: 'Descartes, R. (1637). Discourse on the Method.' },
  { level: 4, lang: 'en', text: 'Education is the most powerful weapon which you can use to change the world.', source: 'Mandela, N. (1990). Speech.' },
  { level: 5, lang: 'en', text: 'It is not the strongest species that survives, but the one most responsive to change.', source: 'Darwin, C. (1859). On the Origin of Species.' },
  { level: 6, lang: 'en', text: 'Gravity is not a mysterious pull: mass curves space and time, and that curvature guides motion.', source: 'Einstein, A. (1915). General relativity.' },
  { level: 7, lang: 'en', text: 'Most of Earth is covered by water, yet accessible fresh water is only a tiny fraction of the planet.', source: 'USGS. (n.d.). How much water is there on Earth?' },
  { level: 8, lang: 'en', text: 'The Moon has almost no atmosphere, so the lunar sky stays black even in daylight.', source: 'NASA. (1969). Apollo mission reports.' },
  { level: 9, lang: 'en', text: 'Aristotle held that knowledge begins in the senses and that virtue grows through habit, not theory alone.', source: 'Aristotle. (c. 350 BCE). Nicomachean Ethics.' },
  { level: 10, lang: 'en', text: 'Newton argued that the force that drops an apple also keeps the Moon in orbit around the Earth.', source: 'Newton, I. (1687). Principia Mathematica.' },
  { level: 11, lang: 'en', text: 'DNA stores instructions in a double helix, joining biology, chemistry, and physics into one story of life.', source: 'Watson, J., & Crick, F. (1953). Nature.' },
  { level: 12, lang: 'en', text: 'Nietzsche wrote that those who have a why to live can bear almost any how.', source: 'Nietzsche, F. (1889). Twilight of the Idols.' },
  { level: 13, lang: 'en', text: 'When Apollo 11 astronauts stepped on the Moon, they showed that science, engineering, and cooperation can take humanity beyond its home planet.', source: 'NASA. (1969). Apollo 11 Mission Report.' },
  { level: 14, lang: 'en', text: 'Photosynthesis turns sunlight into chemical energy. Without it, most food chains would collapse and breathable oxygen would be scarce.', source: 'National Geographic. (n.d.). Photosynthesis explained.' },
  { level: 15, lang: 'en', text: 'Socrates left no writings of his own. What we know of his method comes from Plato: relentless questions and a preference for honest inquiry.', source: 'Plato. (c. 399 BCE). Socratic dialogues.' },
  { level: 16, lang: 'en', text: 'The Pythagorean theorem links the sides of a right triangle. Similar relations were used in measurement long before the famous name.', source: 'History of mathematics. (n.d.). Pythagorean theorem.' },
  { level: 17, lang: 'en', text: 'Evolution by natural selection does not claim that chance explains everything. It claims that heritable variation and selection produce adaptations over time.', source: 'Darwin, C. (1859). On the Origin of Species.' },
  { level: 18, lang: 'en', text: 'In the vacuum of space there is no air to carry sound, so a real explosion would be silent to a nearby observer even as its light travels outward.', source: 'NASA. (n.d.). Sound in space.' },
  { level: 19, lang: 'en', text: 'Aristotle distinguished potentiality from actuality: what something can become and what it already is. That distinction shaped centuries of metaphysics.', source: 'Aristotle. (c. 350 BCE). Metaphysics.' },
  { level: 20, lang: 'en', text: 'Apollo was not an improvised leap. It was decades of orbital physics, new materials, early computing, and collective effort that turned equations into ships that could leave and return.', source: 'NASA. (1969–1972). Apollo program documentation.' },

  // ES 21–50
  { level: 21, lang: 'es', text: 'La entropía de un sistema aislado tiende a aumentar: el desorden térmico crece y no todo proceso es reversible sin costo energético.', source: 'Clausius, R. (1865). Sobre la segunda ley de la termodinámica.' },
  { level: 22, lang: 'es', text: 'El principio de incertidumbre de Heisenberg afirma que no se puede conocer con precisión arbitraria la posición y el momento de una partícula al mismo tiempo.', source: 'Heisenberg, W. (1927). Zeitschrift für Physik.' },
  { level: 23, lang: 'es', text: 'La relatividad especial muestra que el tiempo no es absoluto: dos observadores en movimiento relativo miden intervalos distintos entre los mismos sucesos.', source: 'Einstein, A. (1905). Sobre la electrodinámica de los cuerpos en movimiento.' },
  { level: 24, lang: 'es', text: 'Las placas tectónicas se mueven sobre el manto; los terremotos y volcanes se concentran en sus bordes, donde la corteza se crea o se destruye.', source: 'USGS. (n.d.). Plate tectonics.' },
  { level: 25, lang: 'es', text: 'La selección natural no busca el progreso: conserva variantes que, en un entorno dado, dejan más descendientes. El contexto ecológico define qué es ventajoso.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 26, lang: 'es', text: 'El modelo estándar de partículas describe quarks, leptones y bosones mediadores, pero no incluye la materia oscura ni una teoría cuántica completa de la gravedad.', source: 'CERN. (n.d.). The Standard Model.' },
  { level: 27, lang: 'es', text: 'La fotosíntesis oxigénica cambió la atmósfera primitiva: los organismos que liberaban oxígeno transformaron el planeta y abrieron paso a la respiración aeróbica.', source: 'National Geographic. (n.d.). The oxygen revolution.' },
  { level: 28, lang: 'es', text: 'Un agujero negro no es un sumidero cósmico mágico: es una región donde la curvatura del espacio tiempo es tan extrema que ni la luz puede escapar del horizonte de sucesos.', source: 'NASA. (n.d.). Black holes.' },
  { level: 29, lang: 'es', text: 'La epigenética muestra que el ambiente puede influir en la expresión génica sin cambiar la secuencia del ADN, modulando qué genes se leen en cada contexto.', source: 'NIH. (n.d.). Epigenetics.' },
  { level: 30, lang: 'es', text: 'La computación cuántica explota superposición y entrelazamiento para abordar problemas que escalan mal en computadoras clásicas, aunque el ruido y la decoherencia limitan aún su uso práctico.', source: 'IBM Quantum. (n.d.). What is quantum computing?' },
  { level: 31, lang: 'es', text: 'El fondo cósmico de microondas es la radiación residual del Big Bang. Su temperatura casi uniforme, con pequeñas fluctuaciones, revela las semillas de las galaxias que vemos hoy.', source: 'NASA. (n.d.). Cosmic Microwave Background.' },
  { level: 32, lang: 'es', text: 'Kant argumentó que el espacio y el tiempo son formas a priori de la sensibilidad humana: no son cosas en sí, sino condiciones que hacen posible nuestra experiencia del mundo.', source: 'Kant, I. (1781). Crítica de la razón pura.' },
  { level: 33, lang: 'es', text: 'La luz se comporta a la vez como onda y como partícula. El experimento de la doble rendija muestra interferencia incluso cuando los fotones se envían de uno en uno, revelando la naturaleza cuántica de la realidad.', source: 'Feynman, R. (1965). The Feynman Lectures on Physics.' },
  { level: 34, lang: 'es', text: 'La Tierra no es un sistema cerrado: recibe energía del Sol y emite calor al espacio. Ese flujo permite que la vida mantenga estructuras ordenadas lejos del equilibrio termodinámico.', source: 'Schrödinger, E. (1944). What is Life?' },
  { level: 35, lang: 'es', text: 'Hume señaló que nunca observamos la conexión necesaria entre causa y efecto, solo la sucesión regular de eventos. Nuestra idea de causalidad nace del hábito, no de una intuición lógica pura.', source: 'Hume, D. (1748). An Enquiry Concerning Human Understanding.' },
  { level: 36, lang: 'es', text: 'Las estrellas fabrican elementos pesados mediante fusión nuclear. Cuando explotan como supernovas, dispersan carbono, oxígeno y hierro que luego forman planetas y, eventualmente, organismos vivos.', source: 'NASA. (n.d.). Stellar nucleosynthesis.' },
  { level: 37, lang: 'es', text: 'El teorema de Gödel demuestra que en cualquier sistema formal suficientemente potente hay proposiciones verdaderas que no pueden demostrarse dentro del propio sistema. La completitud lógica tiene límites.', source: 'Gödel, K. (1931). Über formal unentscheidbare Sätze.' },
  { level: 38, lang: 'es', text: 'La materia oscura no emite ni absorbe luz, pero su gravedad mantiene unidas a las galaxias. Sin ella, las estrellas exteriores se dispersarían; su naturaleza sigue siendo uno de los grandes misterios de la física.', source: 'CERN. (n.d.). Dark matter.' },
  { level: 39, lang: 'es', text: 'Wittgenstein escribió que los límites de mi lenguaje significan los límites de mi mundo. Lo que no puede decirse con claridad, según él, debe pasarse en silencio, aunque eso no niega su existencia.', source: 'Wittgenstein, L. (1921). Tractatus Logico-Philosophicus.' },
  { level: 40, lang: 'es', text: 'La tectónica de placas explica no solo terremotos y volcanes, sino también la distribución de fósiles y la formación de montañas. Los continentes se mueven a velocidades comparables al crecimiento de las uñas.', source: 'USGS. (n.d.). Plate tectonics overview.' },
  { level: 41, lang: 'es', text: 'La conciencia sigue siendo un problema difícil: sabemos correlatos neuronales de la atención y la percepción, pero no cómo la actividad electroquímica produce la experiencia subjetiva en primera persona.', source: 'Chalmers, D. (1995). Facing up to the problem of consciousness.' },
  { level: 42, lang: 'es', text: 'El principio de exclusión de Pauli impide que dos fermiones ocupen el mismo estado cuántico. Gracias a él, los electrones se organizan en capas y la materia sólida no colapsa sobre sí misma.', source: 'Pauli, W. (1925). Zeitschrift für Physik.' },
  { level: 43, lang: 'es', text: 'La selección sexual, como la natural, modela rasgos que no siempre maximizan la supervivencia individual. Colores brillantes o cantos elaborados pueden aumentar el éxito reproductivo a costa de un mayor riesgo.', source: 'Darwin, C. (1871). The Descent of Man.' },
  { level: 44, lang: 'es', text: 'El horizonte de sucesos de un agujero negro no es una superficie material: es el límite a partir del cual ninguna señal puede escapar hacia el exterior. Desde fuera, el colapso parece ralentizarse y congelarse.', source: 'Hawking, S. (1988). A Brief History of Time.' },
  { level: 45, lang: 'es', text: 'La filosofía de la ciencia de Popper sostiene que una teoría es científica solo si puede ser falseada. La confirmación acumulada no basta; el riesgo de ser refutada es lo que da fuerza empírica.', source: 'Popper, K. (1934). The Logic of Scientific Discovery.' },
  { level: 46, lang: 'es', text: 'La energía oscura parece acelerar la expansión del universo. Su naturaleza es desconocida, pero las observaciones de supernovas lejanas y del fondo cósmico sugieren que domina el contenido energético actual.', source: 'NASA. (n.d.). Dark energy.' },
  { level: 47, lang: 'es', text: 'Las redes neuronales artificiales se inspiran en el cerebro, pero operan con matemáticas de optimización. Aprenden representaciones a partir de datos, sin que nosotros programemos cada regla explícitamente.', source: 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature.' },
  { level: 48, lang: 'es', text: 'El tiempo geológico revela que la vida ha sufrido varias extinciones masivas. La recuperación de la biodiversidad después de cada crisis muestra tanto la fragilidad como la resiliencia de los ecosistemas.', source: 'Raup, D. M., & Sepkoski, J. J. (1982). Science.' },
  { level: 49, lang: 'es', text: 'La relatividad general predice que la luz se curva cerca de masas grandes. El eclipse de 1919 confirmó esa predicción y convirtió a Einstein en una figura pública de la ciencia.', source: 'Dyson, F. W., Eddington, A. S., & Davidson, C. (1920). Philosophical Transactions.' },
  { level: 50, lang: 'es', text: 'La ética de la virtud de Aristóteles no se centra solo en reglas o consecuencias, sino en el carácter: la persona virtuosa actúa bien porque ha cultivado hábitos que alinean emoción, razón y acción.', source: 'Aristóteles. (ca. 350 a. C.). Ética a Nicómaco.' },

  // EN 21–50
  { level: 21, lang: 'en', text: 'The entropy of an isolated system tends to increase: thermal disorder grows and not every process is reversible without an energy cost.', source: 'Clausius, R. (1865). On the second law of thermodynamics.' },
  { level: 22, lang: 'en', text: 'Heisenberg uncertainty states that position and momentum of a particle cannot both be known to arbitrary precision at the same time.', source: 'Heisenberg, W. (1927). Zeitschrift für Physik.' },
  { level: 23, lang: 'en', text: 'Special relativity shows that time is not absolute: two observers in relative motion measure different intervals between the same events.', source: 'Einstein, A. (1905). On the electrodynamics of moving bodies.' },
  { level: 24, lang: 'en', text: 'Tectonic plates move over the mantle; earthquakes and volcanoes cluster at their edges, where crust is created or destroyed.', source: 'USGS. (n.d.). Plate tectonics.' },
  { level: 25, lang: 'en', text: 'Natural selection does not aim at progress: it keeps variants that leave more offspring in a given environment. Ecology defines what is advantageous.', source: 'Darwin, C. (1859). On the Origin of Species.' },
  { level: 26, lang: 'en', text: 'The Standard Model describes quarks, leptons, and force carriers, but it does not include dark matter or a full quantum theory of gravity.', source: 'CERN. (n.d.). The Standard Model.' },
  { level: 27, lang: 'en', text: 'Oxygenic photosynthesis changed the early atmosphere: organisms that released oxygen transformed the planet and enabled aerobic respiration.', source: 'National Geographic. (n.d.). The oxygen revolution.' },
  { level: 28, lang: 'en', text: 'A black hole is not a magical cosmic drain: it is a region where spacetime curvature is so extreme that light cannot escape the event horizon.', source: 'NASA. (n.d.). Black holes.' },
  { level: 29, lang: 'en', text: 'Epigenetics shows that the environment can influence gene expression without changing DNA sequence, modulating which genes are read in each context.', source: 'NIH. (n.d.). Epigenetics.' },
  { level: 30, lang: 'en', text: 'Quantum computing exploits superposition and entanglement for problems that scale poorly on classical machines, though noise and decoherence still limit practical use.', source: 'IBM Quantum. (n.d.). What is quantum computing?' },
  { level: 31, lang: 'en', text: 'The cosmic microwave background is residual radiation from the Big Bang. Its nearly uniform temperature, with tiny fluctuations, reveals the seeds of the galaxies we see today.', source: 'NASA. (n.d.). Cosmic Microwave Background.' },
  { level: 32, lang: 'en', text: 'Kant argued that space and time are a priori forms of human sensibility: not things in themselves, but conditions that make our experience of the world possible.', source: 'Kant, I. (1781). Critique of Pure Reason.' },
  { level: 33, lang: 'en', text: 'Light behaves as both wave and particle. The double-slit experiment shows interference even when photons are sent one by one, revealing the quantum nature of reality.', source: 'Feynman, R. (1965). The Feynman Lectures on Physics.' },
  { level: 34, lang: 'en', text: 'Earth is not a closed system: it receives energy from the Sun and radiates heat to space. That flow allows life to maintain ordered structures far from thermodynamic equilibrium.', source: 'Schrödinger, E. (1944). What is Life?' },
  { level: 35, lang: 'en', text: 'Hume noted that we never observe a necessary connection between cause and effect, only the regular succession of events. Our idea of causality arises from habit, not pure logical insight.', source: 'Hume, D. (1748). An Enquiry Concerning Human Understanding.' },
  { level: 36, lang: 'en', text: 'Stars forge heavy elements through nuclear fusion. When they explode as supernovae, they scatter carbon, oxygen and iron that later form planets and, eventually, living organisms.', source: 'NASA. (n.d.). Stellar nucleosynthesis.' },
  { level: 37, lang: 'en', text: 'Gödel’s theorem shows that in any sufficiently powerful formal system there are true propositions that cannot be proved within the system itself. Logical completeness has limits.', source: 'Gödel, K. (1931). On formally undecidable propositions.' },
  { level: 38, lang: 'en', text: 'Dark matter neither emits nor absorbs light, yet its gravity holds galaxies together. Without it, outer stars would fly apart; its nature remains one of the great mysteries of physics.', source: 'CERN. (n.d.). Dark matter.' },
  { level: 39, lang: 'en', text: 'Wittgenstein wrote that the limits of my language mean the limits of my world. What cannot be said clearly, he held, must be passed over in silence, though that does not deny its existence.', source: 'Wittgenstein, L. (1921). Tractatus Logico-Philosophicus.' },
  { level: 40, lang: 'en', text: 'Plate tectonics explains not only earthquakes and volcanoes but also fossil distributions and mountain building. Continents move at speeds comparable to the growth of fingernails.', source: 'USGS. (n.d.). Plate tectonics overview.' },
  { level: 41, lang: 'en', text: 'Consciousness remains a hard problem: we know neural correlates of attention and perception, but not how electrochemical activity produces subjective first-person experience.', source: 'Chalmers, D. (1995). Facing up to the problem of consciousness.' },
  { level: 42, lang: 'en', text: 'The Pauli exclusion principle prevents two fermions from occupying the same quantum state. Because of it, electrons arrange in shells and solid matter does not collapse on itself.', source: 'Pauli, W. (1925). Zeitschrift für Physik.' },
  { level: 43, lang: 'en', text: 'Sexual selection, like natural selection, shapes traits that do not always maximise individual survival. Bright colours or elaborate songs can increase reproductive success at greater risk.', source: 'Darwin, C. (1871). The Descent of Man.' },
  { level: 44, lang: 'en', text: 'The event horizon of a black hole is not a material surface: it is the boundary beyond which no signal can escape outward. From outside, collapse appears to slow and freeze.', source: 'Hawking, S. (1988). A Brief History of Time.' },
  { level: 45, lang: 'en', text: 'Popper’s philosophy of science holds that a theory is scientific only if it can be falsified. Accumulated confirmation is not enough; the risk of refutation gives empirical force.', source: 'Popper, K. (1934). The Logic of Scientific Discovery.' },
  { level: 46, lang: 'en', text: 'Dark energy appears to accelerate the expansion of the universe. Its nature is unknown, but observations of distant supernovae and the cosmic background suggest it dominates today’s energy content.', source: 'NASA. (n.d.). Dark energy.' },
  { level: 47, lang: 'en', text: 'Artificial neural networks are inspired by the brain but operate with optimisation mathematics. They learn representations from data without us programming every rule explicitly.', source: 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature.' },
  { level: 48, lang: 'en', text: 'Geological time shows that life has suffered several mass extinctions. The recovery of biodiversity after each crisis reveals both the fragility and the resilience of ecosystems.', source: 'Raup, D. M., & Sepkoski, J. J. (1982). Science.' },
  { level: 49, lang: 'en', text: 'General relativity predicts that light bends near large masses. The 1919 eclipse confirmed that prediction and turned Einstein into a public figure of science.', source: 'Dyson, F. W., Eddington, A. S., & Davidson, C. (1920). Philosophical Transactions.' },
  { level: 50, lang: 'en', text: 'Aristotle’s virtue ethics focuses not only on rules or consequences but on character: the virtuous person acts well because habits have aligned emotion, reason and action.', source: 'Aristotle. (c. 350 BCE). Nicomachean Ethics.' },

  // ES 51–110 (selección representativa + ampliación)
  { level: 51, lang: 'es', text: 'La radiación de Hawking sugiere que los agujeros negros no son completamente negros: emiten partículas térmicas debidas a efectos cuánticos cerca del horizonte, y con el tiempo podrían evaporarse.', source: 'Hawking, S. (1975). Particle creation by black holes. Communications in Mathematical Physics.' },
  { level: 60, lang: 'es', text: 'El calentamiento global observado desde el siglo XX se atribuye principalmente al aumento de gases de efecto invernadero por actividades humanas. El consenso científico se basa en múltiples líneas independientes de evidencia.', source: 'IPCC. (2021). Climate Change 2021: The Physical Science Basis.' },
  { level: 70, lang: 'es', text: 'La filosofía de la mente enfrenta el problema de la intencionalidad: cómo estados físicos pueden ser acerca de algo. Las representaciones mentales parecen apuntar a objetos y propiedades fuera de sí mismas.', source: 'Brentano, F. (1874). Psychology from an Empirical Standpoint.' },
  { level: 80, lang: 'es', text: 'La química prebiótica investiga cómo moléculas orgánicas simples pudieron originar sistemas autorreplicativos. Experimentos tipo Miller-Urey muestran rutas posibles, aunque el camino completo sigue abierto.', source: 'Miller, S. L. (1953). Science.' },
  { level: 90, lang: 'es', text: 'La fenomenología de Husserl busca describir la experiencia tal como se presenta, suspendiendo supuestos sobre la existencia del mundo externo. La intencionalidad de la conciencia es su tema central.', source: 'Husserl, E. (1913). Ideas pertaining to a pure phenomenology.' },
  { level: 100, lang: 'es', text: 'La pregunta por el sentido del universo no tiene respuesta científica única. La física describe cómo evolucionan las estructuras; el significado que les atribuimos pertenece al ámbito de la experiencia humana y la ética.', source: 'Weinberg, S. (1977). The First Three Minutes.' },
  { level: 110, lang: 'es', text: 'La última pregunta abierta de la física fundamental es cómo reconciliar la relatividad general con la mecánica cuántica en un marco coherente. Hasta entonces, el universo en sus extremos más densos y tempranos permanece parcialmente opaco a nuestra comprensión.', source: 'Rovelli, C. (2017). Reality Is Not What It Seems.' },

  // EN 51–110
  { level: 51, lang: 'en', text: 'Hawking radiation suggests black holes are not completely black: they emit thermal particles due to quantum effects near the horizon and may eventually evaporate.', source: 'Hawking, S. (1975). Particle creation by black holes. Communications in Mathematical Physics.' },
  { level: 60, lang: 'en', text: 'Observed global warming since the twentieth century is attributed mainly to the rise of greenhouse gases from human activities. Scientific consensus rests on multiple independent lines of evidence.', source: 'IPCC. (2021). Climate Change 2021: The Physical Science Basis.' },
  { level: 70, lang: 'en', text: 'Philosophy of mind faces the problem of intentionality: how physical states can be about something. Mental representations seem to point to objects and properties outside themselves.', source: 'Brentano, F. (1874). Psychology from an Empirical Standpoint.' },
  { level: 80, lang: 'en', text: 'Prebiotic chemistry investigates how simple organic molecules could give rise to self-replicating systems. Miller-Urey-type experiments show possible routes, though the full path remains open.', source: 'Miller, S. L. (1953). Science.' },
  { level: 90, lang: 'en', text: 'Husserl’s phenomenology seeks to describe experience as it presents itself, suspending assumptions about the existence of the external world. The intentionality of consciousness is its central theme.', source: 'Husserl, E. (1913). Ideas pertaining to a pure phenomenology.' },
  { level: 100, lang: 'en', text: 'The question of the universe’s meaning has no single scientific answer. Physics describes how structures evolve; the significance we attribute to them belongs to the realm of human experience and ethics.', source: 'Weinberg, S. (1977). The First Three Minutes.' },
  { level: 110, lang: 'en', text: 'The ultimate open question of fundamental physics is how to reconcile general relativity with quantum mechanics in a coherent framework. Until then, the universe at its densest and earliest extremes remains partially opaque to our understanding.', source: 'Rovelli, C. (2017). Reality Is Not What It Seems.' },

  // NUEVAS 111–150 ES (memoria + loci + ciencia cognitiva)
  { level: 111, lang: 'es', text: 'La memoria de trabajo mantiene temporalmente la información que usamos para razonar y decidir. Su capacidad limitada explica por qué las listas largas se fragmentan con facilidad.', source: 'Baddeley, A. (2000). The episodic buffer. Trends in Cognitive Sciences.' },
  { level: 112, lang: 'es', text: 'El olvido no siempre es un fallo: a veces es una forma de priorizar. El cerebro elimina o debilita rastros poco usados para conservar recursos.', source: 'Schacter, D. L. (2001). The Seven Sins of Memory.' },
  { level: 113, lang: 'es', text: 'Los recuerdos no se recuperan como archivos intactos. Cada evocación puede modificarlos; el acto de recordar es también un acto de reconstrucción.', source: 'Loftus, E. F. (2005). Planting misinformation in the human mind.' },
  { level: 114, lang: 'es', text: 'El método de loci aprovecha la memoria espacial, una de las más robustas del cerebro humano, para anclar información abstracta en lugares imaginarios.', source: 'Yates, F. A. (1966). The Art of Memory.' },
  { level: 115, lang: 'es', text: 'Dormir consolida recuerdos. Durante el sueño de ondas lentas y el REM se reactivan patrones neuronales y se fortalecen conexiones relevantes.', source: 'Diekelmann, S., & Born, J. (2010). Nature Reviews Neuroscience.' },
  { level: 116, lang: 'es', text: 'La atención es el portero de la memoria. Sin atención sostenida, la codificación es superficial y el recuerdo posterior se vuelve frágil.', source: 'Craik, F. I. M., & Lockhart, R. S. (1972). Levels of processing.' },
  { level: 117, lang: 'es', text: 'Los campeones de memoria no suelen tener cerebros extraordinarios; usan técnicas sistemáticas de codificación y recuperación deliberada.', source: 'Ericsson, K. A. (2006). The Cambridge Handbook of Expertise.' },
  { level: 118, lang: 'es', text: 'La repetición espaciada supera a la repetición masiva. Distribuir el estudio en el tiempo produce retención más duradera.', source: 'Ebbinghaus, H. (1885). Über das Gedächtnis.' },
  { level: 119, lang: 'es', text: 'El efecto de generación muestra que producir activamente una respuesta fortalece el recuerdo más que solo leerla.', source: 'Slamecka, N. J., & Graf, P. (1978). Journal of Experimental Psychology.' },
  { level: 120, lang: 'es', text: 'Las emociones intensas dejan huellas más nítidas, pero también pueden distorsionar detalles periféricos del evento.', source: 'McGaugh, J. L. (2004). The amygdala and emotional memory.' },
  { level: 121, lang: 'es', text: 'El hipocampo es crucial para formar recuerdos episódicos nuevos. Su daño produce amnesia anterógrada característica.', source: 'Squire, L. R. (1992). Psychological Review.' },
  { level: 122, lang: 'es', text: 'La práctica de recuperación (testing effect) es una de las estrategias más eficaces para aprender a largo plazo.', source: 'Roediger, H. L., & Karpicke, J. D. (2006). Psychological Science.' },
  { level: 123, lang: 'es', text: 'Visualizar con detalle sensorial —colores, texturas, olores— hace que las imágenes mentales se agarren mejor a la memoria.', source: 'Paivio, A. (1986). Mental Representations.' },
  { level: 124, lang: 'es', text: 'El chunking convierte elementos sueltos en unidades significativas. Así la memoria de trabajo puede manejar más información.', source: 'Miller, G. A. (1956). The magical number seven. Psychological Review.' },
  { level: 125, lang: 'es', text: 'Los mnemotécnicos no sustituyen la comprensión; amplifican la capacidad de almacenar y recuperar datos concretos.', source: 'Bellezza, F. S. (1981). Mnemonic devices. Review of Educational Research.' },
  { level: 126, lang: 'es', text: 'La interferencia proactiva y retroactiva explica por qué materiales similares se confunden entre sí con el tiempo.', source: 'Underwood, B. J. (1957). Psychological Review.' },
  { level: 127, lang: 'es', text: 'Entrenar la atención plena puede reducir la deriva mental y mejorar la codificación de experiencias presentes.', source: 'Jha, A. P. et al. (2007). Cognitive, Affective, & Behavioral Neuroscience.' },
  { level: 128, lang: 'es', text: 'Los relatos autobiográficos se reescriben a lo largo de la vida; el yo narrativo selecciona y organiza el pasado.', source: 'McAdams, D. P. (2001). The psychology of life stories.' },
  { level: 129, lang: 'es', text: 'La memoria prospectiva nos permite recordar hacer algo en el futuro. Fallos en ella son frecuentes y costosos.', source: 'Einstein, G. O., & McDaniel, M. A. (2005). Prospective memory.' },
  { level: 130, lang: 'es', text: 'El arte de la memoria clásico unía retórica y arquitectura mental: oradores griegos y romanos caminaban por edificios imaginarios para recuperar discursos enteros.', source: 'Cicero. (55 a. C.). De oratore.' },
  { level: 131, lang: 'es', text: 'La plasticidad sináptica es la base biológica del aprendizaje: las conexiones se fortalecen o debilitan según el uso.', source: 'Hebb, D. O. (1949). The Organization of Behavior.' },
  { level: 132, lang: 'es', text: 'Un palacio de la memoria efectivo usa rutas familiares, imágenes vívidas y exageradas, y un orden fijo de recorrido.', source: 'Foer, J. (2011). Moonwalking with Einstein.' },
  { level: 133, lang: 'es', text: 'Los competidores de memoria moderna siguen usando variantes del método de loci descrito hace más de dos mil años.', source: 'World Memory Championships. (n.d.). Official techniques overview.' },
  { level: 134, lang: 'es', text: 'La codificación elaborativa conecta lo nuevo con lo ya conocido; cuanto más rico el enlace, mejor el recuerdo.', source: 'Craik, F. I. M., & Tulving, E. (1975). Journal of Experimental Psychology.' },
  { level: 135, lang: 'es', text: 'Practicar en condiciones variadas mejora la transferencia: el cerebro se vuelve flexible ante contextos nuevos.', source: 'Schmidt, R. A., & Bjork, R. A. (1992). Psychological Science.' },
  { level: 136, lang: 'es', text: 'La memoria semántica almacena hechos y conceptos; la episódica guarda eventos situados en tiempo y lugar.', source: 'Tulving, E. (1972). Organization of Memory.' },
  { level: 137, lang: 'es', text: 'El efecto de superioridad de la imagen muestra que las imágenes se recuerdan mejor que las palabras abstractas.', source: 'Paivio, A. (1971). Imagery and Verbal Processes.' },
  { level: 138, lang: 'es', text: 'Para construir un palacio: elige un lugar conocido, define una ruta clara, coloca imágenes absurdas y repasa el camino mentalmente.', source: 'Buzan, T. (2006). The Memory Book.' },
  { level: 139, lang: 'es', text: 'La ciencia actual confirma que el método de loci activa redes espaciales del cerebro y mejora el rendimiento en tareas de memoria serial.', source: 'Maguire, E. A. et al. (2003). Nature Neuroscience.' },
  { level: 140, lang: 'es', text: 'Usos profesionales históricos: oradores, actores de teatro clásico, médicos que memorizaban listas de síntomas y estudiantes de derecho romano.', source: 'Carruthers, M. (1990). The Book of Memory.' },
  { level: 141, lang: 'es', text: 'El método de loci sigue siendo una de las técnicas más potentes para memorizar discursos, listas y datos estructurados en el siglo XXI.', source: 'Foer, J. (2011). Moonwalking with Einstein.' },
  { level: 142, lang: 'es', text: 'La recuperación espaciada y el testing effect combinados producen ganancias de retención superiores a la relectura pasiva.', source: 'Roediger, H. L., & Karpicke, J. D. (2006). Psychological Science.' },
  { level: 143, lang: 'es', text: 'Las imágenes mentales absurdas y emocionales se recuerdan mejor porque activan más redes neuronales y destacan frente a lo cotidiano.', source: 'Paivio, A. (1986). Mental Representations.' },
  { level: 144, lang: 'es', text: 'Entrenar el palacio de la memoria mejora no solo la memoria de listas, sino también la capacidad de organización espacial interna.', source: 'Maguire, E. A. et al. (2003). Nature Neuroscience.' },
  { level: 145, lang: 'es', text: 'Los oradores antiguos consideraban la memoria una de las cinco partes de la retórica, junto con invención, disposición, elocución y acción.', source: 'Cicero. (55 a. C.). De oratore.' },
  { level: 146, lang: 'es', text: 'Hoy el método de loci se usa en educación, actuación, oposiciones y competiciones internacionales de memoria.', source: 'World Memory Championships. (n.d.).' },
  { level: 147, lang: 'es', text: 'La clave del éxito con loci es la consistencia del recorrido y la vividez de las asociaciones, no la complejidad del edificio mental.', source: 'Yates, F. A. (1966). The Art of Memory.' },
  { level: 148, lang: 'es', text: 'Dormir después de una sesión de loci consolida las rutas espaciales y las imágenes asociadas.', source: 'Diekelmann, S., & Born, J. (2010). Nature Reviews Neuroscience.' },
  { level: 149, lang: 'es', text: 'El olvido es selectivo: lo que no se usa ni se reconsolida tiende a debilitarse, liberando recursos para lo relevante.', source: 'Schacter, D. L. (2001). The Seven Sins of Memory.' },
  { level: 150, lang: 'es', text: 'El método de loci demuestra que la memoria humana es altamente entrenable cuando se aprovechan sus puntos fuertes espaciales y visuales.', source: 'Ericsson, K. A. (2006). The Cambridge Handbook of Expertise.' },

  // NUEVAS 111–150 EN
  { level: 111, lang: 'en', text: 'Working memory temporarily holds information we use to reason and decide. Its limited capacity explains why long lists fragment easily.', source: 'Baddeley, A. (2000). The episodic buffer. Trends in Cognitive Sciences.' },
  { level: 112, lang: 'en', text: 'Forgetting is not always a failure: sometimes it is prioritisation. The brain weakens rarely used traces to conserve resources.', source: 'Schacter, D. L. (2001). The Seven Sins of Memory.' },
  { level: 113, lang: 'en', text: 'Memories are not retrieved as intact files. Each recollection can modify them; the act of remembering is also an act of reconstruction.', source: 'Loftus, E. F. (2005). Planting misinformation in the human mind.' },
  { level: 114, lang: 'en', text: 'The method of loci harnesses spatial memory, one of the most robust systems in the human brain, to anchor abstract information in imaginary places.', source: 'Yates, F. A. (1966). The Art of Memory.' },
  { level: 115, lang: 'en', text: 'Sleep consolidates memories. During slow-wave and REM sleep, neural patterns are reactivated and relevant connections strengthened.', source: 'Diekelmann, S., & Born, J. (2010). Nature Reviews Neuroscience.' },
  { level: 116, lang: 'en', text: 'Attention is the gatekeeper of memory. Without sustained attention, encoding is shallow and later recall becomes fragile.', source: 'Craik, F. I. M., & Lockhart, R. S. (1972). Levels of processing.' },
  { level: 117, lang: 'en', text: 'Memory champions rarely have extraordinary brains; they use systematic techniques of encoding and deliberate retrieval.', source: 'Ericsson, K. A. (2006). The Cambridge Handbook of Expertise.' },
  { level: 118, lang: 'en', text: 'Spaced repetition outperforms massed practice. Distributing study over time produces more durable retention.', source: 'Ebbinghaus, H. (1885). Memory: A Contribution to Experimental Psychology.' },
  { level: 119, lang: 'en', text: 'The generation effect shows that actively producing a response strengthens memory more than merely reading it.', source: 'Slamecka, N. J., & Graf, P. (1978). Journal of Experimental Psychology.' },
  { level: 120, lang: 'en', text: 'Intense emotions leave sharper traces, yet they can also distort peripheral details of the event.', source: 'McGaugh, J. L. (2004). The amygdala and emotional memory.' },
  { level: 121, lang: 'en', text: 'The hippocampus is crucial for forming new episodic memories. Damage to it produces characteristic anterograde amnesia.', source: 'Squire, L. R. (1992). Psychological Review.' },
  { level: 122, lang: 'en', text: 'Retrieval practice (the testing effect) is among the most effective strategies for long-term learning.', source: 'Roediger, H. L., & Karpicke, J. D. (2006). Psychological Science.' },
  { level: 123, lang: 'en', text: 'Detailed sensory visualisation — colours, textures, smells — makes mental images stick more firmly in memory.', source: 'Paivio, A. (1986). Mental Representations.' },
  { level: 124, lang: 'en', text: 'Chunking turns loose items into meaningful units. Working memory can thereby handle more information.', source: 'Miller, G. A. (1956). The magical number seven. Psychological Review.' },
  { level: 125, lang: 'en', text: 'Mnemonics do not replace understanding; they amplify the capacity to store and retrieve concrete data.', source: 'Bellezza, F. S. (1981). Mnemonic devices. Review of Educational Research.' },
  { level: 126, lang: 'en', text: 'Proactive and retroactive interference explain why similar materials become confused over time.', source: 'Underwood, B. J. (1957). Psychological Review.' },
  { level: 127, lang: 'en', text: 'Mindfulness training can reduce mind-wandering and improve encoding of present experiences.', source: 'Jha, A. P. et al. (2007). Cognitive, Affective, & Behavioral Neuroscience.' },
  { level: 128, lang: 'en', text: 'Autobiographical narratives are rewritten across a lifetime; the narrative self selects and organises the past.', source: 'McAdams, D. P. (2001). The psychology of life stories.' },
  { level: 129, lang: 'en', text: 'Prospective memory allows us to remember to do something in the future. Failures in it are common and costly.', source: 'Einstein, G. O., & McDaniel, M. A. (2005). Prospective memory.' },
  { level: 130, lang: 'en', text: 'The classical art of memory united rhetoric and mental architecture: Greek and Roman orators walked through imaginary buildings to recover entire speeches.', source: 'Cicero. (55 BCE). De oratore.' },
  { level: 131, lang: 'en', text: 'Synaptic plasticity is the biological basis of learning: connections strengthen or weaken according to use.', source: 'Hebb, D. O. (1949). The Organization of Behavior.' },
  { level: 132, lang: 'en', text: 'An effective memory palace uses familiar routes, vivid exaggerated images, and a fixed order of travel.', source: 'Foer, J. (2011). Moonwalking with Einstein.' },
  { level: 133, lang: 'en', text: 'Modern memory competitors still use variants of the method of loci described more than two thousand years ago.', source: 'World Memory Championships. (n.d.). Official techniques overview.' },
  { level: 134, lang: 'en', text: 'Elaborative encoding links the new to the known; the richer the link, the better the later recall.', source: 'Craik, F. I. M., & Tulving, E. (1975). Journal of Experimental Psychology.' },
  { level: 135, lang: 'en', text: 'Practising under varied conditions improves transfer: the brain becomes flexible across new contexts.', source: 'Schmidt, R. A., & Bjork, R. A. (1992). Psychological Science.' },
  { level: 136, lang: 'en', text: 'Semantic memory stores facts and concepts; episodic memory holds events situated in time and place.', source: 'Tulving, E. (1972). Organization of Memory.' },
  { level: 137, lang: 'en', text: 'The picture-superiority effect shows that images are remembered better than abstract words.', source: 'Paivio, A. (1971). Imagery and Verbal Processes.' },
  { level: 138, lang: 'en', text: 'To build a palace: choose a known place, define a clear route, place absurd images, and mentally walk the path.', source: 'Buzan, T. (2006). The Memory Book.' },
  { level: 139, lang: 'en', text: 'Current science confirms that the method of loci activates spatial networks in the brain and improves serial memory performance.', source: 'Maguire, E. A. et al. (2003). Nature Neuroscience.' },
  { level: 140, lang: 'en', text: 'Historical professional uses: orators, classical actors, physicians memorising symptom lists, and students of Roman law.', source: 'Carruthers, M. (1990). The Book of Memory.' },
  { level: 141, lang: 'en', text: 'The method of loci remains one of the most powerful techniques for memorising speeches, lists and structured data in the twenty-first century.', source: 'Foer, J. (2011). Moonwalking with Einstein.' },
  { level: 142, lang: 'en', text: 'Spaced retrieval and the testing effect together produce retention gains superior to passive rereading.', source: 'Roediger, H. L., & Karpicke, J. D. (2006). Psychological Science.' },
  { level: 143, lang: 'en', text: 'Absurd and emotional mental images are remembered better because they activate more neural networks and stand out from the everyday.', source: 'Paivio, A. (1986). Mental Representations.' },
  { level: 144, lang: 'en', text: 'Training the memory palace improves not only list memory but also internal spatial organisation capacity.', source: 'Maguire, E. A. et al. (2003). Nature Neuroscience.' },
  { level: 145, lang: 'en', text: 'Ancient orators considered memory one of the five parts of rhetoric, along with invention, arrangement, style and delivery.', source: 'Cicero. (55 BCE). De oratore.' },
  { level: 146, lang: 'en', text: 'Today the method of loci is used in education, acting, competitive examinations and international memory competitions.', source: 'World Memory Championships. (n.d.).' },
  { level: 147, lang: 'en', text: 'The key to success with loci is consistency of the route and vividness of associations, not the complexity of the mental building.', source: 'Yates, F. A. (1966). The Art of Memory.' },
  { level: 148, lang: 'en', text: 'Sleeping after a loci session consolidates the spatial routes and the associated images.', source: 'Diekelmann, S., & Born, J. (2010). Nature Reviews Neuroscience.' },
  { level: 149, lang: 'en', text: 'Forgetting is selective: what is neither used nor reconsolidated tends to weaken, freeing resources for what matters.', source: 'Schacter, D. L. (2001). The Seven Sins of Memory.' },
  { level: 150, lang: 'en', text: 'The method of loci demonstrates that human memory is highly trainable when its spatial and visual strengths are leveraged.', source: 'Ericsson, K. A. (2006). The Cambridge Handbook of Expertise.' },
]

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function loadBest(key: string): number {
  try {
    return Math.max(0, parseInt(localStorage.getItem(key) || '0', 10) || 0)
  } catch {
    return 0
  }
}
function saveBest(key: string, n: number) {
  localStorage.setItem(key, String(n))
}
function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === '1'
  } catch {
    return fallback
  }
}
function saveBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* noop */
  }
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function compareChars(
  input: string,
  target: string,
  isEmoji: boolean
): { ch: string; ok: boolean | null }[] {
  const a = isEmoji ? input.replace(/\s/g, '') : input.replace(/[\s\-_/|.]/g, '').toUpperCase()
  const b = isEmoji ? target : target.toUpperCase()
  const max = Math.max(a.length, b.length)
  const out: { ch: string; ok: boolean | null }[] = []
  for (let i = 0; i < max; i++) {
    const ic = a[i]
    const tc = b[i]
    if (ic == null) {
      out.push({ ch: tc, ok: false })
    } else if (tc == null) {
      out.push({ ch: ic, ok: false })
    } else {
      out.push({ ch: ic, ok: ic === tc })
    }
  }
  return out
}

function stripAcutes(text: string): string {
  return text.normalize('NFD').replace(/\u0301/g, '').normalize('NFC')
}

function quoteDisplayText(q: QuoteItem, withTildes: boolean): string {
  if (q.lang !== 'es') return q.text
  return withTildes ? q.text : stripAcutes(q.text)
}

/* ─── Datos Palacio Imaginario ──────────────────────────────────────────── */

const PALACE_ROOMS = [
  { id: 'entrada', name: 'Entrada / Vestíbulo', emoji: '🚪' },
  { id: 'salon', name: 'Salón principal', emoji: '🛋️' },
  { id: 'cocina', name: 'Cocina', emoji: '🍳' },
  { id: 'pasillo', name: 'Pasillo largo', emoji: '🛤️' },
  { id: 'biblioteca', name: 'Biblioteca', emoji: '📚' },
  { id: 'jardin', name: 'Jardín', emoji: '🌳' },
  { id: 'escalera', name: 'Escalera', emoji: '🪜' },
  { id: 'azotea', name: 'Azotea / Terraza', emoji: '🏙️' },
  { id: 'sotano', name: 'Sótano', emoji: '🔦' },
  { id: 'bano', name: 'Baño', emoji: '🛁' },
  { id: 'dormitorio', name: 'Dormitorio', emoji: '🛏️' },
  { id: 'oficina', name: 'Oficina / Estudio', emoji: '🖥️' },
  { id: 'garaje', name: 'Garaje', emoji: '🚗' },
  { id: 'balcon', name: 'Balcón', emoji: '🪟' },
  { id: 'despensa', name: 'Despensa', emoji: '🥫' },
  { id: 'atico', name: 'Ático', emoji: '📦' },
  { id: 'invernadero', name: 'Invernadero', emoji: '🌿' },
  { id: 'piscina', name: 'Piscina / Patio', emoji: '🏊' },
  { id: 'chimenea', name: 'Sala de chimenea', emoji: '🔥' },
  { id: 'laboratorio', name: 'Laboratorio', emoji: '🧪' },
]

const PALACE_ITEMS = [
  'manzana roja brillante', 'reloj de arena gigante', 'gato con sombrero', 'libro volando',
  'llave dorada', 'vela encendida', 'espejo roto', 'trompeta dorada', 'pez en una pecera',
  'sombrero de mago', 'botella de poción', 'mapa antiguo', 'diamante flotante', 'silla rota',
  'globo terráqueo', 'taza de café humeante', 'paraguas abierto', 'linterna', 'pluma estilográfica',
  'dado de seis caras', 'campana', 'escoba voladora', 'retrato parlante', 'caja de música',
  'dragón miniatura', 'corona de oro', 'calavera brillante', 'reloj de bolsillo', 'botella de vino antigua',
  'pistola de agua', 'globo de nieve', 'cactus parlante', 'sartén voladora', 'pelota de fútbol ardiendo',
  'teléfono de disco', 'máquina de escribir', 'farol de gas', 'brújula oxidada', 'ancla pequeña',
  'trompeta de circo', 'muñeca de porcelana', 'caja fuerte abierta', 'serpiente de juguete', 'globo aerostático',
  'bastón de mago', 'cristal de cuarzo', 'pluma de pavo real', 'reloj de cuco', 'estatua de buda',
  'camaleón arcoíris', 'telescopio dorado', 'piano de cola miniatura', 'silla eléctrica de juguete', 'nube de algodón',
  'rayo embotellado', 'huevo de dragón', 'máscara veneciana', 'candado oxidado', 'pergamino enrollado',
  'botella de genio', 'espejo mágico', 'alfombra voladora enrollada', 'cristal de bola', 'vara de sauce',
  'gafas de sol gigantes', 'zapatos rojos de tacón', 'sombrero de copa', 'maletín de médico', 'trompeta de caza',
  'faro en miniatura', 'barco en una botella', 'esqueleto de pez', 'corazón de cristal', 'luna creciente',
  'sol sonriente', 'estrella fugaz', 'cometa de papel', 'trompo giratorio', 'yoyo brillante',
  'marioneta de madera', 'caja de pandora', 'llave inglesa dorada', 'martillo de juguete', 'sierra cantarina',
  'taladro volador', 'escalera de caracol miniatura', 'puente colgante', 'torre Eiffel de madera', 'pirámide de cristal',
]

/* ─── Componente principal ──────────────────────────────────────────────── */

export function NumerosAsociadosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const defaultLevel = Math.max(1, progress.highestLevel + 1)

  const [appMode, setAppMode] = useState<AppMode>('menu')
  const [menuPick, setMenuPick] = useState<Exclude<AppMode, 'menu'>>('chunks')

  /* chunks */
  const [totalChars, setTotalChars] = useState(12)
  const [blockSize, setBlockSize] = useState(3)
  const [charset, setCharset] = useState<CharsetMode>('digits')
  const [useProgressive, setUseProgressive] = useState(false)
  const [useTimer, setUseTimer] = useState(false)
  const [level, setLevel] = useState(defaultLevel)
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [phase, setPhase] = useState<ChunkPhase>('setup')
  const [sequence, setSequence] = useState<ChunkSequence | null>(null)
  const [story, setStory] = useState('')
  const [hidden, setHidden] = useState(false)
  const [recallInput, setRecallInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [charVerdict, setCharVerdict] = useState<{ ch: string; ok: boolean | null }[] | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastTimeMs, setLastTimeMs] = useState<number | null>(null)
  const [beatBest, setBeatBest] = useState(false)

  /* verbal */
  const [verbalLang, setVerbalLang] = useState<Lang>('es')
  const [verbalScore, setVerbalScore] = useState(0)
  const [verbalStrikes, setVerbalStrikes] = useState(0)
  const [verbalWord, setVerbalWord] = useState('')
  const [verbalSeen, setVerbalSeen] = useState<Set<string>>(() => new Set())
  const [verbalIsNew, setVerbalIsNew] = useState(true)
  const [verbalBest, setVerbalBest] = useState(() => loadBest(VERBAL_BEST_KEY))
  const [verbalRoundBest, setVerbalRoundBest] = useState(0)
  const [verbalPlaying, setVerbalPlaying] = useState(false)
  const [verbalFeedback, setVerbalFeedback] = useState<'ok' | 'fail' | null>(null)
  const [verbalTarget, setVerbalTarget] = useState(0)
  const [showVerbalLevels, setShowVerbalLevels] = useState(false)
  const verbalSeed = useRef(Date.now())

  /* typing */
  const [typingLang, setTypingLang] = useState<Lang>('es')
  const [typingLevel, setTypingLevel] = useState(1)
  const [typingInput, setTypingInput] = useState('')
  const [typingErrors, setTypingErrors] = useState(0)
  const [typingStarted, setTypingStarted] = useState(false)
  const [typingDone, setTypingDone] = useState(false)
  const [typingFailed, setTypingFailed] = useState(false)
  const [typingMs, setTypingMs] = useState(0)
  const [typingBest, setTypingBest] = useState(() => loadBest(TYPING_BEST_KEY))
  const [showTypingLevels, setShowTypingLevels] = useState(false)
  const [tildesOn, setTildesOn] = useState(() => loadBool(TYPING_TILDES_KEY, true))
  const typingStartRef = useRef<number | null>(null)
  const typingTimerRef = useRef<number | null>(null)
  const typingErrorsRef = useRef(0)
  const typingPrevRef = useRef('')

  /* palace */
  const [palacePhase, setPalacePhase] = useState<PalacePhase>('intro')
  const [palaceLevel, setPalaceLevel] = useState(1)
  const [palaceItems, setPalaceItems] = useState<string[]>([])
  const [palacePlacements, setPalacePlacements] = useState<Record<string, string>>({})
  const [palaceRecallOrder, setPalaceRecallOrder] = useState<string[]>([])
  const [palaceScore, setPalaceScore] = useState(0)
  const [palaceBest, setPalaceBest] = useState(() => loadBest(PALACE_BEST_KEY))
  const [palaceCountdown, setPalaceCountdown] = useState(10)
  const [palacePlaceMs, setPalacePlaceMs] = useState(0)
  const [palaceGrade, setPalaceGrade] = useState<string | null>(null)
  const palacePlaceStartRef = useRef<number | null>(null)
  const palaceCountdownRef = useRef<number | null>(null)

  const timerRef = useRef<number | null>(null)
  const runTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [phase, progress.highestLevel, progress.totalCompleted]
  )

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  const clearRunTimer = () => {
    if (runTimerRef.current != null) {
      window.clearInterval(runTimerRef.current)
      runTimerRef.current = null
    }
  }
  const startRunTimer = () => {
    clearRunTimer()
    startedAtRef.current = performance.now()
    setElapsedMs(0)
    runTimerRef.current = window.setInterval(() => {
      if (startedAtRef.current == null) return
      setElapsedMs(Math.round(performance.now() - startedAtRef.current))
    }, 200)
  }
  const stopRunTimer = (): number => {
    clearRunTimer()
    const t =
      startedAtRef.current != null
        ? Math.round(performance.now() - startedAtRef.current)
        : elapsedMs
    startedAtRef.current = null
    setElapsedMs(t)
    return t
  }

  useEffect(
    () => () => {
      clearTimer()
      clearRunTimer()
      if (typingTimerRef.current) window.clearInterval(typingTimerRef.current)
      if (palaceCountdownRef.current) window.clearInterval(palaceCountdownRef.current)
    },
    []
  )

  /* ── Chunks ── */
  const generate = useCallback(
    (lv = level) => {
      soundStart()
      clearTimer()
      clearRunTimer()
      setLastTimeMs(null)
      setBeatBest(false)
      setElapsedMs(0)
      setCharVerdict(null)

      const config = useProgressive
        ? configFromLevel(lv)
        : {
            totalChars: clamp(totalChars, 1, 32),
            blockSize: clamp(blockSize, 1, 6),
            charset,
          }
      if (config.blockSize > config.totalChars) config.blockSize = config.totalChars
      if (useProgressive) config.charset = 'digits'

      const seq = generateChunkSequence(config)
      setSequence(seq)
      setStory('')
      setHidden(false)
      setRecallInput('')
      setIsCorrect(null)
      setPhase('study')
    },
    [useProgressive, level, totalChars, blockSize, charset]
  )

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-ES'
    u.rate = 0.9
    window.speechSynthesis.speak(u)
  }

  const speakBlocks = () => {
    soundClick()
    if (!sequence) return
    if (sequence.config.charset === 'emojis') speak(emojiSequenceToSpeech(sequence.raw))
    else speak(sequence.blocks.join(' · '))
  }

  const speakStory = () => {
    soundClick()
    if (!story.trim()) return
    speak(story.trim())
  }

  const goToRecall = () => {
    soundClick()
    setHidden(true)
    setPhase('recall')
    setRecallInput('')
    setIsCorrect(null)
    setCharVerdict(null)
    startRunTimer()
    if (useTimer && sequence) {
      const sec = Math.min(120, Math.max(20, sequence.config.totalChars * 4))
      setTimeLeft(sec)
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearTimer()
            const ms = stopRunTimer()
            soundFail()
            setIsCorrect(false)
            if (sequence) {
              const isEmoji = sequence.config.charset === 'emojis'
              setCharVerdict(compareChars('', sequence.raw, isEmoji))
            }
            if (useProgressive) {
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: ms,
              })
            }
            return 0
          }
          const next = t - 1
          soundTick(next <= 10)
          return next
        })
      }, 1000)
    } else setTimeLeft(0)
  }

  const checkRecall = () => {
    if (!sequence) return
    if (useTimer && timeLeft <= 0 && isCorrect === false) return
    clearTimer()
    const timeMs = stopRunTimer()
    const isEmoji = sequence.config.charset === 'emojis'
    const verdict = compareChars(recallInput, sequence.raw, isEmoji)
    setCharVerdict(verdict)
    const ok =
      verdict.length > 0 &&
      verdict.every((v) => v.ok === true) &&
      (isEmoji
        ? recallInput.replace(/\s/g, '') === sequence.raw
        : recallInput.replace(/[\s\-_/|.]/g, '').toUpperCase() === sequence.raw.toUpperCase())
    setIsCorrect(ok)
    if (ok) {
      soundSuccess()
      if (useProgressive) {
        const prevBest = getLevelBestTime(GAME_CAT, GAME_ID, level)
        const isNew = timeMs > 0 && (prevBest == null || timeMs < prevBest)
        setBeatBest(!!isNew)
        setLastTimeMs(timeMs)
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: true,
          timeMs,
        })
      } else {
        setLastTimeMs(timeMs)
        setBeatBest(false)
      }
    } else {
      soundFail()
      setLastTimeMs(timeMs)
      setBeatBest(false)
      if (useProgressive) {
        recordLevelResult({
          categoryId: GAME_CAT,
          gameId: GAME_ID,
          level,
          success: false,
          timeMs,
        })
      }
    }
  }

  const nextProgressive = () => {
    soundClick()
    clearTimer()
    clearRunTimer()
    const next = level + 1
    setLevel(next)
    generate(next)
  }

  const progressivePreview = configFromLevel(level)
  const slowerThanBest =
    useProgressive &&
    bestForLevel != null &&
    lastTimeMs != null &&
    lastTimeMs > bestForLevel * 1.15

  /* ── Verbal ── */
  const pickVerbalWord = useCallback(
    (seen: Set<string>, score: number) => {
      const pool = verbalLang === 'es' ? WORDS_ES : WORDS_EN
      const rng = mulberry32(verbalSeed.current + score * 997 + seen.size)
      const canRepeat = seen.size >= 3 && rng() < 0.45
      if (canRepeat) {
        const arr = [...seen]
        const w = arr[Math.floor(rng() * arr.length)]
        return { word: w, isNew: false }
      }
      let guard = 0
      while (guard++ < 80) {
        const w = pool[Math.floor(rng() * pool.length)]
        if (!seen.has(w)) return { word: w, isNew: true }
      }
      const w = pool[Math.floor(rng() * pool.length)]
      return { word: w, isNew: !seen.has(w) }
    },
    [verbalLang]
  )

  const startVerbal = () => {
    soundStart()
    verbalSeed.current = Date.now()
    const seen = new Set<string>()
    const { word, isNew } = pickVerbalWord(seen, 0)
    setVerbalSeen(seen)
    setVerbalWord(word)
    setVerbalIsNew(isNew)
    setVerbalScore(0)
    setVerbalStrikes(0)
    setVerbalRoundBest(0)
    setVerbalFeedback(null)
    setVerbalPlaying(true)
  }

  const answerVerbal = (saidSeen: boolean) => {
    if (!verbalPlaying || verbalFeedback) return
    const actuallySeen = !verbalIsNew
    const ok = saidSeen === actuallySeen
    if (ok) {
      soundMatch()
      setVerbalFeedback('ok')
      const nextScore = verbalScore + 1
      const nextSeen = new Set(verbalSeen)
      nextSeen.add(verbalWord)
      setTimeout(() => {
        setVerbalScore(nextScore)
        setVerbalRoundBest((b) => Math.max(b, nextScore))
        if (nextScore > verbalBest) {
          setVerbalBest(nextScore)
          saveBest(VERBAL_BEST_KEY, nextScore)
        }
        if (verbalTarget > 0 && nextScore >= verbalTarget) {
          soundSuccess()
          setVerbalPlaying(false)
          setVerbalFeedback(null)
          return
        }
        const next = pickVerbalWord(nextSeen, nextScore)
        setVerbalSeen(nextSeen)
        setVerbalWord(next.word)
        setVerbalIsNew(next.isNew)
        setVerbalFeedback(null)
      }, 280)
    } else {
      soundFail()
      setVerbalFeedback('fail')
      const strikes = verbalStrikes + 1
      setTimeout(() => {
        setVerbalStrikes(strikes)
        setVerbalFeedback(null)
        if (strikes >= 3) {
          setVerbalRoundBest((b) => Math.max(b, verbalScore))
          setVerbalPlaying(false)
          recordLevelResult({
            categoryId: GAME_CAT,
            gameId: VERBAL_ID,
            level: Math.max(1, verbalScore),
            success: verbalScore > 0,
            score: verbalScore,
          })
        } else {
          const nextSeen = new Set(verbalSeen)
          nextSeen.add(verbalWord)
          const next = pickVerbalWord(nextSeen, verbalScore)
          setVerbalSeen(nextSeen)
          setVerbalWord(next.word)
          setVerbalIsNew(next.isNew)
        }
      }, 400)
    }
  }

  /* ── Typing ── */
  const typingQuote = useMemo(() => {
    const list = QUOTES.filter((q) => q.lang === typingLang && q.level === typingLevel)
    return list[0] ?? QUOTES.filter((q) => q.lang === typingLang)[0]
  }, [typingLang, typingLevel])

  const maxTypingLevel = useMemo(() => {
    const levels = QUOTES.filter((q) => q.lang === typingLang).map((q) => q.level)
    return levels.length ? Math.max(...levels) : 1
  }, [typingLang])

  const typingTarget = useMemo(
    () => (typingQuote ? quoteDisplayText(typingQuote, tildesOn) : ''),
    [typingQuote, tildesOn]
  )

  const typingWpm = useMemo(() => {
    if (typingMs < 400 || typingInput.length < 2) return 0
    const minutes = typingMs / 60000
    const words = typingInput.trim().split(/\s+/).filter(Boolean).length
    return Math.round(words / minutes)
  }, [typingMs, typingInput])

  const startTypingLevel = (lv = typingLevel) => {
    soundStart()
    setTypingLevel(lv)
    setTypingInput('')
    setTypingErrors(0)
    typingErrorsRef.current = 0
    typingPrevRef.current = ''
    setTypingStarted(false)
    setTypingDone(false)
    setTypingFailed(false)
    setTypingMs(0)
    setShowTypingLevels(false)
    typingStartRef.current = null
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }

  const toggleTildes = () => {
    const next = !tildesOn
    soundToggle(next)
    setTildesOn(next)
    saveBool(TYPING_TILDES_KEY, next)
    startTypingLevel(typingLevel)
  }

  const onTypingChange = (value: string) => {
    if (typingDone || typingFailed || !typingQuote) return
    if (!typingStarted) {
      setTypingStarted(true)
      typingStartRef.current = performance.now()
      typingTimerRef.current = window.setInterval(() => {
        if (typingStartRef.current == null) return
        setTypingMs(Math.round(performance.now() - typingStartRef.current))
      }, 100)
    }
    const target = typingTarget
    const prev = typingPrevRef.current

    if (value.length > prev.length) {
      const added = value.slice(prev.length)
      for (let i = 0; i < added.length; i++) {
        const pos = prev.length + i
        if (added[i] !== target[pos]) {
          typingErrorsRef.current += 1
        }
      }
    }

    typingPrevRef.current = value
    setTypingInput(value)
    setTypingErrors(typingErrorsRef.current)

    if (typingErrorsRef.current >= 5) {
      soundFail()
      setTypingFailed(true)
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
      return
    }
    if (value === target) {
      soundSuccess()
      setTypingDone(true)
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
      if (typingLevel > typingBest) {
        setTypingBest(typingLevel)
        saveBest(TYPING_BEST_KEY, typingLevel)
      }
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: TYPING_ID,
        level: typingLevel,
        success: true,
        timeMs: typingMs,
      })
    }
  }

  /* ── Palace ── */
  const getPalaceConfig = (lv: number) => {
    // Nivel 1: 3 objetos, 10s countdown
    // Cada nivel suma ~1 objeto y +2s de retención (máx. 20 objetos / 40s)
    const count = Math.min(3 + Math.floor((lv - 1) * 0.8), 20, PALACE_ITEMS.length, PALACE_ROOMS.length)
    const countdownSec = Math.min(10 + (lv - 1) * 2, 40)
    return { count, countdownSec }
  }

  const startPalaceRound = (lv = palaceLevel) => {
    soundStart()
    if (palaceCountdownRef.current) {
      window.clearInterval(palaceCountdownRef.current)
      palaceCountdownRef.current = null
    }
    const { count } = getPalaceConfig(lv)
    const rng = mulberry32(Date.now() + lv * 17)
    const shuffled = [...PALACE_ITEMS].sort(() => rng() - 0.5).slice(0, count)
    setPalaceItems(shuffled)
    setPalacePlacements({})
    setPalaceRecallOrder(Array(count).fill(''))
    setPalaceScore(0)
    setPalaceGrade(null)
    setPalacePlaceMs(0)
    setPalaceLevel(lv)
    setPalaceCountdown(getPalaceConfig(lv).countdownSec)
    palacePlaceStartRef.current = performance.now()
    setPalacePhase('place')
  }

  const placeItem = (roomId: string, item: string) => {
    soundClick()
    setPalacePlacements((p) => {
      const next = { ...p }
      Object.keys(next).forEach((k) => {
        if (next[k] === item) delete next[k]
      })
      if (item) next[roomId] = item
      else delete next[roomId]
      return next
    })
  }

  const finishPlacing = () => {
    if (Object.keys(palacePlacements).length < palaceItems.length) return
    // Tiempo de colocación
    const placeMs =
      palacePlaceStartRef.current != null
        ? Math.round(performance.now() - palacePlaceStartRef.current)
        : 0
    setPalacePlaceMs(placeMs)
    soundMatch()
    // Iniciar cuenta atrás de retención
    const { countdownSec } = getPalaceConfig(palaceLevel)
    setPalaceCountdown(countdownSec)
    setPalacePhase('countdown')
    if (palaceCountdownRef.current) window.clearInterval(palaceCountdownRef.current)
    palaceCountdownRef.current = window.setInterval(() => {
      setPalaceCountdown((t) => {
        if (t <= 1) {
          if (palaceCountdownRef.current) {
            window.clearInterval(palaceCountdownRef.current)
            palaceCountdownRef.current = null
          }
          soundStart()
          setPalacePhase('recall')
          return 0
        }
        if (t <= 4) soundTick(true)
        return t - 1
      })
    }, 1000)
  }

  const gradePlacementSpeed = (ms: number, itemCount: number) => {
    // Tiempo ideal: ~8s por objeto
    const ideal = itemCount * 8000
    const ratio = ms / ideal
    if (ratio <= 0.6) return 'Excelente (muy rápido)'
    if (ratio <= 1.0) return 'Bueno'
    if (ratio <= 1.5) return 'Aceptable'
    return 'Lento — practica más la visualización'
  }

  const checkPalaceRecall = () => {
    const rooms = PALACE_ROOMS.slice(0, palaceItems.length)
    let correct = 0
    rooms.forEach((room, idx) => {
      const expected = palacePlacements[room.id] || ''
      if ((palaceRecallOrder[idx] || '').trim().toLowerCase() === expected.toLowerCase()) {
        correct++
      }
    })
    setPalaceScore(correct)
    const grade = gradePlacementSpeed(palacePlaceMs, palaceItems.length)
    setPalaceGrade(grade)
    const success = correct === palaceItems.length
    if (success) {
      soundSuccess()
      if (palaceLevel > palaceBest) {
        setPalaceBest(palaceLevel)
        saveBest(PALACE_BEST_KEY, palaceLevel)
      }
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: PALACE_ID,
        level: palaceLevel,
        success: true,
        score: correct,
        timeMs: palacePlaceMs,
      })
    } else {
      soundFail()
    }
    setPalacePhase('result')
  }

  /* ── Menú ── */
  if (appMode === 'menu') {
    return (
      <div className="app-shell">
        <header style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              navigate('/categoria/memoria')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginBottom: '1rem' }}
          >
            ← Volver
          </button>
        </header>
        <GlassCard>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{ padding: '1.35rem 1.2rem' }}
          >
            <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
              Asociaciones Textuales
            </h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                fontSize: '0.88rem',
                marginBottom: '1.15rem',
              }}
            >
              Elige un modo de entrenamiento de memoria
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(Object.keys(MODE_INFO) as (keyof typeof MODE_INFO)[]).map((m) => {
                const info = MODE_INFO[m]
                const selected = menuPick === m
                return (
                  <motion.button
                    key={m}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      soundClick()
                      setMenuPick(m)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '0.85rem 1rem',
                      borderRadius: 14,
                      border: selected
                        ? '2px solid var(--gco-primary)'
                        : '1px solid var(--gco-glass-border)',
                      background: selected
                        ? 'rgba(34, 230, 197, 0.12)'
                        : 'rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.15rem' }}>{info.emoji}</span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{info.title}</p>
                        <p
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--gco-ink-muted)',
                            marginTop: 2,
                            lineHeight: 1.35,
                          }}
                        >
                          {info.desc}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
            <div style={{ marginTop: '1.15rem' }}>
              <GlassButton
                style={{ width: '100%' }}
                onClick={() => {
                  soundClick()
                  setAppMode(menuPick)
                  if (menuPick === 'chunks') setPhase('setup')
                  if (menuPick === 'verbal') setVerbalPlaying(false)
                  if (menuPick === 'typing') startTypingLevel(typingLevel || 1)
                  if (menuPick === 'palace') setPalacePhase('intro')
                }}
              >
                Continuar
              </GlassButton>
            </div>
          </motion.div>
        </GlassCard>
      </div>
    )
  }

  /* ── Palace UI ── */
  if (appMode === 'palace') {
    const selectStyle: React.CSSProperties = {
      appearance: 'none',
      WebkitAppearance: 'none',
      MozAppearance: 'none',
      backgroundColor: '#0f1c24',
      backgroundImage: `linear-gradient(135deg, rgba(34,230,197,0.18), rgba(15,28,36,0.95)), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2322e6c5' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 0.75rem center',
      border: '1px solid rgba(34,230,197,0.45)',
      borderRadius: 12,
      padding: '0.6rem 2.1rem 0.6rem 0.9rem',
      color: '#e8f7f4',
      fontSize: '0.9rem',
      fontWeight: 500,
      cursor: 'pointer',
      minWidth: 210,
      maxWidth: '100%',
      boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      outline: 'none',
    }

    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              if (palaceCountdownRef.current) {
                window.clearInterval(palaceCountdownRef.current)
                palaceCountdownRef.current = null
              }
              // En partida → volver a la guía del Palacio; en intro → menú de modos
              if (palacePhase === 'intro') {
                setAppMode('menu')
              } else {
                setPalacePhase('intro')
              }
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            {palacePhase === 'intro' ? '← Modos' : '← Volver'}
          </button>
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
            Récord nv. {palaceBest}
          </span>
        </header>

        {/* Countdown overlay a pantalla completa */}
        <AnimatePresence>
          {palacePhase === 'countdown' && (
            <motion.div
              key="countdown-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(5, 12, 20, 0.92)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  fontSize: '1.1rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: 24,
                  textAlign: 'center',
                  maxWidth: 320,
                }}
              >
                Cierra los ojos y recorre mentalmente tu palacio…
              </motion.p>
              <motion.div
                key={palaceCountdown}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  border: '4px solid var(--gco-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 40px rgba(34,230,197,0.35)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: '3.2rem',
                    fontWeight: 800,
                    color: 'var(--gco-primary)',
                  }}
                >
                  {palaceCountdown}
                </span>
              </motion.div>
              <p
                style={{
                  marginTop: 28,
                  fontSize: '0.9rem',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                Retención · Nivel {palaceLevel}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <GlassCard>
          <div style={{ padding: '1.35rem 1.2rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 6 }}>🏰 Palacio Imaginario</h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                fontSize: '0.88rem',
                marginBottom: '1.1rem',
              }}
            >
              Método de Loci · Entrenamiento espacial de memoria
            </p>

            <AnimatePresence mode="wait">
              {palacePhase === 'intro' && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ fontSize: '0.9rem', lineHeight: 1.6 }}
                >
                  <section style={{ marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--gco-primary)', fontSize: '1.05rem', marginBottom: 8 }}>
                      ¿Qué es el Método de Loci?
                    </h3>
                    <p style={{ marginBottom: 10 }}>
                      El Método de Loci (también llamado Palacio de la Memoria o Palacio Imaginario) es una técnica
                      mnemotécnica que consiste en asociar la información que se desea recordar a lugares concretos
                      de un recorrido mental familiar. Al “caminar” mentalmente por ese espacio imaginario, la persona
                      recupera los datos en el mismo orden en que los colocó.
                    </p>
                    <p>
                      Aprovecha una de las capacidades más robustas del cerebro humano: la memoria espacial.
                      Convertimos listas abstractas (números, palabras, ideas) en imágenes vívidas situadas en
                      habitaciones, pasillos o puntos de un edificio conocido.
                    </p>
                  </section>

                  <section style={{ marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--gco-primary)', fontSize: '1.05rem', marginBottom: 8 }}>
                      Origen e historia
                    </h3>
                    <p style={{ marginBottom: 10 }}>
                      Se atribuye al poeta griego <strong>Simónides de Ceos</strong> (siglo V a. C.). Según la leyenda,
                      tras el derrumbe de un banquete, Simónides pudo identificar a las víctimas recordando exactamente
                      dónde estaba sentado cada comensal. Ese episodio se considera el nacimiento formal de la técnica.
                    </p>
                    <p style={{ marginBottom: 10 }}>
                      Cicerón y Quintiliano lo describieron como herramienta esencial de la retórica romana.
                      En la Edad Media y el Renacimiento, monjes, estudiantes y eruditos construían elaborados
                      “palacios” mentales para memorizar sermones, tratados y listas de conocimientos.
                    </p>
                    <p>
                      En su apogeo (Antigüedad y Renacimiento) fue la técnica principal de memorización profesional
                      antes de la generalización de la imprenta y de los sistemas de escritura portátiles.
                    </p>
                  </section>

                  <section style={{ marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--gco-primary)', fontSize: '1.05rem', marginBottom: 8 }}>
                      Quiénes lo usaban y usos memorables
                    </h3>
                    <p style={{ marginBottom: 10 }}>
                      <strong>Usos profesionales históricos:</strong> oradores griegos y romanos, actores de teatro
                      clásico, médicos que memorizaban listas de síntomas y remedios, juristas y estudiantes de
                      derecho romano, y predicadores que preparaban sermones largos sin papel.
                    </p>
                    <p style={{ marginBottom: 10 }}>
                      <strong>Usos más memorables:</strong> discursos enteros recitados de memoria en el Foro romano;
                      monjes que guardaban catálogos de libros y pasajes bíblicos; competidores modernos de memoria
                      que memorizan barajas de cartas o listas de cientos de dígitos en minutos.
                    </p>
                    <p>
                      <strong>Hoy:</strong> campeones de memoria (World Memory Championships), estudiantes de oposiciones,
                      actores, médicos, abogados y cualquier profesional que necesite retener listas largas o
                      estructuras complejas. La neurociencia confirma que el método activa redes espaciales del
                      hipocampo (Maguire et al., 2003).
                    </p>
                  </section>

                  <section style={{ marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--gco-primary)', fontSize: '1.05rem', marginBottom: 8 }}>
                      Cómo usarlo paso a paso
                    </h3>
                    <ol style={{ paddingLeft: '1.2rem', marginBottom: 12 }}>
                      <li style={{ marginBottom: 8 }}>
                        <strong>Elige un lugar conocido.</strong> Puede ser tu casa, el camino al trabajo, una escuela
                        o cualquier edificio que recuerdes con claridad. Cuanto más familiar, mejor.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong>Define una ruta fija.</strong> Decide un orden de recorrido (entrada → salón → cocina →
                        pasillo → …). Siempre usarás el mismo orden.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong>Coloca imágenes vívidas y absurdas.</strong> En cada punto de la ruta “pon” una imagen
                        exagerada, colorida, emocional o ridícula que represente el dato que quieres recordar.
                        Lo absurdo se recuerda mejor.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong>Recorre mentalmente el camino.</strong> Cuando necesites recuperar la información,
                        camina de nuevo por el palacio en el mismo orden y “mira” qué hay en cada habitación.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong>Repasa y consolida.</strong> Especialmente después de dormir, vuelve a recorrer el
                        palacio para fortalecer las asociaciones.
                      </li>
                    </ol>
                    <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
                      Consejo: empieza con 3–5 loci. Cuando los domines, amplía el edificio o añade nuevos “palacios”.
                    </p>
                  </section>

                  <section style={{ marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--gco-primary)', fontSize: '1.05rem', marginBottom: 8 }}>
                      Fuentes (APA)
                    </h3>
                    <ul style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', paddingLeft: '1.1rem' }}>
                      <li>Yates, F. A. (1966). <em>The Art of Memory</em>. University of Chicago Press.</li>
                      <li>Foer, J. (2011). <em>Moonwalking with Einstein</em>. Penguin.</li>
                      <li>Maguire, E. A., et al. (2003). Routes to remembering: The brains behind superior memory. <em>Nature Neuroscience</em>.</li>
                      <li>Carruthers, M. (1990). <em>The Book of Memory</em>. Cambridge University Press.</li>
                      <li>Cicero. (55 a. C.). <em>De oratore</em>.</li>
                      <li>Buzan, T. (2006). <em>The Memory Book</em>.</li>
                      <li>Ericsson, K. A. (2006). <em>The Cambridge Handbook of Expertise and Expert Performance</em>.</li>
                    </ul>
                  </section>

                  <GlassButton onClick={() => startPalaceRound(1)} style={{ width: '100%' }}>
                    Empezar entrenamiento
                  </GlassButton>
                </motion.div>
              )}

              {palacePhase === 'place' && (
                <motion.div
                  key="place"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Cabecera de nivel */}
                  <div
                    style={{
                      textAlign: 'center',
                      marginBottom: 18,
                      padding: '0.9rem 1rem',
                      borderRadius: 14,
                      background:
                        'linear-gradient(135deg, rgba(34,230,197,0.14), rgba(255,255,255,0.03))',
                      border: '1px solid rgba(34,230,197,0.28)',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: 'var(--gco-primary)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Nivel {palaceLevel}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '0.82rem',
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      {palaceItems.length} objetos · Coloca y visualiza con fuerza
                    </p>
                  </div>

                  {/* Chips de objetos a colocar */}
                  <p
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--gco-ink-muted)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontWeight: 600,
                    }}
                  >
                    Objetos de este nivel
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      justifyContent: 'center',
                      marginBottom: 20,
                      padding: '0.75rem',
                      borderRadius: 12,
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {palaceItems.map((item) => {
                      const used = Object.values(palacePlacements).includes(item)
                      return (
                        <span
                          key={item}
                          style={{
                            padding: '0.45rem 0.75rem',
                            borderRadius: 999,
                            background: used
                              ? 'rgba(34,230,197,0.22)'
                              : 'rgba(255,255,255,0.06)',
                            border: used
                              ? '1px solid rgba(34,230,197,0.55)'
                              : '1px solid rgba(255,255,255,0.12)',
                            fontSize: '0.82rem',
                            color: used ? 'var(--gco-primary)' : 'var(--gco-ink)',
                            fontWeight: used ? 600 : 400,
                            opacity: used ? 0.85 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {used ? '✓ ' : ''}
                          {item}
                        </span>
                      )
                    })}
                  </div>

                  {/* Habitaciones + selects */}
                  <p
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--gco-ink-muted)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontWeight: 600,
                    }}
                  >
                    Asigna cada objeto a una habitación
                  </p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {PALACE_ROOMS.slice(0, palaceItems.length).map((room) => (
                      <div
                        key={room.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '0.75rem 0.9rem',
                          borderRadius: 14,
                          background: palacePlacements[room.id]
                            ? 'rgba(34,230,197,0.08)'
                            : 'rgba(255,255,255,0.04)',
                          border: palacePlacements[room.id]
                            ? '1px solid rgba(34,230,197,0.4)'
                            : '1px solid var(--gco-glass-border)',
                          flexWrap: 'wrap',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1.35rem',
                            width: 36,
                            textAlign: 'center',
                          }}
                        >
                          {room.emoji}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: '0.92rem',
                            minWidth: 110,
                            fontWeight: 500,
                          }}
                        >
                          {room.name}
                        </span>
                        <select
                          value={palacePlacements[room.id] || ''}
                          onChange={(e) => placeItem(room.id, e.target.value)}
                          style={selectStyle}
                        >
                          <option value="" style={{ background: '#0f1c24', color: '#9bb' }}>
                            — elegir objeto —
                          </option>
                          {palaceItems.map((it) => (
                            <option
                              key={it}
                              value={it}
                              style={{ background: '#0f1c24', color: '#e8f7f4' }}
                            >
                              {it}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <GlassButton
                    style={{ width: '100%', marginTop: 20 }}
                    onClick={finishPlacing}
                    disabled={Object.keys(palacePlacements).length < palaceItems.length}
                  >
                    Ya coloqué todo → Recordar
                  </GlassButton>
                </motion.div>
              )}

              {palacePhase === 'recall' && (
                <motion.div
                  key="recall"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <p style={{ marginBottom: 12, textAlign: 'center' }}>
                    Recorre mentalmente el palacio y escribe los objetos en el orden de las habitaciones:
                  </p>
                  {PALACE_ROOMS.slice(0, palaceItems.length).map((room, idx) => (
                    <div key={room.id} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
                        {room.emoji} {room.name}
                      </label>
                      <input
                        className="glass-input"
                        placeholder="¿Qué había aquí?"
                        value={palaceRecallOrder[idx] || ''}
                        onChange={(e) => {
                          const next = [...palaceRecallOrder]
                          next[idx] = e.target.value
                          setPalaceRecallOrder(next)
                        }}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                  ))}
                  <GlassButton style={{ width: '100%', marginTop: 12 }} onClick={checkPalaceRecall}>
                    Comprobar recorrido
                  </GlassButton>
                </motion.div>
              )}

              {palacePhase === 'result' && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ textAlign: 'center' }}
                >
                  <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>
                    {palaceScore === palaceItems.length ? '¡Palacio perfecto!' : 'Recorrido parcial'}
                  </p>
                  <p style={{ color: 'var(--gco-ink-muted)', marginBottom: 8 }}>
                    {palaceScore}/{palaceItems.length} objetos en el lugar correcto
                  </p>
                  {palacePlaceMs > 0 && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--gco-ink-muted)', marginBottom: 4 }}>
                      Tiempo de colocación: {formatDuration(palacePlaceMs)}
                    </p>
                  )}
                  {palaceGrade && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--gco-primary)', marginBottom: 16 }}>
                      Valoración de velocidad: {palaceGrade}
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <GlassButton onClick={() => startPalaceRound(palaceLevel + 1)}>
                      Siguiente nivel
                    </GlassButton>
                    <button
                      type="button"
                      className="glass-button secondary"
                      onClick={() => startPalaceRound(palaceLevel)}
                    >
                      Reintentar
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      onClick={() => setPalacePhase('intro')}
                    >
                      Volver a la guía
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ── Verbal UI ── */
  if (appMode === 'verbal') {
    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setAppMode('menu')
              setVerbalPlaying(false)
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Modos
          </button>
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
            Récord {verbalBest}
          </span>
        </header>
        <GlassCard>
          <div style={{ padding: '1.35rem 1.2rem', textAlign: 'center' }}>
            <h2 style={{ marginBottom: 4 }}>📝 Palabras encadenadas</h2>
            <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              ¿Nueva o ya vista? Tres fallos reinician la ronda.
            </p>

            {!verbalPlaying ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {(['es', 'en'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`glass-button ${verbalLang === l ? '' : 'secondary'}`}
                      onClick={() => {
                        soundClick()
                        setVerbalLang(l)
                      }}
                    >
                      {l === 'es' ? 'Español' : 'English'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
                  Récord histórico: <strong className="mono">{verbalBest}</strong> aciertos
                </p>
                {verbalRoundBest > 0 && (
                  <p style={{ color: 'var(--gco-primary)' }}>
                    Última ronda: {verbalRoundBest} aciertos
                  </p>
                )}
                {verbalBest > 0 && (
                  <>
                    <button
                      type="button"
                      className="glass-button secondary"
                      style={{ fontSize: '0.85rem' }}
                      onClick={() => {
                        soundClick()
                        setShowVerbalLevels((v) => !v)
                      }}
                    >
                      Niveles ▾
                    </button>
                    {showVerbalLevels && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          justifyContent: 'center',
                          maxHeight: 160,
                          overflow: 'auto',
                        }}
                      >
                        <button
                          type="button"
                          className={`glass-button ${verbalTarget === 0 ? '' : 'secondary'}`}
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                          onClick={() => {
                            soundClick()
                            setVerbalTarget(0)
                            setShowVerbalLevels(false)
                          }}
                        >
                          Libre
                        </button>
                        {Array.from({ length: Math.min(verbalBest, 50) }, (_, i) => i + 1).map(
                          (n) => (
                            <button
                              key={n}
                              type="button"
                              className={`glass-button ${verbalTarget === n ? '' : 'secondary'}`}
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                              onClick={() => {
                                soundClick()
                                setVerbalTarget(n)
                                setShowVerbalLevels(false)
                              }}
                            >
                              Meta {n}
                            </button>
                          )
                        )}
                      </div>
                    )}
                    {verbalTarget > 0 && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--gco-primary)' }}>
                        Meta de esta ronda: {verbalTarget} aciertos
                      </p>
                    )}
                  </>
                )}
                <GlassButton onClick={startVerbal}>Empezar ronda</GlassButton>
                <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                  Léxico: {verbalLang === 'es' ? WORDS_ES.length : WORDS_EN.length}+ palabras
                </p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 16,
                    marginBottom: 16,
                    fontSize: '0.9rem',
                  }}
                >
                  <span>
                    Aciertos <strong className="mono">{verbalScore}</strong>
                  </span>
                  <span>
                    Fallos{' '}
                    <strong
                      className="mono"
                      style={{
                        color: verbalStrikes >= 2 ? 'var(--gco-secondary)' : 'var(--gco-ink)',
                      }}
                    >
                      {verbalStrikes}/3
                    </strong>
                  </span>
                </div>
                <motion.p
                  key={verbalWord + verbalFeedback}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    fontSize: 'clamp(1.6rem, 6vw, 2.2rem)',
                    fontWeight: 700,
                    margin: '1.25rem 0',
                    color:
                      verbalFeedback === 'ok'
                        ? 'var(--gco-primary)'
                        : verbalFeedback === 'fail'
                          ? 'var(--gco-secondary)'
                          : 'var(--gco-ink)',
                  }}
                >
                  {verbalWord}
                </motion.p>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GlassButton onClick={() => answerVerbal(true)} disabled={!!verbalFeedback}>
                    Ya pasó
                  </GlassButton>
                  <button
                    type="button"
                    className="glass-button secondary"
                    disabled={!!verbalFeedback}
                    onClick={() => answerVerbal(false)}
                  >
                    Es nueva
                  </button>
                </div>
              </div>
            )}

            {!verbalPlaying && verbalStrikes >= 3 && (
              <p style={{ marginTop: 16, color: 'var(--gco-secondary)' }}>
                Ronda terminada · llegaste a {verbalRoundBest}
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ── Typing UI ── */
  if (appMode === 'typing') {
    const q = typingQuote
    const glassPanel: React.CSSProperties = {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))',
      border: '1px solid var(--gco-glass-border)',
      borderRadius: 18,
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
    }
    const pill: React.CSSProperties = {
      ...glassPanel,
      borderRadius: 999,
      padding: '0.4rem 0.85rem',
      fontSize: '0.8rem',
    }

    return (
      <div className="app-shell">
        <header
          style={{
            marginBottom: '1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="glass-button secondary"
            onClick={() => {
              soundClick()
              setAppMode('menu')
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Modos
          </button>
          <span className="mono" style={pill}>
            🏆 Mejor nv. {typingBest}/{maxTypingLevel}
          </span>
        </header>

        <div style={{ ...glassPanel, padding: '1.4rem 1.25rem' }}>
          <h2
            style={{
              textAlign: 'center',
              marginBottom: 4,
              fontSize: 'clamp(1.15rem, 4vw, 1.5rem)',
              background: 'linear-gradient(90deg, var(--gco-primary), #7dd8ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ⌨️ Citando al citador
          </h2>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--gco-ink-muted)',
              fontSize: '0.85rem',
              marginBottom: '1.1rem',
            }}
          >
            Nivel {typingLevel}/{maxTypingLevel} · 5 errores permiten fallar (no se borran al
            corregir)
          </p>

          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              marginBottom: 14,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {(['es', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`glass-button ${typingLang === l ? '' : 'secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                onClick={() => {
                  soundClick()
                  setTypingLang(l)
                  startTypingLevel(typingLevel)
                }}
              >
                {l === 'es' ? '🇪🇸 Español' : '🇬🇧 English'}
              </button>
            ))}
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
              onClick={() => {
                soundClick()
                setShowTypingLevels((v) => !v)
              }}
            >
              Niveles ▾
            </button>
          </div>

          {typingLang === 'es' && (
            <div
              style={{
                ...glassPanel,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 1rem',
                marginBottom: 14,
              }}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Tildes (acentos)</p>
                <p style={{ fontSize: '0.76rem', color: 'var(--gco-ink-muted)' }}>
                  {tildesOn
                    ? 'Escribe la cita con tildes correctas'
                    : 'Se omiten las tildes al leer y escribir'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tildesOn}
                onClick={toggleTildes}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: tildesOn ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                  position: 'relative',
                  flexShrink: 0,
                  transition: 'background 0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: tildesOn ? 24 : 3,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  }}
                />
              </button>
            </div>
          )}

          <AnimatePresence>
            {showTypingLevels && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  style={{
                    ...glassPanel,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    justifyContent: 'center',
                    padding: '0.75rem',
                    marginBottom: 14,
                    maxHeight: 170,
                    overflow: 'auto',
                  }}
                >
                  {Array.from({ length: maxTypingLevel }, (_, i) => i + 1).map((n) => {
                    const isUnlocked = n <= Math.max(typingBest + 1, 1)
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!isUnlocked}
                        className={`glass-button ${typingLevel === n ? '' : 'secondary'}`}
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.32rem 0.5rem',
                          opacity: isUnlocked ? 1 : 0.35,
                          minWidth: 44,
                        }}
                        onClick={() => {
                          if (!isUnlocked) return
                          soundClick()
                          startTypingLevel(n)
                        }}
                      >
                        Nv. {n}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {q && (
            <>
              <div
                {...blockCopyHandlers}
                style={{
                  ...glassPanel,
                  ...noSelectStyle,
                  padding: '1.1rem 1.15rem',
                  marginBottom: 12,
                  lineHeight: 1.6,
                  fontSize: 'clamp(0.95rem, 2.6vw, 1.08rem)',
                  cursor: 'default',
                }}
                // Extra: bloquear completamente el menú de traducción / selección
                onDoubleClick={(e) => e.preventDefault()}
              >
                {typingTarget.split('').map((ch, i) => {
                  let color = 'var(--gco-ink-muted)'
                  if (i < typingInput.length) {
                    color =
                      typingInput[i] === ch ? 'var(--gco-primary)' : 'var(--gco-secondary)'
                  }
                  return (
                    <span
                      key={i}
                      style={{
                        color,
                        ...noSelectStyle,
                        display: 'inline',
                      }}
                    >
                      {ch}
                    </span>
                  )
                })}
              </div>
              <p
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: 14,
                  fontStyle: 'italic',
                  textAlign: 'right',
                  paddingRight: 4,
                }}
              >
                — {q.source}
              </p>
            </>
          )}

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              marginBottom: 12,
              fontSize: '0.82rem',
              flexWrap: 'wrap',
            }}
          >
            <span className="mono" style={pill}>
              ⏱ {formatDuration(typingMs)}
            </span>
            <span className="mono" style={pill}>
              {typingWpm} PPM
            </span>
            <span
              className="mono"
              style={{
                ...pill,
                color: typingErrors >= 3 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
              }}
            >
              Errores {typingErrors}/5
            </span>
          </div>

          <textarea
            className="glass-input"
            value={typingInput}
            onChange={(e) => onTypingChange(e.target.value)}
            disabled={typingDone || typingFailed}
            placeholder="Escribe la cita aquí…"
            rows={4}
            autoFocus
            style={{
              width: '100%',
              resize: 'vertical',
              fontSize: '1rem',
              lineHeight: 1.5,
              marginBottom: 12,
              borderRadius: 14,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          />

          {typingDone && (
            <div style={{ ...glassPanel, textAlign: 'center', padding: '1.1rem' }}>
              <p style={{ color: 'var(--gco-primary)', fontWeight: 700 }}>¡Nivel superado!</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
                {formatDuration(typingMs)} · {typingWpm} palabras/min
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                {typingLevel < maxTypingLevel ? (
                  <GlassButton
                    onClick={() => {
                      soundClick()
                      startTypingLevel(typingLevel + 1)
                    }}
                  >
                    Siguiente nivel
                  </GlassButton>
                ) : (
                  <p style={{ color: 'var(--gco-primary)' }}>
                    Completaste los {maxTypingLevel} niveles
                  </p>
                )}
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => startTypingLevel(typingLevel)}
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {typingFailed && (
            <div style={{ ...glassPanel, textAlign: 'center', padding: '1.1rem' }}>
              <p style={{ color: 'var(--gco-secondary)', fontWeight: 700 }}>Demasiados errores</p>
              <GlassButton style={{ marginTop: 10 }} onClick={() => startTypingLevel(typingLevel)}>
                Reintentar nivel
              </GlassButton>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Chunks UI ── */
  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <button
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setAppMode('menu')
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ← Modos
        </button>
        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {phase === 'recall' && useTimer && timeLeft > 0 && (
            <span
              className="mono"
              style={{
                fontSize: '0.95rem',
                color: timeLeft <= 10 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
              }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {phase === 'recall' && (
            <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
              {formatDuration(elapsedMs)}
              {useProgressive && bestForLevel != null && bestForLevel > 0 && (
                <> · 🏆 {formatDuration(bestForLevel)}</>
              )}
            </span>
          )}
          {useProgressive && phase === 'setup' && (
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setShowLevelPicker((v) => !v)
              }}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
            >
              Nivel {level} ▾
            </button>
          )}
          {useProgressive && phase !== 'setup' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
            </span>
          )}
          {!useProgressive && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Modo libre
            </span>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && useProgressive && phase === 'setup' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
          >
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--gco-ink-muted)',
                marginBottom: '0.5rem',
              }}
            >
              Elige nivel · marca a superar
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className={`glass-button ${level === defaultLevel ? '' : 'secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                onClick={() => {
                  soundClick()
                  setLevel(defaultLevel)
                  setShowLevelPicker(false)
                }}
              >
                Nv. {defaultLevel} (nuevo)
              </button>
              {unlocked.map((u) => (
                <button
                  key={u.level}
                  type="button"
                  className={`glass-button ${level === u.level ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem', minWidth: 64 }}
                  onClick={() => {
                    soundClick()
                    setLevel(u.level)
                    setShowLevelPicker(false)
                  }}
                >
                  Nv. {u.level}
                  <span
                    className="mono"
                    style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}
                  >
                    {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <GlassCard>
        <div style={{ padding: '1.35rem 1.25rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>Bloques de memoria</h2>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--gco-ink-muted)',
              fontSize: '0.88rem',
              marginBottom: '1.35rem',
            }}
          >
            Genera · agrupa · inventa una historia · oculta · recuerda
          </p>

          <AnimatePresence mode="wait">
            {phase === 'setup' && (
              <motion.div
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}
              >
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '1rem 1.1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Modo progresivo</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                        {useProgressive ? `Nivel actual: ${level}` : 'Sube de nivel con números'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useProgressive}
                      onClick={() => {
                        const next = !useProgressive
                        soundToggle(next)
                        setUseProgressive(next)
                        if (next) setLevel(Math.max(1, progress.highestLevel + 1))
                      }}
                      style={{
                        width: 52,
                        height: 30,
                        borderRadius: 999,
                        border: 'none',
                        cursor: 'pointer',
                        background: useProgressive
                          ? 'var(--gco-primary)'
                          : 'rgba(255,255,255,0.12)',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 3,
                          left: useProgressive ? 24 : 3,
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                        }}
                      />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.85rem 1.1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                      Límite de tiempo al recordar
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      const next = !useTimer
                      soundToggle(next)
                      setUseTimer(next)
                    }}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                      position: 'relative',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: useTimer ? 24 : 3,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }}
                    />
                  </button>
                </div>

                {!useProgressive && (
                  <>
                    <div>
                      <label
                        style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}
                      >
                        Cantidad de elementos
                      </label>
                      <input
                        className="glass-input mono"
                        type="number"
                        min={1}
                        max={32}
                        value={totalChars}
                        onChange={(e) =>
                          setTotalChars(clamp(parseInt(e.target.value, 10) || 1, 1, 32))
                        }
                        style={{ maxWidth: 120, textAlign: 'center', fontSize: '1.1rem' }}
                      />
                    </div>
                    <div>
                      <label
                        style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}
                      >
                        Tamaño de bloque
                      </label>
                      <input
                        className="glass-input mono"
                        type="number"
                        min={1}
                        max={6}
                        value={blockSize}
                        onChange={(e) =>
                          setBlockSize(clamp(parseInt(e.target.value, 10) || 1, 1, 6))
                        }
                        style={{ maxWidth: 120, textAlign: 'center', fontSize: '1.1rem' }}
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                        Tipo de contenido
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {(
                          [
                            ['digits', 'Solo números'],
                            ['letters', 'Solo letras'],
                            ['code', 'Código mixto'],
                            ['emojis', 'Emojis'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`glass-button ${charset === value ? '' : 'secondary'}`}
                            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
                            onClick={() => {
                              soundClick()
                              setCharset(value)
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {useProgressive && (
                  <div>
                    <p
                      style={{
                        color: 'var(--gco-ink-muted)',
                        fontSize: '0.9rem',
                        lineHeight: 1.45,
                        marginBottom: 8,
                      }}
                    >
                      Nivel {level}: ~{progressivePreview.totalChars} caracteres en bloques de{' '}
                      {progressivePreview.blockSize}
                    </p>
                    {bestForLevel != null && bestForLevel > 0 && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
                        Marca a superar:{' '}
                        <span className="mono">{formatDuration(bestForLevel)}</span>
                      </p>
                    )}
                  </div>
                )}

                <GlassButton onClick={() => generate()} style={{ marginTop: '0.15rem' }}>
                  Generar secuencia
                  {useProgressive ? ` · Nv. ${level}` : ''}
                </GlassButton>
              </motion.div>
            )}

            {phase === 'study' && sequence && (
              <motion.div
                key="study"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div
                  {...blockCopyHandlers}
                  style={{
                    ...noSelectStyle,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                    minHeight: 56,
                    cursor: 'default',
                  }}
                  onDoubleClick={(e) => e.preventDefault()}
                >
                  {!hidden ? (
                    sequence.blocks.map((block, index) => (
                      <span
                        key={`${block}-${index}`}
                        className={
                          sequence.config.charset === 'emojis' ? undefined : 'mono'
                        }
                        style={{
                          ...noSelectStyle,
                          background: 'rgba(34, 230, 197, 0.12)',
                          border: '1px solid rgba(34, 230, 197, 0.35)',
                          borderRadius: 10,
                          padding: '0.55rem 0.75rem',
                          fontSize:
                            sequence.config.charset === 'emojis' ? '1.45rem' : '1.25rem',
                          letterSpacing:
                            sequence.config.charset === 'emojis' ? '0.12em' : '0.06em',
                          color: 'var(--gco-primary)',
                          fontWeight: 700,
                        }}
                      >
                        {block}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--gco-ink-muted)' }}>Contenido oculto</span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    marginBottom: '1.15rem',
                  }}
                >
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={() => {
                      soundClick()
                      setHidden((v) => !v)
                    }}
                  >
                    {hidden ? 'Mostrar' : 'Ocultar'}
                  </button>
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={speakBlocks}
                  >
                    🔊 Leer bloques
                  </button>
                </div>

                <label
                  style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}
                >
                  Tu historia / significado
                </label>
                <textarea
                  className="glass-input"
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder={
                    sequence.config.charset === 'emojis'
                      ? 'Ej: La manzana del zorro brilla bajo la luna...'
                      : 'Ej: El 25 de navidad, 39 esferas iluminan 17 carritos...'
                  }
                  rows={4}
                  style={{
                    resize: 'vertical',
                    minHeight: 100,
                    lineHeight: 1.45,
                    marginBottom: '0.75rem',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    className="glass-button secondary"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={speakStory}
                    disabled={!story.trim()}
                  >
                    🔊 Leer historia
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <GlassButton onClick={goToRecall}>Ya lo memoricé → Jugar</GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      clearTimer()
                      clearRunTimer()
                      setPhase('setup')
                    }}
                  >
                    Nueva secuencia
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'recall' && sequence && (
              <motion.div
                key="recall"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                  }}
                >
                  {sequence.config.charset === 'emojis'
                    ? 'Escribe los emojis en orden (puedes pegarlos)'
                    : 'Escribe la secuencia completa (espacios o guiones opcionales)'}
                </p>

                <input
                  className={`glass-input ${
                    sequence.config.charset === 'emojis' ? '' : 'mono'
                  }`}
                  value={recallInput}
                  onChange={(e) => {
                    setRecallInput(e.target.value)
                    setIsCorrect(null)
                    setCharVerdict(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && checkRecall()}
                  placeholder={
                    sequence.config.charset === 'emojis' ? '🍎🍋🍇…' : 'Ej: 2539 1747 1748'
                  }
                  autoFocus
                  style={{
                    textAlign: 'center',
                    fontSize:
                      sequence.config.charset === 'emojis' ? '1.35rem' : '1.15rem',
                    letterSpacing: '0.05em',
                    marginBottom: '1rem',
                  }}
                />

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <GlassButton
                    onClick={checkRecall}
                    disabled={
                      !recallInput.trim() ||
                      (useTimer && timeLeft <= 0 && isCorrect === false)
                    }
                  >
                    Comprobar
                  </GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      clearTimer()
                      clearRunTimer()
                      setHidden(false)
                      setPhase('study')
                      setIsCorrect(null)
                      setCharVerdict(null)
                    }}
                  >
                    Volver a estudiar
                  </button>
                </div>

                {charVerdict && (
                  <div
                    {...blockCopyHandlers}
                    style={{
                      ...noSelectStyle,
                      marginTop: '1.1rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--gco-glass-border)',
                      textAlign: 'center',
                      cursor: 'default',
                    }}
                    onDoubleClick={(e) => e.preventDefault()}
                  >
                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 8,
                        ...noSelectStyle,
                      }}
                    >
                      Tu respuesta · verde = bien · rojo = mal
                    </p>
                    <p
                      className={
                        sequence.config.charset === 'emojis' ? undefined : 'mono'
                      }
                      style={{
                        ...noSelectStyle,
                        fontSize:
                          sequence.config.charset === 'emojis' ? '1.35rem' : '1.2rem',
                        letterSpacing: '0.04em',
                        wordBreak: 'break-all',
                      }}
                    >
                      {charVerdict.map((v, i) => (
                        <span
                          key={i}
                          style={{
                            ...noSelectStyle,
                            color:
                              v.ok === true
                                ? 'var(--gco-primary)'
                                : 'var(--gco-secondary)',
                            fontWeight: 700,
                          }}
                        >
                          {v.ch}
                        </span>
                      ))}
                    </p>
                    {isCorrect === false && (
                      <p
                        style={{
                          marginTop: 10,
                          fontSize: '0.8rem',
                          color: 'var(--gco-ink-muted)',
                        }}
                      >
                        Correcto:{' '}
                        <span
                          className={
                            sequence.config.charset === 'emojis' ? undefined : 'mono'
                          }
                          style={{
                            ...noSelectStyle,
                            color: 'var(--gco-primary)',
                            fontWeight: 600,
                          }}
                        >
                          {sequence.raw}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {isCorrect === true && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ marginTop: '1.25rem', textAlign: 'center' }}
                  >
                    <p
                      style={{
                        color: 'var(--gco-primary)',
                        fontWeight: 600,
                        marginBottom: '0.35rem',
                      }}
                    >
                      ¡Correcto!
                    </p>
                    {lastTimeMs != null && (
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--gco-ink-muted)',
                          marginBottom: '0.5rem',
                        }}
                      >
                        {formatDuration(lastTimeMs)}
                        {beatBest ? ' · ¡Nueva marca!' : ''}
                      </p>
                    )}
                    {slowerThanBest && bestForLevel != null && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--gco-secondary)',
                          marginBottom: '0.75rem',
                        }}
                      >
                        Más lento que tu marca ({formatDuration(bestForLevel)}). ¿La
                        superas?
                      </p>
                    )}
                    {useProgressive ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <GlassButton onClick={nextProgressive}>Siguiente nivel</GlassButton>
                        <button
                          type="button"
                          className="glass-button secondary"
                          onClick={() => generate(level)}
                        >
                          Reintentar marca
                        </button>
                      </div>
                    ) : (
                      <GlassButton
                        onClick={() => {
                          soundClick()
                          clearTimer()
                          clearRunTimer()
                          setPhase('setup')
                        }}
                      >
                        Nueva secuencia
                      </GlassButton>
                    )}
                  </motion.div>
                )}

                {isCorrect === false && !charVerdict && (
                  <p
                    style={{
                      marginTop: '1rem',
                      color: 'var(--gco-secondary)',
                      textAlign: 'center',
                      fontSize: '0.95rem',
                    }}
                  >
                    {useTimer && timeLeft <= 0
                      ? 'Se acabó el tiempo.'
                      : 'No coincide. Prepárate un poco más e inténtalo de nuevo.'}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  )
}