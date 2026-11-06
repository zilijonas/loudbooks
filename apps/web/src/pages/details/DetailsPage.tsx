import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { BookCover } from '../../components/books/BookCover'
import { ChapterList, ChapterRow } from '../../components/books/Chapters'
import { formatBytes, formatDuration } from '../../components/format'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, Progress } from '../../components/ui/Controls'
import { BackButton } from '../../components/ui/Navigation'
import { Reveal } from '../../components/ui/Reveal'
import { openPlayer, startListening } from '../../features/playback/api'
import { SendDialog } from '../../features/transfer/SendDialog'
import { startSend } from '../../features/transfer/TransferCoordinator'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { useUi } from '../../app/store'
import { BookActions } from '../shared/BookActions'
import { chapterIndexAt, chapterTitle, resumeLabel, useLibrary, useSummary, type BookView } from '../shared/data'

export function DetailsPage() {
  const { id } = useParams()
  const views = useLibrary()
  if (views === undefined) return null
  const view = views.find((v) => v.book.id === id)
  // Deleted or unknown book: back to the library (Back must not land here again).
  if (!view) return <Navigate to="/" replace />
  return <Details view={view} />
}

function Details({ view }: { view: BookView }) {
  const navigate = useNavigate()
  const p = usePreset()
  const book = useSummary(view)
  const isNew = useUi((s) => s.newBookId) === view.book.id
  const [descOpen, setDescOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const { durationSec: total, positionSec: pos, status } = book
  const done = status === 'completed'
  const missing = status === 'missing'
  const single = view.assets.length === 1 && !view.parts
  const ci = chapterIndexAt(view.chapters, pos)
  const long = view.book.description.length > 140
  const play = (chapterId?: string) => { void startListening(view.book.id, chapterId); openPlayer() }
  const kind = view.assets.length === 1 ? (view.parts ? t('details.oneFileParts', { count: view.chapters.length }) : t('details.oneFile')) : t('details.chapterCount', { count: view.chapters.length })

  return (
    <div className="lb-screen lb-details">
      <div className="lb-details-top">
        <BackButton label={t('common.library')} onClick={() => navigate('/')} />
        <IconButton label={t('library.moreTitle', { title: book.title })} icon="more" onClick={() => setMenu(true)} />
      </div>
      <div className="lb-details-grid">
        <motion.div
          className="lb-details-cover"
          data-missing={missing || undefined}
          initial={isNew ? p.success.initial : false}
          animate={p.success.animate}
          transition={p.success.transition}
        >
          <BookCover book={book} layoutId={`cover-${book.id}`} style={{ '--cover-r': '20px' } as CSSProperties} />
        </motion.div>
        <div className="lb-details-main">
          <div className="lb-details-info">
            <h1>{book.title}</h1>
            <span>{t('details.meta', { duration: formatDuration(total), kind, size: formatBytes(view.bytes) })}</span>
            {done && <Badge tone="success" icon="check">{t('common.finished')}</Badge>}
            {missing && <Badge tone="warning" icon="alert">{t('details.missingBadge')}</Badge>}
          </div>
          {view.book.description && (
            <div className="lb-desc">
              <p data-clamped={(long && !descOpen) || undefined}>{view.book.description}</p>
              {long && <button type="button" onClick={() => setDescOpen((o) => !o)}>{t(descOpen ? 'details.showLess' : 'details.showMore')}</button>}
            </div>
          )}
          <div className="lb-details-prog">
            <Progress value={total ? pos / total : 0} label={t('details.listened', { percent: Math.round((pos / (total || 1)) * 100) })} height={8} tone={missing ? 'warning' : done ? 'success' : 'muted'} decorative />
            <div>
              <span>{done ? t('common.finished') : t('details.listened', { percent: Math.round((pos / (total || 1)) * 100) })}</span>
              <span>{done ? formatDuration(total) : t('library.left', { duration: formatDuration(total - pos) })}</span>
            </div>
          </div>
          <Button size="lg" icon="play" fullWidth disabled={missing} onClick={() => play()}>
            {missing ? t('library.missing') : done ? t('details.again') : pos > 0 ? resumeLabel(view) : t('details.fromStart')}
          </Button>
          <div className="lb-tiles">
            <Button variant="secondary" shape="tile" icon="pencil" onClick={() => navigate(`/book/${view.book.id}/edit`)}>{t('common.edit')}</Button>
            <Button variant="secondary" shape="tile" icon="send" onClick={() => startSend(view.book.id)}>{t('common.send')}</Button>
            <Button variant="secondary" shape="tile" icon="more" onClick={() => setMenu(true)}>{t('common.more')}</Button>
          </div>
          <section className="lb-chsec">
            <div className="lb-sec-head">
              <h2>{t(view.parts ? 'details.parts' : 'details.chapters')}</h2>
              <span>{single ? t('details.singleFile') : view.chapters.length}</span>
            </div>
            <Reveal show={single} as="div"><p className="lb-single-note">{t('details.singleNote', { duration: formatDuration(total) })}</p></Reveal>
            <ChapterList label={t(view.parts ? 'details.parts' : 'details.chapters')}>
              {view.chapters.map((c, i) => {
                const current = i === ci && pos > 0 && !done
                return (
                  <ChapterRow
                    key={c.id}
                    index={i}
                    title={chapterTitle(view, c, i)}
                    durationSec={c.globalEnd - c.globalStart}
                    status={done || i < ci ? 'done' : current ? 'current' : 'upcoming'}
                    playing={false}
                    positionInChapterSec={current ? pos - c.globalStart : undefined}
                    onPlay={() => play(c.id)}
                  />
                )
              })}
            </ChapterList>
          </section>
        </div>
      </div>
      <BookActions view={menu ? view : null} onClose={() => setMenu(false)} />
      <SendDialog book={book} bytes={view.bytes} files={view.assets.length} />
    </div>
  )
}
