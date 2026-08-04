import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundCard,
  soundMatch,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  formatDuration,
} from '@/core/storage/progress'
import {
  DEFAULT_IMAGES,
  PIECE_SHAPES,
  PIECE_SUGGESTIONS,
  CATEGORY_LABELS,
  generateJigsawLevel,
  createPieces,
  trySnap,
  isPuzzleComplete,
  countLocked,
  formatTime,
  calcStars,
  piecesForLevel,
  compressImageFile,
  loadCustomImages,
  addCustomImage,
  removeCustomImage,
  drawFallbackCover,
  type PuzzleImage,
  type PieceShape,
  type JigsawLevel,
  type JigsawPiece,
  type ImageCategory,
} from '../generateLevel'

type HubTab =
  | 'home'
  | 'normal'
  | 'creative'
  | 'gallery'
  | 'mine'
  | 'playing'

type Phase = 'hub' | 'playing' | 'success'

const GAME_CAT = 'logica' as const
const GAME_ID = 'rompecabezas'

/** Preferencias locales del rompecabezas */
const PREFS_KEY = 'gco:jigsaw-prefs'

type JigsawPrefs = {
  showPreviewDefault: boolean
  showEdgesDefault: boolean
  snapAssist: boolean
  softProgression: boolean
}

function loadPrefs(): JigsawPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<JigsawPrefs>
      return {
        showPreviewDefault: p.showPreviewDefault ?? false,
        showEdgesDefault: p.showEdgesDefault ?? true,
        snapAssist: p.snapAssist ?? true,
        softProgression: p.softProgression ?? false,
      }
    }
  } catch {
    /* */
  }
  return {
    showPreviewDefault: false,
    showEdgesDefault: true,
    snapAssist: true,
    softProgression: false,
  }
}

function savePrefs(p: JigsawPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p))
}

/* ─── helpers UI ─────────────────────────────────────────────────────────── */

function useIsMobile(bp = 900) {
  const [m, setM] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : true
  )
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

function StarRow({ n }: { n: number }) {
  return (
    <span aria-label={`${n} estrellas`} style={{ letterSpacing: 2 }}>
      {([1, 2, 3] as const).map((i) => (
        <span
          key={i}
          style={{
            color: i <= n ? 'var(--gco-primary)' : 'var(--gco-ink-faint)',
            fontSize: '0.95rem',
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

/** Lee un color CSS resuelto (canvas no entiende var(--…)) */
function cssColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim()
    return v || fallback
  } catch {
    return fallback
  }
}

/** roundRect con fallback compatible */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  const anyCtx = ctx as CanvasRenderingContext2D & {
    roundRect?: (
      x: number,
      y: number,
      w: number,
      h: number,
      radii?: number | number[]
    ) => void
  }
  ctx.beginPath()
  if (typeof anyCtx.roundRect === 'function') {
    anyCtx.roundRect(x, y, w, h, rr)
  } else {
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }
}

/* ─── Dibujo de pieza con pestañas ───────────────────────────────────────── */

function piecePath(
  w: number,
  h: number,
  edges: JigsawPiece['edges'],
  shape: PieceShape
): Path2D {
  const path = new Path2D()
  const tab = Math.min(w, h) * (shape === 'pointed' ? 0.22 : 0.18)
  const flat = shape === 'round' ? 0.12 : 0.08

  const edge = (
    side: 'top' | 'right' | 'bottom' | 'left',
    tabDir: number
  ) => {
    if (tabDir === 0) return
    const sign = tabDir
    const r = shape === 'round' ? tab * 0.9 : tab
    if (side === 'top') {
      const mid = w / 2
      if (shape === 'pointed') {
        path.lineTo(mid - r * 0.5, 0)
        path.lineTo(mid, -r * sign)
        path.lineTo(mid + r * 0.5, 0)
      } else {
        path.lineTo(mid - r, 0)
        path.bezierCurveTo(
          mid - r,
          -r * sign * 1.2,
          mid + r,
          -r * sign * 1.2,
          mid + r,
          0
        )
      }
    } else if (side === 'right') {
      const mid = h / 2
      if (shape === 'pointed') {
        path.lineTo(w, mid - r * 0.5)
        path.lineTo(w + r * sign, mid)
        path.lineTo(w, mid + r * 0.5)
      } else {
        path.lineTo(w, mid - r)
        path.bezierCurveTo(
          w + r * sign * 1.2,
          mid - r,
          w + r * sign * 1.2,
          mid + r,
          w,
          mid + r
        )
      }
    } else if (side === 'bottom') {
      const mid = w / 2
      if (shape === 'pointed') {
        path.lineTo(mid + r * 0.5, h)
        path.lineTo(mid, h + r * sign)
        path.lineTo(mid - r * 0.5, h)
      } else {
        path.lineTo(mid + r, h)
        path.bezierCurveTo(
          mid + r,
          h + r * sign * 1.2,
          mid - r,
          h + r * sign * 1.2,
          mid - r,
          h
        )
      }
    } else {
      const mid = h / 2
      if (shape === 'pointed') {
        path.lineTo(0, mid + r * 0.5)
        path.lineTo(-r * sign, mid)
        path.lineTo(0, mid - r * 0.5)
      } else {
        path.lineTo(0, mid + r)
        path.bezierCurveTo(
          -r * sign * 1.2,
          mid + r,
          -r * sign * 1.2,
          mid - r,
          0,
          mid - r
        )
      }
    }
  }

  const inset = Math.min(w, h) * flat
  path.moveTo(inset, 0)
  path.lineTo(w * 0.35, 0)
  edge('top', edges.top)
  path.lineTo(w - inset, 0)
  path.lineTo(w, inset)
  path.lineTo(w, h * 0.35)
  edge('right', edges.right)
  path.lineTo(w, h - inset)
  path.lineTo(w - inset, h)
  path.lineTo(w * 0.65, h)
  edge('bottom', edges.bottom)
  path.lineTo(inset, h)
  path.lineTo(0, h - inset)
  path.lineTo(0, h * 0.65)
  edge('left', edges.left)
  path.lineTo(0, inset)
  path.closePath()
  return path
}

/* ─── Componente principal ───────────────────────────────────────────────── */

export function RompecabezasGame() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const progress = getGameProgress(GAME_CAT, GAME_ID)

  const [hubTab, setHubTab] = useState<HubTab>('home')
  const [phase, setPhase] = useState<Phase>('hub')
  const [prefs, setPrefs] = useState<JigsawPrefs>(() => loadPrefs())

  // Normal
  const [level, setLevel] = useState(Math.max(1, progress.highestLevel || 1))
  const unlocked = Math.max(1, (progress.highestLevel || 0) + 1)

  // Creative
  const [customImages, setCustomImages] = useState<PuzzleImage[]>(() =>
    loadCustomImages()
  )
  const [creativeImage, setCreativeImage] = useState<PuzzleImage>(
    DEFAULT_IMAGES[0]
  )
  const [creativePieces, setCreativePieces] = useState(100)
  const [creativeShape, setCreativeShape] = useState<PieceShape>('classic')
  const [galleryCat, setGalleryCat] = useState<ImageCategory | 'all'>('all')

  // Play state
  const [cfg, setCfg] = useState<JigsawLevel | null>(null)
  const [pieces, setPieces] = useState<JigsawPiece[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showEdges, setShowEdges] = useState(true)
  const [hintsLeft, setHintsLeft] = useState(5)
  const [stars, setStars] = useState<0 | 1 | 2 | 3>(0)
  const [dragId, setDragId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState<JigsawPiece[][]>([])

  const boardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const pauseStartedAt = useRef<number | null>(null)
  const pausedAccum = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const zCounter = useRef(10)
  const boardGeom = useRef({ boardW: 0, boardH: 0, pad: 0, pw: 0, ph: 0 })

  const bestTime = cfg
    ? getLevelBestTime(GAME_CAT, GAME_ID, cfg.level)
    : null

  const updatePrefs = (patch: Partial<JigsawPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      savePrefs(next)
      return next
    })
  }

  /* ── Cargar imagen del nivel ── */
  const loadImage = useCallback(
    (src: string, fallbackHue = 180, label = '') => {
      return new Promise<HTMLImageElement>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => {
          const c = document.createElement('canvas')
          c.width = 800
          c.height = 600
          const ctx = c.getContext('2d')
          if (ctx) drawFallbackCover(ctx, 800, 600, fallbackHue, label)
          const fallback = new Image()
          fallback.onload = () => resolve(fallback)
          fallback.src = c.toDataURL('image/png')
        }
        img.src = src
      })
    },
    []
  )

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const computeElapsed = useCallback(() => {
    if (startRef.current == null) return elapsedMs
    let extraPause = 0
    if (pauseStartedAt.current != null) {
      extraPause = performance.now() - pauseStartedAt.current
    }
    return Math.max(
      0,
      Math.round(
        performance.now() - startRef.current - pausedAccum.current - extraPause
      )
    )
  }, [elapsedMs])

  const finishLevel = useCallback(
    (list: JigsawPiece[], levelCfg: JigsawLevel) => {
      soundSuccess()
      stopTimer()
      const timeMs = computeElapsed()
      setElapsedMs(timeMs)
      const s = calcStars(timeMs, levelCfg.targetSeconds, levelCfg.pieces)
      setStars(s)
      setPhase('success')
      setDragId(null)
      setMsg('')

      if (levelCfg.level > 0) {
        try {
          recordLevelResult({
            categoryId: GAME_CAT,
            gameId: GAME_ID,
            level: levelCfg.level,
            success: true,
            timeMs,
          })
        } catch {
          /* progress API opcional */
        }
      }
      return list
    },
    [computeElapsed, stopTimer]
  )

  /* ── Iniciar partida ── */
  const startLevel = useCallback(
    async (lv: JigsawLevel) => {
      soundStart()
      setCfg(lv)
      setPhase('playing')
      setHubTab('playing')
      setElapsedMs(0)
      setPaused(false)
      setShowPreview(prefs.showPreviewDefault)
      setShowEdges(prefs.showEdgesDefault)
      setHintsLeft(
        Math.max(2, Math.min(10, Math.floor(14 - Math.log2(lv.pieces + 1) * 1.6)))
      )
      setStars(0)
      setDragId(null)
      setMsg('')
      setHistory([])
      pausedAccum.current = 0
      pauseStartedAt.current = null
      startRef.current = performance.now()

      const img = await loadImage(
        lv.image.src,
        lv.image.fallbackHue,
        lv.image.name
      )
      imgRef.current = img

      const maxW = isMobile
        ? Math.min(window.innerWidth - 32, 420)
        : Math.min(560, window.innerWidth * 0.42)
      const aspect = img.width / Math.max(1, img.height)
      let boardW = maxW
      let boardH = boardW / aspect
      if (boardH > (isMobile ? 360 : 480)) {
        boardH = isMobile ? 360 : 480
        boardW = boardH * aspect
      }

      const list = createPieces(lv, boardW, boardH, 1)
      setPieces(list)

      const pw = boardW / lv.cols
      const ph = boardH / lv.rows
      const pad = Math.max(pw, ph) * 0.25
      boardGeom.current = { boardW, boardH, pad, pw, ph }

      stopTimer()
      timerRef.current = window.setInterval(() => {
        if (startRef.current == null) return
        if (pauseStartedAt.current != null) return
        setElapsedMs(
          Math.round(
            performance.now() - startRef.current - pausedAccum.current
          )
        )
      }, 200)
    },
    [isMobile, loadImage, prefs.showEdgesDefault, prefs.showPreviewDefault, stopTimer]
  )

  const startNormal = (lvNum: number) => {
    const lv = generateJigsawLevel(lvNum, {
      seedSalt: prefs.softProgression ? 11 : 0,
    })
    if (prefs.softProgression) {
      lv.targetSeconds = Math.round(lv.targetSeconds * 1.2)
    }
    void startLevel(lv)
  }

  const startCreative = () => {
    const lv = generateJigsawLevel(1, {
      image: creativeImage,
      pieces: creativePieces,
      shape: creativeShape,
      seedSalt: Date.now() % 99991,
    })
    lv.level = 0
    void startLevel(lv)
  }

  /* ── Redibujar canvas ── */
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !cfg) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { boardW, boardH, pad, pw, ph } = boardGeom.current
    if (boardW <= 0 || boardH <= 0) return

    const trayH = Math.max(ph * 2.2, 160)
    const totalW = Math.max(boardW + pad * 2, 320)
    const totalH = boardH + trayH + pad * 2

    if (
      canvas.width !== Math.ceil(totalW) ||
      canvas.height !== Math.ceil(totalH)
    ) {
      canvas.width = Math.ceil(totalW)
      canvas.height = Math.ceil(totalH)
    }

    const primary = cssColor('--gco-primary', '#22E6C5')
    const border = cssColor('--gco-glass-border', 'rgba(255,255,255,0.2)')

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pad, pad)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.strokeStyle = border
    ctx.lineWidth = 2
    fillRoundRect(ctx, 0, 0, boardW, boardH, 12)
    ctx.fill()
    ctx.stroke()

    if (showPreview && img) {
      ctx.globalAlpha = 0.22
      ctx.drawImage(img, 0, 0, boardW, boardH)
      ctx.globalAlpha = 1
    }

    if (showEdges) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let c = 1; c < cfg.cols; c++) {
        ctx.beginPath()
        ctx.moveTo(c * pw, 0)
        ctx.lineTo(c * pw, boardH)
        ctx.stroke()
      }
      for (let r = 1; r < cfg.rows; r++) {
        ctx.beginPath()
        ctx.moveTo(0, r * ph)
        ctx.lineTo(boardW, r * ph)
        ctx.stroke()
      }
    }

    const ordered = [...pieces].sort((a, b) => a.z - b.z)
    for (const p of ordered) {
      const path = piecePath(pw, ph, p.edges, cfg.shape)
      ctx.save()
      ctx.translate(p.x, p.y)

      if (!p.locked) {
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = dragId === p.id ? 16 : 8
        ctx.shadowOffsetY = 3
      }

      ctx.clip(path)

      if (img) {
        ctx.drawImage(
          img,
          p.col * (img.width / cfg.cols),
          p.row * (img.height / cfg.rows),
          img.width / cfg.cols,
          img.height / cfg.rows,
          0,
          0,
          pw,
          ph
        )
      } else {
        ctx.fillStyle = `hsl(${(p.row * 40 + p.col * 25) % 360} 50% 40%)`
        ctx.fillRect(0, 0, pw, ph)
      }

      ctx.restore()

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.strokeStyle = p.locked
        ? 'rgba(34,230,197,0.45)'
        : dragId === p.id
          ? primary
          : 'rgba(255,255,255,0.28)'
      ctx.lineWidth = p.locked ? 1.5 : 2
      ctx.stroke(path)
      ctx.restore()
    }

    ctx.restore()
  }, [cfg, pieces, showPreview, showEdges, dragId])

  useEffect(() => {
    paint()
  }, [paint])

  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  /* ── Pointer drag ── */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cfg || paused || phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const { pad, pw, ph } = boardGeom.current
    const mx = (e.clientX - rect.left) * scaleX - pad
    const my = (e.clientY - rect.top) * scaleY - pad

    const ordered = [...pieces].sort((a, b) => b.z - a.z)
    for (const p of ordered) {
      if (p.locked) continue
      if (mx >= p.x && mx <= p.x + pw && my >= p.y && my <= p.y + ph) {
        soundCard()
        zCounter.current += 1
        setDragId(p.id)
        dragOffset.current = { x: mx - p.x, y: my - p.y }
        setHistory((h) => [...h.slice(-24), pieces.map((x) => ({ ...x }))])
        setPieces((list) =>
          list.map((x) =>
            x.id === p.id ? { ...x, z: zCounter.current } : x
          )
        )
        canvas.setPointerCapture(e.pointerId)
        break
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragId || !cfg) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const { pad } = boardGeom.current
    const mx = (e.clientX - rect.left) * scaleX - pad
    const my = (e.clientY - rect.top) * scaleY - pad
    setPieces((list) =>
      list.map((p) =>
        p.id === dragId
          ? {
              ...p,
              x: mx - dragOffset.current.x,
              y: my - dragOffset.current.y,
            }
          : p
      )
    )
  }

  const onPointerUp = () => {
    if (!dragId || !cfg) return
    const { pw, ph } = boardGeom.current
    const assist = prefs.snapAssist

    setPieces((list) => {
      let next = list.map((p) => {
        if (p.id !== dragId) return p
        if (!assist) return p
        return trySnap(p, pw, ph)
      })
      const just = next.find((p) => p.id === dragId)
      if (just?.locked) {
        soundMatch()
      }

      if (isPuzzleComplete(next)) {
        next = finishLevel(next, cfg)
      }
      return next
    })
    setDragId(null)
  }

  /* ── Pista: coloca una pieza ── */
  const useHint = () => {
    if (hintsLeft <= 0 || !cfg || phase !== 'playing' || paused) return
    soundClick()
    setHintsLeft((h) => h - 1)
    setHistory((h) => [...h.slice(-24), pieces.map((x) => ({ ...x }))])
    setPieces((list) => {
      const free = list.filter((p) => !p.locked)
      if (free.length === 0) return list
      const target = free[Math.floor(Math.random() * free.length)]
      soundMatch()
      let next = list.map((p) =>
        p.id === target.id
          ? { ...p, x: p.correctX, y: p.correctY, locked: true, z: 0 }
          : p
      )
      if (isPuzzleComplete(next)) {
        next = finishLevel(next, cfg)
      }
      return next
    })
  }

  const undoMove = () => {
    if (history.length === 0 || phase !== 'playing' || paused) {
      soundFail()
      return
    }
    soundClick()
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setPieces(prev.map((p) => ({ ...p })))
    setMsg('Movimiento deshecho')
    window.setTimeout(() => setMsg(''), 1200)
  }

    const togglePause = () => {
    soundToggle(!paused)
    if (!paused) {
    pauseStartedAt.current = performance.now()
    setPaused(true)
    setMsg('Pausa')
  } else {
    if (pauseStartedAt.current != null) {
      pausedAccum.current += performance.now() - pauseStartedAt.current
      pauseStartedAt.current = null
    }
    setPaused(false)
    setMsg('')
  }
}

  /* ── Importar imagen ── */
  const onImportFile = async (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      soundFail()
      setMsg('Archivo no válido')
      return
    }
    try {
      const dataUrl = await compressImageFile(file, 1400, 0.85)
      const img: PuzzleImage = {
        id: `custom-${Date.now().toString(36)}`,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Mi imagen',
        category: 'custom',
        src: dataUrl,
        isCustom: true,
        fallbackHue: 200,
      }
      const list = addCustomImage(img)
      setCustomImages(list)
      setCreativeImage(img)
      soundSuccess()
      setHubTab('mine')
      setMsg('Imagen importada')
      window.setTimeout(() => setMsg(''), 1500)
    } catch {
      soundFail()
      setMsg('No se pudo importar')
    }
  }

  const allImages = useMemo(
    () => [...DEFAULT_IMAGES, ...customImages],
    [customImages]
  )

  const filteredGallery = useMemo(() => {
    if (galleryCat === 'all') return DEFAULT_IMAGES
    if (galleryCat === 'custom') return customImages
    return DEFAULT_IMAGES.filter((i) => i.category === galleryCat)
  }, [galleryCat, customImages])

  const lockedCount = countLocked(pieces)
  const progressPct =
    cfg && cfg.pieces > 0 ? Math.round((lockedCount / cfg.pieces) * 100) : 0

  // Geometría del board cuando cfg/imagen listos
  useEffect(() => {
    if (!cfg || !imgRef.current) return
    const img = imgRef.current
    const maxW = isMobile
      ? Math.min(window.innerWidth - 32, 420)
      : Math.min(560, window.innerWidth * 0.42)
    const aspect = img.width / Math.max(1, img.height)
    let boardW = maxW
    let boardH = boardW / aspect
    if (boardH > (isMobile ? 360 : 480)) {
      boardH = isMobile ? 360 : 480
      boardW = boardH * aspect
    }
    const pw = boardW / cfg.cols
    const ph = boardH / cfg.rows
    const pad = Math.max(pw, ph) * 0.25
    boardGeom.current = { boardW, boardH, pad, pw, ph }
    if (canvasRef.current) {
      canvasRef.current.dataset.boardW = String(boardW)
      canvasRef.current.dataset.boardH = String(boardH)
    }
    paint()
  }, [cfg, isMobile, paint, pieces.length])

  // Atajos de teclado
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        togglePause()
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        useHint()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undoMove()
      } else if (e.key === 'v' || e.key === 'V') {
        setShowPreview((v) => !v)
      } else if (e.key === 'b' || e.key === 'B') {
        setShowEdges((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, hintsLeft, history.length, pieces, cfg])

  const levelCards = useMemo(() => {
    const start = Math.max(1, level - 2)
    return Array.from({ length: 5 }, (_, i) => {
      const n = start + i
      return {
        n,
        pieces: piecesForLevel(n),
        locked: n > unlocked,
        current: n === level,
      }
    })
  }, [level, unlocked])

  const goHub = (tab: HubTab = 'home') => {
    soundClick()
    stopTimer()
    setPhase('hub')
    setHubTab(tab)
    setCfg(null)
    setPieces([])
    setHistory([])
    setMsg('')
    setPaused(false)
    pauseStartedAt.current = null
  }

  /* ── Sidebar desktop ── */
  const sidebar = (
    <aside
      className="gco-scroll-y"
      style={{
        display: isMobile ? 'none' : 'flex',
        flexDirection: 'column',
        gap: 4,
        width: 220,
        flexShrink: 0,
        padding: '1.25rem 0.85rem',
        borderRight: '1px solid var(--gco-glass-border)',
        background: 'var(--gco-glass-bg)',
        backdropFilter: 'blur(var(--gco-glass-blur))',
        position: 'sticky',
        top: 0,
        height: '100dvh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0.35rem 0.5rem 1.1rem',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '1.05rem',
        }}
      >
        <span aria-hidden>🧩</span> PUZZLE
        <span
          style={{
            fontSize: '0.7rem',
            color: 'var(--gco-ink-muted)',
            fontWeight: 500,
          }}
        >
          Rompecabezas
        </span>
      </div>

      {(
        [
          { id: 'home' as const, label: 'Inicio', icon: '🏠' },
          { id: 'normal' as const, label: 'Modo Normal', icon: '🧩' },
          { id: 'creative' as const, label: 'Modo Creativo', icon: '✨' },
          { id: 'gallery' as const, label: 'Galería', icon: '🖼️' },
          { id: 'mine' as const, label: 'Mis Imágenes', icon: '📁' },
        ] as const
      ).map((item) => {
        const on =
          hubTab === item.id || (phase === 'playing' && item.id === 'normal')
        return (
          <button
            key={item.id}
            type="button"
            className="sidebar-nav-item"
            onClick={() => {
              if (phase === 'playing') {
                if (!confirm('¿Salir de la partida actual?')) return
              }
              goHub(item.id)
            }}
            style={{
              background: on ? 'var(--gco-primary-dim)' : 'transparent',
              color: on ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
              fontWeight: on ? 700 : 500,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
            {item.label}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      {/* Preferencias rápidas */}
      <div
        style={{
          padding: '0.6rem 0.5rem',
          borderTop: '1px solid var(--gco-glass-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            color: 'var(--gco-ink-muted)',
            fontWeight: 600,
          }}
        >
          Preferencias
        </p>
        {(
          [
            {
              key: 'snapAssist' as const,
              label: 'Auto-encaje',
            },
            {
              key: 'softProgression' as const,
              label: 'Modo suave',
            },
            {
              key: 'showEdgesDefault' as const,
              label: 'Bordes por defecto',
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
            <input
              type="checkbox"
              checked={prefs[opt.key]}
              onChange={(e) => {
                soundClick()
                updatePrefs({ [opt.key]: e.target.checked })
              }}
              style={{ accentColor: 'var(--gco-primary)' }}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        className="sidebar-nav-item"
        onClick={() => {
          soundClick()
          navigate('/categoria/logica')
        }}
      >
        ← Lógica
      </button>
      <p
        style={{
          padding: '0.5rem 0.6rem',
          fontSize: '0.75rem',
          color: 'var(--gco-ink-muted)',
        }}
      >
        Nivel {progress.highestLevel || 0} · {progress.totalCompleted || 0} wins
      </p>
    </aside>
  )

  const mobileHeader = isMobile && phase === 'hub' && (
    <header style={{ marginBottom: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button
          className="glass-button secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
          onClick={() => {
            soundClick()
            navigate('/categoria/logica')
          }}
        >
          ← Volver
        </button>
        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>🧩 Puzzle</span>
        <span style={{ width: 64 }} />
      </div>
    </header>
  )

  const homePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: '1.35rem', marginBottom: 4 }}>Bienvenido</h2>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem' }}>
          Elige un modo para armar rompecabezas con imágenes.
        </p>
      </div>

      {(
        [
          {
            id: 'normal' as const,
            title: 'Modo Normal',
            desc: 'Sube de nivel resolviendo rompecabezas cada vez más difíciles.',
            color: 'var(--gco-primary)',
            emoji: '🧩',
          },
          {
            id: 'creative' as const,
            title: 'Modo Creativo',
            desc: 'Elige imagen, cantidad de piezas y forma de las piezas.',
            color: 'var(--gco-accent, #8B7CF6)',
            emoji: '✨',
          },
          {
            id: 'gallery' as const,
            title: 'Galería',
            desc: 'Imágenes por defecto: naturaleza, animales, libros…',
            color: 'var(--gco-secondary)',
            emoji: '🖼️',
          },
          {
            id: 'mine' as const,
            title: 'Mis Imágenes',
            desc: `${customImages.length} importadas · JPG, PNG, WEBP`,
            color: '#c9b6ff',
            emoji: '📁',
          },
        ] as const
      ).map((card) => (
        <button
          key={card.id}
          type="button"
          className="glass-card"
          onClick={() => {
            soundClick()
            setHubTab(card.id)
          }}
          style={{
            textAlign: 'left',
            padding: '1.1rem 1.2rem',
            border: '1px solid var(--gco-glass-border)',
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            background: 'var(--gco-glass-bg)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: '1.6rem' }}>{card.emoji}</span>
            <div>
              <p style={{ fontWeight: 700, color: card.color, margin: 0 }}>
                {card.title}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--gco-ink-muted)',
                  lineHeight: 1.35,
                }}
              >
                {card.desc}
              </p>
            </div>
          </div>
        </button>
      ))}

      <div
        className="glass-card"
        style={{
          padding: '0.9rem 1rem',
          fontSize: '0.8rem',
          color: 'var(--gco-ink-muted)',
        }}
      >
        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--gco-ink)' }}>
          Atajos (PC)
        </p>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          <span className="mono">P</span> pausa ·{' '}
          <span className="mono">H</span> pista ·{' '}
          <span className="mono">Ctrl+Z</span> deshacer ·{' '}
          <span className="mono">V</span> vista previa ·{' '}
          <span className="mono">B</span> bordes
        </p>
      </div>
    </div>
  )

  const normalPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>Modo Normal</h2>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem' }}>
          Sube de nivel · las piezas aumentan por tramos (4 → 8 → 12 → … → 2200)
        </p>
      </div>

      <div className="hscroll" style={{ gap: 10, paddingBottom: 8 }}>
        {levelCards.map((c) => (
          <button
            key={c.n}
            type="button"
            disabled={c.locked}
            onClick={() => {
              if (c.locked) return
              soundClick()
              setLevel(c.n)
            }}
            className="glass-card"
            style={{
              minWidth: isMobile ? 110 : 128,
              flex: '0 0 auto',
              padding: '1rem 0.85rem',
              textAlign: 'center',
              border: c.current
                ? '1.5px solid var(--gco-primary)'
                : '1px solid var(--gco-glass-border)',
              opacity: c.locked ? 0.45 : 1,
              cursor: c.locked ? 'not-allowed' : 'pointer',
              color: 'inherit',
              font: 'inherit',
              background: c.current
                ? 'var(--gco-primary-dim)'
                : 'var(--gco-glass-bg)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'var(--gco-ink-muted)',
              }}
            >
              Nivel
            </p>
            <p
              style={{
                margin: '4px 0',
                fontSize: '1.75rem',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                color: c.current ? 'var(--gco-primary)' : 'inherit',
              }}
            >
              {c.n}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem' }}>
              {c.locked ? '🔒' : `${c.pieces} piezas`}
            </p>
          </button>
        ))}
      </div>

      <div style={{ padding: '0 4px' }}>
        <input
          type="range"
          min={1}
          max={Math.max(unlocked, 30)}
          value={Math.min(level, unlocked)}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (v <= unlocked) setLevel(v)
          }}
          style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--gco-ink-muted)',
          }}
        >
          <span>1</span>
          <span>
            Nivel {level} · {piecesForLevel(level)} piezas
          </span>
          <span>{Math.max(unlocked, 30)}</span>
        </div>
      </div>

      {bestTime != null && bestTime > 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
          Mejor tiempo nv.{level}:{' '}
          <span className="mono">{formatDuration(bestTime)}</span>
        </p>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.85rem',
          color: 'var(--gco-ink-muted)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={prefs.softProgression}
          onChange={(e) => {
            soundClick()
            updatePrefs({ softProgression: e.target.checked })
          }}
          style={{ accentColor: 'var(--gco-primary)' }}
        />
        Progresión suave (más tiempo objetivo)
      </label>

      <GlassButton onClick={() => startNormal(level)}>
        Continuar Nivel {level} ▶
      </GlassButton>
    </div>
  )

  const creativePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>Modo Creativo</h2>
        <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem' }}>
          Elige imagen, cantidad de piezas y forma.
        </p>
      </div>

      <div
        className="glass-card"
        style={{
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 320,
            aspectRatio: '4/3',
            borderRadius: 14,
            overflow: 'hidden',
            background: 'var(--gco-primary-dim)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <img
            src={creativeImage.src}
            alt={creativeImage.name}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <select
          className="glass-input"
          value={creativeImage.id}
          onChange={(e) => {
            soundClick()
            const found =
              allImages.find((i) => i.id === e.target.value) ?? DEFAULT_IMAGES[0]
            setCreativeImage(found)
          }}
          style={{ maxWidth: 320 }}
        >
          <optgroup label="Por defecto">
            {DEFAULT_IMAGES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
          {customImages.length > 0 && (
            <optgroup label="Mis imágenes">
              {customImages.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>
          Piezas:{' '}
          <span className="mono" style={{ color: 'var(--gco-primary)' }}>
            {creativePieces}
          </span>
        </p>
        <input
          type="range"
          min={4}
          max={2200}
          step={1}
          value={creativePieces}
          onChange={(e) => setCreativePieces(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--gco-primary)' }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 8,
          }}
        >
          {PIECE_SUGGESTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`glass-button ${creativePieces === n ? '' : 'secondary'}`}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
              onClick={() => {
                soundClick()
                setCreativePieces(n)
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--gco-ink-muted)',
            marginTop: 6,
          }}
        >
          Más piezas, mayor desafío. En móviles evita +500 si tu dispositivo es
          modesto.
        </p>
      </div>

      <div>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>Forma de las piezas</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PIECE_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`glass-button ${creativeShape === s.id ? '' : 'secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.55rem 0.9rem' }}
              onClick={() => {
                soundClick()
                setCreativeShape(s.id)
              }}
              title={s.desc}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

      <GlassButton onClick={startCreative}>🧩 Crear Rompecabezas</GlassButton>
    </div>
  )

  const galleryPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: '1.25rem' }}>Galería</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`glass-button ${galleryCat === 'all' ? '' : 'secondary'}`}
          style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem' }}
          onClick={() => {
            soundClick()
            setGalleryCat('all')
          }}
        >
          Todas
        </button>
        {(Object.keys(CATEGORY_LABELS) as ImageCategory[])
          .filter((c) => c !== 'custom')
          .map((c) => (
            <button
              key={c}
              type="button"
              className={`glass-button ${galleryCat === c ? '' : 'secondary'}`}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem' }}
              onClick={() => {
                soundClick()
                setGalleryCat(c)
              }}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
      </div>
      <div className="book-grid">
        {filteredGallery.map((img) => (
          <button
            key={img.id}
            type="button"
            className="book-grid-card"
            onClick={() => {
              soundClick()
              setCreativeImage(img)
              setHubTab('creative')
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
          >
            <div className="book-cover book-cover-grid">
              <img
                src={img.src}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
            <span className="book-title">{img.name}</span>
            <span className="book-author">
              {CATEGORY_LABELS[img.category]}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  const minePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: '1.25rem' }}>Mis Imágenes</h2>
      <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.88rem' }}>
        {customImages.length} importadas · se guardan en este dispositivo
      </p>

      <button
        type="button"
        className="glass-card"
        onClick={() => {
          soundClick()
          fileRef.current?.click()
        }}
        style={{
          padding: '1.4rem',
          textAlign: 'center',
          border: '1.5px dashed var(--gco-glass-border)',
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
          background: 'var(--gco-glass-bg)',
        }}
      >
        <p style={{ fontSize: '1.5rem', margin: '0 0 6px' }}>⬆️</p>
        <p style={{ fontWeight: 700, margin: 0 }}>Importar imagen</p>
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--gco-ink-muted)',
            margin: '4px 0 0',
          }}
        >
          JPG, PNG, WEBP
        </p>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        hidden
        onChange={(e) => {
          void onImportFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="book-grid">
        {customImages.map((img) => (
          <div key={img.id} className="book-grid-card">
            <button
              type="button"
              onClick={() => {
                soundClick()
                setCreativeImage(img)
                setHubTab('creative')
              }}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div className="book-cover book-cover-grid">
                <img
                  src={img.src}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <span className="book-title">{img.name}</span>
            </button>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
              onClick={() => {
                soundClick()
                if (confirm(`¿Borrar "${img.name}"?`)) {
                  setCustomImages(removeCustomImage(img.id))
                  if (creativeImage.id === img.id) {
                    setCreativeImage(DEFAULT_IMAGES[0])
                  }
                }
              }}
            >
              Borrar
            </button>
          </div>
        ))}
      </div>
      {customImages.length === 0 && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--gco-ink-muted)',
            padding: '1rem 0',
          }}
        >
          Aún no has importado imágenes.
        </p>
      )}
    </div>
  )

  const playingPanel = cfg && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
          onClick={() => {
            if (confirm('¿Abandonar partida?')) goHub('normal')
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
            {cfg.level > 0 ? `Nivel ${cfg.level}` : 'Creativo'} · {cfg.pieces}{' '}
            piezas
          </p>
          <p
            style={{
              margin: 0,
              fontSize: '0.78rem',
              color: 'var(--gco-ink-muted)',
            }}
          >
            {cfg.image.name} · {cfg.cols}×{cfg.rows} · {cfg.shape}
          </p>
        </div>
        <span className="mono" style={{ fontWeight: 600 }}>
          {formatTime(elapsedMs)}
        </span>
        <button
          type="button"
          className="theme-cycle-btn"
          onClick={togglePause}
          aria-label={paused ? 'Reanudar' : 'Pausa'}
        >
          {paused ? '▶' : '⏸'}
        </button>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: 'var(--gco-glass-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            background: 'var(--gco-primary)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <p
        style={{
          fontSize: '0.78rem',
          color: 'var(--gco-ink-muted)',
          margin: 0,
        }}
      >
        {lockedCount}/{cfg.pieces} · {progressPct}%
        {cfg.targetSeconds > 0 && (
          <>
            {' '}
            · meta{' '}
            <span className="mono">{formatTime(cfg.targetSeconds * 1000)}</span>
          </>
        )}
        {msg && (
          <>
            {' '}
            · <span style={{ color: 'var(--gco-primary)' }}>{msg}</span>
          </>
        )}
      </p>

      <div
        ref={boardRef}
        style={{
          width: '100%',
          overflow: 'auto',
          borderRadius: 16,
          border: '1px solid var(--gco-glass-border)',
          background: 'rgba(0,0,0,0.2)',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        {paused && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)',
              color: 'var(--gco-ink)',
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            Pausado
          </div>
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 640,
            margin: '0 auto',
            cursor: dragId ? 'grabbing' : 'grab',
            opacity: paused ? 0.55 : 1,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          className={`glass-button ${showPreview ? '' : 'secondary'}`}
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
          onClick={() => {
            soundClick()
            setShowPreview((v) => !v)
          }}
        >
          👁 Vista previa
        </button>
        <button
          type="button"
          className={`glass-button ${showEdges ? '' : 'secondary'}`}
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
          onClick={() => {
            soundClick()
            setShowEdges((v) => !v)
          }}
        >
          ▦ Bordes
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
          disabled={hintsLeft <= 0 || paused}
          onClick={useHint}
        >
          💡 Pista {hintsLeft}
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
          disabled={history.length === 0 || paused}
          onClick={undoMove}
        >
          ↩ Deshacer
        </button>
      </div>

      <AnimatePresence>
        {phase === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              border: '1px solid var(--gco-glass-border)',
            }}
          >
            <p
              style={{
                color: 'var(--gco-primary)',
                fontWeight: 700,
                fontSize: '1.15rem',
                marginBottom: 6,
              }}
            >
              ¡Completado!
            </p>
            <StarRow n={stars} />
            <p
              style={{
                margin: '8px 0',
                fontSize: '0.9rem',
                color: 'var(--gco-ink-muted)',
              }}
            >
              Tiempo <span className="mono">{formatTime(elapsedMs)}</span>
              {cfg.targetSeconds > 0 && (
                <>
                  {' '}
                  · meta{' '}
                  <span className="mono">
                    {formatTime(cfg.targetSeconds * 1000)}
                  </span>
                </>
              )}
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              {cfg.level > 0 ? (
                <GlassButton onClick={() => startNormal(cfg.level + 1)}>
                  Siguiente nivel
                </GlassButton>
              ) : (
                <GlassButton onClick={() => goHub('creative')}>
                  Nuevo creativo
                </GlassButton>
              )}
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  if (cfg.level > 0) startNormal(cfg.level)
                  else startCreative()
                }}
              >
                Reintentar
              </button>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => goHub('normal')}
              >
                Menú
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  const mainContent =
    phase === 'playing' || phase === 'success'
      ? playingPanel
      : hubTab === 'home'
        ? homePanel
        : hubTab === 'normal'
          ? normalPanel
          : hubTab === 'creative'
            ? creativePanel
            : hubTab === 'gallery'
              ? galleryPanel
              : minePanel

  const mobileNav = isMobile && phase === 'hub' && (
    <nav
      className="bottom-nav"
      style={{ zIndex: 40 }}
      aria-label="Navegación puzzle"
    >
      {(
        [
          { id: 'home' as const, label: 'Inicio', icon: '🏠' },
          { id: 'normal' as const, label: 'Normal', icon: '🧩' },
          { id: 'creative' as const, label: 'Creativo', icon: '✨' },
          { id: 'gallery' as const, label: 'Galería', icon: '🖼️' },
          { id: 'mine' as const, label: 'Mías', icon: '📁' },
        ] as const
      ).map((t) => {
        const on = hubTab === t.id
        return (
          <button
            key={t.id}
            type="button"
            className={`bottom-nav-item${on ? ' active' : ''}`}
            onClick={() => {
              soundClick()
              setHubTab(t.id)
            }}
          >
            <span style={{ fontSize: '1.15rem' }}>{t.icon}</span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div
      className="app-layout"
      style={{
        minHeight: '100dvh',
        color: 'var(--gco-ink)',
      }}
    >
      {sidebar}
      <div
        className="app-main app-shell"
        style={{
          flex: 1,
          minWidth: 0,
          paddingBottom: isMobile && phase === 'hub' ? '5.5rem' : undefined,
        }}
      >
        {mobileHeader}
        {mainContent}
      </div>
      {mobileNav}
    </div>
  )
}

export default RompecabezasGame
