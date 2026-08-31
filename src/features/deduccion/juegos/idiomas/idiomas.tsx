/**
 * =============================================================================
 * idiomas.tsx — Deducción lingüística · GymCogOrigins
 * =============================================================================
 *
 * Ruta sugerida:
 *   src/features/deduccion/juegos/idiomas/idiomas.tsx
 *
 * Mecánica:
 * - Switch de idiomas: español, inglés, japonés, chino, francés.
 * - Panel desplegable educativo: origen, evolución, reglas, historia, APA.
 * - Juegos de deducción gramatical y traducción (opción múltiple ×8).
 * - Explicación tras cada partida (gane o pierda).
 * - Solo se sube de nivel si aciertas.
 * - 200+ niveles con vocabulario real y reglas reales.
 * - Compatible con tema dark/light/rainbow (theme.css).
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type LangId = 'es' | 'en' | 'ja' | 'zh' | 'fr'

export type GameMode =
  | 'translate_to_es'      // palabra en L2 → elegir español
  | 'translate_from_es'    // palabra en español → elegir L2
  | 'grammar_deduce'       // regla gramatical → aplicar a caso
  | 'cognate_logic'        // cognados / raíces → deducir significado
  | 'particle_or_order'    // orden / partículas / artículos

export interface LangProfile {
  id: LangId
  name: string
  nativeName: string
  flag: string
  family: string
  speakers: string
  /** Texto educativo largo con citas APA embebidas. */
  essay: string
  rules: string[]
  history: string[]
  practical: string[]
  citations: { apa: string; note: string }[]
}

export interface Question {
  id: string
  lang: LangId
  mode: GameMode
  level: number
  prompt: string
  /** Pista de regla (deducción). */
  ruleHint: string
  options: string[]
  correctIndex: number
  explanation: string
  difficulty: 1 | 2 | 3 | 4 | 5
}

type Screen = 'hub' | 'learn' | 'play' | 'result' | 'levels'

const LS = {
  unlocked: 'gco.idiomas.unlocked',
  current: 'gco.idiomas.current',
  lang: 'gco.idiomas.lang',
  scores: 'gco.idiomas.scores',
  wins: 'gco.idiomas.wins',
  fails: 'gco.idiomas.fails',
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

// -----------------------------------------------------------------------------
// Perfiles de idioma (educativos, APA, historia)
// -----------------------------------------------------------------------------

const LANG_PROFILES: Record<LangId, LangProfile> = {
  es: {
    id: 'es',
    name: 'Español',
    nativeName: 'Español',
    flag: '🇪🇸',
    family: 'Romance (indoeuropea)',
    speakers: '~500 millones de hablantes nativos',
    essay: `El español desciende del latín vulgar hablado en la península ibérica tras la conquista romana (siglo III a. C. en adelante). Su consolidación como lengua culta se asocia al castellano medieval y a la labor de Alfonso X el Sabio en el siglo XIII, que impulsó la prosa en romance (Penny, 2002).

La expansión ultramarina a partir de 1492 extendió el español por América, Filipinas y partes de África, generando variedades regionales con sustratos indígenas y africanos. La Real Academia Española (fundada en 1713) y las academias asociadas regulan la norma panhispánica sin negar la diversidad (RAE & ASALE, 2010).

Gramaticalmente destaca el sistema verbal rico (tiempos, modos, aspecto), el género gramatical, la concordancia y el uso del subjuntivo. La ortografía se estabilizó con reformas sucesivas; la tilde y la ñ son rasgos característicos.

Para deducir traducciones: busca cognados latinos (nación/nation), presta atención al género y al número, y no asumas correspondencia 1:1 con el inglés (false friends como “actual” ≠ “actual”).`,
    rules: [
      'Sustantivos tienen género (el/la) y número (singular/plural).',
      'El adjetivo suele concordar en género y número con el sustantivo.',
      'El subjuntivo expresa duda, deseo, hipótesis o valoración.',
      'Ser vs estar: esencia/identidad vs estado/localización.',
      'Por vs para: causa/medio vs propósito/destino.',
    ],
    history: [
      'Latín vulgar → romance castellano (Edad Media).',
      'Alfonsí: estandarización temprana de la prosa (s. XIII).',
      'Gramática de Nebrija (1492): primera gramática de una lengua vulgar europea.',
      'Siglo de Oro: consolidación literaria (Cervantes, Quevedo).',
      'Norma panhispánica contemporánea (RAE/ASALE).',
    ],
    practical: [
      'Útil en negocios, turismo y diplomacia en América y España.',
      'Cognados con otras lenguas romances facilitan el aprendizaje cruzado.',
      'Atención a false friends con el inglés (embarrassed ≠ embarazada).',
    ],
    citations: [
      {
        apa: 'Penny, R. (2002). A history of the Spanish language (2nd ed.). Cambridge University Press.',
        note: 'Historia fonológica y gramatical del español.',
      },
      {
        apa: 'Real Academia Española & Asociación de Academias de la Lengua Española. (2010). Nueva gramática de la lengua española. Espasa.',
        note: 'Descripción normativa y descriptiva panhispánica.',
      },
      {
        apa: 'Pharies, D. A. (2007). A brief history of the Spanish language. University of Chicago Press.',
        note: 'Síntesis accesible de evolución y variedades.',
      },
    ],
  },
  en: {
    id: 'en',
    name: 'Inglés',
    nativeName: 'English',
    flag: '🇬🇧',
    family: 'Germánica (indoeuropea)',
    speakers: '~400 millones nativos; >1.500 millones total',
    essay: `El inglés proviene del germánico occidental llevado a Britania por anglos, sajones y jutos (s. V). El inglés antiguo (Old English) recibió fuerte influjo nórdico y, tras 1066, un masivo préstamo francés-normando que transformó el léxico (Baugh & Cable, 2013).

El inglés medio y moderno temprano estabilizaron la gramática hacia un perfil más analítico: pérdida de flexiones nominales, orden SVO fijo y uso intensivo de auxiliares. La Gran Mutación Vocálica (Great Vowel Shift) alteró el sistema vocálico y explica muchas irregularidades ortográficas actuales.

Hoy el inglés funciona como lengua franca global. Sus variedades (británica, americana, australiana, indias, etc.) comparten núcleo gramatical con diferencias de léxico y pronunciación (Crystal, 2003).

Para deducir: muchos términos científicos y abstractos son latinos/greco-latinos; el orden de adjetivos sigue patrones (opinion-size-age-color-origin-material-purpose); los phrasal verbs cambian el significado del verbo base.`,
    rules: [
      'Orden básico SVO; adjetivos antes del sustantivo.',
      'Artículos: a/an (indefinido), the (definido), ∅ con genéricos en plural.',
      'Tiempos con auxiliares (do, be, have, will).',
      'Phrasal verbs: verb + particle (look up, give in).',
      'Plural regular -s/-es; muchos irregulares (child/children).',
    ],
    history: [
      'Old English (c. 450–1100): base germánica.',
      'Conquista normanda (1066): préstamo francés masivo.',
      'Early Modern English: Shakespeare, King James Bible.',
      'Expansión colonial y estatus de lingua franca.',
      'Estándares plurales (BrE, AmE) en el siglo XX–XXI.',
    ],
    practical: [
      'Lengua de ciencia, tecnología, aviación y diplomacia.',
      'Cognados latinos ayudan a deducir vocabulario académico.',
      'Cuidado con false friends hacia el español (library ≠ librería).',
    ],
    citations: [
      {
        apa: 'Baugh, A. C., & Cable, T. (2013). A history of the English language (6th ed.). Routledge.',
        note: 'Historia clásica del inglés.',
      },
      {
        apa: 'Crystal, D. (2003). English as a global language (2nd ed.). Cambridge University Press.',
        note: 'Rol global y variedades del inglés.',
      },
      {
        apa: 'Algeo, J. (2010). The origins and development of the English language (6th ed.). Wadsworth.',
        note: 'Orígenes y desarrollo estructural.',
      },
    ],
  },
  ja: {
    id: 'ja',
    name: 'Japonés',
    nativeName: '日本語',
    flag: '🇯🇵',
    family: 'Japónica (aislada o con posible relación a Ryukyuan)',
    speakers: '~125 millones',
    essay: `El japonés es una lengua japónica. Su escritura combina kanji (caracteres chinos adaptados), hiragana y katakana. Históricamente adoptó el sistema de escritura chino y generó lecturas on (sinojaponesas) y kun (nativas) para los mismos kanji (Shibatani, 1990).

Gramaticalmente es aglutinante y de orden SOV. Las partículas (は wa, が ga, を o, に ni, で de, の no) marcan función sintáctica. No hay género gramatical ni artículos; la cortesía (keigo) es un sistema elaborado de formas honoríficas.

Fonológicamente destaca el sistema moraico y el acento de tono (pitch accent). La morfología verbal distingue aspectos y modos mediante sufijos.

Para deducir: identifica la partícula para saber el rol de un sintagma; muchos préstamos ingleses aparecen en katakana; los números tienen contadores específicos según la clase del objeto.`,
    rules: [
      'Orden típico SOV; verbo al final.',
      'Partículas marcan tema (は), sujeto (が), objeto (を), etc.',
      'Sin artículos ni género gramatical.',
      'Keigo: formas de respeto, humildad y cortesía.',
      'Escritura mixta: kanji + hiragana + katakana.',
    ],
    history: [
      'Periodo Yamato y adopción de kanji (s. V–VIII).',
      'Desarrollo de kana (hiragana/katakana) a partir de man’yōgana.',
      'Japonés clásico literario (Heian).',
      'Modernización Meiji y estandarización.',
      'Préstamos masivos del inglés en el siglo XX–XXI.',
    ],
    practical: [
      'Útil en tecnología, cultura pop, negocios con Japón.',
      'Aprender partículas es clave para deducir roles sintácticos.',
      'Katakana suele señalar préstamos extranjeros.',
    ],
    citations: [
      {
        apa: 'Shibatani, M. (1990). The languages of Japan. Cambridge University Press.',
        note: 'Descripción estructural del japonés y lenguas de Japón.',
      },
      {
        apa: 'Tsujimura, N. (2013). An introduction to Japanese linguistics (3rd ed.). Wiley-Blackwell.',
        note: 'Introducción a fonología, morfología y sintaxis.',
      },
      {
        apa: 'Frellesvig, B. (2010). A history of the Japanese language. Cambridge University Press.',
        note: 'Historia diacrónica del japonés.',
      },
    ],
  },
  zh: {
    id: 'zh',
    name: 'Chino (mandarín)',
    nativeName: '中文 / 汉语',
    flag: '🇨🇳',
    family: 'Sino-tibetana',
    speakers: '~900+ millones (mandarín)',
    essay: `El chino mandarín (Putonghua / Guoyu) es la variedad estándar basada históricamente en el habla de Beijing. La familia sino-tibetana incluye muchas variedades “chinas” no siempre mutuamente inteligibles (Norman, 1988).

Es una lengua aislante/analítica: poco morfología flexiva, orden SVO, y significado gramatical vía partículas y orden. El sistema tonal (cuatro tonos + tono neutro en mandarín) distingue lexemas. La escritura hanzi es logográfica/morfosílaba; la reforma simplificada (RPC) convive con caracteres tradicionales (Taiwán, Hong Kong).

El pinyin romaniza la pronunciación con marcas tonales. Históricamente el chino clásico escrito (wenyan) difiere del vernáculo moderno (baihua), promovido en el siglo XX.

Para deducir: el tono cambia el significado; muchos compuestos son transparentes (电+脑 = “eléctrico + cerebro” → ordenador); el medida-palabra (classifier) es obligatorio con numerales (三本书).`,
    rules: [
      'Orden SVO; sin flexión de persona/tiempo en el verbo.',
      'Cuatro tonos (+ neutro) distinguen palabras.',
      'Clasificadores obligatorios con números (本, 个, 只…).',
      'Partículas aspectuales (了 le, 过 guo, 着 zhe).',
      'Escritura: caracteres; pinyin para pronunciación.',
    ],
    history: [
      'Chino antiguo → medio → moderno.',
      'Clásico literario vs vernáculo.',
      'Movimiento del Cuatro de Mayo: promoción del baihua.',
      'Simplificación de caracteres (RPC, s. XX).',
      'Pinyin como estándar de romanización (1958).',
    ],
    practical: [
      'Lengua clave en comercio y geopolítica.',
      'Compuestos y radicales ayudan a deducir significados.',
      'Aprender clasificadores evita errores con numerales.',
    ],
    citations: [
      {
        apa: 'Norman, J. (1988). Chinese. Cambridge University Press.',
        note: 'Panorama histórico y estructural del chino.',
      },
      {
        apa: 'Li, C. N., & Thompson, S. A. (1981). Mandarin Chinese: A functional reference grammar. University of California Press.',
        note: 'Gramática funcional de referencia del mandarín.',
      },
      {
        apa: 'Sun, C. (2006). Chinese: A linguistic introduction. Cambridge University Press.',
        note: 'Introducción lingüística al chino.',
      },
    ],
  },
  fr: {
    id: 'fr',
    name: 'Francés',
    nativeName: 'Français',
    flag: '🇫🇷',
    family: 'Romance (indoeuropea)',
    speakers: '~80 millones nativos; ~300 millones total',
    essay: `El francés desciende del latín hablado en la Galia. El franciano de la Île-de-France se impuso como estándar; la Ordonnance de Villers-Cotterêts (1539) impulsó el uso administrativo del francés (Lodge, 1993).

Fonológicamente evoló hacia la pérdida de muchas consonantes finales pronunciadas y un sistema vocálico nasal. La ortografía conserva huellas etimológicas (beaucoup, eau). Gramaticalmente mantiene género, concordancia y un sistema verbal complejo; el passé composé es el pasado narrativo habitual frente al passé simple literario.

La francofonía abarca Europa, África, Canadá y el Caribe. La Académie française (1635) simboliza la regulación normativa, aunque el uso real es plural.

Para deducir: cognados latinos con el español son frecuentes pero con cambios fonéticos (hôpital/hospital); atención a género (un problème) y a false friends (librairie = librería, no library).`,
    rules: [
      'Género masculino/femenino; artículos le/la/les, un/une.',
      'Concordancia del participio en ciertos contextos.',
      'Negación en dos partes: ne … pas (formal); pas en oral.',
      'Orden SVO; adjetivos a menudo después del sustantivo.',
      'Liaison y elisión en la cadena hablada.',
    ],
    history: [
      'Latín de la Galia → ancien français.',
      'Franciano como base del estándar.',
      'Villers-Cotterêts (1539): francés en administración.',
      'Clasicismo y Académie française (s. XVII).',
      'Francofonía moderna y variedades africanas/canadienses.',
    ],
    practical: [
      'Diplomacia, cultura, África francófona, Canadá.',
      'Cognados con español facilitan lectura, no siempre la pronunciación.',
      'Cuidado con género y false friends.',
    ],
    citations: [
      {
        apa: 'Lodge, R. A. (1993). French: From dialect to standard. Routledge.',
        note: 'De dialectos al estándar francés.',
      },
      {
        apa: 'Rickard, P. (1989). A history of the French language (2nd ed.). Routledge.',
        note: 'Historia de la lengua francesa.',
      },
      {
        apa: 'Battye, A., Hintze, M.-A., & Rowlett, P. (2000). The French language today (2nd ed.). Routledge.',
        note: 'Francés contemporáneo y variación.',
      },
    ],
  },
}

const LANG_ORDER: LangId[] = ['es', 'en', 'ja', 'zh', 'fr']

// -----------------------------------------------------------------------------
// Banco de ítems léxicos y reglas por idioma (base para generar 200+ niveles)
// -----------------------------------------------------------------------------

interface LexItem {
  es: string
  target: string
  note: string
  rule?: string
}

/** Inglés */
const EN_LEX: LexItem[] = [
  { es: 'casa', target: 'house', note: 'Sustantivo concreto; no "home" (hogar/sentimiento).' },
  { es: 'libro', target: 'book', note: 'Cognado parcial; "library" es biblioteca, no librería.' },
  { es: 'agua', target: 'water', note: 'Germánico; no cognado latino directo en uso común.' },
  { es: 'amigo', target: 'friend', note: 'False friend: "amigo" en inglés informal ≠ solo friend formal.' },
  { es: 'ciudad', target: 'city', note: 'Latín civitas → city; "town" es más pequeño.' },
  { es: 'tiempo', target: 'time', note: 'También "weather" según contexto (tiempo atmosférico).' },
  { es: 'mano', target: 'hand', note: 'Germánico; "manual" es cognado latino en adjetivo.' },
  { es: 'escuela', target: 'school', note: 'Griego via latín; cognado con school.' },
  { es: 'comida', target: 'food', note: 'No "meal" (comida como ocasión).' },
  { es: 'trabajo', target: 'work', note: 'También "job" (empleo concreto).' },
  { es: 'niño', target: 'child', note: 'Plural irregular: children.' },
  { es: 'mujer', target: 'woman', note: 'Plural irregular: women (pron. /ˈwɪmɪn/).' },
  { es: 'hombre', target: 'man', note: 'Plural: men. "Human" es más genérico.' },
  { es: 'día', target: 'day', note: 'Germánico; "diary" es diario personal.' },
  { es: 'noche', target: 'night', note: 'Cognado germánico con night.' },
  { es: 'año', target: 'year', note: 'No confundir con "ano" (error ortográfico grave).' },
  { es: 'mes', target: 'month', note: 'Cognado con month; "mess" es desorden.' },
  { es: 'semana', target: 'week', note: 'Germánico week.' },
  { es: 'hoy', target: 'today', note: 'Compuesto to + day.' },
  { es: 'mañana', target: 'tomorrow', note: 'También "morning" si es la parte del día.' },
  { es: 'ayer', target: 'yesterday', note: 'Compuesto con day.' },
  { es: 'grande', target: 'big', note: 'También "large"; "grand" es grandioso.' },
  { es: 'pequeño', target: 'small', note: 'También "little".' },
  { es: 'bueno', target: 'good', note: 'Adverbio irregular: well.' },
  { es: 'malo', target: 'bad', note: 'Adverbio: badly.' },
  { es: 'rápido', target: 'fast', note: 'También "quick"; "rapid" más formal/técnico.' },
  { es: 'lento', target: 'slow', note: 'Adverbio: slowly.' },
  { es: 'caliente', target: 'hot', note: 'Comida o temperatura; "warm" es tibio.' },
  { es: 'frío', target: 'cold', note: 'Adjetivo y sustantivo.' },
  { es: 'feliz', target: 'happy', note: 'No "lucky" (afortunado).' },
  { es: 'triste', target: 'sad', note: 'Cognado no transparente.' },
  { es: 'hablar', target: 'speak', note: 'También "talk"; "speak" más lenguas/formal.' },
  { es: 'comer', target: 'eat', note: 'Germánico eat.' },
  { es: 'beber', target: 'drink', note: 'Verbo y sustantivo.' },
  { es: 'dormir', target: 'sleep', note: 'Germánico sleep.' },
  { es: 'correr', target: 'run', note: 'Pasado irregular: ran.' },
  { es: 'caminar', target: 'walk', note: 'No "path" (camino).' },
  { es: 'leer', target: 'read', note: 'Pasado homógrafo read /red/.' },
  { es: 'escribir', target: 'write', note: 'Pasado: wrote; participio written.' },
  { es: 'pensar', target: 'think', note: 'Pasado: thought.' },
  { es: 'saber', target: 'know', note: 'Pasado: knew; "know how" = saber hacer.' },
  { es: 'poder', target: 'can', note: 'Modal; pasado could.' },
  { es: 'querer', target: 'want', note: 'También "love" en contextos afectivos fuertes.' },
  { es: 'deber', target: 'must', note: 'También "should" (consejo) / "ought".' },
  { es: 'hacer', target: 'do', note: 'También "make" (crear/fabricar).' },
  { es: 'ir', target: 'go', note: 'Pasado: went; participio gone.' },
  { es: 'venir', target: 'come', note: 'Pasado: came.' },
  { es: 'ver', target: 'see', note: 'Pasado: saw; "watch" es mirar con atención.' },
  { es: 'oír', target: 'hear', note: 'Pasado: heard; "listen" es escuchar activamente.' },
  { es: 'porque', target: 'because', note: 'Causal; "why" es la pregunta.' },
  { es: 'aunque', target: 'although', note: 'También "though" / "even though".' },
  { es: 'siempre', target: 'always', note: 'Frecuencia 100%.' },
  { es: 'nunca', target: 'never', note: 'Doble negación en inglés estándar se evita.' },
  { es: 'aquí', target: 'here', note: 'Opuesto there.' },
  { es: 'allí', target: 'there', note: 'Existencial: there is/are.' },
]

const FR_LEX: LexItem[] = [
  { es: 'casa', target: 'maison', note: 'Femenino: la maison. Cognado con mansion (inglés).' },
  { es: 'libro', target: 'livre', note: 'El género es masculino: le livre. "Librairie" = librería.' },
  { es: 'agua', target: 'eau', note: 'Femenino irregular: l’eau. Ortografía etimológica.' },
  { es: 'amigo', target: 'ami', note: 'ami/amie según género de la persona.' },
  { es: 'ciudad', target: 'ville', note: 'Femenino. "Cité" tiene matices distintos.' },
  { es: 'tiempo', target: 'temps', note: 'Masculino. También weather: le temps.' },
  { es: 'mano', target: 'main', note: 'Femenino: la main.' },
  { es: 'escuela', target: 'école', note: 'Femenino; acento agudo.' },
  { es: 'comida', target: 'nourriture', note: 'También repas (comida como ocasión).' },
  { es: 'trabajo', target: 'travail', note: 'Plural irregular: travaux.' },
  { es: 'niño', target: 'enfant', note: 'Epiceno; el artículo marca referencia.' },
  { es: 'mujer', target: 'femme', note: 'También "esposa" según contexto.' },
  { es: 'hombre', target: 'homme', note: 'h muda; l’homme.' },
  { es: 'día', target: 'jour', note: 'journée enfatiza la duración.' },
  { es: 'noche', target: 'nuit', note: 'Femenino: la nuit.' },
  { es: 'año', target: 'an', note: 'année enfatiza duración; an para conteo.' },
  { es: 'mes', target: 'mois', note: 'Singular y plural iguales en escritura.' },
  { es: 'semana', target: 'semaine', note: 'Femenino.' },
  { es: 'hoy', target: 'aujourd’hui', note: 'Ortografía con apóstrofo histórico.' },
  { es: 'mañana', target: 'demain', note: 'matin = mañana (parte del día).' },
  { es: 'ayer', target: 'hier', note: 'Adverbio invariable.' },
  { es: 'grande', target: 'grand', note: 'grand/grande; antes de vocal: grand homme.' },
  { es: 'pequeño', target: 'petit', note: 'petit/petite.' },
  { es: 'bueno', target: 'bon', note: 'bon/bonne; adverbio bien.' },
  { es: 'malo', target: 'mauvais', note: 'También mal (adverbio/sustantivo).' },
  { es: 'rápido', target: 'rapide', note: 'Adjetivo invariable en género oral a veces.' },
  { es: 'feliz', target: 'heureux', note: 'heureux/heureuse.' },
  { es: 'hablar', target: 'parler', note: 'Verbo -er regular.' },
  { es: 'comer', target: 'manger', note: 'g → ge antes de a/o (nous mangeons).' },
  { es: 'beber', target: 'boire', note: 'Irregular: je bois, nous buvons.' },
  { es: 'dormir', target: 'dormir', note: 'Irregular: je dors, nous dormons.' },
  { es: 'leer', target: 'lire', note: 'Irregular: je lis, nous lisons.' },
  { es: 'escribir', target: 'écrire', note: 'Irregular: j’écris, nous écrivons.' },
  { es: 'ir', target: 'aller', note: 'Muy irregular; futuro: j’irai.' },
  { es: 'venir', target: 'venir', note: 'Irregular; passé composé con être.' },
  { es: 'ver', target: 'voir', note: 'Irregular: je vois, nous voyons.' },
  { es: 'porque', target: 'parce que', note: 'Causal; puisque = ya que.' },
  { es: 'aunque', target: 'bien que', note: 'Requiere subjuntivo: bien que ce soit…' },
  { es: 'siempre', target: 'toujours', note: 'Frecuencia / todavía según contexto.' },
  { es: 'nunca', target: 'jamais', note: 'Con ne: ne … jamais.' },
  { es: 'aquí', target: 'ici', note: 'là = ahí/allí.' },
  { es: 'gracias', target: 'merci', note: 'Respuesta: de rien / je vous en prie.' },
  { es: 'por favor', target: 's’il vous plaît', note: 's’il te plaît en informal.' },
  { es: 'sí', target: 'oui', note: 'si responde a negación.' },
  { es: 'no', target: 'non', note: 'Negación oracional.' },
  { es: 'problema', target: 'problème', note: 'Masculino pese a -e: un problème.' },
  { es: 'color', target: 'couleur', note: 'Femenino: la couleur.' },
  { es: 'ventana', target: 'fenêtre', note: 'Femenino.' },
  { es: 'puerta', target: 'porte', note: 'Femenino.' },
  { es: 'calle', target: 'rue', note: 'Femenino: la rue.' },
]

const JA_LEX: LexItem[] = [
  { es: 'casa', target: '家 (いえ / うち)', note: 'いえ casa física; うち también hogar/in-group.' },
  { es: 'libro', target: '本 (ほん)', note: 'Kanji 本; contador 冊 (さつ).' },
  { es: 'agua', target: '水 (みず)', note: 'みず agua fría; おゆ agua caliente.' },
  { es: 'amigo', target: '友達 (ともだち)', note: 'ともだち; formal 友人 (ゆうじん).' },
  { es: 'ciudad', target: '街 / 都市 (まち / とし)', note: 'まち barrio/ciudad; とし metrópoli.' },
  { es: 'tiempo', target: '時間 (じかん)', note: '時間 duración; 天気 (てんき) clima.' },
  { es: 'mano', target: '手 (て)', note: 'Kanji 手.' },
  { es: 'escuela', target: '学校 (がっこう)', note: 'がっこう; partícula に para dirección.' },
  { es: 'comida', target: '食べ物 (たべもの)', note: 'También ご飯 (ごはん) comida/arroz.' },
  { es: 'trabajo', target: '仕事 (しごと)', note: 'しごと.' },
  { es: 'niño', target: '子供 (こども)', note: 'こども.' },
  { es: 'mujer', target: '女性 (じょせい) / 女の人', note: '女 (おんな) más directo.' },
  { es: 'hombre', target: '男性 (だんせい) / 男の人', note: '男 (おとこ).' },
  { es: 'día', target: '日 (ひ / にち)', note: '日 como sol/día; contadores varían.' },
  { es: 'noche', target: '夜 (よる)', note: 'よる.' },
  { es: 'año', target: '年 (とし / ねん)', note: 'ねん en contadores de años.' },
  { es: 'mes', target: '月 (つき / がつ)', note: 'がつ en nombres de mes.' },
  { es: 'semana', target: '週 (しゅう)', note: '一週間 (いっしゅうかん).' },
  { es: 'hoy', target: '今日 (きょう)', note: 'Lectura especial きょう.' },
  { es: 'mañana', target: '明日 (あした)', note: 'あした / あす.' },
  { es: 'ayer', target: '昨日 (きのう)', note: 'きのう.' },
  { es: 'grande', target: '大きい (おおきい)', note: 'Adjetivo -i.' },
  { es: 'pequeño', target: '小さい (ちいさい)', note: 'Adjetivo -i.' },
  { es: 'bueno', target: '良い / いい', note: 'いい forma común; よい más formal.' },
  { es: 'malo', target: '悪い (わるい)', note: 'わるい.' },
  { es: 'hablar', target: '話す (はなす)', note: 'はなす; 言う (いう) = decir.' },
  { es: 'comer', target: '食べる (たべる)', note: 'Verbo -ru.' },
  { es: 'beber', target: '飲む (のむ)', note: 'のむ.' },
  { es: 'dormir', target: '寝る (ねる)', note: 'ねる.' },
  { es: 'leer', target: '読む (よむ)', note: 'よむ.' },
  { es: 'escribir', target: '書く (かく)', note: 'かく.' },
  { es: 'ir', target: '行く (いく)', note: 'いく; te-form いって.' },
  { es: 'venir', target: '来る (くる)', note: 'Muy irregular: くる → きます.' },
  { es: 'ver', target: '見る (みる)', note: 'みる.' },
  { es: 'porque', target: 'から / ので', note: 'から más casual; ので más suave.' },
  { es: 'siempre', target: 'いつも', note: 'いつも.' },
  { es: 'nunca', target: '決して〜ない / 全然〜ない', note: 'Requiere negación en el verbo.' },
  { es: 'aquí', target: 'ここ', note: 'Demostrativos: ここ/そこ/あそこ.' },
  { es: 'gracias', target: 'ありがとう', note: 'ありがとうございます formal.' },
  { es: 'por favor', target: 'ください / お願いします', note: '〜をください al pedir objetos.' },
  { es: 'sí', target: 'はい', note: 'うん informal; はい formal.' },
  { es: 'no', target: 'いいえ', note: 'ううん informal.' },
  { es: 'yo', target: '私 (わたし)', note: 'ぼく/おれ según registro y género social.' },
  { es: 'tú', target: 'あなた', note: 'A menudo se omite; きみ/おまえ según registro.' },
  { es: 'nombre', target: '名前 (なまえ)', note: 'なまえ.' },
  { es: 'japones', target: '日本語 (にほんご)', note: 'にほんご idioma; 日本人 persona.' },
  { es: 'estudiar', target: '勉強する (べんきょうする)', note: 'Suru-verb.' },
  { es: 'entender', target: '分かる (わかる)', note: 'わかります.' },
  { es: 'partícula tema', target: 'は (wa)', note: 'Se escribe は pero suena wa.' },
  { es: 'partícula objeto', target: 'を (o)', note: 'Marca objeto directo.' },
]

const ZH_LEX: LexItem[] = [
  { es: 'casa', target: '家 (jiā)', note: 'Tono 1; también familia.' },
  { es: 'libro', target: '书 (shū)', note: 'Tono 1; clasificador 本 (běn).' },
  { es: 'agua', target: '水 (shuǐ)', note: 'Tono 3.' },
  { es: 'amigo', target: '朋友 (péngyou)', note: 'Segundo tono neutro frecuente en you.' },
  { es: 'ciudad', target: '城市 (chéngshì)', note: '城 muro/ciudad históricamente.' },
  { es: 'tiempo', target: '时间 (shíjiān)', note: '时间 clock time; 天气 clima.' },
  { es: 'mano', target: '手 (shǒu)', note: 'Tono 3.' },
  { es: 'escuela', target: '学校 (xuéxiào)', note: '学 estudiar + 校 escuela.' },
  { es: 'comida', target: '食物 (shíwù) / 饭 (fàn)', note: '饭 arroz/comida.' },
  { es: 'trabajo', target: '工作 (gōngzuò)', note: 'Trabajo/empleo.' },
  { es: 'niño', target: '孩子 (háizi)', note: '子 a menudo tono neutro.' },
  { es: 'mujer', target: '女人 (nǚrén) / 女', note: '女 radical frecuente.' },
  { es: 'hombre', target: '男人 (nánrén) / 男', note: '男.' },
  { es: 'día', target: '天 (tiān) / 日 (rì)', note: '天 día/cielo; 日 más literario/fechas.' },
  { es: 'noche', target: '晚上 (wǎnshang)', note: '晚 late/evening.' },
  { es: 'año', target: '年 (nián)', note: 'Clasificador de años.' },
  { es: 'mes', target: '月 (yuè)', note: 'También luna.' },
  { es: 'semana', target: '星期 (xīngqī) / 周 (zhōu)', note: '星期一 = lunes.' },
  { es: 'hoy', target: '今天 (jīntiān)', note: '今 now + 天 day.' },
  { es: 'mañana', target: '明天 (míngtiān)', note: '明 bright + 天.' },
  { es: 'ayer', target: '昨天 (zuótiān)', note: '昨.' },
  { es: 'grande', target: '大 (dà)', note: 'Tono 4.' },
  { es: 'pequeño', target: '小 (xiǎo)', note: 'Tono 3.' },
  { es: 'bueno', target: '好 (hǎo)', note: 'Tono 3; 很好 muy bien.' },
  { es: 'malo', target: '坏 (huài) / 不好', note: '不好 más común en valoración.' },
  { es: 'hablar', target: '说 (shuō)', note: '说 speak/say.' },
  { es: 'comer', target: '吃 (chī)', note: 'Tono 1.' },
  { es: 'beber', target: '喝 (hē)', note: 'Tono 1.' },
  { es: 'dormir', target: '睡觉 (shuìjiào)', note: '睡 + 觉.' },
  { es: 'leer', target: '读 (dú)', note: '读书 leer libros / estudiar.' },
  { es: 'escribir', target: '写 (xiě)', note: 'Tono 3.' },
  { es: 'ir', target: '去 (qù)', note: 'Tono 4.' },
  { es: 'venir', target: '来 (lái)', note: 'Tono 2.' },
  { es: 'ver', target: '看 (kàn)', note: 'También leer/watch según objeto.' },
  { es: 'porque', target: '因为 (yīnwèi)', note: '因为 … 所以 …' },
  { es: 'siempre', target: '总是 (zǒngshì)', note: '总是.' },
  { es: 'nunca', target: '从不 / 从不…', note: '从不 + verbo.' },
  { es: 'aquí', target: '这里 (zhèlǐ)', note: '这 this + 里 place.' },
  { es: 'gracias', target: '谢谢 (xièxie)', note: 'Segundo tono neutro frecuente.' },
  { es: 'por favor', target: '请 (qǐng)', note: '请 + verbo.' },
  { es: 'sí', target: '是 (shì) / 对', note: '是 ser; 对 correcto.' },
  { es: 'no', target: '不 (bù) / 没 (méi)', note: '不 negación general; 没 pasado/posesión.' },
  { es: 'yo', target: '我 (wǒ)', note: 'Tono 3.' },
  { es: 'tú', target: '你 (nǐ)', note: 'Tono 3; 您 nín respetuoso.' },
  { es: 'nombre', target: '名字 (míngzi)', note: '叫 … 名字.' },
  { es: 'chino', target: '中文 (zhōngwén) / 汉语', note: '汉语 enfatiza lengua han.' },
  { es: 'estudiar', target: '学习 (xuéxí)', note: '学 + 习.' },
  { es: 'entender', target: '懂 (dǒng) / 明白', note: '听得懂 = entender al oír.' },
  { es: 'clasificador libros', target: '本 (běn)', note: '一本书 yī běn shū.' },
  { es: 'clasificador general', target: '个 (gè)', note: 'El más frecuente.' },
]

const ES_META_LEX: LexItem[] = [
  { es: 'ser', target: 'ser (esencia)', note: 'Identidad, material, hora, origen.' },
  { es: 'estar', target: 'estar (estado)', note: 'Localización, estado temporal, progresivo.' },
  { es: 'por', target: 'por (causa/medio)', note: 'Causa, duración, medio, intercambio.' },
  { es: 'para', target: 'para (propósito)', note: 'Finalidad, destinatario, plazo.' },
  { es: 'muy', target: 'muy + adjetivo', note: 'No "mucho" antes de adjetivo solo.' },
  { es: 'mucho', target: 'mucho + sustantivo/verbo', note: 'Cantidad o intensidad verbal.' },
]

const LEX_BY_LANG: Record<LangId, LexItem[]> = {
  es: ES_META_LEX,
  en: EN_LEX,
  fr: FR_LEX,
  ja: JA_LEX,
  zh: ZH_LEX,
}

// Distractors pools
const ES_DISTRACTORS = [
  'casa', 'libro', 'agua', 'amigo', 'tiempo', 'mano', 'día', 'noche', 'año', 'mes',
  'grande', 'pequeño', 'bueno', 'malo', 'feliz', 'triste', 'hablar', 'comer', 'ir', 'ver',
  'siempre', 'nunca', 'aquí', 'allí', 'porque', 'aunque', 'hoy', 'ayer', 'mañana', 'gracias',
  'problema', 'color', 'ventana', 'puerta', 'calle', 'escuela', 'trabajo', 'niño', 'mujer', 'hombre',
]

const EN_DISTRACTORS = [
  'house', 'book', 'water', 'friend', 'time', 'hand', 'day', 'night', 'year', 'month',
  'big', 'small', 'good', 'bad', 'happy', 'sad', 'speak', 'eat', 'go', 'see',
  'always', 'never', 'here', 'there', 'because', 'although', 'today', 'yesterday', 'tomorrow',
  'library', 'actually', 'embarrassed', 'assist', 'realize', 'lecture', 'parent', 'carpet',
]

const FR_DISTRACTORS = [
  'maison', 'livre', 'eau', 'ami', 'temps', 'main', 'jour', 'nuit', 'an', 'mois',
  'grand', 'petit', 'bon', 'mauvais', 'heureux', 'parler', 'manger', 'aller', 'voir',
  'toujours', 'jamais', 'ici', 'parce que', 'merci', 'problème', 'couleur', 'fenêtre',
  'librairie', 'blessé', 'actuellement', 'assister', 'lecture',
]

const JA_DISTRACTORS = [
  '家', '本', '水', '友達', '時間', '手', '日', '夜', '年', '月',
  '大きい', '小さい', 'いい', '悪い', '話す', '食べる', '行く', '見る',
  'いつも', 'ここ', 'ありがとう', 'はい', 'いいえ', '私', '日本語', 'は', 'を',
]

const ZH_DISTRACTORS = [
  '家', '书', '水', '朋友', '时间', '手', '天', '年', '月',
  '大', '小', '好', '说', '吃', '去', '看', '谢谢', '我', '你',
  '中文', '学习', '本', '个', '因为', '今天', '明天',
]

const DISTRACTORS: Record<LangId, string[]> = {
  es: ES_DISTRACTORS,
  en: EN_DISTRACTORS,
  fr: FR_DISTRACTORS,
  ja: JA_DISTRACTORS,
  zh: ZH_DISTRACTORS,
}

// Grammar deduction prompts per language
interface GrammarItem {
  prompt: string
  ruleHint: string
  options: string[]
  correctIndex: number
  explanation: string
}

const EN_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'Elige la forma correcta: “She ____ to school every day.”',
    ruleHint: 'Presente simple, 3.ª persona singular: verbo + -s.',
    options: ['go', 'goes', 'going', 'gone', 'went', 'goed', 'goe', 'to go'],
    correctIndex: 1,
    explanation: 'En presente simple, la 3.ª persona singular (he/she/it) añade -s/-es: goes.',
  },
  {
    prompt: '¿Cuál es el plural de “child”?',
    ruleHint: 'Plurales irregulares germánicos.',
    options: ['childs', 'childes', 'children', 'childrens', 'child', 'childer', 'kids', 'childen'],
    correctIndex: 2,
    explanation: 'Child → children es un plural irregular histórico; no se forma con -s.',
  },
  {
    prompt: 'Completa: “I have ____ this book.”',
    ruleHint: 'Present perfect: have + participio pasado.',
    options: ['readed', 'read', 'reading', 'reads', 'rode', 'written', 'red', 'reed'],
    correctIndex: 1,
    explanation: 'El participio de read es read (pronunciado /red/). Have read = presente perfecto.',
  },
  {
    prompt: 'Orden natural de adjetivos: “a ____ box”',
    ruleHint: 'Opinión → tamaño → edad → color → origen → material → propósito.',
    options: [
      'wooden small nice',
      'nice small wooden',
      'small wooden nice',
      'wooden nice small',
      'nice wooden small',
      'small nice wooden',
      'wooden small',
      'nice wooden',
    ],
    correctIndex: 1,
    explanation: 'Se prefiere “nice small wooden box”: opinión, tamaño, material.',
  },
  {
    prompt: 'False friend: en inglés, “actually” significa…',
    ruleHint: 'False friends con el español.',
    options: [
      'actualmente',
      'en realidad / de hecho',
      'actuar',
      'activo',
      'ahora mismo solo',
      'al final',
      'casi',
      'nunca',
    ],
    correctIndex: 1,
    explanation: 'Actually = en realidad. “Actualmente” se dice currently / nowadays.',
  },
  {
    prompt: 'Elige el phrasal verb: “buscar información en un diccionario”',
    ruleHint: 'Verb + particle cambia el significado.',
    options: ['look after', 'look up', 'look for', 'look out', 'look into', 'look down', 'look over', 'look on'],
    correctIndex: 1,
    explanation: 'Look up = consultar (palabra). Look for = buscar; look after = cuidar.',
  },
  {
    prompt: 'Artículo correcto: “____ university is big.” (hablando de una concreta conocida)',
    ruleHint: 'The para referentes definidos; a/an indefinidos.',
    options: ['A', 'An', 'The', '∅ (ninguno)', 'Some', 'Any', 'This only', 'Those'],
    correctIndex: 2,
    explanation: 'Si es definida/conocida en el discurso: the university.',
  },
  {
    prompt: 'Negación correcta en inglés estándar:',
    ruleHint: 'Un solo negativo de polaridad; do-support.',
    options: [
      'I don’t know nothing',
      'I don’t know anything',
      'I no know anything',
      'I not know nothing',
      'I doesn’t know',
      'I no know',
      'I ain’t know nothing',
      'I not knowing',
    ],
    correctIndex: 1,
    explanation: 'Estándar: don’t + anything. La doble negación no es la norma del inglés estándar.',
  },
]

const FR_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'Género: “problème” es…',
    ruleHint: 'No todas las palabras en -e son femeninas.',
    options: ['femenino', 'masculino', 'neutro', 'variable', 'plural', 'epiceno solo', 'invariable', 'dual'],
    correctIndex: 1,
    explanation: 'Un problème es masculino pese a terminar en -e.',
  },
  {
    prompt: 'Artículo: “____ eau est froide.”',
    ruleHint: 'Elisión ante vocal: le/la → l’.',
    options: ['La', 'Le', 'L’', 'Les', 'Un', 'Une', 'De', 'Du'],
    correctIndex: 2,
    explanation: 'Eau empieza por vocal: l’eau (elisión de la).',
  },
  {
    prompt: 'Negación formal completa:',
    ruleHint: 'ne … pas alrededor del verbo conjugado.',
    options: [
      'Je pas mange',
      'Je ne mange pas',
      'Je mange ne pas',
      'Je no mange',
      'Je ne pas mange',
      'Pas je mange',
      'Je mange pas ne',
      'Je non mange',
    ],
    correctIndex: 1,
    explanation: 'Estructura clásica: ne + verbo + pas → Je ne mange pas.',
  },
  {
    prompt: 'Passé composé de “aller” (yo):',
    ruleHint: 'Verbos de movimiento con être; acuerdo del participio.',
    options: [
      'j’ai allé',
      'je suis allé(e)',
      'je suis aller',
      'j’ai été allé',
      'je vais allé',
      'j’allais',
      'je suis allés',
      'j’ai allée',
    ],
    correctIndex: 1,
    explanation: 'Aller forma passé composé con être: je suis allé / allée.',
  },
  {
    prompt: 'False friend: “librairie” significa…',
    ruleHint: 'Cognados engañosos con el inglés/español.',
    options: [
      'biblioteca',
      'librería (tienda)',
      'libro',
      'librero solo',
      'archivo',
      'universidad',
      'papelera',
      'lectura',
    ],
    correctIndex: 1,
    explanation: 'Librairie = tienda de libros. Biblioteca = bibliothèque.',
  },
  {
    prompt: '“Bien que” exige…',
    ruleHint: 'Subjuntivo tras ciertas conjunciones.',
    options: [
      'indicativo siempre',
      'subjuntivo',
      'infinitivo solo',
      'condicional obligatorio',
      'imperativo',
      'participio',
      'futuro simple',
      'nada especial',
    ],
    correctIndex: 1,
    explanation: 'Bien que + subjuntivo: Bien qu’il soit tard…',
  },
]

const JA_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'La partícula de tema se escribe は y se pronuncia…',
    ruleHint: 'Lecturas especiales de partículas.',
    options: ['ha', 'wa', 'ba', 'pa', 'a', 'ho', 'wo', 'ga'],
    correctIndex: 1,
    explanation: 'La partícula tema は se pronuncia “wa”, no “ha”.',
  },
  {
    prompt: 'Orden típico japonés:',
    ruleHint: 'Lengua SOV.',
    options: ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS', 'libre total', 'V primero siempre'],
    correctIndex: 1,
    explanation: 'El japonés es predominantemente SOV: sujeto-objeto-verbo.',
  },
  {
    prompt: 'Partícula de objeto directo habitual:',
    ruleHint: 'Marcas de caso por partículas.',
    options: ['は', 'が', 'を', 'に', 'で', 'の', 'と', 'も'],
    correctIndex: 2,
    explanation: 'を (o) marca el objeto directo: 本を読む.',
  },
  {
    prompt: '¿Qué silabario se usa típicamente para préstamos extranjeros?',
    ruleHint: 'Tres sistemas de escritura.',
    options: ['hiragana', 'katakana', 'kanji solo', 'romaji solo', 'man’yōgana', 'hangul', 'latin', 'cuneiforme'],
    correctIndex: 1,
    explanation: 'Katakana se usa de forma característica para gairaigo (préstamos).',
  },
  {
    prompt: 'Forma cortés de 食べる (taberu):',
    ruleHint: 'Masu-form para cortesía neutra.',
    options: ['たべる', 'たべます', 'たべた', 'たべて', 'たべない', 'たべろ', 'たべよう', 'たべられる'],
    correctIndex: 1,
    explanation: 'Verbos en -masu (たべます) son la cortesía estándar.',
  },
]

const ZH_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'En mandarín, 书 (shū) con numeral requiere clasificador. ¿Cuál es típico?',
    ruleHint: 'Clasificadores obligatorios con números.',
    options: ['个 gè', '本 běn', '只 zhī', '条 tiáo', '张 zhāng', '件 jiàn', '位 wèi', '头 tóu'],
    correctIndex: 1,
    explanation: 'Los libros usan 本: 一本书 yī běn shū.',
  },
  {
    prompt: 'Negación de acciones habituales / futuro: se usa…',
    ruleHint: '不 vs 没.',
    options: ['没 méi', '不 bù', '别 bié solo', '无 wú', '否', '非', '无有', '未'],
    correctIndex: 1,
    explanation: '不 niega presente/habitual/futuro; 没 niega pasado o posesión.',
  },
  {
    prompt: 'Orden básico del mandarín:',
    ruleHint: 'Lengua SVO analítica.',
    options: ['SOV', 'SVO', 'VSO', 'VOS', 'OSV', 'libre', 'OVS', 'V final siempre'],
    correctIndex: 1,
    explanation: 'Mandarín es SVO: 我吃饭 wǒ chī fàn.',
  },
  {
    prompt: '¿Cuántos tonos principales tiene el mandarín estándar (sin el neutro)?',
    ruleHint: 'Sistema tonal.',
    options: ['2', '3', '4', '5', '6', '1', '8', '7'],
    correctIndex: 2,
    explanation: 'Cuatro tonos léxicos principales, más el tono neutro.',
  },
  {
    prompt: '因为 (yīnwèi) introduce la causa. ¿Qué suele introducir la consecuencia?',
    ruleHint: 'Correlación causal.',
    options: ['但是', '所以', '如果', '虽然', '而且', '或者', '还是', '因为 de nuevo'],
    correctIndex: 1,
    explanation: '因为 … 所以 … = porque … por eso …',
  },
]

const ES_GRAMMAR: GrammarItem[] = [
  {
    prompt: '“Estoy cansado” usa estar porque…',
    ruleHint: 'Ser vs estar.',
    options: [
      'es esencia permanente',
      'es estado temporal',
      'es origen',
      'es material',
      'es hora',
      'es posesión',
      'es profesión siempre',
      'es nacionalidad',
    ],
    correctIndex: 1,
    explanation: 'Estados temporales y localización usan estar: estoy cansado.',
  },
  {
    prompt: '“Trabajo para una ONG” — para indica…',
    ruleHint: 'Por vs para.',
    options: [
      'causa',
      'propósito / beneficiario',
      'duración',
      'medio de transporte',
      'intercambio',
      'precio exacto',
      'agente de pasiva',
      'lugar de paso',
    ],
    correctIndex: 1,
    explanation: 'Para introduce finalidad o destinatario/beneficiario.',
  },
  {
    prompt: 'El subjuntivo aparece típicamente tras…',
    ruleHint: 'Modo y modalidad.',
    options: [
      'verbos de certeza absoluta sin matiz',
      'deseo, duda, valoración, hipótesis',
      'solo pasado narrativo',
      'solo imperativo afirmativo',
      'solo futuros',
      'solo condicionales irreales en inglés',
      'nunca tras “ojalá”',
      'solo con “ser”',
    ],
    correctIndex: 1,
    explanation: 'Deseo (quiero que…), duda, valoración y ciertas hipótesis activan subjuntivo.',
  },
]

const GRAMMAR_BY_LANG: Record<LangId, GrammarItem[]> = {
  es: ES_GRAMMAR,
  en: EN_GRAMMAR,
  fr: FR_GRAMMAR,
  ja: JA_GRAMMAR,
  zh: ZH_GRAMMAR,
}

/** Total de niveles objetivo */
export const TOTAL_LEVELS = 220

function buildOptions(
  correct: string,
  pool: string[],
  count = 8
): { options: string[]; correctIndex: number } {
  const distractors = shuffle(pool.filter((x) => x !== correct)).slice(0, count - 1)
  while (distractors.length < count - 1) {
    distractors.push(`¿?${distractors.length}`)
  }
  const options = shuffle([correct, ...distractors])
  return { options, correctIndex: options.indexOf(correct) }
}

/**
 * Genera pregunta determinista por nivel + idioma.
 * Niveles 1..TOTAL_LEVELS ciclan modos y vocabulario.
 */
export function generateQuestion(level: number, lang: LangId): Question {
  const L = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS)
  const lex = LEX_BY_LANG[lang]
  const grammar = GRAMMAR_BY_LANG[lang]
  const modeCycle: GameMode[] = [
    'translate_to_es',
    'translate_from_es',
    'grammar_deduce',
    'cognate_logic',
    'particle_or_order',
  ]
  const mode = modeCycle[(L - 1) % modeCycle.length]
  const difficulty = (clamp(1 + Math.floor((L - 1) / 40), 1, 5) as 1 | 2 | 3 | 4 | 5)

  // Grammar-focused levels
  if ((mode === 'grammar_deduce' || mode === 'particle_or_order') && grammar.length > 0) {
    const g = grammar[(L - 1) % grammar.length]
    return {
      id: `${lang}-g-${L}`,
      lang,
      mode,
      level: L,
      prompt: g.prompt,
      ruleHint: g.ruleHint,
      options: g.options,
      correctIndex: g.correctIndex,
      explanation: g.explanation,
      difficulty,
    }
  }

  // Lexical / translation
  if (!lex.length) {
    return {
      id: `${lang}-fallback-${L}`,
      lang,
      mode: 'translate_to_es',
      level: L,
      prompt: 'Nivel de refuerzo: elige la opción coherente con la deducción lingüística.',
      ruleHint: 'Aplica la regla del idioma activo.',
      options: ['Opción A', 'Opción B', 'Opción C', 'Opción D', 'Opción E', 'Opción F', 'Opción G', 'Opción H'],
      correctIndex: 0,
      explanation: 'Completa el banco léxico del idioma para más variedad.',
      difficulty: 1,
    }
  }

  const item = lex[(L - 1) % lex.length]
  const targetPool = DISTRACTORS[lang] ?? ES_DISTRACTORS
  const esPool = ES_DISTRACTORS

  if (mode === 'translate_to_es' || mode === 'cognate_logic') {
    const { options, correctIndex } = buildOptions(item.es, esPool, 8)
    return {
      id: `${lang}-toes-${L}`,
      lang,
      mode,
      level: L,
      prompt: `¿Qué significa en español: 「${item.target}」?`,
      ruleHint: item.rule || 'Deduce por cognado, contexto o regla del idioma.',
      options,
      correctIndex,
      explanation: `${item.target} → ${item.es}. ${item.note}`,
      difficulty,
    }
  }

  // translate_from_es (default branch)
  const { options, correctIndex } = buildOptions(item.target, targetPool, 8)
  return {
    id: `${lang}-fromes-${L}`,
    lang,
    mode: 'translate_from_es',
    level: L,
    prompt: `¿Cómo se dice en ${LANG_PROFILES[lang].name}: 「${item.es}」?`,
    ruleHint: item.rule || 'Aplica correspondencia léxica y evita false friends.',
    options,
    correctIndex,
    explanation: `${item.es} → ${item.target}. ${item.note}`,
    difficulty,
  }
}

export function generateLevelBank(lang: LangId, count = TOTAL_LEVELS): Question[] {
  return Array.from({ length: count }, (_, i) => generateQuestion(i + 1, lang))
}

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export function IdiomasGame() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('hub')
  const [lang, setLang] = useState<LangId>(() => readJSON(LS.lang, 'en'))
  const [levelId, setLevelId] = useState(() => readJSON(LS.current, 1))
  const [unlocked, setUnlocked] = useState(() => readJSON(LS.unlocked, 1))
  const [learnOpen, setLearnOpen] = useState(true)
  const [question, setQuestion] = useState<Question | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [wins, setWins] = useState(() => readJSON(LS.wins, 0))
  const [fails, setFails] = useState(() => readJSON(LS.fails, 0))

  const profile = LANG_PROFILES[lang]

  const scores = useMemo(() => readJSON<Record<string, number>>(LS.scores, {}), [screen, levelId, lang])

  const startLevel = useCallback(
    (id: number) => {
      const q = generateQuestion(id, lang)
      setLevelId(id)
      writeJSON(LS.current, id)
      setQuestion(q)
      setSelected(null)
      setAnswered(false)
      setCorrect(false)
      setScreen('play')
    },
    [lang]
  )

  useEffect(() => {
    writeJSON(LS.lang, lang)
  }, [lang])

  const onSelectOption = (idx: number) => {
    if (answered || !question) return
    setSelected(idx)
    const ok = idx === question.correctIndex
    setCorrect(ok)
    setAnswered(true)
    if (ok) {
      setWins((w) => {
        const n = w + 1
        writeJSON(LS.wins, n)
        return n
      })
      const key = `${lang}:${levelId}`
      const sc = readJSON<Record<string, number>>(LS.scores, {})
      sc[key] = Math.max(sc[key] ?? 0, 1)
      writeJSON(LS.scores, sc)
      if (levelId >= unlocked) {
        const next = Math.min(TOTAL_LEVELS, levelId + 1)
        setUnlocked(next)
        writeJSON(LS.unlocked, next)
      }
    } else {
      setFails((f) => {
        const n = f + 1
        writeJSON(LS.fails, n)
        return n
      })
    }
    setScreen('result')
  }

  // ---- HUB ----
  if (screen === 'hub') {
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => navigate('/categoria/deduccion')} aria-label="Volver">
            ←
          </button>
          <div className="id-top-title">
            <h1>Idiomas · Deducción</h1>
            <p>Gramática, cognados y traducción lógica</p>
          </div>
        </header>

        <section className="id-lang-switch" aria-label="Idioma activo">
          {LANG_ORDER.map((id) => {
            const p = LANG_PROFILES[id]
            return (
              <button
                key={id}
                type="button"
                className={`id-lang-btn ${lang === id ? 'active' : ''}`}
                onClick={() => setLang(id)}
              >
                <span className="id-flag">{p.flag}</span>
                <span>{p.name}</span>
              </button>
            )
          })}
        </section>

        <div className="id-card">
          <button
            type="button"
            className="id-accordion-head"
            onClick={() => setLearnOpen((v) => !v)}
            aria-expanded={learnOpen}
          >
            <span>
              {profile.flag} {profile.name} · origen y reglas
            </span>
            <span>{learnOpen ? '▾' : '▸'}</span>
          </button>
          <AnimatePresence initial={false}>
            {learnOpen && (
              <motion.div
                className="id-accordion-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <p className="id-meta">
                  <strong>Familia:</strong> {profile.family}
                  <br />
                  <strong>Hablantes:</strong> {profile.speakers}
                </p>
                <div className="id-essay">{profile.essay}</div>
                <h3>Reglas clave</h3>
                <ul>
                  {profile.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <h3>Momentos históricos</h3>
                <ul>
                  {profile.history.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <h3>Usos prácticos</h3>
                <ul>
                  {profile.practical.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <h3>Referencias (APA)</h3>
                <ul className="id-apa">
                  {profile.citations.map((c) => (
                    <li key={c.apa}>
                      <em>{c.apa}</em>
                      <br />
                      <span className="id-apa-note">{c.note}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="id-actions">
          <button className="id-btn primary" type="button" onClick={() => startLevel(levelId)}>
            Continuar · Nivel {levelId}
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('levels')}>
            Selección de niveles
          </button>
          <p className="id-stats-line">
            Aciertos: {wins} · Fallos: {fails} · Desbloqueado: {unlocked}/{TOTAL_LEVELS}
          </p>
        </div>
      </div>
    )
  }

  // ---- LEVELS ----
  if (screen === 'levels') {
    const maxShow = Math.min(TOTAL_LEVELS, Math.max(unlocked + 8, 24))
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Niveles · {profile.name}</h1>
            <p>Solo avanzas si aciertas</p>
          </div>
        </header>
        <div className="id-level-grid">
          {Array.from({ length: maxShow }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked
            const done = (scores[`${lang}:${n}`] ?? 0) > 0
            return (
              <button
                key={n}
                type="button"
                className={`id-level-cell ${locked ? 'locked' : ''} ${n === levelId ? 'current' : ''} ${done ? 'done' : ''}`}
                disabled={locked}
                onClick={() => !locked && startLevel(n)}
              >
                <span className="num">{n}</span>
                <span className="mark">{done ? '✓' : locked ? '🔒' : '·'}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- PLAY ----
  if (screen === 'play' && question) {
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>
              {profile.flag} Nivel {question.level}
            </h1>
            <p>
              {question.mode.replace(/_/g, ' ')} · dificultad {question.difficulty}/5
            </p>
          </div>
        </header>

        <div className="id-play-card">
          <p className="id-rule-hint">💡 {question.ruleHint}</p>
          <h2 className="id-prompt">{question.prompt}</h2>
          <div className="id-options">
            {question.options.map((opt, idx) => (
              <button
                key={`${question.id}-${idx}`}
                type="button"
                className={`id-opt ${selected === idx ? 'picked' : ''}`}
                onClick={() => onSelectOption(idx)}
              >
                <span className="id-opt-letter">{String.fromCharCode(65 + idx)}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ---- RESULT ----
  if (screen === 'result' && question) {
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>{correct ? 'Correcto' : 'Incorrecto'}</h1>
            <p>{correct ? 'Subes de nivel' : 'No subes de nivel · reintenta'}</p>
          </div>
        </header>
        <div className={`id-result-banner ${correct ? 'ok' : 'bad'}`}>
          {correct ? '✓ Bien razonado' : '✗ Sigue la regla y prueba de nuevo'}
        </div>
        <div className="id-card">
          <h3>Explicación</h3>
          <p className="id-explain">{question.explanation}</p>
          <p className="id-meta">
            Respuesta correcta:{' '}
            <strong>
              {String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}
            </strong>
          </p>
        </div>
        <div className="id-actions">
          {correct ? (
            <button
              className="id-btn primary"
              type="button"
              onClick={() => startLevel(Math.min(TOTAL_LEVELS, levelId + 1))}
            >
              Siguiente nivel
            </button>
          ) : (
            <button className="id-btn primary" type="button" onClick={() => startLevel(levelId)}>
              Reintentar nivel
            </button>
          )}
          <button className="id-btn" type="button" onClick={() => setScreen('levels')}>
            Mapa de niveles
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('hub')}>
            Menú
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="id-root">
      <style>{CSS}</style>
      <p>Cargando…</p>
    </div>
  )
}

export default IdiomasGame

// -----------------------------------------------------------------------------
// CSS — alineado con liquid-glass / theme.css del hub GCO
// -----------------------------------------------------------------------------
const CSS = `
.id-root {
  min-height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 28px;
  padding-top: max(12px, env(safe-area-inset-top));
  color: var(--text-primary, #f2f4f8);
  font-family: Inter, system-ui, sans-serif;
  box-sizing: border-box;
}
.id-root * { box-sizing: border-box; }
.id-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.id-top-title h1 {
  margin: 0;
  font-family: "Space Grotesk", Inter, sans-serif;
  font-size: clamp(1.15rem, 4vw, 1.45rem);
  letter-spacing: -0.02em;
}
.id-top-title p {
  margin: 2px 0 0;
  opacity: 0.65;
  font-size: 0.82rem;
}
.id-icon {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 18%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 8%, transparent);
  color: inherit;
  border-radius: 12px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.id-lang-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.id-lang-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  color: inherit;
  border-radius: 999px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  backdrop-filter: blur(10px);
}
.id-lang-btn.active {
  outline: 2px solid #3AA0FF;
  background: color-mix(in srgb, #3AA0FF 18%, transparent);
}
.id-flag { font-size: 1.05rem; }
.id-card {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 12%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 5%, transparent);
  backdrop-filter: blur(14px);
  overflow: hidden;
}
.id-accordion-head {
  width: 100%;
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.95rem;
}
.id-accordion-body {
  padding: 0 16px 16px;
  overflow: hidden;
}
.id-essay {
  font-size: 0.92rem;
  line-height: 1.55;
  white-space: pre-wrap;
  opacity: 0.92;
  margin: 8px 0 12px;
}
.id-accordion-body h3 {
  margin: 14px 0 6px;
  font-size: 0.95rem;
}
.id-accordion-body ul {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.88rem;
  line-height: 1.45;
  opacity: 0.9;
}
.id-apa { list-style: none; padding-left: 0; }
.id-apa li {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text-primary, #fff) 5%, transparent);
  font-size: 0.82rem;
}
.id-apa-note { opacity: 0.7; }
.id-meta {
  font-size: 0.86rem;
  opacity: 0.85;
  line-height: 1.4;
}
.id-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  width: 100%;
  margin: 4px auto 0;
}
.id-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 16%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 7%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(14px);
}
.id-btn.primary {
  background: linear-gradient(135deg, #3AA0FF88, #8B7CF688);
  border-color: #3AA0FF55;
}
.id-stats-line {
  text-align: center;
  font-size: 0.8rem;
  opacity: 0.7;
  margin: 4px 0 0;
}
.id-level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  max-height: 70dvh;
  overflow: auto;
  padding: 4px;
}
.id-level-cell {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  color: inherit;
  border-radius: 12px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.id-level-cell.locked { opacity: 0.35; cursor: not-allowed; }
.id-level-cell.current { outline: 2px solid #3AA0FF; }
.id-level-cell.done { border-color: #4ADE8088; }
.id-level-cell .num { font-weight: 700; }
.id-level-cell .mark { font-size: 0.75rem; opacity: 0.8; }
.id-play-card {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 12%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 5%, transparent);
  backdrop-filter: blur(14px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.id-rule-hint {
  margin: 0;
  font-size: 0.88rem;
  opacity: 0.85;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #3AA0FF 12%, transparent);
  border: 1px solid color-mix(in srgb, #3AA0FF 25%, transparent);
}
.id-prompt {
  margin: 0;
  font-size: clamp(1.05rem, 3.5vw, 1.25rem);
  line-height: 1.35;
  font-family: "Space Grotesk", Inter, sans-serif;
}
.id-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.id-opt {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--text-primary, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--text-primary, #fff) 6%, transparent);
  color: inherit;
  border-radius: 12px;
  padding: 12px 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  font-size: 0.92rem;
  line-height: 1.35;
}
.id-opt:active { transform: scale(0.99); }
.id-opt.picked { outline: 2px solid #3AA0FF; }
.id-opt-letter {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.8rem;
  background: color-mix(in srgb, var(--text-primary, #fff) 12%, transparent);
}
.id-result-banner {
  text-align: center;
  font-weight: 800;
  padding: 12px;
  border-radius: 14px;
  font-size: 1.05rem;
}
.id-result-banner.ok {
  background: color-mix(in srgb, #4ADE80 22%, transparent);
  border: 1px solid #4ADE8088;
}
.id-result-banner.bad {
  background: color-mix(in srgb, #FF6B4A 22%, transparent);
  border: 1px solid #FF6B4A88;
}
.id-explain {
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 8px;
}
@media (max-width: 480px) {
  .id-lang-btn { font-size: 0.78rem; padding: 7px 10px; }
  .id-opt { font-size: 0.88rem; }
}
`