import { useState } from 'react'
import { createSHA256 } from 'hash-wasm'
import { ImportCoordinator } from '../src/features/import/ImportCoordinator'
import { db } from '../src/services/db/database'
import { MediaStorage } from '../src/services/opfs/MediaStorage'
import { openPlayer, startListening } from '../src/features/playback/api'

export default function ImportHarness() {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState('')
  const [bookId, setBookId] = useState('')
  async function run() {
    setStatus('working'); setResult('')
    const coordinator = new ImportCoordinator()
    try {
      const book = await coordinator.importBook({ title: 'Browser test', files })
      const assets = await db.assets.where('bookId').equals(book.id).toArray()
      const hashes: Record<string, string> = {}
      for (const asset of assets) {
        const file = await new MediaStorage().read(asset.path)
        const hash = await createSHA256()
        for (let offset = 0; offset < file.size; offset += 1024 * 1024) hash.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()))
        hashes[asset.originalFilename] = hash.digest('hex')
      }
      setResult(JSON.stringify(hashes)); setBookId(book.id); setStatus('ready')
    } catch (error) { setStatus(`error: ${String(error)} ${error instanceof Error ? error.stack || '' : ''}`) }
    finally { coordinator.dispose() }
  }
  return <main><label>Audio files<input type="file" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label><button onClick={() => void run()}>Import</button>{bookId && <button onClick={() => { void startListening(bookId); openPlayer() }}>Listen</button>}<p data-testid="status">{status}</p><pre data-testid="result">{result}</pre></main>
}
