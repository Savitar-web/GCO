import { useEffect, useRef, useState, useCallback } from 'react'
import {
  getProfile,
  updateProfile,
  type AvatarFrame,
} from '@/core/storage/userProfile'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  downloadCredential,
  renderCredentialCanvas,
  type CredentialTheme,
  type CredentialOptions,
} from './downloadCredential'
import { soundClick, soundSuccess, soundFail } from '@/core/audio/uiSounds'
import { listBooks, listTracks } from '@/core/storage/mediaLibrary'

const EMOJI_STYLE_KEY = 'gco:emoji-style'
export type EmojiStylePref =
  | 'ios'
  | 'samsung'
  | 'facebook'
  | 'google'
  | 'twitter'
  | 'system'
  | 'off'

/** Motores reales en web (los nombres de marca son aproximaciones visuales). */
const EMOJI_ENGINES: {
  id: EmojiStylePref
  title: string
  subtitle: string
  badge: string
}[] = [
  {
    id: 'system',
    title: 'Emoji del dispositivo',
    subtitle:
      'Usa el motor de emoji real de tu equipo (Apple Color Emoji en iPhone/Mac, Samsung One UI o Noto en Android, Segoe UI Emoji en Windows). Es la opción por defecto: nada más fiel a como tú los ves.',
    badge: 'Recomendado',
  },
  {
    id: 'ios',
    title: 'iOS (unificado)',
    subtitle: 'Aproximación visual estilo Apple vía Twemoji, igual en cualquier dispositivo.',
    badge: 'Twemoji',
  },
  {
    id: 'samsung',
    title: 'Samsung',
    subtitle: 'Prioriza el motor nativo One UI / Galaxy; si no existe, usa el del sistema.',
    badge: 'Sistema',
  },
  {
    id: 'facebook',
    title: 'Facebook',
    subtitle: 'Estilo Facebook / Messenger clásico vía imágenes unificadas.',
    badge: 'Clásico',
  },
  {
    id: 'google',
    title: 'Google / Noto',
    subtitle: 'Noto Color Emoji + respaldo por imagen si el dispositivo no tiene la fuente.',
    badge: 'Android',
  },
  {
    id: 'twitter',
    title: 'Twitter / X',
    subtitle: 'Twemoji oficial (look X / Twitter).',
    badge: 'Twemoji',
  },
  {
    id: 'off',
    title: 'Desactivar',
    subtitle: 'Sin sustitución por imágenes. Solo lo que pinte el dispositivo.',
    badge: 'Off',
  },
]

function readEmojiStyle(): EmojiStylePref {
  try {
    const v = localStorage.getItem(EMOJI_STYLE_KEY)
    if (v === 'ios-modern' || v === 'ios') return 'ios'
    if (
      v === 'system' ||
      v === 'off' ||
      v === 'samsung' ||
      v === 'facebook' ||
      v === 'google' ||
      v === 'twitter'
    )
      return v as EmojiStylePref
  } catch {
    /* */
  }
  return 'system'
}

function writeEmojiStyle(style: EmojiStylePref) {
  try {
    localStorage.setItem(EMOJI_STYLE_KEY, style)
  } catch {
    /* */
  }
  try {
    document.documentElement.setAttribute('data-gco-emoji', style)
  } catch {
    /* */
  }
  // API global instalada por CategoryMenu / preload PWA
  const w = window as unknown as {
    gcoSetEmojiStyle?: (s: string) => void
    gcoApplyEmojiStyle?: (s?: string) => void
  }
  try {
    if (typeof w.gcoSetEmojiStyle === 'function') {
      w.gcoSetEmojiStyle(style)
    } else if (typeof w.gcoApplyEmojiStyle === 'function') {
      w.gcoApplyEmojiStyle(style)
    } else {
      // Fallback local: strip imgs y avisar a toda la SPA
      try {
        document.querySelectorAll('img.emoji, img.gco-emoji, img.gco-twemoji').forEach((img) => {
          const alt = (img.getAttribute('alt') || '').trim()
          if (alt) img.parentNode?.replaceChild(document.createTextNode(alt), img)
          else img.remove()
        })
      } catch {
        /* */
      }
      window.dispatchEvent(new CustomEvent('gco:emoji-style', { detail: style }))
    }
  } catch {
    window.dispatchEvent(new CustomEvent('gco:emoji-style', { detail: style }))
  }
}

/** ¿Este estilo debe mostrar imágenes unificadas en la preview? */
function previewUsesImages(style: EmojiStylePref): boolean {
  return style === 'ios' || style === 'facebook' || style === 'twitter' || style === 'google'
}

/** CDNs Twemoji con mirrors (Edge, Android WebView, redes restrictivas). */
const TWEMOJI_SVG_BASES = [
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/',
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@14.1.2/assets/svg/',
  'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/',
  'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/svg/',
]

const TWEMOJI_PNG_BASES = [
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/',
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@14.1.2/assets/72x72/',
  'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
]

type PreviewItem = { char: string; hex: string; name: string }
type PreviewGroup = { label: string; items: PreviewItem[] }

const EMOJI_PREVIEW_GROUPS: PreviewGroup[] = [
  {
    label: 'Caras y emociones',
    items: [
      { char: '😀', hex: '1f600', name: 'Sonrisa' },
      { char: '😁', hex: '1f601', name: 'Sonrisa grande' },
      { char: '😂', hex: '1f602', name: 'Risa' },
      { char: '🤣', hex: '1f923', name: 'Muerto de risa' },
      { char: '😊', hex: '1f60a', name: 'Contento' },
      { char: '🙂', hex: '1f642', name: 'Leve sonrisa' },
      { char: '😉', hex: '1f609', name: 'Guiño' },
      { char: '😍', hex: '1f60d', name: 'Ojos corazón' },
      { char: '🥰', hex: '1f970', name: 'Enamorado' },
      { char: '😘', hex: '1f618', name: 'Beso' },
      { char: '😎', hex: '1f60e', name: 'Cool' },
      { char: '🤩', hex: '1f929', name: 'Fascinado' },
      { char: '🥳', hex: '1f973', name: 'Fiesta' },
      { char: '🤔', hex: '1f914', name: 'Pensando' },
      { char: '🤨', hex: '1f928', name: 'Ceja alzada' },
      { char: '😏', hex: '1f60f', name: 'Pícaro' },
      { char: '😴', hex: '1f634', name: 'Dormido' },
      { char: '🥱', hex: '1f971', name: 'Bostezo' },
      { char: '🤯', hex: '1f92f', name: 'Explota' },
      { char: '😵‍💫', hex: '1f635-200d-1f4ab', name: 'Mareado' },
      { char: '😢', hex: '1f622', name: 'Triste' },
      { char: '😭', hex: '1f62d', name: 'Llorando' },
      { char: '😡', hex: '1f621', name: 'Enojado' },
      { char: '😈', hex: '1f608', name: 'Diablillo' },
      { char: '🥹', hex: '1f979', name: 'Emocionado' },
      { char: '🫠', hex: '1fae0', name: 'Derritiendo' },
      { char: '🫡', hex: '1fae1', name: 'Saludo' },
      { char: '🤖', hex: '1f916', name: 'Robot' },
    ],
  },
  {
    label: 'Gestos y manos',
    items: [
      { char: '👍', hex: '1f44d', name: 'OK' },
      { char: '👎', hex: '1f44e', name: 'No' },
      { char: '👏', hex: '1f44f', name: 'Aplauso' },
      { char: '🙌', hex: '1f64c', name: 'Celebrar' },
      { char: '🙏', hex: '1f64f', name: 'Rezo' },
      { char: '💪', hex: '1f4aa', name: 'Fuerza' },
      { char: '✌️', hex: '270c', name: 'Paz' },
      { char: '🤞', hex: '1f91e', name: 'Suerte' },
      { char: '🤝', hex: '1f91d', name: 'Trato' },
      { char: '👋', hex: '1f44b', name: 'Hola' },
      { char: '👌', hex: '1f44c', name: 'Perfecto' },
      { char: '✊', hex: '270a', name: 'Puño' },
      { char: '👉', hex: '1f449', name: 'Señalar' },
      { char: '🫶', hex: '1faf6', name: 'Manos corazón' },
      { char: '🫳', hex: '1faf3', name: 'Palma abajo' },
      { char: '🫵', hex: '1faf5', name: 'Apuntar' },
      { char: '✍️', hex: '270d', name: 'Escribir' },
      { char: '💅', hex: '1f485', name: 'Manicura' },
    ],
  },
  {
    label: 'Personas y cuerpo',
    items: [
      { char: '🧑', hex: '1f9d1', name: 'Persona' },
      { char: '🧑‍💻', hex: '1f9d1-200d-1f4bb', name: 'Programador/a' },
      { char: '🏃', hex: '1f3c3', name: 'Corriendo' },
      { char: '🏋️', hex: '1f3cb', name: 'Levantando pesas' },
      { char: '🧘', hex: '1f9d8', name: 'Meditando' },
      { char: '🤸', hex: '1f938', name: 'Volteando' },
      { char: '🚴', hex: '1f6b4', name: 'Ciclismo' },
      { char: '🏊', hex: '1f3ca', name: 'Nadando' },
      { char: '🧠', hex: '1f9e0', name: 'Mente' },
      { char: '🫀', hex: '1fac0', name: 'Corazón (órgano)' },
      { char: '💤', hex: '1f4a4', name: 'Durmiendo' },
      { char: '👀', hex: '1f440', name: 'Ojos' },
    ],
  },
  {
    label: 'Animales y naturaleza',
    items: [
      { char: '🐶', hex: '1f436', name: 'Perro' },
      { char: '🐱', hex: '1f431', name: 'Gato' },
      { char: '🦊', hex: '1f98a', name: 'Zorro' },
      { char: '🦁', hex: '1f981', name: 'León' },
      { char: '🐼', hex: '1f43c', name: 'Panda' },
      { char: '🦄', hex: '1f984', name: 'Unicornio' },
      { char: '🐸', hex: '1f438', name: 'Rana' },
      { char: '🐝', hex: '1f41d', name: 'Abeja' },
      { char: '🦉', hex: '1f989', name: 'Búho' },
      { char: '🐳', hex: '1f433', name: 'Ballena' },
      { char: '🐦‍⬛', hex: '1f426-200d-2b1b', name: 'Cuervo' },
      { char: '🌟', hex: '1f31f', name: 'Estrella' },
      { char: '🔥', hex: '1f525', name: 'Fuego' },
      { char: '🌈', hex: '1f308', name: 'Arcoíris' },
      { char: '☀️', hex: '2600', name: 'Sol' },
      { char: '🌙', hex: '1f319', name: 'Luna' },
      { char: '🌲', hex: '1f332', name: 'Pino' },
      { char: '🌸', hex: '1f338', name: 'Flor' },
      { char: '🍃', hex: '1f343', name: 'Hojas' },
      { char: '⚡', hex: '26a1', name: 'Rayo' },
      { char: '🪨', hex: '1faa8', name: 'Piedra' },
      { char: '🪐', hex: '1fa90', name: 'Planeta' },
    ],
  },
  {
    label: 'Comida y bebida',
    items: [
      { char: '🍎', hex: '1f34e', name: 'Manzana' },
      { char: '🍕', hex: '1f355', name: 'Pizza' },
      { char: '🍣', hex: '1f363', name: 'Sushi' },
      { char: '🍩', hex: '1f369', name: 'Dona' },
      { char: '☕', hex: '2615', name: 'Café' },
      { char: '🥑', hex: '1f951', name: 'Aguacate' },
      { char: '🥗', hex: '1f957', name: 'Ensalada' },
      { char: '🍇', hex: '1f347', name: 'Uvas' },
      { char: '🍔', hex: '1f354', name: 'Burger' },
      { char: '🍜', hex: '1f35c', name: 'Ramen' },
      { char: '🍰', hex: '1f370', name: 'Pastel' },
      { char: '🍫', hex: '1f36b', name: 'Chocolate' },
      { char: '🥤', hex: '1f964', name: 'Bebida' },
      { char: '🍉', hex: '1f349', name: 'Sandía' },
    ],
  },
  {
    label: 'Objetos y tecnología',
    items: [
      { char: '💻', hex: '1f4bb', name: 'Laptop' },
      { char: '📱', hex: '1f4f1', name: 'Móvil' },
      { char: '🎧', hex: '1f3a7', name: 'Auriculares' },
      { char: '🎮', hex: '1f3ae', name: 'Mando' },
      { char: '📷', hex: '1f4f7', name: 'Cámara' },
      { char: '💡', hex: '1f4a1', name: 'Idea' },
      { char: '🔑', hex: '1f511', name: 'Llave' },
      { char: '🛰️', hex: '1f6f0', name: 'Satélite' },
      { char: '⌚', hex: '231a', name: 'Reloj' },
      { char: '🔋', hex: '1f50b', name: 'Batería' },
      { char: '🧭', hex: '1f9ed', name: 'Brújula' },
      { char: '🧩', hex: '1f9e9', name: 'Puzzle' },
      { char: '🔍', hex: '1f50d', name: 'Buscar' },
      { char: '📖', hex: '1f4d6', name: 'Libro' },
      { char: '🎵', hex: '1f3b5', name: 'Música' },
      { char: '🔢', hex: '1f522', name: 'Números' },
      { char: '🌍', hex: '1f30d', name: 'Mundo' },
    ],
  },
  {
    label: 'Símbolos y banderas',
    items: [
      { char: '❤️', hex: '2764', name: 'Corazón' },
      { char: '💚', hex: '1f49a', name: 'Corazón verde' },
      { char: '💙', hex: '1f499', name: 'Corazón azul' },
      { char: '⭐', hex: '2b50', name: 'Estrella llena' },
      { char: '✅', hex: '2705', name: 'Check' },
      { char: '❌', hex: '274c', name: 'Cruz' },
      { char: '⚠️', hex: '26a0', name: 'Advertencia' },
      { char: '💯', hex: '1f4af', name: 'Cien' },
      { char: '🎯', hex: '1f3af', name: 'Objetivo' },
      { char: '🏆', hex: '1f3c6', name: 'Trofeo' },
      { char: '🎉', hex: '1f389', name: 'Confeti' },
      { char: '🇲🇽', hex: '1f1f2-1f1fd', name: 'Bandera México' },
      { char: '🇺🇸', hex: '1f1fa-1f1f8', name: 'Bandera EE. UU.' },
      { char: '🇪🇸', hex: '1f1ea-1f1f8', name: 'Bandera España' },
    ],
  },
]

/**
 * Glifo de preview: cambia al instante al elegir estilo.
 * - ios / twitter / facebook / google → imagen Twemoji (varios CDN)
 * - samsung / system / off → carácter nativo del SO
 */
function EmojiPreviewGlyph({
  item,
  style,
}: {
  item: PreviewItem
  style: EmojiStylePref
}) {
  const useImg = previewUsesImages(style)
  const [srcIdx, setSrcIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  // Reinicia cascada de CDN cuando cambia el estilo o el hex
  useEffect(() => {
    setSrcIdx(0)
    setFailed(false)
  }, [style, item.hex])

  if (!useImg || failed) {
    return (
      <span
        key={`native-${style}-${item.hex}`}
        style={{
          fontSize: '1.55rem',
          lineHeight: 1,
          display: 'block',
          fontFamily:
            style === 'google'
              ? "'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"
              : "system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
        }}
        aria-hidden
      >
        {item.char}
      </span>
    )
  }

  const bases = srcIdx < TWEMOJI_SVG_BASES.length ? TWEMOJI_SVG_BASES : TWEMOJI_PNG_BASES
  const bi = srcIdx % bases.length
  const ext = srcIdx < TWEMOJI_SVG_BASES.length ? '.svg' : '.png'
  // query distinta por estilo fuerza re-fetch visual al cambiar opción
  const src = `${bases[bi]}${item.hex}${ext}?v=${style}`

  return (
    <img
      key={`img-${style}-${item.hex}-${srcIdx}`}
      src={src}
      alt={item.name}
      width={30}
      height={30}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      style={{
        width: 30,
        height: 30,
        display: 'block',
        imageRendering: 'auto',
      }}
      onError={() => {
        const next = srcIdx + 1
        if (next < TWEMOJI_SVG_BASES.length + TWEMOJI_PNG_BASES.length) {
          setSrcIdx(next)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

/** Precarga un lote de SVG Twemoji en caché del navegador. */
function preloadTwemojiBatch(hexes: string[]) {
  if (typeof window === 'undefined') return
  const base = TWEMOJI_SVG_BASES[0]
  hexes.slice(0, 80).forEach((hex, i) => {
    window.setTimeout(() => {
      const img = new Image()
      img.decoding = 'async'
      img.src = `${base}${hex}.svg`
    }, i * 8)
  })
}

/** Marcos (añadir estos ids en AvatarFrame del storage) */
type FrameId =
  | AvatarFrame
  | 'gold'
  | 'holographic'
  | 'cyber'
  | 'frutiger-aero'
  | 'pulse'
  | 'aurora'
  | 'sunset'
  | 'ice'
  | 'lava'
  | 'mint'
  | 'violet'
  | 'chrome'
  | 'pixel'
  | 'orbit'
  | 'rainbow'
  | 'emerald'
  | 'rose'
  | 'midnight'
  | 'solar'
  | 'neon-pink'
  | 'copper'
  | 'glitch'
  | 'ocean'
  | 'forest'
  | 'candy'
  | 'steel'
  | 'plasma'
  | 'duo'
  | 'amber'
  | 'indigo'
  | 'lime'
  | 'crimson'
  | 'sapphire'
  | 'pearl'
  | 'obsidian'
  | 'coral'
  | 'azure'
  | 'magenta'
  | 'bronze'
  | 'silver'
  | 'titanium'
  | 'neon-blue'
  | 'neon-green'
  | 'fire'
  | 'frost'
  | 'galaxy'
  | 'prism'
  | 'vapor'
  | 'retro'
  | 'noir'
  | 'sunrise'
  | 'twilight'
  | 'jade'
  | 'ruby'
  | 'opal'
  | 'quartz'
  | 'nebula'
  | 'comet'
  | 'eclipse'
  | 'bloom'
  | 'storm'
  | 'honey'
  | 'mint-glow'
  | 'lava-ring'
  | 'ice-ring'
  | 'gold-pulse'
  | 'cyber-grid'
  | 'holo-wave'
  | 'shadow'
  | 'bloom-pink'
  | 'arctic'
  | 'volcano'
  | 'meadow'
  | 'royal'
  | 'sunset-glow'
  | 'electric'
  | 'pastel'
  | 'mono'
  | 'triad'
  | 'spectrum'
  | 'aurora-borealis'
  | 'liquid-gold'
  | 'deep-sea'
  | 'cherry-blossom'
  | 'volt'
  | 'obsidian-gold'
  | 'peach'
  | 'cosmic-purple'
  | 'terra'
  | 'mercury'
  | 'blood-orange'
  | 'moss'
  | 'ultraviolet'
  | 'champagne'
  | 'graphite'
  | 'lagoon'

const FRAMES: { id: FrameId; label: string; emoji: string; anim?: string }[] = [
  { id: 'none', label: 'Ninguno', emoji: '○' },
  { id: 'metal', label: 'Metálico', emoji: '⚙️', anim: 'gco-frame-shine' },
  { id: 'neon', label: 'Neón', emoji: '✦', anim: 'gco-frame-neon' },
  { id: 'matte', label: 'Mate', emoji: '●' },
  { id: 'glass', label: 'Liquid glass', emoji: '◌', anim: 'gco-frame-breathe' },
  { id: 'gold', label: 'Oro', emoji: '✦', anim: 'gco-frame-shine' },
  { id: 'holographic', label: 'Holográfico', emoji: '◇', anim: 'gco-frame-holo' },
  { id: 'cyber', label: 'Cyber', emoji: '▣', anim: 'gco-frame-cyber' },
  { id: 'frutiger-aero', label: 'Frutiger Aero', emoji: '💧', anim: 'gco-frame-aurora' },
  { id: 'pulse', label: 'Pulso', emoji: '💗', anim: 'gco-frame-pulse' },
  { id: 'aurora', label: 'Aurora', emoji: '🌌', anim: 'gco-frame-aurora' },
  { id: 'sunset', label: 'Atardecer', emoji: '🌅', anim: 'gco-frame-sunset' },
  { id: 'ice', label: 'Hielo', emoji: '❄️', anim: 'gco-frame-sparkle' },
  { id: 'lava', label: 'Lava', emoji: '🌋', anim: 'gco-frame-lava' },
  { id: 'mint', label: 'Menta', emoji: '🍃', anim: 'gco-frame-sparkle' },
  { id: 'violet', label: 'Violeta', emoji: '💜', anim: 'gco-frame-violet' },
  { id: 'chrome', label: 'Cromo', emoji: '🪞', anim: 'gco-frame-shine' },
  { id: 'pixel', label: 'Pixel', emoji: '👾', anim: 'gco-frame-cyber' },
  { id: 'orbit', label: 'Órbita', emoji: '🪐', anim: 'gco-frame-orbit' },
  { id: 'rainbow', label: 'Arcoíris', emoji: '🌈', anim: 'gco-frame-holo' },
  { id: 'emerald', label: 'Esmeralda', emoji: '💚', anim: 'gco-frame-breathe' },
  { id: 'rose', label: 'Rosa', emoji: '🌹', anim: 'gco-frame-pulse' },
  { id: 'midnight', label: 'Medianoche', emoji: '🌑', anim: 'gco-frame-breathe' },
  { id: 'solar', label: 'Solar', emoji: '☀️', anim: 'gco-frame-sparkle' },
  { id: 'neon-pink', label: 'Neón rosa', emoji: '💖', anim: 'gco-frame-neon' },
  { id: 'copper', label: 'Cobre', emoji: '🔶', anim: 'gco-frame-shine' },
  { id: 'glitch', label: 'Glitch', emoji: '📺', anim: 'gco-frame-glitch' },
  { id: 'ocean', label: 'Océano', emoji: '🌊', anim: 'gco-frame-ocean' },
  { id: 'forest', label: 'Bosque', emoji: '🌲', anim: 'gco-frame-breathe' },
  { id: 'candy', label: 'Caramelo', emoji: '🍬', anim: 'gco-frame-pulse' },
  { id: 'steel', label: 'Acero', emoji: '🛡️', anim: 'gco-frame-shine' },
  { id: 'plasma', label: 'Plasma', emoji: '⚛️', anim: 'gco-frame-plasma' },
  { id: 'duo', label: 'Dúo', emoji: '☯️', anim: 'gco-frame-orbit' },
  { id: 'amber', label: 'Ámbar', emoji: '🟡', anim: 'gco-frame-shine' },
  { id: 'indigo', label: 'Índigo', emoji: '🔵', anim: 'gco-frame-violet' },
  { id: 'lime', label: 'Lima', emoji: '🟢', anim: 'gco-frame-sparkle' },
  { id: 'crimson', label: 'Carmesí', emoji: '🔴', anim: 'gco-frame-pulse' },
  { id: 'sapphire', label: 'Zafiro', emoji: '💎', anim: 'gco-frame-breathe' },
  { id: 'pearl', label: 'Perla', emoji: '⚪', anim: 'gco-frame-shine' },
  { id: 'obsidian', label: 'Obsidiana', emoji: '⬛', anim: 'gco-frame-breathe' },
  { id: 'coral', label: 'Coral', emoji: '🪸', anim: 'gco-frame-ocean' },
  { id: 'azure', label: 'Azur', emoji: '🩵', anim: 'gco-frame-ocean' },
  { id: 'magenta', label: 'Magenta', emoji: '🟣', anim: 'gco-frame-neon' },
  { id: 'bronze', label: 'Bronce', emoji: '🥉', anim: 'gco-frame-shine' },
  { id: 'silver', label: 'Plata', emoji: '🥈', anim: 'gco-frame-shine' },
  { id: 'titanium', label: 'Titanio', emoji: '⬜', anim: 'gco-frame-shine' },
  { id: 'neon-blue', label: 'Neón azul', emoji: '💙', anim: 'gco-frame-neon' },
  { id: 'neon-green', label: 'Neón verde', emoji: '💚', anim: 'gco-frame-neon' },
  { id: 'fire', label: 'Fuego', emoji: '🔥', anim: 'gco-frame-lava' },
  { id: 'frost', label: 'Escarcha', emoji: '🧊', anim: 'gco-frame-sparkle' },
  { id: 'galaxy', label: 'Galaxia', emoji: '🌌', anim: 'gco-frame-orbit' },
  { id: 'prism', label: 'Prisma', emoji: '🔷', anim: 'gco-frame-holo' },
  { id: 'vapor', label: 'Vaporwave', emoji: '📼', anim: 'gco-frame-aurora' },
  { id: 'retro', label: 'Retro', emoji: '📺', anim: 'gco-frame-glitch' },
  { id: 'noir', label: 'Noir', emoji: '🎬', anim: 'gco-frame-breathe' },
  { id: 'sunrise', label: 'Amanecer', emoji: '🌄', anim: 'gco-frame-sunset' },
  { id: 'twilight', label: 'Crepúsculo', emoji: '🌆', anim: 'gco-frame-violet' },
  { id: 'jade', label: 'Jade', emoji: '🟢', anim: 'gco-frame-breathe' },
  { id: 'ruby', label: 'Rubí', emoji: '♦️', anim: 'gco-frame-pulse' },
  { id: 'opal', label: 'Ópalo', emoji: '🫧', anim: 'gco-frame-holo' },
  { id: 'quartz', label: 'Cuarzo', emoji: '✧', anim: 'gco-frame-sparkle' },
  { id: 'nebula', label: 'Nebulosa', emoji: '☁️', anim: 'gco-frame-plasma' },
  { id: 'comet', label: 'Cometa', emoji: '☄️', anim: 'gco-frame-orbit' },
  { id: 'eclipse', label: 'Eclipse', emoji: '🌚', anim: 'gco-frame-breathe' },
  { id: 'bloom', label: 'Floración', emoji: '🌺', anim: 'gco-frame-pulse' },
  { id: 'storm', label: 'Tormenta', emoji: '⛈️', anim: 'gco-frame-glitch' },
  { id: 'honey', label: 'Miel', emoji: '🍯', anim: 'gco-frame-shine' },
  { id: 'mint-glow', label: 'Menta glow', emoji: '✨', anim: 'gco-frame-sparkle' },
  { id: 'lava-ring', label: 'Anillo lava', emoji: '🔶', anim: 'gco-frame-lava' },
  { id: 'ice-ring', label: 'Anillo hielo', emoji: '🔷', anim: 'gco-frame-sparkle' },
  { id: 'gold-pulse', label: 'Oro pulso', emoji: '👑', anim: 'gco-frame-pulse' },
  { id: 'cyber-grid', label: 'Cyber grid', emoji: '▦', anim: 'gco-frame-cyber' },
  { id: 'holo-wave', label: 'Holo wave', emoji: '〰', anim: 'gco-frame-holo' },
  { id: 'shadow', label: 'Sombra', emoji: '👤', anim: 'gco-frame-breathe' },
  { id: 'bloom-pink', label: 'Bloom rosa', emoji: '🌸', anim: 'gco-frame-pulse' },
  { id: 'arctic', label: 'Ártico', emoji: '🏔️', anim: 'gco-frame-sparkle' },
  { id: 'volcano', label: 'Volcán', emoji: '🌋', anim: 'gco-frame-lava' },
  { id: 'meadow', label: 'Pradera', emoji: '🌿', anim: 'gco-frame-breathe' },
  { id: 'royal', label: 'Real', emoji: '👑', anim: 'gco-frame-shine' },
  { id: 'sunset-glow', label: 'Sunset glow', emoji: '🌇', anim: 'gco-frame-sunset' },
  { id: 'electric', label: 'Eléctrico', emoji: '⚡', anim: 'gco-frame-neon' },
  { id: 'pastel', label: 'Pastel', emoji: '🎀', anim: 'gco-frame-soft' },
  { id: 'mono', label: 'Mono', emoji: '⬛', anim: 'gco-frame-breathe' },
  { id: 'triad', label: 'Tríada', emoji: '🎨', anim: 'gco-frame-holo' },
  { id: 'spectrum', label: 'Espectro', emoji: '🌈', anim: 'gco-frame-plasma' },
  { id: 'aurora-borealis', label: 'Aurora boreal', emoji: '🌌', anim: 'gco-frame-aurora' },
  { id: 'liquid-gold', label: 'Oro líquido', emoji: '✨', anim: 'gco-frame-shine' },
  { id: 'deep-sea', label: 'Mar profundo', emoji: '🌊', anim: 'gco-frame-ocean' },
  { id: 'cherry-blossom', label: 'Sakura', emoji: '🌸', anim: 'gco-frame-soft' },
  { id: 'volt', label: 'Voltio', emoji: '⚡', anim: 'gco-frame-neon' },
  { id: 'obsidian-gold', label: 'Obsidiana dorada', emoji: '🖤', anim: 'gco-frame-shine' },
  { id: 'peach', label: 'Durazno', emoji: '🍑', anim: 'gco-frame-soft' },
  { id: 'cosmic-purple', label: 'Púrpura cósmico', emoji: '🔮', anim: 'gco-frame-plasma' },
  { id: 'terra', label: 'Terracota', emoji: '🏺', anim: 'gco-frame-breathe' },
  { id: 'mercury', label: 'Mercurio', emoji: '⚙️', anim: 'gco-frame-shine' },
  { id: 'blood-orange', label: 'Naranja sangre', emoji: '🧡', anim: 'gco-frame-lava' },
  { id: 'moss', label: 'Musgo', emoji: '🍀', anim: 'gco-frame-breathe' },
  { id: 'ultraviolet', label: 'Ultravioleta', emoji: '🟣', anim: 'gco-frame-neon' },
  { id: 'champagne', label: 'Champán', emoji: '🥂', anim: 'gco-frame-shine' },
  { id: 'graphite', label: 'Grafito', emoji: '⬛', anim: 'gco-frame-breathe' },
  { id: 'lagoon', label: 'Laguna', emoji: '🐠', anim: 'gco-frame-ocean' },
]

const GAMES = [
  { id: 'secuencia-colores', label: 'Secuencia de colores' },
  { id: 'cartas', label: 'Memoria de cartas' },
  { id: 'numeros-asociados', label: 'Números asociados' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'numberpuzzle', label: 'Colocador' },
  { id: 'rompecabezas', label: 'Rompecabezas' },
  { id: 'despejes', label: 'Despejes' },
]

const TARGET_PX = 512
const PREVIEW = 240
const STEP = 8
const AVATAR_UI = 104
const BIO_MAX = 160

function frameRingStyle(frame: FrameId): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: '50%',
    transition:
      'box-shadow 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), border-color 0.25s ease, background 0.35s ease, transform 0.2s ease',
  }
  if (frame === 'neon')
    return {
      ...base,
      padding: 3,
      background: 'var(--gco-primary)',
      boxShadow:
        '0 0 0 1px var(--gco-primary), 0 0 14px var(--gco-primary), 0 0 28px rgba(34,230,197,0.35), inset 0 0 8px rgba(34,230,197,0.25)',
    }
  if (frame === 'metal')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(135deg, #f0f2f5 0%, #8b93a7 40%, #3a4154 70%, #cfd5e0 100%)',
      boxShadow:
        'inset 0 1px 1px rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.35)',
    }
  if (frame === 'matte')
    return {
      ...base,
      padding: 5,
      background: 'rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
    }
  if (frame === 'glass')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 40%, rgba(34,230,197,0.25))',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.35), 0 0 0 4px rgba(34,230,197,0.22), inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 24px rgba(0,0,0,0.28)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }
  if (frame === 'gold')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(145deg, #fff6c8 0%, #e8c547 25%, #b8860b 55%, #f5e6a3 80%, #c9a227 100%)',
      boxShadow:
        '0 0 0 1px rgba(184,134,11,0.5), inset 0 1px 1px rgba(255,255,255,0.7), 0 6px 18px rgba(184,134,11,0.35)',
    }
  if (frame === 'holographic')
    return {
      ...base,
      padding: 3,
      background:
        'conic-gradient(from 210deg, #ff6bcb, #7ec8ff, #22e6c5, #8b7cf6, #ff8ec8, #ff6bcb)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.4), 0 0 20px rgba(139,124,246,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
    }
  if (frame === 'cyber')
    return {
      ...base,
      padding: 3,
      background:
        'linear-gradient(90deg, #22e6c5 0%, #0B1220 35%, #0B1220 65%, #8b7cf6 100%)',
      boxShadow:
        '0 0 0 2px #22e6c5, 0 0 12px rgba(34,230,197,0.5), 0 0 2px #8b7cf6 inset',
    }
  if (frame === 'frutiger-aero')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(160deg, rgba(180,230,255,0.95) 0%, rgba(120,200,240,0.7) 35%, rgba(90,180,220,0.55) 70%, rgba(200,240,255,0.85) 100%)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.75), inset 0 2px 6px rgba(255,255,255,0.85), inset 0 -2px 8px rgba(40,120,180,0.25), 0 8px 22px rgba(60,140,200,0.35)',
    }

  if (frame === 'pulse')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #ff6b9d, #ff3d7f)',
      boxShadow: '0 0 0 2px rgba(255,61,127,0.5), 0 0 18px rgba(255,61,127,0.45)',
    }
  if (frame === 'aurora')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(120deg, #22e6c5, #5b8cff, #c084fc, #22e6c5)',
      boxShadow: '0 0 16px rgba(91,140,255,0.4)',
    }
  if (frame === 'sunset')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #ffb347, #ff6b6b, #c44dff)',
      boxShadow: '0 6px 18px rgba(255,107,107,0.35)',
    }
  if (frame === 'ice')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #e8f7ff, #a8d8ff, #7ec8ff)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.7), 0 8px 20px rgba(126,200,255,0.35)',
    }
  if (frame === 'lava')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #ffeb3b, #ff5722, #b71c1c)',
      boxShadow: '0 0 16px rgba(255,87,34,0.45)',
    }
  if (frame === 'mint')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #d4fff0, #22e6c5, #0d9488)',
      boxShadow: '0 0 12px rgba(34,230,197,0.35)',
    }
  if (frame === 'violet')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #e9d5ff, #8b5cf6, #5b21b6)',
      boxShadow: '0 0 16px rgba(139,92,246,0.4)',
    }
  if (frame === 'chrome')
    return {
      ...base,
      padding: 4,
      background:
        'linear-gradient(135deg, #fff 0%, #bbb 30%, #666 50%, #ddd 70%, #fff 100%)',
      boxShadow:
        'inset 0 1px 2px rgba(255,255,255,0.8), 0 4px 14px rgba(0,0,0,0.3)',
    }
  if (frame === 'pixel')
    return {
      ...base,
      padding: 3,
      background:
        'repeating-linear-gradient(90deg, #22e6c5 0 4px, #8b5cf6 4px 8px)',
      boxShadow: '0 0 0 2px #0B1220',
    }
  if (frame === 'orbit')
    return {
      ...base,
      padding: 4,
      background:
        'conic-gradient(from 0deg, #22e6c5, transparent 40%, #8b5cf6, transparent 80%, #22e6c5)',
      boxShadow: '0 0 12px rgba(34,230,197,0.3)',
    }
  if (frame === 'rainbow')
    return {
      ...base,
      padding: 3,
      background:
        'conic-gradient(from 0deg, #ff6b6b, #ffb347, #ffe66d, #22e6c5, #5b8cff, #c084fc, #ff6b6b)',
      boxShadow: '0 0 18px rgba(192,132,252,0.4)',
    }
  if (frame === 'emerald')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #a7f3d0, #10b981, #064e3b)',
      boxShadow: '0 0 14px rgba(16,185,129,0.4)',
    }
  if (frame === 'rose')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fecdd3, #f43f5e, #9f1239)',
      boxShadow: '0 0 14px rgba(244,63,94,0.4)',
    }

  if (frame === 'midnight')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #1e1b4b, #312e81, #0f172a)',
      boxShadow: '0 0 14px rgba(99,102,241,0.35)',
    }
  if (frame === 'solar')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fef08a, #f59e0b, #ea580c)',
      boxShadow: '0 0 16px rgba(245,158,11,0.45)',
    }
  if (frame === 'neon-pink')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #f472b6, #db2777, #9d174d)',
      boxShadow: '0 0 0 1px #f472b6, 0 0 18px rgba(244,114,182,0.55)',
    }
  if (frame === 'copper')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fdba74, #c2410c, #7c2d12)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 4px 14px rgba(194,65,12,0.35)',
    }
  if (frame === 'glitch')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(90deg, #22e6c5 0%, #ff2d55 50%, #8b5cf6 100%)',
      boxShadow: '2px 0 0 #22e6c5, -2px 0 0 #ff2d55',
    }
  if (frame === 'ocean')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #67e8f9, #0284c7, #1e3a8a)',
      boxShadow: '0 0 16px rgba(2,132,199,0.4)',
    }
  if (frame === 'forest')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(160deg, #86efac, #16a34a, #14532d)',
      boxShadow: '0 0 14px rgba(22,163,74,0.35)',
    }
  if (frame === 'candy')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(145deg, #fda4af, #e879f9, #a78bfa)',
      boxShadow: '0 0 14px rgba(232,121,249,0.4)',
    }
  if (frame === 'steel')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(135deg, #e2e8f0, #64748b, #1e293b, #94a3b8)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.3)',
    }
  if (frame === 'plasma')
    return {
      ...base,
      padding: 3,
      background: 'conic-gradient(from 90deg, #22e6c5, #8b5cf6, #f472b6, #22e6c5)',
      boxShadow: '0 0 18px rgba(139,92,246,0.45)',
    }
  if (frame === 'duo')
    return {
      ...base,
      padding: 3,
      background: 'linear-gradient(90deg, #0a0a0a 50%, #f5f5f5 50%)',
      boxShadow: '0 0 0 2px var(--gco-primary, #22e6c5)',
    }

  if (frame === 'amber')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fcd34d,#d97706,#92400e)', boxShadow: '0 0 14px rgba(217,119,6,0.4)' }
  if (frame === 'indigo')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a5b4fc,#4f46e5,#1e1b4b)', boxShadow: '0 0 14px rgba(79,70,229,0.4)' }
  if (frame === 'lime')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#bef264,#65a30d,#365314)', boxShadow: '0 0 14px rgba(101,163,13,0.4)' }
  if (frame === 'crimson')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fca5a5,#dc2626,#7f1d1d)', boxShadow: '0 0 14px rgba(220,38,38,0.45)' }
  if (frame === 'sapphire')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#93c5fd,#2563eb,#1e3a8a)', boxShadow: '0 0 16px rgba(37,99,235,0.45)' }
  if (frame === 'pearl')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fff,#e2e8f0,#cbd5e1)', boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.15)' }
  if (frame === 'obsidian')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#334155,#0f172a,#020617)', boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' }
  if (frame === 'coral')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fda4af,#fb7185,#e11d48)', boxShadow: '0 0 14px rgba(251,113,133,0.4)' }
  if (frame === 'azure')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a5f3fc,#06b6d4,#0e7490)', boxShadow: '0 0 14px rgba(6,182,212,0.4)' }
  if (frame === 'magenta')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f0abfc,#d946ef,#a21caf)', boxShadow: '0 0 16px rgba(217,70,239,0.45)' }
  if (frame === 'bronze')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#d6b089,#a16207,#713f12)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35)' }
  if (frame === 'silver')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f8fafc,#94a3b8,#475569)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)' }
  if (frame === 'titanium')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#e2e8f0,#64748b,#334155,#94a3b8)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }
  if (frame === 'neon-blue')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#38bdf8,#0284c7)', boxShadow: '0 0 0 1px #38bdf8, 0 0 18px rgba(56,189,248,0.55)' }
  if (frame === 'neon-green')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#4ade80,#16a34a)', boxShadow: '0 0 0 1px #4ade80, 0 0 18px rgba(74,222,128,0.55)' }
  if (frame === 'fire')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fef08a,#f97316,#b91c1c)', boxShadow: '0 0 16px rgba(249,115,22,0.5)' }
  if (frame === 'frost')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#e0f2fe,#7dd3fc,#38bdf8)', boxShadow: '0 0 14px rgba(125,211,252,0.45)' }
  if (frame === 'galaxy')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 30% 30%,#c084fc,#312e81,#0f172a)', boxShadow: '0 0 16px rgba(192,132,252,0.4)' }
  if (frame === 'prism')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#f472b6,#38bdf8,#4ade80,#fbbf24,#f472b6)', boxShadow: '0 0 16px rgba(56,189,248,0.35)' }
  if (frame === 'vapor')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#f9a8d4,#67e8f9,#c4b5fd)', boxShadow: '0 0 14px rgba(249,168,212,0.4)' }
  if (frame === 'retro')
    return { ...base, padding: 3, background: 'linear-gradient(90deg,#f97316,#ec4899,#8b5cf6)', boxShadow: '2px 0 0 #22e6c5, -2px 0 0 #f97316' }
  if (frame === 'noir')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#52525b,#18181b,#09090b)', boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }
  if (frame === 'sunrise')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fde68a,#fb923c,#f43f5e)', boxShadow: '0 0 14px rgba(251,146,60,0.4)' }
  if (frame === 'twilight')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#c4b5fd,#6366f1,#312e81)', boxShadow: '0 0 14px rgba(99,102,241,0.4)' }
  if (frame === 'jade')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#6ee7b7,#059669,#064e3b)', boxShadow: '0 0 14px rgba(5,150,105,0.4)' }
  if (frame === 'ruby')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fb7185,#e11d48,#881337)', boxShadow: '0 0 14px rgba(225,29,72,0.45)' }
  if (frame === 'opal')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#e0e7ff,#fce7f3,#d1fae5,#e0e7ff)', boxShadow: '0 0 12px rgba(224,231,255,0.5)' }
  if (frame === 'quartz')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#f5f3ff,#ddd6fe,#a78bfa)', boxShadow: '0 0 12px rgba(167,139,250,0.35)' }
  if (frame === 'nebula')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 70% 40%,#f472b6,#7c3aed,#0f172a)', boxShadow: '0 0 16px rgba(124,58,237,0.45)' }
  if (frame === 'comet')
    return { ...base, padding: 3, background: 'linear-gradient(120deg,#e0f2fe,#38bdf8,#1e3a8a)', boxShadow: '0 0 14px rgba(56,189,248,0.4)' }
  if (frame === 'eclipse')
    return { ...base, padding: 3, background: 'radial-gradient(circle,#1e293b 40%,#fbbf24 42%,#0f172a 70%)', boxShadow: '0 0 16px rgba(251,191,36,0.3)' }
  if (frame === 'bloom')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fbcfe8,#f472b6,#db2777)', boxShadow: '0 0 14px rgba(244,114,182,0.4)' }
  if (frame === 'storm')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#94a3b8,#334155,#0f172a)', boxShadow: '0 0 12px rgba(148,163,184,0.35)' }
  if (frame === 'honey')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fde68a,#f59e0b,#b45309)', boxShadow: '0 0 14px rgba(245,158,11,0.4)' }
  if (frame === 'mint-glow')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a7f3d0,#34d399,#059669)', boxShadow: '0 0 16px rgba(52,211,153,0.45)' }
  if (frame === 'lava-ring')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#f97316,#b91c1c,#f97316)', boxShadow: '0 0 16px rgba(185,28,28,0.45)' }
  if (frame === 'ice-ring')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#e0f2fe,#38bdf8,#e0f2fe)', boxShadow: '0 0 14px rgba(56,189,248,0.4)' }
  if (frame === 'gold-pulse')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fef08a,#eab308,#a16207)', boxShadow: '0 0 16px rgba(234,179,8,0.45)' }
  if (frame === 'cyber-grid')
    return { ...base, padding: 3, background: 'repeating-linear-gradient(90deg,#22e6c5 0 3px,#0B1220 3px 6px)', boxShadow: '0 0 0 2px #22e6c5' }
  if (frame === 'holo-wave')
    return { ...base, padding: 3, background: 'linear-gradient(90deg,#22e6c5,#8b5cf6,#f472b6,#22e6c5)', boxShadow: '0 0 16px rgba(139,92,246,0.4)' }
  if (frame === 'shadow')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#3f3f46,#18181b)', boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }
  if (frame === 'bloom-pink')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fce7f3,#f9a8d4,#ec4899)', boxShadow: '0 0 14px rgba(236,72,153,0.4)' }
  if (frame === 'arctic')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#f0f9ff,#bae6fd,#7dd3fc)', boxShadow: '0 0 14px rgba(125,211,252,0.4)' }
  if (frame === 'volcano')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fecaca,#ef4444,#7f1d1d)', boxShadow: '0 0 16px rgba(239,68,68,0.45)' }
  if (frame === 'meadow')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#d9f99d,#84cc16,#3f6212)', boxShadow: '0 0 14px rgba(132,204,22,0.35)' }
  if (frame === 'royal')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fde68a,#a855f7,#1e1b4b)', boxShadow: '0 0 16px rgba(168,85,247,0.4)' }
  if (frame === 'sunset-glow')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#fdba74,#f97316,#db2777)', boxShadow: '0 0 14px rgba(249,115,22,0.4)' }
  if (frame === 'electric')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fef08a,#22e6c5,#3b82f6)', boxShadow: '0 0 0 1px #22e6c5, 0 0 18px rgba(34,230,197,0.5)' }
  if (frame === 'pastel')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#fbcfe8,#c7d2fe,#bbf7d0)', boxShadow: '0 0 12px rgba(199,210,254,0.4)' }
  if (frame === 'mono')
    return { ...base, padding: 3, background: 'linear-gradient(145deg,#a1a1aa,#52525b,#27272a)', boxShadow: '0 0 0 1px rgba(255,255,255,0.2)' }
  if (frame === 'triad')
    return { ...base, padding: 3, background: 'conic-gradient(from 0deg,#22e6c5 0 120deg,#8b5cf6 120deg 240deg,#f472b6 240deg 360deg)', boxShadow: '0 0 14px rgba(139,92,246,0.35)' }
  if (frame === 'spectrum')
    return { ...base, padding: 3, background: 'conic-gradient(from 180deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)', boxShadow: '0 0 16px rgba(59,130,246,0.35)' }
  if (frame === 'aurora-borealis')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#0f2027,#2c5364 30%,#22e6c5 60%,#8b7cf6 100%)', boxShadow: '0 0 0 1px rgba(139,124,246,0.4), 0 0 22px rgba(34,230,197,0.4)' }
  if (frame === 'liquid-gold')
    return { ...base, padding: 4, background: 'linear-gradient(160deg,#fff7d6 0%,#f5cc4d 25%,#c98a12 50%,#fff2b8 75%,#b8860b 100%)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 8px 20px rgba(184,134,11,0.4)' }
  if (frame === 'deep-sea')
    return { ...base, padding: 3, background: 'linear-gradient(160deg,#001220,#003554,#0077b6,#00b4d8)', boxShadow: '0 0 0 1px rgba(0,180,216,0.5), 0 0 18px rgba(0,119,182,0.4)' }
  if (frame === 'cherry-blossom')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ffe4ef,#ffb3d1,#ff8fc0)', boxShadow: '0 0 0 1px rgba(255,143,192,0.5), 0 6px 16px rgba(255,143,192,0.35)' }
  if (frame === 'volt')
    return { ...base, padding: 3, background: 'linear-gradient(120deg,#d4ff00,#a3e635)', boxShadow: '0 0 0 2px rgba(212,255,0,0.6), 0 0 20px rgba(212,255,0,0.5)' }
  if (frame === 'obsidian-gold')
    return { ...base, padding: 3, background: 'linear-gradient(155deg,#0a0a0a 0%,#1c1c1c 40%,#c9a227 70%,#0a0a0a 100%)', boxShadow: '0 0 0 1px rgba(201,162,39,0.55), 0 8px 20px rgba(0,0,0,0.5)' }
  if (frame === 'peach')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ffe5d4,#ffb088,#ff8a5c)', boxShadow: '0 6px 16px rgba(255,138,92,0.35)' }
  if (frame === 'cosmic-purple')
    return { ...base, padding: 3, background: 'radial-gradient(circle at 30% 30%,#c084fc,#7c3aed 55%,#1e1b4b 100%)', boxShadow: '0 0 0 1px rgba(124,58,237,0.5), 0 0 20px rgba(124,58,237,0.4)' }
  if (frame === 'terra')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#e9c9a6,#c97b45,#8a4a2b)', boxShadow: '0 6px 16px rgba(138,74,43,0.35)' }
  if (frame === 'mercury')
    return { ...base, padding: 4, background: 'linear-gradient(135deg,#e6e9f0,#9aa4b5 30%,#4b5566 55%,#c9d0da 80%,#f2f4f7 100%)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.7), 0 6px 16px rgba(0,0,0,0.3)' }
  if (frame === 'blood-orange')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#ff9a5c,#ff5c33,#8f1c1c)', boxShadow: '0 0 16px rgba(255,92,51,0.45)' }
  if (frame === 'moss')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#eaf5d0,#8bb34a,#3f5c1f)', boxShadow: '0 6px 16px rgba(63,92,31,0.35)' }
  if (frame === 'ultraviolet')
    return { ...base, padding: 3, background: 'linear-gradient(135deg,#7b2ff7,#f107a3)', boxShadow: '0 0 0 2px rgba(123,47,247,0.5), 0 0 22px rgba(241,7,163,0.45)' }
  if (frame === 'champagne')
    return { ...base, padding: 4, background: 'linear-gradient(160deg,#fdf3e3,#e8c9a0,#c9a670,#f5e2c0)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), 0 6px 16px rgba(201,166,112,0.35)' }
  if (frame === 'graphite')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#3a3a3a,#1a1a1a,#050505)', boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 6px 16px rgba(0,0,0,0.5)' }
  if (frame === 'lagoon')
    return { ...base, padding: 3, background: 'linear-gradient(150deg,#a8f0e0,#22c1a8,#0d6e63)', boxShadow: '0 0 14px rgba(34,193,168,0.4)' }
  return {
    ...base,
    padding: 2,
    background: 'var(--gco-glass-border)',
    boxShadow: 'none',
  }
}

function SwitchRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0.35rem 0',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{label}</span>
        {hint ? (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '0.72rem',
              color: 'var(--gco-ink-muted)',
              lineHeight: 1.35,
            }}
          >
            {hint}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          soundClick()
          onChange(!checked)
        }}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--gco-primary)' : 'rgba(128,128,128,0.35)',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 22 : 3,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        />
      </button>
    </div>
  )
}

function PadBtn({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="glass-button secondary"
      onClick={() => {
        soundClick()
        onClick()
      }}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        fontSize: '1.1rem',
        display: 'grid',
        placeItems: 'center',
      }}
      aria-label={label}
    >
      {label}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.72rem',
        color: 'var(--gco-ink-muted)',
        margin: '0 0 0.65rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: '0.4rem',
        fontWeight: 550,
        fontSize: '0.88rem',
      }}
    >
      {children}
    </label>
  )
}

/** Avatar siempre circular */
function CircularAvatar({
  src,
  frame,
  size = AVATAR_UI,
  onClick,
  animClass,
}: {
  src: string | null
  frame: FrameId
  size?: number
  onClick?: () => void
  animClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cambiar foto de perfil"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        aspectRatio: '1 / 1',
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        display: 'block',
        lineHeight: 0,
        overflow: 'visible',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        className={animClass || undefined}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          aspectRatio: '1 / 1',
          boxSizing: 'border-box',
          ...frameRingStyle(frame),
        }}
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--gco-glass-bg)',
            boxSizing: 'border-box',
          }}
        >
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                display: 'block',
                borderRadius: '50%',
                maxWidth: '100%',
                maxHeight: '100%',
                aspectRatio: '1 / 1',
              }}
            />
          ) : (
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: '100%',
                height: '100%',
                fontSize: '0.75rem',
                color: 'var(--gco-ink-muted)',
                borderRadius: '50%',
              }}
            >
              Foto
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/**
 * Vuelve a codificar un dataURL de imagen a un tamaño/calidad menor.
 * Se usa cuando el guardado falla por espacio (localStorage lleno):
 * en vez de perder el cambio en silencio, reintenta con un archivo más ligero.
 */
function reencodeDataUrl(
  dataUrl: string,
  size: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('sin contexto de canvas')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // recorte central cuadrado, por si la fuente no es 1:1
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - side) / 2
        const sy = (img.naturalHeight - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('no se pudo leer la imagen'))
    img.src = dataUrl
  })
}

function isQuotaError(err: unknown): boolean {
  if (!err) return false
  const name = (err as { name?: string })?.name ?? ''
  const message = String((err as { message?: string })?.message ?? err)
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(message)
  )
}

export function PerfilSettings() {
  const profile = getProfile()
  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [bio, setBio] = useState(
    (profile as { bio?: string } | null)?.bio ?? ''
  )
  const [avatar, setAvatar] = useState(profile?.avatarDataUrl ?? null)
  const [frame, setFrame] = useState<FrameId>(
    (profile?.avatarFrame as FrameId) ?? 'none'
  )
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const frameScrollRef = useRef<HTMLDivElement>(null)

  // Crop
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [imgNat, setImgNat] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [outSize, setOutSize] = useState(TARGET_PX)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Credential viewer / options
  const [credOpen, setCredOpen] = useState(false)
  const [credViewOpen, setCredViewOpen] = useState(false)
  const [credPreviewUrl, setCredPreviewUrl] = useState<string | null>(null)
  const [hideAge, setHideAge] = useState(false)
  const [showFrameOnCred, setShowFrameOnCred] = useState(true)
  const [showBioOnCred, setShowBioOnCred] = useState(true)
  const [credTheme, setCredTheme] = useState<CredentialTheme>('dark')
  const [showGame, setShowGame] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const [favGame, setFavGame] = useState(profile?.favoriteGameId ?? GAMES[0].id)
  const [favBook, setFavBook] = useState(profile?.favoriteBookId ?? '')
  const [favTrack, setFavTrack] = useState(profile?.favoriteTrackId ?? '')
  const [books, setBooks] = useState<{ id: string; title: string }[]>([])
  const [tracks, setTracks] = useState<{ id: string; title: string }[]>([])
  const [credBusy, setCredBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiStyle, setEmojiStyleState] = useState<EmojiStylePref>(() => readEmojiStyle())


  useEffect(() => {
    void listBooks()
      .then((list) => setBooks(list.map((b) => ({ id: b.id, title: b.title }))))
      .catch(() => setBooks([]))
    void listTracks()
      .then((list) => setTracks(list.map((t) => ({ id: t.id, title: t.title }))))
      .catch(() => setTracks([]))
  }, [])

  useEffect(() => {
    return () => {
      if (credPreviewUrl) URL.revokeObjectURL(credPreviewUrl)
    }
  }, [credPreviewUrl])

  const nudge = useCallback((dx: number, dy: number) => {
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }, [])

  const buildOpts = useCallback((): CredentialOptions => {
    return {
      hideAge,
      theme: credTheme,
      showFrame: showFrameOnCred,
      showBio: showBioOnCred,
      bio: bio.trim() || undefined,
      showFavoriteGame: showGame,
      favoriteGameLabel: GAMES.find((g) => g.id === favGame)?.label,
      showFavoriteBook: showBook,
      favoriteBookLabel: books.find((b) => b.id === favBook)?.title,
      showFavoriteTrack: showTrack,
      favoriteTrackLabel: tracks.find((t) => t.id === favTrack)?.title,
    }
  }, [
    hideAge,
    credTheme,
    showFrameOnCred,
    showBioOnCred,
    bio,
    showGame,
    favGame,
    showBook,
    favBook,
    books,
    showTrack,
    favTrack,
    tracks,
  ])

  const persistPrefs = () => {
    try {
      updateProfile({
        favoriteGameId: favGame,
        favoriteBookId: favBook || null,
        favoriteTrackId: favTrack || null,
        avatarFrame: frame as AvatarFrame,
        ...(bio.trim()
          ? ({ bio: bio.trim().slice(0, BIO_MAX) } as Record<string, unknown>)
          : {}),
      } as Parameters<typeof updateProfile>[0] & { bio?: string })
    } catch {
      // No bloquea la vista previa/descarga de la credencial si esto falla;
      // el guardado real del perfil pasa por save().
    }
  }

  const [saving, setSaving] = useState(false)

  const save = async () => {
    const ageNum = parseInt(age, 10)
    if (name.trim().length < 2) {
      soundFail()
      setMsg('Nombre demasiado corto')
      return
    }
    if (isNaN(ageNum) || ageNum < 5 || ageNum > 120) {
      soundFail()
      setMsg('Edad entre 5 y 120')
      return
    }

    setSaving(true)
    let avatarToSave = avatar
    const payload = () => ({
      name: name.trim(),
      age: ageNum,
      avatarDataUrl: avatarToSave,
      avatarFrame: frame as AvatarFrame,
      favoriteGameId: favGame,
      favoriteBookId: favBook || null,
      favoriteTrackId: favTrack || null,
      bio: bio.trim().slice(0, BIO_MAX) || null,
    })

    try {
      // Intento 1: guardar tal cual.
      try {
        updateProfile(
          payload() as Parameters<typeof updateProfile>[0] & {
            bio?: string | null
          }
        )
      } catch (err) {
        // Si falló por espacio y hay avatar nuevo, comprímelo y reintenta
        // en vez de perder el guardado en silencio.
        if (isQuotaError(err) && avatarToSave) {
          for (const [size, quality] of [
            [384, 0.82],
            [256, 0.75],
            [192, 0.7],
          ] as const) {
            try {
              avatarToSave = await reencodeDataUrl(avatarToSave, size, quality)
              updateProfile(
                payload() as Parameters<typeof updateProfile>[0] & {
                  bio?: string | null
                }
              )
              setAvatar(avatarToSave)
              break
            } catch (retryErr) {
              if (!isQuotaError(retryErr)) throw retryErr
              // sigue con el siguiente tamaño más pequeño
            }
          }
        } else {
          throw err
        }
      }

      // Verificación: vuelve a leer el perfil guardado y confirma que
      // el nombre y el avatar realmente se persistieron.
      const stored = getProfile()
      const nameOk = stored?.name === name.trim()
      const avatarOk = (stored?.avatarDataUrl ?? null) === avatarToSave

      if (!nameOk && !avatarOk) {
        throw new Error('El perfil no se guardó (verificación falló)')
      }

      try {
        window.dispatchEvent(new CustomEvent('gco:profile'))
      } catch {
        /* */
      }
      soundSuccess()
      setMsg(
        avatarToSave !== avatar
          ? 'Perfil guardado (la foto se comprimió un poco por espacio)'
          : 'Perfil guardado'
      )
    } catch (err) {
      soundFail()
      setMsg(
        isQuotaError(err)
          ? 'Sin espacio de almacenamiento: prueba con una foto más ligera'
          : 'No se pudo guardar el perfil, inténtalo de nuevo'
      )
    } finally {
      setSaving(false)
    }
  }

  const applyEmojiStyle = (style: EmojiStylePref) => {
    soundClick()
    setEmojiStyleState(style)
    writeEmojiStyle(style)
    // Refuerzo: re-aplicar tras un tick (React puede re-renderizar el modal)
    window.setTimeout(() => {
      try {
        ;(window as unknown as { gcoApplyEmojiStyle?: (s?: string) => void }).gcoApplyEmojiStyle?.(style)
      } catch {
        /* */
      }
    }, 50)
    window.setTimeout(() => {
      try {
        ;(window as unknown as { gcoApplyEmojiStyle?: (s?: string) => void }).gcoApplyEmojiStyle?.(style)
      } catch {
        /* */
      }
    }, 400)
    const labels: Record<EmojiStylePref, string> = {
      ios: 'Estilo iOS (Twemoji unificado). Puede diferir del Apple Color Emoji real.',
      samsung: 'Prioridad sistema (Samsung One UI si está disponible).',
      facebook: 'Estilo Facebook / clásico unificado.',
      google: 'Google / Noto Color Emoji.',
      twitter: 'Twitter / X Twemoji.',
      system: 'Solo emojis nativos del dispositivo.',
      off: 'Sustitución desactivada.',
    }
    setMsg(labels[style] || 'Preferencia de emojis actualizada.')
  }


  const onAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    setOffset({ x: 0, y: 0 })
    setScale(1)
    setOutSize(TARGET_PX)
    soundClick()
    e.target.value = ''
  }

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgNat({ w: img.naturalWidth, h: img.naturalHeight })
    const minCover = Math.max(
      PREVIEW / img.naturalWidth,
      PREVIEW / img.naturalHeight
    )
    setScale(Math.max(1, minCover * (img.naturalWidth / PREVIEW)))
  }

  const autoResize = () => {
    if (!imgNat.w || !imgNat.h) return
    soundClick()
    setOffset({ x: 0, y: 0 })
    setOutSize(TARGET_PX)
    const side = Math.min(imgNat.w, imgNat.h)
    setScale(PREVIEW / side)
  }

  const applyCrop = () => {
    const img = imgRef.current
    if (!img || !imgNat.w) return
    try {
      const size = Math.max(64, Math.min(2048, outSize))
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('ctx')

      const dispW = imgNat.w * scale
      const dispH = imgNat.h * scale
      const imgLeft = PREVIEW / 2 - dispW / 2 + offset.x
      const imgTop = PREVIEW / 2 - dispH / 2 + offset.y

      const sx = ((0 - imgLeft) / dispW) * imgNat.w
      const sy = ((0 - imgTop) / dispH) * imgNat.h
      const sw = (PREVIEW / dispW) * imgNat.w
      const sh = (PREVIEW / dispH) * imgNat.h

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      setAvatar(dataUrl)
      if (cropSrc) URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
      soundSuccess()
      setMsg(`Avatar ${size}×${size}px`)
    } catch {
      soundFail()
      setMsg('No se pudo recortar')
    }
  }

  const openCredentialViewer = async () => {
    setPreviewBusy(true)
    try {
      persistPrefs()
      const canvas = await renderCredentialCanvas(buildOpts())
      if (!canvas) {
        soundFail()
        setMsg('No se pudo generar la vista previa')
        return
      }
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1)
      )
      if (!blob) {
        soundFail()
        setMsg('No se pudo generar la vista previa')
        return
      }
      if (credPreviewUrl) URL.revokeObjectURL(credPreviewUrl)
      const url = URL.createObjectURL(blob)
      setCredPreviewUrl(url)
      setCredViewOpen(true)
      setCredOpen(false)
      soundSuccess()
    } catch {
      soundFail()
      setMsg('Error al generar la credencial')
    } finally {
      setPreviewBusy(false)
    }
  }

  const doDownload = async () => {
    setCredBusy(true)
    try {
      persistPrefs()
      const result = await downloadCredential(buildOpts())
      if (result === 'fail') {
        soundFail()
        setMsg('No se pudo generar la descarga en este dispositivo')
      } else if (result === 'open') {
        soundSuccess()
        setMsg('Imagen abierta: mantén pulsado → Guardar imagen')
      } else {
        soundSuccess()
        setMsg(
          result === 'share'
            ? 'Comparte o guarda desde el menú del sistema'
            : 'Credencial lista'
        )
      }
    } catch {
      soundFail()
      setMsg('Error al generar la credencial')
    } finally {
      setCredBusy(false)
    }
  }

  const scrollFrames = (dir: -1 | 1) => {
    const el = frameScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 120, behavior: 'smooth' })
  }

  const closeViewer = () => {
    soundClick()
    setCredViewOpen(false)
  }

  const selectedFrameMeta = FRAMES.find((f) => f.id === frame)

  return (
    <div
      className="glass-card"
      style={{
        padding: 'clamp(1.1rem, 3vw, 1.5rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.35rem',
      }}
    >

      <style>{`
        @keyframes gco-frame-neon { 0%,100%{ filter:brightness(1)} 50%{ filter:brightness(1.18)} }
        @keyframes gco-frame-shine { 0%{ filter:brightness(1)} 50%{ filter:brightness(1.22)} 100%{ filter:brightness(1)} }
        @keyframes gco-frame-holo { 0%{ filter:hue-rotate(0deg)} 100%{ filter:hue-rotate(360deg)} }
        @keyframes gco-frame-cyber { 0%,100%{ filter:brightness(1)} 50%{ filter:brightness(1.12) saturate(1.2)} }
        @keyframes gco-frame-pulse { 0%,100%{ transform:scale(1)} 50%{ transform:scale(1.05)} }
        @keyframes gco-frame-aurora { 0%{ filter:hue-rotate(0deg) brightness(1)} 50%{ filter:hue-rotate(35deg) brightness(1.08)} 100%{ filter:hue-rotate(0deg) brightness(1)} }
        @keyframes gco-frame-sunset { 0%,100%{ filter:saturate(1)} 50%{ filter:saturate(1.3)} }
        @keyframes gco-frame-lava { 0%,100%{ filter:brightness(1)} 50%{ filter:brightness(1.15)} }
        @keyframes gco-frame-violet { 0%,100%{ filter:hue-rotate(0deg)} 50%{ filter:hue-rotate(18deg)} }
        @keyframes gco-frame-orbit { 0%{ filter:hue-rotate(0deg)} 100%{ filter:hue-rotate(360deg)} }
        @keyframes gco-frame-breathe {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,230,197,0.0); }
          50% { box-shadow: 0 0 16px 2px rgba(34,230,197,0.45); }
        }
        @keyframes gco-frame-sparkle {
          0%,100% { filter: brightness(1) saturate(1); }
          25% { filter: brightness(1.12) saturate(1.15); }
          75% { filter: brightness(1.05) saturate(1.05); }
        }
        .gco-frame-neon { animation: gco-frame-neon 2.2s ease-in-out infinite; }
        .gco-frame-shine { animation: gco-frame-shine 2.8s ease-in-out infinite; }
        .gco-frame-holo { animation: gco-frame-holo 6s linear infinite; }
        .gco-frame-cyber { animation: gco-frame-cyber 2.4s ease-in-out infinite; }
        .gco-frame-pulse { animation: gco-frame-pulse 1.8s ease-in-out infinite; }
        .gco-frame-aurora { animation: gco-frame-aurora 4s ease-in-out infinite; }
        .gco-frame-sunset { animation: gco-frame-sunset 3s ease-in-out infinite; }
        .gco-frame-lava { animation: gco-frame-lava 2s ease-in-out infinite; }
        .gco-frame-violet { animation: gco-frame-violet 3.5s ease-in-out infinite; }
        .gco-frame-orbit { animation: gco-frame-orbit 8s linear infinite; }
        .gco-frame-breathe { animation: gco-frame-breathe 2.6s ease-in-out infinite; }
        .gco-frame-sparkle { animation: gco-frame-sparkle 3.2s ease-in-out infinite; }
        @keyframes gco-frame-glitch {
          0%,100% { filter: none; transform: translate(0,0); }
          20% { filter: hue-rotate(20deg); transform: translate(1px,-1px); }
          40% { filter: hue-rotate(-15deg); transform: translate(-1px,1px); }
          60% { filter: hue-rotate(10deg); transform: translate(1px,0); }
        }
        @keyframes gco-frame-ocean {
          0%,100% { filter: brightness(1) hue-rotate(0deg); }
          50% { filter: brightness(1.1) hue-rotate(12deg); }
        }
        @keyframes gco-frame-plasma {
          0% { filter: hue-rotate(0deg) brightness(1); }
          50% { filter: hue-rotate(40deg) brightness(1.12); }
          100% { filter: hue-rotate(0deg) brightness(1); }
        }
        .gco-frame-glitch { animation: gco-frame-glitch 1.4s steps(2) infinite; }
        .gco-frame-ocean { animation: gco-frame-ocean 3.5s ease-in-out infinite; }
        .gco-frame-plasma { animation: gco-frame-plasma 4s ease-in-out infinite; }
        @keyframes gco-frame-soft {
          0%,100% { filter: brightness(1); }
          50% { filter: brightness(1.08); }
        }
        .gco-frame-soft { animation: gco-frame-soft 3s ease-in-out infinite; }

        /* ── Responsive ── */
        @media (max-width: 420px) {
          .gco-perfil-header { gap: 0.8rem !important; }
          .gco-frame-chip { min-width: 78px !important; padding: 0.7rem 0.4rem !important; }
          .gco-frame-chip-emoji { font-size: 1.3rem !important; }
          .gco-emoji-grid { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)) !important; }
        }
        @media (max-width: 340px) {
          .gco-perfil-header { flex-direction: column; align-items: flex-start; }
          .gco-actions-row { flex-direction: column; align-items: stretch !important; }
          .gco-actions-row > * { width: 100%; justify-content: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="gco-frame-"] { animation: none !important; }
        }
      `}</style>

      {/* Cabecera de perfil */}
      <div
        className="gco-perfil-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.15rem',
          flexWrap: 'wrap',
        }}
      >
        <CircularAvatar
          src={avatar}
          frame={frame}
          size={AVATAR_UI}
          animClass={selectedFrameMeta?.anim}
          onClick={() => {
            soundClick()
            fileRef.current?.click()
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              fontWeight: 700,
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
            }}
          >
            {name.trim() || 'Tu perfil'}
          </p>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--gco-ink-muted)',
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            Toca la foto para cambiarla. Recomendado{' '}
            <span className="mono">
              {TARGET_PX}×{TARGET_PX}
            </span>
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onAvatar}
        />
      </div>

      {/* Marcos */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <SectionTitle>Marco del avatar</SectionTitle>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="hscroll-nav-btn"
              aria-label="Anterior"
              onClick={() => {
                soundClick()
                scrollFrames(-1)
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="hscroll-nav-btn"
              aria-label="Siguiente"
              onClick={() => {
                soundClick()
                scrollFrames(1)
              }}
            >
              ›
            </button>
          </div>
        </div>
        <div
          ref={frameScrollRef}
          className="hscroll"
          style={{
            gap: '0.65rem',
            paddingBottom: 6,
            scrollSnapType: 'x mandatory',
          }}
        >
          {FRAMES.map((f) => {
            const on = frame === f.id
            return (
              <button
                key={f.id}
                type="button"
                className="gco-frame-chip"
                onClick={() => {
                  soundClick()
                  setFrame(f.id)
                  try {
                    soundSuccess()
                  } catch {
                    /* */
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.85rem 0.55rem',
                  minWidth: 92,
                  flex: '0 0 auto',
                  scrollSnapAlign: 'start',
                  borderRadius: 16,
                  cursor: 'pointer',
                  border: on
                    ? '1.5px solid var(--gco-primary)'
                    : '1px solid var(--gco-glass-border)',
                  background: on
                    ? 'var(--gco-primary-dim)'
                    : 'var(--gco-glass-bg)',
                  color: 'inherit',
                  transform: on ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: on
                    ? '0 6px 20px var(--gco-primary-dim)'
                    : 'none',
                  transition:
                    'transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.28s ease, background 0.25s ease, border-color 0.25s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  className={f.anim}
                  style={{
                    width: 44,
                    height: 44,
                    minWidth: 44,
                    minHeight: 44,
                    aspectRatio: '1 / 1',
                    boxSizing: 'border-box',
                    ...frameRingStyle(f.id),
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'var(--gco-bg-elevated)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-emoji)',
                    }}
                    className="gco-frame-chip-emoji"
                  >
                    {f.emoji}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: on ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Datos personales */}
      <div>
        <SectionTitle>Identidad</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <input
              className="glass-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cómo quieres aparecer"
              maxLength={40}
            />
          </div>
          <div>
            <FieldLabel>Edad</FieldLabel>
            <input
              className="glass-input"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              style={{ maxWidth: 128 }}
              placeholder="—"
            />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <FieldLabel>Descripción</FieldLabel>
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--gco-ink-faint)',
                }}
              >
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              className="glass-input"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="Una línea sobre ti: enfoque, meta o estilo de entrenamiento…"
              rows={3}
              style={{
                minHeight: 88,
                resize: 'vertical',
                lineHeight: 1.45,
              }}
            />
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.72rem',
                color: 'var(--gco-ink-muted)',
                lineHeight: 1.4,
              }}
            >
              Aparece en la credencial como nota personal, no como hashtag.
            </p>
          </div>
        </div>
      </div>

      {msg && (
        <p
          style={{
            fontSize: '0.88rem',
            color: 'var(--gco-primary)',
            margin: 0,
            fontWeight: 500,
          }}
        >
          {msg}
        </p>
      )}

      {/* Acciones principales */}
      <div
        className="gco-actions-row"
        style={{
          display: 'flex',
          gap: '0.55rem',
          flexWrap: 'wrap',
        }}
      >
        <GlassButton type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar perfil'}
        </GlassButton>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setCredOpen(true)
          }}
        >
          Credencial
        </button>
        <button
          type="button"
          className="glass-button secondary"
          onClick={() => {
            soundClick()
            setEmojiOpen(true)
            try {
              const hexes = EMOJI_PREVIEW_GROUPS.flatMap((g) =>
                g.items.map((i) => i.hex)
              )
              preloadTwemojiBatch(hexes)
            } catch {
              /* */
            }
          }}
        >
          Emojis
        </button>
      </div>

      {/* ── Panel Emojis ── */}
      {emojiOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'grid',
            placeItems: 'center',
            padding: 'max(12px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(520px, 100%)',
              padding: '1.25rem 1.15rem 1.35rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxHeight: 'min(92dvh, 900px)',
              overflowY: 'auto',
              borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontWeight: 800,
                    fontSize: '1.15rem',
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Estilo de emojis
                </p>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--gco-ink-muted)',
                    margin: '8px 0 0',
                    lineHeight: 1.5,
                  }}
                >
                  Por defecto: <strong>iOS unificado</strong> en toda la app.
                  Los nombres de marca son aproximaciones: en la web no se
                  pueden instalar las fuentes oficiales de Apple o Samsung.
                  <strong> No siempre se cambian por completo</strong> según
                  el navegador y el SO.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => {
                  soundClick()
                  setEmojiOpen(false)
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: 10,
              }}
            >
              {EMOJI_ENGINES.map((eng) => {
                const on = emojiStyle === eng.id
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => applyEmojiStyle(eng.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.85rem 0.9rem',
                      borderRadius: 16,
                      border: on
                        ? '1.5px solid var(--gco-primary)'
                        : '1px solid var(--gco-glass-border)',
                      background: on
                        ? 'var(--gco-primary-dim)'
                        : 'var(--gco-glass-bg)',
                      color: 'inherit',
                      cursor: 'pointer',
                      font: 'inherit',
                      boxShadow: on
                        ? '0 8px 24px var(--gco-primary-dim)'
                        : 'none',
                      transition:
                        'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                      transform: on ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                        {eng.title}
                      </span>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: on
                            ? 'var(--gco-primary)'
                            : 'rgba(128,128,128,0.25)',
                          color: on ? '#0a0a0a' : 'var(--gco-ink-muted)',
                        }}
                      >
                        {eng.badge}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.72rem',
                        lineHeight: 1.4,
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      {eng.subtitle}
                    </p>
                  </button>
                )
              })}
            </div>

            <div>
              <p
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--gco-ink-muted)',
                  margin: '0 0 10px',
                }}
              >
                Vista previa (imágenes de respaldo)
              </p>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {EMOJI_PREVIEW_GROUPS.map((group) => (
                  <div
                    key={group.label}
                    style={{
                      padding: '0.85rem 0.9rem',
                      borderRadius: 16,
                      border: '1px solid var(--gco-glass-border)',
                      background: 'var(--gco-glass-bg)',
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--gco-ink-muted)',
                      }}
                    >
                      {group.label}
                    </p>
                    <div
                      className="gco-emoji-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fill, minmax(56px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {group.items.map((it) => (
                        <div
                          key={`${emojiStyle}-${it.hex}-${it.name}`}
                          title={it.name}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 5,
                            padding: '8px 4px',
                            borderRadius: 12,
                            background: 'rgba(0,0,0,0.22)',
                            minHeight: 64,
                            justifyContent: 'center',
                          }}
                        >
                          <EmojiPreviewGlyph item={it} style={emojiStyle} />
                          <span
                            style={{
                              fontSize: '0.58rem',
                              color: 'var(--gco-ink-muted)',
                              textAlign: 'center',
                              lineHeight: 1.2,
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {it.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <GlassButton
                type="button"
                onClick={() => {
                  soundSuccess()
                  setEmojiOpen(false)
                }}
              >
                Guardar y cerrar
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  setEmojiOpen(false)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ── Crop modal ── */}
      {cropSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(440px, 100%)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: '94dvh',
              overflowY: 'auto',
            }}
          >
            <p style={{ fontWeight: 700, margin: 0 }}>Ajustar foto</p>

            <div
              style={{
                width: PREVIEW,
                height: PREVIEW,
                maxWidth: '100%',
                aspectRatio: '1 / 1',
                margin: '0 auto',
                borderRadius: '50%',
                overflow: 'hidden',
                position: 'relative',
                border: '2px solid var(--gco-glass-border)',
                background: '#0a0a0a',
                touchAction: 'none',
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              <img
                ref={imgRef}
                src={cropSrc}
                alt=""
                onLoad={onImgLoad}
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: imgNat.w ? imgNat.w * scale : '100%',
                  height: imgNat.h ? imgNat.h * scale : 'auto',
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: '0.8rem',
              }}
            >
              <div className="glass-card" style={{ padding: '0.55rem 0.7rem' }}>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.7rem',
                  }}
                >
                  Original
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {imgNat.w || '—'}×{imgNat.h || '—'}
                </p>
              </div>
              <div className="glass-card" style={{ padding: '0.55rem 0.7rem' }}>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--gco-ink-muted)',
                    fontSize: '0.7rem',
                  }}
                >
                  Salida
                </p>
                <p className="mono" style={{ margin: 0, fontWeight: 600 }}>
                  {outSize}×{outSize}
                </p>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gco-ink-muted)',
                  marginBottom: 8,
                }}
              >
                Mover imagen
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 44px 44px',
                  gridTemplateRows: '44px 44px 44px',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                <span />
                <PadBtn label="↑" onClick={() => nudge(0, STEP)} />
                <span />
                <PadBtn label="←" onClick={() => nudge(STEP, 0)} />
                <PadBtn label="·" onClick={() => setOffset({ x: 0, y: 0 })} />
                <PadBtn label="→" onClick={() => nudge(-STEP, 0)} />
                <span />
                <PadBtn label="↓" onClick={() => nudge(0, -STEP)} />
                <span />
              </div>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                <span>Zoom</span>
                <span className="mono">{scale.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.02}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="pref-slider"
                style={
                  {
                    width: '100%',
                    '--fill': `${((scale - 0.3) / (3 - 0.3)) * 100}%`,
                  } as React.CSSProperties
                }
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  fontSize: '0.78rem',
                  color: 'var(--gco-ink-muted)',
                }}
              >
                <span>Tamaño de salida</span>
                <span className="mono">{outSize}px</span>
              </div>
              <input
                type="range"
                min={128}
                max={1024}
                step={16}
                value={outSize}
                onChange={(e) => setOutSize(parseInt(e.target.value, 10))}
                className="pref-slider"
                style={
                  {
                    width: '100%',
                    '--fill': `${((outSize - 128) / (1024 - 128)) * 100}%`,
                  } as React.CSSProperties
                }
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                onClick={autoResize}
                style={{ fontSize: '0.82rem' }}
              >
                Autoajustar
              </button>
              <GlassButton type="button" onClick={applyCrop}>
                Usar foto
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  if (cropSrc) URL.revokeObjectURL(cropSrc)
                  setCropSrc(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Opciones de credencial ── */}
      {credOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'var(--gco-overlay)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(460px, 100%)',
              padding: '1.35rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxHeight: '92dvh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.08rem',
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Credencial
                </p>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--gco-ink-muted)',
                    margin: '6px 0 0',
                    lineHeight: 1.4,
                  }}
                >
                  Configura el diseño y previsualiza antes de guardar.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => {
                  soundClick()
                  setCredOpen(false)
                }}
                style={{ width: 36, height: 36 }}
              >
                ✕
              </button>
            </div>

            <div>
              <SectionTitle>Apariencia</SectionTitle>
              <div className="segmented" style={{ width: '100%' }}>
                {(
                  [
                    { id: 'dark' as const, label: 'Oscuro' },
                    { id: 'light' as const, label: 'Claro' },
                    { id: 'rainbow' as const, label: 'Arcoíris' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={credTheme === t.id ? 'active' : ''}
                    onClick={() => {
                      soundClick()
                      setCredTheme(t.id)
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '0.35rem 0',
              }}
            >
              <SectionTitle>Privacidad y detalles</SectionTitle>
              <SwitchRow
                label="Ocultar edad"
                checked={hideAge}
                onChange={setHideAge}
              />
              <SwitchRow
                label="Mostrar marco del avatar"
                checked={showFrameOnCred}
                onChange={setShowFrameOnCred}
              />
              <SwitchRow
                label="Incluir descripción"
                checked={showBioOnCred}
                onChange={setShowBioOnCred}
                hint={
                  bio.trim()
                    ? undefined
                    : 'Escribe una descripción en el perfil para usarla aquí'
                }
              />
            </div>

            <div>
              <SectionTitle>Favoritos (opcional)</SectionTitle>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <SwitchRow
                  label="Juego favorito"
                  checked={showGame}
                  onChange={setShowGame}
                />
                {showGame && (
                  <select
                    className="glass-input"
                    value={favGame}
                    onChange={(e) => setFavGame(e.target.value)}
                  >
                    {GAMES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                )}

                <SwitchRow
                  label="Libro favorito"
                  checked={showBook}
                  onChange={setShowBook}
                />
                {showBook && (
                  <select
                    className="glass-input"
                    value={favBook}
                    onChange={(e) => setFavBook(e.target.value)}
                  >
                    <option value="">Elegir libro</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                )}

                <SwitchRow
                  label="Canción favorita"
                  checked={showTrack}
                  onChange={setShowTrack}
                />
                {showTrack && (
                  <select
                    className="glass-input"
                    value={favTrack}
                    onChange={(e) => setFavTrack(e.target.value)}
                  >
                    <option value="">Elegir canción</option>
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                paddingTop: 4,
              }}
            >
              <GlassButton
                type="button"
                onClick={() => void openCredentialViewer()}
                disabled={previewBusy}
              >
                {previewBusy ? 'Generando…' : 'Ver credencial'}
              </GlassButton>
              <button
                type="button"
                className="glass-button secondary"
                disabled={credBusy}
                onClick={() => void doDownload()}
              >
                {credBusy ? 'Descargando…' : 'Descargar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visor de credencial ── */}
      {credViewOpen && credPreviewUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 210,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding:
              'max(12px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '1rem',
                fontFamily: 'var(--font-display)',
                color: '#fff',
              }}
            >
              Vista previa
            </p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={closeViewer}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1rem',
                display: 'grid',
                placeItems: 'center',
                backdropFilter: 'blur(8px)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              width: 'min(520px, 100%)',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.12)',
              background: '#0a0a0a',
              maxHeight: 'min(70dvh, 420px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={credPreviewUrl}
              alt="Credencial de progreso"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                maxHeight: 'min(70dvh, 420px)',
                objectFit: 'contain',
              }}
            />
          </div>

          <div
            style={{
              width: 'min(520px, 100%)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <GlassButton
              type="button"
              onClick={() => void doDownload()}
              disabled={credBusy}
            > 
              {credBusy ? 'Descargando…' : 'Descargar'}
            </GlassButton>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setCredViewOpen(false)
                setCredOpen(true)
              }}
            >
              Ajustar opciones
            </button>
            <button
              type="button"
              className="glass-button ghost"
              onClick={closeViewer}
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}