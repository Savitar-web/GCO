/* ═══════════════════════════════════════════════════════════════════════════
   DESPEJES — Módulo de lógica autocontenido
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Este archivo NO importa nada de `generateLevel.ts` ni de ningún otro
 * módulo compartido: trae su propio RNG determinista, sus propios tipos y
 * toda la lógica de generación/validación de los 9 minijuegos de Despejes.
 * Es un módulo de datos/lógica puro (sin JSX) — el componente visual que
 * lo consume vive en otro archivo y debe importar desde aquí.
 *
 * Contenido:
 *   0) RNG y utilidades compartidas
 *   1) Laberinto      — empuja rocas a huecos, con niebla de guerra opcional
 *   2) Croma          — gemas de color hasta su meta
 *   3) Pintar         — colorea figuras con celdas obstruidas
 *   4) Hielo          — desliza hasta la meta (rediseñado: ya no es trivial)
 *   5) Interruptores  — abre puertas para llegar a la meta
 *   6) Teletransportadores — rediseñado: el cruce SOLO es posible vía portal
 *   7) Láser          — gira espejos para alcanzar el objetivo
 *   8) Circuitos      — gira piezas para conectar fuente y objetivo
 *                        (bug corregido: la pieza fuente no conectaba con
 *                        el resto del camino; ahora además es rotable)
 *   9) Personaje       — piel emoji o carácter propio de un solo grafema
 *  10) Cruceta (D-Pad) — tamaño/separación configurables, persistentes
 *  11) Camino único    — recorre cada casilla una vez (ahora con
 *                        obstáculos reales que preservan la solución)
 *
 * Principio de diseño compartido por todos los generadores: cada nivel se
 * construye a partir de un estado con solución conocida (o se valida con
 * BFS/backtracking antes de devolverlo), así que ningún nivel generado
 * puede llegar a ser imposible de resolver.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════════════════════════════
   0) RNG y utilidades compartidas
   ═══════════════════════════════════════════════════════════════════════════ */

/** PRNG determinista (mulberry32) — mismo algoritmo que el resto del motor. */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function levelSeed(level: number, salt = 0) {
  return ((level * 7919 + salt * 104729) >>> 0) || 1
}

/** mm:ss — formateo de tiempo. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export const DIRECTION_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}

const DIR_ROTATE: Record<Direction, Direction> = { up: 'right', right: 'down', down: 'left', left: 'up' }
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** Baraja un arreglo con un rng dado (Fisher–Yates), sin mutar el original. */
function shuffledArray<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function clampNum(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export interface MazeCoord {
  row: number
  col: number
}

export type GridPos = MazeCoord

/* ═══════════════════════════════════════════════════════════════════════════
   1) LABERINTO — laberinto perfecto + rocas que caen en huecos
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Inspirado en los puzzles de rocas de Pokémon: cada nivel es un laberinto
 * perfecto (un único camino base, con atajos añadidos por "trenzado" en
 * niveles altos), sembrado con rocas que bloquean ese camino y solo pueden
 * despejarse empujándolas a un hueco cercano. La colocación de rocas se
 * valida simulando el despeje en orden, así que el nivel SIEMPRE es
 * resoluble.
 */

export type MazeCellType = 'wall' | 'floor' | 'hole'

export type MazeObstacleKind = 'boulder' | 'glass'

export interface MazeBoulder {
  id: string
  /** 'boulder' debe encajar en un hueco específico; 'glass' se rompe con un solo empujón hacia cualquier casilla libre. */
  kind: MazeObstacleKind
  row: number
  col: number
  holeRow: number
  holeCol: number
  cleared: boolean
}

export interface LaberintoLevel {
  level: number
  rows: number
  cols: number
  grid: MazeCellType[][]
  start: MazeCoord
  exit: MazeCoord
  boulders: MazeBoulder[]
  /** Radio de niebla de guerra en casillas (0 = sin niebla, mapa visible) */
  fogRadius: number
  moveLimit: number
  targetSeconds: number
  /** Límite real de contrarreloj en segundos (siempre bastante mayor que targetSeconds, para ser justo). */
  timeLimitSeconds: number
  goal: string
  seed: number
}

function carveMaze(rooms: number, rng: () => number): MazeCellType[][] {
  const W = rooms * 2 + 1
  const H = rooms * 2 + 1
  const grid: MazeCellType[][] = Array.from({ length: H }, () => Array<MazeCellType>(W).fill('wall'))
  const visited = Array.from({ length: rooms }, () => Array<boolean>(rooms).fill(false))
  const stack: [number, number][] = [[0, 0]]
  visited[0][0] = true
  grid[1][1] = 'floor'
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]

  while (stack.length) {
    const [r, c] = stack[stack.length - 1]
    const order = shuffledArray(dirs, rng)
    let moved = false
    for (const [dr, dc] of order) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rooms || nc < 0 || nc >= rooms) continue
      if (visited[nr][nc]) continue
      visited[nr][nc] = true
      grid[1 + r * 2 + dr][1 + c * 2 + dc] = 'floor'
      grid[1 + nr * 2][1 + nc * 2] = 'floor'
      stack.push([nr, nc])
      moved = true
      break
    }
    if (!moved) stack.pop()
  }
  return grid
}

function braidMaze(grid: MazeCellType[][], rng: () => number, extraRatio: number) {
  const H = grid.length
  const W = grid[0].length
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      if (grid[r][c] !== 'wall') continue
      if (r % 2 === 1 && c % 2 === 0) {
        if (grid[r][c - 1] === 'floor' && grid[r][c + 1] === 'floor' && rng() < extraRatio) grid[r][c] = 'floor'
      } else if (r % 2 === 0 && c % 2 === 1) {
        if (grid[r - 1][c] === 'floor' && grid[r + 1][c] === 'floor' && rng() < extraRatio) grid[r][c] = 'floor'
      }
    }
  }
}

function mazeBfsPath(grid: MazeCellType[][], start: MazeCoord, goal: MazeCoord): MazeCoord[] | null {
  const H = grid.length
  const W = grid[0].length
  const key = (r: number, c: number) => r * W + c
  const prev = new Map<number, number>()
  const seen = new Set<number>([key(start.row, start.col)])
  const queue: MazeCoord[] = [start]
  let qi = 0
  while (qi < queue.length) {
    const { row: r, col: c } = queue[qi++]
    if (r === goal.row && c === goal.col) break
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
      if (grid[nr][nc] === 'wall') continue
      const k = key(nr, nc)
      if (seen.has(k)) continue
      seen.add(k)
      prev.set(k, key(r, c))
      queue.push({ row: nr, col: nc })
    }
  }
  const gk = key(goal.row, goal.col)
  if (!seen.has(gk)) return null
  const path: MazeCoord[] = []
  let cur = gk
  const sk = key(start.row, start.col)
  while (cur !== sk) {
    path.push({ row: Math.floor(cur / W), col: cur % W })
    cur = prev.get(cur)!
  }
  path.push(start)
  path.reverse()
  return path
}

function simulateMazeClear(grid: MazeCellType[][], boulders: MazeBoulder[], start: MazeCoord, exit: MazeCoord): boolean {
  const work = grid.map((row) => row.slice())
  for (const b of boulders) {
    work[b.row][b.col] = 'wall'
    // Un hueco SIN rellenar no es transitable (igual que en el juego real,
    // ver isMazeWalkable) — hay que bloquearlo aquí también, o la
    // simulación podría "colar" un camino que en la partida real está
    // cerrado porque ese hueco aún pertenece a una roca sin empujar.
    if (b.kind === 'boulder') work[b.holeRow][b.holeCol] = 'wall'
  }
  let cur = start
  for (const b of boulders) {
    const from = boulderApproach(b)
    const path = mazeBfsPath(work, cur, from)
    if (!path) return false
    // La celda de destino del empujón también debe estar libre EN ESE
    // MOMENTO: si otro obstáculo todavía activo (procesado después en el
    // orden) ocupa justo esa celda, el empujón fallaría en el juego real
    // aunque el camino hasta el punto de aproximación sí exista.
    if (work[b.holeRow][b.holeCol] === 'wall') return false
    work[b.row][b.col] = 'floor'
    if (b.kind === 'boulder') work[b.holeRow][b.holeCol] = 'floor'
    cur = { row: b.row, col: b.col }
  }
  return !!mazeBfsPath(work, cur, exit)
}

function boulderApproach(b: MazeBoulder): MazeCoord {
  const dr = b.holeRow - b.row
  const dc = b.holeCol - b.col
  return { row: b.row - dr, col: b.col - dc }
}

/** Distancias BFS desde `start` a cada celda transitable (−1 = inalcanzable). */
function mazeBfsDistances(grid: MazeCellType[][], start: MazeCoord): Int32Array {
  const H = grid.length
  const W = grid[0].length
  const dist = new Int32Array(H * W).fill(-1)
  const key = (r: number, c: number) => r * W + c
  dist[key(start.row, start.col)] = 0
  const queue: MazeCoord[] = [start]
  let qi = 0
  while (qi < queue.length) {
    const { row: r, col: c } = queue[qi++]
    const dHere = dist[key(r, c)]
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
      if (grid[nr][nc] === 'wall') continue
      const k = key(nr, nc)
      if (dist[k] !== -1) continue
      dist[k] = dHere + 1
      queue.push({ row: nr, col: nc })
    }
  }
  return dist
}

/** La celda transitable más lejana de `start` (para colocar la salida bien alejada, nunca "a la vuelta de la esquina"). */
function farthestFloorCell(grid: MazeCellType[][], start: MazeCoord): MazeCoord {
  const W = grid[0].length
  const dist = mazeBfsDistances(grid, start)
  let best = start
  let bestDist = -1
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < W; c++) {
      const d = dist[r * W + c]
      if (d > bestDist) {
        bestDist = d
        best = { row: r, col: c }
      }
    }
  }
  return best
}

/**
 * Coloca rocas y cristales SIEMPRE exigiendo el mayor rodeo posible: para
 * cada obstáculo, en vez de aceptar la primera colocación válida (como
 * hacía la versión anterior — por eso terminaban muy cerca del jugador o
 * en zonas de paso trivial), se evalúan varios candidatos y se elige el
 * que obliga a caminar más lejos desde la posición actual para alcanzar el
 * punto de empuje. La validez (que el nivel siga siendo 100% resoluble en
 * orden) se sigue comprobando en cada paso con `simulateMazeClear`.
 */
function placeMazeBoulders(grid: MazeCellType[][], path: MazeCoord[], count: number, glassRatio: number, rng: () => number, start: MazeCoord, exit: MazeCoord): MazeBoulder[] {
  const H = grid.length
  const W = grid[0].length
  const pathSet = new Set(path.map((p) => p.row * W + p.col))
  const placed: MazeBoulder[] = []
  let idCounter = 0
  let cursor = start

  const rawCandidates: { p: MazeCoord; dr: number; dc: number }[] = []
  for (const p of path.slice(1, -1)) {
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      rawCandidates.push({ p, dr, dc })
    }
  }

  for (let slot = 0; slot < count; slot++) {
    const sampled = shuffledArray(rawCandidates, rng).slice(0, 90)
    let best: { boulder: MazeBoulder; score: number } | null = null

    for (const { p, dr, dc } of sampled) {
      if (placed.some((b) => b.row === p.row && b.col === p.col)) continue
      const kind: MazeObstacleKind = rng() < glassRatio ? 'glass' : 'boulder'
      const hr = p.row + dr
      const hc = p.col + dc
      if (hr < 0 || hr >= H || hc < 0 || hc >= W) continue
      if (grid[hr][hc] === 'wall') continue
      const fr = p.row - dr
      const fc = p.col - dc
      if (fr < 0 || fr >= H || fc < 0 || fc >= W) continue
      if (grid[fr][fc] === 'wall') continue

      if (kind === 'boulder') {
        if (pathSet.has(hr * W + hc)) continue
        if (placed.some((b) => b.kind === 'boulder' && b.holeRow === hr && b.holeCol === hc)) continue
      }

      const candidate: MazeBoulder = { id: `b${idCounter}`, kind, row: p.row, col: p.col, holeRow: hr, holeCol: hc, cleared: false }
      const trial = [...placed, candidate]
      if (!simulateMazeClear(grid, trial, start, exit)) continue

      const work = grid.map((row) => row.slice())
      for (const b of placed) {
        work[b.row][b.col] = 'wall'
        if (b.kind === 'boulder') work[b.holeRow][b.holeCol] = 'wall'
      }
      const approachPath = mazeBfsPath(work, cursor, { row: fr, col: fc })
      const score = approachPath ? approachPath.length : -1
      if (score < 0) continue
      if (!best || score > best.score) best = { boulder: candidate, score }
    }

    if (!best) continue
    placed.push(best.boulder)
    idCounter++
    cursor = { row: best.boulder.row, col: best.boulder.col }
  }
  return placed
}

export function getLaberintoDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const rooms = Math.min(5 + Math.floor(lv / 1.8), 26)
  const braidRatio = Math.min(0.03 + lv * 0.011, 0.4)
  const boulderCount = Math.min(1 + Math.floor(lv / 2.2), 16)
  const glassRatio = lv < 4 ? 0 : Math.min(0.12 + lv * 0.01, 0.42)
  const fogRadius = lv >= 22 ? Math.max(2, 6 - Math.floor((lv - 22) / 9)) : 0
  const moveLimit = lv <= 4 ? 0 : Math.round(rooms * rooms * 2.6 + boulderCount * 7)
  const targetSeconds = Math.max(22, Math.round(rooms * rooms * 1.7 + boulderCount * 9))
  const timeLimitSeconds = Math.round(targetSeconds * 2.1 + 15)
  return { rooms, braidRatio, boulderCount, glassRatio, fogRadius, moveLimit, targetSeconds, timeLimitSeconds }
}

export function generateLaberintoLevel(level: number, opts?: { seedSalt?: number }): LaberintoLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 8100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getLaberintoDifficulty(lv)

  const grid = carveMaze(d.rooms, rng)
  braidMaze(grid, rng, d.braidRatio)

  const start: MazeCoord = { row: 1, col: 1 }
  const exit = farthestFloorCell(grid, start)
  const path = mazeBfsPath(grid, start, exit) ?? [start, exit]

  const boulders = placeMazeBoulders(grid, path, d.boulderCount, d.glassRatio, rng, start, exit)
  for (const b of boulders) if (b.kind === 'boulder') grid[b.holeRow][b.holeCol] = 'hole'

  const boulderKinds = new Set(boulders.map((b) => b.kind))
  const goalParts: string[] = []
  if (boulderKinds.has('boulder')) goalParts.push('empuja las rocas a sus huecos')
  if (boulderKinds.has('glass')) goalParts.push('rompe los cristales empujándolos')
  const goal = goalParts.length > 0 ? `${goalParts.join(' y ')} para llegar a la salida antes de que se acabe el tiempo.` : 'Encuentra el camino hasta la salida antes de que se acabe el tiempo.'

  return {
    level: lv,
    rows: grid.length,
    cols: grid[0].length,
    grid,
    start,
    exit,
    boulders,
    fogRadius: d.fogRadius,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    timeLimitSeconds: d.timeLimitSeconds,
    goal,
    seed,
  }
}

export function isMazeWalkable(level: LaberintoLevel, boulders: MazeBoulder[], row: number, col: number): boolean {
  if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) return false
  const cell = level.grid[row][col]
  if (cell === 'wall') return false
  if (boulders.some((b) => !b.cleared && b.row === row && b.col === col)) return false
  if (cell === 'hole') return boulders.some((b) => b.cleared && b.holeRow === row && b.holeCol === col)
  return true
}

export interface MazeMoveResult {
  player: MazeCoord
  boulders: MazeBoulder[]
  moved: boolean
  pushed: boolean
}

export function laberintoStep(level: LaberintoLevel, boulders: MazeBoulder[], player: MazeCoord, dir: Direction): MazeMoveResult {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const targetRow = player.row + dr
  const targetCol = player.col + dc
  const noMove: MazeMoveResult = { player, boulders, moved: false, pushed: false }

  if (targetRow < 0 || targetRow >= level.rows || targetCol < 0 || targetCol >= level.cols) return noMove
  if (level.grid[targetRow][targetCol] === 'wall') return noMove

  const boulderHere = boulders.find((b) => !b.cleared && b.row === targetRow && b.col === targetCol)

  if (boulderHere) {
    const beyondRow = targetRow + dr
    const beyondCol = targetCol + dc
    if (beyondRow < 0 || beyondRow >= level.rows || beyondCol < 0 || beyondCol >= level.cols) return noMove
    const beyondType = level.grid[beyondRow][beyondCol]
    if (beyondType === 'wall') return noMove
    const otherBoulder = boulders.find((b) => !b.cleared && b.row === beyondRow && b.col === beyondCol)
    if (otherBoulder) return noMove

    if (boulderHere.kind === 'glass') {
      // El cristal se rompe con un solo empujón hacia cualquier casilla libre (no necesita un hueco específico).
      const nextBoulders = boulders.map((b) => (b.id === boulderHere.id ? { ...b, row: beyondRow, col: beyondCol, cleared: true } : b))
      return { player: { row: targetRow, col: targetCol }, boulders: nextBoulders, moved: true, pushed: true }
    }

    if (beyondType === 'hole') {
      const nextBoulders = boulders.map((b) => (b.id === boulderHere.id ? { ...b, row: beyondRow, col: beyondCol, cleared: true } : b))
      return { player: { row: targetRow, col: targetCol }, boulders: nextBoulders, moved: true, pushed: true }
    }
    const nextBoulders = boulders.map((b) => (b.id === boulderHere.id ? { ...b, row: beyondRow, col: beyondCol } : b))
    return { player: { row: targetRow, col: targetCol }, boulders: nextBoulders, moved: true, pushed: true }
  }

  if (!isMazeWalkable(level, boulders, targetRow, targetCol)) return noMove
  return { player: { row: targetRow, col: targetCol }, boulders, moved: true, pushed: false }
}

export function isMazeComplete(player: MazeCoord, exit: MazeCoord): boolean {
  return player.row === exit.row && player.col === exit.col
}

export function visibleMazeCells(level: LaberintoLevel, player: MazeCoord): Set<number> {
  const visible = new Set<number>()
  const W = level.cols
  if (level.fogRadius <= 0) {
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) visible.add(r * W + c)
    return visible
  }
  for (let r = Math.max(0, player.row - level.fogRadius); r <= Math.min(level.rows - 1, player.row + level.fogRadius); r++) {
    for (let c = Math.max(0, player.col - level.fogRadius); c <= Math.min(level.cols - 1, player.col + level.fogRadius); c++) {
      if (Math.max(Math.abs(r - player.row), Math.abs(c - player.col)) <= level.fogRadius) visible.add(r * W + c)
    }
  }
  return visible
}

export function calcLaberintoStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   2) CROMA — gemas de color que deben llegar a su meta
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CromaColorDef {
  id: string
  hue: number
  label: string
}

export const GEM_COLORS: CromaColorDef[] = [
  { id: 'rosa', hue: 340, label: 'Rosa' },
  { id: 'cian', hue: 190, label: 'Cian' },
  { id: 'ambar', hue: 40, label: 'Ámbar' },
  { id: 'violeta', hue: 265, label: 'Violeta' },
  { id: 'lima', hue: 95, label: 'Lima' },
  { id: 'coral', hue: 12, label: 'Coral' },
  { id: 'azul', hue: 220, label: 'Azul' },
  { id: 'fucsia', hue: 320, label: 'Fucsia' },
  { id: 'oliva', hue: 70, label: 'Oliva' },
  { id: 'turquesa', hue: 172, label: 'Turquesa' },
  { id: 'rojo', hue: 0, label: 'Rojo' },
  { id: 'amarillo', hue: 55, label: 'Amarillo' },
  { id: 'esmeralda', hue: 150, label: 'Esmeralda' },
  { id: 'celeste', hue: 205, label: 'Celeste' },
  { id: 'indigo', hue: 250, label: 'Índigo' },
  { id: 'magenta', hue: 300, label: 'Magenta' },
  { id: 'naranja', hue: 25, label: 'Naranja' },
  { id: 'menta', hue: 165, label: 'Menta' },
  { id: 'ciruela', hue: 285, label: 'Ciruela' },
  { id: 'mostaza', hue: 48, label: 'Mostaza' },
]

export function gemHue(colorId: string): number {
  return GEM_COLORS.find((g) => g.id === colorId)?.hue ?? 200
}

export interface Gem {
  id: string
  color: string
  row: number
  col: number
}

export interface CromaGoal {
  color: string
  row: number
  col: number
}

export interface CromaLevel {
  level: number
  rows: number
  cols: number
  obstacles: MazeCoord[]
  gems: Gem[]
  goals: CromaGoal[]
  shuffleMoves: number
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function getCromaDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(5 + Math.floor(lv / 4), 11)
  const gemCount = Math.min(2 + Math.floor(lv / 2.4), GEM_COLORS.length)
  const obstacleCount = Math.min(Math.floor(lv / 1.6), Math.floor(size * size * 0.3))
  const shuffleMoves = Math.min(10 + lv * 4, 320)
  const moveLimit = Math.round(shuffleMoves * 1.9 + gemCount * 4)
  const targetSeconds = Math.max(18, Math.round(shuffleMoves * 0.9 + gemCount * 3))
  return { size, gemCount, obstacleCount, shuffleMoves, moveLimit, targetSeconds }
}

function isBorderCell(row: number, col: number, size: number) {
  return row === 0 || col === 0 || row === size - 1 || col === size - 1
}

export function generateCromaLevel(level: number, opts?: { seedSalt?: number }): CromaLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 9100 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getCromaDifficulty(lv)
  const size = d.size

  const borderCells: MazeCoord[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isBorderCell(r, c, size)) borderCells.push({ row: r, col: c })
    }
  }
  const borderShuffled = shuffledArray(borderCells, rng)
  const colors = shuffledArray(GEM_COLORS, rng).slice(0, d.gemCount)
  const goals: CromaGoal[] = colors.map((c, i) => ({ color: c.id, row: borderShuffled[i].row, col: borderShuffled[i].col }))
  const occupied = new Set(goals.map((g) => g.row * size + g.col))

  const interiorCells: MazeCoord[] = []
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (!occupied.has(r * size + c)) interiorCells.push({ row: r, col: c })
    }
  }
  const obstacles = shuffledArray(interiorCells, rng).slice(0, d.obstacleCount)
  for (const o of obstacles) occupied.add(o.row * size + o.col)

  let gems: Gem[] = goals.map((g, i) => ({ id: `g${i}`, color: g.color, row: g.row, col: g.col }))

  const blocked = new Set(obstacles.map((o) => o.row * size + o.col))
  const dirs: Direction[] = ['up', 'down', 'left', 'right']

  let applied = 0
  let guard = 0
  while (applied < d.shuffleMoves && guard < d.shuffleMoves * 12) {
    guard++
    const gemIdx = Math.floor(rng() * gems.length)
    const dir = dirs[Math.floor(rng() * 4)]
    const { dr, dc } = DIRECTION_DELTA[dir]
    const gem = gems[gemIdx]
    const nr = gem.row + dr
    const nc = gem.col + dc
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
    if (blocked.has(nr * size + nc)) continue
    if (gems.some((g) => g.row === nr && g.col === nc)) continue
    gems = gems.map((g, i) => (i === gemIdx ? { ...g, row: nr, col: nc } : g))
    applied++
  }

  return {
    level: lv,
    rows: size,
    cols: size,
    obstacles,
    gems,
    goals,
    shuffleMoves: d.shuffleMoves,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    goal: 'Lleva cada gema a su meta del mismo color esquivando los bloques.',
    seed,
  }
}

export function cromaTryMove(level: CromaLevel, gems: Gem[], gemId: string, dir: Direction): Gem[] | null {
  const gem = gems.find((g) => g.id === gemId)
  if (!gem) return null
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = gem.row + dr
  const nc = gem.col + dc
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return null
  if (level.obstacles.some((o) => o.row === nr && o.col === nc)) return null
  if (gems.some((g) => g.id !== gemId && g.row === nr && g.col === nc)) return null
  return gems.map((g) => (g.id === gemId ? { ...g, row: nr, col: nc } : g))
}

export function cromaIsComplete(level: CromaLevel, gems: Gem[]): boolean {
  return gems.every((g) => level.goals.some((goal) => goal.color === g.color && goal.row === g.row && goal.col === g.col))
}

export function calcCromaStars(moves: number, timeMs: number, targetSeconds: number, shuffleMoves: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= Math.max(shuffleMoves, 4) * 1.3) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   3) PINTAR — colorea figuras con celdas obstruidas
   ═══════════════════════════════════════════════════════════════════════════ */

export type PaintShapeId =
  | 'cuadro'
  | 'cruz'
  | 'diamante'
  | 'anillo'
  | 'corazon'
  | 'estrella'
  | 'reloj_arena'
  | 'mosaico'
  | 'anillo_grande'
  | 'copo'

export const PAINT_SHAPES: Record<PaintShapeId, string[]> = {
  cuadro: ['11111', '11111', '11111', '11111', '11111'],
  cruz: ['00100', '00100', '11111', '00100', '00100'],
  diamante: ['00100', '01110', '11111', '01110', '00100'],
  anillo: ['11111', '10001', '10001', '10001', '11111'],
  corazon: ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'],
  estrella: ['0001000', '0001000', '1111111', '0111110', '0110110', '0100010', '1000001'],
  reloj_arena: ['1111111', '0111110', '0011100', '0001000', '0011100', '0111110', '1111111'],
  mosaico: ['111111111', '111111111', '111111111', '111111111', '111111111', '111111111', '111111111', '111111111', '111111111'],
  anillo_grande: [
    '111111111',
    '100000001',
    '101111101',
    '101000101',
    '101010101',
    '101000101',
    '101111101',
    '100000001',
    '111111111',
  ],
  copo: [
    '000101000',
    '000101000',
    '100101001',
    '010101010',
    '111111111',
    '010101010',
    '100101001',
    '000101000',
    '000101000',
  ],
}

const SMALL_SHAPE_ORDER: PaintShapeId[] = ['cuadro', 'cruz', 'diamante', 'anillo']
const BIG_SHAPE_ORDER: PaintShapeId[] = ['corazon', 'estrella', 'reloj_arena', 'mosaico', 'anillo_grande', 'copo']
const PAINT_SHAPE_ORDER: PaintShapeId[] = ['cuadro', 'cruz', 'diamante', 'anillo', 'corazon', 'estrella', 'reloj_arena']

export const PAINT_PALETTE: CromaColorDef[] = [
  { id: 'p1', hue: 340, label: 'Rosa' },
  { id: 'p2', hue: 190, label: 'Cian' },
  { id: 'p3', hue: 40, label: 'Ámbar' },
  { id: 'p4', hue: 265, label: 'Violeta' },
  { id: 'p5', hue: 95, label: 'Lima' },
  { id: 'p6', hue: 12, label: 'Coral' },
  { id: 'p7', hue: 220, label: 'Azul' },
  { id: 'p8', hue: 320, label: 'Fucsia' },
  { id: 'p9', hue: 0, label: 'Rojo' },
  { id: 'p10', hue: 60, label: 'Amarillo' },
  { id: 'p11', hue: 150, label: 'Esmeralda' },
  { id: 'p12', hue: 172, label: 'Turquesa' },
  { id: 'p13', hue: 205, label: 'Celeste' },
  { id: 'p14', hue: 285, label: 'Índigo' },
  { id: 'p15', hue: 20, label: 'Naranja' },
  { id: 'p16', hue: 300, label: 'Magenta' },
  { id: 'p17', hue: 165, label: 'Menta' },
  { id: 'p18', hue: 250, label: 'Añil' },
  { id: 'p19', hue: 48, label: 'Mostaza' },
  { id: 'p20', hue: 355, label: 'Carmesí' },
  { id: 'p21', hue: 115, label: 'Musgo' },
  { id: 'p22', hue: 235, label: 'Cobalto' },
  { id: 'p23', hue: 10, label: 'Ladrillo' },
  { id: 'p24', hue: 310, label: 'Orquídea' },
]

export interface PaintCell {
  row: number
  col: number
  target: string
  current: string | null
  locked: boolean
  clearsNeeded: number
  clearsDone: number
}

export interface PintarLevel {
  level: number
  shape: PaintShapeId
  rows: number
  cols: number
  cells: PaintCell[]
  palette: CromaColorDef[]
  targetSeconds: number
  goal: string
  seed: number
}

function shapeActiveCells(mask: string[]): MazeCoord[] {
  const cells: MazeCoord[] = []
  mask.forEach((rowStr, r) => {
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] === '1') cells.push({ row: r, col: c })
    }
  })
  return cells
}

export function getPintarDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const pool = lv <= 6 ? SMALL_SHAPE_ORDER : lv <= 14 ? PAINT_SHAPE_ORDER : BIG_SHAPE_ORDER
  const shape = pool[(lv - 1) % pool.length]
  const colorCount = Math.min(2 + Math.floor(lv / 2.2), PAINT_PALETTE.length)
  const obstructedRatio = Math.min(0.08 + lv * 0.016, 0.5)
  const clearsNeeded = lv < 8 ? 1 : lv < 18 ? 2 : lv < 30 ? 3 : 4
  const targetSeconds = Math.max(20, Math.round(shapeActiveCells(PAINT_SHAPES[shape]).length * 2.4))
  return { shape, colorCount, obstructedRatio, clearsNeeded, targetSeconds }
}

export function generatePintarLevel(level: number, opts?: { seedSalt?: number }): PintarLevel {
  const lv = Math.max(1, Math.floor(level))
  const seed = levelSeed(lv, 9700 + (opts?.seedSalt ?? 0))
  const rng = mulberry32(seed)
  const d = getPintarDifficulty(lv)
  const mask = PAINT_SHAPES[d.shape]
  const activeCells = shapeActiveCells(mask)
  const palette = PAINT_PALETTE.slice(0, d.colorCount)

  const cells: PaintCell[] = activeCells.map(({ row, col }) => {
    const target = palette[Math.floor(rng() * palette.length)].id
    const locked = rng() < d.obstructedRatio
    let startIdx = Math.floor(rng() * palette.length)
    if (palette[startIdx].id === target && palette.length > 1) startIdx = (startIdx + 1) % palette.length
    return {
      row,
      col,
      target,
      current: locked ? null : palette[startIdx].id,
      locked,
      clearsNeeded: locked ? d.clearsNeeded : 0,
      clearsDone: 0,
    }
  })

  return {
    level: lv,
    shape: d.shape,
    rows: mask.length,
    cols: mask[0].length,
    cells,
    palette,
    targetSeconds: d.targetSeconds,
    goal: 'Despeja los escombros y pinta cada celda del color objetivo.',
    seed,
  }
}

export function pintarTapCell(level: PintarLevel, row: number, col: number): PintarLevel {
  const cells = level.cells.map((cell) => {
    if (cell.row !== row || cell.col !== col) return cell
    if (cell.locked) {
      const clearsDone = cell.clearsDone + 1
      if (clearsDone >= cell.clearsNeeded) return { ...cell, locked: false, clearsDone, current: null }
      return { ...cell, clearsDone }
    }
    const idx = level.palette.findIndex((p) => p.id === cell.current)
    const nextIdx = idx < 0 ? 0 : (idx + 1) % level.palette.length
    return { ...cell, current: level.palette[nextIdx].id }
  })
  return { ...level, cells }
}

export function pintarIsComplete(level: PintarLevel): boolean {
  return level.cells.every((c) => !c.locked && c.current !== null && c.current === c.target)
}

export function pintarProgress(level: PintarLevel): { done: number; total: number } {
  const total = level.cells.length
  const done = level.cells.filter((c) => !c.locked && c.current === c.target).length
  return { done, total }
}

export function calcPintarStars(timeMs: number, targetSeconds: number, taps: number, cellCount: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && taps <= cellCount * 2.2) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   4) HIELO — Ice Slide Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * CORREGIDO: la versión anterior aceptaba cualquier candidato cuya solución
 * óptima (BFS) tuviera muy pocos "tramos" de hielo, así que casi todos los
 * niveles se resolvían en 1–3 deslizamientos sin importar el nivel. Ahora la
 * longitud mínima de solución y la densidad de obstáculos crecen mucho más
 * rápido con el nivel, y el tablero es más grande — cada nivel exige
 * planear varios rebotes antes de llegar a la meta.
 */

export type IceCellType = 'wall' | 'ice' | 'floor' | 'goal'

export interface IceSlideLevel {
  level: number
  rows: number
  cols: number
  grid: IceCellType[][]
  start: MazeCoord
  target: MazeCoord
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function iceSlideTarget(level: IceSlideLevel, pos: MazeCoord, dir: Direction): MazeCoord {
  const { dr, dc } = DIRECTION_DELTA[dir]
  let cur = pos
  while (true) {
    const nr = cur.row + dr
    const nc = cur.col + dc
    if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) break
    if (level.grid[nr][nc] === 'wall') break
    cur = { row: nr, col: nc }
    if (level.grid[nr][nc] !== 'ice') break
  }
  return cur
}

export function iceSlideBfs(level: IceSlideLevel): MazeCoord[] | null {
  const W = level.cols
  const key = (p: MazeCoord) => p.row * W + p.col
  const startKey = key(level.start)
  const targetKey = key(level.target)
  const prev = new Map<number, number>()
  const seen = new Set<number>([startKey])
  const queue: MazeCoord[] = [level.start]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    const ck = key(cur)
    if (ck === targetKey) break
    for (const dir of dirs) {
      const next = iceSlideTarget(level, cur, dir)
      const nk = key(next)
      if (nk === ck) continue
      if (seen.has(nk)) continue
      seen.add(nk)
      prev.set(nk, ck)
      queue.push(next)
    }
  }
  if (!seen.has(targetKey)) return null
  const path: MazeCoord[] = []
  let cur = targetKey
  while (cur !== startKey) {
    path.push({ row: Math.floor(cur / W), col: cur % W })
    const p = prev.get(cur)
    if (p === undefined) return null
    cur = p
  }
  path.push(level.start)
  path.reverse()
  return path
}

export function isIceSlideSolvable(level: IceSlideLevel): boolean {
  return iceSlideBfs(level) !== null
}

export function getIceSlideDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(9 + Math.floor(lv / 1.1), 33)
  // número de tramos de deslizamiento de la ruta garantizada (construida,
  // no encontrada por azar) — esto es lo que realmente fija la dificultad.
  const segments = Math.min(3 + Math.floor(lv / 1.7), 17)
  const decorCount = Math.min(2 + Math.floor(lv / 2.5), 14)
  const moveLimit = Math.round(segments * 1.6 + 4)
  const targetSeconds = Math.max(18, Math.round(16 + segments * 3.4))
  // longitud mínima de la solución óptima que se exige verificar (algo por
  // debajo de `segments`, ya que los obstáculos decorativos añadidos después
  // a veces abren un atajo legítimo de un tramo menos — eso sigue siendo
  // interesante, no es un fallo).
  const minPathLength = Math.max(2, Math.round(segments * 0.75))
  return { size, segments, decorCount, moveLimit, targetSeconds, minPathLength }
}

/**
 * Construye una ruta de deslizamientos GARANTIZADA: en cada tramo se elige
 * una dirección y una distancia, y se coloca una celda "suelo" (no-hielo)
 * exactamente en el punto de parada — así la ruta completa (inicio → ... →
 * meta) es, por construcción, una secuencia válida de deslizamientos, sin
 * depender de que el azar coloque obstáculos que por casualidad permitan
 * una ruta larga (que es lo que fallaba antes: con obstáculos puramente
 * aleatorios, la mayoría de los intentos no lograban una solución tan larga
 * como pedía el nivel, y el generador terminaba cayendo casi siempre a un
 * respaldo trivial sin obstáculos).
 */
function buildIceSlidePath(rows: number, cols: number, segments: number, rng: () => number): { grid: IceCellType[][]; start: MazeCoord; target: MazeCoord; achieved: number } {
  const grid: IceCellType[][] = Array.from({ length: rows }, () => Array<IceCellType>(cols).fill('ice'))
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = 'wall'

  let cur: MazeCoord = { row: 1 + Math.floor(rng() * (rows - 2)), col: 1 + Math.floor(rng() * (cols - 2)) }
  grid[cur.row][cur.col] = 'floor'
  const start = { ...cur }
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  let achieved = 0

  for (let i = 0; i < segments; i++) {
    // Cualquier dirección es válida: como cada parada intermedia se marca
    // como celda "suelo" (no-hielo), un deslizamiento SIEMPRE se detiene ahí
    // sin importar qué haya más allá — así que ni retroceder ni seguir
    // recto puede "saltarse" una parada y crear un atajo no intencional.
    const avail = shuffledArray(dirs, rng)
    let moved = false
    for (const dir of avail) {
      const { dr, dc } = DIRECTION_DELTA[dir]
      const dist = 2 + Math.floor(rng() * 2)
      const nr = cur.row + dr * dist
      const nc = cur.col + dc * dist
      if (nr <= 0 || nr >= rows - 1 || nc <= 0 || nc >= cols - 1) continue
      let clearPath = true
      for (let s = 1; s <= dist; s++) {
        const rr = cur.row + dr * s
        const cc = cur.col + dc * s
        if (grid[rr][cc] !== 'ice') {
          clearPath = false
          break
        }
      }
      if (!clearPath) continue
      cur = { row: nr, col: nc }
      grid[cur.row][cur.col] = 'floor'
      moved = true
      achieved++
      break
    }
    if (!moved) break
  }
  return { grid, start, target: { ...cur }, achieved }
}

export function generateIceSlideLevel(level: number, opts?: { seedSalt?: number }): IceSlideLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getIceSlideDifficulty(lv)
  const maxAttempts = 150
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 10100 + (opts?.seedSalt ?? 0) + attempt * 733)
    const rng = mulberry32(seed)
    const { grid, start, target, achieved } = buildIceSlidePath(d.size, d.size, d.segments, rng)
    // Filtro rápido: si el recorrido se atascó muy por debajo del objetivo,
    // ni siquiera vale la pena decorar y validar con BFS — se prueba
    // directamente con otra semilla (esto es barato, así que probar muchas
    // semillas es mucho más barato que antes).
    if (achieved < Math.max(2, Math.floor(d.segments * 0.75))) continue

    // Escombros decorativos: algunos muros y parches de suelo FUERA de la
    // ruta principal, para que el tablero no se vea vacío y para dar más
    // variedad — se verifica después que ninguno abra un atajo demasiado
    // corto.
    const decorGrid = grid.map((row) => row.slice())
    let placedDecor = 0
    let guard = 0
    while (placedDecor < d.decorCount && guard < d.decorCount * 15) {
      guard++
      const r = 1 + Math.floor(rng() * (d.size - 2))
      const c = 1 + Math.floor(rng() * (d.size - 2))
      if (decorGrid[r][c] !== 'ice') continue
      if ((r === start.row && c === start.col) || (r === target.row && c === target.col)) continue
      decorGrid[r][c] = rng() < 0.5 ? 'wall' : 'floor'
      placedDecor++
    }

    const finalGrid = decorGrid.map((row) => row.slice())
    finalGrid[target.row][target.col] = 'goal'

    const candidate: IceSlideLevel = {
      level: lv,
      rows: d.size,
      cols: d.size,
      grid: finalGrid,
      start,
      target,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Deslízate sobre el hielo hasta llegar a la meta.',
      seed,
    }
    const path = iceSlideBfs(candidate)
    if (path && path.length - 1 >= d.minPathLength) return candidate
  }

  // Respaldo garantizado: construcción simple sin decoración, siempre resoluble.
  const fallbackSeed = levelSeed(lv, 10999 + (opts?.seedSalt ?? 0))
  const fallbackRng = mulberry32(fallbackSeed)
  const size = Math.min(d.size, 13)
  const { grid, start, target } = buildIceSlidePath(size, size, Math.max(3, Math.floor(d.segments * 0.6)), fallbackRng)
  grid[target.row][target.col] = 'goal'
  return {
    level: lv,
    rows: size,
    cols: size,
    grid,
    start,
    target,
    moveLimit: 0,
    targetSeconds: Math.max(20, d.targetSeconds),
    goal: 'Deslízate sobre el hielo hasta llegar a la meta.',
    seed: fallbackSeed,
  }
}


export function calcIceSlideStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   5) INTERRUPTORES — Switch Puzzle
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SwitchDef {
  id: string
  row: number
  col: number
  doorIds: string[]
}

export interface DoorDef {
  id: string
  row: number
  col: number
  openInitially: boolean
}

export interface SwitchLevel {
  level: number
  rows: number
  cols: number
  grid: ('wall' | 'floor')[][]
  start: MazeCoord
  target: MazeCoord
  switches: SwitchDef[]
  doors: DoorDef[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export interface SwitchState {
  doorsOpen: Record<string, boolean>
}

export function switchInitialState(level: SwitchLevel): SwitchState {
  const doorsOpen: Record<string, boolean> = {}
  for (const d of level.doors) doorsOpen[d.id] = d.openInitially
  return { doorsOpen }
}

export function isSwitchWalkable(level: SwitchLevel, state: SwitchState, row: number, col: number): boolean {
  if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) return false
  if (level.grid[row][col] === 'wall') return false
  const door = level.doors.find((d) => d.row === row && d.col === col)
  if (door && !state.doorsOpen[door.id]) return false
  return true
}

export function switchStep(level: SwitchLevel, state: SwitchState, player: MazeCoord, dir: Direction): { player: MazeCoord; state: SwitchState; moved: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  if (!isSwitchWalkable(level, state, nr, nc)) return { player, state, moved: false }
  let nextState = state
  const sw = level.switches.find((s) => s.row === nr && s.col === nc)
  if (sw) {
    const doorsOpen = { ...state.doorsOpen }
    for (const id of sw.doorIds) doorsOpen[id] = !doorsOpen[id]
    nextState = { doorsOpen }
  }
  return { player: { row: nr, col: nc }, state: nextState, moved: true }
}

export function switchIsComplete(level: SwitchLevel, player: MazeCoord): boolean {
  return player.row === level.target.row && player.col === level.target.col
}

export function isSwitchLevelSolvable(level: SwitchLevel): boolean {
  const doorIds = level.doors.map((d) => d.id)
  const bitFor = (state: SwitchState) => doorIds.reduce((acc, id, i) => acc | ((state.doorsOpen[id] ? 1 : 0) << i), 0)
  const initial = switchInitialState(level)
  const startKey = `${level.start.row},${level.start.col},${bitFor(initial)}`
  const seen = new Set<string>([startKey])
  const queue: { player: MazeCoord; state: SwitchState }[] = [{ player: level.start, state: initial }]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    if (switchIsComplete(level, cur.player)) return true
    for (const dir of dirs) {
      const res = switchStep(level, cur.state, cur.player, dir)
      if (!res.moved) continue
      const k = `${res.player.row},${res.player.col},${bitFor(res.state)}`
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ player: res.player, state: res.state })
    }
  }
  return false
}

export function getSwitchDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const rooms = Math.min(4 + Math.floor(lv / 2), 16)
  const braidRatio = Math.min(0.05 + lv * 0.01, 0.3)
  const switchCount = Math.min(1 + Math.floor(lv / 2.5), 8)
  const decoySwitches = lv >= 6 ? Math.min(Math.floor((lv - 6) / 4) + 1, 5) : 0
  const size = rooms * 2 + 1
  const moveLimit = Math.round(size * size * 0.9 + switchCount * 16 + decoySwitches * 10)
  const targetSeconds = Math.max(22, Math.round(size * size * 1.05 + switchCount * 16 + decoySwitches * 12))
  return { rooms, braidRatio, switchCount, decoySwitches, moveLimit, targetSeconds }
}

/** BFS que trata las celdas de `blockedDoors` como muro (salvo que su índice esté en `openIdx`). */
function switchReachable(grid: ('wall' | 'floor')[][], doorCells: MazeCoord[], openIdx: Set<number>, start: MazeCoord): Map<number, number> {
  const rows = grid.length
  const cols = grid[0].length
  const key = (r: number, c: number) => r * cols + c
  const blocked = new Set<number>()
  doorCells.forEach((d, i) => {
    if (!openIdx.has(i)) blocked.add(key(d.row, d.col))
  })
  const dist = new Map<number, number>([[key(start.row, start.col), 0]])
  const queue: MazeCoord[] = [start]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    const d = dist.get(key(cur.row, cur.col))!
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nr = cur.row + dr
      const nc = cur.col + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      if (grid[nr][nc] === 'wall') continue
      const k = key(nr, nc)
      if (blocked.has(k)) continue
      if (dist.has(k)) continue
      dist.set(k, d + 1)
      queue.push({ row: nr, col: nc })
    }
  }
  return dist
}

export function generateSwitchLevel(level: number, opts?: { seedSalt?: number }): SwitchLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getSwitchDifficulty(lv)
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 11100 + (opts?.seedSalt ?? 0) + attempt * 619)
    const rng = mulberry32(seed)

    // Se reutiliza el mismo generador de laberinto perfecto que Laberinto:
    // un laberinto real (no una única pared vertical repetida) con algunos
    // atajos de "trenzado" para variar la forma.
    const grid = carveMaze(d.rooms, rng) as unknown as ('wall' | 'floor')[][]
    braidMaze(grid as unknown as MazeCellType[][], rng, d.braidRatio)

    const start: MazeCoord = { row: 1, col: 1 }
    const farExit = farthestFloorCell(grid as unknown as MazeCellType[][], start)
    const mainPath = mazeBfsPath(grid as unknown as MazeCellType[][], start, farExit)
    if (!mainPath || mainPath.length < d.switchCount * 3) continue

    // Puntos de puerta repartidos a lo largo del camino principal (nunca en
    // el propio inicio).
    const doorCells: MazeCoord[] = []
    for (let i = 0; i < d.switchCount; i++) {
      const idx = Math.round(((i + 1) * (mainPath.length - 1)) / (d.switchCount + 1))
      const cell = mainPath[Math.max(1, idx)]
      if (doorCells.some((c) => c.row === cell.row && c.col === cell.col)) continue
      doorCells.push(cell)
    }
    if (doorCells.length < Math.max(1, Math.floor(d.switchCount * 0.6))) continue

    const doors: DoorDef[] = doorCells.map((c, i) => ({ id: `door${i}`, row: c.row, col: c.col, openInitially: false }))
    const usedCells = new Set<number>([start.row * grid[0].length + start.col])
    const switches: SwitchDef[] = []
    const openIdx = new Set<number>()
    let ok = true

    for (let i = 0; i < doors.length; i++) {
      const reach = switchReachable(grid, doorCells, openIdx, start)
      // preferir colocaciones lejanas dentro de lo alcanzable (más exploración, no trivial)
      const options = Array.from(reach.entries())
        .filter(([k]) => !usedCells.has(k))
        .sort((a, b) => b[1] - a[1])
      if (options.length === 0) {
        ok = false
        break
      }
      const topN = options.slice(0, Math.min(6, options.length))
      const [key] = topN[Math.floor(rng() * topN.length)]
      const cols = grid[0].length
      const pos: MazeCoord = { row: Math.floor(key / cols), col: key % cols }
      usedCells.add(key)
      switches.push({ id: `sw${i}`, row: pos.row, col: pos.col, doorIds: [doors[i].id] })
      openIdx.add(i)
    }
    if (!ok) continue

    // Señuelos: interruptores adicionales, alcanzables al final, que
    // TAMBIÉN alternan una puerta real — si se pulsan en el momento
    // equivocado, pueden volver a cerrarla. Añaden riesgo real sin romper
    // la garantía de solvencia (se verifica con isSwitchLevelSolvable).
    const finalReach = switchReachable(grid, doorCells, openIdx, start)
    const finalOptions = Array.from(finalReach.entries()).filter(([k]) => !usedCells.has(k))
    for (let i = 0; i < d.decoySwitches && finalOptions.length > 0; i++) {
      const idx = Math.floor(rng() * finalOptions.length)
      const [key] = finalOptions.splice(idx, 1)[0]
      const cols = grid[0].length
      const pos: MazeCoord = { row: Math.floor(key / cols), col: key % cols }
      usedCells.add(key)
      const targetDoor = doors[Math.floor(rng() * doors.length)]
      switches.push({ id: `decoy${i}`, row: pos.row, col: pos.col, doorIds: [targetDoor.id] })
    }

    const targetReach = switchReachable(grid, doorCells, openIdx, start)
    let target: MazeCoord | null = null
    let bestDist = -1
    for (const [key, dist] of targetReach.entries()) {
      if (usedCells.has(key)) continue
      if (dist > bestDist) {
        bestDist = dist
        const cols = grid[0].length
        target = { row: Math.floor(key / cols), col: key % cols }
      }
    }
    if (!target) continue

    // Verificación explícita: con TODAS las puertas cerradas, la meta debe
    // ser inalcanzable. El "trenzado" del laberinto (atajos añadidos para
    // variar la forma) a veces abre una ruta alternativa que rodea las
    // puertas por completo — si eso pasa, se descarta este intento.
    const closedReach = switchReachable(grid, doorCells, new Set(), start)
    if (closedReach.has(target.row * grid[0].length + target.col)) continue

    const candidate: SwitchLevel = {
      level: lv,
      rows: grid.length,
      cols: grid[0].length,
      grid,
      start,
      target,
      switches,
      doors,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Activa los interruptores EN ORDEN para abrir las puertas y llega a la meta.',
      seed,
    }
    if (isSwitchLevelSolvable(candidate)) return candidate
  }

  const rows = 7
  const cols = 7
  const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? 'wall' : 'floor') as 'wall' | 'floor')
  )
  const barrierCol = 3
  for (let r = 1; r < rows - 1; r++) grid[r][barrierCol] = 'wall'
  grid[3][barrierCol] = 'floor'
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: { row: 1, col: 1 },
    target: { row: 1, col: cols - 2 },
    switches: [{ id: 'sw0', row: 1, col: 1, doorIds: ['door0'] }],
    doors: [{ id: 'door0', row: 3, col: barrierCol, openInitially: false }],
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Activa los interruptores EN ORDEN para abrir las puertas y llega a la meta.',
    seed: levelSeed(lv, 11999),
  }
}


export function calcSwitchStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   6) TELETRANSPORTADORES — Teleport Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * REDISEÑADO: la versión anterior sembraba muros al azar y solo comprobaba
 * que EXISTIERA alguna solución, así que con frecuencia la meta quedaba
 * alcanzable a pie y el portal era decorativo. Ahora, igual que en
 * Interruptores, se traza un muro SÓLIDO sin ningún hueco que separa el
 * tablero en dos mitades — la única manera de cruzar es un par de
 * teletransportadores con un extremo en cada mitad. En niveles altos se
 * añaden pares "señuelo" (ambos extremos en la MISMA mitad) que no ayudan a
 * cruzar pero obligan a pensar cuál portal usar.
 */

export interface TeleportPortal {
  id: string
  row: number
  col: number
}

export interface TeleportPair {
  a: TeleportPortal
  b: TeleportPortal
}

export interface TeleportLevel {
  level: number
  rows: number
  cols: number
  grid: ('wall' | 'floor')[][]
  start: MazeCoord
  target: MazeCoord
  pairs: TeleportPair[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function teleportPortalAt(level: TeleportLevel, row: number, col: number): { pair: TeleportPair; isA: boolean } | null {
  for (const pair of level.pairs) {
    if (pair.a.row === row && pair.a.col === col) return { pair, isA: true }
    if (pair.b.row === row && pair.b.col === col) return { pair, isA: false }
  }
  return null
}

export function teleportStep(level: TeleportLevel, player: MazeCoord, dir: Direction): { player: MazeCoord; moved: boolean; teleported: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return { player, moved: false, teleported: false }
  if (level.grid[nr][nc] === 'wall') return { player, moved: false, teleported: false }
  const portal = teleportPortalAt(level, nr, nc)
  if (portal) {
    const dest = portal.isA ? portal.pair.b : portal.pair.a
    return { player: { row: dest.row, col: dest.col }, moved: true, teleported: true }
  }
  return { player: { row: nr, col: nc }, moved: true, teleported: false }
}

export function teleportIsComplete(level: TeleportLevel, player: MazeCoord): boolean {
  return player.row === level.target.row && player.col === level.target.col
}

export function isTeleportLevelSolvable(level: TeleportLevel): boolean {
  const W = level.cols
  const key = (p: MazeCoord) => p.row * W + p.col
  const seen = new Set<number>([key(level.start)])
  const queue: MazeCoord[] = [level.start]
  let qi = 0
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  while (qi < queue.length) {
    const cur = queue[qi++]
    if (teleportIsComplete(level, cur)) return true
    for (const dir of dirs) {
      const res = teleportStep(level, cur, dir)
      if (!res.moved) continue
      const k = key(res.player)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push(res.player)
    }
  }
  return false
}

export function getTeleportDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const rooms = Math.min(3 + Math.floor(lv / 2.5), 12)
  const braidRatio = Math.min(0.04 + lv * 0.009, 0.26)
  const pairCount = Math.min(1 + Math.floor(lv / 5), 4)
  const decoyPairs = lv >= 8 ? Math.min(Math.floor((lv - 8) / 5) + 1, 4) : 0
  const size = rooms * 2 + 1
  const moveLimit = Math.round(size * size * 1.1 + (pairCount + decoyPairs) * 12)
  const targetSeconds = Math.max(22, Math.round(size * size * 1.3 + (pairCount + decoyPairs) * 14))
  return { rooms, braidRatio, pairCount, decoyPairs, moveLimit, targetSeconds }
}

export function generateTeleportLevel(level: number, opts?: { seedSalt?: number }): TeleportLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getTeleportDifficulty(lv)
  const maxAttempts = 30

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 12100 + (opts?.seedSalt ?? 0) + attempt * 541)
    const rng = mulberry32(seed)

    // Cada mitad es un laberinto real completo (no unos pocos muros
    // sueltos), separadas por una columna de muro SÓLIDA sin huecos: cruzar
    // a pie es imposible por diseño, y dentro de cada mitad hay que
    // recorrer el laberinto entero para llegar al portal.
    const half = carveMaze(d.rooms, rng) as unknown as ('wall' | 'floor')[][]
    braidMaze(half as unknown as MazeCellType[][], rng, d.braidRatio)
    const leftGrid = half
    const rightHalfRaw = carveMaze(d.rooms, rng) as unknown as ('wall' | 'floor')[][]
    braidMaze(rightHalfRaw as unknown as MazeCellType[][], rng, d.braidRatio)
    const rightGrid = rightHalfRaw

    const halfSize = d.rooms * 2 + 1
    const rows = halfSize
    const totalCols = halfSize * 2 + 1
    const sepCol = halfSize

    const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, (_, r) => {
      const row: ('wall' | 'floor')[] = []
      for (let c = 0; c < halfSize; c++) row.push(leftGrid[r][c])
      row.push('wall')
      for (let c = 0; c < halfSize; c++) row.push(rightGrid[r][c])
      return row
    })

    const start: MazeCoord = { row: 1, col: 1 }
    const portalAPos = farthestFloorCell(leftGrid as unknown as MazeCellType[][], start)
    const portalBLocal: MazeCoord = { row: 1, col: 1 }
    const portalBPos: MazeCoord = { row: portalBLocal.row, col: sepCol + 1 + portalBLocal.col }
    const targetLocal = farthestFloorCell(rightGrid as unknown as MazeCellType[][], portalBLocal)
    const target: MazeCoord = { row: targetLocal.row, col: sepCol + 1 + targetLocal.col }

    if ((portalAPos.row === start.row && portalAPos.col === start.col) || (targetLocal.row === portalBLocal.row && targetLocal.col === portalBLocal.col)) continue

    const usedLeft = new Set<number>([start.row * halfSize + start.col, portalAPos.row * halfSize + portalAPos.col])
    const usedRight = new Set<number>([portalBLocal.row * halfSize + portalBLocal.col, targetLocal.row * halfSize + targetLocal.col])

    const pairs: TeleportPair[] = [{ a: { id: 'real0a', row: portalAPos.row, col: portalAPos.col }, b: { id: 'real0b', row: portalBPos.row, col: portalBPos.col } }]

    // Pares reales adicionales: unen otro punto lejano de cada mitad, para
    // niveles con más de un cruce necesario.
    const leftFloorCells: MazeCoord[] = []
    const rightFloorCells: MazeCoord[] = []
    for (let r = 1; r < halfSize - 1; r++) {
      for (let c = 1; c < halfSize - 1; c++) {
        if (leftGrid[r][c] === 'floor') leftFloorCells.push({ row: r, col: c })
        if (rightGrid[r][c] === 'floor') rightFloorCells.push({ row: r, col: c })
      }
    }
    const leftShuffled = shuffledArray(leftFloorCells, rng).filter((p) => !usedLeft.has(p.row * halfSize + p.col))
    const rightShuffled = shuffledArray(rightFloorCells, rng).filter((p) => !usedRight.has(p.row * halfSize + p.col))
    let li = 0
    let ri = 0
    for (let i = 1; i < d.pairCount; i++) {
      if (li >= leftShuffled.length || ri >= rightShuffled.length) break
      const a = leftShuffled[li++]
      const b = rightShuffled[ri++]
      usedLeft.add(a.row * halfSize + a.col)
      usedRight.add(b.row * halfSize + b.col)
      pairs.push({ a: { id: `real${i}a`, row: a.row, col: a.col }, b: { id: `real${i}b`, row: b.row, col: b.col } })
    }

    // Señuelos: ambos extremos en la MISMA mitad — no ayudan a cruzar.
    for (let i = 0; i < d.decoyPairs; i++) {
      const useLeftHalf = i % 2 === 0
      const pool = useLeftHalf ? leftShuffled.slice(li) : rightShuffled.slice(ri)
      if (pool.length < 2) continue
      const a = pool[0]
      const b = pool[1]
      if (useLeftHalf) li += 2
      else ri += 2
      pairs.push({ a: { id: `decoy${i}a`, row: a.row, col: a.col }, b: { id: `decoy${i}b`, row: b.row, col: b.col } })
    }

    const candidate: TeleportLevel = {
      level: lv,
      rows,
      cols: totalCols,
      grid,
      start,
      target,
      pairs,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Usa los portales para cruzar al otro lado y llegar a la meta.',
      seed,
    }
    if (isTeleportLevelSolvable(candidate)) return candidate
  }

  // Respaldo garantizado: mismo diseño de muro sólido + un único par real.
  const rows = 7
  const cols = 7
  const grid: ('wall' | 'floor')[][] = Array.from({ length: rows }, () => Array<'wall' | 'floor'>(cols).fill('floor'))
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = 'wall'
  const barrierCol = 3
  for (let r = 1; r < rows - 1; r++) grid[r][barrierCol] = 'wall'
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: { row: 1, col: 1 },
    target: { row: rows - 2, col: cols - 2 },
    pairs: [{ a: { id: 't0a', row: 1, col: 1 }, b: { id: 't0b', row: rows - 2, col: cols - 2 } }],
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Usa los portales para cruzar al otro lado y llegar a la meta.',
    seed: levelSeed(lv, 12999),
  }
}


export function calcTeleportStars(moves: number, timeMs: number, targetSeconds: number, moveLimit: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  const soft = moveLimit > 0 ? moveLimit : moves * 2
  if (stars >= 2 && moves <= soft * 0.6) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   7) LÁSER — Laser & Mirrors Puzzle
   ═══════════════════════════════════════════════════════════════════════════ */

export type MirrorOrientation = '/' | '\\'

export interface LaserMirror {
  id: string
  row: number
  col: number
  orientation: MirrorOrientation
  fixed: boolean
}

export interface LaserLevel {
  level: number
  rows: number
  cols: number
  walls: MazeCoord[]
  source: { row: number; col: number; dir: Direction }
  target: MazeCoord
  mirrors: LaserMirror[]
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

const MIRROR_REFLECT: Record<MirrorOrientation, Record<Direction, Direction>> = {
  '/': { up: 'right', right: 'up', down: 'left', left: 'down' },
  '\\': { up: 'left', left: 'up', down: 'right', right: 'down' },
}

export function simulateLaser(level: LaserLevel, mirrors: LaserMirror[]): MazeCoord[] {
  const wallSet = new Set(level.walls.map((w) => w.row * level.cols + w.col))
  const mirrorMap = new Map<number, LaserMirror>()
  for (const m of mirrors) mirrorMap.set(m.row * level.cols + m.col, m)
  const path: MazeCoord[] = []
  let row = level.source.row
  let col = level.source.col
  let dir: Direction = level.source.dir
  const maxSteps = level.rows * level.cols * 4
  for (let step = 0; step < maxSteps; step++) {
    const { dr, dc } = DIRECTION_DELTA[dir]
    row += dr
    col += dc
    if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) break
    const key = row * level.cols + col
    path.push({ row, col })
    if (wallSet.has(key)) break
    const mirror = mirrorMap.get(key)
    if (mirror) dir = MIRROR_REFLECT[mirror.orientation][dir]
    if (row === level.target.row && col === level.target.col) break
  }
  return path
}

export function laserHitsTarget(level: LaserLevel, mirrors: LaserMirror[]): boolean {
  const path = simulateLaser(level, mirrors)
  return path.some((p) => p.row === level.target.row && p.col === level.target.col)
}

export function toggleMirror(mirrors: LaserMirror[], id: string): LaserMirror[] {
  return mirrors.map((m) => (m.id === id && !m.fixed ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m))
}

function laserOrientationForBend(from: Direction, to: Direction): MirrorOrientation | null {
  const pairs: [Direction, Direction, MirrorOrientation][] = [
    ['right', 'up', '/'],
    ['up', 'right', '/'],
    ['left', 'down', '/'],
    ['down', 'left', '/'],
    ['right', 'down', '\\'],
    ['down', 'right', '\\'],
    ['left', 'up', '\\'],
    ['up', 'left', '\\'],
  ]
  for (const [f, t, o] of pairs) if (f === from && t === to) return o
  return null
}

export function getLaserDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(9 + Math.floor(lv / 2), 21)
  const bendCount = Math.min(2 + Math.floor(lv / 2.2), 11)
  const wallCount = Math.min(Math.floor(lv / 1.6), 18)
  const moveLimit = 0
  const targetSeconds = Math.max(24, Math.round(24 + lv * 3.4))
  return { size, bendCount, wallCount, moveLimit, targetSeconds }
}

export function generateLaserLevel(level: number, opts?: { seedSalt?: number }): LaserLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getLaserDifficulty(lv)
  const maxAttempts = 40
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 13100 + (opts?.seedSalt ?? 0) + attempt * 467)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size
    const startDir: Direction = 'right'
    const source: { row: number; col: number; dir: Direction } = { row: Math.floor(rows / 2), col: 0, dir: startDir }

    let curRow: number = source.row
    let curCol: number = source.col
    let curDir: Direction = source.dir
    const mirrors: LaserMirror[] = []
    const criticalCells = new Set<number>([source.row * cols + source.col])
    let ok = true
    for (let i = 0; i < d.bendCount; i++) {
      const dirsAvail: Direction[] = curDir === 'up' || curDir === 'down' ? ['left', 'right'] : ['up', 'down']
      const nextDir: Direction = dirsAvail[Math.floor(rng() * dirsAvail.length)]
      const orientation = laserOrientationForBend(curDir, nextDir)
      if (!orientation) {
        ok = false
        break
      }
      const { dr, dc } = DIRECTION_DELTA[curDir]
      // Tramos mucho más largos que antes (2 a 6 casillas, en vez de 1 a 2):
      // los espejos quedan realmente separados entre sí, obligando a
      // trazar mentalmente un recorrido largo en vez de girar la pieza de
      // al lado.
      const steps = 2 + Math.floor(rng() * 5)
      let br = curRow
      let bc = curCol
      let blocked = false
      for (let s = 0; s < steps; s++) {
        br += dr
        bc += dc
        if (br <= 0 || br >= rows - 1 || bc <= 0 || bc >= cols - 1) {
          blocked = true
          break
        }
        criticalCells.add(br * cols + bc)
      }
      if (blocked) {
        ok = false
        break
      }
      mirrors.push({ id: `m${i}`, row: br, col: bc, orientation, fixed: false })
      curRow = br
      curCol = bc
      curDir = nextDir
    }
    if (!ok) continue
    const { dr, dc } = DIRECTION_DELTA[curDir]
    const finalSteps = 2 + Math.floor(rng() * 5)
    let tr = curRow
    let tc = curCol
    let blockedFinal = false
    for (let s = 0; s < finalSteps; s++) {
      tr += dr
      tc += dc
      if (tr <= 0 || tr >= rows - 1 || tc <= 0 || tc >= cols - 1) {
        blockedFinal = true
        break
      }
      criticalCells.add(tr * cols + tc)
    }
    if (blockedFinal) continue
    if (mirrors.some((m) => m.row === tr && m.col === tc)) continue

    const target: MazeCoord = { row: tr, col: tc }

    // Muros decorativos: nunca sobre el recorrido crítico del láser
    // (ni sobre la fuente/objetivo/espejos), así que jamás rompen la
    // solución — solo añaden ruido visual y, en niveles avanzados, alguna
    // trampa para orientaciones incorrectas.
    const walls: MazeCoord[] = []
    let wallGuard = 0
    while (walls.length < d.wallCount && wallGuard < d.wallCount * 25) {
      wallGuard++
      const r = 1 + Math.floor(rng() * (rows - 2))
      const c = 1 + Math.floor(rng() * (cols - 2))
      const k = r * cols + c
      if (criticalCells.has(k)) continue
      if (walls.some((w) => w.row === r && w.col === c)) continue
      walls.push({ row: r, col: c })
    }

    const candidate: LaserLevel = {
      level: lv,
      rows,
      cols,
      walls,
      source,
      target,
      mirrors,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Gira los espejos para dirigir el láser hasta el objetivo.',
      seed,
    }
    if (!laserHitsTarget(candidate, mirrors)) continue

    const scrambled = mirrors.map((m) => (rng() < 0.6 ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m))
    if (laserHitsTarget(candidate, scrambled)) continue
    return { ...candidate, mirrors: scrambled }
  }
  const rows = 7
  const cols = 7
  const source = { row: 3, col: 0, dir: 'right' as Direction }
  const mirrors: LaserMirror[] = [{ id: 'm0', row: 3, col: 3, orientation: '/', fixed: false }]
  return {
    level: lv,
    rows,
    cols,
    walls: [],
    source,
    target: { row: 1, col: 3 },
    mirrors,
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Gira los espejos para dirigir el láser hasta el objetivo.',
    seed: levelSeed(lv, 13999),
  }
}

export function isLaserLevelSolvable(level: LaserLevel): boolean {
  const rotatable = level.mirrors.filter((m) => !m.fixed)
  const n = Math.min(rotatable.length, 18)
  for (let mask = 0; mask < 1 << n; mask++) {
    const trial = level.mirrors.map((m) => {
      if (m.fixed) return m
      const idx = rotatable.indexOf(m)
      if (idx < 0 || idx >= n) return m
      const flip = (mask >> idx) & 1
      return flip ? { ...m, orientation: m.orientation === '/' ? '\\' : ('/' as MirrorOrientation) } : m
    })
    if (laserHitsTarget(level, trial)) return true
  }
  return false
}

export function calcLaserStars(timeMs: number, targetSeconds: number, moves: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= 6) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   8) CIRCUITOS — Circuit Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * CORREGIDO — bug real encontrado en el generador original: la pieza
 * fuente (la "bola amarilla") tenía SIEMPRE rotación 0 (conexión fija hacia
 * la derecha), pero el trazado del camino con frecuencia se desviaba
 * verticalmente justo al salir de la fuente. Resultado: la pieza vecina en
 * esa dirección casi nunca era la que continuaba el camino, así que ni
 * siquiera el estado "resuelto" quedaba conectado — de ahí los niveles
 * imposibles. Ahora la rotación inicial de la fuente se calcula según la
 * dirección REAL del primer tramo del camino, y además la fuente ya no es
 * fija: se puede rotar con un clic igual que el resto de las piezas.
 */

export type CircuitPieceKind = 'straight' | 'corner' | 't' | 'cross' | 'source' | 'target' | 'empty'

export interface CircuitPiece {
  row: number
  col: number
  kind: CircuitPieceKind
  rotation: 0 | 90 | 180 | 270
  fixed: boolean
}

export interface CircuitLevel {
  level: number
  rows: number
  cols: number
  pieces: CircuitPiece[][]
  source: MazeCoord
  target: MazeCoord
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

const BASE_CONNECTIONS: Record<CircuitPieceKind, Direction[]> = {
  straight: ['up', 'down'],
  corner: ['up', 'right'],
  t: ['left', 'up', 'right'],
  cross: ['up', 'down', 'left', 'right'],
  source: ['right'],
  target: ['left'],
  empty: [],
}

export function pieceConnections(piece: CircuitPiece): Direction[] {
  const steps = piece.rotation / 90
  let dirs = BASE_CONNECTIONS[piece.kind]
  for (let i = 0; i < steps; i++) dirs = dirs.map((d) => DIR_ROTATE[d])
  return dirs
}

export function rotateCircuitPiece(level: CircuitLevel, row: number, col: number): CircuitLevel {
  const pieces = level.pieces.map((r) => r.map((p) => ({ ...p })))
  const target = pieces[row][col]
  if (target.fixed) return level
  target.rotation = ((target.rotation + 90) % 360) as 0 | 90 | 180 | 270
  return { ...level, pieces }
}

export function isCircuitComplete(level: CircuitLevel): boolean {
  const W = level.cols
  const key = (r: number, c: number) => r * W + c
  const seen = new Set<number>([key(level.source.row, level.source.col)])
  const queue: MazeCoord[] = [level.source]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    const piece = level.pieces[cur.row][cur.col]
    const dirs = pieceConnections(piece)
    for (const dir of dirs) {
      const { dr, dc } = DIRECTION_DELTA[dir]
      const nr = cur.row + dr
      const nc = cur.col + dc
      if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) continue
      const neighbor = level.pieces[nr][nc]
      const neighborDirs = pieceConnections(neighbor)
      if (!neighborDirs.includes(OPPOSITE[dir])) continue
      const k = key(nr, nc)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ row: nr, col: nc })
    }
  }
  return seen.has(key(level.target.row, level.target.col))
}

function dirBetween(a: MazeCoord, b: MazeCoord): Direction {
  if (b.row < a.row) return 'up'
  if (b.row > a.row) return 'down'
  if (b.col < a.col) return 'left'
  return 'right'
}

function rotationForCorner(d1: Direction, d2: Direction): 0 | 90 | 180 | 270 {
  const sets: [0 | 90 | 180 | 270, Direction, Direction][] = [
    [0, 'up', 'right'],
    [90, 'right', 'down'],
    [180, 'down', 'left'],
    [270, 'left', 'up'],
  ]
  const want = new Set([d1, d2])
  for (const [rotation, a, b] of sets) {
    if (want.has(a) && want.has(b) && want.size === 2) return rotation
  }
  return 0
}

/** Rota `base` (una única dirección, p. ej. la de la fuente o el objetivo) hasta que coincida con `want`. */
function rotationForSingleDir(base: Direction, want: Direction): 0 | 90 | 180 | 270 {
  let dir = base
  for (let steps = 0; steps < 4; steps++) {
    if (dir === want) return (steps * 90) as 0 | 90 | 180 | 270
    dir = DIR_ROTATE[dir]
  }
  return 0
}

export function getCircuitDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const size = Math.min(5 + Math.floor(lv / 3), 13)
  const bends = Math.min(1 + Math.floor(lv / 3), 8)
  const moveLimit = 0
  const targetSeconds = Math.max(20, Math.round(15 + lv * 2.4))
  return { size, bends, moveLimit, targetSeconds }
}

export function generateCircuitLevel(level: number, opts?: { seedSalt?: number }): CircuitLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getCircuitDifficulty(lv)
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 14100 + (opts?.seedSalt ?? 0) + attempt * 823)
    const rng = mulberry32(seed)
    const rows = d.size
    const cols = d.size

    const source: MazeCoord = { row: Math.floor(rows / 2), col: 0 }
    const occupied = new Set<number>([source.row * cols + source.col])
    const path: MazeCoord[] = [source]
    let cur = { ...source }
    let curDir: Direction = 'right'
    let ok = true

    for (let bend = 0; bend < d.bends && ok; bend++) {
      const dirsAvail: Direction[] = curDir === 'up' || curDir === 'down' ? ['left', 'right'] : ['up', 'down']
      const candidates = shuffledArray(dirsAvail, rng)
      let moved = false
      for (const nextDir of candidates) {
        const { dr, dc } = DIRECTION_DELTA[nextDir]
        const steps = 1 + Math.floor(rng() * 2)
        const trial: MazeCoord[] = []
        let tr = cur.row
        let tc = cur.col
        let stepOk = true
        for (let s = 0; s < steps; s++) {
          tr += dr
          tc += dc
          if (tr <= 0 || tr >= rows - 1 || tc < 0 || tc >= cols - 1) {
            stepOk = false
            break
          }
          if (occupied.has(tr * cols + tc)) {
            stepOk = false
            break
          }
          trial.push({ row: tr, col: tc })
        }
        if (!stepOk || trial.length === 0) continue
        for (const p of trial) {
          occupied.add(p.row * cols + p.col)
          path.push(p)
        }
        cur = trial[trial.length - 1]
        curDir = nextDir
        moved = true
        break
      }
      if (!moved) {
        const { dc } = DIRECTION_DELTA['right']
        const tr = cur.row
        const tc = cur.col + dc
        if (tc >= cols - 1 || occupied.has(tr * cols + tc)) {
          ok = false
          break
        }
        occupied.add(tr * cols + tc)
        path.push({ row: tr, col: tc })
        cur = { row: tr, col: tc }
        curDir = 'right'
      }
    }
    if (!ok) continue

    while (cur.col < cols - 1) {
      const nr = cur.row
      const nc = cur.col + 1
      if (occupied.has(nr * cols + nc)) {
        ok = false
        break
      }
      occupied.add(nr * cols + nc)
      path.push({ row: nr, col: nc })
      cur = { row: nr, col: nc }
      curDir = 'right'
    }
    if (!ok) continue

    const target: MazeCoord = { ...cur }
    if (path.length < 3) continue

    const pieces: CircuitPiece[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ row: r, col: c, kind: 'empty' as CircuitPieceKind, rotation: 0 as const, fixed: true }))
    )

    for (let i = 0; i < path.length; i++) {
      const cell = path[i]
      const prev = path[i - 1]
      const next = path[i + 1]
      let kind: CircuitPieceKind = 'straight'
      let rotation: 0 | 90 | 180 | 270 = 0
      let fixed = false

      if (i === 0) {
        // FUENTE: la rotación se calcula según hacia dónde sale realmente
        // el primer tramo del camino (ya no se asume "derecha" a ciegas).
        // fixed = false: ahora también se puede rotar con un clic, igual
        // que el resto de las piezas.
        kind = 'source'
        const outDir = dirBetween(cell, next)
        rotation = rotationForSingleDir(BASE_CONNECTIONS.source[0], outDir)
        fixed = false
      } else if (i === path.length - 1) {
        // OBJETIVO: por construcción, el camino siempre entra a la meta
        // moviéndose hacia la derecha (el bucle final avanza col+1 hasta
        // llegar a cols-1), así que 'left' (rotación 0) es siempre correcto.
        kind = 'target'
        rotation = 0
        fixed = true
      } else {
        const inDir = dirBetween(prev, cell)
        const outDir = dirBetween(cell, next)
        if (inDir === outDir) {
          kind = 'straight'
          rotation = inDir === 'left' || inDir === 'right' ? 90 : 0
        } else {
          kind = 'corner'
          rotation = rotationForCorner(OPPOSITE[inDir], outDir)
        }
      }
      pieces[cell.row][cell.col] = { row: cell.row, col: cell.col, kind, rotation, fixed }
    }

    const solved: CircuitLevel = {
      level: lv,
      rows,
      cols,
      pieces,
      source,
      target,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Gira las piezas para conectar la fuente con el objetivo.',
      seed,
    }
    // Salvaguarda: el estado "resuelto" debe estar realmente completo antes
    // de mezclarlo. Si por alguna razón no lo está, se descarta el intento
    // en vez de entregar un nivel roto.
    if (!isCircuitComplete(solved)) continue

    let scrambledPieces = pieces.map((r) => r.map((p) => (p.fixed || p.kind === 'empty' ? p : { ...p, rotation: ([0, 90, 180, 270] as const)[Math.floor(rng() * 4)] })))
    let scrambled: CircuitLevel = { ...solved, pieces: scrambledPieces }
    if (isCircuitComplete(scrambled)) {
      const rotatableCells: MazeCoord[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = scrambledPieces[r][c]
          if (!p.fixed && p.kind !== 'empty') rotatableCells.push({ row: r, col: c })
        }
      }
      if (rotatableCells.length > 0) {
        const pick = rotatableCells[Math.floor(rng() * rotatableCells.length)]
        scrambledPieces = scrambledPieces.map((row, r) =>
          row.map((p, c) => (r === pick.row && c === pick.col ? { ...p, rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : p))
        )
        scrambled = { ...solved, pieces: scrambledPieces }
      }
    }
    return scrambled
  }

  // Respaldo garantizado (siempre resoluble).
  const rows = 7
  const cols = 7
  const source: MazeCoord = { row: 3, col: 0 }
  const target: MazeCoord = { row: 3, col: cols - 1 }
  const pieces: CircuitPiece[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 3 && c === 0) return { row: r, col: c, kind: 'source' as CircuitPieceKind, rotation: 90 as const, fixed: false }
      if (r === 3 && c === cols - 1) return { row: r, col: c, kind: 'target' as CircuitPieceKind, rotation: 0 as const, fixed: true }
      if (r === 3) return { row: r, col: c, kind: 'straight' as CircuitPieceKind, rotation: 90 as const, fixed: false }
      return { row: r, col: c, kind: 'empty' as CircuitPieceKind, rotation: 0 as const, fixed: true }
    })
  )
  return {
    level: lv,
    rows,
    cols,
    pieces,
    source,
    target,
    moveLimit: 0,
    targetSeconds: 60,
    goal: 'Gira las piezas para conectar la fuente con el objetivo.',
    seed: levelSeed(lv, 14999),
  }
}

export function calcCircuitStars(timeMs: number, targetSeconds: number, rotations: number, pieceCount: number): 0 | 1 | 2 | 3 {
  if (timeMs <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && rotations <= pieceCount * 2) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   9) PERSONAJE — piel emoji o carácter propio (un solo grafema)
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Añadido: además de las pieles predefinidas, el usuario puede introducir
 * su propio emoji o carácter (exactamente UNO — se valida con
 * Intl.Segmenter para que emojis compuestos por secuencia ZWJ, como
 * "👨‍👩‍👧", cuenten como un único grafema). El selector de personaje que
 * renderiza el menú debe mostrar PLAYER_SKINS y, al final, un botón
 * CUSTOM_SKIN_SLOT ("+") que abra un campo de un carácter y llame a
 * `saveCustomPlayerSkin`.
 */

export const PLAYER_SKINS: string[] = ['🧑', '👨', '👩', '👨🏻', '👨🏼', '👨🏽', '👨🏾', '👨🏿', '👩🏻', '👩🏼', '👩🏽', '👩🏾', '👩🏿']

/** Marcador de la casilla "+" del selector — nunca es una piel válida en sí misma. */
export const CUSTOM_SKIN_SLOT = '+'

/**
 * true si `str` es exactamente UN grafema visible: una letra, un emoji
 * simple, o un emoji compuesto por secuencia ZWJ (cuenta como uno solo
 * aunque ocupe varios code points).
 */
export function isSingleGrapheme(str: string): boolean {
  if (!str) return false
  type SegmenterCtor = new (locale?: string, opts?: { granularity?: string }) => { segment(input: string): Iterable<unknown> }
  const IntlWithSegmenter = Intl as unknown as { Segmenter?: SegmenterCtor }
  if (IntlWithSegmenter.Segmenter) {
    const seg = new IntlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
    let count = 0
    for (const _ of seg.segment(str)) {
      count++
      if (count > 1) return false
    }
    return count === 1
  }
  // Respaldo sin Intl.Segmenter (navegadores muy antiguos): al menos
  // exige que no sean varios caracteres sueltos ni contenga espacios.
  const codepoints = Array.from(str)
  return codepoints.length >= 1 && codepoints.length <= 8 && !str.includes(' ')
}

const PLAYER_SKIN_KEY = 'gco:despejes-player-skin'
const PLAYER_CUSTOM_SKIN_KEY = 'gco:despejes-player-custom-skin'

/** Piel activa: una de PLAYER_SKINS, o el carácter personalizado guardado. */
export function loadPlayerSkin(): string {
  try {
    const raw = localStorage.getItem(PLAYER_SKIN_KEY)
    if (raw === CUSTOM_SKIN_SLOT) {
      const custom = localStorage.getItem(PLAYER_CUSTOM_SKIN_KEY)
      if (custom && isSingleGrapheme(custom)) return custom
    } else if (raw && PLAYER_SKINS.includes(raw)) {
      return raw
    }
  } catch {
    /* localStorage no disponible: se usa el valor por defecto */
  }
  return PLAYER_SKINS[0]
}

/** Selecciona una de las pieles predefinidas (no válido para el slot "+"). */
export function savePlayerSkin(skin: string): void {
  try {
    if (PLAYER_SKINS.includes(skin)) localStorage.setItem(PLAYER_SKIN_KEY, skin)
  } catch {
    /* se ignora: la selección queda solo en memoria para esta sesión */
  }
}

/**
 * Guarda un emoji o carácter propio como piel activa (botón "+"). Devuelve
 * false y no guarda nada si `char` no es un único grafema válido.
 */
export function saveCustomPlayerSkin(char: string): boolean {
  const trimmed = char.trim()
  if (!isSingleGrapheme(trimmed)) return false
  try {
    localStorage.setItem(PLAYER_CUSTOM_SKIN_KEY, trimmed)
    localStorage.setItem(PLAYER_SKIN_KEY, CUSTOM_SKIN_SLOT)
  } catch {
    /* se ignora: la selección queda solo en memoria para esta sesión */
  }
  return true
}

/** Último carácter personalizado guardado (o null si nunca se guardó uno). */
export function loadCustomPlayerSkin(): string | null {
  try {
    const custom = localStorage.getItem(PLAYER_CUSTOM_SKIN_KEY)
    return custom && isSingleGrapheme(custom) ? custom : null
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   10) CRUCETA (D-PAD) — tamaño y separación configurables, persistentes
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Añadido: preferencia compartida por TODOS los minijuegos que usan
 * movimiento direccional. El menú principal debe leer/escribir esto con
 * loadDPadSettings/saveDPadSettings y usar buttonSize/gap para dibujar la
 * cruceta a medida del usuario.
 */

export interface DPadSettings {
  /** Tamaño de cada botón direccional, en píxeles. */
  buttonSize: number
  /** Separación entre botones, en píxeles. */
  gap: number
  /** Estilo visual de la cruceta. */
  style: DPadStyle
}

export type DPadStyle = 'classic' | 'minimal' | 'neon' | 'glass'

export const DPAD_STYLES: { id: DPadStyle; label: string }[] = [
  { id: 'classic', label: 'Clásica' },
  { id: 'minimal', label: 'Minimalista' },
  { id: 'neon', label: 'Neón' },
  { id: 'glass', label: 'Cristal' },
]

export const DPAD_BUTTON_MIN = 40
export const DPAD_BUTTON_MAX = 96
export const DPAD_GAP_MIN = 2
export const DPAD_GAP_MAX = 24

export function defaultDPadSettings(): DPadSettings {
  return { buttonSize: 60, gap: 6, style: 'classic' }
}

export function clampDPadSettings(s: Partial<DPadSettings>): DPadSettings {
  const base = defaultDPadSettings()
  const style = DPAD_STYLES.some((d) => d.id === s.style) ? (s.style as DPadStyle) : base.style
  return {
    buttonSize: clampNum(Math.round(s.buttonSize ?? base.buttonSize), DPAD_BUTTON_MIN, DPAD_BUTTON_MAX),
    gap: clampNum(Math.round(s.gap ?? base.gap), DPAD_GAP_MIN, DPAD_GAP_MAX),
    style,
  }
}

const DPAD_SETTINGS_KEY = 'gco:despejes-dpad-settings'

export function loadDPadSettings(): DPadSettings {
  try {
    const raw = localStorage.getItem(DPAD_SETTINGS_KEY)
    if (!raw) return defaultDPadSettings()
    return clampDPadSettings(JSON.parse(raw))
  } catch {
    return defaultDPadSettings()
  }
}

export function saveDPadSettings(s: DPadSettings): void {
  try {
    localStorage.setItem(DPAD_SETTINGS_KEY, JSON.stringify(clampDPadSettings(s)))
  } catch {
    /* se ignora: la preferencia queda solo en memoria para esta sesión */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   11) CAMINO ÚNICO — Hamiltonian Path Puzzle
   ═══════════════════════════════════════════════════════════════════════════
 *
 * REDISEÑADO: la versión anterior nunca colocaba obstáculos (el tablero
 * era siempre un rectángulo completamente libre recorrido en serpiente),
 * así que la única variación entre niveles era el tamaño. Ahora se colocan
 * muros reales y se usa un buscador de camino Hamiltoniano (DFS con
 * backtracking + heurística de Warnsdorff, igual que en los solucionadores
 * clásicos del "paseo del caballo") para encontrar — y por lo tanto
 * garantizar — una ruta que visite cada casilla libre exactamente una vez.
 * Si en el presupuesto de nodos no se encuentra ninguna combinación de
 * muros resoluble, se reintenta con otra semilla y, como último recurso,
 * con cero obstáculos (igual que la versión original, 100% resoluble).
 *
 * Nota de UI: cada vez que el jugador pisa una celda, esa celda debería
 * dibujarse "agrietada" y dejar de ser transitable — este archivo ya deja
 * esa información lista en `visited` (ver pathUniqueStep más abajo), solo
 * falta que el componente visual dibuje el estado de grieta a partir de
 * ese Set.
 */

export type PathUniqueCellType = 'wall' | 'floor'

export interface PathUniqueLevel {
  level: number
  rows: number
  cols: number
  grid: PathUniqueCellType[][]
  start: MazeCoord
  target: MazeCoord
  totalWalkable: number
  moveLimit: number
  targetSeconds: number
  goal: string
  seed: number
}

export function getPathUniqueDifficulty(level: number) {
  const lv = Math.max(1, Math.floor(level))
  const base = lv <= 2 ? 3 : lv <= 5 ? 4 : lv <= 9 ? 5 : lv <= 14 ? 6 : lv <= 20 ? 7 : lv <= 27 ? 8 : lv <= 35 ? 9 : 10
  const rows = Math.min(base, 11)
  const cols = Math.min(base + (lv % 2 === 0 ? 1 : 0), 12)
  // Número FIJO de obstáculos (no un porcentaje del área): probado
  // empíricamente, un conteo pequeño y fijo mantiene altísima tasa de
  // éxito del buscador de camino Hamiltoniano incluso en tableros grandes,
  // mientras que escalar por porcentaje del área lo hacía fallar casi
  // siempre en niveles altos (y caer siempre al respaldo sin obstáculos).
  const obstacleCount = lv <= 3 ? 0 : lv <= 8 ? 2 : lv <= 13 ? 3 : lv <= 18 ? 4 : lv <= 23 ? 5 : 6
  // presupuesto de nodos del backtracking, escalado con la dificultad
  const nodeBudget = obstacleCount <= 2 ? 90000 : obstacleCount === 3 ? 150000 : obstacleCount === 4 ? 200000 : obstacleCount === 5 ? 260000 : 320000
  const moveLimit = 0
  const targetSeconds = Math.max(15, Math.round(rows * cols * 1.9))
  return { rows, cols, obstacleCount, nodeBudget, moveLimit, targetSeconds }
}

function buildSnakePath(rows: number, cols: number, rowMajor: boolean, reverseAlt: boolean, reverseMain: boolean): MazeCoord[] {
  const path: MazeCoord[] = []
  if (rowMajor) {
    for (let r = 0; r < rows; r++) {
      const flip = r % 2 === 0 !== reverseAlt
      if (flip) {
        for (let c = 0; c < cols; c++) path.push({ row: r, col: c })
      } else {
        for (let c = cols - 1; c >= 0; c--) path.push({ row: r, col: c })
      }
    }
  } else {
    for (let c = 0; c < cols; c++) {
      const flip = c % 2 === 0 !== reverseAlt
      if (flip) {
        for (let r = 0; r < rows; r++) path.push({ row: r, col: c })
      } else {
        for (let r = rows - 1; r >= 0; r--) path.push({ row: r, col: c })
      }
    }
  }
  return reverseMain ? path.slice().reverse() : path
}

/**
 * Busca un camino Hamiltoniano sobre una cuadrícula con celdas bloqueadas,
 * empezando en `start`. Usa la heurística de Warnsdorff (explora primero
 * el vecino con MENOS opciones futuras) para converger rápido, con
 * desempate aleatorio para variar el resultado entre semillas, y
 * backtracking real cuando un camino se atasca. Devuelve `null` si no
 * encuentra ninguno dentro del presupuesto de nodos.
 */
function findHamiltonianPath(rows: number, cols: number, blocked: Set<number>, start: MazeCoord, rng: () => number, nodeBudget = 150000): MazeCoord[] | null {
  const key = (r: number, c: number) => r * cols + c
  const total = rows * cols - blocked.size
  const visited = new Set<number>()
  const path: MazeCoord[] = []
  let nodes = 0

  function freeNeighbors(r: number, c: number): MazeCoord[] {
    const out: MazeCoord[] = []
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const k = key(nr, nc)
      if (blocked.has(k) || visited.has(k)) continue
      out.push({ row: nr, col: nc })
    }
    return out
  }

  function dfs(r: number, c: number): boolean {
    nodes++
    if (nodes > nodeBudget) return false
    visited.add(key(r, c))
    path.push({ row: r, col: c })
    if (path.length === total) return true

    const options = freeNeighbors(r, c)
      .map((p) => ({ p, degree: freeNeighbors(p.row, p.col).length }))
      .sort((a, b) => a.degree - b.degree || rng() - 0.5)

    for (const { p } of options) {
      if (dfs(p.row, p.col)) return true
    }

    visited.delete(key(r, c))
    path.pop()
    return false
  }

  return dfs(start.row, start.col) ? path.slice() : null
}

export function generatePathUniqueLevel(level: number, opts?: { seedSalt?: number }): PathUniqueLevel {
  const lv = Math.max(1, Math.floor(level))
  const d = getPathUniqueDifficulty(lv)
  const rows = d.rows
  const cols = d.cols
  const maxAttempts = 40

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = levelSeed(lv, 16100 + (opts?.seedSalt ?? 0) + attempt * 977)
    const rng = mulberry32(seed)

    const blocked = new Set<number>()
    if (d.obstacleCount > 0) {
      // Balance de paridad (coloreado tipo tablero de ajedrez, (r+c)%2):
      // cualquier camino Hamiltoniano en una cuadrícula alterna de color en
      // cada paso, así que bloquear celdas en pares de colores opuestos
      // mantiene el conteo de cada color casi intacto — esto es lo que más
      // eleva la tasa de éxito real del backtracking (verificado
      // empíricamente: sin este balance, más de la mitad de los tableros de
      // 9×9 en adelante nunca encontraban solución dentro del presupuesto).
      const colorA: number[] = []
      const colorB: number[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)) continue // nunca bloquear esquinas
          if ((r + c) % 2 === 0) colorA.push(r * cols + c)
          else colorB.push(r * cols + c)
        }
      }
      const shuffledA = shuffledArray(colorA, rng)
      const shuffledB = shuffledArray(colorB, rng)
      const pairCount = Math.floor(d.obstacleCount / 2)
      for (let i = 0; i < pairCount && i < shuffledA.length && i < shuffledB.length; i++) {
        blocked.add(shuffledA[i])
        blocked.add(shuffledB[i])
      }
      // si obstacleCount es impar, añade una celda suelta más
      if (d.obstacleCount % 2 === 1) {
        const extra = shuffledArray([...colorA, ...colorB], rng).find((k) => !blocked.has(k))
        if (extra !== undefined) blocked.add(extra)
      }
    }

    const corners: MazeCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: cols - 1 },
      { row: rows - 1, col: 0 },
      { row: rows - 1, col: cols - 1 },
    ]
    const start = shuffledArray(corners, rng)[0]

    const totalWalkable = rows * cols - blocked.size
    const foundPath = findHamiltonianPath(rows, cols, blocked, start, rng, d.nodeBudget)
    if (!foundPath || foundPath.length !== totalWalkable) continue

    const grid: PathUniqueCellType[][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (blocked.has(r * cols + c) ? 'wall' : 'floor')))
    const target = foundPath[foundPath.length - 1]

    return {
      level: lv,
      rows,
      cols,
      grid,
      start,
      target,
      totalWalkable,
      moveLimit: d.moveLimit,
      targetSeconds: d.targetSeconds,
      goal: 'Recorre cada casilla una sola vez y termina en la meta.',
      seed,
    }
  }

  // Respaldo garantizado: serpiente sin obstáculos (siempre resoluble).
  const grid: PathUniqueCellType[][] = Array.from({ length: rows }, () => Array<PathUniqueCellType>(cols).fill('floor'))
  const snake = buildSnakePath(rows, cols, true, false, false)
  return {
    level: lv,
    rows,
    cols,
    grid,
    start: snake[0],
    target: snake[snake.length - 1],
    totalWalkable: rows * cols,
    moveLimit: d.moveLimit,
    targetSeconds: d.targetSeconds,
    goal: 'Recorre cada casilla una sola vez y termina en la meta.',
    seed: levelSeed(lv, 16999),
  }
}

/**
 * Verificador genérico de solvencia, independiente del generador — útil
 * como comprobación adicional en tests o herramientas de depuración.
 *
 * Usa backtracking con heurística de Warnsdorff (explora primero el vecino
 * con menos opciones futuras) y, como UN SOLO recorrido determinista puede
 * quedar atrapado en tableros donde SÍ existe solución (simplemente por
 * explorar antes la rama equivocada — es una limitación conocida de la
 * heurística, verificada empíricamente en este mismo archivo), reparte el
 * presupuesto de nodos en varios intentos con distinto orden de desempate
 * (semillados de forma determinista a partir de `level.seed`, así que el
 * resultado es reproducible). Con esto, la tasa de acierto real sube de
 * forma muy notable frente a un único recorrido.
 *
 * Nota importante: esta función es un ayudante de depuración basado en una
 * heurística, NO la fuente de verdad de que un nivel sea resoluble — esa
 * garantía la da el propio `generatePathUniqueLevel`, que solo devuelve un
 * nivel cuando su búsqueda interna ya encontró un camino completo real. Un
 * `false` aquí en un nivel muy exigente (muchos obstáculos, tablero grande)
 * puede significar simplemente que el presupuesto de nodos no alcanzó,
 * sobre todo si el nivel se generó con muchos intentos internos — en ese
 * caso, sube `maxNodes` en vez de asumir que el nivel está roto.
 */
export function isPathUniqueSolvable(level: PathUniqueLevel, maxNodes = 2000000): boolean {
  const rows = level.rows
  const cols = level.cols
  const total = level.totalWalkable
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]

  const tries = 20
  const budgetPerTry = Math.max(20000, Math.floor(maxNodes / tries))

  for (let t = 0; t < tries; t++) {
    const rng = mulberry32(((level.seed + t * 97 + 13) >>> 0) || 1)
    const visited: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
    let nodes = 0

    function degree(r: number, c: number): number {
      let n = 0
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        if (level.grid[nr][nc] === 'wall' || visited[nr][nc]) continue
        n++
      }
      return n
    }

    function dfs(r: number, c: number, count: number): boolean {
      nodes++
      if (nodes > budgetPerTry) return false
      if (count === total) return r === level.target.row && c === level.target.col
      const options: { nr: number; nc: number; d: number }[] = []
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        if (level.grid[nr][nc] === 'wall' || visited[nr][nc]) continue
        options.push({ nr, nc, d: degree(nr, nc) })
      }
      options.sort((a, b) => a.d - b.d || rng() - 0.5)
      for (const { nr, nc } of options) {
        visited[nr][nc] = true
        if (dfs(nr, nc, count + 1)) return true
        visited[nr][nc] = false
      }
      return false
    }

    visited[level.start.row][level.start.col] = true
    if (dfs(level.start.row, level.start.col, 1)) return true
  }
  return false
}

export function pathUniqueStep(level: PathUniqueLevel, visited: Set<number>, player: MazeCoord, dir: Direction): { player: MazeCoord; visited: Set<number>; moved: boolean } {
  const { dr, dc } = DIRECTION_DELTA[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  const noMove = { player, visited, moved: false }
  if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) return noMove
  if (level.grid[nr][nc] === 'wall') return noMove
  const key = nr * level.cols + nc
  // ya recorrida: el suelo está "agrietado" y no se puede volver a pisar
  if (visited.has(key)) return noMove
  const isTarget = nr === level.target.row && nc === level.target.col
  if (isTarget && visited.size < level.totalWalkable - 1) return noMove
  const nextVisited = new Set(visited)
  nextVisited.add(key)
  return { player: { row: nr, col: nc }, visited: nextVisited, moved: true }
}

export function pathUniqueInitialVisited(level: PathUniqueLevel): Set<number> {
  return new Set<number>([level.start.row * level.cols + level.start.col])
}

export function pathUniqueIsComplete(level: PathUniqueLevel, player: MazeCoord, visited: Set<number>): boolean {
  return player.row === level.target.row && player.col === level.target.col && visited.size === level.totalWalkable
}

export function calcPathUniqueStars(moves: number, timeMs: number, targetSeconds: number, totalWalkable: number): 0 | 1 | 2 | 3 {
  if (moves <= 0) return 0
  let stars: 0 | 1 | 2 | 3 = 1
  if (targetSeconds > 0 && timeMs <= targetSeconds * 1000) stars = 2
  if (stars >= 2 && moves <= totalWalkable * 1.05) stars = 3
  return stars
}

/* ═══════════════════════════════════════════════════════════════════════════
   ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE VISUAL — React + CSS
   ═══════════════════════════════════════════════════════════════════════════
   ═══════════════════════════════════════════════════════════════════════════
 *
 * A partir de aquí, todo lo que sigue es la interfaz: un componente
 * `DespejesGame` con menú principal, panel de ajustes (cruceta + personaje)
 * y los 9 minijuegos, todo en este mismo archivo (sin importar nada de
 * `generateLevel.ts` ni de ningún otro módulo).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ── Sonido — sintetizado con WebAudio, sin archivos externos ──
 *
 * Todo el archivo sigue siendo autocontenido: en vez de cargar .mp3/.wav,
 * cada efecto se sintetiza al vuelo con osciladores. Si el navegador no
 * soporta AudioContext (o el usuario aún no ha interactuado con la
 * página, por las políticas de autoplay), las funciones simplemente no
 * hacen nada — nunca lanzan un error visible.
 */

let sharedAudioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      sharedAudioCtx = new Ctor()
    }
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {})
    return sharedAudioCtx
  } catch {
    return null
  }
}

interface ToneStep {
  freq: number
  /** duración en segundos */
  dur: number
  /** retardo en segundos respecto al inicio del sonido */
  at?: number
  type?: OscillatorType
  gain?: number
}

function playTones(steps: ToneStep[]) {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const master = ctx.createGain()
    master.gain.value = 0.16
    master.connect(ctx.destination)
    const now = ctx.currentTime
    for (const step of steps) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = step.type ?? 'sine'
      osc.frequency.value = step.freq
      const start = now + (step.at ?? 0)
      const end = start + step.dur
      const peak = step.gain ?? 1
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.015, step.dur * 0.3))
      gain.gain.exponentialRampToValueAtTime(0.001, end)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  } catch {
    /* el audio es un extra cosmético: cualquier fallo se ignora en silencio */
  }
}

const Sound = {
  move: () => playTones([{ freq: 320, dur: 0.05, type: 'triangle', gain: 0.7 }]),
  blocked: () => playTones([{ freq: 130, dur: 0.09, type: 'square', gain: 0.5 }]),
  push: () => playTones([{ freq: 180, dur: 0.11, type: 'sawtooth', gain: 0.6 }, { freq: 90, dur: 0.14, at: 0.02, type: 'sine', gain: 0.5 }]),
  slide: () => playTones([{ freq: 700, dur: 0.16, type: 'sine', gain: 0.35 }]),
  crack: () => playTones([{ freq: 220, dur: 0.05, type: 'square', gain: 0.5 }, { freq: 140, dur: 0.08, at: 0.03, type: 'square', gain: 0.4 }]),
  warp: () => playTones([{ freq: 520, dur: 0.09, type: 'sine' }, { freq: 880, dur: 0.09, at: 0.07, type: 'sine' }, { freq: 1320, dur: 0.12, at: 0.14, type: 'sine' }]),
  zap: () => playTones([{ freq: 1200, dur: 0.05, type: 'sawtooth', gain: 0.35 }, { freq: 900, dur: 0.05, at: 0.04, type: 'sawtooth', gain: 0.3 }]),
  pop: () => playTones([{ freq: 660, dur: 0.08, type: 'sine' }, { freq: 990, dur: 0.08, at: 0.05, type: 'sine' }]),
  toggle: () => playTones([{ freq: 440, dur: 0.07, type: 'square', gain: 0.4 }]),
  click: () => playTones([{ freq: 500, dur: 0.04, type: 'sine', gain: 0.3 }]),
  success: () =>
    playTones([
      { freq: 523.25, dur: 0.12, type: 'sine' },
      { freq: 659.25, dur: 0.12, at: 0.1, type: 'sine' },
      { freq: 783.99, dur: 0.2, at: 0.2, type: 'sine' },
    ]),
  fail: () => playTones([{ freq: 220, dur: 0.16, type: 'sawtooth', gain: 0.4 }, { freq: 160, dur: 0.22, at: 0.1, type: 'sawtooth', gain: 0.35 }]),
}

/* ── Progreso por juego (nivel actual + mejores estrellas) ── */

export type GameId = 'laberinto' | 'hielo' | 'interruptores' | 'teleport' | 'laser' | 'circuitos' | 'camino' | 'croma' | 'pintar'

export interface GameProgress {
  level: number
  stars: Record<number, 0 | 1 | 2 | 3>
}

function progressKey(id: GameId) {
  return `gco:despejes-progress:${id}`
}

export function loadGameProgress(id: GameId): GameProgress {
  try {
    const raw = localStorage.getItem(progressKey(id))
    if (!raw) return { level: 1, stars: {} }
    const parsed = JSON.parse(raw) as Partial<GameProgress>
    return { level: parsed.level && parsed.level > 0 ? parsed.level : 1, stars: parsed.stars ?? {} }
  } catch {
    return { level: 1, stars: {} }
  }
}

export function saveGameProgress(id: GameId, progress: GameProgress): void {
  try {
    localStorage.setItem(progressKey(id), JSON.stringify(progress))
  } catch {
    /* se ignora: el progreso queda solo en memoria para esta sesión */
  }
}

interface GameMeta {
  id: GameId
  title: string
  icon: string
  tagline: string
  accent: string // nombre de variable de acento CSS, ver hoja de estilos
}

const GAME_META: GameMeta[] = [
  { id: 'laberinto', title: 'Laberinto', icon: '🪨', tagline: 'Empuja rocas a los huecos y escapa', accent: 'stone' },
  { id: 'hielo', title: 'Hielo', icon: '🧊', tagline: 'Desliza sin control hasta la meta', accent: 'ice' },
  { id: 'interruptores', title: 'Interruptores', icon: '🔀', tagline: 'Abre puertas con los interruptores correctos', accent: 'switch' },
  { id: 'teleport', title: 'Teletransportadores', icon: '🌀', tagline: 'Cruza al otro lado usando portales', accent: 'portal' },
  { id: 'laser', title: 'Láser', icon: '🔺', tagline: 'Gira espejos y alcanza el objetivo', accent: 'laser' },
  { id: 'circuitos', title: 'Circuitos', icon: '💡', tagline: 'Conecta la fuente con el objetivo', accent: 'circuit' },
  { id: 'camino', title: 'Camino Único', icon: '🧵', tagline: 'Pisa cada casilla una sola vez', accent: 'ember' },
  { id: 'croma', title: 'Croma', icon: '💎', tagline: 'Lleva cada gema a su meta', accent: 'gem' },
  { id: 'pintar', title: 'Pintar', icon: '🎨', tagline: 'Despeja y pinta cada figura', accent: 'paint' },
]

/* ── Utilidades de render compartidas ── */

/** Tamaño de celda (px) según las dimensiones del tablero, para que quepa cómodo en pantalla. */
function cellSizeFor(rows: number, cols: number, maxStage = 380, minCell = 14, maxCell = 58): number {
  const dim = Math.max(rows, cols)
  const raw = Math.floor(maxStage / Math.max(dim, 1))
  return clampNum(raw, minCell, maxCell)
}

/**
 * Cronómetro que se congela cuando `frozen` es true (por ejemplo, al
 * completar el nivel) — antes seguía corriendo de fondo tras ganar, lo que
 * hacía que el tiempo mostrado en el modal de victoria (y las estrellas
 * calculadas con él) siguiera cambiando después de terminar la partida.
 */
function useElapsedMs(resetKey: unknown, frozen = false): number {
  const [startedAt, setStartedAt] = useState<number>(() => Date.now())
  const [, forceTick] = useState(0)
  const frozenAtRef = useRef<number | null>(null)

  useEffect(() => {
    setStartedAt(Date.now())
    frozenAtRef.current = null
  }, [resetKey])

  useEffect(() => {
    if (frozen) {
      if (frozenAtRef.current === null) frozenAtRef.current = Date.now()
      return
    }
    frozenAtRef.current = null
    const id = window.setInterval(() => forceTick((n) => n + 1), 200)
    return () => window.clearInterval(id)
  }, [frozen])

  const end = frozen && frozenAtRef.current !== null ? frozenAtRef.current : Date.now()
  return Math.max(0, end - startedAt)
}

/** Escucha las flechas del teclado y WASD como alternativa a la cruceta. */
function useArrowKeys(onMove: (dir: Direction) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
        W: 'up',
        S: 'down',
        A: 'left',
        D: 'right',
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        onMove(dir)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onMove, enabled])
}

/* ── Átomos de interfaz ── */

function Stars({ count }: { count: 0 | 1 | 2 | 3 }) {
  return (
    <div className="dg-stars" aria-label={`${count} de 3 estrellas`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`dg-star ${i < count ? 'dg-star--on' : ''}`}>
          ★
        </span>
      ))}
    </div>
  )
}

function DPad({ onMove, settings, disabled }: { onMove: (dir: Direction) => void; settings: DPadSettings; disabled?: boolean }) {
  const style = { '--dg-btn': `${settings.buttonSize}px`, '--dg-gap': `${settings.gap}px` } as React.CSSProperties
  const arrows: Record<DPadStyle, [string, string, string, string]> = {
    classic: ['▲', '◀', '▶', '▼'],
    minimal: ['↑', '←', '→', '↓'],
    neon: ['▲', '◀', '▶', '▼'],
    glass: ['▲', '◀', '▶', '▼'],
  }
  const [up, left, right, down] = arrows[settings.style]
  function move(dir: Direction) {
    Sound.click()
    onMove(dir)
  }
  return (
    <div className={`dg-dpad dg-dpad--${settings.style}`} style={style}>
      <button type="button" className="dg-dpad__btn dg-dpad__up" disabled={disabled} onClick={() => move('up')} aria-label="Mover arriba">
        <span>{up}</span>
      </button>
      <div className="dg-dpad__row">
        <button type="button" className="dg-dpad__btn dg-dpad__left" disabled={disabled} onClick={() => move('left')} aria-label="Mover izquierda">
          <span>{left}</span>
        </button>
        <div className="dg-dpad__hub" />
        <button type="button" className="dg-dpad__btn dg-dpad__right" disabled={disabled} onClick={() => move('right')} aria-label="Mover derecha">
          <span>{right}</span>
        </button>
      </div>
      <button type="button" className="dg-dpad__btn dg-dpad__down" disabled={disabled} onClick={() => move('down')} aria-label="Mover abajo">
        <span>{down}</span>
      </button>
    </div>
  )
}

function LevelPickerModal({ current, maxLevel, onPick, onClose }: { current: number; maxLevel: number; onPick: (n: number) => void; onClose: () => void }) {
  const levels = Array.from({ length: maxLevel }, (_, i) => i + 1).reverse()
  return (
    <div className="dg-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dg-overlay__card dg-levelpicker" onClick={(e) => e.stopPropagation()}>
        <div className="dg-settings__header">
          <div className="dg-overlay__title">Elegir nivel</div>
          <button type="button" className="dg-iconbtn dg-iconbtn--ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="dg-levelpicker__grid">
          {levels.map((n) => (
            <button
              key={n}
              type="button"
              className={`dg-levelpicker__btn ${n === current ? 'dg-levelpicker__btn--active' : ''}`}
              onClick={() => {
                Sound.click()
                onPick(n)
                onClose()
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TopBar({
  title,
  icon,
  level,
  maxLevel,
  goal,
  timeMs,
  countdownMs,
  moves,
  onBack,
  onRestart,
  onJumpLevel,
}: {
  title: string
  icon: string
  level: number
  maxLevel: number
  goal: string
  timeMs: number
  /** Si se pasa, se muestra como cuenta regresiva en vez de cronómetro ascendente. */
  countdownMs?: number
  moves?: number
  onBack: () => void
  onRestart: () => void
  onJumpLevel: (n: number) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const low = countdownMs !== undefined && countdownMs <= 10000
  return (
    <div className="dg-topbar">
      <button type="button" className="dg-backbtn" onClick={onBack} aria-label="Volver al menú de Despejes">
        <span>←</span> Menú
      </button>
      <div className="dg-topbar__center">
        <div className="dg-topbar__title">
          <span className="dg-topbar__icon">{icon}</span> {title}
        </div>
        <div className="dg-topbar__goal">{goal}</div>
      </div>
      <div className="dg-topbar__stats">
        <button type="button" className="dg-chip dg-chip--clickable" onClick={() => setPickerOpen(true)}>
          Nivel {level} ▾
        </button>
        <span className={`dg-chip ${low ? 'dg-chip--danger' : ''}`}>⏱ {formatTime(countdownMs !== undefined ? countdownMs : timeMs)}</span>
        {moves !== undefined && <span className="dg-chip">👣 {moves}</span>}
        <button type="button" className="dg-iconbtn dg-iconbtn--ghost" onClick={onRestart} aria-label="Reiniciar nivel">
          ↺
        </button>
      </div>
      {pickerOpen && <LevelPickerModal current={level} maxLevel={maxLevel} onPick={onJumpLevel} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

function CompletionOverlay({
  stars,
  timeMs,
  onRetry,
  onNext,
}: {
  stars: 0 | 1 | 2 | 3
  timeMs: number
  onRetry: () => void
  onNext: () => void
}) {
  return (
    <div className="dg-overlay" role="dialog" aria-modal="true">
      <div className="dg-overlay__card">
        <div className="dg-overlay__badge">✔</div>
        <div className="dg-overlay__title">¡Nivel superado!</div>
        <Stars count={stars} />
        <div className="dg-overlay__time">Tiempo: {formatTime(timeMs)}</div>
        <div className="dg-overlay__actions">
          <button type="button" className="dg-btn dg-btn--ghost" onClick={onRetry}>
            Repetir
          </button>
          <button type="button" className="dg-btn dg-btn--primary" onClick={onNext}>
            Siguiente nivel →
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayerToken({ row, col, cell, skin, className }: { row: number; col: number; cell: number; skin: string; className?: string }) {
  const style: React.CSSProperties = {
    transform: `translate(${col * cell}px, ${row * cell}px)`,
    width: cell,
    height: cell,
    fontSize: Math.round(cell * 0.62),
  }
  return (
    <div className={`dg-token ${className ?? ''}`} style={style}>
      {skin}
    </div>
  )
}

/* ── Panel de ajustes: cruceta (tamaño/separación) + personaje ── */

function SettingsPanel({
  dpad,
  onChangeDPad,
  skin,
  onChangeSkin,
  onClose,
}: {
  dpad: DPadSettings
  onChangeDPad: (s: DPadSettings) => void
  skin: string
  onChangeSkin: (s: string) => void
  onClose: () => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [customError, setCustomError] = useState(false)
  const customSkin = loadCustomPlayerSkin()

  function commitCustom() {
    const ok = saveCustomPlayerSkin(customValue)
    if (ok) {
      onChangeSkin(customValue.trim())
      setCustomOpen(false)
      setCustomValue('')
      setCustomError(false)
    } else {
      setCustomError(true)
    }
  }

  return (
    <div className="dg-overlay" role="dialog" aria-modal="true">
      <div className="dg-overlay__card dg-settings">
        <div className="dg-settings__header">
          <div className="dg-overlay__title">Ajustes</div>
          <button type="button" className="dg-iconbtn dg-iconbtn--ghost" onClick={onClose} aria-label="Cerrar ajustes">
            ✕
          </button>
        </div>

        <div className="dg-settings__section">
          <div className="dg-settings__label">Personaje</div>
          <div className="dg-skin-grid">
            {PLAYER_SKINS.map((s) => (
              <button
                key={s}
                type="button"
                className={`dg-skin-btn ${skin === s ? 'dg-skin-btn--active' : ''}`}
                onClick={() => {
                  savePlayerSkin(s)
                  onChangeSkin(s)
                }}
              >
                {s}
              </button>
            ))}
            {customSkin && (
              <button
                type="button"
                className={`dg-skin-btn ${skin === customSkin ? 'dg-skin-btn--active' : ''}`}
                onClick={() => {
                  saveCustomPlayerSkin(customSkin)
                  onChangeSkin(customSkin)
                }}
                title="Tu carácter personalizado"
              >
                {customSkin}
              </button>
            )}
            <button type="button" className="dg-skin-btn dg-skin-btn--add" onClick={() => setCustomOpen((v) => !v)} aria-label="Añadir mi propio emoji o carácter">
              +
            </button>
          </div>
          {customOpen && (
            <div className="dg-custom-skin">
              <input
                className={`dg-input ${customError ? 'dg-input--error' : ''}`}
                value={customValue}
                maxLength={8}
                placeholder="Un emoji o carácter"
                onChange={(e) => {
                  setCustomValue(e.target.value)
                  setCustomError(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCustom()
                }}
              />
              <button type="button" className="dg-btn dg-btn--primary dg-btn--sm" onClick={commitCustom}>
                Usar
              </button>
              {customError && <div className="dg-custom-skin__error">Debe ser un único carácter o emoji.</div>}
            </div>
          )}
        </div>

        <div className="dg-settings__section">
          <div className="dg-settings__label">Estilo de la cruceta</div>
          <div className="dg-style-grid">
            {DPAD_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`dg-style-btn ${dpad.style === s.id ? 'dg-style-btn--active' : ''}`}
                onClick={() => onChangeDPad(clampDPadSettings({ ...dpad, style: s.id }))}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dg-settings__section">
          <div className="dg-settings__label">
            Tamaño de la cruceta <span className="dg-settings__value">{dpad.buttonSize}px</span>
          </div>
          <input
            className="dg-slider"
            type="range"
            min={DPAD_BUTTON_MIN}
            max={DPAD_BUTTON_MAX}
            value={dpad.buttonSize}
            onChange={(e) => onChangeDPad(clampDPadSettings({ ...dpad, buttonSize: Number(e.target.value) }))}
          />
        </div>

        <div className="dg-settings__section">
          <div className="dg-settings__label">
            Separación entre flechas <span className="dg-settings__value">{dpad.gap}px</span>
          </div>
          <input
            className="dg-slider"
            type="range"
            min={DPAD_GAP_MIN}
            max={DPAD_GAP_MAX}
            value={dpad.gap}
            onChange={(e) => onChangeDPad(clampDPadSettings({ ...dpad, gap: Number(e.target.value) }))}
          />
        </div>

        <div className="dg-settings__preview">
          <DPad settings={dpad} onMove={() => {}} />
        </div>
        <button
          type="button"
          className="dg-btn dg-btn--ghost dg-settings__reset"
          onClick={() => onChangeDPad(defaultDPadSettings())}
        >
          ↺ Restablecer cruceta
        </button>
      </div>
    </div>
  )
}

/* ── Menú principal ── */

function MainMenu({
  onSelect,
  onOpenSettings,
  skin,
  progressByGame,
}: {
  onSelect: (id: GameId) => void
  onOpenSettings: () => void
  skin: string
  progressByGame: Record<GameId, GameProgress>
}) {
  const navigate = useNavigate()
  return (
    <div className="dg-menu">
      <button
        type="button"
        className="dg-backbtn dg-backbtn--top"
        onClick={() => {
          Sound.click()
          navigate('/categoria/logica')
        }}
      >
        <span>←</span> Volver
      </button>
      <div className="dg-menu__header">
        <div>
          <div className="dg-menu__title">Despejes</div>
          <div className="dg-menu__subtitle">9 minijuegos de lógica, cada uno con progresión infinita</div>
        </div>
        <button type="button" className="dg-iconbtn dg-iconbtn--ghost dg-menu__settings" onClick={onOpenSettings} aria-label="Ajustes">
          <span className="dg-menu__skin">{skin}</span>
          <span>⚙</span>
        </button>
      </div>
      <div className="dg-menu__grid">
        {GAME_META.map((g) => {
          const progress = progressByGame[g.id]
          const totalStars: number = Object.values(progress.stars).reduce((a: number, b) => a + b, 0)
          return (
            <button key={g.id} type="button" className={`dg-card dg-card--${g.accent}`} onClick={() => onSelect(g.id)}>
              <div className="dg-card__icon">{g.icon}</div>
              <div className="dg-card__title">{g.title}</div>

              <div className="dg-card__tagline">{g.tagline}</div>
              <div className="dg-card__footer">
                <span className="dg-chip dg-chip--dark">Nivel {progress.level}</span>
                <span className="dg-chip dg-chip--dark">★ {totalStars}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: LABERINTO
   ═══════════════════════════════════════════════════════════════════════════ */

function LaberintoGame({ dpad, skin, onBack }: { dpad: DPadSettings; skin: string; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'laberinto')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('laberinto'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<LaberintoLevel>(() => generateLaberintoLevel(progress.level))
  const [boulders, setBoulders] = useState<MazeBoulder[]>(() => level.boulders)
  const [player, setPlayer] = useState<MazeCoord>(() => level.start)
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed || timedOut)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateLaberintoLevel(n)
    setLevel(lvl)
    setBoulders(lvl.boulders)
    setPlayer(lvl.start)
    setMoves(0)
    setCompleted(false)
    setTimedOut(false)
  }

  const countdownMs = Math.max(0, level.timeLimitSeconds * 1000 - timeMs)
  useEffect(() => {
    if (completed || timedOut) return
    if (countdownMs <= 0) {
      setTimedOut(true)
      Sound.fail()
    }
  }, [countdownMs, completed, timedOut])

  const locked = completed || timedOut

  const handleMove = useCallback(
    (dir: Direction) => {
      if (locked) return
      const res = laberintoStep(level, boulders, player, dir)
      if (!res.moved) {
        Sound.blocked()
        return
      }
      if (res.pushed) Sound.push()
      else Sound.move()
      setPlayer(res.player)
      setBoulders(res.boulders)
      setMoves((m) => m + 1)
      if (isMazeComplete(res.player, level.exit)) {
        setCompleted(true)
        Sound.success()
      }
    },
    [level, boulders, player, locked]
  )
  useArrowKeys(handleMove, !locked)

  const visible = useMemo(() => visibleMazeCells(level, player), [level, player])

  // Cámara al estilo "GBA": una ventana fija de celdas que sigue al jugador,
  // en vez de encoger el tablero completo hasta hacerlo ilegible en mapas
  // grandes. Si el laberinto cabe entero en la ventana, simplemente se
  // centra (sin desplazarse).
  const VIEWPORT_CELLS = 11
  const CELL_PX = 30
  const viewportPx = VIEWPORT_CELLS * CELL_PX
  const contentW = level.cols * CELL_PX
  const contentH = level.rows * CELL_PX
  const camX = contentW <= viewportPx ? (viewportPx - contentW) / 2 : clampNum(viewportPx / 2 - (player.col * CELL_PX + CELL_PX / 2), viewportPx - contentW, 0)
  const camY = contentH <= viewportPx ? (viewportPx - contentH) / 2 : clampNum(viewportPx / 2 - (player.row * CELL_PX + CELL_PX / 2), viewportPx - contentH, 0)

  function handleNext() {
    const stars = calcLaberintoStars(moves, timeMs, level.targetSeconds, level.moveLimit)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('laberinto', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcLaberintoStars(moves, timeMs, level.targetSeconds, level.moveLimit)

  return (
    <div className="dg-game">
      <TopBar
        title={meta.title}
        icon={meta.icon}
        level={viewingLevel}
        maxLevel={progress.level}
        onJumpLevel={loadLevel}
        goal={level.goal}
        timeMs={timeMs}
        countdownMs={countdownMs}
        moves={moves}
        onBack={onBack}
        onRestart={() => loadLevel(viewingLevel)}
      />
      <div className="dg-board dg-board--stone">
        <div className="dg-camera" style={{ width: viewportPx, height: viewportPx }}>
          <div className="dg-stage dg-camera__inner" style={{ '--dg-cols': level.cols, '--dg-cell': `${CELL_PX}px`, transform: `translate(${camX}px, ${camY}px)` } as React.CSSProperties}>
            {level.grid.map((row, r) =>
              row.map((type, c) => {
                const key = r * level.cols + c
                const isVisible = visible.has(key)
                const boulderHere = boulders.find((b) => !b.cleared && b.row === r && b.col === c)
                const isExit = r === level.exit.row && c === level.exit.col
                const filledHole = type === 'hole' && boulders.some((b) => b.cleared && b.holeRow === r && b.holeCol === c)
                let cls = 'dg-cell dg-cell--maze'
                if (!isVisible) cls += ' dg-cell--fog'
                else if (type === 'wall') cls += ' dg-cell--wall'
                else if (type === 'hole' && !filledHole) cls += ' dg-cell--hole'
                else cls += ' dg-cell--floor'
                return (
                  <div key={key} className={cls} style={{ gridColumn: c + 1, gridRow: r + 1, width: CELL_PX, height: CELL_PX }}>
                    {isVisible && isExit && <span className="dg-emoji-mark dg-exit-flag">🚩</span>}
                    {isVisible && boulderHere && <span className={`dg-emoji-mark ${boulderHere.kind === 'glass' ? 'dg-glass' : 'dg-boulder'}`}>{boulderHere.kind === 'glass' ? '🔷' : '🪨'}</span>}
                  </div>
                )
              })
            )}
            <PlayerToken row={player.row} col={player.col} cell={CELL_PX} skin={skin} />
          </div>
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={locked} />
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(viewingLevel)} onNext={handleNext} />}
      {timedOut && !completed && (
        <div className="dg-overlay" role="dialog" aria-modal="true">
          <div className="dg-overlay__card">
            <div className="dg-overlay__badge dg-overlay__badge--fail">⏱</div>
            <div className="dg-overlay__title">Se acabó el tiempo</div>
            <div className="dg-overlay__time">Tómate tu tiempo y vuelve a intentarlo con calma.</div>
            <div className="dg-overlay__actions">
              <button type="button" className="dg-btn dg-btn--primary" onClick={() => loadLevel(viewingLevel)}>
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: CROMA
   ═══════════════════════════════════════════════════════════════════════════ */

function CromaGame({ dpad, onBack }: { dpad: DPadSettings; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'croma')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('croma'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<CromaLevel>(() => generateCromaLevel(progress.level))
  const [gems, setGems] = useState<Gem[]>(() => level.gems)
  const [selected, setSelected] = useState<string | null>(null)
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateCromaLevel(n)
    setLevel(lvl)
    setGems(lvl.gems)
    setSelected(lvl.gems[0]?.id ?? null)
    setMoves(0)
    setCompleted(false)
  }

  useEffect(() => {
    setSelected((s) => s ?? gems[0]?.id ?? null)
  }, [gems])

  const handleMove = useCallback(
    (dir: Direction) => {
      if (completed || !selected) return
      const next = cromaTryMove(level, gems, selected, dir)
      if (!next) {
        Sound.blocked()
        return
      }
      const gem = next.find((g) => g.id === selected)
      const onGoal = gem && level.goals.some((goal) => goal.color === gem.color && goal.row === gem.row && goal.col === gem.col)
      if (onGoal) Sound.pop()
      else Sound.move()
      setGems(next)
      setMoves((m) => m + 1)
      if (cromaIsComplete(level, next)) {
        setCompleted(true)
        Sound.success()
      }
    },
    [level, gems, selected, completed]
  )
  useArrowKeys(handleMove, !completed)

  const cell = cellSizeFor(level.rows, level.cols, 380, 24, 52)

  function handleNext() {
    const stars = calcCromaStars(moves, timeMs, level.targetSeconds, level.shuffleMoves)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('croma', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcCromaStars(moves, timeMs, level.targetSeconds, level.shuffleMoves)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={moves} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--gem">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {Array.from({ length: level.rows }).map((_, r) =>
            Array.from({ length: level.cols }).map((__, c) => {
              const isObstacle = level.obstacles.some((o) => o.row === r && o.col === c)
              const goalHere = level.goals.find((g) => g.row === r && g.col === c)
              return (
                <div
                  key={r * level.cols + c}
                  className={`dg-cell dg-cell--gemboard ${isObstacle ? 'dg-cell--obstacle' : ''}`}
                  style={{ gridColumn: c + 1, gridRow: r + 1, width: cell, height: cell }}
                >
                  {goalHere && <span className="dg-gem-goal" style={{ boxShadow: `0 0 0 3px hsl(${gemHue(goalHere.color)} 80% 60% / 0.9) inset` }} />}
                </div>
              )
            })
          )}
          {gems.map((g) => {
            const onGoal = level.goals.some((goal) => goal.color === g.color && goal.row === g.row && goal.col === g.col)
            return (
              <button
                key={g.id}
                type="button"
                className={`dg-gem ${selected === g.id ? 'dg-gem--selected' : ''} ${onGoal ? 'dg-gem--on-goal' : ''}`}
                style={{
                  gridColumn: g.col + 1,
                  gridRow: g.row + 1,
                  width: cell,
                  height: cell,
                  left: g.col * cell,
                  top: g.row * cell,
                  background: `radial-gradient(circle at 35% 30%, hsl(${gemHue(g.color)} 95% 78%), hsl(${gemHue(g.color)} 85% 45%))`,
                }}
                onClick={() => {
                  Sound.click()
                  setSelected((cur) => (cur === g.id ? null : g.id))
                }}
              />
            )
          })}
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={completed || !selected} />
        <div className="dg-hint">Toca una gema para seleccionarla y muévela con la cruceta.</div>
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: PINTAR
   ═══════════════════════════════════════════════════════════════════════════ */

function PintarGame({ onBack }: { onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'pintar')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('pintar'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<PintarLevel>(() => generatePintarLevel(progress.level))
  const [taps, setTaps] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    setLevel(generatePintarLevel(n))
    setTaps(0)
    setCompleted(false)
  }

  function handleTap(row: number, col: number) {
    if (completed) return
    const next = pintarTapCell(level, row, col)
    setLevel(next)
    setTaps((t) => t + 1)
    if (pintarIsComplete(next)) setCompleted(true)
  }

  const cell = cellSizeFor(level.rows, level.cols, 380, 26, 54)
  const progressInfo = pintarProgress(level)

  function paletteColor(id: string | null): string {
    if (!id) return 'transparent'
    const hue = level.palette.find((p) => p.id === id)?.hue ?? 0
    return `hsl(${hue} 80% 58%)`
  }
  function paletteHue(id: string): number {
    return level.palette.find((p) => p.id === id)?.hue ?? 0
  }

  function handleNext() {
    const stars = calcPintarStars(timeMs, level.targetSeconds, taps, level.cells.length)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('pintar', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcPintarStars(timeMs, level.targetSeconds, taps, level.cells.length)

  return (
    <div className="dg-game">
      <TopBar
        title={meta.title}
        icon={meta.icon}
        level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel}
        goal={`${level.goal} (${progressInfo.done}/${progressInfo.total})`}
        timeMs={timeMs}
        moves={taps}
        onBack={onBack}
        onRestart={() => loadLevel(viewingLevel)}
      />
      <div className="dg-board dg-board--paint">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.cells.map((c) => (
            <button
              key={`${c.row}-${c.col}`}
              type="button"
              className={`dg-cell dg-cell--paint ${c.locked ? 'dg-cell--locked' : ''} ${!c.locked && c.current === c.target ? 'dg-cell--matched' : ''}`}
              style={{
                gridColumn: c.col + 1,
                gridRow: c.row + 1,
                width: cell,
                height: cell,
                background: c.locked ? undefined : paletteColor(c.current),
                boxShadow: c.locked ? undefined : `0 0 0 3px hsl(${paletteHue(c.target)} 85% 65% / 0.85) inset`,
              }}
              onClick={() => handleTap(c.row, c.col)}
            >
              {c.locked && <span className="dg-rubble">{'▦'.repeat(Math.max(1, c.clearsNeeded - c.clearsDone))}</span>}
            </button>
          ))}
        </div>
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: HIELO
   ═══════════════════════════════════════════════════════════════════════════ */

function HieloGame({ dpad, skin, onBack }: { dpad: DPadSettings; skin: string; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'hielo')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('hielo'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<IceSlideLevel>(() => generateIceSlideLevel(progress.level))
  const [player, setPlayer] = useState<MazeCoord>(() => level.start)
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [sliding, setSliding] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateIceSlideLevel(n)
    setLevel(lvl)
    setPlayer(lvl.start)
    setMoves(0)
    setCompleted(false)
  }

  const handleMove = useCallback(
    (dir: Direction) => {
      if (completed) return
      const next = iceSlideTarget(level, player, dir)
      if (next.row === player.row && next.col === player.col) return
      setSliding(true)
      setPlayer(next)
      setMoves((m) => m + 1)
      window.setTimeout(() => setSliding(false), 220)
      if (next.row === level.target.row && next.col === level.target.col) setCompleted(true)
    },
    [level, player, completed]
  )
  useArrowKeys(handleMove, !completed)

  const cell = cellSizeFor(level.rows, level.cols, 400, 12, 40)

  function handleNext() {
    const stars = calcIceSlideStars(moves, timeMs, level.targetSeconds, level.moveLimit)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('hielo', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcIceSlideStars(moves, timeMs, level.targetSeconds, level.moveLimit)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={moves} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--ice">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.grid.map((row, r) =>
            row.map((type, c) => {
              let cls = 'dg-cell dg-cell--ice-tile'
              if (type === 'wall') cls += ' dg-cell--ice-wall'
              else if (type === 'ice') cls += ' dg-cell--ice-slick'
              else if (type === 'floor') cls += ' dg-cell--ice-snow'
              else if (type === 'goal') cls += ' dg-cell--ice-goal'
              return (
                <div key={r * level.cols + c} className={cls} style={{ gridColumn: c + 1, gridRow: r + 1, width: cell, height: cell }}>
                  {type === 'goal' && <span className="dg-emoji-mark">🚩</span>}
                </div>
              )
            })
          )}
          <PlayerToken row={player.row} col={player.col} cell={cell} skin={skin} className={sliding ? 'dg-token--sliding' : ''} />
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={completed} />
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: INTERRUPTORES
   ═══════════════════════════════════════════════════════════════════════════ */

function InterruptoresGame({ dpad, skin, onBack }: { dpad: DPadSettings; skin: string; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'interruptores')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('interruptores'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<SwitchLevel>(() => generateSwitchLevel(progress.level))
  const [state, setState] = useState<SwitchState>(() => switchInitialState(level))
  const [player, setPlayer] = useState<MazeCoord>(() => level.start)
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateSwitchLevel(n)
    setLevel(lvl)
    setState(switchInitialState(lvl))
    setPlayer(lvl.start)
    setMoves(0)
    setCompleted(false)
  }

  const handleMove = useCallback(
    (dir: Direction) => {
      if (completed) return
      const res = switchStep(level, state, player, dir)
      if (!res.moved) return
      setPlayer(res.player)
      setState(res.state)
      setMoves((m) => m + 1)
      if (switchIsComplete(level, res.player)) setCompleted(true)
    },
    [level, state, player, completed]
  )
  useArrowKeys(handleMove, !completed)

  const cell = cellSizeFor(level.rows, level.cols, 400, 14, 42)

  function doorHue(doorId: string): number {
    let h = 0
    for (let i = 0; i < doorId.length; i++) h = (h * 31 + doorId.charCodeAt(i)) % 360
    return h
  }

  function handleNext() {
    const stars = calcSwitchStars(moves, timeMs, level.targetSeconds, level.moveLimit)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('interruptores', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcSwitchStars(moves, timeMs, level.targetSeconds, level.moveLimit)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={moves} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--switch">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.grid.map((row, r) =>
            row.map((type, c) => {
              const door = level.doors.find((d) => d.row === r && d.col === c)
              const sw = level.switches.find((s) => s.row === r && s.col === c)
              const isTarget = r === level.target.row && c === level.target.col
              let cls = 'dg-cell dg-cell--switchboard'
              if (type === 'wall' && !door) cls += ' dg-cell--wall-metal'
              return (
                <div
                  key={r * level.cols + c}
                  className={cls}
                  style={{
                    gridColumn: c + 1,
                    gridRow: r + 1,
                    width: cell,
                    height: cell,
                    ...(door ? { boxShadow: `0 0 0 2px hsl(${doorHue(door.id)} 80% 60%) inset`, background: state.doorsOpen[door.id] ? 'transparent' : `hsl(${doorHue(door.id)} 60% 30%)` } : {}),
                  }}
                >
                  {isTarget && <span className="dg-emoji-mark">🚩</span>}
                  {sw && (
                    <span className="dg-switch-lever" style={{ color: `hsl(${doorHue(sw.doorIds[0])} 85% 65%)` }}>
                      {sw.doorIds.some((id) => state.doorsOpen[id]) ? '●' : '○'}
                    </span>
                  )}
                </div>
              )
            })
          )}
          <PlayerToken row={player.row} col={player.col} cell={cell} skin={skin} />
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={completed} />
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: TELETRANSPORTADORES
   ═══════════════════════════════════════════════════════════════════════════ */

function TeleportGame({ dpad, skin, onBack }: { dpad: DPadSettings; skin: string; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'teleport')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('teleport'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<TeleportLevel>(() => generateTeleportLevel(progress.level))
  const [player, setPlayer] = useState<MazeCoord>(() => level.start)
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [warping, setWarping] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateTeleportLevel(n)
    setLevel(lvl)
    setPlayer(lvl.start)
    setMoves(0)
    setCompleted(false)
  }

  const handleMove = useCallback(
    (dir: Direction) => {
      if (completed) return
      const res = teleportStep(level, player, dir)
      if (!res.moved) return
      setPlayer(res.player)
      setMoves((m) => m + 1)
      if (res.teleported) {
        setWarping(true)
        window.setTimeout(() => setWarping(false), 260)
      }
      if (teleportIsComplete(level, res.player)) setCompleted(true)
    },
    [level, player, completed]
  )
  useArrowKeys(handleMove, !completed)

  const cell = cellSizeFor(level.rows, level.cols, 400, 14, 42)

  function pairHue(index: number): number {
    return (index * 67) % 360
  }

  function handleNext() {
    const stars = calcTeleportStars(moves, timeMs, level.targetSeconds, level.moveLimit)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('teleport', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcTeleportStars(moves, timeMs, level.targetSeconds, level.moveLimit)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={moves} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--portal">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.grid.map((row, r) =>
            row.map((type, c) => {
              const portal = teleportPortalAt(level, r, c)
              const pairIndex = portal ? level.pairs.indexOf(portal.pair) : -1
              const isTarget = r === level.target.row && c === level.target.col
              return (
                <div key={r * level.cols + c} className={`dg-cell dg-cell--portalboard ${type === 'wall' ? 'dg-cell--wall-dark' : ''}`} style={{ gridColumn: c + 1, gridRow: r + 1, width: cell, height: cell }}>
                  {isTarget && <span className="dg-emoji-mark">🚩</span>}
                  {portal && <span className="dg-portal-ring" style={{ borderColor: `hsl(${pairHue(pairIndex)} 90% 65%)`, boxShadow: `0 0 12px hsl(${pairHue(pairIndex)} 90% 60%)` }} />}
                </div>
              )
            })
          )}
          <PlayerToken row={player.row} col={player.col} cell={cell} skin={skin} className={warping ? 'dg-token--warp' : ''} />
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={completed} />
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: LÁSER
   ═══════════════════════════════════════════════════════════════════════════ */

function LaserGame({ onBack }: { onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'laser')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('laser'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<LaserLevel>(() => generateLaserLevel(progress.level))
  const [mirrors, setMirrors] = useState<LaserMirror[]>(() => level.mirrors)
  const [rotations, setRotations] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generateLaserLevel(n)
    setLevel(lvl)
    setMirrors(lvl.mirrors)
    setRotations(0)
    setCompleted(false)
  }

  function handleRotate(id: string) {
    if (completed) return
    const next = toggleMirror(mirrors, id)
    setMirrors(next)
    setRotations((r) => r + 1)
    if (laserHitsTarget(level, next)) setCompleted(true)
  }

  const cell = cellSizeFor(level.rows, level.cols, 380, 26, 54)
  const beamPath = useMemo(() => simulateLaser(level, mirrors), [level, mirrors])
  const hit = useMemo(() => laserHitsTarget(level, mirrors), [level, mirrors])

  function center(r: number, c: number) {
    return { x: c * cell + cell / 2, y: r * cell + cell / 2 }
  }

  function handleNext() {
    const stars = calcLaserStars(timeMs, level.targetSeconds, rotations)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('laser', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcLaserStars(timeMs, level.targetSeconds, rotations)
  const stageWidth = level.cols * cell
  const stageHeight = level.rows * cell

  let beamD = `M ${center(level.source.row, level.source.col).x} ${center(level.source.row, level.source.col).y}`
  for (const p of beamPath) {
    const pt = center(p.row, p.col)
    beamD += ` L ${pt.x} ${pt.y}`
  }

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={rotations} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--laser">
        <div className="dg-stage dg-stage--laser" style={{ width: stageWidth, height: stageHeight }}>
          <div className="dg-grid-bg" style={{ '--dg-cols': level.cols, '--dg-rows': level.rows, '--dg-cell': `${cell}px` } as React.CSSProperties} />
          <svg className="dg-laser-svg" width={stageWidth} height={stageHeight}>
            <path d={beamD} className={`dg-laser-beam ${hit ? 'dg-laser-beam--hit' : ''}`} />
            <path d={beamD} className={`dg-laser-beam-glow ${hit ? 'dg-laser-beam-glow--hit' : ''}`} />
          </svg>
          <div className="dg-emoji-abs" style={{ left: center(level.source.row, level.source.col).x - cell / 2, top: center(level.source.row, level.source.col).y - cell / 2, width: cell, height: cell }}>
            🔻
          </div>
          <div
            className={`dg-emoji-abs ${hit ? 'dg-laser-target--hit' : ''}`}
            style={{ left: center(level.target.row, level.target.col).x - cell / 2, top: center(level.target.row, level.target.col).y - cell / 2, width: cell, height: cell }}
          >
            🎯
          </div>
          {mirrors.map((m) => (
            <button
              key={m.id}
              type="button"
              className="dg-mirror"
              style={{ left: m.col * cell, top: m.row * cell, width: cell, height: cell }}
              onClick={() => handleRotate(m.id)}
              aria-label="Girar espejo"
            >
              <span className={`dg-mirror__bar ${m.orientation === '/' ? 'dg-mirror__bar--fwd' : 'dg-mirror__bar--back'}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="dg-hint">Toca un espejo para girarlo y desviar el láser.</div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: CIRCUITOS
   ═══════════════════════════════════════════════════════════════════════════ */

function poweredCircuitCells(level: CircuitLevel): Set<number> {
  const W = level.cols
  const key = (r: number, c: number) => r * W + c
  const seen = new Set<number>([key(level.source.row, level.source.col)])
  const queue: MazeCoord[] = [level.source]
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    const piece = level.pieces[cur.row][cur.col]
    const dirs = pieceConnections(piece)
    for (const dir of dirs) {
      const { dr, dc } = DIRECTION_DELTA[dir]
      const nr = cur.row + dr
      const nc = cur.col + dc
      if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) continue
      const neighbor = level.pieces[nr][nc]
      const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
      if (!pieceConnections(neighbor).includes(opposite[dir])) continue
      const k = key(nr, nc)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ row: nr, col: nc })
    }
  }
  return seen
}

function CircuitPipe({ piece, powered, cell }: { piece: CircuitPiece; powered: boolean; cell: number }) {
  const dirs = pieceConnections(piece)
  const mid = cell / 2
  const armLen = cell * 0.5
  const points: Record<Direction, [number, number]> = {
    up: [mid, mid - armLen],
    down: [mid, mid + armLen],
    left: [mid - armLen, mid],
    right: [mid + armLen, mid],
  }
  const strokeColor = powered ? 'var(--dg-circuit-hot)' : 'var(--dg-circuit-cold)'
  return (
    <svg className="dg-circuit-svg" width={cell} height={cell}>
      {dirs.map((d) => (
        <line key={d} x1={mid} y1={mid} x2={points[d][0]} y2={points[d][1]} className={`dg-pipe ${powered ? 'dg-pipe--hot' : ''}`} stroke={strokeColor} />
      ))}
      <circle cx={mid} cy={mid} r={cell * 0.09} className={`dg-pipe-hub ${powered ? 'dg-pipe-hub--hot' : ''}`} fill={strokeColor} />
    </svg>
  )
}

function CircuitosGame({ onBack }: { onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'circuitos')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('circuitos'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<CircuitLevel>(() => generateCircuitLevel(progress.level))
  const [rotations, setRotations] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    setLevel(generateCircuitLevel(n))
    setRotations(0)
    setCompleted(false)
  }

  function handleClick(r: number, c: number) {
    if (completed) return
    const next = rotateCircuitPiece(level, r, c)
    if (next === level) return
    setLevel(next)
    setRotations((n) => n + 1)
    if (isCircuitComplete(next)) setCompleted(true)
  }

  const cell = cellSizeFor(level.rows, level.cols, 400, 22, 48)
  const powered = useMemo(() => poweredCircuitCells(level), [level])

  function handleNext() {
    const stars = calcCircuitStars(timeMs, level.targetSeconds, rotations, level.rows * level.cols)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('circuitos', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcCircuitStars(timeMs, level.targetSeconds, rotations, level.rows * level.cols)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={level.goal} timeMs={timeMs} moves={rotations} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--circuit">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.pieces.map((row, r) =>
            row.map((piece, c) => {
              const isPowered = powered.has(r * level.cols + c)
              const clickable = !piece.fixed && piece.kind !== 'empty'
              return (
                <button
                  key={r * level.cols + c}
                  type="button"
                  className={`dg-cell dg-cell--circuit ${piece.kind === 'empty' ? 'dg-cell--circuit-empty' : ''} ${clickable ? 'dg-cell--clickable' : ''}`}
                  style={{ gridColumn: c + 1, gridRow: r + 1, width: cell, height: cell }}
                  onClick={() => handleClick(r, c)}
                  disabled={!clickable}
                >
                  {piece.kind !== 'empty' && <CircuitPipe piece={piece} powered={isPowered} cell={cell} />}
                  {piece.kind === 'source' && <span className="dg-emoji-mark dg-circuit-bulb">💡</span>}
                  {piece.kind === 'target' && <span className="dg-emoji-mark">🚩</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="dg-hint">Toca una pieza (incluida la fuente) para girarla 90°.</div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vista: CAMINO ÚNICO
   ═══════════════════════════════════════════════════════════════════════════ */

function CaminoUnicoGame({ dpad, skin, onBack }: { dpad: DPadSettings; skin: string; onBack: () => void }) {
  const meta = GAME_META.find((g) => g.id === 'camino')!
  const [progress, setProgress] = useState<GameProgress>(() => loadGameProgress('camino'))
  const [viewingLevel, setViewingLevel] = useState(progress.level)
  const [level, setLevel] = useState<PathUniqueLevel>(() => generatePathUniqueLevel(progress.level))
  const [player, setPlayer] = useState<MazeCoord>(() => level.start)
  const [visited, setVisited] = useState<Set<number>>(() => pathUniqueInitialVisited(level))
  const [moves, setMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const timeMs = useElapsedMs(level.seed, completed)

  function loadLevel(n: number) {
    setViewingLevel(n)
    const lvl = generatePathUniqueLevel(n)
    setLevel(lvl)
    setPlayer(lvl.start)
    setVisited(pathUniqueInitialVisited(lvl))
    setMoves(0)
    setCompleted(false)
  }

  const handleMove = useCallback(
    (dir: Direction) => {
      if (completed) return
      const res = pathUniqueStep(level, visited, player, dir)
      if (!res.moved) {
        Sound.blocked()
        return
      }
      Sound.crack()
      setPlayer(res.player)
      setVisited(res.visited)
      setMoves((m) => m + 1)
      if (pathUniqueIsComplete(level, res.player, res.visited)) {
        setCompleted(true)
        Sound.success()
      }
    },
    [level, visited, player, completed]
  )
  useArrowKeys(handleMove, !completed)

  const cell = cellSizeFor(level.rows, level.cols, 400, 20, 48)

  function handleNext() {
    const stars = calcPathUniqueStars(moves, timeMs, level.targetSeconds, level.totalWalkable)
    const nextProgressLevel = Math.max(progress.level, viewingLevel + 1)
    const nextProgress: GameProgress = { level: nextProgressLevel, stars: { ...progress.stars, [viewingLevel]: Math.max(progress.stars[viewingLevel] ?? 0, stars) as 0 | 1 | 2 | 3 } }
    setProgress(nextProgress)
    saveGameProgress('camino', nextProgress)
    loadLevel(viewingLevel + 1)
  }

  const stars = calcPathUniqueStars(moves, timeMs, level.targetSeconds, level.totalWalkable)

  return (
    <div className="dg-game">
      <TopBar title={meta.title} icon={meta.icon} level={viewingLevel} maxLevel={progress.level} onJumpLevel={loadLevel} goal={`${level.goal} (${visited.size}/${level.totalWalkable})`} timeMs={timeMs} moves={moves} onBack={onBack} onRestart={() => loadLevel(viewingLevel)} />
      <div className="dg-board dg-board--ember">
        <div className="dg-stage" style={{ '--dg-cols': level.cols, '--dg-cell': `${cell}px` } as React.CSSProperties}>
          {level.grid.map((row, r) =>
            row.map((type, c) => {
              const key = r * level.cols + c
              const isVisited = visited.has(key)
              const isTarget = r === level.target.row && c === level.target.col
              const targetReady = visited.size === level.totalWalkable - 1
              let cls = 'dg-cell dg-cell--ember'
              if (type === 'wall') cls += ' dg-cell--ember-wall'
              else if (isVisited) cls += ' dg-cell--ember-cracked'
              if (isTarget) cls += targetReady ? ' dg-cell--target-ready' : ' dg-cell--target-pending'
              return (
                <div key={key} className={cls} style={{ gridColumn: c + 1, gridRow: r + 1, width: cell, height: cell }}>
                  {isTarget && <span className={`dg-emoji-mark dg-target-blink ${targetReady ? 'dg-target-blink--ready' : ''}`}>🚩</span>}
                </div>
              )
            })
          )}
          <PlayerToken row={player.row} col={player.col} cell={cell} skin={skin} />
        </div>
      </div>
      <div className="dg-controls">
        <DPad settings={dpad} onMove={handleMove} disabled={completed} />
      </div>
      {completed && <CompletionOverlay stars={stars} timeMs={timeMs} onRetry={() => loadLevel(progress.level)} onNext={handleNext} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE RAÍZ
   ═══════════════════════════════════════════════════════════════════════════ */

type Screen = 'menu' | GameId

export default function DespejesGame() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dpad, setDpad] = useState<DPadSettings>(() => loadDPadSettings())
  const [skin, setSkin] = useState<string>(() => loadPlayerSkin())
  const [progressTick, setProgressTick] = useState(0)

  const progressByGame = useMemo(() => {
    const map = {} as Record<GameId, GameProgress>
    for (const g of GAME_META) map[g.id] = loadGameProgress(g.id)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, progressTick])

  function handleChangeDPad(next: DPadSettings) {
    setDpad(next)
    saveDPadSettings(next)
  }

  function handleBack() {
    setScreen('menu')
    setProgressTick((n) => n + 1)
  }

  return (
    <div className="dg-root">
      <style>{DESPEJES_CSS}</style>

      {screen === 'menu' && <MainMenu onSelect={(id) => setScreen(id)} onOpenSettings={() => setSettingsOpen(true)} skin={skin} progressByGame={progressByGame} />}
      {screen === 'laberinto' && <LaberintoGame dpad={dpad} skin={skin} onBack={handleBack} />}
      {screen === 'hielo' && <HieloGame dpad={dpad} skin={skin} onBack={handleBack} />}
      {screen === 'interruptores' && <InterruptoresGame dpad={dpad} skin={skin} onBack={handleBack} />}
      {screen === 'teleport' && <TeleportGame dpad={dpad} skin={skin} onBack={handleBack} />}
      {screen === 'laser' && <LaserGame onBack={handleBack} />}
      {screen === 'circuitos' && <CircuitosGame onBack={handleBack} />}
      {screen === 'camino' && <CaminoUnicoGame dpad={dpad} skin={skin} onBack={handleBack} />}
      {screen === 'croma' && <CromaGame dpad={dpad} onBack={handleBack} />}
      {screen === 'pintar' && <PintarGame onBack={handleBack} />}

      {settingsOpen && (
        <SettingsPanel
          dpad={dpad}
          onChangeDPad={handleChangeDPad}
          skin={skin}
          onChangeSkin={setSkin}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOJA DE ESTILOS — inyectada una vez por el componente raíz
   ═══════════════════════════════════════════════════════════════════════════ */

const DESPEJES_CSS = `
.dg-root {
  --dg-bg-0: #070b14;
  --dg-bg-1: #0d1424;
  --dg-bg-2: #131c33;
  --dg-surface: rgba(255,255,255,0.055);
  --dg-surface-strong: rgba(255,255,255,0.09);
  --dg-border: rgba(255,255,255,0.10);
  --dg-text: #eef2ff;
  --dg-text-dim: #9aa4c2;
  --dg-primary: #7c9bff;
  --dg-primary-strong: #5c7bff;
  --dg-success: #34d399;
  --dg-warning: #fbbf24;
  --dg-danger: #f87171;
  --dg-circuit-hot: #ffcf6b;
  --dg-circuit-cold: #3b4360;
  --dg-radius-lg: 22px;
  --dg-radius-md: 14px;
  --dg-radius-sm: 9px;
  --dg-shadow-lift: 0 10px 30px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35);
  position: relative;
  min-height: 100%;
  width: 100%;
  color: var(--dg-text);
  background:
    radial-gradient(1200px 700px at 15% -10%, #1c2650 0%, transparent 60%),
    radial-gradient(1000px 600px at 110% 10%, #241a3c 0%, transparent 55%),
    linear-gradient(180deg, var(--dg-bg-0), var(--dg-bg-1) 40%, var(--dg-bg-2));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
  box-sizing: border-box;
  padding: 18px 14px 34px;
  overflow-x: hidden;
}
.dg-root *, .dg-root *::before, .dg-root *::after { box-sizing: border-box; }
.dg-root button { font-family: inherit; cursor: pointer; color: inherit; }
.dg-root button:disabled { cursor: not-allowed; opacity: 0.45; }

/* ── Menú principal ── */
.dg-menu { max-width: 920px; margin: 0 auto; }
.dg-menu__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 22px; }
.dg-menu__title {
  font-size: 30px; font-weight: 800; letter-spacing: -0.02em;
  background: linear-gradient(90deg, #a6b8ff, #e7c8ff 55%, #ffd8b0);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.dg-menu__subtitle { color: var(--dg-text-dim); font-size: 13.5px; margin-top: 4px; max-width: 46ch; }
.dg-menu__settings {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
  background: var(--dg-surface); border: 1px solid var(--dg-border);
}
.dg-menu__skin { font-size: 18px; }
.dg-menu__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }

.dg-card {
  position: relative; text-align: left; padding: 16px 16px 14px; border-radius: var(--dg-radius-lg);
  background: linear-gradient(155deg, var(--dg-surface-strong), var(--dg-surface));
  border: 1px solid var(--dg-border);
  box-shadow: var(--dg-shadow-lift);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  overflow: hidden;
  isolation: isolate;
}
.dg-card::before {
  content: ""; position: absolute; inset: -40% -40% auto auto; width: 60%; height: 60%;
  background: radial-gradient(circle, var(--dg-accent, #7c9bff) 0%, transparent 70%);
  opacity: 0.22; z-index: -1; transition: opacity 0.2s ease;
}
.dg-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.22); }
.dg-card:hover::before { opacity: 0.36; }
.dg-card:active { transform: translateY(-1px) scale(0.99); }
.dg-card__icon { font-size: 30px; line-height: 1; margin-bottom: 10px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4)); }
.dg-card__title { font-size: 16px; font-weight: 700; margin-bottom: 3px; }
.dg-card__tagline { font-size: 12.5px; color: var(--dg-text-dim); line-height: 1.35; min-height: 32px; }
.dg-card__footer { display: flex; gap: 6px; margin-top: 12px; }

.dg-card--stone   { --dg-accent: #c9a06a; }
.dg-card--ice     { --dg-accent: #7cd6ff; }
.dg-card--switch  { --dg-accent: #6ee7b7; }
.dg-card--portal  { --dg-accent: #c58bff; }
.dg-card--laser   { --dg-accent: #ff6b6b; }
.dg-card--circuit { --dg-accent: #ffcf6b; }
.dg-card--ember   { --dg-accent: #ff8a5c; }
.dg-card--gem     { --dg-accent: #ff8bcf; }
.dg-card--paint   { --dg-accent: #8bc7ff; }

/* ── Chips / botones genéricos ── */
.dg-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 999px;
  background: var(--dg-surface); border: 1px solid var(--dg-border); font-size: 12.5px; font-weight: 600;
  white-space: nowrap;
}
.dg-chip--dark { background: rgba(0,0,0,0.28); }

.dg-iconbtn {
  width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--dg-border);
  background: var(--dg-surface-strong); font-size: 17px; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s ease, transform 0.1s ease;
}
.dg-iconbtn:hover { background: rgba(255,255,255,0.16); }
.dg-iconbtn:active { transform: scale(0.94); }
.dg-iconbtn--ghost { background: transparent; }

.dg-btn {
  padding: 10px 18px; border-radius: 12px; border: 1px solid var(--dg-border); font-weight: 700; font-size: 14px;
  transition: transform 0.12s ease, filter 0.15s ease;
}
.dg-btn:active { transform: scale(0.97); }
.dg-btn--primary { background: linear-gradient(135deg, var(--dg-primary), #9b7bff); border: none; color: #08102b; box-shadow: 0 8px 20px rgba(124,155,255,0.35); }
.dg-btn--primary:hover { filter: brightness(1.08); }
.dg-btn--ghost { background: var(--dg-surface); }
.dg-btn--sm { padding: 7px 12px; font-size: 12.5px; }

/* ── Estrellas ── */
.dg-stars { display: flex; gap: 6px; justify-content: center; margin: 6px 0 2px; }
.dg-star { font-size: 26px; color: rgba(255,255,255,0.18); transition: color 0.2s ease, transform 0.2s ease; }
.dg-star--on { color: var(--dg-warning); text-shadow: 0 0 14px rgba(251,191,36,0.65); transform: scale(1.08); }

/* ── Overlays / modales ── */
.dg-overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: rgba(4,7,16,0.72); backdrop-filter: blur(6px); padding: 18px; animation: dg-fade-in 0.18s ease;
}
.dg-overlay__card {
  width: 100%; max-width: 380px; background: linear-gradient(165deg, #1a2340, #10162a);
  border: 1px solid rgba(255,255,255,0.12); border-radius: var(--dg-radius-lg); padding: 26px 22px 22px;
  text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.55);
  animation: dg-pop-in 0.22s cubic-bezier(.2,.9,.3,1.3);
}
.dg-overlay__badge {
  width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 26px; background: linear-gradient(135deg, var(--dg-success), #10b981); box-shadow: 0 0 26px rgba(52,211,153,0.55);
}
.dg-overlay__title { font-size: 19px; font-weight: 800; margin-bottom: 4px; }
.dg-overlay__time { color: var(--dg-text-dim); font-size: 13px; margin: 6px 0 18px; }
.dg-overlay__actions { display: flex; gap: 10px; justify-content: center; }

/* ── Ajustes ── */
.dg-settings { max-width: 420px; text-align: left; }
.dg-settings__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.dg-settings__section { margin-bottom: 20px; }
.dg-settings__label { font-size: 13px; font-weight: 700; color: var(--dg-text-dim); margin-bottom: 8px; display: flex; justify-content: space-between; }
.dg-settings__value { color: var(--dg-text); }
.dg-settings__preview { display: flex; justify-content: center; margin-top: 6px; }

.dg-skin-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.dg-skin-btn {
  width: 42px; height: 42px; border-radius: 12px; font-size: 20px; background: var(--dg-surface);
  border: 1px solid var(--dg-border); display: flex; align-items: center; justify-content: center;
  transition: transform 0.12s ease, border-color 0.15s ease;
}
.dg-skin-btn:hover { transform: translateY(-2px); }
.dg-skin-btn--active { border-color: var(--dg-primary); box-shadow: 0 0 0 2px rgba(124,155,255,0.4); }
.dg-skin-btn--add { font-weight: 800; font-size: 22px; color: var(--dg-primary); border-style: dashed; }

.dg-custom-skin { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
.dg-custom-skin__error { color: var(--dg-danger); font-size: 12px; width: 100%; }
.dg-input {
  flex: 1; min-width: 120px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--dg-border);
  background: rgba(0,0,0,0.3); color: var(--dg-text); font-size: 15px;
}
.dg-input--error { border-color: var(--dg-danger); }
.dg-slider { width: 100%; accent-color: var(--dg-primary); }

/* ── Cruceta ── */
.dg-dpad { display: flex; flex-direction: column; align-items: center; gap: var(--dg-gap, 6px); user-select: none; }
.dg-dpad__row { display: flex; align-items: center; gap: var(--dg-gap, 6px); }
.dg-dpad__hub { width: calc(var(--dg-btn, 60px) * 0.5); height: calc(var(--dg-btn, 60px) * 0.5); border-radius: 50%; background: rgba(255,255,255,0.04); }
.dg-dpad__btn {
  width: var(--dg-btn, 60px); height: var(--dg-btn, 60px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03));
  box-shadow: 0 6px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18);
  font-size: calc(var(--dg-btn, 60px) * 0.34); display: flex; align-items: center; justify-content: center;
  color: var(--dg-text); transition: transform 0.08s ease, background 0.15s ease;
}
.dg-dpad__btn:active { transform: scale(0.9); background: linear-gradient(160deg, rgba(124,155,255,0.5), rgba(124,155,255,0.18)); }

/* Variantes de cruceta */
.dg-dpad--minimal .dg-dpad__btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); box-shadow: none; border-radius: 10px; }
.dg-dpad--minimal .dg-dpad__btn:active { background: rgba(124,155,255,0.3); }
.dg-dpad--neon .dg-dpad__btn {
  background: rgba(10,14,28,0.7); border: 1px solid var(--dg-primary);
  box-shadow: 0 0 10px rgba(124,155,255,0.55), inset 0 0 8px rgba(124,155,255,0.35);
  color: #cdd9ff;
}
.dg-dpad--neon .dg-dpad__btn:active { box-shadow: 0 0 22px rgba(124,155,255,0.9), inset 0 0 12px rgba(124,155,255,0.6); }
.dg-dpad--glass .dg-dpad__btn {
  background: rgba(255,255,255,0.10); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.25);
  box-shadow: 0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
}
.dg-dpad--glass .dg-dpad__btn:active { background: rgba(255,255,255,0.22); }

.dg-style-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.dg-style-btn { padding: 8px 12px; border-radius: 10px; background: var(--dg-surface); border: 1px solid var(--dg-border); font-size: 12.5px; font-weight: 600; }
.dg-style-btn--active { border-color: var(--dg-primary); background: rgba(124,155,255,0.18); color: #cdd9ff; }
.dg-settings__reset { width: 100%; margin-top: 14px; }

/* ── Botón "Volver" (pill, con hover) ── */
.dg-backbtn {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 999px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); color: var(--dg-text);
  font-weight: 700; font-size: 13.5px; transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  flex-shrink: 0;
}
.dg-backbtn:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.26); }
.dg-backbtn:active { transform: scale(0.96); }
.dg-backbtn--top { margin-bottom: 14px; }

/* ── Chip "Nivel" clicable + selector de nivel ── */
.dg-chip--clickable { background: rgba(124,155,255,0.16); border-color: rgba(124,155,255,0.4); font-weight: 700; }
.dg-chip--clickable:hover { background: rgba(124,155,255,0.28); }
.dg-chip--danger { background: rgba(248,113,113,0.18); border-color: rgba(248,113,113,0.5); color: #ffd4d4; animation: dg-danger-pulse 1s ease-in-out infinite; }
@keyframes dg-danger-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
.dg-levelpicker { max-width: 360px; }
.dg-levelpicker__grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-height: 260px; overflow-y: auto; padding-right: 2px; }
.dg-levelpicker__btn { padding: 10px 0; border-radius: 10px; background: var(--dg-surface); border: 1px solid var(--dg-border); font-weight: 700; }
.dg-levelpicker__btn:hover { background: rgba(255,255,255,0.14); }
.dg-levelpicker__btn--active { border-color: var(--dg-primary); background: rgba(124,155,255,0.25); }

/* ── Barra superior de cada juego ── */
.dg-topbar {
  display: flex; align-items: center; gap: 10px; max-width: 620px; margin: 0 auto 14px;
  background: var(--dg-surface); border: 1px solid var(--dg-border); border-radius: var(--dg-radius-md); padding: 10px 12px;
}
.dg-topbar__center { flex: 1; min-width: 0; }
.dg-topbar__title { font-weight: 800; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-topbar__icon { margin-right: 2px; }
.dg-topbar__level { color: var(--dg-text-dim); font-weight: 600; }
.dg-topbar__goal { color: var(--dg-text-dim); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-topbar__stats { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.dg-game { display: flex; flex-direction: column; align-items: center; }
.dg-board { padding: 14px; border-radius: var(--dg-radius-lg); border: 1px solid var(--dg-border); box-shadow: var(--dg-shadow-lift); margin-bottom: 16px; max-width: 100%; overflow: auto; }
.dg-controls { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 4px; }
.dg-hint { color: var(--dg-text-dim); font-size: 12.5px; text-align: center; margin-top: 10px; max-width: 320px; }

.dg-stage { position: relative; display: grid; grid-template-columns: repeat(var(--dg-cols), var(--dg-cell)); grid-auto-rows: var(--dg-cell); gap: 0; }
.dg-cell { position: relative; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1px solid rgba(0,0,0,0.28); }
.dg-emoji-mark { font-size: 0.62em; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); pointer-events: none; }
.dg-emoji-abs { position: absolute; display: flex; align-items: center; justify-content: center; font-size: 18px; pointer-events: none; z-index: 3; }

.dg-token {
  position: absolute; top: 0; left: 0; display: flex; align-items: center; justify-content: center;
  transition: transform 0.16s cubic-bezier(.3,.9,.4,1); z-index: 5; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
}
.dg-token--sliding { transition-duration: 0.14s; }
.dg-token--warp { animation: dg-warp 0.26s ease; }

@keyframes dg-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes dg-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes dg-warp { 0% { filter: brightness(1) blur(0); } 45% { filter: brightness(2.4) blur(2px); transform: scale(1.25) translate(var(--dg-tx,0),var(--dg-ty,0)); } 100% { filter: brightness(1) blur(0); } }

/* ── Laberinto (piedra) ── */
.dg-board--stone { background: linear-gradient(160deg, #241a12, #1a130d); }
.dg-cell--maze.dg-cell--wall { background: linear-gradient(160deg, #4a3c2c, #2c2115); border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 -3px 0 rgba(0,0,0,0.25); }
.dg-cell--maze.dg-cell--floor { background: radial-gradient(circle at 30% 30%, #6b5638, #4a3b26); border-radius: 3px; }
.dg-cell--maze.dg-cell--hole { background: radial-gradient(circle, #050505, #1a1a1a 70%); border-radius: 50%; box-shadow: inset 0 4px 8px rgba(0,0,0,0.8); }
.dg-cell--maze.dg-cell--fog { background: #0a0a0a; }
.dg-boulder { font-size: 0.72em; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.6)); }
.dg-glass { font-size: 0.66em; filter: drop-shadow(0 0 6px rgba(120,200,255,0.85)); animation: dg-glass-shimmer 2.2s ease-in-out infinite; }
@keyframes dg-glass-shimmer { 0%,100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
.dg-exit-flag { animation: dg-flag-wave 1.6s ease-in-out infinite; transform-origin: bottom center; }
@keyframes dg-flag-wave { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(6deg); } }

/* Cámara estilo GBA: ventana fija que sigue al jugador en mapas grandes */
.dg-camera { position: relative; overflow: hidden; border-radius: 14px; margin: 0 auto; box-shadow: inset 0 0 40px rgba(0,0,0,0.55), 0 0 0 3px rgba(0,0,0,0.4); }
.dg-camera__inner { position: absolute; top: 0; left: 0; transition: transform 0.16s cubic-bezier(.3,.9,.4,1); }

.dg-overlay__badge--fail { background: linear-gradient(135deg, var(--dg-danger), #dc2626); box-shadow: 0 0 26px rgba(248,113,113,0.55); }

/* ── Hielo ── */
.dg-board--ice { background: linear-gradient(160deg, #0d2436, #081824); }
.dg-cell--ice-tile { border-radius: 3px; }
.dg-cell--ice-wall { background: linear-gradient(160deg, #1c2b3a, #101c28); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
.dg-cell--ice-slick {
  background: linear-gradient(135deg, #d8f4ff, #9fd9f2 55%, #cdeeff);
  box-shadow: inset 0 0 10px rgba(255,255,255,0.6), inset 0 -4px 6px rgba(90,160,190,0.5);
  position: relative; overflow: hidden;
}
.dg-cell--ice-slick::after {
  content: ""; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 60%);
  background-size: 240% 240%; animation: dg-ice-shine 3.6s linear infinite;
}
.dg-cell--ice-snow { background: linear-gradient(160deg, #eaf6fb, #c9dbe4); box-shadow: inset 0 0 8px rgba(255,255,255,0.4); }
.dg-cell--ice-goal { background: linear-gradient(160deg, #16324a, #0c2032); box-shadow: 0 0 16px rgba(124,214,255,0.55) inset; }
@keyframes dg-ice-shine { 0% { background-position: 0% 0%; } 100% { background-position: 200% 200%; } }

/* ── Interruptores ── */
.dg-board--switch { background: linear-gradient(160deg, #0f2620, #0a1a16); }
.dg-cell--switchboard { background: linear-gradient(160deg, #16352c, #0e241d); border-radius: 3px; }
.dg-cell--wall-metal { background: repeating-linear-gradient(135deg, #33404a, #33404a 6px, #2a343d 6px, #2a343d 12px); border-radius: 3px; }
.dg-switch-lever { font-size: 0.7em; filter: drop-shadow(0 0 5px currentColor); }

/* ── Teletransportadores ── */
.dg-board--portal { background: linear-gradient(160deg, #221635, #170e26); }
.dg-cell--portalboard { background: linear-gradient(160deg, #2a1c46, #1c1230); border-radius: 3px; }
.dg-cell--wall-dark { background: repeating-linear-gradient(45deg, #241636, #241636 6px, #1a0f28 6px, #1a0f28 12px); }
.dg-portal-ring {
  width: 62%; height: 62%; border-radius: 50%; border: 3px solid; position: relative;
  background: conic-gradient(from 0deg, transparent, currentColor, transparent 60%);
  animation: dg-portal-spin 1.8s linear infinite;
}
@keyframes dg-portal-spin { to { transform: rotate(360deg); } }

/* ── Láser ── */
.dg-board--laser { background: linear-gradient(160deg, #240f10, #170a0b); }
.dg-stage--laser { position: relative; }
.dg-grid-bg {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: var(--dg-cell) var(--dg-cell);
}
.dg-laser-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; z-index: 2; }
.dg-laser-beam { fill: none; stroke: #ff4d4d; stroke-width: 2.4; stroke-linecap: round; opacity: 0.9; }
.dg-laser-beam--hit { stroke: #7dffb0; }
.dg-laser-beam-glow { fill: none; stroke: #ff4d4d; stroke-width: 9; stroke-linecap: round; opacity: 0.28; filter: blur(3px); animation: dg-laser-pulse 1.4s ease-in-out infinite; }
.dg-laser-beam-glow--hit { stroke: #7dffb0; opacity: 0.4; }
@keyframes dg-laser-pulse { 0%,100% { opacity: 0.18; } 50% { opacity: 0.42; } }
.dg-laser-target--hit { filter: drop-shadow(0 0 10px #7dffb0); animation: dg-pop-in 0.3s ease; }
.dg-mirror { position: absolute; background: transparent; border: none; z-index: 3; display: flex; align-items: center; justify-content: center; }
.dg-mirror__bar {
  width: 78%; height: 5px; border-radius: 3px; background: linear-gradient(90deg, #ffe27a, #fff4c2);
  box-shadow: 0 0 10px rgba(255,226,122,0.85), 0 0 2px #fff;
}
.dg-mirror__bar--fwd { transform: rotate(-45deg); }
.dg-mirror__bar--back { transform: rotate(45deg); }

/* ── Circuitos ── */
.dg-board--circuit {
  background:
    linear-gradient(160deg, #142313, #0d1a0c);
}
.dg-cell--circuit {
  background: radial-gradient(circle at 50% 50%, #16321c, #0f2113);
  border: 1px solid rgba(255,255,255,0.03);
}
.dg-cell--circuit-empty { background: #0a140a; }
.dg-cell--clickable:hover { background: radial-gradient(circle at 50% 50%, #1e4224, #123018); }
.dg-circuit-svg { position: absolute; inset: 0; }
.dg-pipe { stroke-width: 5; stroke-linecap: round; opacity: 0.55; transition: stroke 0.15s ease, opacity 0.15s ease; }
.dg-pipe--hot { opacity: 1; filter: drop-shadow(0 0 5px var(--dg-circuit-hot)); }
.dg-pipe-hub { opacity: 0.55; }
.dg-pipe-hub--hot { opacity: 1; filter: drop-shadow(0 0 5px var(--dg-circuit-hot)); }
.dg-circuit-bulb { position: absolute; font-size: 0.68em; filter: drop-shadow(0 0 8px #ffe27a); animation: dg-bulb-glow 1.6s ease-in-out infinite; }
@keyframes dg-bulb-glow { 0%,100% { filter: drop-shadow(0 0 4px #ffcf6b); } 50% { filter: drop-shadow(0 0 12px #ffe27a); } }

/* ── Camino único (brasa / grietas) ── */
.dg-board--ember { background: linear-gradient(160deg, #2a150d, #1a0d08); }
.dg-cell--ember { background: linear-gradient(160deg, #7a4326, #5a2f19); border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
.dg-cell--ember-wall { background: repeating-linear-gradient(135deg, #2a1a12, #2a1a12 6px, #21140d 6px, #21140d 12px); }
.dg-cell--ember-cracked {
  background:
    linear-gradient(160deg, #33261d, #241812);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);
  position: relative;
}
.dg-cell--ember-cracked::before {
  content: ""; position: absolute; inset: 6%; opacity: 0.55; animation: dg-crack-appear 0.28s ease-out;
  background:
    linear-gradient(35deg, transparent 46%, #0a0705 48%, transparent 50%),
    linear-gradient(-35deg, transparent 40%, #0a0705 42%, transparent 44%),
    linear-gradient(80deg, transparent 60%, #0a0705 62%, transparent 64%);
}
@keyframes dg-crack-appear { 0% { opacity: 0; transform: scale(0.4); } 60% { opacity: 0.75; transform: scale(1.08); } 100% { opacity: 0.55; transform: scale(1); } }
.dg-cell--target-pending, .dg-cell--target-ready { box-shadow: 0 0 0 2px rgba(255,255,255,0.18) inset; }
.dg-target-blink { animation: dg-target-color 1.6s ease-in-out infinite; }
.dg-target-blink--ready { animation: dg-target-color-ready 0.55s ease-in-out infinite; transform-origin: bottom center; }
@keyframes dg-target-color { 0%,100% { filter: hue-rotate(0deg) drop-shadow(0 0 4px rgba(255,255,255,0.3)); } 50% { filter: hue-rotate(140deg) drop-shadow(0 0 10px rgba(160,255,180,0.7)); } }
@keyframes dg-target-color-ready { 0%,100% { filter: hue-rotate(0deg) drop-shadow(0 0 10px rgba(120,255,140,0.9)); transform: scale(1); } 50% { filter: hue-rotate(200deg) drop-shadow(0 0 16px rgba(120,200,255,0.95)); transform: scale(1.22); } }

/* ── Croma (gemas) ── */
.dg-board--gem { background: linear-gradient(160deg, #221228, #170c1e); }
.dg-cell--gemboard { background: radial-gradient(circle at 40% 30%, #2c1b38, #1b1024); border-radius: 4px; }
.dg-cell--obstacle { background: repeating-linear-gradient(45deg, #34203f, #34203f 6px, #291832 6px, #291832 12px); }
.dg-gem-goal { position: absolute; inset: 14%; border-radius: 6px; }
.dg-gem {
  position: absolute; top: 0; left: 0; border: none; border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.5);
  transition: left 0.14s ease, top 0.14s ease, transform 0.12s ease;
}
.dg-gem--selected { transform: scale(1.08); box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(0,0,0,0.6); }
.dg-gem--on-goal { animation: dg-gem-lock 0.32s ease-out; box-shadow: 0 0 0 2px rgba(255,255,255,0.7), 0 0 12px rgba(255,255,255,0.5); }
@keyframes dg-gem-lock { 0% { transform: scale(0.7); } 55% { transform: scale(1.18); } 100% { transform: scale(1); } }

/* ── Pintar ── */
.dg-board--paint { background: linear-gradient(160deg, #17202f, #0f1620); }
.dg-cell--paint { border: none; border-radius: 8px; background: #1c2636; transition: background 0.15s ease, transform 0.1s ease; }
.dg-cell--paint:active { transform: scale(0.94); }
.dg-cell--locked { background: repeating-linear-gradient(45deg, #2c3242, #2c3242 6px, #232838 6px, #232838 12px); }
.dg-cell--matched { box-shadow: 0 0 0 3px #fff inset, 0 0 12px rgba(255,255,255,0.35); }
.dg-rubble { font-size: 0.5em; letter-spacing: 2px; color: rgba(255,255,255,0.55); }

/* ── Responsive ── */
@media (max-width: 480px) {
  .dg-menu__title { font-size: 24px; }
  .dg-topbar__goal { display: none; }
}
`
export { DespejesGame }