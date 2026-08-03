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

/* ─── Citas tipográficas (APA, sin símbolos raros) ───────────────────────── */

type QuoteItem = {
  level: number
  lang: Lang
  text: string
  /** Cita APA breve */
  source: string
}

const QUOTES: QuoteItem[] = [
  // ES — cortas (1–5)
  { level: 1, lang: 'es', text: 'El cielo es azul porque la luz del sol se dispersa en el aire.', source: 'NASA. (n.d.). Why is the sky blue?' },
  { level: 2, lang: 'es', text: 'Solo se que no se nada.', source: 'Platon. (ca. 399 a. C.). Apologia de Socrates.' },
  { level: 3, lang: 'es', text: 'Pienso, luego existo.', source: 'Descartes, R. (1637). Discurso del metodo.' },
  { level: 4, lang: 'es', text: 'La educacion es el arma mas poderosa que puedes usar para cambiar el mundo.', source: 'Mandela, N. (1990). Discurso.' },
  { level: 5, lang: 'es', text: 'No es la especie mas fuerte la que sobrevive, sino la que mejor se adapta.', source: 'Darwin, C. (1859). El origen de las especies.' },
  // ES — medias (6–12)
  { level: 6, lang: 'es', text: 'La gravedad no es una fuerza misteriosa que tira de los objetos: es la curvatura del espacio y el tiempo causada por la masa.', source: 'Einstein, A. (1915). Relatividad general.' },
  { level: 7, lang: 'es', text: 'El agua cubre la mayor parte de la Tierra, pero el agua dulce accesible es una fraccion minuscula de todo el planeta.', source: 'USGS. (n.d.). How much water is there on Earth?' },
  { level: 8, lang: 'es', text: 'La Luna no tiene atmosfera densa; por eso el cielo lunar es negro incluso de dia y las huellas de los astronautas pueden durar millones de anos.', source: 'NASA. (1969). Apollo mission reports.' },
  { level: 9, lang: 'es', text: 'Aristoteles sostuvo que el conocimiento empieza en los sentidos y que la virtud se adquiere con el habito, no solo con la teoria.', source: 'Aristoteles. (ca. 350 a. C.). Etica a Nicomaco.' },
  { level: 10, lang: 'es', text: 'Newton formuló que la misma fuerza que hace caer una manzana mantiene a la Luna en su orbita alrededor de la Tierra.', source: 'Newton, I. (1687). Philosophiae Naturalis Principia Mathematica.' },
  { level: 11, lang: 'es', text: 'El ADN almacena instrucciones en una doble helice; su descubrimiento unio biologia, quimica y fisica en una sola historia de la vida.', source: 'Watson, J., y Crick, F. (1953). Nature.' },
  { level: 12, lang: 'es', text: 'Nietzsche escribio que quien tiene un porque para vivir puede soportar casi cualquier como; el sentido sostiene la voluntad.', source: 'Nietzsche, F. (1889). Crepusculo de los idolos.' },
  // ES — largas (13–20)
  { level: 13, lang: 'es', text: 'Cuando los astronautas del Apolo 11 pisaron la Luna, no solo cumplieron una meta tecnica: demostraron que la ciencia, la ingenieria y la cooperacion pueden llevar a la humanidad mas alla de su planeta de origen.', source: 'NASA. (1969). Apollo 11 Mission Report.' },
  { level: 14, lang: 'es', text: 'La fotosintesis convierte la luz del sol en energia quimica. Sin ese proceso, la mayoria de las cadenas alimentarias de la Tierra colapsarian y el oxigeno que respiramos seria escaso.', source: 'National Geographic. (n.d.). Photosynthesis explained.' },
  { level: 15, lang: 'es', text: 'Socrates no dejo textos propios. Lo que sabemos de su metodo viene de Platon: preguntar sin cesar, examinar las definiciones y preferir la honestidad intelectual a la opinion comoda.', source: 'Platon. (ca. 399 a. C.). Dialogos socraticos.' },
  { level: 16, lang: 'es', text: 'El teorema de Pitagoras relaciona los lados de un triangulo rectangulo. Aunque se asocia a un nombre, culturas anteriores ya usaban relaciones equivalentes en mediciones y construcciones.', source: 'Historia de las matematicas. (n.d.). Teorema de Pitagoras.' },
  { level: 17, lang: 'es', text: 'La teoria de la evolucion no dice que el azar lo explique todo. Dice que la variacion heredable y la seleccion a lo largo del tiempo producen adaptaciones que parecen disenadas, sin necesidad de un disenador.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 18, lang: 'es', text: 'En el vacio del espacio no hay aire que transmita el sonido. Por eso una explosion real en el espacio seria silenciosa para un observador cercano, aunque la luz de la explosion si viajaria.', source: 'NASA. (n.d.). Sound in space.' },
  { level: 19, lang: 'es', text: 'Aristoteles distinguio entre potencia y acto: lo que algo puede llegar a ser y lo que ya es. Esa distincion influyo siglos de metafisica y sigue alimentando debates sobre cambio e identidad.', source: 'Aristoteles. (ca. 350 a. C.). Metafisica.' },
  { level: 20, lang: 'es', text: 'La mision Apolo no fue un salto improvisado. Fue el resultado de decadas de fisica orbital, materiales nuevos, computacion primitiva y un esfuerzo colectivo que convirtio ecuaciones en naves capaces de ir y volver de otro mundo.', source: 'NASA. (1969–1972). Apollo program documentation.' },
  // EN — parallel set
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

  { level: 21, lang: 'es', text: 'La entropia de un sistema aislado tiende a aumentar: el desorden termico crece y no todo proceso es reversible sin costo energetico.', source: 'Clausius, R. (1865). Sobre la segunda ley de la termodinamica.' },
  { level: 22, lang: 'es', text: 'El principio de incertidumbre de Heisenberg afirma que no se puede conocer con precision arbitraria la posicion y el momento de una particula al mismo tiempo.', source: 'Heisenberg, W. (1927). Zeitschrift fur Physik.' },
  { level: 23, lang: 'es', text: 'La relatividad especial muestra que el tiempo no es absoluto: dos observadores en movimiento relativo miden intervalos distintos entre los mismos sucesos.', source: 'Einstein, A. (1905). Sobre la electrodinamica de los cuerpos en movimiento.' },
  { level: 24, lang: 'es', text: 'Las placas tectonicas se mueven sobre el manto; los terremotos y volcanes se concentran en sus bordes, donde la corteza se crea o se destruye.', source: 'USGS. (n.d.). Plate tectonics.' },
  { level: 25, lang: 'es', text: 'La seleccion natural no busca el progreso: conserva variantes que, en un entorno dado, dejan mas descendientes. El contexto ecologico define que es ventajoso.', source: 'Darwin, C. (1859). El origen de las especies.' },
  { level: 26, lang: 'es', text: 'El modelo estandar de particulas describe quarks, leptones y bosones mediadores, pero no incluye la materia oscura ni una teoria cuantica completa de la gravedad.', source: 'CERN. (n.d.). The Standard Model.' },
  { level: 27, lang: 'es', text: 'La fotosintesis oxigenica cambio la atmosfera primitiva: los organismos que liberaban oxigeno transformaron el planeta y abrieron paso a la respiracion aerobica.', source: 'National Geographic. (n.d.). The oxygen revolution.' },
  { level: 28, lang: 'es', text: 'Un agujero negro no es un sumidero cosmico magico: es una region donde la curvatura del espacio tiempo es tan extrema que ni la luz puede escapar del horizonte de sucesos.', source: 'NASA. (n.d.). Black holes.' },
  { level: 29, lang: 'es', text: 'La epigenetica muestra que el ambiente puede influir en la expresion genica sin cambiar la secuencia del ADN, modulando que genes se leen en cada contexto.', source: 'NIH. (n.d.). Epigenetics.' },
  { level: 30, lang: 'es', text: 'La computacion cuantica explota superposicion y entrelazamiento para abordar problemas que escalan mal en computadoras clasicas, aunque el ruido y la decoherencia limitan aun su uso practico.', source: 'IBM Quantum. (n.d.). What is quantum computing?' },
  { level: 21, lang: 'en', text: 'The entropy of an isolated system tends to increase: thermal disorder grows and not every process is reversible without an energy cost.', source: 'Clausius, R. (1865). On the second law of thermodynamics.' },
  { level: 22, lang: 'en', text: 'Heisenberg uncertainty states that position and momentum of a particle cannot both be known to arbitrary precision at the same time.', source: 'Heisenberg, W. (1927). Zeitschrift fur Physik.' },
  { level: 23, lang: 'en', text: 'Special relativity shows that time is not absolute: two observers in relative motion measure different intervals between the same events.', source: 'Einstein, A. (1905). On the electrodynamics of moving bodies.' },
  { level: 24, lang: 'en', text: 'Tectonic plates move over the mantle; earthquakes and volcanoes cluster at their edges, where crust is created or destroyed.', source: 'USGS. (n.d.). Plate tectonics.' },
  { level: 25, lang: 'en', text: 'Natural selection does not aim at progress: it keeps variants that leave more offspring in a given environment. Ecology defines what is advantageous.', source: 'Darwin, C. (1859). On the Origin of Species.' },
  { level: 26, lang: 'en', text: 'The Standard Model describes quarks, leptons, and force carriers, but it does not include dark matter or a full quantum theory of gravity.', source: 'CERN. (n.d.). The Standard Model.' },
  { level: 27, lang: 'en', text: 'Oxygenic photosynthesis changed the early atmosphere: organisms that released oxygen transformed the planet and enabled aerobic respiration.', source: 'National Geographic. (n.d.). The oxygen revolution.' },
  { level: 28, lang: 'en', text: 'A black hole is not a magical cosmic drain: it is a region where spacetime curvature is so extreme that light cannot escape the event horizon.', source: 'NASA. (n.d.). Black holes.' },
  { level: 29, lang: 'en', text: 'Epigenetics shows that the environment can influence gene expression without changing DNA sequence, modulating which genes are read in each context.', source: 'NIH. (n.d.). Epigenetics.' },
  { level: 30, lang: 'en', text: 'Quantum computing exploits superposition and entanglement for problems that scale poorly on classical machines, though noise and decoherence still limit practical use.', source: 'IBM Quantum. (n.d.). What is quantum computing?' },

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

  const maxTypingLevel = 30


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
    const target = typingQuote.text
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
                  if (menuPick === 'typing') startTypingLevel(1)
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
                      Niveles pasados (meta) ▾
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

  /* ── Typing UI ── */
  if (appMode === 'typing') {
    const q = typingQuote
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
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← Modos
          </button>
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)' }}>
            Mejor nv. {typingBest}
          </span>
        </header>
        <GlassCard>
          <div style={{ padding: '1.25rem 1.15rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 4 }}>⌨️ Citando al citador</h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gco-ink-muted)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              Nivel {typingLevel}/{maxTypingLevel} · 5 errores (no se borran al corregir)
            </p>

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              {(['es', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`glass-button ${typingLang === l ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => {
                    soundClick()
                    setTypingLang(l)
                    startTypingLevel(typingLevel)
                  }}
                >
                  {l === 'es' ? 'Español' : 'English'}
                </button>
              ))}
              <button
                type="button"
                className="glass-button secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                onClick={() => {
                  soundClick()
                  setShowTypingLevels((v) => !v)
                }}
              >
                Niveles ▾
              </button>
            </div>

            {showTypingLevels && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  justifyContent: 'center',
                  marginBottom: 12,
                  maxHeight: 140,
                  overflow: 'auto',
                }}
              >
                {Array.from({ length: maxTypingLevel }, (_, i) => i + 1).map((n) => {
                  const unlocked = n <= Math.max(typingBest + 1, 1)
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!unlocked}
                      className={`glass-button ${typingLevel === n ? '' : 'secondary'}`}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.35rem 0.55rem',
                        opacity: unlocked ? 1 : 0.4,
                      }}
                      onClick={() => {
                        if (!unlocked) return
                        soundClick()
                        startTypingLevel(n)
                      }}
                    >
                      Nv. {n}
                    </button>
                  )
                })}
              </div>
            )}

            {q && (
              <>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '1rem',
                    marginBottom: 12,
                    lineHeight: 1.55,
                    fontSize: '1.02rem',
                  }}
                >
                  {q.text.split('').map((ch, i) => {
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
                    marginBottom: 12,
                    fontStyle: 'italic',
                  }}
                >
                  {q.source}
                </p>
              </>
            )}

            <div
              style={{
                display: 'flex',
                gap: 14,
                justifyContent: 'center',
                marginBottom: 10,
                fontSize: '0.85rem',
                flexWrap: 'wrap',
              }}
            >
              <span className="mono">⏱ {formatDuration(typingMs)}</span>
              <span className="mono">{typingWpm} PPM</span>
              <span
                className="mono"
                style={{
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
                lineHeight: 1.45,
                marginBottom: 12,
              }}
            />

            {typingDone && (
              <div style={{ textAlign: 'center' }}>
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
                    <p style={{ color: 'var(--gco-primary)' }}>Completaste los 30 niveles</p>
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
              <div style={{ textAlign: 'center' }}>
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
        </GlassCard>
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
