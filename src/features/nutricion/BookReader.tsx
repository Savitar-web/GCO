import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { getBook } from '@/core/storage/mediaLibrary'
import type { SkipSeconds } from '@/hooks/useSpeechReader'
import { soundClick, soundToggle } from '@/core/audio/uiSounds'
import { useReaderPlayer } from '@/core/reader/ReaderPlayerContext.tsx'

const SKIP: SkipSeconds[] = [5, 10, 15]

function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}
function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function IconPause() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}
function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

export function BookReader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { reader, activeBook, loadBook, persist } = useReaderPlayer()

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [year, setYear] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sleepMin, setSleepMin] = useState(0)
  const [hlColor, setHlColor] = useState('#22E6C5')
  const [spokenColor, setSpokenColor] = useState('rgba(34,230,197,0.25)')
  const [skipSec, setSkipSec] = useState<SkipSeconds>(10)

  // Carga el libro en el reproductor global si no es ya el que está activo
  // (soporta llegar por URL directa, refresh, o navegación desde otra pantalla).
  useEffect(() => {
    if (!id) return
    if (activeBook?.id === id) {
      setTitle(activeBook.title)
      setAuthor(activeBook.author || '')
      setText(activeBook.text)
      setCover(activeBook.coverDataUrl || null)
      return
    }
    void getBook(id).then((b) => {
      if (!b) {
        navigate('/nutricion')
        return
      }
      setTitle(b.title)
      setAuthor(b.author || '')
      setYear(b.year || '')
      setText(b.text)
      setCover(b.coverDataUrl || null)
      reader.setRate(b.rate || 1)
      if (b.voiceURI) reader.setVoiceURI(b.voiceURI)
      if (b.highlightColor) setHlColor(b.highlightColor)
      if (b.spokenColor) setSpokenColor(b.spokenColor)
      loadBook(b, b.position || 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (sleepMin <= 0) return
    const t = window.setTimeout(() => {
      reader.stop()
      setSleepMin(0)
    }, sleepMin * 60_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepMin])

  const doPersist = async () => {
    if (!id) return
    await persist()
  }

  const esVoices = useMemo(
    () =>
      reader.voices.filter(
        (v: SpeechSynthesisVoice) =>
          v.lang.toLowerCase().startsWith('es') || v.lang.toLowerCase().includes('spa')
      ),
    [reader.voices]
  )
  const otherVoices = useMemo(
    () => reader.voices.filter((v: SpeechSynthesisVoice) => !esVoices.includes(v)),
    [reader.voices, esVoices]
  )

  const rendered = useMemo(() => {
    const i = Math.max(0, Math.min(reader.charIndex, text.length))
    const before = text.slice(0, i)
    const rest = text.slice(i)
    const wordMatch = rest.match(/^(\S+)/)
    const word = wordMatch?.[1] ?? ''
    const after = rest.slice(word.length)
    return { before, word, after }
  }, [text, reader.charIndex])

  const progressPct = text.length ? Math.round((reader.charIndex / text.length) * 100) : 0

  const startAtCursor = () => {
    soundClick()
    reader.speakFrom(text, reader.charIndex, reader.rate, reader.voiceURI)
  }

  return (
    <div className="app-shell">
      <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => {
            soundClick()
            void doPersist()
            navigate('/nutricion')
          }}
        >
          <IconBack /> Biblioteca
        </button>
      </header>

      <GlassCard>
        <div style={{ padding: '1.2rem 1.1rem' }}>
          {/* Cabecera: portada + título/autor */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
            <div
              className="book-cover"
              style={{
                width: 64,
                height: 92,
                borderRadius: 10,
                fontSize: '1.4rem',
                flexShrink: 0,
                ...(cover ? { backgroundImage: `url(${cover})` } : {}),
              }}
            >
              {!cover && title.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ lineHeight: 1.25 }}>{title}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginTop: 4 }}>
                {author || 'Autor desconocido'}
                {year ? ` · ${year}` : ''}
              </p>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="mini-player-progress" style={{ width: 120 }}>
                  <div className="mini-player-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)' }}>{progressPct}%</span>
              </div>
            </div>
          </div>

          {/* Velocidad */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', minWidth: 110 }}>Velocidad {reader.rate.toFixed(1)}×</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={reader.rate}
              onChange={(e) => reader.setRate(parseFloat(e.target.value))}
              style={{ flex: 1, minWidth: 120 }}
            />
          </div>

          {/* Voz */}
          <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Voz del sistema</label>
          <select
            className="glass-input"
            value={reader.voiceURI}
            onChange={(e) => reader.setVoiceURI(e.target.value)}
            style={{ marginBottom: 8 }}
          >
            <option value="">Automática (es si hay)</option>
            {esVoices.map((v: SpeechSynthesisVoice) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
            {otherVoices.map((v: SpeechSynthesisVoice) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.72rem', color: 'var(--gco-ink-muted)', marginBottom: 12 }}>
            La calidad depende del motor del dispositivo. Voces neurales premium (membresía) se integrarán después — sin DLCs.
          </p>

          {/* Colores resaltado */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Palabra actual
              <input type="color" value={hlColor} onChange={(e) => setHlColor(e.target.value)} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Ya leído (fondo)
              <input
                type="color"
                value={spokenColor.startsWith('#') ? spokenColor : '#1a4a44'}
                onChange={(e) => setSpokenColor(e.target.value + '40')}
              />
            </label>
          </div>

          {/* Controles transporte */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {!reader.speaking && (
              <GlassButton onClick={startAtCursor}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPlay /> Desde aquí</span>
              </GlassButton>
            )}
            {!reader.speaking && (
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundClick()
                  reader.speakFrom(text, 0, reader.rate, reader.voiceURI)
                }}
              >
                Desde el inicio
              </button>
            )}
            {reader.speaking && !reader.paused && (
              <button
                type="button"
                className="glass-button secondary"
                onClick={() => {
                  soundToggle(false)
                  reader.pause()
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPause /> Pausa</span>
              </button>
            )}
            {reader.paused && (
              <GlassButton
                onClick={() => {
                  soundClick()
                  reader.resume()
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPlay /> Seguir</span>
              </GlassButton>
            )}
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                reader.stop()
                void doPersist()
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconStop /> Detener</span>
            </button>
          </div>

          {/* Skip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)' }}>Salto:</span>
            {SKIP.map((s) => (
              <button
                key={s}
                type="button"
                className={`glass-button ${skipSec === s ? '' : 'secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                onClick={() => {
                  soundClick()
                  setSkipSec(s)
                }}
              >
                {s}s
              </button>
            ))}
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => {
                soundClick()
                reader.skipBack(skipSec)
              }}
            >
              ⏪ −{skipSec}s
            </button>
            <button
              type="button"
              className="glass-button secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => {
                soundClick()
                reader.skipForward(skipSec)
              }}
            >
              ⏩ +{skipSec}s
            </button>
          </div>

          {/* Sleep */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: '0.85rem', marginBottom: 6 }}>Sleep timer</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[0, 5, 15, 30, 45].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`glass-button ${sleepMin === m ? '' : 'secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => {
                    soundClick()
                    setSleepMin(m)
                  }}
                >
                  {m === 0 ? 'Off' : `${m} min`}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)', marginBottom: 8 }}>
            Toca el texto para elegir desde dónde leer. Puedes salir de esta pantalla — la lectura sigue sonando y aparece un mini-reproductor.
          </p>

          {/* Texto con resaltado — click para cursor */}
          <div
            role="article"
            onClick={(e) => {
              const el = e.currentTarget
              const sel = window.getSelection()
              if (!sel || sel.rangeCount === 0) return
              try {
                const range = sel.getRangeAt(0)
                const pre = range.cloneRange()
                pre.selectNodeContents(el)
                pre.setEnd(range.startContainer, range.startOffset)
                const off = pre.toString().length
                reader.setCharIndex(off)
                soundClick()
              } catch {
                /* */
              }
            }}
            style={{
              maxHeight: '48vh',
              overflow: 'auto',
              fontSize: '1rem',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              borderTop: '1px solid var(--gco-glass-border)',
              paddingTop: 12,
              cursor: 'text',
            }}
          >
            <span style={{ background: spokenColor }}>{rendered.before}</span>
            <span
              style={{
                background: hlColor,
                color: '#0B1220',
                fontWeight: 700,
                borderRadius: 3,
                padding: '0 2px',
              }}
            >
              {rendered.word}
            </span>
            <span>{rendered.after}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}