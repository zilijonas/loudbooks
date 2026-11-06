// Media worker: runs the SessionCompiler off the main thread (OPFS sync access handles only exist here).
// Cancellation terminates the worker (see media-client): the copy loop never yields long enough to read a message.
import { expose } from 'comlink'
import { compileSession, type CompileProgress, type CompileRequest } from '../services/media/session-compiler'

const api = {
  compile: (request: CompileRequest, getFile: (assetId: string) => Promise<Blob>, onProgress?: (p: CompileProgress) => void) =>
    compileSession(request, { getFile, onProgress }),
}

export type MediaWorkerApi = typeof api
expose(api)
