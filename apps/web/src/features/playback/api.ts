// Public player API for screens (LB-7 contract): Play buttons, the dock, and the file guard for library commands.
export {
  startListening,
  openPlayer,
  isBookActive,
  isActivePath,
  pause,
  releaseBook,
  togglePlay,
  initPlayback,
} from './controller'
export { usePlayerStore as usePlayer } from './store'
export type { PlayerStore } from './store'
