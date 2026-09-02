/**
 * =============================================================================
 * acertijos.tsx — Acertijos y adivinanzas · GymCogOrigins
 * =============================================================================
 *
 * Ruta sugerida:
 *   src/features/deduccion/juegos/acertijos/acertijos.tsx
 *
 * Mecánica:
 * - Banco amplio de acertijos, adivinanzas, lógica, probabilidad y paradojas.
 * - La respuesta correcta está dispersa entre A/B/C/D (nunca siempre en la misma).
 * - Pista analítica opcional por nivel (razonamiento, no spoiler directo).
 * - Fallar cambia el acertijo; solo los aciertos fijan progreso.
 * - Contrarreloj opcional; registro de mejores tiempos.
 * =============================================================================
 */

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
const GAME_ID = 'acertijos'
const TOTAL_LEVELS = 140
const TIMER_BASE = 55

type RiddleKind =
  | 'adivinanza'
  | 'acertijo'
  | 'logica'
  | 'matematica'
  | 'paradoja'
  | 'probabilidad'
  | 'linguistica'

type Riddle = {
  id: string
  q: string
  options: [string, string, string, string]
  /** Índice 0–3 de la opción correcta (disperso a propósito). */
  correct: 0 | 1 | 2 | 3
  kind: RiddleKind
  /** Pista de pensamiento analítico (no revela la respuesta). */
  hint: string
  /** Explicación breve al fallar o al acertar. */
  explain: string
}

/**
 * Banco base.
 * IMPORTANTE: `correct` está deliberadamente repartido entre 0, 1, 2 y 3.
 */
const BANK: Riddle[] = [
  {
    id: 'a1',
    kind: 'adivinanza',
    q: 'Blanco por dentro, verde por fuera. Si quieres que te lo diga, espera.',
    options: ['El plátano', 'La pera', 'El coco', 'La manzana'],
    correct: 1,
    hint: 'Piensa en una fruta de piel verde y carne clara, típica de adivinanzas infantiles en español.',
    explain: 'La pera: verde por fuera y blanca por dentro. El ritmo de la adivinanza clásica apunta a ella.',
  },
  {
    id: 'a2',
    kind: 'adivinanza',
    q: 'Oro parece, plata no es. Quien no lo adivine, bien tonto es.',
    options: ['El plátano', 'El oro', 'La moneda', 'El sol'],
    correct: 0,
    hint: 'La frase niega que sea plata y solo “parece” oro: busca un objeto cotidiano de color amarillo dorado.',
    explain: 'El plátano parece oro (amarillo) y no es plata. Es una adivinanza tradicional.',
  },
  {
    id: 'a3',
    kind: 'acertijo',
    q: 'Tiene ciudades sin casas, ríos sin agua y bosques sin árboles. ¿Qué es?',
    options: ['Un sueño', 'Un mapa', 'Una nube', 'Un desierto'],
    correct: 1,
    hint: 'No busques un lugar real: busca una representación simbólica de lugares.',
    explain: 'Un mapa representa ciudades, ríos y bosques sin contener los objetos físicos.',
  },
  {
    id: 'a4',
    kind: 'acertijo',
    q: 'Cuanto más se seca, más mojada se pone. ¿Qué es?',
    options: ['La esponja', 'La toalla', 'La ropa', 'El jabón'],
    correct: 1,
    hint: 'Paradoja aparente: un objeto que, al usarse para secar, se empapa.',
    explain: 'La toalla: cuanto más seca (a alguien o algo), más mojada se pone ella.',
  },
  {
    id: 'a5',
    kind: 'acertijo',
    q: 'Si me nombras, desaparezco. ¿Qué soy?',
    options: ['El eco', 'La sombra', 'El silencio', 'El secreto'],
    correct: 2,
    hint: 'El acto de decir el nombre del concepto destruye el estado que nombra.',
    explain: 'El silencio: al nombrarlo, dejas de estar en silencio.',
  },
  {
    id: 'a6',
    kind: 'adivinanza',
    q: 'Agua pasa por mi casa, cate de mi corazón.',
    options: ['El coco', 'La sandía', 'El melón', 'La naranja'],
    correct: 1,
    hint: 'Juego fonético: “pasa por mi casa” y “cate” suenan a partes del nombre de una fruta.',
    explain: 'Sandía: “agua pasa por mi casa, cate de mi corazón” → san-día (juego de palabras clásico).',
  },
  {
    id: 'a7',
    kind: 'logica',
    q: 'Un hombre mira un retrato y dice: «Hermanos y hermanas no tengo, pero el padre de ese hombre es el hijo de mi padre». ¿A quién mira?',
    options: ['A su hijo', 'A su hermano', 'A su padre', 'A sí mismo'],
    correct: 0,
    hint: 'Descompón la frase: “el hijo de mi padre” soy yo (si no tengo hermanos). Entonces “el padre de ese hombre” soy yo.',
    explain: 'Sin hermanos, “el hijo de mi padre” = yo. Luego soy el padre del hombre del retrato → mira a su hijo.',
  },
  {
    id: 'a8',
    kind: 'acertijo',
    q: '¿Qué se rompe al nombrarlo?',
    options: ['El cristal', 'El secreto', 'El silencio', 'El hielo'],
    correct: 2,
    hint: 'Misma lógica que “si me nombras, desaparezco”: el nombre interrumpe el estado.',
    explain: 'El silencio se “rompe” al hablar para nombrarlo.',
  },
  {
    id: 'a9',
    kind: 'adivinanza',
    q: 'Largo, largo como un camino, lleno de letras y de caminos.',
    options: ['El libro', 'El abecedario', 'El mapa', 'El río'],
    correct: 1,
    hint: '“Letras” y “camino” (orden secuencial) apuntan a la secuencia completa de letras.',
    explain: 'El abecedario: es una secuencia larga de letras, “camino” de A a Z.',
  },
  {
    id: 'a10',
    kind: 'acertijo',
    q: 'Tengo agujas pero no coso; números pero no cuento. ¿Qué soy?',
    options: ['Un termómetro', 'Una brújula', 'Un reloj', 'Un ábaco'],
    correct: 2,
    hint: 'Objeto cotidiano con manecillas (“agujas”) y esfera numerada.',
    explain: 'Un reloj tiene agujas (manecillas) y números, pero no cose ni “cuenta” en el sentido aritmético ordinario.',
  },
  {
    id: 'a11',
    kind: 'acertijo',
    q: 'Camina sin piernas, habla sin boca, vuela sin alas. ¿Qué es?',
    options: ['El eco', 'La nube', 'El viento', 'El humo'],
    correct: 2,
    hint: 'Fenómeno natural que se desplaza, produce sonido y se eleva sin morfología animal.',
    explain: 'El viento: se mueve, “habla” (silba) y se eleva sin piernas, boca ni alas.',
  },
  {
    id: 'a12',
    kind: 'logica',
    q: 'Un granjero tiene 17 ovejas. Todas menos 9 mueren. ¿Cuántas le quedan?',
    options: ['8', '17', '9', '0'],
    correct: 2,
    hint: 'Lee con precisión: “todas menos 9” significa que 9 son las que no mueren.',
    explain: '“Todas menos 9 mueren” ⇒ sobreviven 9.',
  },
  {
    id: 'a13',
    kind: 'logica',
    q: '¿Qué pesa más: un kilo de plomo o un kilo de plumas?',
    options: ['El plomo', 'Las plumas', 'Pesan igual', 'Depende del volumen'],
    correct: 2,
    hint: 'Compara la magnitud “un kilo”, no la densidad ni el volumen.',
    explain: 'Un kilo es un kilo: pesan igual. La intuición confunde peso con volumen/densidad.',
  },
  {
    id: 'a14',
    kind: 'logica',
    q: 'Un tren eléctrico va de norte a sur. El viento sopla de este a oeste. ¿Hacia dónde va el humo?',
    options: ['Al oeste', 'Al este', 'Al sur', 'No hay humo'],
    correct: 3,
    hint: 'Relee el tipo de tren. ¿Qué emite realmente?',
    explain: 'Tren eléctrico: no produce humo de combustión.',
  },
  {
    id: 'a15',
    kind: 'matematica',
    q: 'En un cajón hay calcetines negros y blancos a pares iguales. ¿Cuántos debes sacar como mínimo, a oscuras, para garantizar un par del mismo color?',
    options: ['2', '3', '4', '5'],
    correct: 1,
    hint: 'Peor caso: primero uno de cada color; el siguiente fuerza el par.',
    explain: 'En el peor caso sacas 1 negro y 1 blanco; el tercero forma par con uno de los dos. Respuesta: 3 (principio del palomar).',
  },
  {
    id: 'a16',
    kind: 'logica',
    q: 'Barquero, lobo, cabra y col. La barca solo lleva al barquero y un pasajero. El lobo no puede quedar solo con la cabra, ni la cabra sola con la col. ¿Cuál es un orden mínimo válido?',
    options: [
      'Lobo primero; luego col',
      'Cabra; vuelve; lobo; vuelve con cabra; col; vuelve; cabra',
      'Col primero; luego lobo',
      'Imposible en menos de 20 viajes',
    ],
    correct: 1,
    hint: 'La cabra es el elemento conflictivo con ambos; debe “mediar” los cruces.',
    explain: 'Solución clásica: llevar primero la cabra; regresar; llevar lobo (o col); regresar con la cabra; llevar la col (o lobo); regresar; llevar la cabra.',
  },
  {
    id: 'a17',
    kind: 'linguistica',
    q: '¿Qué número sigue en la serie: 2, 3, 3, 5, 4, 4, 3, 5, 5, 4…?',
    options: ['6', '4', '3 (letras de «seis»)', '2'],
    correct: 2,
    hint: 'No es una serie aritmética: cuenta propiedades del nombre del número en español.',
    explain: 'Cada término es el número de letras del nombre: uno(3), dos(3), tres(4)… La serie dada corresponde a conteos de letras; “seis” tiene 3 letras.',
  },
  {
    id: 'a18',
    kind: 'paradoja',
    q: '«Este enunciado es falso.» ¿Qué ocurre al asignarle valor de verdad?',
    options: [
      'Es verdadero',
      'Es falso',
      'Paradoja: no es establemente verdadero ni falso',
      'No significa nada en ningún sistema',
    ],
    correct: 2,
    hint: 'Supón que es verdadero e infiere; luego supón que es falso e infiere. Observa la oscilación.',
    explain: 'Paradoja del mentiroso: si es verdadero, entonces es falso; si es falso, entonces es verdadero. No admite valor estable clásico.',
  },
  {
    id: 'a19',
    kind: 'acertijo',
    q: 'Un hombre entra a un bar y pide agua. El camarero saca una pistola. El hombre dice «gracias» y se va tranquilo. ¿Por qué?',
    options: [
      'Era un robo frustrado',
      'El agua estaba envenenada',
      'Tenía hipo; el susto lo curó',
      'Era una apuesta entre ambos',
    ],
    correct: 2,
    hint: 'El agua no era para beber por sed ordinaria: busca una afección que el susto resuelva.',
    explain: 'Tenía hipo. El susto del arma se lo quitó; por eso agradece y se marcha sin beber.',
  },
  {
    id: 'a20',
    kind: 'logica',
    q: 'Premisas: «Todos los cuervos son negros» y «Este pájaro es negro». ¿Se sigue que es un cuervo?',
    options: [
      'Sí, siempre',
      'No',
      'No necesariamente (falacia de afirmar el consecuente)',
      'Solo si es grande',
    ],
    correct: 2,
    hint: 'De «A → B» y «B» no se concluye «A». Hay muchos objetos negros que no son cuervos.',
    explain: 'Afirmar el consecuente: de “cuervo → negro” y “negro” no se sigue “cuervo”.',
  },
  {
    id: 'a21',
    kind: 'logica',
    q: 'A dice: «B miente». B dice: «C miente». C dice: «A y B mienten». Exactamente uno dice la verdad. ¿Quién dice la verdad?',
    options: ['A', 'B', 'C', 'Ninguno puede'],
    correct: 1,
    hint: 'Prueba casos: si C dijera verdad, A y B mentirían, pero entonces las afirmaciones de A y B sobre “quién miente” chocan con la unicidad.',
    explain: 'Si B dice verdad, entonces C miente. Si C miente, no es cierto que ambos A y B mientan ⇒ A no miente… en realidad el caso consistente clásico es B veraz, A y C mienten (verificar: A miente ⇒ B no miente, coherente con B veraz; C miente porque no es cierto que A y B mientan).',
  },
  {
    id: 'a22',
    kind: 'paradoja',
    q: 'El barbero de la aldea afeita a todos los hombres que no se afeitan a sí mismos, y solo a ellos. ¿Quién afeita al barbero?',
    options: [
      'Él mismo',
      'Otro barbero',
      'Nadie',
      'Paradoja (definición inconsistente, tipo Russell)',
    ],
    correct: 3,
    hint: 'Si se afeita a sí mismo, viola la regla; si no, debería afeitarse a sí mismo según la regla.',
    explain: 'Paradoja del barbero (Russell): la definición no puede aplicarse coherentemente al propio barbero.',
  },
  {
    id: 'a23',
    kind: 'acertijo',
    q: 'Cuanto más le quitas, más grande es. ¿Qué es?',
    options: ['Una deuda', 'Un agujero', 'El silencio', 'La sombra'],
    correct: 1,
    hint: 'Objeto “negativo”: al remover material, crece el vacío.',
    explain: 'Un agujero: cuanto más material quitas, más grande se hace.',
  },
  {
    id: 'a24',
    kind: 'matematica',
    q: '5 máquinas fabrican 5 piezas en 5 minutos. ¿Cuánto tardan 100 máquinas en fabricar 100 piezas (mismo ritmo)?',
    options: ['100 minutos', '20 minutos', '5 minutos', '1 minuto'],
    correct: 2,
    hint: 'Calcula la tasa por máquina y observa que piezas y máquinas escalan igual.',
    explain: 'Cada máquina hace 1 pieza en 5 minutos. 100 máquinas → 100 piezas en 5 minutos.',
  },
  {
    id: 'a25',
    kind: 'matematica',
    q: 'Hay 9 bolas de igual aspecto; una es más pesada. Con una balanza de dos platos, ¿cuántas pesadas necesitas en el peor caso para encontrar la pesada?',
    options: ['3', '2', '4', '1'],
    correct: 1,
    hint: 'Cada pesada tiene 3 resultados (izq / der / empate): divide el espacio de búsqueda en tercios.',
    explain: 'Con 3-partición: 9 → 3 → 1. Bastan 2 pesadas en el peor caso.',
  },
  {
    id: 'a26',
    kind: 'matematica',
    q: 'Torneo de eliminación directa con 100 jugadores. ¿Cuántos partidos se necesitan para tener un campeón?',
    options: ['100', '50', '99', '198'],
    correct: 2,
    hint: 'Cada partido elimina exactamente a un jugador. ¿Cuántos deben ser eliminados?',
    explain: 'Hay que eliminar a 99 jugadores; cada partido elimina uno ⇒ 99 partidos.',
  },
  {
    id: 'a27',
    kind: 'linguistica',
    q: '¿Qué palabra se escribe incorrectamente en todos los diccionarios?',
    options: ['Diccionario', 'Ortografía', 'Incorrectamente', 'Error'],
    correct: 2,
    hint: 'Lee la pregunta al pie de la letra: no pregunta por una palabra mal definida, sino por la que “se escribe incorrectamente”.',
    explain: 'La palabra «incorrectamente» se escribe así —incorrectamente— en todos los diccionarios (juego metalingüístico).',
  },
  {
    id: 'a28',
    kind: 'logica',
    q: 'Dos puertas (una a la libertad), dos guardianes (uno siempre miente, otro siempre dice verdad). Puedes hacer una sola pregunta a uno de ellos. ¿Qué pregunta te garantiza la libertad?',
    options: [
      '«¿Cuál es la puerta buena?»',
      '«¿Mientes?»',
      '«Si le preguntara al otro cuál es la puerta de la libertad, ¿qué diría?» — y eliges la contraria',
      'No existe pregunta útil con una sola consulta',
    ],
    correct: 2,
    hint: 'Necesitas una pregunta que componga mentira y verdad (doble negación efectiva) para anular la incertidumbre del tipo de guardián.',
    explain: 'Preguntar qué diría el otro apunta siempre a la puerta incorrecta; eliges la opuesta.',
  },
  {
    id: 'a29',
    kind: 'logica',
    q: 'De las premisas «Si P, entonces Q» y «no Q», se concluye válidamente:',
    options: ['P', 'Q', 'no P (modus tollens)', 'Nada: es inducción'],
    correct: 2,
    hint: 'Es la regla clásica que niega el consecuente para negar el antecedente.',
    explain: 'Modus tollens: P → Q; ¬Q ⊢ ¬P.',
  },
  {
    id: 'a30',
    kind: 'logica',
    q: 'De «Todos los A son B» y «Algunos B son C», se sigue necesariamente:',
    options: [
      'Todos los A son C',
      'Algunos A son C',
      'Ningún A es C',
      'Nada necesario sobre la relación entre A y C',
    ],
    correct: 3,
    hint: 'Los B que son C podrían no solaparse con los A. Dibuja conjuntos.',
    explain: 'No hay conclusión silogística válida obligatoria entre A y C; el solapamiento puede fallar.',
  },
  {
    id: 'a31',
    kind: 'probabilidad',
    q: 'Dado justo de seis caras, dos tiradas independientes. ¿Cuál es P(suma = 7)?',
    options: ['1/12', '1/6', '1/2', '1/36'],
    correct: 1,
    hint: 'Cuenta pares favorables: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) sobre 36 resultados equiprobables.',
    explain: '6 resultados favorables de 36 ⇒ 6/36 = 1/6.',
  },
  {
    id: 'a32',
    kind: 'logica',
    q: '«Si estudian, aprueban. Ana aprobó. Por tanto, Ana estudió.» Este razonamiento es:',
    options: [
      'Válido (modus ponens)',
      'Válido (modus tollens)',
      'Falacia de afirmar el consecuente',
      'Inducción correcta',
    ],
    correct: 2,
    hint: 'De P → Q y Q no se sigue P. Ana pudo aprobar por otras vías.',
    explain: 'Afirmar el consecuente: forma inválida. Pudo aprobar sin estudiar (en el modelo lógico del argumento).',
  },
  {
    id: 'a33',
    kind: 'matematica',
    q: '12 monedas; una es falsa y puede ser más pesada o más ligera. ¿Cuál es el mínimo de pesadas en el peor caso (balanza de dos platos) para identificar la falsa y el defecto?',
    options: ['2', '3', '4', '6'],
    correct: 1,
    hint: 'Cada pesada da 3 resultados; necesitas distinguir 12×2 = 24 escenarios. 3³ = 27 ≥ 24.',
    explain: 'Información ternaria: 3 pesadas bastan (y son necesarias en el peor caso para 24 posibilidades).',
  },
  {
    id: 'a34',
    kind: 'matematica',
    q: 'Un número entero es divisible por 3 si y solo si:',
    options: [
      'Termina en 3',
      'Es par',
      'La suma de sus dígitos es divisible por 3',
      'La resta de dígitos extremos vale 3',
    ],
    correct: 2,
    hint: 'Usa la regla de divisibilidad en base 10: 10 ≡ 1 (mód 3).',
    explain: 'Como 10 ≡ 1 (mod 3), el número es ≡ a la suma de dígitos (mod 3).',
  },
  {
    id: 'a35',
    kind: 'matematica',
    q: 'En el grafo completo K₆ (6 vértices, todos adyacentes entre sí), ¿cuántas aristas hay?',
    options: ['12', '15', '30', '6'],
    correct: 1,
    hint: 'Número de aristas en Kₙ = n(n−1)/2.',
    explain: '6×5/2 = 15 aristas.',
  },
  {
    id: 'a36',
    kind: 'logica',
    q: 'Si P → Q y Q → R, se concluye válidamente:',
    options: ['R → P', 'P → R', 'no P', 'Nada sin premisas extra'],
    correct: 1,
    hint: 'Transitividad del condicional (silogismo hipotético).',
    explain: 'P → Q y Q → R implican P → R.',
  },
  {
    id: 'a37',
    kind: 'logica',
    q: '¬(P ∧ Q) es lógicamente equivalente a:',
    options: ['¬P ∧ ¬Q', 'P ∨ Q', '¬P ∨ ¬Q', 'P → Q'],
    correct: 2,
    hint: 'Ley de De Morgan: negar una conjunción reparte la negación con disyunción.',
    explain: 'De Morgan: ¬(P ∧ Q) ≡ ¬P ∨ ¬Q.',
  },
  {
    id: 'a38',
    kind: 'matematica',
    q: 'Un grafo conexo admite camino euleriano (recorre cada arista una vez) si y solo si:',
    options: [
      'Todos los vértices tienen grado impar',
      'Es un grafo completo',
      'Tiene exactamente 0 o 2 vértices de grado impar',
      'Todos los vértices tienen el mismo grado',
    ],
    correct: 2,
    hint: 'En un camino no cerrado pueden existir extremos de grado impar; el resto debe ser par.',
    explain: 'Teorema de Euler para caminos: 0 impares (circuito) o exactamente 2 (camino abierto).',
  },
  {
    id: 'a39',
    kind: 'probabilidad',
    q: 'Probabilidad aproximada de obtener al menos un 6 en 4 tiradas de un dado justo:',
    options: ['4/6', '1/6', '1 − (5/6)⁴ ≈ 0,52', '1'],
    correct: 2,
    hint: 'Complementario: 1 − P(ningún 6) = 1 − (5/6)⁴.',
    explain: 'P(al menos un 6) = 1 − (5/6)⁴ ≈ 0,5177.',
  },
  {
    id: 'a40',
    kind: 'linguistica',
    q: 'Cifrado César con desplazamiento +3. El texto «KROD» descifrando (restando 3) es:',
    options: ['MUNDO', 'HOLA', 'CASA', 'SOL'],
    correct: 1,
    hint: 'Cada letra retrocede 3 puestos en el alfabeto: K→H, R→O, O→L, D→A.',
    explain: 'KROD − 3 = HOLA.',
  },
  {
    id: 'a41',
    kind: 'logica',
    q: 'Respecto a ∀x ∃y P(x,y) y ∃y ∀x P(x,y):',
    options: [
      'Siempre son equivalentes',
      'Son idénticos en modelos finitos solamente',
      'El orden de los cuantificadores cambia el significado',
      'Solo equivalen si P es simétrico',
    ],
    correct: 2,
    hint: 'En uno, la y puede depender de x; en el otro, una misma y sirve para todo x.',
    explain: '∃y ∀x es más fuerte: una sola y trabaja para todos los x. El orden importa.',
  },
  {
    id: 'a42',
    kind: 'matematica',
    q: 'El número perfecto positivo más pequeño (igual a la suma de sus divisores propios) es:',
    options: ['8', '10', '6', '12'],
    correct: 2,
    hint: 'Prueba divisores propios de 6: 1 + 2 + 3.',
    explain: '6 = 1+2+3. Es el menor número perfecto.',
  },
  {
    id: 'a43',
    kind: 'matematica',
    q: '100 puertas cerradas; 100 pasadas: en la pasada k se conmutan las puertas múltiplo de k. Al final, ¿cuáles quedan abiertas?',
    options: ['Las de número primo', 'Las pares', 'Las de número cuadrado perfecto', 'Todas'],
    correct: 2,
    hint: 'Cada puerta n se conmuta tantas veces como divisores tiene. ¿Cuándo el número de divisores es impar?',
    explain: 'Solo los cuadrados perfectos tienen número impar de divisores ⇒ terminan abiertas.',
  },
  {
    id: 'a44',
    kind: 'matematica',
    q: 'Una demostración por inducción matemática sobre los naturales requiere, en lo esencial:',
    options: [
      'Solo el caso base',
      'Infinitos chequeos empíricos',
      'Caso base y paso inductivo',
      'Una probabilidad mayor que 1/2',
    ],
    correct: 2,
    hint: 'Estructura clásica: P(0) o P(1), y ∀k (P(k) → P(k+1)).',
    explain: 'Inducción: base + paso inductivo (y buena fundamentación del orden).',
  },
  {
    id: 'a45',
    kind: 'matematica',
    q: '¿Puede dibujarse el grafo completo K₅ en el plano sin cruces de aristas?',
    options: ['Sí, siempre', 'Sí si los vértices son convexos', 'No (K₅ no es planar)', 'Solo con bucles'],
    correct: 2,
    hint: 'Kuratowski / Euler: K₅ es uno de los grafos no planares prohibidos mínimos.',
    explain: 'K₅ no es planar: no puede embeberse en el plano sin cruces.',
  },
  {
    id: 'a46',
    kind: 'probabilidad',
    q: 'Paradoja del cumpleaños: en un grupo de 23 personas, la probabilidad aproximada de que al menos dos compartan cumpleaños (365 días, uniforme, independiente) es:',
    options: ['23%', '5%', '≈ 50%', '90%'],
    correct: 2,
    hint: 'Calcula el complementario P(todos distintos) y resta de 1; crece más rápido de lo intuitivo.',
    explain: 'Con 23 personas, P(al menos un compartido) ≈ 50%.',
  },
  {
    id: 'a47',
    kind: 'paradoja',
    q: 'Los teoremas de incompletitud de Gödel implican, para un sistema formal suficientemente potente y consistente:',
    options: [
      'Que todo enunciado es demostrable',
      'Que la aritmética es inconsistente',
      'Que hay verdades aritméticas no demostrables en el sistema',
      'Que no hacen falta axiomas',
    ],
    correct: 2,
    hint: 'Distingue verdad (en el modelo estándar) de demostrabilidad (dentro del sistema).',
    explain: 'Si el sistema es consistente y bastante expresivo, existe al menos un enunciado verdadero no demostrable en él.',
  },
  {
    id: 'a48',
    kind: 'matematica',
    q: 'Un camino hamiltoniano en un grafo visita:',
    options: [
      'Cada arista exactamente una vez',
      'Solo los vértices de grado 1',
      'Cada vértice exactamente una vez',
      'Únicamente el vértice central',
    ],
    correct: 2,
    hint: 'Hamilton → vértices; Euler → aristas.',
    explain: 'Camino hamiltoniano: pasa por cada vértice exactamente una vez.',
  },
  {
    id: 'a49',
    kind: 'probabilidad',
    q: 'El teorema de Bayes permite actualizar:',
    options: [
      'Solo frecuencias empíricas sin prior',
      'P(H|E) a partir del prior y de la verosimilitud',
      'Únicamente deducciones no probabilísticas',
      'Nada: es solo una identidad algebraica inútil',
    ],
    correct: 1,
    hint: 'Posterior ∝ verosimilitud × prior.',
    explain: 'Bayes: P(H|E) = P(E|H)P(H) / P(E). Actualiza creencias ante evidencia.',
  },
  {
    id: 'a50',
    kind: 'logica',
    q: 'En un argumento, validez y verdad se relacionan así:',
    options: [
      'Son sinónimos',
      'Validez es solo empírica; verdad solo formal',
      'Validez atañe a la forma; la verdad, al contenido de hecho de las proposiciones',
      'Un argumento válido siempre tiene premisas verdaderas',
    ],
    correct: 2,
    hint: 'Puedes tener un argumento válido con premisas falsas, o inválido con conclusiones verdaderas.',
    explain: 'Validez = preservación formal de verdad; verdad = adecuación al hecho. Son dimensiones distintas.',
  },
  // --- Más elaborados (51–70) ---
  {
    id: 'a51',
    kind: 'logica',
    q: 'En una isla, los caballeros siempre dicen la verdad y los villanos siempre mienten. A dice: «B es caballero». B dice: «A y yo somos de tipos distintos». ¿Qué son?',
    options: [
      'Ambos caballeros',
      'Ambos villanos',
      'A villano, B caballero',
      'A caballero, B villano',
    ],
    correct: 3,
    hint: 'Supón el tipo de B y comprueba coherencia con ambas frases.',
    explain: 'Si B fuera caballero, serían de tipos distintos ⇒ A villano ⇒ A mentiría al decir que B es caballero: contradicción. Luego B es villano y A caballero.',
  },
  {
    id: 'a52',
    kind: 'matematica',
    q: 'Tienes 3 interruptores; solo uno enciende una bombilla en otra habitación (los otros no hacen nada). Puedes manipular los interruptores, entrar una sola vez a la habitación y observar. ¿Cómo identificas el interruptor correcto?',
    options: [
      'Imposible con una sola visita',
      'Enciende el 1 un rato, apágalo; deja el 2 encendido; entra: caliente=1, luciendo=2, fría apagada=3',
      'Enciende los tres a la vez',
      'Solo con termómetro digital',
    ],
    correct: 1,
    hint: 'Usa una segunda dimensión observable: el calor residual, no solo luz on/off.',
    explain: 'Protocolo clásico: calor = estuvo encendida (interruptor 1); luz = 2; fría y apagada = 3.',
  },
  {
    id: 'a53',
    kind: 'acertijo',
    q: 'Un hombre vive en el piso 10. Cada día baja en ascensor hasta la planta baja. Al volver, sube solo hasta el 7 y el resto lo hace por la escalera… excepto los días de lluvia. ¿Por qué?',
    options: [
      'El ascensor está averiado del 7 al 10',
      'Es muy bajo y solo alcanza el botón del 7; los días de lluvia usa el paraguas para pulsar el 10',
      'Hace ejercicio salvo con lluvia',
      'Trabaja en el 7',
    ],
    correct: 1,
    hint: 'Piensa en una limitación física del personaje y en un objeto que use solo cuando llueve.',
    explain: 'Es de baja estatura: alcanza el 7. Con el paraguas puede pulsar el 10.',
  },
  {
    id: 'a54',
    kind: 'probabilidad',
    q: 'Problema de Monty Hall: 3 puertas, un coche y 2 cabras. Eliges la 1. El presentador (que sabe qué hay) abre la 3 con cabra. ¿Conviene cambiar a la 2?',
    options: [
      'Da igual: 50-50',
      'Mejor quedarse: P=2/3 en la 1',
      'Mejor cambiar: P=2/3 en la 2',
      'Solo si el presentador elige al azar',
    ],
    correct: 2,
    hint: 'Tu puerta inicial tenía 1/3; las otras dos juntos 2/3. Al revelar una cabra, el 2/3 se concentra en la restante.',
    explain: 'Cambiar gana con probabilidad 2/3. Quedarse se queda en 1/3.',
  },
  {
    id: 'a55',
    kind: 'logica',
    q: 'Cuatro personas cruzan un puente de noche; necesitan la linterna para cruzar. Tiempos: 1, 2, 5 y 10 minutos. Solo dos a la vez; la linterna debe traerse de vuelta. ¿Tiempo mínimo total?',
    options: ['17 minutos', '19 minutos', '15 minutos', '21 minutos'],
    correct: 0,
    hint: 'Hay dos estrategias competidoras para mover a los lentos; compara costes de regreso.',
    explain: 'Óptimo clásico: 1+2 cruzan (2); 1 vuelve (1); 5+10 cruzan (10); 2 vuelve (2); 1+2 cruzan (2) = 17.',
  },
  {
    id: 'a56',
    kind: 'matematica',
    q: 'En una carrera, adelantas al segundo. ¿En qué posición quedas?',
    options: ['Primero', 'Segundo', 'Tercero', 'Último'],
    correct: 1,
    hint: 'Adelantar al segundo te coloca en su puesto, no automáticamente en el primero.',
    explain: 'Si adelantas al segundo, ocupas el segundo lugar.',
  },
  {
    id: 'a57',
    kind: 'acertijo',
    q: '¿Cómo puedes hacer que el número 7 quede par sin operación aritmética sobre su valor?',
    options: [
      'Sumarle 1',
      'Restarle 1',
      'Quitándole la s (en “siete” → “iete” no; mejor: “siete” no…): de hecho, quitando la letra s no; la solución clásica es “VIII − III = VII”… Alternativa: la respuesta esperada suele ser otra. Aquí: “siete” → no. Opción rigurosa: no aplica. Elige la trampa visual: “SIETE” con una línea →',
      'La formulación juguetona habitual es incorrecta aquí; no hay forma sin cambiar el valor — elige la opción que lo declare honestamente si existiera. (En esta versión: ninguna trampa visual válida entre A–C.)',
    ],
    correct: 1,
    hint: 'Si interpretas “par” como propiedad aritmética, restar 1 a 7 da 6, que es par. (Otras versiones usan trucos tipográficos.)',
    explain: '7 − 1 = 6, que es par. (Las versiones de “tachado tipográfico” son ambiguas; aquí se privilegia la lectura aritmética limpia.)',
  },
  {
    id: 'a58',
    kind: 'logica',
    q: 'Hay 3 cajas: “manzanas”, “naranjas” y “manzanas y naranjas”. Todas las etiquetas están mal. Coges una fruta de la caja “manzanas y naranjas” y es manzana. ¿Qué hay en la caja “naranjas”?',
    options: ['Naranjas', 'Manzanas', 'Manzanas y naranjas', 'No se puede saber'],
    correct: 2,
    hint: 'Como todas las etiquetas mienten, la caja “mixta” no es mixta. Si sacaste manzana, esa caja es solo manzanas. Sigue la cadena.',
    explain: '“Mixta” (falsa) + manzana ⇒ es caja de manzanas. Entonces “naranjas” no puede ser naranjas; tampoco manzanas ⇒ es la mixta. “Manzanas” queda como naranjas.',
  },
  {
    id: 'a59',
    kind: 'matematica',
    q: 'Un caracol cae en un pozo de 30 m. De día sube 3 m; de noche resbala 2 m. ¿En cuántos días sale?',
    options: ['30', '28', '15', '10'],
    correct: 1,
    hint: 'El último día no resbala: al alcanzar el borde, sale.',
    explain: 'Tras 27 días netos 27 m; el día 28 sube 3 m y sale (30). No hay resbalón final.',
  },
  {
    id: 'a60',
    kind: 'paradoja',
    q: 'Paradoja de Zenón (Aquiles y la tortuga): Aquiles da ventaja a la tortuga; cada vez que alcanza el punto anterior de la tortuga, ella ha avanzado un poco. ¿Cuál es la resolución moderna estándar?',
    options: [
      'El movimiento es ilusorio',
      'La serie infinita de intervalos tiene suma finita; el tiempo total converge',
      'Aquiles nunca puede alcanzarla',
      'Solo se resuelve en relatividad',
    ],
    correct: 1,
    hint: 'Suma de una serie geométrica infinita puede ser finita.',
    explain: 'Los infinitos tramos forman una serie convergente; el tiempo total es finito y Aquiles alcanza a la tortuga.',
  },
]

function expandBank(): Riddle[] {
  const out: Riddle[] = [...BANK]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const b = BANK[i % BANK.length]
    const variant = out.length
    // Rota el orden de opciones y ajusta el índice correcto para no sesgar hacia A
    const rot = variant % 4
    const rotated = [
      b.options[(0 + rot) % 4],
      b.options[(1 + rot) % 4],
      b.options[(2 + rot) % 4],
      b.options[(3 + rot) % 4],
    ] as [string, string, string, string]
    const newCorrect = ((b.correct - rot + 4) % 4) as 0 | 1 | 2 | 3
    out.push({
      ...b,
      id: `${b.id}-v${variant}`,
      q:
        b.q +
        (variant % 3 === 0
          ? ' Analiza con rigor.'
          : variant % 3 === 1
            ? ' Descarta trampas lingüísticas.'
            : ' Justifica internamente cada opción.'),
      options: rotated,
      correct: newCorrect,
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}

const LEVELS = expandBank()

function pickRiddle(level: number, failed: Set<string>): Riddle {
  const pool = LEVELS.filter((r) => !failed.has(r.id))
  const use = pool.length ? pool : LEVELS
  // Hash estable por nivel; no favorece el índice 0
  return use[(level * 31 + 7) % use.length]
}

const KIND_LABEL: Record<RiddleKind, string> = {
  adivinanza: 'Adivinanza',
  acertijo: 'Acertijo',
  logica: 'Lógica',
  matematica: 'Matemática',
  paradoja: 'Paradoja',
  probabilidad: 'Probabilidad',
  linguistica: 'Lingüística',
}

export function AcertijosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlocked = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel],
  )
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const [level, setLevel] = useState(defaultLevel)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [riddle, setRiddle] = useState<Riddle | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  const [runMs, setRunMs] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const limit = useMemo(() => Math.max(25, TIMER_BASE - Math.floor(level / 8)), [level])
  const maxSelectable = Math.max(1, defaultLevel, ...unlocked.map((u) => u.level))

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number) => {
      clearTimers()
      const r = pickRiddle(lv, failedIds)
      setRiddle(r)
      setSelected(null)
      setIsCorrect(null)
      setHintOpen(false)
      setLevel(lv)
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
              setFailedIds((prev) => new Set(prev).add(r.id))
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
    [failedIds, limit, useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!riddle || isCorrect !== null) return
    soundClick()
    setSelected(idx)
    clearTimers()
    const ok = idx === riddle.correct
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
    else {
      soundFail()
      setFailedIds((prev) => new Set(prev).add(riddle.id))
    }
  }

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
            clearTimers()
            if (phase === 'setup') navigate('/categoria/deduccion')
            else {
              setPhase('setup')
              setShowLevelPicker(false)
            }
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {phase === 'setup' ? '← Volver' : '← Modos'}
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
          {phase === 'play' && useTimer && (
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
          {phase === 'setup' && (
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
          {phase !== 'setup' && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nivel {level}
            </span>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && phase === 'setup' && (
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
        {phase === 'setup' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center', marginBottom: 0 }}>🧩 Acertijos</h2>
                <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
                  Lógica, probabilidad, paradojas y adivinanzas. Fallar cambia el enunciado; solo los
                  aciertos fijan progreso.
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
                    <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>
                      Activo por defecto · se reduce en niveles altos
                    </p>
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
                  onClick={() => startLevel(Math.min(level, maxSelectable))}
                  style={{ minHeight: 48 }}
                >
                  Empezar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && riddle && (
          <motion.div
            key="play"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard>
              <div style={{ padding: '1.25rem' }}>
                <p
                  style={{
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: 8,
                  }}
                >
                  {KIND_LABEL[riddle.kind]}
                </p>
                <p
                  style={{
                    fontSize: '1.05rem',
                    lineHeight: 1.5,
                    marginBottom: '1rem',
                    fontWeight: 500,
                  }}
                >
                  {riddle.q}
                </p>

                {/* Pista analítica */}
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    soundClick()
                    setHintOpen((v) => !v)
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    marginBottom: hintOpen ? 8 : '1rem',
                    minHeight: 44,
                    fontSize: '0.9rem',
                  }}
                >
                  <span>💡 Pista analítica</span>
                  <span style={{ opacity: 0.7 }}>{hintOpen ? '▾' : '▸'}</span>
                </button>
                <AnimatePresence initial={false}>
                  {hintOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginBottom: '1rem' }}
                    >
                      <div
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          background: 'var(--gco-primary-dim)',
                          border: '1px solid color-mix(in srgb, var(--gco-primary) 35%, transparent)',
                          fontSize: '0.88rem',
                          lineHeight: 1.45,
                          color: 'var(--gco-ink)',
                        }}
                      >
                        {riddle.hint}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {riddle.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      className="glass-button secondary"
                      style={{
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        minHeight: 48,
                        padding: '0.75rem 1rem',
                        borderColor: selected === i ? 'var(--gco-primary)' : undefined,
                      }}
                      onClick={() => submit(i)}
                    >
                      <span
                        style={{
                          opacity: 0.55,
                          marginRight: 10,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
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

        {phase === 'result' && riddle && (
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
                  {isCorrect ? '¡Correcto!' : 'Incorrecto'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', marginBottom: 6 }}>
                  {formatDuration(runMs)}
                </p>
                <p style={{ fontSize: '0.9rem', marginBottom: 8, lineHeight: 1.45 }}>
                  Respuesta:{' '}
                  <strong style={{ color: 'var(--gco-primary)' }}>
                    {String.fromCharCode(65 + riddle.correct)}. {riddle.options[riddle.correct]}
                  </strong>
                </p>
                <p
                  style={{
                    fontSize: '0.86rem',
                    lineHeight: 1.45,
                    color: 'var(--gco-ink-muted)',
                    marginBottom: 14,
                    textAlign: 'left',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 12,
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                  }}
                >
                  <strong style={{ color: 'var(--gco-ink)' }}>Explicación · </strong>
                  {riddle.explain}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <GlassButton
                    onClick={() =>
                      startLevel(isCorrect ? Math.min(level + 1, TOTAL_LEVELS) : level)
                    }
                  >
                    {isCorrect ? 'Siguiente nivel' : 'Otro acertijo'}
                  </GlassButton>
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setPhase('setup')
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

export default AcertijosGame