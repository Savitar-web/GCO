/**
 * features/logica/juegos/numberpuzzle
 *
 * Rutas:
 *   /categoria/logica              → <LogicaCategory />
 *   /categoria/logica/numberpuzzle  → <Colocador />
 */

export { Colocador, Colocador as default } from './colocador'
export {
  generateNumberPuzzleLevel,
  reshuffleLevel,
  getNumberPuzzleDifficulty,
  sizeForLevel,
  solvedBoard,
  shuffleBoard,
  canMove,
  moveTile,
  moveEmpty,
  isSolved,
  tileColor,
  formatTime,
  calcStars,
  mulberry32,
  levelSeed,
} from '../generateLevel'
export type {
  NumberPuzzleLevel,
  Board,
  GridSize,
  Cell,
  Direction,
} from '../generateLevel'