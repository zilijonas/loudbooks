// Transfer protocol v1 helpers (docs/transfer-protocol.md): chunk framing, credit flow, resume bookkeeping, pairing links.
// Pure functions only; TransferCoordinator wires them to WebRTC, signaling and storage.
import { chunkHeaderSchema, manifestSchema, type TransferManifest } from '@loudbooks/contracts'

export const HEADER = 14
/** Target frame size including the header (contracts cap the payload at 16 KiB). */
export const FRAME = 16 * 1024
/** Receiver credit: bytes the sender may have in flight, and how much written data is returned per grant. */
export const WINDOW = 1024 * 1024
export const BATCH = 256 * 1024

export class ProtocolError extends Error {
  constructor(readonly code: string) { super(`Transfer protocol: ${code}`) }
}

/** Payload bytes per frame: 16 KiB frames, smaller when the negotiated SCTP limit is lower. */
export function payloadSize(maxMessageSize?: number | null) {
  const frame = maxMessageSize && maxMessageSize > HEADER ? Math.min(FRAME, maxMessageSize) : FRAME
  return frame - HEADER
}

/** 14-byte big-endian header (u16 file index, u64 offset, u32 length) followed by the payload. */
export function encodeChunk(fileIndex: number, offset: number, payload: Uint8Array): ArrayBuffer {
  const frame = new ArrayBuffer(HEADER + payload.byteLength)
  const view = new DataView(frame)
  view.setUint16(0, fileIndex)
  view.setBigUint64(2, BigInt(offset))
  view.setUint32(10, payload.byteLength)
  new Uint8Array(frame, HEADER).set(payload)
  return frame
}

/**
 * Validates one frame against the manifest and the file's next expected offset (the channel is ordered, so a file's
 * chunks arrive in sequence). Throws ProtocolError; never trusts the header beyond these checks.
 */
export function decodeChunk(frame: ArrayBuffer, manifest: TransferManifest, expectedOffset: (fileIndex: number) => number | undefined) {
  if (frame.byteLength <= HEADER) throw new ProtocolError('frame')
  const view = new DataView(frame)
  const offset = view.getBigUint64(2)
  if (offset > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProtocolError('offset')
  const header = chunkHeaderSchema.safeParse({ fileIndex: view.getUint16(0), offset: Number(offset), length: view.getUint32(10) })
  if (!header.success) throw new ProtocolError('header')
  const { fileIndex, length } = header.data
  const file = manifest.files[fileIndex]
  if (!file) throw new ProtocolError('file')
  if (frame.byteLength !== HEADER + length) throw new ProtocolError('length')
  if (header.data.offset !== expectedOffset(fileIndex) || header.data.offset + length > file.size) throw new ProtocolError('offset')
  return { fileIndex, offset: header.data.offset, payload: new Uint8Array(frame, HEADER, length) }
}

/**
 * Receiver side of the credit flow. The sender starts with WINDOW bytes; credit comes back only after data is on disk,
 * in BATCH-sized grants. Because WINDOW - FRAME >= BATCH, a sender waiting for credit always gets a grant once the
 * receiver has written what it holds.
 */
export class ReceiverCredit {
  private granted = 0
  private received = 0
  private pending = 0
  /** Credit to announce when the transfer starts. */
  open() { this.granted += WINDOW; return WINDOW }
  /** A chunk arrived. Throws when the sender went past its credit (the write queue would grow unbounded). */
  receive(bytes: number) {
    if (this.received + bytes > this.granted) throw new ProtocolError('credit')
    this.received += bytes
  }
  /** `bytes` are written to storage. Returns credit to grant now, or 0 to keep batching. */
  written(bytes: number) {
    this.pending += bytes
    if (this.pending < BATCH) return 0
    const grant = this.pending
    this.pending = 0
    this.granted += grant
    return grant
  }
}

/** Sender side: `take` waits until the receiver has granted enough credit. */
export class SenderCredit {
  private available = 0
  private wake: (() => void) | null = null
  grant(bytes: number) { this.available += bytes; this.wake?.() }
  async take(bytes: number, signal: AbortSignal) {
    while (this.available < bytes) {
      signal.throwIfAborted()
      await new Promise<void>((resolve) => {
        this.wake = resolve
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
      this.wake = null
    }
    signal.throwIfAborted()
    this.available -= bytes
  }
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

/** Identity of the book content for resume: the validated manifest without the one-time listening position. */
export async function manifestDigest(manifest: TransferManifest) {
  const { includePosition: _, ...content } = manifestSchema.parse(manifest)
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content))))
}

/** Receiver: files already verified in a previous attempt at the same manifest. Unfinished files restart from 0. */
export function keptFiles(manifest: TransferManifest, digest: string, job?: { manifestDigest: string; verifiedFiles: string[] }) {
  if (!job || job.manifestDigest !== digest) return []
  const ids = new Set(manifest.files.map((f) => f.fileId))
  return job.verifiedFiles.filter((id) => ids.has(id))
}

/** Sender: indexes of files still to send after the receiver's `resume`. Rejects a resume for another manifest. */
export function filesToSend(manifest: TransferManifest, digest: string, resume: { manifestDigest: string; verifiedFiles: string[]; offsets: Record<string, number> }) {
  if (resume.manifestDigest !== digest) throw new ProtocolError('digest')
  const ids = new Set(manifest.files.map((f) => f.fileId))
  if (resume.verifiedFiles.some((id) => !ids.has(id))) throw new ProtocolError('resume')
  // shortcut: byte-level resume is not offered; any unfinished file restarts at 0, so non-zero offsets are refused.
  if (Object.values(resume.offsets).some((o) => o !== 0)) throw new ProtocolError('resume')
  const kept = new Set(resume.verifiedFiles)
  return manifest.files.flatMap((f, i) => (kept.has(f.fileId) ? [] : [i]))
}

// Pairing link: the room id and receiver token travel only in the URL fragment, never to a server.
// `<origin><base>#/receive/r/<roomId>.<token>.<expiresAt base36>`
const LINK = /#\/receive\/r\/([0-9a-f-]{36})\.([A-Za-z0-9_-]{22,128})\.([0-9a-z]{1,12})$/
export interface Pairing { roomId: string; token: string; expiresAt: number }
export const pairingLink = (appUrl: string, p: Pairing) => `${appUrl}#/receive/r/${p.roomId}.${p.token}.${p.expiresAt.toString(36)}`
export function parsePairingLink(text: string): Pairing | null {
  const m = LINK.exec(text.trim())
  if (!m) return null
  const expiresAt = parseInt(m[3]!, 36)
  return Number.isSafeInteger(expiresAt) ? { roomId: m[1]!, token: m[2]!, expiresAt } : null
}
