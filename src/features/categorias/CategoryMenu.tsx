import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { ModeSwitch } from '@/components/ui/ModeSwitch'
import { getProfile } from '../../core/storage/userProfile'
import { soundClick } from '@/core/audio/uiSounds'

const CATEGORIES = [
  {
    id: 'memoria',
    title: 'Memoria',
    emoji: '🧠',
    desc: 'Cartas, secuencias, asociaciones',
  },
  {
    id: 'logica',
    title: 'Lógica',
    emoji: '🧩',
    desc: 'Patrones, razonamiento, puzzles',
  },
  {
    id: 'deduccion',
    title: 'Deducción',
    emoji: '🔍',
    desc: 'Inferencias y pistas',
  },
  {
    id: 'lectura',
    title: 'Lectura',
    emoji: '📖',
    desc: 'Comprensión y velocidad',
  },
  {
    id: 'conocimiento',
    title: 'Conocimiento',
    emoji: '🌍',
    desc: 'Cultura general y datos',
  },
  {
    id: 'matematicas',
    title: 'Matemáticas',
    emoji: '🔢',
    desc: 'Cálculo, Sudoku y más',
  },
] as const

const PARTICLES: {
  left: string
  top: string
  size: number
  color: string
  delay: string
  dur: string
}[] = [
  { left: '6%', top: '18%', size: 3, color: '#ff3b3b', delay: '0s', dur: '2.4s' },
  { left: '12%', top: '72%', size: 2, color: '#ffffff', delay: '0.3s', dur: '3.1s' },
  { left: '18%', top: '40%', size: 2.5, color: '#4da3ff', delay: '0.6s', dur: '2.8s' },
  { left: '24%', top: '22%', size: 2, color: '#ff5a5a', delay: '0.2s', dur: '3.4s' },
  { left: '30%', top: '78%', size: 3, color: '#6ec8ff', delay: '0.9s', dur: '2.6s' },
  { left: '38%', top: '14%', size: 2, color: '#ffffff', delay: '0.4s', dur: '3.2s' },
  { left: '44%', top: '68%', size: 2.5, color: '#ff2d2d', delay: '1.1s', dur: '2.9s' },
  { left: '52%', top: '28%', size: 3, color: '#5eb8ff', delay: '0.1s', dur: '3.0s' },
  { left: '58%', top: '80%', size: 2, color: '#ffffff', delay: '0.7s', dur: '2.5s' },
  { left: '64%', top: '20%', size: 2.5, color: '#ff4444', delay: '0.5s', dur: '3.3s' },
  { left: '70%', top: '55%', size: 3, color: '#7ad0ff', delay: '0.8s', dur: '2.7s' },
  { left: '76%', top: '35%', size: 2, color: '#ffffff', delay: '1.2s', dur: '3.1s' },
  { left: '82%', top: '70%', size: 2.5, color: '#ff3b3b', delay: '0.35s', dur: '2.8s' },
  { left: '88%', top: '25%', size: 3, color: '#4da3ff', delay: '0.95s', dur: '3.4s' },
  { left: '92%', top: '60%', size: 2, color: '#ffffff', delay: '0.15s', dur: '2.6s' },
  { left: '8%', top: '50%', size: 1.5, color: '#ff6b6b', delay: '1.4s', dur: '3.0s' },
  { left: '48%', top: '48%', size: 1.5, color: '#a8d8ff', delay: '0.55s', dur: '2.9s' },
  { left: '95%', top: '42%', size: 2, color: '#ff2a2a', delay: '1.0s', dur: '3.2s' },
  { left: '15%', top: '12%', size: 1.5, color: '#ffffff', delay: '0.75s', dur: '2.4s' },
  { left: '85%', top: '85%', size: 2, color: '#5eb8ff', delay: '1.3s', dur: '2.7s' },
]

/* ═══════════════════════════════════════════════════════════════════════════
 * PRECARGA GLOBAL PWA — una sola vez por pestaña, viva en TODAS las rutas
 * (GymCog, Nutrición, Música, Games, Ajustes, BookReader, etc.)
 *
 * Se engancha a window/document:
 *  - window.gcoTts          API TTS compartida
 *  - window.__gcoEmojiObs   MutationObserver de Twemoji en todo el body
 *  - sessionStorage flags   evita trabajo duplicado
 *  - eventos CustomEvent    para que otras pantallas reaccionen
 *
 * Edge Win10 · Android 8 (Redmi 2018) · iOS · Linux · Win11
 * ========================================================================= */

const PRELOAD_BOOT_KEY = 'gco:pwa-preload-boot-v5'
const GLOBAL_MARK = '__gcoPwaPreloadActive'
const EMOJI_STYLE_KEY = 'gco:emoji-style'
export type EmojiStylePref =
  | 'ios'
  | 'ios-modern'
  | 'samsung'
  | 'facebook'
  | 'google'
  | 'twitter'
  | 'system'
  | 'off'

/** Estilos que usan sustitución por imágenes Twemoji en TODA la app */
function usesTwemoji(style: EmojiStylePref): boolean {
  return (
    style === 'ios' ||
    style === 'ios-modern' ||
    style === 'facebook' ||
    style === 'twitter' ||
    style === 'google'
  )
}

function getEmojiStyle(): EmojiStylePref {
  try {
    const v = localStorage.getItem(EMOJI_STYLE_KEY)
    if (
      v === 'system' ||
      v === 'off' ||
      v === 'ios' ||
      v === 'ios-modern' ||
      v === 'samsung' ||
      v === 'facebook' ||
      v === 'google' ||
      v === 'twitter'
    )
      return v as EmojiStylePref
  } catch {
    /* */
  }
  return 'ios'
}

/**
 * Restaura texto desde <img class="emoji|gco-emoji"> (Twemoji)
 * para poder volver a nativo o re-parsear.
 */
function stripTwemojiImages(root?: ParentNode | null) {
  if (typeof document === 'undefined') return
  const el =
    (root instanceof HTMLElement ? root : null) ||
    (document.getElementById('root') as HTMLElement | null) ||
    document.body
  if (!el) return
  const imgs = el.querySelectorAll('img.emoji, img.gco-emoji, img.gco-twemoji')
  imgs.forEach((img) => {
    const alt = (img.getAttribute('alt') || '').trim()
    if (!alt) {
      img.remove()
      return
    }
    const text = document.createTextNode(alt)
    img.parentNode?.replaceChild(text, img)
  })
}

/**
 * Aplica el estilo de emoji a TODO el documento (todas las rutas SPA).
 * Llamar al cambiar preferencia y al montar páginas.
 */
function applyEmojiStyleGlobally(style?: EmojiStylePref) {
  const s = style ?? getEmojiStyle()
  try {
    document.documentElement.setAttribute('data-gco-emoji', s)
  } catch {
    /* */
  }

  // 1) Quitar imgs Twemoji previas (evita mezcla / permite volver a nativo)
  try {
    stripTwemojiImages(document.body)
  } catch {
    /* */
  }

  // 2) Si el estilo pide imágenes unificadas, re-parsear todo el DOM
  if (usesTwemoji(s)) {
    try {
      parseTwemojiRoot(document.body)
    } catch {
      /* */
    }
    // Pasadas extra por si React re-renderiza justo después
    ;[80, 320, 900].forEach((ms) => {
      window.setTimeout(() => {
        if (usesTwemoji(getEmojiStyle())) {
          try {
            parseTwemojiRoot(document.body)
          } catch {
            /* */
          }
        }
      }, ms)
    })
  }
}

function setEmojiStyle(style: EmojiStylePref) {
  try {
    localStorage.setItem(EMOJI_STYLE_KEY, style)
  } catch {
    /* */
  }
  applyEmojiStyleGlobally(style)
  window.dispatchEvent(new CustomEvent('gco:emoji-style', { detail: style }))
}

if (typeof window !== 'undefined') {
  window.gcoSetEmojiStyle = setEmojiStyle
  window.gcoGetEmojiStyle = getEmojiStyle
  ;(window as unknown as { gcoApplyEmojiStyle?: typeof applyEmojiStyleGlobally }).gcoApplyEmojiStyle =
    applyEmojiStyleGlobally
}



declare global {
  interface Window {
    twemoji?: {
      parse: (
        node: HTMLElement | string,
        opts?: Record<string, unknown>
      ) => void
    }
    gcoTts?: GcoTtsApi
    gcoSetEmojiStyle?: (style: EmojiStylePref) => void
    gcoGetEmojiStyle?: () => EmojiStylePref
    [GLOBAL_MARK]?: boolean
    __gcoEmojiObs?: MutationObserver
    __gcoTtsVoicesCache?: SpeechSynthesisVoice[]
  }
}

type GcoTtsApi = {
  getVoices: () => SpeechSynthesisVoice[]
  pickVoice: (langPref?: string) => SpeechSynthesisVoice | null
  speak: (text: string, opts?: { lang?: string; rate?: number; pitch?: number }) => void
  cancel: () => void
  ready: Promise<SpeechSynthesisVoice[]>
  listMeta: () => FallbackVoiceMeta[]
}

type FallbackVoiceMeta = {
  name: string
  lang: string
  gender?: 'female' | 'male' | 'neutral'
  uri: string
  legacyHint?: boolean
  /** Nombres alternativos que Edge/Android suelen exponer */
  aliases?: string[]
}

/** Catálogo amplio ES/EN + regionales + legacy (Win10 Edge, Android Google TTS). */
const FALLBACK_VOICES: FallbackVoiceMeta[] = [
  // Español
  {
    name: 'Microsoft Helena - Spanish (Spain)',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-helena',
    legacyHint: true,
    aliases: ['Helena', 'Microsoft Helena'],
  },
  {
    name: 'Microsoft Pablo - Spanish (Spain)',
    lang: 'es-ES',
    gender: 'male',
    uri: 'gco-fb:es-ES-pablo',
    legacyHint: true,
    aliases: ['Pablo', 'Microsoft Pablo'],
  },
  {
    name: 'Microsoft Laura - Spanish (Spain)',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-laura',
    legacyHint: true,
    aliases: ['Laura'],
  },
  {
    name: 'Microsoft Sabina - Spanish (Mexico)',
    lang: 'es-MX',
    gender: 'female',
    uri: 'gco-fb:es-MX-sabina',
    legacyHint: true,
    aliases: ['Sabina'],
  },
  {
    name: 'Microsoft Raul - Spanish (Mexico)',
    lang: 'es-MX',
    gender: 'male',
    uri: 'gco-fb:es-MX-raul',
    legacyHint: true,
    aliases: ['Raul', 'Raúl'],
  },
  {
    name: 'Google español',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-google',
    aliases: ['Google español', 'español'],
  },
  {
    name: 'Google español de Estados Unidos',
    lang: 'es-US',
    gender: 'female',
    uri: 'gco-fb:es-US-google',
    aliases: ['Google español de Estados Unidos'],
  },
  {
    name: 'español España',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-android',
    legacyHint: true,
    aliases: ['es-es-x-eee-local', 'es-es-x-eee-network'],
  },
  {
    name: 'español Estados Unidos',
    lang: 'es-US',
    gender: 'female',
    uri: 'gco-fb:es-US-android',
    legacyHint: true,
  },
  {
    name: 'español México',
    lang: 'es-MX',
    gender: 'female',
    uri: 'gco-fb:es-MX-android',
    legacyHint: true,
  },
  {
    name: 'español Argentina',
    lang: 'es-AR',
    gender: 'female',
    uri: 'gco-fb:es-AR',
  },
  {
    name: 'español Colombia',
    lang: 'es-CO',
    gender: 'female',
    uri: 'gco-fb:es-CO',
  },
  {
    name: 'español Chile',
    lang: 'es-CL',
    gender: 'female',
    uri: 'gco-fb:es-CL',
  },
  {
    name: 'español Perú',
    lang: 'es-PE',
    gender: 'female',
    uri: 'gco-fb:es-PE',
  },
  {
    name: 'español Venezuela',
    lang: 'es-VE',
    gender: 'female',
    uri: 'gco-fb:es-VE',
  },
  {
    name: 'español neutro (mujer)',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-neutral-f',
  },
  {
    name: 'español neutro (hombre)',
    lang: 'es-ES',
    gender: 'male',
    uri: 'gco-fb:es-ES-neutral-m',
  },
  {
    name: 'Samsung español',
    lang: 'es-ES',
    gender: 'female',
    uri: 'gco-fb:es-ES-samsung',
    legacyHint: true,
  },
  // Inglés
  {
    name: 'Microsoft Zira - English (United States)',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-zira',
    legacyHint: true,
    aliases: ['Zira', 'Microsoft Zira'],
  },
  {
    name: 'Microsoft David - English (United States)',
    lang: 'en-US',
    gender: 'male',
    uri: 'gco-fb:en-US-david',
    legacyHint: true,
    aliases: ['David', 'Microsoft David'],
  },
  {
    name: 'Microsoft Mark - English (United States)',
    lang: 'en-US',
    gender: 'male',
    uri: 'gco-fb:en-US-mark',
    legacyHint: true,
    aliases: ['Mark'],
  },
  {
    name: 'Microsoft Susan - English (United States)',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-susan',
    legacyHint: true,
    aliases: ['Susan'],
  },
  {
    name: 'Microsoft Hazel - English (Great Britain)',
    lang: 'en-GB',
    gender: 'female',
    uri: 'gco-fb:en-GB-hazel',
    legacyHint: true,
    aliases: ['Hazel'],
  },
  {
    name: 'Microsoft George - English (Great Britain)',
    lang: 'en-GB',
    gender: 'male',
    uri: 'gco-fb:en-GB-george',
    legacyHint: true,
    aliases: ['George'],
  },
  {
    name: 'Google US English',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-google',
    aliases: ['Google US English'],
  },
  {
    name: 'Google UK English Female',
    lang: 'en-GB',
    gender: 'female',
    uri: 'gco-fb:en-GB-google-f',
  },
  {
    name: 'Google UK English Male',
    lang: 'en-GB',
    gender: 'male',
    uri: 'gco-fb:en-GB-google-m',
  },
  {
    name: 'English United States',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-android',
    legacyHint: true,
  },
  {
    name: 'English United Kingdom',
    lang: 'en-GB',
    gender: 'female',
    uri: 'gco-fb:en-GB-android',
    legacyHint: true,
  },
  {
    name: 'English (Australia)',
    lang: 'en-AU',
    gender: 'female',
    uri: 'gco-fb:en-AU',
  },
  {
    name: 'English (India)',
    lang: 'en-IN',
    gender: 'female',
    uri: 'gco-fb:en-IN',
  },
  {
    name: 'English (Canada)',
    lang: 'en-CA',
    gender: 'female',
    uri: 'gco-fb:en-CA',
  },
  {
    name: 'English (Ireland)',
    lang: 'en-IE',
    gender: 'female',
    uri: 'gco-fb:en-IE',
  },
  {
    name: 'English (South Africa)',
    lang: 'en-ZA',
    gender: 'female',
    uri: 'gco-fb:en-ZA',
  },
  {
    name: 'Apple Samantha',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-samantha',
  },
  {
    name: 'Apple Daniel',
    lang: 'en-GB',
    gender: 'male',
    uri: 'gco-fb:en-GB-daniel',
  },
  {
    name: 'Samsung English',
    lang: 'en-US',
    gender: 'female',
    uri: 'gco-fb:en-US-samsung',
    legacyHint: true,
  },
  // Otros idiomas frecuentes en móviles
  { name: 'Português Brasil', lang: 'pt-BR', gender: 'female', uri: 'gco-fb:pt-BR' },
  { name: 'Português Portugal', lang: 'pt-PT', gender: 'female', uri: 'gco-fb:pt-PT' },
  { name: 'Français', lang: 'fr-FR', gender: 'female', uri: 'gco-fb:fr-FR' },
  { name: 'Deutsch', lang: 'de-DE', gender: 'female', uri: 'gco-fb:de-DE' },
  { name: 'Italiano', lang: 'it-IT', gender: 'female', uri: 'gco-fb:it-IT' },
  { name: 'Nederlands', lang: 'nl-NL', gender: 'female', uri: 'gco-fb:nl-NL' },
  { name: 'Polski', lang: 'pl-PL', gender: 'female', uri: 'gco-fb:pl-PL' },
  { name: 'Русский', lang: 'ru-RU', gender: 'female', uri: 'gco-fb:ru-RU' },
  { name: '日本語', lang: 'ja-JP', gender: 'female', uri: 'gco-fb:ja-JP' },
  { name: '中文', lang: 'zh-CN', gender: 'female', uri: 'gco-fb:zh-CN' },
  { name: '한국어', lang: 'ko-KR', gender: 'female', uri: 'gco-fb:ko-KR' },
  { name: 'العربية', lang: 'ar-SA', gender: 'female', uri: 'gco-fb:ar-SA' },
  { name: 'हिन्दी', lang: 'hi-IN', gender: 'female', uri: 'gco-fb:hi-IN' },
]

const VOICE_NAME_PREFS_ES = [
  'helena',
  'sabina',
  'laura',
  'pablo',
  'raul',
  'google español',
  'español',
  'spanish',
]
const VOICE_NAME_PREFS_EN = [
  'zira',
  'susan',
  'hazel',
  'samantha',
  'david',
  'mark',
  'george',
  'daniel',
  'google us english',
  'google uk english',
  'english',
]

/** CDN Twemoji (fork mantenido jdecked) + mirrors */
const TWEMOJI_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js',
  'https://cdn.jsdelivr.net/npm/@twemoji/api@14.1.2/dist/twemoji.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/twemoji.min.js',
]
const TWEMOJI_BASES = [
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/',
  'https://cdn.jsdelivr.net/gh/jdecked/twemoji@14.1.2/assets/',
  'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/',
]

/**
 * Code points prioritarios para precarga de imágenes (Unicode 12–15 + app).
 * Incluye cuervo ZWJ, piedra, gestos recientes, UI, modos de la app.
 */
const TWEMOJI_PRIORITY_HEX = [
  // App / UI
  '1f34e', // 🍎
  '1f9e0', // 🧠
  '1f3b5', // 🎵
  '1f4d6', // 📖
  '1f30d', // 🌍
  '1f522', // 🔢
  '1f9e9', // 🧩
  '1f50d', // 🔍
  '2705', // ✅
  '274c', // ❌
  '26a0', // ⚠
  '2139', // ℹ
  '1f512', // 🔒
  '1f513', // 🔓
  '2b50', // ⭐
  '2728', // ✨
  '25b6', // ▶
  '23f8', // ⏸
  '23f9', // ⏹
  '23ed', // ⏭
  '23ee', // ⏮
  '1f500', // 🔀
  '1f501', // 🔁
  '1f50a', // 🔊
  '1f507', // 🔇
  // Unicode 13–15 animales / objetos
  '1faa8', // 🪨
  '1fab6', // 🪶
  '1f426-200d-2b1b', // 🐦‍⬛
  '1f9a4', // 🦤
  '1f9ac', // 🦬
  '1f9a3', // 🦣
  '1f9ab', // 🦫
  '1f9a6', // 🦦
  '1f9a5', // 🦥
  '1f9a8', // 🦨
  '1f9a9', // 🦩
  '1f9aa', // 🦪
  '1f98a', // 🦊
  '1f99d', // 🦝
  '1f9a1', // 🦡
  '1f998', // 🦘
  '1f992', // 🦒
  '1f994', // 🦔
  '1f987', // 🦇
  '1f983', // 🦃
  '1f985', // 🦅
  '1f986', // 🦆
  '1f989', // 🦉
  '1f438', // 🐸
  '1f98e', // 🦎
  '1f98b', // 🦋
  '1f40c', // 🐌
  '1f41b', // 🐛
  '1f41c', // 🐜
  '1f41d', // 🐝
  '1fab2', // 🪲
  '1f41e', // 🐞
  '1f997', // 🦗
  '1f577', // 🕷
  '1f578', // 🕸
  '1f982', // 🦂
  '1f99f', // 🦟
  '1fab0', // 🪰
  '1fab1', // 🪱
  // Gestos / caras recientes
  '1fae0', // 🫠
  '1fae1', // 🫡
  '1fae5', // 🫥
  '1fae4', // 🫤
  '1f979', // 🥹
  '1fae3', // 🫣
  '1fae2', // 🫢
  '1faf1', // 🫱
  '1faf2', // 🫲
  '1faf3', // 🫳
  '1faf4', // 🫴
  '1faf5', // 🫵
  '1faf6', // 🫶
  '1fac0', // 🫀
  '1fac1', // 🫁
  '1fac2', // 🫂
  '1f9cc', // 🧌
  '1f9dc', // 🧜
  '1f9da', // 🧚
  '1f9de', // 🧞
  // Objetos tech / casa
  '1fae7', // 🫧
  '1fa9e', // 🪞
  '1fa9f', // 🪟
  '1faa4', // 🪤
  '1fa99', // 🪙
  '1fa93', // 🪓
  '1fa84', // 🪄
  '1f9ff', // 🧿
  '1faac', // 🪬
  '1faaa', // 🪪
  '1faab', // 🪫
  '1f6f0', // 🛰
  '1fa90', // 🪐
  '1f4bb', // 💻
  '1f5a5', // 🖥
  '1f5a8', // 🖨
  '2328', // ⌨
  '1f5b1', // 🖱
  '1f579', // 🕹
  '1f4be', // 💾
  '1f4bf', // 💿
  '1f4f1', // 📱
  '1f4f2', // 📲
  // Caras clásicas (cobertura legacy)
  '1f600',
  '1f603',
  '1f604',
  '1f601',
  '1f606',
  '1f605',
  '1f923',
  '1f602',
  '1f642',
  '1f643',
  '1f609',
  '1f60a',
  '1f607',
  '1f970',
  '1f60d',
  '1f929',
  '1f618',
  '1f617',
  '263a',
  '1f61a',
  '1f619',
  '1f972',
  '1f60b',
  '1f61b',
  '1f61c',
  '1f92a',
  '1f61d',
  '1f911',
  '1f917',
  '1f92d',
  '1f92b',
  '1f914',
  '1f910',
  '1f928',
  '1f610',
  '1f611',
  '1f636',
  '1f60f',
  '1f612',
  '1f644',
  '1f62c',
  '1f925',
  '1f60c',
  '1f614',
  '1f62a',
  '1f924',
  '1f634',
  '1f637',
  '1f912',
  '1f915',
  '1f922',
  '1f92e',
  '1f927',
  '1f975',
  '1f976',
  '1f974',
  '1f635',
  '1f92f',
  '1f920',
  '1f973',
  '1f978',
  '1f60e',
  '1f913',
  '1f9d0',
  // Manos / cuerpo
  '1f44b',
  '1f91a',
  '1f590',
  '270b',
  '1f596',
  '1f44c',
  '1f90c',
  '1f90f',
  '270c',
  '1f91e',
  '1f91f',
  '1f918',
  '1f919',
  '1f448',
  '1f449',
  '1f446',
  '1f595',
  '1f447',
  '261d',
  '1f44d',
  '1f44e',
  '270a',
  '1f44a',
  '1f91b',
  '1f91c',
  '1f44f',
  '1f64c',
  '1f450',
  '1f932',
  '1f91d',
  '1f64f',
  '1f4aa',
  '1f9be',
  '1f9bf',
  '1f9b5',
  '1f9b6',
  '1f442',
  '1f9bb',
  '1f443',
  '1f9b7',
  '1f9b4',
  '1f440',
  '1f441',
  '1f445',
  '1f444',
  // Naturaleza / clima
  '1f335',
  '1f384',
  '1f332',
  '1f333',
  '1f334',
  '1fab5',
  '1f331',
  '1f33f',
  '2618',
  '1f340',
  '1f38d',
  '1fab4',
  '1f343',
  '1f342',
  '1f341',
  '1f344',
  '1f31e',
  '1f31d',
  '1f31b',
  '1f31c',
  '1f31a',
  '1f315',
  '1f316',
  '1f317',
  '1f318',
  '1f311',
  '1f312',
  '1f313',
  '1f314',
  '2b50',
  '1f31f',
  '2728',
  '26a1',
  '1f525',
  '1f4a7',
  '1f30a',
  '1f308',
  '2601',
  '26c5',
  '1f327',
  '26c8',
  '1f329',
  '2744',
  '2603',
  '26c4',
  // Corazones / música / libros
  '2764',
  '1f9e1',
  '1f49b',
  '1f49a',
  '1f499',
  '1f49c',
  '1f5a4',
  '1f90d',
  '1f90e',
  '1f494',
  '2763',
  '1f495',
  '1f49e',
  '1f493',
  '1f497',
  '1f496',
  '1f498',
  '1f49d',
  '1f3b5',
  '1f3b6',
  '1f3a4',
  '1f3a7',
  '1f3b8',
  '1f3b9',
  '1f941',
  '1f3ba',
  '1f3b7',
  '1f3bb',
  '1fa95',
  '1f4da',
  '1f4d6',
  '1f4dd',
  '270f',
  '2712',
  '1f58a',
  '1f58b',
  '1f58c',
  '1f58d',
  '1f3c6',
  '1f947',
  '1f948',
  '1f949',
  '1f3c5',
  '1f396',
  '1f397',
  '1f3ab',
  '1f39f',
]

const FONT_STYLESHEETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap',
]

function runWhenIdle(fn: () => void, timeoutMs = 2200) {
  if (typeof window === 'undefined') return
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fn, { timeout: timeoutMs })
  } else {
    window.setTimeout(fn, 60)
  }
}

function injectLinkOnce(rel: string, href: string, attrs?: Record<string, string>) {
  if (typeof document === 'undefined') return
  const key = `${rel}:${href}`
  if (document.querySelector(`link[data-gco-link="${key}"]`)) return
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  link.setAttribute('data-gco-link', key)
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v))
  }
  document.head.appendChild(link)
}

function injectGlobalEmojiCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById('gco-pwa-emoji-css')) return
  const style = document.createElement('style')
  style.id = 'gco-pwa-emoji-css'
  style.textContent = `
    @font-face {
      font-family: 'Noto Color Emoji';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src:
        url('https://cdn.jsdelivr.net/npm/@infolektuell/noto-color-emoji@0.2.0/dist/NotoColorEmoji-Regular.woff2') format('woff2'),
        url('https://cdn.jsdelivr.net/fontsource/fonts/noto-color-emoji@5.2.7/emoji-400-normal.woff2') format('woff2');
    }
    @font-face {
      font-family: 'GcoEmojiStack';
      src:
        local('Segoe UI Emoji'),
        local('Segoe UI Symbol'),
        local('Apple Color Emoji'),
        local('Noto Color Emoji'),
        local('Android Emoji'),
        local('Twemoji Mozilla'),
        local('EmojiOne Color');
      unicode-range: U+1F300-1FAFF, U+2600-27BF, U+FE00-FE0F, U+200D, U+20E3, U+E0020-E007F;
      font-display: swap;
    }
    img.emoji, img.gco-emoji {
      height: 1.15em !important;
      width: 1.15em !important;
      margin: 0 0.05em 0 0.1em !important;
      vertical-align: -0.15em !important;
      display: inline-block !important;
      border: 0 !important;
      box-shadow: none !important;
    }
    html, body, #root, .app-shell, .app-layout, .app-main {
      font-family:
        system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
        'Noto Sans', 'Noto Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
        'Apple Color Emoji', 'Android Emoji', 'GcoEmojiStack', sans-serif;
    }
  `
  document.head.appendChild(style)
}

function injectAllStylesheets() {
  ;[
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
  ].forEach((o) => {
    injectLinkOnce('preconnect', o, { crossorigin: 'anonymous' })
    injectLinkOnce('dns-prefetch', o)
  })

  FONT_STYLESHEETS.forEach((href) => injectLinkOnce('stylesheet', href, { media: 'all' }))

  injectLinkOnce(
    'preload',
    'https://cdn.jsdelivr.net/npm/@infolektuell/noto-color-emoji@0.2.0/dist/NotoColorEmoji-Regular.woff2',
    { as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }
  )
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'))
      return
    }
    if (document.querySelector(`script[data-gco-src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.crossOrigin = 'anonymous'
    s.setAttribute('data-gco-src', src)
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('fail ' + src))
    document.head.appendChild(s)
  })
}

async function loadTwemojiScript(): Promise<boolean> {
  for (const src of TWEMOJI_SCRIPTS) {
    try {
      await loadScript(src)
      if (window.twemoji && typeof window.twemoji.parse === 'function') return true
    } catch {
      /* siguiente mirror */
    }
  }
  return false
}

function parseTwemojiRoot(root?: ParentNode | null) {
  if (!usesTwemoji(getEmojiStyle())) return
  const tw = window.twemoji
  if (!tw || typeof tw.parse !== 'function') return
  const el =
    (root instanceof HTMLElement ? root : null) ||
    (document.getElementById('root') as HTMLElement | null) ||
    document.body
  if (!el) return

  for (const base of TWEMOJI_BASES) {
    try {
      tw.parse(el, {
        base,
        folder: 'svg',
        ext: '.svg',
        className: 'emoji gco-emoji',
      })
      return
    } catch {
      /* */
    }
    try {
      tw.parse(el, {
        base,
        folder: '72x72',
        ext: '.png',
        className: 'emoji gco-emoji',
      })
      return
    } catch {
      /* */
    }
  }
}

/** Precarga de SVGs prioritarios en caché del navegador (todas las páginas). */
function preloadTwemojiAssets() {
  if (typeof document === 'undefined') return
  const base = TWEMOJI_BASES[0]
  const head = document.head
  // Limitar concurrentes para no saturar Redmi 2018
  const batch = TWEMOJI_PRIORITY_HEX.slice(0, 120)
  batch.forEach((hex, i) => {
    window.setTimeout(() => {
      const href = `${base}svg/${hex}.svg`
      if (document.querySelector(`link[data-gco-tw="${hex}"]`)) return
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = href
      link.setAttribute('data-gco-tw', hex)
      head.appendChild(link)
      // Decode silencioso
      const img = new Image()
      img.decoding = 'async'
      img.src = href
    }, Math.min(i * 12, 4000))
  })
}

function ensureEmojiObserver() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  if (window.__gcoEmojiObs) return

  let scheduled = false
  const obs = new MutationObserver(() => {
    if (!usesTwemoji(getEmojiStyle())) return
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      parseTwemojiRoot(document.body)
    })
  })
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  window.__gcoEmojiObs = obs
}

async function setupGlobalEmoji() {
  injectGlobalEmojiCss()
  injectAllStylesheets()
  const ok = await loadTwemojiScript()
  parseTwemojiRoot(document.body)
  ensureEmojiObserver()
  if (ok) {
    runWhenIdle(() => preloadTwemojiAssets(), 1500)
  }
  // Pasadas extra (navegación SPA + fuentes tardías)
  ;[400, 1200, 3000, 6000].forEach((ms) => {
    window.setTimeout(() => parseTwemojiRoot(document.body), ms)
  })
  window.dispatchEvent(new CustomEvent('gco:emoji-ready', { detail: { twemoji: ok } }))
}

function persistVoices(list: SpeechSynthesisVoice[]) {
  window.__gcoTtsVoicesCache = list
  try {
    const slim = list.map((v) => ({
      name: v.name,
      lang: v.lang,
      default: !!v.default,
      localService: !!v.localService,
      voiceURI: v.voiceURI,
    }))
    sessionStorage.setItem('gco:tts-native-voices', JSON.stringify(slim))
    localStorage.setItem('gco:tts-native-voices-last', JSON.stringify(slim))
    localStorage.setItem('gco:tts-fallback-voices', JSON.stringify(FALLBACK_VOICES))
    sessionStorage.setItem('gco:tts-fallback-voices', JSON.stringify(FALLBACK_VOICES))
    window.dispatchEvent(new CustomEvent('gco:tts-voices-ready', { detail: list }))
  } catch {
    /* */
  }
}

function scoreVoice(v: SpeechSynthesisVoice, langPref: string): number {
  let s = 0
  const lang = (v.lang || '').toLowerCase()
  const name = (v.name || '').toLowerCase()
  const pref = langPref.toLowerCase()
  const pref2 = pref.slice(0, 2)

  if (lang === pref) s += 50
  else if (lang.startsWith(pref2)) s += 30
  else return -1

  if (v.localService) s += 15
  if (v.default) s += 5

  const prefs = pref2 === 'es' ? VOICE_NAME_PREFS_ES : VOICE_NAME_PREFS_EN
  prefs.forEach((p, i) => {
    if (name.includes(p)) s += 24 - i
  })

  FALLBACK_VOICES.forEach((meta) => {
    if (meta.aliases?.some((a) => name.includes(a.toLowerCase()))) s += 8
  })

  if (!v.localService && /online|natural|neural/i.test(name)) s -= 4
  return s
}

function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  langPref = 'es-ES'
): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -1
  for (const v of voices) {
    const sc = scoreVoice(v, langPref)
    if (sc > bestScore) {
      bestScore = sc
      best = v
    }
  }
  if (best) return best
  const p2 = langPref.slice(0, 2).toLowerCase()
  return voices.find((v) => (v.lang || '').toLowerCase().startsWith(p2)) || voices[0] || null
}

function waitForVoices(timeoutMs = 10000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([])
      return
    }
    const synth = window.speechSynthesis
    const done = (list: SpeechSynthesisVoice[]) => {
      persistVoices(list)
      resolve(list)
    }

    const immediate = synth.getVoices()
    if (immediate?.length) {
      done(immediate)
      return
    }

    let finished = false
    const finish = (list: SpeechSynthesisVoice[]) => {
      if (finished) return
      finished = true
      try {
        synth.removeEventListener('voiceschanged', onChange)
      } catch {
        /* */
      }
      try {
        synth.onvoiceschanged = null
      } catch {
        /* */
      }
      window.clearInterval(poll)
      window.clearTimeout(timer)
      done(list)
    }

    const onChange = () => {
      const list = synth.getVoices()
      if (list?.length) finish(list)
    }

    try {
      synth.addEventListener('voiceschanged', onChange)
    } catch {
      /* */
    }
    try {
      synth.onvoiceschanged = onChange
    } catch {
      /* */
    }

    const poll = window.setInterval(() => {
      const list = synth.getVoices()
      if (list?.length) finish(list)
    }, 180)

    const timer = window.setTimeout(() => finish(synth.getVoices() || []), timeoutMs)

    // Priming suave (Edge Win10 a veces no dispara voiceschanged sin speak)
    try {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      u.rate = 1
      synth.speak(u)
      window.setTimeout(() => {
        try {
          synth.cancel()
        } catch {
          /* */
        }
        onChange()
      }, 60)
    } catch {
      /* */
    }
  })
}

function installGcoTts(voicesPromise: Promise<SpeechSynthesisVoice[]>) {
  if (window.gcoTts) {
    // Ya instalado en otra ruta de la SPA: solo refrescar ready
    return
  }

  let cached: SpeechSynthesisVoice[] = window.__gcoTtsVoicesCache || []
  voicesPromise.then((v) => {
    cached = v
  })

  window.gcoTts = {
    getVoices: () => {
      try {
        const live = window.speechSynthesis?.getVoices() || []
        if (live.length) {
          cached = live
          window.__gcoTtsVoicesCache = live
          return live
        }
      } catch {
        /* */
      }
      return cached
    },
    pickVoice: (langPref = 'es-ES') => pickBestVoice(window.gcoTts!.getVoices(), langPref),
    speak: (text, opts) => {
      if (!window.speechSynthesis || !text?.trim()) return
      const lang = opts?.lang || 'es-ES'
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      u.rate = opts?.rate ?? 1
      u.pitch = opts?.pitch ?? 1
      const voice = pickBestVoice(window.gcoTts!.getVoices(), lang)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang || lang
      }
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* */
      }
      window.speechSynthesis.speak(u)
    },
    cancel: () => {
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* */
      }
    },
    ready: voicesPromise,
    listMeta: () => FALLBACK_VOICES,
  }
  window.gcoSetEmojiStyle = setEmojiStyle
  window.gcoGetEmojiStyle = getEmojiStyle
  ;(window as unknown as { gcoApplyEmojiStyle?: typeof applyEmojiStyleGlobally }).gcoApplyEmojiStyle =
    applyEmojiStyleGlobally
  window.dispatchEvent(new CustomEvent('gco:tts-api-ready'))
}

async function warmMediaLibraries() {
  try {
    const mod = await import('@/core/storage/mediaLibrary')

    const tasks: Promise<unknown>[] = []

    if (typeof mod.listBooks === 'function') {
      tasks.push(mod.listBooks().catch(() => []))
    }

    if (typeof mod.listFolders === 'function') {
      tasks.push(mod.listFolders().catch(() => []))
    }

    if (typeof mod.listTracks === 'function') {
      tasks.push(mod.listTracks().catch(() => []))
    }

    if (typeof mod.listPlaylists === 'function') {
      tasks.push(mod.listPlaylists().catch(() => []))
    }

    await Promise.all(tasks)

    window.dispatchEvent(new CustomEvent('gco:library'))
    window.dispatchEvent(new CustomEvent('gco:media-warmed'))
  } catch {
    /* La biblioteca no debe bloquear la aplicación */
  }

  // Precarga explícita de módulos de página.
  // Vite necesita rutas estáticas para incluir estos chunks correctamente.

  await Promise.all([
    import('../nutricion/NutricionHome').catch(() => null),
    import('../musica/MusicaHome').catch(() => null),
  ])
}

/**
 * Arranque único por pestaña. Seguro llamar desde cualquier página:
 * CategoryMenu, Nutrición, Música, etc.
 */
export function ensurePwaGlobalPreload() {
  if (typeof window === 'undefined') return
  if (window[GLOBAL_MARK]) {
    // Ya activo: re-aplicar estilo actual (navegación SPA / nueva pantalla)
    applyEmojiStyleGlobally(getEmojiStyle())
    return
  }
  window[GLOBAL_MARK] = true

  try {
    localStorage.setItem('gco:tts-fallback-voices', JSON.stringify(FALLBACK_VOICES))
    sessionStorage.setItem('gco:tts-fallback-voices', JSON.stringify(FALLBACK_VOICES))
    if (!localStorage.getItem(EMOJI_STYLE_KEY)) {
      localStorage.setItem(EMOJI_STYLE_KEY, 'ios')
    }
    document.documentElement.setAttribute('data-gco-emoji', getEmojiStyle())
  } catch {
    /* */
  }

  const voicesP = waitForVoices(10000)
  installGcoTts(voicesP)
  void setupGlobalEmoji().then(() => {
    applyEmojiStyleGlobally(getEmojiStyle())
  }).catch(() => applyEmojiStyleGlobally(getEmojiStyle()))

  // Media YA (no solo idle) para evitar flash vacío al abrir Nutrición
  void warmMediaLibraries()
  try {
    sessionStorage.setItem(PRELOAD_BOOT_KEY, '1')
  } catch {
    /* */
  }

  window.addEventListener('gco:emoji-style', () => {
    applyEmojiStyleGlobally(getEmojiStyle())
  })

  // Visibilidad: al volver a la pestaña, re-sync voces (Edge a veces las pierde)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        const list = window.speechSynthesis?.getVoices() || []
        if (list.length) persistVoices(list)
      } catch {
        /* */
      }
      applyEmojiStyleGlobally(getEmojiStyle())
    }
  })
}

// Auto-boot si este módulo se importa en cualquier ruta del bundle
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensurePwaGlobalPreload())
  } else {
    ensurePwaGlobalPreload()
  }
}


/** Anillo de marco compacto para el botón de perfil del header */
function profileFrameRing(frame: string): React.CSSProperties {
  const base: React.CSSProperties = { borderRadius: '50%', boxSizing: 'border-box' }
  if (frame === 'neon')
    return { ...base, padding: 2, background: 'var(--gco-primary, #22E6C5)', boxShadow: '0 0 10px var(--gco-primary, #22E6C5)' }
  if (frame === 'metal')
    return { ...base, padding: 2, background: 'linear-gradient(135deg,#f0f2f5,#8b93a7,#3a4154,#cfd5e0)' }
  if (frame === 'gold')
    return { ...base, padding: 2, background: 'linear-gradient(145deg,#fff6c8,#e8c547,#b8860b,#c9a227)' }
  if (frame === 'holographic' || frame === 'rainbow')
    return { ...base, padding: 2, background: 'conic-gradient(from 210deg,#ff6bcb,#7ec8ff,#22e6c5,#8b7cf6,#ff6bcb)' }
  if (frame === 'cyber')
    return { ...base, padding: 2, background: 'linear-gradient(90deg,#22e6c5,#0B1220,#8b7cf6)', boxShadow: '0 0 0 1px #22e6c5' }
  if (frame === 'glass' || frame === 'frutiger-aero')
    return { ...base, padding: 2, background: 'linear-gradient(145deg,rgba(255,255,255,0.55),rgba(34,230,197,0.25))', boxShadow: '0 0 0 1px rgba(255,255,255,0.35)' }
  if (frame === 'pulse' || frame === 'rose')
    return { ...base, padding: 2, background: 'linear-gradient(145deg,#ff6b9d,#ff3d7f)' }
  if (frame === 'aurora' || frame === 'violet')
    return { ...base, padding: 2, background: 'linear-gradient(120deg,#22e6c5,#5b8cff,#c084fc)' }
  if (frame === 'sunset' || frame === 'lava')
    return { ...base, padding: 2, background: 'linear-gradient(160deg,#ffb347,#ff6b6b,#b71c1c)' }
  if (frame === 'ice' || frame === 'mint' || frame === 'emerald')
    return { ...base, padding: 2, background: 'linear-gradient(160deg,#e8f7ff,#22e6c5,#0d9488)' }
  if (frame === 'chrome')
    return { ...base, padding: 2, background: 'linear-gradient(135deg,#fff,#bbb,#666,#ddd)' }
  if (frame === 'orbit' || frame === 'pixel')
    return { ...base, padding: 2, background: 'conic-gradient(from 0deg,#22e6c5,transparent 40%,#8b5cf6,transparent 80%,#22e6c5)' }
  if (frame === 'matte')
    return { ...base, padding: 3, background: 'rgba(255,255,255,0.2)' }
  return { ...base, padding: 2, background: 'var(--gco-glass-border, rgba(255,255,255,0.2))' }
}

export function CategoryMenu() {
  const navigate = useNavigate()
  const profile = getProfile()
  const started = useRef(false)
  const [avatar, setAvatar] = useState<string | null>(() => profile?.avatarDataUrl ?? null)
  const [avatarFrame, setAvatarFrame] = useState<string>(() => (profile?.avatarFrame as string) || 'none')

  useEffect(() => {
    if (started.current) return
    started.current = true
    ensurePwaGlobalPreload()
  }, [])

  useEffect(() => {
    setAvatar(profile?.avatarDataUrl ?? null)
    setAvatarFrame((profile?.avatarFrame as string) || 'none')
    const onProfile = () => {
      try {
        const p = getProfile()
        setAvatar(p?.avatarDataUrl ?? null)
        setAvatarFrame((p?.avatarFrame as string) || 'none')
      } catch {
        /* */
      }
    }
    window.addEventListener('gco:profile', onProfile)
    window.addEventListener('storage', onProfile)
    return () => {
      window.removeEventListener('gco:profile', onProfile)
      window.removeEventListener('storage', onProfile)
    }
  }, [profile?.avatarDataUrl, profile?.avatarFrame])

  return (
    <div className="app-shell">
      <style>{`
        @keyframes gco-games-spark {
          0%, 100% { opacity: 0.35; transform: scale(0.85) translateY(0); }
          50% { opacity: 1; transform: scale(1.15) translateY(-3px); }
        }
        @keyframes gco-games-streak {
          0% { opacity: 0; transform: translateX(-8px) scaleX(0.6); }
          40% { opacity: 0.9; }
          100% { opacity: 0; transform: translateX(18px) scaleX(1.2); }
        }
        .gco-games-banner {
          position: relative;
          display: block;
          width: 100%;
          margin-top: 1.75rem;
          padding: 0;
          border: 1px solid var(--gco-glass-border, rgba(255,255,255,0.14));
          border-radius: 18px;
          background: transparent;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 8px 28px rgba(0,0,0,0.18);
          cursor: pointer;
          overflow: hidden;
          font: inherit;
          color: inherit;
          text-align: center;
          min-height: 96px;
        }
        .gco-games-banner:active {
          transform: scale(0.985);
        }
        .gco-games-title {
          position: relative;
          z-index: 2;
          margin: 0;
          padding: 1.35rem 1rem;
          font-size: clamp(2.4rem, 11vw, 3.4rem);
          font-weight: 900;
          letter-spacing: 0.04em;
          line-height: 1;
          font-style: italic;
          text-transform: uppercase;
          color: #0a0a0a;
          -webkit-text-stroke: 2.5px #f5f5f5;
          paint-order: stroke fill;
          text-shadow:
            3px 3px 0 #111,
            -1px -1px 0 #fff,
            0 0 18px rgba(255,255,255,0.25);
          filter: contrast(1.05);
          user-select: none;
        }
        .gco-games-particle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          animation-name: gco-games-spark;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .gco-games-streak {
          position: absolute;
          height: 1.5px;
          border-radius: 2px;
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          animation-name: gco-games-streak;
          animation-timing-function: ease-out;
          animation-iteration-count: infinite;
        }
        .gco-profile-btn {
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          display: block;
          flex-shrink: 0;
          line-height: 0;
          overflow: visible;
          Webkit-tap-highlight-color: transparent;
        }
        .gco-profile-ring {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          box-sizing: border-box;
        }
        .gco-profile-inner {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          background: var(--gco-glass-bg, rgba(255,255,255,0.08));
        }
        .gco-profile-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 50%;
        }
      `}</style>

      <header style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                color: 'var(--gco-ink-muted)',
                fontSize: '0.95rem',
                marginBottom: '0.2rem',
              }}
            >
              Hola, {profile?.name ?? 'Atleta mental'}
            </p>
            <h1
              style={{
                fontSize: 'clamp(1.45rem, 5vw, 2.1rem)',
                lineHeight: 1.2,
              }}
            >
              ¿Qué quieres entrenar?
            </h1>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              flexShrink: 0,
            }}
          >
            <div className="mode-switch-desktop">
              <ModeSwitch />
            </div>
            <ThemeToggle />
            <button
              type="button"
              className="gco-profile-btn"
              aria-label="Abrir perfil"
              title="Perfil"
              onClick={() => {
                soundClick()
                navigate('/ajustes', { state: { section: 'perfil' } })
              }}
            >
              <span className="gco-profile-ring" style={profileFrameRing(avatarFrame)}>
                <span className="gco-profile-inner">
                  {avatar ? (
                    <img src={avatar} alt="" draggable={false} />
                  ) : (
                    <span
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: '100%',
                        height: '100%',
                        fontSize: '1.05rem',
                        color: 'var(--gco-ink-muted)',
                      }}
                      aria-hidden
                    >
                      👤
                    </span>
                  )}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="theme-cycle-btn"
              aria-label="Abrir ajustes"
              onClick={() => {
                soundClick()
                navigate('../ajustes/PerfilSettings.tsx')
              }}
              style={{ width: 44, height: 44, padding: 0, borderRadius: 12 }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
                <span style={{ width: 18, height: 2, background: 'currentColor', borderRadius: 2 }} />
              </span>
            </button>
          </div>
        </div>

        <div className="mode-switch-mobile" style={{ marginTop: '0.85rem' }}>
          <ModeSwitch fullWidth />
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '1rem',
        }}
      >
        {CATEGORIES.map((cat, index) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.35 }}
          >
            <GlassCard
              onClick={() => {
                soundClick()
                navigate(`/categoria/${cat.id}`)
              }}
            >
              <div style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', lineHeight: 1 }}>
                  {cat.emoji}
                </div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>{cat.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', lineHeight: 1.35 }}>
                  {cat.desc}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <motion.button
        type="button"
        className="gco-games-banner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        aria-label="Abrir Games"
        onClick={() => {
          soundClick()
          navigate('/games')
        }}
      >
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="gco-games-particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animationDuration: p.dur,
              animationDelay: p.delay,
            }}
          />
        ))}
        <span
          className="gco-games-streak"
          style={{
            left: '10%',
            top: '30%',
            width: 28,
            background: 'linear-gradient(90deg, transparent, #ff3b3b, transparent)',
            animationDuration: '2.8s',
            animationDelay: '0.2s',
          }}
        />
        <span
          className="gco-games-streak"
          style={{
            left: '70%',
            top: '65%',
            width: 36,
            background: 'linear-gradient(90deg, transparent, #4da3ff, transparent)',
            animationDuration: '3.2s',
            animationDelay: '0.9s',
          }}
        />
        <span
          className="gco-games-streak"
          style={{
            left: '40%',
            top: '18%',
            width: 22,
            background: 'linear-gradient(90deg, transparent, #ffffff, transparent)',
            animationDuration: '2.5s',
            animationDelay: '1.4s',
          }}
        />
        <p className="gco-games-title">GAMES</p>
      </motion.button>

      <footer
        style={{
          marginTop: '1.75rem',
          paddingBottom: '0.75rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '0.72rem',
            color: 'var(--gco-ink-muted)',
            opacity: 0.5,
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          Desarrollado por{' '}
          <span
            style={{
              fontWeight: 600,
              opacity: 0.85,
              background: 'linear-gradient(90deg, var(--gco-primary, #22E6C5), #8B5CF6)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Savitar Xeno
          </span>
        </p>
      </footer>
    </div>
  )
}