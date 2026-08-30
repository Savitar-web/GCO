import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  soundMatch,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'palabras'
const TOTAL_LEVELS = 140

type SubMode = 'anagrama' | 'oculto' | 'crucigrama' | 'sopa' | 'constelacion'

/** Diccionario ES ampliado (solo minúsculas, con tildes donde aplica) */
const DICT = [
  'a','al','el','la','lo','de','en','es','un','una','se','no','si','ya','me','te','le','mi','tu','su',
  'sol','los','las','sal','ola','ala','aro','mar','rio','oir','luz','dia','red','dar','ver','ser',
  'mas','mas','oso','osa','oro','hoy','hay','vez','voz','paz','pie','tio','tia','mes','ano',
  'amor','roma','ramo','omar','mora','rosa','aros','soar','osar','raso','masa','amas','casa','saca',
  'mesa','ames','rama','armar','hola','halo','pato','topo','tapa','neto','tono','noto','libro','abril',
  'loro','rol','bol','verde','deber','breve','mundo','mudo','nudo','don','tiempo','tempo','mite','tipo',
  'mito','noche','hecho','eco','che','agua','fuego','feo','tierra','retira','tira','reta','ria','tea',
  'ira','aire','eria','luna','nube','buen','une','flor','campo','pacto','capa','puerta','pauta','pura',
  'ruta','ventana','venta','nave','silla','pensar','pares','pena','sera','color','cloro','loco','blanco',
  'banco','clan','negro','rojo','ojo','azul','arte','trea','frase','sera','fase','verbo','plato','talo',
  'vaso','taza','papel','pale','tren','barco','cobra','cabo','arco','coche','valor','volar','odio','oido',
  'calma','clama','furia','datos','codigo','digo','ley','poder','pedro','clima','lima','calor','coral',
  'frio','foro','nieve','viene','hielo','helio','amigo','mago','padre','pared','madre','viaje','java',
  'avion','novia','vino','camino','mina','puente','punta','torre','retro','museo','parque','salud','dolor',
  'lord','miedo','medio','alegria','razon','prueba','pista','caso','idea','logica','verdad','error','clave',
  'cifra','patron','enigma','secreto','deducir','inferir','premisa','falacia','metodo','sistema','archivo',
  'lectura','cultura','idioma','escuela','maestro','alumno','familia','trabajo','dinero','precio','sociedad',
  'justicia','libertad','energia','fuerza','numero','letra','palabra','sujeto','objeto','historia','ciencia',
  'musica','ritmo','cancion','corazon','cerebro','planeta','estrella','bosque','arbol','hoja','jardin',
  'ciudad','pueblo','casa','puerta','mesa','silla','libro','pagina','pensar','memoria','espacio','sombra',
  'amarillo','naranja','morado','gris','perro','gato','pan','miel','leche','queso','fruta','carne','arroz',
  'pasta','sopa','jugo','mano','pie','ojo','boca','nariz','cara','pelo','brazo','pierna','dedo','diente',
  'norte','sur','este','oeste','arriba','abajo','dentro','fuera','cerca','lejos','antes','despues',
  'uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','cien','mil',
  'ser','estar','haber','tener','hacer','poder','decir','ir','ver','dar','saber','querer','llegar','pasar',
  'deber','poner','parecer','quedar','creer','hablar','llevar','dejar','seguir','encontrar','llamar','venir',
  'pensar','salir','volver','tomar','conocer','vivir','sentir','tratar','mirar','contar','empezar','esperar',
  'buscar','existir','entrar','trabajar','escribir','perder','producir','ocurrir','entender','pedir','recibir',
  'recordar','terminar','permitir','aparecer','conseguir','comenzar','servir','sacar','necesitar','mantener',
  'resultar','leer','caer','cambiar','presentar','crear','abrir','considerar','oir','acabar','convertir',
  'ganar','formar','traer','partir','morir','aceptar','realizar','suponer','comprender','lograr','explicar',
  'preguntar','tocar','reconocer','estudiar','alcanzar','nacer','dirigir','correr','utilizar','pagar','ayudar',
  'gustar','jugar','escuchar','cumplir','ofrecer','descubrir','levantar','intentar','usar','valer',
  'sol','mar','luz','paz','voz','rey','ley','fin','mes','año','día','ola','ala','aro','rio','red',
  'sol','sal','sol','los','sol','ola','sol','los',
]

const ACUTE: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú',
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
}

function strip(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
}

function canForm(word: string, letters: string): boolean {
  const avail = strip(letters).split('').sort()
  const need = strip(word).split('').sort()
  if (need.length > avail.length) return false
  let i = 0
  let j = 0
  while (i < need.length && j < avail.length) {
    if (need[i] === avail[j]) {
      i++
      j++
    } else if (need[i] > avail[j]) j++
    else return false
  }
  return i === need.length
}

/** Todas las palabras del diccionario formables con el multiset de letras */
function allWordsFromLetters(letters: string): string[] {
  const found = new Set<string>()
  for (const raw of DICT) {
    if (raw.length < 2) continue
    if (canForm(raw, letters)) found.add(raw.toLowerCase())
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b, 'es'))
}

/** Sets de letras (mayúsculas) — cada nivel usa uno (revuelto) */
const LETTER_SETS = [
  'ROSAM', 'HOLA', 'SOLAR', 'MARTE', 'LIBRO', 'CASAS', 'VERDE', 'MUNDO', 'NOCHE', 'PLATO',
  'RITMO', 'CAMINO', 'PUENTE', 'AMOR', 'DATOS', 'LETRA', 'FRASE', 'VALOR', 'TORRE', 'MUSEO',
  'SALUD', 'PODER', 'CLIMA', 'NIEVE', 'RAZON', 'PISTA', 'CASO', 'IDEA', 'MESA', 'SILLA',
  'PAPEL', 'TREN', 'AVION', 'BARCO', 'COCHE', 'AMIGO', 'PADRE', 'MADRE', 'CALOR', 'FRIO',
  'LUZ', 'SOL', 'LUNA', 'MAR', 'RIO', 'FLOR', 'HOJA', 'ARBOL', 'CAMPO', 'FUEGO',
  'TIERRA', 'AIRE', 'AGUA', 'COLOR', 'BLANCO', 'NEGRO', 'ROJO', 'AZUL', 'ARTE', 'VERBO',
  'VASO', 'TAZA', 'LEY', 'BANCO', 'PRECIO', 'CULTURA', 'IDIOMA', 'ESCUELA', 'VIAJE', 'TRABAJO',
  'DINERO', 'JUSTICIA', 'ENERGIA', 'FUERZA', 'NUMERO', 'PALABRA', 'HISTORIA', 'CIENCIA', 'MUSICA', 'RITMO',
]

function shuffleStr(s: string, seed: number): string {
  const a = s.split('')
  let x = (seed || 1) >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0
    const j = x % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.join('')
}

function levelLetters(lv: number, attempt: number) {
  const base = LETTER_SETS[(lv - 1 + attempt) % LETTER_SETS.length]
  return shuffleStr(base, lv * 31 + attempt * 17)
}

const HANG = [
  { w: 'deduccion', hints: ['inferencia lógica', 'sacar conclusiones', 'razonamiento'] },
  { w: 'silogismo', hints: ['dos premisas', 'conclusión formal', 'Aristóteles'] },
  { w: 'acertijo', hints: ['enigma verbal', 'adivinanza', 'juego de ingenio'] },
  { w: 'misterio', hints: ['lo oculto', 'enigma', 'por resolver'] },
  { w: 'detective', hints: ['investiga casos', 'sigue pistas', 'resuelve'] },
  { w: 'evidencia', hints: ['prueba material', 'dato observable', 'indicio fuerte'] },
  { w: 'hipotesis', hints: ['supuesto provisional', 'a comprobar', 'conjetura'] },
  { w: 'analisis', hints: ['descomponer', 'examinar partes', 'estudio detallado'] },
  { w: 'patron', hints: ['regularidad', 'secuencia', 'forma repetida'] },
  { w: 'inferir', hints: ['deducir', 'concluir', 'partir de datos'] },
  { w: 'paradoja', hints: ['contradicción aparente', 'Zenón', 'lógica límite'] },
  { w: 'premisa', hints: ['base del argumento', 'supuesto dado', 'punto de partida'] },
  { w: 'falacia', hints: ['error argumental', 'engaño formal', 'razonamiento inválido'] },
  { w: 'algoritmo', hints: ['pasos finitos', 'método de cálculo', 'procedimiento'] },
  { w: 'memoria', hints: ['retener información', 'recuerdo', 'capacidad mental'] },
  { w: 'atencion', hints: ['foco consciente', 'concentración', 'cuidado'] },
  { w: 'razonar', hints: ['pensar con lógica', 'argumentar', 'encadenar ideas'] },
  { w: 'concepto', hints: ['idea abstracta', 'noción', 'término mental'] },
  { w: 'verdad', hints: ['lo que es el caso', 'correspondencia', 'validez'] },
  { w: 'enigma', hints: ['misterio cifrado', 'puzzle', 'secreto'] },
]

type Dir = { dr: number; dc: number }
const DIRS: Dir[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: -1, dc: -1 },
]

/**
 * Coloca TODAS las palabras objetivo en la rejilla.
 * Devuelve grid de letras (minúsculas) o null si no cabe (raro con size suficiente).
 */
function placeAllWords(words: string[], size: number, seed: number): string[][] | null {
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  )
  const sorted = [...words].map(strip).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length)

  const tryPlace = (word: string, row: number, col: number, dir: Dir): boolean => {
    const cells: { r: number; c: number }[] = []
    for (let i = 0; i < word.length; i++) {
      const r = row + dir.dr * i
      const c = col + dir.dc * i
      if (r < 0 || c < 0 || r >= size || c >= size) return false
      const cur = grid[r][c]
      if (cur !== null && cur !== word[i]) return false
      cells.push({ r, c })
    }
    for (let i = 0; i < word.length; i++) {
      grid[cells[i].r][cells[i].c] = word[i]
    }
    return true
  }

  let rng = seed >>> 0
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng
  }

  for (const word of sorted) {
    let placed = false
    const maxTries = size * size * DIRS.length * 3
    for (let t = 0; t < maxTries && !placed; t++) {
      const dir = DIRS[next() % DIRS.length]
      const row = next() % size
      const col = next() % size
      if (tryPlace(word, row, col, dir)) placed = true
    }
    if (!placed) {
      // forzar horizontal en primera fila libre
      for (let row = 0; row < size && !placed; row++) {
        for (let col = 0; col <= size - word.length; col++) {
          if (tryPlace(word, row, col, DIRS[0])) {
            placed = true
            break
          }
        }
      }
    }
    if (!placed) return null
  }

  const alpha = 'abcdefghijklmnñopqrstuvwxyz'
  const out: string[][] = grid.map((row, r) =>
    row.map((ch, c) => {
      if (ch) return ch
      return alpha[(r * 11 + c * 7 + seed) % alpha.length]
    }),
  )
  return out
}

/** Crucigrama: celdas '#' bloqueadas; letras solo donde hay palabras cruzadas */
function buildCrosswordStructure(
  words: string[],
  size: number,
  seed: number,
): { grid: string[][]; slots: { word: string; cells: { r: number; c: number }[] }[] } {
  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => '#'),
  )
  const slots: { word: string; cells: { r: number; c: number }[] }[] = []
  const sorted = [...words]
    .map((w) => ({ raw: w, key: strip(w) }))
    .filter((w) => w.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length)

  let rng = seed >>> 0
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng
  }

  const canPut = (key: string, row: number, col: number, horiz: boolean) => {
    const cells: { r: number; c: number }[] = []
    for (let i = 0; i < key.length; i++) {
      const r = horiz ? row : row + i
      const c = horiz ? col + i : col
      if (r < 0 || c < 0 || r >= size || c >= size) return null
      const cur = grid[r][c]
      if (cur !== '#' && cur !== key[i]) return null
      cells.push({ r, c })
    }
    return cells
  }

  for (const { raw, key } of sorted) {
    let placed = false
    for (let t = 0; t < 80 && !placed; t++) {
      const horiz = next() % 2 === 0
      const row = next() % size
      const col = next() % size
      const cells = canPut(key, row, col, horiz)
      if (!cells) continue
      for (let i = 0; i < key.length; i++) {
        grid[cells[i].r][cells[i].c] = key[i]
      }
      slots.push({ word: raw, cells })
      placed = true
    }
  }
  return { grid, slots }
}

export function PalabrasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel],
  )
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))

  const [sub, setSub] = useState<SubMode>('anagrama')
  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(90)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const [rawLetters, setRawLetters] = useState('')
  const [targetWords, setTargetWords] = useState<string[]>([])
  const [foundWords, setFoundWords] = useState<string[]>([])

  // anagrama
  const [pool, setPool] = useState<string[]>([])
  const [slot, setSlot] = useState<(string | null)[]>([])

  // oculto
  const [secret, setSecret] = useState('')
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [fails, setFails] = useState(0)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [hintText, setHintText] = useState<string[]>([])
  const maxFails = 7

  // grids
  const [grid, setGrid] = useState<string[][]>([])
  const [gridMarks, setGridMarks] = useState<boolean[][]>([])
  const [cwSlots, setCwSlots] = useState<{ word: string; cells: { r: number; c: number }[] }[]>([])
  const [selection, setSelection] = useState<{ r: number; c: number }[]>([])
  const selectingRef = useRef(false)

  // constelación
  const [constelNodes, setConstelNodes] = useState<{ id: number; ch: string; x: number; y: number }[]>([])
  const [path, setPath] = useState<number[]>([])
  const pathDragging = useRef(false)

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const finishFail = useCallback(() => {
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
  }, [])

  const finishSuccess = useCallback(() => {
    clearTimers()
    setIsCorrect(true)
    setPhase('result')
    soundSuccess()
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level: levelRef.current,
      success: true,
      timeMs: Date.now() - startRef.current,
    })
  }, [])

  const startTimer = (secs: number) => {
    clearTimers()
    setTimeLeft(secs)
    startRef.current = Date.now()
    if (!useTimer) return
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          finishFail()
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  const buildTargets = (letters: string) => {
    // Solo palabras realmente formables; mínimo 2 letras; cap para jugabilidad
    const words = allWordsFromLetters(letters).filter((w) => strip(w).length >= 2)
    // Si hay demasiadas, quedarnos con las más largas + un sample de cortas
    if (words.length <= 12) return words
    const long = words.filter((w) => strip(w).length >= 4)
    const short = words.filter((w) => strip(w).length < 4)
    return [...long, ...short.slice(0, Math.max(0, 12 - long.length))]
  }

  const rebuildGridForMode = (mode: SubMode, letters: string, words: string[], lv: number) => {
    setSelection([])
    setPath([])
    if (mode === 'sopa') {
      const size = Math.min(12, Math.max(6, Math.max(...words.map((w) => strip(w).length), 5) + 1))
      let g = placeAllWords(words, size, lv * 97 + attempt)
      if (!g) g = placeAllWords(words, size + 2, lv * 97 + attempt + 1)
      if (!g) {
        // fallback: grid grande
        g = placeAllWords(words, 14, lv) || Array.from({ length: 8 }, (_) =>
          Array.from({ length: 8 }, (_, c) => letters[c % letters.length]?.toLowerCase() || 'a'),
        )
      }
      setGrid(g)
      setGridMarks(g.map((row) => row.map(() => false)))
      setCwSlots([])
    } else if (mode === 'crucigrama') {
      const size = Math.min(11, Math.max(7, 6 + Math.floor(lv / 25)))
      const { grid: g, slots } = buildCrosswordStructure(words, size, lv * 53 + attempt)
      setGrid(g)
      setGridMarks(g.map((row) => row.map(() => false)))
      setCwSlots(slots)
    } else if (mode === 'constelacion') {
      const chars = strip(letters).toUpperCase().split('')
      const n = chars.length
      // Radio 34–38 % para que los nodos (18px) no salgan del círculo
      const nodes = chars.map((ch, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2
        const radius = 34
        return {
          id: i,
          ch,
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * Math.sin(angle),
        }
      })
      setConstelNodes(nodes)
      setPath([])
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0, mode: SubMode = sub) => {
      clearTimers()
      const letters = levelLetters(lv, att)
      const words = buildTargets(letters)
      setRawLetters(letters)
      setTargetWords(words)
      setFoundWords([])
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setIsCorrect(null)
      setSelection([])
      setPath([])

      const L = letters.toUpperCase().split('')
      const tokens = L.map((ch, i) => `${ch}${i}`)
      const shuffled = [...tokens]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (lv * 13 + att * 7 + i) % (i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setPool(shuffled)
      setSlot(Array(L.length).fill(null))

      const hang = HANG[(lv - 1 + att) % HANG.length]
      setSecret(hang.w)
      setGuessed(new Set())
      setFails(0)
      setHintsLeft(3)
      setHintText([])

      rebuildGridForMode(mode, letters, words, lv)
      soundStart()
      startTimer(Math.max(60, 140 - Math.floor(lv / 4)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sub, useTimer, attempt],
  )

  useEffect(() => () => clearTimers(), [])

  /** Cambiar modo DURANTE la partida: mismo nivel, mismas letras/palabras, timer sigue */
  const switchModeInPlay = (mode: SubMode) => {
    if (phase !== 'play' || isCorrect !== null) return
    soundClick()
    setSub(mode)
    setSelection([])
    setPath([])
    // rearmar pool/slot sin resetear foundWords ni timer
    const L = rawLetters.toUpperCase().split('')
    const tokens = L.map((ch, i) => `${ch}${i}`)
    setPool(tokens)
    setSlot(Array(L.length).fill(null))
    rebuildGridForMode(mode, rawLetters, targetWords, level)
  }

  const addFound = (word: string) => {
    if (foundWords.includes(word)) return
    soundMatch()
    const next = [...foundWords, word]
    setFoundWords(next)
    if (next.length >= targetWords.length && targetWords.length > 0) {
      finishSuccess()
    }
  }

  const toggleAcute = (token: string) => {
    const ch = token[0]
    if (!'aeiouáéíóúAEIOUÁÉÍÓÚ'.includes(ch)) return
    soundClick()
    setPool((p) =>
      p.map((t) => {
        if (t !== token) return t
        const c = t[0]
        const next = ACUTE[c.toLowerCase()] ?? c
        const out = c === c.toUpperCase() ? next.toUpperCase() : next
        return out + t.slice(1)
      }),
    )
  }

  const placeFromPool = (token: string) => {
    soundClick()
    const empty = slot.findIndex((s) => s === null)
    if (empty < 0) return
    setSlot((s) => {
      const n = [...s]
      n[empty] = token
      return n
    })
    setPool((p) => p.filter((t) => t !== token))
  }

  const returnToPool = (idx: number) => {
    const t = slot[idx]
    if (!t) return
    soundClick()
    setSlot((s) => {
      const n = [...s]
      n[idx] = null
      return n
    })
    setPool((p) => [...p, t])
  }

  const tryCommitWord = () => {
    const word = slot
      .filter(Boolean)
      .map((t) => t![0])
      .join('')
      .toLowerCase()
    const key = strip(word)
    const match = targetWords.find((w) => strip(w) === key)
    if (match && !foundWords.includes(match)) {
      setPool((p) => [...p, ...(slot.filter(Boolean) as string[])])
      setSlot(Array(rawLetters.length).fill(null))
      addFound(match)
    } else {
      soundFail()
    }
  }

  const shufflePool = () => {
    soundClick()
    setPool((p) => {
      const a = [...p]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    })
    setConstelNodes((nodes) => {
      if (nodes.length === 0) return nodes
      const angles = nodes.map((_, i) => (i / nodes.length) * Math.PI * 2 - Math.PI / 2)
      for (let i = angles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[angles[i], angles[j]] = [angles[j], angles[i]]
      }
      return nodes.map((n, i) => ({
        ...n,
        x: 50 + 34 * Math.cos(angles[i]),
        y: 50 + 34 * Math.sin(angles[i]),
      }))
    })
  }

  const guessLetter = (ch: string) => {
    if (guessed.has(ch) || isCorrect !== null) return
    soundClick()
    const g = new Set(guessed)
    g.add(ch)
    setGuessed(g)
    if (!strip(secret).includes(ch)) {
      const nf = fails + 1
      setFails(nf)
      if (nf >= maxFails) finishFail()
    } else if (strip(secret).split('').every((c) => g.has(c))) {
      // en modo oculto, completar la palabra secreta cuenta como victoria del nivel
      finishSuccess()
    }
  }

  const useHint = () => {
    if (hintsLeft <= 0) return
    const item = HANG[(level - 1 + attempt) % HANG.length]
    const nextHint = item.hints[3 - hintsLeft]
    if (!nextHint) return
    soundClick()
    setHintsLeft((h) => h - 1)
    setHintText((t) => [...t, nextHint])
  }

  const onCellDown = (r: number, c: number) => {
    if (grid[r]?.[c] === '#') return
    selectingRef.current = true
    soundClick()
    setSelection([{ r, c }])
  }

  const onCellEnter = (r: number, c: number) => {
    if (!selectingRef.current) return
    if (grid[r]?.[c] === '#') return
    setSelection((sel) => {
      if (sel.some((p) => p.r === r && p.c === c)) return sel
      const last = sel[sel.length - 1]
      if (!last) return [{ r, c }]
      const dr = Math.abs(last.r - r)
      const dc = Math.abs(last.c - c)
      if (dr <= 1 && dc <= 1 && dr + dc > 0) return [...sel, { r, c }]
      return sel
    })
  }

  const commitSelection = () => {
    selectingRef.current = false
    if (selection.length < 2) {
      setSelection([])
      return
    }
    const word = selection.map((p) => grid[p.r][p.c]).join('')
    const rev = word.split('').reverse().join('')
    const hit = targetWords.find((w) => strip(w) === strip(word) || strip(w) === strip(rev))
    if (hit && !foundWords.includes(hit)) {
      setGridMarks((prev) => {
        const n = prev.map((row) => [...row])
        for (const p of selection) {
          if (n[p.r]) n[p.r][p.c] = true
        }
        return n
      })
      // crucigrama: marcar slot completo si coincide
      if (sub === 'crucigrama') {
        const slot = cwSlots.find((s) => strip(s.word) === strip(hit))
        if (slot) {
          setGridMarks((prev) => {
            const n = prev.map((row) => [...row])
            for (const p of slot.cells) {
              if (n[p.r]) n[p.r][p.c] = true
            }
            return n
          })
        }
      }
      setSelection([])
      addFound(hit)
    } else {
      soundFail()
      setSelection([])
    }
  }

  useEffect(() => {
    const up = () => {
      if (selectingRef.current) commitSelection()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, targetWords, foundWords, sub, cwSlots])

  const onConstelPointer = (id: number, isDown: boolean) => {
    if (isDown) {
      pathDragging.current = true
      soundClick()
      setPath([id])
      return
    }
    if (!pathDragging.current) return
    setPath((p) => {
      if (p.includes(id)) return p
      return [...p, id]
    })
  }

  const commitConstel = () => {
    pathDragging.current = false
    if (path.length < 2) {
      setPath([])
      return
    }
    const word = path
      .map((id) => constelNodes.find((n) => n.id === id)!.ch)
      .join('')
      .toLowerCase()
    const rev = word.split('').reverse().join('')
    const hit = targetWords.find((w) => strip(w) === strip(word) || strip(w) === strip(rev))
    if (hit && !foundWords.includes(hit)) {
      setPath([])
      addFound(hit)
    } else {
      soundFail()
      setPath([])
    }
  }

  useEffect(() => {
    const up = () => {
      if (pathDragging.current) commitConstel()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('touchend', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, constelNodes, targetWords, foundWords])

  const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('')
  const modeLabel: Record<SubMode, string> = {
    anagrama: 'Anagrama',
    oculto: 'Oculta',
    crucigrama: 'Crucigrama',
    sopa: 'Sopa',
    constelacion: 'Constelación',
  }

  const modeSwitch = (
    <div className="segmented" style={{ flexWrap: 'wrap', marginBottom: phase === 'play' ? 10 : 0 }}>
      {(
        [
          ['anagrama', 'Anagrama'],
          ['oculto', 'Oculta'],
          ['crucigrama', 'Cruci'],
          ['sopa', 'Sopa'],
          ['constelacion', 'Constel'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={sub === id ? 'active' : ''}
          onClick={() => {
            if (phase === 'play') switchModeInPlay(id)
            else {
              soundClick()
              setSub(id)
            }
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

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
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {phase === 'play' && useTimer && (
            <span
              className="mono"
              style={{ fontSize: '0.95rem', color: timeLeft <= 15 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)' }}
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
              Nv. {level}
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
          <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center', marginBottom: 0 }}>🔤 Palabras ocultas</h2>
                <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  Mismo set de letras. Puedes cambiar de modo <strong>durante</strong> la partida sin parar el
                  tiempo. Debes hallar todas las palabras válidas.
                  {bestForLevel != null && bestForLevel > 0 && (
                    <>
                      {' '}
                      · 🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                    </>
                  )}
                </p>
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Modo inicial</p>
                {modeSwitch}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                <GlassButton
                  onClick={() => {
                    setAttempt(0)
                    startLevel(Math.min(level, maxSelectable), 0, sub)
                  }}
                  style={{ minHeight: 48 }}
                >
                  Jugar · Nv. {Math.min(level, maxSelectable)} · {modeLabel[sub]}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && (
          <motion.div key="play" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {modeSwitch}
            <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 8 }}>
              {modeLabel[sub]} · {foundWords.length}/{targetWords.length} palabras
              {foundWords.length > 0 && (
                <span style={{ color: 'var(--gco-primary)' }}> · {foundWords.join(', ')}</span>
              )}
            </p>

            {sub === 'anagrama' && (
              <GlassCard>
                <div style={{ padding: '1.15rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 12, lineHeight: 1.45 }}>
                    Forma palabras. Doble toque en vocal = tilde. Debes hallar las {targetWords.length} válidas.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      minHeight: 48,
                      marginBottom: 12,
                    }}
                  >
                    {slot.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => returnToPool(i)}
                        style={{
                          width: 40,
                          height: 44,
                          borderRadius: 10,
                          border: '1px solid var(--gco-glass-border)',
                          background: t ? 'var(--gco-primary-dim)' : 'var(--gco-input-bg)',
                          color: 'var(--gco-ink)',
                          fontWeight: 700,
                          fontSize: '1.1rem',
                        }}
                      >
                        {t ? t[0] : '·'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
                    {pool.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="glass-button secondary"
                        style={{ minWidth: 40, padding: '0.45rem 0.6rem', fontWeight: 700 }}
                        onClick={() => placeFromPool(t)}
                        onDoubleClick={() => toggleAcute(t)}
                      >
                        {t[0]}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <GlassButton onClick={tryCommitWord}>Validar</GlassButton>
                    <button type="button" className="glass-button secondary" onClick={shufflePool}>
                      Barajar
                    </button>
                    <button
                      type="button"
                      className="glass-button secondary"
                      onClick={() => {
                        soundClick()
                        const L = rawLetters.toUpperCase().split('')
                        setPool(L.map((ch, i) => `${ch}${i}`))
                        setSlot(Array(L.length).fill(null))
                      }}
                    >
                      Reiniciar
                    </button>
                  </div>
                </div>
              </GlassCard>
            )}

            {sub === 'oculto' && (
              <GlassCard>
                <div style={{ padding: '1.15rem', textAlign: 'center' }}>
                  <p
                    className="mono"
                    style={{ fontSize: '1.6rem', letterSpacing: '0.2em', marginBottom: 12, fontWeight: 700 }}
                  >
                    {strip(secret)
                      .split('')
                      .map((c) => (guessed.has(c) ? c : '_'))
                      .join(' ')}
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 10 }}>
                    Fallos {fails}/{maxFails} · Pistas {hintsLeft}/3
                  </p>
                  {hintText.length > 0 && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--gco-primary)', marginBottom: 10 }}>
                      {hintText.join(' · ')}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
                    {alphabet.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        disabled={guessed.has(ch)}
                        className="glass-button secondary"
                        style={{
                          minWidth: 34,
                          padding: '0.4rem',
                          opacity: guessed.has(ch) ? 0.35 : 1,
                          fontWeight: 600,
                        }}
                        onClick={() => guessLetter(ch)}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="glass-button secondary" disabled={hintsLeft <= 0} onClick={useHint}>
                    Pista ({hintsLeft})
                  </button>
                </div>
              </GlassCard>
            )}

            {(sub === 'sopa' || sub === 'crucigrama') && (
              <GlassCard>
                <div style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                    {sub === 'crucigrama'
                      ? 'Crucigrama: casillas activas y bloques. Arrastra en línea continua; las correctas quedan marcadas.'
                      : 'Sopa: todas las palabras están en la rejilla. Arrastra sin soltar; las correctas permanecen marcadas.'}
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${grid[0]?.length || 8}, minmax(26px, 1fr))`,
                      gap: 3,
                      maxWidth: 400,
                      margin: '0 auto 12px',
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                    onPointerLeave={() => {
                      if (selectingRef.current) commitSelection()
                    }}
                  >
                    {grid.map((row, r) =>
                      row.map((ch, c) => {
                        if (ch === '#') {
                          return (
                            <div
                              key={`${r}-${c}`}
                              style={{
                                aspectRatio: '1',
                                borderRadius: 4,
                                background: 'var(--gco-ink)',
                                opacity: 0.35,
                              }}
                            />
                          )
                        }
                        const on = selection.some((p) => p.r === r && p.c === c)
                        const marked = gridMarks[r]?.[c]
                        return (
                          <button
                            key={`${r}-${c}`}
                            type="button"
                            onPointerDown={(e) => {
                              e.preventDefault()
                              onCellDown(r, c)
                            }}
                            onPointerEnter={() => onCellEnter(r, c)}
                            style={{
                              aspectRatio: '1',
                              borderRadius: 8,
                              border: `1px solid ${
                                on ? 'var(--gco-primary)' : marked ? 'var(--gco-primary)' : 'var(--gco-glass-border)'
                              }`,
                              background: marked
                                ? 'var(--gco-primary-dim)'
                                : on
                                  ? 'var(--gco-glass-bg-hover)'
                                  : 'var(--gco-glass-bg)',
                              color: 'var(--gco-ink)',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              textTransform: 'uppercase',
                              touchAction: 'none',
                            }}
                          >
                            {ch}
                          </button>
                        )
                      }),
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
                    Suelta el dedo o el ratón para validar el trazo
                  </p>
                </div>
              </GlassCard>
            )}

            {sub === 'constelacion' && (
              <GlassCard>
                <div style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                    Arrastra de estrella en estrella sin soltar. Si la palabra es válida, el trazo se limpia y
                    suma. Baraja el cielo si lo necesitas.
                  </p>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: 320,
                      aspectRatio: '1',
                      margin: '0 auto 12px',
                      borderRadius: '50%',
                      background:
                        'radial-gradient(circle at 30% 30%, var(--gco-primary-dim), transparent 55%), radial-gradient(circle at 70% 60%, var(--gco-orb-2), transparent 50%), var(--gco-bg-elevated)',
                      border: '1px solid var(--gco-glass-border)',
                      overflow: 'hidden',
                      touchAction: 'none',
                    }}
                  >
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 100 100"
                      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                    >
                      {path.length > 1 &&
                        path.slice(1).map((id, i) => {
                          const a = constelNodes.find((n) => n.id === path[i])!
                          const b = constelNodes.find((n) => n.id === id)!
                          return (
                            <line
                              key={`${path[i]}-${id}`}
                              x1={a.x}
                              y1={a.y}
                              x2={b.x}
                              y2={b.y}
                              stroke="var(--gco-primary)"
                              strokeWidth="0.7"
                              strokeLinecap="round"
                            />
                          )
                        })}
                    </svg>
                    {constelNodes.map((n) => {
                      const on = path.includes(n.id)
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault()
                            onConstelPointer(n.id, true)
                          }}
                          onPointerEnter={() => {
                            if (pathDragging.current) onConstelPointer(n.id, false)
                          }}
                          style={{
                            position: 'absolute',
                            left: `${n.x}%`,
                            top: `${n.y}%`,
                            transform: 'translate(-50%, -50%)',
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            border: `1.5px solid ${on ? 'var(--gco-primary)' : 'var(--gco-glass-border)'}`,
                            background: on ? 'var(--gco-primary)' : 'var(--gco-glass-bg)',
                            color: on ? 'var(--gco-button-text)' : 'var(--gco-ink)',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            boxShadow: on ? '0 0 12px var(--gco-primary-dim)' : 'none',
                            cursor: 'pointer',
                            touchAction: 'none',
                            zIndex: 2,
                          }}
                        >
                          {n.ch}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="glass-button secondary" onClick={() => setPath([])}>
                      Borrar trazo
                    </button>
                    <button type="button" className="glass-button secondary" onClick={shufflePool}>
                      Barajar cielo
                    </button>
                  </div>
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}

        {phase === 'result' && (
          <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.3rem', textAlign: 'center' }}>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                  }}
                >
                  {isCorrect ? 'Nivel superado' : 'No superado'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 14px' }}>
                  {formatDuration(Date.now() - startRef.current)} · {foundWords.length}/{targetWords.length}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton
                      onClick={() => {
                        setAttempt(0)
                        startLevel(Math.min(level + 1, TOTAL_LEVELS), 0, sub)
                      }}
                    >
                      Siguiente nivel
                    </GlassButton>
                  ) : (
                    <GlassButton
                      onClick={() => {
                        const nextAtt = attempt + 1
                        setAttempt(nextAtt)
                        startLevel(level, nextAtt, sub)
                      }}
                    >
                      Otro intento (mismo nivel)
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

export default PalabrasGame