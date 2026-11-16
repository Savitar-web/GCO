import {GameSelect} from '../GameSelect'
import { prepareStockfish, type EngineFlavor } from './stockfish'

export function EngineSettings({ value, onChange }: { value: EngineFlavor; onChange: (value: EngineFlavor) => void }) {
  return <section className="engine-settings">
    <label>Inteligencia de juego<GameSelect value={value} onChange={event => {
      const engine = event.target.value as EngineFlavor
      onChange(engine)
      void prepareStockfish(engine).catch(() => {})
    }}>
      <option value="lite">Compacto · Conde</option>
      <option value="full">Completo · IA Verónica</option>
    </GameSelect></label>
  </section>
}
