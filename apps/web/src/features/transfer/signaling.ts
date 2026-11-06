import { serverMessageSchema, type Role, type ServerMessage, type SignalingMessage } from '@loudbooks/contracts'

// Public endpoint (may be bundled). Tests point it at a local `wrangler dev`.
export const SIGNALING_URL = (import.meta.env.VITE_SIGNALING_URL || 'https://loudbooks-signaling.lijonas-it.workers.dev').replace(/\/+$/, '')
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]

export interface Room { roomId: string; senderToken: string; receiverToken: string; expiresAt: number }

export async function createRoom(): Promise<Room> {
  const res = await fetch(`${SIGNALING_URL}/rooms`, { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(`Pairing service: ${res.status}`)
  const room = await res.json() as Room
  if (!/^[0-9a-f-]{36}$/.test(room.roomId) || typeof room.senderToken !== 'string' || typeof room.receiverToken !== 'string' || !Number.isSafeInteger(room.expiresAt)) throw new Error('Pairing service: bad room')
  return room
}

/** True when the service answers: a failed room connection then means the room is gone (expired or used), not the network. */
export async function serviceReachable() {
  try { return (await fetch(`${SIGNALING_URL}/health`, { cache: 'no-store' })).ok } catch { return false }
}

export interface Signal { send(message: SignalingMessage): void; close(): void }

/**
 * Opens the room socket and authenticates with the first message. Resolves once the server confirms the role;
 * rejects if the socket closes first. Later closes reach `onClose` (closes caused by `close()` do not).
 */
export function openSignal(roomId: string, role: Role, token: string, onMessage: (m: ServerMessage) => void, onClose: (code: number) => void): Promise<Signal> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SIGNALING_URL.replace(/^http/, 'ws')}/rooms/${roomId}/ws`)
    let open = false
    let closed = false
    const signal: Signal = {
      send: (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)) },
      close: () => { closed = true; ws.close(1000) },
    }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', role, token } satisfies SignalingMessage))
    ws.onmessage = (e) => {
      let parsed
      try { parsed = serverMessageSchema.safeParse(JSON.parse(String(e.data))) } catch { return }
      if (!parsed.success) return
      if (parsed.data.type === 'authenticated') { open = true; resolve(signal); return }
      onMessage(parsed.data)
    }
    ws.onclose = (e) => {
      if (!open) reject(new Error(`Signaling closed: ${e.code}`))
      else if (!closed) onClose(e.code)
      closed = true
    }
  })
}
