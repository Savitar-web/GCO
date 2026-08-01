import { formatTrackTime } from '@/core/storage/mediaLibrary'
import { soundClick } from '@/core/audio/uiSounds'
import type { useMediaPlayer } from '@/hooks/useMediaPlayer'

type Player = ReturnType<typeof useMediaPlayer>

export function PlayerBar({ player }: { player: Player }) {
  if (!player.track) return null

  const progress =
    player.durationMs > 0
      ? Math.min(100, (player.currentMs / player.durationMs) * 100)
      : 0

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 40,
        borderRadius: 16,
        border: '1px solid var(--gco-glass-border)',
        background: 'var(--gco-glass-bg, rgba(16,20,32,0.96))',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        padding: '0.75rem 1rem',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p
        style={{
          fontWeight: 600,
          fontSize: '0.9rem',
          marginBottom: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {player.track.title}
      </p>
      <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--gco-ink-muted)',
          marginBottom: 8,
        }}
      >
        {player.track.artist}
      </p>

      <input
        type="range"
        min={0}
        max={player.durationMs || 1}
        value={player.currentMs}
        onChange={(e) => player.seek(parseInt(e.target.value, 10))}
        style={{ width: '100%', marginBottom: 6 }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.7rem',
          color: 'var(--gco-ink-muted)',
          marginBottom: 8,
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <span>{formatTrackTime(player.currentMs)}</span>
        <span>{formatTrackTime(player.durationMs)}</span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
          onClick={() => {
            soundClick()
            player.setShuffle(!player.shuffle)
          }}
        >
          {player.shuffle ? '🔀' : '→'}
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.4rem 0.7rem' }}
          onClick={() => {
            soundClick()
            void player.prev()
          }}
        >
          ⏮
        </button>
        <button
          type="button"
          className="glass-button"
          style={{ padding: '0.5rem 1rem', fontWeight: 700 }}
          onClick={() => {
            soundClick()
            void player.toggle()
          }}
        >
          {player.playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.4rem 0.7rem' }}
          onClick={() => {
            soundClick()
            void player.next()
          }}
        >
          ⏭
        </button>
        <button
          type="button"
          className="glass-button secondary"
          style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
          onClick={() => {
            soundClick()
            const order: Array<'off' | 'one' | 'all'> = ['off', 'all', 'one']
            const i = order.indexOf(player.repeat)
            player.setRepeat(order[(i + 1) % order.length])
          }}
        >
          {player.repeat === 'one' ? '🔂' : player.repeat === 'all' ? '🔁' : '○'}
        </button>
      </div>
      {/* progress visual hint */}
      <div
        style={{
          height: 2,
          marginTop: 8,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--gco-primary)',
          }}
        />
      </div>
    </div>
  )
}