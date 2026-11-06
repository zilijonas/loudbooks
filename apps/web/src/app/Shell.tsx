import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router'
import { InstallGuide, Sidebar } from '../components/ui/Navigation'
import { Toast } from '../components/ui/Feedback'
import { BottomSheet, useIsDesktop } from '../components/ui/Overlays'
import { ImportCoordinator } from '../features/import/ImportCoordinator'
import { isActivePath } from '../features/playback/api'
import { PlayerDock } from '../features/playback/PlayerDock'
import { t } from '../i18n'
import { usePreset } from '../motion/presets'
import { usePwaUpdate } from '../pwa/usePwaUpdate'
import { useOnline } from './env'
import { useUi } from './store'
import '../pages/screens.css'

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
  const { needRefresh, offlineReady, apply } = usePwaUpdate()
  const toast = useUi((s) => s.toast)
  const installOpen = useUi((s) => s.installOpen)

  useEffect(recoverOnce, [])
  // A returning visit already runs under an active worker; `offlineReady` only fires on the first install.
  const ready = offlineReady || !!navigator.serviceWorker?.controller
  useEffect(() => useUi.setState({ pwa: { needRefresh, offlineReady: ready, apply } }), [needRefresh, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { main.current?.scrollTo({ top: 0 }) }, [location.pathname])

  const path = location.pathname
  const welcome = path === '/welcome'
  const dock = !welcome && path !== '/add' && path !== '/player' && !path.endsWith('/edit')
  const section = path.startsWith('/settings') ? 'settings' : path.startsWith('/receive') ? 'receive' : 'library'

  return (
    <div className="lb-app">
      {desktop && !welcome && (
        <Sidebar
          onAdd={() => navigate('/add')}
          offlineReady={ready || !online}
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
            <motion.div key={path} className="lb-page" {...p.page}>{outlet}</motion.div>
          </AnimatePresence>
        </main>
        {dock && <PlayerDock />}
      </div>
      <Toast toast={toast} bottom={`calc(${desktop ? 28 : 24}px + var(--lb-safe-bottom) + var(--lb-dock, 0px))`} />
      <BottomSheet open={installOpen} onOpenChange={(o) => useUi.setState({ installOpen: o })} title={t('install.title')}>
        <InstallGuide onDone={() => useUi.setState({ installOpen: false })} />
      </BottomSheet>
    </div>
  )
}
