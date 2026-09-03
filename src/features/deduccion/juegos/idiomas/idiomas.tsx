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
}

type Screen = 'hub' | 'learn' | 'play' | 'result' | 'levels' | 'modes' | 'reading' | 'story'

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
  if (level <= 40) return 'A1'
  if (level <= 60) return 'A2'
  if (level <= 120) return 'B1'
  if (level <= 240) return 'B2'
  if (level <= 480) return 'C1'
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

// -----------------------------------------------------------------------------
// Banco léxico y reglas por idioma
// -----------------------------------------------------------------------------

interface LexItem {
  es: string
  target: string
  note: string
  rule?: string
}

const EN_LEX: LexItem[] = [
  { es: 'casa', target: 'house', note: 'Sustantivo concreto; no "home" (hogar/sentimiento).' },
  { es: 'libro', target: 'book', note: 'Cognado parcial; "library" es biblioteca, no librería.' },
  { es: 'agua', target: 'water', note: 'Germánico; no cognado latino directo en uso común.' },
  { es: 'amigo', target: 'friend', note: 'False friend informal: "amigo" en inglés coloquial ≠ solo friend formal.' },
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
  { es: 'nación', target: 'nation', note: 'Sufijo -tion de origen latino; cognado transparente.' },
  { es: 'información', target: 'information', note: 'Incontable en inglés: no "informations".' },
  { es: 'decisión', target: 'decision', note: 'Sufijo -sion; verbo decide.' },
  { es: 'posible', target: 'possible', note: 'Sufijo -ible/-able de posibilidad.' },
  { es: 'realidad', target: 'reality', note: 'Sufijo -ity; adjetivo real.' },
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
  },
  {
    prompt: '¿Cuál es el plural de “child”?',
    ruleHint: 'Plurales irregulares germánicos.',
    ruleExplain: 'Algunos sustantivos antiguos forman el plural con cambio vocálico (umlaut histórico) o formas supletivas, no con -s.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['childs', 'childes', 'children', 'childrens', 'child', 'childer', 'kids', 'childen'],
    correctIndex: 2,
    explanation: 'Child → children es un plural irregular histórico; no se forma con -s.',
  },
  {
    prompt: 'Completa: “I have ____ this book.”',
    ruleHint: 'Present perfect: have + participio pasado.',
    ruleExplain: 'El present perfect (have/has + past participle) enlaza pasado y presente: experiencia, resultado o acción no terminada en un periodo que incluye ahora.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['readed', 'read', 'reading', 'reads', 'rode', 'written', 'red', 'reed'],
    correctIndex: 1,
    explanation: 'El participio de read es read (pronunciado /red/). Have read = presente perfecto.',
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
  },
  {
    prompt: 'Elige el phrasal verb: “buscar información en un diccionario”',
    ruleHint: 'Verb + particle cambia el significado.',
    ruleExplain: 'Los phrasal verbs no se traducen palabra a palabra. Look up = consultar; look for = buscar; look after = cuidar.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['look after', 'look up', 'look for', 'look out', 'look into', 'look down', 'look over', 'look on'],
    correctIndex: 1,
    explanation: 'Look up = consultar (palabra). Look for = buscar; look after = cuidar.',
  },
  {
    prompt: 'Artículo correcto: “____ university is big.” (hablando de una concreta conocida)',
    ruleHint: 'The para referentes definidos; a/an indefinidos.',
    ruleExplain: 'The se usa cuando el oyente puede identificar el referente (ya mencionado, único en contexto, o conocido).',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['A', 'An', 'The', '∅ (ninguno)', 'Some', 'Any', 'This only', 'Those'],
    correctIndex: 2,
    explanation: 'Si es definida/conocida en el discurso: the university.',
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
  },
  {
    prompt: '“If it rains, we will stay home.” Es un condicional de tipo…',
    ruleHint: 'Condicionales: 0 (hechos), 1 (real futuro), 2 (irreal presente), 3 (irreal pasado).',
    ruleExplain: '1.ª condicional: if + present, will + verb. Situaciones reales o posibles en el futuro.',
      failAdvice: 'Revisa la regla del enunciado y elimina opciones incompatibles antes de elegir.',
    options: ['0 (verdades generales)', '1 (posible en el futuro)', '2 (hipótesis presente)', '3 (hipótesis pasada)', 'mixto solo', 'imperativo', 'subjuntivo latino', 'ninguno'],
    correctIndex: 1,
    explanation: 'If + presente, will + verbo = 1.ª condicional (posible/real en el futuro).',
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
export const TOTAL_LEVELS = 500

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
  const difficulty = (clamp(1 + Math.floor((L - 1) / 80), 1, 5) as 1 | 2 | 3 | 4 | 5)

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

  const rotateOptions = (options: string[], correctIndex: number, salt: number) => {
    const rot = salt % options.length
    const rotated = [...options.slice(rot), ...options.slice(0, rot)]
    const newCorrect = (correctIndex - rot + options.length) % options.length
    return { options: rotated, correctIndex: newCorrect }
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
    const contexts: Record<string, { prompt: string; options: string[]; correctIndex: number; hint: string; explain: string; advice: string }> = {
      en: {
        prompt: 'Palabra: 「bank」. En “we sat on the bank of the river”, ¿qué significa?',
        options: ['banco financiero', 'orilla del río', 'banqueta', 'archivo', 'pendiente', 'empresa', 'moneda', 'puente'],
        correctIndex: 1,
        hint: 'Polisemia: institución vs orilla.',
        explain: 'bank of the river = orilla.',
        advice: 'Mira el complemento “of the river”; no asumas siempre el sentido financiero.',
      },
      es: {
        prompt: 'Palabra: 「banco」. En “nos sentamos en un banco del parque”, ¿qué significa?',
        options: ['entidad financiera', 'asiento', 'banco de peces', 'archivo', 'grupo de datos', 'orilla', 'empresa', 'caja fuerte'],
        correctIndex: 1,
        hint: 'Polisemia según complemento.',
        explain: 'banco del parque = asiento.',
        advice: 'El complemento “del parque” orienta al asiento, no al banco financiero.',
      },
      fr: {
        prompt: 'Palabra: 「temps」. En “quel temps fait-il ?”, ¿qué significa?',
        options: ['tiempo cronológico', 'clima / tiempo atmosférico', 'tiempo verbal', 'tempo musical', 'época', 'horario', 'retraso', 'calendario'],
        correctIndex: 1,
        hint: 'Expresión fija con faire → clima.',
        explain: 'quel temps fait-il = qué tiempo hace.',
        advice: 'La construcción con “fait-il” apunta al clima, no al reloj.',
      },
      ja: {
        prompt: 'Elemento: 「は」 como partícula de tema. ¿Cómo se pronuncia?',
        options: ['ha', 'wa', 'ba', 'pa', 'ga', 'wo', 'a', 'ho'],
        correctIndex: 1,
        hint: 'Lectura especial de partícula.',
        explain: 'は tema = wa.',
        advice: 'No uses la lectura del kana independiente; la partícula tema se lee wa.',
      },
      zh: {
        prompt: 'Partícula 「了」 en “我吃了” (cambio/completado). ¿Qué marca?',
        options: ['futuro', 'acción completada / cambio de estado', 'plural', 'posesión', 'pasiva', 'comparativo', 'clasificador', 'tono'],
        correctIndex: 1,
        hint: 'Aspecto, no tiempo europeo exacto.',
        explain: '了 aspectual de completado/cambio.',
        advice: 'No lo equinares automáticamente a un pretérito único; piensa en aspecto o cambio de estado.',
      },
      pt: {
        prompt: 'Expresión 「a gente」 (PT-BR). ¿Qué concordancia verbal usa?',
        options: ['1.ª plural (vamos)', '3.ª singular (vai)', '2.ª singular', '1.ª singular', '3.ª plural', 'imperativo', 'infinitivo', 'gerundio'],
        correctIndex: 1,
        hint: 'Significa “nosotros” pero concuerda en 3.ª singular.',
        explain: 'A gente vai / fala.',
        advice: 'No conjugues en 1.ª plural con a gente en el patrón coloquial brasileño descrito.',
      },
      de: {
        prompt: 'Conjunción 「weil」. ¿Qué hace al verbo conjugado de la subordinada?',
        options: ['segunda posición', 'lo envía al final', 'lo elimina', 'imperativo', 'infinitivo', 'al inicio', 'no cambia', 'modal'],
        correctIndex: 1,
        hint: 'Nebensatz: verbo al final.',
        explain: 'weil ich müde bin.',
        advice: 'Dentro de la subordinada con weil no dejes el verbo en V2.',
      },
      it: {
        prompt: 'Palabra 「camera」 en hotel. ¿Qué significa?',
        options: ['cámara fotográfica', 'habitación', 'salón', 'cocina', 'baño', 'recepción', 'ascensor', 'pasillo'],
        correctIndex: 1,
        hint: 'False friend con “cámara”.',
        explain: 'camera = habitación.',
        advice: 'En contexto hotelero no elijas cámara fotográfica.',
      },
    }
    const c = contexts[lang] ?? contexts.en
    const rotated = rotateOptions(c.options, c.correctIndex, L + 3)
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
    const rotated = rotateOptions(g.options, g.correctIndex, L)
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

  if (mode === 'translate_to_es' || mode === 'cognate_logic') {
    const built = buildOptions(item.es, esPool, 8)
    return {
      id: `${lang}-toes-${L}`,
      lang,
      mode,
      level: L,
      cefr,
      prompt: `¿Qué significa en español: 「${item.target}」?`,
      ruleHint: item.rule || 'Deduce por cognado, contexto o regla del idioma.',
      ruleExplain: item.note + ' Busca raíces, género/número y evita calcos literales.',
      failAdvice: 'Revisa cognados y false friends; no elijas solo por parecido de letras.',
      options: built.options,
      correctIndex: built.correctIndex,
      explanation: `${item.target} → ${item.es}. ${item.note}`,
      difficulty,
    }
  }

  const built = buildOptions(item.target, targetPool, 8)
  return {
    id: `${lang}-fromes-${L}`,
    lang,
    mode: 'translate_from_es',
    level: L,
    cefr,
    prompt: `¿Cómo se dice en ${LANG_PROFILES[lang].name}: 「${item.es}」?`,
    ruleHint: item.rule || 'Correspondencia léxica; evita false friends.',
    ruleExplain: item.note + ' Atiende artículos, género e irregularidades.',
      failAdvice: 'Descarta false friends y calcos del español; busca la forma nativa habitual.',
    options: built.options,
    correctIndex: built.correctIndex,
    explanation: `${item.es} → ${item.target}. ${item.note}`,
    difficulty,
  }
}


export function generateLevelBank(lang: LangId, count = TOTAL_LEVELS): Question[] {
  return Array.from({ length: count }, (_, i) => generateQuestion(i + 1, lang))
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
  const [storyLangMode, setStoryLangMode] = useState<'es' | 'original'>('es')
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

  const startLevel = useCallback(
    (id: number) => {
      let target = id
      // Si ya está completado, avanzar al siguiente no completado desbloqueado
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
      const q = generateQuestion(target, lang, preferredMode)
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
      setScreen('play')
    },
    [lang, preferredMode, currentMap, completedLevels, unlocked]
  )

  const onSelectOption = (idx: number) => {
    if (answered || !question) return
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
      setLastGrade({ ...g, seconds, attempts })
      const best = readJSON<Record<string, number>>(LS.bestTime, {})
      if (!best[key] || seconds < best[key]) {
        best[key] = seconds
        writeJSON(LS.bestTime, best)
      }
    } else {
      setFails((f) => {
        const n = f + 1
        writeJSON(LS.fails, n)
        return n
      })
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
                  <strong>Progresión CEFR:</strong> 1–40 A1 · 41–60 A2 · 61–120 B1 · 121–240 B2 ·
                  241–480 C1 · 481+ C2 (por idioma).
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
          <button className="id-btn primary" type="button" onClick={() => startLevel(currentLevel)}>
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
          <p className="id-stats-line">
            Aciertos: {wins} · Fallos: {fails} · Desbloqueado ({profile.name}): {unlocked}/
            {TOTAL_LEVELS} · Completados: {(completedMap[lang] ?? []).length}
          </p>
          <p className="id-stats-line">
            Modo: {preferredMode === 'auto' ? 'Automático (ciclo)' : MODE_LABELS[preferredMode]}
          </p>
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
          <button className="id-btn primary" type="button" onClick={() => startLevel(currentLevel)}>
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
                onClick={() => !locked && !done && startLevel(n)}
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
          para leer coma por coma y punto por punto.
        </p>
        <div className="id-story-list">
          {STORIES.map((s) => (
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
    return (
      <div className="id-root">
        <style>{CSS}</style>
        <header className="id-top">
          <button className="id-icon" onClick={() => setScreen('reading')}>
            ←
          </button>
          <div className="id-top-title">
            <h1>{showOriginal ? activeStory.titleOriginal : activeStory.titleEs}</h1>
            <p>
              {activeStory.region} · {LANG_PROFILES[activeStory.lang].flag}{' '}
              {LANG_PROFILES[activeStory.lang].name}
            </p>
          </div>
        </header>

        <div className="id-lang-toggle">
          <button
            type="button"
            className={`id-toggle-btn ${!showOriginal ? 'active' : ''}`}
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
        </div>

        <article className="id-card id-story-body">
          <div className="id-essay">
            {showOriginal ? activeStory.textOriginal : activeStory.textEs}
          </div>
          <h3>Referencia (APA)</h3>
          <p className="id-apa-inline">
            <em>{activeStory.apa}</em>
          </p>
          <p className="id-apa-note">{activeStory.note}</p>
        </article>

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
            onClick={() => setHintOpen((v) => !v)}
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
            <p>
              {correct
                ? 'Nivel completado · no se repetirá en la progresión'
                : 'Sigue el consejo · la respuesta no se revela'}
            </p>
          </div>
        </header>
        <div className={`id-result-banner ${correct ? 'ok' : 'bad'}`}>
          {correct ? '✓ Bien razonado' : '✗ Aún no · usa el consejo del nivel'}
        </div>

        {correct && lastGrade && (
          <div className="id-grade-card">
            <div className="id-grade-letter">{lastGrade.grade}</div>
            <div className="id-grade-stars">{'★'.repeat(lastGrade.stars)}{'☆'.repeat(5 - lastGrade.stars)}</div>
            <p>{lastGrade.comment}</p>
            <p className="id-meta">
              Tiempo: {lastGrade.seconds}s · Intentos en este nivel: {lastGrade.attempts}
            </p>
          </div>
        )}

        <div className="id-card">
          {correct ? (
            <>
              <h3>Explicación</h3>
              <p className="id-explain">{question.explanation}</p>
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
            </>
          ) : (
            <>
              <h3>Consejo para este nivel</h3>
              <p className="id-explain">{question.failAdvice}</p>
              <p className="id-rule-explain">
                <strong>Pista de regla:</strong> {question.ruleHint}
              </p>
              <p className="id-meta">
                La respuesta correcta no se muestra al fallar. Reintenta aplicando el consejo.
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
@media (max-width: 480px) {
  .id-lang-btn { font-size: 0.78rem; padding: 7px 10px; }
  .id-opt { font-size: 0.88rem; }
}
`