import { AnimatePresence } from 'motion/react'
import { useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { MiniPlayer, PlayerBar } from '../../components/player/Bars'
import { useIsDesktop } from '../../components/ui/Overlays'
import { openPlayer, seekBy, togglePlay } from './controller'
import { PlayerSheets, type SheetName } from './PlayerSheets'
import { usePlayerView } from './view'
import './dock.css'

// Routes that own the whole screen: the dock would cover Save, the welcome flow, or duplicate the player.
const HIDDEN = [/^\/add$/, /^\/book\/[^/]+\/edit$/, /^\/welcome$/, /^\/player$/]

/** Mini-player (phone) or player bar (≥ 768 px) while a book is active. Rendered by the Shell. */
export function PlayerDock() {
  const view = usePlayerView()
  const desktop = useIsDesktop()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const show = !!view && !HIDDEN.some((r) => r.test(pathname))
  const mini = show && !desktop
  // The library grid card and the details cover share `cover-{id}` with this dock; two live members of one id hide each other.
  const coverLayoutId = pathname === '/' || (!!view && pathname === `/book/${view.summary.id}`) ? null : undefined
  const bar = show && desktop
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-dock', mini)
    document.documentElement.toggleAttribute('data-bar', bar)
    return () => { document.documentElement.removeAttribute('data-dock'); document.documentElement.removeAttribute('data-bar') }
  }, [mini, bar])
  return (
    <>
      <AnimatePresence>
        {mini && (
          <div key="mini" className="lb-dock-mini">
            <MiniPlayer coverLayoutId={coverLayoutId} book={view.summary} status={view.status} subtitle={view.subtitle} onOpen={openPlayer} onToggle={togglePlay} />
          </div>
        )}
        {show && desktop && (
          <PlayerBar
            key="bar"
            coverLayoutId={coverLayoutId}
            book={view.summary}
            status={view.status}
            subtitle={view.subtitle}
            onOpen={openPlayer}
            onToggle={togglePlay}
            speedLabel={view.speedLabel}
            timerLabel={view.timerLabel}
            timerActive={view.timerOn}
            onBack={() => seekBy(-30)}
            onForward={() => seekBy(15)}
            onSpeed={() => setSheet('speed')}
            onTimer={() => setSheet('timer')}
          />
        )}
      </AnimatePresence>
      {view && <PlayerSheets view={view} sheet={show ? sheet : null} onClose={() => setSheet(null)} />}
    </>
  )
}
