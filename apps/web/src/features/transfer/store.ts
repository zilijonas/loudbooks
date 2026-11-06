import { create } from 'zustand'

export type SendStep = 'qr' | 'code' | 'connecting' | 'sending' | 'verifying' | 'done' | 'failed' | 'signaling'
export type ReceiveStep =
  | 'intro' | 'permission' | 'denied' | 'scanning' | 'paste' | 'expired' | 'code' | 'connecting'
  | 'receiving' | 'verifying' | 'success' | 'disconnected' | 'storage' | 'duplicate' | 'signaling'

export interface Progress { bytesDone: number; bytesTotal: number; fileIndex: number; fileCount: number }
const none: Progress = { bytesDone: 0, bytesTotal: 0, fileIndex: 1, fileCount: 1 }

export interface SendState extends Progress {
  /** null: dialog closed. */
  bookId: string | null
  step: SendStep
  link: string | null
  expiresAt: number
  includePosition: boolean
  triesLeft: number
  codeError: 'wrong' | 'locked' | null
  /** An approve is waiting for the server's answer. */
  checking: boolean
}

export interface ReceiveState extends Progress {
  step: ReceiveStep
  code: string | null
  title: string
  /** Committed book, for "Open book". */
  bookId: string | null
  need: number
  free: number
}

export const initialSend: Omit<SendState, 'bookId'> = { ...none, step: 'qr', link: null, expiresAt: 0, includePosition: false, triesLeft: 3, codeError: null, checking: false }
export const initialReceive: ReceiveState = { ...none, step: 'intro', code: null, title: '', bookId: null, need: 0, free: 0 }

/** UI state of the one send and one receive flow. TransferCoordinator writes it; screens render it. */
export const useTransfer = create<{ send: SendState; receive: ReceiveState }>(() => ({
  send: { ...initialSend, bookId: null },
  receive: initialReceive,
}))

export const setSend = (patch: Partial<SendState>) => useTransfer.setState((s) => ({ send: { ...s.send, ...patch } }))
export const setReceive = (patch: Partial<ReceiveState>) => useTransfer.setState((s) => ({ receive: { ...s.receive, ...patch } }))
