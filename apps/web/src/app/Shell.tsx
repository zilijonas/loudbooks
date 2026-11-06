import { AnimatePresence, motion } from 'motion/react'
import { ErrorFallback } from './ErrorFallback'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router'
import { InstallGuide, Sidebar } from '../components/ui/Navigation'
import { Toast } from '../components/ui/Feedback'
import { BottomSheet, useIsDesktop } from '../components/ui/Overlays'
import { ImportCoordinator } from '../features/import/ImportCoordinator'
import { isActivePath } from '../features/playback/api'
import { PlayerDock } from '../features/playback/PlayerDock'
import { SendHost } from '../pages/shared/SendHost'
import { t } from '../i18n'
import { usePreset } from '../motion/presets'
import { usePwaUpdate } from '../pwa/usePwaUpdate'
import { db } from '../services/db/database'
import { useOnline } from './env'
import { useUi } from './store'

// Startup recovery runs once per app start, before any import or maintenance (they share the same lock).
let recovered = false
function recoverOnce() {
  if (recovered) return
  recovered = true
  const coordinator = new ImportCoordinator()
  void coordinator.recover(isActivePath).catch(() => {}).finally(() => coordinator.dispose())
}

/** App frame: desktop sidebar, routed page with enter/exit, player dock slot, toast, install sheet. */
export function Shell() {
  const location = useLocation()
  const outlet = useOutlet()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const online = useOnline()
  const p = usePreset()
  const main = useRef<HTMLElement>(null)
  const pwa = usePwaUpdate()
  const toast = useUi((s) => s.toast)
  const installOpen = useUi((s) => s.installOpen)
  const offlineReady = useUi((s) => s.pwa.offlineReady)
  const { needRefresh, apply } = pwa

  // A8: storage that can't be opened (private window, cleared data) goes to the route error screen.
  const [dbError, setDbError] = useState<unknown>(null)
  useEffect(() => { db.open().then(recoverOnce, setDbError) }, [])
  // A returning visit already runs under an active worker; `offlineReady` only fires on the first install.
  const ready = pwa.offlineReady || !!navigator.serviceWorker?.controller
  useEffect(() => useUi.setState({ pwa: { needRefresh, offlineReady: ready, apply } }), [needRefresh, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { main.current?.scrollTo({ top: 0 }) }, [location.pathname])

  const path = location.pathname
  const welcome = path === '/welcome'
  const dock = !dbError && !welcome && path !== '/add' && path !== '/player' && !path.endsWith('/edit')
  const section = path.startsWith('/settings') ? 'settings' : path.startsWith('/receive') ? 'receive' : 'library'

  return (
    <div className="lb-app">
      {desktop && !welcome && (
        <Sidebar
          onAdd={() => navigate('/add')}
          offlineReady={offlineReady || !online}
          offline={!online}
          items={[
            { label: t('common.library'), icon: 'book', current: section === 'library', onClick: () => navigate('/') },
            { label: t('receive.title'), icon: 'download', current: section === 'receive', onClick: () => navigate('/receive') },
            { label: t('common.settings'), icon: 'settings', current: section === 'settings', onClick: () => navigate('/settings') },
          ]}
        />
      )}
      <div className="lb-app-col">
        <main ref={main} className="lb-main">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={path} className="lb-page" {...p.page}>{dbError ? <ErrorFallback embedded /> : outlet}</motion.div>
          </AnimatePresence>
        </main>
        {dock && <PlayerDock />}
        <SendHost />
      </div>
      <Toast toast={toast} bottom={`calc(${desktop ? 28 : 24}px + var(--lb-safe-bottom) + var(--lb-dock, 0px))`} />
      <BottomSheet open={installOpen} onOpenChange={(o) => useUi.setState({ installOpen: o })} title={t('install.title')}>
        <InstallGuide onDone={() => useUi.setState({ installOpen: false })} />
      </BottomSheet>
    </div>
  )
}
