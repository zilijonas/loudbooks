import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Update prompt state. Never reloads by itself: callers decide when it is safe
 * (not during playback, import or transfer) and then call `apply`.
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW()
  return { needRefresh, offlineReady, apply: () => updateServiceWorker(true) }
}
