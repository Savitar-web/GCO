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

type AppMode = 'menu' | 'chunks' | 'verbal' | 'typing'
type ChunkPhase = 'setup' | 'study' | 'recall'
type Lang = 'es' | 'en'

const GAME_CAT = 'memoria' as const
const GAME_ID = 'numeros-asociados'
const VERBAL_ID = 'palabras-encadenadas'
const TYPING_ID = 'citando-al-citador'
const VERBAL_BEST_KEY = 'gco:verbal-best'
const TYPING_BEST_KEY = 'gco:typing-best'
const TYPING_TILDES_KEY = 'gco:typing-tildes'

const MODE_INFO: Record<
  Exclude<AppMode, 'menu'>,
  { title: string; emoji: string; desc: string }
> = {
  chunks: {
    title: 'Bloques de memoria',
    emoji: '🔢',
    desc: 'Recuerda combinaciones complejas.',
  },
  verbal: {
    title: 'Palabras encadenadas',
    emoji: '📝',
    desc: '¿Ya viste esa palabra o es nueva?',
  },
  typing: {
    title: 'Citando al citador',
    emoji: '⌨️',
    desc: 'Escribe citas en tiempo récord.',
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

/* ─── Citas tipográficas (APA) ────────────────────────────────────────────
 * El campo `text` de las citas en español se guarda SIEMPRE con tildes
 * correctas (ortografía completa). El modo de juego "Citando al citador"
 * decide, según el switch de tildes, si se muestra/compara tal cual
 * (con tildes) o una versión sin tildes generada automáticamente con
 * `stripAcutes`. El campo `source` (referencia APA) NUNCA se modifica por
 * el switch: siempre se muestra con sus tildes correctas.
 * ────────────────────────────────────────────────────────────────────── */

type QuoteItem = {
  level: number
  lang: Lang
  text: string
  /** Cita APA breve — siempre con tildes correctas, sin importar el switch */
  source: string
}

const QUOTES: QuoteItem[] = [
  // ES — cortas (1–5)
  { level: 1, lang: 'es', text: 'El cielo es azul porque la luz del sol se dispersa en el aire.', source: 'NASA. (n.d.). Why is the sky blue?' },
  { level: 2, lang: 'es', text: 'Solo sé que no sé nada.', source: 'Platón. (ca. 399 a. C.). Apología de Sócrates.' },
  { level: 3, lang: 'es', text: 'Pienso, luego existo.', source: 'Descartes, R. (1637). Discurso del método.' },
  { level: 4, lang: 'es', text: 'La educación es el arma más poderosa que puedes usar para cambiar el mundo.', source: 'Mandela, N. (1990). Discurso.' },
  { level: 5, lang: 'es', text: 'No es la especie más fuerte la que sobrevive, sino la que mejor se adapta.', source: 'Darwin, C. (1859). El origen de las especies.' },
  // ES — medias (6–12)
  { level: 6, lang: 'es', text: 'La gravedad no es una fuerza misteriosa que tira de los objetos: es la curvatura del espacio y el tiempo causada por la masa.', source: 'Einstein, A. (1915). Relatividad general.' },
  { level: 7, lang: 'es', text: 'El agua cubre la mayor parte de la Tierra, pero el agua dulce accesible es una fracción minúscula de todo el planeta.', source: 'USGS. (n.d.). How much water is there on Earth?' },
  { level: 8, lang: 'es', text: 'La Luna no tiene atmósfera densa; por eso el cielo lunar es negro incluso de día y las huellas de los astronautas pueden durar millones de años.', source: 'NASA. (1969). Apollo mission reports.' },
  { level: 9, lang: 'es', text: 'Aristóteles sostuvo que el conocimiento empieza en los sentidos y que la virtud se adquiere con el hábito, no solo con la teoría.', source: 'Aristóteles. (ca. 350 a. C.). Ética a Nicómaco.' },
  { level: 10, lang: 'es', text: 'Newton formuló que la misma fuerza que hace caer una manzana mantiene a la Luna en su órbita alrededor de la Tierra.', source: 'Newton, I. (1687). Philosophiae Naturalis Principia Mathematica.' },
  { level: 11, lang: 'es', text: 'El ADN almacena instrucciones en una doble hélice; su descubrimiento unió biología, química y física en una sola historia de la vida.', source: 'Watson, J., y Crick, F. (1953). Nature.' },
  { level: 12, lang: 'es', text: 'Nietzsche escribió que quien tiene un porqué para vivir puede soportar casi cualquier cómo; el sentido sostiene la voluntad.', source: 'Nietzsche, F. (1889). Crepúsculo de los ídolos.' },
  // ES — largas (13–20)
  { level: 13, lang: 'es', text: 'Cuando los astronautas del Apolo 11 pisaron la Luna, no solo cumplieron una meta técnica: demostraron que la ciencia, la ingeniería y la cooperación pueden llevar a la humanidad más allá de su planeta de origen.', source: 'NASA. (1969). Apollo 11 Mission Report.' },
  { level: 14, lang: 'es', text: 'La fotosíntesis convierte la luz del sol en energía química. Sin ese proceso, la mayoría de las cadenas alimentarias de la Tierra colapsarían y el oxígeno que respiramos sería escaso.', source: 'National Geographic. (n.d.). Photosynthesis explained.' },
  { level: 15, lang: 'es', text: 'Sócrates no dejó textos propios. Lo que sabemos de su método viene de Platón: preguntar sin cesar, examinar las definiciones y preferir la honestidad intelectual a la opinión cómoda.', source: 'Platón. (ca. 399 a. C.). Diálogos socráticos.' },
  { level: 16, lang: 'es', text: 'El teorema de Pitágoras relaciona los lados de un triángulo rectángulo. Aunque se asocia a un nombre, culturas anteriores ya usaban relaciones equivalentes en mediciones y construcciones.', source: 'Historia de las matemáticas. (n.d.). Teorema de Pitágoras.' },
  { level: 17, lang: 'es', text: 'La teoría de la evolución no dice que el azar lo explique todo. Dice que la variación heredable y la selección a lo largo del tiempo producen adaptaciones que parecen diseñadas, sin necesidad de un diseñador.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 18, lang: 'es', text: 'En el vacío del espacio no hay aire que transmita el sonido. Por eso una explosión real en el espacio sería silenciosa para un observador cercano, aunque la luz de la explosión sí viajaría.', source: 'NASA. (n.d.). Sound in space.' },
  { level: 19, lang: 'es', text: 'Aristóteles distinguió entre potencia y acto: lo que algo puede llegar a ser y lo que ya es. Esa distinción influyó siglos de metafísica y sigue alimentando debates sobre cambio e identidad.', source: 'Aristóteles. (ca. 350 a. C.). Metafísica.' },
  { level: 20, lang: 'es', text: 'La misión Apolo no fue un salto improvisado. Fue el resultado de décadas de física orbital, materiales nuevos, computación primitiva y un esfuerzo colectivo que convirtió ecuaciones en naves capaces de ir y volver de otro mundo.', source: 'NASA. (1969–1972). Apollo program documentation.' },
  // EN — parallel set (1–20)
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

  // ES 21–30
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
  // EN 21–30
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

  // ES 31–50
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

  // EN 31–50
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

  // ES 51–70
  { level: 51, lang: 'es', text: 'La radiación de Hawking sugiere que los agujeros negros no son completamente negros: emiten partículas térmicas debidas a efectos cuánticos cerca del horizonte, y con el tiempo podrían evaporarse.', source: 'Hawking, S. (1975). Particle creation by black holes. Communications in Mathematical Physics.' },
  { level: 52, lang: 'es', text: 'El experimento de Michelson-Morley no detectó el éter luminífero. Ese resultado negativo abrió el camino a la relatividad especial y mostró que la velocidad de la luz es la misma para todos los observadores inerciales.', source: 'Michelson, A. A., & Morley, E. W. (1887). American Journal of Science.' },
  { level: 53, lang: 'es', text: 'La homeostasis mantiene variables internas dentro de rangos estrechos. Sin mecanismos de retroalimentación negativa, la temperatura, el pH o la concentración de glucosa oscilarían hasta niveles incompatibles con la vida.', source: 'Cannon, W. B. (1929). Physiological Reviews.' },
  { level: 54, lang: 'es', text: 'La paradoja de Fermi pregunta: si el universo es vasto y antiguo, ¿dónde están las otras civilizaciones? Las respuestas posibles van desde la rareza de la vida inteligente hasta la destrucción o el silencio deliberado.', source: 'Fermi, E. (1950). Conversación informal, Los Alamos.' },
  { level: 55, lang: 'es', text: 'El libre albedrío choca con el determinismo físico. Algunas propuestas apelan a la indeterminación cuántica; otras reformulan la libertad como compatibilidad entre acciones y caracteres formados.', source: 'Dennett, D. (2003). Freedom Evolves.' },
  { level: 56, lang: 'es', text: 'La tabla periódica organiza los elementos por número atómico y propiedades periódicas. Mendeleiev dejó huecos que luego se llenaron con descubrimientos, mostrando el poder predictivo de la clasificación.', source: 'Mendeleev, D. (1869). Zeitschrift für Chemie.' },
  { level: 57, lang: 'es', text: 'La teoría de la información de Shannon cuantifica la incertidumbre y la capacidad de un canal. Un bit no es solo un dígito binario: es una medida de reducción de incertidumbre en un mensaje.', source: 'Shannon, C. E. (1948). A Mathematical Theory of Communication.' },
  { level: 58, lang: 'es', text: 'Los fósiles de homininos muestran una historia de bipedismo, aumento del cerebro y herramientas. No hay una línea única hacia el ser humano actual, sino un árbol con ramas extintas y convergencias.', source: 'Leakey, R., & Lewin, R. (1992). Origins Reconsidered.' },
  { level: 59, lang: 'es', text: 'La dualidad onda-partícula no es una metáfora: el mismo sistema físico exhibe comportamientos ondulatorios o corpusculares según el tipo de medición. La complementariedad de Bohr intenta capturar esa tensión.', source: 'Bohr, N. (1928). Nature.' },
  { level: 60, lang: 'es', text: 'El calentamiento global observado desde el siglo XX se atribuye principalmente al aumento de gases de efecto invernadero por actividades humanas. El consenso científico se basa en múltiples líneas independientes de evidencia.', source: 'IPCC. (2021). Climate Change 2021: The Physical Science Basis.' },
  { level: 61, lang: 'es', text: 'La ética utilitarista de Mill sostiene que las acciones son correctas en la medida en que promueven la felicidad e incorrectas cuando tienden a producir lo contrario. El cálculo de consecuencias exige cuidado con efectos a largo plazo.', source: 'Mill, J. S. (1861). Utilitarianism.' },
  { level: 62, lang: 'es', text: 'La materia ordinaria —átomos de la tabla periódica— constituye solo una pequeña fracción del contenido del universo. Materia oscura y energía oscura dominan, aunque no las detectamos de forma directa.', source: 'Planck Collaboration. (2018). Astronomy & Astrophysics.' },
  { level: 63, lang: 'es', text: 'El principio antrópico señala que las constantes físicas parecen sintonizadas para permitir la vida. Algunos lo ven como evidencia de diseño; otros, como sesgo de selección: solo en universos habitables hay observadores.', source: 'Carter, B. (1974). Large Number Coincidences and the Anthropic Principle.' },
  { level: 64, lang: 'es', text: 'Las células eucariotas poseen orgánulos con genomas propios, restos de antiguas simbiosis. La teoría endosimbiótica explica mitocondrias y cloroplastos como bacterias que se integraron de forma permanente.', source: 'Margulis, L. (1970). Origin of Eukaryotic Cells.' },
  { level: 65, lang: 'es', text: 'La relatividad general y la mecánica cuántica son extraordinariamente exitosas en sus dominios, pero incompatibles en el régimen de gravitación fuerte y escalas pequeñas. Una teoría cuántica de la gravedad sigue pendiente.', source: 'Rovelli, C. (2004). Quantum Gravity.' },
  { level: 66, lang: 'es', text: 'El lenguaje no solo describe el mundo: lo estructura. Las categorías gramaticales y el vocabulario influyen en qué distinciones percibimos con facilidad y cuáles pasan desapercibidas.', source: 'Whorf, B. L. (1956). Language, Thought, and Reality.' },
  { level: 67, lang: 'es', text: 'La vida en la Tierra depende de un conjunto reducido de elementos y de un solvente líquido. La búsqueda de exoplanetas habitables se centra en zonas donde el agua líquida podría existir de forma estable.', source: 'NASA. (n.d.). Habitable zone.' },
  { level: 68, lang: 'es', text: 'El teorema de Bell y los experimentos posteriores muestran que ninguna teoría de variables ocultas locales puede reproducir todas las predicciones de la mecánica cuántica. El no-localismo parece ineludible.', source: 'Bell, J. S. (1964). Physics.' },
  { level: 69, lang: 'es', text: 'La neurociencia de la decisión revela que la actividad cerebral predictora de una elección puede detectarse antes de que el sujeto sea consciente de haber decidido. Eso reabre debates sobre la agencia.', source: 'Libet, B. (1985). Behavioral and Brain Sciences.' },
  { level: 70, lang: 'es', text: 'La filosofía de la mente enfrenta el problema de la intencionalidad: cómo estados físicos pueden ser acerca de algo. Las representaciones mentales parecen apuntar a objetos y propiedades fuera de sí mismas.', source: 'Brentano, F. (1874). Psychology from an Empirical Standpoint.' },

  // EN 51–70
  { level: 51, lang: 'en', text: 'Hawking radiation suggests black holes are not completely black: they emit thermal particles due to quantum effects near the horizon and may eventually evaporate.', source: 'Hawking, S. (1975). Particle creation by black holes. Communications in Mathematical Physics.' },
  { level: 52, lang: 'en', text: 'The Michelson-Morley experiment detected no luminiferous ether. That null result opened the path to special relativity and showed that the speed of light is the same for all inertial observers.', source: 'Michelson, A. A., & Morley, E. W. (1887). American Journal of Science.' },
  { level: 53, lang: 'en', text: 'Homeostasis keeps internal variables within narrow ranges. Without negative-feedback mechanisms, temperature, pH or glucose concentration would swing to levels incompatible with life.', source: 'Cannon, W. B. (1929). Physiological Reviews.' },
  { level: 54, lang: 'en', text: 'Fermi’s paradox asks: if the universe is vast and ancient, where are the other civilisations? Possible answers range from the rarity of intelligent life to destruction or deliberate silence.', source: 'Fermi, E. (1950). Informal conversation, Los Alamos.' },
  { level: 55, lang: 'en', text: 'Free will collides with physical determinism. Some proposals appeal to quantum indeterminacy; others reframe freedom as compatibility between actions and formed character.', source: 'Dennett, D. (2003). Freedom Evolves.' },
  { level: 56, lang: 'en', text: 'The periodic table organises elements by atomic number and periodic properties. Mendeleev left gaps that were later filled by discoveries, showing the predictive power of classification.', source: 'Mendeleev, D. (1869). Zeitschrift für Chemie.' },
  { level: 57, lang: 'en', text: 'Shannon’s information theory quantifies uncertainty and channel capacity. A bit is not merely a binary digit: it is a measure of uncertainty reduction in a message.', source: 'Shannon, C. E. (1948). A Mathematical Theory of Communication.' },
  { level: 58, lang: 'en', text: 'Hominin fossils show a history of bipedalism, brain enlargement and tools. There is no single line to modern humans, but a tree with extinct branches and convergences.', source: 'Leakey, R., & Lewin, R. (1992). Origins Reconsidered.' },
  { level: 59, lang: 'en', text: 'Wave-particle duality is not a metaphor: the same physical system exhibits wave-like or particle-like behaviour according to the type of measurement. Bohr’s complementarity tries to capture that tension.', source: 'Bohr, N. (1928). Nature.' },
  { level: 60, lang: 'en', text: 'Observed global warming since the twentieth century is attributed mainly to the rise of greenhouse gases from human activities. Scientific consensus rests on multiple independent lines of evidence.', source: 'IPCC. (2021). Climate Change 2021: The Physical Science Basis.' },
  { level: 61, lang: 'en', text: 'Mill’s utilitarian ethics holds that actions are right insofar as they promote happiness and wrong as they tend to produce the reverse. Calculating consequences requires care with long-term effects.', source: 'Mill, J. S. (1861). Utilitarianism.' },
  { level: 62, lang: 'en', text: 'Ordinary matter — atoms of the periodic table — constitutes only a small fraction of the universe’s content. Dark matter and dark energy dominate, though we do not detect them directly.', source: 'Planck Collaboration. (2018). Astronomy & Astrophysics.' },
  { level: 63, lang: 'en', text: 'The anthropic principle notes that physical constants appear tuned to allow life. Some see evidence of design; others, a selection bias: only in habitable universes are there observers.', source: 'Carter, B. (1974). Large Number Coincidences and the Anthropic Principle.' },
  { level: 64, lang: 'en', text: 'Eukaryotic cells possess organelles with their own genomes, remnants of ancient symbioses. The endosymbiotic theory explains mitochondria and chloroplasts as bacteria that became permanent partners.', source: 'Margulis, L. (1970). Origin of Eukaryotic Cells.' },
  { level: 65, lang: 'en', text: 'General relativity and quantum mechanics are extraordinarily successful in their domains yet incompatible in the regime of strong gravity and small scales. A quantum theory of gravity remains pending.', source: 'Rovelli, C. (2004). Quantum Gravity.' },
  { level: 66, lang: 'en', text: 'Language does not merely describe the world: it structures it. Grammatical categories and vocabulary influence which distinctions we notice easily and which pass unnoticed.', source: 'Whorf, B. L. (1956). Language, Thought, and Reality.' },
  { level: 67, lang: 'en', text: 'Life on Earth depends on a limited set of elements and a liquid solvent. The search for habitable exoplanets focuses on zones where liquid water could exist stably.', source: 'NASA. (n.d.). Habitable zone.' },
  { level: 68, lang: 'en', text: 'Bell’s theorem and later experiments show that no local hidden-variable theory can reproduce all predictions of quantum mechanics. Non-locality appears inescapable.', source: 'Bell, J. S. (1964). Physics.' },
  { level: 69, lang: 'en', text: 'Decision neuroscience reveals that brain activity predicting a choice can be detected before the subject is aware of having decided. That reopens debates about agency.', source: 'Libet, B. (1985). Behavioral and Brain Sciences.' },
  { level: 70, lang: 'en', text: 'Philosophy of mind faces the problem of intentionality: how physical states can be about something. Mental representations seem to point to objects and properties outside themselves.', source: 'Brentano, F. (1874). Psychology from an Empirical Standpoint.' },

  // ES 71–90
  { level: 71, lang: 'es', text: 'La expansión del universo no es el movimiento de galaxias a través de un espacio fijo, sino el estiramiento del propio espacio. Las galaxias lejanas se alejan porque el tejido entre ellas crece.', source: 'Hubble, E. (1929). Proceedings of the National Academy of Sciences.' },
  { level: 72, lang: 'es', text: 'La ética del cuidado enfatiza relaciones, responsabilidad y contexto frente a reglas abstractas universales. Surge en parte como crítica a modelos que priorizan imparcialidad sobre vínculos concretos.', source: 'Gilligan, C. (1982). In a Different Voice.' },
  { level: 73, lang: 'es', text: 'Los neutrinos atraviesan la Tierra casi sin interactuar. Su masa, aunque diminuta, implica física más allá del modelo estándar y abre ventanas a procesos del universo temprano.', source: 'Particle Data Group. (2022). Review of Particle Physics.' },
  { level: 74, lang: 'es', text: 'La selección de grupo y la selección de parentesco intentan explicar el altruismo. Genes que favorecen el sacrificio por parientes cercanos pueden propagarse aunque reduzcan la aptitud individual.', source: 'Hamilton, W. D. (1964). Journal of Theoretical Biology.' },
  { level: 75, lang: 'es', text: 'El problema de la medición en mecánica cuántica pregunta cómo y cuándo la superposición se convierte en un resultado definido. Interpretaciones rivalizan: colapso, muchos mundos, variables ocultas.', source: 'von Neumann, J. (1932). Mathematical Foundations of Quantum Mechanics.' },
  { level: 76, lang: 'es', text: 'La biodiversidad no es solo número de especies: incluye diversidad genética y de ecosistemas. Su pérdida reduce la resiliencia ante cambios ambientales y limita recursos futuros.', source: 'IPBES. (2019). Global Assessment Report.' },
  { level: 77, lang: 'es', text: 'La filosofía de la tecnología examina cómo las herramientas median nuestra relación con el mundo. Un martillo o un algoritmo no son neutrales: reconfiguran posibilidades y riesgos.', source: 'Heidegger, M. (1954). The Question Concerning Technology.' },
  { level: 78, lang: 'es', text: 'Las ondas gravitacionales, predichas por Einstein, fueron detectadas en 2015. Confirman que el espacio-tiempo puede ondular y abren una nueva astronomía que no depende de la luz.', source: 'Abbott, B. P. et al. (2016). Physical Review Letters.' },
  { level: 79, lang: 'es', text: 'El escepticismo radical de Descartes —dudar de todo lo que pueda ser falso— sirve como método para alcanzar certezas. El cogito sobrevive incluso a la hipótesis del genio maligno.', source: 'Descartes, R. (1641). Meditaciones metafísicas.' },
  { level: 80, lang: 'es', text: 'La química prebiótica investiga cómo moléculas orgánicas simples pudieron originar sistemas autorreplicativos. Experimentos tipo Miller-Urey muestran rutas posibles, aunque el camino completo sigue abierto.', source: 'Miller, S. L. (1953). Science.' },
  { level: 81, lang: 'es', text: 'La teoría de juegos modela decisiones estratégicas donde el resultado depende de las elecciones de otros. El dilema del prisionero ilustra cómo la racionalidad individual puede producir resultados colectivos peores.', source: 'von Neumann, J., & Morgenstern, O. (1944). Theory of Games and Economic Behavior.' },
  { level: 82, lang: 'es', text: 'El cerebro humano consume una fracción desproporcionada de la energía corporal. Esa inversión metabólica sostiene la plasticidad, el aprendizaje y la capacidad de modelar futuros posibles.', source: 'Aiello, L. C., & Wheeler, P. (1995). Current Anthropology.' },
  { level: 83, lang: 'es', text: 'La relatividad general implica que el tiempo transcurre más despacio en campos gravitatorios fuertes. Relojes en la superficie de la Tierra retrasan respecto a relojes en órbita; el GPS debe corregirlo.', source: 'Ashby, N. (2003). Living Reviews in Relativity.' },
  { level: 84, lang: 'es', text: 'La ética deontológica de Kant exige tratar a las personas siempre como fines y nunca solo como medios. El imperativo categórico busca máximas universalizables sin contradicción.', source: 'Kant, I. (1785). Fundamentación de la metafísica de las costumbres.' },
  { level: 85, lang: 'es', text: 'Las supernovas de tipo Ia sirven como candelas estándar: su luminosidad intrínseca permite medir distancias cósmicas. Esa técnica reveló la expansión acelerada del universo.', source: 'Riess, A. G. et al. (1998). The Astronomical Journal.' },
  { level: 86, lang: 'es', text: 'El concepto de emergencia describe propiedades que aparecen en niveles superiores y no se reducen de forma obvia a las partes. La conciencia y la vida son candidatos clásicos de fenómenos emergentes.', source: 'Anderson, P. W. (1972). Science.' },
  { level: 87, lang: 'es', text: 'La biología sintética diseña circuitos genéticos y organismos con funciones nuevas. Plantea preguntas éticas sobre límites de la intervención y responsabilidad ante consecuencias no previstas.', source: 'Endy, D. (2005). Nature.' },
  { level: 88, lang: 'es', text: 'El problema de la inducción de Hume pregunta por qué esperamos que el futuro se asemeje al pasado. Ninguna cantidad de observaciones pasadas garantiza lógicamente la uniformidad de la naturaleza.', source: 'Hume, D. (1748). An Enquiry Concerning Human Understanding.' },
  { level: 89, lang: 'es', text: 'La materia bariónica —protones y neutrones— se formó en los primeros minutos del universo. La nucleosíntesis primordial predice las abundancias de hidrógeno, helio y litio que observamos.', source: 'Alpher, R. A., Bethe, H., & Gamow, G. (1948). Physical Review.' },
  { level: 90, lang: 'es', text: 'La fenomenología de Husserl busca describir la experiencia tal como se presenta, suspendiendo supuestos sobre la existencia del mundo externo. La intencionalidad de la conciencia es su tema central.', source: 'Husserl, E. (1913). Ideas pertaining to a pure phenomenology.' },

  // EN 71–90
  { level: 71, lang: 'en', text: 'The expansion of the universe is not galaxies moving through fixed space, but the stretching of space itself. Distant galaxies recede because the fabric between them grows.', source: 'Hubble, E. (1929). Proceedings of the National Academy of Sciences.' },
  { level: 72, lang: 'en', text: 'Care ethics emphasises relationships, responsibility and context over abstract universal rules. It arose partly as a critique of models that prioritise impartiality over concrete bonds.', source: 'Gilligan, C. (1982). In a Different Voice.' },
  { level: 73, lang: 'en', text: 'Neutrinos pass through Earth almost without interacting. Their tiny mass implies physics beyond the Standard Model and opens windows onto processes of the early universe.', source: 'Particle Data Group. (2022). Review of Particle Physics.' },
  { level: 74, lang: 'en', text: 'Group selection and kin selection attempt to explain altruism. Genes that favour sacrifice for close relatives can spread even if they reduce individual fitness.', source: 'Hamilton, W. D. (1964). Journal of Theoretical Biology.' },
  { level: 75, lang: 'en', text: 'The measurement problem in quantum mechanics asks how and when superposition becomes a definite outcome. Rival interpretations include collapse, many worlds and hidden variables.', source: 'von Neumann, J. (1932). Mathematical Foundations of Quantum Mechanics.' },
  { level: 76, lang: 'en', text: 'Biodiversity is not only species count: it includes genetic and ecosystem diversity. Its loss reduces resilience to environmental change and limits future resources.', source: 'IPBES. (2019). Global Assessment Report.' },
  { level: 77, lang: 'en', text: 'Philosophy of technology examines how tools mediate our relation to the world. A hammer or an algorithm is not neutral: it reconfigures possibilities and risks.', source: 'Heidegger, M. (1954). The Question Concerning Technology.' },
  { level: 78, lang: 'en', text: 'Gravitational waves, predicted by Einstein, were detected in 2015. They confirm that spacetime can ripple and open a new astronomy that does not depend on light.', source: 'Abbott, B. P. et al. (2016). Physical Review Letters.' },
  { level: 79, lang: 'en', text: 'Descartes’ radical scepticism — doubting everything that could be false — serves as a method to reach certainty. The cogito survives even the evil-demon hypothesis.', source: 'Descartes, R. (1641). Meditations on First Philosophy.' },
  { level: 80, lang: 'en', text: 'Prebiotic chemistry investigates how simple organic molecules could give rise to self-replicating systems. Miller-Urey-type experiments show possible routes, though the full path remains open.', source: 'Miller, S. L. (1953). Science.' },
  { level: 81, lang: 'en', text: 'Game theory models strategic decisions where the outcome depends on others’ choices. The prisoner’s dilemma illustrates how individual rationality can produce worse collective results.', source: 'von Neumann, J., & Morgenstern, O. (1944). Theory of Games and Economic Behavior.' },
  { level: 82, lang: 'en', text: 'The human brain consumes a disproportionate fraction of bodily energy. That metabolic investment sustains plasticity, learning and the capacity to model possible futures.', source: 'Aiello, L. C., & Wheeler, P. (1995). Current Anthropology.' },
  { level: 83, lang: 'en', text: 'General relativity implies that time runs more slowly in strong gravitational fields. Clocks on Earth’s surface lag relative to clocks in orbit; GPS must correct for it.', source: 'Ashby, N. (2003). Living Reviews in Relativity.' },
  { level: 84, lang: 'en', text: 'Kant’s deontological ethics requires treating persons always as ends and never merely as means. The categorical imperative seeks universalizable maxims without contradiction.', source: 'Kant, I. (1785). Groundwork of the Metaphysics of Morals.' },
  { level: 85, lang: 'en', text: 'Type Ia supernovae serve as standard candles: their intrinsic luminosity allows measurement of cosmic distances. That technique revealed the accelerated expansion of the universe.', source: 'Riess, A. G. et al. (1998). The Astronomical Journal.' },
  { level: 86, lang: 'en', text: 'The concept of emergence describes properties that appear at higher levels and are not obviously reducible to the parts. Consciousness and life are classic candidates for emergent phenomena.', source: 'Anderson, P. W. (1972). Science.' },
  { level: 87, lang: 'en', text: 'Synthetic biology designs genetic circuits and organisms with new functions. It raises ethical questions about limits of intervention and responsibility for unforeseen consequences.', source: 'Endy, D. (2005). Nature.' },
  { level: 88, lang: 'en', text: 'Hume’s problem of induction asks why we expect the future to resemble the past. No amount of past observation logically guarantees the uniformity of nature.', source: 'Hume, D. (1748). An Enquiry Concerning Human Understanding.' },
  { level: 89, lang: 'en', text: 'Baryonic matter — protons and neutrons — formed in the first minutes of the universe. Primordial nucleosynthesis predicts the abundances of hydrogen, helium and lithium we observe.', source: 'Alpher, R. A., Bethe, H., & Gamow, G. (1948). Physical Review.' },
  { level: 90, lang: 'en', text: 'Husserl’s phenomenology seeks to describe experience as it presents itself, suspending assumptions about the existence of the external world. The intentionality of consciousness is its central theme.', source: 'Husserl, E. (1913). Ideas pertaining to a pure phenomenology.' },

  // ES 91–110
  { level: 91, lang: 'es', text: 'La constante de Hubble mide la tasa actual de expansión del universo. Discrepancias entre mediciones locales y del fondo cósmico sugieren posible nueva física o errores sistemáticos aún no resueltos.', source: 'Riess, A. G. (2020). Nature Reviews Physics.' },
  { level: 92, lang: 'es', text: 'La justicia como equidad de Rawls propone principios elegidos tras un velo de ignorancia: sin saber la posición que se ocupará, se eligen reglas que protegen a los más desfavorecidos.', source: 'Rawls, J. (1971). A Theory of Justice.' },
  { level: 93, lang: 'es', text: 'Los agujeros negros supermasivos en centros galácticos regulan el crecimiento de las galaxias mediante jets y vientos. La coevolución de agujero y galaxia es un tema activo de investigación.', source: 'Kormendy, J., & Ho, L. C. (2013). Annual Review of Astronomy and Astrophysics.' },
  { level: 94, lang: 'es', text: 'La plasticidad cerebral permite que la experiencia reconfigure conexiones. Aprendizaje, recuperación tras lesión y desarrollo dependen de mecanismos moleculares que fortalecen o debilitan sinapsis.', source: 'Hebb, D. O. (1949). The Organization of Behavior.' },
  { level: 95, lang: 'es', text: 'El principio de precaución aconseja actuar ante riesgos graves aunque la evidencia científica no sea completa. Su aplicación en política ambiental genera tensiones con el costo de la inacción y de la sobreacción.', source: 'UNESCO. (2005). The Precautionary Principle.' },
  { level: 96, lang: 'es', text: 'La teoría de cuerdas intenta unificar gravedad y cuántica postulando objetos unidimensionales. Requiere dimensiones extra y aún no ha producido predicciones empíricas únicas y verificables.', source: 'Green, M. B., Schwarz, J. H., & Witten, E. (1987). Superstring Theory.' },
  { level: 97, lang: 'es', text: 'La muerte celular programada (apoptosis) es esencial para el desarrollo y la homeostasis. Fallos en su regulación intervienen en cáncer y enfermedades neurodegenerativas.', source: 'Kerr, J. F., Wyllie, A. H., & Currie, A. R. (1972). British Journal of Cancer.' },
  { level: 98, lang: 'es', text: 'La filosofía de la biología debate si la selección opera solo en genes, en organismos o en múltiples niveles. El debate influye en cómo entendemos adaptación, altruismo y unidades de evolución.', source: 'Okasha, S. (2006). Evolution and the Levels of Selection.' },
  { level: 99, lang: 'es', text: 'El efecto invernadero natural hace habitable la Tierra. El aumento antropogénico de CO2 y otros gases intensifica ese efecto y desplaza el equilibrio radiativo del planeta.', source: 'Arrhenius, S. (1896). Philosophical Magazine.' },
  { level: 100, lang: 'es', text: 'La pregunta por el sentido del universo no tiene respuesta científica única. La física describe cómo evolucionan las estructuras; el significado que les atribuimos pertenece al ámbito de la experiencia humana y la ética.', source: 'Weinberg, S. (1977). The First Three Minutes.' },
  { level: 101, lang: 'es', text: 'Las ondas cerebrales reflejan sincronización de poblaciones neuronales. Oscilaciones en distintas bandas de frecuencia se asocian a atención, memoria y estados de consciencia, aunque la causalidad sigue bajo estudio.', source: 'Buzsaki, G. (2006). Rhythms of the Brain.' },
  { level: 102, lang: 'es', text: 'La singularidad del Big Bang marca el límite de la relatividad clásica. Una teoría cuántica de la gravedad podría eliminar la singularidad o revelar una fase anterior del cosmos.', source: 'Hawking, S., & Penrose, R. (1970). Proceedings of the Royal Society.' },
  { level: 103, lang: 'es', text: 'El concepto de persona en ética y derecho no coincide necesariamente con el de organismo biológico. Criterios de conciencia, autonomía o potencialidad generan debates sobre inicio y final de la vida personal.', source: 'Parfit, D. (1984). Reasons and Persons.' },
  { level: 104, lang: 'es', text: 'La antimateria se aniquila con la materia produciendo energía pura. El universo observable muestra un exceso enorme de materia; el origen de esa asimetría bariónica sigue sin explicación completa.', source: 'Sakharov, A. D. (1967). JETP Letters.' },
  { level: 105, lang: 'es', text: 'La teoría de la decisión estudia cómo elegir bajo incertidumbre. Utilidades esperadas, aversión al riesgo y sesgos cognitivos revelan que la racionalidad humana se desvía de los modelos ideales.', source: 'Kahneman, D., & Tversky, A. (1979). Econometrica.' },
  { level: 106, lang: 'es', text: 'Los planetas extrasolares revelan una diversidad de arquitecturas planetarias. Sistemas con Júpiteres calientes o super-Tierras desafían los modelos de formación basados solo en el Sistema Solar.', source: 'Mayor, M., & Queloz, D. (1995). Nature.' },
  { level: 107, lang: 'es', text: 'La ética animal cuestiona el especismo: la discriminación por especie. Si el sufrimiento importa moralmente, la capacidad de sentir, no la pertenencia a Homo sapiens, debería guiar el trato.', source: 'Singer, P. (1975). Animal Liberation.' },
  { level: 108, lang: 'es', text: 'La información cuántica no puede copiarse de forma perfecta (teorema de no-clonación). Esa propiedad subyace a la criptografía cuántica y limita ciertas operaciones de computación cuántica.', source: 'Wootters, W. K., & Zurek, W. H. (1982). Nature.' },
  { level: 109, lang: 'es', text: 'El envejecimiento celular implica acortamiento de telómeros, daño al ADN y senescencia. Comprender estos mecanismos abre vías para modular la salud en edades avanzadas, no necesariamente la longevidad máxima.', source: 'Hayflick, L. (1965). Experimental Cell Research.' },
  { level: 110, lang: 'es', text: 'La última pregunta abierta de la física fundamental es cómo reconciliar la relatividad general con la mecánica cuántica en un marco coherente. Hasta entonces, el universo en sus extremos más densos y tempranos permanece parcialmente opaco a nuestra comprensión.', source: 'Rovelli, C. (2017). Reality Is Not What It Seems.' },

  // EN 91–110
  { level: 91, lang: 'en', text: 'The Hubble constant measures the current expansion rate of the universe. Discrepancies between local measurements and the cosmic background suggest possible new physics or unresolved systematic errors.', source: 'Riess, A. G. (2020). Nature Reviews Physics.' },
  { level: 92, lang: 'en', text: 'Rawls’s justice as fairness proposes principles chosen behind a veil of ignorance: without knowing one’s position, one selects rules that protect the least advantaged.', source: 'Rawls, J. (1971). A Theory of Justice.' },
  { level: 93, lang: 'en', text: 'Supermassive black holes at galactic centres regulate galaxy growth through jets and winds. The co-evolution of black hole and galaxy is an active research topic.', source: 'Kormendy, J., & Ho, L. C. (2013). Annual Review of Astronomy and Astrophysics.' },
  { level: 94, lang: 'en', text: 'Brain plasticity allows experience to reconfigure connections. Learning, recovery after injury and development depend on molecular mechanisms that strengthen or weaken synapses.', source: 'Hebb, D. O. (1949). The Organization of Behavior.' },
  { level: 95, lang: 'en', text: 'The precautionary principle advises action in the face of serious risks even when scientific evidence is incomplete. Its application in environmental policy creates tensions with the costs of inaction and over-action.', source: 'UNESCO. (2005). The Precautionary Principle.' },
  { level: 96, lang: 'en', text: 'String theory attempts to unify gravity and quantum mechanics by postulating one-dimensional objects. It requires extra dimensions and has not yet produced unique, testable empirical predictions.', source: 'Green, M. B., Schwarz, J. H., & Witten, E. (1987). Superstring Theory.' },
  { level: 97, lang: 'en', text: 'Programmed cell death (apoptosis) is essential for development and homeostasis. Failures in its regulation are involved in cancer and neurodegenerative diseases.', source: 'Kerr, J. F., Wyllie, A. H., & Currie, A. R. (1972). British Journal of Cancer.' },
  { level: 98, lang: 'en', text: 'Philosophy of biology debates whether selection operates only on genes, on organisms or at multiple levels. The debate shapes how we understand adaptation, altruism and units of evolution.', source: 'Okasha, S. (2006). Evolution and the Levels of Selection.' },
  { level: 99, lang: 'en', text: 'The natural greenhouse effect makes Earth habitable. Anthropogenic increase of CO2 and other gases intensifies that effect and shifts the planet’s radiative balance.', source: 'Arrhenius, S. (1896). Philosophical Magazine.' },
  { level: 100, lang: 'en', text: 'The question of the universe’s meaning has no single scientific answer. Physics describes how structures evolve; the significance we attribute to them belongs to the realm of human experience and ethics.', source: 'Weinberg, S. (1977). The First Three Minutes.' },
  { level: 101, lang: 'en', text: 'Brain waves reflect synchronisation of neuronal populations. Oscillations in different frequency bands are associated with attention, memory and states of consciousness, though causality remains under study.', source: 'Buzsaki, G. (2006). Rhythms of the Brain.' },
  { level: 102, lang: 'en', text: 'The Big Bang singularity marks the limit of classical relativity. A quantum theory of gravity might remove the singularity or reveal a prior phase of the cosmos.', source: 'Hawking, S., & Penrose, R. (1970). Proceedings of the Royal Society.' },
  { level: 103, lang: 'en', text: 'The concept of person in ethics and law does not necessarily coincide with that of biological organism. Criteria of consciousness, autonomy or potentiality generate debates about the beginning and end of personal life.', source: 'Parfit, D. (1984). Reasons and Persons.' },
  { level: 104, lang: 'en', text: 'Antimatter annihilates with matter producing pure energy. The observable universe shows a huge excess of matter; the origin of that baryon asymmetry remains incompletely explained.', source: 'Sakharov, A. D. (1967). JETP Letters.' },
  { level: 105, lang: 'en', text: 'Decision theory studies how to choose under uncertainty. Expected utilities, risk aversion and cognitive biases reveal that human rationality departs from ideal models.', source: 'Kahneman, D., & Tversky, A. (1979). Econometrica.' },
  { level: 106, lang: 'en', text: 'Extrasolar planets reveal a diversity of planetary architectures. Systems with hot Jupiters or super-Earths challenge formation models based only on the Solar System.', source: 'Mayor, M., & Queloz, D. (1995). Nature.' },
  { level: 107, lang: 'en', text: 'Animal ethics questions speciesism: discrimination by species. If suffering matters morally, the capacity to feel, not membership in Homo sapiens, should guide treatment.', source: 'Singer, P. (1975). Animal Liberation.' },
  { level: 108, lang: 'en', text: 'Quantum information cannot be copied perfectly (no-cloning theorem). That property underlies quantum cryptography and limits certain quantum-computing operations.', source: 'Wootters, W. K., & Zurek, W. H. (1982). Nature.' },
  { level: 109, lang: 'en', text: 'Cellular ageing involves telomere shortening, DNA damage and senescence. Understanding these mechanisms opens routes to modulate health in later life, not necessarily maximum lifespan.', source: 'Hayflick, L. (1965). Experimental Cell Research.' },
  { level: 110, lang: 'en', text: 'The ultimate open question of fundamental physics is how to reconcile general relativity with quantum mechanics in a coherent framework. Until then, the universe at its densest and earliest extremes remains partially opaque to our understanding.', source: 'Rovelli, C. (2017). Reality Is Not What It Seems.' },
]

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

/** Comparación carácter a carácter (normalizada para no-emojis) */
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

/**
 * Elimina únicamente tildes agudas (á é í ó ú, mayúsculas incluidas).
 * No toca la ñ ni la diéresis (ü), que no son "tildes" de acentuación.
 */
function stripAcutes(text: string): string {
  return text.normalize('NFD').replace(/\u0301/g, '').normalize('NFC')
}

/**
 * Texto de una cita listo para mostrar/comparar en el juego, respetando
 * el switch de tildes. El español respeta el switch; el inglés no tiene
 * tildes españolas que quitar, así que se devuelve tal cual.
 */
function quoteDisplayText(q: QuoteItem, withTildes: boolean): string {
  if (q.lang !== 'es') return q.text
  return withTildes ? q.text : stripAcutes(q.text)
}

/* ─── Componente ────────────────────────────────────────────────────────── */

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
  const [charVerdict, setCharVerdict] = useState<
    { ch: string; ok: boolean | null }[] | null
  >(null)
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
  /** Meta de aciertos de la ronda (niveles pasados = 1..best) */
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
  /** Switch de tildes — activado por defecto. Solo aplica a español. */
  const [tildesOn, setTildesOn] = useState(() => loadBool(TYPING_TILDES_KEY, true))
  const typingStartRef = useRef<number | null>(null)
  const typingTimerRef = useRef<number | null>(null)
  /** Errores permanentes (no bajan al borrar) */
  const typingErrorsRef = useRef(0)
  const typingPrevRef = useRef('')

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
    const ok = verdict.length > 0 && verdict.every((v) => v.ok === true) &&
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
      // ~45% chance of repeating a seen word once we have enough
      const canRepeat = seen.size >= 3 && rng() < 0.45
      if (canRepeat) {
        const arr = [...seen]
        const w = arr[Math.floor(rng() * arr.length)]
        return { word: w, isNew: false }
      }
      // new word not in seen
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
          // continue with a fresh pick; mark current as seen if it was new
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

  /** Máximo nivel disponible para el idioma elegido (hoy: 110 en ES y EN). */
  const maxTypingLevel = useMemo(() => {
    const levels = QUOTES.filter((q) => q.lang === typingLang).map((q) => q.level)
    return levels.length ? Math.max(...levels) : 1
  }, [typingLang])

  /** Texto objetivo real de la cita (a mostrar y comparar), según el switch de tildes. */
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
    // El texto objetivo cambia, así que reiniciamos el intento actual con limpieza.
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

    // Solo cuentan errores al ESCRIBIR (añadir caracteres). El retroceso no los borra.
    if (value.length > prev.length) {
      const added = value.slice(prev.length)
      for (let i = 0; i < added.length; i++) {
        const pos = prev.length + i
        if (added[i] !== target[pos]) {
          typingErrorsRef.current += 1
        }
      }
    }
    // Si value.length <= prev.length (borrado), no tocamos el contador de errores

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
          <div style={{ padding: '1.35rem 1.2rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
              Números asociados
            </h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                fontSize: '0.88rem',
                marginBottom: '1.15rem',
              }}
            >
              Elige un modo de entrenamiento
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(Object.keys(MODE_INFO) as (keyof typeof MODE_INFO)[]).map((m) => {
                const info = MODE_INFO[m]
                const selected = menuPick === m
                return (
                  <button
                    key={m}
                    type="button"
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
                  </button>
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
                }}
              >
                Continuar
              </GlassButton>
            </div>
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
                        color:
                          verbalStrikes >= 2
                            ? 'var(--gco-secondary)'
                            : 'var(--gco-ink)',
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
                  <GlassButton
                    onClick={() => answerVerbal(true)}
                    disabled={!!verbalFeedback}
                  >
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
                {verbalStrikes >= 3 && !verbalPlaying && null}
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

  /* ── Typing UI (Citando al citador) ── */
  if (appMode === 'typing') {
    const q = typingQuote
    const glassPanel: React.CSSProperties = {
      background:
        'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))',
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
            Nivel {typingLevel}/{maxTypingLevel} · 5 errores permiten fallar (no se borran al corregir)
          </p>

          {/* Barra de controles */}
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

          {/* Switch de tildes — solo relevante en español, activado por defecto */}
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
                  background: tildesOn
                    ? 'var(--gco-primary)'
                    : 'rgba(255,255,255,0.12)',
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
                style={{
                  ...glassPanel,
                  padding: '1.1rem 1.15rem',
                  marginBottom: 12,
                  lineHeight: 1.6,
                  fontSize: 'clamp(0.95rem, 2.6vw, 1.08rem)',
                }}
              >
                {typingTarget.split('').map((ch, i) => {
                  let color = 'var(--gco-ink-muted)'
                  if (i < typingInput.length) {
                    color =
                      typingInput[i] === ch
                        ? 'var(--gco-primary)'
                        : 'var(--gco-secondary)'
                  }
                  return (
                    <span key={i} style={{ color }}>
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
            <span className="mono" style={pill}>⏱ {formatDuration(typingMs)}</span>
            <span className="mono" style={pill}>{typingWpm} PPM</span>
            <span
              className="mono"
              style={{
                ...pill,
                color:
                  typingErrors >= 3
                    ? 'var(--gco-secondary)'
                    : 'var(--gco-ink-muted)',
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
              <p style={{ color: 'var(--gco-primary)', fontWeight: 700 }}>
                ¡Nivel superado!
              </p>
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
              <p style={{ color: 'var(--gco-secondary)', fontWeight: 700 }}>
                Demasiados errores
              </p>
              <GlassButton
                style={{ marginTop: 10 }}
                onClick={() => startTypingLevel(typingLevel)}
              >
                Reintentar nivel
              </GlassButton>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Chunks UI (default when appMode === 'chunks') ── */
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
                color:
                  timeLeft <= 10 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
              }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {phase === 'recall' && (
            <span
              className="mono"
              style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}
            >
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
          <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
            Bloques de memoria
          </h2>
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
                {/* progressive switch */}
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
                      <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        Modo progresivo
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                        {useProgressive
                          ? `Nivel actual: ${level}`
                          : 'Sube de nivel con números'}
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

                {/* timer switch */}
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
                      background: useTimer
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
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                    minHeight: 56,
                  }}
                >
                  {!hidden ? (
                    sequence.blocks.map((block, index) => (
                      <span
                        key={`${block}-${index}`}
                        className={
                          sequence.config.charset === 'emojis' ? undefined : 'mono'
                        }
                        style={{
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

                {/* historia oculta a propósito en partida */}

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

                {/* Comparación visual carácter a carácter */}
                {charVerdict && (
                  <div
                    style={{
                      marginTop: '1.1rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--gco-glass-border)',
                      textAlign: 'center',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 8,
                      }}
                    >
                      Tu respuesta · verde = bien · rojo = mal
                    </p>
                    <p
                      className={
                        sequence.config.charset === 'emojis' ? undefined : 'mono'
                      }
                      style={{
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
                          style={{ color: 'var(--gco-primary)', fontWeight: 600 }}
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