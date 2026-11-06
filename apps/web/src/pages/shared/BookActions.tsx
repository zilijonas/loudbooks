import { useState } from 'react'
import { useNavigate } from 'react-router'
import { bookMeta } from '../../components/books/BookCard'
import { BookCover } from '../../components/books/BookCover'
import { formatBytes } from '../../components/format'
import { ActionList, type MenuAction } from '../../components/ui/Feedback'
import { AlertDialog, BottomSheet } from '../../components/ui/Overlays'
import { isBookActive, pause } from '../../features/playback/api'
import { t } from '../../i18n'
import { showToast } from '../../app/store'
import { commands, useSummary, type BookView } from './data'

/** "Book actions" sheet (centred dialog ≥ 768 px) plus the delete confirmation. `view` null = closed. */
export function BookActions({ view, onClose }: { view: BookView | null; onClose: () => void }) {
  const navigate = useNavigate()
  const [del, setDel] = useState<BookView | null>(null)
  const [busy, setBusy] = useState(false)
  // Keep the last book while the sheet animates out.
  const [last, setLast] = useState(view)
  if (view && view !== last) setLast(view)
  const shown = view ?? last

  const items: MenuAction[] = shown ? [
    { label: t('menu.edit'), icon: 'pencil', onClick: () => { onClose(); navigate(`/book/${shown.book.id}/edit`) } },
    // Send (LB-9), Export (LB-10) and Re-import attach their flows here.
    { label: t('menu.send'), icon: 'send', onClick: onClose },
    { label: t('menu.export'), icon: 'archive', onClick: onClose },
    ...(shown.book.status === 'missing' ? [{ label: t('menu.reimport'), icon: 'refresh' as const, onClick: onClose }] : []),
    { label: t('menu.delete'), icon: 'trash', danger: true, onClick: () => { setDel(shown); onClose() } },
  ] : []

  const confirm = async () => {
    if (!del || busy) return
    setBusy(true)
    try {
      if (isBookActive(del.book.id)) await pause()
      await commands.deleteBook(del.book.id)
      setDel(null)
      navigate('/', { replace: true })
      showToast(t('dialogs.deleted', { title: del.book.title }))
    } catch {
      setDel(null)
      showToast(t('dialogs.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BottomSheet open={!!view} onOpenChange={(o) => !o && onClose()} title={t('menu.title')}>
        {shown && <SheetBook view={shown} />}
        <ActionList items={items} />
      </BottomSheet>
      <AlertDialog
        open={!!del}
        danger
        title={t('dialogs.deleteTitle', { title: del?.book.title ?? '' })}
        body={t('dialogs.deleteBody', { size: formatBytes(del?.bytes ?? 0) })}
        note={del && isBookActive(del.book.id) ? t('dialogs.deletePlaying') : undefined}
        confirmLabel={t('dialogs.deleteBook')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirm}
        onCancel={() => setDel(null)}
      />
    </>
  )
}

function SheetBook({ view }: { view: BookView }) {
  const book = useSummary(view)
  return (
    <div className="lb-sheet-book">
      <BookCover book={book} size="sm" />
      <span>
        <strong>{book.title}</strong>
        <span>{bookMeta(book).text}</span>
      </span>
    </div>
  )
}
