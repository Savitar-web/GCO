import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { getProfile } from './core/storage/userProfile'
import { Onboarding } from './features/onboarding/Onboarding'
import { CategoryMenu } from './features/categorias/CategoryMenu'
import { ColorSequenceGame } from './features/memoria/juegos/secuencia-colores/ColorSequenceGame'

function App() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    setHasProfile(!!getProfile())
  }, [])

  if (hasProfile === null) {
    return null // o un splash mínimo
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          hasProfile ? (
            <CategoryMenu />
          ) : (
            <Onboarding onComplete={() => setHasProfile(true)} />
          )
        }
      />
      <Route path="/categoria/memoria/secuencia-colores" element={<ColorSequenceGame />} />
      {/* Más rutas de categorías y juegos se añaden aquí */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App