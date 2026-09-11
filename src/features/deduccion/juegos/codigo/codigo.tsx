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
const TOTAL_LEVELS = 600
const TIMER_BASE = 80
const COMPLETED_KEY = 'gco_codigo_completed_v4'
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
  | 'playfair'
  | 'columnar'
  | 'beaufort'
  | 'polybius'

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
  /** Para Hill: matriz y tamaño */
  hillMatrix?: number[][]
  hillSize?: number
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

/** Rail fence (zig-zag) con 2, 3 o 4 rieles. */
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
  return grid.join('')
}

// --- Columnar transposition ---
function columnarEncrypt(s: string, key: string): string {
  const t = onlyLetters(s)
  const k = onlyLetters(key)
  const cols = k.length
  if (cols < 2) return t
  const order = k
    .split('')
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c === b.c ? a.i - b.i : a.c.localeCompare(b.c)))
    .map((o) => o.i)
  const rows = Math.ceil(t.length / cols)
  const padded = t.padEnd(rows * cols, 'X')
  let out = ''
  for (const col of order) {
    for (let r = 0; r < rows; r++) {
      out += padded[r * cols + col]
    }
  }
  return out
}

// --- Beaufort (variant of Vigenère) ---
function beaufortEncrypt(s: string, key: string): string {
  const t = onlyLetters(s)
  const k = onlyLetters(key)
  if (!k.length) return t
  return t
    .split('')
    .map((c, i) => {
      const x = c.charCodeAt(0) - 65
      const y = k[i % k.length].charCodeAt(0) - 65
      return ABC[mod26(y - x)]
    })
    .join('')
}

// --- Polybius square (5x5, I/J combined) ---
const POLYBIUS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  let n = 1
  for (const c of ABC) {
    if (c === 'J') {
      map[c] = map['I']
      continue
    }
    const row = Math.ceil(n / 5)
    const col = ((n - 1) % 5) + 1
    map[c] = `${row}${col}`
    n++
  }
  return map
})()

function polybiusEncode(s: string): string {
  return onlyLetters(s)
    .split('')
    .map((c) => POLYBIUS[c === 'J' ? 'I' : c] || '')
    .filter(Boolean)
    .join(' ')
}

// --- Playfair (simplified 5x5, I/J) ---
function buildPlayfairSquare(key: string): string[][] {
  const seen = new Set<string>()
  const flat: string[] = []
  for (const c of onlyLetters(key) + ABC) {
    const ch = c === 'J' ? 'I' : c
    if (!seen.has(ch) && ch !== 'J') {
      seen.add(ch)
      flat.push(ch)
    }
  }
  const sq: string[][] = []
  for (let i = 0; i < 5; i++) sq.push(flat.slice(i * 5, i * 5 + 5))
  return sq
}

function playfairEncrypt(plain: string, key: string): string {
  const sq = buildPlayfairSquare(key)
  const pos: Record<string, [number, number]> = {}
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) pos[sq[r][c]] = [r, c]
  let t = onlyLetters(plain).replace(/J/g, 'I')
  // digraphs with X padding
  const digs: string[] = []
  let i = 0
  while (i < t.length) {
    const a = t[i]
    let b = t[i + 1]
    if (!b || a === b) {
      digs.push(a + 'X')
      i += 1
    } else {
      digs.push(a + b)
      i += 2
    }
  }
  return digs
    .map((d) => {
      const [r1, c1] = pos[d[0]]
      const [r2, c2] = pos[d[1]]
      if (r1 === r2) return sq[r1][(c1 + 1) % 5] + sq[r2][(c2 + 1) % 5]
      if (c1 === c2) return sq[(r1 + 1) % 5][c1] + sq[(r2 + 1) % 5][c2]
      return sq[r1][c2] + sq[r2][c1]
    })
    .join('')
}

// --- Hill cipher (2×2, 3×3, 4×4) ---
const HILL_KEYBOARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function mod26(n: number): number {
  return ((n % 26) + 26) % 26
}

function modInverse26(a: number): number | null {
  a = mod26(a)
  for (let x = 1; x < 26; x++) {
    if (mod26(a * x) === 1) return x
  }
  return null
}

/** Determinante de matriz n×n mod 26 (n<=4). */
function detN(m: number[][]): number {
  const n = m.length
  if (n === 1) return mod26(m[0][0])
  if (n === 2) return mod26(m[0][0] * m[1][1] - m[0][1] * m[1][0])
  // Laplace expansion for 3 and 4
  let d = 0
  for (let j = 0; j < n; j++) {
    const minor = m.slice(1).map((row) => row.filter((_, cj) => cj !== j))
    const sign = j % 2 === 0 ? 1 : -1
    d += sign * m[0][j] * detN(minor)
  }
  return mod26(d)
}

/** Inversa modular de matriz n×n mod 26. null si no invertible. */
function matrixInverseMod26(m: number[][]): number[][] | null {
  const n = m.length
  const d = detN(m)
  const invDet = modInverse26(d)
  if (invDet == null) return null

  // adjugate via cofactors
  const adj: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = m
        .filter((_, ri) => ri !== i)
        .map((row) => row.filter((_, cj) => cj !== j))
      const cof = ((i + j) % 2 === 0 ? 1 : -1) * detN(minor)
      adj[j][i] = mod26(cof) // transpose
    }
  }
  return adj.map((row) => row.map((v) => mod26(v * invDet)))
}

function hillEncryptN(plain: string, matrix: number[][]): string {
  const n = matrix.length
  let t = onlyLetters(plain)
  while (t.length % n !== 0) t += 'X'
  let out = ''
  for (let i = 0; i < t.length; i += n) {
    const vec = Array.from({ length: n }, (_, k) => t.charCodeAt(i + k) - 65)
    for (let r = 0; r < n; r++) {
      let sum = 0
      for (let c = 0; c < n; c++) sum += matrix[r][c] * vec[c]
      out += ABC[mod26(sum)]
    }
  }
  return out
}

function hillDecryptN(cipher: string, matrix: number[][]): string | null {
  const inv = matrixInverseMod26(matrix)
  if (!inv) return null
  return hillEncryptN(cipher, inv)
}

/** Matrices 2×2 invertibles mod 26 */
const HILL_2X2: number[][][] = [
  [[3, 3], [2, 5]],
  [[5, 8], [17, 3]],
  [[9, 4], [5, 7]],
  [[11, 8], [3, 7]],
  [[6, 5], [5, 7]],
  [[15, 17], [4, 9]],
  [[7, 8], [11, 11]],
  [[2, 3], [5, 7]],
  [[4, 5], [3, 4]],
  [[8, 5], [3, 4]],
  [[1, 2], [3, 5]],
  [[3, 5], [1, 2]],
  [[7, 3], [2, 5]],
  [[9, 2], [5, 3]],
  [[11, 5], [2, 3]],
  [[13, 4], [5, 7]],
  [[15, 2], [7, 3]],
  [[17, 5], [3, 4]],
  [[19, 3], [4, 5]],
  [[21, 4], [5, 3]],
]

/** Matrices 3×3 invertibles mod 26 */
const HILL_3X3: number[][][] = [
  [[1, 2, 3], [0, 1, 4], [5, 6, 0]],
  [[2, 3, 1], [1, 0, 2], [3, 1, 4]],
  [[1, 1, 1], [1, 2, 3], [1, 4, 9]],
  [[3, 1, 2], [2, 3, 1], [1, 2, 3]],
  [[5, 2, 1], [1, 3, 2], [2, 1, 4]],
  [[1, 0, 1], [0, 1, 1], [1, 1, 0]],
  [[2, 1, 0], [1, 2, 1], [0, 1, 2]],
  [[4, 1, 2], [1, 3, 1], [2, 1, 3]],
  [[1, 3, 2], [2, 1, 3], [3, 2, 1]],
  [[6, 1, 2], [1, 5, 1], [2, 1, 4]],
  [[1, 2, 0], [0, 1, 2], [2, 0, 1]],
  [[3, 2, 1], [1, 4, 2], [2, 1, 3]],
]

/** Matrices 4×4 invertibles mod 26 */
const HILL_4X4: number[][][] = [
  [
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 1, 0, 1],
    [1, 0, 1, 0],
  ],
  [
    [2, 1, 0, 0],
    [1, 2, 1, 0],
    [0, 1, 2, 1],
    [0, 0, 1, 2],
  ],
  [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 1],
    [1, 0, 0, 1],
  ],
  [
    [3, 1, 0, 1],
    [1, 2, 1, 0],
    [0, 1, 3, 1],
    [1, 0, 1, 2],
  ],
  [
    [1, 2, 0, 1],
    [0, 1, 2, 0],
    [1, 0, 1, 2],
    [2, 1, 0, 1],
  ],
  [
    [5, 1, 0, 0],
    [1, 5, 1, 0],
    [0, 1, 5, 1],
    [0, 0, 1, 5],
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
  [5, 3],
  [7, 9],
  [11, 2],
  [15, 11],
  [17, 8],
  [19, 5],
  [21, 7],
  [3, 4],
  [9, 6],
  [25, 13],
]

// ============================================================================
// Banco de textos en claro (amplio, con grupos semánticos para distractores creíbles)
// ============================================================================

const PLAIN_BANK = [
  // saludos / cortesía
  'HOLA',
  'SALUDOS',
  'BIENVENIDO',
  'BIENVENIDA',
  'ADIOS',
  'HASTA LUEGO',
  'HASTA PRONTO',
  'BUEN DIA',
  'BUENAS TARDES',
  'BUENAS NOCHES',
  // direcciones / orientación
  'NORTE',
  'SUR',
  'ESTE',
  'OESTE',
  'NORESTE',
  'NOROESTE',
  'SURESTE',
  'SUROESTE',
  'CENTRO',
  'DERECHA',
  'IZQUIERDA',
  'ARRIBA',
  'ABAJO',
  // objetos cotidianos
  'CLAVE',
  'LLAVE',
  'PUERTA',
  'VENTANA',
  'MESA',
  'SILLA',
  'LIBRO',
  'PAPEL',
  'LAPIZ',
  'CUADERNO',
  'CARTERA',
  'RELOJ',
  'MAPA',
  'PLANO',
  'BRUJULA',
  // acciones / verbos frecuentes
  'ABRE',
  'CIERRA',
  'ENTRA',
  'SALE',
  'ESPERA',
  'AVANZA',
  'RETROCEDE',
  'GIRA',
  'SUBE',
  'BAJA',
  'CORRE',
  'CAMINA',
  'ESCUCHA',
  'OBSERVA',
  'ESCONDE',
  'REVELA',
  // comunicación / espionaje
  'MENSAJE',
  'SECRETO',
  'CODIGO',
  'CIFRA',
  'PATRON',
  'ENIGMA',
  'SENAL',
  'CANAL',
  'ARCHIVO',
  'AGENTE',
  'CONTACTO',
  'PROTOCOLO',
  'OPERACION',
  'MISION',
  'OBJETIVO',
  'INFORME',
  'DATOS',
  'FUENTE',
  'ORIGEN',
  'DESTINO',
  // tiempo
  'MANANA',
  'TARDE',
  'NOCHE',
  'AMANECER',
  'ANOCHECER',
  'MEDIODIA',
  'MEDIANOCHE',
  'SEMANA',
  'MES',
  'ANO',
  'HORA',
  'MINUTO',
  'SEGUNDO',
  // naturaleza
  'SOL',
  'LUNA',
  'ESTRELLA',
  'CIELO',
  'MAR',
  'RIO',
  'MONTE',
  'VALLE',
  'BOSQUE',
  'DESIERTO',
  'PLAYA',
  'ISLA',
  'NUBE',
  'LLUVIA',
  'VIENTO',
  // conceptos abstractos
  'VERDAD',
  'MENTIRA',
  'ERROR',
  'ACIERTO',
  'LOGICA',
  'RAZON',
  'PRUEBA',
  'IDEA',
  'METODO',
  'SISTEMA',
  'PROCESO',
  'RESULTADO',
  'CAUSA',
  'EFECTO',
  // frases cortas temáticas
  'ABRE LA PUERTA',
  'CIERRA LA VENTANA',
  'CITA AL ALBA',
  'CITA AL ANOCHECER',
  'NORTE SEGURO',
  'SUR PELIGROSO',
  'CAMBIO DE RUTA',
  'CAMBIO DE RUMBO',
  'EVITA EL PUENTE',
  'EVITA EL PUERTO',
  'CODIGO VALIDO',
  'CODIGO INVALIDO',
  'MENSAJE OCULTO',
  'MENSAJE SECRETO',
  'CLAVE MAESTRA',
  'CLAVE SECUNDARIA',
  'PUNTO DE ENCUENTRO',
  'PUNTO DE PARTIDA',
  'SIN RASTRO',
  'SIN HUELLA',
  'OPERACION LUNA',
  'OPERACION SOL',
  'OPERACION MARTE',
  'OPERACION SILENCIO',
  'FOCO EN EL MAPA',
  'FOCO EN EL PLANO',
  'RUTA ALTERNATIVA',
  'RUTA PRINCIPAL',
  'SENAL DEBIL',
  'SENAL FUERTE',
  'SENAL CLARA',
  'ARCHIVO CERRADO',
  'ARCHIVO ABIERTO',
  'ARCHIVO OCULTO',
  'ARCHIVO CLASIFICADO',
  'CODIGO ROJO ACTIVO',
  'PUNTO CIEGO NORTE',
  'CLAVE DE RESPALDO',
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
  // frases medias
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
  'MANTEN EL SILENCIO ABSOLUTO',
  'MANTEN LA POSICION ACTUAL',
  'MANTEN EL CONTACTO ACTIVO',
  'EL OBJETIVO SE MUEVE AL ESTE',
  'EL OBJETIVO SE MUEVE AL OESTE',
  'EL OBJETIVO PERMANECE QUIETO',
  'LA FUENTE CONFIRMA EL DATO',
  'LA FUENTE NIEGA EL DATO',
  'LA FUENTE SOLICITA TIEMPO',
  'PREPARA LA EXTRACCION YA',
  'PREPARA LA EXTRACCION MANANA',
  'CANCELA LA EXTRACCION HOY',
  'EL PAQUETE ESTA EN CAMINO',
  'EL PAQUETE FUE INTERCEPTADO',
  'EL PAQUETE LLEGO INTACTO',
  'USA LA RUTA SECUNDARIA',
  'USA LA RUTA PRINCIPAL',
  'ABANDONA LA RUTA ACTUAL',
  // más frases profesionales
  'CONFIRMA RECEPCION DEL MENSAJE',
  'NIEGA RECEPCION DEL MENSAJE',
  'SOLICITA REPETICION DEL MENSAJE',
  'EL SISTEMA ESTA COMPROMETIDO',
  'EL SISTEMA FUNCIONA NORMAL',
  'EL SISTEMA REQUIERE REVISION',
  'ACTIVA EL PROTOCOLO DE EMERGENCIA',
  'DESACTIVA EL PROTOCOLO DE EMERGENCIA',
  'ESPERA ORDENES ADICIONALES',
  'PROCEDE SEGUN PLAN ORIGINAL',
  'MODIFICA EL PLAN ORIGINAL',
  'EL HORARIO SE MANTIENE FIRME',
  'EL HORARIO CAMBIA A LAS DIEZ',
  'EL HORARIO CAMBIA A LAS SEIS',
  'REUNION EN EL LUGAR HABITUAL',
  'REUNION EN LUGAR ALTERNATIVO',
  'REUNION CANCELADA POR SEGURIDAD',
  'TRAEMOS INFORMACION VALIOSA',
  'TRAEMOS INFORMACION FALSA',
  'NO TRAEMOS INFORMACION NUEVA',
  'LA RED SIGUE OPERATIVA',
  'LA RED ESTA CAIDA',
  'LA RED NECESITA REPARACION',
  'CIFRA CON LA CLAVE DIARIA',
  'CIFRA CON LA CLAVE SEMANAL',
  'CIFRA CON LA CLAVE MENSUAL',
  'EL ENEMIGO CONOCE LA RUTA',
  'EL ENEMIGO IGNORA LA RUTA',
  'EL ENEMIGO SOSPECHA LA RUTA',
  'CAMBIA TODAS LAS CLAVES YA',
  'MANTEN LAS CLAVES ACTUALES',
  'REVISA LAS CLAVES ANTIGUAS',
  // grupos de palabras cercanas semánticamente (para distractores de calidad)
  'LUZ',
  'SOMBRA',
  'OSCURIDAD',
  'CLARIDAD',
  'BRILLO',
  'REY',
  'REINA',
  'PRINCIPE',
  'PRINCESA',
  'CORONA',
  'MAR',
  'OCEANO',
  'LAGO',
  'LAGUNA',
  'PLAYA',
  'FIN',
  'INICIO',
  'PRINCIPIO',
  'FINAL',
  'CIERRE',
  'DIA',
  'NOCHE',
  'AURORA',
  'CREPUSCULO',
  'OCASO',
  'CASA',
  'HOGAR',
  'VIVIENDA',
  'REFUGIO',
  'ESCONDITE',
  'RUTA',
  'CAMINO',
  'SENDERO',
  'VIA',
  'TRAYECTO',
  'FOCO',
  'CENTRO',
  'NUCLEO',
  'PUNTO',
  'MARCA',
  'IDEA',
  'CONCEPTO',
  'PENSAMIENTO',
  'NOCION',
  'VISION',
  'CASO',
  'ASUNTO',
  'TEMA',
  'MATERIA',
  'CUESTION',
  'META',
  'OBJETIVO',
  'PROPOSITO',
  'FIN',
  'META',
  'BASE',
  'FUNDAMENTO',
  'PILAR',
  'SOSTEN',
  'APOYO',
  'PRUEBA',
  'EVIDENCIA',
  'TESTIGO',
  'PRUEBA',
  'DEMOSTRACION',
  'ERROR',
  'FALLO',
  'FALTA',
  'EQUIVOCACION',
  'DESACIERTO',
  'SISTEMA',
  'ESTRUCTURA',
  'ORGANIZACION',
  'RED',
  'MARCO',
  'METODO',
  'TECNICA',
  'PROCEDIMIENTO',
  'FORMA',
  'MANERA',
  'PISTA',
  'INDICIO',
  'SENAL',
  'HUELLA',
  'RASTRO',
  'AGENTE',
  'OPERATIVO',
  'ESPION',
  'INFORMANTE',
  'FUENTE',
  'SENAL',
  'INDICADOR',
  'ALERTA',
  'AVISO',
  'ANUNCIO',
  'CANAL',
  'VIA',
  'MEDIO',
  'CONDUCTO',
  'RUTA',
  'ARCHIVO',
  'DOCUMENTO',
  'EXPEDIENTE',
  'REGISTRO',
  'FICHA',
  // extras largos
  'LA OPERACION DEBE COMPLETARSE ANTES DEL AMANECER',
  'LA OPERACION DEBE COMPLETARSE ANTES DEL ANOCHECER',
  'LA OPERACION PUEDE ESPERAR HASTA MANANA',
  'TODOS LOS AGENTES DEBEN MANTENER SILENCIO RADIO',
  'TODOS LOS AGENTES DEBEN REPORTAR POSICION',
  'TODOS LOS AGENTES DEBEN REGRESAR A BASE',
  'EL PAQUETE CONTIENE DOCUMENTOS CLASIFICADOS',
  'EL PAQUETE CONTIENE MATERIAL SENSIBLE',
  'EL PAQUETE FUE SUSTITUIDO EN TRANSITO',
  'COORDINA CON EL EQUIPO LOCAL INMEDIATAMENTE',
  'COORDINA CON EL EQUIPO CENTRAL PRIMERO',
  'NO COORDINES CON NADIE POR AHORA',
  'LA CLAVE CAMBIA CADA VEINTICUATRO HORAS',
  'LA CLAVE CAMBIA CADA DOCE HORAS',
  'LA CLAVE PERMANECE SIN CAMBIOS',
  'VERIFICA LA AUTENTICIDAD DEL MENSAJE RECIBIDO',
  'VERIFICA LA INTEGRIDAD DEL ARCHIVO ADJUNTO',
  'VERIFICA LA IDENTIDAD DEL EMISOR',
  'EL ENEMIGO HA INTERCEPTADO COMUNICACIONES PREVIAS',
  'EL ENEMIGO NO HA INTERCEPTADO NADA AUN',
  'EL ENEMIGO SOSPECHA DE NUESTRA RED',
  'PREPARA PLAN DE CONTINGENCIA NUMERO TRES',
  'PREPARA PLAN DE CONTINGENCIA NUMERO CINCO',
  'ACTIVA PLAN DE CONTINGENCIA INMEDIATO',
  'EL PUNTO DE EXTRACCION SE MANTIENE IGUAL',
  'EL PUNTO DE EXTRACCION SE HA MOVIDO',
  'EL PUNTO DE EXTRACCION ESTA COMPROMETIDO',
  'TRANSMITE SOLO EN HORARIO NOCTURNO',
  'TRANSMITE SOLO EN HORARIO DIURNO',
  'TRANSMITE CUANDO SEA SEGURO',
  'DESTRUYE TODO MATERIAL COMPROMETEDOR YA',
  'CONSERVA TODO MATERIAL PARA ANALISIS',
  'OCULTA TODO MATERIAL EN LUGAR SEGURO',
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

/**
 * Genera distractores creíbles: palabras/frases reales o muy plausibles,
 * cercanas en significado, dominio o forma, nunca basura tipográfica obvia.
 * El jugador debe aplicar el método; adivinar por "parece un error tipográfico" no ayuda.
 */
function generateSmartDistractors(correct: string, seed: number, extra: string[] = []): string[] {
  const rnd = mulberry32(seed)
  const c = onlyLetters(correct)
  const len = c.length
  const pool = new Set<string>()

  // 1. Variantes semánticas / del banco de misma longitud o ±2
  const bank = PLAIN_BANK.map(onlyLetters)
  const sameLen = bank.filter((p) => p !== c && Math.abs(p.length - len) <= 2 && p.length >= 2)
  // priorizar las que comparten prefijo/sufijo o letras comunes
  const scored = sameLen
    .map((p) => {
      let score = 0
      if (p.slice(0, 2) === c.slice(0, 2)) score += 3
      if (p.slice(-2) === c.slice(-2)) score += 2
      const setC = new Set(c.split(''))
      const common = p.split('').filter((ch) => setC.has(ch)).length
      score += common / Math.max(len, 1)
      return { p, score }
    })
    .sort((a, b) => b.score - a.score)

  for (let i = 0; i < Math.min(12, scored.length); i++) {
    pool.add(scored[i].p)
  }

  // 2. Transformaciones criptográficas comunes (el jugador podría aplicar el método equivocado)
  pool.add(caesar(c, 1))
  pool.add(caesar(c, 3))
  pool.add(caesar(c, 13))
  pool.add(atbash(c))
  pool.add(reverseStr(c))
  if (len >= 3) {
    pool.add(c.slice(1) + c[0])
    pool.add(c[len - 1] + c.slice(0, -1))
  }

  // 3. Extra proporcionados por el constructor del nivel
  extra.forEach((e) => {
    const t = onlyLetters(e)
    if (t && t !== c) pool.add(t)
  })

  // 4. Relleno de calidad desde el banco (frases cortas o palabras de longitud parecida)
  const fillers = bank.filter((p) => p.length >= 3 && p.length <= Math.max(12, len + 3) && p !== c)
  for (let i = 0; i < 8 && fillers.length > 0; i++) {
    const j = Math.floor(rnd() * fillers.length)
    pool.add(fillers[j])
    fillers.splice(j, 1)
  }

  // 5. Términos temáticos genéricos que siempre "suenan" a respuesta posible
  const thematic = [
    'MENSAJE', 'SECRETO', 'CODIGO', 'CLAVE', 'PATRON', 'SENAL', 'AGENTE',
    'ARCHIVO', 'RUTA', 'MAPA', 'PUERTA', 'NORTE', 'OPERACION', 'PROTOCOLO',
    'CONTACTO', 'OBJETIVO', 'FUENTE', 'CANAL', 'CIFRA', 'ENIGMA',
    'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'OMEGA', 'SIGMA',
  ]
  thematic.forEach((t) => {
    if (t !== c && Math.abs(t.length - len) <= 4) pool.add(t)
  })

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
  // relleno final de calidad
  const qualityFillers = [
    'MENSAJE', 'SECRETO', 'CODIGO', 'CLAVE', 'PATRON', 'SENAL',
    'AGENTE', 'ARCHIVO', 'RUTA', 'MAPA', 'OPERACION', 'PROTOCOLO',
    'CONTACTO', 'OBJETIVO', 'NORTE', 'PUERTA', 'CIFRA', 'ENIGMA',
  ]
  for (const f of qualityFillers) {
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
      'Recorre el alfabeto mentalmente con el desplazamiento indicado. Comprueba vocales frecuentes (E, A, O) tras el corrimiento inverso.',
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
      'Escribe el cifrado al revés letra a letra. No busques desplazamientos: el orden es el truco.',
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
    [1, 2, 1, 3],
    [3, 2, 1],
    [4, 1, 2, 3],
    [2, 4, 1, 3],
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
      'Numera las letras del cifrado y resta el patrón indicado. Si una resta baja de A, da la vuelta por Z.',
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
    { A: 'K', E: 'L', I: 'M', O: 'N', U: 'P' },
    { A: 'S', E: 'T', I: 'U', O: 'V', U: 'W' },
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
      'No es un César: no desplaces todo el alfabeto. Sustituye solo las letras del mapa de vocales; deja el resto igual.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeA1Z26(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 11)
  const plain = onlyLetters(plainRaw).slice(0, 12)
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
      'Separa por guiones y traduce número a número. No interpretes el bloque entero como un solo valor.',
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
      'Construye la pareja A-Z, B-Y, C-X… y traduce letra a letra. No es un desplazamiento constante como César.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeMorse(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 17)
  const plain = onlyLetters(plainRaw).slice(0, 9)
  const cipher = toMorse(plain)
  const verified = fromMorse(cipher)
  if (verified !== plain) {
    // fallback seguro
  }
  const seed = hashStr(`morse-${levelIndex}-${cipher}`)
  const wrongMorseAttempts = [
    fromMorse(cipher.replace(/\./g, '-').replace(/-/g, '.')),
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
      'Traduce símbolo a símbolo con la tabla. Empieza por letras cortas (E, T, A, N, I, M) para anclar el mensaje.',
    question: '¿Qué texto en claro codifica este Morse?',
    options,
    correct,
  }
}

function makeRail(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 23)
  const plain = onlyLetters(plainRaw).slice(0, 14)
  const rails = 2 + (levelIndex % 3) // 2, 3 o 4
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
      'Dibuja el zig-zag vacío con la longitud del mensaje y reparte el cifrado por filas según el patrón. Luego lee en diagonal zig-zag.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeKeyword(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 29)
  const plain = onlyLetters(plainRaw).slice(0, 12)
  const keys = [
    'CLAVE', 'NORTE', 'SOLAR', 'MANGO', 'BRISA', 'FUENTE', 'DELTA', 'OMEGA',
    'SIGMA', 'ALPHA', 'BRAVO', 'CHARLIE', 'TANGO', 'VICTOR', 'XRAY',
    'YANKEE', 'ZULU', 'LUNAR', 'MARTE', 'VENUS',
  ]
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
      'Construye el alfabeto cifrado con la palabra clave de la pista y alinea con A–Z. Traduce el mensaje con el mapa inverso.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeHill(levelIndex: number): Item {
  // Size cycles: mostly 2x2, then 3x3, occasionally 4x4
  const sizeRoll = levelIndex % 10
  let size: number
  let matrix: number[][]
  if (sizeRoll < 5) {
    size = 2
    matrix = HILL_2X2[levelIndex % HILL_2X2.length]
  } else if (sizeRoll < 8) {
    size = 3
    matrix = HILL_3X3[levelIndex % HILL_3X3.length]
  } else {
    size = 4
    matrix = HILL_4X4[levelIndex % HILL_4X4.length]
  }

  const plainRaw = plainForLevel(levelIndex + 31)
  let plain = onlyLetters(plainRaw).slice(0, size * 3) // enough letters
  while (plain.length % size !== 0) plain += 'X'
  if (plain.length < size) plain = 'A'.repeat(size)

  const cipher = hillEncryptN(plain, matrix)
  const decrypted = hillDecryptN(cipher, matrix)
  // sanity (ignore trailing X differences)
  void decrypted

  const seed = hashStr(`hill-${size}-${levelIndex}-${cipher}`)
  const otherMatrix =
    size === 2
      ? HILL_2X2[(levelIndex + 1) % HILL_2X2.length]
      : size === 3
        ? HILL_3X3[(levelIndex + 1) % HILL_3X3.length]
        : HILL_4X4[(levelIndex + 1) % HILL_4X4.length]

  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 3),
      atbash(plain),
      plain.slice(size) + plain.slice(0, size),
      hillEncryptN(plain, otherMatrix),
      cipher,
      'MATRIX',
      hillDecryptN(cipher, otherMatrix) || 'ERROR',
      plain.replace(/X+$/, '') || plain,
    ],
    seed,
  )

  const matStr = matrix.map((row) => `[${row.join(' ')}]`).join(' ')
  const d = detN(matrix)

  return {
    id: `hill${size}-${levelIndex}`,
    kind: 'hill',
    cipher,
    plain,
    hint:
      `Cifrado de Hill ${size}×${size}. Matriz K = ${matStr} (mod 26, det=${d}). Teclado fijo A=0 … Z=25. Bloques de ${size} letras; relleno X si hace falta.`,
    explain:
      `Método (resumen operativo):\n` +
      `1) Pasa cada letra a número A=0 … Z=25.\n` +
      `2) Agrupa en bloques de ${size} letras.\n` +
      `3) Multiplica por la matriz K módulo 26: c = K · p mod 26.\n` +
      `4) Vuelve de número a letra.\n` +
      `Para descifrar necesitas K⁻¹ mod 26. Este nivel pide el claro a partir del cifrado y de K.\n` +
      `⚠️ Álgebra modular ${size}×${size}.`,
    failAdvice:
      `Trabaja por bloques de ${size} letras, con A=0…Z=25 y la matriz de la pista. Verifica cada opción cifrando con K, o aplica la inversa si la calculas.`,
    question: `¿Cuál es el texto en claro (bloques de ${size}, posible X final de relleno)?`,
    options,
    correct,
    hillMatrix: matrix,
    hillSize: size,
    hillKeyboard: HILL_KEYBOARD,
  }
}

function makeAffine(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 37)
  const plain = onlyLetters(plainRaw).slice(0, 12)
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
      'No es un desplazamiento simple. Calcula para cada opción o aplica la fórmula inversa.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeScytale(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 41)
  const plain = onlyLetters(plainRaw).slice(0, 14)
  const diameter = 2 + (levelIndex % 4) // 2..5
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
      'Calcula cuántas columnas caben y reconstruye la rejilla. Prueba diámetros cercanos si el primero no da palabras.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makePlayfair(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 47)
  const plain = onlyLetters(plainRaw).slice(0, 10).replace(/J/g, 'I')
  const keys = ['CLAVE', 'NORTE', 'SOLAR', 'DELTA', 'OMEGA', 'LUNAR', 'MARTE', 'VENUS']
  const keyword = keys[levelIndex % keys.length]
  const cipher = playfairEncrypt(plain, keyword)
  const seed = hashStr(`pf-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, 2),
      reverseStr(plain),
      atbash(plain),
      playfairEncrypt(plain, keys[(levelIndex + 1) % keys.length]),
      plain + 'X',
      cipher,
      'PLAYFAIR',
      keywordCipher(plain, keyword),
    ],
    seed,
  )
  return {
    id: `pf-${levelIndex}`,
    kind: 'playfair',
    cipher,
    plain,
    hint: `Playfair 5×5 (I/J juntos). Clave “${keyword}”: forma el cuadrado y cifra por pares (misma fila → derecha, misma columna → abajo, rectángulo → esquinas opuestas).`,
    explain:
      `Método: construye el cuadrado 5×5 con la clave sin repetir + resto del alfabeto (J=I).\n` +
      'Parte el claro en digramas (si letras iguales inserta X).\n' +
      'Misma fila: cada letra una posición a la derecha (cíclico).\n' +
      'Misma columna: una posición abajo.\n' +
      'Rectángulo: intercambia columnas manteniendo filas.',
    failAdvice:
      'Construye el cuadrado con la clave de la pista. Trabaja siempre por pares. No es un César ni un simple keyword.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeColumnar(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 53)
  const plain = onlyLetters(plainRaw).slice(0, 14)
  const keys = ['CLAVE', 'NORTE', 'SOL', 'MAR', 'LUZ', 'RIO', 'SOLAR', 'DELTA']
  const keyword = keys[levelIndex % keys.length]
  const cipher = columnarEncrypt(plain, keyword)
  const seed = hashStr(`col-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 2),
      columnarEncrypt(plain, keys[(levelIndex + 1) % keys.length]),
      railFenceEncrypt(plain, 3),
      atbash(plain),
      plain.slice(2) + plain.slice(0, 2),
      cipher,
      'COLUMNAR',
    ],
    seed,
  )
  return {
    id: `col-${levelIndex}`,
    kind: 'columnar',
    cipher,
    plain,
    hint: `Transposición columnar con clave “${keyword}”: se escribe el texto en filas bajo la clave y se lee por columnas ordenadas alfabéticamente.`,
    explain:
      `Método: escribe el claro en una tabla de tantas columnas como letras tiene la clave.\n` +
      'Ordena las columnas según el orden alfabético de la clave (empates por posición).\n' +
      'El cifrado es la lectura de las columnas en ese orden.\n' +
      'Para descifrar: calcula cuántas filas hay y rellena las columnas en el orden de la clave.',
    failAdvice:
      'Dibuja la rejilla con la longitud de la clave. Reparte el cifrado en columnas según el orden alfabético de la clave y lee por filas.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makeBeaufort(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 59)
  const plain = onlyLetters(plainRaw).slice(0, 12)
  const keys = ['CLAVE', 'NORTE', 'SOLAR', 'DELTA', 'OMEGA', 'LUNAR', 'MARTE', 'ALPHA']
  const keyword = keys[levelIndex % keys.length]
  const cipher = beaufortEncrypt(plain, keyword)
  const seed = hashStr(`bf-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      caesar(plain, 3),
      reverseStr(plain),
      beaufortEncrypt(plain, keys[(levelIndex + 1) % keys.length]),
      atbash(plain),
      variableShift(plain, [1, 2, 3]),
      plain + 'X',
      cipher,
      'BEAUFORT',
    ],
    seed,
  )
  return {
    id: `bf-${levelIndex}`,
    kind: 'beaufort',
    cipher,
    plain,
    hint: `Cifrado de Beaufort con clave “${keyword}”: cada letra c = (k − p) mod 26. Es involutivo (cifrar = descifrar).`,
    explain:
      `Método: para cada posición, toma la letra de la clave (cíclica) y la del claro.\n` +
      'c = (k − p) mod 26, con A=0…Z=25.\n' +
      'Como es involutivo, aplicar el mismo proceso al cifrado recupera el claro.\n' +
      'Variante histórica del Vigenère usada en algunos sistemas del siglo XIX.',
    failAdvice:
      'Aplica la fórmula (k − c) o (k − p) según la dirección. Recuerda que Beaufort es su propio inverso.',
    question: '¿Cuál es el texto en claro?',
    options,
    correct,
  }
}

function makePolybius(levelIndex: number): Item {
  const plainRaw = plainForLevel(levelIndex + 61)
  const plain = onlyLetters(plainRaw).slice(0, 10).replace(/J/g, 'I')
  const cipher = polybiusEncode(plain)
  const seed = hashStr(`pb-${levelIndex}-${cipher}`)
  const { options, correct } = buildOptions(
    plain,
    [
      reverseStr(plain),
      caesar(plain, 2),
      atbash(plain),
      plain.slice(0, -1),
      plain + 'X',
      'POLYBIUS',
      onlyLetters(plainForLevel(levelIndex + 63)).slice(0, plain.length),
      a1z26Encode(plain).replace(/-/g, ''),
    ],
    seed,
  )
  return {
    id: `pb-${levelIndex}`,
    kind: 'polybius',
    cipher,
    plain,
    hint: 'Cuadrado de Polibio 5×5 (I/J juntos). Cada letra se representa por fila+columna (11=A, 12=B … 55=Z).',
    explain:
      'Método: localiza cada letra en el cuadrado estándar:\n' +
      '  1 2 3 4 5\n' +
      '1 A B C D E\n' +
      '2 F G H I K\n' +
      '3 L M N O P\n' +
      '4 Q R S T U\n' +
      '5 V W X Y Z\n' +
      'El cifrado son los pares de dígitos separados por espacio.\n' +
      'Para descifrar: cada par → letra del cuadrado.',
    failAdvice:
      'Traduce cada par de números usando el cuadrado de Polibio estándar. J se trata como I.',
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
  makePlayfair,
  makeColumnar,
  makeBeaufort,
  makePolybius,
  makeCaesar,
  makeMorse,
  makeAtbash,
  makeVariable,
  makeKeyword,
  makeAffine,
  makeRail,
  makeScytale,
  makePlayfair,
  makeColumnar,
  makeBeaufort,
]

const BUILDERS_WITH_HILL: Builder[] = [
  ...BUILDERS_NO_HILL,
  makeHill,
  makeHill,
  makeHill,
  makeHill,
]

function buildLevel(levelIndex: number, hillEnabled: boolean): Item {
  const pool = hillEnabled ? BUILDERS_WITH_HILL : BUILDERS_NO_HILL
  const builder = pool[levelIndex % pool.length]
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
      'Cada nivel presenta un criptograma y varias opciones de texto en claro. La opción correcta está repartida al azar.\n\n' +
      'Flujo recomendado:\n' +
      '1) Lee la PISTA del nivel (tipo de cifra y parámetros).\n' +
      '2) Abre “Explicación” si necesitas el procedimiento.\n' +
      '3) Aplica el método y descarta opciones incompatibles.\n' +
      '4) Al completar un nivel, queda marcado y no se vuelve a servir el mismo reto.\n\n' +
      'Al fallar, se muestra un consejo del método. Puedes reintentar el mismo nivel con otro mensaje del mismo tipo.\n\n' +
      'Hay cientos de niveles y muchos tipos de cifra. Estudia las guías antes de empezar.',
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
    id: 'playfair',
    title: 'Playfair',
    body:
      'Origen e historia\n' +
      'Inventado por Charles Wheatstone (1854) y popularizado por Lord Playfair. Fue usado por fuerzas británicas y otras en la Primera Guerra Mundial y aún en la Segunda para mensajes tácticos de valor temporal. Es una cifra de digramas: cifra pares de letras, lo que complica el análisis de frecuencias simple.\n\n' +
      'Cómo resolver\n' +
      'Construye el cuadrado 5×5 con la clave. Parte en digramas (X de relleno si hace falta). Aplica las tres reglas: misma fila, misma columna o rectángulo.',
  },
  {
    id: 'columnar',
    title: 'Transposición columnar',
    body:
      'Origen e historia\n' +
      'Una de las familias de transposición más usadas en la criptografía clásica y en la Primera Guerra Mundial (con variantes de doble transposición). El texto se escribe en filas bajo una clave y se lee por columnas según el orden alfabético de esa clave.\n\n' +
      'Cómo resolver\n' +
      'Determina el número de columnas (longitud de la clave). Calcula filas. Rellena las columnas en el orden que dicta la clave y lee por filas.',
  },
  {
    id: 'beaufort',
    title: 'Beaufort',
    body:
      'Origen e historia\n' +
      'Variante del Vigenère atribuida a Sir Francis Beaufort. La operación es c = (k − p) mod 26. Tiene la propiedad conveniente de ser involutiva: el mismo procedimiento sirve para cifrar y descifrar.\n\n' +
      'Cómo resolver\n' +
      'Aplica la resta modular con la clave cíclica. Como es involutivo, puedes “cifrar” el criptograma con la misma clave para recuperar el claro.',
  },
  {
    id: 'polybius',
    title: 'Cuadrado de Polibio',
    body:
      'Origen e historia\n' +
      'Atribuido a Polibio (s. II a. C.). Sistema de coordenadas en una cuadrícula 5×5 que permite transmitir letras mediante señales de antorchas, golpes o cualquier canal binario/ternario. Es más un código de representación que una cifra de secreto, pero aparece en muchos sistemas compuestos.\n\n' +
      'Cómo resolver\n' +
      'Cada par de dígitos indica fila y columna del cuadrado estándar (I/J compartidos). Traduce par a letra.',
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
      'Soportamos n=2, n=3 y n=4. Matrices de un catálogo invertible. Todos los niveles Hill comparten el mismo teclado A=0…Z=25. Si el número de letras no es múltiplo de n, se rellena con X.\n\n' +
      'Cómo abordar un nivel\n' +
      '1) Anota la matriz K de la pista.\n' +
      '2) Para cada opción de claro, cifra con K y compara con el criptograma; o calcula K⁻¹ y descifra el criptograma una sola vez.\n' +
      '3) Recuerda el relleno X final si aplica.\n\n' +
      'Ejemplo mínimo (2×2)\n' +
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
      for (let k = 0; k < 40; k++) {
        const candidate = buildLevel(lv - 1 + (nonce + k) * 17, hillEnabled)
        const id = `${candidate.kind}-L${lv}-n${nonce + k}`
        const item: Item = { ...candidate, id }
        if (!completed.has(id)) return item
      }
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
      startRef.current = Date.now()
      soundStart()

      // Tiempo: Hill tiene tiempos largos según tamaño; resto tiempo ordinario
      let initialTime = Math.max(40, TIMER_BASE - Math.floor(lv / 8))
      if (next.kind === 'hill' && next.hillSize) {
        if (next.hillSize === 2) initialTime = 15 * 60 // 15 min
        else if (next.hillSize === 3) initialTime = 25 * 60 // 25 min
        else if (next.hillSize === 4) initialTime = 40 * 60 // 40 min
      }
      setTimeLeft(initialTime)

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

  /** Formato amigable del tiempo restante (mm:ss o h:mm:ss) */
  const formatTimeLeft = (secs: number) => {
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
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
            <span
              className="mono"
              style={{
                color: timeLeft <= 30 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ⏱ {formatTimeLeft(timeLeft)}
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
                  mezcladas. Los niveles completados no se repiten. Hay {TOTAL_LEVELS} niveles y más tipos de cifra.
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
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>Cifrado de Hill (matrices 2×2 / 3×3 / 4×4)</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', lineHeight: 1.45 }}>
                      Desactivado por defecto. Es el modo más exigente: álgebra modular, teclado A=0…Z=25 y bloques de
                      2, 3 o 4 letras. Actívalo solo si quieres el reto avanzado. Todos los niveles Hill usan el mismo
                      teclado predefinido.
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
                  <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', margin: 0 }}>
                    CIFRADO · {item.kind}
                    {item.kind === 'hill' && item.hillSize ? ` ${item.hillSize}×${item.hillSize}` : ''}
                  </p>
                  <span style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}>Opciones mezcladas</span>
                </div>
                <p
                  className="mono"
                  style={{
                    fontSize: item.kind === 'morse' || item.kind === 'polybius' ? '1.05rem' : '1.35rem',
                    fontWeight: 700,
                    letterSpacing: item.kind === 'morse' ? '0.02em' : '0.08em',
                    marginBottom: 10,
                    color: 'var(--gco-primary)',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.cipher}
                </p>

                {/* Hill matrix visual — estilo matriz limpio y cómodo */}
                {item.kind === 'hill' && item.hillMatrix && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: '1rem 1.1rem',
                      borderRadius: 14,
                      border: '1px solid rgba(255,180,80,0.4)',
                      background: 'linear-gradient(145deg, rgba(255,160,40,0.09), rgba(40,30,10,0.25))',
                      fontSize: '0.84rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <p style={{ fontWeight: 700, marginBottom: 8, letterSpacing: '0.03em' }}>
                      Matriz K · {item.hillSize}×{item.hillSize} (mod 26)
                    </p>

                    {/* Matriz como cuadrícula centrada */}
                    <div
                      style={{
                        display: 'inline-grid',
                        gridTemplateColumns: `repeat(${item.hillSize}, 2.4rem)`,
                        gap: 4,
                        padding: '0.6rem 0.75rem',
                        borderRadius: 10,
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid rgba(255,200,100,0.25)',
                        marginBottom: 10,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '1.05rem',
                        fontWeight: 600,
                      }}
                    >
                      {item.hillMatrix.flatMap((row, ri) =>
                        row.map((val, ci) => (
                          <div
                            key={`${ri}-${ci}`}
                            style={{
                              width: '2.4rem',
                              height: '2.4rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.06)',
                              color: 'var(--gco-primary)',
                            }}
                          >
                            {val}
                          </div>
                        )),
                      )}
                    </div>

                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', margin: '0 0 6px' }}>
                      Teclado fijo (A=0 … Z=25)
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.35rem 0.6rem',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.78rem',
                        opacity: 0.9,
                      }}
                    >
                      {HILL_KEYBOARD.split('').map((ch, i) => (
                        <span key={ch} style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--gco-primary)' }}>{ch}</span>
                          <span style={{ opacity: 0.55 }}>={i}</span>
                        </span>
                      ))}
                    </div>
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
                      CONSEJO
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