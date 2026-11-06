// OPFS session output: positioned writes for mediabunny's StreamTarget (spec 01 §8 step 6, [S21]).
import type { StreamTargetChunk } from 'mediabunny'

export const SESSIONS_DIR = ['loud-books', 'v1', 'sessions']

async function sessionsDir(): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory()
  for (const name of SESSIONS_DIR) dir = await dir.getDirectoryHandle(name, { create: true })
  return dir
}

export async function createSessionFile(sessionId: string, fileName: string) {
  const dir = await (await sessionsDir()).getDirectoryHandle(sessionId, { create: true })
  const handle = await dir.getFileHandle(fileName, { create: true })
  return { handle, path: [...SESSIONS_DIR, sessionId, fileName].join('/') }
}

export async function deleteSession(sessionId: string): Promise<void> {
  // A terminated worker releases its sync access handle asynchronously; until then removal is refused.
  for (let attempt = 0; ; attempt++) {
    try {
      await (await sessionsDir()).removeEntry(sessionId, { recursive: true })
      return
    } catch (error) {
      const name = (error as DOMException).name
      if (name === 'NotFoundError') return
      if (name !== 'NoModificationAllowedError' || attempt >= 40) throw error
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

type SyncHandle = {
  write(data: Uint8Array, options: { at: number }): number
  flush(): void
  close(): void
}

/**
 * A WritableStream that honours each chunk's byte `position` (containers rewrite headers on finalize).
 * Uses FileSystemSyncAccessHandle in a dedicated worker; falls back to createWritable() elsewhere.
 * `release()` closes the underlying handle even if the stream was never closed (cancel/error paths).
 */
export async function openPositionedWritable(handle: FileSystemFileHandle, onWritten: (bytes: number) => void) {
  const fileHandle = handle as FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> }
  if (typeof fileHandle.createSyncAccessHandle === 'function') {
    const sync = await fileHandle.createSyncAccessHandle()
    let open = true
    const release = () => {
      if (open) sync.close()
      open = false
    }
    const stream = new WritableStream<StreamTargetChunk>({
      write(chunk) {
        const written = sync.write(chunk.data, { at: chunk.position })
        if (written !== chunk.data.byteLength) throw new DOMException('Short write to session file', 'QuotaExceededError')
        onWritten(written)
      },
      close() {
        sync.flush()
        release()
      },
      abort: release,
    })
    return { stream, release }
  }
  const writable = await handle.createWritable()
  let open = true
  const release = async () => {
    if (open) await writable.abort().catch(() => {})
    open = false
  }
  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      await writable.write({ type: 'write', position: chunk.position, data: chunk.data })
      onWritten(chunk.data.byteLength)
    },
    async close() {
      open = false
      await writable.close()
    },
    abort: release,
  })
  return { stream, release }
}
