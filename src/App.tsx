import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { getProfile } from './core/storage/userProfile'
import { Onboarding } from './features/onboarding/Onboarding'
import { CategoryMenu } from './features/categorias/CategoryMenu'
import { MemoriaCategory } from './features/memoria/juegos/MemoriaCategory'
import { ColorSequenceGame } from './features/memoria/juegos/secuencia-colores/ColorSequenceGame'
import { NumerosAsociadosGame } from './features/memoria/juegos/numeros-asociados/NumerosAsociadosGame'
import { SplashScreen } from './components/ui/SplashScreen'
import { AmbientBackground } from './components/ui/AmbientBackground'
import { SettingsLayout } from './features/ajustes/SettingsLayout'
import { SettingsHome } from './features/ajustes/SettingsHome'
import { PerfilSettings } from './features/ajustes/PerfilSettings'
import { RecorridoSettings } from './features/ajustes/RecorridoSettings'
import { SonidoSettings } from './features/ajustes/SonidoSettings'
import { FondoSettings } from './features/ajustes/FondoSettings'
import { DatosSettings } from './features/ajustes/DatosSettings'
import { RutinasSettings } from './features/ajustes/RutinasSettings'
import { CartasGame } from './features/memoria/juegos/cartas/CartasGame'
import { NexoGame } from './features/memoria/juegos/nexo/NexoGame'
import { RoutineWidget } from '@/components/ui/RoutineWidget'
import { NutricionHome } from './features/nutricion/NutricionHome'
import { BookReader } from './features/nutricion/BookReader'
import { MusicaHome } from './features/musica/MusicaHome'
import { ReaderPlayerProvider, MiniPlayer } from '@/core/reader/ReaderPlayerContext'
import { HabilidadesGame } from './features/memoria/juegos/habilidades/Habilidades'
import { DespejesGame } from './features/logica/juegos/despejes/DespejesGame'
import { DeduccionCategory } from './features/deduccion/juegos/DeduccionCategory'
import { AcertijosGame } from './features/deduccion/juegos/acertijos/acertijos'
import { HistoriasGame } from './features/deduccion/juegos/historias/historias'
import { PalabrasGame } from './features/deduccion/juegos/palabras/palabras'
import { SilogismosGame } from './features/deduccion/juegos/silogismos/silogismos'
import { MapasGame } from './features/deduccion/juegos/mapas/mapas'
import { CodigoGame } from './features/deduccion/juegos/codigo/codigo'

/* Lógica */
import { LogicaCategory } from './features/logica/juegos/LogicaCategory'
import { Colocador } from './features/logica/juegos/numberpuzzle/colocador'
import { RompecabezasGame } from '@/features/logica/juegos/rompecabezas/RompecabezasGame'
import { BlockCleaner } from '@/features/logica/juegos/BlockCleaner/BlockCleaner'

import { IdiomasGame } from './features/deduccion/juegos/idiomas/idiomas'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setHasProfile(!!getProfile())
    } catch {
      setHasProfile(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [])

  if (hasProfile === null) {
    return (
      <>
        <AmbientBackground />
      </>
    )
  }

  return (
    <ReaderPlayerProvider>
      <AmbientBackground />

      <AnimatePresence mode="wait">
        {showSplash && (
          <SplashScreen onFinish={() => setShowSplash(false)} />
        )}
      </AnimatePresence>

      {!showSplash && (
        <>
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

            {/* ── Memoria ── */}
            <Route path="/categoria/memoria" element={<MemoriaCategory />} />
            <Route
              path="/categoria/memoria/secuencia-colores"
              element={<ColorSequenceGame />}
            />
            <Route path="/categoria/memoria/cartas" element={<CartasGame />} />
            <Route path="/categoria/memoria/nexo" element={<NexoGame />} />
            <Route
              path="/categoria/memoria/numeros-asociados"
              element={<NumerosAsociadosGame />}
            />
            <Route path="/categoria/memoria/habilidades" element={<HabilidadesGame />} />

            {/* ── Lógica ── */}
            <Route path="/categoria/logica" element={<LogicaCategory />} />
            <Route
              path="/categoria/logica/numberpuzzle"
              element={<Colocador />}
            />
            <Route
              path="/categoria/logica/rompecabezas"
              element={<RompecabezasGame />}
            />
            <Route path="/categoria/logica/despejes" element={<DespejesGame />} />
            <Route path="/categoria/logica/blockcleaner" element={<BlockCleaner />} />

            {/* ── Nutrición ── */}
            <Route path="/nutricion" element={<NutricionHome />} />
            <Route path="/nutricion/libro/:id" element={<BookReader />} />

            {/* ── Música ── */}
            <Route path="/musica" element={<MusicaHome />} />

            {/* ── Ajustes ── */}
            <Route path="/ajustes" element={<SettingsLayout />}>
              <Route index element={<SettingsHome />} />
              <Route path="perfil" element={<PerfilSettings />} />
              <Route path="recorrido" element={<RecorridoSettings />} />
              <Route path="sonido" element={<SonidoSettings />} />
              <Route path="fondo" element={<FondoSettings />} />
              <Route path="datos" element={<DatosSettings />} />
              <Route path="rutinas" element={<RutinasSettings />} />
            </Route>

            {/* ── Deducción ── */}
            <Route path="/categoria/deduccion" element={<DeduccionCategory />} />
            <Route path="/categoria/deduccion/acertijos" element={<AcertijosGame />} />
            <Route path="/categoria/deduccion/historias" element={<HistoriasGame />} />
            <Route path="/categoria/deduccion/palabras" element={<PalabrasGame />} />
            <Route path="/categoria/deduccion/silogismos" element={<SilogismosGame />} />
            <Route path="/categoria/deduccion/mapas" element={<MapasGame />} />
            <Route path="/categoria/deduccion/codigo" element={<CodigoGame />} />
            <Route path="/categoria/deduccion/idiomas" element={<IdiomasGame />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <RoutineWidget />
          <MiniPlayer />
        </>
      )}
    </ReaderPlayerProvider>
  )
}

export default App