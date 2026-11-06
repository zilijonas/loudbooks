import { SELF, env, evictDurableObject, runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

const origin = 'http://localhost:5173'
async function create() {
  const response = await SELF.fetch('https://example.com/rooms', { method: 'POST', headers: { Origin: origin } })
  expect(response.status).toBe(201)
  return await response.json() as { roomId: string; senderToken: string; receiverToken: string; expiresAt: number }
}
async function connect(id: string) {
  return SELF.fetch(`https://example.com/rooms/${id}/ws`, { headers: { Origin: origin, Upgrade: 'websocket' } })
}
function listen(socket: WebSocket) {
  type Message = { type: string; code: string; attemptsRemaining: number }
  const pending: ((value: Message) => void)[] = []
  const items: Message[] = []
  socket.addEventListener('message', (e) => { const value = JSON.parse(e.data as string); const next = pending.shift(); if (next) next(value); else items.push(value) })
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (e) => resolve(e.code), { once: true }))
  socket.accept()
  return { next: () => items.length ? Promise.resolve(items.shift()!) : new Promise<Message>((resolve) => pending.push(resolve)), closed }
}
async function authenticated(id: string, role: 'sender' | 'receiver', token: string) {
  const response = await connect(id)
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const events = listen(socket)
  socket.send(JSON.stringify({ type: 'auth', role, token }))
  expect(await events.next()).toEqual({ type: 'authenticated', role })
  return { socket, ...events }
}
const send = (ws: WebSocket, value: unknown) => ws.send(JSON.stringify(value))

describe('PairRoom', () => {
  it('rejects bad origins and limits room to two sockets', async () => {
    expect((await SELF.fetch('https://example.com/rooms', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    const room = await create(); const a = await authenticated(room.roomId, 'sender', room.senderToken); const b = await authenticated(room.roomId, 'receiver', room.receiverToken)
    expect((await connect(room.roomId)).status).toBe(409)
    a.socket.close(); b.socket.close()
  })
  it('rejects invalid tokens, oversized and malformed messages', async () => {
    for (const message of [{ type: 'auth', role: 'sender', token: 'x'.repeat(43) }, { type: 'auth', role: 'sender', token: 1 }, 'x'.repeat(16385)]) {
      const room = await create(); const response = await connect(room.roomId); const socket = response.webSocket!; const events = listen(socket)
      socket.send(typeof message === 'string' ? message : JSON.stringify(message))
      expect(await events.closed).toBe(typeof message === 'string' ? 4409 : typeof message.token === 'number' ? 4400 : 4401)
    }
  })
  it('authenticates once, confirms, and relays only after approval', async () => {
    const room = await create(); const a = await authenticated(room.roomId, 'sender', room.senderToken); const b = await authenticated(room.roomId, 'receiver', room.receiverToken)
    const { code } = await b.next(); expect(code).toMatch(/^\d{6}$/)
    await evictDurableObject(env.PAIR_ROOM.getByName(room.roomId))
    send(a.socket, { type: 'approve', code }); expect(await a.next()).toEqual({ type: 'approved' }); expect(await b.next()).toEqual({ type: 'approved' })
    send(a.socket, { type: 'offer', sdp: 'sdp' }); expect(await b.next()).toEqual({ type: 'offer', sdp: 'sdp' })
    send(b.socket, { type: 'answer', sdp: 'answer' }); expect(await a.next()).toEqual({ type: 'answer', sdp: 'answer' })
    send(a.socket, { type: 'close' }); expect(await b.next()).toEqual({ type: 'close' }); await a.closed; await b.closed
    expect((await connect(room.roomId)).status).toBe(410)
  })
  it('rejects signaling before confirmation and applies a socket rate limit', async () => {
    const room = await create(); const a = await authenticated(room.roomId, 'sender', room.senderToken)
    send(a.socket, { type: 'offer', sdp: 'early' }); expect(await a.closed).toBe(4403)
    const another = await create(); const b = await authenticated(another.roomId, 'sender', another.senderToken)
    for (let i = 0; i < 60; i++) send(b.socket, { type: 'join' })
    expect(await b.closed).toBe(4429)
  })
  it('closes room after three wrong codes', async () => {
    const room = await create(); const a = await authenticated(room.roomId, 'sender', room.senderToken); const b = await authenticated(room.roomId, 'receiver', room.receiverToken)
    const { code } = await b.next(); const wrong = code === '000000' ? '000001' : '000000'
    for (const attemptsRemaining of [2, 1]) { send(a.socket, { type: 'approve', code: wrong }); expect(await a.next()).toEqual({ type: 'wrong-code', attemptsRemaining }) }
    send(a.socket, { type: 'approve', code: wrong }); expect(await a.closed).toBe(4401); expect(await b.closed).toBe(4401)
  })
  it('rejects token reuse and times out unauthenticated sockets', async () => {
    const room = await create(); const a = await authenticated(room.roomId, 'sender', room.senderToken)
    a.socket.close(); await a.closed
    const response = await connect(room.roomId); const socket = response.webSocket!; const events = listen(socket)
    send(socket, { type: 'auth', role: 'sender', token: room.senderToken }); expect(await events.closed).toBe(4401)
    const waiting = await connect(room.roomId); const unauthed = waiting.webSocket!; const waitEvents = listen(unauthed)
    const stub = env.PAIR_ROOM.getByName(room.roomId)
    await runInDurableObject(stub, (_instance, state) => {
      for (const ws of state.getWebSockets()) { const attachment = ws.deserializeAttachment() as { deadline: number }; attachment.deadline = Date.now() - 1; ws.serializeAttachment(attachment) }
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await waitEvents.closed).toBe(4401)
  })
  it('enforces expiry and alarm removes room data', async () => {
    const room = await create(); const stub = env.PAIR_ROOM.getByName(room.roomId)
    await runInDurableObject(stub, (_instance, state) => { const row = state.storage.sql.exec('SELECT state FROM room').one(); const data = JSON.parse(row.state as string); data.expiresAt = Date.now() - 1; state.storage.sql.exec('UPDATE room SET state = ?', JSON.stringify(data)) })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec('SELECT * FROM room').toArray().length)).toBe(0)
    expect((await connect(room.roomId)).status).toBe(410)
  })
})
