import { create } from 'zustand'

interface UiState {
  toast: { id: number; text: string } | null
  /** Book that just arrived: its card/cover pops in and wears the New badge until the next library visit. */
  newBookId: string | null
  installOpen: boolean
  /** "Later" on the update banner hides it for this session. */
  updateDismissed: boolean
  /** An import is writing files: updates must not reload now. */
  importing: boolean
  pwa: { needRefresh: boolean; offlineReady: boolean; apply: () => void }
}

export const useUi = create<UiState>(() => ({
  toast: null, newBookId: null, installOpen: false, updateDismissed: false, importing: false,
  pwa: { needRefresh: false, offlineReady: false, apply: () => {} },
}))

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function showToast(text: string) {
  clearTimeout(toastTimer)
  useUi.setState({ toast: { id: Date.now(), text } })
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), 3400)
}
