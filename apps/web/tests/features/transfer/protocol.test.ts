import type { TransferManifest } from '@loudbooks/contracts'
import { describe, expect, it } from 'vitest'
import { BATCH, decodeChunk, encodeChunk, FRAME, filesToSend, HEADER, keptFiles, manifestDigest, parsePairingLink, pairingLink, payloadSize, ReceiverCredit, SenderCredit, WINDOW } from '../../../src/features/transfer/protocol'

const sha = 'a'.repeat(64)
const manifest: TransferManifest = {
  schemaVersion: 1,
  book: { title: 'Book' },
  chapters: [{ title: 'One', fileId: 'f1', start: 0, end: 10 }, { title: 'Two', fileId: 'f2', start: 0, end: 5 }],
  files: [{ fileId: 'f1', name: '1.mp3', size: 40_000, sha256: sha, mime: 'audio/mpeg' }, { fileId: 'f2', name: '2.mp3', size: 100, sha256: sha, mime: 'audio/mpeg' }],
}

describe('chunk framing', () => {
  const at = (offsets: Record<number, number>) => (i: number) => offsets[i]
  it('round-trips header and payload, and frames stay within 16 KiB', () => {
    const payload = new Uint8Array(payloadSize()).fill(7)
    const frame = encodeChunk(0, 16_370, payload)
    expect(frame.byteLength).toBe(FRAME)
    const c = decodeChunk(frame, manifest, at({ 0: 16_370 }))
    expect(c).toMatchObject({ fileIndex: 0, offset: 16_370 })
    expect(c.payload.length).toBe(payload.length)
    expect(c.payload.every((b) => b === 7)).toBe(true)
    expect(payloadSize(8 * 1024)).toBe(8 * 1024 - HEADER)
  })
  it('rejects unknown files, gaps, overruns, wrong lengths and oversized offsets', () => {
    const one = new Uint8Array(10)
    expect(() => decodeChunk(encodeChunk(5, 0, one), manifest, at({ 5: 0 }))).toThrow(/file/)
    expect(() => decodeChunk(encodeChunk(0, 10, one), manifest, at({ 0: 0 }))).toThrow(/offset/) // gap
    expect(() => decodeChunk(encodeChunk(1, 95, one), manifest, at({ 1: 95 }))).toThrow(/offset/) // past file size
    expect(() => decodeChunk(encodeChunk(0, 0, one).slice(0, HEADER + 5), manifest, at({ 0: 0 }))).toThrow(/length/)
    const huge = encodeChunk(0, 0, one)
    new DataView(huge).setBigUint64(2, 2n ** 60n)
    expect(() => decodeChunk(huge, manifest, at({ 0: 0 }))).toThrow(/offset/)
    expect(() => decodeChunk(new ArrayBuffer(HEADER), manifest, at({}))).toThrow(/frame/)
    expect(() => decodeChunk(encodeChunk(0, 0, new Uint8Array(FRAME + 1)), manifest, at({ 0: 0 }))).toThrow(/header/) // payload over the contract limit
  })
})

describe('credit flow', () => {
  it('refuses data past the granted window and grants back only written bytes in batches', () => {
    const r = new ReceiverCredit()
    expect(r.open()).toBe(WINDOW)
    r.receive(WINDOW)
    expect(() => r.receive(1)).toThrow(/credit/)
    expect(r.written(BATCH - 1)).toBe(0)
    expect(r.written(1)).toBe(BATCH)
    r.receive(BATCH)
    expect(() => r.receive(1)).toThrow(/credit/)
  })
  it('a sender waiting for credit is always released once the receiver writes what it holds (no deadlock)', async () => {
    const send = new SenderCredit()
    const recv = new ReceiverCredit()
    send.grant(recv.open())
    const chunk = payloadSize()
    const ctrl = new AbortController()
    let inFlight: number[] = []
    let sent = 0
    const total = 5 * WINDOW + 123
    while (sent < total) {
      const n = Math.min(chunk, total - sent)
      const take = send.take(n, ctrl.signal)
      // Not enough credit yet: the receiver drains its queue, granting as it writes.
      const settled = await Promise.race([take.then(() => true), new Promise((r) => setTimeout(() => r(false), 0))])
      if (!settled) {
        for (const b of inFlight) { const g = recv.written(b); if (g) send.grant(g) }
        inFlight = []
        await take
      }
      recv.receive(n)
      inFlight.push(n)
      sent += n
    }
    expect(sent).toBe(total)
  })
  it('cancel releases a waiting sender', async () => {
    const send = new SenderCredit()
    const ctrl = new AbortController()
    const take = send.take(10, ctrl.signal)
    ctrl.abort()
    await expect(take).rejects.toThrow()
  })
})

describe('resume bookkeeping', () => {
  it('keeps verified files only for the same manifest and ignores the listening position', async () => {
    const digest = await manifestDigest(manifest)
    expect(await manifestDigest({ ...manifest, includePosition: { fileId: 'f1', offset: 3 } })).toBe(digest)
    expect(await manifestDigest({ ...manifest, book: { title: 'Other' } })).not.toBe(digest)
    expect(keptFiles(manifest, digest, { manifestDigest: digest, verifiedFiles: ['f2', 'gone'] })).toEqual(['f2'])
    expect(keptFiles(manifest, digest, { manifestDigest: 'b'.repeat(64), verifiedFiles: ['f2'] })).toEqual([])
    expect(keptFiles(manifest, digest)).toEqual([])
  })
  it('sender sends only unverified files and refuses foreign or byte-level resumes', async () => {
    const digest = await manifestDigest(manifest)
    expect(filesToSend(manifest, digest, { manifestDigest: digest, verifiedFiles: ['f1'], offsets: {} })).toEqual([1])
    expect(filesToSend(manifest, digest, { manifestDigest: digest, verifiedFiles: [], offsets: { f2: 0 } })).toEqual([0, 1])
    expect(() => filesToSend(manifest, digest, { manifestDigest: 'b'.repeat(64), verifiedFiles: [], offsets: {} })).toThrow(/digest/)
    expect(() => filesToSend(manifest, digest, { manifestDigest: digest, verifiedFiles: ['x'], offsets: {} })).toThrow(/resume/)
    expect(() => filesToSend(manifest, digest, { manifestDigest: digest, verifiedFiles: [], offsets: { f1: 500 } })).toThrow(/resume/)
  })
})

describe('pairing link', () => {
  it('keeps the token in the fragment and rejects anything else', () => {
    const p = { roomId: '0f8fad5b-d9cb-469f-a165-70867728950e', token: 'A'.repeat(43), expiresAt: 1_800_000_000_000 }
    const link = pairingLink('https://zilijonas.github.io/loudbooks/', p)
    expect(new URL(link).search).toBe('')
    expect(new URL(link).hash).toContain(p.token)
    expect(parsePairingLink(` ${link} `)).toEqual(p)
    expect(parsePairingLink('https://example.com/book.mp3')).toBeNull()
    expect(parsePairingLink(link.replace(p.roomId, '../../etc'))).toBeNull()
    expect(parsePairingLink(link + '&x')).toBeNull()
  })
})
