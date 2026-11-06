// Main-thread entry to the media worker. One worker per compile, so cancelling can terminate it outright.
import { proxy, wrap } from 'comlink'
import type { MediaWorkerApi } from '../../workers/media.worker'
import { deleteSession } from './opfs-output'
import { CompileError, type CompileProgress, type CompileRequest, type CompileResult } from './session-compiler'

export function compileInWorker(
  request: CompileRequest,
  options: { getFile(assetId: string): Promise<Blob>; signal?: AbortSignal; onProgress?(p: CompileProgress): void },
): Promise<CompileResult> {
  const { signal } = options
  const cancelled = () => new CompileError('AbortError', 'Session preparation was cancelled')
  if (signal?.aborted) return Promise.reject(cancelled())
  const worker = new Worker(new URL('../../workers/media.worker.ts', import.meta.url), { type: 'module', name: 'media' })
  const api = wrap<MediaWorkerApi>(worker)
  return new Promise<CompileResult>((resolve, reject) => {
    const onAbort = () => {
      worker.terminate()
      // The partial file (or a file finished in the same instant) must not survive a cancel.
      deleteSession(request.sessionId).then(() => reject(cancelled()), reject)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    api
      .compile(request, proxy(options.getFile), options.onProgress && proxy(options.onProgress))
      .then((result) => (signal?.aborted ? undefined : resolve(result)), (error) => (signal?.aborted ? undefined : reject(error)))
      .finally(() => {
        signal?.removeEventListener('abort', onAbort)
        worker.terminate()
      })
  })
}
