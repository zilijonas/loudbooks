// Dev-only component gallery (#/__gallery, registered only when import.meta.env.DEV). Fixture copy here is demo data.
// The first sections mirror design/Component Library.dc.html one-to-one for side-by-side screenshots; "More" holds the rest.
import { AnimatePresence } from 'motion/react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { BookCard, ContinueCard, NewBadge } from '../../components/books/BookCard'
import type { BookSummary } from '../../components/books/BookCover'
import { ChapterList, ChapterRow, EditableChapterList, EditableChapterRow, type EditableChapter } from '../../components/books/Chapters'
import { CoverPicker } from '../../components/books/CoverPicker'
import type { Art } from '../../components/books/cover'
import { Ic } from '../../components/icons'
import { MiniPlayer, PlayerBar } from '../../components/player/Bars'
import { ActiveSessionBadge, PlaybackControls, Scrubber, type PlayerStatus, type TimerSetting } from '../../components/player/Playback'
import { SpeedSelector, TimerSheet } from '../../components/player/Sheets'
import { PairingCode, QR, TransferProgress, Viewfinder, ReceiveScanner } from '../../components/transfer/Transfer'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, Progress, SegmentedControl, Skeleton, Switch } from '../../components/ui/Controls'
import { ActionList, EmptyState, Menu, StatusPanel, StatusRow, Toast, UpdateBanner, type MenuAction } from '../../components/ui/Feedback'
import { FileDropzone, SearchField, TextArea, TextField } from '../../components/ui/Fields'
import { BackButton, InstallGuide, Logo, PageHeader, Sidebar, TopBar } from '../../components/ui/Navigation'
import { AlertDialog, BottomSheet, Dialog } from '../../components/ui/Overlays'
import { StorageBar } from '../../components/ui/StorageBar'
import { useTheme } from '../../theme/ThemeProvider'
import './gallery.css'

const noop = () => {}
const book = (id: string, title: string, durationSec: number, positionSec: number, status: BookSummary['status'] = 'ready'): BookSummary =>
  ({ id, title, durationSec, positionSec, status, chapterCount: 14, singleFile: false })

const ART: Record<string, Partial<Art>> = {
  salt: { bg: '#FF6B4A', fg: '#2A1E17', accent: '#2A1E17', border: '0', justify: 'space-between', author: 'Mara Quell' },
  light: { bg: '#2A1E17', fg: '#FBF4EA', accent: '#FFC93C', border: '0', justify: 'space-between', author: 'Ines Abernathy' },
  moth: { bg: '#93301C', fg: '#FBF4EA', accent: '#FF9878', border: '0', justify: 'flex-start', author: 'J. P. Amari' },
  north: { bg: '#FFC93C', fg: '#2A1E17', accent: '#C23E22', border: '0', justify: 'flex-end', author: 'Tomas Reyl' },
  orchard: { bg: '#FFF3CF', fg: '#2A1E17', accent: '#FF6B4A', border: '0', justify: 'flex-end', author: 'Kasimir Vale' },
  q: { bg: '#FFFBF5', fg: '#2A1E17', accent: '#FF6B4A', border: '2px solid #2A1E17', justify: 'flex-start', author: '' },
}
const CARDS: { state: string; book: BookSummary; art?: Partial<Art>; cls?: string }[] = [
  { state: 'default', book: book('b1', 'Salt & Static', 63947, 39647), art: ART.salt },
  { state: 'hover', book: book('b2', "The Lighthouse Keeper's Almanac of Small Weather", 49171, 8851), art: ART.light, cls: 'g-card-hover' },
  { state: 'pressed', book: book('b5', 'Moth Hours', 17357, 12497), art: ART.moth, cls: 'g-card-pressed' },
  { state: 'finished', book: book('b3', 'North of Nowhere', 21900, 21900, 'completed'), art: ART.north },
  { state: 'generated', book: book('b4', 'A Field Guide to Quiet Rooms', 5520, 0) },
  { state: 'missing', book: book('b6', 'The Orchard at the End of the Line', 72120, 3606, 'missing'), art: ART.orchard },
  { state: 'one-letter', book: book('q', 'Q', 720, 0), art: ART.q },
]
const MENU: MenuAction[] = [
  { label: 'Edit details and chapters', icon: 'pencil', onClick: noop },
  { label: 'Send to another device', icon: 'send', onClick: noop },
  { label: 'Export backup', icon: 'archive', onClick: noop },
  { label: 'Delete book', icon: 'trash', onClick: noop, danger: true },
]
const STORAGE = [
  { label: 'Books', bytes: 4_210_000_000, tokenColor: 'var(--lb-action)', description: '6 books' },
  { label: 'Continuous-book cache', bytes: 566_000_000, tokenColor: 'var(--lb-highlight)', description: 'Lets multi-file books play to the end without a timer' },
  { label: 'Temporary sessions', bytes: 420_000_000, tokenColor: 'var(--lb-text-muted)', description: 'Prepared listening sessions' },
  { label: 'App files', bytes: 330_000_000, tokenColor: 'var(--lb-border-strong)', description: 'Loud Books itself, for offline use' },
]

function Sec({ title, api, children }: { title: string; api: string; children: ReactNode }) {
  return (
    <section className="g-sec">
      <h2>{title}</h2>
      <code>{api}</code>
      {children}
    </section>
  )
}

function Cell({ cap, children }: { cap: string; children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}<span className="g-cap">{cap}</span></div>
}

export function Gallery() {
  const { resolved, setPreference } = useTheme()
  const [params] = useSearchParams()
  const forced = params.get('theme')
  useEffect(() => { if (forced === 'light' || forced === 'dark') setPreference(forced) }, [forced, setPreference])

  const [status, setStatus] = useState<PlayerStatus>('paused')
  const [speed, setSpeed] = useState(1)
  const [sw, setSw] = useState(true)
  const [code, setCode] = useState('4829')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [query, setQuery] = useState('')
  const [cover, setCover] = useState<Blob | null>(null)
  const [pos, setPos] = useState(760)
  const [timer, setTimer] = useState<TimerSetting>({ mode: 'minutes', minutes: 30 })
  const [open, setOpen] = useState<null | 'dialog' | 'sheet' | 'alert' | 'typed' | 'timer' | 'speed' | 'install' | 'menu'>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [mini, setMini] = useState(false)
  const [files, setFiles] = useState<EditableChapter[]>([
    { id: 'f1', title: 'The Front Door', filename: 'Quiet Rooms 1 - The Front Door.mp3', durationSec: 1680, bytes: 25_800_000, status: 'ok' },
    { id: 'f2', title: 'The Reading Room', filename: 'Quiet Rooms 2 - The Reading Room.mp3', durationSec: 2040, bytes: 31_200_000, status: 'ok' },
    { id: 'f3', title: 'The Attic', filename: 'Quiet Rooms 10 - The Attic.mp3', status: 'checking' },
    { id: 'f4', title: 'Quiet Rooms extras', filename: 'Quiet Rooms extras.flac', status: 'error', error: "FLAC isn't supported yet. Use MP3, M4A/M4B or WAV." },
  ])
  const move = (from: number, to: number) => setFiles((f) => { const n = [...f]; const [x] = n.splice(from, 1); n.splice(to, 0, x!); return n })
  const salt = CARDS[0]!.book
  const playingBook = { ...salt, id: 'now' } // own layoutId so fixtures don't steal the grid card's cover
  const close = () => setOpen(null)

  return (
    <div className="g-page">
      <div className="g-wrap">
        <header className="g-head">
          <div>
            <div className="g-kicker">Phase 2 · Component library</div>
            <h1>Components &amp; states</h1>
            <p>Each component uses semantic tokens only, so the theme switch repaints everything. Hover and press the controls to feel the motion. API signatures match <code>components/api.d.ts</code>.</p>
          </div>
          <div style={{ width: 202 }}>
            <SegmentedControl label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={resolved} onChange={setPreference} />
          </div>
        </header>

        <Sec title="Button" api={'<Button variant="primary|secondary|strong|ghost|danger" size="md|lg" icon? loading? disabled? fullWidth?>'}>
          <div className="g-grid">
            <div className="g-card">
              <span className="g-label">Variants</span>
              <div className="g-row">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="strong">Strong</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger-outline">Danger outline</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>
            <div className="g-card">
              <span className="g-label">States (primary)</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                <Cell cap="action"><Button fullWidth>Default</Button></Cell>
                <Cell cap="fine pointer only"><Button fullWidth className="lb-btn g-hover">Hover</Button></Cell>
                <Cell cap="scale .96 · 110 ms"><Button fullWidth className="lb-btn g-pressed">Pressed</Button></Cell>
                <Cell cap="3 px ring + 2 px gap"><Button fullWidth className="lb-btn g-focus">Focus visible</Button></Cell>
                <Cell cap="explain why nearby"><Button fullWidth disabled>Disabled</Button></Cell>
                <Cell cap="loading keeps width"><Button fullWidth loading>Saving</Button></Cell>
              </div>
            </div>
          </div>
        </Sec>

        <Sec title="Playback" api="<PlaybackControls state onToggle onSeek /> · <SeekButtons back={30} forward={15} /> · <TimeDisplay value kind=&quot;elapsed|remaining|session&quot; /> · <ActiveSessionBadge mode remaining paused /> · <SessionPreparation phase reason />">
          <div className="g-grid" style={{ '--min': '340px' } as CSSProperties}>
            <div className="g-card" style={{ gap: 16, alignItems: 'center' }}>
              <PlaybackControls status={status} onToggle={() => setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))} onBack={noop} onForward={noop} />
              <div className="g-row g-variants" style={{ justifyContent: 'center', gap: 12 }}>
                <PlaybackControls status="preparing" onToggle={noop} onBack={noop} onForward={noop} />
                <PlaybackControls status="ready" onToggle={noop} onBack={noop} onForward={noop} />
              </div>
              <span className="g-cap2" style={{ lineHeight: 1.4, textAlign: 'center' }}>Play/Pause, preparing, and &quot;Ready — play&quot; for when the browser needs another tap.</span>
            </div>
            <div className="g-card" style={{ gap: 14 }}>
              <Scrubber positionSec={pos} chapterDurationSec={2460} bookLeftSec={24300} onScrub={setPos} onCommit={setPos} />
              <div className="g-row" style={{ gap: 8 }}>
                <ActiveSessionBadge timer={{ mode: 'minutes', minutes: 30 }} listeningLeftSec={1694} paused={false} onPress={noop} />
                <ActiveSessionBadge timer={{ mode: 'chapters', count: 1 }} stopChapterLabel="4" paused={false} onPress={noop} />
                <ActiveSessionBadge timer={{ mode: 'minutes', minutes: 30 }} listeningLeftSec={1694} paused onPress={noop} />
              </div>
            </div>
            <div className="g-card" style={{ gap: 14 }}>
              <span className="g-label">SpeedSelector · SegmentedControl</span>
              <SegmentedControl label="Speed" size="lg" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[...[0.75, 1, 1.25, 1.5].map((v) => ({ value: String(v), label: `${v}×` })), { value: 'c', label: 'Custom' }]} />
              <span className="g-label" style={{ marginTop: 6 }}>Switch</span>
              <Switch label="Show 30-minute parts" checked={sw} onChange={setSw} />
              <span className="g-label" style={{ marginTop: 6 }}>Progress</span>
              <Progress value={0.62} label="Import" />
              <Progress label="Preparing" height={6} />
            </div>
          </div>
        </Sec>

        <Sec title="Books" api={'<BookCover book size="xs|sm|md|lg|fluid" /> · <GeneratedCover title /> · <BookCard book state onOpen onPlay onMenu /> · <BookRow /> · <Badge tone="success|warning|neutral" />'}>
          <div className="g-books" role="list">
            {CARDS.map((c, i) => (
              <div key={c.state} className={c.cls} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BookCard book={c.book} art={c.art} index={i} isActive={false} isPlaying={false} isNew={false} onOpen={noop} onPlay={noop} onMenu={noop} />
                <code>state=&quot;{c.state}&quot;</code>
              </div>
            ))}
          </div>
          <div className="g-row">
            <Badge tone="success" icon="check">Finished</Badge>
            <NewBadge />
            <Badge tone="warning" icon="alert">Audio file missing</Badge>
            <Badge tone="danger" icon="alert">Can&apos;t be used</Badge>
          </div>
        </Sec>

        <Sec title="Chapters & reorder" api="<ChapterRow chapter status=&quot;upcoming|current|done&quot; onPlay /> · <EditableChapterRow onRename onMoveUp onMoveDown onRemove dragging? error? /> · <ReorderHandle />">
          <div className="g-grid" style={{ '--min': '420px' } as CSSProperties}>
            <ChapterList>
              <ChapterRow index={2} title="Static on the Line" durationSec={2280} status="done" onPlay={noop} />
              <ChapterRow index={3} title="The Long Tide" durationSec={2460} status="current" playing positionInChapterSec={754} onPlay={noop} />
              <ChapterRow index={4} title="On the Correct Interpretation of Fog, With Notes for the Inexperienced Keeper" durationSec={2640} status="upcoming" onPlay={noop} />
            </ChapterList>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <EditableChapterRow {...files[0]!} index={0} count={3} onRename={noop} onMoveDown={noop} onRemove={noop} />
              <div style={{ position: 'relative', height: 76 }}>
                <div className="lb-edit-placeholder" style={{ position: 'absolute', inset: 0 }} />
                <div style={{ position: 'absolute', inset: 0, transform: 'translateY(-14px) scale(1.03)' }}>
                  <EditableChapterRow {...files[1]!} index={1} count={3} lifted onRename={noop} onMoveUp={noop} onMoveDown={noop} onRemove={noop} />
                </div>
              </div>
              <EditableChapterRow {...files[3]!} index={2} count={3} onRename={noop} onMoveUp={noop} onRemove={noop} />
            </div>
          </div>
        </Sec>

        <Sec title="Fields" api="<TextField label hint? error? required? inputMode /> · <TextArea /> · <FileDropzone accept multiple onFiles /> · <CoverPicker value onChange /> · <Select />">
          <div className="g-grid" style={{ '--min': '260px' } as CSSProperties}>
            <TextField label="Default" value={title} onChange={setTitle} placeholder="Book title" />
            <div className="g-focus-wrap"><TextFieldFocused /></div>
            <TextField label="Error" value="" onChange={noop} error="Add a title to save this book." />
            <TextField label="Disabled" value="482915" onChange={noop} disabled />
            <div style={{ gridColumn: '1 / -1' }}>
              <FileDropzone accept={['audio/*']} onFiles={noop} label="Choose audio files" note="or drop them here · on drag-over the border turns ink and the box lifts 2 px" />
            </div>
          </div>
        </Sec>

        <Sec title="Transfer" api={'<SendBookDialog book step /> · <ReceiveScanner onResult onPaste /> · <PairingCode digits role="show|enter" /> · <TransferProgress bytes total fileIndex fileCount />'}>
          <div className="g-grid">
            <div className="g-card" style={{ alignItems: 'center', gap: 14 }}>
              <QR payload="https://zilijonas.github.io/loudbooks/#pair=demo-482915" size={180} label="Pairing code" />
              <span className="lb-waiting"><Ic name="spin" size={18} />Waiting for your phone</span>
            </div>
            <div className="g-card" style={{ alignItems: 'center', justifyContent: 'center', gap: 18 }}>
              <PairingCode role="show" digits="482915" />
              <div style={{ width: '100%', maxWidth: 280 }}><PairingCode role="enter" digits={code} onChange={setCode} /></div>
            </div>
            <div className="g-card" style={{ justifyContent: 'center', gap: 10 }}>
              <TransferProgress title="Receiving Moth Hours" bytesDone={138_000_000} bytesTotal={270_000_000} fileIndex={5} fileCount={8} direction="receive" />
            </div>
            <div style={{ maxWidth: 300 }}><Viewfinder /></div>
          </div>
        </Sec>

        <Sec title="Feedback & overlays" api="<Toast /> · <Menu /> · <Tooltip side delay={500} instantAfterFirst /> · <Dialog /> · <AlertDialog tone=&quot;danger&quot; /> · <BottomSheet snap dismissible /> · <Skeleton /> · <EmptyState /> · <ErrorState /> · <StorageBar segments /> · <MiniPlayer />">
          <div className="g-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lb-toast">Temporary files cleared. 566 MB freed.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconButton label="Chapters" icon="list" variant="filled" tooltip />
                <span className="g-tip">Chapters</span>
                <span className="g-cap2">Tooltip, desktop only. Touch targets carry visible labels instead.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 20, background: 'var(--lb-surface)' }}>
                <Skeleton width="60%" />
                <Skeleton width="85%" />
                <span className="g-cap2">Skeleton: only for loads over 300 ms; never for local reads that are instant.</span>
              </div>
            </div>
            <div role="presentation" className="lb-menu g-static-menu">
              {MENU.map((m, i) => (
                <div key={m.label}>
                  {m.danger && <div className="lb-menu-sep" />}
                  <div className="lb-menu-item" data-danger={m.danger || undefined} style={i === 0 ? { background: 'var(--lb-surface-sunken)' } : undefined}><Ic name={m.icon} size={22} />{m.label}</div>
                </div>
              ))}
            </div>
            <div className="lb-ov-panel" style={{ padding: 20, gap: 14, alignSelf: 'start' }}>
              <strong className="lb-ov-title" style={{ padding: 0 }}>Delete “Moth Hours”?</strong>
              <span className="lb-dialog-body" style={{ fontSize: 15 }}>This removes the book and its audio (270 MB) from this device. It can&apos;t be undone.</span>
              <Button variant="danger" size="dialog">Delete book</Button>
              <Button variant="secondary" size="dialog">Cancel</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="lb-storagebar">{STORAGE.map((s) => <span key={s.label} style={{ width: `${[76, 10, 8, 6][STORAGE.indexOf(s)]}%`, background: s.tokenColor }} />)}</div>
              <span className="g-cap2">StorageBar: books · continuous-book cache · temporary sessions · app files. Each segment is also listed as text.</span>
              <MiniPlayer book={{ ...salt, id: 'static' }} art={ART.salt} status="playing" subtitle="28:14 of listening left" onOpen={noop} onToggle={noop} />
              <span className="g-cap2">MiniPlayer: only while a book is active; hidden on Add/Edit so it never covers Save.</span>
            </div>
          </div>
          <div className="g-grid">
            <div className="g-card" style={{ padding: '28px 20px' }}>
              <EmptyState icon="search" title="EmptyState" body="Title, one sentence of help, one primary action. Art is optional and moves once." />
            </div>
            <div className="g-card" style={{ padding: '28px 20px' }}>
              <StatusPanel tone="warning" icon="wifi" title="Connection lost" body="Make sure both devices are on the same regular Wi-Fi, then try again." primary={{ label: 'Pair again', onClick: noop }} />
            </div>
            <div className="g-card" style={{ padding: '28px 20px' }}>
              <StatusPanel tone="success" icon="check" title="Your book is ready to listen offline" body="Moth Hours is now in your library on this phone." primary={{ label: 'Open book', onClick: noop }} />
            </div>
          </div>
        </Sec>

        <Sec title="More components" api="Not in the catalogue: compare against Screens.dc.html. Live overlays, navigation, sheets, forms.">
          <div className="g-grid">
            <div className="g-card">
              <span className="g-label">Overlays (live)</span>
              <div className="g-row">
                <Button variant="secondary" onClick={() => setOpen('dialog')}>Dialog</Button>
                <Button variant="secondary" onClick={() => setOpen('sheet')}>Menu sheet</Button>
                <Button variant="secondary" onClick={() => setOpen('alert')}>Alert</Button>
                <Button variant="secondary" onClick={() => setOpen('typed')}>Typed confirm</Button>
                <Button variant="secondary" onClick={() => setOpen('timer')}>Timer</Button>
                <Button variant="secondary" onClick={() => setOpen('speed')}>Speed</Button>
                <Button variant="secondary" onClick={() => setOpen('install')}>Install</Button>
                <Menu items={MENU} trigger={<Button variant="secondary" icon="more">Menu</Button>} />
                <Button variant="secondary" onClick={() => setToast({ id: Date.now(), text: 'Book added. Ready to listen offline.' })}>Toast</Button>
                <Button variant="secondary" onClick={() => setMini((m) => !m)}>Toggle mini-player</Button>
              </div>
            </div>
            <div className="g-card">
              <span className="g-label">Headers</span>
              <PageHeader title="Library" subtitle="6 books on this device · Works offline" action={<IconButton label="Settings" icon="settings" />} />
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 -12px' }}>
                <BackButton label="Library" onClick={noop} />
                <BackButton iconOnly label="Back to library" onClick={noop} />
              </div>
              <TopBar title="Add book" onClose={noop} action={{ label: 'Save', onClick: noop }} />
              <Logo size="lg" />
            </div>
            <div className="g-card">
              <span className="g-label">Library pieces</span>
              <ContinueCard book={salt} art={ART.salt} chapterLine="Chapter 4 of 14 · 6 h 45 min left" isPlaying={false} onOpen={noop} onToggle={noop} />
              <SearchField value={query} onChange={setQuery} />
              <UpdateBanner busy={false} onRestart={noop} onLater={noop} />
              <UpdateBanner busy onRestart={noop} onLater={noop} />
            </div>
            <div className="g-card">
              <span className="g-label">Form pieces</span>
              <CoverPicker title={title || 'A Field Guide to Quiet Rooms'} image={cover} onChange={setCover} />
              <TextField label="Title" required value={title} onChange={setTitle} />
              <TextArea label="Description" required={false} value={desc} onChange={setDesc} />
              <Switch label="Show 30-minute parts" description="Adds places to jump to every 30 minutes. These aren't the author's chapters, and your audio isn't changed." checked={sw} onChange={setSw} />
              <EditableChapterList items={files} onReorder={move} onRename={(id, v) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, title: v } : x)))} onRemove={(id) => setFiles((f) => f.filter((x) => x.id !== id))} />
            </div>
            <div className="g-card">
              <span className="g-label">Settings pieces</span>
              <StorageBar segments={STORAGE} availableEstimateBytes={21_000_000_000} />
              <StatusRow variant="card" icon="shield" tone="success" title="Protected from automatic cleanup" body="The browser won't remove your books to free space on its own." />
              <StatusRow icon="addHome" title="Running in the browser" body="Books added in the browser stay in the browser." action={{ label: 'How to install', onClick: noop }} />
              <StatusRow icon="check" tone="success" title="Ready for offline use" body="The app opens without a connection. Imported books always play offline." />
              <StatusRow icon="refresh" tone="action" title="An update is ready" body="It installs after you pause." action={{ label: 'Restart to update', onClick: noop }} actionStrong />
            </div>
            <div className="g-card">
              <span className="g-label">Status panels</span>
              <StatusPanel icon="spin" title="Importing Moth Hours" progress={{ value: 0.42, label: 'Copying audio to this device', sub: '113 / 270 MB · File 3 of 8' }} note="Keep this screen open until it finishes." secondary={{ label: 'Cancel', onClick: noop }} />
              <StatusPanel tone="danger" icon="alert" title="This book can't play right now" body="Part of the audio couldn't be read while preparing your session. Your place is saved." primary={{ label: 'Try again', onClick: noop }} secondary={{ label: 'Book details', onClick: noop }} tertiary={{ label: 'Back to library', onClick: noop }} />
              <StatusPanel indeterminate icon="wifi" tone="action" title="Connecting to your phone" body="Both devices need to be on the same Wi-Fi network." />
              <div className="g-row"><NewBadge /><Badge tone="neutral">Neutral</Badge><Badge tone="action" icon="moon">Action</Badge></div>
            </div>
            <div className="g-card">
              <span className="g-label">Receive scanner</span>
              <ReceiveScanner onPasteInstead={noop} onCancel={noop} />
            </div>
            <div className="g-card" style={{ gridColumn: '1 / -1', padding: 0, overflow: 'hidden' }}>
              <div className="g-shell">
                <Sidebar offlineReady items={[{ label: 'Library', icon: 'book', current: true, onClick: noop }, { label: 'Receive', icon: 'download', onClick: noop }, { label: 'Settings', icon: 'settings', onClick: noop }]} onAdd={noop} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <AnimatePresence>
                    {mini && <PlayerBar book={{ ...salt, id: 'bar' }} art={ART.salt} status={status} subtitle="Chapter 4 of 14 · 28:14 of listening left" speedLabel={`${speed}×`} timerLabel="28:14" timerActive onOpen={noop} onToggle={() => setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))} onBack={noop} onForward={noop} onSpeed={() => setOpen('speed')} onTimer={() => setOpen('timer')} />}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </Sec>
      </div>

      <div style={{ position: 'fixed', left: 12, right: 12, bottom: 40, zIndex: 30, maxWidth: 480, margin: '0 auto' }}>
        <AnimatePresence>{mini && <MiniPlayer key="mini" book={playingBook} art={ART.salt} status={status} subtitle="28:14 of listening left" onOpen={noop} onToggle={() => setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))} />}</AnimatePresence>
      </div>
      <Toast toast={toast} bottom="128px" />

      <Dialog open={open === 'dialog'} onOpenChange={(o) => !o && close()} title="Importing">
        <StatusPanel icon="spin" title="Importing Moth Hours" progress={{ value: 0.42, label: 'Copying audio to this device', sub: '113 / 270 MB' }} secondary={{ label: 'Close', onClick: close }} />
      </Dialog>
      <BottomSheet open={open === 'sheet'} onOpenChange={(o) => !o && close()} title="Book actions">
        <ActionList items={MENU.map((m) => ({ ...m, onClick: close }))} />
      </BottomSheet>
      <BottomSheet open={open === 'timer'} onOpenChange={(o) => !o && close()} title="Sleep timer">
        <TimerSheet value={timer} chaptersRemaining={10} speed={speed} chapterLeftSec={[1694, 4154, 6794]} onApply={(v) => { setTimer(v); close() }} onCustom={close} />
      </BottomSheet>
      <BottomSheet open={open === 'speed'} onOpenChange={(o) => !o && close()} title="Playback speed">
        <SpeedSelector value={speed} presets={[0.75, 1, 1.25, 1.5]} onChange={setSpeed} rebuildNotice summary={`At ${speed}×, an hour of listening covers ${Math.round(60 * speed)} min of the book.`} />
      </BottomSheet>
      <BottomSheet open={open === 'install'} onOpenChange={(o) => !o && close()} title="Install Loud Books">
        <InstallGuide onDone={close} />
      </BottomSheet>
      <AlertDialog open={open === 'alert'} danger title="Delete “Moth Hours”?" body="This removes the book and its audio (270 MB) from this device. It can't be undone." note="This book is playing now. Playback will stop." confirmLabel="Delete book" cancelLabel="Cancel" onConfirm={close} onCancel={close} />
      <AlertDialog open={open === 'typed'} danger typedConfirm="delete" title="Delete your whole library?" body="This removes 6 books (4.2 GB) and all listening progress from this device." confirmLabel="Delete library" cancelLabel="Cancel" onConfirm={close} onCancel={close} />
    </div>
  )
}

function TextFieldFocused() {
  const [v, setV] = useState('Moth Hours')
  return <div className="g-focus" style={{ outline: 'none' }}><TextField label="Focused" value={v} onChange={setV} /></div>
}

export default Gallery
