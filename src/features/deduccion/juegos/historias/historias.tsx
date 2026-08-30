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
const TOTAL_LEVELS = 140
const TIMER_BASE = 90

type CaseItem = {
  id: string
  title: string
  story: string
  source: string
  question: string
  /** Ocho opciones de longitud similar; solo `correct` encaja con todas las pistas */
  options: [string, string, string, string, string, string, string, string]
  correct: number
}

const CASES: CaseItem[] = [
  {
    id: 'h1',
    title: 'La biblioteca de Alejandría',
    story:
      'En el siglo III a. C., la Biblioteca de Alejandría reunió rollos de todo el Mediterráneo. No fue un edificio eterno: sufrió incendios parciales, saqueos y el declive del mecenazgo. Lo perdido no fue solo soporte físico, sino redes de copia. La idea de un único incendio catastrófico atribuido solo a César choca con el deterioro acumulativo que documentan los historiadores.',
    source: 'Canfora, L. (1986). La biblioteca scomparsa. / Bagnall, R. (2002). Alexandria: Library of dreams.',
    question: '¿Qué conclusión es más coherente con la evidencia del relato?',
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
    correct: 1,
  },
  {
    id: 'h2',
    title: 'El reloj de la estación',
    story:
      'Un testigo: «Salí del tren a las 8:00; el reloj de la estación marcaba 8:00». Otro: «Ese reloj lleva tres minutos adelantado desde ayer». Un tercero: «El tren llegó con dos minutos de retraso según el horario oficial». El horario oficial de llegada era 7:58. Nadie miente a propósito, pero pueden equivocarse de referencia.',
    source: 'Caso inventado (lógica temporal). Estilo puzzles de Smullyan.',
    question: '¿Qué es lo más probable sobre la hora real de llegada?',
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
    correct: 2,
  },
  {
    id: 'h3',
    title: 'Sócrates y el oráculo',
    story:
      'El oráculo de Delfos dijo que nadie era más sabio que Sócrates. Él interpretó que su sabiduría era reconocer la propia ignorancia. No hay escritos de Sócrates: dependemos de Platón, Jenofonte y Aristófanes, con agendas distintas.',
    source: 'Platón. Apología. / Guthrie, W. K. C. Historia de la filosofía griega.',
    question: '¿Qué afirmación es más prudente históricamente?',
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
    correct: 2,
  },
  {
    id: 'h4',
    title: 'La carta anónima',
    story:
      'Oficina de cinco personas (A–E). Tinta del bolígrafo común. A estaba de viaje el día del sello. B y C se vieron en la sala a las 10:00. El portero vio a D salir a las 9:40 con un sobre. E no usa esa marca de bolígrafo y tiene coartada médica. El sello es de las 10:15 en correos (5 minutos a pie).',
    source: 'Caso detective inventado (restricciones temporales).',
    question: '¿Quién es el sospechoso más sólido con los datos dados?',
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
    correct: 2,
  },
  {
    id: 'h5',
    title: 'Darwin y la adaptación',
    story:
      'Darwin no afirmó que el azar explique “todo”. Propuso variación heredable y selección a lo largo del tiempo. Estructuras que parecen diseñadas pueden surgir sin diseñador consciente. Confundir “sin propósito consciente” con “sin causa” es un error frecuente.',
    source: 'Darwin, C. (1859). On the Origin of Species. / Mayr, E. One Long Argument.',
    question: '¿Qué lectura es más fiel al argumento darwiniano clásico?',
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
    correct: 2,
  },
  {
    id: 'h6',
    title: 'El cuadro robado',
    story:
      'El museo cierra a las 18:00. Las cámaras del pasillo se reinician a las 18:05 (hueco de 90 s). El alarma del cuadro se desactiva con llave de dos guardias (G1, G2) o código del director. G1 firma a las 18:02; G2 a las 18:08. El director cenaba con testigos desde las 17:30. A las 18:20 el hueco está vacío. No hay rotura de cristal.',
    source: 'Caso inventado (cadena de custodia y tiempos).',
    question: '¿Qué hipótesis es más económica con los hechos?',
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
    correct: 2,
  },
  {
    id: 'h7',
    title: 'Newton y la manzana',
    story:
      'La anécdota de la manzana es tardía y divulgativa. Newton formuló que la misma ley describe la caída terrestre y el movimiento orbital. El logro no es la fruta, sino unificar mecánica terrestre y celeste con matemáticas precisas.',
    source: 'Westfall, R. Never at Rest. / Newton, I. (1687). Principia.',
    question: '¿Qué enfatiza mejor el aporte newtoniano aquí?',
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
    correct: 1,
  },
  {
    id: 'h8',
    title: 'La mentira del faro',
    story:
      'Tres fareros A, B y C. Uno siempre dice verdad, uno siempre miente, uno alterna. A: «B es el alternante». B: «C es el mentiroso». C: «A es el alternante». Solo una asignación es consistente.',
    source: 'Puzzle de lógica (variante Smullyan / caballeros).',
    question: '¿Quién es el que siempre dice la verdad?',
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
    correct: 1,
  },
  {
    id: 'h9',
    title: 'Fotosíntesis y oxígeno',
    story:
      'La fotosíntesis convierte luz en energía química y libera oxígeno en la fase lumínica de plantas y cianobacterias. Sin ese proceso histórico, la atmósfera oxidante actual no se habría formado igual. No implica que toda la biomasa dependa de un solo árbol.',
    source: 'Textos de biología general (dominio educativo).',
    question: '¿Qué afirmación es correcta según el texto?',
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
    correct: 2,
  },
  {
    id: 'h10',
    title: 'El testigo del puente',
    story:
      'Puente peatonal de un solo paso por tramo. A las 21:00 se oye un grito. A las 21:03 llega la policía. Hay barro fresco en ambos extremos. Un testigo al sur vio a X cruzar al norte a las 20:58. Otro al norte vio a X salir al sur a las 20:59. X tiene barro en ambos zapatos y niega haber cruzado.',
    source: 'Caso inventado (inconsistencia de trayectorias).',
    question: '¿Qué explica mejor la contradicción sin inventar personas extra?',
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
    correct: 1,
  },
  {
    id: 'h11',
    title: 'Aristóteles: potencia y acto',
    story:
      'Aristóteles distinguió lo que algo puede llegar a ser (potencia) y lo que ya es (acto). Un bloque de mármol es estatua en potencia; el escultor actualiza esa potencia. La distinción organiza el cambio sin negar la identidad del sujeto.',
    source: 'Aristóteles. Metafísica. / Ross, W. D. Aristotle.',
    question: '¿Qué captura mejor la distinción?',
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
    correct: 2,
  },
  {
    id: 'h12',
    title: 'El veneno y las copas',
    story:
      'Cuatro copas. Solo una tiene veneno. Etiquetas: «veneno», «vino», «vino o veneno», «vacía». Todas las etiquetas son falsas. Hay exactamente una con veneno, una con vino, una vacía y una con agua. Un invitado bebe de la etiquetada «veneno» y no muere.',
    source: 'Variante de puzzles de etiquetas falsas.',
    question: '¿Qué hay en la copa etiquetada «vino»?',
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
    correct: 2,
  },
  {
    id: 'h13',
    title: 'Apolo 11 y la cooperación',
    story:
      'La llegada a la Luna no fue un salto improvisado: décadas de física orbital, materiales, computación primitiva y organización. El éxito muestra capacidad colectiva bajo restricciones técnicas, no magia ni un solo genio aislado.',
    source: 'NASA. Apollo 11 Mission Report. / Chaikin, A. A Man on the Moon.',
    question: '¿Qué lectura es más ajustada?',
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
    correct: 2,
  },
  {
    id: 'h14',
    title: 'La herencia del testamento',
    story:
      'Un testamento reparte 1/2, 1/3 y 1/9. Las fracciones no suman 1. El juez, con un truco clásico (versión de los 17 camellos adaptada), reparte de modo que cada heredera recibe su fracción “aumentada” con coherencia matemática auxiliar.',
    source: 'Tradición del problema de los 17 camellos (matemática recreativa).',
    question: '¿Qué idea matemática ilustra el truco clásico?',
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
    correct: 1,
  },
  {
    id: 'h15',
    title: 'El eco del pozo',
    story:
      'Un explorador grita en un pozo y oye el eco a 1,2 s. Velocidad del sonido ~340 m/s. Ignora el tiempo de reacción. Estima la profundidad como ida y vuelta del sonido.',
    source: 'Problema de física básica (eco).',
    question: '¿Qué profundidad aproxima mejor?',
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
    correct: 1,
  },
  {
    id: 'h16',
    title: 'Tres interruptores y una bombilla',
    story:
      'Tres interruptores en un pasillo; una bombilla en otra habitación. Puedes manipular interruptores a voluntad, pero solo entrar una vez a la habitación de la bombilla. Quieres identificar qué interruptor la controla.',
    source: 'Puzzle clásico de lógica física (calor y tiempo).',
    question: '¿Qué estrategia clásica resuelve el problema?',
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
    correct: 0,
  },
  {
    id: 'h17',
    title: 'El retrato del padre',
    story:
      'Una mujer mira un retrato y dice: «No tengo hermanos ni hermanas, pero el padre de este hombre es el hijo de mi padre».',
    source: 'Acertijo clásico de parentesco (variante).',
    question: '¿Quién aparece en el retrato?',
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
    correct: 0,
  },
  {
    id: 'h18',
    title: 'Caballeros y escuderos',
    story:
      'En una isla, caballeros siempre dicen verdad y escuderos siempre mienten. A dice: «B es escudero». B dice: «A y C son del mismo tipo». C dice: «A es escudero».',
    source: 'Puzzle de caballeros y escuderos (Smullyan).',
    question: '¿Qué asignación es consistente?',
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
    correct: 0,
  },
  {
    id: 'h19',
    title: 'El barbero de Russell',
    story:
      'En un pueblo, el barbero afeita a todos los que no se afeitan a sí mismos, y solo a ellos.',
    source: 'Paradoja de Russell (versión popular del barbero).',
    question: '¿Qué ocurre con el barbero?',
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
    correct: 0,
  },
  {
    id: 'h20',
    title: 'Monedas y balanza',
    story:
      'Hay 12 monedas. Una es falsa y puede ser más ligera o más pesada. Dispones de una balanza de dos platos.',
    source: 'Puzzle clásico de pesadas (teoría de la información).',
    question: '¿Cuántas pesadas bastan en el peor caso?',
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
    correct: 0,
  },
  {
    id: 'h21',
    title: 'El tren y el túnel',
    story:
      'Un tren de 1 km entra en un túnel de 1 km a 60 km/h. ¿Cuánto tarda en salir completamente del túnel?',
    source: 'Problema de cinemática elemental.',
    question: 'Tiempo hasta que el tren está del todo fuera:',
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
    correct: 0,
  },
  {
    id: 'h22',
    title: 'Dos relojes desincronizados',
    story:
      'Un reloj se atrasa 1 minuto por hora. Otro se adelanta 1 minuto por hora. Se sincronizan a las 12:00.',
    source: 'Problema de relojes (aritmética modular).',
    question: '¿Cuándo vuelven a marcar la misma hora?',
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
    correct: 0,
  },
  {
    id: 'h23',
    title: 'El mensajero y las dos puertas',
    story:
      'Dos puertas: una a la libertad, otra a la muerte. Dos guardias: uno miente siempre, otro dice siempre la verdad. Puedes hacer una sola pregunta a uno de ellos.',
    source: 'Puzzle de puertas y guardias (lógica clásica).',
    question: '¿Qué pregunta te garantiza la puerta segura?',
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
    correct: 0,
  },
  {
    id: 'h24',
    title: 'Calcetines a oscuras',
    story:
      'Cajón con calcetines rojos y azules a pares iguales. Coges a oscuras.',
    source: 'Principio del casillero (pigeonhole).',
    question: '¿Cuántos mínimos para asegurar un par del mismo color?',
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
    correct: 0,
  },
  {
    id: 'h25',
    title: 'El caracol en el pozo',
    story:
      'Pozo de 30 m. El caracol sube 3 m de día y baja 2 m de noche.',
    source: 'Problema clásico de progreso neto.',
    question: '¿En cuántos días sale del pozo?',
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
    correct: 0,
  },
]

function buildLevels(): CaseItem[] {
  const out: CaseItem[] = [...CASES]
  const twists = [
    ' Una nota al margen añade una restricción menor que no cambia el núcleo.',
    ' Un testigo secundario confirma un detalle ya implícito en la narrativa.',
    ' La fuente se mantiene; el foco es la inferencia, no la cita.',
    ' El reloj de referencia podría tener un minuto de error; no basta para otra conclusión.',
    ' Se descarta un montaje masivo por falta de evidencia en el relato.',
  ]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const base = CASES[i % CASES.length]
    const t = twists[i % twists.length]
    out.push({
      ...base,
      id: `${base.id}-v${out.length}`,
      story: base.story + t,
      title: `${base.title} · ${out.length}`,
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}

const LEVELS = buildLevels()

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
  const [item, setItem] = useState<CaseItem | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [runMs, setRunMs] = useState(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const limit = useMemo(() => Math.max(40, TIMER_BASE - Math.floor(level / 6)), [level])

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0) => {
      clearTimers()
      const pick = LEVELS[(lv - 1 + att * 5) % LEVELS.length]
      setItem(pick)
      setSelected(null)
      setIsCorrect(null)
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
    [limit, useTimer],
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
    if (ok) soundSuccess()
    else soundFail()
  }

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
            Ocho hipótesis de peso similar. Solo una encaja con todas las pistas.
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
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.45, textAlign: 'center' }}>
                  Historias reales, filosóficas o de detective. Al fallar, el caso cambia sin subir de nivel.
                  {bestForLevel != null && bestForLevel > 0 && (
                    <>
                      {' '}
                      · 🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                    </>
                  )}
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
                <p
                  style={{
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: 8,
                  }}
                >
                  {item.title}
                </p>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.55, marginBottom: 10 }}>{item.story}</p>
                <p
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--gco-ink-faint)',
                    fontStyle: 'italic',
                    marginBottom: 14,
                  }}
                >
                  {item.source}
                </p>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>{item.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((opt, i) => (
                    <button
                      key={i}
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
                  <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                    Mejor respuesta:{' '}
                    <strong style={{ color: 'var(--gco-primary)' }}>{item.options[item.correct]}</strong>
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