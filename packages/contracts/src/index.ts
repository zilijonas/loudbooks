import { z } from 'zod'

const id = z.string().min(1).max(128)
const offset = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const filename = z.string().min(1).max(255).refine((s) => s !== '.' && s !== '..' && !/[\\/]/.test(s) && [...s].every((c) => c.charCodeAt(0) >= 32))
export const roleSchema = z.enum(['sender', 'receiver'])
export const signalingMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), role: roleSchema, token: z.string().regex(/^[A-Za-z0-9_-]{22,}$/).max(128) }).strict(),
  z.object({ type: z.literal('join') }).strict(),
  z.object({ type: z.literal('approve'), code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ type: z.literal('offer'), sdp: z.string().min(1).max(15000) }).strict(),
  z.object({ type: z.literal('answer'), sdp: z.string().min(1).max(15000) }).strict(),
  z.object({ type: z.literal('ice-candidate'), candidate: z.string().max(14000), sdpMid: z.string().max(256).nullable().optional(), sdpMLineIndex: z.number().int().nonnegative().nullable().optional(), usernameFragment: z.string().max(256).nullable().optional() }).strict(),
  z.object({ type: z.literal('reject') }).strict(),
  z.object({ type: z.literal('close') }).strict(),
])
export type SignalingMessage = z.infer<typeof signalingMessageSchema>
export type Role = z.infer<typeof roleSchema>
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('authenticated'), role: roleSchema }).strict(),
  z.object({ type: z.literal('confirmation-code'), code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ type: z.literal('approved') }).strict(),
  z.object({ type: z.literal('wrong-code'), attemptsRemaining: z.number().int().min(0).max(2) }).strict(),
  ...signalingMessageSchema.options.filter((s) => !['auth', 'approve'].includes(s.shape.type.value)),
])
export type ServerMessage = z.infer<typeof serverMessageSchema>
export const fileSchema = z.object({ fileId: id, name: filename, size: offset, sha256, mime: z.string().min(1).max(255) }).strict()
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  book: z.object({ title: z.string().min(1).max(1000), description: z.string().max(10000).optional() }).strict(),
  chapters: z.array(z.object({ title: z.string().max(1000), fileId: id, start: z.number().nonnegative(), end: z.number().nonnegative() }).strict().refine((c) => c.end >= c.start)),
  files: z.array(fileSchema).min(1).max(65536),
  includePosition: z.object({ fileId: id, offset: z.number().nonnegative() }).strict().optional(),
}).strict().superRefine((m, ctx) => {
  const ids = new Set(m.files.map((f) => f.fileId))
  if (ids.size !== m.files.length || m.chapters.some((c) => !ids.has(c.fileId)) || (m.includePosition && !ids.has(m.includePosition.fileId))) ctx.addIssue({ code: 'custom', message: 'Invalid file references' })
})
export type TransferManifest = z.infer<typeof manifestSchema>
export const chunkHeaderSchema = z.object({ fileIndex: z.number().int().min(0).max(65535), offset, length: z.number().int().min(1).max(16384) }).strict()
export type ChunkHeader = z.infer<typeof chunkHeaderSchema>
export const transferMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manifest'), manifest: manifestSchema }).strict(),
  z.object({ type: z.literal('credit'), bytes: offset }).strict(),
  z.object({ type: z.literal('ack'), fileId: id, offset }).strict(),
  z.object({ type: z.literal('cancel') }).strict(),
  z.object({ type: z.literal('resume'), manifestDigest: sha256, verifiedFiles: z.array(id), offsets: z.record(id, offset) }).strict(),
  z.object({ type: z.literal('done') }).strict(),
  z.object({ type: z.literal('error'), code: z.string().min(1).max(128) }).strict(),
])
export type TransferMessage = z.infer<typeof transferMessageSchema>
