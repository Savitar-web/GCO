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
  | 'reading_comprehension'// texto corto + pregunta

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
  unlocked: 'gco.idiomas.unlocked.v2',
  current: 'gco.idiomas.current.v2',
  lang: 'gco.idiomas.lang',
  scores: 'gco.idiomas.scores.v2',
  wins: 'gco.idiomas.wins',
  fails: 'gco.idiomas.fails',
  mode: 'gco.idiomas.mode',
  attempts: 'gco.idiomas.attempts.v2',
  bestTime: 'gco.idiomas.bestTime.v2',
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
  if (level <= 20) return 'A1'
  if (level <= 40) return 'A2'
  if (level <= 80) return 'B1'
  if (level <= 120) return 'B2'
  if (level <= 160) return 'C1'
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
    options: ['go', 'goes', 'going', 'gone', 'went', 'goed', 'goe', 'to go'],
    correctIndex: 1,
    explanation: 'En presente simple, la 3.ª persona singular (he/she/it) añade -s/-es: goes.',
  },
  {
    prompt: '¿Cuál es el plural de “child”?',
    ruleHint: 'Plurales irregulares germánicos.',
    ruleExplain: 'Algunos sustantivos antiguos forman el plural con cambio vocálico (umlaut histórico) o formas supletivas, no con -s.',
    options: ['childs', 'childes', 'children', 'childrens', 'child', 'childer', 'kids', 'childen'],
    correctIndex: 2,
    explanation: 'Child → children es un plural irregular histórico; no se forma con -s.',
  },
  {
    prompt: 'Completa: “I have ____ this book.”',
    ruleHint: 'Present perfect: have + participio pasado.',
    ruleExplain: 'El present perfect (have/has + past participle) enlaza pasado y presente: experiencia, resultado o acción no terminada en un periodo que incluye ahora.',
    options: ['readed', 'read', 'reading', 'reads', 'rode', 'written', 'red', 'reed'],
    correctIndex: 1,
    explanation: 'El participio de read es read (pronunciado /red/). Have read = presente perfecto.',
  },
  {
    prompt: 'Orden natural de adjetivos: “a ____ box”',
    ruleHint: 'Opinión → tamaño → edad → color → origen → material → propósito.',
    ruleExplain: 'El inglés ordena adjetivos prenominales en una secuencia preferida. “Nice small wooden” suena natural; otras permutaciones suenan raras.',
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
    options: ['look after', 'look up', 'look for', 'look out', 'look into', 'look down', 'look over', 'look on'],
    correctIndex: 1,
    explanation: 'Look up = consultar (palabra). Look for = buscar; look after = cuidar.',
  },
  {
    prompt: 'Artículo correcto: “____ university is big.” (hablando de una concreta conocida)',
    ruleHint: 'The para referentes definidos; a/an indefinidos.',
    ruleExplain: 'The se usa cuando el oyente puede identificar el referente (ya mencionado, único en contexto, o conocido).',
    options: ['A', 'An', 'The', '∅ (ninguno)', 'Some', 'Any', 'This only', 'Those'],
    correctIndex: 2,
    explanation: 'Si es definida/conocida en el discurso: the university.',
  },
  {
    prompt: 'Negación correcta en inglés estándar:',
    ruleHint: 'Un solo negativo de polaridad; do-support.',
    ruleExplain: 'El inglés estándar evita la doble negación de polaridad. Don’t + anything (no don’t + nothing).',
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
    options: ['femenino', 'masculino', 'neutro', 'variable', 'plural', 'epiceno solo', 'invariable', 'dual'],
    correctIndex: 1,
    explanation: 'Un problème es masculino pese a terminar en -e.',
  },
  {
    prompt: 'Artículo: “____ eau est froide.”',
    ruleHint: 'Elisión ante vocal: le/la → l’.',
    ruleExplain: 'Ante vocal o h muda, le/la se eliden en l’. Eau empieza por vocal: l’eau.',
    options: ['La', 'Le', 'L’', 'Les', 'Un', 'Une', 'De', 'Du'],
    correctIndex: 2,
    explanation: 'Eau empieza por vocal: l’eau (elisión de la).',
  },
  {
    prompt: 'Negación formal completa:',
    ruleHint: 'ne … pas alrededor del verbo conjugado.',
    ruleExplain: 'La negación clásica enmarca el verbo: ne + verbo + pas. En oral informal a menudo se omite ne.',
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
    options: ['ha', 'wa', 'ba', 'pa', 'a', 'ho', 'wo', 'ga'],
    correctIndex: 1,
    explanation: 'La partícula tema は se pronuncia “wa”, no “ha”.',
  },
  {
    prompt: 'Orden típico japonés:',
    ruleHint: 'Lengua SOV.',
    ruleExplain: 'El japonés coloca el verbo al final. Sujeto y objeto van antes, marcados por partículas.',
    options: ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS', 'libre total', 'V primero siempre'],
    correctIndex: 1,
    explanation: 'El japonés es predominantemente SOV: sujeto-objeto-verbo.',
  },
  {
    prompt: 'Partícula de objeto directo habitual:',
    ruleHint: 'Marcas de caso por partículas.',
    ruleExplain: 'を (o) marca el objeto directo del verbo transitivo. が marca sujeto/foco; は marca tema.',
    options: ['は', 'が', 'を', 'に', 'で', 'の', 'と', 'も'],
    correctIndex: 2,
    explanation: 'を (o) marca el objeto directo: 本を読む.',
  },
  {
    prompt: '¿Qué silabario se usa típicamente para préstamos extranjeros?',
    ruleHint: 'Tres sistemas de escritura.',
    ruleExplain: 'Katakana se usa de forma característica para gairaigo (préstamos), onomatopeyas y énfasis.',
    options: ['hiragana', 'katakana', 'kanji solo', 'romaji solo', 'man’yōgana', 'hangul', 'latin', 'cuneiforme'],
    correctIndex: 1,
    explanation: 'Katakana se usa de forma característica para gairaigo (préstamos).',
  },
  {
    prompt: 'Forma cortés de 食べる (taberu):',
    ruleHint: 'Masu-form para cortesía neutra.',
    ruleExplain: 'La forma -masu es la cortesía estándar en situaciones neutrales/formales. 食べます tabemasu.',
    options: ['たべる', 'たべます', 'たべた', 'たべて', 'たべない', 'たべろ', 'たべよう', 'たべられる'],
    correctIndex: 1,
    explanation: 'Verbos en -masu (たべます) son la cortesía estándar.',
  },
  {
    prompt: 'Pasado cortés de 行く (iku):',
    ruleHint: 'Pasado en -mashita.',
    ruleExplain: 'La forma cortés de pasado se forma con -mashita. 行きます → 行きました.',
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
    options: ['个 gè', '本 běn', '只 zhī', '条 tiáo', '张 zhāng', '件 jiàn', '位 wèi', '头 tóu'],
    correctIndex: 1,
    explanation: 'Los libros usan 本: 一本书 yī běn shū.',
  },
  {
    prompt: 'Negación de acciones habituales / futuro: se usa…',
    ruleHint: '不 vs 没.',
    ruleExplain: '不 bù niega presente habitual, futuro y adjetivos. 没 méi niega pasado perfectivo y posesión.',
    options: ['没 méi', '不 bù', '别 bié solo', '无 wú', '否', '非', '无有', '未'],
    correctIndex: 1,
    explanation: '不 niega presente/habitual/futuro; 没 niega pasado o posesión.',
  },
  {
    prompt: 'Orden básico del mandarín:',
    ruleHint: 'Lengua SVO analítica.',
    ruleExplain: 'El mandarín es SVO. No hay flexión de persona/tiempo en el verbo; el aspecto y el tiempo se marcan con partículas y adverbios.',
    options: ['SOV', 'SVO', 'VSO', 'VOS', 'OSV', 'libre', 'OVS', 'V final siempre'],
    correctIndex: 1,
    explanation: 'Mandarín es SVO: 我吃饭 wǒ chī fàn.',
  },
  {
    prompt: '¿Cuántos tonos principales tiene el mandarín estándar (sin el neutro)?',
    ruleHint: 'Sistema tonal.',
    ruleExplain: 'Cuatro tonos léxicos (alto, ascendente, descendente-ascendente, descendente) más el tono neutro.',
    options: ['2', '3', '4', '5', '6', '1', '8', '7'],
    correctIndex: 2,
    explanation: 'Cuatro tonos léxicos principales, más el tono neutro.',
  },
  {
    prompt: '因为 (yīnwèi) introduce la causa. ¿Qué suele introducir la consecuencia?',
    ruleHint: 'Correlación causal.',
    ruleExplain: 'Estructura frecuente: 因为 … 所以 … (porque … por eso …).',
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
    options: ['-mente', '-ção / -são', '-íssimo', '-inho', '-dor solo', '-ar', '-vel sin más', '-ção nunca'],
    correctIndex: 1,
    explanation: '-ção/-são forma sustantivos abstractos: nação, decisão.',
  },
  {
    prompt: 'Pret. perfeito vs imperfeito: “Ontem ____ (falar) com ela uma vez.”',
    ruleHint: 'Acción cerrada en el pasado → pretérito perfeito.',
    ruleExplain: 'Pretérito perfeito: acciones terminadas y puntuales. Imperfeito: hábito, descripción, marco.',
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
    options: ['solo genitivo', 'nominativo o acusativo neutro', 'solo dativo', 'femenino', 'plural dativo', 'vocativo', 'ablativo', 'instrumental'],
    correctIndex: 1,
    explanation: 'das Haus: neutro nominativo o acusativo.',
  },
  {
    prompt: 'El sufijo “-ung” en “Bildung”, “Bedeutung” forma…',
    ruleHint: 'Morfología derivativa.',
    ruleExplain: '-ung forma sustantivos femeninos abstractos a partir de verbos (bilden → Bildung).',
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
export const TOTAL_LEVELS = 200

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
  const difficulty = (clamp(1 + Math.floor((L - 1) / 40), 1, 5) as 1 | 2 | 3 | 4 | 5)

  const modeCycle: GameMode[] = [
    'translate_to_es',
    'translate_from_es',
    'grammar_deduce',
    'cognate_logic',
    'particle_or_order',
    'false_friends',
    'morphology',
    'reading_comprehension',
  ]

  let mode: GameMode =
    preferredMode && preferredMode !== 'auto'
      ? preferredMode
      : modeCycle[(L - 1) % modeCycle.length]

  // Reading levels: force reading when available and mode matches or every 8th
  if (mode === 'reading_comprehension' && reading.length > 0) {
    const r = reading[(L - 1) % reading.length]
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
      options: r.options,
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      difficulty,
    }
  }

  // Grammar / particle / morphology / false friends from grammar bank
  if (
    (mode === 'grammar_deduce' ||
      mode === 'particle_or_order' ||
      mode === 'morphology' ||
      mode === 'false_friends') &&
    grammar.length > 0
  ) {
    const g = grammar[(L - 1) % grammar.length]
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
      options: g.options,
      correctIndex: g.correctIndex,
      explanation: g.explanation,
      difficulty,
    }
  }

  // Lexical / translation / cognate
  if (!lex.length) {
    return {
      id: `${lang}-fallback-${L}`,
      lang,
      mode: 'translate_to_es',
      level: L,
      cefr,
      prompt: 'Nivel de refuerzo: elige la opción coherente con la deducción lingüística.',
      ruleHint: 'Aplica la regla del idioma activo.',
      ruleExplain: 'Usa el panel de reglas del idioma y elimina opciones imposibles.',
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
      cefr,
      prompt: `¿Qué significa en español: 「${item.target}」?`,
      ruleHint: item.rule || 'Deduce por cognado, contexto o regla del idioma.',
      ruleExplain:
        item.note +
        ' Busca raíces compartidas, género/número y evita traducir palabra por palabra sin contexto.',
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
    mode: mode === 'translate_from_es' ? 'translate_from_es' : 'translate_from_es',
    level: L,
    cefr,
    prompt: `¿Cómo se dice en ${LANG_PROFILES[lang].name}: 「${item.es}」?`,
    ruleHint: item.rule || 'Aplica correspondencia léxica y evita false friends.',
    ruleExplain:
      item.note +
      ' Recuerda artículos, género y formas irregulares típicas del idioma.',
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
      const q = generateQuestion(id, lang, preferredMode)
      setLevelId(id)
      const nextCurrent = { ...currentMap, [lang]: id }
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
    [lang, preferredMode, currentMap]
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
                  <strong>Progresión CEFR:</strong> Niveles 1–20 A1 · 21–40 A2 · 41–80 B1 · 81–120
                  B2 · 121–160 C1 · 161+ C2 (por idioma).
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
            {TOTAL_LEVELS}
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
            const done = (scores[`${lang}:${n}`] ?? 0) > 0
            const cefr = levelToCefr(n)
            return (
              <button
                key={n}
                type="button"
                className={`id-level-cell ${locked ? 'locked' : ''} ${n === currentLevel ? 'current' : ''} ${done ? 'done' : ''}`}
                disabled={locked}
                onClick={() => !locked && startLevel(n)}
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
                ? 'Subes de nivel (si era el máximo desbloqueado)'
                : 'No subes de nivel · reintenta'}
            </p>
          </div>
        </header>
        <div className={`id-result-banner ${correct ? 'ok' : 'bad'}`}>
          {correct ? '✓ Bien razonado' : '✗ Sigue la regla y prueba de nuevo'}
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
          <h3>Explicación</h3>
          <p className="id-explain">{question.explanation}</p>
          <p className="id-rule-explain">
            <strong>Regla:</strong> {question.ruleHint}
          </p>
          <p className="id-rule-explain">{question.ruleExplain}</p>
          <p className="id-meta">
            Respuesta correcta:{' '}
            <strong>
              {String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}
            </strong>
          </p>
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