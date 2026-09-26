/**
 * TtsVoiceInstallerModal.tsx
 * Modal profesional para instalar voces TTS cuando no hay ninguna disponible.
 * Se usa junto con useSpeechReader.ts
 */
import { useEffect, useState, type ReactElement } from 'react'
import {
  TTS_ENGINES,
  PLATFORM_LABELS,
  detectPlatform,
  type PlatformId,
  type TtsEngine,
} from '@/hooks/useSpeechReader'

const MODAL_CSS = `
.gco-tts-overlay{position:fixed;inset:0;z-index:99999;background:rgba(8,10,18,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:gcoFadeIn .22s ease}
@keyframes gcoFadeIn{from{opacity:0}to{opacity:1}}
.gco-tts-modal{background:linear-gradient(165deg,#1a1d2b 0%,#12141f 100%);border:1px solid rgba(255,255,255,.08);border-radius:20px;max-width:520px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.55);animation:gcoSlideUp .28s cubic-bezier(.22,1,.36,1)}
@keyframes gcoSlideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
.gco-tts-header{padding:22px 24px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
.gco-tts-header h2{margin:0 0 6px;font-size:1.25rem;font-weight:700;color:#f4f5f9}
.gco-tts-header p{margin:0;font-size:.9rem;color:#9aa3b5;line-height:1.45}
.gco-tts-body{padding:16px 20px 8px;overflow-y:auto;flex:1}
.gco-tts-platforms{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.gco-tts-chip{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#c5cde0;border-radius:999px;padding:7px 14px;font-size:.82rem;font-weight:600;cursor:pointer}
.gco-tts-chip:hover{background:rgba(255,255,255,.09)}
.gco-tts-chip.active{background:linear-gradient(135deg,#5b8cff,#7b6cff);border-color:transparent;color:#fff;box-shadow:0 4px 14px rgba(91,140,255,.35)}
.gco-tts-engine{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.gco-tts-engine.recommended{border-color:rgba(91,140,255,.45);background:linear-gradient(135deg,rgba(91,140,255,.08),rgba(123,108,255,.05))}
.gco-tts-engine-title{display:flex;align-items:center;gap:8px;font-weight:700;color:#eef1f8;font-size:.95rem;margin-bottom:6px}
.gco-tts-badge{font-size:.68rem;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:6px}
.gco-tts-badge.rec{background:#5b8cff;color:#fff}
.gco-tts-badge.free{background:rgba(52,211,153,.2);color:#6ee7b7}
.gco-tts-badge.ai{background:rgba(244,114,182,.2);color:#f9a8d4}
.gco-tts-meta{font-size:.78rem;color:#8b95a8;margin-bottom:8px}
.gco-tts-lists{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.8rem;margin-bottom:10px}
.gco-tts-lists ul{margin:0;padding-left:16px;color:#b0b8c9}
.gco-tts-lists li{margin-bottom:3px}
.gco-tts-compat{font-size:.78rem;color:#7dd3fc;margin-bottom:8px}
.gco-tts-tutorial{font-size:.8rem;color:#aab3c5;background:rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px}
.gco-tts-tutorial ol{margin:0;padding-left:18px}
.gco-tts-tutorial li{margin-bottom:4px}
.gco-tts-cta{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#5b8cff,#7b6cff);color:#fff;font-weight:600;font-size:.84rem;border:none;border-radius:10px;padding:9px 16px;cursor:pointer}
.gco-tts-cta:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(91,140,255,.4)}
.gco-tts-footer{padding:14px 20px 18px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:flex-end;gap:10px}
.gco-tts-btn-secondary{background:transparent;border:1px solid rgba(255,255,255,.14);color:#c5cde0;border-radius:10px;padding:9px 18px;font-size:.88rem;font-weight:600;cursor:pointer}
.gco-tts-btn-secondary:hover{background:rgba(255,255,255,.06)}
@media (max-width:480px){.gco-tts-lists{grid-template-columns:1fr}.gco-tts-modal{border-radius:16px}}
`

let cssInjected = false
function injectModalCss(): void {
  if (cssInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.id = 'gco-tts-modal-css'
  style.textContent = MODAL_CSS
  document.head.appendChild(style)
  cssInjected = true
}

export interface TtsVoiceInstallerModalProps {
  open: boolean
  onClose: () => void
  initialPlatform?: PlatformId
}

export function TtsVoiceInstallerModal({
  open,
  onClose,
  initialPlatform,
}: TtsVoiceInstallerModalProps): ReactElement | null {
  const [platform, setPlatform] = useState<PlatformId>(initialPlatform || detectPlatform())
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null)

  useEffect(() => {
    if (open) injectModalCss()
  }, [open])

  useEffect(() => {
    if (open) {
      setPlatform(initialPlatform || detectPlatform())
      setSelectedEngine(null)
    }
  }, [open, initialPlatform])

  if (!open) return null

  const engines: TtsEngine[] = TTS_ENGINES[platform] || []

  const openUrl = (url: string): void => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      /* */
    }
  }

  return (
    <div className="gco-tts-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="gco-tts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gco-tts-header">
          <h2>No se encontraron voces TTS</h2>
          <p>
            Tu dispositivo no tiene un motor de texto a voz usable. Elige tu plataforma y te
            guiamos para instalar voces de calidad.
          </p>
        </div>

        <div className="gco-tts-body">
          <div className="gco-tts-platforms">
            {(['android', 'ios', 'windows', 'macos', 'linux'] as PlatformId[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`gco-tts-chip${platform === p ? ' active' : ''}`}
                onClick={() => {
                  setPlatform(p)
                  setSelectedEngine(null)
                }}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {engines.length === 0 && (
            <p style={{ color: '#9aa3b5', fontSize: '0.9rem' }}>
              No hay motores listados para esta plataforma.
            </p>
          )}

          {engines.map((eng) => (
            <div
              key={eng.id}
              className={`gco-tts-engine${eng.recommended ? ' recommended' : ''}`}
            >
              <div className="gco-tts-engine-title">
                {eng.shortName}
                {eng.recommended ? <span className="gco-tts-badge rec">Recomendado</span> : null}
                {eng.free ? <span className="gco-tts-badge free">Gratis</span> : null}
                {eng.ai ? <span className="gco-tts-badge ai">IA</span> : null}
              </div>
              <div className="gco-tts-meta">
                Calidad: <strong>{eng.quality}</strong>
                {eng.offline ? ' · Offline' : ' · Requiere internet'}
              </div>
              <div className="gco-tts-compat">Compatibilidad: {eng.compatibility}</div>

              <div className="gco-tts-lists">
                <div>
                  <strong style={{ color: '#6ee7b7' }}>Ventajas</strong>
                  <ul>
                    {eng.pros.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong style={{ color: '#fca5a5' }}>Desventajas</strong>
                  <ul>
                    {eng.cons.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {(selectedEngine === eng.id || eng.recommended) && (
                <div className="gco-tts-tutorial">
                  <strong style={{ color: '#e2e8f0' }}>Tutorial</strong>
                  <ol>
                    {eng.tutorial.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="gco-tts-cta" onClick={() => openUrl(eng.url)}>
                  {eng.cta}
                </button>
                {selectedEngine !== eng.id && (
                  <button
                    type="button"
                    className="gco-tts-btn-secondary"
                    style={{ padding: '9px 12px' }}
                    onClick={() => setSelectedEngine(eng.id)}
                  >
                    Ver tutorial
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="gco-tts-footer">
          <button type="button" className="gco-tts-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default TtsVoiceInstallerModal