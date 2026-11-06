import { useEffect, useState } from 'react'
import { createSHA256 } from 'hash-wasm'
import { ImportCoordinator } from '../src/features/import/ImportCoordinator'
import { db } from '../src/services/db/database'
import { MediaStorage } from '../src/services/opfs/MediaStorage'
import { openPlayer, startListening } from '../src/features/playback/api'
import { markWelcomeDone } from '../src/features/settings/settings'

export default function ImportHarness() {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState('')
  const [bookId, setBookId] = useState('')
  async function run(list: File[] = files) {
    setStatus('working'); setResult('')
    const coordinator = new ImportCoordinator()
    try {
      const book = await coordinator.importBook({ title: 'Browser test', files: list })
      await markWelcomeDone() // the harness bypasses Welcome; without this `#/` redirects there and hides the dock
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
  // Real-Safari audits can't use the file picker from AppleScript: they call this with same-origin audio URLs instead.
  useEffect(() => {
    Object.assign(window, { __lbImportUrls: async (urls: string[]) => run(await Promise.all(urls.map(async (u) => new File([await (await fetch(u)).blob()], decodeURIComponent(u.split('/').pop() ?? 'a.mp3'), { type: 'audio/mpeg' })))) })
  })
  return <main><label>Audio files<input type="file" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label><button onClick={() => void run()}>Import</button>{bookId && <button onClick={() => { void startListening(bookId); openPlayer() }}>Listen</button>}<p data-testid="status">{status}</p><pre data-testid="result">{result}</pre></main>
}
