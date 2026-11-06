import { describe, expect, it } from 'vitest'
import { chunkHeaderSchema, manifestSchema, signalingMessageSchema, transferMessageSchema } from './index'

describe('protocol validation', () => {
  const manifest = { schemaVersion: 1, book: { title: 'Book' }, chapters: [{ title: 'Chapter', fileId: 'a', start: 0, end: 10 }], files: [{ fileId: 'a', name: 'book.mp3', size: 20, sha256: 'a'.repeat(64), mime: 'audio/mpeg' }] }
  it('accepts manifest and rejects paths and invalid references', () => {
    expect(manifestSchema.safeParse(manifest).success).toBe(true)
    expect(manifestSchema.safeParse({ ...manifest, files: [{ ...manifest.files[0], name: '../book' }] }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...manifest, chapters: [{ ...manifest.chapters[0], fileId: 'missing' }] }).success).toBe(false)
  })
  it('validates signaling, chunks, and resumable controls', () => {
    expect(signalingMessageSchema.safeParse({ type: 'approve', code: '123456' }).success).toBe(true)
    expect(signalingMessageSchema.safeParse({ type: 'approve', code: '123' }).success).toBe(false)
    expect(chunkHeaderSchema.safeParse({ fileIndex: 0, offset: -1, length: 4 }).success).toBe(false)
    expect(chunkHeaderSchema.safeParse({ fileIndex: 0, offset: 0, length: 4 }).success).toBe(true)
    expect(transferMessageSchema.safeParse({ type: 'resume', manifestDigest: 'a'.repeat(64), verifiedFiles: ['a'], offsets: { a: 20 } }).success).toBe(true)
    expect(transferMessageSchema.safeParse({ type: 'ack', fileId: 'a', offset: -1 }).success).toBe(false)
  })
})
