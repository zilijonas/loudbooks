import { useState } from 'react'
import { SendDialog } from '../../features/transfer/SendDialog'
import { useTransfer } from '../../features/transfer/store'
import { useBookView, useSummary, type BookView } from './data'

/** The one Send dialog, for whichever book `startSend` opened (details tile or a book menu). */
export function SendHost() {
  const open = useTransfer((s) => s.send.bookId)
  // Keep the last book while the dialog animates out.
  const [id, setId] = useState(open)
  if (open && open !== id) setId(open)
  const view = useBookView(id ?? undefined)
  return view ? <Send view={view} /> : null
}

function Send({ view }: { view: BookView }) {
  const book = useSummary(view)
  return <SendDialog book={book} bytes={view.bytes} files={view.assets.length} />
}
