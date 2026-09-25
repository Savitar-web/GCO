/**
 * =============================================================================
 * idiomas.tsx — Deducción lingüística · GymCogOrigins
 * =============================================================================
 *
 * Ruta sugerida:
 *   src/features/deduccion/juegos/idiomas/idiomas.tsx
 *
 * Mecánica:
 * - Switch de idiomas: español, inglés, japonés, chino, francés, portugués,
 *   alemán, italiano.
 * - Panel desplegable educativo: origen, evolución, reglas, historia, APA.
 * - Modos de juego seleccionables: traducción, gramática, cognados, partículas,
 *   lectura guiada, false friends, morfología.
 * - Progresión CEFR propia por idioma (A1 → C2).
 * - Pista gramatical en cada nivel (tiempos, sufijos, orden, partículas…).
 * - Explicación tras cada partida (gane o pierda).
 * - Solo se sube de nivel si aciertas.
 * - Calificación al ganar según tiempo e intentos.
 * - Modo Lectura: historias históricas/culturales bilingües (original ↔ español)
 *   con cita APA.
 * - Compatible con tema dark/light/rainbow (theme.css).
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type LangId = 'es' | 'en' | 'ja' | 'zh' | 'fr' | 'pt' | 'de' | 'it'

export type GameMode =
  | 'translate_to_es'      // palabra/frase en L2 → elegir español
  | 'translate_from_es'    // español → elegir L2
  | 'grammar_deduce'       // regla gramatical → aplicar a caso
  | 'cognate_logic'        // cognados / raíces → deducir significado
  | 'particle_or_order'    // orden / partículas / artículos
  | 'false_friends'        // false friends
  | 'morphology'           // sufijos, prefijos, formación de palabras
  | 'reading_comprehension'
  | 'contextual_usage' // palabra → contexto y forma

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

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
  grammarSynopses: string[]
  citations: { apa: string; note: string }[]
}

export interface Question {
  id: string
  lang: LangId
  mode: GameMode
  level: number
  cefr: CefrLevel
  prompt: string
  /** Texto más largo opcional (lectura / contexto). */
  passage?: string
  /** Pista de regla (deducción). */
  ruleHint: string
  /** Explicación extendida de la regla. */
  ruleExplain: string
  /** Consejo si falla (sin revelar la respuesta). */
  failAdvice: string
  options: string[]
  correctIndex: number
  explanation: string
  difficulty: 1 | 2 | 3 | 4 | 5
  /** Raíz / lexema principal para memorizar (descomposición en bloques). */
  rootFocus?: string
  /** Etimología o nota nutritiva para el diccionario personal. */
  etymology?: string
  /** Explicación real de cada opción, alineada por posición con `options`,
   * sin indicar cuál es correcta. Se usa en la clase previa al nivel. */
  optionNotes?: string[]
}

/** Entrada del diccionario personal: niveles superados con contexto de aprendizaje. */
export interface DictEntry {
  id: string
  lang: LangId
  level: number
  cefr: CefrLevel
  mode: GameMode
  prompt: string
  correctAnswer: string
  explanation: string
  ruleHint: string
  rootFocus?: string
  etymology?: string
  seconds: number
  attempts: number
  completedAt: string
}

export interface Story {
  id: string
  region: string
  titleEs: string
  titleOriginal: string
  lang: LangId
  /** Texto en español (completo). */
  textEs: string
  /** Texto en idioma original (completo o representativo). */
  textOriginal: string
  apa: string
  note: string
  tags: string[]
  /** Glosario de palabras clave del texto original, tocables en pantalla. */
  glossary?: { word: string; es: string; note?: string }[]
  /** Desglose frase por frase: original, traducción y por qué se escribe/lee así. */
  sentences?: { original: string; es: string; note: string }[]
}

type Screen =
  | 'hub'
  | 'learn'
  | 'vocab'
  | 'play'
  | 'result'
  | 'levels'
  | 'modes'
  | 'reading'
  | 'story'
  | 'dictionary'
  | 'dictLang'
  | 'review'
  | 'achievements'

const LS = {
  unlocked: 'gco.idiomas.unlocked.v3',
  current: 'gco.idiomas.current.v3',
  lang: 'gco.idiomas.lang',
  scores: 'gco.idiomas.scores.v3',
  wins: 'gco.idiomas.wins',
  fails: 'gco.idiomas.fails',
  mode: 'gco.idiomas.mode',
  attempts: 'gco.idiomas.attempts.v3',
  bestTime: 'gco.idiomas.bestTime.v3',
  completed: 'gco.idiomas.completed.v3',
  dictionary: 'gco.idiomas.dictionary.v1',
  skipVocab: 'gco.idiomas.skipVocab.v1',
  streak: 'gco.idiomas.streak.v1',
  bestStreak: 'gco.idiomas.bestStreak.v1',
  storyFilter: 'gco.idiomas.storyFilter.v1',
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

/** CEFR según número de nivel (progresión propia por idioma). */
export function levelToCefr(level: number): CefrLevel {
  if (level <= 200) return 'A1'
  if (level <= 400) return 'A2'
  if (level <= 800) return 'B1'
  if (level <= 1400) return 'B2'
  if (level <= 2200) return 'C1'
  return 'C2'
}

export function cefrLabel(c: CefrLevel): string {
  const map: Record<CefrLevel, string> = {
    A1: 'A1 · Principiante',
    A2: 'A2 · Elemental',
    B1: 'B1 · Intermedio',
    B2: 'B2 · Intermedio alto',
    C1: 'C1 · Avanzado',
    C2: 'C2 · Maestría',
  }
  return map[c]
}

/** Calificación al ganar: tiempo (s) + intentos. */
export function gradePerformance(seconds: number, attempts: number): {
  grade: string
  stars: number
  comment: string
} {
  const timeScore = seconds <= 15 ? 3 : seconds <= 35 ? 2 : seconds <= 60 ? 1 : 0
  const attemptScore = attempts <= 1 ? 3 : attempts === 2 ? 2 : attempts === 3 ? 1 : 0
  const total = timeScore + attemptScore
  if (total >= 5) return { grade: 'S', stars: 5, comment: 'Excelente deducción: rápido y preciso.' }
  if (total >= 4) return { grade: 'A', stars: 4, comment: 'Muy bien. Regla aplicada con soltura.' }
  if (total >= 3) return { grade: 'B', stars: 3, comment: 'Bien. Sigue practicando la pista.' }
  if (total >= 2) return { grade: 'C', stars: 2, comment: 'Aprobado. Revisa la explicación.' }
  return { grade: 'D', stars: 1, comment: 'Pasaste. Vuelve a la pista y reintenta mentalmente.' }
}

// -----------------------------------------------------------------------------
// Perfiles de idioma (educativos, APA, historia, reglas claras)
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
      'Pretérito indefinido: acciones terminadas en el pasado.',
      'Imperfecto: descripción, hábito o acción en curso en el pasado.',
      'Futuro simple: -é, -ás, -á, -emos, -éis, -án (o ir a + infinitivo).',
      'Sufijo -ción / -sión: suele formar sustantivos abstractos (nación, decisión).',
      'Se impersonal y pasiva refleja: Se habla español.',
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
    grammarSynopses: [
      'Presente de indicativo: hablo, hablas, habla, hablamos, habláis, hablan.',
      'Pretérito: hablé, hablaste, habló… (acciones cerradas).',
      'Imperfecto: hablaba, hablabas… (marco, hábito).',
      'Subjuntivo presente: hable, hables, hable… (deseo, duda).',
      'Concordancia: la casa blanca / las casas blancas.',
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
      'Present simple 3.ª persona: verbo + -s/-es.',
      'Present perfect: have/has + past participle (experiencia / resultado).',
      'Pasado simple: verbos regulares -ed; irregulares (go → went).',
      'Condicionales: 0, 1.ª, 2.ª, 3.ª (if + tiempo distinto).',
      'Sufijos: -tion/-sion (nation), -able/-ible, -ment, -ness.',
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
    grammarSynopses: [
      'Present simple: I/you/we/they work; he/she/it works.',
      'Past simple: worked / went / saw.',
      'Present continuous: am/is/are + -ing.',
      'Present perfect: have/has + past participle.',
      'Future: will + verb / be going to + verb.',
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
      'Forma -masu: cortesía neutra (食べます).',
      'Forma te (て): conexión, petición, progresivo (-te iru).',
      'Pasado: -ta / -mashita.',
      'Negación: -nai / -masen.',
      'Contadores: 本 (hon) libros, 枚 (mai) objetos planos, 人 (nin) personas.',
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
    grammarSynopses: [
      '辞書形 (diccionario): 食べる taberu.',
      'ます形: 食べます tabemasu (cortés).',
      'た形: 食べた tabeta (pasado).',
      'ない形: 食べない tabenai (negación).',
      'て形: 食べて tabete (conexión / petición).',
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
      'Negación: 不 bù (habitual/futuro) vs 没 méi (pasado/posesión).',
      '因为 … 所以 … = porque … por eso …',
      'Complemento de grado: 得 de + adjetivo/adverbio.',
      'Resultativo: 看见 kànjiàn (ver y lograr percibir).',
      'Sufijos de dirección: 上, 下, 进, 出, 回, 过, 起.',
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
    grammarSynopses: [
      'Estructura básica: 主语 + 动词 + 宾语 (SVO).',
      '了 le: cambio de estado / acción completada.',
      '过 guo: experiencia pasada.',
      '着 zhe: estado continuado.',
      '把 bǎ: disposición del objeto (construcción ba).',
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

Fonológicamente evolucionó hacia la pérdida de muchas consonantes finales pronunciadas y un sistema vocálico nasal. La ortografía conserva huellas etimológicas (beaucoup, eau). Gramaticalmente mantiene género, concordancia y un sistema verbal complejo; el passé composé es el pasado narrativo habitual frente al passé simple literario.

La francofonía abarca Europa, África, Canadá y el Caribe. La Académie française (1635) simboliza la regulación normativa, aunque el uso real es plural.

Para deducir: cognados latinos con el español son frecuentes pero con cambios fonéticos (hôpital/hospital); atención a género (un problème) y a false friends (librairie = librería, no library).`,
    rules: [
      'Género masculino/femenino; artículos le/la/les, un/une.',
      'Concordancia del participio en ciertos contextos.',
      'Negación en dos partes: ne … pas (formal); pas en oral.',
      'Orden SVO; adjetivos a menudo después del sustantivo.',
      'Liaison y elisión en la cadena hablada.',
      'Passé composé: avoir/être + participio.',
      'Imparfait: descripción y hábito en el pasado.',
      'Subjuntivo tras bien que, pour que, il faut que…',
      'Partitivos: du, de la, de l’, des.',
      'Sufijos: -tion, -ment, -able, -eur/-euse.',
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
    grammarSynopses: [
      'Présent: je parle, tu parles, il parle…',
      'Passé composé: j’ai parlé / je suis allé(e).',
      'Imparfait: je parlais…',
      'Futur simple: je parlerai…',
      'Subjonctif: que je parle…',
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
  pt: {
    id: 'pt',
    name: 'Portugués',
    nativeName: 'Português',
    flag: '🇵🇹',
    family: 'Romance (indoeuropea)',
    speakers: '~260 millones (Brasil, Portugal, África lusófona)',
    essay: `El portugués desciende del galaico-portugués medieval hablado en el noroeste de la península ibérica. La independencia de Portugal y la expansión marítima (s. XV–XVI) llevaron la lengua a Brasil, África y Asia (Teyssier, 1984).

Comparte con el español una base latina muy cercana, pero diverge en fonología (vocales nasales, sibilantes), morfología verbal y algunos usos pronominales. El portugués europeo y el brasileño difieren en pronunciación, tratamiento de pronombres y preferencias léxicas; ambos son mutuamente inteligibles en grado alto en registro escrito.

Gramaticalmente conserva género, concordancia y un sistema verbal rico. El infinitivo personal (falarmos, dizeres) es un rasgo distintivo. La ortografía se unificó parcialmente con el Acordo Ortográfico de 1990.

Para deducir desde el español: muchos cognados son transparentes (nação/nación), pero hay false friends y diferencias de género o construcción (a gente = nosotros en Brasil; rato ≠ ratón).`,
    rules: [
      'Género y número; artículos o/a/os/as, um/uma.',
      'Infinitivo personal: para falarmos, sem dizeres.',
      'Pretérito perfeito vs imperfeito (como en español, con matices).',
      'Futuro do pretérito = condicional (falaria).',
      'Contracciones: do, da, no, na, pelo, pela…',
      'Colocación pronominal: próclisis / ênclisis / mesóclisis (PT-EU).',
      'Gerúndio muy usado en Brasil (estou falando).',
      'Sufijos: -ção/-são, -mente, -ável/-ível.',
      'Nasalidad: ão, õe, ãe (não, pões, mãe).',
      'Ser vs estar: similar al español, con matices de uso.',
    ],
    history: [
      'Galaico-portugués medieval (trova, Cancioneiros).',
      'Expansión ultramarina y variedades atlánticas.',
      'Brasil: lengua mayoritaria; influencias indígenas y africanas.',
      'Acordo Ortográfico (1990) y norma plural.',
      'Lusofonía: CPLP y espacios africanos/asiáticos.',
    ],
    practical: [
      'Brasil (mercado, cultura), Portugal, Angola, Moçambique…',
      'Cercanía al español acelera la lectura; la oralidad exige práctica.',
      'Atención a pronombres y a false friends (pasta, rato, contestar).',
    ],
    grammarSynopses: [
      'Presente: falo, falas, fala, falamos, falais, falam.',
      'Pretérito perfeito: falei, falaste, falou…',
      'Imperfeito: falava, falavas…',
      'Futuro: falarei… / vou falar.',
      'Infinitivo pessoal: (para) falarmos.',
    ],
    citations: [
      {
        apa: 'Teyssier, P. (1984). História da língua portuguesa. Sá da Costa.',
        note: 'Historia clásica de la lengua portuguesa.',
      },
      {
        apa: 'Mateus, M. H. M., & d’Andrade, E. (2000). The phonology of Portuguese. Oxford University Press.',
        note: 'Fonología del portugués.',
      },
      {
        apa: 'Azevedo, M. M. (2005). Portuguese: A linguistic introduction. Cambridge University Press.',
        note: 'Introducción lingüística al portugués.',
      },
    ],
  },
  de: {
    id: 'de',
    name: 'Alemán',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    family: 'Germánica (indoeuropea)',
    speakers: '~95 millones nativos; ~130 millones total',
    essay: `El alemán pertenece al grupo germánico occidental. El alto alemán antiguo y medio evolucionaron hacia el estándar moderno, impulsado por la cancillería y por la Biblia de Lutero (s. XVI), que unificó en gran medida la lengua escrita (Keller, 1978).

Es una lengua flexiva con cuatro casos (nominativo, acusativo, dativo, genitivo), tres géneros y concordancia fuerte en determinantes y adjetivos. El orden de palabras es verb-second en oraciones principales y verb-final en subordinadas. Los compuestos nominales largos son productivos y transparentes si se segmentan.

Para deducir: identifica el caso por el artículo/terminación; el verbo conjugado en segunda posición en la principal; muchos cognados con el inglés (House/Haus, water/Wasser) y préstamos latinos/franceses.`,
    rules: [
      'Cuatro casos: Nominativ, Akkusativ, Dativ, Genitiv.',
      'Tres géneros: der / die / das.',
      'Orden: verbo finito en 2.ª posición (principal); al final (subordinada).',
      'Separable verbs: anrufen → ich rufe an.',
      'Plurales irregulares frecuentes (Buch → Bücher).',
      'Perfekt: haben/sein + Partizip II.',
      'Präteritum: narrativo / escrito.',
      'Komposita: segmentar de derecha a izquierda (Haustürschlüssel).',
      'Sufijos: -ung (Bildung), -heit/-keit, -schaft, -lich.',
      'Declinación del adjetivo según determinante (fuerte/mixta/débil).',
    ],
    history: [
      'Alto alemán antiguo → medio → moderno temprano.',
      'Lutero y estandarización escrita (s. XVI).',
      'Variedades regionales (Bairisch, Alemannisch, etc.).',
      'Alemán estándar (Hochdeutsch) en educación y medios.',
      'Espacio DACH: Alemania, Austria, Suiza (con particularidades).',
    ],
    practical: [
      'Ciencia, ingeniería, filosofía, UE y Europa Central.',
      'Cognados germánicos con inglés; compuestos predecibles.',
      'Dominar casos y orden verbal desbloquea la lectura.',
    ],
    grammarSynopses: [
      'Präsens: ich spreche, du sprichst, er spricht…',
      'Perfekt: ich habe gesprochen / ich bin gegangen.',
      'Präteritum: ich sprach, ich ging.',
      'Futur: ich werde sprechen.',
      'Nebensatz: …, weil ich spreche (verbo al final).',
    ],
    citations: [
      {
        apa: 'Keller, R. E. (1978). The German language. Faber & Faber.',
        note: 'Historia y estructura del alemán.',
      },
      {
        apa: 'Durrell, M. (2011). Hammer’s German grammar and usage (5th ed.). Routledge.',
        note: 'Gramática de uso de referencia.',
      },
      {
        apa: 'Salmons, J. (2012). A history of German. Oxford University Press.',
        note: 'Historia lingüística del alemán.',
      },
    ],
  },
  it: {
    id: 'it',
    name: 'Italiano',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    family: 'Romance (indoeuropea)',
    speakers: '~65 millones nativos; ~85 millones total',
    essay: `El italiano moderno se basa en gran medida en el toscano literario (Dante, Petrarca, Boccaccio). La unificación política del s. XIX impulsó el estándar nacional, aunque los dialectos/italorromance siguen vivos (Maiden, 1995).

Es una lengua romance con género, concordancia y sistema verbal rico. El artículo y las preposiciones combinadas (del, al, nel…) son muy frecuentes. La pronunciación es relativamente transparente respecto a la ortografía.

Para deducir desde el español: altísima densidad de cognados (nazione/nación, importante/importante); diferencias en pasado (passato prossimo vs pretérito), en uso de artículos y en algunos false friends (camera = habitación; fattoria = granja).`,
    rules: [
      'Género y número; artículos il/lo/la/i/gli/le, un/uno/una.',
      'Passato prossimo: avere/essere + participio (acuerdo con essere).',
      'Imperfetto: descripción y hábito.',
      'Futuro semplice: parlerò, parlerai…',
      'Congiuntivo tras verbos de voluntad, duda, emoción.',
      'Preposiciones articuladas: del, al, dal, nel, sul…',
      'Clíticos: lo, la, li, le, mi, ti, ci, vi…',
      'Sufijos: -zione, -mente, -abile/-ibile, -ore/-trice.',
      'Doble consonante significativa (casa vs cassa).',
      'Orden SVO flexible por tema/rema y clíticos.',
    ],
    history: [
      'Latín → italorromance; prestigio del toscano literario.',
      'Dante y la “lingua di sì”.',
      'Unificación italiana y difusión del estándar.',
      'Dialectos y lenguas minoritarias coexistentes.',
      'Italiano contemporáneo en medios y diáspora.',
    ],
    practical: [
      'Cultura, arte, diseño, gastronomía, turismo y UE.',
      'Cognados con español y francés facilitan la lectura rápida.',
      'Atención a passato prossimo y a false friends.',
    ],
    grammarSynopses: [
      'Presente: parlo, parli, parla, parliamo, parlate, parlano.',
      'Passato prossimo: ho parlato / sono andato/a.',
      'Imperfetto: parlavo, parlavi…',
      'Futuro: parlerò…',
      'Congiuntivo presente: che io parli…',
    ],
    citations: [
      {
        apa: 'Maiden, M. (1995). A linguistic history of Italian. Longman.',
        note: 'Historia lingüística del italiano.',
      },
      {
        apa: 'Proudfoot, A., & Cardo, F. (2005). Modern Italian grammar (2nd ed.). Routledge.',
        note: 'Gramática moderna de uso.',
      },
      {
        apa: 'Lepschy, A. L., & Lepschy, G. (1991). The Italian language today (2nd ed.). Routledge.',
        note: 'Italiano contemporáneo y variación.',
      },
    ],
  },
}

const LANG_ORDER: LangId[] = ['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'zh']

const MODE_LABELS: Record<GameMode, string> = {
  translate_to_es: 'Traducir → español',
  translate_from_es: 'Traducir desde español',
  grammar_deduce: 'Deducción gramatical',
  cognate_logic: 'Cognados y raíces',
  particle_or_order: 'Partículas / orden',
  false_friends: 'False friends',
  morphology: 'Morfología y sufijos',
  reading_comprehension: 'Comprensión lectora',
  contextual_usage: 'Uso contextual de la palabra',
}

const MODE_HELP: Record<GameMode, string> = {
  translate_to_es: 'Ves una palabra o frase en el idioma activo y eliges su significado en español.',
  translate_from_es: 'Ves una palabra en español y eliges la forma correcta en el idioma activo.',
  grammar_deduce: 'Aplicas una regla (tiempo verbal, concordancia, partícula…) a un caso concreto.',
  cognate_logic: 'Usas raíces compartidas y lógica etimológica para deducir el significado.',
  particle_or_order: 'Identificas partículas, artículos u orden de palabras característico.',
  false_friends: 'Detectas trampas de parecido engañoso entre lenguas.',
  morphology: 'Analizas prefijos, sufijos y formación de palabras (-ción, -ment, -ung…).',
  reading_comprehension: 'Lees un texto breve y respondes una pregunta de comprensión o forma.',
  contextual_usage: 'Ves una palabra y eliges el contexto correcto y cómo se interpreta o escribe en ese uso.',
}

/**
 * Clase técnica por modo de juego: el marco pedagógico y terminológico que
 * antecede a cada nivel. Se combina con los datos concretos del nivel
 * (palabra, regla, etimología) para producir una explicación extensa y no
 * genérica en cada pantalla, sin depender de un texto único por nivel.
 */
const MODE_LESSON: Record<GameMode, { title: string; body: string[] }> = {
  translate_to_es: {
    title: 'Traducción semántica: del significante al significado',
    body: [
      'En lingüística se distingue el significante (la forma sonora o escrita de una palabra) del significado (el concepto al que remite). Traducir no es sustituir un significante por otro de manera mecánica, sino identificar qué concepto comparte una palabra extranjera con una palabra española, incluso cuando la forma no se parece en nada.',
      'Esta clase trabaja con lo que la lexicografía llama el "campo semántico": el conjunto de matices que una palabra puede cubrir. Muchas palabras no tienen un equivalente único en español, sino un abanico de opciones según el registro (formal, coloquial), el dialecto o el contexto de uso. Por eso cada palabra de esta lección incluye una nota de uso, no solo una traducción aislada.',
      'Presta atención también a la categoría gramatical (sustantivo, verbo, adjetivo): dos idiomas rara vez cortan la realidad en las mismas categorías, así que la traducción correcta depende de qué función cumple la palabra en la frase.',
    ],
  },
  translate_from_es: {
    title: 'Producción activa: de la idea a la forma correcta',
    body: [
      'Traducir DESDE el español es más exigente que traducir HACIA el español, porque aquí no reconoces una forma dada: debes producirla tú, aplicando reglas de morfología (cómo se forman las palabras), de sintaxis (cómo se ordenan) y, en muchos idiomas, de flexión (cómo cambia una palabra según género, número, tiempo o caso).',
      'Este modo entrena la llamada "competencia productiva": la capacidad de generar lenguaje correcto, no solo de reconocerlo pasivamente al leer. Por eso cada palabra de esta clase incluye su irregularidad más frecuente (un pasado irregular, un plural que no sigue el patrón general, un género que hay que memorizar) porque ahí es donde suelen fallar incluso los aprendices avanzados.',
      'Un truco profesional: memoriza siempre la palabra dentro de un bloque mínimo de contexto (un artículo, una preposición fija, una colocación habitual) en vez de memorizarla suelta; la memoria lingüística funciona mejor por asociación que por lista aislada.',
    ],
  },
  grammar_deduce: {
    title: 'Deducción gramatical: la regla detrás del caso',
    body: [
      'La gramática no es una lista arbitraria de excepciones: es un sistema de reglas que, una vez entendidas, se aplican a cientos de casos nuevos sin memorizarlos uno por uno. Esta clase te da la regla general antes de pedirte que la apliques a un caso concreto, siguiendo el método deductivo: de lo general a lo particular.',
      'Vas a trabajar sobre todo con morfología verbal (cómo cambia la forma del verbo según persona, tiempo, aspecto y modo) y con concordancia (cómo unas palabras "acuerdan" su forma con otras, por ejemplo un adjetivo con el género y número del sustantivo que modifica).',
      'La estrategia correcta no es adivinar por parecido con el español, sino identificar qué categoría gramatical exige la regla explicada abajo y descartar sistemáticamente cualquier opción que la viole.',
    ],
  },
  cognate_logic: {
    title: 'Cognados y raíces: la memoria histórica de las palabras',
    body: [
      'Un cognado es una palabra que comparte origen etimológico con otra de un idioma distinto, aunque hayan evolucionado por caminos separados durante siglos o milenios: "nación" y "nation" son cognados porque ambas descienden del latín "natio". Reconocer cognados es una de las estrategias más rentables para ampliar vocabulario rápidamente en idiomas emparentados.',
      'Esta clase descompone cada palabra en su raíz o lexema (el núcleo de significado que se repite en toda una familia de palabras) para que aprendas a reconocer ese núcleo en palabras que nunca viste antes. Por ejemplo, una vez que sabes que "-tion/-ción" marca un sustantivo abstracto derivado de un verbo, puedes deducir el significado de docenas de palabras nuevas sin memorizarlas todas.',
      'Cuidado: no todo parecido es cognado real. Cuando dos palabras se parecen por pura coincidencia fonética sin compartir origen, se llaman "cognados falsos" o forman parte del fenómeno de false friends, que se trabaja en otro modo de esta app.',
    ],
  },
  particle_or_order: {
    title: 'Sintaxis: partículas, artículos y el orden de las palabras',
    body: [
      'La sintaxis estudia cómo se combinan las palabras para formar frases con sentido. Dos herramientas sintácticas fundamentales son las partículas (palabras funcionales pequeñas —artículos, preposiciones, marcadores gramaticales— que no llevan significado léxico pleno pero organizan la frase) y el orden de palabras, que en muchos idiomas no es libre sino que marca la función de cada elemento.',
      'En idiomas como el japonés, las partículas (は, が, を, に, で) cumplen el trabajo que en español hacen las preposiciones y el orden de palabras combinados; identificarlas correctamente es más importante que memorizar vocabulario suelto. En idiomas europeos, el orden SVO (Sujeto-Verbo-Objeto) es la norma, pero varía en subordinadas, preguntas o énfasis.',
      'Esta clase te muestra la partícula o el patrón de orden exacto que se pondrá a prueba, para que entres a la pregunta reconociendo la estructura antes de leer las opciones.',
    ],
  },
  false_friends: {
    title: 'False friends: la trampa del parecido engañoso',
    body: [
      'Un "false friend" (falso amigo) es una palabra que se parece mucho, en forma escrita o sonora, a una palabra de tu idioma nativo, pero que tiene un significado distinto —a veces completamente opuesto—. Son una de las causas más frecuentes de malentendidos entre hablantes de idiomas emparentados, precisamente porque el parecido genera una falsa sensación de seguridad.',
      'Lingüísticamente, los false friends surgen de tres maneras: (1) dos palabras que comparten origen etimológico pero divergieron de significado con el tiempo (deriva semántica), (2) coincidencia fonética pura sin relación histórica, o (3) préstamos que cambiaron de sentido al entrar a otro idioma.',
      'La defensa contra un false friend nunca es la intuición ni el parecido: es el contexto de la frase y, cuando existe duda, verificar el significado real en vez de asumir la traducción "obvia". Esta clase te muestra exactamente la trampa antes de que puedas caer en ella.',
    ],
  },
  morphology: {
    title: 'Morfología: cómo se construyen las palabras por dentro',
    body: [
      'La morfología estudia la estructura interna de las palabras: cómo se combinan una raíz (el núcleo de significado) con afijos —prefijos (antes de la raíz) y sufijos (después de la raíz)— para formar palabras nuevas o modificar su función gramatical. Es, junto con la sintaxis, uno de los dos grandes niveles de organización de cualquier lengua.',
      'Reconocer sufijos productivos (que se repiten en muchas palabras con la misma función, como -ción, -mente, -able en español, o -tion, -ly, -able en inglés) multiplica tu vocabulario sin necesidad de memorizar cada palabra por separado: si entiendes el patrón, puedes deducir palabras que nunca estudiaste.',
      'Esta clase descompone la palabra del nivel en sus bloques morfológicos exactos para que practiques ese análisis antes de responder, en vez de memorizar la palabra entera como una unidad opaca.',
    ],
  },
  reading_comprehension: {
    title: 'Comprensión lectora: leer para extraer información precisa',
    body: [
      'La comprensión lectora no consiste en entender cada palabra por separado, sino en construir el sentido global de un texto y, sobre todo, en saber localizar la información exacta que responde a una pregunta concreta, una habilidad que en pedagogía se llama "lectura de rastreo" o scanning, distinta de la "lectura profunda" que analiza matices.',
      'Los textos históricos y culturales de esta app suelen concentrar la respuesta en una cláusula clave: una nominalización (sustantivo derivado de un verbo, como "consentimiento" de "consentir"), una conjunción causal ("porque", "since", "因为") o un marcador temporal. Entrenarte para detectar esas señales estructurales es más eficiente que releer el texto entero cada vez.',
      'Esta clase te da el pasaje completo y una pista sobre qué tipo de marcador o cláusula debes rastrear, para que tu primera lectura ya sea una lectura dirigida y no una lectura a ciegas.',
    ],
  },
  contextual_usage: {
    title: 'Uso contextual: la misma palabra, significados distintos',
    body: [
      'Muchas palabras son polisémicas: tienen varios significados relacionados (o a veces no relacionados en absoluto, en cuyo caso hablamos de homonimia) y solo el contexto —las palabras que la acompañan— permite decidir cuál aplica. "Bank" en inglés puede ser una entidad financiera o la orilla de un río; "banco" en español, un asiento, una entidad financiera o un cardumen de peces.',
      'La pragmática, la rama de la lingüística que estudia cómo el contexto determina el significado, nos dice que el cerebro humano resuelve la ambigüedad casi instantáneamente gracias a las palabras vecinas (colocaciones): "sat on the bank" activa el sentido de "orilla" mucho antes de terminar la frase, porque "sat on" no combina naturalmente con una entidad financiera.',
      'Esta clase te muestra la palabra polisémica y el contexto exacto en el que aparecerá, para que entrenes esa misma resolución rápida de ambigüedad antes de enfrentar la pregunta.',
    ],
  },
}

// -----------------------------------------------------------------------------
// Banco léxico y reglas por idioma
// -----------------------------------------------------------------------------

interface LexItem {
  es: string
  target: string
  note: string
  rule?: string
  /** Raíz o lexema nuclear para memorizar y reutilizar. */
  root?: string
  /** Etimología breve / familia de palabras (nutritivo para el diccionario). */
  etymology?: string
  /** Bloques morfológicos: prefijo + raíz + sufijo. */
  lexemes?: string[]
  /** Aproximación de pronunciación leída "a la española", sonido por sonido. */
  phoneticEs?: string
  /** Categoría temática (para agrupar el vocabulario en unidades). */
  topic?: string
}

/**
 * A partir de marcas convencionales dentro del texto de etimología
 * (OE = Old English, ON = Old Norse, OF = Old French, ME = Middle English,
 * lat. = latín, gr. = griego) deduce una franja histórica aproximada y
 * legible para explicar "desde cuándo existe" una palabra sin inventar
 * fechas exactas que la fuente no da.
 */
function originEraLabel(etymology?: string): string | null {
  if (!etymology) return null
  const e = etymology
  if (/\bOE\b/.test(e))
    return 'Inglés antiguo (Old English), documentado aprox. entre los años 450 y 1150 d. C., tras la llegada de anglos, sajones y jutos a Britania.'
  if (/\bON\b/.test(e))
    return 'Nórdico antiguo (Old Norse), llevado a Inglaterra por los vikingos entre los siglos VIII y XI.'
  if (/\bOF\b/.test(e))
    return 'Francés antiguo (Old French), incorporado al inglés sobre todo tras la conquista normanda de 1066.'
  if (/\bME\b/.test(e))
    return 'Inglés medio (Middle English), entre aprox. 1150 y 1500, época de Chaucer.'
  if (/lat\./.test(e))
    return 'Raíz latina: llegó al inglés directamente del latín culto o a través del francés, muchas veces en el Renacimiento (s. XV–XVII).'
  if (/gr\./.test(e))
    return 'Raíz griega: entró al inglés vía el latín culto, típico del vocabulario científico y académico.'
  return null
}

/** Reproduce el audio de una palabra o frase con la voz del navegador. */
const TTS_LANG: Record<LangId, string> = {
  es: 'es-ES', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', fr: 'fr-FR', pt: 'pt-PT', de: 'de-DE', it: 'it-IT',
}
function speak(text: string, lang: LangId) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = TTS_LANG[lang] || 'en-US'
    u.rate = 0.92
    window.speechSynthesis.speak(u)
  } catch {
    /* noop: síntesis de voz no disponible en este dispositivo */
  }
}

/**
 * Lee en voz alta un texto largo (la "clase" completa), partiéndolo en
 * fragmentos cortos para que el motor de síntesis del navegador no falle
 * con utterances demasiado largas. Devuelve una función para detener la
 * lectura a mitad de camino.
 */
function speakLesson(paragraphs: string[], lang: LangId, onDone?: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onDone?.()
    return () => {}
  }
  window.speechSynthesis.cancel()
  const chunks = paragraphs
    .join(' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0)
  let stopped = false
  const playFrom = (i: number) => {
    if (stopped || i >= chunks.length) {
      if (!stopped) onDone?.()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[i])
    u.lang = TTS_LANG[lang] || 'en-US'
    u.rate = 0.98
    u.onend = () => playFrom(i + 1)
    u.onerror = () => playFrom(i + 1)
    window.speechSynthesis.speak(u)
  }
  playFrom(0)
  return () => {
    stopped = true
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* noop */
    }
  }
}

/**
 * Pequeño sintetizador de efectos de sonido con la Web Audio API: no
 * depende de archivos externos, así que funciona sin conexión, algo
 * imprescindible para una app offline-first.
 */
let sharedAudioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx()
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {})
    return sharedAudioCtx
  } catch {
    return null
  }
}
type SfxKind = 'flip' | 'correct' | 'wrong' | 'click' | 'levelup' | 'start' | 'toggle'
function playSfx(kind: SfxKind) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  const tone = (freq: number, start: number, dur: number, type: OscillatorType, gainPeak: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now + start)
    gain.gain.setValueAtTime(0, now + start)
    gain.gain.linearRampToValueAtTime(gainPeak, now + start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + start)
    osc.stop(now + start + dur + 0.02)
  }
  switch (kind) {
    case 'flip':
      tone(520, 0, 0.09, 'triangle', 0.05)
      break
    case 'click':
      tone(340, 0, 0.05, 'square', 0.03)
      break
    case 'toggle':
      tone(420, 0, 0.06, 'sine', 0.04)
      break
    case 'correct':
      tone(523.25, 0, 0.12, 'sine', 0.06)
      tone(659.25, 0.1, 0.16, 'sine', 0.06)
      break
    case 'wrong':
      tone(220, 0, 0.16, 'sawtooth', 0.05)
      tone(174.6, 0.1, 0.2, 'sawtooth', 0.04)
      break
    case 'levelup':
      tone(523.25, 0, 0.1, 'sine', 0.06)
      tone(659.25, 0.09, 0.1, 'sine', 0.06)
      tone(783.99, 0.18, 0.22, 'sine', 0.07)
      break
    case 'start':
      tone(392, 0, 0.08, 'sine', 0.04)
      tone(494, 0.07, 0.12, 'sine', 0.05)
      break
  }
}

const EN_LEX: LexItem[] = [
  { es: 'casa', target: 'house', note: 'Sustantivo concreto; no "home" (hogar/sentimiento).', root: 'hous-', etymology: 'OE hūs < germánico *hūsą. Familia: housing, household, housewife.', lexemes: ['house'] },
  { es: 'libro', target: 'book', note: 'Cognado parcial; "library" es biblioteca, no librería.', root: 'book', etymology: 'OE bōc (haya/tabla escrita). library < lat. librarium (armario de libros).', lexemes: ['book'] },
  { es: 'agua', target: 'water', note: 'Germánico; no cognado latino directo en uso común.', root: 'wat-', etymology: 'OE wæter < PIE *wódr̥. Familia: waterfall, waterproof, watery.', lexemes: ['water'] },
  { es: 'amigo', target: 'friend', note: 'False friend informal: "amigo" en inglés coloquial ≠ solo friend formal.', root: 'friend', etymology: 'OE frēond < *frijōnd- (el que ama). Friendship, friendly, befriend.', lexemes: ['friend'] },
  { es: 'ciudad', target: 'city', note: 'Latín civitas → city; "town" es más pequeño.', root: 'cit-', etymology: 'OF cité < lat. cīvitās (ciudadanía). citizen, civic, civilization.', lexemes: ['cit', 'y'] },
  { es: 'tiempo', target: 'time', note: 'También "weather" según contexto (tiempo atmosférico).', root: 'tim-', etymology: 'OE tīma. timeline, timetable, timely. weather < OE weder.', lexemes: ['time'] },
  { es: 'mano', target: 'hand', note: 'Germánico; "manual" es cognado latino en adjetivo.', root: 'hand', etymology: 'OE hand. handbook, handmade, handle. manual < lat. manus.', lexemes: ['hand'] },
  { es: 'escuela', target: 'school', note: 'Griego via latín; cognado con school.', root: 'school', etymology: 'gr. skholḗ (ocio dedicado al estudio) → lat. schola. scholar, scholastic.', lexemes: ['school'] },
  { es: 'comida', target: 'food', note: 'No "meal" (comida como ocasión).', root: 'food', etymology: 'OE fōda. foodstuff, seafood. meal < OE mǣl (tiempo medido).', lexemes: ['food'] },
  { es: 'trabajo', target: 'work', note: 'También "job" (empleo concreto).', root: 'work', etymology: 'OE weorc. workforce, workplace, workable. job es préstamo posterior.', lexemes: ['work'] },
  { es: 'niño', target: 'child', note: 'Plural irregular: children.', root: 'child', etymology: 'OE cild. childhood, childish. Plural con -ren (arcaico).', lexemes: ['child'] },
  { es: 'mujer', target: 'woman', note: 'Plural irregular: women (pron. /ˈwɪmɪn/).', root: 'woman', etymology: 'OE wīfman (mujer-persona). women = plural histórico.', lexemes: ['wo', 'man'] },
  { es: 'hombre', target: 'man', note: 'Plural: men. "Human" es más genérico.', root: 'man', etymology: 'OE mann (persona). mankind, man-made. human < lat. hūmānus.', lexemes: ['man'] },
  { es: 'día', target: 'day', note: 'Germánico; "diary" es diario personal.', root: 'day', etymology: 'OE dæg. daytime, everyday. diary < lat. diārium.', lexemes: ['day'] },
  { es: 'noche', target: 'night', note: 'Cognado germánico con night.', root: 'night', etymology: 'OE niht < PIE *nókʷts. midnight, nightmare, overnight.', lexemes: ['night'] },
  { es: 'año', target: 'year', note: 'No confundir con "ano" (error ortográfico grave).', root: 'year', etymology: 'OE gēar. yearly, yearbook. annual < lat. annus.', lexemes: ['year'] },
  { es: 'mes', target: 'month', note: 'Cognado con month; "mess" es desorden.', root: 'month', etymology: 'OE mōnaþ (ligado a moon). monthly. mess ≠ month.', lexemes: ['month'] },
  { es: 'semana', target: 'week', note: 'Germánico week.', root: 'week', etymology: 'OE wice. weekday, weekend, weekly.', lexemes: ['week'] },
  { es: 'hoy', target: 'today', note: 'Compuesto to + day.', root: 'to-day', etymology: 'to (preposición) + day. Parallel: tonight, tomorrow.', lexemes: ['to', 'day'] },
  { es: 'mañana', target: 'tomorrow', note: 'También "morning" si es la parte del día.', root: 'to-morrow', etymology: 'to + morgen (mañana). morning = parte del día.', lexemes: ['to', 'morrow'] },
  { es: 'ayer', target: 'yesterday', note: 'Compuesto con day.', root: 'yester-day', etymology: 'OE geostran dæg. yester- = el anterior.', lexemes: ['yester', 'day'] },
  { es: 'grande', target: 'big', note: 'También "large"; "grand" es grandioso.', root: 'big', etymology: 'Origen dialéctico; large < OF large. grand < lat. grandis.', lexemes: ['big'] },
  { es: 'pequeño', target: 'small', note: 'También "little".', root: 'small', etymology: 'OE smæl. small-scale. little < OE lȳtel.', lexemes: ['small'] },
  { es: 'bueno', target: 'good', note: 'Adverbio irregular: well.', root: 'good', etymology: 'OE gōd. goodness, goodbye. well < OE wel (adverbio).', lexemes: ['good'] },
  { es: 'malo', target: 'bad', note: 'Adverbio: badly.', root: 'bad', etymology: 'ME badde. badly, badness. evil es más moral/fuerte.', lexemes: ['bad'] },
  { es: 'rápido', target: 'fast', note: 'También "quick"; "rapid" más formal/técnico.', root: 'fast', etymology: 'OE fæst (firme → rápido). fasten. rapid < lat. rapidus.', lexemes: ['fast'] },
  { es: 'lento', target: 'slow', note: 'Adverbio: slowly.', root: 'slow', etymology: 'OE slāw. slowly, slowdown.', lexemes: ['slow'] },
  { es: 'caliente', target: 'hot', note: 'Comida o temperatura; "warm" es tibio.', root: 'hot', etymology: 'OE hāt. hotspot, hotly. warm < OE wearm.', lexemes: ['hot'] },
  { es: 'frío', target: 'cold', note: 'Adjetivo y sustantivo.', root: 'cold', etymology: 'OE cald. coldness, cold-blooded.', lexemes: ['cold'] },
  { es: 'feliz', target: 'happy', note: 'No "lucky" (afortunado).', root: 'happ-', etymology: 'ME hap (suerte) + -y. happiness, happen. lucky = afortunado.', lexemes: ['happ', 'y'] },
  { es: 'triste', target: 'sad', note: 'Cognado no transparente.', root: 'sad', etymology: 'OE sæd (saciado → serio → triste). sadness, sadden.', lexemes: ['sad'] },
  { es: 'hablar', target: 'speak', note: 'También "talk"; "speak" más lenguas/formal.', root: 'speak', etymology: 'OE specan. speaker, speech. talk < ME talken.', lexemes: ['speak'] },
  { es: 'comer', target: 'eat', note: 'Germánico eat.', root: 'eat', etymology: 'OE etan. eater, edible (lat. ed-). past: ate; pp: eaten.', lexemes: ['eat'] },
  { es: 'beber', target: 'drink', note: 'Verbo y sustantivo.', root: 'drink', etymology: 'OE drincan. drinkable, drunk (pp/adj).', lexemes: ['drink'] },
  { es: 'dormir', target: 'sleep', note: 'Germánico sleep.', root: 'sleep', etymology: 'OE slǣpan. sleeper, sleepy, asleep.', lexemes: ['sleep'] },
  { es: 'correr', target: 'run', note: 'Pasado irregular: ran.', root: 'run', etymology: 'OE rinnan. runner, runway. past: ran; pp: run.', lexemes: ['run'] },
  { es: 'caminar', target: 'walk', note: 'No "path" (camino).', root: 'walk', etymology: 'OE wealcan (rodar). walker, walkway. path = sendero.', lexemes: ['walk'] },
  { es: 'leer', target: 'read', note: 'Pasado homógrafo read /red/.', root: 'read', etymology: 'OE rǣdan (aconsejar/interpretar). reader, reading, readable.', lexemes: ['read'] },
  { es: 'escribir', target: 'write', note: 'Pasado: wrote; participio written.', root: 'writ-', etymology: 'OE wrītan (rayar). writer, writing, written. script < lat. scribere.', lexemes: ['writ', 'e'] },

  { es: 'pensar', target: 'think', note: 'Pasado: thought.', root: 'think', etymology: 'OE þencan. thought (n/v), thoughtful, rethink.', lexemes: ['think'] },
  { es: 'saber', target: 'know', note: 'Pasado: knew; "know how" = saber hacer.', root: 'know', etymology: 'OE cnāwan. knowledge, known, acknowledge.', lexemes: ['know'] },
  { es: 'poder', target: 'can', note: 'Modal; pasado could.', root: 'can', etymology: 'OE cunnan (saber/poder). could, cannot. capacity < lat.', lexemes: ['can'] },
  { es: 'querer', target: 'want', note: 'También "love" en contextos afectivos fuertes.', root: 'want', etymology: 'ON vanta (faltar). wanting. desire < lat. dēsīderāre.', lexemes: ['want'] },
  { es: 'deber', target: 'must', note: 'También "should" (consejo) / "ought".', root: 'must', etymology: 'OE mōste. should < shall; ought < āgan (poseer).', lexemes: ['must'] },
  { es: 'hacer', target: 'do', note: 'También "make" (crear/fabricar).', root: 'do', etymology: 'OE dōn. does, did, done. make < OE macian (fabricar).', lexemes: ['do'] },
  { es: 'ir', target: 'go', note: 'Pasado: went; participio gone.', root: 'go', etymology: 'OE gān. going, gone. went < wendan (supletivo).', lexemes: ['go'] },
  { es: 'venir', target: 'come', note: 'Pasado: came.', root: 'come', etymology: 'OE cuman. coming, become, outcome.', lexemes: ['come'] },
  { es: 'ver', target: 'see', note: 'Pasado: saw; "watch" es mirar con atención.', root: 'see', etymology: 'OE sēon. sight, foresee. watch < OE wæccan.', lexemes: ['see'] },
  { es: 'oír', target: 'hear', note: 'Pasado: heard; "listen" es escuchar activamente.', root: 'hear', etymology: 'OE hīeran. hearing, hearsay. listen < OE hlysnan.', lexemes: ['hear'] },
  { es: 'porque', target: 'because', note: 'Causal; "why" es la pregunta.', root: 'be-cause', etymology: 'by + cause < lat. causa. because of + N.', lexemes: ['be', 'cause'] },
  { es: 'aunque', target: 'although', note: 'También "though" / "even though".', root: 'al-though', etymology: 'all + though. though < OE þēah.', lexemes: ['al', 'though'] },
  { es: 'siempre', target: 'always', note: 'Frecuencia 100%.', root: 'al-ways', etymology: 'all + ways (en todo camino). forever más absoluto.', lexemes: ['al', 'ways'] },
  { es: 'nunca', target: 'never', note: 'Doble negación en inglés estándar se evita.', root: 'n-ever', etymology: 'ne + ever. never ever enfático. not + anything (no double neg).', lexemes: ['n', 'ever'] },
  { es: 'aquí', target: 'here', note: 'Opuesto there.', root: 'here', etymology: 'OE hēr. hereby, hereafter. there < þǣr.', lexemes: ['here'] },
  { es: 'allí', target: 'there', note: 'Existencial: there is/are.', root: 'there', etymology: 'OE þǣr. therefore, thereby. there is/are = existencia.', lexemes: ['there'] },
  { es: 'nación', target: 'nation', note: 'Sufijo -tion de origen latino; cognado transparente.', root: 'nat-', etymology: 'lat. nātiō < nāscī (nacer). national, native, international. -tion = sustantivo abstracto.', lexemes: ['nat', 'ion'] },
  { es: 'información', target: 'information', note: 'Incontable en inglés: no "informations".', root: 'form-', etymology: 'lat. īnformātiō < īnformāre (dar forma). informative, inform. -ation abstracto; incontable.', lexemes: ['in', 'form', 'ation'] },
  { es: 'decisión', target: 'decision', note: 'Sufijo -sion; verbo decide.', root: 'cid-/cis-', etymology: 'lat. dēcīsiō < dēcīdere (cortar). decisive, concise. -sion tras base en -d/-t.', lexemes: ['de', 'cis', 'ion'] },
  { es: 'posible', target: 'possible', note: 'Sufijo -ible/-able de posibilidad.', root: 'poss-', etymology: 'lat. possibilis < posse (poder). possibility, impossible. -ible = capaz de.', lexemes: ['poss', 'ible'] },
  { es: 'realidad', target: 'reality', note: 'Sufijo -ity; adjetivo real.', root: 'real-', etymology: 'lat. reālitās < rēs (cosa). realistic, realize. -ity = cualidad abstracta.', lexemes: ['real', 'ity'], phoneticEs: 'ri-Á-li-ti (el acento cae en la segunda sílaba, no en la primera como en español).', topic: 'abstracto' },

  // ---- Unidad: números y cantidad ----
  { es: 'uno', target: 'one', note: 'Se escribe "one" pero la w- inicial es muda: suena /wʌn/.', root: 'one', etymology: 'OE ān < PIE *oi-no-. alone (all + one), only, once.', lexemes: ['one'], phoneticEs: 'wan (como "wan", con la w de "web").', topic: 'números' },
  { es: 'dos', target: 'two', note: 'La w es muda: suena igual que "too" y "to".', root: 'two', etymology: 'OE twā < PIE *dwóh. twin, twice, between.', lexemes: ['two'], phoneticEs: 'tu (idéntico a "too").', topic: 'números' },
  { es: 'tres', target: 'three', note: 'El sonido "th" no existe en español: lengua entre los dientes.', root: 'three', etymology: 'OE þrēo < PIE *tréyes. third, threefold.', lexemes: ['three'], phoneticEs: 'zrí, con la lengua asomando entre los dientes al decir la "z".', topic: 'números' },
  { es: 'diez', target: 'ten', note: 'Cognado lejano de "diez" vía la raíz indoeuropea *dekm̥.', root: 'ten', etymology: 'OE tīen < PIE *dekm̥. tenth, ten-year.', lexemes: ['ten'], phoneticEs: 'ten.', topic: 'números' },
  { es: 'cien', target: 'hundred', note: 'No es cognado directo de "ciento"; ese es "cent-" (century, percent).', root: 'hund-', etymology: 'OE hundred < PIE *dkm̥tóm. hundredth. cent- < lat. centum, mismo origen indoeuropeo por otra vía.', lexemes: ['hund', 'red'], phoneticEs: 'JÁN-dred.', topic: 'números' },
  { es: 'primero', target: 'first', note: 'Superlativo irregular; no sigue el patrón -est de "fastest".', root: 'first', etymology: 'OE fyrst, superlativo de fore (delante). foremost.', lexemes: ['first'], phoneticEs: 'ferst (la "r" se pronuncia suave, casi fundida en la vocal).', topic: 'números' },
  { es: 'último', target: 'last', note: 'También significa "durar" como verbo (to last).', root: 'last', etymology: 'OE latost, superlativo de late (tarde). lasting.', lexemes: ['last'], phoneticEs: 'last.', topic: 'números' },

  // ---- Unidad: familia y personas ----
  { es: 'padre', target: 'father', note: 'Cognado indoeuropeo con "padre" (ambos de *pətḗr).', root: 'father', etymology: 'OE fæder < PIE *pətḗr. paternal < lat. pater (misma raíz, otra vía).', lexemes: ['father'], phoneticEs: 'FÁ-der (la "th" se pronuncia con la lengua entre los dientes, como una "d" suave).', topic: 'familia' },
  { es: 'madre', target: 'mother', note: 'Cognado con "madre" vía la raíz *méh₂tēr.', root: 'mother', etymology: 'OE mōdor < PIE *méh₂tēr. maternal < lat. mater.', lexemes: ['mother'], phoneticEs: 'MÁ-der.', topic: 'familia' },
  { es: 'hermano', target: 'brother', note: 'Cognado con "hermano" no; con "fraterno" sí (misma raíz PIE).', root: 'brother', etymology: 'OE brōþor < PIE *bʰréh₂tēr. brotherhood. fraternal < lat. frater.', lexemes: ['brother'], phoneticEs: 'BRÁ-der.', topic: 'familia' },
  { es: 'hermana', target: 'sister', note: 'Préstamo nórdico que desplazó a la forma nativa OE sweostor.', root: 'sister', etymology: 'ON systir < PIE *swésōr. sisterhood.', lexemes: ['sister'], phoneticEs: 'SÍS-ter.', topic: 'familia' },
  { es: 'hijo/hija', target: 'child / son / daughter', note: '"Child" es genérico; "son" e hijo varón, "daughter" hija.', root: 'child', etymology: 'son < OE sunu (PIE *suHnús). daughter < OE dohtor.', lexemes: ['son', 'daughter'], phoneticEs: 'san / DÓ-ter (la "gh" de daughter no suena).', topic: 'familia' },
  { es: 'amor', target: 'love', note: 'La v suena suave, casi entre v y f muy sonora del español.', root: 'love', etymology: 'OE lufu < PIE *lewbʰ- (desear). lovely, beloved.', lexemes: ['love'], phoneticEs: 'lav (rima con "of").', topic: 'emociones' },
  { es: 'miedo', target: 'fear', note: 'También "afraid" como adjetivo (to be afraid of).', root: 'fear', etymology: 'OE fǣr (peligro súbito). fearful, fearless.', lexemes: ['fear'], phoneticEs: 'fíer.', topic: 'emociones' },
  { es: 'enojado', target: 'angry', note: 'De "anger" (ira), préstamo nórdico.', root: 'ang-', etymology: 'ON angr (aflicción) + -y. anger, angrily.', lexemes: ['angr', 'y'], phoneticEs: 'ÁN-gri.', topic: 'emociones' },

  // ---- Unidad: cuerpo y salud ----
  { es: 'cabeza', target: 'head', note: 'No confundir con "heat" (calor): distinta vocal.', root: 'head', etymology: 'OE hēafod < PIE *kaput-. heading, headache.', lexemes: ['head'], phoneticEs: 'jed (la "ea" suena como "e" corta, no como "i").', topic: 'cuerpo' },
  { es: 'corazón', target: 'heart', note: 'La r no se pronuncia con fuerza en inglés británico.', root: 'heart', etymology: 'OE heorte < PIE *ḱḗr. heartbeat, sweetheart.', lexemes: ['heart'], phoneticEs: 'jart.', topic: 'cuerpo' },
  { es: 'salud', target: 'health', note: 'Emparentado con "whole" (entero/sano).', root: 'heal-', etymology: 'OE hǣlþ < hāl (entero, sano). healthy, healthcare.', lexemes: ['heal', 'th'], phoneticEs: 'jelz (la "th" final se pronuncia con la lengua entre los dientes).', topic: 'cuerpo' },
  { es: 'enfermo', target: 'sick / ill', note: '"Sick" más común en AmE cotidiano; "ill" más formal/BrE.', root: 'sick', etymology: 'OE sēoc. sickness. ill < ON illr (malo).', lexemes: ['sick'], phoneticEs: 'sik.', topic: 'cuerpo' },

  // ---- Unidad: tecnología y mundo moderno ----
  { es: 'computadora', target: 'computer', note: 'Del verbo "to compute" (calcular), del latín.', root: 'comput-', etymology: 'lat. computare (calcular con) < com- + putare (pensar/contar). computation, computing.', lexemes: ['com', 'put', 'er'], phoneticEs: 'kom-PIÚ-ter.', topic: 'tecnología' },
  { es: 'teléfono', target: 'phone / telephone', note: 'Del griego: tele (lejos) + phone (sonido).', root: 'phone', etymology: 'gr. tēle (lejos) + phōnē (voz/sonido), acuñado en el s. XIX. telephone, microphone, symphony.', lexemes: ['tele', 'phone'], phoneticEs: 'foun (la "ph" suena como "f").', topic: 'tecnología' },
  { es: 'internet', target: 'internet', note: 'Compuesto moderno: inter- (entre) + net (red), de 1974.', root: 'inter-net', etymology: 'lat. inter (entre) + OE net (red de pescar). Acuñado como "interconnected network" en los años 70.', lexemes: ['inter', 'net'], phoneticEs: 'ÍN-ter-net.', topic: 'tecnología' },
  { es: 'contraseña', target: 'password', note: 'Compuesto transparente: pass (pasar) + word (palabra).', root: 'pass-word', etymology: 'pass < OF passer + OE word. Uso moderno desde la informática del s. XX.', lexemes: ['pass', 'word'], phoneticEs: 'PÁS-uord.', topic: 'tecnología' },
  { es: 'pantalla', target: 'screen', note: 'Originalmente "biombo/mampara" antes de significar pantalla.', root: 'screen', etymology: 'OF escren (mampara contra el fuego). Sentido de "pantalla de proyección" desde el s. XIX–XX.', lexemes: ['screen'], phoneticEs: 'skrin.', topic: 'tecnología' },

  // ---- Unidad: trabajo y negocios ----
  { es: 'empresa', target: 'company / business', note: '"Company" = compañía; "business" = negocio/actividad.', root: 'compan-', etymology: 'company < lat. companio (com- + panis, "el que comparte pan"). business < OE bisig (ocupado).', lexemes: ['com', 'pan', 'y'], phoneticEs: 'KÁM-pa-ni.', topic: 'trabajo' },
  { es: 'reunión', target: 'meeting', note: 'Del verbo "to meet" (encontrarse) + -ing.', root: 'meet', etymology: 'OE mētan (encontrar). meeting, meet up.', lexemes: ['meet', 'ing'], phoneticEs: 'MÍ-ting.', topic: 'trabajo' },
  { es: 'sueldo', target: 'salary', note: 'Del latín "sal" (sal): en Roma parte del pago era en sal.', root: 'sal-', etymology: 'lat. salarium (ración de sal para soldados) < sal. salaried.', lexemes: ['sal', 'ary'], phoneticEs: 'SÁ-la-ri.', topic: 'trabajo' },
  { es: 'jefe', target: 'boss', note: 'Préstamo del neerlandés "baas" en el inglés americano colonial.', root: 'boss', etymology: 'del neerlandés baas (maestro/patrón), incorporado en el s. XVII en Norteamérica.', lexemes: ['boss'], phoneticEs: 'bos.', topic: 'trabajo' },

  // ---- Unidad: viajes ----
  { es: 'viaje', target: 'trip / journey', note: '"Trip" es corto/informal; "journey" más largo/con proceso.', root: 'journ-', etymology: 'journey < OF journée (lo que dura un día) < lat. diurnus (diario).', lexemes: ['journ', 'ey'], phoneticEs: 'YIÓR-ni (la "j" inglesa suena como la "y" fuerte argentina).', topic: 'viajes' },
  { es: 'aeropuerto', target: 'airport', note: 'Compuesto moderno: air (aire) + port (puerto).', root: 'air-port', etymology: 'air < OF air < lat. aer. port < lat. portus. Palabra acuñada con la aviación, s. XX.', lexemes: ['air', 'port'], phoneticEs: 'ÉR-port.', topic: 'viajes' },
  { es: 'equipaje', target: 'luggage / baggage', note: '"Luggage" más BrE; "baggage" más AmE (y también sentido figurado).', root: 'lug-', etymology: 'luggage < to lug (arrastrar con esfuerzo) + -age. baggage < OF bagage.', lexemes: ['lug', 'age'], phoneticEs: 'LÁ-guish.', topic: 'viajes' },
  { es: 'pasaporte', target: 'passport', note: 'Compuesto: pass (pasar) + port (puerto), documento para pasar puertos.', root: 'pass-port', etymology: 'OF passeport, para autorizar el paso por puertos fortificados, s. XV.', lexemes: ['pass', 'port'], phoneticEs: 'PÁS-port.', topic: 'viajes' },

  // ---- Unidad: phrasal verbs esenciales ----
  { es: 'rendirse / darse por vencido', target: 'give up', note: 'Phrasal verb: give (dar) + up (arriba/completamente).', root: 'give-up', etymology: 'give < OE giefan. up < OE up. El sentido idiomático "abandonar" se fija en inglés medio.', lexemes: ['give', 'up'], phoneticEs: 'guiv ap.', topic: 'phrasal verbs' },
  { es: 'buscar (información)', target: 'look up', note: 'Phrasal verb: look (mirar) + up, buscar en una fuente.', root: 'look-up', etymology: 'look < OE lōcian. Sentido de "consultar" desde el uso con diccionarios, s. XIX.', lexemes: ['look', 'up'], phoneticEs: 'luk ap.', topic: 'phrasal verbs' },
  { es: 'seguir adelante', target: 'go on', note: 'Phrasal verb: go (ir) + on (continuidad).', root: 'go-on', etymology: 'go < OE gān. on < OE on/an.', lexemes: ['go', 'on'], phoneticEs: 'gou on.', topic: 'phrasal verbs' },
  { es: 'despegar (avión) / triunfar', target: 'take off', note: 'Phrasal verb: take (tomar) + off (fuera/separación).', root: 'take-off', etymology: 'take < ON taka. off < OE of (variante acentuada de "of").', lexemes: ['take', 'off'], phoneticEs: 'teik of.', topic: 'phrasal verbs' },
  { es: 'aparecer / presentarse', target: 'show up', note: 'Phrasal verb coloquial: show (mostrar) + up.', root: 'show-up', etymology: 'show < OE scēawian (mirar/mostrar). Uso coloquial "presentarse" desde el s. XIX en EE. UU.', lexemes: ['show', 'up'], phoneticEs: 'shóu ap.', topic: 'phrasal verbs' },

  // ---- Unidad: vocabulario abstracto y académico (greco-latino) ----
  { es: 'democracia', target: 'democracy', note: 'Griego: demos (pueblo) + kratos (poder/gobierno).', root: 'demo-', etymology: 'gr. dēmokratía < dēmos (pueblo) + krátos (poder), s. V a. C. en Atenas; entra al inglés vía el francés en el s. XVI.', lexemes: ['demo', 'cracy'], phoneticEs: 'di-MÓ-kra-si.', topic: 'academia' },
  { es: 'biología', target: 'biology', note: 'Griego: bios (vida) + logos (estudio), acuñado en 1802.', root: 'bio-', etymology: 'gr. bíos (vida) + lógos (palabra/estudio). Acuñado como término científico moderno a principios del s. XIX.', lexemes: ['bio', 'logy'], phoneticEs: 'bai-Ó-lo-yi.', topic: 'academia' },
  { es: 'psicología', target: 'psychology', note: 'Griego: psyche (alma/mente) + logos (estudio).', root: 'psycho-', etymology: 'gr. psȳkhḗ (alma, aliento) + lógos. La "p" inicial es muda en inglés.', lexemes: ['psycho', 'logy'], phoneticEs: 'sai-KÓ-lo-yi (la "p" no suena).', topic: 'academia' },
  { es: 'tecnología', target: 'technology', note: 'Griego: techne (arte/oficio) + logos (estudio).', root: 'techno-', etymology: 'gr. tékhnē (arte, destreza) + lógos. Uso moderno consolidado en el s. XX.', lexemes: ['techno', 'logy'], phoneticEs: 'tek-NÓ-lo-yi.', topic: 'academia' },
  { es: 'economía', target: 'economy', note: 'Griego: oikos (casa) + nomos (ley/administración).', root: 'eco-', etymology: 'gr. oikonomía < oîkos (casa) + nómos (ley). economic, economics.', lexemes: ['eco', 'nomy'], phoneticEs: 'i-KÓ-no-mi.', topic: 'academia' },
  { es: 'importante', target: 'important', note: 'Del latín "importare" (traer consigo, tener peso).', root: 'import-', etymology: 'lat. importare < in- + portare (llevar). importance, importantly.', lexemes: ['im', 'port', 'ant'], phoneticEs: 'im-PÓR-tant.', topic: 'academia' },
  { es: 'diferente', target: 'different', note: 'Del latín "differre" (llevar en direcciones distintas).', root: 'differ-', etymology: 'lat. differre < dis- (aparte) + ferre (llevar). difference, differently.', lexemes: ['dif', 'fer', 'ent'], phoneticEs: 'DÍ-fe-rent.', topic: 'academia' },
  { es: 'necesario', target: 'necessary', note: 'Del latín "necesse" (ineludible).', root: 'necess-', etymology: 'lat. necessarius < necesse (inevitable). necessity, unnecessary.', lexemes: ['necess', 'ary'], phoneticEs: 'NÉ-se-se-ri.', topic: 'academia' },

  // ---- Unidad: verbos irregulares de alta frecuencia ----
  { es: 'ir', target: 'go', note: 'Pasado "went" y participio "gone": went no viene de "go" sino de otro verbo antiguo (wend). Presente: go/goes; pasado: went; participio: gone.', root: 'go', etymology: 'OE gān (presente) + wendan (pasado, "wend"). Con el tiempo "went" reemplazó al pasado original de go. Caso único de supleción total en inglés.', lexemes: ['go', 'went', 'gone'], phoneticEs: 'gou (pasado: uent; participio: gon).', topic: 'verbos irregulares' },
  { es: 'ser/estar', target: 'be', note: 'El verbo más irregular del inglés: am/is/are en presente, was/were en pasado, been en participio.', root: 'be', etymology: 'OE bēon, wesan, y otras raíces fusionadas en un solo paradigma muy irregular por herencia germánica antigua.', lexemes: ['be', 'was', 'were', 'been'], phoneticEs: 'bi (pasado: uaz/uér; participio: bin).', topic: 'verbos irregulares' },
  { es: 'tener', target: 'have', note: 'Pasado y participio idénticos: had. Presente 3.ª persona: has.', root: 'have', etymology: 'OE habban < PIE *kap- (agarrar). Cognado lejano con "capturar".', lexemes: ['have', 'had'], phoneticEs: 'jav (pasado y participio: jad).', topic: 'verbos irregulares' },
  { es: 'hacer', target: 'do', note: 'No confundir con "make" (fabricar/crear); "do" es hacer una acción/actividad. Pasado: did; participio: done.', root: 'do', etymology: 'OE dōn < PIE *dʰeh₁- (poner, hacer). Cognado con el griego thesis.', lexemes: ['do', 'did', 'done'], phoneticEs: 'du (pasado: did; participio: dan).', topic: 'verbos irregulares' },
  { es: 'ver', target: 'see', note: 'Cambio vocálico (ablaut) típico de verbos germánicos fuertes. Pasado: saw; participio: seen.', root: 'see', etymology: 'OE sēon < PIE *sekʷ- (percibir/ver). El pasado "saw" muestra el patrón ablaut e→a→e del inglés antiguo.', lexemes: ['see', 'saw', 'seen'], phoneticEs: 'si (pasado: so; participio: sin).', topic: 'verbos irregulares' },
  { es: 'venir', target: 'come', note: 'Presente y participio comparten la misma forma escrita: come. Pasado: came.', root: 'come', etymology: 'OE cuman < PIE *gʷem- (ir/venir). Cognado remoto con "venir" por otra rama indoeuropea distinta.', lexemes: ['come', 'came'], phoneticEs: 'kam (pasado: kéim).', topic: 'verbos irregulares' },
  { es: 'tomar/llevar', target: 'take', note: 'Préstamo nórdico que desplazó verbos nativos ingleses más antiguos. Pasado: took; participio: taken.', root: 'take', etymology: 'ON taka, incorporado en la época vikinga (s. IX–XI), reemplazando gradualmente al verbo nativo OE niman.', lexemes: ['take', 'took', 'taken'], phoneticEs: 'téik (pasado: tuk; participio: téiken).', topic: 'verbos irregulares' },
  { es: 'dar', target: 'give', note: 'También préstamo nórdico antiguo, como "take". Pasado: gave; participio: given.', root: 'give', etymology: 'ON gefa, reforzando o reemplazando al nativo OE giefan en dialectos del norte de Inglaterra.', lexemes: ['give', 'gave', 'given'], phoneticEs: 'guiv (pasado: guéiv; participio: guíven).', topic: 'verbos irregulares' },
  { es: 'saber/conocer', target: 'know', note: 'La "k" inicial es muda: se pronuncia como si empezara con "n". Pasado: knew; participio: known.', root: 'know', etymology: 'OE cnāwan < PIE *ǵneh₃- (conocer). Cognado directo con el latín (g)noscere, origen de "conocer".', lexemes: ['know', 'knew', 'known'], phoneticEs: 'nóu, la "k" no suena (pasado: niú; participio: nóun).', topic: 'verbos irregulares' },
  { es: 'pensar', target: 'think', note: 'Pasado y participio irregulares idénticos: thought, con cambio total de forma.', root: 'think', etymology: 'OE þencan < PIE *tong- (sentir/pensar). El pasado "thought" conserva una forma muy antigua del inglés medieval.', lexemes: ['think', 'thought'], phoneticEs: 'zink (pasado y participio: zot, con la "z" de lengua entre dientes).', topic: 'verbos irregulares' },

  // ---- Unidad: conectores y marcadores discursivos ----
  { es: 'sin embargo', target: 'however', note: 'Conector de contraste, más formal que "but"; suele ir con coma y a menudo abre frase.', root: 'how-ever', etymology: 'how (OE hū) + ever (OE æfre): "de cualquier manera que sea" > sentido concesivo/contrastivo desde el inglés medio.', lexemes: ['how', 'ever'], phoneticEs: 'jau-É-ver.', topic: 'conectores' },
  { es: 'por lo tanto', target: 'therefore', note: 'Conector de consecuencia lógica, típico de textos formales y académicos.', root: 'there-fore', etymology: 'there (OE þǣr) + for (por causa de). Literalmente "por eso/por aquello".', lexemes: ['there', 'fore'], phoneticEs: 'DÉR-for.', topic: 'conectores' },
  { es: 'aunque', target: 'although', note: 'Más formal que "though" y suele ir al inicio de la frase; "though" es más informal y puede ir al final.', root: 'al-though', etymology: 'all + though (OE þēah, "aun si"). El prefijo "al-" refuerza el sentido concesivo.', lexemes: ['al', 'though'], phoneticEs: 'ol-ZÓU.', topic: 'conectores' },
  { es: 'además', target: 'moreover', note: 'Añade información con énfasis formal; sinónimo cercano: "furthermore" (aún más formal).', root: 'more-over', etymology: 'more (más) + over (encima): "por encima/más allá de lo dicho".', lexemes: ['more', 'over'], phoneticEs: 'mor-ÓU-ver.', topic: 'conectores' },
  { es: 'mientras tanto', target: 'meanwhile', note: 'Marcador temporal de simultaneidad entre dos acciones o escenas.', root: 'mean-while', etymology: 'mean (intermedio, OF meien) + while (OE hwīl, "espacio de tiempo").', lexemes: ['mean', 'while'], phoneticEs: 'MIN-uail.', topic: 'conectores' },
  { es: 'a pesar de', target: 'despite', note: 'Va directo + sustantivo/gerundio, sin "of"; su sinónimo "in spite of" sí lleva preposición extra.', root: 'de-spite', etymology: 'despite < OF despit < lat. despectus (menosprecio); el sentido concesivo moderno surge en inglés medio.', lexemes: ['de', 'spite'], phoneticEs: 'dis-PÁIT.', topic: 'conectores' },

  // ---- Unidad: preposiciones clave ----
  { es: 'entre (dos)', target: 'between', note: 'Se usa para exactamente dos elementos; para tres o más se usa "among".', root: 'be-tween', etymology: 'OE betwēonum < be- + twēon (dos). Relacionado con "two".', lexemes: ['be', 'tween'], phoneticEs: 'bi-TUÍN.', topic: 'preposiciones' },
  { es: 'entre (varios)', target: 'among', note: 'Para tres o más elementos o un grupo indiferenciado; no se usa para exactamente dos.', root: 'a-mong', etymology: 'OE on gemonge ("en medio de la mezcla") < mengan (mezclar).', lexemes: ['a', 'mong'], phoneticEs: 'a-MÁNG.', topic: 'preposiciones' },
  { es: 'durante', target: 'during', note: 'Se usa con un periodo de tiempo (during the summer), no con una duración numérica (esa es "for").', root: 'dur-ing', etymology: 'de "to dure" (durar) < lat. durare + -ing. Originalmente participio de un verbo hoy caído en desuso.', lexemes: ['dur', 'ing'], phoneticEs: 'DIÚ-ring.', topic: 'preposiciones' },
  { es: 'desde (tiempo)', target: 'since', note: 'Marca el punto de inicio de una acción que continúa; se combina con present perfect.', root: 'since', etymology: 'OE siððan ("después de que"), contraído en inglés medio a "since".', lexemes: ['since'], phoneticEs: 'sins.', topic: 'preposiciones' },
  { es: 'hasta', target: 'until', note: 'Sinónimo más informal/hablado: "till". "Until" es neutro y también puede abrir frase.', root: 'un-til', etymology: 'ON til (hasta) + un- intensivo, fusionado en inglés medio.', lexemes: ['un', 'til'], phoneticEs: 'an-TÍL.', topic: 'preposiciones' },
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
  { es: 'rápido', target: 'rapide', note: 'Adjetivo; adverbio rapidement.' },
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
  { es: 'nación', target: 'nation', note: 'Femenino: la nation. Sufijo -tion.' },
  { es: 'información', target: 'information', note: 'Femenino; incontable frecuentemente.' },
  { es: 'decisión', target: 'décision', note: 'Femenino; verbo décider.' },
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
  { es: 'japonés', target: '日本語 (にほんご)', note: 'にほんご idioma; 日本人 persona.' },
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

const PT_LEX: LexItem[] = [
  { es: 'casa', target: 'casa', note: 'Misma forma; género femenino: a casa.' },
  { es: 'libro', target: 'livro', note: 'Masculino: o livro. Cognado transparente.' },
  { es: 'agua', target: 'água', note: 'Femenino: a água. Acento en la a.' },
  { es: 'amigo', target: 'amigo', note: 'amigo/amiga. Igual que en español.' },
  { es: 'ciudad', target: 'cidade', note: 'Femenino: a cidade.' },
  { es: 'tiempo', target: 'tempo', note: 'También clima: o tempo.' },
  { es: 'mano', target: 'mão', note: 'Femenino: a mão. Nasal ão.' },
  { es: 'escuela', target: 'escola', note: 'Femenino: a escola.' },
  { es: 'comida', target: 'comida', note: 'También refeição (comida como ocasión).' },
  { es: 'trabajo', target: 'trabalho', note: 'Masculino: o trabalho.' },
  { es: 'niño', target: 'criança', note: 'Epiceno frecuente; menino/menina también.' },
  { es: 'mujer', target: 'mulher', note: 'Femenino.' },
  { es: 'hombre', target: 'homem', note: 'Masculino; plural homens.' },
  { es: 'día', target: 'dia', note: 'Masculino: o dia.' },
  { es: 'noche', target: 'noite', note: 'Femenino: a noite.' },
  { es: 'año', target: 'ano', note: 'Masculino: o ano.' },
  { es: 'mes', target: 'mês', note: 'Acento circunflejo; plural meses.' },
  { es: 'semana', target: 'semana', note: 'Femenino.' },
  { es: 'hoy', target: 'hoje', note: 'Adverbio.' },
  { es: 'mañana', target: 'amanhã', note: 'Nasal; manhã = mañana (parte del día).' },
  { es: 'ayer', target: 'ontem', note: 'Adverbio.' },
  { es: 'grande', target: 'grande', note: 'Invariable en género en singular.' },
  { es: 'pequeño', target: 'pequeno', note: 'pequeno/pequena.' },
  { es: 'bueno', target: 'bom', note: 'bom/boa; adverbio bem.' },
  { es: 'malo', target: 'mau', note: 'mau/má; también ruim.' },
  { es: 'hablar', target: 'falar', note: 'Regular en -ar.' },
  { es: 'comer', target: 'comer', note: 'Regular en -er.' },
  { es: 'beber', target: 'beber', note: 'Regular en -er.' },
  { es: 'dormir', target: 'dormir', note: 'Irregular: durmo, dormes…' },
  { es: 'leer', target: 'ler', note: 'Irregular: leio, lês, lê…' },
  { es: 'escribir', target: 'escrever', note: 'Regular en -er.' },
  { es: 'ir', target: 'ir', note: 'Muy irregular: vou, vais, vai…' },
  { es: 'venir', target: 'vir', note: 'Irregular: venho, vens…' },
  { es: 'ver', target: 'ver', note: 'Irregular: vejo, vês…' },
  { es: 'porque', target: 'porque', note: 'Causal; por que en preguntas.' },
  { es: 'aunque', target: 'embora / ainda que', note: 'Aunque + subjuntivo frecuente.' },
  { es: 'siempre', target: 'sempre', note: 'Frecuencia.' },
  { es: 'nunca', target: 'nunca', note: 'Negación.' },
  { es: 'aquí', target: 'aqui', note: 'aí / ali según distancia.' },
  { es: 'gracias', target: 'obrigado / obrigada', note: 'Concuerda con el género de quien agradece.' },
  { es: 'por favor', target: 'por favor', note: 'Igual que en español.' },
  { es: 'sí', target: 'sim', note: 'Afirmación.' },
  { es: 'no', target: 'não', note: 'Nasal ão.' },
  { es: 'nación', target: 'nação', note: 'Femenino: a nação. Sufijo -ção.' },
  { es: 'información', target: 'informação', note: 'Femenino; plural informações.' },
  { es: 'decisión', target: 'decisão', note: 'Femenino; verbo decidir.' },
  { es: 'nosotros (BR coloquial)', target: 'a gente', note: 'A gente + 3.ª persona singular en Brasil.' },
]

const DE_LEX: LexItem[] = [
  { es: 'casa', target: 'Haus', note: 'Neutro: das Haus. Plural Häuser.' },
  { es: 'libro', target: 'Buch', note: 'Neutro: das Buch. Plural Bücher.' },
  { es: 'agua', target: 'Wasser', note: 'Neutro: das Wasser.' },
  { es: 'amigo', target: 'Freund', note: 'Freund/Freundin según género.' },
  { es: 'ciudad', target: 'Stadt', note: 'Femenino: die Stadt. Plural Städte.' },
  { es: 'tiempo', target: 'Zeit', note: 'Femenino: die Zeit. También Wetter (clima).' },
  { es: 'mano', target: 'Hand', note: 'Femenino: die Hand. Plural Hände.' },
  { es: 'escuela', target: 'Schule', note: 'Femenino: die Schule.' },
  { es: 'comida', target: 'Essen', note: 'Neutro; también Nahrung.' },
  { es: 'trabajo', target: 'Arbeit', note: 'Femenino: die Arbeit.' },
  { es: 'niño', target: 'Kind', note: 'Neutro: das Kind. Plural Kinder.' },
  { es: 'mujer', target: 'Frau', note: 'Femenino: die Frau.' },
  { es: 'hombre', target: 'Mann', note: 'Masculino: der Mann. Plural Männer.' },
  { es: 'día', target: 'Tag', note: 'Masculino: der Tag.' },
  { es: 'noche', target: 'Nacht', note: 'Femenino: die Nacht. Plural Nächte.' },
  { es: 'año', target: 'Jahr', note: 'Neutro: das Jahr.' },
  { es: 'mes', target: 'Monat', note: 'Masculino: der Monat.' },
  { es: 'semana', target: 'Woche', note: 'Femenino: die Woche.' },
  { es: 'hoy', target: 'heute', note: 'Adverbio.' },
  { es: 'mañana', target: 'morgen', note: 'También Morgen (sustantivo, mañana del día).' },
  { es: 'ayer', target: 'gestern', note: 'Adverbio.' },
  { es: 'grande', target: 'groß', note: 'Adjetivo; comparativo größer.' },
  { es: 'pequeño', target: 'klein', note: 'Adjetivo.' },
  { es: 'bueno', target: 'gut', note: 'Adverbio también gut; mejor besser.' },
  { es: 'malo', target: 'schlecht', note: 'También böse (malo de carácter).' },
  { es: 'hablar', target: 'sprechen', note: 'Irregular: spricht, sprach, gesprochen.' },
  { es: 'comer', target: 'essen', note: 'Irregular: isst, aß, gegessen.' },
  { es: 'beber', target: 'trinken', note: 'trinkt, trank, getrunken.' },
  { es: 'dormir', target: 'schlafen', note: 'schläft, schlief, geschlafen.' },
  { es: 'leer', target: 'lesen', note: 'liest, las, gelesen.' },
  { es: 'escribir', target: 'schreiben', note: 'schreibt, schrieb, geschrieben.' },
  { es: 'ir', target: 'gehen', note: 'geht, ging, gegangen. También fahren (en vehículo).' },
  { es: 'venir', target: 'kommen', note: 'kommt, kam, gekommen.' },
  { es: 'ver', target: 'sehen', note: 'sieht, sah, gesehen.' },
  { es: 'porque', target: 'weil / denn', note: 'weil introduce subordinada (verbo al final).' },
  { es: 'aunque', target: 'obwohl', note: 'Subordinada; verbo al final.' },
  { es: 'siempre', target: 'immer', note: 'Frecuencia.' },
  { es: 'nunca', target: 'nie', note: 'Negación temporal.' },
  { es: 'aquí', target: 'hier', note: 'dort = allí.' },
  { es: 'gracias', target: 'danke', note: 'Vielen Dank más enfático.' },
  { es: 'por favor', target: 'bitte', note: 'También respuesta a gracias.' },
  { es: 'sí', target: 'ja', note: 'Afirmación.' },
  { es: 'no', target: 'nein', note: 'Negación oracional; nicht niega el verbo/sintagma.' },
  { es: 'nación', target: 'Nation', note: 'Femenino: die Nation.' },
  { es: 'información', target: 'Information', note: 'Femenino; plural Informationen.' },
]

const IT_LEX: LexItem[] = [
  { es: 'casa', target: 'casa', note: 'Femenino: la casa.' },
  { es: 'libro', target: 'libro', note: 'Masculino: il libro.' },
  { es: 'agua', target: 'acqua', note: 'Femenino: l’acqua. Doble c.' },
  { es: 'amigo', target: 'amico', note: 'amico/amica; plural amici/amiche.' },
  { es: 'ciudad', target: 'città', note: 'Femenino; acento final.' },
  { es: 'tiempo', target: 'tempo', note: 'También clima: il tempo.' },
  { es: 'mano', target: 'mano', note: 'Femenino irregular: la mano. Plural le mani.' },
  { es: 'escuela', target: 'scuola', note: 'Femenino: la scuola.' },
  { es: 'comida', target: 'cibo', note: 'También pasto (comida como ocasión).' },
  { es: 'trabajo', target: 'lavoro', note: 'Masculino: il lavoro.' },
  { es: 'niño', target: 'bambino', note: 'bambino/bambina; bambino también genérico.' },
  { es: 'mujer', target: 'donna', note: 'Femenino: la donna.' },
  { es: 'hombre', target: 'uomo', note: 'Masculino: l’uomo. Plural uomini.' },
  { es: 'día', target: 'giorno', note: 'Masculino; giornata enfatiza duración.' },
  { es: 'noche', target: 'notte', note: 'Femenino: la notte.' },
  { es: 'año', target: 'anno', note: 'Masculino: l’anno. Doble n.' },
  { es: 'mes', target: 'mese', note: 'Masculino: il mese.' },
  { es: 'semana', target: 'settimana', note: 'Femenino.' },
  { es: 'hoy', target: 'oggi', note: 'Adverbio.' },
  { es: 'mañana', target: 'domani', note: 'mattina = mañana (parte del día).' },
  { es: 'ayer', target: 'ieri', note: 'Adverbio.' },
  { es: 'grande', target: 'grande', note: 'grande/grandi; antes de sustantivo a veces gran.' },
  { es: 'pequeño', target: 'piccolo', note: 'piccolo/piccola.' },
  { es: 'bueno', target: 'buono', note: 'buono/buona; buon antes de masculino con consonante.' },
  { es: 'malo', target: 'cattivo', note: 'También male (adverbio/sustantivo).' },
  { es: 'hablar', target: 'parlare', note: 'Regular en -are.' },
  { es: 'comer', target: 'mangiare', note: 'Regular; g blanda ante i.' },
  { es: 'beber', target: 'bere', note: 'Irregular: bevo, bevi…' },
  { es: 'dormir', target: 'dormire', note: 'Regular en -ire.' },
  { es: 'leer', target: 'leggere', note: 'Irregular: leggo, leggi…' },
  { es: 'escribir', target: 'scrivere', note: 'Irregular: scrivo…' },
  { es: 'ir', target: 'andare', note: 'Irregular: vado, vai, va…' },
  { es: 'venir', target: 'venire', note: 'Irregular: vengo, vieni…' },
  { es: 'ver', target: 'vedere', note: 'Irregular: vedo…' },
  { es: 'porque', target: 'perché', note: 'Causal y “por qué” interrogativo.' },
  { es: 'aunque', target: 'sebbene / anche se', note: 'sebbene + congiuntivo.' },
  { es: 'siempre', target: 'sempre', note: 'Frecuencia.' },
  { es: 'nunca', target: 'mai', note: 'Con non: non … mai.' },
  { es: 'aquí', target: 'qui / qua', note: 'lì / là = allí.' },
  { es: 'gracias', target: 'grazie', note: 'Prego como respuesta.' },
  { es: 'por favor', target: 'per favore / per piacere', note: 'Cortesía.' },
  { es: 'sí', target: 'sì', note: 'Con acento.' },
  { es: 'no', target: 'no', note: 'Negación oracional; non niega el verbo.' },
  { es: 'nación', target: 'nazione', note: 'Femenino: la nazione. Sufijo -zione.' },
  { es: 'información', target: 'informazione', note: 'Femenino; plural informazioni.' },
  { es: 'decisión', target: 'decisione', note: 'Femenino; verbo decidere.' },
  { es: 'habitación', target: 'camera', note: 'False friend: no es “cámara” fotográfica (macchina fotografica).' },
]

const ES_META_LEX: LexItem[] = [
  { es: 'ser', target: 'ser (esencia)', note: 'Identidad, material, hora, origen.' },
  { es: 'estar', target: 'estar (estado)', note: 'Localización, estado temporal, progresivo.' },
  { es: 'por', target: 'por (causa/medio)', note: 'Causa, duración, medio, intercambio.' },
  { es: 'para', target: 'para (propósito)', note: 'Finalidad, destinatario, plazo.' },
  { es: 'muy', target: 'muy + adjetivo', note: 'No "mucho" antes de adjetivo solo.' },
  { es: 'mucho', target: 'mucho + sustantivo/verbo', note: 'Cantidad o intensidad verbal.' },
  { es: 'nación', target: 'nación (-ción)', note: 'Sufijo -ción forma sustantivos abstractos desde verbos o adjetivos.' },
  { es: 'decisión', target: 'decisión (-sión)', note: 'Variante -sión tras ciertas bases (decidir → decisión).' },
]

const LEX_BY_LANG: Record<LangId, LexItem[]> = {
  es: ES_META_LEX,
  en: EN_LEX,
  fr: FR_LEX,
  ja: JA_LEX,
  zh: ZH_LEX,
  pt: PT_LEX,
  de: DE_LEX,
  it: IT_LEX,
}

// Distractors
const ES_DISTRACTORS = [
  'casa', 'libro', 'agua', 'amigo', 'tiempo', 'mano', 'día', 'noche', 'año', 'mes',
  'grande', 'pequeño', 'bueno', 'malo', 'feliz', 'triste', 'hablar', 'comer', 'ir', 'ver',
  'siempre', 'nunca', 'aquí', 'allí', 'porque', 'aunque', 'hoy', 'ayer', 'mañana', 'gracias',
  'problema', 'color', 'ventana', 'puerta', 'calle', 'escuela', 'trabajo', 'niño', 'mujer', 'hombre',
  'nación', 'información', 'decisión', 'posible', 'realidad',
]

const EN_DISTRACTORS = [
  'house', 'book', 'water', 'friend', 'time', 'hand', 'day', 'night', 'year', 'month',
  'big', 'small', 'good', 'bad', 'happy', 'sad', 'speak', 'eat', 'go', 'see',
  'always', 'never', 'here', 'there', 'because', 'although', 'today', 'yesterday', 'tomorrow',
  'library', 'actually', 'embarrassed', 'assist', 'realize', 'lecture', 'parent', 'carpet',
  'nation', 'information', 'decision', 'possible', 'reality',
]

const FR_DISTRACTORS = [
  'maison', 'livre', 'eau', 'ami', 'temps', 'main', 'jour', 'nuit', 'an', 'mois',
  'grand', 'petit', 'bon', 'mauvais', 'heureux', 'parler', 'manger', 'aller', 'voir',
  'toujours', 'jamais', 'ici', 'parce que', 'merci', 'problème', 'couleur', 'fenêtre',
  'librairie', 'blessé', 'actuellement', 'assister', 'lecture', 'nation', 'information',
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

const PT_DISTRACTORS = [
  'casa', 'livro', 'água', 'amigo', 'tempo', 'mão', 'dia', 'noite', 'ano', 'mês',
  'grande', 'pequeno', 'bom', 'mau', 'falar', 'comer', 'ir', 'ver',
  'sempre', 'nunca', 'aqui', 'obrigado', 'sim', 'não', 'nação', 'informação',
  'cidade', 'escola', 'trabalho', 'criança', 'mulher', 'homem',
]

const DE_DISTRACTORS = [
  'Haus', 'Buch', 'Wasser', 'Freund', 'Zeit', 'Hand', 'Tag', 'Nacht', 'Jahr', 'Monat',
  'groß', 'klein', 'gut', 'schlecht', 'sprechen', 'essen', 'gehen', 'sehen',
  'immer', 'nie', 'hier', 'danke', 'bitte', 'ja', 'nein', 'Nation', 'Information',
  'Stadt', 'Schule', 'Arbeit', 'Kind', 'Frau', 'Mann',
]

const IT_DISTRACTORS = [
  'casa', 'libro', 'acqua', 'amico', 'tempo', 'mano', 'giorno', 'notte', 'anno', 'mese',
  'grande', 'piccolo', 'buono', 'cattivo', 'parlare', 'mangiare', 'andare', 'vedere',
  'sempre', 'mai', 'qui', 'grazie', 'sì', 'no', 'nazione', 'informazione',
  'città', 'scuola', 'lavoro', 'bambino', 'donna', 'uomo', 'camera',
]

const DISTRACTORS: Record<LangId, string[]> = {
  es: ES_DISTRACTORS,
  en: EN_DISTRACTORS,
  fr: FR_DISTRACTORS,
  ja: JA_DISTRACTORS,
  zh: ZH_DISTRACTORS,
  pt: PT_DISTRACTORS,
  de: DE_DISTRACTORS,
  it: IT_DISTRACTORS,
}

// Grammar deduction prompts
interface GrammarItem {
  prompt: string
  ruleHint: string
  ruleExplain: string
  /** Consejo si falla (sin revelar la respuesta). */
  failAdvice: string
  options: string[]
  correctIndex: number
  explanation: string
  passage?: string
  /** Explicación real de CADA opción (misma posición que `options`), sin
   * decir cuál es correcta: qué forma/estructura es y por qué alguien la
   * consideraría, para que la clase enseñe el paradigma completo. */
  optionNotes?: string[]
}

const EN_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'Elige la forma correcta: “She ____ to school every day.”',
    ruleHint: 'Presente simple, 3.ª persona singular: verbo + -s.',
    ruleExplain: 'En presente simple, he/she/it añade -s/-es al verbo. Es una marca de concordancia, no de plural.',
      failAdvice: 'Revisa la regla y descarta opciones incompatibles antes de elegir.',
    options: ['go', 'goes', 'going', 'gone', 'went', 'goed', 'goe', 'to go'],
    correctIndex: 1,
    explanation: 'En presente simple, la 3.ª persona singular (he/she/it) añade -s/-es: goes.',
    optionNotes: [
      'Forma base/infinitivo sin marcar persona: es la forma del diccionario y también la que usan I/you/we/they en presente.',
      '3.ª persona singular del presente: añade -s a la forma base.',
      'Gerundio/participio presente: se usa tras "be" (is going) o como sustantivo verbal, nunca solo como verbo principal en presente simple.',
      'Participio pasado: se usa tras "have" (has gone) o "be" (is gone), no como presente.',
      'Pasado simple irregular: se usa para acciones terminadas en el pasado, no en presente.',
      'Forma inventada que aplica la terminación regular -ed a un verbo irregular; no existe en inglés.',
      'Ortografía incorrecta: le falta la -s de concordancia y la -es completa.',
      'Infinitivo con partícula "to": se usa tras otros verbos (want to go), no como verbo conjugado principal.',
    ],
  },
  {
    prompt: '¿Cuál es el plural de “child”?',
    ruleHint: 'Plurales irregulares germánicos.',
    ruleExplain: 'Algunos sustantivos antiguos forman el plural con cambio vocálico (umlaut histórico) o formas supletivas, no con -s.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['childs', 'childes', 'children', 'childrens', 'child', 'childer', 'kids', 'childen'],
    correctIndex: 2,
    explanation: 'Child → children es un plural irregular histórico; no se forma con -s.',
    optionNotes: [
      'Aplica la regla regular -s a un sustantivo irregular; esa forma no existe en inglés estándar.',
      'Variante inventada con -es; tampoco existe.',
      'Plural irregular real, formado históricamente con el sufijo germánico -er más un cambio de raíz, no con -s.',
      'Añade una -s extra a una palabra que ya es plural; redundante e incorrecto.',
      'Es la forma singular, no el plural.',
      'Forma histórica/dialectal antigua que sobrevive solo en algunos dialectos regionales, no en el inglés estándar.',
      'Sinónimo coloquial de "children" (niños/críos), pero no es el plural gramatical de "child".',
      'Variante mal escrita, le falta la "r" antes de la terminación.',
    ],
  },
  {
    prompt: 'Completa: “I have ____ this book.”',
    ruleHint: 'Present perfect: have + participio pasado.',
    ruleExplain: 'El present perfect (have/has + past participle) enlaza pasado y presente: experiencia, resultado o acción no terminada en un periodo que incluye ahora.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['readed', 'read', 'reading', 'reads', 'rode', 'written', 'red', 'reed'],
    correctIndex: 1,
    explanation: 'El participio de read es read (pronunciado /red/). Have read = presente perfecto.',
    optionNotes: [
      'Aplica -ed a un verbo irregular; no existe, porque "read" no cambia de forma escrita en pasado/participio.',
      'Forma correcta de pasado y participio: se escribe igual que el presente pero se pronuncia distinto (/red/ en pasado/participio frente a /riːd/ en presente).',
      'Gerundio: se usa tras "be" (is reading), no tras "have".',
      '3.ª persona singular del presente, no una forma de participio.',
      'Pasado irregular del verbo "ride" (montar): verbo distinto, no de "read".',
      'Participio del verbo "write" (escribir): verbo relacionado en significado pero gramaticalmente distinto de "read".',
      'El color rojo: homófono de la pronunciación del pasado de "read", pero una palabra completamente distinta.',
      'Sustantivo que significa "junco" (la planta): homófono del presente de "read", sin relación gramatical.',
    ],
  },
  {
    prompt: 'Orden natural de adjetivos: “a ____ box”',
    ruleHint: 'Opinión → tamaño → edad → color → origen → material → propósito.',
    ruleExplain: 'El inglés ordena adjetivos prenominales en una secuencia preferida. “Nice small wooden” suena natural; otras permutaciones suenan raras.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    optionNotes: [
      'Coloca el material antes que el tamaño y la opinión: invierte el orden preferido (opinión → tamaño → material).',
      'Sigue el orden preferido del inglés: opinión (nice) → tamaño (small) → material (wooden).',
      'Coloca el material antes que la opinión: orden poco natural para un hablante nativo.',
      'Empieza por el material, orden invertido respecto al patrón esperado.',
      'La opinión va correctamente al inicio, pero intercambia el orden de tamaño y material.',
      'Empieza por el tamaño en vez de la opinión, orden distinto al preferido.',
      'Solo usa dos adjetivos (material + tamaño): falta el de opinión y el orden interno también está invertido.',
      'Solo usa dos adjetivos (opinión + material): omite el tamaño por completo.',
    ],
  },
  {
    prompt: 'False friend: en inglés, “actually” significa…',
    ruleHint: 'False friends con el español.',
    ruleExplain: 'Actually ≠ actualmente. Actualmente = currently / nowadays. Actually = en realidad / de hecho.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    optionNotes: [
      'Es justo la trampa del false friend: se parece a "actually" pero en realidad significa "currently/nowadays" en inglés, no esto.',
      'Significado real de "actually" en inglés: se usa para corregir o matizar algo dicho antes, o para introducir un dato sorprendente.',
      'Se relaciona con el verbo "to act" (actuar), una palabra distinta de "actually".',
      'Se dice "active" en inglés; comparte raíz remota con "actually" pero no es su significado.',
      'Se acerca al sentido de "actualmente/currently", que es precisamente el significado que "actually" NO tiene (ese es el false friend a evitar).',
      'Se diría "in the end" o "eventually" en inglés; no es el sentido de "actually".',
      'Se dice "almost" o "nearly" en inglés; no está relacionado con "actually".',
      'Se dice "never" en inglés; no está relacionado con "actually".',
    ],
  },
  {
    prompt: 'Elige el phrasal verb: “buscar información en un diccionario”',
    ruleHint: 'Verb + particle cambia el significado.',
    ruleExplain: 'Los phrasal verbs no se traducen palabra a palabra. Look up = consultar; look for = buscar; look after = cuidar.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['look after', 'look up', 'look for', 'look out', 'look into', 'look down', 'look over', 'look on'],
    correctIndex: 1,
    explanation: 'Look up = consultar (palabra). Look for = buscar; look after = cuidar.',
    optionNotes: [
      'Cuidar de alguien o algo, como cuidar niños o una mascota.',
      'Consultar una palabra o un dato en una fuente, como un diccionario o internet.',
      'Buscar algo que no se tiene o no se encuentra todavía.',
      'Tener cuidado, prestar atención ante un peligro inminente.',
      'Investigar o examinar un asunto con detenimiento.',
      '(look down on) Mirar con desprecio a alguien, sentirse superior.',
      'Revisar algo de forma rápida y superficial, echarle un vistazo.',
      'Observar como espectador, sin participar en lo que ocurre.',
    ],
  },
  {
    prompt: 'Artículo correcto: “____ university is big.” (hablando de una concreta conocida)',
    ruleHint: 'The para referentes definidos; a/an indefinidos.',
    ruleExplain: 'The se usa cuando el oyente puede identificar el referente (ya mencionado, único en contexto, o conocido).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['A', 'An', 'The', '∅ (ninguno)', 'Some', 'Any', 'This only', 'Those'],
    correctIndex: 2,
    explanation: 'Si es definida/conocida en el discurso: the university.',
    optionNotes: [
      'Artículo indefinido: se usa ante un referente no identificado específicamente por el oyente, y ante sonido consonántico.',
      'Artículo indefinido: igual función que "a", pero ante sonido vocálico.',
      'Artículo definido: se usa cuando el oyente puede identificar el referente exacto del que se habla.',
      'Ausencia de artículo: típica con sustantivos plurales o incontables en sentido genérico, no con un singular contable ya identificado.',
      'Cuantificador indefinido, usado con cantidades no especificadas; no marca definitud de un referente único.',
      'Cuantificador usado sobre todo en negaciones y preguntas; tampoco marca definitud.',
      'Demostrativo que señala algo específico y cercano; funciona de forma distinta al artículo definido.',
      'Demostrativo plural; no corresponde a un sustantivo singular como "university".',
    ],
  },
  {
    prompt: 'Negación correcta en inglés estándar:',
    ruleHint: 'Un solo negativo de polaridad; do-support.',
    ruleExplain: 'El inglés estándar evita la doble negación de polaridad. Don’t + anything (no don’t + nothing).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    optionNotes: [
      'Doble negación de polaridad (don\'t + nothing): existe en variedades no estándar del inglés, pero no en el estándar escrito.',
      'Negación estándar única: auxiliar negado (don\'t) más una palabra de polaridad positiva bajo negación (anything).',
      '"No" no funciona como negador directo de verbos en inglés (a diferencia del español); además falta el auxiliar "do".',
      'Falta el auxiliar "do" y, además, hay doble negación de polaridad.',
      'Mezcla incorrectamente "does" (3.ª persona) con el sujeto "I" (1.ª persona); debería ser "don\'t".',
      'Falta el auxiliar "do"; es un calco directo de estructuras de negación de otros idiomas.',
      '"Ain\'t" es una contracción no estándar de am not/isn\'t/haven\'t, combinada aquí además con doble negación.',
      'Usa gerundio sin el auxiliar "be"; no forma una negación verbal válida en presente simple.',
    ],
  },
  {
    prompt: 'El sufijo “-tion” en “nation”, “information”, “decision” suele indicar…',
    ruleHint: 'Morfología derivativa latina.',
    ruleExplain: 'El sufijo -tion/-sion forma sustantivos abstractos (a menudo deverbales) de origen latino. Es cognado del español -ción/-sión.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'adverbio de modo',
      'sustantivo abstracto / proceso o resultado',
      'plural obligatorio',
      'tiempo pasado',
      'género femenino solo en inglés',
      'verbo modal',
      'artículo definido',
      'preposición',
    ],
    correctIndex: 1,
    explanation: '-tion/-sion crea sustantivos abstractos (nación, información, decisión). Cognado de -ción/-sión.',
    optionNotes: [
      'Los adverbios de modo se forman con -ly (quickly, slowly), no con -tion.',
      'Función real de -tion/-sion: sufijo latino que forma sustantivos abstractos, a menudo derivados de un verbo (nombra un proceso o su resultado).',
      '-tion no marca plural; el plural regular se marca con -s (nations).',
      'El pasado se marca con -ed en verbos regulares, no con el sufijo -tion.',
      'El inglés moderno no marca género gramatical en los sustantivos comunes; -tion no cumple esa función.',
      'Los modales son palabras independientes como can/must/should; categoría totalmente distinta de un sufijo derivativo.',
      'El único artículo definido del inglés es "the"; -tion no cumple esa función.',
      'Las preposiciones son palabras independientes (in, on, at); -tion es un sufijo, no una palabra funcional propia.',
    ],
  },
  {
    prompt: '“If it rains, we will stay home.” Es un condicional de tipo…',
    ruleHint: 'Condicionales: 0 (hechos), 1 (real futuro), 2 (irreal presente), 3 (irreal pasado).',
    ruleExplain: '1.ª condicional: if + present, will + verb. Situaciones reales o posibles en el futuro.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['0 (verdades generales)', '1 (posible en el futuro)', '2 (hipótesis presente)', '3 (hipótesis pasada)', 'mixto solo', 'imperativo', 'subjuntivo latino', 'ninguno'],
    correctIndex: 1,
    explanation: 'If + presente, will + verbo = 1.ª condicional (posible/real en el futuro).',
    optionNotes: [
      'Usa presente + presente (if you heat ice, it melts) para hechos siempre verdaderos, no para una situación futura concreta como la de la frase.',
      'Usa if + presente, will + verbo, para situaciones reales o probables en el futuro: justo la estructura de la frase dada.',
      'Usa if + pasado, would + verbo, para situaciones hipotéticas o poco probables: estructura distinta a la de la frase.',
      'Usa if + past perfect, would have + participio, para un pasado que ya no se puede cambiar.',
      'Combina tiempos de distintos tipos de condicional (por ejemplo 2.ª+3.ª); la frase dada sigue un patrón puro, no mixto.',
      'Da órdenes directas (Stay home!) sin estructura condicional con "if" seguida de consecuencia.',
      'No es una categoría del sistema de condicionales inglés moderno, que se organiza por tipos numerados, no por modo subjuntivo latino.',
      'La frase sí sigue un patrón condicional identificable y nombrado, así que descartar cualquier tipo no es correcto.',
    ],
  },
  {
    prompt: '“If I had more time, I would learn Japanese.” ¿Qué tipo de condicional es y qué expresa?',
    ruleHint: '2.ª condicional: if + pasado simple, would + verbo base.',
    ruleExplain: 'La 2.ª condicional describe una situación hipotética o irreal en el presente/futuro. El pasado simple aquí NO indica tiempo pasado real, sino irrealidad (un uso llamado "pasado no factual" o "irrealis"). "Would" marca la consecuencia hipotética.',
    failAdvice: 'Fíjate en si la situación es real y futura (1.ª) o hipotética y presente (2.ª).',
    options: ['1.ª: probable en el futuro', '2.ª: hipótesis irreal en el presente', '3.ª: hipótesis irreal en el pasado', '0: verdad general', 'imperativo condicional', 'futuro simple', 'presente perfecto', 'ninguno de los anteriores'],
    correctIndex: 1,
    explanation: 'If + pasado simple, would + verbo = 2.ª condicional: hipótesis irreal en el presente o futuro cercano.',
    optionNotes: [
      'Usa if + presente, will + verbo (1.ª condicional); la frase dada usa if + pasado, would + verbo, una estructura distinta.',
      'Estructura real de la frase: if + pasado simple, would + verbo base, para algo hipotético no factual en el presente.',
      'Usaría if + past perfect (had + participio) y would have + participio; no es lo que aparece en esta frase.',
      'Usa presente + presente para hechos siempre ciertos, sin "would"; no coincide con la frase.',
      'No es una categoría estándar reconocida del sistema de condicionales inglés.',
      'Sería "will + verbo" sin una cláusula "if" hipotética con verbo en pasado.',
      'Usaría have/has + participio; estructura ausente en esta frase.',
      'La frase sí encaja claramente en un tipo de condicional reconocible, así que descartarlos todos no es correcto.',
    ],
  },
  {
    prompt: '“If she had studied, she would have passed the exam.” ¿Qué tipo de condicional es?',
    ruleHint: '3.ª condicional: if + past perfect, would have + participio.',
    ruleExplain: 'La 3.ª condicional habla de un pasado que ya no se puede cambiar: describe cómo habría sido el resultado si una condición pasada (que NO se cumplió) hubiera sido distinta. Es el equivalente inglés del "si hubiera... habría..." español.',
    failAdvice: 'Busca la combinación past perfect (had + participio) + would have + participio: esa es la marca inconfundible de la 3.ª condicional.',
    options: ['1.ª condicional', '2.ª condicional', '3.ª condicional: pasado irreal', 'condicional cero', 'futuro perfecto', 'presente perfecto continuo', 'pasado simple narrativo', 'imperativo negado'],
    correctIndex: 2,
    explanation: 'If + had + participio (past perfect), would have + participio = 3.ª condicional: lo que habría pasado si el pasado hubiera sido distinto.',
    optionNotes: [
      'Usaría if + presente, will + verbo; aquí se usa "had studied / would have passed", una estructura distinta.',
      'Usaría if + pasado simple, would + verbo base; aquí el verbo tras "if" está un paso más atrás, en past perfect (had studied).',
      'Estructura exacta de la frase: if + past perfect, would have + participio, para un pasado que ya no puede cambiarse.',
      'Usaría presente + presente para verdades generales, no esta combinación de pasados.',
      'Sería "will have + participio", sin cláusula "if" hipotética sobre el pasado.',
      'Sería have/has been + gerundio; forma totalmente distinta a la de esta frase.',
      'Sería solo "studied/passed" sin "had" ni "would have": una narración simple sin hipótesis.',
      'Daría una orden negativa (Don\'t study!); no tiene relación con esta estructura condicional.',
    ],
  },
  {
    prompt: '“She was cooking dinner when the phone rang.” ¿Qué combinación de tiempos es y qué función cumple?',
    ruleHint: 'Past continuous (acción en curso) + past simple (interrupción puntual).',
    ruleExplain: 'El past continuous (was/were + gerundio) describe una acción en desarrollo en un momento del pasado, como un telón de fondo. El past simple marca un evento puntual que interrumpe esa acción. Es el patrón clásico "estaba haciendo X cuando pasó Y".',
    failAdvice: 'Identifica cuál acción es el "fondo" continuo y cuál es el evento puntual que lo corta.',
    options: ['dos pasados simples paralelos', 'past continuous + past simple: fondo + interrupción', 'presente perfecto + pasado', 'futuro en el pasado', 'pasado perfecto + presente', 'dos presentes continuos', 'condicional mixto', 'subjuntivo pasado'],
    correctIndex: 1,
    explanation: 'Was cooking (continuo, fondo) + rang (simple, evento puntual que interrumpe) es el patrón estándar para narrar interrupciones.',
    optionNotes: [
      'Sería "cooked... rang", dos acciones puntuales sin relación de fondo/interrupción; no es la estructura de la frase dada.',
      'Estructura real: "was cooking" (continuo, de fondo) + "rang" (simple, el evento que interrumpe).',
      'Usaría "has cooked", conectando pasado con presente; no es el caso de esta frase narrativa.',
      'Usaría "was going to cook", una intención pasada sobre el futuro, distinta de esta frase.',
      'Usaría "had cooked... rings", una combinación que no aparece en la frase.',
      'Usaría "is cooking... is ringing", tiempos presentes, no pasados como en la frase.',
      'Combinaría partes de distintas condicionales con "if" y "would"; esta frase no tiene ninguna condicional.',
      'Sería una forma hipotética tipo "if I were", ausente en esta frase puramente narrativa.',
    ],
  },
  {
    prompt: '“I used to play the guitar, but I don’t anymore.” ¿Qué expresa “used to”?',
    ruleHint: '“Used to” + infinitivo: hábito o estado pasado que ya no ocurre.',
    ruleExplain: '“Used to” es una estructura especial (no un verbo modal ni un tiempo verbal estándar) que expresa hábitos o estados que existieron en el pasado pero ya terminaron. Se diferencia de "would" (que solo sirve para hábitos repetidos, no estados) y del pasado simple (que no enfatiza el contraste "antes sí, ahora no").',
    failAdvice: 'Busca la idea de contraste explícito entre un pasado habitual y un presente distinto.',
    options: ['acción en curso ahora', 'hábito o estado pasado que ya no es cierto', 'obligación presente', 'posibilidad futura', 'orden o consejo', 'acción repetida que continúa hoy', 'pasado perfecto', 'condicional'],
    correctIndex: 1,
    explanation: '"Used to" + infinitivo describe un hábito o estado pasado terminado: antes tocaba la guitarra, ahora no.',
    optionNotes: [
      'Eso lo expresaría el presente continuo (I am playing); "used to" mira siempre al pasado, no al presente.',
      'Función real de "used to": un hábito o estado que existía antes pero ya no es cierto, con un contraste explícito.',
      'La obligación se expresa con "must/have to", no con "used to".',
      'La posibilidad futura se expresaría con "might/could/will possibly", no con una estructura de pasado.',
      'Una orden o consejo se expresaría con imperativo o "should", no con "used to".',
      'Si continuara hoy, se usaría presente simple (I play); "used to" implica precisamente que ya terminó.',
      'Usaría "had played", una forma distinta a "used to play".',
      'Usaría "would play" en un contexto hipotético con "if"; "used to" no necesita esa condición.',
    ],
  },
  {
    prompt: 'Voz pasiva: “The letter ____ by Maria yesterday.”',
    ruleHint: 'Pasiva: be (en el tiempo correcto) + participio pasado + by + agente.',
    ruleExplain: 'La voz pasiva se forma con el verbo "to be" conjugado en el tiempo que corresponda, más el participio pasado del verbo principal. El agente (quien hace la acción) es opcional y, si aparece, va introducido por "by". Aquí "yesterday" exige pasado simple de "be": was.',
    failAdvice: 'Conjuga "be" en el tiempo que pide el marcador temporal, y usa el participio pasado del verbo principal.',
    options: ['is written', 'was written', 'writes', 'wrote', 'has written', 'was write', 'is wrote', 'will write'],
    correctIndex: 1,
    explanation: '"Yesterday" pide pasado; pasiva pasado = was/were + participio: was written.',
    optionNotes: [
      'Pasiva en presente (be + participio); no coincide con "yesterday", que pide pasado.',
      'Pasiva en pasado: was (pasado de be) + written (participio); la forma correcta para "yesterday".',
      'Voz activa, presente, 3.ª persona; ni es pasiva ni es el tiempo que pide la frase.',
      'Voz activa, pasado; correcto en tiempo pero no en voz (el sujeto "the letter" recibe la acción, no la realiza).',
      'Voz activa, presente perfecto; ni es pasiva ni encaja con "yesterday" (que exige pasado simple, no perfecto).',
      'Combina correctamente el auxiliar pasivo "was" pero deja el verbo en forma base en vez de participio; error de forma.',
      'Mezcla el auxiliar en presente con un participio irregular mal formado; ninguna de las dos partes es correcta aquí.',
      'Voz activa, futuro; no es pasiva ni coincide con "yesterday" (pasado).',
    ],
  },
  {
    prompt: 'Voz activa vs. pasiva: ¿por qué un hablante elige “The bridge was built in 1889” en vez de “Someone built the bridge in 1889”?',
    ruleHint: 'La pasiva se prefiere cuando el agente es desconocido, irrelevante u obvio por contexto.',
    ruleExplain: 'La elección entre voz activa y pasiva no es solo gramatical: es pragmática. Se prefiere la pasiva cuando el foco de la frase es el paciente (lo que recibe la acción) y el agente es desconocido, poco importante o se sobreentiende. En textos históricos y científicos, la pasiva es extremadamente frecuente por esta razón.',
    failAdvice: 'Piensa en qué elemento de la frase es el foco de interés real: si es el objeto/resultado, la pasiva suele ser más natural.',
    options: ['porque el inglés no tiene voz activa', 'porque el agente (quién lo construyó) es desconocido o irrelevante aquí', 'porque el verbo "build" es siempre pasivo', 'por pura preferencia sin razón', 'porque "bridge" es un sustantivo incontable', 'porque falta un artículo', 'porque 1889 exige pasiva', 'no hay ninguna razón funcional'],
    correctIndex: 1,
    explanation: 'La pasiva enfoca el resultado (el puente) cuando el agente (quién lo construyó) no importa o no se conoce con precisión.',
    optionNotes: [
      'Es falso: el inglés tiene ambas voces; la pregunta es sobre cuándo se prefiere una u otra, no sobre la existencia de la voz activa.',
      'Razón pragmática real: en textos históricos se prefiere la pasiva cuando el foco es el resultado y el agente es desconocido o irrelevante.',
      'Es falso: "build" funciona en ambas voces según el contexto (they built the bridge / the bridge was built).',
      'La elección de voz sí responde a una razón comunicativa concreta (qué elemento es el foco de la frase), no es arbitraria.',
      'Es falso: "bridge" es un sustantivo contable normal (a bridge, two bridges); eso no influye en la elección de voz.',
      'Ambas versiones de la frase llevan correctamente el artículo "the"; no hay ningún problema de artículos aquí.',
      'Una fecha no exige por sí sola ninguna voz gramatical; "someone built it in 1889" es perfectamente válido.',
      'Existe una razón pragmática clara y explicable (el foco informativo), así que negar que haya alguna razón no es correcto.',
    ],
  },
  {
    prompt: 'Verbo modal de deducción: “She isn’t answering; she ____ be asleep.”',
    ruleHint: 'Modales epistémicos: must (deducción fuerte), might/could (posibilidad), can’t (deducción negativa fuerte).',
    ruleExplain: 'Los modales tienen usos "epistémicos": no expresan obligación sino el grado de certeza del hablante sobre algo. "Must" para una deducción muy probable a partir de evidencia; "might/could" para una posibilidad más débil; "can’t" para descartar algo con fuerza.',
    failAdvice: 'Piensa en el nivel de certeza que transmite la evidencia: no contestar sugiere una deducción bastante segura.',
    options: ['can', 'must', 'may not', 'shall', 'need', 'ought', 'will', 'used to'],
    correctIndex: 1,
    explanation: '"Must" expresa una deducción lógica fuerte a partir de evidencia (no contesta → probablemente duerme).',
    optionNotes: [
      'Expresa capacidad o posibilidad general; no una deducción fuerte basada en la evidencia del momento.',
      'Modal epistémico de deducción fuerte: la evidencia (no contesta) hace muy probable la conclusión de que duerme.',
      'Expresa posibilidad negativa débil, lo cual contradice el tono de deducción bastante segura que sugiere la situación.',
      'Modal de futuro/ofrecimiento formal (shall we?); no de deducción sobre un estado actual.',
      'Expresa necesidad, no una conclusión lógica derivada de la evidencia disponible.',
      'Modal de consejo/obligación moral (ought to); no de deducción epistémica en esta forma.',
      'Modal de futuro/predicción voluntaria; no se usa para deducir algo sobre el presente a partir de evidencia.',
      'Expresa un hábito pasado ya terminado; no tiene relación con hacer una deducción sobre el presente.',
    ],
  },
  {
    prompt: 'Discurso indirecto: Maria said, “I am tired.” → Maria said (that) she ____ tired.',
    ruleHint: 'Backshift: al reportar, el tiempo verbal suele retroceder una posición.',
    ruleExplain: 'En el estilo indirecto (reported speech), cuando el verbo introductorio está en pasado ("said"), el tiempo del verbo citado normalmente retrocede: presente → pasado, pasado → pasado perfecto, etc. Este fenómeno se llama "backshift" y también cambian los pronombres y algunos marcadores temporales (now→then, today→that day).',
    failAdvice: 'Identifica el tiempo original ("am", presente) y aplica el retroceso correspondiente.',
    options: ['is', 'was', 'has been', 'be', 'were', 'is being', 'had been', 'will be'],
    correctIndex: 1,
    explanation: 'Presente ("am") retrocede a pasado simple ("was") al reportar con un verbo introductorio en pasado.',
    optionNotes: [
      'Es la forma original citada, en presente; en discurso indirecto con verbo introductorio en pasado, esta forma retrocede.',
      'Pasado simple: resultado correcto del backshift desde "am/is" cuando el verbo introductorio ("said") está en pasado.',
      'Presente perfecto: sería el backshift de un present perfect original ("I have been tired"), no del presente simple "am".',
      'Forma base/infinitivo, sin conjugar; no puede funcionar sola como verbo principal reportado.',
      'Pasado plural o subjuntivo; no concuerda con el sujeto singular "she" en este contexto reportado.',
      'Presente continuo: sería el backshift si el original fuera "I am being tired", una frase distinta a la citada.',
      'Past perfect: sería el backshift de un pasado simple original, no de un presente como "am".',
      'Futuro: no es el resultado del backshift de un presente simple tras un verbo introductorio en pasado.',
    ],
  },
  {
    prompt: '¿Gerundio o infinitivo? “I enjoy ____ new languages.”',
    ruleHint: 'Ciertos verbos exigen gerundio (-ing) como complemento; otros exigen infinitivo (to + verbo).',
    ruleExplain: 'En inglés, el complemento verbal (gerundio vs. infinitivo) no es intercambiable libremente: depende del verbo principal. "Enjoy", "avoid", "finish", "suggest" exigen gerundio. "Want", "decide", "hope", "plan" exigen infinitivo con "to". Es una lista que se memoriza por verbo, no por regla lógica universal.',
    failAdvice: 'Memoriza "enjoy" como un verbo de la lista que exige gerundio (-ing), nunca infinitivo.',
    options: ['to learn', 'learning', 'learn', 'learned', 'to learning', 'learns', 'having learned', 'to have learned'],
    correctIndex: 1,
    explanation: '"Enjoy" exige gerundio: enjoy learning (nunca "enjoy to learn").',
    optionNotes: [
      'Infinitivo con "to": "enjoy" no acepta esta forma, aunque muchos otros verbos sí la piden (like "want to learn").',
      'Gerundio: la forma exigida por "enjoy" como complemento verbal directo.',
      'Forma base sin "-ing" ni "to": no funciona como complemento directo de "enjoy".',
      'Pasado/participio: no es la forma de complemento que pide "enjoy" tras de sí.',
      'Combinación inválida de infinitivo "to" con gerundio "-ing" a la vez; no existe como forma verbal en inglés.',
      '3.ª persona del presente: no puede funcionar como complemento verbal tras otro verbo conjugado como "enjoy".',
      'Gerundio perfecto: indica una acción completada antes de otra; válido en otros contextos, pero no el complemento simple que pide "enjoy" aquí.',
      'Infinitivo perfecto: tampoco es la forma que "enjoy" exige como complemento.',
    ],
  },
  {
    prompt: '¿Gerundio o infinitivo? “She decided ____ a new career.”',
    ruleHint: '"Decide" pertenece al grupo de verbos que exigen infinitivo con "to".',
    ruleExplain: 'A diferencia de "enjoy", el verbo "decide" pertenece al segundo gran grupo: verbos que van seguidos de infinitivo con "to" (decide, want, plan, hope, promise, agree, refuse). No hay una regla fonética o semántica que prediga el grupo con certeza total; se aprende por exposición y memorización de patrones.',
    failAdvice: 'Recuerda "decide to + verbo" como un bloque fijo, igual que "want to" o "plan to".',
    options: ['starting', 'to start', 'start', 'started', 'to starting', 'starts', 'having started', 'to have started'],
    correctIndex: 1,
    explanation: '"Decide" exige infinitivo con "to": decided to start.',
    optionNotes: [
      'Gerundio: "decide" no lo acepta como complemento directo (a diferencia de verbos como "enjoy").',
      'Infinitivo con "to": la forma exigida por "decide" como complemento verbal.',
      'Forma base sin "to": no es el complemento que pide "decide" conjugado.',
      'Pasado/participio: no funciona como complemento de "decide" en este patrón.',
      'Combinación inválida de infinitivo y gerundio a la vez; esta forma no existe en inglés.',
      '3.ª persona del presente: no es un complemento verbal válido tras "decide".',
      'Gerundio perfecto: forma válida en otros contextos, pero no el complemento simple que pide "decide" aquí.',
      'Infinitivo perfecto: posible en otros usos, pero no el patrón simple "decide to + verbo" de esta frase.',
    ],
  },
  {
    prompt: 'Cláusula relativa: “The woman ____ lives next door is a doctor.”',
    ruleHint: 'Pronombres relativos: who (personas, sujeto), which (cosas), that (ambos, informal), whose (posesión).',
    ruleExplain: 'Las cláusulas relativas añaden información sobre un sustantivo. Cuando el antecedente es una persona y funciona como sujeto de la cláusula, se usa "who" (o "that" en registro informal). "Which" se reserva para cosas y animales, nunca para personas en inglés estándar.',
    failAdvice: 'El antecedente ("the woman") es una persona que funciona como sujeto de "lives": eso exige "who".',
    options: ['which', 'who', 'whom', 'whose', 'what', 'where', 'when', 'why'],
    correctIndex: 1,
    explanation: '"Who" para personas como sujeto de la cláusula relativa: the woman who lives next door.',
    optionNotes: [
      'Pronombre relativo para cosas o animales; nunca se usa para personas en inglés estándar.',
      'Pronombre relativo para personas que funcionan como sujeto de la cláusula: el caso exacto de "the woman ... lives".',
      'Pronombre relativo para personas como objeto (no sujeto) de la cláusula, de registro formal; aquí "the woman" es sujeto de "lives", no objeto.',
      'Pronombre relativo posesivo ("de quien"), usado cuando se indica posesión, no una simple sustitución de sujeto.',
      'No funciona como pronombre relativo que introduce una cláusula sobre un antecedente ya mencionado como "the woman".',
      'Pronombre relativo de lugar, usado cuando el antecedente es un sitio, no una persona.',
      'Pronombre relativo de tiempo, usado cuando el antecedente es un momento, no una persona.',
      'Pronombre relativo de razón, usado con antecedentes como "the reason", no con personas.',
    ],
  },
  {
    prompt: 'Comparativo irregular: “This problem is ____ than the last one.” (bad)',
    ruleHint: 'Comparativos irregulares no siguen el patrón -er ni more + adjetivo.',
    ruleExplain: 'Un pequeño grupo de adjetivos y adverbios muy frecuentes tiene comparativos y superlativos completamente irregulares, heredados de formas antiguas del inglés: good→better→best, bad→worse→worst, far→further/farther→furthest/farthest. No siguen ni el patrón regular corto (-er) ni el largo (more + adjetivo).',
    failAdvice: 'No apliques la regla general (-er o more); estos adjetivos cambian de raíz por completo.',
    options: ['badder', 'more bad', 'worse', 'baddest', 'worst', 'more worse', 'the bad', 'badly'],
    correctIndex: 2,
    explanation: 'Bad → worse (comparativo) → worst (superlativo): irregular, sin -er ni more.',
    optionNotes: [
      'Aplica la terminación regular -er a un adjetivo irregular; esa forma no existe en inglés estándar.',
      'Aplica la estructura larga "more + adjetivo" a un adjetivo que en realidad cambia de raíz por completo; no es la forma estándar.',
      'Comparativo irregular real de "bad", con cambio total de raíz heredado del inglés antiguo.',
      'Aplica el superlativo regular -est a un adjetivo irregular; no existe, y además esta frase pide un comparativo, no un superlativo.',
      'Es el superlativo irregular de "bad" ("el peor de todos"), correcto en forma pero no en función: esta frase compara solo dos cosas, no exige un superlativo.',
      'Combina incorrectamente la forma larga "more" con la forma ya irregular "worse": doble marca de comparativo, redundante e incorrecta.',
      'Usa el artículo "the" con el adjetivo sin ninguna marca comparativa; así no se compara nada.',
      'Es un adverbio ("mal"), no un adjetivo comparativo; no puede describir a "problem" tras el verbo "is".',
    ],
  },
  {
    prompt: 'Countable/uncountable: “How ____ information do you need?”',
    ruleHint: '"Information" es un sustantivo incontable en inglés (aunque "información" tenga plural en español).',
    ruleExplain: 'Muchos sustantivos abstractos que en español pueden pluralizarse ("informaciones", "consejos", "muebles") son incontables en inglés y no admiten plural ni "many": information, advice, furniture, news. Con incontables se usa "much", no "many".',
    failAdvice: '"Information" no tiene plural en inglés estándar; descarta cualquier opción que trate la palabra como contable.',
    options: ['many', 'much', 'a lot', 'few', 'these', 'those informations', 'a', 'an'],
    correctIndex: 1,
    explanation: '"Information" es incontable: se usa "much information", nunca "many informations".',
    optionNotes: [
      'Cuantificador para sustantivos contables en plural (many books); "information" es incontable, así que no encaja aquí.',
      'Cuantificador correcto para sustantivos incontables como "information".',
      'Cuantificador informal que funciona con contables e incontables, pero la construcción "how ____" de esta frase exige específicamente "much" o "many", no esta forma.',
      'Cuantificador para contables en plural con sentido de escasez (few books); no aplica a un incontable.',
      'Demostrativo plural que exige un sustantivo contable en plural; "information" no lo es.',
      'Pluraliza incorrectamente un sustantivo incontable, un error típico por el plural "informaciones" que sí existe en español.',
      'Artículo indefinido singular contable; "information" en su sentido general no se usa con "a".',
      'Igual que "a" pero ante sonido vocálico; tampoco aplica a un incontable como "information".',
    ],
  },
  {
    prompt: 'Preposición de tiempo: “The meeting is ____ Monday ____ 9 a.m.”',
    ruleHint: 'On + días; at + horas precisas; in + meses/años/periodos largos.',
    ruleExplain: 'Las preposiciones de tiempo en inglés siguen una jerarquía bastante fija: "in" para periodos largos (meses, años, estaciones), "on" para días y fechas concretas, "at" para horas exactas y algunas expresiones fijas (at night, at the weekend en inglés británico). No hay una lógica única; se memoriza por categoría.',
    failAdvice: 'Separa la pregunta en dos huecos: uno pide preposición de día, el otro de hora exacta.',
    options: ['in / on', 'on / at', 'at / in', 'in / at', 'on / on', 'at / at', 'to / at', 'on / in'],
    correctIndex: 1,
    explanation: 'Días de la semana → "on" (on Monday); horas exactas → "at" (at 9 a.m.).',
    optionNotes: [
      '"In" no se usa para días de la semana (esa función corresponde a "on"); el segundo hueco tampoco usaría "on" para una hora exacta.',
      'Combinación correcta: "on" para el día (on Monday) y "at" para la hora exacta (at 9 a.m.).',
      'Invierte el uso esperado: "at" no se usa para días, e "in" no se usa para horas exactas.',
      '"In" no es la preposición para días de la semana; el segundo hueco sí sería correcto, pero el primero no.',
      'Usa "on" también para la hora, cuando las horas exactas piden "at", no "on".',
      'Usa "at" también para el día, cuando los días de la semana piden "on", no "at".',
      '"To" no es una preposición de tiempo para señalar un día concreto; no encaja en el primer hueco.',
      'El primer hueco sería correcto ("on Monday"), pero "in" no se usa para horas exactas, así que el segundo falla.',
    ],
  },
  {
    prompt: 'Question tag: “You like coffee, ____?”',
    ruleHint: 'Las question tags invierten la polaridad: afirmativa → tag negativo, y viceversa.',
    ruleExplain: 'Una question tag repite el auxiliar de la frase principal (o "do/does/did" si no hay auxiliar) y el pronombre sujeto, invirtiendo la polaridad: si la frase es afirmativa, el tag es negativo, y viceversa. Se usa para confirmar algo que el hablante cree cierto, buscando acuerdo.',
    failAdvice: 'La frase principal es afirmativa y usa "like" (sin auxiliar visible) → el tag necesita "do" en negativo.',
    options: ['do you', "don't you", 'aren\'t you', 'isn\'t it', 'do it', 'don\'t it', 'are you', 'will you'],
    correctIndex: 1,
    explanation: '"You like coffee" (afirmativa, sin auxiliar) → tag con do-support en negativo: don’t you?',
    optionNotes: [
      'Tag afirmativo con "do"; pero la frase principal ya es afirmativa, así que el tag debería ser negativo, no afirmativo.',
      'Tag negativo con do-support: correcto porque "you like coffee" es afirmativa y usa un verbo léxico sin auxiliar propio.',
      'Usaría el auxiliar "be", pero la frase principal usa el verbo léxico "like", no "be"; el tag debe repetir el mismo tipo de auxiliar.',
      'Usa el pronombre "it" y el auxiliar "be", pero el sujeto real de la frase es "you", no "it".',
      'Mezcla el auxiliar "do" con el pronombre objeto "it" en vez del sujeto "you"; estructura incorrecta para un tag.',
      'Combina correctamente la negación con "do", pero con el pronombre equivocado ("it" en vez de "you").',
      'Tag afirmativo con "be": doblemente incorrecto, ni la polaridad ni el auxiliar coinciden con la frase principal.',
      'Tag de futuro con "will"; la frase principal está en presente simple, no en futuro.',
    ],
  },
  {
    prompt: 'Phrasal verb con partícula que cambia el significado por completo: “The plane will ____ at 6 p.m.”',
    ruleHint: '"Take off" (despegar) vs. "take" (tomar): la partícula "off" crea un significado nuevo, no aditivo.',
    ruleExplain: 'Un phrasal verb "opaco" (idiomático) tiene un significado que no se puede predecir sumando el significado del verbo más la partícula por separado: "take" (tomar) + "off" (fuera) no da "tomar fuera", sino "despegar" (un avión) o "quitarse" (ropa). Hay que memorizarlo como una unidad léxica completa.',
    failAdvice: 'Piensa en qué hace un avión a una hora programada: la respuesta es un phrasal verb idiomático completo, no una palabra suelta.',
    options: ['take', 'take off', 'take up', 'take in', 'take on', 'take out', 'take over', 'take down'],
    correctIndex: 1,
    explanation: '"Take off" = despegar (avión); el significado no se deduce sumando "take" + "off" literalmente.',
    optionNotes: [
      'Verbo simple "tomar"; sin partícula no expresa la idea de que un avión despegue.',
      'Phrasal verb idiomático real: "despegar" (un avión) o "quitarse" (ropa); el significado no es la suma literal de sus partes.',
      'Empezar una afición o actividad nueva (take up painting), o también ocupar espacio o tiempo.',
      'Absorber información, engañar a alguien, o acoger a alguien en casa, según el contexto.',
      'Asumir una responsabilidad o un reto, o contratar a alguien.',
      'Sacar algo de un lugar, o llevar a alguien a salir (invitarlo a comer, por ejemplo).',
      'Asumir el control de algo, tomar el mando de una situación o empresa.',
      'Anotar algo por escrito, o derribar/desmontar una estructura.',
    ],
  },
]

const FR_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'Género: “problème” es…',
    ruleHint: 'No todas las palabras en -e son femeninas.',
    ruleExplain: 'En francés, la terminación no garantiza el género. Problème, système, thème son masculinos pese a -e.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['femenino', 'masculino', 'neutro', 'variable', 'plural', 'epiceno solo', 'invariable', 'dual'],
    correctIndex: 1,
    explanation: 'Un problème es masculino pese a terminar en -e.',
  },
  {
    prompt: 'Artículo: “____ eau est froide.”',
    ruleHint: 'Elisión ante vocal: le/la → l’.',
    ruleExplain: 'Ante vocal o h muda, le/la se eliden en l’. Eau empieza por vocal: l’eau.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['La', 'Le', 'L’', 'Les', 'Un', 'Une', 'De', 'Du'],
    correctIndex: 2,
    explanation: 'Eau empieza por vocal: l’eau (elisión de la).',
  },
  {
    prompt: 'Negación formal completa:',
    ruleHint: 'ne … pas alrededor del verbo conjugado.',
    ruleExplain: 'La negación clásica enmarca el verbo: ne + verbo + pas. En oral informal a menudo se omite ne.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'Aller, venir, arriver, partir… forman el passé composé con être. El participio concuerda en género y número con el sujeto.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'Librairie = tienda de libros. Biblioteca = bibliothèque. Library (inglés) = bibliothèque.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'Bien que, pour que, afin que, avant que… rigen subjuntivo. Bien qu’il soit tard…',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'La partícula tema se escribe con el kana は pero se pronuncia “wa”. Es una convención ortográfica histórica.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['ha', 'wa', 'ba', 'pa', 'a', 'ho', 'wo', 'ga'],
    correctIndex: 1,
    explanation: 'La partícula tema は se pronuncia “wa”, no “ha”.',
  },
  {
    prompt: 'Orden típico japonés:',
    ruleHint: 'Lengua SOV.',
    ruleExplain: 'El japonés coloca el verbo al final. Sujeto y objeto van antes, marcados por partículas.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS', 'libre total', 'V primero siempre'],
    correctIndex: 1,
    explanation: 'El japonés es predominantemente SOV: sujeto-objeto-verbo.',
  },
  {
    prompt: 'Partícula de objeto directo habitual:',
    ruleHint: 'Marcas de caso por partículas.',
    ruleExplain: 'を (o) marca el objeto directo del verbo transitivo. が marca sujeto/foco; は marca tema.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['は', 'が', 'を', 'に', 'で', 'の', 'と', 'も'],
    correctIndex: 2,
    explanation: 'を (o) marca el objeto directo: 本を読む.',
  },
  {
    prompt: '¿Qué silabario se usa típicamente para préstamos extranjeros?',
    ruleHint: 'Tres sistemas de escritura.',
    ruleExplain: 'Katakana se usa de forma característica para gairaigo (préstamos), onomatopeyas y énfasis.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['hiragana', 'katakana', 'kanji solo', 'romaji solo', 'man’yōgana', 'hangul', 'latin', 'cuneiforme'],
    correctIndex: 1,
    explanation: 'Katakana se usa de forma característica para gairaigo (préstamos).',
  },
  {
    prompt: 'Forma cortés de 食べる (taberu):',
    ruleHint: 'Masu-form para cortesía neutra.',
    ruleExplain: 'La forma -masu es la cortesía estándar en situaciones neutrales/formales. 食べます tabemasu.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['たべる', 'たべます', 'たべた', 'たべて', 'たべない', 'たべろ', 'たべよう', 'たべられる'],
    correctIndex: 1,
    explanation: 'Verbos en -masu (たべます) son la cortesía estándar.',
  },
  {
    prompt: 'Pasado cortés de 行く (iku):',
    ruleHint: 'Pasado en -mashita.',
    ruleExplain: 'La forma cortés de pasado se forma con -mashita. 行きます → 行きました.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['いきます', 'いきました', 'いった', 'いって', 'いかない', 'いこう', 'いかれた', 'いく'],
    correctIndex: 1,
    explanation: '行きました (ikimashita) es el pasado cortés de 行く.',
  },
]

const ZH_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'En mandarín, 书 (shū) con numeral requiere clasificador. ¿Cuál es típico?',
    ruleHint: 'Clasificadores obligatorios con números.',
    ruleExplain: 'Entre numeral y sustantivo hace falta un clasificador. Para libros: 本 běn. 一本书 yī běn shū.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['个 gè', '本 běn', '只 zhī', '条 tiáo', '张 zhāng', '件 jiàn', '位 wèi', '头 tóu'],
    correctIndex: 1,
    explanation: 'Los libros usan 本: 一本书 yī běn shū.',
  },
  {
    prompt: 'Negación de acciones habituales / futuro: se usa…',
    ruleHint: '不 vs 没.',
    ruleExplain: '不 bù niega presente habitual, futuro y adjetivos. 没 méi niega pasado perfectivo y posesión.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['没 méi', '不 bù', '别 bié solo', '无 wú', '否', '非', '无有', '未'],
    correctIndex: 1,
    explanation: '不 niega presente/habitual/futuro; 没 niega pasado o posesión.',
  },
  {
    prompt: 'Orden básico del mandarín:',
    ruleHint: 'Lengua SVO analítica.',
    ruleExplain: 'El mandarín es SVO. No hay flexión de persona/tiempo en el verbo; el aspecto y el tiempo se marcan con partículas y adverbios.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['SOV', 'SVO', 'VSO', 'VOS', 'OSV', 'libre', 'OVS', 'V final siempre'],
    correctIndex: 1,
    explanation: 'Mandarín es SVO: 我吃饭 wǒ chī fàn.',
  },
  {
    prompt: '¿Cuántos tonos principales tiene el mandarín estándar (sin el neutro)?',
    ruleHint: 'Sistema tonal.',
    ruleExplain: 'Cuatro tonos léxicos (alto, ascendente, descendente-ascendente, descendente) más el tono neutro.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['2', '3', '4', '5', '6', '1', '8', '7'],
    correctIndex: 2,
    explanation: 'Cuatro tonos léxicos principales, más el tono neutro.',
  },
  {
    prompt: '因为 (yīnwèi) introduce la causa. ¿Qué suele introducir la consecuencia?',
    ruleHint: 'Correlación causal.',
    ruleExplain: 'Estructura frecuente: 因为 … 所以 … (porque … por eso …).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['但是', '所以', '如果', '虽然', '而且', '或者', '还是', '因为 de nuevo'],
    correctIndex: 1,
    explanation: '因为 … 所以 … = porque … por eso …',
  },
]

const PT_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'En portugués brasileño coloquial, “a gente” funciona como…',
    ruleHint: 'Pronombres y concordancia en PT-BR.',
    ruleExplain: 'A gente significa “nosotros” pero concuerda en 3.ª persona singular: A gente vai (no vamos).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'ellos (3.ª plural)',
      'nosotros (con verbo en 3.ª singular)',
      'tú formal',
      'vosotros',
      'imperativo',
      'reflexivo obligatorio',
      'artículo indefinido',
      'nada de eso',
    ],
    correctIndex: 1,
    explanation: 'A gente = nosotros, pero el verbo va en 3.ª singular: A gente fala.',
  },
  {
    prompt: 'El infinitivo personal permite decir “para hablarmos” con el sentido de…',
    ruleHint: 'Infinitivo flexionado (rasgo del portugués).',
    ruleExplain: 'El infinitivo personal marca persona/número en el infinitivo: para falarmos = para que hablemos / al hablar nosotros.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'solo pasado',
      'persona y número en el infinitivo',
      'género del sujeto',
      'modo subjuntivo obligatorio',
      'negación',
      'futuro compuesto',
      'voz pasiva',
      'artículo definido',
    ],
    correctIndex: 1,
    explanation: 'Infinitivo personal: falarmos, dizeres… marca persona/número.',
  },
  {
    prompt: '“Obrigado” / “Obrigada” concuerda con…',
    ruleHint: 'Concordancia de cortesía.',
    ruleExplain: 'Quien agradece usa obrigado (hombre) u obrigada (mujer). No depende del interlocutor.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'el género del interlocutor',
      'el género de quien agradece',
      'el número del verbo',
      'el tiempo verbal',
      'la región solo',
      'el registro formal',
      'el objeto directo',
      'no concuerda nunca',
    ],
    correctIndex: 1,
    explanation: 'Obrigado/obrigada concuerda con quien dice gracias.',
  },
  {
    prompt: 'Sufijo típico de sustantivos abstractos (nación, información):',
    ruleHint: 'Morfología: -ção / -são.',
    ruleExplain: 'Como el español -ción/-sión, el portugués usa -ção/-são: nação, informação, decisão.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['-mente', '-ção / -são', '-íssimo', '-inho', '-dor solo', '-ar', '-vel sin más', '-ção nunca'],
    correctIndex: 1,
    explanation: '-ção/-são forma sustantivos abstractos: nação, decisão.',
  },
  {
    prompt: 'Pret. perfeito vs imperfeito: “Ontem ____ (falar) com ela uma vez.”',
    ruleHint: 'Acción cerrada en el pasado → pretérito perfeito.',
    ruleExplain: 'Pretérito perfeito: acciones terminadas y puntuales. Imperfeito: hábito, descripción, marco.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['falava', 'falei', 'falarei', 'falaria', 'falasse', 'falar', 'falando', 'falámos sempre'],
    correctIndex: 1,
    explanation: 'Acción puntual terminada ayer: falei (pretérito perfeito).',
  },
]

const DE_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'En una oración principal alemana, el verbo finito suele ir en…',
    ruleHint: 'Orden verb-second (V2).',
    ruleExplain: 'En la oración principal declarativa, el verbo conjugado ocupa la segunda posición. El primer slot puede ser sujeto, adverbio, complemento, etc.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'posición final siempre',
      'segunda posición',
      'primera siempre',
      'tercera fija',
      'libre total',
      'solo al inicio',
      'después de todos los objetos',
      'no hay regla',
    ],
    correctIndex: 1,
    explanation: 'Verbo finito en 2.ª posición en la principal (V2).',
  },
  {
    prompt: 'En una subordinada con “weil”, el verbo conjugado va…',
    ruleHint: 'Subordinadas: verbo al final.',
    ruleExplain: 'En Nebensätze introducidas por weil, dass, obwohl… el verbo finito se desplaza al final.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'en segunda posición',
      'al final de la subordinada',
      'al inicio',
      'antes del sujeto',
      'se omite',
      'en medio libre',
      'igual que en inglés',
      'después de weil inmediatamente',
    ],
    correctIndex: 1,
    explanation: 'weil + … + verbo finito al final: weil ich müde bin.',
  },
  {
    prompt: '“das Haus” está en caso…',
    ruleHint: 'Artículos marcan caso y género.',
    ruleExplain: 'Das puede ser nominativo o acusativo neutro. Sin más contexto, la forma del artículo neutro nominativo/acusativo es das.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['solo genitivo', 'nominativo o acusativo neutro', 'solo dativo', 'femenino', 'plural dativo', 'vocativo', 'ablativo', 'instrumental'],
    correctIndex: 1,
    explanation: 'das Haus: neutro nominativo o acusativo.',
  },
  {
    prompt: 'El sufijo “-ung” en “Bildung”, “Bedeutung” forma…',
    ruleHint: 'Morfología derivativa.',
    ruleExplain: '-ung forma sustantivos femeninos abstractos a partir de verbos (bilden → Bildung).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'adverbios',
      'sustantivos femeninos abstractos',
      'verbos de pasado',
      'plurales',
      'adjetivos solo',
      'preposiciones',
      'artículos',
      'pronombres',
    ],
    correctIndex: 1,
    explanation: '-ung → sustantivos femeninos abstractos (die Bildung).',
  },
  {
    prompt: 'Perfekt de “gehen” (yo):',
    ruleHint: 'Verbos de movimiento con sein.',
    ruleExplain: 'Geh en y muchos verbos de movimiento/cambio de estado forman el Perfekt con sein: ich bin gegangen.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'ich habe gegangen',
      'ich bin gegangen',
      'ich wurde gegangen',
      'ich war gehen',
      'ich gehe gewesen',
      'ich bin gehen',
      'ich habe gehen',
      'ich ging haben',
    ],
    correctIndex: 1,
    explanation: 'Ich bin gegangen (sein + Partizip II).',
  },
]

const IT_GRAMMAR: GrammarItem[] = [
  {
    prompt: 'Passato prossimo de “andare” (yo, masculino):',
    ruleHint: 'Essere + participio; acuerdo en género/número.',
    ruleExplain: 'Andare forma el passato prossimo con essere. El participio concuerda: sono andato / andata.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'ho andato',
      'sono andato',
      'sono andare',
      'ho andata',
      'andavo',
      'andrò',
      'sia andato solo',
      'andai (único correcto hoy)',
    ],
    correctIndex: 1,
    explanation: 'Sono andato (essere + participio acordado).',
  },
  {
    prompt: 'False friend: “camera” en italiano significa…',
    ruleHint: 'Cognados engañosos.',
    ruleExplain: 'Camera = habitación. Cámara fotográfica = macchina fotografica / fotocamera.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'cámara fotográfica',
      'habitación',
      'cámara de video solo',
      'parlamento',
      'caja',
      'cocina',
      'ventana',
      'puerta',
    ],
    correctIndex: 1,
    explanation: 'Camera = habitación (non “cámara” fotográfica).',
  },
  {
    prompt: 'El sufijo “-zione” en “nazione”, “informazione” indica…',
    ruleHint: 'Morfología: cognado de -ción.',
    ruleExplain: '-zione forma sustantivos abstractos, cognado del español -ción y del francés -tion.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'adverbio',
      'sustantivo abstracto',
      'plural',
      'pasado',
      'género masculino solo',
      'verbo',
      'artículo',
      'preposición',
    ],
    correctIndex: 1,
    explanation: '-zione → sustantivos abstractos (nazione, decisione).',
  },
  {
    prompt: '“Non … mai” significa…',
    ruleHint: 'Negación con mai.',
    ruleExplain: 'Mai = nunca. Con non forma la negación temporal: non parlo mai = no hablo nunca.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'siempre',
      'nunca',
      'a veces',
      'ya',
      'todavía',
      'también',
      'solo',
      'quizá',
    ],
    correctIndex: 1,
    explanation: 'Non … mai = nunca.',
  },
  {
    prompt: 'Artículo ante “uomo”:',
    ruleHint: 'Il / lo / l’ según inicio del sustantivo.',
    ruleExplain: 'Ante vocal se usa l’: l’uomo. Lo se usa ante s+consonante, z, gn, etc.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['il', 'lo', 'l’', 'la', 'gli', 'un', 'uno', 'del'],
    correctIndex: 2,
    explanation: 'L’uomo (elisión ante vocal).',
  },
]

const ES_GRAMMAR: GrammarItem[] = [
  {
    prompt: '“Estoy cansado” usa estar porque…',
    ruleHint: 'Ser vs estar.',
    ruleExplain: 'Estar: estados temporales, localización, progresivo, resultado. Ser: esencia, identidad, material, hora, origen.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'Para: finalidad, destinatario, plazo, dirección. Por: causa, medio, duración, intercambio, agente de pasiva.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
    ruleExplain: 'Deseo (quiero que…), duda, valoración, hipótesis y ciertas conjunciones activan subjuntivo.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
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
  {
    prompt: 'El sufijo “-ción” en “nación”, “educación” forma…',
    ruleHint: 'Morfología derivativa.',
    ruleExplain: '-ción/-sión crea sustantivos abstractos (a menudo desde verbos: educar → educación; decidir → decisión).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'adverbios de modo',
      'sustantivos abstractos',
      'plurales irregulares',
      'tiempos verbales',
      'artículos',
      'preposiciones',
      'pronombres átonos',
      'interjecciones',
    ],
    correctIndex: 1,
    explanation: '-ción/-sión → sustantivos abstractos (nación, decisión, información).',
  },
  {
    prompt: '“Ayer hablé con María” usa pretérito indefinido porque…',
    ruleHint: 'Indefinido vs imperfecto.',
    ruleExplain: 'Indefinido: acciones terminadas, puntuales o vista como cerradas. Imperfecto: hábito, descripción, acción en curso en el pasado.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: [
      'describe un hábito pasado',
      'es acción terminada / puntual en el pasado',
      'es estado permanente',
      'es futuro en el pasado',
      'es subjuntivo',
      'es condicional',
      'es presente histórico solo',
      'no marca tiempo',
    ],
    correctIndex: 1,
    explanation: 'Acción cerrada ayer → pretérito indefinido: hablé.',
  },
]

const GRAMMAR_BY_LANG: Record<LangId, GrammarItem[]> = {
  es: ES_GRAMMAR,
  en: EN_GRAMMAR,
  fr: FR_GRAMMAR,
  ja: JA_GRAMMAR,
  zh: ZH_GRAMMAR,
  pt: PT_GRAMMAR,
  de: DE_GRAMMAR,
  it: IT_GRAMMAR,
}

// Reading comprehension short passages
interface ReadingItem {
  passage: string
  prompt: string
  ruleHint: string
  ruleExplain: string
  /** Consejo si falla (sin revelar la respuesta). */
  failAdvice: string
  options: string[]
  correctIndex: number
  explanation: string
}

const READING_BY_LANG: Record<LangId, ReadingItem[]> = {
  en: [
    {
      passage:
        'In 1776, representatives of the thirteen colonies adopted the Declaration of Independence. The text argued that governments derive their just powers from the consent of the governed.',
      prompt: 'Según el texto, los gobiernos obtienen su poder legítimo de…',
      ruleHint: 'Comprensión: localiza la cláusula de “consent of the governed”.',
      ruleExplain: 'En textos históricos en inglés, las cláusulas de relativo y las nominalizaciones (-tion) concentran la idea principal.',
      failAdvice: 'Revisa la regla y descarta opciones incompatibles antes de elegir.',
      options: [
        'la fuerza militar solo',
        'el consentimiento de los gobernados',
        'la monarquía británica',
        'el comercio atlántico',
        'la Iglesia',
        'el azar',
        'los impuestos sin representación como ideal',
        'la geografía',
      ],
      correctIndex: 1,
      explanation: '“from the consent of the governed” = del consentimiento de los gobernados.',
    },
    {
      passage:
        'The Great Vowel Shift changed the pronunciation of long vowels in English between the 15th and 18th centuries. This is one reason modern spelling often fails to match modern sounds.',
      prompt: '¿Qué explica en parte que la ortografía inglesa no coincida con la pronunciación actual?',
      ruleHint: 'Causa histórica: Great Vowel Shift.',
      ruleExplain: 'Cambios fonológicos posteriores a la fijación ortográfica dejan “huellas” en la escritura.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'la invención del teléfono',
        'el Great Vowel Shift',
        'la norma de la RAE',
        'el latín clásico puro',
        'el esperanto',
        'la imprenta digital',
        'el francés moderno solo',
        'nada del texto',
      ],
      correctIndex: 1,
      explanation: 'El texto vincula el Great Vowel Shift con el desajuste ortografía–sonido.',
    },
  ],
  zh: [
    {
      passage: '秦始皇统一六国后，实行了书同文、车同轨等措施。统一文字有助于国家治理与文化交流。',
      prompt: 'Según el texto, ¿qué favoreció la unificación de la escritura?',
      ruleHint: 'Localiza 有助于 (contribuye a / ayuda a).',
      ruleExplain: 'En chino escrito, los compuestos y el orden SVO permiten localizar causa y efecto con marcadores como 有助于, 因为, 所以.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'solo el comercio marítimo',
        'la gobernanza y el intercambio cultural',
        'la abolición de los kanji',
        'el pinyin en el s. III a. C.',
        'la democracia ateniense',
        'el budismo únicamente',
        'la Ruta de la Seda solo',
        'nada',
      ],
      correctIndex: 1,
      explanation: '统一文字有助于国家治理与文化交流: favoreció gobernanza e intercambio cultural.',
    },
  ],
  ja: [
    {
      passage: '奈良時代に都が平城京に置かれ、仏教と律令制度が整備されました。多くの文化が大陸から伝来しました。',
      prompt: '¿Qué se consolidó en la época de Nara según el texto?',
      ruleHint: 'Busca 整備されました (se organizó / se puso en orden).',
      ruleExplain: 'La forma pasiva/cortés -mashta y los compuestos chino-japoneses (律令) marcan instituciones históricas.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'solo el anime',
        'el budismo y el sistema ritsuryō',
        'la constitución de 1947',
        'el shinto exclusivo sin budismo',
        'la escritura hangul',
        'el aislamiento total',
        'la era Meiji',
        'nada',
      ],
      correctIndex: 1,
      explanation: '仏教と律令制度が整備されました = se consolidaron budismo y sistema legal ritsuryō.',
    },
  ],
  fr: [
    {
      passage:
        'En 1539, l’ordonnance de Villers-Cotterêts imposa le français dans les actes administratifs du royaume, au détriment du latin.',
      prompt: '¿Qué lengua se impuso en los actos administrativos?',
      ruleHint: 'Localiza “imposa le français”.',
      ruleExplain: 'Passé simple narrativo (imposa) y léxico administrativo son frecuentes en textos históricos franceses.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'el latín únicamente',
        'el francés',
        'el occitano solo',
        'el inglés',
        'el alemán',
        'el vasco',
        'el griego',
        'ninguna',
      ],
      correctIndex: 1,
      explanation: 'La ordenanza impuso el francés en la administración.',
    },
  ],
  pt: [
    {
      passage:
        'No século XV, os navegadores portugueses abriram rotas marítimas para África, Ásia e o Brasil, espalhando a língua portuguesa por vários continentes.',
      prompt: '¿Qué expandió el portugués a varios continentes según el texto?',
      ruleHint: 'Causa: navegações / rotas marítimas.',
      ruleExplain: 'Pretérito perfeito (abriram, espalhando) narra hechos cerrados en el pasado histórico.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'solo la Unión Europea',
        'las rutas marítimas de los navegantes portugueses',
        'el Acordo Ortográfico de 1990',
        'la independencia de Brasil únicamente',
        'el galaico medieval sin expansión',
        'el español',
        'el latín papal',
        'nada',
      ],
      correctIndex: 1,
      explanation: 'Las navegaciones y rutas marítimas expandieron el portugués.',
    },
  ],
  de: [
    {
      passage:
        'Luther übersetzte die Bibel ins Deutsche. Diese Übersetzung trug wesentlich zur Entwicklung einer gemeinsamen deutschen Schriftsprache bei.',
      prompt: '¿Qué impulsó la traducción de Lutero según el texto?',
      ruleHint: 'Busca “trug … bei” (contribuyó).',
      ruleExplain: 'Verbo separable beitragen (trugt … bei) y compuestos (Schriftsprache) son típicos del alemán escrito.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'solo el dialecto bávaro',
        'una lengua escrita alemana común',
        'el francés como lengua oficial',
        'la desaparición del latín en Europa',
        'el inglés moderno',
        'el gótico',
        'nada',
        'el esperanto',
      ],
      correctIndex: 1,
      explanation: 'Contribuyó al desarrollo de una lengua escrita alemana común.',
    },
  ],
  it: [
    {
      passage:
        'Dante Alighieri, con la Divina Commedia, dimostrò che il volgare toscano poteva esprimere alta letteratura, non solo il latino.',
      prompt: '¿Qué demostró Dante según el texto?',
      ruleHint: 'Localiza “dimostrò che…”.',
      ruleExplain: 'Passato remoto narrativo (dimostrò) es habitual en italiano histórico escrito.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'que solo el latín servía para literatura',
        'que el vulgar toscano podía expresar alta literatura',
        'que el francés era superior',
        'que había que abolir los dialectos',
        'que el griego era obligatorio',
        'nada',
        'que la Commedia era en provenzal',
        'que el toscano era inferior',
      ],
      correctIndex: 1,
      explanation: 'El vulgar toscano podía expresar alta literatura.',
    },
  ],
  es: [
    {
      passage:
        'En 1492, Antonio de Nebrija publicó la Gramática de la lengua castellana, primera gramática de una lengua romance europea. Defendía que la lengua acompaña al imperio.',
      prompt: '¿Qué fue innovador en la obra de Nebrija según el texto?',
      ruleHint: 'Primera gramática de una lengua romance europea.',
      ruleExplain: 'El pretérito y las aposiciones (“primera gramática…”) condensan el dato histórico clave.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
      options: [
        'fue la primera novela',
        'fue la primera gramática de una lengua romance europea',
        'abolió la ñ',
        'impuso el latín en América',
        'creó el subjuntivo',
        'nada',
        'tradujo la Biblia al vasco',
        'prohibió los dialectos',
      ],
      correctIndex: 1,
      explanation: 'Fue la primera gramática de una lengua romance europea.',
    },
  ],
}

/** Total de niveles objetivo */
export const TOTAL_LEVELS = 3000

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
 * Genera pregunta determinista por nivel + idioma + modo preferido.
 */

export function generateQuestion(level: number, lang: LangId, preferredMode?: GameMode | 'auto'): Question {
  const L = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS)
  const lex = LEX_BY_LANG[lang]
  const grammar = GRAMMAR_BY_LANG[lang]
  const reading = READING_BY_LANG[lang] ?? []
  const cefr = levelToCefr(L)
  const difficulty = (clamp(1 + Math.floor((L - 1) / 500), 1, 5) as 1 | 2 | 3 | 4 | 5)

  const modeCycle: GameMode[] = [
    'translate_to_es',
    'translate_from_es',
    'grammar_deduce',
    'cognate_logic',
    'particle_or_order',
    'false_friends',
    'morphology',
    'contextual_usage',
    'reading_comprehension',
  ]

  let mode: GameMode =
    preferredMode && preferredMode !== 'auto'
      ? preferredMode
      : modeCycle[(L - 1) % modeCycle.length]

  const rotateOptions = (options: string[], correctIndex: number, salt: number, notes?: string[]) => {
    const rot = salt % options.length
    const rotated = [...options.slice(rot), ...options.slice(0, rot)]
    const newCorrect = (correctIndex - rot + options.length) % options.length
    const rotatedNotes = notes ? [...notes.slice(rot), ...notes.slice(0, rot)] : undefined
    return { options: rotated, correctIndex: newCorrect, notes: rotatedNotes }
  }

  // Reading
  if (mode === 'reading_comprehension' && reading.length > 0) {
    const r = reading[(L - 1) % reading.length]
    const rotated = rotateOptions(r.options, r.correctIndex, L)
    return {
      id: `${lang}-read-${L}`,
      lang,
      mode: 'reading_comprehension',
      level: L,
      cefr,
      prompt: r.prompt,
      passage: r.passage,
      ruleHint: r.ruleHint,
      ruleExplain: r.ruleExplain,
      failAdvice: 'Vuelve al pasaje y localiza la cláusula o palabra clave que responde a la pregunta; no elijas por intuición general.',
      options: rotated.options,
      correctIndex: rotated.correctIndex,
      explanation: r.explanation,
      difficulty,
    }
  }

  // Contextual usage: palabra → contexto
  if (mode === 'contextual_usage') {
    const contexts: Record<string, { prompt: string; options: string[]; correctIndex: number; hint: string; explain: string; advice: string; optionNotes: string[] }> = {
      en: {
        prompt: 'Palabra: 「bank」. En “we sat on the bank of the river”, ¿qué significa?',
        options: ['banco financiero', 'orilla del río', 'banqueta', 'archivo', 'pendiente', 'empresa', 'moneda', 'puente'],
        correctIndex: 1,
        hint: 'Polisemia: institución vs orilla.',
        explain: 'bank of the river = orilla.',
        advice: 'Mira el complemento “of the river”; no asumas siempre el sentido financiero.',
        optionNotes: [
          'Es el sentido más frecuente de "bank" en inglés cotidiano y de negocios: la institución que guarda dinero. Se usa en frases como "go to the bank" o "bank account".',
          '"Bank" también nombra el terreno elevado a los lados de un río o lago: es un sustantivo de geografía física, muy común en textos de naturaleza y en la expresión "riverbank".',
          '"Banqueta" no es un significado real de "bank" en inglés; en cambio "banquette" (con -tte) sí existe como préstamo del francés para un tipo de asiento tapizado.',
          '"Archivo" corresponde más bien a "file" o "archive" en inglés; no es un sentido de "bank", aunque "data bank" (banco de datos) sí existe como compuesto.',
          '"Pendiente" (de un terreno) se dice "slope" en inglés; no es un significado de "bank", aunque ambos describen accidentes del terreno.',
          '"Empresa" se dice "company" o "firm"; "bank" es un tipo específico de empresa financiera, no la palabra genérica para cualquier empresa.',
          '"Moneda" se dice "coin" o "currency"; no es un sentido de "bank", aunque el dinero se relacione con los bancos.',
          '"Puente" se dice "bridge"; no comparte raíz ni sentido con "bank", aunque ambos aparecen típicamente junto a un río.',
        ],
      },
      es: {
        prompt: 'Palabra: 「banco」. En “nos sentamos en un banco del parque”, ¿qué significa?',
        options: ['entidad financiera', 'asiento', 'banco de peces', 'archivo', 'grupo de datos', 'orilla', 'empresa', 'caja fuerte'],
        correctIndex: 1,
        hint: 'Polisemia según complemento.',
        explain: 'banco del parque = asiento.',
        advice: 'El complemento “del parque” orienta al asiento, no al banco financiero.',
        optionNotes: [
          'Es el sentido financiero de "banco": la institución que gestiona dinero, cuentas y préstamos. Es el significado más frecuente fuera de contexto.',
          'Un mueble alargado para sentarse, típico de parques, plazas e iglesias. Este sentido viene del mismo origen germánico que "banca" (el mueble de madera).',
          'Un "banco de peces" es un grupo numeroso de peces nadando juntos; es una metáfora antigua que comparó la fila de peces con la fila de asientos.',
          'Un lugar donde se guardan documentos; en español se dice "archivo", no "banco", aunque "banco de datos" sí es un compuesto real.',
          'Un "banco de datos" (o "base de datos") es un compuesto técnico informático; no es el sentido aislado de "banco" sin más contexto.',
          'La "orilla" de un río se llama así en español; "banco" solo se usa para orilla en el compuesto específico "banco de arena" (acumulación de arena bajo el agua).',
          'Una "empresa" es cualquier negocio; un banco es un tipo específico de empresa financiera, no el término genérico.',
          'Una "caja fuerte" es donde se guarda dinero en casa u oficina; no es sinónimo de "banco", aunque ambos se asocian con guardar dinero.',
        ],
      },
      fr: {
        prompt: 'Palabra: 「temps」. En “quel temps fait-il ?”, ¿qué significa?',
        options: ['tiempo cronológico', 'clima / tiempo atmosférico', 'tiempo verbal', 'tempo musical', 'época', 'horario', 'retraso', 'calendario'],
        correctIndex: 1,
        hint: 'Expresión fija con faire → clima.',
        explain: 'quel temps fait-il = qué tiempo hace.',
        advice: 'La construcción con “fait-il” apunta al clima, no al reloj.',
        optionNotes: [
          'Es el sentido de "tiempo" como duración medible con reloj o calendario; en francés general "temps" cubre este sentido, pero no es el que activa la expresión "faire" + tiempo.',
          'El clima o estado atmosférico de un momento dado; en francés se pregunta con la construcción fija "quel temps fait-il", literalmente "qué tiempo hace", igual que en español.',
          'El "tiempo verbal" (presente, pasado, futuro) se dice también "temps" en gramática francesa, pero ese sentido técnico no aparece con el verbo "faire".',
          'El "tempo" musical (velocidad de una pieza) se dice igual en italiano y se usa como préstamo en música; en francés cotidiano no se llama así.',
          'Una "época" histórica se puede decir "temps" en expresiones como "en ce temps-là" (en aquella época), pero no es el sentido activado por "quel temps fait-il".',
          'Un "horario" se dice "horaire" en francés, una palabra distinta de "temps".',
          'Un "retraso" se dice "retard" en francés; no comparte forma con "temps" aunque ambos se relacionen con el reloj.',
          'Un "calendario" se dice "calendrier"; es una palabra distinta, aunque relacionada semánticamente con medir el tiempo.',
        ],
      },
      ja: {
        prompt: 'Elemento: 「は」 como partícula de tema. ¿Cómo se pronuncia?',
        options: ['ha', 'wa', 'ba', 'pa', 'ga', 'wo', 'a', 'ho'],
        correctIndex: 1,
        hint: 'Lectura especial de partícula.',
        explain: 'は tema = wa.',
        advice: 'No uses la lectura del kana independiente; la partícula tema se lee wa.',
        optionNotes: [
          'Es la lectura normal del carácter は cuando aparece dentro de una palabra (como en 話す, "hanasu", hablar); esta es la lectura "por defecto" del kana, pero NO la que usa como partícula gramatical.',
          'Es la lectura histórica que se fijó por convención cuando は funciona como partícula de tema (wa), un caso especial heredado de la pronunciación del japonés antiguo, distinto de su lectura normal.',
          'は con un pequeño diacrítico (゛) se convierte en ば y se lee "ba"; es un kana totalmente distinto (con dakuten), no una lectura alternativa del mismo carácter.',
          'は con el diacrítico círculo (゜) se convierte en ぱ y se lee "pa" (handakuten); tampoco es una lectura de は sin modificar.',
          '"Ga" corresponde a otra partícula japonesa distinta (が), que marca el sujeto gramatical, no el tema; se escribe con un carácter diferente.',
          '"Wo" (を) es la partícula que marca el objeto directo del verbo; es un carácter y una función gramatical distintos de は.',
          '"A" no es una lectura de は; podría confundirse por la vocal final, pero は siempre lleva la consonante h/w, nunca se lee como vocal sola.',
          '"Ho" corresponde al kana ほ, visualmente parecido a は pero un carácter completamente distinto con su propia lectura fija.',
        ],
      },
      zh: {
        prompt: 'Partícula 「了」 en “我吃了” (cambio/completado). ¿Qué marca?',
        options: ['futuro', 'acción completada / cambio de estado', 'plural', 'posesión', 'pasiva', 'comparativo', 'clasificador', 'tono'],
        correctIndex: 1,
        hint: 'Aspecto, no tiempo europeo exacto.',
        explain: '了 aspectual de completado/cambio.',
        advice: 'No lo equinares automáticamente a un pretérito único; piensa en aspecto o cambio de estado.',
        optionNotes: [
          'El futuro en chino no se marca con 了 sino con adverbios como 会 (huì) o 将 (jiāng); 了 mira hacia atrás (algo ya sucedido o cambiado), no hacia adelante.',
          'Esta es la función real de 了 como partícula aspectual: marca que una acción se completó o que un estado cambió, un concepto llamado "aspecto" (distinto del tiempo verbal europeo, que marca cuándo, no si algo terminó).',
          'El plural en chino mandarín generalmente no se marca en el sustantivo con una partícula como 了; se marca con 们 (men) solo en pronombres/personas, o se sobreentiende por contexto.',
          'La posesión en chino se marca con la partícula 的 (de), un carácter y una función completamente distintos de 了.',
          'La voz pasiva en chino se marca con 被 (bèi), no con 了; 了 puede aparecer en frases pasivas, pero no es lo que crea la pasiva.',
          'El comparativo en chino se forma con 比 (bǐ) + adjetivo, una estructura sintáctica distinta que no usa 了.',
          'Un clasificador (como 个, 只, 本) es una palabra que acompaña obligatoriamente a los sustantivos contables en chino; es una categoría gramatical distinta de las partículas aspectuales como 了.',
          'El tono es un rasgo fonético (la melodía de la sílaba) que existe en todas las sílabas chinas; no es una función gramatical de 了, que es átono (sin tono marcado) en este uso.',
        ],
      },
      pt: {
        prompt: 'Expresión 「a gente」 (PT-BR). ¿Qué concordancia verbal usa?',
        options: ['1.ª plural (vamos)', '3.ª singular (vai)', '2.ª singular', '1.ª singular', '3.ª plural', 'imperativo', 'infinitivo', 'gerundio'],
        correctIndex: 1,
        hint: 'Significa “nosotros” pero concuerda en 3.ª singular.',
        explain: 'A gente vai / fala.',
        advice: 'No conjugues en 1.ª plural con a gente en el patrón coloquial brasileño descrito.',
        optionNotes: [
          'Es la concordancia "lógica" que uno esperaría porque "a gente" significa "nosotros"; sin embargo, gramaticalmente "a gente" es un sustantivo singular (como "la gente" en español), así que esta opción parece correcta por significado pero no lo es por forma gramatical.',
          'Es la concordancia real: como "a gente" es sintácticamente un sustantivo femenino singular, el verbo debe concordar en 3.ª persona del singular (como con "ela"), aunque el significado sea plural ("nosotros").',
          'La 2.ª persona singular ("tu vais/tu fala") no corresponde a "a gente", que no incluye al interlocutor de forma gramatical directa como "tú".',
          'La 1.ª persona singular ("eu vou") correspondería a "yo", no a "a gente", que siempre implica un grupo aunque concuerde en singular.',
          'La 3.ª persona plural ("eles vão") sería la concordancia si dijéramos "eles" (ellos), pero "a gente" es gramaticalmente singular, no plural.',
          'El imperativo es un modo verbal para dar órdenes, no una persona gramatical; no es la categoría que resuelve esta pregunta de concordancia.',
          'El infinitivo es la forma no conjugada del verbo (ir, falar); no expresa concordancia con ningún sujeto, así que no aplica aquí.',
          'El gerundio (indo, falando) expresa una acción en curso, no concordancia de persona; tampoco resuelve la pregunta planteada.',
        ],
      },
      de: {
        prompt: 'Conjunción 「weil」. ¿Qué hace al verbo conjugado de la subordinada?',
        options: ['segunda posición', 'lo envía al final', 'lo elimina', 'imperativo', 'infinitivo', 'al inicio', 'no cambia', 'modal'],
        correctIndex: 1,
        hint: 'Nebensatz: verbo al final.',
        explain: 'weil ich müde bin.',
        advice: 'Dentro de la subordinada con weil no dejes el verbo en V2.',
        optionNotes: [
          'La "segunda posición" (V2) es la regla del verbo conjugado en oraciones PRINCIPALES alemanas (Ich bin müde); "weil" introduce una subordinada, donde esta regla V2 deja de aplicar.',
          'Esta es la regla real: las conjunciones subordinantes como "weil", "dass", "wenn" u "obwohl" envían el verbo conjugado al final de la cláusula (Nebensatz), un rasgo característico de la sintaxis alemana ausente en español.',
          'El verbo nunca desaparece de una subordinada alemana; "weil" reordena la frase, pero el verbo conjugado sigue presente, solo que al final.',
          'El imperativo es un modo verbal para dar órdenes; "weil" introduce una explicación causal, no una orden, así que esta categoría no aplica.',
          'El infinitivo es la forma base del verbo (sein, gehen); en la subordinada con "weil" el verbo va conjugado (bin, gehe), no en infinitivo.',
          'Colocar el verbo "al inicio" es lo que ocurre en preguntas de sí/no alemanas (Bist du müde?), un patrón distinto al de las subordinadas con "weil".',
          'Decir que "no cambia" ignora la regla real: el verbo sí cambia de posición respecto a una oración principal equivalente, precisamente por ser una subordinada.',
          'Un verbo modal (können, müssen, wollen) es una categoría de verbos auxiliares de significado; "weil" es una conjunción que afecta el ORDEN de palabras, no crea ni exige un verbo modal.',
        ],
      },
      it: {
        prompt: 'Palabra 「camera」 en hotel. ¿Qué significa?',
        options: ['cámara fotográfica', 'habitación', 'salón', 'cocina', 'baño', 'recepción', 'ascensor', 'pasillo'],
        correctIndex: 1,
        hint: 'False friend con “cámara”.',
        explain: 'camera = habitación.',
        advice: 'En contexto hotelero no elijas cámara fotográfica.',
        optionNotes: [
          'Es la trampa del false friend: en español "cámara" evoca de inmediato el dispositivo fotográfico, pero en italiano ese objeto se llama "macchina fotografica", una palabra totalmente distinta.',
          'Este es el significado real de "camera" en italiano: habitación (de dormir, de hotel). Comparte origen etimológico lejano con "cámara" (ambas del latín camera, "bóveda/recinto"), pero el significado moderno divergió por completo.',
          'Un "salón" o sala de estar se dice "salotto" o "soggiorno" en italiano; no es el sentido de "camera", que se reserva para la habitación de dormir.',
          'Una "cocina" se dice "cucina" en italiano; es una palabra hermana del español "cocina", pero distinta de "camera".',
          'Un "baño" se dice "bagno" en italiano; es un false friend leve con "baño" en español (que suenan algo parecido), pero no tiene relación con "camera".',
          'La "recepción" de un hotel se dice "reception" (préstamo del inglés) o "portineria"; no se relaciona con "camera".',
          'Un "ascensor" se dice "ascensore" en italiano, cognado directo del español; no tiene relación con "camera".',
          'Un "pasillo" se dice "corridoio" en italiano; tampoco se relaciona con "camera", aunque ambos son partes comunes de un hotel.',
        ],
      },
    }
    const c = contexts[lang] ?? contexts.en
    const rotated = rotateOptions(c.options, c.correctIndex, L + 3, c.optionNotes)
    return {
      id: `${lang}-ctx-${L}`,
      lang,
      mode: 'contextual_usage',
      level: L,
      cefr,
      prompt: c.prompt,
      ruleHint: c.hint,
      ruleExplain: c.explain,
      failAdvice: c.advice,
      options: rotated.options,
      correctIndex: rotated.correctIndex,
      explanation: c.explain,
      difficulty,
      optionNotes: rotated.notes,
    }
  }

  // Grammar family
  if (
    (mode === 'grammar_deduce' ||
      mode === 'particle_or_order' ||
      mode === 'morphology' ||
      mode === 'false_friends') &&
    grammar.length > 0
  ) {
    const g = grammar[(L - 1) % grammar.length]
    const rotated = rotateOptions(g.options, g.correctIndex, L, g.optionNotes)
    return {
      id: `${lang}-g-${L}`,
      lang,
      mode,
      level: L,
      cefr,
      prompt: g.prompt,
      passage: g.passage,
      ruleHint: g.ruleHint,
      ruleExplain: g.ruleExplain,
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir; no te guíes solo por el parecido superficial.',
      options: rotated.options,
      correctIndex: rotated.correctIndex,
      explanation: g.explanation,
      difficulty,
      optionNotes: rotated.notes,
    }
  }

  if (!lex.length) {
    return {
      id: `${lang}-fallback-${L}`,
      lang,
      mode: 'translate_to_es',
      level: L,
      cefr,
      prompt: 'Elige la opción coherente con la deducción lingüística.',
      ruleHint: 'Aplica la regla del idioma activo.',
      ruleExplain: 'Elimina opciones imposibles.',
      failAdvice: 'Abre la pista y descarta sistemáticamente lo incompatible con la regla.',
      options: ['Opción A', 'Opción B', 'Opción C', 'Opción D', 'Opción E', 'Opción F', 'Opción G', 'Opción H'],
      correctIndex: (L % 8),
      explanation: 'Nivel de refuerzo.',
      difficulty: 1,
    }
  }

  const item = lex[(L - 1) % lex.length]
  const targetPool = DISTRACTORS[lang] ?? ES_DISTRACTORS
  const esPool = ES_DISTRACTORS

  const rootHint = item.root
    ? `Raíz/lexema a memorizar: 「${item.root}」. Descompón en bloques conocidos.`
    : 'Deduce por cognado, contexto o regla del idioma.'
  const ety = item.etymology || item.note
  const lexBlock =
    item.lexemes && item.lexemes.length
      ? ` Bloques: ${item.lexemes.join(' + ')}.`
      : ''

  if (mode === 'morphology' || mode === 'cognate_logic') {
    const built = buildOptions(item.es, esPool, 8)
    return {
      id: `${lang}-morph-${L}`,
      lang,
      mode,
      level: L,
      cefr,
      prompt:
        mode === 'morphology'
          ? `Morfología: descompón 「${item.target}」. ¿Qué significa en español?`
          : `Cognado/raíz: 「${item.target}」. ¿Qué significa en español?`,
      ruleHint: item.rule || rootHint,
      ruleExplain:
        (item.note || '') +
        ' ' +
        (item.etymology || 'Busca la raíz compartida y el sufijo/prefijo.') +
        lexBlock +
        ' Memoriza el lexema para reutilizarlo en palabras nuevas.',
      failAdvice:
        'Identifica la raíz primero; luego el prefijo/sufijo. No elijas solo por parecido superficial de letras.',
      options: built.options,
      correctIndex: built.correctIndex,
      explanation: `${item.target} → ${item.es}. ${item.note}${lexBlock}`,
      difficulty,
      rootFocus: item.root,
      etymology: ety,
    }
  }

  if (mode === 'translate_to_es') {
    const built = buildOptions(item.es, esPool, 8)
    return {
      id: `${lang}-toes-${L}`,
      lang,
      mode,
      level: L,
      cefr,
      prompt: `¿Qué significa en español: 「${item.target}」?`,
      ruleHint: item.rule || rootHint,
      ruleExplain:
        item.note +
        ' Busca raíces, género/número y evita calcos literales.' +
        (item.etymology ? ` Etimología: ${item.etymology}` : ''),
      failAdvice: 'Revisa cognados y false friends; no elijas solo por parecido de letras.',
      options: built.options,
      correctIndex: built.correctIndex,
      explanation: `${item.target} → ${item.es}. ${item.note}`,
      difficulty,
      rootFocus: item.root,
      etymology: ety,
    }
  }

  const built = buildOptions(item.target, targetPool, 8)
  return {
    id: `${lang}-fromes-${L}`,
    lang,
    mode: mode === 'translate_from_es' ? 'translate_from_es' : mode,
    level: L,
    cefr,
    prompt: `¿Cómo se dice en ${LANG_PROFILES[lang].name}: 「${item.es}」?`,
    ruleHint: item.rule || rootHint,
    ruleExplain:
      item.note +
      ' Atiende artículos, género e irregularidades.' +
      (item.etymology ? ` Etimología: ${item.etymology}` : ''),
    failAdvice: 'Descarta false friends y calcos del español; busca la forma nativa habitual.',
    options: built.options,
    correctIndex: built.correctIndex,
    explanation: `${item.es} → ${item.target}. ${item.note}`,
    difficulty,
    rootFocus: item.root,
    etymology: ety,
  }
}


/** Busca en el banco léxico del idioma la entrada que corresponde a un
 * texto de opción exacto (en español o en el idioma activo), para poder
 * explicar individualmente cada opción de una pregunta real. */
export function findLexEntry(lang: LangId, text: string): LexItem | undefined {
  const lex = LEX_BY_LANG[lang]
  const clean = text.trim().toLowerCase()
  return lex.find((it) => {
    const es = it.es.trim().toLowerCase()
    const target = it.target.trim().toLowerCase()
    const targetFirst = target.split(/[/(]/)[0].trim()
    return es === clean || target === clean || targetFirst === clean
  })
}

export function generateLevelBank(lang: LangId, count = TOTAL_LEVELS): Question[] {
  return Array.from({ length: count }, (_, i) => generateQuestion(i + 1, lang))
}

const MODE_CYCLE: GameMode[] = [
  'translate_to_es',
  'translate_from_es',
  'grammar_deduce',
  'cognate_logic',
  'particle_or_order',
  'false_friends',
  'morphology',
  'contextual_usage',
  'reading_comprehension',
]

/** Modo que le tocará a un nivel dado (misma regla que generateQuestion). */
export function modeForLevel(level: number, preferredMode?: GameMode | 'auto'): GameMode {
  const L = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS)
  return preferredMode && preferredMode !== 'auto'
    ? preferredMode
    : MODE_CYCLE[(L - 1) % MODE_CYCLE.length]
}

/**
 * Vocabulario que aparecerá alrededor de un nivel: se usa para "enseñar antes
 * de jugar". Devuelve una pequeña ventana de palabras del banco léxico del
 * idioma, centrada en la palabra que ese nivel usará, para que el jugador
 * llegue a la pregunta ya conociendo el significado, la etimología y cómo
 * pronunciarlas.
 */
export function previewLexForLevel(lang: LangId, level: number, windowSize = 4): LexItem[] {
  const lex = LEX_BY_LANG[lang]
  if (!lex.length) return []
  const L = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS)
  const centerIdx = (L - 1) % lex.length
  const items: LexItem[] = []
  const seen = new Set<number>()
  for (let offset = 0; offset < Math.min(windowSize, lex.length); offset++) {
    const idx = (centerIdx + offset) % lex.length
    if (seen.has(idx)) break
    seen.add(idx)
    items.push(lex[idx])
  }
  return items
}

/** Si el nivel es de tipo gramatical, devuelve la estructura clave a repasar antes de jugar. */
export function previewGrammarForLevel(
  lang: LangId,
  level: number,
  preferredMode?: GameMode | 'auto'
): GrammarItem | null {
  const mode = modeForLevel(level, preferredMode)
  const grammarModes: GameMode[] = ['grammar_deduce', 'particle_or_order', 'morphology', 'false_friends']
  if (!grammarModes.includes(mode)) return null
  const grammar = GRAMMAR_BY_LANG[lang]
  if (!grammar || !grammar.length) return null
  const L = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS)
  return grammar[(L - 1) % grammar.length]
}

// -----------------------------------------------------------------------------
// Historias de lectura (bilingües + APA)
// -----------------------------------------------------------------------------

const STORIES: Story[] = [
  {
    id: 'china-qin',
    region: 'China',
    titleEs: 'La unificación bajo Qin Shi Huang',
    titleOriginal: '秦始皇与统一',
    lang: 'zh',
    textEs: `En el año 221 a. C., el estado de Qin conquistó a los demás reinos combatientes y su rey adoptó el título de Primero Emperador (Qin Shi Huang). Entre las medidas de unificación destacaron la estandarización de la escritura, de pesos y medidas, y de la anchura de los ejes de los carros. Estas políticas buscaban cohesionar un territorio vasto y diverso bajo una administración central.

La escritura unificada facilitó el gobierno y la transmisión de documentos. Al mismo tiempo, la dureza del régimen y las grandes obras (murallas, caminos, el mausoleo con el ejército de terracota) dejaron una memoria ambivalente: orden e integración, pero también coerción. El legado institucional y simbólico de Qin atraviesa la historia china posterior.`,
    textOriginal: `公元前221年，秦国征服了其他战国，其国王采用了“始皇帝”的称号。统一措施包括统一文字、度量衡和车轨宽度。这些政策旨在将广阔而多样的领土凝聚在中央行政之下。

统一的文字有助于治理和文件传递。与此同时，政权的严厉和大型工程（长城、道路、兵马俑陵墓）留下了矛盾的记忆：秩序与整合，但也有强制。秦的制度与象征遗产贯穿了此后的中国历史。`,
    apa: 'Twitchett, D., & Loewe, M. (Eds.). (1986). The Cambridge history of China: Vol. 1. The Ch’in and Han Empires, 221 B.C.–A.D. 220. Cambridge University Press.',
    note: 'Síntesis académica sobre Qin y Han tempranos.',
    tags: ['historia', 'unificación', 'escritura', 'China antigua'],
  },
  {
    id: 'japan-nara',
    region: 'Japón',
    titleEs: 'La capital de Nara y el Estado ritsuryō',
    titleOriginal: '奈良の都と律令国家',
    lang: 'ja',
    textEs: `En el siglo VIII, la corte japonesa estableció la capital en Heijō-kyō (Nara), inspirada en modelos continentales. Se consolidó el sistema ritsuryō: códigos penales y administrativos que organizaban la burocracia, la tierra y los rangos. El budismo recibió patrocinio estatal y se construyeron grandes templos.

La escritura, los títulos y muchas instituciones llegaron desde el continente, pero se adaptaron al contexto japonés. Nara fue un centro de intercambio cultural y de poder simbólico. Aunque la capital se trasladó después a Heian (Kyoto), el periodo de Nara dejó huella en la religión, la literatura y la idea de Estado centralizado.`,
    textOriginal: `8世紀、日本の朝廷は大陸のモデルに触発されて平城京（奈良）に都を置きました。律令制が整備され、官僚・土地・位階を組織する刑法と行政法が整えられました。仏教は国家の保護を受け、大寺が建立されました。

文字や官職、多くの制度は大陸から伝来しましたが、日本の文脈に適応しました。奈良は文化交流と象徴的権力の中心でした。その後都は平安（京都）へ移りますが、奈良時代は宗教・文学・中央国家の観念に足跡を残しました。`,
    apa: 'Totman, C. (2005). A history of Japan (2nd ed.). Blackwell.',
    note: 'Panorama histórico de Japón, incluido el periodo de Nara.',
    tags: ['Nara', 'budismo', 'ritsuryō', 'Japón antiguo'],
  },
  {
    id: 'usa-independence',
    region: 'Estados Unidos',
    titleEs: 'La Declaración de Independencia (1776)',
    titleOriginal: 'The Declaration of Independence (1776)',
    lang: 'en',
    textEs: `En julio de 1776, representantes de las trece colonias adoptaron la Declaración de Independencia. El texto, cuyo borrador principal se atribuye a Thomas Jefferson, sostiene que todos los hombres son creados iguales y están dotados de derechos inalienables, entre ellos la vida, la libertad y la búsqueda de la felicidad.

Argumenta que los gobiernos derivan sus poderes legítimos del consentimiento de los gobernados y que el pueblo tiene derecho a alterar o abolir un gobierno destructivo de esos fines. El documento justificó la ruptura con la Corona británica y se convirtió en referente simbólico de movimientos democráticos posteriores, pese a las contradicciones de su época (esclavitud, exclusión de mujeres y de pueblos indígenas del pacto político pleno).`,
    textOriginal: `In July 1776, representatives of the thirteen colonies adopted the Declaration of Independence. The text, whose principal draft is attributed to Thomas Jefferson, holds that all men are created equal and are endowed with unalienable rights, among them life, liberty, and the pursuit of happiness.

It argues that governments derive their just powers from the consent of the governed and that the people have the right to alter or abolish a government destructive of those ends. The document justified the break with the British Crown and became a symbolic reference for later democratic movements, despite the contradictions of its age (slavery, the exclusion of women and Indigenous peoples from full political membership).`,
    apa: 'Maier, P. (1997). American scripture: Making the Declaration of Independence. Knopf.',
    note: 'Estudio histórico sobre la elaboración y el significado de la Declaración.',
    tags: ['independencia', 'EE. UU.', 'siglo XVIII', 'derechos'],
  },
  {
    id: 'mexico-maya',
    region: 'México / Mundo maya',
    titleEs: 'Ciudades mayas y el conocimiento del tiempo',
    titleOriginal: 'Ciudades mayas y el conocimiento del tiempo',
    lang: 'es',
    textEs: `En las tierras bajas de Mesoamérica, las ciudades mayas desarrollaron una escritura glífica, una matemática posicional con concepto de cero y calendarios de gran precisión. Centros como Tikal, Calakmul, Palenque y Copán fueron escenarios de dinastías, alianzas y conflictos.

Los gobernantes legitimaban su poder mediante rituales, genealogías y la observación astronómica. El colapso de muchas ciudades del periodo Clásico (c. siglos VIII–IX) no significó la desaparición de los pueblos mayas: continuaron transformándose en el Posclásico y hasta el presente. Leer la historia maya es leer una civilización de complejidad estatal, artística y científica en el corazón de América.`,
    textOriginal: `En las tierras bajas de Mesoamérica, las ciudades mayas desarrollaron una escritura glífica, una matemática posicional con concepto de cero y calendarios de gran precisión. Centros como Tikal, Calakmul, Palenque y Copán fueron escenarios de dinastías, alianzas y conflictos.

Los gobernantes legitimaban su poder mediante rituales, genealogías y la observación astronómica. El colapso de muchas ciudades del periodo Clásico (c. siglos VIII–IX) no significó la desaparición de los pueblos mayas: continuaron transformándose en el Posclásico y hasta el presente. Leer la historia maya es leer una civilización de complejidad estatal, artística y científica en el corazón de América.`,
    apa: 'Sharer, R. J., & Traxler, L. P. (2006). The ancient Maya (6th ed.). Stanford University Press.',
    note: 'Obra de referencia sobre la civilización maya.',
    tags: ['maya', 'Mesoamérica', 'calendario', 'escritura'],
  },
  {
    id: 'france-villers',
    region: 'Francia',
    titleEs: 'Villers-Cotterêts y el francés administrativo',
    titleOriginal: 'Villers-Cotterêts et le français administratif',
    lang: 'fr',
    textEs: `En 1539, la ordenanza de Villers-Cotterêts, promulgada bajo Francisco I, dispuso que los actos jurídicos y notariales del reino se redactaran en francés y no en latín. Fue un paso decisivo en la elevación del francés a lengua de Estado.

El proceso no eliminó de golpe las variedades regionales, pero orientó la administración hacia un estándar emergente centrado en el habla de la Île-de-France. La historia del francés estándar es, en buena medida, la historia de cómo una variedad local se convirtió en norma nacional e internacional (francofonía).`,
    textOriginal: `En 1539, l’ordonnance de Villers-Cotterêts, promulguée sous François Ier, disposa que les actes juridiques et notariés du royaume seraient rédigés en français et non en latin. Ce fut un pas décisif dans l’élévation du français au rang de langue d’État.

Le processus n’élimina pas d’un coup les variétés régionales, mais orienta l’administration vers un standard émergent centré sur la parole de l’Île-de-France. L’histoire du français standard est, en grande partie, celle de la façon dont une variété locale est devenue norme nationale et internationale (francophonie).`,
    apa: 'Lodge, R. A. (1993). French: From dialect to standard. Routledge.',
    note: 'Del dialecto al estándar francés.',
    tags: ['francés', 'Estado', 'siglo XVI', 'norma'],
  },
  {
    id: 'portugal-navegacoes',
    region: 'Portugal / Lusofonía',
    titleEs: 'Las navegaciones portuguesas y la lengua',
    titleOriginal: 'As navegações portuguesas e a língua',
    lang: 'pt',
    textEs: `En los siglos XV y XVI, los navegantes portugueses abrieron rutas marítimas hacia África, Asia y el Brasil. Con los barcos viajaron personas, mercancías y también la lengua portuguesa, que arraigó en territorios muy distantes.

El resultado fue una red lusófona que hoy incluye Portugal, Brasil y países africanos y asiáticos. El portugués se diversificó: el brasileño y el europeo difieren en pronunciación y en algunos usos, pero comparten un núcleo gramatical y léxico que permite la lectura mutua con relativa facilidad. La historia de la lengua es inseparable de la historia atlántica y colonial, con todas sus luces y sombras.`,
    textOriginal: `Nos séculos XV e XVI, os navegadores portugueses abriram rotas marítimas para África, Ásia e o Brasil. Com os navios viajaram pessoas, mercadorias e também a língua portuguesa, que se enraizou em territórios muito distantes.

O resultado foi uma rede lusófona que hoje inclui Portugal, Brasil e países africanos e asiáticos. O português diversificou-se: o brasileiro e o europeu diferem na pronúncia e em alguns usos, mas partilham um núcleo gramatical e lexical que permite a leitura mútua com relativa facilidade. A história da língua é inseparável da história atlântica e colonial, com todas as suas luzes e sombras.`,
    apa: 'Teyssier, P. (1984). História da língua portuguesa. Sá da Costa.',
    note: 'Historia de la lengua portuguesa en contexto de expansión.',
    tags: ['portugués', 'navegaciones', 'Brasil', 'lusofonía'],
  },
  {
    id: 'germany-luther',
    region: 'Alemania',
    titleEs: 'Lutero y la lengua escrita alemana',
    titleOriginal: 'Luther und die deutsche Schriftsprache',
    lang: 'de',
    textEs: `En el siglo XVI, Martín Lutero tradujo la Biblia al alemán. Su traducción, basada en un alemán comprensible para un público amplio y apoyada por la imprenta, contribuyó de forma decisiva a la formación de una lengua escrita común por encima de los dialectos.

No “inventó” el alemán moderno de la nada, pero fijó modelos léxicos y sintácticos de enorme difusión. La historia del Hochdeutsch está ligada a la reforma religiosa, a la imprenta y a las necesidades de comunicación en un espacio políticamente fragmentado.`,
    textOriginal: `Im 16. Jahrhundert übersetzte Martin Luther die Bibel ins Deutsche. Seine Übersetzung, die auf einem für ein breites Publikum verständlichen Deutsch beruhte und durch den Buchdruck verbreitet wurde, trug entscheidend zur Herausbildung einer gemeinsamen Schriftsprache über den Dialekten bei.

Er „erfand“ das moderne Deutsch nicht aus dem Nichts, aber er fixierte lexikalische und syntaktische Modelle von enormer Verbreitung. Die Geschichte des Hochdeutschen ist mit der religiösen Reform, dem Buchdruck und dem Kommunikationsbedarf in einem politisch zersplitterten Raum verbunden.`,
    apa: 'Keller, R. E. (1978). The German language. Faber & Faber.',
    note: 'Historia y estandarización del alemán.',
    tags: ['Lutero', 'Biblia', 'alemán', 'imprenta'],
  },
  {
    id: 'italy-dante',
    region: 'Italia',
    titleEs: 'Dante y el prestigio del vulgar toscano',
    titleOriginal: 'Dante e il prestigio del volgare toscano',
    lang: 'it',
    textEs: `Con la Divina Commedia, Dante Alighieri demostró que el vulgar toscano podía sostener una obra de altísima ambición literaria, no solo el latín. Su elección y su éxito influyeron en el prestigio del toscano como base del italiano literario posterior.

La unificación política del siglo XIX impulsó un estándar nacional, pero la semilla simbólica es medieval y renacentista: una lengua “de sí” capaz de filosofía, teología y poesía épica. Leer a Dante es leer también el nacimiento de una conciencia lingüística italiana.`,
    textOriginal: `Con la Divina Commedia, Dante Alighieri dimostrò che il volgare toscano poteva sostenere un’opera di altissima ambizione letteraria, non solo il latino. La sua scelta e il suo successo influenzarono il prestigio del toscano come base dell’italiano letterario successivo.

L’unificazione politica del XIX secolo spinse uno standard nazionale, ma il seme simbolico è medievale e rinascimentale: una lingua «di sì» capace di filosofia, teologia e poesia epica. Leggere Dante è leggere anche la nascita di una coscienza linguistica italiana.`,
    apa: 'Maiden, M. (1995). A linguistic history of Italian. Longman.',
    note: 'Historia lingüística del italiano y papel del toscano.',
    tags: ['Dante', 'toscano', 'italiano', 'literatura'],
  },
  {
    id: 'world-silkroad',
    region: 'Ruta de la Seda / Eurasia',
    titleEs: 'La Ruta de la Seda: intercambio y lenguas',
    titleOriginal: 'The Silk Road: exchange and languages',
    lang: 'en',
    textEs: `Durante siglos, redes de rutas terrestres y marítimas conectaron China, Asia Central, Persia, India, el Oriente Próximo y el Mediterráneo. Por ellas circulaban seda, especias, metales, ideas religiosas y también palabras.

El contacto sostenido entre hablantes de familias distintas (sínica, indoeuropea, túrquica, semítica…) generó préstamos, rutas de traducción y ciudades multilingües. La “Ruta de la Seda” no fue una sola carretera, sino un sistema de intercambios que recuerda que las lenguas crecen en el tráfico, no en el aislamiento.`,
    textOriginal: `For centuries, networks of land and sea routes linked China, Central Asia, Persia, India, the Near East, and the Mediterranean. Along them circulated silk, spices, metals, religious ideas—and words.

Sustained contact among speakers of different families (Sinitic, Indo-European, Turkic, Semitic…) produced loanwords, translation routes, and multilingual cities. The “Silk Road” was not a single highway but a system of exchanges that reminds us languages grow in traffic, not in isolation.`,
    apa: 'Hansen, V. (2012). The Silk Road: A new history. Oxford University Press.',
    note: 'Historia actualizada de la Ruta de la Seda.',
    tags: ['Ruta de la Seda', 'préstamos', 'Eurasia', 'contacto'],
  },
  {
    id: 'mexico-independencia',
    region: 'México',
    titleEs: 'Independencia de México: lengua e identidad',
    titleOriginal: 'Independencia de México: lengua e identidad',
    lang: 'es',
    textEs: `El proceso de independencia de la Nueva España (1810–1821) no solo redefinió el poder político; también reordenó símbolos, lealtades y el lugar del español como lengua de la naciente república, en un territorio multilingüe con decenas de lenguas indígenas.

El español era ya lengua de administración y de élites, pero la construcción nacional del siglo XIX y XX osciló entre la homogeneización lingüística y el reconocimiento (a menudo incompleto) de la diversidad. Leer la independencia en clave lingüística es preguntarse quién hablaba, en qué lengua se legiferaba y qué voces quedaron al margen de los documentos fundacionales.`,
    textOriginal: `El proceso de independencia de la Nueva España (1810–1821) no solo redefinió el poder político; también reordenó símbolos, lealtades y el lugar del español como lengua de la naciente república, en un territorio multilingüe con decenas de lenguas indígenas.

El español era ya lengua de administración y de élites, pero la construcción nacional del siglo XIX y XX osciló entre la homogeneización lingüística y el reconocimiento (a menudo incompleto) de la diversidad. Leer la independencia en clave lingüística es preguntarse quién hablaba, en qué lengua se legiferaba y qué voces quedaron al margen de los documentos fundacionales.`,
    apa: 'Van Young, E. (2001). The other rebellion: Popular violence, ideology, and the Mexican struggle for independence, 1810–1821. Stanford University Press.',
    note: 'Estudio sobre la independencia mexicana y sus dimensiones sociales.',
    tags: ['México', 'independencia', 'multilingüismo', 'nación'],
  },
  {
    id: 'prehistory-lascaux',
    region: 'Prehistoria / Europa occidental',
    titleEs: 'Lascaux y la mente simbólica',
    titleOriginal: 'Lascaux and the symbolic mind',
    lang: 'en',
    textEs: `Hace unos 17.000 años, en el suroeste de Francia, grupos de Homo sapiens decoraron Lascaux con bisontes, caballos y signos. No es arte de museo: es evidencia de una mente capaz de representar lo ausente y compartirlo. Esa capacidad de desplazar la referencia —hablar o pintar sobre lo que no está aquí y ahora— es un pilar de cualquier lengua humana posterior.

Las hipótesis (magia de caza, chamanismo, enseñanza, calendarios) siguen abiertas. Lo seguro es más sobrio y asombroso: en la penumbra de una cueva, la especie ya practicaba la representación compartida.`,
    textOriginal: `About 17,000 years ago in southwestern France, Homo sapiens groups decorated Lascaux with bison, horses, and signs. This is not museum “art”: it is evidence of a mind able to represent the absent and share it. That capacity to displace reference—to speak or paint about what is not here and now—is a pillar of any later human language.

Hypotheses (hunting magic, shamanism, teaching, calendars) remain open. What is certain is soberer and more astonishing: in cave half-light, the species was already practicing shared representation.`,
    apa: 'Clottes, J. (2008). Cave art. Phaidon.',
    note: 'Arte parietal paleolítico.',
    tags: ['prehistoria', 'Lascaux', 'símbolos'],
  },
  {
    id: 'athens-democracy',
    region: 'Atenas / Grecia clásica',
    titleEs: 'Atenas: democracia, imperio y contradicción',
    titleOriginal: 'Athens: democracy, empire, and contradiction',
    lang: 'en',
    textEs: `En el siglo V a. C., Atenas impulsó la participación directa de ciudadanos varones en la asamblea y tribunales populares. Al mismo tiempo sostuvo un imperio naval con tributos de la Liga de Delos y excluyó a mujeres, metecos y esclavos del núcleo cívico.

Curiosidad: el ostracismo permitía exiliar a un ciudadano por voto popular sin condena penal formal. Leer “demos” sin esa doble cara empobrece cualquier texto griego antiguo.`,
    textOriginal: `In the fifth century BCE, Athens advanced direct participation of male citizens in the assembly and popular courts. At the same time it sustained a naval empire with Delian League tribute and excluded women, metics, and slaves from the civic core.

Curiosity: ostracism allowed exile by popular vote without a formal criminal conviction. Reading demos without that double face impoverishes any ancient Greek text.`,
    apa: 'Hansen, M. H. (1999). The Athenian democracy in the age of Demosthenes. University of Oklahoma Press.',
    note: 'Instituciones atenienses.',
    tags: ['Atenas', 'democracia', 'ostracismo'],
  },
  {
    id: 'gobekli',
    region: 'Prehistoria / Anatolia',
    titleEs: 'Göbekli Tepe: santuarios antes de la ciudad',
    titleOriginal: 'Göbekli Tepe: sanctuaries before the city',
    lang: 'en',
    textEs: `Göbekli Tepe (c. 9600–8000 a. C.) desafió la secuencia cómoda “primero aldea agrícola, después templo”. Recintos megalíticos con pilares en T sugieren cooperación ritual a gran escala entre comunidades aún no urbanas.

Donde hay pilares alineados e iconografía recurrente hay mente colectiva articulada por signos: nombres, instrucciones, tabúes, relatos.`,
    textOriginal: `Göbekli Tepe (c. 9600–8000 BCE) unsettled the comfortable sequence “first farming village, then temple.” Megalithic enclosures with T-shaped pillars suggest large-scale ritual cooperation among not-yet-urban communities.

Where pillars align and iconography recurs, there is collective mind articulated by signs: names, instructions, taboos, stories.`,
    apa: 'Schmidt, K. (2012). Göbekli Tepe: A Stone Age sanctuary in south-eastern Anatolia. ex oriente.',
    note: 'Excavaciones en Göbekli Tepe.',
    tags: ['neolítico', 'ritual', 'Anatolia'],
  },
  {
    id: 'timbuktu',
    region: 'África occidental',
    titleEs: 'Timbuktú: manuscritos en el borde del desierto',
    titleOriginal: 'Timbuktu: manuscripts at the desert’s edge',
    lang: 'en',
    textEs: `Entre los siglos XIV y XVII, Timbuktú fue nodo de comercio y saber islámico en el Sahel. Sus manuscritos —teología, derecho, astronomía, poesía— desmienten la caricatura de un África “sin escritura”.

Muchos fondos familiares conservaron códices durante generaciones. La historia del conocimiento también pasa por patios, cofres y rutas de caravanas.`,
    textOriginal: `Between the fourteenth and seventeenth centuries, Timbuktu was a node of trade and Islamic learning in the Sahel. Its manuscripts—theology, law, astronomy, poetry—refute the caricature of an Africa “without writing.”

Many family collections preserved codices for generations. The history of knowledge also passes through courtyards, chests, and caravan routes.`,
    apa: 'Jeppie, S., & Diagne, S. B. (Eds.). (2008). The meanings of Timbuktu. HSRC Press.',
    note: 'Manuscritos y saber en Timbuktú.',
    tags: ['Timbuktú', 'manuscritos', 'Sahel'],
  },
  {
    id: 'carthage-rome',
    region: 'Mediterráneo antiguo',
    titleEs: 'Cartago y Roma: un duelo que reordenó Occidente',
    titleOriginal: 'Carthage and Rome: a duel that reset the West',
    lang: 'en',
    textEs: `Las Guerras Púnicas enfrentaron una potencia comercial norteafricana y una república itálica en expansión. Tras 146 a. C., Roma no solo eliminó un rival: reordenó el Mediterráneo occidental.

El púnico dejó huellas en toponimia y bilingüismo norteafricano durante siglos. Las lenguas de los vencidos no siempre mueren el mismo día que sus murallas.`,
    textOriginal: `The Punic Wars set a North African commercial power against an expanding Italic republic. After 146 BCE, Rome did not merely remove a rival: it reset the western Mediterranean.

Punic left traces in place names and North African bilingualism for centuries. The languages of the defeated do not always die on the same day as their walls.`,
    apa: 'Hoyos, D. (2015). Mastering the West: Rome and Carthage at war. Oxford University Press.',
    note: 'Conflicto romano-cartaginés.',
    tags: ['Cartago', 'Roma', 'Púnicas'],
  },
  {
    id: 'inca-khipu',
    region: 'Andes',
    titleEs: 'Khipus incaicos: contabilidad en cuerdas',
    titleOriginal: 'Inka khipus: accounting in cords',
    lang: 'en',
    textEs: `El Tahuantinsuyu administró un imperio andino sin escritura alfabética generalizada. Los khipus —cuerdas con nudos y colores— registraban cifras y, según debates actuales, quizá información más compleja.

“Escribir” no es solo trazar letras. Un Estado puede gobernar con sistemas semióticos distintos al alfabeto latino.`,
    textOriginal: `The Tawantinsuyu administered an Andean empire without widespread alphabetic writing. Khipus—cords with knots and colors—recorded numbers and, in current debates, perhaps more complex information.

“Writing” is not only letter-drawing. A state can govern with semiotic systems other than the Latin alphabet.`,
    apa: 'Urton, G. (2003). Signs of the Inka khipu. University of Texas Press.',
    note: 'Khipus y semiosis andina.',
    tags: ['Inca', 'khipu', 'Andes'],
  },
  {
    id: 'baghdad-wisdom',
    region: 'Bagdad abasí',
    titleEs: 'Bagdad: traducción como política de saber',
    titleOriginal: 'Baghdad: translation as a politics of knowledge',
    lang: 'en',
    textEs: `En época abasí, Bagdad concentró traducción y debate: griego, siriaco, pahlavi y sánscrito alimentaron el árabe científico y filosófico.

Muchas obras de Aristóteles llegaron a Europa latina por rutas árabes y hebreas. La filosofía occidental es, en tramos decisivos, historia de traducción interlingüe.`,
    textOriginal: `In the Abbasid era, Baghdad concentrated translation and debate: Greek, Syriac, Middle Persian, and Sanskrit fed scientific and philosophical Arabic.

Many Aristotelian works reached Latin Europe through Arabic and Hebrew routes. Western philosophy is, at decisive stretches, a history of interlingual translation.`,
    apa: 'Gutas, D. (1998). Greek thought, Arabic culture. Routledge.',
    note: 'Traducción greco-árabe.',
    tags: ['Bagdad', 'traducción', 'abásidas'],
  },
  {
    id: 'polynesia-nav',
    region: 'Oceanía',
    titleEs: 'Navegación polinesia: leer el océano',
    titleOriginal: 'Polynesian navigation: reading the ocean',
    lang: 'en',
    textEs: `Navegantes polinesios colonizaron islas dispersas usando estrellas, oleaje, aves, nubes y memoria oral de rutas: un sistema cognitivo distribuido entre experto, tripulación y relato.

El “mapa” no siempre era un objeto; a menudo era una práctica enseñada. Una lengua que codifica direcciones y peligros marinos también es tecnología.`,
    textOriginal: `Polynesian navigators settled scattered islands using stars, swell, birds, clouds, and oral memory of routes—a cognitive system distributed among expert, crew, and story.

The “map” was not always an object; it was often a taught practice. A language that encodes directions and marine hazards is technology too.`,
    apa: 'Lewis, D. (1994). We, the navigators (2nd ed.). University of Hawai‘i Press.',
    note: 'Navegación del Pacífico.',
    tags: ['Polinesia', 'navegación', 'oralidad'],
  },


  // ---- 5+ historias largas adicionales por ámbito / idioma ----
  {
    id: 'en-stonehenge',
    region: 'Prehistoria / Britania',
    titleEs: 'Stonehenge: círculo, tiempo y trabajo colectivo',
    titleOriginal: 'Stonehenge: circle, time, and collective labor',
    lang: 'en',
    textEs: `Stonehenge no es solo un círculo de piedras: es el resultado de generaciones de transporte, alineación y ritual en la llanura de Salisbury. Las fases constructivas abarcan siglos. Algunas piedras viajaron distancias enormes.

Lo impresionante no es el misterio turístico, sino la logística social: coordinar trabajo estacional, memoria oral de alineaciones y un calendario implícito en la arquitectura. Antes de la escritura alfabética local, ya había ingeniería del tiempo grabada en el paisaje.`,
    textOriginal: `Stonehenge is not only a circle of stones: it is the outcome of generations of transport, alignment, and ritual on Salisbury Plain. Building phases span centuries. Some stones traveled enormous distances.

What impresses is not tourist mystery but social logistics: coordinating seasonal labor, oral memory of alignments, and a calendar implicit in architecture. Before local alphabetic writing, an engineering of time was already cut into the landscape.`,
    apa: 'Parker Pearson, M. (2012). Stonehenge: Exploring the greatest Stone Age mystery. Simon & Schuster.',
    note: 'Arqueología contemporánea de Stonehenge.',
    tags: ['Stonehenge', 'prehistoria', 'calendario', 'Britania'],
    glossary: [
      { word: 'stones', es: 'piedras', note: 'OE stān; cognado germánico general.' },
      { word: 'outcome', es: 'resultado', note: 'out (fuera) + come (venir): "lo que sale".' },
      { word: 'labor', es: 'trabajo / labor', note: 'lat. labor (esfuerzo, fatiga).' },
      { word: 'traveled', es: 'viajaron', note: 'to travel < OF travailler (trabajar con esfuerzo).' },
      { word: 'seasonal', es: 'estacional', note: 'season (estación) < lat. sationem (siembra).' },
      { word: 'calendar', es: 'calendario', note: 'lat. kalendarium < kalendae (primer día del mes).' },
      { word: 'landscape', es: 'paisaje', note: 'land (tierra) + -scape (vista/forma); préstamo del neerlandés.' },
    ],
  },
  {
    id: 'en-magna-carta',
    region: 'Inglaterra medieval',
    titleEs: 'Magna Carta: límite al poder, mito y documento',
    titleOriginal: 'Magna Carta: limiting power, myth, and document',
    lang: 'en',
    textEs: `En 1215, barones ingleses obligaron a Juan sin Tierra a sellar un acuerdo que limitaba ciertas arbitrariedades reales. El texto fue reescrito y reinterpreto durante siglos. No era una constitución moderna, pero se volvió símbolo de legalidad frente al poder.

Curiosidad: gran parte de su fuerza posterior viene de usos políticos mucho más tardíos (siglos XVII–XVIII). Leer Magna Carta es leer también cómo un documento medieval se convierte en argumento moderno.`,
    textOriginal: `In 1215 English barons forced King John to seal an agreement limiting certain royal arbitrariness. The text was rewritten and reinterpreted for centuries. It was not a modern constitution, yet it became a symbol of legality against power.

Curiosity: much of its later force comes from far later political uses (17th–18th centuries). To read Magna Carta is also to read how a medieval document becomes a modern argument.`,
    apa: 'Holt, J. C. (2015). Magna Carta (3rd ed.). Cambridge University Press.',
    note: 'Historia crítica de Magna Carta.',
    tags: ['Magna Carta', 'derecho', 'Inglaterra', 'poder'],
  },
  {
    id: 'en-abolition',
    region: 'Atlántico / mundo anglófono',
    titleEs: 'Abolicionismo atlántico: palabras que movieron imperios',
    titleOriginal: 'Atlantic abolitionism: words that moved empires',
    lang: 'en',
    textEs: `El fin legal de la trata y de la esclavitud en el mundo británico no fue un milagro moral instantáneo: fue política, economía, resistencia de esclavizados y campañas públicas con panfletos, petitorios e imágenes.

La lengua importó: términos como “slave trade” o “humanity” se volvieron armas en el debate parlamentario. Leer esa historia es ver cómo el léxico moral se entrelaza con el interés y la presión social.`,
    textOriginal: `The legal end of the trade and of slavery in the British world was not an instant moral miracle: it was politics, economics, resistance by the enslaved, and public campaigns with pamphlets, petitions, and images.

Language mattered: terms like “slave trade” or “humanity” became weapons in parliamentary debate. To read that history is to see moral lexicon intertwined with interest and social pressure.`,
    apa: 'Drescher, S. (2009). Abolition: A history of slavery and antislavery. Cambridge University Press.',
    note: 'Historia de la abolición.',
    tags: ['abolición', 'Atlántico', 'imperio', 'léxico'],
  },
  {
    id: 'en-industrial',
    region: 'Gran Bretaña',
    titleEs: 'Revolución industrial: vapor, fábricas y nuevo tiempo social',
    titleOriginal: 'Industrial Revolution: steam, factories, and a new social time',
    lang: 'en',
    textEs: `La industrialización británica reordenó el trabajo, el paisaje y el reloj. El tiempo de fábrica no es el tiempo agrícola. Aparecieron barrios obreros, humo, prensa de masas y un inglés técnico lleno de préstamos y neologismos.

Curiosidad lingüística: muchas palabras de la ingeniería y del ferrocarril se exportaron a otras lenguas europeas casi sin cambio. La tecnología arrastra vocabulario.`,
    textOriginal: `British industrialization reordered work, landscape, and the clock. Factory time is not agricultural time. Working-class districts, smoke, mass press, and a technical English full of loans and neologisms appeared.

Linguistic curiosity: many engineering and railway words were exported into other European languages almost unchanged. Technology drags vocabulary with it.`,
    apa: 'Allen, R. C. (2009). The British industrial revolution in global perspective. Cambridge University Press.',
    note: 'Perspectiva económica global de la industrialización británica.',
    tags: ['industria', 'vapor', 'vocabulario', 'Britania'],
  },
  {
    id: 'en-civil-rights',
    region: 'Estados Unidos',
    titleEs: 'Derechos civiles: discurso público y cambio legal',
    titleOriginal: 'Civil rights: public speech and legal change',
    lang: 'en',
    textEs: `El movimiento por los derechos civiles en EE. UU. combinó litigios, desobediencia civil y una oratoria extraordinaria. Las palabras de discursos y sermones circularon por radio y televisión y redefinieron lo que contaba como “americano” en el debate público.

Leer solo las leyes sin los discursos —o solo los discursos sin las leyes— deja la historia a medias. El cambio fue jurídico y retórico a la vez.`,
    textOriginal: `The U.S. civil rights movement combined litigation, civil disobedience, and extraordinary oratory. Words from speeches and sermons circulated by radio and television and redefined what counted as “American” in public debate.

To read only the laws without the speeches—or only the speeches without the laws—leaves the story half-told. Change was legal and rhetorical at once.`,
    apa: 'Branch, T. (1988). Parting the waters: America in the King years 1954–63. Simon & Schuster.',
    note: 'Historia del movimiento por los derechos civiles.',
    tags: ['derechos civiles', 'EE. UU.', 'oratoria', 'ley'],
  },
  {
    id: 'es-altamira',
    region: 'Prehistoria / Iberia',
    titleEs: 'Altamira: policromía paleolítica en Cantabria',
    titleOriginal: 'Altamira: policromía paleolítica en Cantabria',
    lang: 'es',
    textEs: `La cueva de Altamira, en Cantabria, conserva bisontes policromos que obligaron a Europa a tomarse en serio el arte del Paleolítico superior. Durante un tiempo se dudó de su autenticidad: parecían “demasiado buenos”.

Esa duda dice mucho sobre los prejuicios del siglo XIX respecto a la “primitividad”. Hoy Altamira es referencia de complejidad simbólica temprana en la península ibérica.`,
    textOriginal: `La cueva de Altamira, en Cantabria, conserva bisontes policromos que obligaron a Europa a tomarse en serio el arte del Paleolítico superior. Durante un tiempo se dudó de su autenticidad: parecían “demasiado buenos”.

Esa duda dice mucho sobre los prejuicios del siglo XIX respecto a la “primitividad”. Hoy Altamira es referencia de complejidad simbólica temprana en la península ibérica.`,
    apa: 'Lasheras Corruchaga, J. A. (Ed.). (2002). Redescubrir Altamira. Museo de Altamira.',
    note: 'Estudios sobre Altamira.',
    tags: ['Altamira', 'Paleolítico', 'Iberia', 'arte'],
  },
  {
    id: 'es-al-andalus',
    region: 'Península ibérica',
    titleEs: 'Al-Ándalus: lenguas en contacto',
    titleOriginal: 'Al-Ándalus: lenguas en contacto',
    lang: 'es',
    textEs: `En al-Ándalus convivieron árabe, romance, hebreo y otras variedades. La poesía, la ciencia y la administración circularon en un ecosistema multilingüe. Muchos arabismos del español moderno (almohada, aceite, alcalde…) son fósiles de ese contacto.

No fue un paraíso sin conflicto ni un bloque monolítico: fue un laboratorio histórico de traducción, préstamo y frontera.`,
    textOriginal: `En al-Ándalus convivieron árabe, romance, hebreo y otras variedades. La poesía, la ciencia y la administración circularon en un ecosistema multilingüe. Muchos arabismos del español moderno (almohada, aceite, alcalde…) son fósiles de ese contacto.

No fue un paraíso sin conflicto ni un bloque monolítico: fue un laboratorio histórico de traducción, préstamo y frontera.`,
    apa: 'Menocal, M. R. (2002). The ornament of the world. Little, Brown.',
    note: 'Cultura y convivencia en al-Ándalus (visión sintética).',
    tags: ['al-Ándalus', 'arabismos', 'contacto', 'Iberia'],
  },
  {
    id: 'es-comuneros',
    region: 'Castilla',
    titleEs: 'Comuneros: revuelta urbana y memoria política',
    titleOriginal: 'Comuneros: revuelta urbana y memoria política',
    lang: 'es',
    textEs: `La revuelta de las Comunidades de Castilla (1520–1521) enfrentó ciudades y elites locales al proyecto imperial de Carlos V. Fue derrotada militarmente, pero dejó una memoria larga de “libertad castellana” reutilizada en siglos posteriores.

Leer a los comuneros es leer el choque entre fiscalidad imperial, privilegios urbanos y nuevas formas de soberanía europea.`,
    textOriginal: `La revuelta de las Comunidades de Castilla (1520–1521) enfrentó ciudades y elites locales al proyecto imperial de Carlos V. Fue derrotada militarmente, pero dejó una memoria larga de “libertad castellana” reutilizada en siglos posteriores.

Leer a los comuneros es leer el choque entre fiscalidad imperial, privilegios urbanos y nuevas formas de soberanía europea.`,
    apa: 'Pérez, J. (2001). Los comuneros. La Esfera de los Libros.',
    note: 'Síntesis sobre la revuelta comunera.',
    tags: ['Comuneros', 'Castilla', 'Carlos V', 'revuelta'],
  },
  {
    id: 'es-borbon-reform',
    region: 'Imperio hispánico',
    titleEs: 'Reformas borbónicas: idioma, fisco e imperio',
    titleOriginal: 'Reformas borbónicas: idioma, fisco e imperio',
    lang: 'es',
    textEs: `En el siglo XVIII, la monarquía borbónica intentó reordenar el imperio americano: más control fiscal, milicias, expulsión de los jesuitas y una burocracia más uniforme. El español administrativo se reforzó como lengua de expediente.

Eso no borró las lenguas indígenas, pero cambió quién debía escribir para ser oído por el Estado.`,
    textOriginal: `En el siglo XVIII, la monarquía borbónica intentó reordenar el imperio americano: más control fiscal, milicias, expulsión de los jesuitas y una burocracia más uniforme. El español administrativo se reforzó como lengua de expediente.

Eso no borró las lenguas indígenas, pero cambió quién debía escribir para ser oído por el Estado.`,
    apa: 'Kuethe, A. W., & Andrien, K. J. (2014). The Spanish Atlantic world in the eighteenth century. Cambridge University Press.',
    note: 'Reformas borbónicas en perspectiva atlántica.',
    tags: ['Borbones', 'imperio', 'fisco', 'administración'],
  },
  {
    id: 'es-constitucion-1812',
    region: 'Cádiz / mundo hispánico',
    titleEs: 'Constitución de 1812: nación en guerra y en palabras',
    titleOriginal: 'Constitución de 1812: nación en guerra y en palabras',
    lang: 'es',
    textEs: `La Constitución de Cádiz (1812) se redactó en plena guerra contra Napoleón y pensó un sujeto político nuevo: la Nación española. Su texto viajó a América y fue leído, adaptado y combatido.

Curiosidad: el debate sobre quién contaba como ciudadano —peninsulares, americanos, castas— pasó por comisiones y artículos. La nación se escribió antes de estabilizarse.`,
    textOriginal: `La Constitución de Cádiz (1812) se redactó en plena guerra contra Napoleón y pensó un sujeto político nuevo: la Nación española. Su texto viajó a América y fue leído, adaptado y combatido.

Curiosidad: el debate sobre quién contaba como ciudadano —peninsulares, americanos, castas— pasó por comisiones y artículos. La nación se escribió antes de estabilizarse.`,
    apa: 'Chust, M. (Ed.). (2007). 1808–1823: Doceañistas, liberales y jefes. Fundación Instituto de Historia Social.',
    note: 'Contextos del liberalismo gaditano e hispánico.',
    tags: ['Cádiz', '1812', 'nación', 'liberalismo'],
  },
  {
    id: 'zh-oracle-bones',
    region: 'China antigua',
    titleEs: 'Huesos oraculares: escritura y adivinación Shang',
    titleOriginal: '甲骨与商代占卜',
    lang: 'zh',
    textEs: `Los huesos oraculares de la dinastía Shang registran preguntas al ancestro y al poder ritual: cosechas, guerras, partos, clima. Son de los testimonios escritos más antiguos de una lengua sínica.

Allí la escritura no es solo burocracia: es técnica para interrogar el futuro y archivar la respuesta. Leer esos fragmentos es ver el Estado y lo sagrado entrelazados en signos.`,
    textOriginal: `商代甲骨记录了向祖先与神力的占问：收成、战争、生育、天气。它们是早期汉语最古老的书写证据之一。

在那里，书写不只是官僚技术，更是追问未来并记录答案的手段。阅读这些残片，可见国家与神圣在符号中交织。`,
    apa: 'Keightley, D. N. (1978). Sources of Shang history. University of California Press.',
    note: 'Fuentes oraculares Shang.',
    tags: ['Shang', 'oracle bones', 'escritura', 'China'],
  },
  {
    id: 'zh-silk-road-tang',
    region: 'China / Ruta de la Seda',
    titleEs: 'Chang’an bajo los Tang: capital cosmopolita',
    titleOriginal: '唐都长安：世界性的都城',
    lang: 'zh',
    textEs: `Chang’an en época Tang fue una de las ciudades más grandes del mundo, con mercados, templos y viajeros de Asia Central, Persia y más allá. El chino clásico convivía con lenguas y scripts de la Ruta de la Seda.

Curiosidad: la moda, la música y los préstamos léxicos muestran un imperio seguro de sí mismo y a la vez permeable. La capital era un puerto seco de culturas.`,
    textOriginal: `唐代长安是当时世界最大城市之一，有市场、寺庙以及来自中亚、波斯等地的旅行者。古典汉语与丝绸之路上的多种语言、文字并存。

有趣的是：服饰、音乐与借词显示了一个自信而又开放的帝国。都城是文化的旱港。`,
    apa: 'Lewis, M. E. (2009). China’s cosmopolitan empire: The Tang dynasty. Harvard University Press.',
    note: 'Imperio cosmopolita Tang.',
    tags: ['Tang', 'Chang’an', 'cosmopolitismo', 'Ruta de la Seda'],
  },
  {
    id: 'zh-exam-system',
    region: 'China imperial',
    titleEs: 'Exámenes imperiales: meritocracia imperfecta',
    titleOriginal: '科举：不完美的选才制度',
    lang: 'zh',
    textEs: `El sistema de exámenes imperiales seleccionó élites letradas durante siglos. No fue igualdad pura: exigía tiempo, maestros y recursos. Pero cambió la idea de que el rango solo se hereda.

La lengua clásica escrita se volvió llave de ascenso. Dominar el ensayo formal era dominar una puerta al Estado.`,
    textOriginal: `科举制度在数世纪中选拔读书人。它并非纯粹平等：需要时间、老师与资源。但它改变了“地位只靠出身”的观念。

古典书面语成为上升的钥匙。掌握规范文章，等于掌握进入国家的门径。`,
    apa: 'Elman, B. A. (2000). A cultural history of civil examinations in late imperial China. University of California Press.',
    note: 'Historia cultural de los exámenes civiles.',
    tags: ['keju', 'exámenes', 'élite', 'China'],
  },
  {
    id: 'zh-mayfourth',
    region: 'China moderna',
    titleEs: 'Cuatro de Mayo: lengua vernácula y política',
    titleOriginal: '五四：白话与政治',
    lang: 'zh',
    textEs: `El movimiento del Cuatro de Mayo (1919) impulsó el uso del chino vernáculo (baihua) frente al clasicismo rígido, junto a protestas patrióticas y debates sobre ciencia y democracia.

Escribir “como se habla” fue también un proyecto de ciudadanía y de prensa moderna. La reforma lingüística fue política hasta la médula.`,
    textOriginal: `1919年的五四运动推动白话文，对抗僵化的古典文体，并与爱国抗议及科学、民主的论争相连。

“照说话来写”也是公民身份与现代报刊的规划。语文改革在骨子里是政治的。`,
    apa: 'Chow, Tse-tsung. (1960). The May Fourth Movement. Harvard University Press.',
    note: 'Movimiento del Cuatro de Mayo.',
    tags: ['May Fourth', 'baihua', 'modernidad', 'China'],
  },
  {
    id: 'zh-pinyin',
    region: 'China RPC',
    titleEs: 'Pinyin: romanizar para alfabetizar',
    titleOriginal: '拼音：为识字而设计的罗马化',
    lang: 'zh',
    textEs: `El hanyu pinyin (1958) ofreció una romanización oficial del mandarín con marcas tonales. Sirvió a la alfabetización, a la pedagogía y a la entrada de nombres chinos en sistemas globales.

No sustituye a los caracteres en la vida escrita plena, pero cambió cómo se enseña la pronunciación y cómo el mundo cita nombres chinos.`,
    textOriginal: `1958年的汉语拼音为普通话提供了带调号的官方罗马化方案。它服务识字教育，也方便中文名字进入全球系统。

它并未在完整书写生活中取代汉字，但改变了语音教学，也改变了世界引用中文名的方式。`,
    apa: 'Zhou, Youguang. (2003). The historical evolution of Chinese languages and scripts. Ohio State University National East Asian Languages Resource Center.',
    note: 'Evolución de lenguas y escrituras chinas (Zhou Youguang).',
    tags: ['pinyin', 'romanización', 'educación', 'mandarín'],
  },
  {
    id: 'ja-heian',
    region: 'Japón',
    titleEs: 'Heian: kana, cortesanas y novela',
    titleOriginal: '平安：仮名と宮廷の物語',
    lang: 'ja',
    textEs: `En Heian, el desarrollo de kana permitió una prosa literaria en japonés que no dependía solo del chino clásico. Obras como Genji monopolizan la fama, pero el cambio de fondo es gráfico: un silabario para la voz nativa.

Esa decisión estética y práctica reorganizó quién podía escribir con soltura en la corte.`,
    textOriginal: `平安時代、仮名の発達により、古典中国語だけに頼らない日本語の散文が可能になりました。『源氏』が有名でも、本質的な変化は文字にあります。母語の声のための音節文字です。

その美的かつ実用的な選択が、宮廷で誰が楽に書けるかを組み替えました。`,
    apa: 'Shirane, H. (Ed.). (2007). Traditional Japanese literature. Columbia University Press.',
    note: 'Literatura japonesa tradicional.',
    tags: ['Heian', 'kana', 'Genji', 'escritura'],
  },
  {
    id: 'ja-sekigahara',
    region: 'Japón',
    titleEs: 'Sekigahara: una batalla, un orden',
    titleOriginal: '関ヶ原：一つの戦い、一つの秩序',
    lang: 'ja',
    textEs: `La batalla de Sekigahara (1600) decidió el ascenso de Tokugawa Ieyasu y abrió el bakufu de Edo. Un día de combate reordenó lealtades de dominios enteros.

Después vendrían dos siglos de paz relativa, urbanización y una cultura impresa vibrante. La política del archipiélago quedó marcada por ese punto de inflexión.`,
    textOriginal: `1600年の関ヶ原の戦いは徳川家康の台頭を決め、江戸幕府を開きました。一日の戦闘が藩の忠誠を組み替えました。

その後、約二世紀の相対的平和、都市化、活気ある印刷文化が続きます。列島の政治は、その転換点に刻まれました。`,
    apa: 'Bryant, A. J. (1995). Sekigahara 1600. Osprey.',
    note: 'Batalla de Sekigahara.',
    tags: ['Sekigahara', 'Tokugawa', 'Edo', 'política'],
  },
  {
    id: 'ja-rangaku',
    region: 'Japón',
    titleEs: 'Rangaku: aprender del holandés en Nagasaki',
    titleOriginal: '蘭学：長崎でオランダから学ぶ',
    lang: 'ja',
    textEs: `Durante el periodo de restricciones marítimas, Nagasaki fue ventana controlada. A través del holandés entraron anatomía, astronomía y mapas. El “estudio holandés” (rangaku) tradujo saberes occidentales al japonés.

Curiosidad: traducir ciencia sin abrir del todo el país exigió intermediarios, diccionarios y paciencia filológica.`,
    textOriginal: `海禁の時代、長崎は管理された窓でした。オランダ語を通じて解剖、天文、地図が入りました。蘭学は西洋の知を日本語へ翻訳しました。

興味深いのは、国を大きく開かずに科学を訳すには、仲介者、辞書、文献学的忍耐が必要だったことです。`,
    apa: 'Keene, D. (1969). The Japanese discovery of Europe, 1720–1830 (rev. ed.). Stanford University Press.',
    note: 'Rangaku y descubrimiento de Europa.',
    tags: ['rangaku', 'Nagasaki', 'traducción', 'Edo'],
  },
  {
    id: 'ja-meiji',
    region: 'Japón',
    titleEs: 'Meiji: reformar el Estado y la lengua nacional',
    titleOriginal: '明治：国家と国語の改革',
    lang: 'ja',
    textEs: `La Restauración Meiji no solo industrializó: construyó escuela, ejército moderno y una lengua nacional estándar a partir de variedades diversas. El japonés “común” se enseñó como herramienta de ciudadanía.

Estandarizar una lengua es siempre una decisión política disfrazada de pedagogía.`,
    textOriginal: `明治維新は工業化だけでなく、学校、近代軍、多様な方言からつくられる標準国語を建設しました。『共通語』は市民の道具として教えられました。

言語の標準化は、教育の顔をした政治的決定です。`,
    apa: 'Twine, N. (1991). Language and the modern state: The reform of written Japanese. Routledge.',
    note: 'Reforma de la lengua escrita japonesa.',
    tags: ['Meiji', 'kokugo', 'estándar', 'escuela'],
  },
  {
    id: 'ja-postwar',
    region: 'Japón',
    titleEs: 'Posguerra: constitución, kanji y cultura de masas',
    titleOriginal: '戦後：憲法・漢字・大衆文化',
    lang: 'ja',
    textEs: `Tras 1945, Japón reformó la escritura (lista de kanji de uso común), adoptó una nueva constitución y explotó medios de masas. El manga, el cine y la televisión redefinieron el japonés cotidiano.

La lengua del día a día se volvió también industria cultural exportable.`,
    textOriginal: `1945年以降、日本は表記を改革し（常用漢字）、新憲法を採り、大衆メディアを拡大しました。漫画・映画・テレビが日常日本語を作り変えました。

日常語は輸出可能な文化産業にもなりました。`,
    apa: 'Gottlieb, N. (1995). Kanji politics: Language policy and Japanese script. Kegan Paul International.',
    note: 'Política lingüística y escritura japonesa.',
    tags: ['posguerra', 'kanji', 'medios', 'Japón'],
  },
  {
    id: 'fr-revolution',
    region: 'Francia',
    titleEs: '1789: nación, derechos y lengua revolucionaria',
    titleOriginal: '1789 : nation, droits et langue révolutionnaire',
    lang: 'fr',
    textEs: `La Revolución Francesa inventó un léxico político de ciudadanía, derechos y soberanía nacional. También desconfió de los patois y soñó con un francés único para la República.

Esa tensión —emancipar y homogeneizar— atraviesa la historia escolar francesa.`,
    textOriginal: `La Révolution française inventa un lexique politique de citoyenneté, de droits et de souveraineté nationale. Elle se méfia aussi des patois et rêva d’un français unique pour la République.

Cette tension — émanciper et homogénéiser — traverse l’histoire scolaire française.`,
    apa: 'Soboul, A. (1982). The French Revolution 1787–1799. NLB / Verso.',
    note: 'Síntesis clásica de la Revolución Francesa.',
    tags: ['1789', 'nación', 'francés', 'ciudadanía'],
  },
  {
    id: 'fr-haiti',
    region: 'Saint-Domingue / Haití',
    titleEs: 'Haití: revolución antiesclavista en francés y criollo',
    titleOriginal: 'Haïti : révolution antiesclavagiste entre français et créole',
    lang: 'fr',
    textEs: `La revolución de Saint-Domingue (Haití) fue la única revuelta de esclavizados que culminó en Estado independiente en ese contexto atlántico. El francés jurídico y el criollo de la vida cotidiana marcaron un mapa lingüístico de libertad conflictiva.

Leer Haití obliga a sacar la Revolución Francesa de un marco solo europeo.`,
    textOriginal: `La révolution de Saint-Domingue (Haïti) fut la seule révolte d’esclavisés qui aboutit à un État indépendant dans ce contexte atlantique. Le français juridique et le créole du quotidien dessinèrent une carte linguistique de liberté conflictuelle.

Lire Haïti force à sortir la Révolution française d’un cadre seulement européen.`,
    apa: 'James, C. L. R. (1989). The Black Jacobins (rev. ed.). Vintage.',
    note: 'Clásico sobre la revolución haitiana.',
    tags: ['Haití', 'revolución', 'criollo', 'Atlántico'],
  },
  {
    id: 'fr-school-ferry',
    region: 'Francia',
    titleEs: 'Escuela republicana: francés y ciudadanía',
    titleOriginal: 'École républicaine : français et citoyenneté',
    lang: 'fr',
    textEs: `Las leyes escolares de finales del XIX consolidaron la escuela primaria laica y el francés como lengua de la República. Los dialectos fueron empujados al margen del aula.

Fue un proyecto de ciudadanía… y de unificación lingüística con costes culturales reales.`,
    textOriginal: `Les lois scolaires de la fin du XIXe consolidèrent l’école primaire laïque et le français comme langue de la République. Les dialectes furent repoussés hors de la classe.

Projet de citoyenneté… et d’unification linguistique au coût culturel réel.`,
    apa: 'Weber, E. (1976). Peasants into Frenchmen. Stanford University Press.',
    note: 'Modernización y francesización del mundo rural.',
    tags: ['escuela', 'francés', 'República', 'dialectos'],
  },
  {
    id: 'fr-decolonization',
    region: 'Francofonía',
    titleEs: 'Descolonización: el francés después del imperio',
    titleOriginal: 'Décolonisation : le français après l’empire',
    lang: 'fr',
    textEs: `Tras las independencias africanas y asiáticas, el francés siguió como lengua de Estado, escuela o literatura en muchos países. Ya no era solo “lengua de París”.

La francofonía contemporánea es un campo de tensiones: recurso internacional y recuerdo colonial a la vez.`,
    textOriginal: `Après les indépendances africaines et asiatiques, le français resta langue d’État, d’école ou de littérature dans bien des pays. Il n’était plus seulement la « langue de Paris ».

La francophonie contemporaine est un champ de tensions : ressource internationale et mémoire coloniale à la fois.`,
    apa: 'Conklin, A. L. (1997). A mission to civilize. Stanford University Press.',
    note: 'Ideología colonial republicana francesa.',
    tags: ['descolonización', 'francofonía', 'África', 'imperio'],
  },
  {
    id: 'fr-paris-commune',
    region: 'París',
    titleEs: 'Comuna de París (1871): ciudad insurgente',
    titleOriginal: 'Commune de Paris (1871) : ville insurgée',
    lang: 'fr',
    textEs: `La Comuna de 1871 experimentó autogobierno obrero y popular durante semanas. Su aplastamiento fue sangriento. El léxico de “commune”, “fédérés” y “semaine sanglante” quedó grabado en la memoria política europea.

Fue un laboratorio breve y trágico de poder urbano.`,
    textOriginal: `La Commune de 1871 expérimenta un autogouvernement ouvrier et populaire pendant des semaines. Son écrasement fut sanglant. Le lexique de « commune », « fédérés » et « semaine sanglante » resta gravé dans la mémoire politique européenne.

Laboratoire bref et tragique du pouvoir urbain.`,
    apa: 'Tombs, R. (1999). The Paris Commune, 1871. Longman.',
    note: 'Historia de la Comuna de París.',
    tags: ['Comuna', 'París', '1871', 'revolución'],
  },
  {
    id: 'pt-covilha',
    region: 'Portugal',
    titleEs: 'Precursores de la expansión: información antes de las naves',
    titleOriginal: 'Precursores da expansão: informação antes das naus',
    lang: 'pt',
    textEs: `Antes del boom de las especias, agentes portugueses recolectaban mapas y noticias sobre el Índico. La expansión fue también una economía de la información.

Sin inteligencia previa, el cabo de Buena Esperanza habría sido solo una proeza; con ella, se volvió puerta de un sistema.`,
    textOriginal: `Antes do boom das especiarias, agentes portugueses recolhiam mapas e notícias sobre o Índico. A expansão foi também uma economia da informação.

Sem inteligência prévia, o cabo da Boa Esperança teria sido só proeza; com ela, tornou-se porta de um sistema.`,
    apa: 'Disney, A. R. (2009). A history of Portugal and the Portuguese empire (Vol. 2). Cambridge University Press.',
    note: 'Portugal y el imperio portugués.',
    tags: ['expansión', 'Índico', 'información', 'Portugal'],
  },
  {
    id: 'pt-brazil-gold',
    region: 'Brasil colonial',
    titleEs: 'Oro de Minas: demografía y lengua en movimiento',
    titleOriginal: 'Ouro de Minas: demografia e língua em movimento',
    lang: 'pt',
    textEs: `El ciclo del oro en Minas Gerais desplazó poblaciones africanas, indígenas y portuguesas. En ese crisol se aceleraron contactos que alimentan el portugués brasileño moderno.

La historia de la lengua en Brasil es historia de trabajo forzado, mestizaje y ciudades nuevas en el interior.`,
    textOriginal: `O ciclo do ouro em Minas Gerais deslocou populações africanas, indígenas e portuguesas. Nesse caldeirão aceleraram-se contactos que alimentam o português brasileiro moderno.

A história da língua no Brasil é história de trabalho forçado, mestiçagem e cidades novas no interior.`,
    apa: 'Boxer, C. R. (1962). The golden age of Brazil, 1695–1750. University of California Press.',
    note: 'Brasil en el ciclo del oro.',
    tags: ['Minas', 'oro', 'Brasil', 'demografía'],
  },
  {
    id: 'pt-independence-br',
    region: 'Brasil',
    titleEs: 'Independencia de Brasil: imperio tropical en portugués',
    titleOriginal: 'Independência do Brasil: império tropical em português',
    lang: 'pt',
    textEs: `A diferencia de varias repúblicas hispanoamericanas, Brasil independizó bajo un imperio monárquico (1822). El portugués siguió siendo lengua de Estado sin ruptura brusca de elite letrada.

Eso no eliminó desigualdades enormes; configuró otra trayectoria de nación escrita.`,
    textOriginal: `Diferente de várias repúblicas hispano-americanas, o Brasil independeu-se sob um império monárquico (1822). O português continuou língua de Estado sem ruptura brusca da elite letrada.

Isso não apagou desigualdades enormes; configurou outra trajetória de nação escrita.`,
    apa: 'Barman, R. J. (1988). Brazil: The forging of a nation, 1798–1852. Stanford University Press.',
    note: 'Construcción de la nación brasileña.',
    tags: ['Brasil', '1822', 'imperio', 'nación'],
  },
  {
    id: 'pt-angola-lit',
    region: 'Angola / África lusófona',
    titleEs: 'África lusófona: portugués, nacionalismos y literaturas',
    titleOriginal: 'África lusófona: português, nacionalismos e literaturas',
    lang: 'pt',
    textEs: `En Angola, Moçambique y otras colonias, el portugués fue lengua de administración colonial y, más tarde, de proyectos nacionales y literarios. Escritores africanos resignificaron la lengua del imperio.

Hoy el portugués es también africano: se habla, se escribe y se disputa lejos de Lisboa.`,
    textOriginal: `Em Angola, Moçambique e outras colónias, o português foi língua da administração colonial e, depois, de projetos nacionais e literários. Escritores africanos ressignificaram a língua do império.

Hoje o português é também africano: fala-se, escreve-se e discute-se longe de Lisboa.`,
    apa: 'Chabal, P., et al. (Eds.). (1996). The postcolonial literature of Lusophone Africa. Northwestern University Press.',
    note: 'Literaturas africanas en portugués.',
    tags: ['África', 'lusofonía', 'literatura', 'nacionalismo'],
  },
  {
    id: 'pt-acordo',
    region: 'Lusofonía',
    titleEs: 'Acordo Ortográfico: unificar sin borrar diferencias',
    titleOriginal: 'Acordo Ortográfico: unificar sem apagar diferenças',
    lang: 'pt',
    textEs: `El Acordo Ortográfico de 1990 buscó converger normas de Portugal, Brasil y otros países lusófonos. La adhesión y la polémica variaron por país.

Unificar la ortografía no unifica acentos ni léxico cotidiano; organiza la página escrita común.`,
    textOriginal: `O Acordo Ortográfico de 1990 procurou convergir normas de Portugal, Brasil e outros países lusófonos. A adesão e a polémica variaram por país.

Unificar a ortografia não unifica sotaques nem léxico quotidiano; organiza a página escrita comum.`,
    apa: 'Castro, I. (2006). Introdução à história do português (2nd ed.). Colibri.',
    note: 'Historia del portugués e cuestiones de norma.',
    tags: ['ortografía', 'norma', 'CPLP', 'portugués'],
  },
  {
    id: 'de-print',
    region: 'Alemania',
    titleEs: 'Imprenta y Reforma: el alemán en tipo móvil',
    titleOriginal: 'Druck und Reformation: Deutsch in beweglichen Lettern',
    lang: 'de',
    textEs: `La imprenta de tipos móviles y la Reforma multiplicaron textos en alemán. Panfletos, biblia y controversias teológicas educaron un público lector más amplio.

Sin imprenta, la estandarización del alemán escrito habría sido más lenta y más elitista.`,
    textOriginal: `Der Buchdruck mit beweglichen Lettern und die Reformation vervielfachten deutsche Texte. Flugschriften, Bibel und theologische Streitigkeiten bildeten ein breiteres Lesepublikum.

Ohne Druck wäre die Standardisierung des Schriftdeutschen langsamer und elitärer verlaufen.`,
    apa: 'Edwards, M. U. (1994). Printing, propaganda, and Martin Luther. University of California Press.',
    note: 'Imprenta y propaganda en la Reforma.',
    tags: ['imprenta', 'Reforma', 'alemán', 'lectura'],
  },
  {
    id: 'de-1848',
    region: 'Estados alemanes',
    titleEs: '1848: revoluciones, parlamento y nación pendiente',
    titleOriginal: '1848: Revolutionen, Parlament und offene Nation',
    lang: 'de',
    textEs: `Las revoluciones de 1848 en el espacio alemán soñaron constitución y unidad nacional. El Parlamento de Frankfurt intentó un marco liberal. El proyecto fracasó a corto plazo, pero dejó agenda.

La “nación alemana” se debatió en discursos antes de consolidarse en Estado imperial.`,
    textOriginal: `Die Revolutionen von 1848 im deutschen Raum träumten von Verfassung und nationaler Einheit. Die Frankfurter Nationalversammlung versuchte einen liberalen Rahmen. Das Projekt scheiterte kurzfristig, hinterließ aber eine Agenda.

Die „deutsche Nation“ wurde in Reden verhandelt, bevor sie im Kaiserreich Staat wurde.`,
    apa: 'Sperber, J. (1994). The European revolutions, 1848–1851. Cambridge University Press.',
    note: 'Revoluciones europeas de 1848.',
    tags: ['1848', 'Frankfurt', 'nación', 'liberalismo'],
  },
  {
    id: 'de-unification',
    region: 'Alemania',
    titleEs: '1871: unificación desde arriba',
    titleOriginal: '1871: Einigung von oben',
    lang: 'de',
    textEs: `El Imperio alemán de 1871 nació de guerras y diplomacia lideradas por Prusia, no de un puro consenso popular. El alemán estándar ganó peso en escuela y ejército.

Un Estado nuevo exige formularios, himnos y manuales: la lengua nacional se administra.`,
    textOriginal: `Das Deutsche Kaiserreich von 1871 entstand aus Kriegen und preußischer Diplomatie, nicht aus reinem Volkskonsens. Das Standarddeutsche gewann in Schule und Militär an Gewicht.

Ein neuer Staat braucht Formulare, Hymnen und Lehrbücher: die Nationalsprache wird verwaltet.`,
    apa: 'Blackbourn, D. (1998). The long nineteenth century. Oxford University Press.',
    note: 'Alemania en el siglo XIX largo.',
    tags: ['1871', 'Prusia', 'unificación', 'imperio'],
  },
  {
    id: 'de-weimar',
    region: 'Alemania',
    titleEs: 'República de Weimar: democracia frágil, cultura intensa',
    titleOriginal: 'Weimarer Republik: fragile Demokratie, intensive Kultur',
    lang: 'de',
    textEs: `Weimar experimentó democracia parlamentaria, crisis económica y una eclosión cultural en cine, diseño y pensamiento. El léxico político se polarizó hasta el colapso.

Estudiar Weimar es estudiar cómo una lengua pública puede abrirse… y luego cerrarse bajo dictadura.`,
    textOriginal: `Weimar erprobte parlamentarische Demokratie, Wirtschaftskrisen und eine kulturelle Blüte in Film, Design und Denken. Das politische Lexikon polarisierte sich bis zum Kollaps.

Weimar studieren heißt studieren, wie öffentliche Sprache sich öffnen… und unter Diktatur wieder schließen kann.`,
    apa: 'Weitz, E. D. (2007). Weimar Germany. Princeton University Press.',
    note: 'Historia de la República de Weimar.',
    tags: ['Weimar', 'democracia', 'cultura', 'crisis'],
  },
  {
    id: 'de-eu',
    region: 'Alemania / Europa',
    titleEs: 'Alemania en Europa: después de 1945',
    titleOriginal: 'Deutschland in Europa: nach 1945',
    lang: 'de',
    textEs: `Tras 1945, la división y luego la reunificación redefinieron el lugar de Alemania en Europa. El alemán sigue siendo lengua mayor de la UE, pero en un ecosistema multilingüe de traducción permanente.

La política europea es, también, una política de intérpretes.`,
    textOriginal: `Nach 1945 definierten Teilung und spätere Wiedervereinigung Deutschlands Ort in Europa neu. Deutsch bleibt eine große EU-Sprache, jedoch in einem mehrsprachigen Ökosystem ständiger Übersetzung.

Europäische Politik ist auch eine Politik der Dolmetscher.`,
    apa: 'Judt, T. (2005). Postwar: A history of Europe since 1945. Penguin.',
    note: 'Europa de posguerra.',
    tags: ['posguerra', 'UE', 'reunificación', 'Europa'],
  },
  {
    id: 'it-rome-republic',
    region: 'Roma antigua',
    titleEs: 'República romana: derecho, latín y expansión',
    titleOriginal: 'Repubblica romana: diritto, latino ed espansione',
    lang: 'it',
    textEs: `La República romana expandió un modelo de ciudadanía, derecho y latín público por Italia y luego el Mediterráneo. El latín jurídico dejó una herencia que aún estructura vocabulario político europeo.

Roma no exportó solo legiones: exportó categorías.`,
    textOriginal: `La Repubblica romana espanse un modello di cittadinanza, diritto e latino pubblico per l’Italia e poi il Mediterraneo. Il latino giuridico lasciò un’eredità che struttura ancora il lessico politico europeo.

Roma non esportò solo legioni: esportò categorie.`,
    apa: 'Beard, M. (2015). SPQR: A history of ancient Rome. Profile.',
    note: 'Historia de Roma antigua accesible y rigurosa.',
    tags: ['Roma', 'latín', 'derecho', 'República'],
  },
  {
    id: 'it-comuni',
    region: 'Italia medieval',
    titleEs: 'Comuni medievales: ciudades que se gobiernan',
    titleOriginal: 'Comuni medievali: città che si governano',
    lang: 'it',
    textEs: `En la Italia comunal, ciudades como Florencia, Bolonia o Milán experimentaron autogobierno, gremios y conflictos de facciones. El vernáculo italiano creció en actas, poesía y comercio.

La ciudad italiana medieval fue laboratorio de política antes del Estado nacional.`,
    textOriginal: `Nell’Italia comunale, città come Firenze, Bologna o Milano sperimentarono autogoverno, corporazioni e lotte di fazione. Il volgare italiano crebbe in atti, poesia e commercio.

La città italiana medievale fu laboratorio politico prima dello Stato nazionale.`,
    apa: 'Waley, D., & Dean, T. (2013). The Italian city-republics (4th ed.). Routledge.',
    note: 'Repúblicas urbanas italianas.',
    tags: ['comuni', 'Florencia', 'volgare', 'ciudad'],
  },
  {
    id: 'it-risorgimento',
    region: 'Italia',
    titleEs: 'Risorgimento: unificar la península, elegir una lengua',
    titleOriginal: 'Risorgimento: unire la penisola, scegliere una lingua',
    lang: 'it',
    textEs: `La unificación italiana del XIX tuvo que decidir qué italiano enseñar. El estándar literario toscano-romano se impuso sobre un mosaico de dialectos.

“Hacer italianos” después de “hacer Italia” pasó por la escuela y el servicio militar.`,
    textOriginal: `L’unificazione italiana dell’Ottocento dovette decidere quale italiano insegnare. Lo standard letterario tosco-romano si impose su un mosaico di dialetti.

«Fare gli italiani» dopo «fare l’Italia» passò per scuola e leva.`,
    apa: 'Duggan, C. (2007). The force of destiny: A history of Italy since 1796. Houghton Mifflin.',
    note: 'Italia desde el Risorgimento.',
    tags: ['Risorgimento', 'estándar', 'escuela', 'nación'],
  },
  {
    id: 'it-emigration',
    region: 'Italia / diáspora',
    titleEs: 'Emigración italiana: dialectos que cruzan el océano',
    titleOriginal: 'Emigrazione italiana: dialetti che attraversano l’oceano',
    lang: 'it',
    textEs: `Millones de italianos emigraron a Américas y Europa. Llevaron dialectos, cocinas y asociaciones mutualistas. El italiano estándar a veces se aprendió más en destino que en origen.

La diáspora reescribió el mapa de la lengua italiana fuera de la península.`,
    textOriginal: `Milioni di italiani emigrarono verso Americhe ed Europa. Portarono dialetti, cucine e società di mutuo soccorso. L’italiano standard a volte si imparò più a destinazione che in origine.

La diaspora riscrisse la mappa della lingua italiana fuori dalla penisola.`,
    apa: 'Gabaccia, D. R. (2000). Italy’s many diasporas. UCL Press.',
    note: 'Diásporas italianas.',
    tags: ['emigración', 'dialectos', 'diáspora', 'Américas'],
  },
  {
    id: 'it-resistance',
    region: 'Italia',
    titleEs: 'Resistencia (1943–45): palabras de una Italia dividida',
    titleOriginal: 'Resistenza (1943–45): parole di un’Italia divisa',
    lang: 'it',
    textEs: `Durante la ocupación nazi-fascista, la Resistencia italiana generó prensa clandestina, canciones y un léxico de liberación. Tras la guerra, esa memoria compitió con otras memorias en la República.

Estudiar la Resistencia es estudiar cómo se nombra el antifascismo en público.`,
    textOriginal: `Durante l’occupazione nazifascista, la Resistenza italiana generò stampa clandestina, canti e un lessico di liberazione. Dopo la guerra quella memoria competé con altre memorie nella Repubblica.

Studiare la Resistenza significa studiare come si nomina l’antifascismo in pubblico.`,
    apa: 'Pavone, C. (2013). A civil war: A history of the Italian resistance. Verso.',
    note: 'Historia de la Resistencia italiana.',
    tags: ['Resistencia', '1943', 'antifascismo', 'memoria'],
  },
  {
    id: 'en-wright-brothers',
    region: 'Estados Unidos',
    titleEs: 'Los hermanos Wright: doce segundos que cambiaron el mundo',
    titleOriginal: 'The Wright Brothers: twelve seconds that changed the world',
    lang: 'en',
    textEs: `Antes de ser famosos, Orville y Wilbur Wright reparaban bicicletas en un pequeño taller de Dayton, Ohio. No tenían formación universitaria en ingeniería, pero tenían algo más raro: paciencia para fallar mil veces sin rendirse.

Durante años estudiaron cómo volaban los pájaros. Construyeron un túnel de viento casero para probar más de doscientas formas de alas. Cada fracaso les enseñaba algo que ningún libro explicaba todavía, porque en 1900 nadie sabía realmente cómo volar una máquina más pesada que el aire.

La mañana del 17 de diciembre de 1903, en las dunas de Kitty Hawk, Carolina del Norte, con un viento frío y constante, Orville se tendió sobre el ala inferior del Flyer. El motor rugió. La máquina avanzó por un riel de madera y, por primera vez en la historia documentada, un ser humano voló en una máquina motorizada más pesada que el aire. Duró doce segundos y recorrió treinta y siete metros: menos que la longitud de un avión comercial actual.

Ese mismo día hicieron tres vuelos más, el último de casi un minuto. Un pequeño grupo de testigos lo presenció; casi nadie en el mundo se enteró de inmediato. Los periódicos tardaron años en tomarse en serio la noticia. Sin embargo, en menos de una generación, el avión transformaría la guerra, el comercio y la manera en que la humanidad entiende la distancia.`,
    textOriginal: `Before they were famous, Orville and Wilbur Wright repaired bicycles in a small workshop in Dayton, Ohio. They had no university training in engineering, but they had something rarer: patience to fail a thousand times without giving up.

For years they studied how birds flew. They built a homemade wind tunnel to test more than two hundred wing shapes. Every failure taught them something no book explained yet, because in 1900 nobody really knew how to fly a machine heavier than air.

On the morning of December 17, 1903, on the dunes of Kitty Hawk, North Carolina, with a cold steady wind, Orville lay down on the lower wing of the Flyer. The engine roared. The machine moved along a wooden rail and, for the first time in documented history, a human being flew in a powered, heavier-than-air machine. It lasted twelve seconds and covered thirty-seven meters: less than the length of a modern airliner.

That same day they made three more flights, the last one lasting almost a minute. A small group of witnesses saw it happen; almost nobody in the world found out right away. Newspapers took years to take the news seriously. Yet within less than a generation, the airplane would transform warfare, commerce, and the way humanity understands distance.`,
    apa: 'McCullough, D. (2015). The Wright brothers. Simon & Schuster.',
    note: 'Biografía narrativa de los hermanos Wright y el primer vuelo motorizado.',
    tags: ['Wright brothers', 'aviación', 'Kitty Hawk', 'invención', 'inglés'],
    glossary: [
      { word: 'workshop', es: 'taller', note: 'work (trabajo) + shop (tienda/local); compuesto transparente.' },
      { word: 'training', es: 'formación / entrenamiento', note: 'De to train, del francés antiguo trainer.' },
      { word: 'patience', es: 'paciencia', note: 'Del latín patientia < pati (sufrir/soportar).' },
      { word: 'failed', es: 'fallar / fracasar', note: 'fail < OF faillir < lat. fallere (engañar, fallar).' },
      { word: 'birds', es: 'pájaros / aves', note: 'OE bird; palabra netamente germánica.' },
      { word: 'built', es: 'construyeron', note: 'Pasado irregular de to build (OE byldan).' },
      { word: 'wind', es: 'viento', note: 'OE wind < PIE *h₂wéh₁-n̥to- (soplar). Cognado lejano con "viento".' },
      { word: 'engine', es: 'motor', note: 'engine < OF engin < lat. ingenium (ingenio). Mismo origen que "ingenio".' },
      { word: 'roared', es: 'rugió', note: 'to roar, palabra onomatopéyica germánica.' },
      { word: 'heavier', es: 'más pesado', note: 'Comparativo irregular de heavy (OE hefig).' },
      { word: 'witnesses', es: 'testigos', note: 'witness < OE witnes < witan (saber). El testigo es "el que sabe".' },
      { word: 'newspapers', es: 'periódicos', note: 'Compuesto: news (noticias) + papers (papeles).' },
      { word: 'generation', es: 'generación', note: 'lat. generatio < generare (engendrar).' },
      { word: 'distance', es: 'distancia', note: 'lat. distantia < distare (estar aparte).' },
    ],
    sentences: [
      {
        original: 'Before they were famous, Orville and Wilbur Wright repaired bicycles in a small workshop in Dayton, Ohio.',
        es: 'Antes de ser famosos, Orville y Wilbur Wright reparaban bicicletas en un pequeño taller de Dayton, Ohio.',
        note: 'En inglés el verbo va en pasado simple ("repaired") sin auxiliar, porque es una acción habitual terminada; en español usamos el pretérito imperfecto ("reparaban") para lo habitual. "Before they were famous" se lee "bifór dei uér féimas": la "th" de "they" no existe en español, se pronuncia con la lengua entre los dientes.',
      },
      {
        original: 'They had no university training in engineering, but they had something rarer: patience to fail a thousand times without giving up.',
        es: 'No tenían formación universitaria en ingeniería, pero tenían algo más raro: paciencia para fallar mil veces sin rendirse.',
        note: '"Had" es el pasado de "have" (tener/haber); en inglés un solo verbo cubre ambos sentidos del español. "Giving up" es un phrasal verb (dar + arriba = rendirse); no se traduce palabra por palabra. Se lee "guívin ap".',
      },
      {
        original: 'For years they studied how birds flew.',
        es: 'Durante años estudiaron cómo volaban los pájaros.',
        note: 'El orden es sujeto-verbo-objeto fijo en inglés ("they studied how birds flew"); en español el orden es más libre. "Flew" es el pasado irregular de "fly" (volar); no lleva "-ed" porque es un verbo irregular, algo que hay que memorizar caso por caso.',
      },
      {
        original: 'On the morning of December 17, 1903, on the dunes of Kitty Hawk, North Carolina, a human being flew in a powered, heavier-than-air machine for the first time in documented history.',
        es: 'La mañana del 17 de diciembre de 1903, en las dunas de Kitty Hawk, Carolina del Norte, un ser humano voló en una máquina motorizada más pesada que el aire por primera vez en la historia documentada.',
        note: 'En inglés las fechas se dicen "December seventeenth" aunque se escriban "December 17": el ordinal va en el habla aunque no en el número escrito. "Heavier-than-air" es un adjetivo compuesto con guiones, típico del inglés para empaquetar una idea completa antes del sustantivo.',
      },
    ],
  },
  {
    id: 'en-rosetta-stone',
    region: 'Egipto / Reino Unido',
    titleEs: 'La Piedra de Rosetta: la llave que abrió un idioma perdido',
    titleOriginal: 'The Rosetta Stone: the key that unlocked a lost language',
    lang: 'en',
    textEs: `Durante más de mil años, nadie en el mundo sabía leer los jeroglíficos egipcios. El conocimiento se había perdido casi por completo cuando el antiguo Egipto dejó de existir como civilización independiente. Los símbolos tallados en templos y tumbas parecían hermosos pero mudos.

En 1799, soldados franceses que trabajaban cerca de la ciudad de Rashid (que los europeos llamaban Rosetta), en el delta del Nilo, encontraron un fragmento de piedra oscura al reforzar una fortaleza. La piedra tenía el mismo texto escrito tres veces, en tres sistemas distintos: jeroglíficos egipcios, escritura demótica egipcia y griego antiguo.

Como los eruditos ya podían leer griego, tenían por fin un punto de comparación. Pero descifrar los jeroglíficos tomó más de veinte años. El joven lingüista francés Jean-François Champollion dedicó su vida a este problema desde la adolescencia. En 1822 anunció que había encontrado la clave: los jeroglíficos no eran solo símbolos ni solo sonidos, sino una mezcla de ambos.

El descubrimiento abrió de golpe toda la historia escrita del antiguo Egipto: nombres de faraones, oraciones, contratos, cartas de amor y listas de impuestos que habían permanecido en silencio durante casi dos mil años. Hoy la Piedra de Rosetta se exhibe en Londres y su nombre se usa como metáfora de cualquier cosa que sirve para descifrar algo antes incomprensible.`,
    textOriginal: `For more than a thousand years, nobody in the world could read Egyptian hieroglyphs. The knowledge had been almost completely lost once ancient Egypt stopped existing as an independent civilization. The symbols carved on temples and tombs looked beautiful but silent.

In 1799, French soldiers working near the city of Rashid (which Europeans called Rosetta), in the Nile delta, found a fragment of dark stone while reinforcing a fortress. The stone carried the same text written three times, in three different systems: Egyptian hieroglyphs, Egyptian demotic script, and ancient Greek.

Since scholars could already read Greek, they finally had a point of comparison. But decoding the hieroglyphs took more than twenty years. The young French linguist Jean-François Champollion devoted his life to this problem from his teenage years. In 1822 he announced he had found the key: hieroglyphs were not only symbols nor only sounds, but a mixture of both.

The discovery suddenly opened up the entire written history of ancient Egypt: pharaohs' names, prayers, contracts, love letters, and tax lists that had remained silent for almost two thousand years. Today the Rosetta Stone is on display in London, and its name is used as a metaphor for anything that helps decode something previously incomprehensible.`,
    apa: 'Robinson, A. (2012). Cracking the Egyptian code: The Revolutionary life of Jean-François Champollion. Oxford University Press.',
    note: 'Historia del desciframiento de los jeroglíficos egipcios.',
    tags: ['Piedra de Rosetta', 'jeroglíficos', 'Champollion', 'escritura', 'inglés'],
    glossary: [
      { word: 'lost', es: 'perdido', note: 'Participio irregular de to lose (OE losian).' },
      { word: 'symbols', es: 'símbolos', note: 'gr. sýmbolon (señal de reconocimiento) vía el latín.' },
      { word: 'soldiers', es: 'soldados', note: 'soldier < OF soldier < soulde (paga, de ahí "soldado" = el pagado).' },
      { word: 'fragment', es: 'fragmento', note: 'lat. fragmentum < frangere (romper).' },
      { word: 'fortress', es: 'fortaleza', note: 'lat. fortis (fuerte) + -ess.' },
      { word: 'scholars', es: 'eruditos / estudiosos', note: 'De scholar < lat. schola (escuela).' },
      { word: 'decoding', es: 'descifrar', note: 'de- (deshacer) + code (código, del lat. codex).' },
      { word: 'devoted', es: 'dedicó', note: 'to devote < lat. devovere (consagrar por voto).' },
      { word: 'announced', es: 'anunció', note: 'lat. annuntiare < ad- + nuntiare (anunciar).' },
      { word: 'discovery', es: 'descubrimiento', note: 'dis- (quitar) + cover (cubrir); "quitar lo que cubre".' },
      { word: 'contracts', es: 'contratos', note: 'lat. contractus < contrahere (contraer, pactar).' },
      { word: 'display', es: 'exhibición / exhibirse', note: 'OF despleier (desplegar), mismo origen que "desplegar".' },
      { word: 'incomprehensible', es: 'incomprensible', note: 'lat. in- + comprehendere (comprender, agarrar juntos).' },
    ],
    sentences: [
      {
        original: 'For more than a thousand years, nobody in the world could read Egyptian hieroglyphs.',
        es: 'Durante más de mil años, nadie en el mundo podía leer los jeroglíficos egipcios.',
        note: '"Nobody... could" es la forma negativa de capacidad en pasado: "could" es el pasado del modal "can". En español usamos "nadie podía" con doble negación implícita (nadie + podía, sin "no"); en inglés "nobody" ya es suficiente, no se añade "not". Se lee "nóubadi kud rid".',
      },
      {
        original: 'In 1799, French soldiers found a fragment of dark stone while reinforcing a fortress.',
        es: 'En 1799, soldados franceses encontraron un fragmento de piedra oscura mientras reforzaban una fortaleza.',
        note: '"While reinforcing" usa gerundio tras "while" para indicar una acción simultánea de fondo, sin necesidad de repetir el sujeto ("while they were reinforcing" también es correcto, pero el gerundio solo es más económico). El adjetivo "dark" va antes del sustantivo "stone", como siempre en inglés.',
      },
      {
        original: 'The young French linguist Jean-François Champollion devoted his life to this problem.',
        es: 'El joven lingüista francés Jean-François Champollion dedicó su vida a este problema.',
        note: 'Nota el orden de los adjetivos antes del sustantivo: "the young French linguist" (edad + nacionalidad + sustantivo), siguiendo la jerarquía de adjetivos prenominales del inglés. "Devoted... to" pide la preposición "to", no "for" ni "at".',
      },
    ],
  },
  {
    id: 'en-spelling-history',
    region: 'Inglaterra',
    titleEs: 'Por qué el inglés se escribe distinto de como se pronuncia',
    titleOriginal: 'Why English is written differently from how it sounds',
    lang: 'en',
    textEs: `Cualquier estudiante serio de inglés nota rápido algo extraño: "through", "though", "tough" y "cough" comparten las letras "-ough" pero se pronuncian de cuatro maneras completamente distintas. Esto no es un accidente ni un capricho: es el resultado de mil años de historia acumulada sobre la misma ortografía.

La razón principal tiene nombre técnico: el Gran Cambio Vocálico (Great Vowel Shift), un proceso que ocurrió entre los siglos XV y XVII, en el que la pronunciación de las vocales largas del inglés cambió radicalmente, pero la escritura, ya fijada por los primeros impresores, se quedó prácticamente congelada. Por eso "name" se escribe casi igual que en 1400, pero ya no suena como sonaba entonces.

A esto se suma que el inglés tomó préstamos masivos de tres fuentes distintas en momentos distintos: vocabulario germánico nativo (house, water, love), francés normando tras 1066 (justice, royal, beauty) y latín/griego culto desde el Renacimiento (biology, photograph, democracy). Cada capa de préstamos trajo sus propias reglas de escritura, y el inglés nunca hizo una reforma ortográfica general para unificarlas, a diferencia del español o el italiano.

La buena noticia para quien aprende en serio: la irregularidad no es aleatoria. Si conoces el origen de una palabra (germánico, francés o greco-latino), puedes predecir bastante bien cómo se escribe y cómo se pronuncia. Por eso esta app te muestra la etimología de cada palabra antes de preguntarte: no es un dato curioso, es una herramienta real de pronunciación y ortografía.`,
    textOriginal: `Any serious English learner notices something strange quite quickly: "through", "though", "tough", and "cough" share the letters "-ough" but are pronounced in four completely different ways. This is not an accident or a whim: it is the result of a thousand years of history piled onto the same spelling system.

The main reason has a technical name: the Great Vowel Shift, a process that took place between the 15th and 17th centuries, in which the pronunciation of English long vowels changed radically, while the spelling, already fixed by the earliest printers, remained almost frozen. That is why "name" is spelled almost as it was in 1400, but it no longer sounds the way it did then.

On top of that, English borrowed massively from three different sources at different times: native Germanic vocabulary (house, water, love), Norman French after 1066 (justice, royal, beauty), and learned Latin/Greek since the Renaissance (biology, photograph, democracy). Each layer of borrowing brought its own spelling rules, and English never underwent a general spelling reform to unify them, unlike Spanish or Italian.

The good news for a serious learner: the irregularity is not random. If you know a word's origin (Germanic, French, or Greco-Latin), you can predict fairly well how it is spelled and how it is pronounced. That is why this app shows you the etymology of every word before quizzing you: it is not a fun fact, it is a real pronunciation and spelling tool.`,
    apa: 'Crystal, D. (2012). Spell it out: The singular story of English spelling. Profile Books.',
    note: 'Historia de la ortografía inglesa y el Gran Cambio Vocálico.',
    tags: ['ortografía', 'Great Vowel Shift', 'pronunciación', 'historia del inglés', 'inglés'],
    glossary: [
      { word: 'strange', es: 'extraño / raro', note: 'OF estrange < lat. extraneus (de fuera). Mismo origen que "extraño".' },
      { word: 'accident', es: 'accidente / casualidad', note: 'lat. accidens < accidere (caer sobre, suceder).' },
      { word: 'result', es: 'resultado', note: 're- (otra vez) + lat. saltare (saltar): "rebotar de vuelta".' },
      { word: 'history', es: 'historia', note: 'gr. historía (investigación, relato) vía el latín.' },
      { word: 'shift', es: 'cambio / desplazamiento', note: 'OE sciftan (dividir, organizar); el sentido de "cambio" es tardío.' },
      { word: 'pronunciation', es: 'pronunciación', note: 'lat. pronuntiare < pro- + nuntiare (anunciar).' },
      { word: 'printers', es: 'impresores', note: 'print < OF preinte < lat. premere (presionar).' },
      { word: 'frozen', es: 'congelado', note: 'Participio de "freeze" (OE frēosan), verbo germánico irregular.' },
      { word: 'borrowed', es: 'tomó prestado', note: 'OE borgian; en lingüística, "borrowing" es el término técnico para préstamo léxico.' },
      { word: 'unify', es: 'unificar', note: 'lat. unus (uno) + facere (hacer): "hacer uno".' },
      { word: 'predict', es: 'predecir', note: 'lat. prae- (antes) + dicere (decir).' },
      { word: 'quizzing', es: 'poniendo a prueba / preguntando', note: 'origen incierto, posiblemente del s. XVIII; hoy es el verbo estándar para "examinar con preguntas".' },
    ],
    sentences: [
      {
        original: 'Any serious English learner notices something strange quite quickly.',
        es: 'Cualquier estudiante serio de inglés nota algo extraño bastante rápido.',
        note: '"Quite quickly" combina un intensificador ("quite", bastante) con un adverbio en -ly formado a partir de "quick" (rápido). La mayoría de adverbios de modo en inglés se forman añadiendo "-ly" al adjetivo, igual que "-mente" en español.',
      },
      {
        original: 'This is not an accident or a whim: it is the result of a thousand years of history.',
        es: 'Esto no es un accidente ni un capricho: es el resultado de mil años de historia.',
        note: 'En inglés, "not... or" equivale a "ni... ni" del español cuando hay negación explícita con "not": "not an accident or a whim" = "ni un accidente ni un capricho". El uso de los dos puntos para explicar/ampliar funciona igual que en español.',
      },
      {
        original: 'If you know a word\'s origin, you can predict fairly well how it is spelled.',
        es: 'Si conoces el origen de una palabra, puedes predecir bastante bien cómo se escribe.',
        note: 'El posesivo sajón "word\'s origin" (apóstrofe + s) equivale a "origen de la palabra": el poseedor va primero, seguido de \'s, y luego lo poseído. "How it is spelled" es una pregunta indirecta insertada como objeto, con el orden sujeto-verbo normal (no el orden invertido de una pregunta directa).',
      },
    ],
  },
]

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export function IdiomasGame() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('hub')
  const [lang, setLang] = useState<LangId>(() => readJSON(LS.lang, 'en'))
  const [levelId, setLevelId] = useState(1)
  const [unlockedMap, setUnlockedMap] = useState<Record<string, number>>(() =>
    readJSON(LS.unlocked, { en: 1 })
  )
  const [currentMap, setCurrentMap] = useState<Record<string, number>>(() =>
    readJSON(LS.current, { en: 1 })
  )
  const [preferredMode, setPreferredMode] = useState<GameMode | 'auto'>(() =>
    readJSON(LS.mode, 'auto')
  )
  const [completedMap, setCompletedMap] = useState<Record<string, number[]>>(() =>
    readJSON(LS.completed, {})
  )
  const [learnOpen, setLearnOpen] = useState(true)
  const [question, setQuestion] = useState<Question | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [wins, setWins] = useState(() => readJSON(LS.wins, 0))
  const [fails, setFails] = useState(() => readJSON(LS.fails, 0))
  const [hintOpen, setHintOpen] = useState(false)
  const [storyId, setStoryId] = useState<string | null>(null)
  const [storyLangMode, setStoryLangMode] = useState<'es' | 'original' | 'breakdown'>('es')
  const [attemptsMap, setAttemptsMap] = useState<Record<string, number>>(() =>
    readJSON(LS.attempts, {})
  )
  const [lastGrade, setLastGrade] = useState<{
    grade: string
    stars: number
    comment: string
    seconds: number
    attempts: number
  } | null>(null)
  const [dictEntries, setDictEntries] = useState<DictEntry[]>(() =>
    readJSON(LS.dictionary, [])
  )
  const [dictFilterLang, setDictFilterLang] = useState<LangId | 'all'>('all')
  const [pendingLevel, setPendingLevel] = useState<number | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [lessonAudioOn, setLessonAudioOn] = useState(false)
  const [winStreak, setWinStreak] = useState(() => readJSON(LS.streak, 0))
  const [bestStreak, setBestStreak] = useState(() => readJSON(LS.bestStreak, 0))
  const [storyFilterLang, setStoryFilterLang] = useState<LangId | 'all'>(() =>
    readJSON(LS.storyFilter, 'all')
  )
  const [activeGloss, setActiveGloss] = useState<{ word: string; es: string; note?: string } | null>(
    null
  )
  const startedAtRef = useRef<number>(0)

  const profile = LANG_PROFILES[lang]
  const unlocked = unlockedMap[lang] ?? 1
  const currentLevel = currentMap[lang] ?? 1
  const completedLevels = useMemo(
    () => new Set(completedMap[lang] ?? []),
    [completedMap, lang]
  )

  const scores = useMemo(
    () => readJSON<Record<string, number>>(LS.scores, {}),
    [screen, levelId, lang]
  )

  useEffect(() => {
    writeJSON(LS.lang, lang)
  }, [lang])

  useEffect(() => {
    writeJSON(LS.mode, preferredMode)
  }, [preferredMode])

  useEffect(() => {
    writeJSON(LS.storyFilter, storyFilterLang)
  }, [storyFilterLang])

  const resolveTarget = useCallback(
    (id: number) => {
      let target = id
      if (completedLevels.has(target)) {
        let found = false
        for (let n = target + 1; n <= TOTAL_LEVELS; n++) {
          if (!completedLevels.has(n) && n <= Math.max(unlocked, target + 1)) {
            target = n
            found = true
            break
          }
        }
        if (!found) {
          for (let n = 1; n <= unlocked; n++) {
            if (!completedLevels.has(n)) {
              target = n
              found = true
              break
            }
          }
        }
      }
      return target
    },
    [completedLevels, unlocked]
  )

  const startLevel = useCallback(
    (id: number, preset?: Question) => {
      const target = preset ? preset.level : resolveTarget(id)
      const q = preset ?? generateQuestion(target, lang, preferredMode)
      setLevelId(target)
      const nextCurrent = { ...currentMap, [lang]: target }
      setCurrentMap(nextCurrent)
      writeJSON(LS.current, nextCurrent)
      setQuestion(q)
      setSelected(null)
      setAnswered(false)
      setCorrect(false)
      setHintOpen(false)
      setLastGrade(null)
      startedAtRef.current = Date.now()
      playSfx('start')
      setScreen('play')
    },
    [lang, preferredMode, currentMap, resolveTarget]
  )

  /** Punto de entrada a un nivel: siempre da primero la clase completa con el
   * vocabulario y la regla que aparecerán en la pregunta; es obligatoria, no
   * hay forma de saltarla. La pregunta se genera una sola vez aquí y se
   * reutiliza al jugar, para que la clase describa exactamente las opciones
   * reales, sin sorpresas de un nuevo sorteo. */
  const openVocab = useCallback(
    (n: number) => {
      const target = resolveTarget(n)
      const q = generateQuestion(target, lang, preferredMode)
      setPendingLevel(target)
      setPendingQuestion(q)
      setRevealed(new Set())
      setLessonAudioOn(false)
      setScreen('vocab')
    },
    [resolveTarget, lang, preferredMode]
  )

  const onSelectOption = (idx: number) => {
    if (answered || !question) return
    playSfx('click')
    setSelected(idx)
    const ok = idx === question.correctIndex
    setCorrect(ok)
    setAnswered(true)

    const key = `${lang}:${levelId}`
    const prevAttempts = attemptsMap[key] ?? 0
    const attempts = prevAttempts + 1
    const nextAttempts = { ...attemptsMap, [key]: attempts }
    setAttemptsMap(nextAttempts)
    writeJSON(LS.attempts, nextAttempts)

    const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))

    if (ok) {
      setWins((w) => {
        const n = w + 1
        writeJSON(LS.wins, n)
        return n
      })
      setWinStreak((s) => {
        const n = s + 1
        writeJSON(LS.streak, n)
        setBestStreak((b) => {
          const nb = Math.max(b, n)
          writeJSON(LS.bestStreak, nb)
          return nb
        })
        return n
      })
      const sc = readJSON<Record<string, number>>(LS.scores, {})
      sc[key] = Math.max(sc[key] ?? 0, 1)
      writeJSON(LS.scores, sc)
      const prevCompleted = completedMap[lang] ?? []
      if (!prevCompleted.includes(levelId)) {
        const nextCompleted = { ...completedMap, [lang]: [...prevCompleted, levelId] }
        setCompletedMap(nextCompleted)
        writeJSON(LS.completed, nextCompleted)
      }
      if (levelId >= unlocked) {
        const next = Math.min(TOTAL_LEVELS, levelId + 1)
        const nextUnlocked = { ...unlockedMap, [lang]: next }
        setUnlockedMap(nextUnlocked)
        writeJSON(LS.unlocked, nextUnlocked)
      }
      const g = gradePerformance(seconds, attempts)
      playSfx(g.grade === 'S' || g.grade === 'A' ? 'levelup' : 'correct')
      setLastGrade({ ...g, seconds, attempts })
      const best = readJSON<Record<string, number>>(LS.bestTime, {})
      if (!best[key] || seconds < best[key]) {
        best[key] = seconds
        writeJSON(LS.bestTime, best)
      }
      // Diccionario personal: solo se registra al acertar (nivel no repetible)
      const entryId = `${lang}:${levelId}`
      const already = dictEntries.some((e) => e.id === entryId)
      if (!already) {
        const entry: DictEntry = {
          id: entryId,
          lang,
          level: levelId,
          cefr: question.cefr,
          mode: question.mode,
          prompt: question.prompt,
          correctAnswer: question.options[question.correctIndex],
          explanation: question.explanation,
          ruleHint: question.ruleHint,
          rootFocus: question.rootFocus,
          etymology: question.etymology,
          seconds,
          attempts,
          completedAt: new Date().toISOString(),
        }
        const nextDict = [...dictEntries, entry]
        setDictEntries(nextDict)
        writeJSON(LS.dictionary, nextDict)
      }
    } else {
      setFails((f) => {
        const n = f + 1
        writeJSON(LS.fails, n)
        return n
      })
      playSfx('wrong')
      setWinStreak(0)
      writeJSON(LS.streak, 0)
      setLastGrade(null)
    }
    setScreen('result')
  }

  const activeStory = storyId ? STORIES.find((s) => s.id === storyId) : null

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
            <h1>Idiomas</h1>
            <p>Gramática, cognados, lectura y traducción lógica</p>
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
                onClick={() => {
                  playSfx('toggle')
                  setLang(id)
                }}
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
              {profile.flag} {profile.name} · origen, reglas y CEFR
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
                  <br />
                  <strong>Progresión CEFR:</strong> 1–200 A1 · 201–400 A2 · 401–800 B1 · 801–1400 B2 ·
                  1401–2200 C1 · 2201–{TOTAL_LEVELS} C2 (por idioma, hasta el nivel {TOTAL_LEVELS}).
                </p>
                <div className="id-essay">{profile.essay}</div>
                <h3>Reglas clave (claras y aplicables)</h3>
                <ul>
                  {profile.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <h3>Sinopsis gramatical rápida</h3>
                <ul>
                  {profile.grammarSynopses.map((r) => (
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
          <button className="id-btn primary" type="button" onClick={() => openVocab(currentLevel)}>
            Continuar · Nivel {currentLevel} · {levelToCefr(currentLevel)}
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('modes')}>
            Elegir modo de juego
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('levels')}>
            Selección de niveles
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('reading')}>
            📖 Modo lectura · Historias del mundo
          </button>
          <button
            className="id-btn"
            type="button"
            onClick={() => {
              setDictFilterLang('all')
              setScreen('dictionary')
            }}
          >
            📚 Mi diccionario · {dictEntries.length} logros
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('review')}>
            🔁 Repaso espaciado · {dictEntries.length} palabras
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('achievements')}>
            🏆 Logros
          </button>
          {winStreak >= 2 && (
            <motion.p
              className="id-streak-line"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            >
              🔥 Racha actual: {winStreak} aciertos seguidos · Mejor racha: {bestStreak}
            </motion.p>
          )}
          <p className="id-stats-line">
            Aciertos: {wins} · Fallos: {fails} · Desbloqueado ({profile.name}): {unlocked}/
            {TOTAL_LEVELS} · Completados: {(completedMap[lang] ?? []).length}
          </p>
          <p className="id-stats-line">
            Modo: {preferredMode === 'auto' ? 'Automático (ciclo)' : MODE_LABELS[preferredMode]}
          </p>
          <div className="id-progress-track" aria-label="Progreso de niveles completados">
            <motion.div
              className="id-progress-fill"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, Math.round(((completedMap[lang] ?? []).length / TOTAL_LEVELS) * 100))}%`,
              }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ---- DICTIONARY ----
  if (screen === 'dictionary') {
    const filtered =
      dictFilterLang === 'all'
        ? dictEntries
        : dictEntries.filter((e) => e.lang === dictFilterLang)
    const sorted = [...filtered].sort((a, b) => {
      if (a.lang !== b.lang) return a.lang.localeCompare(b.lang)
      return a.level - b.level
    })
    const byLang = LANG_ORDER.map((id) => ({
      id,
      count: dictEntries.filter((e) => e.lang === id).length,
    }))
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Mi diccionario</h1>
            <p>Niveles superados · pregunta, respuesta, tiempo y etimología</p>
          </div>
        </header>
        <section className="id-lang-switch" aria-label="Filtrar por idioma">
          <button
            type="button"
            className={`id-lang-btn ${dictFilterLang === 'all' ? 'active' : ''}`}
            onClick={() => setDictFilterLang('all')}
          >
            Todos ({dictEntries.length})
          </button>
          {byLang.map(({ id, count }) => {
            const p = LANG_PROFILES[id]
            return (
              <button
                key={id}
                type="button"
                className={`id-lang-btn ${dictFilterLang === id ? 'active' : ''}`}
                onClick={() => setDictFilterLang(id)}
              >
                <span className="id-flag">{p.flag}</span>
                <span>
                  {p.name} ({count})
                </span>
              </button>
            )
          })}
        </section>
        {sorted.length === 0 ? (
          <div className="id-card" style={{ padding: 16 }}>
            <p className="id-meta">
              Aún no hay entradas. Cada nivel que aciertas se guarda aquí con la pregunta, la
              respuesta correcta, el tiempo y una nota etimológica o de raíz para que midas lo que
              ya dominas y no se repita.
            </p>
          </div>
        ) : (
          <div className="id-story-list">
            {sorted.map((e) => (
              <article key={e.id} className="id-dict-card">
                <div className="id-story-head">
                  <span className="id-flag">{LANG_PROFILES[e.lang].flag}</span>
                  <strong>
                    Nv. {e.level} · {e.cefr} · {MODE_LABELS[e.mode]}
                  </strong>
                </div>
                <p className="id-dict-prompt">{e.prompt}</p>
                <p className="id-dict-answer">
                  <strong>Respuesta:</strong> {e.correctAnswer}
                </p>
                <p className="id-meta">
                  Tiempo: {e.seconds}s · Intentos: {e.attempts} ·{' '}
                  {new Date(e.completedAt).toLocaleDateString()}
                </p>
                {e.rootFocus && (
                  <p className="id-rule-hint">
                    <strong>Raíz / lexema:</strong> {e.rootFocus}
                  </p>
                )}
                {e.etymology && (
                  <p className="id-rule-explain">
                    <strong>Etimología / bloques:</strong> {e.etymology}
                  </p>
                )}
                <p className="id-explain">{e.explanation}</p>
                <p className="id-meta">
                  <em>Regla:</em> {e.ruleHint}
                </p>
              </article>
            ))}
          </div>
        )}
        <div className="id-actions">
          <button className="id-btn primary" type="button" onClick={() => setScreen('hub')}>
            Volver al menú
          </button>
        </div>
      </div>
    )
  }

  // ---- REPASO ESPACIADO ----
  if (screen === 'review') {
    const queue = [...dictEntries].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    )
    const markReviewed = (id: string) => {
      const next = dictEntries.map((e) =>
        e.id === id ? { ...e, completedAt: new Date().toISOString() } : e
      )
      setDictEntries(next)
      writeJSON(LS.dictionary, next)
    }
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Repaso espaciado</h1>
            <p>Las palabras que repasaste hace más tiempo aparecen primero</p>
          </div>
        </header>
        {queue.length === 0 ? (
          <div className="id-card" style={{ padding: 16 }}>
            <p className="id-meta">
              Aún no tienes palabras para repasar. Completa algunos niveles y volverán aquí cuando
              convenga refrescarlas.
            </p>
          </div>
        ) : (
          <div className="id-story-list">
            {queue.slice(0, 20).map((e) => (
              <article key={e.id} className="id-dict-card">
                <div className="id-story-head">
                  <span className="id-flag">{LANG_PROFILES[e.lang].flag}</span>
                  <strong>
                    Nv. {e.level} · {e.cefr}
                  </strong>
                  <button
                    type="button"
                    className="id-speak-btn"
                    onClick={() => speak(e.correctAnswer, e.lang)}
                  >
                    🔊
                  </button>
                </div>
                <p className="id-dict-prompt">{e.prompt}</p>
                <p className="id-dict-answer">
                  <strong>Respuesta:</strong> {e.correctAnswer}
                </p>
                <p className="id-explain">{e.explanation}</p>
                <p className="id-meta">
                  Último repaso: {new Date(e.completedAt).toLocaleDateString()}
                </p>
                <button
                  className="id-btn primary"
                  type="button"
                  onClick={() => markReviewed(e.id)}
                >
                  Ya la repasé
                </button>
              </article>
            ))}
          </div>
        )}
        <div className="id-actions">
          <button className="id-btn" type="button" onClick={() => setScreen('hub')}>
            Volver al menú
          </button>
        </div>
      </div>
    )
  }

  // ---- LOGROS ----
  if (screen === 'achievements') {
    const totalCompleted = Object.values(completedMap).reduce((sum, arr) => sum + arr.length, 0)
    const langsPracticed = Object.keys(completedMap).filter((k) => (completedMap[k] ?? []).length > 0).length
    const badges: { title: string; desc: string; earned: boolean }[] = [
      { title: 'Primer paso', desc: 'Completa tu primer nivel.', earned: totalCompleted >= 1 },
      { title: 'Constancia', desc: 'Consigue una racha de 5 aciertos seguidos.', earned: bestStreak >= 5 },
      { title: 'Racha de hierro', desc: 'Consigue una racha de 15 aciertos seguidos.', earned: bestStreak >= 15 },
      { title: 'Coleccionista', desc: 'Guarda 20 palabras en tu diccionario.', earned: dictEntries.length >= 20 },
      { title: 'Erudito', desc: 'Guarda 75 palabras en tu diccionario.', earned: dictEntries.length >= 75 },
      { title: 'Políglota en camino', desc: 'Practica al menos 3 idiomas distintos.', earned: langsPracticed >= 3 },
      { title: 'Lector de historias', desc: 'Abre al menos una historia en el modo lectura.', earned: !!storyId },
      { title: 'Maratonista', desc: 'Completa 50 niveles en total.', earned: totalCompleted >= 50 },
    ]
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Logros</h1>
            <p>{badges.filter((b) => b.earned).length}/{badges.length} conseguidos</p>
          </div>
        </header>
        <div className="id-story-list">
          {badges.map((b) => (
            <motion.article
              key={b.title}
              className={`id-dict-card ${b.earned ? 'earned' : 'locked-badge'}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="id-story-head">
                <span>{b.earned ? '🏆' : '🔒'}</span>
                <strong>{b.title}</strong>
              </div>
              <p className="id-meta">{b.desc}</p>
            </motion.article>
          ))}
        </div>
        <div className="id-actions">
          <button className="id-btn" type="button" onClick={() => setScreen('hub')}>
            Volver al menú
          </button>
        </div>
      </div>
    )
  }

  // ---- MODES ----
  if (screen === 'modes') {
    const modes: (GameMode | 'auto')[] = [
      'auto',
      'translate_to_es',
      'translate_from_es',
      'grammar_deduce',
      'cognate_logic',
      'particle_or_order',
      'false_friends',
      'morphology',
      'contextual_usage',
      'reading_comprehension',
    ]
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Modos de juego</h1>
            <p>Elige cómo quieres practicar · {profile.flag} {profile.name}</p>
          </div>
        </header>
        <div className="id-mode-list">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={`id-mode-card ${preferredMode === m ? 'active' : ''}`}
              onClick={() => setPreferredMode(m)}
            >
              <strong>{m === 'auto' ? 'Automático (ciclo de modos)' : MODE_LABELS[m]}</strong>
              <span>
                {m === 'auto'
                  ? 'El nivel elige el tipo de ejercicio según una rotación didáctica.'
                  : MODE_HELP[m]}
              </span>
            </button>
          ))}
        </div>
        <div className="id-actions">
          <button className="id-btn primary" type="button" onClick={() => openVocab(currentLevel)}>
            Jugar con este modo
          </button>
          <button className="id-btn" type="button" onClick={() => setScreen('hub')}>
            Volver al menú
          </button>
        </div>
      </div>
    )
  }

  // ---- LEVELS ----
  if (screen === 'levels') {
    const maxShow = Math.min(TOTAL_LEVELS, Math.max(unlocked + 12, 30))
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Niveles · {profile.name}</h1>
            <p>Progresión propia · Solo avanzas si aciertas</p>
          </div>
        </header>
        <div className="id-level-grid">
          {Array.from({ length: maxShow }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked
            const done = completedLevels.has(n) || (scores[`${lang}:${n}`] ?? 0) > 0
            const cefr = levelToCefr(n)
            return (
              <button
                key={n}
                type="button"
                className={`id-level-cell ${locked ? 'locked' : ''} ${n === currentLevel ? 'current' : ''} ${done ? 'done' : ''}`}
                disabled={locked || done}
                onClick={() => !locked && !done && openVocab(n)}
                title={done ? 'Ya completado' : locked ? 'Bloqueado' : `Nivel ${n}`}
              >
                <span className="cefr">{cefr}</span>
                <span className="num">{n}</span>
                <span className="mark">{done ? '✓' : locked ? '🔒' : '·'}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- CLASE (lección extensa antes de jugar cada nivel) ----
  if (screen === 'vocab' && pendingLevel !== null && pendingQuestion) {
    const q = pendingQuestion
    const lesson = MODE_LESSON[q.mode]
    const era = originEraLabel(q.etymology)
    const allRevealed = revealed.size >= q.options.length
    const toggleReveal = (idx: number) => {
      setRevealed((prev) => {
        const next = new Set(prev)
        if (!next.has(idx)) {
          next.add(idx)
          playSfx('flip')
        }
        return next
      })
    }
    const lessonParagraphs = [
      ...lesson.body,
      `Regla específica de este nivel: ${q.ruleHint}`,
      q.ruleExplain,
      q.etymology ? `Etimología relevante: ${q.etymology}` : '',
      era ?? '',
    ].filter(Boolean)
    const toggleLessonAudio = () => {
      if (lessonAudioOn) {
        window.speechSynthesis?.cancel()
        setLessonAudioOn(false)
        return
      }
      playSfx('toggle')
      setLessonAudioOn(true)
      speakLesson(
        [lesson.title, ...lessonParagraphs, 'Ahora, las opciones que verás en la pregunta:',
          ...q.options],
        lang,
        () => setLessonAudioOn(false)
      )
    }
    return (
      <motion.div
        className="id-root id-lesson-root"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <style>{CSS}</style>
        <div className="id-glass-blob b1" aria-hidden="true" />
        <div className="id-glass-blob b2" aria-hidden="true" />
        <header className="id-top">
          <button
            className="id-icon"
            onClick={() => {
              window.speechSynthesis?.cancel()
              setLessonAudioOn(false)
              setScreen('levels')
            }}
            aria-label="Volver"
          >
            ←
          </button>
          <div className="id-top-title">
            <h1>
              Clase · Nivel {pendingLevel} <span className="id-cefr-badge">{q.cefr}</span>
            </h1>
            <p>
              {profile.flag} {profile.name} · {MODE_LABELS[q.mode]} · dificultad {q.difficulty}/5
            </p>
          </div>
        </header>

        <motion.article
          className="id-lesson-card id-glass-panel"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05, duration: 0.3 }}
        >
          <div className="id-lesson-head">
            <h2>{lesson.title}</h2>
            <button
              type="button"
              className={`id-audio-toggle ${lessonAudioOn ? 'playing' : ''}`}
              onClick={toggleLessonAudio}
            >
              {lessonAudioOn ? '⏹ Detener lectura' : '🔊 Leer toda la clase en voz alta'}
            </button>
          </div>
          {lessonParagraphs.map((p, i) => (
            <p key={i} className="id-lesson-p">
              {p}
            </p>
          ))}
          {q.passage && (
            <div className="id-passage">
              <h3>Texto de este nivel</h3>
              <p>{q.passage}</p>
            </div>
          )}
        </motion.article>

        <div className="id-lesson-gate">
          <p className="id-meta">
            Antes de leer la pregunta, interpreta cada una de las {q.options.length} opciones:
            toca cada tarjeta, piensa qué crees que significa o qué función cumple, y luego revela
            la explicación. Aquí no se dice cuál es la respuesta correcta — eso lo decides tú al
            leer la pregunta. Reveladas: {revealed.size}/{q.options.length}
            {allRevealed ? ' · ¡Listo!' : ''}
          </p>
          <div className="id-progress-track small">
            <motion.div
              className="id-progress-fill"
              animate={{ width: `${(revealed.size / q.options.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <div className="id-vocab-list">
          {q.options.map((opt, idx) => {
            const entry = findLexEntry(lang, opt)
            const isOpen = revealed.has(idx)
            return (
              <motion.article
                key={`${q.id}-opt-${idx}`}
                className={`id-vocab-card id-glass-panel ${isOpen ? 'open' : 'closed'}`}
                whileHover={{ y: -3 }}
                layout
              >
                <button
                  type="button"
                  className="id-vocab-flip-btn"
                  onClick={() => toggleReveal(idx)}
                >
                  <div className="id-vocab-head">
                    <span className="id-opt-letter">{String.fromCharCode(65 + idx)}</span>
                    <h3>{opt}</h3>
                    {entry && (
                      <span
                        className="id-speak-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          speak(entry.target, lang)
                        }}
                        role="button"
                        aria-label="Escuchar pronunciación"
                      >
                        🔊
                      </span>
                    )}
                  </div>
                  {!isOpen && (
                    <p className="id-vocab-guess">
                      ¿Qué crees que significa? Toca para interpretar y revelar la explicación.
                    </p>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="id-vocab-body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      {entry ? (
                        <>
                          <p className="id-vocab-es">
                            <strong>Significa:</strong> {entry.es}
                            {entry.topic && <span className="id-vocab-topic"> · {entry.topic}</span>}
                          </p>
                          <p className="id-vocab-note">{entry.note}</p>
                          {entry.phoneticEs && (
                            <p className="id-vocab-phonetic">
                              <strong>Cómo leerla desde el español:</strong> {entry.phoneticEs}
                            </p>
                          )}
                          {entry.etymology && (
                            <p className="id-vocab-etym">
                              <strong>De dónde viene:</strong> {entry.etymology}
                            </p>
                          )}
                          {entry.root && (
                            <p className="id-vocab-root">
                              <strong>Raíz para memorizar:</strong> {entry.root}
                            </p>
                          )}
                        </>
                      ) : q.optionNotes && q.optionNotes[idx] ? (
                        <p className="id-vocab-note">{q.optionNotes[idx]}</p>
                      ) : q.mode === 'reading_comprehension' ? (
                        <p className="id-vocab-note">
                          Esta opción es una posible lectura del pasaje de arriba. Vuelve al texto y
                          localiza literalmente dónde dice algo parecido a "{opt}" (o dónde queda
                          claro que NO lo dice): la respuesta correcta siempre se puede señalar con
                          el dedo en el pasaje, no se adivina.
                        </p>
                      ) : (
                        <p className="id-vocab-note">
                          Todavía no tenemos el desglose línea por línea de esta opción para{' '}
                          {profile.name}. Usa la regla explicada arriba ({q.ruleHint}) para
                          analizarla tú mismo: ¿qué forma o estructura es, y qué exige la regla?
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            )
          })}
        </div>

        <div className="id-actions">
          <motion.button
            className={`id-btn primary id-glow-btn ${!allRevealed ? 'disabled' : ''}`}
            type="button"
            disabled={!allRevealed}
            whileHover={allRevealed ? { scale: 1.02 } : {}}
            whileTap={allRevealed ? { scale: 0.97 } : {}}
            onClick={() => {
              if (!allRevealed) return
              window.speechSynthesis?.cancel()
              startLevel(pendingQuestion.level, pendingQuestion)
            }}
          >
            {allRevealed ? `Ya interpreté todo · Leer la pregunta y responder` : `Interpreta las ${q.options.length} opciones para continuar`}
          </motion.button>
          <button className="id-btn" type="button" onClick={() => setScreen('levels')}>
            Volver al mapa de niveles
          </button>
        </div>
      </motion.div>
    )
  }

  // ---- READING LIST ----
  if (screen === 'reading') {
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('hub')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>Lectura · Historias del mundo</h1>
            <p>Historia y cultura · original ↔ español · cita APA</p>
          </div>
        </header>
        <p className="id-meta" style={{ marginBottom: 8 }}>
          Elige una historia. Dentro podrás alternar entre el texto en español y el idioma original
          para leer coma por coma y punto por punto, y tocar las palabras subrayadas para ver su
          traducción.
        </p>
        <div className="id-lang-toggle" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`id-toggle-btn ${storyFilterLang === 'all' ? 'active' : ''}`}
            onClick={() => setStoryFilterLang('all')}
          >
            Todos los idiomas
          </button>
          {Array.from(new Set(STORIES.map((s) => s.lang))).map((id) => (
            <button
              key={id}
              type="button"
              className={`id-toggle-btn ${storyFilterLang === id ? 'active' : ''}`}
              onClick={() => setStoryFilterLang(id)}
            >
              {LANG_PROFILES[id].flag} {LANG_PROFILES[id].name}
            </button>
          ))}
        </div>
        <div className="id-story-list">
          {STORIES.filter((s) => storyFilterLang === 'all' || s.lang === storyFilterLang).map((s) => (
            <button
              key={s.id}
              type="button"
              className="id-story-card"
              onClick={() => {
                setStoryId(s.id)
                setStoryLangMode('es')
                setScreen('story')
              }}
            >
              <div className="id-story-head">
                <span className="id-flag">{LANG_PROFILES[s.lang].flag}</span>
                <strong>{s.titleEs}</strong>
              </div>
              <span className="id-story-region">{s.region}</span>
              <span className="id-story-tags">{s.tags.join(' · ')}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ---- STORY VIEW ----
  if (screen === 'story' && activeStory) {
    const showOriginal = storyLangMode === 'original'
    const showBreakdown = storyLangMode === 'breakdown'
    const glossMap = new Map(
      (activeStory.glossary ?? []).map((g) => [g.word.toLowerCase(), g])
    )
    const renderWithGlossary = (text: string) => {
      if (!showOriginal || glossMap.size === 0) return text
      const tokens = text.split(/([a-zA-ZÀ-ÿ'’]+)/)
      return tokens.map((tok, i) => {
        const key = tok.toLowerCase().replace(/['’]/g, '')
        const g = glossMap.get(key)
        if (!g) return <span key={i}>{tok}</span>
        return (
          <button
            key={i}
            type="button"
            className="id-gloss-word"
            onClick={() => setActiveGloss(g)}
          >
            {tok}
          </button>
        )
      })
    }
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('reading')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>{showOriginal || showBreakdown ? activeStory.titleOriginal : activeStory.titleEs}</h1>
            <p>
              {activeStory.region} · {LANG_PROFILES[activeStory.lang].flag}{' '}
              {LANG_PROFILES[activeStory.lang].name}
            </p>
          </div>
        </header>

        <div className="id-lang-toggle">
          <button
            type="button"
            className={`id-toggle-btn ${storyLangMode === 'es' ? 'active' : ''}`}
            onClick={() => setStoryLangMode('es')}
          >
            Español
          </button>
          <button
            type="button"
            className={`id-toggle-btn ${showOriginal ? 'active' : ''}`}
            onClick={() => setStoryLangMode('original')}
          >
            Original ({LANG_PROFILES[activeStory.lang].nativeName})
          </button>
          <button
            type="button"
            className={`id-toggle-btn ${showBreakdown ? 'active' : ''}`}
            onClick={() => setStoryLangMode('breakdown')}
          >
            🔍 Frase por frase
          </button>
        </div>

        {!showBreakdown && (
          <article className="id-card id-story-body">
            <div className="id-essay">
              {showOriginal ? renderWithGlossary(activeStory.textOriginal) : activeStory.textEs}
            </div>
            {showOriginal && glossMap.size > 0 && (
              <p className="id-meta" style={{ marginTop: 8 }}>
                Toca cualquier palabra subrayada para ver su traducción y una nota breve.
              </p>
            )}
            <h3>Referencia (APA)</h3>
            <p className="id-apa-inline">
              <em>{activeStory.apa}</em>
            </p>
            <p className="id-apa-note">{activeStory.note}</p>
          </article>
        )}

        {showBreakdown && (
          <article className="id-card id-story-body">
            <p className="id-meta" style={{ marginBottom: 10 }}>
              Cada frase del texto original, su traducción y una explicación de por qué se escribe
              así en {LANG_PROFILES[activeStory.lang].name} y cómo se lee desde el español.
            </p>
            {(activeStory.sentences ?? []).length === 0 && (
              <p className="id-meta">
                Esta historia todavía no tiene el desglose frase por frase disponible. Usa el modo
                "Original" con el glosario tocable mientras lo agregamos.
              </p>
            )}
            <div className="id-breakdown-list">
              {(activeStory.sentences ?? []).map((s, i) => (
                <div key={i} className="id-breakdown-item id-glass-panel">
                  <div className="id-vocab-head">
                    <span className="id-opt-letter">{i + 1}</span>
                    <h3 className="id-breakdown-original">{s.original}</h3>
                    <span
                      className="id-speak-btn"
                      role="button"
                      onClick={() => speak(s.original, activeStory.lang)}
                    >
                      🔊
                    </span>
                  </div>
                  <p className="id-breakdown-es">
                    <strong>Traducción:</strong> {s.es}
                  </p>
                  <p className="id-breakdown-note">
                    <strong>Por qué se escribe/lee así:</strong> {s.note}
                  </p>
                </div>
              ))}
            </div>
          </article>
        )}

        <AnimatePresence>
          {activeGloss && (
            <motion.div
              className="id-gloss-popover"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={() => setActiveGloss(null)}
            >
              <div className="id-gloss-card" onClick={(e) => e.stopPropagation()}>
                <div className="id-vocab-head">
                  <h3>{activeGloss.word}</h3>
                  <button
                    type="button"
                    className="id-speak-btn"
                    onClick={() => speak(activeGloss.word, activeStory.lang)}
                  >
                    🔊
                  </button>
                </div>
                <p className="id-vocab-es">
                  <strong>Significa:</strong> {activeGloss.es}
                </p>
                {activeGloss.note && <p className="id-vocab-note">{activeGloss.note}</p>}
                <button className="id-btn" type="button" onClick={() => setActiveGloss(null)}>
                  Cerrar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="id-actions">
          <button className="id-btn" type="button" onClick={() => setScreen('reading')}>
            Más historias
          </button>
          <button className="id-btn primary" type="button" onClick={() => setScreen('hub')}>
            Menú principal
          </button>
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
              {profile.flag} Nivel {question.level}{' '}
              <span className="id-cefr-badge">{question.cefr}</span>
            </h1>
            <p>
              {MODE_LABELS[question.mode]} · dificultad {question.difficulty}/5
            </p>
          </div>
        </header>

        <div className="id-play-card">
          <button
            type="button"
            className="id-hint-btn"
            onClick={() => {
              playSfx('toggle')
              setHintOpen((v) => !v)
            }}
            aria-expanded={hintOpen}
          >
            💡 Pista / regla {hintOpen ? '▾' : '▸'}
          </button>
          <AnimatePresence initial={false}>
            {hintOpen && (
              <motion.div
                className="id-hint-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <p className="id-rule-hint">
                  <strong>{question.ruleHint}</strong>
                </p>
                <p className="id-rule-explain">{question.ruleExplain}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {question.passage && (
            <div className="id-passage">
              <h3>Texto</h3>
              <p>{question.passage}</p>
            </div>
          )}

          <h2 className="id-prompt">{question.prompt}</h2>
          <div className="id-options">
            {question.options.map((opt, idx) => (
              <motion.button
                key={`${question.id}-${idx}`}
                type="button"
                className={`id-opt ${selected === idx ? 'picked' : ''}`}
                onClick={() => onSelectOption(idx)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="id-opt-letter">{String.fromCharCode(65 + idx)}</span>
                <span>{opt}</span>
              </motion.button>
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
            <p>
              {correct
                ? 'Nivel completado · no se repetirá en la progresión'
                : 'Sigue el consejo · la respuesta no se revela'}
            </p>
          </div>
        </header>
        <motion.div
          className={`id-result-banner ${correct ? 'ok' : 'bad'}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        >
          {correct ? '✓ Bien razonado' : '✗ Aún no · usa el consejo del nivel'}
        </motion.div>

        {correct && lastGrade && (
          <motion.div
            className="id-grade-card"
            initial={{ scale: 0.8, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.1 }}
          >
            {lastGrade.grade === 'S' && (
              <div className="id-confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <motion.span
                    key={i}
                    className="id-confetti-piece"
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      scale: [0, 1, 1, 0.6],
                      x: Math.cos((i / 14) * Math.PI * 2) * 90,
                      y: Math.sin((i / 14) * Math.PI * 2) * 90 - 20,
                      rotate: i * 37,
                    }}
                    transition={{ duration: 1.1, delay: 0.15, ease: 'easeOut' }}
                  >
                    {['✦', '★', '✧', '●'][i % 4]}
                  </motion.span>
                ))}
              </div>
            )}
            <div className="id-grade-letter">{lastGrade.grade}</div>
            <div className="id-grade-stars">{'★'.repeat(lastGrade.stars)}{'☆'.repeat(5 - lastGrade.stars)}</div>
            <p>{lastGrade.comment}</p>
            <p className="id-meta">
              Tiempo: {lastGrade.seconds}s · Intentos en este nivel: {lastGrade.attempts}
            </p>
          </motion.div>
        )}

        <div className="id-card">
          {correct ? (
            <>
              <h3>Explicación</h3>
              <p className="id-explain">{question.explanation}</p>
              {question.rootFocus && (
                <p className="id-rule-hint">
                  <strong>Memoriza la raíz / lexema:</strong> {question.rootFocus}
                </p>
              )}
              {question.etymology && (
                <p className="id-rule-explain">
                  <strong>Etimología / familia:</strong> {question.etymology}
                </p>
              )}
              <p className="id-rule-explain">
                <strong>Regla:</strong> {question.ruleHint}
              </p>
              <p className="id-rule-explain">{question.ruleExplain}</p>
              <p className="id-meta">
                Respuesta:{' '}
                <strong>
                  {String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}
                </strong>
              </p>
              <p className="id-meta">Guardado en Mi diccionario (no se repetirá).</p>
            </>
          ) : (
            <>
              <h3>Consejo para este nivel</h3>
              <p className="id-explain">{question.failAdvice}</p>
              <p className="id-rule-explain">
                <strong>Pista de regla:</strong> {question.ruleHint}
              </p>
              <p className="id-meta">
                Si fallas, reintenta aplicando el consejo.
              </p>
            </>
          )}
          <p className="id-meta">
            Nivel {question.level} · {question.cefr} · {cefrLabel(question.cefr)}
          </p>
        </div>
        <div className="id-actions">
          {correct ? (
            <button
              className="id-btn primary"
              type="button"
              onClick={() => openVocab(Math.min(TOTAL_LEVELS, levelId + 1))}
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
  color: var(--gco-ink, var(--text-primary, #f2f4f8));
  font-family: var(--font-body, Inter, system-ui, sans-serif);
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
  font-family: var(--font-display, "Space Grotesk", Inter, sans-serif);
  font-size: clamp(1.15rem, 4vw, 1.45rem);
  letter-spacing: -0.02em;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.id-top-title p {
  margin: 2px 0 0;
  opacity: 0.65;
  font-size: 0.82rem;
}
.id-cefr-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, #3AA0FF 22%, transparent);
  border: 1px solid color-mix(in srgb, #3AA0FF 40%, transparent);
}
.id-icon {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 18%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 8%, transparent);
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
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
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
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 12%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 5%, transparent);
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
  background: color-mix(in srgb, var(--gco-ink, #fff) 5%, transparent);
  font-size: 0.82rem;
}
.id-apa-note { opacity: 0.7; font-size: 0.84rem; }
.id-apa-inline { font-size: 0.84rem; line-height: 1.4; }
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
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 16%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 7%, transparent);
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
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  max-height: 70dvh;
  overflow: auto;
  padding: 4px;
}
.id-level-cell {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  color: inherit;
  border-radius: 12px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.id-level-cell .cefr {
  font-size: 0.65rem;
  font-weight: 800;
  opacity: 0.75;
  letter-spacing: 0.03em;
}
.id-level-cell.locked { opacity: 0.35; cursor: not-allowed; }
.id-level-cell.current { outline: 2px solid #3AA0FF; }
.id-level-cell.done { border-color: #4ADE8088; }
.id-level-cell .num { font-weight: 700; }
.id-level-cell .mark { font-size: 0.75rem; opacity: 0.8; }
.id-play-card {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 12%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 5%, transparent);
  backdrop-filter: blur(14px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.id-hint-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, #3AA0FF 35%, transparent);
  background: color-mix(in srgb, #3AA0FF 12%, transparent);
  color: inherit;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}
.id-hint-body {
  overflow: hidden;
}
.id-rule-hint {
  margin: 0 0 6px;
  font-size: 0.9rem;
  opacity: 0.95;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #3AA0FF 12%, transparent);
  border: 1px solid color-mix(in srgb, #3AA0FF 25%, transparent);
}
.id-rule-explain {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
  opacity: 0.88;
  padding: 0 4px 4px;
}
.id-passage {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 10%, transparent);
  font-size: 0.9rem;
  line-height: 1.5;
}
.id-passage h3 {
  margin: 0 0 6px;
  font-size: 0.85rem;
  opacity: 0.8;
}
.id-passage p { margin: 0; white-space: pre-wrap; }
.id-prompt {
  margin: 0;
  font-size: clamp(1.05rem, 3.5vw, 1.25rem);
  line-height: 1.35;
  font-family: var(--font-display, "Space Grotesk", Inter, sans-serif);
}
.id-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.id-opt {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
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
  background: color-mix(in srgb, var(--gco-ink, #fff) 12%, transparent);
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
.id-grade-card {
  text-align: center;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, #8B7CF6 35%, transparent);
  background: color-mix(in srgb, #8B7CF6 12%, transparent);
}
.id-grade-letter {
  font-size: 2.4rem;
  font-weight: 800;
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  line-height: 1;
}
.id-grade-stars {
  font-size: 1.2rem;
  letter-spacing: 0.15em;
  margin: 4px 0 8px;
}
.id-explain {
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 8px;
}
.id-mode-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.id-mode-card {
  appearance: none;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.id-mode-card strong { font-size: 0.95rem; }
.id-mode-card span { font-size: 0.82rem; opacity: 0.75; line-height: 1.35; }
.id-mode-card.active {
  outline: 2px solid #3AA0FF;
  background: color-mix(in srgb, #3AA0FF 14%, transparent);
}
.id-story-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.id-story-card {
  appearance: none;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  backdrop-filter: blur(12px);
}
.id-story-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
}
.id-story-region {
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.75;
}
.id-story-tags {
  font-size: 0.75rem;
  opacity: 0.6;
}
.id-story-body {
  padding: 16px;
}
.id-lang-toggle {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.id-toggle-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 16%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 7%, transparent);
  color: inherit;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}
.id-toggle-btn.active {
  outline: 2px solid #3AA0FF;
  background: color-mix(in srgb, #3AA0FF 18%, transparent);
}
.id-dict-card {
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  backdrop-filter: blur(12px);
}
.id-dict-prompt {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.4;
}
.id-dict-answer {
  margin: 0;
  font-size: 0.9rem;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, #4ADE80 14%, transparent);
  border: 1px solid color-mix(in srgb, #4ADE80 30%, transparent);
}

/* =========================================================================
   Liquid glass avanzado · clase previa, vocabulario, logros, confeti
   ========================================================================= */

@keyframes id-float-blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(18px, -22px) scale(1.08); }
  66% { transform: translate(-14px, 14px) scale(0.95); }
}
@keyframes id-shimmer-border {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes id-pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #3AA0FF 45%, transparent); }
  50% { box-shadow: 0 0 0 10px color-mix(in srgb, #3AA0FF 0%, transparent); }
}

.id-lesson-root {
  position: relative;
  overflow: hidden;
}
.id-glass-blob {
  position: absolute;
  border-radius: 999px;
  filter: blur(40px);
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
  animation: id-float-blob 14s ease-in-out infinite;
}
.id-glass-blob.b1 {
  width: 220px; height: 220px;
  background: radial-gradient(circle, #3AA0FF, transparent 70%);
  top: -60px; left: -40px;
}
.id-glass-blob.b2 {
  width: 260px; height: 260px;
  background: radial-gradient(circle, #8B7CF6, transparent 70%);
  bottom: -80px; right: -60px;
  animation-delay: 4s;
}

.id-glass-panel {
  position: relative;
  z-index: 1;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 16%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--gco-ink, #fff) 10%, transparent), color-mix(in srgb, var(--gco-ink, #fff) 3%, transparent));
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent),
    0 8px 30px rgba(0,0,0,0.18);
}

.id-lesson-card {
  padding: 18px;
  margin-bottom: 14px;
}
.id-lesson-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.id-lesson-head h2 {
  margin: 0;
  font-size: 1.1rem;
  font-family: var(--font-display, "Space Grotesk", Inter, sans-serif);
}
.id-audio-toggle {
  appearance: none;
  border: 1px solid color-mix(in srgb, #8B7CF6 45%, transparent);
  background:
    linear-gradient(120deg, color-mix(in srgb, #8B7CF6 22%, transparent), color-mix(in srgb, #3AA0FF 22%, transparent), color-mix(in srgb, #8B7CF6 22%, transparent));
  background-size: 200% 100%;
  color: inherit;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
}
.id-audio-toggle.playing {
  animation: id-shimmer-border 2.4s linear infinite, id-pulse-glow 1.8s ease-in-out infinite;
}
.id-lesson-p {
  font-size: 0.92rem;
  line-height: 1.55;
  opacity: 0.92;
  margin: 0 0 10px;
}
.id-lesson-gate {
  margin: 4px 0 10px;
}
.id-progress-track {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gco-ink, #fff) 10%, transparent);
  overflow: hidden;
  margin-top: 8px;
}
.id-progress-track.small { height: 6px; }
.id-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3AA0FF, #8B7CF6, #4ADE80);
  background-size: 200% 100%;
  animation: id-shimmer-border 3s linear infinite;
}
.id-streak-line {
  font-size: 0.9rem;
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #FF8A3D 16%, transparent);
  border: 1px solid color-mix(in srgb, #FF8A3D 35%, transparent);
  margin: 8px 0;
}

.id-vocab-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.id-vocab-card {
  padding: 0;
  overflow: hidden;
  transition: border-color 0.2s ease;
}
.id-vocab-card.open {
  border-color: color-mix(in srgb, #3AA0FF 55%, transparent);
}
.id-vocab-flip-btn {
  appearance: none;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.id-vocab-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.id-vocab-head h3 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-display, "Space Grotesk", Inter, sans-serif);
  flex: 1;
}
.id-vocab-guess {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.65;
  font-style: italic;
}
.id-vocab-body {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.id-vocab-es { margin: 0; font-size: 0.92rem; }
.id-vocab-topic {
  font-size: 0.75rem;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.id-vocab-note { margin: 0; font-size: 0.86rem; opacity: 0.85; line-height: 1.4; }
.id-vocab-phonetic, .id-vocab-etym, .id-vocab-era, .id-vocab-root {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
}
.id-vocab-verdict {
  margin: 4px 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 10px;
}
.id-vocab-verdict.yes {
  background: color-mix(in srgb, #4ADE80 18%, transparent);
  color: color-mix(in srgb, #4ADE80 85%, var(--gco-ink, #fff));
}
.id-vocab-verdict.no {
  background: color-mix(in srgb, #FF6B4A 16%, transparent);
}
.id-speak-btn {
  flex-shrink: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, #3AA0FF 16%, transparent);
  border: 1px solid color-mix(in srgb, #3AA0FF 30%, transparent);
  cursor: pointer;
  font-size: 0.9rem;
}
.id-skip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  opacity: 0.8;
  margin: 12px 0;
  cursor: pointer;
}
.id-glow-btn {
  position: relative;
}
.id-glow-btn:not(.disabled) {
  animation: id-pulse-glow 2.2s ease-in-out infinite;
}
.id-glow-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.id-gloss-word {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px dotted color-mix(in srgb, #3AA0FF 60%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.id-gloss-popover {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
  padding: 12px;
}
.id-gloss-card {
  width: 100%;
  max-width: 460px;
  border-radius: 18px 18px 8px 8px;
  border: 1px solid color-mix(in srgb, var(--gco-ink, #fff) 18%, transparent);
  background: color-mix(in srgb, var(--gco-ink, #fff) 10%, #111);
  backdrop-filter: blur(24px) saturate(160%);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.id-confetti {
  position: relative;
  height: 0;
}
.id-confetti-piece {
  position: absolute;
  top: 0;
  left: 50%;
  font-size: 1.1rem;
  color: #3AA0FF;
}

.id-dict-card.earned {
  border-color: color-mix(in srgb, #FFD24A 55%, transparent);
  background: color-mix(in srgb, #FFD24A 10%, transparent);
}
.id-dict-card.locked-badge { opacity: 0.55; }

@media (max-width: 480px) {
  .id-lang-btn { font-size: 0.78rem; padding: 7px 10px; }
  .id-opt { font-size: 0.88rem; }
  .id-lesson-head { flex-direction: column; align-items: stretch; }
  .id-audio-toggle { width: 100%; text-align: center; }
}
.id-breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.id-breakdown-item {
  padding: 12px 14px;
}
.id-breakdown-original {
  margin: 0;
  font-size: 1rem;
  flex: 1;
}
.id-breakdown-es, .id-breakdown-note {
  margin: 6px 0 0;
  font-size: 0.88rem;
  line-height: 1.5;
}
.id-breakdown-note {
  opacity: 0.85;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--gco-ink, #fff) 6%, transparent);
  margin-top: 8px;
}
`