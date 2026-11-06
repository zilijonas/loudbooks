import { DurableObject } from 'cloudflare:workers'
import { signalingMessageSchema, type Role } from '@loudbooks/contracts'

type Room = { expiresAt: number; senderHash: string | null; receiverHash: string | null; code: string; attempts: number; approved: boolean }
type SocketState = { deadline: number; role?: Role; windowStart: number; count: number }
const ttl = 300_000
const authTimeout = 5_000
const maxSize = 16 * 1024
const encoder = new TextEncoder()
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), (x) => x.toString(16).padStart(2, '0')).join('')
function code(): string {
  const n = new Uint32Array(1)
  do { crypto.getRandomValues(n) } while (n[0]! >= 4_294_000_000)
  return String(n[0]! % 1_000_000).padStart(6, '0')
}

export class PairRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, state TEXT NOT NULL)')
  }
  private load(): Room | undefined {
    const row = this.ctx.storage.sql.exec<{ state: string }>('SELECT state FROM room WHERE id = 1').toArray()[0]
    return row ? JSON.parse(row.state) as Room : undefined
  }
  private save(room: Room) { this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room VALUES (1, ?)', JSON.stringify(room)) }
  private async schedule(room: Room) {
    const deadlines = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN).map((ws) => ws.deserializeAttachment() as SocketState).filter((s) => !s.role).map((s) => s.deadline)
    await this.ctx.storage.setAlarm(Math.min(room.expiresAt, ...deadlines))
  }
  private async expire() {
    for (const ws of this.ctx.getWebSockets()) ws.close(4401, 'Room closed')
    this.ctx.storage.sql.exec('DELETE FROM room')
    await this.ctx.storage.deleteAlarm()
  }
  async create(senderHash: string, receiverHash: string): Promise<number> {
    const room = { senderHash, receiverHash, expiresAt: Date.now() + ttl, code: code(), attempts: 0, approved: false }
    this.save(room)
    await this.schedule(room)
    return room.expiresAt
  }
  override async fetch(request: Request): Promise<Response> {
    const room = this.load()
    if (!room || Date.now() >= room.expiresAt) { if (room) await this.expire(); return new Response('Room expired', { status: 410 }) }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Upgrade required', { status: 426 })
    if (this.ctx.getWebSockets().length >= 2) return new Response('Room full', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ deadline: Date.now() + authTimeout, windowStart: Date.now(), count: 0 } satisfies SocketState)
    await this.schedule(room)
    return new Response(null, { status: 101, webSocket: client })
  }
  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let room = this.load()
    if (!room || Date.now() >= room.expiresAt) { if (room) await this.expire(); else ws.close(4401, 'Room closed'); return }
    const state = ws.deserializeAttachment() as SocketState
    const now = Date.now()
    if (!state.role && now >= state.deadline) { ws.close(4401, 'Authentication timeout'); return }
    if (typeof raw !== 'string' || encoder.encode(raw).byteLength > maxSize) { ws.close(4409, 'Message too large'); return }
    if (now - state.windowStart >= 10_000) { state.windowStart = now; state.count = 0 }
    state.count++
    ws.serializeAttachment(state)
    if (state.count > 60) { ws.close(4429, 'Rate limit'); return }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { ws.close(4400, 'Invalid message'); return }
    const result = signalingMessageSchema.safeParse(parsed)
    if (!result.success) { ws.close(4400, 'Invalid message'); return }
    const message = result.data
    if (!state.role) {
      if (message.type !== 'auth') { ws.close(4401, 'Authentication required'); return }
      const digest = await hash(message.token)
      room = this.load()
      if (!room || Date.now() >= room.expiresAt || Date.now() >= state.deadline) { ws.close(4401, 'Authentication expired'); return }
      const key = message.role === 'sender' ? 'senderHash' : 'receiverHash'
      if (!room[key] || !crypto.subtle.timingSafeEqual(encoder.encode(room[key]), encoder.encode(digest))) { ws.close(4401, 'Authentication failed'); return }
      room[key] = null
      this.save(room)
      state.role = message.role
      ws.serializeAttachment(state)
      ws.send(JSON.stringify({ type: 'authenticated', role: state.role }))
      if (state.role === 'receiver') ws.send(JSON.stringify({ type: 'confirmation-code', code: room.code }))
      await this.schedule(room)
      return
    }
    if (message.type === 'auth') { ws.close(4400, 'Invalid message'); return }
    if (message.type === 'approve') {
      if (state.role !== 'sender' || room.approved || !this.peer(ws, 'receiver')) { ws.close(4403, 'Not allowed'); return }
      if (message.code !== room.code) {
        room.attempts++
        this.save(room)
        if (room.attempts >= 3) { await this.expire(); return }
        ws.send(JSON.stringify({ type: 'wrong-code', attemptsRemaining: 3 - room.attempts }))
        return
      }
      room.approved = true
      this.save(room)
      for (const socket of this.ctx.getWebSockets()) if (socket.readyState === WebSocket.OPEN && (socket.deserializeAttachment() as SocketState).role) socket.send(JSON.stringify({ type: 'approved' }))
      return
    }
    if ((message.type === 'offer' && state.role !== 'sender') || (message.type === 'answer' && state.role !== 'receiver') || (!room.approved && !['join', 'reject', 'close'].includes(message.type))) { ws.close(4403, 'Not allowed'); return }
    this.peer(ws, state.role === 'sender' ? 'receiver' : 'sender')?.send(JSON.stringify(message))
    if (message.type === 'reject' || message.type === 'close') await this.expire()
  }
  private peer(ws: WebSocket, role: Role) { return this.ctx.getWebSockets().find((other) => other !== ws && other.readyState === WebSocket.OPEN && (other.deserializeAttachment() as SocketState).role === role) }
  override webSocketClose(ws: WebSocket, code: number, reason: string) { ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason) }
  override async alarm() {
    const room = this.load()
    if (!room) return
    if (Date.now() >= room.expiresAt) { await this.expire(); return }
    for (const ws of this.ctx.getWebSockets()) { const state = ws.deserializeAttachment() as SocketState; if (!state.role && Date.now() >= state.deadline) ws.close(4401, 'Authentication timeout') }
    await this.schedule(room)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const allowed = origin !== null && env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin)
    if (url.pathname === '/health' && request.method === 'GET' && !origin) return Response.json({ ok: true })
    if (!allowed) return new Response('Forbidden', { status: 403 })
    const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({ ok: true }, { headers })
    if (url.pathname === '/rooms' && request.method === 'POST') {
      const roomId = crypto.randomUUID(), senderToken = token(), receiverToken = token()
      const expiresAt = await env.PAIR_ROOM.getByName(roomId).create(await hash(senderToken), await hash(receiverToken))
      return Response.json({ roomId, senderToken, receiverToken, expiresAt }, { status: 201, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }
    const match = /^\/rooms\/([0-9a-f-]{36})\/ws$/.exec(url.pathname)
    if (match && request.method === 'GET') return env.PAIR_ROOM.getByName(match[1]!).fetch(request)
    return new Response('Not found', { status: 404, headers })
  },
} satisfies ExportedHandler<Env>
