import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/* =============================================================================
   MAPAS MENTALES — motor de niveles procedural
   4 tipos de acertijo espacial, cada uno resuelto con lógica real (no texto
   reciclado): cadenas de direcciones, redes/grafos, filas con restricciones
   y tableros de casillas. Cada nivel se genera con una semilla determinista
   (nivel + intento) y se verifica que tenga una única solución posible.
   ============================================================================= */

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'mapas'
const TOTAL_LEVELS = 400
const TIMER_BY_TIER = [95, 85, 75, 65, 58, 50]

function tierOf(level: number) {
  return Math.min(5, Math.floor((level - 1) / 70))
}

/* ---------- utilidades deterministas ---------- */

function mulberry32(a: number) {
  return function rnd() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(n: number, attempt: number) {
  return (n * 2654435761 + attempt * 40503 + 1) >>> 0
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) result.push([arr[i], ...p])
  }
  return result
}

function compassLabel(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return 'En el mismo punto'
  if (dx === 0) return dy > 0 ? 'Norte' : 'Sur'
  if (dy === 0) return dx > 0 ? 'Este' : 'Oeste'
  if (dx > 0 && dy > 0) return 'Noreste'
  if (dx > 0 && dy < 0) return 'Sureste'
  if (dx < 0 && dy > 0) return 'Noroeste'
  return 'Suroeste'
}

function buildAdjList(n: number, edges: [number, number][]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => [])
  edges.forEach(([a, b]) => {
    adj[a].push(b)
    adj[b].push(a)
  })
  return adj
}

function allSimplePaths(adj: number[][], start: number, end: number): number[][] {
  const results: number[][] = []
  const visited = new Set<number>([start])
  const path = [start]
  function dfs(u: number) {
    if (u === end) {
      results.push([...path])
      return
    }
    for (const v of adj[u]) {
      if (!visited.has(v)) {
        visited.add(v)
        path.push(v)
        dfs(v)
        path.pop()
        visited.delete(v)
      }
    }
  }
  dfs(start)
  return results
}

function bfsDistance(adj: number[][], start: number, end: number): number {
  const dist = new Array(adj.length).fill(-1)
  dist[start] = 0
  const q: number[] = [start]
  while (q.length) {
    const u = q.shift() as number
    if (u === end) return dist[u]
    for (const v of adj[u]) {
      if (dist[v] === -1) {
        dist[v] = dist[u] + 1
        q.push(v)
      }
    }
  }
  return dist[end]
}

/* ---------- bancos de nombres ---------- */

const NAME_POOL = ['Ana', 'Bea', 'Cruz', 'Dani', 'Eva', 'Fer', 'Gael', 'Hugo', 'Iris', 'Javi', 'Karla', 'Leo']
const NODE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const ITEM_POOL = [
  { name: 'la llave', icon: '🔑' },
  { name: 'el mapa', icon: '🗺️' },
  { name: 'el cofre', icon: '🎁' },
  { name: 'la brújula', icon: '🧭' },
  { name: 'la antorcha', icon: '🔦' },
  { name: 'la gema', icon: '💎' },
  { name: 'el pergamino', icon: '📜' },
  { name: 'la linterna', icon: '🏮' },
]

/* ---------- tipos de nivel ---------- */

type VisualData =
  | { type: 'direction'; points: { name: string; x: number; y: number }[]; from: string; to: string }
  | { type: 'graph'; nodes: string[]; edges: [number, number][]; highlight: [number, number] }
  | { type: 'order'; count: number }
  | { type: 'grid'; rows: number; cols: number; casillas: { n: number; r: number; c: number }[] }

type LevelKind = 'direction' | 'graph' | 'order' | 'grid'

type LevelData = {
  id: string
  kind: LevelKind
  intro: string
  clueLines: string[]
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  visual: VisualData
}

const KIND_ORDER: LevelKind[] = ['direction', 'graph', 'order', 'grid']

const KIND_META: Record<LevelKind, { label: string; icon: string; color: string; dim: string }> = {
  direction: { label: 'Cadena de direcciones', icon: '🧭', color: 'var(--gco-primary)', dim: 'var(--gco-primary-dim)' },
  graph: { label: 'Red de caminos', icon: '🕸️', color: 'var(--gco-secondary)', dim: 'var(--gco-secondary-dim)' },
  order: { label: 'Orden en fila', icon: '🚶', color: 'var(--gco-accent)', dim: 'rgba(139,124,246,0.16)' },
  grid: { label: 'Tablero de casillas', icon: '🗂️', color: '#4FA8FF', dim: 'rgba(79,168,255,0.16)' },
}

/* ---------- motor 1 · cadena de direcciones ---------- */

function genDirection(level: number, seed: number): LevelData {
  const rnd = mulberry32(seed)
  const tier = tierOf(level)
  const allowDiag = tier >= 1
  const stepsCount = Math.min(6, 2 + tier)
  const dirs8 = [
    { name: 'norte', dx: 0, dy: 1 },
    { name: 'sur', dx: 0, dy: -1 },
    { name: 'este', dx: 1, dy: 0 },
    { name: 'oeste', dx: -1, dy: 0 },
    { name: 'noreste', dx: 1, dy: 1 },
    { name: 'noroeste', dx: -1, dy: 1 },
    { name: 'sureste', dx: 1, dy: -1 },
    { name: 'suroeste', dx: -1, dy: -1 },
  ]
  const pool = allowDiag ? dirs8 : dirs8.slice(0, 4)
  const letters = ['B', 'C', 'D', 'E', 'F', 'G']
  const points: { name: string; x: number; y: number }[] = [{ name: 'A', x: 0, y: 0 }]
  const clueLines: string[] = []
  let x = 0
  let y = 0
  let lastDx = 99
  let lastDy = 99
  for (let i = 0; i < stepsCount; i++) {
    let d = pick(pool, rnd)
    let guard = 0
    while (guard < 12 && ((d.dx === -lastDx && d.dy === -lastDy) || (d.dx === lastDx && d.dy === lastDy))) {
      d = pick(pool, rnd)
      guard++
    }
    x += d.dx
    y += d.dy
    const label = letters[i]
    points.push({ name: label, x, y })
    clueLines.push(`${label} está al ${d.name} de ${points[i].name}.`)
    lastDx = d.dx
    lastDy = d.dy
  }

  let fromIdx = 0
  let toIdx = points.length - 1
  if (tier >= 2) {
    let tries = 0
    do {
      fromIdx = Math.floor(rnd() * (points.length - 1))
      toIdx = fromIdx + 1 + Math.floor(rnd() * (points.length - 1 - fromIdx))
      tries++
    } while (points[fromIdx].x === points[toIdx].x && points[fromIdx].y === points[toIdx].y && tries < 6)
  }
  const from = points[fromIdx]
  const to = points[toIdx]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const answer = compassLabel(dx, dy)
  const allLabels = ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste']
  const distractors = shuffle(allLabels.filter((l) => l !== answer), rnd).slice(0, 3)
  const options = shuffle([answer, ...distractors], rnd)

  return {
    id: `dir-${level}-${seed}`,
    kind: 'direction',
    intro: 'Cada punto se ubica siguiendo el paso anterior, empezando en A.',
    clueLines,
    question: `¿En qué dirección se encuentra ${to.name} respecto a ${from.name}?`,
    options,
    correctIndex: options.indexOf(answer),
    explanation: `Desplazamiento total de ${from.name} a ${to.name}: ${Math.abs(dx)} paso(s) horizontal(es) y ${Math.abs(dy)} paso(s) vertical(es) → ${answer}.`,
    visual: { type: 'direction', points, from: from.name, to: to.name },
  }
}

/* ---------- motor 2 · red / grafo ---------- */

function genGraph(level: number, seed: number): LevelData {
  const rnd = mulberry32(seed)
  const tier = tierOf(level)
  const n = [4, 5, 5, 6, 7, 8][tier]
  const nodes = NODE_LETTERS.slice(0, n)
  const edges: [number, number][] = []
  const edgeSet = new Set<string>()
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push([a, b])
  }
  for (let i = 1; i < n; i++) {
    const j = Math.floor(rnd() * i)
    addEdge(i, j)
  }
  const extra = Math.min(Math.floor(n / 2), 1 + tier)
  let added = 0
  let attempts = 0
  while (added < extra && attempts < 40) {
    attempts++
    const a = Math.floor(rnd() * n)
    const b = Math.floor(rnd() * n)
    if (a === b) continue
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edgeSet.has(key)) continue
    addEdge(a, b)
    added++
  }
  const adj = buildAdjList(n, edges)
  const askDistance = rnd() < 0.5
  let start = 0
  let end = 0
  let guard = 0
  do {
    start = Math.floor(rnd() * n)
    end = Math.floor(rnd() * n)
    guard++
  } while (start === end && guard < 20)

  let question: string
  let correctVal: number
  let explanation: string
  if (askDistance) {
    correctVal = bfsDistance(adj, start, end)
    question = `¿Cuál es la distancia mínima (número mínimo de conexiones) entre ${nodes[start]} y ${nodes[end]}?`
    explanation = `La ruta más corta entre ${nodes[start]} y ${nodes[end]} usa ${correctVal} conexión${correctVal === 1 ? '' : 'es'}.`
  } else {
    const paths = allSimplePaths(adj, start, end)
    correctVal = paths.length
    question = `¿Cuántos caminos simples diferentes (sin repetir nodos) existen entre ${nodes[start]} y ${nodes[end]}?`
    const listed = paths
      .slice(0, 5)
      .map((p) => p.map((i) => nodes[i]).join('-'))
      .join(' · ')
    explanation = paths.length
      ? `Caminos encontrados: ${listed}${paths.length > 5 ? ' …' : ''}.`
      : 'No existe ningún camino simple entre esos dos nodos con las conexiones dadas.'
  }

  const distractSet = new Set<number>([correctVal])
  const opts: number[] = [correctVal]
  let g2 = 0
  while (opts.length < 4 && g2 < 60) {
    g2++
    const delta = pick([-2, -1, 1, 2, 3], rnd)
    const cand = correctVal + delta
    if (cand < 0 || distractSet.has(cand)) continue
    distractSet.add(cand)
    opts.push(cand)
  }
  const options = shuffle(opts, rnd).map(String)

  return {
    id: `graph-${level}-${seed}`,
    kind: 'graph',
    intro: `Una red conecta ${n} puntos: ${nodes.join(', ')}.`,
    clueLines: edges.map(([a, b]) => `${nodes[a]} está conectado directamente con ${nodes[b]}.`),
    question,
    options,
    correctIndex: options.indexOf(String(correctVal)),
    explanation,
    visual: { type: 'graph', nodes, edges, highlight: [start, end] },
  }
}

/* ---------- motor 3 · orden en fila ---------- */

function genOrder(level: number, seed: number): LevelData {
  const rnd = mulberry32(seed)
  const tier = tierOf(level)
  const N = [3, 4, 4, 5, 5, 6][tier]
  const names = shuffle(NAME_POOL, rnd).slice(0, N)
  const secret = shuffle(names, rnd)
  const allPerms = permutations(names)

  type P = { text: string; test: (perm: string[]) => boolean }
  const pool: P[] = []
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = secret[i]
      const b = secret[j]
      pool.push({ text: `${a} está a la izquierda de ${b}.`, test: (p) => p.indexOf(a) < p.indexOf(b) })
      if (j === i + 1) {
        pool.push({ text: `${a} está justo a la izquierda de ${b}.`, test: (p) => p.indexOf(b) - p.indexOf(a) === 1 })
        pool.push({ text: `${a} y ${b} están justo uno al lado del otro.`, test: (p) => Math.abs(p.indexOf(a) - p.indexOf(b)) === 1 })
      } else {
        const between = j - i - 1
        pool.push({ text: `${a} y ${b} no están uno al lado del otro.`, test: (p) => Math.abs(p.indexOf(a) - p.indexOf(b)) !== 1 })
        pool.push({
          text: `Hay exactamente ${between} persona${between === 1 ? '' : 's'} entre ${a} y ${b}.`,
          test: (p) => Math.abs(p.indexOf(a) - p.indexOf(b)) - 1 === between,
        })
      }
    }
  }
  pool.push({ text: `${secret[0]} ocupa el primer lugar, en el extremo izquierdo.`, test: (p) => p.indexOf(secret[0]) === 0 })
  pool.push({ text: `${secret[N - 1]} ocupa el último lugar, en el extremo derecho.`, test: (p) => p.indexOf(secret[N - 1]) === N - 1 })
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      for (let j = 0; j < N; j++) {
        if (i < k && k < j) {
          const a = secret[i]
          const b = secret[k]
          const c = secret[j]
          pool.push({
            text: `${b} está entre ${a} y ${c}.`,
            test: (p) => {
              const ia = p.indexOf(a)
              const ib = p.indexOf(b)
              const ic = p.indexOf(c)
              return (ia < ib && ib < ic) || (ic < ib && ib < ia)
            },
          })
        }
      }
    }
  }

  const shuffledPool = shuffle(pool, rnd)
  const chosen: P[] = []
  const isUnique = () => allPerms.filter((p) => chosen.every((c) => c.test(p))).length === 1
  for (const c of shuffledPool) {
    if (isUnique()) break
    if (chosen.some((x) => x.text === c.text)) continue
    if (chosen.length >= N + 2) break
    chosen.push(c)
  }
  if (!isUnique()) {
    const order = shuffle(
      Array.from({ length: N }, (_, i) => i),
      rnd,
    )
    for (const i of order) {
      if (isUnique()) break
      const text = `${secret[i]} ocupa la posición ${i + 1}, contando desde la izquierda.`
      if (!chosen.some((x) => x.text === text)) chosen.push({ text, test: (p) => p.indexOf(secret[i]) === i })
    }
  }

  const askPosition = rnd() < 0.5
  let question: string
  let correctAnswer: string
  let options: string[]
  if (askPosition) {
    const target = pick(names, rnd)
    const pos = secret.indexOf(target) + 1
    question = `¿Qué posición ocupa ${target}, contando desde la izquierda (1 = extremo izquierdo)?`
    correctAnswer = String(pos)
    const distractorPool = Array.from({ length: N }, (_, i) => String(i + 1)).filter((v) => v !== correctAnswer)
    options = shuffle([correctAnswer, ...shuffle(distractorPool, rnd).slice(0, 3)], rnd)
  } else {
    const pos = 1 + Math.floor(rnd() * N)
    const target = secret[pos - 1]
    question = `¿Quién ocupa la posición ${pos}, contando desde la izquierda?`
    correctAnswer = target
    const distractorPool = names.filter((v) => v !== target)
    options = shuffle([correctAnswer, ...shuffle(distractorPool, rnd).slice(0, 3)], rnd)
  }

  return {
    id: `order-${level}-${seed}`,
    kind: 'order',
    intro: `Un grupo de ${N} personas está en una fila, una junto a otra, mirando en la misma dirección.`,
    clueLines: chosen.map((c) => c.text),
    question,
    options,
    correctIndex: options.indexOf(correctAnswer),
    explanation: `Orden completo de izquierda a derecha: ${secret.join(' → ')}.`,
    visual: { type: 'order', count: N },
  }
}

/* ---------- motor 4 · tablero de casillas ---------- */

function genGrid(level: number, seed: number): LevelData {
  const rnd = mulberry32(seed)
  const tier = tierOf(level)
  const size = [3, 3, 4, 4, 5, 5][tier]
  const R = size
  const C = size
  const K = [2, 3, 3, 4, 4, 5][tier]
  const allCells: { r: number; c: number }[] = []
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) allCells.push({ r, c })
  const chosenCells = shuffle(allCells, rnd)
    .slice(0, K)
    .sort((a, b) => a.r - b.r || a.c - b.c)
  const casillas = chosenCells.map((cell, i) => ({ n: i + 1, r: cell.r, c: cell.c }))
  const items = shuffle(ITEM_POOL, rnd).slice(0, K)
  const secretPerm = shuffle(items, rnd)

  const rowOf = (perm: typeof items, name: string) => casillas[perm.findIndex((it) => it.name === name)].r
  const colOf = (perm: typeof items, name: string) => casillas[perm.findIndex((it) => it.name === name)].c

  type P = { text: string; test: (perm: typeof items) => boolean }
  const candidates: P[] = []
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      if (i === j) continue
      const a = items[i]
      const b = items[j]
      candidates.push({
        text: `${a.icon} ${a.name} está en la misma fila que ${b.icon} ${b.name}.`,
        test: (p) => rowOf(p, a.name) === rowOf(p, b.name),
      })
      candidates.push({
        text: `${a.icon} ${a.name} está en la misma columna que ${b.icon} ${b.name}.`,
        test: (p) => colOf(p, a.name) === colOf(p, b.name),
      })
      candidates.push({
        text: `${a.icon} ${a.name} está a la derecha de ${b.icon} ${b.name}, en la misma fila.`,
        test: (p) => rowOf(p, a.name) === rowOf(p, b.name) && colOf(p, a.name) > colOf(p, b.name),
      })
      candidates.push({
        text: `${a.icon} ${a.name} está debajo de ${b.icon} ${b.name}, en la misma columna.`,
        test: (p) => colOf(p, a.name) === colOf(p, b.name) && rowOf(p, a.name) > rowOf(p, b.name),
      })
      candidates.push({
        text: `${a.icon} ${a.name} está en diagonal respecto a ${b.icon} ${b.name}.`,
        test: (p) => {
          const dr = rowOf(p, a.name) - rowOf(p, b.name)
          const dc = colOf(p, a.name) - colOf(p, b.name)
          return dr !== 0 && Math.abs(dr) === Math.abs(dc)
        },
      })
      candidates.push({
        text: `${a.icon} ${a.name} no está en la misma fila que ${b.icon} ${b.name}.`,
        test: (p) => rowOf(p, a.name) !== rowOf(p, b.name),
      })
      candidates.push({
        text: `${a.icon} ${a.name} no está en la misma columna que ${b.icon} ${b.name}.`,
        test: (p) => colOf(p, a.name) !== colOf(p, b.name),
      })
    }
  }
  for (let i = 0; i < K; i++) {
    const a = items[i]
    const r = rowOf(secretPerm, a.name)
    const c = colOf(secretPerm, a.name)
    candidates.push({
      text: `${a.icon} ${a.name} está en una esquina del tablero.`,
      test: (p) => {
        const rr = rowOf(p, a.name)
        const cc = colOf(p, a.name)
        return (rr === 0 || rr === R - 1) && (cc === 0 || cc === C - 1)
      },
    })
    candidates.push({ text: `${a.icon} ${a.name} está en la fila ${r + 1}.`, test: (p) => rowOf(p, a.name) === r })
    candidates.push({
      text: `${a.icon} ${a.name} está en la columna ${String.fromCharCode(65 + c)}.`,
      test: (p) => colOf(p, a.name) === c,
    })
  }

  const truePool = shuffle(
    candidates.filter((c) => c.test(secretPerm)),
    rnd,
  )
  const chosen: P[] = []
  const allPerms = permutations(items)
  const isUnique = () => allPerms.filter((p) => chosen.every((c) => c.test(p))).length === 1
  for (const c of truePool) {
    if (isUnique()) break
    if (chosen.some((x) => x.text === c.text)) continue
    if (chosen.length >= K + 3) break
    chosen.push(c)
  }
  if (!isUnique()) {
    const order = shuffle(items, rnd)
    for (const a of order) {
      if (isUnique()) break
      const n = casillas[secretPerm.findIndex((it) => it.name === a.name)].n
      const text = `${a.icon} ${a.name} está en la casilla número ${n}.`
      if (!chosen.some((x) => x.text === text)) {
        chosen.push({ text, test: (p) => casillas[p.findIndex((it) => it.name === a.name)].n === n })
      }
    }
  }

  const target = pick(items, rnd)
  const correctN = casillas[secretPerm.findIndex((it) => it.name === target.name)].n
  const question = `${target.icon} ¿En qué casilla se encuentra ${target.name}?`
  const optPool = casillas.map((c) => c.n).filter((n) => n !== correctN)
  const options = shuffle([correctN, ...shuffle(optPool, rnd).slice(0, 3)], rnd).map((n) => `Casilla ${n}`)

  const explanation = `Asignación completa → ${casillas
    .map((c) => {
      const it = secretPerm[c.n - 1]
      return `Casilla ${c.n}: ${it.icon} ${it.name}`
    })
    .join(' · ')}`

  return {
    id: `grid-${level}-${seed}`,
    kind: 'grid',
    intro: `El tablero de ${R}×${C} tiene ${K} casillas numeradas. Cada una está ocupada por un objeto distinto.`,
    clueLines: chosen.map((c) => c.text),
    question,
    options,
    correctIndex: options.indexOf(`Casilla ${correctN}`),
    explanation,
    visual: { type: 'grid', rows: R, cols: C, casillas },
  }
}

function generateLevel(levelNum: number, attempt: number): LevelData {
  const kind = KIND_ORDER[(levelNum - 1) % KIND_ORDER.length]
  const seed = seedFor(levelNum, attempt)
  if (kind === 'direction') return genDirection(levelNum, seed)
  if (kind === 'graph') return genGraph(levelNum, seed)
  if (kind === 'order') return genOrder(levelNum, seed)
  return genGrid(levelNum, seed)
}

/* ---------- componentes visuales ---------- */

function DirectionVisual({ points, from, to }: { points: { name: string; x: number; y: number }[]; from: string; to: string }) {
  const w = 320
  const h = 200
  const pad = 34
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY)
  const offX = (w - 2 * pad - spanX * scale) / 2
  const offY = (h - 2 * pad - spanY * scale) / 2
  const proj = points.map((p) => ({
    name: p.name,
    sx: pad + offX + (p.x - minX) * scale,
    sy: h - (pad + offY + (p.y - minY) * scale),
  }))
  return (
    <div className="gco-map-visual-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="gco-map-svg" role="img" aria-label="Diagrama de puntos">
        <defs>
          <marker id="mapas-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--gco-ink-faint)" />
          </marker>
        </defs>
        {proj.slice(1).map((p, i) => {
          const prev = proj[i]
          return (
            <line
              key={i}
              x1={prev.sx}
              y1={prev.sy}
              x2={p.sx}
              y2={p.sy}
              stroke="var(--gco-ink-faint)"
              strokeWidth={2}
              strokeDasharray="5 5"
              markerEnd="url(#mapas-arrow)"
            />
          )
        })}
        {proj.map((p, i) => {
          const isFrom = p.name === from
          const isTo = p.name === to
          const fill = isFrom ? 'var(--gco-primary)' : isTo ? 'var(--gco-secondary)' : 'var(--gco-accent)'
          return (
            <g key={p.name} className="gco-map-node" style={{ animationDelay: `${i * 0.08}s` }}>
              <circle cx={p.sx} cy={p.sy} r={16} fill={fill} />
              <text x={p.sx} y={p.sy + 5} textAnchor="middle" fontSize="13" fontWeight={700} fill="#0B1220">
                {p.name}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="gco-map-legend">
        <span style={{ color: 'var(--gco-primary)' }}>● {from}</span> punto de referencia ·{' '}
        <span style={{ color: 'var(--gco-secondary)' }}>● {to}</span> punto a ubicar
      </p>
    </div>
  )
}

function GraphVisual({ nodes, edges, highlight }: { nodes: string[]; edges: [number, number][]; highlight: [number, number] }) {
  const w = 300
  const h = 210
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2 - 40
  const pos = nodes.map((_, i) => {
    const angle = -Math.PI / 2 + i * ((2 * Math.PI) / nodes.length)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
  return (
    <div className="gco-map-visual-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="gco-map-svg" role="img" aria-label="Diagrama de red">
        {edges.map(([a, b], i) => (
          <line key={i} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke="var(--gco-glass-border)" strokeWidth={2.5} />
        ))}
        {nodes.map((n, i) => {
          const isHi = highlight.includes(i)
          const fill = isHi ? (i === highlight[0] ? 'var(--gco-primary)' : 'var(--gco-secondary)') : 'var(--gco-accent)'
          return (
            <g key={n} className="gco-map-node" style={{ animationDelay: `${i * 0.06}s` }}>
              <circle cx={pos[i].x} cy={pos[i].y} r={17} fill={fill} />
              <text x={pos[i].x} y={pos[i].y + 5} textAnchor="middle" fontSize="13" fontWeight={700} fill="#0B1220">
                {n}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="gco-map-legend">
        <span style={{ color: 'var(--gco-primary)' }}>● {nodes[highlight[0]]}</span> ·{' '}
        <span style={{ color: 'var(--gco-secondary)' }}>● {nodes[highlight[1]]}</span> — nodos de la pregunta
      </p>
    </div>
  )
}

function OrderVisual({ count }: { count: number }) {
  return (
    <div className="gco-map-visual-wrap">
      <div className="gco-order-track">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="gco-order-slot" style={{ animationDelay: `${i * 0.08}s` }}>
            <span>{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="gco-map-legend">Cada casilla es una posición en la fila, de izquierda a derecha.</p>
    </div>
  )
}

function GridVisual({ rows, cols, casillas }: { rows: number; cols: number; casillas: { n: number; r: number; c: number }[] }) {
  const cellMap = new Map(casillas.map((c) => [`${c.r}-${c.c}`, c.n]))
  const colLetters = Array.from({ length: cols }, (_, i) => String.fromCharCode(65 + i))
  return (
    <div className="gco-map-visual-wrap">
      <div className="gco-grid-board" style={{ gridTemplateColumns: `24px repeat(${cols}, 1fr)` }}>
        <div className="gco-grid-label gco-grid-corner" />
        {colLetters.map((l) => (
          <div key={l} className="gco-grid-label">
            {l}
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) => (
          <Fragment key={r}>
            <div className="gco-grid-label">{r + 1}</div>
            {Array.from({ length: cols }).map((_, c) => {
              const n = cellMap.get(`${r}-${c}`)
              return (
                <div key={c} className={`gco-grid-cell${n ? ' active' : ''}`}>
                  {n ? <span className="gco-grid-badge">{n}</span> : null}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="gco-map-legend">Filas 1–{rows} · Columnas A–{colLetters[colLetters.length - 1]}. Cada número es una casilla ocupada.</p>
    </div>
  )
}

/* ---------- componente principal ---------- */

export function MapasGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(() => getUnlockedLevels(GAME_CAT, GAME_ID), [progress.highestLevel])
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))
  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [levelData, setLevelData] = useState<LevelData | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BY_TIER[0])
  const [timerMax, setTimerMax] = useState(TIMER_BY_TIER[0])
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [streak, setStreak] = useState(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level
  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)
  const meta = KIND_META[levelData ? levelData.kind : 'direction']

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0) => {
      clearTimers()
      const lvl = generateLevel(lv, att)
      const max = TIMER_BY_TIER[tierOf(lv)]
      setLevelData(lvl)
      setSelected(null)
      setIsCorrect(null)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(max)
      setTimerMax(max)
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              clearTimers()
              setIsCorrect(false)
              setPhase('result')
              setStreak(0)
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
    [useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!levelData || selected !== null) return
    soundClick()
    clearTimers()
    setSelected(idx)
    const ok = idx === levelData.correctIndex
    window.setTimeout(() => {
      setIsCorrect(ok)
      setPhase('result')
      setStreak((s) => (ok ? s + 1 : 0))
      recordLevelResult({
        categoryId: GAME_CAT,
        gameId: GAME_ID,
        level,
        success: ok,
        timeMs: Date.now() - startRef.current,
      })
      if (ok) soundSuccess()
      else soundFail()
    }, 550)
  }

  const tier = tierOf(level)

  return (
    <div className="app-shell">
      <style>{`
        .gco-map-hero {
          position: relative;
          overflow: hidden;
          border-radius: var(--gco-radius, 22px);
          padding: 1.35rem 1.25rem;
          background:
            radial-gradient(ellipse 80% 60% at 10% 0%, var(--gco-orb-1), transparent 55%),
            radial-gradient(ellipse 60% 50% at 95% 90%, var(--gco-orb-2), transparent 50%),
            var(--gco-glass-bg);
          border: 1px solid var(--gco-glass-border);
          backdrop-filter: blur(var(--gco-glass-blur, 20px));
          -webkit-backdrop-filter: blur(var(--gco-glass-blur, 20px));
          box-shadow: var(--gco-shadow), inset 0 1px 0 var(--gco-glass-highlight);
          background-size: 200% 200%;
          animation: gco-gradient-shift 12s ease infinite;
        }
        @keyframes gco-gradient-shift {
          0% { background-position: 0% 0%; }
          50% { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }
        .gco-map-float-deco {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .gco-map-float-deco span {
          position: absolute;
          font-size: 1.4rem;
          opacity: 0.16;
          animation: gco-float-bob 5.5s ease-in-out infinite;
        }
        .gco-map-float-deco span:nth-child(1) { top: 8%; left: 6%; }
        .gco-map-float-deco span:nth-child(2) { top: 12%; right: 10%; }
        .gco-map-float-deco span:nth-child(3) { bottom: 14%; left: 14%; }
        .gco-map-float-deco span:nth-child(4) { bottom: 10%; right: 8%; }
        @keyframes gco-float-bob {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(8deg); }
        }
        .gco-map-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 14px;
          position: relative;
          z-index: 1;
        }
        .gco-map-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid transparent;
          transition: transform 0.18s ease;
        }
        .gco-map-chip:hover { transform: translateY(-2px) scale(1.03); }
        .gco-diff-dots {
          display: flex;
          gap: 5px;
          justify-content: center;
          margin-top: 10px;
          position: relative;
          z-index: 1;
        }
        .gco-diff-dots span {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-glass-border);
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .gco-diff-dots span.on {
          background: var(--gco-primary);
          border-color: var(--gco-primary);
          transform: scale(1.15);
        }
        .gco-kind-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.4rem 0.8rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 700;
          margin-bottom: 0.7rem;
          animation: gco-pop-in 0.35s ease;
        }
        .gco-level-dot {
          display: inline-block;
          width: 7px; height: 7px;
          border-radius: 50%;
          margin-right: 4px;
        }
        .gco-map-header {
          margin-bottom: 0.4rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .gco-map-header-right {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }
        .gco-timer-chip {
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-glass-border);
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .gco-timer-chip.warn { color: #E8A93A; border-color: rgba(232,169,58,0.4); }
        .gco-timer-chip.danger {
          color: var(--gco-secondary);
          border-color: var(--gco-secondary);
          animation: gco-pulse-danger 0.9s ease-in-out infinite;
        }
        @keyframes gco-pulse-danger {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,74,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(255,107,74,0); }
        }
        .gco-timer-track {
          height: 5px;
          border-radius: 4px;
          background: var(--gco-fill-quaternary);
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .gco-timer-fill {
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--gco-primary), var(--gco-accent));
          transition: width 1s linear;
        }
        .gco-streak-pill {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          background: var(--gco-secondary-dim, rgba(255,107,74,0.16));
          color: var(--gco-secondary);
          font-weight: 700;
          font-size: 0.8rem;
          animation: gco-flame 1s ease-in-out infinite;
        }
        @keyframes gco-flame {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        .gco-map-panel {
          padding: 1.1rem 1.15rem 1.3rem;
          border-top: 3px solid var(--gco-glass-border);
          border-radius: 0 0 var(--gco-radius, 18px) var(--gco-radius, 18px);
        }
        .gco-map-intro {
          font-size: 0.92rem;
          color: var(--gco-ink-muted);
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .gco-map-visual-wrap {
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-glass-border);
          border-radius: 16px;
          padding: 10px 6px 6px;
          margin-bottom: 14px;
          animation: gco-pop-in 0.4s ease;
        }
        .gco-map-svg { width: 100%; height: auto; display: block; }
        .gco-map-node { animation: gco-node-pop 0.4s ease backwards; transform-origin: center; }
        @keyframes gco-node-pop {
          0% { opacity: 0; transform: scale(0.3); }
          70% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes gco-pop-in {
          0% { opacity: 0; transform: translateY(6px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gco-map-legend {
          text-align: center;
          font-size: 0.72rem;
          color: var(--gco-ink-faint);
          padding: 6px 4px 4px;
        }
        .gco-order-track {
          display: flex;
          justify-content: center;
          gap: 10px;
          padding: 14px 6px;
          flex-wrap: wrap;
        }
        .gco-order-slot {
          width: 40px; height: 40px;
          border-radius: 12px;
          border: 2px dashed var(--gco-glass-border);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono);
          color: var(--gco-ink-faint);
          animation: gco-pop-in 0.4s ease backwards;
        }
        .gco-grid-board {
          display: grid;
          gap: 4px;
          padding: 8px;
        }
        .gco-grid-label {
          font-size: 0.68rem;
          color: var(--gco-ink-faint);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono);
        }
        .gco-grid-corner { visibility: hidden; }
        .gco-grid-cell {
          aspect-ratio: 1;
          border-radius: 8px;
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-glass-border);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s ease;
        }
        .gco-grid-cell:hover { transform: scale(1.06); }
        .gco-grid-cell.active {
          background: var(--gco-primary-dim);
          border-color: var(--gco-primary);
        }
        .gco-grid-badge {
          width: 70%; height: 70%;
          border-radius: 50%;
          background: var(--gco-primary);
          color: #0B1220;
          font-weight: 800;
          font-size: 0.75rem;
          display: flex; align-items: center; justify-content: center;
          animation: gco-node-pop 0.4s ease;
        }
        .gco-clue-list {
          list-style: none;
          margin: 0 0 14px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .gco-clue-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.86rem;
          line-height: 1.45;
          padding: 0.55rem 0.7rem;
          border-radius: 12px;
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-hairline);
          animation: gco-fade-slide 0.4s ease backwards;
        }
        @keyframes gco-fade-slide {
          0% { opacity: 0; transform: translateX(-8px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .gco-clue-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }
        .gco-question-box {
          font-weight: 700;
          font-size: 0.98rem;
          padding: 0.8rem 0.9rem;
          border-radius: 14px;
          border: 1.5px solid var(--gco-glass-border);
          background: var(--gco-glass-bg-hover, var(--gco-fill-quaternary));
          margin-bottom: 12px;
        }
        .gco-option-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .gco-option-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          padding: 0.75rem 0.9rem;
          min-height: 46px;
          border-radius: 13px;
          border: 1.5px solid var(--gco-glass-border);
          background: var(--gco-glass-bg);
          color: var(--gco-ink);
          font-size: 0.9rem;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }
        .gco-option-btn:hover:not(:disabled) {
          border-color: var(--gco-primary);
          transform: translateY(-1px);
        }
        .gco-option-btn:active:not(:disabled) { transform: scale(0.98); }
        .gco-option-letter {
          width: 24px; height: 24px;
          border-radius: 8px;
          background: var(--gco-fill-quaternary);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          flex-shrink: 0;
        }
        .gco-option-btn.correct {
          border-color: var(--gco-primary);
          background: var(--gco-primary-dim);
          animation: gco-pop-in 0.25s ease;
        }
        .gco-option-btn.incorrect {
          border-color: var(--gco-secondary);
          background: var(--gco-secondary-dim);
          animation: gco-shake 0.4s ease;
        }
        .gco-option-btn.dimmed { opacity: 0.45; }
        @keyframes gco-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .gco-result-panel {
          padding: 1.4rem 1.2rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .gco-result-badge {
          font-size: 3rem;
          margin-bottom: 6px;
        }
        .gco-result-badge.success { animation: gco-bounce-in 0.6s ease; }
        .gco-result-badge.fail { animation: gco-shake 0.5s ease; }
        @keyframes gco-bounce-in {
          0% { transform: scale(0.2); opacity: 0; }
          60% { transform: scale(1.25); opacity: 1; }
          80% { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
        .gco-result-title { font-weight: 800; font-size: 1.15rem; margin-bottom: 4px; }
        .gco-result-time { color: var(--gco-ink-muted); margin: 4px 0 14px; }
        .gco-explain-box {
          text-align: left;
          font-size: 0.82rem;
          line-height: 1.5;
          color: var(--gco-ink-muted);
          background: var(--gco-fill-quaternary);
          border: 1px solid var(--gco-hairline);
          border-radius: 12px;
          padding: 0.7rem 0.85rem;
          margin-bottom: 16px;
          font-family: var(--font-mono);
        }
        .gco-result-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .gco-confetti {
          position: absolute;
          top: 20px; left: 50%;
          width: 0; height: 0;
        }
        .gco-confetti span {
          position: absolute;
          width: 6px; height: 10px;
          background: var(--gco-primary);
          opacity: 0;
          animation: gco-confetti-burst 0.9s ease-out forwards;
        }
        .gco-confetti span:nth-child(2n) { background: var(--gco-secondary); }
        .gco-confetti span:nth-child(3n) { background: var(--gco-accent); }
        @keyframes gco-confetti-burst {
          0% { opacity: 1; transform: translate(0,0) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--tx,60px), var(--ty,-70px)) rotate(180deg); }
        }
      `}</style>

      <header className="gco-map-header">
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
        <div className="gco-map-header-right">
          {phase === 'play' && streak >= 2 && <span className="gco-streak-pill">🔥 {streak}</span>}
          {phase === 'play' && useTimer && (
            <span className={`mono gco-timer-chip ${timeLeft <= 10 ? 'danger' : timeLeft <= 20 ? 'warn' : ''}`}>⏱ {timeLeft}s</span>
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

      {phase === 'play' && useTimer && (
        <div className="gco-timer-track">
          <div className="gco-timer-fill" style={{ width: `${Math.max(0, (timeLeft / timerMax) * 100)}%` }} />
        </div>
      )}

      <AnimatePresence>
        {showLevelPicker && phase === 'setup' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
          >
            <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.5rem' }}>Elige nivel · marca a superar</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
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
              {unlockedRows.map((u) => {
                const kind = KIND_ORDER[(u.level - 1) % KIND_ORDER.length]
                const km = KIND_META[kind]
                return (
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
                    <span className="gco-level-dot" style={{ background: km.color }} />
                    Nv. {u.level}
                    <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                      {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="gco-map-hero" style={{ marginBottom: '1rem' }}>
              <div className="gco-map-float-deco" aria-hidden>
                <span>🧭</span>
                <span>🕸️</span>
                <span>🚶</span>
                <span>🗂️</span>
              </div>
              <h2 style={{ textAlign: 'center', marginBottom: 8, position: 'relative' }}>🗺️ Mapas mentales</h2>
              <p style={{ textAlign: 'center', color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.5, position: 'relative' }}>
                Relaciones espaciales, grafos y restricciones. Visualiza el esquema y deduce la respuesta.
              </p>
              <div className="gco-map-chip-row">
                {KIND_ORDER.map((k) => {
                  const km = KIND_META[k]
                  return (
                    <span key={k} className="gco-map-chip" style={{ background: km.dim, color: km.color }}>
                      {km.icon} {km.label}
                    </span>
                  )
                })}
              </div>
              <div className="gco-diff-dots" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={i <= tier ? 'on' : ''} />
                ))}
              </div>
              {bestForLevel != null && bestForLevel > 0 && (
                <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--gco-primary)', fontSize: '0.9rem', position: 'relative' }}>
                  🏆 <span className="mono">{formatDuration(bestForLevel)}</span>
                </p>
              )}
            </div>
            <GlassCard>
              <div style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                      transition: 'background 0.2s ease',
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
                      }}
                    />
                  </button>
                </div>
                <GlassButton onClick={() => startLevel(Math.min(level, maxSelectable), 0)} style={{ minHeight: 48 }}>
                  Empezar · Nv. {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && levelData && (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="gco-kind-pill" style={{ background: meta.dim, color: meta.color }}>
              <span>{meta.icon}</span> {meta.label}
            </div>
            <GlassCard>
              <div className="gco-map-panel" style={{ borderTopColor: meta.color }}>
                <p className="gco-map-intro">{levelData.intro}</p>

                {levelData.visual.type === 'direction' && (
                  <DirectionVisual points={levelData.visual.points} from={levelData.visual.from} to={levelData.visual.to} />
                )}
                {levelData.visual.type === 'graph' && (
                  <GraphVisual nodes={levelData.visual.nodes} edges={levelData.visual.edges} highlight={levelData.visual.highlight} />
                )}
                {levelData.visual.type === 'order' && <OrderVisual count={levelData.visual.count} />}
                {levelData.visual.type === 'grid' && (
                  <GridVisual rows={levelData.visual.rows} cols={levelData.visual.cols} casillas={levelData.visual.casillas} />
                )}

                <ul className="gco-clue-list">
                  {levelData.clueLines.map((c, i) => (
                    <li key={i} className="gco-clue-item" style={{ animationDelay: `${i * 0.06}s` }}>
                      <span className="gco-clue-dot" style={{ background: meta.color }} />
                      {c}
                    </li>
                  ))}
                </ul>

                <div className="gco-question-box" style={{ borderColor: meta.color }}>
                  {levelData.question}
                </div>

                <div className="gco-option-list">
                  {levelData.options.map((o, i) => {
                    const isCorrectOpt = i === levelData.correctIndex
                    const isSelected = i === selected
                    let cls = 'gco-option-btn'
                    if (selected !== null) {
                      if (isCorrectOpt) cls += ' correct'
                      else if (isSelected) cls += ' incorrect'
                      else cls += ' dimmed'
                    }
                    return (
                      <button key={i} type="button" className={cls} disabled={selected !== null} onClick={() => submit(i)}>
                        <span className="gco-option-letter">{String.fromCharCode(65 + i)}</span>
                        {o}
                      </button>
                    )
                  })}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && levelData && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div className="gco-result-panel">
                {isCorrect && (
                  <div className="gco-confetti" aria-hidden>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const angle = (i * 36 * Math.PI) / 180
                      const tx = Math.cos(angle) * 70
                      const ty = Math.sin(angle) * 70
                      return <span key={i} style={{ animationDelay: `${i * 0.03}s`, ['--tx' as any]: `${tx}px`, ['--ty' as any]: `${ty}px` }} />
                    })}
                  </div>
                )}
                <div className={`gco-result-badge ${isCorrect ? 'success' : 'fail'}`}>{isCorrect ? '🎉' : '❌'}</div>
                <p className="gco-result-title" style={{ color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)' }}>
                  {isCorrect ? '¡Correcto!' : 'No es así…'}
                </p>
                <p className="gco-result-time mono">{formatDuration(Date.now() - startRef.current)}</p>
                <div className="gco-explain-box">{levelData.explanation}</div>
                <div className="gco-result-actions">
                  {isCorrect ? (
                    <GlassButton
                      onClick={() => {
                        soundClick()
                        startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)
                      }}
                    >
                      Siguiente nivel →
                    </GlassButton>
                  ) : (
                    <GlassButton
                      onClick={() => {
                        soundClick()
                        startLevel(level, attempt + 1)
                      }}
                    >
                      🔄 Otro mapa (mismo nivel)
                    </GlassButton>
                  )}
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

export default MapasGame