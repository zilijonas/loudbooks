import { useRegisterSW } from 'virtual:pwa-register/react'
import { useUi } from '../app/store'
import { usePlayer } from '../features/playback/api'

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
  // The library's own reload only fires when this page session saw the install as an update; a session that was open
  // since the first install would otherwise swap the worker and stay on old code.
  const apply = () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    void updateServiceWorker(true)
  }
  return { needRefresh, offlineReady, apply }
}

/** An update must wait while audio is coming out or an import/transfer is writing. A paused book that is merely loaded does not block it. */
export function useUpdateBusy() {
  const importing = useUi((s) => s.importing)
  const listening = usePlayer((s) => s.state.status === 'playing' || s.state.status === 'preparing' || s.state.status === 'rebuilding')
  return importing || listening
}
