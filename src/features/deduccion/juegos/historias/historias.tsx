import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundFail, soundSuccess, soundStart, soundToggle } from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'historias'
const TOTAL_LEVELS = 220
const TIMER_BASE = 95
const COMPLETED_KEY = 'gco_historias_completed_v3'

// ============================================================================
// Tipos
// ============================================================================

type CaseItem = {
  id: string
  title: string
  story: string
  /** Cita APA / fuente */
  source: string
  question: string
  /** Pista analítica sin revelar la respuesta */
  hint: string
  /** Consejo al fallar, sin revelar la opción correcta */
  failAdvice: string
  /** Opciones en orden canónico (se barajan al servir el nivel) */
  options: string[]
  /** Índice de la correcta en el array canónico options */
  correctCanonical: number
  region?: string
  difficulty?: 1 | 2 | 3 | 4 | 5
}

type ServedCase = CaseItem & {
  /** Opciones ya barajadas para esta partida */
  options: string[]
  /** Índice correcto tras el barajado */
  correct: number
}

// ============================================================================
// Utilidades
// ============================================================================

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  const rnd = mulberry32(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function serveCase(base: CaseItem, salt: number): ServedCase {
  const seed = hashStr(`${base.id}|${salt}|${base.title}`)
  const indexed = base.options.map((text, i) => ({ text, i }))
  const shuffled = shuffle(indexed, seed)
  const options = shuffled.map((x) => x.text)
  const correct = shuffled.findIndex((x) => x.i === base.correctCanonical)
  return {
    ...base,
    options,
    correct: correct >= 0 ? correct : 0,
  }
}

function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveCompleted(set: Set<string>) {
  try {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Banco de casos
//  - Se conservan los casos originales (educativos / lógica)
//  - Se añaden muchos casos de policía, detectives e investigaciones
//    reales o históricas de todo el mundo (análisis público, sin métodos
//    operativos peligrosos). Cada uno con fuente tipo APA.
// ============================================================================

const CASES: CaseItem[] = [
  // ---------- Casos originales (conservados, con hint/failAdvice) ----------
  {
    id: 'h1',
    title: 'La biblioteca de Alejandría',
    story:
      'En el siglo III a. C., la Biblioteca de Alejandría reunió rollos de todo el Mediterráneo. No fue un edificio eterno: sufrió incendios parciales, saqueos y el declive del mecenazgo. Lo perdido no fue solo soporte físico, sino redes de copia. La idea de un único incendio catastrófico atribuido solo a César choca con el deterioro acumulativo que documentan los historiadores.',
    source: 'Canfora, L. (1986). The vanished library. University of California Press. / Bagnall, R. S. (2002). Alexandria: Library of dreams. Proceedings of the American Philosophical Society, 146(4), 348–362.',
    question: '¿Qué conclusión es más coherente con la evidencia del relato?',
    hint: 'Compara la tesis del “único culpable y un solo día” con la idea de pérdidas acumuladas a lo largo de siglos. ¿Qué peso da el texto a cada una?',
    failAdvice: 'Relee la parte sobre incendios parciales, saqueos y mecenazgo. La conclusión más económica no atribuye toda la pérdida a un solo acto.',
    options: [
      'Un solo incendio de César lo destruyó todo de golpe',
      'La pérdida fue gradual por incendios, saqueos y menos apoyo',
      'La biblioteca nunca existió realmente en Alejandría',
      'Solo se perdieron textos de matemáticas y nada más',
      'Los rollos se salvaron íntegros en un sótano secreto',
      'El declive se debió solo a un terremoto del siglo I',
      'César ordenó quemar cada rollo personalmente',
      'La biblioteca se trasladó completa a Roma sin pérdidas',
    ],
    correctCanonical: 1,
    region: 'Mediterráneo antiguo',
    difficulty: 2,
  },
  {
    id: 'h2',
    title: 'El reloj de la estación',
    story:
      'Un testigo: «Salí del tren a las 8:00; el reloj de la estación marcaba 8:00». Otro: «Ese reloj lleva tres minutos adelantado desde ayer». Un tercero: «El tren llegó con dos minutos de retraso según el horario oficial». El horario oficial de llegada era 7:58. Nadie miente a propósito, pero pueden equivocarse de referencia.',
    source: 'Caso didáctico de lógica temporal (estilo Smullyan). Elaborado para este módulo.',
    question: '¿Qué es lo más probable sobre la hora real de llegada?',
    hint: 'Alinea tres relojes mentales: horario oficial, reloj de estación (+3) y percepción del testigo. Busca el intervalo compatible con todas las afirmaciones.',
    failAdvice: 'No asumas que “marcó 8:00” significa 8:00 reales. Resta el adelanto del reloj y cruza con el retraso oficial.',
    options: [
      'Llegó exactamente a las 8:00 reales sin duda alguna',
      'Llegó cerca de las 7:55 según el reloj de estación',
      'Llegó hacia 7:57–7:58 reales, compatible con el retraso',
      'El tren no llegó ese día en absoluto al andén',
      'Todos los relojes marcaban la misma hora real',
      'El testigo salió forzosamente a las 8:03 reales',
      'El reloj de estación iba retrasado tres minutos',
      'La hora oficial y la real coinciden siempre aquí',
    ],
    correctCanonical: 2,
    region: 'Lógica',
    difficulty: 3,
  },
  {
    id: 'h3',
    title: 'Sócrates y el oráculo',
    story:
      'El oráculo de Delfos dijo que nadie era más sabio que Sócrates. Él interpretó que su sabiduría era reconocer la propia ignorancia. No hay escritos de Sócrates: dependemos de Platón, Jenofonte y Aristófanes, con agendas distintas.',
    source: 'Platón. (s. IV a. C./2002). Apología de Sócrates. Gredos. / Guthrie, W. K. C. (1971). Socrates. Cambridge University Press.',
    question: '¿Qué afirmación es más prudente históricamente?',
    hint: 'Piensa en capas de transmisión: ¿tenemos acceso directo a la voz de Sócrates o solo a retratos literarios enfrentados?',
    failAdvice: 'Descarta cualquier opción que afirme acceso literal sin filtro a sus palabras. Quédate con la reconstrucción a partir de testimonios parciales.',
    options: [
      'Conocemos las palabras exactas de Sócrates sin filtro',
      'Solo Aristófanes es fuente fiable de su pensamiento',
      'Reconstruimos un perfil a partir de testimonios parciales',
      'El oráculo escribió un tratado firmado por Sócrates',
      'Jenofonte y Platón coinciden en cada detalle biográfico',
      'Sócrates negó siempre cualquier sabiduría práctica',
      'No existió ningún Sócrates fuera de la ficción platónica',
      'El método socrático está grabado en inscripciones áticas',
    ],
    correctCanonical: 2,
    region: 'Grecia clásica',
    difficulty: 2,
  },
  {
    id: 'h4',
    title: 'La carta anónima',
    story:
      'Oficina de cinco personas (A–E). Tinta del bolígrafo común. A estaba de viaje el día del sello. B y C se vieron en la sala a las 10:00. El portero vio a D salir a las 9:40 con un sobre. E no usa esa marca de bolígrafo y tiene coartada médica. El sello es de las 10:15 en correos (5 minutos a pie).',
    source: 'Caso detective didáctico (restricciones temporales). Elaborado para este módulo.',
    question: '¿Quién es el sospechoso más sólido con los datos dados?',
    hint: 'Elimina quien tiene coartada fuerte o incompatibilidad de herramienta. Luego mira ventanas temporales hasta el matasellos.',
    failAdvice: 'A está de viaje; E no usa ese bolígrafo. B y C se vigilan mutuamente a las 10:00. Calcula si D pudo llegar a correos a las 10:15.',
    options: [
      'A, porque viajar no impide enviar cartas desde lejos',
      'E, pese a la coartada y al bolígrafo distinto',
      'D, por el sobre y el tiempo para llegar a correos',
      'B en solitario, ignorando el testimonio de C',
      'C en solitario, ignorando el testimonio de B',
      'Nadie: los datos excluyen a todos por completo',
      'A y E a la vez de forma necesaria y conjunta',
      'Solo el portero pudo haber escrito la carta',
    ],
    correctCanonical: 2,
    region: 'Detective didáctico',
    difficulty: 3,
  },
  {
    id: 'h5',
    title: 'Darwin y la adaptación',
    story:
      'Darwin no afirmó que el azar explique “todo”. Propuso variación heredable y selección a lo largo del tiempo. Estructuras que parecen diseñadas pueden surgir sin diseñador consciente. Confundir “sin propósito consciente” con “sin causa” es un error frecuente.',
    source: 'Darwin, C. (1859). On the origin of species. John Murray. / Mayr, E. (1991). One long argument. Harvard University Press.',
    question: '¿Qué lectura es más fiel al argumento darwiniano clásico?',
    hint: 'Separa “sin diseñador consciente” de “sin mecanismo causal”. ¿Qué mecanismo propone el texto?',
    failAdvice: 'La opción correcta admite causas naturales (variación + selección), no niega causas ni exige un diseñador intencional.',
    options: [
      'La evolución niega cualquier causa natural de las formas',
      'Toda adaptación exige un diseñador con intención clara',
      'La selección sobre variación puede generar adaptaciones',
      'Darwin negó por completo el papel de la herencia',
      'Solo el azar puro, sin filtrado, basta para órganos',
      'Las especies son fijas y solo cambia el clima local',
      'La selección elimina variación en una sola generación',
      'El diseño aparente prueba diseño consciente necesario',
    ],
    correctCanonical: 2,
    region: 'Historia de la ciencia',
    difficulty: 2,
  },
  {
    id: 'h6',
    title: 'El cuadro robado',
    story:
      'El museo cierra a las 18:00. Las cámaras del pasillo se reinician a las 18:05 (hueco de 90 s). El alarma del cuadro se desactiva con llave de dos guardias (G1, G2) o código del director. G1 firma a las 18:02; G2 a las 18:08. El director cenaba con testigos desde las 17:30. A las 18:20 el hueco está vacío. No hay rotura de cristal.',
    source: 'Caso inventado (cadena de custodia y tiempos). Elaborado para este módulo.',
    question: '¿Qué hipótesis es más económica con los hechos?',
    hint: 'Lista quién tenía medio de desactivar la alarma y quién estaba físicamente disponible entre el reinicio de cámaras y las 18:20.',
    failAdvice: 'El director tiene coartada de cena. G1 firmó muy pronto. Observa la ventana tras 18:05 y la firma de G2 a las 18:08.',
    options: [
      'El director salió de la cena sin que nadie lo notara',
      'G1 solo, tras firmar, usó el hueco de las cámaras',
      'Alguien con acceso entre reinicio y 18:20, p. ej. G2',
      'El cuadro nunca estuvo en la sala esa tarde',
      'Las cámaras demuestran que no hubo persona alguna',
      'G1 y el director actuaron juntos durante la cena',
      'El alarma falló sin intervención humana posible',
      'Solo un visitante del mediodía pudo llevárselo',
    ],
    correctCanonical: 2,
    region: 'Detective didáctico',
    difficulty: 3,
  },
  {
    id: 'h7',
    title: 'Newton y la manzana',
    story:
      'La anécdota de la manzana es tardía y divulgativa. Newton formuló que la misma ley describe la caída terrestre y el movimiento orbital. El logro no es la fruta, sino unificar mecánica terrestre y celeste con matemáticas precisas.',
    source: 'Westfall, R. S. (1980). Never at rest: A biography of Isaac Newton. Cambridge University Press. / Newton, I. (1687). Philosophiæ naturalis principia mathematica.',
    question: '¿Qué enfatiza mejor el aporte newtoniano aquí?',
    hint: 'Distingue anécdota popular de contenido teórico. ¿Qué unifica el texto?',
    failAdvice: 'No elijas opciones centradas en la fruta o en negaciones absurdas. Busca la unificación matemática de caída y órbitas.',
    options: [
      'Que las manzanas caen más rápido que las plumas siempre',
      'La unificación matemática de caída y órbitas',
      'Que la Luna está hecha del mismo material que la Tierra',
      'La invención exclusiva de la gravedad por una fruta',
      'Que no hay fuerzas a distancia en absoluto',
      'Solo la descripción cualitativa sin ecuaciones',
      'El rechazo total de la geometría en la física',
      'Que Kepler ya había escrito las tres leyes de fuerza',
    ],
    correctCanonical: 1,
    region: 'Historia de la ciencia',
    difficulty: 1,
  },
  {
    id: 'h8',
    title: 'La mentira del faro',
    story:
      'Tres fareros A, B y C. Uno siempre dice verdad, uno siempre miente, uno alterna. A: «B es el alternante». B: «C es el mentiroso». C: «A es el alternante». Solo una asignación es consistente.',
    source: 'Puzzle de lógica (variante al estilo de Smullyan, R. What is the name of this book?).',
    question: '¿Quién es el que siempre dice la verdad?',
    hint: 'Prueba por casos: asume un rol para A y propaga restricciones. Descarta configuraciones que generen dos alternantes o cero mentirosos.',
    failAdvice: 'Si A fuera veraz, B sería alternante; sigue la cadena hasta contradicción o coherencia. Repite con B y C como veraces.',
    options: [
      'A es el veraz en esta configuración',
      'B es el veraz en esta configuración',
      'C es el veraz en esta configuración',
      'No hay veraz entre los tres fareros',
      'A y B son veraces a la vez',
      'B y C son veraces a la vez',
      'Todos alternan sin veraz fijo',
      'La pregunta no tiene solución lógica',
    ],
    correctCanonical: 1,
    region: 'Lógica',
    difficulty: 4,
  },
  {
    id: 'h9',
    title: 'Fotosíntesis y oxígeno',
    story:
      'La fotosíntesis convierte luz en energía química y libera oxígeno en la fase lumínica de plantas y cianobacterias. Sin ese proceso histórico, la atmósfera oxidante actual no se habría formado igual. No implica que toda la biomasa dependa de un solo árbol.',
    source: 'Campbell, N. A., & Reece, J. B. (2005). Biology (7th ed.). Benjamin Cummings.',
    question: '¿Qué afirmación es correcta según el texto?',
    hint: 'Localiza la frase que vincula oxígeno libre histórico y fotosíntesis. Rechaza extremos que el texto no afirma.',
    failAdvice: 'El texto no dice que el oxígeno sea ajeno a la vida ni que solo ocurra de noche. Busca el vínculo histórico atmósfera–fotosíntesis.',
    options: [
      'El oxígeno atmosférico actual es ajeno a la vida',
      'La fotosíntesis solo ocurre de noche en las plantas',
      'El oxígeno libre histórico se vincula a la fotosíntesis',
      'Las cianobacterias nunca produjeron oxígeno libre',
      'La biomasa no usa energía química de la luz',
      'Solo los animales liberan oxígeno al respirar',
      'La fase oscura libera todo el oxígeno medible',
      'No hay relación entre plantas y composición del aire',
    ],
    correctCanonical: 2,
    region: 'Ciencia',
    difficulty: 1,
  },
  {
    id: 'h10',
    title: 'El testigo del puente',
    story:
      'Puente peatonal de un solo paso por tramo. A las 21:00 se oye un grito. A las 21:03 llega la policía. Hay barro fresco en ambos extremos. Un testigo al sur vio a X cruzar al norte a las 20:58. Otro al norte vio a X salir al sur a las 20:59. X tiene barro en ambos zapatos y niega haber cruzado.',
    source: 'Caso inventado (inconsistencia de trayectorias). Elaborado para este módulo.',
    question: '¿Qué explica mejor la contradicción sin inventar personas extra?',
    hint: 'Dos avistamientos en direcciones opuestas en un minuto sobre un puente de un solo sentido efectivo por tramo: ¿qué falla primero, la física o el testimonio?',
    failAdvice: 'No hace falta inventar un doble de X. La hipótesis más parsimoniosa cuestiona identidad u hora de al menos un testigo.',
    options: [
      'X cruzó dos veces en un minuto de forma imposible',
      'Al menos un testigo se equivoca de identidad o hora',
      'El puente no existía a las 20:58 según los mapas',
      'La policía alteró el barro antes de las 21:03',
      'X no tiene zapatos y el barro es irrelevante',
      'Ambos testigos describen el mismo instante exacto',
      'Solo el grito prueba que X estaba en el centro',
      'El barro prueba que X nunca estuvo cerca del puente',
    ],
    correctCanonical: 1,
    region: 'Detective didáctico',
    difficulty: 3,
  },
  {
    id: 'h11',
    title: 'Aristóteles: potencia y acto',
    story:
      'Aristóteles distinguió lo que algo puede llegar a ser (potencia) y lo que ya es (acto). Un bloque de mármol es estatua en potencia; el escultor actualiza esa potencia. La distinción organiza el cambio sin negar la identidad del sujeto.',
    source: 'Aristóteles. (s. IV a. C./1994). Metafísica. Gredos. / Ross, W. D. (1923). Aristotle. Methuen.',
    question: '¿Qué captura mejor la distinción?',
    hint: 'El mármol sigue siendo el mismo sujeto mientras pasa de potencia a acto. ¿Qué opción respeta identidad + cambio?',
    failAdvice: 'Evita extremos (“todo se destruye” o “la potencia no existe”). La clave es actualizar capacidades reales del sujeto.',
    options: [
      'Todo cambio destruye por completo la identidad previa',
      'Solo existe lo actual; la potencia es lenguaje vacío',
      'El cambio actualiza capacidades reales del sujeto',
      'La potencia es siempre superior al acto terminado',
      'No hay diferencia entre poder ser y ser ya',
      'Solo los dioses actualizan potencias humanas',
      'El mármol nunca puede ser estatua en ningún sentido',
      'El acto niega cualquier capacidad anterior residual',
    ],
    correctCanonical: 2,
    region: 'Filosofía',
    difficulty: 2,
  },
  {
    id: 'h12',
    title: 'El veneno y las copas',
    story:
      'Cuatro copas. Solo una tiene veneno. Etiquetas: «veneno», «vino», «vino o veneno», «vacía». Todas las etiquetas son falsas. Hay exactamente una con veneno, una con vino, una vacía y una con agua. Un invitado bebe de la etiquetada «veneno» y no muere.',
    source: 'Variante de puzzles de etiquetas falsas (tradición de lógica recreativa).',
    question: '¿Qué hay en la copa etiquetada «vino»?',
    hint: 'Si todas las etiquetas mienten, la copa «veneno» no tiene veneno (y el invitado sobrevive). Encaja el resto de contenidos con etiquetas falsas.',
    failAdvice: 'Empieza por la copa de la que alguien bebió sin morir. Luego fuerza que cada etiqueta sea falsa y que los cuatro contenidos sean distintos.',
    options: [
      'Veneno, porque la etiqueta miente siempre',
      'Vino, contradiciendo que todas las etiquetas mienten',
      'Agua o vacía según el reparto consistente posible',
      'La misma sustancia que la de la etiqueta «veneno»',
      'Nada: esa copa no existe en el juego de lógica',
      'Veneno y vino mezclados a la fuerza en un vaso',
      'Solo aire sellado sin líquido posible dentro',
      'Etiqueta verdadera a pesar del enunciado dado',
    ],
    correctCanonical: 2,
    region: 'Lógica',
    difficulty: 4,
  },
  {
    id: 'h13',
    title: 'Apolo 11 y la cooperación',
    story:
      'La llegada a la Luna no fue un salto improvisado: décadas de física orbital, materiales, computación primitiva y organización. El éxito muestra capacidad colectiva bajo restricciones técnicas, no magia ni un solo genio aislado.',
    source: 'National Aeronautics and Space Administration. (1971). Apollo 11 mission report (NASA SP-238). / Chaikin, A. (1994). A man on the Moon. Penguin.',
    question: '¿Qué lectura es más ajustada?',
    hint: 'El texto insiste en décadas de trabajo y sistemas. ¿Qué opción refleja ciencia + ingeniería + organización?',
    failAdvice: 'Rechaza genio único, negacionismo o magia. Quédate con la integración de disciplinas y esfuerzo organizado.',
    options: [
      'Fue posible sin física orbital previa alguna',
      'Depende solo del talento de un ingeniero único',
      'Integra ciencia, ingeniería y esfuerzo organizado',
      'Demuestra que el vacío transmite sonido audible',
      'Prueba que la Luna carece de gravedad local',
      'Niega el papel de la computación de a bordo',
      'Fue un montaje sin hardware real de vuelo',
      'No requirió ensayos ni misiones previas',
    ],
    correctCanonical: 2,
    region: 'Historia de la ciencia',
    difficulty: 1,
  },
  {
    id: 'h14',
    title: 'La herencia del testamento',
    story:
      'Un testamento reparte 1/2, 1/3 y 1/9. Las fracciones no suman 1. El juez, con un truco clásico (versión de los 17 camellos adaptada), reparte de modo que cada heredera recibe su fracción “aumentada” con coherencia matemática auxiliar.',
    source: 'Tradición del problema de los 17 camellos (matemática recreativa). Véase también: Singh, S. (1997). Fermat’s last theorem. Fourth Estate (contexto de matemáticas populares).',
    question: '¿Qué idea matemática ilustra el truco clásico?',
    hint: 'Las fracciones 1/2+1/3+1/9 no suman 1. El truco introduce una unidad auxiliar para repartir en enteros.',
    failAdvice: 'No digas que las fracciones ya suman 1. Piensa en un recurso auxiliar que permite un reparto entero coherente con las cuotas nominales.',
    options: [
      'Que 1/2+1/3+1/9 = 1 exactamente siempre',
      'Una suma auxiliar permite repartir sin fracciones rotas',
      'Que el testamento es inválido en todo sistema legal',
      'Que solo la mayor puede heredar en derecho romano',
      'Que las fracciones se redondean siempre hacia abajo',
      'Que no existe solución entera posible nunca',
      'Que el juez se queda con todas las monedas',
      'Que 17 es primo y por eso no se puede repartir',
    ],
    correctCanonical: 1,
    region: 'Matemática recreativa',
    difficulty: 2,
  },
  {
    id: 'h15',
    title: 'El eco del pozo',
    story:
      'Un explorador grita en un pozo y oye el eco a 1,2 s. Velocidad del sonido ~340 m/s. Ignora el tiempo de reacción. Estima la profundidad como ida y vuelta del sonido.',
    source: 'Problema de física básica (eco). Halliday, D., Resnick, R., & Walker, J. (2011). Fundamentals of physics. Wiley.',
    question: '¿Qué profundidad aproxima mejor?',
    hint: 'El tiempo 1,2 s cubre ida y vuelta. Distancia de ida ≈ v·t/2.',
    failAdvice: 'No uses el tiempo solo de ida ni ignores la división por dos. 340 m/s × 1,2 s / 2 ≈ 200 m.',
    options: [
      'Cerca de 400 m si el sonido solo va de ida',
      'Cerca de 200 m (ida y vuelta en 1,2 s)',
      'Exactamente 340 m sin dividir el tiempo',
      'Menos de 10 m por el retardo del oído',
      'Unos 1000 m por la densidad del aire',
      'No se puede estimar sin conocer la temperatura',
      'Exactamente 1,2 m por el número del eco',
      'Cero: los pozos no producen ecos reales',
    ],
    correctCanonical: 1,
    region: 'Física',
    difficulty: 1,
  },
  {
    id: 'h16',
    title: 'Tres interruptores y una bombilla',
    story:
      'Tres interruptores en un pasillo; una bombilla en otra habitación. Puedes manipular interruptores a voluntad, pero solo entrar una vez a la habitación de la bombilla. Quieres identificar qué interruptor la controla.',
    source: 'Puzzle clásico de lógica física (calor y tiempo). Tradición de entrevistas de razonamiento.',
    question: '¿Qué estrategia clásica resuelve el problema?',
    hint: 'Además de luz encendida/apagada hay un tercer estado observable si esperas: el calor del bulbo.',
    failAdvice: 'Una sola visita exige tres estados discriminables. Piensa en encender uno durante mucho rato, apagarlo, encender otro y entonces entrar.',
    options: [
      'Encender uno largo rato, apagarlo, encender otro y entrar',
      'Encender los tres a la vez y entrar de inmediato',
      'Entrar tres veces aunque el enunciado lo prohíba',
      'Es imposible con una sola visita a la habitación',
      'Usar solo el interruptor del medio siempre',
      'Dejar todos apagados y adivinar al azar',
      'Preguntar a un testigo fuera de la escena',
      'Medir el voltaje sin mirar la bombilla',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 3,
  },
  {
    id: 'h17',
    title: 'El retrato del padre',
    story:
      'Una mujer mira un retrato y dice: «No tengo hermanos ni hermanas, pero el padre de este hombre es el hijo de mi padre».',
    source: 'Acertijo clásico de parentesco (variante de tradición oral / puzzles de parentesco).',
    question: '¿Quién aparece en el retrato?',
    hint: '“El hijo de mi padre”, siendo ella hija única, es ella misma en versión masculina del vínculo… sigue la cadena: el padre de este hombre = mi hijo varón en la lectura clásica.',
    failAdvice: 'Traduce despacio: hijo de mi padre = yo (si no hay hermanos). Entonces “padre de este hombre” soy yo → el retrato es de mi hijo.',
    options: [
      'Su hijo',
      'Su padre',
      'Ella misma de joven',
      'Su marido',
      'Su hermano inexistente',
      'Su abuelo materno',
      'Un desconocido total',
      'Su primo hermano',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 3,
  },
  {
    id: 'h18',
    title: 'Caballeros y escuderos',
    story:
      'En una isla, caballeros siempre dicen verdad y escuderos siempre mienten. A dice: «B es escudero». B dice: «A y C son del mismo tipo». C dice: «A es escudero».',
    source: 'Smullyan, R. (1978). What is the name of this book? Prentice-Hall.',
    question: '¿Qué asignación es consistente?',
    hint: 'Prueba A caballero vs A escudero y propaga. Usa la afirmación de B sobre “mismo tipo”.',
    failAdvice: 'Si A fuera escudero, su frase sobre B sería falsa. Sigue cada rama hasta la única que no contradice a C.',
    options: [
      'A caballero, B escudero, C caballero',
      'Todos caballeros',
      'Todos escuderos',
      'A escudero, B caballero, C escudero',
      'A y B caballeros, C escudero',
      'Solo C es caballero y el resto miente',
      'A y C escuderos, B caballero',
      'No hay asignación posible',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 4,
  },
  {
    id: 'h19',
    title: 'El barbero de Russell',
    story:
      'En un pueblo, el barbero afeita a todos los que no se afeitan a sí mismos, y solo a ellos.',
    source: 'Russell, B. (1902/1967). Letter to Frege. En J. van Heijenoort (Ed.), From Frege to Gödel. Harvard University Press. (Paradoja de Russell; versión popular del barbero.)',
    question: '¿Qué ocurre con el barbero?',
    hint: 'Pregunta si el barbero se afeita a sí mismo e intenta aplicar la regla en ambos casos.',
    failAdvice: 'Si se afeita a sí mismo, no debería; si no, debería. Esa es la marca de una regla inconsistente, no de un horario de martes.',
    options: [
      'La situación es inconsistente (paradoja)',
      'Se afeita a sí mismo sin problema',
      'Otro barbero lo afeita siempre',
      'Nadie en el pueblo tiene barba',
      'El barbero no existe como persona',
      'Solo se afeita los martes',
      'La regla no aplica a barberos',
      'Se resuelve con un tercer barbero',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 3,
  },
  {
    id: 'h20',
    title: 'Monedas y balanza',
    story:
      'Hay 12 monedas. Una es falsa y puede ser más ligera o más pesada. Dispones de una balanza de dos platos.',
    source: 'Puzzle clásico de pesadas (teoría de la información). Véase: Knuth, D. E. (1998). The art of computer programming, Vol. 3 (2nd ed.). Addison-Wesley (discusión de búsqueda y pesadas).',
    question: '¿Cuántas pesadas bastan en el peor caso?',
    hint: 'Cada pesada tiene 3 resultados (izq/der/equilibrio). ¿Cuánta información necesitas para 12 monedas × 2 estados?',
    failAdvice: '24 posibilidades; 3^3 = 27 ≥ 24. Por eso el número clásico de pesadas en el peor caso es tres, no dos.',
    options: [
      'Tres',
      'Dos',
      'Cuatro',
      'Seis',
      'Doce',
      'Una sola',
      'Cinco',
      'Imposible con balanza',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 3,
  },
  {
    id: 'h21',
    title: 'El tren y el túnel',
    story:
      'Un tren de 1 km entra en un túnel de 1 km a 60 km/h. ¿Cuánto tarda en salir completamente del túnel?',
    source: 'Problema de cinemática elemental. Halliday, D., Resnick, R., & Walker, J. (2011). Fundamentals of physics. Wiley.',
    question: 'Tiempo hasta que el tren está del todo fuera:',
    hint: 'Para estar completamente fuera, el final del tren debe recorrer la longitud del túnel más la del tren.',
    failAdvice: 'Distancia total = 1 km + 1 km = 2 km. A 60 km/h → 2 minutos. No basta con 1 km.',
    options: [
      '2 minutos (debe recorrer 2 km)',
      '1 minuto solamente',
      '30 segundos',
      '4 minutos',
      '0 minutos (ya estaba fuera)',
      'Depende solo de la masa del tren',
      'Imposible de calcular',
      '10 minutos por el retraso',
    ],
    correctCanonical: 0,
    region: 'Física',
    difficulty: 1,
  },
  {
    id: 'h22',
    title: 'Dos relojes desincronizados',
    story:
      'Un reloj se atrasa 1 minuto por hora. Otro se adelanta 1 minuto por hora. Se sincronizan a las 12:00.',
    source: 'Problema de relojes (aritmética). Tradición de matemática recreativa.',
    question: '¿Cuándo vuelven a marcar la misma hora?',
    hint: 'La diferencia entre ambos crece 2 minutos por hora real. ¿Cuándo esa diferencia es un múltiplo de 12 horas en el cuadrante?',
    failAdvice: 'No elijas “nunca” ni “en una hora”. Piensa en cuánto tardan en diferir doce horas en lectura de esfera.',
    options: [
      'Tras 12 horas reales (a las 12 del mediodía siguiente en el marco del problema clásico)',
      'A las 6 en punto del mismo día',
      'Nunca coinciden de nuevo',
      'A las 11:00 del mismo día',
      'Al cabo de 1 hora exacta',
      'Solo a la medianoche del mes siguiente',
      'Cuando ambos marcan 13:00',
      'A las 3:00 de la tarde',
    ],
    correctCanonical: 0,
    region: 'Matemática recreativa',
    difficulty: 3,
  },
  {
    id: 'h23',
    title: 'El mensajero y las dos puertas',
    story:
      'Dos puertas: una a la libertad, otra a la muerte. Dos guardias: uno miente siempre, otro dice siempre la verdad. Puedes hacer una sola pregunta a uno de ellos.',
    source: 'Puzzle de puertas y guardias (lógica clásica; popularizado en diversas antologías de enigmas).',
    question: '¿Qué pregunta te garantiza la puerta segura?',
    hint: 'Necesitas una pregunta cuya respuesta sea falsa si preguntas al mentiroso y también te desinforme de forma simétrica si preguntas al veraz: doble negación.',
    failAdvice: 'Preguntar “qué puerta es la buena” falla porque no sabes si te mienten. La pregunta clásica apela a lo que diría el otro y luego se elige la contraria.',
    options: [
      '«Si yo le preguntara al otro qué puerta lleva a la libertad, ¿qué diría?» y eliges la contraria',
      '«¿Eres el que miente?»',
      '«¿Qué puerta es la buena?»',
      'No hay pregunta útil con una sola consulta',
      '«¿Cuántos guardias mienten?»',
      '«¿Está abierta la puerta izquierda?»',
      '«¿Qué dirías tú mismo sobre la derecha?»',
      'Señalar una puerta al azar sin preguntar',
    ],
    correctCanonical: 0,
    region: 'Lógica',
    difficulty: 4,
  },
  {
    id: 'h24',
    title: 'Calcetines a oscuras',
    story:
      'Cajón con calcetines rojos y azules a pares iguales. Coges a oscuras.',
    source: 'Principio del casillero (pigeonhole). Aigner, M., & Ziegler, G. M. (2010). Proofs from THE BOOK. Springer.',
    question: '¿Cuántos mínimos para asegurar un par del mismo color?',
    hint: 'Peor caso: uno rojo y uno azul. El siguiente fuerza el par.',
    failAdvice: 'Dos no bastan (podrían ser de distinto color). El tercero asegura un par del mismo color.',
    options: [
      'Tres',
      'Dos',
      'Cuatro',
      'Cinco',
      'Diez',
      'Uno solo',
      'Veinte',
      'Imposible asegurar',
    ],
    correctCanonical: 0,
    region: 'Matemática',
    difficulty: 1,
  },
  {
    id: 'h25',
    title: 'El caracol en el pozo',
    story:
      'Pozo de 30 m. El caracol sube 3 m de día y baja 2 m de noche.',
    source: 'Problema clásico de progreso neto (matemática recreativa).',
    question: '¿En cuántos días sale del pozo?',
    hint: 'Casi al final ya no vuelve a bajar: el último día alcanza el borde antes de la noche.',
    failAdvice: 'Progreso neto 1 m/día durante 27 días → 27 m; el día 28 sube 3 m y sale. No son 30 días.',
    options: [
      '28 días',
      '30 días',
      '15 días',
      '10 días',
      '29 días',
      '31 días',
      'Nunca sale',
      '5 días',
    ],
    correctCanonical: 0,
    region: 'Matemática recreativa',
    difficulty: 2,
  },

  // =========================================================================
  // CASOS DE POLICÍA, DETECTIVES E INVESTIGACIONES REALES / HISTÓRICAS
  // (análisis de hechos públicos; sin instrucciones operativas)
  // =========================================================================

  {
    id: 'p1',
    title: 'El asunto Dreyfus (Francia, 1894–1906)',
    story:
      'En 1894 el capitán Alfred Dreyfus, oficial judío del ejército francés, fue condenado por traición a partir de un bordereau (nota) hallado en la embajada alemana. La grafología militar y el secreto de sumario pesaron más que un debate abierto de pericia. Años después se demostró que la escritura coincidía mejor con otro oficial (Esterhazy) y que se habían fabricado o mal interpretado pruebas. El caso dividió a la Tercera República y obligó a reabrir el proceso tras la campaña de Émile Zola («J’accuse…!»).',
    source: 'Begley, L. (2009). Why the Dreyfus Affair matters. Yale University Press. / Cahm, E. (1996). The Dreyfus Affair in French society and politics. Longman.',
    question: 'Desde el punto de vista de método investigativo, ¿qué fallo institucional destaca el caso?',
    hint: 'Observa si la investigación buscó falsar su hipótesis inicial o proteger una conclusión ya tomada por el Estado Mayor.',
    failAdvice: 'No se trata solo de “antisemitismo” como respuesta única en abstracto: el texto enfatiza pruebas mal fundadas, secreto y resistencia a revisar la autoría del bordereau.',
    options: [
      'La policía científica francesa aún no existía en absoluto',
      'Se priorizó una tesis acusatoria y se resistió la revisión de pericias',
      'Dreyfus confesó ante notario en 1894',
      'Esterhazy fue absuelto porque no sabía escribir',
      'Zola inventó el bordereau como ficción literaria',
      'El caso demuestró que la grafología es infalible',
      'Alemania publicó el nombre del traidor desde el inicio',
      'No hubo ninguna irregularidad procesal documentada',
    ],
    correctCanonical: 1,
    region: 'Francia',
    difficulty: 3,
  },
  {
    id: 'p2',
    title: 'Jack the Ripper y la policía metropolitana (Londres, 1888)',
    story:
      'En el otoño de 1888, Whitechapel registró una serie de homicidios de mujeres que la prensa vinculó a un mismo agresor. Scotland Yard y la City of London Police recolectaron testimonios, cartas (muchas falsas) y descripciones contradictorias. No hubo condena. El caso ilustra límites de la policía victoriana: ausencia de huellas dactilares sistemáticas, escena contaminada por curiosos y presión mediática que multiplicaba pistas ruidosas.',
    source: 'Begg, P. (2003). Jack the Ripper: The definitive history. Pearson. / Evans, S. P., & Skinner, K. (2000). The ultimate Jack the Ripper sourcebook. Constable.',
    question: '¿Qué obstáculo metodológico pesa más según el relato?',
 hint: 'Distingue entre “no quisieron investigar” y “no disponían de técnicas / la escena se degradó / el ruido de cartas falsas”.',
    failAdvice: 'El texto no afirma que se identificara al culpable ni que las cartas fueran todas auténticas. Enfócate en límites técnicos y de escena.',
    options: [
      'La policía identificó al asesino con certeza en 1889',
      'Escena degradada, pistas falsas y técnicas forenses aún limitadas',
      'Las huellas dactilares resolvieron el caso en semanas',
      'La prensa guardó silencio total sobre Whitechapel',
      'Solo la City Police investigó; Scotland Yard se negó',
      'Todas las cartas enviadas eran auténticas del mismo autor',
      'El caso se resolvió con ADN en 1889',
      'No hubo víctimas reales según el registro policial',
    ],
    correctCanonical: 1,
    region: 'Reino Unido',
    difficulty: 2,
  },
  {
    id: 'p3',
    title: 'El secuestro del bebé Lindbergh (EE. UU., 1932)',
    story:
      'El hijo de Charles Lindbergh fue secuestrado de su casa en Nueva Jersey. Se pagó un rescate con billetes marcados. Bruno Hauptmann fue detenido años después en posesión de parte del dinero y condenado. El juicio fue mediático. Historiadores y críticos han debatido la solidez de algunas pruebas (escalera, escritura) y el clima de presión pública, pero el hilo del dinero marcado fue central para la investigación federal y local.',
    source: 'Fisher, J. (1997). The Lindbergh case. Rutgers University Press. / Ahlgren, G., & Monier, S. (1993). Crime of the century. Branden.',
    question: '¿Qué elemento investigativo fue más decisivo según el relato?',
    hint: 'Separa el ruido mediático de la traza material que permite seguir el rescate.',
    failAdvice: 'Aunque el juicio fue polémico, el texto señala los billetes marcados como hilo conductor hacia la detención.',
    options: [
      'La confesión espontánea de Lindbergh',
      'El seguimiento de los billetes del rescate marcados',
      'Un vídeo de seguridad doméstico de 1932',
      'La ausencia total de demanda de rescate',
      'Un análisis de ADN vegetal en la escalera',
      'La prensa identificó a Hauptmann el primer día',
      'El bebé reapareció ileso al mes siguiente',
      'No se pagó ningún rescate en absoluto',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 2,
  },
  {
    id: 'p4',
    title: 'El asesinato de Julio César: investigación política (Roma, 44 a. C.)',
    story:
      'César fue apuñalado en la Curia de Pompeyo por un grupo de senadores. No hubo “policía científica”, pero sí consecuencias políticas inmediatas: discursos, amnistías aparentes y luego guerra civil. Antonio usó el funeral para volcar a la multitud. El “quién” era en parte público; el problema pasó a ser cómo narrar el tiranicidio frente al populacho y las legiones.',
    source: 'Plutarco. (s. II/1992). Vidas paralelas: César. Gredos. / Beard, M. (2015). SPQR: A history of ancient Rome. Profile.',
    question: 'Tras el asesinato, ¿qué dimensión pesó más que una pesquisa técnica de escena?',
    hint: 'El relato desplaza el foco del CSI imposible en Roma al control del relato y de las lealtades armadas.',
    failAdvice: 'No busques huellas dactilares romanas. Piensa en funeral, multitud, legiones y narrativa de tiranicidio.',
    options: [
      'El análisis de sangre en el mármol de la Curia',
      'La lucha por el relato público y el apoyo de legiones',
      'Un juicio penal moderno con jurado popular',
      'La confesión notarial de Bruto al día siguiente',
      'El destierro inmediato y pacífico de todos los conjurados',
      'La ausencia de cualquier consecuencia política',
      'Un informe pericial de los médicos de Asclepio',
      'La identificación por ADN de cada daga',
    ],
    correctCanonical: 1,
    region: 'Roma antigua',
    difficulty: 2,
  },
  {
    id: 'p5',
    title: 'Scotland Yard y el sistema de huellas (inicios s. XX)',
    story:
      'Aunque las huellas dactilares se estudiaron antes (Herschel en la India, Faulds, Vucetich en Argentina, Henry en la India británica), su adopción policial sistemática transformó la identificación de reincidentes. El sistema Henry clasificaba patrones para archivos grandes. Un caso célebre británico temprano fue el de Harry Jackson (1902), condenado en parte por una huella en un alféizar pintado.',
    source: 'Beavan, C. (2001). Fingerprints. Hyperion. / Cole, S. A. (2001). Suspect identities. Harvard University Press.',
    question: '¿Qué cambio institucional introducen las huellas en la policía moderna temprana?',
    hint: 'Piensa en identificación de personas a lo largo del tiempo, no solo en “resolver un crimen aislado”.',
    failAdvice: 'La clave es un archivo reproducible de identidad frente a la reincidencia, no la invención de la policía en sí.',
    options: [
      'Eliminan por completo la necesidad de testigos',
      'Permiten archivar e identificar reincidentes de forma estable',
      'Demuestran que cada huella cambia cada 24 horas',
      'Solo funcionan en climas tropicales',
      'Sustituyen al derecho penal por un algoritmo',
      'Fueron rechazadas en Argentina hasta 1980',
      'Prueban la culpabilidad sin contexto alguno',
      'Solo identifican a gemelos idénticos',
    ],
    correctCanonical: 1,
    region: 'Reino Unido / Argentina / India',
    difficulty: 2,
  },
  {
    id: 'p6',
    title: 'El sistema Vucetich (Argentina)',
    story:
      'Juan Vucetich, en la policía de Buenos Aires a fines del siglo XIX, desarrolló un sistema de clasificación dactiloscópica y lo aplicó a investigaciones criminales. El caso de Francisca Rojas (1892), acusada en un doble homicidio, se asoció tempranamente al uso de huellas para orientar la verdad de los hechos frente a una confusión inicial de sospechosos. América Latina fue pionera en la adopción policial de la dactiloscopia.',
    source: 'Rodríguez, J. (2006). Civilizing Argentina: Science, medicine, and the modern state. University of North Carolina Press. / Beavan, C. (2001). Fingerprints. Hyperion.',
    question: '¿Qué ilustra el caso Rojas / Vucetich en la historia de la investigación?',
    hint: 'Sitúa el aporte en el cruce entre archivo identificativo y escena del crimen en un país americano.',
    failAdvice: 'No es un caso europeo de Scotland Yard. Subraya la pioneering latinoamericana de la dactiloscopia policial.',
    options: [
      'Que las huellas solo se usaron en Europa hasta 1950',
      'Que la dactiloscopia policial tuvo aplicaciones tempranas en Argentina',
      'Que Vucetich negó valor a las huellas',
      'Que Rojas fue absuelta porque no existen huellas femeninas',
      'Que el caso se resolvió solo con astrología forense',
      'Que Buenos Aires prohibió archivar impresiones',
      'Que el sistema Henry nació en la Patagonia',
      'Que no hubo doble homicidio alguno en 1892',
    ],
    correctCanonical: 1,
    region: 'Argentina',
    difficulty: 2,
  },
  {
    id: 'p7',
    title: 'El asesinato de García Lorca (España, 1936)',
    story:
      'Federico García Lorca fue detenido y fusilado al inicio de la Guerra Civil cerca de Granada. Durante décadas la ubicación exacta de sus restos y la cadena de responsabilidades fueron objeto de investigación histórica, testimonios y controversia política. No es un “caso policial cerrado” al estilo de un juicio ordinario en paz: es un crimen de guerra civil donde la pesquisa posterior combina memoria, archivo y excavaciones.',
    source: 'Gibson, I. (1973/1996). The assassination of Federico García Lorca. Penguin. / Preston, P. (2012). The Spanish Holocaust. Harper Press.',
    question: '¿Qué caracteriza la “investigación” de este hecho respecto a un homicidio ordinario en tiempo de paz?',
    hint: 'Guerra civil, autoridades en conflicto, silencio y memoria posterior: ¿qué herramientas pesan más que una comisaría rutinaria?',
    failAdvice: 'No trates el caso como un robo con huellas en una comisaría de 2020. Piensa en archivo, testimonio y política de la memoria.',
    options: [
      'Se resolvió en 48 horas con un juicio público imparcial',
      'Depende de archivo, testimonios y políticas de memoria tras el crimen de guerra',
      'Lorca firmó una confesión notarial antes de morir',
      'La Interpol emitió una orden de busca en 1936',
      'No existe ninguna investigación histórica publicada',
      'Fue un accidente de tráfico documentado en acta',
      'Los restos se identificaron por ADN el mismo mes',
      'La prensa de Granada transmitió el juicio en directo',
    ],
    correctCanonical: 1,
    region: 'España',
    difficulty: 3,
  },
  {
    id: 'p8',
    title: 'Ultra y el tráfico Enigma (Segunda Guerra Mundial)',
    story:
      'Los aliados interceptaron tráfico cifrado alemán. En Bletchley Park se combinaron capturas de material, errores de operadores, análisis matemático y máquinas para reducir el espacio de claves. El valor de Ultra no fue solo “romper un mensaje”, sino hacerlo de forma sostenida sin revelar la fuente, para no secar el pozo de inteligencia. Es un caso de investigación de señales más que de escena del crimen.',
    source: 'Hinsley, F. H., & Stripp, A. (Eds.). (1993). Codebreakers. Oxford University Press. / Kahn, D. (1996). The codebreakers (rev. ed.). Scribner.',
    question: '¿Qué principio operativo destaca el relato sobre el uso de la inteligencia obtenida?',
    hint: 'Hay tensión entre actuar con la información y proteger el canal que la produce.',
    failAdvice: 'La lección no es “nunca usar la información”, sino usarla de modo que el adversario no deduzca que su cifra está comprometida.',
    options: [
      'Publicar cada mensaje descifrado en los periódicos',
      'Explotar el tráfico sin delatar que la cifra estaba comprometida',
      'Ignorar por completo los errores de los operadores enemigos',
      'Depender solo de espías humanos sin interceptación',
      'Romper Enigma una sola vez y abandonar el esfuerzo',
      'Compartir las claves con el Eje para confundirlo',
      'Prohibir las matemáticas en Bletchley Park',
      'Usar únicamente el código Morse sin cifrar',
    ],
    correctCanonical: 1,
    region: 'Reino Unido / teatro europeo',
    difficulty: 3,
  },
  {
    id: 'p9',
    title: 'El caso del Unabomber (EE. UU., 1978–1996)',
    story:
      'Durante años el FBI investigó atentados con paquetes atribuidos a un mismo autor. El avance decisivo no fue solo la química de los artefactos, sino la publicación del manifiesto y el reconocimiento del estilo y las ideas por parte del hermano del autor, que contactó con el FBI. La lingüística forense y la comparación de textos desempeñaron un papel inusualmente visible.',
    source: 'Chase, A. (2003). Harvard and the Unabomber. W. W. Norton. / Federal Bureau of Investigation. (n.d.). Unabomber. FBI History.',
    question: '¿Qué tipo de evidencia resultó crítica para identificar al sospechoso según el relato?',
    hint: 'El texto destaca un reconocimiento familiar del estilo tras la publicación de un escrito largo.',
    failAdvice: 'No elijas “confesión inmediata en 1978” ni “vídeo del primer atentado”. El giro es lingüístico/familiar tras el manifiesto.',
    options: [
      'Una huella dactilar perfecta en el primer artefacto de 1978',
      'El reconocimiento del estilo del manifiesto por un familiar',
      'Un testigo presencial en todos y cada uno de los envíos',
      'La entrega voluntaria del autor el mismo año del primer ataque',
      'Un rastreador GPS en cada sobre',
      'La ausencia total de textos escritos por el autor',
      'Un retrato robot basado en ADN del sobre',
      'La identificación por el matasellos único de un solo estado',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 3,
  },
  {
    id: 'p10',
    title: 'El asesinato de Julio César Cejas / investigaciones de prensa en América Latina',
    story:
      'En varias democracias latinoamericanas de finales del siglo XX e inicios del XXI, periodistas de investigación y comisiones de la verdad han documentado desapariciones y homicidios donde la policía local era parte del problema, no de la solución. El patrón metodológico del investigador externo (periodista, ONG, comisión) consiste en cruzar archivos, testimonios y patrones de modus operandi institucional, no en confiar en un único atestado.',
    source: 'O’Donnell, G. (1999). Counterpoints. University of Notre Dame Press. / Comisión Nacional sobre la Desaparición de Personas. (1984). Nunca más. Eudeba.',
    question: '¿Qué estrategia de investigación es más coherente cuando la institución policial está bajo sospecha?',
    hint: 'Si el atestado oficial puede estar contaminado, ¿qué fuentes alternativas menciona el espíritu del relato?',
    failAdvice: 'No elijas “aceptar el atestado sin más”. Busca triangulación de archivos, testimonios y patrones.',
    options: [
      'Aceptar siempre el primer informe policial como verdad final',
      'Triangular archivos, testimonios independientes y patrones institucionales',
      'Ignorar todo testimonio de víctimas por principio',
      'Confiar solo en el rumor de redes sociales',
      'Destruir los archivos para empezar de cero',
      'Esperar una confesión televisada sin documentación',
      'Prohibir la prensa de investigación',
      'Resolver cada caso solo con un careo público',
    ],
    correctCanonical: 1,
    region: 'América Latina',
    difficulty: 3,
  },
  {
    id: 'p11',
    title: 'El caso Bhopal y la investigación de responsabilidades (India, 1984)',
    story:
      'La fuga de gas en la planta de Union Carbide en Bhopal causó miles de muertes. Las pesquisas posteriores abarcaron seguridad industrial, mantenimiento, diseño de sistemas de alarma y responsabilidades penales y civiles transnacionales. No es un homicidio “de callejón”, pero sí un caso masivo de investigación forense industrial y jurídica: quién sabía qué, qué válvulas fallaron, qué protocolos no se cumplieron.',
    source: 'Lapierre, D., & Moro, J. (2001). It was five past midnight in Bhopal. Warner. / Fortun, K. (2001). Advocacy after Bhopal. University of Chicago Press.',
    question: '¿Qué tipo de evidencia pesa más en este género de investigación?',
    hint: 'Piensa en registros de mantenimiento, diseño de seguridad y cadena de mando corporativa, no en un único testigo ocular del gas.',
    failAdvice: 'La respuesta sólida apunta a fallos de sistemas y responsabilidades organizacionales documentables, no a un “saboteador solitario” sin más.',
    options: [
      'Solo el testimonio de un vigilante sin documentos',
      'Registros de seguridad, mantenimiento y decisiones corporativas',
      'La astrología industrial del mes de diciembre',
      'Un único análisis de suelo sin contexto de planta',
      'La opinión de un accionista sin acceso a la planta',
      'Negar que hubiera fuga alguna',
      'Culpar exclusivamente a las víctimas por vivir cerca',
      'Cerrar el caso en 24 horas sin peritaje',
    ],
    correctCanonical: 1,
    region: 'India',
    difficulty: 3,
  },
  {
    id: 'p12',
    title: 'El asesinato de Olof Palme (Suecia, 1986)',
    story:
      'El primer ministro sueco Olof Palme fue tiroteado en una calle de Estocolmo. La investigación se prolongó durante décadas, con sospechosos, retractaciones y un cierre controvertido en 2020 que señaló a un hombre ya fallecido sin juicio. El caso es famoso por la dificultad de una pesquisa en apariencia “simple” (un tiroteo en vía pública) cuando la escena se contamina, los testigos divergen y la presión política es máxima.',
    source: 'Bondeson, J. (2005). Blood on the snow. Cornell University Press. / Sweden. (2020). Investigation into the assassination of Olof Palme (summary reports in public media).',
    question: '¿Qué lección metodológica ilustra un caso abierto durante décadas?',
    hint: 'Aunque el hecho parezca simple, la calidad de la escena inicial y la gestión de hipótesis pesadas cuentan.',
    failAdvice: 'No digas que fue resuelto en 48 horas con una confesión limpia. El punto es la dificultad prolongada y la controversia.',
    options: [
      'Todo asesinato político se resuelve en un día',
      'Escena inicial, testigos y presión política pueden alargar e inciertar la pesquisa',
      'Suecia no investigó el caso en absoluto',
      'Se identificó al autor por ADN el mismo noche',
      'Palme sobrevivió y negó el atentado',
      'Solo hubo un testigo y bastó',
      'La policía destruyó todas las actas en 1987',
      'El caso demuestra que los tiroteos callejeros son siempre fáciles',
    ],
    correctCanonical: 1,
    region: 'Suecia',
    difficulty: 3,
  },
  {
    id: 'p13',
    title: 'El caso del “Zodiac” (California)',
    story:
      'Un asesino envió cartas cifradas y mensajes a la prensa del área de la Bahía a fines de los 60. Parte de un cifrado fue resuelto por particulares; otros permanecieron opacos durante años. La policía tuvo que gestionar comunicación mediática, amenazas y un exceso de sospechosos. En 2020 un equipo afirmó haber resuelto un cifrado pendiente; la identidad penal definitiva del autor sigue siendo objeto de debate público.',
    source: 'Graysmith, R. (1986). Zodiac. St. Martin’s. / Federal Bureau of Investigation. (n.d.). Zodiac. FBI Vault (documentos desclasificados).',
    question: '¿Qué complicación investigativa añade un autor que escribe a la prensa con cifrados?',
    hint: 'Piensa en ruido mediático, autenticidad de mensajes y sobrecarga de pistas voluntarias.',
    failAdvice: 'El problema no es solo “romper un código”: es separar mensajes auténticos de copiones y gestionar el circo mediático.',
    options: [
      'Simplifica todo porque el autor siempre dice la verdad',
      'Genera ruido mediático, dudas de autenticidad y exceso de pistas',
      'Permite ignorar por completo las escenas de los crímenes',
      'Hace innecesarias las autopsias',
      'Garantiza una detención en menos de una semana',
      'Elimina la posibilidad de falsas confesiones',
      'Demuestra que todo cifrado es irrompible',
      'Obliga a cerrar los periódicos locales',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 3,
  },
  {
    id: 'p14',
    title: 'La masacre de Tiananmen: documentación frente al relato oficial (China, 1989)',
    story:
      'Tras la represión de las protestas de 1989 en Pekín, el relato oficial y el de testigos, periodistas y documentos externos divergieron sobre cifras y responsabilidades. Investigadores y periodistas han intentado reconstruir cronologías a partir de vídeos, cables diplomáticos y testimonios. Es un caso límite donde la “pesquisa” es histórica y de derechos humanos más que policial local.',
    source: 'Brook, T. (1998). Quelling the people. Stanford University Press. / Nathan, A. J., & Link, P. (Eds.). (2001). The Tiananmen Papers. PublicAffairs.',
    question: 'Cuando el Estado controla la escena y el archivo, ¿qué queda como método?',
    hint: 'Fuentes externas, cronología cruzada y documentos filtrados o diplomáticos.',
    failAdvice: 'No basta con “creer el parte oficial”. El texto apunta a reconstrucción con fuentes múltiples externas.',
    options: [
      'Aceptar solo el comunicado oficial final',
      'Reconstruir con testimonios, vídeos y documentos externos cruzados',
      'Declarar que no ocurrió nada investigable',
      'Esperar a que solo hable un único testigo anónimo',
      'Prohibir toda cronología',
      'Usar únicamente rumores sin fecha',
      'Cerrar el caso por falta de interés histórico',
      'Depender de un solo cable sin corroboración',
    ],
    correctCanonical: 1,
    region: 'China',
    difficulty: 4,
  },
  {
    id: 'p15',
    title: 'El caso Medellín / bloque de búsqueda (Colombia, años 90)',
    story:
      'La persecución de estructuras del narcotráfico en Colombia involucró policía, ejército, cooperación internacional e información de desertores. La caída de Pablo Escobar (1993) fue el resultado de una presión prolongada sobre comunicaciones, movimientos y red de apoyo, no de un único golpe de genio. El costo humano y las acusaciones de abusos también forman parte del balance histórico.',
    source: 'Bowden, M. (2001). Killing Pablo. Atlantic Monthly Press. / Chepesiuk, R. (2003). The bullet or the bribe. Praeger.',
    question: 'Según la lógica del relato, ¿qué describe mejor la captura/caída del capo?',
    hint: 'Proceso de desgaste sobre red y comunicaciones frente a “un solo informante mágico”.',
    failAdvice: 'Evita la narrativa de héroe solitario. El texto habla de presión prolongada y red.',
    options: [
      'Un único detective resolvió todo en un día sin ayuda',
      'Presión prolongada sobre red, movimientos y comunicaciones',
      'Escobar se entregó voluntariamente en 1985 sin violencia',
      'No hubo cooperación internacional de ningún tipo',
      'La prensa local ignoró por completo el tema',
      'Se usó solo la astrología de un asesor',
      'El cartel carecía de red de apoyo alguna',
      'La policía desistió en 1992 y el caso se cerró',
    ],
    correctCanonical: 1,
    region: 'Colombia',
    difficulty: 3,
  },
  {
    id: 'p16',
    title: 'El incendio del Reichstag (Alemania, 1933)',
    story:
      'El incendio del edificio del Parlamento alemán fue usado por el régimen nazi para suspender libertades y perseguir a opositores. Marinus van der Lubbe fue detenido y condenado; el debate histórico sobre si actuó solo o hubo manipulación posterior del evento sigue vivo. Desde el método: hay que separar “quién próspero políticamente del fuego” de “quién encendió la mecha”.',
    source: 'Hett, B. C. (2014). Burning the Reichstag. Oxford University Press. / Evans, R. J. (2003). The coming of the Third Reich. Penguin.',
    question: '¿Qué distinción analítica es esencial en este caso?',
    hint: 'Beneficio político del evento ≠ prueba automática de autoría material.',
    failAdvice: 'Una investigación rigurosa no confunde “cui bono” con prueba directa de quién prendió fuego, aunque el cui bono sea legítimo como hipótesis.',
    options: [
      'Si alguien se beneficia, siempre es el autor material',
      'Separar autoría material del aprovechamiento político del evento',
      'Negar que el edificio ardió',
      'Afirmar que no hubo consecuencias legales para nadie',
      'Ignorar por completo el contexto de 1933',
      'Tratar el juicio de Leipzig como irrelevante siempre',
      'Atribuir el fuego a un cortocircuito sin examinar nada',
      'Cerrar el caso solo con propaganda de un bando',
    ],
    correctCanonical: 1,
    region: 'Alemania',
    difficulty: 4,
  },
  {
    id: 'p17',
    title: 'El caso de las hermanas Mirabal (República Dominicana)',
    story:
      'Patria, Minerva y María Teresa Mirabal, opositoras a la dictadura de Trujillo, fueron asesinadas en 1960 en un atentado disfrazado de accidente de tráfico. La investigación real y la memoria posterior desmontaron la versión oficial. El caso muestra cómo el poder dictatorial fabrica la causa de muerte y cómo la pesquisa histórica y judicial posterior reconstruye el homicidio de Estado.',
    source: 'Aquino García, M. (1994). Tres heroínas y un tirano. / Derby, L. (2009). The dictator’s seduction. Duke University Press.',
    question: '¿Qué patrón de encubrimiento describe el relato?',
    hint: 'Versión oficial de “accidente” frente a homicidio político organizado.',
    failAdvice: 'La clave es el disfraz de accidente por parte del aparato dictatorial, no un fallo mecánico genuino aislado.',
    options: [
      'Un accidente de tráfico sin interferencia estatal',
      'Homicidio político encubierto como accidente por la dictadura',
      'Suicidio colectivo documentado en acta notarial',
      'Exilio voluntario de las hermanas en 1960',
      'Absolución de Trujillo por un tribunal independiente al día siguiente',
      'La prensa libre dominicana transmitió la verdad en directo en 1960',
      'No hubo víctimas en la familia Mirabal',
      'El caso permanece sin ninguna investigación histórica',
    ],
    correctCanonical: 1,
    region: 'República Dominicana',
    difficulty: 3,
  },
  {
    id: 'p18',
    title: 'Forense de ADN y el caso Pitchfork (Reino Unido, 1980s)',
    story:
      'En Leicestershire, la técnica de huella genética desarrollada por Alec Jeffreys se aplicó a una doble violación-homicidio. Colin Pitchfork fue el primer condenado por ADN en ese contexto. Antes, un sospechoso había confesido de forma poco fiable. El caso ilustra tanto el poder de una nueva técnica como el peligro de confesiones sin corroboración biológica.',
    source: 'Wambaugh, J. (1989). The blooding. William Morrow. / Jeffreys, A. J., Wilson, V., & Thein, S. L. (1985). Individual-specific “fingerprints” of human DNA. Nature, 316, 76–79.',
    question: '¿Qué lección metodológica combina el caso?',
    hint: 'Nueva técnica forense + escepticismo ante confesiones no corroboradas.',
    failAdvice: 'No elijas “las confesiones siempre bastan” ni “el ADN es irrelevante”. El punto es corroboración biológica frente a confesión dudosa.',
    options: [
      'Las confesiones bastan sin ninguna prueba material',
      'El ADN puede identificar y también corregir confesiones dudosas',
      'El ADN solo sirve para pruebas de paternidad civiles',
      'Pitchfork fue absuelto porque el ADN no existía',
      'Jeffreys prohibió el uso policial de su técnica',
      'El caso se resolvió sin muestras biológicas',
      'La policía rechazó comparar perfiles de voluntarios',
      'No hubo doble crimen en Leicestershire',
    ],
    correctCanonical: 1,
    region: 'Reino Unido',
    difficulty: 2,
  },
  {
    id: 'p19',
    title: 'El hundimiento del Lusitania y la investigación de responsabilidades (1915)',
    story:
      'El RMS Lusitania fue torpedeado por un submarino alemán; murieron casi 1.200 personas. El debate posterior incluyó si llevaba municiones, si la ruta fue imprudente y cómo usaron el hecho los propagandistas de ambos bandos. La “investigación” fue a la vez técnica (trajectoria del torpedo, segunda explosión) y política.',
    source: 'Preston, D. (2002). Lusitania: An epic tragedy. Walker. / Bailey, T. A., & Ryan, P. B. (1975). The Lusitania disaster. Free Press.',
    question: '¿Qué tensiona la pesquisa de un desastre en tiempo de guerra?',
    hint: 'Hechos náuticos y de carga versus uso propagandístico del evento.',
    failAdvice: 'Una respuesta completa admite tanto la dimensión técnica (torpedo, barco) como la instrumentalización política.',
    options: [
      'Solo importa la propaganda; los hechos del barco son irrelevantes',
      'Hay que separar hechos del hundimiento del uso propagandístico',
      'El Lusitania nunca fue torpedeado',
      'No murió ningún civil',
      'Alemania negó operar submarinos en 1915',
      'La investigación técnica está prohibida en guerra',
      'Solo cuenta la opinión de un único superviviente',
      'El barco fue hundido por un iceberg',
    ],
    correctCanonical: 1,
    region: 'Atlántico / guerra mundial',
    difficulty: 3,
  },
  {
    id: 'p20',
    title: 'El caso del asesinato de Kirov (URSS, 1934)',
    story:
      'Sergei Kirov fue asesinado en Leningrado. Stalin utilizó el hecho para desencadenar purgas masivas. Historiadores debaten el grado de instigación del propio régimen frente a un acto de un autor material inmediato. De nuevo: autoría material y aprovechamiento político deben analizarse por separado, con archivos abiertos tras la era soviética.',
    source: 'Conquest, R. (1990). The Great Terror (rev. ed.). Oxford University Press. / Knight, A. (1999). Who killed Kirov? Hill and Wang.',
    question: '¿Qué precaución analítica impone el caso Kirov?',
    hint: 'Purgan y se benefician del crimen no equivalen automáticamente, sin prueba, a haber ordenado el disparo; tampoco se puede descartar la hipótesis sin archivo.',
    failAdvice: 'Mantén la distinción entre hipótesis de instigación y prueba documental; evita tanto la inocencia automática como la culpa automática sin evidencia.',
    options: [
      'Todo crimen en dictadura carece de autor material',
      'Hay que sopesar autoría material y posible instrumentalización con base en archivo',
      'Kirov no murió en 1934',
      'No hubo purgas posteriores',
      'Los archivos soviéticos nunca se abrieron a nadie',
      'Un solo artículo de prensa basta para cerrar el caso',
      'La investigación histórica está prohibida por definición',
      'Solo la propaganda contemporánea cuenta como fuente',
    ],
    correctCanonical: 1,
    region: 'URSS',
    difficulty: 4,
  },
  {
    id: 'p21',
    title: 'Operación Fortitude y el engaño aliado (1944)',
    story:
      'Antes del Desembarco de Normandía, los aliados alimentaron la idea de un ataque a Pas-de-Calais mediante unidades fantasma, tráfico de radio falso y un agente doble famoso (Garbo). El “caso” es de contrainteligencia: fabricar un patrón creíble para el analista enemigo. La lección para el investigador moderno es simétrica: los patrones también pueden plantarse.',
    source: 'Masterman, J. C. (1972). The Double-Cross System. Yale University Press. / Hesketh, R. (2000). Fortitude. Overlook.',
    question: '¿Qué advertencia metodológica ofrece Fortitude al analista de inteligencia?',
    hint: 'Un patrón limpio y abundante a veces es demasiado bueno… porque fue diseñado para ti.',
    failAdvice: 'La lección no es “ignorar toda señal”, sino sospechar de la sobreabundancia coherente que confirma exactamente tus prejuicios.',
    options: [
      'Todo tráfico de radio es siempre auténtico',
      'Un patrón coherente puede haber sido fabricado para engañar',
      'Los agentes dobles no existieron en 1944',
      'Normandía fue un desembarco improvisado sin planificación',
      'Pas-de-Calais fue el único objetivo real aliado',
      'La inteligencia alemana acertó la fecha exacta desde enero',
      'No se usó ningún engaño en la Segunda Guerra Mundial',
      'Fortitude fue un fracaso total documentado',
    ],
    correctCanonical: 1,
    region: 'Europa / WWII',
    difficulty: 3,
  },
  {
    id: 'p22',
    title: 'El caso del “Torso de Cleveland” (EE. UU., años 30)',
    story:
      'Durante la Gran Depresión, Cleveland registró una serie de víctimas desmembradas asociadas al llamado Mad Butcher of Kingsbury Run. El detective Eliot Ness, famoso por su etapa en Chicago, participó en la investigación municipal. El caso permanece sin resolución penal definitiva y muestra los límites de la policía en un contexto de pobreza, población flotante y escenas degradadas.',
    source: 'Badal, J. (2001). In the wake of the butcher. Kent State University Press. / Nickel, S. (1989). Torso. John F. Blair.',
    question: '¿Qué factor contextual dificulta este tipo de serie según el relato?',
    hint: 'Población flotante, pobreza, escenas en zonas marginales.',
    failAdvice: 'No fue un caso resuelto por Ness en una tarde. El texto subraya límites estructurales de la pesquisa.',
    options: [
      'Exceso de cámaras de seguridad en 1935',
      'Población flotante, escenas degradadas y límites técnicos de la época',
      'Confesión firme del autor en 1936 con todas las pruebas',
      'La policía ignoró por completo los hallazgos',
      'Ness identificó al autor con ADN',
      'Solo hubo una víctima en total',
      'El caso se cerró con un juicio público unánime',
      'Kingsbury Run era una zona de máxima vigilancia policial',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 3,
  },
  {
    id: 'p23',
    title: 'La noche de los lápices (Argentina, 1976)',
    story:
      'Secuestros de estudiantes secundarios en la provincia de Buenos Aires durante la dictadura. Supervivientes como Pablo Díaz testimoniaron. La investigación judicial y periodística posterior, en democracia, reconstruyó responsabilidades de fuerzas de seguridad. Forma parte del patrón de terrorismo de Estado documentado en Nunca más.',
    source: 'Seoane, M., & Ruiz Núñez, H. (1986). La noche de los lápices. Contrapunto. / CONADEP. (1984). Nunca más. Eudeba.',
    question: '¿Qué tipo de fuente fue esencial para romper el silencio oficial?',
    hint: 'Testimonio de supervivientes + investigación en democracia.',
    failAdvice: 'El parte militar contemporáneo no es la fuente que “resolvió” el caso ante la sociedad; pesaron testimonios y causas posteriores.',
    options: [
      'Solo los comunicados oficiales de 1976',
      'Testimonios de supervivientes e investigación posterior en democracia',
      'La negación total de que hubiera secuestros',
      'Un único documento destruido sin copias',
      'La ausencia de cualquier causa judicial posterior',
      'Reportajes de 1976 en televisión libre sin censura',
      'La confesión espontánea de la junta al día siguiente',
      'Archivos de la Interpol de 1950',
    ],
    correctCanonical: 1,
    region: 'Argentina',
    difficulty: 3,
  },
  {
    id: 'p24',
    title: 'El asesinato de Archiduque Francisco Fernando (Sarajevo, 1914)',
    story:
      'Gavrilo Princip y la red de la Mano Negra participaron en el atentado que desencadenó la crisis de julio. La investigación austrohúngara fue rápida en identificar a los autores materiales, pero la escalada diplomática y militar transformó un atentado en guerra mundial. El “caso policial” quedó subordinado a la política de alianzas.',
    source: 'Clark, C. (2012). The sleepwalkers. Allen Lane. / Dedijer, V. (1966). The road to Sarajevo. Simon & Schuster.',
    question: '¿Qué ilustra Sarajevo sobre la relación entre pesquisa criminal y política internacional?',
    hint: 'Identificar al autor material no agotó las consecuencias: el sistema de alianzas amplificó el hecho.',
    failAdvice: 'No digas que el atentado careció de autores conocidos. El punto es la escalada más allá de la causa penal local.',
    options: [
      'Todo atentado se agota en el juicio local sin más',
      'La identificación de autores puede ser clara y aun así desencadenar una crisis de alianzas',
      'Princip fue absuelto por falta de pruebas',
      'No hubo investigación austrohúngara alguna',
      'La guerra mundial empezó en 1912 por otra causa exclusiva',
      'El archiduque sobrevivió al atentado',
      'La Mano Negra era una invención periodística sin miembros',
      'Solo importó el arma, no el contexto político',
    ],
    correctCanonical: 1,
    region: 'Balcanes / Europa',
    difficulty: 3,
  },
  {
    id: 'p25',
    title: 'El caso del “hombre de Kennewick” y el conflicto de competencias (EE. UU.)',
    story:
      'Restos humanos antiguos hallados cerca del río Columbia generaron un conflicto entre científicos, tribus nativas y agencias federales bajo la ley NAGPRA. No es un homicidio reciente, pero sí una “investigación” de identidad, datación y derechos sobre restos. Muestra que la pesquisa de quién es alguien puede ser legal y antropológica a la vez.',
    source: 'Chatters, J. C. (2001). Ancient encounters. Simon & Schuster. / Thomas, D. H. (2000). Skull wars. Basic Books.',
    question: '¿Qué tensión institucional ilustra el caso?',
    hint: 'Ciencia de datación/identidad vs. derechos culturales y leyes de restitución.',
    failAdvice: 'No es un simple “CSI de 48 horas”. Hay conflicto de marcos legales y de significado de los restos.',
    options: [
      'Solo importa la velocidad de la autopsia policial',
      'Conflicto entre investigación científica y derechos/leyes sobre restos indígenas',
      'Los restos eran de 1990 con certeza absoluta desde el día uno',
      'NAGPRA prohíbe toda datación en cualquier contexto',
      'No hubo interés tribal alguno',
      'El caso se resolvió sin ninguna datación',
      'Kennewick está en Europa y no aplica ley estadounidense',
      'Se identificó al individuo por DNI moderno',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 3,
  },
  {
    id: 'p26',
    title: 'El caso Watergate (EE. UU., 1972–1974)',
    story:
      'Un allanamiento en el edificio Watergate terminó, tras investigación de periodistas y del Congreso, en la renuncia del presidente Nixon. El hilo incluyó grabaciones, testimonios y seguimiento del dinero. La lección clásica: un delito “menor” de entrada puede abrir una cadena de encubrimiento más grave que el hecho inicial.',
    source: 'Bernstein, C., & Woodward, B. (1974). All the President’s men. Simon & Schuster. / Kutler, S. I. (1990). The wars of Watergate. Knopf.',
    question: '¿Qué dinámica investigativa destaca Watergate?',
    hint: 'Delito inicial vs. cadena de encubrimiento y pruebas acumuladas (cintas, testimonios).',
    failAdvice: 'No fue solo “un robo sin consecuencias”. El peso cayó sobre el encubrimiento y el registro grabado.',
    options: [
      'El allanamiento careció de toda conexión política',
      'La pesquisa reveló una cadena de encubrimiento sostenida por pruebas y testimonios',
      'Nixon no fue investigado por ninguna institución',
      'No existieron grabaciones en la Casa Blanca',
      'El caso lo cerró la policía local en 24 horas sin prensa',
      'Woodward y Bernstein inventaron los nombres de todos los implicados',
      'El Congreso se negó a investigar',
      'Watergate demuestra que el dinero no deja rastros nunca',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 2,
  },
  {
    id: 'p27',
    title: 'El caso del Strangler de Boston (años 60)',
    story:
      'Una serie de asesinatos de mujeres en el área de Boston generó pánico y una investigación compleja. Albert DeSalvo confesó ser el Strangler, pero persistieron dudas sobre la autoría de todos los casos de la serie. Décadas después, pruebas de ADN vincularon a DeSalvo con al menos un caso emblemático (Mary Sullivan), sin cerrar automáticamente la autoría de toda la serie.',
    source: 'Jung, A. (2017). El asesino de Boston y el ADN (reportajes de actualización forense). / Frank, G. (1966). The Boston Strangler. New American Library.',
    question: '¿Qué precaución impone el uso de confesiones en series criminales?',
    hint: 'Confesar “ser el Strangler” no equivale automáticamente a prueba de cada víctima de la serie; el ADN posterior acota.',
    failAdvice: 'Distingue confirmación parcial forense de cierre total de todos los casos atribuidos mediáticamente.',
    options: [
      'Toda confesión cubre automáticamente todos los crímenes de una etiqueta mediática',
      'Hay que corroborar caso por caso; el ADN puede confirmar algunos sin cerrar toda la serie',
      'El ADN nunca se usó en relación con DeSalvo',
      'No hubo víctimas en Boston en los años 60',
      'La policía negó siempre la existencia de un patrón',
      'DeSalvo fue absuelto de todo en 1965',
      'Las confesiones sustituyen a la autopsia',
      'La prensa no cubrió el caso',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 4,
  },
  {
    id: 'p28',
    title: 'El atentado de Oklahoma City (1995)',
    story:
      'El atentado contra el edificio federal Alfred P. Murrah mató a 168 personas. Timothy McVeigh fue detenido pronto gracias a una combinación de testigos, la matrícula del camión de alquiler y el trabajo de ATF/FBI. El caso muestra que incluso en un atentado masivo la traza logística (alquiler, ruta, residuos del explosivo) puede ser reconstruida con rapidez si se preserva.',
    source: 'Michel, L., & Herbeck, D. (2001). American terrorist. Harper. / Stickney, B. M. (1996). All-American monster. Prometheus.',
    question: '¿Qué tipo de rastro permitió avanzar con rapidez según el patrón del caso?',
    hint: 'Logística del vehículo y testigos, no solo la magnitud de la explosión.',
    failAdvice: 'La magnitud del daño no sustituye la traza del camión de alquiler y los testimonios asociados.',
    options: [
      'La ausencia total de testigos y de vehículo',
      'Rastros logísticos del vehículo de alquiler y testimonios asociados',
      'Una confesión anónima por teléfono sin más datos',
      'La negación de que hubiera explosivo',
      'El cierre del caso sin detenidos',
      'La imposibilidad de identificar el edificio',
      'Solo pruebas de astrología forense',
      'La detención se produjo una década después sin pistas',
    ],
    correctCanonical: 1,
    region: 'Estados Unidos',
    difficulty: 2,
  },
  {
    id: 'p29',
    title: 'El caso Gladio / redes stay-behind en Europa',
    story:
      'Investigaciones periodísticas y parlamentarias (especialmente en Italia) sacaron a la luz estructuras clandestinas stay-behind de la Guerra Fría (conocidas en bloque como Gladio en el debate público). El problema investigativo es opaco por diseño: archivos clasificados, testimonios parciales y crímenes de la época (“años de plomo”) con autorías disputadas. El analista debe separar hechos documentados de hipótesis máximas.',
    source: 'Ganser, D. (2005). NATO’s secret armies. Frank Cass. / Comisión parlamentaria italiana sobre el terrorismo en Italia (informes de los años 90; síntesis en prensa especializada).',
    question: '¿Qué actitud metodológica es más sana ante redes clandestinas parcialmente documentadas?',
    hint: 'Ni negación total ni salto a la teoría que lo explica todo sin documento.',
    failAdvice: 'Trabaja con lo documentado (existencia de estructuras stay-behind en varios países) sin rellenar cada atentado de la época con la misma autoría sin prueba.',
    options: [
      'Afirmar que no existió ninguna estructura stay-behind en Europa',
      'Aceptar lo documentado y exigir prueba caso por caso para autorías específicas',
      'Atribuir todos los crímenes de la Guerra Fría a una sola oficina sin matices',
      'Ignorar los archivos parlamentarios por principio',
      'Tratar toda la historiografía como falsificación',
      'Resolver el tema solo con un documental sin fuentes',
      'Negar los “años de plomo” en Italia',
      'Cerrar el debate porque la Guerra Fría terminó',
    ],
    correctCanonical: 1,
    region: 'Europa',
    difficulty: 5,
  },
  {
    id: 'p30',
    title: 'El caso del 11-M (Madrid, 2004)',
    story:
      'Los atentados de los trenes de Madrid fueron reivindicados y perseguidos en una investigación que identificó una célula yihadista. En los primeros días hubo confusión informativa y debate político sobre autoría. La instrucción judicial, los explosivos, las tarjetas telefónicas y los suicidios de algunos implicados en Leganés configuraron el relato penal. El caso ilustra la presión de las primeras 48 horas informativas frente a la prueba pericial.',
    source: 'Reinares, F. (2014). ¡Matadlos! Por qué estuvo detrás del 11-M. Galaxia Gutenberg. / Juzgado Central de Instrucción (sumarios y sentencia de la Audiencia Nacional; síntesis públicas).',
    question: '¿Qué tensión metodológica destaca entre información inmediata y prueba?',
    hint: 'Las primeras hipótesis mediáticas vs. el peso de la instrucción (explosivos, red, Leganés).',
    failAdvice: 'No confunda el ruido de las primeras horas con el cuerpo probatorio que sostuvo la causa penal.',
    options: [
      'La primera hipótesis televisiva es siempre la verdad judicial final',
      'La presión informativa inicial puede divergir del cuerpo pericial y penal posterior',
      'No hubo investigación judicial en España',
      'Se descartó toda pista sobre explosivos',
      'Leganés no guarda relación alguna con la investigación',
      'El caso carece de sentencia',
      'Solo importó un único testigo sin forense',
      'Se resolvió sin identificar a ningún implicado',
    ],
    correctCanonical: 1,
    region: 'España',
    difficulty: 3,
  },
  {
    id: 'p31',
    title: 'El asesinato de Dulcie September (Francia / antiapartheid, 1988)',
    story:
      'La representante del ANC en Francia, Dulcie September, fue asesinada en París. Investigadores y periodistas han señalado la posible implicación de redes vinculadas al régimen de apartheid y a tráficos de armas. El caso permanece con zonas opacas y muestra la dificultad de investigar homicidios políticos transnacionales con servicios secretos de por medio.',
    source: 'Pauw, J. (2017). The president’s keepers (contexto de redes sudafricanas). Tafelberg. / Reportajes de investigación franceses y sudafricanos consolidados en biografías del ANC en el exilio.',
    question: '¿Qué dificulta especialmente este tipo de homicidio político transnacional?',
    hint: 'Jurisdicciones múltiples + posibles servicios de inteligencia + archivos cerrados.',
    failAdvice: 'No es un hurto local con un sospechoso en el barrio. Piensa en opacidad de Estado y cruce de fronteras.',
    options: [
      'La facilidad de obtener todos los archivos de inteligencia en 24 h',
      'Jurisdicciones múltiples y posible implicación de servicios con archivos opacos',
      'La ausencia total de contexto político en 1988',
      'September no era una figura pública',
      'Francia prohibió investigar homicidios en París',
      'El apartheid había terminado en 1980',
      'Hubo confesión televisada inmediata del autor material',
      'El caso se resolvió solo con una huella en un café',
    ],
    correctCanonical: 1,
    region: 'Francia / Sudáfrica',
    difficulty: 4,
  },
  {
    id: 'p32',
    title: 'El caso del “envenenamiento de Litvinenko” (Londres, 2006)',
    story:
      'Alexander Litvinenko murió en Londres por envenenamiento con polonio-210. La investigación británica siguió la traza radiactiva por hoteles, aviones y oficinas, una forma de “escena del crimen” extendida en el mapa. Un informe público británico apuntó a responsabilidad de agentes rusos y a posible aprobación en niveles altos; Moscú negó. El caso es paradigmático de forense radiológico y diplomacia.',
    source: 'Owen, R. (2016). The Litvinenko Inquiry: Report into the death of Alexander Litvinenko. UK Government. / Goldfarb, A., & Litvinenko, M. (2007). Death of a dissident. Free Press.',
    question: '¿Qué hizo singular la pesquisa desde el punto de vista forense?',
    hint: 'No fue solo una autopsia: hubo un mapa de contaminación radiactiva reconstruido.',
    failAdvice: 'La singularidad está en la traza de polonio a través de espacios y viajes, no en un arma blanca local.',
    options: [
      'La total imposibilidad de detectar el agente tóxico',
      'La reconstrucción de una traza radiactiva a través de lugares y desplazamientos',
      'La ausencia de cualquier informe público británico',
      'Litvinenko murió de causas naturales sin investigación',
      'No se analizó ningún hotel ni avión',
      'El polonio-210 es inocuo y no deja rastro',
      'La investigación duró menos de una hora',
      'Se descartó toda dimensión internacional',
    ],
    correctCanonical: 1,
    region: 'Reino Unido / Rusia',
    difficulty: 4,
  },
  {
    id: 'p33',
    title: 'El caso de los “archivos de la Stasi” (Alemania oriental)',
    story:
      'Tras 1989, la apertura de los archivos de la Stasi permitió a ciudadanos y fiscales reconstruir vigilancia, denuncias y responsabilidades. La investigación criminal de delitos de la dictadura se apoyó en un archivo masivo de fichas y carpetas. El problema ético y metodológico: interpretir informes de informantes, a veces exagerados o falsos, sin volver a victimizar.',
    source: 'Childs, D., & Popplewell, R. (1996). The Stasi. Macmillan. / Funder, A. (2003). Stasiland. Granta.',
    question: '¿Qué precaución exige trabajar con archivos de policía secreta?',
    hint: 'Los informantes no siempre decían verdad; el archivo es fuente y también distorsión.',
    failAdvice: 'No trates cada ficha como verdad literal. Cruza, contextualiza y evita daño colateral a terceros nombrados sin corroboración.',
    options: [
      'Cada informe de informante es literalmente cierto',
      'Hay que interpretar fichas con cautela, contrastando y evitando daño a terceros',
      'Los archivos de la Stasi se destruyeron por completo en 1989',
      'No existió vigilancia en la RDA',
      'Solo los oficiales de alto rango tienen nombre en los archivos',
      'Abrir archivos es inútil para la justicia posterior',
      'Las fichas no mencionan nunca a ciudadanos corrientes',
      'La Stasi no usó informantes civiles',
    ],
    correctCanonical: 1,
    region: 'Alemania',
    difficulty: 3,
  },
  {
    id: 'p34',
    title: 'El caso del “robo del siglo” en el Banco de Londres / grandes atracos',
    story:
      'Los grandes atracos (desde el Great Train Robbery británico de 1963 hasta asaltos planificados a depósitos) suelen caer por la fase posterior: gasto del botín, delaciones y trazas logísticas, más que por la audacia del momento del asalto. La policía construye el caso hacia atrás: dónde aparece el dinero, quién habla, qué vehículo se alquiló.',
    source: 'Reynolds, B. (1995). The autobiography of a thief. Bantam. / Read, P. P. (1978). The train robbers. W. H. Allen.',
    question: 'Según este patrón, ¿dónde suele romperse la cadena del atraco “perfecto”?',
    hint: 'El momento del golpe vs. la vida posterior del dinero y de los cómplices.',
    failAdvice: 'Rara vez el fallo principal es “no hubo plan”; suele ser el rastro posterior del botín y las relaciones humanas.',
    options: [
      'Nunca se rompe si el plan del día del golpe fue bueno',
      'En el gasto del botín, las delaciones y la logística posterior',
      'Solo en la imposibilidad física de abrir una caja',
      'Exclusivamente por fallos de la prensa',
      'Porque la policía no investiga atracos',
      'Porque el dinero en efectivo no deja nunca rastros',
      'Porque los cómplices nunca hablan en la historia real',
      'Porque no existen atracos planificados documentados',
    ],
    correctCanonical: 1,
    region: 'Reino Unido / patrón internacional',
    difficulty: 2,
  },
  {
    id: 'p35',
    title: 'El caso de la “Operación Cóndor” (Cono Sur)',
    story:
      'Documentos desclasificados y causas judiciales en varios países mostraron una coordinación represiva entre dictaduras del Cono Sur para perseguir opositores más allá de las fronteras. La investigación histórica y penal usa archivos de inteligencia, peticiones de extradición y testimonios. Es un caso de red estatal transnacional, no de un “asesino en serie” individual.',
    source: 'McSherry, J. P. (2005). Predatory states. Rowman & Littlefield. / Dinges, J. (2004). The Condor years. New Press.',
    question: '¿Qué tipo de prueba sostiene la existencia de Cóndor en la historiografía seria?',
    hint: 'Archivos, cooperación policial/intelligence entre Estados, causas judiciales — no solo rumor.',
    failAdvice: 'La respuesta sólida apela a documentación y procesos, no a la negación ni al mito sin fuente.',
    options: [
      'Solo leyendas urbanas sin documento',
      'Archivos desclasificados, cooperación interestatal documentada y causas penales',
      'Un único artículo de opinión sin notas al pie',
      'La negación unánime de todos los archivos',
      'La imposibilidad de extradiciones en los años 70',
      'Cóndor fue el nombre de una ONG de derechos humanos',
      'No hubo opositores perseguidos en el Cono Sur',
      'Solo existió en novelas de ficción',
    ],
    correctCanonical: 1,
    region: 'Cono Sur',
    difficulty: 3,
  },
  {
    id: 'p36',
    title: 'El caso del “Zodiac japonés” / persecución mediática y policía en Japón',
    story:
      'Japón ha vivido casos de asesinos en serie y atentados (incluido el de Aum Shinrikyo en el metro de Tokio, 1995) donde la policía metropolitana y la fiscalía trabajan bajo intensa presión mediática. En el atentado con gas sarín, la investigación combinó forense química, vigilancia de la secta y testimonios de miembros. La lección: la evidencia química de un agente de guerra en el metro exige un tipo de pericia distinta a la de un homicidio con arma blanca.',
    source: 'Kaplan, D. E., & Marshall, A. (1996). The cult at the end of the world. Crown. / Reader, I. (2000). Religious violence in contemporary Japan. University of Hawaii Press.',
    question: '¿Qué tipo de pericia fue central en el caso del metro de Tokio?',
    hint: 'No solo “quién”, sino “qué sustancia y cómo se dispersó”.',
    failAdvice: 'La clave forense es química / agente, además de la estructura organizativa de la secta.',
    options: [
      'Solo grafología de panfletos sin química',
      'Forense química del agente y análisis de la organización responsable',
      'La negación de que hubiera gas en el metro',
      'Un único testigo ocular sin muestras',
      'La resolución sin detener a ningún miembro de Aum',
      'Prohibir la química en los tribunales japoneses',
      'Tratar el caso como un accidente de limpieza',
      'Ignorar por completo la estructura de la secta',
    ],
    correctCanonical: 1,
    region: 'Japón',
    difficulty: 3,
  },
  {
    id: 'p37',
    title: 'El caso Sacco y Vanzetti (EE. UU., 1920s)',
    story:
      'Dos inmigrantes anarquistas italianos fueron condenados por homicidio en Massachusetts en un clima de pánico rojo y prejuicio étnico. El debate sobre su culpabilidad material continúa en la historiografía, pero el consenso crítico subraya irregularidades procesales, parcialidad y uso simbólico del juicio. Es un caso escuela sobre sesgo y prueba.',
    source: 'Avrich, P. (1991). Sacco and Vanzetti: The anarchist background. Princeton University Press. / Kadane, J. B., & Schum, D. A. (1996). A probabilistic analysis of the Sacco and Vanzetti evidence. Wiley.',
    question: '¿Qué riesgo procesal ilustra el caso para la investigación y el juicio?',
    hint: 'Clima político + prejuicio vs. estándar de prueba sobrio.',
    failAdvice: 'Más allá de la culpabilidad material disputada, el texto apunta a irregularidades y sesgo como lección central.',
    options: [
      'El prejuicio político y étnico puede degradar la calidad del proceso',
      'Los juicios de los años 20 fueron siempre impecables',
      'No hubo inmigrantes italianos en Massachusetts',
      'La prensa guardó silencio total',
      'Sacco y Vanzetti fueron jueces del caso',
      'No existió debate historiográfico posterior',
      'El pánico rojo mejoró la imparcialidad del jurado',
      'La prueba balística de la época era infalible por definición',
    ],
    correctCanonical: 0,
    region: 'Estados Unidos',
    difficulty: 3,
  },
  {
    id: 'p38',
    title: 'El caso del “número de serie” y el atentado de Lockerbie (1988)',
    story:
      'El vuelo Pan Am 103 estalló sobre Lockerbie, Escocia. La investigación internacional reconstruyó el artefacto a partir de fragmentos y un fragmento de temporizador con cadena de suministro. Libia acabó asumiendo responsabilidades civiles; el debate sobre coautores y móviles sigue en la literatura de inteligencia. Es un caso de forense de fragmentos a escala de aviación.',
    source: 'Willer, H. (reportajes y síntesis del Scottish fatal accident inquiry). / Cohen, S., & Cohen, S. (2000). Pan Am 103: The bombing that changed the world (síntesis periodísticas).',
    question: '¿Qué técnica investigativa destaca en Lockerbie?',
    hint: 'Recomposición del artefacto y rastreo de componentes, no solo la explosión en sí.',
    failAdvice: 'La singularidad está en la reconstrucción material del dispositivo a partir de restos y su cadena de origen.',
    options: [
      'Ignorar todos los fragmentos del avión',
      'Recomponer el artefacto y rastrear componentes hasta su cadena de suministro',
      'Cerrar el caso sin examinar el temporizador',
      'Tratar el siniestro como fallo de motor sin explosivo',
      'Prohibir la cooperación internacional',
      'Resolver solo con un testigo en tierra sin restos',
      'Negar que hubiera víctimas',
      'Depender únicamente de la reivindicación mediática inmediata',
    ],
    correctCanonical: 1,
    region: 'Reino Unido / internacional',
    difficulty: 4,
  },
  {
    id: 'p39',
    title: 'El caso de la “desaparición de Amelia Earhart” (1937)',
    story:
      'La aviadora desapareció en el Pacífico. Hipótesis: fallo de navegación y combustible; aterrizaje forzoso; captura. Expediciones modernas han buscado restos en islas del Pacífico central. El caso enseña a graduar hipótesis según probabilidad y evidencia positiva, no según romanticismo.',
    source: 'Rich, D. L. (1989). Amelia Earhart: A biography. Smithsonian. / King, T. F., et al. (2001). Amelia Earhart’s shoes. AltaMira (hipótesis Nikumaroro y debate).',
    question: '¿Qué criterio debe regir el análisis de desapariciones con múltiples hipótesis?',
    hint: 'Prioriza evidencia positiva y parsimonia frente a la hipótesis más cinematográfica.',
    failAdvice: 'No elijas la teoría más espectacular solo por serlo. Evalúa datos de radio, plan de vuelo y hallazgos materiales.',
    options: [
      'La hipótesis más cinematográfica es siempre la verdadera',
      'Graduar hipótesis por evidencia positiva y parsimonia',
      'Negar que Earhart fuera piloto',
      'Afirmar que aterrizó en París según el plan original',
      'Ignorar los mensajes de radio por principio',
      'Cerrar el caso sin examinar el plan de vuelo',
      'Tratar toda expedición moderna como fraude sin leerla',
      'Resolver solo con un documental sin fuentes primarias',
    ],
    correctCanonical: 1,
    region: 'Pacífico',
    difficulty: 3,
  },
  {
    id: 'p40',
    title: 'El caso del “detective Vidocq” y la policía moderna (Francia, s. XIX)',
    story:
      'Eugène-François Vidocq, exdelincuente convertido en informante y luego en figura fundacional de la Sûreté, popularizó técnicas de infiltración, registro de delincuentes y disfraz. Su figura está envuelta en auto propaganda, pero anticipa la tensión ética de usar a “chivatos” y la profesionalización de la policía de investigación en París.',
    source: 'Edwards, S. (1977). The Vidocq dossier. Houghton Mifflin. / Stead, P. J. (1953). Vidocq: Paragon of police. Staples.',
    question: '¿Qué tensión ética introduce el modelo tipo Vidocq?',
    hint: 'Eficacia de informantes / infiltración vs. riesgo de abuso y narrativa mitificada.',
    failAdvice: 'No es solo “el primer policía bueno”. El punto es el uso de bajo mundo como herramienta y su mitología.',
    options: [
      'La policía nunca debe registrar a delincuentes',
      'La infiltración y los informantes pueden ser eficaces pero éticamente riesgosos',
      'Vidocq negó toda relación con el crimen',
      'La Sûreté prohíbe los archivos',
      'El disfraz está prohibido en toda investigación',
      'París carecía de delincuencia en el siglo XIX',
      'Vidocq inventó el ADN',
      'No existió ninguna policía de investigación en Francia',
    ],
    correctCanonical: 1,
    region: 'Francia',
    difficulty: 2,
  },
]

// ---------------------------------------------------------------------------
// Expansión determinista hasta TOTAL_LEVELS (variantes etiquetadas, sin
// borrar el banco; los casos de policía ya superan ampliamente el núcleo
// original educativo).
// ---------------------------------------------------------------------------

function buildLevels(): CaseItem[] {
  const out: CaseItem[] = [...CASES]
  const suffixes = [
    ' Relee las restricciones temporales con cuidado.',
    ' Descarta primero lo imposible; no lo meramente improbable.',
    ' La hipótesis más corta que explica todos los datos suele preferirse.',
    ' Separar hecho observado de inferencia es parte del trabajo.',
    ' Una fuente parcial no autoriza una conclusión total.',
  ]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const base = CASES[i % CASES.length]
    const tag = out.length
    out.push({
      ...base,
      id: `${base.id}-x${tag}`,
      title: `${base.title}`,
      story: base.story + ' ' + suffixes[i % suffixes.length],
      hint: base.hint,
      failAdvice: base.failAdvice,
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}

const LEVELS = buildLevels()

// ============================================================================
// Componente
// ============================================================================

export function HistoriasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel],
  )
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))

  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'menu' | 'play' | 'result'>('menu')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [item, setItem] = useState<ServedCase | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [runMs, setRunMs] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted())

  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level
  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)

  const limit = useMemo(() => Math.max(45, TIMER_BASE - Math.floor(level / 7)), [level])

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const pickCase = useCallback(
    (lv: number, att: number): ServedCase => {
      // Preferir casos no completados
      for (let k = 0; k < LEVELS.length; k++) {
        const idx = (lv - 1 + att * 11 + k * 3) % LEVELS.length
        const base = LEVELS[idx]
        const servedId = `${base.id}#${lv}#${att}#${k}`
        if (!completed.has(servedId) && !completed.has(base.id)) {
          const served = serveCase(base, lv * 1000 + att * 17 + k)
          return { ...served, id: servedId }
        }
      }
      const fallback = LEVELS[(lv - 1 + att) % LEVELS.length]
      const served = serveCase(fallback, lv * 1000 + att)
      return { ...served, id: `${fallback.id}#${lv}#${att}#f` }
    },
    [completed],
  )

  const startLevel = useCallback(
    (lv: number, att = 0) => {
      clearTimers()
      const pick = pickCase(lv, att)
      setItem(pick)
      setSelected(null)
      setIsCorrect(null)
      setShowHint(false)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(limit)
      setRunMs(0)
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              clearTimers()
              const ms = Date.now() - startRef.current
              setRunMs(ms)
              setIsCorrect(false)
              setPhase('result')
              soundFail()
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: ms,
              })
              return 0
            }
            return t - 1
          })
        }, 1000)
      }
    },
    [limit, useTimer, pickCase],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!item || isCorrect !== null) return
    soundClick()
    setSelected(idx)
    clearTimers()
    const ok = idx === item.correct
    setIsCorrect(ok)
    setPhase('result')
    const ms = Date.now() - startRef.current
    setRunMs(ms)
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: ok,
      timeMs: ms,
    })
    if (ok) {
      soundSuccess()
      setCompleted((prev) => {
        const n = new Set(prev)
        n.add(item.id)
        saveCompleted(n)
        return n
      })
    } else {
      soundFail()
    }
  }

  const policeCount = CASES.filter((c) => c.id.startsWith('p')).length
  const coreCount = CASES.filter((c) => c.id.startsWith('h')).length

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="glass-button secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              onClick={() => {
                soundClick()
                clearTimers()
                if (phase === 'menu') navigate('/categoria/deduccion')
                else {
                  setPhase('menu')
                  setShowLevelPicker(false)
                }
              }}
            >
              {phase === 'menu' ? '← Volver' : '← Modos'}
            </button>
            {phase === 'menu' && (
              <button
                type="button"
                className="glass-button secondary"
                style={{ padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
                onClick={() => {
                  soundClick()
                  setShowLevelPicker((v) => !v)
                }}
              >
                Nivel {level} ▾
              </button>
            )}
            {phase !== 'menu' && (
              <span className="level-number" style={{ fontSize: '1.05rem' }}>
                Nivel {level}
              </span>
            )}
            {phase === 'play' && useTimer && (
              <span
                className="mono"
                style={{
                  fontSize: '0.95rem',
                  color: timeLeft <= 15 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
                }}
              >
                ⏱ {timeLeft}s
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 'clamp(1.45rem, 4.5vw, 1.9rem)' }}>🔍 Casos de detective</h1>
          <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
            Inferencias y casos para analizarse.
          </p>
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && phase === 'menu' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
          >
            <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.5rem' }}>
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
                Nv. {defaultLevel}
                <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                  actual
                </span>
              </button>
              {unlockedRows.map((u) => (
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
                  <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                    {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.5, textAlign: 'center' }}>
                  Banco mixto: lógica e historia de la ciencia, más un bloque amplio de <strong>casos policiales e
                  investigaciones reales</strong> (Francia, Reino Unido, EE. UU., Argentina, España, Colombia, Japón,
                  Cono Sur, URSS, India…). Cada caso incluye fuente tipo APA. Al acertar, el caso queda marcado y no se
                  repite. Al fallar no se revela la respuesta: solo un consejo de método.
                  {bestForLevel != null && bestForLevel > 0 && (
                    <>
                      {' '}
                      · 🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                    </>
                  )}
                </p>
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                  Núcleo educativo: {coreCount} · Policía / investigación: {policeCount} · Niveles totales:{' '}
                  {TOTAL_LEVELS} · Completados: {completed.size}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.85rem 1.1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>Activo por defecto</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      const n = !useTimer
                      soundToggle(n)
                      setUseTimer(n)
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
                <GlassButton
                  onClick={() => startLevel(Math.min(level, maxSelectable), 0)}
                  style={{ minHeight: 48 }}
                >
                  Abrir caso · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && item && (
          <motion.div key="play" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <p
                    style={{
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--gco-ink-muted)',
                      margin: 0,
                    }}
                  >
                    {item.title}
                    {item.region ? ` · ${item.region}` : ''}
                  </p>
                  {item.difficulty != null && (
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}>
                      Dificultad {'●'.repeat(item.difficulty)}{'○'.repeat(5 - item.difficulty)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.55, marginBottom: 10 }}>{item.story}</p>
                <p
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--gco-ink-faint)',
                    fontStyle: 'italic',
                    marginBottom: 12,
                    lineHeight: 1.4,
                  }}
                >
                  {item.source}
                </p>

                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ marginBottom: 12, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => {
                    soundClick()
                    setShowHint((v) => !v)
                  }}
                >
                  {showHint ? 'Ocultar pista' : 'Pista'}
                </button>

                <AnimatePresence>
                  {showHint && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden', marginBottom: 12 }}
                    >
                      <div
                        style={{
                          padding: '0.7rem 0.85rem',
                          borderRadius: 12,
                          border: '1px solid var(--gco-glass-border)',
                          background: 'var(--gco-fill-quaternary)',
                        }}
                      >
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gco-primary)', marginBottom: 4 }}>
                          PISTA
                        </p>
                        <p style={{ fontSize: '0.84rem', color: 'var(--gco-ink-muted)', margin: 0, lineHeight: 1.45 }}>
                          {item.hint}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p style={{ fontWeight: 600, marginBottom: 12 }}>{item.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((opt, i) => (
                    <button
                      key={`${item.id}-${i}`}
                      type="button"
                      className="glass-button secondary"
                      style={{
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        minHeight: 46,
                        padding: '0.65rem 0.9rem',
                        fontSize: '0.88rem',
                        borderColor: selected === i ? 'var(--gco-primary)' : undefined,
                      }}
                      onClick={() => submit(i)}
                    >
                      <span style={{ opacity: 0.5, marginRight: 8, fontFamily: 'var(--font-mono)' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && item && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', textAlign: 'center' }}>
                <p
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {isCorrect ? 'Caso resuelto' : 'Inferencia incorrecta'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', marginBottom: 6 }}>
                  {formatDuration(runMs)}
                </p>
                {!isCorrect && (
                  <div
                    style={{
                      textAlign: 'left',
                      marginBottom: 14,
                      padding: '0.75rem 0.9rem',
                      borderRadius: 12,
                      border: '1px solid var(--gco-glass-border)',
                      background: 'var(--gco-fill-quaternary)',
                    }}
                  >
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gco-secondary)', marginBottom: 4 }}>
                      CONSEJO (sin revelar la respuesta)
                    </p>
                    <p style={{ fontSize: '0.86rem', color: 'var(--gco-ink-muted)', margin: 0, lineHeight: 1.45 }}>
                      {item.failAdvice}
                    </p>
                  </div>
                )}
                {isCorrect && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 12 }}>
                    Caso marcado como completado. No se volverá a servir este mismo reto.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>
                      Siguiente caso
                    </GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, attempt + 1)}>
                      Otro caso (mismo nivel)
                    </GlassButton>
                  )}
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setPhase('menu')
                    }}
                  >
                    Menú
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default HistoriasGame