import { useEffect, useRef } from 'react'
import type { Color, GameState } from './chessEngine'
import { BOARD_SKINS, type BoardSkin } from './chessTypes'
import { PIECE_PROFILES } from './chessPieceProfiles'
import type { Selection } from './useChessGame'

export type CameraPreset = 'default' | 'top' | 'front'

interface Props {
  state: GameState
  selection: Selection | null
  lastMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null
  orientation: Color
  skin: BoardSkin
  showLegalHints: boolean
  cameraPreset: CameraPreset
  onSquareClick: (r: number, c: number) => void
}

const SQ = 1.15
const BOARD_HALF = SQ * 4

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function squarePos(r: number, c: number): [number, number, number] {
  return [-BOARD_HALF + SQ * 0.5 + c * SQ, 0, BOARD_HALF - SQ * 0.5 - r * SQ]
}

/** Componente imperativo: monta y gestiona su propia escena Three.js dentro de un <canvas>. */
export function ChessBoard3D({
  state,
  selection,
  lastMove,
  orientation,
  skin,
  showLegalHints,
  cameraPreset,
  onSquareClick,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<{
    setSkin: (skin: BoardSkin) => void
    setBoard: (state: GameState) => void
    setHighlights: (selection: Selection | null, lastMove: Props['lastMove'], checkSq: { r: number; c: number } | null) => void
    setCamera: (preset: CameraPreset, orientation: Color) => void
    dispose: () => void
  } | null>(null)
  const clickHandlerRef = useRef(onSquareClick)
  clickHandlerRef.current = onSquareClick

  useEffect(() => {
    let cancelled = false
    let raf = 0

    async function boot() {
      const THREE = await import('three')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
      const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js')
      const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js')
      const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js')
      const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js')
      if (cancelled || !mountRef.current) return

      const container = mountRef.current
      const isSmallDevice = container.clientWidth < 640
      const dpr = Math.min(window.devicePixelRatio || 1, isSmallDevice ? 1.5 : 2)

      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      canvas.style.touchAction = 'none'
      container.appendChild(canvas)

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(dpr)
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.shadowMap.enabled = !isSmallDevice
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      renderer.outputColorSpace = THREE.SRGBColorSpace

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x03040a)
      scene.fog = new THREE.FogExp2(0x03040a, 0.026)

      const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 200)
      camera.position.set(0, 12.2, 13.2)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.minDistance = 6
      controls.maxDistance = 26
      controls.maxPolarAngle = Math.PI * 0.49
      controls.minPolarAngle = Math.PI * 0.08
      controls.target.set(0, 0.6, 0)
      controls.update()

      const composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        isSmallDevice ? 0.38 : 0.55,
        0.42,
        0.82
      )
      composer.addPass(bloomPass)
      composer.addPass(new OutputPass())

      scene.add(new THREE.AmbientLight(0x1c2b3a, 0.55))
      const keyLight = new THREE.DirectionalLight(0xffe3c2, 1.3)
      keyLight.position.set(7, 13, 6)
      if (!isSmallDevice) {
        keyLight.castShadow = true
        keyLight.shadow.mapSize.set(1536, 1536)
        keyLight.shadow.camera.left = -11
        keyLight.shadow.camera.right = 11
        keyLight.shadow.camera.top = 11
        keyLight.shadow.camera.bottom = -11
        keyLight.shadow.camera.near = 1
        keyLight.shadow.camera.far = 42
        keyLight.shadow.bias = -0.0015
      }
      scene.add(keyLight)
      scene.add(new THREE.DirectionalLight(0x7fe9ff, 0.5))
      const rimLight = new THREE.PointLight(0x37e6ff, 6.5, 15, 2)
      rimLight.position.set(0, -0.55, 0)
      scene.add(rimLight)

      /* ---------------- Texturas mármol procedurales ---------------- */
      function fade(t: number) {
        return t * t * t * (t * (t * 6 - 15) + 10)
      }
      function lerp(a: number, b: number, t: number) {
        return a + (b - a) * t
      }
      const perm = new Uint8Array(512)
      {
        const p = new Uint8Array(256)
        for (let i = 0; i < 256; i++) p[i] = i
        for (let i = 255; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0
          ;[p[i], p[j]] = [p[j], p[i]]
        }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
      }
      function grad(hash: number, x: number, y: number) {
        const h = hash & 3
        const u = h < 2 ? x : y
        const v = h < 2 ? y : x
        return (h & 1 ? -u : u) + (h & 2 ? -2 * v : 2 * v)
      }
      function perlin2(x: number, y: number) {
        const X = Math.floor(x) & 255
        const Y = Math.floor(y) & 255
        x -= Math.floor(x)
        y -= Math.floor(y)
        const u = fade(x)
        const v = fade(y)
        const a = perm[X] + Y
        const b = perm[X + 1] + Y
        return lerp(
          lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
          lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
          v
        )
      }
      function hexToRgb(hex: string): [number, number, number] {
        const h = hex.replace('#', '')
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
      }
      function makeMarble(base: string, vein: string, size: number, scale: number) {
        const cnv = document.createElement('canvas')
        cnv.width = cnv.height = size
        const ctx = cnv.getContext('2d')!
        const img = ctx.createImageData(size, size)
        const data = img.data
        const baseRgb = hexToRgb(base)
        const veinRgb = hexToRgb(vein)
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const nx = (x / size) * scale
            const ny = (y / size) * scale
            let n = perlin2(nx, ny) * 0.5 + perlin2(nx * 2.1, ny * 2.1) * 0.25 + perlin2(nx * 4.3, ny * 4.3) * 0.125
            n = (n + 1) * 0.5
            const v = Math.abs(perlin2(nx * 1.7 + n * 2, ny * 1.7))
            const veinFactor = Math.pow(1 - Math.min(1, v * 3.2), 2.5)
            const r = lerp(baseRgb[0], veinRgb[0], veinFactor * 0.55 + n * 0.15)
            const g = lerp(baseRgb[1], veinRgb[1], veinFactor * 0.55 + n * 0.15)
            const bch = lerp(baseRgb[2], veinRgb[2], veinFactor * 0.55 + n * 0.15)
            const i = (y * size + x) * 4
            data[i] = r | 0
            data[i + 1] = g | 0
            data[i + 2] = bch | 0
            data[i + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        const tex = new THREE.CanvasTexture(cnv)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.anisotropy = 4
        return tex
      }
      function adjustVein(hex: string) {
        const rgb = hexToRgb(hex)
        return (
          '#' +
          rgb
            .map((v) => Math.max(0, Math.min(255, (v * 0.55) | 0)).toString(16).padStart(2, '0'))
            .join('')
        )
      }

      const texSize = isSmallDevice ? 256 : 512
      let skinDef = BOARD_SKINS.find((s) => s.id === skin) ?? BOARD_SKINS[0]
      let texLight = makeMarble(skinDef.light, adjustVein(skinDef.light), texSize, 3.8)
      let texDark = makeMarble(skinDef.dark, adjustVein(skinDef.dark), texSize, 4.2)
      const texWhitePiece = makeMarble('#cdeef0', '#6fd0e0', isSmallDevice ? 128 : 256, 3.2)
      const texBlackPiece = makeMarble('#310912', '#9c1c33', isSmallDevice ? 128 : 256, 3.5)

      /* ---------------- Tablero ---------------- */
      const boardGroup = new THREE.Group()
      scene.add(boardGroup)
      const squareGeo = new THREE.BoxGeometry(SQ, 0.14, SQ)
      const squareMeshes: InstanceType<typeof THREE.Mesh>[] = []
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const light = (r + c) % 2 === 0
          const mat = new THREE.MeshPhysicalMaterial({
            map: light ? texLight : texDark,
            roughness: light ? 0.28 : 0.24,
            metalness: 0.06,
            clearcoat: 0.75,
            clearcoatRoughness: 0.18,
          })
          const mesh = new THREE.Mesh(squareGeo, mat)
          const [x, y, z] = squarePos(r, c)
          mesh.position.set(x, y, z)
          mesh.receiveShadow = !isSmallDevice
          mesh.userData = { r, c }
          boardGroup.add(mesh)
          squareMeshes.push(mesh)
        }
      }

      const frameOuter = BOARD_HALF + 0.62
      const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x081420, roughness: 0.32, metalness: 0.38, clearcoat: 0.6 })
      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(frameOuter * 2, 0.34, frameOuter * 2), frameMat)
      frameMesh.position.y = -0.14
      boardGroup.add(frameMesh)

      const baseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(frameOuter * 2 * 0.98, 0.55, frameOuter * 2 * 0.98),
        new THREE.MeshPhysicalMaterial({ color: 0x061018, roughness: 0.38, metalness: 0.42 })
      )
      baseMesh.position.y = -0.6
      boardGroup.add(baseMesh)

      const ledMat = new THREE.MeshStandardMaterial({
        color: hexToInt(skinDef.accent),
        emissive: hexToInt(skinDef.accent),
        emissiveIntensity: 2.8,
        roughness: 0.25,
        metalness: 0.08,
      })
      const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(frameOuter * 2 * 0.985, 0.13, frameOuter * 2 * 0.985), ledMat)
      ledMesh.position.y = -0.86
      boardGroup.add(ledMesh)

      /* ---------------- Piezas (perfiles altos, torneadas) ---------------- */
      function buildLathe(points: [number, number][]) {
        const vec = points.map((p) => new THREE.Vector2(p[0], p[1]))
        const geo = new THREE.LatheGeometry(vec, isSmallDevice ? 32 : 56)
        geo.computeVertexNormals()
        return geo
      }
      function pieceMaterial(color: 'w' | 'b') {
        const isWhite = color === 'w'
        return new THREE.MeshPhysicalMaterial({
          map: isWhite ? texWhitePiece : texBlackPiece,
          roughness: isWhite ? 0.16 : 0.2,
          metalness: 0.07,
          clearcoat: 0.9,
          clearcoatRoughness: 0.12,
          emissive: isWhite ? 0x0d3d47 : 0x3a0510,
          emissiveIntensity: isWhite ? 0.14 : 0.16,
        })
      }
      function addRing(group: InstanceType<typeof THREE.Group>, radius: number, y: number, mat: InstanceType<typeof THREE.Material>) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.024, 8, 24), mat)
        ring.rotation.x = Math.PI / 2
        ring.position.y = y
        group.add(ring)
      }
      function buildKnightHead(mat: InstanceType<typeof THREE.Material>) {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        shape.bezierCurveTo(0.01, 0.16, -0.04, 0.28, 0.04, 0.4)
        shape.bezierCurveTo(0.1, 0.46, 0.08, 0.36, 0.16, 0.34)
        shape.bezierCurveTo(0.22, 0.34, 0.2, 0.44, 0.14, 0.5)
        shape.bezierCurveTo(0.08, 0.56, 0.18, 0.62, 0.28, 0.56)
        shape.bezierCurveTo(0.38, 0.52, 0.42, 0.42, 0.36, 0.34)
        shape.bezierCurveTo(0.32, 0.28, 0.36, 0.22, 0.28, 0.18)
        shape.bezierCurveTo(0.22, 0.14, 0.18, 0.06, 0.1, 0.02)
        shape.lineTo(0, 0)
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.18,
          bevelEnabled: true,
          bevelThickness: 0.025,
          bevelSize: 0.022,
          bevelSegments: 3,
          curveSegments: isSmallDevice ? 8 : 16,
        })
        geo.center()
        geo.computeVertexNormals()
        const head = new THREE.Mesh(geo, mat)
        head.rotation.y = Math.PI / 2
        head.rotation.z = 0.12
        head.scale.set(1.5, 1.5, 1.5)
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.19, 10), mat)
        ear.position.set(-0.03, 0.34, 0.1)
        ear.rotation.z = 0.35
        ear.rotation.x = -0.25
        const group = new THREE.Group()
        group.add(head, ear)
        return group
      }
      function createPieceMesh(type: string, color: 'w' | 'b') {
        const group = new THREE.Group()
        const mat = pieceMaterial(color)
        const base = new THREE.Mesh(buildLathe(PIECE_PROFILES[type]), mat)
        base.castShadow = !isSmallDevice
        group.add(base)

        if (type === 'r') {
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.12), mat)
            box.position.set(Math.cos(ang) * 0.27, 0.98, Math.sin(ang) * 0.27)
            group.add(box)
          }
          addRing(group, 0.33, 0.97, mat)
        }
        if (type === 'q') {
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), mat)
            ball.position.set(Math.cos(ang) * 0.23, 1.34, Math.sin(ang) * 0.23)
            group.add(ball)
          }
        }
        if (type === 'k') {
          const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), mat)
          crossV.position.y = 1.48
          const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.05), mat)
          crossH.position.y = 1.42
          group.add(crossV, crossH)
          addRing(group, 0.21, 1.22, mat)
        }
        if (type === 'b') {
          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), mat)
          finial.position.y = 1.25
          group.add(finial)
        }
        if (type === 'n') {
          const head = buildKnightHead(mat)
          head.position.set(0.02, 0.5, -0.02)
          group.add(head)
        }
        if (type === 'p') {
          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 14), mat)
          finial.position.y = 0.97
          group.add(finial)
        }
        addRing(group, 0.33, 0.11, mat)
        group.traverse((o: InstanceType<typeof THREE.Object3D>) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>
          if ((mesh as { isMesh?: boolean }).isMesh) {
            mesh.castShadow = !isSmallDevice
            mesh.receiveShadow = !isSmallDevice
          }
        })
        // Piezas altas y esbeltas
        group.scale.set(0.6, 1.0, 0.6)
        return group
      }

      const piecesGroup = new THREE.Group()
      scene.add(piecesGroup)
      function rebuildPieces(gs: GameState) {
        piecesGroup.clear()
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = gs.board[r][c]
            if (!p) continue
            const mesh = createPieceMesh(p.type, p.color)
            const [x, y, z] = squarePos(r, c)
            mesh.position.set(x, y + 0.07, z)
            piecesGroup.add(mesh)
          }
        }
      }
      rebuildPieces(state)

      /* ---------------- Resaltados ---------------- */
      const highlightGroup = new THREE.Group()
      boardGroup.add(highlightGroup)
      const hlMoveMat = new THREE.MeshBasicMaterial({ color: 0x62ffd8, transparent: true, opacity: 0.88, depthWrite: false })
      const hlCaptureMat = new THREE.MeshBasicMaterial({ color: 0xff5f6d, transparent: true, opacity: 0.9, depthWrite: false })
      const selMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.45, depthWrite: false })
      const lastMoveMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.5, depthWrite: false })
      const checkMat = new THREE.MeshBasicMaterial({ color: 0xff2d40, transparent: true, opacity: 0.55, depthWrite: false })

      function applyHighlights(
        sel: Selection | null,
        last: Props['lastMove'],
        checkSq: { r: number; c: number } | null
      ) {
        highlightGroup.clear()
        if (sel) {
          const [x, , z] = squarePos(sel.r, sel.c)
          const m = new THREE.Mesh(new THREE.BoxGeometry(SQ * 0.96, 0.03, SQ * 0.96), selMat)
          m.position.set(x, 0.076, z)
          highlightGroup.add(m)
          for (const mv of sel.moves) {
            const isCap = !!mv.capture
            const geo = isCap ? new THREE.RingGeometry(SQ * 0.36, SQ * 0.46, 24) : new THREE.CircleGeometry(SQ * 0.28, 24)
            const mesh = new THREE.Mesh(geo, isCap ? hlCaptureMat : hlMoveMat)
            mesh.rotation.x = -Math.PI / 2
            const [hx, , hz] = squarePos(mv.toR, mv.toC)
            mesh.position.set(hx, 0.086, hz)
            highlightGroup.add(mesh)
          }
        }
        if (last) {
          for (const pos of [last.from, last.to]) {
            const [x, , z] = squarePos(pos.r, pos.c)
            const mesh = new THREE.Mesh(new THREE.RingGeometry(SQ * 0.38, SQ * 0.48, 28), lastMoveMat)
            mesh.rotation.x = -Math.PI / 2
            mesh.position.set(x, 0.09, z)
            highlightGroup.add(mesh)
          }
        }
        if (checkSq) {
          const [x, , z] = squarePos(checkSq.r, checkSq.c)
          const mesh = new THREE.Mesh(new THREE.RingGeometry(SQ * 0.3, SQ * 0.5, 28), checkMat)
          mesh.rotation.x = -Math.PI / 2
          mesh.position.set(x, 0.095, z)
          highlightGroup.add(mesh)
        }
      }
      applyHighlights(selection, lastMove, null)

      /* ---------------- Interacción (raycasting) ---------------- */
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      let downPos: { x: number; y: number } | null = null
      function onPointerDown(e: PointerEvent) {
        downPos = { x: e.clientX, y: e.clientY }
      }
      function onPointerUp(e: PointerEvent) {
        if (!downPos) return
        const dx = e.clientX - downPos.x
        const dy = e.clientY - downPos.y
        downPos = null
        if (Math.hypot(dx, dy) > 6) return // fue un arrastre de cámara, no un click
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hits = raycaster.intersectObjects(squareMeshes, false)
        if (hits.length > 0) {
          const { r, c } = hits[0].object.userData as { r: number; c: number }
          clickHandlerRef.current(r, c)
        }
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown)
      renderer.domElement.addEventListener('pointerup', onPointerUp)

      /* ---------------- Cámara: presets y orientación ---------------- */
      const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
        default: { pos: [0, 12.2, 13.2], target: [0, 0.6, 0] },
        top: { pos: [0, 20, 0.01], target: [0, 0, 0] },
        front: { pos: [0, 4.2, 15.5], target: [0, 0.6, 0] },
      }
      let camAnim: { t: number; from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null
      function goToCamera(preset: CameraPreset, orient: Color) {
        const p = CAMERA_PRESETS[preset]
        const flip = orient === 'b' ? -1 : 1
        const to = new THREE.Vector3(p.pos[0] * flip, p.pos[1], p.pos[2] * flip)
        const toT = new THREE.Vector3(...p.target)
        camAnim = { t: 0, from: camera.position.clone(), to, fromT: controls.target.clone(), toT }
      }
      goToCamera(cameraPreset, orientation)

      /* ---------------- Bucle de render ---------------- */
      const clock = new THREE.Clock()
      let pulseT = 0
      function render() {
        const dt = Math.min(clock.getDelta(), 0.05)
        pulseT += dt
        if (camAnim) {
          camAnim.t = Math.min(1, camAnim.t + dt * 1.6)
          const ease = 1 - Math.pow(1 - camAnim.t, 3)
          camera.position.lerpVectors(camAnim.from, camAnim.to, ease)
          controls.target.lerpVectors(camAnim.fromT, camAnim.toT, ease)
          if (camAnim.t >= 1) camAnim = null
        }
        controls.update()
        ledMat.emissiveIntensity = 2.4 + Math.sin(pulseT * 1.5) * 0.5
        composer.render()
        raf = requestAnimationFrame(render)
      }
      render()

      const resizeObserver = new ResizeObserver(() => {
        if (!container) return
        const w = container.clientWidth
        const h = container.clientHeight
        if (w === 0 || h === 0) return
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
        composer.setSize(w, h)
      })
      resizeObserver.observe(container)

      apiRef.current = {
        setSkin(newSkin: BoardSkin) {
          skinDef = BOARD_SKINS.find((s) => s.id === newSkin) ?? BOARD_SKINS[0]
          texLight.dispose()
          texDark.dispose()
          texLight = makeMarble(skinDef.light, adjustVein(skinDef.light), texSize, 3.8)
          texDark = makeMarble(skinDef.dark, adjustVein(skinDef.dark), texSize, 4.2)
          squareMeshes.forEach((m) => {
            const { r, c } = m.userData as { r: number; c: number }
            const light = (r + c) % 2 === 0
            const mat = m.material as InstanceType<typeof THREE.MeshPhysicalMaterial>
            mat.map = light ? texLight : texDark
            mat.needsUpdate = true
          })
          ledMat.color.setHex(hexToInt(skinDef.accent))
          ledMat.emissive.setHex(hexToInt(skinDef.accent))
        },
        setBoard(gs: GameState) {
          rebuildPieces(gs)
        },
        setHighlights: applyHighlights,
        setCamera: goToCamera,
        dispose() {
          resizeObserver.disconnect()
          cancelAnimationFrame(raf)
          renderer.domElement.removeEventListener('pointerdown', onPointerDown)
          renderer.domElement.removeEventListener('pointerup', onPointerUp)
          scene.traverse((o: InstanceType<typeof THREE.Object3D>) => {
            const mesh = o as InstanceType<typeof THREE.Mesh>
            if ((mesh as { isMesh?: boolean }).isMesh) {
              mesh.geometry?.dispose?.()
              const mat = mesh.material
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
              else mat?.dispose?.()
            }
          })
          renderer.dispose()
          container.removeChild(canvas)
        },
      }
    }

    boot()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      apiRef.current?.dispose()
      apiRef.current = null
    }
    // Solo se reconstruye la escena al montar; las actualizaciones posteriores
    // se aplican de forma imperativa (ver los efectos de abajo) para no pagar
    // el costo de recrear todo Three.js en cada movimiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apiRef.current?.setBoard(state)
  }, [state])

  useEffect(() => {
    const checkSq = (() => {
      const last = state.fullLog[state.fullLog.length - 1]
      if (!last || (last.status !== 'check' && last.status !== 'checkmate')) return null
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const p = state.board[r][c]
          if (p && p.type === 'k' && p.color === state.turn) return { r, c }
        }
      return null
    })()
    apiRef.current?.setHighlights(showLegalHints ? selection : null, lastMove, checkSq)
  }, [selection, lastMove, showLegalHints, state])

  useEffect(() => {
    apiRef.current?.setSkin(skin)
  }, [skin])

  useEffect(() => {
    apiRef.current?.setCamera(cameraPreset, orientation)
  }, [cameraPreset, orientation])

  return <div ref={mountRef} className="gco-chess-board3d" />
}
