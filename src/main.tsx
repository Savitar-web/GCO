import {prepareStockfish,warmStockfish} from './features/games/chess/stockfish'
import './core/browserCompat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './styles/theme.css'
import './styles/refinements.css'
import {preloadChessPieces} from './features/games/chess/preloadPieces'

let saved='dark'
try{saved=localStorage.getItem('gco:theme')||'dark'}catch{/* Safari can temporarily deny storage. */}
document.documentElement.setAttribute('data-theme', saved)

const mount=()=>createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

void preloadChessPieces().catch(()=>undefined)
mount()

// Warm both engines while the user signs in or explores the app.
const warmEngines = () => {
  void prepareStockfish('lite').then(() => prepareStockfish('full')).then(()=>warmStockfish('full')).catch(() => {})
}
window.setTimeout(warmEngines, 1500)
window.addEventListener('online', warmEngines)
