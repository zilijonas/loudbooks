// Direct book transfer (spec §11, docs/transfer-protocol.md): signaling pairs two devices, then one ordered, reliable
// DataChannel carries the manifest and 16 KiB chunks. Sender is bounded by receiver credit AND bufferedAmount; the
// receiver grants credit only after chunks are written to staging, verifies size + SHA-256 per file, and commits
// through ImportCoordinator. Verified files survive a lost connection, so a new pairing restarts only unfinished files.
import { transferMessageSchema, type ServerMessage, type TransferManifest, type TransferMessage } from '@loudbooks/contracts'
import { proxy, transfer, wrap } from 'comlink'
import { useUi } from '../../app/store'
import type { Book, TransferJob } from '../../domain/models'
import { db } from '../../services/db/database'
import { MediaStorage } from '../../services/opfs/MediaStorage'
import type { StorageWorker } from '../../workers/storage.worker'
import { ImportCoordinator, type ImportWriter } from '../import/ImportCoordinator'
import { ImportError } from '../import/probe'
import { LibraryCommands } from '../library/LibraryCommands'
import { isActivePath, isBookActive, pause } from '../playback/api'
import { StorageMaintenance } from '../storage/StorageMaintenance'
import { describeBook, isAudio, TransferRepository } from './book'
import { decodeChunk, encodeChunk, filesToSend, keptFiles, manifestDigest, pairingLink, payloadSize, ProtocolError, ReceiverCredit, SenderCredit, type Pairing } from './protocol'
import { createRoom, ICE_SERVERS, openSignal, serviceReachable, type Signal } from './signaling'
import { initialReceive, initialSend, setReceive, setSend, useTransfer, type ReceiveStep } from './store'

const LOW = 256 * 1024
const HIGH = 1024 * 1024
const BLOCK = 1024 * 1024
/** ICE on a network that blocks peer traffic (guest Wi-Fi) never completes; give up and explain it as a network problem. */
const CONNECT_TIMEOUT = 30_000
const JOB_TTL = 7 * 24 * 3600_000
const storage = new MediaStorage()
const appUrl = () => `${location.origin}${location.pathname}`
const stagingPath = (jobId: string, fileIndex: number) => `staging/${jobId}/${fileIndex}`
const iceMessage = (c: RTCIceCandidate) => ({ type: 'ice-candidate' as const, candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment })
const busy = (importing: boolean) => useUi.setState({ importing })

/** Keeps the screen on during a transfer where Screen Wake Lock exists; re-acquired when the page becomes visible. */
class ScreenWake {
  private lock: WakeLockSentinel | null = null
  private on = false
  private readonly visible = () => { if (this.on && document.visibilityState === 'visible') void this.request() }
  private async request() { try { this.lock = await navigator.wakeLock?.request('screen') ?? null } catch { /* not allowed now: fine */ } }
  acquire() { if (this.on) return; this.on = true; document.addEventListener('visibilitychange', this.visible); void this.request() }
  release() { this.on = false; document.removeEventListener('visibilitychange', this.visible); void this.lock?.release().catch(() => {}); this.lock = null }
}

/** A promise that also settles (rejects) when the session aborts. */
function deferred<T>(signal: AbortSignal) {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    signal.addEventListener('abort', () => rej(signal.reason), { once: true })
  })
  return { promise, resolve }
}

/** Shared peer plumbing: one PeerConnection, one channel, the room socket, wake lock and teardown. */
abstract class Session {
  protected signal?: Signal
  protected pc?: RTCPeerConnection
  protected dc?: RTCDataChannel
  protected readonly ctrl = new AbortController()
  private readonly wake = new ScreenWake()
  private timers: ReturnType<typeof setTimeout>[] = []
  get aborted() { return this.ctrl.signal.aborted }
  protected later(fn: () => void, ms: number) { this.timers.push(setTimeout(fn, ms)) }
  protected peer() {
    this.wake.acquire()
    busy(true)
    const pc = this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => { if (e.candidate?.candidate) this.signal?.send(iceMessage(e.candidate)) }
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.lost() }
    this.later(() => { if (this.dc?.readyState !== 'open') this.lost() }, CONNECT_TIMEOUT)
    return pc
  }
  protected channel(dc: RTCDataChannel) {
    this.dc = dc
    dc.binaryType = 'arraybuffer'
    dc.onclose = () => this.lost()
    dc.onmessage = (e) => this.onData(e.data)
  }
  protected onSignalMessage(m: ServerMessage) {
    if (m.type === 'ice-candidate') void this.pc?.addIceCandidate(m).catch(() => {})
  }
  protected sendJson(m: TransferMessage) { if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(m)) }
  protected parse(data: unknown): TransferMessage | null {
    try { const r = transferMessageSchema.safeParse(JSON.parse(String(data))); return r.success ? r.data : null } catch { return null }
  }
  protected abstract onData(data: unknown): void
  /** Connection or protocol failure: show the connectivity state and tear down. */
  abstract lost(): void
  stop() {
    if (this.aborted) return
    this.ctrl.abort(new DOMException('Transfer stopped', 'AbortError'))
    this.timers.forEach(clearTimeout)
    this.signal?.close()
    if (this.dc) { this.dc.onclose = null; this.dc.onmessage = null; this.dc.close() }
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.close() }
    this.wake.release()
    busy(false)
  }
}

// ---------------------------------------------------------------------------------------------------- Sender

class SendSession extends Session {
  private readonly credit = new SenderCredit()
  private resume = deferred<Extract<TransferMessage, { type: 'resume' }>>(this.ctrl.signal)
  private received = deferred<void>(this.ctrl.signal)
  constructor(readonly bookId: string) { super() }
  private get live() { return sending === this && !this.aborted }
  private set(patch: Parameters<typeof setSend>[0]) { if (sending === this) setSend(patch) }

  async start() {
    let room
    try { room = await createRoom() } catch { if (this.live) this.set({ step: 'signaling' }); return this.stop() }
    if (!this.live) return
    try { this.signal = await openSignal(room.roomId, 'sender', room.senderToken, (m) => this.onSignal(m), () => this.onSignalClosed()) } catch { if (this.live) this.set({ step: 'signaling' }); return this.stop() }
    if (!this.live) return this.signal.close()
    this.set({ link: pairingLink(appUrl(), { roomId: room.roomId, token: room.receiverToken, expiresAt: room.expiresAt }), expiresAt: room.expiresAt })
    this.later(() => this.renew(), room.expiresAt - Date.now())
  }
  /** The room ran out before pairing: show a fresh code instead of a dead one. */
  private renew() {
    const { step } = useTransfer.getState().send
    if (this.live && (step === 'qr' || step === 'code')) startSend(this.bookId, true)
  }
  approve(code: string) {
    const s = useTransfer.getState().send
    if (!this.live || s.checking || s.triesLeft <= 0 || !/^\d{6}$/.test(code)) return
    this.set({ checking: true, codeError: null })
    this.signal?.send({ type: 'approve', code })
  }
  private onSignal(m: ServerMessage) {
    if (!this.live) return
    if (m.type === 'join' && useTransfer.getState().send.step === 'qr') this.set({ step: 'code' })
    else if (m.type === 'wrong-code') this.set({ checking: false, triesLeft: m.attemptsRemaining, codeError: 'wrong' })
    else if (m.type === 'approved') void this.connect()
    else if (m.type === 'answer') void this.pc?.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => this.lost())
    else if (m.type === 'reject' || m.type === 'close') { if (!this.dc) this.renew() }
    else this.onSignalMessage(m)
  }
  private onSignalClosed() {
    if (!this.live || this.dc?.readyState === 'open') return
    const s = useTransfer.getState().send
    // The third wrong code closes the room without another message.
    if (s.checking && s.triesLeft <= 1) { this.set({ checking: false, triesLeft: 0, codeError: 'locked' }); return this.stop() }
    if (s.step === 'qr' || s.step === 'code') return this.renew()
    this.lost()
  }
  private async connect() {
    this.set({ step: 'connecting', checking: false, codeError: null })
    const pc = this.peer()
    const dc = pc.createDataChannel('book', { ordered: true })
    this.channel(dc)
    dc.bufferedAmountLowThreshold = LOW
    dc.onopen = () => {
      // Pairing is done: close the room so the service holds nothing further.
      this.signal?.send({ type: 'close' })
      this.signal?.close()
      this.run().catch(() => this.lost())
    }
    try {
      await pc.setLocalDescription(await pc.createOffer())
      this.signal?.send({ type: 'offer', sdp: pc.localDescription!.sdp })
    } catch { this.lost() }
  }
  protected onData(data: unknown) {
    const m = this.parse(data)
    if (!m) return this.lost()
    if (m.type === 'credit') this.credit.grant(m.bytes)
    else if (m.type === 'resume') this.resume.resolve(m)
    else if (m.type === 'done') this.received.resolve()
    else if (m.type === 'cancel' || m.type === 'error') this.lost()
  }
  private async run() {
    const dc = this.dc!
    const signal = this.ctrl.signal
    const out = await describeBook(this.bookId, useTransfer.getState().send.includePosition)
    const { manifest } = out
    const digest = await manifestDigest(manifest)
    this.sendJson({ type: 'manifest', manifest })
    // The receiver may first ask its user (duplicate, space); no timeout here.
    const todo = filesToSend(manifest, digest, await this.resume.promise)
    let done = manifest.files.reduce((n, f, i) => n + (todo.includes(i) ? 0 : f.size), 0)
    this.set({ step: 'sending', bytesTotal: out.bytes, bytesDone: done, fileCount: out.audioCount, fileIndex: 1 })
    const size = payloadSize(this.pc?.sctp?.maxMessageSize)
    let shown = 0
    for (const i of todo) {
      const entry = manifest.files[i]!
      const file = await storage.read(out.paths[i]!)
      if (file.size !== entry.size) throw new ProtocolError('source')
      this.set({ fileIndex: Math.min(i + 1, out.audioCount) })
      for (let block = 0; block < file.size; block += BLOCK) {
        const bytes = new Uint8Array(await file.slice(block, block + BLOCK).arrayBuffer())
        for (let at = 0; at < bytes.length; at += size) {
          const part = bytes.subarray(at, at + size)
          await this.credit.take(part.length, signal)
          if (dc.bufferedAmount > HIGH) {
            await new Promise<void>((resolve) => {
              dc.addEventListener('bufferedamountlow', () => resolve(), { once: true })
              signal.addEventListener('abort', () => resolve(), { once: true })
            })
            signal.throwIfAborted()
          }
          dc.send(encodeChunk(i, block + at, part))
          done += part.length
          if (done - shown >= BLOCK || done === out.bytes) { shown = done; this.set({ bytesDone: Math.max(0, done - dc.bufferedAmount) }) }
        }
      }
    }
    this.sendJson({ type: 'done' })
    this.set({ step: 'verifying', bytesDone: out.bytes })
    await this.received.promise
    this.set({ step: 'done' })
    this.stop()
  }
  lost() {
    if (this.aborted) return
    this.set({ step: 'failed' })
    this.stop()
  }
  cancel() {
    this.sendJson({ type: 'cancel' })
    this.stop()
  }
}

let sending: SendSession | null = null

/** Opens the Send dialog for a book and creates a pairing room. `keepOptions` keeps the include-position choice. */
export function startSend(bookId: string, keepOptions = false) {
  sending?.cancel()
  const includePosition = keepOptions && useTransfer.getState().send.includePosition
  sending = new SendSession(bookId)
  setSend({ ...initialSend, bookId, includePosition })
  void sending.start()
}
export const submitCode = (code: string) => sending?.approve(code)
export const setIncludePosition = (includePosition: boolean) => setSend({ includePosition })
/** Close (any state) or confirmed "Stop sending". */
export function closeSend() {
  sending?.cancel()
  sending = null
  setSend({ bookId: null })
}

// -------------------------------------------------------------------------------------------------- Receiver

type Choice = 'keep-both' | 'replace' | 'clear' | 'cancel'

class ReceiveSession extends Session {
  private readonly worker = new Worker(new URL('../../workers/storage.worker.ts', import.meta.url), { type: 'module' })
  private readonly remote = wrap<StorageWorker>(this.worker)
  private readonly credit = new ReceiverCredit()
  private readonly next = new Map<number, number>()
  private readonly verified = new Set<string>()
  private manifest?: TransferManifest
  private job?: TransferJob
  private replace?: Book
  private approved = false
  private ready = false
  private open = new Set<string>()
  private written = 0
  private shown = 0
  private queue = Promise.resolve()
  private choice?: (c: Choice) => void
  constructor(private readonly pairing: Pairing) { super() }
  private get live() { return receiving === this && !this.aborted }
  private set(patch: Parameters<typeof setReceive>[0]) { if (receiving === this) setReceive(patch) }

  async start() {
    if (Date.now() >= this.pairing.expiresAt) { this.set({ step: 'expired' }); return this.stop() }
    this.set({ step: 'connecting' })
    try {
      this.signal = await openSignal(this.pairing.roomId, 'receiver', this.pairing.token, (m) => this.onSignal(m), () => this.onSignalClosed())
    } catch {
      // The socket can't say why it failed: a reachable service means the room itself is gone.
      const step = await serviceReachable() ? 'expired' : 'signaling'
      if (this.live) this.set({ step })
      return this.stop()
    }
    if (!this.live) this.signal.close()
  }
  private onSignal(m: ServerMessage) {
    if (!this.live) return
    if (m.type === 'confirmation-code') { this.set({ step: 'code', code: m.code }); this.signal?.send({ type: 'join' }) }
    else if (m.type === 'approved') { this.approved = true; this.set({ step: 'connecting' }); this.peer().ondatachannel = (e) => this.channel(e.channel) }
    else if (m.type === 'offer') void this.answer(m.sdp)
    else if (m.type === 'reject' || m.type === 'close') this.onSignalClosed()
    else this.onSignalMessage(m)
  }
  private async answer(sdp: string) {
    try {
      await this.pc!.setRemoteDescription({ type: 'offer', sdp })
      await this.pc!.setLocalDescription(await this.pc!.createAnswer())
      this.signal?.send({ type: 'answer', sdp: this.pc!.localDescription!.sdp })
    } catch { this.lost() }
  }
  private onSignalClosed() {
    // After the channel exists the sender closes the room on purpose.
    if (!this.live || this.dc) return
    if (this.approved) return this.lost()
    this.set({ step: 'expired' })
    this.stop()
  }
  protected onData(data: unknown) {
    if (!this.live) return
    if (data instanceof ArrayBuffer) return this.chunk(data)
    const m = this.parse(data)
    if (!m) return this.fail('message')
    if (m.type === 'manifest') this.onManifest(m.manifest).catch((e) => this.fail(e))
    else if (m.type === 'done') this.finish().catch((e) => this.fail(e))
    else if (m.type === 'cancel' || m.type === 'error') this.lost()
  }
  private ask(step: ReceiveStep, patch: Parameters<typeof setReceive>[0] = {}) {
    const d = deferred<Choice>(this.ctrl.signal)
    this.choice = d.resolve
    this.set({ ...patch, step })
    return d.promise
  }
  answer$(c: Choice) { this.choice?.(c); this.choice = undefined }

  private async onManifest(manifest: TransferManifest) {
    const audio = manifest.files.filter(isAudio)
    const images = manifest.files.filter((f) => !isAudio(f))
    if (this.manifest || !audio.length || images.length > 1 || manifest.chapters.some((c) => !isAudio(manifest.files.find((f) => f.fileId === c.fileId)!))) throw new ProtocolError('manifest')
    this.manifest = manifest
    const digest = await manifestDigest(manifest)
    const now = Date.now()
    const jobs = await db.transfers.toArray()
    for (const old of jobs) if (old.expiresAt <= now) await this.dropJob(old)
    const previous = jobs.find((j) => j.manifestDigest === digest && j.expiresAt > now)
    const job: TransferJob = previous ?? { id: crypto.randomUUID(), manifestDigest: digest, fileOffsets: {}, verifiedFiles: [], state: 'receiving', expiresAt: now + JOB_TTL }
    // Keep a verified file only if it is still in staging at its size; everything else restarts.
    const kept: string[] = []
    for (const id of keptFiles(manifest, digest, previous)) {
      const i = manifest.files.findIndex((f) => f.fileId === id)
      if ((await storage.read(stagingPath(job.id, i)).catch(() => null))?.size === manifest.files[i]!.size) kept.push(id)
    }
    this.job = { ...job, verifiedFiles: kept, expiresAt: now + JOB_TTL }
    const title = manifest.book.title
    this.set({ title })

    const duplicate = await db.books.filter((b) => b.title === title).first()
    if (duplicate) {
      const choice = await this.ask('duplicate')
      if (choice === 'cancel') return this.cancel(false)
      if (choice === 'replace') this.replace = duplicate
    }
    const total = manifest.files.reduce((n, f) => n + f.size, 0)
    const remaining = manifest.files.reduce((n, f) => n + (kept.includes(f.fileId) ? 0 : f.size), 0)
    // Staging plus the library copy made at commit.
    const need = remaining + total
    for (;;) {
      const e = await navigator.storage?.estimate?.().catch(() => undefined)
      const free = e?.quota !== undefined ? Math.max(0, e.quota - (e.usage ?? 0)) : Infinity
      if (need <= free) break
      const choice = await this.ask('storage', { need, free })
      if (choice !== 'clear') return this.cancel(false)
      await new StorageMaintenance(isActivePath).clearTemporary().catch(() => 0)
    }
    await db.transfers.put(this.job)
    kept.forEach((id) => this.verified.add(id))
    this.ready = true
    this.set({ step: 'receiving', bytesTotal: total, bytesDone: total - remaining, fileCount: audio.length, fileIndex: 1 })
    this.sendJson({ type: 'resume', manifestDigest: digest, verifiedFiles: kept, offsets: {} })
    this.sendJson({ type: 'credit', bytes: this.credit.open() })
  }

  private chunk(frame: ArrayBuffer) {
    const manifest = this.manifest
    let c
    try {
      if (!manifest || !this.ready) throw new ProtocolError('order')
      c = decodeChunk(frame, manifest, (i) => (this.verified.has(manifest.files[i]!.fileId) ? undefined : this.next.get(i) ?? 0))
      this.credit.receive(c.payload.length)
    } catch (e) { return this.fail(e) }
    this.next.set(c.fileIndex, c.offset + c.payload.length)
    const chunk = c
    // Sequential writes; at most WINDOW bytes can be queued because the sender is bounded by credit.
    this.queue = this.queue.then(() => this.write(chunk)).catch((e) => this.fail(e))
  }
  private async write({ fileIndex, offset, payload }: { fileIndex: number; offset: number; payload: Uint8Array<ArrayBuffer> }) {
    if (this.aborted) return
    const file = this.manifest!.files[fileIndex]!
    const path = stagingPath(this.job!.id, fileIndex)
    if (offset === 0) { await this.remote.streamOpen(path); this.open.add(path) }
    const length = payload.length
    await this.remote.streamWrite(path, offset, transfer(payload, [payload.buffer]))
    this.written += length
    if (offset === 0 || this.written - this.shown >= BLOCK || offset + length === file.size) {
      const s = useTransfer.getState().receive
      this.set({ fileIndex: Math.min(fileIndex + 1, s.fileCount), bytesDone: s.bytesDone + this.written - this.shown })
      this.shown = this.written
    }
    const grant = this.credit.written(length)
    if (grant) this.sendJson({ type: 'credit', bytes: grant })
    if (offset + length < file.size) return
    const result = await this.remote.streamClose(path)
    this.open.delete(path)
    if (result.bytes !== file.size || result.sha256 !== file.sha256) { await storage.delete(path); throw new ProtocolError('hash') }
    this.verified.add(file.fileId)
    this.job!.verifiedFiles = [...this.verified]
    await db.transfers.put(this.job!)
    this.sendJson({ type: 'ack', fileId: file.fileId, offset: file.size })
  }

  private async finish() {
    await this.queue
    const manifest = this.manifest!
    if (!this.live || !manifest.files.every((f) => this.verified.has(f.fileId))) throw new ProtocolError('incomplete')
    this.set({ step: 'verifying' })
    const job = this.job!
    const staged = async (fileId: string) => {
      const i = manifest.files.findIndex((f) => f.fileId === fileId)
      return storage.read(stagingPath(job.id, i))
    }
    const audio = manifest.files.filter(isAudio)
    const files = await Promise.all(audio.map(async (f) => new File([await staged(f.fileId)], f.name, { type: f.mime })))
    const image = manifest.files.find((f) => !isAudio(f))
    const cover = image ? await staged(image.fileId) : undefined
    let index = 0
    // The library copy is checked against the manifest too: what is on disk is what the sender hashed.
    const writer: ImportWriter = {
      write: async (id, path, file, progress) => {
        const expected = index < audio.length ? audio[index++] : undefined
        const result = await this.remote.write(id, path, file, proxy(progress))
        if (expected && (result.bytes !== expected.size || result.sha256 !== expected.sha256)) throw new ProtocolError('hash')
        return result
      },
      cancel: (id) => this.remote.cancel(id),
      finish: (id) => this.remote.finish(id),
    }
    const probeFile = async (file: File) => {
      const r = await this.remote.probe(file)
      if (!r.ok) throw new ImportError('form.unsupported')
      return r.value
    }
    const book = await new ImportCoordinator({ repository: new TransferRepository(manifest), writer, probeFile })
      .importBook({ title: manifest.book.title, description: manifest.book.description, files, cover, ordered: true })
    if (this.replace) {
      if (isBookActive(this.replace.id)) await pause()
      // A failed delete leaves both books; the new one is already safe.
      await new LibraryCommands(isActivePath).deleteBook(this.replace.id).catch(() => {})
    }
    await this.dropJob(job)
    this.sendJson({ type: 'done' })
    useUi.setState({ newBookId: book.id })
    this.set({ step: 'success', bookId: book.id })
    this.stop()
  }

  private async dropJob(job: TransferJob) {
    await storage.delete(`staging/${job.id}`).catch(() => {})
    await db.transfers.delete(job.id)
  }
  private fail(error: unknown) {
    if (this.aborted) return
    if (import.meta.env.DEV) console.warn('Transfer failed', error)
    this.sendJson({ type: 'error', code: error instanceof ProtocolError ? error.code : 'receive' })
    this.lost()
  }
  lost() {
    if (this.aborted) return
    this.set({ step: 'disconnected' })
    this.stop()
  }
  override stop() {
    if (this.aborted) return
    super.stop()
    // Unfinished files restart on the next pairing; verified ones stay in staging with their job.
    const open = [...this.open]
    void Promise.all(open.map((p) => this.remote.streamAbort(p).catch(() => {}))).finally(() => this.worker.terminate())
  }
  /** `remove`: also delete received files (Stop receiving). Otherwise only the connection ends. */
  async cancel(remove: boolean) {
    this.sendJson({ type: 'cancel' })
    this.stop()
    if (remove && this.job) await this.dropJob(this.job).catch(() => {})
    this.set({ step: 'intro' })
  }
  async discard() { if (this.job) await this.dropJob(this.job).catch(() => {}) }
}

let receiving: ReceiveSession | null = null

/** Starts pairing from a scanned or pasted link. */
export function startReceive(pairing: Pairing) {
  receiving?.stop()
  receiving = new ReceiveSession(pairing)
  void receiving.start()
}
/** Screen-only steps (intro, camera prompt, scanner, paste). Ends any session. */
export function showReceive(step: ReceiveStep) {
  receiving?.stop()
  receiving = null
  setReceive({ ...initialReceive, step })
}
export const answerReceive = (choice: Choice) => receiving?.answer$(choice)
/** Confirmed "Stop receiving": the book isn't added and received files are removed. */
export const stopReceive = () => receiving ? receiving.cancel(true) : showReceive('intro')
/** "Cancel and remove partial files" after a lost connection. */
export async function discardReceive() {
  await receiving?.discard()
  showReceive('intro')
}
export const receiveActive = () => !!receiving && !receiving.aborted
