import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getProfile } from './core/storage/userProfile'
import { Onboarding } from './features/onboarding/Onboarding'
import { CategoryMenu } from './features/categorias/CategoryMenu'
import { MemoriaCategory } from './features/memoria/juegos/MemoriaCategory'
import { ColorSequenceGame } from './features/memoria/juegos/secuencia-colores/ColorSequenceGame'
import { NumerosAsociadosGame } from './features/memoria/juegos/numeros-asociados/NumerosAsociadosGame'

function App() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    setHasProfile(!!getProfile())
  }, [])

  if (hasProfile === null) return null

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
<Route
  path="/categoria/memoria/numeros-asociados"
  element={<NumerosAsociadosGame />}
/>

      {/* Categoría Memoria */}
      <Route path="/categoria/memoria" element={<MemoriaCategory />} />
      <Route
        path="/categoria/memoria/secuencia-colores"
        element={<ColorSequenceGame />}
      />

      {/* Aquí irán el resto de categorías y juegos */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App