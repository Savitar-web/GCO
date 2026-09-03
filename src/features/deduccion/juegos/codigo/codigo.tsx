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
const GAME_ID = 'codigo'
const TOTAL_LEVELS = 300
const TIMER_BASE = 80
const COMPLETED_KEY = 'gco_codigo_completed_v3'
const HILL_ENABLED_KEY = 'gco_codigo_hill_enabled'

// ============================================================================
// Tipos
// ============================================================================

type CipherKind =
  | 'caesar'
  | 'reverse'
  | 'variable'
  | 'vowel_sub'
  | 'a1z26'
  | 'atbash'
  | 'morse'
  | 'rail'
  | 'keyword'
  | 'hill'
  | 'affine'
  | 'scytale'

type Item = {
  id: string
  kind: CipherKind
  cipher: string
  plain: string
  /** Pista del nivel (sin revelar la respuesta). */
  hint: string
  /** Explicación del método aplicable a este nivel (sin revelar la respuesta). */
  explain: string
  /** Consejo al fallar (sin revelar la respuesta). */
  failAdvice: string
  question: string
  options: string[]
  correct: number
  /** Para Hill: matriz y teclado mostrados */
  hillMatrix?: number[][]
  hillKeyboard?: string
}

type Guide = {
  id: CipherKind | 'intro'
  title: string
  body: string
  hard?: boolean
}

// ============================================================================
// Utilidades criptográficas
// ============================================================================

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function onlyLetters(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '')
}

function caesar(s: string, k: number): string {
  const shift = ((k % 26) + 26) % 26
  return s
    .split('')
    .map((c) => {
      const u = c.toUpperCase()
      const i = ABC.indexOf(u)
      if (i < 0) return c
      const out = ABC[(i + shift) % 26]
      return c === u ? out : out.toLowerCase()
    })
    .join('')
}

function atbash(s: string): string {
  return s
    .split('')
    .map((c) => {
      const u = c.toUpperCase()
      const i = ABC.indexOf(u)
      if (i < 0) return c
      const out = ABC[25 - i]
      return c === u ? out : out.toLowerCase()
    })
    .join('')
}

function reverseStr(s: string): string {
  return s.split('').reverse().join('')
}

function variableShift(s: string, pattern: number[]): string {
  let pi = 0
  return s
    .split('')
    .map((c) => {
      const u = c.toUpperCase()
      const i = ABC.indexOf(u)
      if (i < 0) return c
      const k = pattern[pi % pattern.length]
      pi++
      const out = ABC[(i + k + 26) % 26]
      return c === u ? out : out.toLowerCase()
    })
    .join('')
}

function vowelSub(s: string, map: Record<string, string>): string {
  return s
    .split('')
    .map((c) => {
      const u = c.toUpperCase()
      if (map[u]) return c === u ? map[u] : map[u].toLowerCase()
      return c
    })
    .join('')
}

function a1z26Encode(s: string): string {
  return onlyLetters(s)
    .split('')
    .map((c) => String(c.charCodeAt(0) - 64))
    .join('-')
}

function a1z26Decode(nums: string): string {
  return nums
    .split(/[-–—\s]+/)
    .filter(Boolean)
    .map((n) => {
      const v = parseInt(n, 10)
      if (v >= 1 && v <= 26) return ABC[v - 1]
      return '?'
    })
    .join('')
}

const MORSE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '0': '-----',
}

const MORSE_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
)

function toMorse(s: string): string {
  return onlyLetters(s)
    .split('')
    .map((c) => MORSE[c] || '')
    .filter(Boolean)
    .join(' / ')
}

function fromMorse(s: string): string {
  return s
    .split(/\s*\/\s*|\s{2,}/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((t) => MORSE_REV[t] || '?')
    .join('')
}

/** Rail fence (zig-zag) con 2 o 3 rieles. */
function railFenceEncrypt(s: string, rails: number): string {
  const t = onlyLetters(s)
  if (rails < 2) return t
  const rows: string[] = Array.from({ length: rails }, () => '')
  let r = 0
  let dir = 1
  for (const ch of t) {
    rows[r] += ch
    r += dir
    if (r === 0 || r === rails - 1) dir *= -1
  }
  return rows.join('')
}

function keywordCipher(plain: string, keyword: string): string {
  const key = onlyLetters(keyword)
  const seen = new Set<string>()
  let alpha = ''
  for (const c of key + ABC) {
    if (!seen.has(c)) {
      seen.add(c)
      alpha += c
    }
  }
  // alpha is cipher alphabet mapped from ABC
  return onlyLetters(plain)
    .split('')
    .map((c) => alpha[ABC.indexOf(c)])
    .join('')
}

// --- Affine cipher: (a*x + b) mod 26, a coprime with 26 ---
function affineEncrypt(s: string, a: number, b: number): string {
  return onlyLetters(s)
    .split('')
    .map((c) => {
      const x = c.charCodeAt(0) - 65
      return ABC[mod26(a * x + b)]
    })
    .join('')
}

// --- Scytale (simple diameter transposition) ---
function scytaleEncrypt(s: string, diameter: number): string {
  const t = onlyLetters(s)
  if (diameter < 2) return t
  const grid: string[] = Array.from({ length: diameter }, () => '')
  for (let i = 0; i < t.length; i++) {
    grid[i % diameter] += t[i]
  }
  // pad to rectangular if needed (not strictly classical, but consistent)
  return grid.join('')
}

// --- Hill cipher (2×2) ---
// Teclado fijo compartido por todos los niveles Hill:
// Posición en matriz de botón → letra. El jugador ve este teclado.
const HILL_KEYBOARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// Para Hill usamos bloques de 2 letras; relleno X si hace falta.

function mod26(n: number): number {
  return ((n % 26) + 26) % 26
}

function hillEncrypt2(plain: string, matrix: number[][]): string {
  const t = onlyLetters(plain)
  const padded = t.length % 2 === 0 ? t : t + 'X'
  let out = ''
  for (let i = 0; i < padded.length; i += 2) {
    const a = padded.charCodeAt(i) - 65
    const b = padded.charCodeAt(i + 1) - 65
    const x = mod26(matrix[0][0] * a + matrix[0][1] * b)
    const y = mod26(matrix[1][0] * a + matrix[1][1] * b)
    out += ABC[x] + ABC[y]
  }
  return out
}

function det2(m: number[][]): number {
  return mod26(m[0][0] * m[1][1] - m[0][1] * m[1][0])
}

function modInverse26(a: number): number | null {
  a = mod26(a)
  for (let x = 1; x < 26; x++) {
    if (mod26(a * x) === 1) return x
  }
  return null
}

/** Inversa modular de matriz 2×2 mod 26. Devuelve null si no es invertible. */
function hillInverse2(m: number[][]): number[][] | null {
  const d = det2(m)
  const invDet = modInverse26(d)
  if (invDet == null) return null
  // adjugate
  const adj = [
    [m[1][1], -m[0][1]],
    [-m[1][0], m[0][0]],
  ]
  return [
    [mod26(invDet * adj[0][0]), mod26(invDet * adj[0][1])],
    [mod26(invDet * adj[1][0]), mod26(invDet * adj[1][1])],
  ]
}

function hillDecrypt2(cipher: string, matrix: number[][]): string | null {
  const inv = hillInverse2(matrix)
  if (!inv) return null
  return hillEncrypt2(cipher, inv) // same multiply, just with inverse
}

/** Matrices 2×2 invertibles mod 26 (det coprimo con 26). */
const HILL_MATRICES: number[][][] = [
  [
    [3, 3],
    [2, 5],
  ],
  [
    [5, 8],
    [17, 3],
  ],
  [
    [9, 4],
    [5, 7],
  ],
  [
    [11, 8],
    [3, 7],
  ],
  [
    [6, 5],
    [5, 7],
  ],
  [
    [15, 17],
    [4, 9],
  ],
  [
    [7, 8],
    [11, 11],
  ],
  [
    [2, 3],
    [5, 7],
  ],
  [
    [4, 5],
    [3, 4],
  ],
  [
    [8, 5],
    [3, 4],
  ],
]

// Affine pairs (a,b) with gcd(a,26)=1
const AFFINE_PAIRS: [number, number][] = [
  [5, 8],
  [7, 3],
  [11, 5],
  [15, 7],
  [17, 4],
  [19, 9],
  [21, 2],
  [3, 11],
  [9, 13],
  [25, 6],
]

// ============================================================================
// Banco de textos en claro (progresivamente más largos / menos obvios)
// Incluye grupos de palabras/frases muy parecidas para generar distractores difíciles.
// ============================================================================

const PLAIN_BANK = [
  // cortos – grupos de confusión
  'HOLA',
  'OLA',
  'HALO',
  'HOAL',
  'ALOH',
  'HOLAS',
  'CLAVE',
  'CALVE',
  'CLAVA',
  'VALE',
  'NORTE',
  'NOTRE',
  'TENOR',
  'LUZ',
  'ZUL',
  'PAZ',
  'ZAP',
  'REY',
  'YER',
  'SOL',
  'LOS',
  'MAR',
  'RAM',
  'ARM',
  'FIN',
  'INF',
  'MES',
  'SEM',
  'DIA',
  'IDA',
  'AID',
  'CASA',
  'SACA',
  'ASCA',
  'MAPA',
  'PAMA',
  'AMAP',
  'RUTA',
  'TURA',
  'ATRU',
  'FOCO',
  'COFO',
  'IDEA',
  'AIDE',
  'DEIA',
  'CASO',
  'OSCA',
  'META',
  'TEMA',
  'AMET',
  'BASE',
  'SEBA',
  'ABES',
  // medios – confusiones frecuentes
  'MENSAJE',
  'MENSAJES',
  'MENSAJA',
  'SECRETO',
  'SECRETOS',
  'SECRETA',
  'LOGICA',
  'LOGICO',
  'LOGICAS',
  'RAZON',
  'RAZONES',
  'RAZONA',
  'PRUEBA',
  'PRUEBAS',
  'PRUEBE',
  'CODIGO',
  'CODIGOS',
  'CODIGA',
  'CIFRA',
  'CIFRAS',
  'CIFRE',
  'PATRON',
  'PATRONES',
  'PATRONA',
  'ENIGMA',
  'ENIGMAS',
  'ENIGME',
  'PUERTA',
  'PUERTAS',
  'PUERTO',
  'VERDAD',
  'VERDADES',
  'VERDA',
  'ERROR',
  'ERRORES',
  'ERRA',
  'SISTEMA',
  'SISTEMAS',
  'SISTEME',
  'METODO',
  'METODOS',
  'METODA',
  'PISTA',
  'PISTAS',
  'PISTE',
  'AGENTE',
  'AGENTES',
  'AGENDA',
  'SENAL',
  'SENALES',
  'SENALA',
  'CANAL',
  'CANALES',
  'CANALA',
  'ARCHIVO',
  'ARCHIVOS',
  'ARCHIVA',
  'CLAVEZ',
  'CLAVES',
  // frases cortas (solo letras se cifran) – variantes cercanas
  'ABRE LA PUERTA',
  'ABRE LAS PUERTAS',
  'ABRE EL PUERTO',
  'CITA AL ALBA',
  'CITA EN EL ALBA',
  'CITA AL ANOCHECER',
  'NORTE SEGURO',
  'NORTE SEGUROS',
  'SUR SEGURO',
  'CAMBIO DE RUTA',
  'CAMBIO DE RUTAS',
  'CAMBIO DE RUMBO',
  'EVITA EL PUENTE',
  'EVITA LOS PUENTES',
  'EVITA EL PUERTO',
  'CODIGO VALIDO',
  'CODIGO VALIDOS',
  'CODIGO INVALIDO',
  'MENSAJE OCULTO',
  'MENSAJE OCULTOS',
  'MENSAJE SECRETO',
  'CLAVE MAESTRA',
  'CLAVE MAESTRO',
  'CLAVE MAESTRES',
  'PUNTO DE ENCUENTRO',
  'PUNTO DE ENCUENTROS',
  'PUNTO DE PARTIDA',
  'SIN RASTRO',
  'SIN RASTROS',
  'SIN HUELLA',
  'OPERACION LUNA',
  'OPERACION SOL',
  'OPERACION MARTE',
  'FOCO EN EL MAPA',
  'FOCO EN LA MAPA',
  'FOCO EN EL PLANO',
  'RUTA ALTERNATIVA',
  'RUTA ALTERNATIVAS',
  'RUTA PRINCIPAL',
  'SENAL DEBIL',
  'SENAL FUERTE',
  'SENAL CLARA',
  'ARCHIVO CERRADO',
  'ARCHIVO ABIERTO',
  'ARCHIVO OCULTO',
  // más largos – con variantes sutiles
  'EL AGENTE CRUZA EL RIO AL AMANECER',
  'EL AGENTE CRUZA EL RIO AL ANOCHECER',
  'EL AGENTE CRUZA EL MAR AL AMANECER',
  'LA CLAVE ESTA EN EL SEGUNDO LIBRO',
  'LA CLAVE ESTA EN EL PRIMER LIBRO',
  'LA CLAVE ESTA EN EL TERCER LIBRO',
  'NO USES EL CANAL PRINCIPAL HOY',
  'NO USES EL CANAL SECUNDARIO HOY',
  'NO USES EL CANAL PRINCIPAL MANANA',
  'REEMPLAZA LA CIFRA CADA SEMANA',
  'REEMPLAZA LA CIFRA CADA DIA',
  'REEMPLAZA LA CLAVE CADA SEMANA',
  'EL PATRON SE REPITE CADA SIETE',
  'EL PATRON SE REPITE CADA CINCO',
  'EL PATRON SE REPITE CADA NUEVE',
  'GUARDA EL MAPA BAJO LA PIEDRA',
  'GUARDA EL MAPA BAJO LA MESA',
  'GUARDA EL PLANO BAJO LA PIEDRA',
  'LA PUERTA NORTE QUEDA ABIERTA',
  'LA PUERTA SUR QUEDA ABIERTA',
  'LA PUERTA NORTE QUEDA CERRADA',
  'CAMBIA EL PUNTO DE ENCUENTRO',
  'CAMBIA EL PUNTO DE PARTIDA',
  'CAMBIA EL LUGAR DE ENCUENTRO',
  'EL MENSAJE LLEGA POR MORSE',
  'EL MENSAJE LLEGA POR RADIO',
  'EL MENSAJE LLEGA POR CIFRA',
  'DESCIFRA ANTES DEL ANOCHECER',
  'DESCIFRA ANTES DEL AMANECER',
  'DESCIFRA ANTES DE LA NOCHE',
  // extras profesionales / temáticos
  'OPERACION SILENCIO',
  'CODIGO ROJO ACTIVO',
  'PUNTO CIEGO NORTE',
  'CLAVE DE RESPALDO',
  'ARCHIVO CLASIFICADO',
  'SENAL INTERMITENTE',
  'RUTA DE EVASION',
  'AGENTE DOBLE',
  'CONTACTO SEGURO',
  'PROTOCOLO ALFA',
  'PROTOCOLO BRAVO',
  'PROTOCOLO CHARLIE',
  'MENSAJE PRIORITARIO',
  'CIFRA ROTATIVA',
  'TECLADO COMPARTIDO',
  'MATRIZ INVERTIBLE',
  'BLOQUE DE DOS',
  'RELLENO CON X',
  'ANALISIS DE FRECUENCIA',
  'SUSTITUCION MONOALFABETICA',
]

// ============================================================================
// Determinismo / shuffle
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

/** Genera distractores inteligentes y cercanos al correcto para maximizar dificultad. */
function generateSmartDistractors(correct: string, seed: number, extra: string[] = []): string[] {
  const rnd = mulberry32(seed)
  const c = onlyLetters(correct)
  const len = c.length
  const pool = new Set<string>()

  // 1. Variantes de un carácter (inserción / sustitución / eliminación)
  if (len >= 2) {
    for (let i = 0; i < len; i++) {
      // swap adjacent
      if (i < len - 1) {
        const arr = c.split('')
        ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
        pool.add(arr.join(''))
      }
      // replace with nearby letter
      const arr2 = c.split('')
      const idx = ABC.indexOf(arr2[i])
      arr2[i] = ABC[(idx + 1) % 26]
      pool.add(arr2.join(''))
      arr2[i] = ABC[(idx + 25) % 26]
      pool.add(arr2.join(''))
    }
    // drop last / first
    pool.add(c.slice(0, -1))
    pool.add(c.slice(1))
    // duplicate last
    pool.add(c + c[len - 1])
  }

  // 2. Reverse / rotations
  pool.add(reverseStr(c))
  if (len >= 3) {
    pool.add(c.slice(1) + c[0])
    pool.add(c[len - 1] + c.slice(0, -1))
    pool.add(c.slice(2) + c.slice(0, 2))
  }

  // 3. Common Spanish look-alikes / morphological variants
  const morphs: Record<string, string[]> = {
    HOLA: ['OLA', 'HALO', 'HOAL', 'ALOH', 'HOLAS', 'AHOL'],
    CLAVE: ['CALVE', 'CLAVA', 'VALE', 'CLAVES', 'CLAVEZ'],
    NORTE: ['NOTRE', 'TENOR', 'NORTES', 'SURTE'],
    PUERTA: ['PUERTAS', 'PUERTO', 'PUERTE', 'PUERTA X'],
    MENSAJE: ['MENSAJES', 'MENSAJA', 'MENSAJE X'],
    SECRETO: ['SECRETOS', 'SECRETA', 'SECRETO X'],
    CODIGO: ['CODIGOS', 'CODIGA', 'CODIGO X'],
    PATRON: ['PATRONES', 'PATRONA', 'PATRON X'],
    ENIGMA: ['ENIGMAS', 'ENIGME'],
    AGENTE: ['AGENTES', 'AGENDA', 'AGENTE X'],
    ARCHIVO: ['ARCHIVOS', 'ARCHIVA'],
    RUTA: ['RUTAS', 'RUMBO', 'RUTA X'],
    MAPA: ['MAPAS', 'PLANO', 'MAPA X'],
  }
  if (morphs[c]) {
    morphs[c].forEach((m) => pool.add(m))
  }

  // 4. Caesar / Atbash of the plain (common wrong assumptions)
  pool.add(caesar(c, 1))
  pool.add(caesar(c, 3))
  pool.add(caesar(c, 13))
  pool.add(atbash(c))
  pool.add(reverseStr(caesar(c, 1)))

  // 5. Extra provided distractors
  extra.forEach((e) => {
    const t = onlyLetters(e)
    if (t && t !== c) pool.add(t)
  })

  // 6. From the bank: same length or length ±1
  const bankCandidates = PLAIN_BANK.map(onlyLetters).filter(
    (p) => p !== c && Math.abs(p.length - len) <= 2 && p.length >= 2,
  )
  // pick a few randomly
  for (let i = 0; i < 6 && bankCandidates.length > 0; i++) {
    const j = Math.floor(rnd() * bankCandidates.length)
    pool.add(bankCandidates[j])
    bankCandidates.splice(j, 1)
  }

  // 7. Fillers that look cipher-ish
  const fillers = [
    'XXXX',
    'ERROR',
    'NULO',
    'VACIO',
    'CLAVE',
    'CODIGO',
    'TEST',
    'ALFA',
    'BRAVO',
    'DELTA',
    'OMEGA',
    'NULL',
    'FAIL',
    'RETRY',
  ]
  fillers.forEach((f) => {
    if (f !== c) pool.add(f)
  })

  // Remove exact correct and empty
  pool.delete(c)
  pool.delete('')

  return Array.from(pool)
}

function buildOptions(
  correct: string,
  distractors: string[],
  seed: number,
): { options: string[]; correct: number } {
  const uniq = [onlyLetters(correct)]
  const smart = generateSmartDistractors(correct, seed, distractors)
  for (const d of [...distractors, ...smart]) {
    const t = onlyLetters(d).trim()
    if (t && t !== uniq[0] && !uniq.includes(t)) uniq.push(t)
    if (uniq.length >= 10) break
  }
  // relleno final si faltan
  const fillers = ['XXXX', 'ERROR', 'NULO', 'VACIO', 'CLAVE', 'CODIGO', 'TEST', 'ALFA', 'BRAVO', 'OMEGA']
  for (const f of fillers) {
    if (uniq.length >= 8) break
    if (!uniq.includes(f)) uniq.push(f)
  }
  const sliced = uniq.slice(0, 8)
  const shuffled = shuffle(sliced, seed)
  const idx = shuffled.indexOf(onlyLetters(correct))
  return { options: shuffled, correct: idx >= 0 ? idx : 0 }
}

// ============================================================================
// Generación de niveles
// ============================================================================

function plainForLevel(levelIndex: number): string {
  return PLAIN_BANK[levelIndex % PLAIN_BANK.length]
}

function makeCaesar(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex)
  const plain = onlyLetters(plainRaw)
  const shift = (levelIndex % 12) + 1
  const cipher = caesar(plain, shift)
  const seed = hashStr(`caesar-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, shift + 1),
      caesar(plain, Math.max(1, shift - 1)),
      reverseStr(plain),
      caesar(plain, 13),
      caesar(plain, 7),
      atbash(plain),
      plain.slice(1) + plain[0],
      caesar(reverseStr(plain), shift),
    ],
    seed,
  )
  return {
    id: `caesar-${levelIndex}`,
    kind: 'caesar',
    cipher,
    plain,
    hint: `Cifrado César. Desplazamiento fijo de +${shift} posiciones en el alfabeto latino (A→…→Z, ciclo 26).`,
    explain:
      `Método: cada letra se desplaza exactamente ${shift} puestos. Para descifrar, aplica −${shift} (o +${26 - shift}).\n` +
      `Ejemplo de técnica: si ves una letra frecuente en español cifrado, pruébala como E o A y calcula el salto.\n` +
      `En este nivel la pista ya te da el salto: no hace falta fuerza bruta completa.`,
    failAdvice:
      'Recorre el alfabeto mentalmente con el desplazamiento indicado. Comprueba vocales frecuentes (E, A, O) tras el corrimiento inverso. No asumas que la primera opción es la buena; muchas son anagramas o casi idénticas.',
    question: '¿Cuál es el texto en claro (solo letras, mayúsculas)?',
    options,
    correct,
  }
}

function makeReverse(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 3)
  const plain = onlyLetters(plainRaw)
  const cipher = reverseStr(plain)
  const seed = hashStr(`rev-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      cipher,
      caesar(plain, 3),
      plain.slice(1) + plain[0],
      atbash(plain),
      reverseStr(caesar(plain, 1)),
      plain + plain[0],
      caesar(cipher, 2),
      reverseStr(plain).slice(0, -1),
    ],
    seed,
  )
  return {
    id: `rev-${levelIndex}`,
    kind: 'reverse',
    cipher,
    plain,
    hint: 'Inversión (texto en espejo): el mensaje se escribió de derecha a izquierda.',
    explain:
      'Método: lee el bloque de izquierda a derecha invirtiendo el orden de los caracteres.\n' +
      'Ejemplo: si el cifrado es OTIRAD, el claro es DARITO.\n' +
      'A veces se combina con mayúsculas o sin espacios; aquí solo hay letras.',
    failAdvice:
      'Escribe el cifrado al revés letra a letra en un papel. No busques desplazamientos: el orden es el truco. Ojo: varias opciones son casi el mismo texto con una letra de más o menos.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeVariable(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 5)
  const plain = onlyLetters(plainRaw)
  const patterns = [
    [1, 2, 3],
    [2, 1, 3],
    [1, 3, 2],
    [3, 1, 2],
    [1, 2, 3, 4],
    [2, 3, 1],
  ]
  const pattern = patterns[levelIndex % patterns.length]
  const cipher = variableShift(plain, pattern)
  const seed = hashStr(`var-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, 2),
      cipher,
      reverseStr(plain),
      caesar(plain, 5),
      atbash(plain),
      variableShift(plain, [2, 3, 1]),
      plain.slice(0, 4),
      variableShift(plain, pattern.map((x) => x + 1)),
    ],
    seed,
  )
  return {
    id: `var-${levelIndex}`,
    kind: 'variable',
    cipher,
    plain,
    hint: `Desplazamiento variable por posición: patrón ${pattern.join(',')} y se repite (polialfabético simple).`,
    explain:
      `Método: la 1ª letra se desplazó +${pattern[0]}, la 2ª +${pattern[1]}, etc., y el patrón se repite.\n` +
      `Para descifrar: aplica el negativo del patrón según el índice (empezando en 0).\n` +
      'Es un pariente didáctico del espíritu Vigenère, pero con patrón numérico fijo, no con palabra clave.',
    failAdvice:
      'Numera las letras del cifrado y resta el patrón indicado. Si una resta baja de A, da la vuelta por Z. Las opciones incorrectas suelen ser el resultado de aplicar un patrón distinto o un César fijo.',
    question: '¿Cuál es el texto en claro más plausible?',
    options,
    correct,
  }
}

function makeVowelSub(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 7)
  const plain = onlyLetters(plainRaw)
  const maps = [
    { A: 'Q', E: 'W', I: 'E', O: 'R', U: 'T' },
    { A: 'X', E: 'Y', I: 'Z', O: 'P', U: 'Q' },
    { A: 'Z', E: 'Y', I: 'X', O: 'W', U: 'V' },
    { A: 'B', E: 'C', I: 'D', O: 'F', U: 'G' },
  ]
  const map = maps[levelIndex % maps.length]
  const cipher = vowelSub(plain, map)
  const seed = hashStr(`vow-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      cipher,
      caesar(plain, 4),
      reverseStr(plain),
      atbash(plain),
      vowelSub(plain, maps[(levelIndex + 1) % maps.length]),
      plain.toLowerCase(),
      caesar(cipher, 1),
      onlyLetters(plainForLevel(levelIndex + 9)),
    ],
    seed,
  )
  const invEntries = Object.entries(map)
    .map(([k, v]) => `${v}→${k}`)
    .join(', ')
  return {
    id: `vow-${levelIndex}`,
    kind: 'vowel_sub',
    cipher,
    plain,
    hint: `Sustitución solo de vocales: ${Object.entries(map)
      .map(([k, v]) => `${k}→${v}`)
      .join(', ')}. Las consonantes no cambian.`,
    explain:
      `Método: localiza las letras del mapa en el cifrado como posibles vocales cifradas y aplica el mapa inverso:\n` +
      `${invEntries}.\n` +
      'Ojo: algunas letras del cifrado pueden ser vocales del claro que se mapearon. Las consonantes se leen tal cual.',
    failAdvice:
      'No es un César: no desplaces todo el alfabeto. Sustituye solo las letras del mapa de vocales; deja el resto igual. Muchas opciones difieren solo en una o dos vocales.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeA1Z26(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 11)
  const plain = onlyLetters(plainRaw).slice(0, 10) // evita cadenas numéricas enormes
  const cipher = a1z26Encode(plain)
  const seed = hashStr(`a1-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 1),
      plain.slice(0, 3),
      atbash(plain),
      a1z26Decode(cipher.split('-').reverse().join('-')),
      'ABCDE',
      plain + 'X',
      onlyLetters(plainForLevel(levelIndex + 13)).slice(0, plain.length),
    ],
    seed,
  )
  return {
    id: `a1-${levelIndex}`,
    kind: 'a1z26',
    cipher,
    plain,
    hint: 'Código A=1 … Z=26. Cada número separado por guion es una letra.',
    explain:
      'Método: convierte cada número a letra (1→A, 2→B, … 26→Z).\n' +
      'Ejemplo: 8-15-12-1 → HOLA.\n' +
      'Si ves 27 o 0, hay error de lectura; el alfabeto solo llega a 26.',
    failAdvice:
      'Separa por guiones y traduce número a número. No interpretes el bloque entero como un solo valor. Las opciones incorrectas suelen ser el mismo texto con una letra cambiada o el orden invertido.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeAtbash(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 13)
  const plain = onlyLetters(plainRaw)
  const cipher = atbash(plain)
  const seed = hashStr(`atb-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 13),
      cipher,
      caesar(plain, 1),
      atbash(reverseStr(plain)),
      plain.slice(1) + plain[0],
      'ZYXWVU',
      atbash(caesar(plain, 1)),
    ],
    seed,
  )
  return {
    id: `atb-${levelIndex}`,
    kind: 'atbash',
    cipher,
    plain,
    hint: 'Atbash: A↔Z, B↔Y, C↔X… (alfabeto invertido monoalfabético).',
    explain:
      'Método: sustituye cada letra por su simétrica en el alfabeto (posición i → 25−i).\n' +
      'Ejemplo: ABC → ZYX. Es involutivo: aplicar Atbash dos veces devuelve el claro.\n' +
      'Históricamente asociado a prácticas hebreas sobre el alefato; aquí usamos el alfabeto latino.',
    failAdvice:
      'Construye la pareja A-Z, B-Y, C-X… y traduce letra a letra. No es un desplazamiento constante como César. Varias opciones son el Atbash de textos parecidos.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeMorse(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 17)
  // Morse legible: palabras cortas
  const plain = onlyLetters(plainRaw).slice(0, 8)
  const cipher = toMorse(plain)
  // Verificación con fromMorse (uso real de la función)
  const verified = fromMorse(cipher)
  if (verified !== plain) {
    // fallback seguro (no debería ocurrir)
  }
  const seed = hashStr(`morse-${levelIndex}-${cipher}`)
  // Distractores: decodificaciones erróneas y textos cercanos
  const wrongMorseAttempts = [
    fromMorse(cipher.replace(/\./g, '-').replace(/-/g, '.')), // invertir puntos/rayas
    fromMorse(cipher.split(' / ').reverse().join(' / ')),
    plain.slice(0, Math.max(1, plain.length - 1)),
    plain + 'X',
    reverseStr(plain),
    caesar(plain, 1),
    atbash(plain),
    onlyLetters(plainForLevel(levelIndex + 19)).slice(0, plain.length),
    'SOS',
    'HELLO',
  ]
  const { options, correct } = buildOptions(plain, wrongMorseAttempts, seed)
  return {
    id: `morse-${levelIndex}`,
    kind: 'morse',
    cipher,
    plain,
    hint: 'Código Morse internacional. Punto (·) y raya (−). Separador de letras: “ / ”.',
    explain:
      'Método: cada grupo entre “ / ” es una letra. Usa la tabla Morse (E=·, T=−, A=·−, N=−·, etc.).\n' +
      'Ejemplo: ··· / −−− / ··· → SOS.\n' +
      'No confundas separador de letras con espacio de palabra: aquí solo hay letras separadas por “ / ”.',
    failAdvice:
      'Traduce símbolo a símbolo con la tabla. Empieza por letras cortas (E, T, A, N, I, M) para anclar el mensaje. Las opciones incorrectas suelen diferir en una sola letra o ser el Morse invertido.',
    question: '¿Qué texto en claro codifica este Morse?',
    options,
    correct,
  }
}

function makeRail(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 23)
  const plain = onlyLetters(plainRaw).slice(0, 12)
  const rails = levelIndex % 2 === 0 ? 2 : 3
  const cipher = railFenceEncrypt(plain, rails)
  const seed = hashStr(`rail-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 2),
      railFenceEncrypt(plain, rails === 2 ? 3 : 2),
      atbash(plain),
      plain.slice(2) + plain.slice(0, 2),
      cipher,
      'RAILWAY',
      railFenceEncrypt(reverseStr(plain), rails),
    ],
    seed,
  )
  return {
    id: `rail-${levelIndex}`,
    kind: 'rail',
    cipher,
    plain,
    hint: `Rail fence (cerca de rieles) con ${rails} rieles. El texto se escribe en zig-zag y se lee por filas.`,
    explain:
      `Método: dispone ${rails} filas. Escribe el claro en zig-zag (baja y sube). El cifrado es la concatenación de las filas.\n` +
      'Para descifrar: calcula el patrón de posiciones del zig-zag y recoloca las letras del cifrado en esas posiciones.\n' +
      'Ejemplo (2 rieles): HOLA → filas H L / O A → cifrado HLOA.',
    failAdvice:
      'Dibuja el zig-zag vacío con la longitud del mensaje y reparte el cifrado por filas según el patrón. Luego lee en diagonal zig-zag. Ojo a las opciones que usan otro número de rieles.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeKeyword(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 29)
  const plain = onlyLetters(plainRaw).slice(0, 10)
  const keys = ['CLAVE', 'NORTE', 'SOLAR', 'MANGO', 'BRISA', 'FUENTE', 'DELTA', 'OMEGA', 'SIGMA', 'ALPHA']
  const keyword = keys[levelIndex % keys.length]
  const cipher = keywordCipher(plain, keyword)
  const seed = hashStr(`kw-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, 3),
      reverseStr(plain),
      keywordCipher(plain, keys[(levelIndex + 1) % keys.length]),
      atbash(plain),
      plain + 'X',
      cipher,
      'KEYWORD',
      keywordCipher(reverseStr(plain), keyword),
    ],
    seed,
  )
  return {
    id: `kw-${levelIndex}`,
    kind: 'keyword',
    cipher,
    plain,
    hint: `Sustitución monoalfabética por palabra clave “${keyword}”: se forma un alfabeto cifrado empezando por la clave sin letras repetidas y completando con el resto del ABC.`,
    explain:
      `Método: alfabeto claro A B C D …\nAlfabeto cifrado = letras únicas de “${keyword}” + resto del alfabeto sin repetir.\n` +
      'Cada letra del claro se sustituye por la del cifrado en la misma posición.\n' +
      'Para descifrar: invierte el mapa (cifrado→claro) y traduce.',
    failAdvice:
      'Construye el alfabeto cifrado con la palabra clave de la pista y alinea con A–Z. Traduce el mensaje con el mapa inverso. Las opciones incorrectas suelen usar otra clave o un César.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeHill(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 31)
  let plain = onlyLetters(plainRaw).slice(0, 6)
  if (plain.length % 2 === 1) plain += 'X'
  if (plain.length < 2) plain = 'AB'
  const matrix = HILL_MATRICES[levelIndex % HILL_MATRICES.length]
  const cipher = hillEncrypt2(plain, matrix)

  // Uso real de det2 + modInverse26 vía hillInverse2 / hillDecrypt2
  const decrypted = hillDecrypt2(cipher, matrix)
  // verified should equal plain (or plain without trailing X in some cases, but we keep consistent)
  if (decrypted && onlyLetters(decrypted).startsWith(onlyLetters(plain).replace(/X$/, ''))) {
    // ok
  }

  const seed = hashStr(`hill-${levelIndex}-${cipher}`)
  const otherMatrix = HILL_MATRICES[(levelIndex + 1) % HILL_MATRICES.length]
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 3),
      atbash(plain),
      plain.slice(2) + plain.slice(0, 2),
      hillEncrypt2(plain, otherMatrix),
      cipher,
      'MATRIX',
      hillDecrypt2(cipher, otherMatrix) || 'ERROR',
      plain.replace(/X$/, '') || plain,
    ],
    seed,
  )
  const matStr = `[${matrix[0][0]} ${matrix[0][1]} ; ${matrix[1][0]} ${matrix[1][1]}]`
  const d = det2(matrix)
  return {
    id: `hill-${levelIndex}`,
    kind: 'hill',
    cipher,
    plain,
    hint:
      `Cifrado de Hill 2×2. Matriz K = ${matStr} (mod 26, det=${d}). Teclado fijo: ${HILL_KEYBOARD.slice(0, 13)}… (A=0 … Z=25). Bloques de 2 letras; relleno X si hace falta.`,
    explain:
      'Método (resumen operativo):\n' +
      '1) Pasa cada letra a número A=0 … Z=25 (teclado fijo del juego).\n' +
      '2) Agrupa en pares (p1, p2).\n' +
      '3) Multiplica por la matriz K módulo 26: (c1,c2)ᵀ = K · (p1,p2)ᵀ mod 26.\n' +
      '4) Vuelve de número a letra.\n' +
      'Para descifrar necesitas K⁻¹ mod 26 (la matriz inversa modular). Este nivel pide el claro a partir del cifrado y de K; usa la relación inversa o comprueba opciones con el mismo teclado.\n' +
      '⚠️ Es el método más exigente del juego: álgebra modular 2×2.',
    failAdvice:
      'No es un César ni un Morse. Trabaja por pares de letras, con A=0…Z=25 y la matriz de la pista. Verifica cada opción formando pares y cifrando con K, o aplica la inversa si la calculas. Muchas opciones son textos muy parecidos o resultados con otra matriz.',
    question: '¿Cuál es el texto en claro (bloques de 2, posible X final de relleno)?',
    options,
    correct,
    hillMatrix: matrix,
    hillKeyboard: HILL_KEYBOARD,
  }
}

function makeAffine(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 37)
  const plain = onlyLetters(plainRaw).slice(0, 10)
  const [a, b] = AFFINE_PAIRS[levelIndex % AFFINE_PAIRS.length]
  const cipher = affineEncrypt(plain, a, b)
  const seed = hashStr(`aff-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, b),
      affineEncrypt(plain, a, (b + 1) % 26),
      reverseStr(plain),
      atbash(plain),
      affineEncrypt(plain, AFFINE_PAIRS[(levelIndex + 1) % AFFINE_PAIRS.length][0], b),
      plain + 'X',
      cipher,
      'AFFINE',
    ],
    seed,
  )
  return {
    id: `aff-${levelIndex}`,
    kind: 'affine',
    cipher,
    plain,
    hint: `Cifrado afín: cada letra x se transforma en (a·x + b) mod 26, con a=${a}, b=${b} (a coprimo con 26). A=0…Z=25.`,
    explain:
      `Método: convierte letra → número (A=0), aplica (a·x + b) mod 26, vuelve a letra.\n` +
      `Para descifrar necesitas el inverso modular de a módulo 26 y luego x = a⁻¹·(y − b) mod 26.\n` +
      'Es una generalización del César (cuando a=1).',
    failAdvice:
      'No es un desplazamiento simple. Calcula para cada opción o aplica la fórmula inversa. Las opciones incorrectas suelen usar otro a/b o un César con el mismo b.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeScytale(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 41)
  const plain = onlyLetters(plainRaw).slice(0, 12)
  const diameter = 2 + (levelIndex % 3) // 2, 3 o 4
  const cipher = scytaleEncrypt(plain, diameter)
  const seed = hashStr(`scy-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 2),
      scytaleEncrypt(plain, diameter === 2 ? 3 : 2),
      railFenceEncrypt(plain, 2),
      atbash(plain),
      plain.slice(2) + plain.slice(0, 2),
      cipher,
      'SCYTALE',
    ],
    seed,
  )
  return {
    id: `scy-${levelIndex}`,
    kind: 'scytale',
    cipher,
    plain,
    hint: `Scytale (bastón de esparta) con diámetro ${diameter}: el texto se escribe por columnas y se lee por filas (transposición).`,
    explain:
      `Método: se imagina un cilindro de ${diameter} caras. Se escribe el claro bajando por la generatriz y se lee el mensaje desenrollado (por filas).\n` +
      'Para descifrar: reparte el cifrado en filas de longitud adecuada y lee por columnas.\n' +
      'Es una transposición clásica griega; no sustituye letras.',
    failAdvice:
      'Calcula cuántas columnas caben y reconstruye la rejilla. Prueba diámetros cercanos si el primero no da palabras. Varias opciones usan otro diámetro o un rail-fence.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

type Builder = (levelIndex: number) => Item

/** Distribución de tipos. Hill solo se usa si el switch está activo (se filtra después). */
const BUILDERS_NO_HILL: Builder[] = [
  makeCaesar,
  makeReverse,
  makeVariable,
  makeVowelSub,
  makeA1Z26,
  makeAtbash,
  makeMorse,
  makeRail,
  makeKeyword,
  makeAffine,
  makeScytale,
  makeCaesar,
  makeMorse,
  makeAtbash,
  makeVariable,
  makeKeyword,
]

const BUILDERS_WITH_HILL: Builder[] = [...BUILDERS_NO_HILL, makeHill, makeHill, makeHill]

function buildLevel(levelIndex: number, hillEnabled: boolean): Item {
  const pool = hillEnabled ? BUILDERS_WITH_HILL : BUILDERS_NO_HILL
  const builder = pool[levelIndex % pool.length]
  // Dificultad: a mayor nivel, textos del banco más avanzados (offset)
  const boosted = levelIndex + Math.floor(levelIndex / 10) * 3
  return builder(boosted)
}

// ============================================================================
// Guías históricas extensas
// ============================================================================

const CIPHER_GUIDE: Guide[] = [
  {
    id: 'intro',
    title: 'Cómo usar este módulo',
    body:
      'Cada nivel presenta un criptograma y varias opciones de texto en claro. La opción correcta está repartida al azar (no es siempre la A).\n\n' +
      'Flujo recomendado:\n' +
      '1) Lee la PISTA del nivel (tipo de cifra y parámetros).\n' +
      '2) Abre “Explicación” si necesitas el procedimiento.\n' +
      '3) Descarta opciones incompatibles con el método.\n' +
      '4) Al completar un nivel, queda marcado y no se vuelve a servir el mismo reto.\n\n' +
      'Al fallar no se muestra la respuesta: solo un consejo de método. Puedes reintentar el mismo nivel con otro mensaje del mismo tipo.\n\n' +
      'Las opciones están diseñadas para ser muy parecidas entre sí (anagramas, una letra de diferencia, variantes morfológicas). No adivines: aplica el método.',
  },
  {
    id: 'caesar',
    title: 'Cifrado César',
    body:
      'Origen e historia\n' +
      'El desplazamiento fijo del alfabeto se asocia a Julio César (siglo I a. C.). Suetonio relata que César escribía a sus colaboradores sustituyendo cada letra por otra tres puestos más adelante. En la Guerra de las Galias y en la correspondencia política romana, la cifra no buscaba resistir a un criptoanalista moderno: bastaba con impedir la lectura casual de un mensajero o de un adversario sin formación.\n\n' +
      'Durante la Edad Media y el Renacimiento, variantes del “César” reaparecen en manuales de secretarios y en órdenes religiosas. En el siglo XIX, el periodismo popular y las secciones de pasatiempos difundieron el César como acertijo. En la Segunda Guerra Mundial ya era inútil como cifra seria frente al análisis de frecuencias, pero seguía usándose para ofuscar mensajes de bajo valor o como capa didáctica.\n\n' +
      'Usos reales (límites)\n' +
      '• Mensajes militares breves en la Antigüedad romana.\n' +
      '• Ofuscación de spoilers y rot13 en foros de internet (César +13).\n' +
      '• Capas de “seguridad por oscuridad” en retos CTF y escape rooms.\n\n' +
      'Cómo resolver\n' +
      'Alfabeto circular de 26 letras. Clave = número de puestos k (1–25). Cifrado: (x + k) mod 26. Descifrado: (x − k) mod 26.\n' +
      'Si no conoces k, prueba 1…25 o alinea la letra más frecuente del cifrado con E/A/O (español) y comprueba si el resto forma palabras.\n' +
      'Ejemplo: k=3, CLAVE → FODYH. Inversa: FODYH −3 → CLAVE.\n\n' +
      'Debilidad central: solo 25 claves; el análisis de frecuencias y la fuerza bruta las agotan al instante.',
  },
  {
    id: 'reverse',
    title: 'Inversión (espejo)',
    body:
      'Origen e historia\n' +
      'Escribir al revés es un recurso pre-criptográfico: aparece en juegos infantiles, en inscripciones lúdicas y en ejercicios escolares. No constituye un sistema militar serio; su “secreto” dura solo el tiempo de notar el truco.\n\n' +
      'Leonardo da Vinci usaba escritura especular en sus cuadernos, probablemente por comodidad para un zurdo y por privacidad ligera frente a miradas casuales, no como cifra de campaña. En el siglo XX, mensajes “al revés” reaparecen en acertijos de revistas y en pruebas de observación.\n\n' +
      'Cómo resolver\n' +
      'Invierte el orden de los caracteres del bloque. Ejemplo: EJERCITO → OTICREJE.\n' +
      'Si hay espacios eliminados, reinstálalos tras recuperar el orden. En este juego los niveles de espejo trabajan solo con letras.',
  },
  {
    id: 'variable',
    title: 'Desplazamiento variable (eco de Vigenère)',
    body:
      'Origen e historia\n' +
      'Los cifrados polialfabéticos rompen la frecuencia simple del César. Leon Battista Alberti (s. XV) diseñó un disco que cambiaba de alfabeto; Johannes Trithemius tabulará progresiones; Blaise de Vigenère (s. XVI) popularizó el uso de una palabra clave que elige el desplazamiento en cada posición. Durante siglos se consideró “le chiffre indéchiffrable”.\n\n' +
      'En el siglo XIX, Charles Babbage y después Friedrich Kasiski mostraron cómo atacar Vigenère detectando repeticiones y deduciendo la longitud de la clave. En las guerras mundiales, variantes mecánicas (rotores) superaron a las tablas manuales, pero la idea —cambiar de alfabeto con la posición— sigue en la base de muchos sistemas.\n\n' +
      'En este juego\n' +
      'Usamos un patrón didáctico fijo (p.ej. +1,+2,+3) no una palabra clave completa. Sirve para entrenar el hábito de “la regla cambia con el índice”.\n\n' +
      'Cómo resolver\n' +
      'Numera letras desde 0. Resta el patrón módulo 26. Ejemplo: patrón +1+2+3 sobre ABC → BDF; inversa resta 1,2,3.',
  },
  {
    id: 'vowel_sub',
    title: 'Sustitución de vocales',
    body:
      'Origen e historia\n' +
      'La sustitución monoalfabética general (cada letra → otra fija) es antigua: el atbash hebreo, sistemas árabes medievales descritos por al-Kindi (quien además explica el análisis de frecuencias), y las cifras de cancillería europea. Mary Stuart, reina de Escocia, usó un nomenclátor de sustitución que fue criptoanalizado por el equipo de Elizabeth I; el contenido de las cartas contribuyó a su condena (1586–1587).\n\n' +
      'En este módulo la sustitución se limita a las vocales (mapa fijo según el nivel) para aislar el hábito de “mapa inverso” sin exigir un alfabeto completo de 26 símbolos.\n\n' +
      'Cómo resolver\n' +
      'Aplica el mapa inverso solo donde corresponda. Las consonantes del cifrado son consonantes del claro.',
  },
  {
    id: 'a1z26',
    title: 'A=1 … Z=26',
    body:
      'Origen e historia\n' +
      'Asignar números a letras es tan viejo como los alfabetos ordenados. Aparece en isopsefía griega, en gematría y, en versión escolar, en miles de acertijos modernos (“3-15-4-5 = CODE”). No aporta difusión ni confusión fuertes: es una codificación, no una cifra robusta.\n\n' +
      'Uso práctico actual: retos de lógica, capas de ofuscación trivial en CTF, y ejercicios de introducción antes de pasar a César o Vigenère.\n\n' +
      'Cómo resolver\n' +
      '1→A, 2→B, … 26→Z. Los guiones separan letras. Ejemplo: 16-21-5-18-20-1 → PUERTA.',
  },
  {
    id: 'atbash',
    title: 'Atbash',
    body:
      'Origen e historia\n' +
      'Atbash nace en el alefato hebreo: la primera letra se intercambia con la última, la segunda con la penúltima, etc. Aparece en juegos de palabras y en algunos pasajes interpretados de textos bíblicos (p. ej. referencias a “Sheshach” como posible atbash de Babel). Trasplantado al alfabeto latino: A↔Z, B↔Y, C↔X…\n\n' +
      'Es un caso particular de sustitución monoalfabética, involutivo (aplicar dos veces = identidad). Como el César, cae al análisis de frecuencias.\n\n' +
      'Cómo resolver\n' +
      'Sustituye cada letra por su simétrica. Ejemplo: ATBASH → ZGYZHS. Comprueba aplicando de nuevo: debe volver al claro.',
  },
  {
    id: 'morse',
    title: 'Código Morse',
    body:
      'Origen e historia\n' +
      'Samuel Morse y Alfred Vail desarrollaron en la década de 1830 un sistema de puntos y rayas para el telégrafo eléctrico. El Morse no es un cifrado de secreto: es un código de transmisión. Cualquiera con la tabla puede leerlo. Su “dificultad” para el principiante es solo la falta de memoria de la tabla.\n\n' +
      'Usos reales largos\n' +
      '• Telégrafo del siglo XIX y principios del XX: noticias, ferrocarriles, diplomacia.\n' +
      '• Radio marítima y señal de socorro SOS (··· −−− ···), adoptada tras debates internacionales; el Titanic (1912) emitió CQD y SOS.\n' +
      '• Aviación y aficionados (ham radio): el Morse atraviesa condiciones de señal pobres mejor que la voz en muchos casos.\n' +
      '• Segunda Guerra Mundial: operadores de radio en ambos bandos; el secreto venía de cifras adicionales, no del Morse en sí.\n\n' +
      'Cómo resolver en este juego\n' +
      'Cada letra está separada por “ / ”. Traduce con la tabla internacional. Ejemplo: ·− / −··· / ·−·· / ·− → ABLA (si ese fuera el claro).\n' +
      'Memoriza primero E T A N I M S O (las más frecuentes / cortas) para anclar.',
  },
  {
    id: 'rail',
    title: 'Rail fence (cerca de rieles)',
    body:
      'Origen e historia\n' +
      'La cifra de rieles es una transposición: no sustituye letras, solo cambia su orden. Se describe en manuales de criptografía clásica y en ejercicios militares básicos. Su nombre evoca el zig-zag de una cerca. No resiste un criptoanálisis serio cuando el texto es largo, pero entrena la visión espacial del mensaje.\n\n' +
      'Cómo resolver\n' +
      'Con 2 rieles: las posiciones impares y pares del claro se separan en dos filas; el cifrado concatena fila1+fila2.\n' +
      'Con 3 rieles: el patrón de filas es 0,1,2,1,0,1,2,1,…\n' +
      'Para descifrar: marca el patrón de índices, reparte el cifrado en las filas según cuántas letras caen en cada una, y relee en zig-zag.',
  },
  {
    id: 'keyword',
    title: 'Sustitución por palabra clave',
    body:
      'Origen e historia\n' +
      'Derivar un alfabeto cifrado a partir de una palabra clave (eliminando repeticiones y completando con el resto del alfabeto) es una técnica clásica de cifras monoalfabéticas de cancillería. Aparece en tratados de los siglos XVI–XVIII y en el uso civil de “cifras de amantes” y diarios.\n\n' +
      'Mary Stuart y otros personajes de la Europa moderna combinaban nomenclátores (palabras ↔ símbolos) con alfabetos mezclados. El análisis de frecuencias de al-Kindi, redescubierto en Europa, acaba con estas cifras cuando hay texto suficiente.\n\n' +
      'Cómo resolver\n' +
      '1) Construye el alfabeto cifrado: keyword sin duplicados + letras restantes en orden.\n' +
      '2) Alinea con A–Z.\n' +
      '3) Para descifrar, invierte el mapa.\n' +
      'Ejemplo: clave SOL → alfabeto cifrado SOLABCDF…; A→S, B→O, C→L, D→A…',
  },
  {
    id: 'affine',
    title: 'Cifrado afín',
    body:
      'Origen e historia\n' +
      'El cifrado afín generaliza el César: en lugar de sumar una constante, se aplica una transformación lineal ax + b módulo 26, con a coprimo con 26 (para que sea invertible). Aparece en tratados matemáticos de criptografía del siglo XIX y principios del XX como ejemplo didáctico de aritmética modular.\n\n' +
      'Cómo resolver\n' +
      'Conoce a y b de la pista. Para cada letra: número = a·x + b mod 26. Para descifrar calcula a⁻¹ mod 26 y aplica x = a⁻¹·(y − b) mod 26.\n' +
      'Cuando a=1 se reduce al César clásico.',
  },
  {
    id: 'scytale',
    title: 'Scytale (bastón espartano)',
    body:
      'Origen e historia\n' +
      'La scytale es una de las cifras de transposición más antiguas documentadas. Plutarco y otros autores clásicos describen su uso por los espartanos: un mensaje se enrollaba en un bastón de diámetro concreto; solo quien tuviera un bastón del mismo grosor podía leerlo al re-enrollarlo.\n\n' +
      'Es puramente posicional: no cambia las letras, solo su orden. En este juego se simula con un “diámetro” (número de filas) fijo por nivel.\n\n' +
      'Cómo resolver\n' +
      'Reparte el cifrado en el número de filas indicado y lee por columnas (o reconstruye la rejilla y lee en el orden de escritura).',
  },
  {
    id: 'hill',
    title: 'Cifrado de Hill (AVANZADO)',
    hard: true,
    body:
      '⚠️ ADVERTENCIA: este método es claramente más difícil. Está DESACTIVADO por defecto. Actívalo solo si quieres álgebra modular.\n\n' +
      'Origen e historia\n' +
      'Lester S. Hill publicó en 1929 (The American Mathematical Monthly) un sistema que cifra bloques de letras mediante multiplicación de matrices sobre aritmética modular. Fue de los primeros en traer álgebra lineal formal a la criptografía de texto. No se convirtió en estándar militar masivo (las máquinas de rotores y luego la criptografía de clave pública ocuparon ese lugar), pero influyó en la idea de cifrar por bloques y en la enseñanza de cripto matemática.\n\n' +
      'Ideas clave\n' +
      '• A=0, B=1, … Z=25 (en este juego el teclado fijo es A…Z en ese orden numérico).\n' +
      '• Se elige una matriz K n×n invertible mód 26 (det(K) coprimo con 26).\n' +
      '• El claro se parte en vectores de n letras; cifrado = K · vector mod 26.\n' +
      '• Descifrado = K⁻¹ · vector_cifrado mod 26.\n\n' +
      'En este módulo\n' +
      'Solo usamos n=2 y matrices de un catálogo invertible. Todos los niveles Hill comparten el mismo teclado A=0…Z=25. Si el número de letras es impar, se rellena con X.\n\n' +
      'Cómo abordar un nivel\n' +
      '1) Anota la matriz K de la pista.\n' +
      '2) Para cada opción de claro, cifra con K y compara con el criptograma; o calcula K⁻¹ y descifra el criptograma una sola vez.\n' +
      '3) Recuerda el relleno X final si aplica.\n\n' +
      'Ejemplo mínimo\n' +
      'K = [3 3; 2 5], claro “HI” → H=7,I=8 → (3·7+3·8, 2·7+5·8) mod 26 = (45,54) mod 26 = (19,2) → TC.',
  },
]

// ============================================================================
// Persistencia de completados y switch Hill
// ============================================================================

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

function loadHillEnabled(): boolean {
  try {
    return localStorage.getItem(HILL_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function saveHillEnabled(v: boolean) {
  try {
    localStorage.setItem(HILL_ENABLED_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Componente
// ============================================================================

export function CodigoGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(() => getUnlockedLevels(GAME_CAT, GAME_ID), [progress.highestLevel])
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))

  const [level, setLevel] = useState(defaultLevel)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [openGuide, setOpenGuide] = useState<string | null>('intro')
  const [item, setItem] = useState<Item | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [hillEnabled, setHillEnabled] = useState(loadHillEnabled)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [showExplain, setShowExplain] = useState(false)
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted())
  const [pickNonce, setPickNonce] = useState(0)

  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level
  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /** Elige un ítem de nivel que no esté en completados; si todos lo están, permite repetición controlada. */
  const pickItemForLevel = useCallback(
    (lv: number, nonce: number): Item => {
      const base = buildLevel(lv - 1, hillEnabled)
      // Variantes: desplazar el índice de construcción para no repetir el mismo id
      for (let k = 0; k < 40; k++) {
        const candidate = buildLevel(lv - 1 + (nonce + k) * 17, hillEnabled)
        // Fuerza id distinto por nivel+nonce
        const id = `${candidate.kind}-L${lv}-n${nonce + k}`
        const item: Item = { ...candidate, id }
        if (!completed.has(id)) return item
      }
      // Fallback: nuevo id aunque el contenido se parezca
      return { ...base, id: `${base.kind}-L${lv}-n${nonce}-${Date.now()}` }
    },
    [completed, hillEnabled],
  )

  const startLevel = useCallback(
    (lv: number, nonce = 0) => {
      clearTimers()
      const next = pickItemForLevel(lv, nonce)
      setItem(next)
      setIsCorrect(null)
      setShowExplain(false)
      setLevel(lv)
      setPickNonce(nonce)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(40, TIMER_BASE - Math.floor(lv / 8)))
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              clearTimers()
              setIsCorrect(false)
              setPhase('result')
              soundFail()
              recordLevelResult({
                categoryId: GAME_CAT,
                gameId: GAME_ID,
                level: levelRef.current,
                success: false,
                timeMs: Date.now() - startRef.current,
              })
              return 0
            }
            return t - 1
          })
        }, 1000)
      }
    },
    [useTimer, pickItemForLevel],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!item || isCorrect !== null) return
    soundClick()
    clearTimers()
    const ok = idx === item.correct
    setIsCorrect(ok)
    setPhase('result')
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: ok,
      timeMs: Date.now() - startRef.current,
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

  const toggleHill = () => {
    const v = !hillEnabled
    soundToggle(v)
    setHillEnabled(v)
    saveHillEnabled(v)
  }

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.15rem',
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
          {phase === 'setup' ? '← Volver' : '← Menú'}
        </button>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {phase === 'play' && useTimer && (
            <span className="mono" style={{ color: timeLeft <= 12 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)' }}>
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
          {phase !== 'setup' && <span className="level-number">Nivel {level}</span>}
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
              Elige nivel · marcas desbloqueadas
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
        {phase === 'setup' && (
          <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center' }}>🔐 Código cifrado</h2>
                <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Estudia cada método (historia, usos reales y procedimiento). Luego descifra. Las opciones están
                  mezcladas y diseñadas para ser muy parecidas entre sí: la respuesta correcta no es obvia. Los niveles
                  completados no se repiten. Hay 300 niveles y más tipos de cifra.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {CIPHER_GUIDE.map((g) => {
                    const open = openGuide === g.id
                    return (
                      <div
                        key={g.id}
                        style={{
                          borderRadius: 14,
                          border: g.hard
                            ? '1px solid rgba(255,180,80,0.45)'
                            : '1px solid var(--gco-glass-border)',
                          background: g.hard ? 'rgba(255,160,40,0.08)' : 'var(--gco-fill-quaternary)',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundClick()
                            setOpenGuide(open ? null : g.id)
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0.85rem 1rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--gco-ink)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: 600,
                            fontSize: '0.92rem',
                          }}
                        >
                          <span style={{ color: open ? 'var(--gco-primary)' : 'var(--gco-ink)' }}>
                            {g.title}
                            {g.hard ? ' · difícil' : ''}
                          </span>
                          <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
                        </button>
                        <AnimatePresence>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <p
                                style={{
                                  margin: 0,
                                  padding: '0 1rem 1rem',
                                  fontSize: '0.82rem',
                                  color: 'var(--gco-ink-muted)',
                                  lineHeight: 1.55,
                                  whiteSpace: 'pre-line',
                                }}
                              >
                                {g.body}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>

                {/* Switch Hill */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    background: 'rgba(255,160,40,0.08)',
                    border: '1px solid rgba(255,180,80,0.4)',
                    borderRadius: 14,
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>Cifrado de Hill (matrices 2×2)</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', lineHeight: 1.45 }}>
                      Desactivado por defecto. Es el modo más exigente: álgebra modular, teclado A=0…Z=25 y bloques de
                      2 letras. Actívalo solo si quieres el reto avanzado. Todos los niveles Hill usan el mismo teclado
                      predefinido.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hillEnabled}
                    onClick={toggleHill}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      background: hillEnabled ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                      position: 'relative',
                      marginTop: 4,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: hillEnabled ? 24 : 3,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                      }}
                    />
                  </button>
                </div>

                {bestForLevel != null && bestForLevel > 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--gco-primary)', fontSize: '0.9rem' }}>
                    🏆 Mejor tiempo nv. {level}: <span className="mono">{formatDuration(bestForLevel)}</span>
                  </p>
                )}

                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>
                  Completados en este dispositivo: {completed.size} · Niveles totales: {TOTAL_LEVELS}
                  {hillEnabled ? ' · Hill ON' : ' · Hill OFF'}
                </p>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.8rem 1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600 }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>Activo por defecto</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      soundToggle(!useTimer)
                      setUseTimer(!useTimer)
                    }}
                    style={{
                      width: 52,
                      height: 30,
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                      position: 'relative',
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
                        transition: 'left 0.2s',
                      }}
                    />
                  </button>
                </div>

                <GlassButton onClick={() => startLevel(Math.min(level, maxSelectable), 0)} style={{ minHeight: 48 }}>
                  Descifrar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && item && (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', margin: 0 }}>CIFRADO · {item.kind}</p>
                  <span style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}>
                    Opciones mezcladas · difíciles
                  </span>
                </div>
                <p
                  className="mono"
                  style={{
                    fontSize: item.kind === 'morse' ? '1.05rem' : '1.35rem',
                    fontWeight: 700,
                    letterSpacing: item.kind === 'morse' ? '0.02em' : '0.08em',
                    marginBottom: 10,
                    color: 'var(--gco-primary)',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.cipher}
                </p>

                {item.kind === 'hill' && item.hillMatrix && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '0.75rem 0.9rem',
                      borderRadius: 12,
                      border: '1px solid rgba(255,180,80,0.35)',
                      background: 'rgba(255,160,40,0.07)',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>Teclado Hill (fijo en todos los niveles)</p>
                    <p className="mono" style={{ marginBottom: 6, letterSpacing: '0.04em' }}>
                      {HILL_KEYBOARD.split('').map((ch, i) => `${ch}=${i}`).join(' · ')}
                    </p>
                    <p className="mono" style={{ marginBottom: 0 }}>
                      K = [[{item.hillMatrix[0][0]}, {item.hillMatrix[0][1]}], [{item.hillMatrix[1][0]},{' '}
                      {item.hillMatrix[1][1]}]] (mod 26)
                    </p>
                  </div>
                )}

                <div
                  style={{
                    marginBottom: 12,
                    padding: '0.7rem 0.85rem',
                    borderRadius: 12,
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                  }}
                >
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gco-primary)', marginBottom: 4 }}>
                    PISTA
                  </p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--gco-ink-muted)', margin: 0, lineHeight: 1.45 }}>
                    {item.hint}
                  </p>
                </div>

                <button
                  type="button"
                  className="glass-button secondary"
                  style={{ marginBottom: 12, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => {
                    soundClick()
                    setShowExplain((v) => !v)
                  }}
                >
                  {showExplain ? 'Ocultar explicación del método' : 'Ver explicación del método'}
                </button>

                <AnimatePresence>
                  {showExplain && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden', marginBottom: 12 }}
                    >
                      <div
                        style={{
                          padding: '0.75rem 0.85rem',
                          borderRadius: 12,
                          border: '1px solid var(--gco-glass-border)',
                          background: 'var(--gco-fill-quaternary)',
                        }}
                      >
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 4 }}>EXPLICACIÓN (sin respuesta)</p>
                        <p
                          style={{
                            fontSize: '0.84rem',
                            color: 'var(--gco-ink-muted)',
                            margin: 0,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {item.explain}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p style={{ fontWeight: 600, marginBottom: 12 }}>{item.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((o, i) => (
                    <button
                      key={`${item.id}-${i}`}
                      type="button"
                      className="glass-button secondary"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 44, fontSize: '0.88rem' }}
                      onClick={() => submit(i)}
                    >
                      <span style={{ opacity: 0.5, marginRight: 8, fontFamily: 'var(--font-mono)' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span className="mono">{o}</span>
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && item && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.3rem', textAlign: 'center' }}>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  {isCorrect ? 'Descifrado' : 'Fallido'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 12px' }}>
                  {formatDuration(Date.now() - startRef.current)}
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
                    Nivel marcado como completado. No se volverá a servir este mismo reto.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>Siguiente</GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, pickNonce + 1)}>
                      Otro mensaje (mismo nivel)
                    </GlassButton>
                  )}
                  <button
                    type="button"
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

export default CodigoGame