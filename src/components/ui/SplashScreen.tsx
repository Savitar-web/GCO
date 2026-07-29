import { motion } from 'framer-motion'

interface Props {
  onFinish: () => void
}

export function SplashScreen({ onFinish }: Props) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      onAnimationComplete={onFinish}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gco-bg, #0B1220)',
        gap: '1.25rem',
      }}
    >
      {/* Anillo de carga sutil */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '3px solid rgba(34, 230, 197, 0.15)',
          borderTopColor: 'var(--gco-primary, #22E6C5)',
          animation: 'gco-spin 0.75s linear infinite',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        style={{ textAlign: 'center' }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display, system-ui)',
            fontSize: '1.35rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            marginBottom: '0.25rem',
          }}
        >
          GymCogOrigins
        </h1>
        <p style={{ color: 'var(--gco-ink-muted, rgba(243,245,250,0.64))', fontSize: '0.85rem' }}>
          Entrena tu mente
        </p>
      </motion.div>

      <style>{`
        @keyframes gco-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  )
}