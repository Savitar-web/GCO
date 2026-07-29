import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const { label, icon, cycleTheme } = useTheme()

  return (
    <button
      type="button"
      className="theme-cycle-btn"
      onClick={cycleTheme}
      title="Cambiar tema"
      aria-label={`Tema actual: ${label}. Pulsar para cambiar.`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}