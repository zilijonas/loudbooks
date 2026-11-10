import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { BookCard, ContinueCard, bookMeta } from '../../components/books/BookCard'
import { BookCover } from '../../components/books/BookCover'
import { Ic } from '../../components/icons'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, UpdateBanner } from '../../components/ui/Feedback'
import { SearchField } from '../../components/ui/Fields'
import { PageHeader } from '../../components/ui/Navigation'
import { useUpdateBusy } from '../../pwa/usePwaUpdate'
import { useIsDesktop } from '../../components/ui/Overlays'
import { Reveal } from '../../components/ui/Reveal'
import { startListening, togglePlay, usePlayer } from '../../features/playback/api'
import { useAppSettings } from '../../features/settings/settings'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { isSafariTab, useOnline } from '../../app/env'
import { useUi } from '../../app/store'
import { BookActions } from '../shared/BookActions'
import { chapterLine, useLibrary, useSummary, type BookView } from '../shared/data'
import { norm, suggest } from './match'

export function LibraryPage() {
  const settings = useAppSettings()
  const views = useLibrary()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const online = useOnline()
  const p = usePreset()
  const pwa = useUi((s) => s.pwa)
  const updateDismissed = useUi((s) => s.updateDismissed)
  const busy = useUpdateBusy()
  const newBookId = useUi((s) => s.newBookId)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<BookView | null>(null)
  const activeId = usePlayer((s) => s.book?.id)
  const openBook = useCallback((id: string) => navigate(`/book/${id}`), [navigate])

  // The New badge lasts until the next library visit.
  useEffect(() => () => { if (newBookId) useUi.setState({ newBookId: null }) }, [newBookId])

  if (settings === undefined || views === undefined) return null
  if (!settings?.welcomeDone) return <Navigate to="/welcome" replace />

  const n = views.length
  const q = norm(query.trim())
  const shown = q ? views.filter((v) => norm(v.book.title).includes(q)) : views
  const playable = (v: BookView) => v.summary.positionSec > 0 && v.book.status === 'ready'
  const hero = q ? undefined : views.find((v) => v.book.id === activeId && playable(v)) ?? views.filter(playable).sort((a, b) => (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0))[0]
  // The design hides the grid for a single book because its Continue card shows it; without progress there is no card, so show the grid.
  const showGrid = shown.length > 0 && (n >= 2 || !hero)
  const subtitle = n === 0 ? t('library.nothing') : t(!online ? 'library.subtitleOffline' : pwa.offlineReady ? 'library.subtitle' : 'library.subtitlePreparing', { count: n })
  const options = suggest(views.map((v) => ({ ...v, title: v.book.title })), query).map(({ item, start, end }) => ({ id: item.book.id, content: <Suggested view={item} start={start} end={end} /> }))
  const openInstall = () => useUi.setState({ installOpen: true })

  return (
    <div className="lb-screen">
      <PageHeader
        title={t('common.library')}
        subtitle={subtitle}
        action={!desktop && <IconButton label={t('common.settings')} icon="settings" onClick={() => navigate('/settings')} />}
      />

      <AnimatePresence initial={false}>
        {pwa.needRefresh && !updateDismissed && (
          <motion.div key="update" {...p.reveal}>
            <UpdateBanner busy={busy} onRestart={() => !busy && pwa.apply()} onLater={() => useUi.setState({ updateDismissed: true })} />
          </motion.div>
        )}
      </AnimatePresence>

      <Reveal show={n > 0 && !desktop} className="lb-lib-actions">
        <Button icon="plus" onClick={() => navigate('/add')}>{t('common.addBook')}</Button>
        <Button variant="secondary" icon="download" onClick={() => navigate('/receive')}>{t('common.receive')}</Button>
      </Reveal>

      <Reveal show={n >= 1}><SearchField value={query} onChange={setQuery} options={options} onPick={openBook} /></Reveal>

      <Reveal show={!!hero}>{hero && <Hero view={hero} onOpen={() => navigate(`/book/${hero.book.id}`)} />}</Reveal>

      <Reveal show={showGrid} className="lb-grid-wrap">
        <div className="lb-grid-head">
          <h2>{t('library.all')}</h2>
          <span>{q ? t('library.count', { shown: shown.length, total: n }) : n}</span>
        </div>
        <div role="list" className="lb-grid">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((v, i) => (
              <Card key={v.book.id} view={v} index={i} isNew={v.book.id === newBookId} onOpen={openBook} onMenu={setMenu} />
            ))}
          </AnimatePresence>
        </div>
      </Reveal>

      <Reveal show={!!q && shown.length === 0} className="lb-noresults" role="status">
        <EmptyState icon="search" title={t('library.noResults', { query: query.trim() })} body={t('library.noResultsBody')} action={{ label: t('library.clearSearch'), onClick: () => setQuery('') }} />
      </Reveal>

      <Reveal show={n === 1}><p className="lb-single">{t('library.single')}</p></Reveal>

      <Reveal show={n === 0}>
        <EmptyState variant="hero" title={t('library.emptyTitle')} body={t('library.emptyBody')} art={<EmptyArt />}>
          <div className="lb-empty-actions">
            <Button size="dialog" icon="plus" fullWidth onClick={() => navigate('/add')}>{t('common.addBook')}</Button>
            <Button size="dialog" variant="secondary" icon="download" fullWidth onClick={() => navigate('/receive')}>{t('library.receiveFrom')}</Button>
          </div>
          {isSafariTab() && (
            <div className="lb-safari">
              <Ic name="info" size={22} />
              <span>
                {t('library.safariNote')}
                <button type="button" className="lb-textlink" onClick={openInstall}>{t('library.howToInstall')}</button>
              </span>
            </div>
          )}
        </EmptyState>
      </Reveal>

      <BookActions view={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

/** Play button action for a book: pause it when it is the one playing, else start or resume it. */
function usePlayAction(id: string) {
  const playing = usePlayer((s) => s.book?.id === id && s.state.status === 'playing')
  return [playing, useCallback(() => void (playing ? togglePlay() : startListening(id)), [playing, id])] as const
}

// memo + stable callbacks: a progress write re-renders only the card whose book changed.
const Card = memo(function Card({ view, index, isNew, onOpen, onMenu }: { view: BookView; index: number; isNew: boolean; onOpen: (id: string) => void; onMenu: (v: BookView) => void }) {
  const book = useSummary(view)
  const id = view.book.id
  const active = usePlayer((s) => s.book?.id === id)
  const [playing, onPlay] = usePlayAction(id)
  const open = useCallback(() => onOpen(id), [onOpen, id])
  const menu = useCallback(() => onMenu(view), [onMenu, view])
  return <BookCard book={book} index={index} isNew={isNew} isActive={active} isPlaying={playing} onOpen={open} onMenu={menu} onPlay={onPlay} />
})

/** One autocomplete row: small cover, title with the matched part marked, duration or progress. */
function Suggested({ view, start, end }: { view: BookView; start: number; end: number }) {
  const book = useSummary(view)
  const title = view.book.title
  return (
    <>
      <BookCover book={book} size="xs" style={{ '--w': '30px', '--cover-r': '6px' } as CSSProperties} />
      <span className="lb-suggest-text">
        <span className="lb-ellipsis">{title.slice(0, start)}<mark>{title.slice(start, end)}</mark>{title.slice(end)}</span>
        <small className="lb-ellipsis">{bookMeta(view.summary).text}</small>
      </span>
    </>
  )
}

function Hero({ view, onOpen }: { view: BookView; onOpen: () => void }) {
  const book = useSummary(view)
  const [playing, onToggle] = usePlayAction(view.book.id)
  return <ContinueCard book={book} chapterLine={chapterLine(view)} isPlaying={playing} onOpen={onOpen} onToggle={onToggle} />
}

/** Three covers that bob in once (stagger 40 ms, never blocks input). Decorative. */
function EmptyArt() {
  const p = usePreset()
  const reduce = !('transform' in p.page.initial)
  const covers: [string, number, number, CSSProperties][] = [
    ['-9deg', 0.12, 0, { left: 14, top: 30, width: 92, background: '#2A1E17', boxShadow: 'var(--lb-shadow-card)', padding: 12, justifyContent: 'space-between' }],
    ['8deg', 0.2, 1, { right: 14, top: 22, width: 92, background: '#FFC93C', boxShadow: 'var(--lb-shadow-card)', padding: 12, justifyContent: 'flex-end', gap: 6 }],
    ['-1deg', 0.04, 2, { left: 62, top: 8, width: 96, border: '2.5px dashed var(--lb-border-strong)', background: 'var(--lb-bg)', alignItems: 'center', justifyContent: 'center', color: 'var(--lb-text-muted)' }],
  ]
  const bar = (w: string, h: number, bg: string) => <div style={{ height: h, width: w, borderRadius: 9, background: bg }} />
  return (
    <div className="lb-empty-art" aria-hidden="true">
      {covers.map(([r, delay, i, style]) => (
        <motion.div
          key={i}
          style={{ ...style, display: 'flex', flexDirection: 'column' }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(18px) rotate(${r})` }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: `translateY(0px) rotate(${r})` }}
          transition={reduce ? p.springSoft : { type: 'spring', duration: 0.7, bounce: 0.35, delay }}
        >
          {i === 0 && <><div style={{ width: 22, height: 22, borderRadius: '50%', background: '#FFC93C' }} />{bar('60%', 6, '#FBF4EA')}</>}
          {i === 1 && <>{bar('80%', 8, '#2A1E17')}{bar('50%', 8, '#2A1E17')}</>}
          {i === 2 && <Ic name="plus" size={30} />}
        </motion.div>
      ))}
    </div>
  )
}
